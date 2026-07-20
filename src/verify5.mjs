// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { mkGrid, step, stamp, live, pop, xf, P } from './engine.mjs';
import { T, createMission, missionStep } from './mission.mjs';

export function buildLevel(rdr1) {
  const W = 172, H = 108;
  const E4 = xf(P.eater1, 4), E2 = xf(P.eater1, 2);
  const blinkV = xf(P.blinker, 2);
  const hangarAt = [150, 26];
  const hangarCells = E2.map(([x, y]) => [x + hangarAt[0], y + hangarAt[1]]);
  let hx0 = Infinity, hy0 = Infinity, hx1 = -1, hy1 = -1;
  for (const [x, y] of hangarCells) { hx0 = Math.min(hx0, x); hy0 = Math.min(hy0, y); hx1 = Math.max(hx1, x); hy1 = Math.max(hy1, y); }

  const terrain = [
    // garden A — north of SE leg (path: y = x+16), lanes kept <= 9
    [P.blinker, 44, 50], [blinkV, 49, 52], [P.beehive, 40, 46], [P.block, 46, 44], [P.boat, 52, 48], [P.tub, 38, 52],
    // scenery south of SE leg
    [P.blinker, 30, 78], [P.block, 24, 72], [P.beehive, 44, 84],
    // garden B — west of NE leg (path: x+y = 178)
    [P.blinker, 112, 56], [P.beehive, 106, 62], [P.block, 116, 60], [P.boat, 108, 50], [blinkV, 118, 52],
  ];
  const sensors = [
    { name: 'RDR-1', cells: P.beehive.map(([x, y]) => [x + rdr1[0], y + rdr1[1]]) },
    { name: 'RDR-2', cells: P.beehive.map(([x, y]) => [x + 122, y + 44]) },
    { name: 'RDR-3', cells: P.beehive.map(([x, y]) => [x + 108, y + 86]) },
  ];
  const stamps = [
    [P.gun, 2, 2], [E4, 114, 100], [E2, ...hangarAt],
    ...terrain,
    ...sensors.map(s => [s.cells, 0, 0]),
  ];
  return {
    W, H, stamps, sensors, terrain, hangarCells,
    hangarZone: [hx0 - 6, hy0 - 6, hx1 + 6, hy1 + 6],
    spawn: [8, 24], spawnHeading: [1, 1],
    streamLane: 14, cleanNELane: 178, turnSum: 178,
    gunBox: [0, 0, 40, 13],
  };
}

function worldOnly(M) { step(M.world, M.scratch, M.W, M.H); [M.world, M.scratch] = [M.scratch, M.world]; }

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
    if (M.world[y * L.W + x] !== snap[y * L.W + x]) { drifts++; if (log) console.log('  drift', x, y); }
  }
  return { drifts, minPop, maxPop };
}

function clearanceAudit(L) {
  const path = [];
  let anchor = [...L.spawn], heading = [1, 1], phase = 0;
  for (let i = 0; i < 4000; i++) {
    for (const [x, y] of T[heading.join(',')].shapes[phase]) path.push([x + anchor[0], y + anchor[1]]);
    if (phase === 0 && heading[1] === 1 && anchor[0] + anchor[1] === L.turnSum) heading = [1, -1];
    const d = T[heading.join(',')].deltas[phase];
    anchor = [anchor[0] + d[0], anchor[1] + d[1]]; phase = (phase + 1) % 4;
    if (anchor[0] > 150 || anchor[1] < 24) break;
  }
  const obs = [];
  for (const s of L.sensors) obs.push(...s.cells.map(c => [c[0], c[1], s.name]));
  L.terrain.forEach(([c, ox, oy], k) => c.forEach(([x, y]) => obs.push([x + ox, y + oy, 'terr' + k])));
  let minD = Infinity, what = '';
  for (const [px, py] of path) for (const [ox, oy, name] of obs) {
    const d = Math.max(Math.abs(px - ox), Math.abs(py - oy));
    if (d < minD) { minD = d; what = `${name}@${ox},${oy}`; }
  }
  let minS = Infinity, whatS = '';
  for (const [ox, oy, name] of obs) {
    const d = Math.abs((ox - oy) - L.streamLane);
    if (d < minS) { minS = d; whatS = name; }
  }
  return { minD, what, minS, whatS };
}

function witnessSweep(L) {
  const out = [];
  for (let t0 = 0; t0 < 30; t0++) {
    const M = createMission(L);
    for (let t = 0; t < t0; t++) worldOnly(M);
    let turned = false;
    for (let t = 0; t < 1600 && !M.result; t++) {
      let input = null;
      if (M.state === 'FLIGHT' && !turned && M.player.phase === 0 &&
          M.player.anchor[0] + M.player.anchor[1] === L.turnSum) { input = [1, -1]; turned = true; }
      missionStep(M, input);
    }
    out.push([t0, M.result, M.trace, M.alarm ? M.alarm.mode : '', M.reacquired || 0]);
  }
  return out;
}

function ashProbe(L) {
  let wake = 0, other = [];
  for (let ox = -3; ox <= 3; ox++) for (let oy = -3; oy <= 3; oy++) {
    const M = createMission(L);
    M.player.anchor = [34 + ox, 38 + oy]; // dive SE into garden A
    for (let t = 0; t < 500 && !M.result; t++) missionStep(M, null);
    if (M.result === 'DETECTED' && M.alarm.mode === 'WAKE') wake++;
    else other.push(M.result);
  }
  return { wake, total: 49 };
}

// ---- search RDR-1 placement: stable level + decent wake rate ----
const cands = [];
for (const pos of [[50, 40], [52, 42], [48, 38], [54, 40], [46, 36], [50, 44], [34, 46], [56, 42], [44, 40], [36, 42]]) {
  const L = buildLevel(pos);
  const st = stabilityAudit(L, false);
  if (st.drifts > 0) { console.log('rdr1', pos, 'UNSTABLE drifts', st.drifts); continue; }
  const cl = clearanceAudit(L);
  if (cl.minD < 3 || cl.minS < 5) { console.log('rdr1', pos, 'clearance fail', cl); continue; }
  const ap = ashProbe(L);
  console.log('rdr1', pos, 'stable, clearance', cl.minD, '/', cl.minS, 'wake', ap.wake + '/' + ap.total);
  cands.push([pos, ap.wake]);
}
cands.sort((a, b) => b[1] - a[1]);
if (!cands.length) { console.log('NO viable RDR-1 candidate'); process.exit(1); }
const best = cands[0][0];
console.log('CHOSEN RDR-1:', best);

const L = buildLevel(best);
const st = stabilityAudit(L, true);
console.log('FINAL stability: drifts', st.drifts, 'pop', st.minPop, '-', st.maxPop);
console.log('FINAL clearance:', JSON.stringify(clearanceAudit(L)));
const sweep = witnessSweep(L);
for (const r of sweep) console.log('  t0=' + String(r[0]).padStart(2), r[1], 'trace', r[2], r[3], r[4] ? 'reacq:' + r[4] : '');
const wins = sweep.filter(r => r[1] === 'LANDED' && r[2] === 0);
console.log('FINAL witness: clean wins', wins.length, '/30, non-wins', sweep.filter(r => r[1] !== 'LANDED').length);
