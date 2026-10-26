// Carte du monde : Deauvelle et sa région (inspirée de la Côte Fleurie, Normandie).
// Axe X : ouest (-) → est (+). Axe Z : nord (-, la mer) → sud (+).
import { createNoise2D } from '../core/noise.js';
import { polyDist, rectDist, smoothstep } from '../core/math.js';

export const WORLD = { size: 1200, half: 600, seaLevel: 0 };

// Trait de côte de référence (limite de la plage et des terres : sable, prairies littorales, placement du décor).
export const shoreZ = (x) => -430 + 12 * Math.sin(x / 95) + 6 * Math.sin(x / 37 + 1.3);

// Plage de Deauvelle : profil en travers (hauteur au-dessus du niveau moyen de la mer, m), comme une plage de la baie
// de Seine à fort marnage, raccourci de moitié vers la mer (choix de jeu : plage moins large). Profil de référence
// (distances avant raccourcissement) : du pied des Planches (perré, z ≈ -366), haut de plage sec en pente douce (2 %)
// jusqu'à la crête de la laisse des pleines mers de vives-eaux (berme), puis estran concave (6 % en haut, 2,7 % en
// bas, barres et bâches à peine marquées) jusqu'aux basses mers de vives-eaux, puis l'avant-côte. Toutes les
// distances au-delà des Planches sont multipliées par BEACH.k : berme à z ≈ -388, basse mer de vives-eaux à z ≈ -470.
// Le profil suit une côte presque droite (le trait de référence n'ondule qu'au cinquième).
const REF = { dry: 0.02, berm: 44, a: 0.06233, b: 0.0001071, low: 165 };
REF.bermH = 4.5 - REF.dry * REF.berm;
REF.lowH = REF.bermH - REF.a * REF.low + REF.b * REF.low * REF.low;
REF.lowSlope = REF.a - 2 * REF.b * REF.low;
export const BEACH = { wall: -366, wallH: 4.5, k: 0.5 };
BEACH.berm = BEACH.wall - REF.berm * BEACH.k;
BEACH.bermH = REF.bermH;
export const beachWig = (x) => 0.2 * (shoreZ(x) + 430);

// Hauteur du profil de référence à la distance d (m) du pied des Planches, vers la mer.
function refHeight(d) {
  if (d <= REF.berm) return BEACH.wallH - REF.dry * d;
  const s = d - REF.berm;
  if (s <= REF.low) {
    // Barres et bâches : ondulation de 0,12 m, plus douce que la pente (le rivage reste unique).
    const ridge = 0.12 * Math.sin((2 * Math.PI * (s - 35)) / 45) * smoothstep(30, 55, s) * smoothstep(158, 132, s);
    return REF.bermH - REF.a * s + REF.b * s * s + ridge;
  }
  const e = s - REF.low;
  return Math.max(-14, REF.lowH - REF.lowSlope * e - 0.012 * e * e);
}

// Hauteur du profil de plage à la distance zb = z - beachWig(x) (strictement décroissante vers la mer).
export function beachHeight(zb) {
  const B = BEACH;
  if (zb >= B.wall) return Math.min(B.wallH + REF.dry * (zb - B.wall), 6.5);
  return refHeight((B.wall - zb) / B.k);
}

// Rivage (z) atteint par un niveau d'eau donné sur le profil de la plage (sans le grain du sable) — carte, repères.
export function tideLineZ(x, level) {
  let lo = -640, hi = BEACH.wall; // beachHeight(lo) < level < beachHeight(hi)
  if (beachHeight(hi) <= level) return hi + beachWig(x);
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (beachHeight(m) > level) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2 + beachWig(x);
}

// Zones aplanies (centre, demi-tailles, rotation, rayon d'angle, distance de raccord).
export const ZONES = [
  { id: 'town', x: -30, z: -255, hw: 178, hd: 92, r: 10, fall: 22 },
  { id: 'pole', x: 330, z: -235, hw: 112, hd: 62, r: 12, fall: 30 },
  { id: 'hippo', x: 330, z: 230, hw: 178, hd: 100, r: 30, fall: 40 },
  { id: 'home', x: -110, z: 180, hw: 72, hd: 58, r: 10, fall: 30 },
  { id: 'haras', x: -380, z: -40, hw: 98, hd: 76, r: 12, fall: 35 },
  { id: 'dunes', x: 500, z: -290, hw: 46, hd: 36, r: 8, fall: 25 },
  { id: 'gatien', x: -228, z: 300, hw: 46, hd: 36, r: 8, fall: 25 },
];
export const zoneById = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export const ROADS = [
  { id: 'coast', w: 9, pts: [[-418, -354], [-300, -352], [-205, -352], [-30, -352], [145, -352], [300, -350], [420, -352], [575, -350]] },
  { id: 'main', w: 9, pts: [[-30, -352], [-30, -166], [-30, -118], [-30, 60], [-30, 180], [-30, 300], [-12, 420], [10, 545]] },
  { id: 'ew', w: 9, pts: [[-565, -120], [-480, -118], [-380, -122], [-200, -120], [-30, -118], [150, -120], [330, -122], [460, -120], [560, -118]] },
  { id: 'pole', w: 8, pts: [[330, -122], [330, -172]] },
  { id: 'hippo', w: 8, pts: [[-30, 60], [120, 62], [250, 66], [330, 72], [330, 128]] },
  { id: 'home', w: 6, pts: [[-30, 172], [-58, 172]] },
  { id: 'dunes', w: 6, pts: [[500, -350], [500, -322]] },
  { id: 'gatien', w: 7, pts: [[-30, 300], [-185, 300]] },
  { id: 'haras', w: 7, pts: [[-380, -122], [-380, -104]] },
  { id: 't_w', w: 7, pts: [[-130, -352], [-130, -166]] },
  { id: 't_e', w: 7, pts: [[70, -352], [70, -166]] },
  { id: 't_n', w: 7, pts: [[-205, -300], [145, -300]] },
  { id: 't_s', w: 7, pts: [[-205, -232], [145, -232]] },
  { id: 't_b', w: 7, pts: [[-205, -166], [145, -166]] },
];

