// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { mkGrid, step, stamp, live, pop, xf, P } from './engine.mjs';
import { T, createMission, missionStep, ambientStep, laneOf } from './mission.mjs';
import { buildLevel } from './level.mjs';

const worldOnly = M => { step(M.world, M.scratch, M.W, M.H); [M.world, M.scratch] = [M.scratch, M.world]; };

// witness: straight SE from spawn, no input
function runWitness(L, t0) {
  const M = createMission(L);
  for (let t = 0; t < t0; t++) worldOnly(M);
  for (let t = 0; t < 1200 && !M.result; t++) missionStep(M, null);
  return M;
}

function pathCellsStraight(L) {
  const set = new Set();
  const trace = (start) => {
    let anchor = [...start], phase = 0;
    for (let i = 0; i < 4000; i++) {
      for (const [x, y] of T['1,1'].shapes[phase]) set.add(((y + anchor[1]) * L.W) + (x + anchor[0]));
      const d = T['1,1'].deltas[phase];
      anchor = [anchor[0] + d[0], anchor[1] + d[1]]; phase = (phase + 1) % 4;
      if (anchor[1] > L.hangarZone[1] - 4) break;
    }
  };
  trace(L.spawn);                                   // the glidepath: lane -8 from spawn
  return set;
}

// 2-phase envelope of a small pattern (blinkers etc.), computed in isolation
function envelope(cells) {
  const W2 = 24, H2 = 24;
  let a = mkGrid(W2, H2), b = mkGrid(W2, H2);
  for (const [x, y] of cells) a[(y + 8) * W2 + (x + 8)] = 1;
  step(a, b, W2, H2);
  const out = new Set(cells.map(([x, y]) => x + ',' + y));
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) if (b[y * W2 + x]) out.add((x - 8) + ',' + (y - 8));
  return [...out].map(s => s.split(',').map(Number));
}

function groupsOf(L) {
  const g = [];
  L.terrain.forEach(([c, ox, oy], k) => g.push(['terr' + k, envelope(c).map(([x, y]) => [x + ox, y + oy])]));
  for (const s of L.sensors) g.push([s.name, s.cells]);
  g.push(['hangar', L.hangarCells]);
  g.push(['absorber', xf(P.eater1, 4).map(([x, y]) => [x + 114, y + 100])]);
  return g;
}

function staticAudit(L) {
  const path = pathCellsStraight(L);
  const groups = groupsOf(L);
  let minPath = Infinity, whatP = '', minLane = Infinity, whatL = '', minPair = Infinity, whatPair = '';
  for (const [name, cells] of groups) {
    if (name === 'hangar') continue;
    for (const [ox, oy] of cells) {
      for (const k of path) {
        const px = k % L.W, py = (k - px) / L.W;
        const d = Math.max(Math.abs(px - ox), Math.abs(py - oy));
        if (d < minPath) { minPath = d; whatP = `${name}@${ox},${oy}`; }
      }
      if (name !== 'absorber') {
        const d = Math.abs((ox - oy) - L.streamLane);
        if (d < minLane) { minLane = d; whatL = name; }
      }
    }
  }
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    for (const [ax, ay] of groups[i][1]) for (const [bx, by] of groups[j][1]) {
      const d = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
      if (d < minPair) { minPair = d; whatPair = groups[i][0] + '<->' + groups[j][0]; }
    }
  }
  // gun clearance to path and to everything
  let minGun = Infinity;
  for (const k of path) {
    const px = k % L.W, py = (k - px) / L.W;
    if (px < L.gunBox[2] + 3 && py < L.gunBox[3] + 3) minGun = Math.min(minGun, 0);
  }
  return { minPath, whatP, minLane, whatL, minPair, whatPair, pathClearOfGunBox: minGun === Infinity };
}

