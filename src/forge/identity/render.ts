import { Rng } from '../core/rng';
import { renderTemplate, TemplateToken } from '../core/template';
import { scanText } from '../content/guard';
import {
  conjugate,
  formOf,
  parseForm,
  pluralOf,
  pronoun,
  PRONOUN_TOKENS,
} from './grammar';
import {
  categoriesOf,
  collectEntries,
  DictionaryIndex,
  resolveBodyPart,
  resolveDictionaries,
  pickTerm,
} from './resolve';
import {
  AnatomyProfile,
  GrammaticalPerson,
  IdentityProfile,
  PronounSet,
  TERM_REGISTERS,
  TermRegister,
} from './types';

export type NarrationContext = {
  identity: IdentityProfile;
  anatomy: AnatomyProfile;
  dictionaries: DictionaryIndex;
  rng: Rng;
  /** Active narrative style id: drives register choice and dictionary overrides. */
  style?: string;
  /** 0..10 */
  intensity?: number;
  pronouns?: PronounSet;
  person?: GrammaticalPerson;
  /** Arbitrary scalar substitutions: {pace}, {phase}, {count}... */
  vars?: Record<string, string | number>;
  /** Extra globally prohibited words from the user's safety settings. */
  prohibitedWords?: readonly string[];
};

export type NarrationResult = {
  text: string;
  /** Tokens that could not be resolved (left verbatim in text). */
  missing: string[];
  /** Prohibited vocabulary detected in the final text. */
  blocked: string[];
};

const MAX_NESTING = 2;

export function gerund(verb: string): string {
  const v = verb.toLowerCase();
  if (/ie$/.test(v)) return v.slice(0, -2) + 'ying';
  if (/[^aeiou]e$/.test(v) && v !== 'be') return v.slice(0, -1) + 'ing';
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(v)) return v + v.slice(-1) + 'ing';
  return v + 'ing';
}

function prohibitedFor(ctx: NarrationContext) {
  return [...ctx.identity.prohibitedWords, ...(ctx.prohibitedWords ?? [])];
}

function applyRules(text: string, ctx: NarrationContext): string {
  let out = text;
  for (const rule of ctx.identity.rules) {
    if (!rule.enabled) continue;
    const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), rule.replace);
  }
  return out;
}

export function narrate(template: string, ctx: NarrationContext, depth = 0): NarrationResult {
  const person = ctx.person ?? ctx.identity.person;
  const pronouns = ctx.pronouns ?? ctx.identity.pronouns;
  const prohibited = prohibitedFor(ctx);
  const chain = resolveDictionaries(ctx.identity.dictionaries, ctx.dictionaries).chain;
  const nestedMissing: string[] = [];

  const subjectRef = () => {
    if (person === 'first') return 'I';
    if (person === 'second') return 'you';
    return `the ${ctx.identity.objectNoun.singular}`;
  };
  const objectRef = () => {
    if (person === 'first') return 'me';
    if (person === 'second') return 'you';
    return `the ${ctx.identity.objectNoun.singular}`;
  };
  const possessiveRef = () => {
    if (person === 'first') return 'my';
    if (person === 'second') return 'your';
    return `the ${formOf(ctx.identity.objectNoun, 'possessive')}`;
  };

  // Verb agreement follows the most recent subject: a third-person noun
  // ("the subject is") is singular even when the pronouns are plural ("they are").
  let nounSubject = false;
  const agree = (verb: string) =>
    nounSubject && person === 'third'
      ? conjugate(verb, 'third', { ...pronouns, pluralVerbs: false })
      : conjugate(verb, person, pronouns);

  const resolve = (token: TemplateToken): string | undefined => {
    const name = token.name;
    if (name in PRONOUN_TOKENS) {
      if (PRONOUN_TOKENS[name] === 'subject') nounSubject = false;
      return pronoun(person, pronouns, PRONOUN_TOKENS[name]);
    }
    switch (name) {
      case 'subject':
      case 'you':
        nounSubject = true;
        return subjectRef();
      case 'subjectobj':
      case 'yourobj':
        return objectRef();
      case 'subjectposs':
      case 'your':
        return possessiveRef();
      case 'name':
        return ctx.identity.displayName;
      case 'object':
        return formOf(ctx.identity.objectNoun, parseForm(token.arg));
      case 'noun':
        return ctx.identity.presentation.noun || ctx.identity.objectNoun.singular;
      case 'narrator':
        return ctx.identity.perspective.narrator;
      case 'be':
      case 'is':
      case 'are':
        return agree('be');
      case 'was':
      case 'were':
        return agree('was');
      case 'has':
      case 'have':
        return agree('have');
      case 'verb':
        return token.arg ? agree(token.arg) : undefined;
      case 'action':
        return ctx.anatomy.actionVerb;
      case 'actioning':
        return gerund(ctx.anatomy.actionVerb);
      case 'hands':
        return partTerm('hands', token.arg ? `.${token.arg}` : '.plural');
      case 'part':
        return token.arg ? partTerm(token.arg, '') : undefined;
      case 'term':
      case 'dict':
        return token.arg ? dictTerm(token.arg) : undefined;
      case 'pick': {
        const options = (token.arg ?? '').split('|').map(s => s.trim()).filter(Boolean);
        return options.length ? ctx.rng.pick(options) : '';
      }
      default: {
        const value = ctx.vars?.[name];
        return value === undefined ? undefined : String(value);
      }
    }
  };

  // {part:genitals.plural@clinical}
  function partTerm(spec: string, defaultFormSuffix: string): string | undefined {
    const m = /^([a-z0-9_]+)(?:\.([a-z]+))?(?:@([a-z]+))?$/i.exec(spec.includes('.') || spec.includes('@') ? spec : spec + defaultFormSuffix);
    if (!m) return undefined;
    const [, partId, form, register] = m;
    const part = resolveBodyPart(ctx.anatomy, ctx.identity, partId.toLowerCase());
    if (!part) return undefined;
    const reg = register && (TERM_REGISTERS as readonly string[]).includes(register) ? (register as TermRegister) : undefined;
    const forms = pickTerm(part, ctx.rng, { register: reg, style: ctx.style, prohibitedWords: prohibited });
    return forms ? formOf(forms, parseForm(form)) : undefined;
  }

  // {term:materials} / {term:materials.plural}
  function dictTerm(spec: string): string | undefined {
    const [category, form] = spec.split('.');
    const entries = collectEntries(chain, {
      category,
      style: ctx.style,
      intensity: ctx.intensity,
      preferredWords: ctx.identity.preferredWords,
      prohibitedWords: prohibited,
    });
    const choice = ctx.rng.weighted(entries, e => e.weight);
    if (!choice) return undefined;
    let text = form === 'plural' ? choice.entry.plural || pluralOf(choice.entry.text) : choice.entry.text;
    if (depth < MAX_NESTING && text.includes('{')) {
      const nested = narrate(text, ctx, depth + 1);
      nestedMissing.push(...nested.missing);
      text = nested.text;
    }
    return text;
  }

  const rendered = renderTemplate(template, resolve);
  const text = applyRules(rendered.text, ctx);
  const blocked = scanText(text, prohibited).map(f => f.match);
  return { text, missing: [...rendered.missing, ...nestedMissing], blocked };
}

