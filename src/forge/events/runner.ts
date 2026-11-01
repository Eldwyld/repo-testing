/**
 * Event engine interpreter.
 *
 * `engineTick` is a pure function: (pack, options, state, input) ->
 * (state, effects, log). It never touches the UI, the clock or storage; the
 * host (game plugin, simulator, tests) supplies time and state snapshots and
 * applies the returned effects. Because all randomness comes from the
 * serialisable RNG in `state`, a run is reproducible from its seed and inputs.
 *
 * Safety: the engine has no way to pause/resume the user's session, block
 * termination, or exceed the intensity ceiling — those effects do not exist
 * in its vocabulary, and the runtime clamps everything it emits.
 */
import { createRngState, Rng, RngState } from '../core/rng';
import { Condition, ConditionScope, evaluate, EvalTrace } from './conditions';
import { CompiledEvent, CompiledPack } from './validate';
import { GRIPS, SelectionConfig } from './types';

export type EngineInput = {
  /** Active (unpaused) session time in ms. */
  now: number;
  intensity: number;
  pace: number;
  paceMin: number;
  paceMax: number;
  phase: string;
  grip?: string;
  pauses: number;
  checks: {
    completed: number;
    positive: number;
    negative: number;
    skipped: number;
  };
  prompts: { completed: number; skipped: number };
  identity: { id: string; category: string };
  activeStyles: string[];
  mediaTags: string[];
  /** Awaiting tokens the host has resolved since the last tick. */
  resolved?: string[];
  /** Latest response value per check/prompt id (e.g. answers.edging == "yes"). */
  answers?: Record<string, string>;
  /** When true the engine does nothing (user pause / break overlay). */
  paused?: boolean;
};

export type EngineOptions = {
  selection: SelectionConfig;
  climaxChance: number;
  ruinChance: number;
  /** Whether a prompt/check should hold the chain until answered (or skipped). */
  blocking?: (kind: 'prompt' | 'check', id: string) => boolean;
  /** Record condition traces for selection decisions (dry-run / debugging). */
  trace?: boolean;
};

export type EngineEffect =
  | {
      type: 'narrate';
      eventId: string;
      template?: string;
      styles: string[];
      durationMs: number;
    }
  | {
      type: 'message';
      eventId: string;
      title: string;
      description?: string;
      durationMs?: number;
    }
  | { type: 'setPace'; eventId: string; value: number }
  | { type: 'setPhase'; eventId: string; phase: string }
  | { type: 'grip'; eventId: string; value: string }
  | { type: 'intensity'; eventId: string; add: number }
  | { type: 'prompt'; eventId: string; promptId: string; token?: string }
  | { type: 'check'; eventId: string; checkId: string; token?: string }
  | { type: 'media'; eventId: string; tags: string[] }
  | { type: 'marker'; eventId: string; label: string }
  | { type: 'climax'; eventId: string; result: 'climax' | 'denied' | 'ruined' }
  | { type: 'end'; eventId: string; reason: string };

export type EngineLogType =
  | 'event_selected'
  | 'event_started'
  | 'event_completed'
  | 'event_terminated'
  | 'event_skipped'
  | 'branch_taken'
  | 'stat_changed'
  | 'var_set'
  | 'engine_error';

export type EngineLog = {
  type: EngineLogType;
  at: number;
  eventId?: string;
  data?: Record<string, unknown>;
};

type Frame =
  | {
      kind: 'event';
      eventId: string;
      stepIndex: number;
      iteration: number;
      depth: number;
      started: boolean;
      waitUntil?: number;
      awaiting?: string;
      ramp?: { values: number[]; i: number; intervalMs: number };
      countdown?: { n: number; intervalMs: number; title?: string };
    }
  | { kind: 'sequence'; sequenceId: string; index: number; depth: number };

export type EngineState = {
  rng: RngState;
  frames: Frame[];
  counts: Record<string, number>;
  lastRunAt: Record<string, number>;
  recent: string[];
  total: number;
  stats: Record<string, number>;
  vars: Record<string, string | number | boolean>;
  nextRollAt: number;
  lastEndAt: number;
  seqCursor: number;
  bag: string[];
  groupCursor: Record<string, number>;
  awaitCounter: number;
  ended: boolean;
};