// fence-row theorem: for every anchor column c, a 3x3 at rows 53..55 must be Cheb>=3 from all fence-block cells.
function fenceRowAudit(L) {
  const blocks = [];
  for (const x of L.fenceX) for (const [dx, dy] of P.block) blocks.push([x + dx, 54 + dy]);
  const passable = [];
  for (let c = 1; c < L.W - 3; c++) {
    let ok = true;
    for (let px = c; px <= c + 2 && ok; px++) for (let py = 53; py <= 55 && ok; py++) {
      for (const [bx, by] of blocks) if (Math.max(Math.abs(px - bx), Math.abs(py - by)) < 3) ok = false;
    }
    // also stream: cells of the transit must keep lane distance >= 3 from lane band [12,16]
    if (ok) { for (let px = c; px <= c + 2; px++) for (let py = 53; py <= 55; py++) { const ln = px - py; if (ln >= 9 && ln <= 19) ok = false; } }
    if (ok) passable.push(c);
  }
  return passable;
}

function stabilityAudit(L, log) {
  const M = createMission(L);
  const snap = M.world.slice();
  let maxPop = 0, minPop = Infinity;
  for (let t = 0; t < 1402; t++) {
    worldOnly(M);
    if (t > 700) { const p = pop(M.world); maxPop = Math.max(maxPop, p); minPop = Math.min(minPop, p); }
  }
  const inGun = (x, y) => x < L.gunBox[2] && y < L.gunBox[3];
  const onStream = (x, y) => Math.abs((x - y) - L.streamLane) <= 3;
  let drifts = 0;
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (inGun(x, y) || onStream(x, y)) continue;
    if (M.world[y * L.W + x] !== snap[y * L.W + x]) { drifts++; if (log && drifts < 12) console.log('  drift', x, y); }
  }
  return { drifts, minPop, maxPop };
}

// ---- RDR-1 placement: reach map from garden clips ----
const DIVES = [];
for (let ox = 0; ox <= 4; ox += 1) for (let oy = 0; oy <= 2; oy += 2) DIVES.push([13 + ox, 10 + oy]);
for (let ox = 0; ox <= 4; ox += 2) DIVES.push([29 + ox, 24]);
function reachMap() {
  const L0 = buildLevel([200, 200], false);
  const acc = new Int16Array(L0.W * L0.H);
  const spl = [];
  for (const [ax, ay] of DIVES) {
    const M = createMission(L0);
    M.player.anchor = [ax, ay];
    for (let t = 0; t < 380; t++) { if (!M.result) missionStep(M, null); else ambientStep(M); }
    for (let i = 0; i < acc.length; i++) if (M.diverged[i]) acc[i]++;
    for (const s of M.splices) for (const c of s.cells) spl.push(c);
  }
  return { acc, spl, W: L0.W, H: L0.H };
}

function ashProbe(L) {
  let wake = 0; const others = {};
  for (const [ax, ay] of DIVES) {
    const M = createMission(L);
    M.player.anchor = [ax, ay];
    for (let t = 0; t < 500 && !M.result; t++) missionStep(M, null);
    if (M.result === 'DETECTED' && M.alarm.mode === 'WAKE') wake++;
    else others[M.result] = (others[M.result] || 0) + 1;
  }
  return { wake, total: DIVES.length, others };
}

// ---- run ----
console.log('== fence-row audit (west of stream): passable anchor columns =', JSON.stringify(fenceRowAudit(buildLevel([200, 200], false)).filter(c => c <= 59)));

const Ltmp = buildLevel([200, 200], true); // sensors RDR-2/3 in, RDR-1 parked far away (200,200 out of bounds? clamp)
console.log('== static (RDR-1 parked):', JSON.stringify(staticAudit(buildLevel([120, 8], true)))); // park RDR-1 in void NE for the static run

