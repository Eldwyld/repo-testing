import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/forge/core/rng';
import { renderTemplate, parseTemplate } from '../../src/forge/core/template';
import { validate, v, formatIssues } from '../../src/forge/core/validate';
import { scanText, scanValue, isClean } from '../../src/forge/content/guard';
import {
  BUILTIN_ANATOMY,
  BUILTIN_DICTIONARIES,
  BUILTIN_IDENTITIES,
} from '../../src/forge/identity/builtins';
import { BUILTIN_PRONOUNS, conjugate, formOf } from '../../src/forge/identity/grammar';
import { narrate, lintIdentity, previewIdentity, gerund } from '../../src/forge/identity/render';
import { collectEntries, resolveDictionaries } from '../../src/forge/identity/resolve';
import {
  anatomyProfileV,
  dictionaryV,
  identityProfileV,
  IdentityProfile,
  Dictionary,
} from '../../src/forge/identity/types';

const dictIndex = Object.fromEntries(BUILTIN_DICTIONARIES.map(d => [d.id, d]));
const anatomy = (id: string) => BUILTIN_ANATOMY.find(a => a.id === id)!;
const identity = (id: string) => BUILTIN_IDENTITIES.find(i => i.id === id)!;
const pronouns = (id: string) => BUILTIN_PRONOUNS.find(p => p.id === id)!;

const ctx = (over: Partial<Parameters<typeof narrate>[1]> = {}) => ({
  identity: identity('doll'),
  anatomy: anatomy('anatomy.penis'),
  dictionaries: dictIndex,
  rng: Rng.fromSeed('test'),
  intensity: 5,
  ...over,
});

describe('validator', () => {
  it('reports nested paths', () => {
    const schema = v.object({ a: v.array(v.object({ w: v.number({ min: 0 }) })) });
    const r = validate(schema, { a: [{ w: 1 }, { w: -2 }, { w: 'x' }] });
    expect(r.ok).toBe(false);
    expect(r.issues.map(i => i.path)).toEqual(['a[1].w', 'a[2].w']);
    expect(formatIssues(r.issues)).toContain('a[1].w: must be >= 0');
  });
  it('applies defaults and strict unknown-field checks', () => {
    const schema = v.object({ x: v.number().default(3) }, { strict: true });
    expect(validate(schema, {})).toMatchObject({ ok: true, value: { x: 3 } });
    expect(validate(schema, { y: 1 }).ok).toBe(false);
  });
  it('validates every built-in data set', () => {
    for (const d of BUILTIN_DICTIONARIES) expect(validate(dictionaryV, d).issues).toEqual([]);
    for (const a of BUILTIN_ANATOMY) expect(validate(anatomyProfileV, a).issues).toEqual([]);
    for (const i of BUILTIN_IDENTITIES) expect(validate(identityProfileV, i).issues).toEqual([]);
  });
});

describe('rng', () => {
  it('is deterministic and resumable from serialised state', () => {
    const a = Rng.fromSeed('seed');
    const first = [a.next(), a.next()];
    const saved = a.state;
    const third = a.next();
    expect(Rng.fromSeed('seed').next()).toBe(first[0]);
    expect(new Rng(saved).next()).toBe(third);
  });
  it('never selects zero-weight items', () => {
    const r = Rng.fromSeed('w');
    for (let i = 0; i < 500; i++) expect(r.weighted(['a', 'b', 'c'], x => (x === 'b' ? 0 : 1))).not.toBe('b');
    expect(r.weighted(['a'], () => 0)).toBeUndefined();
  });
  it('approximates configured weights', () => {
    const r = Rng.fromSeed('dist');
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) counts[r.weighted(['a', 'b'] as const, x => (x === 'a' ? 3 : 1))!]++;
    expect(counts.a / 4000).toBeGreaterThan(0.7);
    expect(counts.a / 4000).toBeLessThan(0.8);
  });
});

