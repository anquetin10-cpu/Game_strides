// Essai de monte, voie A, étape 5 : données de sellerie du cheval WildMesh pour le composant Unreal UStridesHorseTack
// (unreal/docs/parite/monte/plan-essai.md, étape 5). Node seul, sans navigateur ni serveur : le jeu web est la
// spécification et ce script ne modifie rien dans src/, public/ ni tests/.
//
// Entrées (lues, jamais modifiées) :
//  - public/real/horse_pjl.glb : le cheval que le jeu web affiche (décodé par @gltf-transform et meshoptimizer, comme
//    three.js le décode : attributs normalisés ramenés en flottants, matrices inverses de liaison telles quelles) ;
//  - unreal/StridesGrandTour/Content/Data/pjl_tack_anchors.json : ancres de sellerie et indices des sommets des profils
//    relus dans la page par scripts/unreal/export-rider-rules.mjs --anchors (étape 2) ;
//  - src/entities/pjlHorse.js : constantes du siège et des profils (CREST, HIND_DOWN, lissages du siège), relues dans le
//    source (une seule occurrence exigée, aucune valeur recopiée).
//
// Sortie : unreal/StridesGrandTour/Content/Data/pjl_horse_tack.json. Pourquoi : un import Unreal renumérote les sommets
// (les indices du web ne désignent rien dans le maillage importé) et le GLB du web encode une pose de liaison qui n'est
// pas sa pose de repos (quantification de glTF-Transform repliée dans les matrices inverses de liaison ; voir
// scripts/unreal/normalize-horse-glb.py). On écrit donc, pour chaque ancre et chaque sommet retenu, et pour chacun de
// ses os : le poids et le point q = W_repos(os) · boneInverse(os) · bindMatrix · p, dans l'espace de la scène du GLB à
// la pose de repos des nœuds. La formule du web (pjl/view.js anchorWorld, SkinnedMesh.applyBoneTransform) donne alors,
// pour une pose quelconque :  monde = Σ w · W_posé(os) · W_repos(os)⁻¹ · q, ce que le composant Unreal évalue avec ses
// propres os (transformées de composant) et leur pose de référence, à la conversion d'axes près entre l'espace de la scène
// du GLB et celui du maillage importé, que le composant déduit des positions de repos des 419 articulations (écrites ici).
//
// Usage : node scripts/unreal/export-horse-tack.mjs [--check]   (--check : compare au fichier versionné, code 1 si écart)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GLB = join(ROOT, 'public/real/horse_pjl.glb');
const ANCHORS = join(ROOT, 'unreal/StridesGrandTour/Content/Data/pjl_tack_anchors.json');
const PJL = join(ROOT, 'src/entities/pjlHorse.js');
const OUT = join(ROOT, 'unreal/StridesGrandTour/Content/Data/pjl_horse_tack.json');
const CHECK = process.argv.includes('--check');

