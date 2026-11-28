#!/usr/bin/env node
// Oracle O2 des règles de monte (essai de monte, voie A, étape 3) : la règle du jeu web v3, src/entities/human/anim.js
// INCHANGÉ (importé tel quel, avec skeleton.js et three), rejouée hors navigateur sur les entrées exportées dans O1
// (canal in), avec le squelette de 25 os aux proportions d'un rig donné (unreal/core/tests/oracles/monte/rigs/<rig>.json).
//
// - Rig web_classic : écrit ici depuis skeleton.js (boneDefs, rigInfo) et le poing de human.js (FIST, relu dans le
//   source) ; il doit être identique au squelette enregistré dans O1, et O2 doit alors redonner O1 (cl, cq, tg, dg) à 1e-6
//   près à toutes les images de tous les scénarios : c'est la preuve que les entrées exportées sont complètes (sortie 1
//   sinon).
// - Autre rig (rider_f : scripts/unreal/rig-from-glb.py) : réglages de position (fit) ramenés aux unités de ce modèle
//   (fit × scaleO1 / scaleRig, sauf kneeOut et mountKneeOut, des directions), comme le ferait human.js animateRiding avec
//   cette échelle. Contrôle du rig lui-même : animé par les rotations du classique (cq d'O1), il redonne le rendu réaliste
//   du web (canal rz d'O1, arrondi au millionième) relativement au bassin.
// - Exécution sans Vite ni navigateur : Node seul (aucun cache écrit dans node_modules).
//
// Usage (racine de la copie) :
//   node scripts/unreal/rider-rules-o2.mjs                         rigs web_classic et rider_f, tous les scénarios d'O1,
//                                                                  contrôles, oracles O2, page unreal/docs/parite/monte/o2.md
//   node scripts/unreal/rider-rules-o2.mjs --rigs=rider_f --only=E1,E3
//   node scripts/unreal/rider-rules-o2.mjs --fit=stirrupY=-0.62 [--out=dossier]
//        longueur d'étriers choisie par Julien (J3), en mètres dans le repère du siège : remplace fit.stirrupY à chaque
//        image (valeur / échelle du rig) ; sans --out, écrit dans .tmp/monte/o2-fit (l'oracle versionné n'est pas touché)
//   --seat=<m> : remplace seatToHips du rig (mètres) ; --scale=<s> : échelle d'un rig autre que web_classic
//   --out=<dossier> : oracles écrits ailleurs (contrôles inchangés), sans toucher aux fichiers versionnés
//   --no-doc : sans la page o2.md (implicite avec --only, --out, --fit, --seat, --scale)
// Sortie : 0 si tous les contrôles passent, 1 sinon. Mutations : scripts/unreal/mutations-monte-o2.py.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { animateHuman } from '../../src/entities/human/anim.js';
import { BONES, boneDefs, parentOf, rigInfo } from '../../src/entities/human/skeleton.js';
import { indexText, runText } from './cso-runs-io.mjs';
import { summarize } from './rider-rules-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const IN = arg('in', join(ROOT, 'unreal/core/tests/oracles/monte/o1'));
const RIGS_DIR = join(ROOT, 'unreal/core/tests/oracles/monte/rigs');
const RIGS = arg('rigs', 'web_classic,rider_f').split(',').filter(Boolean);
const ONLY = arg('only', '').split(',').filter(Boolean);
const FIT = arg('fit', '');
const SEAT = arg('seat', '');
const SCALE = arg('scale', '');
const CUSTOM = !!(FIT || SEAT || SCALE);
const OUT = arg('out', join(ROOT, CUSTOM ? '.tmp/monte/o2-fit' : 'unreal/core/tests/oracles/monte/o2'));
// Fichiers versionnés (rig web_classic, page o2.md) écrits seulement pour l'oracle versionné, complet : jamais avec --out
// (mutations, essais), --only, --fit, --seat ou --scale.
const VERSIONED = !CUSTOM && !ONLY.length && !arg('out', '');
const DOC = VERSIONED && !process.argv.includes('--no-doc');
const DOC_FILE = join(ROOT, 'unreal/docs/parite/monte/o2.md');
const SCHEMA = 'strides.oracle.rider_rules_o2/1';
const TOL = 1e-6; // O2 web_classic contre O1 (plan-essai.md étape 3)
const TOL_RZ = 2e-6; // rig contre le rendu réaliste d'O1 (rz arrondi au millionième, différence de deux valeurs arrondies)
const POINTS = ['planteL', 'planteR', 'poingL', 'poingR'];
const CQ = ['hips', 'spine', 'chest', 'neck', 'head', 'hairTail', 'lClav', 'lArm', 'lFore', 'lHand', 'lFing', 'rClav', 'rArm', 'rFore', 'rHand', 'rFing', 'lThigh', 'lShin', 'lFoot', 'lToe', 'rThigh', 'rShin', 'rFoot', 'rToe'];
const NOT_SCALED = new Set(['kneeOut', 'mountKneeOut']); // directions (human.js:353, :375)
const SHIFTS = [0, 0.01, 0.02, 0.03, 0.05, 0.08]; // étrier relevé (m) : tableau J3 de la page o2.md

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const rel = (p) => relative(ROOT, p);
function writeIfChanged(file, text) {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// O1
const index1 = JSON.parse(readFileSync(join(IN, 'index.json'), 'utf8'));
const o1 = [];
for (const e of index1.runs) {
  if (ONLY.length && !ONLY.includes(e.id)) continue;
  const text = readFileSync(join(IN, e.file), 'utf8');
  o1.push({ entry: e, text, sha: sha256(text), run: JSON.parse(text) });
}
if (!o1.length) throw new Error('aucun scénario O1 retenu');
let srcTree = null;
try {
  srcTree = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD:src'], { encoding: 'utf8' }).trim();
} catch {
  srcTree = null;
}
const failures = [];
if (index1.srcTree && srcTree && index1.srcTree !== srcTree) failures.push(`src/ différent de celui d'O1 (${srcTree} contre ${index1.srcTree})`);

// ---------------------------------------------------------------------------------------------------------------
// Rigs
const S0 = o1[0].run.setup;
const FIST_SRC = readFileSync(join(ROOT, 'src/entities/human.js'), 'utf8').match(/const FIST = new THREE\.Vector3\(([^)]*)\)/);
if (!FIST_SRC) throw new Error('FIST introuvable dans src/entities/human.js');
const FIST = FIST_SRC[1].split(',').map(Number);
function classicRig() {
  const sex = S0.sex;
  const rest = Object.fromEntries(boneDefs(sex).map((d) => [d.name, d.pos.slice()]));
  const info = rigInfo(sex);
  return {
    schema: 'strides.monte.rig/1',
    name: 'web_classic',
    generator: 'scripts/unreal/rider-rules-o2.mjs',
    source: { skeleton: 'src/entities/human/skeleton.js', fist: 'src/entities/human.js (FIST)' },
    doc: 'personnage classique du jeu web (squelette de 25 os sur lequel human/anim.js applique les règles de monte) : rest = décalages de repos (boneDefs, unités du modèle), info = rigInfo, fist = poing (repère de la main) ; scale = échelle du joueur des oracles O1 (outfits.js, graine 20261118), relue dans O1',
    scale: S0.scale,
    bones: BONES.slice(),
    rest,
    info: { ...info, toe: info.toe.slice() },
    fist: FIST,
  };
}
const rigs = {};
for (const name of RIGS) {
  if (name === 'web_classic') {
    const r = classicRig();
    const text = JSON.stringify(r, null, 1) + '\n';
    if (VERSIONED) writeIfChanged(join(RIGS_DIR, 'web_classic.json'), text);
    rigs[name] = { ...r, sha: sha256(text) };
    // Le classique de skeleton.js est celui de la page qui a exporté O1.
    const same = JSON.stringify(r.rest) === JSON.stringify(S0.rest) && JSON.stringify(r.info) === JSON.stringify(S0.rig) && JSON.stringify(r.bones) === JSON.stringify(S0.bones);
    if (!same) failures.push('web_classic : skeleton.js ne redonne pas le squelette enregistré dans O1 (setup.rest, setup.rig)');
  } else {
    const file = join(RIGS_DIR, `${name}.json`);
    if (!existsSync(file)) throw new Error(`rig absent : ${rel(file)} (python3 scripts/unreal/rig-from-glb.py --name=${name})`);
    const text = readFileSync(file, 'utf8');
    rigs[name] = { ...JSON.parse(text), sha: sha256(text) };
  }
  const r = rigs[name];
  if (SEAT) r.info = { ...r.info, seatToHips: Number(SEAT) / r.scale };
  if (SCALE && name !== 'web_classic') r.scale = Number(SCALE);
  if (JSON.stringify(r.bones) !== JSON.stringify(BONES)) throw new Error(`${name} : ordre des os différent de skeleton.js`);
}
const fitOverride = {};
for (const kv of FIT.split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!['stirrupX', 'stirrupY', 'stirrupZ', 'handX', 'handY', 'handZ', 'legClear'].includes(k) || !Number.isFinite(Number(v))) throw new Error(`--fit : ${kv}`);
  fitOverride[k] = Number(v);
}

