// Premières minutes d'une nouvelle partie, par de vrais touchers (rendu logiciel SwiftShader de Chromium, émulation
// tactile en paysage : pas un iPhone réel). Serveur de développement ou build « vite build --mode e2e ».
//  FM-01 titre → « Jouer » → création du personnage → « C'est parti » → carte d'accueil → « En selle »
//  FM-02 téléphone ouvert aussitôt : au moins une mission sur le widget Strides, « Premiers pas » dans l'application
//  FM-03 demande ouverte, « Accepter la mission » touché deux fois : la mission démarre, téléphone rangé
//  FM-04 « Premiers pas » joué jusqu'au bout (pilote de test), carte de résultat fermée : récompense versée une fois
//  FM-05 sauvegarde, rechargement, « Continuer » : argent, réputation, mission terminée conservés, rien versé en double
//  FM-06 accueil du téléphone : les 12 applications visibles, aucune sous le bouton de fermeture (formats d'écran)
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/first-minutes.mjs [dossier] [844x390,667x300]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'tests/e2e/out/first-minutes';
const SIZES = (process.argv[3] || '844x390,667x300').split(',').map((s) => s.split('x').map(Number));
const LAYOUTS = [[667, 300], [667, 375], [844, 390], [932, 430]];
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

// Accueil du téléphone : chaque icône d'application dans la zone visible de l'écran du téléphone, hors du bouton de
// fermeture (défilement jusqu'en bas compris, comme le ferait le joueur).
const phoneLayout = (page) => page.evaluate(async () => {
  const scr = document.querySelector('.home-screen');
  if (!scr) return { ok: false, why: 'accueil absent' };
  const close = document.querySelector('.phone-close')?.getBoundingClientRect();
  const view = scr.getBoundingClientRect();
  const icons = [...scr.querySelectorAll('.app-icon')];
  const hidden = [];
  for (const el of icons) {
    el.scrollIntoView({ block: 'nearest' });
    await new Promise((r) => requestAnimationFrame(r));
    const r = el.getBoundingClientRect(), v = scr.getBoundingClientRect();
    const inView = r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && r.left >= v.left - 1 && r.right <= v.right + 1;
    const underClose = close && r.left < close.right && r.right > close.left && r.top < close.bottom && r.bottom > close.top;
    if (!inView || underClose) hidden.push(el.textContent.trim());
  }
  scr.scrollTop = 0;
  return { ok: icons.length >= 12 && !hidden.length, n: icons.length, hidden, scroll: Math.round(scr.scrollHeight - scr.clientHeight), h: Math.round(view.height) };
});