export function createEngineState(seed: string): EngineState {
  return {
    rng: createRngState(seed),
    frames: [],
    counts: {},
    lastRunAt: {},
    recent: [],
    total: 0,
    stats: {},
    vars: {},
    nextRollAt: 0,
    lastEndAt: -Infinity,
    seqCursor: 0,
    bag: [],
    groupCursor: {},
    awaitCounter: 0,
    ended: false,
  };
}

export function buildScope(
  state: EngineState,
  input: EngineInput,
  extra: Record<string, unknown> = {}
): ConditionScope {
  return {
    session: {
      intensity: input.intensity,
      pace: input.pace,
      phase: input.phase,
      grip: input.grip,
      elapsedSeconds: Math.floor(input.now / 1000),
      pauses: input.pauses,
      checks: input.checks,
      prompts: input.prompts,
    },
    identity: input.identity,
    styles: { active: input.activeStyles },
    media: { tags: input.mediaTags },
    history: {
      last: state.recent[state.recent.length - 1],
      recent: state.recent,
      count: state.counts,
      total: state.total,
    },
    stats: state.stats,
    vars: state.vars,
    answers: input.answers ?? {},
    ...extra,
  };
}

/** Why an event is not currently eligible for pool selection (null = eligible). */
export function ineligibleReason(
  ev: CompiledEvent,
  state: EngineState,
  input: EngineInput,
  scope: ConditionScope,
  trace?: EvalTrace[]
): string | null {
  if (!ev.enabled) return 'disabled';
  if (!ev.selectable) return 'not selectable (chain-only)';
  if (ev.weight <= 0) return 'weight is 0';
  if (!ev.phases.includes(input.phase as never))
    return `phase "${input.phase}" not in [${ev.phases.join(', ')}]`;
  if (input.intensity < ev.intensity.min || input.intensity > ev.intensity.max)
    return `intensity ${input.intensity.toFixed(1)} outside ${ev.intensity.min}–${ev.intensity.max}`;
  if (ev.identities.length && !ev.identities.includes(input.identity.category))
    return `identity "${input.identity.category}" not allowed`;
  if (
    ev.mediaTags.length &&
    !ev.mediaTags.some(t => input.mediaTags.includes(t))
  )
    return 'current media lacks required tags';
  if (ev.maxRepeats > 0 && (state.counts[ev.id] ?? 0) >= ev.maxRepeats)
    return `repeat limit ${ev.maxRepeats} reached`;
  const last = state.lastRunAt[ev.id];
  if (
    last !== undefined &&
    ev.cooldownSeconds > 0 &&
    input.now - last < ev.cooldownSeconds * 1000
  )
    return 'cooling down';
  if (
    ev.noRepeatWithin > 0 &&
    state.recent.slice(-ev.noRepeatWithin).includes(ev.id)
  )
    return `ran within the last ${ev.noRepeatWithin} events`;
  if (ev.conditions && !evaluate(ev.conditions, scope, { trace }))
    return 'conditions not met';
  return null;
}

type Ctx = {
  pack: CompiledPack;
  opts: EngineOptions;
  state: EngineState;
  input: EngineInput;
  rng: Rng;
  effects: EngineEffect[];
  log: EngineLog[];
  pace: number;
  phase: string;
  grip?: string;
};

const MAX_RECENT = 10;

function scopeOf(c: Ctx, frame?: Frame): ConditionScope {
  return buildScope(
    c.state,
    { ...c.input, pace: c.pace, phase: c.phase },
    frame?.kind === 'event'
      ? { event: { id: frame.eventId, iteration: frame.iteration } }
      : {}
  );
}

function check(c: Ctx, cond: Condition | undefined, frame?: Frame) {
  const errors: string[] = [];
  const result = evaluate(cond, scopeOf(c, frame), { errors });
  for (const e of errors)
    c.log.push({
      type: 'engine_error',
      at: c.input.now,
      eventId: frame?.kind === 'event' ? frame.eventId : undefined,
      data: { message: e },
    });
  return result;
}

function abortChain(c: Ctx, message: string, eventId?: string) {
  c.log.push({
    type: 'engine_error',
    at: c.input.now,
    eventId,
    data: { message, recovery: 'chain aborted; session continues' },
  });
  c.state.frames = [];
  c.state.lastEndAt = c.input.now;
}

