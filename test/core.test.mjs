// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, encode, renderSvg } from '../dist/index.js';
import { inkAt } from '../dist/geometry.js';
import { figureMotifsConflict } from '../dist/figure-motifs.js';
import { pathClearsFigures } from '../dist/figure-clearance.js';
import { isRigid } from '../dist/qr.js';

function lineFigure(id, start, end, width) {
  return {
    id,
    label: 'test figure',
    category: 'figure',
    head: { x: start, y: 0.5 },
    bounds: [start - 0.15, 0.35, end + 0.15, 0.65],
    covered: [],
    strokes: [{ points: [{ x: start, y: 0.5 }, { x: end, y: 0.5 }], width, kind: 'figure' }],
    circles: [],
    cost: 0,
  };
}

test('encoder honors the requested version and mask for UTF-8 text', () => {
  const qr = encode('Grüße aus Köln 🌍', 'M', 3, 5);
  assert.equal(qr.version, 3);
  assert.equal(qr.mask, 5);
  assert.equal(qr.size, 29);
});

test('seeded drawings reproduce exactly and protect shifted module samples', () => {
  const qr = encode('HTTPS://MYBREWFOLIO.COM', 'L', 1, 3);
  const first = draw(qr, 'geometry-regression', 1000);
  const repeated = draw(qr, 'geometry-regression', 1000);
  const other = draw(qr, 'a-different-composition', 1000);

  assert.ok(first.metrics.figures >= 2);
  assert.equal(first.metrics.centerErrors, 0);
  assert.equal(renderSvg(qr, first, 'payload'), renderSvg(qr, repeated, 'payload'));
  assert.notEqual(renderSvg(qr, first, 'payload'), renderSvg(qr, other, 'payload'));

  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (isRigid(qr, x, y)) continue;
    const expected = qr.getModule(x, y);
    const radius = expected ? 0.12 : 0.18;
    for (let k = 0; k < 16; k++) {
      const point = {
        x: x + 0.5 + Math.cos(k * Math.PI / 8) * radius,
        y: y + 0.5 + Math.sin(k * Math.PI / 8) * radius,
      };
      assert.equal(inkAt(point, first.strokes, first.circles), expected, `Unsafe sample disk: ${x},${y},${k}`);
    }
  }
});

test('figure collision and connector clearance include rendered stroke width', () => {
  assert.equal(figureMotifsConflict(lineFigure(1, 0, 1, 0.36), lineFigure(2, 1.37, 2.37, 0.36)), false);
  assert.equal(figureMotifsConflict(lineFigure(3, 0, 1, 0.41), lineFigure(4, 1.37, 2.37, 0.41)), true);
  assert.equal(pathClearsFigures([{ x: 0.5, y: -1 }, { x: 0.5, y: 2 }], 0.4, [lineFigure(5, 0, 1, 0.4)]), false);
});

test('SVG payload escaping and four-module quiet zone are preserved', () => {
  const qr = encode('scan me', 'L', 1, 2);
  const drawing = draw(qr, 'svg-regression', 1000);
  const payload = '<script>alert("x")</script>&';
  const svg = renderSvg(qr, drawing, payload);

  assert.ok(svg.includes('viewBox="0 0 29 29"'));
  assert.ok(svg.includes('width="29" height="29" fill="white"'));
  assert.ok(svg.includes('transform="translate(4 4)"'));
  assert.ok(svg.includes('<desc>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;</desc>'));
  assert.ok(!svg.includes('<script>'));
});

test('rigid function modules keep their values across all masks and render as square cells', () => {
  const payload = 'structure invariance fixture';
  const codes = Array.from({ length: 8 }, (_, mask) => encode(payload, 'L', 7, mask));
  const reference = codes[0];

  for (let y = 0; y < reference.size; y++) for (let x = 0; x < reference.size; x++) {
    if (!isRigid(reference, x, y)) continue;
    for (const qr of codes) {
      assert.equal(qr.getFunctionModule(x, y), true, `function module moved at ${x},${y}`);
      assert.equal(qr.getModule(x, y), reference.getModule(x, y), `rigid value changed at ${x},${y}`);
    }
  }

  const emptyDrawing = { strokes: [], circles: [], motifs: [], metrics: {
    blackModules: 0, motifModules: 0, isolatedDots: 0, centerErrors: 0, figures: 0, score: 0,
  } };
  let expectedPath = '';
  for (let y = 0; y < reference.size; y++) for (let x = 0; x < reference.size; x++) {
    if (isRigid(reference, x, y) && reference.getModule(x, y)) expectedPath += `M${x} ${y}h1v1h-1z`;
  }
  assert.ok(renderSvg(reference, emptyDrawing, payload).includes(`<path fill="black" d="${expectedPath}"/>`));
});