/** A fixed set of sample sentences used by the identity preview panel. */
export const PREVIEW_TEMPLATES = [
  '{Subject} {is} the {object} now.',
  '{Their} {hands} rest where {narrator} placed them.',
  '{Action} slowly. {They} {verb:keep} {their} {part:genitals} in view.',
  'Note: {narrator} adjusts the {object:possessive} {part:body}.',
];

export type PreviewLine = NarrationResult & { template: string };

export function previewIdentity(ctx: NarrationContext, templates?: string[]): PreviewLine[] {
  const chain = resolveDictionaries(ctx.identity.dictionaries, ctx.dictionaries).chain;
  const list =
    templates ??
    [...PREVIEW_TEMPLATES, ...categoriesOf(chain).slice(0, 6).map(c => `${c.replace(/_/g, ' ')}: {term:${c}}`)];
  return list.map(template => ({ template, ...narrate(template, ctx) }));
}

/**
 * Lightweight grammatical consistency checks for an identity configuration.
 * These are advisory: the user can override every automatic rule.
 */
export function lintIdentity(identity: IdentityProfile, anatomy: AnatomyProfile, dictionaries: DictionaryIndex): string[] {
  const warnings: string[] = [];
  const { missing, cycles, chain } = resolveDictionaries(identity.dictionaries, dictionaries);
  missing.forEach(m => warnings.push(`Dictionary "${m}" is referenced but does not exist.`));
  cycles.forEach(c => warnings.push(`Dictionary inheritance cycle: ${c}`));
  if (chain.length && chain.every(d => d.entries.every(e => !e.enabled)))
    warnings.push('All dictionary entries are disabled; {term:...} tokens will be left unresolved.');
  const p = identity.pronouns;
  if (p.subject.toLowerCase() === 'they' && !p.pluralVerbs)
    warnings.push('"they" pronouns usually take plural verbs ("they are"). Enable plural verb agreement, or ignore if intentional.');
  if (identity.person === 'third' && !identity.objectNoun.singular.trim())
    warnings.push('Third-person narration needs an object noun.');
  if (identity.intensity.min > identity.intensity.max) warnings.push('Intensity min exceeds max.');
  for (const part of anatomy.parts) {
    if (part.enabled && !part.terms.some(t => t.enabled)) warnings.push(`Body part "${part.label}" has no enabled terms.`);
  }
  for (const word of identity.preferredWords) {
    if (identity.prohibitedWords.some(w => w.toLowerCase() === word.toLowerCase()))
      warnings.push(`"${word}" is both preferred and prohibited; prohibition wins.`);
  }
  const guard = [identity.displayName, identity.objectNoun.singular, identity.presentation.noun]
    .flatMap(t => scanText(t))
    .map(f => f.match);
  if (guard.length) warnings.push(`Excluded (petplay/animal-role) terms present: ${guard.join(', ')}`);
  return warnings;
}
