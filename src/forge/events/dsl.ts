/**
 * Restricted condition DSL. It is parsed by hand into the same JSON
 * Condition tree used everywhere else — it is not JavaScript and is never
 * evaluated as code.
 *
 * Grammar (case-insensitive keywords):
 *
 *   expr       := orExpr
 *   orExpr     := andExpr ( "or" andExpr )*
 *   andExpr    := notExpr ( "and" notExpr )*
 *   notExpr    := "not" notExpr | primary
 *   primary    := "(" expr ")" | comparison
 *   comparison := FIELD op value
 *              |  FIELD ("in" | "not in") list
 *              |  FIELD "between" NUMBER ".." NUMBER
 *              |  FIELD ("exists" | "missing")
 *   op         := "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "!contains"
 *   value      := NUMBER | STRING | "true" | "false" | "null"
 *   list       := "[" ( value ( "," value )* )? "]"
 *   FIELD      := identifier ( "." segment )*
 *   STRING     := "..." | '...'   (backslash escapes \" \' \\)
 *
 * Example:  session.intensity >= 4 and not (history.last == "pause" or session.pauses > 3)
 */
import { Condition, Operator, Scalar } from './conditions';

export class DslError extends Error {
  constructor(
    message: string,
    public readonly position: number
  ) {
    super(`${message} (at character ${position + 1})`);
  }
}

type Tok =
  | { kind: 'num'; value: number; pos: number }
  | { kind: 'str'; value: string; pos: number }
  | { kind: 'word'; value: string; pos: number }
  | { kind: 'sym'; value: string; pos: number }
  | { kind: 'eof'; pos: number };

const MAX_INPUT = 2000;
const SYMBOLS = [
  '>=',
  '<=',
  '==',
  '!=',
  '..',
  '!contains',
  '(',
  ')',
  '[',
  ']',
  ',',
  '>',
  '<',
];

function tokenize(input: string): Tok[] {
  if (input.length > MAX_INPUT)
    throw new DslError(`expression longer than ${MAX_INPUT} characters`, 0);
  const toks: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const sym = SYMBOLS.find(s => input.startsWith(s, i));
    if (sym) {
      toks.push({ kind: 'sym', value: sym, pos: i });
      i += sym.length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = '';
      while (j < input.length && input[j] !== c) {
        if (input[j] === '\\' && j + 1 < input.length) {
          out += input[j + 1];
          j += 2;
          continue;
        }
        out += input[j++];
      }
      if (j >= input.length) throw new DslError('unterminated string', i);
      toks.push({ kind: 'str', value: out, pos: i });
      i = j + 1;
      continue;
    }
    // "1..5" is not swallowed: a decimal point must be followed by a digit.
    const num = /^-?\d+(?:\.\d+)?/.exec(input.slice(i));
    if (num) {
      toks.push({ kind: 'num', value: Number(num[0]), pos: i });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_:-]+)*/.exec(
      input.slice(i)
    );
    if (word) {
      toks.push({ kind: 'word', value: word[0], pos: i });
      i += word[0].length;
      continue;
    }
    throw new DslError(`unexpected character "${c}"`, i);
  }
  toks.push({ kind: 'eof', pos: input.length });
  return toks;
}

const OPS: Record<string, Operator> = {
  '==': 'equals',
  '!=': 'notEquals',
  '>': 'greaterThan',
  '>=': 'greaterThanOrEqual',
  '<': 'lessThan',
  '<=': 'lessThanOrEqual',
  contains: 'contains',
  '!contains': 'notContains',
};

const MAX_DEPTH = 12;

