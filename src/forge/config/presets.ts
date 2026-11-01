/**
 * Presets are partial config patches. A "full" preset is merged over the
 * defaults; a "category" preset only touches the paths of one registered
 * category, so applying it never overwrites unrelated preferences.
 */
import { Infer, id, v } from '../core/validate';
// io <-> presets is a benign cycle: neither uses the other at module-evaluation time.
import { deepMerge, validateConfig } from './io';
import { category, getPath, setPath } from './registry';
import { defaultConfig, ForgeConfig } from './schema';

export const PRESET_SCHEMA_VERSION = 1;

export const presetV = v.object({
  kind: v.literal('forge.preset'),
  schemaVersion: v.number({ integer: true, min: 1 }),
  id: id(),
  name: v.string({ min: 1, max: 80 }),
  description: v.string({ max: 600 }).default(''),
  scope: v.enum(['full', 'category'] as const),
  categoryId: v.string().optional(),
  /** Partial ForgeConfig (validated when applied). */
  data: v.record(v.unknown()),
  builtin: v.boolean().optional(),
});
export type Preset = Infer<typeof presetV>;

export type ApplyResult =
  | { ok: true; config: ForgeConfig; notes: string[] }
  | { ok: false; errors: string[] };

export function applyPreset(current: ForgeConfig, preset: Preset): ApplyResult {
  if (preset.scope === 'full') {
    const r = validateConfig(deepMerge(defaultConfig(), preset.data));
    return r.ok
      ? {
          ok: true,
          config: r.value,
          notes: [`Applied preset "${preset.name}".`],
        }
      : r;
  }
  const def = preset.categoryId ? category(preset.categoryId) : undefined;
  if (!def)
    return { ok: false, errors: [`Unknown category "${preset.categoryId}".`] };
  let next = current;
  for (const path of Array.isArray(def.path) ? def.path : [def.path]) {
    const value = getPath(preset.data, path);
    if (value !== undefined) next = setPath(next, path, value);
  }
  const r = validateConfig(next);
  return r.ok
    ? {
        ok: true,
        config: r.value,
        notes: [`Applied "${preset.name}" to ${def.label} only.`],
      }
    : r;
}

/** Capture a category (or everything) of the current config as a preset. */
export function capturePreset(
  config: ForgeConfig,
  opts: { id: string; name: string; description?: string; categoryId?: string }
): Preset {
  let data: Record<string, unknown>;
  if (opts.categoryId) {
    const def = category(opts.categoryId);
    if (!def) throw new Error(`Unknown category "${opts.categoryId}"`);
    data = {};
    for (const path of Array.isArray(def.path) ? def.path : [def.path])
      data = setPath(data, path, getPath(config, path));
  } else {
    const rest: Record<string, unknown> = { ...config };
    delete rest.kind;
    delete rest.schemaVersion;
    data = rest;
  }
  return {
    kind: 'forge.preset',
    schemaVersion: PRESET_SCHEMA_VERSION,
    id: opts.id,
    name: opts.name,
    description: opts.description ?? '',
    scope: opts.categoryId ? 'category' : 'full',
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    data,
  };
}

const full = (
  id: string,
  name: string,
  description: string,
  data: Record<string, unknown>
): Preset => ({
  kind: 'forge.preset',
  schemaVersion: PRESET_SCHEMA_VERSION,
  id,
  name,
  description,
  scope: 'full',
  data,
  builtin: true,
});

export const BUILTIN_PRESETS: Preset[] = [
  full(
    'classic',
    'Classic (original joi.how)',
    'Original dice odds and events only, minimal narration, no checks or prompts.',
    {
      session: {
        styleMix: [
          { styleId: 'encouragement', strength: 1 },
          { styleId: 'matter_of_fact', strength: 0.5 },
        ],
        narrationEnabled: false,
      },
      events: {
        selection: { strategy: 'dice' },
        disabledEventIds: [
          'ambient_narration',
          'clinical_observation',
          'stillness_after_pauses',
          'automaton_calibration',
          'oracle_mantra',
        ],
      },
      checks: { enabled: false },
      prompts: { enabled: false },
    }
  ),
  full(
    'display_doll',
    'Display doll',
    'Doll identity, praise and objectification, gentle hypnosis-style repetition.',
    {
      session: {
        identityId: 'doll',
        styleMix: [
          { styleId: 'praise', strength: 0.8 },
          { styleId: 'objectification', strength: 1 },
          { styleId: 'minimal', strength: 0.3 },
        ],
      },
      hypno: { enabled: true },
    }
  ),
  full(
    'clinical_study',
    'Clinical study',
    'Scientific subject, clinical and observational registers, observation prompts.',
    {
      session: {
        identityId: 'scientific_subject',
        styleMix: [
          { styleId: 'clinical_detachment', strength: 1 },
          { styleId: 'scientific_observation', strength: 1 },
          { styleId: 'formal_instruction', strength: 0.5 },
        ],
      },
    }
  ),
  full(
    'automaton',
    'Automaton calibration',
    'Automaton identity, mechanical language, calibration routines and instruction checks.',
    {
      session: {
        identityId: 'automaton',
        styleMix: [
          { styleId: 'mechanical_language', strength: 1 },
          { styleId: 'formal_instruction', strength: 0.7 },
        ],
      },
    }
  ),
  full(
    'oracle_rite',
    'Oracle rite',
    'Oracle identity, ritual and mystical registers, counting and repetition.',
    {
      session: {
        identityId: 'oracle',
        styleMix: [
          { styleId: 'ritualistic_language', strength: 1 },
          { styleId: 'mystical_symbolic', strength: 1 },
          { styleId: 'ceremonial_language', strength: 0.6 },
        ],
      },
      hypno: { enabled: true },
    }
  ),
];
