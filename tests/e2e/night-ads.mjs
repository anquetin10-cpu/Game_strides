// Publicités de la nuit (navigateur, iPhone 13 émulé en paysage 844 × 390, tactile ; rendu logiciel SwiftShader :
// ce n'est pas un essai sur iPhone réel). Séquence réelle, durées réelles (pas d'accélération) :
//  1. chambre → « Se coucher » → « Dormir jusqu'au matin » : personnage couché, nuit, publicité 1 (Kingsland : habillage
//     neutre tant que la marque n'est pas autorisée), publicité 2 (Strides), lever du jour, réveil au lit, nouvelle
//     journée (énergie 100 %, 7:00, sauvegarde) ; mentions « Partenaire » / « Publicité » ; « Passer » ;
//  2. simulation suspendue pendant la séquence (besoins du cheval inchangés, commandes bloquées), une seule séquence ;
//  3. pas de publicité : même nuit relancée, sieste, journée suivante, concours engagé (mission) ;
//  4. rechargement pendant les publicités : reprise au matin, aucune publicité rejouée ;
//  5. média indisponible (capture Strides bloquée) : publicité Strides sautée, sommeil normal.
// Captures dans tests/e2e/out/night-ads/.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/night-ads';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  results.push({ label, ok: !!cond, extra });
  if (!cond) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const AUTO = readFileSync('tests/e2e/autopilot.js', 'utf8');
const errors = [];

async function open(ctxOpts = {}, routes = null) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ...ctxOpts });
  await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  if (routes) await routes(page);
  return { ctx, page };
}
const boot = async (page) => {
  await page.goto(`${base}/?autostart`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 480000 });
  await page.addScriptTag({ content: AUTO });
};
const setup = (page) => page.evaluate(() => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.missions.timer = 1e6;
  g.save.data.flags.stridesNotice = true;
  // Transition réelle (le pilote des tests active d'habitude les fondus instantanés).
  g.syncFade = false;
});
// Dans la chambre, au bord du lit, à l'heure h.
const toBed = (page, hour = 22.5) => page.evaluate(async (hour) => {
  const g = window.__game, A = window.__auto, d = g.save.data;
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + hour * 3600;
  g.energy.sync();
  g.energy.set(30);
  const door = g.home.anchor('door');
  g.player.human.setPosition(door.x, door.z, Math.PI);
  A.tick(2);
  await g.home.enter({ instant: true });
  const b = g.home.anchor('bed');
  g.player.human.setPosition(b.x, b.z, b.heading);
  g.cam.snap(g.player.human.pos, b.heading);
  A.tick(6);
  g.interact.update();
  return { inside: g.home.inside, cur: g.interact.current?.label };
}, hour);
const tapSel = async (page, sel) => {
  const bb = await page.locator(sel).first().boundingBox();
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
};
const phase = (page) => page.evaluate(() => { const o = document.querySelector('.night-seq'); return o ? { phase: o.dataset.phase, ad: o.dataset.ad || null, tag: o.querySelector('.ad-tag')?.textContent, skip: !!o.querySelector('.ad-skip') && !o.querySelector('.ad-skip').classList.contains('hidden') && !o.querySelector('.ad-skip').classList.contains('invisible') } : null; });
const waitPhase = (page, re, ms = 15000) => page.waitForFunction((re) => new RegExp(re).test(document.querySelector('.night-seq')?.dataset.phase || ''), re, { timeout: ms });
// Une image du jeu (la boucle est arrêtée : le test calcule les images aux étapes clés ; la séquence de nuit, elle,
// avance en temps réel).
const render = (page) => page.evaluate(() => { const g = window.__game; window.__auto.tick(1); g.hud._lifeT = 0; g.hud.update(0); g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.sky.updateEnvironment(g.renderer, performance.now() / 1000, true); g.renderer.render(g.scene, g.camera); });
const shot = async (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });

