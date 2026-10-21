# QRcodesCanBeART Core

A TypeScript core for encoding one QR configuration, drawing deterministic figure-and-line geometry from its modules, and rendering that drawing as SVG.

See the artwork in use at [qrcodescanbeart.com](https://qrcodescanbeart.com/).

Developed by André Tolksdorf ([modsmthng](https://github.com/modsmthng)).

[Public source repository](https://github.com/modsmthng/QRcodesCanBeART-core) · Release **0.1.0** · 2026-10-21

This release carries geometry derived from the QRcodesCanBeART drawing algorithm version 0.2.3.

## Quick start

Requires Node.js 22.12 or newer. From a clone of this repository:

```sh
npm ci
npm run example
```

The example builds the TypeScript source and writes `qr-art.svg` to the current directory. The same steps in code are:

```js
import { writeFile } from 'node:fs/promises';
import { draw, encode, renderSvg } from './dist/index.js';

const payload = 'HTTPS://EXAMPLE.COM';
const qr = encode(payload, 'L', 1, 0);
const drawing = draw(qr, 'public-core-qa-0');
const svg = renderSvg(qr, drawing, payload);
await writeFile('qr-art.svg', svg, 'utf8');
```

`encode` takes the payload, error-correction level (`L`, `M`, `Q`, or `H`), QR version, and mask explicitly. `draw` takes the encoded QR and a seed; the same inputs and seed produce the same geometry. `renderSvg` returns the SVG string.

## What it does

- Encodes a single, explicitly configured QR symbol.
- Draws QR data as figure, symbol, and connector geometry; it does not place an ordinary square data layer beneath the art.
- Applies geometric clearance constraints around white module samples. Finder, separator, timing, alignment, and version patterns remain square.
- Renders the result with a white background and four-module quiet zone.

This repository contains only the encoder, deterministic drawing geometry, and SVG renderer. It does not include candidate search or QArt optimization, decoding or scan validation, replay and other.

The geometry constraints are not a scan guarantee. Some explicit QR settings and drawings may not decode, and this package does not test its output. Independently validate each rendered design with the decoders, devices, sizes, and print or display conditions that matter to your use.

## Inspiration

The creative inspiration for this project came from [this YouTube video](https://www.youtube.com/watch?v=RYqX8CNgzwM).

## Development

AI tools assisted with extracting this core and preparing its documentation. The extracted geometry was checked against the original implementation and tested with automated checks.

```sh
npm run build
npm run check
npm test
```

## Licensing and related work

The project code is licensed under [Apache-2.0](LICENSE). The vendored Nayuki QR Code generator retains its MIT license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Russ Cox's [QArt Codes](https://research.swtch.com/qart) are cited as conceptual related work only; no QArt implementation code is included here.