console.log('== building reach map from', DIVES.length, 'garden clips...');
const R = reachMap();
const pathSet = pathCellsStraight(buildLevel([200, 200], false));
const obsGroups = groupsOf(buildLevel([200, 200], false));
const cands = [];
for (let rx = 16; rx <= 58; rx++) for (let ry = 8; ry <= 50; ry++) {
  const cells = P.beehive.map(([x, y]) => [x + rx, y + ry]);
  let ok = true, score = 0;
  for (const [cx, cy] of cells) {
    if ((cx - cy) > 9) { ok = false; break; }
    for (const [sx2, sy2] of R.spl) if (Math.max(Math.abs(sx2 - cx), Math.abs(sy2 - cy)) < 5) { ok = false; break; }
    if (!ok) break;
    for (const k of pathSet) {
      const px = k % R.W, py = (k - px) / R.W;
      if (Math.max(Math.abs(px - cx), Math.abs(py - cy)) < 3) { ok = false; break; }
    }
    if (!ok) break;
    for (const [, gcells] of obsGroups) for (const [ox, oy] of gcells) if (Math.max(Math.abs(ox - cx), Math.abs(oy - cy)) < 3) { ok = false; break; }
    if (!ok) break;
    score += R.acc[cy * R.W + cx];
  }
  if (ok && score > 0) cands.push([rx, ry, score]);
}
cands.sort((a, b) => b[2] - a[2]);
console.log('== top RDR-1 candidates:', JSON.stringify(cands.slice(0, 8)));

let chosen = null;
for (const [rx, ry] of cands.slice(0, 6)) {
  const L = buildLevel([rx, ry]);
  const st = stabilityAudit(L, false);
  if (st.drifts > 0) { console.log('cand', rx, ry, 'unstable', st.drifts); continue; }
  const sa = staticAudit(L);
  if (sa.minPath < 3 || sa.minLane < 5 || sa.minPair < 3) { console.log('cand', rx, ry, 'static fail', JSON.stringify(sa)); continue; }
  const ap = ashProbe(L);
  console.log('cand', rx, ry, 'wake', ap.wake + '/' + ap.total, JSON.stringify(ap.others));
  if (!chosen || ap.wake > chosen[2]) chosen = [rx, ry, ap.wake];
}
if (!chosen) { console.log('NO viable RDR-1'); process.exit(1); }
console.log('== CHOSEN RDR-1:', chosen[0], chosen[1]);

const L = buildLevel([chosen[0], chosen[1]]);
console.log('== FINAL static:', JSON.stringify(staticAudit(L)));
const st = stabilityAudit(L, true);
console.log('== FINAL stability: drifts', st.drifts, 'pop', st.minPop, '-', st.maxPop);

// landing flavor table (clean-room, hangar orientation)
{
  // Grid enlarged and glider+eater co-shifted by +10 so the most-negative lane
  // (u=-8) stays in bounds; the sweep only measures the RELATIVE approach lane u,
  // which co-shifting preserves (Life is translation-invariant away from borders).
  const W2 = 80, H2 = 80, EH = xf(P.eater1, 4);
  console.log('== landing sweep (SE approach lane u rel. hangar anchor lane):');
  for (let u = -8; u <= 3; u++) {
    let a = mkGrid(W2, H2), b = mkGrid(W2, H2);
    stamp(a, W2, T['1,1'].shapes[0], 16 + u, 16); stamp(a, W2, EH, 40, 40);
    for (let t = 0; t < 220; t++) { step(a, b, W2, H2); [a, b] = [b, a]; }
    const cs = live(a, W2, H2);
    const eset = new Set(EH.map(([x, y]) => `${x + 40},${y + 40}`));
    const eaterIntact = [...eset].every(k => cs.some(([x, y]) => `${x},${y}` === k));
    const extra = cs.filter(([x, y]) => !eset.has(`${x},${y}`));
    let v;
    if (cs.length === 0) v = 'BOTH_DIE';
    else if (eaterIntact && extra.length === 0) v = 'CLEAN';
    else if (eaterIntact) v = extra.length === 5 ? 'PASS' : 'DEBRIS';
    else v = 'EATER_LOST';
    console.log('  u=' + String(u).padStart(2), v);
  }
}

// witness sweep
const sweep = [];
for (let t0 = 0; t0 < 30; t0++) {
  const M = runWitness(L, t0);
  sweep.push([t0, M.result, M.trace]);
}
const byRes = {};
for (const [, r] of sweep) byRes[r] = (byRes[r] || 0) + 1;
console.log('== witness sweep (straight SE, no input):', JSON.stringify(byRes),
  '| zero-trace LANDED:', sweep.filter(r => r[1] === 'LANDED' && r[2] === 0).length + '/30');
