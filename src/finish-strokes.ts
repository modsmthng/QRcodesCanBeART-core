// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { Circle, Motif, Point, Stroke } from './types.js';
import { Constraints, curve, distance, length, strokeDistance } from './geometry.js';
import { Random } from './random.js';
import { absorbSample } from './line-cleanup.js';
import { pathClearsFigures } from './figure-clearance.js';

function closestPoint(p: Point, points: Point[]): Point {
  let best = points[0], bestDistance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const q = { x: a.x + dx * t, y: a.y + dy * t }, d = distance(p, q);
    if (d < bestDistance) { best = q; bestDistance = d; }
  }
  return best;
}

/** Join missed samples to nearby lines, then use short pen strokes where no join fits. */
export function finishStrokes(grid: Constraints, strokes: Stroke[], circles: Circle[], width: number, rng: Random, motifGroups: Motif[]): { joinedModules: number; absorbedModules: number; isolatedStrokes: number; isolatedDots: number } {
  const covered = new Set(grid.covered(strokes, circles));
  const remaining = grid.black.filter((_, i) => !covered.has(i));
  const motifs = strokes.filter(s => s.kind !== 'connector');
  const owner = new Map(motifGroups.flatMap(m => m.strokes.map(s => [s, m] as const)));
  const figures = motifGroups.filter(m=>m.category==='figure');
  let joinedModules = 0, absorbedModules = 0, isolatedStrokes = 0, isolatedDots = 0;
  const clearOfMotifs = (points: Point[], except?: Stroke) => {
    const allowedOwner = except ? owner.get(except) : undefined;
    return pathClearsFigures(points,width,figures) && points.every(p =>
      !motifs.some(s => s !== except && !(allowedOwner && owner.get(s) === allowedOwner) && strokeDistance(p, s.points) < (width + s.width) / 2 + .06)
      && !circles.some(c => c.kind === 'head' && distance(p, c.center) < c.radius + width / 2 + (c.filled ? .06 : c.width / 2 + .06)));
  };

  for (const p of remaining) {
    // A previous extension may already have covered this sample with full reserve.
    if (strokes.some(s => strokeDistance(p, s.points) < s.width / 2 - .13)) continue;
    // Figures are complete, immutable motifs: never use them as join targets.
    const nearby = strokes.filter(s=>s.kind!=='figure').map(s => ({ stroke: s, q: closestPoint(p, s.points) }))
      .map(item => ({ ...item, d: distance(p, item.q) })).filter(item => item.d < (item.stroke.kind === 'symbol' ? .60 : .46)).sort((a, b) => a.d - b.d);
    let absorbed = false;
    for (const { stroke } of nearby.slice(0, 3)) {
      const changed = absorbSample(grid, stroke, p, points => clearOfMotifs(points, stroke));
      if (!changed) continue;
      stroke.points = changed;
      absorbedModules++; joinedModules++; absorbed = true;
      break;
    }
    if (absorbed) continue;
    const join = nearby.find(({ stroke, q }) => {
      const points = curve(p, q, 0);
      return grid.safePath(points, width) && clearOfMotifs(points, stroke);
    });
    if (join) {
      strokes.push({ points: curve(p, join.q, 0), width, kind: 'connector' });
      joinedModules++;
      continue;
    }

    // Extend an existing trail at its tip; avoid branches across figures or symbols.
    let extension: { stroke: Stroke; points: Point[]; atStart: boolean; score: number } | undefined;
    const tips = strokes.filter(s => s.kind === 'connector').flatMap(stroke => [true, false].map(atStart => {
      const q = stroke.points[atStart ? 0 : stroke.points.length - 1];
      return { stroke, atStart, q, d: distance(p, q) };
    })).filter(tip => tip.d >= .2 && tip.d <= 2.5).sort((a, b) => a.d - b.d).slice(0, 8);
    for (const { stroke, atStart, q } of tips) {
      const points = grid.route(p, q, width);
      if (!points || !clearOfMotifs(points)) continue;
      const score = length(points);
      if (score > 3 || (extension && score >= extension.score)) continue;
      extension = { stroke, points, atStart, score };
    }
    if (extension) {
      const { stroke, points, atStart } = extension;
      stroke.points = atStart ? [...points.slice(0, -1), ...stroke.points] : [...stroke.points, ...points.slice(0, -1).reverse()];
      joinedModules++;
      continue;
    }

    // A one-cell mark still carries data. Keep it in the quality count even though
    // it is drawn as a pen stroke rather than a circle: no cosmetic score shortcut.
    const phase = rng.between(0, Math.PI), bend = rng.between(-.07, .07);
    let best: Point[] | undefined, bestScore = -Infinity;
    for (let angleIndex = 0; angleIndex < 12; angleIndex++) {
      const angle = phase + angleIndex * Math.PI / 12;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      for (const [before, after] of [[.5, .5], [.35, .35], [.15, .6], [.6, .15], [.22, .22]]) {
        const a = { x: p.x - dx * before, y: p.y - dy * before };
        const b = { x: p.x + dx * after, y: p.y + dy * after };
        const points = [...curve(a, p, bend), ...curve(p, b, -bend).slice(1)];
        if (!grid.safePath(points, width) || !clearOfMotifs(points)) continue;
        const score = before + after - Math.abs(before - after) * .12;
        if (score > bestScore) { best = points; bestScore = score; }
      }
    }
    if (best) {
      strokes.push({ points: best, width, kind: 'connector' });
      isolatedStrokes++;
    } else {
      // Preserve the exact data in a crowded motif rather than erase a black cell.
      circles.push({ center: p, radius: width * .60, width, filled: true, kind: 'dot' });
      isolatedDots++;
    }
  }
  return { joinedModules, absorbedModules, isolatedStrokes, isolatedDots };
}
