"""Ground truth: facts the system can verify, gathered every cycle.

Two halves. :func:`observe` runs the workspace suite and is the only part
that executes agent code — it runs in the credential-less job and writes
``truth.json``. :func:`gather` runs in the trusted job, reads that file as
data and adds git facts. Neither contains a word a model wrote.
"""

from __future__ import annotations

import json
from pathlib import Path

from hollow import config, gitutil
from hollow.gate.testrun import run_pytest


def observe(root: Path, timeout: int = 240) -> dict:
    """Run every workspace test; report per-tool pass/fail."""
    tests_dir = root / config.TESTS_DIR
    per_tool: dict[str, bool] = {}
    failing: list[str] = []
    total = {"passed": 0, "failed": 0, "errors": 0}
    if tests_dir.exists():
        for test_file in sorted(tests_dir.glob("test_*.py")):
            out = run_pytest(root, [str(test_file.relative_to(root))], timeout)
            tool = test_file.stem[len("test_"):]
            per_tool[tool] = out.green
            total["passed"] += out.passed
            total["failed"] += out.failed
            total["errors"] += out.errors
            failing += out.failing
    return {"tools": per_tool, "failing": failing[:40], "totals": total}


def gather(root: Path, truth: dict | None, registry: dict, open_prs: list[dict],
           n_commits: int = 8) -> dict:
    truth = truth or {"tools": {}, "failing": [], "totals": {}}
    tools_dir = root / config.TOOLS_DIR
    files = sorted(p.name for p in tools_dir.glob("*.py") if p.name != "__init__.py") \
        if tools_dir.exists() else []
    return {
        "tests": truth,
        "files": files,
        "registry": registry.get("tools", {}),
        "open_prs": [{"number": p["number"], "branch": p["head"]["ref"], "title": p["title"]}
                     for p in open_prs],
        "commits": gitutil.recent_subjects(root, "HEAD", n_commits),
        "status": gitutil.status_short(root).strip(),
    }


def load_truth(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None
