// Prototype « rendu réaliste » : prépare les personnages réalistes (cavalière, cavalier) à partir des fichiers CC0
// du projet CharacterCreator (corps MakeHuman, peau photographique, yeux, cils, cheveux, vêtements texturés,
// squelette « game_engine » de 53 os avec doigts), puis les écrit dans public/real/ (chargés à part par le jeu).
//
// Étapes : téléchargement (commit figé), fusion du corps, des cheveux et des vêtements sur un seul squelette,
// morphologie figée (femme ou homme, sportif), squelette recalé sur cette morphologie, peau masquée sous les
// vêtements, dents et langue retirées (bouche fermée), animations d'origine retirées (le jeu anime le personnage),
// compression des maillages (meshopt).
//
// Licences : fichiers générés CC0-1.0 (tous issus des ressources CC0 de MakeHuman), voir public/real/LICENSES.md.
// Usage : node scripts/real/build-humans.mjs
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, unpartition, meshopt, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { mat4, vec3 } from './mat.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = join(ROOT, 'node_modules/.cache/real-src');
const OUT = join(ROOT, 'public/real');
const SRC = 'https://raw.githubusercontent.com/kblood/CharacterCreator/852e48f316b90a0937234886630e4fb4cdfd1f78/output';

// Personnages : morphologie (poids des formes MakeHuman), cheveux, vêtements. La veste (concours) est affichée par le
// jeu selon la tenue : elle ne masque pas la peau (la chemise reste dessous).
const OPTIONAL = new Set(['clothing_jacket']);
const CHARACTERS = {
  rider_f: {
    morphs: { gender_female: 1, muscle_max: 0.3, weight_min: 0.2, proportions_ideal: 0.6, breast_cup_min: 0.3, height_tall: 0.1 },
    hair: 'hair_ponytail01',
    clothes: ['clothing_shirt', 'clothing_jeans', 'clothing_boots', 'clothing_jacket'],
  },
  rider_m: {
    morphs: { gender_male: 1, muscle_max: 0.45, weight_min: 0.1, proportions_ideal: 0.6, height_tall: 0.25 },
    hair: 'hair_short02',
    clothes: ['clothing_shirt', 'clothing_jeans', 'clothing_boots', 'clothing_jacket'],
  },
};

