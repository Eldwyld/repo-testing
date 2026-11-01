/**
 * ForgeConfig: the complete, versioned user configuration.
 *
 * Built-in identities, dictionaries, styles and events are NOT stored here;
 * the config only holds user-authored items and overrides. `resolveLibrary`
 * layers user items over built-ins by id, so editing a built-in creates an
 * override and "reset" simply deletes the override.
 */
import { Infer, v } from '../core/validate';
import {
  accountingConfigV,
  DEFAULT_ACCOUNTING,
} from '../accounting/accounting';
import { complianceCheckV, DEFAULT_CHECKS } from '../checks/checks';
import { eventPackV, selectionConfigV } from '../events/types';
import {
  anatomyProfileV,
  dictionaryV,
  GRAMMATICAL_PERSONS,
  identityProfileV,
  pronounSetV,
} from '../identity/types';
import { DEFAULT_HYPNO } from '../narrative/builtins';
import {
  hypnoConfigV,
  narrativeStyleV,
  styleMixEntryV,
} from '../narrative/types';
import { DEFAULT_PROMPTS, promptTemplateV } from '../prompts/prompts';

export const CONFIG_SCHEMA_VERSION = 2;

export const sessionSettingsV = v.object({
  identityId: v.string().default('doll'),
  anatomyId: v.string().default('anatomy.penis'),
  /** Pronoun set id overriding the identity's pronouns (null = identity default). */
  pronounsOverride: v.union(v.string(), v.literal(null)).default(null),
  personOverride: v
    .union(v.enum(GRAMMATICAL_PERSONS), v.literal(null))
    .default(null),
  styleMix: v.array(styleMixEntryV, { max: 50 }).default([
    { styleId: 'encouragement', strength: 0.6 },
    { styleId: 'praise', strength: 0.6 },
    { styleId: 'objectification', strength: 1 },
    { styleId: 'neutral_observation', strength: 0.4 },
  ]),
  /** Seconds for intensity to rise 0 -> 10 (original: game duration). */
  durationSeconds: v.number({ min: 60, max: 4 * 3600 }).default(900),
  warmupSeconds: v.number({ min: 0, max: 3600 }).default(0),
  paceMin: v.number({ min: 0.25, max: 10 }).default(1),
  paceMax: v.number({ min: 0.25, max: 20 }).default(5),
  startIntensity: v.number({ min: 0, max: 10 }).default(0),
  climaxChance: v.number({ min: 0, max: 100 }).default(100),
  ruinChance: v.number({ min: 0, max: 100 }).default(0),
  /** Fixed seed for reproducible sessions (null = random each time). */
  seed: v.union(v.string({ max: 100 }), v.literal(null)).default(null),
  /** Interval between ambient narration lines when narration is enabled. */
  narrationEnabled: v.boolean().default(true),
});
export type SessionSettings = Infer<typeof sessionSettingsV>;

export const mediaConfigV = v.object({
  /** User-assigned tags per media id (local file hash or remote post id). */
  tags: v.record(v.array(v.string({ max: 40 }), { max: 50 })).default({}),
  associations: v
    .array(
      v.object({
        tag: v.string({ min: 1, max: 40 }),
        /** Multiply weights of these events while media with the tag is shown. */
        events: v.array(v.string()).default([]),
        styles: v.array(v.string()).default([]),
        weightMultiplier: v.number({ min: 0, max: 20 }).default(2),
      }),
      { max: 200 }
    )
    .default([]),
});
export type MediaConfig = Infer<typeof mediaConfigV>;

