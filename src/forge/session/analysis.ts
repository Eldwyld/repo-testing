/**
 * Session analysis: reconstruct curves and summaries purely from the
 * recorded event stream. Nothing here depends on live engine state.
 */
import { SessionEvent, SessionEventType, SessionRecord } from './types';

export type Point = { t: number; v: number };
export type Clock = 't' | 'activeMs';

/**
 * Step-function curve from *_changed records. Each point holds until the
 * next one. The initial value comes from session_started data if present.
 */
export function stepCurve(
  events: readonly SessionEvent[],
  type: SessionEventType,
  initialKey: string,
  clock: Clock = 't'
): Point[] {
  const out: Point[] = [];
  const start = events.find(e => e.type === 'session_started');
  const initial = start?.data[initialKey];
  if (typeof initial === 'number') out.push({ t: 0, v: initial });
  for (const e of events) {
    if (e.type !== type || typeof e.data.value !== 'number') continue;
    const t = e[clock];
    if (out.length && out[out.length - 1].t === t)
      out[out.length - 1] = { t, v: e.data.value };
    else out.push({ t, v: e.data.value });
  }
  return out;
}

export const intensityCurve = (
  events: readonly SessionEvent[],
  clock: Clock = 't'
) => stepCurve(events, 'intensity_changed', 'intensity', clock);
export const paceCurve = (
  events: readonly SessionEvent[],
  clock: Clock = 't'
) => stepCurve(events, 'pace_changed', 'pace', clock);

