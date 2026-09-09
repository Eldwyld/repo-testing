"""Thin subprocess wrapper around git. No third-party dependencies."""

from __future__ import annotations

import contextlib
import shutil
import subprocess
import tempfile
from pathlib import Path


class GitError(RuntimeError):
    pass


def run(args: list[str], cwd: Path | str, check: bool = True, input: str | None = None) -> str:
    proc = subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True, input=input
    )
    if check and proc.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def merge_base(repo: Path, base: str, head: str) -> str:
    return run(["merge-base", base, head], repo).strip()


def changed_files(repo: Path, base: str, head: str) -> list[str]:
    """Paths changed between the merge-base of ``base``/``head`` and ``head``."""
    mb = merge_base(repo, base, head)
    out = run(["diff", "--name-only", mb, head], repo)
    return [line for line in out.splitlines() if line.strip()]


def file_exists_at(repo: Path, rev: str, path: str) -> bool:
    proc = subprocess.run(
        ["git", "cat-file", "-e", f"{rev}:{path}"], cwd=str(repo), capture_output=True
    )
    return proc.returncode == 0


def show(repo: Path, rev: str, path: str) -> str:
    return run(["show", f"{rev}:{path}"], repo)


def rev_parse(repo: Path, rev: str) -> str:
    return run(["rev-parse", rev], repo).strip()


def recent_subjects(repo: Path, rev: str, n: int) -> list[str]:
    out = run(["log", f"-{n}", "--format=%h %s", rev], repo, check=False)
    return out.splitlines()


def status_short(repo: Path) -> str:
    return run(["status", "--short"], repo)


@contextlib.contextmanager
def worktree(repo: Path, rev: str):
    """Detached worktree at ``rev`` in a temp dir, removed on exit."""
    tmp = Path(tempfile.mkdtemp(prefix="hollow-wt-"))
    path = tmp / "wt"
    run(["worktree", "add", "--detach", str(path), rev], repo)
    try:
        yield path
    finally:
        run(["worktree", "remove", "--force", str(path)], repo, check=False)
        shutil.rmtree(tmp, ignore_errors=True)
        run(["worktree", "prune"], repo, check=False)


def commit_all(repo: Path, message: str, author: str | None = None) -> str:
    run(["add", "-A"], repo)
    args = ["commit", "-q", "-m", message]
    if author:
        args += ["--author", author]
    run(args, repo)
    return rev_parse(repo, "HEAD")
