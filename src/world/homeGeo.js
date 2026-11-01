// Maison de l'Écurie du Val : longère normande enduite (murs blancs, menuiseries sombres, ardoise), où l'on entre.
// Même procédé que les commerces de Deauville City (shopGeo.js, shopInteriors.js) :
// - extérieur (lot statique) à vraies ouvertures : porte d'entrée sur la cour, fenêtres à petits bois et volets,
//   lucarnes, œils-de-bœuf, cheminée ; vitrages à effet de pièce (allumés la nuit) vus de dehors, ouverts vus de dedans ;
// - intérieur construit à la demande (pièces peintes rangées par matériau, Kit) : salon avec cheminée, cuisine,
//   chambre, salle de bain ; cloisons percées de passages, plafond, plinthes, points lumineux, mobilier en collision.
// Repère local : façade principale (porte, côté cour) vers +z, x le long de la façade (pignon ouest à -x), y = 0 au
// niveau du sol ; le monde place ce repère au centre de l'emprise HOME.house, sans rotation. Les collisions, les pièces,
// les points d'action et les repères ne dépendent pas de la géométrie : houseLayout() les donne sans rien construire.
import * as THREE from 'three';
import { box, cyl, sphere, prep } from './shapes.js';
import { winBox } from './builders.js';
import { Kit, wallWithHoles, torus, lathe, capsule, ridingBoots, helmet } from './shopGeo.js';
import { HOME } from './sites.js';

const W = HOME.house.w, D = HOME.house.d;
export const HOUSE_T = 0.32; // murs extérieurs
const T = HOUSE_T;
const PT = 0.12; // cloisons (âme + deux parements)
const LT = 0.02; // parement (enduit peint des pièces)
export const FLOOR = 0.03; // dessus des sols : au ras du terrain, on y marche à la hauteur du sol
export const CEIL = 2.78; // sous-face du plafond
// Plafond pour la caméra (Colliders.ceilingY : h - 0,9) : elle reste à 2,05 m, sous les linteaux des portes (2,18 m).
export const CAM_CEIL = 2.95;
const WH = 3.2; // hauteur des murs (égout du toit)
const RISE = 4.0; // hauteur du toit (pente d'environ 43°)
const OV = 0.45; // débord du toit sur les façades
const OVG = 0.3; // débord sur les pignons
const DH = 2.18; // haut des passages intérieurs
const X0 = -W / 2 + T, X1 = W / 2 - T, Z0 = -D / 2 + T, Z1 = D / 2 - T;

// Couleurs (voir le shader de surfaces : bois chauds sans motif de brique, enduits clairs, pas de gris moyen sur A).
const WALL = '#f3efe7', TRIM = '#202125', ROOF = '#33363c', PLINTH = '#8f8a80', QUOIN = '#c9c1b0', SILL = '#bdb5a5';
const SHUT = '#2a2c30', BRICK = '#a86a50', ZINC = '#8d9296', GLASS = '#2d3c4b';
const OAK = '#9c7650', DARK_OAK = '#5a3f2a', FLOOR_OAK = '#a47c52', BEAM = '#5b4330', WHITE = '#f1ece3', CEILING = '#f4f0e8';
const LINEN = '#e9e2d6', NAVY = '#1f2b45', MUSTARD = '#c8a96e', BRASS = '#b08d57', STEEL = '#c9cdd0', INK = '#1b1c1f';

// Cloisons (plan médian x) et passages (bornes en z) : salle de bain | chambre | salon | cuisine.
const P1 = X0 + 3.2 + PT / 2;
const P2 = P1 + PT / 2 + 5.0 + PT / 2;
const P3 = P2 + PT / 2 + 5.4 + PT / 2;
export const PARTS = [
  { x: P1, a: 'sdb', b: 'chambre', door: [1.55, 2.75], leaf: true },
  { x: P2, a: 'chambre', b: 'salon', door: [-1.65, -0.45], leaf: true },
  { x: P3, a: 'salon', b: 'cuisine', door: [0.2, 1.6] },
];
// Pièces (rectangles locaux, faces intérieures des murs et des cloisons).
export const ROOMS = {
  sdb: { x0: X0, x1: P1 - PT / 2, z0: Z0, z1: Z1 },
  chambre: { x0: P1 + PT / 2, x1: P2 - PT / 2, z0: Z0, z1: Z1 },
  salon: { x0: P2 + PT / 2, x1: P3 - PT / 2, z0: Z0, z1: Z1 },
  cuisine: { x0: P3 + PT / 2, x1: X1, z0: Z0, z1: Z1 },
};
// Baies des murs extérieurs : side 'front' (+z) / 'back' (-z) : bornes a, b en x ; 'west' / 'east' : bornes en z.
// Hauteurs depuis le sol.
export const OPENINGS = [
  { side: 'front', a: -7.75, b: -6.85, y0: 1.35, y1: 2.25, kind: 'win', room: 'sdb' },
  { side: 'front', a: -3.75, b: -2.45, y0: 0.9, y1: 2.3, kind: 'win', room: 'chambre', curtains: '#c9b79c' },
  { side: 'front', a: 0.75, b: 1.85, y0: 0, y1: 2.25, kind: 'door', room: 'salon' },
  { side: 'front', a: 2.9, b: 4.3, y0: 0.9, y1: 2.3, kind: 'win', room: 'salon', curtains: '#7a2f2c' },
  { side: 'front', a: 6.35, b: 7.55, y0: 1.0, y1: 2.3, kind: 'win', room: 'cuisine' },
  { side: 'back', a: -4.95, b: -3.95, y0: 1.0, y1: 2.2, kind: 'win', room: 'chambre', curtains: '#c9b79c' },
  { side: 'back', a: 3.6, b: 4.5, y0: 1.0, y1: 2.2, kind: 'win', room: 'salon' },
  { side: 'east', a: -2.95, b: -1.95, y0: 1.1, y1: 2.15, kind: 'win', room: 'cuisine' },
];
const DOOR = OPENINGS.find((o) => o.kind === 'door');
const DOOR_X = (DOOR.a + DOOR.b) / 2;

// ---------- Plan (sans géométrie) ----------

// Collisions du mobilier : [x, z, demi-largeur, demi-profondeur, hauteur du dessus depuis le sol].
const FURNITURE = [
  // Salon : cheminée, bibliothèque, canapé, table basse, fauteuil, buffet, vitrine à trophées, banc de l'entrée.
  [2.26, Z0 + 0.32, 1.0, 0.32, 1.35], [0.39, Z0 + 0.18, 0.76, 0.18, 2.1], [2.26, -0.55, 1.08, 0.46, 0.85],
  [2.26, -1.95, 0.56, 0.31, 0.45], [3.95, -1.6, 0.45, 0.45, 0.95], [4.72, -2.6, 0.24, 0.72, 0.9], [4.62, -0.75, 0.18, 0.18, 1.7],
  [4.74, 2.9, 0.22, 0.62, 1.9], [-0.2, 2.6, 0.22, 0.78, 0.6], [4.62, Z0 + 0.3, 0.3, 0.3, 1.2],
  // Cuisine : réfrigérateur, plan de travail (deux retours), table et chaises.
  [5.45, Z0 + 0.33, 0.36, 0.33, 1.86], [7.34, Z0 + 0.31, 1.55, 0.31, 0.92], [8.57, -2.43, 0.31, 0.93, 0.92], [7.0, 2.45, 0.95, 0.5, 0.8],
  // Chambre : lit, chevets, armoire, commode, fauteuil.
  [-4.52, -1.05, 1.04, 0.82, 0.62], [-5.3, -2.17, 0.22, 0.22, 0.6], [-5.3, 0.07, 0.22, 0.22, 0.6], [-2.3, Z0 + 0.3, 1.02, 0.3, 2.15],
  [-0.81, 1.6, 0.25, 0.6, 0.9], [-4.75, 3.3, 0.42, 0.42, 0.95], [-3.95, 3.55, 0.22, 0.22, 0.6],
  // Salle de bain : paroi de douche, meuble vasque, WC, étagère à serviettes.
  [-8.31, -2.75, 0.57, 0.04, 2.0], [-8.63, -1.25, 0.25, 0.65, 0.9], [-8.53, 0.6, 0.35, 0.22, 0.8], [-6.3, Z0 + 0.22, 0.6, 0.22, 1.9],
];

// Repères (repère local) : point d'arrivée et sortie (dedans, devant la porte), devant la porte (dehors), côté du lit,
// évier, lavabo. heading : cap du personnage (0 = vers +z).
const ANCHORS = {
  spawn: [DOOR_X, 1.9, Math.PI],
  exit: [DOOR_X, 3.35, 0],
  door: [DOOR_X, D / 2 + 1.0, 0],
  bed: [-4.45, 0.35, Math.PI],
  // Couché sur le lit (pieds vers le pied du lit, tête sur l'oreiller) : voir HomeManager.lieDown.
  lie: [-3.7, -0.7, Math.PI / 2],
  sink: [7.9, -2.45, Math.PI / 2],
  basin: [-8.05, -1.25, -Math.PI / 2],
  salon: [2.26, 1.4, Math.PI],
};

// Points lumineux (au plus 6, shopLightUniforms) : [x, y, z, intensité] — plafonniers au centre des pièces, loin des
// cloisons (l'éclairage des matériaux de l'intérieur ne s'arrête pas aux murs).
const LIGHTS = [[2.26, 2.5, -1.7, 1.0], [2.26, 2.5, 2.1, 0.75], [7.0, 2.5, 0.0, 1.0], [-3.4, 2.45, -1.0, 0.9], [-2.7, 2.45, 2.3, 0.6], [-7.3, 2.45, -0.6, 0.85]];

export function houseLayout() {
  const colliders = [];
  // Cloisons : de part et d'autre du passage (plein mur au-dessus, la caméra passe dessous).
  for (const p of PARTS) {
    const [a, b] = p.door;
    for (const [z0, z1] of [[Z0, a], [b, Z1]]) if (z1 - z0 > 0.02) colliders.push([p.x, (z0 + z1) / 2, PT / 2, (z1 - z0) / 2, Infinity]);
  }
  colliders.push(...FURNITURE);
  return {
    rooms: ROOMS, parts: PARTS, openings: OPENINGS, colliders,
    lights: LIGHTS, anchors: ANCHORS,
    spawn: ANCHORS.spawn, exit: ANCHORS.exit, door: ANCHORS.door,
    // Points d'action intérieurs (HomeManager) : lit, évier, lavabo.
    fixtures: { bed: ANCHORS.bed, sink: ANCHORS.sink, basin: ANCHORS.basin },
  };
}

// Pièce contenant le point local (x, z), ou null (dans une cloison, hors de la maison).
export function roomAt(lx, lz) {
  for (const [id, r] of Object.entries(ROOMS)) if (lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1) return id;
  return null;
}

// Repère en coordonnées du monde (sans rien construire) : { x, z, heading }.
export function houseAnchor(name) {
  const a = ANCHORS[name];
  if (!a) return null;
  return { x: HOME.house.x + a[0], z: HOME.house.z + a[1], heading: a[2] };
}

// ---------- Petites pièces ----------

