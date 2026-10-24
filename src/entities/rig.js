// Maillage « rigide » animé par os : chaque pièce suit un os → un seul appel de dessin par personnage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { transformed, paint } from '../world/shapes.js';

export const SKIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });

export function buildRig(boneDefs, parts) {
  const bones = {};
  const list = [];
  for (const d of boneDefs) {
    const b = new THREE.Bone();
    b.name = d.name;
    b.position.set(d.pos[0], d.pos[1], d.pos[2]);
    bones[d.name] = b;
    list.push(b);
    if (d.parent) bones[d.parent].add(b);
  }
  const root = list[0];
  root.updateMatrixWorld(true);
  const geos = [];
  for (const [boneName, geo, color, tf] of parts) {
    const bone = bones[boneName];
    if (!bone) throw new Error(`Unknown bone ${boneName}`);
    const g = tf ? transformed(geo, tf) : geo.clone();
    g.applyMatrix4(bone.matrixWorld);
    paint(g, color);
    const n = g.attributes.position.count;
    const idx = list.indexOf(bone);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = idx;
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geos.push(g);
  }
  const geo = mergeGeometries(geos, false);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius *= 1.6;
  return { geo, bones, list, root };
}

export function makeSkinned(rig, material = SKIN_MAT) {
  const mesh = new THREE.SkinnedMesh(rig.geo, material);
  mesh.add(rig.root);
  mesh.bind(new THREE.Skeleton(rig.list));
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  // Rotations de repos (pour revenir proprement à la pose neutre).
  for (const b of rig.list) b.userData.rest = b.position.clone();
  return mesh;
}
