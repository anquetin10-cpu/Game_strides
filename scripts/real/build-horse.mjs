// Prototype « rendu réaliste » : prépare le cheval réaliste (public/real/horse.glb) à partir du modèle « Horse » de
// Henry S (henry_7, Sketchfab), CC BY 4.0, dans la version redistribuée par le projet warbell (commit figé) :
// corps de 12 600 triangles, crins en mèches, sabots ferrés, selle et filet, squelette de 99 os (paupières, oreilles,
// lèvres, crinière, queue), textures photographiques 2K.
//
// Étapes :
// - animations d'origine retirées (le jeu anime le cheval avec son propre squelette, recopié sur celui-ci) ;
// - robe rendue neutre : la robe pie d'origine est remplacée par le seul détail du poil (clair/sombre autour de 1),
//   la couleur de chaque cheval (bai, alezan, gris, noir) est appliquée par le jeu ; bout du nez, œil et intérieur
//   des naseaux gardent leurs couleurs (canal alpha = part de robe) ;
// - zones de la robe par sommet (attribut _COAT : hauteur sur les membres, bout du nez, liste, membre) pour les
//   extrémités noires, les balzanes et la liste ;
// - textures en WebP (2K pour le corps, 1K pour les crins et la sellerie), maillages compressés (meshopt).
//
// Usage : node scripts/real/build-horse.mjs
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, meshopt, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = join(ROOT, 'node_modules/.cache/real-src');
const OUT = join(ROOT, 'public/real');
const SRC = 'https://raw.githubusercontent.com/miskibin/warbell/1c73afb4a5fd03744d3bf62483dae45a7bd7f0da/assets/animals/horse.glb';

