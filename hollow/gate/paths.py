"""Path guard: what an agent PR is allowed to touch.

Allowlist first: only ``workspace/tools/*.py`` and ``workspace/tests/test_*.py``.
Then the explicit denylist from ``hollow.json`` for defence in depth — the
workflow directory, the config, the policy, the system code and the state.
"""

from __future__ import annotations

from hollow.config import REGISTRY_FILE, is_impl_path, is_test_path


def violations(changed: list[str], protected: list[str]) -> list[str]:
    bad = []
    for path in changed:
        norm = path.replace("\\", "/").lstrip("./")
        if ".." in norm.split("/"):
            bad.append(f"{path}: path traversal")
            continue
        if any(norm == p or (p.endswith("/") and norm.startswith(p)) for p in protected):
            bad.append(f"{path}: protected path")
            continue
        if norm == REGISTRY_FILE:
            bad.append(f"{path}: registry is written by the trusted job only")
            continue
        if not (is_impl_path(norm) or is_test_path(norm)):
            bad.append(f"{path}: outside workspace/tools or workspace/tests")
    return bad
