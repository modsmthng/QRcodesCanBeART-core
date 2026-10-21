// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { qrcodegen } from './vendor/qrcodegen.js';
import type { Point, Stroke, Circle } from './types.js';
import { isRigid } from './qr.js';

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export function strokeDistance(p: Point, points: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, segmentDistance(p, points[i - 1], points[i]));
  return best;
}

export function length(points: Point[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += distance(points[i - 1], points[i]);
  return n;
}

export function curve(a: Point, b: Point, bend: number): Point[] {
  const d = distance(a, b), steps = Math.max(4, Math.ceil((d + Math.abs(bend)) / 0.1));
  const control = { x: (a.x + b.x) / 2 - (b.y - a.y) / d * bend, y: (a.y + b.y) / 2 + (b.x - a.x) / d * bend };
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y };
  });
}

export function circlePath(c: Point, r: number): Point[] {
  return Array.from({ length: 65 }, (_, i) => ({ x: c.x + Math.cos(i * Math.PI / 32) * r, y: c.y + Math.sin(i * Math.PI / 32) * r }));
}

/** White modules retain a 0.4-module-wide sampling region, not just a point. */
export class Constraints {
  readonly size: number;
  readonly black: Point[] = [];
  readonly blackByCell = new Map<number, number>();
  constructor(readonly qr: qrcodegen.QrCode, readonly whiteRadius = 0.20) {
    this.size = qr.size;
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y) && !isRigid(qr, x, y)) {
        this.blackByCell.set(y * qr.size + x, this.black.length);
        this.black.push({ x: x + .5, y: y + .5 });
      }
    }
  }
  safe(p: Point, radius: number): boolean {
    if (p.x < radius || p.y < radius || p.x > this.size - radius || p.y > this.size - radius) return false;
    const reach = radius + .8;
    for (let y = Math.max(0, Math.floor(p.y - reach)); y <= Math.min(this.size - 1, Math.floor(p.y + reach)); y++) {
      for (let x = Math.max(0, Math.floor(p.x - reach)); x <= Math.min(this.size - 1, Math.floor(p.x + reach)); x++) {
        if (isRigid(this.qr, x, y)) {
          const dx = Math.max(x - p.x, 0, p.x - x - 1), dy = Math.max(y - p.y, 0, p.y - y - 1);
          if (dx * dx + dy * dy < radius * radius) return false;
        } else if (!this.qr.getModule(x, y)) {
          if (Math.hypot(x + .5 - p.x, y + .5 - p.y) < radius + this.whiteRadius) return false;
        }
      }
    }
    return true;
  }
  safePath(points: Point[], width: number): boolean {
    return points.every(p => this.safe(p, width / 2 + .014));
  }
  route(a: Point, b: Point, width: number, preference = 0): Point[] | undefined {
    if (distance(a, b) < .05) return undefined;
    let best: Point[] | undefined, score = Infinity;
    for (const bend of [preference, 0, .35, -.35, .75, -.75, 1.25, -1.25, 1.8, -1.8]) {
      const points = curve(a, b, bend);
      if (!this.safePath(points, width)) continue;
      const value = length(points) + Math.abs(bend - preference) * .07;
      if (value < score) { best = points; score = value; }
    }
    return best;
  }
  nearest(p: Point, excluded: Set<number>, maxDistance: number): number | undefined {
    let best: number | undefined, bestDistance = maxDistance;
    for (let i = 0; i < this.black.length; i++) {
      if (excluded.has(i)) continue;
      const d = distance(p, this.black[i]);
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    return best;
  }
  covered(strokes: Stroke[], circles: Circle[]): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.black.length; i++) {
      const p = this.black[i];
      // Keep a black disk around a sample point, even when a curve only grazes it.
      if (circles.some(c => c.filled ? distance(p, c.center) < c.radius - .13 : Math.abs(distance(p, c.center) - c.radius) < c.width / 2 - .13)
        || strokes.some(s => strokeDistance(p, s.points) < s.width / 2 - .13)) result.push(i);
    }
    return result;
  }
}

export function inkAt(p: Point, strokes: Stroke[], circles: Circle[]): boolean {
  return circles.some(c => c.filled ? distance(p, c.center) <= c.radius : Math.abs(distance(p, c.center) - c.radius) <= c.width / 2)
    || strokes.some(s => strokeDistance(p, s.points) <= s.width / 2);
}
