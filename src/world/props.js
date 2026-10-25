// Accessoires réalistes : voitures (carrosseries profilées), tracteur avec chargeur, matériel d'écurie.
import * as THREE from 'three';
import { box, cyl, ico, prep } from './shapes.js';
import { partsToGeo } from './builders.js';
import { addCloudShadows } from './sky.js';

// Peinture automobile vernie (les pièces sombres jouent les vitres, les pneus restent mats grâce à leur teinte).
let _carMat = null;
export function carMaterial() {
  if (!_carMat) {
    _carMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
    _carMat.onBeforeCompile = (sh) => addCloudShadows(sh);
    _carMat.customProgramCacheKey = () => 'car-paint';
  }
  return _carMat;
}

// Profil latéral extrudé (x = longueur vers l'avant, y = hauteur), centré en largeur, longueur alignée sur +z.
function profile(points, width, bevel = 0.06, arches = null) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  if (arches) {
    // Bas de caisse d'avant en arrière avec passages de roues.
    const [xf, xr, r, y0] = arches;
    s.lineTo(xf + r + 0.06, y0);
    s.absarc(xf, y0 + 0.02, r + 0.06, 0, Math.PI, false);
    s.lineTo(xr + r + 0.06, y0);
    s.absarc(xr, y0 + 0.02, r + 0.06, 0, Math.PI, false);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.rotateY(-Math.PI / 2);
  return prep(g);
}

function wheel(r, w, rim = '#b9bcc0') {
  const parts = [];
  parts.push([cyl(r, r, w, 18, false), '#151517', { rz: Math.PI / 2 }]);
  parts.push([cyl(r * 0.62, r * 0.62, w + 0.02, 14, false), rim, { rz: Math.PI / 2 }]);
  parts.push([cyl(r * 0.18, r * 0.18, w + 0.05, 8, false), '#55585c', { rz: Math.PI / 2 }]);
  return parts;
}

export const CARS = {
  // Caisse jusqu'à la ceinture de caisse, pavillon vitré plus étroit (rentré), toit.
  sedan: { L: 4.45, W: 1.8, wb: 2.68, r: 0.31,
    body: [[-2.2, 0.32], [-2.24, 0.5], [-2.18, 0.86], [-1.9, 0.99], [-1.25, 1.03], [1.0, 1.03], [2.06, 0.9], [2.24, 0.62], [2.18, 0.32]],
    glass: [[-1.22, 1.0], [-0.62, 1.38], [0.45, 1.4], [1.04, 1.0]], roof: [[-0.66, 1.35], [-0.62, 1.44], [0.45, 1.45], [0.5, 1.36]] },
  hatch: { L: 4.0, W: 1.75, wb: 2.5, r: 0.3,
    body: [[-1.98, 0.32], [-2.02, 0.55], [-1.98, 1.02], [0.95, 1.03], [1.86, 0.9], [2.0, 0.62], [1.95, 0.32]],
    glass: [[-1.96, 1.0], [-1.78, 1.4], [0.32, 1.42], [0.98, 1.0]], roof: [[-1.8, 1.36], [-1.78, 1.47], [0.33, 1.48], [0.4, 1.38]] },
  suv: { L: 4.6, W: 1.88, wb: 2.75, r: 0.37,
    body: [[-2.28, 0.42], [-2.32, 0.62], [-2.28, 1.22], [1.15, 1.23], [2.1, 1.1], [2.3, 0.75], [2.25, 0.42]],
    glass: [[-2.22, 1.2], [-2.08, 1.68], [0.55, 1.7], [1.18, 1.2]], roof: [[-2.1, 1.64], [-2.08, 1.77], [0.56, 1.78], [0.62, 1.66]] },
};

