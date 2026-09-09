"""Walking skeleton, end to end, with a fake model and a fake GitHub.

Cycle 1: the agent plans a tool, the cycle pushes a branch to origin and
"opens" a PR. The real gate evaluates that branch. Cycle 2: the verdict
is read back as data, the PR merges, the registry and stress update.
"""

from __future__ import annotations

import json

from hollow import dashboard
from hollow.cycle import GATE_WORKFLOW, run_cycle
from hollow.gate.redgreen import evaluate
from hollow.registry import Registry
from hollow.state import Store
from tests.conftest import GOOD_TEST, GOOD_TOOL, git


class FakeClient:
    def __init__(self, budget, script):
        self.budget = budget
        self.script = list(script)
        self.prompts = []

    def chat(self, agent, system, user, max_tokens=0, temperature=0.0):
        self.prompts.append(user)
        self.budget.charge(agent, "fake", 1000)
        reply = self.script.pop(0)

        class R:
            text = json.dumps(reply)
            provider, model, tokens = "fake", "fake-1", 1000
        return R()


class FakeGitHub:
    def __init__(self):
        self.prs = {}
        self.issues = {}
        self.comments = []
        self.dispatched = []
        self.merged = []
        self.closed = []
        self.runs = {}
        self.results = {}
        self.n = 0

    def open_prs(self, prefix=""):
        return [p for p in self.prs.values() if p["state"] == "open" and p["head"]["ref"].startswith(prefix)]

    def create_pr(self, head, base, title, body):
        self.n += 1
        sha = git("rev-parse", head, cwd=self.repo_path).strip()
        self.prs[self.n] = {"number": self.n, "state": "open", "title": title,
                            "head": {"ref": head, "sha": sha}}
        return self.prs[self.n]

    def merge_pr(self, number, title):
        self.prs[number]["state"] = "merged"
        self.merged.append(number)
        return {}

    def close_pr(self, number):
        self.prs[number]["state"] = "closed"
        self.closed.append(number)
        return {}

    def comment(self, number, body):
        self.comments.append((number, body))

    def delete_branch(self, name):
        pass

    def create_issue(self, title, body, labels):
        self.n += 1
        self.issues[self.n] = {"number": self.n, "title": title, "labels": labels, "comments": []}
        return self.issues[self.n]

    def issue_comments(self, number):
        return self.issues[number]["comments"]

    def dispatch(self, workflow, ref, inputs):
        assert workflow == GATE_WORKFLOW
        self.dispatched.append(inputs)

    def gate_runs(self, workflow, head_sha):
        return self.runs.get(head_sha, [])

    def gate_result(self, run_id, artifact_name):
        return self.results.get(run_id)


PLAN = {"action": "new_tool", "tool": "slugify", "goal": "slugify strings", "why": "missing"}
ACT = {"files": {"workspace/tests/test_slugify.py": GOOD_TEST,
                 "workspace/tools/slugify.py": GOOD_TOOL}, "summary": "add slugify"}


def _cfg(repo):
    cfg = dict(repo.cfg)
    cfg["agents"] = ["scout"]
    return cfg


def test_walking_skeleton(repo):
    gh = FakeGitHub()
    gh.repo_path = repo.path
    cfg = _cfg(repo)

    # -- cycle 1: plan + act → branch pushed, PR opened, gate dispatched
    ctx = run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [PLAN, ACT]), None, dry_run=False)
    assert len(gh.prs) == 1 and gh.dispatched[0]["pr"] == "1"
    out = ctx.outcomes[0]
    assert out.produced and out.pr == 1 and out.branch.startswith("agent/scout/slugify-")
    assert git("branch", "-r", cwd=repo.path).count("origin/agent/scout/slugify-") == 1
    assert Store(repo.path).get("meta")["cycle"] == 1
    assert Store(repo.path).get("budget")["agents"]["scout"] == 2000
    assert "## Ground truth" in ctx.client.prompts[0]

    # -- the real gate evaluates the pushed branch
    sha = gh.prs[1]["head"]["sha"]
    git("fetch", "-q", "origin", cwd=repo.path)
    result = evaluate(repo.path, "main", sha, cfg)
    assert result.ok, result.summary()
    gh.runs[sha] = [{"id": 99, "status": "completed", "conclusion": "success"}]
    gh.results[99] = result.to_dict()

    # simulate the squash merge landing on main (the real one is done by GitHub)
    git("merge", "-q", "--no-ff", "-m", "merge", sha, cwd=repo.path)
    git("push", "-q", "origin", "main", cwd=repo.path)

    # -- cycle 2: verdict read as data → merged → registry + stress updated
    truth = {"tools": {"slugify": True}, "failing": [], "totals": {"passed": 2, "failed": 0, "errors": 0}}
    ctx2 = run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [{"action": "rest", "why": "done"}]),
                     truth, dry_run=False)
    assert gh.merged == [1]
    reg = Registry(repo.path)
    assert reg.tools["slugify"]["author"] == "scout"
    assert reg.tools["slugify"]["status"] == "pending"  # green only after observe sees it
    assert ctx2.outcomes[0].action == "rest"
    assert Store(repo.path).get("prs") == {}

    # -- cycle 3: observe reports green → registry green, survival counter ticks
    ctx3 = run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [{"action": "rest"}]), truth, dry_run=False)
    assert Registry(repo.path).tools["slugify"]["status"] == "green"
    assert "slugify: green" in ctx3.client.prompts[0]
    html = dashboard.render(repo.path, cfg)
    assert "slugify" in html and "cycle 3" in html


