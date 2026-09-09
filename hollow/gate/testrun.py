"""Run pytest in a subprocess against a checkout and parse the outcome.

This is the only place agent code is executed. It must only ever be
called from a job holding no credentials (see .github/workflows/gate.yml).
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class TestOutcome:
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    failing: list[str] = field(default_factory=list)
    timed_out: bool = False
    output: str = ""

    @property
    def collected(self) -> int:
        return self.passed + self.failed + self.errors + self.skipped

    @property
    def green(self) -> bool:
        return not self.timed_out and self.collected > 0 and self.failed == 0 and self.errors == 0

    @property
    def red(self) -> bool:
        """Some test genuinely failed or errored (a timeout counts as red)."""
        return self.timed_out or self.failed > 0 or self.errors > 0

    def describe(self) -> str:
        if self.timed_out:
            return "timed out"
        s = f"{self.passed} passed, {self.failed} failed, {self.errors} errors, {self.skipped} skipped"
        if self.failing:
            s += " — failing: " + ", ".join(self.failing[:8])
        return s


def run_pytest(root: Path, targets: list[str], timeout: int = 120) -> TestOutcome:
    """Run ``targets`` (paths relative to ``root``) with pytest and parse JUnit XML."""
    outcome = TestOutcome()
    existing = [t for t in targets if (root / t).exists()]
    if not existing:
        outcome.output = "no test files present"
        return outcome
    with tempfile.TemporaryDirectory(prefix="hollow-junit-") as tmp:
        junit = Path(tmp) / "junit.xml"
        env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": tmp,
            "PYTHONPATH": str(root),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONHASHSEED": "0",
            "HOLLOW_SANDBOX": "1",
        }
        cmd = [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider",
               "--junitxml", str(junit), "-o", "junit_family=xunit2", *existing]
        try:
            proc = subprocess.run(cmd, cwd=str(root), env=env, capture_output=True,
                                  text=True, timeout=timeout)
            outcome.output = (proc.stdout + proc.stderr)[-6000:]
        except subprocess.TimeoutExpired as exc:
            outcome.timed_out = True
            outcome.output = ((exc.stdout or b"").decode(errors="replace")
                              if isinstance(exc.stdout, bytes) else (exc.stdout or ""))[-6000:]
            return outcome
        if junit.exists():
            _parse_junit(junit, outcome)
        elif proc.returncode != 0:
            outcome.errors = 1
            outcome.failing = ["<collection>"]
    return outcome


def _parse_junit(path: Path, outcome: TestOutcome) -> None:
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        outcome.errors = 1
        return
    for case in root.iter("testcase"):
        name = f"{case.get('classname', '')}::{case.get('name', '')}".strip(":")
        if case.find("failure") is not None:
            outcome.failed += 1
            outcome.failing.append(name)
        elif case.find("error") is not None:
            outcome.errors += 1
            outcome.failing.append(name)
        elif case.find("skipped") is not None:
            outcome.skipped += 1
        else:
            outcome.passed += 1
    # collection errors appear as <testsuite errors="n"> without testcases
    for suite in root.iter("testsuite"):
        declared = int(suite.get("errors", "0") or 0)
        if declared and outcome.collected == 0:
            outcome.errors = declared
            outcome.failing.append("<collection>")
