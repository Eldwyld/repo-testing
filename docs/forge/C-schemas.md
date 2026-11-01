# C. Data schemas

**Source of truth:** the validators in code. TypeScript types are *inferred* from them (`Infer<typeof xV>`),
so the types and the runtime validation cannot drift apart. The interfaces below are a readable summary;
`?` marks optional fields, and `= x` is the default the validator fills in when a field is missing.

All top-level documents carry `kind` and `schemaVersion`:

| Document | `kind` | Current version | Validator | Migration |
|---|---|---|---|---|
| Configuration | `forge.config` | 2 | `forgeConfigV` (`config/schema.ts`) | `migrateConfig` (v1→v2), `fromJoiSettings` (classic) |
| Preset | `forge.preset` | 1 | `presetV` (`config/presets.ts`) | newer version → rejected |
| Event pack | `forge.eventPack` | 1 | `eventPackV` + `compilePack` (`events/*`) | newer version → rejected |
| Session record | `forge.session` | 1 | `sessionRecordV` (`session/types.ts`) | newer version → rejected |

Validation rules that apply everywhere:

- **Ids** match `/^[a-z0-9][a-z0-9_.:-]{0,79}$/i`.
- **Intensity** uses a 0–10 scale. Range objects require `min ≤ max`.
- **Unknown keys** are rejected inside conditions and steps (strict). They are dropped elsewhere.
- **Reserved keys** `__proto__`, `constructor` and `prototype` are rejected inside records.
- **Size limits:** every array has a maximum length, and imports are capped at 10 MB.
- **Content guard:** every string, and every object key, is scanned for excluded petplay or animal-role terms.

## Identity, terminology and dictionaries (`identity/types.ts`)

```ts
type GrammaticalPerson = 'first' | 'second' | 'third';
type TermRegister = 'anatomical' | 'clinical' | 'euphemism' | 'explicit' | 'symbolic' | 'object' | 'custom';
interface TermForms { singular: string; plural?: string; possessive?: string; pluralPossessive?: string } // blanks are derived

interface PronounSet {
  id: string; label: string;
  subject: string; object: string; possessiveDeterminer: string; possessivePronoun: string; reflexive: string;
  pluralVerbs: boolean = false;           // "they are"
}

interface TermEntry { id: string; forms: TermForms; register: TermRegister; weight: number = 1; enabled: boolean = true; styles: string[] = [] }
interface BodyPartConfig {
  partId: string; label: string; enabled: boolean = true;
  defaultRegister: TermRegister;
  styleRegisters: Record<styleId, TermRegister> = {};   // e.g. clinical_detachment → clinical
  terms: TermEntry[];
}
interface AnatomyProfile {                 // independent of identity and gender presentation
  id: string; name: string; description: string = ''; actionVerb: string = 'stroke';
  parts: BodyPartConfig[]; builtin?: boolean;
}

interface DictionaryEntry {
  id: string; text: string; category: string;     // semantic category, e.g. "materials"
  weight: number = 1; enabled: boolean = true;
  intensity?: { min: number; max: number };       // only used inside this window
  styles: string[] = [];                          // restrict to narrative styles
  plural?: string;
}
interface Dictionary {
  id: string; name: string; description: string = '';
  categories: string[] = [];
  extends: string[] = [];                         // explicit inheritance only; cycles reported, never followed
  entries: DictionaryEntry[];
  styleOverrides: Record<styleId, { disable: entryId[]; categoryWeights: Record<category, number> }> = {};
  builtin?: boolean;
}

interface IdentityProfile {
  id: string; displayName: string;
  category: string;                              // /^[a-z0-9_]+$/; built-in or user-defined
  description: string = '';
  pronouns: PronounSet; person: GrammaticalPerson = 'second';
  presentation: { mode: 'gendered' | 'neutral' | 'custom'; noun: string; label: string };
  objectNoun: TermForms;                          // {object}
  bodyOverrides: BodyPartConfig[] = [];           // identity-specific body vocabulary (doll skin → porcelain)
  dictionaries: string[] = [];
  preferredWords: string[] = []; prohibitedWords: string[] = [];
  perspective: { narrator: string; voice: 'direct' | 'observational' | 'ceremonial' | 'mechanical' };
  styles: string[] = []; eventTags: string[] = [];   // [] = all
  intensity: { min: number; max: number };        // clamps session intensity
  rules: { id: string; enabled: boolean; find: string; replace: string }[] = [];  // literal, whole word
  presets: string[] = []; builtin?: boolean;
}
```

