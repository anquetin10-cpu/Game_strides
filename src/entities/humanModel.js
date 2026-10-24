// Personnages réalistes (cavaliers, grooms, passants) : maillage lisse skinné généré hors ligne (scripts/humans),
// trois niveaux de détail, matière PBR par zones, animation procédurale (marche, course, repos, gestes, équitation).
import * as THREE from 'three';
import { boneDefs, BIND_POSE, BONES, rigInfo } from './human/skeleton.js';
import { humanGeometry, LOD_COUNT } from './human/assets.js';
import { createHumanMaterial, applyPalette } from './human/material.js';
import { resolveOutfit, randomOutfit } from './human/outfits.js';
import { animateHuman as animate } from './human/anim.js';

export { randomOutfit };

export const OUTFITS = {
  rider: { sex: 'm', top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#f2f1ec', boots: '#121214', skin: '#dcab88', hair: '#5a3a24', helmet: '#16171a', logo: true },
  riderF: { sex: 'f', top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#f2f1ec', boots: '#121214', skin: '#e8bea0', hair: '#7a4a28', helmet: '#16171a', logo: true, ponytail: true, hairStyle: 'bun' },
  groom: { sex: 'f', top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#2b3442', boots: '#2a2622', skin: '#e8bea0', hair: '#5a3a24', logo: true, hairStyle: 'ponytail' },
  spectator: { top: '#2f5f8a', sleeve: '#2f5f8a', pants: '#2b3442', boots: '#3b2a1e', skin: '#dcab88', hair: '#3b2717' },
};

// Distances de bascule des niveaux de détail (m) : LOD0 < 11 m < LOD1 < 38 m < LOD2.
export const LOD_DIST = [11, 38];

/**
 * Crée le maillage skinné d'un personnage.
 * outfit : objet de tenue (voir OUTFITS) ; opts.name : prénom (déduction du sexe si non précisé).
 * Renvoie { mesh, bones } ; mesh.userData.human = { desc, rig, setLOD(i), lod }.
 */
export function createHumanMesh(outfit = OUTFITS.rider, opts = {}) {
  const desc = resolveOutfit(outfit, opts.name || '');
  const defs = boneDefs(desc.sex);
  const bones = {};
  const list = [];
  for (const d of defs) {
    const b = new THREE.Bone();
    b.name = d.name;
    b.position.set(d.pos[0], d.pos[1], d.pos[2]);
    bones[d.name] = b;
    list.push(b);
    if (d.parent) bones[d.parent].add(b);
  }
  const geo0 = humanGeometry(desc.body, desc.parts, 0);
  const near = createHumanMaterial(true);
  applyPalette(near, desc.zoneSlot, desc.slots);
  const mesh = new THREE.SkinnedMesh(geo0, near);
  mesh.add(list[0]);
  // Liaison dans la pose du maillage (bras en A), puis retour au repos.
  for (const [n, e] of Object.entries(BIND_POSE)) bones[n].rotation.set(e[0], e[1], e[2]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  for (const b of list) {
    b.rotation.set(0, 0, 0);
    b.userData.rest = b.position.clone();
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.35);
  mesh.scale.setScalar(desc.scale);
  let far = null;
  const lods = [geo0];
  const H = {
    desc,
    rig: rigInfo(desc.sex),
    lod: 0,
    near,
    setLOD(i) {
      if (i === H.lod) return;
      H.lod = i;
      if (!lods[i]) lods[i] = humanGeometry(desc.body, desc.parts, i);
      mesh.geometry = lods[i];
      if (i >= 2) {
        if (!far) far = createHumanMaterial(false, near.userData.uniforms);
        mesh.material = far;
      } else mesh.material = near;
    },
    triangles: (i = H.lod) => (lods[i] || humanGeometry(desc.body, desc.parts, i)).userData.triangles,
  };
  mesh.userData.human = H;
  Object.defineProperty(bones, '__rig', { value: { info: H.rig, desc, list, mesh }, enumerable: false });
  return { mesh, bones };
}

export const HUMAN_LODS = LOD_COUNT;
export { BONES };

/**
 * pose : 'stand' | 'walk' | 'run' | 'ride' | 'carry' | 'sit' | 'wave' | 'cheer' | 'clap' | 'idle'
 * st : { phase, speed, t, horseSpeed, horseGaitPhase, jump, lean, ... } (état conservé entre les images)
 */
export function animateHuman(B, pose, st, dt) {
  animate(B, pose, st, dt);
}
