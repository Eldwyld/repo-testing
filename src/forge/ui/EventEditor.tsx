/**
 * Event-sequence editor: structured table, raw JSON packs with live
 * validation, a dependency graph, and a lab (DSL tester, eligibility
 * explainer, dry-run simulator).
 */
import { useMemo, useState } from 'react';
import { setPath } from '../config/registry';
import { DEFAULT_EVENT_PACK } from '../events/builtins';
import { evaluate, EvalTrace, FIELD_DOCS } from '../events/conditions';
import { formatCondition, parseCondition } from '../events/dsl';
import { compilePack } from '../events/validate';
import { graphEdges, toMermaid } from '../events/graph';
import {
  EventPack,
  eventPackV,
  GAME_PHASES,
  SELECTION_STRATEGIES,
  STEP_KINDS,
} from '../events/types';
import { dryRun, explainEligibility } from '../runtime/simulate';
import { formatMs } from '../session/analysis';
import {
  Card,
  Diagnostics,
  JsonEditor,
  NumberField,
  Select,
  Slider,
  Toggle,
} from './components';
import type { EditorProps } from './editors';

const emptyPack = (): EventPack => ({
  kind: 'forge.eventPack',
  schemaVersion: 1,
  id: `pack_${Date.now().toString(36)}`,
  name: 'My events',
  description: '',
  groups: [],
  sequences: [],
  events: [
    {
      id: `my_event_${Date.now().toString(36)}`,
      name: 'My narration',
      type: 'narration',
      description: '',
      enabled: true,
      weight: 10,
      selectable: true,
      tags: [],
      intensity: { min: 0, max: 10 },
      identities: [],
      styles: [],
      mediaTags: [],
      phases: ['active'],
      conditions: 'session.intensity >= 2',
      cooldownSeconds: 30,
      maxRepeats: 0,
      noRepeatWithin: 0,
      metadata: {},
      steps: [
        {
          do: 'narrate',
          template: '{Subject} {verb:remain} {term:stillness}.',
          styles: [],
          durationSeconds: 6,
        },
      ],
    },
  ],
});

function DslTester() {
  const [expr, setExpr] = useState(
    'session.intensity >= 4 and history.last != "pause"'
  );
  const [scope, setScope] = useState(
    JSON.stringify(
      {
        session: { intensity: 5, phase: 'active', pauses: 1 },
        history: { last: 'random_pace' },
      },
      null,
      2
    )
  );
  let result: string;
  const trace: EvalTrace[] = [];
  try {
    const cond = parseCondition(expr);
    const r = evaluate(cond, JSON.parse(scope), { trace });
    result = `${r ? 'TRUE' : 'FALSE'} — JSON: ${JSON.stringify(cond)}`;
  } catch (e) {
    result = `Error: ${(e as Error).message}`;
  }
  return (
    <Card title='Condition tester' level={3}>
      <label className='field'>
        Expression
        <input
          type='text'
          value={expr}
          onChange={e => setExpr(e.target.value)}
        />
      </label>
      <label className='field'>
        Scope (JSON)
        <textarea
          rows={6}
          value={scope}
          onChange={e => setScope(e.target.value)}
        />
      </label>
      <pre role='status'>
        {result}
        {trace.length
          ? `\n${trace.map(t => `${t.field} ${t.operator} ${JSON.stringify(t.expected)} (actual ${JSON.stringify(t.actual)}) → ${t.result}`).join('\n')}`
          : ''}
      </pre>
    </Card>
  );
}