// Voiture réaliste (≈ 3k triangles) : carrosserie profilée, pavillon vitré, toit, montants, roues, optiques.
// wheels = false : sans les roues (voitures en mouvement, roues animées à part).
export function carGeo(color, kind = 'sedan', { wheels = true } = {}) {
  const C = CARS[kind] || CARS.sedan;
  const parts = [];
  const hw = C.W / 2;
  const y0 = C.body[C.body.length - 1][1];
  parts.push([profile(C.body, C.W, 0.07, [C.wb / 2, -C.wb / 2, C.r, y0]), color, {}]);
  parts.push([profile(C.glass, C.W - 0.26, 0.04), '#121920', {}]);
  parts.push([profile(C.roof, C.W - 0.2, 0.04), color, {}]);
  // Montant central et rétroviseurs.
  const gy = C.glass[0][1];
  parts.push([box(C.W - 0.22, C.glass[2][1] - gy, 0.1), color, { y: gy, z: (C.glass[1][0] + C.glass[2][0]) / 2 - 0.1 }]);
  for (const s of [-1, 1]) {
    parts.push([box(0.2, 0.12, 0.1), color, { x: s * (hw + 0.06), y: gy + 0.02, z: C.glass[3][0] - 0.1 }]);
    if (wheels) for (const zw of [C.wb / 2, -C.wb / 2]) parts.push(...wheel(C.r, 0.22).map(([g, c, tf]) => [g, c, { ...tf, x: s * (hw - 0.14), y: C.r, z: zw }]));
    parts.push([box(0.42, 0.13, 0.06), '#e9ecef', { x: s * (hw - 0.32), y: C.body[C.body.length - 2][1] - 0.12, z: C.L / 2 - 0.06 }]);
    parts.push([box(0.38, 0.12, 0.05), '#9d1f1f', { x: s * (hw - 0.3), y: C.body[2][1] - 0.12, z: -C.L / 2 + 0.06 }]);
  }
  // Calandre et plaques.
  parts.push([box(0.9, 0.18, 0.04), '#1b1c1f', { y: C.body[C.body.length - 2][1] - 0.32, z: C.L / 2 - 0.02 }]);
  parts.push([box(0.52, 0.11, 0.02), '#f2f1ec', { y: y0 + 0.1, z: C.L / 2 + 0.02 }]);
  parts.push([box(0.52, 0.11, 0.02), '#f2f1ec', { y: y0 + 0.24, z: -C.L / 2 - 0.02 }]);
  return partsToGeo(parts);
}

// Roue de rayon 1 (axe selon x), mise à l'échelle par véhicule : pneu, jante à rayons, moyeu.
export function unitWheelGeo() {
  const parts = wheel(1, 0.72, '#2c2f33');
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push([box(0.76, 0.46, 0.11, false), '#c4c7cb', { y: Math.cos(a) * 0.38, z: Math.sin(a) * 0.38, rx: a }]);
  }
  parts.push([cyl(0.2, 0.2, 0.78, 10, false), '#c4c7cb', { rz: Math.PI / 2 }]);
  return partsToGeo(parts);
}

// Tracteur agricole (≈ 110 ch) avec chargeur frontal et godet.
export function tractorGeo(color = '#a3271f') {
  const parts = [];
  // Châssis, capot profilé, calandre.
  parts.push([box(0.9, 0.5, 3.3), '#2b2c30', { y: 0.55, z: 0.25 }]);
  parts.push([profile([[-0.2, 1.0], [-0.2, 1.62], [1.6, 1.58], [2.05, 1.38], [2.1, 0.95]], 0.95, 0.06), color, {}]);
  parts.push([box(0.86, 0.6, 0.06), '#1b1c1f', { y: 0.98, z: 2.13 }]);
  // Cabine : montants, toit, vitrage.
  parts.push([box(1.5, 0.12, 1.6), color, { y: 2.85, z: -0.85 }]);
  for (const sx of [-0.72, 0.72]) for (const sz of [-1.6, -0.12]) parts.push([box(0.07, 1.3, 0.07), '#1b1c1f', { x: sx, y: 1.55, z: sz }]);
  parts.push([box(1.42, 1.25, 1.44), '#1a2229', { y: 1.58, z: -0.86 }]);
  parts.push([box(1.4, 0.35, 1.45), color, { y: 1.22, z: -0.86 }]);
  parts.push([cyl(0.06, 0.06, 1.2, 8), '#2b2c30', { x: 0.35, y: 1.6, z: 1.15 }]);
  // Roues arrière (crampons en chevrons) et avant.
  for (const s of [-1, 1]) {
    parts.push(...wheel(0.82, 0.52, '#c9c2b0').map(([g, c, tf]) => [g, c, { ...tf, x: s * 1.0, y: 0.82, z: -0.95 }]));
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      parts.push([box(0.24, 0.08, 0.1, false), '#151517', { x: s * (1.0 + 0.12 * ((k % 2) * 2 - 1) * 0.5), y: 0.82 + Math.sin(a) * 0.84, z: -0.95 + Math.cos(a) * 0.84, rx: -a, ry: s * 0.4 * ((k % 2) * 2 - 1) }]);
    }
    parts.push(...wheel(0.52, 0.36, '#c9c2b0').map(([g, c, tf]) => [g, c, { ...tf, x: s * 0.92, y: 0.52, z: 1.55 }]));
    // Ailes.
    parts.push([box(0.62, 0.06, 1.3), color, { x: s * 1.0, y: 1.72, z: -0.95 }]);
    parts.push([box(0.4, 0.05, 0.75), '#1b1c1f', { x: s * 0.92, y: 1.08, z: 1.55 }]);
    // Bras du chargeur.
    parts.push([box(0.12, 0.2, 2.6, false), '#55585c', { x: s * 0.62, y: 1.45, z: 1.35, rx: 0.32 }]);
  }
  // Godet.
  parts.push([box(2.1, 0.55, 0.7), '#55585c', { y: 0.12, z: 3.1 }]);
  parts.push([box(2.1, 0.06, 0.8), '#3d4044', { y: 0.06, z: 3.15 }]);
  return partsToGeo(parts);
}

