import { describe, it, expect } from 'vitest';
import { evaluate, findContradictions } from '../../src/forge/events/conditions';
import { formatCondition, parseCondition } from '../../src/forge/events/dsl';
import { DEFAULT_EVENT_PACK } from '../../src/forge/events/builtins';
import { compilePack, CompiledPack } from '../../src/forge/events/validate';
import {
  createEngineState,
  EngineInput,
  EngineOptions,
  EngineState,
  engineTick,
  engineTrigger,
  TickResult,
} from '../../src/forge/events/runner';
import { EventDefinition, EventPack } from '../../src/forge/events/types';

const PROMPTS = ['record_observation'];
const CHECKS = ['cleanup_done', 'edging', 'instruction_following'];

const baseEvent = (over: Partial<EventDefinition> & Pick<EventDefinition, 'id'>): EventDefinition => ({
  name: over.id, type: 'custom', description: '', enabled: true, weight: 1, selectable: true, tags: [],
  intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active'],
  cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {}, steps: [],
  ...over,
});

const pack = (events: EventDefinition[], extra: Partial<EventPack> = {}): EventPack => ({
  kind: 'forge.eventPack', schemaVersion: 1, id: 'test', name: 'Test', description: '', events, groups: [], sequences: [], ...extra,
});

const compile = (p: unknown) => {
  const r = compilePack(p, { promptIds: PROMPTS, checkIds: CHECKS });
  if (!r.ok) throw new Error(JSON.stringify(r.errors, null, 2));
  return r.pack!;
};

const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  now: 0, intensity: 5, pace: 2, paceMin: 1, paceMax: 5, phase: 'active', pauses: 0,
  checks: { completed: 0, positive: 0, negative: 0, skipped: 0 }, prompts: { completed: 0, skipped: 0 },
  identity: { id: 'doll', category: 'doll' }, activeStyles: [], mediaTags: [], ...over,
});

const options = (over: Partial<EngineOptions['selection']> = {}, extra: Partial<EngineOptions> = {}): EngineOptions => ({
  selection: { strategy: 'weighted', rollIntervalSeconds: 1, triggerProbability: 1, minGapSeconds: 0, maxChainDepth: 16, maxStepsPerTick: 100, ...over },
  climaxChance: 100, ruinChance: 0, ...extra,
});

/** Run the engine for `seconds`, 100ms ticks, collecting everything. */
function run(p: CompiledPack, opts: EngineOptions, seconds: number, inp: (t: number, s: EngineState) => Partial<EngineInput> = () => ({}), seed = 'seed') {
  let state = createEngineState(seed);
  const all: TickResult[] = [];
  for (let t = 0; t <= seconds * 1000; t += 100) {
    const r = engineTick(p, opts, state, input({ now: t, ...inp(t, state) }));
    state = r.state;
    all.push(r);
  }
  return { state, effects: all.flatMap(r => r.effects), log: all.flatMap(r => r.log) };
}

