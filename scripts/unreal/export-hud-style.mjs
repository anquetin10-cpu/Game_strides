// Interface d'épreuve du parcours CSO (tranche T7) : styles, comportement et captures du HUD du jeu web EN COURS
// D'EXÉCUTION (src/ui/hud.js, src/styles.css). Le jeu web est la spécification ; ce script ne modifie rien dans src/ ni
// tests/ : il lit le DOM et les styles calculés par le navigateur, et rejoue des appels hud.* déjà enregistrés.
//
// Sorties :
//  - unreal/StridesGrandTour/Content/Data/hud_cso_style.json : styles calculés (getComputedStyle) et boîtes
//    (getBoundingClientRect) des éléments du HUD d'épreuve (tableau, chrono, temps accordé, points, prochain, crans,
//    mot d'appel par genre, astuce, toast, grand message, bouton SAUT, bouton pause, colonne du haut) dans un état de
//    référence, pour chaque viewport (844 × 390, 667 × 308) ; table des masquages par classe du HUD (cso-ctl, cso-sober,
//    cso-on, big-on : display et opacité de chaque élément, l'élément lui-même rendu visible) ; polices chargées.
//  - unreal/core/tests/oracles/cso_hud.json : comportement du HUD (toasts, astuce, grand message, mot d'appel, crans de
//    cadence, tableau affiché ou non, classes, objectif) quand on rejoue dans le vrai HUD du jeu les appels hud.* et
//    l'état lu par hud.update (game.course, tableau, cadence) des exécutions de unreal/core/tests/oracles/cso_runs/, sur
//    une horloge virtuelle (setTimeout et clearTimeout remplacés : ticks de 1/3 ms, 100 ticks par image de 1/30 s ; un
//    temporisateur échu se déclenche avant l'image suivante, dans l'ordre échéance puis création), aux hauteurs 390 px
//    (un toast) et 768 px (deux toasts). Relevé seulement quand une partie change. Rejoué par
//    unreal/core/tests/test_core.cpp (testCsoHud) avec strides::CsoHud.
//  - avec --shots : poses « hud-* » de unreal/docs/parite/cso/poses.json (les autres poses sont gardées) et captures web
//    <pose>-web.png (HUD visible, 844 × 390 et 667 × 308) : décor et caméra de la pose cadrage-040, HUD obtenu en
//    rejouant une exécution de l'oracle jusqu'à l'image de la pose (même règle que cso_hud.json) ; la capture Unreal
//    jumelle est faite par -StridesShots=cso (AStridesShots, widget UStridesCsoHud), le montage par
//    scripts/unreal/parite-montage.py.
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5173 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-hud-style.mjs [--shots] [--no-oracle]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const RUNS = join(ROOT, 'unreal/core/tests/oracles/cso_runs');
const ORA = join(ROOT, 'unreal/core/tests/oracles');
const DATA = join(ROOT, 'unreal/StridesGrandTour/Content/Data');
const PARITE = join(ROOT, 'unreal/docs/parite/cso');
const SHOTS = process.argv.includes('--shots');
const NO_ORACLE = process.argv.includes('--no-oracle');
const STYLE_VIEWS = [{ width: 844, height: 390 }, { width: 667, height: 308 }];
const ORACLE_HEIGHTS = [390, 768];
// Appels du HUD rejoués (les autres méthodes enregistrées — notify, dialog, jumpEarly — relèvent d'autres tranches).
const HUD_FNS = ['big', 'toast', 'hint', 'clearHint', 'jumpFeedback', 'setObjective'];