// Chemins de terre (visuels + repères de balade).
export const PATHS = [
  [[-58, 172], [-75, 172]],
  [[-160, 230], [-200, 260], [-228, 300]],
  [[-30, -352], [-30, -375]],
  [[-130, -352], [-130, -375]],
  [[70, -352], [70, -375]],
  [[260, -350], [270, -380]],
  [[-300, -352], [-380, -330], [-460, -360], [-505, -405]],
  [[-160, 128], [-260, 80], [-330, 40]],
  [[100, 300], [160, 400], [130, 470]],
  [[430, 330], [470, 420]],
  [[-470, -118], [-520, -200], [-520, -300], [-505, -395]],
];

export const XC_PATH = [
  [-262, 300], [-312, 336], [-372, 332], [-430, 302], [-482, 342], [-515, 420], [-500, 490],
  [-430, 530], [-350, 515], [-292, 466], [-268, 396], [-262, 300],
];

export const POND = { x: -515, z: 420, r: 15 };

// bays : stalles de départ (couloirs de 2 m, côté extérieur de la piste) ; le couloir intérieur reste libre.
export const HIPPO = { x: 330, z: 230, half: 100, radius: 62, width: 16, bays: 6 };

export const FORESTS = [
  { x: -390, z: 415, r: 195 },
  { x: 470, z: 455, r: 115 },
  { x: -320, z: -280, r: 60 },
  { x: 230, z: 470, r: 70 },
];

export const SIGN = { x: 120, z: 520, h: 30, r: 120 };
export const LIGHTHOUSE = { x: -505, z: -405 };
export const ARCH = { x: -545, z: -462 };

// Lieux nommés (minimap, GPS, missions).
export const POI = {
  home: { x: -110, z: 172, name: 'Écurie du Val', icon: 'home' },
  town: { x: 20, z: -266, name: 'Deauvelle', icon: 'town' },
  pole: { x: 330, z: -192, name: 'Pôle International', icon: 'event' },
  hippo: { x: 330, z: 140, name: 'Hippodrome de la Touques', icon: 'event' },
  haras: { x: -380, z: -96, name: 'Haras de la Pommeraie', icon: 'stable' },
  dunes: { x: 500, z: -318, name: 'Écurie des Dunes', icon: 'stable' },
  gatien: { x: -205, z: 300, name: 'Domaine de Saint-Gatien', icon: 'stable' },
  sellerie: { x: -140, z: -266, name: 'Sellerie du Port', icon: 'shop' },
  forge: { x: -140, z: -199, name: 'Forge Lemaire', icon: 'pro' },
  vet: { x: 80, z: -199, name: 'Clinique vétérinaire de la Côte', icon: 'pro' },
  hq: { x: 108, z: -306, name: 'Strides HQ', icon: 'strides' },
  beach: { x: 40, z: -400, name: 'Plage de Deauvelle', icon: 'beach' },
  cliffs: { x: -505, z: -395, name: 'Phare d’Aval', icon: 'view' },
  sign: { x: 120, z: 470, name: 'Colline Strides', icon: 'view' },
};

const noise = createNoise2D(77);

export function forestDensity(x, z) {
  let d = 0;
  for (const f of FORESTS) {
    const r = f.r * (0.85 + 0.25 * noise(x * 0.012, z * 0.012));
    const dd = Math.hypot(x - f.x, z - f.z);
    d = Math.max(d, 1 - smoothstep(r * 0.7, r, dd));
  }
  return d;
}

export function zoneDist(x, z, zone) {
  return rectDist(x, z, zone.x, zone.z, zone.hw, zone.hd, zone.rot || 0, zone.r || 0);
}

export function nearestRoad(x, z) {
  let best = { d: Infinity, road: null };
  for (const r of ROADS) {
    const p = polyDist(x, z, r.pts);
    const d = p.d - r.w / 2;
    if (d < best.d) best = { d, road: r, x: p.x, z: p.z };
  }
  return best;
}

// Vrai si l'emplacement est occupé (zones, routes, plage, falaises) — pour placer champs, haies et arbres.
export function isReserved(x, z, margin = 0) {
  if (Math.abs(x) > WORLD.half - 8 || Math.abs(z) > WORLD.half - 8) return true;
  if (z - shoreZ(x) < 95 + margin) return true;
  for (const zone of ZONES) if (zoneDist(x, z, zone) < margin + 4) return true;
  if (nearestRoad(x, z).d < margin + 3) return true;
  if (polyDist(x, z, XC_PATH).d < margin + 6) return true;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + margin + 4) return true;
  if (Math.hypot(x - SIGN.x, z - (SIGN.z - 15)) < 45 + margin) return true;
  if (x < -430 && z < -300) return true;
  return false;
}

export function isCliffRegion(x) {
  return smoothstep(-420, -470, x);
}
