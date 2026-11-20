// Entrée dans l'épreuve de CSO (tranche T10) : données de l'activité « Parcours du Pôle », carte de présentation, carte
// du plan et contrôle de capacité, relevés dans le jeu web EN COURS D'EXÉCUTION. Le jeu web est la spécification ; ce
// script ne modifie rien dans src/ ni tests/ : il appelle les fonctions du jeu dans la page et lit le DOM.
//
// Sorties :
//  - unreal/StridesGrandTour/Content/Data/cso_activity.json : activité cso_train relevée dans le jeu (g.activities.defs :
//    identifiant, nom, nature, description, départ, poteau ; g.interact, action « act:cso_train » : libellé, icône, rayon,
//    priorité, modes, centre ; offre de mission de g.missions.active après le lancement : verticale, catégorie, titre) ;
//    lus dans le source par analyse syntaxique (rollup/parseAst) : titre et classe de l'épreuve (activities.js, appel
//    courseSteps de cso_train), libellé de la verticale EVENEMENTS (missions.js), durée du grand message du lancement
//    (missions.js), lieu par défaut de la présentation (courses.js), titre du jeu (config.js).
//  - unreal/core/tests/oracles/cso_entry.json : courseSteps (courses.js) appelé dans la page avec le vrai jeu et les
//    vraies étapes de mission (makeSteps de missions.js) pour une grille de configurations (hauteurs csoHeights(base)
//    autour des seuils de difficulté, hauteurs à égalité d'effectif, opts.height, sans hauteurs, compositions sans double,
//    à un double et à deux doubles, classe, barème, lieu, jury, règles, titre, temps accordé, longueur, cheval absent ou
//    renommé) : étape de capacité (présente ou non, dialogue de l'entraîneur affiché ou non et ses lignes) ; carte de
//    présentation (arguments de screens.card, puis DOM : kicker, titre, grille clé / valeur, jury, règles, boutons) ;
//    « Voir le plan » (arguments et DOM de la carte du plan) ; « Retour » (présentation rouverte, identique) ; « Entrer en
//    piste » (étape validée). Grille de capacité : hauteurs × puissance du cheval (jumpPower) × bonus de franchissement
//    (mods.clearance), parcours de cross (branche sans le modèle de saut), cheval absent. Français et anglais.
//  - avec --screens : unreal/StridesGrandTour/Content/Data/cso_screens_style.json : styles calculés et boîtes (px CSS)
//    des cartes de présentation et du plan et du dialogue de l'entraîneur, ouverts comme dans la recette
//    (tests/e2e/cso-shots.mjs : activité lancée au poteau, cheval Comète), 844 × 390 et 667 × 308 ; animations et
//    transitions coupées (état d'arrivée).
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5173 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-entry.mjs [--screens]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rollup/parseAst';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const ORA = join(ROOT, 'unreal/core/tests/oracles');
const DATA = join(ROOT, 'unreal/StridesGrandTour/Content/Data');
const SCREENS = process.argv.includes('--screens');
const VIEWS = [{ width: 844, height: 390 }, { width: 667, height: 308 }];
const AUTOPILOT = readFileSync(join(ROOT, 'tests/e2e/autopilot.js'), 'utf8');