def test_rejected_pr_is_closed_with_feedback_and_stress(repo):
    gh = FakeGitHub()
    gh.repo_path = repo.path
    cfg = _cfg(repo)
    weak = {"files": {"workspace/tests/test_slugify.py":
                      "from workspace.tools import slugify\n\ndef test_x():\n    assert slugify.slugify is not None\n",
                      "workspace/tools/slugify.py": GOOD_TOOL}, "summary": "weak"}
    run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [PLAN, weak]), None, dry_run=False)
    sha = gh.prs[1]["head"]["sha"]
    git("fetch", "-q", "origin", cwd=repo.path)
    result = evaluate(repo.path, "main", sha, cfg)
    assert not result.ok
    gh.runs[sha] = [{"id": 5, "status": "completed", "conclusion": "failure"}]
    gh.results[5] = result.to_dict()

    ctx = run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [{"action": "rest"}]), None, dry_run=False)
    assert gh.closed == [1] and gh.merged == []
    assert "mutation" in gh.comments[0][1]
    fb = Store(repo.path).get("feedback")["scout"]
    assert any("REJECTED" in f and "mutation" in f for f in fb)
    assert ctx.stress.load("scout") > 0
    assert "REJECTED" in ctx.client.prompts[0]


def test_static_rejection_costs_one_review_round_not_a_ci_round(repo):
    gh = FakeGitHub()
    gh.repo_path = repo.path
    cfg = _cfg(repo)
    bad = {"files": {"workspace/tests/test_slugify.py": GOOD_TEST,
                     "workspace/tools/slugify.py": "import os\n" + GOOD_TOOL}, "summary": "bad"}
    ctx = run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [PLAN, bad, ACT]), None, dry_run=False)
    assert ctx.outcomes[0].produced and len(gh.prs) == 1
    assert "import of 'os'" in ctx.client.prompts[2]

    gh2 = FakeGitHub()
    gh2.repo_path = repo.path
    ctx2 = run_cycle(repo.path, cfg, gh2, lambda b: FakeClient(b, [PLAN, bad, bad]), None, dry_run=False)
    assert ctx2.outcomes[0].action == "rejected-static" and gh2.prs == {}
    assert ctx2.stress.load("scout") > 0


def test_ask_human_opens_labelled_issue_and_answer_comes_back(repo):
    gh = FakeGitHub()
    gh.repo_path = repo.path
    cfg = _cfg(repo)
    ask = {"action": "ask_human", "question": "Should tools accept bytes?"}
    run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [ask]), None, dry_run=False)
    assert gh.issues[1]["labels"] == ["invoke-claude"]
    gh.issues[1]["comments"].append({"user": {"login": "ellis"}, "body": "No, str only."})
    ctx = run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [{"action": "rest"}]), None, dry_run=False)
    assert any("No, str only." in f for f in ctx.feedback_for("scout"))
    assert "No, str only." in ctx.client.prompts[0]


def test_locked_agent_cannot_write(repo):
    gh = FakeGitHub()
    gh.repo_path = repo.path
    cfg = _cfg(repo)
    store = Store(repo.path)
    store.put("stress", {"scout": {"stressors": {"repeated_failure": 0.8}, "idle_cycles": 0, "history": []}})
    ctx = run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [PLAN]), None, dry_run=False)
    assert ctx.outcomes[0].action == "locked" and gh.prs == {}
    assert "LOCKED" in ctx.client.prompts[0]


def test_budget_exhausted_agent_is_skipped(repo):
    gh = FakeGitHub()
    gh.repo_path = repo.path
    cfg = _cfg(repo)
    cfg["budget"] = {"tokens_per_agent_per_day": 100, "tokens_per_day_total": 100, "max_tokens_per_cycle": 50}
    Store(repo.path).put("budget", {"day": __import__("hollow.budget", fromlist=["today"]).today(),
                                    "agents": {"scout": 90}, "providers": {}})
    ctx = run_cycle(repo.path, cfg, gh, lambda b: FakeClient(b, [PLAN]), None, dry_run=False)
    assert ctx.outcomes == [] and any("budget exhausted" in e for e in ctx.events)
