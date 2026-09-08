"""
Shared atomic-write / fail-closed-read helpers for the state modules that
persist to /agentOS/memory (suffering, identity, capability graph, registry).

Why this exists: `path.write_text(json.dumps(...))` is not atomic — a process
killed mid-write (entrypoint.sh brings the whole container down whenever
either child process exits, and `restart: unless-stopped` brings it back
straight into these writers) leaves a truncated file. The read side then
swallowed that silently and started over from a fresh/default state — for
suffering.json that means load resets to 0.0, which unlocks every gated
capability; for profile.json it means the agent's identity gets re-rolled.
Silent recovery to a permissive state is worse than surfacing the corruption.
"""

import json
import logging
import os
import threading
import time
import uuid
from pathlib import Path
from typing import NamedTuple, Optional

log = logging.getLogger("agentos.atomic_io")


def atomic_write_text(path: Path, text: str) -> None:
    """Write text to `path` atomically — a reader never observes a partial write."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # pid alone isn't unique enough — these writers are called from multiple
    # threads within one process (daemon worker threads, the FastAPI event
    # loop's executor), so two concurrent writers to the same path with a
    # pid-only suffix would race on the same tmp file and one replace would
    # find it already consumed by the other.
    tmp = path.with_suffix(path.suffix + f".tmp.{os.getpid()}.{threading.get_ident()}.{uuid.uuid4().hex[:8]}")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)  # atomic within a filesystem, unlike Path.rename on Windows


class LoadResult(NamedTuple):
    """
    `data` is the parsed dict, or None on a missing/corrupt file. `corrupt`
    distinguishes "was corrupt (and has been quarantined)" from "simply
    didn't exist yet" — checking `path.exists()` after the call is NOT a
    substitute, because a corrupt file has already been moved aside by the
    time the caller sees this result and would read back as missing.
    """
    data: Optional[dict]
    corrupt: bool


def load_json_fail_closed(path: Path) -> LoadResult:
    """
    Read and parse JSON at `path`. On corruption, quarantine the bad file
    (rename to <name>.corrupt.<ts>) and log at ERROR instead of silently
    discarding it, so the corruption is visible and the raw bytes survive
    for inspection. Callers decide the fail-closed default for `corrupt`
    results — None must NOT be treated the same as "no history / fresh
    state" without that decision being made explicitly at the call site.
    """
    if not path.exists():
        return LoadResult(None, False)
    try:
        return LoadResult(json.loads(path.read_text(encoding="utf-8")), False)
    except Exception as exc:
        quarantine = path.with_name(f"{path.name}.corrupt.{int(time.time())}")
        try:
            os.replace(path, quarantine)
        except Exception:
            quarantine = None
        log.error(
            "load_json_fail_closed: %s is corrupt (%s) — quarantined to %s",
            path, exc, quarantine,
        )
        return LoadResult(None, True)