// ---------- Lecture du source (analyse syntaxique, rien n'est recopié) ----------
const walk = (node, fn) => {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c === 'object' && walk(c, fn));
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, fn);
  }
};
const srcOf = (f) => readFileSync(join(ROOT, 'src', f), 'utf8');
const tKey = (n) => (n?.type === 'CallExpression' && n.callee.name === 't' && n.arguments[0]?.type === 'Literal' ? n.arguments[0].value : null);
const prop = (obj, name) => obj.properties.find((p) => p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === name)?.value;
function readSource() {
  // activities.js : objet de l'activité cso_train, appel courseSteps de son build (title, className).
  let train = null;
  walk(parseAst(srcOf('gameplay/activities.js')), (n) => {
    if (n.type === 'ObjectExpression' && prop(n, 'id')?.value === 'cso_train') train = n;
  });
  if (!train) throw new Error('activities.js : activité cso_train introuvable');
  let opts = null;
  walk(prop(train, 'build'), (n) => {
    if (n.type === 'CallExpression' && n.callee.name === 'courseSteps') opts = n.arguments[3];
  });
  if (!opts) throw new Error('activities.js : courseSteps de cso_train introuvable');
  const title = tKey(prop(opts, 'title')), className = tKey(prop(opts, 'className'));
  if (!title || !className) throw new Error('activities.js : titre ou classe de cso_train introuvable');
  // Tranche T11 : bilan (opts.result : classe, graine, titre, libellé du bouton principal ; textes = clés de t()) et
  // enregistrement du meilleur temps (penalties, noRecord de l'activité). Littéraux et appels t('…') seulement.
  const lit = (n, what) => {
    if (n?.type === 'Literal') return n.value;
    if (tKey(n)) return tKey(n);
    if (n?.type === 'ArrayExpression') return n.elements.map((e) => lit(e, what));
    if (n?.type === 'ObjectExpression') return Object.fromEntries(n.properties.map((p) => [p.key.name, lit(p.value, `${what}.${p.key.name}`)]));
    if (n?.type === 'UnaryExpression' && n.operator === '!' && n.argument.type === 'Literal') return !n.argument.value;
    throw new Error(`activities.js : ${what} n'est pas un littéral`);
  };
  const result = lit(prop(opts, 'result'), 'result');
  if (!result?.cls?.id || !Array.isArray(result.cls.prizes) || typeof result.seed !== 'number' || !result.title || !result.continueLabel) throw new Error('activities.js : opts.result de cso_train incomplet');
  const record = { penalties: prop(train, 'penalties') ? lit(prop(train, 'penalties'), 'penalties') === true : false, noRecord: prop(train, 'noRecord') ? lit(prop(train, 'noRecord'), 'noRecord') === true : false };
  // missions.js : libellé de la verticale ({ EVENEMENTS: t('Événement'), … }[offer.vertical]) et durée du grand message.
  const ms = srcOf('gameplay/missions.js');
  const labels = {};
  walk(parseAst(ms), (n) => {
    if (n.type === 'ObjectExpression' && n.properties.some((p) => p.key?.name === 'EVENEMENTS'))
      for (const p of n.properties) if (tKey(p.value)) labels[p.key.name] = tKey(p.value);
  });
  const big = /g\.hud\.big\(offer\.title\.toUpperCase\(\), [^;]*?, (\d+)\);/.exec(ms);
  if (!big || !labels.EVENEMENTS) throw new Error('missions.js : grand message du lancement introuvable');
  const place = /opts\.place \|\| '([^']+)'/.exec(srcOf('gameplay/courses.js'));
  const appTitle = /^\s*title: '([^']+)',/m.exec(srcOf('config.js'));
  if (!place || !appTitle) throw new Error('courses.js / config.js : lieu par défaut ou titre du jeu introuvable');
  return { title, className, verticalLabels: labels, launchMs: Number(big[1]), place: place[1], appTitle: appTitle[1], result, record };
}
const SRC = readSource();

