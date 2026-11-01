/**
 * Replay of the user's own recorded sessions.
 *
 * Two kinds of replay are supported and they are deliberately kept apart:
 *  1. Log playback — reconstructs state at any time purely from recorded
 *     events. Always available; never claims to re-run anything.
 *  2. Deterministic re-simulation — re-runs the engine with the recorded seed,
 *     embedded configuration and recorded user inputs (see runtime/verify.ts).
 *     Only offered when `reproducibility()` reports it is possible, and its
 *     result is compared against the log rather than assumed.
 */
import { intensityCurve, paceCurve, Point, valueAt } from './analysis';
import { SessionEvent, SessionRecord } from './types';

export type ReplaySnapshot = {
  t: number;
  activeMs: number;
  intensity: number | undefined;
  pace: number | undefined;
  phase: string | undefined;
  paused: boolean;
  grip: string | undefined;
  lastNarration: string | undefined;
  lastMessage: string | undefined;
  media: { id?: string; tags: string[] } | undefined;
  /** Index of the last event at or before t. */
  index: number;
};

export class ReplayCursor {
  private readonly intensity: Point[];
  private readonly pace: Point[];
  readonly duration: number;

  constructor(readonly events: readonly SessionEvent[]) {
    this.intensity = intensityCurve(events);
    this.pace = paceCurve(events);
    this.duration = events[events.length - 1]?.t ?? 0;
  }

  /** Reconstruct the session state at wall-clock time t. */
  at(t: number): ReplaySnapshot {
    let phase: string | undefined;
    let paused = false;
    let grip: string | undefined;
    let lastNarration: string | undefined;
    let lastMessage: string | undefined;
    let media: ReplaySnapshot['media'];
    let index = -1;
    let activeMs = 0;
    for (let i = 0; i < this.events.length && this.events[i].t <= t; i++) {
      const e = this.events[i];
      index = i;
      activeMs = e.activeMs;
      switch (e.type) {
        case 'phase_changed': phase = String(e.data.value); break;
        case 'pause': paused = true; break;
        case 'resume': paused = false; break;
        case 'grip_changed': grip = String(e.data.value); break;
        case 'narration_shown': lastNarration = String(e.data.text ?? ''); break;
        case 'message_shown': lastMessage = String(e.data.title ?? ''); break;
        case 'media_shown': media = { id: e.data.mediaId ? String(e.data.mediaId) : undefined, tags: Array.isArray(e.data.tags) ? e.data.tags.map(String) : [] }; break;
      }
    }
    if (index >= 0 && !paused) activeMs += t - this.events[index].t;
    return { t, activeMs, intensity: valueAt(this.intensity, t), pace: valueAt(this.pace, t), phase, paused, grip, lastNarration, lastMessage, media, index };
  }

  next(index: number): SessionEvent | undefined {
    return this.events[index + 1];
  }

  prev(index: number): SessionEvent | undefined {
    return index > 0 ? this.events[index - 1] : undefined;
  }

  get curves() {
    return { intensity: this.intensity, pace: this.pace };
  }
}

export type GhostFrame = {
  /** Recorded pace/intensity at the aligned time. */
  pace: number | undefined;
  intensity: number | undefined;
  /** Recorded event markers within the look-ahead/behind window. */
  markers: { offsetMs: number; type: string; label: string }[];
};

/**
 * Ghost overlay: aligns a recorded session to the current session's clock
 * (active time, so pauses in either session do not drift the alignment) and
 * returns what the recording looked like at that point. Read-only: the
 * ghost never feeds back into the live session.
 */
export function ghostAt(record: SessionRecord, currentActiveMs: number, windowMs = 10000): GhostFrame {
  const ev = record.events;
  const intensity = intensityCurve(ev, 'activeMs');
  const pace = paceCurve(ev, 'activeMs');
  const markers = ev
    .filter(e => Math.abs(e.activeMs - currentActiveMs) <= windowMs)
    .filter(e => ['event_started', 'marker', 'pause', 'climax', 'check_shown', 'prompt_shown'].includes(e.type))
    .map(e => ({ offsetMs: e.activeMs - currentActiveMs, type: e.type, label: e.eventId ?? String(e.data.label ?? e.type) }));
  return { pace: valueAt(pace, currentActiveMs), intensity: valueAt(intensity, currentActiveMs), markers };
}

export type Reproducibility = {
  logPlayback: true;
  deterministic: boolean;
  limitations: string[];
};

/** Honest assessment of what can be reproduced from a record. */
export function reproducibility(record: SessionRecord, current: { engineVersion: number; appVersion: string }): Reproducibility {
  const limitations: string[] = [];
  if (!record.replay.seed) limitations.push('No random seed was recorded.');
  if (!record.replay.configEmbedded || record.config === undefined)
    limitations.push('The configuration snapshot is not embedded (it may have been redacted on export).');
  if (record.replay.engineVersion !== current.engineVersion)
    limitations.push(`Recorded with engine v${record.replay.engineVersion}; this app runs engine v${current.engineVersion}.`);
  if (record.replay.appVersion !== current.appVersion)
    limitations.push(`Recorded with app ${record.replay.appVersion}; current app is ${current.appVersion}. Behaviour may differ.`);
  limitations.push('Media files are never embedded; images/videos may no longer be available, and their timing is replayed from the log only.');
  if (record.events.some(e => e.type === 'error')) limitations.push('The session logged engine errors; recovery paths may not reproduce exactly.');
  if (!record.endedAt) limitations.push('The session was interrupted before it ended; the tail of the log may be incomplete.');
  const deterministic = limitations.length === 1; // only the media caveat
  return { logPlayback: true, deterministic, limitations };
}
