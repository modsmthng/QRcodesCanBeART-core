// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { Point, Motif, Stroke, Circle } from './types.js';
import { Random } from './random.js';
import { Constraints, distance, length, circlePath } from './geometry.js';
import { isRigid } from './qr.js';
import { figureShapeIsCalm, routeFigureSegment } from './figure-shape.js';
import { fitFigureSamplesWithoutBranches } from './figure-clearance.js';

type Joint = readonly [number, number];
type Pose = {
  label: string;
  elbows: readonly [Joint, Joint];
  hands: readonly [Joint, Joint];
  knees: readonly [Joint, Joint];
  feet: readonly [Joint, Joint];
};
type Head = { center: Point; radius: number; filled: boolean; indices: number[] };
const BOUNDS_PAD = .15;

// Joint y values are offsets from the head radius. This keeps the same body
// proportions for both filled heads and the larger, outlined heads.
const POSES: readonly Pose[] = [
  {
    label: 'Winken',
    elbows: [[-.58, .87], [.70, .33]],
    hands: [[-1.23, 1.38], [1.34, -.38]],
    knees: [[-.50, 2.72], [.28, 2.74]],
    feet: [[-.89, 3.72], [.94, 3.62]],
  },
  {
    label: 'Tanzen',
    elbows: [[-.77, .46], [.72, .64]],
    hands: [[-1.48, -.12], [1.43, 1.20]],
    knees: [[-.34, 2.68], [.45, 2.74]],
    feet: [[-1.22, 3.48], [1.38, 3.30]],
  },
  {
    label: 'Springen',
    elbows: [[-.70, .30], [.70, .30]],
    hands: [[-1.35, -.52], [1.35, -.52]],
    knees: [[-.38, 2.68], [.38, 2.68]],
    feet: [[-1.31, 3.06], [1.31, 3.06]],
  },
  {
    label: 'Laufen',
    elbows: [[-.70, .57], [.67, .45]],
    hands: [[-1.36, 1.18], [1.37, -.02]],
    knees: [[-.50, 2.65], [.35, 2.82]],
    feet: [[-1.49, 3.00], [1.53, 3.83]],
  },
  {
    label: 'Balancieren',
    elbows: [[-.82, .31], [.82, .31]],
    hands: [[-1.62, .42], [1.62, .42]],
    knees: [[-.39, 2.75], [.82, 2.75]],
    feet: [[-.70, 3.76], [1.66, 2.79]],
  },
];

function heads(grid: Constraints): Head[] {
  const result: Head[] = grid.black.map((p, i) => ({ center: p, radius: .43, filled: true, indices: [i] }));
  for (let y = 1; y < grid.size - 1; y++) for (let x = 1; x < grid.size - 1; x++) {
    if (isRigid(grid.qr, x, y) || grid.qr.getModule(x, y)) continue;
    const indices = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .map(([a, b]) => grid.blackByCell.get(b * grid.size + a));
    if (indices.some(i => i === undefined)) continue;
    const center = { x: x + .5, y: y + .5 };
    if (grid.safePath(circlePath(center, 1), .36)) result.push({ center, radius: 1, filled: false, indices: indices as number[] });
  }
  return result;
}

function jointAngle(a: Point, joint: Point, b: Point): number {
  const ax = a.x - joint.x, ay = a.y - joint.y;
  const bx = b.x - joint.x, by = b.y - joint.y;
  const denom = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (!denom) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / denom))) * 180 / Math.PI;
}

