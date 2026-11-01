import { ConditionScope, evaluate } from '../events/conditions';
import { narrate, NarrationContext } from '../identity/render';
import { DEFAULT_HYPNO_LINES } from './builtins';
import {
  HypnoConfig,
  HypnoPatternConfig,
  NarrativeStyle,
  StyleMixEntry,
} from './types';

export type StyleIndex = Record<string, NarrativeStyle>;

export type MixConflict = { a: string; b: string; message: string };

/** Report incompatible pairs and unknown styles in a style mix. */
export function checkStyleMix(
  mix: readonly StyleMixEntry[],
  styles: StyleIndex
): MixConflict[] {
  const active = mix.filter(m => m.strength > 0 && styles[m.styleId]?.enabled);
  const conflicts: MixConflict[] = [];
  for (const m of mix) {
    if (!styles[m.styleId])
      conflicts.push({
        a: m.styleId,
        b: m.styleId,
        message: `unknown style "${m.styleId}"`,
      });
  }
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = styles[active[i].styleId];
      const b = styles[active[j].styleId];
      if (
        a.incompatibleWith.includes(b.id) ||
        b.incompatibleWith.includes(a.id)
      )
        conflicts.push({
          a: a.id,
          b: b.id,
          message: `"${a.name}" and "${b.name}" are marked incompatible; the weaker one is suppressed`,
        });
    }
  }
  return conflicts;
}

export type ComposeInput = {
  styles: StyleIndex;
  mix: readonly StyleMixEntry[];
  narration: Omit<NarrationContext, 'style'>;
  scope: ConditionScope;
  previousStyle?: string;
  /** Global excluded phrases (safety settings). */
  excluded?: readonly string[];
  /** Restrict to these style ids (e.g. an event's style restriction). */
  only?: readonly string[];
};

export type ComposedLine = {
  text: string;
  styleId: string;
  phraseId: string;
  transition?: string;
  rejected: { phraseId: string; reason: string }[];
};

export function eligibleStyles(
  input: ComposeInput
): { style: NarrativeStyle; weight: number }[] {
  const { styles, mix, narration, scope } = input;
  const intensity = narration.intensity ?? 0;
  const identityStyles = narration.identity.styles;
  const candidates = mix
    .map(m => ({
      style: styles[m.styleId],
      weight: (styles[m.styleId]?.weight ?? 0) * m.strength,
    }))
    .filter(({ style, weight }) => {
      if (!style || !style.enabled || weight <= 0) return false;
      if (input.only?.length && !input.only.includes(style.id)) return false;
      if (identityStyles.length && !identityStyles.includes(style.id))
        return false;
      if (intensity < style.intensity.min || intensity > style.intensity.max)
        return false;
      if (style.activation && !evaluate(style.activation, scope)) return false;
      return true;
    });
  // Suppress the weaker member of each incompatible pair (deterministic: stable sort by weight).
  const sorted = [...candidates].sort((a, b) => b.weight - a.weight);
  const kept: typeof candidates = [];
  for (const c of sorted) {
    const clash = kept.some(
      k =>
        k.style.incompatibleWith.includes(c.style.id) ||
        c.style.incompatibleWith.includes(k.style.id)
    );
    if (!clash) kept.push(c);
  }
  return candidates.filter(c => kept.includes(c));
}

function containsExcluded(text: string, excluded: readonly string[]) {
  const lower = text.toLowerCase();
  return excluded.find(x => x.trim() && lower.includes(x.trim().toLowerCase()));
}

const MAX_PHRASE_ATTEMPTS = 6;

