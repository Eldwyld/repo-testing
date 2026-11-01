/**
 * Layer user items over built-ins (by id) and compile everything the
 * runtime needs. Pure and cheap enough to call whenever the config changes.
 */
import { DEFAULT_EVENT_PACK } from '../events/builtins';
import { EventPack } from '../events/types';
import { CompiledPack, compilePack, Diagnostic } from '../events/validate';
import { BUILTIN_PRONOUNS } from '../identity/grammar';
import {
  BUILTIN_ANATOMY,
  BUILTIN_DICTIONARIES,
  BUILTIN_IDENTITIES,
} from '../identity/builtins';
import {
  AnatomyProfile,
  Dictionary,
  IdentityProfile,
  PronounSet,
} from '../identity/types';
import { BUILTIN_STYLES } from '../narrative/builtins';
import { NarrativeStyle } from '../narrative/types';
import { ForgeConfig } from './schema';

const index = <T extends { id: string }>(
  builtins: readonly T[],
  user: readonly T[]
): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const b of builtins) out[b.id] = b;
  for (const u of user) out[u.id] = u;
  return out;
};

export type Library = {
  identities: Record<string, IdentityProfile>;
  anatomy: Record<string, AnatomyProfile>;
  pronouns: Record<string, PronounSet>;
  dictionaries: Record<string, Dictionary>;
  styles: Record<string, NarrativeStyle>;
};

export function resolveLibrary(config: ForgeConfig): Library {
  return {
    identities: index(BUILTIN_IDENTITIES, config.identities),
    anatomy: index(BUILTIN_ANATOMY, config.anatomy),
    pronouns: index(BUILTIN_PRONOUNS, config.pronouns),
    dictionaries: index(BUILTIN_DICTIONARIES, config.dictionaries),
    styles: index(BUILTIN_STYLES, config.styles),
  };
}

/** Whether an item is a built-in, a user override of a built-in, or user-defined. */
export function originOf(
  kind: keyof Library,
  id: string,
  config: ForgeConfig
): 'builtin' | 'override' | 'custom' {
  const builtinIds: Record<keyof Library, readonly { id: string }[]> = {
    identities: BUILTIN_IDENTITIES,
    anatomy: BUILTIN_ANATOMY,
    pronouns: BUILTIN_PRONOUNS,
    dictionaries: BUILTIN_DICTIONARIES,
    styles: BUILTIN_STYLES,
  };
  const user = (config[kind] as { id: string }[]).some(x => x.id === id);
  const builtin = builtinIds[kind].some(x => x.id === id);
  return builtin ? (user ? 'override' : 'builtin') : 'custom';
}

/** Merge enabled packs into one, applying disable/weight overrides. */
export function mergedPack(config: ForgeConfig): EventPack {
  const packs = [
    ...(config.events.builtinEnabled ? [DEFAULT_EVENT_PACK] : []),
    ...config.events.packs,
  ];
  const events = new Map<string, EventPack['events'][number]>();
  const groups = new Map<string, EventPack['groups'][number]>();
  const sequences = new Map<string, EventPack['sequences'][number]>();
  for (const p of packs) {
    p.events.forEach(e => events.set(e.id, e));
    p.groups.forEach(g => groups.set(g.id, g));
    p.sequences.forEach(s => sequences.set(s.id, s));
  }
  const disabled = new Set(config.events.disabledEventIds);
  return {
    kind: 'forge.eventPack',
    schemaVersion: 1,
    id: 'merged',
    name: 'Merged',
    description: '',
    events: [...events.values()].map(e => ({
      ...e,
      enabled: e.enabled && !disabled.has(e.id),
      weight: config.events.weightOverrides[e.id] ?? e.weight,
    })),
    groups: [...groups.values()],
    sequences: [...sequences.values()],
  };
}

export type CompiledConfig = {
  config: ForgeConfig;
  library: Library;
  pack: CompiledPack | null;
  errors: Diagnostic[];
  warnings: Diagnostic[];
};

export function compileConfig(config: ForgeConfig): CompiledConfig {
  const library = resolveLibrary(config);
  const result = compilePack(mergedPack(config), {
    promptIds: config.prompts.templates.map(p => p.id),
    checkIds: config.checks.items.map(c => c.id),
    styleIds: Object.keys(library.styles),
    extraProhibited: config.safety.extraProhibitedWords,
  });
  return {
    config,
    library,
    pack: result.pack ?? null,
    errors: result.errors,
    warnings: result.warnings,
  };
}