// Vitrage extérieur à effet de pièce (face +z seulement : vu de dedans, la fenêtre est ouverte sur le dehors).
function pane(w, h) {
  const g = winBox(w, h, 0.02);
  g.setIndex(Array.from(g.index.array.subarray(24, 30)));
  return g;
}
// Rectangle vu d'un seul côté (+z) : brise-bise des fenêtres, invisible depuis la pièce.
function face(w, h) {
  const g = box(w, h, 0.01);
  g.setIndex(Array.from(g.index.array.subarray(24, 30)));
  return g;
}
// Pignon triangulaire (base d selon z, hauteur rise, épaisseur e selon x).
function gableTri(d, rise, e) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: e, bevelEnabled: false });
  g.translate(0, 0, -e / 2);
  g.rotateY(Math.PI / 2);
  return prep(g);
}
// Disque face à +z (cocardes, horloge, plafonniers muraux).
const disc = (r, th, seg = 16) => cyl(r, r, th, seg).rotateX(Math.PI / 2);

// Repère d'une baie extérieure : origine au nu extérieur du mur, au milieu de la baie, +z vers le dehors.
function openingFrame(o) {
  const c = (o.a + o.b) / 2;
  if (o.side === 'front') return { x: c, z: D / 2 };
  if (o.side === 'back') return { x: c, z: -D / 2, ry: Math.PI };
  if (o.side === 'west') return { x: -W / 2, z: c, ry: -Math.PI / 2 };
  return { x: W / 2, z: c, ry: Math.PI / 2 };
}
// Même repère au nu intérieur du mur, +z vers la pièce.
function openingFrameIn(o) {
  const c = (o.a + o.b) / 2;
  if (o.side === 'front') return { x: c, z: Z1, ry: Math.PI };
  if (o.side === 'back') return { x: c, z: Z0 };
  if (o.side === 'west') return { x: X0, z: c, ry: Math.PI / 2 };
  return { x: X1, z: c, ry: -Math.PI / 2 };
}

// Cocarde de concours (flot) : collerette, cocarde, centre doré, deux pans de ruban. Repère : contre le mur, face +z.
function rosette(k, tf, color, r = 0.095) {
  k.push(tf);
  k.add('F', box(0.05, 0.26, 0.004), color, { x: -0.03, y: -0.3, rz: 0.14 });
  k.add('F', box(0.05, 0.26, 0.004), color, { x: 0.03, y: -0.3, rz: -0.14 });
  k.add('F', box(0.05, 0.012, 0.005), '#f2f1ec', { x: -0.045, y: -0.28, rz: 0.14 });
  k.add('F', box(0.05, 0.012, 0.005), '#f2f1ec', { x: 0.045, y: -0.28, rz: -0.14 });
  k.add('F', disc(r, 0.012, 18), color);
  k.add('F', disc(r * 0.74, 0.018, 16), '#f2f1ec');
  k.add('F', disc(r * 0.55, 0.024, 14), color);
  k.add('M', disc(r * 0.26, 0.03, 10), '#d9b46a');
  k.pop();
}

// Photo de cheval encadrée : cadre, ciel, pré, cheval bai de profil. Repère : milieu bas du cadre contre le mur, face +z.
function horsePhoto(k, tf, w, h, { frame = OAK, sky = '#a9c1d3', field = '#6f8f4e', coat = '#5a3520', mane = INK, mat = '#f4f0e8' } = {}) {
  k.push(tf);
  k.add('A', box(w, h, 0.035), frame);
  k.add('F', box(w - 0.06, h - 0.06, 0.004), mat, { y: 0.03, z: 0.018 });
  const iw = w - 0.16, ih = h - 0.16;
  k.add('F', box(iw, ih * 0.55, 0.004), sky, { y: 0.08 + ih * 0.45, z: 0.021 });
  k.add('F', box(iw, ih * 0.45, 0.004), field, { y: 0.08, z: 0.021 });
  const s = Math.min(iw * 0.9, ih * 1.25);
  k.push({ y: 0.08 + ih * 0.3, z: 0.025 });
  k.add('F', box(0.36 * s, 0.15 * s, 0.004), coat);
  k.add('F', box(0.09 * s, 0.24 * s, 0.004), coat, { x: 0.15 * s, y: 0.08 * s, rz: -0.55 });
  k.add('F', box(0.15 * s, 0.065 * s, 0.004), coat, { x: 0.26 * s, y: 0.25 * s, rz: -0.75 });
  k.add('F', box(0.03 * s, 0.2 * s, 0.003), mane, { x: 0.15 * s, y: 0.1 * s, z: 0.002, rz: -0.55 });
  for (const lx of [-0.15, -0.1, 0.11, 0.16]) k.add('F', box(0.032 * s, 0.17 * s, 0.004), coat, { x: lx * s, y: -0.16 * s });
  for (const lx of [-0.15, -0.1, 0.11, 0.16]) k.add('F', box(0.034 * s, 0.03 * s, 0.003), INK, { x: lx * s, y: -0.165 * s, z: 0.002 });
  k.add('F', box(0.035 * s, 0.17 * s, 0.003), mane, { x: -0.2 * s, y: -0.07 * s, z: 0.002, rz: 0.35 });
  k.pop();
  k.pop();
}

// Rideaux de part et d'autre d'une fenêtre (repère : nu intérieur du mur, milieu de la baie, +z vers la pièce).
function curtains(k, o, color) {
  const wd = o.b - o.a;
  k.push(openingFrameIn(o));
  const top = o.y1 + 0.18;
  k.add('M', cyl(0.012, 0.012, wd + 0.8, 6), INK, { y: top, z: 0.1, rz: Math.PI / 2 });
  for (const sx of [-1, 1]) k.add('M', sphere(0.025, 8, 6), INK, { x: sx * (wd / 2 + 0.4), y: top, z: 0.1 });
  const h = Math.max(1.6, top - FLOOR - 0.02);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = sx * (wd / 2 + 0.08 + i * 0.1);
      k.add('F', box(0.11, h, 0.03), color, { x, y: top - h, z: 0.1 + (i % 2 ? 0.035 : 0) });
    }
  }
  k.pop();
}

// Fauteuil (repère : centre au sol, assise face à +z).
function armchair(k, tf, key, color, legs = DARK_OAK) {
  k.push(tf);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) k.add('A', cyl(0.025, 0.02, 0.12, 6), legs, { x, z, y: FLOOR });
  k.add(key, box(0.78, 0.3, 0.78), color, { y: FLOOR + 0.12 });
  k.add(key, box(0.62, 0.12, 0.6), color, { y: FLOOR + 0.42, z: 0.06 });
  k.add(key, box(0.78, 0.55, 0.16), color, { y: FLOOR + 0.42, z: -0.31, rx: -0.12 });
  for (const sx of [-1, 1]) k.add(key, box(0.13, 0.26, 0.74), color, { x: sx * 0.33, y: FLOOR + 0.42 });
  k.pop();
}

// Lampe de chevet ou de buffet (repère : posée, centre du pied).
function tableLamp(k, tf, shade = '#f2ead8', base = '#efe6d2') {
  k.push(tf);
  k.add('L', lathe([[0, 0], [0.07, 0], [0.09, 0.08], [0.07, 0.2], [0.02, 0.24], [0, 0.24]], 14), base);
  k.add('M', cyl(0.008, 0.008, 0.12, 5), BRASS, { y: 0.24 });
  k.add('E', sphere(0.035, 8, 6), '#fff1d0', { y: 0.37 });
  k.add('F', cyl(0.1, 0.15, 0.2, 18), shade, { y: 0.3 });
  k.pop();
}

// Plafonnier (disque lumineux sous un collet).
function ceilingLamp(k, x, z, r = 0.2) {
  k.add('M', cyl(r * 0.6, r * 0.6, 0.04, 14), WHITE, { x, y: CEIL - 0.04, z });
  k.add('E', cyl(r, r * 0.9, 0.06, 18), '#fff1d0', { x, y: CEIL - 0.1, z });
}

// Livres en rang sur une tablette (largeur w selon x, dos vers +z).
function books(k, tf, w, seed = 1) {
  const cols = ['#6e2433', NAVY, '#2f5a3c', '#c8a96e', '#efe6d2', '#5d7480', '#7a4a2a', '#1b1c1f'];
  k.push(tf);
  let x = -w / 2;
  let i = seed;
  while (x < w / 2 - 0.05) {
    const bw = 0.03 + ((i * 37) % 5) * 0.008, bh = 0.2 + ((i * 53) % 7) * 0.018;
    if ((i * 13) % 11 === 0) {
      x += 0.08;
      i++;
      continue;
    }
    k.add('A', box(bw, bh, 0.19), cols[(i * 7) % cols.length], { x: x + bw / 2 });
    x += bw + 0.004;
    i++;
  }
  k.pop();
}

// ---------- Extérieur ----------

/**
 * Extérieur de la maison (repère local). Renvoie { body, detail, shutters, glass, glow : géométries, colliders :
 * boîtes locales [x, z, demi-largeur, demi-profondeur, dessus (absent : infranchissable)] }.
 */