describe('condition DSL', () => {
  it('parses precedence, not, in, between and round-trips', () => {
    const c = parseCondition('session.intensity >= 4 and not (history.last == "pause" or session.pauses > 3) and identity.category in ["doll", "toy"] and session.pace between 1..3');
    expect(c).toEqual({
      all: [
        { field: 'session.intensity', operator: 'greaterThanOrEqual', value: 4 },
        { not: { any: [{ field: 'history.last', operator: 'equals', value: 'pause' }, { field: 'session.pauses', operator: 'greaterThan', value: 3 }] } },
        { field: 'identity.category', operator: 'in', value: ['doll', 'toy'] },
        { field: 'session.pace', operator: 'between', value: [1, 3] },
      ],
    });
    expect(parseCondition(formatCondition(c))).toEqual(c);
  });
  it('rejects code-like and malformed input with positions', () => {
    expect(() => parseCondition('session.intensity >= ')).toThrow(/expected a value/);
    expect(() => parseCondition('alert(1)')).toThrow(/expected an operator/);
    expect(() => parseCondition('identity.category == doll')).toThrow(/must be quoted/);
    expect(() => parseCondition('a == 1 ; b == 2')).toThrow(/unexpected character ";"/);
    expect(() => parseCondition('(a == 1')).toThrow(/expected "\)"/);
    expect(() => parseCondition('session.intensity > "high"')).toThrow(/requires a number/);
  });
  it('evaluates with missing fields as absent, case-insensitive strings, arrays', () => {
    const scope = { session: { intensity: 5 }, media: { tags: ['Latex'] } };
    expect(evaluate(parseCondition('media.tags contains "latex"'), scope)).toBe(true);
    expect(evaluate(parseCondition('session.nope exists'), scope)).toBe(false);
    expect(evaluate(parseCondition('session.nope > 1'), scope)).toBe(false);
    expect(evaluate({ field: 'x', operator: 'bogus' } as never, scope, { errors: [] })).toBe(false);
  });
  it('detects contradictory bounds', () => {
    const issues = findContradictions(parseCondition('session.intensity >= 8 and session.intensity < 3'));
    expect(issues[0].message).toMatch(/contradictory/);
  });
});

describe('pack validation', () => {
  it('compiles the default pack without errors', () => {
    const r = compilePack(DEFAULT_EVENT_PACK, { promptIds: PROMPTS, checkIds: CHECKS });
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter(w => w.code !== 'unreachable')).toEqual([]);
  });
  it('reports schema errors with event ids', () => {
    const r = compilePack(pack([baseEvent({ id: 'a', weight: -1, steps: [{ do: 'explode' } as never] })]));
    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'schema', eventId: 'a', path: 'events[0].weight' }));
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'schema', eventId: 'a', path: 'events[0].steps[0].do' }));
  });
  it('reports invalid references', () => {
    const r = compilePack(pack([baseEvent({ id: 'a', steps: [{ do: 'goto', target: 'ghost' }], next: 'phantom' })]), { promptIds: [], checkIds: [] });
    expect(r.errors.map(e => e.message)).toEqual([
      'reference to unknown event/group/sequence "ghost"',
      'reference to unknown event/group/sequence "phantom"',
    ]);
  });
  it('reports malformed DSL conditions', () => {
    const r = compilePack(pack([baseEvent({ id: 'a', conditions: 'session.intensity >>= 2' })]));
    expect(r.errors[0]).toMatchObject({ code: 'dsl', eventId: 'a' });
  });
  it('rejects unbounded loops but allows bounded ones', () => {
    const loop = [
      baseEvent({ id: 'a', steps: [{ do: 'goto', target: 'b' }] }),
      baseEvent({ id: 'b', selectable: false, steps: [{ do: 'goto', target: 'a' }] }),
    ];
    const bad = compilePack(pack(loop));
    expect(bad.errors[0]).toMatchObject({ code: 'unbounded_loop' });
    expect(bad.errors[0].message).toContain('a -> b -> a');
    const ok = compilePack(pack([{ ...loop[0], maxRepeats: 3 }, loop[1]]));
    expect(ok.ok).toBe(true);
    const self = compilePack(pack([baseEvent({ id: 's', next: 's' })]));
    expect(self.errors[0].code).toBe('unbounded_loop');
  });
  it('warns about unreachable events and contradictions', () => {
    const r = compilePack(pack([
      baseEvent({ id: 'orphan', selectable: false, steps: [{ do: 'marker', label: 'x' }] }),
      baseEvent({ id: 'never', conditions: 'session.intensity > 8 and session.intensity < 2', steps: [{ do: 'marker', label: 'y' }] }),
    ]));
    expect(r.ok).toBe(true);
    expect(r.warnings.map(w => [w.code, w.eventId])).toEqual([['contradiction', 'never'], ['unreachable', 'orphan']]);
  });
  it('rejects excluded petplay vocabulary in imported packs', () => {
    const r = compilePack(pack([baseEvent({ id: 'a', steps: [{ do: 'message', title: 'Good puppy' }] })]));
    expect(r.errors[0]).toMatchObject({ code: 'prohibited_term', eventId: 'a' });
  });
  it('rejects packs from a newer schema version', () => {
    expect(compilePack({ ...pack([]), schemaVersion: 99 }).errors[0].code).toBe('version');
  });
  it('treats non-object input safely', () => {
    expect(compilePack('{"kind":').ok).toBe(false);
    expect(compilePack(null).ok).toBe(false);
  });
});

