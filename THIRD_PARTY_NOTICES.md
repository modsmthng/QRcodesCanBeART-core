# Third-party notices

## Project Nayuki QR Code generator

The encoder in `src/vendor/qrcodegen.ts` is from [Project Nayuki's QR Code generator](https://github.com/nayuki/QR-Code-generator). Its original MIT license notice is retained in the source file.

Upstream source: [qrcodegen.ts](https://raw.githubusercontent.com/nayuki/QR-Code-generator/3c6d0b3cefb4e049dc337e82237c9644399716a8/typescript-javascript/qrcodegen.ts) at commit `3c6d0b3cefb4e049dc337e82237c9644399716a8`  
Upstream SHA-256: `1dc03fb5a10e0e2318ea162755bbdb9977ca6ce52cff959e9c9b6deafdccda9c`  
Local changes: ES module export and read-only encoding diagnostics; see the marked additions in the vendored source.

```text
Copyright (c) Project Nayuki. (MIT License)
https://www.nayuki.io/page/qr-code-generator-library

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Related work

[Russ Cox's QArt Codes](https://research.swtch.com/qart) are cited as conceptual related work. No QArt implementation code, including `qart.ts`, is included in this repository.
