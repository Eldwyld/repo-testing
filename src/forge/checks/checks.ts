/**
 * Randomised compliance checks. A check asks the user to self-report; it
 * never verifies anything and never triggers consequences on its own. Each
 * response option explicitly declares which statistic (if any) it feeds.
 */
import { Rng } from '../core/rng';
import { Infer, id, v } from '../core/validate';
import { ConditionScope, evaluate } from '../events/conditions';
import { parseCondition } from '../events/dsl';
import { conditionInputV, GAME_PHASES } from '../events/types';

export const CHECK_KINDS = [
  'instruction',
  'hand_position',
  'posture',
  'attention',
  'self_report',
  'custom',
] as const;
export const RESPONSE_VALUES = [
  'positive',
  'negative',
  'neutral',
  'skip',
] as const;
export type ResponseValue = (typeof RESPONSE_VALUES)[number];

export const checkResponseV = v.object({
  id: id(),
  label: v.string({ min: 1, max: 60 }),
  value: v.enum(RESPONSE_VALUES),
  /** Optional statistic increment, configured explicitly by the user. */
  stat: v
    .object({ name: id(), add: v.number({ min: -100, max: 100 }) })
    .optional(),
});
export type CheckResponse = Infer<typeof checkResponseV>;

export const complianceCheckV = v.object({
  id: id(),
  name: v.string({ min: 1, max: 80 }),
  enabled: v.boolean().default(true),
  kind: v.enum(CHECK_KINDS).default('custom'),
  text: v.string({ min: 1, max: 300 }),
  responses: v.array(checkResponseV, { min: 1, max: 8 }),
  schedule: v.object({
    mode: v
      .enum(['random', 'interval', 'event_only'] as const)
      .default('random'),
    /** random: expected checks per minute (Poisson rate). */
    perMinute: v.number({ min: 0, max: 10 }).default(0.2),
    /** interval: fixed spacing with optional jitter. */
    intervalSeconds: v.number({ min: 5, max: 7200 }).default(120),
    jitterSeconds: v.number({ min: 0, max: 3600 }).default(20),
    minGapSeconds: v.number({ min: 0, max: 7200 }).default(45),
    maxPerSession: v.number({ min: 0, max: 1000, integer: true }).default(0),
  }),
  phases: v.array(v.enum(GAME_PHASES)).default(['active']),
  conditions: conditionInputV.optional(),
  timeoutSeconds: v.number({ min: 0, max: 600 }).default(20),
  /** What an unanswered (timed-out) check is recorded as. */
  unansweredAs: v.enum(['skipped', 'missed'] as const).default('skipped'),
  blocking: v.boolean().default(false),
  /** Event ids this check is associated with (for reporting). */
  eventIds: v.array(v.string()).default([]),
  /** Optional consequence: an event to trigger on a negative answer. Off by default. */
  onNegativeEvent: v.string().optional(),
});
export type ComplianceCheck = Infer<typeof complianceCheckV>;

export const STANDARD_RESPONSES: CheckResponse[] = [
  { id: 'yes', label: 'Yes', value: 'positive' },
  { id: 'no', label: 'No', value: 'negative' },
  { id: 'na', label: 'Not applicable', value: 'neutral' },
  { id: 'skip', label: 'Skip', value: 'skip' },
  { id: 'prefer_not', label: 'Prefer not to answer', value: 'neutral' },
];

const C = (
  c: Partial<ComplianceCheck> & Pick<ComplianceCheck, 'id' | 'name' | 'text'>
): ComplianceCheck => ({
  enabled: true,
  kind: 'custom',
  responses: STANDARD_RESPONSES,
  schedule: {
    mode: 'random',
    perMinute: 0.2,
    intervalSeconds: 120,
    jitterSeconds: 20,
    minGapSeconds: 45,
    maxPerSession: 0,
  },
  phases: ['active'],
  timeoutSeconds: 20,
  unansweredAs: 'skipped',
  blocking: false,
  eventIds: [],
  ...c,
});