export function houseExterior() {
  const k = new Kit();
  const zf = D / 2, xs = W / 2;
  const holes = (side) => OPENINGS.filter((o) => o.side === side)
    .map((o) => (side === 'west' || side === 'east' ? { x0: -o.b, x1: -o.a, y0: o.y0, y1: o.y1 } : { x0: o.a, x1: o.b, y0: o.y0, y1: o.y1 }))
    .sort((p, q) => p.x0 - q.x0);
  // Murs enduits percés de leurs baies (façades pleine longueur, pignons entre les deux).
  wallWithHoles(k, 'body', WALL, W, WH, T, holes('front'), { z: zf - T / 2 });
  wallWithHoles(k, 'body', WALL, W, WH, T, holes('back'), { z: -zf + T / 2 });
  wallWithHoles(k, 'body', WALL, D - 2 * T, WH, T, holes('west'), { x: -xs + T / 2, ry: Math.PI / 2 });
  wallWithHoles(k, 'body', WALL, D - 2 * T, WH, T, holes('east'), { x: xs - T / 2, ry: Math.PI / 2 });
  // Soubassement en pierre (interrompu à la porte), bandeau sombre sous l'égout.
  const PH = 0.5;
  k.add('body', box(DOOR.a + xs, PH, 0.05), PLINTH, { x: (-xs + DOOR.a) / 2, z: zf + 0.02 });
  k.add('body', box(xs - DOOR.b, PH, 0.05), PLINTH, { x: (DOOR.b + xs) / 2, z: zf + 0.02 });
  k.add('body', box(W + 0.1, PH, 0.05), PLINTH, { z: -zf - 0.02 });
  for (const sx of [-1, 1]) k.add('body', box(0.05, PH, D + 0.1), PLINTH, { x: sx * (xs + 0.02) });
  k.add('body', box(W + 0.08, 0.2, D + 0.08), TRIM, { y: WH - 0.2 });
  // Chaînes d'angle en pierre (harpes alternées).
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const y = PH + 0.05 + i * 0.32;
        if (y > WH - 0.5) break;
        const lx = i % 2 ? 0.28 : 0.46, lz = i % 2 ? 0.46 : 0.28;
        k.add('detail', box(lx, 0.28, 0.03), QUOIN, { x: sx * (xs - lx / 2 + 0.02), y, z: sz * (zf + 0.015) });
        k.add('detail', box(0.03, 0.28, lz), QUOIN, { x: sx * (xs + 0.015), y, z: sz * (zf - lz / 2 + 0.02) });
      }
    }
  }
  // Fenêtres : dormant sombre, deux battants à petits bois, appui de pierre, volets à lames ouverts contre le mur.
  for (const o of OPENINGS) {
    const wd = o.b - o.a, h = o.y1 - o.y0;
    k.push(openingFrame(o));
    if (o.kind === 'win') {
      const zr = -0.12;
      k.add('detail', box(wd, 0.07, 0.08), TRIM, { y: o.y0, z: zr });
      k.add('detail', box(wd, 0.07, 0.08), TRIM, { y: o.y1 - 0.07, z: zr });
      for (const sx of [-1, 1]) k.add('detail', box(0.07, h, 0.08), TRIM, { x: sx * (wd / 2 - 0.035), y: o.y0, z: zr });
      k.add('detail', box(0.06, h, 0.07), TRIM, { y: o.y0, z: zr });
      for (let i = 1; i < 3; i++) k.add('detail', box(wd, 0.035, 0.05), TRIM, { y: o.y0 + (h * i) / 3, z: zr });
      k.add('glass', pane(wd - 0.1, h - 0.1), GLASS, { y: o.y0 + 0.05, z: zr - 0.01 });
      // Façade sur la cour : brise-bise de lin (verre dépoli à la salle de bain), lumineux le soir (lot « lights »).
      if (o.side === 'front') k.add('glow', face(wd - 0.1, o.room === 'sdb' ? h - 0.1 : h / 3), '#efe3c8', { y: o.y0 + 0.05, z: zr + 0.012 });
      k.add('body', box(wd + 0.22, 0.07, 0.24), SILL, { y: o.y0 - 0.07, z: -0.06 });
      for (const sx of [-1, 1]) {
        const x = sx * (wd / 2 + wd / 4 + 0.05);
        k.add('shutters', box(wd / 2, h + 0.04, 0.035), SHUT, { x, y: o.y0 - 0.02, z: 0.02 });
        for (const yy of [0.18, h - 0.28]) k.add('detail', box(wd / 2 - 0.04, 0.06, 0.02), SHUT, { x, y: o.y0 + yy, z: 0.045 });
        k.add('detail', box(0.04, 0.04, 0.08), INK, { x: sx * (wd + 0.12), y: o.y0 + h * 0.45, z: 0.04 });
      }
    } else {
      // Porte d'entrée pleine à lames, imposte vitrée, poignée et heurtoir en laiton ; seuil et marche en pierre.
      const zd = -0.17;
      k.add('body', box(wd, 1.98, 0.06), TRIM, { y: 0.02, z: zd });
      for (const sx of [-1, 1]) k.add('detail', box(0.08, o.y1, 0.1), TRIM, { x: sx * (wd / 2 - 0.04), z: zd + 0.02 });
      k.add('detail', box(wd, 0.07, 0.1), TRIM, { y: 2.0, z: zd + 0.02 });
      k.add('detail', box(wd, 0.06, 0.1), TRIM, { y: o.y1 - 0.06, z: zd + 0.02 });
      k.add('glass', pane(wd - 0.16, o.y1 - 2.13), GLASS, { y: 2.07, z: zd });
      for (const yy of [0.35, 1.05]) k.add('detail', box(wd - 0.24, 0.5, 0.02), '#2a2c31', { y: yy, z: zd + 0.035 });
      k.add('detail', box(0.03, 0.2, 0.05), BRASS, { x: wd / 2 - 0.16, y: 0.98, z: zd + 0.05 });
      k.add('detail', torus(0.05, 0.008, 4, 12), BRASS, { y: 1.5, z: zd + 0.05 });
      k.add('body', box(wd + 0.5, 0.06, 0.62), SILL, { z: 0.1 });
      k.add('detail', box(wd - 0.1, 0.012, 0.5), '#5a4632', { y: 0.06, z: 0.12 });
      // Marquise : châssis sombre vitré sur deux consoles.
      k.add('body', box(wd + 0.7, 0.05, 0.85), TRIM, { y: o.y1 + 0.32, z: 0.38, rx: 0.14 });
      for (const sx of [-1, 1]) k.add('detail', box(0.04, 0.4, 0.6), TRIM, { x: sx * (wd / 2 + 0.25), y: o.y1 - 0.05, z: 0.3, rx: -0.55 });
      // Lanterne murale (allumée la nuit) à droite de la porte.
      const lx = -(wd / 2 + 0.4);
      k.add('detail', box(0.04, 0.04, 0.26), INK, { x: lx, y: o.y1 + 0.02, z: 0.13 });
      k.add('body', box(0.2, 0.32, 0.2), INK, { x: lx, y: o.y1 - 0.3, z: 0.3 });
      k.add('glow', box(0.15, 0.24, 0.22), '#ffe6b0', { x: lx, y: o.y1 - 0.26, z: 0.3 });
      k.add('detail', cyl(0.02, 0.12, 0.1, 8), INK, { x: lx, y: o.y1 + 0.02, z: 0.3 });
      // Buis en pots de part et d'autre de la porte, banc sous la fenêtre du salon.
      for (const sx of [-1, 1]) {
        k.add('body', cyl(0.22, 0.17, 0.42, 12), SILL, { x: sx * (wd / 2 + 0.42), z: 0.32 });
        k.add('body', sphere(1, 10, 8), '#4f7a3a', { x: sx * (wd / 2 + 0.42), y: 0.7, z: 0.32, sx: 0.3, sy: 0.3, sz: 0.3 });
      }
    }
    k.pop();
  }
  // Banc de bois sous la fenêtre du salon, bottes crottées à côté.
  {
    const o = OPENINGS[3];
    const x = (o.a + o.b) / 2;
    k.add('body', box(1.4, 0.05, 0.36), OAK, { x, y: 0.42, z: zf + 0.3 });
    for (const sx of [-1, 1]) k.add('body', box(0.06, 0.42, 0.32), DARK_OAK, { x: x + sx * 0.6, z: zf + 0.3 });
  }
  // Toit à deux pans d'ardoise (épaisseur réelle), faîtage, rives et bandeaux, gouttières et descentes.
  const th = 0.14;
  const a = Math.atan2(RISE, D / 2);
  const drop = (RISE * OV) / (D / 2);
  const L = Math.hypot(D / 2 + OV, RISE + drop);
  const ym = WH + RISE - (RISE + drop) / 2;
  for (const s of [-1, 1]) {
    const nx = Math.cos(a), nz = s * Math.sin(a);
    const c = { y: ym + nx * (th / 2), z: s * ((D / 2 + OV) / 2) + nz * (th / 2) };
    k.add('body', box(W + 2 * OVG, th, L, false), ROOF, { ...c, rx: s * a });
    for (const sx of [-1, 1]) k.add('detail', box(0.05, 0.22, L, false), TRIM, { x: sx * (W / 2 + OVG), y: c.y - 0.06, z: c.z, rx: s * a });
    k.add('detail', box(W + 2 * OVG, 0.2, 0.04), TRIM, { y: WH - drop - 0.18, z: s * (D / 2 + OV + 0.02) });
    k.add('detail', box(W + 2 * OVG + 0.1, 0.12, 0.14), ZINC, { y: WH - drop - 0.3, z: s * (D / 2 + OV + 0.1) });
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.3);
      k.add('detail', cyl(0.045, 0.045, WH - drop - 0.45, 8), ZINC, { x, y: 0.15, z: s * (D / 2 + 0.08) });
      k.add('detail', box(0.09, 0.09, OV + 0.05), ZINC, { x, y: WH - drop - 0.42, z: s * (D / 2 + OV / 2 + 0.08) });
    }
  }
  k.add('body', box(W + 2 * OVG + 0.04, 0.14, 0.36), '#2b2d31', { y: WH + RISE + th * 0.55 });
  // Pignons triangulaires enduits, œil-de-bœuf.
  for (const sx of [-1, 1]) {
    k.add('body', gableTri(D, RISE, T), WALL, { x: sx * (xs - T / 2), y: WH });
    k.push({ x: sx * xs, y: WH + 1.75, ry: sx * Math.PI / 2 });
    k.add('detail', disc(0.27, 0.02, 18), GLASS);
    k.add('detail', torus(0.3, 0.05, 6, 20), TRIM, { z: 0.03 });
    k.add('detail', box(0.03, 0.54, 0.02), TRIM, { y: -0.27, z: 0.025 });
    k.pop();
  }
  // Lucarnes sur le pan avant (au-dessus de la chambre et de la cuisine).
  for (const dx of [-3.1, 6.95]) {
    const fz = D / 2 - 0.15, yb = 3.3, yt = 4.65, back = 2.6;
    const dd = fz - back;
    k.add('body', box(1.4, yt - yb, dd), WALL, { x: dx, y: yb, z: back + dd / 2 });
    const dr = 0.55, half = 0.82;
    const da = Math.atan2(dr, half);
    const dl = Math.hypot(half, dr);
    for (const s of [-1, 1]) k.add('body', box(dl, 0.1, dd + 0.25, false), ROOF, { x: dx + s * half / 2, y: yt + dr / 2 + 0.05, z: back + dd / 2 + 0.12, rz: -s * da });
    const tri = new THREE.Shape();
    tri.moveTo(-0.7, 0);
    tri.lineTo(0.7, 0);
    tri.lineTo(0, dr);
    tri.closePath();
    const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false });
    k.add('body', prep(tg), WALL, { x: dx, y: yt, z: fz - 0.06 });
    k.add('detail', box(0.95, 1.0, 0.06), TRIM, { x: dx, y: yb + 0.2, z: fz + 0.01 });
    k.add('glass', pane(0.78, 0.84), GLASS, { x: dx, y: yb + 0.28, z: fz + 0.035 });
    k.add('detail', box(0.04, 0.84, 0.03), TRIM, { x: dx, y: yb + 0.28, z: fz + 0.06 });
    k.add('detail', box(1.1, 0.08, 0.14), TRIM, { x: dx, y: yt - 0.05, z: fz + 0.04 });
  }
  // Souche de cheminée en briques (au-dessus de la cheminée du salon), couronnement de pierre, deux mitrons.
  {
    const cx = 2.26, cz = -1.0, top = WH + RISE + 0.55;
    k.add('body', box(0.95, top - (WH - 0.3), 0.75), BRICK, { x: cx, y: WH - 0.3, z: cz });
    k.add('body', box(1.1, 0.12, 0.9), '#b9b4a8', { x: cx, y: top, z: cz });
    for (const s of [-1, 1]) k.add('detail', cyl(0.09, 0.12, 0.42, 8), '#a0583c', { x: cx + s * 0.22, y: top + 0.12, z: cz });
  }
  const o = OPENINGS[2];
  const colliders = [
    [0, D / 2 - T / 2, W / 2, T / 2], [0, -D / 2 + T / 2, W / 2, T / 2], [-W / 2 + T / 2, 0, T / 2, D / 2], [W / 2 - T / 2, 0, T / 2, D / 2],
    // Pots de buis et banc devant la façade.
    [o.a - 0.42, D / 2 + 0.32, 0.22, 0.22, 0.95], [o.b + 0.42, D / 2 + 0.32, 0.22, 0.22, 0.95], [(OPENINGS[3].a + OPENINGS[3].b) / 2, D / 2 + 0.3, 0.72, 0.2, 0.47],
  ];
  return { body: k.geo('body'), detail: k.geo('detail'), shutters: k.geo('shutters'), glass: k.geo('glass'), glow: k.geo('glow'), colliders };
}

