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

// Arrondi des arêtes d'un profil (découpe des coins de Chaikin), extrémités conservées (bas de caisse droit).
function chaikin(pts, iters = 2) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      q.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// Profil latéral extrudé (x = longueur vers l'avant, y = hauteur), centré en largeur, longueur alignée sur +z.
// smooth : nombre de passes d'arrondi des arêtes (capot, pare-brise, pavillon).
function profile(points, width, bevel = 0.06, arches = null, smooth = 0) {
  if (smooth) points = chaikin(points, smooth);
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

// Copies de modèles de série réels (sans logo ni nom de marque à l'écran), aux cotes des fiches techniques :
// longueur, empattement, porte-à-faux, hauteur, largeur, pneus. Repère : origine au milieu de l'empattement, au sol,
// x = longueur (avant +), y = hauteur. body : caisse jusqu'à la ceinture ; glass : pavillon vitré (de la lunette
// arrière au pied du pare-brise) ; roof : toit. head / tail : optiques ; look : détails propres au modèle.
const car = (c) => {
  c.L = c.ohF + c.wb + c.ohR;
  c.tipF = c.wb / 2 + c.ohF;
  c.tipR = -(c.wb / 2 + c.ohR);
  c.zc = (c.tipF + c.tipR) / 2;
  return c;
};
export const CARS = {
  // Citadine 5 portes type Clio V : 4,05 m, empattement 2,583 m, 1,44 m de haut, 1,798 m de large, 195/55 R16.
  // Ceinture de caisse montante, hayon court, optiques à signature en « C ».
  clio: car({ W: 1.798, wb: 2.583, ohF: 0.85, ohR: 0.617, r: 0.31,
    body: [[-1.87, 0.3], [-1.91, 0.46], [-1.9, 0.7], [-1.85, 0.96], [-1.0, 0.99], [0.0, 0.96], [1.12, 0.91], [1.7, 0.83], [2.02, 0.7], [2.12, 0.56], [2.14, 0.4], [2.08, 0.28]],
    glass: [[-1.83, 0.95], [-1.64, 1.3], [-1.35, 1.38], [0.38, 1.42], [1.12, 0.9]],
    roof: [[-1.72, 1.31], [-1.68, 1.4], [-1.35, 1.425], [0.36, 1.44], [0.44, 1.39]],
    head: { y: 0.64, h: 0.12, x0: 0.42, x1: 0.84 }, tail: { y: 0.78, h: 0.13, x0: 0.5, x1: 0.85 },
    look: { drl: 'c', tailSig: 'c', grille: { w: 1.0, y: 0.44, h: 0.16 }, upper: { w: 0.7, y: 0.62, h: 0.05 } } }),
  // Compacte 5 portes type Golf 8 : 4,284 m, empattement 2,636 m, 1,456 m, 1,789 m, 205/55 R16.
  // Large montant arrière, phares effilés reliés par un bandeau lumineux sur la calandre.
  golf: car({ W: 1.789, wb: 2.636, ohF: 0.87, ohR: 0.778, r: 0.316,
    body: [[-2.05, 0.3], [-2.1, 0.48], [-2.09, 0.74], [-2.03, 0.97], [-1.2, 0.99], [0.0, 0.98], [1.18, 0.94], [1.75, 0.85], [2.07, 0.72], [2.17, 0.56], [2.19, 0.4], [2.13, 0.29]],
    glass: [[-2.0, 0.97], [-1.8, 1.33], [-1.45, 1.41], [0.4, 1.44], [1.18, 0.94]],
    roof: [[-1.86, 1.34], [-1.82, 1.42], [-1.45, 1.445], [0.38, 1.46], [0.46, 1.41]],
    head: { y: 0.7, h: 0.08, x0: 0.36, x1: 0.85 }, tail: { y: 0.86, h: 0.1, x0: 0.25, x1: 0.86 },
    look: { drl: 'bar', tailSig: 'wide', cPillar: true, grille: { w: 1.1, y: 0.36, h: 0.2 }, upper: { w: 0.72, y: 0.66, h: 0.06 } } }),
  // Berline fastback type 508 II : 4,75 m, empattement 2,793 m, 1,403 m, 1,859 m, 235/45 R18.
  // Capot long, vitres sans encadrement, feux de jour verticaux « crocs », bandeau arrière noir à trois griffes.
  p508: car({ W: 1.859, wb: 2.793, ohF: 0.91, ohR: 1.047, r: 0.335,
    body: [[-2.4, 0.29], [-2.45, 0.46], [-2.44, 0.72], [-2.36, 0.9], [-1.6, 0.96], [-0.4, 0.92], [1.25, 0.86], [1.85, 0.78], [2.17, 0.66], [2.28, 0.52], [2.31, 0.38], [2.25, 0.27]],
    glass: [[-2.3, 0.9], [-1.25, 1.3], [-0.45, 1.38], [0.4, 1.38], [1.25, 0.86]],
    roof: [[-1.3, 1.3], [-1.24, 1.39], [-0.45, 1.405], [0.38, 1.4], [0.45, 1.35]],
    head: { y: 0.64, h: 0.07, x0: 0.52, x1: 0.88 }, tail: { y: 0.78, h: 0.12, x0: 0.0, x1: 0.9 },
    look: { drl: 'fang', tailSig: 'claw-band', grille: { w: 1.2, y: 0.3, h: 0.3 }, frameless: true } }),
  // SUV type 3008 II : 4,447 m, empattement 2,675 m, porte-à-faux 0,923 / 0,849 m, 1,624 m, 1,841 m, 225/55 R18.
  // Capot haut et horizontal, toit noir flottant, calandre à damier, feux arrière à trois griffes, protections noires.
  p3008: car({ W: 1.841, wb: 2.675, ohF: 0.923, ohR: 0.849, r: 0.352,
    body: [[-2.14, 0.4], [-2.19, 0.58], [-2.18, 0.86], [-2.1, 1.12], [-1.2, 1.15], [0.0, 1.13], [1.35, 1.08], [1.85, 1.02], [2.14, 0.92], [2.25, 0.72], [2.26, 0.52], [2.2, 0.38]],
    glass: [[-2.05, 1.12], [-1.88, 1.48], [-1.6, 1.57], [0.62, 1.58], [1.35, 1.08]],
    roof: [[-1.92, 1.48], [-1.88, 1.58], [-1.6, 1.61], [0.6, 1.62], [0.68, 1.55]],
    head: { y: 0.86, h: 0.1, x0: 0.5, x1: 0.88 }, tail: { y: 0.92, h: 0.13, x0: 0.45, x1: 0.88 },
    look: { drl: 'under', tailSig: 'claw', grille: { w: 1.0, y: 0.6, h: 0.28, check: true }, cladding: true, roofColor: '#121316' } }),
  // SUV 4x4 type Duster II : 4,341 m, empattement 2,676 m, porte-à-faux 0,822 / 0,843 m, 1,682 m (barres), 1,804 m,
  // 215/60 R17. Caisse droite, barres de toit, sabots avant et arrière, protections de passages de roues, feux en « Y ».
  duster: car({ W: 1.804, wb: 2.676, ohF: 0.822, ohR: 0.843, r: 0.345,
    body: [[-2.14, 0.42], [-2.18, 0.6], [-2.18, 0.92], [-2.12, 1.12], [-1.2, 1.14], [0.0, 1.13], [1.3, 1.1], [1.8, 1.05], [2.08, 0.98], [2.15, 0.78], [2.16, 0.56], [2.1, 0.4]],
    glass: [[-2.08, 1.12], [-1.98, 1.52], [-1.75, 1.58], [0.62, 1.59], [1.3, 1.1]],
    roof: [[-2.02, 1.52], [-1.98, 1.61], [-1.75, 1.63], [0.6, 1.63], [0.68, 1.57]],
    head: { y: 0.86, h: 0.13, x0: 0.5, x1: 0.86 }, tail: { y: 0.98, h: 0.16, x0: 0.6, x1: 0.88 },
    look: { drl: 'y', tailSig: 'y', grille: { w: 0.95, y: 0.78, h: 0.2, bars: true }, cladding: true, skid: true, roofBars: true } }),
};
// Teintes d'origine des modèles (catalogues constructeurs).
export const CAR_COLORS = {
  clio: ['#d4571c', '#2e4a6b', '#eef0ef', '#8a8d90', '#a5161c'],
  golf: ['#f0f0ee', '#8e9295', '#1d2c44', '#111213'],
  p508: ['#8e0f1a', '#a9adb0', '#2a4b7c', '#121214', '#ece9e2'],
  p3008: ['#2b4f86', '#a9adb0', '#ece9e2', '#121214', '#d45e1f'],
  duster: ['#c8611f', '#6e7172', '#59603f', '#2e4a6b', '#eef0ef'],
};
export const CAR_MODELS = Object.keys(CARS);

// Vitrage teinté des véhicules conduisibles (on devine le conducteur et l'habitacle).
let _glassMat = null;
export function glassMaterial() {
  // Double face : les vitres latérales (fonds de l'extrusion du profil) sont tournées vers l'intérieur.
  _glassMat ||= new THREE.MeshPhysicalMaterial({ color: '#16222a', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.74, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, side: THREE.DoubleSide });
  return _glassMat;
}

// Effilement en plan de la caisse (coins avant et arrière arrondis vus de dessus) : facteur de largeur au point z.
export function carTaper(C, z) {
  const f0 = C.wb / 2 - 0.1, r0 = -C.wb / 2 + 0.1;
  if (z > f0) return 1 - 0.13 * ((z - f0) / (C.tipF - f0)) ** 2;
  if (z < r0) return 1 - 0.09 * ((r0 - z) / (r0 - C.tipR)) ** 2;
  return 1;
}
// Déforme une pièce extrudée : effilement en plan, galbe des flancs (épaules rentrées) et rentré du pavillon
// (tumblehome : les vitres latérales s'inclinent vers l'intérieur en montant).
function shapeBody(g, C, { y0 = 0, y1 = 10, tumble = 0, shoulder = 0 } = {}) {
  // Normales transformées (inverse de l'échelle en x) : les arêtes vives de l'extrusion restent nettes.
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let k = carTaper(C, z);
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    k *= 1 - tumble * t - shoulder * t * t;
    p.setX(i, x * k);
    const nx = n.getX(i) / k, ny = n.getY(i), nz = n.getZ(i), l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}

// Montant central, montant arrière, pied de pare-brise (z) d'un modèle.
export function carPillars(C) {
  const zA = C.glass[C.glass.length - 1][0] - 0.06;
  const zB = zA - 1.12;
  const zR = Math.max(C.glass[0][0] + 0.3, -C.wb / 2 + C.r + 0.12);
  return { zA, zB, zR };
}

// Voiture réaliste : carrosserie profilée aux cotes du modèle, pavillon vitré, toit, montants, joints de portières et
// poignées, boucliers, calandre et optiques à la signature du modèle, détails (barres de toit, sabots, protections).
// wheels = false : sans les roues (voitures en mouvement, roues animées à part).
// split = true : renvoie { body, glass } — vitrage à part (matériau transparent) et habitacle (sièges, planche de bord,
// volant à gauche) pour les véhicules conduisibles.
export function carGeo(color, kind = 'clio', { wheels = true, split = false } = {}) {
  const C = CARS[kind] || CARS.clio;
  const K = C.look;
  const parts = [];
  const glassParts = split ? [] : parts;
  const hw = C.W / 2;
  const y0 = C.body[C.body.length - 1][1];
  const dark = '#141517', black = '#0d0e10', plastic = '#1c1d20', chrome = '#b7bbbf';
  const LIGHT = '#f4f6f8', DRL = '#ffffff', RED = '#b3141a', REDDARK = '#5a0b0e';
  // Position (z du centre) d'une pièce d'épaisseur t posée sur le bout de la caisse (s = 1 avant, -1 arrière)
  // entre les hauteurs ya et yb : elle dépasse de e du profil, arrondi du bevel (0,07) compris.
  const onTip = (s, ya, yb, t, e = 0.012) => {
    let m = 0;
    for (let i = 0; i < C.body.length - 1; i++) {
      const [xa, ha] = C.body[i], [xb, hb] = C.body[i + 1];
      const lo = Math.max(ya, Math.min(ha, hb)), hi = Math.min(yb, Math.max(ha, hb));
      if (lo > hi) continue;
      for (const y of [lo, hi]) m = Math.max(m, s * (ha === hb ? (s > 0 ? Math.max(xa, xb) : Math.min(xa, xb)) : xa + ((xb - xa) * (y - ha)) / (hb - ha)));
    }
    return s * (m + 0.07 + e - t / 2);
  };
  // Pièce plaquée sur la face avant (s = 1) ou arrière (s = -1), centrée en x, à la hauteur y (bas), de hauteur h.
  // Les pièces de face suivent l'effilement de la caisse (x rapproché de l'axe au bout de la voiture).
  const face = (s, w, h, y, col, x = 0, t = 0.04, e = 0.012) => {
    const z = onTip(s, y, y + h, t, e);
    parts.push([box(w * (Math.abs(x) > 0.01 ? 1 : carTaper(C, z)), h, t), col, { x: x * carTaper(C, z), y, z }]);
  };
  const beltY = Math.max(...C.body.map((p) => p[1]));
  const topY = Math.max(...C.glass.map((p) => p[1]));
  // Caisse : effilée aux extrémités, flancs galbés au-dessus des passages de roues ; pavillon et toit rentrés.
  parts.push([shapeBody(profile(C.body, C.W, 0.07, [C.wb / 2, -C.wb / 2, C.r, y0], 2), C, { y0: C.r + 0.25, y1: beltY, shoulder: 0.035 }), color, {}]);
  glassParts.push([shapeBody(profile(C.glass, C.W - 0.2, 0.04, null, 2), C, { y0: C.glass[0][1], y1: topY, tumble: 0.14 }), '#121920', {}]);
  parts.push([shapeBody(profile(C.roof, C.W - 0.2, 0.04, null, 1), C, { y0: C.glass[0][1], y1: topY, tumble: 0.14 }), K.roofColor || color, {}]);
  const { zA, zB, zR } = carPillars(C);
  const gy = C.glass[0][1];
  const roofY = Math.max(...C.glass.map((p) => p[1]));
  const pillarCol = K.roofColor || (K.frameless ? black : color);
  // Montant central (noir laqué sur les modèles à toit flottant ou vitres sans encadrement) et large montant arrière.
  parts.push([box(C.W - 0.22, roofY - gy - 0.02, 0.1), K.roofColor || K.frameless ? black : color, { y: gy, z: zB }]);
  if (K.cPillar) for (const s of [-1, 1]) parts.push([box(0.03, roofY - gy - 0.05, 0.42), color, { x: s * (hw - 0.115), y: gy + 0.02, z: C.glass[0][0] + 0.38 }]);
  // Joints de portières (avant, montant central, arrière) et poignées.
  const belt = Math.max(...C.body.map((p) => p[1])) - 0.06;
  for (const s of [-1, 1]) {
    for (const zs of [zA, zB, zR]) parts.push([box(0.012, belt - y0 - 0.14, 0.014, true), black, { x: s * (hw + 0.004), y: y0 + 0.12, z: zs }]);
    for (const zh of [zB - 0.2, zR - 0.2]) parts.push([box(0.03, 0.04, 0.2), K.cladding ? plastic : chrome, { x: s * (hw + 0.012), y: belt - 0.16, z: zh }]);
    // Bas de caisse (noir mat sur les SUV).
    parts.push([box(0.05, K.cladding ? 0.16 : 0.08, C.wb - 2 * C.r - 0.3), K.cladding ? plastic : dark, { x: s * (hw - 0.01), y: y0 + 0.02, z: 0 }]);
    // Protections de passages de roues.
    if (K.cladding) for (const zw of [C.wb / 2, -C.wb / 2]) parts.push([prep(new THREE.TorusGeometry(C.r + 0.11, 0.06, 4, 14, Math.PI)), plastic, { x: s * (hw - 0.02), y: C.r + 0.02, z: zw, ry: Math.PI / 2 }]);
    // Rétroviseurs (coques couleur caisse, noires sur toit noir).
    parts.push([box(0.22, 0.13, 0.11), K.roofColor || color, { x: s * (hw + 0.07), y: gy + 0.03, z: zA - 0.06 }]);
  }
  if (K.roofBars) {
    for (const s of [-1, 1]) {
      parts.push([box(0.05, 0.05, 1.95), '#9a9ea3', { x: s * (hw - 0.2), y: roofY + 0.06, z: (C.roof[1][0] + C.roof[3][0]) / 2 }]);
      for (const zl of [C.roof[1][0] + 0.15, C.roof[3][0] - 0.1]) parts.push([box(0.06, 0.07, 0.12), plastic, { x: s * (hw - 0.2), y: roofY, z: zl }]);
    }
  }
  if (split) {
    // Habitacle : sièges avant et banquette, planche de bord, volant (conduite à gauche, x > 0).
    // Hanches du conducteur ~1,25 m derrière le pied du pare-brise (comme sur une voiture réelle).
    const fl = y0 + 0.08, seat = '#24262a', zs = zA - 1.2;
    for (const sx of [0.36, -0.36]) {
      parts.push([box(0.48, 0.16, 0.5), seat, { x: sx, y: fl + 0.16, z: zs }]);
      parts.push([box(0.48, 0.62, 0.12), seat, { x: sx, y: fl + 0.3, z: zs - 0.3, rx: -0.2 }]);
      parts.push([box(0.26, 0.18, 0.1), seat, { x: sx, y: fl + 0.92, z: zs - 0.42, rx: -0.2 }]);
    }
    parts.push([box(C.W - 0.4, 0.5, 0.5), seat, { y: fl + 0.16, z: zs - 0.95 }]);
    parts.push([box(C.W - 0.3, 0.22, 0.55), '#1a1b1e', { y: belt - 0.26, z: zA - 0.2 }]);
    parts.push([prep(new THREE.TorusGeometry(0.18, 0.025, 6, 16)), '#111214', { x: 0.36, y: belt + 0.02, z: zA - 0.72, rx: -0.35 }]);
    parts.push([cyl(0.025, 0.025, 0.28, 6), '#111214', { x: 0.36, y: belt - 0.16, z: zA - 0.58, rx: 0.85 }]);
  }
  if (wheels) for (const s of [-1, 1]) for (const zw of [C.wb / 2, -C.wb / 2]) parts.push(...wheel(C.r, 0.22).map(([g, c, tf]) => [g, c, { ...tf, x: s * (hw - 0.14), y: C.r, z: zw }]));

  // ----- Face avant : boucliers, calandre, optiques à la signature du modèle. -----
  face(1, C.W - 0.3, 0.1, y0 + 0.02, plastic);
  const G = K.grille;
  face(1, G.w, G.h, G.y, black);
  if (G.check) for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) face(1, 0.05, 0.05, G.y + 0.04 + j * 0.08, chrome, -G.w / 2 + 0.08 + i * ((G.w - 0.16) / 8), 0.02, 0.03);
  if (G.bars) for (let j = 0; j < 3; j++) face(1, G.w - 0.06, 0.018, G.y + 0.04 + j * 0.06, chrome, 0, 0.02, 0.03);
  if (K.upper) face(1, K.upper.w, K.upper.h, K.upper.y, black);
  if (K.skid) {
    face(1, 0.95, 0.14, y0 + 0.04, '#a9adb1', 0, 0.04, 0.03);
    face(-1, 0.85, 0.12, y0 + 0.04, '#a9adb1', 0, 0.04, 0.03);
  }
  const H = C.head;
  const hwid = H.x1 - H.x0, hx = (H.x0 + H.x1) / 2;
  for (const s of [-1, 1]) {
    // Optique : boîtier sombre et projecteur.
    face(1, hwid, H.h, H.y, dark, s * hx, 0.05);
    face(1, hwid * 0.42, H.h * 0.6, H.y + H.h * 0.2, LIGHT, s * (hx - hwid * 0.12), 0.02, 0.03);
    // Feux de jour.
    if (K.drl === 'c') {
      face(1, hwid * 0.9, 0.022, H.y + H.h - 0.02, DRL, s * hx, 0.02, 0.035);
      face(1, 0.022, 0.2, H.y - 0.1, DRL, s * (H.x1 - 0.02), 0.02, 0.035);
      face(1, 0.18, 0.022, H.y - 0.1, DRL, s * (H.x1 - 0.1), 0.02, 0.035);
    } else if (K.drl === 'fang') {
      face(1, hwid * 0.9, 0.02, H.y + H.h - 0.018, DRL, s * hx, 0.02, 0.035);
      face(1, 0.03, 0.3, H.y - 0.3, DRL, s * (H.x1 - 0.06), 0.02, 0.04);
    } else if (K.drl === 'under') {
      face(1, hwid * 0.95, 0.024, H.y - 0.04, DRL, s * hx, 0.02, 0.035);
    } else if (K.drl === 'y') {
      face(1, 0.026, H.h * 0.75, H.y + 0.01, DRL, s * (hx + hwid * 0.25), 0.02, 0.035);
      face(1, hwid * 0.42, 0.024, H.y + H.h * 0.72, DRL, s * (hx + hwid * 0.05), 0.02, 0.035);
      face(1, hwid * 0.42, 0.024, H.y + H.h * 0.12, DRL, s * (hx + hwid * 0.05), 0.02, 0.035);
    }
    // Antibrouillards / prises d'air latérales.
    face(1, 0.2, 0.08, y0 + 0.14, black, s * (hw - 0.3));
  }
  if (K.drl === 'bar') face(1, 2 * H.x0 + 0.02, 0.016, H.y + H.h * 0.5, DRL, 0, 0.02, 0.04);

  // ----- Face arrière : bouclier, feux à la signature du modèle. -----
  face(-1, C.W - 0.3, 0.12, y0 + 0.02, plastic);
  const T = C.tail;
  if (K.tailSig === 'claw-band') face(-1, 2 * T.x1, T.h, T.y, black);
  const twid = T.x1 - Math.max(T.x0, 0.2), tx = (Math.max(T.x0, 0.2) + T.x1) / 2;
  for (const s of [-1, 1]) {
    if (K.tailSig === 'claw' || K.tailSig === 'claw-band') {
      face(-1, twid, T.h, T.y, K.tailSig === 'claw' ? REDDARK : black, s * tx, 0.05);
      for (let k = 0; k < 3; k++) parts.push([box(0.025, T.h * 0.8, 0.02), RED, { x: s * (tx - twid * 0.3 + k * twid * 0.3), y: T.y + T.h * 0.1, z: onTip(-1, T.y, T.y + T.h, 0.02, 0.035), rz: s * 0.35 }]);
    } else {
      face(-1, twid, T.h, T.y, REDDARK, s * tx, 0.05);
      if (K.tailSig === 'c') {
        face(-1, twid * 0.8, 0.022, T.y + T.h - 0.025, RED, s * tx, 0.02, 0.035);
        face(-1, twid * 0.8, 0.022, T.y + 0.005, RED, s * tx, 0.02, 0.035);
        face(-1, 0.022, T.h, T.y, RED, s * (T.x1 - 0.03), 0.02, 0.035);
      } else if (K.tailSig === 'y') {
        face(-1, 0.03, T.h * 0.7, T.y, RED, s * tx, 0.02, 0.035);
        face(-1, twid * 0.6, 0.026, T.y + T.h * 0.7, RED, s * tx, 0.02, 0.035);
      } else face(-1, twid * 0.9, 0.03, T.y + T.h * 0.4, RED, s * tx, 0.02, 0.035);
    }
  }
  // Plaques d'immatriculation (sans inscription).
  face(1, 0.52, 0.11, y0 + 0.13, '#f2f1ec', 0, 0.03, 0.03);
  face(-1, 0.52, 0.11, Math.max(y0 + 0.24, T.y - 0.24), '#f2f1ec', 0, 0.03, 0.03);
  if (split) return { body: partsToGeo(parts), glass: partsToGeo(glassParts) };
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

// Roues du tracteur, centrées sur l'axe (axe selon x) : arrière à crampons en chevrons, avant directrice.
export const TRACTOR_WHEELS = { rear: { x: 1.0, z: -0.95, r: 0.82 }, front: { x: 0.92, z: 1.55, r: 0.52 } };
export function tractorWheelGeo(rear, s = 1) {
  const parts = [];
  if (rear) {
    parts.push(...wheel(0.82, 0.52, '#c9c2b0'));
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      parts.push([box(0.24, 0.08, 0.1, false), '#151517', { x: 0.12 * ((k % 2) * 2 - 1) * 0.5, y: Math.sin(a) * 0.84, z: Math.cos(a) * 0.84, rx: -a, ry: s * 0.4 * ((k % 2) * 2 - 1) }]);
    }
  } else parts.push(...wheel(0.52, 0.36, '#c9c2b0'));
  return partsToGeo(parts);
}