// ---------------------------------------------------------------------------------------------------------------
// Squelette : os three.js (comme humanModel.js), racine sous un groupe à l'échelle du rig (le maillage du jeu, enfant de
// l'os « saddle » sans décalage ni rotation, à l'échelle hu.scale) : position monde = point dans S.
function skeleton(rig) {
  const group = new THREE.Group();
  group.scale.setScalar(rig.scale);
  const B = {};
  for (const n of BONES) {
    const b = new THREE.Bone();
    b.name = n;
    b.position.fromArray(rig.rest[n]);
    b.userData.rest = b.position.clone();
    B[n] = b;
    const p = parentOf(n);
    (p ? B[p] : group).add(b);
  }
  Object.defineProperty(B, '__rig', { value: { info: rig.info }, enumerable: false });
  return { group, B };
}
const v3 = (v) => [v.x, v.y, v.z];
const q4 = (q) => [q.x, q.y, q.z, q.w];

// Réglages vus par la règle pour ce rig (unités du modèle).
function rigFit(fit, scaleO1, rig, shift = 0) {
  const k = scaleO1 / rig.scale;
  const same = k === 1;
  const out = {};
  for (const [key, v] of Object.entries(fit)) {
    if (NOT_SCALED.has(key) || same) out[key] = Array.isArray(v) ? v.slice() : v;
    else out[key] = Array.isArray(v) ? v.map((x) => x * k) : v * k;
  }
  for (const [key, v] of Object.entries(fitOverride)) out[key] = v / rig.scale;
  if (shift) out.stirrupY += shift / rig.scale;
  return out;
}

