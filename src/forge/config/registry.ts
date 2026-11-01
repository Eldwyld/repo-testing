/**
 * Settings category registry.
 *
 * Every settings category is described by data: where it lives in the
 * config, how to reset it, keywords for search, and which editor renders it.
 * New categories are added with `registerCategory()`; the Studio renders the
 * navigation, search, unsaved-change markers and per-category reset from
 * this registry without per-category code.
 */
import { BUILTIN_STYLES } from '../narrative/builtins';
import { ForgeConfig, defaultConfig } from './schema';

export type SectionId =
  | 'identity'
  | 'terminology'
  | 'narrative'
  | 'tone'
  | 'hypnosis'
  | 'session'
  | 'events'
  | 'media'
  | 'prompts'
  | 'checks'
  | 'accounting'
  | 'logging'
  | 'safety';

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'identity', label: 'Identity & terminology' },
  { id: 'terminology', label: 'Gender & body-part naming' },
  { id: 'narrative', label: 'Narrative style' },
  { id: 'tone', label: 'Tone: encouragement, objectification, humiliation' },
  { id: 'hypnosis', label: 'Hypnosis-inspired narration' },
  { id: 'session', label: 'Session pacing & intensity' },
  { id: 'events', label: 'Event generation' },
  { id: 'media', label: 'Media associations' },
  { id: 'prompts', label: 'Conditional prompts' },
  { id: 'checks', label: 'Compliance checks' },
  { id: 'accounting', label: 'Punishment accounting' },
  { id: 'logging', label: 'Logging & replay' },
  { id: 'safety', label: 'Accessibility & safety' },
];

export type FieldDoc = { path: string; label: string; help?: string };

/** Paths are dotted into ForgeConfig; a "selector" narrows to list items by id. */
export type CategoryDef = {
  id: string;
  label: string;
  section: SectionId;
  description: string;
  keywords: string[];
  /** Config path(s) the category owns (dotted). Several paths may be listed. */
  path: string | string[];
  /** For list-valued paths: only items whose id is in this set belong to the category. */
  itemIds?: readonly string[];
  /** Editor component key (resolved by the UI). */
  editor: string;
  fields?: FieldDoc[];
};

const registry = new Map<string, CategoryDef>();

export function registerCategory(def: CategoryDef) {
  if (registry.has(def.id)) throw new Error(`category "${def.id}" already registered`);
  if (!SECTIONS.some(s => s.id === def.section)) throw new Error(`unknown section "${def.section}"`);
  registry.set(def.id, def);
}

export function categories(): CategoryDef[] {
  return [...registry.values()];
}

export function category(id: string): CategoryDef | undefined {
  return registry.get(id);
}

// --- path helpers -------------------------------------------------------------

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone = structuredClone(obj) as Record<string, unknown>;
  let node = clone;
  for (const k of keys.slice(0, -1)) {
    node[k] = { ...(node[k] as Record<string, unknown>) };
    node = node[k] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = structuredClone(value);
  return clone as T;
}

const pathsOf = (def: CategoryDef) => (Array.isArray(def.path) ? def.path : [def.path]);

function slice(config: ForgeConfig, def: CategoryDef): unknown {
  return pathsOf(def).map(path => {
    const value = getPath(config, path);
    if (def.itemIds && Array.isArray(value)) return value.filter(x => def.itemIds!.includes((x as { id: string }).id));
    return value;
  });
}

/** Reset one category to defaults without touching anything else. */
export function resetCategory(config: ForgeConfig, id: string): ForgeConfig {
  const def = registry.get(id);
  if (!def) throw new Error(`unknown category "${id}"`);
  const defaults = defaultConfig();
  let out = config;
  for (const path of pathsOf(def)) {
    if (def.itemIds) {
      const current = (getPath(out, path) as { id: string }[]) ?? [];
      const fresh = (getPath(defaults, path) as { id: string }[]) ?? [];
      const kept = current.filter(x => !def.itemIds!.includes(x.id));
      const restored = fresh.filter(x => def.itemIds!.includes(x.id));
      out = setPath(out, path, [...kept, ...restored]);
    } else out = setPath(out, path, getPath(defaults, path));
  }
  return out;
}

/** Category ids whose slice differs between two configs (for unsaved markers). */
export function changedCategories(a: ForgeConfig, b: ForgeConfig): string[] {
  return categories()
    .filter(def => JSON.stringify(slice(a, def)) !== JSON.stringify(slice(b, def)))
    .map(def => def.id);
}