**Narration tokens** (resolved by `identity/render.ts`): `{subject}` `{they}` `{them}` `{their}` `{theirs}`
`{themself}` `{is}` `{was}` `{has}` `{verb:remain}` `{object}` `{object:plural|possessive}` `{noun}` `{name}`
`{narrator}` `{action}` `{actioning}` `{hands}` `{part:<id>[.form][@register]}` `{term:<category>[.plural]}`
`{pick:a|b|c}`, plus variables such as `{pace}` `{intensity}` `{phase}` `{grip}` `{count}`. Capitalised
(`{Subject}`) and upper-case (`{HANDS}`) spellings change the casing of the result. Verb agreement follows the
most recent subject token, so "The subject *is* … They *are* …" both come out right.

## Narrative styles (`narrative/types.ts`)

```ts
interface Phrase { id: string; text: string; weight: number = 1; enabled: boolean = true; intensity?: Range; identities: string[] = [] }
interface NarrativeStyle {
  id: string; name: string; description: string = '';
  family: 'tone' | 'register' | 'structure' = 'tone';
  enabled: boolean = true; intensity: Range;
  frequency: number = 1;        // 0..1 probability of use when eligible
  weight: number = 1;           // × session strength
  phrases: Phrase[]; vocabulary: string[] = []; excluded: string[] = [];
  activation?: Condition;       // conditional activation
  incompatibleWith: string[] = [];   // the weaker style is suppressed
  transitions: { to: string; template: string }[] = [];
}
interface StyleMixEntry { styleId: string; strength: number /* 0..1 */ }
interface HypnoConfig {
  enabled: boolean = false; intervalAtMin: number = 4; intervalAtMax: number = 1.2; transitionFrequency: number = 0.15;
  patterns: { id: HypnoPatternId; enabled: boolean; weight: number; intensity: Range;
              repetitions: number /*1..20*/; variation: number /*0..1*/; maxLength: number; lines: string[] }[];
}
```

## Conditions (`events/conditions.ts`, `events/dsl.ts`)

```ts
type Operator = 'equals' | 'notEquals' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual'
              | 'in' | 'notIn' | 'contains' | 'notContains' | 'exists' | 'notExists' | 'between';
type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { field: string; operator: Operator; value?: Scalar | Scalar[] };
// Value rules: in/notIn need an array; between needs [min,max] with min ≤ max; greater/less need a number.
// Limits: nesting depth ≤ 12 and ≤ 200 nodes. Unknown field roots produce a warning and evaluate as missing.
```

Field roots: `session.*` (intensity, pace, phase, elapsedSeconds, pauses, checks.*, prompts.*), `identity.*`,
`styles.active`, `media.tags`, `history.*` (last, recent, count.<id>, total), `stats.*`, `vars.*`,
`answers.<checkId|promptId>` and `event.iteration`. Anywhere a condition is accepted, it may be written as a
DSL string, e.g. `session.intensity >= 4 and not (history.last == "pause")`. The string is parsed into the
tree above.

## Events (`events/types.ts`)

