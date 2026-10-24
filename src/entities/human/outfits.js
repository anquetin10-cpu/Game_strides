// Tenues : traduit les objets de tenue du jeu ({ top, sleeve, pants, boots, skin, hair, helmet, logo, ponytail, cap })
// en morphologie (femme/homme), variante de corps, coiffure, coiffe et palette PBR réaliste (couleurs linéaires).
import * as THREE from 'three';
import { Z, S, ZONE_COUNT, SLOT_COUNT } from './zones.js';

// Prénoms féminins connus du jeu (pour les PNJ nommés dont la tenue ne précise pas le sexe).
const FEMALE_NAMES = new Set(['Camille', 'Léa', 'Chloé', 'Manon', 'Inès', 'Emma', 'Zoé', 'Margaux', 'Alice', 'Julie', 'Clara', 'Hélène', 'Lucie', 'Sarah', 'Jeanne', 'Louise', 'Margot', 'Anna', 'Lina', 'Rose']);
const MALE_NAMES = ['Hugo', 'Louis', 'Jules', 'Paul', 'Lucas', 'Arthur', 'Théo', 'Nathan', 'Victor', 'Antoine', 'Gabriel', 'Raphaël', 'Tom', 'Maxime', 'Julien'];

// Prénom plausible selon le sexe (passants anonymes).
export function randomFirstName(sex, rnd = Math.random) {
  const list = sex === 'f' ? [...FEMALE_NAMES] : MALE_NAMES;
  return list[Math.floor(rnd() * list.length)];
}

export const SKIN_TONES = ['#f1d0bb', '#e8bea0', '#dcab88', '#c99a74', '#b07c56', '#8d5e3c', '#6b4530', '#4f3225'];
export const HAIR_COLORS = ['#2a1d14', '#3b2717', '#5a3a24', '#7a5233', '#a77a4a', '#c9a46a', '#1a1614', '#8a3f22', '#b9b2a8', '#e2dccf'];
const EYES = ['#3b2414', '#4a2e18', '#5a3b22', '#3f4a52', '#56687a', '#4c5a3a', '#6a5232'];
const TOPS = ['#2f5f8a', '#b8322a', '#f2f1ec', '#2f6e4a', '#d9c9a6', '#1b1c1f', '#7a5a8a', '#c8a96e', '#5d7a8a', '#8a2f3c', '#e6d8b8', '#3a4a6a', '#9aa5ad', '#6b4a35', '#d97a4a'];
const PANTS = ['#2b3442', '#3a3d42', '#6b5d4c', '#1b1c1f', '#45536b', '#d9d2c2', '#4a5568', '#5a4a3a', '#2e3b55', '#c2b49a'];
const SHOES = ['#2a2622', '#3b2a1e', '#1b1a19', '#e9e6e0', '#5a4632', '#6b5a48'];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (r, a) => a[Math.floor(r() * a.length)];

const _c = new THREE.Color();
const _hsl = {};
// Couleur sRGB → linéaire, bornée aux albédos physiquement plausibles.
function lin(hex, lo = 0.025, hi = 0.78) {
  const c = new THREE.Color(hex);
  const m = Math.max(c.r, c.g, c.b);
  if (m > hi) c.multiplyScalar(hi / m);
  c.r = Math.max(c.r, lo * 0.6);
  c.g = Math.max(c.g, lo * 0.6);
  c.b = Math.max(c.b, lo * 0.6);
  if (Math.max(c.r, c.g, c.b) < lo) c.addScalar(lo - Math.max(c.r, c.g, c.b));
  return c;
}
const mul = (c, r, g, b) => new THREE.Color(c.r * r, c.g * g, c.b * b);

// Matières : [rugosité, sheen, vernis, rugosité du vernis]
const PBR = {
  skin: [0.5, 0.22, 0, 0], lips: [0.4, 0.12, 0.15, 0.25], eye: [0.25, 0, 0.9, 0.05], brow: [0.75, 0.25, 0, 0],
  hair: [0.42, 0.5, 0, 0], wool: [0.8, 0.6, 0, 0], cotton: [0.78, 0.5, 0, 0], tech: [0.6, 0.45, 0.05, 0.4],
  breeches: [0.72, 0.55, 0, 0], denim: [0.88, 0.35, 0, 0], leather: [0.42, 0.05, 0.35, 0.3], boots: [0.36, 0, 0.85, 0.1],
  rubber: [0.85, 0, 0, 0], gloves: [0.55, 0.25, 0.1, 0.4], helmet: [0.6, 0.4, 0.05, 0.5], helmet2: [0.38, 0.05, 0.5, 0.15],
  felt: [0.82, 0.5, 0, 0], logo: [0.55, 0.35, 0, 0],
};