describe('template', () => {
  it('parses tokens, args, casing and escapes', () => {
    const parts = parseTemplate('{{x}} {Subject} {part:chest.plural}');
    expect(parts[0]).toBe('{');
    expect(parts).toContainEqual(expect.objectContaining({ name: 'subject', casing: 'capital' }));
    expect(parts).toContainEqual(expect.objectContaining({ name: 'part', arg: 'chest.plural' }));
  });
  it('leaves unknown tokens and reports them', () => {
    const r = renderTemplate('Hello {who} {unknown}', t => (t.name === 'who' ? 'doll' : undefined));
    expect(r.text).toBe('Hello doll {unknown}');
    expect(r.missing).toEqual(['{unknown}']);
  });
});

describe('content guard', () => {
  it('flags petplay and animal-role terminology', () => {
    expect(isClean('good puppy')).toBe(false);
    expect(isClean('Put the LEASH on')).toBe(false);
    expect(isClean('p4ws')).toBe(false);
    expect(scanText('kneel at the kennel')[0].category).toBe('petplay');
  });
  it('does not flag substrings of unrelated words', () => {
    expect(isClean('the carpet is petite and competent; collarbone; pigment')).toBe(true);
  });
  it('supports user-added terms and scans nested values incl. keys', () => {
    expect(isClean('a marionette', ['marionette'])).toBe(false);
    const findings = scanValue({ entries: [{ text: 'fine' }, { text: 'kitten' }], pet: 1 });
    expect(findings.map(f => f.path).sort()).toEqual(['entries[1].text', 'pet (key)']);
  });
  it('no built-in data contains excluded terms', () => {
    expect(scanValue([BUILTIN_DICTIONARIES, BUILTIN_IDENTITIES, BUILTIN_ANATOMY])).toEqual([]);
  });
});

describe('grammar', () => {
  it('conjugates by person and pronoun agreement', () => {
    expect(conjugate('be', 'second', pronouns('it'))).toBe('are');
    expect(conjugate('be', 'first', pronouns('it'))).toBe('am');
    expect(conjugate('be', 'third', pronouns('it'))).toBe('is');
    expect(conjugate('be', 'third', pronouns('they'))).toBe('are');
    expect(conjugate('carry on', 'third', pronouns('she'))).toBe('carries on');
    expect(conjugate('touch', 'third', pronouns('he'))).toBe('touches');
  });
  it('derives plural and possessive forms', () => {
    expect(formOf({ singular: 'specimen' }, 'possessive')).toBe("specimen's");
    expect(formOf({ singular: 'body' }, 'plural')).toBe('bodies');
    expect(formOf({ singular: 'glass', plural: 'glasses' }, 'pluralPossessive')).toBe("glasses'");
  });
  it('builds gerunds', () => {
    expect(gerund('rub')).toBe('rubbing');
    expect(gerund('stroke')).toBe('stroking');
    expect(gerund('touch')).toBe('touching');
  });
});

describe('dictionary resolution', () => {
  it('follows explicit inheritance only, once, and reports cycles/missing', () => {
    const a: Dictionary = { ...dictIndex.doll, id: 'a', extends: ['b', 'nope'] };
    const b: Dictionary = { ...dictIndex.doll, id: 'b', extends: ['a'] };
    const r = resolveDictionaries(['a'], { a, b });
    expect(r.chain.map(d => d.id)).toEqual(['a', 'b']);
    expect(r.missing).toEqual(['nope']);
    expect(r.cycles).toEqual(['a -> b -> a']);
  });
  it('doll inherits shared objectification vocabulary', () => {
    const { chain } = resolveDictionaries(['doll'], dictIndex);
    expect(chain.map(d => d.id)).toEqual(['doll', 'objectification_core']);
  });
  it('filters disabled, intensity-gated, style-overridden and prohibited entries', () => {
    const base = dictIndex.objectification_core;
    const d: Dictionary = {
      ...base,
      styleOverrides: { clinical_detachment: { disable: ['objectification_core.ownership.1'], categoryWeights: {} } },
    };
    const low = collectEntries([d], { category: 'ownership', intensity: 1 }).map(e => e.entry.text);
    expect(low).not.toContain('property'); // gated @4-10
    const styled = collectEntries([d], { category: 'ownership', intensity: 8, style: 'clinical_detachment' });
    expect(styled.map(e => e.entry.text)).not.toContain('owned');
    const prohibited = collectEntries([d], { category: 'ownership', intensity: 8, prohibitedWords: ['kept'] });
    expect(prohibited.map(e => e.entry.text)).not.toContain('kept');
  });
  it('returns nothing (and render reports missing) for empty dictionaries', () => {
    const empty: Dictionary = { ...dictIndex.doll, id: 'empty', extends: [], entries: [] };
    const ident: IdentityProfile = { ...identity('doll'), dictionaries: ['empty'] };
    const r = narrate('{term:materials}', ctx({ identity: ident, dictionaries: { empty } }));
    expect(r.missing).toEqual(['{term:materials}']);
  });
});

