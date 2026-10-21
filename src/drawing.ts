// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { qrcodegen } from './vendor/qrcodegen.js';
import type { Drawing, Point, Stroke, Circle } from './types.js';
import { Random } from './random.js';
import { Constraints, distance, length, inkAt, strokeDistance } from './geometry.js';
import { composeMotifs } from './motifs.js';
import { isRigid } from './qr.js';
import { finishStrokes } from './finish-strokes.js';
import { MAX_CONNECTOR_WIDTH, pathClearsFigures } from './figure-clearance.js';

/** Cover remaining data centers with curved paths; no square-data layer is rendered. */
export function draw(qr: qrcodegen.QrCode, seed: string, trials = 450): Drawing {
  const rng = new Random(seed), grid = new Constraints(qr);
  const motifs = composeMotifs(grid, rng, trials);
  const figures = motifs.filter(m=>m.category==='figure');
  const strokes = motifs.flatMap(m => m.strokes), circles = motifs.flatMap(m => m.circles);
  const motifCovered = new Set(grid.covered(strokes, circles));
  const remaining = grid.black.map((_, i) => i).filter(i => !motifCovered.has(i));
  const width = rng.between(.36, MAX_CONNECTOR_WIDTH);
  type Edge = { a: number; b: number; points: Point[]; score: number };
  const edges: Edge[] = [];
  for (let a = 0; a < remaining.length; a++) for (let b = a + 1; b < remaining.length; b++) {
    const ia = remaining[a], ib = remaining[b], p = grid.black[ia], q = grid.black[ib], d = distance(p, q);
    if (d > 2.9) continue;
    const path = grid.route(p, q, width, rng.between(-.35, .35));
    if (!path || !pathClearsFigures(path,width,figures)) continue;
    // Favor diagonals and gently curved connections over a square module lattice.
    const axial = Math.abs(p.x-q.x) < .1 || Math.abs(p.y-q.y) < .1;
    const interference = path.filter((p,i) => i % 3 === 0 && motifs.some(m => m.strokes.some(s => strokeDistance(p,s.points) < (width+s.width)/2+.08))).length;
    // Limbs must remain readable: filler paths cannot run across a figure.
    if (interference) continue;
    edges.push({ a: ia, b: ib, points: path, score: length(path) + (axial ? .18 : 0) + rng.next() * .8 });
  }
  edges.sort((a, b) => a.score - b.score);
  const degree = new Uint8Array(grid.black.length), parent = grid.black.map((_, i) => i), component = new Uint16Array(grid.black.length).fill(1);
  const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const chosen: Edge[] = [];
  for (const edge of edges) {
    const { a, b } = edge, ra = root(a), rb = root(b);
    if (degree[a] >= 2 || degree[b] >= 2) continue;
    if (ra !== rb && component[ra] + component[rb] > 12) continue;
    if (ra === rb && component[ra] < 4) continue;
    degree[a]++; degree[b]++; chosen.push(edge);
    if (ra !== rb) { parent[rb] = ra; component[ra] += component[rb]; }
  }
  // Emit connected trails as single editable SVG strokes.
  const adjacent = new Map<number, number[]>();
  chosen.forEach((e, i) => { for (const n of [e.a, e.b]) adjacent.set(n, [...(adjacent.get(n) ?? []), i]); });
  const visited = new Set<number>();
  const starts = [...remaining.filter(i => degree[i] === 1), ...remaining.filter(i => degree[i] === 2)];
  for (const start of starts) {
    let node = start;
    const points: Point[] = [];
    while (true) {
      const ei = adjacent.get(node)?.find(i => !visited.has(i));
      if (ei === undefined) break;
      visited.add(ei);
      const e = chosen[ei], forward = e.a === node;
      points.push(...(forward ? e.points : [...e.points].reverse()).slice(points.length ? 1 : 0));
      node = forward ? e.b : e.a;
    }
    if (points.length) strokes.push({ points, width, kind: 'connector' });
  }
  const finishing = finishStrokes(grid, strokes, circles, width, rng, motifs);
  // Finishing can reshape a local span without losing any previous sample.
  // Report the actual motif coverage and bounds, not the pre-cleanup placement.
  for (const motif of motifs) {
    motif.covered = grid.covered(motif.strokes, motif.circles);
    for (const stroke of motif.strokes) for (const p of stroke.points) {
      motif.bounds[0] = Math.min(motif.bounds[0],p.x-stroke.width/2);
      motif.bounds[1] = Math.min(motif.bounds[1],p.y-stroke.width/2);
      motif.bounds[2] = Math.max(motif.bounds[2],p.x+stroke.width/2);
      motif.bounds[3] = Math.max(motif.bounds[3],p.y+stroke.width/2);
    }
  }
  const actualMotifModules = new Set(motifs.flatMap(m=>m.covered)).size;
  let centerErrors = 0;
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (!isRigid(qr,x,y) && inkAt({x:x+.5,y:y+.5}, strokes, circles) !== qr.getModule(x,y)) centerErrors++;
  }
  const { isolatedDots, isolatedStrokes } = finishing;
  const figureCount = figures.length;
  const symbols = motifs.length - figureCount;
  const symbolKinds = [...new Set(motifs.filter(m => m.category === 'symbol').map(m => m.label))];
  return { strokes, circles, motifs, metrics: { blackModules: grid.black.length, motifModules: actualMotifModules, ...finishing, centerErrors, figures:figureCount, symbols, symbolKinds, score: figureCount * 24 + symbols * 12 + symbolKinds.length * 5 + actualMotifModules * .35 - (isolatedDots + isolatedStrokes) * 4 - strokes.filter(s=>s.kind==='connector').length * .8 - (qr.version-1) * 3 } };
}

