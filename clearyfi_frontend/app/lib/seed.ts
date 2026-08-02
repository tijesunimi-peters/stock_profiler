/**
 * Deterministic synthetic figures.
 *
 * EVERY number this app displays comes from here. They are shaped to be plausible and are
 * never accurate — the handoff is explicit that a prototype figure must not be ported into
 * production or used as a test fixture. Determinism is the point: the same ticker yields the
 * same series on every render, so a layout bug never hides behind a reshuffled number.
 *
 * When the real API is plumbed in, `app/data/api.ts` is the only file that changes; this one
 * gets deleted.
 */

/** FNV-1a. Stable across runs, unlike anything seeded off time. */
export function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for illustrative spread. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic float in `[lo, hi]`, rounded to `dp` places. */
export function sd(key: string, lo: number, hi: number, dp = 2): number {
  const v = lo + rng(hash(key))() * (hi - lo);
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** Deterministic integer in `[lo, hi]` inclusive. */
export function ri(key: string, lo: number, hi: number): number {
  return Math.floor(lo + rng(hash(key))() * (hi - lo + 1));
}

/** Deterministic pick from a list. */
export function pick<T>(key: string, xs: readonly T[]): T {
  return xs[ri(key, 0, xs.length - 1)];
}

/** Deterministic coin flip weighted to `p` true. */
export function chance(key: string, p: number): boolean {
  return rng(hash(key))() < p;
}

/**
 * A deterministic walk of `n` points around `start`, drifting by `drift` per step.
 *
 * `gapEvery` punches holes in the series — a period the filer did not disclose. Those come
 * back as `null` and must BREAK a line rather than interpolate across it (HANDOFF §3.4).
 */
export function walk(
  key: string,
  n: number,
  start: number,
  vol: number,
  drift = 0,
  gapEvery = 0,
): (number | null)[] {
  const r = rng(hash(key));
  const out: (number | null)[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v = v + drift + (r() - 0.5) * 2 * vol;
    out.push(gapEvery > 0 && i > 0 && i % gapEvery === 0 ? null : Math.round(v * 1000) / 1000);
  }
  return out;
}

/** Quantiles from an unsorted sample, linear interpolation. Nulls are dropped, never zeroed. */
export function quantiles(values: (number | null)[]): {
  lo: number;
  q1: number;
  med: number;
  q3: number;
  hi: number;
  n: number;
  excluded: number;
} {
  const xs = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  const excluded = values.length - xs.length;
  if (!xs.length) return { lo: 0, q1: 0, med: 0, q3: 0, hi: 0, n: 0, excluded };
  const at = (p: number) => {
    const i = (xs.length - 1) * p;
    const l = Math.floor(i);
    const h = Math.ceil(i);
    return l === h ? xs[l] : xs[l] + (xs[h] - xs[l]) * (i - l);
  };
  return {
    lo: xs[0],
    q1: at(0.25),
    med: at(0.5),
    q3: at(0.75),
    hi: xs[xs.length - 1],
    n: xs.length,
    excluded,
  };
}

/** Where `v` falls in `xs`, 0–100. Percentile is always within the peer set (00 §4). */
export function percentileOf(v: number, xs: number[]): number {
  if (!xs.length) return 0;
  const below = xs.filter((x) => x < v).length;
  return Math.round((below / xs.length) * 100);
}

/**
 * The prototype's own seed function, reproduced exactly.
 *
 * `seedN(ticker + salt)` returns a number in `[0, 1)` — FNV-1a modulo 100000. Porting it
 * verbatim is what makes the ported hub render the SAME figures the design was drawn against,
 * rather than a differently-random set of plausible ones.
 */
export function seedN(key: string): number {
  let x = 2166136261;
  for (let i = 0; i < key.length; i++) {
    x ^= key.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return ((x >>> 0) % 100000) / 100000;
}
