// Aménagements achetés pour l'Écurie du Val (application « Mon écurie ») : construits dans le monde dès qu'ils
// figurent dans la sauvegarde (au lancement, après un achat) et retirés si la partie recommence.
import * as THREE from 'three';
import { box, cyl, compose, gableRoof } from './shapes.js';
import { signTexture } from './textures.js';

// Aire de pansage couverte : dans la cour, entre l'abreuvoir et la grange.
export const AIRE = { x: -131, z: 178, w: 6, d: 4, rot: 0 };

function buildAire(game) {
  const a = AIRE;
  const y = game.terrain.getHeight(a.x, a.z);
  const hw = a.w / 2, hd = a.d / 2;
  const posts = [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]];
  const parts = [
    // Sol en tapis caoutchouc sur dalle, barres d'attache et anneaux.
    [box(a.w + 0.4, 0.08, a.d + 0.4), '#8f8a80', { y: 0 }],
    [box(a.w - 0.2, 0.04, a.d - 0.2), '#26272a', { y: 0.08 }],
    ...posts.map(([x, z]) => [box(0.16, 2.7, 0.16), '#6b4a2e', { x, z }]),
    [box(a.w, 0.18, 0.12), '#5d3f27', { y: 2.62, z: -hd }],
    [box(a.w, 0.18, 0.12), '#5d3f27', { y: 2.62, z: hd }],
    [box(0.08, 0.08, a.d), '#9a9da2', { x: -hw + 0.05, y: 1.45 }],
    [box(0.08, 0.08, a.d), '#9a9da2', { x: hw - 0.05, y: 1.45 }],
    [cyl(0.05, 0.05, 0.02, 10), '#c9ccd0', { x: -hw + 0.12, y: 1.5, z: 0 }],
    [cyl(0.05, 0.05, 0.02, 10), '#c9ccd0', { x: hw - 0.12, y: 1.5, z: 0 }],
    // Coffre de pansage et seau.
    [box(0.9, 0.5, 0.45), '#1b1c1f', { x: -hw + 0.7, y: 0.1, z: hd - 0.35 }],
    [cyl(0.16, 0.13, 0.3, 10), '#3a6b8a', { x: hw - 0.6, y: 0.1, z: hd - 0.4 }],
  ];
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const frame = new THREE.Mesh(compose(parts), mat);
  frame.castShadow = frame.receiveShadow = true;
  group.add(frame);
  const roof = new THREE.Mesh(gableRoof(a.w + 0.6, 0.9, a.d + 0.8, 0.3), new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.7, metalness: 0.2 }));
  roof.position.y = 2.72;
  roof.castShadow = roof.receiveShadow = true;
  group.add(roof);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.32), new THREE.MeshStandardMaterial({ map: signTexture('AIRE DE PANSAGE', '', { dark: true, w: 1024, h: 148 }) }));
  sign.position.set(0, 2.45, -hd - 0.08);
  sign.rotation.y = Math.PI;
  group.add(sign);
  group.position.set(a.x, y, a.z);
  group.rotation.y = a.rot;
  game.scene.add(group);
  const cols = posts.map(([x, z]) => game.colliders.addBox(a.x + x, a.z + z, 0.12, 0.12, a.rot, y + 2.7, 'aire'));
  return () => {
    game.scene.remove(group);
    frame.geometry.dispose();
    roof.geometry.dispose();
    for (const c of cols) c.enabled = false;
  };
}

// Construit (une seule fois) les aménagements possédés, retire ceux qui ne le sont plus.
export function buildStableUpgrades(game) {
  const owned = game.save.data.upgrades;
  game._builtUpgrades ||= {};
  const built = game._builtUpgrades;
  if (owned.includes('aire') && !built.aire) built.aire = buildAire(game);
  for (const id of Object.keys(built)) {
    if (!owned.includes(id)) {
      built[id]();
      delete built[id];
    }
  }
}