export const escapeXml = (s: string): string => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const n = (x: number) => +x.toFixed(4);

export function renderSvg(qr: qrcodegen.QrCode, drawing: Drawing, payload: string, debug = false): string {
  const size = qr.size + 8;
  const paths = drawing.strokes.map(s => `<path d="${s.points.map((p,i) => `${i?'L':'M'}${n(p.x)} ${n(p.y)}`).join(' ')}" fill="none" stroke="black" stroke-width="${n(s.width)}" stroke-linecap="round" stroke-linejoin="round" data-kind="${s.kind}"/>`).join('\n');
  const circles = drawing.circles.map(c => `<circle cx="${n(c.center.x)}" cy="${n(c.center.y)}" r="${n(c.radius)}" fill="${c.filled?'black':'none'}" stroke="black" stroke-width="${c.filled?0:n(c.width)}" data-kind="${c.kind}"/>`).join('\n');
  let functions = '';
  for (let y=0;y<qr.size;y++) for (let x=0;x<qr.size;x++) if(isRigid(qr,x,y)&&qr.getModule(x,y)) functions += `M${x} ${y}h1v1h-1z`;
  let overlay='';
  if(debug) for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(!qr.getFunctionModule(x,y))overlay+=`<circle cx="${x+.5}" cy="${y+.5}" r=".12" fill="${qr.getModule(x,y)?'#ef3f42':'#19a6b2'}"/>`;
  // One compound path avoids seams and forced pixel snapping between finder cells.
  // crispEdges moved the apparent finder centers at particular small export sizes.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024" role="img"><title>QRcodesCanBeART</title><desc>${escapeXml(payload)}</desc><rect width="${size}" height="${size}" fill="white"/><g transform="translate(4 4)">${paths}${circles}<path fill="black" d="${functions}"/>${overlay}</g></svg>`;
}

export function standardSvg(qr: qrcodegen.QrCode): string {
  let cells='';for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))cells+=`M${x+4},${y+4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${qr.size+8} ${qr.size+8}"><rect width="100%" height="100%" fill="white"/><path d="${cells}" fill="black"/></svg>`;
}