export const DEFAULT_CHECKS: ComplianceCheck[] = [
  C({
    id: 'instruction_following',
    name: 'Instruction following',
    kind: 'instruction',
    text: 'Are you following the current instruction?',
  }),
  C({
    id: 'hand_position',
    name: 'Hand position',
    kind: 'hand_position',
    text: 'Are {their} {hands} where they were told to be? (grip: {grip})',
    schedule: {
      mode: 'random',
      perMinute: 0.15,
      intervalSeconds: 120,
      jitterSeconds: 20,
      minGapSeconds: 60,
      maxPerSession: 0,
    },
  }),
  C({
    id: 'posture',
    name: 'Posture',
    kind: 'posture',
    text: 'Is the {object} holding the requested posture?',
    enabled: false,
  }),
  C({
    id: 'attention',
    name: 'Attention',
    kind: 'attention',
    text: 'Are {their} eyes on the screen?',
    enabled: false,
  }),
  C({
    id: 'self_report',
    name: 'Session state',
    kind: 'self_report',
    text: 'How is this going?',
    enabled: false,
    responses: [
      { id: 'good', label: 'Good', value: 'positive' },
      { id: 'okay', label: 'Okay', value: 'neutral' },
      { id: 'too_much', label: 'Too much', value: 'neutral' },
      { id: 'skip', label: 'Skip', value: 'skip' },
    ],
  }),
  C({
    id: 'cleanup_done',
    name: 'Clean-up done',
    kind: 'instruction',
    text: 'Done cleaning up?',
    blocking: true,
    timeoutSeconds: 0,
    schedule: {
      mode: 'event_only',
      perMinute: 0,
      intervalSeconds: 120,
      jitterSeconds: 0,
      minGapSeconds: 0,
      maxPerSession: 0,
    },
    phases: ['break', 'active'],
    eventIds: ['clean_up'],
    responses: [
      { id: 'yes', label: 'I’m done', value: 'positive' },
      { id: 'skip', label: 'Skip', value: 'skip' },
    ],
  }),
  C({
    id: 'edging',
    name: 'Edging confirmation',
    kind: 'self_report',
    text: 'Are you on the edge?',
    blocking: true,
    timeoutSeconds: 0,
    schedule: {
      mode: 'event_only',
      perMinute: 0,
      intervalSeconds: 120,
      jitterSeconds: 0,
      minGapSeconds: 0,
      maxPerSession: 0,
    },
    phases: ['finale', 'active'],
    eventIds: ['climax'],
    responses: [
      { id: 'yes', label: 'I’m edging', value: 'positive' },
      { id: 'no', label: 'I can’t', value: 'neutral' },
    ],
  }),
];

export type CheckScheduleState = {
  lastShownAt: Record<string, number>;
  counts: Record<string, number>;
  lastAnyAt: number;
  nextIntervalAt: Record<string, number>;
};

export const createCheckScheduleState = (): CheckScheduleState => ({
  lastShownAt: {},
  counts: {},
  lastAnyAt: -Infinity,
  nextIntervalAt: {},
});

const compiled = new WeakMap<
  object,
  ReturnType<typeof parseCondition> | null
>();
function conditionOf(check: ComplianceCheck) {
  if (check.conditions === undefined) return undefined;
  if (typeof check.conditions !== 'string') return check.conditions;
  if (!compiled.has(check)) {
    try {
      compiled.set(check, parseCondition(check.conditions));
    } catch {
      compiled.set(check, null);
    }
  }
  return (
    compiled.get(check) ?? { field: '__invalid__', operator: 'exists' as const }
  );
}

/**
 * Decide whether a scheduled check is due this tick. At most one check is
 * returned. `dtMs` is the elapsed active time since the previous call.
 */
export function dueCheck(
  checks: readonly ComplianceCheck[],
  state: CheckScheduleState,
  now: number,
  dtMs: number,
  rng: Rng,
  scope: ConditionScope,
  globalMinGapSeconds = 30
): ComplianceCheck | null {
  if (now - state.lastAnyAt < globalMinGapSeconds * 1000) return null;
  const phase =
    (scope.session as { phase?: string } | undefined)?.phase ?? 'active';
  for (const check of checks) {
    if (!check.enabled || check.schedule.mode === 'event_only') continue;
    if (!check.phases.includes(phase as never)) continue;
    if (
      check.schedule.maxPerSession &&
      (state.counts[check.id] ?? 0) >= check.schedule.maxPerSession
    )
      continue;
    const last = state.lastShownAt[check.id] ?? -Infinity;
    if (now - last < check.schedule.minGapSeconds * 1000) continue;
    let due = false;
    if (check.schedule.mode === 'random') {
      const p = 1 - Math.exp((-check.schedule.perMinute * dtMs) / 60000);
      due = rng.chance(p);
    } else {
      if (state.nextIntervalAt[check.id] === undefined)
        state.nextIntervalAt[check.id] =
          now +
          (check.schedule.intervalSeconds +
            rng.range(-1, 1) * check.schedule.jitterSeconds) *
            1000;
      due = now >= state.nextIntervalAt[check.id];
      if (due)
        state.nextIntervalAt[check.id] =
          now +
          (check.schedule.intervalSeconds +
            rng.range(-1, 1) * check.schedule.jitterSeconds) *
            1000;
    }
    if (due && evaluate(conditionOf(check), scope)) return check;
  }
  return null;
}

export function markShown(
  state: CheckScheduleState,
  checkId: string,
  now: number
) {
  state.lastShownAt[checkId] = now;
  state.counts[checkId] = (state.counts[checkId] ?? 0) + 1;
  state.lastAnyAt = now;
}

/** Preview/test mode: when would checks fire over a session, without running one? */
export function previewSchedule(
  checks: readonly ComplianceCheck[],
  opts: {
    durationSeconds: number;
    seed: string;
    tickMs?: number;
    phase?: string;
    globalMinGapSeconds?: number;
  }
): { at: number; checkId: string }[] {
  const rng = Rng.fromSeed(opts.seed);
  const state = createCheckScheduleState();
  const tick = opts.tickMs ?? 250;
  const out: { at: number; checkId: string }[] = [];
  for (let t = 0; t <= opts.durationSeconds * 1000; t += tick) {
    const c = dueCheck(
      checks,
      state,
      t,
      tick,
      rng,
      { session: { phase: opts.phase ?? 'active', elapsedSeconds: t / 1000 } },
      opts.globalMinGapSeconds ?? 30
    );
    if (c) {
      markShown(state, c.id, t);
      out.push({ at: t, checkId: c.id });
    }
  }
  return out;
}
