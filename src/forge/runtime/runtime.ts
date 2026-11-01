/**
 * SessionRuntime — framework-independent orchestration of one session.
 *
 * It owns the session clock, intensity, the event engine, narration,
 * prompts, checks, hypno lines and the session recorder. Hosts (the game
 * plugin, the simulator, tests) drive it with `tick(dtMs)` and user actions,
 * and render `view`.
 *
 * Safety contract (enforced here, outside the event engine):
 *  - terminate() always ends the session immediately, whatever is pending.
 *  - pause() always pauses; nothing in an event script can resume it.
 *  - intensity never exceeds min(safety ceiling, identity max).
 *  - prompts and checks can always be skipped or disabled mid-session.
 *  - the duration limit ends the session even while paused.
 *
 * Determinism: time advances in fixed steps (`tickMs`). User actions are
 * applied at step boundaries and recorded with their wall time, so a run can
 * be re-simulated from (seed, config, recorded actions).
 */
import pkg from '../../../package.json';
import { Rng } from '../core/rng';
import { ComplianceCheck, createCheckScheduleState, dueCheck, markShown, CheckScheduleState } from '../checks/checks';
import { compileConfig, CompiledConfig } from '../config/library';
import { ForgeConfig } from '../config/schema';
import { CompiledPack } from '../events/validate';
import { createEngineState, EngineEffect, EngineInput, EngineLog, EngineState, engineTick, engineTrigger, buildScope } from '../events/runner';
import { IdentityProfile, AnatomyProfile, PronounSet } from '../identity/types';
import { narrate, NarrationContext } from '../identity/render';
import { resolveDictionaries } from '../identity/resolve';
import { composeLine, hypnoInterval, hypnoLine } from '../narrative/compose';
import { PromptTemplate, promptsForTrigger, validateResponse, PromptValidation } from '../prompts/prompts';
import { SessionRecorder } from '../session/recorder';
import { EndReason, SessionRecord } from '../session/types';

export const ENGINE_VERSION = 1;
export const APP_VERSION: string = pkg.version;

export type PromptInstance = {
  instanceId: string;
  promptId: string;
  eventId?: string;
  token?: string;
  text: string;
  required: boolean;
  blocking: boolean;
  attempts: number;
  maxAttempts: number;
  minLength: number;
  maxLength: number;
  openedAt: number;
  deadline?: number;
  problems: string[];
  awaitingAck: boolean;
};

export type CheckInstance = {
  instanceId: string;
  checkId: string;
  eventId?: string;
  token?: string;
  kind: string;
  text: string;
  responses: { id: string; label: string }[];
  openedAt: number;
  deadline?: number;
  blocking: boolean;
};

export type DisplayLine = {
  id: string;
  kind: 'narration' | 'message' | 'system';
  eventId?: string;
  title: string;
  description?: string;
  styleId?: string;
  /** activeMs after which the line is hidden; undefined = until its event completes. */
  until?: number;
};

export type RuntimeStatus = 'running' | 'paused' | 'break' | 'ended';

export type RuntimeView = {
  status: RuntimeStatus;
  phase: string;
  intensity: number;
  ceiling: number;
  pace: number;
  grip: string;
  activeMs: number;
  wallMs: number;
  durationLimitMs: number | null;
  identity: { id: string; name: string; category: string };
  styles: string[];
  lines: DisplayLine[];
  hypno?: { lines: string[]; patternId: string; at: number };
  prompt?: PromptInstance;
  check?: CheckInstance;
  running?: { eventId: string; name: string };
  pauseReason?: string;
  endReason?: EndReason;
  climax?: 'climax' | 'denied' | 'ruined';
  recording: boolean;
  mediaRequests: number;
  promptsEnabled: boolean;
  checksEnabled: boolean;
  configErrors: string[];
};

