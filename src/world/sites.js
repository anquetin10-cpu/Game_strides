// Plans détaillés des sites (partagés par la texture du sol, les bâtiments, la minimap et les missions).

export const HOME = {
  barn: { x: -120, z: 150, w: 50, d: 12 },
  boxesZ: 156.5,
  boxCount: 8,
  hay: { x: -166, z: 176, w: 14, d: 18 },
  arena: { x: -100, z: 212, w: 46, d: 24 },
  paddock: { x: -162, z: 216, w: 30, d: 22 },
  house: { x: -72, z: 136, w: 13, d: 9 },
  club: { x: -67, z: 205, w: 12, d: 8 }, // club-house, baie vitrée et terrasse sur la carrière
  yard: { x: -112, z: 174, w: 120, d: 30 },
  truck: { x: -64, z: 158, rot: Math.PI / 2 },
  spawn: { x: -104, z: 168, rot: 0.35 },
  horse: { x: -112, z: 165, rot: Math.PI / 2 },
};

// Plans des écuries à couloir central (barns, voir barns.js) : modules d'ouest en est, de chaque côté de l'allée
// (p : côté +z, n : côté -z). Box de 3,6 m ; allée transversale « cross » ; sellerie (tack), aire de pansage (groom),
// douche (wash), aliments (feed).
const B4 = { p: 'box', n: 'box' };
export const BARN_LAYOUTS = {
  // Écurie du Val : 8 boxes côté cour (fenêtres de box sur la cour) et 8 côté prés, allée transversale, deux aires de
  // pansage, douche, salle d'aliments, sellerie de l'écurie et sellerie des propriétaires.
  home: [B4, B4, B4, B4, B4, B4, B4, B4, { cross: true, w: 4 }, { p: 'groom', n: 'wash' }, { p: 'groom', n: 'feed' }, { w: 7.2, p: 'tack', n: 'tack' }],
  haras: [B4, B4, B4, B4, { cross: true, w: 4 }, { p: 'groom', n: 'wash' }, { p: 'groom', n: 'feed' }, B4, B4, { w: 6.7, p: 'tack', n: 'tack' }],
  dunes: [B4, B4, B4, B4, { cross: true, w: 3.6 }, { p: 'groom', n: 'wash' }, { w: 6.3, p: 'tack', n: 'feed' }, B4],
  gatien: [B4, B4, B4, B4, { cross: true, w: 3.6 }, { p: 'groom', n: 'wash' }, { w: 5.9, p: 'tack', n: 'feed' }],
  pole: [B4, B4, B4, B4, B4, B4, B4, B4, { cross: true, w: 4 }, { p: 'groom', n: 'wash' }, { p: 'groom', n: 'wash' }, B4, B4, B4, B4, B4],
};

// Boxes de l'Écurie du Val ouvrant sur la cour : position devant la fenêtre de box (cheval placé à z - 1,4, tête
// dehors). Box de 3,6 m à partir du pignon ouest (mur de 0,25 m).
export function homeBoxes() {
  const out = [];
  const b = HOME.barn;
  for (let i = 0; i < HOME.boxCount; i++) out.push({ x: b.x - b.w / 2 + 0.25 + 3.6 * (i + 0.5), z: HOME.boxesZ });
  return out;
}

export const HARAS = {
  mainW: { x: -404, z: -70, w: 40, d: 14 },
  mainE: { x: -356, z: -70, w: 40, d: 14 },
  gate: { x: -380, z: -74 },
  wingW: { x: -428, z: -42, w: 12, d: 40 },
  wingE: { x: -332, z: -42, w: 12, d: 40 },
  court: { x: -380, z: -40, w: 84, d: 48 },
  paddocks: [
    { x: -449, z: 12, w: 40, d: 38 },
    { x: -403, z: 12, w: 40, d: 38 },
    { x: -357, z: 12, w: 40, d: 38 },
    { x: -311, z: 12, w: 40, d: 38 },
  ],
};

export const POLE = {
  // Carrière de concours aux dimensions d'un terrain international (120 × 76 m) : de longues approches et de grandes
  // courbes au galop entre les obstacles.
  arena: { x: 330, z: -224, w: 120, d: 76 },
  stands: { x: 330, z: -273, w: 78, d: 14 },
  warmup: { x: 240, z: -232, w: 40, d: 46 },
  stables: { x: 420, z: -226, w: 16, d: 60 },
  club: { x: 410, z: -280, w: 34, d: 14 },
  entrance: { x: 330, z: -182 },
};

export const HIPPO_SITE = {
  stand: { x: 330, z: 147, w: 84, d: 14 },
  parking: { x: 330, z: 128 },
};

export const DUNES = {
  barn: { x: 500, z: -302, w: 32, d: 10 },
  paddock: { x: 495, z: -270, w: 50, d: 22 },
};

export const GATIEN = {
  barn: { x: -212, z: 284, w: 28, d: 10 },
  club: { x: -205, z: 318, w: 16, d: 10 },
  start: { x: -255, z: 300 },
};

// Rues de Deauvelle : îlots entre les rues (x0,x1,z0,z1).
export const TOWN_BLOCKS = [
  [-205, -130, -352, -300], [-130, -30, -352, -300], [-30, 70, -352, -300], [70, 145, -352, -300],
  [-205, -130, -300, -232], [-130, -30, -300, -232], [-30, 70, -300, -232], [70, 145, -300, -232],
  [-205, -130, -232, -166], [-130, -30, -232, -166], [-30, 70, -232, -166], [70, 145, -232, -166],
];

// Station-service à l'entrée nord de Deauvelle, le long de la route principale : auvent, deux îlots de deux pompes
// (gazole et sans-plomb), boutique, totem des prix (indicatifs, ordre de grandeur des prix à la pompe en France).
export const STATION = {
  x: -13, z: -140, w: 24, d: 24,
  islands: [-20, -14], pumpsZ: [-143, -137],
  prices: { diesel: 1.72, petrol: 1.84 },
};

export const TOWN = {
  plaza: { x: 20, z: -266, w: 92, d: 60 },
  hotel: { x: -80, z: -330, w: 82, d: 30 },
  hq: { x: 108, z: -330, w: 54, d: 30 },
  sellerie: { x: -168, z: -266, w: 40, d: 30 },
  forge: { x: -170, z: -199, w: 34, d: 26 },
  vet: { x: 108, z: -199, w: 46, d: 30 },
  planches: { z: -374, x0: -200, x1: 150 },
};
