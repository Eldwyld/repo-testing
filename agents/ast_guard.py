"""
AST guard for dynamically-loaded / synthesized tool files (BUG-015).

The original guard (an allowlist of AST node *types* permitted at module
level) does not express "no side effects at import" — Assign evaluates its
RHS, ClassDef executes its whole body, and a decorator on an allowed
FunctionDef runs at def time. All three are used below to bypass it:

    _ = open('/agentOS/agents/registry.py', 'w').write('')     # Assign, Call RHS
    class _C: _y = __import__('subprocess').run(['id'])        # ClassDef
    @functools.lru_cache
    def tool(**kw): ...                                        # decorator

This module is the single place both loaders (agents/daemon.py's
_hotload_dynamic_tools, agents/live_capabilities.py's synthesize_capability)
call, so the check can't drift out of sync between them again.

This is a stopgap, not a sandbox: importing a module can still run arbitrary
code inside *that* module (an `import` of a malicious package is not something
an AST allowlist can catch). The real fix is to stop executing tool modules
in the daemon process at all — run them in a subprocess with a restricted
environment, a non-root uid, and a filesystem view limited to the workspace.
"""

import ast

_ALLOWED_LITERAL_NODES = (ast.Constant, ast.List, ast.Tuple, ast.Dict, ast.Set)


def _is_literal(node: ast.AST) -> bool:
    """True if `node` is built only from literal constants/containers — no
    Call, Attribute, Name, BinOp, comprehension, etc. can appear anywhere
    inside it, so evaluating it has no side effects."""
    if isinstance(node, ast.Constant):
        return True
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return all(_is_literal(el) for el in node.elts)
    if isinstance(node, ast.Dict):
        return all(
            (k is None or _is_literal(k)) and _is_literal(v)
            for k, v in zip(node.keys, node.values)
        )
    return False


def check_module_body(tree: ast.Module) -> tuple[bool, str]:
    """
    Validate that a module's top-level body cannot execute anything beyond
    imports, function/class-free literal assignment, and def statements with
    no decorators. Returns (ok, reason) — reason is empty when ok is True.
    """
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            continue

        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.decorator_list:
                return False, (
                    f"decorator on '{node.name}' at line {node.lineno} — "
                    "decorators run at import time and are not permitted"
                )
            continue

        if isinstance(node, ast.ClassDef):
            return False, (
                f"class '{node.name}' at line {node.lineno} — class bodies execute "
                "at import time and are not permitted at module level"
            )

        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            value = node.value
            if value is not None and not _is_literal(value):
                return False, (
                    f"non-literal assignment at line {node.lineno} — the right-hand "
                    "side must be a literal constant, not a call or expression"
                )
            continue

        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
            continue  # docstring / bare string literal

        return False, (
            f"module-level {type(node).__name__} at line {getattr(node, 'lineno', 0)} — "
            "only imports, literal assignments, and function/class-free def statements "
            "are permitted; all logic must be inside a function body"
        )

    return True, ""
