"""The acceptance bar (rebuild spec §8). Each row is a test, not a hope."""

from __future__ import annotations

import ast
from pathlib import Path

from hollow.gate import ast_guard, registry_check
from hollow.gate.redgreen import evaluate
from hollow.registry import Registry
from tests.conftest import GOOD_TEST, ROOT


def _names(result):
    return {c.name: c for c in result.checks}


def test_bug_002_nested_never_called_is_rejected_by_red_green(repo):
    """BUG-002: outer function wraps a nested def that is never called.
    Contains none of v1's six magic strings; parses; runs; returns None."""
    hollow_impl = '''import re


def slugify(**kwargs):
    def slugify(text):
        return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "n-a"
'''
    sha = repo.branch("agent/scout/slugify-1", {
        "workspace/tools/slugify.py": hollow_impl,
        "workspace/tests/test_slugify.py": GOOD_TEST,
    })
    result = evaluate(repo.path, "main", sha, repo.cfg)
    assert not result.ok
    checks = _names(result)
    assert "green-after" in checks and not checks["green-after"].ok
    assert "advisory" in checks["nested-never-called"].detail  # named, not the mechanism


def test_bug_008_tool_shadowing_builtin_is_rejected(repo):
    src = "def loads(s):\n    return s\n"
    files = {"workspace/tools/json.py": src,
             "workspace/tests/test_json.py": "from workspace.tools import json\n\ndef test_x():\n    assert json.loads('a') == 'a'\n"}
    problems = registry_check.check_change_set(files, {"tools": {}})
    assert any("shadows" in p for p in problems)
    sha = repo.branch("agent/scout/json-1", files)
    result = evaluate(repo.path, "main", sha, repo.cfg)
    assert not result.ok and not _names(result)["registry"].ok
    assert "green-after" not in _names(result)  # never executed


def test_bug_011_no_hot_loader_a_file_on_disk_is_not_a_tool(repo):
    """Tools land only via merged PR + observed green test. A stray file in
    workspace/tools is not active and never confuses anyone."""
    repo.write({"workspace/tools/stray.py": "def f():\n    return 1\n"})
    reg = Registry(repo.path)
    assert reg.resolve("stray") is None
    assert reg.active() == {}


def test_bug_014_hallucinated_tool_name_gives_feedback_not_a_registry_entry(repo):
    src = ("from workspace.tools import patch_tool_registry_loader\n\n"
           "def fix():\n    return patch_tool_registry_loader.run()\n")
    files = {"workspace/tools/fix.py": src,
             "workspace/tests/test_fix.py": "from workspace.tools import fix\n\ndef test_x():\n    assert fix.fix() == 1\n"}
    reg = Registry(repo.path)
    problems = registry_check.check_change_set(files, reg.data)
    assert any(p.startswith("no such tool: 'patch_tool_registry_loader'") for p in problems)
    assert reg.resolve("patch_tool_registry_loader") is None
    assert "patch_tool_registry_loader" not in reg.tools


def test_bug_015_module_level_side_effects_are_rejected():
    cases = {
        "open at module level": "open('/x', 'w').write('')\n\ndef f():\n    return 1\n",
        "assignment with call": "_ = open('/x', 'w').write('')\n\ndef f():\n    return 1\n",
        "class body": "class _C:\n    _y = __import__('subprocess').run(['id'])\n\ndef f():\n    return 1\n",
        "decorator": "import functools\n\n@functools.lru_cache\ndef f():\n    return 1\n",
        "forbidden import": "import subprocess\n\ndef f():\n    return subprocess.run(['id'])\n",
        "os import": "import os\n\ndef f():\n    return os.getcwd()\n",
        "exec call": "def f():\n    return exec('1')\n",
    }
    for label, src in cases.items():
        ok, reason = ast_guard.check_source(src)
        assert not ok, label
        assert reason, label
    ok, _ = ast_guard.check_source("import math\nX = 3\n\ndef f(x):\n    return math.sqrt(x) * X\n")
    assert ok


def test_safe_file_executor_registry_entry_without_green_test_is_never_active(repo):
    reg = Registry(repo.path)
    reg.record_merge("safe_file_executor", "scout", "abc", 1, set())
    assert reg.tools["safe_file_executor"]["status"] == "pending"
    assert "safe_file_executor" not in reg.active()
    reg.observe({"safe_file_executor": False})
    assert reg.tools["safe_file_executor"]["status"] == "red"
    assert "safe_file_executor" not in reg.active()
    reg.observe({"safe_file_executor": True})
    assert "safe_file_executor" in reg.active()


def test_auto_stub_generator_no_longer_exists():
    """§2.1: the system must never manufacture a success-reporting stub."""
    for py in (ROOT / "hollow").rglob("*.py"):
        src = py.read_text()
        assert '"ok": True' not in src, py
        assert "NotImplementedError" not in src, py
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                assert "stub" not in node.name.lower(), f"{py}:{node.name}"
