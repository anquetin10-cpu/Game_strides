// Boutique d'équitation de Deauville City (commerce « boutique », ancienne Maison Lucette, 10 × 11 m) : aménagement et
// géométrie de l'intérieur (repère local du commerce : façade vers +z, porte au centre, x le long de la façade).
//
//            fond (z = -5,15)
//   [cabine d'essayage][miroir]   [comptoir + bandeau]   [tapis de selle (étagères)]
//   vestes de concours                                    bonnets · guêtres (étagère)
//   et softshells (portant mural)  table des pantalons     tête de cheval (bonnet), porte-couverture
//                                  portant des pantalons   caisson lumineux
//   polos (étagères)               podium bottes & casques mur des accessoires (gants, casquettes,
//                                                          ceintures, chaussettes)
//   [vitrine : mannequin de concours]  porte  [vitrine : selle, tapis, guêtres, bonnet]
//
// Rayons (fixtures, catégories du catalogue), collisions du mobilier [x, z, demi-largeur, demi-profondeur, hauteur],
// six points lumineux, vendeuse au comptoir et deux clientes, panneaux de marque (storeBrand.js : neutres tant que la
// marque partenaire n'est pas autorisée). Les couleurs des articles exposés reprennent celles du catalogue.
import { box, cyl, sphere } from './shapes.js';
import { t } from '../core/i18n.js';
import { horseBust } from '../entities/horse/bonnet.js';
import {
  FLOOR_Y, torus, roomShell, saddle, padStack, bootsPair, helmet, ridingBoots, garment, shelving, pendant, tag,
} from './shopGeo.js';

const F = FLOOR_Y;
const OAK = '#a0784e';
const DARK = '#2b2f33';
const BRASS = '#b08d57';
const STEEL = '#8d9296';
const CUSTOMER = (top, pants, sex = 'f', hair = '#5a3a24') => ({ sex, top, sleeve: top, pants, boots: '#2a2622', skin: sex === 'f' ? '#e8bea0' : '#dcab88', hair, logo: false });

// Couleurs du catalogue (data.js) reprises par les articles exposés.
const JACKETS = ['#1f2b45', '#17181b', '#5e1f2b'];
const BREECHES = ['#d9c7a0', '#f4f3ef', '#1f2b45', '#1b1c1f'];
const POLOS = ['#f4f3ef', '#1f2b45', '#f2f1ec', '#8a8f96', '#6e2433', '#4b4a33'];
const PADS = [['#3b3f45', '#e9e6df'], ['#2f4a3a', '#c8a96e'], ['#7fa7c9', '#f2f1ec'], ['#1f2b45', '#f2f1ec'], ['#eeede8', '#1b1c1f'], ['#5e1f2b', '#c8a96e']];
const BONNETS = [['#1f2b45', '#f2f1ec'], ['#eeede8', '#1f2b45'], ['#5e1f2b', '#c8a96e']];

export const STORE_STAFF = {
  name: 'Hélène Marchand', role: t('Conseillère de vente'), initials: 'HM',
  outfit: { sex: 'f', top: '#1f2b45', sleeve: '#1f2b45', pants: '#e9e3d6', boots: '#1b1c1f', skin: '#e8bea0', hair: '#2a1d14', hairStyle: 'bun', logo: false },
};

