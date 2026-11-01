/**
 * Versioned config migrations. Each step transforms raw JSON of version N
 * into version N+1 before validation. Migrations never drop user data
 * silently: anything they cannot map is reported in `notes`.
 */
import { CONFIG_SCHEMA_VERSION } from './schema';

export type MigrationResult = {
  value: Record<string, unknown>;
  notes: string[];
  from: number;
  to: number;
};

type Migration = {
  from: number;
  describe: string;
  run: (
    raw: Record<string, unknown>,
    notes: string[]
  ) => Record<string, unknown>;
};

const MIGRATIONS: Migration[] = [
  {
    from: 1,
    describe:
      'v1 -> v2: session.styles (string[]) becomes session.styleMix; top-level checks array moves to checks.items',
    run(raw, notes) {
      const out = structuredClone(raw);
      const session = (out.session ?? {}) as Record<string, unknown>;
      if (Array.isArray(session.styles)) {
        session.styleMix = (session.styles as unknown[])
          .filter(s => typeof s === 'string')
          .map(styleId => ({ styleId, strength: 1 }));
        delete session.styles;
        notes.push(
          'Converted session.styles to a style mix with full strength.'
        );
      }
      out.session = session;
      if (Array.isArray(out.checks)) {
        out.checks = { enabled: true, items: out.checks };
        notes.push('Moved checks into checks.items.');
      }
      out.schemaVersion = 2;
      return out;
    },
  },
];

export function migrateConfig(raw: Record<string, unknown>): MigrationResult {
  const notes: string[] = [];
  const from = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  if (from > CONFIG_SCHEMA_VERSION)
    throw new Error(
      `Config schemaVersion ${from} is newer than this app supports (${CONFIG_SCHEMA_VERSION}).`
    );
  let value = raw;
  for (let v = from; v < CONFIG_SCHEMA_VERSION; v++) {
    const m = MIGRATIONS.find(x => x.from === v);
    if (!m) throw new Error(`No migration from schemaVersion ${v}.`);
    value = m.run(value, notes);
  }
  return { value, notes, from, to: CONFIG_SCHEMA_VERSION };
}

/** Shape of the original joi.how settings object (localStorage key "settings"). */
export type JoiSettings = {
  gameDuration?: number;
  warmupDuration?: number;
  climaxChance?: number;
  ruinChance?: number;
  minPace?: number;
  maxPace?: number;
  events?: string[];
  hypno?: string;
  gender?: string;
  body?: string;
};

const DICE_TO_EVENT: Record<string, string> = {
  randomPace: 'random_pace',
  halfPace: 'half_pace',
  doublePace: 'double_pace',
  risingPace: 'rising_pace',
  pause: 'scripted_pause',
  climax: 'climax',
  randomGrip: 'random_grip',
  cleanUp: 'clean_up',
};

export function looksLikeJoiSettings(raw: unknown): raw is JoiSettings {
  return (
    !!raw &&
    typeof raw === 'object' &&
    'gameDuration' in raw &&
    'minPace' in raw &&
    !('kind' in raw)
  );
}

/**
 * Import settings from the original app, preserving durations, pace limits,
 * climax/ruin odds and which dice events were enabled. Pet-themed hypnosis
 * modes are not carried over (excluded content in this fork).
 */
export function fromJoiSettings(s: JoiSettings): {
  patch: Record<string, unknown>;
  notes: string[];
} {
  const notes: string[] = [];
  const session: Record<string, unknown> = {};
  if (typeof s.gameDuration === 'number')
    session.durationSeconds = Math.max(60, s.gameDuration);
  if (typeof s.warmupDuration === 'number')
    session.warmupSeconds = s.warmupDuration;
  if (typeof s.climaxChance === 'number') session.climaxChance = s.climaxChance;
  if (typeof s.ruinChance === 'number') session.ruinChance = s.ruinChance;
  if (typeof s.minPace === 'number') session.paceMin = s.minPace;
  if (typeof s.maxPace === 'number') session.paceMax = s.maxPace;
  session.pronounsOverride =
    s.gender === 'male' ? 'he' : s.gender === 'female' ? 'she' : 'they';
  session.anatomyId =
    s.body === 'vagina'
      ? 'anatomy.vulva'
      : s.body === 'neuter'
        ? 'anatomy.unspecified'
        : 'anatomy.penis';
  const enabled = new Set(
    (s.events ?? Object.keys(DICE_TO_EVENT))
      .map(e => DICE_TO_EVENT[e])
      .filter(Boolean)
  );
  const disabledEventIds = Object.values(DICE_TO_EVENT).filter(
    id => !enabled.has(id)
  );
  const hypnoEnabled = s.hypno !== undefined && s.hypno !== 'off';
  if (s.hypno === 'maledom' || s.hypno === 'femdom')
    notes.push(
      `Original hypnosis mode "${s.hypno}" was pet-themed and is not available; generic hypnosis narration was enabled instead.`
    );
  notes.push(
    'Imported from joi.how settings: durations, pace limits, climax/ruin odds, enabled dice events, pronouns and anatomy.'
  );
  return {
    patch: {
      session,
      events: { disabledEventIds, selection: { strategy: 'dice' } },
      hypno: { enabled: hypnoEnabled },
    },
    notes,
  };
}
