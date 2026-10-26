// Défi rejouable defi-pole-v2 (lot C) : accès par l'app Activités et par le panneau du Pôle, règles avant le départ,
// tentative complète, résultat et record, relance aux conditions identiques, élimination, monde du joueur restauré,
// chrono figé pendant téléphone / dialogue / écran de choix, carte de résultat téléchargée, mesure unique par
// tentative, reprise après rechargement pendant un défi, affichage 667×308, 568×260 et 844×390.
// Usage : BASE=http://127.0.0.1:5221 node tests/e2e/challenge.mjs [dossier captures]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.argv[2] || 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 667, height: 308 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const autopilot = readFileSync('tests/e2e/autopilot.js', 'utf8');
const boot = async (url) => {
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 400000 });
  await page.addScriptTag({ content: autopilot });
};
const shot = async (name) => {
  await page.evaluate(() => window.__auto.startLoop());
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
// L'app s'ouvre en fondu : attendre qu'elle soit visible avant la capture (rendu logiciel parfois lent).
const appVisible = () => page.waitForFunction(() => { const a = document.querySelector('.phone-content .app'); return a && +getComputedStyle(a).opacity > 0.95; }, null, { timeout: 30000 }).catch(() => {});
const stop = () => page.evaluate(() => window.__auto.stopLoop());
const world = () => page.evaluate(() => {
  const g = window.__game; const p = g.player; const f = p.focus.pos;
  return { gameTime: g.save.data.gameTime, mode: p.mode, x: f.x, z: f.z, horse: p.horse?.def.id, main: g.mainHorse.def.id, active: g.save.data.activeHorse, onMain: p.horse === g.mainHorse, rain: g.sky.rain, wet: g.sky.wet, cso: g.obstacles.ofCourse('cso').map((o) => o.h), horses: g.horses.filter((h) => h.def.id === 'defi-onyx').length, resume: g.save.data.challenges.resume };
});
const sameWorld = (a, z) => Math.abs(a.gameTime - z.gameTime) < 1e-6 && a.mode === z.mode && Math.hypot(a.x - z.x, a.z - z.z) < 0.6 && a.horse === z.horse && a.active === z.active && z.onMain && Math.abs(a.rain - z.rain) < 1e-6 && Math.abs(a.wet - z.wet) < 1e-6 && JSON.stringify(a.cso) === JSON.stringify(z.cso) && z.horses === 0 && z.resume === null;
const completedEvents = () => page.evaluate(() => window.__metrics.log.filter((e) => e.name === 'challenge_completed').map((e) => e.params));

await boot(`${base}/?autostart=1`);
// Partie de départ : tutoriel terminé (mission déjà réalisée), cavalier sur Comète à l'écurie du Val, 17 h 30.
await stop();
await page.evaluate(() => {
  const A = window.__auto, g = window.__game, d = g.save.data;
  A.closeCards();
  let n = 0; while (g.hud.dialogActive && n++ < 50) g.hud.advanceDialog();
  g.missions.active && g.missions.abandon();
  A.closeCards();
  d.completed.push('tuto');
  d.gameTime = 17.5 * 3600;
  A.mount();
  g.player.horse.setPosition(-100, 178, 1.2);
  g.cam.snap(g.player.focus.pos, g.player.heading);
  A.tick(30);
  g.missions.timer = 9999; // pas de nouvelle offre pendant le test
});
const pre = await world();
check('état initial : à cheval sur Comète, 17 h 30', pre.mode === 'ride' && pre.horse === 'comete' && Math.abs(pre.gameTime / 3600 - 17.5) < 0.1, JSON.stringify({ mode: pre.mode, horse: pre.horse, h: pre.gameTime / 3600 }));

// 1) App Activités sur l'écran d'accueil du téléphone.
await page.evaluate(() => window.__auto.startLoop());
await page.evaluate(() => window.__game.phone.open('home'));
await page.waitForTimeout(700);
check('icône « Activités » sur l’accueil du téléphone', !!(await page.$('.app-icon[data-app="activities"]')));
await page.tap('.app-icon[data-app="activities"]');
await appVisible();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/challenge-app-667.png` });
let txt = await page.evaluate(() => document.querySelector('.phone-content').textContent);
check('Activités : défi, concours et courses, entraînements', /Défi du Pôle/.test(txt) && /Concours et courses/.test(txt) && /Entraînements libres/.test(txt), txt.slice(0, 160));
await page.tap('[data-id="challenge-open"]');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/challenge-rules-667.png` });
txt = await page.evaluate(() => document.querySelector('.overlay .card')?.textContent || '');
check('règle de classement expliquée avant le départ', /4 points par barre/.test(txt) && /premier refus/.test(txt) && /second refus/.test(txt) && /seconde entamée/.test(txt) && /chrono/.test(txt));
check('conditions affichées (Onyx, 1,10 m, 11 h, 47 s, aide au saut)', /Onyx/.test(txt) && /1,10 m/.test(txt) && /11 h/.test(txt) && /47 s/.test(txt) && /Aide au saut/.test(txt));
let fitsRules = await page.evaluate(() => { const c = document.querySelector('.overlay .card').getBoundingClientRect(); const go = document.querySelector('[data-id="challenge-go"]').getBoundingClientRect(); return c.top >= 0 && c.bottom <= innerHeight + 0.5 && go.bottom <= innerHeight && go.right <= innerWidth; });
check('écran des règles tenu dans 667×308 (bouton Départ visible)', fitsRules);
await page.tap('[data-id="challenge-go"]');
await page.waitForTimeout(300);
await stop();
let st = await page.evaluate(() => { const g = window.__game; return { def: g.missions.active?.def.challenge, phone: g.phone.isOpen, cond: g.challenge.lastConditions, ev: window.__metrics.log.filter((e) => e.name === 'second_activity_started').map((e) => e.params) }; });
check('défi lancé depuis Activités', st.def === 'defi-pole-v2' && !st.phone);
const c1 = st.cond;
check('conditions : Onyx sans équipement, 11 h, dégagé, sol sec, 8 obstacles à 1,10 m, 47 s', c1 && c1.horse.name === 'Onyx' && c1.horse.mods.jump === 0 && c1.horse.speedMul === 1.13 && Math.abs(c1.hour - 11) < 1e-6 && c1.weather === 'Ensoleillé' && c1.rain === 0 && c1.wet === 0 && c1.obstacles.length === 8 && c1.heights.every((x) => Math.abs(x - 1.1) < 1e-9) && c1.timeAllowed === 47, JSON.stringify(c1));
check('second_activity_started { course: cso } (une mission déjà terminée)', st.ev.length === 1 && st.ev[0].course === 'cso', JSON.stringify(st.ev));

