// Essai de monte, voie A, étape M3 : niveau B (plan-essai.md §5 et étape 12) : la cavalière Unreal posée par la règle SUR LE
// CHEVAL UNREAL (tout ce que la règle lit vient du cheval Unreal), jugée sur les seuils absolus des règles et contre les
// références du web, grandeur par grandeur, avec le code de métriques du web (rider-rules-metrics.mjs frameMetrics et
// jumpPhases) : les grandeurs ne peuvent donc pas diverger entre le web et Unreal.
//
// Références, image par image (même indice d'image) :
//  - O1 : la règle du web sur le cheval du web, cavalier classique (référence nommée par le plan) ;
//  - O2 rider_f : la même règle sur le cheval du web, avec les proportions de la cavalière Unreal : l'écart Unreal − O2 isole
//    l'effet du cheval Unreal (taille : −3,7 % avant l'étape S3, phase, profils, pas d'inclinaison ni de corps remonté au saut).
// Seules les grandeurs qui ne dépendent pas de l'échelle du cheval sont comparées aux références (angles, phases) ; les
// autres sont jugées sur les seuils absolus de la règle.
//
// Entrée : l'export du test moteur Strides.Parite.RiderOnHorse (dossier unreal-niveau-b : index.json et un fichier par
// scénario ; articulations dans S, entrées de la règle avec les réglages et profils du cheval Unreal, état et cibles de la
// règle, repère du cheval Unreal dans hz). Paramètres de la règle (levées postLift, twoLift, jumpLift) relus dans
// Content/Data/rider_rules.json.
//
// Contrôle (--controle=<dossier unreal-niveau-b-web>, export du même test) : le même rejeu, cheval Unreal posé COMME LE WEB ;
// son écart à O2 mesure ce que le rejeu lui-même ajoute (phase tenue au saut, clips rééchantillonnés), et l'écart O2 − O1 ce
// que changent les proportions de la cavalière : les deux colonnes séparent l'effet du cheval du jeu des autres causes.
//
// Usage : node scripts/unreal/rider-rules-niveau-b.mjs --unreal=<dossier unreal-niveau-b> [--controle=<dossier>] [--out=unreal/docs/parite/monte/niveau-b]
//   écrit <out>.json et <out>.md ; code 0 (le verdict par seuil est écrit dans la page) ; --strict : code 1 si un seuil du
//   niveau B n'est pas tenu.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameMetrics, jumpPhases } from './rider-rules-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORA = join(ROOT, 'unreal/core/tests/oracles/monte');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const UE = arg('unreal', '');
const OUT = arg('out', join(ROOT, 'unreal/docs/parite/monte/niveau-b'));
const STRICT = process.argv.includes('--strict');
const CTL = arg('controle', '');
if (!UE || !existsSync(join(UE, 'index.json'))) throw new Error(`export Unreal absent : --unreal=${UE}`);
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const RIDE = load(join(ROOT, 'unreal/StridesGrandTour/Content/Data/rider_rules.json')).RIDE;
for (const k of ['postLift', 'twoLift', 'jumpLift']) if (typeof RIDE[k] !== 'number') throw new Error(`rider_rules.json : RIDE.${k} absent`);

function rigFit(fit, k) {
  if (!fit || k === 1) return fit;
  const o = {};
  for (const [key, v] of Object.entries(fit)) {
    if (key === 'kneeOut' || key === 'mountKneeOut') o[key] = v;
    else if (Array.isArray(v)) o[key] = v.map((x) => x * k);
    else o[key] = typeof v === 'number' ? v * k : v;
  }
  return o;
}
const SIDES = ['L', 'R'];
// Assis : levée de la règle (anim.js : lift = post · postLift + two · twoLift + jumpK · jumpLift) sous 2 cm, la moitié de
// la plage de offSeat (lift / 0,04) ; hors de la selle sinon. Obstacle : vol (in.jump ≥ 0) ou accompagnement (jumpK ≥ 0,1).
const lift = (dg) => (dg.post || 0) * RIDE.postLift + (dg.two || 0) * RIDE.twoLift + (dg.jumpK || 0) * RIDE.jumpLift;
const seated = (fr) => lift(fr.dg || {}) < 0.02 && !(fr.in?.jump >= 0);
const atFence = (fr) => fr.in?.jump >= 0 || (fr.dg?.jumpK || 0) >= 0.1;
// Pas : allure de la règle (anim.js : walk = smoothstep(0,4 ; 1,2 ; hs) · (1 − smoothstep(2,8 ; 3,6 ; hs))) au moins 0,5.
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const walking = (fr) => ss(0.4, 1.2, fr.in?.hs || 0) * (1 - ss(2.8, 3.6, fr.in?.hs || 0)) >= 0.5;

