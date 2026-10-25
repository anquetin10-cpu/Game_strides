// Herbe, fleurs des prés et blé autour de la caméra, entièrement sur le GPU : un motif de touffes répété
// (repliement torique) suit la caméra sans aucune mise à jour CPU. Hauteur du sol lue dans une texture,
// carte de végétation (prairie haute, pelouse rase, fleurs, blé sur pied ou chaume) issue des parcelles.
import * as THREE from 'three';
import { mulberry32, clamp } from '../core/math.js';
import { WORLD, ZONES, ROADS, PATHS, XC_PATH, FORESTS, shoreZ, forestDensity } from './layout.js';
import { HOME, POLE } from './sites.js';
import { getFields } from './fields.js';
import { WIND } from './vegetation.js';
import { addCloudShadows } from './sky.js';
import { LEAF, leafCell, leafAtlas } from './vegTextures.js';

const MASK = 512;

// Masque « herbe » déduit de la texture du sol (vert dominant).
export function buildGrassMask(canvas) {
  const c = document.createElement('canvas');
  c.width = c.height = MASK;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, MASK, MASK);
  const d = ctx.getImageData(0, 0, MASK, MASK).data;
  const m = new Uint8Array(MASK * MASK);
  for (let i = 0; i < MASK * MASK; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    m[i] = g > r * 1.08 && g > b * 1.2 ? 1 : 0;
  }
  return m;
}

// Retire l'herbe sous les bâtiments (granges ouvertes, écuries).
export function clearGrassUnder(mask, boxes) {
  const S = MASK / WORLD.size;
  for (const b of boxes) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const r = Math.hypot(b.w, b.d) / 2 + 1;
    for (let j = Math.floor((b.z - r + WORLD.half) * S); j <= Math.ceil((b.z + r + WORLD.half) * S); j++) {
      for (let i = Math.floor((b.x - r + WORLD.half) * S); i <= Math.ceil((b.x + r + WORLD.half) * S); i++) {
        if (i < 0 || j < 0 || i >= MASK || j >= MASK) continue;
        const x = (i + 0.5) / S - WORLD.half - b.x, z = (j + 0.5) / S - WORLD.half - b.z;
        const lx = x * c - z * s, lz = x * s + z * c;
        if (Math.abs(lx) < b.w / 2 + 0.6 && Math.abs(lz) < b.d / 2 + 0.6) mask[j * MASK + i] = 0;
      }
    }
  }
}