// 2) Chrono figé pendant le téléphone, un dialogue et un écran de choix.
const toCourse = await page.evaluate(() => {
  const A = window.__auto, g = window.__game; const run = g.missions.active;
  for (let i = 0; i < 400 && !(run.step?.kind === 'course' && run.data.course.running); i++) { A.solveStep(run); A.tick(1); }
  A.tick(30);
  return { kind: run.step?.kind, t: run.data.course.t };
});
check('parcours en cours (chrono lancé)', toCourse.kind === 'course' && toCourse.t > 0.5, JSON.stringify(toCourse));
const frozen = await page.evaluate(() => {
  const A = window.__auto, g = window.__game; const c = g.missions.active.data.course; const out = {};
  const span = (name) => { const t0 = c.t, w0 = g.save.data.gameTime; A.tick(60); out[name] = { dt: c.t - t0, paused: g.simPaused, clock: g.save.data.gameTime - w0 }; };
  g.phone.open('home'); span('phone'); g.phone.close();
  g.hud.dialog([{ who: 'Test', initials: 'T', text: 'Pause.' }]); span('dialog'); let n = 0; while (g.hud.dialogActive && n++ < 9) g.hud.advanceDialog();
  const ov = g.screens.card({ title: 'Choix', buttons: [{ label: 'A', id: 'x' }] }); span('choice'); ov.remove();
  const t0 = c.t; A.tick(30); out.running = c.t - t0;
  return out;
});
check('chrono figé : téléphone', frozen.phone.dt === 0 && frozen.phone.paused, JSON.stringify(frozen.phone));
check('chrono figé : dialogue', frozen.dialog.dt === 0 && frozen.dialog.paused, JSON.stringify(frozen.dialog));
check('chrono figé : écran de choix', frozen.choice.dt === 0 && frozen.choice.paused, JSON.stringify(frozen.choice));
check('chrono reprend ensuite', frozen.running > 0.9, String(frozen.running));
await shot('challenge-course-667');
await stop();