async function fetchSrc(name) {
  const p = join(CACHE, name);
  if (existsSync(p)) return p;
  mkdirSync(CACHE, { recursive: true });
  const r = await fetch(`${SRC}/${name}`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  return p;
}

// Poids effectifs : formes demandées + correctifs croisés (corr_a__b = a × b).
function weightsFor(names, base) {
  const w = names.map(() => 0);
  names.forEach((n, i) => {
    if (base[n] !== undefined) w[i] = base[n];
    const m = /^corr_(.+)__(.+)$/.exec(n);
    if (m && base[m[1]] && base[m[2]]) w[i] = base[m[1]] * base[m[2]];
  });
  return w;
}

// Applique les poids aux positions et normales puis retire toutes les formes.
function bakeMorphs(prim, names, weights) {
  for (const sem of ['POSITION', 'NORMAL']) {
    const a = prim.getAttribute(sem);
    if (!a) continue;
    const arr = a.getArray().slice();
    prim.listTargets().forEach((t, ti) => {
      const w = weights[ti];
      const d = t.getAttribute(sem);
      if (!w || !d) return;
      // Décalages quantifiés (entiers normalisés) : ramenés en mètres.
      const da = d.getArray();
      const ct = d.getComponentType();
      const q = !d.getNormalized() ? 1 : ct === 5122 ? 1 / 32767 : ct === 5120 ? 1 / 127 : ct === 5123 ? 1 / 65535 : ct === 5121 ? 1 / 255 : 1;
      for (let k = 0; k < arr.length; k++) arr[k] += w * da[k] * q;
    });
    if (sem === 'NORMAL') for (let k = 0; k < arr.length; k += 3) {
      const l = Math.hypot(arr[k], arr[k + 1], arr[k + 2]) || 1;
      arr[k] /= l; arr[k + 1] /= l; arr[k + 2] /= l;
    }
    a.setArray(arr);
  }
  for (const t of prim.listTargets()) { prim.removeTarget(t); t.dispose(); }
}

// Squelette recalé sur la morphologie : têtes des os = position de base + Σ poids × décalage (sidecar joints.json),
// rotations locales conservées, matrices de liaison recalculées.
// Poids des formes pour le squelette : formes demandées + correctifs croisés.
function jointWeights(joints, morphW) {
  const jw = { ...morphW };
  for (const k of Object.keys(joints.morphs)) {
    const m = /^corr_(.+)__(.+)$/.exec(k);
    if (m && morphW[m[1]] && morphW[m[2]]) jw[k] = morphW[m[1]] * morphW[m[2]];
  }
  return jw;
}
// Position de chaque os sur la morphologie choisie.
function jointTargets(joints, morphW) {
  const weights = jointWeights(joints, morphW);
  const target = {};
  for (const name of Object.keys(joints.bones)) {
    const p = joints.bones[name].slice();
    for (const [m, w] of Object.entries(weights)) {
      const d = joints.morphs[m]?.[name];
      if (d && w) for (let k = 0; k < 3; k++) p[k] += w * d[k];
    }
    target[name] = p;
  }
  return target;
}

function refitSkeleton(doc, joints, morphW) {
  const skin = doc.getRoot().listSkins()[0];
  const nodes = skin.listJoints();
  const all = jointTargets(joints, morphW);
  const target = {};
  for (const n of nodes) target[n.getName()] = all[n.getName()] || [0, 0, 0];
  // Ordre parent → enfant (les nœuds hors squelette gardent leur matrice).
  const world = new Map();
  const visit = (n, parentW) => {
    const name = n.getName();
    const r = n.getRotation(), s = n.getScale();
    let local = mat4.compose(n.getTranslation(), r, s);
    if (target[name]) {
      const t = vec3.transformMat4(target[name], mat4.invert(parentW));
      n.setTranslation(t);
      local = mat4.compose(t, r, s);
    }
    const w = mat4.multiply(parentW, local);
    world.set(n, w);
    for (const c of n.listChildren()) visit(c, w);
  };
  for (const scene of doc.getRoot().listScenes()) for (const n of scene.listChildren()) visit(n, mat4.identity());
  const ibm = skin.getInverseBindMatrices();
  const arr = new Float32Array(nodes.length * 16);
  nodes.forEach((n, i) => arr.set(mat4.invert(world.get(n)), i * 16));
  ibm.setArray(arr);
}

// Peau masquée sous les vêtements (attribut _CCZONE du corps : un triangle disparaît si ses trois sommets sont
// dans des zones couvertes).
function hideCoveredSkin(prim, mask) {
  const z = prim.getAttribute('_CCZONE');
  const idx = prim.getIndices();
  if (!z || !idx) return 0;
  const za = z.getArray(), ia = idx.getArray();
  const keep = [];
  for (let i = 0; i < ia.length; i += 3) {
    const hid = (v) => (za[v] & mask) !== 0;
    if (hid(ia[i]) && hid(ia[i + 1]) && hid(ia[i + 2])) continue;
    keep.push(ia[i], ia[i + 1], ia[i + 2]);
  }
  idx.setArray(new Uint32Array(keep));
  return (ia.length - keep.length) / 3;
}

// Bottes d'équitation : tige moulée sur la jambe (peau du corps de la cheville au-dessous du genou, poussée vers
// l'extérieur, mêmes poids de peau), évasée en haut ; pantalon rentré dans la botte (masqué sous la tige).
function ridingBootShafts(doc, bodyPrim, target, mat) {
  const P = bodyPrim.getAttribute('POSITION').getArray();
  const N = bodyPrim.getAttribute('NORMAL').getArray();
  const J = bodyPrim.getAttribute('JOINTS_0');
  const W = bodyPrim.getAttribute('WEIGHTS_0');
  const I = bodyPrim.getIndices().getArray();
  const knee = (target.calf_l[1] + target.calf_r[1]) / 2;
  const ankle = (target.foot_l[1] + target.foot_r[1]) / 2;
  const top = knee - 0.045, bottom = ankle - 0.03;
  const inside = (v) => P[v * 3 + 1] > bottom && P[v * 3 + 1] < top && Math.abs(P[v * 3]) > 0.02;
  const map = new Map();
  const idx = [];
  for (let t = 0; t < I.length; t += 3) {
    if (!inside(I[t]) || !inside(I[t + 1]) || !inside(I[t + 2])) continue;
    for (let k = 0; k < 3; k++) {
      const v = I[t + k];
      if (!map.has(v)) map.set(v, map.size);
      idx.push(map.get(v));
    }
  }
  const n = map.size;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const jn = new (J.getArray().constructor)(n * 4), wt = new Float32Array(n * 4);
  const ja = J.getArray(), wa = W.getArray();
  const wq = !W.getNormalized() ? 1 : W.getComponentType() === 5121 ? 1 / 255 : W.getComponentType() === 5123 ? 1 / 65535 : 1;
  for (const [v, i] of map) {
    const y = P[v * 3 + 1];
    // Épaisseur : cuir et pantalon dessous ; tige évasée sur les derniers centimètres.
    const off = 0.011 + 0.006 * Math.max(0, (y - (top - 0.06)) / 0.06);
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = P[v * 3 + k] + N[v * 3 + k] * off;
      nrm[i * 3 + k] = N[v * 3 + k];
    }
    for (let k = 0; k < 4; k++) {
      jn[i * 4 + k] = ja[v * 4 + k];
      wt[i * 4 + k] = wa[v * 4 + k] * wq;
    }
  }
  const buf = doc.getRoot().listBuffers()[0];
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buf))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(jn).setBuffer(buf))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(wt).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf))
    .setMaterial(mat);
  return { prim, top, tris: idx.length / 3 };
}