export const STORE_LAYOUT = {
  spawn: [0, 4.3], exit: [0, 4.95],
  fixtures: [
    { id: 'vestes', label: t('Vestes'), cats: ['vestes'], at: [-3.25, -1.4] },
    { id: 'hauts', label: t('Polos'), cats: ['hauts'], at: [-3.35, 2.35] },
    { id: 'pantalons', label: t('Pantalons'), cats: ['pantalons'], at: [-1.0, 0.45] },
    { id: 'casques', label: t('Bottes & casques'), cats: ['casques'], at: [1.75, 1.45] },
    { id: 'accessoires', label: t('Accessoires'), cats: ['accessoires'], at: [3.4, 2.4] },
    { id: 'cheval', label: t('Équipement du cheval'), cats: ['cheval'], at: [3.05, -1.75] },
    { id: 'cabine', label: t('Cabine d’essayage'), title: t('Cabine d’essayage'), cats: ['vestes', 'hauts', 'pantalons', 'accessoires', 'casques'], tryOn: true, at: [-2.05, -3.55] },
    { id: 'comptoir', label: t('Comptoir'), counter: true, at: [0.6, -2.7] },
  ],
  colliders: [
    // Portant des vestes (mur gauche), étagères des polos.
    [-4.33, -1.4, 0.34, 2.3, 2.0], [-4.42, 2.4, 0.26, 1.18, 2.2],
    // Table et portant des pantalons, podium des bottes et casques.
    [-1.0, -0.6, 0.92, 0.52, 0.95], [-1.0, 1.55, 0.8, 0.24, 1.6], [1.75, 0.2, 0.62, 0.62, 1.4],
    // Mur des accessoires, caisson lumineux.
    [4.42, 2.1, 0.26, 1.55, 2.3],
    // Coin du cheval : étagère des tapis (fond), étagère des bonnets et guêtres, tête de cheval, porte-couverture.
    [3.45, -4.88, 1.2, 0.3, 2.3], [4.42, -3.1, 0.26, 0.84, 2.0], [3.95, -1.35, 0.52, 0.34, 2.0], [2.75, -3.0, 0.42, 0.78, 1.5],
    // Cabine d'essayage, pouf, comptoir.
    [-3.75, -4.5, 0.92, 0.68, 2.3], [-1.35, -4.55, 0.3, 0.3, 0.45], [0.6, -3.6, 1.32, 0.34, 1.0],
    // Podiums des vitrines, plantes de l'entrée.
    [-2.85, 4.5, 0.97, 0.42, 1.0], [2.85, 4.5, 0.97, 0.42, 1.0], [-1.6, 3.8, 0.22, 0.22, 1.2], [1.6, 3.8, 0.22, 0.22, 1.2],
  ],
  lights: [[-2.4, 2.9, -1.0, 0.95], [2.5, 2.9, -2.6, 0.95], [0.6, 2.9, -3.7, 0.85], [-2.6, 2.9, 2.6, 0.85], [2.6, 2.9, 1.9, 0.85], [0, 2.9, 4.2, 0.7]],
  seller: { at: [0.6, -4.45], ry: 0 },
  extras: [
    { at: [-3.4, -0.45], ry: -Math.PI / 2, outfit: CUSTOMER('#6e2433', '#d9c7a0', 'f', '#2a1d14'), name: t('Cliente') },
    { at: [3.5, 3.15], ry: Math.PI / 2, outfit: { ...CUSTOMER('#2f5a3c', '#f2f1ec', 'f', '#7a4a28'), hairStyle: 'ponytail' }, name: t('Cliente') },
  ],
  // Bandeau rétroéclairé derrière le comptoir, caisson lumineux (centres, repère du commerce).
  signs: [
    { kind: 'brand', w: 2.1, h: 0.52, x: 0.6, y: 2.55, z: -5.1, ry: 0 },
    { kind: 'poster', w: 0.8, h: 1.16, x: 4.6, y: 1.6, z: -0.2, ry: -Math.PI / 2 },
  ],
};

// ---------- Pièces ----------

// Pantalon d'équitation suspendu à une pince (repère : la tringle, face à +z) : ceinture, deux jambes, basanes.
function breechesHung(k, tf, color) {
  k.push(tf);
  k.add('M', box(0.34, 0.03, 0.012), STEEL, { y: -0.06 });
  k.add('F', box(0.34, 0.07, 0.05), color, { y: -0.14 });
  for (const s of [-1, 1]) {
    k.add('F', box(0.16, 0.5, 0.05), color, { x: s * 0.085, y: -0.62, rz: s * 0.02 });
    k.add('F', box(0.12, 0.42, 0.045), color, { x: s * 0.09, y: -1.02, rz: s * 0.015 });
    // Fond de peau (silicone) au genou.
    k.add('F', box(0.1, 0.16, 0.052), color === '#1b1c1f' ? '#2c2d31' : '#4a4a4f', { x: s * 0.088, y: -0.82 });
  }
  k.pop();
}

// Pile de vêtements pliés.
function folded(k, tf, color, n = 5, w = 0.34, d = 0.27) {
  k.push(tf);
  for (let i = 0; i < n; i++) {
    const j = ((i * 37) % 7) / 220;
    k.add('F', box(w, 0.045, d), color, { y: i * 0.047, x: j, ry: j * 0.8 });
  }
  k.pop();
}

// Paire de gants accrochée à une broche (repère : la broche au mur, face à +z).
function glovesPeg(k, tf, color) {
  k.push(tf);
  k.add('M', cyl(0.006, 0.006, 0.16, 6, false), STEEL, { z: 0.08, rx: Math.PI / 2 });
  for (const s of [-1, 1]) {
    k.add('F', box(0.085, 0.12, 0.02), color, { x: s * 0.022, y: -0.15, z: 0.08 + s * 0.012, rz: s * 0.08 });
    k.add('F', box(0.08, 0.075, 0.016), color, { x: s * 0.026, y: -0.25, z: 0.08 + s * 0.012, rz: s * 0.08 });
    k.add('F', box(0.088, 0.03, 0.022), '#c9cdd0', { x: s * 0.02, y: -0.08, z: 0.08 + s * 0.012 });
  }
  k.pop();
}