function Lab({ config }: EditorProps) {
  const [intensity, setIntensity] = useState(5);
  const [phase, setPhase] = useState('active');
  const [pauses, setPauses] = useState(0);
  const [seconds, setSeconds] = useState(300);
  const [seed, setSeed] = useState('preview');
  const [run, setRun] = useState<ReturnType<typeof dryRun> | null>(null);
  const eligibility = useMemo(
    () => explainEligibility(config, { intensity, phase, pauses }),
    [config, intensity, phase, pauses]
  );
  return (
    <div className='stack'>
      <Card title='Eligibility explainer' level={3}>
        <div className='grid'>
          <Slider
            label='Intensity'
            value={intensity}
            min={0}
            max={10}
            step={0.5}
            onChange={setIntensity}
          />
          <Select
            label='Phase'
            value={phase}
            options={GAME_PHASES}
            onChange={setPhase}
          />
          <NumberField
            label='Pauses so far'
            value={pauses}
            min={0}
            max={100}
            onChange={setPauses}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Eligible</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {eligibility.map(e => (
              <tr key={e.eventId}>
                <td>{e.name}</td>
                <td className={e.eligible ? 'ok' : 'muted'}>
                  {e.eligible ? 'yes' : 'no'}
                </td>
                <td className='muted'>{e.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title='Dry-run simulation' level={3}>
        <p className='muted'>
          Runs a headless session with your current (unsaved) configuration.
          Checks are auto-answered with the first response, prompts are skipped.
          Nothing is saved.
        </p>
        <div className='row'>
          <NumberField
            label='Seconds'
            value={seconds}
            min={10}
            max={7200}
            onChange={setSeconds}
          />
          <label className='field'>
            Seed
            <input
              type='text'
              value={seed}
              onChange={e => setSeed(e.target.value)}
            />
          </label>
          <button
            type='button'
            className='primary'
            onClick={() => setRun(dryRun(config, { seconds, seed }))}
          >
            Run
          </button>
        </div>
        {run && (
          <>
            {run.configErrors.length > 0 && (
              <ul className='diag error'>
                {run.configErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <p className='muted'>
              {run.timeline.filter(t => t.type === 'event_started').length}{' '}
              events started · ended: {run.record.endReason ?? 'still running'}
            </p>
            <ol className='timeline'>
              {run.timeline.map((t, i) => (
                <li key={i}>
                  <code>{formatMs(t.activeMs)}</code> {t.text}
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
      <DslTester />
    </div>
  );
}

function Reference() {
  return (
    <div className='stack'>
      <Card title='Condition fields' level={3}>
        <table>
          <tbody>
            {Object.entries(FIELD_DOCS).map(([f, d]) => (
              <tr key={f}>
                <td>
                  <code>{f}</code>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className='muted'>
          Operators:{' '}
          <code>
            == != &gt; &gt;= &lt; &lt;= contains !contains in [..] not in [..]
            between a..b exists missing
          </code>
          , combined with <code>and or not ( )</code>. Strings must be quoted.
          This is a restricted language parsed into JSON — never executed as
          code.
        </p>
      </Card>
      <Card title='Step kinds' level={3}>
        <p>
          <code>{STEP_KINDS.join(' · ')}</code>
        </p>
        <p className='muted'>
          Loops are bounded (<code>loop.times ≤ 50</code>). Every
          goto/next/branch cycle needs <code>maxRepeats</code> or{' '}
          <code>terminateIf</code>. Chains are capped by{' '}
          <code>maxChainDepth</code>, and runaway work by{' '}
          <code>maxStepsPerTick</code>; on overflow the chain is aborted and the
          session continues. Events cannot pause, resume or stop the session, or
          exceed the intensity ceiling.
        </p>
      </Card>
    </div>
  );
}

export function EventEditor(props: EditorProps) {
  const { config, compiled, update } = props;
  const [tab, setTab] = useState<
    'events' | 'packs' | 'graph' | 'lab' | 'reference'
  >('events');
  const sel = config.events.selection;
  const setSel = (k: keyof typeof sel, value: unknown) =>
    update(c => setPath(c, `events.selection.${k}`, value));
  const pack = compiled.pack;
  const merged = pack ? Object.values(pack.events) : [];
  return (
    <div className='stack'>
      <div className='tabs' role='tablist'>
        {(['events', 'packs', 'graph', 'lab', 'reference'] as const).map(t => (
          <button
            key={t}
            type='button'
            role='tab'
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <Diagnostics errors={compiled.errors} warnings={compiled.warnings} />
      {tab === 'events' && (
        <>
          <Card title='Selection' level={3}>
            <div className='grid'>
              <Select
                label='Strategy'
                value={sel.strategy}
                options={SELECTION_STRATEGIES}
                onChange={x => setSel('strategy', x)}
                help='“dice” keeps the original joi.how odds (weight N = 1 in N).'
              />
              <NumberField
                label='Roll interval'
                unit='s'
                value={sel.rollIntervalSeconds}
                min={0.25}
                max={600}
                step={0.25}
                onChange={x => setSel('rollIntervalSeconds', x)}
              />
              <Slider
                label='Trigger probability'
                value={sel.triggerProbability}
                min={0}
                max={1}
                step={0.01}
                onChange={x => setSel('triggerProbability', x)}
                format={x => `${Math.round(x * 100)}%`}
              />
              <NumberField
                label='Min gap'
                unit='s'
                value={sel.minGapSeconds}
                min={0}
                max={3600}
                onChange={x => setSel('minGapSeconds', x)}
              />
              <NumberField
                label='Max chain depth'
                value={sel.maxChainDepth}
                min={1}
                max={64}
                onChange={x => setSel('maxChainDepth', x)}
              />
              <NumberField
                label='Max steps per tick'
                value={sel.maxStepsPerTick}
                min={10}
                max={1000}
                onChange={x => setSel('maxStepsPerTick', x)}
              />
              <Toggle
                label='Include built-in events'
                checked={config.events.builtinEnabled}
                onChange={x =>
                  update(c => setPath(c, 'events.builtinEnabled', x))
                }
              />
            </div>
          </Card>
          <table>
            <thead>
              <tr>
                <th>On</th>
                <th>Event</th>
                <th>Type</th>
                <th>Intensity</th>
                <th>Weight</th>
                <th>Conditions</th>
              </tr>
            </thead>
            <tbody>
              {merged.map(e => {
                const disabled = config.events.disabledEventIds.includes(e.id);
                return (
                  <tr key={e.id}>
                    <td>
                      <input
                        type='checkbox'
                        aria-label={`Enable ${e.name}`}
                        checked={!disabled}
                        onChange={x =>
                          update(c =>
                            setPath(
                              c,
                              'events.disabledEventIds',
                              x.target.checked
                                ? c.events.disabledEventIds.filter(
                                    i => i !== e.id
                                  )
                                : [...c.events.disabledEventIds, e.id]
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      {e.name}
                      <br />
                      <code className='muted'>{e.id}</code>
                      {!e.selectable && (
                        <span className='badge'>chain-only</span>
                      )}
                    </td>
                    <td>{e.type}</td>
                    <td>
                      {e.intensity.min}–{e.intensity.max}
                    </td>
                    <td style={{ width: 90 }}>
                      {e.selectable ? (
                        <input
                          type='number'
                          aria-label='Weight'
                          min={0}
                          max={1000}
                          value={
                            config.events.weightOverrides[e.id] ?? e.weight
                          }
                          onChange={x =>
                            update(c =>
                              setPath(c, 'events.weightOverrides', {
                                ...c.events.weightOverrides,
                                [e.id]: Math.max(
                                  0,
                                  Number(x.target.value) || 0
                                ),
                              })
                            )
                          }
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <code className='muted'>
                        {e.conditions ? formatCondition(e.conditions) : ''}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {tab === 'packs' && (
        <div className='stack'>
          <div className='row'>
            <button
              type='button'
              onClick={() =>
                update(c =>
                  setPath(c, 'events.packs', [...c.events.packs, emptyPack()])
                )
              }
            >
              + New pack
            </button>
            <button
              type='button'
              onClick={() =>
                update(c =>
                  setPath(c, 'events.packs', [
                    ...c.events.packs,
                    {
                      ...structuredClone(DEFAULT_EVENT_PACK),
                      id: `core_copy_${Date.now().toString(36)}`,
                      name: 'Core events (copy)',
                    },
                  ])
                )
              }
            >
              Copy built-in pack as a template
            </button>
          </div>
          <p className='muted'>
            Later packs override earlier events with the same id. Use “Include
            built-in events” to turn the built-in pack off entirely.
          </p>
          {config.events.packs.map((p, n) => (
            <Card
              key={p.id}
              title={p.name}
              level={3}
              actions={
                <button
                  type='button'
                  className='small danger'
                  onClick={() =>
                    update(c =>
                      setPath(
                        c,
                        'events.packs',
                        c.events.packs.filter((_, k) => k !== n)
                      )
                    )
                  }
                >
                  Delete pack
                </button>
              }
            >
              <JsonEditor
                label='Pack JSON'
                value={p}
                validator={eventPackV}
                rows={24}
                extraCheck={next => {
                  const r = compilePack(next, {
                    promptIds: config.prompts.templates.map(x => x.id),
                    checkIds: config.checks.items.map(x => x.id),
                  });
                  return r.errors.map(
                    e =>
                      `${e.eventId ? `[${e.eventId}] ` : ''}${e.path ? `${e.path}: ` : ''}${e.message}`
                  );
                }}
                onCommit={next =>
                  update(c =>
                    setPath(
                      c,
                      'events.packs',
                      c.events.packs.map((x, k) => (k === n ? next : x))
                    )
                  )
                }
              />
            </Card>
          ))}
          {config.events.packs.length === 0 && (
            <p className='muted'>No custom packs yet.</p>
          )}
          <Card title='Built-in pack (read-only)' level={3}>
            <details>
              <summary>Show JSON</summary>
              <pre>{JSON.stringify(DEFAULT_EVENT_PACK, null, 2)}</pre>
            </details>
          </Card>
        </div>
      )}
      {tab === 'graph' && pack && (
        <div className='stack'>
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>Link</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {graphEdges(pack).map((e, i) => (
                <tr key={i}>
                  <td>
                    <code>{e.from}</code>
                  </td>
                  <td className='muted'>{e.kind}</td>
                  <td>
                    <code>{e.to}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>Mermaid source (paste into any Mermaid viewer)</summary>
            <pre>{toMermaid(pack)}</pre>
          </details>
        </div>
      )}
      {tab === 'lab' && <Lab {...props} />}
      {tab === 'reference' && <Reference />}
    </div>
  );
}
