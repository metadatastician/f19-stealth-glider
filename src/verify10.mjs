// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { createMission, missionStep, laneOf } from './mission.mjs';
import { step } from './engine.mjs';
import { buildLevel } from './level.mjs';

const L = buildLevel();
const worldOnly = M => { step(M.world, M.scratch, M.W, M.H); [M.world, M.scratch] = [M.scratch, M.world]; };

function run(targetLane, label, t0 = 0) {
  const M = createMission(L);
  for (let t = 0; t < t0; t++) worldOnly(M);
  for (let t = 0; t < 1400 && !M.result; t++) {
    let input = null;
    if (M.state === 'FLIGHT' && M.player.phase === 0) {
      const lane = laneOf(M.player.heading.join(','), M.player.anchor[0], M.player.anchor[1], M.player.phase);
      const belowFence = M.player.anchor[1] >= 60;
      if (belowFence && M.player.anchor[1] <= 78) {
        if (lane > targetLane) input = [-1, 1];       // SW: shed lanes
        else input = [1, 1];                          // SE: hold
      }
    }
    missionStep(M, input);
  }
  console.log(label, '->', M.result, 'trace', M.trace, M.alarm ? M.alarm.mode : '');
  return M;
}

run(-8, 'glidepath 1 (straight, lane  -8)');
run(-16, 'glidepath 2 (dogleg,  lane -16)');
run(-12, 'wrong lane   (dogleg,  lane -12)');
for (const t0 of [7, 19]) run(-16, `glidepath 2 @ t0=${t0}          `, t0);