const index = load(join(UE, 'index.json'));
// Étape S3 : échelle du maillage du cheval notée par le test (meshScale ; absente avant S3 : échelle du jeu, 0,01).
const TACK = load(join(ROOT, 'unreal/StridesGrandTour/Content/Data/pjl_horse_tack.json'));
const MESH_SCALE = typeof index.meshScale === 'number' ? index.meshScale : 0.01;
const SIZE_GAP = MESH_SCALE / TACK.inner.scale - 1;
const SIZE = Math.abs(SIZE_GAP) < 1e-6 ? 'cheval à la taille du web (échelle du maillage ' + MESH_SCALE.toPrecision(9).replace('.', ',') + ', étape S3)'
  : 'échelle du maillage ' + String(MESH_SCALE).replace('.', ',') + ', ' + (100 * Math.abs(SIZE_GAP)).toFixed(1).replace('.', ',') + (SIZE_GAP < 0 ? ' % plus petit' : ' % plus grand') + ' que le web';
const scen = [];
let ok = true;
for (const e of index.runs) {
  const o1 = load(join(ORA, 'o1', e.id + '.json'));
  const o2 = load(join(ORA, 'o2/rider_f', e.id + '.json'));
  const ue = load(join(UE, e.file));
  const k = o2.setup.fitScale;
  if (ue.frames.length !== o1.frames.length) throw new Error(`${e.id} : ${ue.frames.length} images Unreal, ${o1.frames.length} O1`);
  const setupF = { ...o1.setup, scale: o2.setup.scale, rig: o2.setup.rig, rest: o2.setup.rest, real: null };
  const runO1 = { id: e.id, setup: { ...o1.setup, real: null }, frames: o1.frames.map((f) => ({ ...f, rz: null })) };
  const runO2 = { id: e.id, setup: setupF, frames: o1.frames.map((f, i) => ({ ...f, cq: o2.frames[i].cq, tg: o2.frames[i].tg, rz: null, pe: null, cl: o2.frames[i].cl, dg: o2.frames[i].dg, in: { ...f.in, fit: rigFit(f.in.fit, k) } })) };
  const runUE = {
    id: e.id, setup: setupF,
    frames: o1.frames.map((f, i) => {
      const u = ue.frames[i];
      return { f: f.f, mx: f.mx, cq: o2.frames[i].cq, rz: null, pe: u.pe ?? null, cl: u.cl, dg: u.dg, tg: u.tg, hz: u.hz, in: { ...f.in, ...u.in } };
    }),
  };
  const N = o1.frames.length;
  const ctl = CTL ? load(join(CTL, e.file)) : null;
  const runC = ctl ? { id: e.id, setup: setupF, frames: o1.frames.map((f, i) => ({ ...runO2.frames[i], cl: ctl.frames[i].cl })) } : null;
  const mU = [], m1 = [], m2 = [], mC = [];
  for (let i = 0; i < N; i++) {
    mU.push(frameMetrics(runUE, i)), m1.push(frameMetrics(runO1, i)), m2.push(frameMetrics(runO2, i));
    if (runC) mC.push(frameMetrics(runC, i));
  }
  const checks = [];
  // Seuil absolu : max (ou min) sur les images retenues, Unreal, O1 et O2 relevés.
  const absCheck = (id, label, keyFn, sel, cmp, lim, unit) => {
    let worst = null, at = null, n = 0;
    const refs = { o1: null, o2: null };
    for (let i = 0; i < N; i++) {
      if (!sel(runUE.frames[i], i)) continue;
      for (const [arr, tag] of [[mU, 'ue'], [m1, 'o1'], [m2, 'o2']]) {
        const v = keyFn(arr[i]);
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (tag === 'ue') {
          n++;
          if (worst === null || (cmp === 'max' ? v > worst : v < worst)) (worst = v), (at = o1.frames[i].f);
        } else if (refs[tag] === null || (cmp === 'max' ? v > refs[tag] : v < refs[tag])) refs[tag] = v;
      }
    }
    if (worst === null) return;
    const pass = cmp === 'max' ? worst <= lim : worst >= lim;
    checks.push({ id, label, kind: 'seuil', value: worst, at, images: n, limit: lim, cmp, unit, pass, o1: refs.o1, o2: refs.o2 });
  };
  // Écart à une référence : max |Unreal − réf| sur les images retenues.
  const relCheck = (id, label, keyFn, sel, tol, unit, oneSided = false) => {
    const out = { id, label, kind: 'écart', tol, unit, images: 0 };
    for (const [arr, tag] of [[m1, 'o1'], [m2, 'o2']]) {
      let worst = -Infinity, at = null;
      for (let i = 0; i < N; i++) {
        if (!sel(runUE.frames[i], i)) continue;
        const a = keyFn(mU[i]), b = keyFn(arr[i]);
        if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) continue;
        if (tag === 'o1') out.images++;
        const d = oneSided ? a - b : Math.abs(a - b);
        if (d > worst) (worst = d), (at = o1.frames[i].f);
      }
      out[tag] = worst === -Infinity ? null : { max: worst, at, pass: worst <= tol };
    }
    // Décomposition (information) : O2 − O1 (proportions de la cavalière), contrôle − O2 (rejeu, cheval posé comme le web).
    for (const [A, Bv, tag] of [[m2, m1, 'prop'], [mC, m2, 'ctl']]) {
      if (!A.length) continue;
      let worst = -Infinity;
      for (let i = 0; i < N; i++) {
        if (!sel(runUE.frames[i], i)) continue;
        const a = keyFn(A[i]), b = keyFn(Bv[i]);
        if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) continue;
        worst = Math.max(worst, oneSided ? a - b : Math.abs(a - b));
      }
      out[tag] = worst === -Infinity ? null : worst;
    }
    if (out.images) checks.push(out);
  };
  const all = () => true;
  const side = (key) => SIDES.map((s) => (m) => m[key + s]);
  for (const [si, s] of SIDES.entries()) {
    const sel = s === 'L' ? 'gauche' : 'droit';
    absCheck('M1', `plante – point d’étrier visé, |y| assis (${sel})`, (m) => Math.abs(m['M1y' + s]), seated, 'max', 0.02, 'm');
    absCheck('M1', `plante – point d’étrier visé, |z| assis (${sel})`, (m) => Math.abs(m['M1z' + s]), seated, 'max', 0.02, 'm');
    absCheck('M1', `plante – point d’étrier visé, Δy hors de la selle (${sel})`, (m) => m['M1y' + s], (f) => !seated(f), 'max', 0.03, 'm');
    absCheck('M1', `plante – point d’étrier visé, |Δz| hors de la selle (${sel})`, (m) => Math.abs(m['M1z' + s]), (f) => !seated(f), 'max', 0.05, 'm');
    absCheck('M2', `cheville au-delà de sa place naturelle xMax (${sel})`, (m) => m['M2b' + s], all, 'max', 0.01, 'm');
    absCheck('M6', `portée de la jambe ρ assis (${sel})`, (m) => m['M6' + s], seated, 'max', 0.935, '');
    absCheck('M6', `portée de la jambe ρ hors de la selle (${sel})`, (m) => m['M6' + s], (f) => !seated(f), 'max', 0.955, '');
    absCheck('M7', `écart au flanc, minimum (${sel})`, (m) => m['M7min' + s], all, 'min', -0.01, 'm');
    absCheck('M9', `poignet au-dessus de l’encolure (${sel})`, (m) => m['M9' + s], all, 'min', 0.09, 'm');
    absCheck('M10', `coude (${sel})`, (m) => m['coude' + s], all, 'max', 155, '°');
    // Étape S1 : étriers affichés (hz.ir de l'export : UStridesHorseTackMesh, sous l'orteil de la pose de l'image).
    absCheck('M4', `plante – étrier affiché (${sel})`, (m) => m['M4' + s], all, 'max', 0.02, 'm');
    void si;
  }
  // Étape S1 : M8, pénétration de l'axe des os (export : 6 rayons contre le maillage du cheval Unreal, mêmes points que le web),
  // seuil du plan : max(1 cm ; O1 du même scénario + 0,5 cm).
  {
    const o1Max = Math.max(0, ...m1.map((m) => m.M8).filter(Number.isFinite));
    absCheck('M8', `pénétration de l’axe des os (seuil max(1 cm ; O1 + 0,5 cm))`, (m) => m.M8, all, 'max', Math.max(0.01, o1Max + 0.005), 'm');
  }
  relCheck('M11', 'hanche (deux côtés)', (m) => Math.max(...side('hanche').map((g) => Math.abs(g(m)))), all, 6, '°');
  for (const s of SIDES) {
    relCheck('M11', `hanche ${s === 'L' ? 'gauche' : 'droite'}`, (m) => m['hanche' + s], all, 6, '°');
    relCheck('M11', `cheville ${s === 'L' ? 'gauche' : 'droite'}`, (m) => m['cheville' + s], all, 6, '°');
    relCheck('M12', `ouverture du genou ${s === 'L' ? 'gauche' : 'droit'}`, (m) => m['ouvGenou' + s], all, 8, '°');
    relCheck('M15', `talon ${s === 'L' ? 'gauche' : 'droit'}`, (m) => m['talon' + s], all, 4, '°');
    relCheck('M15', `pointe ${s === 'L' ? 'gauche' : 'droite'}`, (m) => m['pointe' + s], all, 4, '°');
  }
  checks.splice(checks.findIndex((c) => c.label === 'hanche (deux côtés)'), 1);
  relCheck('M13', 'buste, assis', (m) => m.buste, (f) => !atFence(f), 3, '°');
  relCheck('M13', 'buste, à l’obstacle', (m) => m.buste, atFence, 5, '°');
  relCheck('M14', 'assise au pas', (m) => m.assise, walking, 0.004, 'm');
  // M14 levée : maximum de l'assise ≤ maximum de la référence + 1 cm (sur le scénario).
  {
    const mx = (arr) => Math.max(...arr.map((m) => m.assise).filter(Number.isFinite));
    const u = mx(mU), a = mx(m1), b = mx(m2);
    checks.push({ id: 'M14', label: 'levée maximale de l’assise ≤ référence + 1 cm', kind: 'écart', tol: 0.01, unit: 'm', images: N, o1: { max: u - a, at: null, pass: u - a <= 0.01 }, o2: { max: u - b, at: null, pass: u - b <= 0.01 } });
  }
  // M16 : rotation des segments par image ≤ 15° en régime établi (référence ≤ 15°), ≤ référence + 5° en transition.
  for (const [arr, tag] of [[m1, 'o1'], [m2, 'o2']]) {
    let worst = -Infinity, at = null, n = 0, over = 0;
    for (let i = 1; i < N; i++) {
      const a = mU[i].rotSeg, b = arr[i].rotSeg;
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      n++;
      const excess = b <= 15 ? a - 15 : a - (b + 5);
      if (excess > worst) (worst = excess), (at = o1.frames[i].f);
      over += excess > 0;
    }
    const c = checks.find((x) => x.id === 'M16') || (checks.push({ id: 'M16', label: 'continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès)', kind: 'écart', tol: 0, unit: '°', images: n }), checks[checks.length - 1]);
    c[tag] = { max: worst, at, pass: worst <= 0, over };
  }
  // M7 : au plus 3 images de suite entre −1 et −2 cm ; jamais sous −2 cm.
  for (const s of SIDES) {
    let run = 0, longest = 0, below2 = 0;
    for (let i = 0; i < N; i++) {
      const v = mU[i]['M7min' + s];
      if (!Number.isFinite(v)) continue;
      below2 += v < -0.02;
      run = v < -0.01 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    const c = checks.find((x) => x.id === 'M7' && x.label.includes(s === 'L' ? 'gauche' : 'droit'));
    if (c) Object.assign(c, { runBelow1: longest, below2, pass: c.pass || (below2 === 0 && longest <= 3) });
  }
  // M17 : phases du saut, ± 2 images contre O1 et O2.
  let phases = null;
  const pu = jumpPhases(runUE), p1 = jumpPhases(runO1), p2 = jumpPhases(runO2);
  if (pu && p1 && p2) {
    const keys = ['appel', 'sommet', 'poserAnterieurs', 'poserPosterieursDetecte', 'poserPosterieursRegle', 'jumpK50Montee', 'jumpKMax', 'jumpK50Descente', 'jumpK10Descente'];
    const d = (a, b) => (a === null || b === null ? (a === b ? 0 : Infinity) : Math.abs(a - b));
    phases = keys.map((key) => ({ phase: key, ue: pu[key], o1: p1[key], o2: p2[key], d1: d(pu[key], p1[key]), d2: d(pu[key], p2[key]) }));
    if (phases.some((p) => !(p.d1 <= 2))) ok = false;
  }
  // Entrées de la règle : Unreal contre O1 (même image), information.
  let ph = 0, phN = 0, phHeld = 0, bob = 0, pitch = 0;
  for (let i = 0; i < N; i++) {
    const u = ue.frames[i], f = o1.frames[i];
    const g = Math.abs(u.in.ph - f.in.ph) % 1, gp = Math.min(g, 1 - g);
    // in.ph est lu avec le retard d'une image : c'est l'état du cheval de l'image précédente qui a été réécrit ou tenu.
    if (i > 0 && ue.frames[i - 1].hz.phw) (ph = Math.max(ph, gp)), phN++;
    else phHeld = Math.max(phHeld, gp);
    if (i > 0) (bob = Math.max(bob, Math.abs(u.in.bob - f.in.bob))), (pitch = Math.max(pitch, Math.abs(u.in.pitch - f.in.pitch) * 180 / Math.PI));
  }
  const mirror = ue.frames.filter((f) => f.hz.mirror > 0).length;
  // Étape S1 : étrivière (M5) et rênes (M18), information : grandeurs qui dépendent de la taille du cheval (plan §5 : M5 en
  // simple information) ; min et max sur toutes les images, Unreal, O1 et O2.
  const span = (arr, key) => {
    const v = arr.map((m) => m[key]).filter(Number.isFinite);
    return v.length ? [Math.min(...v), Math.max(...v)] : null;
  };
  const info = {};
  // O2 rejoue la règle sur le cheval d'O1, sans étrier propre (hz.ir est celui du cavalier du web) : M4 et M5 sans objet pour O2.
  for (const key of ['M4L', 'M4R', 'M4aL', 'M4aR', 'M5L', 'M5R', 'reneL', 'reneR', 'ecartPoignets']) info[key] = { ue: span(mU, key), o1: span(m1, key), o2: /^M[45]/.test(key) ? null : span(m2, key) };
  for (const c of checks) {
    const p = c.kind === 'seuil' ? c.pass : c.o1?.pass;
    if (p === false) ok = false;
  }
  scen.push({ id: e.id, images: N, mirror, seated: runUE.frames.filter(seated).length, checks, phases, tack: info, inputs: { phaseRewritten: phN, phaseMaxRewritten: ph, phaseMaxHeld: phHeld, bobMax: bob, pitchMaxDeg: pitch } });
}

