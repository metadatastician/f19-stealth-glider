// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const strip = src => src
  .split('\n')
  .filter(l => !/^\s*import\s/.test(l))
  .map(l => l.replace(/^export\s+/, ''))
  .join('\n');

const core = ['engine.mjs', 'mission.mjs', 'level.mjs'].map(f => strip(readFileSync(f, 'utf8'))).join('\n\n');
const ui = strip(readFileSync('ui.js', 'utf8'));
const js = core + '\n\n' + ui;

// check 1: syntax of the exact shipped script
writeFileSync('/tmp/f19-bundle.js', js);
execSync('node --check /tmp/f19-bundle.js', { stdio: 'inherit' });

// check 2: the transformed CORE still flies the witness (same transform as shipped)
writeFileSync('/tmp/f19-core.mjs', core + `
const L = buildLevel();
const M = createMission(L);
for (let t = 0; t < 1200 && !M.result; t++) missionStep(M, null);
if (M.result !== 'LANDED' || M.trace !== 0) throw new Error('bundle smoke failed: ' + M.result + ' trace ' + M.trace);
console.log('bundle core smoke: LANDED trace 0');
`);
execSync('node /tmp/f19-core.mjs', { stdio: 'inherit' });

const css = `
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0}
body{background:#010805;color:#37f08a;font-family:'IBM Plex Mono','Cascadia Mono',ui-monospace,monospace;
  display:flex;min-height:100vh;align-items:center;justify-content:center;padding:10px}
#f19{max-width:${172 * 6 + 4}px;width:100%}
.bar{display:flex;align-items:center;gap:14px;padding:7px 12px;border:1px solid #1c4a30;background:#04170e;font-size:12px}
.bar.top{border-bottom:none}.bar.bot{border-top:none;flex-wrap:wrap}
.ttl{color:#ffc23e;letter-spacing:2px;font-weight:700}
.sub{color:#7a5a16;letter-spacing:1px}
.tick{color:#ffb000;margin-left:auto;letter-spacing:1px;min-width:20ch;text-align:right;animation:tk 2.4s steps(2) infinite}
@keyframes tk{50%{opacity:.75}}
.gen{color:#1d9a58}.gen b{color:#37f08a}
.stage{position:relative;border:1px solid #1c4a30;line-height:0}
canvas#cv{width:100%;height:auto;image-rendering:pixelated;background:#03120a;display:block}
.scan{position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 1px,transparent 1px 3px)}
.scan::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.5))}
.card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none}
.card.show{display:flex}
.card>*{display:none}
.card.show{background:rgba(1,8,5,.45)}
.card.show h1,.card.show p,.card.show ol{display:block}
.card.show>h1{position:static}
.card h1{color:#ffc23e;font-size:17px;letter-spacing:2px;margin-bottom:10px}
.card.show{padding:20px}
.card.show{flex-direction:column}
.card.show>*{max-width:640px;background:rgba(3,18,10,.92);border-left:2px solid #ffc23e;border-right:2px solid #ffc23e;
  padding:6px 18px;font-size:12.5px;line-height:1.55;color:#9fe8bf}
.card.show>h1{padding-top:14px}
.card.show>*:last-child{padding-bottom:14px}
.card p.warn{color:#ff7a66}
.card p.stats{color:#ffb000}
.card p.go{color:#ffc23e;letter-spacing:1px}
.card ol{padding-left:34px}
.card li{margin:6px 0}
.card b,.card i{color:#eafcff}
.lbl{color:#7a5a16;font-size:10px;letter-spacing:1px}
.beat i{display:inline-block;width:9px;height:9px;border:1px solid #7a5a16;border-radius:50%;margin-right:4px;vertical-align:middle}
.beat i.on{background:#ffb000;box-shadow:0 0 6px #ffb000}
.beat i.latch{border-color:#ffc23e}
.rose i{font-style:normal;color:#1c4a30;margin-right:3px;font-size:14px}
.rose i.on{color:#7ef3ff;text-shadow:0 0 6px #7ef3ff}
.rose i.q{color:#ffc23e;animation:tk .5s steps(2) infinite}
.trace{color:#37f08a;min-width:4ch;display:inline-block}
.trace.hot{color:#ffb000;text-shadow:0 0 6px #ffb000}
.keys{margin-left:auto;color:#1d9a58;font-size:10px}
.tpad{position:absolute;left:8px;bottom:8px;display:grid;grid-template-columns:52px 52px;gap:6px}
.tpad button{background:rgba(3,18,10,.8);border:1px solid #1c4a30;color:#7ef3ff;font-size:20px;height:44px;font-family:inherit}
.tpad #tgo{grid-column:1/3;color:#ffc23e;font-size:12px;letter-spacing:2px}
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>F19 Stealth Glider — Operation Nightstep</title>
<style>${css}</style></head>
<body><div id="f19"></div>
<script>
${js}
</script></body></html>`;

writeFileSync('f19-stealth-glider.html', html);
console.log('built f19-stealth-glider.html:', (html.length / 1024).toFixed(1), 'KB');