// Abreuvoir galvanisé ovale.
export function troughGeo() {
  const g = new THREE.CylinderGeometry(0.62, 0.55, 0.62, 24, 1, true);
  g.scale(2.0, 1, 1);
  return partsToGeo([
    [prep(g), '#a8adb2', { y: 0.31 }],
    [prep(new THREE.CircleGeometry(0.6, 24).rotateX(-Math.PI / 2).scale(2.0, 1, 1)), '#2a3638', { y: 0.5 }],
    [box(2.6, 0.06, 1.3), '#8e9398', { y: 0.0 }],
  ]);
}

// Montoir en bois (trois marches).
export function mountingBlockGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) parts.push([box(0.9, 0.22 * (i + 1), 0.35), '#8a6a4b', { z: -0.35 * i }]);
  return partsToGeo(parts);
}

// Brouette.
export function wheelbarrowGeo() {
  return partsToGeo([
    [cyl(0.55, 0.35, 0.42, 12, false), '#2f5a7a', { y: 0.62, z: 0.1, rx: 0.12, sx: 1.25 }],
    [cyl(0.18, 0.18, 0.08, 14, false), '#151517', { y: 0.18, z: 0.75, rz: Math.PI / 2 }],
    [box(0.04, 0.04, 1.4, false), '#55585c', { x: -0.3, y: 0.45, z: -0.25, rx: -0.12 }],
    [box(0.04, 0.04, 1.4, false), '#55585c', { x: 0.3, y: 0.45, z: -0.25, rx: -0.12 }],
    [box(0.04, 0.35, 0.04), '#55585c', { x: -0.3, z: -0.3 }],
    [box(0.04, 0.35, 0.04), '#55585c', { x: 0.3, z: -0.3 }],
  ]);
}

// Fumière : murs béton en U et tas de fumier pailleux.
export function muckHeapGeo() {
  const parts = [];
  parts.push([box(7, 1.6, 0.25), '#a29f97', { z: -3 }]);
  parts.push([box(0.25, 1.6, 6), '#a29f97', { x: -3.4 }]);
  parts.push([box(0.25, 1.6, 6), '#a29f97', { x: 3.4 }]);
  parts.push([box(7, 0.12, 6.2), '#8f8c84', {}]);
  for (let i = 0; i < 7; i++) {
    parts.push([ico(1.4 + (i % 3) * 0.3, 1), i % 2 ? '#4a3a29' : '#5a4732', { x: -2.2 + i * 0.75, y: 0.4, z: -1.2 + ((i * 5) % 3) * 0.6, sy: 0.55 }]);
  }
  return partsToGeo(parts);
}

// Balles rondes enrubannées (film plastique) et de paille.
export function wrappedBaleGeo(film = '#2e3a2f') {
  const g = new THREE.CylinderGeometry(0.72, 0.72, 1.2, 20, 1);
  g.rotateZ(Math.PI / 2);
  return partsToGeo([[prep(g), film, { y: 0.72 }]]);
}
