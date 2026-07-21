<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk> -->

# Architecture

Four source modules, one bundler, ten verification scripts, zero dependencies.
This document explains how they fit together and — more usefully — *why the
seams are where they are*.

## The shape

```
                    ┌──────────────┐
                    │  engine.mjs  │  B3/S23 substrate. Knows nothing
                    │              │  about players, missions, or levels.
                    └──────┬───────┘
                           │ step / stamp / patterns / glider kinematics
              ┌────────────┴────────────┐
              │                         │
     ┌────────▼───────┐        ┌────────▼────────┐
     │  mission.mjs   │        │   level.mjs     │  FROZEN geometry.
     │                │◄───────┤                 │  Data, not behaviour.
     │ player overlay │        └─────────────────┘
     │ contact rule   │
     │ sensors, trace │
     └────────┬───────┘
              │ mission state
        ┌─────▼──────┐              ┌──────────────────┐
        │   ui.js    │              │ verify1..10.mjs  │  Import the core
        │  render +  │              │                  │  directly. No UI.
        │   input    │              └──────────────────┘
        └─────┬──────┘
              │
        ┌─────▼─────────┐
        │  build.mjs    │  Concatenates the four modules, strips imports/exports,
        │               │  replays the witness on the TRANSFORMED core.
        └─────┬─────────┘
              ▼
     f19-stealth-glider.html   ← the shipped artefact
```

## Layer by layer

### `engine.mjs` — the substrate

Pure Conway's Game of Life, B3/S23, on a **bounded** grid: cells outside the
grid are permanently dead, never wrapped. Nothing here knows what a "player" or
a "level" is.

It provides `mkGrid` / `step`, RLE parsing, `norm` / `key` for canonical pattern
comparison, `xf(cells, sym)` for the eight square symmetries, `stamp`, a named
pattern library `P` (glider, eater1, block, blinker, beehive, boat, tub, and the
Gosper gun), and `findGlider`.

Two details are load-bearing rather than incidental:

**`stamp` throws on out-of-bounds.** It does not clip, and it does not wrap. It
used to absorb such writes silently, and a landing-lane sweep consequently
reported a *second clean lane* that did not exist — a false positive that
survived review because the harness was lying rather than failing. The strictness
is a correctness gate. Sweeps needing negative coordinates enlarge the grid and
co-shift the whole configuration instead; Life is translation-invariant away from
borders, so the measured **relative** lane is preserved.

**Glider kinematics are derived, not tabulated.** `deriveGlider()` evolves an
actual glider and asserts period 4 with `(1,1)` displacement — c/4 diagonal —
then `gliderTables()` builds all four headings by mirroring. Hand-written tables
would be a place for the code and the substrate to silently disagree.

### `level.mjs` — frozen geometry

Level data, and the single source of truth for it. Operation Nightstep v2:
172×108, spawn at `[8,16]` heading SE, hangar at `[86,94]`, a fence row at
`y=54` with posts at `x = 0, 8, 16, 24, 32, 36, 56, 60`, and a Gosper gun in the
north-west corner firing a period-30 stream down lane 14.

The topology is deliberately simple: **region A (north) → one fence breach →
region B (south, hangar)**, with the gun stream forming an impassable eastern
border.

This module is *frozen*. It is the design, and it is the thing most likely to be
"fixed" into meaninglessness — see [why](#why-the-stream-is-a-wall).

### `mission.mjs` — the rules of engagement

Player overlay, contact detection, sensors, trace accounting, hangar splice, and
ambient stepping after the mission ends.

The **contact rule** is `nearWorld(M, cells, 2)` — Chebyshev radius 2. The exact
independence criterion is Chebyshev **3**: at separation ≥ 3 the player's cells
provably cannot influence the substrate's next generation, nor vice versa. That
is what licenses the project's single admitted fiction, a pre-contact kinematic
overlay for the player glider: while the player is provably independent, moving
them by table rather than by simulation changes nothing observable.

**Player identity comes from a counterfactual shadow.** A shadow world is
stepped *without* the player; the player is then the glider that is present in
the real world and absent from the shadow. `findGlider(..., notInGrid)` rejects
any candidate wholly present in the shadow. This is why reacquisition cannot
hijack an ambient gun glider — and it means the substrate needs no per-cell
tagging, staying genuinely uniform.

### `ui.js` — presentation only

Canvas rendering and input. Carries no gameplay truth; deleting it would leave
the game unplayable but every verification claim intact. That separation is what
lets the verification scripts import the core directly and run headless under
plain `node`.

### `build.mjs` — the bundler

Concatenates the four modules in dependency order, strips `import`/`export`
statements, and wraps the result in a single HTML file.

The important part is what it does *next*: it **replays the witness route on the
transformed core** and asserts `LANDED` with trace 0. The shipped artefact is
therefore verified *as shipped*, not merely as authored — a concatenation bug
that broke gameplay would fail the build rather than reaching a player. CI
additionally asserts the committed HTML is byte-identical to a fresh rebuild.

## Why the stream is a wall

The central design fact is a **negative** result.

A Gosper gun emits one glider every 30 generations. Gliders travel c/4 diagonally,
so consecutive gliders in the stream sit about **15 units** apart. A glider
crossing that stream perpendicularly needs a clear corridor of roughly **17
units** — its own extent plus the separation at which it stops interacting.

15 < 17, so **no phase gap is ever wide enough**. This is not a tuning problem
that a better launch time would solve; it is arithmetic.

`verify8.mjs` confirms it empirically without any proximity rule at all, using
true cell-overlap only: across all 30 launch phases, 21 phases overlap outright
and the remaining 9 pass at Chebyshev 1 — adjacency that annihilates both
patterns on the next generation. **0 of 30 clean crossings.**

So the level does not ask you to cross the stream. The stream is the eastern
wall, and the only way south is the fence breach — whose safe lane is
phase-independent by construction.

This is also why the contact rule must not be relaxed. Adopting overlap-only
contact would make the crossing *feel* passable and turn a geometric
impossibility into a twitch challenge. The automaton would become decoration,
which is the one outcome this project defines as failure.

## Verification architecture

Scripts import the core directly and run headless. They split into two kinds:

**The cited ledger** — `verify1`, `2`, `3`, `8`, `9`, plus `build` — discharges
the claims in [`VERIFICATION.md`](VERIFICATION.md). CI runs these on every push
and fails on any red.

**Exploratory searches** — `verify4`, `5`, `6`, `7`, `10` — are design searches,
several with their own alternative `buildLevel`. Their "no viable candidate"
output *is* the finding. They are excluded from CI (a negative result should not
turn the build red) and retained in the tree so the search space already ruled
out stays visible. `just verify-all` runs everything.

Claims are quantified over **all 30 launch phases**, never sampled.

## Why there is no framework here

No bundler, no transpiler, no test runner, no linter, no package manager step.
The verification scripts are the test suite, `node` is the runner, and
`build.mjs` is 100-odd lines of string concatenation.

This is a deliberate trade. The project's value is a geometric argument backed by
exhaustive sweeps; anything that stands between a reader and running
`node verify8.mjs` from a bare checkout is a cost with no matching benefit. Zero
dependencies also means the security posture is genuinely small rather than
merely asserted — see [SECURITY.md](SECURITY.md).
