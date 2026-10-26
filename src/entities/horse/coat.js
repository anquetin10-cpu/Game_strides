// Robes du cheval : couleurs (albédo linéaire réaliste), extrémités noires, balzanes, liste, pommelures,
// et matériau de pelage physique (reflet satiné « sheen », sabots cirés, œil vitreux, occlusion ambiante).
import * as THREE from 'three';
import { addCloudShadows } from '../../world/sky.js';

// Champs historiques : body, mane, legs (bas des membres), muzzle, hoof — plus des réglages réalistes optionnels.
export const COATS = {
  bay: { body: '#7c4a2c', mane: '#16110f', legs: '#1a1512', muzzle: '#231b17', hoof: '#2a2420', points: 1, sheen: '#c98a5a', dapple: 0.15 },
  chestnut: { body: '#9c5a31', mane: '#86461f', legs: '#8a4c2a', muzzle: '#5a3a2b', hoof: '#3b3029', points: 0, sheen: '#e0a070', dapple: 0.1, flaxen: 0.25 },
  grey: { body: '#8f8d89', mane: '#d9d7d2', legs: '#5c5a57', muzzle: '#3e3c3a', hoof: '#34302d', points: 0.55, sheen: '#e8e6e2', dapple: 1, lightHead: 0.35 },
  black: { body: '#1d1b1a', mane: '#0e0d0d', legs: '#141312', muzzle: '#1a1817', hoof: '#1b1a19', points: 0, sheen: '#7d8aa0', dapple: 0 },
  palomino: { body: '#d0a660', mane: '#efe6cf', legs: '#c39a58', muzzle: '#6b5440', hoof: '#4a3f35', points: 0, sheen: '#ffe0a0', dapple: 0.1 },
  darkbay: { body: '#4b2d1d', mane: '#120e0c', legs: '#15110f', muzzle: '#1d1714', hoof: '#221d1a', points: 1, sheen: '#b07650', dapple: 0.1 },
  white: { body: '#dddbd5', mane: '#ecebe6', legs: '#cfcdc7', muzzle: '#4a4744', hoof: '#5a5550', points: 0, sheen: '#ffffff', dapple: 0.25, fleabit: 0.6 },
};

const _c = new THREE.Color();
const lin = (hex, out = new THREE.Color()) => out.set(hex); // three convertit sRGB → linéaire

// Bruit de valeur 3D (déterministe) pour les irrégularités cuites dans les couleurs de sommets.
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Description complète d'une robe (clé ou objet personnalisé).
export function resolveCoat(coat) {
  const c = typeof coat === 'object' && coat ? coat : COATS[coat] || COATS.bay;
  return {
    body: lin(c.body),
    mane: lin(c.mane || c.body),
    legs: lin(c.legs || c.body),
    muzzle: lin(c.muzzle || c.body),
    hoof: lin(c.hoof || '#2a2420'),
    sheen: lin(c.sheen || c.body),
    points: c.points ?? (typeof coat === 'object' ? 1 : 0),
    dapple: c.dapple ?? 0,
    lightHead: c.lightHead ?? 0,
    fleabit: c.fleabit ?? 0,
    flaxen: c.flaxen ?? 0,
  };
}

/**
 * Couleurs de sommets (basse fréquence) : robe, extrémités, bout du nez, oreilles, sabots, ventre plus clair.
 * rest : positions de repos (unités du modèle), S : échelle du modèle, skin : poids (pour les sabots, oreilles).
 */
