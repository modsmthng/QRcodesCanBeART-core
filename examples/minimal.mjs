// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import { writeFile } from 'node:fs/promises';
import { draw, encode, renderSvg } from '../dist/index.js';

const payload = 'HTTPS://EXAMPLE.COM';
const qr = encode(payload, 'L', 1, 0);
const drawing = draw(qr, 'public-core-qa-0');
const svg = renderSvg(qr, drawing, payload);
const output = process.argv[2] ?? 'qr-art.svg';

await writeFile(output, svg, 'utf8');
process.stdout.write(`Wrote ${output}\n`);
