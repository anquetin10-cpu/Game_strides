// Assemblage d'un cheval : squelette, corps lisse (deux niveaux de détail), robe, crins et sellerie.
import * as THREE from 'three';
import { horseAssets } from './assets.js';
import { bakeCoatColors, createCoatMaterial, markings } from './coat.js';
import { hairMaterial } from './hair.js';
import { tackMaterial, tackIndex } from './tack.js';
import { mulberry32 } from '../../core/math.js';

const _id = new THREE.Matrix4();
let seedCounter = 1;

// Libération : seuls les attributs propres à ce cheval sont détruits, jamais les tampons partagés.
export function safeDispose(geo, own = ['color']) {
  geo.dispose = function () {
    for (const k of Object.keys(this.attributes)) if (!own.includes(k)) this.deleteAttribute(k);
    this.setIndex(null);
    THREE.BufferGeometry.prototype.dispose.call(this);
  };
}

// Os : positions locales = position de repos - position du parent (rotations de repos nulles).
export function buildBones(assets) {
  const bones = {};
  const list = [];
  const rest = {};
  for (const b of assets.bones) rest[b.name] = b.pos;
  for (const b of assets.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    const pp = b.parent ? rest[b.parent] : [0, 0, 0];
    bone.position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
    bone.userData.rest = bone.position.clone();
    bones[b.name] = bone;
    list.push(bone);
    if (b.parent) bones[b.parent].add(bone);
  }
  const inverses = assets.bones.map((b) => new THREE.Matrix4().makeTranslation(-b.pos[0], -b.pos[1], -b.pos[2]));
  return { bones, list, inverses, root: bones.root };
}

/**
 * opts : { coat, blaze, socks, saddle, pad, padTrim, seed }
 */
export function buildHorseMesh(opts = {}) {
  const A = horseAssets();
  const rnd = mulberry32(opts.seed ?? (seedCounter++ * 7919 + 13));
  const { bones, list, inverses, root } = buildBones(A);
  const skeleton = new THREE.Skeleton(list, inverses);
  // Corps : attributs partagés, couleurs de robe propres à ce cheval.
  const B = A.body;
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'aExtra']) geo.setAttribute(k, B[k]);
  geo.setIndex(B.index);
  geo.setAttribute('color', new THREE.BufferAttribute(bakeCoatColors(A, opts.coat), 3, true));
  geo.setDrawRange(B.lod[0][0], B.lod[0][1]);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.25, 0.15), 2.4);
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.2, -1.6), new THREE.Vector3(1.2, 2.8, 2.2));
  safeDispose(geo);
  const mk = markings(opts, rnd);
  const material = createCoatMaterial(A, opts.coat, mk);
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(root);
  mesh.bind(skeleton, _id);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  mesh.userData.bones = bones;
  mesh.userData.lod = 0;
  mesh.userData.markings = mk;
  mesh.userData.parts = [];
  mesh.userData.ownMaterials = [material];
  // Matériau remplacé de l'extérieur (ex. statue de bronze) : les crins et la sellerie le partagent.
  let current = material;
  Object.defineProperty(mesh, 'material', {
    configurable: true,
    get: () => current,
    set: (m) => {
      current = m;
      if (m !== material) for (const p of mesh.userData.parts) p.material = m;
    },
  });
  // Crins (crinière, toupet, queue, cils).
  if (A.hair) {
    const H = A.hair;
    const hg = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight']) hg.setAttribute(k, H[k]);
    hg.setIndex(H.index);
    hg.setDrawRange(H.lod[0][0], H.lod[0][1]);
    safeDispose(hg, []);
    mesh.userData.hair = attachPart(mesh, hg, hairMaterial(opts.coat));
  }
  // Sellerie (sellé : tapis, selle, sangle, étriers, filet, rênes ; sinon licol).
  if (A.tack) {
    const T = A.tack;
    const tg = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'aMat', 'skinIndex', 'skinWeight']) tg.setAttribute(k, T[k]);
    const cfg = { saddle: opts.saddle !== false, mounted: false, boots: opts.boots ?? opts.saddle !== false };
    tg.setIndex(tackIndex(T, cfg));
    safeDispose(tg, []);
    const part = attachPart(mesh, tg, tackMaterial(opts.pad, opts.padTrim));
    part.userData.cfg = cfg;
    mesh.userData.tack = part;
  }
  return { mesh, bones, skeleton };
}

/** Change l'équipement : { saddle, mounted, boots } (seuls les champs fournis changent). */
export function setHorseTack(mesh, cfg) {
  const part = mesh.userData.tack;
  if (!part) return;
  const c = part.userData.cfg;
  const next = { saddle: cfg.saddle ?? c.saddle, mounted: cfg.mounted ?? c.mounted, boots: cfg.boots ?? c.boots };
  if (next.saddle === c.saddle && next.mounted === c.mounted && next.boots === c.boots) return;
  part.userData.cfg = next;
  part.geometry.setIndex(tackIndex(horseAssets().tack, next));
}

// Ajoute une pièce skinnée (crins, sellerie) partageant le squelette du cheval.
export function attachPart(horseMesh, geo, material, { shadow = true } = {}) {
  const part = new THREE.SkinnedMesh(geo, material);
  part.bind(horseMesh.skeleton, _id);
  part.castShadow = shadow;
  part.receiveShadow = true;
  geo.boundingSphere = horseMesh.geometry.boundingSphere;
  geo.boundingBox = horseMesh.geometry.boundingBox;
  horseMesh.add(part);
  horseMesh.userData.parts.push(part);
  return part;
}

// Bascule de niveau de détail (0 : proche, 1 : lointain).
export function setHorseLod(mesh, lod) {
  if (mesh.userData.lod === lod) return;
  mesh.userData.lod = lod;
  const A = horseAssets();
  const r = A.body.lod[lod];
  mesh.geometry.setDrawRange(r[0], r[1]);
  const h = mesh.userData.hair;
  if (h && A.hair) h.geometry.setDrawRange(A.hair.lod[lod][0], A.hair.lod[lod][1]);
  for (const p of mesh.userData.parts) if (p.userData.lodRanges) p.geometry.setDrawRange(...p.userData.lodRanges[lod]);
}
