// Export des données et des cas de référence (oracles) du jeu web vers le portage Unreal (hors runtime).
// Les modules JS du jeu sont la spécification : les valeurs sont lues dans le code tel qu'il est, jamais recopiées à la
// main. Sorties versionnées (champ "schema"), indépendantes de Three.js, unités SI (m, s, m/s, rad) — la conversion en
// centimètres d'Unreal se fait à la lecture (voir unreal/docs/conventions.md).
//  - unreal/StridesGrandTour/Content/Data/*.json : données lues par le jeu Unreal ;
//  - unreal/core/tests/oracles/*.json : entrées et sorties attendues, rejouées par les tests du cœur C++.
// Usage : npx vite-node scripts/unreal/export-data.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JUMP, planJump, railsAhead, takeoffQuality, speedFactor, angleFactor } from '../../src/gameplay/jumpModel.js';
import { CSO_RIDE, steerRate, cadenceDelta, minRadius, maxTurnRate } from '../../src/gameplay/csoRide.js';
import { CSO_DESIGN, traceCourse, csoHeights } from '../../src/gameplay/csoCourse.js';
import { timeFaults, compareResults } from '../../src/gameplay/challenge.js';
import { COURSE_SPEED, COURSE_LENGTH, timeAllowedFor, BELL_DELAY, ordinal, enOrdinal, TAKEOFF_TEXT } from '../../src/gameplay/courses.js';
import { CSO_GATE, CSO_START, CSO_FINISH } from '../../src/gameplay/obstacles.js';
import { dec } from '../../src/core/math.js';
import { t as i18nT, T as i18nTpl, chooseLang } from '../../src/core/i18n.js';
import { CAUSES } from '../../src/gameplay/jumpModel.js';
import { parseAst } from 'rollup/parseAst';
import { HORSE } from '../../src/config.js';
import { POLE } from '../../src/world/sites.js';
import { HORSES } from '../../src/gameplay/data.js';
import { CAM_COMP } from '../../src/entities/camera.js';
import { coursePlanSvg, coursePlanLegend } from '../../src/ui/coursePlan.js';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = join(ROOT, 'unreal/StridesGrandTour/Content/Data');
const ORA = join(ROOT, 'unreal/core/tests/oracles');
mkdirSync(DATA, { recursive: true });
mkdirSync(ORA, { recursive: true });
const write = (dir, name, obj) => writeFileSync(join(dir, name), JSON.stringify(obj, null, 1) + '\n');
const src = (f) => `src/${f}`;

