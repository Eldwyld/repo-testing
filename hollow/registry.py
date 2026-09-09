"""The tool registry: ``workspace/tools/registry.json``.

Written only by the trusted job. An entry is created when a PR merges, and
becomes *green* only when the credential-less observe job has seen the
tool's test pass on ``main``. A registry entry without a green test is
never activated (the v1 ``safe_file_executor`` case).
"""

from __future__ import annotations

from pathlib import Path

from hollow.config import REGISTRY_FILE, ROOT
from hollow.state import load_json, save_json


class Registry:
    def __init__(self, root: Path | None = None):
        self.path = (root or ROOT) / REGISTRY_FILE
        self.data = load_json(self.path, {"tools": {}})
        self.data.setdefault("tools", {})

    @property
    def tools(self) -> dict:
        return self.data["tools"]

    def save(self) -> None:
        save_json(self.path, self.data)

    def resolve(self, name: str) -> dict | None:
        """Lookup that never creates an entry (v1 BUG-014)."""
        return self.tools.get(name)

    def record_merge(self, name: str, author: str, sha: str, cycle: int, deps: set[str]) -> dict:
        entry = self.tools.get(name) or {
            "author": author, "created_cycle": cycle, "used_by": [], "cycles_survived": 0,
        }
        entry.update({"merged_sha": sha, "status": "pending", "last_merge_cycle": cycle,
                      "test": f"workspace/tests/test_{name}.py", "depends_on": sorted(deps)})
        self.tools[name] = entry
        for dep in deps:
            dep_entry = self.tools.get(dep)
            if dep_entry is not None and author != dep_entry.get("author") \
                    and author not in dep_entry["used_by"]:
                dep_entry["used_by"].append(author)
        return entry

    def observe(self, results: dict[str, bool]) -> tuple[list[str], list[str]]:
        """Apply test results {tool: passed}. Returns (newly_green, broken)."""
        newly_green, broken = [], []
        for name, entry in self.tools.items():
            if name not in results:
                continue
            if results[name]:
                if entry["status"] != "green":
                    newly_green.append(name)
                entry["status"] = "green"
                entry["cycles_survived"] = entry.get("cycles_survived", 0) + 1
            else:
                entry["status"] = "red"
                entry["cycles_survived"] = 0
                broken.append(name)
        return newly_green, broken

    def active(self) -> dict:
        return {n: e for n, e in self.tools.items() if e.get("status") == "green"}

    def summary_lines(self) -> list[str]:
        lines = []
        for name, e in sorted(self.tools.items()):
            users = ",".join(e.get("used_by", [])) or "-"
            lines.append(f"{name}: {e.get('status', '?')} by {e.get('author')} "
                         f"survived={e.get('cycles_survived', 0)} used_by={users}")
        return lines
