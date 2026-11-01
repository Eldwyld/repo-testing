/**
 * Event-locked narration prompts: free-text prompts shown on configurable
 * triggers. A "blocking" prompt holds event progression until answered, but
 * pause, skip, disable and terminate always remain available in the UI and
 * are handled by the runtime outside of the event engine.
 */
import { Infer, id, v } from '../core/validate';
import { GRAMMATICAL_PERSONS, GrammaticalPerson } from '../identity/types';
import { normalizeForGuard } from '../content/guard';

export const PROMPT_TRIGGERS = [
  'pause',
  'resume',
  'half_pace',
  'intensity_threshold',
  'phase_change',
  'climax',
  'event',
  'media_segment_end',
] as const;
export type PromptTriggerKind = (typeof PROMPT_TRIGGERS)[number];

export const promptTriggerV = v.object({
  on: v.enum(PROMPT_TRIGGERS),
  /** intensity_threshold: number; phase_change: phase name; event: event id. */
  value: v.union(v.number(), v.string({ max: 80 })).optional(),
});

export const promptTemplateV = v.object({
  id: id(),
  name: v.string({ min: 1, max: 80 }),
  enabled: v.boolean().default(true),
  triggers: v.array(promptTriggerV, { max: 20 }).default([]),
  text: v.string({ min: 1, max: 400 }),
  /** Per identity-category overrides of `text`. */
  identityText: v.record(v.string({ max: 400 })).default({}),
  required: v.boolean().default(false),
  /** Hold event progression until submitted or skipped. */
  blocking: v.boolean().default(false),
  minLength: v.number({ min: 0, max: 5000, integer: true }).default(0),
  maxLength: v.number({ min: 1, max: 5000, integer: true }).default(500),
  vocabulary: v.object({
    mode: v.enum(['off', 'identity', 'custom'] as const).default('off'),
    minMatches: v.number({ min: 0, max: 50, integer: true }).default(1),
    words: v.array(v.string({ max: 80 }), { max: 200 }).default([]),
    /** Limit identity-dictionary matching to these categories. Empty = all. */
    categories: v.array(v.string()).default([]),
  }),
  /** Allowed grammatical perspectives of the response. Empty = any. */
  perspectives: v.array(v.enum(GRAMMATICAL_PERSONS)).default([]),
  retry: v.object({
    maxAttempts: v.number({ min: 1, max: 20, integer: true }).default(3),
    onExhausted: v.enum(['accept', 'skip'] as const).default('accept'),
  }),
  timeoutSeconds: v.number({ min: 0, max: 3600 }).default(0),
  onTimeout: v.enum(['skip', 'keep_open'] as const).default('skip'),
  resume: v.enum(['immediate', 'acknowledge'] as const).default('immediate'),
  cooldownSeconds: v.number({ min: 0, max: 86400 }).default(60),
  maxPerSession: v.number({ min: 0, max: 1000, integer: true }).default(0),
});
export type PromptTemplate = Infer<typeof promptTemplateV>;

const P = (
  p: Partial<PromptTemplate> & Pick<PromptTemplate, 'id' | 'name' | 'text'>
): PromptTemplate => ({
  enabled: true,
  triggers: [],
  identityText: {},
  required: false,
  blocking: false,
  minLength: 0,
  maxLength: 500,
  vocabulary: { mode: 'off', minMatches: 1, words: [], categories: [] },
  perspectives: [],
  retry: { maxAttempts: 3, onExhausted: 'accept' },
  timeoutSeconds: 0,
  onTimeout: 'skip',
  resume: 'immediate',
  cooldownSeconds: 60,
  maxPerSession: 0,
  ...p,
});

export const DEFAULT_PROMPTS: PromptTemplate[] = [
  P({
    id: 'record_observation',
    name: 'Record the observation',
    text: 'Record the {object:possessive} current state.',
    identityText: {
      scientific_subject: 'Summarize the latest observation of the subject.',
      specimen: 'Record the specimen’s current state.',
      automaton: 'Describe the automaton’s current operation.',
      instrument: 'Describe what the instrument is doing.',
      doll: 'Describe the doll as it is displayed right now.',
    },
    enabled: false,
    blocking: true,
    minLength: 10,
    vocabulary: { mode: 'identity', minMatches: 1, words: [], categories: [] },
    perspectives: ['third'],
  }),
  P({
    id: 'pause_reflection',
    name: 'Reflect on pause',
    text: 'Describe the {object} using the active dictionary.',
    enabled: false,
    triggers: [{ on: 'pause' }],
    minLength: 0,
  }),
  P({
    id: 'half_pace_report',
    name: 'Half-pace report',
    text: 'While slowed: what is the {object} doing?',
    enabled: false,
    triggers: [{ on: 'event', value: 'half_pace' }],
  }),
];

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

