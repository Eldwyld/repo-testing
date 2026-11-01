import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { defaultConfig, ForgeConfig } from '../../src/forge/config/schema';
import { setPath } from '../../src/forge/config/registry';
import { SessionRuntime } from '../../src/forge/runtime/runtime';
import { dryRun, explainEligibility, verifyReplay } from '../../src/forge/runtime/simulate';
import { computeAccounting, DEFAULT_ACCOUNTING } from '../../src/forge/accounting/accounting';
import { DEFAULT_CHECKS, previewSchedule } from '../../src/forge/checks/checks';
import { detectPerspective, validateResponse, DEFAULT_PROMPTS, promptsForTrigger } from '../../src/forge/prompts/prompts';
import { autopsy, filterEvents, intensityCurve, paceCurve, pauseIntervals, valueAt } from '../../src/forge/session/analysis';
import { ghostAt, ReplayCursor, reproducibility } from '../../src/forge/session/replay';
import { exportCsv, exportJson, PRIVATE_DEFAULTS } from '../../src/forge/session/export';
import { validate } from '../../src/forge/core/validate';
import { sessionRecordV, SessionRecord } from '../../src/forge/session/types';
import { IdbStore, MemoryStore } from '../../src/forge/storage/store';
import { importDocument } from '../../src/forge/config/io';

const cfg = (mut: (c: ForgeConfig) => ForgeConfig = c => c) => mut(defaultConfig());

function runFor(rt: SessionRuntime, seconds: number, each?: (rt: SessionRuntime) => void) {
  for (let i = 0; i < seconds * 10 && rt.view.status !== 'ended'; i++) {
    rt.tick(100);
    each?.(rt);
  }
}

describe('runtime safety guarantees', () => {
  it('terminate() ends immediately even with a blocking required prompt open', () => {
    const c = cfg(x => {
      x.prompts.templates = x.prompts.templates.map(p => (p.id === 'pause_reflection' ? { ...p, enabled: true, required: true, blocking: true } : p));
      return x;
    });
    const rt = new SessionRuntime(c, { seed: 't' });
    runFor(rt, 5);
    rt.pause();
    expect(rt.view.prompt?.promptId).toBe('pause_reflection');
    rt.terminate();
    expect(rt.view.status).toBe('ended');
    expect(rt.view.prompt).toBeUndefined();
    expect(rt.record.endReason).toBe('user_terminated');
    const before = rt.record.events.length;
    rt.tick(10000);
    rt.resume();
    expect(rt.record.events.length).toBe(before);
  });
  it('pause freezes the engine and active clock; scripts cannot resume', () => {
    const rt = new SessionRuntime(cfg(), { seed: 'p' });
    runFor(rt, 10);
    rt.pause();
    const active = rt.view.activeMs;
    const n = rt.record.events.length;
    runFor(rt, 120);
    expect(rt.view.status).toBe('paused');
    expect(rt.view.activeMs).toBe(active);
    expect(rt.record.events.length).toBe(n);
  });
  it('intensity never exceeds the safety ceiling or identity max, even via scripted increases', () => {
    const c = cfg(x => setPath(setPath(x, 'safety.intensityCeiling', 4), 'session.durationSeconds', 60));
    c.events.packs = [{
      kind: 'forge.eventPack', schemaVersion: 1, id: 'boost', name: 'Boost', description: '', groups: [], sequences: [],
      events: [{ id: 'boost', name: 'Boost', type: 'custom', description: '', enabled: true, weight: 1000, selectable: true, tags: [], intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {}, steps: [{ do: 'intensity', add: 10 }] }],
    }];
    const rt = new SessionRuntime(c, { seed: 'c' });
    let max = 0;
    runFor(rt, 120, r => (max = Math.max(max, r.view.intensity)));
    expect(max).toBeLessThanOrEqual(4);
    rt.setIntensityCeiling(2);
    expect(rt.view.intensity).toBeLessThanOrEqual(2);
  });
  it('duration limit ends the session even while paused', () => {
    const rt = new SessionRuntime(cfg(x => setPath(x, 'safety.maxDurationMinutes', 1)), { seed: 'd' });
    runFor(rt, 10);
    rt.pause();
    runFor(rt, 60);
    expect(rt.view.status).toBe('ended');
    expect(rt.record.endReason).toBe('duration_limit');
  });
  it('scheduled breaks pause activity and are logged as safety events', () => {
    const rt = new SessionRuntime(cfg(x => setPath(x, 'safety.breaks', { enabled: true, everyMinutes: 1, lengthSeconds: 10 })), { seed: 'b' });
    runFor(rt, 75);
    expect(rt.record.events.some(e => e.type === 'pause' && e.source === 'safety')).toBe(true);
    expect(rt.record.events.some(e => e.type === 'resume' && e.source === 'safety')).toBe(true);
  });
  it('a malformed event configuration degrades gracefully (session still runs)', () => {
    const c = cfg();
    c.events.packs = [{ kind: 'forge.eventPack', schemaVersion: 1, id: 'bad', name: 'Bad', description: '', groups: [], sequences: [], events: [{ ...defaultConfig().events.packs[0] ?? {}, id: 'loop', name: 'Loop', type: 'custom', description: '', enabled: true, weight: 1, selectable: true, tags: [], intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {}, steps: [], next: 'loop' }] }];
    const rt = new SessionRuntime(c, { seed: 'm' });
    runFor(rt, 30);
    expect(rt.view.configErrors[0]).toMatch(/cycle/);
    expect(rt.view.status).toBe('running');
    expect(rt.record.events.some(e => e.type === 'error' && /events disabled/.test(String(e.data.recovery)))).toBe(true);
  });
});