// Entrées de hud.update et appels d'une exécution de l'oracle (même règle que testCsoHud) : appels du lancement (image
// -1), puis par image : appels hud.* de HUD_FNS dans l'ordre, game.course (controls, kind), tableau (game.course.hud(),
// valeurs relevées), cadence de concours et réglage au joystick (canal « ch » ; absents des images légères : cadence
// indéfinie).
const readRun = (file) => {
  const { frames, ...head } = JSON.parse(readFileSync(join(RUNS, file), 'utf8'));
  return { head, frames };
};
const pick = (calls) => (calls || []).filter((c) => HUD_FNS.includes(c.fn)).map((c) => [c.fn, c.args]);
const runInputs = ({ head, frames }) => ({
  setup: pick(head.setup?.calls?.hud),
  frames: frames.map((f) => ({
    hud: pick(f.hud),
    course: f.course ? { controls: f.course.controls ?? null, kind: f.course.kind ?? null } : null,
    board: f.board ? { started: f.board.started, bell: f.board.bell, t: f.board.t, ta: f.board.ta, pen: f.board.pen, over: f.board.over, next: f.board.next, finished: f.board.finished, eliminated: f.board.eliminated } : null,
    cad: f.ch?.s ? [f.ch.s.cad ?? null, !!f.ch.s.ca] : null,
  })),
});