```ts
type Step =                                     // discriminated by `do`, strict
  | { do: 'narrate'; template?: string; styles: string[] = []; durationSeconds: number = 5 }
  | { do: 'message'; title: string; description?: string; durationSeconds?: number }
  | { do: 'setPace'; value?: number; multiply?: number; random?: boolean; snap?: 'min' | 'max' }
  | { do: 'rampPace'; from: number | 'min' | 'max' | 'current'; to: …; durationSeconds: number; steps: number = 5 }
  | { do: 'wait'; seconds: number | [min, max] }
  | { do: 'countdown'; from: number; intervalSeconds: number = 1; title?: string }
  | { do: 'setPhase'; phase: 'active' | 'break' | 'finale' }
  | { do: 'grip'; value?: 'left' | 'right' | 'both' }
  | { do: 'intensity'; add: number }            // clamped by the runtime's ceiling
  | { do: 'prompt'; promptId: string } | { do: 'check'; checkId: string }
  | { do: 'stat'; name: string; add: number = 1 } | { do: 'setVar'; name: string; value: number | string | boolean }
  | { do: 'media'; action: 'next'; tags: string[] = [] } | { do: 'marker'; label: string }
  | { do: 'branch'; mode: 'first' | 'weighted' = 'first'; branches: { when?: Condition | string; weight: number = 1; goto: string }[] }
  | { do: 'goto'; target: string } | { do: 'climax' } | { do: 'end'; reason: string = 'sequence complete' };

interface EventDefinition {
  id: string; name: string; type: 'narration' | 'pace' | 'pause' | 'grip' | 'climax' | 'prompt' | 'check' | 'marker' | 'cleanup' | 'sequence' | 'custom';
  description: string = ''; enabled: boolean = true;
  weight: number = 1;                    // "1 in N" odds under the dice strategy
  selectable: boolean = true;            // false = only reachable via goto/next/branch/group/sequence
  tags: string[] = []; intensity: Range; identities: string[] = []; styles: string[] = [];
  mediaTags: string[] = []; phases: GamePhase[] = ['active'];
  conditions?: Condition | string;
  cooldownSeconds: number = 0; maxRepeats: number = 0; noRepeatWithin: number = 0;
  steps: Step[];
  loop?: { times: number /* ≤ 50 */; until?: Condition | string };
  terminateIf?: Condition | string;
  next?: string | null;
  metadata: Record<string, string | number | boolean> = {};
}
interface EventGroup { id; name; mode: 'weighted' | 'sequential' | 'shuffle'; members: { event: string; weight: number }[] }
interface EventSequence { id; name; description; events: string[]; enabled: boolean; weight: number = 0 }
interface EventPack { kind: 'forge.eventPack'; schemaVersion: 1; id; name; description; events; groups; sequences }
interface SelectionConfig {
  strategy: 'weighted' | 'dice' | 'sequential' | 'shuffle'; rollIntervalSeconds = 1; triggerProbability = 0.15;
  minGapSeconds = 3; maxChainDepth = 16; maxStepsPerTick = 100;
}
```

Load-time rules (enforced by `compilePack`): unique ids across events, groups and sequences; every
`goto/next/branch/group/sequence` target exists; prompt and check ids exist; DSL strings parse; **every cycle
in the reference graph contains an event with `maxRepeats > 0` or `terminateIf`**. Warnings cover unreachable
events, contradictory bounds and unknown fields.

## Prompts and compliance checks

```ts
interface PromptTemplate {
  id; name; enabled = true;
  triggers: { on: 'pause' | 'resume' | 'half_pace' | 'intensity_threshold' | 'phase_change' | 'climax' | 'event' | 'media_segment_end'; value?: number | string }[];
  text: string; identityText: Record<identityCategory, string> = {};
  required = false; blocking = false; minLength = 0; maxLength = 500;
  vocabulary: { mode: 'off' | 'identity' | 'custom'; minMatches = 1; words: string[]; categories: string[] };
  perspectives: GrammaticalPerson[] = [];
  retry: { maxAttempts = 3; onExhausted: 'accept' | 'skip' };
  timeoutSeconds = 0; onTimeout: 'skip' | 'keep_open'; resume: 'immediate' | 'acknowledge';
  cooldownSeconds = 60; maxPerSession = 0;
}
interface ComplianceCheck {
  id; name; enabled = true; kind: 'instruction' | 'hand_position' | 'posture' | 'attention' | 'self_report' | 'custom';
  text: string;
  responses: { id; label; value: 'positive' | 'negative' | 'neutral' | 'skip'; stat?: { name; add } }[];  // 1..8
  schedule: { mode: 'random' | 'interval' | 'event_only'; perMinute; intervalSeconds; jitterSeconds; minGapSeconds; maxPerSession };
  phases: GamePhase[]; conditions?: Condition | string;
  timeoutSeconds = 20; unansweredAs: 'skipped' | 'missed'; blocking = false; eventIds: string[];
  onNegativeEvent?: string;             // consequence only if explicitly configured
}
```

