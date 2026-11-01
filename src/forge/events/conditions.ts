/**
 * Declarative condition expressions. Conditions are plain JSON data and are
 * evaluated by walking the tree; nothing is ever compiled or eval'd.
 */
import { Issue, v, Validator } from '../core/validate';

export const OPERATORS = [
  'equals',
  'notEquals',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'in',
  'notIn',
  'contains',
  'notContains',
  'exists',
  'notExists',
  'between',
] as const;
export type Operator = (typeof OPERATORS)[number];

export type Scalar = string | number | boolean | null;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; operator: Operator; value?: Scalar | Scalar[] };

export const MAX_CONDITION_DEPTH = 12;
export const MAX_CONDITION_NODES = 200;

const scalarV = v.union(v.string(), v.number(), v.boolean(), v.literal(null));

export const conditionV: Validator<Condition> = v.lazy(() =>
  v.union(
    v.object({ all: v.array(conditionV, { max: 50 }) }, { strict: true }),
    v.object({ any: v.array(conditionV, { max: 50 }) }, { strict: true }),
    v.object({ not: conditionV }, { strict: true }),
    v.refine(
      v.object(
        {
          field: v.string({
            min: 1,
            max: 120,
            pattern: /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_:-]+)*$/,
          }),
          operator: v.enum(OPERATORS),
          value: v.union(scalarV, v.array(scalarV, { max: 100 })).optional(),
        },
        { strict: true }
      ),
      c => {
        if (c.operator === 'exists' || c.operator === 'notExists') return null;
        if (c.value === undefined)
          return `operator "${c.operator}" requires a value`;
        if (
          (c.operator === 'in' || c.operator === 'notIn') &&
          !Array.isArray(c.value)
        )
          return `operator "${c.operator}" requires an array value`;
        if (c.operator === 'between') {
          if (
            !Array.isArray(c.value) ||
            c.value.length !== 2 ||
            c.value.some(x => typeof x !== 'number')
          )
            return 'operator "between" requires [min, max] numbers';
          if ((c.value[0] as number) > (c.value[1] as number))
            return 'between: min exceeds max (always false)';
        }
        if (/^(greater|less)/.test(c.operator) && typeof c.value !== 'number')
          return `operator "${c.operator}" requires a number`;
        return null;
      }
    )
  )
) as Validator<Condition>;

/** Known field roots; anything else is reported by the validator as a warning. */
export const FIELD_ROOTS = [
  'session',
  'identity',
  'styles',
  'media',
  'history',
  'stats',
  'vars',
  'answers',
  'event',
] as const;

export const FIELD_DOCS: Record<string, string> = {
  'session.intensity': 'Current intensity, 0–10',
  'session.pace': 'Current pace (strokes per second)',
  'session.phase': 'warmup | active | break | finale | climax',
  'session.elapsedSeconds': 'Active (unpaused) seconds since start',
  'session.pauses': 'Number of user pauses',
  'session.checks.completed': 'Compliance checks answered',
  'session.checks.positive': 'Checks answered positively',
  'session.checks.negative': 'Checks answered negatively',
  'session.prompts.completed': 'Text prompts submitted',
  'session.prompts.skipped': 'Text prompts skipped',
  'identity.id': 'Active identity id',
  'identity.category': 'Active identity category',
  'styles.active': 'Array of active narrative style ids',
  'media.tags': 'Tags of the current media item',
  'history.last': 'Id of the previous event',
  'history.recent': 'Ids of the last 10 events',
  'history.count.<eventId>': 'How many times an event ran',
  'history.total': 'Total events run',
  'stats.<name>': 'User-defined statistic counters',
  'vars.<name>':
    'Sequence variables (vars.climaxResult is set by the climax step)',
  'answers.<id>': 'Latest response value of a check or prompt',
  'event.iteration': 'Current loop iteration of the running event',
};

export type ConditionScope = Record<string, unknown>;

