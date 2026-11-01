/**
 * Export of session records. Logs are private by default; exporting is an
 * explicit user action and the UI shows a preview of exactly what will be
 * written. Redaction options strip free text and sensitive metadata.
 */
import { SessionEvent, SessionRecord } from './types';

export type RedactionOptions = {
  /** Remove prompt responses, notes and other user-typed text. */
  excludeFreeText: boolean;
  /** Remove the embedded configuration snapshot (custom vocabulary, identities). */
  excludeConfig: boolean;
  /** Remove media identifiers/URLs. */
  excludeMediaIds: boolean;
  /** Remove generated narration text (keeps style/phrase ids). */
  excludeNarration: boolean;
};

export const PRIVATE_DEFAULTS: RedactionOptions = {
  excludeFreeText: true,
  excludeConfig: false,
  excludeMediaIds: true,
  excludeNarration: false,
};

const FREE_TEXT_KEYS = ['response', 'text', 'note'];

function redactEvent(e: SessionEvent, o: RedactionOptions): SessionEvent {
  const data = { ...e.data };
  if (
    o.excludeFreeText &&
    (e.type === 'prompt_submitted' || e.type === 'prompt_invalid')
  ) {
    for (const k of FREE_TEXT_KEYS) if (k in data) data[k] = '[redacted]';
  }
  if (o.excludeMediaIds && e.type === 'media_shown') {
    delete data.mediaId;
    delete data.source;
  }
  if (
    o.excludeNarration &&
    (e.type === 'narration_shown' ||
      e.type === 'hypno_shown' ||
      e.type === 'message_shown')
  ) {
    if ('text' in data) data.text = '[redacted]';
    if ('title' in data) data.title = '[redacted]';
    if ('lines' in data) data.lines = ['[redacted]'];
  }
  return { ...e, data };
}

export function redactRecord(
  record: SessionRecord,
  o: RedactionOptions
): SessionRecord {
  return {
    ...record,
    config: o.excludeConfig ? undefined : record.config,
    replay: {
      ...record.replay,
      configEmbedded: o.excludeConfig ? false : record.replay.configEmbedded,
      notes: [
        ...record.replay.notes,
        ...Object.entries(o)
          .filter(([, on]) => on)
          .map(([k]) => `export redaction: ${k}`),
      ],
    },
    events: record.events.map(e => redactEvent(e, o)),
    annotations: o.excludeFreeText
      ? record.annotations.map(a => ({
          ...a,
          note: a.note ? '[redacted]' : '',
        }))
      : record.annotations,
    adjustments: o.excludeFreeText
      ? record.adjustments.map(a => ({
          ...a,
          note: a.note ? '[redacted]' : '',
        }))
      : record.adjustments,
  };
}

export function exportJson(
  record: SessionRecord,
  o: RedactionOptions = PRIVATE_DEFAULTS
): string {
  return JSON.stringify(redactRecord(record, o), null, 2);
}

const csvCell = (value: unknown) => {
  const s =
    value === undefined || value === null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const CSV_COLUMNS = [
  'id',
  't_ms',
  'active_ms',
  'type',
  'source',
  'event_id',
  'data',
] as const;

export function exportCsv(
  record: SessionRecord,
  o: RedactionOptions = PRIVATE_DEFAULTS
): string {
  const r = redactRecord(record, o);
  const rows = r.events.map(e =>
    [e.id, e.t, e.activeMs, e.type, e.source, e.eventId ?? '', e.data]
      .map(csvCell)
      .join(',')
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}