// Carte de végétation RGBA (1024², 1,2 m par texel) : R présence d'herbe, G hauteur (pelouse → prairie), B fleurs,
// A sol cultivé ou forestier (1 blé sur pied, 0,5 chaume, 0,12-0,27 sous-bois à fougères). Routes, chemins et carrières exclus.
const VM = 1024;
function vegetationMap(mask) {
  const S = VM / WORLD.size;
  const px = (x) => (x + WORLD.half) * S;
  const layer = (base, draw) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = VM;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, VM, VM);
    const g = (v) => `rgb(${v},${v},${v})`;
    const poly = (pts, v) => {
      ctx.fillStyle = g(v);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), px(p[1])) : ctx.moveTo(px(p[0]), px(p[1]))));
      ctx.closePath();
      ctx.fill();
    };
    const line = (pts, w, v) => {
      ctx.strokeStyle = g(v);
      ctx.lineWidth = w * S;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), px(p[1])) : ctx.moveTo(px(p[0]), px(p[1]))));
      ctx.stroke();
    };
    const rect = (r, v, m = 0) => {
      ctx.fillStyle = g(v);
      ctx.fillRect(px(r.x - r.w / 2 - m), px(r.z - r.d / 2 - m), (r.w + 2 * m) * S, (r.d + 2 * m) * S);
    };
    draw({ poly, line, rect });
    return ctx.getImageData(0, 0, VM, VM).data;
  };
  const { fields, hedges } = getFields();
  const pasture = (f) => !f.reserved && (f.type === 'grass' || f.type === 'lightgrass');
  const zr = (z) => ({ x: z.x, z: z.z, w: z.hw * 2, d: z.hd * 2 });
  // Exclusions nettes : chaussées, chemins, piste de cross, carrières.
  const X = layer(255, ({ line, rect }) => {
    for (const r of ROADS) line(r.pts, r.w + 1.6, 0);
    for (const p of PATHS) line(p, 3.6, 0);
    line(XC_PATH, 5.2, 0);
    for (const a of [HOME.arena, POLE.arena, POLE.warmup]) rect(a, 0, 0.6);
  });
  // Hauteur : prairies de fauche et pâtures hautes, vergers, pelouses rases dans les sites et le long des routes.
  const G = layer(90, ({ poly, line, rect }) => {
    for (const f of fields) poly(f.poly, pasture(f) ? 215 : f.type === 'orchard' ? 175 : 110);
    for (const h of hedges) line([h.a, h.b], 7, 235);
    for (const r of ROADS) line(r.pts, r.w + 14, 140);
    for (const r of ROADS) line(r.pts, r.w + 5, 70);
    for (const p of PATHS) line(p, 6, 70);
    line(XC_PATH, 10, 60);
    for (const z of ZONES) rect(zr(z), 38);
  });
  // Fleurs : bords de haies et de routes, prairies (en taches), quelques pâquerettes sur les pelouses.
  const B = layer(14, ({ poly, line, rect }) => {
    for (const f of fields) poly(f.poly, pasture(f) ? 80 : f.type === 'orchard' ? 70 : 24);
    for (const r of ROADS) line(r.pts, r.w + 14, 140);
    for (const h of hedges) line([h.a, h.b], 6, 185);
    for (const z of ZONES) rect(zr(z), 16);
  });
  const A = layer(0, ({ poly }) => {
    for (const f of fields) if (!f.reserved && f.type === 'wheat') poly(f.poly, f.harvested ? 128 : 255);
  });
  // Sous-bois (densité de forêt) sur une grille plus grossière.
  const FG = 256, fstep = WORLD.size / FG;
  const forest = new Float32Array(FG * FG);
  for (let j = 0; j < FG; j++) {
    for (let i = 0; i < FG; i++) {
      const x = -WORLD.half + (i + 0.5) * fstep, z = -WORLD.half + (j + 0.5) * fstep;
      forest[j * FG + i] = z - shoreZ(x) > 60 && FORESTS.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * 1.15) ? forestDensity(x, z) : 0;
    }
  }
  const out = new Uint8Array(VM * VM * 4);
  const r = MASK / VM;
  for (let j = 0; j < VM; j++) {
    const z = (j + 0.5) / S - WORLD.half;
    // Masque couleur (512²) rééchantillonné bilinéairement.
    const fy = clamp((j + 0.5) * r - 0.5, 0, MASK - 1.001), j0 = Math.floor(fy), ty = fy - j0;
    for (let i = 0; i < VM; i++) {
      const k = j * VM + i;
      const x = (i + 0.5) / S - WORLD.half;
      const fx = clamp((i + 0.5) * r - 0.5, 0, MASK - 1.001), i0 = Math.floor(fx), tx = fx - i0;
      const a = mask[j0 * MASK + i0], b = mask[j0 * MASK + i0 + 1], c = mask[(j0 + 1) * MASK + i0], d = mask[(j0 + 1) * MASK + i0 + 1];
      let m = (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * (X[k * 4] / 255);
      let tall = G[k * 4] / 255;
      let fl = B[k * 4] / 255;
      const fd = forest[Math.min(FG - 1, Math.floor((j / VM) * FG)) * FG + Math.min(FG - 1, Math.floor((i / VM) * FG))];
      let crop = A[k * 4];
      if (fd > 0.3) {
        // Sous-bois : herbe clairsemée, sans fleurs, fougères.
        m *= 1 - fd * 0.75;
        tall = 0.35;
        fl = 0;
        crop = 16 + fd * 52;
      }
      if (z - shoreZ(x) < 125) tall = Math.max(tall, 0.62);
      out[k * 4] = m * 255;
      out[k * 4 + 1] = tall * 255;
      out[k * 4 + 2] = fl * 255;
      out[k * 4 + 3] = crop * (X[k * 4] / 255);
    }
  }
  const tex = new THREE.DataTexture(out, VM, VM, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// Fleurs des prés : achillée / carotte sauvage, marguerite, centaurée, trèfle, bouton d'or, coquelicot, bleuet ; case 7 = tige.
function flowerTexture() {
  const C = 64;
  const cv = document.createElement('canvas');
  cv.width = C * 8;
  cv.height = C;
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(17);
  const petals = (cx, cy, n, len, wid, color, jitter = 0) => {
    ctx.fillStyle = color;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (rnd() - 0.5) * jitter;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5, len * 0.5, wid, a, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const dot = (x, y, r, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // 0 : ombelle blanche (achillée, carotte sauvage).
  for (let k = 0; k < 70; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 24;
    dot(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 2.2 + rnd() * 1.5, rnd() < 0.15 ? '#d8d2c0' : '#f1eee4');
  }
  // 1 : marguerite.
  petals(C + 32, 32, 18, 27, 3.6, '#f4f2ea', 0.15);
  dot(C + 32, 32, 7, '#e0a815');
  dot(C + 31, 31, 4, '#efc23a');
  // 2 : centaurée noire (pompon pourpre).
  for (let k = 0; k < 60; k++) {
    const a = rnd() * Math.PI * 2, r = 6 + rnd() * 18;
    ctx.strokeStyle = rnd() < 0.5 ? '#8a3f8f' : '#a65aa8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(C * 2 + 32 + Math.cos(a) * 5, 32 + Math.sin(a) * 5);
    ctx.lineTo(C * 2 + 32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    ctx.stroke();
  }
  dot(C * 2 + 32, 32, 7, '#4a3020');
  // 3 : trèfle des prés.
  for (let k = 0; k < 40; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 18;
    dot(C * 3 + 32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 4 + rnd() * 2, rnd() < 0.5 ? '#c45a8c' : '#d97aa6');
  }
  // 4 : bouton d'or.
  petals(C * 4 + 32, 32, 5, 26, 9, '#e8b512');
  dot(C * 4 + 32, 32, 5, '#b98a0a');
  // 5 : coquelicot.
  petals(C * 5 + 32, 32, 4, 30, 15, '#c8180e', 0.3);
  petals(C * 5 + 32, 32, 4, 22, 11, '#d92a18', 0.3);
  dot(C * 5 + 32, 32, 5, '#1b1410');
  // 6 : épi de graminée (houlque, dactyle) : axe et épillets beige rosé.
  ctx.strokeStyle = '#8a7a52';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(C * 6 + 32, 64);
  ctx.quadraticCurveTo(C * 6 + 30, 34, C * 6 + 34, 2);
  ctx.stroke();
  for (let k = 0; k < 34; k++) {
    const y = 4 + rnd() * 50, side = rnd() < 0.5 ? -1 : 1, w = (1 - y / 64) * 4 + 3;
    ctx.fillStyle = ['#b9a27a', '#a88c74', '#cdbd92', '#9c7f72'][Math.floor(rnd() * 4)];
    ctx.beginPath();
    ctx.ellipse(C * 6 + 32 + side * w * (0.5 + rnd()), y, 2.2, 4.2, side * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // 7 : tige (opaque).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(C * 7, 0, C, C);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------- Géométries des touffes ----------
// position : x = côté (-1 / 1, 0 pointe), y = t le long du brin ; aBlade : angle, rayon, hauteur, largeur.
function clumpGeometry(blades, segs, seed) {
  const rnd = mulberry32(seed);
  const pos = [], bl = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()), hk = 0.55 + rnd() * 0.6, wk = 0.75 + rnd() * 0.5;
    const base = pos.length / 3;
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      pos.push(-1, t, b, 1, t, b);
      bl.push(a, r, hk, wk, a, r, hk, wk);
    }
    pos.push(0, 1, b);
    bl.push(a, r, hk, wk);
    for (let s = 0; s < segs - 1; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
    const i = base + (segs - 1) * 2;
    idx.push(i, i + 1, i + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  g.setIndex(idx);
  return g;
}

// Fleur : tige (brin fin) + corolle (deux quads croisés presque horizontaux). position.z = 0 tige, 1 corolle.
function flowerGeometry(n, seed) {
  const rnd = mulberry32(seed);
  const pos = [], bl = [], idx = [];
  for (let b = 0; b < n; b++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()), hk = 0.6 + rnd() * 0.6, wk = rnd();
    let base = pos.length / 3;
    pos.push(-1, 0, 0, 1, 0, 0, 0, 1, 0);
    bl.push(a, r, hk, wk, a, r, hk, wk, a, r, hk, wk);
    idx.push(base, base + 1, base + 2);
    for (const rot of [0, Math.PI / 2]) {
      base = pos.length / 3;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(sx, sy, 1 + rot);
        bl.push(a, r, hk, wk);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  // Coordonnées de texture calculées dans le shader (attribut factice requis par le matériau).
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  return g;
}

// Blé : deux cartes croisées texturées (épis et tiges dorés).
function wheatGeometry() {
  const pos = [], bl = [], idx = [], uv = [];
  for (const a of [0, Math.PI / 2, Math.PI / 4]) {
    const base = pos.length / 3;
    for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      pos.push(sx, sy, 0);
      bl.push(a, 0, 1, 1);
      uv.push((sx + 1) / 2, sy);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Fougère : quatre frondes en éventail (cartes à trois rangées de sommets pour s'arquer).
function fernGeometry() {
  const pos = [], bl = [], idx = [], uv = [];
  for (let c = 0; c < 4; c++) {
    const a = (c / 4) * Math.PI * 2 + (c % 2) * 0.4;
    const base = pos.length / 3;
    for (const t of [0, 0.5, 1]) {
      for (const sx of [-1, 1]) {
        pos.push(sx, t, 0);
        bl.push(a, 0, 1, 1);
        uv.push((sx + 1) / 2, t);
      }
    }
    for (let r = 0; r < 2; r++) {
      const i = base + r * 2;
      idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function wheatTexture() {
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(61);
  ctx.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const x = 6 + rnd() * (W - 12), top = H * (0.06 + rnd() * 0.22), lean = (rnd() - 0.5) * 18;
    const l = 0.52 + rnd() * 0.14;
    ctx.strokeStyle = `hsl(${42 + rnd() * 8},${48 + rnd() * 14}%,${(l - 0.08) * 100}%)`;
    ctx.lineWidth = 1.6 + rnd() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.quadraticCurveTo(x + lean * 0.3, (H + top) / 2, x + lean, top + 22);
    ctx.stroke();
    // Épi : grains en chevrons, barbes.
    const ex = x + lean, ey = top;
    ctx.fillStyle = `hsl(${40 + rnd() * 8},${50 + rnd() * 12}%,${l * 100}%)`;
    for (let k = 0; k < 7; k++) {
      const yy = ey + k * 3.2;
      ctx.beginPath();
      ctx.ellipse(ex - 1.6, yy, 1.8, 2.6, -0.5, 0, Math.PI * 2);
      ctx.ellipse(ex + 1.6, yy, 1.8, 2.6, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = `hsla(45,45%,${(l + 0.1) * 100}%,0.7)`;
    ctx.lineWidth = 0.6;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(ex, ey + k * 5);
      ctx.lineTo(ex + (rnd() - 0.5) * 10, ey - 8 + k * 5);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------- Shader ----------
const GRASS_VERT = /* glsl */ `
#include <common>
attribute vec4 aBlade;
attribute vec2 aInst;
uniform float uTime;
uniform vec4 uWind;
uniform float uPatch;
uniform float uRadius;
uniform float uFadeIn;
uniform vec4 uShape; // hauteur pelouse, hauteur prairie, largeur, rayon de touffe
uniform sampler2D uHeight;
uniform sampler2D uVegMap;
uniform sampler2D uGround;
uniform vec3 uTerrain; // demi-taille, taille d'une maille, nombre de mailles
uniform vec4 uCell; // rectangle UV (fougère dans l'atlas de feuillage)
varying vec3 vGrassCol;
varying float vGrassT;
float gHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float gNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gHash( i ), gHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( gHash( i + vec2( 0.0, 1.0 ) ), gHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
// Même interpolation que Terrain.getHeight (deux triangles par maille).
float groundH( vec2 p ) {
  vec2 f = clamp( ( p + uTerrain.x ) / uTerrain.y, vec2( 0.0 ), vec2( uTerrain.z - 0.001 ) );
  ivec2 i = ivec2( floor( f ) );
  vec2 w = f - vec2( i );
  float ha = texelFetch( uHeight, i, 0 ).r;
  float hb = texelFetch( uHeight, i + ivec2( 1, 0 ), 0 ).r;
  float hc = texelFetch( uHeight, i + ivec2( 0, 1 ), 0 ).r;
  float hd = texelFetch( uHeight, i + ivec2( 1, 1 ), 0 ).r;
  if ( w.x + w.y <= 1.0 ) return ha + ( hb - ha ) * w.x + ( hc - ha ) * w.y;
  return hd + ( hc - hd ) * ( 1.0 - w.x ) + ( hb - hd ) * ( 1.0 - w.y );
}
`;

const GRASS_MAIN = /* glsl */ `
vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );
vec3 grassPos = vec3( 0.0, -1e4, 0.0 );
vGrassCol = vec3( 0.0 );
vGrassT = clamp( position.y, 0.0, 1.0 );
{
  // Position de la touffe : copie du motif la plus proche du centre de la fenêtre (fixe dans le monde).
  // Fenêtre avancée dans la direction du regard : elle couvre tout le champ visible avec moins d'instances.
  vec2 cam = cameraPosition.xz;
  vec3 fwd = - vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );
  vec2 ctr = cam + fwd.xz * uRadius * 0.45;
  vec2 wp = aInst + uPatch * floor( ( ctr - aInst ) / uPatch + 0.5 );
  float dist = length( wp - cam );
  vec4 cc = projectionMatrix * viewMatrix * vec4( wp.x, cameraPosition.y - 1.2, wp.y, 1.0 );
  bool vis = dist < uRadius && cc.w > -3.0 && abs( cc.x ) < cc.w * 1.08 + 3.0;
  if ( vis ) {
    float h1 = gHash( wp * 0.7311 + 17.3 ), h2 = gHash( wp * 1.37 + 3.1 ), h3 = gHash( wp * 2.11 + 9.7 );
    vec2 muv = ( wp + uTerrain.x ) / ( 2.0 * uTerrain.x );
    vec4 veg = textureLod( uVegMap, muv, 0.0 );
    float fade = ( 1.0 - smoothstep( uRadius * 0.6, uRadius, dist ) ) * ( uFadeIn > 0.0 ? smoothstep( uFadeIn * 0.6, uFadeIn, dist ) : 1.0 );
    #if defined( GRASS_WHEAT )
      float presence = step( 0.75, veg.a );
    #elif defined( GRASS_FERN )
      float presence = smoothstep( 0.1, 0.2, veg.a ) * ( 1.0 - step( 0.3, veg.a ) ) * smoothstep( 0.25, 0.6, gNoise( wp * 0.07 + 9.0 ) + 0.2 );
    #elif defined( GRASS_FLOWER )
      // Chaque tige : fleur (taches, bords de haies et de routes) ou épi de graminée (prairies hautes).
      float sel = gHash( wp * 3.7 + aBlade.w * 11.0 );
      float seed = step( sel, 0.5 );
      float pf = veg.r * veg.b * smoothstep( 0.35, 0.75, gNoise( wp * 0.09 + 4.0 ) + veg.b * 0.4 );
      float ps = veg.r * smoothstep( 0.45, 0.85, veg.g ) * 0.85;
      float presence = mix( pf, ps, seed );
      h1 = gHash( wp * 5.1 + aBlade.w * 7.0 );
    #else
      float stubble = step( 0.3, veg.a ) * ( 1.0 - step( 0.75, veg.a ) );
      float presence = max( veg.r, stubble );
    #endif
    // Seuil strict : le hachage (float32) vaut parfois exactement 0, ce qui garderait des touffes hors des zones prévues.
    float keep = step( h1 + 0.004, presence );
    #if defined( GRASS_WHEAT )
      float H = ( 0.82 + 0.2 * h2 ) * fade * keep;
    #elif defined( GRASS_FERN )
      float H = ( 0.5 + 0.65 * h2 ) * fade * keep;
    #elif defined( GRASS_FLOWER )
      float H = mix( uShape.x, uShape.y, veg.g ) * ( 0.75 + 0.5 * h2 ) * mix( 1.0, 1.15, seed ) * fade * keep;
    #else
      // Hauteur : prairie haute en touffes irrégulières, pelouse rase, chaume court.
      float tall = veg.g * ( 0.7 + 0.6 * gNoise( wp * 0.21 ) );
      float H = mix( uShape.x, uShape.y, clamp( tall, 0.0, 1.2 ) ) * ( 0.65 + 0.7 * h2 ) * fade * keep;
      H = mix( H, 0.12 * fade * ( 0.7 + 0.6 * h2 ), stubble );
    #endif
    if ( H > 0.012 ) {
      float gy = groundH( wp );
      // Brin : orientation, position dans la touffe, courbure, vent.
      float ang = aBlade.x + h3 * 6.2831;
      vec2 bd = vec2( cos( ang ), sin( ang ) );
      vec2 bp = wp + bd * aBlade.y * uShape.w;
      float t = position.y;
      float bh = H * aBlade.z;
      vec2 across = vec2( -bd.y, bd.x );
      // Vent : rafales qui balaient le pré + frémissement.
      float ph = dot( bp, uWind.xy ) * 0.18 - uTime * 1.7;
      float gust = 0.5 + 0.5 * sin( ph ) * sin( ph * 0.43 + 1.7 );
      vec2 wind = uWind.xy * uWind.z * ( 0.12 + 0.5 * gust ) + vec2( sin( uTime * 3.3 + bp.x * 2.3 ), cos( uTime * 2.9 + bp.y * 2.1 ) ) * 0.07;
      #if defined( GRASS_WHEAT )
        vec2 dirA = vec2( cos( aBlade.x + h3 * 3.14 ), sin( aBlade.x + h3 * 3.14 ) );
        vec2 bend = wind * 0.35 * t * t;
        grassPos = vec3( wp.x + dirA.x * position.x * 0.62 + bend.x, gy + bh * t, wp.y + dirA.y * position.x * 0.62 + bend.y );
        objectNormal = normalize( vec3( bend.x * 0.5, 1.0, bend.y * 0.5 ) );
        vGrassCol = vec3( 0.85 + 0.2 * h2, 0.82 + 0.18 * h2, 0.75 + 0.15 * h1 ) * mix( 0.55, 1.0, t );
      #elif defined( GRASS_FERN )
        // Fronde de fougère aigle : carte en éventail, arquée vers l'extérieur, qui ondule au vent.
        float fa = aBlade.x + h3 * 6.2831;
        vec2 fdir = vec2( cos( fa ), sin( fa ) );
        vec3 fup = normalize( vec3( fdir.x * 0.6, 1.0, fdir.y * 0.6 ) );
        vec3 fright = vec3( -fdir.y, 0.0, fdir.x );
        vec2 sway = wind * 0.3 * t * t;
        grassPos = vec3( wp.x, gy - 0.05, wp.y ) + fright * position.x * bh * 0.5 + fup * t * bh + vec3( fdir.x * 0.3 * t * t * bh + sway.x, -0.22 * t * t * bh, fdir.y * 0.3 * t * t * bh + sway.y );
        objectNormal = normalize( vec3( fdir.x * 0.35, 1.0, fdir.y * 0.35 ) );
        #ifdef USE_MAP
          vMapUv = mix( uCell.xy, uCell.zw, vec2( position.x * 0.5 + 0.5, t ) );
        #endif
        // Fin d'été : certaines frondes jaunissent.
        float yel = smoothstep( 0.62, 0.95, h1 );
        vGrassCol = mix( vec3( 1.0 ), vec3( 1.3, 1.02, 0.5 ), yel ) * mix( 0.45, 1.0, t ) * ( 0.85 + 0.25 * h2 );
      #elif defined( GRASS_FLOWER )
        vec2 bend = bd * 0.12 + wind * 0.5;
        float stem = step( position.z, 0.5 );
        vGrassT = mix( 1.0, vGrassT, stem );
        vec3 top = vec3( bp.x + bend.x * bh, gy + bh, bp.y + bend.y * bh );
        vec3 sp = vec3( bp.x + across.x * position.x * 0.006 + bend.x * bh * t * t, gy + bh * t, bp.y + across.y * position.x * 0.006 + bend.y * bh * t * t );
        // Espèce (case de texture) : ombelle, marguerite, centaurée, trèfle, bouton d'or, coquelicot ; 6 = épi de graminée.
        float s2 = fract( sel * 7.31 );
        float spc = seed > 0.5 ? 6.0 : s2 < 0.26 ? 0.0 : s2 < 0.42 ? 1.0 : s2 < 0.6 ? 2.0 : s2 < 0.76 ? 3.0 : s2 < 0.9 ? 4.0 : 5.0;
        float sz = spc < 0.5 ? 1.2 : spc < 1.5 ? 0.95 : spc > 3.5 && spc < 4.5 ? 0.6 : spc > 4.5 && spc < 5.5 ? 1.15 : 0.8;
        // Corolle : quads croisés, presque à plat ; épi : cartes verticales en haut de la tige.
        float rad = ( 0.02 + 0.012 * aBlade.w ) * sz;
        vec2 ca = position.z > 1.5 ? vec2( -bd.y, bd.x ) : bd;
        vec3 fp = top + vec3( ca.x * position.x * rad, position.y * rad * 0.35 + 0.005, ca.y * position.x * rad ) + vec3( ca.y, 0.0, -ca.x ) * position.y * rad * 0.9;
        vec3 ep = top + vec3( ca.x * position.x * 0.035, ( position.y + 1.0 ) * 0.075 - 0.02, ca.y * position.x * 0.035 ) + vec3( bend.x, 0.0, bend.y ) * ( position.y + 1.0 ) * 0.05;
        fp = mix( fp, ep, seed );
        grassPos = mix( fp, sp, stem );
        objectNormal = mix( vec3( 0.0, 1.0, 0.0 ), normalize( vec3( across.x * 0.3, 1.0, across.y * 0.3 ) ), stem );
        #ifdef USE_MAP
          vMapUv = stem > 0.5 ? vec2( 7.5 / 8.0, 0.5 ) : vec2( ( spc + 0.04 + ( position.x * 0.5 + 0.5 ) * 0.92 ) / 8.0, position.y * 0.46 + 0.5 );
        #endif
        vec3 sc = textureLod( uGround, vec2( muv.x, 1.0 - muv.y ), 3.0 ).rgb * 0.8;
        vGrassCol = mix( vec3( 0.92 + 0.12 * h2 ), sc * mix( 0.6, 1.0, t ), stem );
      #else
        // Courbure : penché dans sa direction, plus le vent ; le brin garde sa longueur.
        vec2 bend = ( bd * ( 0.18 + 0.4 * h2 * aBlade.w ) + wind ) * t * t;
        float bl = length( bend );
        float w = uShape.z * aBlade.w * ( 1.0 - t * 0.82 ) * ( 0.75 + 0.5 * h1 );
        grassPos = vec3( bp.x + across.x * position.x * w + bend.x * bh, gy + bh * t * ( 1.0 - 0.3 * bl * bl ), bp.y + across.y * position.x * w + bend.y * bh );
        // Normale : verticale, légèrement inclinée vers la face du brin (jamais vers le bas).
        objectNormal = normalize( vec3( across.x * position.x * 0.25 - bend.x * 0.4, 1.0, across.y * position.x * 0.25 - bend.y * 0.4 ) );
        // Couleur : celle du sol à la base, plus claire et plus sèche vers la pointe, taches jaunies de fin d'été.
        vec3 ground = textureLod( uGround, vec2( muv.x, 1.0 - muv.y ), 3.0 ).rgb;
        float dry = smoothstep( 0.55, 0.9, gNoise( wp * 0.13 + 2.0 ) ) * 0.6 + h3 * 0.25;
        vec3 tip = mix( ground * vec3( 1.12, 1.18, 0.95 ), vec3( 0.36, 0.3, 0.11 ), dry * ( 0.3 + 0.7 * veg.g ) );
        tip = mix( tip, vec3( 0.42, 0.34, 0.16 ), stubble );
        vGrassCol = mix( ground * 0.62, tip, smoothstep( 0.0, 0.85, t ) );
        // Au loin, le brin se fond dans la couleur du sol.
        vGrassCol = mix( vGrassCol, ground, smoothstep( uRadius * 0.55, uRadius, dist ) );
      #endif
    }
  }
}
`;

function grassMaterial(defines, uniforms, map) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: defines.GRASS_WHEAT !== undefined || defines.GRASS_FERN !== undefined ? 0.85 : 0.68, metalness: 0, side: THREE.DoubleSide });
  if (map) {
    mat.map = map;
    mat.alphaTest = 0.5;
    mat.alphaToCoverage = true;
  }
  mat.defines = { ...defines };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.uniforms.uTime = WIND.uTime;
    sh.uniforms.uWind = WIND.uWind;
    sh.uniforms.uTrans = WIND.uTrans;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', GRASS_VERT)
      .replace('#include <beginnormal_vertex>', GRASS_MAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = grassPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTrans;\nvarying vec3 vGrassCol;\nvarying float vGrassT;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrassCol;')
      // Les cartes alpha (blé, fougères, fleurs) ne s'amincissent pas avec les mipmaps.
      .replace('#include <alphatest_fragment>', `#ifdef USE_MAP
{
  vec2 ts = vMapUv * ${map ? map.image.width : 256}.0;
  vec2 ddx = dFdx( ts ), ddy = dFdy( ts );
  diffuseColor.a *= 1.0 + max( 0.5 * log2( max( max( dot( ddx, ddx ), dot( ddy, ddy ) ), 1e-6 ) ), 0.0 ) * 0.3;
}
#endif
#include <alphatest_fragment>`)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <lights_fragment_end>', `#if NUM_DIR_LIGHTS > 0
{
  float fw = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 3.0 );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uTrans * ( 0.25 + fw * 0.9 ) * vGrassT;
}
#endif
#include <lights_fragment_end>`);
    addCloudShadows(sh);
  };
  mat.customProgramCacheKey = () => `grass-${Object.keys(defines).join('-')}`;
  return mat;
}

export class Grass {
  constructor(scene, terrain, mask, count = 2600, radius = 46) {
    this.terrain = terrain;
    this.mask = mask;
    this.radius = radius;
    this.count = count;
    // Données partagées : hauteurs du terrain, carte de végétation, couleur du sol.
    const n = terrain.n;
    const ht = new THREE.DataTexture(terrain.heights, n, n, THREE.RedFormat, THREE.FloatType);
    ht.magFilter = ht.minFilter = THREE.NearestFilter;
    ht.generateMipmaps = false;
    ht.needsUpdate = true;
    const ground = scene.getObjectByName('terrain')?.material?.map || null;
    const fallback = new THREE.DataTexture(new Uint8Array([88, 128, 60, 255]), 1, 1, THREE.RGBAFormat);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.needsUpdate = true;
    const shared = {
      uHeight: { value: ht },
      uVegMap: { value: vegetationMap(mask) },
      uGround: { value: ground || fallback },
      uTerrain: { value: new THREE.Vector3(terrain.half, terrain.cell, terrain.seg) },
    };
    // Densités (touffes par m²) à l'échelle du nombre demandé (3200 sur mobile, 4500 sur ordinateur).
    const k = Math.max(0.5, count / 4500);
    this.layers = [];
    // Herbe proche : touffes denses de brins fins courbés.
    this.addLayer(scene, clumpGeometry(10, 2, 3), 3.6 * k, 16.5, 0, [0.09, 0.62, 0.024, 0.24], {}, shared);
    // Herbe moyenne distance : touffes plus larges, moins nombreuses.
    this.addLayer(scene, clumpGeometry(8, 2, 5), 0.4 * k, Math.min(44, radius), 11, [0.1, 0.62, 0.05, 0.5], {}, shared);
    // Fleurs des prés et épis de graminées.
    this.addLayer(scene, flowerGeometry(3, 9), 1.62 * k, 19, 0, [0.22, 0.6, 0, 0.35], { GRASS_FLOWER: '' }, shared, flowerTexture());
    // Blé sur pied.
    this.addLayer(scene, wheatGeometry(), 1.24 * k, 27, 0, [0, 0, 0, 0], { GRASS_WHEAT: '' }, shared, wheatTexture());
    // Sous-bois : fougères aigles.
    this.addLayer(scene, fernGeometry(), 0.67 * k, 24, 0, [0, 0, 0, 0], { GRASS_FERN: '' }, { ...shared, uCell: { value: new THREE.Vector4(...leafCell(LEAF.fern)) } }, leafAtlas().texture);
    this.mesh = this.layers[0];
  }

  // Couche : motif carré de côté 1,7 × rayon répété à l'infini ; n touffes pour la densité demandée.
  addLayer(scene, geo, density, radius, fadeIn, shape, defines, shared, map = null) {
    const patch = radius * 1.7;
    // Répartition stratifiée (grille tremblée, carré complet) : pas de trous ni d'amas dans le motif répété.
    const side = Math.max(1, Math.round(Math.sqrt(density) * patch));
    const n = side * side;
    const rnd = mulberry32(n + patch * 7);
    const inst = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const gx = i % side, gz = Math.floor(i / side);
      inst[i * 2] = ((gx + rnd()) / side) * patch;
      inst[i * 2 + 1] = ((gz + rnd()) / side) * patch;
    }
    geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 2));
    geo.instanceCount = n;
    const uniforms = { ...shared, uPatch: { value: patch }, uRadius: { value: radius }, uFadeIn: { value: fadeIn }, uShape: { value: new THREE.Vector4(...shape) } };
    const mesh = new THREE.Mesh(geo, grassMaterial(defines, uniforms, map));
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'grass';
    scene.add(mesh);
    this.layers.push(mesh);
    return mesh;
  }

  isGrass(x, z) {
    const i = Math.floor(((x + WORLD.half) / WORLD.size) * MASK);
    const j = Math.floor(((z + WORLD.half) / WORLD.size) * MASK);
    if (i < 0 || j < 0 || i >= MASK || j >= MASK) return false;
    return this.mask[j * MASK + i] === 1;
  }

  // Tout est calculé sur le GPU à partir de la caméra ; rien à mettre à jour ici.
  update() {}
}