// ---------------------------------------------------------------------------------------------------------------
// Code injecté dans la page (window.__hudT7).
function PAGE() {
  const g = window.__game;
  const H = g.hud;
  g.renderer.setAnimationLoop(null);
  const DT = 1 / 30;
  // Animations et transitions CSS du HUD coupées : styles, masquages et captures relèvent l'état d'arrivée (fin de pop,
  // toastIn, hintIn, fondus) ; sans cela, une page sans boucle de rendu les laisse à leur état de départ (opacité 0).
  const st = document.createElement('style');
  st.textContent = '.hud, .hud * { animation: none !important; transition: none !important; }';
  document.head.appendChild(st);
  // Horloge virtuelle des temporisations : ticks de 1/3 ms.
  const VT = { now: 0, seq: 0, list: new Map() };
  window.setTimeout = (fn, ms, ...a) => {
    const id = ++VT.seq;
    VT.list.set(id, { due: VT.now + Math.round(Math.max(0, Number(ms) || 0) * 3), seq: id, fn, a });
    return id;
  };
  window.clearTimeout = (id) => {
    VT.list.delete(id);
  };
  const advance = (ticks) => {
    const target = VT.now + ticks;
    for (;;) {
      let best = null;
      for (const t of VT.list.values()) if (t.due <= target && (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq))) best = t;
      if (!best) break;
      VT.list.delete(best.seq);
      VT.now = Math.max(VT.now, best.due);
      best.fn(...best.a);
    }
    VT.now = target;
  };
  const reset = () => {
    VT.list.clear();
    VT.now = 0;
    H.toastsEl.replaceChildren();
    H.hintEl.classList.add('off');
    H.hintEl.innerHTML = '';
    H.bigEl.classList.add('hidden');
    H.bigEl.classList.remove('pop');
    H.bigEl.querySelector('.t').textContent = '';
    H.bigEl.querySelector('.s').textContent = '';
    H.el.classList.remove('big-on', 'cso-on', 'cso-ctl', 'cso-sober');
    H.jumpFbEl.className = 'jump-fb off';
    H.jumpFbEl.textContent = '';
    H.setObjective(null);
    H._placeHint();
    H._cad = undefined;
    H._cadT = undefined;
    H._cadN = undefined;
    for (const c of H.csoCad.children) c.classList.remove('on');
    H.csoCad.classList.remove('show');
    H.csoEl.classList.add('hidden');
    H.csoEl.classList.remove('over', 'faults');
    H._csoT = undefined;
    g.course = null;
    g.player.csoCadence = undefined;
    g.player._cadAdjust = false;
  };
  const callHud = ([fn, args]) => (fn === 'setObjective' ? H.setObjective(args[0]) : H[fn](...args));
  const applyFrame = (fr) => {
    g.course = fr.course ? { ...fr.course, hud: fr.board ? () => fr.board : undefined } : null;
    g.player.csoCadence = fr.cad && fr.cad[0] !== null ? fr.cad[0] : undefined;
    g.player._cadAdjust = fr.cad ? fr.cad[1] : false;
    for (const c of fr.hud) callHud(c);
  };
  // État affiché, par partie (comparé par testCsoHud).
  const snap = () => ({
    to: [...H.toastsEl.children].map((c) => [c.textContent, [...c.classList].filter((k) => k !== 'toast').join(' ')]),
    hi: [H.hintEl.classList.contains('off'), H.hintEl.innerHTML, H.hintEl.classList.contains('inline')],
    bg: [H.bigEl.classList.contains('hidden'), H.bigEl.querySelector('.t').textContent, H.bigEl.querySelector('.s').textContent, H.el.classList.contains('big-on')],
    fb: [H.jumpFbEl.textContent, H.jumpFbEl.className],
    cad: [H.csoCad.querySelectorAll('i.on').length, H.csoCad.classList.contains('show')],
    bd: [H.csoEl.classList.contains('hidden'), H.csoEl.classList.contains('over'), H.csoEl.classList.contains('faults')],
    cl: [H.el.classList.contains('cso-on'), H.el.classList.contains('cso-ctl'), H.el.classList.contains('cso-sober')],
    ob: H.objEl.classList.contains('off'),
  });
  const boardTxt = () => [H.csoT.textContent, H.csoTa.textContent, H.csoPen.textContent, H.csoNext.textContent];
  // Rejoue une exécution ; rend les changements par partie et les écarts entre le tableau affiché et le tableau relevé.
  const replay = (inp, upTo = Infinity, extra = null) => {
    reset();
    const out = [];
    let prev = {};
    const rec = (f) => {
      const s = snap();
      const d = {};
      for (const k of Object.keys(s)) if (JSON.stringify(s[k]) !== JSON.stringify(prev[k])) d[k] = s[k];
      prev = s;
      if (Object.keys(d).length) out.push([f, d]);
    };
    for (const c of inp.setup) callHud(c);
    rec(-1);
    for (let f = 0; f < inp.frames.length && f <= upTo; f++) {
      advance(100);
      const fr = inp.frames[f];
      applyFrame(fr);
      if (extra && extra.frame === f) for (const c of extra.calls) callHud(c);
      H.update(DT);
      rec(f);
    }
    return { snaps: out, last: snap(), board: boardTxt() };
  };

  // Styles calculés d'un élément (px, couleurs rgba, etc. tels que le navigateur les résout).
  const PROPS = ['display', 'opacity', 'color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginLeft', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'maxWidth', 'minWidth', 'width', 'height', 'gap', 'rowGap', 'columnGap', 'alignItems', 'alignSelf', 'textAlign', 'whiteSpace', 'textShadow', 'boxShadow', 'transform', 'top', 'left', 'right', 'bottom'];
  const css = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // Arrondi au dixième de pixel (boîtes et longueurs en px) : mesures stables d'un export à l'autre.
    const r1 = (v) => Math.round(v * 10) / 10;
    const o = { rect: [r.x, r.y, r.width, r.height].map(r1) };
    for (const p of PROPS) o[p] = typeof s[p] === 'string' ? s[p].replace(/(-?\d+\.\d+)px/g, (_, n) => `${r1(Number(n))}px`) : s[p];
    return o;
  };
  // État de référence : épreuve en cours (classes de concours), tableau lancé, crans affichés, mot, astuce, toast,
  // grand message ; animations CSS terminées par l'appelant (attente réelle).
  const reference = (texts) => {
    reset();
    const board = { started: true, bell: 0, t: 12.34, ta: 64, pen: 4, over: false, next: '4A', finished: false, eliminated: false };
    applyFrame({ course: { controls: 'cso', kind: 'cso' }, board, cad: [6.2, true], hud: [] });
    H.update(DT);
    H.jumpFeedback(texts.fb, 'good');
    H.hint(texts.hint, 0);
    H.toast(texts.toast);
    H.big(texts.bigT, texts.bigS, 60000);
    return true;
  };
  const styles = (texts) => {
    const q = (sel) => H.el.querySelector(sel);
    const out = {
      viewport: [innerWidth, innerHeight],
      hud: css(H.el), topBar: css(q('.top-bar')), topMid: css(H.topMid), topRight: css(q('.top-right')), pause: css(H.pauseBtn),
      board: css(H.csoEl), boardT: css(H.csoT), boardTa: css(H.csoTa), boardPen: css(H.csoPen), boardNext: css(H.csoNext), clockIco: css(q('.clock-ico')),
      cad: css(H.csoCad), cadBars: [...H.csoCad.children].map(css),
      jumpFb: css(H.jumpFbEl), hint: css(H.hintEl), hintB: css(H.hintEl.querySelector('b')), toasts: css(H.toastsEl), toast: css(H.toastsEl.firstElementChild),
      big: css(H.bigEl), bigT: css(H.bigEl.querySelector('.t')), bigS: css(H.bigEl.querySelector('.s')),
      jump: css(H.btnJump), jumpLabel: css(H.btnJump.querySelector('span')), actions: css(H.actionsEl),
    };
    // Variantes : genre du mot d'appel, tableau en dépassement et pénalités, crans éteints, toast « money ».
    const fbKinds = {};
    for (const k of ['good', 'ok', 'bad']) {
      H.jumpFbEl.className = `jump-fb ${k}`;
      fbKinds[k] = css(H.jumpFbEl);
    }
    H.jumpFbEl.className = 'jump-fb good';
    H.csoEl.classList.add('over', 'faults');
    const over = { boardT: css(H.csoT), boardPen: css(H.csoPen) };
    H.csoEl.classList.remove('over', 'faults');
    const plain = { boardT: css(H.csoT), boardPen: css(H.csoPen) };
    H.csoEl.classList.add('faults');
    return { ...out, fbKinds, boardOver: over, boardPlain: plain, cadOff: css(H.csoCad.children[5]), cadOn: css(H.csoCad.children[0]), fonts: { ui: document.fonts.check('600 12px Geist'), mono: document.fonts.check('700 20px "Geist Mono"') } };
  };
  // Masquages : chaque élément rendu visible pour lui-même (classes hidden / hide / off retirées, un toast dans la
  // colonne), puis display et opacité calculés sous chaque combinaison de classes du HUD.
  const ELEMS = {
    minimap: '.minimap-wrap', wallet: '.wallet', phone: '.phone-btn', objective: '.objective', hint: '.hint', toasts: '.toasts', jumpFb: '.jump-fb', board: '.cso-board', clockIco: '.clock-ico',
    telemetry: '.telemetry', jump: '.btn-jump', boost: '.btn-gallop', action: '.btn-action', action2: '.btn-action2', whistle: '.btn-whistle', hr: '.hr-line', stamina: '.stamina', big: '.big-msg',
  };
  const COMBOS = [[], ['cso-ctl'], ['cso-ctl', 'cso-sober'], ['cso-ctl', 'cso-sober', 'cso-on'], ['big-on'], ['cso-on'], ['cso-sober'], ['cso-ctl', 'cso-sober', 'cso-on', 'big-on']];
  const masks = () => {
    reset();
    H.toast('·');
    const els = Object.fromEntries(Object.entries(ELEMS).map(([k, sel]) => [k, H.el.querySelector(sel) || document.querySelector(sel)]));
    els.pause = H.pauseBtn;
    for (const el of Object.values(els)) el.classList.remove('hidden', 'hide', 'off');
    const out = {};
    for (const combo of COMBOS) {
      H.el.classList.remove('cso-ctl', 'cso-sober', 'cso-on', 'big-on');
      for (const c of combo) H.el.classList.add(c);
      out[combo.join(' ')] = Object.fromEntries(Object.entries(els).map(([k, el]) => {
        const s = getComputedStyle(el);
        return [k, [s.display, Number(s.opacity)]];
      }));
    }
    reset();
    return { combos: COMBOS.map((c) => c.join(' ')), elements: Object.keys(ELEMS).concat(['pause']), table: out };
  };

  // Pose de capture du HUD : décor et caméra de la pose, HUD rejoué jusqu'à l'image de la pose.
  const pose = (ps, inp) => {
    const h = g.player.horse;
    h.setPosition(ps.horse.x, ps.horse.z, ps.horse.h);
    h.speed = 0;
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + ps.hour * 3600;
    const cam = g.camera;
    cam.position.set(...ps.eye);
    cam.fov = ps.fovV;
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    cam.lookAt(...ps.target);
    g.sky.setDay(Math.floor(g.save.data.gameTime / 86400));
    g.sky.update(g.hour(), h.pos, 0);
    g.sky.follow(cam);
    g.world.update(0, cam, g.sky, h.pos);
    g.scene.updateMatrixWorld();
    g.renderer.render(g.scene, cam);
    const r = replay(inp, ps.hud.frame, ps.hud.extra);
    return { last: r.last, board: r.board, sunDir: [g.sky.sunDir.x, g.sky.sunDir.y, g.sky.sunDir.z].map((v) => Math.round(v * 1e6) / 1e6) };
  };
  window.__hudT7 = { replay, reference, styles, masks, pose, reset, resize: () => g.resize() };
}

