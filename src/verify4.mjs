// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { mkGrid, step, stamp, live, pop, norm, xf, P, clusters, findGlider } from './engine.mjs';
import { T, laneOf, createMission, missionStep, playerCells } from './mission.mjs';

// ---------- LEVEL: OPERATION NIGHTSTEP ----------
export function buildLevel() {
  const W = 172, H = 108;
  const gun = [P.gun, 2, 2];                       // stream physical lane x-y = 14 (measured)
  const E4 = xf(P.eater1, 4);                      // catches SE gliders, anchor on stream lane
  const absorber = [E4, 114, 100];                 // 114-100 = 14
  const E2 = xf(P.eater1, 2);                      // catches NE gliders (measured, rel sum -2)
  const hangar = [E2, 150, 26];                    // eater sum 176 -> clean NE lane expected near 178
  const hangarCells = E2.map(([x, y]) => [x + 150, y + 26]);
  let hx0 = Infinity, hy0 = Infinity, hx1 = -1, hy1 = -1;
  for (const [x, y] of hangarCells) { hx0 = Math.min(hx0, x); hy0 = Math.min(hy0, y); hx1 = Math.max(hx1, x); hy1 = Math.max(hy1, y); }
  const hangarZone = [hx0 - 6, hy0 - 6, hx1 + 6, hy1 + 6];

  const terrain = [
    [P.blinker, 48, 56], [P.beehive, 42, 63], [P.boat, 56, 52], [P.block, 38, 55], [P.tub, 52, 62],   // garden A (N of SE leg)
    [P.blinker, 30, 74], [P.block, 26, 68],                                                            // garden A2 (S of SE leg? check)
    [P.blinker, 112, 56], [P.beehive, 106, 62], [P.block, 116, 60], [P.boat, 108, 50],                 // garden B (W of NE leg)
  ];
  const sensors = [
    { name: 'RDR-1', cells: P.beehive.map(([x, y]) => [x + 58, y + 46]) },
    { name: 'RDR-2', cells: P.beehive.map(([x, y]) => [x + 118, y + 44]) },
    { name: 'RDR-3', cells: P.beehive.map(([x, y]) => [x + 108, y + 86]) },
  ];
  const stamps = [gun, absorber, hangar, ...terrain, ...sensors.map(s => [s.cells.map(([x, y]) => [x, y]), 0, 0])];
  // sensors stamped at absolute coords already
  return {
    W, H, stamps, sensors, hangarCells, hangarZone,
    spawn: [8, 24], spawnHeading: [1, 1],
    streamLane: 14, cleanNELane: null, // filled by sweep below
    gunBox: [0, 0, 40, 13],
  };
}

const L = buildLevel();

// ---------- AUDIT 1: full-level stability (no player): bounded pop + terrain/sensors intact ----------
{
  const M = createMission(L);
  const terrainSensorsCells = [];
  for (const s of L.sensors) terrainSensorsCells.push(...s.cells);
  const snapshot0 = M.world.slice();
  let maxPop = 0, minPop = Infinity;
  for (let t = 0; t < 1400; t++) {
    missionStepWorldOnly(M);
    if (t > 700) { const p = pop(M.world); maxPop = Math.max(maxPop, p); minPop = Math.min(minPop, p); }
  }
  // every non-gun, non-stream cell region: check all initially-stamped still/p2 patterns intact at t=1400 (period 2 -> also check 1401... run to even parity)
  missionStepWorldOnly(M); missionStepWorldOnly(M);
  let intact = true;
  const inGun = (x, y) => x >= L.gunBox[0] && y >= L.gunBox[1] && x < L.gunBox[2] && y < L.gunBox[3];
  const onStream = (x, y) => Math.abs((x - y) - L.streamLane) <= 3;
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (inGun(x, y) || onStream(x, y)) continue;
    if (M.world[y * L.W + x] !== snapshot0[y * L.W + x]) { intact = false; console.log('level drift at', x, y); }
  }
  console.log('AUDIT1 level stability: pop', minPop, '-', maxPop, '| off-stream cells identical to t=0 (mod 2):', intact);
}
function missionStepWorldOnly(M) { step(M.world, M.scratch, M.W, M.H); [M.world, M.scratch] = [M.scratch, M.world]; }

