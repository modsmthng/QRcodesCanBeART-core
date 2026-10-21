// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { Point, Stroke } from './types.js';
import { Constraints, curve, distance, length, segmentDistance } from './geometry.js';

function jointAngle(a: Point, joint: Point, b: Point): number {
  const ax=a.x-joint.x, ay=a.y-joint.y, bx=b.x-joint.x, by=b.y-joint.y;
  const denom=Math.hypot(ax,ay)*Math.hypot(bx,by);
  return denom ? Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/denom)))*180/Math.PI : 0;
}

/** Figure-only envelope, also enforced after sample/joint cleanup. */
export function figureShapeIsCalm(strokes: Stroke[]): boolean {
  // Neck, torso, then two segments each for the four articulated limbs.
  if(strokes.length!==10) return false;
  for(const [i,stroke] of strokes.entries()) {
    const a=stroke.points[0], b=stroke.points.at(-1)!, chord=distance(a,b);
    const maxSag=i<2?.18:.30, maxInflation=i<2?1.10:1.18;
    if(chord<.12 || length(stroke.points)>chord*maxInflation+1e-9
      || stroke.points.some(p=>segmentDistance(p,a,b)>maxSag+1e-9)) return false;
  }
  for(const i of [2,4,6,8]) {
    const a=strokes[i].points, b=strokes[i+1].points;
    const upper=distance(a[0],a.at(-1)!), lower=distance(b[0],b.at(-1)!);
    if(upper<.35 || lower<.35 || Math.max(upper,lower)>Math.min(upper,lower)*2.5
      || distance(a.at(-1)!,b[0])>1e-6 || jointAngle(a[0],a.at(-1)!,b.at(-1)!)<55) return false;
  }
  return true;
}

/** Prefer an actual straight pen stroke; never use the filler-line detours. */
export function routeFigureSegment(grid: Constraints, a: Point, b: Point, width: number, torso: boolean): Point[] | undefined {
  const chord=distance(a,b);
  if(chord<.12) return undefined;
  for(const bend of [0,.2,-.2,.35,-.35,.5,-.5,.6,-.6]) {
    const points=curve(a,b,bend);
    if(length(points)>chord*(torso?1.10:1.18)
      || points.some(p=>segmentDistance(p,a,b)>(torso?.18:.30))) continue;
    if(grid.safePath(points,width)) return points;
  }
  return undefined;
}