// ---------- Intérieur ----------

// Habillage d'une pièce : sol, parements des murs (avec baies et passages), plinthes, tablettes des fenêtres.
function shell(k, id, { floor, wall, accent = null, skirting = WHITE }) {
  const r = ROOMS[id];
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, rw = r.x1 - r.x0, rd = r.z1 - r.z0;
  if (floor) k.add('A', box(rw, FLOOR, rd), floor, { x: cx, z: cz });
  // Baies de chaque côté : fenêtres et portes des murs extérieurs, passages des cloisons.
  const side = (s) => {
    const out = [];
    for (const o of OPENINGS) {
      if (o.room !== id) continue;
      if ((s === 'n' && o.side === 'back') || (s === 's' && o.side === 'front')) out.push({ u0: o.a, u1: o.b, y0: o.y0, y1: o.y1, kind: o.kind });
      if ((s === 'w' && o.side === 'west') || (s === 'e' && o.side === 'east')) out.push({ u0: o.a, u1: o.b, y0: o.y0, y1: o.y1, kind: o.kind });
    }
    for (const p of PARTS) {
      const at = s === 'w' ? p.b === id : s === 'e' ? p.a === id : false;
      if (at) out.push({ u0: p.door[0], u1: p.door[1], y0: 0, y1: DH, kind: 'door' });
    }
    return out;
  };
  const H = CEIL;
  const walls = [
    { s: 'n', len: rw, c: cx, tf: { x: cx, z: r.z0 + LT / 2 }, flip: false },
    { s: 's', len: rw, c: cx, tf: { x: cx, z: r.z1 - LT / 2 }, flip: false },
    { s: 'w', len: rd, c: cz, tf: { x: r.x0 + LT / 2, z: cz, ry: Math.PI / 2 }, flip: true },
    { s: 'e', len: rd, c: cz, tf: { x: r.x1 - LT / 2, z: cz, ry: Math.PI / 2 }, flip: true },
  ];
  for (const wl of walls) {
    // Le long d'un mur de pignon ou de cloison (tourné de 90°), x local = -z.
    const hs = side(wl.s).map((o) => (wl.flip ? { x0: -(o.u1 - wl.c), x1: -(o.u0 - wl.c), y0: o.y0, y1: o.y1, kind: o.kind } : { x0: o.u0 - wl.c, x1: o.u1 - wl.c, y0: o.y0, y1: o.y1, kind: o.kind })).sort((p, q) => p.x0 - q.x0);
    const col = accent && accent.side === wl.s ? accent.color : wall;
    wallWithHoles(k, 'A', col, wl.len, H, LT, hs, wl.tf);
    // Plinthes (interrompues aux portes).
    const inward = wl.s === 'n' ? { z: 0.012 } : wl.s === 's' ? { z: -0.012 } : wl.s === 'w' ? { x: 0.012 } : { x: -0.012 };
    const tf = { ...wl.tf, x: (wl.tf.x || 0) + (inward.x || 0), z: (wl.tf.z || 0) + (inward.z || 0) };
    wallWithHoles(k, 'A', skirting, wl.len - 0.01, 0.11, 0.014, hs.filter((h) => h.y0 < 0.1).map((h) => ({ ...h, y0: 0, y1: 0.11 })), tf);
  }
  // Tablettes et vitres intérieures des fenêtres (reflet léger ; vu de dehors, le vitrage à effet de pièce les cache).
  for (const o of OPENINGS) {
    if (o.room !== id || o.kind !== 'win') continue;
    const wd = o.b - o.a;
    k.push(openingFrameIn(o));
    k.add('A', box(wd + 0.12, 0.04, T - 0.06), WHITE, { y: o.y0 - 0.04, z: -(T - 0.06) / 2 + 0.06 });
    k.add('G', box(wd - 0.1, o.y1 - o.y0 - 0.1, 0.01), '#ffffff', { y: o.y0 + 0.05, z: -T + 0.15 });
    k.pop();
    if (o.curtains) curtains(k, o, o.curtains);
  }
}

// Cloisons : âme (les parements des deux pièces la recouvrent), seuils de bois, chambranles, vantaux ouverts.
function partitions(k) {
  for (const p of PARTS) {
    const [a, b] = p.door;
    const len = Z1 - Z0, c = (Z0 + Z1) / 2;
    wallWithHoles(k, 'A', WHITE, len, CEIL, PT - 2 * LT, [{ x0: -(b - c), x1: -(a - c), y0: 0, y1: DH }], { x: p.x, z: c, ry: Math.PI / 2 });
    const dz = (a + b) / 2, dw = b - a;
    k.add('A', box(PT + 0.02, FLOOR + 0.004, dw), DARK_OAK, { x: p.x, z: dz });
    for (const sx of [-1, 1]) {
      const x = p.x + sx * (PT / 2 + 0.008);
      for (const sz of [-1, 1]) k.add('A', box(0.016, DH + 0.06, 0.07), WHITE, { x, z: dz + sz * (dw / 2 + 0.035) });
      k.add('A', box(0.016, 0.07, dw + 0.14), WHITE, { x, y: DH, z: dz });
    }
    // Vantail ouvert à plat contre la cloison (côté de la pièce b), poignée.
    if (p.leaf) {
      const x = p.x + PT / 2 + 0.05;
      k.add('A', box(0.04, DH - 0.06, dw - 0.06), '#ece6da', { x, y: FLOOR, z: b + (dw - 0.06) / 2 + 0.04 });
      k.add('M', box(0.06, 0.02, 0.12), BRASS, { x: x + 0.04, y: 1.0, z: b + dw - 0.12 });
    }
  }
}

function beams(k, r, step = 1.15, start = 0.55) {
  for (let x = r.x0 + start; x < r.x1 - 0.3; x += step) k.add('A', box(0.16, 0.2, r.z1 - r.z0), BEAM, { x, y: CEIL - 0.2, z: (r.z0 + r.z1) / 2 });
}

