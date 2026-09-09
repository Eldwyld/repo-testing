"""Agent identity. Kept from v1: persistent names claimed from a pool and
recorded in ``names.json`` — the system's best emergent behaviour, so it
ships as a feature. Narrative is capped; the prompt is dominated by facts.
"""

from __future__ import annotations

import random

from hollow.state import Store

NAME_POOL = [
    "Axiom", "Cipher", "Vector", "Nexus", "Qubit", "Sigma", "Helix", "Null",
    "Vertex", "Tensor", "Proxy", "Flux", "Delta", "Scout", "Ember", "Lumen",
    "Cove", "Sage", "Drift", "Fern", "Wren", "Finch", "Cedar", "Birch", "Moss",
    "Slate", "Blaze", "Nova", "Apex", "Titan", "Forge", "Crest", "Spire",
    "Vault", "Flint", "Ridge", "Dune", "Crag", "Pickle", "Wobble", "Noodle",
    "Gizmo", "Tofu", "Quark", "Jolt", "Fizz", "Plonk", "Glitch",
]

ROLE_LEANINGS = {
    "scout": "notices gaps and missing pieces; prefers small, well-tested utilities",
    "analyst": "verifies before building; prefers fixing red tests and tightening existing tools",
    "builder": "composes existing tools into larger ones; prefers reuse over novelty",
}


class Identity:
    def __init__(self, store: Store):
        self.store = store
        self.names: dict[str, str] = store.get("names", {})
        self.profiles: dict[str, dict] = store.get("identity", {})

    def save(self) -> None:
        self.store.put("names", self.names)
        self.store.put("identity", self.profiles)

    def name_of(self, agent: str, rng: random.Random | None = None) -> str:
        for name, aid in self.names.items():
            if aid == agent:
                return name
        rng = rng or random.Random()
        free = [n for n in NAME_POOL if n not in self.names]
        name = rng.choice(free) if free else f"{rng.choice(NAME_POOL)}{len(self.names) + 2}"
        self.names[name] = agent
        return name

    def profile(self, agent: str) -> dict:
        return self.profiles.setdefault(agent, {
            "leaning": ROLE_LEANINGS.get(agent, ""), "narrative": "", "cycles": 0,
        })

    def note(self, agent: str, text: str, max_chars: int) -> None:
        p = self.profile(agent)
        p["narrative"] = (p["narrative"] + " " + text.strip()).strip()[-max_chars:]