async function fetchSrc() {
  const p = join(CACHE, 'warbell_horse.glb');
  if (existsSync(p)) return p;
  mkdirSync(CACHE, { recursive: true });
  const r = await fetch(SRC);
  if (!r.ok) throw new Error(`horse.glb: ${r.status}`);
  writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  return p;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Zones de la robe par sommet (positions de liaison, en mètres : y vers le haut, z vers l'avant, x vers la gauche).
function coatZones(body, cornea) {
  const P = body.getAttribute('POSITION').getArray();
  const N = body.getAttribute('NORMAL').getArray();
  const n = P.length / 3;
  // Yeux (centres des cornées gauche et droite) et bout du nez (sommet le plus en avant).
  const C = cornea.getAttribute('POSITION').getArray();
  let mx = 0;
  for (let i = 0; i < C.length; i += 3) mx += C[i];
  mx /= C.length / 3;
  const eye = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < C.length; i += 3) {
    const e = eye[C[i] > mx ? 0 : 1];
    e[0] += C[i]; e[1] += C[i + 1]; e[2] += C[i + 2]; e[3]++;
  }
  const [EL, ER] = eye.map((e) => [e[0] / e[3], e[1] / e[3], e[2] / e[3]]);
  let tip = 0;
  for (let i = 1; i < n; i++) if (P[i * 3 + 2] > P[tip * 3 + 2]) tip = i;
  const T = [P[tip * 3], P[tip * 3 + 1], P[tip * 3 + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const mid = [(EL[0] + ER[0]) / 2, (EL[1] + ER[1]) / 2, (EL[2] + ER[2]) / 2];
  const lat = norm(sub(EL, ER));
  const fwdRaw = sub(T, mid);
  const len = Math.hypot(...fwdRaw);
  const fwd = norm(fwdRaw.map((v, k) => v - dot(fwdRaw, lat) * lat[k]));
  const up = cross(fwd, lat); // dos du chanfrein
  // Membres : sous 0,75 m, avant / arrière selon z, gauche / droite autour de la médiane de chaque paire.
  const legOf = new Int8Array(n);
  const front = [], hind = [];
  for (let i = 0; i < n; i++) {
    if (P[i * 3 + 1] > 0.75) continue;
    (P[i * 3 + 2] > 1.0 ? front : hind).push(i);
  }
  for (const [list, base] of [[front, 0], [hind, 2]]) {
    const xs = list.map((i) => P[i * 3]).sort((a, b) => a - b);
    // Séparation au plus grand écart entre les deux membres de la paire.
    let gap = 0, cut = xs[0];
    for (let k = 1; k < xs.length; k++) if (xs[k] - xs[k - 1] > gap) { gap = xs[k] - xs[k - 1]; cut = (xs[k] + xs[k - 1]) / 2; }
    for (const i of list) legOf[i] = base + (P[i * 3] > cut ? 1 : 2); // 1 : gauche, 2 : droit (ordre AG, AD, PG, PD)
  }
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const leg = legOf[i];
    out[i * 4] = leg ? Math.min(1, p[1]) : 1;
    const d = sub(p, mid);
    const along = dot(d, fwd) / len; // 0 aux yeux, 1 au bout du nez
    const side = Math.abs(dot(d, lat));
    const nrm = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
    out[i * 4 + 1] = smooth(0.17, 0.08, Math.hypot(...sub(p, T))) * smooth(0.55, 0.75, along);
    const w = 0.05 - 0.025 * Math.min(1, Math.max(0, along));
    out[i * 4 + 2] = smooth(w + 0.012, w - 0.004, side) * smooth(-0.32, -0.2, along) * smooth(0.97, 0.86, along) * smooth(0.15, 0.4, dot(nrm, up));
    out[i * 4 + 3] = leg / 4; // 1 à 4 : AG, AD, PG, PD
  }
  return out;
}

// Robe neutre : détail du poil (luminance rapportée à la moyenne locale de sa propre zone de couleur), en gris
// autour de 0,5 (linéaire) ; alpha = part de robe (1) ou couleur d'origine conservée (0 : bout du nez rose, œil).
async function neutralCoat(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, n = W * H;
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  const lum = new Float32Array(n);
  const cls = new Uint8Array(n); // 0 : conservé, 1 : blanc, 2 : brun, 3 : gris sombre
  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const mxc = Math.max(r, g, b), mnc = Math.min(r, g, b);
    const sat = mxc > 0 ? (mxc - mnc) / mxc : 0;
    const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
    lum[i] = L;
    const pink = r > 0.55 && r - b > 0.12 && g < r - 0.1 && sat > 0.2 && b > 0.35;
    if (pink) cls[i] = 0;
    else if (sat < 0.2 && mxc > 0.5) cls[i] = 1;
    else if (sat >= 0.2) cls[i] = 2;
    else cls[i] = 3;
  }
  // Moyennes locales par zone (boîte de 2·R+1 px, image intégrale).
  const R = Math.round(W / 64);
  const local = (k) => {
    const s = new Float64Array((W + 1) * (H + 1)), c = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let rs = 0, rc = 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (cls[i] === k) { rs += lum[i]; rc++; }
        s[(y + 1) * (W + 1) + x + 1] = s[y * (W + 1) + x + 1] + rs;
        c[(y + 1) * (W + 1) + x + 1] = c[y * (W + 1) + x + 1] + rc;
      }
    }
    return (x, y) => {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const at = (A, xx, yy) => A[yy * (W + 1) + xx];
      const cnt = at(c, x1, y1) - at(c, x0, y1) - at(c, x1, y0) + at(c, x0, y0);
      if (cnt < 4) return 0;
      return (at(s, x1, y1) - at(s, x0, y1) - at(s, x1, y0) + at(s, x0, y0)) / cnt;
    };
  };
  const means = [null, local(1), local(2), local(3)];
  // Amplitude du détail ramenée à celle du poil brun (le blanc est plus contrasté).
  const gain = [0, 0.7, 1, 0.9];
  const d = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = cls[i];
    if (!k) continue;
    const m = means[k](x, y);
    d[i] = m > 0 ? 1 + (lum[i] / m - 1) * gain[k] : 1;
  }
  // Bords d'anciennes taches (pixels mixtes) : détail adouci vers 1.
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, k = cls[i];
    if (!k) continue;
    if (cls[i - 1] !== k || cls[i + 1] !== k || cls[i - W] !== k || cls[i + W] !== k) d[i] = 1 + (d[i] - 1) * 0.3;
  }
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    if (!cls[i]) {
      out[i * 4] = data[i * 4]; out[i * 4 + 1] = data[i * 4 + 1]; out[i * 4 + 2] = data[i * 4 + 2]; out[i * 4 + 3] = 0;
      continue;
    }
    const v = Math.round(toSrgb(Math.min(1, Math.max(0.15, d[i])) * 0.5) * 255);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(await fetchSrc());
const root = doc.getRoot();
for (const a of root.listAnimations()) a.dispose();
const meshNamed = (name) => root.listMeshes().find((m) => m.getName() === name);
const body = meshNamed('Stallion_Horse_0').listPrimitives()[0];
const cornea = meshNamed('Stallion_Cornea_0').listPrimitives()[0];
const zones = coatZones(body, cornea);
body.setAttribute('_COAT', doc.createAccessor('coat').setType('VEC4').setArray(zones).setBuffer(root.listBuffers()[0]));
const bodyMat = body.getMaterial();
const tex = bodyMat.getBaseColorTexture();
tex.setImage(await neutralCoat(tex.getImage())).setMimeType('image/png').setName('TX_Horse_Coat');
bodyMat.setName('Horse');
await doc.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, quality: 90, resize: [2048, 2048] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normal/, quality: 88, resize: [1024, 1024] }),
  reorder({ encoder: MeshoptEncoder }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
);
mkdirSync(OUT, { recursive: true });
const file = join(OUT, 'horse.glb');
await io.write(file, doc);
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
console.log(`horse: ${(readFileSync(file).length / 1e6).toFixed(2)} Mo, ${tris} triangles`);
for (const t of root.listTextures()) console.log(`  ${t.getName()} ${t.getMimeType()} ${t.getSize()?.join('×')} ${(t.getImage().length / 1e3).toFixed(0)} Ko`);
