// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { mkGrid, step, stamp, live, pop, xf, P } from './engine.mjs';
import { T } from './mission.mjs';

// Lone gun + lone NE-crossing glider. For each launch offset t0 in [0,30):
// does the glider cross lane 14 with every cell at Chebyshev >= 3 from every
// stream cell at every generation (i.e. provably zero interaction)?
const W = 160, H = 130;

function streamWorld(t) {
  // settled gun+absorber world, stepped 600+t generations
  let a = mkGrid(W, H), b = mkGrid(W, H);
  stamp(a, W, P.gun, 2, 2);
  stamp(a, W, xf(P.eater1, 4), 128, 114); // absorber on lane 14, far downstream
  for (let i = 0; i < 600 + t; i++) { step(a, b, W, H); [a, b] = [b, a]; }
  return { a, b };
}

// player kinematics only (heading NE from below), overlay; check min distance to world each gen
let results = [];
for (let t0 = 0; t0 < 30; t0++) {
  const w = streamWorld(t0);
  let a = w.a, b = w.b;
  let anchor = [70, 120], phase = 0; // NE from deep south, lane x+y = 190; crosses lane 14 at (102,88)
  let minD = Infinity, contactT = -1;
  for (let t = 0; t < 260; t++) {
    // player cells
    const cells = T['1,-1'].shapes[phase].map(([x, y]) => [x + anchor[0], y + anchor[1]]);
    // distance to any live world cell within a local window
    for (const [px, py] of cells) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (a[ny * W + nx]) { const d = Math.max(Math.abs(dx), Math.abs(dy)); if (d < minD) { minD = d; if (d <= 2 && contactT < 0) contactT = t; } }
      }
    }
    const d = T['1,-1'].deltas[phase];
    anchor = [anchor[0] + d[0], anchor[1] + d[1]]; phase = (phase + 1) % 4;
    step(a, b, W, H); [a, b] = [b, a];
    if (anchor[1] < 40) break; // well past the lane
  }
  results.push([t0, minD, contactT]);
}
console.log('NE glider vs bare p30 stream — min Chebyshev during crossing, per launch phase:');
for (const [t0, minD, ct] of results) console.log('  t0=' + String(t0).padStart(2), 'minDist', minD, ct >= 0 ? ('contact@t=' + ct) : 'CLEAN');
const clean = results.filter(r => r[1] >= 3).length;
console.log('clean crossings:', clean, '/ 30');