export function getField(scope: ConditionScope, field: string): unknown {
  let node: unknown = scope;
  for (const key of field.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(node, key)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

const eq = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;

function compare(
  actual: unknown,
  op: Operator,
  value: Scalar | Scalar[] | undefined
): boolean {
  switch (op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'notExists':
      return actual === undefined || actual === null;
    case 'equals':
      return eq(actual, value);
    case 'notEquals':
      return !eq(actual, value);
    case 'greaterThan':
      return typeof actual === 'number' && actual > (value as number);
    case 'greaterThanOrEqual':
      return typeof actual === 'number' && actual >= (value as number);
    case 'lessThan':
      return typeof actual === 'number' && actual < (value as number);
    case 'lessThanOrEqual':
      return typeof actual === 'number' && actual <= (value as number);
    case 'between': {
      const [lo, hi] = value as number[];
      return typeof actual === 'number' && actual >= lo && actual <= hi;
    }
    case 'in':
      return Array.isArray(value) && value.some(x => eq(actual, x));
    case 'notIn':
      return Array.isArray(value) && !value.some(x => eq(actual, x));
    case 'contains':
      if (Array.isArray(actual)) return actual.some(x => eq(x, value));
      if (typeof actual === 'string' && typeof value === 'string')
        return actual.toLowerCase().includes(value.toLowerCase());
      return false;
    case 'notContains':
      return !compare(actual, 'contains', value);
  }
}

export type EvalTrace = {
  field: string;
  operator: Operator;
  expected: unknown;
  actual: unknown;
  result: boolean;
};

/**
 * Evaluate a condition. Malformed nodes and excessive depth evaluate to
 * `false` and are reported through `errors` rather than throwing.
 */
export function evaluate(
  condition: Condition | undefined,
  scope: ConditionScope,
  out?: { trace?: EvalTrace[]; errors?: string[] },
  depth = 0
): boolean {
  if (!condition) return true;
  if (depth > MAX_CONDITION_DEPTH) {
    out?.errors?.push(`condition nesting exceeds ${MAX_CONDITION_DEPTH}`);
    return false;
  }
  if ('all' in condition)
    return condition.all.every(c => evaluate(c, scope, out, depth + 1));
  if ('any' in condition)
    return condition.any.some(c => evaluate(c, scope, out, depth + 1));
  if ('not' in condition)
    return !evaluate(condition.not, scope, out, depth + 1);
  if (
    'field' in condition &&
    (OPERATORS as readonly string[]).includes(condition.operator)
  ) {
    const actual = getField(scope, condition.field);
    const result = compare(actual, condition.operator, condition.value);
    out?.trace?.push({
      field: condition.field,
      operator: condition.operator,
      expected: condition.value,
      actual,
      result,
    });
    return result;
  }
  out?.errors?.push(
    `malformed condition: ${JSON.stringify(condition).slice(0, 120)}`
  );
  return false;
}

export function conditionFields(condition: Condition | undefined): string[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(conditionFields);
  if ('any' in condition) return condition.any.flatMap(conditionFields);
  if ('not' in condition) return conditionFields(condition.not);
  return [condition.field];
}

export function countNodes(condition: Condition | undefined): number {
  if (!condition) return 0;
  if ('all' in condition)
    return 1 + condition.all.reduce((n, c) => n + countNodes(c), 0);
  if ('any' in condition)
    return 1 + condition.any.reduce((n, c) => n + countNodes(c), 0);
  if ('not' in condition) return 1 + countNodes(condition.not);
  return 1;
}

/**
 * Detect simple contradictions among sibling numeric bounds in an `all`
 * block, e.g. intensity >= 8 AND intensity < 3. Returns human messages.
 */
export function findContradictions(
  condition: Condition | undefined,
  path = 'conditions'
): Issue[] {
  if (!condition) return [];
  const issues: Issue[] = [];
  if ('all' in condition) {
    const bounds = new Map<
      string,
      { lo: number; hi: number; eqs: Set<string> }
    >();
    for (const c of condition.all) {
      if (!('field' in c)) continue;
      const b = bounds.get(c.field) ?? {
        lo: -Infinity,
        hi: Infinity,
        eqs: new Set<string>(),
      };
      const n = c.value as number;
      switch (c.operator) {
        case 'greaterThan':
          b.lo = Math.max(b.lo, n + 1e-9);
          break;
        case 'greaterThanOrEqual':
          b.lo = Math.max(b.lo, n);
          break;
        case 'lessThan':
          b.hi = Math.min(b.hi, n - 1e-9);
          break;
        case 'lessThanOrEqual':
          b.hi = Math.min(b.hi, n);
          break;
        case 'between':
          b.lo = Math.max(b.lo, (c.value as number[])[0]);
          b.hi = Math.min(b.hi, (c.value as number[])[1]);
          break;
        case 'equals':
          b.eqs.add(JSON.stringify(c.value));
          break;
      }
      bounds.set(c.field, b);
    }
    for (const [field, b] of bounds) {
      if (b.lo > b.hi)
        issues.push({
          path,
          message: `contradictory bounds on "${field}" (can never be true)`,
        });
      if (b.eqs.size > 1)
        issues.push({
          path,
          message: `"${field}" must equal several different values (can never be true)`,
        });
    }
    condition.all.forEach((c, i) =>
      issues.push(...findContradictions(c, `${path}.all[${i}]`))
    );
  } else if ('any' in condition) {
    condition.any.forEach((c, i) =>
      issues.push(...findContradictions(c, `${path}.any[${i}]`))
    );
  } else if ('not' in condition) {
    issues.push(...findContradictions(condition.not, `${path}.not`));
  }
  return issues;
}
