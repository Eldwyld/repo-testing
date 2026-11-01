/**
 * Built-in identity profiles, anatomy profiles and dictionaries.
 *
 * These are starting points only. Every item can be cloned, edited, disabled
 * or replaced from the Studio; built-ins are never mutated in place (edits
 * create a user copy with the same id stored in the user config layer).
 */
import { BUILTIN_PRONOUNS } from './grammar';
import {
  AnatomyProfile,
  BodyPartConfig,
  Dictionary,
  DictionaryEntry,
  IdentityProfile,
  PronounSet,
  TermEntry,
  TermRegister,
} from './types';

const pr = (pid: string): PronounSet => BUILTIN_PRONOUNS.find(p => p.id === pid)!;

let termSeq = 0;
const term = (singular: string, register: TermRegister, plural?: string, weight = 1): TermEntry => ({
  id: `t${++termSeq}`,
  forms: { singular, ...(plural ? { plural } : {}) },
  register,
  weight,
  enabled: true,
  styles: [],
});

const part = (
  partId: string,
  label: string,
  defaultRegister: TermRegister,
  terms: TermEntry[],
  styleRegisters: Record<string, TermRegister> = {}
): BodyPartConfig => ({ partId, label, enabled: true, defaultRegister, styleRegisters, terms });

// Parts shared by every anatomy profile.
const commonParts = (): BodyPartConfig[] => [
  part('hands', 'Hands', 'anatomical', [
    term('hands', 'anatomical', 'hands'),
    term('fingers', 'euphemism', 'fingers'),
    term('manipulators', 'object', 'manipulators'),
    term('instruments of touch', 'symbolic', 'instruments of touch'),
  ]),
  part('chest', 'Chest', 'anatomical', [
    term('chest', 'anatomical', 'chests'),
    term('thorax', 'clinical'),
    term('torso panel', 'object'),
    term('heart-seat', 'symbolic'),
  ]),
  part('mouth', 'Mouth', 'anatomical', [
    term('mouth', 'anatomical', 'mouths'),
    term('oral cavity', 'clinical'),
    term('lips', 'euphemism', 'lips'),
    term('speaking aperture', 'object'),
    term('voice', 'symbolic'),
  ]),
  part('body', 'Body', 'anatomical', [
    term('body', 'anatomical', 'bodies'),
    term('physiology', 'clinical'),
    term('frame', 'object', 'frames'),
    term('form', 'symbolic', 'forms'),
    term('vessel', 'symbolic', 'vessels'),
  ]),
  part('mind', 'Mind', 'anatomical', [
    term('mind', 'anatomical', 'minds'),
    term('cognition', 'clinical'),
    term('processor', 'object', 'processors'),
    term('inner sanctum', 'symbolic'),
  ]),
  part('eyes', 'Eyes', 'anatomical', [
    term('eyes', 'anatomical', 'eyes'),
    term('ocular response', 'clinical'),
    term('optics', 'object', 'optics'),
    term('gaze', 'symbolic'),
  ]),
  part('skin', 'Skin', 'anatomical', [
    term('skin', 'anatomical'),
    term('dermis', 'clinical'),
    term('surface', 'object', 'surfaces'),
    term('finish', 'object'),
  ]),
];

export const BUILTIN_ANATOMY: AnatomyProfile[] = [
  {
    id: 'anatomy.penis',
    name: 'Penis',
    description: 'Terminology for a body with a penis. Independent of gender presentation.',
    actionVerb: 'stroke',
    builtin: true,
    parts: [
      part('genitals', 'Genitals', 'explicit', [
        term('penis', 'anatomical', 'penises'),
        term('genital tissue', 'clinical'),
        term('cock', 'explicit', 'cocks'),
        term('length', 'euphemism'),
        term('shaft', 'euphemism'),
        term('primary input', 'object'),
        term('altar', 'symbolic'),
      ], { clinical_detachment: 'clinical', scientific_observation: 'clinical', mechanical_language: 'object', ritualistic_language: 'symbolic' }),
      ...commonParts(),
    ],
  },
  {
    id: 'anatomy.vulva',
    name: 'Vulva',
    description: 'Terminology for a body with a vulva. Independent of gender presentation.',
    actionVerb: 'rub',
    builtin: true,
    parts: [
      part('genitals', 'Genitals', 'explicit', [
        term('vulva', 'anatomical', 'vulvas'),
        term('genital tissue', 'clinical'),
        term('pussy', 'explicit'),
        term('clit', 'explicit'),
        term('sex', 'euphemism'),
        term('primary input', 'object'),
        term('sanctum', 'symbolic'),
      ], { clinical_detachment: 'clinical', scientific_observation: 'clinical', mechanical_language: 'object', ritualistic_language: 'symbolic' }),
      ...commonParts(),
    ],
  },
  {
    id: 'anatomy.unspecified',
    name: 'Unspecified',
    description: 'Neutral terminology that does not reference specific anatomy.',
    actionVerb: 'touch',
    builtin: true,
    parts: [
      part('genitals', 'Genitals', 'euphemism', [
        term('genitals', 'anatomical', 'genitals'),
        term('erogenous zone', 'clinical'),
        term('sex', 'euphemism'),
        term('primary input', 'object'),
        term('core', 'symbolic'),
      ]),
      ...commonParts(),
    ],
  },
];

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