function* buildSalon(k) {
  const r = ROOMS.salon;
  shell(k, 'salon', { floor: FLOOR_OAK, wall: '#efe8dc' });
  beams(k, r, 1.15, 0.975);
  yield;
  // Cheminée de pierre : jambages, linteau, tablette, foyer de briques, feu de bois, hotte enduite jusqu'au plafond.
  k.push({ x: 2.26, y: FLOOR, z: Z0 });
  k.add('A', box(1.95, 0.06, 0.62), SILL, { z: 0.31 });
  for (const sx of [-1, 1]) k.add('A', box(0.3, 1.1, 0.42), SILL, { x: sx * 0.78, z: 0.21 });
  k.add('A', box(1.3, 0.28, 0.4), SILL, { y: 0.84, z: 0.2 });
  k.add('A', box(2.0, 0.12, 0.52), SILL, { y: 1.12, z: 0.26 });
  k.add('A', box(1.26, 0.84, 0.05), '#a0583c', { z: 0.03 });
  for (const sx of [-1, 1]) k.add('A', box(0.04, 0.84, 0.36), '#8a4a33', { x: sx * 0.61, z: 0.2 });
  k.add('A', box(1.26, 0.02, 0.38), '#2a221c', { y: 0.06, z: 0.2 });
  k.add('A', box(1.62, CEIL - FLOOR - 1.24, 0.36), WALL, { y: 1.24, z: 0.18 });
  k.add('M', box(0.7, 0.04, 0.24), INK, { y: 0.08, z: 0.2 });
  for (const [x, rz] of [[-0.12, 0.25], [0.12, -0.2], [0, 0]]) k.add('A', capsule(0.055, 0.42, 8), '#6b4a30', { x, y: 0.17 + (rz === 0 ? 0.08 : 0), z: 0.22, ry: rz * 2 });
  k.add('E', sphere(1, 8, 6), '#ff8a3a', { y: 0.16, z: 0.22, sx: 0.28, sy: 0.05, sz: 0.1 });
  for (const [x, hgt] of [[-0.08, 0.26], [0.06, 0.34], [0.16, 0.2]]) k.add('E', lathe([[0.05, 0], [0.035, hgt * 0.4], [0, hgt]], 6), '#ffb24a', { x, y: 0.2, z: 0.22 });
  // Sur la tablette : chandeliers, coupe gagnée en concours, petite horloge.
  for (const sx of [-1, 1]) {
    k.add('M', cyl(0.035, 0.05, 0.22, 8), BRASS, { x: sx * 0.75, y: 1.24, z: 0.28 });
    k.add('A', cyl(0.018, 0.018, 0.14, 6), '#f4f0e8', { x: sx * 0.75, y: 1.46, z: 0.28 });
  }
  k.add('M', lathe([[0, 0], [0.07, 0], [0.03, 0.04], [0.025, 0.12], [0.1, 0.2], [0.12, 0.3], [0.11, 0.31], [0, 0.22]], 14), '#d9b46a', { x: 0.35, y: 1.24, z: 0.3 });
  k.add('A', box(0.22, 0.24, 0.1), DARK_OAK, { x: -0.38, y: 1.24, z: 0.3 });
  k.add('L', disc(0.08, 0.01, 14), '#f4f0e8', { x: -0.38, y: 1.36, z: 0.35 });
  k.pop();
  // Au-dessus : grand portrait de cheval et flots de concours.
  horsePhoto(k, { x: 2.26, y: 1.55, z: Z0 + 0.37 }, 1.0, 0.72, { frame: BRASS, coat: '#4a2c18' });
  const fl = ['#2f5f8a', '#c8322b', '#f2f1ec', '#e9c94a', '#2f6e4a', '#b55aa0'];
  for (let i = 0; i < 4; i++) rosette(k, { x: 2.26 + (i < 2 ? -0.66 : 0.66), y: 2.42 - (i % 2) * 0.4, z: Z0 + 0.36 }, fl[i], 0.07);
  yield;
  // Bibliothèque à gauche de la cheminée : livres, figurine de cheval, photos.
  k.push({ x: 0.39, y: FLOOR, z: Z0 + 0.18 });
  k.add('A', box(1.52, 2.08, 0.04), DARK_OAK, { z: -0.16 });
  for (const sx of [-1, 1]) k.add('A', box(0.04, 2.08, 0.36), OAK, { x: sx * 0.74 });
  for (const y of [0.06, 0.5, 0.94, 1.38, 1.82, 2.06]) k.add('A', box(1.52, 0.035, 0.36), OAK, { y });
  books(k, { y: 0.1 }, 1.4, 1);
  books(k, { y: 0.54, x: -0.25 }, 0.9, 5);
  books(k, { y: 0.98, x: 0.2 }, 1.0, 9);
  books(k, { y: 1.42, x: -0.2 }, 1.0, 14);
  k.add('A', box(0.18, 0.12, 0.14), '#3a2516', { x: 0.45, y: 0.54 });
  k.add('A', box(0.06, 0.16, 0.1), '#3a2516', { x: 0.52, y: 0.62, rz: -0.4 });
  horsePhoto(k, { x: -0.5, y: 0.98, z: 0.0, rx: -0.12 }, 0.24, 0.3, { frame: INK });
  k.add('M', lathe([[0, 0], [0.05, 0], [0.02, 0.03], [0.02, 0.1], [0.08, 0.16], [0.09, 0.24], [0, 0.18]], 12), '#d9b46a', { x: 0.5, y: 1.42 });
  k.pop();
  yield;
  // Tapis berbère, table basse, canapé de lin face à la cheminée, plaid, coussins.
  k.add('F', box(2.7, 0.012, 2.0), '#8a3b32', { x: 2.26, y: FLOOR, z: -1.75 });
  k.add('F', box(2.5, 0.014, 1.8), '#b5654c', { x: 2.26, y: FLOOR, z: -1.75 });
  for (let i = 0; i < 5; i++) k.add('F', box(2.3, 0.016, 0.05), '#e9dfc9', { x: 2.26, y: FLOOR, z: -2.45 + i * 0.35 });
  k.push({ x: 2.26, y: FLOOR, z: -1.95 });
  k.add('A', box(1.1, 0.05, 0.6), OAK, { y: 0.38 });
  k.add('A', box(1.0, 0.03, 0.5), DARK_OAK, { y: 0.12 });
  for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) k.add('A', box(0.05, 0.38, 0.05), DARK_OAK, { x, z });
  k.add('A', box(0.3, 0.05, 0.22), '#6e2433', { x: -0.25, y: 0.43, ry: 0.2 });
  k.add('A', box(0.28, 0.04, 0.2), '#efe6d2', { x: -0.25, y: 0.48, ry: 0.1 });
  k.add('M', cyl(0.12, 0.1, 0.03, 14), BRASS, { x: 0.25, y: 0.43 });
  k.add('A', cyl(0.035, 0.035, 0.09, 8), '#f4f0e8', { x: 0.25, y: 0.46 });
  k.add('L', cyl(0.045, 0.04, 0.09, 10), '#f4f0e8', { x: 0.05, y: 0.43, z: 0.15 });
  k.pop();
  k.push({ x: 2.26, y: FLOOR, z: -0.55, ry: Math.PI });
  const sofa = '#2f4a3a';
  for (const [x, z] of [[-0.95, -0.35], [0.95, -0.35], [-0.95, 0.35], [0.95, 0.35]]) k.add('A', cyl(0.03, 0.022, 0.1, 6), DARK_OAK, { x, z });
  k.add('F', box(2.1, 0.32, 0.9), sofa, { y: 0.1 });
  k.add('F', box(2.1, 0.5, 0.2), sofa, { y: 0.4, z: -0.35 });
  for (const sx of [-1, 1]) k.add('F', box(0.2, 0.3, 0.9), sofa, { x: sx * 0.95, y: 0.42 });
  for (const sx of [-1, 1]) {
    k.add('F', box(0.82, 0.13, 0.66), '#36553f', { x: sx * 0.43, y: 0.42, z: 0.08 });
    k.add('F', box(0.82, 0.42, 0.16), '#36553f', { x: sx * 0.43, y: 0.5, z: -0.2, rx: -0.15 });
  }
  k.add('F', box(0.4, 0.38, 0.12), '#efe6d2', { x: -0.62, y: 0.55, z: -0.08, rx: -0.25, rz: 0.12 });
  k.add('F', box(0.38, 0.36, 0.12), MUSTARD, { x: 0.64, y: 0.55, z: -0.08, rx: -0.25, rz: -0.1 });
  k.add('F', box(0.7, 0.02, 0.92), '#d8c9a8', { x: 0.55, y: 0.56, z: 0.02 });
  k.add('F', box(0.7, 0.4, 0.02), '#d8c9a8', { x: 0.55, y: 0.17, z: 0.47 });
  for (let i = 0; i < 3; i++) k.add('F', box(0.05, 0.025, 0.93), '#8a3b32', { x: 0.3 + i * 0.25, y: 0.565, z: 0.02 });
  k.pop();
  yield;
  // Fauteuil club en cuir, lampadaire, buffet avec lampe et photos, plante, vitrine à trophées.
  armchair(k, { x: 3.95, z: -1.6, ry: -1.75 }, 'L', '#6b3f22');
  k.push({ x: 4.62, y: FLOOR, z: -0.75 });
  k.add('M', cyl(0.15, 0.17, 0.03, 14), INK);
  k.add('M', cyl(0.014, 0.014, 1.5, 6), INK, { y: 0.03 });
  k.add('F', cyl(0.16, 0.22, 0.28, 16), '#efe6d2', { y: 1.4 });
  k.add('E', sphere(0.04, 8, 6), '#fff1d0', { y: 1.48 });
  k.pop();
  k.push({ x: r.x1 - 0.24, y: FLOOR, z: -2.6, ry: -Math.PI / 2 });
  k.add('A', box(1.44, 0.8, 0.46), DARK_OAK, { y: 0.06 });
  k.add('A', box(1.5, 0.04, 0.5), OAK, { y: 0.86 });
  for (const sx of [-1, 1]) k.add('A', box(0.66, 0.6, 0.02), OAK, { x: sx * 0.35, y: 0.16, z: 0.235 });
  for (const sx of [-1, 1]) k.add('M', sphere(0.018, 6, 4), BRASS, { x: sx * 0.06, y: 0.5, z: 0.26 });
  tableLamp(k, { x: -0.5, y: 0.9 }, '#efe6d2', '#2f4a3a');
  horsePhoto(k, { x: 0.15, y: 0.9, z: -0.05, rx: -0.12 }, 0.26, 0.32, { frame: BRASS, coat: '#7a4a2a', sky: '#d9c7a6' });
  horsePhoto(k, { x: 0.5, y: 0.9, z: 0.0, rx: -0.12, ry: -0.2 }, 0.2, 0.26, { frame: INK, coat: '#e9e2d6', sky: '#9fb7c9' });
  k.pop();
  // Tableau de flots au-dessus du buffet.
  for (let i = 0; i < 8; i++) rosette(k, { x: r.x1 - LT, y: 2.3 - Math.floor(i / 4) * 0.46, z: -3.2 + (i % 4) * 0.4, ry: -Math.PI / 2 }, fl[(i + 2) % 6], 0.075);
  k.add('A', cyl(0.2, 0.16, 0.4, 12), '#2a2c30', { x: 4.62, y: FLOOR, z: Z0 + 0.3 });
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    k.add('A', sphere(1, 8, 6), i % 2 ? '#4f7a3a' : '#5d8a44', { x: 4.62 + Math.cos(a) * 0.12, y: FLOOR + 0.62 + (i % 3) * 0.2, z: Z0 + 0.3 + Math.sin(a) * 0.12, sx: 0.22, sy: 0.32, sz: 0.22 });
  }
  k.push({ x: r.x1 - 0.22, y: FLOOR, z: 2.9, ry: -Math.PI / 2 });
  k.add('A', box(1.24, 1.9, 0.42), DARK_OAK);
  k.add('A', box(1.12, 1.66, 0.02), '#e9e2d6', { y: 0.18, z: -0.19 });
  for (const y of [0.18, 0.72, 1.26]) k.add('A', box(1.12, 0.03, 0.36), OAK, { y });
  k.add('G', box(1.12, 1.66, 0.01), '#ffffff', { y: 0.18, z: 0.205 });
  k.add('A', box(0.03, 1.66, 0.03), DARK_OAK, { y: 0.18, z: 0.205 });
  for (let i = 0; i < 3; i++) k.add('M', lathe([[0, 0], [0.06, 0], [0.025, 0.03], [0.02, 0.12], [0.09, 0.2], [0.1, 0.3], [0, 0.22]], 12), i === 1 ? '#c9cdd0' : '#d9b46a', { x: -0.35 + i * 0.35, y: 0.75 });
  for (let i = 0; i < 4; i++) rosette(k, { x: -0.42 + i * 0.28, y: 1.62, z: -0.17 }, fl[i], 0.065);
  for (let i = 0; i < 3; i++) k.add('A', box(0.22, 0.02, 0.16), ['#d9b46a', '#c9cdd0', '#a0583c'][i], { x: -0.3 + i * 0.3, y: 0.21 });
  k.pop();
  yield;
  // Entrée : patère (veste, bombe, licol), banc et bottes, paillasson ; fer à cheval au-dessus du passage de la cuisine.
  k.push({ x: r.x0 + LT, y: FLOOR, z: 2.75, ry: Math.PI / 2 });
  k.add('A', box(1.3, 0.12, 0.03), OAK, { y: 1.65 });
  for (let i = 0; i < 4; i++) k.add('M', box(0.02, 0.06, 0.09), BRASS, { x: -0.5 + i * 0.33, y: 1.72, z: 0.04 });
  k.add('F', box(0.46, 0.75, 0.1), '#2f4a3a', { x: -0.5, y: 0.98, z: 0.07 });
  k.add('F', box(0.3, 0.12, 0.11), '#25392d', { x: -0.5, y: 1.62, z: 0.07 });
  helmet(k, { x: -0.17, y: 1.6, z: 0.14 }, NAVY);
  k.add('F', torus(0.11, 0.015, 4, 14), '#6e2433', { x: 0.16, y: 1.55, z: 0.08, sx: 0.8 });
  k.add('F', box(0.42, 0.66, 0.08), '#c8a96e', { x: 0.48, y: 1.02, z: 0.06 });
  k.add('A', box(1.2, 0.05, 0.4), OAK, { y: 0.44, z: 0.22 });
  for (const sx of [-1, 1]) k.add('A', box(0.05, 0.44, 0.36), DARK_OAK, { x: sx * 0.55, z: 0.22 });
  ridingBoots(k, { x: 0.82, z: 0.22, ry: 0.15 }, '#121214');
  k.pop();
  k.add('F', box(0.9, 0.012, 0.6), '#5a4632', { x: DOOR_X, y: FLOOR, z: Z1 - 0.4 });
  k.add('M', torus(0.09, 0.016, 5, 14, Math.PI * 1.35), '#9a8f80', { x: r.x1 - 0.03, y: 2.4, z: 0.9, ry: -Math.PI / 2, rz: Math.PI * 0.82 });
  ceilingLamp(k, 2.26, -1.7, 0.22);
  ceilingLamp(k, 2.26, 2.1, 0.18);
}

