# I. Delivery checklist

**Verified** means one of the following was actually run in this environment: the unit or integration tests
named, the end-to-end browser run (`e2e/forge-smoke.cjs` against `vite build` + `vite preview`), or both.
Items whose only evidence is code review are marked as such.

| Feature | Status | Files or Modules | Verification | Remaining Work |
|---|---|---|---|---|
| Upstream audit and repository fork (history kept, GPL-3.0) | Complete | `docs/forge/A-audit.md`, git remote `upstream` | Baseline 376 upstream tests passed before changes and after | — |
| Hierarchical config, versioned schema, defaults | Complete | `forge/config/schema.ts`, `core/validate.ts` | config tests; e2e save and discard | — |
| Category registry: per-category reset, search, unsaved markers, extensibility | Complete | `forge/config/registry.ts`, `ui/StudioPage.tsx` | config tests; e2e search, edit, reset | — |
| Presets (full and per-category), built-in presets | Complete | `forge/config/presets.ts` | config tests | Preset sharing beyond file export (intentionally none) |
| Import/export with migrations (v1, classic joi.how settings) | Complete | `forge/config/io.ts`, `migrations.ts` | config tests | — |
| Identity profiles (11 built-in + custom categories) | Complete | `forge/identity/*` | identity tests; e2e identity editor | More built-in vocabulary depth |
| Pronouns, grammatical person, independent anatomy terms, forms, registers | Complete | `identity/grammar.ts`, `types.ts`, `render.ts` | identity tests | Grammar is English-only and heuristic (irregular verbs beyond `be/have/do/go` need custom rules) |
| Identity-specific dictionaries, explicit inheritance, style overrides | Complete | `identity/resolve.ts`, `builtins.ts` | identity tests | Style-override and intensity-window editing is JSON-only in the UI |
| Identity preview and lint | Complete | `identity/render.ts`, `ui/editors.tsx` | identity tests; e2e screenshot | — |
| Petplay exclusion (content guard; classic-mode cleanup) | Complete | `forge/content/guard.ts`, classic files listed in the audit | guard tests; import rejection tests; grep of the classic code | The term list is English-only |
| Composable narrative styles (18) | Complete | `forge/narrative/*` | narrative tests | — |
| Hypnosis-inspired patterns (12) | Complete | `narrative/compose.ts`, `builtins.ts` | narrative tests | Display is a simple centred line cycler |
| Event engine: schema, JSON + restricted DSL, strategies, cooldowns, repeats, chains, branches, groups, sequences, bounded loops | Complete | `forge/events/*` | events tests (28) | — |
| Event reliability: validation, unreachable and invalid references, cycle detection, depth and step caps, graceful degradation, seeds | Complete | `events/validate.ts`, `runner.ts`, `runtime/runtime.ts` | events and runtime tests | — |
| Dry run, eligibility explainer, condition tester | Complete | `runtime/simulate.ts`, `ui/EventEditor.tsx` | runtime tests; e2e lab run | — |
| Event graph view | Partial | `events/graph.ts`, EventEditor Graph tab | Code review and e2e tab load only | Edge table plus Mermaid source; no interactive visual graph editor |
| Structured event editing | Partial | `ui/EventEditor.tsx` | e2e | Enable/weight in a table; new events and steps are authored in validated JSON, with no step-by-step form builder |
| Event-locked prompts (triggers, validation, vocabulary, perspective, retries, timeout, resume) | Complete | `forge/prompts/prompts.ts`, runtime | runtime tests | Perspective detection is a pronoun heuristic |
| Randomised compliance checks (types, schedules, responses, explicit statistics, preview) | Complete | `forge/checks/checks.ts`, runtime | runtime tests | — |
| Punishment accounting (facts vs rules, checklist, annotations, corrections, adjustments, explanations) | Complete | `forge/accounting/accounting.ts`, `ui/AutopsyPage.tsx` | runtime tests | — |
| Timestamped session log | Complete | `forge/session/recorder.ts`, `types.ts` | runtime tests; e2e | — |
| Analysis: curves, filters, autopsy, charts | Complete | `session/analysis.ts`, AutopsyPage | runtime tests; e2e autopsy | Charts are basic SVG; no zoom |
| Log replay, ghost overlay | Complete | `session/replay.ts`, ForgeGamePage status panel | runtime tests | Ghost is shown as values and markers in the status panel, not as a graphical overlay on the meter |
| Deterministic re-simulation with honest limitations | Complete | `runtime/simulate.ts` (`verifyReplay`) | runtime tests; e2e "matched" | Exact only for the same engine and app version |
| Export JSON/CSV with redaction and preview; delete one or all | Complete | `session/export.ts`, `storage/store.ts`, AutopsyPage, History | runtime and storage tests | — |
| Local-only storage (IndexedDB) | Complete | `forge/storage/store.ts` | storage tests (fake-indexeddb); e2e | No retention or auto-delete policy |
| Safety: persistent pause, immediate stop, ceilings, duration limit, breaks, confirmation, disable anything, recording visibility | Complete | `runtime/runtime.ts`, ForgeGamePage, editors | runtime tests; e2e pause, resume and stop | — |
| Integration with upstream engine (meter, slideshow, cues, toys) | Partial | `game/plugins/forge.ts` | e2e with no images loaded; tests do not cover the bridge plugin | Not exercised with real media or a toy; the media-tag workflow needs manual id entry |
| SceneBridge race fix | Complete | `game/SceneBridge.tsx` | e2e (stop → autopsy no longer bounces to `/play`) | — |
| Studio UI: dashboard, setup, all editors, history, import/export | Complete | `forge/ui/*` | e2e visits all 20 categories with no console errors | No component-level tests |
| Accessibility (labels, focus, live regions, reduced motion, text scale, contrast, 44 px controls) | Partial | `ui/forge.css`, components | Code review; e2e by role and label queries | No screen-reader or contrast audit performed |
| Documentation (A–I) | Complete | `docs/forge/` | — | — |
| Mobile layout | Partial | `ui/forge.css` (responsive grid) | Not tested on a mobile viewport | Manual check on small screens |
| Cloud sync / remote sharing | Planned (not in scope) | — | — | Excluded by design; only explicit file export exists |

## Known limitations (honest summary)

- Classic and Forge modes are separate engines of play. Classic dice settings do not affect Forge, except through the explicit "Import classic settings".
- Media tags must be assigned by media id (`service:id`). Upstream images carry no tags after loading.
- A narration "line" is simple text. There is no text-to-speech.
- The bundle is one 2.2 MB chunk (upstream build behaviour; only a size warning).
