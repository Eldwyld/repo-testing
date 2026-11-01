# H. Testing strategy

| Layer | Tool | Location | Count |
|---|---|---|---|
| Upstream engine and classic plugins (unchanged) | Vitest + jsdom | `tests/engine`, `tests/game`, `tests/local` | 376 tests, all green before and after the fork |
| Forge unit tests (deterministic logic) | Vitest | `tests/forge/identity`, `narrative`, `events`, `config` | 86 |
| Forge integration tests (full runtime workflows, storage) | Vitest + fake-indexeddb | `tests/forge/runtime.test.ts` | 30 |
| Browser smoke test (built app) | Playwright + Chromium | `e2e/forge-smoke.cjs` | 1 scripted run |

Total: **42 test files, 492 tests, all passing.** In addition, `npm run lint` (`--max-warnings 0`), `tsc` and
`vite build` all pass.

## Coverage of the required areas

| Area | Where | What is asserted |
|---|---|---|
| Configuration validation | identity, config | nested error paths; defaults; strict unknown fields; every built-in validates; the default config compiles cleanly |
| Dictionary resolution | identity | explicit inheritance followed once; cycles and missing parents reported; disabled, intensity-gated, style-overridden and prohibited entries filtered; **empty dictionaries** → unresolved token reported |
| Gender and anatomy substitution | identity | verb conjugation by person and pronoun; derived plural and possessive forms; register chosen by style; `@register` and `.form` overrides; pronouns independent of anatomy; noun-vs-pronoun verb agreement; every identity × anatomy preview resolves |
| Narrative-style composition | narrative | strength 0 excludes a style; intensity windows; incompatible styles suppressed; conditional activation; excluded-phrase fallback; transitions; empty mix → null; every phrase renders for every identity |
| Hypno patterns | narrative | off by default; counting sequence; repetitions and max length; each pattern can be disabled; interval scales with intensity |
| Event weighting | events | observed ratio matches 9:1 weights; zero weights never chosen; dice strategy guarantees climax at 10; sequential and shuffle cover all candidates |
| Conditional evaluation | events | DSL precedence, `not`, `in`, `between`; round-trip with the formatter; missing fields; case-insensitive strings; malformed nodes evaluate false with an error; **contradictory conditions** detected |
| Loop limits | events | `loop.times` honoured; `loop.until` stops early; validator rejects unbounded cycles and self-loops; per-tick step cap aborts runaway loops |
| Event-chain termination | events | chain-depth limit aborts and the session keeps running; `terminateIf`; branches and groups followed; blocking prompt holds and resumes |
| Compliance-check accounting | runtime | random scheduling; answering; disabling mid-session; negative answers have no consequence unless configured; preview schedule respects gaps and excludes event-only checks |
| Punishment tally calculation | runtime | facts vs rules; safety pauses and termination never counted; opt-in pause rule; exclusion, correction, caps, weights, manual adjustment, checklist selection, accounting disabled |
| Session logging | runtime | valid record; stable unique ids; chronological; starts with `session_started`, ends with `session_ended`; replay metadata |
| Replay reconstruction | runtime | step curves; `valueAt`; `ReplayCursor` pause state at boundaries; ghost alignment window; **deterministic re-simulation matches**; honest limitations when the config is redacted or versions differ |
| Import and export | config, runtime | config round-trip; event-pack import with warnings; broken pack rejected with event id; JSON and CSV export; CSV formula-injection neutralised; exported session re-imports |
| Data migrations | config | v1 → v2; classic joi.how settings → Forge (pet-themed hypno dropped with a note); future versions rejected |
| Privacy controls | runtime | default export redacts free text and media ids; config exclusion clears `configEmbedded`; storage delete-one and delete-all |
| Pause and termination guarantees | runtime | terminate with a blocking required prompt open; no activity after end; pause freezes clock and events; scripts cannot raise intensity past the ceiling or identity max; live ceiling lowering; duration limit ends a paused session; scheduled breaks logged as safety |

## Edge cases explicitly covered

Empty dictionaries; contradictory conditions; missing media (a session runs with no images, and media
references are logged and never embedded); malformed imports (bad JSON, unknown `kind`, newer version, invalid
fields, `__proto__` keys, excluded vocabulary, non-object input); repeated events (`maxRepeats`,
`noRepeatWithin`, `data.count` for the repeated-events rule); interrupted sessions (`reproducibility` flags a
missing `endedAt`; leaving the page terminates and saves); corrupted stored config (falls back to defaults with
a note).

## Running

```bash
npm ci
```

```bash
npm test
```

```bash
npx vitest run tests/forge
```

```bash
npm run lint
```

```bash
npm run build && npx vite preview --port 4173
```

```bash
node e2e/forge-smoke.cjs
```

The last command needs a running preview server plus Playwright and Chromium, which are not npm dependencies
of the project.

## Not yet automated

- React component tests for individual editors. The UI is covered only by the browser smoke run, which visits
  all 20 setting categories, the event lab, search, reset, a full start → pause → resume → stop session, the
  autopsy with re-simulation, history, and classic mode.
- Visual regression and screen-reader testing.
- Toy (Intiface) behaviour in Forge mode. It is reused unchanged from upstream but not exercised here.