## Accounting rules (`accounting/accounting.ts`)

```ts
interface AccountingRule {
  id; label; enabled = true; polarity: 'positive' | 'negative' | 'neutral';
  types: SessionEventType[];             // which logged facts the rule reads
  include?: Condition | string;          // scope: { type, source, eventId, data }
  exclude?: Condition | string;
  points = 1; maxCount = 0; eventWeights: Record<eventId, number> = {}; notes = '';
}
interface AccountingConfig { enabled = true; includeSafetyPauses = false; rules: AccountingRule[] }
```

## Session log and replay metadata (`session/types.ts`)

```ts
interface SessionEvent {
  id: string;                    // "e000042", stable and monotonic
  t: number;                     // wall ms since start (includes pauses)
  activeMs: number;              // active ms (engine clock)
  type: SessionEventType;        // 36 types: session_started … termination
  source: 'user' | 'engine' | 'system' | 'safety';
  eventId?: string;              // related event definition
  data: Record<string, scalar | scalar[] | Record<string, scalar | scalar[]>>;
}
interface ReplayMeta {
  engineVersion: number; appVersion: string; seed: string; configHash: string;
  configEmbedded: boolean; tickMs: number; mediaEmbedded: false; notes: string[];
}
interface SessionRecord {
  kind: 'forge.session'; schemaVersion: 1; sessionId; title = '';
  startedAt: ISO; endedAt?: ISO;
  endReason?: 'completed' | 'user_terminated' | 'emergency_stop' | 'duration_limit' | 'error' | 'interrupted';
  replay: ReplayMeta; config?: ForgeConfig;     // snapshot, validated separately on import
  events: SessionEvent[];
  annotations: { recordId; note; excluded; correctedResponse? }[];
  adjustments: { ruleId; delta; note }[];
  accountingSelection?: string[];               // post-session checklist
}
```

## Session configuration (`config/schema.ts`)

```ts
interface ForgeConfig {
  kind: 'forge.config'; schemaVersion: 2;
  session: { identityId; anatomyId; pronounsOverride: string | null; personOverride: GrammaticalPerson | null;
             styleMix: StyleMixEntry[]; durationSeconds; warmupSeconds; paceMin; paceMax; startIntensity;
             climaxChance; ruinChance; seed: string | null; narrationEnabled };
  identities: IdentityProfile[]; anatomy: AnatomyProfile[]; pronouns: PronounSet[];   // user items / overrides
  dictionaries: Dictionary[]; styles: NarrativeStyle[]; hypno: HypnoConfig;
  events: { builtinEnabled; packs: EventPack[]; disabledEventIds: string[]; weightOverrides: Record<id, number>; selection: SelectionConfig };
  prompts: { enabled; templates: PromptTemplate[] };
  checks: { enabled; globalMinGapSeconds; items: ComplianceCheck[] };
  accounting: AccountingConfig;
  media: { tags: Record<mediaId, string[]>; associations: { tag; events: string[]; styles: string[]; weightMultiplier }[] };
  logging: { enabled; recordNarrationText; recordPromptText; embedConfig };
  safety: { intensityCeiling; maxDurationMinutes; breaks: { enabled; everyMinutes; lengthSeconds };
            confirmBeforeStart; extraProhibitedWords: string[]; excludedPhrases: string[]; showRecordingIndicator };
  accessibility: { reducedMotion: 'system' | 'on' | 'off'; fontScale; highContrast; readingTimeMultiplier };
}
```

How the schemas fit together: identity `dictionaries` refer to dictionary ids. `styleMix` and event `styles`
refer to style ids. Event `prompt` and `check` steps refer to prompt and check ids, and `compilePack` checks
those references against the config. Accounting rules read `SessionEventType`s. Checks write `answers.<checkId>`,
which event conditions can read. Session records embed the full `ForgeConfig`, which makes re-simulation possible.
