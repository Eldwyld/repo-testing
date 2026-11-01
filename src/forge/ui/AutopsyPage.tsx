/**
 * Session autopsy: timeline, curves, filters, replay scrubber, determinism
 * check, accounting checklist with annotations/adjustments, and export with
 * a preview of exactly what will be written.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { computeAccounting } from '../accounting/accounting';
import {
  autopsy,
  filterEvents,
  formatMs,
  intensityCurve,
  paceCurve,
  EventFilter,
} from '../session/analysis';
import {
  exportCsv,
  exportJson,
  PRIVATE_DEFAULTS,
  RedactionOptions,
} from '../session/export';
import { ReplayCursor, reproducibility } from '../session/replay';
import {
  SESSION_EVENT_TYPES,
  SessionEvent,
  SessionRecord,
  SessionEventType,
} from '../session/types';
import { verifyReplay, VerifyResult } from '../runtime/simulate';
import { APP_VERSION, ENGINE_VERSION } from '../runtime/runtime';
import { Card, MultiSelect, RangeField, StepChart, Toggle } from './components';
import { download } from './files';
import { ForgeConfigProvider } from './ConfigContext';
import { AgeGate } from './AgeGate';
import { rootClass, rootStyle, useForgeConfig } from './forgeConfigState';
import './forge.css';
import './theme-sticker.css';
import { StickerEmblem } from './StickerEmblem';

const ANNOTATABLE: SessionEventType[] = [
  'check_answered',
  'check_timeout',
  'pause',
  'prompt_skipped',
  'prompt_submitted',
  'event_started',
  'marker',
];

function summarizeEvent(e: SessionEvent): string {
  const d = e.data;
  switch (e.type) {
    case 'narration_shown':
      return d.text ? `“${d.text}”` : `narration (${d.styleId})`;
    case 'message_shown':
      return `${d.title ?? ''} ${d.description ?? ''}`;
    case 'pace_changed':
      return `pace ${d.previousValue ?? '–'} → ${d.value}`;
    case 'intensity_changed':
      return `intensity → ${d.value}`;
    case 'check_answered':
      return `${d.checkId}: ${d.response} (${d.value})${d.corrected ? ' [corrected]' : ''}`;
    case 'prompt_submitted':
      return `${d.promptId}: ${d.response ?? `(${d.responseLength} chars)`}`;
    case 'pause':
      return `pause (${d.reason})`;
    case 'climax':
      return `result: ${d.result}`;
    case 'error':
      return String(d.message);
    default:
      return e.eventId ?? '';
  }
}

function Accounting({
  record,
  setRecord,
}: {
  record: SessionRecord;
  setRecord: (r: SessionRecord) => void;
}) {
  const { saved } = useForgeConfig();
  const config = saved.accounting;
  const [delta, setDelta] = useState<Record<string, string>>({});
  const report = computeAccounting(record, config, {
    checks: saved.checks.items,
  });
  const selection =
    record.accountingSelection ??
    config.rules.filter(r => r.enabled).map(r => r.id);
  const f = report.facts;
  const annotate = (
    recordId: string,
    patch: Partial<SessionRecord['annotations'][number]>
  ) => {
    const existing = record.annotations.find(a => a.recordId === recordId) ?? {
      recordId,
      note: '',
      excluded: false,
    };
    setRecord({
      ...record,
      annotations: [
        ...record.annotations.filter(a => a.recordId !== recordId),
        { ...existing, ...patch },
      ],
    });
  };
  const annotatable = record.events.filter(e =>
    ['check_answered', 'pause', 'prompt_skipped', 'check_timeout'].includes(
      e.type
    )
  );
  return (
    <Card title='Accounting'>
      {report.notes.map((n, i) => (
        <p key={i} className='muted'>
          {n}
        </p>
      ))}
      <h3>Facts (logged)</h3>
      <table>
        <tbody>
          <tr>
            <th>Checks shown</th>
            <td>{f.totalChecks}</td>
            <th>Positive / negative / neutral</th>
            <td>
              {f.positive} / {f.negative} / {f.neutral}
            </td>
          </tr>
          <tr>
            <th>Skipped / timed-out checks</th>
            <td>
              {f.skippedChecks} / {f.timedOutChecks}
            </td>
            <th>Instructions followed / not</th>
            <td>
              {f.instructionsFollowed} / {f.instructionsNotFollowed}
            </td>
          </tr>
          <tr>
            <th>Pauses (user)</th>
            <td>{f.pauses}</td>
            <th>Safety pauses (never counted by default)</th>
            <td>{f.safetyPauses}</td>
          </tr>
          <tr>
            <th>Prompts shown / completed / skipped</th>
            <td>
              {f.promptsShown} / {f.promptsCompleted} / {f.promptsSkipped}
            </td>
            <th>Prompt completion rate</th>
            <td>
              {f.promptCompletionRate === null
                ? '—'
                : `${Math.round(f.promptCompletionRate * 100)}%`}
            </td>
          </tr>
          <tr>
            <th>Events run</th>
            <td>{f.eventsRun}</td>
            <th>Excluded / corrected records</th>
            <td>
              {f.excludedRecords} / {f.correctedRecords}
            </td>
          </tr>
        </tbody>
      </table>
      <h3>Your rules (checklist)</h3>
      <table>
        <thead>
          <tr>
            <th>Include</th>
            <th>Rule</th>
            <th>Counted</th>
            <th>Total</th>
            <th>How it was calculated</th>
            <th>Adjust</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map(l => (
            <tr key={l.ruleId}>
              <td>
                <input
                  type='checkbox'
                  aria-label={`Include ${l.label}`}
                  checked={selection.includes(l.ruleId)}
                  onChange={e =>
                    setRecord({
                      ...record,
                      accountingSelection: e.target.checked
                        ? [...selection, l.ruleId]
                        : selection.filter(x => x !== l.ruleId),
                    })
                  }
                />
              </td>
              <td>
                {l.label} <span className='badge'>{l.polarity}</span>
              </td>
              <td>
                {l.counted}
                {l.matched !== l.counted ? ` of ${l.matched}` : ''}
              </td>
              <td>{l.total}</td>
              <td className='muted'>{l.explanation}</td>
              <td className='row'>
                <input
                  type='number'
                  aria-label='Adjustment'
                  style={{ width: 70 }}
                  value={delta[l.ruleId] ?? ''}
                  onChange={e =>
                    setDelta({ ...delta, [l.ruleId]: e.target.value })
                  }
                />
                <button
                  type='button'
                  className='small'
                  disabled={!Number(delta[l.ruleId])}
                  onClick={() => {
                    setRecord({
                      ...record,
                      adjustments: [
                        ...record.adjustments,
                        {
                          ruleId: l.ruleId,
                          delta: Number(delta[l.ruleId]),
                          note:
                            window.prompt(
                              'Note for this adjustment (optional)'
                            ) ?? '',
                        },
                      ],
                    });
                    setDelta({ ...delta, [l.ruleId]: '' });
                  }}
                >
                  Add
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Totals:</strong> positive {report.totals.positive} · negative{' '}
        {report.totals.negative} · neutral {report.totals.neutral} · net{' '}
        {report.totals.net}
      </p>
      {record.adjustments.length > 0 && (
        <ul>
          {record.adjustments.map((a, i) => (
            <li key={i}>
              {a.ruleId}: {a.delta > 0 ? '+' : ''}
              {a.delta} {a.note && `— ${a.note}`}{' '}
              <button
                type='button'
                className='small'
                onClick={() =>
                  setRecord({
                    ...record,
                    adjustments: record.adjustments.filter((_, k) => k !== i),
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>
          Inspect, correct, annotate or exclude records ({annotatable.length})
        </summary>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Record</th>
              <th>Exclude</th>
              <th>Correct to</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {annotatable.map(e => {
              const a = record.annotations.find(x => x.recordId === e.id);
              const check = saved.checks.items.find(
                c => c.id === e.data.checkId
              );
              return (
                <tr key={e.id}>
                  <td>{formatMs(e.t)}</td>
                  <td>
                    {e.type}: {summarizeEvent(e)}
                  </td>
                  <td>
                    <input
                      type='checkbox'
                      aria-label='Exclude'
                      checked={!!a?.excluded}
                      onChange={x =>
                        annotate(e.id, { excluded: x.target.checked })
                      }
                    />
                  </td>
                  <td>
                    {e.type === 'check_answered' && check ? (
                      <select
                        aria-label='Corrected response'
                        value={a?.correctedResponse ?? ''}
                        onChange={x =>
                          annotate(e.id, {
                            correctedResponse: x.target.value || undefined,
                          })
                        }
                      >
                        <option value=''>—</option>
                        {check.responses.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <input
                      type='text'
                      aria-label='Note'
                      value={a?.note ?? ''}
                      onChange={x => annotate(e.id, { note: x.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

function ExportPanel({ record }: { record: SessionRecord }) {
  const [opts, setOpts] = useState<RedactionOptions>(PRIVATE_DEFAULTS);
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const text = useMemo(
    () =>
      format === 'json' ? exportJson(record, opts) : exportCsv(record, opts),
    [record, opts, format]
  );
  return (
    <Card title='Export (private by default)'>
      <p className='muted'>
        Exporting is the only way a log leaves this browser. Review the preview
        below — it is exactly what will be written.
      </p>
      <div className='grid'>
        <Toggle
          label='Exclude free-text responses and notes'
          checked={opts.excludeFreeText}
          onChange={x => setOpts({ ...opts, excludeFreeText: x })}
        />
        <Toggle
          label='Exclude configuration snapshot'
          checked={opts.excludeConfig}
          onChange={x => setOpts({ ...opts, excludeConfig: x })}
        />
        <Toggle
          label='Exclude media identifiers'
          checked={opts.excludeMediaIds}
          onChange={x => setOpts({ ...opts, excludeMediaIds: x })}
        />
        <Toggle
          label='Exclude narration text'
          checked={opts.excludeNarration}
          onChange={x => setOpts({ ...opts, excludeNarration: x })}
        />
      </div>
      <div className='row'>
        <label className='toggle'>
          <input
            type='radio'
            checked={format === 'json'}
            onChange={() => setFormat('json')}
          />{' '}
          JSON (re-importable)
        </label>
        <label className='toggle'>
          <input
            type='radio'
            checked={format === 'csv'}
            onChange={() => setFormat('csv')}
          />{' '}
          CSV (events only)
        </label>
        <button
          type='button'
          className='primary'
          onClick={() =>
            download(
              `session-${record.sessionId}.${format}`,
              text,
              format === 'json' ? 'application/json' : 'text/csv'
            )
          }
        >
          Download
        </button>
      </div>
      <pre aria-label='Export preview'>
        {text.slice(0, 3000)}
        {text.length > 3000
          ? `\n… (${text.length - 3000} more characters)`
          : ''}
      </pre>
    </Card>
  );
}

function Replay({ record }: { record: SessionRecord }) {
  const cursor = useMemo(
    () => new ReplayCursor(record.events),
    [record.events]
  );
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const snap = cursor.at(t);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () =>
        setT(x =>
          x + 1000 > cursor.duration
            ? (setPlaying(false), cursor.duration)
            : x + 1000
        ),
      250
    );
    return () => clearInterval(id);
  }, [playing, cursor.duration]);
  const rep = reproducibility(record, {
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
  });
  const current = record.events[snap.index];
  return (
    <Card title='Replay'>
      <p className='muted'>
        Log playback reconstructs state from recorded events only; it never
        re-runs your session.
      </p>
      <div className='row'>
        <button type='button' onClick={() => setPlaying(p => !p)}>
          {playing ? 'Pause playback' : 'Play (4×)'}
        </button>
        <button
          type='button'
          onClick={() => {
            const p = cursor.prev(snap.index);
            if (p) setT(p.t);
          }}
        >
          ◀ Event
        </button>
        <button
          type='button'
          onClick={() => {
            const n = cursor.next(snap.index);
            if (n) setT(n.t);
          }}
        >
          Event ▶
        </button>
        <span>
          {formatMs(t)} / {formatMs(cursor.duration)}
        </span>
      </div>
      <input
        type='range'
        aria-label='Replay position'
        min={0}
        max={cursor.duration}
        step={100}
        value={t}
        onChange={e => setT(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <table>
        <tbody>
          <tr>
            <th>Intensity</th>
            <td>{snap.intensity?.toFixed(2) ?? '—'}</td>
            <th>Pace</th>
            <td>{snap.pace ?? '—'}</td>
          </tr>
          <tr>
            <th>Phase</th>
            <td>
              {snap.phase ?? '—'}
              {snap.paused ? ' (paused)' : ''}
            </td>
            <th>Grip</th>
            <td>{snap.grip ?? '—'}</td>
          </tr>
          <tr>
            <th>Narration</th>
            <td colSpan={3}>{snap.lastNarration ?? '—'}</td>
          </tr>
          <tr>
            <th>Message</th>
            <td colSpan={3}>{snap.lastMessage ?? '—'}</td>
          </tr>
          <tr>
            <th>Media</th>
            <td colSpan={3}>
              {snap.media
                ? `${snap.media.id ?? '(redacted)'} [${snap.media.tags.join(', ')}]`
                : '—'}
            </td>
          </tr>
          <tr>
            <th>Event</th>
            <td colSpan={3}>
              {current ? (
                <>
                  <code>{current.id}</code> {current.type}{' '}
                  {summarizeEvent(current)}
                </>
              ) : (
                '—'
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <h3>Deterministic re-simulation</h3>
      <ul className='diag muted'>
        {rep.limitations.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <button type='button' onClick={() => setVerify(verifyReplay(record))}>
        Re-simulate and compare
      </button>
      {verify && (
        <div role='status'>
          {!verify.attempted ? (
            <p className='warn'>Not possible for this record.</p>
          ) : verify.matches ? (
            <p className='ok'>
              Re-simulation matched all {verify.compared} engine-driven records.
            </p>
          ) : (
            <>
              <p className='warn'>
                Diverged at {verify.divergences.length} position(s):
              </p>
              <ul className='diag'>
                {verify.divergences.slice(0, 5).map((d, i) => (
                  <li key={i}>
                    #{d.index}: recorded {d.original ?? '—'} vs replayed{' '}
                    {d.replayed ?? '—'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Autopsy() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { store, saved, ready } = useForgeConfig();
  const [record, setRecordState] = useState<SessionRecord | null>(
    (location.state as { record?: SessionRecord } | null)?.record ?? null
  );
  const [filter, setFilter] = useState<EventFilter>({ types: [] });
  const persisted = saved.logging.enabled;

  useEffect(() => {
    if (!id) return;
    store.getSession(id).then(r => r && setRecordState(r));
  }, [id, store]);

  const setRecord = (r: SessionRecord) => {
    setRecordState(r);
    if (persisted) store.saveSession(r);
  };

  if (!ready) return <p>Loading…</p>;
  if (!record)
    return (
      <div className='main'>
        <p>Session not found.</p>
        <Link className='btn' to='/forge'>
          Back to Studio
        </Link>
      </div>
    );

  const a = autopsy(record);
  const markers = a.pauses
    .map(p => ({ t: p.start, label: `pause (${p.reason})` }))
    .concat(a.milestones.map(m => ({ t: m.t, label: m.label })));
  const shown = filterEvents(record.events, filter).slice(0, 1500);

  return (
    <div className='main'>
      <div className='topbar'>
        <StickerEmblem />
        <h1 className='scribble-under'>Session autopsy</h1>
        <span className='spacer' />
        <Link className='btn' to='/forge'>
          Studio
        </Link>
        <button
          type='button'
          className='danger'
          onClick={async () => {
            if (!window.confirm('Delete this session record permanently?'))
              return;
            await store.deleteSession(record.sessionId);
            navigate('/forge');
          }}
        >
          Delete record
        </button>
      </div>
      {!persisted && (
        <p className='warn'>
          Saving is off: this record is shown once and will not be stored.
          Export it now if you want to keep it.
        </p>
      )}
      <Card title='Summary'>
        <table>
          <tbody>
            <tr>
              <th>Started</th>
              <td>{new Date(record.startedAt).toLocaleString()}</td>
              <th>Ended</th>
              <td>{a.endReason ?? 'interrupted'}</td>
            </tr>
            <tr>
              <th>Duration (wall / active)</th>
              <td>
                {formatMs(a.durationMs)} / {formatMs(a.activeMs)}
              </td>
              <th>Peak / final intensity</th>
              <td>
                {a.peakIntensity.toFixed(1)} / {a.finalIntensity.toFixed(1)}
              </td>
            </tr>
            <tr>
              <th>Pace range / changes</th>
              <td>
                {a.paceRange ? `${a.paceRange[0]}–${a.paceRange[1]}` : '—'} /{' '}
                {a.paceChanges}
              </td>
              <th>Events / prompts / checks</th>
              <td>
                {a.eventsRun} / {a.promptsShown} / {a.checksShown}
              </td>
            </tr>
            <tr>
              <th>Pauses</th>
              <td>
                {a.pauses.length} (
                {formatMs(a.pauses.reduce((s, p) => s + p.end - p.start, 0))})
              </td>
              <th>Media transitions</th>
              <td>{a.mediaTransitions}</td>
            </tr>
          </tbody>
        </table>
        <h3>Significant moments</h3>
        <ul>
          {a.significant.map((s, i) => (
            <li key={i}>
              <code>{formatMs(s.t)}</code> {s.text}
            </li>
          ))}
        </ul>
        <h3>Event frequency</h3>
        <p className='muted'>
          {Object.entries(a.eventFrequency)
            .sort((x, y) => y[1] - x[1])
            .map(([k, v]) => `${k} ×${v}`)
            .join(' · ') || '—'}
        </p>
        <p className='muted'>
          Styles used:{' '}
          {Object.entries(a.styleFrequency)
            .map(([k, v]) => `${k} ×${v}`)
            .join(' · ') || '—'}
        </p>
      </Card>
      <Card title='Timeline'>
        <StepChart
          label='Intensity (0–10) over time'
          maxY={10}
          series={[
            {
              name: 'Intensity',
              color: 'var(--chart-1, #c678dd)',
              points: intensityCurve(record.events),
            },
          ]}
          markers={markers}
        />
        <StepChart
          label='Pace over time'
          series={[
            {
              name: 'Pace',
              color: 'var(--chart-2, #61afef)',
              points: paceCurve(record.events),
            },
          ]}
          markers={markers}
        />
        <p className='muted'>Vertical lines mark pauses and milestones.</p>
      </Card>
      <Card title='Event log'>
        <div className='stack'>
          <MultiSelect
            label='Types (none = all)'
            value={filter.types ?? []}
            options={SESSION_EVENT_TYPES.map(t => ({ value: t, label: t }))}
            onChange={x =>
              setFilter({ ...filter, types: x as SessionEventType[] })
            }
          />
          <div className='grid'>
            <RangeField
              label='Intensity range'
              value={filter.intensity ?? { min: 0, max: 10 }}
              onChange={x => setFilter({ ...filter, intensity: x })}
            />
            <label className='field'>
              Style
              <input
                type='text'
                value={filter.style ?? ''}
                onChange={e =>
                  setFilter({ ...filter, style: e.target.value || undefined })
                }
              />
            </label>
            <label className='field'>
              Media tag
              <input
                type='text'
                value={filter.mediaTag ?? ''}
                onChange={e =>
                  setFilter({
                    ...filter,
                    mediaTag: e.target.value || undefined,
                  })
                }
              />
            </label>
            <label className='field'>
              Identity
              <input
                type='text'
                value={filter.identity ?? ''}
                onChange={e =>
                  setFilter({
                    ...filter,
                    identity: e.target.value || undefined,
                  })
                }
              />
            </label>
            <label className='field'>
              Text
              <input
                type='search'
                value={filter.text ?? ''}
                onChange={e =>
                  setFilter({ ...filter, text: e.target.value || undefined })
                }
              />
            </label>
          </div>
          <p className='muted'>
            {shown.length} records{shown.length === 1500 ? ' (first 1500)' : ''}
          </p>
          <ol className='timeline'>
            {shown.map(e => (
              <li key={e.id}>
                <code>{formatMs(e.t)}</code>{' '}
                <span className='badge'>{e.source}</span>{' '}
                <strong>{e.type}</strong> {summarizeEvent(e)}
                {ANNOTATABLE.includes(e.type) &&
                record.annotations.some(x => x.recordId === e.id)
                  ? ' ✎'
                  : ''}
              </li>
            ))}
          </ol>
        </div>
      </Card>
      <Replay record={record} />
      <Accounting record={record} setRecord={setRecord} />
      <ExportPanel record={record} />
    </div>
  );
}

function Shell() {
  const { saved } = useForgeConfig();
  return (
    <div className={rootClass(saved)} style={rootStyle(saved)}>
      <Autopsy />
    </div>
  );
}

export const AutopsyPage = () => (
  <AgeGate>
    <ForgeConfigProvider>
      <Shell />
    </ForgeConfigProvider>
  </AgeGate>
);