// ---- Constantes relues dans pjlHorse.js (une seule occurrence de chaque motif).
const SRC = readFileSync(PJL, 'utf8');
function once(re, what) {
  const all = [...SRC.matchAll(new RegExp(re.source, 'g'))];
  if (all.length !== 1) throw new Error(`pjlHorse.js : ${what} trouvé ${all.length} fois (1 attendu)`);
  return all[0];
}
const CREST = JSON.parse(once(/const CREST = (\[[^\]]*\]);/, 'CREST')[1]);
const HIND_DOWN = Number(once(/const HIND_DOWN = ([0-9.]+);/, 'HIND_DOWN')[1]);
const SEAT_DAMP = Number(once(/this\.seatX = this\.seatX === undefined \? mid : damp\(this\.seatX, mid, ([0-9.]+), this\._dt \|\| 1 \/ 60\);/, 'lissage du recentrage')[1]);
const PITCH_DAMP = Number(once(/this\.dPitch = damp\(this\.dPitch \?\? 0, pitch - this\.pitch0, ([0-9.]+), this\._dt \|\| 1 \/ 60\);/, 'lissage du tangage')[1]);
const HIND_LAND = Number(once(/else if \(!this\.hindDown && this\.landT < ([0-9.]+)\) \{/, 'fenêtre de détection des postérieurs')[1]);
const LAND_T0 = Number(once(/this\.landT = ([0-9.]+);\n {4}this\.wasJump = false;/, 'landT initial')[1]);
once(/if \(this\.wasJump && !jumping\) this\.landT = 0;\n {4}this\.wasJump = jumping;\n {4}this\.landT \+= dt;/, 'horloge de réception');
once(/if \(H\.jumpT >= 0\) this\.hindDown = false;/, 'postérieurs levés au saut');
// Os lus par la règle du siège et par hindDown (noms de base du web, pjl/names.js retire le suffixe numérique).
once(/V\.boneWorld\('spine_04', _a\);/, 'os du garrot');
once(/V\.boneWorld\('pelvis', _b\);/, 'os du bassin');
once(/for \(const n of \['toes_02_l', 'toes_02_r'\]\) \{/, 'os des postérieurs');
once(/_e\.set\(-this\.dPitch, 0, V\.body\.rotation\.z, 'YXZ'\);/, 'orientation du siège');

// ---- GLB du web.
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(GLB);
const R = doc.getRoot();
const an = JSON.parse(readFileSync(ANCHORS, 'utf8'));
const node = R.listNodes().find((n) => n.getName() === an.body.mesh);
if (!node) throw new Error(`nœud ${an.body.mesh} absent du GLB`);
const skin = node.getSkin();
const joints = skin.listJoints();
if (joints.length !== an.body.bones) throw new Error(`${joints.length} articulations, ${an.body.bones} dans la page`);
const prim = node.getMesh().listPrimitives();
if (prim.length !== 1) throw new Error('un seul primitif attendu pour le corps');
const POS = prim[0].getAttribute('POSITION'), JNT = prim[0].getAttribute('JOINTS_0'), WGT = prim[0].getAttribute('WEIGHTS_0');
if (POS.getCount() !== an.body.vertexCount) throw new Error(`${POS.getCount()} sommets, ${an.body.vertexCount} dans la page`);
if (prim[0].getAttribute('JOINTS_1')) throw new Error('JOINTS_1 non prévu');
const IBM = skin.getInverseBindMatrices();
const bind = an.body.bindMatrix;
if (bind.some((v, i) => v !== (i % 5 === 0 ? 1 : 0))) throw new Error('bindMatrix non identité : non prévu');

// Matrices 4×4 en colonnes (convention glTF et three.js).
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
const W = joints.map((j) => j.getWorldMatrix());
const skinM = joints.map((_, k) => mul(W[k], IBM.getElement(k, [])));

// Contrôle : matrices inverses de liaison du GLB = celles relues dans la page.
let ibmDiff = 0;
for (const a of Object.values(an.anchors))
  for (const b of a.bones) {
    if (joints[b.index].getName() !== b.name) throw new Error(`os ${b.index} : ${joints[b.index].getName()} ≠ ${b.name}`);
    const m = IBM.getElement(b.index, []);
    for (let i = 0; i < 16; i++) ibmDiff = Math.max(ibmDiff, Math.abs(m[i] - b.boneInverse[i]));
  }
if (ibmDiff !== 0) throw new Error(`matrices inverses de liaison différentes de la page (${ibmDiff})`);

const used = new Map();  // indice d'articulation → rang dans la liste écrite
const boneRank = (k) => {
  if (!used.has(k)) used.set(k, used.size);
  return used.get(k);
};
// Influences d'un point : [rang de l'os, poids, qx, qy, qz]…
const influences = (p, idx, w) => {
  const out = [];
  for (let k = 0; k < 4; k++) {
    if (!(w[k] > 0)) continue;
    const q = apply(skinM[idx[k]], p);
    out.push(boneRank(idx[k]), w[k], q[0], q[1], q[2]);
  }
  return out;
};
const anchors = {};
for (const [n, a] of Object.entries(an.anchors)) anchors[n] = influences(a.p, a.bones.map((b) => b.index), a.bones.map((b) => b.w));
const vertexList = (ids) => ids.map((i) => influences(POS.getElement(i, []), JNT.getElement(i, []), WGT.getElement(i, [])));
const flankV = vertexList(an.flank.vertices);
const crestV = vertexList(an.crest.vertices);
const bonesOf = (names) => names.map((nm) => {
  const k = joints.findIndex((j) => j.getName().replace(/_\d+$/, '') === nm);
  if (k < 0) throw new Error(`os ${nm} absent`);
  return boneRank(k);
});
const [spine04, pelvis, toeL, toeR] = bonesOf(['spine_04', 'pelvis', 'toes_02_l', 'toes_02_r']);

// Articulations : toutes (repos, espace de la scène du GLB) pour la conversion d'axes ; les os utilisés d'abord, dans
// l'ordre des rangs ci-dessus.
const order = [...used.keys()];
for (let k = 0; k < joints.length; k++) if (!used.has(k)) order.push(k);
const jointsOut = order.map((k) => [joints[k].getName(), ...apply(W[k], [0, 0, 0])]);

// Contrôle : rest du web (pjlRest d'O1, repère du cheval) = groupe intérieur de la vue · Σ w · q (écrit dans le doc).
const inner = (p) => {
  const { scale: s, groundY, yaw } = an.asset;
  const c = Math.cos(-yaw), sn = Math.sin(-yaw);
  const x = p[0] * s, y = p[1] * s, z = p[2] * s;
  return [c * x + sn * z, y - groundY * s, -sn * x + c * z];
};
const restOf = (inf) => {
  const v = [0, 0, 0];
  for (let i = 0; i < inf.length; i += 5) for (let r = 0; r < 3; r++) v[r] += inf[i + 1] * inf[i + 2 + r];
  return inner(v);
};
const o1 = JSON.parse(readFileSync(join(ROOT, 'unreal/core/tests/oracles/monte/o1/E1.json'), 'utf8'));
const rest = {};
for (const n of ['ironL', 'ironR']) {
  const got = restOf(anchors[n]), want = o1.setup.pjlRest[n];
  rest[n] = Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]);
}

