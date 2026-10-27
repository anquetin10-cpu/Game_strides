// Carburant (iPhone paysage 667×308) : jauge au volant, consommation en roulant, plein payant à la station-service
// (bouton ACTION « Faire le plein »), niveau du camion conservé dans la sauvegarde, panne sèche et dépannage.
// Usage : BASE=… node tests/e2e/fuel.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 667, height: 308 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
});

// Au volant du camion : jauge affichée, consommation en roulant.
const roll = await page.evaluate(() => {
  const A = window.__auto, g = window.__game, p = g.player, t = g.truck;
  const f0 = t.sim.fuelL;
  p.enterTruck();
  for (let i = 0; i < 200; i++) { g.input.setVirtualMove(0, 1); A.tick(1); }
  g.input.setVirtualMove(0, 0);
  A.tick(10);
  const el = document.querySelector('.fuel-line');
  return { f0, f1: t.sim.fuelL, tank: t.sim.spec.tank, shown: !!el && !el.classList.contains('hidden'), text: el?.textContent || '', dist: t.sim.tripM };
});
check('camion : réservoir aux trois quarts en début de partie', Math.abs(roll.f0 - roll.tank * 0.75) < 0.5, `${roll.f0} l`);
check('camion : du gazole consommé en roulant', roll.f1 < roll.f0, `${(roll.f0 - roll.f1).toFixed(3)} l sur ${roll.dist.toFixed(0)} m`);
check('jauge de carburant au tableau de bord', roll.shown && /\d+ l/.test(roll.text), roll.text);

// Station-service : arrêt à la pompe, « Faire le plein », paiement au litre.
const fill = await page.evaluate(async () => {
  const A = window.__auto, g = window.__game, p = g.player, t = g.truck;
  const { STATION } = await import('/src/world/sites.js');
  g.save.data.money = 1000;
  g.updateWallet();
  t.sim.fuelL = 40;
  t.setPosition(STATION.islands[0] - 2.4, STATION.z, 0);
  t.speed = 0;
  A.tick(5);
  g.interact.update();
  const offered = g.interact.current?.id;
  const label = document.querySelector('.btn-action, [data-id="action"]')?.textContent || '';
  g.interact.trigger();
  await new Promise((r) => setTimeout(r, 4500));
  A.tick(2);
  return { offered, label, fuel: t.sim.fuelL, money: g.save.data.money, engine: t.engineOn, toast: document.querySelector('.toasts')?.textContent || '' };
});
const litres = 150 - 40, cost = Math.round(litres * 1.72 * 100) / 100;
check('« Faire le plein » proposé à l’arrêt près de la pompe', fill.offered === 'fuel-fill', `${fill.offered} ${fill.label}`);
check('plein fait : réservoir rempli', Math.abs(fill.fuel - 150) < 0.01, `${fill.fuel} l`);
check('payé au prix affiché (110 l × 1,72 €)', Math.abs(fill.money - (1000 - cost)) < 0.02, `${fill.money} €`);
check('moteur redémarré après le plein', fill.engine);
check('ticket affiché', /Plein : 110,0 l de gazole à 1,72 €\/l/.test(fill.toast), fill.toast.slice(0, 120));

// Sauvegarde : niveau du camion conservé.
const saved = await page.evaluate(() => {
  const g = window.__game;
  g.truck.sim.fuelL = 87.3;
  g.saveNow();
  const raw = JSON.parse(localStorage.getItem(g.save.key));
  g.truck.sim.fuelL = 10;
  g.placeFromSave();
  return { stored: raw.fuel?.truck, restored: g.truck.sim.fuelL };
});
check('niveau du camion sauvegardé et rechargé', saved.stored === 87.3 && saved.restored === 87.3, JSON.stringify(saved));

// Panne sèche : le moteur cale, dépannage de 10 l.
const dry = await page.evaluate(async () => {
  const A = window.__auto, g = window.__game, t = g.truck;
  t.setPosition(-30 + 2.2, 0, 0);
  t.sim.fuelL = 0.001;
  for (let i = 0; i < 60; i++) { g.input.setVirtualMove(0, 1); A.tick(1); }
  g.input.setVirtualMove(0, 0);
  const stalled = !t.engineOn && t.sim.dry;
  const money0 = g.save.data.money;
  await new Promise((r) => setTimeout(r, 7500));
  A.tick(2);
  return { stalled, fuel: t.sim.fuelL, engine: t.engineOn, paid: money0 - g.save.data.money };
});
check('panne sèche : le moteur cale', dry.stalled);
check('dépannage : 10 l livrés, moteur relancé, 35 €', Math.abs(dry.fuel - 10) < 0.2 && dry.engine && Math.abs(dry.paid - 35) < 0.01, JSON.stringify(dry));

check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? `CARBURANT : ${fails} échec(s)` : 'CARBURANT OK');
process.exit(fails ? 1 : 0);