export function bakeCoatColors(assets, coat) {
  const { body } = assets;
  const S = assets.scale;
  const R = body.rest, N = body.restNormal;
  const n = R.length / 3;
  const out = new Uint16Array(n * 3);
  const C = resolveCoat(coat);
  const head = assets.meta.head;
  const tmp = new THREE.Color();
  const toS = (v) => Math.round(Math.min(1, Math.max(0, v)) * 65535);
  // Os des sabots et des oreilles (index).
  const names = assets.bones.map((b) => b.name);
  const hoofB = new Set(['flH', 'frH', 'hlH', 'hrH'].map((k) => names.indexOf(k)));
  const earB = new Set(['earL', 'earR'].map((k) => names.indexOf(k)));
  for (let i = 0; i < n; i++) {
    const x = R[i * 3] / S, y = R[i * 3 + 1] / S, z = R[i * 3 + 2] / S;
    tmp.copy(C.body);
    // Ombrage naturel du poil : dessus du dos un peu plus foncé, ventre et intérieur des cuisses plus clairs.
    const ny = N[i * 3 + 1];
    const k0 = 1 + 0.07 * sstep(1.2, 0.9, y) * sstep(0.6, 1.0, y) - 0.06 * Math.max(0, ny) * sstep(1.45, 1.6, y);
    tmp.multiplyScalar(k0);
    // Légère variation (irrégularités du poil).
    const nz = vnoise(x * 9, y * 9, z * 9) * 0.6 + vnoise(x * 23, y * 23, z * 23) * 0.4;
    tmp.multiplyScalar(0.94 + nz * 0.12);
    // Extrémités : bas des membres (jusqu'aux genoux et jarrets), irrégulier.
    if (C.points > 0) {
      const top = z > 0 ? 0.56 : 0.6;
      const jag = (vnoise(x * 20, y * 6, z * 20) - 0.5) * 0.08;
      const k = sstep(top + 0.09, top - 0.05, y + jag) * C.points;
      if (k > 0) tmp.lerp(C.legs, k);
    } else {
      // Robes sans extrémités noires : bas des membres légèrement plus foncé.
      const k = sstep(0.55, 0.15, y) * 0.35;
      if (k > 0) tmp.lerp(C.legs, k);
    }
    // Tête : coordonnées le long du chanfrein (b) et vers le front (c).
    const qy = y - head.o[1], qz = z - head.o[2];
    const b = qy * head.f[1] + qz * head.f[2], c = qy * head.u[1] + qz * head.u[2];
    if (b > -0.1 && Math.abs(x) < 0.16 && c > -0.3 && c < 0.12) {
      // Bout du nez et tour des yeux : peau foncée, poil ras.
      const dm = Math.hypot((b - 0.6) / 1.25, c + 0.04, x / 1.3);
      const km = sstep(0.11, 0.05, dm);
      if (C.lightHead > 0) tmp.lerp(C.mane, C.lightHead * sstep(0.45, 0.1, b));
      if (km > 0) tmp.lerp(C.muzzle, km);
    }
    // Oreilles : bords et pointes foncés.
    let ear = 0, hoof = 0;
    for (let k = 0; k < 4; k++) {
      const bi = body.skinI[i * 4 + k], w = body.skinW[i * 4 + k] / 255;
      if (earB.has(bi)) ear += w;
      if (hoofB.has(bi)) hoof += w;
    }
    if (ear > 0.3) tmp.lerp(C.mane, sstep(1.98, 2.12, y) * 0.75);
    // Sabots.
    if (hoof > 0.5) tmp.copy(C.hoof);
    if (body.eye[i]) tmp.setRGB(0.01, 0.008, 0.007);
    out[i * 3] = toS(tmp.r);
    out[i * 3 + 1] = toS(tmp.g);
    out[i * 3 + 2] = toS(tmp.b);
  }
  void _c;
  return out;
}