function dict(
  id: string,
  name: string,
  description: string,
  groups: Record<string, string[]>,
  extra: Partial<Dictionary> = {}
): Dictionary {
  const entries: DictionaryEntry[] = [];
  for (const [category, texts] of Object.entries(groups)) {
    texts.forEach((text, i) => {
      // "text|3" sets weight 3; "text@5-10" sets an intensity window.
      const m = /^(.*?)(?:\|(\d+(?:\.\d+)?))?(?:@(\d+)-(\d+))?$/.exec(text)!;
      entries.push({
        id: `${id}.${category}.${i + 1}`,
        text: m[1],
        category,
        weight: m[2] ? Number(m[2]) : 1,
        enabled: true,
        styles: [],
        ...(m[3] ? { intensity: { min: Number(m[3]), max: Number(m[4]) } } : {}),
      });
    });
  }
  return {
    id,
    name,
    description,
    categories: Object.keys(groups),
    extends: [],
    entries,
    styleOverrides: {},
    builtin: true,
    ...extra,
  };
}

export const BUILTIN_DICTIONARIES: Dictionary[] = [
  dict('objectification_core', 'Objectification (shared)', 'Generic object language inherited by several identities.', {
    object_reference: ['object', 'item', 'piece', 'possession|2', 'thing'],
    ownership: ['owned', 'kept', 'claimed', 'catalogued', 'property|2@4-10'],
    stillness: ['still', 'motionless', 'inert', 'poised', 'waiting'],
    use: ['used', 'handled', 'operated', 'put to purpose'],
  }),
  dict('doll', 'Doll', 'Display, materials and maintenance of a doll.', {
    object_reference: ['doll|3', 'figure', 'mannequin', 'porcelain piece', 'display piece'],
    materials: ['porcelain', 'bisque', 'lacquer', 'silk', 'glass eyes', 'painted lips'],
    appearance: ['polished', 'immaculate', 'pristine', 'arranged', 'flawless'],
    display: ['on display', 'on the shelf', 'in the cabinet', 'posed for viewing', 'under the glass dome'],
    movement: ['jointed', 'posable', 'set in place', 'tilted just so', 'held in pose'],
    maintenance: ['dusted', 'restrung', 'repainted', 're-dressed', 'restored'],
    ownership: ['collected', 'kept', 'the collection’s newest piece', 'owned'],
  }, { extends: ['objectification_core'] }),
  dict('toy', 'Toy', 'Play, winding and handling of a toy.', {
    object_reference: ['toy|3', 'plaything', 'novelty', 'wind-up figure'],
    function: ['wound up', 'switched on', 'set going', 'played with'],
    handling: ['picked up', 'turned over', 'tossed aside', 'put back in the box'],
    condition: ['well-loved', 'brand new', 'worn', 'freshly unboxed'],
  }, { extends: ['objectification_core'] }),
  dict('scientific_subject', 'Scientific subject', 'Experimental and observational terminology.', {
    object_reference: ['subject|3', 'participant', 'test subject', 'sample'],
    experimental: ['trial', 'protocol', 'procedure', 'condition', 'run'],
    observation: ['observed', 'monitored', 'noted', 'logged', 'recorded'],
    measurements: ['response latency', 'heart rate', 'arousal index', 'baseline', 'threshold'],
    protocols: ['protocol A', 'the standard procedure', 'phase two of the protocol', 'the control condition'],
    variables: ['the independent variable', 'stimulus intensity', 'exposure duration', 'the controlled pace'],
    results: ['significant', 'within expected range', 'anomalous', 'consistent with hypothesis'],
    research_notes: ['note for the file', 'addendum', 'preliminary finding', 'annotation'],
  }),
  dict('specimen', 'Specimen', 'Collection, preservation and classification.', {
    object_reference: ['specimen|3', 'exhibit', 'sample', 'example'],
    classification: ['catalogued', 'labelled', 'classified', 'tagged with a number'],
    preservation: ['preserved', 'pinned', 'mounted', 'sealed under glass'],
    examination: ['examined', 'measured', 'inspected', 'studied under the lamp'],
  }),
  dict('hostage', 'Hostage', 'Captive, bargaining and held-in-place language (fictional framing).', {
    object_reference: ['captive|3', 'hostage', 'leverage', 'bargaining chip'],
    restraint: ['held', 'kept in place', 'detained', 'not permitted to move'],
    negotiation: ['terms', 'demands', 'conditions of release', 'the deal'],
    waiting: ['waiting for word', 'held until further notice', 'kept in the dark'],
  }),
  dict('automaton', 'Automaton', 'Mechanical components, calibration and diagnostics.', {
    object_reference: ['automaton|3', 'unit', 'machine', 'mechanism', 'android'],
    components: ['actuators', 'servos', 'gears', 'circuits', 'pistons'],
    processes: ['subroutine', 'cycle', 'loop', 'process', 'sequence'],
    calibration: ['calibrated', 'tuned', 'aligned', 'adjusted to spec'],
    io: ['input received', 'output nominal', 'signal acknowledged', 'buffer cleared'],
    commands: ['execute', 'comply', 'proceed', 'hold position', 'resume cycle'],
    acknowledgments: ['acknowledged', 'affirmative', 'command accepted', 'compliance logged'],
    diagnostics: ['diagnostics nominal', 'error state cleared', 'running self-test', 'efficiency at {intensity} of 10'],
  }),
  dict('muse', 'Muse', 'Inspiration, artistry and being rendered as art.', {
    object_reference: ['muse|3', 'model', 'subject of the work', 'inspiration'],
    artistry: ['sketched', 'sculpted', 'painted', 'composed', 'rendered'],
    admiration: ['admired', 'studied', 'adored', 'gazed upon'],
    creation: ['the canvas', 'the study', 'the unfinished piece', 'the masterpiece'],
  }),
  dict('oracle', 'Oracle', 'Symbolic, prophetic and ritual language.', {
    object_reference: ['oracle|3', 'vessel', 'seer', 'mouthpiece of the unseen'],
    symbolic: ['the veil', 'the threshold', 'the mirror', 'the flame', 'the tide'],
    prophecy: ['foretold', 'divined', 'revealed', 'spoken in omens'],
    interpretation: ['the sign is read', 'the meaning unfolds', 'the pattern is made plain'],
    ritual: ['anointed', 'consecrated', 'kneeling at the threshold', 'within the circle'],
    ceremonial: ['by candlelight', 'in procession', 'at the appointed hour'],
  }),
  dict('deity', 'Deity', 'Worship, offerings and ceremonial elevation.', {
    object_reference: ['idol|3', 'icon', 'effigy', 'deity'],
    worship: ['worshipped', 'revered', 'venerated', 'adored'],
    offerings: ['offering', 'tribute', 'devotion', 'sacrifice of time'],
    ceremonial: ['enshrined', 'raised upon the dais', 'surrounded by candles'],
  }),
  dict('instrument', 'Instrument', 'Function, precision and performance.', {
    object_reference: ['instrument|3', 'device', 'apparatus'],
    function: ['tuned', 'played', 'struck', 'drawn across'],
    precision: ['precise', 'exact', 'in tune', 'to the beat'],
    performance: ['the performance', 'the piece', 'the next movement', 'the crescendo'],
    maintenance: ['restrung', 'retuned', 'polished', 'cased'],
  }),
  dict('tool', 'Tool', 'Utility, operation and maintenance.', {
    object_reference: ['tool|3', 'implement', 'utensil', 'device'],
    function: ['functional', 'fit for purpose', 'serviceable'],
    operation: ['operated', 'put to work', 'applied', 'used as intended'],
    calibration: ['sharpened', 'set', 'adjusted', 'zeroed'],
    utility: ['useful', 'useful only when used', 'kept within reach'],
    maintenance: ['cleaned', 'oiled', 'hung back on the wall', 'stored'],
  }),
];

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

