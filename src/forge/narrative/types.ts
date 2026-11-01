import { Infer, id, v } from '../core/validate';
import { conditionV } from '../events/conditions';
import { range } from '../identity/types';

export const STYLE_FAMILIES = ['tone', 'register', 'structure'] as const;

export const phraseV = v.object({
  id: id(),
  text: v.string({ min: 1, max: 500 }),
  weight: v.number({ min: 0, max: 100 }).default(1),
  enabled: v.boolean().default(true),
  intensity: range().optional(),
  /** Restrict to identity categories. Empty = any. */
  identities: v.array(v.string()).default([]),
});
export type Phrase = Infer<typeof phraseV>;

export const narrativeStyleV = v.object({
  id: id(),
  name: v.string({ min: 1, max: 60 }),
  description: v.string({ max: 400 }).default(''),
  family: v.enum(STYLE_FAMILIES).default('tone'),
  enabled: v.boolean().default(true),
  intensity: range(),
  /** Probability (0..1) that an eligible narration slot uses this style at all. */
  frequency: v.number({ min: 0, max: 1 }).default(1),
  weight: v.number({ min: 0, max: 100 }).default(1),
  phrases: v.array(phraseV, { max: 2000 }),
  /** Extra words exposed as {vocab}. */
  vocabulary: v.array(v.string({ max: 80 }), { max: 500 }).default([]),
  /** Phrases or words that must never appear in output while this style is active. */
  excluded: v.array(v.string({ max: 200 }), { max: 500 }).default([]),
  activation: conditionV.optional(),
  incompatibleWith: v.array(v.string()).default([]),
  transitions: v
    .array(v.object({ to: v.string(), template: v.string({ max: 300 }) }), {
      max: 50,
    })
    .default([]),
  builtin: v.boolean().optional(),
});
export type NarrativeStyle = Infer<typeof narrativeStyleV>;

export const styleMixEntryV = v.object({
  styleId: v.string({ min: 1 }),
  /** Relative strength 0..1 (multiplies style weight). */
  strength: v.number({ min: 0, max: 1 }).default(1),
});
export type StyleMixEntry = Infer<typeof styleMixEntryV>;

export const HYPNO_PATTERNS = [
  'repetition',
  'rhythmic',
  'progressive_relaxation',
  'focused_attention',
  'counting',
  'reframing',
  'suggestion_response',
  'gradual_variation',
  'ritual_acknowledgment',
  'guided_visualization',
  'recall_reflection',
  'phase_transition',
] as const;
export type HypnoPatternId = (typeof HYPNO_PATTERNS)[number];

export const hypnoPatternConfigV = v.object({
  id: v.enum(HYPNO_PATTERNS),
  enabled: v.boolean().default(true),
  weight: v.number({ min: 0, max: 100 }).default(1),
  intensity: range(),
  /** Number of repetitions (repetition / counting / variation patterns). */
  repetitions: v.number({ min: 1, max: 20, integer: true }).default(3),
  /** 0..1: how much successive repetitions vary. */
  variation: v.number({ min: 0, max: 1 }).default(0.3),
  /** Max characters of a generated line block. */
  maxLength: v.number({ min: 20, max: 2000, integer: true }).default(280),
  /** Custom lines; empty uses built-ins. Templates support all narration tokens. */
  lines: v.array(v.string({ max: 300 }), { max: 200 }).default([]),
});
export type HypnoPatternConfig = Infer<typeof hypnoPatternConfigV>;

export const hypnoConfigV = v.object({
  enabled: v.boolean().default(false),
  /** Seconds between hypno-style phrases at intensity 0 and 10 (interpolated). */
  intervalAtMin: v.number({ min: 1, max: 120 }).default(4),
  intervalAtMax: v.number({ min: 0.3, max: 120 }).default(1.2),
  /** Probability per narration slot that a phase transition line is inserted. */
  transitionFrequency: v.number({ min: 0, max: 1 }).default(0.15),
  patterns: v.array(hypnoPatternConfigV, { max: 50 }),
});
export type HypnoConfig = Infer<typeof hypnoConfigV>;
