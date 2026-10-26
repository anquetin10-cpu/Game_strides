// Recette du chapitre 1 (lot B) en lecteur intégré iPhone paysage (667×308, émulation Chromium) :
// R04 refus et branches de M1 · R05 débit unique et remboursement d'un échec technique (M2, parcours client dans
// Strides) · R06 budget insuffisant → branche autonome · R07 résultat imparfait en M3 (élimination) sans blocage ·
// R08 double appui / rechargement sans double récompense · R12 amélioration visible après rechargement · reprise de
// M3 au point enregistré · R16 mesure locale sans doublon. Usage : node tests/e2e/chapter1.mjs [base]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:5173/';
const OUT = 'tests/e2e/out';
const AUTO = readFileSync('tests/e2e/autopilot.js', 'utf8');
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 667, height: 308 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (fn, arg) => page.evaluate(fn, arg);
// La boucle de rendu est arrêtée (l'autopilote fait avancer le jeu image par image) : avancer après chaque toucher.
const tick = (n = 6) => E((k) => window.__auto.tick(k), n);
const boot = async (url = `${base}?autostart`) => {
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
  await page.addScriptTag({ content: AUTO });
  await E(() => { window.__auto.stopLoop(); window.__auto.closeCards(); });
};
const reload = async () => {
  await E(() => window.__game.saveNow());
  // Rechargement sans ?autostart : écran titre, puis « Continuer » (vraie reprise d'une partie sauvegardée).
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
  await page.tap('[data-id="continue"]');
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
  await page.addScriptTag({ content: AUTO });
  await E(() => window.__auto.stopLoop());
};
// Fait avancer la mission en cours avec l'autopilote jusqu'à `until` (texte d'étape) ou la fin.
const advance = (until, max = 1500) => E(([u, m]) => {
  const A = window.__auto, g = window.__game;
  const run = g.missions.active;
  let done = null;
  const off = g.bus.on('mission:complete', ({ result }) => (done = result));
  for (let i = 0; i < m && g.missions.active === run && !done; i++) {
    if (u && (u.startsWith('cp:') ? g.save.data.checkpoint?.step === u.slice(3) : new RegExp(u).test(run.text()))) break;
    A.solveStep(run);
    A.tick(2);
  }
  off();
  return { text: g.missions.active?.text() || null, done: done && { pay: done.pay, title: done.title, body: done.body }, step: run?.i };
}, [until, max]);
const state = () => E(() => { const d = window.__game.save.data; return { money: d.money, rep: d.reputation, completed: [...d.completed], rewards: { ...d.rewards }, hired: { ...d.hired }, cp: d.checkpoint, flags: { ...d.flags } }; });

// ---------- Partie neuve, premiers pas ----------
await boot();
await E(() => window.__auto.runStory('tuto'));
await E(() => window.__auto.closeCards());

// ---------- R04 : M1, refus des deux puis branche « Préparation (Val) » ----------
await E(() => { const g = window.__game; g.missions.offers = []; g.missions.refreshOffers(false); g.missions.accept('story:m1'); });
await page.waitForSelector('.overlay .choice[data-choice="none"]');
await page.screenshot({ path: `${OUT}/ch1-m1-choice.png` });
let s0 = await state();
await page.tap('.overlay .choice[data-choice="none"]');
await tick();
let s1 = await state();
check('R04 refus des deux propositions : aucune pénalité', !(await E(() => !!window.__game.missions.active)) && s1.money === s0.money && s1.rep === s0.rep, JSON.stringify({ avant: s0.money, apres: s1.money }));
await E(() => { const g = window.__game; g.missions.refusedAt = {}; g.missions.offers = []; g.missions.refreshOffers(false); });
check('R04 M1 reproposée après refus', await E(() => window.__game.missions.offers.some((o) => o.id === 'story:m1')));
await E(() => window.__game.missions.accept('story:m1'));
await page.waitForSelector('.overlay .choice[data-choice="val"]');
await page.tap('.overlay .choice[data-choice="val"]');
let r = await advance();
check('R04 branche Val terminée : 90 € (+ pourboire 5★)', r.done && r.done.pay === 99, JSON.stringify(r.done));
await E(() => window.__auto.closeCards());
s1 = await state();
check('R04 choix mémorisé (choices.m1 = val), point de reprise effacé', (await E(() => window.__game.save.data.choices.m1)) === 'val' && !s1.cp);

// ---------- R08 : double appui / rechargement sans double récompense ----------
const moneyAfterM1 = s1.money;
await E(() => { const g = window.__game; const run = { def: g.missions.storyList().find((d) => d.id === 'm1'), offer: { pay: 90 }, data: {}, cleanup() {}, finished: false }; g.missions.complete(run); });
await E(() => window.__auto.closeCards());
check('R08 seconde validation de M1 : rien de versé', (await state()).money === moneyAfterM1);
await reload();
await E(() => window.__auto.closeCards());
s1 = await state();
check('R08 après rechargement : solde identique, M1 non reproposée', s1.money === moneyAfterM1 && !(await E(() => { const g = window.__game; g.missions.refreshOffers(false); return g.missions.offers.some((o) => o.id === 'story:m1'); })));