// Tracteur agricole (≈ 110 ch) avec chargeur frontal et godet. split = true : { body, glass } sans les roues
// (tracteur conduisible : roues animées, cabine vitrée avec siège et volant).
export function tractorGeo(color = '#a3271f', { split = false } = {}) {
  const parts = [];
  const glassParts = split ? [] : parts;
  // Châssis, capot profilé, calandre.
  parts.push([box(0.9, 0.5, 3.3), '#2b2c30', { y: 0.55, z: 0.25 }]);
  parts.push([profile([[-0.2, 1.0], [-0.2, 1.62], [1.6, 1.58], [2.05, 1.38], [2.1, 0.95]], 0.95, 0.06), color, {}]);
  parts.push([box(0.86, 0.6, 0.06), '#1b1c1f', { y: 0.98, z: 2.13 }]);
  // Cabine : montants, toit, vitrage.
  parts.push([box(1.5, 0.12, 1.6), color, { y: 2.85, z: -0.85 }]);
  for (const sx of [-0.72, 0.72]) for (const sz of [-1.6, -0.12]) parts.push([box(0.07, 1.3, 0.07), '#1b1c1f', { x: sx, y: 1.55, z: sz }]);
  glassParts.push([box(1.42, 1.25, 1.44), '#1a2229', { y: 1.58, z: -0.86 }]);
  if (split) {
    parts.push([box(0.5, 0.12, 0.48), '#24262a', { y: 1.62, z: -1.12 }]);
    parts.push([box(0.5, 0.55, 0.1), '#24262a', { y: 1.7, z: -1.38, rx: -0.15 }]);
    parts.push([prep(new THREE.TorusGeometry(0.2, 0.025, 6, 16)), '#111214', { y: 2.05, z: -0.42, rx: -0.9 }]);
    parts.push([cyl(0.03, 0.03, 0.55, 6), '#111214', { y: 1.6, z: -0.32, rx: 0.5 }]);
  }
  parts.push([box(1.4, 0.35, 1.45), color, { y: 1.22, z: -0.86 }]);
  parts.push([cyl(0.06, 0.06, 1.2, 8), '#2b2c30', { x: 0.35, y: 1.6, z: 1.15 }]);
  // Roues arrière (crampons en chevrons) et avant.
  for (const s of [-1, 1]) {
    if (!split) {
      parts.push(...wheel(0.82, 0.52, '#c9c2b0').map(([g, c, tf]) => [g, c, { ...tf, x: s * 1.0, y: 0.82, z: -0.95 }]));
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        parts.push([box(0.24, 0.08, 0.1, false), '#151517', { x: s * (1.0 + 0.12 * ((k % 2) * 2 - 1) * 0.5), y: 0.82 + Math.sin(a) * 0.84, z: -0.95 + Math.cos(a) * 0.84, rx: -a, ry: s * 0.4 * ((k % 2) * 2 - 1) }]);
      }
      parts.push(...wheel(0.52, 0.36, '#c9c2b0').map(([g, c, tf]) => [g, c, { ...tf, x: s * 0.92, y: 0.52, z: 1.55 }]));
    }
    // Ailes.
    parts.push([box(0.62, 0.06, 1.3), color, { x: s * 1.0, y: 1.72, z: -0.95 }]);
    parts.push([box(0.4, 0.05, 0.75), '#1b1c1f', { x: s * 0.92, y: 1.08, z: 1.55 }]);
    // Bras du chargeur.
    parts.push([box(0.12, 0.2, 2.6, false), '#55585c', { x: s * 0.62, y: 1.45, z: 1.35, rx: 0.32 }]);
  }
  // Godet.
  parts.push([box(2.1, 0.55, 0.7), '#55585c', { y: 0.12, z: 3.1 }]);
  parts.push([box(2.1, 0.06, 0.8), '#3d4044', { y: 0.06, z: 3.15 }]);
  if (split) return { body: partsToGeo(parts), glass: partsToGeo(glassParts) };
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
