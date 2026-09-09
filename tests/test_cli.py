"""The four entry points the workflows call."""

from __future__ import annotations

import json
import subprocess
import sys

from tests.conftest import GOOD, ROOT


def cli(repo, *args):
    return subprocess.run([sys.executable, "-m", "hollow", "--root", str(repo.path), *args],
                          cwd=str(ROOT), capture_output=True, text=True)


def test_observe_writes_truth(repo, tmp_path):
    repo.write(GOOD)
    repo.commit("tool")
    out = tmp_path / "truth.json"
    proc = cli(repo, "observe", "--out", str(out))
    assert proc.returncode == 0, proc.stderr
    data = json.loads(out.read_text())
    assert data["tools"] == {"slugify": True} and data["totals"]["passed"] == 2


def test_gate_exit_codes_and_artifact(repo, tmp_path):
    sha = repo.branch("agent/scout/slugify-1", GOOD)
    out = tmp_path / "gate-result.json"
    proc = cli(repo, "gate", "--base", "main", "--head", sha, "--out", str(out))
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert json.loads(out.read_text())["ok"] is True
    bad = repo.branch("agent/scout/slugify-2", {"workspace/tools/slugify.py": "def slugify(t):\n    return t\n"})
    proc = cli(repo, "gate", "--base", "main", "--head", bad, "--out", str(out))
    assert proc.returncode == 1 and "REJECT" in proc.stdout
    assert json.loads(out.read_text())["ok"] is False


def test_guard_blocks_protected_paths(repo):
    good = repo.branch("agent/scout/slugify-1", GOOD)
    assert cli(repo, "guard", "--base", "main", "--head", good).returncode == 0
    evil = repo.branch("agent/scout/evil-1", {".github/workflows/cycle.yml": "name: x\n", **GOOD})
    proc = cli(repo, "guard", "--base", "main", "--head", evil)
    assert proc.returncode == 1 and "::error::" in proc.stdout


def test_dry_run_cycle_and_dashboard_without_keys(repo):
    proc = cli(repo, "cycle", "--dry-run", "--truth", "/nonexistent.json")
    assert proc.returncode == 0, proc.stderr
    assert "cycle 1 done" in proc.stdout
    assert (repo.path / "site" / "index.html").exists()
    assert (repo.path / "state" / "meta.json").exists()
    assert cli(repo, "dashboard").returncode == 0
