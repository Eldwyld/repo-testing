import { Rng } from '../core/rng';
import { isClean } from '../content/guard';
import {
  AnatomyProfile,
  BodyPartConfig,
  Dictionary,
  DictionaryEntry,
  IdentityProfile,
  TermEntry,
  TermForms,
  TermRegister,
} from './types';

export type DictionaryIndex = Record<string, Dictionary>;

export type ResolvedDictionaries = {
  /** Dictionaries in priority order (identity's own first, then parents). */
  chain: Dictionary[];
  missing: string[];
  cycles: string[];
};

/**
 * Resolve the dictionaries attached to an identity, following only explicit
 * `extends` links. Duplicates are visited once; cycles are reported, not followed.
 */
export function resolveDictionaries(
  ids: readonly string[],
  index: DictionaryIndex
): ResolvedDictionaries {
  const chain: Dictionary[] = [];
  const missing: string[] = [];
  const cycles: string[] = [];
  const done = new Set<string>();
  const visit = (did: string, stack: string[]) => {
    if (stack.includes(did)) {
      cycles.push([...stack, did].join(' -> '));
      return;
    }
    if (done.has(did)) return;
    const d = index[did];
    if (!d) {
      missing.push(did);
      return;
    }
    done.add(did);
    chain.push(d);
    for (const parent of d.extends) visit(parent, [...stack, did]);
  };
  for (const did of ids) visit(did, []);
  return { chain, missing, cycles };
}

export type EntryFilter = {
  category: string;
  style?: string;
  intensity?: number;
  preferredWords?: readonly string[];
  prohibitedWords?: readonly string[];
};

export type WeightedEntry = {
  entry: DictionaryEntry;
  weight: number;
  dictionary: string;
};

/** All usable entries for a semantic category, with effective weights. */
export function collectEntries(
  chain: readonly Dictionary[],
  filter: EntryFilter
): WeightedEntry[] {
  const out: WeightedEntry[] = [];
  const seenText = new Set<string>();
  const preferred = (filter.preferredWords ?? []).map(w => w.toLowerCase());
  for (const d of chain) {
    const override = filter.style ? d.styleOverrides[filter.style] : undefined;
    for (const entry of d.entries) {
      if (!entry.enabled || entry.category !== filter.category) continue;
      if (override?.disable.includes(entry.id)) continue;
      if (
        entry.styles.length &&
        (!filter.style || !entry.styles.includes(filter.style))
      )
        continue;
      if (entry.intensity && filter.intensity !== undefined) {
        if (
          filter.intensity < entry.intensity.min ||
          filter.intensity > entry.intensity.max
        )
          continue;
      }
      if (!isClean(entry.text, filter.prohibitedWords ?? [])) continue;
      const key = entry.text.toLowerCase();
      if (seenText.has(key)) continue; // child dictionaries shadow parents
      seenText.add(key);
      let weight =
        entry.weight * (override?.categoryWeights[entry.category] ?? 1);
      if (preferred.some(p => key.includes(p))) weight *= 2;
      if (weight > 0) out.push({ entry, weight, dictionary: d.id });
    }
  }
  return out;
}

export function categoriesOf(chain: readonly Dictionary[]): string[] {
  const set = new Set<string>();
  for (const d of chain) {
    d.categories.forEach(c => set.add(c));
    d.entries.forEach(e => set.add(e.category));
  }
  return [...set];
}

/** Merge an anatomy part with an identity-specific override for the same part. */
export function resolveBodyPart(
  anatomy: AnatomyProfile,
  identity: IdentityProfile,
  partId: string
): BodyPartConfig | undefined {
  const base = anatomy.parts.find(p => p.partId === partId);
  const over = identity.bodyOverrides.find(p => p.partId === partId);
  if (!base && !over) return undefined;
  if (!over) return base;
  if (!base) return over;
  if (!over.enabled) return { ...base, enabled: false };
  return {
    ...base,
    defaultRegister: over.defaultRegister,
    styleRegisters: { ...base.styleRegisters, ...over.styleRegisters },
    terms: [...over.terms, ...base.terms],
  };
}

export function pickTerm(
  part: BodyPartConfig,
  rng: Rng,
  opts: {
    register?: TermRegister;
    style?: string;
    prohibitedWords?: readonly string[];
  } = {}
): TermForms | undefined {
  if (!part.enabled) return undefined;
  const register =
    opts.register ??
    (opts.style ? part.styleRegisters[opts.style] : undefined) ??
    part.defaultRegister;
  const usable = part.terms.filter(
    t =>
      t.enabled &&
      t.weight > 0 &&
      isClean(t.forms.singular, opts.prohibitedWords ?? [])
  );
  const byStyle = (list: TermEntry[]) => {
    const styled = opts.style
      ? list.filter(t => t.styles.includes(opts.style!))
      : [];
    return styled.length
      ? styled
      : list.filter(t => t.styles.length === 0 || !opts.style);
  };
  const tiers = [
    byStyle(usable.filter(t => t.register === register)),
    byStyle(usable.filter(t => t.register === part.defaultRegister)),
    usable,
  ];
  for (const tier of tiers) {
    const choice = rng.weighted(tier, t => t.weight);
    if (choice) return choice.forms;
  }
  return undefined;
}
