/**
 * Transparent post-session accounting.
 *
 * Facts (what was logged) are computed separately from interpretation
 * (user-configured rules that turn facts into tallies). Every line of the
 * report carries the record ids it counted and a plain-language explanation.
 *
 * Hard rules: emergency stops, user termination and consent withdrawal are
 * never countable. Pauses the user marked as safety pauses are excluded
 * unless the user explicitly opts in.
 */
import { Infer, id, v } from '../core/validate';
import { Condition, evaluate } from '../events/conditions';
import { parseCondition } from '../events/dsl';
import { conditionInputV } from '../events/types';
import { ComplianceCheck } from '../checks/checks';
import {
  SESSION_EVENT_TYPES,
  SessionEvent,
  SessionRecord,
} from '../session/types';

export const accountingRuleV = v.object({
  id: id(),
  label: v.string({ min: 1, max: 80 }),
  enabled: v.boolean().default(true),
  polarity: v
    .enum(['positive', 'negative', 'neutral'] as const)
    .default('negative'),
  types: v.array(v.enum(SESSION_EVENT_TYPES), { min: 1, max: 10 }),
  include: conditionInputV.optional(),
  exclude: conditionInputV.optional(),
  points: v.number({ min: -1000, max: 1000 }).default(1),
  /** Max records counted (0 = unlimited). */
  maxCount: v.number({ min: 0, max: 100000, integer: true }).default(0),
  /** Per event-definition weight multipliers. */
  eventWeights: v.record(v.number({ min: 0, max: 100 })).default({}),
  notes: v.string({ max: 500 }).default(''),
});
export type AccountingRule = Infer<typeof accountingRuleV>;

export const accountingConfigV = v.object({
  enabled: v.boolean().default(true),
  includeSafetyPauses: v.boolean().default(false),
  rules: v.array(accountingRuleV, { max: 200 }),
});
export type AccountingConfig = Infer<typeof accountingConfigV>;

const R = (
  r: Partial<AccountingRule> & Pick<AccountingRule, 'id' | 'label' | 'types'>
): AccountingRule => ({
  enabled: true,
  polarity: 'negative',
  points: 1,
  maxCount: 0,
  eventWeights: {},
  notes: '',
  ...r,
});

export const DEFAULT_ACCOUNTING: AccountingConfig = {
  enabled: true,
  includeSafetyPauses: false,
  rules: [
    R({
      id: 'checks_negative',
      label: 'Checks answered negatively',
      types: ['check_answered'],
      include: 'data.value == "negative"',
    }),
    R({
      id: 'checks_positive',
      label: 'Checks answered positively',
      polarity: 'positive',
      types: ['check_answered'],
      include: 'data.value == "positive"',
    }),
    R({
      id: 'checks_missed',
      label: 'Missed acknowledgments',
      enabled: false,
      types: ['check_timeout'],
      include: 'data.countsAs == "missed"',
    }),
    R({
      id: 'pauses',
      label: 'Pauses',
      enabled: false,
      types: ['pause'],
      notes: 'Safety pauses are excluded unless opted in.',
    }),
    R({
      id: 'prompts_skipped',
      label: 'Skipped prompts',
      enabled: false,
      types: ['prompt_skipped'],
    }),
    R({
      id: 'prompts_completed',
      label: 'Prompts completed',
      polarity: 'positive',
      types: ['prompt_submitted'],
      include: 'data.valid == true',
    }),
    R({
      id: 'repeated_events',
      label: 'Repeated events',
      enabled: false,
      polarity: 'neutral',
      types: ['event_started'],
      include: 'data.count > 1',
      points: 0,
    }),
    R({
      id: 'milestones',
      label: 'Milestones',
      enabled: false,
      polarity: 'positive',
      types: ['marker'],
    }),
  ],
};

export type AccountingLine = {
  ruleId: string;
  label: string;
  polarity: AccountingRule['polarity'];
  included: boolean;
  matched: number;
  counted: number;
  points: number;
  weightedPoints: number;
  adjustment: number;
  total: number;
  recordIds: string[];
  explanation: string;
};

export type AccountingFacts = {
  totalChecks: number;
  positive: number;
  negative: number;
  neutral: number;
  skippedChecks: number;
  timedOutChecks: number;
  pauses: number;
  safetyPauses: number;
  promptsShown: number;
  promptsCompleted: number;
  promptsSkipped: number;
  promptCompletionRate: number | null;
  instructionsFollowed: number;
  instructionsNotFollowed: number;
  eventsRun: number;
  excludedRecords: number;
  correctedRecords: number;
};

export type AccountingReport = {
  facts: AccountingFacts;
  lines: AccountingLine[];
  totals: { positive: number; negative: number; neutral: number; net: number };
  notes: string[];
};

const NEVER_COUNT = new Set([
  'termination',
  'session_ended',
  'session_started',
  'config_snapshot',
]);

export function isSafetyRecord(e: SessionEvent): boolean {
  return (
    e.source === 'safety' ||
    e.data.safety === true ||
    e.data.reason === 'safety' ||
    e.data.reason === 'emergency_stop'
  );
}

function compile(input: string | Condition | undefined): Condition | undefined {
  if (input === undefined) return undefined;
  return typeof input === 'string' ? parseCondition(input) : input;
}

/** Apply annotations: exclusions and corrected check responses. */
export function effectiveRecords(
  record: SessionRecord,
  checks: readonly ComplianceCheck[] = []
) {
  const notes = new Map(record.annotations.map(a => [a.recordId, a]));
  let excluded = 0;
  let corrected = 0;
  const events: SessionEvent[] = [];
  for (const e of record.events) {
    const a = notes.get(e.id);
    if (a?.excluded) {
      excluded++;
      continue;
    }
    if (a?.correctedResponse && e.type === 'check_answered') {
      const check = checks.find(c => c.id === e.data.checkId);
      const response = check?.responses.find(r => r.id === a.correctedResponse);
      corrected++;
      events.push({
        ...e,
        data: {
          ...e.data,
          response: a.correctedResponse,
          value: response?.value ?? e.data.value,
          corrected: true,
        },
      });
      continue;
    }
    events.push(e);
  }
  return { events, excluded, corrected };
}