// ---------- Données ----------
write(DATA, 'horse_gaits.json', { schema: 'strides.horse_gaits/1', source: src('config.js'), units: 'm/s', gaits: HORSE.gaits.map((g) => ({ id: g.short, name: g.name, speed: g.speed, max: g.max ?? null })), jumpPeak: HORSE.jumpPeak, jumpDuration: HORSE.jumpDuration, minJumpSpeed: HORSE.minJumpSpeed, stamina: HORSE.stamina, gallopDrain: HORSE.gallopDrain, staminaRegen: HORSE.staminaRegen });
write(DATA, 'horse_profiles.json', { schema: 'strides.horse_profiles/1', source: src('gameplay/data.js'), horses: Object.values(HORSES).map((h) => ({ id: h.id, name: h.name, breed: h.breed, age: h.age, coat: h.coat, blaze: !!h.blaze, socks: h.socks, speed: h.speed, jump: h.jump, stamina: h.stamina, price: h.price ?? 0, value: h.value ?? 0, desc: h.desc })) });
write(DATA, 'jump_model.json', { schema: 'strides.jump_model/1', source: src('gameplay/jumpModel.js'), units: 'm, s', ...JUMP });
write(DATA, 'cso_ride.json', { schema: 'strides.cso_ride/1', source: src('gameplay/csoRide.js'), units: 'm, s, rad', ...CSO_RIDE });
// Cheval de concours (tranche T2) : constantes nommées que obstacles.js ne publie pas (REF, NOSE, OVERRUN, HIND_TRAIL)
// et largeur des obstacles du parcours de CSO, extraites du source tel qu'il est (jamais recopiées) ; le comportement
// qui en dépend est recoupé par les oracles du jeu en cours d'exécution (cso_runs/, cso_target.json).
const OBS_SRC = readFileSync(join(ROOT, 'src/gameplay/obstacles.js'), 'utf8');
const srcConst = (re, what) => {
  const m = OBS_SRC.match(re);
  if (!m) throw new Error(`obstacles.js : ${what} introuvable`);
  return Number(m[1]);
};
write(DATA, 'cso_horse.json', {
  schema: 'strides.cso_horse/1', source: [src('gameplay/obstacles.js'), src('config.js')], units: 'm, s, m/s',
  ref: srcConst(/\bREF = ([\d.]+)/, 'REF'), nose: srcConst(/\bNOSE = ([\d.]+)/, 'NOSE'), overrun: srcConst(/\bOVERRUN = ([\d.]+)/, 'OVERRUN'),
  hindTrail: srcConst(/\bHIND_TRAIL = ([\d.]+)/, 'HIND_TRAIL'),
  csoFenceWidth: srcConst(/CSO_LAYOUT\.forEach\(\(f, i\) => \{\s*this\.add\(\{[^}]*\bw: ([\d.]+)[^}]*course: 'cso'/, 'largeur des obstacles de CSO'),
  jumpDuration: HORSE.jumpDuration, minJumpSpeed: HORSE.minJumpSpeed, jumpPeak: HORSE.jumpPeak,
});
// Caméra de concours (tranche T6) : réglages CAM_COMP de camera.js (FOV vertical, degrés), lus par le jeu
// (UStridesDataSubsystem::CameraParams) et comparés aux valeurs par défaut de StridesCore/CsoCamera.h par les tests.
write(DATA, 'cso_camera.json', { schema: 'strides.cso_camera/1', source: src('entities/camera.js'), units: 'm, s, rad, degrés (fov vertical)', ...CAM_COMP });
// Déroulé d'épreuve (tranche T4) : règles de courseSteps (courses.js) extraites du source (valeurs par défaut écrites dans
// la fonction, jamais recopiées), délai de la cloche, entrée de piste et lignes de départ / d'arrivée du jeu (repère monde,
// pleine précision) ; recoupés par les scénarios t4-* de cso_runs/ (élimination au deuxième refus, +4, 45 s).
const COURSES_SRC = readFileSync(join(ROOT, 'src/gameplay/courses.js'), 'utf8');
const srcMatch = (re, what) => {
  const m = COURSES_SRC.match(re);
  if (!m) throw new Error(`courses.js : ${what} introuvable`);
  return m;
};
const maxRef = srcMatch(/opts\.maxRefusals \?\? \(kind === 'xc' \? (\d+) : (\d+)\)/, 'maxRefusals');
const penM = srcMatch(/const pen = kind === 'xc' \? (\d+) : (\d+);/, 'pen');
const railM = srcMatch(/obstacle\.num === state\.next && dir > 0\) \{\s*state\.faults \+= (\d+);/, 'faute de barre');
const csoRun = {
  bellDelay: BELL_DELAY,
  maxRefusals: Number(maxRef[2]), maxRefusalsXc: Number(maxRef[1]), pen: Number(penM[2]), penXc: Number(penM[1]), rail: Number(railM[1]),
  gate: { ...CSO_GATE, r: Number(srcMatch(/S\.goto\(opts\.gate \?\? CSO_GATE, .*?\{ r: (\d+), mode: 'ride' \}\)/, 'rayon de l’entrée de piste')[1]) },
  start: CSO_START, finish: CSO_FINISH,
  timeAllowed: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national),
};
write(DATA, 'cso_course_pole.json', { schema: 'strides.cso_course/1', source: src('gameplay/csoCourse.js'), frame: 'arena: x east, z south, heading h -> (sin h, cos h)', arena: POLE.arena, stands: POLE.stands, design: CSO_DESIGN, length: COURSE_LENGTH.cso, speeds: COURSE_SPEED, rules: { rail: csoRun.rail, firstRefusal: csoRun.pen, refusalsToEliminate: csoRun.maxRefusals, timeFaultPerSecond: timeFaults(65, 64, 1) }, run: csoRun });

// ---------- Oracles ----------
// Saut : grille d'appels devant un vertical et un oxer, plusieurs vitesses, angles, puissances.
const fence = (kind, spread, h) => ({ x: 0, z: 0, n: { x: 0, z: 1 }, t: { x: 1, z: 0 }, kind, bars: kind === 'o' ? [{ s: -spread / 2, h: h - 0.05 }, { s: spread / 2, h }] : [{ s: 0, h }] });
const jump = [];
for (const [kind, spread, h] of [['v', 0, 1.1], ['o', 1.3, 1.2], ['v', 0, 1.45], ['w', 0, 1.0]])
  for (const d of [0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6])
    for (const v of [4.6, 6.2, 7.5, 9.5])
      for (const ang of [0, 0.35])
        for (const cso of [true, false]) {
          const f = fence(kind, spread, h);
          const fx = Math.sin(ang), fz = Math.cos(ang);
          const px = -fx * d, pz = -fz * d - (kind === 'o' ? spread / 2 : 0);
          const geo = railsAhead(f, px, pz, fx, fz);
          const horse = { v, power: 1.55, clearance: 0.04, cso };
          const p = planJump(horse, geo);
          jump.push({ in: { fence: f, px, pz, fx, fz, horse }, out: { L: p.L, H: p.H, margin: p.margin === Infinity ? null : p.margin, margins: p.margins, zone: p.zone, cause: p.cause ?? null, quality: takeoffQuality(p) } });
        }
write(ORA, 'jump.json', { schema: 'strides.oracle.jump/1', source: src('gameplay/jumpModel.js'), factors: [0, 2, 3.5, 5, 6.5, 8, 9, 10.5, 12, 14].map((v) => ({ v, speed: speedFactor(v) })).concat([1, 0.9, 0.5].map((c) => ({ cosA: c, angle: angleFactor(c) }))), cases: jump });
// Conduite CSO.
const ride = [];
for (const v of [0, 0.5, 1, 3, 4.6, 6.2, 8]) for (const x of [-1, -0.5, -0.05, 0, 0.3, 1]) ride.push({ fn: 'steerRate', in: [x, v], out: steerRate(x, v) });
for (const c of [2, 4.6, 6.2]) for (const [y, x] of [[1, 0], [0.5, 0], [0.3, 0], [-1, 0], [0.8, 0.9], [-0.6, 0.2]]) ride.push({ fn: 'cadenceDelta', in: [y, x, c], out: cadenceDelta(y, x, c) });
for (const v of [0, 0.5, 1, 4.6, 6.2, 9]) ride.push({ fn: 'minRadius', in: [v], out: minRadius(v) }, { fn: 'maxTurnRate', in: [v], out: maxTurnRate(v) });
write(ORA, 'cso_ride.json', { schema: 'strides.oracle.cso_ride/1', source: src('gameplay/csoRide.js'), cases: ride });
// Tracé du parcours et règles de temps. `design` : le tracé complet tel que le JS le déclare (départ, commandes,
// profil de hauteurs), pour vérifier que le jeu, qui le lit dans Content/Data/cso_course_pole.json, trace la même chose.
const tr = traceCourse();
const tf = [];
for (const a of [45, 56, 59, 64]) for (const d of [-5, -1e-10, 0, 1e-12, 1e-10, 1e-8, 0.01, 0.5, 0.99, 1, 1.0000001, 2.2, 7.5, 15]) tf.push([a + d, a, 1]);
for (const [t, a] of [[66.2, 64], [70, 64], [128, 64]]) tf.push([t, a, 2]);
const R = (penalties, time, eliminated) => (eliminated ? { eliminated } : { penalties, time });
const cmp = [
  [R(0, 50), R(4, 40)], [R(4, 40), R(4, 41)], [R(null, null, 'r'), R(12, 80)],
  [R(12, 80), R(null, null, 'r')], [R(null, null, 'r'), R(null, null, 't')], [R(4, 61.37), R(4, 61.37)],
  [R(4, 61.38), R(4, 61.37)], [R(0, 99.99), R(1, 40)], [R(8, 70), R(4, 90)], [R(0, 63.5), R(0, 63.49)],
  [R(3, 66.2), R(3, 66.2)], [R(0, 0), R(0, 0.01)],
];
write(ORA, 'cso_course.json', {
  schema: 'strides.oracle.cso_course/1', source: src('gameplay/csoCourse.js'),
  design: CSO_DESIGN,
  length: tr.length, fences: tr.fences.map((f) => ({ label: f.label, kind: f.kind, spread: f.spread, x: f.x, z: f.z, rot: f.rot, s: f.s })), marks: tr.marks,
  samplePts: tr.pts.filter((_, i) => i % 25 === 0), leadIn: tr.leadIn, heights110: csoHeights(1.1),
  timeAllowed: Object.fromEntries(Object.entries(COURSE_SPEED).map(([k, sp]) => [k, timeAllowedFor(COURSE_LENGTH.cso, sp)])),
  timeFaults: tf.map(([t, a, k]) => ({ t, allowed: a, perSecond: k, out: timeFaults(t, a, k) })),
  compare: cmp.map(([a, b]) => ({ a, b, out: Math.sign(compareResults(a, b)) })),
});
console.log('données :', DATA, '\noracles :', ORA, '\nsauts', jump.length, 'conduite', ride.length, 'obstacles', tr.fences.length);

// ---------- Textes de l'épreuve (tranche T4) ----------
// Clés françaises extraites du code par analyse syntaxique (rollup/parseAst) : appels t('…') à texte littéral et gabarits
// T`…${x}…` (clé : ${…} remplacés par {0}, {1}… dans l'ordre, règle de src/core/i18n.js). Traduction anglaise donnée
// par i18n.js lui-même (chooseLang('en') puis t(clé)) : rien n'est recopié. Fichiers : déroulé de l'épreuve
// (courses.js), étapes de mission (missions.js : « goto », consignes de mode), tableau de chrono (hud.js), causes de
// faute (jumpModel.js).
// Tranche T10 : plan du parcours (ui/coursePlan.js) et activités lancées au poteau (gameplay/activities.js : nom, titre,
// classe, libellé « Chrono » ; catégorie de mission passée à t() par missions.start, relevée ci-dessous).
const TEXT_FILES = ['gameplay/courses.js', 'gameplay/missions.js', 'ui/hud.js', 'gameplay/jumpModel.js', 'ui/coursePlan.js', 'gameplay/activities.js'];
const walk = (node, fn) => {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c === 'object' && walk(c, fn));
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, fn);
  }
};
const keyFiles = new Map(); // clé → fichiers
const ast = {};
for (const f of TEXT_FILES) {
  const code = readFileSync(join(ROOT, 'src', f), 'utf8');
  const tree = parseAst(code);
  ast[f] = { code, tree };
  walk(tree, (n) => {
    let key = null;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 't' && n.arguments[0]?.type === 'Literal' && typeof n.arguments[0].value === 'string') key = n.arguments[0].value;
    else if (n.type === 'TaggedTemplateExpression' && n.tag.type === 'Identifier' && n.tag.name === 'T') key = n.quasi.quasis.map((q, i) => (i ? `{${i - 1}}` : '') + q.value.cooked).join('');
    // Clé dynamique : catégorie de l'offre d'une activité (activities.js : category: '…' littéral), traduite par
    // missions.start (t(offer.category), missions.js:475).
    else if (f === 'gameplay/activities.js' && n.type === 'Property' && n.key.type === 'Identifier' && n.key.name === 'category' && n.value.type === 'Literal' && typeof n.value.value === 'string') key = n.value.value;
    if (key === null || key === '') return;
    if (!keyFiles.has(key)) keyFiles.set(key, new Set());
    keyFiles.get(key).add(f);
  });
}
// Fonctions privées de courses.js (non exportées) : source extraite telle quelle et évaluée avec LANG, enOrdinal et T.
const privFn = (name) => {
  const { code, tree } = ast['gameplay/courses.js'];
  let init = null;
  walk(tree, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name && n.init) init = n.init;
  });
  if (!init) throw new Error(`courses.js : ${name} introuvable`);
  const body = code.slice(init.start, init.end);
  return (lang) => new Function('LANG', 'enOrdinal', 'T', `return (${body});`)(lang, enOrdinal, i18nTpl);
};
const nthOf = privFn('nth'), ptsOf = privFn('ptsText');
// Cas de format : dec (Number.prototype.toFixed, virgule en français), ordinaux, pluriels, gabarits.
const decVals = [0, -0, 0.5, 1.5, 2.5, -2.5, 0.005, 0.015, 0.025, 0.045, 0.125, 0.375, 1.005, 1.255, 2.675, 10.235, 63.995, 64.004999, 64.005, 127.995, 128.005,
  1e-7, -0.004, -1.5, 0.1 + 0.2, 1 / 3, 2 / 3, 45, 99.999, 123.456, 1234.5678, 59.99999999, 0.0049999999];
