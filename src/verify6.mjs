// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { mkGrid, step, stamp, live, pop, xf, P } from './engine.mjs';
import { T, createMission, missionStep, ambientStep } from './mission.mjs';

const blinkV = xf(P.blinker, 2);
const E4 = xf(P.eater1, 4), E2 = xf(P.eater1, 2);

export function buildLevel(rdr1, withSensors = true) {
  const W = 172, H = 108;
  const hangarAt = [150, 26];
  const hangarCells = E2.map(([x, y]) => [x + hangarAt[0], y + hangarAt[1]]);
  let hx0 = Infinity, hy0 = Infinity, hx1 = -1, hy1 = -1;
  for (const [x, y] of hangarCells) { hx0 = Math.min(hx0, x); hy0 = Math.min(hy0, y); hx1 = Math.max(hx1, x); hy1 = Math.max(hy1, y); }

  const terrain = [
    // garden A — north of SE leg, cells kept in band y-x ∈ [-9, 8]
    [P.tub, 36, 42], [P.beehive, 40, 46], [P.block, 47, 45], [P.blinker, 44, 51], [blinkV, 49, 53], [P.boat, 52, 48],
    // scenery south of SE leg
    [P.blinker, 30, 78], [P.block, 24, 72], [P.beehive, 44, 84],
    // garden B — west of NE leg
    [P.blinker, 112, 56], [P.beehive, 106, 62], [P.block, 104, 56], [P.boat, 108, 50], [blinkV, 118, 52],
  ];
  const sensors = withSensors ? [
    { name: 'RDR-1', cells: P.beehive.map(([x, y]) => [x + rdr1[0], y + rdr1[1]]) },
    { name: 'RDR-2', cells: P.beehive.map(([x, y]) => [x + 122, y + 44]) },
    { name: 'RDR-3', cells: P.beehive.map(([x, y]) => [x + 108, y + 86]) },
  ] : [];
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

// ---- static: path cell set (witness), dilated by 2 for contact radius ----
function pathCells(L) {
  const set = new Set();
  let anchor = [...L.spawn], heading = [1, 1], phase = 0;
  for (let i = 0; i < 4000; i++) {
    for (const [x, y] of T[heading.join(',')].shapes[phase]) set.add(((y + anchor[1]) * L.W) + (x + anchor[0]));
    if (phase === 0 && heading[1] === 1 && anchor[0] + anchor[1] === L.turnSum) heading = [1, -1];
    const d = T[heading.join(',')].deltas[phase];
    anchor = [anchor[0] + d[0], anchor[1] + d[1]]; phase = (phase + 1) % 4;
    if (anchor[0] > 150 || anchor[1] < 24) break;
  }
  return set;
}

function obstacleCells(L) {
  const out = [];
  L.terrain.forEach(([c, ox, oy], k) => c.forEach(([x, y]) => out.push([x + ox, y + oy, 'terr' + k])));
  for (const s of L.sensors) for (const [x, y] of s.cells) out.push([x, y, s.name]);
  return out;
}

function staticAudit(L) {
  const path = pathCells(L);
  const obs = obstacleCells(L);
  let minPath = Infinity, whatP = '';
  for (const [ox, oy, name] of obs) {
    for (const k of path) {
      const px = k % L.W, py = (k - px) / L.W;
      const d = Math.max(Math.abs(px - ox), Math.abs(py - oy));
      if (d < minPath) { minPath = d; whatP = `${name}@${ox},${oy}`; }
    }
  }
  let minLane = Infinity, whatL = '';
  for (const [ox, oy, name] of obs) {
    const d = Math.abs((ox - oy) - L.streamLane);
    if (d < minLane) { minLane = d; whatL = name; }
  }
  // pairwise separation between distinct stamped patterns (terrain+sensors)
  const groups = [];
  L.terrain.forEach(([c, ox, oy], k) => groups.push([('terr' + k), c.map(([x, y]) => [x + ox, y + oy])]));
  for (const s of L.sensors) groups.push([s.name, s.cells]);
  groups.push(['hangar', L.hangarCells]);
  groups.push(['absorber', E4.map(([x, y]) => [x + 114, y + 100])]);
  let minPair = Infinity, whatPair = '';
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    for (const [ax, ay] of groups[i][1]) for (const [bx, by] of groups[j][1]) {
      const d = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
      if (d < minPair) { minPair = d; whatPair = groups[i][0] + '<->' + groups[j][0]; }
    }
  }
  return { minPath, whatP, minLane, whatL, minPair, whatPair };
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
    if (M.world[y * L.W + x] !== snap[y * L.W + x]) { drifts++; if (log) console.log('  drift', x, y); }
  }
  return { drifts, minPop, maxPop };
}