export type RuntimeOptions = {
  seed?: string;
  sessionId?: string;
  startedAt?: Date;
  tickMs?: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export class SessionRuntime {
  readonly config: ForgeConfig;
  readonly compiled: CompiledConfig;
  readonly seed: string;
  readonly tickMs: number;
  readonly recorder: SessionRecorder;

  private rng: Rng;
  private engine: EngineState;
  private pack: CompiledPack | null;
  private basePack: CompiledPack | null;
  private identity: IdentityProfile;
  private anatomy: AnatomyProfile;
  private pronouns: PronounSet;

  private accumulator = 0;
  private wallMs = 0;
  private activeMs = 0;
  private started = false;
  private paused = false;
  private pauseReason: string | undefined;
  private breakUntilWall: number | null = null;
  private nextBreakAt: number | null = null;
  private ended = false;
  private endReason: EndReason | undefined;
  private intensity: number;
  private ceilingOverride: number | null = null;
  private pace: number;
  private phase: string;
  private grip = 'both';
  private lines: DisplayLine[] = [];
  private lineSeq = 0;
  private hypno: RuntimeView['hypno'];
  private hypnoTimer = 0;
  private prompt: PromptInstance | undefined;
  private check: CheckInstance | undefined;
  private instanceSeq = 0;
  private resolved: string[] = [];
  private answers: Record<string, string> = {};
  private pauses = 0;
  private checkStats = { completed: 0, positive: 0, negative: 0, skipped: 0 };
  private promptStats = { completed: 0, skipped: 0 };
  private checkSchedule: CheckScheduleState = createCheckScheduleState();
  private promptLast: Record<string, number> = {};
  private promptCounts: Record<string, number> = {};
  private promptsEnabled: boolean;
  private checksEnabled: boolean;
  private disabledPrompts = new Set<string>();
  private mediaTags: string[] = [];
  private mediaRequests = 0;
  private lastStyle: string | undefined;
  private climax: RuntimeView['climax'];
  private pendingTriggers: string[] = [];

  constructor(config: ForgeConfig, opts: RuntimeOptions = {}) {
    this.config = structuredClone(config);
    this.compiled = compileConfig(this.config);
    this.seed = opts.seed ?? config.session.seed ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.tickMs = opts.tickMs ?? 50;
    this.rng = Rng.fromSeed(`${this.seed}:runtime`);
    this.engine = createEngineState(`${this.seed}:engine`);
    this.basePack = this.compiled.pack;
    this.pack = this.basePack;

    const lib = this.compiled.library;
    const s = config.session;
    this.identity = lib.identities[s.identityId] ?? Object.values(lib.identities)[0];
    this.anatomy = lib.anatomy[s.anatomyId] ?? Object.values(lib.anatomy)[0];
    this.pronouns = (s.pronounsOverride && lib.pronouns[s.pronounsOverride]) || this.identity.pronouns;
    if (s.personOverride) this.identity = { ...this.identity, person: s.personOverride };
    this.intensity = this.clampIntensity(s.startIntensity);
    this.pace = s.paceMin;
    this.phase = s.warmupSeconds > 0 ? 'warmup' : 'active';
    this.promptsEnabled = config.prompts.enabled;
    this.checksEnabled = config.checks.enabled;
    if (config.safety.breaks.enabled) this.nextBreakAt = config.safety.breaks.everyMinutes * 60000;

    this.recorder = new SessionRecorder({
      sessionId: opts.sessionId ?? `s-${this.seed.replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'session'}`,
      startedAt: opts.startedAt ?? new Date(),
      config: config.logging.embedConfig ? this.config : undefined,
      replay: {
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        seed: this.seed,
        configHash: hashConfig(this.config),
        configEmbedded: config.logging.embedConfig,
        tickMs: this.tickMs,
        mediaEmbedded: false,
        notes: [],
      },
    });
  }

  // ------------------------------------------------------------------ helpers

  get ceiling(): number {
    const base = Math.min(this.config.safety.intensityCeiling, this.identity.intensity.max);
    return this.ceilingOverride === null ? base : Math.min(base, this.ceilingOverride);
  }

  private clampIntensity(n: number) {
    return Math.max(this.identity?.intensity.min ?? 0, Math.min(this.ceiling, n));
  }

  private log(type: Parameters<SessionRecorder['push']>[0], source: Parameters<SessionRecorder['push']>[3], data: Record<string, unknown> = {}, eventId?: string) {
    return this.recorder.push(type, this.wallMs, this.activeMs, source, data as never, eventId);
  }

  private narrationContext(style?: string): NarrationContext {
    return {
      identity: this.identity,
      anatomy: this.anatomy,
      pronouns: this.pronouns,
      dictionaries: this.compiled.library.dictionaries,
      rng: this.rng,
      style,
      intensity: this.intensity,
      prohibitedWords: this.config.safety.extraProhibitedWords,
      vars: {
        pace: r2(this.pace),
        intensity: Math.round(this.intensity * 10) / 10,
        phase: this.phase,
        grip: this.grip === 'both' ? 'both hands' : `${this.grip} hand`,
        count: this.engine.total,
        elapsed: Math.floor(this.activeMs / 1000),
      },
    };
  }

  private renderText(template: string): string {
    const r = narrate(template, this.narrationContext());
    if (r.blocked.length) {
      this.log('error', 'system', { message: `text blocked by content guard: ${r.blocked.join(', ')}` });
      return '';
    }
    return r.text;
  }

  private readMs(seconds: number | undefined) {
    return seconds === undefined ? undefined : seconds * 1000 * this.config.accessibility.readingTimeMultiplier;
  }

  private engineInput(): EngineInput {
    return {
      now: this.activeMs,
      intensity: this.intensity,
      pace: this.pace,
      paceMin: this.config.session.paceMin,
      paceMax: this.config.session.paceMax,
      phase: this.phase,
      grip: this.grip,
      pauses: this.pauses,
      checks: this.checkStats,
      prompts: this.promptStats,
      identity: { id: this.identity.id, category: this.identity.category },
      activeStyles: this.config.session.styleMix.filter(m => m.strength > 0).map(m => m.styleId),
      mediaTags: this.mediaTags,
      resolved: this.resolved,
      answers: this.answers,
      paused: this.paused || this.breakUntilWall !== null,
    };
  }

  private get engineOptions() {
    return {
      selection: this.config.events.selection,
      climaxChance: this.config.session.climaxChance,
      ruinChance: this.config.session.ruinChance,
      blocking: (kind: 'prompt' | 'check', id: string) => {
        if (kind === 'prompt') {
          const p = this.config.prompts.templates.find(x => x.id === id);
          return !!p && p.blocking && this.promptAvailable(p);
        }
        const c = this.config.checks.items.find(x => x.id === id);
        return !!c && c.blocking && c.enabled && this.checksEnabled;
      },
    };
  }

  private promptAvailable(p: PromptTemplate) {
    return this.promptsEnabled && p.enabled && !this.disabledPrompts.has(p.id);
  }

  // ------------------------------------------------------------------ lifecycle

  start() {
    if (this.started) return;
    this.started = true;
    this.log('session_started', 'system', {
      intensity: r2(this.intensity),
      pace: this.pace,
      phase: this.phase,
      seed: this.seed,
      identityId: this.identity.id,
      anatomyId: this.anatomy.id,
      configHash: this.recorder.record.replay.configHash,
    });
    this.log('identity_set', 'system', { identityId: this.identity.id, category: this.identity.category, pronouns: this.pronouns.id, person: this.identity.person });
    this.log('styles_set', 'system', { styles: this.config.session.styleMix.filter(m => m.strength > 0).map(m => m.styleId) });
    this.log('pace_changed', 'system', { value: this.pace, previousValue: null });
    this.log('phase_changed', 'system', { value: this.phase });
    for (const e of this.compiled.errors) this.log('error', 'system', { message: `event configuration: ${e.eventId ? `[${e.eventId}] ` : ''}${e.message}`, recovery: 'events disabled for this session' });
  }

  /** Advance wall time by dtMs (any size); work happens in fixed steps. */
  tick(dtMs: number) {
    if (!this.started) this.start();
    if (this.ended || dtMs <= 0) return;
    this.accumulator += Math.min(dtMs, 5000);
    while (this.accumulator >= this.tickMs && !this.ended) {
      this.accumulator -= this.tickMs;
      this.step(this.tickMs);
    }
  }

  private step(dt: number) {
    this.wallMs += dt;
    const limit = this.config.safety.maxDurationMinutes * 60000;
    if (limit > 0 && this.wallMs >= limit) {
      this.end('duration_limit', 'safety');
      return;
    }
    if (this.breakUntilWall !== null) {
      if (this.wallMs >= this.breakUntilWall) {
        this.breakUntilWall = null;
        this.log('resume', 'safety', { reason: 'scheduled_break', safety: true });
      } else return;
    }
    if (this.paused) return;

    this.activeMs += dt;

    if (this.nextBreakAt !== null && this.activeMs >= this.nextBreakAt) {
      this.nextBreakAt = this.activeMs + this.config.safety.breaks.everyMinutes * 60000;
      this.breakUntilWall = this.wallMs + this.config.safety.breaks.lengthSeconds * 1000;
      this.log('pause', 'safety', { reason: 'scheduled_break', safety: true, seconds: this.config.safety.breaks.lengthSeconds });
      return;
    }

    if (this.phase === 'warmup' && this.activeMs >= this.config.session.warmupSeconds * 1000) this.setPhase('active', 'system');

    if (this.phase === 'active') {
      const before = this.intensity;
      this.intensity = this.clampIntensity(this.intensity + (dt / (this.config.session.durationSeconds * 1000)) * 10);
      this.afterIntensityChange(before, 'system');
    }

    this.expireLines();
    this.tickTimeouts();
    this.tickEngine();
    this.tickHypno(dt);
    this.tickChecks(dt);
  }

  private afterIntensityChange(before: number, source: 'system' | 'engine' | 'user') {
    if (before === this.intensity) return;
    this.recorder.intensity(this.wallMs, this.activeMs, this.intensity, source, source !== 'system');
    for (const p of promptsForTrigger(this.config.prompts.templates, { on: 'intensity_threshold', value: this.intensity, previous: before }))
      this.openPrompt(p, {});
  }

  private setPhase(phase: string, source: 'system' | 'engine', eventId?: string) {
    if (phase === this.phase) return;
    this.phase = phase;
    this.log('phase_changed', source, { value: phase }, eventId);
    for (const p of promptsForTrigger(this.config.prompts.templates, { on: 'phase_change', value: phase })) this.openPrompt(p, { eventId });
  }

  private expireLines() {
    this.lines = this.lines.filter(l => l.until === undefined || l.until > this.activeMs);
    if (this.hypno && this.activeMs - this.hypno.at > 6000) this.hypno = undefined;
  }

  private tickEngine() {
    if (!this.pack) return;
    const input = this.engineInput();
    let result = engineTick(this.pack, this.engineOptions, this.engine, input);
    if (!result.state.frames.length && this.pendingTriggers.length) {
      const target = this.pendingTriggers.shift()!;
      const t = engineTrigger(this.pack, this.engineOptions, result.state, input, target);
      result = { state: t.state, effects: [...result.effects, ...t.effects], log: [...result.log, ...t.log] };
    }
    this.resolved = [];
    this.engine = result.state;
    for (const entry of result.log) this.recordEngineLog(entry);
    for (const effect of result.effects) {
      if (this.ended) break;
      this.applyEffect(effect);
    }
  }

  private recordEngineLog(entry: EngineLog) {
    const data: Record<string, unknown> = { ...(entry.data ?? {}) };
    if (entry.type === 'event_started' && entry.eventId) {
      data.count = this.engine.counts[entry.eventId] ?? 1;
      data.name = this.pack?.events[entry.eventId]?.name;
      for (const p of promptsForTrigger(this.config.prompts.templates, { on: 'event', value: entry.eventId })) this.openPrompt(p, { eventId: entry.eventId });
      if (entry.eventId === 'half_pace') for (const p of promptsForTrigger(this.config.prompts.templates, { on: 'half_pace' })) this.openPrompt(p, { eventId: entry.eventId });
    }
    if (entry.type === 'event_completed' || entry.type === 'event_terminated')
      this.lines = this.lines.filter(l => !(l.eventId === entry.eventId && l.until === undefined));
    if (entry.type === 'engine_error') {
      this.log('error', 'engine', data, entry.eventId);
      return;
    }
    this.log(entry.type, 'engine', data, entry.eventId);
  }

  private pushLine(line: Omit<DisplayLine, 'id'>) {
    // A newer line from the same event replaces the older one.
    if (line.eventId) this.lines = this.lines.filter(l => l.eventId !== line.eventId || l.kind !== line.kind);
    this.lines = [...this.lines, { ...line, id: `l${++this.lineSeq}` }].slice(-4);
  }

  private applyEffect(effect: EngineEffect) {
    const id = effect.eventId;
    switch (effect.type) {
      case 'narrate': {
        if (!this.config.session.narrationEnabled) return;
        let text: string | null = null;
        let styleId: string | undefined;
        if (effect.template) {
          styleId = effect.styles[0];
          const r = narrate(effect.template, this.narrationContext(styleId));
          const excluded = this.config.safety.excludedPhrases.find(x => x && r.text.toLowerCase().includes(x.toLowerCase()));
          if (r.blocked.length || excluded) {
            this.log('event_skipped', 'system', { reason: r.blocked.length ? `blocked term ${r.blocked[0]}` : `excluded phrase "${excluded}"` }, id);
            return;
          }
          text = r.text;
        } else {
          const line = composeLine({
            styles: this.compiled.library.styles,
            mix: this.config.session.styleMix,
            narration: this.narrationContext(),
            scope: buildScope(this.engine, this.engineInput()),
            previousStyle: this.lastStyle,
            excluded: this.config.safety.excludedPhrases,
            only: effect.styles,
          });
          if (!line) {
            this.log('event_skipped', 'system', { reason: 'no eligible narrative style or phrase' }, id);
            return;
          }
          text = line.transition ? `${line.transition} ${line.text}` : line.text;
          styleId = line.styleId;
          this.lastStyle = line.styleId;
        }
        this.pushLine({ kind: 'narration', eventId: id, title: text, styleId, until: this.activeMs + this.readMs(effect.durationMs / 1000)! });
        this.log('narration_shown', 'engine', { ...(this.config.logging.recordNarrationText ? { text } : {}), styleId: styleId ?? null }, id);
        return;
      }
      case 'message': {
        const existing = this.lines.find(l => l.eventId === id && l.kind === 'message');
        const title = effect.title ? this.renderText(effect.title) : existing?.title ?? '';
        const description = effect.description ? this.renderText(effect.description) : undefined;
        if (!title && !description) return;
        this.pushLine({ kind: 'message', eventId: id, title, description, until: effect.durationMs !== undefined ? this.activeMs + this.readMs(effect.durationMs / 1000)! : undefined });
        this.log('message_shown', 'engine', { title: this.config.logging.recordNarrationText ? title : '', description: description ?? null }, id);
        return;
      }
      case 'setPace': {
        const value = r2(Math.min(this.config.session.paceMax, Math.max(this.config.session.paceMin, effect.value)));
        if (value === this.pace) return;
        this.log('pace_changed', 'engine', { value, previousValue: this.pace }, id);
        this.pace = value;
        return;
      }
      case 'setPhase':
        this.setPhase(effect.phase, 'engine', id);
        return;
      case 'grip':
        this.grip = effect.value;
        this.log('grip_changed', 'engine', { value: effect.value }, id);
        return;
      case 'intensity': {
        const before = this.intensity;
        this.intensity = this.clampIntensity(this.intensity + effect.add);
        this.afterIntensityChange(before, 'engine');
        return;
      }
      case 'prompt': {
        const p = this.config.prompts.templates.find(x => x.id === effect.promptId);
        if (!p || !this.promptAvailable(p)) {
          this.log('event_skipped', 'system', { reason: 'prompt disabled', promptId: effect.promptId }, id);
          if (effect.token) this.resolved.push(effect.token);
          return;
        }
        this.openPrompt(p, { eventId: id, token: effect.token, force: true });
        return;
      }
      case 'check': {
        const c = this.config.checks.items.find(x => x.id === effect.checkId);
        if (!c || !c.enabled || !this.checksEnabled) {
          this.log('event_skipped', 'system', { reason: 'check disabled', checkId: effect.checkId }, id);
          if (effect.token) this.resolved.push(effect.token);
          return;
        }
        this.openCheck(c, { eventId: id, token: effect.token });
        return;
      }
      case 'media':
        this.mediaRequests++;
        return;
      case 'marker':
        this.log('marker', 'engine', { label: effect.label }, id);
        return;
      case 'climax':
        this.climax = effect.result;
        this.log('climax', 'engine', { result: effect.result }, id);
        for (const p of promptsForTrigger(this.config.prompts.templates, { on: 'climax' })) this.openPrompt(p, { eventId: id });
        return;
      case 'end':
        this.end('completed', 'engine', effect.reason);
        return;
    }
  }

  private tickHypno(dt: number) {
    if (!this.config.hypno.enabled || this.phase !== 'active') return;
    this.hypnoTimer += dt;
    if (this.hypnoTimer < hypnoInterval(this.config.hypno, this.intensity)) return;
    this.hypnoTimer = 0;
    const transition = this.rng.chance(this.config.hypno.transitionFrequency);
    const line = hypnoLine(this.config.hypno, this.narrationContext(), { transition });
    if (!line) return;
    const excluded = this.config.safety.excludedPhrases;
    if (line.lines.some(l => excluded.some(x => x && l.toLowerCase().includes(x.toLowerCase())))) return;
    this.hypno = { ...line, at: this.activeMs };
    this.log('hypno_shown', 'engine', { patternId: line.patternId, ...(this.config.logging.recordNarrationText ? { lines: line.lines } : {}) });
  }

  private tickChecks(dt: number) {
    if (!this.checksEnabled || this.check || this.prompt) return;
    const c = dueCheck(this.config.checks.items, this.checkSchedule, this.activeMs, dt, this.rng, buildScope(this.engine, this.engineInput()), this.config.checks.globalMinGapSeconds);
    if (c) this.openCheck(c, {});
  }

  private tickTimeouts() {
    if (this.check?.deadline !== undefined && this.activeMs >= this.check.deadline) {
      const c = this.config.checks.items.find(x => x.id === this.check!.checkId);
      const countsAs = c?.unansweredAs ?? 'skipped';
      this.log('check_timeout', 'system', { checkId: this.check.checkId, instanceId: this.check.instanceId, countsAs }, this.check.eventId);
      if (countsAs === 'skipped') this.checkStats.skipped++;
      this.closeCheck();
    }
    if (this.prompt?.deadline !== undefined && this.activeMs >= this.prompt.deadline) {
      const p = this.config.prompts.templates.find(x => x.id === this.prompt!.promptId);
      if (p?.onTimeout === 'skip') {
        this.log('prompt_timeout', 'system', { promptId: this.prompt.promptId, instanceId: this.prompt.instanceId }, this.prompt.eventId);
        this.promptStats.skipped++;
        this.answers[this.prompt.promptId] = 'timeout';
        this.closePrompt();
      } else this.prompt.deadline = undefined;
    }
  }

  // ------------------------------------------------------------------ prompts

  private openPrompt(p: PromptTemplate, opts: { eventId?: string; token?: string; force?: boolean }) {
    if (!this.promptAvailable(p)) {
      if (opts.token) this.resolved.push(opts.token);
      return;
    }
    const now = this.activeMs;
    const tooSoon = this.promptLast[p.id] !== undefined && now - this.promptLast[p.id] < p.cooldownSeconds * 1000;
    const tooMany = p.maxPerSession > 0 && (this.promptCounts[p.id] ?? 0) >= p.maxPerSession;
    if (this.prompt || (!opts.force && (tooSoon || tooMany))) {
      // One prompt at a time; a blocked event-locked prompt must not stall the engine.
      if (opts.token) this.resolved.push(opts.token);
      this.log('event_skipped', 'system', { reason: this.prompt ? 'another prompt is open' : 'prompt cooldown/limit', promptId: p.id }, opts.eventId);
      return;
    }
    this.promptLast[p.id] = now;
    this.promptCounts[p.id] = (this.promptCounts[p.id] ?? 0) + 1;
    const template = p.identityText[this.identity.category] ?? p.text;
    this.prompt = {
      instanceId: `p${++this.instanceSeq}`,
      promptId: p.id,
      eventId: opts.eventId,
      token: opts.token,
      text: this.renderText(template),
      required: p.required,
      blocking: p.blocking,
      attempts: 0,
      maxAttempts: p.retry.maxAttempts,
      minLength: p.minLength,
      maxLength: p.maxLength,
      openedAt: now,
      deadline: p.timeoutSeconds > 0 ? now + p.timeoutSeconds * 1000 : undefined,
      problems: [],
      awaitingAck: false,
    };
    this.log('prompt_shown', 'system', { promptId: p.id, instanceId: this.prompt.instanceId, text: this.prompt.text, blocking: p.blocking, required: p.required }, opts.eventId);
  }

  private closePrompt() {
    if (this.prompt?.token) this.resolved.push(this.prompt.token);
    this.prompt = undefined;
  }

  /** Vocabulary the identity's dictionaries offer (for object-language checks). */
  identityVocabulary(categories: readonly string[] = []): string[] {
    const chain = resolveDictionaries(this.identity.dictionaries, this.compiled.library.dictionaries).chain;
    const words = chain.flatMap(d => d.entries.filter(e => e.enabled && (!categories.length || categories.includes(e.category))).map(e => e.text));
    return [...new Set([...words, this.identity.objectNoun.singular, ...this.identity.preferredWords])].filter(w => !w.includes('{'));
  }

  submitPrompt(instanceId: string, text: string): PromptValidation | null {
    const inst = this.prompt;
    if (this.ended || !inst || inst.instanceId !== instanceId) return null;
    const p = this.config.prompts.templates.find(x => x.id === inst.promptId)!;
    if (inst.awaitingAck) return null;
    const result = validateResponse(text, p, {
      identityVocabulary: this.identityVocabulary(p.vocabulary.categories),
      objectNouns: [this.identity.objectNoun.singular, this.identity.displayName],
    });
    inst.attempts++;
    const record = this.config.logging.recordPromptText ? { response: text.slice(0, 5000) } : { responseLength: text.length };
    if (!result.valid && inst.attempts < inst.maxAttempts) {
      inst.problems = result.problems;
      this.log('prompt_invalid', 'user', { promptId: p.id, instanceId, attempt: inst.attempts, problems: result.problems, ...record }, inst.eventId);
      return result;
    }
    const accepted = result.valid || p.retry.onExhausted === 'accept';
    if (!accepted) return this.skipPrompt(instanceId, 'retries exhausted'), result;
    this.log('prompt_submitted', 'user', { promptId: p.id, instanceId, valid: result.valid, attempts: inst.attempts, matched: result.matched, perspective: result.perspective, ...record }, inst.eventId);
    this.promptStats.completed++;
    this.answers[p.id] = 'submitted';
    if (p.resume === 'acknowledge') {
      inst.awaitingAck = true;
      inst.problems = [];
    } else this.closePrompt();
    return result;
  }

  acknowledgePrompt(instanceId: string) {
    if (this.prompt?.instanceId === instanceId && this.prompt.awaitingAck) this.closePrompt();
  }

  /** Always available, even for required prompts. */
  skipPrompt(instanceId: string, reason = 'user skipped') {
    const inst = this.prompt;
    if (!inst || inst.instanceId !== instanceId) return;
    this.log('prompt_skipped', 'user', { promptId: inst.promptId, instanceId, reason, required: inst.required }, inst.eventId);
    this.promptStats.skipped++;
    this.answers[inst.promptId] = 'skipped';
    this.closePrompt();
  }

  /** Disable a prompt template (or all prompts) for the rest of the session. */
  disablePrompts(promptId?: string) {
    if (promptId) this.disabledPrompts.add(promptId);
    else this.promptsEnabled = false;
    this.log('marker', 'user', { label: promptId ? `prompt ${promptId} disabled` : 'prompts disabled' });
    if (this.prompt && (!promptId || this.prompt.promptId === promptId)) this.skipPrompt(this.prompt.instanceId, 'disabled by user');
  }

  /** Host signals that a video/media segment finished playing. */
  mediaSegmentEnded() {
    for (const p of promptsForTrigger(this.config.prompts.templates, { on: 'media_segment_end' })) this.openPrompt(p, {});
  }

  // ------------------------------------------------------------------ checks

  private openCheck(c: ComplianceCheck, opts: { eventId?: string; token?: string }) {
    if (this.check) {
      if (opts.token) this.resolved.push(opts.token);
      this.log('event_skipped', 'system', { reason: 'another check is open', checkId: c.id }, opts.eventId);
      return;
    }
    markShown(this.checkSchedule, c.id, this.activeMs);
    this.check = {
      instanceId: `c${++this.instanceSeq}`,
      checkId: c.id,
      eventId: opts.eventId,
      token: opts.token,
      kind: c.kind,
      text: this.renderText(c.text),
      responses: c.responses.map(r => ({ id: r.id, label: r.label })),
      openedAt: this.activeMs,
      deadline: c.timeoutSeconds > 0 ? this.activeMs + c.timeoutSeconds * 1000 : undefined,
      blocking: !!opts.token,
    };
    this.log('check_shown', 'system', { checkId: c.id, instanceId: this.check.instanceId, kind: c.kind, text: this.check.text }, opts.eventId);
  }

  private closeCheck() {
    if (this.check?.token) this.resolved.push(this.check.token);
    this.check = undefined;
  }

  answerCheck(instanceId: string, responseId: string) {
    const inst = this.check;
    if (this.ended || !inst || inst.instanceId !== instanceId) return;
    const c = this.config.checks.items.find(x => x.id === inst.checkId)!;
    const response = c.responses.find(r => r.id === responseId);
    if (!response) return;
    this.log('check_answered', 'user', { checkId: c.id, instanceId, kind: c.kind, response: response.id, value: response.value, latencyMs: this.activeMs - inst.openedAt }, inst.eventId);
    this.answers[c.id] = response.id;
    if (response.value === 'skip') this.checkStats.skipped++;
    else {
      this.checkStats.completed++;
      if (response.value === 'positive') this.checkStats.positive++;
      if (response.value === 'negative') this.checkStats.negative++;
    }
    if (response.stat) {
      const { name, add } = response.stat;
      this.engine = { ...this.engine, stats: { ...this.engine.stats, [name]: (this.engine.stats[name] ?? 0) + add } };
      this.log('stat_changed', 'user', { name, add, value: this.engine.stats[name] }, inst.eventId);
    }
    // Consequences only when the user explicitly configured one.
    if (response.value === 'negative' && c.onNegativeEvent) this.pendingTriggers.push(c.onNegativeEvent);
    this.closeCheck();
  }

  disableChecks() {
    this.checksEnabled = false;
    this.log('marker', 'user', { label: 'checks disabled' });
    if (this.check) {
      this.log('check_timeout', 'system', { checkId: this.check.checkId, instanceId: this.check.instanceId, countsAs: 'skipped', reason: 'checks disabled by user' }, this.check.eventId);
      this.closeCheck();
    }
  }

  // ------------------------------------------------------------------ user controls (always available)

  pause(reason: 'user' | 'safety' = 'user') {
    if (this.ended || this.paused) return;
    this.paused = true;
    this.pauseReason = reason;
    this.pauses += reason === 'user' ? 1 : 0;
    this.log('pause', reason === 'safety' ? 'safety' : 'user', { reason, ...(reason === 'safety' ? { safety: true } : {}) });
    // Safety pauses never open prompts.
    if (reason === 'user') for (const p of promptsForTrigger(this.config.prompts.templates, { on: 'pause' })) this.openPrompt(p, {});
  }

  resume() {
    if (this.ended || !this.paused) return;
    this.paused = false;
    this.pauseReason = undefined;
    this.log('resume', 'user', {});
    for (const p of promptsForTrigger(this.config.prompts.templates, { on: 'resume' })) this.openPrompt(p, {});
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause('user');
  }

  /** Immediate termination. Never depends on prompts, events or tallies. */
  terminate(reason: 'user_terminated' | 'emergency_stop' = 'user_terminated') {
    if (this.ended) return;
    this.log('termination', reason === 'emergency_stop' ? 'safety' : 'user', { reason, safety: reason === 'emergency_stop' });
    this.end(reason, 'user');
  }

  setIntensityCeiling(value: number) {
    this.ceilingOverride = Math.max(0, Math.min(10, value));
    const before = this.intensity;
    this.intensity = this.clampIntensity(this.intensity);
    this.log('marker', 'user', { label: `intensity ceiling set to ${this.ceilingOverride}` });
    this.afterIntensityChange(before, 'user');
  }

  setMedia(mediaId: string | undefined, extraTags: string[] = []) {
    const tags = [...new Set([...(mediaId ? this.config.media.tags[mediaId] ?? [] : []), ...extraTags])];
    this.mediaTags = tags;
    this.log('media_shown', 'system', { ...(mediaId ? { mediaId } : {}), tags });
    this.pack = applyMediaWeights(this.basePack, this.config, tags);
  }

  private end(reason: EndReason, source: 'user' | 'engine' | 'system' | 'safety', detail?: string) {
    if (this.ended) return;
    this.ended = true;
    this.endReason = reason;
    if (this.prompt) {
      this.log('prompt_skipped', 'system', { promptId: this.prompt.promptId, instanceId: this.prompt.instanceId, reason: 'session ended' }, this.prompt.eventId);
      this.prompt = undefined;
    }
    if (this.check) {
      this.log('check_timeout', 'system', { checkId: this.check.checkId, instanceId: this.check.instanceId, countsAs: 'skipped', reason: 'session ended' }, this.check.eventId);
      this.check = undefined;
    }
    if (detail) this.log('marker', source === 'safety' ? 'safety' : 'system', { label: `ended: ${detail}` });
    this.recorder.end(this.wallMs, this.activeMs, reason);
  }

  // ------------------------------------------------------------------ view

  get view(): RuntimeView {
    const top = this.engine.frames[this.engine.frames.length - 1];
    const runningId = top?.kind === 'event' ? top.eventId : top?.kind === 'sequence' ? top.sequenceId : undefined;
    const limit = this.config.safety.maxDurationMinutes * 60000;
    return {
      status: this.ended ? 'ended' : this.breakUntilWall !== null ? 'break' : this.paused ? 'paused' : 'running',
      phase: this.phase,
      intensity: this.intensity,
      ceiling: this.ceiling,
      pace: this.pace,
      grip: this.grip,
      activeMs: this.activeMs,
      wallMs: this.wallMs,
      durationLimitMs: limit > 0 ? limit : null,
      identity: { id: this.identity.id, name: this.identity.displayName, category: this.identity.category },
      styles: this.config.session.styleMix.filter(m => m.strength > 0).map(m => m.styleId),
      lines: this.lines,
      hypno: this.hypno,
      prompt: this.prompt,
      check: this.check,
      running: runningId ? { eventId: runningId, name: this.pack?.events[runningId]?.name ?? runningId } : undefined,
      pauseReason: this.pauseReason,
      endReason: this.endReason,
      climax: this.climax,
      recording: this.config.logging.enabled,
      mediaRequests: this.mediaRequests,
      promptsEnabled: this.promptsEnabled,
      checksEnabled: this.checksEnabled,
      configErrors: this.compiled.errors.map(e => `${e.eventId ? `[${e.eventId}] ` : ''}${e.message}`),
    };
  }

  get record(): SessionRecord {
    return this.recorder.record;
  }

  get engineState(): Readonly<EngineState> {
    return this.engine;
  }
}

/** Multiply event weights for events associated with the current media tags. */
export function applyMediaWeights(pack: CompiledPack | null, config: ForgeConfig, tags: readonly string[]): CompiledPack | null {
  if (!pack) return pack;
  const assoc = config.media.associations.filter(a => tags.includes(a.tag));
  if (!assoc.length) return pack;
  const events = { ...pack.events };
  for (const a of assoc)
    for (const id of a.events) if (events[id]) events[id] = { ...events[id], weight: events[id].weight * a.weightMultiplier };
  return { ...pack, events };
}

export function hashConfig(config: unknown): string {
  const text = JSON.stringify(config);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