type IdentitySeed = Pick<IdentityProfile, 'id' | 'displayName' | 'category' | 'description'> &
  Partial<IdentityProfile> & { noun: string; plural?: string; narrator: string };

function identity(seed: IdentitySeed): IdentityProfile {
  const { noun, plural, narrator, ...rest } = seed;
  return {
    pronouns: pr('it'),
    person: 'second',
    presentation: { mode: 'neutral', noun: '', label: '' },
    objectNoun: { singular: noun, ...(plural ? { plural } : {}) },
    bodyOverrides: [],
    dictionaries: [seed.category],
    preferredWords: [],
    prohibitedWords: [],
    perspective: { narrator, voice: 'direct' },
    styles: [],
    eventTags: [],
    intensity: { min: 0, max: 10 },
    rules: [],
    presets: [],
    builtin: true,
    ...rest,
  };
}

export const BUILTIN_IDENTITIES: IdentityProfile[] = [
  identity({
    id: 'doll', displayName: 'Doll', category: 'doll', noun: 'doll', narrator: 'the collector',
    description: 'A posable display object: materials, presentation, stillness and upkeep.',
    dictionaries: ['doll'],
    styles: [],
    bodyOverrides: [
      part('skin', 'Skin', 'object', [term('porcelain', 'object'), term('finish', 'object'), term('glaze', 'object')]),
      part('body', 'Body', 'object', [term('figure', 'object', 'figures'), term('frame', 'object', 'frames'), term('jointed body', 'object')]),
    ],
  }),
  identity({
    id: 'toy', displayName: 'Toy', category: 'toy', noun: 'toy', narrator: 'the owner',
    description: 'A plaything: switched on, played with, put away.',
  }),
  identity({
    id: 'scientific_subject', displayName: 'Scientific subject', category: 'scientific_subject',
    noun: 'subject', narrator: 'the researcher', person: 'third', pronouns: pr('they'),
    perspective: { narrator: 'the researcher', voice: 'observational' },
    description: 'A participant under observation; narration reads like research notes.',
  }),
  identity({
    id: 'specimen', displayName: 'Specimen', category: 'specimen', noun: 'specimen', narrator: 'the curator', person: 'third',
    perspective: { narrator: 'the curator', voice: 'observational' },
    description: 'A catalogued example, examined and preserved.',
  }),
  identity({
    id: 'hostage', displayName: 'Hostage', category: 'hostage', noun: 'captive', narrator: 'the captor',
    description: 'A fictional captive held in place pending terms.',
  }),
  identity({
    id: 'automaton', displayName: 'Automaton', category: 'automaton', noun: 'unit', narrator: 'the operator',
    perspective: { narrator: 'the operator', voice: 'mechanical' },
    description: 'A mechanism receiving commands, calibrations and diagnostics.',
    bodyOverrides: [
      part('hands', 'Hands', 'object', [term('manipulators', 'object', 'manipulators'), term('actuators', 'object', 'actuators')]),
      part('mind', 'Mind', 'object', [term('processor', 'object'), term('core logic', 'object')]),
    ],
  }),
  identity({
    id: 'muse', displayName: 'Muse', category: 'muse', noun: 'muse', narrator: 'the artist', pronouns: pr('she'),
    description: 'The object of an artist’s attention, rendered and admired.',
  }),
  identity({
    id: 'oracle', displayName: 'Oracle', category: 'oracle', noun: 'oracle', narrator: 'the acolyte', pronouns: pr('they'),
    perspective: { narrator: 'the acolyte', voice: 'ceremonial' },
    description: 'A vessel for symbol, prophecy and ritual.',
  }),
  identity({
    id: 'deity', displayName: 'Deity', category: 'deity', noun: 'idol', narrator: 'the devotee', pronouns: pr('they'),
    perspective: { narrator: 'the devotee', voice: 'ceremonial' },
    description: 'An idol elevated, worshipped and offered tribute.',
  }),
  identity({
    id: 'instrument', displayName: 'Instrument', category: 'instrument', noun: 'instrument', narrator: 'the player',
    description: 'Something tuned, played and performed upon.',
  }),
  identity({
    id: 'tool', displayName: 'Tool', category: 'tool', noun: 'tool', narrator: 'the user',
    description: 'An implement defined entirely by function and upkeep.',
  }),
];

for (const ident of BUILTIN_IDENTITIES) {
  if (!['scientific_subject', 'specimen', 'hostage', 'oracle', 'deity'].includes(ident.category)) {
    ident.dictionaries = [ident.category, 'objectification_core'].filter(
      (d, i, arr) => arr.indexOf(d) === i
    );
  }
}