// ---------- Matériau de pelage ----------
const VERT_DECL = /* glsl */ `
attribute vec2 aExtra;
varying vec3 vRest;
varying vec3 vRestN;
varying vec2 vExtra;
uniform float uScaleInv;
`;
const VERT_MAIN = /* glsl */ `
vRest = position * uScaleInv;
vRestN = normal;
vExtra = aExtra;
`;
const FRAG_DECL = /* glsl */ `
varying vec3 vRest;
varying vec3 vRestN;
varying vec2 vExtra;
uniform vec4 uSocks;        // hauteur des balzanes (m) : AG, AD, PG, PD (0 = aucune)
uniform vec4 uBlaze;        // b0, b1, demi-largeur haut, demi-largeur bas (m) ; b1 < 0 = aucune
uniform vec3 uStar;         // b, c, rayon (étoile en tête)
uniform vec3 uWhite;        // couleur des marques blanches
uniform vec3 uHoof;         // couleur des sabots
uniform vec3 uHeadO;
uniform vec3 uHeadF;
uniform vec3 uHeadU;
uniform vec4 uHoofC[4];     // centres des sabots (x, z), hauteur couronne pince/talons
uniform float uDapple;
uniform float uFleabit;
uniform vec3 uDappleCol;
uniform vec3 uEyeC[2];
uniform vec3 uEyeAxis[2];
uniform float uWet;        // pluie (0..1)
uniform float uSweat;      // transpiration (0..1)
uniform float uWater;      // hauteur mouillée par l'eau (m, 0 = sec)
float hHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hHash(i), hHash(i + vec3(1,0,0)), f.x), mix(hHash(i + vec3(0,1,0)), hHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hHash(i + vec3(0,0,1)), hHash(i + vec3(1,0,1)), f.x), mix(hHash(i + vec3(0,1,1)), hHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// Cellules (pommelures) : distance au germe le plus proche (germes dans [0,25 ; 0,75] → voisinage 2×2×2).
float hCell(vec3 p) {
  vec3 i = floor(p - 0.5); float d = 8.0;
  for (int z = 0; z < 2; z++) for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec3 g = i + vec3(float(x), float(y), float(z));
    vec3 r = g + 0.25 + 0.5 * vec3(hHash(g), hHash(g + 7.1), hHash(g + 3.7)) - p;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
`;
const FRAG_COLOR = /* glsl */ `
float hEye = vExtra.y;
float hHoofK = 0.0;
float hSkinK = 0.0;
float hWetK = 0.0;
float hFoamK = 0.0;
{
  vec3 p = vRest;
  vec3 c = diffuseColor.rgb;
  // Sabots : sous la ligne de la couronne (inclinée : haute en pince, basse aux talons).
  int leg = p.z > 0.0 ? (p.x > 0.0 ? 0 : 1) : (p.x > 0.0 ? 2 : 3);
  vec4 hc = leg == 0 ? uHoofC[0] : leg == 1 ? uHoofC[1] : leg == 2 ? uHoofC[2] : uHoofC[3];
  float zr = clamp((p.z - hc.y) / 0.07 + 0.5, 0.0, 1.0);
  float cor = mix(hc.w, hc.z, zr);
  float dxz = length(vec2(p.x - hc.x, p.z - hc.y));
  hHoofK = (1.0 - smoothstep(cor - 0.002, cor + 0.003, p.y)) * (1.0 - smoothstep(0.09, 0.11, dxz));
  // Balzanes : bord irrégulier, poil blanc jusqu'à la hauteur demandée.
  float sockH = leg == 0 ? uSocks.x : leg == 1 ? uSocks.y : leg == 2 ? uSocks.z : uSocks.w;
  if (sockH > 0.0 && p.y < 0.75) {
    float jag = (hNoise(p * vec3(38.0, 9.0, 38.0)) - 0.5) * 0.05 + (hNoise(p * 90.0) - 0.5) * 0.012;
    float k = 1.0 - smoothstep(sockH - 0.006, sockH + 0.006, p.y + jag);
    c = mix(c, uWhite, k);
    // Sabot clair (corne striée) sous une balzane.
    float stripe = 0.75 + 0.25 * hNoise(vec3(atan(p.x - hc.x, p.z - hc.y) * 6.0, p.y * 2.0, 0.0));
    hHoofK *= 1.0;
    if (k > 0.5) c = mix(c, mix(uHoof, vec3(0.55, 0.47, 0.36) * stripe, 0.85), hHoofK);
  }
  if (hHoofK > 0.0 && sockH <= 0.0) {
    float stripe = 0.85 + 0.15 * hNoise(vec3(atan(p.x - hc.x, p.z - hc.y) * 8.0, p.y * 3.0, 1.0));
    c = mix(c, uHoof * stripe, hHoofK);
  }
  // Tête : liste, étoile.
  vec3 q = p - uHeadO;
  float hb = dot(q, uHeadF), hcq = dot(q, uHeadU);
  if (hb > -0.05 && hb < 0.7 && abs(p.x) < 0.13) {
    float thr = 0.035 - smoothstep(0.55, 0.64, hb) * 0.07;
    float face = smoothstep(0.15, 0.55, dot(normalize(vRestN), uHeadU)) * smoothstep(thr - 0.02, thr, hcq);
    float wob = (hNoise(vec3(hb * 30.0, p.x * 30.0, 2.0)) - 0.5) * 0.012;
    if (uBlaze.y > 0.0) {
      float t = clamp((hb - uBlaze.x) / max(uBlaze.y - uBlaze.x, 0.01), 0.0, 1.0);
      float w = mix(uBlaze.z, uBlaze.w, t);
      float kb = (1.0 - smoothstep(w - 0.004, w + 0.004, abs(p.x) + wob)) * smoothstep(uBlaze.x - 0.01, uBlaze.x + 0.01, hb) * (1.0 - smoothstep(uBlaze.y - 0.01, uBlaze.y + 0.01, hb));
      c = mix(c, uWhite, kb * face);
    }
    if (uStar.z > 0.0) {
      float ds = length(vec2((hb - uStar.x) * 0.8, p.x)) + wob;
      c = mix(c, uWhite, (1.0 - smoothstep(uStar.z - 0.004, uStar.z + 0.004, ds)) * face);
    }
    // Peau nue du bout du nez (plus brillante).
    hSkinK = 1.0 - smoothstep(0.07, 0.11, length(vec3((hb - 0.6) / 1.25, hcq + 0.04, p.x / 1.3)));
  }
  // Pommelures (gris) et truitures (blanc).
  if (uDapple > 0.0 && p.y > 0.6) {
    // Taches claires irrégulières (domaine déformé, bords flous) sur un réseau plus sombre.
    vec3 dp = p * vec3(12.0, 12.0, 10.0) + (vec3(hNoise(p * 5.0), hNoise(p * 5.0 + 11.0), hNoise(p * 5.0 + 23.0)) - 0.5) * 0.9;
    float dc = hCell(dp) + (hNoise(p * 40.0) - 0.5) * 0.12;
    float spot = (1.0 - smoothstep(0.1, 0.5, dc)) * (0.65 + 0.35 * hNoise(p * 7.0));
    float net = smoothstep(0.4, 0.78, dc);
    float body = smoothstep(0.62, 0.9, p.y) * (1.0 - smoothstep(0.6, 0.85, hb + 0.5 * step(0.0, p.z - 1.0)));
    c = mix(c, uDappleCol, spot * uDapple * 0.7 * body);
    c *= 1.0 - net * 0.2 * uDapple * body;
  }
  if (uFleabit > 0.0) {
    float f = step(0.9, hNoise(p * 160.0)) * hNoise(p * 37.0);
    c = mix(c, vec3(0.16, 0.1, 0.06), f * uFleabit);
  }
  // Grain du poil : stries fines dans le sens du poil (vers l'arrière et vers le bas).
  float grain = hNoise(p * vec3(260.0, 90.0, 35.0)) * 0.6 + hNoise(p * vec3(120.0, 40.0, 18.0)) * 0.4;
  c *= mix(1.0, 0.9 + 0.2 * grain, 1.0 - hHoofK);
  // Mouillé (pluie, eau, transpiration) : poil plaqué plus sombre et brillant ; écume blanche aux frottements.
  if (uWet + uSweat + uWater > 0.0) {
    float n1 = hNoise(p * 9.0), n2 = hNoise(p * 31.0);
    float rain = uWet * (0.55 + 0.45 * smoothstep(-0.3, 0.7, vRestN.y)) * (0.8 + 0.2 * n1);
    float water = 1.0 - smoothstep(uWater - 0.04, uWater + 0.06 + 0.05 * n1, p.y);
    // Zones de transpiration : encolure, épaules, poitrail, passage de sangle, flancs, entre les cuisses.
    float neck = smoothstep(0.5, 0.75, p.z) * (1.0 - smoothstep(1.15, 1.3, p.z)) * smoothstep(1.05, 1.3, p.y);
    float girth = (1.0 - smoothstep(0.08, 0.2, abs(p.z - 0.38))) * smoothstep(0.85, 1.0, p.y) * (1.0 - smoothstep(1.3, 1.45, p.y));
    float pad = (1.0 - smoothstep(0.12, 0.22, abs(p.y - 1.2))) * smoothstep(-0.38, -0.25, p.z) * (1.0 - smoothstep(0.42, 0.5, p.z));
    float thighs = (1.0 - smoothstep(0.08, 0.16, abs(p.x))) * (1.0 - smoothstep(-0.55, -0.45, p.z)) * smoothstep(0.75, 0.95, p.y) * (1.0 - smoothstep(1.3, 1.4, p.y));
    float flank = smoothstep(0.9, 1.1, p.y) * (1.0 - smoothstep(1.45, 1.6, p.y)) * (1.0 - smoothstep(0.35, 0.6, abs(p.z + 0.2)));
    float zone = clamp(max(max(neck, girth), max(max(pad, thighs), flank * 0.8)), 0.0, 1.0);
    float sw = zone * smoothstep(0.08, 0.7, uSweat + (n1 - 0.5) * 0.25);
    hWetK = clamp(max(max(rain, water), sw), 0.0, 1.0) * (1.0 - hEye);
    c *= mix(1.0, 0.58, hWetK * (1.0 - hHoofK));
    // Écume (sueur abondante) : lignes de frottement seulement — bas du tapis, bords de la sangle, entre les cuisses.
    float padEdge = (1.0 - smoothstep(0.012, 0.035, abs(p.y - 1.175))) * smoothstep(-0.3, -0.24, p.z) * (1.0 - smoothstep(0.38, 0.44, p.z));
    float girthEdge = (1.0 - smoothstep(0.012, 0.03, abs(abs(p.z - 0.37) - 0.055))) * smoothstep(0.86, 0.95, p.y) * (1.0 - smoothstep(1.18, 1.24, p.y));
    float inner = thighs * (1.0 - smoothstep(0.03, 0.09, abs(p.x)));
    float lather = max(max(padEdge, girthEdge), inner);
    hFoamK = smoothstep(0.6, 1.0, uSweat) * lather * smoothstep(0.55, 0.85, n2 * 0.75 + n1 * 0.45) * 0.9;
    c = mix(c, vec3(0.74, 0.72, 0.67), hFoamK);
  }
  // Œil : iris brun sombre, pupille horizontale, reflet humide (vernis).
  if (hEye > 0.5) {
    int ei = p.x > 0.0 ? 0 : 1;
    vec3 ed = normalize(p - uEyeC[ei]);
    float ca = dot(ed, uEyeAxis[ei]);
    vec3 side = normalize(cross(uEyeAxis[ei], vec3(0.0, 1.0, 0.0)));
    float px = dot(ed, side), py = ed.y;
    float pupil = 1.0 - smoothstep(0.18, 0.24, length(vec2(px * 0.55, py * 1.3)));
    float iris = smoothstep(0.55, 0.75, ca);
    c = mix(vec3(0.06, 0.035, 0.02), vec3(0.11, 0.06, 0.03) * (0.8 + 0.4 * hNoise(ed * 40.0)), iris);
    c = mix(c, vec3(0.004), pupil * iris);
  }
  diffuseColor.rgb = c;
}
`;

const ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.32, hHoofK);
roughnessFactor = mix(roughnessFactor, 0.36, hSkinK);
roughnessFactor = mix(roughnessFactor, 0.2, hWetK);
roughnessFactor = mix(roughnessFactor, 0.85, hFoamK);
roughnessFactor = mix(roughnessFactor, 0.04, hEye);
`;
const PHYS = /* glsl */ `
#ifdef USE_SHEEN
  material.sheenColor = (0.06 + 0.5 * sqrt(diffuseColor.rgb)) * sheenColor * (1.0 - hHoofK) * (1.0 - hEye) * (1.0 - hSkinK * 0.7) * (1.0 - 0.6 * hWetK) * (1.0 - hFoamK);
#endif
`;
const AO = /* glsl */ `
float ambientOcclusion = mix(1.0, vExtra.x, 0.9);
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_SHEEN )
  sheenSpecularIndirect *= ambientOcclusion;
#endif
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
#endif
`;


// Paramètres de marques (liste, étoile, balzanes) tirés d'une graine.
export function markings(opts, rnd) {
  const socks = opts.socks || [false, false, false, false];
  const sockH = socks.map((s) => (s ? 0.13 + rnd() * rnd() * 0.24 : 0));
  let blaze = [0, -1, 0, 0], star = [0, 0, 0];
  if (opts.blaze) {
    const k = rnd();
    if (k < 0.5) blaze = [0.12 + rnd() * 0.05, 0.635, 0.02 + rnd() * 0.012, 0.035 + rnd() * 0.02]; // liste
    else if (k < 0.8) {
      star = [0.19 + rnd() * 0.03, 0, 0.022 + rnd() * 0.012];
      blaze = [0.22, 0.45 + rnd() * 0.15, 0.008, 0.012 + rnd() * 0.01]; // étoile + liste étroite
    } else star = [0.2, 0, 0.025 + rnd() * 0.015]; // étoile
  }
  return { sockH, blaze, star };
}


/**
 * Matériaux de robe d'un cheval : proche (physique, reflet satiné « sheen ») et lointain (standard, plus léger),
 * partageant les mêmes réglages (marques, mouillé). L'œil doit son reflet vitreux à une rugosité très faible.
 */
export function createCoatMaterial(assets, coat, mk) {
  const C = resolveCoat(coat);
  const meta = assets.meta;
  const hoofC = meta.hoofC || [[0.145, 0.664, 0.075, 0.036], [-0.145, 0.664, 0.075, 0.036], [0.15, -0.685, 0.077, 0.038], [-0.15, -0.685, 0.077, 0.038]];
  const U = {
    uScaleInv: { value: 1 / assets.scale },
    uSocks: { value: new THREE.Vector4(...mk.sockH) },
    uBlaze: { value: new THREE.Vector4(...mk.blaze) },
    uStar: { value: new THREE.Vector3(...mk.star) },
    uWhite: { value: new THREE.Color('#e9e6df') },
    uHoof: { value: C.hoof.clone() },
    uHeadO: { value: new THREE.Vector3(...meta.head.o) },
    uHeadF: { value: new THREE.Vector3(...meta.head.f) },
    uHeadU: { value: new THREE.Vector3(...meta.head.u) },
    uHoofC: { value: hoofC.map((h) => new THREE.Vector4(...h)) },
    uDapple: { value: C.dapple },
    uFleabit: { value: C.fleabit },
    uDappleCol: { value: C.mane.clone().lerp(C.body, 0.25) },
    uEyeC: { value: meta.eyes.map((e) => new THREE.Vector3(...e)) },
    uEyeAxis: { value: meta.eyeAxis.map((e) => new THREE.Vector3(...e)) },
    uWet: { value: 0 },
    uSweat: { value: 0 },
    uWater: { value: 0 },
  };
  const patch = (m, key) => {
    m.userData.uniforms = U;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + ROUGH)
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + PHYS)
        .replace('#include <aomap_fragment>', AO);
      addCloudShadows(sh, null, true);
    };
    m.customProgramCacheKey = () => key;
    return m;
  };
  const near = patch(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.52,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.42,
      sheenColor: C.sheen.clone().lerp(new THREE.Color(1, 1, 1), 0.5).multiplyScalar(0.55),
      specularIntensity: 0.6,
    }),
    'horse-coat-2',
  );
  const far = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0 }), 'horse-coat-far-2');
  return { near, far, uniforms: U };
}