let acc = 0;
for (let i = 1; i <= 4000; i++) {
  acc += 1 / 30; // chrono : somme des pas de 1/30 s (courses.js : state.t += dt)
  if (i % 3 === 0) decVals.push(acc);
}
const ordN = [...Array(131).keys(), 200, 1000, 1001, 1011, 1012, 1013, 1021, 1111];
const keys = [...keyFiles.keys()].sort();
const textCases = (lang) => ({
  dec: decVals.flatMap((n) => [0, 1, 2, 3].map((k) => ({ n, k, out: dec(n, k) }))),
  ordinal: ordN.map((n) => ({ n, out: ordinal(n) })),
  enOrdinal: ordN.map((n) => ({ n, out: enOrdinal(n) })),
  nth: ordN.map((n) => ({ n, out: nthOf(lang)(n) })),
  ptsText: [...Array(13).keys()].map((n) => ({ n, out: ptsOf(lang)(n) })),
  // Tranche T10 : String(n) (gabarits ${x} du plan) sur les mêmes valeurs et quelques cas limites ; toUpperCase /
  // toLowerCase des textes de la table dans cette langue (titre du lancement en capitales, difficulté en minuscules).
  str: [...decVals, 1e21, 1e-7, 123456789012345680000, 0.000001, 5e-324, -1e-7, 37.6, -43.5, 1.1 + 0.1, 368, -0].map((n) => ({ n, out: String(n) })),
  upper: keys.map((key) => { const x = i18nT(key); return [x, x.toUpperCase()]; }),
  lower: keys.map((key) => { const x = i18nT(key); return [x, x.toLowerCase()]; }),
  // Gabarit : valeurs d'essai distinctes ; texte fixe : t(clé).
  templates: keys.map((key) => {
    const parts = key.split(/\{\d+\}/);
    if (parts.length === 1) return { key, out: i18nT(key) };
    const vals = parts.slice(1).map((_, i) => (i % 2 ? 40 + i : `«v${i}»`));
    const strs = Object.assign([...parts], { raw: [...parts] });
    return { key, vals, out: i18nTpl(strs, ...vals) };
  }),
});
const fr = textCases('fr');
chooseLang('en'); // langue vivante de i18n.js (dec, ordinal, t et T la lisent à l'appel)
const en = textCases('en');
const strings = {};
const missing = [];
for (const key of keys) {
  strings[key] = i18nT(key);
  if (strings[key] === key && !/^[\s\d{}·:+./–-]*$/.test(key)) missing.push(key);
}
chooseLang('fr');
write(DATA, 'strings_cso.json', {
  schema: 'strides.strings_cso/1', source: TEXT_FILES.map(src).concat([src('core/i18n.js'), 'src/i18n/en/*.js']),
  doc: 'clé = texte français exact du code (gabarit : {0}, {1}… dans l’ordre des ${…}) ; valeur = texte anglais (i18n.js, t(clé)) ; une clé sans traduction vaut elle-même (missing)',
  strings, missing, files: Object.fromEntries(keys.map((k) => [k, [...keyFiles.get(k)].sort()])),
  causes: CAUSES,
});
write(ORA, 'cso_text.json', { schema: 'strides.oracle.cso_text/1', source: ['src/core/math.js', 'src/core/i18n.js', 'src/gameplay/courses.js'], fr, en });

