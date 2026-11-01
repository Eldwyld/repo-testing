import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/forge/core/rng';
import { validate } from '../../src/forge/core/validate';
import { scanValue } from '../../src/forge/content/guard';
import { BUILTIN_ANATOMY, BUILTIN_DICTIONARIES, BUILTIN_IDENTITIES } from '../../src/forge/identity/builtins';
import { BUILTIN_STYLES, DEFAULT_HYPNO } from '../../src/forge/narrative/builtins';
import { checkStyleMix, composeLine, eligibleStyles, hypnoInterval, hypnoLine } from '../../src/forge/narrative/compose';
import { narrativeStyleV, NarrativeStyle, hypnoConfigV } from '../../src/forge/narrative/types';

const styles = Object.fromEntries(BUILTIN_STYLES.map(s => [s.id, s]));
const dictionaries = Object.fromEntries(BUILTIN_DICTIONARIES.map(d => [d.id, d]));
const narration = (seed = 'n', over = {}) => ({
  identity: BUILTIN_IDENTITIES[0],
  anatomy: BUILTIN_ANATOMY[0],
  dictionaries,
  rng: Rng.fromSeed(seed),
  intensity: 5,
  vars: { pace: 2, intensity: 5, count: 1 },
  ...over,
});

describe('narrative styles', () => {
  it('built-ins validate and contain no excluded terms', () => {
    for (const s of BUILTIN_STYLES) expect(validate(narrativeStyleV, s).issues).toEqual([]);
    expect(validate(hypnoConfigV, DEFAULT_HYPNO).issues).toEqual([]);
    expect(scanValue(BUILTIN_STYLES)).toEqual([]);
  });
  it('severe styles ship disabled', () => {
    expect(['humiliation', 'degradation', 'dehumanization'].map(id => styles[id].enabled)).toEqual([false, false, false]);
  });
  it('every built-in phrase renders for every identity without missing tokens', () => {
    for (const identity of BUILTIN_IDENTITIES) {
      for (const s of BUILTIN_STYLES) {
        const only: NarrativeStyle = { ...s, enabled: true, frequency: 1, intensity: { min: 0, max: 10 } };
        for (const phrase of s.phrases) {
          const line = composeLine({
            styles: { [s.id]: { ...only, phrases: [phrase] } },
            mix: [{ styleId: s.id, strength: 1 }],
            narration: narration('p', { identity }),
            scope: {},
          });
          expect(line, `${identity.id} / ${phrase.id} / ${phrase.text}`).not.toBeNull();
        }
      }
    }
  });
  it('composes from the mix respecting strength 0 and intensity windows', () => {
    const mix = [
      { styleId: 'praise', strength: 1 },
      { styleId: 'clinical_detachment', strength: 0 },
    ];
    for (let i = 0; i < 30; i++) {
      const line = composeLine({ styles, mix, narration: narration(`s${i}`), scope: {} });
      expect(line?.styleId).toBe('praise');
    }
    const severe = { ...styles.degradation, enabled: true };
    const out = eligibleStyles({ styles: { degradation: severe }, mix: [{ styleId: 'degradation', strength: 1 }], narration: narration('x', { intensity: 2 }), scope: {} });
    expect(out).toEqual([]); // degradation min intensity is 4
  });
  it('suppresses the weaker of two incompatible styles and reports the conflict', () => {
    const deg = { ...styles.degradation, enabled: true };
    const idx = { ...styles, degradation: deg };
    const mix = [
      { styleId: 'encouragement', strength: 0.2 },
      { styleId: 'degradation', strength: 1 },
    ];
    expect(checkStyleMix(mix, idx)[0].message).toMatch(/incompatible/);
    const ids = eligibleStyles({ styles: idx, mix, narration: narration('x', { intensity: 6 }), scope: {} }).map(e => e.style.id);
    expect(ids).toEqual(['degradation']);
  });
  it('honours conditional activation', () => {
    const s = { ...styles.reassurance, activation: { field: 'session.phase', operator: 'equals' as const, value: 'break' } };
    const input = (phase: string) => ({ styles: { reassurance: s }, mix: [{ styleId: 'reassurance', strength: 1 }], narration: narration(), scope: { session: { phase } } });
    expect(eligibleStyles(input('active'))).toEqual([]);
    expect(eligibleStyles(input('break'))).toHaveLength(1);
  });
  it('rejects phrases containing excluded words and falls back', () => {
    const s: NarrativeStyle = { ...styles.praise, excluded: ['perfect'], phrases: [
      { id: 'a', text: 'You look perfect.', weight: 100, enabled: true, identities: [] },
      { id: 'b', text: 'Good.', weight: 1, enabled: true, identities: [] },
    ] };
    const line = composeLine({ styles: { praise: s }, mix: [{ styleId: 'praise', strength: 1 }], narration: narration(), scope: {} });
    expect(line?.phraseId).toBe('b');
    expect(line?.rejected[0].reason).toMatch(/excluded/);
  });
  it('emits a configured transition when the style changes', () => {
    const a = { ...styles.praise, transitions: [{ to: 'minimal', template: 'Quieter now.' }] };
    const b = { ...styles.minimal, frequency: 1 };
    const line = composeLine({ styles: { praise: a, minimal: b }, mix: [{ styleId: 'minimal', strength: 1 }], narration: narration(), scope: {}, previousStyle: 'praise' });
    expect(line?.transition).toBe('Quieter now.');
  });
  it('returns null when nothing is eligible (empty mix)', () => {
    expect(composeLine({ styles, mix: [], narration: narration(), scope: {} })).toBeNull();
  });
});

describe('hypnosis-inspired patterns', () => {
  const on = { ...DEFAULT_HYPNO, enabled: true };
  it('is off unless enabled', () => {
    expect(hypnoLine(DEFAULT_HYPNO, narration())).toBeNull();
  });
  it('counting produces a descending sequence of the configured length', () => {
    const cfg = { ...on, patterns: on.patterns.map(p => ({ ...p, enabled: p.id === 'counting', repetitions: 4 })) };
    expect(hypnoLine(cfg, narration())?.lines).toEqual(['4…', '3…', '2…', '1…']);
  });
  it('repetition respects repetitions and max length', () => {
    const cfg = { ...on, patterns: on.patterns.map(p => ({ ...p, enabled: p.id === 'repetition', repetitions: 10, variation: 0, maxLength: 20 })) };
    const out = hypnoLine(cfg, narration())!;
    expect(out.lines.join(' ').length).toBeLessThanOrEqual(20);
    expect(new Set(out.lines).size).toBe(1);
  });
  it('each pattern can be disabled independently', () => {
    const cfg = { ...on, patterns: on.patterns.map(p => ({ ...p, enabled: false })) };
    expect(hypnoLine(cfg, narration())).toBeNull();
  });
  it('interval shortens with intensity', () => {
    expect(hypnoInterval(on, 0)).toBeGreaterThan(hypnoInterval(on, 10));
  });
});
