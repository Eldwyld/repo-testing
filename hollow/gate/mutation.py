"""Mutation screen: a test that still passes against a hollowed-out
implementation proves nothing.

Mutant one replaces every ``return <expr>`` with ``return None``. If the
implementation has no return values at all, mutant two replaces every
function body with ``pass``. The PR is rejected if the agent's tests pass
against the mutant.
"""

from __future__ import annotations

import ast


class _ReturnNone(ast.NodeTransformer):
    def __init__(self) -> None:
        self.count = 0

    def visit_Return(self, node: ast.Return) -> ast.AST:
        if node.value is not None and not (
            isinstance(node.value, ast.Constant) and node.value.value is None
        ):
            self.count += 1
            return ast.copy_location(ast.Return(value=ast.Constant(value=None)), node)
        return node


class _EmptyBodies(ast.NodeTransformer):
    def __init__(self) -> None:
        self.count = 0

    def _empty(self, node):
        self.generic_visit(node)
        self.count += 1
        node.body = [ast.Pass()]
        return node

    visit_FunctionDef = _empty
    visit_AsyncFunctionDef = _empty


def mutate(source: str) -> tuple[str, int, str]:
    """Return (mutated_source, mutation_count, strategy)."""
    tree = ast.parse(source)
    t = _ReturnNone()
    tree = t.visit(tree)
    if t.count:
        ast.fix_missing_locations(tree)
        return ast.unparse(tree), t.count, "return-none"
    tree = ast.parse(source)
    e = _EmptyBodies()
    tree = e.visit(tree)
    ast.fix_missing_locations(tree)
    return ast.unparse(tree), e.count, "empty-bodies"