describe('narration rendering', () => {
  it('renders second-person doll narration', () => {
    const r = narrate('{Subject} {is} a {object}. {Their} {hands} stay still.', ctx());
    expect(r.text).toMatch(/^You are a doll\. Your \w[\w ]* stay still\.$/);
    expect(r.missing).toEqual([]);
  });
  it('renders third-person subject with they/them agreement', () => {
    const r = narrate('{Subject} {is} observed. {They} {verb:remain} calm.', ctx({ identity: identity('scientific_subject') }));
    expect(r.text).toBe('The subject is observed. They remain calm.');
  });
  it('respects pronoun and person overrides independently of anatomy', () => {
    const r = narrate('{They} {verb:hold} {their} {part:genitals@anatomical}.', ctx({
      identity: { ...identity('muse'), person: 'third' },
      pronouns: pronouns('he'),
      anatomy: anatomy('anatomy.vulva'),
    }));
    expect(r.text).toBe('He holds his vulva.');
  });
  it('selects register by style and supports explicit form/register', () => {
    const clinical = narrate('{part:genitals}', ctx({ style: 'clinical_detachment' }));
    expect(clinical.text).toBe('genital tissue');
    const plural = narrate('{part:body.plural@object}', ctx({ identity: identity('toy') }));
    expect(['frames']).toContain(plural.text);
  });
  it('applies identity-specific body overrides (doll skin is porcelain-like)', () => {
    const r = narrate('{part:skin}', ctx());
    expect(['porcelain', 'finish', 'glaze', 'surface']).toContain(r.text);
  });
  it('applies custom literal rules and flags prohibited output', () => {
    const ident = { ...identity('doll'), rules: [{ id: 'r', enabled: true, find: 'doll', replace: 'figurine' }] };
    expect(narrate('the {object}', ctx({ identity: ident })).text).toBe('the figurine');
    expect(narrate('good puppy', ctx()).blocked).toContain('puppy');
  });
  it('resolves nested tokens in dictionary entries and vars', () => {
    const r = narrate('{term:diagnostics}', ctx({ identity: identity('automaton'), rng: Rng.fromSeed('x3'), vars: { intensity: 7 } }));
    expect(r.text).not.toContain('{');
  });
  it('preview renders every built-in identity without unresolved tokens', () => {
    for (const ident of BUILTIN_IDENTITIES) {
      for (const a of BUILTIN_ANATOMY) {
        const lines = previewIdentity(ctx({ identity: ident, anatomy: a }));
        for (const line of lines) {
          expect(line.missing, `${ident.id}/${a.id}: ${line.template}`).toEqual([]);
          expect(line.blocked).toEqual([]);
        }
      }
    }
  });
  it('lints configuration problems', () => {
    const ident = {
      ...identity('oracle'),
      dictionaries: ['oracle', 'ghost'],
      pronouns: { ...pronouns('they'), pluralVerbs: false },
      preferredWords: ['veil'],
      prohibitedWords: ['Veil'],
    };
    const warnings = lintIdentity(ident, anatomy('anatomy.unspecified'), dictIndex);
    expect(warnings.join('\n')).toMatch(/"ghost" is referenced/);
    expect(warnings.join('\n')).toMatch(/plural verbs/);
    expect(warnings.join('\n')).toMatch(/both preferred and prohibited/);
  });
});