// ---------- Grille ----------
// Configurations de la présentation (opts de courseSteps ; clés françaises, passées par t() dans la page) ; horse :
// cheval du joueur (réel par défaut), null : aucun, ou { name } (même puissance que le cheval réel).
const PRES = [
  { id: 'cso_train', base: 1.1, title: SRC.title, className: SRC.className },
  ...[1.05, 1.07, 1.08, 1.15, 1.17, 1.18, 1.25, 1.34, 1.35, 1.4, 1.55].map((base) => ({ id: `base-${base}`, base, title: SRC.title, className: SRC.className })),
  { id: 'egalite', heights: [1.3, 1.2, 1.2, 1.3, 1.25, 1.25, 1.4, 1.4, 1.1, 1.0], title: SRC.title },
  { id: 'hauteur-donnee', base: 1.1, height: 1.18, title: SRC.title, className: SRC.className },
  { id: 'sans-hauteurs', heights: null, title: SRC.title, className: SRC.className },
  { id: 'concours', base: 1.25, table: 'barème A en deux phases', place: 'Saint-Lô', intro: ['Concurrent n° 52, Test et Comète.', 'Barème A au chrono, temps accordé 1:04.'], rulesText: 'Règles du concours.', ta: 59 },
  { id: 'un-double', course: 'parite:un-double', base: 1.1, title: SRC.title, className: SRC.className },
  { id: 'sans-double', course: 'parite:sans-double', base: 1.1, title: SRC.title, className: SRC.className },
  { id: 'longueur', base: 1.1, ta: 56, length: 412.5, title: SRC.title, className: SRC.className },
  { id: 'sans-cheval', base: 1.1, title: SRC.title, className: SRC.className, horse: null },
  { id: 'autre-cheval', base: 1.1, title: SRC.title, className: SRC.className, horse: { name: 'Éclair des Prés' } },
];
const SUBSETS = { 'parite:sans-double': ['1', '2', '3'], 'parite:un-double': ['1', '2', '3', '4A', '4B', '5'] };
// Contrôle de capacité : puissance du cheval × bonus × hauteurs ; cross (kind xc) ; cheval absent.
const CAP = [];
for (const base of [1.05, 1.1, 1.25, 1.4, 1.55])
  for (const pw of [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.35, 1.45, 1.6])
    for (const cl of [0, 0.04, 0.1]) CAP.push({ base, horse: { name: 'Comète', pw, cl } });
for (const pw of [0.9, 1.0, 1.08, 1.1, 1.2]) CAP.push({ base: 1.25, kind: 'xc', horse: { name: 'Comète', pw, cl: 0 } });
CAP.push({ base: 1.55, horse: null });
// Seuils : puissance où le dialogue bascule, cherchée dans la page (dichotomie), pour chaque hauteur et bonus, et pour
// les compositions réduites.
const THRESH = [];
for (const base of [1.05, 1.1, 1.15, 1.25, 1.4, 1.55]) for (const cl of [0, 0.04, 0.1]) THRESH.push({ base, cl });
for (const course of ['parite:un-double', 'parite:sans-double']) THRESH.push({ base: 1.1, cl: 0, course });
// Action du poteau : distances au départ autour du rayon (6 m), deux directions, trois modes, mission active ou non.
const INTERACT = [];
for (const d of [0, 2, 5.99, 6, 6.01, 7.5, 20])
  for (const deg of [0, 131])
    for (const mode of ['foot', 'ride', 'drive'])
      for (const mission of [false, true]) {
        const r = (deg * Math.PI) / 180;
        INTERACT.push({ dx: d * Math.sin(r), dz: d * Math.cos(r), mode, mission });
      }
CAP.push({ base: 1.1, course: 'parite:un-double', horse: { name: 'Comète', pw: 0.95, cl: 0 } });

