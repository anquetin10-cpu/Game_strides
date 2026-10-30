// Jeu bilingue (iPhone 13 émulé, rendu logiciel) :
// 1. premier lancement : choix de la langue avant le jeu ; « English » → écran titre en anglais ;
// 2. écran titre : bascule FR / EN (rechargement, choix mémorisé) ;
// 3. partie en anglais : application Strides, réglages, missions de l'histoire jouées au pilote, défi de Paris —
//    aucun texte sans traduction (window.__i18nMissing) et aucun texte affiché qui ressemble à du français ;
// 4. réglages : retour au français en cours de partie (rechargement, sauvegarde conservée).
// Captures dans tests/e2e/out/i18n/. Usage : BASE=http://127.0.0.1:5173 node tests/e2e/i18n.mjs [missions,…]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/i18n';
mkdirSync(OUT, { recursive: true });
const MISSIONS = process.argv[2] ? process.argv[2].split(',') : ['tuto', 'm1', 'groom', 'livraison', 'fugueur', 'plage', 'transport', 'cross', 'csi3'];
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
// Tous les textes affichés dans la page (DOM), relevés au fil de la partie.
await ctx.addInitScript(() => {
  const seen = (window.__seenText = new Set());
  const add = (s) => {
    s = (s || '').replace(/\s+/g, ' ').trim();
    if (s.length > 1 && seen.size < 50000) seen.add(s);
  };
  const scan = (n) => {
    if (n.nodeType === 3) add(n.data);
    else if (n.nodeType === 1) {
      for (const a of ['placeholder', 'aria-label', 'title']) if (n.getAttribute?.(a)) add(n.getAttribute(a));
      n.childNodes.forEach(scan);
    }
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') add(m.target.data);
      else m.addedNodes.forEach(scan);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
});
const errors = [];
let page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const E = (f, a) => page.evaluate(f, a);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ---------- 1. Premier lancement : choix de la langue ----------
await page.goto(`${base}/`, { timeout: 180000 });
await page.waitForSelector('.lang-picker [data-id="lang-en"]', { timeout: 60000 });
await shot('1-choix-langue');
check('premier lancement : choix Français / English avant le jeu', await E(() => !!document.querySelector('.lang-picker [data-id="lang-fr"]') && !window.__game));
await page.tap('.lang-picker [data-id="lang-en"]');
await page.waitForFunction(() => window.__game?.screens?.titleEl, null, { timeout: 240000 });
let r = await E(() => ({ lang: document.documentElement.lang, stored: localStorage.getItem('strides-lang'), title: document.querySelector('.title-screen')?.innerText || '' }));
await shot('2-titre-en');
check('écran titre en anglais après « English »', r.lang === 'en' && r.stored === 'en' && /Play|Continue|New game/i.test(r.title) && !/Jouer|Nouvelle partie/.test(r.title), JSON.stringify(r).slice(0, 300));

// ---------- 2. Écran titre : bascule FR / EN ----------
check('écran titre : sélecteur FR / EN', await E(() => !!document.querySelector('[data-id="title-lang-fr"]') && !!document.querySelector('[data-id="title-lang-en"]')));
await page.tap('[data-id="title-lang-fr"]');
await page.waitForFunction(() => document.documentElement.lang === 'fr' && window.__game?.screens?.titleEl, null, { timeout: 240000 });
r = await E(() => ({ stored: localStorage.getItem('strides-lang'), title: document.querySelector('.title-screen')?.innerText || '' }));
await shot('3-titre-fr');
check('bascule en français depuis l’écran titre (rechargement, choix mémorisé)', r.stored === 'fr' && /Jouer|Continuer|Nouvelle partie/.test(r.title), JSON.stringify(r).slice(0, 200));
await page.tap('[data-id="title-lang-en"]');
await page.waitForFunction(() => document.documentElement.lang === 'en' && window.__game?.screens?.titleEl, null, { timeout: 240000 });
check('retour à l’anglais depuis l’écran titre', await E(() => localStorage.getItem('strides-lang') === 'en'));

// ---------- 3. Partie en anglais ----------
await page.goto(`${base}/?autostart&lang=en`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  while (g.hud.dialogActive) g.hud.advanceDialog();
});
await shot('4-jeu-en');
// Application Strides : chaque écran.
const apps = await E(async () => {
  const g = window.__game;
  const ids = ['home', 'requests', 'map', 'activities', 'garage', 'stable', 'messages', 'profile', 'settings', 'shop', 'ranking', 'missions', 'agenda'];
  const opened = [];
  for (const id of ids) {
    try {
      g.phone.open(id);
      await new Promise((res) => setTimeout(res, 150));
      if (g.phone.app === id) opened.push(id);
    } catch {
      /* application absente */
    }
  }
  g.phone.open('settings');
  await new Promise((res) => setTimeout(res, 200));
  return { opened, langBtns: !!document.querySelector('[data-id="lang-fr"]') && !!document.querySelector('[data-id="lang-en"]') };
});
await shot('5-reglages-en');
check('réglages : choix de la langue', apps.langBtns, JSON.stringify(apps.opened));
await E(() => window.__game.phone.close());
// Missions de l'histoire, au pilote.
for (const id of MISSIONS) {
  const res = await E((mid) => window.__auto.runStory(mid), id);
  check(`mission « ${id} » jouée en anglais`, res.ok, res.ok ? '' : `${res.error || res.failed}`);
  await E(() => {
    const g = window.__game;
    g.renderer.render(g.scene, g.camera);
  });
  await shot(`6-mission-${id}`);
}
// Bilan des textes.
r = await E(() => {
  const missing = [...(window.__i18nMissing || [])];
  // Mots et tournures typiques du français (noms propres connus exclus).
  const PROPER = /Pôle|Écurie|Côte|Comète|Lumière|Pommeraie|Saint-Gatien|Gatien|Deauville|Normandie|Grand Prix de Paris|Haras|Hélène|Élise|Léa|Chloé|Zoé|Théo|Clément|Jérôme|Amélie|Noé|Mégane|Gaëlle|Héloïse|Stéphane|Frédéric|Rosé|Café|Bénédicte|Sébastien|Valérie|Émilie|Brûlé/g;
  const FR = /\b(le|la|les|des|du|une|est|et|pour|avec|dans|sur|ton|ta|tes|tu|vous|pas|au|aux|ce|cette|il|elle|qui|que)\b|[éèêàùçâîôûœ’]/i;
  const frenchish = [...window.__seenText].filter((s) => {
    const x = s.replace(PROPER, '');
    return FR.test(x) && /[a-zA-Z]{3}/.test(x) && !/^[\d\s.,:/%€-]+$/.test(x);
  });
  return { missing, frenchish, seen: window.__seenText.size };
});
check('aucun texte sans traduction anglaise', r.missing.length === 0, `${r.missing.length} : ${JSON.stringify(r.missing.slice(0, 40))}`);
check('aucun texte affiché qui ressemble à du français', r.frenchish.length === 0, `${r.frenchish.length}/${r.seen} : ${JSON.stringify(r.frenchish.slice(0, 40))}`);

// ---------- 4. Réglages : retour au français en cours de partie ----------
const money = await E(async () => {
  const g = window.__game;
  g.save.data.money += 123;
  const m = g.save.data.money;
  g.phone.open('settings');
  await new Promise((res) => setTimeout(res, 200));
  window.__auto.tap(document.querySelector('[data-id="lang-fr"]'));
  return m;
});
await page.waitForFunction(() => document.documentElement.lang === 'fr' && window.__game?.state === 'play', null, { timeout: 240000 });
r = await E(() => ({ lang: document.documentElement.lang, money: window.__game.save.data.money, stored: localStorage.getItem('strides-lang') }));
check('réglages : passage au français en cours de partie, sauvegarde conservée', r.lang === 'fr' && r.money === money, JSON.stringify({ ...r, expected: money }));
await shot('7-jeu-fr');

check('aucune erreur console', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'I18N OK');
await browser.close();
process.exit(fails ? 1 : 0);