// Mot d'appel après un passage (tranche T7) : fonction privée `feedback` des écouteurs d'obstacle de courses.js
// (:203-211), source extraite telle quelle et évaluée sur une grille ; takeoffQuality remplacé par la qualité donnée
// (takeoffQuality lui-même est rejoué par jump.json), TAKEOFF_TEXT du jeu (clés françaises).
const feedbackSrc = (() => {
  const { code, tree } = ast['gameplay/courses.js'];
  let init = null;
  walk(tree, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'feedback' && n.init) init = n.init;
  });
  if (!init) throw new Error('courses.js : feedback introuvable');
  return code.slice(init.start, init.end);
})();
const fbQualities = [null, 'perfect', 'good', 'bitFar', 'bitNear', 'far', 'near', 'angle', 'slow', 'tooClose'];
const fbCauses = [null, '', ...Object.keys(CAUSES), 'unknown'];
const fbCases = [];
for (const cso of [true, false])
  for (const aid of ['full', 'button', 'off'])
    for (const last of ['none', 'other', 'this'])
      for (const q of last === 'none' ? [null] : fbQualities)
        for (const clear of [true, false])
          for (const cause of clear ? [null] : fbCauses) {
            const o = { num: 3 }, other = { num: 4 };
            const calls = [];
            const horse = () => ({ _lastJump: last === 'none' ? null : { o: last === 'this' ? o : other, plan: { q } } });
            const game = { hud: { jumpFeedback: (...a) => calls.push(a) } };
            const fb = new Function('cso', 'aid', 'horse', 'takeoffQuality', 'TAKEOFF_TEXT', 'game', `return (${feedbackSrc});`)(cso, () => aid, horse, (plan) => plan?.q ?? null, TAKEOFF_TEXT, game);
            fb(o, clear, cause ?? undefined);
            fbCases.push({ cso, aid, last, q, clear, cause, out: calls.length ? calls[0] : null });
          }
