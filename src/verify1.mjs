// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { mkGrid, step, stamp, live, pop, clusters, norm, key, gliderTables, P, findGlider } from './engine.mjs';

// 1) Glider tables
const T = gliderTables();
console.log('GLIDER OK: 4 headings derived');
for (const hk of Object.keys(T)) console.log(' heading', hk, 'deltas', JSON.stringify(T[hk].deltas));

// 2) Gun: period + direction
const W = 160, H = 120;
let a = mkGrid(W, H), b = mkGrid(W, H);
const GX = 2, GY = 2;
stamp(a, W, P.gun, GX, GY);
console.log('gun cells:', P.gun.length);
let gw = 0, gh = 0; for (const [x, y] of P.gun) { gw = Math.max(gw, x + 1); gh = Math.max(gh, y + 1); }
console.log('gun bbox:', gw, 'x', gh);

const inGunBox = (x, y) => x >= GX - 2 && x < GX + gw + 2 && y >= GY - 2 && y < GY + gh + 2;
const emitted = []; // track first glider found outside box over time
for (let t = 0; t <= 200; t++) {
  if (t % 10 === 0) {
    const cs = clusters(a, W, H).filter(c => !c.some(([x, y]) => inGunBox(x, y)));
    if (cs.length) {
      // centroid of the oldest (farthest) cluster
      const far = cs.reduce((p, c) => cx(c) + cy2(c) > cx(p) + cy2(p) ? c : p, cs[0]);
      emitted.push([t, cx(far).toFixed(1), cy2(far).toFixed(1), cs.length]);
    }
  }
  step(a, b, W, H); [a, b] = [b, a];
}
function cx(c) { return c.reduce((s, p) => s + p[0], 0) / c.length; }
function cy2(c) { return c.reduce((s, p) => s + p[1], 0) / c.length; }
console.log('t, farthest-glider centroid x,y, #free clusters:');
for (const e of emitted) console.log(' ', e.join('  '));

// count clusters at t=200 & verify each free cluster is a glider
const free = clusters(a, W, H).filter(c => !c.some(([x, y]) => inGunBox(x, y)));
console.log('free clusters at t=200:', free.length);
let allG = true;
for (const c of free) {
  const n = norm(c);
  let bw = 0, bh = 0; for (const [x, y] of n.cells) { bw = Math.max(bw, x + 1); bh = Math.max(bh, y + 1); }
  const g = findGlider(a, W, H, T, n.ox - 1, n.oy - 1, n.ox + 1, n.oy + 1);
  if (!g) { allG = false; console.log('  non-glider cluster at', n.ox, n.oy, 'size', c.length); }
}
console.log('all free clusters are isolated gliders:', allG);

// period: population sequence — count emissions via free-cluster count over time
let a2 = mkGrid(W, H), b2 = mkGrid(W, H);
stamp(a2, W, P.gun, GX, GY);
const counts = [];
for (let t = 0; t <= 240; t++) {
  const n = clusters(a2, W, H).filter(c => !c.some(([x, y]) => inGunBox(x, y))).length;
  counts.push(n);
  step(a2, b2, W, H); [a2, b2] = [b2, a2];
}
// find t of each first-appearance increment
const births = [];
for (let t = 1; t < counts.length; t++) if (counts[t] > counts[t - 1]) births.push(t);
console.log('free-cluster increments at t =', births.join(', '));
const gaps = births.slice(1).map((t, i) => t - births[i]);
console.log('gaps:', gaps.join(', '));
