// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

export type EccLevel = 'L' | 'M' | 'Q' | 'H';
export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; width: number; kind: 'figure' | 'connector' | 'symbol' };
export type Circle = { center: Point; radius: number; width: number; filled: boolean; kind: 'head' | 'dot' };
export type Motif = {
  id: number;
  label: string;
  category?: 'figure' | 'symbol';
  head: Point;
  bounds: [number, number, number, number];
  covered: number[];
  strokes: Stroke[];
  circles: Circle[];
  cost: number;
};
export interface Drawing {
  strokes: Stroke[];
  circles: Circle[];
  motifs: Motif[];
  metrics: {
    blackModules: number;
    motifModules: number;
    isolatedDots: number;
    isolatedStrokes?: number;
    joinedModules?: number;
    absorbedModules?: number;
    centerErrors: number;
    figures: number;
    symbols?: number;
    symbolKinds?: string[];
    score: number;
  };
}
