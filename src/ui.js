// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
// F19 Stealth Glider — UI shell. Everything below the DOM boundary is the audited core.
'use strict';

function bootF19() {
  const CELL = 6;
  const L = buildLevel();
  const CW = L.W * CELL, CH = L.H * CELL;

  // ---------- DOM ----------
  const root = document.getElementById('f19');
  root.innerHTML = `
    <div class="bar top">
      <span class="ttl">F19 STEALTH GLIDER</span><span class="sub">OPERATION NIGHTSTEP</span>
      <span class="tick" id="tick">SYSTEMS NOMINAL</span>
      <span class="gen">GEN <b id="gen">0</b></span>
    </div>
    <div class="stage"><canvas id="cv" width="${CW}" height="${CH}"></canvas>
      <div class="scan"></div><div class="card" id="card"></div>
      <div class="tpad" id="tpad" hidden>
        <button data-h="-1,-1">◤</button><button data-h="1,-1">◥</button>
        <button data-h="-1,1">◣</button><button data-h="1,1">◢</button>
        <button id="tgo">LAUNCH</button>
      </div>
    </div>
    <div class="bar bot">
      <span class="lbl">BEAT</span><span class="beat" id="beat"></span>
      <canvas id="dial" width="56" height="56"></canvas>
      <span class="lbl">HDG</span><span class="rose" id="rose"></span>
      <span class="lbl">TRACE</span><b class="trace" id="trace">0</b>
      <span class="lbl">SPD</span><b id="spd">2</b>
      <span class="keys">←↑↓→ steer · ENTER launch · SPACE recon · 1/2/3 speed · H ledger</span>
    </div>`;
  const cv = document.getElementById('cv'), cx = cv.getContext('2d');
  const dial = document.getElementById('dial'), dx = dial.getContext('2d');
  const $ = id => document.getElementById(id);

  // ---------- palette ----------
  const C = {
    bg: '#03120a', grid: '#06301c',
    cell: '#37f08a', cellDim: '#1d9a58',
    glow: 'rgba(55,240,138,',
    player: '#eafcff', playerGlow: '#7ef3ff',
    sensor: '#ff5544', sensorDim: '#7a1f18',
    gold: '#ffc23e', amber: '#ffb000',
    div: 'rgba(255,176,0,',
    stream: 'rgba(255,70,60,0.05)',
  };

  // ---------- static sets ----------
  const sensorSet = new Set();
  for (const s of L.sensors) for (const [x, y] of s.cells) sensorSet.add(y * L.W + x);
  const hangarSet = new Set(L.hangarCells.map(([x, y]) => y * L.W + x));

  // ---------- state ----------
  let M = createMission(L);
  let lastAlive = new Int32Array(L.W * L.H).fill(-99);
  let mode = 'BRIEF';          // BRIEF | RUN | DEBRIEF
  let ledger = false, paused = false;
  let desired = [...L.spawnHeading];
  let speed = 2; const GPS = [0, 8, 16, 30];
  let launchT = 0, endSnapshot = null;
  let acc = 0, lastTs = 0;

  function markAlive() { const w = M.world, la = lastAlive; for (let i = 0; i < w.length; i++) if (w[i]) la[i] = M.t; }
  markAlive();

  function newMission() {
    M = createMission(L); lastAlive = new Int32Array(L.W * L.H).fill(-99);
    desired = [...L.spawnHeading]; endSnapshot = null; paused = false; markAlive();
  }

  // ---------- flavors ----------
  function crashFlavor() {
    const z = L.hangarZone; let eaterOK = true, extras = 0, any = 0;
    const eset = new Set(L.hangarCells.map(([x, y]) => `${x},${y}`));
    for (let y = z[1]; y <= z[3]; y++) for (let x = z[0]; x <= z[2]; x++) {
      const v = M.world[y * L.W + x]; if (v) any++;
      if (eset.has(`${x},${y}`)) { if (!v) eaterOK = false; } else if (v) extras++;
    }
    if (!any) return ['FIREBALL ON THE APRON', 'Nothing left of airframe or hangar. The touchdown lane is one cell wide for a reason.'];
    if (!eaterOK) return ['YOU DEMOLISHED YOUR OWN HANGAR', 'The catch mechanism is gone. Wrong lane — the eater only swallows a glider dead on the marked line.'];
    return ['DEBRIS ON THE APRON', 'The hangar stands, but wreckage is strewn across the zone. Close. Not clean.'];
  }
  function debriefText() {
    const dur = (M.endT ?? M.t) - launchT;
    const trFinal = endSnapshot ? endSnapshot.trace : M.trace;
    const stats = `launch tick ${launchT} · flight ${dur} gen · trace ${trFinal} · reacquisitions ${M.reacquired || 0}`;
    let head = '', body = '';
    if (M.result === 'LANDED' && M.trace === 0) { head = 'THE MISSION NEVER HAPPENED'; body = 'Wheels down, hangar intact, zero divergence. The world cannot prove you were ever in it.'; }
    else if (M.result === 'LANDED') { head = 'WHEELS DOWN — BUT THE SKY REMEMBERS'; body = `Clean catch, yet ${endSnapshot ? endSnapshot.trace : M.trace} cells diverged from the counterfactual along the way. Somebody may put it together.`; }
    else if (M.result === 'CRASH_LANDING') { const f = crashFlavor(); head = f[0]; body = f[1]; }
    else if (M.result === 'DETECTED') {
      head = M.alarm.mode === 'DIRECT' ? `RADAR PAINT — ${M.alarm.sensor} HAD YOU` : `YOUR WAKE REACHED ${M.alarm.sensor}`;
      body = M.alarm.mode === 'DIRECT'
        ? 'You flew into the sensor\'s lap. Contact splashed cells straight onto the array.'
        : 'You never touched it. But the ash you kicked up crawled across the garden and brushed the array. Divergence is loud.';
    }
    else if (M.result === 'MIA') { head = 'CONTACT LOST — AIRFRAME NOT RECOVERED'; body = 'The scan found no surviving glider that isn\'t also in the counterfactual. Whatever flies on out there, it isn\'t you.'; }
    else if (M.result === 'ABORT_EDGE') { head = 'LEFT THE OPERATIONS AREA'; body = 'The world is bounded and outside is dead. The mission does not follow you off the map.'; }
    return `<h1>${head}</h1><p>${body}</p><p class="stats">${stats}</p><p class="go">ENTER — refly · H — honesty ledger</p>`;
  }
  const BRIEF = `
    <h1>OPERATION NIGHTSTEP</h1>
    <p>South of the fence line sits a friendly hangar. Between you and it: a sensor garden, a block fence with <b>one breach</b>, and the enemy searchlight — a period-30 glider stream down the eastern border.</p>
    <p class="warn">The searchlight has been flown against at all 30 phases. <b>0/30 clean crossings.</b> It is a wall. Fly the breach.</p>
    <p>Steer with ←↑↓→ (or WASD). Turns latch only on <b>beat 1</b> — watch the dots. Any live cell within Chebyshev 2 of your airframe is <b>contact</b>: you become real and physics owns you. Stay 3 clear and the world cannot see you.</p>
    <p>Land by flying the gold glidepath into the hangar catch — it is clean on <b>exactly one lane</b>. Sensors alarm on divergence; your trace is every cell where the world differs from a world without you.</p>
    <p class="go">ENTER — launch (the clock is live · your launch tick is your choice) · H — honesty ledger</p>`;
  const LEDGER = `
    <h1>HONESTY LEDGER</h1>
    <ol>
      <li>The world is pure Conway B3/S23 on a bounded 172×108 grid; outside is dead. Every pattern — gun, stream, fence, gardens, sensors, hangar — is real and evolves by the rule, always.</li>
      <li>The one fiction: pre-contact, your airframe is a kinematic overlay flying true glider shapes and speeds. If any world cell comes within Chebyshev 2 of you, interaction is possible, so you are spliced into the grid and the rule owns you. Chebyshev ≥3 is the exact independence criterion — while you keep it, "not being in the world" and "being in it" are provably indistinguishable.</li>
      <li>Detection is counterfactual: a shadow world without your splices runs in parallel. A sensor alarms when one of its cells differs between worlds. TRACE counts every cell that has ever differed.</li>
      <li>The searchlight is verified impassable: a crossing glider was swept against the stream at all 30 phases; minimum Chebyshev distance 0–1 every time. Consecutive stream gliders sit ~15 diagonal units apart and a crossing needs ~17 of clearance. That is why the mission is the breach.</li>
      <li>Landing is a real eater1 catch, verified across approach lanes: exactly one clean lane exists. (An earlier "second clean lane" was traced to a harness out-of-bounds bug, since fixed — the claim died in testing and stays dead.)</li>
      <li>Reacquisition after contact only accepts a glider that does <i>not</i> exist in the shadow world — you cannot hijack enemy traffic and call it your airframe.</li>
    </ol>
    <p class="go">H / ESC — close</p>`;

  // ---------- input ----------
  const setH = (ax, v) => { desired = [...(M.player.queued || desired)]; desired[ax] = v; };
  addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'h' || k === 'H') { ledger = !ledger; return; }
    if (k === 'Escape') { ledger = false; return; }
    if (ledger) return;
    if (k === 'Enter') {
      if (mode === 'BRIEF') { mode = 'RUN'; launchT = M.t; }
      else if (mode === 'DEBRIEF') { newMission(); mode = 'BRIEF'; }
      return;
    }
    if (k === ' ') { if (mode === 'RUN') paused = !paused; e.preventDefault(); return; }
    if (k === '1' || k === '2' || k === '3') { speed = +k; return; }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') setH(0, -1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') setH(0, 1);
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') setH(1, -1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') setH(1, 1);
  });
  if ('ontouchstart' in window) {
    const tp = $('tpad'); tp.hidden = false;
    tp.querySelectorAll('button[data-h]').forEach(b => b.addEventListener('touchstart', ev => {
      ev.preventDefault(); desired = b.dataset.h.split(',').map(Number);
    }));
    $('tgo').addEventListener('touchstart', ev => {
      ev.preventDefault();
      if (mode === 'BRIEF') { mode = 'RUN'; launchT = M.t; }
      else if (mode === 'DEBRIEF') { newMission(); mode = 'BRIEF'; }
    });
  }

  // ---------- sim advance ----------
  function advance(gens) {
    for (let i = 0; i < gens; i++) {
      if (mode === 'RUN' && !M.result) missionStep(M, desired);
      else ambientStep(M);
      markAlive();
      if (mode === 'RUN' && M.result && !endSnapshot) {
        endSnapshot = { trace: M.trace }; mode = 'DEBRIEF';
      }
    }
  }

  // ---------- drawing ----------
  const px = (x, y) => [x * CELL, y * CELL];
  function drawStatic() {
    // searchlight band
    cx.fillStyle = C.stream;
    for (let y = 0; y < L.H; y++) for (let lane = 12; lane <= 16; lane++) {
      const x = y + L.streamLane + (lane - 14); if (x < 0 || x >= L.W) continue;
      cx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    // gun box
    cx.strokeStyle = 'rgba(255,176,0,0.35)'; cx.setLineDash([3, 3]);
    cx.strokeRect(L.gunBox[0] * CELL + .5, L.gunBox[1] * CELL + .5, L.gunBox[2] * CELL, L.gunBox[3] * CELL);
    cx.setLineDash([]);
    cx.fillStyle = 'rgba(255,176,0,0.5)'; cx.font = '9px monospace';
    cx.fillText('EMITTER', L.gunBox[0] * CELL + 4, (L.gunBox[3]) * CELL + 10);
    cx.fillText('SEARCHLIGHT — VERIFIED WALL', 96 * CELL, 50 * CELL);
    // glidepath
    cx.strokeStyle = 'rgba(255,194,62,0.4)'; cx.setLineDash([6, 6]);
    cx.beginPath();
    cx.moveTo((L.spawn[0] + 1.5) * CELL, (L.spawn[1] + 1.5) * CELL);
    cx.lineTo((L.hangarAt[0] + 1.5) * CELL, (L.hangarAt[1] + 1.5) * CELL);
    cx.stroke(); cx.setLineDash([]);
    // breach brackets
    const by = 54 * CELL;
    cx.strokeStyle = C.gold; cx.lineWidth = 1.5;
    for (const [bx, dir] of [[38 * CELL, 1], [56 * CELL, -1]]) {
      cx.beginPath();
      cx.moveTo(bx + dir * 6, by - 8); cx.lineTo(bx, by - 8); cx.lineTo(bx, by + 20); cx.lineTo(bx + dir * 6, by + 20);
      cx.stroke();
    }
    cx.lineWidth = 1;
    cx.fillStyle = 'rgba(255,194,62,0.6)'; cx.fillText('BREACH', 42 * CELL, 52 * CELL);
    // hangar zone
    const z = L.hangarZone;
    cx.strokeStyle = 'rgba(255,194,62,0.55)'; cx.setLineDash([4, 4]);
    cx.strokeRect(z[0] * CELL + .5, z[1] * CELL + .5, (z[2] - z[0] + 1) * CELL, (z[3] - z[1] + 1) * CELL);
    cx.setLineDash([]);
    cx.fillText('HANGAR', z[0] * CELL, z[1] * CELL - 4);
    // sensor rings + labels
    cx.strokeStyle = 'rgba(255,85,68,0.4)';
    for (const s of L.sensors) {
      let sx = 0, sy = 0; for (const [x, y] of s.cells) { sx += x; sy += y; }
      sx = sx / s.cells.length * CELL + CELL / 2; sy = sy / s.cells.length * CELL + CELL / 2;
      cx.beginPath(); cx.arc(sx, sy, 16, 0, 7); cx.stroke();
      cx.fillStyle = 'rgba(255,85,68,0.6)'; cx.fillText(s.name, sx + 14, sy - 12);
      cx.strokeStyle = 'rgba(255,85,68,0.4)';
    }
  }

  function draw() {
    cx.fillStyle = C.bg; cx.fillRect(0, 0, CW, CH);
    drawStatic();
    const w = M.world, t = M.t;
    // afterglow + divergence
    for (let i = 0; i < w.length; i++) {
      const x = i % L.W, y = (i - x) / L.W;
      if (!w[i]) {
        const age = t - lastAlive[i];
        if (age >= 0 && age < 14) { cx.fillStyle = C.glow + (0.32 * (1 - age / 14)) + ')'; cx.fillRect(x * CELL, y * CELL, CELL, CELL); }
        if (M.diverged[i]) { cx.fillStyle = C.div + '0.22)'; cx.fillRect(x * CELL + 2, y * CELL + 2, 2, 2); }
      }
    }
    // live cells
    for (let i = 0; i < w.length; i++) if (w[i]) {
      const x = i % L.W, y = (i - x) / L.W;
      cx.fillStyle = sensorSet.has(i) ? C.sensor : hangarSet.has(i) ? C.gold : C.cell;
      cx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
    }
    // player
    if (mode !== 'DEBRIEF' && M.state === 'FLIGHT') {
      const cells = playerCells(M);
      cx.save(); cx.shadowColor = C.playerGlow; cx.shadowBlur = 8; cx.fillStyle = C.player;
      const dim = mode === 'BRIEF';
      cx.globalAlpha = dim ? 0.55 + 0.25 * Math.sin(performance.now() / 220) : 1;
      for (const [x, y] of cells) cx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
      cx.restore(); cx.globalAlpha = 1;
      if (dim) { cx.fillStyle = C.playerGlow; cx.font = '9px monospace'; cx.fillText('READY', (M.player.anchor[0] + 4) * CELL, (M.player.anchor[1]) * CELL); }
    }
    if (M.state === 'CONTACT') {
      const [ax, ay] = M.contactPos;
      const blink = (Math.floor(performance.now() / 140) % 2) === 0;
      cx.strokeStyle = blink ? '#ff6655' : '#992222';
      cx.beginPath(); cx.arc((ax + 1.5) * CELL, (ay + 1.5) * CELL, 20 + (M.contactT % 8), 0, 7); cx.stroke();
    }
    if (M.state === 'LANDING') {
      const z = L.hangarZone, p = 0.5 + 0.5 * Math.sin(performance.now() / 160);
      cx.strokeStyle = `rgba(255,194,62,${0.35 + 0.5 * p})`; cx.lineWidth = 2;
      cx.strokeRect(z[0] * CELL - 2, z[1] * CELL - 2, (z[2] - z[0] + 1) * CELL + 4, (z[3] - z[1] + 1) * CELL + 4);
      cx.lineWidth = 1;
    }
    drawDial(); drawHud();
  }

  function drawDial() {
    dx.clearRect(0, 0, 56, 56);
    const ph = M.t % 30;
    for (let s = 0; s < 30; s++) {
      const a = (s / 30) * Math.PI * 2 - Math.PI / 2;
      const r0 = 18, r1 = 25, lit = s === ph;
      dx.strokeStyle = lit ? C.amber : 'rgba(255,176,0,0.22)';
      dx.lineWidth = lit ? 3 : 1;
      dx.beginPath();
      dx.moveTo(28 + r0 * Math.cos(a), 28 + r0 * Math.sin(a));
      dx.lineTo(28 + r1 * Math.cos(a), 28 + r1 * Math.sin(a));
      dx.stroke();
    }
    dx.fillStyle = 'rgba(255,176,0,0.7)'; dx.font = '8px monospace'; dx.textAlign = 'center';
    dx.fillText(String(ph).padStart(2, '0'), 28, 31);
    dx.textAlign = 'left';
  }

  function drawHud() {
    $('gen').textContent = M.t;
    const ph = M.state === 'FLIGHT' ? M.player.phase : M.t % 4;
    $('beat').innerHTML = [0, 1, 2, 3].map(i =>
      `<i class="${i === ph ? 'on' : ''}${i === 0 ? ' latch' : ''}"></i>`).join('');
    const hk = (M.player.queued || (mode === 'RUN' ? desired : M.player.heading)).join(',');
    const cur = M.player.heading.join(',');
    $('rose').innerHTML = [['-1,-1', '◤'], ['1,-1', '◥'], ['-1,1', '◣'], ['1,1', '◢']].map(([k2, g]) =>
      `<i class="${k2 === cur ? 'on' : ''} ${k2 === hk && k2 !== cur ? 'q' : ''}">${g}</i>`).join('');
    const tr = $('trace');
    tr.textContent = endSnapshot ? endSnapshot.trace : M.trace;
    tr.className = 'trace' + (M.trace > 0 ? ' hot' : '');
    $('spd').textContent = speed;
    const tk = $('tick');
    if (mode === 'BRIEF') tk.textContent = 'AWAITING LAUNCH — CLOCK IS LIVE';
    else if (M.state === 'FLIGHT') tk.textContent = paused ? 'RECON HOLD' : 'AIRBORNE — TURNS LATCH ON BEAT 1';
    else if (M.state === 'CONTACT') tk.textContent = `AIRFRAME CONTACT — REACQUIRING ${26 - M.contactT}`;
    else if (M.state === 'LANDING') tk.textContent = `TOUCHDOWN SEQUENCE ${M.landT}/70`;
    else if (M.result) tk.textContent = M.result.replace('_', ' ');
    const card = $('card');
    if (ledger) { card.className = 'card show'; card.innerHTML = LEDGER; }
    else if (mode === 'BRIEF') { card.className = 'card show'; card.innerHTML = BRIEF; }
    else if (mode === 'DEBRIEF') { card.className = 'card show'; card.innerHTML = debriefText(); }
    else card.className = 'card';
  }

  // ---------- loop ----------
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
    if (!(paused && mode === 'RUN') && !ledger) {
      acc += dt * GPS[speed];
      const n = Math.floor(acc); acc -= n;
      if (n) advance(Math.min(n, 8));
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootF19);
else bootF19();