export function computeFacts(
  events: readonly SessionEvent[],
  excluded = 0,
  corrected = 0
): AccountingFacts {
  const of = (t: string) => events.filter(e => e.type === t);
  const answered = of('check_answered');
  const value = (x: string) => answered.filter(e => e.data.value === x).length;
  const instruction = answered.filter(
    e =>
      e.data.kind === 'instruction' ||
      e.data.kind === 'hand_position' ||
      e.data.kind === 'posture'
  );
  const pauses = of('pause');
  const shown = of('prompt_shown').length;
  const completed = of('prompt_submitted').filter(
    e => e.data.valid !== false
  ).length;
  return {
    totalChecks: of('check_shown').length,
    positive: value('positive'),
    negative: value('negative'),
    neutral: value('neutral'),
    skippedChecks: value('skip'),
    timedOutChecks: of('check_timeout').length,
    pauses: pauses.filter(p => !isSafetyRecord(p)).length,
    safetyPauses: pauses.filter(isSafetyRecord).length,
    promptsShown: shown,
    promptsCompleted: completed,
    promptsSkipped: of('prompt_skipped').length,
    promptCompletionRate: shown ? completed / shown : null,
    instructionsFollowed: instruction.filter(e => e.data.value === 'positive')
      .length,
    instructionsNotFollowed: instruction.filter(
      e => e.data.value === 'negative'
    ).length,
    eventsRun: of('event_started').length,
    excludedRecords: excluded,
    correctedRecords: corrected,
  };
}

export function computeAccounting(
  record: SessionRecord,
  config: AccountingConfig,
  opts: {
    checks?: readonly ComplianceCheck[];
    selection?: readonly string[];
  } = {}
): AccountingReport {
  const { events, excluded, corrected } = effectiveRecords(record, opts.checks);
  const facts = computeFacts(events, excluded, corrected);
  const notes: string[] = [
    'Facts are counts of logged records. Totals below are your configured interpretation of those facts.',
    'Emergency stops, termination and consent withdrawal are never counted.',
  ];
  if (!config.enabled) {
    notes.push('Accounting is disabled; only facts are shown.');
    return {
      facts,
      lines: [],
      totals: { positive: 0, negative: 0, neutral: 0, net: 0 },
      notes,
    };
  }
  if (!config.includeSafetyPauses && facts.safetyPauses)
    notes.push(
      `${facts.safetyPauses} safety pause(s) were excluded from every rule.`
    );

  const selection = opts.selection ?? record.accountingSelection;
  const lines: AccountingLine[] = [];
  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    const included = !selection || selection.includes(rule.id);
    let include: Condition | undefined;
    let exclude: Condition | undefined;
    try {
      include = compile(rule.include);
      exclude = compile(rule.exclude);
    } catch (e) {
      notes.push(
        `Rule "${rule.label}" has an invalid condition and was skipped: ${(e as Error).message}`
      );
      continue;
    }
    const matches = events.filter(e => {
      if (!rule.types.includes(e.type)) return false;
      if (NEVER_COUNT.has(e.type)) return false;
      if (
        isSafetyRecord(e) &&
        !(
          config.includeSafetyPauses &&
          e.type === 'pause' &&
          e.data.reason === 'safety'
        )
      )
        return false;
      const scope = {
        type: e.type,
        source: e.source,
        eventId: e.eventId,
        data: e.data,
      };
      if (include && !evaluate(include, scope)) return false;
      if (exclude && evaluate(exclude, scope)) return false;
      return true;
    });
    const counted =
      rule.maxCount > 0 ? matches.slice(0, rule.maxCount) : matches;
    const weighted = counted.reduce(
      (sum, e) =>
        sum +
        rule.points *
          (e.eventId && rule.eventWeights[e.eventId] !== undefined
            ? rule.eventWeights[e.eventId]
            : 1),
      0
    );
    const adjustment = record.adjustments
      .filter(a => a.ruleId === rule.id)
      .reduce((s, a) => s + a.delta, 0);
    const weightedNote = Object.keys(rule.eventWeights).length
      ? ', with per-event weights applied'
      : '';
    const capNote =
      rule.maxCount > 0 && matches.length > rule.maxCount
        ? ` (capped at ${rule.maxCount} of ${matches.length})`
        : '';
    const adjNote = adjustment
      ? `, ${adjustment > 0 ? '+' : ''}${adjustment} manual adjustment`
      : '';
    lines.push({
      ruleId: rule.id,
      label: rule.label,
      polarity: rule.polarity,
      included,
      matched: matches.length,
      counted: counted.length,
      points: rule.points,
      weightedPoints: weighted,
      adjustment,
      total: weighted + adjustment,
      recordIds: counted.map(e => e.id),
      explanation: `${counted.length} record(s) of type ${rule.types.join('/')}${rule.include ? ` where ${typeof rule.include === 'string' ? rule.include : 'condition'}` : ''}${capNote} × ${rule.points} point(s)${weightedNote}${adjNote} = ${weighted + adjustment}`,
    });
  }
  const totals = { positive: 0, negative: 0, neutral: 0, net: 0 };
  for (const line of lines) {
    if (!line.included) continue;
    totals[line.polarity] += line.total;
  }
  totals.net = totals.positive - totals.negative;
  return { facts, lines, totals, notes };
}
