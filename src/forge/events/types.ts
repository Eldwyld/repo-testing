import { Infer, id, v, Validator } from '../core/validate';
import { range } from '../identity/types';
import { Condition, conditionV } from './conditions';

export const EVENT_SCHEMA_VERSION = 1;

/** Conditions may be written as JSON trees or as DSL strings. */
export const conditionInputV = v.union(
  conditionV,
  v.string({ min: 1, max: 2000 })
);
export type ConditionInput = Condition | string;

const seconds = (max = 3600) => v.number({ min: 0, max });
const secondsOrRange = v.union(
  seconds(),
  v.refine(v.array(seconds(), { min: 2, max: 2 }), r =>
    r[0] > r[1] ? 'range min exceeds max' : null
  )
);

export const GAME_PHASES = [
  'warmup',
  'active',
  'break',
  'finale',
  'climax',
] as const;
export const GRIPS = ['left', 'right', 'both'] as const;

const stepVariants = {
  narrate: v.object(
    {
      do: v.literal('narrate'),
      /** Explicit template. Omit to compose from the active narrative styles. */
      template: v.string({ max: 600 }).optional(),
      /** Restrict style composition to these style ids. */
      styles: v.array(v.string()).default([]),
      durationSeconds: seconds(120).default(5),
    },
    { strict: true }
  ),
  message: v.object(
    {
      do: v.literal('message'),
      title: v.string({ min: 1, max: 300 }),
      description: v.string({ max: 300 }).optional(),
      durationSeconds: seconds(120).optional(),
    },
    { strict: true }
  ),
  setPace: v.object(
    {
      do: v.literal('setPace'),
      value: v.number({ min: 0, max: 20 }).optional(),
      multiply: v.number({ min: 0, max: 10 }).optional(),
      /** Random pace in [min, max] of the session pace limits. */
      random: v.boolean().optional(),
      /** "min"/"max" snap to the session limits. */
      snap: v.enum(['min', 'max'] as const).optional(),
    },
    { strict: true }
  ),
  rampPace: v.object(
    {
      do: v.literal('rampPace'),
      from: v.union(
        v.number({ min: 0, max: 20 }),
        v.enum(['min', 'max', 'current'] as const)
      ),
      to: v.union(
        v.number({ min: 0, max: 20 }),
        v.enum(['min', 'max', 'current'] as const)
      ),
      durationSeconds: seconds(600),
      steps: v.number({ min: 1, max: 60, integer: true }).default(5),
    },
    { strict: true }
  ),
  wait: v.object(
    { do: v.literal('wait'), seconds: secondsOrRange },
    { strict: true }
  ),
  countdown: v.object(
    {
      do: v.literal('countdown'),
      from: v.number({ min: 1, max: 60, integer: true }),
      intervalSeconds: seconds(60).default(1),
      title: v.string({ max: 200 }).optional(),
    },
    { strict: true }
  ),
  setPhase: v.object(
    {
      do: v.literal('setPhase'),
      phase: v.enum(['active', 'break', 'finale'] as const),
    },
    { strict: true }
  ),
  grip: v.object(
    { do: v.literal('grip'), value: v.enum(GRIPS).optional() },
    { strict: true }
  ),
  intensity: v.object(
    { do: v.literal('intensity'), add: v.number({ min: -10, max: 10 }) },
    { strict: true }
  ),
  prompt: v.object(
    { do: v.literal('prompt'), promptId: id() },
    { strict: true }
  ),
  check: v.object({ do: v.literal('check'), checkId: id() }, { strict: true }),
  stat: v.object(
    {
      do: v.literal('stat'),
      name: id(),
      add: v.number({ min: -1000, max: 1000 }).default(1),
    },
    { strict: true }
  ),
  setVar: v.object(
    {
      do: v.literal('setVar'),
      name: id(),
      value: v.union(v.number(), v.string({ max: 200 }), v.boolean()),
    },
    { strict: true }
  ),
  media: v.object(
    {
      do: v.literal('media'),
      action: v.enum(['next'] as const),
      tags: v.array(v.string()).default([]),
    },
    { strict: true }
  ),
  marker: v.object(
    { do: v.literal('marker'), label: v.string({ min: 1, max: 80 }) },
    { strict: true }
  ),
  branch: v.object(
    {
      do: v.literal('branch'),
      mode: v.enum(['first', 'weighted'] as const).default('first'),
      branches: v.array(
        v.object(
          {
            when: conditionInputV.optional(),
            weight: v.number({ min: 0, max: 1000 }).default(1),
            goto: id(),
          },
          { strict: true }
        ),
        { min: 1, max: 20 }
      ),
    },
    { strict: true }
  ),
  goto: v.object({ do: v.literal('goto'), target: id() }, { strict: true }),
  climax: v.object({ do: v.literal('climax') }, { strict: true }),
  end: v.object(
    {
      do: v.literal('end'),
      reason: v.string({ max: 120 }).default('sequence complete'),
    },
    { strict: true }
  ),
};

export const stepV = v.discriminated('do', stepVariants) as Validator<Step>;