describe('selection', () => {
  it('weights selection and respects intensity, identity, phase and media filters', () => {
    const p = compile(pack([
      baseEvent({ id: 'heavy', weight: 9, steps: [{ do: 'marker', label: 'h' }] }),
      baseEvent({ id: 'light', weight: 1, steps: [{ do: 'marker', label: 'l' }] }),
      baseEvent({ id: 'hot', intensity: { min: 9, max: 10 }, steps: [{ do: 'marker', label: 'x' }] }),
      baseEvent({ id: 'auto', identities: ['automaton'], steps: [{ do: 'marker', label: 'x' }] }),
      baseEvent({ id: 'brk', phases: ['break'], steps: [{ do: 'marker', label: 'x' }] }),
      baseEvent({ id: 'latex', mediaTags: ['latex'], steps: [{ do: 'marker', label: 'x' }] }),
    ]));
    const { log } = run(p, options(), 600);
    const picked = log.filter(l => l.type === 'event_selected').map(l => l.eventId);
    expect(new Set(picked)).toEqual(new Set(['heavy', 'light']));
    const ratio = picked.filter(x => x === 'heavy').length / picked.length;
    expect(ratio).toBeGreaterThan(0.8);
    const withMedia = run(p, options(), 100, () => ({ mediaTags: ['latex'] }));
    expect(withMedia.log.some(l => l.type === 'event_selected' && l.eventId === 'latex')).toBe(true);
  });
  it('applies cooldowns, repeat limits and no-repeat windows', () => {
    const p = compile(pack([
      baseEvent({ id: 'once', maxRepeats: 1, weight: 100, steps: [{ do: 'marker', label: 'o' }] }),
      baseEvent({ id: 'cool', cooldownSeconds: 30, steps: [{ do: 'marker', label: 'c' }] }),
      baseEvent({ id: 'other', noRepeatWithin: 1, steps: [{ do: 'marker', label: 'x' }] }),
    ]));
    const { log } = run(p, options(), 120);
    const started = log.filter(l => l.type === 'event_started');
    expect(started.filter(l => l.eventId === 'once')).toHaveLength(1);
    const cools = started.filter(l => l.eventId === 'cool').map(l => l.at);
    for (let i = 1; i < cools.length; i++) expect(cools[i] - cools[i - 1]).toBeGreaterThanOrEqual(30000);
    const ids = started.map(l => l.eventId);
    for (let i = 1; i < ids.length; i++) if (ids[i] === 'other') expect(ids[i - 1]).not.toBe('other');
  });
  it('dice strategy keeps the original guaranteed-climax semantics', () => {
    const p = compile(DEFAULT_EVENT_PACK);
    const r = engineTick(p, options({ strategy: 'dice' }), createEngineState('d'), input({ now: 0, intensity: 10 }));
    expect(r.log[0]).toMatchObject({ type: 'event_selected', eventId: 'climax' });
  });
  it('history-dependent condition only fires after enough pauses', () => {
    const p = compile(DEFAULT_EVENT_PACK);
    const only = { ...p, order: ['stillness_after_pauses'] };
    expect(run(only, options(), 30, () => ({ pauses: 1 })).log.some(l => l.type === 'event_selected')).toBe(false);
    expect(run(only, options(), 30, () => ({ pauses: 2 })).log.some(l => l.eventId === 'stillness_after_pauses')).toBe(true);
  });
  it('sequential and shuffle strategies cover every candidate', () => {
    const evs = ['a', 'b', 'c'].map(id => baseEvent({ id, steps: [{ do: 'marker', label: id }] }));
    const p = compile(pack(evs));
    const seq = run(p, options({ strategy: 'sequential' }), 3).log.filter(l => l.type === 'event_selected').map(l => l.eventId);
    expect(seq.slice(0, 3)).toEqual(['a', 'b', 'c']);
    const sh = run(p, options({ strategy: 'shuffle' }), 3).log.filter(l => l.type === 'event_selected').map(l => l.eventId);
    expect(new Set(sh.slice(0, 3)).size).toBe(3);
  });
});