// 3) Tentative complète (autopilote) → résultat, record, monde restauré.
const run1 = await page.evaluate(() => {
  const A = window.__auto, g = window.__game; const run = g.missions.active;
  let done = null; const off = g.bus.on('mission:complete', ({ result }) => (done = result));
  for (let i = 0; i < 3000 && !done; i++) { if (g.missions.active !== run) break; A.solveStep(run); A.tick(2); }
  off();
  return { done: !!done, res: run.data.challengeResult, log: A.log.slice(-4), card: !!document.querySelector('.ch-result'), rec: g.save.data.challenges.records['defi-pole-v2'] };
});
check('tentative terminée, écran de résultat du défi', run1.done && run1.card && run1.res && !run1.res.eliminated, JSON.stringify(run1.res || run1.log));
check('record personnel enregistré pour defi-pole-v2', run1.rec?.best?.attempt === run1.res?.attempt && run1.rec.attempts === 1, JSON.stringify(run1.rec?.best));
let post = await world();
check('monde restauré après le défi (heure, météo, Comète, position, mode, parcours)', sameWorld(pre, post), JSON.stringify({ pre, post }));
let ev = await completedEvents();
check('challenge_completed émis une fois pour la tentative', ev.length === 1 && ev[0].attempt === run1.res.attempt && ev[0].challenge_version === 'defi-pole-v2' && ev[0].course === 'cso', JSON.stringify(ev));
await shot('challenge-result-667');
txt = await page.evaluate(() => document.querySelector('.ch-result .card').textContent);
check('résultat : pénalités, temps, record', /Pénalités/.test(txt) && /Temps/.test(txt) && /Record/.test(txt), txt.slice(0, 140));
let fitsRes = await page.evaluate(() => [...document.querySelectorAll('.ch-result .card-actions .btn')].every((x) => { const r = x.getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0; }));
check('boutons du résultat visibles dans 667×308', fitsRes);

// 4) Recommencer : conditions identiques, puis élimination (descente de cheval).
await page.tap('[data-id="challenge-retry"]');
await page.waitForTimeout(400);
await stop();
st = await page.evaluate(() => ({ def: window.__game.missions.active?.def.challenge, cond: window.__game.challenge.lastConditions }));
check('relance immédiate depuis le résultat', st.def === 'defi-pole-v2');
check('deux tentatives successives : conditions identiques', JSON.stringify(st.cond) === JSON.stringify(c1), JSON.stringify({ c1, c2: st.cond }));
const run2 = await page.evaluate(() => {
  const A = window.__auto, g = window.__game; const run = g.missions.active;
  for (let i = 0; i < 400 && !(run.step?.kind === 'course' && run.data.course.running); i++) { A.solveStep(run); A.tick(1); }
  A.tick(20);
  g.player.horse.speed = 0; g.player.dismount();
  A.tick(4);
  return { res: run.data.challengeResult, card: !!document.querySelector('.ch-result'), rec: g.save.data.challenges.records['defi-pole-v2'], title: document.querySelector('.ch-result h2')?.textContent };
});
check('élimination : résultat « Éliminé », record inchangé', run2.card && run2.res?.eliminated && run2.title === 'Éliminé' && run2.rec.best.attempt === run1.res.attempt && run2.rec.attempts === 2, JSON.stringify({ title: run2.title, res: run2.res }));
post = await world();
check('monde restauré après l’élimination', sameWorld(pre, post), JSON.stringify(post));
ev = await completedEvents();
check('challenge_completed : une fois par tentative (2 tentatives, 2 identifiants)', ev.length === 2 && new Set(ev.map((e) => e.attempt)).size === 2, JSON.stringify(ev));

