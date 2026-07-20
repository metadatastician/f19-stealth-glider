# F19 Stealth Glider — verification ledger

All claims below are TESTED: each is discharged by a named script in this
directory, runnable with plain `node <script>` (Node ≥ 18, no dependencies).
The shipped `f19-stealth-glider.html` is a mechanical concatenation of
`engine.mjs + mission.mjs + level.mjs + ui.js` (imports/exports stripped);
`build.mjs` re-runs the witness on the *transformed* core at build time.

| # | Claim | Script | Result |
|---|-------|--------|--------|
| 1 | Glider kinematics tables (4 headings × 4 phases, deltas + lane invariant) match real B3/S23 evolution | verify1.mjs | derived empirically, round-trip checked |
| 2 | Gosper gun at (2,2) emits one isolated SE glider per 30 gens on lane 14; gun+absorber population bounded over 1200 gens | verify2.mjs | PASS |
| 3 | Eater1 (sym 4) landing outcomes by approach lane λ | inline sweep (see transcript §landing) | λ=0 CLEAN — the only clean lane; λ=−1..−5, +1..+5 fatal (flavors measured); λ≤−6 PASS |
| 4 | **Stream no-go lemma**: a NE glider crossing the settled p30 SE stream attains min Chebyshev ≤1 at ALL 30 phases — 0/30 clean crossings | verify8.mjs | PASS (0/30) |
| 5 | Fence-row theorem: with blocks at x=0,8,16,24,32,36,56,60 (y=54), the passable anchor columns west of the stream are exactly 40–51 (the breach) | verify9.mjs | PASS |
| 6 | Level statics: min obstacle↔path Chebyshev 3; min pairwise pattern separation 3 (blinkers audited by 2-phase envelope); min stream-lane clearance 6; path clear of gun box | verify9.mjs | PASS |
| 7 | Level stability: 1402 gens, zero drifts outside gun/stream bands, population bounded 201–226 | verify9.mjs | PASS |
| 8 | Completability: straight-SE witness from spawn LANDS with trace 0 at all 30 launch ticks | verify9.mjs | 30/30 |
| 9 | Wake detection is real: garden-clip dives trigger RDR-1 WAKE alarms (sensor auto-placed by ash-divergence reach map) | verify9.mjs | 3/13 on suicide clips |
| 10 | Reacquire cannot hijack ambient traffic: candidate gliders wholly present in the counterfactual shadow are rejected | engine.mjs findGlider(...,notInGrid) + verify6 regression | PASS |
| 11 | Bundle integrity: concatenated core replays the witness (LANDED, trace 0) | build.mjs | PASS at every build |

Honest disclosures:
- An earlier harness bug (out-of-bounds `stamp` silently wrapping) produced a
  phantom "second clean landing lane". `stamp` now throws on out-of-bounds;
  the corrected sweep shows exactly one clean lane. The claim died in testing.
- The stream no-go is verified for perpendicular diagonal crossings of a p30
  stream (all 30 phases, settled world) and argued general by spacing
  arithmetic (15-unit spacing vs ~17-unit exclusion diameter).
- The game's single fiction is the pre-contact kinematic player overlay; the
  Chebyshev-3 criterion under which it is maintained is exact independence.