// ---------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
// Une page par langue (textes propres au HUD : « Départ … s », virgule décimale du chrono).
const openPage = async (lang) => {
  const ctx = await browser.newContext({ viewport: STYLE_VIEWS[0], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await page.goto(`${BASE}/?autostart&quality=high&lang=${lang}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
  // Cartes et dialogues d'accueil fermés (comme le pilote des tests) avant de figer la boucle.
  await page.addScriptTag({ content: readFileSync(join(ROOT, 'tests/e2e/autopilot.js'), 'utf8') });
  await page.evaluate(() => {
    window.__auto.stopLoop();
    window.__auto.closeCards();
    while (window.__game.hud.dialogActive) window.__game.hud.advanceDialog();
    window.__auto.closeCards();
  });
  await page.addScriptTag({ content: `(${PAGE.toString()})();` });
  return { ctx, page };
};
const pages = { fr: await openPage('fr') };
const page = pages.fr.page;
const setView = async (v, pg = page) => {
  await pg.setViewportSize(v);
  await pg.evaluate(() => window.__hudT7.resize());
};

// Textes de l'état de référence et des poses : pris dans les oracles (jamais recopiés).
const index = JSON.parse(readFileSync(join(RUNS, 'index.json'), 'utf8'));
const runCache = new Map();
const run = (id, lang) => {
  const k = `${id}.${lang}`;
  if (!runCache.has(k)) runCache.set(k, readRun(index.runs.find((r) => r.id === id && r.lang === lang).file));
  return runCache.get(k);
};
const findCall = (r, fn, test) => {
  for (const f of r.frames) for (const c of f.hud || []) if (c.fn === fn && test(c.args)) return { f: f.f, args: c.args };
  throw new Error(`appel ${fn} introuvable dans ${r.head.id}`);
};
const feedback = JSON.parse(readFileSync(join(ORA, 'cso_feedback.json'), 'utf8'));
const perfect = feedback.cases.find((c) => c.cso && c.aid === 'full' && c.last === 'this' && c.q === 'perfect' && c.clear).out;
const cloche = findCall(run('t4-cloche', 'fr'), 'big', (a) => a[0] === 'CLOCHE');
const clocheHint = findCall(run('t4-cloche', 'fr'), 'hint', () => true);
const barre = findCall(run('t4-arrivee-barre', 'fr'), 'toast', (a) => a[0].startsWith('Barre au'));
const texts = { fb: perfect[0], hint: clocheHint.args[0], toast: barre.args[0], bigT: cloche.args[0], bigS: cloche.args[1] };

// ---- Styles et masquages ----
const style = { schema: 'strides.hud_cso_style/1', generator: 'scripts/unreal/export-hud-style.mjs', source: ['src/ui/hud.js', 'src/styles.css'],
  doc: 'styles calculés par le navigateur (getComputedStyle, chaînes telles quelles) et boîtes (rect = [x, y, largeur, hauteur], px CSS) des éléments du HUD d’épreuve dans l’état de référence (épreuve en cours, tableau lancé, crans affichés, mot d’appel, astuce, toast, grand message ; textes tirés des oracles) ; views = un relevé par viewport ; masks = display et opacité de chaque élément (rendu visible pour lui-même) sous chaque combinaison de classes du HUD',
  texts, views: [], masks: null };
for (const v of STYLE_VIEWS) {
  await setView(v);
  await page.evaluate((t) => window.__hudT7.reference(t), texts);
  // Polices chargées (Geist, Geist Mono, police de secours des glyphes ▸ ✓) avant de mesurer : sinon la largeur des
  // textes varie d'un export à l'autre (constaté : 1/64 px).
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  style.views.push(await page.evaluate((t) => window.__hudT7.styles(t), texts));
}
await setView(STYLE_VIEWS[0]);
style.masks = await page.evaluate(() => window.__hudT7.masks());
writeFileSync(join(DATA, 'hud_cso_style.json'), JSON.stringify(style, null, 1) + '\n');
console.log('styles :', style.views.map((v) => v.viewport.join('x')).join(', '), '; polices Geist chargées :', JSON.stringify(style.views[0].fonts));

// Séquence synthétique (entrées écrites ici, sorties du HUD du jeu) : branches qu'aucune exécution n'atteint — deux et
// trois toasts rapprochés (écran haut), classe de toast, mot d'appel vide puis remplacé, astuce sans durée puis
// effacée, durée par défaut, grand message relancé pendant la marge de 400 ms, grand message sans sous-titre ni durée,
// tableau fourni sans game.course, objectif et astuce dans la carte, tableau
// en dépassement, cadence sur les égalités d'arrondi, au-delà de 8 m/s, négative, indéfinie, réglée ou non, commandes
// hors concours.
const synthInputs = () => {
  const N = 200;
  const board = (over, pen) => ({ started: true, bell: 0, t: over ? 70 : 3, ta: 64, pen, over, next: '2', finished: false, eliminated: false });
  const frames = Array.from({ length: N }, (_, f) => ({ hud: [], course: { controls: 'cso', kind: 'cso' }, board: board(false, 0), cad: [0, false] }));
  const at = (f, ...calls) => frames[f].hud.push(...calls);
  at(0, ['big', ['A', 'a', 2000]], ['toast', ['t1']], ['hint', ['<b>h</b> x', 3000]]);
  at(3, ['toast', ['t2', 'money']]);
  at(5, ['toast', ['t3']]);
  at(10, ['jumpFeedback', ['fb1', 'good']], ['jumpFeedback', ['', 'bad']]);
  at(20, ['jumpFeedback', ['fb2']]);
  at(40, ['hint', ['h2', 0]]);
  at(50, ['clearHint', []]);
  at(55, ['hint', ['h3']]);
  at(65, ['big', ['B', '', 500]]);
  at(100, ['setObjective', [{ text: 'o' }]]);
  for (let f = 110; f < 120; f++) frames[f].course = null;
  at(120, ['setObjective', [null]]);
  at(125, ['big', ['C']]);
  for (let f = 130; f < 140; f++) frames[f].board = board(true, 2);
  const cad = [[30, 2.0, true], [31, 2.0, false], [60, 8 / 6 * 0.5, true], [62, 8 / 6 * 3.5, false], [90, 6.2, false], [95, 8, true], [100, 9, false], [102, -1, false], [104, 0.6666, true]];
  let cur = [0, false];
  for (let f = 0; f < N; f++) {
    const c = cad.find((x) => x[0] === f);
    if (c) cur = [c[1], c[2]];
    frames[f].cad = [cur[0], f === (c && c[0]) ? cur[1] : false];
  }
  for (let f = 105; f < 108; f++) frames[f].cad = null;
  for (let f = 140; f < 150; f++) frames[f].course = { controls: 'cso', kind: 'cso-train' };
  for (let f = 150; f < 160; f++) frames[f].course = { controls: null, kind: 'xc' };
  at(170, ['toast', ['t4']], ['toast', ['t5', 'gold']], ['toast', ['t6']]);
  return { setup: [['clearHint', []]], frames };
};

// ---- Comportement (oracle cso_hud.json) ----
if (!NO_ORACLE) {
  const doc = { schema: 'strides.oracle.cso_hud/1', generator: 'scripts/unreal/export-hud-style.mjs', source: ['src/ui/hud.js'],
    doc: 'HUD du jeu web (vrai Hud, DOM) rejouant les appels hud.* (big, toast, hint, clearHint, jumpFeedback, setObjective) et l’état lu par hud.update (game.course : controls, kind ; tableau : valeurs relevées, pour les classes over et faults ; cadence de concours et réglage au joystick : canal ch, indéfinie dans les images légères) des exécutions de cso_runs/ ; horloge virtuelle : appels du lancement à 0, image f à (f + 1) × 100 ticks de 1/3 ms, temporisateurs échus déclenchés avant les appels de l’image (échéance puis création), hud.update(1/30) après les appels. snaps = [image, parties changées] : to = toasts [texte, classes en plus de toast] ; hi = astuce [masquée, innerHTML, dans l’objectif] ; bg = grand message [masqué, titre, sous-titre, big-on] ; fb = mot d’appel [texte, className] ; cad = crans [allumés, show] ; bd = tableau [masqué, over, faults] ; cl = [cso-on, cso-ctl, cso-sober] ; ob = objectif masqué (off). Textes du tableau : non relevés ici (valeurs du tableau arrondies au millionième dans cso_runs, Math.ceil de la cloche en dépend) ; le texte affiché par le jeu en cours d’exécution est board.txt de cso_runs, comparé par testCsoRuns.',
    heights: ORACLE_HEIGHTS, synth: 'id « synth » : séquence synthétique, entrées dans inputs (setup = appels du lancement ; frames[f] = { hud : [fn, args], course, board, cad : [cadence, réglage] | null })', replays: [] };
  if (!pages.en) pages.en = await openPage('en');
  for (const vh of ORACLE_HEIGHTS) {
    for (const lg of Object.keys(pages)) await setView({ width: 844, height: vh }, pages[lg].page);
    for (const r of index.runs) {
      const rr = run(r.id, r.lang);
      const inp = runInputs(rr);
      if (!inp.setup.length && !inp.frames.some((f) => f.hud.length || f.course)) continue;
      const res = await pages[r.lang].page.evaluate((i) => window.__hudT7.replay(i), inp);
      doc.replays.push({ id: r.id, lang: r.lang, vh, frames: inp.frames.length, snaps: res.snaps });
    }
    runCache.clear();
    const synth = synthInputs();
    doc.replays.push({ id: 'synth', lang: 'fr', vh, frames: synth.frames.length, inputs: synth, snaps: (await page.evaluate((i) => window.__hudT7.replay(i), synth)).snaps });
    console.log(`hauteur ${vh} : ${doc.replays.filter((x) => x.vh === vh).length} exécutions rejouées (dont la séquence synthétique)`);
  }
  // Une ligne par exécution rejouée (diffs lisibles).
  const { replays, ...headDoc } = doc;
  writeFileSync(join(ORA, 'cso_hud.json'), JSON.stringify(headDoc).replace(/}$/, ',"replays":[\n') + replays.map((x) => JSON.stringify(x)).join(',\n') + '\n]}\n');
  console.log(`cso_hud.json : ${replays.length} rejeux, ${replays.reduce((a, x) => a + x.snaps.length, 0)} relevés`);
}

// ---- Captures (poses hud-*) ----
if (SHOTS) {
  mkdirSync(PARITE, { recursive: true });
  const posesFile = join(PARITE, 'poses.json');
  const posesDoc = JSON.parse(readFileSync(posesFile, 'utf8'));
  const base = posesDoc.poses.find((p) => p.name === 'cadrage-040');
  if (!base) throw new Error('pose cadrage-040 absente de poses.json (export-cso-runs.mjs --shots=cadrage)');
  const firstFrame = (r, test) => {
    const f = r.frames.find(test);
    if (!f) throw new Error(`image introuvable dans ${r.head.id}`);
    return f.f;
  };
  const HOLD = 21; // 0,7 s après l'événement : animations d'apparition terminées
  const sf = run('t4-sans-faute', 'fr');
  const fb1 = findCall(sf, 'jumpFeedback', () => true);
  const droit = run('droit', 'fr');
  const lastAdjust = droit.frames.filter((f) => f.ch?.s?.ca && f.board).pop();
  const deux = run('t4-deux-refus', 'fr');
  const elim = findCall(deux, 'big', (a) => a[0] === 'ÉLIMINÉ');
  const specs = [
    { name: 'hud-cloche', run: 't4-cloche', frame: cloche.f + HOLD, desc: 'cloche : « CLOCHE », sous-titre et astuce de l’entrée en piste, tableau « Départ 45 s · accordé 64 s »' },
    { name: 'hud-depart', run: 't4-cloche', frame: cloche.f + 75, desc: 'avant le départ, 2,5 s après la cloche : grand message retiré, tableau « Départ … s · accordé 64 s », astuce' },
    { name: 'hud-course', run: 't4-sans-faute', frame: firstFrame(sf, (f) => f.board?.txt?.[3] === '▸ 4A') + HOLD, desc: 'en course, obstacle suivant « ▸ 4A », mot d’appel du 3' },
    { name: 'hud-depassement', run: 't4-un-point', frame: firstFrame(run('t4-un-point', 'fr'), (f) => f.board?.over) + HOLD, desc: 'temps accordé dépassé : chrono en ambre, point de pénalité en rouge' },
    { name: 'hud-barre', run: 't4-arrivee-barre', frame: barre.f + HOLD, desc: `barre tombée : toast « ${barre.args[0]} » et mot d’appel` },
    { name: 'hud-appel', run: 't4-sans-faute', frame: fb1.f + HOLD, extra: { frame: fb1.f, calls: [['jumpFeedback', perfect]] }, desc: `mot « ${perfect[0]} » (appel ajouté à l’image du premier mot : aucune exécution de l’oracle n’a d’appel parfait ; texte et genre de cso_feedback.json)` },
    { name: 'hud-cadence', run: 'droit', frame: lastAdjust.f + 9, desc: 'crans de cadence affichés (0,3 s après le dernier réglage au joystick)' },
    { name: 'hud-elimine', run: 't4-deux-refus', frame: elim.f + HOLD, desc: 'deuxième refus : « ÉLIMINÉ », motif, toast du refus' },
  ];
  const poses = [];
  for (const v of STYLE_VIEWS) {
    await setView(v);
    for (const s of specs) {
      const name = `${s.name}-${v.width}x${v.height}`;
      const r = run(s.run, 'fr');
      const ps = {
        name, desc: `HUD d’épreuve (tranche T7) : ${s.desc} ; exécution ${s.run} (fr) rejouée dans le HUD jusqu’à l’image ${s.frame} (horloge virtuelle de cso_hud.json) ; décor, heure et caméra de la pose cadrage-040 ; ${v.width} × ${v.height}.`,
        hour: base.hour, eye: base.eye, target: base.target, fovV: base.fovV, viewport: { w: v.width, h: v.height }, horse: { x: base.horse.x, z: base.horse.z, h: base.horse.h }, course: base.course,
        hud: { run: `unreal/core/tests/oracles/cso_runs/${s.run}.fr.json`, frame: s.frame, ...(s.extra ? { extra: s.extra } : {}) },
      };
      const info = await page.evaluate(([p, i]) => window.__hudT7.pose(p, i), [ps, runInputs(r)]);
      await page.waitForTimeout(300);
      ps.sunDir = info.sunDir;
      ps.state = { ...info.last, board: info.board };
      ps.web = `unreal/docs/parite/cso/${name}-web.png`;
      ps.unreal = `unreal/docs/parite/cso/${name}-unreal.png`;
      await page.screenshot({ path: join(ROOT, ps.web) });
      poses.push(ps);
      console.log('pose', name, 'image', s.frame, JSON.stringify(info.board), info.last.to.map((t) => t[0]).join(' | '), info.last.bg[0] ? '' : `[${info.last.bg[1]}]`, info.last.fb[0]);
    }
  }
  posesDoc.poses = posesDoc.poses.filter((p) => !p.name.startsWith('hud-')).concat(poses);
  writeFileSync(posesFile, JSON.stringify(posesDoc, null, 1) + '\n');
  console.log('poses :', posesFile);
}
if (errors.length) console.log('erreurs de page :', errors.slice(0, 5));
for (const p of Object.values(pages)) await p.ctx.close();
await browser.close();