describe('prompts and checks in a session', () => {
  it('validates object-language responses with retries and records outcome', () => {
    const c = cfg(x => {
      x.session.identityId = 'scientific_subject';
      x.prompts.templates = x.prompts.templates.map(p => (p.id === 'pause_reflection' ? { ...p, enabled: true, minLength: 5, vocabulary: { mode: 'identity', minMatches: 1, words: [], categories: [] }, perspectives: ['third'] } : p));
      return x;
    });
    const rt = new SessionRuntime(c, { seed: 'v' });
    runFor(rt, 2);
    rt.pause();
    const id = rt.view.prompt!.instanceId;
    const bad = rt.submitPrompt(id, 'I feel fine');
    expect(bad?.valid).toBe(false);
    expect(rt.view.prompt?.problems.join(' ')).toMatch(/identity dictionary/);
    const good = rt.submitPrompt(id, 'The subject is observed and monitored.');
    expect(good?.valid).toBe(true);
    expect(rt.view.prompt).toBeUndefined();
    const types = rt.record.events.map(e => e.type);
    expect(types).toContain('prompt_invalid');
    expect(types).toContain('prompt_submitted');
  });
  it('random checks are scheduled, answerable, and can be disabled mid-session', () => {
    const c = cfg(x => {
      x.checks.items = x.checks.items.map(ch => (ch.id === 'instruction_following' ? { ...ch, schedule: { ...ch.schedule, perMinute: 10, minGapSeconds: 3 } } : ch));
      x.checks.globalMinGapSeconds = 3;
      x.events.selection.triggerProbability = 0;
      return x;
    });
    const rt = new SessionRuntime(c, { seed: 'k' });
    let answered = 0;
    runFor(rt, 60, r => {
      if (r.view.check) {
        r.answerCheck(r.view.check.instanceId, answered % 2 ? 'no' : 'yes');
        answered++;
      }
    });
    expect(answered).toBeGreaterThan(3);
    rt.disableChecks();
    const n = rt.record.events.filter(e => e.type === 'check_shown').length;
    runFor(rt, 60);
    expect(rt.record.events.filter(e => e.type === 'check_shown').length).toBe(n);
  });
  it('negative answers only trigger consequences the user configured', () => {
    const c = cfg(x => {
      x.checks.items = x.checks.items.map(ch => ({ ...ch, schedule: { ...ch.schedule, perMinute: ch.id === 'instruction_following' ? 10 : 0, minGapSeconds: 1 } }));
      x.checks.globalMinGapSeconds = 1;
      x.events.selection.triggerProbability = 0;
      return x;
    });
    const rt = new SessionRuntime(c, { seed: 'n' });
    runFor(rt, 30, r => r.view.check && r.answerCheck(r.view.check.instanceId, 'no'));
    expect(rt.record.events.some(e => e.type === 'event_started')).toBe(false);
    c.checks.items = c.checks.items.map(ch => (ch.id === 'instruction_following' ? { ...ch, onNegativeEvent: 'scripted_pause' } : ch));
    const rt2 = new SessionRuntime(c, { seed: 'n' });
    runFor(rt2, 30, r => r.view.check && r.answerCheck(r.view.check.instanceId, 'no'));
    expect(rt2.record.events.some(e => e.type === 'event_started' && e.eventId === 'scripted_pause')).toBe(true);
  });
  it('check preview mode schedules without running a session', () => {
    const times = previewSchedule(DEFAULT_CHECKS, { durationSeconds: 600, seed: 'x' });
    expect(times.length).toBeGreaterThan(0);
    for (let i = 1; i < times.length; i++) expect(times[i].at - times[i - 1].at).toBeGreaterThanOrEqual(30000);
    expect(times.every(t => !['cleanup_done', 'edging'].includes(t.checkId))).toBe(true);
  });
  it('perspective detection and prompt triggers', () => {
    expect(detectPerspective('I am still', [])).toBe('first');
    expect(detectPerspective('The doll is polished', ['doll'])).toBe('third');
    expect(validateResponse('', { ...DEFAULT_PROMPTS[0], minLength: 3 }, { identityVocabulary: [], objectNouns: [] }).valid).toBe(false);
    const thresholds = [{ ...DEFAULT_PROMPTS[1], enabled: true, triggers: [{ on: 'intensity_threshold' as const, value: 5 }] }];
    expect(promptsForTrigger(thresholds, { on: 'intensity_threshold', value: 5.01, previous: 4.99 })).toHaveLength(1);
    expect(promptsForTrigger(thresholds, { on: 'intensity_threshold', value: 6, previous: 5.5 })).toHaveLength(0);
  });
});