// ---------- Page ----------
function PAGE() {
  const g = window.__game, A = window.__auto;
  A.stopLoop();
  const st = document.createElement('style');
  st.textContent = '.overlay, .overlay *, .dialog, .dialog * { animation: none !important; transition: none !important; }';
  document.head.appendChild(st);
  const E = (window.__entry = {});
  let M = null;
  E.load = async () => {
    M = {
      C: await import('/src/gameplay/courses.js'), S: await import('/src/gameplay/missions.js'), K: await import('/src/gameplay/csoCourse.js'),
      O: await import('/src/gameplay/obstacles.js'), I: await import('/src/core/i18n.js'),
    };
    return M.I.LANG;
  };
  const overlay = () => [...document.querySelectorAll('.overlay')].pop() || null;
  const reset = () => {
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    A.closeCards();
    for (const o of document.querySelectorAll('.overlay')) o.remove();
  };
  // Carte ouverte : arguments de screens.card (enregistrés) et DOM.
  const cardDom = (ov) => {
    const q = (s) => ov.querySelector(s);
    const ks = [...ov.querySelectorAll('.cso-pres .k')], vs = [...ov.querySelectorAll('.cso-pres .v')];
    return {
      kicker: q('.kicker')?.textContent ?? null, title: q('h2')?.textContent ?? null,
      rows: ks.map((k, i) => [k.textContent, vs[i]?.textContent ?? null]),
      jury: q('.cso-jury')?.textContent ?? null, rules: q('.cso-rules')?.textContent ?? null,
      legend: q('.plan-legend')?.textContent ?? null, svg: !!q('svg.course-plan'),
      buttons: [...ov.querySelectorAll('.card-actions button')].map((b) => [b.dataset.id, b.textContent, b.className]),
    };
  };
  E.activity = () => {
    reset();
    const a = g.activities.defs.find((x) => x.id === 'cso_train');
    const it = g.interact.list.get('act:cso_train');
    A.mount();
    g.player.horse.setPosition(M.O.CSO_GATE.x, M.O.CSO_GATE.z + 4, Math.PI);
    g.activities.start(a);
    const off = g.missions.active?.offer;
    const out = {
      activity: { id: a.id, name: a.name, kind: a.kind, desc: a.desc, start: a.start, marker: a.marker ?? null, vertical: off.vertical, category: off.category, offerTitle: off.title },
      interact: { label: it.label, icon: it.icon, r: it.r, priority: it.priority, modes: it.modes, x: it.x, z: it.z },
    };
    reset();
    return out;
  };
  // Une configuration : étapes de courseSteps, capacité, puis (si present) carte de présentation et plan.
  E.run = (cf, present) => {
    const O = g.obstacles;
    const ofCourse = O.ofCourse;
    const realPlayer = g.player, realCard = g.screens.card, realDialog = g.hud.dialog;
    const cards = [], dialogs = [];
    const out = { id: cf.id ?? null };
    reset();
    try {
      O.ofCourse = (id) => (cf.subsets[id] ? ofCourse.call(O, 'cso').filter((o) => cf.subsets[id].includes(o.label)) : ofCourse.call(O, id));
      g.screens.card = function (o) {
        cards.push({ kicker: o.kicker ?? null, title: o.title ?? null, html: o.html ?? null, buttons: (o.buttons || []).map((b) => [b.id ?? null, b.label, !!b.primary]) });
        return realCard.call(this, o);
      };
      // Dialogue relevé sans être affiché ; sa fermeture (onDone) est rendue après le relevé du drapeau de l'étape.
      let closeDialog = null;
      g.hud.dialog = (lines, done) => {
        dialogs.push(lines.map((l) => [l.who, l.initials ?? null, l.text]));
        closeDialog = done;
      };
      const real = realPlayer.horse;
      let horse = real;
      if (cf.horse === null) horse = null;
      else if (cf.horse) horse = { name: cf.horse.name, jumpPower: cf.horse.pw ?? real.jumpPower, mods: { clearance: cf.horse.cl ?? real.mods.clearance } };
      g.player = { horse };
      out.horse = horse ? { name: horse.name, jumpPower: horse.jumpPower, clearance: horse.mods?.clearance ?? 0 } : null;
      const heights = cf.base != null ? M.K.csoHeights(cf.base) : cf.heights ?? null;
      const t = M.I.t;
      const opts = { courseId: cf.course || 'cso', start: M.O.CSO_START, finish: M.O.CSO_FINISH, timeAllowed: cf.ta ?? 64, heights, kind: cf.kind || 'cso', soft: true };
      if (cf.kind === 'xc') opts.start = { x: M.O.CSO_GATE.x, z: M.O.CSO_GATE.z };
      for (const k of ['title', 'className', 'table', 'rulesText']) if (cf[k]) opts[k] = t(cf[k]);
      if (cf.place) opts.place = cf.place;
      if (cf.height != null) opts.height = cf.height;
      if (cf.length != null) opts.length = cf.length;
      if (cf.intro) opts.intro = cf.intro.map((text) => ({ who: 'Jury', text }));
      const run = { data: {}, flags: {} };
      const steps = M.C.courseSteps(g, run, M.S.makeSteps(g), opts);
      out.heights = heights;
      out.labels = O.ofCourse(opts.courseId).map((o) => o.label);
      out.fences = O.ofCourse(opts.courseId).map((o) => [o.kind, o.spread, o.h]);
      // Étape de capacité : custom dont start appelle hopeless (courses.js:499-528).
      const cap = steps.find((s) => s.start && String(s.start).includes('hopeless'));
      out.capStep = !!cap;
      if (cap) {
        const r = { flags: {}, data: run.data };
        cap.start(r);
        out.dialog = dialogs.length ? dialogs[0] : null;
        out.capWarn = !!r.flags.capWarn;
        out.capWait = cap.update(r) !== true;  // l'étape attend la fermeture du dialogue
        closeDialog?.();
        out.capDone = cap.update(r) === true;
      }
      if (present) {
        const pres = steps.find((s) => s.start && String(s.start).includes('showPresentation'));
        const r = { flags: {}, data: run.data };
        pres.start(r);
        const ov1 = overlay();
        out.presentation = { args: cards[cards.length - 1], dom: cardDom(ov1) };
        A.tap(ov1.querySelector('[data-id="plan"]'));
        const ov2 = overlay();
        out.plan = { args: cards[cards.length - 1], dom: cardDom(ov2), closed: !document.body.contains(ov1) };
        A.tap(ov2.querySelector('[data-id="plan-back"]'));
        const ov3 = overlay();
        out.back = { same: JSON.stringify(cards[cards.length - 1]) === JSON.stringify(out.presentation.args) && JSON.stringify(cardDom(ov3)) === JSON.stringify(out.presentation.dom), closed: !document.body.contains(ov2) };
        out.presBefore = !!r.flags.pres;
        A.tap(ov3.querySelector('[data-id="enter"]'));
        out.presAfter = [!!r.flags.pres, pres.update(r) === true, !document.body.contains(ov3)];
      }
    } finally {
      O.ofCourse = ofCourse;
      g.player = realPlayer;
      g.screens.card = realCard;
      g.hud.dialog = realDialog;
      for (const o of document.querySelectorAll('.overlay')) o.remove();
    }
    return out;
  };

  // Seuil de puissance du contrôle de capacité (dichotomie sur la vraie étape) : [lo, hi] avec dialogue à lo, sans
  // dialogue à hi, hi − lo ≤ 2⁻⁵⁰ × 2,7 ; null si le dialogue ne bascule pas entre 0,3 et 3.
  E.threshold = (cf) => {
    const hopeless = (pw) => !!E.run({ ...cf, horse: { name: 'Comète', pw, cl: cf.cl } }, false).dialog;
    let lo = 0.3, hi = 3;
    if (!hopeless(lo) || hopeless(hi)) return null;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2;
      if (hopeless(m)) lo = m;
      else hi = m;
    }
    return [lo, hi];
  };

  // Action proposée près du poteau (interact.update, interact.js:18-47) : point suivi posé autour du départ de
  // l'activité, mode du joueur, mission active ou non ; action retenue (id, libellé). Joueur remplacé le temps du relevé
  // (focusPos, mode ; ni montée ni embarquement en cours) ; les autres actions gardent leur condition et leur position.
  E.interactGrid = (cases) => {
    reset();
    const real = g.player, realActive = g.missions.active;
    const a = g.activities.defs.find((x) => x.id === 'cso_train');
    const out = [];
    try {
      for (const c of cases) {
        g.player = { focusPos: { x: a.start.x + c.dx, z: a.start.z + c.dz }, mode: c.mode, boarding: null, horseMount: null };
        g.missions.active = c.mission ? { offer: {}, steps: [], data: {} } : null;
        const it = g.interact.update();
        out.push({ ...c, fx: g.player.focusPos.x, fz: g.player.focusPos.z, id: it?.id ?? null, label: it?.label ?? null });
      }
    } finally {
      g.player = real;
      g.missions.active = realActive;
      g.interact.update();
    }
    return out;
  };

  // ---- Styles des cartes et du dialogue (--screens) ----
  const PROPS = ['display', 'opacity', 'color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginLeft', 'marginRight', 'marginBottom', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
    'borderBottomWidth', 'borderBottomColor', 'borderLeftWidth', 'borderLeftColor', 'borderRightWidth', 'maxWidth', 'minWidth', 'width', 'height', 'gap', 'rowGap', 'columnGap', 'alignItems', 'textAlign',
    'whiteSpace', 'textShadow', 'boxShadow', 'transform', 'backdropFilter', 'backgroundImage', 'gridTemplateColumns', 'overflowY', 'justifyContent', 'fontStyle', 'maxHeight'];
  const r1 = (v) => Math.round(v * 10) / 10;
  const css = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = { rect: [r.x, r.y, r.width, r.height].map(r1) };
    for (const p of PROPS) o[p] = typeof s[p] === 'string' ? s[p].replace(/(-?\d+\.\d+)px/g, (_, n) => `${r1(Number(n))}px`) : s[p];
    return o;
  };
  const withText = (el) => (el ? { ...css(el), text: el.textContent } : null);
  const cardStyle = (ov) => {
    const q = (s) => ov.querySelector(s);
    const body = q('.card-body');
    const svg = q('svg.course-plan');
    return {
      overlay: css(ov), card: css(q('.card')), body: { ...css(body), scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop },
      kicker: withText(q('.kicker')), title: withText(q('h2')),
      grid: css(q('.cso-pres')), keys: [...ov.querySelectorAll('.cso-pres .k')].map(withText), values: [...ov.querySelectorAll('.cso-pres .v')].map(withText),
      jury: withText(q('.cso-jury')), rules: withText(q('.cso-rules')), legend: withText(q('.plan-legend')),
      svg: svg ? { ...css(svg), viewBox: svg.getAttribute('viewBox'), preserveAspectRatio: svg.getAttribute('preserveAspectRatio') } : null,
      svgText: svg ? css(svg.querySelector('text')) : null,
      actions: { ...css(q('.card-actions')), more: q('.card-actions').classList.contains('more') },
      buttons: [...q('.card-actions').querySelectorAll('button')].map((b) => ({ id: b.dataset.id, cls: b.className, ...withText(b) })),
    };
  };
  // Recette (tests/e2e/cso-shots.mjs) : cheval monté posé 4 m au sud de l'entrée, cap π, Parcours du Pôle lancé, 6 images.
  E.openPresentation = () => {
    reset();
    A.mount();
    g.player.horse.setPosition(M.O.CSO_GATE.x, M.O.CSO_GATE.z + 4, Math.PI);
    g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
    A.tick(6);
    return !!overlay()?.querySelector('[data-id="enter"]');
  };
  E.screenStyle = async () => {
    await document.fonts.ready;
    const ov = overlay();
    const presentation = cardStyle(ov);
    A.tap(ov.querySelector('[data-id="plan"]'));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const plan = cardStyle(overlay());
    A.tap(overlay().querySelector('[data-id="plan-back"]'));
    for (const o of document.querySelectorAll('.overlay')) o.remove();
    return { presentation, plan };
  };
  E.dialogStyle = async (lines) => {
    g.hud.dialog(lines, () => {});
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const d = g.hud.dialogEl;
    const q = (s) => d.querySelector(s);
    const spans = [...d.querySelectorAll('.who > span')];
    const out = { dialog: css(d), who: css(q('.who')), av: withText(q('.av')), name: withText(spans[0]), next: withText(q('.next')), line: withText(q('.line')), hudClasses: g.hud.el.className };
    g.hud.closeDialog();
    return out;
  };
}

