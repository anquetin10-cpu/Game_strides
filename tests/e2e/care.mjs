// Soins et physiologie : la fréquence cardiaque monte au galop et redescend ; panser, abreuver, foin.
// Usage : BASE=http://localhost:5173 node tests/e2e/care.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://localhost:5173';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
let ok = true;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) ok = false;
};
const r = await page.evaluate(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  while (g.hud.dialogActive) g.hud.advanceDialog();
  g.missions.abandon?.();
  A.closeCards();
  const h = g.mainHorse;
  g.player.mount();
  const rest = h.cond.hr;
  // Grand galop soutenu une minute (joystick à fond + bouton Galop), dans la carrière puis en ligne droite.
  h.setPosition(-60, 330, 0);
  g.input.held.add('gallop');
  let top = 0;
  for (let i = 0; i < 60 * 30; i++) { A.steer(Math.sin(i / 300), 1, 1); g.update(1 / 30); top = Math.max(top, h.speed); }
  const gallop = h.cond.hr;
  const hudHr = Number(document.querySelector('.hr-line span')?.textContent || 0);
  g.input.held.delete('gallop');
  g.input.setVirtualMove(0, 0);
  for (let i = 0; i < 150 * 30; i++) g.update(1 / 30);
  const recovered = h.cond.hr;
  return { rest, gallop, hudHr, recovered, energy: h.cond.energy, top };
});
check('FC de repos', r.rest > 30 && r.rest < 46, Math.round(r.rest));
check('FC au galop', r.gallop > 180, `${Math.round(r.gallop)} bpm à ${Math.round(r.top * 3.6)} km/h`);
check('FC affichée dans la télémétrie', r.hudHr > 150, r.hudHr);
check('récupération après 2 min 30', r.recovered < 100, Math.round(r.recovered));
const c = await page.evaluate(() => {
  const g = window.__game, h = g.mainHorse;
  g.player.dismount();
  h.setPosition(-112, 166, 0);
  g.player.human.setPosition(-111, 167.5, 0);
  h.speed = 0;
  h.cond.clean = 30; h.cond.hydration = 40; h.cond.satiety = 40; h.cond.hooves = 40;
  g.update(1 / 30);
  const it = g.interact.update();
  return { label: it?.label };
});
check('action « Panser » proposée près du cheval sale', c.label === 'Panser', c.label);
await page.evaluate(() => window.__game.interact.trigger());
await page.waitForTimeout(4400);
const c2 = await page.evaluate(() => { const g = window.__game; g.update(1 / 30); return { clean: g.mainHorse.cond.clean, next: g.interact.update()?.label }; });
check('robe propre après pansage', c2.clean > 99, c2.clean);
check('action suivante « Curer les pieds »', c2.next === 'Curer les pieds', c2.next);
const app = await page.evaluate(() => { const g = window.__game; g.phone.open('stable'); return document.querySelector('.phone-screen')?.textContent.includes('Fréquence cardiaque'); });
check('fiche santé dans l’application Chevaux', app);
console.log(ok && !errors.length ? 'SOINS OK' : `ÉCHECS ${errors.join(' | ')}`);
await b.close();
process.exit(ok && !errors.length ? 0 : 1);
