from __future__ import annotations

import pytest

from hollow import config
from hollow.budget import Budget, BudgetExceeded
from hollow.providers import AllProvidersFailed, ModelClient
from hollow.state import Store
from hollow.stress import Stress


@pytest.fixture
def cfg():
    c = config.load(config.ROOT / "hollow.json")
    c["providers"] = [
        {"name": "a", "base_url": "http://a", "key_env": "A_KEY", "model": "m", "daily_tokens": 10_000},
        {"name": "b", "base_url": "http://b", "key_env": "B_KEY", "model": "m", "daily_tokens": 10_000},
        {"name": "c", "base_url": "http://c", "key_env": "C_KEY", "model": "m", "daily_requests": 2,
         "overflow_only": True},
    ]
    return c


def test_locks_at_v1_thresholds(tmp_path, cfg):
    s = Stress(Store(tmp_path), cfg)
    assert s.can_create_tools("scout") and s.can_write("scout")
    for _ in range(5):
        s.on_rejected("scout", "gate")
    assert s.load("scout") == pytest.approx(0.6, abs=0.01)
    assert not s.can_create_tools("scout") and s.can_write("scout")
    for _ in range(2):
        s.on_rejected("scout", "gate")
    assert s.load("scout") >= 0.75
    assert not s.can_write("scout")
    assert "LOCKED" in s.fragment("scout")


def test_relief_is_downstream_of_use(tmp_path, cfg):
    s = Stress(Store(tmp_path), cfg)
    for _ in range(4):
        s.on_rejected("scout", "gate")
    before = s.load("scout")
    s.on_merged("scout", "slugify")
    after_merge = s.load("scout")
    assert 0 < after_merge < before            # provisional: half relief
    assert after_merge == pytest.approx(before * 0.5, abs=0.01)
    s.on_used("scout", "slugify", by="builder")
    assert s.load("scout") == 0.0               # full relief only on use


def test_survival_also_relieves_and_escalation_bites(tmp_path, cfg):
    s = Stress(Store(tmp_path), cfg)
    s.on_broken("scout", "x")
    s.on_unused("scout", "x")
    load = s.load("scout")
    s.end_of_cycle("scout", produced=False)
    assert s.load("scout") > load
    s.on_survived("scout", "x")
    assert s.load("scout") == 0.0
    for _ in range(3):
        s.end_of_cycle("scout", produced=False)
    assert s.load("scout") > 0.0  # stagnation


def test_budget_enforced_per_agent_and_persisted(tmp_path, cfg):
    cfg["budget"] = {"tokens_per_agent_per_day": 1000, "tokens_per_day_total": 2500,
                     "max_tokens_per_cycle": 300}
    store = Store(tmp_path)
    b = Budget(store, cfg, day="2026-01-01")
    b.charge("scout", "a", 800)
    assert not b.can_start_cycle("scout")
    assert b.can_start_cycle("builder")
    with pytest.raises(BudgetExceeded):
        b.charge("scout", "a", 300)
    b.save()
    again = Budget(store, cfg, day="2026-01-01")
    assert again.agent_used("scout") == 1100
    tomorrow = Budget(store, cfg, day="2026-01-02")
    assert tomorrow.agent_used("scout") == 0


def test_total_cap_protects_the_other_agents(tmp_path, cfg):
    cfg["budget"] = {"tokens_per_agent_per_day": 2000, "tokens_per_day_total": 2500,
                     "max_tokens_per_cycle": 600}
    b = Budget(Store(tmp_path), cfg)
    b.charge("scout", "a", 1900)
    assert b.agent_remaining("builder") == 600
    b.charge("builder", "a", 100)
    assert not b.can_start_cycle("builder")


def test_provider_failover(tmp_path, cfg):
    import urllib.error
    calls = []

    def post(url, headers, body, timeout):
        calls.append(url)
        if url.startswith("http://a"):
            raise urllib.error.HTTPError(url, 429, "rate", {}, None)
        return {"choices": [{"message": {"content": "{}"}}],
                "usage": {"total_tokens": 42}}

    budget = Budget(Store(tmp_path), cfg)
    client = ModelClient(cfg, budget, env={"A_KEY": "x", "B_KEY": "y", "C_KEY": "z"},
                         post=post, sleep=lambda s: None)
    reply = client.chat("scout", "sys", "user")
    assert reply.provider == "b" and reply.tokens == 42
    assert calls == ["http://a/chat/completions", "http://a/chat/completions", "http://b/chat/completions"]
    assert budget.provider_used("b")["requests"] == 1 and budget.agent_used("scout") == 42


def test_overflow_provider_only_when_nothing_else_has_room(tmp_path, cfg):
    def post(url, headers, body, timeout):
        return {"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 5}}

    budget = Budget(Store(tmp_path), cfg)
    client = ModelClient(cfg, budget, env={"C_KEY": "z"}, post=post)
    assert client.chat("scout", "s", "u").provider == "c"
    client.chat("scout", "s", "u")
    with pytest.raises(AllProvidersFailed):
        client.chat("scout", "s", "u")  # daily_requests = 2 exhausted


def test_keys_never_reach_the_sandbox_env():
    from hollow.gate.testrun import run_pytest  # noqa: F401
    import inspect
    src = inspect.getsource(run_pytest)
    assert "os.environ.get(\"PATH\"" in src and "**os.environ" not in src
