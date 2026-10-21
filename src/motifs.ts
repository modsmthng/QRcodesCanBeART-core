// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 André Tolksdorf

import type { Motif } from './types.js';
import { Constraints } from './geometry.js';
import { Random } from './random.js';
import { composeFigures } from './figure-motifs.js';
import { composeSymbols } from './symbol-motifs.js';

/** Figures anchor the composition; intact small doodles fill suitable open areas. */
export function composeMotifs(grid: Constraints, rng: Random, trials = 450): Motif[] {
  // Leave deliberate room for other drawings instead of filling every gap with people.
  const figures = composeFigures(grid,rng,trials).sort((a,b)=>a.cost-b.cost).slice(0,grid.size <= 25 ? 3 : 4);
  return [...figures, ...composeSymbols(grid,rng,figures,trials)];
}
