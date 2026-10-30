// Intérieurs des commerces de Deauville City (repère local du commerce, voir shopGeo.js), construits à la demande.
// Chaque aménagement renvoie : la géométrie par matériau (Kit), les points lumineux (shader d'éclairage intérieur),
// les rayons (fixtures : point d'interaction, catégories du catalogue), les collisions du mobilier, le personnel et
// les clients, le point d'arrivée et la sortie. Les collisions et les rayons ne dépendent pas de la géométrie :
// layout(id) les donne sans rien construire.
import { box, cyl, sphere } from './shapes.js';
import { t } from '../core/i18n.js';
import {
  Kit, WALL_T, FLOOR_Y, torus, lathe, capsule, roomShell, saddle, bridle, halter, padStack, bootsPair, helmet,
  ridingBoots, garment, mannequin, shelving, pendant, tag,
} from './shopGeo.js';

const F = FLOOR_Y;
const OAK = '#8a6240';
const DARK_OAK = '#4f3a28';

// Personnel et clientèle (tenues des personnages non joueurs).
const STAFF = {
  sellerie: { name: 'Margaux Leroy', role: t('Sellière'), initials: 'ML', outfit: { sex: 'f', top: '#c8a96e', sleeve: '#c8a96e', pants: '#3a3d42', boots: '#2a2622', skin: '#eac2a0', hair: '#7a4a28', ponytail: true, logo: false } },
  cafe: { name: 'Paul Hamel', role: t('Boulanger'), initials: 'PH', outfit: { sex: 'm', top: '#f2f1ec', sleeve: '#f2f1ec', pants: '#2b3442', boots: '#2a2622', skin: '#dcab88', hair: '#3b2717', logo: false } },
  boutique: { name: 'Hélène Marchand', role: 'Maison Lucette', initials: 'HM', outfit: { sex: 'f', top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#e9e3d6', boots: '#1b1c1f', skin: '#e8bea0', hair: '#2a1d14', hairStyle: 'bun', logo: false } },
};
const CUSTOMER = (top, pants = '#2b3442', sex = 'm', hair = '#5a3a24') => ({ sex, top, sleeve: top, pants, boots: '#3b2a1e', skin: sex === 'f' ? '#e8bea0' : '#dcab88', hair, logo: false });

const LAYOUTS = {
  // Sellerie du Port (20 × 14 m) : mur des selles au fond, briderie à gauche, tapis à droite, protections au centre,
  // pansage près de l'entrée, équipement du cavalier dans l'angle, comptoir face à la porte, trois vitrines.
  sellerie: {
    spawn: [-3.4, 5.1], exit: [-3.4, 5.7],
    fixtures: [
      { id: 'selles', label: t('Selles'), cats: ['selles'], at: [-3.6, -4.9] },
      { id: 'selles2', label: t('Selles'), cats: ['selles'], at: [-5.1, -1.2] },
      { id: 'briderie', label: t('Briderie'), cats: ['briderie'], at: [-8.1, -1.6] },
      { id: 'tapis', label: t('Tapis'), cats: ['tapis'], at: [8.1, -2.6] },
      { id: 'protections', label: t('Protections'), cats: ['protections'], at: [3.6, -0.5] },
      { id: 'soins', label: t('Soins'), cats: ['soins'], at: [8.0, 3.3] },
      { id: 'cavalier', label: t('Cavalier'), cats: ['cavalier'], at: [6.7, -4.9] },
      { id: 'comptoir', label: t('Comptoir'), counter: true, at: [4.6, 3.45] },
    ],
    colliders: [
      [-3.7, -6.25, 5.6, 0.45, 2.5], [-6.6, -2.6, 0.35, 0.55, 1.2], [-3.6, -2.6, 0.35, 0.55, 1.2],
      [-9.35, -1.9, 0.32, 3.8, 2.6], [9.35, -2.6, 0.35, 3.3, 2.4], [3.6, -1.8, 1.35, 0.55, 0.9],
      [9.3, 3.3, 0.38, 1.8, 1.6], [6.75, -6.2, 2.5, 0.5, 2.3], [4.6, 2.4, 1.65, 0.42, 1.05],
      [-7.1, 5.95, 1.85, 0.5, 0.4], [0.65, 5.95, 2.3, 0.5, 0.4], [6.35, 5.95, 2.3, 0.5, 0.4], [-0.6, 1.9, 0.6, 0.22, 0.5],
    ],
    lights: [[-6, 3.0, -3.0, 1.0], [-1.0, 3.0, -3.0, 1.0], [4.0, 3.0, -2.6, 1.0], [4.6, 3.0, 2.4, 0.9], [-6.0, 3.0, 3.2, 0.9], [1.2, 3.0, 3.5, 0.9]],
    seller: { at: [4.6, 1.55], ry: 0 },
    extras: [{ at: [-7.9, -0.2], ry: -Math.PI / 2, outfit: CUSTOMER('#7d8b6a', '#c2b49a', 'f', '#7a4a28'), name: t('Cliente') }],
    // Présentoir Strides sur le comptoir (carton plié).
    signs: [{ kind: 'strides', w: 0.34, h: 0.17, x: 3.55, y: F + 1.1, z: 2.72, ry: 0 }],
  },
  // Le Galop (14 × 10 m) : comptoir et vitrine à pâtisseries à gauche, pains au mur, machine à café, salle à droite.
  cafe: {
    spawn: [0, 3.2], exit: [0, 3.9],
    fixtures: [
      { id: 'comptoir', label: t('Comptoir'), counter: true, at: [-1.6, -0.55] },
      { id: 'vitrine', label: t('Vitrine'), counter: true, at: [-4.4, -0.55] },
    ],
    colliders: [
      [-2.95, -1.6, 3.4, 0.4, 1.1], [-3.0, -4.25, 3.4, 0.38, 2.4], [6.35, -1.0, 0.32, 3.0, 0.9],
      [2.5, -2.6, 0.38, 0.38, 0.8], [5.0, -2.6, 0.38, 0.38, 0.8], [2.5, 0.8, 0.38, 0.38, 0.8], [5.0, 0.8, 0.38, 0.38, 0.8],
      [-3.75, 4.1, 2.3, 0.35, 0.9],
    ],
    lights: [[-4.2, 2.9, -1.6, 0.9], [-1.2, 2.9, -1.6, 0.9], [3.7, 2.9, -2.6, 0.85], [3.7, 2.9, 0.8, 0.85], [-3.5, 2.9, 2.3, 0.8], [1.0, 2.9, 2.6, 0.7]],
    seller: { at: [-2.2, -2.75], ry: 0 },
    extras: [
      { at: [5.0, -1.9], ry: Math.PI, outfit: CUSTOMER('#2f5f8a', '#c2b49a', 'f', '#7a4a28'), name: t('Cliente'), pose: 'sit' },
      { at: [2.5, 1.5], ry: Math.PI, outfit: CUSTOMER('#4b4a33'), name: t('Client'), pose: 'sit' },
      { at: [-4.8, -2.75], ry: 0, outfit: { ...CUSTOMER('#f2f1ec', '#2b3442', 'f', '#3b2717'), hairStyle: 'bun' }, name: t('Boulangère') },
      // En terrasse : sur le trottoir et au bord de la place, en face.
      { at: [-2.42, 5.7], ry: -Math.PI / 2, outfit: CUSTOMER('#c8a96e', '#2b3442', 'f', '#5a3a24'), name: t('Cliente'), pose: 'sit' },
      { at: [-1.75, 19.4], ry: Math.PI / 2, outfit: CUSTOMER('#1f2b45', '#c2b49a'), name: t('Client'), pose: 'sit' },
      { at: [8.75, 19.4], ry: -Math.PI / 2, outfit: CUSTOMER('#f2f1ec', '#2b3442', 'f', '#7a4a28'), name: t('Cliente'), pose: 'sit' },
    ],
    signs: [{ kind: 'chalk', w: 1.0, h: 1.25, x: 3.6, y: 1.95, z: -4.64, ry: 0 }, { kind: 'strides', w: 0.3, h: 0.15, x: -0.55, y: F + 1.14, z: -1.32, ry: 0 }],
  },
  // Maison Lucette (10 × 11 m) : portant à gauche, étagères à droite, table centrale, miroir et cabine au fond.
  boutique: {
    spawn: [0, 4.4], exit: [0, 5.0],
    fixtures: [
      { id: 'portant', label: t('Portant'), cats: ['hauts'], at: [-3.3, -1.4] },
      { id: 'etageres', label: t('Étagères'), cats: ['accessoires', 'hauts'], at: [3.3, -1.8] },
      { id: 'table', label: t('Table'), cats: ['hauts', 'accessoires'], at: [0, 0.3] },
      { id: 'miroir', label: t('Miroir'), cats: ['hauts', 'accessoires'], tryOn: true, at: [-2.4, -3.9] },
      { id: 'comptoir', label: t('Comptoir'), counter: true, at: [2.6, -2.55] },
    ],
    colliders: [
      [-4.35, -1.3, 0.38, 3.3, 2.0], [4.35, -1.8, 0.35, 2.9, 2.3], [0, -0.8, 0.95, 0.5, 0.85],
      [-2.85, 4.25, 0.4, 0.4, 1.9], [2.85, 4.25, 0.4, 0.4, 1.9], [-2.4, 1.7, 0.3, 0.3, 1.9],
      [-4.0, -4.6, 0.68, 0.6, 2.2], [2.6, -3.6, 1.15, 0.35, 1.0],
    ],
    lights: [[-2.4, 2.9, -1.4, 0.95], [2.4, 2.9, -1.4, 0.95], [0, 2.9, 2.0, 0.9], [-2.4, 2.9, -4.0, 0.8], [2.6, 2.9, -3.6, 0.8], [0, 2.9, 4.2, 0.7]],
    seller: { at: [2.6, -4.35], ry: 0 },
    extras: [
      { at: [-3.2, -0.4], ry: -Math.PI / 2, outfit: CUSTOMER('#6e2433', '#2b3442', 'f', '#2a1d14'), name: t('Cliente') },
      // Passante devant la vitrine, sur le trottoir.
      { at: [2.9, 6.6], ry: Math.PI, outfit: CUSTOMER('#2f5f8a', '#e9e3d6', 'f', '#7a4a28'), name: t('Passante') },
    ],
  },
};

export function shopLayout(id) {
  return { ...LAYOUTS[id], staff: STAFF[id] };
}

// ---------- Géométries ----------

function buildSellerie(k, spec) {
  const G = spec.G;
  roomShell(k, spec, { floor: spec.floor, wall: spec.walls, wainscot: '#2f4a3a', wainH: 1.05, beams: DARK_OAK, skirting: '#1f2b22' });
  // Tapis d'entrée.
  k.add('F', box(2.0, 0.012, 1.3), '#5e1f2b', { x: -3.4, y: F, z: 5.3 });
  // Mur des selles : deux rangées de porte-selles muraux (selles de couleurs différentes) et leurs étiquettes.
  const leathers = ['#5a3520', '#2a1a12', '#7a4a2a', '#3a2516', '#6b3f22'];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      const x = -8.2 + c * 2.2, y = F + 1.05 + r * 0.95, z = -6.68;
      k.add('M', box(0.06, 0.06, 0.5), '#1b1c1f', { x, y: y - 0.04, z: z + 0.25 });
      k.add('M', box(0.3, 0.05, 0.06), '#1b1c1f', { x, y: y - 0.04, z: z + 0.5 });
      saddle(k, { x, y: y + 0.08, z: z + 0.32, ry: 0 }, leathers[(r * 5 + c) % 5]);
      tag(k, { x: x + 0.2, y: y - 0.2, z: z + 0.56 });
    }
  }
  // Deux chevalets au centre : selles mises en avant avec leur tapis.
  for (const [x, lea, pad, trim] of [[-6.6, '#1d1d1f', '#1f2b45', '#f2f1ec'], [-3.6, '#6b3f22', '#eeede8', '#1b1c1f']]) {
    k.push({ x, y: F, z: -2.6 });
    for (const s of [-1, 1]) {
      k.add('A', box(0.06, 1.0, 0.06), OAK, { z: s * 0.42, rx: s * 0.18 });
      k.add('A', box(0.5, 0.05, 0.06), OAK, { y: 0.15, z: s * 0.36 });
    }
    k.add('A', box(0.12, 0.1, 0.9), OAK, { y: 0.98 });
    saddle(k, { y: 1.16, ry: Math.PI / 2 }, lea, pad, trim);
    k.add('A', box(0.3, 0.2, 0.02), '#f7f4ed', { x: 0.3, y: 0.45, z: 0.5, ry: -0.3 });
    k.pop();
  }
  // Briderie : panneau de bois, crochets, bridons en cuir et licols colorés.
  k.add('A', box(0.05, 2.0, 7.4), DARK_OAK, { x: -9.66, y: F + 0.6, z: -1.9 });
  const lea2 = ['#3a2516', '#1d1d1f', '#5a3520'];
  for (let i = 0; i < 6; i++) {
    const z = -5.0 + i * 1.2;
    bridle(k, { x: -9.6, y: F + 2.45, z, ry: Math.PI / 2 }, lea2[i % 3]);
    if (i % 2 === 0) tag(k, { x: -9.52, y: F + 1.55, z: z + 0.25, ry: Math.PI / 2 });
  }
  const hcol = ['#1f2b45', '#6e2433', '#2f5a3c', '#c8102e', '#c8a96e', '#5d7480'];
  for (let i = 0; i < 6; i++) halter(k, { x: -9.6, y: F + 1.25, z: -5.0 + i * 1.2, ry: Math.PI / 2 }, hcol[i]);
  // Tapis : grande étagère murale, piles par couleur.
  shelving(k, { x: 9.33, y: F, z: -2.6, ry: -Math.PI / 2 }, 6.6, 0.55, [0.12, 0.62, 1.12, 1.62, 2.12], '#a37a52', '#d9cdb8');
  const pads = [['#1f2b45', '#f2f1ec'], ['#eeede8', '#1b1c1f'], ['#5e1f2b', '#c8a96e'], ['#1b1c1f', '#c8a96e'], ['#8a8f96', '#1f2b45'], ['#2f5a3c', '#f2f1ec'], ['#7fa7c9', '#f2f1ec'], ['#c8a96e', '#5e1f2b']];
  for (let s = 0; s < 4; s++) {
    for (let c = 0; c < 5; c++) {
      const [col, trim] = pads[(s * 3 + c) % pads.length];
      padStack(k, { x: 9.28, y: F + 0.16 + s * 0.5, z: -5.3 + c * 1.3, ry: Math.PI / 2 }, col, 5 + ((s + c) % 4), trim);
    }
  }
  // Protections et ferrure : table de présentation au centre.
  k.push({ x: 3.6, y: F, z: -1.8 });
  k.add('A', box(2.7, 0.06, 1.1), OAK, { y: 0.8 });
  k.add('A', box(2.5, 0.78, 0.9), '#2f4a3a', { y: 0.02 });
  for (let i = 0; i < 4; i++) bootsPair(k, { x: -1.0 + i * 0.6, y: 0.86, z: -0.25 }, 'guetres', i % 2 ? '#17181b' : '#3a2516');
  for (let i = 0; i < 3; i++) bootsPair(k, { x: -0.8 + i * 0.7, y: 0.86, z: 0.28 }, 'cloches', ['#17181b', '#1f2b45', '#6e2433'][i]);
  // Fers aluminium sur un présentoir incliné.
  k.add('A', box(0.6, 0.4, 0.04), DARK_OAK, { x: 1.0, y: 0.86, z: 0.3, rx: -0.5 });
  for (let i = 0; i < 4; i++) k.add('M', torus(0.065, 0.012, 4, 12, Math.PI * 1.35), '#b9bec2', { x: 0.88 + (i % 2) * 0.24, y: 1.0 + Math.floor(i / 2) * 0.16, z: 0.35, rx: -0.5, rz: Math.PI * 0.82 });
  tag(k, { x: -1.1, y: 0.9, z: 0.52 });
  tag(k, { x: 0.2, y: 0.9, z: 0.52 });
  k.pop();
  // Pansage et soins : étagère basse près de l'entrée (seaux, brosses, flacons).
  shelving(k, { x: 9.3, y: F, z: 3.3, ry: -Math.PI / 2 }, 3.5, 0.6, [0.1, 0.55, 1.0, 1.45], '#a37a52');
  const bcol = ['#1f2b45', '#6e2433', '#2f5a3c', '#c8a96e', '#5d7480'];
  for (let i = 0; i < 5; i++) {
    k.add('A', cyl(0.15, 0.12, 0.28, 12), bcol[i], { x: 9.25, y: F + 0.14, z: 1.9 + i * 0.68 });
    k.add('M', torus(0.13, 0.006, 3, 12, Math.PI), '#8d9296', { x: 9.25, y: F + 0.42, z: 1.9 + i * 0.68, ry: Math.PI / 2 });
  }
  for (let i = 0; i < 8; i++) {
    const z = 1.85 + i * 0.4;
    k.add('A', box(0.18, 0.05, 0.08), '#a37a52', { x: 9.3, y: F + 0.6, z });
    k.add('F', box(0.16, 0.04, 0.06), i % 2 ? '#1b1c1f' : '#c8b48e', { x: 9.3, y: F + 0.65, z });
  }
  const bottle = ['#f2f1ec', '#3a6ea5', '#d8b44a', '#8fbf8f', '#c8102e'];
  for (let i = 0; i < 12; i++) {
    const z = 1.75 + i * 0.27;
    k.add('A', cyl(0.045, 0.05, 0.22, 8), bottle[i % 5], { x: 9.28, y: F + 1.05, z });
    k.add('A', cyl(0.02, 0.025, 0.05, 6), '#1b1c1f', { x: 9.28, y: F + 1.27, z });
  }
  for (let i = 0; i < 6; i++) k.add('A', cyl(0.07, 0.07, 0.12, 10), i % 2 ? '#3a2516' : '#d8b44a', { x: 9.28, y: F + 1.5, z: 1.9 + i * 0.55 });
  // Équipement du cavalier : étagères (casques, bottes) et portant de vestes de concours.
  shelving(k, { x: 7.9, y: F, z: -6.35 }, 2.6, 0.55, [0.1, 0.75, 1.5, 2.1], '#a37a52', '#d9cdb8');
  const hcols = ['#1f2b45', '#1b1c1f', '#8a8f96', '#1f2b45'];
  for (let i = 0; i < 4; i++) helmet(k, { x: 6.95 + i * 0.62, y: F + 1.65, z: -6.3 }, hcols[i]);
  for (let i = 0; i < 3; i++) ridingBoots(k, { x: 7.0 + i * 0.8, y: F + 0.13, z: -6.3 }, i === 1 ? '#3a2516' : '#121214');
  for (let i = 0; i < 4; i++) k.add('F', box(0.34, 0.06, 0.26), ['#f2f1ec', '#eeede8', '#1b1c1f', '#c8a96e'][i], { x: 6.95 + i * 0.62, y: F + 0.78, z: -6.3 });
  k.add('M', cyl(0.015, 0.015, 1.7, 6), '#8d9296', { x: 5.0, y: F + 1.7, z: -6.1, rz: Math.PI / 2 });
  for (const sx of [4.2, 5.8]) k.add('M', cyl(0.015, 0.015, 1.7, 6), '#8d9296', { x: sx, y: F, z: -6.1 });
  for (let i = 0; i < 5; i++) garment(k, { x: 4.4 + i * 0.32, y: F + 1.7, z: -6.1, ry: Math.PI / 2 }, i % 2 ? '#1b1c1f' : '#1f2b45', { len: 0.68, wid: 0.46, collar: '#f2f1ec' });
  // Porte de l'atelier au fond.
  k.add('A', box(1.1, 2.25, 0.06), '#1f3a2c', { x: 3.0, y: F, z: -6.64 });
  k.add('A', box(1.3, 0.1, 0.08), DARK_OAK, { x: 3.0, y: F + 2.25, z: -6.63 });
  k.add('M', box(0.12, 0.03, 0.05), '#b08d57', { x: 3.4, y: F + 1.0, z: -6.58 });
  k.add('A', box(0.5, 0.14, 0.01), '#f7f4ed', { x: 3.0, y: F + 1.75, z: -6.6 });
  // Comptoir face à la porte : caisse, terminal, présentoir de petits accessoires, sonnette.
  k.push({ x: 4.6, y: F, z: 2.4 });
  k.add('A', box(3.3, 0.96, 0.75), '#2f4a3a');
  k.add('A', box(3.4, 0.05, 0.85), OAK, { y: 0.96 });
  for (let i = 0; i < 4; i++) k.add('A', box(0.62, 0.62, 0.02), '#27402f', { x: -1.2 + i * 0.8, y: 0.17, z: 0.38 });
  k.add('A', box(0.38, 0.12, 0.3), '#1b1c1f', { x: 0.8, y: 1.01 });
  k.add('A', box(0.3, 0.22, 0.02), '#2a3a4a', { x: 0.8, y: 1.13, z: -0.06, rx: -0.3 });
  k.add('A', box(0.08, 0.02, 0.14), '#1b1c1f', { x: 0.3, y: 1.01, z: 0.15 });
  k.add('M', lathe([[0, 0], [0.05, 0], [0.05, 0.02], [0.035, 0.05], [0.005, 0.06]], 12), '#b08d57', { x: -0.3, y: 1.01, z: 0.2 });
  for (let i = 0; i < 6; i++) k.add('A', box(0.1, 0.06, 0.08), ['#c8a96e', '#1f2b45', '#6e2433'][i % 3], { x: -1.3 + i * 0.12, y: 1.01, z: 0.05 });
  k.pop();
  // Banc d'essayage et plante verte.
  k.add('A', box(1.2, 0.08, 0.4), OAK, { x: -0.6, y: F + 0.42, z: 1.9 });
  for (const s of [-1, 1]) k.add('A', box(0.06, 0.42, 0.36), DARK_OAK, { x: -0.6 + s * 0.5, y: F, z: 1.9 });
  k.add('A', cyl(0.22, 0.18, 0.42, 12), '#c8b48e', { x: -1.1, y: F, z: 6.0 });
  k.add('A', sphere(1, 10, 8), '#4f7a3a', { x: -1.1, y: F + 0.85, z: 6.0, sx: 0.4, sy: 0.55, sz: 0.4 });
  // Vitrines : selle sur chevalet et bridon (A), selle et casque (B), mannequin en tenue de concours (C).
  for (const [x, wd] of [[-7.1, 3.7], [0.65, 4.6], [6.35, 4.6]]) {
    k.add('A', box(wd, 0.35, 1.0), DARK_OAK, { x, y: F, z: 5.95 });
    k.add('F', box(wd - 0.1, 0.01, 0.9), '#5e1f2b', { x, y: F + 0.35, z: 5.95 });
  }
  k.push({ x: -7.6, y: F + 0.35, z: 5.95 });
  k.add('A', box(0.08, 0.75, 0.08), OAK, { z: -0.2 });
  k.add('A', box(0.08, 0.75, 0.08), OAK, { z: 0.2 });
  k.add('A', box(0.1, 0.08, 0.7), OAK, { y: 0.75 });
  saddle(k, { y: 0.92, ry: Math.PI / 2 }, '#6b3f22', '#1f2b45', '#f2f1ec');
  k.pop();
  k.add('A', cyl(0.03, 0.03, 1.4, 6), OAK, { x: -5.9, y: F + 0.35, z: 6.0 });
  bridle(k, { x: -5.9, y: F + 1.75, z: 5.98, ry: Math.PI }, '#3a2516');
  tag(k, { x: -7.1, y: F + 0.4, z: 6.38, rx: -0.6 });
  k.push({ x: 0.0, y: F + 0.35, z: 5.95 });
  k.add('A', box(0.08, 0.75, 0.08), OAK, { z: -0.2 });
  k.add('A', box(0.08, 0.75, 0.08), OAK, { z: 0.2 });
  k.add('A', box(0.1, 0.08, 0.7), OAK, { y: 0.75 });
  saddle(k, { y: 0.92, ry: Math.PI / 2 }, '#1d1d1f', '#eeede8', '#1b1c1f');
  k.pop();
  k.add('A', cyl(0.03, 0.03, 0.9, 6), OAK, { x: 1.7, y: F + 0.35, z: 6.0 });
  helmet(k, { x: 1.7, y: F + 1.37, z: 6.0, ry: Math.PI }, '#1f2b45');
  padStack(k, { x: 2.3, y: F + 0.36, z: 6.0, ry: Math.PI }, '#5e1f2b', 4, '#c8a96e');
  mannequin(k, { x: 5.6, y: F + 0.35, z: 5.95, ry: Math.PI }, { top: '#1f2b45', bottom: '#f2f1ec', collar: '#f2f1ec', jacket: true });
  helmet(k, { x: 5.6, y: F + 0.35 + 1.98, z: 5.95, ry: Math.PI }, '#1b1c1f');
  ridingBoots(k, { x: 7.0, y: F + 0.36, z: 5.95, ry: Math.PI }, '#121214');
  tag(k, { x: 6.35, y: F + 0.4, z: 6.38, rx: -0.6 });
  // Suspensions.
  for (const [x, , z] of LAYOUTS.sellerie.lights) pendant(k, x, z, G - 0.1, { drop: 0.95, shadeColor: '#1f3a2c' });
  // Cadres au-dessus du lambris (portraits de chevaux : aplats de couleur).
  for (let i = 0; i < 3; i++) {
    const z = 2.6 + i * 1.2;
    k.add('A', box(0.04, 0.62, 0.5), '#b08d57', { x: -9.64, y: F + 1.6, z });
    k.add('A', box(0.045, 0.52, 0.4), ['#6e5434', '#3a2c20', '#8a6a4a'][i], { x: -9.63, y: F + 1.65, z });
  }
}

