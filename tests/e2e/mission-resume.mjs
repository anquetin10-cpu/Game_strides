// AUD-01 — mission acceptée conservée au rechargement (iPhone 13 paysage émulé, tactile, rendu logiciel SwiftShader —
// pas un iPhone réel). Vraie reprise : rechargement de la page, écran titre, « Continuer ».
// COR-S01 « Premiers pas » acceptée au téléphone (touchers réels), consignes lues, rechargement → mission en cours,
//         consignes non répétées, objectif repris ; Comète au box
// COR-S02 progression (Comète sortie du box) puis rechargement → reprise sans la remettre au box ; fin de mission :
//         payée une fois ; rechargement après la fin → rien de repris, rien de repayé
// COR-S03 mission payante (« Fer perdu ») : ferrure réglée puis rechargement → reprise, aucun second débit, fin payée
//         une fois ; concours du Pôle (hors histoire) rechargé → engagement remboursé une seule fois, pas de reprise
// COR-S04 ancienne sauvegarde (sans point de reprise) : chargée telle quelle, aucune carte de reprise, partie jouable
// Choix et paiements de M1 à M3 au rechargement : tests/e2e/chapter1.mjs (R04, R05, M3).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/mission-resume.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/mission-resume';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok, extra });
  if (!ok) fails++;
};
const AUTO = readFileSync('tests/e2e/autopilot.js', 'utf8');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const E = (f, a) => page.evaluate(f, a);
const tick = (n = 4) => E((k) => window.__auto.tick(k), n);
const shot = async (name) => {
  await E(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80, timeout: 120000 }).catch(() => {});
};
// Toucher réel au centre d'un élément visible.
const tapSel = async (sel) => {
  await page.waitForSelector(sel, { timeout: 5000 }).catch(() => {});
  const r = await E((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest' });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, sel);
  if (!r) return false;
  await page.touchscreen.tap(r.x, r.y);
  await page.waitForTimeout(450);
  await tick(2);
  return true;
};
const state = () => E(() => {
  const g = window.__game, d = g.save.data, run = g.missions.active;
  return { active: run?.def.id || null, text: run?.text() || null, dialog: !!g.hud.dialogActive, money: d.money, rep: d.reputation, completed: [...d.completed], cp: d.checkpoint, pendingFee: d.pendingFee, inBox: !!g.mainHorse?.inBox, led: g.player.transport.led?.horse === g.mainHorse, offers: g.missions.offers.map((o) => o.id) };
});
// Rechargement : écran titre, « Continuer » (vraie reprise d'une partie sauvegardée).
const reload = async ({ save = true } = {}) => {
  if (save) await E(() => window.__game.saveNow());
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
  await page.tap('[data-id="continue"]');
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
  await page.addScriptTag({ content: AUTO });
  await E(() => window.__auto.stopLoop());
  await tick(2);
};
const card = () => E(() => ({ kicker: document.querySelector('.overlay .kicker, .overlay .card-kicker')?.textContent || '', title: document.querySelector('.overlay h2, .overlay .card-title')?.textContent || '', resume: !!document.querySelector('[data-id="resume-mission"]') }));
const advance = (until, max = 2500) => E(([u, m]) => {
  const A = window.__auto, g = window.__game;
  const run = g.missions.active;
  if (!run) return { text: null, done: null, cp: g.save.data.checkpoint, none: true };
  let done = null;
  const off = g.bus.on('mission:complete', ({ result }) => (done = result));
  for (let i = 0; i < m && g.missions.active === run && !done; i++) {
    if (u && (u.startsWith('cp:') ? g.save.data.checkpoint?.step === u.slice(3) : new RegExp(u).test(run.text()))) break;
    A.solveStep(run);
    A.tick(2);
  }
  off();
  return { text: g.missions.active?.text() || null, done: done && { pay: done.pay, title: done.title }, cp: g.save.data.checkpoint };
}, [until, max]);

// ---------- COR-S01 : « Premiers pas » acceptée, consignes lues, rechargement ----------
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: AUTO });
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  // Comète au box (partie neuve normale ; ?autostart la laisse dans la cour).
  g.stabling.putIn(g.mainHorse, true);
  g.missions.offers = [];
  g.missions.refreshOffers(false);
  g.missions.pushNotif(g.missions.offers.find((o) => o.id === 'story:tuto'));
  clearTimeout(g.hud._notifT);
});
await page.waitForTimeout(700);
let s0 = await state();
await tapSel('.notif.show .n-actions button.primary');
await page.waitForTimeout(500);
await tapSel('[data-id="accept-request"]');
await tapSel('[data-id="accept-request"]');
await page.waitForTimeout(1600);
await tick(4);
let s = await state();
const accepted = s.active === 'tuto' && s.cp?.mission === 'tuto' && s.cp.step === 'start';
// Consignes de Camille : appuis réels sur ACTION (touche E) jusqu'à la fin du dialogue.
for (let i = 0; i < 6 && (await E(() => !!window.__game.hud.dialogActive)); i++) {
  await page.keyboard.press('KeyE');
  await tick(3);
}
s = await state();
check('COR-S01a', 'acceptation au téléphone (2 touchers) : mission en cours, point de reprise « start » enregistré tout de suite', accepted, JSON.stringify({ cp: s0.cp, after: s.cp }));
check('COR-S01b', 'consignes lues : objectif « Va chercher Comète », point « briefed »', !s.dialog && /Va chercher Comète/.test(s.text || '') && s.cp?.step === 'briefed', JSON.stringify(s));
await shot('1-avant-rechargement');
const money0 = s.money;
await reload();
const c1 = await card();
await shot('2-carte-reprise');
await tapSel('[data-id="resume-mission"]');
await tick(4);
s = await state();
check('COR-S01c', 'rechargement : carte « Mission en cours · Premiers pas », « Reprendre »', c1.resume && /Premiers pas/.test(c1.title), JSON.stringify(c1));
check('COR-S01d', 'reprise : mission active, consignes non répétées, objectif « Va chercher Comète », Comète au box, solde inchangé', s.active === 'tuto' && !s.dialog && /Va chercher Comète/.test(s.text || '') && s.inBox && s.money === money0, JSON.stringify(s));

