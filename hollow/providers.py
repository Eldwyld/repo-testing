"""One interface for every model call, with a provider list and failover.

All configured providers speak the OpenAI-compatible chat-completions
protocol, so adding or dropping one is a ``hollow.json`` edit. Free tiers
change without notice; that should never be a refactor.

Keys are read from the environment (Actions secrets) by the trusted job
only. The sandbox that executes agent code never sees them.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from hollow.budget import Budget


class ProviderError(RuntimeError):
    pass


class AllProvidersFailed(ProviderError):
    pass


@dataclass
class Reply:
    text: str
    provider: str
    model: str
    tokens: int


def _post_json(url: str, headers: dict, body: dict, timeout: int) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


class ModelClient:
    """Try providers in order; skip disabled, overflow-only, keyless and
    exhausted ones; on 429/5xx/network error move to the next."""

    RETRYABLE = {408, 409, 425, 429, 500, 502, 503, 504}

    def __init__(self, cfg: dict, budget: Budget, env: dict | None = None,
                 post=_post_json, sleep=time.sleep):
        self.providers = [p for p in cfg.get("providers", []) if p.get("enabled", True)]
        self.budget = budget
        self.env = os.environ if env is None else env
        self.post = post
        self.sleep = sleep
        self.log: list[str] = []

    def _eligible(self, overflow: bool) -> list[dict]:
        out = []
        for p in self.providers:
            if p.get("overflow_only") and not overflow:
                continue
            if not self.env.get(p["key_env"]):
                continue
            if not self.budget.provider_has_room(p["name"]):
                continue
            out.append(p)
        return out

    def chat(self, agent: str, system: str, user: str, max_tokens: int = 2500,
             temperature: float = 0.3) -> Reply:
        candidates = self._eligible(overflow=False) or self._eligible(overflow=True)
        if not candidates:
            raise AllProvidersFailed("no provider has a key and remaining budget")
        errors = []
        for p in candidates:
            body = {
                "model": p["model"],
                "messages": [{"role": "system", "content": system},
                             {"role": "user", "content": user}],
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            headers = {"Authorization": f"Bearer {self.env[p['key_env']]}"}
            url = p["base_url"].rstrip("/") + "/chat/completions"
            for attempt in range(2):
                try:
                    data = self.post(url, headers, body, int(p.get("timeout", 90)))
                    text = data["choices"][0]["message"]["content"] or ""
                    usage = data.get("usage") or {}
                    tokens = int(usage.get("total_tokens") or
                                 (usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0))
                                 or (len(system) + len(user) + len(text)) // 4)
                    self.budget.charge(agent, p["name"], tokens)
                    self.log.append(f"{p['name']}/{p['model']} {tokens} tokens")
                    return Reply(text=text, provider=p["name"], model=p["model"], tokens=tokens)
                except urllib.error.HTTPError as exc:
                    errors.append(f"{p['name']}: HTTP {exc.code}")
                    if exc.code in self.RETRYABLE and attempt == 0:
                        self.sleep(float(p.get("retry_seconds", 15)))
                        continue
                    break
                except (urllib.error.URLError, TimeoutError, OSError, KeyError, ValueError) as exc:
                    errors.append(f"{p['name']}: {type(exc).__name__}: {exc}")
                    break
        raise AllProvidersFailed("; ".join(errors))