function buildCafe(k, spec) {
  const G = spec.G;
  roomShell(k, spec, { floor: spec.floor, wall: spec.walls, wainscot: '#f4f1ea', wainH: 1.2, skirting: '#3a3d42' });
  const T = WALL_T, iw = spec.w - 2 * T, id = spec.d - 2 * T;
  // Carreaux de ciment : frise sombre le long des murs.
  for (const [x, z, w, d] of [[0, -id / 2 + 0.3, iw, 0.36], [0, id / 2 - 0.3, iw, 0.36], [-iw / 2 + 0.3, 0, 0.36, id], [iw / 2 - 0.3, 0, 0.36, id]]) k.add('A', box(w, 0.006, d), '#3a3d42', { x, y: F, z });
  for (let i = 0; i < 20; i++) for (let j = 0; j < 12; j++) if ((i + j) % 2 === 0) k.add('A', box(0.3, 0.004, 0.3), '#6f7a80', { x: -iw / 2 + 0.85 + i * 0.62, y: F + 0.002, z: -id / 2 + 0.85 + j * 0.62 });
  // Comptoir en zinc, façade en bois, vitrine réfrigérée à pâtisseries.
  k.push({ x: -2.95, y: F, z: -1.6 });
  k.add('A', box(6.8, 1.02, 0.7), '#4f3a28');
  for (let i = 0; i < 8; i++) k.add('A', box(0.72, 0.7, 0.02), '#5b4330', { x: -3.0 + i * 0.85, y: 0.16, z: 0.36 });
  k.add('M', box(6.9, 0.05, 0.8), '#a3a8ab', { y: 1.02 });
  // Vitrine à gâteaux sur la partie gauche.
  k.add('M', box(3.4, 0.03, 0.62), '#8d9296', { x: -1.6, y: 1.35 });
  k.add('G', box(3.4, 0.5, 0.012), '#ffffff', { x: -1.6, y: 1.07, z: 0.3 });
  k.add('G', box(3.4, 0.012, 0.62), '#ffffff', { x: -1.6, y: 1.57 });
  for (const sx of [-1, 1]) k.add('M', box(0.03, 0.52, 0.62), '#8d9296', { x: -1.6 + sx * 1.7, y: 1.06 });
  for (let i = 0; i < 9; i++) {
    const x = -3.1 + i * 0.36;
    // Rangée basse : croissants et pains au chocolat ; rangée haute : tartes, éclairs, macarons.
    if (i % 2) k.add('A', torus(0.06, 0.03, 6, 10, Math.PI * 1.2), '#c98a3c', { x, y: 1.1, z: 0.05, rx: Math.PI / 2, rz: Math.PI * 0.9 });
    else k.add('A', box(0.14, 0.04, 0.09), '#b9772f', { x, y: 1.08, z: 0.05 });
    if (i % 3 === 0) {
      k.add('A', cyl(0.12, 0.12, 0.04, 14), '#d9a441', { x, y: 1.38, z: 0.02 });
      for (let j = 0; j < 5; j++) k.add('A', sphere(0.022, 6, 4), '#b32030', { x: x + Math.cos(j * 1.3) * 0.07, y: 1.43, z: 0.02 + Math.sin(j * 1.3) * 0.07 });
    } else if (i % 3 === 1) k.add('A', capsule(0.025, 0.12, 6), '#5a3a24', { x, y: 1.41, z: 0.02 });
    else for (let j = 0; j < 3; j++) k.add('A', cyl(0.03, 0.03, 0.03, 10), ['#e8b7c8', '#bfe0b0', '#f1d98a'][j], { x: x - 0.08 + j * 0.08, y: 1.39, z: 0.02 });
  }
  // Caisse.
  k.add('A', box(0.36, 0.14, 0.32), '#1b1c1f', { x: 1.35, y: 1.06 });
  k.add('A', box(0.3, 0.2, 0.02), '#2a3a4a', { x: 1.35, y: 1.2, z: -0.08, rx: -0.3 });
  k.pop();
  // Arrière-comptoir : machine à café, tasses, moulin, étagères à pains (baguettes en panière, boules).
  k.push({ x: -3.0, y: F, z: -4.25 });
  k.add('A', box(6.8, 0.92, 0.6), '#4f3a28');
  k.add('M', box(6.9, 0.04, 0.66), '#a3a8ab', { y: 0.92 });
  k.add('M', box(0.9, 0.48, 0.52), '#c9cdd0', { x: 1.8, y: 0.96 });
  k.add('M', box(0.9, 0.06, 0.56), '#8d9296', { x: 1.8, y: 1.44 });
  for (const sx of [-0.25, 0.25]) {
    k.add('M', cyl(0.05, 0.05, 0.08, 10), '#1b1c1f', { x: 1.8 + sx, y: 1.08, z: 0.3, rx: Math.PI / 2 });
    k.add('A', cyl(0.035, 0.03, 0.06, 10), '#f7f4ed', { x: 1.8 + sx, y: 0.97, z: 0.32 });
  }
  for (let i = 0; i < 6; i++) k.add('A', cyl(0.04, 0.03, 0.05, 10), '#f7f4ed', { x: 1.5 + (i % 3) * 0.12, y: 1.5 + Math.floor(i / 3) * 0.05, z: 0 });
  k.add('M', lathe([[0, 0], [0.09, 0], [0.09, 0.22], [0.06, 0.28], [0.1, 0.4], [0.02, 0.42]], 12), '#1b1c1f', { x: 2.55, y: 0.96 });
  // Panières à pains au mur.
  for (let r = 0; r < 3; r++) {
    const y = 1.35 + r * 0.42;
    k.add('A', box(4.2, 0.04, 0.32), '#a37a52', { x: -1.2, y, z: -0.12 });
    for (let i = 0; i < 12; i++) {
      if (r === 2) k.add('A', sphere(1, 10, 8), '#b47a3a', { x: -3.1 + i * 0.34, y: y + 0.1, z: -0.12, sx: 0.13, sy: 0.08, sz: 0.11 });
      else k.add('A', capsule(0.035, 0.52, 6), '#c08a46', { x: -3.1 + i * 0.34, y: y + 0.24, z: -0.16, rz: Math.PI / 2 - 0.25 });
    }
  }
  k.pop();
  // Salle : banquette de moleskine, tables bistrot à plateau de marbre, chaises cannées, miroirs dorés.
  k.add('L', box(0.5, 0.45, 6.0), '#6e2433', { x: 6.4, y: F, z: -1.0 });
  k.add('L', box(0.14, 0.55, 6.0), '#6e2433', { x: 6.62, y: F + 0.45, z: -1.0 });
  for (const [x, z] of [[2.5, -2.6], [5.0, -2.6], [2.5, 0.8], [5.0, 0.8]]) {
    k.add('M', cyl(0.25, 0.25, 0.03, 12), '#1b1c1f', { x, y: F, z });
    k.add('M', cyl(0.03, 0.03, 0.72, 6), '#1b1c1f', { x, y: F, z });
    k.add('A', cyl(0.36, 0.36, 0.035, 18), '#eeebe4', { x, y: F + 0.72, z });
    k.add('A', cyl(0.04, 0.035, 0.07, 10), '#f7f4ed', { x: x + 0.1, y: F + 0.755, z: z - 0.05 });
    for (const a of x < 4 ? [Math.PI / 2, -Math.PI / 2] : [Math.PI / 2]) {
      const cx = x + Math.sin(a) * 0.62, cz = z + Math.cos(a) * 0.62;
      k.add('A', cyl(0.21, 0.21, 0.04, 12), '#c8a96e', { x: cx, y: F + 0.45, z: cz });
      for (const [dx, dz] of [[0.15, 0.15], [-0.15, 0.15], [0.15, -0.15], [-0.15, -0.15]]) k.add('A', cyl(0.015, 0.015, 0.45, 5), '#3a2516', { x: cx + dx, y: F, z: cz + dz });
      k.add('A', torus(0.2, 0.018, 4, 14, Math.PI), '#3a2516', { x: cx + Math.sin(a) * 0.18, y: F + 0.62, z: cz + Math.cos(a) * 0.18, ry: a + Math.PI / 2 });
    }
  }
  for (const z of [-3.2, -0.2]) {
    k.add('A', box(0.05, 1.2, 1.6), '#b08d57', { x: 6.64, y: F + 1.25, z });
    k.add('M', box(0.02, 1.08, 1.48), '#c3ccd0', { x: 6.61, y: F + 1.31, z });
  }
  // Vitrine de la rue : présentoir à pains derrière la vitre de gauche.
  k.add('A', box(4.6, 0.85, 0.6), '#4f3a28', { x: -3.75, y: F, z: 4.1 });
  for (let i = 0; i < 7; i++) {
    k.add('A', sphere(1, 10, 8), '#b47a3a', { x: -5.6 + i * 0.62, y: F + 0.95, z: 4.1, sx: 0.18, sy: 0.1, sz: 0.15 });
    k.add('A', capsule(0.035, 0.5, 6), '#c08a46', { x: -5.6 + i * 0.62, y: F + 1.15, z: 4.25, rz: 0.4 });
  }
  for (const [x, , z] of LAYOUTS.cafe.lights) pendant(k, x, z, G - 0.1, { drop: 0.7, kind: 'globe' });
}

