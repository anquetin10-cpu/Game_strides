// Recette R15 (liens vers la vraie application, retour au jeu) et R16 (mesure désactivée puis activée localement,
// sans doublon). window.open est intercepté : on vérifie la destination demandée sans quitter la page.
// Usage : BASE=… node tests/e2e/strides-links.mjs
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 667, height: 308 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  window.__opened = [];
  window.open = (url, target) => (window.__opened.push({ url, target }), { opener: 1 });
});
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (fn, arg) => page.evaluate(fn, arg);
const LANDING = 'https://get.strides-app.com/', SITE = 'https://strides-app.com';

// Écran titre : accès permanent.
await page.goto(`${base}/`);
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
const titleBtn = await page.$('[data-id="learn"]');
check('écran titre : « Découvrir la vraie application Strides »', !!titleBtn);
if (titleBtn) await titleBtn.tap();
let o = await E(() => window.__opened.slice(-1)[0]);
check('écran titre → page officielle de présentation', o?.url === LANDING && o.target === '_blank', JSON.stringify(o));
check('le jeu reste sur l’écran titre', (await E(() => window.__game.state)) === 'title');

// Partie : mesure désactivée, puis activée (R16).
await page.goto(`${base}/?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await E(() => document.querySelectorAll('.overlay').forEach((x) => x.remove()));
const m0 = await E(() => {
  const m = window.__metrics;
  m.enabled = false;
  const before = m.log.length;
  window.__game.openStrides('test', 'discover');
  return { before, after: m.log.length };
});
check('R16 mesure désactivée : aucun événement enregistré', m0.after === m0.before, JSON.stringify(m0));
const m1 = await E(() => {
  const m = window.__metrics, g = window.__game;
  m.enabled = true;
  const n0 = m.log.length;
  g.openStrides('phone', 'discover');
  g.openStrides('phone', 'discover');
  m.track('first_mission_completed', { mission: 'tuto' });
  m.track('first_mission_completed', { mission: 'tuto' });
  const evs = m.log.slice(n0).map((e) => e.name);
  return { evs, external: m.external, params: m.log[m.log.length - 1].params };
});
check('R16 mesure activée : clics comptés à chaque fois, événement unique non dupliqué', m1.evs.filter((x) => x === 'strides_cta_clicked').length === 2 && m1.evs.filter((x) => x === 'first_mission_completed').length <= 1, JSON.stringify(m1.evs));
check('R16 aucun envoi externe, paramètres limités', m1.external === false && Object.keys(m1.params).every((k) => ['mission', 'course', 'placement', 'challenge_version', 'attempt', 'mode', 'game_version'].includes(k)), JSON.stringify(m1.params));

// Téléphone : accès discret, sauvegarde avant sortie, retour au jeu (R15).
await E(() => { const g = window.__game; g.save.data.flags.stridesNotice = true; g.save.data.money = 123; g.phone.open('strides', { tab: 'profil' }); });
await page.waitForSelector('.phone-layer.open [data-cta="download"]');
const savedBefore = await E(() => JSON.parse(localStorage.getItem('strides-grand-tour-v1') || '{}').meta?.savedAt || 0);
await page.waitForTimeout(20);
await page.tap('.phone-layer.open [data-cta="download"]');
o = await E(() => window.__opened.slice(-1)[0]);
const after = await E(() => ({ saved: JSON.parse(localStorage.getItem('strides-grand-tour-v1')), state: window.__game.state, phone: window.__game.phone.isOpen }));
check('R15 téléphone → page officielle, nouvel onglet', o?.url === LANDING && o.target === '_blank', JSON.stringify(o));
check('R15 partie sauvegardée avant la sortie', after.saved.meta.savedAt > savedBefore && after.saved.money === 123, `savedAt ${savedBefore} → ${after.saved.meta.savedAt}`);
check('R15 retour : le jeu continue là où il était', after.state === 'play' && after.phone === true);
await E(() => window.__game.phone.close());

// Invitation automatique : deux intentions, même application web officielle, jamais pendant la conduite.
const inv = await E(() => {
  const g = window.__game;
  window.__auto?.foot?.();
  g.player.enterTruck?.();
  return { driving: g.player.mode === 'drive', shown: g.inviteStrides('bilan'), pending: g._pendingInvite };
});
check('invitation différée pendant la conduite', !inv.shown && (!inv.driving || inv.pending === 'bilan'), JSON.stringify(inv));
await E(() => { const g = window.__game; if (g.player.mode === 'drive') g.player.exitTruck(); g._pendingInvite = null; g.inviteStrides('bilan'); });
await page.waitForSelector('[data-id="cta-missions"]');
await page.screenshot({ path: 'tests/e2e/out/strides-invitation.png' });
await page.tap('[data-id="cta-missions"]');
const o1 = await E(() => window.__opened.slice(-1)[0]);
await E(() => { const g = window.__game; g.save.data.flags.ctaShown = false; g.inviteStrides('bilan'); });
await page.waitForSelector('[data-id="cta-pro"]');
await page.tap('[data-id="cta-pro"]');
const o2 = await E(() => window.__opened.slice(-1)[0]);
check('« Je cherche des missions » et « Je cherche un professionnel » → application web officielle', o1?.url === SITE && o2?.url === SITE, `${o1?.url} · ${o2?.url}`);
const cta = await E(() => window.__metrics.log.filter((e) => e.name === 'strides_cta_shown' || e.name === 'strides_cta_clicked').map((e) => `${e.name}:${e.params.placement}:${e.params.mode || ''}`));
check('mesure : affichage et clics de l’invitation (emplacement « bilan »)', cta.includes('strides_cta_shown:bilan:') && cta.includes('strides_cta_clicked:bilan:missions') && cta.includes('strides_cta_clicked:bilan:pro'), JSON.stringify(cta));
check('jeu toujours actif après les sorties', (await E(() => window.__game.state)) === 'play');

console.log(errors.length ? `ERRORS ${errors.slice(0, 3).join(' | ')}` : 'ERRORS none');
console.log(fails ? `LIENS ${fails} échec(s)` : 'LIENS OK');
process.exitCode = fails || errors.length ? 1 : 0;
await b.close();