function* buildCuisine(k) {
  const r = ROOMS.cuisine;
  shell(k, 'cuisine', { floor: '#e9e3d6', wall: '#f3efe8' });
  beams(k, r, 1.2, 0.12);
  yield;
  // Carreaux de ciment en damier.
  const S = 0.4;
  for (let i = 0; i * S < r.x1 - r.x0 - 0.01; i++) {
    for (let j = 0; j * S < r.z1 - r.z0 - 0.01; j++) {
      if ((i + j) % 2) continue;
      const w = Math.min(S, r.x1 - r.x0 - i * S), d = Math.min(S, r.z1 - r.z0 - j * S);
      k.add('A', box(w - 0.01, 0.004, d - 0.01), '#33414a', { x: r.x0 + i * S + w / 2, y: FLOOR, z: r.z0 + j * S + d / 2 });
    }
  }
  const GREEN = '#3f5a48', FRONT = '#36503f';
  yield;
  // Crédence carrelée derrière le plan de travail.
  k.add('L', box(r.x1 - 5.8, 0.6, 0.012), '#e3ece5', { x: (5.8 + r.x1) / 2, y: 0.92, z: Z0 + LT + 0.006 });
  k.add('L', box(0.012, 0.6, 2.5), '#e3ece5', { x: r.x1 - LT - 0.006, y: 0.92, z: -2.2 });
  // Meubles bas (socle en retrait, caissons, façades, poignées), plan de travail en chêne : le long du mur du fond
  // et retour sous la fenêtre du pignon.
  const bx = (5.8 + r.x1) / 2, bl = r.x1 - 5.8;
  k.add('A', box(bl, 0.08, 0.56), INK, { x: bx, y: FLOOR, z: Z0 + 0.28 });
  k.add('A', box(bl, 0.78, 0.62), GREEN, { x: bx, y: FLOOR + 0.08, z: Z0 + 0.31 });
  k.add('A', box(bl + 0.02, 0.04, 0.65), OAK, { x: bx, y: 0.88, z: Z0 + 0.325 });
  const rz = (Z0 + 0.62 - 1.5) / 2, rl = -1.5 - (Z0 + 0.62);
  k.add('A', box(0.56, 0.08, rl), INK, { x: r.x1 - 0.28, y: FLOOR, z: rz });
  k.add('A', box(0.62, 0.78, rl), GREEN, { x: r.x1 - 0.31, y: FLOOR + 0.08, z: rz });
  k.add('A', box(0.65, 0.04, rl + 0.02), OAK, { x: r.x1 - 0.325, y: 0.88, z: rz + 0.01 });
  for (const [x0, x1] of [[5.82, 6.24], [6.26, 6.68], [7.32, 7.78], [7.8, 8.24]]) {
    const x = (x0 + x1) / 2;
    k.add('A', box(x1 - x0, 0.7, 0.02), FRONT, { x, y: FLOOR + 0.12, z: Z0 + 0.63 });
    k.add('M', box(0.12, 0.015, 0.025), BRASS, { x, y: 0.82, z: Z0 + 0.65 });
  }
  for (let i = 0; i < 3; i++) {
    const z = -3.05 + i * 0.6;
    k.add('A', box(0.02, 0.7, 0.56), FRONT, { x: r.x1 - 0.63, y: FLOOR + 0.12, z });
    k.add('M', box(0.025, 0.015, 0.12), BRASS, { x: r.x1 - 0.65, y: 0.82, z });
  }
  // Four sous la plaque, plaque de cuisson, hotte.
  k.add('M', box(0.58, 0.6, 0.02), INK, { x: 7.0, y: FLOOR + 0.14, z: Z0 + 0.63 });
  k.add('M', box(0.46, 0.02, 0.03), STEEL, { x: 7.0, y: 0.7, z: Z0 + 0.65 });
  k.add('M', box(0.6, 0.012, 0.52), INK, { x: 7.0, y: 0.92, z: Z0 + 0.32 });
  for (const [dx, dz, rr] of [[-0.14, -0.12, 0.09], [0.14, -0.12, 0.07], [-0.14, 0.12, 0.07], [0.14, 0.12, 0.09]]) k.add('M', torus(rr, 0.006, 3, 18), '#3a3d42', { x: 7.0 + dx, y: 0.935, z: Z0 + 0.32 + dz, rx: Math.PI / 2 });
  k.add('M', cyl(0.14, 0.44, 0.42, 4), STEEL, { x: 7.0, y: 1.6, z: Z0 + 0.3, ry: Math.PI / 4 });
  k.add('M', box(0.28, CEIL - 2.02, 0.24), STEEL, { x: 7.0, y: 2.02, z: Z0 + 0.15 });
  // Meubles hauts de part et d'autre de la hotte.
  for (const [x0, x1] of [[5.85, 6.62], [7.38, r.x1 - 0.02]]) {
    k.add('A', box(x1 - x0, 0.7, 0.34), GREEN, { x: (x0 + x1) / 2, y: 1.5, z: Z0 + 0.19 });
    const n = Math.round((x1 - x0) / 0.5);
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
      k.add('A', box((x1 - x0) / n - 0.03, 0.64, 0.02), FRONT, { x, y: 1.53, z: Z0 + 0.365 });
      k.add('M', box(0.015, 0.1, 0.025), BRASS, { x: x + ((i % 2) * 2 - 1) * ((x1 - x0) / n / 2 - 0.06), y: 1.58, z: Z0 + 0.38 });
    }
  }
  yield;
  // Réfrigérateur inox.
  k.push({ x: 5.45, y: FLOOR, z: Z0 + 0.33 });
  k.add('M', box(0.7, 1.84, 0.64), STEEL);
  k.add('M', box(0.68, 0.01, 0.01), '#6a6f74', { y: 1.18, z: 0.325 });
  for (const y of [0.5, 1.3]) k.add('M', box(0.025, 0.4, 0.04), '#6a6f74', { x: 0.29, y, z: 0.34 });
  k.add('L', box(0.08, 0.1, 0.005), '#c8322b', { x: -0.1, y: 1.45, z: 0.323 });
  k.add('L', box(0.12, 0.08, 0.005), '#2f5f8a', { x: 0.08, y: 1.55, z: 0.323 });
  k.pop();
  // Évier en céramique sous la fenêtre, robinet col de cygne, égouttoir.
  k.push({ x: r.x1 - 0.33, y: 0.92, z: -2.45 });
  k.add('L', box(0.62, 0.25, 0.64), '#f4f2ee', { y: -0.23 });
  k.add('L', box(0.48, 0.006, 0.5), '#d6d3cc', { x: -0.02, y: 0.02 });
  k.add('M', cyl(0.018, 0.018, 0.32, 6), STEEL, { x: 0.22 });
  k.add('M', torus(0.09, 0.016, 5, 12, Math.PI), STEEL, { x: 0.13, y: 0.32, ry: Math.PI / 2, rx: 0 });
  k.add('M', box(0.12, 0.02, 0.02), STEEL, { x: 0.22, y: 0.1, z: 0.07 });
  k.add('M', box(0.3, 0.02, 0.3), STEEL, { y: 0.0, z: 0.55 });
  for (let i = 0; i < 4; i++) k.add('L', disc(0.1, 0.012, 14), '#f4f2ee', { x: -0.05 + i * 0.03, y: 0.12, z: 0.5, ry: Math.PI / 2 });
  k.pop();
  // Sur le plan de travail : machine à café expresso, tasse, bocaux, corbeille de fruits, planche à pain.
  k.push({ x: 6.1, y: 0.92, z: Z0 + 0.3 });
  k.add('M', box(0.28, 0.36, 0.32), INK);
  k.add('M', box(0.3, 0.05, 0.34), STEEL, { y: 0.36 });
  k.add('M', box(0.24, 0.02, 0.12), STEEL, { y: 0.03, z: 0.12 });
  k.add('M', cyl(0.035, 0.035, 0.06, 10), STEEL, { y: 0.2, z: 0.16 });
  k.add('M', box(0.12, 0.04, 0.04), INK, { y: 0.22, z: 0.2 });
  k.add('G', box(0.1, 0.24, 0.1), '#ffffff', { x: 0.1, y: 0.08, z: -0.12 });
  k.add('L', cyl(0.035, 0.03, 0.06, 10), '#f4f2ee', { y: 0.05, z: 0.14 });
  k.add('E', disc(0.01, 0.005, 6), '#9fe6a8', { x: 0.09, y: 0.3, z: 0.16 });
  k.pop();
  for (let i = 0; i < 3; i++) {
    k.add('G', cyl(0.06, 0.06, 0.2 - i * 0.03, 12), '#ffffff', { x: 7.65 + i * 0.16, y: 0.92, z: Z0 + 0.2 });
    k.add('A', cyl(0.055, 0.055, 0.12 - i * 0.02, 12), ['#c8a96e', '#efe6d2', '#6e2433'][i], { x: 7.65 + i * 0.16, y: 0.93, z: Z0 + 0.2 });
    k.add('A', cyl(0.062, 0.062, 0.025, 12), OAK, { x: 7.65 + i * 0.16, y: 1.12 - i * 0.03, z: Z0 + 0.2 });
  }
  k.add('A', box(0.42, 0.03, 0.28), OAK, { x: 6.6, y: 0.92, z: Z0 + 0.35, ry: 0.15 });
  k.add('A', capsule(0.05, 0.22, 8), '#c08a46', { x: 6.6, y: 0.99, z: Z0 + 0.35, ry: 0.15 });
  k.add('L', cyl(0.12, 0.07, 0.07, 14), '#f4f2ee', { x: r.x1 - 0.3, y: 0.92, z: -1.75 });
  for (let i = 0; i < 5; i++) k.add('A', sphere(0.04, 8, 6), i % 2 ? '#c8322b' : '#9cb84a', { x: r.x1 - 0.3 + Math.cos(i * 1.3) * 0.05, y: 1.0 + (i === 4 ? 0.04 : 0), z: -1.75 + Math.sin(i * 1.3) * 0.05 });
  // Étagère de bois au-dessus de l'évier (assiettes, pots) et horloge.
  k.add('A', box(0.22, 0.03, 0.9), OAK, { x: r.x1 - 0.13, y: 2.25, z: -1.15 });
  for (let i = 0; i < 4; i++) k.add('L', cyl(0.05, 0.04, 0.1, 10), ['#f4f2ee', '#2f5f8a', '#f4f2ee', '#c8a96e'][i], { x: r.x1 - 0.13, y: 2.28, z: -1.5 + i * 0.22 });
  k.add('A', disc(0.17, 0.03, 20), INK, { x: 5.72, y: 2.1, z: Z1 - 0.02, ry: Math.PI });
  k.add('L', disc(0.15, 0.035, 20), '#f4f0e8', { x: 5.72, y: 2.1, z: Z1 - 0.025, ry: Math.PI });
  k.add('A', box(0.01, 0.1, 0.01), INK, { x: 5.72, y: 2.1, z: Z1 - 0.065, rz: 0.4 });
  k.add('A', box(0.008, 0.08, 0.01), INK, { x: 5.72, y: 2.1, z: Z1 - 0.065, rz: -1.9 });
  yield;
  // Table de ferme et deux chaises près de la fenêtre, bouquet, tasses.
  k.push({ x: 7.0, y: FLOOR, z: 2.45 });
  k.add('A', box(0.95, 0.05, 0.85), OAK, { y: 0.72 });
  for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) k.add('A', box(0.06, 0.72, 0.06), DARK_OAK, { x, z });
  k.add('F', box(0.34, 0.006, 0.9), '#6e2433', { y: 0.77 });
  k.add('G', cyl(0.05, 0.04, 0.18, 10), '#ffffff', { y: 0.77 });
  for (let i = 0; i < 6; i++) k.add('A', sphere(0.035, 6, 5), ['#f2f1ec', '#e9c94a', '#c8322b'][i % 3], { x: Math.cos(i) * 0.06, y: 0.98 + (i % 2) * 0.04, z: Math.sin(i) * 0.06 });
  for (const sx of [-1, 1]) k.add('L', cyl(0.04, 0.035, 0.09, 10), '#f4f2ee', { x: sx * 0.25, y: 0.775, z: 0.18 * sx });
  for (const sx of [-1, 1]) {
    k.push({ x: sx * 0.68, ry: -sx * Math.PI / 2 });
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) k.add('A', box(0.035, 0.45, 0.035), DARK_OAK, { x, z });
    k.add('A', box(0.42, 0.04, 0.42), OAK, { y: 0.45 });
    for (const x of [-0.18, 0.18]) k.add('A', box(0.035, 0.5, 0.035), DARK_OAK, { x, y: 0.45, z: -0.19 });
    for (const y of [0.68, 0.86]) k.add('A', box(0.4, 0.05, 0.025), OAK, { y, z: -0.19 });
    k.pop();
  }
  k.pop();
  // Torchon sur le tablier de l'évier.
  k.add('F', box(0.02, 0.3, 0.2), '#2f5f8a', { x: r.x1 - 0.655, y: 0.42, z: -2.3 });
  ceilingLamp(k, 7.0, 0.0, 0.22);
  ceilingLamp(k, 7.0, 2.45, 0.16);
}

