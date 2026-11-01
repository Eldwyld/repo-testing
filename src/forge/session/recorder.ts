import {
  EndReason,
  EventSource,
  SessionEvent,
  SessionEventType,
  SessionRecord,
  SESSION_SCHEMA_VERSION,
  ReplayMeta,
} from './types';

type Data = SessionEvent['data'];

/**
 * Append-only session recorder. Values are throttled where the stream would
 * otherwise be noisy (intensity grows continuously), but every discrete
 * change (pace, phase, pause, prompts, checks, events) is kept verbatim.
 */
export class SessionRecorder {
  private seq = 0;
  private lastIntensity: { value: number; at: number } | null = null;
  readonly record: SessionRecord;

  constructor(init: {
    sessionId: string;
    startedAt: Date;
    replay: ReplayMeta;
    config?: unknown;
    title?: string;
  }) {
    this.record = {
      kind: 'forge.session',
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: init.sessionId,
      title: init.title ?? '',
      startedAt: init.startedAt.toISOString(),
      replay: init.replay,
      config: init.config,
      events: [],
      annotations: [],
      adjustments: [],
    };
  }

  static resume(record: SessionRecord): SessionRecorder {
    const r = Object.create(SessionRecorder.prototype) as SessionRecorder;
    Object.assign(r, {
      seq: record.events.length,
      lastIntensity: null,
      record,
    });
    return r;
  }

  get events(): readonly SessionEvent[] {
    return this.record.events;
  }

  push(
    type: SessionEventType,
    t: number,
    activeMs: number,
    source: EventSource,
    data: Data = {},
    eventId?: string
  ): SessionEvent {
    const ev: SessionEvent = {
      id: `e${String(++this.seq).padStart(6, '0')}`,
      t: Math.max(0, Math.round(t)),
      activeMs: Math.max(0, Math.round(activeMs)),
      type,
      source,
      data,
      ...(eventId ? { eventId } : {}),
    };
    this.record.events.push(ev);
    return ev;
  }

  /** Record intensity when it moved by >= 0.1 (0–10 scale) or 5s passed, or when forced. */
  intensity(
    t: number,
    activeMs: number,
    value: number,
    source: EventSource,
    force = false
  ) {
    const last = this.lastIntensity;
    if (
      !force &&
      last &&
      Math.abs(value - last.value) < 0.1 &&
      t - last.at < 5000
    )
      return;
    if (!force && last && Math.abs(value - last.value) < 1e-6) return;
    const previous = last?.value ?? null;
    this.lastIntensity = { value, at: t };
    this.push('intensity_changed', t, activeMs, source, {
      value: Math.round(value * 100) / 100,
      previousValue:
        previous === null ? null : Math.round(previous * 100) / 100,
    });
  }

  end(t: number, activeMs: number, reason: EndReason, at = new Date()) {
    if (this.record.endedAt) return;
    this.push(
      'session_ended',
      t,
      activeMs,
      reason === 'emergency_stop' || reason === 'user_terminated'
        ? 'user'
        : 'system',
      { reason }
    );
    this.record.endedAt = at.toISOString();
    this.record.endReason = reason;
  }
}