// ---------- 1. La nuit complète ----------
{
  const { ctx, page } = await open();
  await boot(page);
  await setup(page);
  const at = await toBed(page);
  check('dans la chambre, au bord du lit : « Se coucher »', at.inside && at.cur === 'Se coucher', JSON.stringify(at));
  // La vraie boucle du jeu tourne pendant toute la nuit (simulation suspendue par la séquence elle-même, scène 3D
  // non redessinée pendant les publicités) ; un relevé toutes les 100 ms (phase, heure du jeu, besoins du cheval).
  await page.evaluate(() => {
    const g = window.__game;
    window.__auto.startLoop();
    window.__nightSamples = [];
    // Images de l'écran par phase (fluidité).
    window.__raf = {};
    const raf = () => { const ph = document.querySelector('.night-seq')?.dataset.phase; if (ph) window.__raf[ph] = (window.__raf[ph] || 0) + 1; if (window.__nightSampler) requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    window.__nightSampler = setInterval(() => {
      const o = document.querySelector('.night-seq');
      if (!o) return;
      const c = g.mainHorse.cond;
      window.__nightSamples.push({ ph: o.dataset.phase, t: g.save.data.gameTime, sat: c.satiety, hyd: c.hydration, hold: !!g.renderHold, paused: !!g.simPaused });
    }, 100);
    g.interact.update();
    g.interact.trigger();
  });
  await page.waitForTimeout(500);
  await shot(page, '0-menu-du-lit');
  const before = await page.evaluate(() => { const g = window.__game, c = g.mainHorse.cond; return { sat: c.satiety, hyd: c.hydration, e: g.energy.value, t: g.save.data.gameTime, ads: { ...g.save.data.ads } }; });
  const t0 = Date.now();
  await tapSel(page, '.overlay [data-choice="night"]');
  await waitPhase(page, '^dusk$', 4000);
  await page.waitForTimeout(300);
  const lying = await page.evaluate(() => { const g = window.__game; return { lying: !!g.home.lying, locked: g.player.locked, paused: g.simPaused }; });
  await shot(page, '1-coucher-tombee-de-la-nuit');
  check('le personnage se couche, commandes bloquées, simulation suspendue', lying.lying && lying.locked && lying.paused, JSON.stringify(lying));
  await waitPhase(page, '^ad-1$', 25000);
  const tAd1 = Date.now();
  await page.waitForTimeout(600);
  const p1 = await phase(page);
  await shot(page, '2-publicite-1-emplacement-kingsland');
  check('publicité 1 : emplacement Kingsland (habillage neutre, mention « Partenaire »), « Passer » pas encore proposé', p1.ad === 'kingsland-aw26-nuit:neutre' && p1.tag === 'Partenaire' && !p1.skip, JSON.stringify(p1));
  const neutral = await page.evaluate(() => ({ text: document.querySelector('.ad-neutral')?.innerText || '', img: !!document.querySelector('.ad-neutral img') }));
  check('habillage neutre : aucune marque ni logo Kingsland affiché', !/kingsland/i.test(neutral.text) && !neutral.img, neutral.text.replace(/\n/g, ' / '));
  await page.waitForTimeout(800);
  const skipShown = (await phase(page)).skip;
  check('« Passer » proposé après 1 s', skipShown);
  await waitPhase(page, '^ad-2$', 25000);
  const tAd2 = Date.now();
  const wallAd1 = (tAd2 - tAd1) / 1000;
  // Contenu lu dès le début de la publicité 2 (les captures sont lentes en rendu logiciel).
  const p2 = await page.evaluate(() => { const o = document.querySelector('.night-seq'); return { ad: o.dataset.ad, tag: o.querySelector('.ad-tag')?.textContent, logo: o.querySelector('.as-logo')?.getAttribute('src') || '', app: o.querySelector('.as-screen img')?.getAttribute('src') || '', cta: o.querySelector('.ad-cta')?.textContent, ctaVisible: !o.querySelector('.ad-cta')?.classList.contains('hidden'), fine: o.querySelector('.as-fine')?.textContent }; });
  check('publicité 2 : Strides, mention « Publicité », logo officiel (fichier d’origine), capture réelle de l’application', p2.ad === 'strides-nuit-v1' && p2.tag === 'Publicité' && /strides-logo-full/.test(p2.logo) && /app-accueil-capture/.test(p2.app), JSON.stringify({ ...p2, logo: p2.logo.slice(0, 60), app: p2.app.slice(0, 60) }));
  check('distinction jeu / plateforme réelle et invitation discrète (ouverture seulement au toucher)', /fictifs/.test(p2.fine || '') && p2.cta === 'Découvrir Strides' && p2.ctaVisible, p2.fine);
  // Captures aux étapes de la créa (besoin, application, logo), d'après le temps écoulé dans la publicité 2.
  for (const [at, name] of [[0.6, '3a-publicite-2-strides-besoin'], [1.9, '3b-publicite-2-strides-application'], [3.3, '3c-publicite-2-strides-logo']]) {
    const wait = at * 1000 - (Date.now() - tAd2);
    if (wait > 0) await page.waitForTimeout(wait);
    if ((await phase(page))?.phase !== 'ad-2') break;
    await shot(page, name);
  }
  // « Passer » sur la publicité 2 (si elle est encore affichée) → lever du jour.
  const canSkip = (await phase(page))?.phase === 'ad-2';
  if (canSkip) await tapSel(page, '.ad-skip');
  await waitPhase(page, '^(dawn|day)$', 3000);
  await page.waitForTimeout(700);
  await shot(page, '4-lever-du-jour');
  await page.waitForFunction(() => !document.querySelector('.night-seq') && document.querySelector('.overlay [data-id="newday-ok"]'), null, { timeout: 8000 });
  const total = (Date.now() - t0) / 1000;
  await page.waitForTimeout(300);
  await shot(page, '5-reveil-nouvelle-journee');
  const after = await page.evaluate(() => { const g = window.__game, c = g.mainHorse.cond, d = g.save.data; const raw = JSON.parse(localStorage.getItem(g.save.key)); return { sat: c.satiety, hyd: c.hydration, e: g.energy.value, hour: g.hour(), day: Math.floor(d.gameTime / 86400), ads: d.ads, saved: { e: raw.life.energy, t: raw.gameTime, last: raw.ads?.lastNight }, lying: !!g.home.lying, locked: g.player.locked }; });
  check('réveil : 7:00, énergie 100 %, le personnage se relève, commandes rendues', Math.abs(after.hour - 7) < 0.02 && after.e === 100 && !after.lying && !after.locked, JSON.stringify(after));
  check('besoins du cheval inchangés pendant la nuit à l’écran (simulation suspendue)', Math.abs(after.sat - before.sat) < 0.05 && Math.abs(after.hyd - before.hyd) < 0.05, `${before.sat.toFixed(2)} → ${after.sat.toFixed(2)}`);
  check('nouvelle journée sauvegardée (énergie, heure, nuit diffusée)', after.saved.e === 100 && Math.abs(((after.saved.t / 3600) % 24) - 7) < 0.02 && after.saved.last === after.day, JSON.stringify(after.saved));
  check('journal : 2 diffusions (neutre, puis Strides — passée au bouton « Passer »)', after.ads.count === 1 && after.ads.log.length === 2 && after.ads.log[0].neutral && after.ads.log[1].id === 'strides-nuit-v1' && (!canSkip || after.ads.log[1].skipped), JSON.stringify(after.ads.log));
  check('« Passer » sur la dernière publicité : lever du jour aussitôt', !canSkip || after.ads.log[1].seconds < 4.4, String(after.ads.log[1]?.seconds));
  // Durée propre de la séquence (horloge de la transition : elle s'arrête quand la page ne calcule plus d'images,
  // par exemple pendant une capture d'écran en rendu logiciel, sans rattrapage).
  const seqSecs = after.ads.log.reduce((a, x) => a + x.seconds, 0) + 1.6 + 1.8;
  check('durée de la séquence : nuit 1,6 s + publicités (4,5 s chacune, moins si « Passer ») + lever du jour 1,8 s', seqSecs <= 12.6 && seqSecs > 6, `${seqSecs.toFixed(1)} s de séquence (temps réel mesuré par le test, captures comprises : ${total.toFixed(1)} s)`);
  // Relevés pendant la séquence : heure du jeu figée avant la nuit puis au matin (un seul saut, à l'écran noir),
  // besoins du cheval constants, simulation suspendue partout, scène non redessinée pendant les publicités seulement.
  const S = await page.evaluate(() => { clearInterval(window.__nightSampler); window.__nightSampler = null; return window.__nightSamples; });
  // Durée de la publicité 1 sur l'horloge de la séquence (en rendu logiciel, l'horloge murale s'allonge : voir plus bas).
  check('publicité 1 affichée 4,5 s (horloge de la séquence)', Math.abs(after.ads.log[0].seconds - 4.5) < 0.3, `${after.ads.log[0].seconds} s de séquence ; ${wallAd1.toFixed(1)} s à l’horloge murale, captures d’écran comprises`);
  // Fluidité : images de l'écran par seconde, par phase (relevés de 100 ms). Rendu logiciel : la tombée de la nuit
  // dessine encore la scène 3D (lente ici) ; pendant les publicités, seule l'interface est composée.
  const R = await page.evaluate(() => window.__raf);
  const fps = Object.fromEntries(Object.entries(R).map(([ph, n]) => [ph, +(n / Math.max(0.1, S.filter((x) => x.ph === ph).length * 0.1)).toFixed(1)]).filter(Boolean));
  check('fluidité pendant la publicité 2 : au moins 8 images/s, captures d’écran comprises (rendu logiciel)', (fps['ad-2'] || 0) >= 8, JSON.stringify(fps));
  const pre = S.filter((x) => x.ph === 'dusk'), post = S.filter((x) => /^(ad-|dawn|day)/.test(x.ph)), ads = S.filter((x) => /^ad-/.test(x.ph));
  const flat = (a, k) => a.length > 1 && a.every((x) => Math.abs(x[k] - a[0][k]) < 1e-4);
  check('pendant la séquence (relevés toutes les 100 ms) : heure figée avant et après le passage à 7:00, besoins du cheval constants, simulation suspendue', flat(pre, 't') && flat(post, 't') && flat(S, 'sat') && flat(S, 'hyd') && S.every((x) => x.paused) && Math.abs(((post[0]?.t / 3600) % 24) - 7) < 0.01, JSON.stringify({ n: S.length, dusk: pre.length, apres: post.length, t: [pre[0]?.t, post[0]?.t], sat: [S[0]?.sat, S.at(-1)?.sat] }));
  check('scène 3D non redessinée pendant les publicités, rendu repris au lever du jour', ads.length > 3 && ads.every((x) => x.hold) && S.filter((x) => /^(dusk|dawn|day)$/.test(x.ph)).every((x) => !x.hold) && !(await page.evaluate(() => window.__game.renderHold)), `${ads.length} relevés pendant les publicités`);
  await tapSel(page, '.overlay [data-id="newday-ok"]');
  // Suite des cas : boucle arrêtée, images calculées par le test.
  await page.evaluate(() => window.__auto.stopLoop());

  // ---------- 3. Pas de publicité ----------
  // Même nuit relancée (heure ramenée à 22:30 de la veille) : simple fondu.
  const again = await page.evaluate(async () => {
    const g = window.__game, d = g.save.data;
    d.gameTime -= 8.5 * 3600;
    g.energy.sync();
    g.syncFade = true;
    g.rest.sleep('night');
    await new Promise((r) => setTimeout(r, 50));
    const seq = !!document.querySelector('.night-seq');
    window.__auto.closeCards();
    return { seq, count: d.ads.count };
  });
  check('même nuit relancée : aucune publicité rejouée', !again.seq && again.count === 1, JSON.stringify(again));
  const nap = await page.evaluate(async () => {
    const g = window.__game, d = g.save.data;
    d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 23 * 3600;
    g.energy.sync();
    g.energy.set(40);
    g.syncFade = false;
    g.rest.nap();
    await new Promise((r) => setTimeout(r, 200));
    const seq = !!document.querySelector('.night-seq');
    await new Promise((r) => setTimeout(r, 1800));
    return { seq, count: d.ads.count };
  });
  check('sieste (même la nuit) : aucune publicité', !nap.seq && nap.count === 1, JSON.stringify(nap));
  const nextday = await page.evaluate(async () => {
    const g = window.__game, d = g.save.data;
    d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 86400 + 14 * 3600;
    g.energy.sync();
    g.rest.sleep('nextday');
    await new Promise((r) => setTimeout(r, 200));
    const seq = !!document.querySelector('.night-seq');
    await new Promise((r) => setTimeout(r, 2200));
    window.__auto.closeCards();
    return { seq, count: d.ads.count };
  });
  check('« Passer à la journée suivante » : aucune publicité', !nextday.seq && nextday.count === 1, JSON.stringify(nextday));
  const concours = await page.evaluate(async () => {
    const g = window.__game, d = g.save.data;
    if (!d.completed.includes('tuto')) d.completed.push('tuto');
    d.money = 500;
    d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 20.5 * 3600;
    g.energy.sync();
    const { competitionDef } = await import('/src/gameplay/trip.js');
    g.missions.offers = g.missions.offers.filter((x) => x.id !== 'event:concours');
    g.missions.offers.push(g.missions._offerFromDef(competitionDef(1, 9.5), { id: 'event:concours' }));
    if (!g.missions.accept('event:concours')) return { skip: 'engagement refusé' };
    window.__auto.tick(4);
    window.__auto.closeCards();
    const ok = g.rest.sleep('night');
    await new Promise((r) => setTimeout(r, 300));
    const seq = !!document.querySelector('.night-seq');
    await new Promise((r) => setTimeout(r, 2200));
    window.__auto.closeCards();
    const r = { ok, seq, count: d.ads.count, active: g.missions.active?.def.id };
    g.missions.abandon();
    return r;
  });
  check('concours engagé (mission en cours) : sommeil possible, aucune publicité', concours.skip || (!concours.seq && concours.count === 1), JSON.stringify(concours));
  await ctx.close();
}

// ---------- 4. Rechargement pendant les publicités ----------
{
  const { ctx, page } = await open();
  await boot(page);
  await setup(page);
  await toBed(page);
  await page.evaluate(() => window.__game.rest.sleep('night'));
  await waitPhase(page, '^ad-1$', 25000);
  const mid = await page.evaluate(() => { const g = window.__game; return { hour: g.hour(), last: g.save.data.ads.lastNight }; });
  await page.reload();
  await page.waitForFunction(() => window.__game?.state === 'title' || window.__game?.state === 'play', null, { timeout: 240000 });
  await page.evaluate(() => { if (window.__game.state === 'title') window.__game.startGame(false); });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const re = await page.evaluate(() => { const g = window.__game; return { hour: g.hour(), e: g.energy.value, seq: !!document.querySelector('.night-seq'), last: g.save.data.ads.lastNight, inside: g.home.inside }; });
  check('rechargement pendant les publicités : reprise au matin (nuit appliquée et sauvegardée), aucune publicité rejouée', Math.abs(re.hour - 7) < 0.1 && re.e > 99.9 && !re.seq && re.last === mid.last, JSON.stringify({ mid, re }));
  await ctx.close();
}

// ---------- 5. Média indisponible ----------
{
  // (seule l'image est bloquée, pas l'import du module qui en donne l'adresse)
  const { ctx, page } = await open({}, async (p) => p.route((u) => /app-accueil-capture\.png$/.test(u.pathname) && !u.search.includes('import'), (r) => r.abort()));
  await boot(page);
  await setup(page);
  await toBed(page);
  await page.evaluate(() => window.__game.rest.sleep('night'));
  await waitPhase(page, '^ad-1$', 25000);
  await page.waitForFunction(() => !document.querySelector('.night-seq'), null, { timeout: 20000 });
  const r = await page.evaluate(() => { const g = window.__game; return { hour: g.hour(), e: g.energy.value, log: g.save.data.ads.log.map((x) => x.id), card: !!document.querySelector('.overlay [data-id="newday-ok"]') }; });
  check('capture Strides indisponible : publicité Strides sautée, emplacement 1 affiché, sommeil normal', Math.abs(r.hour - 7) < 0.05 && r.e === 100 && r.card && r.log.length === 1 && !r.log.includes('strides-nuit-v1'), JSON.stringify(r));
  await ctx.close();
}

// ---------- 6. Petit écran (667 × 308) : lisibilité ----------
{
  const { ctx, page } = await open({ viewport: { width: 667, height: 308 } });
  await boot(page);
  await setup(page);
  await toBed(page);
  await page.evaluate(() => window.__game.rest.sleep('night'));
  await waitPhase(page, '^ad-1$', 25000);
  await page.waitForTimeout(600);
  await shot(page, '6-petit-ecran-publicite-1');
  await waitPhase(page, '^ad-2$', 25000);
  // « Découvrir Strides » : ouvre strides-app.com dans un nouvel onglet, seulement au toucher (la page est simulée
  // ici, sans réseau) ; la séquence continue.
  await ctx.route(/strides-app\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Strides</title>' }));
  // (le bouton ignore les touchers de la première demi-seconde de la publicité : pas d'ouverture involontaire)
  await page.waitForTimeout(900);
  const popupP = ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null);
  await tapSel(page, '.ad-cta');
  const popup = await popupP;
  check('« Découvrir Strides » ouvre https://strides-app.com/ au toucher seulement', !!popup && /^https:\/\/strides-app\.com\/?$/.test(popup.url()), popup ? popup.url() : 'aucun onglet');
  await popup?.close();
  await page.waitForTimeout(1200);
  await shot(page, '6-petit-ecran-publicite-2');
  const fit = await page.evaluate(() => { const f = document.querySelector('.ad-frame').getBoundingClientRect(), s = document.querySelector('.ad-skip').getBoundingClientRect(), c = document.querySelector('.ad-cta').getBoundingClientRect(); return { f: [f.left, f.top, f.right, f.bottom].map(Math.round), s: [s.left, s.top, s.right, s.bottom].map(Math.round), c: [c.left, c.top, c.right, c.bottom].map(Math.round), vw: innerWidth, vh: innerHeight }; });
  check('petit écran : cadre et « Passer » dans l’écran', fit.f[0] >= 0 && fit.f[2] <= fit.vw && fit.s[3] <= fit.vh && fit.s[2] <= fit.vw && fit.f[1] >= 0, JSON.stringify(fit));
  check('« Découvrir Strides » à gauche, « Passer » à droite (jamais l’un sous l’autre)', fit.c[2] + 40 < fit.s[0] && fit.c[0] >= 0, JSON.stringify({ cta: fit.c, passer: fit.s }));
  await ctx.close();
}

console.log('ERREURS', errors.length ? errors.join('\n') : 'aucune');
check('aucune erreur JavaScript', !errors.length, errors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/resultats.json`, JSON.stringify({ results, errors }, null, 1));
await browser.close();
process.exit(fails ? 1 : 0);
