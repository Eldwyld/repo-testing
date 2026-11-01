/**
 * Minimal, dependency-free validation combinators with TypeScript inference.
 *
 * Every imported file (configs, event packs, session records) goes through one
 * of these validators before it is stored. Errors carry a JSON-pointer-like
 * path so the UI can point at the failing field ("events[3].weight").
 *
 * Validators never execute user-supplied code. They only inspect plain data.
 */

export type Issue = { path: string; message: string };

export type Result<T> =
  | { ok: true; value: T; issues: Issue[] }
  | { ok: false; issues: Issue[] };

export interface Validator<T> {
  /** Validate `input`, appending problems to `issues`. Returns the (possibly defaulted) value. */
  check(input: unknown, path: string, issues: Issue[]): T;
  optional(): Validator<T | undefined>;
  default(value: T): Validator<T>;
  /** Human readable type description, used in error messages and docs. */
  describe: string;
}

export type Infer<V> = V extends Validator<infer T> ? T : never;

type Simplify<T> = { [K in keyof T]: T[K] };
type OptionalKeys<S> = {
  [K in keyof S]: undefined extends Infer<S[K]> ? K : never;
}[keyof S];
/** Object output type: fields whose validator admits `undefined` become optional (`?:`). */
export type ObjectOut<S> = Simplify<
  { [K in Exclude<keyof S, OptionalKeys<S>>]: Infer<S[K]> } & {
    [K in OptionalKeys<S>]?: Infer<S[K]>;
  }
>;

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const join = (path: string, key: string | number) =>
  typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key;

const typeName = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

function make<T>(
  describe: string,
  check: (input: unknown, path: string, issues: Issue[]) => T
): Validator<T> {
  const self: Validator<T> = {
    describe,
    check,
    optional() {
      return make<T | undefined>(`${describe}?`, (input, path, issues) =>
        input === undefined ? undefined : check(input, path, issues)
      );
    },
    default(value: T) {
      return make<T>(describe, (input, path, issues) =>
        input === undefined
          ? structuredClone(value)
          : check(input, path, issues)
      );
    },
  };
  return self;
}

