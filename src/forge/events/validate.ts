/**
 * Load-time validation and compilation of user-authored event packs.
 *
 * compilePack() never throws for bad input: it returns actionable
 * diagnostics that name the failing event, and only returns a compiled pack
 * when there are no errors. Warnings do not block loading.
 */
import { scanValue } from '../content/guard';
import { validate } from '../core/validate';
import {
  Condition,
  conditionFields,
  countNodes,
  FIELD_ROOTS,
  findContradictions,
  MAX_CONDITION_NODES,
} from './conditions';
import { DslError, parseCondition } from './dsl';
import {
  ConditionInput,
  EventDefinition,
  EventGroup,
  EventPack,
  eventPackV,
  EventSequence,
  Step,
} from './types';

export type DiagnosticCode =
  | 'schema'
  | 'dsl'
  | 'duplicate_id'
  | 'invalid_reference'
  | 'unreachable'
  | 'unbounded_loop'
  | 'contradiction'
  | 'prohibited_term'
  | 'unknown_field'
  | 'empty_event'
  | 'too_complex'
  | 'version';

export type Diagnostic = {
  code: DiagnosticCode;
  message: string;
  eventId?: string;
  path?: string;
};

export type CompiledStep = Step & { when?: never };

export type CompiledEvent = Omit<
  EventDefinition,
  'conditions' | 'terminateIf' | 'loop' | 'steps'
> & {
  conditions?: Condition;
  terminateIf?: Condition;
  loop?: { times: number; until?: Condition };
  steps: CompiledBranchAware[];
};

export type CompiledBranchAware =
  | Exclude<Step, { do: 'branch' }>
  | {
      do: 'branch';
      mode: 'first' | 'weighted';
      branches: { when?: Condition; weight: number; goto: string }[];
    };

export type CompiledPack = {
  id: string;
  name: string;
  events: Record<string, CompiledEvent>;
  groups: Record<string, EventGroup>;
  sequences: Record<string, EventSequence>;
  /** Event ids in authoring order (used by the sequential strategy). */
  order: string[];
};

export type CompileOptions = {
  promptIds?: readonly string[];
  checkIds?: readonly string[];
  styleIds?: readonly string[];
  extraProhibited?: readonly string[];
  supportedSchemaVersion?: number;
};

export type CompileResult = {
  ok: boolean;
  pack?: CompiledPack;
  errors: Diagnostic[];
  warnings: Diagnostic[];
};

function eventIdAt(raw: unknown, path: string): string | undefined {
  const m = /^events\[(\d+)\]/.exec(path);
  if (!m || !raw || typeof raw !== 'object') return undefined;
  const ev = (raw as { events?: unknown[] }).events?.[Number(m[1])];
  return ev && typeof ev === 'object'
    ? String((ev as { id?: unknown }).id ?? '') || undefined
    : undefined;
}

