// Cheval à l'essai Tripo, deuxième cheval de l'écurie (Comète n'est pas remplacée) : listé dans « Mes chevaux »,
// sellé par l'interface du téléphone, toujours affiché avec son modèle (TripoHorse) même avec les réglages « Modèles 3D :
// Classiques » et « Chevaux 3D : Classiques », monté quelques secondes, puis Comète resellée ; choix conservé au
// rechargement. Deux parties : une partie neuve, et une ancienne sauvegarde (Comète seule, montée) qui doit se charger
// sans changement, sinon l'accès à Tripo.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/tripo-stable.mjs   (OUT=dossier des captures, facultatif)
// Fonctionne aussi sur une version construite servie telle quelle (build, fichier unique) : rien n'est importé de src/.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || 'tests/e2e/out/tripo-stable';
const KEY = 'strides-grand-tour-v1';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok: !!ok, extra });
  if (!ok) fails++;
};

// Ancienne sauvegarde : Comète seule, montée ; réglages « Classiques » choisis à la main.
const OLD = {
  version: 2, started: true, playerName: 'Julie', avatar: 'f', money: 1840, reputation: 420,
  skills: { preparation: 12, equitation: 18, transport: 4, organisation: 6 },
  completed: ['tuto'], refused: [], ratings: [5], horses: ['comete'], activeHorse: 'comete', upgrades: ['selle'],
  equipped: { selle: 'selle' }, horseCare: { comete: { energy: 72, hydration: 64, satiety: 70, clean: 58, hooves: 80 } },
  horseshoes: [3], bestTimes: {}, stats: { jobs: 3, earned: 640, distance: 5200, jumps: 11, faults: 2 }, messages: [],
  settings: { sound: false, music: false, quality: 'auto', camSens: 1, timeScale: 'jeu', characters: 'classic', charactersSet: true, horses: 'classic', jumpAid: 'full', courseLine: true },
  gameTime: 2 * 86400 + 13 * 3600, pos: null, flags: {}, choices: {}, relations: {}, rewards: {}, hired: {},
};
const KEEP = ['horses', 'money', 'reputation', 'skills', 'completed', 'upgrades', 'equipped', 'horseshoes', 'stats', 'settings'];
// Comparaison de valeurs JSON sans tenir compte de l'ordre des clés (la sauvegarde réécrite les range autrement).
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  localStorage.setItem('strides-lang', 'fr');
  // Messages affichés (toasts), relevés dès le chargement (un toast ne reste que quelques secondes).
  window.__toasts = [];
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('toast')) window.__toasts.push(n.textContent);
    }).observe(document.body, { childList: true, subtree: true });
  });
});
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
const E = (f, a) => page.evaluate(f, a);
// Capture une fois les animations de l'interface terminées (ouverture d'une application du téléphone : fondu).
const shot = async (name) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 30000, polling: 200 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 88 });
};