export const v = {
  string(opts: { min?: number; max?: number; pattern?: RegExp } = {}) {
    return make<string>('string', (input, path, issues) => {
      if (typeof input !== 'string') {
        issues.push({
          path,
          message: `expected string, got ${typeName(input)}`,
        });
        return '';
      }
      if (opts.min !== undefined && input.length < opts.min)
        issues.push({
          path,
          message: `must be at least ${opts.min} characters`,
        });
      if (opts.max !== undefined && input.length > opts.max)
        issues.push({
          path,
          message: `must be at most ${opts.max} characters`,
        });
      if (opts.pattern && !opts.pattern.test(input))
        issues.push({ path, message: `must match ${opts.pattern}` });
      return input;
    });
  },

  number(opts: { min?: number; max?: number; integer?: boolean } = {}) {
    return make<number>('number', (input, path, issues) => {
      if (typeof input !== 'number' || !Number.isFinite(input)) {
        issues.push({
          path,
          message: `expected finite number, got ${typeName(input)}`,
        });
        return 0;
      }
      if (opts.integer && !Number.isInteger(input))
        issues.push({ path, message: 'must be an integer' });
      if (opts.min !== undefined && input < opts.min)
        issues.push({ path, message: `must be >= ${opts.min}` });
      if (opts.max !== undefined && input > opts.max)
        issues.push({ path, message: `must be <= ${opts.max}` });
      return input;
    });
  },

  boolean() {
    return make<boolean>('boolean', (input, path, issues) => {
      if (typeof input !== 'boolean') {
        issues.push({
          path,
          message: `expected boolean, got ${typeName(input)}`,
        });
        return false;
      }
      return input;
    });
  },

  literal<const T extends string | number | boolean | null>(value: T) {
    return make<T>(JSON.stringify(value), (input, path, issues) => {
      if (input !== value)
        issues.push({
          path,
          message: `expected ${JSON.stringify(value)}, got ${JSON.stringify(input)}`,
        });
      return value;
    });
  },

  enum<const T extends readonly string[]>(values: T) {
    return make<T[number]>(
      values.map(x => `"${x}"`).join(' | '),
      (input, path, issues) => {
        if (typeof input !== 'string' || !values.includes(input)) {
          issues.push({
            path,
            message: `expected one of ${values.join(', ')}, got ${JSON.stringify(input)}`,
          });
          return values[0];
        }
        return input as T[number];
      }
    );
  },

  array<T>(item: Validator<T>, opts: { max?: number; min?: number } = {}) {
    return make<T[]>(`${item.describe}[]`, (input, path, issues) => {
      if (!Array.isArray(input)) {
        issues.push({
          path,
          message: `expected array, got ${typeName(input)}`,
        });
        return [];
      }
      if (opts.max !== undefined && input.length > opts.max)
        issues.push({
          path,
          message: `must contain at most ${opts.max} items`,
        });
      if (opts.min !== undefined && input.length < opts.min)
        issues.push({
          path,
          message: `must contain at least ${opts.min} items`,
        });
      return input.map((x, i) => item.check(x, join(path, i), issues));
    });
  },

  record<T>(value: Validator<T>) {
    return make<Record<string, T>>(
      `Record<string, ${value.describe}>`,
      (input, path, issues) => {
        if (
          typeof input !== 'object' ||
          input === null ||
          Array.isArray(input)
        ) {
          issues.push({
            path,
            message: `expected object, got ${typeName(input)}`,
          });
          return {};
        }
        const out: Record<string, T> = {};
        for (const [k, x] of Object.entries(input)) {
          if (UNSAFE_KEYS.has(k)) {
            issues.push({
              path: join(path, k),
              message: 'reserved key is not allowed',
            });
            continue;
          }
          out[k] = value.check(x, join(path, k), issues);
        }
        return out;
      }
    );
  },

  object<S extends Record<string, Validator<any>>>(
    shape: S,
    opts: { strict?: boolean } = {}
  ) {
    type Out = ObjectOut<S>;
    return make<Out>('object', (input, path, issues) => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        issues.push({
          path,
          message: `expected object, got ${typeName(input)}`,
        });
        return {} as Out;
      }
      const src = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        const value = shape[key].check(src[key], join(path, key), issues);
        if (value !== undefined) out[key] = value;
      }
      if (opts.strict) {
        for (const key of Object.keys(src))
          if (!(key in shape))
            issues.push({ path: join(path, key), message: 'unknown field' });
      }
      return out as Out;
    });
  },

  union<T extends Validator<any>[]>(...options: T) {
    return make<Infer<T[number]>>(
      options.map(o => o.describe).join(' | '),
      (input, path, issues) => {
        let best: Issue[] | null = null;
        for (const option of options) {
          const local: Issue[] = [];
          const value = option.check(input, path, local);
          if (local.length === 0) return value;
          if (!best || local.length < best.length) best = local;
        }
        issues.push(
          ...(best ?? [{ path, message: 'no union member matched' }])
        );
        return undefined as Infer<T[number]>;
      }
    );
  },

  /** Tagged union: picks the variant by `input[key]` for precise errors. */
  discriminated<K extends string, M extends Record<string, Validator<any>>>(
    key: K,
    variants: M
  ) {
    return make<Infer<M[keyof M]>>(
      `{${key}: ${Object.keys(variants).join(' | ')}}`,
      (input, path, issues) => {
        const tag =
          typeof input === 'object' && input !== null
            ? (input as Record<string, unknown>)[key]
            : undefined;
        const variant = typeof tag === 'string' ? variants[tag] : undefined;
        if (!variant) {
          issues.push({
            path: join(path, key),
            message: `expected one of ${Object.keys(variants).join(', ')}, got ${JSON.stringify(tag)}`,
          });
          return undefined as Infer<M[keyof M]>;
        }
        return variant.check(input, path, issues);
      }
    );
  },

  lazy<T>(fn: () => Validator<T>) {
    return make<T>('lazy', (input, path, issues) =>
      fn().check(input, path, issues)
    );
  },

  unknown() {
    return make<unknown>('unknown', input => input);
  },

  /** Refine a validator with an extra semantic check. */
  refine<T>(base: Validator<T>, test: (value: T) => string | null) {
    return make<T>(base.describe, (input, path, issues) => {
      const before = issues.length;
      const value = base.check(input, path, issues);
      if (issues.length === before) {
        const problem = test(value);
        if (problem) issues.push({ path, message: problem });
      }
      return value;
    });
  },
};

export function validate<T>(
  validator: Validator<T>,
  input: unknown
): Result<T> {
  const issues: Issue[] = [];
  const value = validator.check(input, '', issues);
  return issues.length ? { ok: false, issues } : { ok: true, value, issues };
}

export function formatIssues(issues: Issue[], limit = 20): string {
  const lines = issues
    .slice(0, limit)
    .map(i => `• ${i.path || '(root)'}: ${i.message}`);
  if (issues.length > limit) lines.push(`…and ${issues.length - limit} more`);
  return lines.join('\n');
}

export const ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,79}$/i;
export const id = () => v.string({ pattern: ID_PATTERN });
