"""Red-green-red: the gate that hollow code cannot pass.

Given a base revision and a head revision:

1. **red**   — the head's tests against the base's implementation must fail
2. **green** — the head's tests against the head's implementation must pass,
               and the whole workspace suite must still pass
3. **red**   — the head's tests with the implementation reverted must fail
4. **mutant** — the head's tests against a hollowed implementation must fail

Plus the static checks (paths, AST guard, registry) so a rejection reason is
always specific. Nothing here needs network or credentials; everything here
executes agent code, so run it only under ``permissions: {}``.
"""

from __future__ import annotations

import ast
import json
import shutil
from pathlib import Path

from hollow import config, gitutil
from hollow.gate import ast_guard, mutation, paths, registry_check
from hollow.gate.result import GateResult
from hollow.gate.testrun import run_pytest
from hollow.state import load_json


def _write(root: Path, rel: str, content: str) -> None:
    dest = root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content)


def _remove(root: Path, rel: str) -> None:
    p = root / rel
    if p.is_file():
        p.unlink()


def _restore_from(repo: Path, wt: Path, rev: str, rels: list[str]) -> None:
    """Make ``rels`` in ``wt`` match ``rev`` (delete files absent at rev)."""
    for rel in rels:
        if gitutil.file_exists_at(repo, rev, rel):
            _write(wt, rel, gitutil.show(repo, rev, rel))
        else:
            _remove(wt, rel)


def _clear_pycache(root: Path) -> None:
    for d in root.rglob("__pycache__"):
        shutil.rmtree(d, ignore_errors=True)


def static_checks(files: dict[str, str], changed: list[str], cfg: dict, registry: dict,
                  result: GateResult) -> None:
    """Checks that never execute agent code. Also used before push."""
    bad = paths.violations(changed, cfg["protected_paths"])
    result.add("paths", not bad, "\n".join(bad))

    problems = []
    for rel, src in files.items():
        if config.is_impl_path(rel):
            ok, reason = ast_guard.check_source(src)
            if not ok:
                problems.append(f"{rel}: {reason}")
        elif config.is_test_path(rel):
            try:
                tree = ast.parse(src)
            except SyntaxError as exc:
                problems.append(f"{rel}: syntax error line {exc.lineno}")
                continue
            ok, reason = ast_guard.check_imports(tree, ast_guard.ALLOWED_IMPORTS | {"pytest", "unittest"})
            if not ok:
                problems.append(f"{rel}: {reason}")
            ok, reason = ast_guard.check_calls(tree)
            if not ok:
                problems.append(f"{rel}: {reason}")
    result.add("ast-guard", not problems, "\n".join(problems))

    reg = registry_check.check_change_set(files, registry)
    result.add("registry", not reg, "\n".join(reg))

    advisory = []
    for rel, src in files.items():
        if config.is_impl_path(rel):
            try:
                advisory += [f"{rel}: {f}" for f in ast_guard.nested_never_called(ast.parse(src))]
            except SyntaxError:
                pass
    # Advisory only: red-green is what rejects this shape (BUG-002). Naming it
    # just makes the feedback to the agent specific. Detection can't win.
    if advisory:
        result.add("nested-never-called", True, "advisory: " + "; ".join(advisory))


def evaluate(repo: Path, base: str, head: str, cfg: dict | None = None) -> GateResult:
    cfg = cfg or config.load()
    timeout = int(cfg["gate"]["test_timeout_seconds"])
    base_sha = gitutil.rev_parse(repo, base)
    head_sha = gitutil.rev_parse(repo, head)
    changed = gitutil.changed_files(repo, base_sha, head_sha)
    result = GateResult(head=head_sha, base=base_sha, changed=changed)

    tests = [p for p in changed if config.is_test_path(p)]
    impls = [p for p in changed if config.is_impl_path(p)]
    if not result.add("shape", bool(tests) and bool(impls),
                      f"{len(tests)} test file(s), {len(impls)} implementation file(s); "
                      "a change needs at least one of each"):
        return result

    files = {p: gitutil.show(repo, head_sha, p) for p in changed
             if gitutil.file_exists_at(repo, head_sha, p)}
    registry_src = (gitutil.show(repo, base_sha, config.REGISTRY_FILE)
                    if gitutil.file_exists_at(repo, base_sha, config.REGISTRY_FILE) else "{}")
    registry = json.loads(registry_src or "{}")
    static_checks(files, changed, cfg, registry, result)
    if not result.ok:
        return result

    present_tests = [t for t in tests if t in files]
    if not result.add("tests-present", bool(present_tests), "all changed test files were deleted"):
        return result

    # 1. red: head tests on base tree
    with gitutil.worktree(repo, base_sha) as wt:
        _restore_from(repo, wt, head_sha, tests)
        out = run_pytest(wt, present_tests, timeout)
        result.add("red-before", out.red,
                   f"tests must fail before the change: {out.describe()}\n{out.output[-1500:]}")
    if not result.ok:
        return result

    # 2. green: head tests + full suite on head tree
    with gitutil.worktree(repo, head_sha) as wt:
        out = run_pytest(wt, present_tests, timeout)
        result.add("green-after", out.green,
                   f"tests must pass after the change: {out.describe()}\n{out.output[-1500:]}")
        if result.ok:
            full = run_pytest(wt, [config.TESTS_DIR], timeout * 2)
            result.add("suite-green", full.green,
                       f"whole workspace suite must pass: {full.describe()}")
    if not result.ok:
        return result

    # 3. red again: head tests, implementation reverted to base
    with gitutil.worktree(repo, head_sha) as wt:
        _restore_from(repo, wt, base_sha, impls)
        _clear_pycache(wt)
        out = run_pytest(wt, present_tests, timeout)
        result.add("red-reverted", out.red,
                   f"tests must fail with the implementation reverted: {out.describe()}")
    if not result.ok:
        return result

    # 4. mutant: head tests, implementation hollowed out
    with gitutil.worktree(repo, head_sha) as wt:
        strategies = []
        for rel in impls:
            if rel in files:
                mutated, n, strategy = mutation.mutate(files[rel])
                strategies.append(f"{rel}: {n} {strategy}")
                _write(wt, rel, mutated)
        _clear_pycache(wt)
        out = run_pytest(wt, present_tests, timeout)
        result.add("mutation", out.red,
                   "tests must fail against a hollowed implementation "
                   f"({'; '.join(strategies)}): {out.describe()}")
    return result


def load_registry(root: Path) -> dict:
    return load_json(root / config.REGISTRY_FILE, {"tools": {}})