// ---------- AUDIT 2: witness-path clearance vs terrain/sensors ----------
function witnessPathCells(turnSum) {
  // simulate kinematics only: SE from spawn until beat && sum==turnSum, then NE
  const cellsSet = new Set();
  let anchor = [...L.spawn], heading = [1, 1], phase = 0;
  for (let i = 0; i < 4000; i++) {
    const hk = heading.join(',');
    for (const [x, y] of T[hk].shapes[phase]) cellsSet.add(`${x + anchor[0]},${y + anchor[1]}`);
    if (phase === 0 && heading[0] === 1 && heading[1] === 1 && anchor[0] + anchor[1] === turnSum) heading = [1, -1];
    const d = T[heading.join(',')].deltas[phase];
    anchor = [anchor[0] + d[0], anchor[1] + d[1]]; phase = (phase + 1) % 4;
    if (anchor[0] > 150 || anchor[1] < 24) break;
  }
  return [...cellsSet].map(s => s.split(',').map(Number));
}
{
  const path = witnessPathCells(178);
  const obstacles = [];
  for (const s of L.sensors) obstacles.push(...s.cells.map(c => [...c, s.name]));
  const terrIdx = L.stamps.slice(3); // after gun, absorber, hangar
  // recompute terrain cells from buildLevel definition directly:
  const terrCells = [];
  const terrain = [[P.blinker, 48, 56], [P.beehive, 42, 63], [P.boat, 56, 52], [P.block, 38, 55], [P.tub, 52, 62], [P.blinker, 30, 74], [P.block, 26, 68], [P.blinker, 112, 56], [P.beehive, 106, 62], [P.block, 116, 60], [P.boat, 108, 50]];
  terrain.forEach(([c, ox, oy], k) => c.forEach(([x, y]) => terrCells.push([x + ox, y + oy, 'terr' + k])));
  let minD = Infinity, minWhat = '';
  for (const [px, py] of path) for (const [ox, oy, name] of [...obstacles, ...terrCells]) {
    const d = Math.max(Math.abs(px - ox), Math.abs(py - oy));
    if (d < minD) { minD = d; minWhat = name + '@' + ox + ',' + oy; }
  }
  console.log('AUDIT2 witness clearance: min Chebyshev to obstacle =', minD, '(', minWhat, ') need >= 3');
  // also clearance of terrain/sensors to stream band
  let minS = Infinity, minSW = '';
  for (const [ox, oy, name] of [...obstacles, ...terrCells]) {
    const d = Math.abs((ox - oy) - L.streamLane);
    if (d < minS) { minS = d; minSW = name; }
  }
  console.log('        obstacle min lane-distance to stream =', minS, '(', minSW, ') need >= 5');
}

// ---------- AUDIT 3: landing-lane sweep in situ (hangar eater, NE approach) ----------
{
  console.log('AUDIT3 NE landing sweep vs hangar (player physical lane x+y):');
  const cleans = [];
  for (let S = 170; S <= 186; S++) {
    // isolated: NE glider far below-left of hangar on lane S
    const W2 = 80, H2 = 80;
    const E2 = xf(P.eater1, 2);
    let a = mkGrid(W2, H2), b = mkGrid(W2, H2);
    const ex = 50, ey = 20; // sum 70 stand-in; shift player lane accordingly: use rel = S - 176
    const rel = S - 176;
    // player phase0 anchor on lane (70 + rel): pick anchor (10, 60 + rel)? lane = 10 + 60+rel
    const ay = 60 + rel - 10 >= 0 ? 60 + rel - 10 : 0;
    // simpler: anchor (ax, ay) with ax+ay = 70+rel; take ax=8
    const ax = 8, ay2 = 70 + rel - 8;
    stamp(a, W2, T['1,-1'].shapes[0], ax, ay2);
    stamp(a, W2, E2, ex, ey);
    for (let t = 0; t < 260; t++) { step(a, b, W2, H2); [a, b] = [b, a]; }
    const cs = live(a, W2, H2);
    const eset = new Set(E2.map(([x, y]) => `${x + ex},${y + ey}`));
    const eaterIntact = [...eset].every(k => cs.some(([x, y]) => `${x},${y}` === k));
    const extra = cs.filter(([x, y]) => !eset.has(`${x},${y}`));
    let verdict;
    if (cs.length === 0) verdict = 'BOTH_DIE';
    else if (eaterIntact && extra.length === 0) verdict = 'CLEAN';
    else if (eaterIntact) verdict = extra.length === 5 ? 'PASS' : 'DEBRIS';
    else verdict = 'EATER_LOST';
    if (verdict === 'CLEAN') cleans.push(S);
    console.log('  lane', S, verdict);
  }
  console.log('  clean NE lanes:', cleans.join(','), '(witness uses 178)');
}

// ---------- AUDIT 4: witness search over launch ticks ----------
{
  const results = [];
  for (let t0 = 0; t0 < 30; t0++) {
    const M = createMission(L);
    for (let t = 0; t < t0; t++) missionStepWorldOnly(M);
    let turnDone = false;
    for (let t = 0; t < 1500 && !M.result; t++) {
      let input = null;
      if (M.state === 'FLIGHT' && !turnDone && M.player.heading[0] === 1 && M.player.heading[1] === 1) {
        if (M.player.phase === 0 && M.player.anchor[0] + M.player.anchor[1] === 178) { input = [1, -1]; turnDone = true; }
      }
      missionStep(M, input);
    }
    results.push([t0, M.result, M.trace, M.alarm ? M.alarm.mode : '']);
  }
  const wins = results.filter(r => r[1] === 'LANDED');
  const cleanWins = wins.filter(r => r[2] === 0);
  console.log('AUDIT4 witness over launch tick t0:');
  for (const r of results) console.log('  t0=' + String(r[0]).padStart(2), r[1], 'trace', r[2], r[3]);
  console.log('  wins:', wins.length, '/ 30, zero-trace wins:', cleanWins.length, 'fail ticks:', results.filter(r => r[1] !== 'LANDED').length);
}

// ---------- AUDIT 5: ash probe — crash into garden A, does RDR-1 trip via wake? ----------
{
  let tripped = 0, tried = 0;
  for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) {
    tried++;
    const M = createMission(L);
    // fly a glider straight at garden A blinker (48,56): approach SE from (40+ox, 48+oy)
    M.player.anchor = [40 + ox, 46 + oy]; M.player.heading = [1, 1]; M.player.phase = 0;
    for (let t = 0; t < 400 && !M.result; t++) missionStep(M, null);
    if (M.result === 'DETECTED' && M.alarm.mode === 'WAKE') tripped++;
  }
  console.log('AUDIT5 wake-detection probe on garden A: WAKE alarms in', tripped, '/', tried, 'crash offsets');
}
