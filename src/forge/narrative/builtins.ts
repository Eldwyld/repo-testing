/**
 * Built-in narrative styles. Tone is separate from identity: every phrase
 * is written with narration tokens so it adapts to any identity profile.
 * Severe styles (humiliation, degradation, dehumanization) ship disabled
 * and must be opted into.
 */
import { HypnoConfig, HypnoPatternId, NarrativeStyle, Phrase } from './types';

const phrases = (sid: string, list: string[]): Phrase[] =>
  list.map((raw, i) => {
    const m = /^(.*?)(?:\|(\d+(?:\.\d+)?))?(?:@(\d+)-(\d+))?$/.exec(raw)!;
    return {
      id: `${sid}.${i + 1}`,
      text: m[1],
      weight: m[2] ? Number(m[2]) : 1,
      enabled: true,
      identities: [],
      ...(m[3] ? { intensity: { min: Number(m[3]), max: Number(m[4]) } } : {}),
    };
  });

type Seed = Partial<NarrativeStyle> & Pick<NarrativeStyle, 'id' | 'name'> & { lines: string[] };

const style = ({ lines, ...s }: Seed): NarrativeStyle => ({
  description: '',
  family: 'tone',
  enabled: true,
  intensity: { min: 0, max: 10 },
  frequency: 1,
  weight: 1,
  vocabulary: [],
  excluded: [],
  incompatibleWith: [],
  transitions: [],
  builtin: true,
  ...s,
  phrases: phrases(s.id, lines),
});

export const BUILTIN_STYLES: NarrativeStyle[] = [
  style({
    id: 'encouragement', name: 'Encouragement', description: 'Warm forward momentum.',
    lines: ['Keep going, {noun}.', 'That’s it. {Subject} {is} doing exactly what {verb:be} asked.', 'Steady. {Action} to the beat.', 'A little longer.|2'],
    incompatibleWith: ['degradation'],
  }),
  style({
    id: 'praise', name: 'Praise', description: 'Approval of compliance and presentation.',
    lines: ['Good {noun}.|3', 'Such a well-kept {object}.', '{Subject} {verb:look} perfect like this.', 'Exactly right.'],
  }),
  style({
    id: 'reassurance', name: 'Reassurance', description: 'Calming and grounding; pairs well with breaks.',
    lines: ['{Subject} {is} safe. Breathe.', 'There is no hurry.', 'Pause whenever {they} need to.', 'Rest {their} {hands} for a moment if {they} like.'],
  }),
  style({
    id: 'neutral_observation', name: 'Neutral observation', family: 'register',
    lines: ['The {object} {verb:continue}.', '{Subject} {is} at pace {pace}.', '{Their} {hands} {verb:move} in rhythm.', 'Nothing changes yet.'],
  }),
  style({
    id: 'clinical_detachment', name: 'Clinical detachment', family: 'register',
    lines: ['Stimulation continues at the prescribed rate.', 'Response noted in the {part:genitals}.', 'Proceed. No commentary required.', '{Subject} {verb:remain} within tolerances.'],
    incompatibleWith: ['mystical_symbolic'],
  }),
  style({
    id: 'formal_instruction', name: 'Formal instruction', family: 'register',
    lines: ['{Action} at the indicated pace.', 'Maintain the current grip.', 'Keep {their} {part:eyes} on the screen.', 'Await further instruction.'],
  }),
  style({
    id: 'objectification', name: 'Objectification',
    lines: ['{Subject} {is} a {object}. Nothing more is required.', 'A {object} does not decide. It is {term:use}.', '{Subject} {verb:exist} to be {term:use}.', 'Hold still, {object}.|2'],
  }),
  style({
    id: 'dehumanization', name: 'Dehumanization', enabled: false, intensity: { min: 3, max: 10 },
    lines: ['There is no person here, only a {object}.', 'Names are for people. {Subject} {is} {object}.', 'The {object} {verb:have} no opinion on the matter.'],
  }),
  style({
    id: 'humiliation', name: 'Humiliation', enabled: false, intensity: { min: 2, max: 10 },
    lines: ['Look at {subjectobj}, so eager to be {term:use}.', 'How embarrassing for a {object} to need this so badly.', 'Even a {object} should have more restraint.', 'Everyone can see exactly what {subject} {is}.'],
  }),
  style({
    id: 'degradation', name: 'Degradation', enabled: false, intensity: { min: 4, max: 10 },
    lines: ['A cheap {object}, {term:use} and set aside.', 'Worth only what {subject} can be used for.', 'Disposable. Replaceable. Keep going.'],
    incompatibleWith: ['encouragement', 'reassurance'],
  }),
  style({
    id: 'ritualistic_language', name: 'Ritualistic language', family: 'register',
    lines: ['Again, as before. Again, as always.', 'Each stroke an offering.', '{Subject} {verb:repeat} the rite.', 'The rite continues.'],
  }),
  style({
    id: 'mechanical_language', name: 'Mechanical language', family: 'register',
    lines: ['Cycle {count}. Output nominal.', 'Command received. Executing.', 'Actuation rate set to {pace}.', 'Unit {verb:comply}.'],
    vocabulary: ['servo', 'cycle', 'routine', 'buffer'],
  }),
  style({
    id: 'scientific_observation', name: 'Scientific observation', family: 'register',
    lines: ['Observation: {subject} {verb:respond} to stimulus at {pace} Hz.', 'Intensity recorded at {intensity}/10.', 'The protocol continues without deviation.', 'Note for the file: {subject} {is} compliant.'],
  }),
  style({
    id: 'ceremonial_language', name: 'Ceremonial language', family: 'register',
    lines: ['Let the {object} be presented.', 'By the old forms, {subject} {verb:kneel} in attention.', 'The ceremony requires stillness, then motion.'],
  }),
  style({
    id: 'mystical_symbolic', name: 'Mystical / symbolic', family: 'register',
    lines: ['The tide rises in the {part:body}.', 'What is hidden becomes plain.', 'The flame asks for more.', 'Follow the thread inward.'],
  }),
  style({
    id: 'matter_of_fact', name: 'Matter-of-fact', family: 'register',
    lines: ['Pace {pace}.', '{Action}.', 'Continue.', 'Okay. Keep going.'],
  }),
  style({
    id: 'minimal', name: 'Minimal', family: 'structure', frequency: 0.4,
    lines: ['…', 'Yes.', 'More.', 'Still.'],
  }),
  style({
    id: 'introspective', name: 'Introspective', family: 'structure',
    lines: ['Notice how {subject} {verb:feel} as a {object}.', 'What does it mean to be {term:use}?', 'Consider {their} place on the shelf.'],
  }),
];

