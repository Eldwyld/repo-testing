/**
 * Dry-run simulation and deterministic re-simulation.
 */
import { validateConfig } from '../config/io';
import { compileConfig } from '../config/library';
import { ForgeConfig } from '../config/schema';
import {
  buildScope,
  createEngineState,
  EngineInput,
  ineligibleReason,
} from '../events/runner';
import { EvalTrace } from '../events/conditions';
import { SessionEvent, SessionRecord } from '../session/types';
import { SessionRuntime, ENGINE_VERSION, APP_VERSION } from './runtime';
import { reproducibility } from '../session/replay';

export type DryRunOptions = {
  seconds: number;
  seed: string;
  /** How simulated checks are answered (response id, default first response). */
  checkResponse?: string;
  /** Simulated prompt behaviour. */
  promptAction?: 'skip' | 'submit';
  promptText?: string;
  /** Pause at these active seconds for `pauseSeconds`. */
  pauseAt?: number[];
  pauseSeconds?: number;
};

export type DryRunResult = {
  record: SessionRecord;
  timeline: {
    t: number;
    activeMs: number;
    text: string;
    type: string;
    eventId?: string;
  }[];
  configErrors: string[];
};

const describe = (e: SessionEvent): string => {
  const d = e.data;
  switch (e.type) {
    case 'event_selected':
      return `selected ${e.eventId} (${d.strategy})`;
    case 'event_started':
      return `start ${e.eventId}${Number(d.count) > 1 ? ` (#${d.count})` : ''}`;
    case 'event_completed':
      return `done ${e.eventId}${d.via ? ` via ${d.via}` : ''}`;
    case 'branch_taken':
      return `branch ${e.eventId} -> ${d.goto}`;
    case 'pace_changed':
      return `pace ${d.previousValue ?? '–'} -> ${d.value}`;
    case 'phase_changed':
      return `phase ${d.value}`;
    case 'narration_shown':
      return `“${d.text ?? `(${d.styleId})`}”`;
    case 'message_shown':
      return `[${d.title}${d.description ? ` ${d.description}` : ''}]`;
    case 'check_shown':
      return `check ${d.checkId}: ${d.text}`;
    case 'check_answered':
      return `answered ${d.checkId}: ${d.response}`;
    case 'prompt_shown':
      return `prompt ${d.promptId}: ${d.text}`;
    case 'climax':
      return `climax result: ${d.result}`;
    case 'error':
      return `ERROR ${d.message}`;
    default:
      return e.type;
  }
};

/** Run a full session headlessly with scripted user behaviour. Nothing is stored. */
export function dryRun(config: ForgeConfig, opts: DryRunOptions): DryRunResult {
  const rt = new SessionRuntime(config, {
    seed: opts.seed,
    sessionId: 'dry-run',
  });
  rt.start();
  const pauseAt = [...(opts.pauseAt ?? [])].sort((a, b) => a - b);
  let resumeAtWall: number | null = null;
  const step = rt.tickMs;
  for (
    let t = 0;
    t < opts.seconds * 1000 && rt.view.status !== 'ended';
    t += step
  ) {
    rt.tick(step);
    const v = rt.view;
    if (resumeAtWall !== null && v.wallMs >= resumeAtWall) {
      rt.resume();
      resumeAtWall = null;
    }
    if (
      pauseAt.length &&
      v.activeMs >= pauseAt[0] * 1000 &&
      v.status === 'running'
    ) {
      pauseAt.shift();
      rt.pause('user');
      resumeAtWall = v.wallMs + (opts.pauseSeconds ?? 10) * 1000;
    }
    if (v.check)
      rt.answerCheck(
        v.check.instanceId,
        opts.checkResponse &&
          v.check.responses.some(r => r.id === opts.checkResponse)
          ? opts.checkResponse
          : v.check.responses[0].id
      );
    if (v.prompt) {
      if (opts.promptAction === 'submit') {
        rt.submitPrompt(
          v.prompt.instanceId,
          opts.promptText ?? 'The object remains still.'
        );
        if (rt.view.prompt?.awaitingAck)
          rt.acknowledgePrompt(v.prompt.instanceId);
        if (rt.view.prompt) rt.skipPrompt(v.prompt.instanceId);
      } else rt.skipPrompt(v.prompt.instanceId);
    }
  }
  const interesting = new Set([
    'event_selected',
    'event_started',
    'event_completed',
    'branch_taken',
    'pace_changed',
    'phase_changed',
    'narration_shown',
    'message_shown',
    'check_shown',
    'check_answered',
    'prompt_shown',
    'climax',
    'error',
  ]);
  return {
    record: rt.record,
    timeline: rt.record.events
      .filter(e => interesting.has(e.type))
      .map(e => ({
        t: e.t,
        activeMs: e.activeMs,
        type: e.type,
        eventId: e.eventId,
        text: describe(e),
      })),
    configErrors: rt.view.configErrors,
  };
}

export type Eligibility = {
  eventId: string;
  name: string;
  eligible: boolean;
  reason: string | null;
  trace: EvalTrace[];
};

/** Explain which pool events are eligible in a hypothetical session state. */
export function explainEligibility(
  config: ForgeConfig,
  state: Partial<EngineInput> & { history?: string[] }
): Eligibility[] {
  const compiled = compileConfig(config);
  if (!compiled.pack) return [];
  const input: EngineInput = {
    now: 60000,
    intensity: 5,
    pace: config.session.paceMin,
    paceMin: config.session.paceMin,
    paceMax: config.session.paceMax,
    phase: 'active',
    pauses: 0,
    checks: { completed: 0, positive: 0, negative: 0, skipped: 0 },
    prompts: { completed: 0, skipped: 0 },
    identity: {
      id: config.session.identityId,
      category:
        compiled.library.identities[config.session.identityId]?.category ??
        config.session.identityId,
    },
    activeStyles: config.session.styleMix.map(m => m.styleId),
    mediaTags: [],
    ...state,
  };
  const engine = createEngineState('explain');
  for (const id of state.history ?? []) {
    engine.counts[id] = (engine.counts[id] ?? 0) + 1;
    engine.recent = [...engine.recent, id].slice(-10);
    engine.total++;
  }
  const scope = buildScope(engine, input);
  return compiled.pack.order.map(id => {
    const ev = compiled.pack!.events[id];
    const trace: EvalTrace[] = [];
    const reason = ineligibleReason(ev, engine, input, scope, trace);
    return {
      eventId: id,
      name: ev.name,
      eligible: reason === null,
      reason,
      trace,
    };
  });
}

export type VerifyResult = {
  attempted: boolean;
  matches: boolean;
  compared: number;
  divergences: { index: number; original?: string; replayed?: string }[];
  limitations: string[];
};

const signature = (e: SessionEvent) =>
  `${e.type}|${e.eventId ?? ''}|${e.activeMs}|${e.type === 'pace_changed' ? e.data.value : ''}`;
const COMPARED = new Set([
  'event_started',
  'event_completed',
  'pace_changed',
  'phase_changed',
  'check_shown',
  'prompt_shown',
  'climax',
  'session_ended',
]);

/**
 * Re-run a recorded session from its seed, embedded config and recorded user
 * actions, and compare the engine-driven events against the log. Reports
 * honestly when exact reconstruction is impossible.
 */
export function verifyReplay(record: SessionRecord): VerifyResult {
  const rep = reproducibility(record, {
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
  });
  const limitations = rep.limitations;
  const cfg =
    record.config !== undefined ? validateConfig(record.config) : null;
  if (!cfg || !cfg.ok || !record.replay.seed)
    return {
      attempted: false,
      matches: false,
      compared: 0,
      divergences: [],
      limitations: [
        ...limitations,
        'Re-simulation needs the embedded configuration and seed.',
      ],
    };

  const rt = new SessionRuntime(cfg.value, {
    seed: record.replay.seed,
    tickMs: record.replay.tickMs,
    sessionId: record.sessionId,
  });
  rt.start();
  const textless = record.events.some(
    e => e.type === 'prompt_submitted' && e.data.response === undefined
  );
  if (textless)
    limitations.push(
      'Prompt response text was not recorded; prompt validation is replayed as accepted.'
    );

  const actions = record.events.filter(
    e =>
      (e.source === 'user' &&
        [
          'pause',
          'resume',
          'termination',
          'prompt_submitted',
          'prompt_skipped',
          'prompt_invalid',
          'check_answered',
          'marker',
        ].includes(e.type)) ||
      e.type === 'termination' ||
      // A user-chosen safety pause is a user action; scheduled breaks are automatic.
      (e.type === 'pause' &&
        e.source === 'safety' &&
        e.data.reason === 'safety') ||
      e.type === 'media_shown'
  );
  // tick() caps a single call at 5 s (host stall protection), so advance in chunks.
  const advanceTo = (t: number) => {
    while (rt.view.wallMs < t && rt.view.status !== 'ended')
      rt.tick(Math.min(1000, t - rt.view.wallMs));
  };
  for (const a of actions) {
    advanceTo(a.t);
    const v = rt.view;
    const d = a.data;
    switch (a.type) {
      case 'pause':
        rt.pause(d.reason === 'safety' ? 'safety' : 'user');
        break;
      case 'resume':
        rt.resume();
        break;
      case 'termination':
        rt.terminate(
          d.reason === 'emergency_stop' ? 'emergency_stop' : 'user_terminated'
        );
        break;
      case 'check_answered':
        if (v.check) rt.answerCheck(v.check.instanceId, String(d.response));
        break;
      case 'prompt_skipped':
        if (v.prompt)
          rt.skipPrompt(
            v.prompt.instanceId,
            String(d.reason ?? 'user skipped')
          );
        break;
      case 'prompt_invalid':
      case 'prompt_submitted':
        if (v.prompt)
          rt.submitPrompt(
            v.prompt.instanceId,
            typeof d.response === 'string'
              ? d.response
              : 'x'.repeat(Number(d.responseLength ?? 500))
          );
        break;
      case 'media_shown':
        rt.setMedia(
          typeof d.mediaId === 'string' ? d.mediaId : undefined,
          Array.isArray(d.tags) ? d.tags.map(String) : []
        );
        break;
      case 'marker': {
        const label = String(d.label ?? '');
        if (label === 'prompts disabled') rt.disablePrompts();
        else if (label === 'checks disabled') rt.disableChecks();
        else if (label.startsWith('prompt ') && label.endsWith(' disabled'))
          rt.disablePrompts(label.slice(7, -9));
        else if (label.startsWith('intensity ceiling set to '))
          rt.setIntensityCeiling(Number(label.slice(25)));
        break;
      }
    }
  }
  const last = record.events[record.events.length - 1];
  if (last) advanceTo(last.t);

  const original = record.events
    .filter(e => COMPARED.has(e.type))
    .map(signature);
  const replayed = rt.record.events
    .filter(e => COMPARED.has(e.type))
    .map(signature);
  const divergences: VerifyResult['divergences'] = [];
  const n = Math.max(original.length, replayed.length);
  for (let i = 0; i < n && divergences.length < 20; i++)
    if (original[i] !== replayed[i])
      divergences.push({
        index: i,
        original: original[i],
        replayed: replayed[i],
      });
  return {
    attempted: true,
    matches: divergences.length === 0,
    compared: n,
    divergences,
    limitations,
  };
}
