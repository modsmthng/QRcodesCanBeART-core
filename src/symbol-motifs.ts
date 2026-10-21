// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { Motif, Point, Stroke } from './types.js';
import { Constraints, distance, lerp, strokeDistance } from './geometry.js';
import { Random } from './random.js';
import { isRigid } from './qr.js';
import { pathClearsFigures } from './figure-clearance.js';

type XY = readonly [number, number];
type Template = { label: string; paths: readonly (readonly XY[])[]; weight: number };

// Slightly irregular proportions read like a small pen sketch and allow the
// tips to land on sampling points without deforming the star after placement.
const star: XY[] = [[0,-2],[.5,-.5],[2,-.5],[1,.5],[1.5,2],[0,1],[-1.5,2],[-1,.5],[-2,-.5],[-.5,-.5],[0,-2]];
const roundStar: XY[] = Array.from({length:11},(_,i)=>{
  const angle=-Math.PI/2+i*Math.PI/5,r=i%2?.78:1.8;
  return [Math.cos(angle)*r,Math.sin(angle)*r];
});

// Complete silhouettes, not arbitrary paths renamed as symbols. The template is
// only rotated/scaled/translated; an unsafe shape is discarded rather than bent
// until it stops being recognizable. Each selected motif carries at least three QR sample points.
const templates: readonly Template[] = [
  { label: 'Stern', paths: [star], weight: 2.5 },
  { label: 'Stern', paths: [roundStar], weight: 2.5 },
  { label: 'Funkelstern', paths: [[[0,-2],[.5,-.5],[2,0],[.5,.5],[0,2],[-.5,.5],[-2,0],[-.5,-.5],[0,-2]]], weight: 2 },
  { label: 'Funkeln', paths: [[[0,-1.5],[0,1.5]], [[-1.5,0],[1.5,0]], [[-.75,-.75],[.75,.75]], [[-.75,.75],[.75,-.75]]], weight: .5 },
  { label: 'Blitz', paths: [[[.75,-1.5],[-.7,0],[.7,0],[-.75,1.5]]], weight: 2 },
  { label: 'Herz', paths: [[
    [0,-.65],[-.35,-1.05],[-.8,-1.15],[-1.2,-1],[-1.45,-.6],[-1.4,-.1],[-1.1,.4],[0,1.5],
    [1.1,.4],[1.4,-.1],[1.45,-.6],[1.2,-1],[.8,-1.15],[.35,-1.05],[0,-.65],
  ]], weight: 2 },
  { label: 'Blatt', paths: [[[-1,1.5],[-1.05,.75],[-.95,0],[-.55,-.7],[.2,-1.2],[1,-1.5],[1.05,-.75],[.95,0],[.55,.7],[-.2,1.2],[-1,1.5]], [[-1,1.5],[1,-1.5]]], weight: 1 },
];

function samplePath(vertices: Point[]): Point[] {
  const points = [vertices[0]];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i-1], b = vertices[i], steps = Math.max(1, Math.ceil(distance(a,b) / .08));
    for (let j = 1; j <= steps; j++) points.push(lerp(a,b,j/steps));
  }
  return points;
}

function overlaps(bounds: Motif['bounds'], other: Motif, gap = .15): boolean {
  return Math.min(bounds[2],other.bounds[2]) + gap > Math.max(bounds[0],other.bounds[0])
    && Math.min(bounds[3],other.bounds[3]) + gap > Math.max(bounds[1],other.bounds[1]);
}

type Stamp = { label: string; weight: number; strokes: Stroke[]; bounds: Motif['bounds']; required: XY[]; covered: XY[] };
const WIDTH = .36;
let stamps: Stamp[] | undefined;