export const DEFAULT_HYPNO_LINES: Record<HypnoPatternId, string[]> = {
  repetition: ['{object}', 'obey', 'still', '{action}', 'deeper'],
  rhythmic: ['in and out', 'up and down', 'on the beat', 'tick, tock'],
  progressive_relaxation: ['{their} {part:hands} relax', '{their} shoulders soften', '{their} breath slows', 'everything loosens'],
  focused_attention: ['only the screen', 'only the beat', 'only {narrator}', 'just this'],
  counting: ['{n}…'],
  reframing: ['not a person — a {object}', 'not wanting — needing', 'not choosing — following'],
  suggestion_response: ['{you} {verb:feel} it now', 'and {you} {verb:let} it happen', 'and it is easy'],
  gradual_variation: ['a {object}', 'a good {object}', 'a quiet, good {object}', 'a quiet, good, obedient {object}'],
  ritual_acknowledgment: ['acknowledged', 'it is so', 'as it was, as it is'],
  guided_visualization: ['picture the shelf', 'imagine the glass', 'see the light above'],
  recall_reflection: ['remember the last time', 'recall how it felt', 'go back to that moment'],
  phase_transition: ['and now, a little further', 'going down another step', 'and now we change'],
};

export const DEFAULT_HYPNO: HypnoConfig = {
  enabled: false,
  intervalAtMin: 4,
  intervalAtMax: 1.2,
  transitionFrequency: 0.15,
  patterns: (Object.keys(DEFAULT_HYPNO_LINES) as HypnoPatternId[]).map(id => ({
    id,
    enabled: ['repetition', 'rhythmic', 'focused_attention', 'counting', 'gradual_variation'].includes(id),
    weight: 1,
    intensity: { min: 0, max: 10 },
    repetitions: 3,
    variation: 0.3,
    maxLength: 280,
    lines: [],
  })),
};