// ---------- COR-S02 : progression (Comète sortie) puis rechargement ; fin payée une fois ----------
let r = await advance('^Sors de l’écurie');
s = await state();
const out = s.cp?.step === 'out' && !s.inBox;
await reload();
await tapSel('[data-id="resume-mission"]');
await tick(4);
s = await state();
check('COR-S02a', 'Comète sortie du box puis rechargement : reprise après le box (pas remise au box, pas de consignes)', out && s.active === 'tuto' && !s.inBox && !s.dialog && /Sors de l’écurie|Monte sur Comète/.test(s.text || ''), JSON.stringify({ out, s }));
const before = s;
r = await advance(null, 4000);
await E(() => window.__auto.closeCards());
s = await state();
const pay = r.done?.pay || 0;
check('COR-S02b', 'fin de « Premiers pas » : payée une fois (50 € + pourboire 5★), point de reprise effacé', !!r.done && pay >= 50 && s.money === before.money + pay && s.completed.includes('tuto') && !s.cp, JSON.stringify({ done: r.done, money: [before.money, s.money], cp: s.cp }));
await reload();
const c2 = await card();
s = await state();
check('COR-S02c', 'rechargement après la fin : aucune reprise, aucun nouveau paiement, « Premiers pas » non reproposée', !c2.resume && !s.active && s.money === before.money + pay && !s.offers.includes('story:tuto'), JSON.stringify({ c2, s }));