for (const [W, H] of SIZES) {
  const tag = `${W}x${H}`;
  console.log(`\n=== ${tag}`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.getItem('strides-lang') || localStorage.setItem('strides-lang', 'fr'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const E = (f, a) => page.evaluate(f, a);
  // Captures : preuve visuelle, jamais une cause d'échec (rendu logiciel lent, serveur qui démarre).
  const shot = (n) => page.screenshot({ path: `${OUT}/${tag}-${n}.jpg`, type: 'jpeg', quality: 80, timeout: 120000 }).catch((e) => console.log(`(capture ${n} non prise : ${e.message.split('\n')[0]})`));
  await page.goto(`${BASE}/`, { timeout: 180000 });
  await page.locator('[data-id="play"]').waitFor({ state: 'visible', timeout: 400000 });
  await shot('01-titre');
  // FM-01
  await page.locator('[data-id="play"]').tap();
  await page.locator('[data-id="start"]').tap({ timeout: 30000 });
  await page.locator('.card [data-id="go"]').waitFor({ state: 'visible', timeout: 30000 });
  await shot('02-accueil');
  await page.locator('.card [data-id="go"]').tap();
  await page.waitForTimeout(400);
  check('FM-01 nouvelle partie lancée par les touchers', await E(() => window.__game.state === 'play' && !document.querySelector('.card')));
  // FM-02 : téléphone ouvert tout de suite (bouton du HUD).
  // Le bouton « sonne » (animation continue) quand une demande arrive : toucher réel à ses coordonnées, sans attendre
  // qu'il s'immobilise (un joueur touche un bouton qui bouge).
  await page.locator('.phone-btn').tap({ force: true });
  await page.waitForTimeout(500);
  const w = await E(() => document.querySelector('[data-app="strides-widget"] .w-main')?.textContent || '');
  check('FM-02 widget Strides : au moins une mission dès l\'ouverture', /[1-9]\d* missions? dispo/.test(w), w);
  const lay = await phoneLayout(page);
  check('FM-06 accueil du téléphone : 12 applications accessibles', lay.ok, JSON.stringify(lay));
  await shot('03-telephone');
  await page.locator('[data-app="strides"]').first().tap();
  await page.waitForTimeout(500);
  // Première ouverture de Strides : notice « version jeu » (sommes fictifs), fermée par « J'ai compris ».
  const notice = page.locator('[data-id="notice-ok"]');
  if (await notice.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) {
    await shot('04a-notice');
    await notice.tap();
    await page.waitForTimeout(500);
  }
  const card = page.locator('.req-card[data-offer="story:tuto"]');
  check('FM-02 « Premiers pas » listée dans Strides', await card.isVisible().catch(() => false));
  await shot('04-strides');
  // FM-03
  await card.tap();
  await page.locator('[data-id="accept-request"]').waitFor({ state: 'visible', timeout: 10000 });
  await shot('05-demande');
  // Deux touchers réels à 600 ms d'intervalle, dans la fenêtre de confirmation de 5 s (sans attendre que le bouton,
  // décalé par l'aide, soit immobile : en rendu logiciel lent, cette attente dépassait 5 s). Position relue à chaque fois.
  for (let k = 0; k < 2; k++) {
    // Bouton réellement sous le doigt (écran de demande fini de s'ouvrir, rien par-dessus).
    const r = await page.waitForFunction(() => {
      const btn = document.querySelector('[data-id="accept-request"]');
      if (!btn) return null;
      const b = btn.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
      const top = document.elementFromPoint(x, y);
      return top && (top === btn || btn.contains(top)) ? { x, y } : null;
    }, null, { timeout: 15000, polling: 100 }).then((h) => h.jsonValue(), () => null);
    if (r) await page.touchscreen.tap(r.x, r.y);
    if (!k) await page.waitForTimeout(600);
  }
  await page.waitForFunction(() => window.__game.missions.active?.offer.id === 'story:tuto' && !window.__game.phone.isOpen, null, { timeout: 15000 }).catch(() => {});
  check('FM-03 mission démarrée, téléphone rangé', await E(() => window.__game.missions.active?.offer.id === 'story:tuto' && !window.__game.phone.isOpen));
  const before = await E(() => ({ money: window.__game.save.data.money, rep: window.__game.save.data.reputation }));
  // FM-04 : la mission jouée par le pilote de test (déplacements simulés, sans téléportation : voir tuto-play.mjs).
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  const res = await E(() => {
    const A = window.__auto, g = window.__game, run = g.missions.active;
    A.stopLoop();
    let completed = null;
    const off = g.bus.on('mission:complete', ({ result }) => (completed = result));
    for (let i = 0; i < 6000 && g.missions.active === run && !completed; i++) {
      A.solveStep(run);
      A.tick(2);
    }
    off();
    return { completed: completed && { title: completed.title, pay: completed.pay, xp: completed.xp }, step: run.i, text: run.text() };
  });
  await page.waitForTimeout(300);
  await shot('06-resultat');
  const btn = page.locator('.card .card-actions button.primary').first();
  if (await btn.isVisible().catch(() => false)) await btn.tap();
  await page.waitForTimeout(500);
  const after = await E(() => ({ money: window.__game.save.data.money, rep: window.__game.save.data.reputation, done: window.__game.save.data.completed.includes('tuto') }));
  check('FM-04 « Premiers pas » terminée', !!res.completed && after.done, JSON.stringify(res.completed || res));
  const paid = res.completed ? after.money - before.money : 0;
  check('FM-04 récompense versée une fois (argent et réputation)', res.completed && paid === res.completed.pay && after.rep - before.rep === res.completed.xp, `argent +${paid}, réputation +${after.rep - before.rep}`);
  // FM-05
  await E(() => window.__game.save.saveNow());
  await page.reload();
  await page.locator('[data-id="continue"]').waitFor({ state: 'visible', timeout: 400000 });
  await page.locator('[data-id="continue"]').tap();
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  const resumed = await E(() => ({ money: window.__game.save.data.money, rep: window.__game.save.data.reputation, done: window.__game.save.data.completed.includes('tuto'), active: !!window.__game.missions.active }));
  await shot('07-reprise');
  check('FM-05 reprise : argent, réputation et mission terminée conservés', resumed.money === after.money && resumed.rep === after.rep && resumed.done && !resumed.active, JSON.stringify(resumed));
  await page.waitForFunction(() => window.__game.vehiclesReady, null, { timeout: 120000 }).catch(() => {});
  check('véhicules chargés après la prise en main (van, Defender)', await E(() => !!(window.__game.van && window.__game.defender)), await E(() => JSON.stringify({ van: window.__game.vanModelInfo, def: window.__game.defenderModelInfo?.loaded })));
  check('aucune erreur de page', !errors.length, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// FM-06 sur d'autres formats : partie lancée par ?autostart, téléphone ouvert sur l'accueil.
for (const [W, H] of LAYOUTS) {
  if (SIZES.some(([w, h]) => w === W && h === H)) continue;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
  await page.evaluate(() => { document.querySelectorAll('.card [data-id="go"]').forEach((b) => b.click()); window.__game.phone.open('home'); });
  await page.waitForTimeout(600);
  const lay = await phoneLayout(page);
  check(`FM-06 ${W}x${H} accueil du téléphone : 12 applications accessibles`, lay.ok, JSON.stringify(lay));
  await page.screenshot({ path: `${OUT}/${W}x${H}-telephone.jpg`, type: 'jpeg', quality: 80, timeout: 120000 }).catch(() => console.log(`(capture ${W}x${H} non prise)`));
  await ctx.close();
}
console.log(fails ? `\n${fails} échec(s)` : '\nTout est conforme');
await browser.close();
process.exit(fails ? 1 : 0);
