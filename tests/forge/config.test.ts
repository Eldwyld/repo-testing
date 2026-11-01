import { describe, it, expect } from 'vitest';
import { defaultConfig, forgeConfigV, CONFIG_SCHEMA_VERSION } from '../../src/forge/config/schema';
import { validate } from '../../src/forge/core/validate';
import { compileConfig, originOf } from '../../src/forge/config/library';
import {
  categories,
  changedCategories,
  isCategoryDefault,
  registerCategory,
  resetCategory,
  searchSettings,
  setPath,
} from '../../src/forge/config/registry';
import { applyPreset, BUILTIN_PRESETS, capturePreset } from '../../src/forge/config/presets';
import { exportConfig, importDocument, validateConfig } from '../../src/forge/config/io';
import { migrateConfig } from '../../src/forge/config/migrations';
import { DEFAULT_EVENT_PACK } from '../../src/forge/events/builtins';
import { BUILTIN_IDENTITIES } from '../../src/forge/identity/builtins';

describe('config schema', () => {
  it('default config validates, compiles and has no event errors', () => {
    const c = defaultConfig();
    expect(validate(forgeConfigV, c).issues).toEqual([]);
    const compiled = compileConfig(c);
    expect(compiled.errors).toEqual([]);
    expect(compiled.pack).not.toBeNull();
  });
  it('layers user overrides over built-ins by id', () => {
    const c = defaultConfig();
    c.identities = [{ ...BUILTIN_IDENTITIES[0], displayName: 'Porcelain doll' }, { ...BUILTIN_IDENTITIES[0], id: 'marionette_custom', category: 'marionette', displayName: 'Custom' }];
    const lib = compileConfig(c).library;
    expect(lib.identities.doll.displayName).toBe('Porcelain doll');
    expect(lib.identities.marionette_custom.category).toBe('marionette');
    expect(originOf('identities', 'doll', c)).toBe('override');
    expect(originOf('identities', 'toy', c)).toBe('builtin');
    expect(originOf('identities', 'marionette_custom', c)).toBe('custom');
  });
});

describe('category registry', () => {
  it('covers every requested settings section', () => {
    const sections = new Set(categories().map(c => c.section));
    for (const s of ['identity', 'terminology', 'narrative', 'tone', 'hypnosis', 'session', 'events', 'media', 'prompts', 'checks', 'accounting', 'logging', 'safety'])
      expect(sections.has(s as never)).toBe(true);
  });
  it('resets one category without touching unrelated settings', () => {
    let c = defaultConfig();
    c = setPath(c, 'session.paceMax', 9);
    c = setPath(c, 'session.identityId', 'oracle');
    c = setPath(c, 'checks.enabled', false);
    expect(changedCategories(defaultConfig(), c).sort()).toEqual(['checks', 'session.identity', 'session.pacing']);
    const reset = resetCategory(c, 'session.pacing');
    expect(reset.session.paceMax).toBe(5);
    expect(reset.session.identityId).toBe('oracle');
    expect(reset.checks.enabled).toBe(false);
    expect(isCategoryDefault(reset, 'session.pacing')).toBe(true);
  });
  it('resets only the styles a category owns', () => {
    const c = defaultConfig();
    c.styles = [
      { ...compileConfig(c).library.styles.praise, weight: 9 },
      { ...compileConfig(c).library.styles.clinical_detachment, weight: 9 },
    ];
    const reset = resetCategory(c, 'styles.encouragement');
    expect(reset.styles.map(s => s.id)).toEqual(['clinical_detachment']);
  });
  it('searches labels, keywords and field docs', () => {
    expect(searchSettings('ruin')[0].categoryId).toBe('session.pacing');
    expect(searchSettings('pronoun')[0].categoryId).toBe('pronouns');
    expect(searchSettings('hand check')[0].categoryId).toBe('checks');
    expect(searchSettings('zzzz')).toEqual([]);
  });
  it('accepts new categories without UI changes and rejects duplicates', () => {
    registerCategory({ id: 'test.custom', label: 'Custom thing', section: 'media', path: 'media.associations', editor: 'json', description: 'x', keywords: ['widget'] });
    expect(searchSettings('widget')[0].categoryId).toBe('test.custom');
    expect(() => registerCategory({ id: 'test.custom', label: 'x', section: 'media', path: 'media', editor: 'json', description: '', keywords: [] })).toThrow();
  });
});