const PRONOUNS: Record<GrammaticalPerson, string[]> = {
  first: ['i', 'me', 'my', 'mine', 'myself', "i'm", "i've", 'we', 'us', 'our'],
  second: ['you', 'your', 'yours', 'yourself', "you're"],
  third: [
    'it',
    'its',
    'itself',
    'he',
    'him',
    'his',
    'she',
    'her',
    'hers',
    'they',
    'them',
    'their',
    'theirs',
    'themself',
    'xe',
    'xem',
    'xyr',
    'the',
  ],
};

export function detectPerspective(
  text: string,
  objectNouns: string[] = []
): GrammaticalPerson | null {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const nouns = objectNouns.map(n => n.toLowerCase());
  const score: Record<GrammaticalPerson, number> = {
    first: 0,
    second: 0,
    third: 0,
  };
  words.forEach((w, i) => {
    for (const p of GRAMMATICAL_PERSONS) {
      if (p === 'third' && w === 'the') {
        if (nouns.includes(words[i + 1] ?? '')) score.third += 2;
        continue;
      }
      if (PRONOUNS[p].includes(w)) score[p]++;
    }
  });
  const best = (Object.keys(score) as GrammaticalPerson[]).sort(
    (a, b) => score[b] - score[a]
  )[0];
  return score[best] > 0 ? best : null;
}

export function vocabularyMatches(
  text: string,
  words: readonly string[]
): string[] {
  const norm = ` ${normalizeForGuard(text)} `;
  const found = new Set<string>();
  for (const w of words) {
    const nw = normalizeForGuard(w);
    if (nw && norm.includes(` ${nw} `)) found.add(w);
    else if (
      nw &&
      nw.split(' ').length === 1 &&
      new RegExp(`\\b${nw}(s|es|ed|ing)?\\b`).test(norm)
    )
      found.add(w);
  }
  return [...found];
}

export type PromptValidation = {
  valid: boolean;
  problems: string[];
  matched: string[];
  perspective: GrammaticalPerson | null;
};

export function validateResponse(
  text: string,
  prompt: PromptTemplate,
  ctx: { identityVocabulary: readonly string[]; objectNouns: readonly string[] }
): PromptValidation {
  const problems: string[] = [];
  const trimmed = text.trim();
  if (trimmed.length < prompt.minLength)
    problems.push(
      `Write at least ${prompt.minLength} characters (${trimmed.length} so far).`
    );
  if (trimmed.length > prompt.maxLength)
    problems.push(`Keep it under ${prompt.maxLength} characters.`);
  let matched: string[] = [];
  if (prompt.vocabulary.mode !== 'off') {
    const pool =
      prompt.vocabulary.mode === 'custom'
        ? prompt.vocabulary.words
        : ctx.identityVocabulary;
    matched = vocabularyMatches(trimmed, pool);
    if (matched.length < prompt.vocabulary.minMatches)
      problems.push(
        `Use at least ${prompt.vocabulary.minMatches} term(s) from the ${prompt.vocabulary.mode === 'custom' ? 'required word list' : 'active identity dictionary'}.`
      );
  }
  const perspective = detectPerspective(trimmed, [...ctx.objectNouns]);
  if (prompt.perspectives.length && trimmed.length) {
    if (!perspective || !prompt.perspectives.includes(perspective))
      problems.push(`Write in the ${prompt.perspectives.join(' or ')} person.`);
  }
  return { valid: problems.length === 0, problems, matched, perspective };
}

/** Which prompts fire for a trigger. Cooldowns and limits are applied by the runtime. */
export function promptsForTrigger(
  prompts: readonly PromptTemplate[],
  trigger: { on: PromptTriggerKind; value?: string | number; previous?: number }
): PromptTemplate[] {
  return prompts.filter(
    p =>
      p.enabled &&
      p.triggers.some(t => {
        if (t.on !== trigger.on) return false;
        if (t.on === 'intensity_threshold')
          return (
            typeof t.value === 'number' &&
            typeof trigger.value === 'number' &&
            (trigger.previous ?? -Infinity) < t.value &&
            trigger.value >= t.value
          );
        if (t.value === undefined) return true;
        return String(t.value) === String(trigger.value);
      })
  );
}