// ---------- R05 : M2, parcours client dans Strides, débit unique, échec technique remboursé ----------
await E(() => { const g = window.__game; g.save.data.money = 400; g.updateWallet(); g.missions.offers = []; g.missions.refreshOffers(false); g.missions.accept('story:m2'); });
r = await advance('Recruter');
await E(() => window.__game.phone.open('strides', { tab: 'recruter' }));
await page.waitForSelector('[data-id="notice-ok"]');
await page.screenshot({ path: `${OUT}/ch1-notice.png` });
check('mention fictive au premier lancement de Strides', /fictifs/.test(await page.textContent('.notice-sheet')));
await page.tap('[data-id="notice-ok"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/ch1-recruter.png` });
await page.tap('[data-hire="lea"]');
await page.waitForSelector('[data-id="confirm-hire"]');
// Quitter la fiche avant de confirmer ne débite rien.
await page.tap('.sheet-actions .btn:not([data-id])');
await page.waitForTimeout(300);
check('R05 quitter avant confirmation : rien débité', (await state()).money === 400);
// Échec technique simulé : état restauré, rien débité.
await E(() => (window.__game.failNextHire = true));
await page.tap('[data-hire="lea"]');
await page.tap('[data-id="confirm-hire"]');
await page.waitForTimeout(450);
await page.tap('[data-id="confirm-hire"]');
await page.waitForTimeout(400);
s1 = await state();
check('R05 échec technique : remboursé, rien enregistré', s1.money === 400 && !s1.rewards['hire:m2'], JSON.stringify({ money: s1.money }));
// Confirmation réelle, avec un double appui rapide supplémentaire.
await page.tap('[data-hire="lea"]');
await page.screenshot({ path: `${OUT}/ch1-profile.png` });
await page.tap('[data-id="confirm-hire"]');
await page.waitForTimeout(450);
await page.tap('[data-id="confirm-hire"]');
await E(() => document.querySelector('[data-id="confirm-hire"]')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
await page.waitForTimeout(1300);
await tick();
s1 = await state();
check('R05 confirmation : 120 € débités une seule fois', s1.money === 280 && s1.rewards['hire:m2'] === true, `solde ${s1.money}`);
check('R05 point de reprise « hired » enregistré', s1.cp?.mission === 'm2' && s1.cp.data.hire === 'lea', JSON.stringify(s1.cp));
await reload();
await page.waitForSelector('[data-id="resume-mission"]');
await page.screenshot({ path: `${OUT}/ch1-resume.png` });
await page.tap('[data-id="resume-mission"]');
await tick();
check('R05 après rechargement : reprise sans nouveau débit', (await state()).money === 280 && (await E(() => window.__game.missions.active?.def.id)) === 'm2');
r = await advance();
await E(() => window.__auto.closeCards());
s1 = await state();
check('R05 M2 terminée avec Léa (hired.m2 = lea), paiement de Camille', r.done && s1.hired.m2 === 'lea' && s1.completed.includes('m2'), JSON.stringify(r.done));

// ---------- R07 : M3 avec un résultat imparfait (élimination) ----------
await E(() => { const g = window.__game; window.__auto.prefer = ['prudente', 'solo']; g.missions.offers = []; g.missions.refreshOffers(false); g.missions.accept('story:m3'); });
r = await advance('cp:loaded');
s1 = await state();
check('M3 point de reprise après chargement', s1.cp?.mission === 'm3' && ['loaded', 'prepared'].includes(s1.cp.step), JSON.stringify(s1.cp));
// Reprise sûre : rechargement pendant le transport, cheval à bord.
await reload();
await page.waitForSelector('[data-id="resume-mission"]');
await page.tap('[data-id="resume-mission"]');
await tick();
check('M3 reprise : cheval toujours à bord, mission reprise', await E(() => { const g = window.__game; return g.missions.active?.def.id === 'm3' && g.player.transport.isAboard(g.mainHorse); }));
r = await advance('^Obstacle n°1');
// Élimination : deux refus.
await E(() => { const g = window.__game; const o = g.obstacles.ofCourse('cso')[0]; g.bus.emit('obstacle:refusal', { obstacle: o }); g.bus.emit('obstacle:refusal', { obstacle: o }); });
await page.waitForTimeout(300);
await tick(10);
await page.waitForSelector('[data-id="retry-course"]');
await page.screenshot({ path: `${OUT}/ch1-m3-eliminated.png` });
check('R07 élimination : « Nouvelle tentative » et « Retrouver l’équipe » proposés', !!(await page.$('[data-id="results"]')));
await page.tap('[data-id="results"]');
r = await advance();
await E(() => window.__auto.closeCards());
s1 = await state();
check('R07 chapitre terminé malgré l’élimination (participation 150 €)', r.done && /150/.test(r.done.body || '') && s1.flags.chapter1Done && s1.completed.includes('m3'), JSON.stringify(r.done));
check('suite débloquée : « Groom du matin » proposée', await E(() => { const g = window.__game; g.missions.refreshOffers(false); return g.missions.offers.some((o) => o.id === 'story:groom'); }));

// ---------- Invitation automatique unique ----------
await tick(40);
const inv = await E(() => !!document.querySelector('[data-id="cta-missions"]'));
check('invitation unique après le bilan : « Je cherche des missions » / « Je cherche un professionnel »', inv && !!(await page.$('[data-id="cta-pro"]')));
if (inv) {
  await page.screenshot({ path: `${OUT}/ch1-invitation.png` });
  await page.tap('[data-id="cta-later"]');
}
check('invitation non réaffichée', !(await E(() => window.__game.inviteStrides('bilan'))) && (await state()).flags.ctaShown === true);

// ---------- R12 : aire de pansage achetée, visible après rechargement ----------
await E(() => { const g = window.__game; g.save.data.money = 500; g.updateWallet(); g.phone.open('ecurie'); });
await page.waitForSelector('[data-upgrade="aire"]');
await page.tap('[data-upgrade="aire"]');
await page.waitForTimeout(450);
await page.tap('[data-upgrade="aire"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/ch1-ecurie.png` });
s1 = await state();
check('aire de pansage achetée une fois (350 €)', s1.money === 150 && (await E(() => window.__game.save.data.upgrades.filter((u) => u === 'aire').length)) === 1);
check('achat répété sans effet', await E(() => { const g = window.__game; g.buyStableUpgrade('aire'); return g.save.data.money === 150; }));
await E(() => window.__game.phone.close());
await reload();
await E(() => window.__auto.closeCards());
check('R12 aire de pansage présente au Val après rechargement', await E(() => !!window.__game._builtUpgrades?.aire && window.__game.save.data.upgrades.includes('aire')));
await E(() => { const g = window.__game; const p = g.player; if (p.mode !== 'foot') window.__auto.foot(); p.human.setPosition(-131, 188, Math.PI); g.cam.snap(p.focus.pos, Math.PI); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/ch1-aire.png` });

// ---------- R06 : budget insuffisant → branche autonome (nouvelle partie) ----------
await E(() => { window.__game.save.locked = true; localStorage.clear(); });
await boot(`${base}?autostart`);
await E(() => { const g = window.__game; const d = g.save.data; d.completed.push('tuto', 'm1'); d.money = 40; g.updateWallet(); g.missions.offers = []; g.missions.refreshOffers(false); g.missions.accept('story:m2'); });
await advance('Recruter');
await E(() => { window.__game.save.data.flags.stridesNotice = true; window.__game.phone.open('strides', { tab: 'recruter' }); });
await page.waitForSelector('[data-hire="lea"]');
await page.tap('[data-hire="lea"]');
await page.waitForSelector('[data-id="confirm-hire"]');
const label = await page.textContent('[data-id="confirm-hire"]');
await page.tap('[data-id="confirm-hire"]');
await page.waitForTimeout(400);
await page.tap('[data-id="confirm-hire"]');
await page.waitForTimeout(300);
check('R06 solde insuffisant : confirmation impossible, rien débité', /insuffisant/i.test(label) && (await state()).money === 40, label);
await page.tap('.sheet-actions .btn:not([data-id])');
await page.waitForTimeout(300);
await page.tap('[data-hire="solo"]');
await tick();
r = await advance();
await E(() => window.__auto.closeCards());
s1 = await state();
check('R06 branche autonome terminée sans débit', r.done && s1.hired.m2 === 'solo' && s1.money === 40 + r.done.pay, JSON.stringify({ money: s1.money, pay: r.done?.pay }));

// ---------- R16 : mesure locale sans doublon ----------
const ev = await E(() => window.__metrics.log.map((e) => e.name));
const count = (n) => ev.filter((x) => x === n).length;
check('R16 événements locaux sans doublon', count('game_started') === 1 && count('first_mission_completed') <= 1 && count('hiring_mission_completed') <= 1, JSON.stringify(ev));
check('R16 aucun envoi externe (adaptateur désactivé)', (await E(() => window.__metrics.external)) === false);

console.log(errors.length ? `ERRORS ${errors.slice(0, 3).join(' | ')}` : 'ERRORS none');
console.log(fails ? `CHAPITRE 1 ${fails} échec(s)` : 'CHAPITRE 1 OK');
process.exitCode = fails || errors.length ? 1 : 0;
await b.close();
