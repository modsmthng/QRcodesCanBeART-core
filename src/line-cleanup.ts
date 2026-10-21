// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { Point, Stroke } from './types.js';
import { Constraints, distance, length, strokeDistance } from './geometry.js';

const unit = (a: Point, b: Point): Point => {
  const d = distance(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};

function corner(points: Point[], i: number, turnCos = .82): boolean {
  if (i <= 0 || i >= points.length - 1) return true;
  const a = unit(points[i-1], points[i]), b = unit(points[i], points[i+1]);
  return a.x*b.x + a.y*b.y < turnCos;
}

function span(points: Point[], near: number, window: number, turnCos = .82): [number, number] {
  let first = near, last = near, before = 0, after = 0;
  while (first > 0 && before < window) {
    before += distance(points[first], points[first-1]); first--;
    if (corner(points, first, turnCos)) break;
  }
  while (last < points.length-1 && after < window) {
    after += distance(points[last], points[last+1]); last++;
    if (corner(points, last, turnCos)) break;
  }
  return [first, last];
}

// A local displacement with zero slope at the moved point and both anchors:
// unlike a replacement curve, it keeps a deliberate pen corner at that point.
function moveSpan(points: Point[], near: number, first: number, last: number, p: Point): Point[] {
  const arcs = [0];
  for (let i = first + 1; i <= last; i++) arcs.push(arcs.at(-1)! + distance(points[i-1], points[i]));
  const middle = arcs[near-first], total = arcs.at(-1)!;
  const delta = { x: p.x - points[near].x, y: p.y - points[near].y };
  return points.map((point, i) => {
    if (i < first || i > last) return point;
    const arc = arcs[i-first];
    const t = i < near ? (middle-arc)/middle : i > near ? (arc-middle)/(total-middle) : 0;
    const weight = 1 - t*t*(3-2*t);
    return { x: point.x + delta.x*weight, y: point.y + delta.y*weight };
  });
}

function preservesSamples(grid: Constraints, stroke: Stroke, changed: Point[], p: Point): boolean {
  const reserve = stroke.width / 2 - .13;
  if (strokeDistance(p, changed) >= reserve) return false;
  return grid.covered([stroke], []).every(i => strokeDistance(grid.black[i], changed) < reserve);
}

function noFold(before: Point[], after: Point[], first: number, last: number): boolean {
  for (let i = first + 1; i <= last; i++) {
    const a = unit(before[i-1], before[i]), b = unit(after[i-1], after[i]);
    if (a.x*b.x + a.y*b.y < .15) return false;
  }
  return true;
}

function cubic(a: Point, b: Point, start: Point, end: Point): Point[] {
  const d = distance(a, b), steps = Math.max(4, Math.ceil(d / .06));
  const c = { x: a.x + start.x * d / 3, y: a.y + start.y * d / 3 };
  const e = { x: b.x - end.x * d / 3, y: b.y - end.y * d / 3 };
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t;
    return { x: u*u*u*a.x + 3*u*u*t*c.x + 3*u*t*t*e.x + t*t*t*b.x,
      y: u*u*u*a.y + 3*u*u*t*c.y + 3*u*t*t*e.y + t*t*t*b.y };
  });
}

