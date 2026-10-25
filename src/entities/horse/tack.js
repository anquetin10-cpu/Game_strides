// Sellerie au jeu : tapis STRIDES (texture générée : matelassage, passepoil blanc, logo), cuirs, acier, laiton,
// caoutchouc ; ensembles d'indices selon l'équipement (sellé, rênes en main ou sur l'encolure, licol, guêtres).
import * as THREE from 'three';
import { addCloudShadows } from '../../world/sky.js';

// Ordre et sens des matériaux : voir scripts/horse/tack.mjs (TACK_MAT).
const PALETTE = [
  // [couleur sRGB, rugosité, métal]
  ['#15161a', 0.82, 0], // 0 tapis (couleur remplacée par l'option pad)
  ['#5a341d', 0.48, 0], // 1 selle (cuir havane)
  ['#24170f', 0.45, 0], // 2 cuir du filet, étrivières
  ['#c9c9cc', 0.22, 1], // 3 acier inoxydable
  ['#b38a3e', 0.3, 1], // 4 laiton
  ['#141414', 0.5, 0], // 5 guêtres
  ['#3a2214', 0.55, 0], // 6 licol en cuir
  ['#121212', 0.62, 0], // 7 sangle
  ['#3f2414', 0.7, 0], // 8 siège (cuir grainé)
  ['#0f0f0f', 0.8, 0], // 9 caoutchouc (rênes, étriers)
];

let padTex = null;
function makePadTexture() {
  if (typeof document === 'undefined') {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  // V : moitié haute = côté gauche (0 = dos, 0,5 = bas), moitié basse = côté droit.
  // Vert : surpiqûres du matelassage (losanges).
  g.strokeStyle = 'rgb(0,255,0)';
  g.lineWidth = 2;
  for (let k = -S; k < S * 2; k += 34) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + S, S);
    g.stroke();
    g.beginPath();
    g.moveTo(k, S);
    g.lineTo(k + S, 0);
    g.stroke();
  }
  // Rouge : passepoil du contour (avant, arrière, bas de chaque côté).
  g.fillStyle = 'rgb(255,0,0)';
  const half = S / 2;
  for (const y0 of [0, half]) {
    g.fillRect(0, y0, 9, half);
    g.fillRect(S - 9, y0, 9, half);
    g.fillRect(0, y0 + half - 9, S, 9);
  }
  // Bleu : logo STRIDES près du coin arrière-bas, lisible de chaque côté.
  g.fillStyle = 'rgb(0,0,255)';
  g.font = '800 34px "Helvetica Neue", Arial, sans-serif';
  g.textBaseline = 'middle';
  const word = 'S T R I D E S';
  g.textAlign = 'right';
  g.fillText(word, S - 30, half * 0.8); // côté gauche : arrière = u élevé
  g.textAlign = 'left';
  g.fillText(word, 30, half + half * 0.8); // côté droit : arrière = u faible
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false; // v = rangée du canevas (0 = dos)
  tex.anisotropy = 4;
  return tex;
}

const VERT = /* glsl */ `
attribute float aMat;
varying float vMat;
`;
const FRAG_DECL = /* glsl */ `
varying float vMat;
uniform vec3 uCol[10];
uniform vec2 uRM[10];
uniform vec3 uPad;
uniform vec3 uTrim;
`;
const FRAG_COLOR = /* glsl */ `
int mid = int(vMat + 0.5);
vec3 tcol = uCol[0];
vec2 trm = uRM[0];
for (int k = 0; k < 10; k++) if (k == mid) { tcol = uCol[k]; trm = uRM[k]; }
if (mid == 0) {
  vec3 mk = texture2D(map, vMapUv).rgb;
  float trim = max(mk.r, mk.b);
  tcol = mix(uPad, uTrim, trim) * (1.0 - 0.45 * mk.g * (1.0 - trim));
  trm.x = mix(0.85, 0.5, trim);
}
diffuseColor.rgb = tcol;
`;

const mats = new Map();
export function tackMaterial(pad = '#15161a', trim = '#f2f1ec') {
  const key = pad + trim;
  let m = mats.get(key);
  if (m) return m;
  if (!padTex) padTex = makePadTexture();
  m = new THREE.MeshStandardMaterial({ map: padTex, roughness: 1, metalness: 1 });
  const U = {
    uCol: { value: PALETTE.map((p) => new THREE.Color(p[0])) },
    uRM: { value: PALETTE.map((p) => new THREE.Vector2(p[1], p[2])) },
    uPad: { value: new THREE.Color(pad) },
    uTrim: { value: new THREE.Color(trim) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT).replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = trm.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = trm.y;');
    addCloudShadows(sh);
  };
  m.customProgramCacheKey = () => 'horse-tack-1';
  mats.set(key, m);
  return m;
}

// Ensembles de pièces selon l'équipement.
const SETS = {
  saddled: ['pad', 'saddle', 'girth', 'stirrups', 'bridle'],
  boots: ['bootsF', 'bootsH'],
  halter: ['halter'],
};
const cache = new Map();
export function tackIndex(T, cfg) {
  const lod = cfg.lod ? 1 : 0;
  const key = `${cfg.saddle ? 1 : 0}${cfg.mounted ? 1 : 0}${cfg.boots ? 1 : 0}${lod}`;
  let a = cache.get(key);
  if (a) return a;
  // Au loin : seulement les grandes pièces (tapis, selle, sangle), plus de licol.
  const names = lod
    ? cfg.saddle
      ? ['pad', 'saddle', 'girth']
      : []
    : cfg.saddle
      ? [...SETS.saddled, cfg.mounted ? 'reinsRidden' : 'reinsNeck', ...(cfg.boots ? SETS.boots : [])]
      : SETS.halter;
  let n = 0;
  for (const k of names) n += T.ranges[k][1];
  const out = new Uint16Array(n);
  let o = 0;
  for (const k of names) {
    const [s, c] = T.ranges[k];
    out.set(T.indices.subarray(s, s + c), o);
    o += c;
  }
  a = new THREE.BufferAttribute(out, 1);
  cache.set(key, a);
  return a;
}
