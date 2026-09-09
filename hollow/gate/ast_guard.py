"""Import-time side-effect guard for agent-written modules (v1 BUG-015).

A module body may contain only imports, def statements without decorators,
literal assignments and docstrings. Anything else runs at import, and v1
learned the hard way that "import" and "execute" are the same thing.

Carried over from v1's ``agents/ast_guard.py`` with two additions: the
nested-never-called shape from BUG-002 is reported as a warning-grade
finding (red-green rejects it anyway, but naming it makes the feedback to
the agent specific), and imports are restricted to an allowlist so a
plain ``import`` of something dangerous is not a bypass.
"""

from __future__ import annotations

import ast
import sys

_LITERAL_NODES = (ast.Constant, ast.List, ast.Tuple, ast.Dict, ast.Set)

# Modules agent tools may import. Sibling tools are allowed via
# ``workspace.tools``; the trusted side checks the sibling really exists.
ALLOWED_IMPORTS = frozenset({
    "workspace", "workspace.tools",
    "math", "statistics", "itertools", "functools", "collections", "dataclasses",
    "typing", "re", "json", "string", "textwrap", "datetime", "decimal",
    "fractions", "heapq", "bisect", "enum", "operator", "random", "hashlib",
    "base64", "csv", "difflib", "uuid", "pathlib", "html", "unicodedata",
    "abc", "copy", "numbers", "time", "calendar", "zoneinfo", "pprint",
})

FORBIDDEN_CALLS = frozenset({"exec", "eval", "compile", "__import__", "open", "input"})


def _is_literal(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant):
        return True
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return all(_is_literal(el) for el in node.elts)
    if isinstance(node, ast.Dict):
        return all((k is None or _is_literal(k)) and _is_literal(v)
                   for k, v in zip(node.keys, node.values))
    return False


def _import_root(name: str) -> str:
    return name.split(".")[0]


def check_module_body(tree: ast.Module) -> tuple[bool, str]:
    """(ok, reason) for the module's top level only."""
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            continue
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.decorator_list:
                return False, (f"decorator on '{node.name}' at line {node.lineno} — "
                               "decorators run at import time and are not permitted")
            continue
        if isinstance(node, ast.ClassDef):
            return False, (f"class '{node.name}' at line {node.lineno} — class bodies "
                           "execute at import time and are not permitted at module level")
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            if node.value is not None and not _is_literal(node.value):
                return False, (f"non-literal assignment at line {node.lineno} — the "
                               "right-hand side must be a literal, not a call or expression")
            continue
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
            continue
        return False, (f"module-level {type(node).__name__} at line "
                       f"{getattr(node, 'lineno', 0)} — only imports, literal assignments "
                       "and undecorated def statements are permitted at module level")
    return True, ""


def check_imports(tree: ast.Module, allowed: frozenset[str] = ALLOWED_IMPORTS) -> tuple[bool, str]:
    for node in ast.walk(tree):
        names: list[str] = []
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                return False, f"relative import at line {node.lineno} is not permitted"
            names = [node.module or ""]
        for name in names:
            root = _import_root(name)
            if root == "workspace":
                # only the tools package, never workspace internals
                if name in ("workspace.tools",) or name.startswith("workspace.tools."):
                    continue
            elif name in allowed or root in allowed:
                continue
            return False, f"import of '{name}' at line {node.lineno} is not permitted"
    return True, ""


def check_calls(tree: ast.Module) -> tuple[bool, str]:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in FORBIDDEN_CALLS:
                return False, f"call to '{node.func.id}' at line {node.lineno} is not permitted"
        if isinstance(node, ast.Attribute) and node.attr in ("__subclasses__", "__globals__", "__builtins__"):
            return False, f"access to '{node.attr}' at line {node.lineno} is not permitted"
    return True, ""


def nested_never_called(tree: ast.Module) -> list[str]:
    """Names of functions defined inside another function and never
    referenced there — the BUG-002 shape. Advisory: red-green is the
    mechanism that rejects it, this only makes the feedback precise."""
    findings = []
    for outer in ast.walk(tree):
        if not isinstance(outer, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        inner_defs = [n for n in outer.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        for inner in inner_defs:
            referenced = any(
                isinstance(n, ast.Name) and n.id == inner.name
                for stmt in outer.body if stmt is not inner
                for n in ast.walk(stmt)
            )
            if not referenced:
                findings.append(f"{outer.name}.{inner.name} (line {inner.lineno})")
    return findings


def check_source(source: str) -> tuple[bool, str]:
    """All static checks on one module source. Never executes it."""
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return False, f"syntax error: {exc.msg} (line {exc.lineno})"
    for check in (check_module_body, check_imports, check_calls):
        ok, reason = check(tree)
        if not ok:
            return False, reason
    if not any(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) for n in tree.body):
        return False, "module defines no functions"
    return True, ""


def stdlib_names() -> frozenset[str]:
    names = getattr(sys, "stdlib_module_names", None)
    return frozenset(names) if names else frozenset()