// ---------- Exécution ----------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function openGame(lang, view = VIEWS[0]) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await page.goto(`${BASE}/?autostart&quality=high&lang=${lang}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
  await page.addScriptTag({ content: AUTOPILOT });
  await page.addScriptTag({ content: `(${PAGE.toString()})();` });
  const got = await page.evaluate(() => window.__entry.load());
  if (got !== lang) throw new Error(`langue de la page ${got} au lieu de ${lang}`);
  return { ctx, page };
}
const writeIfChanged = (file, text) => {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) console.log('inchangé :', file);
  else { writeFileSync(file, text); console.log('écrit :', file); }
};

const langs = {};
let activity = null;
let weakDialog = null;
for (const lang of ['fr', 'en']) {
  const { ctx, page } = await openGame(lang);
  if (lang === 'fr') activity = await page.evaluate(() => window.__entry.activity());
  const pres = [], cap = [];
  if (lang === 'fr') {
    // Cas aux deux bords du seuil de puissance (dialogue / pas de dialogue), par hauteur, bonus et composition.
    let k = 0;
    for (const t of THRESH) {
      const b = await page.evaluate((c) => window.__entry.threshold(c), { ...t, subsets: SUBSETS });
      if (!b) throw new Error(`seuil de capacité introuvable : ${JSON.stringify(t)}`);
      for (const pw of b) CAP.push({ base: t.base, ...(t.course ? { course: t.course } : {}), horse: { name: 'Comète', pw, cl: t.cl }, seuil: true });
      k++;
    }
    console.log(`seuils de capacité : ${k} (${THRESH.length * 2} cas ajoutés)`);
  }
  const inter = await page.evaluate((c) => window.__entry.interactGrid(c), INTERACT);
  for (const cf of PRES) pres.push(await page.evaluate(([c, p]) => window.__entry.run(c, p), [{ ...cf, subsets: SUBSETS }, true]));
  for (const cf of CAP) cap.push(await page.evaluate(([c, p]) => window.__entry.run(c, p), [{ ...cf, subsets: SUBSETS }, false]));
  for (const p of pres) {
    if (!p.back.same || !p.back.closed || !p.plan.closed || p.presBefore || p.presAfter.some((x) => !x)) throw new Error(`${lang} ${p.id} : boutons de la carte inattendus ${JSON.stringify({ back: p.back, plan: p.plan.closed, pres: [p.presBefore, p.presAfter] })}`);
    delete p.back;
  }
  const shown = cap.filter((c) => c.dialog).length;
  console.log(`${lang} : ${pres.length} présentations, ${cap.length} contrôles de capacité (${shown} dialogues) ; ${pres[0].presentation.dom.rows.map((r) => r.join(' = ')).join(' | ')}`);
  if (lang === 'fr') weakDialog = cap.find((c) => c.dialog && c.horse?.name === 'Comète')?.dialog;
  langs[lang] = { presentation: pres, capacity: cap, interact: inter };
  console.log(`${lang} : action du poteau proposée dans ${inter.filter((x) => x.id === 'act:cso_train').length} cas sur ${inter.length} (${[...new Set(inter.map((x) => x.id))].join(', ')})`);
  await ctx.close();
}
if (!activity.activity.marker) throw new Error('cso_train : poteau (marker) absent');
if (activity.activity.offerTitle !== activity.activity.name) throw new Error('offre : titre différent du nom de l’activité');
const act = {
  schema: 'strides.cso_activity/1', generator: 'scripts/unreal/export-cso-entry.mjs',
  source: ['src/gameplay/activities.js', 'src/gameplay/interact.js', 'src/gameplay/missions.js', 'src/gameplay/courses.js', 'src/config.js'],
  doc: 'activité « Parcours du Pôle » (cso_train) relevée dans le jeu web en français (textes = clés de t()) : activity = g.activities.defs (id, name, kind, desc, start, marker) et offre de mission après Activities.start (vertical, category) ; title / className = opts de courseSteps (activities.js, analyse syntaxique) ; verticalLabel = libellé de la verticale (missions.js) ; interact = action « act:cso_train » de g.interact (label, icon, r, priority, modes, x, z) ; launch.ms = durée du grand message de missions.start ; presentation = titre du jeu (CONFIG.title) et lieu par défaut (courses.js) du kicker ; result = opts.result de courseSteps (tranche T11, bilan : cls = id, name, prizes ; seed ; title ; continueLabel ; textes = clés de t()) ; record = penalties et noRecord de l’activité (étape d’enregistrement du meilleur temps, activities.js)',
  activity: { ...activity.activity, title: SRC.title, className: SRC.className, verticalLabel: SRC.verticalLabels[activity.activity.vertical] },
  interact: activity.interact,
  launch: { ms: SRC.launchMs },
  presentation: { appTitle: SRC.appTitle, place: SRC.place },
  // Tranche T11 : opts.result de courseSteps (bilan) et étape d'enregistrement du meilleur temps (activities.js).
  result: SRC.result,
  record: SRC.record,
};
delete act.activity.offerTitle;
writeIfChanged(join(DATA, 'cso_activity.json'), JSON.stringify(act, null, 1) + '\n');
const ent = {
  schema: 'strides.oracle.cso_entry/1', generator: 'scripts/unreal/export-cso-entry.mjs',
  source: ['src/gameplay/courses.js', 'src/gameplay/missions.js', 'src/ui/screens.js', 'src/ui/coursePlan.js', 'src/gameplay/jumpModel.js'],
  doc: 'courseSteps(game, run, makeSteps(game), opts) appelé dans la page du jeu web : opts = { courseId (parite:… = sous-ensemble des obstacles du parcours cso, subsets), start, finish, timeAllowed (ta, défaut 64), heights (csoHeights(base) ou heights), kind (défaut cso), soft, title / className / table / rulesText (clés passées par t()), place, height, length, intro (lignes du jury) } ; horse = cheval lu par l’étape (null : aucun ; jumpPower, mods.clearance) ; labels / fences = obstacles du parcours (libellé ; nature, spread, h) ; capStep = étape de capacité présente ; dialog = lignes [qui, initiales, texte] de hud.dialog (null : aucun) ; capWarn = drapeau de l’étape après start ; capWait = update() ne valide pas l’étape avant la fermeture du dialogue ; capDone = update() la valide après (onDone appelé) ; presentation / plan = arguments de screens.card (kicker, title, html, boutons [id, libellé, primaire]) et DOM de la carte (kicker, titre, grille [clé, valeur], jury, règles, légende, svg présent, boutons [data-id, texte, classe]) ; « Retour » rouvre une présentation identique et « Entrer en piste » valide l’étape (contrôlés par l’export)',
  subsets: SUBSETS, configs: { presentation: PRES, capacity: CAP }, interactDoc: 'interact = action retenue par interact.update (id, libellé) pour le point suivi (fx, fz) au départ de l’activité + (dx, dz), mode du joueur, mission active (g.missions.active non nul) ou non', fr: langs.fr, en: langs.en,
};
writeIfChanged(join(ORA, 'cso_entry.json'), JSON.stringify(ent, null, 1) + '\n');

