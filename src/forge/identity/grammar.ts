import { GrammaticalPerson, PronounSet, TermForms } from './types';

export const BUILTIN_PRONOUNS: PronounSet[] = [
  { id: 'she', label: 'she/her', subject: 'she', object: 'her', possessiveDeterminer: 'her', possessivePronoun: 'hers', reflexive: 'herself', pluralVerbs: false },
  { id: 'he', label: 'he/him', subject: 'he', object: 'him', possessiveDeterminer: 'his', possessivePronoun: 'his', reflexive: 'himself', pluralVerbs: false },
  { id: 'they', label: 'they/them', subject: 'they', object: 'them', possessiveDeterminer: 'their', possessivePronoun: 'theirs', reflexive: 'themself', pluralVerbs: true },
  { id: 'it', label: 'it/its', subject: 'it', object: 'it', possessiveDeterminer: 'its', possessivePronoun: 'its', reflexive: 'itself', pluralVerbs: false },
  { id: 'xe', label: 'xe/xem', subject: 'xe', object: 'xem', possessiveDeterminer: 'xyr', possessivePronoun: 'xyrs', reflexive: 'xemself', pluralVerbs: false },
];

export type PronounSlot = 'subject' | 'object' | 'possessiveDeterminer' | 'possessivePronoun' | 'reflexive';

const FIRST: Record<PronounSlot, string> = {
  subject: 'I', object: 'me', possessiveDeterminer: 'my', possessivePronoun: 'mine', reflexive: 'myself',
};
const SECOND: Record<PronounSlot, string> = {
  subject: 'you', object: 'you', possessiveDeterminer: 'your', possessivePronoun: 'yours', reflexive: 'yourself',
};

/** Token names accepted for pronouns. They are written in they/them form. */
export const PRONOUN_TOKENS: Record<string, PronounSlot> = {
  they: 'subject',
  them: 'object',
  their: 'possessiveDeterminer',
  theirs: 'possessivePronoun',
  themself: 'reflexive',
  themselves: 'reflexive',
};

export function pronoun(person: GrammaticalPerson, set: PronounSet, slot: PronounSlot): string {
  if (person === 'first') return FIRST[slot];
  if (person === 'second') return SECOND[slot];
  return set[slot];
}

/** Whether verbs agree in the plural/"you" form for this person. */
export function usesBaseVerb(person: GrammaticalPerson, set: PronounSet): boolean {
  return person !== 'third' || set.pluralVerbs;
}

const IRREGULAR: Record<string, { third: string; first?: string; base?: string }> = {
  be: { third: 'is', first: 'am', base: 'are' },
  is: { third: 'is', first: 'am', base: 'are' },
  are: { third: 'is', first: 'am', base: 'are' },
  have: { third: 'has' },
  has: { third: 'has', base: 'have' },
  do: { third: 'does' },
  go: { third: 'goes' },
  was: { third: 'was', first: 'was', base: 'were' },
  were: { third: 'was', first: 'was', base: 'were' },
};

export function thirdPersonSingular(verb: string): string {
  if (/[^aeiou]y$/i.test(verb)) return verb.slice(0, -1) + 'ies';
  if (/(s|sh|ch|x|z|o)$/i.test(verb)) return verb + 'es';
  return verb + 's';
}

/**
 * Conjugate a present-tense verb (given in base form, e.g. "remain") for the
 * active subject. "be"/"is"/"are" and a few other irregulars are handled.
 * Only the first word is conjugated, so "hold still" -> "holds still".
 */
export function conjugate(verbPhrase: string, person: GrammaticalPerson, set: PronounSet): string {
  const [verb, ...rest] = verbPhrase.trim().split(/\s+/);
  if (!verb) return verbPhrase;
  const lower = verb.toLowerCase();
  const irregular = IRREGULAR[lower];
  let out: string;
  if (person === 'first' && irregular?.first) out = irregular.first;
  else if (usesBaseVerb(person, set)) out = irregular?.base ?? lower;
  else out = irregular?.third ?? thirdPersonSingular(lower);
  return [out, ...rest].join(' ');
}

export type TermForm = 'singular' | 'plural' | 'possessive' | 'pluralPossessive';

export function possessiveOf(word: string): string {
  return /s$/i.test(word) ? `${word}'` : `${word}'s`;
}

export function pluralOf(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/(s|sh|ch|x|z)$/i.test(word)) return word + 'es';
  return word + 's';
}

/** Pick a form, deriving plural/possessive automatically when not supplied. */
export function formOf(forms: TermForms, form: TermForm): string {
  switch (form) {
    case 'singular':
      return forms.singular;
    case 'plural':
      return forms.plural || pluralOf(forms.singular);
    case 'possessive':
      return forms.possessive || possessiveOf(forms.singular);
    case 'pluralPossessive':
      return forms.pluralPossessive || possessiveOf(forms.plural || pluralOf(forms.singular));
  }
}

export function parseForm(name: string | undefined): TermForm {
  switch ((name ?? '').toLowerCase()) {
    case 'plural':
    case 'pl':
      return 'plural';
    case 'possessive':
    case 'poss':
      return 'possessive';
    case 'pluralpossessive':
    case 'plposs':
      return 'pluralPossessive';
    default:
      return 'singular';
  }
}
