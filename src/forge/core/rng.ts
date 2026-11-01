/**
 * Seeded, serialisable pseudo random number generator (mulberry32).
 *
 * The whole generator state is a single uint32 `cursor`, so it can be stored
 * in a session record and restored to reproduce every random decision.
 */

export type RngState = { seed: string; cursor: number; draws: number };

export function hashSeed(seed: string): number {
  // FNV-1a 32 bit
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRngState(seed: string): RngState {
  return { seed, cursor: hashSeed(seed), draws: 0 };
}

export class Rng {
  private cursor: number;
  private draws: number;
  readonly seed: string;

  constructor(state: RngState) {
    this.seed = state.seed;
    this.cursor = state.cursor >>> 0;
    this.draws = state.draws;
  }

  static fromSeed(seed: string) {
    return new Rng(createRngState(seed));
  }

  get state(): RngState {
    return { seed: this.seed, cursor: this.cursor, draws: this.draws };
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.draws++;
    this.cursor = (this.cursor + 0x6d2b79f5) >>> 0;
    let t = this.cursor;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * Math.max(0, max));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(items.length)];
  }

  /**
   * Weighted pick. Items with non-positive or non-finite weight are never
   * selected. Returns undefined when nothing is selectable.
   */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T | undefined {
    const weights = items.map(i => {
      const w = weightOf(i);
      return Number.isFinite(w) && w > 0 ? w : 0;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    let lastPositive = -1;
    for (let i = 0; i < items.length; i++) {
      if (weights[i] <= 0) continue;
      lastPositive = i;
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items[lastPositive];
  }
}
