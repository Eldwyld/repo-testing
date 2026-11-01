import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  categories,
  category,
  resetCategory,
  SECTIONS,
  searchSettings,
  isCategoryDefault,
} from '../config/registry';
import {
  applyPreset,
  BUILTIN_PRESETS,
  capturePreset,
  Preset,
} from '../config/presets';
import { exportConfig, importDocument } from '../config/io';
import { checkStyleMix } from '../narrative/compose';
import { formatMs } from '../session/analysis';
import { SessionSummary } from '../storage/store';
import { CategoryEditor } from './editors';
import { Card, Select } from './components';
import { download, readFile } from './files';
import { ForgeConfigProvider } from './ConfigContext';
import { AgeGate } from './AgeGate';
import { rootClass, rootStyle, useForgeConfig } from './forgeConfigState';
import './forge.css';
import './theme-sticker.css';
import { StickerEmblem } from './StickerEmblem';
import { FORGE_BUILD } from '../buildInfo';
import { OFFLINE_BUILD } from '../../utils/offline';
import { MediaLibrary } from './MediaLibrary';

type Tab = 'setup' | 'settings' | 'history' | 'io';

function Summary() {
  const { draft: c, compiled } = useForgeConfig();
  const lib = compiled.library;
  const identity = lib.identities[c.session.identityId];
  const anatomy = lib.anatomy[c.session.anatomyId];
  const styles = c.session.styleMix
    .filter(m => m.strength > 0)
    .map(
      m =>
        `${lib.styles[m.styleId]?.name ?? m.styleId} ${Math.round(m.strength * 100)}%`
    );
  const conflicts = checkStyleMix(c.session.styleMix, lib.styles);
  const rows: [string, string][] = [
    [
      'Identity',
      identity
        ? `${identity.displayName} (${identity.category}, ${identity.person} person)`
        : `missing: ${c.session.identityId}`,
    ],
    [
      'Pronouns',
      c.session.pronounsOverride
        ? (lib.pronouns[c.session.pronounsOverride]?.label ?? '?')
        : `${identity?.pronouns.label} (identity default)`,
    ],
    ['Anatomy terms', anatomy?.name ?? '?'],
    ['Narrative mix', styles.join(', ') || 'none'],
    [
      'Hypnosis-style narration',
      c.hypno.enabled
        ? `on (${c.hypno.patterns.filter(p => p.enabled).length} patterns)`
        : 'off',
    ],
    [
      'Duration / warm-up',
      `${formatMs(c.session.durationSeconds * 1000)} / ${formatMs(c.session.warmupSeconds * 1000)}`,
    ],
    ['Pace', `${c.session.paceMin}–${c.session.paceMax} per second`],
    [
      'Climax / ruin chance',
      `${c.session.climaxChance}% / ${c.session.ruinChance}%`,
    ],
    [
      'Events',
      compiled.pack
        ? `${Object.values(compiled.pack.events).filter(e => e.enabled && e.selectable).length} selectable · strategy ${c.events.selection.strategy}`
        : 'INVALID — events disabled',
    ],
    [
      'Prompts',
      c.prompts.enabled
        ? `${c.prompts.templates.filter(p => p.enabled).length} enabled`
        : 'off',
    ],
    [
      'Compliance checks',
      c.checks.enabled
        ? `${c.checks.items.filter(x => x.enabled && x.schedule.mode !== 'event_only').length} scheduled`
        : 'off',
    ],
    [
      'Accounting',
      c.accounting.enabled
        ? `${c.accounting.rules.filter(r => r.enabled).length} rules`
        : 'off',
    ],
    ['Intensity ceiling', `${c.safety.intensityCeiling}/10`],
    [
      'Duration limit',
      c.safety.maxDurationMinutes
        ? `${c.safety.maxDurationMinutes} min`
        : 'none',
    ],
    [
      'Breaks',
      c.safety.breaks.enabled
        ? `${c.safety.breaks.lengthSeconds}s every ${c.safety.breaks.everyMinutes} min`
        : 'off',
    ],
    [
      'Recording',
      c.logging.enabled ? 'saved locally in this browser' : 'not saved',
    ],
  ];
  return (
    <Card title='Active configuration'>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope='row'>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {conflicts.length > 0 && (
        <ul className='diag warn'>
          {conflicts.map((x, i) => (
            <li key={i}>{x.message}</li>
          ))}
        </ul>
      )}
      {compiled.errors.length > 0 && (
        <p className='error'>
          The event configuration has {compiled.errors.length} error(s); see
          Settings › Events.
        </p>
      )}
    </Card>
  );
}

