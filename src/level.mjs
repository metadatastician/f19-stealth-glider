// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
// Operation Nightstep v2 — level data. Geometry justified in verify9 audits.
// Topology: region A (north) | fence row y=54 with ONE breach | region B (south, hangar).
// Eastern border = the gun stream (lane 14): verified impassable (verify8: 0/30 clean crossings).
import { xf, P } from './engine.mjs';

const blinkV = xf(P.blinker, 2);
const E4 = xf(P.eater1, 4), E2 = xf(P.eater1, 2);

export function buildLevel(rdr1 = [30, 31], withSensors = true) {
  const W = 172, H = 108;

  const hangarAt = [86, 94];                    // sym-4 eater: catches SE gliders
  const hangarCells = E4.map(([x, y]) => [x + hangarAt[0], y + hangarAt[1]]);
  let hx0 = Infinity, hy0 = Infinity, hx1 = -1, hy1 = -1;
  for (const [x, y] of hangarCells) { hx0 = Math.min(hx0, x); hy0 = Math.min(hy0, y); hx1 = Math.max(hx1, x); hy1 = Math.max(hy1, y); }

  const fenceX = [0, 8, 16, 24, 32, 36, 56, 60]; // blocks at y=54; breach between posts 36/56 (diagonal-clearance verified)
  const fence = fenceX.map(x => [P.block, x, 54]);

  const terrain = [
    ...fence,
    // garden strand — east flank of the flight lane, d=y-x in [-8,-3]
    [P.blinker, 23, 17], [P.beehive, 30, 24], [P.tub, 37, 31], [blinkV, 44, 38], [P.boat, 51, 45],
    // west flank scenery (region A)
    [P.block, 14, 36], [P.blinker, 24, 46], [P.beehive, 10, 42],
    // region B scenery (west flank)
    [P.block, 48, 76], [P.blinker, 56, 86],
  ];
  const sensors = withSensors ? [
    { name: 'RDR-1', cells: P.beehive.map(([x, y]) => [x + rdr1[0], y + rdr1[1]]) },
    { name: 'RDR-2', cells: P.beehive.map(([x, y]) => [x + 62, y + 58]) },
    { name: 'RDR-3', cells: P.beehive.map(([x, y]) => [x + 74, y + 68]) },
  ] : [];
  const stamps = [
    [P.gun, 2, 2], [E4, 114, 100], [E4, ...hangarAt],
    ...terrain,
    ...sensors.map(s => [s.cells, 0, 0]),
  ];
  return {
    W, H, stamps, sensors, terrain, hangarCells,
    hangarZone: [hx0 - 6, hy0 - 6, hx1 + 6, hy1 + 6],
    spawn: [8, 16], spawnHeading: [1, 1],
    streamLane: 14,
    glidepaths: [-8],                           // the ONE clean SE landing lane (lambda=0, verified; no second lane exists)
    breach: { y: 54, anchors: [44, 47] },
    gunBox: [0, 0, 40, 13],
    absorberAt: [114, 100], hangarAt,
    fenceX,
  };
}
