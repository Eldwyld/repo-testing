"""The gate: the only way agent output reaches ``main``.

Static checks (:mod:`hollow.gate.paths`, :mod:`hollow.gate.ast_guard`,
:mod:`hollow.gate.registry`) run anywhere because they never execute the
agent's code. Dynamic checks (:mod:`hollow.gate.redgreen`,
:mod:`hollow.gate.mutation`) execute it and therefore run only in a CI job
with ``permissions: {}``.
"""

from hollow.gate.result import GateResult, Check  # noqa: F401