// ---------- COR-S03 : mission payante (« Fer perdu ») ----------
await E(() => {
  const g = window.__game, d = g.save.data, M = g.missions;
  window.__auto.closeCards();
  // Mise en place technique : chapitre avancé jusqu'aux prérequis de « Fer perdu », 200 € en poche.
  for (const id of ['m1', 'm2', 'm3', 'groom', 'livraison', 'fugueur', 'plage', 'transport']) if (!d.completed.includes(id)) d.completed.push(id);
  d.money = 200;
  d.reputation = Math.max(d.reputation, 2500);
  M.offers = [];
  M.refreshOffers(false);
  M.accept('story:fer');
  window.__auto.closeCards();
});
s = await state();
const ferStart = s.active === 'fer' && s.cp?.mission === 'fer';
r = await advance('^Ferrure en cours');
await tick(120);
s = await state();
const paid = s.money === 140 && s.cp?.step === 'shod';
await reload();
await tapSel('[data-id="resume-mission"]');
await tick(4);
s = await state();
check('COR-S03a', '« Fer perdu » : ferrure réglée (−60 €), rechargement → reprise sans second débit (fin de mission seulement)', ferStart && paid && s.active === 'fer' && s.money === 140, JSON.stringify({ ferStart, paid, s }));
const rep0 = s.rep;
r = await advance(null, 1500);
await E(() => window.__auto.closeCards());
s = await state();
check('COR-S03b', '« Fer perdu » terminée après reprise : aucun débit de plus, réputation versée une fois', !!r.done && s.money === 140 && s.completed.includes('fer') && s.rep === rep0 + 220 && !s.cp, JSON.stringify({ done: r.done, s: { money: s.money, rep: [rep0, s.rep] } }));
await reload();
s = await state();
check('COR-S03c', 'rechargement après la fin : rien de repris ni de redébité', !s.active && s.money === 140 && s.rep === rep0 + 220, JSON.stringify(s));
// Concours du Pôle (hors histoire) : non repris, engagement remboursé une fois (BUG-08 inchangé).
r = await E(async () => {
  const g = window.__game, d = g.save.data, M = g.missions;
  const { competitionDef } = await import('/src/gameplay/trip.js');
  const def = competitionDef(1, 15);
  M.offers = [M._offerFromDef(def, { id: 'event:concours' })];
  const m0 = d.money;
  M.accept('event:concours');
  window.__auto.closeCards();
  return { m0, fee: def.cost, after: d.money, cp: d.checkpoint, pending: d.pendingFee };
});
await reload();
const c3 = await card();
s = await state();
await reload({ save: false });
const s2 = await state();
check('COR-S03d', 'concours du Pôle rechargé : engagement remboursé une fois, aucune reprise, aucun point de reprise', r.after === r.m0 - r.fee && !r.cp && !c3.resume && s.money === r.m0 && !s.pendingFee && s2.money === r.m0, JSON.stringify({ r, c3, money: [s.money, s2.money] }));

// ---------- COR-S04 : ancienne sauvegarde (format antérieur, sans point de reprise) ----------
await E(() => {
  const g = window.__game, d = g.save.data;
  window.__auto.closeCards();
  // Sauvegarde du format audité : mission d'histoire en cours non enregistrée (aucun champ checkpoint).
  d.completed = d.completed.filter((x) => x !== 'fer' && x !== 'cross' && x !== 'pension');
  delete d.checkpoint;
  g.saveNow();
});
await reload({ save: false });
const c4 = await card();
s = await state();
await E(() => {
  const g = window.__game;
  g.missions.refreshOffers(false);
});
s = await state();
check('COR-S04', 'ancienne sauvegarde sans point de reprise : chargée, aucune carte de reprise, offres normales', !c4.resume && !s.active && s.offers.includes('story:fer'), JSON.stringify({ c4, offers: s.offers }));
check('erreurs', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/resultats.json`, JSON.stringify(results, null, 1));
console.log(fails ? `${fails} échec(s)` : 'tout est vert');
await browser.close();
process.exit(fails ? 1 : 0);
