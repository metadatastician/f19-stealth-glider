// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
// F19 Stealth Glider — mission core. No DOM. Used by verify harness AND the shipped game.
import { mkGrid, step, stamp, norm, live, gliderTables, findGlider } from './engine.mjs';

export const T = gliderTables();
const CUM = {};
for (const hk of Object.keys(T)) {
  const d = T[hk].deltas, c = [[0, 0]];
  for (let p = 0; p < 3; p++) c.push([c[p][0] + d[p][0], c[p][1] + d[p][1]]);
  CUM[hk] = c;
}
export function laneOf(hk, ax, ay, p) {
  const [cx, cy] = CUM[hk][p];
  const [sx, sy] = hk.split(',').map(Number);
  return sx * sy > 0 ? (ax - cx) - (ay - cy) : (ax - cx) + (ay - cy);
}

export function createMission(L) {
  const { W, H } = L;
  const world = mkGrid(W, H), scratch = mkGrid(W, H);
  for (const [cells, ox, oy] of L.stamps) stamp(world, W, cells, ox, oy);
  return {
    L, W, H, world, scratch, shadow: null, sscratch: null,
    t: 0, state: 'FLIGHT',
    player: { anchor: [...L.spawn], heading: [...L.spawnHeading], phase: 0, queued: null },
    contactT: 0, contactPos: null, landT: 0,
    diverged: new Uint8Array(W * H), trace: 0,
    alarm: null, splices: [], result: null, endT: null,
  };
}

export function playerCells(M) {
  const { anchor, heading, phase } = M.player;
  return T[heading.join(',')].shapes[phase].map(([x, y]) => [x + anchor[0], y + anchor[1]]);
}

function nearWorld(M, cells, r) {
  const { world, W, H } = M;
  for (const [x, y] of cells) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (world[ny * W + nx]) return true;
    }
  }
  return false;
}

function inHangar(M, cells) {
  const z = M.L.hangarZone;
  return cells.some(([x, y]) => x >= z[0] && y >= z[1] && x <= z[2] && y <= z[3]);
}

function splice(M, cells) {
  if (!M.shadow) { M.shadow = M.world.slice(); M.sscratch = new Uint8Array(M.W * M.H); }
  for (const [x, y] of cells) M.world[y * M.W + x] = 1;
  M.splices.push({ t: M.t, cells });
}

function checkSensors(M) {
  if (!M.shadow || M.state === 'LANDING' || M.result) return;
  for (const s of M.L.sensors) {
    for (const [x, y] of s.cells) {
      const i = y * M.W + x;
      if (M.world[i] !== M.shadow[i]) {
        // direct if any splice happened within Chebyshev 3 of this sensor
        let direct = false;
        for (const sp of M.splices) for (const [px, py] of sp.cells) {
          for (const [qx, qy] of s.cells) if (Math.max(Math.abs(px - qx), Math.abs(py - qy)) <= 3) direct = true;
        }
        M.alarm = { sensor: s.name, mode: direct ? 'DIRECT' : 'WAKE', t: M.t };
        M.state = 'ENDED'; M.result = 'DETECTED'; M.endT = M.t;
        return;
      }
    }
  }
}

function updateTrace(M) {
  if (!M.shadow || M.state === 'LANDING' || (M.state === 'ENDED' && (M.result === 'LANDED' || M.result === 'CRASH_LANDING'))) return;
  const { world, shadow, diverged, W, H } = M;
  for (let i = 0; i < W * H; i++) {
    if (!diverged[i] && world[i] !== shadow[i]) { diverged[i] = 1; M.trace++; }
  }
}

// World + shadow keep evolving (used after mission end, and by the harness's ash-reach probe).
export function ambientStep(M) {
  step(M.world, M.scratch, M.W, M.H); [M.world, M.scratch] = [M.scratch, M.world];
  if (M.shadow) {
    step(M.shadow, M.sscratch, M.W, M.H); [M.shadow, M.sscratch] = [M.sscratch, M.shadow];
    const { world, shadow, diverged, W, H } = M;
    for (let i = 0; i < W * H; i++) if (!diverged[i] && world[i] !== shadow[i]) { diverged[i] = 1; M.trace++; }
  }
  M.t++;
}

// One generation. input = desired heading [hx,hy] or null.
export function missionStep(M, input) {
  const { W, H } = M;
  if (M.result) return;

  if (M.state === 'FLIGHT') {
    if (input) M.player.queued = input;
    if (M.player.queued && M.player.phase === 0) {
      const q = M.player.queued;
      if (q[0] !== M.player.heading[0] || q[1] !== M.player.heading[1]) M.player.heading = [q[0], q[1]];
      M.player.queued = null;
    }
    const cells = playerCells(M);
    // bounds
    for (const [x, y] of cells) if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) {
      M.state = 'ENDED'; M.result = 'ABORT_EDGE'; M.endT = M.t; return;
    }
    if (nearWorld(M, cells, 2)) {
      splice(M, cells);
      if (inHangar(M, cells)) { M.state = 'LANDING'; M.landT = 0; }
      else { M.state = 'CONTACT'; M.contactT = 0; M.contactPos = [...M.player.anchor]; }
    } else {
      const d = T[M.player.heading.join(',')].deltas[M.player.phase];
      M.player.anchor = [M.player.anchor[0] + d[0], M.player.anchor[1] + d[1]];
      M.player.phase = (M.player.phase + 1) % 4;
    }
  }

  step(M.world, M.scratch, W, H); [M.world, M.scratch] = [M.scratch, M.world];
  if (M.shadow) { step(M.shadow, M.sscratch, W, H); [M.shadow, M.sscratch] = [M.sscratch, M.shadow]; }
  M.t++;
  updateTrace(M);
  checkSensors(M);
  if (M.result) return;

  if (M.state === 'CONTACT') {
    M.contactT++;
    const [cx, cy] = M.contactPos, R = 15;
    const g = findGlider(M.world, W, H, T, cx - R, cy - R, cx + R, cy + R, M.shadow);
    if (g) {
      const sh = T[g.heading.join(',')].shapes[g.phase];
      for (const [x, y] of sh) M.world[(y + g.oy) * W + (x + g.ox)] = 0;
      M.player = { anchor: [g.ox, g.oy], heading: g.heading, phase: g.phase, queued: null };
      M.state = 'FLIGHT'; M.reacquired = (M.reacquired || 0) + 1;
    } else if (M.contactT > 26) {
      M.state = 'ENDED'; M.result = 'MIA'; M.endT = M.t;
    }
  } else if (M.state === 'LANDING') {
    M.landT++;
    if (M.landT >= 70) {
      const z = M.L.hangarZone;
      const eset = new Set(M.L.hangarCells.map(([x, y]) => `${x},${y}`));
      let clean = true;
      for (let y = z[1]; y <= z[3]; y++) for (let x = z[0]; x <= z[2]; x++) {
        const v = M.world[y * W + x];
        if (v !== (eset.has(`${x},${y}`) ? 1 : 0)) clean = false;
      }
      M.state = 'ENDED'; M.endT = M.t;
      M.result = clean ? 'LANDED' : 'CRASH_LANDING';
    }
  }
}