/** Value of a step curve at time t (last point at or before t). */
export function valueAt(
  curve: readonly Point[],
  t: number
): number | undefined {
  let lo = 0;
  let hi = curve.length - 1;
  let ans: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].t <= t) {
      ans = curve[mid].v;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export type Interval = { start: number; end: number; reason?: string };

export function pauseIntervals(
  events: readonly SessionEvent[],
  endT?: number
): Interval[] {
  const out: Interval[] = [];
  let open: SessionEvent | null = null;
  for (const e of events) {
    if (e.type === 'pause' && !open) open = e;
    else if (e.type === 'resume' && open) {
      out.push({
        start: open.t,
        end: e.t,
        reason: String(open.data.reason ?? 'user'),
      });
      open = null;
    }
  }
  if (open)
    out.push({
      start: open.t,
      end: endT ?? events[events.length - 1]?.t ?? open.t,
      reason: String(open.data.reason ?? 'user'),
    });
  return out;
}

export function frequencyBy(
  events: readonly SessionEvent[],
  key: (e: SessionEvent) => string | undefined
) {
  const out: Record<string, number> = {};
  for (const e of events) {
    const k = key(e);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Bucketed counts over time (per `bucketMs`) for a set of types. */
export function histogram(
  events: readonly SessionEvent[],
  types: readonly SessionEventType[],
  bucketMs: number
): { t: number; count: number }[] {
  const end = events[events.length - 1]?.t ?? 0;
  const buckets = Array.from(
    { length: Math.floor(end / bucketMs) + 1 },
    (_, i) => ({ t: i * bucketMs, count: 0 })
  );
  for (const e of events)
    if (types.includes(e.type)) buckets[Math.floor(e.t / bucketMs)].count++;
  return buckets;
}

export type EventFilter = {
  types?: readonly SessionEventType[];
  eventIds?: readonly string[];
  identity?: string;
  style?: string;
  mediaTag?: string;
  intensity?: { min: number; max: number };
  text?: string;
};

/**
 * Filter records. Identity/style/media/intensity filters use the context in
 * effect at the record's timestamp, reconstructed from the stream.
 */
export function filterEvents(
  events: readonly SessionEvent[],
  filter: EventFilter
): SessionEvent[] {
  const intensity = intensityCurve(events);
  let identity: string | undefined;
  let styles: string[] = [];
  let media: string[] = [];
  const text = filter.text?.toLowerCase();
  const out: SessionEvent[] = [];
  for (const e of events) {
    if (e.type === 'identity_set')
      identity = String(e.data.identityId ?? e.data.category ?? '');
    if (e.type === 'styles_set' && Array.isArray(e.data.styles))
      styles = e.data.styles.map(String);
    if (e.type === 'media_shown')
      media = Array.isArray(e.data.tags) ? e.data.tags.map(String) : [];
    if (filter.types?.length && !filter.types.includes(e.type)) continue;
    if (
      filter.eventIds?.length &&
      (!e.eventId || !filter.eventIds.includes(e.eventId))
    )
      continue;
    if (filter.identity && identity !== filter.identity) continue;
    if (
      filter.style &&
      !(e.data.styleId === filter.style || styles.includes(filter.style))
    )
      continue;
    if (filter.mediaTag && !media.includes(filter.mediaTag)) continue;
    if (filter.intensity) {
      const i = valueAt(intensity, e.t) ?? 0;
      if (i < filter.intensity.min || i > filter.intensity.max) continue;
    }
    if (text && !JSON.stringify(e).toLowerCase().includes(text)) continue;
    out.push(e);
  }
  return out;
}

export type Autopsy = {
  durationMs: number;
  activeMs: number;
  endReason?: string;
  peakIntensity: number;
  finalIntensity: number;
  paceRange: [number, number] | null;
  paceChanges: number;
  eventsRun: number;
  eventFrequency: Record<string, number>;
  styleFrequency: Record<string, number>;
  promptsShown: number;
  checksShown: number;
  pauses: Interval[];
  mediaTransitions: number;
  milestones: { t: number; label: string }[];
  errors: { t: number; message: string }[];
  phases: { t: number; phase: string }[];
  significant: { t: number; text: string }[];
};

export function autopsy(record: SessionRecord): Autopsy {
  const ev = record.events;
  const last = ev[ev.length - 1];
  const intensity = intensityCurve(ev);
  const pace = paceCurve(ev);
  const paces = pace.map(p => p.v);
  const started = ev.filter(e => e.type === 'event_started');
  const milestones = ev
    .filter(e => e.type === 'marker')
    .map(e => ({ t: e.t, label: String(e.data.label ?? '') }));
  const phases = ev
    .filter(e => e.type === 'phase_changed')
    .map(e => ({ t: e.t, phase: String(e.data.value) }));
  const errors = ev
    .filter(e => e.type === 'error')
    .map(e => ({ t: e.t, message: String(e.data.message ?? '') }));
  const significant: Autopsy['significant'] = [];
  const peak = intensity.reduce((m, p) => Math.max(m, p.v), 0);
  const peakAt = intensity.find(p => p.v === peak);
  if (peakAt)
    significant.push({
      t: peakAt.t,
      text: `Peak intensity ${peak.toFixed(1)}`,
    });
  for (const m of milestones)
    significant.push({ t: m.t, text: `Milestone: ${m.label}` });
  for (const e of ev.filter(x => x.type === 'climax'))
    significant.push({ t: e.t, text: `Climax outcome: ${e.data.result}` });
  for (const e of ev.filter(x => x.type === 'termination'))
    significant.push({
      t: e.t,
      text: `Session ended by user (${e.data.reason ?? 'stop'})`,
    });
  for (const e of errors)
    significant.push({ t: e.t, text: `Engine error: ${e.message}` });
  significant.sort((a, b) => a.t - b.t);
  return {
    durationMs: last?.t ?? 0,
    activeMs: last?.activeMs ?? 0,
    endReason: record.endReason,
    peakIntensity: peak,
    finalIntensity: intensity[intensity.length - 1]?.v ?? 0,
    paceRange: paces.length ? [Math.min(...paces), Math.max(...paces)] : null,
    paceChanges: ev.filter(e => e.type === 'pace_changed').length,
    eventsRun: started.length,
    eventFrequency: frequencyBy(started, e => e.eventId),
    styleFrequency: frequencyBy(
      ev.filter(e => e.type === 'narration_shown'),
      e => (e.data.styleId ? String(e.data.styleId) : undefined)
    ),
    promptsShown: ev.filter(e => e.type === 'prompt_shown').length,
    checksShown: ev.filter(e => e.type === 'check_shown').length,
    pauses: pauseIntervals(ev),
    mediaTransitions: ev.filter(e => e.type === 'media_shown').length,
    milestones,
    errors,
    phases,
    significant,
  };
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