function sampleSession(seed = 'sample'): SessionRecord {
  const c = cfg(x => {
    x.session.durationSeconds = 120;
    x.checks.items = x.checks.items.map(ch => (ch.id === 'instruction_following' ? { ...ch, schedule: { ...ch.schedule, perMinute: 6, minGapSeconds: 5 } } : ch));
    x.checks.globalMinGapSeconds = 5;
    x.prompts.templates = x.prompts.templates.map(p => (p.id === 'pause_reflection' ? { ...p, enabled: true } : p));
    return x;
  });
  const rt = new SessionRuntime(c, { seed, startedAt: new Date('2026-01-01T12:00:00Z') });
  let i = 0;
  let answers = 0;
  runFor(rt, 60, r => {
    i++;
    if (i === 200) r.pause('user');
    if (i === 260) {
      if (r.view.prompt) r.submitPrompt(r.view.prompt.instanceId, 'The doll is posed and polished.');
      r.resume();
    }
    if (i === 400) r.pause('safety');
    if (i === 420) r.resume();
    if (r.view.check) r.answerCheck(r.view.check.instanceId, answers++ % 2 ? 'yes' : 'no');
  });
  rt.terminate();
  return rt.record;
}

describe('session log, analysis and replay', () => {
  const record = sampleSession();
  it('produces a valid, chronological record with stable ids', () => {
    expect(validate(sessionRecordV, record).issues).toEqual([]);
    const ids = record.events.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < record.events.length; i++) expect(record.events[i].t).toBeGreaterThanOrEqual(record.events[i - 1].t);
    expect(record.events[0].type).toBe('session_started');
    expect(record.events[record.events.length - 1].type).toBe('session_ended');
    expect(record.replay).toMatchObject({ seed: 'sample', configEmbedded: true, tickMs: 50 });
  });
  it('reconstructs intensity and pace curves from the stream', () => {
    const intensity = intensityCurve(record.events);
    const pace = paceCurve(record.events);
    expect(intensity[0]).toEqual({ t: 0, v: 0 });
    for (let i = 1; i < intensity.length; i++) expect(intensity[i].t).toBeGreaterThanOrEqual(intensity[i - 1].t);
    expect(pace[0].v).toBe(1);
    expect(valueAt(pace, 0)).toBe(1);
    expect(valueAt(intensity, -1)).toBeUndefined();
  });
  it('autopsy summarises pauses, events and significant moments', () => {
    const a = autopsy(record);
    expect(a.pauses).toHaveLength(2);
    expect(a.pauses[1].reason).toBe('safety');
    expect(a.endReason).toBe('user_terminated');
    expect(a.eventsRun).toBeGreaterThan(0);
    expect(a.significant.some(s => /ended by user/.test(s.text))).toBe(true);
    expect(pauseIntervals(record.events)[0].end).toBeGreaterThan(pauseIntervals(record.events)[0].start);
  });
  it('filters by type and intensity range', () => {
    const checks = filterEvents(record.events, { types: ['check_answered'] });
    expect(checks.every(e => e.type === 'check_answered')).toBe(true);
    const late = filterEvents(record.events, { intensity: { min: 3, max: 10 } });
    expect(late.every(e => (valueAt(intensityCurve(record.events), e.t) ?? 0) >= 3)).toBe(true);
  });
  it('replay cursor reconstructs state at any time', () => {
    const cursor = new ReplayCursor(record.events);
    const pauseAt = record.events.find(e => e.type === 'pause')!.t;
    expect(cursor.at(pauseAt).paused).toBe(true);
    expect(cursor.at(pauseAt - 1).paused).toBe(false);
    expect(cursor.at(cursor.duration).index).toBe(record.events.length - 1);
  });
  it('ghost overlay aligns on active time and is read-only', () => {
    const g = ghostAt(record, 30000);
    expect(typeof g.intensity).toBe('number');
    expect(g.markers.every(m => Math.abs(m.offsetMs) <= 10000)).toBe(true);
  });
  it('deterministic re-simulation reproduces the engine-driven events', () => {
    const v = verifyReplay(record);
    expect(v.attempted).toBe(true);
    expect(v.divergences).toEqual([]);
    expect(v.matches).toBe(true);
    expect(v.compared).toBeGreaterThan(10);
  });
  it('reports honestly when exact reconstruction is impossible', () => {
    const redacted = { ...record, config: undefined, replay: { ...record.replay, configEmbedded: false } };
    const v = verifyReplay(redacted);
    expect(v.attempted).toBe(false);
    expect(v.limitations.join(' ')).toMatch(/configuration snapshot is not embedded/);
    const r = reproducibility({ ...record, replay: { ...record.replay, appVersion: '0.0.1' } }, { engineVersion: 1, appVersion: '9' });
    expect(r.deterministic).toBe(false);
    expect(r.limitations.join(' ')).toMatch(/Media files are never embedded/);
  });
  it('accounting separates facts from rules and never counts safety events', () => {
    const report = computeAccounting(record, DEFAULT_ACCOUNTING, { checks: DEFAULT_CHECKS });
    expect(report.facts.pauses).toBe(1);
    expect(report.facts.safetyPauses).toBe(1);
    const neg = report.lines.find(l => l.ruleId === 'checks_negative')!;
    expect(neg.counted).toBe(report.facts.negative);
    expect(neg.explanation).toMatch(/× 1 point/);
    const withPauses = { ...DEFAULT_ACCOUNTING, rules: DEFAULT_ACCOUNTING.rules.map(r => (r.id === 'pauses' ? { ...r, enabled: true } : r)) };
    const r2 = computeAccounting(record, withPauses);
    expect(r2.lines.find(l => l.ruleId === 'pauses')!.counted).toBe(1);
    const termination = record.events.find(e => e.type === 'termination')!;
    for (const line of r2.lines) expect(line.recordIds).not.toContain(termination.id);
  });
  it('supports exclusion, correction, caps, weights, manual adjustment and checklist selection', () => {
    const neg = record.events.filter(e => e.type === 'check_answered' && e.data.value === 'negative');
    const pos = record.events.filter(e => e.type === 'check_answered' && e.data.value === 'positive');
    expect(neg.length).toBeGreaterThan(1);
    const r: SessionRecord = {
      ...record,
      annotations: [{ recordId: neg[0].id, note: 'misclick', excluded: true }, { recordId: pos[0].id, note: '', excluded: false, correctedResponse: 'no' }],
      adjustments: [{ ruleId: 'checks_negative', delta: -1, note: 'leniency' }],
    };
    const rules = { ...DEFAULT_ACCOUNTING, rules: DEFAULT_ACCOUNTING.rules.map(x => (x.id === 'checks_negative' ? { ...x, points: 2, maxCount: 100 } : x)) };
    const report = computeAccounting(r, rules, { checks: DEFAULT_CHECKS });
    const line = report.lines.find(l => l.ruleId === 'checks_negative')!;
    expect(line.counted).toBe(neg.length); // -1 excluded, +1 corrected
    expect(line.total).toBe(neg.length * 2 - 1);
    expect(report.facts.excludedRecords).toBe(1);
    expect(report.facts.correctedRecords).toBe(1);
    const only = computeAccounting(r, rules, { checks: DEFAULT_CHECKS, selection: ['checks_positive'] });
    expect(only.totals.negative).toBe(0);
    const capped = computeAccounting(record, { ...DEFAULT_ACCOUNTING, rules: [{ ...DEFAULT_ACCOUNTING.rules[0], maxCount: 1 }] });
    expect(capped.lines[0].counted).toBe(1);
    const off = computeAccounting(record, { ...DEFAULT_ACCOUNTING, enabled: false });
    expect(off.lines).toEqual([]);
  });
  it('exports JSON/CSV with private redaction defaults', () => {
    const json = JSON.parse(exportJson(record));
    const submitted = json.events.find((e: { type: string }) => e.type === 'prompt_submitted');
    expect(submitted.data.response).toBe('[redacted]');
    const full = JSON.parse(exportJson(record, { ...PRIVATE_DEFAULTS, excludeFreeText: false, excludeConfig: true }));
    expect(full.config).toBeUndefined();
    expect(full.replay.configEmbedded).toBe(false);
    const csv = exportCsv(record);
    expect(csv.split('\n')[0]).toBe('id,t_ms,active_ms,type,source,event_id,data');
    expect(csv.split('\n')).toHaveLength(record.events.length + 1);
    expect(importDocument(exportJson(record)).ok).toBe(true);
  });
  it('csv neutralises formula injection', () => {
    const r: SessionRecord = { ...record, events: [{ ...record.events[0], eventId: '=HYPERLINK("x")' }] };
    expect(exportCsv(r)).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('dry run and eligibility explanation', () => {
  it('previews event selection without storing anything', () => {
    const out = dryRun(cfg(), { seconds: 300, seed: 'dry' });
    expect(out.configErrors).toEqual([]);
    expect(out.timeline.some(t => t.type === 'event_started')).toBe(true);
    expect(dryRun(cfg(), { seconds: 300, seed: 'dry' }).timeline).toEqual(out.timeline);
  });
  it('explains why events are or are not eligible', () => {
    const e = explainEligibility(cfg(), { intensity: 0.5 });
    expect(e.find(x => x.eventId === 'half_pace')?.reason).toMatch(/intensity 0.5 outside 1–5/);
    expect(e.find(x => x.eventId === 'random_pace')?.eligible).toBe(true);
    const mid = explainEligibility(cfg(), { intensity: 5 });
    expect(mid.find(x => x.eventId === 'stillness_after_pauses')?.reason).toBe('conditions not met');
    expect(explainEligibility(cfg(), { intensity: 5, pauses: 2 }).find(x => x.eventId === 'stillness_after_pauses')?.eligible).toBe(true);
  });
  it('a full classic-style session reaches the climax and ends', () => {
    const c = cfg(x => {
      x.session.durationSeconds = 60;
      x.events.selection.strategy = 'dice';
      x.checks.enabled = false;
      return x;
    });
    const out = dryRun(c, { seconds: 400, seed: 'climax' });
    expect(out.record.endReason).toBe('completed');
    expect(out.timeline.some(t => t.type === 'climax')).toBe(true);
  });
});

describe('storage', () => {
  for (const [name, make] of [['memory', () => new MemoryStore()], ['indexeddb', () => new IdbStore(`test-${Math.random()}`)]] as const) {
    it(`${name}: saves, lists, deletes individual and all sessions`, async () => {
      const store = make();
      const a = sampleSession('a');
      const b = { ...sampleSession('b'), sessionId: 'other', startedAt: '2026-02-01T00:00:00.000Z' };
      await store.saveSession(a);
      await store.saveSession(b);
      const list = await store.listSessions();
      expect(list.map(s => s.sessionId)).toEqual(['other', a.sessionId]);
      expect((await store.getSession(a.sessionId))?.events.length).toBe(a.events.length);
      await store.deleteSession('other');
      expect((await store.listSessions()).length).toBe(1);
      expect(await store.deleteAllSessions()).toBe(1);
      expect(await store.listSessions()).toEqual([]);
    });
    it(`${name}: falls back to defaults on a corrupted stored config`, async () => {
      const store = make();
      const { config } = await store.loadConfig();
      expect(config.kind).toBe('forge.config');
      await store.saveConfig({ ...config, session: { ...config.session, paceMin: -10 } });
      const loaded = await store.loadConfig();
      expect(loaded.notes[0]).toMatch(/invalid/);
      expect(loaded.config.session.paceMin).toBe(1);
    });
  }
});
