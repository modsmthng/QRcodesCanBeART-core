// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { Motif, Point } from './types.js';
import { Constraints, distance, segmentDistance, strokeDistance } from './geometry.js';
import { absorbJoint, absorbSample } from './line-cleanup.js';
import { figureShapeIsCalm } from './figure-shape.js';

/** Visible white space between a figure and unrelated ink, in QR modules. */
export const FIGURE_INK_GAP = .08;
export const MAX_CONNECTOR_WIDTH = .42;

function segmentsTooClose(a: Point, b: Point, c: Point, d: Point, gap: number): boolean {
  if (Math.max(a.x,b.x)+gap < Math.min(c.x,d.x) || Math.max(c.x,d.x)+gap < Math.min(a.x,b.x)
    || Math.max(a.y,b.y)+gap < Math.min(c.y,d.y) || Math.max(c.y,d.y)+gap < Math.min(a.y,b.y)) return false;
  const cross = (p: Point, q: Point, r: Point) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const overlap = Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)) <= Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))
    && Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)) <= Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));
  if (overlap && cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0) return true;
  return Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b)) < gap;
}

/** Test the full rendered segments/caps, including crossings between vertices. */
export function pathClearsFigures(points: Point[], width: number, figures: Motif[]): boolean {
  return figures.every(figure => figure.strokes.every(stroke => {
    const gap=(width+stroke.width)/2+FIGURE_INK_GAP;
    for(let i=1;i<points.length;i++) for(let j=1;j<stroke.points.length;j++) {
      if(segmentsTooClose(points[i-1],points[i],stroke.points[j-1],stroke.points[j],gap)) return false;
    }
    return true;
  }) && figure.circles.every(head => strokeDistance(head.center,points) >= head.radius
    +(head.filled?0:head.width/2)+width/2+FIGURE_INK_GAP));
}

export function pointClearsFigures(point: Point, radius: number, figures: Motif[]): boolean {
  return figures.every(figure => figure.strokes.every(stroke => strokeDistance(point,stroke.points) >= stroke.width/2+radius+FIGURE_INK_GAP)
    && figure.circles.every(head => distance(point,head.center) >= head.radius+(head.filled?0:head.width/2)+radius+FIGURE_INK_GAP));
}

/** Fit only the original segments; reject placements that would force attached ink.
 * Mutates this unselected candidate only. Accepted figures are frozen by finishing. */
export function fitFigureSamplesWithoutBranches(grid: Constraints, figure: Motif): boolean {
  let covered=new Set(figure.covered);
  const calm = (strokes: Motif['strokes']) => figureShapeIsCalm(strokes)
    && strokes.every((stroke,i) => i===0 || stroke.points.every(point=>figure.circles.every(head=>distance(point,head.center)>=head.radius+stroke.width*.4)));
  for(const [i,point] of grid.black.entries()) {
    if(covered.has(i) || pointClearsFigures(point,MAX_CONNECTOR_WIDTH*.60,[figure])) continue;
    // Fit nearby data into the original ten body segments, never attach a new one.
    const joint=absorbJoint(grid,figure.strokes,point,()=>true);
    const jointStrokes=joint && figure.strokes.map(stroke=>({...stroke,points:joint.find(change=>change.stroke===stroke)?.points??stroke.points}));
    if(jointStrokes && calm(jointStrokes)) figure.strokes=jointStrokes;
    else {
      let fitted=false;
      for(const stroke of [...figure.strokes].sort((a,b)=>strokeDistance(point,a.points)-strokeDistance(point,b.points))) {
        if(strokeDistance(point,stroke.points)>.65) continue;
        const points=absorbSample(grid,stroke,point,()=>true);
        if(!points) continue;
        const changed=figure.strokes.map(s=>s===stroke?{...s,points}:s);
        if(!calm(changed)) continue;
        figure.strokes=changed; fitted=true; break;
      }
      if(!fitted) return false;
    }
    figure.covered=grid.covered(figure.strokes,figure.circles);
    covered=new Set(figure.covered);
  }
  return grid.black.every((point,i) => covered.has(i) || pointClearsFigures(point,MAX_CONNECTOR_WIDTH*.60,[figure]));
}
