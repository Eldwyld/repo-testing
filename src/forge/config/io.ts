/**
 * Import/export of every Forge document type through one entry point.
 * Input is parsed as JSON (never evaluated), migrated, validated, and
 * scanned for excluded vocabulary before anything is stored.
 */
import { scanValue, describeFindings } from '../content/guard';
import { formatIssues, Issue, validate } from '../core/validate';
import { compilePack, Diagnostic } from '../events/validate';
import { EventPack } from '../events/types';
import {
  SessionRecord,
  sessionRecordV,
  SESSION_SCHEMA_VERSION,
} from '../session/types';
import {
  fromJoiSettings,
  looksLikeJoiSettings,
  migrateConfig,
} from './migrations';
import { Preset, presetV, PRESET_SCHEMA_VERSION } from './presets';
import {
  CONFIG_SCHEMA_VERSION,
  defaultConfig,
  ForgeConfig,
  forgeConfigV,
} from './schema';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type ImportResult =
  | {
      ok: true;
      kind: 'config';
      value: ForgeConfig;
      notes: string[];
      warnings: string[];
    }
  | {
      ok: true;
      kind: 'preset';
      value: Preset;
      notes: string[];
      warnings: string[];
    }
  | {
      ok: true;
      kind: 'eventPack';
      value: EventPack;
      notes: string[];
      warnings: string[];
    }
  | {
      ok: true;
      kind: 'session';
      value: SessionRecord;
      notes: string[];
      warnings: string[];
    }
  | { ok: false; kind?: string; errors: string[] };

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    return (patch === undefined ? base : patch) as T;
  if (!base || typeof base !== 'object' || Array.isArray(base))
    return structuredClone(patch) as T;
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = deepMerge(out[k], v);
  }
  return out as T;
}

const issuesToStrings = (issues: Issue[]) =>
  formatIssues(issues, 50).split('\n');
const diagToString = (d: Diagnostic) =>
  `${d.eventId ? `[${d.eventId}] ` : ''}${d.path ? `${d.path}: ` : ''}${d.message}`;

export function validateConfig(
  raw: unknown
):
  | { ok: true; value: ForgeConfig; notes: string[] }
  | { ok: false; errors: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, errors: ['Expected a JSON object.'] };
  let migrated;
  try {
    migrated = migrateConfig(raw as Record<string, unknown>);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const r = validate(forgeConfigV, migrated.value);
  if (!r.ok) return { ok: false, errors: issuesToStrings(r.issues) };
  const findings = scanValue(r.value, r.value.safety.extraProhibitedWords);
  if (findings.length)
    return {
      ok: false,
      errors: [
        `Excluded vocabulary found: ${describeFindings(findings.slice(0, 10))}`,
      ],
    };
  return { ok: true, value: r.value, notes: migrated.notes };
}

export function importDocument(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES)
    return {
      ok: false,
      errors: [`File is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`],
    };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  if (looksLikeJoiSettings(raw)) {
    const { patch, notes } = fromJoiSettings(raw);
    const merged = deepMerge(defaultConfig(), patch);
    const r = validateConfig(merged);
    return r.ok
      ? { ok: true, kind: 'config', value: r.value, notes, warnings: [] }
      : { ok: false, kind: 'joi.how settings', errors: r.errors };
  }
  const kind =
    raw && typeof raw === 'object'
      ? (raw as { kind?: unknown }).kind
      : undefined;
  switch (kind) {
    case 'forge.config': {
      const r = validateConfig(raw);
      return r.ok
        ? {
            ok: true,
            kind: 'config',
            value: r.value,
            notes: r.notes,
            warnings: [],
          }
        : { ok: false, kind: 'config', errors: r.errors };
    }
    case 'forge.preset': {
      const r = validate(presetV, raw);
      if (!r.ok)
        return { ok: false, kind: 'preset', errors: issuesToStrings(r.issues) };
      if (r.value.schemaVersion > PRESET_SCHEMA_VERSION)
        return {
          ok: false,
          kind: 'preset',
          errors: ['Preset is from a newer app version.'],
        };
      const findings = scanValue(r.value);
      if (findings.length)
        return {
          ok: false,
          kind: 'preset',
          errors: [
            `Excluded vocabulary found: ${describeFindings(findings.slice(0, 10))}`,
          ],
        };
      return {
        ok: true,
        kind: 'preset',
        value: r.value,
        notes: [],
        warnings: [],
      };
    }
    case 'forge.eventPack': {
      const r = compilePack(raw);
      if (!r.ok)
        return {
          ok: false,
          kind: 'eventPack',
          errors: r.errors.map(diagToString),
        };
      return {
        ok: true,
        kind: 'eventPack',
        value: raw as EventPack,
        notes: [],
        warnings: r.warnings.map(diagToString),
      };
    }
    case 'forge.session': {
      const r = validate(sessionRecordV, raw);
      if (!r.ok)
        return {
          ok: false,
          kind: 'session',
          errors: issuesToStrings(r.issues),
        };
      if (r.value.schemaVersion > SESSION_SCHEMA_VERSION)
        return {
          ok: false,
          kind: 'session',
          errors: ['Session record is from a newer app version.'],
        };
      const warnings: string[] = [];
      if (r.value.config !== undefined && !validateConfig(r.value.config).ok)
        warnings.push(
          'The embedded configuration snapshot could not be validated; deterministic re-simulation is unavailable.'
        );
      return { ok: true, kind: 'session', value: r.value, notes: [], warnings };
    }
    default:
      return {
        ok: false,
        errors: [
          'Unrecognised file: expected a Forge config, preset, event pack, session record, or joi.how settings export.',
        ],
      };
  }
}

export function exportConfig(config: ForgeConfig): string {
  return JSON.stringify(
    { ...config, kind: 'forge.config', schemaVersion: CONFIG_SCHEMA_VERSION },
    null,
    2
  );
}