// Rejoue un scénario d'O1 ; rend les images d'O2 { f, cl, cq, tg, dg } et les entrées utilisées.
function replay(run, rig, hair, shift = 0) {
  const { group, B } = skeleton(rig);
  const st = { hair };
  const info = rig.info, s = rig.scale, S = run.setup;
  const frames = [], inputs = [];
  for (const fr of run.frames) {
    const I = fr.in;
    const fit = rigFit(I.fit, S.scale, rig, shift);
    Object.assign(st, { t: I.t, horseSpeed: I.hs, horseGaitPhase: I.ph, turn: I.turn, jump: I.jump, landT: I.landT, hindDown: I.hindDown, bob: I.bob, pitch: I.pitch, wave: I.wave, fit });
    animateHuman(B, 'ride', st, I.dt);
    group.updateMatrixWorld(true);
    const cl = BONES.map((n) => v3(B[n].getWorldPosition(new THREE.Vector3())));
    for (const sd of ['l', 'r']) cl.push(v3(B[sd + 'Foot'].localToWorld(new THREE.Vector3(0, -info.ankleY + 0.012, info.toe[2] - 0.005))));
    for (const sd of ['l', 'r']) {
      const p = sd === 'r' && rig.fistR ? rig.fistR : rig.fist;
      cl.push(v3(B[sd + 'Hand'].localToWorld(new THREE.Vector3(p[0], p[1], p[2]))));
    }
    const P = st._P, R = st._ride;
    const sc3 = (v) => [v.x * s, v.y * s, v.z * s];
    frames.push({
      f: fr.f,
      cl,
      cq: CQ.map((n) => q4(B[n].quaternion)),
      tg: {
        fL: sc3(P.feet.l.pos), fR: sc3(P.feet.r.pos), qL: q4(P.feet.l.q), qR: q4(P.feet.r.q),
        xL: P.feet.l.xMax === undefined ? null : P.feet.l.xMax * s, xR: P.feet.r.xMax === undefined ? null : P.feet.r.xMax * s,
        hL: sc3(P.hands.l), hR: sc3(P.hands.r), hp: sc3(P.hips),
      },
      dg: {
        post: R.post, diag: R.diag, wantDiag: R.wantDiag, diagT: R.diagT, two: R.two, jumpK: R.jumpK, rel: R.rel, bobAvg: R.bobAvg, hd: R.hd, wasJump: R.wasJump,
        look: R.look ? [R.look.a, R.look.to, R.look.t] : null,
        hug: R.hug ? Object.fromEntries(['l', 'r'].filter((x) => R.hug[x]).map((x) => [x, [R.hug[x].px, R.hug[x].fx, R.hug[x].t]])) : null,
        bT: P.blendT,
      },
    });
    inputs.push({ ...I, fit });
  }
  return { frames, inputs };
}

