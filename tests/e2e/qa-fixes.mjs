// Rejeu des 11 bugs du rapport QA (30 octobre 2026) sur le jeu corrigé — mêmes scénarios, comportement attendu :
// BUG-01 Fer perdu après changement de monture · BUG-02 Léa rencontrée enregistrée avec M1 · BUG-03 concours refusé
// sans fonds · BUG-04 partie suspendue en portrait · BUG-05 geste carte annulé sans repère · BUG-06 fin du jeu après
// Paris (fin de chapitre à Deauville) · BUG-07 retour de Paris (plein à l'aire de service) · BUG-08 engagement
// remboursé si le concours est perdu au rechargement · BUG-09 état du cheval conservé au changement de monture ·
// BUG-10 ferrure refusée sans fonds · BUG-11 touche pressée sous le téléphone ignorée.
// Émulation iPhone 13 paysage (tactile), rendu logiciel. Usage : BASE=http://127.0.0.1:5173 node tests/e2e/qa-fixes.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} @${phase}`));
let phase = 'start';
const E = (f, a) => page.evaluate(f, a);
const ready = async () => {
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  await E(() => {
    const A = window.__auto, g = window.__game;
    A.stopLoop();
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    A.closeCards();
    g.missions.timer = 1e6;
    A.tick(3);
  });
};
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await ready();

// ---------- BUG-10, BUG-01, BUG-09 : Fer perdu ----------
let r = await E(() => {
  const g = window.__game, A = window.__auto, d = g.save.data, M = g.missions;
  for (const id of ['tuto', 'm1', 'm2', 'm3', 'groom', 'livraison', 'fugueur', 'plage', 'transport']) if (!d.completed.includes(id)) d.completed.push(id);
  d.reputation = Math.max(d.reputation, 900);
  if (!d.horses.includes('ulysse')) d.horses.push('ulysse');
  M.offers = [];
  M.refreshOffers(false);
  const offer = M.offers.find((o) => o.id === 'story:fer');
  d.money = 10;
  const refused = M.accept('story:fer') === false && !M.active;
  const toast = [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' | ');
  d.money = 100;
  const accepted = M.accept('story:fer') && !!M.active;
  const run = M.active;
  // Jusqu'à l'étape « Faire ferrer » (appel au maréchal via le Guide local).
  for (let i = 0; i < 400 && run.steps[run.i]?.kind !== 'interact'; i++) {
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.bus.emit('pro:contact', { id: 'lemaire', name: 'Hugo Lemaire' });
    A.tick(1);
  }
  const step = run.steps[run.i];
  const it = g.interact.list.get(step.interactId);
  const hugo = it.getPos();
  const near = (x, z) => {
    g.player.human.setPosition(x + 1.5, z + 1.5);
    g.mainHorse.setPosition(x + 2.5, z + 1.5, 0);
    A.tick(3);
    g.interact.update();
  };
  // Changement de monture en route : Ulysse sellé.
  g.mainHorse.cond.energy = 12;
  g.mainHorse.cond.hydration = 23;
  g.mainHorse.cond.clean = 34;
  g.setActiveHorse('ulysse');
  near(hugo.x, hugo.z);
  const withUlysse = g.interact.current?.id === step.interactId;
  const hint = document.querySelector('.hint:not(.off)')?.textContent || '';
  // Comète de nouveau : boiteuse, état conservé, la ferrure est proposée.
  g.setActiveHorse('comete');
  const cond = g.mainHorse.cond.toJSON();
  const lame = g.mainHorse.lame === true;
  near(hugo.x, hugo.z);
  const offered = g.interact.current?.id === step.interactId ? g.interact.current.label : null;
  // Solde dépensé entre-temps : refus explicite, l'étape reste en attente.
  d.money = 30;
  g.interact.trigger();
  A.tick(2);
  const hint2 = document.querySelector('.hint:not(.off)')?.textContent || '';
  const stillWaiting = run.steps[run.i] === step && d.money === 30;
  d.money = 100;
  g.interact.update();
  g.interact.trigger();
  for (let i = 0; i < 300 && M.active === run; i++) {
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    A.tick(1);
  }
  A.closeCards();
  return { offer: !!offer, refused, toast, accepted, withUlysse, hint, cond, lame, offered, hint2, stillWaiting, money: d.money, done: d.completed.includes('fer'), lameAfter: g.mainHorse.lame };
});
check('BUG-10 · « Fer perdu » refusé à l’acceptation sans les 60 € de la ferrure', r.offer && r.refused && /Solde insuffisant/.test(r.toast), r.toast.slice(0, 90));
check('BUG-01 · avec Ulysse : pas de ferrure, indication « Hugo attend Comète »', r.accepted && !r.withUlysse && /Hugo attend/.test(r.hint), r.hint.slice(0, 70));
check('BUG-09 · Comète reprise : état courant conservé (12 / 23 / 34)', Math.abs(r.cond.energy - 12) < 1 && Math.abs(r.cond.hydration - 23) < 1 && Math.abs(r.cond.clean - 34) < 1, JSON.stringify(r.cond));
check('BUG-01 · Comète reprise : toujours boiteuse, « Faire ferrer » proposé', r.lame && r.offered === 'Faire ferrer', String(r.offered));
check('BUG-10 · solde dépensé entre-temps : refus explicite, étape en attente', r.stillWaiting && /Il te faut/.test(r.hint2), r.hint2.slice(0, 70));
check('BUG-01/10 · ferrure payée (100 → 40 €), mission terminée, Comète guérie', r.done && r.money === 40 && !r.lameAfter, JSON.stringify({ money: r.money, done: r.done }));