// Partie chargée (?autostart : nouvelle partie sans sauvegarde, sinon « Continuer »), pilote automatique injecté,
// missions et notifications neutralisées ; boucle du jeu active.
async function boot(save) {
  await page.goto(`${base}/?autostart`, { timeout: 180000 });
  try {
    await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 480000 });
  } catch (e) {
    throw new Error(`partie non chargée : ${e.message} ; erreurs : ${errors.slice(0, 5).join(' | ') || 'aucune'}`);
  }
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  return E(() => {
    // Nom du modèle affiché sur un cheval (versions construites : noms de classes raccourcis, d'où la comparaison avec la
    // classe chargée pour le modèle Tripo) ; « classique » : cheval du jeu.
    window.__cls = (R) => (!R ? 'classique' : R.constructor === window.__game.realism.models?.horse_tripo?.cls ? 'TripoHorse' : R.constructor.name);
    const g = window.__game, A = window.__auto, h = g.mainHorse, R = g.realism.horses.get(h);
    // État à la première image (avant toute action du test) : modèle déjà affiché si le cheval a le sien (préchargé).
    const first = { main: h.def.id, cls: window.__cls(R), layer: h.mesh.layers.mask };
    // Images complètes de la boucle du jeu (simulation, modèles, rendu), comptées.
    const frame = g.frame.bind(g);
    g.__frames = 0;
    g.frame = (t) => {
      frame(t);
      g.__frames++;
    };
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    A.closeCards();
    g.phone.notify = () => {};
    g.missions.timer = 1e6;
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 13 * 3600;
    g.sky.rain = 0;
    g.sky.wet = 0;
    return first;
  });
}
// Images du jeu (boucle arrêtée) : simulation, synchronisation des modèles, rendu.
const ticks = (n) => E((n) => {
  const g = window.__game, A = window.__auto;
  for (let i = 0; i < n; i++) {
    A.tick(1);
    g.realism.update();
  }
  g.renderer.render(g.scene, g.camera);
}, n);
// État d'affichage du cheval principal et des autres chevaux.
const display = () => E(() => {
  const g = window.__game, h = g.mainHorse, Rz = g.realism, R = Rz.horses.get(h), tack = h.mesh.userData.tack;
  const others = [...Rz.horses].filter(([hh]) => hh !== h).map(([, r]) => window.__cls(r));
  return {
    main: h.def.id, name: h.name, model: h.def.model || null, cls: window.__cls(R),
    active: R ? !!R.active : null, root: R ? R.root.visible && R.root.parent === h.mesh : null, layer: h.mesh.layers.mask,
    hoofAt: !!h.hoofAt, saddle: !!tack?.userData.cfg.saddle, tackVisible: !!tack?.visible, tackLayer: tack?.layers.mask,
    tackTris: tack?.geometry.index ? tack.geometry.index.count / 3 : 0, lods: R?.lods ? R.lods.map((l) => l.visible) : null,
    settings: { characters: g.save.data.settings.characters, horses: g.save.data.settings.horses }, playerEnabled: Rz.playerEnabled,
    trial: Rz.trial ? Rz.trial.id : null, others, playerHorse: g.player.horse?.def?.id, mounted: g.player.mode === 'ride',
    active_id: g.save.data.activeHorse, horses: [...g.save.data.horses], mods: { ...h.mods },
    pad: h.mesh.userData.tack?.userData.cfg.pad || null,
  };
});
// « Mes chevaux » ouvert par l'interface : bouton du téléphone (HUD), puis l'application.
async function openStable() {
  await E(() => window.__game.phone.close());
  await page.tap('.phone-btn');
  await page.waitForSelector('.phone .app-icon[data-app="stable"], [data-app="stable"]', { state: 'visible' });
  await page.tap('[data-app="stable"]');
  await page.waitForSelector('[data-id="horse-tripo"]', { state: 'visible' });
  return E(() => {
    const cards = [...document.querySelectorAll('[data-horse]')].map((c) => ({ id: c.dataset.horse, title: c.querySelector('.title')?.textContent, btn: c.querySelector('button[data-id^="horse-"]')?.textContent, active: c.classList.contains('active'), text: c.textContent }));
    const head = document.querySelector('.app-head .sub, .app-head')?.textContent || '';
    return { head, cards, rentals: [...document.querySelectorAll('.mcard .pay')].length };
  });
}
// Choix d'un cheval par son bouton « Seller ce cheval », téléphone refermé ensuite (bouton du HUD).
async function pick(id) {
  await page.tap(`[data-id="horse-${id}"]`);
  await page.waitForFunction((id) => window.__game.mainHorse?.def.id === id, id);
  await page.waitForTimeout(300);
  await E(() => window.__game.phone.close());
}
// Attend n images rendues par la boucle du jeu (modèles synchronisés avant chaque rendu : realism.update).
const frames = async (n = 3) => {
  const f0 = await E(() => window.__game.__frames);
  await page.waitForFunction(([f0, n]) => window.__game.__frames >= f0 + n, [f0, n], { timeout: 120000, polling: 100 });
};
// Attend que le modèle du cheval principal soit celui voulu (boucle du jeu active).
const waitModel = (cls) => page.waitForFunction((cls) => {
  const g = window.__game, R = g.realism.horses.get(g.mainHorse);
  return window.__cls(R) === cls;
}, cls, { timeout: 120000, polling: 250 });
// Caméra dans le repère du cheval (côté, hauteur, avant), visée (hauteur, avant) ; rendu d'une image.
const frame = (v) => E((v) => {
  const g = window.__game, h = g.mainHorse, [s, u, f, ly, lf, fov = 34] = v;
  // Focale de capture (cheval cadré en entier), rendue au jeu après le rendu.
  const fov0 = g.camera.fov;
  g.camera.fov = fov;
  g.camera.updateProjectionMatrix();
  const L = { x: Math.cos(h.heading), z: -Math.sin(h.heading) }, F = h.forward;
  g.camera.position.set(h.pos.x + L.x * s + F.x * f, h.pos.y + u, h.pos.z + L.z * s + F.z * f);
  g.camera.lookAt(h.pos.x + F.x * lf, h.pos.y + ly, h.pos.z + F.z * lf);
  g.camera.updateMatrixWorld();
  g.realism.update();
  g.sky.update(g.hour(), g.player.focus.pos, 0);
  g.sky.follow(g.camera);
  g.world.update(0, g.camera, g.sky);
  g.renderer.render(g.scene, g.camera);
  g.camera.fov = fov0;
  g.camera.updateProjectionMatrix();
}, v);
const stored = () => E((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

// Monte, part au trot puis au galop en ligne droite quelques secondes (boucle arrêtée, 30 images par seconde), descend.
async function ride(tag) {
  await E(() => {
    const g = window.__game, A = window.__auto, h = g.mainHorse;
    A.stopLoop();
    A.foot();
    h.setPosition(140, 200, 0);
    h.ai = null;
    h.speed = 0;
    g.player.human.setPosition(141, 201);
  });
  await ticks(4);
  const r = await E(() => {
    const g = window.__game, A = window.__auto;
    A.mount();
    const tick = (n) => { for (let i = 0; i < n; i++) { A.tick(1); g.realism.update(); } };
    for (let i = 0; i < 300 && g.player.mode !== 'ride'; i++) tick(1);
    const h = g.player.horse, x0 = h.pos.x, z0 = h.pos.z;
    let maxSpeed = 0, modelFrames = 0, n = 0;
    for (let i = 0; i < 180; i++) {
      A.steer(0, 1, i < 60 ? 0.5 : 0.95);
      if (i >= 60) g.input.held.add('gallop');
      tick(1);
      n++;
      maxSpeed = Math.max(maxSpeed, h.speed);
      const R = g.realism.horses.get(h);
      if (window.__cls(R) === 'TripoHorse' && R.active && R.root.visible) modelFrames++;
    }
    A.releaseInput();
    // Information : filet du modèle Tripo (affiché quand le cheval est monté, voir tripoHorse.js).
    const bridle = g.realism.horses.get(h)?.bridleShown ?? null;
    return { mode: g.player.mode, horse: h.def.id, onMain: h === g.mainHorse, dist: Math.hypot(h.pos.x - x0, h.pos.z - z0), maxSpeed, modelFrames, n, bridle };
  });
  // Capture monté (vue de côté).
  await frame([5.2, 1.9, 0.6, 1.4, 0.4]);
  await page.addStyleTag({ content: '.hud, #touch { visibility: hidden !important; }' });
  await frame([5.2, 1.9, 0.6, 1.4, 0.4]);
  await shot(`${tag}-monte`);
  const off = await E(() => {
    const g = window.__game, A = window.__auto;
    const tick = (n) => { for (let i = 0; i < n; i++) { A.tick(1); g.realism.update(); } };
    for (let i = 0; i < 90 && g.player.horse.speed > 0.2; i++) tick(1);
    A.foot();
    for (let i = 0; i < 400 && g.player.mode !== 'foot'; i++) tick(1);
    tick(10);
    const R = g.realism.horses.get(g.mainHorse);
    document.querySelectorAll('style').forEach((s) => s.textContent.includes('visibility: hidden !important') && s.remove());
    A.startLoop();
    return { mode: g.player.mode, cls: window.__cls(R), active: !!R?.active, bridle: R?.bridleShown ?? null };
  });
  return { ...r, off };
}

// Capture du cheval principal sellé, à l'arrêt (boucle arrêtée le temps de la capture).
async function saddledShot(name) {
  await E(() => {
    const g = window.__game, A = window.__auto, h = g.mainHorse;
    A.stopLoop();
    A.foot();
    h.setPosition(140, 215, 0);
    h.ai = null;
    h.speed = 0;
    g.player.human.setPosition(133, 206);
    for (let i = 0; i < 40; i++) { A.tick(1); g.realism.update(); }
  });
  await page.addStyleTag({ content: '.hud, #touch, .toast, .toasts { visibility: hidden !important; }' });
  for (const [k, v] of Object.entries({ profil: [4.8, 1.6, 0.2, 1.15, 0.2], 'trois-quarts': [3.6, 1.8, 3.4, 1.2, 0.3] })) {
    await frame(v);
    await shot(`${name}-${k}`);
  }
  await E(() => {
    document.querySelectorAll('style').forEach((s) => s.textContent.includes('visibility: hidden !important') && s.remove());
    window.__auto.startLoop();
  });
}

// ===================== 1. Partie neuve =====================
await page.goto(`${base}/`, { timeout: 180000 });
await E(() => { localStorage.clear(); localStorage.setItem('strides-lang', 'fr'); });
let first = await boot();
await E(() => window.__game.realism.set('classic'));
let d0 = await display();
check('N1', 'partie neuve : Comète montée, sauvegarde inchangée (Comète seule), Comète affichée comme avant (procédural, réglages Classiques)', first.main === 'comete' && d0.main === 'comete' && d0.cls === 'classique' && d0.layer === 1 && JSON.stringify(d0.horses) === '["comete"]' && d0.active_id === 'comete' && d0.others.length === 0 && d0.trial === null, JSON.stringify({ first, d0 }));
let ui = await openStable();
await page.waitForTimeout(400);
await shot('neuve-mes-chevaux');
// Liste de l'application défilée jusqu'à la fiche de Tripo (seule la liste défile, pas le téléphone).
await E(() => {
  const c = document.querySelector('[data-horse="tripo"]'), b = c.closest('.app-body');
  b.scrollTop += c.getBoundingClientRect().top - b.getBoundingClientRect().top - 8;
});
await shot('neuve-mes-chevaux-tripo');
check('N2', '« Mes chevaux » : 2 chevaux, Comète (monture actuelle) puis Tripo (« Seller ce cheval »), pas proposé en location', /2 chevaux/.test(ui.head) && ui.cards.map((c) => c.id).join() === 'comete,tripo' && ui.cards[0].active && /Monture actuelle/.test(ui.cards[0].btn) && !ui.cards[1].active && /Seller ce cheval/.test(ui.cards[1].btn) && /à l’essai/.test(ui.cards[1].text) && ui.rentals === 3, JSON.stringify({ head: ui.head, cards: ui.cards.map((c) => ({ ...c, text: undefined })), rentals: ui.rentals }));
await pick('tripo');
await waitModel('TripoHorse');
let d1 = await display();
check('N3', 'Tripo sellé par l’interface : cheval principal et monture du joueur, choix dans activeHorse, liste de la sauvegarde inchangée', d1.main === 'tripo' && d1.name === 'Tripo' && d1.playerHorse === 'tripo' && d1.active_id === 'tripo' && JSON.stringify(d1.horses) === '["comete"]', JSON.stringify({ main: d1.main, player: d1.playerHorse, active: d1.active_id, horses: d1.horses }));
check('N4', 'Tripo affiché avec son modèle (TripoHorse) malgré « Modèles 3D : Classiques » et « Chevaux 3D : Classiques » ; cheval du jeu masqué mais animé ; aucun autre cheval changé ; pas d’essai de développement', d1.cls === 'TripoHorse' && d1.active && d1.root && d1.layer === 2 ** 31 && d1.hoofAt && d1.settings.characters === 'classic' && d1.settings.horses === 'classic' && !d1.playerEnabled && d1.others.length === 0 && d1.trial === null, JSON.stringify(d1));
check('N5', 'Tripo sellé comme Comète : selle, tapis, sangle et étriers gardés sur son dos ; mêmes bonus d’équipement', d1.saddle && d1.tackVisible && d1.tackLayer === 1 && d1.tackTris > 0 && JSON.stringify(d1.mods) === JSON.stringify(d0.mods) && d1.pad === d0.pad, JSON.stringify({ saddle: d1.saddle, visible: d1.tackVisible, layer: d1.tackLayer, tris: d1.tackTris, mods: [d0.mods, d1.mods], pad: [d0.pad, d1.pad] }));
await saddledShot('neuve-tripo-selle');
let rd = await ride('neuve-tripo');
check('N6', 'Tripo monté quelques secondes (trot puis galop), modèle à chaque image, puis pied à terre', rd.horse === 'tripo' && rd.onMain && rd.mode === 'ride' && rd.dist > 15 && rd.maxSpeed > 5 && rd.modelFrames === rd.n && rd.off.mode === 'foot' && rd.off.cls === 'TripoHorse' && rd.off.active, JSON.stringify(rd));
await openStable();
await pick('comete');
await waitModel('classique');
await frames(3);
let d2 = await display();
check('N7', 'Comète resellée par l’interface : cheval du jeu affiché comme avant, plus aucun modèle Tripo', d2.main === 'comete' && d2.cls === 'classique' && d2.layer === 1 && d2.others.length === 0 && d2.active_id === 'comete' && d2.playerHorse === 'comete', JSON.stringify(d2));
await page.waitForTimeout(1500);
let s2 = await stored();
await page.reload({ waitUntil: 'domcontentloaded' });
first = await boot();
let d3 = await display();
check('N8', 'rechargement : Comète conservée comme monture (activeHorse), sauvegarde avec Comète seule', s2?.activeHorse === 'comete' && first.main === 'comete' && d3.main === 'comete' && d3.active_id === 'comete' && JSON.stringify(d3.horses) === '["comete"]', JSON.stringify({ stored: s2 && { activeHorse: s2.activeHorse, horses: s2.horses }, first, main: d3.main }));

// ===================== 2. Ancienne sauvegarde (Comète seule) =====================
await E(([k, v]) => { window.__game.save.locked = true; localStorage.clear(); localStorage.setItem('strides-lang', 'fr'); localStorage.setItem(k, JSON.stringify(v)); }, [KEY, OLD]);
await page.reload({ waitUntil: 'domcontentloaded' });
first = await boot();
const a0 = await display();
const st0 = await stored();
const same = Object.fromEntries(KEEP.map((k) => [k, canon(st0?.[k]) === canon(OLD[k])]));
check('O1', 'ancienne sauvegarde chargée sans changement (chevaux, argent, réputation, compétences, missions, équipement, réglages) ; Comète montée et affichée comme avant', Object.values(same).every(Boolean) && st0?.activeHorse === 'comete' && first.main === 'comete' && a0.main === 'comete' && a0.cls === 'classique' && a0.settings.characters === 'classic', JSON.stringify({ same, first, main: a0.main, cls: a0.cls, settings: a0.settings }));
ui = await openStable();
await page.waitForTimeout(400);
await shot('ancienne-mes-chevaux');
check('O2', '« Mes chevaux » : Tripo disponible en deuxième position (« Seller ce cheval »)', ui.cards.map((c) => c.id).join() === 'comete,tripo' && /Seller ce cheval/.test(ui.cards[1].btn) && /2 chevaux/.test(ui.head), JSON.stringify(ui.cards.map((c) => ({ id: c.id, btn: c.btn, active: c.active }))));
await pick('tripo');
await waitModel('TripoHorse');
const a1 = await display();
check('O3', 'Tripo sellé : modèle TripoHorse avec les réglages Classiques de la sauvegarde, sellé avec la selle équipée', a1.main === 'tripo' && a1.cls === 'TripoHorse' && a1.active && a1.layer === 2 ** 31 && a1.saddle && a1.tackVisible && a1.mods.jump === a0.mods.jump && a1.mods.jump > 0 && !a1.playerEnabled && a1.others.length === 0, JSON.stringify(a1));
rd = await ride('ancienne-tripo');
check('O4', 'Tripo monté quelques secondes puis pied à terre', rd.horse === 'tripo' && rd.mode === 'ride' && rd.dist > 15 && rd.modelFrames === rd.n && rd.off.mode === 'foot' && rd.off.cls === 'TripoHorse', JSON.stringify(rd));
await page.waitForTimeout(1500);
const st1 = await stored();
check('O5', 'sauvegarde : seul le choix de la monture change (activeHorse = tripo), liste des chevaux et possessions intactes', st1?.activeHorse === 'tripo' && JSON.stringify(st1.horses) === '["comete"]' && st1.money === OLD.money && st1.reputation === OLD.reputation && JSON.stringify(st1.upgrades) === JSON.stringify(OLD.upgrades) && JSON.stringify(st1.completed) === JSON.stringify(OLD.completed), JSON.stringify({ activeHorse: st1?.activeHorse, horses: st1?.horses, money: st1?.money }));
await page.reload({ waitUntil: 'domcontentloaded' });
first = await boot();
const a2 = await display();
check('O6', 'rechargement : Tripo toujours sellé et affiché avec son modèle dès la première image (préchargé)', first.main === 'tripo' && first.cls === 'TripoHorse' && first.layer === 2 ** 31 && a2.main === 'tripo' && a2.cls === 'TripoHorse' && a2.active_id === 'tripo', JSON.stringify({ first, cls: a2.cls }));
// Réglages « Réalistes » : Tripo garde son modèle, les autres chevaux suivent leur règle habituelle (RealHorse proches).
await E(() => { const g = window.__game; g.realism.set('real'); g.save.data.settings.horses = 'real'; });
await page.waitForTimeout(4000);
const a3 = await display();
check('O7', 'réglages « Réalistes » : Tripo garde son modèle ; aucun autre cheval ne prend le modèle Tripo', a3.cls === 'TripoHorse' && a3.active && !a3.others.includes('TripoHorse'), JSON.stringify({ cls: a3.cls, others: a3.others }));
await E(() => { const g = window.__game; g.realism.set('classic'); g.save.data.settings.horses = 'classic'; });
await saddledShot('ancienne-tripo-selle');
await openStable();
await pick('comete');
await waitModel('classique');
await frames(3);
const a4 = await display();
check('O8', 'retour à Comète : cheval du jeu affiché, plus aucun modèle Tripo, activeHorse = comete', a4.main === 'comete' && a4.cls === 'classique' && a4.layer === 1 && a4.others.length === 0 && a4.active_id === 'comete', JSON.stringify({ main: a4.main, cls: a4.cls, others: a4.others }));

// ===================== 3. Modèle introuvable =====================
// Tripo sellé, puis fichier du modèle refusé au rechargement : message, cheval du jeu affiché à sa place (robe alezan
// clair, liste, balzanes), partie jouable ; seule erreur attendue : le refus de la requête elle-même.
await openStable();
await pick('tripo');
await page.waitForTimeout(1500);
const nErr = errors.length;
await page.route(/real\/horse_tripo\./, (r) => r.abort());
await page.reload({ waitUntil: 'domcontentloaded' });
first = await boot();
await page.waitForFunction(() => window.__game.realism.models?.horse_tripo?.failed, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const f1 = await display();
const toasts = await E(() => window.__toasts);
await saddledShot('echec-cheval-du-jeu');
rd = await ride('echec');
const failErr = errors.slice(nErr).filter((e) => !/Failed to load resource|ERR_FAILED/.test(e));
check('F1', 'modèle introuvable : message affiché, Tripo montré par le cheval du jeu (procédural), monté normalement', f1.main === 'tripo' && f1.cls === 'classique' && f1.layer === 1 && !f1.hoofAt && toasts.some((x) => /Modèle 3D du cheval indisponible/.test(x)) && rd.horse === 'tripo' && rd.dist > 15 && rd.off.mode === 'foot' && failErr.length === 0, JSON.stringify({ main: f1.main, cls: f1.cls, layer: f1.layer, toasts, ride: { dist: rd.dist, off: rd.off }, failErr }));
errors.length = nErr;
await page.unroute(/real\/horse_tripo\./);
await openStable();
await pick('comete');

check('E1', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 5).join(' | '));
writeFileSync(`${OUT}/rapport.json`, JSON.stringify({ base, results, errors }, null, 1));
console.log(fails ? `TRIPO ÉCURIE ${fails} échec(s)` : 'TRIPO ÉCURIE OK');
process.exitCode = fails ? 1 : 0;
await browser.close();
