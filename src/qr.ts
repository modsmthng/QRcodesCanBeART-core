// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import { qrcodegen } from './vendor/qrcodegen.js';
import type { EccLevel } from './types.js';

const ECC = {
  L: qrcodegen.QrCode.Ecc.LOW,
  M: qrcodegen.QrCode.Ecc.MEDIUM,
  Q: qrcodegen.QrCode.Ecc.QUARTILE,
  H: qrcodegen.QrCode.Ecc.HIGH,
};

const rigidCache = new WeakMap<qrcodegen.QrCode, Uint8Array>();

/** Encode text exactly at a fixed QR version and mask. */
export function encode(payload: string, ecc: EccLevel, version: number, mask: number): qrcodegen.QrCode {
  return qrcodegen.QrCode.encodeSegments(segments(payload), ECC[ecc], version, version, mask, false);
}

function segments(text: string): qrcodegen.QrSegment[] {
  if (/[^\x00-\x7f]/.test(text)) {
    return [
      qrcodegen.QrSegment.makeEci(26),
      qrcodegen.QrSegment.makeBytes([...new TextEncoder().encode(text)]),
    ];
  }
  return qrcodegen.QrSegment.makeSegments(text);
}

/** Finder, separator, timing, alignment and version cells stay square. */
export function isRigid(qr: qrcodegen.QrCode, x: number, y: number): boolean {
  let map = rigidCache.get(qr);
  if (!map) {
    map = Uint8Array.from({length:qr.size**2},(_,i)=>+qr.getFunctionModule(i%qr.size,Math.floor(i/qr.size)));
    const clear=(x:number,y:number)=>{map![y*qr.size+x]=0;};
    for(let i=0;i<=5;i++)clear(8,i);
    clear(8,7);clear(8,8);clear(7,8);
    for(let i=9;i<15;i++)clear(14-i,8);
    for(let i=0;i<8;i++)clear(qr.size-1-i,8);
    for(let i=8;i<15;i++)clear(8,qr.size-15+i);
    rigidCache.set(qr,map);
  }
  return !!map[y*qr.size+x];
}
