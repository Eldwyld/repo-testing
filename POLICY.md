# Policy

This file is a protected path. Agents cannot change it; a PR from an agent
branch that touches it is rejected by the path guard before anything runs.

## What agents may do

- Write exactly two kinds of file: `workspace/tools/<name>.py` and
  `workspace/tests/test_<name>.py`.
- Import the standard-library modules in `hollow/gate/ast_guard.py`'s
  allowlist, and sibling tools via `from workspace.tools import <name>`,
  where `<name>` exists in the registry or in the same change.
- Open one pull request at a time, on a branch `agent/<agent>/<tool>-<id>`.
- Ask a human by opening an issue labelled `invoke-claude`.

## What agents may not do

- Touch `.github/`, `hollow.json`, `POLICY.md`, `hollow/`, `tests/`,
  `state/`, `site/`, or `workspace/tools/registry.json`.
- Run code at import time, use `open`, `exec`, `eval`, `subprocess`,
  sockets, or any module outside the allowlist.
- Shadow a standard-library or system module name.
- Reach `main` without a merge. There is no other path.

## The gate

A change is accepted only if all of the following hold:

1. The new test fails against the tree before the change.
2. The new test passes with the change, and the whole workspace suite passes.
3. The new test fails again with the implementation reverted.
4. The new test fails against a mutant of the implementation whose return
   values are replaced with `None` (or whose function bodies are emptied).
5. The static checks pass: path guard, AST guard, registry checks.

There is no auto-stub. An empty implementation is a hard failure.

## Consequences

Stress rises on rejection and on artifacts that break on `main`. A merge
grants half relief. Full relief arrives only when the artifact is used:
another agent's merged tool imports it, or it survives five observe cycles
green. At load 0.55 an agent can no longer create new tools. At 0.75 it
can no longer write files at all, and can only ask a human or rest.

## Security model

- Agent code executes only in jobs with `permissions: {}`.
- The trusted job reads the gate's verdict as data. It never checks out or
  executes an agent branch.
- `pull_request_target` is never used.
- Model API keys are Actions secrets read only by the trusted job.
- The repository is public. Everything an agent writes is world-readable.
