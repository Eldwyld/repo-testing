"""Fixtures: a throwaway git repo shaped like this one, with a bare origin."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from hollow import config  # noqa: E402


def git(*args: str, cwd: Path) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["git", *args], cwd=str(cwd), check=True, capture_output=True,
                          text=True, env=env).stdout


class Repo:
    def __init__(self, path: Path, origin: Path):
        self.path = path
        self.origin = origin
        self.cfg = config.load(path / "hollow.json")

    def write(self, files: dict[str, str]) -> None:
        for rel, src in files.items():
            dest = self.path / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(src)

    def commit(self, message: str = "change") -> str:
        git("add", "-A", cwd=self.path)
        git("commit", "-q", "--allow-empty", "-m", message, cwd=self.path)
        return git("rev-parse", "HEAD", cwd=self.path).strip()

    def branch(self, name: str, files: dict[str, str], message: str = "agent change") -> str:
        """Create ``name`` from main with ``files``, return its sha, go back to main."""
        git("checkout", "-q", "-b", name, "main", cwd=self.path)
        self.write(files)
        sha = self.commit(message)
        git("checkout", "-q", "main", cwd=self.path)
        return sha


@pytest.fixture
def repo(tmp_path: Path) -> Repo:
    origin = tmp_path / "origin.git"
    git("init", "-q", "--bare", str(origin), cwd=tmp_path)
    path = tmp_path / "repo"
    path.mkdir()
    git("init", "-q", "-b", "main", cwd=path)
    git("remote", "add", "origin", str(origin), cwd=path)
    cfg = dict(config.DEFAULTS)
    cfg["providers"] = [{"name": "fake", "base_url": "http://fake", "key_env": "FAKE_KEY",
                         "model": "fake-1", "daily_tokens": 1_000_000}]
    cfg["gate"] = {"test_timeout_seconds": 60}
    (path / "hollow.json").write_text(json.dumps(cfg))
    shutil.copytree(ROOT / "hollow", path / "hollow", ignore=shutil.ignore_patterns("__pycache__"))
    (path / "workspace").mkdir()
    (path / "workspace" / "__init__.py").write_text("")
    (path / "workspace" / "tools").mkdir()
    (path / "workspace" / "tools" / "__init__.py").write_text("")
    (path / "workspace" / "tools" / "registry.json").write_text('{"tools": {}}\n')
    (path / "workspace" / "tests").mkdir()
    (path / "workspace" / "tests" / ".gitkeep").write_text("")
    (path / "state").mkdir()
    (path / "POLICY.md").write_text("policy\n")
    r = Repo(path, origin)
    r.commit("init")
    git("push", "-q", "-u", "origin", "main", cwd=path)
    return r


# ---------------------------------------------------------------------------
# Canonical change sets used across tests
# ---------------------------------------------------------------------------

GOOD_TOOL = '''"""Slugify strings."""
import re


def slugify(text: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text or "n-a"
'''

GOOD_TEST = '''from workspace.tools.slugify import slugify


def test_basic():
    assert slugify("Hello, World!") == "hello-world"


def test_empty():
    assert slugify("!!!") == "n-a"
'''

GOOD = {"workspace/tools/slugify.py": GOOD_TOOL, "workspace/tests/test_slugify.py": GOOD_TEST}