// 5) Carte de résultat : pseudonyme, canvas 1080×1350, téléchargement.
await page.evaluate(() => window.__auto.startLoop());
await page.tap('[data-id="challenge-card"]');
await page.waitForTimeout(600);
await page.fill('.rc-input', 'Testeur 42');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/challenge-share-667.png` });
st = await page.evaluate(() => { const c = document.querySelector('.rc-canvas'); return { w: c?.width, h: c?.height, label: document.querySelector('[data-id="challenge-share"]')?.textContent, pseudo: window.__game.save.data.challenges.pseudo }; });
check('carte de résultat 1080×1350, pseudonyme facultatif enregistré', st.w === 1080 && st.h === 1350 && st.pseudo === 'Testeur 42', JSON.stringify(st));
check('partage : téléchargement proposé (pas de partage de fichiers ici)', /Télécharger/.test(st.label || ''), st.label);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.tap('[data-id="challenge-share"]')]);
const file = `${OUT}/challenge-card-download.png`;
await dl.saveAs(file);
const head = readFileSync(file).subarray(0, 24);
check('image téléchargée (PNG 1080×1350)', /^defi-pole-v2-.*\.png$/.test(dl.suggestedFilename()) && head.readUInt32BE(16) === 1080 && head.readUInt32BE(20) === 1350 && statSync(file).size > 20000, `${dl.suggestedFilename()} ${statSync(file).size} o`);
ev = await page.evaluate(() => window.__metrics.log.filter((e) => e.name === 'result_share_requested').map((e) => e.params));
check('result_share_requested { challenge_version, mode: download }', ev.length === 1 && ev[0].mode === 'download' && ev[0].challenge_version === 'defi-pole-v2', JSON.stringify(ev));
// La carte n'envoie rien d'autre : pas d'URL inventée, texte de partage avec l'adresse publique sans paramètres.
const shareTxt = await page.evaluate(async () => { const m = await import('/src/gameplay/challenge.js'); const g = window.__game; return m.shareText(m.DEFI_POLE_V1, g.save.data.challenges.last, m.publicUrl(location), 'Testeur 42'); });
check('texte de partage : adresse publique de la partie sans paramètres', shareTxt.endsWith(`${new URL(base).origin}/`) && !shareTxt.includes('?'), shareTxt);
await page.tap('[data-id="challenge-card-back"]');
await page.waitForTimeout(300);
await page.tap('[data-id="challenge-quit"]');
await page.waitForTimeout(500);
check('écrans fermés, jeu repris', await page.evaluate(() => !document.querySelector('.overlay') && !window.__game.missions.active));

// 6) Panneau d'entrée du Pôle (accès depuis le monde).
await stop();
const sign = await page.evaluate(() => {
  const A = window.__auto, g = window.__game;
  g.player.horse.setPosition(341, -178, Math.PI);
  g.cam.snap(g.player.focus.pos, g.player.heading);
  A.tick(3);
  return { id: g.interact.current?.id, label: g.interact.current?.label };
});
check('panneau du Pôle : interaction « Défi du Pôle »', sign.id === 'challenge:defi-pole', JSON.stringify(sign));
await shot('challenge-sign');
await page.evaluate(() => window.__game.interact.trigger());
await page.waitForTimeout(500);
check('panneau du Pôle : règles et départ', /Classement/.test(await page.evaluate(() => document.querySelector('.overlay .card')?.textContent || '')));
await page.tap('[data-id="challenge-later"]');
await page.waitForTimeout(300);

// 7) Rechargement pendant un défi : le monde du joueur est rétabli, aucune tentative recomptée.
const preReload = await world();
const attempts = await page.evaluate(() => Object.keys(window.__game.save.data.metrics.unique).filter((k) => k.startsWith('challenge_completed:')));
const res0 = await page.evaluate(() => { window.__game.challenge.start(); return { ...window.__game.save.data.challenges.resume, active: !!window.__game.challenge.active }; });
await page.waitForTimeout(1200);
await page.evaluate(() => window.__game.saveNow());
await boot(`${base}/?autostart=1`);
const after = await page.evaluate((ks) => { const g = window.__game; const d = g.save.data; return { gameTime: d.gameTime, resume: d.challenges.resume, pos: d.pos, keys: Object.keys(d.metrics.unique).filter((k) => k.startsWith('challenge_completed:')), again: ks.map((k) => window.__metrics.track('challenge_completed', { attempt: k.split(':')[1], challenge_version: 'defi-pole-v2', course: 'cso' })) }; }, attempts);
// Heure rétablie : celle du départ du défi (quelques secondes de jeu après la mesure), pas celle du défi (11 h, jour 2).
check('rechargement pendant le défi : heure et position du joueur rétablies', res0.active && res0.gameTime - preReload.gameTime >= 0 && res0.gameTime - preReload.gameTime < 150 && after.gameTime - res0.gameTime >= 0 && after.gameTime - res0.gameTime < 150 && after.resume === null && Math.hypot(after.pos.x - preReload.x, after.pos.z - preReload.z) < 1, JSON.stringify({ t: [preReload.gameTime, res0.gameTime, after.gameTime], pos: after.pos }));
check('tentatives déjà comptées : jamais recomptées après rechargement', attempts.length === 2 && after.keys.length === 2 && after.again.every((x) => x === false), JSON.stringify(after));

// 8) Autres tailles : 568×260 et 844×390 (app, règles, carte de résultat).
for (const [w, hgt] of [[568, 260], [844, 390]]) {
  await page.setViewportSize({ width: w, height: hgt });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__auto.closeCards(); window.__game.phone.open('activities'); });
  await appVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/challenge-app-${w}.png` });
  await page.evaluate(() => { window.__game.phone.close(); window.__game.challenge.ui.intro(window.__game.challenge.cfg, 'test'); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/challenge-rules-${w}.png` });
  const ok1 = await page.evaluate(() => { const go = document.querySelector('[data-id="challenge-go"]').getBoundingClientRect(); const c = document.querySelector('.overlay .card').getBoundingClientRect(); return go.bottom <= innerHeight && go.right <= innerWidth && c.top >= 0; });
  await page.tap('[data-id="challenge-later"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__game; g.challenge.ui.share(g.challenge.cfg, g.save.data.challenges.last); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/challenge-share-${w}.png` });
  const ok2 = await page.evaluate(() => { const b = document.querySelector('[data-id="challenge-share"]').getBoundingClientRect(); const cv = document.querySelector('.rc-canvas').getBoundingClientRect(); return b.bottom <= innerHeight && b.right <= innerWidth && cv.height >= 90; });
  check(`${w}×${hgt} : règles et carte de résultat tiennent à l’écran`, ok1 && ok2, JSON.stringify({ ok1, ok2 }));
  await page.tap('[data-id="challenge-card-back"]');
  await page.waitForTimeout(300);
}

console.log(errors.length ? `ERRORS ${errors.slice(0, 3).join(' | ')}` : 'ERRORS none');
console.log(fails ? `DÉFI ${fails} échec(s)` : 'DÉFI OK');
process.exitCode = fails || errors.length ? 1 : 0;
await b.close();
