// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { mkGrid, step, stamp, live, pop, norm, key, xf, gliderTables, P, findGlider, clusters } from './engine.mjs';

const T = gliderTables();
const W = 44, H = 44;

function runVs(gliderCells, gx, gy, eaterCells, ex, ey, gens) {
  let a = mkGrid(W, H), b = mkGrid(W, H);
  stamp(a, W, gliderCells, gx, gy);
  stamp(a, W, eaterCells, ex, ey);
  for (let t = 0; t < gens; t++) { step(a, b, W, H); [a, b] = [b, a]; }
  return a;
}

function classify(grid, eaterCells, ex, ey) {
  const cs = live(grid, W, H);
  const eset = new Set(eaterCells.map(([x, y]) => `${x + ex},${y + ey}`));
  const gset = new Set(cs.map(([x, y]) => `${x},${y}`));
  const eaterIntact = [...eset].every(k => gset.has(k));
  const extra = cs.filter(([x, y]) => !eset.has(`${x},${y}`));
  if (cs.length === 0) return 'BOTH_DIE';
  if (eaterIntact && extra.length === 0) return 'CLEAN';
  if (eaterIntact && extra.length > 0) {
    // is the extra stuff exactly one isolated glider? then PASS/BOUNCE
    const g = findGlider(grid, W, H, T, 0, 0, W, H);
    // findGlider may match... check extra alone forms glider: brute — count clusters of extra
    const tmp = mkGrid(W, H); for (const [x, y] of extra) tmp[y * W + x] = 1;
    const cc = clusters(tmp, W, H);
    if (cc.length === 1 && cc[0].length === 5 && g) return 'PASS';
    return 'DEBRIS';
  }
  return 'EATER_LOST';
}

// --- search clean catches: SE glider fixed, eater1 in all 8 syms across offset window ---
const G = T['1,1'].shapes[0]; // SE glider phase 0
const results = {};
for (let sym = 0; sym < 8; sym++) {
  const E = xf(P.eater1, sym);
  for (let ex = 14; ex <= 34; ex++) for (let ey = 14; ey <= 34; ey++) {
    const g = runVs(G, 4, 4, E, ex, ey, 150);
    if (classify(g, E, ex, ey) === 'CLEAN') {
      const lane = (ex - ey) - (4 - 4); // relative diagonal lane of eater anchor vs glider anchor
      (results[sym] ||= []).push([ex, ey, lane]);
    }
  }
}
for (const sym of Object.keys(results)) {
  const lanes = [...new Set(results[sym].map(r => r[2]))].sort((a, b) => a - b);
  console.log('sym', sym, 'clean placements:', results[sym].length, 'anchor-lanes:', lanes.join(','), 'sample:', JSON.stringify(results[sym].slice(0, 3)));
}
