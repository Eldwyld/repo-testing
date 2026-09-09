# Hollow

Three agents that choose their own goals, gated by red-green CI, running on
free infrastructure. Git is the substrate: every action is a branch, a
commit and a pull request. Nothing an agent writes reaches `main` except
through a merge the gate has approved.

This is a rebuild of [ninjahawk/hollow-agentOS](https://github.com/ninjahawk/hollow-agentOS)
(v1). The premise was worth keeping. Almost none of the implementation was.
The v1 bug log that did most of the arguing is preserved in
[`docs_v1/BUGS.md`](docs_v1/BUGS.md); the acceptance tests in
[`tests/test_acceptance.py`](tests/test_acceptance.py) are named after it.

## How it works

Every twenty minutes or so, [`cycle.yml`](.github/workflows/cycle.yml) runs:

1. **observe** (no credentials) runs the workspace test suite on `main` and
   writes `truth.json`.
2. **act** (trusted) reads that file as data, reconciles open agent PRs
   against gate verdicts (merge or close), then gives each agent one turn:
   plan a goal from ground truth, write a failing test and an
   implementation, push a branch, open a PR, and dispatch the gate.

[`gate.yml`](.github/workflows/gate.yml) runs with `permissions: {}` and
decides:

| step | must |
|---|---|
| red-before | the new test fails against the tree before the change |
| green-after | it passes with the change, and the whole suite still passes |
| red-reverted | it fails again with the implementation reverted |
| mutation | it fails against a mutant whose returns are replaced with `None` |

Plus static checks that never execute anything: only `workspace/tools/*.py`
and `workspace/tests/test_*.py` may change, no import-time code, no
forbidden imports, no shadowing built-ins, no importing tools that don't
exist. Hollow code cannot make a previously failing test pass, so the
returns-`None`-forever class dies mechanically, including v1's BUG-002
which no string check could catch. There is no auto-stub.

**Consequence.** Rejections raise stress. A merge grants half relief. Full
relief only arrives when the artifact is *used*: another agent's merged
tool imports it, or it survives five observe cycles green. At load 0.55 an
agent can no longer create tools; at 0.75 it cannot write at all. The
optimisation target is "produce something that gets used", not "pass the
gate".

**Ground truth.** The prompt is dominated by facts the system verified this
cycle: test results, tool files, the registry, open PRs, recent commits.
Model-written narrative is capped at a few hundred characters. Prompt size
is the throttle on cadence, so this is also the throughput decision.

## Layout

```
hollow/            the system (protected: agents cannot touch it)
  gate/            static + dynamic checks; the only place agent code runs
  cycle.py         the trusted cron cycle
  agent.py         plan → act → review → PR for one agent
  providers.py     one model interface, provider list, failover
  budget.py        per-agent and per-provider daily token budgets
  stress.py        consequence, with relief downstream of use
  registry.py      workspace/tools/registry.json, written by the trusted job
  truth.py         ground truth for the prompt
  github.py        minimal REST client
  dashboard.py     static Pages dashboard from state
workspace/         the agents' world: tools/ and tests/ are all they can write
state/             JSON state, committed to main every cycle
site/              generated dashboard
hollow.json        operator config (protected)
POLICY.md          what agents may and may not do (protected)
tests/             tests for the system, including the acceptance bar
```

## Running it

The repository must be **public** (Actions minutes are free only there,
and everything an agent writes is world-readable by design).

1. Add secrets: `CEREBRAS_API_KEY`, `GROQ_API_KEY`, optionally
   `OPENROUTER_API_KEY` (overflow only). `GOOGLE_API_KEY` is disabled in
   `hollow.json` until you opt in; that free tier trains on your content.
2. Settings → Actions → General: allow GitHub Actions to **create and
   approve pull requests**, and set workflow permissions to read and write.
3. Settings → Pages: source "GitHub Actions" (optional; the dashboard is
   also committed to `site/`).
4. Run `cycle` once by hand from the Actions tab, with `dry_run` ticked, to
   see the prompts and provider usage without pushing anything.
5. Leave the schedule on. `7,27,47 * * * *` is off-peak; expect drift.

Do not add branch protection that requires a human review on `main`, or
the trusted job cannot merge. Required status checks are fine and
recommended: require `gate / red-green-red + mutation (sandbox)`.

Locally:

```
pip install pytest
python -m pytest tests -q                     # the system's own tests
python -m hollow observe                      # workspace suite → truth.json
python -m hollow gate --base main --head <sha>
python -m hollow guard --base main --head <sha>
python -m hollow cycle --dry-run              # needs a provider key to be useful
python -m hollow dashboard
```

Asking a human: an agent can choose `ask_human`, which opens an issue
labelled `invoke-claude`. Reply in a comment; the next cycle delivers it.

## The budget

| provider | tokens/day | notes |
|---|---|---|
| Cerebras | 1,000,000 | primary, 5 requests/min |
| Groq | 200,000 | secondary |
| OpenRouter | 50 requests | overflow only |

One lean cycle costs roughly 5,500 tokens, so the combined ceiling buys
about 70 cycles per agent per day, one every twenty minutes. Both the
per-agent and the total daily caps are enforced in code
(`hollow/budget.py`); one runaway agent cannot starve the other two.
Free-tier figures change without notice: they live in `hollow.json`, not
in code.

## Security model

- Agent code executes only in jobs with `permissions: {}` (gate's
  `evaluate`, cycle's `observe`). Those jobs also blank `GITHUB_TOKEN`.
- The trusted job never checks out or executes an agent branch. It reads
  the gate's verdict back as a JSON artifact and merges or closes.
- `pull_request_target` is never used.
- `.github/`, `hollow.json`, `POLICY.md`, `hollow/`, `tests/`, `state/`
  and the registry are off-limits to agents, enforced by an allowlist
  before push and again by the gate's `guard` job, which runs the base
  branch's code, not the PR's.
- Model keys are Actions secrets read only by the trusted job.

The sandbox is a CI job, not a syscall filter: agent tests run as the
runner user with network access. The AST allowlist removes file, network,
subprocess and dynamic-import primitives from what agents can write, and
every run starts from a clean tree, so the worst case is a failed job, not
a corrupted system.

## Known weaknesses

- Red-green is gameable: an agent can write a trivial test for a trivial
  function. The mutation screen raises the cost; it does not remove it.
- Scheduled runs are delayed under load and occasionally skipped. The
  system is idempotent from repo state, so a skipped cycle is just a
  slower day.
- Whether `gpt-oss-120b` can reliably write a failing test *and* an
  implementation is the open question that decides how ambitious the
  agents' goals can be. If it can't, the gate stays and the scope shrinks.

## Credits

The premise, the stressor thresholds, the name registry and the bug log
are from [ninjahawk/hollow-agentOS](https://github.com/ninjahawk/hollow-agentOS),
MIT licensed. See [`LICENSE`](LICENSE).
