"""Registry-side static checks for a change set (no execution).

* a new tool may not shadow a built-in name (v1 BUG-008)
* a tool may only depend on tools that exist in the registry or in the
  same change set (v1 BUG-014 — hallucinated names get "no such tool")
* every implementation file needs a test file and vice versa
"""

from __future__ import annotations

import ast

from hollow.config import is_impl_path, is_test_path, tool_name_from_path
from hollow.gate.ast_guard import stdlib_names

# Names the system itself owns. Agents synthesizing a tool with one of
# these names was the mechanism behind BUG-008/010/011.
BUILTIN_NAMES = frozenset({
    "hollow", "registry", "gate", "cycle", "agent", "budget", "stress",
    "identity", "providers", "github", "truth", "prompt", "dashboard",
    "tools", "tests", "workspace", "state", "conftest", "setup", "test",
})


def reserved_names() -> frozenset[str]:
    return BUILTIN_NAMES | stdlib_names()


def tool_dependencies(source: str) -> set[str]:
    """Sibling tools this module imports (``from workspace.tools import x``,
    ``from workspace.tools.x import f``, ``import workspace.tools.x``)."""
    deps: set[str] = set()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return deps
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            if node.module == "workspace.tools":
                deps.update(a.name for a in node.names)
            elif node.module.startswith("workspace.tools."):
                deps.add(node.module.split(".")[2])
        elif isinstance(node, ast.Import):
            for a in node.names:
                if a.name.startswith("workspace.tools."):
                    deps.add(a.name.split(".")[2])
    return deps


def check_change_set(files: dict[str, str], registry: dict) -> list[str]:
    """``files`` maps path → source for every file in the change set.
    Returns a list of problems (empty means fine)."""
    problems: list[str] = []
    impls = {tool_name_from_path(p): s for p, s in files.items() if is_impl_path(p)}
    tests = {tool_name_from_path(p)[len("test_"):] for p in files if is_test_path(p)}
    known = set(registry.get("tools", {})) | set(impls)
    reserved = reserved_names()

    for name, src in impls.items():
        if name in reserved and name not in registry.get("tools", {}):
            problems.append(f"tool '{name}' shadows a built-in or standard-library name")
        if not name.isidentifier() or name.startswith("_"):
            problems.append(f"tool '{name}' is not a valid public module name")
        for dep in sorted(tool_dependencies(src)):
            if dep not in known:
                problems.append(f"no such tool: '{dep}' (imported by '{name}')")
        if name not in tests:
            problems.append(f"tool '{name}' has no test file workspace/tests/test_{name}.py")
    for name in sorted(tests):
        if name not in impls and name not in registry.get("tools", {}):
            problems.append(f"test_{name}.py tests a tool that does not exist")
    return problems