// ---- ash-reach map: dive into garden A with NO sensors, accumulate diverged cells ----
function reachMap() {
  const L0 = buildLevel([0, 0], false);
  const acc = new Int16Array(L0.W * L0.H);
  const spl = [];
  for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) {
    const M = createMission(L0);
    M.player.anchor = [34 + ox, 38 + oy];
    for (let t = 0; t < 380; t++) { if (!M.result) missionStep(M, null); else ambientStep(M); }
    for (let i = 0; i < acc.length; i++) if (M.diverged[i]) acc[i]++;
    for (const s of M.splices) for (const c of s.cells) spl.push(c);
  }
  return { acc, spl, W: L0.W, H: L0.H };
}

// ---- main ----
const L1 = buildLevel([200, 0]); // RDR-1 parked off-map region? keep static audit honest: use no-sensor variant for path/pair prelim
console.log('STATIC (garden fixes, RDR-1 excluded):', JSON.stringify(staticAudit(buildLevel([200, 200], true))));

console.log('building ash-reach map (25 dives)...');
const R = reachMap();
// candidate scan
const pathSet = pathCells(buildLevel([200, 200], false));
const baseObs = obstacleCells(buildLevel([200, 200], false)); // terrain only
const fixedSensors = [[122, 44], [108, 86]].map(([x, y]) => P.beehive.map(([a, b]) => [a + x, b + y]));
const cands = [];
for (let rx = 28; rx <= 60; rx++) for (let ry = 30; ry <= 58; ry++) {
  const cells = P.beehive.map(([x, y]) => [x + rx, y + ry]);
  let ok = true, score = 0;
  for (const [cx, cy] of cells) {
    if ((cx - cy) > 9) { ok = false; break; }                       // stream clearance (west side)
    for (const [sx2, sy2] of R.spl) if (Math.max(Math.abs(sx2 - cx), Math.abs(sy2 - cy)) < 5) { ok = false; break; }
    if (!ok) break;
    for (const k of pathSet) {                                      // path clearance >=3
      const px = k % R.W, py = (k - px) / R.W;
      if (Math.max(Math.abs(px - cx), Math.abs(py - cy)) < 3) { ok = false; break; }
    }
    if (!ok) break;
    for (const [ox, oy] of baseObs) if (Math.max(Math.abs(ox - cx), Math.abs(oy - cy)) < 3) { ok = false; break; }
    if (!ok) break;
    for (const sc of fixedSensors) for (const [ox, oy] of sc) if (Math.max(Math.abs(ox - cx), Math.abs(oy - cy)) < 3) { ok = false; break; }
    if (!ok) break;
    score += R.acc[cy * R.W + cx];
  }
  if (ok && score > 0) cands.push([rx, ry, score]);
}
cands.sort((a, b) => b[2] - a[2]);
console.log('top reach-scored RDR-1 candidates:', JSON.stringify(cands.slice(0, 8)));

function ashProbe(L) {
  let wake = 0; const others = {};
  for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) {
    const M = createMission(L);
    M.player.anchor = [34 + ox, 38 + oy];
    for (let t = 0; t < 500 && !M.result; t++) missionStep(M, null);
    if (M.result === 'DETECTED' && M.alarm.mode === 'WAKE') wake++;
    else others[M.result] = (others[M.result] || 0) + 1;
  }
  return { wake, others };
}

let chosen = null;
for (const [rx, ry] of cands.slice(0, 6)) {
  const L = buildLevel([rx, ry]);
  const st = stabilityAudit(L, false);
  if (st.drifts > 0) { console.log('cand', rx, ry, 'unstable', st.drifts); continue; }
  const sa = staticAudit(L);
  if (sa.minPath < 3 || sa.minLane < 5 || sa.minPair < 3) { console.log('cand', rx, ry, 'static fail', JSON.stringify(sa)); continue; }
  const ap = ashProbe(L);
  console.log('cand', rx, ry, 'wake', ap.wake + '/25', 'others', JSON.stringify(ap.others));
  if (!chosen || ap.wake > chosen[2]) chosen = [rx, ry, ap.wake];
}
if (!chosen) { console.log('NO viable RDR-1'); process.exit(1); }
console.log('CHOSEN RDR-1:', chosen[0], chosen[1], 'wake', chosen[2] + '/25');

const L = buildLevel([chosen[0], chosen[1]]);
console.log('FINAL static:', JSON.stringify(staticAudit(L)));
const st = stabilityAudit(L, true);
console.log('FINAL stability: drifts', st.drifts, 'pop', st.minPop, '-', st.maxPop);
const sweep = [];
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
  sweep.push([t0, M.result, M.trace, M.alarm ? M.alarm.mode : '', M.reacquired || 0]);
}
for (const r of sweep) console.log('  t0=' + String(r[0]).padStart(2), r[1], 'trace', r[2], r[3], r[4] ? 'reacq:' + r[4] : '');
console.log('FINAL witness: clean wins', sweep.filter(r => r[1] === 'LANDED' && r[2] === 0).length,
  '/30, non-LANDED', sweep.filter(r => r[1] !== 'LANDED').length);