// ---------------------------------------------------------------------------------------------------------------
// Écarts
const qAng = (a, b) => {
  // angle de rotation entre deux quaternions unitaires, bien conditionné près de 0 (corde, pas acos du produit scalaire)
  const sg = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const c = Math.hypot(a[0] - sg * b[0], a[1] - sg * b[1], a[2] - sg * b[2], a[3] - sg * b[3]);
  return 4 * Math.asin(Math.min(1, c / 2));
};
const vd = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
function worse(acc, key, v, where) {
  if (Number.isNaN(v)) v = Infinity; // un NaN ne doit jamais passer pour un écart nul
  if (!acc[key] || v > acc[key].v) acc[key] = { v, where };
}
// Écart d'un élément de tableau qui peut manquer (état interne absent d'un côté : échec, pas plantage).
const diffAt = (x, y, k) => (x == null || y == null ? (x == null && y == null ? 0 : Infinity) : Math.abs(x[k] - y[k]));
function compareO1(id, run1, frames2, acc) {
  const S = run1.setup;
  if (frames2.length !== run1.frames.length) worse(acc, 'images', Infinity, [id, frames2.length, run1.frames.length]);
  for (let i = 0; i < frames2.length; i++) {
    const a = run1.frames[i], b = frames2[i];
    for (let j = 0; j < b.cl.length; j++) worse(acc, 'cl', vd(a.cl[j], b.cl[j]), [id, a.f, j < S.bones.length ? S.bones[j] : POINTS[j - S.bones.length]]);
    for (let j = 0; j < CQ.length; j++) worse(acc, 'cq', qAng(a.cq[j], b.cq[j]), [id, a.f, CQ[j]]);
    for (const k of ['fL', 'fR', 'hL', 'hR', 'hp']) worse(acc, 'tg', vd(a.tg[k], b.tg[k]), [id, a.f, k]);
    for (const k of ['qL', 'qR']) worse(acc, 'tq', qAng(a.tg[k], b.tg[k]), [id, a.f, k]);
    for (const k of ['xL', 'xR']) worse(acc, 'tg', a.tg[k] === null && b.tg[k] === null ? 0 : a.tg[k] === null || b.tg[k] === null ? Infinity : Math.abs(a.tg[k] - b.tg[k]), [id, a.f, k]);
    const da = a.dg, db = b.dg;
    for (const k of ['post', 'diag', 'wantDiag', 'diagT', 'two', 'jumpK', 'rel', 'bobAvg', 'hd', 'bT']) worse(acc, 'dg', Math.abs(da[k] - db[k]), [id, a.f, k]);
    worse(acc, 'dg', da.wasJump === db.wasJump ? 0 : Infinity, [id, a.f, 'wasJump']);
    for (let k = 0; k < 3; k++) worse(acc, 'dg', diffAt(da.look, db.look, k), [id, a.f, 'look']);
    for (const sd of ['l', 'r']) for (let k = 0; k < 3; k++) worse(acc, 'dg', diffAt(da.hug?.[sd], db.hug?.[sd], k), [id, a.f, 'hug.' + sd]);
  }
}
// Rig contre le rendu réaliste : rotations locales du classique (cq d'O1) appliquées au rig ; articulations relatives au
// bassin comparées à rz (realistic.js update : rotations monde recopiées, bassin déplacé à part).
function compareRz(id, run1, rig, acc) {
  const S = run1.setup;
  if (!S.real || !rig.map) return;
  const { group, B } = skeleton(rig);
  const nb = S.real.bones.length;
  const toReal = rig.map;
  for (const fr of run1.frames) {
    if (!fr.rz) continue;
    for (let j = 0; j < CQ.length; j++) B[CQ[j]].quaternion.fromArray(fr.cq[j]);
    B.hips.position.set(0, 0, 0);
    group.updateMatrixWorld(true);
    const h = B.hips.getWorldPosition(new THREE.Vector3());
    const rp = fr.rz[S.real.bones.indexOf('pelvis')];
    for (const [c, t] of Object.entries(toReal)) {
      const k = S.real.bones.indexOf(t);
      if (k < 0) continue;
      const p = v3(B[c].getWorldPosition(new THREE.Vector3()).sub(h));
      worse(acc, 'os', vd(p, [fr.rz[k][0] - rp[0], fr.rz[k][1] - rp[1], fr.rz[k][2] - rp[2]]), [id, fr.f, t]);
    }
    for (const [sd, j] of [['l', 0], ['r', 1]]) {
      const f = sd === 'r' && rig.fistR ? rig.fistR : rig.fist;
      const p = v3(B[sd + 'Hand'].localToWorld(new THREE.Vector3(f[0], f[1], f[2])).sub(h));
      const g = fr.rz[nb + j];
      worse(acc, 'poing', vd(p, [g[0] - rp[0], g[1] - rp[1], g[2] - rp[2]]), [id, fr.f, 'poing' + sd.toUpperCase()]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Exécution
const hairIdx = CQ.indexOf('hairTail');
const runsOut = [], checks = {}, merged = {};
for (const name of RIGS) {
  const rig = rigs[name];
  const isO1Rig = name === 'web_classic' && !CUSTOM;
  const acc = {}, accRz = {};
  let nCompared = 0, nFrames = 0;
  for (const { entry, sha, run } of o1) {
    // Queue de cheval (st.hair, human.js:79) : absente d'O1, déduite de son canal cq (hairTail non nul = ressort actif).
    const hair = run1Hair(run);
    const { frames, inputs } = replay(run, rig, hair);
    nFrames += frames.length;
    if (isO1Rig) {
      // Contrôle exigé à toutes les images : une échelle différente de celle d'O1 est un échec, pas un contrôle sauté.
      if (rig.scale !== run.setup.scale) failures.push(`${entry.id} : échelle d'O1 ${run.setup.scale} différente de celle du rig web_classic ${rig.scale}`);
      else {
        compareO1(entry.id, run, frames, acc);
        nCompared += frames.length;
      }
    }
    if (name !== 'web_classic') compareRz(entry.id, run, rig, accRz);
    const S = run.setup;
    const setup = {
      o1: { file: rel(join(IN, entry.file)), sha256: sha },
      rigName: name, rigSha256: rig.sha, sex: S.sex, scale: rig.scale, scaleO1: S.scale, fitScale: S.scale / rig.scale,
      fitOverride: Object.keys(fitOverride).length ? fitOverride : null, seat: SEAT ? Number(SEAT) : null, hair,
      rig: rig.info, rest: rig.rest, fist: rig.fist, fistR: rig.fistR ?? null,
      bones: BONES.slice(), points: POINTS, cq: CQ, window: S.window, fade: S.fade, scenario: S.scenario,
    };
    const out = { id: entry.id, desc: run.desc, setup, frames };
    runsOut.push({ rig: name, out });
    merged[name + '/' + entry.id] = { o1: run, frames, inputs, rig };
  }
  const r = (o) => Object.fromEntries(Object.entries(o).map(([k, { v, where }]) => [k, { max: v, at: where }]));
  checks[name] = {};
  if (isO1Rig && nCompared !== nFrames) failures.push(`${name} contre O1 : ${nCompared} images comparées sur ${nFrames}`);
  if (Object.keys(acc).length) {
    checks[name].o1 = { ...r(acc), images: nCompared };
    for (const [k, { v, where }] of Object.entries(acc)) if (!(v <= TOL)) failures.push(`${name} contre O1 : ${k} ${v} > ${TOL} (${where.join(' ')})`);
  }
  if (Object.keys(accRz).length) {
    checks[name].rz = r(accRz);
    for (const [k, { v, where }] of Object.entries(accRz)) if (!(v <= TOL_RZ)) failures.push(`${name} contre le rendu réaliste : ${k} ${v} > ${TOL_RZ} (${where.join(' ')})`);
  }
}

// Écriture : <out>/<rig>/<scénario>.json et <out>/index.json.
const HEAD = {
  schema: SCHEMA,
  generator: 'scripts/unreal/rider-rules-o2.mjs',
  doc: 'oracle O2 des règles de monte (essai de monte, voie A, étape 3) : src/entities/human/anim.js inchangé, rejoué hors navigateur (Node) sur les entrées d’O1 avec le squelette de 25 os aux proportions d’un rig (unreal/core/tests/oracles/monte/rigs/<rig>.json). Rig web_classic : identique à O1 à 1e-6 près (checks.web_classic.o1). Autre rig : ce que la règle web aurait produit avec ces longueurs, oracle du portage C++ (étape 4) et du niveau A (étape 6).',
  layout: 'un dossier par rig, un fichier par scénario (runs[].file = <rig>/<id>.json) : objet { id, desc, setup, frames }, en-tête sur la première ligne puis une image par ligne ; images dans l’ordre d’O1 (même f), fenêtre de mesure et fondu repris d’O1',
  inputs: 'entrées de la règle à l’image f = canal in de l’image f du fichier O1 nommé dans setup.o1 (empreinte sha256), avec fit remplacé par fit × setup.fitScale (multiplication par ce double, sauf kneeOut et mountKneeOut, et tableaux élément par élément ; aucune opération si fitScale = 1), puis chaque clé de setup.fitOverride (mètres) divisée par setup.scale ; st.hair = setup.hair (déduit du canal cq d’O1 : hairTail non nul) ; état neuf à l’image 0 (Human.mount : _init = false, _ride = null)',
  frames: {
    S: 'repère du siège, comme O1 ; point dans S = point du modèle × setup.scale',
  },
  channels: {
    f: 'indice de l’image (celui d’O1)',
    cl: 'squelette dans S (m), pleine précision : 25 articulations dans l’ordre setup.bones, puis planteL, planteR (pied.localToWorld(0, -ankleY + 0.012, toe.z - 0.005), anim.js:771), poingL, poingR (main.localToWorld(fist ; fistR à droite s’il existe))',
    cq: 'quaternions locaux des 24 os animés (ordre setup.cq), après le lissage d’animateHuman',
    tg: 'cibles de la règle (_P), dans S : fL, fR (cheville visée), qL, qR (orientation du pied), xL, xR (place naturelle du pied, null sans profil), hL, hR (poignet visé), hp (bassin visé)',
    dg: 'état interne de la règle après l’image (_ride), comme O1 : post, diag, wantDiag, diagT, two, jumpK, rel, bobAvg, hd, wasJump, look [a, to, t], hug { l, r : [px, fx, t] }, bT',
  },
  tolerances: { o1: TOL, rz: TOL_RZ },
  srcTree,
  o1Index: { file: rel(join(IN, 'index.json')), srcTree: index1.srcTree ?? null },
  rigs: Object.fromEntries(RIGS.map((n) => [n, { file: rel(join(RIGS_DIR, n + '.json')), sha256: rigs[n].sha, scale: rigs[n].scale }])),
  checks,
};
const written = [], kept = [];
for (const { rig, out } of runsOut) {
  const file = `${rig}/${out.id}.json`;
  (writeIfChanged(join(OUT, file), runText(out)) ? written : kept).push(file);
}
const entries = runsOut.map(({ rig, out }) => ({ rig, id: out.id, file: `${rig}/${out.id}.json`, frames: out.frames.length, window: out.setup.window, accept: out.setup.scenario?.accept ?? null }));
if (!ONLY.length) (writeIfChanged(join(OUT, 'index.json'), indexText(HEAD, entries)) ? written : kept).push('index.json');
const listed = new Set(entries.map((e) => e.file));
const orphans = [];
for (const rigName of RIGS) {
  const d = join(OUT, rigName);
  if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.json') && !listed.has(`${rigName}/${f}`)) orphans.push(`${rigName}/${f}`);
}
console.log(`${rel(OUT)} : écrits ${written.length ? written.join(' ') : 'aucun'} ; inchangés ${kept.length} ${orphans.length ? '; non listés : ' + orphans.join(' ') : ''}`);
for (const [n, c] of Object.entries(checks)) {
  for (const [kind, o] of Object.entries(c)) {
    const parts = Object.entries(o).filter(([, x]) => typeof x === 'object').map(([k, { max, at }]) => `${k} ${max.toExponential(2)} (${at.join(' ')})`);
    console.log(`${n} contre ${kind === 'o1' ? `O1 (${o.images} images)` : 'le rendu réaliste (rz)'} : ` + parts.join(' ; '));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Page o2.md : contrôles, rig rider_f, mesures de la règle sur les deux rigs, longueur d'étriers (J3).
if (DOC) {
  const asRun = (key, frames, inputs) => {
    const { o1: run, rig } = merged[key];
    const setup = { ...run.setup, scale: rig.scale, rig: rig.info, rest: rig.rest, real: null };
    return { id: run.id, setup, frames: run.frames.map((f, i) => ({ ...f, cl: frames[i].cl, cq: frames[i].cq, tg: frames[i].tg, dg: frames[i].dg, in: inputs[i], rz: null, pe: null })) };
  };
  const stats = (run) => summarize(run).summary.stats;
  const sweep = {};
  for (const name of RIGS) {
    for (const id of ['E1', 'E2g', 'E3b']) {
      const key = name + '/' + id;
      if (!merged[key]) continue;
      for (const d of SHIFTS) {
        const m = merged[key];
        const hair = run1Hair(m.o1);
        const { frames, inputs } = d === 0 ? { frames: m.frames, inputs: m.inputs } : replay(m.o1, m.rig, hair, d);
        (sweep[key] ||= []).push({ d, st: stats(asRun(key, frames, inputs)) });
      }
    }
  }
  writeIfChanged(DOC_FILE, page(sweep, asRun, stats));
  console.log(`${rel(DOC_FILE)} : à jour`);
}
function run1Hair(run) {
  return run.frames.some((f) => f.cq[hairIdx][0] !== 0 || f.cq[hairIdx][1] !== 0 || f.cq[hairIdx][2] !== 0);
}

function page(sweep, asRun, stats) {
  const f = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ',').replace('-', '−'));
  const cm = (v, d = 1) => (v === null || v === undefined ? '—' : f(v * 100, d));
  const sci = (v) => (v === 0 ? '0' : v.toExponential(1).replace('.', ',').replace('e-', ' × 10^−').replace('e+', ' × 10^'));
  const mean2 = (st, k) => (st[k + 'L'] && st[k + 'R'] ? (st[k + 'L'].mean + st[k + 'R'].mean) / 2 : null);
  const mn = (st, k) => Math.min(st[k + 'L']?.min ?? Infinity, st[k + 'R']?.min ?? Infinity);
  const mx = (st, k) => Math.max(st[k + 'L']?.max ?? -Infinity, st[k + 'R']?.max ?? -Infinity);
  const L = [];
  L.push('# Oracle O2 : la règle de monte du web rejouée hors navigateur (essai de monte, voie A, étape 3)');
  L.push('');
  L.push('Page générée par `node scripts/unreal/rider-rules-o2.mjs` (ne pas modifier à la main). `src/entities/human/anim.js` est');
  L.push('importé **inchangé** par Node, sans Vite ni navigateur, et rejoué sur les entrées exportées dans O1 (canal `in`). Oracles :');
  L.push('`unreal/core/tests/oracles/monte/o2/` ; rigs : `unreal/core/tests/oracles/monte/rigs/`.');
  L.push('');
  L.push(`Arbre \`src/\` : \`${srcTree}\` (celui d'O1 : \`${index1.srcTree}\`).`);
  L.push('');
  L.push('## 1. Preuve : O2 `web_classic` redonne O1');
  L.push('');
  const c = checks.web_classic?.o1;
  if (c) {
    L.push(`Écart maximal sur toutes les images des ${o1.length} scénarios d'O1 (tolérance du plan : ${sci(TOL)} m et ${sci(TOL)} rad) :`);
    L.push('');
    L.push('| Canal | Écart maximal | Où (scénario, image, os ou champ) |');
    L.push('|---|---|---|');
    const lab = { cl: 'articulations et points `cl` (m)', cq: 'quaternions locaux `cq` (rad)', tg: 'cibles `tg`, positions (m)', tq: 'cibles `tg`, orientations des pieds (rad)', dg: 'état interne `dg`' };
    for (const k of ['cl', 'cq', 'tg', 'tq', 'dg']) if (c[k]) L.push(`| ${lab[k]} | ${sci(c[k].max)} | ${c[k].at.join(', ')} |`);
    L.push('');
    L.push('Les entrées exportées dans O1 sont donc complètes : la règle ne lit rien d’autre. Hors des cas ci-dessous, les écarts');
    L.push('sont de l’ordre de 10^−13 m (passage par le repère du siège dans la page) et de 10^−16 sur les cibles et l’état interne.');
    L.push('');
    L.push('**Seul écart au-delà de 10^−12 : le lissage des os hors jambes (slerp).** `animateHuman` lisse ces os par');
    L.push('`Quaternion.slerp`, qui change de branche selon `cosHalfTheta` : rien si ≥ 1, interpolation linéaire normalisée si');
    L.push('1 − cos² ≤ `Number.EPSILON`, slerp sinon. Les deux moteurs JavaScript (Chrome du Mac pour O1, Node pour O2) diffèrent');
    L.push('parfois au dernier bit (10^−16, écarts des cibles et de l’état interne ci-dessus) ; quand un os est à un ulp de sa');
    L.push('cible, ce dernier bit le fait passer d’une branche à l’autre dans un moteur seulement, et l’écart grimpe à quelques');
    L.push(`10^−9 avant de se résorber en quelques images (pire cas : ${c.cq.at.join(', ')} ; branche relevée dans Node, journal de`);
    L.push('l’étape 3). Conséquence pour l’étape 4 : le portage C++ doit reproduire ces branches telles quelles, et la tolérance');
    L.push('de 0,1 mm du plan couvre largement ce cas.');
  } else L.push('(contrôle non exécuté dans cette génération)');
  L.push('');
  const rf = rigs.rider_f;
  if (rf) {
    L.push('## 2. Rig `rider_f` : la cavalière réaliste du web, en squelette de règle');
    L.push('');
    L.push('`python3 scripts/unreal/rig-from-glb.py` lit `public/real/rider_f.glb` (nœuds seulement) et refait le calage du jeu');
    L.push('(`realistic.js` `_calibrate`) : membres tournés sur les directions de repos du classique, puis un décalage par os du');
    L.push('classique. Points sans os, relevés dans la page par l’exporteur O1 : semelle de la botte (d’où `ankleY`) et creux du');
    L.push('poing (moyenne sur la fenêtre d’E1).');
    L.push('');
    const I = rf.info, C = rigs.web_classic?.info, sc = rigs.web_classic?.scale;
    L.push('| Mesure (m) | `web_classic` × échelle ' + (sc ? f(sc, 3) : '—') + ' | `rider_f` (taille naturelle) |');
    L.push('|---|---|---|');
    const row = (lab, a, b) => L.push(`| ${lab} | ${a === null ? '—' : f(a, 3)} | ${b === null ? '—' : f(b, 3)} |`);
    if (C) {
      row('cuisse', C.thighLen * sc, I.thighLen * rf.scale);
      row('jambe (genou → cheville)', C.shinLen * sc, I.shinLen * rf.scale);
      row('longueur de jambe L', (C.thighLen + C.shinLen) * sc, (I.thighLen + I.shinLen) * rf.scale);
      row('bras', C.upperArmLen * sc, I.upperArmLen * rf.scale);
      row('avant-bras', C.foreArmLen * sc, I.foreArmLen * rf.scale);
      row('cheville au-dessus de la semelle (ankleY)', C.ankleY * sc, I.ankleY * rf.scale);
      row('cheville → boule du pied, avance (toe.z)', C.toe[2] * sc, I.toe[2] * rf.scale);
      row('ischions → os du bassin (seatToHips)', C.seatToHips * sc, I.seatToHips * rf.scale);
    }
    L.push('');
    if (C) {
      L.push(`- \`seatToHips\` de \`rider_f\` est une **convention à confirmer** (étape 6) : valeur du classique (${f(C.seatToHips, 3)}) × hauteur`);
      L.push(`  du bassin de \`rider_f\` (${f(I.hipsY * rf.scale, 3)} m) / hauteur du bassin classique (${f(C.hipsY, 3)}), le rapport \`hipScale\` que le jeu`);
      L.push('  applique déjà au déplacement du bassin (`realistic.js:726`). Elle fixe la hauteur du bassin dans la selle ;');
      L.push('  `--seat=<m>` la remplace.');
    }
    const rz = checks.rider_f?.rz;
    if (rz) {
      L.push(`- **Contrôle du rig** : animé par les rotations du classique (\`cq\` d'O1), il redonne le rendu réaliste du web (\`rz\`,`);
      L.push(`  arrondi au millionième) à ${sci(rz.os.max)} m près pour les articulations et ${sci(rz.poing.max)} m pour le poing, relativement au`);
      L.push(`  bassin, sur toutes les images (tolérance ${sci(TOL_RZ)} m).`);
      L.push(`- Contrôle de la boule du pied contre la page : ${sci(rf.checks.ball)} m.`);
    }
    L.push('');
  }
  // Mesures par scénario sur la fenêtre.
  L.push('## 3. Ce que la règle donne sur chaque rig (fenêtres d’O1)');
  L.push('');
  L.push('Mêmes calculs que `v3-mesures.md` (`scripts/unreal/rider-rules-metrics.mjs`, fonction `summarize`), sur O2. Les grandeurs');
  L.push('qui dépendent du rendu du web (étrier affiché M4, étrivière M5, pénétration M8, rendu réaliste) ne s’appliquent pas à O2.');
  L.push('Genou, hanche : degrés, min à max des deux côtés ; ρ : portée hanche–cheville rapportée à L ; M1y : plante moins point');
  L.push('d’étrier visé (cm, > 0 = pied remonté) ; M7 : écart minimal au flanc (cm) ; M9 : poignet au-dessus de l’encolure (cm).');
  L.push('');
  L.push('| Scénario | Rig | Genou | ρ max | Hanche | M1y max | M7 min | M9 min |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const { entry } of o1) {
    for (const name of RIGS) {
      const key = name + '/' + entry.id;
      const m = merged[key];
      const st = stats(asRun(key, m.frames, m.inputs));
      L.push(`| ${entry.id} | ${name} | ${f(mn(st, 'genou'))} à ${f(mx(st, 'genou'))} | ${f(mx(st, 'M6'), 3)} | ${f(mn(st, 'hanche'))} à ${f(mx(st, 'hanche'))} | ${cm(mx(st, 'M1y'))} | ${cm(mn(st, 'M7min'))} | ${cm(mn(st, 'M9'))} |`);
    }
  }
  L.push('');
  // Étriers.
  L.push('## 4. Longueur d’étriers (décision J3 de Julien) : mesurée avec O2');
  L.push('');
  L.push('Même règle, mêmes entrées, seul `stirrupY` change : étrier relevé de 1 à 8 cm par rapport à la v3 (−64,0 cm sous le');
  L.push('point d’assise : borne la plus courte du réglage du cheval PJL, `pjlHorse.js:264`, que le rejeu ne consulte pas).');
  L.push('Rejeu complet de chaque scénario ; valeurs sur la fenêtre de mesure. Arrêt : moyenne des deux genoux, assise moyenne');
  L.push('(bassin par rapport à sa hauteur assise, cm, < 0 : bassin descendu dans la selle). Galop et obstacle : plage des deux');
  L.push('côtés. Pour appliquer une longueur : `--fit=stirrupY=<m>` (par exemple −0,62 pour 2 cm plus court).');
  L.push('');
  for (const name of RIGS) {
    L.push(`### Rig \`${name}\``);
    L.push('');
    L.push('| Étrier relevé de | Arrêt (E1) : genou | ρ | hanche | assise | pied écarté G / D | M1y max | Galop (E2g) : genou | ρ max | Obstacle 1,40 m (E3b) : genou | ρ max |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|');
    const s1 = sweep[name + '/E1'] || [], s2 = sweep[name + '/E2g'] || [], s3 = sweep[name + '/E3b'] || [];
    for (let i = 0; i < SHIFTS.length; i++) {
      const a = s1[i]?.st, b = s2[i]?.st, c3 = s3[i]?.st;
      if (!a) continue;
      L.push(`| ${SHIFTS[i] === 0 ? '0 (v3)' : f(SHIFTS[i] * 100, 0) + ' cm'} | ${f(mean2(a, 'genou'))}° | ${f(mean2(a, 'M6'), 3)} | ${f(mean2(a, 'hanche'))}° | ${cm(a.assise?.mean)} | ${cm(a.M2L?.mean)} / ${cm(a.M2R?.mean)} | ${cm(mx(a, 'M1y'))} | ${b ? f(mn(b, 'genou')) + ' à ' + f(mx(b, 'genou')) + '°' : '—'} | ${b ? f(mx(b, 'M6'), 3) : '—'} | ${c3 ? f(mn(c3, 'genou')) + ' à ' + f(mx(c3, 'genou')) + '°' : '—'} | ${c3 ? f(mx(c3, 'M6'), 3) : '—'} |`);
    }
    L.push('');
  }
  L.push('Lecture : M1y reste nul tant que la plante atteint l’étrier visé ; un M1y positif signale que la règle a dû remonter le');
  L.push('pied (étrier hors de portée de la jambe, `seatReach` 0,93 assis, `riseReach` 0,95 debout). « Pied écarté » : M2, écart');
  L.push('latéral moyen de la plante au réglage `stirrupX` (cm) ; la règle écarte le pied quand le tibia touche le profil du');
  L.push('flanc, de 4 cm au plus (`xMax`), ce qui rallonge la portée et rouvre le genou. Avec une assise négative, c’est le bassin');
  L.push('qui remonte d’abord dans la selle quand l’étrier raccourcit. Ces deux effets expliquent un premier centimètre presque');
  L.push('sans effet sur le genou à l’arrêt. Le rejeu ne change ni le cheval ni l’étrier affiché : ce sont des mesures de la');
  L.push('règle, pas du rendu.');
  L.push('');
  return L.join('\n') + '\n';
}

if (failures.length) {
  console.log('ÉCHECS :\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('contrôles : tous passés');