export type Step =
  | Infer<typeof stepVariants.narrate>
  | Infer<typeof stepVariants.message>
  | Infer<typeof stepVariants.setPace>
  | Infer<typeof stepVariants.rampPace>
  | Infer<typeof stepVariants.wait>
  | Infer<typeof stepVariants.countdown>
  | Infer<typeof stepVariants.setPhase>
  | Infer<typeof stepVariants.grip>
  | Infer<typeof stepVariants.intensity>
  | Infer<typeof stepVariants.prompt>
  | Infer<typeof stepVariants.check>
  | Infer<typeof stepVariants.stat>
  | Infer<typeof stepVariants.setVar>
  | Infer<typeof stepVariants.media>
  | Infer<typeof stepVariants.marker>
  | Infer<typeof stepVariants.branch>
  | Infer<typeof stepVariants.goto>
  | Infer<typeof stepVariants.climax>
  | Infer<typeof stepVariants.end>;

export const STEP_KINDS = Object.keys(stepVariants) as Step['do'][];

export const EVENT_TYPES = [
  'narration',
  'pace',
  'pause',
  'grip',
  'climax',
  'prompt',
  'check',
  'marker',
  'cleanup',
  'sequence',
  'custom',
] as const;

export const eventDefinitionV = v.object({
  id: id(),
  name: v.string({ min: 1, max: 80 }),
  type: v.enum(EVENT_TYPES).default('custom'),
  description: v.string({ max: 600 }).default(''),
  enabled: v.boolean().default(true),
  /** Weight in the random pool. In "dice" strategy this is "1 in N" odds. */
  weight: v.number({ min: 0, max: 1000 }).default(1),
  /** Whether the event may be picked from the pool (false = only reachable by goto/next/branch). */
  selectable: v.boolean().default(true),
  tags: v.array(v.string({ max: 40 }), { max: 30 }).default([]),
  intensity: range(),
  /** Identity categories this event applies to. Empty = all. */
  identities: v.array(v.string()).default([]),
  /** Narrative style restriction for narration steps. Empty = active mix. */
  styles: v.array(v.string()).default([]),
  /** Require the current media to carry at least one of these tags. */
  mediaTags: v.array(v.string()).default([]),
  phases: v.array(v.enum(GAME_PHASES)).default(['active']),
  conditions: conditionInputV.optional(),
  cooldownSeconds: seconds(86400).default(0),
  /** Max runs per session (0 = unlimited). */
  maxRepeats: v.number({ min: 0, max: 10000, integer: true }).default(0),
  /** Do not pick again until N other events have run. */
  noRepeatWithin: v.number({ min: 0, max: 100, integer: true }).default(0),
  steps: v.array(stepV, { max: 100 }),
  /** Bounded repetition of `steps`. */
  loop: v
    .object(
      {
        times: v.number({ min: 1, max: 50, integer: true }),
        until: conditionInputV.optional(),
      },
      { strict: true }
    )
    .optional(),
  /** Abort this event (and its chain) when this becomes true before a step. */
  terminateIf: conditionInputV.optional(),
  /** Event to run after this one finishes (chain). */
  next: v.union(id(), v.literal(null)).optional(),
  metadata: v
    .record(v.union(v.string({ max: 200 }), v.number(), v.boolean()))
    .default({}),
});
export type EventDefinition = Infer<typeof eventDefinitionV>;

export const eventGroupV = v.object({
  id: id(),
  name: v.string({ min: 1, max: 80 }),
  mode: v
    .enum(['weighted', 'sequential', 'shuffle'] as const)
    .default('weighted'),
  members: v.array(
    v.object({
      event: id(),
      weight: v.number({ min: 0, max: 1000 }).default(1),
    }),
    { min: 1, max: 100 }
  ),
});
export type EventGroup = Infer<typeof eventGroupV>;

export const eventSequenceV = v.object({
  id: id(),
  name: v.string({ min: 1, max: 80 }),
  description: v.string({ max: 400 }).default(''),
  /** Event ids run in order; each may still chain/branch. */
  events: v.array(id(), { min: 1, max: 200 }),
  enabled: v.boolean().default(true),
  /** Weight when the sequence itself is a pool candidate (0 = only via goto). */
  weight: v.number({ min: 0, max: 1000 }).default(0),
});
export type EventSequence = Infer<typeof eventSequenceV>;

export const eventPackV = v.object({
  kind: v.literal('forge.eventPack'),
  schemaVersion: v.number({ integer: true, min: 1 }),
  id: id(),
  name: v.string({ min: 1, max: 80 }),
  description: v.string({ max: 1000 }).default(''),
  events: v.array(eventDefinitionV, { max: 2000 }),
  groups: v.array(eventGroupV, { max: 200 }).default([]),
  sequences: v.array(eventSequenceV, { max: 200 }).default([]),
});
export type EventPack = Infer<typeof eventPackV>;

export const SELECTION_STRATEGIES = [
  'weighted',
  'dice',
  'sequential',
  'shuffle',
] as const;

export const selectionConfigV = v.object({
  strategy: v.enum(SELECTION_STRATEGIES).default('weighted'),
  /** How often the idle engine considers starting an event. */
  rollIntervalSeconds: v.number({ min: 0.25, max: 600 }).default(1),
  /** Probability an idle roll starts something (weighted/sequential/shuffle). */
  triggerProbability: v.number({ min: 0, max: 1 }).default(0.15),
  /** Minimum idle gap between events. */
  minGapSeconds: v.number({ min: 0, max: 3600 }).default(3),
  maxChainDepth: v.number({ min: 1, max: 64, integer: true }).default(16),
  maxStepsPerTick: v.number({ min: 10, max: 1000, integer: true }).default(100),
});
export type SelectionConfig = Infer<typeof selectionConfigV>;