let srcTree = null;
try {
  srcTree = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD:src'], { encoding: 'utf8' }).trim();
} catch {
  srcTree = null;
}
const out = {
  schema: 'strides.pjl_horse_tack/1',
  generator: 'scripts/unreal/export-horse-tack.mjs',
  source: ['public/real/horse_pjl.glb', 'unreal/StridesGrandTour/Content/Data/pjl_tack_anchors.json', 'src/entities/pjlHorse.js', 'src/entities/pjl/view.js'],
  doc: 'sellerie du cheval WildMesh pour UStridesHorseTack (étape 5). Points en espace de la scène du GLB du web, pose de repos des nœuds : '
    + 'influences [rang de l’os dans joints, poids, qx, qy, qz]… avec q = W_repos · boneInverse · bindMatrix · p ; position posée = Σ poids · W_posé · W_repos⁻¹ · q '
    + '(pjl/view.js anchorWorld, applyBoneTransform). joints : [nom du nœud, position de repos] de toutes les articulations (os utilisés d’abord). '
    + 'inner : groupe intérieur de la vue (échelle, sol, lacet du modèle). flank, crest : profils de pjlHorse.js _flankUpdate (bande, tranches, sommets retenus). '
    + 'seat : lissages et os du siège (pjlHorse.js _attachRider). hind : postérieurs reposés (pjlHorse.js update). checks : contrôles de cohérence avec la page.',
  srcTree,
  inner: an.asset,
  usedBones: used.size,
  joints: jointsOut,
  bones: { spine04, pelvis, toeL, toeR },
  anchors,
  flank: { band: an.flank.band, profile: an.flank.profile, slices: an.flank.slices, vertices: flankV },
  crest: { profile: an.crest.profile, vertices: crestV },
  seat: { recenterDamp: SEAT_DAMP, pitchDamp: PITCH_DAMP },
  hind: { down: HIND_DOWN, within: HIND_LAND, landT0: LAND_T0 },
  crestConst: CREST,
  checks: { ibmMaxDiff: ibmDiff, restIronL: rest.ironL, restIronR: rest.ironR, flankVertices: flankV.length, crestVertices: crestV.length },
};
if (CREST[0] !== an.crest.profile[0] || CREST[1] !== an.crest.profile[1] || CREST[2] !== an.crest.profile[2]) throw new Error('CREST ≠ profil relu dans la page');
const text = JSON.stringify(out) + '\n';
if (CHECK) {
  const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
  console.log(`${OUT} : ${same ? 'identique' : 'DIFFÉRENT'}`);
  if (!same) process.exitCode = 1;
} else {
  const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
  if (!same) writeFileSync(OUT, text);
  console.log(`${OUT} : ${same ? 'inchangé' : 'écrit'} (${text.length} octets) ; ${used.size} os utilisés, ${flankV.length} + ${crestV.length} sommets ; repos ironL ${rest.ironL.toExponential(2)} m, ironR ${rest.ironR.toExponential(2)} m de pjlRest`);
}