/** Resolve a goto target (event, group or sequence) and push it. */
function pushTarget(
  c: Ctx,
  target: string,
  depth: number,
  via: string
): boolean {
  if (depth > c.opts.selection.maxChainDepth) {
    abortChain(
      c,
      `maximum chain depth ${c.opts.selection.maxChainDepth} exceeded via "${via}"`,
      via
    );
    return false;
  }
  const { pack, state } = c;
  if (pack.events[target]) {
    if (!pack.events[target].enabled) {
      c.log.push({
        type: 'event_skipped',
        at: c.input.now,
        eventId: target,
        data: { reason: 'disabled', via },
      });
      return false;
    }
    state.frames.push({
      kind: 'event',
      eventId: target,
      stepIndex: 0,
      iteration: 0,
      depth,
      started: false,
    });
    return true;
  }
  const group = pack.groups[target];
  if (group) {
    const members = group.members.filter(
      m => pack.events[m.event]?.enabled && m.weight > 0
    );
    let chosen: string | undefined;
    if (group.mode === 'sequential') {
      const i = state.groupCursor[group.id] ?? 0;
      chosen = members[i % Math.max(1, members.length)]?.event;
      state.groupCursor[group.id] = i + 1;
    } else if (group.mode === 'shuffle') {
      const order = [...members];
      for (let i = order.length - 1; i > 0; i--) {
        const j = c.rng.int(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      chosen = order[0]?.event;
    } else chosen = c.rng.weighted(members, m => m.weight)?.event;
    if (!chosen) {
      c.log.push({
        type: 'event_skipped',
        at: c.input.now,
        eventId: group.id,
        data: { reason: 'group has no enabled members', via },
      });
      return false;
    }
    return pushTarget(c, chosen, depth, via);
  }
  const seq = pack.sequences[target];
  if (seq) {
    if (!seq.enabled) return false;
    state.frames.push({
      kind: 'sequence',
      sequenceId: seq.id,
      index: 0,
      depth,
    });
    return true;
  }
  abortChain(c, `unknown target "${target}"`, via);
  return false;
}

function select(c: Ctx): string | undefined {
  const { pack, state, input, opts, rng } = c;
  const scope = scopeOf(c);
  const candidates: { id: string; weight: number }[] = [];
  for (const id of pack.order) {
    const ev = pack.events[id];
    if (!ineligibleReason(ev, state, input, scope))
      candidates.push({ id, weight: ev.weight });
  }
  for (const seq of Object.values(pack.sequences))
    if (seq.enabled && seq.weight > 0 && input.phase === 'active')
      candidates.push({ id: seq.id, weight: seq.weight });
  if (!candidates.length) return undefined;

  switch (opts.selection.strategy) {
    case 'dice': {
      // Original joi.how semantics: weight N means "1 in N"; weight 1 is guaranteed.
      const guaranteed = candidates.find(x => x.weight === 1);
      if (guaranteed) return guaranteed.id;
      const roll = rng.next();
      let cumulative = 0;
      for (const x of candidates) {
        cumulative += 1 / x.weight;
        if (roll < cumulative) return x.id;
      }
      return undefined;
    }
    case 'sequential': {
      if (!rng.chance(opts.selection.triggerProbability)) return undefined;
      for (let k = 0; k < pack.order.length; k++) {
        const id = pack.order[(state.seqCursor + k) % pack.order.length];
        if (candidates.some(x => x.id === id)) {
          state.seqCursor = (state.seqCursor + k + 1) % pack.order.length;
          return id;
        }
      }
      return undefined;
    }
    case 'shuffle': {
      if (!rng.chance(opts.selection.triggerProbability)) return undefined;
      if (!state.bag.some(id => candidates.some(x => x.id === id))) {
        const bag = candidates.map(x => x.id);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = rng.int(i + 1);
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        state.bag = bag;
      }
      const index = state.bag.findIndex(id =>
        candidates.some(x => x.id === id)
      );
      return index >= 0 ? state.bag.splice(index, 1)[0] : undefined;
    }
    default:
      if (!rng.chance(opts.selection.triggerProbability)) return undefined;
      return rng.weighted(candidates, x => x.weight)?.id;
  }
}

function resolvePace(c: Ctx, value: number | 'min' | 'max' | 'current') {
  if (value === 'min') return c.input.paceMin;
  if (value === 'max') return c.input.paceMax;
  if (value === 'current') return c.pace;
  return value;
}

const round = (n: number) => Math.round(n * 100) / 100;
const clampPace = (c: Ctx, n: number) =>
  round(Math.min(c.input.paceMax, Math.max(c.input.paceMin, n)));

function setPace(c: Ctx, eventId: string, value: number) {
  c.pace = clampPace(c, value);
  c.effects.push({ type: 'setPace', eventId, value: c.pace });
}

function finishEvent(
  c: Ctx,
  frame: Extract<Frame, { kind: 'event' }>,
  ev: CompiledEvent
) {
  c.state.frames.pop();
  c.log.push({
    type: 'event_completed',
    at: c.input.now,
    eventId: ev.id,
    data: { iterations: frame.iteration },
  });
  if (ev.next) pushTarget(c, ev.next, frame.depth + 1, ev.id);
  if (!c.state.frames.length) c.state.lastEndAt = c.input.now;
}

/** Execute one unit of work for the top frame. Returns false when the tick should stop. */
function advance(c: Ctx): boolean {
  const { state, input, pack, rng } = c;
  const frame = state.frames[state.frames.length - 1];
  if (!frame) return false;

  if (frame.kind === 'sequence') {
    const seq = pack.sequences[frame.sequenceId];
    if (!seq || frame.index >= seq.events.length) {
      state.frames.pop();
      if (!state.frames.length) state.lastEndAt = input.now;
      return true;
    }
    const target = seq.events[frame.index++];
    pushTarget(c, target, frame.depth + 1, seq.id);
    return true;
  }

  const ev = pack.events[frame.eventId];
  if (!ev) {
    abortChain(
      c,
      `event "${frame.eventId}" vanished from the pack`,
      frame.eventId
    );
    return true;
  }
  if (frame.waitUntil !== undefined && input.now < frame.waitUntil)
    return false;
  frame.waitUntil = undefined;
  if (frame.awaiting) {
    if (!(input.resolved ?? []).includes(frame.awaiting)) return false;
    frame.awaiting = undefined;
  }

  if (!frame.started) {
    frame.started = true;
    state.counts[ev.id] = (state.counts[ev.id] ?? 0) + 1;
    state.lastRunAt[ev.id] = input.now;
    state.recent = [...state.recent, ev.id].slice(-MAX_RECENT);
    state.total++;
    c.log.push({
      type: 'event_started',
      at: input.now,
      eventId: ev.id,
      data: { depth: frame.depth, eventType: ev.type, tags: ev.tags },
    });
  }

  if (ev.terminateIf && check(c, ev.terminateIf, frame)) {
    state.frames.pop();
    c.log.push({
      type: 'event_terminated',
      at: input.now,
      eventId: ev.id,
      data: { reason: 'terminateIf matched' },
    });
    if (!state.frames.length) state.lastEndAt = input.now;
    return true;
  }

  // Ongoing multi-tick steps.
  if (frame.ramp) {
    const r = frame.ramp;
    setPace(c, ev.id, r.values[r.i++]);
    if (r.i >= r.values.length) {
      frame.ramp = undefined;
      frame.stepIndex++;
    } else frame.waitUntil = input.now + r.intervalMs;
    return true;
  }
  if (frame.countdown) {
    const cd = frame.countdown;
    c.effects.push({
      type: 'message',
      eventId: ev.id,
      title: cd.title ?? '',
      description: `${cd.n}...`,
      durationMs: cd.intervalMs + 500,
    });
    cd.n--;
    if (cd.n <= 0) {
      frame.countdown = undefined;
      frame.stepIndex++;
    }
    frame.waitUntil = input.now + cd.intervalMs;
    return true;
  }

  if (frame.stepIndex >= ev.steps.length) {
    frame.iteration++;
    const loopAgain =
      ev.loop &&
      frame.iteration < ev.loop.times &&
      !(ev.loop.until && check(c, ev.loop.until, frame));
    if (loopAgain) {
      frame.stepIndex = 0;
      return true;
    }
    finishEvent(c, frame, ev);
    return true;
  }

  const step = ev.steps[frame.stepIndex];
  const id = ev.id;
  switch (step.do) {
    case 'narrate':
      c.effects.push({
        type: 'narrate',
        eventId: id,
        template: step.template,
        styles: step.styles.length ? step.styles : ev.styles,
        durationMs: step.durationSeconds * 1000,
      });
      break;
    case 'message':
      c.effects.push({
        type: 'message',
        eventId: id,
        title: step.title,
        description: step.description,
        durationMs:
          step.durationSeconds !== undefined
            ? step.durationSeconds * 1000
            : undefined,
      });
      break;
    case 'setPace': {
      let value = c.pace;
      if (step.snap) value = resolvePace(c, step.snap);
      if (step.random) value = rng.range(input.paceMin, input.paceMax);
      if (step.value !== undefined) value = step.value;
      if (step.multiply !== undefined) value *= step.multiply;
      setPace(c, id, value);
      break;
    }
    case 'rampPace': {
      const from = resolvePace(c, step.from);
      const to = resolvePace(c, step.to);
      const values = Array.from(
        { length: step.steps + 1 },
        (_, i) => from + ((to - from) * i) / step.steps
      );
      frame.ramp = {
        values,
        i: 0,
        intervalMs: (step.durationSeconds * 1000) / step.steps,
      };
      return true;
    }
    case 'wait': {
      const s = Array.isArray(step.seconds)
        ? rng.range(step.seconds[0], step.seconds[1])
        : step.seconds;
      frame.waitUntil = input.now + s * 1000;
      frame.stepIndex++;
      return true;
    }
    case 'countdown':
      frame.countdown = {
        n: step.from,
        intervalMs: step.intervalSeconds * 1000,
        title: step.title,
      };
      return true;
    case 'setPhase':
      c.phase = step.phase;
      c.effects.push({ type: 'setPhase', eventId: id, phase: step.phase });
      break;
    case 'grip': {
      const options = GRIPS.filter(g => g !== c.grip);
      const value = step.value ?? rng.pick(options)!;
      c.grip = value;
      c.effects.push({ type: 'grip', eventId: id, value });
      break;
    }
    case 'intensity':
      c.effects.push({ type: 'intensity', eventId: id, add: step.add });
      break;
    case 'prompt':
    case 'check': {
      const kind = step.do;
      const target =
        kind === 'prompt'
          ? (step as { promptId: string }).promptId
          : (step as { checkId: string }).checkId;
      const blocks = c.opts.blocking?.(kind, target) ?? false;
      const token = blocks
        ? `${kind}:${id}:${++state.awaitCounter}`
        : undefined;
      if (kind === 'prompt')
        c.effects.push({
          type: 'prompt',
          eventId: id,
          promptId: target,
          token,
        });
      else
        c.effects.push({ type: 'check', eventId: id, checkId: target, token });
      frame.stepIndex++;
      if (token) {
        frame.awaiting = token;
        return false;
      }
      return true;
    }
    case 'stat':
      state.stats = {
        ...state.stats,
        [step.name]: (state.stats[step.name] ?? 0) + step.add,
      };
      c.log.push({
        type: 'stat_changed',
        at: input.now,
        eventId: id,
        data: { name: step.name, add: step.add, value: state.stats[step.name] },
      });
      break;
    case 'setVar':
      state.vars = { ...state.vars, [step.name]: step.value };
      c.log.push({
        type: 'var_set',
        at: input.now,
        eventId: id,
        data: { name: step.name, value: step.value },
      });
      break;
    case 'media':
      c.effects.push({ type: 'media', eventId: id, tags: step.tags });
      break;
    case 'marker':
      c.effects.push({ type: 'marker', eventId: id, label: step.label });
      break;
    case 'branch': {
      const open = step.branches.filter(
        b => !b.when || check(c, b.when, frame)
      );
      const chosen =
        step.mode === 'weighted' ? rng.weighted(open, b => b.weight) : open[0];
      frame.stepIndex++;
      if (!chosen) break;
      c.log.push({
        type: 'branch_taken',
        at: input.now,
        eventId: id,
        data: {
          goto: chosen.goto,
          mode: step.mode,
          open: open.map(b => b.goto),
        },
      });
      state.frames.pop();
      c.log.push({
        type: 'event_completed',
        at: input.now,
        eventId: id,
        data: { via: 'branch' },
      });
      pushTarget(c, chosen.goto, frame.depth + 1, id);
      if (!state.frames.length) state.lastEndAt = input.now;
      return true;
    }
    case 'goto':
      state.frames.pop();
      c.log.push({
        type: 'event_completed',
        at: input.now,
        eventId: id,
        data: { via: 'goto' },
      });
      pushTarget(c, step.target, frame.depth + 1, id);
      if (!state.frames.length) state.lastEndAt = input.now;
      return true;
    case 'climax': {
      const roll = rng.next() * 100;
      let result: 'climax' | 'denied' | 'ruined' = 'climax';
      if (roll > c.opts.climaxChance) result = 'denied';
      else if (rng.next() * 100 <= c.opts.ruinChance) result = 'ruined';
      c.effects.push({ type: 'climax', eventId: id, result });
      state.vars = { ...state.vars, climaxResult: result };
      break;
    }
    case 'end':
      c.effects.push({ type: 'end', eventId: id, reason: step.reason });
      state.frames = [];
      state.ended = true;
      return false;
  }
  frame.stepIndex++;
  return true;
}

export type TickResult = {
  state: EngineState;
  effects: EngineEffect[];
  log: EngineLog[];
};

export function engineTick(
  pack: CompiledPack,
  opts: EngineOptions,
  prev: EngineState,
  input: EngineInput
): TickResult {
  if (input.paused || prev.ended) return { state: prev, effects: [], log: [] };
  const state: EngineState = structuredClone(prev);
  const rng = new Rng(state.rng);
  const c: Ctx = {
    pack,
    opts,
    state,
    input,
    rng,
    effects: [],
    log: [],
    pace: input.pace,
    phase: input.phase,
    grip: input.grip,
  };

  if (!state.frames.length && input.now >= state.nextRollAt) {
    state.nextRollAt = input.now + opts.selection.rollIntervalSeconds * 1000;
    if (input.now - state.lastEndAt >= opts.selection.minGapSeconds * 1000) {
      const chosen = select(c);
      if (chosen) {
        c.log.push({
          type: 'event_selected',
          at: input.now,
          eventId: chosen,
          data: { strategy: opts.selection.strategy, rng: rng.state.draws },
        });
        pushTarget(c, chosen, 0, 'pool');
      }
    }
  }

  let steps = 0;
  while (state.frames.length && !state.ended) {
    if (++steps > opts.selection.maxStepsPerTick) {
      const top = state.frames[state.frames.length - 1];
      abortChain(
        c,
        `more than ${opts.selection.maxStepsPerTick} steps in one tick (runaway loop?)`,
        top?.kind === 'event' ? top.eventId : undefined
      );
      break;
    }
    if (!advance(c)) break;
  }

  state.rng = rng.state;
  return { state, effects: c.effects, log: c.log };
}

/** Start a specific event/group/sequence immediately (user-triggered or event-locked). */
export function engineTrigger(
  pack: CompiledPack,
  opts: EngineOptions,
  prev: EngineState,
  input: EngineInput,
  target: string
): TickResult {
  const state: EngineState = structuredClone(prev);
  const rng = new Rng(state.rng);
  const c: Ctx = {
    pack,
    opts,
    state,
    input,
    rng,
    effects: [],
    log: [],
    pace: input.pace,
    phase: input.phase,
    grip: input.grip,
  };
  if (state.frames.length) {
    c.log.push({
      type: 'event_skipped',
      at: input.now,
      eventId: target,
      data: { reason: 'engine busy' },
    });
  } else if (pushTarget(c, target, 0, 'trigger')) {
    c.log.push({
      type: 'event_selected',
      at: input.now,
      eventId: target,
      data: { strategy: 'trigger' },
    });
  }
  state.rng = rng.state;
  const after = engineTick(
    pack,
    opts,
    { ...state, nextRollAt: Infinity },
    input
  );
  after.state.nextRollAt = prev.nextRollAt;
  return {
    state: after.state,
    effects: [...c.effects, ...after.effects],
    log: [...c.log, ...after.log],
  };
}
