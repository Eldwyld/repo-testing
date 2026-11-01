import { Infer, id, v } from '../core/validate';

export const BUILTIN_IDENTITY_CATEGORIES = [
  'doll',
  'toy',
  'scientific_subject',
  'specimen',
  'hostage',
  'automaton',
  'muse',
  'oracle',
  'deity',
  'instrument',
  'tool',
] as const;

export const GRAMMATICAL_PERSONS = ['first', 'second', 'third'] as const;
export type GrammaticalPerson = (typeof GRAMMATICAL_PERSONS)[number];

export const TERM_REGISTERS = [
  'anatomical',
  'clinical',
  'euphemism',
  'explicit',
  'symbolic',
  'object',
  'custom',
] as const;
export type TermRegister = (typeof TERM_REGISTERS)[number];

export const range = (min = 0, max = 10) =>
  v.refine(
    v.object({
      min: v.number({ min: 0, max: 10 }).default(min),
      max: v.number({ min: 0, max: 10 }).default(max),
    }),
    r => (r.min > r.max ? 'min must not exceed max' : null)
  );
export type IntensityRange = { min: number; max: number };

export const termFormsV = v.object({
  singular: v.string({ min: 1, max: 80 }),
  plural: v.string({ max: 80 }).optional(),
  possessive: v.string({ max: 80 }).optional(),
  pluralPossessive: v.string({ max: 80 }).optional(),
});
export type TermForms = Infer<typeof termFormsV>;

export const pronounSetV = v.object({
  id: id(),
  label: v.string({ min: 1, max: 40 }),
  subject: v.string({ min: 1, max: 20 }),
  object: v.string({ min: 1, max: 20 }),
  possessiveDeterminer: v.string({ min: 1, max: 20 }),
  possessivePronoun: v.string({ min: 1, max: 20 }),
  reflexive: v.string({ min: 1, max: 30 }),
  /** Use plural verb agreement ("they are"). */
  pluralVerbs: v.boolean().default(false),
});
export type PronounSet = Infer<typeof pronounSetV>;

export const termEntryV = v.object({
  id: id(),
  forms: termFormsV,
  register: v.enum(TERM_REGISTERS),
  weight: v.number({ min: 0, max: 100 }).default(1),
  enabled: v.boolean().default(true),
  /** Narrative style ids where this term is preferred. Empty = any. */
  styles: v.array(v.string()).default([]),
});
export type TermEntry = Infer<typeof termEntryV>;

export const bodyPartV = v.object({
  partId: id(),
  label: v.string({ min: 1, max: 40 }),
  enabled: v.boolean().default(true),
  defaultRegister: v.enum(TERM_REGISTERS),
  /** Per narrative style: which register to prefer. */
  styleRegisters: v.record(v.enum(TERM_REGISTERS)).default({}),
  terms: v.array(termEntryV, { max: 200 }),
});
export type BodyPartConfig = Infer<typeof bodyPartV>;

/** Anatomy is configured independently from identity and gender presentation. */
export const anatomyProfileV = v.object({
  id: id(),
  name: v.string({ min: 1, max: 60 }),
  description: v.string({ max: 400 }).default(''),
  /** Verb used for the primary self-touch instruction ("stroke", "rub"...). */
  actionVerb: v.string({ min: 1, max: 30 }).default('stroke'),
  parts: v.array(bodyPartV, { max: 60 }),
  builtin: v.boolean().optional(),
});
export type AnatomyProfile = Infer<typeof anatomyProfileV>;

export const dictionaryEntryV = v.object({
  id: id(),
  text: v.string({ min: 1, max: 300 }),
  category: v.string({ min: 1, max: 60 }),
  weight: v.number({ min: 0, max: 100 }).default(1),
  enabled: v.boolean().default(true),
  intensity: range().optional(),
  /** Restrict to these narrative style ids. Empty = any. */
  styles: v.array(v.string()).default([]),
  plural: v.string({ max: 300 }).optional(),
});
export type DictionaryEntry = Infer<typeof dictionaryEntryV>;

export const dictionaryV = v.object({
  id: id(),
  name: v.string({ min: 1, max: 80 }),
  description: v.string({ max: 400 }).default(''),
  /** Ordered semantic categories (for editor grouping). */
  categories: v.array(v.string({ min: 1, max: 60 }), { max: 100 }).default([]),
  /** Explicit inheritance only: parent dictionary ids, resolved in order. */
  extends: v.array(id(), { max: 10 }).default([]),
  entries: v.array(dictionaryEntryV, { max: 5000 }),
  /** Per narrative style: disable entries or scale category weights. */
  styleOverrides: v
    .record(
      v.object({
        disable: v.array(v.string()).default([]),
        categoryWeights: v.record(v.number({ min: 0, max: 100 })).default({}),
      })
    )
    .default({}),
  builtin: v.boolean().optional(),
});
export type Dictionary = Infer<typeof dictionaryV>;

export const customRuleV = v.object({
  id: id(),
  enabled: v.boolean().default(true),
  /** Literal, case-insensitive, whole-word match. Not a regular expression. */
  find: v.string({ min: 1, max: 80 }),
  replace: v.string({ max: 120 }),
});
export type CustomRule = Infer<typeof customRuleV>;

export const identityProfileV = v.object({
  id: id(),
  displayName: v.string({ min: 1, max: 60 }),
  category: v.string({ min: 1, max: 60, pattern: /^[a-z0-9_]+$/ }),
  description: v.string({ max: 600 }).default(''),
  pronouns: pronounSetV,
  person: v.enum(GRAMMATICAL_PERSONS).default('second'),
  presentation: v.object({
    mode: v.enum(['gendered', 'neutral', 'custom'] as const).default('neutral'),
    /** e.g. "girl", "boy", "one", or a custom noun. Used by {noun}. */
    noun: v.string({ max: 40 }).default(''),
    label: v.string({ max: 60 }).default(''),
  }),
  /** How the identity is named as an object: "doll", "specimen", ... */
  objectNoun: termFormsV,
  /** Identity-specific body vocabulary layered over the anatomy profile. */
  bodyOverrides: v.array(bodyPartV, { max: 60 }).default([]),
  dictionaries: v.array(id(), { max: 20 }).default([]),
  preferredWords: v.array(v.string({ max: 80 })).default([]),
  prohibitedWords: v.array(v.string({ max: 80 })).default([]),
  perspective: v.object({
    /** Who narrates: "the curator", "the researcher", ... Used by {narrator}. */
    narrator: v.string({ max: 60 }).default('the narrator'),
    voice: v
      .enum(['direct', 'observational', 'ceremonial', 'mechanical'] as const)
      .default('direct'),
  }),
  /** Narrative style ids applicable to this identity. Empty = all. */
  styles: v.array(v.string()).default([]),
  /** Event tags/types applicable. Empty = all. */
  eventTags: v.array(v.string()).default([]),
  intensity: range(),
  rules: v.array(customRuleV, { max: 100 }).default([]),
  presets: v.array(v.string()).default([]),
  builtin: v.boolean().optional(),
});
export type IdentityProfile = Infer<typeof identityProfileV>;
