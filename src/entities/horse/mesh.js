// Assemblage d'un cheval : squelette, corps lisse (deux niveaux de détail), robe, crins et sellerie.
import * as THREE from 'three';
import { horseAssets } from './assets.js';
import { bakeCoatColors, createCoatMaterial, markings } from './coat.js';
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
  return { mesh, bones, skeleton };
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
  const r = horseAssets().body.lod[lod];
  mesh.geometry.setDrawRange(r[0], r[1]);
}
