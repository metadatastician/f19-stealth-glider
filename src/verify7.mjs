// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { step } from './engine.mjs';
import { createMission, missionStep } from './mission.mjs';
import { buildLevel } from './level.mjs';

const L = buildLevel();
const M = createMission(L);
let turned = false, lastState = M.state;
for (let t = 0; t < 1600 && !M.result; t++) {
  let input = null;
  if (M.state === 'FLIGHT' && !turned && M.player.phase === 0 &&
      M.player.anchor[0] + M.player.anchor[1] === L.turnSum) { input = [1, -1]; turned = true; console.log('t=' + M.t, 'TURN at', M.player.anchor.join(',')); }
  missionStep(M, input);
  if (M.state !== lastState) {
    console.log('t=' + M.t, lastState, '->', M.state, 'anchor', M.player.anchor.join(','), 'heading', M.player.heading.join(','));
    lastState = M.state;
  }
}
console.log('result:', M.result, 'trace', M.trace, 'turned:', turned);
for (const s of M.splices) console.log('splice at t=' + s.t, 'cells', JSON.stringify(s.cells));
