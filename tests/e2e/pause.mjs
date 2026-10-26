// Pause de la simulation (lot A) : heure du monde, besoins du cheval, délais et chronos suspendus pendant le
// téléphone, un dialogue ou un écran de choix ; reprise ensuite. Usage : BASE=… node tests/e2e/pause.mjs
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 667, height: 308 }, isMobile: true, hasTouch: true })).newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart=1`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.waitForTimeout(1500);
// Le tutoriel s'ouvre sur un dialogue d'accueil (la simulation est alors suspendue) : on le termine.
const dismiss = async () => { for (let i = 0; i < 4 && (await page.$('.overlay .card-actions button')); i++) { await page.tap('.overlay .card-actions button:last-child'); await page.waitForTimeout(300); } await page.evaluate(() => { const g = window.__game; let n = 0; while (g.hud.dialogActive && n++ < 50) g.hud.advanceDialog(); if (g.phone.isOpen) g.phone.close(); }); };
check('dialogue d’accueil : simulation suspendue', await page.evaluate(() => window.__game.simPaused === !!(window.__game.hud.dialogActive || window.__game.phone.isOpen || document.querySelector('.overlay'))));
await dismiss();
await page.waitForTimeout(600);
await dismiss();
const snap = () => page.evaluate(() => { const g = window.__game; const c = g.mainHorse?.cond; return { t: g.save.data.gameTime, clock: g.simClock, sat: c?.satiety, hyd: c?.hydration, paused: g.simPaused, timer: g.missions.active?.timer ?? null }; });
const span = async (ms) => { const a = await snap(); await page.waitForTimeout(ms); return [a, await snap()]; };
for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.simPaused)); i++) { await dismiss(); await page.waitForTimeout(700); }
let [a, z] = await span(1500);
check('le temps passe en jeu', z.t > a.t && z.clock > a.clock && !z.paused, `${a.t.toFixed(1)} → ${z.t.toFixed(1)}`);
await page.evaluate(() => window.__game.phone.open('home'));
await page.waitForTimeout(400);
[a, z] = await span(2000);
check('téléphone ouvert : heure, horloge et besoins suspendus', z.paused && z.t === a.t && z.clock === a.clock && z.sat === a.sat && z.hyd === a.hyd, JSON.stringify(z));
await page.evaluate(() => window.__game.phone.close());
await page.waitForTimeout(500);
[a, z] = await span(1500);
check('téléphone fermé : reprise', !z.paused && z.t > a.t);
await page.evaluate(() => window.__game.hud.dialog([{ who: 'Test', initials: 'T', text: 'Pause pendant le dialogue.' }]));
await page.waitForTimeout(400);
[a, z] = await span(2000);
check('dialogue : simulation suspendue', z.paused && z.t === a.t && z.clock === a.clock, JSON.stringify(z));
await dismiss();
await page.waitForTimeout(500);
[a, z] = await span(1500);
check('dialogue terminé : reprise', !z.paused && z.t > a.t);
// R11 : absence prolongée (onglet en arrière-plan, appareil en veille) — au retour, aucun rattrapage : la première
// image après une interruption de 10 minutes n'avance le monde que d'un pas borné.
const gap = await page.evaluate(async () => {
  const g = window.__game;
  const c = g.mainHorse.cond;
  const t0 = g.save.data.gameTime, sat0 = c.satiety;
  g.last = performance.now() - 600000;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { dGame: g.save.data.gameTime - t0, dSat: sat0 - c.satiety };
});
check('R11 retour après 10 min d’absence : pas de rattrapage (≤ 2 pas de 50 ms)', gap.dGame < 2 * 0.05 * 86400 / 1200 + 1e-6 && gap.dSat < 0.01, JSON.stringify(gap));
console.log(errors.length ? `ERRORS ${errors.slice(0, 3).join(' | ')}` : 'ERRORS none');
console.log(fails ? `PAUSE ${fails} échec(s)` : 'PAUSE OK');
process.exitCode = fails || errors.length ? 1 : 0;
await b.close();
