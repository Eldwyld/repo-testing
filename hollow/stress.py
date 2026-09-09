"""Consequence: failure costs capability.

Kept from v1: stressors with severity, escalation per cycle, and the two
locks at load 0.55 (no new tools) and 0.75 (no writes at all). Changed
from v1: relief is downstream of use. A merged PR grants *partial* relief;
full relief only arrives when the artifact is exercised — imported by
another agent's merged tool, or surviving N observe cycles green.
"""

from __future__ import annotations

from hollow.state import Store

STRESSORS = ("repeated_failure", "futility", "stagnation", "broken_artifact")


class Stress:
    def __init__(self, store: Store, cfg: dict):
        self.store = store
        self.cfg = cfg["stress"]
        self.data = store.get("stress", {})

    # -- persistence --------------------------------------------------------
    def save(self) -> None:
        self.store.put("stress", self.data)

    def _agent(self, agent: str) -> dict:
        return self.data.setdefault(agent, {"stressors": {}, "idle_cycles": 0, "history": []})

    # -- reading ------------------------------------------------------------
    def load(self, agent: str) -> float:
        s = self._agent(agent)["stressors"]
        return round(min(1.0, sum(s.values())), 3)

    def can_create_tools(self, agent: str) -> bool:
        return self.load(agent) < self.cfg["lock_new_tools"]

    def can_write(self, agent: str) -> bool:
        return self.load(agent) < self.cfg["lock_writes"]

    def locks(self, agent: str) -> list[str]:
        out = []
        if not self.can_create_tools(agent):
            out.append("new tools")
        if not self.can_write(agent):
            out.append("file writes")
        return out

    def fragment(self, agent: str) -> str:
        """Short, factual prompt fragment. Numbers, not narrative."""
        a = self._agent(agent)
        load = self.load(agent)
        parts = [f"stress load {load:.2f}"]
        active = {k: v for k, v in a["stressors"].items() if v > 0.05}
        if active:
            parts.append("stressors: " + ", ".join(f"{k}={v:.2f}" for k, v in sorted(active.items())))
        locks = self.locks(agent)
        if locks:
            parts.append("LOCKED: " + ", ".join(locks))
        parts.append(f"new tools lock at {self.cfg['lock_new_tools']}, writes lock at {self.cfg['lock_writes']}")
        return "; ".join(parts)

    # -- events -------------------------------------------------------------
    def _bump(self, agent: str, kind: str, amount: float, note: str) -> None:
        a = self._agent(agent)
        a["stressors"][kind] = round(min(1.0, a["stressors"].get(kind, 0.0) + amount), 3)
        a["history"] = (a["history"] + [f"+{amount:.2f} {kind}: {note}"])[-20:]

    def _relieve(self, agent: str, kind: str, fraction: float, note: str) -> None:
        a = self._agent(agent)
        cur = a["stressors"].get(kind, 0.0)
        a["stressors"][kind] = round(cur * (1.0 - fraction), 3)
        a["history"] = (a["history"] + [f"-{fraction:.0%} {kind}: {note}"])[-20:]

    def on_rejected(self, agent: str, reason: str) -> None:
        self._bump(agent, "repeated_failure", self.cfg["rejection_bump"], reason[:80])

    def on_merged(self, agent: str, tool: str) -> None:
        """Provisional relief: the gate accepted it, the world has not yet."""
        f = self.cfg["relief_on_merge"]
        self._relieve(agent, "repeated_failure", f, f"merged {tool}")
        self._relieve(agent, "stagnation", 1.0, f"merged {tool}")
        self._agent(agent)["idle_cycles"] = 0

    def on_used(self, agent: str, tool: str, by: str) -> None:
        """Full relief: another agent's merged code imports the tool."""
        for kind in ("futility", "repeated_failure", "broken_artifact"):
            self._relieve(agent, kind, 1.0, f"{tool} used by {by}")

    def on_survived(self, agent: str, tool: str) -> None:
        for kind in ("futility", "broken_artifact"):
            self._relieve(agent, kind, 1.0, f"{tool} survived unflagged")
        self._relieve(agent, "repeated_failure", 0.5, f"{tool} survived")

    def on_broken(self, agent: str, tool: str) -> None:
        self._bump(agent, "broken_artifact", self.cfg["broken_bump"], f"{tool} test red on main")

    def on_unused(self, agent: str, tool: str) -> None:
        self._bump(agent, "futility", self.cfg["unused_bump"], f"{tool} unused")

    def end_of_cycle(self, agent: str, produced: bool) -> None:
        """Escalate everything a little; idle agents accrue stagnation."""
        a = self._agent(agent)
        rate = self.cfg["escalation_per_cycle"]
        for kind, sev in list(a["stressors"].items()):
            if sev > 0:
                a["stressors"][kind] = round(min(1.0, sev * (1.0 + rate)), 3)
        if produced:
            a["idle_cycles"] = 0
        else:
            a["idle_cycles"] += 1
            if a["idle_cycles"] >= 3:
                self._bump(agent, "stagnation", rate, f"idle {a['idle_cycles']} cycles")
