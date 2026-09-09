"""Minimal GitHub REST client (stdlib only) for the trusted job.

Everything the cycle needs: open/list/merge/close PRs, comment, create
labelled issues (the human escalation channel), dispatch the gate
workflow, and read the gate's verdict back as data.
"""

from __future__ import annotations

import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import zipfile

API = "https://api.github.com"


class GitHubError(RuntimeError):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


class GitHub:
    def __init__(self, repo: str, token: str | None = None):
        self.repo = repo
        self.token = token or os.environ.get("GITHUB_TOKEN", "")

    # -- transport ----------------------------------------------------------
    def _req(self, method: str, path: str, body: dict | None = None, raw: bool = False):
        url = path if path.startswith("http") else f"{API}/repos/{self.repo}{path}"
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Accept": "application/vnd.github+json",
                   "X-GitHub-Api-Version": "2022-11-28",
                   "User-Agent": "hollow-v2"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = resp.read()
        except urllib.error.HTTPError as exc:
            raise GitHubError(f"{method} {path} -> {exc.code}: {exc.read()[:300]!r}") from exc
        if raw:
            return payload
        return json.loads(payload.decode()) if payload else {}

    def _download(self, path: str) -> bytes:
        """Follow GitHub's redirect to blob storage without the auth header."""
        url = f"{API}/repos/{self.repo}{path}"
        opener = urllib.request.build_opener(_NoRedirect)
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {self.token}", "User-Agent": "hollow-v2",
            "Accept": "application/vnd.github+json"})
        try:
            with opener.open(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code in (301, 302, 307) and exc.headers.get("Location"):
                with urllib.request.urlopen(exc.headers["Location"], timeout=120) as r2:
                    return r2.read()
            raise GitHubError(f"download {path} -> {exc.code}") from exc

    # -- pull requests ------------------------------------------------------
    def open_prs(self, head_prefix: str = "") -> list[dict]:
        prs = self._req("GET", "/pulls?state=open&per_page=100")
        return [p for p in prs if p["head"]["ref"].startswith(head_prefix)]

    def create_pr(self, head: str, base: str, title: str, body: str) -> dict:
        return self._req("POST", "/pulls", {"head": head, "base": base, "title": title, "body": body})

    def merge_pr(self, number: int, title: str) -> dict:
        return self._req("PUT", f"/pulls/{number}/merge",
                         {"merge_method": "squash", "commit_title": title})

    def close_pr(self, number: int) -> dict:
        return self._req("PATCH", f"/pulls/{number}", {"state": "closed"})

    def comment(self, number: int, body: str) -> dict:
        return self._req("POST", f"/issues/{number}/comments", {"body": body})

    def delete_branch(self, name: str) -> None:
        try:
            self._req("DELETE", f"/git/refs/heads/{urllib.parse.quote(name, safe='')}", raw=True)
        except GitHubError:
            pass

    # -- issues (invoke_claude) --------------------------------------------
    def create_issue(self, title: str, body: str, labels: list[str]) -> dict:
        return self._req("POST", "/issues", {"title": title, "body": body, "labels": labels})

    def issues(self, label: str, state: str = "all") -> list[dict]:
        q = urllib.parse.urlencode({"labels": label, "state": state, "per_page": 50})
        return [i for i in self._req("GET", f"/issues?{q}") if "pull_request" not in i]

    def issue_comments(self, number: int) -> list[dict]:
        return self._req("GET", f"/issues/{number}/comments?per_page=50")

    # -- gate workflow ------------------------------------------------------
    def dispatch(self, workflow: str, ref: str, inputs: dict) -> None:
        self._req("POST", f"/actions/workflows/{workflow}/dispatches",
                  {"ref": ref, "inputs": inputs}, raw=True)

    def gate_runs(self, workflow: str, head_sha: str) -> list[dict]:
        q = urllib.parse.urlencode({"head_sha": head_sha, "per_page": 10})
        data = self._req("GET", f"/actions/workflows/{workflow}/runs?{q}")
        return data.get("workflow_runs", [])

    def gate_result(self, run_id: int, artifact_name: str) -> dict | None:
        arts = self._req("GET", f"/actions/runs/{run_id}/artifacts").get("artifacts", [])
        for a in arts:
            if a["name"] == artifact_name and not a.get("expired"):
                blob = self._download(f"/actions/artifacts/{a['id']}/zip")
                with zipfile.ZipFile(io.BytesIO(blob)) as zf:
                    for name in zf.namelist():
                        if name.endswith("gate-result.json"):
                            return json.loads(zf.read(name).decode())
        return None