export function compilePack(
  raw: unknown,
  options: CompileOptions = {}
): CompileResult {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  const supported = options.supportedSchemaVersion ?? 1;
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { schemaVersion?: unknown }).schemaVersion === 'number'
  ) {
    const ver = (raw as { schemaVersion: number }).schemaVersion;
    if (ver > supported)
      return {
        ok: false,
        errors: [
          {
            code: 'version',
            message: `pack schemaVersion ${ver} is newer than supported (${supported}); update the app`,
          },
        ],
        warnings,
      };
  }

  const schema = validate(eventPackV, raw);
  if (!schema.ok) {
    for (const issue of schema.issues)
      errors.push({
        code: 'schema',
        message: issue.message,
        path: issue.path,
        eventId: eventIdAt(raw, issue.path),
      });
    return { ok: false, errors, warnings };
  }
  const pack: EventPack = schema.value;

  for (const f of scanValue(pack, options.extraProhibited ?? []))
    errors.push({
      code: 'prohibited_term',
      message: `excluded term "${f.match}" (${f.category})`,
      path: f.path,
      eventId: eventIdAt(pack, f.path ?? ''),
    });

  // Unique ids across events, groups and sequences (they share the goto namespace).
  const seen = new Map<string, string>();
  const claim = (kind: string, ident: string) => {
    const prev = seen.get(ident);
    if (prev)
      errors.push({
        code: 'duplicate_id',
        message: `id "${ident}" used by both ${prev} and ${kind}`,
        eventId: ident,
      });
    else seen.set(ident, kind);
  };
  pack.events.forEach(e => claim('event', e.id));
  pack.groups.forEach(g => claim('group', g.id));
  pack.sequences.forEach(s => claim('sequence', s.id));

  const compileCond = (
    input: ConditionInput | undefined,
    eventId: string,
    path: string
  ): Condition | undefined => {
    if (input === undefined) return undefined;
    let cond: Condition;
    if (typeof input === 'string') {
      try {
        cond = parseCondition(input);
      } catch (e) {
        errors.push({
          code: 'dsl',
          message: e instanceof DslError ? e.message : String(e),
          eventId,
          path,
        });
        return undefined;
      }
    } else cond = input;
    if (countNodes(cond) > MAX_CONDITION_NODES)
      errors.push({
        code: 'too_complex',
        message: `condition has more than ${MAX_CONDITION_NODES} nodes`,
        eventId,
        path,
      });
    for (const c of findContradictions(cond, path))
      warnings.push({
        code: 'contradiction',
        message: c.message,
        eventId,
        path: c.path,
      });
    for (const field of conditionFields(cond)) {
      const root = field.split('.')[0];
      if (!(FIELD_ROOTS as readonly string[]).includes(root))
        warnings.push({
          code: 'unknown_field',
          message: `unknown field "${field}" (evaluates as missing)`,
          eventId,
          path,
        });
    }
    return cond;
  };

  const targets = new Set([
    ...pack.events.map(e => e.id),
    ...pack.groups.map(g => g.id),
    ...pack.sequences.map(s => s.id),
  ]);
  const edges = new Map<string, Set<string>>();
  const referenced = new Set<string>();
  const addEdge = (from: string, to: string, eventId: string, path: string) => {
    if (!targets.has(to)) {
      errors.push({
        code: 'invalid_reference',
        message: `reference to unknown event/group/sequence "${to}"`,
        eventId,
        path,
      });
      return;
    }
    referenced.add(to);
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from)!.add(to);
  };

  const events: Record<string, CompiledEvent> = {};
  pack.events.forEach((ev, i) => {
    const base = `events[${i}]`;
    if (ev.intensity.min > ev.intensity.max)
      errors.push({
        code: 'schema',
        message: 'intensity.min exceeds intensity.max',
        eventId: ev.id,
        path: `${base}.intensity`,
      });
    if (!ev.steps.length && !ev.next)
      warnings.push({
        code: 'empty_event',
        message: 'event has no steps and no next event',
        eventId: ev.id,
        path: base,
      });
    const steps: CompiledBranchAware[] = ev.steps.map((step, si) => {
      const sp = `${base}.steps[${si}]`;
      switch (step.do) {
        case 'goto':
          addEdge(ev.id, step.target, ev.id, `${sp}.target`);
          return step;
        case 'branch':
          return {
            do: 'branch',
            mode: step.mode,
            branches: step.branches.map((b, bi) => {
              addEdge(ev.id, b.goto, ev.id, `${sp}.branches[${bi}].goto`);
              return {
                goto: b.goto,
                weight: b.weight,
                when: compileCond(b.when, ev.id, `${sp}.branches[${bi}].when`),
              };
            }),
          };
        case 'prompt':
          if (options.promptIds && !options.promptIds.includes(step.promptId))
            errors.push({
              code: 'invalid_reference',
              message: `unknown prompt "${step.promptId}"`,
              eventId: ev.id,
              path: `${sp}.promptId`,
            });
          return step;
        case 'check':
          if (options.checkIds && !options.checkIds.includes(step.checkId))
            errors.push({
              code: 'invalid_reference',
              message: `unknown check "${step.checkId}"`,
              eventId: ev.id,
              path: `${sp}.checkId`,
            });
          return step;
        case 'narrate':
          if (options.styleIds)
            for (const s of step.styles)
              if (!options.styleIds.includes(s))
                warnings.push({
                  code: 'invalid_reference',
                  message: `unknown narrative style "${s}"`,
                  eventId: ev.id,
                  path: `${sp}.styles`,
                });
          return step;
        default:
          return step;
      }
    });
    if (ev.next) addEdge(ev.id, ev.next, ev.id, `${base}.next`);
    events[ev.id] = {
      ...ev,
      conditions: compileCond(ev.conditions, ev.id, `${base}.conditions`),
      terminateIf: compileCond(ev.terminateIf, ev.id, `${base}.terminateIf`),
      loop: ev.loop
        ? {
            times: ev.loop.times,
            until: compileCond(ev.loop.until, ev.id, `${base}.loop.until`),
          }
        : undefined,
      steps,
    };
  });

  pack.groups.forEach((g, i) =>
    g.members.forEach((m, mi) =>
      addEdge(g.id, m.event, g.id, `groups[${i}].members[${mi}].event`)
    )
  );
  pack.sequences.forEach((s, i) =>
    s.events.forEach((e, ei) => {
      if (!pack.events.some(x => x.id === e))
        errors.push({
          code: 'invalid_reference',
          message: `sequence step "${e}" is not an event`,
          eventId: s.id,
          path: `sequences[${i}].events[${ei}]`,
        });
      else referenced.add(e);
    })
  );

  // Unreachable: not selectable from the pool and never referenced.
  for (const ev of pack.events) {
    const poolable = ev.enabled && ev.selectable && ev.weight > 0;
    if (!poolable && !referenced.has(ev.id))
      warnings.push({
        code: 'unreachable',
        message:
          'event can never run: not selectable and not referenced by any goto/next/branch/group/sequence',
        eventId: ev.id,
      });
    if (referenced.has(ev.id) && !ev.enabled)
      warnings.push({
        code: 'unreachable',
        message:
          'event is referenced but disabled; references to it are skipped',
        eventId: ev.id,
      });
  }
  for (const g of pack.groups)
    if (!referenced.has(g.id))
      warnings.push({
        code: 'unreachable',
        message: `group "${g.id}" is never referenced`,
        eventId: g.id,
      });

  // Unbounded loops: every cycle in the goto/next/branch graph must contain
  // an event with maxRepeats > 0 or a terminateIf condition.
  for (const cycle of findCycles(edges)) {
    const bounded = cycle.some(n => {
      const ev = pack.events.find(e => e.id === n);
      return ev && (ev.maxRepeats > 0 || ev.terminateIf !== undefined);
    });
    if (!bounded)
      errors.push({
        code: 'unbounded_loop',
        message: `cycle ${[...cycle, cycle[0]].join(' -> ')} has no exit bound; set maxRepeats or terminateIf on one of its events, or use a "loop" block`,
        eventId: cycle[0],
      });
  }

  if (errors.length) return { ok: false, errors, warnings };
  return {
    ok: true,
    errors,
    warnings,
    pack: {
      id: pack.id,
      name: pack.name,
      events,
      groups: Object.fromEntries(pack.groups.map(g => [g.id, g])),
      sequences: Object.fromEntries(pack.sequences.map(s => [s.id, s])),
      order: pack.events.map(e => e.id),
    },
  };
}

/** Tarjan's SCC; returns strongly connected components that form cycles. */
export function findCycles(edges: Map<string, Set<string>>): string[][] {
  let index = 0;
  const stack: string[] = [];
  const on = new Set<string>();
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const out: string[][] = [];
  const nodes = new Set<string>([
    ...edges.keys(),
    ...[...edges.values()].flatMap(s => [...s]),
  ]);

  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      const selfLoop = comp.length === 1 && edges.get(v)?.has(v);
      if (comp.length > 1 || selfLoop) out.push(comp.reverse());
    }
  };
  for (const n of nodes) if (!idx.has(n)) strong(n);
  return out;
}
