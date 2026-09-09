from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class Check:
    name: str
    ok: bool
    detail: str = ""


@dataclass
class GateResult:
    head: str
    base: str
    checks: list[Check] = field(default_factory=list)
    changed: list[str] = field(default_factory=list)

    def add(self, name: str, ok: bool, detail: str = "") -> bool:
        self.checks.append(Check(name, ok, detail[:4000]))
        return ok

    @property
    def ok(self) -> bool:
        return bool(self.checks) and all(c.ok for c in self.checks)

    @property
    def failures(self) -> list[Check]:
        return [c for c in self.checks if not c.ok]

    def summary(self) -> str:
        lines = [f"verdict: {'ACCEPT' if self.ok else 'REJECT'}"]
        for c in self.checks:
            mark = "ok " if c.ok else "FAIL"
            lines.append(f"  [{mark}] {c.name}" + (f" — {c.detail.splitlines()[0]}" if c.detail else ""))
        return "\n".join(lines)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["ok"] = self.ok
        return d

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2) + "\n")

    @classmethod
    def from_dict(cls, d: dict) -> "GateResult":
        r = cls(head=d.get("head", ""), base=d.get("base", ""), changed=d.get("changed", []))
        for c in d.get("checks", []):
            r.checks.append(Check(c["name"], bool(c["ok"]), c.get("detail", "")))
        return r