// ---------------------------------------------------------------------------------------------------------------------
const f = (v, unit) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const x = unit === 'm' ? v * 100 : v;
  return x.toFixed(unit === '' ? 4 : unit === '°' ? 2 : 2).replace('.', ',').replace(/^-/, '−');
};
const u = (unit) => (unit === 'm' ? ' cm' : unit === '°' ? '°' : '');
const yes = (p) => (p === undefined || p === null ? '—' : p ? 'oui' : '**non**');
const L = [];
L.push('# Niveau B : la cavalière Unreal posée par la règle sur le cheval Unreal (essai de monte, voie A, étape M3)');
L.push('');
L.push('Page générée par `node scripts/unreal/rider-rules-niveau-b.mjs` (ne pas modifier à la main), à partir de l’export du test');
L.push('moteur `Strides.Parite.RiderOnHorse`. Les scénarios d’O1 sont rejoués sur le **cheval Unreal** (clips et temps du');
L.push(`mélangeur du web, clips miroir cuits dans Unreal, ${SIZE}) ; siège, profils,`);
L.push('postérieurs et phase de foulée sont calculés par Unreal ; la cavalière est posée par la chaîne du jeu (option');
L.push('`-StridesRider=regles`) et ses articulations sont relues sur le maillage. Grandeurs : `rider-rules-metrics.mjs`, le même');
L.push('code que pour O1 et O2. Tolérances : `plan-essai.md` §5, niveau B.');
L.push('');
L.push('Deux références image par image : **O1** (règle du web, cheval du web, cavalier classique : la référence du plan) et');
L.push('**O2 rider_f** (règle du web, cheval du web, proportions de la cavalière Unreal) : l’écart à O2 isole l’effet du cheval');
L.push('Unreal. Assis : levée de la règle sous 2 cm et hors du vol ; obstacle : vol ou accompagnement (jumpK ≥ 0,1) ; pas :');
L.push('poids de l’allure du pas de la règle au moins 0,5. Depuis l’étape S1 (sellerie complète), l’export donne les étriers');
L.push('affichés par Unreal (`UStridesHorseTackMesh`) : M4 est jugé sur son seuil, M5 (étrivière) et M18 (rênes) sont relevés');
L.push('plus bas (colonne O2 de M4 sans objet : O2 n’a pas d’étrier propre) ; M8 (pénétration) est mesuré dans le test moteur par');
L.push('la méthode des 6 rayons du web contre le maillage du cheval Unreal skinné. Non mesuré : M19 (montée et descente : E4 et');
L.push('E5 hors de l’essai, aucun oracle).');
L.push('');
L.push('## Seuils absolus de la règle (valeur Unreal ; O1 et O2 sur les mêmes images, pour mémoire)');
L.push('');
L.push('| Scénario | Grandeur | Unreal | Image | Seuil | Tenu | O1 | O2 |');
L.push('|---|---|---|---|---|---|---|---|');
for (const s of scen)
  for (const c of s.checks.filter((x) => x.kind === 'seuil'))
    L.push(`| ${s.id} | ${c.id} ${c.label}${c.id === 'M7' ? ` (plus longue suite sous −1 cm : ${c.runBelow1} images ; sous −2 cm : ${c.below2})` : ''} | ${f(c.value, c.unit)}${u(c.unit)} | ${c.at} | ${c.cmp === 'max' ? '≤' : '≥'} ${f(c.limit, c.unit)}${u(c.unit)} | ${yes(c.pass)} | ${f(c.o1, c.unit)} | ${f(c.o2, c.unit)} |`);
