# A. Existing application audit

**Source of truth.** The original app at <https://joi.clynamic.net/> is open source:
[`clynamic/joi.how`](https://github.com/clynamic/joi.how), licensed **GPL-3.0**. This fork is a
repository-level fork of upstream commit `41978da` (2026-10-18, "removed unused dependencies", v3.0.1).
Git history is kept, and the remote is named `upstream`.

Evidence used:

| Evidence | What it established |
|---|---|
| `curl https://joi.clynamic.net/` | Deployed page title "JOI.how", description "jack-off-instruction stroke-to-the-beat slideshow", a single Vite bundle. This matches the repository's `index.html`. |
| Repository source (all files read where relevant) | Stack, architecture, settings, engine, plugins and tests. |
| `npm ci`, `vitest run`, `tsc` on the unmodified clone | Baseline: 37 test files and 376 tests pass, and the typecheck is clean. |

I did not inspect the deployed site's backend; it has none (see below). I did not run the deployed site
interactively. Behaviour described below comes from the source code, unless it is marked *inferred*.

## Stack (observed in `package.json` and the source)

- React 18, TypeScript 5 (strict), Vite 5, styled-components, Web Awesome / Lit web components, framer-motion, recharts.
- State and engine: a custom functional **pipe engine** (`src/engine`). A fixed-step tick (16 ms) runs a composed
  `Pipe = (frame) => frame` over an immutable frame. Plugins and modules (`definePlugin`, `ModuleManager`)
  provide `activate/update/deactivate` pipes. An event bus (`Events`), a timeline scheduler (`Scheduler`),
  side-effect performers (`Effects`) and lens paths (`typedPath`) complete it.
- Randomness: the `core.rand` plugin uses a seeded Park–Miller LCG, stored in the frame and in saves.
- Persistence: `localStorage` for settings (key `settings`) and saves (`core.saves.*`). IndexedDB (`idb`) for
  local image imports. There is no backend: the app is local-first and client-only, and a service worker makes it a PWA.
- Media services: an e621 tag search (axios), local file import (with resizing via `pica`), and Walltaker.
- Hardware: Intiface/`buttplug` toy integration (vibrate, linear and oscillate actuators).
- Tests: Vitest with jsdom and fake-indexeddb.

## Primary workflows (observed)

1. **Home page** (`/`): age warning, settings panels, then **Start** (requires images).
2. **Game** (`/play`): image slideshow, a stroke-to-the-beat meter, pace and grip instructions, messages with
   prompt buttons, hypnosis words, an emergency "calm down" stop, a pause menu (Esc) and a resume countdown.
3. **End** (`/end`): climax result (`climax | denied | ruined`) and a pace timeline chart.

## Session lifecycle (observed)

- Modes: `core.mode` registers modes; only `classic` exists upstream. Entering a mode loads its modules
  (Clock, Intensity, Pace, Stroke, RandomImages, Hypno, Dealer, Warmup, EmergencyStop, Cues).
- Phases: `warmup → active ⇄ break → finale → climax`. Warm-up waits for "I'm ready" or a timer.
- Pause: `core.pause` sets the `PLAY_TIMELINE` rate to 0. Resuming runs a 3-2-1 countdown.
- Intensity: rises linearly from 0 to 1 over `gameDuration`, and only in the active phase.
- Saves: autosave every 10 s while in the game scene. The classic slot is restored on load.

## Randomness, dice and events (observed in `game/plugins/dealer.ts`)

Every second, the dealer filters eight hard-coded outcomes by the enabled events and by intensity gates. A
"chance" of `1` is guaranteed (climax at 100% intensity). Otherwise it rolls `v ∈ [0,1)` and sums `1/chance`
until the sum exceeds `v`. The chances are 10, 25, 50, a function of intensity, 50, 50 and 30. Each outcome is a
hand-written TypeScript `Sequence` (message, countdown, set pace, and so on). The event set is a fixed enum
`DiceEvent`. Users can only switch outcomes on or off.

## Media

`ImageItem {id, service, type, thumbnail, preview, full, source}`. The slideshow switches images on an
interval that shortens with intensity. Items carry **no tags** after loading; e621 tags are used only for
the search query.

## Settings categories (observed in `SettingsSection.tsx`)

Pace (min, max, steepness, timeshift), Duration (game, warm-up), Player (gender, body), Events (enum toggles),
Hypno (off, joi, breeding, maledom-pet, femdom-pet), Climax (climax and ruin chance), Board, Service (e621,
local, Walltaker), Images (resolution, sound, duration, intensity), Toys, Trade (settings import/export), and
Plugins (install JavaScript plugins).

Terminology is a fixed `$token` interpolation: `$player` = boy, girl or **pup**; `$master`; `$hands` =
hands or **paws**; `$part` = cock, pussy or mound; `$stroke` = stroke or **paw**.

## Feature inventory

| Feature | Status in fork | Notes |
|---|---|---|
| Pipe engine, plugins, scheduler, events, effects | **Existing and reusable** | Unchanged. Forge mode is registered as a new upstream `Mode`. |
| Stroke meter, slideshow, sound cues, toy integration, resume countdown | **Existing and reusable** | Reused as-is on the Forge session page. |
| e621, local and Walltaker media services | **Existing and reusable** | Unchanged. The media id is `service:id`. |
| Classic mode (dice, hypno, warm-up, end page) | **Existing but requiring modification** | Kept working. Pet terminology removed (see below). |
| Seeded RNG | **Existing but requiring modification** | Forge uses its own serialisable mulberry32 `Rng`, so replay is independent of frame saves. |
| Settings import/export (Trade) | **Existing but requiring modification** | Forge import also accepts classic `settings` JSON and migrates it (`fromJoiSettings`). |
| `SceneBridge` route↔scene sync | **Existing but requiring modification** | Fixed a race: a stale scene could redirect a route change (found by the end-to-end run). |
| Gender/body terminology | **Existing but requiring modification** | Replaced in Forge by independent pronoun, presentation and anatomy profiles. |
| Hard-coded dice events | **Replaced** (in Forge mode) | Data-driven event packs. The eight originals are ported to data with the original odds (`dice` strategy). |
| Configuration hierarchy, presets, versioning, migrations | **New** | |
| Identity profiles, dictionaries and narrative styles | **New** | |
| Event engine, DSL, validation and dry-run | **New** | |
| Prompts, compliance checks and accounting | **New** | |
| Session log, autopsy, replay and ghost overlay | **New** | |
| Pet identities, pet commands and pet-themed presets | **Explicitly excluded** | Enforced by a fixed content guard. |
| Executing user-supplied JavaScript for *event definitions* | **Explicitly excluded** | Events are data plus a restricted DSL. The upstream JS **plugin installer** remains as an upstream developer feature. Forge never loads event code through it. |
| Cloud sync, remote sharing, telemetry | **Explicitly excluded** | Not part of the existing architecture. |

### Pet terminology removed from classic mode

`gender.other` "(they/them/pup)" now reads "(they/them)". `$player` for "other" is now "toy". `$hands` "paws"
is now "hands". `$stroke` "paw" is now "rub" or "touch". Event descriptions "Paw at…" now read "Stroke at…".
The hypno labels "Maledom/Femdom Pet" become "Maledom/Femdom", with the pet descriptions rewritten and
"hump" and "animal" removed. The animal icons (otter, cow, dog, cat) were replaced. The `Paws` grip
identifiers were renamed to `Hands`; the frame key is `core.dice.hands`, so the grip in an *old classic
save* defaults to "both".

## Assumptions and gaps

- *Inferred:* the deployed site runs the same commit, based on a matching title and description. This was not verified byte-for-byte.
- No user accounts or server exist, so "fork" means repository-level only. No server-side data was involved.