if (SCREENS) {
  const doc = {
    schema: 'strides.cso_screens_style/1', generator: 'scripts/unreal/export-cso-entry.mjs --screens', source: ['src/ui/screens.js', 'src/gameplay/courses.js', 'src/ui/coursePlan.js', 'src/ui/hud.js', 'src/styles.css'],
    doc: 'cartes de l’entrée dans l’épreuve ouvertes comme dans la recette (tests/e2e/cso-shots.mjs : activité cso_train lancée au poteau, 6 images, cheval Comète) : par viewport, presentation et plan = styles calculés (getComputedStyle) et boîtes (rect = [x, y, largeur, hauteur], px CSS du viewport) du voile (overlay), de la carte, du corps défilable (scrollHeight), du kicker, du titre, de la grille (.cso-pres, clés .k, valeurs .v), du jury, des règles, de la légende, du SVG du plan (viewBox, un texte du plan), de la barre d’actions (classe more) et des boutons ; dialog = dialogue de l’entraîneur (hud.dialog, texte du contrôle de capacité d’un cheval trop faible) : boîte, ligne du nom, pastille des initiales, nom, « Toucher pour fermer », texte ; animations et transitions coupées',
    views: [],
  };
  const { ctx, page } = await openGame('fr');
  for (const v of VIEWS) {
    await page.setViewportSize(v);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (!(await page.evaluate(() => window.__entry.openPresentation()))) throw new Error('présentation non ouverte');
    const cards = await page.evaluate(() => window.__entry.screenStyle());
    const dialog = await page.evaluate((l) => window.__entry.dialogStyle(l), weakDialog.map(([who, initials, text]) => ({ who, initials, text })));
    doc.views.push({ viewport: [v.width, v.height], ...cards, dialog });
    console.log(`styles ${v.width}x${v.height} : carte ${JSON.stringify(cards.presentation.card.rect)}, plan ${JSON.stringify(cards.plan.svg.rect)}, dialogue ${JSON.stringify(dialog.dialog.rect)}`);
  }
  await ctx.close();
  writeIfChanged(join(DATA, 'cso_screens_style.json'), JSON.stringify(doc, null, 1) + '\n');
}
if (errors.length) console.log('erreurs de page :', errors.slice(0, 5));
await browser.close();