function* buildChambre(k) {
  const r = ROOMS.chambre;
  shell(k, 'chambre', { floor: '#b08a5e', wall: '#ece6dc', accent: { side: 'w', color: '#2b3a52' } });
  yield;
  // Lit double : tête de lit capitonnée contre le mur bleu, cadre de chêne, matelas, couette, plaid, oreillers.
  k.push({ x: r.x0, y: FLOOR, z: -1.05 });
  k.add('F', box(0.09, 1.22, 1.84), '#cdbfa8', { x: 0.06 });
  for (let i = 0; i < 4; i++) k.add('F', box(0.02, 0.9, 0.012), '#b9aa92', { x: 0.115, y: 0.25, z: -0.69 + i * 0.46 });
  k.add('A', box(2.0, 0.24, 1.66), OAK, { x: 1.06, y: 0.08 });
  for (const [x, z] of [[0.14, -0.78], [1.98, -0.78], [0.14, 0.78], [1.98, 0.78]]) k.add('A', box(0.08, 0.1, 0.08), DARK_OAK, { x, z });
  k.add('F', box(1.96, 0.2, 1.6), '#f4f2ee', { x: 1.06, y: 0.32 });
  k.add('F', box(1.48, 0.09, 1.7), LINEN, { x: 1.33, y: 0.5 });
  k.add('F', box(1.48, 0.32, 0.03), LINEN, { x: 1.33, y: 0.27, z: 0.85 });
  k.add('F', box(1.48, 0.32, 0.03), LINEN, { x: 1.33, y: 0.27, z: -0.85 });
  k.add('F', box(0.03, 0.3, 1.7), LINEN, { x: 2.08, y: 0.29 });
  k.add('F', box(0.22, 0.1, 1.72), '#f4f2ee', { x: 0.66, y: 0.53 });
  k.add('F', box(0.52, 0.11, 1.74), NAVY, { x: 1.78, y: 0.53 });
  k.add('F', box(0.52, 0.36, 0.025), NAVY, { x: 1.78, y: 0.28, z: 0.875 });
  k.add('F', box(0.52, 0.36, 0.025), NAVY, { x: 1.78, y: 0.28, z: -0.875 });
  k.add('F', box(0.52, 0.02, 0.025), '#c8a96e', { x: 1.78, y: 0.6, z: 0.88 });
  for (const sz of [-1, 1]) {
    k.add('F', sphere(1, 12, 8), '#fbfaf6', { x: 0.36, y: 0.62, z: sz * 0.4, sx: 0.2, sy: 0.09, sz: 0.34 });
    k.add('F', box(0.1, 0.32, 0.36), sz < 0 ? MUSTARD : NAVY, { x: 0.5, y: 0.52, z: sz * 0.32, rz: -0.35 });
  }
  k.pop();
  yield;
  // Chevets, lampes, réveil, livres ; flots et photo de cheval au-dessus du lit.
  for (const z of [-2.17, 0.07]) {
    k.push({ x: r.x0 + 0.24, y: FLOOR, z });
    k.add('A', box(0.42, 0.5, 0.42), OAK);
    k.add('A', box(0.02, 0.14, 0.36), DARK_OAK, { x: 0.21, y: 0.3 });
    k.add('M', sphere(0.015, 6, 4), BRASS, { x: 0.225, y: 0.37 });
    tableLamp(k, { y: 0.5, z: z < 0 ? -0.05 : 0.09 });
    k.pop();
  }
  k.add('A', box(0.16, 0.035, 0.22), '#2f5a3c', { x: r.x0 + 0.26, y: FLOOR + 0.5, z: -0.04, ry: 0.3 });
  k.add('L', box(0.09, 0.07, 0.05), '#f4f2ee', { x: r.x0 + 0.24, y: FLOOR + 0.5, z: -2.0, ry: Math.PI / 2 });
  horsePhoto(k, { x: r.x0 + LT, y: 1.42, z: -1.05, ry: Math.PI / 2 }, 1.1, 0.74, { frame: '#efe6d2', coat: '#3a2516', sky: '#c6d4dd', field: '#7d9a5a' });
  rosette(k, { x: r.x0 + LT, y: 1.62, z: -2.4, ry: Math.PI / 2 }, '#2f5f8a');
  rosette(k, { x: r.x0 + LT, y: 1.62, z: 0.3, ry: Math.PI / 2 }, '#c8322b');
  // Tapis sous le lit.
  k.add('F', box(2.5, 0.012, 2.7), '#e3dccd', { x: -4.0, y: FLOOR, z: -1.05 });
  for (let i = 0; i < 3; i++) k.add('F', box(0.06, 0.014, 2.6), '#8a3b32', { x: -3.0 + i * 0.12 - 0.12, y: FLOOR, z: -1.05 });
  yield;
  // Armoire de chêne à deux portes, corniche, bottes et casque à côté.
  k.push({ x: -2.3, y: FLOOR, z: Z0 + 0.3 });
  k.add('A', box(2.0, 0.1, 0.58), DARK_OAK);
  k.add('A', box(1.96, 1.92, 0.58), OAK, { y: 0.1 });
  k.add('A', box(2.08, 0.1, 0.64), DARK_OAK, { y: 2.02 });
  for (const sx of [-1, 1]) {
    k.add('A', box(0.94, 1.8, 0.02), '#a8825b', { x: sx * 0.49, y: 0.16, z: 0.29 });
    k.add('A', box(0.7, 0.62, 0.012), OAK, { x: sx * 0.49, y: 1.15, z: 0.3 });
    k.add('A', box(0.7, 0.62, 0.012), OAK, { x: sx * 0.49, y: 0.38, z: 0.3 });
    k.add('M', box(0.02, 0.14, 0.03), BRASS, { x: sx * 0.06, y: 1.0, z: 0.31 });
  }
  k.add('F', box(0.5, 0.25, 0.4), '#6e2433', { x: -0.5, y: 2.12 });
  k.pop();
  ridingBoots(k, { x: -1.05, y: FLOOR, z: Z0 + 0.35, ry: 0.2 }, '#121214');
  helmet(k, { x: -1.75, y: FLOOR + 2.24, z: Z0 + 0.3 }, NAVY);
  // Commode et miroir contre la cloison du salon : photo encadrée, flot, petit bouquet.
  k.push({ x: r.x1 - 0.25, y: FLOOR, z: 1.6, ry: -Math.PI / 2 });
  k.add('A', box(1.2, 0.82, 0.48), OAK, { y: 0.06 });
  k.add('A', box(1.24, 0.04, 0.5), DARK_OAK, { y: 0.88 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add('A', box(0.05, 0.06, 0.05), DARK_OAK, { x: sx * 0.55, z: sz * 0.2 });
  for (let i = 0; i < 3; i++) {
    k.add('A', box(1.12, 0.22, 0.012), '#a8825b', { y: 0.14 + i * 0.25, z: 0.245 });
    for (const sx of [-1, 1]) k.add('M', sphere(0.016, 6, 4), BRASS, { x: sx * 0.3, y: 0.25 + i * 0.25, z: 0.26 });
  }
  horsePhoto(k, { x: -0.3, y: 0.92, z: 0.02, rx: -0.12 }, 0.3, 0.36, { frame: INK, coat: '#e9e2d6', sky: '#9fb7c9' });
  rosette(k, { x: 0.53, y: 1.92, z: -0.22 }, '#e9c94a', 0.07);
  k.add('G', cyl(0.045, 0.035, 0.16, 10), '#ffffff', { x: 0.38, y: 0.92 });
  for (let i = 0; i < 5; i++) k.add('A', sphere(0.03, 6, 5), i % 2 ? '#e0405a' : '#f2f1ec', { x: 0.38 + Math.cos(i * 1.2) * 0.04, y: 1.1 + (i % 2) * 0.03, z: Math.sin(i * 1.2) * 0.04 });
  k.add('A', box(0.78, 0.98, 0.03), OAK, { y: 1.32, z: -0.23 });
  k.add('M', box(0.68, 0.88, 0.01), '#c3ccd0', { y: 1.37, z: -0.21 });
  k.pop();
  // Coin lecture près de la fenêtre : fauteuil de velours, guéridon, plante.
  armchair(k, { x: -4.75, z: 3.3, ry: 2.4 }, 'F', '#c8a96e');
  k.add('A', cyl(0.22, 0.22, 0.03, 16), OAK, { x: -3.95, y: FLOOR + 0.55, z: 3.55 });
  k.add('A', cyl(0.03, 0.03, 0.55, 6), DARK_OAK, { x: -3.95, y: FLOOR, z: 3.55 });
  k.add('A', box(0.18, 0.04, 0.24), '#2f5f8a', { x: -3.95, y: FLOOR + 0.58, z: 3.55, ry: 0.4 });
  k.add('A', cyl(0.13, 0.1, 0.3, 12), '#efe6d2', { x: r.x0 + 0.24, y: FLOOR, z: Z1 - 0.24 });
  for (let i = 0; i < 6; i++) k.add('A', sphere(1, 8, 6), i % 2 ? '#4f7a3a' : '#5d8a44', { x: r.x0 + 0.24 + Math.cos(i) * 0.08, y: FLOOR + 0.5 + (i % 3) * 0.15, z: Z1 - 0.24 + Math.sin(i) * 0.08, sx: 0.14, sy: 0.22, sz: 0.14 });
  ceilingLamp(k, -3.4, -1.0, 0.2);
}

function* buildSdb(k) {
  const r = ROOMS.sdb;
  shell(k, 'sdb', { floor: '#e4e0d8', wall: '#f3f1ec' });
  yield;
  // Joints du carrelage de sol (grands carreaux de 60 cm).
  for (let x = r.x0 + 0.6; x < r.x1 - 0.1; x += 0.6) k.add('A', box(0.008, 0.002, r.z1 - r.z0), '#cfcac0', { x, y: FLOOR, z: 0 });
  for (let z = r.z0 + 0.6; z < r.z1 - 0.1; z += 0.6) k.add('A', box(r.x1 - r.x0, 0.002, 0.008), '#cfcac0', { x: (r.x0 + r.x1) / 2, y: FLOOR, z });
  // Faïence blanche à mi-hauteur, listel ; douche à l'italienne carrelée de vert profond jusqu'à 2,1 m.
  const zl = (x0, x1, z, h, col) => k.add('L', box(x1 - x0, h, 0.012), col, { x: (x0 + x1) / 2, y: FLOOR, z });
  const xl = (z0, z1, x, h, col) => k.add('L', box(0.012, h, z1 - z0), col, { x, y: FLOOR, z: (z0 + z1) / 2 });
  xl(-2.75, r.z1 - 0.02, r.x0 + LT + 0.006, 1.2, '#f4f2ee');
  xl(r.z0, -0.0, r.x1 - LT - 0.006, 1.2, '#f4f2ee');
  zl(-7.0, r.x1, r.z0 + LT + 0.006, 1.2, '#f4f2ee');
  zl(r.x0, -7.0, r.z0 + LT + 0.006, 2.1, '#2f5a4a');
  xl(r.z0, -2.75, r.x0 + LT + 0.006, 2.1, '#2f5a4a');
  for (let y = 0.3; y < 2.1; y += 0.3) {
    k.add('L', box(1.88, 0.006, 0.006), '#244638', { x: (r.x0 + -7.0) / 2, y: FLOOR + y, z: r.z0 + LT + 0.014 });
    k.add('L', box(0.006, 0.006, 1.2), '#244638', { x: r.x0 + LT + 0.014, y: FLOOR + y, z: (r.z0 - 2.75) / 2 });
  }
  yield;
  // Receveur, bonde, paroi vitrée à profilés noirs, colonne de douche (pomme de tête, mitigeur), niche à flacons.
  k.add('L', box(1.86, 0.035, 1.2), '#f4f2ee', { x: (r.x0 - 7.0) / 2, y: FLOOR, z: (r.z0 - 2.75) / 2 });
  k.add('M', box(0.9, 0.006, 0.05), INK, { x: (r.x0 - 7.0) / 2, y: FLOOR + 0.036, z: r.z0 + 0.2 });
  k.add('G', box(1.12, 1.98, 0.01), '#ffffff', { x: r.x0 + 0.57, y: FLOOR + 0.04, z: -2.75 });
  k.add('M', box(1.14, 0.03, 0.03), INK, { x: r.x0 + 0.57, y: FLOOR + 2.0, z: -2.75 });
  k.add('M', box(0.03, 1.98, 0.03), INK, { x: r.x0 + 1.13, y: FLOOR + 0.04, z: -2.75 });
  k.add('M', box(0.03, 0.03, 1.2), INK, { x: r.x0 + 1.13, y: FLOOR + 2.0, z: (r.z0 - 2.75) / 2 });
  k.push({ x: -7.95, y: FLOOR, z: r.z0 + 0.05 });
  k.add('M', cyl(0.014, 0.014, 2.0, 6), INK, { z: 0.04 });
  k.add('M', box(0.02, 0.02, 0.36), INK, { y: 2.0, z: 0.2 });
  k.add('M', cyl(0.13, 0.13, 0.015, 18), INK, { y: 1.985, z: 0.38 });
  k.add('M', box(0.2, 0.08, 0.06), INK, { y: 1.05, z: 0.05 });
  k.pop();
  k.add('L', box(0.5, 0.3, 0.02), '#244638', { x: -8.5, y: FLOOR + 1.1, z: r.z0 + LT + 0.02 });
  for (let i = 0; i < 3; i++) k.add('L', cyl(0.03, 0.03, 0.16 + i * 0.03, 8), ['#f4f2ee', '#c8a96e', '#2f5f8a'][i], { x: -8.65 + i * 0.12, y: FLOOR + 1.12, z: r.z0 + LT + 0.08 });
  k.add('F', box(0.7, 0.012, 0.45), '#f4f2ee', { x: -7.6, y: FLOOR, z: -2.35 });
  // Meuble vasque de chêne, plan blanc, vasque, mitigeur, miroir rond doré et applique ; gobelet, savon.
  k.push({ x: r.x0 + 0.25, y: FLOOR, z: -1.25, ry: Math.PI / 2 });
  k.add('A', box(1.3, 0.62, 0.5), OAK, { y: 0.18 });
  for (const sx of [-1, 1]) k.add('A', box(0.62, 0.5, 0.012), '#a8825b', { x: sx * 0.32, y: 0.24, z: 0.25 });
  for (const sx of [-1, 1]) k.add('A', box(0.04, 0.18, 0.04), DARK_OAK, { x: sx * 0.6, z: sx * 0.0 + 0.18 });
  k.add('L', box(1.32, 0.04, 0.52), '#f4f2ee', { y: 0.8 });
  k.add('L', lathe([[0, 0], [0.2, 0.02], [0.24, 0.13], [0.22, 0.14], [0.18, 0.04], [0, 0.03]], 18), '#fbfaf6', { y: 0.84, z: 0.02, sz: 0.75 });
  k.add('M', cyl(0.015, 0.015, 0.22, 6), BRASS, { y: 0.84, z: -0.2 });
  k.add('M', box(0.025, 0.025, 0.14), BRASS, { y: 1.04, z: -0.14 });
  k.add('M', disc(0.35, 0.012, 28), '#c3ccd0', { y: 1.6, z: -0.225 });
  k.add('M', torus(0.36, 0.025, 6, 28), BRASS, { y: 1.6, z: -0.21 });
  k.add('M', box(0.4, 0.04, 0.06), BRASS, { y: 2.08, z: -0.22 });
  k.add('E', box(0.32, 0.02, 0.04), '#fff1d0', { y: 2.06, z: -0.2 });
  k.add('L', cyl(0.035, 0.03, 0.1, 10), '#2f5a4a', { x: 0.48, y: 0.84 });
  k.add('L', box(0.08, 0.03, 0.05), '#e9c94a', { x: -0.45, y: 0.84 });
  k.pop();
  yield;
  // WC suspendu et réservoir encastré, porte-rouleau.
  k.push({ x: r.x0 + 0.2, y: FLOOR, z: 0.6, ry: Math.PI / 2 });
  k.add('L', box(0.42, 0.85, 0.16), '#f4f2ee', { y: 0.0, z: -0.12 });
  k.add('L', box(0.18, 0.02, 0.1), '#d9d6cf', { y: 0.86, z: -0.12 });
  k.add('L', lathe([[0, 0], [0.17, 0], [0.2, 0.18], [0.19, 0.2], [0, 0.2]], 16), '#fbfaf6', { y: 0.2, z: 0.17, sz: 1.35 });
  k.add('L', cyl(0.19, 0.19, 0.03, 16), '#f4f2ee', { y: 0.4, z: 0.17, sz: 1.35 });
  k.add('M', box(0.02, 0.02, 0.14), INK, { x: 0.35, y: 0.7, z: -0.12 });
  k.add('F', cyl(0.05, 0.05, 0.11, 10), '#fbfaf6', { x: 0.35, y: 0.645, z: -0.08, rz: Math.PI / 2 });
  k.pop();
  // Sèche-serviettes sur la cloison, serviette ; étagère haute à serviettes pliées, panier à linge, plante.
  k.push({ x: r.x1 - LT, y: FLOOR, z: -1.3, ry: -Math.PI / 2 });
  for (const sx of [-1, 1]) k.add('M', cyl(0.016, 0.016, 1.3, 6), '#e9e6de', { x: sx * 0.27, y: 0.35, z: 0.06 });
  for (let i = 0; i < 9; i++) k.add('M', cyl(0.011, 0.011, 0.54, 5), '#e9e6de', { y: 0.42 + i * 0.14, z: 0.06, rz: Math.PI / 2 });
  k.add('F', box(0.5, 0.6, 0.05), '#9fb7c9', { y: 1.05, z: 0.09 });
  k.add('F', box(0.5, 0.05, 0.1), '#9fb7c9', { y: 1.62, z: 0.06 });
  k.pop();
  k.push({ x: -6.3, y: FLOOR, z: r.z0 + 0.22 });
  for (const sx of [-1, 1]) k.add('A', box(0.04, 1.9, 0.42), OAK, { x: sx * 0.58 });
  for (const y of [0.05, 0.5, 0.95, 1.4, 1.86]) k.add('A', box(1.2, 0.035, 0.42), OAK, { y });
  const tw = ['#f4f2ee', '#9fb7c9', '#2f5a4a', '#e9e2d6'];
  for (let s = 0; s < 3; s++) for (let c = 0; c < 3; c++) for (let j = 0; j < 3; j++) k.add('F', box(0.3, 0.075, 0.3), tw[(s + c + j) % 4], { x: -0.36 + c * 0.36, y: 0.54 + s * 0.45 + j * 0.077 });
  k.add('A', cyl(0.18, 0.16, 0.3, 12), MUSTARD, { x: -0.3, y: 0.07 });
  k.add('A', cyl(0.13, 0.13, 0.22, 12), MUSTARD, { x: 0.25, y: 0.07 });
  k.pop();
  k.add('A', cyl(0.2, 0.17, 0.55, 14), MUSTARD, { x: r.x1 - 0.35, y: FLOOR, z: 0.5 });
  k.add('A', cyl(0.13, 0.1, 0.28, 12), '#efe6d2', { x: r.x0 + 0.3, y: FLOOR, z: Z1 - 0.3 });
  for (let i = 0; i < 6; i++) k.add('A', sphere(1, 8, 6), i % 2 ? '#4f7a3a' : '#5d8a44', { x: r.x0 + 0.3 + Math.cos(i) * 0.08, y: FLOOR + 0.45 + (i % 3) * 0.13, z: Z1 - 0.3 + Math.sin(i) * 0.08, sx: 0.14, sy: 0.22, sz: 0.14 });
  k.add('F', box(0.8, 0.012, 0.5), '#9fb7c9', { x: -8.05, y: FLOOR, z: -1.25, ry: Math.PI / 2 });
  ceilingLamp(k, -7.3, -0.6, 0.18);
}

// Construction de l'intérieur par étapes (une pièce, puis une fusion par matériau à chaque appel) : le monde en fait
// une par image à l'approche de la maison, sans à-coup. Valeur finale : { A, L, F, M, G, E } (géométries ou null),
// repère local.
export function* houseInteriorSteps() {
  const k = new Kit();
  partitions(k);
  yield;
  for (const room of [buildSalon, buildCuisine, buildChambre, buildSdb]) {
    yield* room(k);
    yield;
  }
  // Plafond de toute la maison.
  k.add('A', box(X1 - X0, 0.1, Z1 - Z0), CEILING, { y: CEIL });
  const out = {};
  for (const key of ['A', 'L', 'F', 'M', 'G', 'E']) {
    out[key] = k.geo(key);
    yield;
  }
  return out;
}

// Même géométrie, d'un seul tenant (tests, entrée immédiate).
export function buildHouseInterior() {
  const it = houseInteriorSteps();
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
