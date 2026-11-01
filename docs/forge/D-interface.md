# D. Interface specification

The routes are added next to the original ones. Classic mode stays at `/`, `/play` and `/end`.

| Route | Screen(s) covered |
|---|---|
| `/forge` | Dashboard and session setup (Setup tab), every settings editor (Settings tab), session history (History tab), import/export and presets (Import & export tab) |
| `/forge/play` | Active session |
| `/forge/history/:id` | Session autopsy, replay, accounting and export |

The 15 recommended screens map onto these as follows. The **identity editor**, **dictionary manager**,
**narrative-style editor**, **event-sequence editor**, **event testing/simulation** (Events › Lab), **media
configuration**, **prompt and check settings**, **accounting rules** and **general preferences**
(Safety, Accessibility, Recording) are all categories in the Settings tab. They are rendered from the
category registry.

## Discoverability of granular settings

- **Registry-driven navigation.** `config/registry.ts` lists 20 categories in 13 sections. The sidebar,
  unsaved-change dots, per-category **Reset category** and **Save as category preset** are all generated from
  this list. `registerCategory()` adds a category without UI changes. Categories without a dedicated editor get
  a validated JSON editor (`JsonCategoryEditor`).
- **Search.** The top-bar search scores category labels, keywords, field labels and help text, e.g. "ruin" →
  Pacing & intensity. Choosing a hit jumps to that category.
- **Progressive disclosure.** List → item → Fields/JSON tabs; JSON for advanced fields; `<details>` for the
  read-only built-in pack, Mermaid source and the annotation table.
- **Unsaved changes.** Draft and saved configs are kept separately. The top bar shows the count, Save and Discard.
  Each category shows a dot, and closing the tab with unsaved changes asks for confirmation (`beforeunload`).
  Saving validates the whole config and lists errors instead of storing invalid data.
- **Built-in vs override vs custom.** The badges are `builtin`, `override` and `custom`. Editing a built-in item
  creates an override. "Revert to built-in" deletes the override; "Delete" removes custom items.

## Reusable components (`ui/components.tsx`)

`Field`, `Toggle`, `TextField`, `NumberField` (bounds-checked, commits only valid values), `Slider`,
`RangeField` (min ≤ max), `Select`, `MultiSelect` (checkbox fieldset), `TagInput` (comma list),
`WeightedChoiceEditor` (weights with live probability share), `JsonEditor` (parse → schema → content guard →
extra semantic check before Apply), `ItemListEditor` (generic list/detail editor with duplicate, revert, delete
and a JSON tab), `ConditionField` (live DSL parse errors), `Card`, `Diagnostics` and `StepChart` (dependency-free
SVG step chart). Preset and import/export controls live on the Studio page.

## Screens

**Setup (dashboard).** A summary table of the active configuration: identity and person, pronouns, anatomy,
narrative mix (with conflicts), hypno, durations, pace, odds, event count or *invalid*, prompts, checks,
accounting, ceiling, duration limit, breaks and recording. Shortcut buttons lead to identity, tone, pacing and
safety. Below that sit presets (built-in and saved; Apply, Export, Delete; "Save current as preset"), the ghost
overlay picker, and **Start session**. With `confirmBeforeStart` on, an inline confirmation states the
boundaries: pause and stop are always available, prompts and checks can be skipped, the ceiling and limit
values, what is recorded, and 18+.

**Identity editor.** All profile fields, including a category datalist that allows new categories,
dictionaries, applicable styles, preferred and prohibited words, intensity limits and literal custom rules.
Below them is a **live preview**: sample sentences rendered with the current anatomy and pronoun override,
showing unresolved tokens and blocked terms, plus lint warnings (missing dictionaries, inheritance cycles,
"they" without plural verbs, words that are both preferred and prohibited, excluded terms).

**Dictionary manager.** Name, categories and explicit parents, then a filterable entries table (on, text,
category, weight, remove). Excluded terms are flagged inline. Intensity windows, per-entry styles and per-style
overrides are edited in JSON.