function Presets() {
  const { draft, replace, store } = useForgeConfig();
  const [saved, setSaved] = useState<Preset[]>([]);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    store.listPresets().then(setSaved);
  }, [store]);
  const apply = (p: Preset) => {
    const r = applyPreset(draft, p);
    if (r.ok) {
      replace(r.config);
      setMessage(`${r.notes.join(' ')} Review and save to keep it.`);
    } else setMessage(r.errors.join('; '));
  };
  return (
    <Card title='Presets'>
      <div className='grid'>
        {[...BUILTIN_PRESETS, ...saved].map(p => (
          <div key={p.id} className='card'>
            <strong>{p.name}</strong>{' '}
            {p.builtin ? (
              <span className='badge builtin'>built-in</span>
            ) : (
              <span className='badge custom'>{p.scope}</span>
            )}
            <p className='muted'>{p.description}</p>
            <div className='row'>
              <button type='button' className='small' onClick={() => apply(p)}>
                Apply
              </button>
              {!p.builtin && (
                <button
                  type='button'
                  className='small'
                  onClick={() =>
                    download(`${p.id}.preset.json`, JSON.stringify(p, null, 2))
                  }
                >
                  Export
                </button>
              )}
              {!p.builtin && (
                <button
                  type='button'
                  className='small danger'
                  onClick={() =>
                    store
                      .deletePreset(p.id)
                      .then(() => store.listPresets().then(setSaved))
                  }
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className='row'>
        <input
          type='text'
          aria-label='Preset name'
          placeholder='Preset name'
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <button
          type='button'
          disabled={!name.trim()}
          onClick={() => {
            const p = capturePreset(draft, {
              id: `preset_${Date.now().toString(36)}`,
              name: name.trim(),
            });
            store.savePreset(p).then(() => store.listPresets().then(setSaved));
            setName('');
            setMessage(`Saved preset “${p.name}”.`);
          }}
        >
          Save current as preset
        </button>
      </div>
      {message && (
        <p role='status' className='muted'>
          {message}
        </p>
      )}
    </Card>
  );
}

function Setup({ onEdit }: { onEdit: (categoryId: string) => void }) {
  const { draft, saved, changed, save, store } = useForgeConfig();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [ghost, setGhost] = useState('');
  useEffect(() => {
    store.listSessions().then(setSessions);
  }, [store]);
  const start = async () => {
    if (changed.length && !(await save())) return;
    navigate('/forge/play', { state: { ghostId: ghost || undefined } });
  };
  const s = (changed.length ? draft : saved).safety;
  return (
    <div className='stack'>
      <Summary />
      <MediaLibrary />
      <div className='row'>
        <button type='button' onClick={() => onEdit('session.identity')}>
          Change identity
        </button>
        <button type='button' onClick={() => onEdit('styles.mix')}>
          Change tone
        </button>
        <button type='button' onClick={() => onEdit('session.pacing')}>
          Change pacing
        </button>
        <button type='button' onClick={() => onEdit('safety')}>
          Safety & limits
        </button>
      </div>
      <Presets />
      <Card title='Start a session'>
        <Select
          label='Ghost overlay (compare against a recorded session)'
          value={ghost}
          options={[
            { value: '', label: 'None' },
            ...sessions.map(x => ({
              value: x.sessionId,
              label: `${new Date(x.startedAt).toLocaleString()} · ${formatMs(x.durationMs)}`,
            })),
          ]}
          onChange={setGhost}
        />
        {changed.length > 0 && (
          <p className='warn'>Unsaved changes will be saved before starting.</p>
        )}
        {!confirming ? (
          <button
            type='button'
            className='primary'
            onClick={() =>
              draft.safety.confirmBeforeStart ? setConfirming(true) : start()
            }
          >
            Start session
          </button>
        ) : (
          <div
            className='card'
            role='dialog'
            aria-modal='false'
            aria-labelledby='confirm-title'
          >
            <h3 id='confirm-title'>Before you start</h3>
            <ul>
              <li>
                You can <strong>pause</strong> (button or Esc) or{' '}
                <strong>stop</strong> at any time. Nothing in the session can
                prevent this.
              </li>
              <li>
                Prompts and checks can always be skipped or switched off
                mid-session.
              </li>
              <li>
                Intensity ceiling: {s.intensityCeiling}/10. Duration limit:{' '}
                {s.maxDurationMinutes ? `${s.maxDurationMinutes} min` : 'none'}.
              </li>
              <li>
                {draft.logging.enabled
                  ? 'This session will be recorded locally in this browser. You can export or delete it afterwards.'
                  : 'This session will not be saved.'}
              </li>
              <li>
                This is adult content intended for consenting adults (18+).
              </li>
            </ul>
            <div className='row'>
              <button type='button' className='primary' onClick={start}>
                I understand — start
              </button>
              <button type='button' onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Settings({
  active,
  setActive,
}: {
  active: string;
  setActive: (id: string) => void;
}) {
  const { draft, compiled, update, changed, store } = useForgeConfig();
  const def = category(active) ?? categories()[0];
  const [msg, setMsg] = useState('');
  return (
    <div className='layout' style={{ minHeight: 'auto' }}>
      <aside className='sidebar' aria-label='Settings categories'>
        <nav>
          {SECTIONS.map(section => {
            const defs = categories().filter(c => c.section === section.id);
            if (!defs.length) return null;
            return (
              <div key={section.id}>
                <div className='section-label'>{section.label}</div>
                <ul>
                  {defs.map(d => (
                    <li key={d.id}>
                      <button
                        type='button'
                        aria-current={d.id === def.id}
                        onClick={() => setActive(d.id)}
                      >
                        <span>{d.label}</span>
                        {changed.includes(d.id) && (
                          <span className='dot' aria-label='unsaved' />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className='main'>
        <Card
          title={def.label}
          changed={changed.includes(def.id)}
          actions={
            <>
              <button
                type='button'
                className='small'
                disabled={isCategoryDefault(draft, def.id)}
                onClick={() => {
                  update(c => resetCategory(c, def.id));
                  setMsg(
                    `${def.label} reset to defaults (other categories untouched). Save to keep.`
                  );
                }}
              >
                Reset category
              </button>
              <button
                type='button'
                className='small'
                onClick={() => {
                  const p = capturePreset(draft, {
                    id: `preset_${def.id.replace(/[^a-z0-9]/gi, '_')}_${Date.now().toString(36)}`,
                    name: `${def.label} preset`,
                    categoryId: def.id,
                  });
                  store
                    .savePreset(p)
                    .then(() =>
                      setMsg(
                        `Saved “${p.name}” — applying it only changes ${def.label}.`
                      )
                    );
                }}
              >
                Save as category preset
              </button>
            </>
          }
        >
          <p className='muted'>{def.description}</p>
          {msg && (
            <p role='status' className='muted'>
              {msg}
            </p>
          )}
          <CategoryEditor
            config={draft}
            compiled={compiled}
            update={update}
            def={def}
          />
        </Card>
      </div>
    </div>
  );
}

function History() {
  const { store } = useForgeConfig();
  const [list, setList] = useState<SessionSummary[] | null>(null);
  const refresh = () => store.listSessions().then(setList);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!list) return <p>Loading…</p>;
  return (
    <Card
      title='Session history'
      actions={
        <button
          type='button'
          className='small danger'
          disabled={!list.length}
          onClick={async () => {
            if (
              !window.confirm(
                `Delete all ${list.length} recorded sessions? This cannot be undone.`
              )
            )
              return;
            await store.deleteAllSessions();
            refresh();
          }}
        >
          Delete all
        </button>
      }
    >
      <p className='muted'>Logs are private and stored only in this browser.</p>
      {list.length === 0 ? (
        <p className='muted'>No sessions recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Duration</th>
              <th>Ended</th>
              <th>Identity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map(s => (
              <tr key={s.sessionId}>
                <td>{new Date(s.startedAt).toLocaleString()}</td>
                <td>{formatMs(s.durationMs)}</td>
                <td>{s.endReason ?? 'interrupted'}</td>
                <td>{s.identityId}</td>
                <td className='row'>
                  <Link
                    className='btn small'
                    to={`/forge/history/${encodeURIComponent(s.sessionId)}`}
                  >
                    Open
                  </Link>
                  <button
                    type='button'
                    className='small danger'
                    onClick={async () => {
                      if (!window.confirm('Delete this session record?'))
                        return;
                      await store.deleteSession(s.sessionId);
                      refresh();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ImportExport() {
  const { draft, replace, store, update } = useForgeConfig();
  const [log, setLog] = useState<string[]>([]);
  const doImport = async () => {
    const text = await readFile();
    if (text === null) return;
    const r = importDocument(text);
    if (!r.ok)
      return setLog([
        `Import failed${r.kind ? ` (${r.kind})` : ''}:`,
        ...r.errors,
      ]);
    switch (r.kind) {
      case 'config':
        if (
          !window.confirm(
            'Replace your current (unsaved) configuration with the imported one?'
          )
        )
          return;
        replace(r.value);
        return setLog(['Configuration imported. Review and save.', ...r.notes]);
      case 'preset':
        await store.savePreset(r.value);
        return setLog([`Preset “${r.value.name}” added (not applied).`]);
      case 'eventPack':
        update(c => ({
          ...c,
          events: {
            ...c.events,
            packs: [
              ...c.events.packs.filter(p => p.id !== r.value.id),
              r.value,
            ],
          },
        }));
        return setLog([
          `Event pack “${r.value.name}” added. Save to keep.`,
          ...r.warnings.map(w => `warning: ${w}`),
        ]);
      case 'session':
        await store.saveSession(r.value);
        return setLog([
          `Session ${r.value.sessionId} added to history.`,
          ...r.warnings,
        ]);
    }
  };
  return (
    <div className='stack'>
      <Card title='Export'>
        <p className='muted'>
          Exports are versioned JSON. Nothing is uploaded anywhere.
        </p>
        <button
          type='button'
          onClick={() =>
            download(
              `forge-config-${new Date().toISOString().slice(0, 10)}.json`,
              exportConfig(draft)
            )
          }
        >
          Export configuration
        </button>
      </Card>
      <Card title='Import'>
        <p className='muted'>
          Accepts Forge configurations, presets, event packs, session records,
          and settings exported from the original joi.how. Files are validated,
          migrated and scanned for excluded vocabulary before anything is
          stored.
        </p>
        <button type='button' onClick={doImport}>
          Choose file…
        </button>
        {log.length > 0 && (
          <ul className='diag' role='status'>
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card title='Import from the original app on this browser'>
        <p className='muted'>
          Reads the classic settings already stored here (durations, pace, odds,
          enabled events, pronouns, anatomy).
        </p>
        <button
          type='button'
          onClick={() => {
            const raw = localStorage.getItem('settings');
            if (!raw)
              return setLog(['No classic settings found in this browser.']);
            const r = importDocument(raw);
            if (r.ok && r.kind === 'config') {
              replace({
                ...r.value,
                identities: draft.identities,
                dictionaries: draft.dictionaries,
                styles: draft.styles,
              });
              setLog(r.notes);
            } else setLog(r.ok ? ['Unexpected document.'] : r.errors);
          }}
        >
          Import classic settings
        </button>
      </Card>
    </div>
  );
}

function Studio() {
  const { ready, draft, changed, save, discard, saveError, notes } =
    useForgeConfig();
  const [tab, setTab] = useState<Tab>('setup');
  const [active, setActive] = useState('session.identity');
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchSettings(query).slice(0, 8), [query]);
  const open = (id: string) => {
    setActive(id);
    setTab('settings');
    setQuery('');
  };
  if (!ready)
    return (
      <div className='forge' style={{ padding: 16 }}>
        Loading…
      </div>
    );
  return (
    <div className={rootClass(draft)} style={rootStyle(draft)}>
      <div className='main'>
        <div className='topbar'>
          <StickerEmblem />
          <h1 className='scribble-under'>JOI Forge Studio</h1>
          <span className='tape-note' aria-hidden='true'>
            keep it. it knows something.
          </span>
          <div
            style={{
              position: 'relative',
              minWidth: 220,
              flex: 1,
              maxWidth: 420,
            }}
          >
            <input
              type='search'
              aria-label='Search settings'
              placeholder='Search settings…'
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {hits.length > 0 && (
              <ul
                className='card'
                role='listbox'
                style={{
                  position: 'absolute',
                  zIndex: 10,
                  width: '100%',
                  listStyle: 'none',
                  margin: 0,
                }}
              >
                {hits.map(h => (
                  <li key={h.categoryId}>
                    <button
                      type='button'
                      className='small'
                      style={{ width: '100%' }}
                      onClick={() => open(h.categoryId)}
                    >
                      {h.label} <span className='muted'>— {h.match}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span className='spacer' />
          {changed.length > 0 && (
            <span className='warn' role='status'>
              <span className='dot' /> {changed.length} unsaved
            </span>
          )}
          <button
            type='button'
            className='primary'
            disabled={!changed.length}
            onClick={() => save()}
          >
            Save
          </button>
          <button type='button' disabled={!changed.length} onClick={discard}>
            Discard
          </button>
          <Link className='btn' to='/'>
            Classic mode
          </Link>
          <span className='muted' title='Commit this build was made from'>
            build {FORGE_BUILD}
            {OFFLINE_BUILD ? ' · offline' : ''}
          </span>
        </div>
        {saveError && (
          <ul className='diag error' role='alert'>
            {saveError.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {notes.length > 0 && (
          <ul className='diag warn'>
            {notes.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <div className='tabs' role='tablist'>
          {(
            [
              ['setup', 'Setup'],
              ['settings', 'Settings'],
              ['history', 'History'],
              ['io', 'Import & export'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type='button'
              role='tab'
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'setup' && <Setup onEdit={open} />}
        {tab === 'settings' && (
          <Settings active={active} setActive={setActive} />
        )}
        {tab === 'history' && <History />}
        {tab === 'io' && <ImportExport />}
      </div>
    </div>
  );
}

export const StudioPage = () => (
  <AgeGate>
    <ForgeConfigProvider>
      <Studio />
    </ForgeConfigProvider>
  </AgeGate>
);
