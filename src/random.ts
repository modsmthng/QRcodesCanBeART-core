// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

/** Stable across Node and browsers. No Date.now()/Math.random() in generation. */
export class Random {
  private state: number;
  constructor(seed: string) {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
    this.state = h >>> 0;
  }
  next(): number {
    let t = this.state += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  int(n: number): number { return Math.floor(this.next() * n); }
  between(a: number, b: number): number { return a + (b - a) * this.next(); }
  pick<T>(xs: readonly T[]): T { return xs[this.int(xs.length)]; }
  shuffle<T>(xs: readonly T[]): T[] {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) { const j = this.int(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
}