// Casquette sur un crochet (repère : le crochet, visière vers +z).
function capHook(k, tf, color) {
  k.push(tf);
  k.add('M', cyl(0.006, 0.006, 0.1, 6), STEEL, { z: 0.05, rx: Math.PI / 2 });
  k.add('F', sphere(1, 10, 6), color, { y: -0.04, z: 0.1, sx: 0.1, sy: 0.075, sz: 0.11 });
  k.add('F', box(0.15, 0.012, 0.1), color, { y: -0.05, z: 0.24, rx: 0.15 });
  k.pop();
}

// Ceinture enroulée posée.
function beltCoil(k, tf, color) {
  k.push(tf);
  k.add('L', torus(0.05, 0.012, 3, 12), color, { y: 0.014, rx: Math.PI / 2, sz: 0.6 });
  k.add('M', box(0.035, 0.025, 0.012), '#c9cdd0', { y: 0.02, z: 0.06 });
  k.pop();
}

// Paire de chaussettes roulées.
function socks(k, tf, color, stripe) {
  k.push(tf);
  for (const s of [-1, 1]) {
    k.add('F', cyl(0.032, 0.032, 0.11, 6, false), s < 0 ? color : stripe, { x: s * 0.034, rz: Math.PI / 2, y: 0.032 });
  }
  k.pop();
}

// Bonnet anti-mouches présenté sur une broche (calotte, oreilles tricotées, cordon).
function bonnetPeg(k, tf, color, trim) {
  k.push(tf);
  k.add('M', cyl(0.006, 0.006, 0.12, 6), STEEL, { z: 0.06, rx: Math.PI / 2 });
  k.add('F', sphere(1, 8, 5), color, { y: -0.06, z: 0.12, sx: 0.12, sy: 0.07, sz: 0.06 });
  for (const s of [-1, 1]) {
    k.add('F', cyl(0.004, 0.035, 0.15, 6), color, { x: s * 0.06, y: -0.04, z: 0.12, rz: -s * 0.25 });
    k.add('F', cyl(0.037, 0.037, 0.012, 6), trim, { x: s * 0.064, y: -0.035, z: 0.12, rz: -s * 0.25 });
  }
  k.add('F', box(0.24, 0.02, 0.07), trim, { y: -0.12, z: 0.12 });
  k.pop();
}

// Couverture pliée sur la barre d'un porte-couverture (repère : milieu de la barre, barre selon z).
function rugOnBar(k, tf, color, trim) {
  k.push(tf);
  k.add('F', box(0.14, 0.05, 1.32), color, { y: 0.0 });
  for (const s of [-1, 1]) {
    k.add('F', box(0.03, 0.62, 1.3), color, { x: s * 0.075, y: -0.6, rz: s * 0.06 });
    k.add('F', box(0.034, 0.05, 1.31), trim, { x: s * 0.11, y: -0.6, rz: s * 0.06 });
  }
  k.pop();
}

// Mannequin de cavalier (sans visage) en tenue de concours : veste à basques, chemise blanche, pantalon, bottes.
function riderMannequin(k, tf, { jacket, breeches, boots = '#121214', helm = '#1b1c1f', gloves = null }) {
  k.push(tf);
  const head = '#e9e2d6';
  k.add('M', cyl(0.2, 0.22, 0.03, 16), '#1b1c1f');
  for (const s of [-1, 1]) {
    ridingBoots(k, { x: s * 0.1, y: 0.03, z: 0.0 }, boots);
    k.add('L', cyl(0.06, 0.058, 0.32, 10), boots, { x: s * 0.1, y: 0.1 });
    k.add('F', cyl(0.075, 0.062, 0.42, 10), breeches, { x: s * 0.1, y: 0.44 });
  }
  k.add('F', cyl(0.15, 0.15, 0.2, 12), breeches, { y: 0.82, sz: 0.75 });
  k.add('F', cyl(0.16, 0.15, 0.58, 12), jacket, { y: 0.98, sz: 0.72 });
  // Basques de la veste.
  k.add('F', box(0.32, 0.22, 0.04), jacket, { y: 0.86, z: -0.1, rx: -0.12 });
  k.add('F', sphere(1, 12, 8), jacket, { y: 1.55, sx: 0.22, sy: 0.07, sz: 0.12 });
  k.add('F', cyl(0.062, 0.07, 0.08, 10), '#f4f3ef', { y: 1.56 });
  k.add('F', box(0.08, 0.18, 0.02), '#f4f3ef', { y: 1.38, z: 0.11 });
  for (const s of [-1, 1]) {
    k.add('F', cyl(0.05, 0.044, 0.56, 8), jacket, { x: s * 0.21, y: 1.0, rz: s * 0.08 });
    k.add('A', sphere(1, 8, 6), gloves || head, { x: s * 0.235, y: 0.97, sx: 0.04, sy: 0.06, sz: 0.035 });
  }
  k.add('A', cyl(0.035, 0.04, 0.1, 8), head, { y: 1.62 });
  k.add('A', sphere(1, 12, 10), head, { y: 1.81, sx: 0.09, sy: 0.115, sz: 0.1 });
  helmet(k, { y: 1.86, z: 0.0 }, helm);
  k.pop();
}

