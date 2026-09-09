"""One agent, one cycle: plan → act → review → branch → PR.

The trusted job runs this. It calls the model, writes files onto a branch
and pushes. It never executes what the agent wrote; the static checks it
runs are AST-only. Dynamic checks happen in the gate workflow.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from hollow import config, gitutil, prompt
from hollow.gate.redgreen import static_checks
from hollow.gate.registry_check import tool_dependencies
from hollow.gate.result import GateResult

ISSUE_LABEL = "invoke-claude"


@dataclass
class Outcome:
    agent: str
    action: str
    produced: bool = False
    tool: str = ""
    branch: str = ""
    pr: int | None = None
    note: str = ""
    feedback: list[str] = field(default_factory=list)


def parse_json(text: str) -> dict:
    """Tolerant JSON extraction: strips fences, takes the outermost object."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:end + 1])


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9_]+", "_", (s or "").strip().lower()).strip("_")
    return s[:40] or "tool"


class AgentRunner:
    def __init__(self, ctx):
        self.ctx = ctx  # hollow.cycle.Context

    # -- helpers ------------------------------------------------------------
    def _facts(self, agent: str) -> dict:
        c = self.ctx
        return {
            "agent": agent,
            "name": c.identity.name_of(agent, c.rng),
            "leaning": c.identity.profile(agent)["leaning"],
            "stress": c.stress.fragment(agent),
            "budget": c.budget.agent_remaining(agent),
        }

    def _constraints(self, agent: str) -> str:
        s = self.ctx.stress
        if not s.can_write(agent):
            return "file writes are LOCKED (stress >= 0.75): only ask_human or rest are available."
        if not s.can_create_tools(agent):
            return "new tools are LOCKED (stress >= 0.55): only fix_tool, ask_human or rest."
        return "none"

    def _ask(self, agent: str, instructions: str, max_tokens: int) -> dict:
        c = self.ctx
        facts = self._facts(agent)
        user = prompt.build_user_prompt(
            c.ground_truth, facts, c.identity.profile(agent)["narrative"],
            c.peer_summary(agent), c.feedback_for(agent), instructions, c.cfg)
        reply = c.client.chat(agent, prompt.SYSTEM.format(name=facts["name"]), user, max_tokens)
        return parse_json(reply.text)

    # -- the cycle ----------------------------------------------------------
    def run(self, agent: str) -> Outcome:
        c = self.ctx
        plan = self._ask(agent, prompt.PLAN_INSTRUCTIONS.format(constraints=self._constraints(agent)), 600)
        action = str(plan.get("action", "rest"))
        out = Outcome(agent=agent, action=action)

        if action == "ask_human":
            return self._escalate(out, str(plan.get("question", "")).strip())
        if action not in ("new_tool", "fix_tool"):
            out.note = str(plan.get("why", ""))[:200]
            return out
        if not c.stress.can_write(agent) or (action == "new_tool" and not c.stress.can_create_tools(agent)):
            out.feedback.append(f"planned {action} while it is locked by stress; nothing was written")
            out.action = "locked"
            return out

        tool = _slug(str(plan.get("tool", "")))
        out.tool = tool
        goal = str(plan.get("goal", ""))[:300]
        act = self._ask(agent, prompt.ACT_INSTRUCTIONS.format(goal=goal, tool=tool, extra=""), 3000)
        files = self._normalise_files(act, tool)

        result = self._precheck(files)
        if not result.ok:
            problems = "\n".join(f"- {f.name}: {f.detail}" for f in result.failures)
            act = self._ask(agent, prompt.ACT_INSTRUCTIONS.format(goal=goal, tool=tool, extra="")
                            + "\n\n" + prompt.REVIEW_INSTRUCTIONS.format(problems=problems), 3000)
            files = self._normalise_files(act, tool)
            result = self._precheck(files)
        if not result.ok:
            out.feedback.append("rejected before push — " + "; ".join(
                f"{f.name}: {f.detail.splitlines()[0] if f.detail else ''}" for f in result.failures))
            c.stress.on_rejected(agent, "static checks failed")
            out.action = "rejected-static"
            return out

        summary = str(act.get("summary", goal))[:120]
        deps = set()
        for rel, src in files.items():
            if config.is_impl_path(rel):
                deps |= tool_dependencies(src)
        out.branch = f"{config.AGENT_BRANCH_PREFIX}{agent}/{tool}-{uuid.uuid4().hex[:6]}"
        out.pr = c.submit(agent, out.branch, files, tool, summary, goal, sorted(deps))
        out.produced = True
        out.note = summary
        c.identity.note(agent, f"cycle {c.cycle_no}: {action} {tool} — {summary}",
                        c.cfg["prompt"]["max_narrative_chars"])
        return out

    def _escalate(self, out: Outcome, question: str) -> Outcome:
        if not question:
            out.action = "rest"
            return out
        number = self.ctx.escalate(out.agent, question)
        out.note = f"asked human in #{number}" if number else "asked human (dry run)"
        out.produced = True
        return out

    def _normalise_files(self, act: dict, tool: str) -> dict[str, str]:
        raw = act.get("files") or {}
        files: dict[str, str] = {}
        for rel, src in raw.items():
            rel = str(rel).replace("\\", "/").lstrip("./")
            if isinstance(src, str) and src.strip():
                files[rel] = src if src.endswith("\n") else src + "\n"
        # Tolerate the model naming files loosely; pin them to the convention.
        test_key = f"{config.TESTS_DIR}/test_{tool}.py"
        impl_key = f"{config.TOOLS_DIR}/{tool}.py"
        for rel in list(files):
            name = Path(rel).name
            if name == f"test_{tool}.py" and rel != test_key:
                files[test_key] = files.pop(rel)
            elif name == f"{tool}.py" and rel != impl_key:
                files[impl_key] = files.pop(rel)
        return files

    def _precheck(self, files: dict[str, str]) -> GateResult:
        result = GateResult(head="", base="", changed=list(files))
        static_checks(files, list(files), self.ctx.cfg, self.ctx.registry.data, result)
        if not any(config.is_test_path(p) for p in files) or not any(config.is_impl_path(p) for p in files):
            result.add("shape", False, "need exactly one test file and one implementation file")
        return result