function makeFigure(grid: Constraints, head: Head, rng: Random, id: number): Motif | undefined {
  const pose = rng.pick(POSES), scale = rng.between(.88, 1.14), angle = rng.between(-.38, .38);
  const width = rng.between(.36, .41), r = head.radius;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rotate = (x: number, y: number): Point => ({
    x: head.center.x + (x * cos - y * sin) * scale,
    y: head.center.y + (x * sin + y * cos) * scale,
  });
  const excluded = new Set(head.indices);
  const circle: Circle = { center: head.center, radius: r, width, filled: head.filled, kind: 'head' };
  // Preserve the original head checks: filled heads protect their full disk;
  // outlined heads protect the rendered ring and its complete sampling margin.
  if (head.filled ? !grid.safe(head.center, r) : !grid.safePath(circlePath(head.center, r), width)) return;

  let snapCost = 0;
  const snap = (x: number, y: number): Point | undefined => {
    const ideal = rotate(x, y), index = grid.nearest(ideal, excluded, .95);
    if (index === undefined) return;
    excluded.add(index);
    snapCost += distance(ideal, grid.black[index]) ** 2;
    return grid.black[index];
  };
  const target = (joint: Joint): Point => rotate(joint[0], r + joint[1]);
  const snapTarget = (joint: Joint): Point | undefined => snap(joint[0], r + joint[1]);

  const neck = rotate(0, r * .84);
  const shoulder = snap(0, r + .75), hip = snap(.05, r + 2.0);
  const leftElbow = target(pose.elbows[0]), rightElbow = target(pose.elbows[1]);
  const leftHand = snapTarget(pose.hands[0]), rightHand = snapTarget(pose.hands[1]);
  const leftKnee = target(pose.knees[0]), rightKnee = target(pose.knees[1]);
  const leftFoot = snapTarget(pose.feet[0]), rightFoot = snapTarget(pose.feet[1]);
  if (!shoulder || !hip || !leftHand || !rightHand || !leftFoot || !rightFoot) return;

  if (hip.y - shoulder.y < .6 || shoulder.y - head.center.y < r + .1
      || leftHand.x >= rightHand.x - .7 || leftFoot.x >= rightFoot.x - .7) return;
  // Reject tightly folded joints, but allow a naturally extended limb.
  for (const angle of [
    jointAngle(shoulder, leftElbow, leftHand), jointAngle(shoulder, rightElbow, rightHand),
    jointAngle(hip, leftKnee, leftFoot), jointAngle(hip, rightKnee, rightFoot),
  ]) if (angle < 55) return;

  const pairs: [Point, Point][] = [
    [neck, shoulder], [shoulder, hip],
    [shoulder, leftElbow], [leftElbow, leftHand],
    [shoulder, rightElbow], [rightElbow, rightHand],
    [hip, leftKnee], [leftKnee, leftFoot],
    [hip, rightKnee], [rightKnee, rightFoot],
  ];
  const strokes: Stroke[] = [];
  let bending = 0;
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    const points = routeFigureSegment(grid, a, b, width, i < 2);
    if (!points) return;
    // Every visible path is routed through the unchanged sampling-disk and
    // rigid-function checks. Limbs and torso also stay outside the head disk.
    if (i !== 0 && points.some(p => distance(p, head.center) < r + width * .4)) return;
    const inflation = length(points) / distance(a, b);
    bending += inflation - 1;
    strokes.push({ points, width, kind: 'figure' });
  }
  if (!figureShapeIsCalm(strokes)) return;

  const all = strokes.flatMap(s => s.points);
  const bounds: Motif['bounds'] = [
    Math.min(head.center.x - r, ...all.map(p => p.x)) - BOUNDS_PAD,
    Math.min(head.center.y - r, ...all.map(p => p.y)) - BOUNDS_PAD,
    Math.max(head.center.x + r, ...all.map(p => p.x)) + BOUNDS_PAD,
    Math.max(head.center.y + r, ...all.map(p => p.y)) + BOUNDS_PAD,
  ];
  const covered = grid.covered(strokes, [circle]);
  const motif: Motif = {
    id, label: pose.label, head: head.center, bounds, covered, strokes, circles: [circle],
    cost: snapCost * .65 + bending * 1.1 - covered.length * .7 - (head.filled ? 0 : 1.1),
    category: 'figure',
  };
  if(!fitFigureSamplesWithoutBranches(grid,motif)) return;
  motif.cost -= (motif.covered.length-covered.length)*.7;
  // Candidate fitting may reshape a segment; collision bounds must follow its ink.
  for(const stroke of motif.strokes) for(const point of stroke.points) {
    motif.bounds[0]=Math.min(motif.bounds[0],point.x-stroke.width/2);
    motif.bounds[1]=Math.min(motif.bounds[1],point.y-stroke.width/2);
    motif.bounds[2]=Math.max(motif.bounds[2],point.x+stroke.width/2);
    motif.bounds[3]=Math.max(motif.bounds[3],point.y+stroke.width/2);
  }
  return motif;
}

function missingInkPadding(motif: Motif): number {
  let radius = 0;
  for (const stroke of motif.strokes) radius = Math.max(radius, stroke.width / 2);
  for (const circle of motif.circles) if (!circle.filled) radius = Math.max(radius, circle.width / 2);
  return Math.max(0, radius - BOUNDS_PAD);
}

/** Fast figure collision test using bounds expanded to include rendered ink. */
export function figureMotifsConflict(a: Motif, b: Motif): boolean {
  if (a.covered.some(i => b.covered.includes(i))) return true;
  const padding = missingInkPadding(a) + missingInkPadding(b);
  const x = Math.min(a.bounds[2], b.bounds[2]) - Math.max(a.bounds[0], b.bounds[0]) + padding;
  const y = Math.min(a.bounds[3], b.bounds[3]) - Math.max(a.bounds[1], b.bounds[1]) + padding;
  return x >= 0 && y >= 0;
}

/** Build a seed-stable composition from articulated, safely routed poses. */
export function composeFigures(grid: Constraints, rng: Random, trials = 450): Motif[] {
  const possibleHeads = heads(grid);
  if (!possibleHeads.length) return [];
  const candidates: Motif[] = [];
  for (let i = 0; i < trials; i++) {
    const candidate = makeFigure(grid, rng.pick(possibleHeads), rng, i);
    if (candidate) candidates.push(candidate);
  }
  if (!candidates.length) return [];
  candidates.sort((a, b) => a.cost - b.cost);
  const limit = grid.size <= 21 ? 4 : grid.size <= 25 ? 5 : 6;
  const compatible = (xs: Motif[]) => xs.every((a, i) => xs.slice(i + 1).every(b => !figureMotifsConflict(a, b)));
  const score = (xs: Motif[]) => xs.reduce((s, m) => s + m.cost - 8, 0);
  let current: Motif[] = [];
  for (const m of candidates) if (current.length < limit && compatible([...current, m])) current.push(m);
  let best = current, bestScore = score(current);
  for (let i = 0; i < 550; i++) {
    const candidate = rng.pick(candidates), proposal = current.filter(m => !figureMotifsConflict(m, candidate) && m.id !== candidate.id);
    if (proposal.length >= limit) proposal.splice(rng.int(proposal.length), 1);
    proposal.push(candidate);
    const temperature = 2.5 * (1 - i / 550) + .03;
    const delta = score(proposal) - score(current);
    if (delta < 0 || rng.next() < Math.exp(-delta / temperature)) current = proposal;
    if (score(current) < bestScore) { best = current; bestScore = score(current); }
  }
  return best.sort((a, b) => a.head.y - b.head.y || a.head.x - b.head.x);
}