/** Cache the finite silhouette library once per worker, never the user's QR data. */
function silhouetteStamps(): Stamp[] {
  if (stamps) return stamps;
  stamps = [];
  for (const template of templates) for (const scale of [.8, 1, 1.2, 1.4]) {
    for (const angle of [0,-.18,.18,-.4,.4,Math.PI/2,-Math.PI/2]) for (const dx of [0,.5]) for (const dy of [0,.5]) {
      const sin=Math.sin(angle),cos=Math.cos(angle);
      const transform=([x,y]: XY): Point=>({x:dx+(x*cos-y*sin)*scale,y:dy+(x*sin+y*cos)*scale});
      const strokes: Stroke[]=template.paths.map(path=>({points:samplePath(path.map(transform)),width:WIDTH,kind:'symbol'}));
      const points=strokes.flatMap(s=>s.points);
      const bounds: Motif['bounds']=[Math.min(...points.map(p=>p.x))-WIDTH/2,Math.min(...points.map(p=>p.y))-WIDTH/2,Math.max(...points.map(p=>p.x))+WIDTH/2,Math.max(...points.map(p=>p.y))+WIDTH/2];
      const required: XY[]=[],covered: XY[]=[];
      for(let y=Math.floor(bounds[1])-1;y<=Math.ceil(bounds[3])+1;y++) for(let x=Math.floor(bounds[0])-1;x<=Math.ceil(bounds[2])+1;x++) {
        const d=Math.min(...strokes.map(s=>strokeDistance({x:x+.5,y:y+.5},s.points)));
        if(d < WIDTH/2+.014+.20) required.push([x,y]);
        if(d < WIDTH/2-.13) covered.push([x,y]);
      }
      if(covered.length>=3) stamps.push({label:template.label,weight:template.weight,strokes,bounds,required,covered});
    }
  }
  return stamps;
}

/** Fit a small, diverse set of intact doodles in the space left by the figures. */
export function composeSymbols(grid: Constraints, rng: Random, figures: Motif[], trials = 1200): Motif[] {
  const candidates: Motif[]=[];
  // A finite, seed-shuffled library is matched against the actual raster. The
  // footprint test skips impossible placements; unchanged geometric checks are
  // still the final authority, including whole protected function cells.
  const library=rng.shuffle(silhouetteStamps());
  for (const stamp of library) {
    const [ax,ay]=stamp.covered[0];
    for(const anchor of grid.black) {
      const x=anchor.x-.5-ax,y=anchor.y-.5-ay;
      const bounds: Motif['bounds']=[stamp.bounds[0]+x,stamp.bounds[1]+y,stamp.bounds[2]+x,stamp.bounds[3]+y];
      if(bounds[0]<0||bounds[1]<0||bounds[2]>grid.size||bounds[3]>grid.size) continue;
      if(figures.some(figure=>overlaps(bounds,figure))) continue;
      if(!stamp.required.every(([cx,cy])=>grid.qr.getModule(x+cx,y+cy)&&!isRigid(grid.qr,x+cx,y+cy))) continue;
      const strokes=stamp.strokes.map(s=>({...s,points:s.points.map(p=>({x:p.x+x,y:p.y+y}))}));
      if(!strokes.every(s=>grid.safePath(s.points,s.width))) continue;
      if(!strokes.every(s=>pathClearsFigures(s.points,s.width,figures))) continue;
      const covered=grid.covered(strokes,[]);
      if(covered.length<3) continue;
      // Keep repeated geometric placements out of the selection pool.
      if(candidates.some(c=>c.label===stamp.label&&c.covered.length===covered.length&&c.covered.every((v,i)=>v===covered[i]))) continue;
      candidates.push({id:trials+candidates.length,category:'symbol',label:stamp.label,head:{x:(bounds[0]+bounds[2])/2,y:(bounds[1]+bounds[3])/2},bounds,covered,strokes,circles:[],cost:-covered.length*.8-stamp.weight+rng.next()*.4});
    }
  }
  const selected: Motif[]=[],counts=new Map<string,number>();
  const limit=grid.size<=21?4:grid.size<=29?6:8;
  while(selected.length<limit) {
    candidates.sort((a,b)=>a.cost+(counts.get(a.label)??0)*4-b.cost-(counts.get(b.label)??0)*4||a.id-b.id);
    const candidate=candidates.shift();
    if(!candidate) break;
    if(selected.some(other=>overlaps(candidate.bounds,other)||candidate.covered.some(i=>other.covered.includes(i)))) continue;
    selected.push(candidate);
    counts.set(candidate.label,(counts.get(candidate.label)??0)+1);
  }
  return selected;
}
