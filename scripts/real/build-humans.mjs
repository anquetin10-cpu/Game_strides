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

// Personnages : morphologie (poids des formes MakeHuman), cheveux, vêtements.
const CHARACTERS = {
  rider_f: {
    morphs: { gender_female: 1, muscle_max: 0.3, weight_min: 0.2, proportions_ideal: 0.6, breast_cup_min: 0.3, height_tall: 0.1 },
    hair: 'hair_ponytail01',
    clothes: ['clothing_shirt', 'clothing_jeans', 'clothing_boots'],
  },
  rider_m: {
    morphs: { gender_male: 1, muscle_max: 0.45, weight_min: 0.1, proportions_ideal: 0.6, height_tall: 0.25 },
    hair: 'hair_short02',
    clothes: ['clothing_shirt', 'clothing_jeans', 'clothing_boots'],
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
function refitSkeleton(doc, joints, weights) {
  const skin = doc.getRoot().listSkins()[0];
  const nodes = skin.listJoints();
  const target = {};
  for (const n of nodes) {
    const name = n.getName();
    const p = (joints.bones[name] || [0, 0, 0]).slice();
    for (const [m, w] of Object.entries(weights)) {
      const d = joints.morphs[m]?.[name];
      if (d && w) for (let k = 0; k < 3; k++) p[k] += w * d[k];
    }
    target[name] = p;
  }
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
    for (const zn of item?.hidesBodyZones || []) hidden |= zones.bodyZones[zn];
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
    for (const prim of mesh.listPrimitives()) {
      bakeMorphs(prim, names, w);
      if (mesh.getName() === 'base') culled += hideCoveredSkin(prim, hidden);
      prim.setAttribute('_CCZONE', null);
    }
    mesh.setWeights([]);
    mesh.setExtras({});
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
  const jw = {};
  for (const [k, v] of Object.entries(morphW)) jw[k] = v;
  for (const k of Object.keys(joints.morphs)) {
    const m = /^corr_(.+)__(.+)$/.exec(k);
    if (m && morphW[m[1]] && morphW[m[2]]) jw[k] = morphW[m[1]] * morphW[m[2]];
  }
  refitSkeleton(doc, joints, jw);
  await doc.transform(unpartition(), prune(), dedup(), reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }));
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${id}.glb`);
  await io.write(file, doc);
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  console.log(`${id}: ${(readFileSync(file).length / 1e6).toFixed(2)} Mo, ${tris} triangles, ${culled} triangles de peau masqués`);
}

for (const [id, cfg] of Object.entries(CHARACTERS)) await build(id, cfg);