L.push('');
L.push('## Écarts aux références (grandeurs qui ne dépendent pas de l’échelle du cheval)');
L.push('');
L.push('Colonnes de décomposition (information) : **O2 − O1**, ce que changent les seules proportions de la cavalière (cheval du');
L.push('web dans les deux) ; **contrôle − O2**, ce que le rejeu ajoute quand le cheval Unreal est posé comme celui du web (phase');
L.push('tenue au saut ; jusqu’à l’étape S5, clips du trot et du grand saut rééchantillonnés à 30 images/s) ; le reste de **Unreal − O2** vient du cheval du jeu');
L.push('(taille, pas d’inclinaison en virage ni de pente, corps non remonté au saut).');
L.push('');
L.push('| Scénario | Grandeur | Images | Tolérance | Unreal − O1 (max) | Image | Tenu | Unreal − O2 (max) | Image | Tenu | O2 − O1 | contrôle − O2 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of scen)
  for (const c of s.checks.filter((x) => x.kind === 'écart'))
    L.push(`| ${s.id} | ${c.id} ${c.label} | ${c.images} | ${f(c.tol, c.unit)}${u(c.unit)} | ${f(c.o1?.max, c.unit)}${u(c.unit)} | ${c.o1?.at ?? '—'} | ${yes(c.o1?.pass)} | ${f(c.o2?.max, c.unit)}${u(c.unit)} | ${c.o2?.at ?? '—'} | ${yes(c.o2?.pass)} | ${c.prop === undefined ? '—' : f(c.prop, c.unit) + u(c.unit)} | ${c.ctl === undefined ? '—' : f(c.ctl, c.unit) + u(c.unit)} |`);
L.push('');
L.push('## M17 : phases du saut (images depuis le début du scénario), tolérance ± 2 images');
L.push('');
L.push('| Scénario | Phase | Unreal | O1 | O2 | Écart à O1 | Écart à O2 |');
L.push('|---|---|---|---|---|---|---|');
for (const s of scen)
  if (s.phases) for (const p of s.phases) L.push(`| ${s.id} | ${p.phase} | ${p.ue ?? '—'} | ${p.o1 ?? '—'} | ${p.o2 ?? '—'} | ${Number.isFinite(p.d1) ? p.d1 : '—'}${p.d1 <= 2 ? '' : ' **(> 2)**'} | ${Number.isFinite(p.d2) ? p.d2 : '—'}${p.d2 <= 2 ? '' : ' **(> 2)**'} |`);
L.push('');
L.push('## Sellerie affichée (étape S1) : étrier, étrivière, rênes (information, min – max sur toutes les images)');
L.push('');
L.push('M4 : plante – étrier affiché ; M4a : avant-pied – étrier, moins 0,015 · scale (0 par construction, dans le web comme dans');
L.push('Unreal) ; M5 : étrivière, porte-étrivière → œil de l’étrier (0,115 m au-dessus) ; M18 : rêne, mors → poing de la règle ;');
L.push(`écartement des poignets. M5 et M18 dépendent de la taille du cheval (${SIZE}).`);
L.push('');
L.push('| Scénario | Grandeur | Unreal | O1 | O2 |');
L.push('|---|---|---|---|---|');
const rg = (r) => (r ? `${f(r[0], 'm')} – ${f(r[1], 'm')} cm` : '—');
const LAB = { M4L: 'M4 gauche', M4R: 'M4 droit', M4aL: 'M4a gauche', M4aR: 'M4a droit', M5L: 'M5 étrivière gauche', M5R: 'M5 étrivière droite', reneL: 'M18 rêne gauche', reneR: 'M18 rêne droite', ecartPoignets: 'M18 écartement des poignets' };
for (const s of scen)
  for (const [k, v] of Object.entries(s.tack || {})) L.push(`| ${s.id} | ${LAB[k]} | ${rg(v.ue)} | ${rg(v.o1)} | ${rg(v.o2)} |`);
L.push('');
L.push('## Entrées de la règle venues du cheval Unreal, contre celles du web (information)');
L.push('');
L.push('| Scénario | Images | Avec clip miroir | Assises | Phase réécrite depuis le clip (images ; écart max) | Phase tenue (écart max) | bob (écart max) | tangage (écart max) |');
L.push('|---|---|---|---|---|---|---|---|');
for (const s of scen)
  L.push(`| ${s.id} | ${s.images} | ${s.mirror} | ${s.seated} | ${s.inputs.phaseRewritten} ; ${s.inputs.phaseMaxRewritten.toExponential(1)} | ${s.inputs.phaseMaxHeld.toFixed(3).replace('.', ',')} | ${f(s.inputs.bobMax, 'm')} cm | ${f(s.inputs.pitchMaxDeg, '°')}° |`);
L.push('');
L.push('Phase tenue : à l’arrêt et pendant le saut, le web fait avancer la phase par sa locomotion procédurale');
L.push('(`horse/anim.js`), non portée ; Unreal la tient à sa dernière valeur. bob et tangage : le cheval Unreal est plus petit,');
L.push('ne suit pas la pente du terrain, ne remonte ni n’abaisse son corps au saut (horloge du saut et `rootY` non portés),');
L.push('et ne bascule pas face aux barres (`_barClear`).');
L.push('');
const nFail = scen.reduce((a, s) => a + s.checks.filter((c) => (c.kind === 'seuil' ? c.pass === false : c.o1?.pass === false)).length + (s.phases || []).filter((p) => !(p.d1 <= 2)).length, 0);
const nAll = scen.reduce((a, s) => a + s.checks.length + (s.phases || []).length, 0);
L.push(`Verdict : ${ok ? 'tous les seuils du niveau B sont tenus.' : `**${nFail} critères sur ${nAll} ne sont pas tenus** (seuils absolus, écarts à O1 et phases du saut contre O1) ; détail ci-dessus. Contre O2 (mêmes proportions) : ${scen.reduce((a, s) => a + s.checks.filter((c) => c.kind === 'écart' && c.o2?.pass === false).length + (s.phases || []).filter((p) => !(p.d2 <= 2)).length, 0)} écarts non tenus.`}`);
L.push('');
const json = { schema: 'strides.monte.niveau_b/1', generator: 'scripts/unreal/rider-rules-niveau-b.mjs', source: 'Strides.Parite.RiderOnHorse', ok, failed: nFail, criteria: nAll, scenarios: scen };
writeFileSync(OUT + '.json', JSON.stringify(json, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : typeof v === 'number' ? +v.toPrecision(10) : v), 1) + '\n');
writeFileSync(OUT + '.md', L.join('\n'));
console.log(`écrits : ${relative(ROOT, OUT)}.json, ${relative(ROOT, OUT)}.md (${scen.length} scénarios) ; niveau B : ${ok ? 'tenu' : `${nFail} critères sur ${nAll} non tenus`}`);
process.exit(STRICT && !ok ? 1 : 0);