// ---------- BUG-02 : Léa rencontrée enregistrée avec M1 ----------
r = await E(() => {
  const g = window.__game, d = g.save.data, M = g.missions;
  d.relations.lea = { met: false, missions: 0 };
  d.completed = d.completed.filter((x) => x !== 'm1');
  const def = M.storyList().find((x) => x.id === 'm1');
  M.start(M._offerFromDef(def));
  M.complete(M.active);
  const stored = JSON.parse(localStorage.getItem(g.save.key));
  const resultOpen = !!document.querySelector('.overlay');
  return { resultOpen, mem: d.relations.lea.met, stored: stored.relations?.lea?.met, completed: stored.completed.includes('m1') };
});
check('BUG-02 · M1 terminée, écran de résultat ouvert : « Léa rencontrée » déjà enregistré', r.resultOpen && r.mem && r.stored === true && r.completed, JSON.stringify(r));
await E(() => window.__auto.closeCards());

// ---------- BUG-03 / BUG-08 : engagement d'un concours ----------
r = await E(async () => {
  const g = window.__game, d = g.save.data, M = g.missions;
  M.active && M.abandon();
  const { competitionDef } = await import('/src/gameplay/trip.js');
  const def = competitionDef(1, 15);
  const o = M._offerFromDef(def, { id: 'event:concours' });
  M.offers = [o];
  d.money = 0;
  const refused = M.accept('event:concours') === false && !M.active;
  const toast = [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' | ');
  M.offers = [o];
  d.money = 100;
  const ok = M.accept('event:concours') && !!M.active;
  window.__auto.closeCards();
  g.saveNow();
  return { fee: def.cost, refused, toast, ok, money: d.money, pending: d.pendingFee };
});
check('BUG-03 · concours payant refusé avec 0 € (message)', r.refused && /Solde insuffisant/.test(r.toast), r.toast.slice(0, 80));
check('BUG-03 · avec 100 € : accepté et engagement débité', r.ok && r.money === 100 - r.fee && r.pending?.fee === r.fee, `${r.money} € · ${JSON.stringify(r.pending)}`);
phase = 'reload';
await page.goto(`${base}/`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 240000 });
phase = 'after-reload';
await page.tap('[data-id="continue"]');
await ready();
r = await E(() => {
  const g = window.__game, d = g.save.data;
  return { money: d.money, pending: d.pendingFee, active: !!g.missions.active, msg: d.messages.slice(-1)[0]?.text || '' };
});
check('BUG-08 · rechargement : concours non repris, engagement remboursé (message)', !r.active && r.money === 100 && !r.pending && /remboursé/.test(r.msg), `${r.money} € · ${r.msg.slice(0, 60)}`);