export function isCategoryDefault(config: ForgeConfig, id: string): boolean {
  const def = registry.get(id)!;
  return JSON.stringify(slice(config, def)) === JSON.stringify(slice(defaultConfig(), def));
}

export type SearchHit = { categoryId: string; label: string; section: SectionId; match: string; score: number };

export function searchSettings(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const hits: SearchHit[] = [];
  for (const def of registry.values()) {
    const haystacks: [string, number][] = [
      [def.label, 5],
      [def.description, 2],
      ...def.keywords.map(k => [k, 3] as [string, number]),
      ...(def.fields ?? []).flatMap(f => [[f.label, 3], [f.help ?? '', 1]] as [string, number][]),
    ];
    let score = 0;
    let match = '';
    for (const w of words) {
      const found = haystacks.find(([h]) => h.toLowerCase().includes(w));
      if (!found) {
        score = 0;
        break;
      }
      score += found[1];
      match ||= found[0];
    }
    if (score) hits.push({ categoryId: def.id, label: def.label, section: def.section, match, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

// --- built-in categories ----------------------------------------------------

const styleIds = (...ids: string[]) => ids.filter(id => BUILTIN_STYLES.some(s => s.id === id));

const BUILTIN_CATEGORIES: CategoryDef[] = [
  { id: 'session.identity', label: 'Active identity', section: 'identity', path: 'session.identityId', editor: 'identityPicker', description: 'Which identity profile narrates the session.', keywords: ['doll', 'toy', 'subject', 'specimen', 'hostage', 'automaton', 'muse', 'oracle', 'deity', 'instrument', 'tool', 'persona'] },
  { id: 'identities', label: 'Identity profiles', section: 'identity', path: 'identities', editor: 'identityEditor', description: 'Create and edit identity profiles, categories and custom rules.', keywords: ['identity', 'profile', 'category', 'object noun', 'narrator', 'perspective', 'rules'] },
  { id: 'dictionaries', label: 'Dictionaries', section: 'identity', path: 'dictionaries', editor: 'dictionaryEditor', description: 'Identity vocabularies by semantic category, with weights and inheritance.', keywords: ['dictionary', 'vocabulary', 'words', 'terms', 'inheritance', 'weight'] },
  { id: 'pronouns', label: 'Pronouns & grammatical person', section: 'terminology', path: ['pronouns', 'session.pronounsOverride', 'session.personOverride'], editor: 'pronounEditor', description: 'Pronoun sets and first/second/third person narration.', keywords: ['pronoun', 'she', 'he', 'they', 'it', 'neopronoun', 'person', 'grammar', 'gender'], fields: [{ path: 'session.pronounsOverride', label: 'Pronoun override' }, { path: 'session.personOverride', label: 'Grammatical person override' }] },
  { id: 'anatomy', label: 'Body-part terminology', section: 'terminology', path: ['anatomy', 'session.anatomyId'], editor: 'anatomyEditor', description: 'Anatomical, clinical, euphemistic, symbolic and object terms per body part.', keywords: ['anatomy', 'body', 'genitals', 'chest', 'hands', 'clinical', 'euphemism', 'plural', 'possessive', 'register'] },
  { id: 'styles.mix', label: 'Style mix', section: 'narrative', path: 'session.styleMix', editor: 'styleMix', description: 'Which narrative styles are active and their relative strength.', keywords: ['tone', 'mix', 'strength', 'blend'] },
  { id: 'styles.register', label: 'Registers', section: 'narrative', path: 'styles', itemIds: styleIds('neutral_observation', 'clinical_detachment', 'formal_instruction', 'ritualistic_language', 'mechanical_language', 'scientific_observation', 'ceremonial_language', 'mystical_symbolic', 'matter_of_fact', 'minimal', 'introspective'), editor: 'styleEditor', description: 'Clinical, mechanical, ceremonial, mystical, minimal and other registers.', keywords: ['clinical', 'mechanical', 'ritual', 'ceremonial', 'mystical', 'scientific', 'minimal', 'introspective', 'phrases'] },
  { id: 'styles.encouragement', label: 'Encouragement & praise', section: 'tone', path: 'styles', itemIds: styleIds('encouragement', 'praise', 'reassurance'), editor: 'styleEditor', description: 'Encouragement, praise and reassurance phrase pools.', keywords: ['encourage', 'praise', 'good', 'reassure', 'gentle'] },
  { id: 'styles.objectification', label: 'Objectification & dehumanization', section: 'tone', path: 'styles', itemIds: styleIds('objectification', 'dehumanization'), editor: 'styleEditor', description: 'Object-language phrase pools.', keywords: ['object', 'objectify', 'dehumanize', 'thing'] },
  { id: 'styles.humiliation', label: 'Humiliation & degradation', section: 'tone', path: 'styles', itemIds: styleIds('humiliation', 'degradation'), editor: 'styleEditor', description: 'Off by default. Intensity-gated phrase pools.', keywords: ['humiliate', 'degrade', 'embarrass', 'severe'] },
  { id: 'hypno', label: 'Hypnosis-inspired narration', section: 'hypnosis', path: 'hypno', editor: 'hypnoEditor', description: 'Repetition, counting, rhythm and other narration patterns. Creative text only — no psychological effect is claimed.', keywords: ['hypno', 'trance', 'repetition', 'counting', 'mantra', 'visualization', 'rhythm'] },
  { id: 'session.pacing', label: 'Pacing & intensity', section: 'session', path: ['session.durationSeconds', 'session.warmupSeconds', 'session.paceMin', 'session.paceMax', 'session.startIntensity', 'session.climaxChance', 'session.ruinChance', 'session.seed', 'session.narrationEnabled'], editor: 'sessionEditor', description: 'Duration, warm-up, pace limits, climax odds and seed.', keywords: ['pace', 'speed', 'duration', 'warmup', 'intensity', 'climax', 'ruin', 'deny', 'seed'], fields: [{ path: 'session.paceMin', label: 'Minimum pace' }, { path: 'session.paceMax', label: 'Maximum pace' }, { path: 'session.durationSeconds', label: 'Duration', help: 'Time for intensity to rise from 0 to 10' }, { path: 'session.climaxChance', label: 'Climax chance' }, { path: 'session.ruinChance', label: 'Ruin chance' }] },
  { id: 'events', label: 'Events & sequences', section: 'events', path: 'events', editor: 'eventEditor', description: 'Event packs, selection strategy, weights and enable/disable.', keywords: ['event', 'dice', 'random', 'sequence', 'branch', 'loop', 'weight', 'cooldown', 'json', 'dsl'] },
  { id: 'media', label: 'Media tags & associations', section: 'media', path: 'media', editor: 'mediaEditor', description: 'Tag media and associate tags with events or styles.', keywords: ['image', 'video', 'media', 'tag', 'association'] },
  { id: 'prompts', label: 'Event-triggered prompts', section: 'prompts', path: 'prompts', editor: 'promptEditor', description: 'Text prompts on pause, pace changes, thresholds and events.', keywords: ['prompt', 'write', 'describe', 'response', 'vocabulary', 'trigger'] },
  { id: 'checks', label: 'Compliance checks', section: 'checks', path: 'checks', editor: 'checkEditor', description: 'Randomized self-report checks and their scheduling.', keywords: ['check', 'compliance', 'hand', 'posture', 'attention', 'random', 'schedule'] },
  { id: 'accounting', label: 'Accounting rules', section: 'accounting', path: 'accounting', editor: 'accountingEditor', description: 'Turn logged events into transparent, user-defined tallies.', keywords: ['punishment', 'tally', 'score', 'points', 'accounting', 'penalty'] },
  { id: 'logging', label: 'Recording', section: 'logging', path: 'logging', editor: 'loggingEditor', description: 'What is recorded in the private session log.', keywords: ['log', 'record', 'history', 'replay', 'privacy'] },
  { id: 'safety', label: 'Safety & limits', section: 'safety', path: 'safety', editor: 'safetyEditor', description: 'Intensity ceiling, duration limit, breaks, prohibited words.', keywords: ['safety', 'limit', 'ceiling', 'break', 'stop', 'prohibited', 'exclude', 'boundary'] },
  { id: 'accessibility', label: 'Accessibility', section: 'safety', path: 'accessibility', editor: 'accessibilityEditor', description: 'Reduced motion, text size, contrast and reading time.', keywords: ['motion', 'font', 'contrast', 'a11y', 'reading'] },
];

BUILTIN_CATEGORIES.forEach(registerCategory);
