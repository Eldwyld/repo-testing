"""Configuration: ``hollow.json`` at the repo root, plus path conventions.

The config file is a protected path (agents cannot change it via a PR), so
budgets, provider lists and stress thresholds are operator decisions only.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_FILE = ROOT / "hollow.json"

# Where agents are allowed to write. Everything else is off-limits to a PR
# from an agent branch, enforced statically before push and again in CI.
WORKSPACE = "workspace"
TOOLS_DIR = f"{WORKSPACE}/tools"
TESTS_DIR = f"{WORKSPACE}/tests"
REGISTRY_FILE = f"{TOOLS_DIR}/registry.json"
STATE_DIR = "state"
AGENT_BRANCH_PREFIX = "agent/"

DEFAULTS: dict = {
    "agents": ["scout", "analyst", "builder"],
    "default_branch": "main",
    "cadence_minutes": 20,
    "budget": {
        "tokens_per_agent_per_day": 350_000,
        "tokens_per_day_total": 1_100_000,
        "max_tokens_per_cycle": 12_000,
    },
    "providers": [],
    "stress": {
        "lock_new_tools": 0.55,
        "lock_writes": 0.75,
        "relief_on_merge": 0.5,
        "survive_cycles": 5,
        "escalation_per_cycle": 0.04,
        "rejection_bump": 0.12,
        "unused_bump": 0.08,
        "broken_bump": 0.15,
    },
    "prompt": {
        "max_narrative_chars": 600,
        "max_peer_chars": 400,
        "recent_commits": 8,
    },
    "gate": {"test_timeout_seconds": 120},
    "protected_paths": [
        ".github/",
        "hollow.json",
        "POLICY.md",
        "hollow/",
        "tests/",
        STATE_DIR + "/",
        REGISTRY_FILE,
        "site/",
        "pyproject.toml",
    ],
}


def _merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _merge(out[key], value)
        else:
            out[key] = value
    return out


def load(path: Path | None = None) -> dict:
    """Load ``hollow.json`` merged over :data:`DEFAULTS`."""
    path = path or CONFIG_FILE
    if not path.exists():
        return _merge(DEFAULTS, {})
    return _merge(DEFAULTS, json.loads(path.read_text()))


def is_test_path(path: str) -> bool:
    name = Path(path).name
    return path.startswith(TESTS_DIR + "/") and name.startswith("test_") and name.endswith(".py")


def is_impl_path(path: str) -> bool:
    if path == REGISTRY_FILE or not path.startswith(TOOLS_DIR + "/"):
        return False
    return path.endswith(".py") and Path(path).name != "__init__.py"


def tool_name_from_path(path: str) -> str:
    return Path(path).stem