**Gender and body-part naming.** Session pronoun and person overrides; a pronoun-set editor (including
neopronouns and the plural-verb flag); an anatomy profile picker and editor (action verb; per part the default
register and a terms table with singular, plural, possessive, register and weight). None of these settings
infers another.

**Narrative styles.** The style mix uses one strength slider per style and lists conflicts. Each style
category (registers; encouragement and praise; objectification; humiliation and degradation, off by default)
has enable, frequency, weight, intensity range, activation condition, incompatibility, vocabulary, excluded
phrases and a phrase table. **Hypno** has enable, intervals, transition frequency and a per-pattern table
(on, weight, repetitions, variation, max length, custom lines), with a no-psychological-claims disclaimer.

**Event-sequence editor.** Tabs:
- *Events*: selection strategy and limits; a table with enable, weight override and the condition in DSL form.
- *Packs*: raw JSON per pack, validated live through `compilePack`, with errors naming the event; new pack; copy
  the built-in pack as a template.
- *Graph*: an edge table plus Mermaid source.
- *Lab*: an eligibility explainer (intensity, phase and pauses → per-event reason), a dry-run simulator (seconds,
  seed → timeline) and a condition tester (expression and scope → result and trace).
- *Reference*: fields, operators, step kinds and limits.

**Prompts and checks.** Global enable. For each prompt: triggers, required/blocking, length limits,
vocabulary mode, perspective, retries, timeout and resume. For each check: kind, text, a responses table (value,
optional statistic), schedule, phases, condition, timeout, unanswered policy and an *optional* negative-answer
event. **Preview 15-minute schedule** runs the scheduler without starting a session.

**Accounting rules.** Enable, opt-in for safety pauses, and rules (types, include/exclude conditions, points,
cap, polarity, notes).

**Active session.** The upstream slideshow and stroke meter. A status panel shows identity, phase or status,
● REC, intensity against the ceiling, pace, grip, tone, the running event, elapsed time and limit, and the ghost
values and upcoming markers. Narration and messages (aria-live), hypno lines (hidden with reduced motion),
prompt and check dialogs, and the scheduled-break notice appear as overlays. A **persistent toolbar** holds
Pause/Resume, "I need a break" (safety pause, never counted), Lower ceiling, Checks off, Prompts off and
**Stop session**. Esc pauses through the upstream key handler. State transitions:
`running ⇄ paused` (user), `running → break → running` (scheduled), `* → ended` (stop, climax/end step,
duration limit). Ending saves the record when recording is on, then opens the autopsy.

**History.** Session list (start, duration, end reason, identity), Open, Delete, Delete all (with confirmation).

**Autopsy and replay.** A summary and significant moments; intensity and pace step charts with pause and
milestone markers; a filterable event log (types, intensity range, style, media tag, identity, text). **Replay**
has play at 4×, step to the previous or next event, a scrubber and a reconstructed state table. **Deterministic
re-simulation** lists its limitations and compares the re-run with the log. **Accounting** shows the facts table,
the rule checklist (include/exclude per rule), totals with explanations, manual adjustments, and per-record
exclude, correct and note. **Export** offers redaction toggles (free text, config, media ids, narration),
JSON or CSV, and a live preview of exactly what will be written.

**Import and export.** Export the config. Import any Forge document or classic joi.how settings, with
validation errors listed. "Import classic settings" reads the original app's `localStorage`.

## Accessibility

The visual theme follows the Sticker World style bible (Pastel Cloud by default, plus Neon Riot and the original Midnight); see [J-sticker-theme.md](J-sticker-theme.md).


Every control is a labelled native element, and tables use header cells. Focus is visible (`:focus-visible`).
Narration and validation feedback use `aria-live`/`role=status`. Touch targets in the session toolbar are at
least 44 px, and the layout is responsive (the sidebar collapses under 800 px). The reduced-motion option
follows the system or can be forced on or off. Text size scales from 75% to 200%, there is a high-contrast mode,
and a reading-time multiplier lengthens how long narration stays on screen.