describe('presets', () => {
  it('every built-in preset applies cleanly', () => {
    for (const p of BUILTIN_PRESETS) {
      const r = applyPreset(defaultConfig(), p);
      expect(r.ok, p.id).toBe(true);
      if (r.ok) expect(compileConfig(r.config).errors).toEqual([]);
    }
  });
  it('classic preset uses the original dice strategy', () => {
    const r = applyPreset(defaultConfig(), BUILTIN_PRESETS.find(p => p.id === 'classic')!);
    expect(r.ok && r.config.events.selection.strategy).toBe('dice');
  });
  it('category presets only touch their category', () => {
    let c = defaultConfig();
    c = setPath(c, 'session.paceMax', 8);
    c = setPath(c, 'safety.intensityCeiling', 6);
    const preset = capturePreset(c, { id: 'my_pacing', name: 'My pacing', categoryId: 'session.pacing' });
    const target = setPath(defaultConfig(), 'safety.intensityCeiling', 3);
    const r = applyPreset(target, preset);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.session.paceMax).toBe(8);
      expect(r.config.safety.intensityCeiling).toBe(3);
    }
  });
});

describe('import / export / migration', () => {
  it('round-trips a config through export and import', () => {
    const c = setPath(defaultConfig(), 'session.identityId', 'muse');
    const r = importDocument(exportConfig(c));
    expect(r.ok && r.kind === 'config' && r.value.session.identityId).toBe('muse');
  });
  it('migrates v1 configs', () => {
    const v1 = { kind: 'forge.config', schemaVersion: 1, session: { styles: ['praise', 'minimal'] }, checks: [], events: {}, prompts: {}, logging: {}, accessibility: {} };
    const m = migrateConfig(v1);
    expect(m.to).toBe(CONFIG_SCHEMA_VERSION);
    expect((m.value.session as { styleMix: unknown }).styleMix).toEqual([{ styleId: 'praise', strength: 1 }, { styleId: 'minimal', strength: 1 }]);
    const r = importDocument(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.notes.join(' ')).toMatch(/style mix/);
  });
  it('imports original joi.how settings, dropping pet-themed modes', () => {
    const joi = { gameDuration: 600, warmupDuration: 30, climaxChance: 80, ruinChance: 10, minPace: 0.5, maxPace: 4, steepness: 0.5, timeshift: 0.5, events: ['randomPace', 'halfPace', 'climax'], hypno: 'femdom', gender: 'female', body: 'vagina', highRes: false };
    const r = importDocument(JSON.stringify(joi));
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === 'config') {
      expect(r.value.session).toMatchObject({ durationSeconds: 600, warmupSeconds: 30, climaxChance: 80, ruinChance: 10, paceMin: 0.5, paceMax: 4, pronounsOverride: 'she', anatomyId: 'anatomy.vulva' });
      expect(r.value.events.disabledEventIds.sort()).toEqual(['clean_up', 'double_pace', 'random_grip', 'rising_pace', 'scripted_pause']);
      expect(r.value.events.selection.strategy).toBe('dice');
      expect(r.notes.join(' ')).toMatch(/pet-themed/);
    }
  });
  it('rejects malformed, oversized, future and prohibited input with actionable errors', () => {
    expect(importDocument('{nope')).toMatchObject({ ok: false });
    expect((importDocument('{"kind":"other"}') as { errors: string[] }).errors[0]).toMatch(/Unrecognised/);
    const future = { ...defaultConfig(), schemaVersion: 99 };
    expect((importDocument(JSON.stringify(future)) as { errors: string[] }).errors[0]).toMatch(/newer/);
    const bad = setPath(defaultConfig(), 'session.paceMin', -4);
    expect((importDocument(JSON.stringify(bad)) as { errors: string[] }).errors[0]).toMatch(/session.paceMin/);
    const pet = defaultConfig();
    pet.identities = [{ ...BUILTIN_IDENTITIES[0], id: 'pup', displayName: 'Puppy' }];
    expect((importDocument(JSON.stringify(pet)) as { errors: string[] }).errors[0]).toMatch(/Excluded vocabulary/);
  });
  it('rejects prototype-pollution keys', () => {
    const c = JSON.parse(exportConfig(defaultConfig()));
    const text = JSON.stringify(c).replace('"tags":{}', '"tags":{"__proto__":["x"]}');
    const r = validateConfig(JSON.parse(text));
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
  it('imports event packs with warnings and rejects broken ones', () => {
    const ok = importDocument(JSON.stringify(DEFAULT_EVENT_PACK));
    expect(ok.ok).toBe(true);
    const broken = { ...DEFAULT_EVENT_PACK, events: [{ ...DEFAULT_EVENT_PACK.events[0], next: 'missing' }] };
    const r = importDocument(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    expect((r as { errors: string[] }).errors[0]).toMatch(/\[random_pace\].*unknown event/);
  });
});