// Tête de cheval de présentation (résine) sur sa colonne, avec son bonnet (repère : centre du dessus de la colonne).
function horseHead(k, tf, resin, [bc, bt]) {
  const B = horseBust();
  k.push(tf);
  k.add('L', B.body, resin, { y: -0.02 });
  k.add('L', B.eyes, '#1b1c1f', { y: -0.02 });
  // Bonnet : couleur principale et cordon (bords), peints sommet par sommet.
  const g = B.bonnet.clone();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c1 = hexRGB(bc), c2 = hexRGB(bt);
  for (let i = 0; i < n; i++) col.set(B.trimMask[i] ? c2 : c1, i * 3);
  g.setAttribute('color', new (g.attributes.position.constructor)(col, 3));
  k.add('F', g, null, { y: -0.02 });
  k.pop();
}
function hexRGB(hex) {
  const v = parseInt(hex.slice(1), 16);
  // Couleurs de sommets en espace linéaire (comme paint).
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [lin(((v >> 16) & 255) / 255), lin(((v >> 8) & 255) / 255), lin((v & 255) / 255)];
}

// ---------- Aménagement ----------

export function buildStore(k, spec) {
  const G = spec.G;
  roomShell(k, spec, { floor: spec.floor, wall: spec.walls, wainscot: DARK, wainH: 0.95, skirting: DARK });
  // Parquet : joints des lames (de la porte vers le fond).
  for (let i = 0; i < 46; i++) k.add('A', box(0.008, 0.003, 10.3), '#80603f', { x: -4.6 + i * 0.2, y: F, z: 0 });
  // Tapis d'entrée et tapis de laine au centre.
  k.add('F', box(1.8, 0.012, 1.0), DARK, { x: 0, y: F, z: 4.4 });
  k.add('F', box(2.6, 0.01, 1.7), '#d9cdb8', { x: 0.4, y: F, z: 1.2 });
  // Rails d'éclairage au plafond et spots orientables.
  for (const x of [-2.4, 2.5]) {
    k.add('M', box(0.05, 0.04, 8.8), '#1b1c1f', { x, y: G - 0.16, z: -0.4 });
    for (let i = 0; i < 5; i++) {
      const z = -4.2 + i * 2.0;
      k.add('M', cyl(0.045, 0.035, 0.16, 8), '#1b1c1f', { x, y: G - 0.32, z, rx: x < 0 ? 0.45 : -0.45, rz: x < 0 ? 0.35 : -0.35 });
      k.add('E', sphere(1, 8, 6), '#fff4dc', { x: x + (x < 0 ? -0.04 : 0.04), y: G - 0.36, z: z + 0.04, sx: 0.03, sy: 0.03, sz: 0.03 });
    }
  }

  // --- Mur gauche : vestes de concours et softshells sur un portant mural ---
  k.add('M', cyl(0.016, 0.016, 4.6, 6, false), STEEL, { x: -4.32, y: F + 1.78, z: -1.4, rx: Math.PI / 2 });
  for (const z of [-3.6, -1.4, 0.8]) k.add('M', box(0.34, 0.03, 0.03), STEEL, { x: -4.5, y: F + 1.78, z });
  const rail = [...JACKETS, ...JACKETS, '#1b1c1f', '#24324a', '#1b1c1f', '#24324a', JACKETS[0], JACKETS[1]];
  rail.forEach((c, i) => {
    const soft = i >= 6 && i < 10;
    garment(k, { x: -4.32, y: F + 1.78, z: -3.45 + i * 0.36, ry: Math.PI / 2 }, c, { len: soft ? 0.6 : 0.74, wid: 0.46, collar: soft ? c : '#f4f3ef' });
  });
  tag(k, { x: -4.1, y: F + 1.1, z: -3.1, ry: Math.PI / 2 });
  tag(k, { x: -4.1, y: F + 1.1, z: -0.4, ry: Math.PI / 2 });
  // Au-dessus : frise de cadres (photographies de concours : aplats).
  for (let i = 0; i < 3; i++) {
    const z = -3.0 + i * 1.6;
    k.add('A', box(0.04, 0.6, 0.9), '#1b1c1f', { x: -4.62, y: F + 2.35, z });
    k.add('A', box(0.045, 0.5, 0.8), ['#6e8a9e', '#7a6a4f', '#5e6b52'][i], { x: -4.61, y: F + 2.4, z });
  }

  // --- Mur gauche, devant : polos pliés sur étagères, trois polos suspendus ---
  shelving(k, { x: -4.42, y: F, z: 2.4, ry: Math.PI / 2 }, 2.3, 0.46, [0.1, 0.55, 1.0, 1.45], OAK, '#e8e1d3');
  for (let s = 0; s < 3; s++) for (let c = 0; c < 4; c++) folded(k, { x: -4.4, y: F + 0.14 + s * 0.45, z: 1.6 + c * 0.53, ry: Math.PI / 2 }, POLOS[(s * 2 + c) % POLOS.length], 4);
  k.add('M', cyl(0.014, 0.014, 2.0, 6, false), STEEL, { x: -4.32, y: F + 2.12, z: 2.4, rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) garment(k, { x: -4.32, y: F + 2.12, z: 1.7 + i * 0.46, ry: Math.PI / 2 }, POLOS[i], { len: 0.42, wid: 0.42, collar: i === 1 ? '#f2f1ec' : POLOS[i] });

  // --- Centre : table des pantalons pliés, portant des pantalons suspendus ---
  k.push({ x: -1.0, y: F, z: -0.6 });
  k.add('A', box(1.8, 0.05, 1.0), OAK, { y: 0.78 });
  k.add('A', box(1.7, 0.06, 0.9), OAK, { y: 0.2 });
  for (const [sx, sz] of [[-0.84, -0.44], [0.84, -0.44], [-0.84, 0.44], [0.84, 0.44]]) k.add('A', box(0.05, 0.78, 0.05), DARK, { x: sx, z: sz });
  BREECHES.forEach((c, i) => {
    folded(k, { x: -0.62 + i * 0.41, y: 0.83, z: -0.18 }, c, 5, 0.32, 0.26);
    folded(k, { x: -0.62 + i * 0.41, y: 0.83, z: 0.2 }, c, 3, 0.32, 0.26);
    folded(k, { x: -0.62 + i * 0.41, y: 0.26, z: 0 }, c, 4, 0.32, 0.26);
  });
  tag(k, { x: -0.7, y: 0.83, z: 0.48, rx: -0.5 });
  tag(k, { x: 0.5, y: 0.83, z: 0.48, rx: -0.5 });
  k.pop();
  k.push({ x: -1.0, y: F, z: 1.55 });
  for (const s of [-1, 1]) {
    k.add('M', cyl(0.016, 0.016, 1.6, 6), STEEL, { x: s * 0.75 });
    k.add('M', box(0.06, 0.02, 0.4), STEEL, { x: s * 0.75, y: 0.01 });
  }
  k.add('M', cyl(0.014, 0.014, 1.56, 6, false), STEEL, { y: 1.6, rz: Math.PI / 2 });
  for (let i = 0; i < 8; i++) breechesHung(k, { x: -0.6 + i * 0.17, y: 1.6, ry: Math.PI / 2 }, BREECHES[i % 4]);
  k.pop();

  // --- Podium des bottes et casques (trois plateaux ronds) ---
  k.push({ x: 1.75, y: F, z: 0.2 });
  k.add('A', cyl(0.6, 0.6, 0.32, 20), DARK);
  k.add('A', cyl(0.42, 0.42, 0.34, 18), OAK, { y: 0.32 });
  k.add('A', cyl(0.25, 0.25, 0.3, 16), DARK, { y: 0.66 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    ridingBoots(k, { x: Math.cos(a) * 0.5, y: 0.32, z: Math.sin(a) * 0.5, ry: -a + Math.PI / 2 }, i % 2 ? '#4a2c1a' : '#121214');
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.add('M', cyl(0.012, 0.012, 0.18, 6), STEEL, { x: Math.cos(a) * 0.32, y: 0.66, z: Math.sin(a) * 0.32 });
    helmet(k, { x: Math.cos(a) * 0.32, y: 0.92, z: Math.sin(a) * 0.32, ry: -a + Math.PI / 2 }, ['#1c1d20', '#1f2b45', '#1c1d20'][i]);
  }
  k.add('M', cyl(0.012, 0.012, 0.22, 6), STEEL, { y: 0.96 });
  helmet(k, { y: 1.26, ry: 0.4 }, '#1c1d20');
  tag(k, { x: 0, y: 0.34, z: 0.61, rx: -0.3 });
  k.pop();

  // --- Mur droit, devant : mur des accessoires (panneau rainuré) ---
  k.add('A', box(0.04, 2.1, 3.0), '#e3dccf', { x: 4.62, y: F + 0.3, z: 2.1 });
  for (let r = 0; r < 14; r++) k.add('A', box(0.045, 0.012, 3.0), '#cfc6b6', { x: 4.62, y: F + 0.4 + r * 0.14, z: 2.1 });
  // Gants (deux rangées), casquettes, ceintures et chaussettes en bacs.
  const GLOVES = ['#17181b', '#ecebe6', '#17181b', '#5a3520', '#ecebe6', '#1f2b45'];
  for (let i = 0; i < 6; i++) {
    glovesPeg(k, { x: 4.6, y: F + 1.95, z: 0.85 + i * 0.42, ry: -Math.PI / 2 }, GLOVES[i]);
    glovesPeg(k, { x: 4.6, y: F + 1.55, z: 0.85 + i * 0.42, ry: -Math.PI / 2 }, GLOVES[(i + 3) % 6]);
  }
  const CAPS = ['#f2f1ec', '#1f2b45', '#c8b48e', '#f2f1ec', '#1f2b45'];
  for (let i = 0; i < 5; i++) capHook(k, { x: 4.6, y: F + 2.3, z: 0.95 + i * 0.52, ry: -Math.PI / 2 }, CAPS[i]);
  // Tablette des ceintures.
  k.add('A', box(0.3, 0.03, 2.8), OAK, { x: 4.47, y: F + 1.08, z: 2.1 });
  for (let i = 0; i < 7; i++) beltCoil(k, { x: 4.45, y: F + 1.11, z: 0.9 + i * 0.4 }, ['#3a2516', '#1b1c1f', '#5a3520'][i % 3]);
  // Bacs à chaussettes.
  for (let i = 0; i < 3; i++) {
    const z = 1.0 + i * 0.95;
    k.add('A', box(0.4, 0.28, 0.8), DARK, { x: 4.42, y: F + 0.35, z });
    for (let j = 0; j < 4; j++) socks(k, { x: 4.36 + (j % 2) * 0.1, y: F + 0.6, z: z - 0.2 + Math.floor(j / 2) * 0.36, ry: Math.PI / 2 }, ['#1f2b45', '#f2f1ec', '#5e1f2b'][i], j % 2 ? '#c8a96e' : '#8a8f96');
  }
  k.add('A', box(0.3, 0.35, 2.8), DARK, { x: 4.47, y: F, z: 2.1 });

  // --- Coin du cheval ---
  // Étagère des tapis de selle (mur du fond, à droite).
  shelving(k, { x: 3.45, y: F, z: -4.88 }, 2.35, 0.55, [0.1, 0.6, 1.1, 1.6, 2.1], OAK, '#e8e1d3');
  for (let s = 0; s < 4; s++) for (let c = 0; c < 4; c++) {
    const [col, trim] = PADS[(s * 3 + c) % PADS.length];
    padStack(k, { x: 2.6 + c * 0.56, y: F + 0.14 + s * 0.5, z: -4.86 }, col, 4 + ((s + c) % 3), trim);
  }
  // Étagère des bonnets (en haut) et des guêtres (en bas), mur droit.
  shelving(k, { x: 4.42, y: F, z: -3.1, ry: -Math.PI / 2 }, 1.68, 0.46, [0.1, 0.55, 1.0, 1.45], OAK, '#e8e1d3');
  for (let i = 0; i < 3; i++) {
    bootsPair(k, { x: 4.4, y: F + 0.14, z: -3.62 + i * 0.52, ry: -Math.PI / 2 }, 'guetres', ['#1f2b45', '#e9e8e2', '#17181b'][i]);
    bootsPair(k, { x: 4.4, y: F + 0.59, z: -3.62 + i * 0.52, ry: -Math.PI / 2 }, 'guetres', ['#e9e8e2', '#17181b', '#1f2b45'][i]);
  }
  for (let i = 0; i < 3; i++) {
    const [c, tr] = BONNETS[i];
    bonnetPeg(k, { x: 4.6, y: F + 1.38, z: -3.55 + i * 0.45, ry: -Math.PI / 2 }, c, tr);
    bonnetPeg(k, { x: 4.6, y: F + 1.85, z: -3.55 + i * 0.45, ry: -Math.PI / 2 }, BONNETS[(i + 1) % 3][0], BONNETS[(i + 1) % 3][1]);
  }
  tag(k, { x: 4.18, y: F + 0.6, z: -2.4, ry: -Math.PI / 2 });
  // Tête de cheval de présentation (résine blanche) sur colonne, bonnet marine, licol.
  k.add('A', box(0.5, 1.02, 0.5), DARK, { x: 4.12, y: F, z: -1.35 });
  k.add('A', box(0.56, 0.04, 0.56), OAK, { x: 4.12, y: F + 1.02, z: -1.35 });
  horseHead(k, { x: 4.12, y: F + 1.06, z: -1.35, ry: -Math.PI / 2 }, '#ebe7de', BONNETS[0]);
  // Porte-couverture : pieds, barre, couverture d'écurie pliée.
  k.push({ x: 2.75, y: F, z: -3.0 });
  for (const s of [-1, 1]) {
    k.add('M', box(0.5, 0.03, 0.05), '#1b1c1f', { z: s * 0.7 });
    k.add('M', cyl(0.018, 0.018, 1.3, 6), '#1b1c1f', { z: s * 0.7 });
  }
  k.add('M', cyl(0.022, 0.022, 1.5, 8, false), '#1b1c1f', { y: 1.3, rx: Math.PI / 2 });
  rugOnBar(k, { y: 1.33 }, '#24324a', '#c8a96e');
  k.pop();

  // --- Fond, à gauche : cabine d'essayage (rideau), grand miroir, pouf ---
  k.add('A', box(0.06, 2.3, 1.3), '#e8e1d3', { x: -2.85, y: F, z: -4.5 });
  k.add('A', box(0.08, 0.06, 1.34), OAK, { x: -2.85, y: F + 2.3, z: -4.5 });
  k.add('M', cyl(0.014, 0.014, 1.8, 6, false), BRASS, { x: -3.75, y: F + 2.25, z: -3.86, rz: Math.PI / 2 });
  // Rideau à plis (ouvert sur un tiers).
  for (let i = 0; i < 9; i++) k.add('F', box(0.15, 2.08, 0.04), i % 2 ? '#5e1f2b' : '#6e2a36', { x: -4.55 + i * 0.13, y: F + 0.12, z: -3.86 + (i % 2) * 0.04 });
  k.add('A', box(0.6, 0.42, 0.36), OAK, { x: -4.25, y: F, z: -4.85 });
  k.add('M', box(0.02, 1.2, 0.5), '#c3ccd0', { x: -4.62, y: F + 0.7, z: -4.5 });
  for (const z of [-4.2, -4.8]) k.add('M', cyl(0.008, 0.008, 0.08, 6, false), BRASS, { x: -2.9, y: F + 1.7, z, rz: Math.PI / 2 });
  // Grand miroir sur pied (fond).
  k.add('A', box(1.1, 2.15, 0.06), BRASS, { x: -2.05, y: F + 0.05, z: -5.08 });
  k.add('M', box(0.98, 2.03, 0.02), '#c3ccd0', { x: -2.05, y: F + 0.11, z: -5.04 });
  k.add('L', cyl(0.3, 0.3, 0.42, 16), '#5e1f2b', { x: -1.35, y: F, z: -4.55 });
  k.add('A', cyl(0.31, 0.31, 0.02, 16), BRASS, { x: -1.35, y: F + 0.42, z: -4.55 });

  // --- Comptoir : caisse, terminal, sacs, présentoir de gants ; derrière, rangement et bandeau de marque ---
  k.push({ x: 0.6, y: F, z: -3.6 });
  k.add('A', box(2.6, 0.95, 0.62), DARK);
  k.add('A', box(2.7, 0.05, 0.7), OAK, { y: 0.95 });
  for (let i = 0; i < 4; i++) k.add('A', box(0.58, 0.6, 0.02), '#33383d', { x: -0.95 + i * 0.63, y: 0.18, z: 0.32 });
  k.add('A', box(0.34, 0.12, 0.28), '#1b1c1f', { x: 0.75, y: 1.0 });
  k.add('A', box(0.28, 0.2, 0.02), '#2a3a4a', { x: 0.75, y: 1.13, z: -0.06, rx: -0.3 });
  k.add('A', box(0.08, 0.02, 0.14), '#1b1c1f', { x: 0.3, y: 1.0, z: 0.15 });
  // Sacs en papier (crème, poignées sombres).
  for (let i = 0; i < 3; i++) {
    k.add('A', box(0.3, 0.36, 0.12), '#efe9dc', { x: -1.0 + i * 0.06, y: 1.0, z: -0.12 + i * 0.05 });
    k.add('A', torus(0.06, 0.006, 3, 10, Math.PI), '#1b1c1f', { x: -1.0 + i * 0.06, y: 1.36, z: -0.12 + i * 0.05 });
  }
  // Présentoir de gants sur le comptoir.
  k.add('A', box(0.3, 0.04, 0.2), OAK, { x: -0.3, y: 0.97, z: 0.1 });
  for (let i = 0; i < 3; i++) k.add('F', box(0.08, 0.02, 0.14), ['#17181b', '#ecebe6', '#1f2b45'][i], { x: -0.4 + i * 0.1, y: 1.01 + i * 0.012, z: 0.1, ry: 0.2 });
  k.pop();
  // Derrière la vendeuse : meuble bas, boîtes à bottes, piles de pantalons.
  k.add('A', box(2.6, 0.9, 0.45), DARK, { x: 0.6, y: F, z: -4.92 });
  k.add('A', box(2.7, 0.04, 0.5), OAK, { x: 0.6, y: F + 0.9, z: -4.92 });
  for (let i = 0; i < 5; i++) {
    k.add('A', box(0.36, 0.14, 0.24), i % 2 ? '#1b1c1f' : '#efe9dc', { x: -0.4 + i * 0.5, y: F + 0.94, z: -4.95 });
    k.add('A', box(0.36, 0.14, 0.24), i % 2 ? '#efe9dc' : '#1b1c1f', { x: -0.4 + i * 0.5, y: F + 1.08, z: -4.95 });
  }
  k.add('A', box(2.6, 0.04, 0.32), OAK, { x: 0.6, y: F + 1.75, z: -5.0 });
  BREECHES.forEach((c, i) => folded(k, { x: -0.3 + i * 0.6, y: F + 1.79, z: -5.0 }, c, 3, 0.3, 0.24));
  for (const x of [-0.35, 1.55]) pendant(k, x, -3.55, G - 0.1, { drop: 0.8, shadeColor: DARK });
  pendant(k, 0.0, 4.2, G - 0.1, { drop: 0.7, shadeColor: DARK });

  // --- Vitrines ---
  for (const x of [-2.85, 2.85]) {
    k.add('A', box(1.9, 0.3, 0.8), DARK, { x, y: F, z: 4.5 });
    k.add('F', box(1.84, 0.01, 0.74), '#efe9dc', { x, y: F + 0.3, z: 4.5 });
  }
  // Vitrine gauche : cavalier en tenue de concours, pile de pantalons, gants.
  riderMannequin(k, { x: -3.25, y: F + 0.31, z: 4.5, ry: 0.25 }, { jacket: '#1f2b45', breeches: '#f4f3ef', gloves: '#ecebe6' });
  folded(k, { x: -2.25, y: F + 0.31, z: 4.55, ry: 0.2 }, '#f4f3ef', 4, 0.32, 0.26);
  folded(k, { x: -2.25, y: F + 0.5, z: 4.55, ry: -0.1 }, '#d9c7a0', 3, 0.32, 0.26);
  k.add('A', box(0.24, 0.3, 0.16), OAK, { x: -2.6, y: F + 0.31, z: 4.75 });
  k.add('F', box(0.085, 0.12, 0.02), '#17181b', { x: -2.6, y: F + 0.62, z: 4.75, rx: -0.2 });
  // Vitrine droite : selle sur chevalet avec son tapis, guêtres, bonnet, pile de tapis.
  k.push({ x: 3.15, y: F + 0.31, z: 4.5 });
  k.add('A', box(0.08, 0.72, 0.08), OAK, { z: -0.22 });
  k.add('A', box(0.08, 0.72, 0.08), OAK, { z: 0.22 });
  k.add('A', box(0.1, 0.08, 0.7), OAK, { y: 0.72 });
  saddle(k, { y: 0.89, ry: Math.PI / 2 }, '#2a1a12', '#24324a', '#c8a96e');
  k.pop();
  bootsPair(k, { x: 2.2, y: F + 0.31, z: 4.65, ry: 0.3 }, 'guetres', '#1f2b45');
  padStack(k, { x: 2.25, y: F + 0.31, z: 4.3, ry: 0.15 }, '#2f4a3a', 4, '#c8a96e');
  bonnetPeg(k, { x: 3.8, y: F + 1.25, z: 4.2, ry: 0 }, '#eeede8', '#1f2b45');
  k.add('M', cyl(0.012, 0.012, 0.9, 6), STEEL, { x: 3.8, y: F + 0.31, z: 4.2 });
  tag(k, { x: 2.85, y: F + 0.32, z: 4.88, rx: -0.6 });

  // Plantes vertes de part et d'autre de l'entrée.
  for (const x of [-1.6, 1.6]) {
    k.add('A', cyl(0.18, 0.15, 0.4, 12), DARK, { x, y: F, z: 3.8 });
    k.add('A', sphere(1, 10, 8), '#4f7a3a', { x, y: F + 0.85, z: 3.8, sx: 0.3, sy: 0.5, sz: 0.3 });
  }
}