/** Absorb a nearby sample into a smooth local span, keeping both end tangents. */
export function absorbSample(grid: Constraints, stroke: Stroke, p: Point, clear: (points: Point[]) => boolean): Point[] | undefined {
  let points = stroke.points;
  let near = 0, bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = distance(p, points[i]);
    if (d < bestDistance) { near = i; bestDistance = d; }
  }
  // A closed shape has no real endpoint. Put its serialization seam far from
  // the sample so a heart's notch is handled like any other deliberate corner.
  if (distance(points[0], points.at(-1)!) < 1e-6) {
    const ring = points.slice(0, -1), start = (near + Math.floor(ring.length / 2)) % ring.length;
    near = (near % ring.length - start + ring.length) % ring.length;
    points = [...ring.slice(start), ...ring.slice(0, start), ring[start]];
  }
  // Shared limb endpoints must move together; absorbJoint handles that case.
  if (near === 0 || near === points.length - 1) return undefined;
  for (const window of [.65, 1.0, 1.35]) {
    // A polygonal heart lobe approximates a rounded line with several small
    // turns. Let the local adjustment span those intermediate vertices.
    const [first, last] = span(points, near, window, stroke.kind === 'symbol' ? .5 : .82);
    const before = length(points.slice(first, near+1)), after = length(points.slice(near, last+1));
    if (before < .2 || after < .2 || first === last) continue;
    const moved = moveSpan(points, near, first, last, p);
    if (noFold(points, moved, first, last)
      && length(moved.slice(first, last+1)) <= (before+after)*1.4 + .1
      && grid.safePath(moved, stroke.width) && clear(moved.slice(first, last+1))
      && preservesSamples(grid, stroke, moved, p)) return moved;
    // Symbols keep their corners and silhouette; use smooth replacement spans
    // only for unbroken stretches of a limb or a connecting pen line.
    if (stroke.kind === 'symbol' || corner(points, near)) continue;
    const a = points[first], b = points[last];
    const start = unit(points[Math.max(0, first-1)], points[first+1]);
    const end = unit(points[last-1], points[Math.min(points.length-1, last+1)]);
    const through = unit(a, b);
    const patch = [...cubic(a, p, start, through), ...cubic(p, b, through, end).slice(1)];
    if (length(patch) > length(points.slice(first, last+1))*1.4 + .1) continue;
    if (!grid.safePath(patch, stroke.width) || !clear(patch)) continue;
    const changed = [...points.slice(0, first), ...patch, ...points.slice(last+1)];
    // This intentionally preserves every sample carried by this stroke alone,
    // including samples added during earlier passes, before mutating any path.
    if (!preservesSamples(grid, stroke, changed, p)) continue;
    return changed;
  }
  return undefined;
}

/** Move a shared elbow/knee with all attached strokes, never tear a limb apart. */
export function absorbJoint(grid: Constraints, strokes: Stroke[], p: Point, clear: (points: Point[], stroke: Stroke) => boolean): { stroke: Stroke; points: Point[] }[] | undefined {
  // Closed contours use absorbSample; treating their seam as a limb joint
  // would move only one of its two serialized endpoints.
  if (strokes.some(s => s.kind !== 'figure' || distance(s.points[0],s.points.at(-1)!) < 1e-6)) return undefined;
  const tips = strokes.flatMap(stroke => [stroke.points[0], stroke.points.at(-1)!]);
  const joints = tips.filter((q, i) => distance(q, p) < .5
    && tips.findIndex(a => distance(a, q) < 1e-6) === i
    && tips.filter(a => distance(a, q) < 1e-6).length >= 2)
    .sort((a,b) => distance(a,p)-distance(b,p));
  for (const joint of joints) for (const window of [.65, 1.0, 1.35]) {
    const changed: { stroke: Stroke; points: Point[] }[] = [];
    for (const stroke of strokes) {
      const near = distance(stroke.points[0], joint) < 1e-6 ? 0
        : distance(stroke.points.at(-1)!, joint) < 1e-6 ? stroke.points.length-1 : -1;
      if (near === -1) continue;
      const [first, last] = span(stroke.points, near, window);
      const moved = moveSpan(stroke.points, near, first, last, p);
      if (!noFold(stroke.points, moved, first, last)
        || length(moved.slice(first,last+1)) > length(stroke.points.slice(first,last+1))*1.4+.1
        || !grid.safePath(moved,stroke.width) || !clear(moved.slice(first,last+1),stroke)
        || !preservesSamples(grid,stroke,moved,p)) break;
      changed.push({stroke,points:moved});
    }
    if (changed.length === tips.filter(q => distance(q,joint)<1e-6).length) return changed;
  }
  return undefined;
}
