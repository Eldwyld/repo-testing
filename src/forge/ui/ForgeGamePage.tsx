/**
 * Active session page. Reuses the original slideshow and stroke meter, and
 * overlays Forge status, narration, prompts, checks and the always-present
 * Pause / Stop controls.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GameImages } from '../../game/components/GameImages';
import { GameMeter } from '../../game/components/GameMeter';
import { GameResume } from '../../game/components/GameResume';
import { WhenLoaded } from '../../game/components/WhenLoaded';
import { useGameEngine } from '../../game/hooks/UseGameEngine';
import { useGameFrame } from '../../game/hooks';
import Stroke from '../../game/plugins/stroke';
import Pause from '../../game/plugins/pause';
import Forge, { forgePaths, ForgeFrame } from '../../game/plugins/forge';
import { SessionRuntime, RuntimeView } from '../runtime/runtime';
import { SessionRecord } from '../session/types';
import { ghostAt } from '../session/replay';
import { formatMs } from '../session/analysis';
import { activeSession } from './activeSession';
import { ForgeConfigProvider } from './ConfigContext';
import { rootClass, rootStyle, useForgeConfig } from './forgeConfigState';
import './forge.css';

function PromptDialog({ rt, view }: { rt: SessionRuntime; view: RuntimeView }) {
  const p = view.prompt!;
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setText('');
    ref.current?.focus();
  }, [p.instanceId]);
  const skip = () => {
    if (
      p.required &&
      !window.confirm(
        'This prompt is marked required. Skip it anyway? (Skipping is always allowed and will be logged.)'
      )
    )
      return;
    rt.skipPrompt(p.instanceId);
  };
  return (
    <div
      className='forge-dialog'
      role='dialog'
      aria-modal='false'
      aria-labelledby='forge-prompt-title'
    >
      <h2 id='forge-prompt-title'>{p.text}</h2>
      {p.awaitingAck ? (
        <div className='row'>
          <p>Recorded.</p>
          <button
            type='button'
            className='primary'
            onClick={() => rt.acknowledgePrompt(p.instanceId)}
          >
            Continue
          </button>
        </div>
      ) : (
        <form
          className='stack'
          onSubmit={e => {
            e.preventDefault();
            rt.submitPrompt(p.instanceId, text);
          }}
        >
          <textarea
            ref={ref}
            className='prose'
            aria-label='Your response'
            maxLength={p.maxLength}
            value={text}
            onChange={e => setText(e.target.value)}
            aria-describedby='forge-prompt-help'
          />
          <span id='forge-prompt-help' className='muted'>
            {text.length}/{p.maxLength}
            {p.minLength ? ` (min ${p.minLength})` : ''} · attempt{' '}
            {p.attempts + 1} of {p.maxAttempts}
            {p.blocking ? ' · events wait for this prompt' : ''}
          </span>
          {p.problems.length > 0 && (
            <ul className='diag warn' role='alert'>
              {p.problems.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          <div className='row'>
            <button type='submit' className='primary'>
              Submit
            </button>
            <button type='button' onClick={skip}>
              Skip
            </button>
            <button type='button' onClick={() => rt.disablePrompts(p.promptId)}>
              Disable this prompt
            </button>
            <button type='button' onClick={() => rt.disablePrompts()}>
              Disable all prompts
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function CheckDialog({ rt, view }: { rt: SessionRuntime; view: RuntimeView }) {
  const c = view.check!;
  return (
    <div
      className='forge-dialog'
      role='dialog'
      aria-modal='false'
      aria-labelledby='forge-check-title'
    >
      <h2 id='forge-check-title'>{c.text}</h2>
      <div className='row'>
        {c.responses.map(r => (
          <button
            key={r.id}
            type='button'
            className={r.id === 'yes' ? 'primary' : ''}
            onClick={() => rt.answerCheck(c.instanceId, r.id)}
          >
            {r.label}
          </button>
        ))}
        <button type='button' onClick={() => rt.disableChecks()}>
          Turn off checks
        </button>
      </div>
      {c.deadline !== undefined && (
        <p className='muted'>
          Closes in{' '}
          {Math.max(0, Math.ceil((c.deadline - view.activeMs) / 1000))}s if
          unanswered.
        </p>
      )}
    </div>
  );
}

function Status({
  view,
  ghost,
  showRec,
}: {
  view: RuntimeView;
  ghost: SessionRecord | null;
  showRec: boolean;
}) {
  const g = ghost ? ghostAt(ghost, view.activeMs) : null;
  return (
    <aside className='forge-status' aria-label='Session status'>
      <div className='row'>
        <strong>{view.identity.name}</strong>
        <span className='badge'>
          {view.status === 'running' ? view.phase : view.status}
        </span>
        {view.recording && showRec && (
          <span className='rec' title='This session is being recorded locally'>
            ● REC
          </span>
        )}
      </div>
      <div>
        Intensity {view.intensity.toFixed(1)} / ceiling {view.ceiling}
        <div
          style={{ height: 6, background: '#fff2', borderRadius: 3 }}
          aria-hidden
        >
          <div
            style={{
              width: `${view.intensity * 10}%`,
              height: '100%',
              background: 'var(--primary)',
              borderRadius: 3,
            }}
          />
        </div>
      </div>
      <div>
        Pace {view.pace}/s · grip: {view.grip}
      </div>
      <div className='muted'>Tone: {view.styles.join(', ') || '—'}</div>
      <div className='muted'>
        {view.running ? `Now: ${view.running.name}` : 'Waiting for next event'}
      </div>
      <div className='muted'>
        {formatMs(view.activeMs)} active
        {view.durationLimitMs
          ? ` · limit ${formatMs(view.durationLimitMs)}`
          : ''}
      </div>
      {g && (
        <div className='muted' aria-label='Ghost overlay'>
          Ghost: pace {g.pace ?? '—'} · intensity{' '}
          {g.intensity?.toFixed(1) ?? '—'}
          {g.markers
            .filter(m => m.offsetMs >= 0)
            .slice(0, 2)
            .map((m, i) => (
              <div key={i}>
                in {Math.round(m.offsetMs / 1000)}s: {m.label}
              </div>
            ))}
        </div>
      )}
      {view.configErrors.length > 0 && (
        <div className='warn'>Event config invalid — events disabled.</div>
      )}
    </aside>
  );
}

function Session() {
  const { saved, ready, store } = useForgeConfig();
  const { injectImpulse } = useGameEngine();
  const navigate = useNavigate();
  const location = useLocation();
  const ghostId = (location.state as { ghostId?: string } | null)?.ghostId;
  const [rt, setRt] = useState<SessionRuntime | null>(null);
  const [ghost, setGhost] = useState<SessionRecord | null>(null);
  const frame = useGameFrame(forgePaths) as ForgeFrame;
  const view = frame?.view ?? rt?.view ?? null;
  const finished = useRef(false);

  useEffect(() => {
    if (ghostId) store.getSession(ghostId).then(r => setGhost(r ?? null));
  }, [ghostId, store]);

  useEffect(() => {
    if (!ready) return;
    const runtime = new SessionRuntime(saved);
    runtime.start();
    activeSession.set(runtime);
    setRt(runtime);
    injectImpulse(Forge.enter());
    return () => {
      if (!finished.current) {
        runtime.terminate('user_terminated');
        if (saved.logging.enabled) store.saveSession(runtime.record);
      }
      activeSession.set(null);
      injectImpulse(Forge.leave());
    };
  }, [ready, saved, store, injectImpulse]);

  useEffect(() => {
    if (!rt || view?.status !== 'ended' || finished.current) return;
    finished.current = true;
    const record = rt.record;
    const go = () =>
      navigate(`/forge/history/${encodeURIComponent(record.sessionId)}`, {
        state: { record },
      });
    if (saved.logging.enabled) store.saveSession(record).then(go, go);
    else go();
  }, [rt, view?.status, saved.logging.enabled, store, navigate]);

  if (!rt || !view) return <div className='forge'>Starting…</div>;

  const pause = () => {
    rt.pause('user');
    injectImpulse(Pause.setPaused(true));
  };
  const resume = () => injectImpulse(Pause.setPaused(false));

  return (
    <div
      className={rootClass(saved)}
      style={{
        ...rootStyle(saved),
        position: 'relative',
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <GameImages />
      <WhenLoaded plugin={Stroke}>
        <GameMeter />
      </WhenLoaded>
      <Status
        view={view}
        ghost={ghost}
        showRec={saved.safety.showRecordingIndicator}
      />
      <div className='forge-lines' aria-live='polite' aria-atomic='false'>
        {view.lines.map(l => (
          <div key={l.id} className={`line ${l.kind}`}>
            {l.title}
            {l.description && <span> {l.description}</span>}
          </div>
        ))}
      </div>
      {view.hypno && saved.accessibility.reducedMotion !== 'on' && (
        <div className='forge-hypno' aria-hidden>
          {
            view.hypno.lines[
              Math.floor((view.activeMs - view.hypno.at) / 1200) %
                view.hypno.lines.length
            ]
          }
        </div>
      )}
      {view.prompt && <PromptDialog rt={rt} view={view} />}
      {!view.prompt && view.check && <CheckDialog rt={rt} view={view} />}
      {view.status === 'break' && (
        <div className='forge-dialog' role='status'>
          <h2>Scheduled break</h2>
          <p>Relax. The session resumes automatically.</p>
        </div>
      )}
      <div
        className='forge-session-controls'
        role='toolbar'
        aria-label='Session controls'
      >
        {view.status === 'paused' ? (
          <button type='button' className='primary' onClick={resume}>
            Resume
          </button>
        ) : (
          <button
            type='button'
            onClick={pause}
            disabled={view.status !== 'running'}
          >
            Pause
          </button>
        )}
        <button
          type='button'
          onClick={() => {
            rt.pause('safety');
            injectImpulse(Pause.setPaused(true));
          }}
          disabled={view.status !== 'running'}
          title='Pause without it counting toward anything'
        >
          I need a break
        </button>
        <button
          type='button'
          onClick={() =>
            rt.setIntensityCeiling(Math.max(0, Math.floor(view.ceiling) - 1))
          }
        >
          Lower ceiling
        </button>
        {view.checksEnabled && (
          <button type='button' onClick={() => rt.disableChecks()}>
            Checks off
          </button>
        )}
        {view.promptsEnabled && (
          <button type='button' onClick={() => rt.disablePrompts()}>
            Prompts off
          </button>
        )}
        <button
          type='button'
          className='danger'
          onClick={() => rt.terminate('user_terminated')}
        >
          Stop session
        </button>
      </div>
      <GameResume />
    </div>
  );
}

export const ForgeGamePage = () => (
  <ForgeConfigProvider>
    <Session />
  </ForgeConfigProvider>
);
