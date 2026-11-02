// Identité du jeu (iPhone 13 paysage émulé, 844×390, rendu logiciel SwiftShader — pas un vrai iPhone) :
// 1. le jeu s'appelle Equestrian Tour : aucun « Grand Tour » affiché (choix de la langue, chargement, titre, consigne
//    de rotation, pause, téléphone, app Strides, réglages, défi : règles, résultat et carte, mode photo, écran de fin),
//    titre « EQUESTRIAN TOUR », métadonnées de la page et du manifeste ;
// 2. le logo Strides est le fichier officiel : chaque logo du DOM est une <img> du fichier ou un masque CSS de ce
//    fichier, aux proportions du fichier ; plus aucun logo vectoriel redessiné ; l'écran titre ne montre le logo que
//    dans la mention « application intégrée » ;
// 3. textures du monde portant le logo construites sans erreur, logo dessiné identique au fichier (comparaison pixel à
//    pixel avec le PNG officiel, proportions comprises) ; vues de jour : Strides HQ, Pôle International, affiche,
//    tapis de selle, carte.
// Captures : tests/e2e/out/identity/. Usage : BASE=http://127.0.0.1:5175 node tests/e2e/identity.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/identity';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ label, ok: !!ok, extra: String(extra).slice(0, 400) });
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// Modules du jeu tels que la page les a chargés (le serveur de développement peut leur ajouter ?t=… après une
// modification : importer la même adresse donne la même instance que le jeu).
await ctx.addInitScript(() => {
  performance.setResourceTimingBufferSize?.(10000);
  window.__mod = (p) => {
    const hits = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => {
      try {
        return new URL(n).pathname === p;
      } catch {
        return false;
      }
    });
    return import(hits.length ? hits[hits.length - 1] : p);
  };
});
// Tous les textes affichés (DOM), relevés au fil du test, y compris ceux qui ne restent qu'un instant (chargement).
await ctx.addInitScript(() => {
  const seen = (window.__seenText = new Set());
  const add = (s) => {
    s = (s || '').replace(/\s+/g, ' ').trim();
    if (s.length > 1 && seen.size < 50000) seen.add(s);
  };
  const scan = (n) => {
    if (n.nodeType === 3) add(n.data);
    else if (n.nodeType === 1) {
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
      for (const a of ['placeholder', 'aria-label', 'title', 'alt']) if (n.getAttribute?.(a)) add(n.getAttribute(a));
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
const page = await ctx.newPage();
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const warnings = [];
page.on('console', (m) => m.type() === 'warning' && /\[logo\]/.test(m.text()) && warnings.push(m.text()));
const E = (f, a) => page.evaluate(f, a);
const shot = (name, opts = {}) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000, ...opts });
const GRAND_TOUR = /grand[\s-]*tour/i;

// ---------- Fonctions évaluées dans la page ----------
// Textes visibles et attributs de tout le document (hors scripts et styles).
const allText = () => {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) out.push(n.data);
    else if (n.nodeType === 1) {
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
      for (const a of ['placeholder', 'aria-label', 'title', 'alt', 'content']) if (n.getAttribute?.(a)) out.push(n.getAttribute(a));
      n.childNodes.forEach(walk);
    }
  };
  walk(document.documentElement);
  return out.join(' \n ').replace(/\s+/g, ' ');
};
// Tous les logos Strides du DOM : fichier officiel (img ou masque CSS), proportions du fichier ; aucun logo SVG tracé.
const logoAudit = async () => {
  const L = await window.__mod('/src/ui/logo.js');
  const out = { items: [], bad: [], svgLogos: 0, tracedPaths: 0 };
  const okSrc = (s, mark) => typeof s === 'string' && s.includes(mark ? L.LOGO_MARK.src.replace(/^.*\//, '') : L.LOGO_FULL.src.replace(/^.*\//, ''));
  for (const el of document.querySelectorAll('.st-logo')) {
    const mark = el.classList.contains('st-logo-mark');
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
    let src = '', kind = '';
    if (el.tagName === 'IMG') {
      kind = 'img';
      src = el.currentSrc || el.src;
      if (el.complete && (el.naturalWidth !== (mark ? L.LOGO_MARK.w : L.LOGO_FULL.w) || el.naturalHeight !== L.LOGO_FULL.h)) out.bad.push(`img ${el.naturalWidth}×${el.naturalHeight}`);
    } else {
      kind = 'mask';
      src = cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage;
    }
    const want = mark ? L.MARK_ASPECT : L.LOGO_ASPECT;
    const ratio = visible ? r.width / r.height : want;
    const where = el.closest('[data-app], [data-id], .notif, .widget, .app-rail, .btn-round, .title-screen, .app-head')?.className || el.parentElement?.className || '';
    const item = { kind, mark, visible, w: +r.width.toFixed(1), h: +r.height.toFixed(1), ratioErr: +(Math.abs(ratio / want - 1) * 100).toFixed(2), where: String(where).slice(0, 40), src: String(src).slice(0, 90) };
    out.items.push(item);
    if (!okSrc(src, mark)) out.bad.push(`source ${item.src} (${item.where})`);
    // Une boîte de moins de 6 px de haut n'a pas une précision de proportion significative.
    if (visible && r.height >= 6 && item.ratioErr > 4) out.bad.push(`proportions ${item.w}×${item.h} (${item.ratioErr} %) ${item.where}`);
  }
  out.svgLogos = document.querySelectorAll('svg.logo-full, svg.logo-mark').length;
  out.tracedPaths = [...document.querySelectorAll('svg path')].filter((p) => (p.getAttribute('d') || '').startsWith('M98.5 342.0C61.9')).length;
  out.moduleTraced = 'd' in L.LOGO_FULL || 'd' in L.LOGO_MARK || 'logoSvg' in L || 'markSvg' in L;
  return out;
};
const auditOk = (a) => !a.bad.length && !a.svgLogos && !a.tracedPaths && !a.moduleTraced;
const auditTxt = (a) => `${a.items.length} logo(s) : ${a.items.map((i) => `${i.kind}${i.mark ? '·S' : ''}${i.visible ? '' : '(caché)'} ${i.w}×${i.h} ${i.ratioErr}%`).join(', ')}${a.bad.length ? ` — PROBLÈMES : ${a.bad.join(' ; ')}` : ''}${a.svgLogos || a.tracedPaths || a.moduleTraced ? ' — logo vectoriel tracé encore présent' : ''}`;
const audit = async (label) => {
  const a = await E(logoAudit);
  check(`${label} : logos Strides = fichier officiel, proportions du fichier`, auditOk(a), auditTxt(a));
  return a;
};
const noGrandTour = async (label) => {
  const txt = await E(allText);
  const m = txt.match(GRAND_TOUR);
  check(`${label} : aucun « Grand Tour » affiché`, !m, m ? txt.slice(Math.max(0, m.index - 60), m.index + 40) : '');
  return txt;
};
// Rendu d'une vue fixe (boucle arrêtée) : heure, regard et œil (x, hauteur au-dessus du sol, z). Au-delà de x = 3000 :
// zone de Paris (sol plat au niveau PARIS.y).
const view = (name, hr, at, from, fov = 55) =>
  E(async ([hr, at, from, fov]) => {
    const g = window.__game;
    const PY = (await window.__mod('/src/world/sites.js')).PARIS.y;
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + hr * 3600;
    g.sky.rain = 0;
    g.sky.wet = 0;
    const paris = from[0] > 3000;
    g.setRegion(paris ? 'paris' : 'deauville');
    const y = (x, z) => (paris ? PY : g.terrain.getHeight(x, z));
    g.camera.fov = fov;
    g.camera.updateProjectionMatrix();
    g.camera.position.set(from[0], y(from[0], from[2]) + from[1], from[2]);
    g.camera.lookAt(at[0], y(at[0], at[2]) + at[1], at[2]);
    g.sky.update(g.hour(), g.camera.position, 0);
    g.sky.follow(g.camera);
    g.sky.updateEnvironment(g.renderer, performance.now() / 1000, true);
    g.world.update(0, g.camera, g.sky, g.camera.position);
    g.renderer.render(g.scene, g.camera);
    return g.renderer.info.render.calls;
  }, [hr, at, from, fov]).then(() => shot(name));

// ---------- 1. Premier lancement : choix de la langue, chargement, écran titre ----------
await page.goto(`${base}/`, { timeout: 180000 });
await page.waitForSelector('.lang-picker [data-id="lang-fr"]', { timeout: 120000 });
let r = await E(() => ({ brand: document.querySelector('.lang-brand')?.textContent || '', title: document.title, og: document.querySelector('meta[property="og:title"]')?.content, apple: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content, canvas: document.getElementById('game')?.getAttribute('aria-label') }));
check('choix de la langue : « EQUESTRIAN TOUR »', /^EQUESTRIAN TOUR$/.test(r.brand.trim()), r.brand);
check('métadonnées : titre, og:title, titre iOS, canvas = Equestrian Tour', r.title === 'Equestrian Tour' && r.og === 'Equestrian Tour' && r.apple === 'Equestrian Tour' && r.canvas === 'Equestrian Tour', JSON.stringify(r));
const manifest = await (await page.request.get(`${base}/manifest.webmanifest`)).json();
check('manifeste : nom Equestrian Tour, aucun « Grand Tour »', manifest.name === 'Equestrian Tour' && !GRAND_TOUR.test(JSON.stringify(manifest)), `${manifest.name} / ${manifest.short_name}`);
await noGrandTour('choix de la langue');
await shot('01-choix-langue');
await page.tap('.lang-picker [data-id="lang-fr"]');
await page.waitForSelector('.screen.loading', { timeout: 120000 });
r = await E(() => {
  const l = document.querySelector('.screen.loading');
  return { title: l.querySelector('.game-title')?.firstChild?.textContent || '', logos: l.querySelectorAll('.st-logo, svg.logo-full').length, txt: l.textContent };
});
check('chargement : titre « EQUESTRIAN TOUR », sans logo Strides', r.title === 'EQUESTRIAN TOUR' && r.logos === 0 && !GRAND_TOUR.test(r.txt), JSON.stringify(r).slice(0, 200));
await shot('02-chargement');
await page.waitForFunction(() => window.__game?.screens?.titleEl, null, { timeout: 400000 });
await page.waitForTimeout(2500);
await E(() => window.__game.renderer.setAnimationLoop(null));
r = await E(() => {
  const s = document.querySelector('.title-screen');
  const t = s.querySelector('.game-title');
  const m = s.querySelector('.app-mention');
  const logos = [...s.querySelectorAll('.st-logo')];
  return {
    title: t?.firstChild?.textContent || '',
    font: getComputedStyle(t).fontFamily,
    weight: getComputedStyle(t).fontWeight,
    mention: m?.textContent || '',
    logosInMention: logos.filter((l) => m?.contains(l)).length,
    logos: logos.length,
    order: t && m ? t.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING : 0,
  };
});
check('écran titre : grand titre « EQUESTRIAN TOUR » dans la police d’affichage', r.title === 'EQUESTRIAN TOUR' && /Geist/.test(r.font) && +r.weight >= 600, `${r.title} · ${r.font} ${r.weight}`);
check('écran titre : mention « application intégrée » (Strides, missions et paiements fictifs)', /Application intégrée/i.test(r.mention) && /application Strides intégrée au téléphone du personnage/.test(r.mention) && /fictifs/.test(r.mention), r.mention);
check('écran titre : logo Strides seulement dans la mention, pas comme logo du jeu', r.logos === 1 && r.logosInMention === 1 && !!r.order, JSON.stringify({ logos: r.logos, dansMention: r.logosInMention }));
await audit('écran titre');
await noGrandTour('écran titre');
await shot('03-titre');
// Création du personnage : profil Strides du jeu (version jeu).
await page.tap('.title-screen [data-id="play"]').catch(() => {});
await page.waitForSelector('.card.setup', { timeout: 30000 }).catch(() => {});
r = await E(() => document.querySelector('.card.setup .kicker')?.textContent || '');
check('création du personnage : « Ton profil Strides · version jeu »', r === 'Ton profil Strides · version jeu', r);
await noGrandTour('création du personnage');
await shot('03b-creation-personnage');
// Consigne de rotation (téléphone tenu en portrait).
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
r = await E(() => ({ vis: getComputedStyle(document.querySelector('.rotate')).display !== 'none', txt: document.querySelector('.rotate').textContent }));
check('consigne de rotation : « Equestrian Tour se joue à l’horizontale. »', r.vis && /Equestrian Tour se joue à l’horizontale\./.test(r.txt) && !GRAND_TOUR.test(r.txt), r.txt);
await shot('04-rotation-portrait');
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(400);

// ---------- 2. Partie : pause, téléphone, app Strides, réglages, notification, photo, défi, fin ----------
await page.goto(`${base}/?autostart=1`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  let n = 0;
  while (g.hud.dialogActive && n++ < 50) g.hud.advanceDialog();
  A.closeCards();
  g.missions.timer = 9999;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 13 * 3600;
  A.tick(3);
  g.frame?.(performance.now());
});
r = await E(async () => {
  const L = await window.__mod('/src/ui/logo.js');
  return { ready: L.brandImagesReady() };
});
check('logo officiel préchargé avant la construction du monde', r.ready);
await audit('HUD en jeu');
// Notification Strides (icône d'app : monogramme officiel). L'en-tête des notifications (icône, nom de l'app) n'est
// affiché qu'au-dessus de 420 px de haut : capture en 932×430 (iPhone Pro Max en paysage).
const rerender = () => E(() => { const g = window.__game; g.resize?.(); g.renderer.render(g.scene, g.camera); });
await page.setViewportSize({ width: 932, height: 430 });
await rerender();
await E(() => window.__game.hud.notify({ app: 'STRIDES', title: 'Nouvelle demande', body: 'Groom pour le concours du Pôle · demain 8 h', timeout: 60000 }));
await page.waitForSelector('.notif.show', { timeout: 10000 });
await page.waitForTimeout(700);
r = await E(() => ({ n: document.querySelectorAll('.notif .n-app .st-logo.st-mask.st-logo-mark').length }));
check('notification : icône = monogramme officiel (masque du fichier)', r.n === 1);
await audit('notification (932×430)');
await shot('05-notification', { clip: { x: 200, y: 0, width: 532, height: 130 } });
await E(() => window.__game.hud._closeNotif());
await page.setViewportSize({ width: 844, height: 390 });
await rerender();
// Pause.
await E(() => window.__game.pause());
await page.waitForTimeout(500);
r = await E(() => document.querySelector('.overlay .card h2')?.textContent || '');
check('pause : titre « Equestrian Tour »', r === 'Equestrian Tour', r);
await noGrandTour('pause');
await audit('pause');
await shot('06-pause');
await E(() => window.__auto.tap(document.querySelector('[data-id="resume"]')));
await page.waitForTimeout(300);
// Téléphone : accueil (icône de l'app Strides, widget).
await E(() => window.__game.phone.open('home'));
await page.waitForTimeout(900);
r = await E(() => ({ icon: document.querySelectorAll('.app-icon[data-app="strides"] .ic.strides .st-logo.st-logo-mark').length, widget: document.querySelectorAll('.widget .w-head .st-logo').length }));
check('téléphone : icône de l’app Strides et widget = monogramme officiel', r.icon === 1 && r.widget === 1, JSON.stringify(r));
await audit('téléphone, accueil');
await noGrandTour('téléphone, accueil');
await shot('07-telephone-accueil');
await page.locator('.app-icon[data-app="strides"] .ic').screenshot({ path: `${OUT}/07b-icone-app-strides.png` });
// App Strides : mention « version jeu » à la première ouverture, puis en-tête avec le logo officiel.
await E(() => {
  window.__game.save.data.flags.stridesNotice = false;
  window.__game.phone.open('strides');
});
await page.waitForTimeout(1200);
r = await E(() => document.querySelector('.notice-sheet')?.textContent || '');
check('app Strides : mention « version jeu » (missions, profils, sommes fictifs)', /version jeu/i.test(r) && /fictifs/.test(r), r.slice(0, 160));
await shot('08-app-strides-mention');
await E(() => window.__auto.tap(document.querySelector('[data-id="notice-ok"]')));
await page.waitForTimeout(500);
r = await E(() => {
  const b = document.querySelector('.app-head .st-brand');
  const h3 = document.querySelector('.app-head h3');
  return { img: b?.querySelector('img.st-logo.st-logo-full')?.getAttribute('src') || '', tag: b?.textContent || '', oneLine: !!h3 && h3.getBoundingClientRect().height < parseFloat(getComputedStyle(h3).fontSize) * 1.6 };
});
check('app Strides : en-tête = logo officiel (fichier) + « Version jeu », titre sur une ligne', /strides-logo-full/.test(r.img) && /Version jeu/.test(r.tag) && r.oneLine, JSON.stringify(r));
await audit('app Strides');
await noGrandTour('app Strides');
await shot('09-app-strides');
await page.locator('.app-head').screenshot({ path: `${OUT}/09b-entete-app-strides.png` });
for (const tab of ['recruter', 'profil']) {
  await E((tab) => window.__game.phone.show('strides', { tab }), tab);
  await page.waitForTimeout(500);
  await audit(`app Strides (${tab})`);
  await noGrandTour(`app Strides (${tab})`);
}
// Réglages : mention « à propos ».
await E(() => window.__game.phone.show('settings'));
await page.waitForTimeout(700);
r = await E(() => {
  const irl = [...document.querySelectorAll('.phone-content .irl')].pop();
  irl?.scrollIntoView({ block: 'center' });
  return irl?.textContent || '';
});
check('réglages : « Equestrian Tour — jeu de démonstration », Strides = vraie plateforme, profils/missions/paiements fictifs', /^Equestrian Tour — jeu de démonstration/.test(r) && /Strides, l’application du téléphone, est une vraie plateforme/.test(r) && /fictifs/.test(r), r);
await noGrandTour('réglages');
await audit('réglages');
await page.waitForTimeout(400);
await shot('10-reglages-a-propos');
await E(() => window.__game.phone.close());
await page.waitForTimeout(500);
// Défi rejouable : règles, résultat, carte de résultat, texte de partage.
await E(() => window.__game.challenge.ui.intro(window.__game.challenge.cfg));
await page.waitForTimeout(500);
await noGrandTour('défi : règles');
await audit('défi : règles');
await shot('11-defi-regles');
await E(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
r = await E(async () => {
  const C = await window.__mod('/src/gameplay/challenge.js');
  const g = window.__game;
  const cfg = g.challenge.cfg;
  const res = C.makeResult(cfg, { attempt: 'identite-test', faults: 4, rails: 1, t: 61.37 });
  window.__idRes = res;
  g.challenge.ui.result(cfg, res, { isRecord: false }, () => {});
  return { share: C.shareText(cfg, res, 'https://exemple.test/jeu/', 'Jo'), sig: C.SIGNATURE };
});
check('défi : texte de partage signé « Equestrian Tour »', r.sig === 'Equestrian Tour' && /Equestrian Tour https:\/\/exemple\.test\/jeu\//.test(r.share) && !GRAND_TOUR.test(r.share), r.share);
await page.waitForTimeout(500);
await noGrandTour('défi : résultat');
await shot('12-defi-resultat');
await E(() => window.__auto.tap(document.querySelector('[data-id="challenge-card"]')));
await page.waitForTimeout(1500);
r = await E(() => {
  const cv = document.querySelector('canvas.rc-canvas');
  if (!cv) return null;
  // Comparaison au texte attendu : en-tête et pied de carte du jeu (sans logo Strides).
  return { w: cv.width, h: cv.height, data: cv.toDataURL('image/png') };
});
check('défi : carte de résultat dessinée (1080×1350)', r && r.w === 1080 && r.h === 1350);
if (r) writeFileSync(`${OUT}/13-carte-resultat.png`, Buffer.from(r.data.split(',')[1], 'base64'));
await noGrandTour('défi : carte de résultat');
await shot('13b-defi-carte-ecran');
await E(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
// Mode photo : signature du jeu.
await E(() => window.__game.photoMode(true));
await page.waitForTimeout(400);
r = await E(() => ({ wm: document.querySelector('.photo-frame .wm')?.textContent || '', logos: document.querySelectorAll('.photo-frame .st-logo').length }));
check('mode photo : signature « EQUESTRIAN TOUR » (pas le logo Strides)', r.wm === 'EQUESTRIAN TOUR' && r.logos === 0, JSON.stringify(r));
await noGrandTour('mode photo');
await shot('14-mode-photo');
await E(() => window.__game.photoMode(false));
// Écran de fin (après le Grand Prix de Paris).
await E(() => window.__game.screens.ending(() => {}));
await page.waitForTimeout(500);
r = await E(() => document.querySelector('.overlay .card h2')?.textContent || '');
check('écran de fin : « Légende de l’Equestrian Tour »', r === 'Légende de l’Equestrian Tour', r);
await noGrandTour('écran de fin');
await audit('écran de fin');
await shot('15-fin');
await E(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));

// ---------- 3. Textures du monde : logo officiel dessiné sans déformation ----------
r = await E(async () => {
  const g0 = window.__game;
  const L = await window.__mod('/src/ui/logo.js');
  const T = await window.__mod('/src/world/textures.js');
  const tack = await window.__mod('/src/entities/horse/tack.js');
  const { t } = await window.__mod('/src/core/i18n.js');
  const load = (src) => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = src; });
  const imgs = { full: await load(L.LOGO_FULL.src), mark: await load(L.LOGO_MARK.src) };
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  // Couverture du logo estimée sur la texture (projection de la couleur entre fond et logo) comparée à l'alpha du
  // fichier officiel posé au même endroit, aux mêmes proportions : intersection / union et écart moyen.
  const match = (cv, { x, y, h, sx = 1, mark = false, bg, fg, chan = null }) => {
    const l = mark ? L.LOGO_MARK : L.LOGO_FULL;
    const w = ((h * l.w) / l.h) * sx;
    const X = Math.floor(x), Y = Math.floor(y), W = Math.ceil(x + w) - X, H = Math.ceil(y + h) - Y;
    const ref = document.createElement('canvas');
    ref.width = W;
    ref.height = H;
    const rc = ref.getContext('2d');
    rc.imageSmoothingQuality = 'high';
    rc.drawImage(mark ? imgs.mark : imgs.full, x - X, y - Y, w, h);
    const ra = rc.getImageData(0, 0, W, H).data;
    const ta = cv.getContext('2d').getImageData(X, Y, W, H).data;
    const B = bg && hex(bg), F = fg && hex(fg);
    const d2 = F ? (F[0] - B[0]) ** 2 + (F[1] - B[1]) ** 2 + (F[2] - B[2]) ** 2 : 1;
    let inter = 0, uni = 0, err = 0, n = 0;
    for (let i = 0; i < ta.length; i += 4) {
      let c;
      if (chan !== null) c = ta[i + chan] / 255;
      else if (!F) c = ta[i + 3] / 255;
      else c = ((ta[i] - B[0]) * (F[0] - B[0]) + (ta[i + 1] - B[1]) * (F[1] - B[1]) + (ta[i + 2] - B[2]) * (F[2] - B[2])) / d2;
      c = Math.max(0, Math.min(1, c));
      const a = ra[i + 3] / 255;
      if (a > 0.5 || c > 0.5) uni++;
      if (a > 0.5 && c > 0.5) inter++;
      err += Math.abs(a - c);
      n++;
    }
    return { iou: +(inter / Math.max(1, uni)).toFixed(3), err: +(err / n).toFixed(3), px: `${W}×${H}` };
  };
  const cvOf = (tex) => tex.image;
  const out = {};
  const INK = '#0f0f0e', PAPER = '#efeae0', SURFACE = '#f7f4ed';
  out.hq = match(cvOf(T.logoTexture(true)), { x: (1024 - (196 * 1247) / 355) / 2, y: 30, h: 196, bg: INK, fg: SURFACE });
  out.banner = match(cvOf(T.bannerTexture()), { x: 36, y: 18, h: 92, bg: INK, fg: SURFACE });
  out.screen = match(cvOf(T.screenTexture()), { x: 56, y: 330, h: 130, bg: INK, fg: PAPER });
  for (let i = 0; i < T.AD_COUNT; i++) out[`affiche${i}`] = match(cvOf(T.adTexture(i)), { x: 64, y: 44, h: 62, bg: PAPER, fg: INK });
  const lhs = Math.min(256 * 0.36, (512 * 0.8 * 355) / 1247);
  out.presentoir = match(cvOf(T.signTexture('', t('Grooms · Cavaliers · Transport'), { dark: true, w: 512, h: 256, logo: true })), { x: (512 - (lhs * 1247) / 355) / 2, y: (256 * 0.56) / 2 - lhs / 2 + 256 * 0.04, h: lhs, bg: INK, fg: PAPER });
  const truck = T.truckTexture(1);
  const lw = 940 * 0.84;
  out.camionFlanc = match(truck.map.image, { x: (940 - lw) / 2, y: 300, h: (lw * 355) / 1247, bg: '#1d1e20', fg: '#e8e6e0' });
  const rw = 620 * 0.86;
  out.camionArriere = match(truck.map.image, { x: 960 + (620 - rw) / 2, y: 200, h: (rw * 355) / 1247, bg: '#1d1e20', fg: '#e8e6e0' });
  const lh = 40, k = 0.5 / 256 / (0.7 / 512);
  out.tapis = match(tack.padTexture().image, { x: 512 - 20 - lh * (1247 / 355) * k, y: 256 * 0.8 - lh / 2, h: lh, sx: k, chan: 2 });
  out.tapisDroit = match(tack.padTexture().image, { x: 20, y: 256 + 256 * 0.8 - lh / 2, h: lh, sx: k, chan: 2 });
  // Cheval classique : même emprise, élargissement mesuré sur sa géométrie de tapis (1,77).
  const kc = 1.77, lwc = lh * (1247 / 355) * k, lhc = lwc / ((1247 / 355) * kc);
  out.tapisClassique = match(tack.tackMaterial().map.image, { x: 512 - 20 - lwc, y: 256 * 0.8 - lhc / 2, h: lhc, sx: kc, chan: 2 });
  // Enseigne de la colline : logo découpé (transparence), à ses proportions.
  const cut = T.logoCutoutTexture('#f4f3ef').image;
  out.colline = match(cut, { x: 0, y: 8, h: cut.height - 16 });
  // Panneaux de la lice de Paris (texture du lot de la zone) : premier emplacement, logo resserré de k pour être juste
  // une fois posé sur 40 m × 0,9 m.
  let board = null;
  g0.scene.traverse((o) => {
    const im = o.material?.map?.image;
    if (!board && im && im.width === 2048 && im.height === 64) board = im;
  });
  if (board) {
    const kb = (0.9 / 64) / (40 / 2048);
    out.parisLice = match(board, { x: 128 - (40 * (1247 / 355) * kb) / 2, y: 12, h: 40, sx: kb, bg: '#15161a', fg: '#f4f3ef' });
  } else out.parisLice = { iou: 0, err: 1, px: 'texture introuvable' };
  // Écran de bord du Defender (matériau « UI_Strides » du modèle) : logo officiel, resserré pour l'écran 6,2:1.
  let scr = null;
  g0.scene.traverse((o) => {
    if (!scr && o.isMesh && o.material?.name === 'UI_Strides') scr = o.material;
  });
  if (scr?.map?.name === 'strides-logo-officiel') {
    const kd = 512 / 120 / (0.254 / 0.041);
    out.defenderEcran = match(scr.map.image, { x: 256 - (84 * (1247 / 355) * kd) / 2, y: 18, h: 84, sx: kd });
  } else out.defenderEcran = { iou: 0, err: 1, px: scr ? 'lettrage d’origine encore en place' : 'Defender absent' };
  // Monogramme de la carte : pastille agrandie.
  const M = await window.__mod('/src/ui/minimap.js');
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const cx = c.getContext('2d');
  cx.fillStyle = '#efeae0';
  cx.fillRect(0, 0, 220, 220);
  M.drawBlip(cx, 110, 110, 'mission', 10);
  out.carte = match(c, { x: 110 - (115 * 248) / 355 / 2, y: 110 - 57.5, h: 115, mark: true, bg: INK, fg: SURFACE });
  window.__blip = c.toDataURL('image/png');
  return out;
});
// Seuils : au-dessous de 60 px de haut, les traits fins de « TRIDES » (1 à 2 px) rendent l'intersection / union sensible
// au lissage ; un logo étiré ou décalé reste très loin de ces valeurs (lettres déplacées de plusieurs dizaines de px).
for (const [k, v] of Object.entries(r)) {
  const small = +String(v.px).split('×')[1] < 60;
  const [iouMin, errMax] = small ? [0.8, 0.04] : [0.9, 0.03];
  check(`texture « ${k} » : logo officiel, proportions du fichier (IoU ≥ ${iouMin}, écart ≤ ${errMax})`, v.iou >= iouMin && v.err <= errMax, JSON.stringify(v));
}
const blip = await E(() => window.__blip);
writeFileSync(`${OUT}/16-carte-pastille-x10.png`, Buffer.from(blip.split(',')[1], 'base64'));
check('aucun avertissement « logo non chargé »', warnings.length === 0, warnings.join(' | '));

// ---------- 4. Vues de jour (rendu logiciel) ----------
await page.addStyleTag({ content: '.hud, #touch { visibility: hidden !important; }' });
await view('20-strides-hq-vue-aerienne', 13, [108, 14, -320], [130, 30, -250], 55);
await view('21-strides-hq-toit-facade', 13, [108, 18, -317], [108, 1.7, -300], 70);
await view('22-strides-hq-cote-plage', 13, [108, 12, -335], [100, 2, -395], 60);
await view('23-pole-entree-logo', 13, [330, 6.5, -182], [324, 2, -160], 55);
await view('24-pole-bandeaux-lice', 13, [334, 0.7, -262], [322, 1.3, -249], 50);
await view('25-pole-ecran-geant', 13, [384, 8.5, -267], [366, 3, -243], 55);
await view('26-affiche-route', 13, [-12, 6.6, -92], [-18, 2.2, -74], 55);
await view('27-paris-panneaux-lice', 13, [4010, 0.6, 23], [3998, 2, 8], 60);
await view('27b-colline-logo-depuis-la-ville', 13, [120, 7, 480], [110, 9, -230], 22);
await view('27c-colline-logo-de-pres', 13, [120, 7, 480], [112, 5, 418], 55);
await E(() => window.__game.setRegion('deauville'));
// Tapis de selle (Comète sellée, vue de profil).
await E(() => {
  const A = window.__auto, g = window.__game;
  A.mount();
  g.player.horse.setPosition(-100, 178, Math.PI / 2);
  A.tick(5);
});
const hp = await E(() => { const p = window.__game.player.horse.pos; return [p.x, p.z]; });
await view('28-tapis-selle-gauche', 13, [hp[0] - 0.25, 1.35, hp[1]], [hp[0] - 0.2, 1.5, hp[1] - 3.2], 40);
await view('28b-tapis-selle-droit', 13, [hp[0] - 0.25, 1.35, hp[1]], [hp[0] - 0.2, 1.5, hp[1] + 3.2], 40);
// Écran de bord du Defender, de près (côté conducteur).
await E(() => {
  const g = window.__game;
  let m = null;
  g.scene.traverse((o) => {
    if (!m && o.isMesh && o.material?.name === 'UI_Strides') m = o;
  });
  if (!m) return;
  for (let p = m; p; p = p.parent) p.visible = true;
  m.updateMatrixWorld(true);
  m.geometry.computeBoundingBox();
  const c = m.geometry.boundingBox.getCenter(m.position.clone());
  m.localToWorld(c);
  const n = m.position.clone().set(0, 0, 1).transformDirection(m.matrixWorld);
  const root = m.parent.position.clone();
  let r = m;
  while (r.parent && r.parent !== g.scene) r = r.parent;
  r.getWorldPosition(root);
  if ((root.x - c.x) * n.x + (root.z - c.z) * n.z < 0) n.multiplyScalar(-1);
  g.camera.fov = 40;
  g.camera.updateProjectionMatrix();
  g.camera.position.copy(c).addScaledVector(n, 0.42);
  g.camera.position.y += 0.08;
  g.camera.lookAt(c);
  g.sky.update(g.hour(), g.camera.position, 0);
  g.sky.follow(g.camera);
  g.world.update(0, g.camera, g.sky, g.camera.position);
  g.renderer.render(g.scene, g.camera);
});
await shot('28c-defender-ecran-de-bord');
// Carte (minimap) avec les pastilles de missions.
await page.addStyleTag({ content: '.hud { visibility: visible !important; }' });
await E(() => {
  const A = window.__auto, g = window.__game;
  g.cam.snap?.(g.player.focus.pos, g.player.heading);
  A.tick(3);
  g.frame?.(performance.now());
});
await page.waitForTimeout(500);
await page.locator('.minimap').screenshot({ path: `${OUT}/29-minimap.png` });
await shot('30-hud-jour');

// ---------- Bilan ----------
const seen = await E(() => [...window.__seenText]);
const gt = seen.filter((s) => GRAND_TOUR.test(s));
check('aucun « Grand Tour » parmi tous les textes affichés pendant le test', gt.length === 0, gt.slice(0, 3).join(' | '));
check('aucune erreur de page', errors.length === 0, errors.slice(0, 4).join(' | '));
writeFileSync(`${OUT}/rapport.json`, JSON.stringify({ base, rendu: 'Chromium + SwiftShader (rendu logiciel, pas un vrai iPhone), 844×390, DPR 2', fails, results }, null, 2));
console.log(fails ? `${fails} échec(s)` : 'identité : tout est conforme');
await browser.close();
process.exit(fails ? 1 : 0);
