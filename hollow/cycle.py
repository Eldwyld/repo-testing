"""The cron-driven cycle. Runs in the trusted job with a write token.

Order of work each run:
1. reconcile open agent PRs against gate verdicts (merge / close)
2. apply the observe job's test results to the registry and stress
3. deliver human answers from labelled issues as feedback
4. run one cycle for each agent that has no PR in flight and budget left
5. persist state, regenerate the dashboard, commit to main
"""

from __future__ import annotations

import json
import os
import random
from datetime import datetime, timezone
from pathlib import Path

from hollow import config, gitutil
from hollow.agent import ISSUE_LABEL, AgentRunner, Outcome
from hollow.budget import Budget
from hollow.gate.result import GateResult
from hollow.identity import Identity
from hollow.registry import Registry
from hollow.state import Store
from hollow.stress import Stress
from hollow.truth import gather

GATE_WORKFLOW = "gate.yml"


class Context:
    def __init__(self, root: Path, cfg: dict, gh, client_factory, truth: dict | None,
                 dry_run: bool = False, seed: int | None = None):
        self.root = root
        self.cfg = cfg
        self.gh = gh
        self.dry_run = dry_run
        self.store = Store(root)
        self.registry = Registry(root)
        self.stress = Stress(self.store, cfg)
        self.budget = Budget(self.store, cfg)
        self.identity = Identity(self.store)
        # The client shares this Budget instance so every charge is persisted.
        self.client = client_factory(self.budget)
        self.meta = self.store.get("meta", {"cycle": 0})
        self.prs = self.store.get("prs", {})
        self.feedback = self.store.get("feedback", {})
        self.escalations = self.store.get("escalations", {})
        self.cycle_no = int(self.meta.get("cycle", 0)) + 1
        self.rng = random.Random(seed)
        self.outcomes: list[Outcome] = []
        self.events: list[str] = []
        open_prs = self.gh.open_prs(config.AGENT_BRANCH_PREFIX) if self.gh else []
        self.ground_truth = gather(root, truth, self.registry.data, open_prs,
                                   cfg["prompt"]["recent_commits"])
        self.truth = truth

    # -- helpers used by AgentRunner ---------------------------------------
    def log(self, msg: str) -> None:
        self.events.append(msg)
        print(f"[cycle {self.cycle_no}] {msg}")

    def feedback_for(self, agent: str) -> list[str]:
        return self.feedback.get(agent, [])

    def add_feedback(self, agent: str, text: str) -> None:
        self.feedback[agent] = (self.feedback.get(agent, []) + [text])[-6:]

    def peer_summary(self, agent: str) -> str:
        bits = []
        for other in self.cfg["agents"]:
            if other == agent:
                continue
            p = self.identity.profile(other)
            if p.get("narrative"):
                bits.append(f"{self.identity.name_of(other, self.rng)}: {p['narrative'][-160:]}")
        return "\n".join(bits)

    def has_open_pr(self, agent: str) -> bool:
        return any(p["agent"] == agent for p in self.prs.values())

    # -- side effects -------------------------------------------------------
    def submit(self, agent: str, branch: str, files: dict[str, str], tool: str,
               summary: str, goal: str, deps: list[str]) -> int | None:
        base = self.cfg["default_branch"]
        title = f"{agent}: {summary}"[:100]
        body = (f"**Agent:** {agent}\n**Tool:** `{tool}`\n**Goal:** {goal}\n"
                f"**Depends on:** {', '.join(deps) or 'nothing'}\n\n"
                "Opened by the Hollow cycle. The gate decides; humans are welcome to comment.")
        if self.dry_run:
            self.log(f"dry-run: would open PR on {branch} for {tool}: {summary}")
            return None
        # Merges earlier in this run landed on origin, not on the local branch;
        # start from what main actually is now.
        gitutil.run(["fetch", "-q", "origin", base], self.root)
        with gitutil.worktree(self.root, f"origin/{base}") as wt:
            for rel, src in files.items():
                dest = wt / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(src)
            gitutil.run(["checkout", "-q", "-b", branch], wt)
            gitutil.commit_all(
                wt, f"{agent}: {summary}\n\nGoal: {goal}\nTool: {tool}\nHollow-Agent: {agent}\n"
                    f"Hollow-Cycle: {self.cycle_no}",
                author=f"{agent} (hollow) <{agent}@hollow.invalid>")
            gitutil.run(["push", "-u", "origin", branch], wt)
        pr = self.gh.create_pr(branch, base, title, body)
        sha = pr["head"]["sha"]
        self.prs[str(pr["number"])] = {"agent": agent, "tool": tool, "deps": deps, "sha": sha,
                                       "branch": branch, "opened_cycle": self.cycle_no}
        self._dispatch_gate(pr["number"], sha, base)
        self.log(f"{agent} opened PR #{pr['number']} ({tool})")
        return pr["number"]

    def escalate(self, agent: str, question: str) -> int | None:
        title = f"[{agent}] {question[:70]}"
        body = (f"Agent **{agent}** asks:\n\n> {question}\n\n"
                "Reply in a comment. The next cycle delivers your answer to the agent.")
        if self.dry_run:
            self.log(f"dry-run: would open issue: {title}")
            return None
        issue = self.gh.create_issue(title, body, [ISSUE_LABEL])
        self.escalations[str(issue["number"])] = {"agent": agent, "delivered": 0,
                                                  "cycle": self.cycle_no}
        self.log(f"{agent} opened issue #{issue['number']}")
        return issue["number"]

    def _dispatch_gate(self, number: int, sha: str, base: str) -> None:
        try:
            self.gh.dispatch(GATE_WORKFLOW, base, {"pr": str(number), "head_sha": sha})
            self.prs[str(number)]["dispatched_cycle"] = self.cycle_no
        except Exception as exc:  # noqa: BLE001 - surfaced in the log, retried next cycle
            self.log(f"gate dispatch for #{number} failed: {exc}")

    # -- phases -------------------------------------------------------------
    def reconcile_prs(self) -> None:
        if self.dry_run:
            return
        base = self.cfg["default_branch"]
        open_prs = {p["number"]: p for p in self.gh.open_prs(config.AGENT_BRANCH_PREFIX)}
        for key in list(self.prs):
            if int(key) not in open_prs:
                self.log(f"PR #{key} is no longer open; forgetting it")
                del self.prs[key]
        for number, pr in open_prs.items():
            key = str(number)
            sha = pr["head"]["sha"]
            rec = self.prs.setdefault(key, {
                "agent": pr["head"]["ref"].split("/")[1] if "/" in pr["head"]["ref"] else "unknown",
                "tool": pr["head"]["ref"].rsplit("/", 1)[-1].rsplit("-", 1)[0],
                "deps": [], "sha": sha, "branch": pr["head"]["ref"], "opened_cycle": self.cycle_no})
            rec["sha"] = sha
            runs = [r for r in self.gh.gate_runs(GATE_WORKFLOW, sha) if r.get("status") == "completed"]
            if not runs:
                last = rec.get("dispatched_cycle")
                if last is None or self.cycle_no - last >= 3:
                    self._dispatch_gate(number, sha, base)
                continue
            run = runs[0]
            data = self.gh.gate_result(run["id"], f"gate-{sha}")
            result = GateResult.from_dict(data) if data else GateResult(head=sha, base="")
            if data is None:
                result.add("gate-run", run.get("conclusion") == "success",
                           f"no result artifact; run conclusion {run.get('conclusion')}")
            self._settle(number, rec, result)

    def _settle(self, number: int, rec: dict, result: GateResult) -> None:
        agent, tool = rec["agent"], rec["tool"]
        if result.ok:
            self.gh.merge_pr(number, f"{agent}: {tool} (#{number})")
            self.gh.delete_branch(rec["branch"])
            entry = self.registry.record_merge(tool, agent, rec["sha"], self.cycle_no, set(rec.get("deps", [])))
            self.stress.on_merged(agent, tool)
            for dep in rec.get("deps", []):
                dep_entry = self.registry.resolve(dep)
                if dep_entry and dep_entry["author"] != agent:
                    self.stress.on_used(dep_entry["author"], dep, agent)
            self.add_feedback(agent, f"PR #{number} ({tool}) merged; it becomes green once its test "
                                     "passes on main, and relief completes when a peer uses it")
            self.log(f"merged #{number} {tool} by {agent}; registry {entry['status']}")
        else:
            summary = result.summary()
            self.gh.comment(number, "Gate verdict:\n\n```\n" + summary + "\n```\n\n"
                            "Closed by the Hollow cycle. Feedback goes back to the agent.")
            self.gh.close_pr(number)
            self.gh.delete_branch(rec["branch"])
            self.stress.on_rejected(agent, "; ".join(f.name for f in result.failures))
            self.add_feedback(agent, f"PR #{number} ({tool}) REJECTED — " + "; ".join(
                f"{f.name}: {f.detail.splitlines()[0] if f.detail else ''}" for f in result.failures))
            self.log(f"closed #{number} {tool} by {agent}: {[f.name for f in result.failures]}")
        del self.prs[str(number)]

    def apply_observation(self) -> None:
        if not self.truth:
            return
        # The observe job ran on main *before* this run merged anything, so its
        # results can only vouch for tools merged in an earlier cycle.
        results = {name: ok for name, ok in self.truth.get("tools", {}).items()
                   if name in self.registry.tools
                   and self.registry.tools[name].get("last_merge_cycle", 0) < self.cycle_no}
        newly_green, broken = self.registry.observe(results)
        survive = int(self.cfg["stress"]["survive_cycles"])
        for name in broken:
            self.stress.on_broken(self.registry.tools[name]["author"], name)
            self.add_feedback(self.registry.tools[name]["author"], f"tool {name} is RED on main")
        for name, e in self.registry.tools.items():
            if e.get("status") != "green":
                continue
            n = e.get("cycles_survived", 0)
            if n == survive:
                self.stress.on_survived(e["author"], name)
                self.log(f"{name} survived {survive} cycles green; full relief for {e['author']}")
            elif n > survive and n % (survive * 2) == 0 and not e.get("used_by"):
                self.stress.on_unused(e["author"], name)

    def deliver_answers(self) -> None:
        if self.dry_run or not self.escalations:
            return
        for key, rec in list(self.escalations.items()):
            try:
                comments = self.gh.issue_comments(int(key))
            except Exception as exc:  # noqa: BLE001
                self.log(f"could not read issue #{key}: {exc}")
                continue
            human = [c for c in comments if not c["user"]["login"].endswith("[bot]")]
            if len(human) > rec["delivered"]:
                for c in human[rec["delivered"]:]:
                    self.add_feedback(rec["agent"], f"human answered #{key}: {c['body'][:400]}")
                rec["delivered"] = len(human)
                self.log(f"delivered {len(human)} answer(s) from #{key} to {rec['agent']}")
            if self.cycle_no - rec.get("cycle", 0) > 200:
                del self.escalations[key]

    def run_agents(self) -> None:
        runner = AgentRunner(self)
        for agent in self.cfg["agents"]:
            if self.has_open_pr(agent):
                self.log(f"{agent}: PR in flight, waiting")
                self.stress.end_of_cycle(agent, produced=True)
                continue
            if not self.budget.can_start_cycle(agent):
                self.log(f"{agent}: budget exhausted for today")
                continue
            try:
                out = runner.run(agent)
            except Exception as exc:  # noqa: BLE001 - one agent's failure must not stop the others
                out = Outcome(agent=agent, action="error", note=f"{type(exc).__name__}: {exc}"[:200])
                self.add_feedback(agent, f"cycle error: {out.note}")
            for fb in out.feedback:
                self.add_feedback(agent, fb)
            self.identity.profile(agent)["cycles"] = self.identity.profile(agent).get("cycles", 0) + 1
            self.stress.end_of_cycle(agent, out.produced)
            self.outcomes.append(out)
            self.log(f"{agent}: {out.action} {out.tool} {out.note}".strip())

    def persist(self) -> None:
        self.meta["cycle"] = self.cycle_no
        self.meta["last_run"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.meta["last_events"] = self.events[-30:]
        self.meta["last_outcomes"] = [
            {"agent": o.agent, "action": o.action, "tool": o.tool, "pr": o.pr, "note": o.note}
            for o in self.outcomes]
        history = self.store.get("history", [])
        history.append({"cycle": self.cycle_no, "at": self.meta["last_run"],
                        "outcomes": self.meta["last_outcomes"],
                        "stress": {a: self.stress.load(a) for a in self.cfg["agents"]}})
        self.store.put("history", history[-200:])
        self.store.put("meta", self.meta)
        self.store.put("prs", self.prs)
        self.store.put("feedback", self.feedback)
        self.store.put("escalations", self.escalations)
        self.stress.save()
        self.budget.save()
        self.identity.save()
        self.registry.save()

    def run(self) -> None:
        self.reconcile_prs()
        self.apply_observation()
        self.deliver_answers()
        self.run_agents()
        self.persist()


def run_cycle(root: Path, cfg: dict, gh, client_factory, truth: dict | None, dry_run: bool) -> Context:
    ctx = Context(root, cfg, gh, client_factory, truth, dry_run=dry_run)
    ctx.run()
    return ctx