function buildBoutique(k, spec) {
  const G = spec.G;
  roomShell(k, spec, { floor: spec.floor, wall: spec.walls, skirting: '#e8e2d4' });
  // Rails d'éclairage au plafond.
  for (const x of [-2.4, 2.4]) {
    k.add('M', box(0.05, 0.04, 8.6), '#1b1c1f', { x, y: G - 0.16, z: -0.4 });
    for (let i = 0; i < 4; i++) {
      k.add('M', cyl(0.045, 0.035, 0.16, 8), '#1b1c1f', { x, y: G - 0.32, z: -3.8 + i * 2.2, rx: 0.5 });
      k.add('E', sphere(1, 8, 6), '#fff4dc', { x, y: G - 0.36, z: -3.72 + i * 2.2, sx: 0.03, sy: 0.03, sz: 0.03 });
    }
  }
  // Tapis de laine au centre.
  k.add('F', box(3.0, 0.012, 2.2), '#d9cdb8', { x: 0, y: F, z: 1.6 });
  // Portant mural : vestes, pulls, polos (couleurs du catalogue).
  k.add('M', cyl(0.016, 0.016, 6.4, 6), '#8d9296', { x: -4.32, y: F + 1.75, z: -1.3, rx: Math.PI / 2 });
  for (const z of [-4.4, 1.8]) k.add('M', box(0.3, 0.03, 0.03), '#8d9296', { x: -4.5, y: F + 1.75, z });
  const cols = [['#f2f1ec'], ['#1f2b45'], ['#8a8f96'], ['#6e2433', '#f2f1ec'], ['#4b4a33', '#5b4330'], ['#f2f1ec'], ['#1f2b45'], ['#8a8f96'], ['#6e2433', '#f2f1ec'], ['#4b4a33', '#5b4330'], ['#2f5f8a'], ['#c8b48e']];
  cols.forEach(([c, col], i) => garment(k, { x: -4.32, y: F + 1.75, z: -4.1 + i * 0.5, ry: Math.PI / 2 }, c, { len: 0.62 + (i % 3) * 0.06, wid: 0.44, collar: col || null }));
  // Étagères laquées : pulls pliés, casquettes en haut.
  shelving(k, { x: 4.36, y: F, z: -1.8, ry: -Math.PI / 2 }, 5.8, 0.48, [0.1, 0.6, 1.1, 1.6, 2.1], '#efeae0', '#e2dbcd');
  const fold = ['#1f2b45', '#f2f1ec', '#8a8f96', '#6e2433', '#4b4a33', '#2f5f8a', '#c8b48e'];
  for (let s = 0; s < 3; s++) {
    for (let c = 0; c < 6; c++) {
      const col = fold[(s * 2 + c) % fold.length];
      for (let j = 0; j < 4; j++) k.add('F', box(0.32, 0.06, 0.28), col, { x: 4.33, y: F + 0.14 + s * 0.5 + j * 0.062, z: -4.3 + c * 0.95 });
    }
  }
  for (let c = 0; c < 8; c++) {
    const col = c % 2 ? '#1f2b45' : '#c8b48e';
    k.add('F', sphere(1, 10, 6), col, { x: 4.33, y: F + 1.66, z: -4.4 + c * 0.7, sx: 0.1, sy: 0.07, sz: 0.11 });
    k.add('F', box(0.13, 0.012, 0.09), col, { x: 4.21, y: F + 1.64, z: -4.4 + c * 0.7, ry: Math.PI / 2 });
  }
  // Table centrale : polos pliés, casquettes, petit miroir.
  k.push({ x: 0, y: F, z: -0.8 });
  k.add('A', box(1.9, 0.05, 1.0), OAK, { y: 0.78 });
  for (const [sx, sz] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]]) k.add('A', box(0.06, 0.78, 0.06), DARK_OAK, { x: sx, z: sz });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.add('F', box(0.3, 0.05, 0.26), fold[(i + j) % fold.length], { x: -0.7 + i * 0.46, y: 0.83 + j * 0.052, z: -0.2 });
  for (let i = 0; i < 3; i++) {
    k.add('F', sphere(1, 10, 6), i === 1 ? '#c8b48e' : '#1f2b45', { x: -0.5 + i * 0.5, y: 0.86, z: 0.25, sx: 0.1, sy: 0.07, sz: 0.11 });
    k.add('F', box(0.13, 0.012, 0.09), i === 1 ? '#c8b48e' : '#1f2b45', { x: -0.5 + i * 0.5, y: 0.84, z: 0.37 });
  }
  k.pop();
  // Mannequins en vitrine et près du portant.
  for (const x of [-2.85, 2.85]) k.add('A', box(1.2, 0.15, 1.0), '#e8e2d4', { x, y: F, z: 4.25 });
  mannequin(k, { x: -2.85, y: F + 0.15, z: 4.25, ry: Math.PI }, { top: '#1f2b45', bottom: '#e9e3d6' });
  mannequin(k, { x: 2.85, y: F + 0.15, z: 4.25, ry: Math.PI }, { top: '#6e2433', bottom: '#2b3442', collar: '#f2f1ec', cap: '#1f2b45' });
  mannequin(k, { x: -2.4, y: F, z: 1.7, ry: Math.PI / 2 }, { top: '#4b4a33', bottom: '#c2b49a', collar: '#5b4330', jacket: true });
  // Miroir sur pied au fond, cabine d'essayage à rideau.
  k.add('A', box(1.0, 2.1, 0.06), '#b08d57', { x: -2.4, y: F + 0.05, z: -5.12 });
  k.add('M', box(0.88, 1.98, 0.02), '#c3ccd0', { x: -2.4, y: F + 0.11, z: -5.08 });
  k.add('M', cyl(0.015, 0.015, 1.4, 6), '#8d9296', { x: -4.0, y: F + 2.2, z: -4.0, rz: Math.PI / 2 });
  k.add('F', box(1.36, 2.05, 0.05), '#d9cdb8', { x: -4.0, y: F + 0.12, z: -4.0 });
  k.add('F', box(0.05, 2.05, 1.18), '#d9cdb8', { x: -3.33, y: F + 0.12, z: -4.6 });
  // Pouf.
  k.add('L', cyl(0.3, 0.3, 0.42, 16), '#6e2433', { x: -1.2, y: F, z: -4.2 });
  // Comptoir laqué : caisse, sacs en papier, bouquet.
  k.push({ x: 2.6, y: F, z: -3.6 });
  k.add('A', box(2.2, 0.92, 0.6), '#efeae0');
  k.add('A', box(2.3, 0.05, 0.68), OAK, { y: 0.92 });
  k.add('A', box(0.34, 0.12, 0.28), '#1b1c1f', { x: 0.6, y: 0.97 });
  k.add('A', box(0.28, 0.2, 0.02), '#2a3a4a', { x: 0.6, y: 1.1, z: -0.06, rx: -0.3 });
  for (let i = 0; i < 3; i++) k.add('A', box(0.3, 0.36, 0.12), '#e9e3d6', { x: -0.7 + i * 0.05, y: 0.97, z: -0.1 + i * 0.04 });
  k.add('A', cyl(0.07, 0.06, 0.24, 10), '#f7f4ed', { x: -0.1, y: 0.97 });
  k.add('A', sphere(1, 10, 8), '#e9c94a', { x: -0.1, y: 1.3, sx: 0.16, sy: 0.12, sz: 0.16 });
  k.pop();
  // Plante.
  k.add('A', cyl(0.2, 0.16, 0.45, 12), '#1b1c1f', { x: 4.1, y: F, z: 3.9 });
  k.add('A', sphere(1, 10, 8), '#4f7a3a', { x: 4.1, y: F + 0.95, z: 3.9, sx: 0.4, sy: 0.6, sz: 0.4 });
}

const BUILDERS = { sellerie: buildSellerie, cafe: buildCafe, boutique: buildBoutique };

// Géométrie de l'intérieur (repère local) : { A, L, F, M, G, E } (géométries ou null).
export function buildInterior(spec) {
  const k = new Kit();
  BUILDERS[spec.id](k, spec);
  const out = {};
  for (const key of ['A', 'L', 'F', 'M', 'G', 'E']) out[key] = k.geo(key);
  return out;
}

// Point d'un rayon (ou de la sortie, 'exit', ou de l'arrivée, 'spawn') en coordonnées du monde, sans rien construire
// (missions, jobs, tests).
export function shopAnchor(spec, which) {
  const L = LAYOUTS[spec.id];
  const fx = L.fixtures.find((f) => f.id === which);
  const [lx, lz] = fx ? fx.at : L[which];
  const c = Math.cos(spec.rot), s = Math.sin(spec.rot);
  return { x: spec.x + lx * c + lz * s, z: spec.z - lx * s + lz * c };
}
