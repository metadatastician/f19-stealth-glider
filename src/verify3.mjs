// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { mkGrid, step, stamp, live, pop, norm, xf, gliderTables, P, findGlider, clusters } from './engine.mjs';

const T = gliderTables();

// cumulative deltas from phase 0 for a heading
function cumDeltas(hk) {
  const d = T[hk].deltas, out = [[0, 0]];
  for (let p = 0; p < 3; p++) out.push([out[p][0] + d[p][0], out[p][1] + d[p][1]]);
  return out;
}
const CUM = Object.fromEntries(Object.keys(T).map(hk => [hk, cumDeltas(hk)]));
console.log('cum deltas:', JSON.stringify(CUM));

// physical lane: normalize anchor to phase-0 equivalent, then diagonal invariant
function laneOf(hk, ax, ay, p) {
  const [cx, cy] = CUM[hk][p];
  const x = ax - cx, y = ay - cy;
  const [sx, sy] = hk.split(',').map(Number);
  return sx * sy > 0 ? x - y : x + y; // SE/NW: x-y ; NE/SW: x+y
}

// verify invariance in flight for all headings
for (const hk of Object.keys(T)) {
  const W = 40, H = 40;
  let a = mkGrid(W, H), b = mkGrid(W, H);
  stamp(a, W, T[hk].shapes[0], 18, 18);
  let anchor = [18, 18], phase = 0;
  const L0 = laneOf(hk, 18, 18, 0);
  let ok = true;
  for (let t = 0; t < 12; t++) {
    const d = T[hk].deltas[phase];
    anchor = [anchor[0] + d[0], anchor[1] + d[1]];
    phase = (phase + 1) % 4;
    step(a, b, W, H); [a, b] = [b, a];
    const n = norm(live(a, W, H));
    if (n.ox !== anchor[0] || n.oy !== anchor[1]) ok = false;
    if (laneOf(hk, anchor[0], anchor[1], phase) !== L0) ok = false;
  }
  console.log('heading', hk, 'kinematics+lane invariant:', ok);
}

// --- outcome sweep: SE glider vs sym-4 eater at (24,24), glider anchor (4+u, 4) ---
const W = 64, H = 64;
const E4 = xf(P.eater1, 4);
function classify(grid, eaterCells, ex, ey) {
  const cs = live(grid, W, H);
  if (cs.length === 0) return 'BOTH_DIE';
  const eset = new Set(eaterCells.map(([x, y]) => `${x + ex},${y + ey}`));
  const eaterIntact = [...eset].every(k => cs.some(([x, y]) => `${x},${y}` === k));
  const extra = cs.filter(([x, y]) => !eset.has(`${x},${y}`));
  if (eaterIntact && extra.length === 0) return 'CLEAN';
  if (eaterIntact) {
    const tmp = mkGrid(W, H); for (const [x, y] of extra) tmp[y * W + x] = 1;
    const cc = clusters(tmp, W, H);
    if (cc.length === 1 && cc[0].length === 5 && findGlider(tmp, W, H, T, 0, 0, W, H)) return 'PASS';
    return 'DEBRIS';
  }
  return 'EATER_LOST';
}
const G = T['1,1'].shapes[0];
console.log('SE glider lane sweep vs eater sym4 @(24,24)  (u = anchor-lane offset):');
for (let u = -7; u <= 7; u++) {
  let a = mkGrid(W, H), b = mkGrid(W, H);
  // co-shifted by +8 (glider 4->12, eater 24->32) so u=-7 stays in bounds;
  // relative approach lane u is unchanged (translation invariance).
  stamp(a, W, G, 12 + u, 12); stamp(a, W, E4, 32, 32);
  for (let t = 0; t < 170; t++) { step(a, b, W, H); [a, b] = [b, a]; }
  console.log('  u=' + String(u).padStart(2), classify(a, E4, 32, 32));
}

// --- NE-catch search: NE glider from bottom-left going up-right ---
const GNE = T['1,-1'].shapes[0];
const found = {};
for (let sym = 0; sym < 8; sym++) {
  const E = xf(P.eater1, sym);
  for (let ex = 14; ex <= 34; ex++) for (let ey = 4; ey <= 26; ey++) {
    let a = mkGrid(W, H), b = mkGrid(W, H);
    stamp(a, W, GNE, 4, 40); stamp(a, W, E, ex, ey);
    for (let t = 0; t < 170; t++) { step(a, b, W, H); [a, b] = [b, a]; }
    if (classify(a, E, ex, ey) === 'CLEAN') {
      const lane = laneOf('1,-1', 4, 40, 0); // glider physical lane
      (found[sym] ||= []).push([ex, ey, (ex + ey) - lane]);
    }
  }
}
for (const sym of Object.keys(found)) {
  const rel = [...new Set(found[sym].map(r => r[2]))];
  console.log('NE-catch sym', sym, 'placements:', found[sym].length, 'eaterAnchorSum-minus-gliderLane:', rel.join(','));
}

// --- gun + absorber integration ---
{
  const W2 = 150, H2 = 130;
  let a = mkGrid(W2, H2), b = mkGrid(W2, H2);
  stamp(a, W2, P.gun, 2, 2);
  // find one emitted glider to get the stream's physical lane
  for (let t = 0; t < 80; t++) { step(a, b, W2, H2); [a, b] = [b, a]; }
  const g = findGlider(a, W2, H2, T, 20, 14, 100, 80);
  console.log('stream glider sample:', JSON.stringify(g));
  const Ls = laneOf(g.heading.join(','), g.ox, g.oy, g.phase);
  console.log('stream physical lane (x-y):', Ls);
  // absorber: sym4 eater, anchor on lane Ls, far downstream
  const ey = 100, ex = ey + Ls;
  let a2 = mkGrid(W2, H2), b2 = mkGrid(W2, H2);
  stamp(a2, W2, P.gun, 2, 2);
  stamp(a2, W2, E4, ex, ey);
  let maxPop = 0, minPop = Infinity;
  for (let t = 0; t < 1200; t++) {
    step(a2, b2, W2, H2); [a2, b2] = [b2, a2];
    if (t > 600) { const p = pop(a2); maxPop = Math.max(maxPop, p); minPop = Math.min(minPop, p); }
  }
  console.log('gun+absorber @(' + ex + ',' + ey + ') pop range after settling:', minPop, '-', maxPop);
  // audit: everything outside gun box is either eater (intact) or an isolated glider on lane Ls
  const inGunBox = (x, y) => x >= 0 && x < 40 && y >= 0 && y < 13;
  const eset = new Set(E4.map(([x, y]) => `${x + ex},${y + ey}`));
  const cs = clusters(a2, W2, H2).filter(c => !c.some(([x, y]) => inGunBox(x, y)));
  let audit = true;
  for (const c of cs) {
    if (c.every(([x, y]) => eset.has(`${x},${y}`)) && c.length === 7) continue;
    const n = norm(c);
    const gl = findGlider(a2, W2, H2, T, n.ox, n.oy, n.ox, n.oy);
    if (!gl || laneOf(gl.heading.join(','), gl.ox, gl.oy, gl.phase) !== Ls) { audit = false; console.log('  audit fail: cluster', c.length, 'cells at', n.ox, n.oy); }
  }
  console.log('world audit (only eater + in-flight stream gliders):', audit, '| free clusters:', cs.length);
}
