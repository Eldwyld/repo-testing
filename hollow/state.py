"""JSON state files under ``state/``. The repo is the database.

Every file is small, diffable, and committed to ``main`` by the trusted
cycle job. Writes are atomic (temp file + rename) so a crashed run never
leaves a half-written file behind.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from hollow.config import ROOT, STATE_DIR


def state_dir(root: Path | None = None) -> Path:
    return (root or ROOT) / STATE_DIR


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
            fh.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


class Store:
    """Named JSON documents in the state directory."""

    def __init__(self, root: Path | None = None):
        self.dir = state_dir(root)

    def path(self, name: str) -> Path:
        return self.dir / f"{name}.json"

    def get(self, name: str, default=None):
        return load_json(self.path(name), {} if default is None else default)

    def put(self, name: str, data) -> None:
        save_json(self.path(name), data)