// ---------- BUG-06 : fin de chapitre à Deauville, fin du jeu après Paris ----------
const finish = async (id) => {
  await E((id) => {
    const g = window.__game, M = g.missions;
    M.active && M.abandon();
    const def = M.storyList().find((x) => x.id === id);
    M.start(M._offerFromDef(def));
    M.complete(M.active);
    window.__auto.closeCards();
  }, id);
  await page.waitForTimeout(2600);
  return E(() => ({ title: document.querySelector('.overlay h2, .overlay .title, .overlay h1')?.textContent || document.querySelector('.overlay')?.textContent?.slice(0, 120) || '', finished: window.__game.save.data.flags.gameFinished === true }));
};
r = await finish('gp');
check('BUG-06 · Grand Prix de Deauville : fin de chapitre (Paris annoncé), pas l’écran de fin', /Vainqueur à Deauville/.test(r.title) && !/Légende/.test(r.title) && !r.finished, r.title.slice(0, 60));
await E(() => window.__auto.closeCards());
r = await finish('gpparis');
const stored = await E(() => JSON.parse(localStorage.getItem(window.__game.save.key)).flags?.gameFinished);
check('BUG-06 · Grand Prix de Paris : écran de fin, carrière marquée terminée (sauvegardée)', /Légende du Grand Tour/.test(r.title) && r.finished && stored === true, r.title.slice(0, 60));
await E(() => {
  const A = window.__auto;
  for (const b of document.querySelectorAll('.overlay [data-id="continue"]')) A.tap(b);
  A.closeCards();
});

// ---------- BUG-07 : retour de Paris avec 34 l ----------
r = await E(async () => {
  const g = window.__game, A = window.__auto, p = g.player, tk = g.truck, d = g.save.data;
  const { A13, TRIP } = await import('/src/gameplay/travel.js');
  A.foot();
  const e = A13.paris;
  tk.setPosition(e.x, e.z, Math.PI);
  g.setRegion('paris');
  p.enterTruck();
  tk.sim.fuelL = 34;
  d.money = 500;
  const h = g.mainHorse;
  p.transport.isAboard(h) || p.transport.loadInstant?.(h);
  g.travel.prompt('paris');
  const t1 = document.querySelector('.overlay')?.textContent || '';
  A.tap(document.querySelector('.overlay [data-id="travel-fuel"]'));
  await new Promise((res) => setTimeout(res, 600));
  const t2 = document.querySelector('.overlay')?.textContent || '';
  const fuel = tk.sim.fuelL, money = d.money;
  const go = document.querySelector('.overlay [data-id="travel-go"]');
  return { t1: t1.slice(0, 120), t2: t2.slice(0, 120), fuel, money, go: !!go, need: TRIP.fuelL + 2 };
});
check('BUG-07 · 34 l à Paris : plein proposé à l’aire de service de l’A13', /Plein avant la route/.test(r.t1), r.t1.slice(0, 60));
check('BUG-07 · après le plein : réservoir suffisant, « Rentrer à Deauville » proposé', r.fuel >= r.need && r.money < 500 && r.go && /Retour en Normandie/.test(r.t2), `${r.fuel.toFixed(0)} l · ${r.money.toFixed(2)} €`);
await E(() => {
  const A = window.__auto, g = window.__game;
  A.closeCards();
  g.player.exitTruck();
  g.setRegion('deauville');
});

