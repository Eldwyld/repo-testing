"""Per-agent and per-provider daily token budgets, enforced in code.

Without this one runaway agent starves the other two (v1's invoke_claude
flood). Usage is keyed by UTC date and persisted in ``state/budget.json``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from hollow.state import Store


class BudgetExceeded(RuntimeError):
    pass


def today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class Budget:
    def __init__(self, store: Store, cfg: dict, day: str | None = None):
        self.store = store
        self.cfg = cfg["budget"]
        self.provider_caps = {p["name"]: p for p in cfg.get("providers", [])}
        self.day = day or today()
        data = store.get("budget", {})
        if data.get("day") != self.day:
            data = {"day": self.day, "agents": {}, "providers": {}}
        self.data = data

    def save(self) -> None:
        self.store.put("budget", self.data)

    def agent_used(self, agent: str) -> int:
        return int(self.data["agents"].get(agent, 0))

    def total_used(self) -> int:
        return sum(int(v) for v in self.data["agents"].values())

    def provider_used(self, name: str) -> dict:
        return self.data["providers"].setdefault(name, {"tokens": 0, "requests": 0})

    def agent_remaining(self, agent: str) -> int:
        per_agent = self.cfg["tokens_per_agent_per_day"] - self.agent_used(agent)
        total = self.cfg["tokens_per_day_total"] - self.total_used()
        return max(0, min(per_agent, total))

    def can_start_cycle(self, agent: str) -> bool:
        return self.agent_remaining(agent) >= self.cfg["max_tokens_per_cycle"]

    def provider_has_room(self, name: str, estimate: int = 4000) -> bool:
        cap = self.provider_caps.get(name, {})
        used = self.provider_used(name)
        if "daily_tokens" in cap and used["tokens"] + estimate > cap["daily_tokens"]:
            return False
        if "daily_requests" in cap and used["requests"] + 1 > cap["daily_requests"]:
            return False
        return True

    def charge(self, agent: str, provider: str, tokens: int) -> None:
        self.data["agents"][agent] = self.agent_used(agent) + int(tokens)
        p = self.provider_used(provider)
        p["tokens"] += int(tokens)
        p["requests"] += 1
        if self.agent_used(agent) > self.cfg["tokens_per_agent_per_day"]:
            raise BudgetExceeded(f"{agent} exceeded daily budget")