export function inferSex(outfit = {}, name = '') {
  if (outfit.sex === 'f' || outfit.sex === 'm') return outfit.sex;
  if (name && FEMALE_NAMES.has(name.split(' ')[0])) return 'f';
  if (outfit.ponytail || outfit.dress) return 'f';
  if (name) return 'm';
  const h = hashStr(JSON.stringify(outfit));
  return h % 100 < (outfit.helmet ? 62 : 50) ? 'f' : 'm';
}

// Résout une tenue en description complète (mise en cache par contenu).
const cache = new Map();
export function resolveOutfit(outfit = {}, name = '') {
  const sex = inferSex(outfit, name);
  const key = sex + JSON.stringify(outfit);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(hashStr(key) ^ 0x9e3779b9);
  const rider = !!outfit.helmet || outfit.style === 'rider';
  let style = outfit.style || (rider ? 'rider' : sex === 'f' && (outfit.dress || (!outfit.logo && !outfit.ponytail && r() < 0.0)) ? 'dress' : 'casual');
  if (style === 'dress' && sex === 'm') style = 'casual';
  const body = `${sex}_${style}`;
  // Coiffure
  let hair = outfit.hairStyle;
  if (!hair) {
    if (sex === 'f') hair = rider ? 'bun' : outfit.ponytail ? 'ponytail' : pickR(r, ['bob', 'long', 'bun', 'ponytail', 'pixie']);
    else hair = pickR(r, ['short', 'short', 'side', 'crop', outfit.cap ? 'short' : 'bald']);
  }
  const head = outfit.helmet ? 'helmet' : outfit.cap ? 'cap' : outfit.hat || null;
  const parts = [];
  // Sous le casque, seuls les cheveux visibles sous le bord sont gardés (chignon en filet, nuque).
  if (head === 'helmet' && hair !== 'bald' && hair !== 'crop') parts.push(sex === 'f' && hair !== 'pixie' ? 'hair_net' : 'hair_nape');
  else if (hair && hair !== 'bald' && hair !== 'crop') parts.push(`hair_${hair}`);
  if (head) parts.push(head);

  // Palette
  const skinHex = outfit.skin || pickR(r, SKIN_TONES);
  const skin = lin(skinHex, 0.03, 0.62);
  const hairHex = outfit.hair || pickR(r, HAIR_COLORS);
  const hairC = lin(hairHex, 0.012, 0.55);
  const slots = new Array(SLOT_COUNT);
  const set = (i, color, pbr) => (slots[i] = { color, pbr });
  set(S.SKIN, skin, PBR.skin);
  set(S.LIPS, mul(skin, 0.9, 0.56, 0.55), PBR.lips);
  set(S.SCLERA, new THREE.Color(0.5, 0.47, 0.44), PBR.eye);
  set(S.IRIS, lin(outfit.eyes || pickR(r, EYES), 0.02, 0.3), PBR.eye);
  set(S.PUPIL, new THREE.Color(0.012, 0.011, 0.01), PBR.eye);
  set(S.BROW, skin.clone().lerp(hairC, 0.6), PBR.brow);
  set(S.HAIR, hairC, PBR.hair);
  // barbe : rasé de près, ombre de barbe légère ou barbe courte
  const beard = sex === 'm' ? (outfit.beard === true ? 0.55 : outfit.beard === false ? 0 : r() < 0.3 ? (r() < 0.5 ? 0.3 : 0.55) : 0.08) : 0;
  set(S.BEARD, skin.clone().lerp(hairC, beard), PBR.brow);
  set(S.EYE_LOD, mul(skin, 0.35, 0.3, 0.3), PBR.brow);
  const top = lin(outfit.top || '#1b1c1f');
  const pants = lin(outfit.pants || '#3a3d42');
  const shoes = lin(outfit.boots || '#2a2622', 0.02, 0.6);
  set(S.TOP, top, rider ? PBR.wool : outfit.logo ? PBR.tech : PBR.cotton);
  set(S.TOP2, rider ? lin('#f3f2ee') : outfit.collar ? lin(outfit.collar) : top, PBR.cotton);
  set(S.LOGO, outfit.logo ? lin('#f2f1ec') : top, PBR.logo);
  set(S.PANTS, pants, rider ? PBR.breeches : PBR.denim);
  set(S.BELT, lin(outfit.belt || (r() < 0.5 ? '#3b2a1e' : '#1b1a19'), 0.02, 0.5), PBR.leather);
  set(S.SHOES, shoes, rider ? PBR.boots : PBR.leather);
  set(S.SOLE, lin(rider ? '#151413' : r() < 0.3 ? '#d8d4cc' : '#1f1d1b', 0.02, 0.7), PBR.rubber);
  set(S.GLOVES, lin(outfit.gloves || '#18181a'), PBR.gloves);
  set(S.HELMET, lin(outfit.helmet || '#16171a'), PBR.helmet);
  set(S.HELMET2, lin(outfit.helmet ? '#121214' : '#16171a'), PBR.helmet2);
  set(S.HAT, lin(outfit.cap || outfit.hatColor || '#2f5f8a'), PBR.felt);
  set(S.TIE, lin('#141414'), PBR.felt);

  // Zones → emplacements
  const zs = new Array(ZONE_COUNT).fill(S.SKIN);
  const m = (z, s) => (zs[z] = s);
  m(Z.LIPS, S.LIPS); m(Z.SCLERA, S.SCLERA); m(Z.IRIS, S.IRIS); m(Z.PUPIL, S.PUPIL); m(Z.BROW, S.BROW);
  m(Z.SCALP, hair === 'bald' ? S.SKIN : hair === 'crop' ? S.BEARD : S.HAIR);
  if (hair === 'crop') set(S.BEARD, skin.clone().lerp(hairC, 0.6), PBR.brow);
  m(Z.BEARD, S.BEARD); m(Z.EYE_LOD, S.EYE_LOD);
  m(Z.HAIR, S.HAIR); m(Z.HAIR_TIE, S.TIE);
  m(Z.HELMET, S.HELMET); m(Z.HELMET_PEAK, S.HELMET2); m(Z.HELMET_TRIM, S.HELMET2);
  m(Z.CAP, S.HAT); m(Z.CAP_BRIM, S.HAT);
  for (const z of [Z.TOP, Z.TOP_LOW, Z.HIPS, Z.LAPEL, Z.SLEEVE_UP, Z.CUFF, Z.SKIRT]) m(z, S.TOP);
  m(Z.LOGO, S.LOGO);
  const bareArms = outfit.sleeve && outfit.skin && outfit.sleeve === outfit.skin;
  m(Z.SLEEVE_LOW, bareArms ? S.SKIN : S.TOP);
  m(Z.COLLAR, S.TOP2); m(Z.SHIRT, S.TOP2);
  for (const z of [Z.SEAT, Z.THIGH, Z.KNEE]) m(z, S.PANTS);
  m(Z.BELT, rider ? S.PANTS : S.BELT);
  m(Z.CALF, rider ? S.SHOES : S.PANTS);
  m(Z.FOOT, S.SHOES); m(Z.SOLE, S.SOLE);
  m(Z.HAND, rider || outfit.gloves ? S.GLOVES : S.SKIN);
  if (style === 'dress') {
    m(Z.LEG_BARE, outfit.tights ? S.PANTS : S.SKIN);
    m(Z.SLEEVE_LOW, S.SKIN);
    m(Z.COLLAR, S.TOP);
  }
  const res = {
    sex, style, body, hair, head, parts, slots, zoneSlot: zs,
    scale: outfit.scale || (sex === 'f' ? 0.955 + r() * 0.08 : 0.955 + r() * 0.08),
    rider,
  };
  cache.set(key, res);
  return res;
}

export function randomOutfit(rnd = Math.random) {
  const p = (a) => a[Math.floor(rnd() * a.length)];
  const sex = rnd() < 0.5 ? 'f' : 'm';
  const top = p(TOPS);
  const skin = p(SKIN_TONES);
  const o = {
    sex, top, sleeve: rnd() < 0.45 ? top : skin, pants: p(PANTS), boots: p(SHOES), skin, hair: p(HAIR_COLORS.slice(0, 8)),
    helmet: null, ponytail: false, cap: rnd() < 0.14 ? p(TOPS) : null,
  };
  if (sex === 'f') {
    o.hairStyle = p(['bob', 'long', 'bun', 'ponytail', 'ponytail', 'pixie']);
    o.ponytail = o.hairStyle === 'ponytail';
    if (rnd() < 0.3) o.dress = true;
  } else o.hairStyle = p(['short', 'short', 'side', 'crop', 'bald']);
  if (rnd() < 0.08) o.hair = p(['#b9b2a8', '#e2dccf']);
  return o;
}
