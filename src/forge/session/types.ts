import { Infer, id, v } from '../core/validate';

export const SESSION_SCHEMA_VERSION = 1;

export const SESSION_EVENT_TYPES = [
  'session_started',
  'session_ended',
  'config_snapshot',
  'identity_set',
  'styles_set',
  'pace_changed',
  'intensity_changed',
  'phase_changed',
  'grip_changed',
  'event_selected',
  'event_started',
  'event_completed',
  'event_terminated',
  'event_skipped',
  'branch_taken',
  'condition_evaluated',
  'narration_shown',
  'message_shown',
  'hypno_shown',
  'media_shown',
  'prompt_shown',
  'prompt_submitted',
  'prompt_invalid',
  'prompt_skipped',
  'prompt_timeout',
  'check_shown',
  'check_answered',
  'check_timeout',
  'pause',
  'resume',
  'stat_changed',
  'var_set',
  'marker',
  'climax',
  'error',
  'termination',
] as const;
export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number];

export const SOURCES = ['user', 'engine', 'system', 'safety'] as const;
export type EventSource = (typeof SOURCES)[number];

export const END_REASONS = ['completed', 'user_terminated', 'emergency_stop', 'duration_limit', 'error', 'interrupted'] as const;
export type EndReason = (typeof END_REASONS)[number];

const scalar = v.union(v.string({ max: 5000 }), v.number(), v.boolean(), v.literal(null));
const dataValue = v.union(scalar, v.array(scalar, { max: 200 }), v.record(v.union(scalar, v.array(scalar, { max: 200 }))));

export const sessionEventV = v.object({
  /** Stable, monotonically increasing id within the session ("e000042"). */
  id: v.string({ pattern: /^e\d{6,}$/ }),
  /** Wall-clock ms since session start (includes pauses). */
  t: v.number({ min: 0 }),
  /** Active ms since start (excludes pauses) — the engine clock. */
  activeMs: v.number({ min: 0 }),
  type: v.enum(SESSION_EVENT_TYPES),
  source: v.enum(SOURCES),
  /** Event-definition id this record relates to, if any. */
  eventId: v.string({ max: 80 }).optional(),
  data: v.record(dataValue).default({}),
});
export type SessionEvent = Infer<typeof sessionEventV>;

export const annotationV = v.object({
  recordId: v.string(),
  note: v.string({ max: 2000 }).default(''),
  /** Exclude this record from accounting. */
  excluded: v.boolean().default(false),
  /** User correction of a check response (response id). */
  correctedResponse: v.string({ max: 60 }).optional(),
});
export type Annotation = Infer<typeof annotationV>;

export const adjustmentV = v.object({
  ruleId: v.string(),
  delta: v.number({ min: -100000, max: 100000 }),
  note: v.string({ max: 500 }).default(''),
});
export type Adjustment = Infer<typeof adjustmentV>;

export const replayMetaV = v.object({
  engineVersion: v.number({ integer: true }),
  appVersion: v.string({ max: 40 }),
  seed: v.string({ max: 200 }),
  configHash: v.string({ max: 80 }),
  /** Whether the full configuration snapshot is embedded. */
  configEmbedded: v.boolean(),
  tickMs: v.number({ min: 1, max: 1000 }),
  /** Media items cannot be embedded; only their ids/urls (unless redacted). */
  mediaEmbedded: v.literal(false).default(false),
  notes: v.array(v.string({ max: 300 })).default([]),
});
export type ReplayMeta = Infer<typeof replayMetaV>;

export const sessionRecordV = v.object({
  kind: v.literal('forge.session'),
  schemaVersion: v.number({ integer: true, min: 1 }),
  sessionId: id(),
  title: v.string({ max: 120 }).default(''),
  startedAt: v.string({ pattern: /^\d{4}-\d{2}-\d{2}T/ }),
  endedAt: v.string({ pattern: /^\d{4}-\d{2}-\d{2}T/ }).optional(),
  endReason: v.enum(END_REASONS).optional(),
  replay: replayMetaV,
  /** Full configuration snapshot (ForgeConfig) — validated separately on import. */
  config: v.unknown().optional(),
  events: v.array(sessionEventV, { max: 500000 }),
  annotations: v.array(annotationV).default([]),
  adjustments: v.array(adjustmentV).default([]),
  /** Accounting rule ids the user included in the final report (checklist). */
  accountingSelection: v.array(v.string()).optional(),
});
export type SessionRecord = Infer<typeof sessionRecordV>;