// ---------- BUG-05 : geste carte annulé ----------
r = await E(async () => {
  const g = window.__game;
  g.gps.clear();
  g.phone.open('map');
  // Carte prête : toile dimensionnée (ses gestes sont branchés à la même image).
  const big = () => [...document.querySelectorAll('.phone canvas')].find((c) => c.width > 100);
  for (let i = 0; i < 40 && !big(); i++) await new Promise((res) => setTimeout(res, 100));
  await new Promise((res) => setTimeout(res, 300));
  const cv = big();
  const R = cv.getBoundingClientRect();
  // Geste annulé par le système (pointercancel) : événements synthétiques (sans capture possible).
  const cap = cv.setPointerCapture;
  cv.setPointerCapture = () => {};
  const o = { bubbles: true, clientX: R.left + R.width / 2, clientY: R.top + R.height / 2, pointerId: 7, pointerType: 'touch', isPrimary: true };
  cv.dispatchEvent(new PointerEvent('pointerdown', o));
  cv.dispatchEvent(new PointerEvent('pointercancel', o));
  cv.setPointerCapture = cap;
  return { found: !!cv, afterCancel: !!g.gps.target, x: R.left + R.width / 2 + 25, y: R.top + R.height / 2 };
});
// Toucher normal : vrai toucher, à la position de la carte une fois le téléphone ouvert (fin de son animation).
await page.waitForTimeout(900);
const at = await E(() => {
  const cv = [...document.querySelectorAll('.phone canvas')].find((c) => c.width > 100);
  cv.scrollIntoView({ block: 'center', inline: 'center' });
  const R = cv.getBoundingClientRect();
  return { x: R.left + R.width / 2 + 25, y: R.top + R.height / 2, vh: innerHeight, scroll: document.scrollingElement.scrollTop };
});
Object.assign(r, at);
await page.touchscreen.tap(r.x, r.y);
await page.waitForTimeout(200);
r.afterTap = await E(() => {
  const g = window.__game, ok = !!g.gps.target;
  g.gps.clear();
  g.phone.close();
  return ok;
});
check('BUG-05 · toucher annulé (pointercancel) : aucun repère ; toucher normal : repère posé', r.found && !r.afterCancel && r.afterTap, JSON.stringify(r));

// ---------- BUG-11 : touche pressée sous le téléphone ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, p = g.player;
  A.foot();
  p.human.setPosition(-104, 168, 0);
  A.tick(3);
  g.phone.open();
  A.tick(2);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', repeat: true, bubbles: true }));
  const during = g.input.keys.has('KeyW');
  g.phone.close();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', repeat: true, bubbles: true }));
  const x0 = p.human.pos.x, z0 = p.human.pos.z;
  A.tick(20);
  const moved = Math.hypot(p.human.pos.x - x0, p.human.pos.z - z0);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
  return { during, after: g.input.keys.has('KeyW'), moved };
});
check('BUG-11 · W pressée sous le téléphone : ignorée après la fermeture (pas de déplacement)', !r.during && !r.after && r.moved < 0.05, JSON.stringify(r));

// ---------- BUG-04 : portrait = partie suspendue ----------
r = await E(() => {
  window.__auto.startLoop?.();
  return true;
});
await page.waitForTimeout(800);
const t0 = await E(() => ({ time: window.__game.time, clock: window.__game.simClock, gt: window.__game.save.data.gameTime }));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const p0 = await E(() => ({ time: window.__game.time, clock: window.__game.simClock, gt: window.__game.save.data.gameTime, overlay: getComputedStyle(document.querySelector('.rotate')).display }));
await page.waitForTimeout(2000);
const p1 = await E(() => ({ time: window.__game.time, clock: window.__game.simClock, gt: window.__game.save.data.gameTime }));
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(1500);
const p2 = await E(() => ({ time: window.__game.time, clock: window.__game.simClock }));
check('BUG-04 · portrait : écran « Tourne ton téléphone », temps du jeu et heure du monde arrêtés', p0.overlay === 'grid' && p1.time === p0.time && p1.clock === p0.clock && p1.gt === p0.gt && p0.time >= t0.time, JSON.stringify({ p0, p1 }));
check('BUG-04 · retour en paysage : la partie reprend', p2.time > p1.time && p2.clock > p1.clock);

check('aucune erreur console', errors.length === 0, errors.slice(0, 4).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'CORRECTIFS QA OK');
await browser.close();
process.exit(fails ? 1 : 0);