export function composeLine(input: ComposeInput): ComposedLine | null {
  const rng = input.narration.rng;
  let pool = eligibleStyles(input);
  const rejected: ComposedLine['rejected'] = [];
  const identityCategory = input.narration.identity.category;
  const intensity = input.narration.intensity ?? 0;

  while (pool.length) {
    const pick = rng.weighted(pool, p => p.weight);
    if (!pick) return null;
    const style = pick.style;
    pool = pool.filter(p => p !== pick);
    if (style.frequency < 1 && !rng.chance(style.frequency)) continue;

    let phrases = style.phrases.filter(
      p =>
        p.enabled &&
        (!p.intensity ||
          (intensity >= p.intensity.min && intensity <= p.intensity.max)) &&
        (!p.identities.length || p.identities.includes(identityCategory))
    );
    const excluded = [...style.excluded, ...(input.excluded ?? [])];
    for (
      let attempt = 0;
      attempt < MAX_PHRASE_ATTEMPTS && phrases.length;
      attempt++
    ) {
      const phrase = rng.weighted(phrases, p => p.weight);
      if (!phrase) break;
      phrases = phrases.filter(p => p !== phrase);
      const ctx: NarrationContext = {
        ...input.narration,
        style: style.id,
        vars: {
          ...input.narration.vars,
          vocab: rng.pick(style.vocabulary) ?? '',
        },
      };
      const out = narrate(phrase.text, ctx);
      const bad = out.blocked.length
        ? `prohibited term "${out.blocked[0]}"`
        : out.missing.length
          ? `unresolved ${out.missing.join(' ')}`
          : containsExcluded(out.text, excluded)
            ? `excluded phrase "${containsExcluded(out.text, excluded)}"`
            : null;
      if (bad) {
        rejected.push({ phraseId: phrase.id, reason: bad });
        continue;
      }
      let transition: string | undefined;
      if (input.previousStyle && input.previousStyle !== style.id) {
        const prev = input.styles[input.previousStyle];
        const t = prev?.transitions.find(tr => tr.to === style.id);
        if (t) {
          const rendered = narrate(t.template, ctx);
          if (!rendered.blocked.length && !rendered.missing.length)
            transition = rendered.text;
        }
      }
      return {
        text: out.text,
        styleId: style.id,
        phraseId: phrase.id,
        transition,
        rejected,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hypnosis-inspired patterns (creative narration structures only).
// ---------------------------------------------------------------------------

export type HypnoLine = { patternId: string; lines: string[] };

export function hypnoInterval(config: HypnoConfig, intensity: number): number {
  const t = Math.min(1, Math.max(0, intensity / 10));
  return (
    (config.intervalAtMin + (config.intervalAtMax - config.intervalAtMin) * t) *
    1000
  );
}

export function hypnoLine(
  config: HypnoConfig,
  narration: NarrationContext,
  opts: { transition?: boolean } = {}
): HypnoLine | null {
  if (!config.enabled) return null;
  const rng = narration.rng;
  const intensity = narration.intensity ?? 0;
  const usable = config.patterns.filter(
    p =>
      p.enabled &&
      p.weight > 0 &&
      intensity >= p.intensity.min &&
      intensity <= p.intensity.max
  );
  const transitionPattern = usable.find(p => p.id === 'phase_transition');
  const pattern: HypnoPatternConfig | undefined =
    opts.transition && transitionPattern
      ? transitionPattern
      : rng.weighted(usable, p => p.weight);
  if (!pattern) return null;
  const source = pattern.lines.length
    ? pattern.lines
    : DEFAULT_HYPNO_LINES[pattern.id];
  const render = (t: string, vars: Record<string, string | number> = {}) => {
    const r = narrate(t, {
      ...narration,
      vars: { ...narration.vars, ...vars },
    });
    return r.blocked.length || r.missing.length ? null : r.text;
  };
  const lines: string[] = [];
  const n = pattern.repetitions;
  switch (pattern.id) {
    case 'counting':
      for (let i = n; i >= 1; i--) {
        const line = render(rng.pick(source)!, { n: i });
        if (line) lines.push(line);
      }
      break;
    case 'gradual_variation':
      source.slice(0, n).forEach(t => {
        const line = render(t);
        if (line) lines.push(line);
      });
      break;
    case 'repetition':
    case 'rhythmic': {
      const base = rng.pick(source)!;
      for (let i = 0; i < n; i++) {
        const t =
          i > 0 && rng.chance(pattern.variation) ? rng.pick(source)! : base;
        const line = render(t);
        if (line) lines.push(line);
      }
      break;
    }
    default: {
      const line = render(rng.pick(source)!);
      if (line) lines.push(line);
    }
  }
  // Enforce the configured maximum length.
  let total = 0;
  const capped = lines.filter(
    l => (total += l.length + 1) <= pattern.maxLength
  );
  return capped.length ? { patternId: pattern.id, lines: capped } : null;
}