write(ORA, 'cso_feedback.json', {
  schema: 'strides.oracle.cso_feedback/1', source: ['src/gameplay/courses.js'],
  doc: 'feedback(o, clear, cause) des écouteurs d’obstacle de courses.js : cso = épreuve de CSO ; aid = réglage jumpAid ; last = dernier saut du cheval (none : aucun, other : autre obstacle, this : cet obstacle) ; q = takeoffQuality de son plan ; clear = sans-faute ; cause = cause de la faute (null : absente) ; out = arguments de hud.jumpFeedback (texte français, genre) ou null si aucun appel',
  cases: fbCases,
});
console.log('mot d’appel :', fbCases.length, 'cas,', fbCases.filter((c) => c.out).length, 'avec un mot');
console.log('textes :', keys.length, 'clés,', missing.length, 'sans traduction ;', fr.dec.length, 'formats dec par langue');

// ---------- Plan du parcours (tranche T10) ----------
// coursePlanSvg et coursePlanLegend de src/ui/coursePlan.js appelés tels quels (tracé du Pôle CSO_TRACE) : hauteurs
// csoHeights(base) des épreuves du jeu (1,05 / 1,15 / 1,25 : concours Am 2, Am 1, Pro 2 ; 1,10 : Parcours du Pôle ;
// 1,40 / 1,55 : CSI et Grand Prix), sans hauteurs, et numéros surlignés (next, branche que courses.js ne passe pas),
// en français puis en anglais (dec et t lisent la langue vivante). Rejoué caractère pour caractère par testCoursePlan.
const PLAN_BASES = [1.05, 1.1, 1.15, 1.25, 1.4, 1.55];
const planCases = () => [
  ...PLAN_BASES.map((base) => ({ base, heights: csoHeights(base), next: 0 })),
  { base: null, heights: null, next: 0 },
  ...[1, 2, 6, 10].map((next) => ({ base: 1.1, heights: csoHeights(1.1), next })),
].map((c) => ({ ...c, svg: coursePlanSvg({ heights: c.heights, next: c.next }) }));
const planFr = { cases: planCases(), legend: coursePlanLegend() };
chooseLang('en');
const planEn = { cases: planCases(), legend: coursePlanLegend() };
chooseLang('fr');
write(ORA, 'cso_plan.json', {
  schema: 'strides.oracle.cso_plan/1', source: ['src/ui/coursePlan.js', 'src/gameplay/csoCourse.js', 'src/world/sites.js'],
  doc: 'coursePlanSvg({ heights, next }) (tracé CSO_TRACE, venue du Pôle) et coursePlanLegend() : base = hauteur donnée à csoHeights (null : pas de hauteurs) ; next = numéro surligné (0 : aucun) ; svg = chaîne exacte',
  arena: POLE.arena, stands: POLE.stands, fr: planFr, en: planEn,
});
console.log('plan du parcours :', planFr.cases.length, 'cas par langue');
