# JOI Forge — documentation

JOI Forge is a fork of [joi.how](https://github.com/clynamic/joi.how) (GPL-3.0). It adds a
user-configurable session engine with identity profiles, terminology dictionaries, composable narrative
styles, a programmable event engine, event-triggered prompts, compliance checks, transparent accounting,
and full session logging and replay. Everything is local-first: there is no server, sync or telemetry.

| Section | Document |
|---|---|
| A. Existing application audit | [A-audit.md](A-audit.md) |
| B. Architecture and implementation plan | [B-architecture.md](B-architecture.md) |
| C. Data schemas | [C-schemas.md](C-schemas.md) |
| D. Interface specification | [D-interface.md](D-interface.md) |
| E. Working implementation | this page (below) |
| F. Event engine demonstration | [F-event-engine-demo.md](F-event-engine-demo.md) |
| G. Session logging and replay demonstration | [G-logging-replay-demo.md](G-logging-replay-demo.md) |
| H. Testing strategy | [H-testing.md](H-testing.md) |
| I. Delivery checklist | [I-delivery-checklist.md](I-delivery-checklist.md) |
| J. Sticker World UI theme | [J-sticker-theme.md](J-sticker-theme.md) |

## Quick start

Requires Node ≥ 20.

```bash
npm ci
```

```bash
npm run dev
```

Then open <http://localhost:5224/forge>. Classic mode is still at `/`.

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build && npm run preview
```

No new runtime dependencies were added. Forge uses packages already in upstream (`react`, `react-router-dom`,
`idb`). Validation, the DSL parser, the RNG and the charts are written in-house.

## E. Working implementation — increments

Each increment was committed separately. Each was type-checked and tested before the next one started.

| # | Commit subject | Files | Responsibility |
|---|---|---|---|
| 1 | core validation, seeded RNG, templates, content guard, identity engine | `src/forge/core/*`, `content/guard.ts`, `identity/*`, `tests/forge/identity.test.ts` | Validation with path errors; reproducible randomness; token templates; excluded-term guard; identities, pronouns, anatomy, dictionaries, rendering, preview, lint |
| 2 | narrative styles, hypnosis-inspired patterns, conditions and DSL | `narrative/*`, `events/conditions.ts`, `events/dsl.ts`, `tests/forge/narrative.test.ts` | Style mix composition and hypno patterns; condition trees and the restricted parser |
| 3 | programmable event engine | `events/types.ts`, `validate.ts`, `runner.ts`, `builtins.ts`, `tests/forge/events.test.ts` | Schema, load-time validation, pure interpreter, the original dice ported to data |
| 4 | prompts, checks, accounting, session log/analysis/replay/export, config, storage, runtime | `prompts`, `checks`, `accounting`, `session/*`, `config/*`, `storage`, `runtime/*`, `tests/forge/config.test.ts`, `runtime.test.ts` | Everything after the engine, plus the `SessionRuntime` safety contract |
| 5 | game-engine bridge, Studio UI, session page, autopsy UI; petplay removal | `src/game/plugins/forge.ts`, `src/forge/ui/*`, `src/app/App.tsx`, classic terminology files | Integration with the upstream engine, all screens, routes, classic cleanup |
| 6 | docs, SceneBridge fix, browser smoke test | `docs/forge/*`, `src/game/SceneBridge.tsx`, `e2e/forge-smoke.cjs` | Documentation and end-to-end verification |
| 7 | Sticker World theme (Pastel Cloud / Neon Riot) | `src/forge/ui/theme-sticker.css`, `StickerEmblem.tsx`, `accessibility.theme` | UI restyled to the Sticker Style Bible |

The status of every feature (Complete / Partial / Planned) is in the [delivery checklist](I-delivery-checklist.md).

## Source layout

```
src/forge/
  core/        validate.ts · rng.ts · template.ts
  content/     guard.ts
  identity/    types.ts · grammar.ts · resolve.ts · render.ts · builtins.ts
  narrative/   types.ts · compose.ts · builtins.ts
  events/      conditions.ts · dsl.ts · types.ts · validate.ts · runner.ts · graph.ts · builtins.ts
  prompts/     prompts.ts
  checks/      checks.ts
  accounting/  accounting.ts
  session/     types.ts · recorder.ts · analysis.ts · replay.ts · export.ts
  config/      schema.ts · library.ts · registry.ts · presets.ts · migrations.ts · io.ts
  runtime/     runtime.ts · simulate.ts
  storage/     store.ts
  ui/          StudioPage · editors · EventEditor · ForgeGamePage · AutopsyPage · components · …
src/game/plugins/forge.ts     # upstream Mode + bridge module
```

## Extending without code changes

- **New identity**: Settings › Identity profiles › New (or import JSON). Any category name is allowed.
- **New dictionary or vocabulary**: Settings › Dictionaries. Attach it to identities; inheritance is explicit.
- **New tone**: edit any style's phrase pool, or add a style via JSON import of a config.
- **New events or sequences**: Settings › Events › Packs. Write JSON (with DSL conditions), validated live, and test in the Lab.
- **New settings category (developers)**: call `registerCategory({...})`. It appears in navigation, search, reset and presets automatically, with a validated JSON editor as the fallback UI.

## Content and safety notes

Adult content for consenting adults. Petplay and animal-role vocabulary is excluded by a fixed guard that
users can extend but never shrink. Hypnosis-inspired narration consists of text patterns only; the app
makes no claim about trance or psychological effects. Pause and stop always work. Event scripts cannot
override pause, termination, privacy or intensity limits.