// Retire les triangles d'un vêtement entièrement sous une hauteur (rentré dans la botte).
function tuckBelow(prim, y) {
  const P = prim.getAttribute('POSITION').getArray();
  const idx = prim.getIndices();
  const ia = idx.getArray();
  const keep = [];
  for (let t = 0; t < ia.length; t += 3) {
    if (P[ia[t] * 3 + 1] < y && P[ia[t + 1] * 3 + 1] < y && P[ia[t + 2] * 3 + 1] < y) continue;
    keep.push(ia[t], ia[t + 1], ia[t + 2]);
  }
  idx.setArray(new Uint32Array(keep));
}

async function build(id, cfg) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const zones = JSON.parse(readFileSync(await fetchSrc('clothing.json'), 'utf8'));
  const joints = JSON.parse(readFileSync(await fetchSrc('base_body.joints.json'), 'utf8'));
  const doc = await io.read(await fetchSrc('base_body.glb'));
  const root = doc.getRoot();
  const bodySkin = root.listSkins()[0];
  const bodyJoints = bodySkin.listJoints();
  // Vêtements et cheveux : fusionnés puis liés au squelette du corps (mêmes noms d'os, même ordre).
  let hidden = 0;
  for (const part of [cfg.hair, ...cfg.clothes]) {
    const other = await io.read(await fetchSrc(`${part}.glb`));
    const before = new Set(root.listNodes());
    mergeDocuments(doc, other);
    for (const n of root.listNodes()) {
      if (before.has(n)) continue;
      const skin = n.getSkin();
      if (skin) {
        const names = skin.listJoints().map((j) => j.getName());
        if (names.join() !== bodyJoints.map((j) => j.getName()).join()) throw new Error(`${part}: squelette différent`);
        n.setSkin(bodySkin);
      }
    }
    const item = zones.items.find((it) => `clothing_${it.id}` === part);
    if (!OPTIONAL.has(part)) for (const zn of item?.hidesBodyZones || []) hidden |= zones.bodyZones[zn];
  }
  // Une seule scène : le squelette et les maillages du corps ; les copies de squelette des pièces fusionnées
  // disparaissent au nettoyage (plus référencées).
  const scenes = root.listScenes();
  const main = scenes[0];
  // Maillages des pièces fusionnées (souvent enfants de leur propre « Armature ») : rattachés à la scène principale.
  for (const n of root.listNodes()) {
    if (!n.getMesh() || main.listChildren().includes(n)) continue;
    const p = n.getParentNode();
    if (p) p.removeChild(n);
    main.addChild(n);
  }
  for (const s of scenes.slice(1)) s.dispose();
  for (const n of main.listChildren()) {
    if (!n.getMesh() && !bodyJoints.includes(n) && !n.listChildren().some((c) => bodyJoints.includes(c))) n.dispose();
  }
  // Morphologie figée, peau masquée, bouche fermée.
  const morphW = cfg.morphs;
  let culled = 0;
  for (const mesh of root.listMeshes()) {
    const names = mesh.getExtras()?.targetNames || [];
    const w = weightsFor(names, morphW);
    for (const prim of mesh.listPrimitives()) bakeMorphs(prim, names, w);
    mesh.setWeights([]);
    mesh.setExtras({});
  }
  // Bottes d'équitation (tige) sur la peau entière, avant de masquer la peau couverte.
  const bodyMesh = root.listMeshes().find((m) => m.getName() === 'base');
  const bootMat = doc.createMaterial('Cloth_tallboots').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.36).setMetallicFactor(0).setExtras({ tint: { default: '#121214', gain: 1 } });
  const jointsNow = jointTargets(joints, cfg.morphs);
  const shaft = ridingBootShafts(doc, bodyMesh.listPrimitives()[0], jointsNow, bootMat);
  bodyMesh.addPrimitive(shaft.prim);
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (mesh.getName() === 'base' && prim !== shaft.prim) culled += hideCoveredSkin(prim, hidden);
      if (/jeans/i.test(prim.getMaterial()?.getName() || '')) tuckBelow(prim, shaft.top - 0.02);
      prim.setAttribute('_CCZONE', null);
    }
  }
  for (const n of root.listNodes()) if (['Teeth', 'Tongue'].includes(n.getMesh()?.getName())) n.dispose();
  for (const a of root.listAnimations()) a.dispose();
  // Copies de squelette des pièces fusionnées : retirées avec tous leurs os.
  const keep = new Set(bodyJoints);
  const drop = (n) => {
    for (const c of n.listChildren()) drop(c);
    n.dispose();
  };
  for (const n of root.listNodes()) if (n.getName() === 'Root' && !keep.has(n)) drop(n);
  refitSkeleton(doc, joints, morphW);
  await doc.transform(unpartition(), prune(), dedup(), reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }));
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${id}.glb`);
  await io.write(file, doc);
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  console.log(`${id}: ${(readFileSync(file).length / 1e6).toFixed(2)} Mo, ${tris} triangles, ${culled} triangles de peau masqués, bottes ${shaft.tris} triangles`);
}

for (const [id, cfg] of Object.entries(CHARACTERS)) await build(id, cfg);