export const safetyConfigV = v.object({
  /** Hard ceiling (0–10). Nothing, including event scripts, can exceed it. */
  intensityCeiling: v.number({ min: 0, max: 10 }).default(10),
  /** Session ends automatically after this many wall-clock minutes (0 = no limit). */
  maxDurationMinutes: v.number({ min: 0, max: 600 }).default(90),
  breaks: v.object({
    enabled: v.boolean().default(false),
    everyMinutes: v.number({ min: 1, max: 240 }).default(20),
    lengthSeconds: v.number({ min: 10, max: 1800 }).default(60),
  }),
  confirmBeforeStart: v.boolean().default(true),
  /** Additional words prohibited everywhere (added to the built-in exclusions). */
  extraProhibitedWords: v
    .array(v.string({ max: 80 }), { max: 500 })
    .default([]),
  /** Phrases never shown in any narration. */
  excludedPhrases: v.array(v.string({ max: 200 }), { max: 500 }).default([]),
  /** Keep the "recording" indicator visible during sessions. */
  showRecordingIndicator: v.boolean().default(true),
});
export type SafetyConfig = Infer<typeof safetyConfigV>;

export const forgeConfigV = v.object({
  kind: v.literal('forge.config'),
  schemaVersion: v.number({ integer: true, min: 1 }),
  session: sessionSettingsV,
  identities: v.array(identityProfileV, { max: 200 }).default([]),
  anatomy: v.array(anatomyProfileV, { max: 50 }).default([]),
  pronouns: v.array(pronounSetV, { max: 50 }).default([]),
  dictionaries: v.array(dictionaryV, { max: 200 }).default([]),
  styles: v.array(narrativeStyleV, { max: 200 }).default([]),
  hypno: hypnoConfigV.default(DEFAULT_HYPNO),
  events: v.object({
    builtinEnabled: v.boolean().default(true),
    packs: v.array(eventPackV, { max: 50 }).default([]),
    disabledEventIds: v.array(v.string()).default([]),
    weightOverrides: v.record(v.number({ min: 0, max: 1000 })).default({}),
    selection: selectionConfigV.default({
      strategy: 'weighted',
      rollIntervalSeconds: 1,
      triggerProbability: 0.15,
      minGapSeconds: 3,
      maxChainDepth: 16,
      maxStepsPerTick: 100,
    }),
  }),
  prompts: v.object({
    enabled: v.boolean().default(true),
    templates: v.array(promptTemplateV, { max: 200 }).default(DEFAULT_PROMPTS),
  }),
  checks: v.object({
    enabled: v.boolean().default(true),
    globalMinGapSeconds: v.number({ min: 0, max: 3600 }).default(30),
    items: v.array(complianceCheckV, { max: 200 }).default(DEFAULT_CHECKS),
  }),
  accounting: accountingConfigV.default(DEFAULT_ACCOUNTING),
  media: mediaConfigV.default({ tags: {}, associations: [] }),
  logging: v.object({
    enabled: v.boolean().default(true),
    recordNarrationText: v.boolean().default(true),
    recordPromptText: v.boolean().default(true),
    embedConfig: v.boolean().default(true),
  }),
  safety: safetyConfigV.default({
    intensityCeiling: 10,
    maxDurationMinutes: 90,
    breaks: { enabled: false, everyMinutes: 20, lengthSeconds: 60 },
    confirmBeforeStart: true,
    extraProhibitedWords: [],
    excludedPhrases: [],
    showRecordingIndicator: true,
  }),
  accessibility: v.object({
    reducedMotion: v.enum(['system', 'on', 'off'] as const).default('system'),
    fontScale: v.number({ min: 0.75, max: 2 }).default(1),
    highContrast: v.boolean().default(false),
    /** Multiplies how long narration and messages stay on screen. */
    readingTimeMultiplier: v.number({ min: 0.5, max: 4 }).default(1),
  }),
});
export type ForgeConfig = Infer<typeof forgeConfigV>;

/** Fill every default by validating an almost-empty object. */
export function defaultConfig(): ForgeConfig {
  const issues: { path: string; message: string }[] = [];
  const value = forgeConfigV.check(
    {
      kind: 'forge.config',
      schemaVersion: CONFIG_SCHEMA_VERSION,
      session: {},
      events: {},
      prompts: {},
      checks: {},
      logging: {},
      accessibility: {},
    },
    '',
    issues
  );
  if (issues.length)
    throw new Error(`default config invalid: ${JSON.stringify(issues)}`);
  return structuredClone(value);
}
