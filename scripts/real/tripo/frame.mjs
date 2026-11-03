// Cheval Tripo (essai) : repère du jeu et lecture de la source.
//
// Source : assets-src/horse-tripo/Cheval_Tripo_Optimise_Qualite.glb (maillage statique Tripo, 100 000 triangles,
// fourni par le porteur du projet). Unités natives : x vers la gauche du cheval, y vers le haut (0 aux semelles),
// z vers l'avant ; environ 0,246 × 0,738 × 0,980.
//
// Calage dans le repère du cheval du jeu (src/entities/horse/skeleton.js : mètres réels, x à gauche, y en haut, z en
// avant, origine au sol sous la selle) :
//   - échelle 2,72 : écart des sabots avant/arrière 1,36 m (jeu : 1,35 m), garrot ≈ 1,72 m (jeu : 1,65 m au garrot
//     osseux), ligne du dos à ±3 % de celle du cheval du jeu ;
//   - décalage en z de +0,253 m : milieu des sabots à l'aplomb de celui du cheval du jeu ; semelles à y = 0.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

export const SRC = 'assets-src/horse-tripo/Cheval_Tripo_Optimise_Qualite.glb';
export const SCALE = 2.72;
export const OFFSET = [0, 0, 0.253];

export async function makeIO() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

// Maillage source calé dans le repère du jeu : { positions, normals, uvs, indices } (copies), en mètres.
export function calibrated(prim) {
  const P0 = prim.getAttribute('POSITION').getArray();
  const positions = new Float32Array(P0.length);
  for (let i = 0; i < P0.length; i += 3) {
    positions[i] = P0[i] * SCALE + OFFSET[0];
    positions[i + 1] = P0[i + 1] * SCALE + OFFSET[1];
    positions[i + 2] = P0[i + 2] * SCALE + OFFSET[2];
  }
  return {
    positions,
    normals: new Float32Array(prim.getAttribute('NORMAL').getArray()),
    uvs: new Float32Array(prim.getAttribute('TEXCOORD_0').getArray()),
    indices: new Uint32Array(prim.getIndices().getArray()),
  };
}
