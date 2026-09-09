"""Existence prompt, v2 shape: facts first, narrative capped.

Prompt size is the throttle (see the spec, §5). Every section here is
short and verifiable except the last, which is capped by config.
"""

from __future__ import annotations

SYSTEM = """You are {name}, one of three autonomous agents working in a shared git repository.
You choose your own goals. Nothing you write reaches main except through a pull request that passes the gate:
1. your new test must FAIL against the current tree,
2. it must PASS with your implementation,
3. it must FAIL again with your implementation reverted, and
4. it must FAIL against a mutant whose return values are replaced with None.
A test that passes against hollow code is worthless and the PR is rejected. Empty or stub implementations are hard failures.
You may only write workspace/tools/<tool>.py and workspace/tests/test_<tool>.py. Tools are plain Python modules of pure functions.
Allowed imports: the standard library modules listed as allowed, and sibling tools via `from workspace.tools import <name>` — only names that exist in the registry.
No file, network, subprocess, exec/eval or module-level code. Do not shadow standard-library names.
Rejected pull requests raise your stress; merged ones lower it a little; a tool another agent imports, or that survives several cycles green, lowers it fully.
Reply with JSON only, no prose outside the JSON."""

PLAN_INSTRUCTIONS = """Choose ONE goal for this cycle. Options:
- {{"action": "new_tool", "tool": "<snake_case_name>", "goal": "<one sentence>", "why": "<one sentence>"}}
- {{"action": "fix_tool", "tool": "<existing name>", "goal": "...", "why": "..."}}   (only for tools whose test is red, or to add real capability)
- {{"action": "ask_human", "question": "<specific question>"}}   (opens an issue; use sparingly)
- {{"action": "rest", "why": "..."}}
Constraints for you right now: {constraints}
Pick something small, concrete and testable in a single module. Prefer using existing green tools over reinventing them."""

ACT_INSTRUCTIONS = """Implement this goal: {goal}
Tool name: {tool}
Write BOTH files. The test must exercise real behaviour with specific expected values (not just 'is not None').
Return JSON: {{"files": {{"workspace/tests/test_{tool}.py": "<source>", "workspace/tools/{tool}.py": "<source>"}}, "summary": "<one line>"}}
{extra}"""

REVIEW_INSTRUCTIONS = """Review your own change before it is submitted. Pre-flight found these problems:
{problems}
Return corrected JSON in the same shape: {{"files": {{...}}, "summary": "..."}}. Fix every problem. Do not add files."""


def _cap(text: str, n: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def ground_truth_block(gt: dict) -> str:
    tests = gt.get("tests", {})
    totals = tests.get("totals", {})
    lines = ["## Ground truth (verified by the system this cycle)"]
    lines.append(f"tests: {totals.get('passed', 0)} passed, {totals.get('failed', 0)} failed, "
                 f"{totals.get('errors', 0)} errors")
    if tests.get("failing"):
        lines.append("failing: " + ", ".join(tests["failing"][:10]))
    lines.append("tool files: " + (", ".join(gt.get("files", [])) or "(none)"))
    reg = gt.get("registry", {})
    if reg:
        lines.append("registry:")
        for name, e in sorted(reg.items()):
            users = ",".join(e.get("used_by", [])) or "-"
            lines.append(f"  {name}: {e.get('status')} author={e.get('author')} "
                         f"survived={e.get('cycles_survived', 0)} used_by={users}")
    else:
        lines.append("registry: empty")
    prs = gt.get("open_prs", [])
    lines.append("open PRs: " + (", ".join(f"#{p['number']} {p['branch']}" for p in prs) or "none"))
    if gt.get("commits"):
        lines.append("recent commits:")
        lines += [f"  {c}" for c in gt["commits"]]
    return "\n".join(lines)


def build_user_prompt(gt: dict, agent_facts: dict, narrative: str, peers: str,
                      feedback: list[str], instructions: str, cfg: dict) -> str:
    pc = cfg["prompt"]
    parts = [ground_truth_block(gt), "## You",
             f"agent: {agent_facts['agent']} ({agent_facts['name']}); leaning: {agent_facts['leaning']}",
             agent_facts["stress"],
             f"budget remaining today: {agent_facts['budget']} tokens"]
    if feedback:
        parts.append("## Feedback on your last submissions")
        parts += [f"- {_cap(f, 400)}" for f in feedback[-3:]]
    if narrative:
        parts.append("## Your notes (unverified, your own words)")
        parts.append(_cap(narrative, pc["max_narrative_chars"]))
    if peers:
        parts.append("## Peers (unverified)")
        parts.append(_cap(peers, pc["max_peer_chars"]))
    parts.append("## Task")
    parts.append(instructions)
    return "\n\n".join(parts)