export function parseCondition(input: string): Condition {
  const toks = tokenize(input);
  let p = 0;
  const peek = () => toks[p];
  const isWord = (w: string) =>
    peek().kind === 'word' &&
    (peek() as { value: string }).value.toLowerCase() === w;
  const isSym = (s: string) =>
    peek().kind === 'sym' && (peek() as { value: string }).value === s;
  const expectSym = (s: string) => {
    if (!isSym(s)) throw new DslError(`expected "${s}"`, peek().pos);
    p++;
  };

  const value = (): Scalar => {
    const t = peek();
    if (t.kind === 'num' || t.kind === 'str') {
      p++;
      return t.value;
    }
    if (t.kind === 'word') {
      const w = t.value.toLowerCase();
      if (w === 'true' || w === 'false') {
        p++;
        return w === 'true';
      }
      if (w === 'null') {
        p++;
        return null;
      }
      throw new DslError(
        `expected a value; strings must be quoted ("${t.value}")`,
        t.pos
      );
    }
    throw new DslError('expected a value', t.pos);
  };

  const list = (): Scalar[] => {
    expectSym('[');
    const items: Scalar[] = [];
    if (!isSym(']')) {
      items.push(value());
      while (isSym(',')) {
        p++;
        items.push(value());
      }
    }
    expectSym(']');
    return items;
  };

  const comparison = (): Condition => {
    const t = peek();
    if (t.kind !== 'word') throw new DslError('expected a field name', t.pos);
    const field = t.value;
    if (['and', 'or', 'not', 'in'].includes(field.toLowerCase()))
      throw new DslError(`unexpected keyword "${field}"`, t.pos);
    p++;
    if (isWord('exists')) {
      p++;
      return { field, operator: 'exists' };
    }
    if (isWord('missing')) {
      p++;
      return { field, operator: 'notExists' };
    }
    if (isWord('in')) {
      p++;
      return { field, operator: 'in', value: list() };
    }
    if (isWord('not')) {
      p++;
      if (!isWord('in'))
        throw new DslError('expected "in" after "not"', peek().pos);
      p++;
      return { field, operator: 'notIn', value: list() };
    }
    if (isWord('between')) {
      p++;
      const lo = value();
      expectSym('..');
      const hi = value();
      if (typeof lo !== 'number' || typeof hi !== 'number')
        throw new DslError('between requires numbers', t.pos);
      return { field, operator: 'between', value: [lo, hi] };
    }
    const opTok = peek();
    const opKey =
      opTok.kind === 'sym' || opTok.kind === 'word'
        ? opTok.value.toLowerCase()
        : '';
    const operator = OPS[opKey];
    if (!operator)
      throw new DslError(`expected an operator after "${field}"`, opTok.pos);
    p++;
    const val = value();
    if (/^(greater|less)/.test(operator) && typeof val !== 'number')
      throw new DslError(`"${opKey}" requires a number`, opTok.pos);
    return { field, operator, value: val };
  };

  const primary = (depth: number): Condition => {
    if (isSym('(')) {
      p++;
      const inner = orExpr(depth + 1);
      expectSym(')');
      return inner;
    }
    return comparison();
  };
  const notExpr = (depth: number): Condition => {
    if (depth > MAX_DEPTH)
      throw new DslError('expression nested too deeply', peek().pos);
    if (isWord('not')) {
      p++;
      return { not: notExpr(depth + 1) };
    }
    return primary(depth);
  };
  const andExpr = (depth: number): Condition => {
    const items = [notExpr(depth)];
    while (isWord('and')) {
      p++;
      items.push(notExpr(depth));
    }
    return items.length === 1 ? items[0] : { all: items };
  };
  const orExpr = (depth: number): Condition => {
    const items = [andExpr(depth)];
    while (isWord('or')) {
      p++;
      items.push(andExpr(depth));
    }
    return items.length === 1 ? items[0] : { any: items };
  };

  const result = orExpr(0);
  if (peek().kind !== 'eof') throw new DslError('unexpected input', peek().pos);
  return result;
}

const SYM_OF: Partial<Record<Operator, string>> = {
  equals: '==',
  notEquals: '!=',
  greaterThan: '>',
  greaterThanOrEqual: '>=',
  lessThan: '<',
  lessThanOrEqual: '<=',
  contains: 'contains',
  notContains: '!contains',
};

const lit = (x: Scalar) =>
  typeof x === 'string' ? JSON.stringify(x) : String(x);

/** Inverse of parseCondition, used to show JSON conditions in DSL form. */
export function formatCondition(c: Condition, nested = false): string {
  if ('all' in c) {
    const s = c.all.map(x => formatCondition(x, true)).join(' and ');
    return nested && c.all.length > 1 ? `(${s})` : s;
  }
  if ('any' in c) {
    const s = c.any.map(x => formatCondition(x, true)).join(' or ');
    return nested && c.any.length > 1 ? `(${s})` : s;
  }
  if ('not' in c) return `not ${formatCondition(c.not, true)}`;
  switch (c.operator) {
    case 'exists':
      return `${c.field} exists`;
    case 'notExists':
      return `${c.field} missing`;
    case 'in':
      return `${c.field} in [${(c.value as Scalar[]).map(lit).join(', ')}]`;
    case 'notIn':
      return `${c.field} not in [${(c.value as Scalar[]).map(lit).join(', ')}]`;
    case 'between':
      return `${c.field} between ${(c.value as number[])[0]}..${(c.value as number[])[1]}`;
    default:
      return `${c.field} ${SYM_OF[c.operator]} ${lit(c.value as Scalar)}`;
  }
}