describe('execution', () => {
  it('is deterministic for a given seed and input stream', () => {
    const p = compile(DEFAULT_EVENT_PACK);
    const a = run(p, options(), 300, () => ({ intensity: 6 }), 'same');
    const b = run(p, options(), 300, () => ({ intensity: 6 }), 'same');
    expect(a.effects).toEqual(b.effects);
    const c = run(p, options(), 300, () => ({ intensity: 6 }), 'different');
    expect(c.effects).not.toEqual(a.effects);
  });
  it('waits, ramps and counts down on the session clock', () => {
    const p = compile(pack([baseEvent({ id: 'r', maxRepeats: 1, steps: [
      { do: 'rampPace', from: 'min', to: 'max', durationSeconds: 4, steps: 4 },
      { do: 'wait', seconds: 2 },
      { do: 'countdown', from: 2, intervalSeconds: 1 },
      { do: 'marker', label: 'done' },
    ] })]));
    const { effects, log } = run(p, options(), 20);
    expect(effects.filter(e => e.type === 'setPace').map(e => (e as { value: number }).value)).toEqual([1, 2, 3, 4, 5]);
    expect(effects.filter(e => e.type === 'message').map(e => (e as { description?: string }).description)).toEqual(['2...', '1...']);
    const done = log.find(l => l.type === 'event_completed')!;
    expect(done.at).toBeGreaterThanOrEqual(8000);
  });
  it('bounded loop runs the configured number of times or until its condition', () => {
    const p = compile(pack([baseEvent({ id: 'l', maxRepeats: 1, loop: { times: 3 }, steps: [{ do: 'marker', label: 'tick' }] })]));
    expect(run(p, options(), 2).effects.filter(e => e.type === 'marker')).toHaveLength(3);
    const until = compile(pack([baseEvent({ id: 'l', maxRepeats: 1, loop: { times: 50, until: 'event.iteration >= 2' }, steps: [{ do: 'marker', label: 'tick' }] })]));
    expect(run(until, options(), 2).effects.filter(e => e.type === 'marker')).toHaveLength(2);
  });
  it('follows chains, groups and weighted branches', () => {
    const p = compile(DEFAULT_EVENT_PACK);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 40; i++) {
      const r = engineTrigger(p, options(), createEngineState(`g${i}`), input({ identity: { id: 'automaton', category: 'automaton' } }), 'automaton_calibration');
      let state = r.state;
      const log = [...r.log];
      for (let t = 0; t < 40000; t += 200) {
        const x = engineTick(p, options({ triggerProbability: 0 }), state, input({ now: t, resolved: [`check:calibration_adjust:1`] }));
        state = x.state;
        log.push(...x.log);
      }
      const outcome = log.find(l => l.type === 'event_started' && /calibration_(pass|adjust)/.test(l.eventId!))!.eventId!;
      counts[outcome] = (counts[outcome] ?? 0) + 1;
      expect(log.filter(l => l.type === 'event_started' && l.eventId === 'automaton_calibration')).toHaveLength(1);
    }
    expect(counts.calibration_pass).toBeGreaterThan(counts.calibration_adjust ?? 0);
  });
  it('aborts runaway chains at the depth limit and keeps the session alive', () => {
    const chain = Array.from({ length: 30 }, (_, i) => baseEvent({ id: `c${i}`, selectable: i === 0, weight: i === 0 ? 1 : 0, next: i < 29 ? `c${i + 1}` : undefined, steps: [] }));
    const p = compile(pack(chain));
    const r = engineTick(p, options({ maxChainDepth: 5 }), createEngineState('x'), input());
    expect(r.log.find(l => l.type === 'engine_error')?.data?.message).toMatch(/maximum chain depth 5/);
    expect(r.state.frames).toEqual([]);
    expect(r.state.ended).toBe(false);
  });
  it('caps steps per tick even for loops the validator cannot see', () => {
    const p = compile(pack([baseEvent({ id: 'spin', loop: { times: 50 }, steps: Array.from({ length: 10 }, () => ({ do: 'marker' as const, label: 'x' })) })]));
    const r = engineTick(p, options({ maxStepsPerTick: 20 }), createEngineState('x'), input());
    expect(r.log.some(l => l.type === 'engine_error' && /steps in one tick/.test(String(l.data?.message)))).toBe(true);
  });
  it('blocking prompts hold the chain until resolved (or skipped by the user)', () => {
    const p = compile(pack([baseEvent({ id: 'q', maxRepeats: 1, steps: [{ do: 'prompt', promptId: 'record_observation' }, { do: 'marker', label: 'after' }] })]));
    const opts = options({}, { blocking: () => true });
    let r = engineTick(p, opts, createEngineState('b'), input());
    const token = (r.effects[0] as { token: string }).token;
    expect(token).toBe('prompt:q:1');
    r = engineTick(p, opts, r.state, input({ now: 5000 }));
    expect(r.effects).toEqual([]);
    r = engineTick(p, opts, r.state, input({ now: 6000, resolved: [token] }));
    expect(r.effects).toEqual([{ type: 'marker', eventId: 'q', label: 'after' }]);
  });
  it('terminateIf aborts before the next step', () => {
    const p = compile(pack([baseEvent({ id: 't', maxRepeats: 1, terminateIf: 'session.intensity >= 9', steps: [{ do: 'marker', label: 'a' }, { do: 'wait', seconds: 1 }, { do: 'marker', label: 'b' }] })]));
    const { effects, log } = run(p, options(), 3, t => ({ intensity: t > 500 ? 9 : 5 }));
    expect(effects.map(e => (e as { label?: string }).label)).toEqual(['a']);
    expect(log.some(l => l.type === 'event_terminated')).toBe(true);
  });
  it('does nothing while paused and never emits pause/stop/resume effects', () => {
    const p = compile(DEFAULT_EVENT_PACK);
    const paused = engineTick(p, options(), createEngineState('p'), input({ paused: true }));
    expect(paused.effects).toEqual([]);
    const { effects } = run(p, options(), 600, () => ({ intensity: 7 }));
    const kinds = new Set(effects.map(e => e.type));
    for (const forbidden of ['pause', 'resume', 'stop', 'lock']) expect(kinds.has(forbidden as never)).toBe(false);
  });
  it('climax sequence ends the session according to configured odds', () => {
    const p = compile(DEFAULT_EVENT_PACK);
    const play = (climaxChance: number, answer: string) => {
      let r = engineTrigger(p, options({ triggerProbability: 0 }, { climaxChance, blocking: () => true }), createEngineState('c'), input({ intensity: 10 }), 'climax');
      let state = r.state;
      const effects = [...r.effects];
      let token: string | undefined;
      for (let t = 0; t < 120000 && !state.ended; t += 250) {
        r = engineTick(p, options({ triggerProbability: 0 }, { climaxChance, blocking: () => true }), state, input({ now: t, intensity: 10, resolved: token ? [token] : [], answers: { edging: answer } }));
        state = r.state;
        effects.push(...r.effects);
        token = (r.effects.find(e => e.type === 'check') as { token?: string } | undefined)?.token ?? token;
      }
      return effects;
    };
    expect(play(100, 'yes').find(e => e.type === 'climax')).toMatchObject({ result: 'climax' });
    expect(play(0, 'yes').find(e => e.type === 'climax')).toMatchObject({ result: 'denied' });
    expect(play(100, 'no').some(e => e.type === 'climax')).toBe(false);
  });
});
