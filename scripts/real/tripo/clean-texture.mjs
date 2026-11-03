// Nettoyage « 3D » des textures du cheval Tripo : suppression du tapis de selle peint sur le dos, des quartiers
// (rectangles bruns) sur les flancs et des petits points sombres ; métal ramené à 0.
// Principe : chaque texel de l'atlas reçoit sa position 3D et sa normale (rastérisation UV), les masques sont
// construits dans l'espace 3D (grilles de voxels), le remplissage combine un champ basse fréquence diffusé sur la
// surface (interpolation harmonique) et le grain du poil transplanté depuis des zones saines décalées en 3D.
// Indépendant de gltf-transform : entrées = tableaux typés du maillage + images encodées (JPEG/PNG).
// La géométrie n'est pas modifiée ici : la zone de relief des plaques (sommets) est renvoyée dans
// result.geometry.zoneRelief pour relief-plaques.mjs.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { rasterizeUV } from './uv-raster.mjs';

// Seuils en unités natives Tripo (+x = gauche du cheval, +y haut, +z avant ; 0,738 aux oreilles).
export const DEFAUTS = {
  voxelSeg: 0.003, // grille de segmentation des plaques
  voxelLF: 0.004, // grille du champ basse fréquence
  marge: 0.006, // dilatation du masque au-delà de la plaque détectée (liseré, coutures)
  fondu: 0.003, // demi-largeur du fondu du bord
  plaques: {
    tapis: {
      roi: [[-0.17, 0.17], [0.46, 0.76], [-0.30, 0.062]],
      graines: [[0, 0.569, -0.046]],
      fort: { rgMin: 1.28 }, faible: { rgMin: 1.25 },
      // bande de mesure de l'étendue en z (ligne du dos) puis découpe en z
      bandeZ: { axe: 0, min: -0.03, max: 0.03 }, tolZ: 0.008,
      decalages: [-0.18, -0.22, -0.26].flatMap((dz) => [-0.01, 0, 0.01].map((dx) => [dx, 0, dz])),
    },
    quartierG: {
      roi: [[0.045, 0.2], [0.28, 0.5], [-0.22, 0.05]],
      graines: [[0.116, 0.403, -0.064]],
      fort: { rgMin: 1.45, lMax: 110 }, faible: { rgMin: 1.40, lMax: 125 },
      bandeZ: { axe: 1, min: 0.39, max: 0.44 }, tolZ: 0.01,
      decalages: [-0.17, -0.20, -0.23].flatMap((dz) => [-0.01, 0, 0.01].map((dy) => [0, dy, dz])),
    },
    quartierD: {
      roi: [[-0.2, -0.045], [0.28, 0.5], [-0.22, 0.05]],
      graines: [[-0.116, 0.404, -0.064]],
      fort: { rgMin: 1.45, lMax: 110 }, faible: { rgMin: 1.40, lMax: 125 },
      bandeZ: { axe: 1, min: 0.39, max: 0.44 }, tolZ: 0.01,
      decalages: [-0.17, -0.20, -0.23].flatMap((dz) => [-0.01, 0, 0.01].map((dy) => [0, dy, dz])),
    },
  },
  // Mèche de crinière couchée sur le garrot, à l'avant du tapis : relief au-dessus de la ligne du dos (hauteur par
  // rapport aux côtés du dos à |x| ∈ cote). Gardée telle quelle (couleur et relief).
  // Mèche gardée : cœur (hauteur > coeur, partie à mèches nettes), fondu en distance 3D au cœur (`fondu`) et en hauteur
  // (`hFondu`) : la pointe effilée (sans mèches, teintée par le tapis) et le pied de la mèche passent au pelage.
  meche: { xMax: 0.03, yMin: 0.5, z: [-0.04, 0.08], cote: [0.016, 0.026], pas: 0.002, voxel: 0.001, coeur: 0.01, fondu: [0.0005, 0.004], hFondu: [0.002, 0.006] },
  // Triangles orphelins (sans texel propre) : relais des texels de marge dont la source est à plus de `seuil` en 3D
  // (texture 2048 ; proportionnel à la taille des texels ailleurs).
  relais: { seuil: 0.005 },
  // Zone de relief à effacer dans le maillage (relief-plaques.mjs) : plaque + marge, hors mèche et toupet.
  relief: { marge: 0.014, toupet: { zMin: 0.062, xMax: 0.04 } },
  // Grain transplanté : décalages candidats mélangés par un champ aléatoire (maille `cellule`, poids r^puissance) ;
  // bandes fine (flou rFin) et moyenne (flou rMoyen), en texels 2048 ; bornes en rapport (albédo) ; sources aberrantes
  // (rapport hors `rejet`) écartées ; amplitude calée sur un anneau de pelage sain de largeur `anneau`. Sources : texel
  // le plus proche exact (grille de pas `pasGrille`, jusqu'à `snap`), poids fondus à moins de `bord` texels (2048) d'un
  // bord d'îlot ; pas de source à moins de `ecartPlaque` d'une plaque ; sources à bande moyenne au-delà de `moyenMax`
  // (rapport) progressivement écartées.
  grain: { cellule: 0.02, puissance: 4, rFin: 2, rMoyen: 7, snap: 0.03, pasGrille: 0.003, bord: [1, 5], bornesFin: [0.86, 1.16], bornesMoyen: [0.9, 1.1], rejet: [0.84, 1.2], anneau: 0.02, gainBornes: [0.6, 1.6], moyenNormales: 0.5, ecartPlaque: 0.015, moyenMax: [1.06, 1.12] },
  // Contrôle après remplissage : taches sombres résiduelles dans les plaques (remises à la valeur sans grain).
  residus: { voxel: 0.006, ratio: 0.88, ecartMin: 10, tailleMax: 0.004, texelsMax: 80 },
  // Points sombres : luminance (albédo) ou rugosité nettement inférieure à la médiane du voisinage 3D.
  points: { voxel: 0.006, ratio: 0.62, ecartMin: 28, tailleMax: 0.005, texelsMax: 400 },
  rugosite: { voxel: 0.006, ratio: 0.72, ecartMin: 30, tailleMax: 0.006, texelsMax: 200 },
  // Zones où le sombre est naturel (yeux, naseaux, crins, sabots, fourreau) : exclues de la détection des points.
  exclusions: [
    { nom: 'tete', box: [[-1, 1], [0.40, 1], [0.28, 1]] },
    { nom: 'criniere', box: [[-0.05, 0.05], [0.50, 1], [-0.02, 1]] },
    { nom: 'queue', box: [[-0.05, 0.05], [0.0, 1], [-1, -0.40]] },
    { nom: 'sabots', box: [[-1, 1], [-1, 0.06], [-1, 1]] },
    { nom: 'fourreau', box: [[-0.045, 0.045], [0.22, 0.40], [-0.33, -0.19]] },
  ],
};

const report0 = (S) => `z ${S.bbox[0][2].toFixed(3)}…${S.bbox[1][2].toFixed(3)}, y ${S.bbox[0][1].toFixed(3)}…${S.bbox[1][1].toFixed(3)}, x ${S.bbox[0][0].toFixed(3)}…${S.bbox[1][0].toFixed(3)} (unités natives)`;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dansBox = (b, x, y, z) => x >= b[0][0] && x <= b[0][1] && y >= b[1][0] && y <= b[1][1] && z >= b[2][0] && z <= b[2][1];

// ---------- Grilles de voxels denses ----------
function grille(min, max, h) {
  const o = min.map((v) => v - h);
  const n = [0, 1, 2].map((d) => Math.max(1, Math.ceil((max[d] - min[d]) / h) + 3));
  return { h, o, nx: n[0], ny: n[1], nz: n[2], n: n[0] * n[1] * n[2] };
}
function cellule(G, x, y, z) {
  const i = Math.floor((x - G.o[0]) / G.h), j = Math.floor((y - G.o[1]) / G.h), k = Math.floor((z - G.o[2]) / G.h);
  if (i < 0 || j < 0 || k < 0 || i >= G.nx || j >= G.ny || k >= G.nz) return -1;
  return (i * G.ny + j) * G.nz + k;
}
const OFF26 = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) OFF26.push([a, b, c]);
function voisins(G, c, f) {
  const k = c % G.nz, j = ((c / G.nz) | 0) % G.ny, i = (c / (G.ny * G.nz)) | 0;
  for (const [a, b, d] of OFF26) {
    const ii = i + a, jj = j + b, kk = k + d;
    if (ii < 0 || jj < 0 || kk < 0 || ii >= G.nx || jj >= G.ny || kk >= G.nz) continue;
    f((ii * G.ny + jj) * G.nz + kk, a * a + b * b + d * d);
  }
}
// Interpolation trilinéaire d'un champ à C composantes défini sur les voxels occupés (poids renormalisés).
function trilin(G, occ, F, C, x, y, z, out) {
  const fx = (x - G.o[0]) / G.h - 0.5, fy = (y - G.o[1]) / G.h - 0.5, fz = (z - G.o[2]) / G.h - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
  const tx = fx - i0, ty = fy - j0, tz = fz - k0;
  let ws = 0;
  for (let c = 0; c < C; c++) out[c] = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let d = 0; d < 2; d++) {
    const i = i0 + a, j = j0 + b, k = k0 + d;
    if (i < 0 || j < 0 || k < 0 || i >= G.nx || j >= G.ny || k >= G.nz) continue;
    const cc = (i * G.ny + j) * G.nz + k;
    if (!occ[cc]) continue;
    const w = (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (d ? tz : 1 - tz) + 1e-6;
    ws += w;
    for (let c = 0; c < C; c++) out[c] += w * F[cc * C + c];
  }
  if (ws <= 0) return false;
  for (let c = 0; c < C; c++) out[c] /= ws;
  return true;
}

// ---------- Décodage ----------
async function decode(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, C: info.channels };
}

// ---------- Segmentation d'une plaque (tapis ou quartier) dans une grille de voxels ----------
function segmenterPlaque(R, img, cfg, P) {
  const { W, H } = R, N = W * H, h = P.voxelSeg;
  const roi = cfg.roi;
  const G = grille(roi.map((r) => r[0]), roi.map((r) => r[1]), h);
  const sum = new Float32Array(G.n * 3), cnt = new Uint32Array(G.n);
  for (let i = 0; i < N; i++) {
    if (R.tri[i] < 0) continue;
    const x = R.pos[i * 3], y = R.pos[i * 3 + 1], z = R.pos[i * 3 + 2];
    if (!dansBox(roi, x, y, z)) continue;
    const c = cellule(G, x, y, z); if (c < 0) continue;
    cnt[c]++; sum[c * 3] += img.data[i * img.C]; sum[c * 3 + 1] += img.data[i * img.C + 1]; sum[c * 3 + 2] += img.data[i * img.C + 2];
  }
  const ok = (c, s) => {
    if (!cnt[c]) return false;
    const r = sum[c * 3] / cnt[c], g = sum[c * 3 + 1] / cnt[c], b = sum[c * 3 + 2] / cnt[c];
    const rg = r / (g + 1), L = lum(r, g, b);
    return rg >= s.rgMin && (s.lMax === undefined || L <= s.lMax);
  };
  // Croissance par hystérésis depuis les graines.
  const m = new Uint8Array(G.n), pile = [];
  for (const s of cfg.graines) {
    for (let c = 0; c < G.n; c++) {
      if (!cnt[c] || m[c]) continue;
      const k = c % G.nz, j = ((c / G.nz) | 0) % G.ny, ii = (c / (G.ny * G.nz)) | 0;
      const x = G.o[0] + (ii + 0.5) * h, y = G.o[1] + (j + 0.5) * h, z = G.o[2] + (k + 0.5) * h;
      if (Math.hypot(x - s[0], y - s[1], z - s[2]) < 0.02 && ok(c, cfg.fort)) { m[c] = 1; pile.push(c); }
    }
  }
  while (pile.length) { const c = pile.pop(); voisins(G, c, (q) => { if (!m[q] && ok(q, cfg.faible)) { m[q] = 1; pile.push(q); } }); }
  const centre = (c) => { const k = c % G.nz, j = ((c / G.nz) | 0) % G.ny, ii = (c / (G.ny * G.nz)) | 0; return [G.o[0] + (ii + 0.5) * h, G.o[1] + (j + 0.5) * h, G.o[2] + (k + 0.5) * h]; };
  // Étendue en z mesurée sur une bande où les bords sont nets, puis découpe (évite les fuites vers ventre / garrot).
  let zMin = 1e9, zMax = -1e9;
  for (let c = 0; c < G.n; c++) if (m[c]) { const p = centre(c); const v = p[cfg.bandeZ.axe]; if (v >= cfg.bandeZ.min && v <= cfg.bandeZ.max) { zMin = Math.min(zMin, p[2]); zMax = Math.max(zMax, p[2]); } }
  if (zMin < zMax) for (let c = 0; c < G.n; c++) if (m[c]) { const z = centre(c)[2]; if (z < zMin - cfg.tolZ || z > zMax + cfg.tolZ) m[c] = 0; }
  // Fermeture morphologique (dilatation puis érosion sur les voxels occupés).
  const d1 = new Uint8Array(m);
  for (let c = 0; c < G.n; c++) if (m[c]) voisins(G, c, (q) => { if (cnt[q]) d1[q] = 1; });
  const e1 = new Uint8Array(d1);
  for (let c = 0; c < G.n; c++) if (d1[c] && !m[c]) { let bord = false; voisins(G, c, (q) => { if (cnt[q] && !d1[q]) bord = true; }); if (bord) e1[c] = 0; }
  // Trous : voxels occupés non masqués non reliés au bord de la ROI.
  const vu = new Uint8Array(G.n), file = [];
  for (let c = 0; c < G.n; c++) {
    if (!cnt[c] || e1[c]) continue;
    const k = c % G.nz, j = ((c / G.nz) | 0) % G.ny, ii = (c / (G.ny * G.nz)) | 0;
    const p = centre(c);
    const auBord = roi.some((r, d) => p[d] - r[0] < 2 * h || r[1] - p[d] < 2 * h) || ii <= 1 || j <= 1 || k <= 1;
    if (auBord) { vu[c] = 1; file.push(c); }
  }
  while (file.length) { const c = file.pop(); voisins(G, c, (q) => { if (cnt[q] && !e1[q] && !vu[q]) { vu[q] = 1; file.push(q); } }); }
  let trous = 0;
  for (let c = 0; c < G.n; c++) if (cnt[c] && !e1[c] && !vu[c]) { e1[c] = 1; trous++; }
  // Bilan : boîte englobante, aire approx., couleur médiane dedans / autour.
  let nb = 0; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let c = 0; c < G.n; c++) if (e1[c]) { nb++; const p = centre(c); for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], p[d]); mx[d] = Math.max(mx[d], p[d]); } }
  return { G, masque: e1, cnt, sum, zBande: [zMin, zMax], trous, voxels: nb, bbox: [mn, mx] };
}

// Champ de distance (chanfrein 3×3×3) au masque, sur la grille de segmentation.
function distanceMasque(S) {
  const { G, masque } = S, h = G.h;
  const D = new Float32Array(G.n).fill(1e9);
  for (let c = 0; c < G.n; c++) if (masque[c]) D[c] = 0;
  const w = [0, h, h * Math.SQRT2, h * Math.sqrt(3)];
  const passe = (sens) => {
    for (let t = 0; t < G.n; t++) {
      const c = sens > 0 ? t : G.n - 1 - t;
      const k = c % G.nz, j = ((c / G.nz) | 0) % G.ny, i = (c / (G.ny * G.nz)) | 0;
      let best = D[c];
      for (const [a, b, d] of OFF26) {
        // Moitié des voisins déjà visités dans ce sens.
        const lin = (a * G.ny + b) * G.nz + d;
        if (sens > 0 ? lin >= 0 : lin <= 0) continue;
        const ii = i + a, jj = j + b, kk = k + d;
        if (ii < 0 || jj < 0 || kk < 0 || ii >= G.nx || jj >= G.ny || kk >= G.nz) continue;
        const v = D[(ii * G.ny + jj) * G.nz + kk] + w[a * a + b * b + d * d];
        if (v < best) best = v;
      }
      D[c] = best;
    }
  };
  passe(1); passe(-1); passe(1); passe(-1);
  return D;
}
// Alpha d'un point 3D pour une plaque : 1 dans le masque et sa marge, fondu au-delà, nul hors ROI (bord doux).
function alphaPlaque(S, D, P, cfg, x, y, z) {
  const G = S.G;
  const fx = (x - G.o[0]) / G.h - 0.5, fy = (y - G.o[1]) / G.h - 0.5, fz = (z - G.o[2]) / G.h - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
  if (i0 < 0 || j0 < 0 || k0 < 0 || i0 + 1 >= G.nx || j0 + 1 >= G.ny || k0 + 1 >= G.nz) return 0;
  const tx = fx - i0, ty = fy - j0, tz = fz - k0;
  let d = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let e = 0; e < 2; e++) d += (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (e ? tz : 1 - tz) * D[((i0 + a) * G.ny + j0 + b) * G.nz + k0 + e];
  let al = 1 - smooth(P.marge - P.fondu, P.marge + P.fondu, d);
  if (al <= 0) return 0;
  const r = cfg.roi, f = 0.003;
  for (let k = 0; k < 3; k++) { const v = [x, y, z][k]; al *= smooth(r[k][0] - f, r[k][0] + f, v) * (1 - smooth(r[k][1] - f, r[k][1] + f, v)); }
  return al < 1 / 255 ? 0 : al; // sous le pas d'un masque 8 bits : inchangé
}

// ---------- Mèche de crinière sur le garrot ----------
// Profil de la ligne du dos de part et d'autre de l'épine (texels à |x| ∈ cote, dessus du corps) par tranche de z ; la
// hauteur d'un point au-dessus de ce profil distingue la mèche (≈ 1 cm de relief) de la crête naturelle du dos (2-3 mm).
function profilMeche(R, c) {
  const pos = R.pos, couvert = (v) => R.tri[v] >= 0;
  const nb = Math.ceil((c.z[1] - c.z[0]) / c.pas), g = new Float32Array(nb).fill(-1), d = new Float32Array(nb).fill(-1);
  for (let v = 0; v < pos.length / 3; v++) {
    if (!couvert(v)) continue;
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], ax = Math.abs(x);
    if (y < c.yMin || z < c.z[0] || z >= c.z[1] || ax < c.cote[0] || ax > c.cote[1]) continue;
    const k = Math.floor((z - c.z[0]) / c.pas), t = x > 0 ? g : d;
    if (y > t[k]) t[k] = y;
  }
  const prof = new Float32Array(nb);
  for (let k = 0; k < nb; k++) prof[k] = g[k] > 0 && d[k] > 0 ? (g[k] + d[k]) / 2 : Math.max(g[k], d[k]);
  for (let k = 0; k < nb; k++) if (prof[k] < 0) { let q = 1; while (q < nb && !(prof[k - q] > 0) && !(prof[k + q] > 0)) q++; prof[k] = prof[k - q] > 0 ? prof[k - q] : prof[k + q] > 0 ? prof[k + q] : 0; }
  const lisse = prof.map((v, k) => (prof[Math.max(0, k - 1)] + 2 * v + prof[Math.min(nb - 1, k + 1)]) / 4);
  const hauteur = (x, y, z) => {
    if (Math.abs(x) > c.xMax || z < c.z[0] || z >= c.z[1]) return -1;
    const f = (z - c.z[0]) / c.pas - 0.5, k = Math.max(0, Math.min(nb - 2, Math.floor(f))), t = Math.max(0, Math.min(1, f - k));
    return y - (lisse[k] * (1 - t) + lisse[k + 1] * t);
  };
  // Cœur de la mèche (texels à plus de `coeur` au-dessus du profil) et distance 3D à ce cœur (grille de `voxel`).
  const G = grille([-c.xMax, c.yMin, c.z[0]], [c.xMax, c.yMin + 0.16, c.z[1]], c.voxel), coeur = new Uint8Array(G.n);
  for (let v = 0; v < pos.length / 3; v++) {
    if (!couvert(v) || hauteur(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) <= c.coeur) continue;
    const q = cellule(G, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    if (q >= 0) coeur[q] = 1;
  }
  const S = { G, masque: coeur }, D = distanceMasque(S);
  // Part gardée (0..1) de la couleur d'origine en un point.
  const garde = (x, y, z) => {
    const h = hauteur(x, y, z);
    if (h <= c.hFondu[0]) return 0;
    return (1 - smooth(c.fondu[0], c.fondu[1], distPlaque(S, D, x, y, z))) * smooth(c.hFondu[0], c.hFondu[1], h);
  };
  return { hauteur, garde };
}

// ---------- Points sombres (texels) ----------
function detecterPoints(R, valeur, cfg, P, zonesExclues, filtre = null) {
  const { W, H } = R, N = W * H;
  // Médiane 3D par voxel (histogrammes 64 classes) sur un bloc 3×3×3.
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < N; i++) if (R.tri[i] >= 0) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], R.pos[i * 3 + d]); mx[d] = Math.max(mx[d], R.pos[i * 3 + d]); }
  const G = grille(mn, mx, cfg.voxel), B = 64;
  const idx = new Map();
  const cell = new Int32Array(N).fill(-1);
  const hist = [];
  for (let i = 0; i < N; i++) {
    if (R.tri[i] < 0) continue;
    const c = cellule(G, R.pos[i * 3], R.pos[i * 3 + 1], R.pos[i * 3 + 2]);
    cell[i] = c;
    let k = idx.get(c); if (k === undefined) { k = hist.length; idx.set(c, k); hist.push(new Uint32Array(B)); }
    hist[k][Math.min(B - 1, valeur[i] >> 2)]++;
  }
  const med = new Map(), acc = new Uint32Array(B);
  for (const c of idx.keys()) {
    acc.fill(0); let tot = 0;
    const add = (q) => { const k = idx.get(q); if (k === undefined) return; const hh = hist[k]; for (let b = 0; b < B; b++) { acc[b] += hh[b]; tot += hh[b]; } };
    add(c); voisins(G, c, add);
    let s = 0, b = 0; for (; b < B; b++) { s += acc[b]; if (s >= tot / 2) break; }
    med.set(c, b * 4 + 2);
  }
  const cand = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (cell[i] < 0 || (filtre && !filtre(i))) continue;
    const ref = med.get(cell[i]);
    if (valeur[i] < ref * cfg.ratio && ref - valeur[i] > cfg.ecartMin) cand[i] = 1;
  }
  // Composantes connexes (8-voisinage) ; on garde les petites taches compactes hors zones exclues.
  const lab = new Int32Array(N).fill(-1), pile = new Int32Array(N);
  const garde = new Uint8Array(N), liste = [];
  for (let i = 0; i < N; i++) {
    if (!cand[i] || lab[i] >= 0) continue;
    let sp = 0; pile[sp++] = i; lab[i] = i; const mem = [];
    while (sp) {
      const p = pile[--sp]; mem.push(p); const x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx; if (cand[q] && lab[q] < 0) { lab[q] = i; pile[sp++] = q; }
      }
    }
    if (mem.length > cfg.texelsMax) continue;
    let cx = 0, cy = 0, cz = 0, vmin = 255, ref = 0;
    for (const p of mem) { cx += R.pos[p * 3]; cy += R.pos[p * 3 + 1]; cz += R.pos[p * 3 + 2]; vmin = Math.min(vmin, valeur[p]); ref += med.get(cell[p]); }
    cx /= mem.length; cy /= mem.length; cz /= mem.length; ref /= mem.length;
    let ext = 0; for (const p of mem) ext = Math.max(ext, Math.hypot(R.pos[p * 3] - cx, R.pos[p * 3 + 1] - cy, R.pos[p * 3 + 2] - cz));
    if (ext > cfg.tailleMax) continue;
    if (zonesExclues.some((z) => dansBox(z.box, cx, cy, cz))) continue;
    for (const p of mem) garde[p] = 1;
    liste.push({ centre: [cx, cy, cz].map((v) => +v.toFixed(4)), texels: mem.length, rayon: +ext.toFixed(4), min: Math.round(vmin), reference: Math.round(ref) });
  }
  // Dilatation d'un texel puis fondu d'un texel (dans l'atlas).
  const a = new Float32Array(N);
  for (let i = 0; i < N; i++) if (garde[i]) {
    const x = i % W, y = (i / W) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const r = Math.max(Math.abs(dx), Math.abs(dy)), v = r <= 1 ? 1 : 0.5, q = yy * W + xx;
      if (v > a[q]) a[q] = v;
    }
  }
  return { alpha: a, liste };
}

// ---------- Remplissage ----------
// Interpolation harmonique (26-voisinage, SOR) des voxels occupés non connus à partir des voxels connus.
function resoudreHarmonique(G, F, C, occ, connu) {
  const inconnus = [];
  for (let c = 0; c < G.n; c++) if (occ[c] && !connu[c]) inconnus.push(c);
  // Initialisation par propagation (ordre BFS depuis le connu).
  const fait = new Uint8Array(connu), front = [], mis = new Uint8Array(G.n);
  for (const c of inconnus) { let b = false; voisins(G, c, (q) => { if (connu[q]) b = true; }); if (b) { front.push(c); mis[c] = 1; } }
  const ordre = [], s = new Float32Array(C);
  for (let t = 0; t < front.length; t++) {
    const c = front[t]; ordre.push(c);
    let w = 0; s.fill(0);
    voisins(G, c, (q) => { if (fait[q]) { w++; for (let k = 0; k < C; k++) s[k] += F[q * C + k]; } });
    if (w) for (let k = 0; k < C; k++) F[c * C + k] = s[k] / w;
    fait[c] = 1;
    voisins(G, c, (q) => { if (occ[q] && !connu[q] && !mis[q]) { mis[q] = 1; front.push(q); } });
  }
  // Voxels inconnus sans aucun voisin connu (îlots) : ignorés par l'interpolation.
  for (const c of inconnus) if (!fait[c]) occ[c] = 0;
  const nb = ordre.map((c) => { const l = []; voisins(G, c, (q, d2) => { if (occ[q]) l.push(q, d2 === 1 ? 1 : d2 === 2 ? 0.7 : 0.55); }); return l; });
  const omega = 1.85;
  for (let it = 0; it < 500; it++) {
    for (let t = 0; t < ordre.length; t++) {
      const c = ordre[t], l = nb[t];
      let w = 0; s.fill(0);
      for (let u = 0; u < l.length; u += 2) { const q = l[u], ww = l[u + 1]; w += ww; for (let k = 0; k < C; k++) s[k] += ww * F[q * C + k]; }
      if (w) for (let k = 0; k < C; k++) F[c * C + k] += omega * (s[k] / w - F[c * C + k]);
    }
  }
  return ordre.length;
}

// Accumulation par voxel : couleur moyenne des texels sains (alpha nul) et normale moyenne de tous les texels.
function accumuler(R, img, chans, alpha, G, box) {
  const N = R.W * R.H, C = chans.length;
  const F = new Float32Array(G.n * C), Nm = new Float32Array(G.n * 3), nSain = new Uint32Array(G.n), occ = new Uint8Array(G.n);
  for (let i = 0; i < N; i++) {
    if (R.tri[i] < 0) continue;
    const x = R.pos[i * 3], y = R.pos[i * 3 + 1], z = R.pos[i * 3 + 2];
    if (box && !dansBox(box, x, y, z)) continue;
    const c = cellule(G, x, y, z); if (c < 0) continue;
    occ[c] = 1;
    for (let d = 0; d < 3; d++) Nm[c * 3 + d] += R.nrm[i * 3 + d];
    if (alpha[i] > 0) continue;
    nSain[c]++;
    for (let k = 0; k < C; k++) F[c * C + k] += img.data[i * img.C + chans[k]];
  }
  const connu = new Uint8Array(G.n);
  for (let c = 0; c < G.n; c++) {
    if (!occ[c]) continue;
    const l = Math.hypot(Nm[c * 3], Nm[c * 3 + 1], Nm[c * 3 + 2]) || 1;
    for (let d = 0; d < 3; d++) Nm[c * 3 + d] /= l;
    if (nSain[c] >= 3) { connu[c] = 1; for (let k = 0; k < C; k++) F[c * C + k] /= nSain[c]; } else for (let k = 0; k < C; k++) F[c * C + k] = 0;
  }
  return { F, Nm, occ, connu, nSain };
}

// Champ basse fréquence global (moyennes de voxels des texels sains) puis interpolation harmonique des voxels masqués.
function champBasseFrequence(R, img, chans, alpha, h) {
  const N = R.W * R.H;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < N; i++) if (R.tri[i] >= 0) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], R.pos[i * 3 + d]); mx[d] = Math.max(mx[d], R.pos[i * 3 + d]); }
  const G = grille(mn, mx, h);
  const A = accumuler(R, img, chans, alpha, G, null);
  const inconnus = resoudreHarmonique(G, A.F, chans.length, A.occ, A.connu);
  return { G, F: A.F, occ: A.occ, C: chans.length, inconnus };
}

// Distance (interpolée) au masque d'une plaque.
function distPlaque(S, D, x, y, z) {
  const G = S.G;
  const fx = (x - G.o[0]) / G.h - 0.5, fy = (y - G.o[1]) / G.h - 0.5, fz = (z - G.o[2]) / G.h - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
  if (i0 < 0 || j0 < 0 || k0 < 0 || i0 + 1 >= G.nx || j0 + 1 >= G.ny || k0 + 1 >= G.nz) return 1;
  const tx = fx - i0, ty = fy - j0, tz = fz - k0;
  let d = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let e = 0; e < 2; e++) d += (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (e ? tz : 1 - tz) * D[((i0 + a) * G.ny + j0 + b) * G.nz + k0 + e];
  return d;
}

// Champ guidé par l'orientation pour une plaque : l'albédo Tripo contient un ombrage cuit (plus sombre quand la
// surface se tourne vers le bas). Modèle c = a + b·ny + e·ny² ajusté sur un anneau de pelage sain autour de la
// plaque (normales lissées par voxel), puis interpolation harmonique du seul résidu.
function champGuide(R, img, chans, alpha, h, plaque, P) {
  const { S, D, cfg } = plaque, C = chans.length;
  const box = cfg.roi.map(([a, b]) => [a - 0.05, b + 0.05]);
  const G = grille(box.map((r) => r[0]), box.map((r) => r[1]), h);
  const A = accumuler(R, img, chans, alpha, G, box);
  // Normales très lissées (deux flous boîte de rayon 3 voxels ≈ σ 1,2 cm natif) : la courbure du tronc reste,
  // les bourrelets et marches des bords de plaque (quelques mm) disparaissent, sinon le modèle les repeindrait.
  flouNormales(G, A.Nm, A.occ, 3); flouNormales(G, A.Nm, A.occ, 3);
  const r0 = P.marge + P.fondu, r1 = r0 + 0.035;
  // Moindres carrés pondérés (petite régularisation sur les pentes).
  const M = new Float64Array(9), V = Array.from({ length: C }, () => new Float64Array(3));
  let nAnneau = 0;
  for (let c = 0; c < G.n; c++) {
    if (!A.connu[c]) continue;
    const k = c % G.nz, j = ((c / G.nz) | 0) % G.ny, i = (c / (G.ny * G.nz)) | 0;
    const d = distPlaque(S, D, G.o[0] + (i + 0.5) * h, G.o[1] + (j + 0.5) * h, G.o[2] + (k + 0.5) * h);
    if (d < r0 || d > r1) continue;
    const ny = A.Nm[c * 3 + 1], f = [1, ny, ny * ny], w = A.nSain[c];
    for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) M[a * 3 + b] += w * f[a] * f[b]; for (let q = 0; q < C; q++) V[q][a] += w * f[a] * A.F[c * C + q]; }
    nAnneau++;
  }
  const lam = M[0] * 1e-3; M[4] += lam; M[8] += lam;
  const coef = V.map((v) => resoudre3(M, v));
  const modele = (ny, q) => coef[q][0] + coef[q][1] * ny + coef[q][2] * ny * ny;
  for (let c = 0; c < G.n; c++) if (A.connu[c]) for (let q = 0; q < C; q++) A.F[c * C + q] -= modele(A.Nm[c * 3 + 1], q);
  const inconnus = resoudreHarmonique(G, A.F, C, A.occ, A.connu);
  return { G, F: A.F, Nm: A.Nm, occ: A.occ, C, coef, modele, inconnus, nAnneau };
}
// Flou boîte séparable (sommes cumulées) d'un champ de normales sur les voxels occupés, puis renormalisation.
function flouNormales(G, Nm, occ, r) {
  const n = G.n, W = new Float32Array(n * 4);
  for (let c = 0; c < n; c++) if (occ[c]) { W[c * 4] = Nm[c * 3]; W[c * 4 + 1] = Nm[c * 3 + 1]; W[c * 4 + 2] = Nm[c * 3 + 2]; W[c * 4 + 3] = 1; }
  const dims = [G.nx, G.ny, G.nz], pas = [G.ny * G.nz, G.nz, 1];
  for (let ax = 0; ax < 3; ax++) {
    const L = dims[ax], st = pas[ax], cum = new Float32Array((L + 1) * 4), out = new Float32Array(n * 4);
    const autres = [0, 1, 2].filter((d) => d !== ax);
    for (let a = 0; a < dims[autres[0]]; a++) for (let b = 0; b < dims[autres[1]]; b++) {
      const base = a * pas[autres[0]] + b * pas[autres[1]];
      for (let t = 0; t < L; t++) for (let k = 0; k < 4; k++) cum[(t + 1) * 4 + k] = cum[t * 4 + k] + W[(base + t * st) * 4 + k];
      for (let t = 0; t < L; t++) { const lo = Math.max(0, t - r), hi = Math.min(L, t + r + 1); for (let k = 0; k < 4; k++) out[(base + t * st) * 4 + k] = cum[hi * 4 + k] - cum[lo * 4 + k]; }
    }
    W.set(out);
  }
  for (let c = 0; c < n; c++) {
    if (!occ[c] || W[c * 4 + 3] <= 0) continue;
    const l = Math.hypot(W[c * 4], W[c * 4 + 1], W[c * 4 + 2]) || 1;
    Nm[c * 3] = W[c * 4] / l; Nm[c * 3 + 1] = W[c * 4 + 1] / l; Nm[c * 3 + 2] = W[c * 4 + 2] / l;
  }
}
function resoudre3(M, v) {
  const a = Array.from(M), b = Array.from(v);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(a[r * 3 + i]) > Math.abs(a[p * 3 + i])) p = r;
    for (let c = 0; c < 3; c++) [a[i * 3 + c], a[p * 3 + c]] = [a[p * 3 + c], a[i * 3 + c]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = 0; r < 3; r++) { if (r === i) continue; const f = a[r * 3 + i] / a[i * 3 + i]; for (let c = 0; c < 3; c++) a[r * 3 + c] -= f * a[i * 3 + c]; b[r] -= f * b[i]; }
  }
  return [b[0] / a[0], b[1] / a[4], b[2] / a[8]];
}
// Valeur basse fréquence d'un champ guidé en un point (normale lissée interpolée).
function evalGuide(L, x, y, z, out, tmpN) {
  if (!trilin(L.G, L.occ, L.F, L.C, x, y, z, out)) return false;
  if (!trilin(L.G, L.occ, L.Nm, 3, x, y, z, tmpN)) return false;
  const l = Math.hypot(tmpN[0], tmpN[1], tmpN[2]) || 1, ny = tmpN[1] / l;
  for (let q = 0; q < L.C; q++) out[q] += L.modele(ny, q);
  return true;
}

// ---------- Grain transplanté ----------
// Le grain du poil (bande fine, quelques texels) et le moutonnement (bande moyenne) sont pris dans du pelage sain
// décalé en 3D. Plusieurs décalages candidats sont mélangés par des poids aléatoires lisses (grille 3D), avec
// conservation de la variance : ni motif répété (effet tampon), ni couture. Les texels sources aberrants (taches,
// rayures) sont écartés, l'amplitude est calée sur un anneau de pelage sain autour de chaque plaque.

// Flou boîte séparable en place (sommes cumulées), rayon r.
function flouBoite(a, W, H, r) {
  const cum = new Float64Array(Math.max(W, H) + 1), k = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) cum[x + 1] = cum[x] + a[o + x];
    for (let x = 0; x < W; x++) a[o + x] = (cum[Math.min(W, x + r + 1)] - cum[Math.max(0, x - r)]) * k;
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) cum[y + 1] = cum[y] + a[y * W + x];
    for (let y = 0; y < H; y++) a[y * W + x] = (cum[Math.min(H, y + r + 1)] - cum[Math.max(0, y - r)]) * k;
  }
}
// Flou normalisé par la couverture (texels des îlots seulement) : 3 passes ≈ gaussienne de σ ≈ r + 0,5 texel.
function flouCouvert(R, val, r) {
  const N = R.W * R.H, num = new Float32Array(N), den = new Float32Array(N);
  for (let i = 0; i < N; i++) if (R.tri[i] >= 0) { num[i] = val[i]; den[i] = 1; }
  for (let p = 0; p < 3; p++) { flouBoite(num, R.W, R.H, r); flouBoite(den, R.W, R.H, r); }
  for (let i = 0; i < N; i++) num[i] = den[i] > 1e-6 ? num[i] / den[i] : val[i];
  return num;
}
// Bandes de détail d'un canal : fine (valeur / flou r1) et moyenne (flou r1 / flou r2), en log du rapport ou en écart.
function bandesDetail(R, val, r1, r2, rapport) {
  const b1 = flouCouvert(R, val, r1), b2 = flouCouvert(R, val, r2), N = val.length;
  const f = new Float32Array(N), m = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (rapport) { f[i] = Math.log((val[i] + 4) / (b1[i] + 4)); m[i] = Math.log((b1[i] + 4) / (b2[i] + 4)); }
    else { f[i] = val[i] - b1[i]; m[i] = b1[i] - b2[i]; }
  }
  return { f, m };
}

// Champ aléatoire lisse et déterministe dans [0, 1] : valeurs hachées aux nœuds d'une grille 3D, interpolées.
function hache(a, b, c, d) {
  let h = Math.imul(a, 0x8da6b343) ^ Math.imul(b, 0xd8163841) ^ Math.imul(c, 0xcb1ab31f) ^ Math.imul(d + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function aleatoire(x, y, z, k, h) {
  const fx = x / h, fy = y / h, fz = z / h, i = Math.floor(fx), j = Math.floor(fy), l = Math.floor(fz);
  const s = (t) => t * t * (3 - 2 * t), tx = s(fx - i), ty = s(fy - j), tz = s(fz - l);
  let v = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) v += (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (c ? tz : 1 - tz) * hache(i + a, j + b, l + c, k);
  return v;
}

// Texels pouvant servir de source : couverts, sains, hors zones naturellement particulières (tête, crins, sabots…).
// Pelage à moins de `ecart` au-delà du masque d'une plaque écarté aussi : ses bandes de détail portent le bord sombre
// ou clair de la plaque (flou de la bande moyenne), qui ressortait en taches dans le remplissage.
function sourcesPossibles(R, invalide, zonesExclues, plaques, ecart) {
  const N = R.W * R.H, ok = new Uint8Array(N), pl = Object.values(plaques || {});
  for (let i = 0; i < N; i++) {
    if (R.tri[i] < 0 || invalide[i] > 0) continue;
    const x = R.pos[i * 3], y = R.pos[i * 3 + 1], z = R.pos[i * 3 + 2];
    if (zonesExclues.some((zz) => dansBox(zz.box, x, y, z))) continue;
    if (pl.some((p) => dansBox(p.cfg.roi.map(([a, b]) => [a - ecart, b + ecart]), x, y, z) && distPlaque(p.S, p.D, x, y, z) < ecart)) continue;
    ok[i] = 1;
  }
  return ok;
}

// Grille 3D dense de texels (tri par alvéole de pas h) : plus proche texel exact d'un point, par couronnes
// croissantes (arrêt dès que la couronne suivante ne peut plus faire mieux), avec filtre d'orientation éventuel.
function grilleTexels(R, garder, bmin, bmax, h) {
  const nx = Math.max(1, Math.ceil((bmax[0] - bmin[0]) / h)), ny = Math.max(1, Math.ceil((bmax[1] - bmin[1]) / h)), nz = Math.max(1, Math.ceil((bmax[2] - bmin[2]) / h));
  const N = R.W * R.H, cel = new Int32Array(N).fill(-1), deb = new Int32Array(nx * ny * nz + 1);
  const idx = (x, y, z) => {
    const i = Math.floor((x - bmin[0]) / h), j = Math.floor((y - bmin[1]) / h), k = Math.floor((z - bmin[2]) / h);
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : (i * ny + j) * nz + k;
  };
  for (let t = 0; t < N; t++) if (garder(t)) { const c = idx(R.pos[t * 3], R.pos[t * 3 + 1], R.pos[t * 3 + 2]); if (c >= 0) { cel[t] = c; deb[c + 1]++; } }
  for (let c = 0; c < nx * ny * nz; c++) deb[c + 1] += deb[c];
  const liste = new Int32Array(deb[nx * ny * nz]), rempli = deb.slice(0, -1);
  for (let t = 0; t < N; t++) if (cel[t] >= 0) liste[rempli[cel[t]]++] = t;
  const pos = R.pos, nrm = R.nrm;
  // Renvoie l'indice du texel le plus proche (ou -1) ; dernier carré de distance dans d2.
  const res = { d2: Infinity };
  res.chercher = (x, y, z, qx, qy, qz, dotMin, dMax) => {
    const ci = Math.floor((x - bmin[0]) / h), cj = Math.floor((y - bmin[1]) / h), ck = Math.floor((z - bmin[2]) / h);
    let best = dMax * dMax, bj = -1;
    const rMax = Math.ceil(dMax / h) + 1;
    for (let r = 0; r <= rMax; r++) {
      for (let a = -r; a <= r; a++) {
        const i = ci + a; if (i < 0 || i >= nx) continue;
        for (let b = -r; b <= r; b++) {
          const j = cj + b; if (j < 0 || j >= ny) continue;
          const bord = Math.abs(a) === r || Math.abs(b) === r;
          for (let c = -r; c <= r; c += bord ? 1 : 2 * r || 1) {
            const k = ck + c; if (k < 0 || k >= nz) continue;
            const cc = (i * ny + j) * nz + k;
            for (let q = deb[cc]; q < deb[cc + 1]; q++) {
              const t = liste[q];
              const d = (pos[t * 3] - x) ** 2 + (pos[t * 3 + 1] - y) ** 2 + (pos[t * 3 + 2] - z) ** 2;
              if (d >= best) continue;
              if (dotMin > -1 && nrm[t * 3] * qx + nrm[t * 3 + 1] * qy + nrm[t * 3 + 2] * qz < dotMin) continue;
              best = d; bj = t;
            }
          }
        }
      }
      if (bj >= 0 && best <= (r * h) ** 2) break;
    }
    res.d2 = best;
    return bj;
  };
  // Plus proche texel de (x, y, z) parmi les alvéoles à moins de r de celle du point (cx, cy, cz).
  res.autour = (cx, cy, cz, r, x, y, z, qx, qy, qz, dotMin) => {
    const ci = Math.floor((cx - bmin[0]) / h), cj = Math.floor((cy - bmin[1]) / h), ck = Math.floor((cz - bmin[2]) / h);
    let best = Infinity, bj = -1;
    for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) for (let j = Math.max(0, cj - r); j <= Math.min(ny - 1, cj + r); j++) for (let k = Math.max(0, ck - r); k <= Math.min(nz - 1, ck + r); k++) {
      const cc = (i * ny + j) * nz + k;
      for (let q = deb[cc]; q < deb[cc + 1]; q++) {
        const t = liste[q];
        const d = (pos[t * 3] - x) ** 2 + (pos[t * 3 + 1] - y) ** 2 + (pos[t * 3 + 2] - z) ** 2;
        if (d >= best) continue;
        if (nrm[t * 3] * qx + nrm[t * 3 + 1] * qy + nrm[t * 3 + 2] * qz < dotMin) continue;
        best = d; bj = t;
      }
    }
    res.d2 = best;
    return bj;
  };
  // Germes : texel le plus proche du centre de chaque alvéole, propagé à toute la grille (chanfrein, 2 allers-retours) ;
  // approximation du point de surface le plus proche d'un point éloigné, affinée ensuite par `autour`.
  let germe = null;
  res.germe = (x, y, z) => {
    if (!germe) {
      const n = nx * ny * nz, bd = new Float64Array(n).fill(Infinity);
      germe = new Int32Array(n).fill(-1);
      const cen = (c, d) => bmin[d] + ((d === 0 ? (c / (ny * nz)) | 0 : d === 1 ? ((c / nz) | 0) % ny : c % nz) + 0.5) * h;
      const d2c = (c, t) => (cen(c, 0) - pos[t * 3]) ** 2 + (cen(c, 1) - pos[t * 3 + 1]) ** 2 + (cen(c, 2) - pos[t * 3 + 2]) ** 2;
      for (let c = 0; c < n; c++) for (let q = deb[c]; q < deb[c + 1]; q++) { const v = d2c(c, liste[q]); if (v < bd[c]) { bd[c] = v; germe[c] = liste[q]; } }
      for (let passe = 0; passe < 4; passe++) {
        for (let u = 0; u < n; u++) {
          const c = passe % 2 ? n - 1 - u : u, k = c % nz, j = ((c / nz) | 0) % ny, i = (c / (ny * nz)) | 0;
          for (const [a, b, d] of OFF26) {
            const ii = i + a, jj = j + b, kk = k + d;
            if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
            const g = germe[(ii * ny + jj) * nz + kk];
            if (g < 0 || g === germe[c]) continue;
            const v = d2c(c, g);
            if (v < bd[c]) { bd[c] = v; germe[c] = g; }
          }
        }
      }
    }
    const i = Math.floor((x - bmin[0]) / h), j = Math.floor((y - bmin[1]) / h), k = Math.floor((z - bmin[2]) / h);
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : germe[(i * ny + j) * nz + k];
  };
  return res;
}

// Distance (texels, plafonnée à 15) au bord d'îlot : texels couverts dont un voisin (4-voisinage) n'est pas couvert
// ou est loin en 3D (couture entre îlots jointifs dans l'atlas). Mise en cache sur la rastérisation.
function bordIlots(R, saut) {
  if (R.bordIlots) return R.bordIlots;
  const { W, H } = R, N = W * H, d = new Uint8Array(N).fill(255), file = new Int32Array(N);
  let qt = 0;
  const loin = (i, j) => (R.pos[i * 3] - R.pos[j * 3]) ** 2 + (R.pos[i * 3 + 1] - R.pos[j * 3 + 1]) ** 2 + (R.pos[i * 3 + 2] - R.pos[j * 3 + 2]) ** 2 > saut * saut;
  for (let i = 0; i < N; i++) {
    if (R.tri[i] < 0) continue;
    const x = i % W;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i + W < N ? i + W : -1];
    if (nb.some((j) => j < 0 || R.tri[j] < 0 || loin(i, j))) { d[i] = 0; file[qt++] = i; }
  }
  for (let qh = 0; qh < qt; qh++) {
    const i = file[qh], x = i % W;
    if (d[i] >= 15) continue;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i + W < N ? i + W : -1]) if (j >= 0 && R.tri[j] >= 0 && d[j] === 255) { d[j] = d[i] + 1; file[qt++] = j; }
  }
  for (let i = 0; i < N; i++) if (d[i] === 255) d[i] = 15;
  return (R.bordIlots = d);
}

// Sources d'une plaque : pour chaque texel à remplir et chaque décalage candidat, texel sain le plus proche en 3D de
// q = p + décalage (germe de l'alvéole de q, puis recherche exacte autour du germe ; jusqu'à `snap`), de même
// orientation. Poids = champ aléatoire lisse × fondu près des
// bords d'îlot de la source (détail faussé par le flou à travers la couture, changement d'îlot) × fondu en distance :
// le mélange varie continûment (plus de plages à bords en escalier).
function sourcesGrain(R, ok, lignes, candidats, G) {
  const K = candidats.length, n = lignes.length;
  const src = new Int32Array(n * K).fill(-1), w = new Float32Array(n * K);
  if (!n) return { src, w, couverture: 1 };
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const i of lignes) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], R.pos[i * 3 + d]); mx[d] = Math.max(mx[d], R.pos[i * 3 + d]); }
  const marge = G.snap + 0.003;
  const bmin = [0, 1, 2].map((d) => mn[d] + Math.min(...candidats.map((c) => c[d])) - marge), bmax = [0, 1, 2].map((d) => mx[d] + Math.max(...candidats.map((c) => c[d])) + marge);
  const kR = 2048 / R.W, bord = bordIlots(R, 0.004 * kR), b0 = G.bord[0] / kR, b1 = G.bord[1] / kR;
  const grilleS = grilleTexels(R, (t) => ok[t] === 1, bmin, bmax, G.pasGrille);
  let couverts = 0;
  for (let r = 0; r < n; r++) {
    const i = lignes[r], x = R.pos[i * 3], y = R.pos[i * 3 + 1], z = R.pos[i * 3 + 2];
    let un = false;
    for (let k = 0; k < K; k++) {
      const D = candidats[k];
      const qx = x + D[0], qy = y + D[1], qz = z + D[2], g0 = grilleS.germe(qx, qy, qz);
      if (g0 < 0) continue;
      const j = grilleS.autour(R.pos[g0 * 3], R.pos[g0 * 3 + 1], R.pos[g0 * 3 + 2], 2, qx, qy, qz, R.nrm[i * 3], R.nrm[i * 3 + 1], R.nrm[i * 3 + 2], 0.5);
      if (j < 0 || grilleS.d2 > G.snap * G.snap) continue;
      const fd = 1 - smooth(0.5 * G.snap, G.snap, Math.sqrt(grilleS.d2));
      src[r * K + k] = j;
      w[r * K + k] = Math.max(1e-3, aleatoire(x, y, z, k, G.cellule)) ** G.puissance * smooth(b0, b1, bord[j]) * fd;
      un = true;
    }
    if (un) couverts++;
  }
  return { src, w, couverture: couverts / n };
}

// Détail mélangé d'un texel : Σ w·d / √Σw² (variance conservée), sources aberrantes écartées.
function melange(S, r, bande, rejet) {
  const K = S.K;
  let s = 0, w2 = 0;
  for (let k = 0; k < K; k++) {
    const j = S.src[r * K + k];
    const f = j < 0 ? 0 : rejet ? 1 - rejet[j] : 1;
    if (f <= 0) continue;
    const w = S.w[r * K + k] * f;
    s += w * bande[j];
    w2 += w * w;
  }
  // Plancher : le grain s'efface quand toutes les sources sont faibles (bords d'îlots) au lieu d'être amplifié.
  return w2 > 0 ? s / Math.sqrt(w2 + 0.0025) : 0;
}

// Sources de toutes les plaques d'une rastérisation : lignes = texels à remplir (alpha > 0, plaque k).
function sourcesPlaques(R, AP, ok, P) {
  const N = R.W * R.H, ligne = new Int32Array(N).fill(-1), K = Math.max(...AP.noms.map((nom) => P.plaques[nom].decalages.length));
  const parts = [], info = {};
  let total = 0;
  AP.noms.forEach((nom, k) => {
    const lignes = [];
    for (let i = 0; i < N; i++) if (R.tri[i] >= 0 && AP.qui[i] === k && AP.a[i] > 0) lignes.push(i);
    const cand = P.plaques[nom].decalages;
    const s = sourcesGrain(R, ok, lignes, cand, P.grain);
    parts.push({ lignes, s, Kp: cand.length, debut: total });
    total += lignes.length;
    info[nom] = { candidats: cand.length, couverture: +s.couverture.toFixed(3) };
  });
  const src = new Int32Array(total * K).fill(-1), w = new Float32Array(total * K), plaque = new Int8Array(total);
  parts.forEach(({ lignes, s, Kp, debut }, p) => {
    lignes.forEach((i, r) => {
      ligne[i] = debut + r;
      plaque[debut + r] = p;
      for (let k = 0; k < Kp; k++) { src[(debut + r) * K + k] = s.src[r * Kp + k]; w[(debut + r) * K + k] = s.w[r * Kp + k]; }
    });
  });
  return { ligne, src, w, K, plaque, info };
}

// Gain d'amplitude par plaque et par bande : écart-type du détail sur un anneau de pelage sain autour de la plaque
// rapporté à celui du détail mélangé dans la plaque.
function gainsGrain(R, AP, S, ok, plaques, bandes, rejet, P) {
  const noms = AP.noms, gains = [];
  noms.forEach((nom, k) => {
    const { S: Sg, D, cfg } = plaques[nom];
    const r0 = P.marge + P.fondu, r1 = r0 + P.grain.anneau, box = cfg.roi.map(([a, b]) => [a - r1, b + r1]);
    const acc = bandes.map(() => [0, 0, 0, 0]); // anneau : n, Σd² ; plaque : n, Σd²
    for (let i = 0; i < R.W * R.H; i++) {
      if (!ok[i] || (rejet && rejet[i] > 0.5)) continue;
      const x = R.pos[i * 3], y = R.pos[i * 3 + 1], z = R.pos[i * 3 + 2];
      if (!dansBox(box, x, y, z)) continue;
      const d = distPlaque(Sg, D, x, y, z);
      if (d < r0 || d > r1) continue;
      bandes.forEach((b, q) => { acc[q][0]++; acc[q][1] += b[i] * b[i]; });
    }
    for (let i = 0; i < R.W * R.H; i++) {
      const r = S.ligne[i];
      if (r < 0 || S.plaque[r] !== k || AP.a[i] < 0.5) continue;
      bandes.forEach((b, q) => { const v = melange(S, r, b, rejet); acc[q][2]++; acc[q][3] += v * v; });
    }
    gains.push(acc.map(([na, sa, np, sp]) => {
      if (!na || !np || sp <= 0) return 1;
      const g = Math.sqrt(sa / na) / Math.sqrt(sp / np);
      return Math.min(P.grain.gainBornes[1], Math.max(P.grain.gainBornes[0], g));
    }));
  });
  return gains;
}

// Applique le remplissage à une image : champ basse fréquence (guidé dans les plaques) puis grain, fondu par alpha,
// marges des îlots recopiées depuis leur texel source. grain : { S, bandes [fine, moyenne], gains, rapport, bornes,
// rejet }. Renvoie aussi la valeur sans grain (reprise des taches résiduelles).
function remplirImage(R, img, chans, alpha, LF, guides, qui, grain) {
  const { W, H, src: srcMarge } = R, N = W * H, C = chans.length;
  const out = Buffer.from(img.data);
  const lf = new Float32Array(C), tn = new Float32Array(3);
  const val = new Float32Array(N * C), base = new Float32Array(N * C);
  const bF = grain?.bornes[0].map(Math.log), bM = grain?.bornes[1].map(Math.log);
  for (let i = 0; i < N; i++) {
    if (R.tri[i] < 0 || alpha[i] <= 0) continue;
    const x = R.pos[i * 3], y = R.pos[i * 3 + 1], z = R.pos[i * 3 + 2];
    const g = guides && qui[i] >= 0 ? guides[qui[i]] : null;
    if (!(g ? evalGuide(g, x, y, z, lf, tn) : trilin(LF.G, LF.occ, LF.F, C, x, y, z, lf))) {
      if (!trilin(LF.G, LF.occ, LF.F, C, x, y, z, lf)) for (let k = 0; k < C; k++) lf[k] = img.data[i * img.C + chans[k]];
    }
    const r = grain ? grain.S.ligne[i] : -1;
    let df = 0, dm = 0;
    if (r >= 0) {
      const gp = grain.gains[grain.S.plaque[r]];
      df = gp[0] * melange(grain.S, r, grain.bandes[0], grain.rejet);
      dm = gp[1] * melange(grain.S, r, grain.bandes[1], grain.rejet);
    }
    for (let k = 0; k < C; k++) {
      base[i * C + k] = lf[k];
      let v = lf[k];
      if (r >= 0) {
        if (grain.rapport) v *= Math.exp(Math.min(bF[1], Math.max(bF[0], df)) + Math.min(bM[1], Math.max(bM[0], dm)));
        else v += Math.min(grain.bornes[0][1], Math.max(grain.bornes[0][0], df)) + Math.min(grain.bornes[1][1], Math.max(grain.bornes[1][0], dm));
      }
      val[i * C + k] = v;
    }
  }
  const compose = (i, v) => {
    const s = R.tri[i] >= 0 ? i : srcMarge[i];
    if (s < 0) return;
    const a = alpha[s];
    if (a <= 0) return;
    for (let k = 0; k < C; k++) {
      const o = img.data[i * img.C + chans[k]];
      out[i * img.C + chans[k]] = Math.max(0, Math.min(255, Math.round(o * (1 - a) + v[s * C + k] * a)));
    }
  };
  for (let i = 0; i < N; i++) compose(i, val);
  // Reprise : texels désignés (taches résiduelles) remis à la valeur sans grain, marges comprises.
  const reprendre = (marque) => { for (let i = 0; i < N; i++) { const s = R.tri[i] >= 0 ? i : srcMarge[i]; if (s >= 0 && marque[s]) compose(i, base); } };
  return { out, reprendre };
}

// Carte de normales : dans les plaques, normale tangente neutre + micro-relief des sources (bande fine, bande moyenne
// atténuée, sans la pente locale des sources), fondu sur le bord.
function remplirNormales(R, img, alpha, grain) {
  const { W, H, src: srcMarge } = R, N = W * H;
  const out = Buffer.from(img.data);
  for (let i = 0; i < N; i++) {
    const s = R.tri[i] >= 0 ? i : srcMarge[i];
    if (s < 0) continue;
    const a = alpha[s];
    if (a <= 0) continue;
    const r = grain.S.ligne[s];
    let fx = 0, fy = 0;
    if (r >= 0) {
      const km = grain.moyen;
      fx = melange(grain.S, r, grain.x[0], grain.rejet) + km * melange(grain.S, r, grain.x[1], grain.rejet);
      fy = melange(grain.S, r, grain.y[0], grain.rejet) + km * melange(grain.S, r, grain.y[1], grain.rejet);
      const l = Math.hypot(fx, fy);
      if (l > 0.35) { fx *= 0.35 / l; fy *= 0.35 / l; }
    }
    const ox = img.data[i * img.C] / 127.5 - 1, oy = img.data[i * img.C + 1] / 127.5 - 1;
    const x = ox * (1 - a) + fx * a, y = oy * (1 - a) + fy * a;
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    out[i * img.C] = Math.round((x + 1) * 127.5); out[i * img.C + 1] = Math.round((y + 1) * 127.5); out[i * img.C + 2] = Math.round((z + 1) * 127.5);
  }
  return out;
}

// Mesure du relief de la carte de normales (|xy|) : liseré de la plaque vs intérieur vs pelage voisin.
function mesureRelief(R, img, alphaHard, S, D) {
  const N = R.W * R.H, acc = { bord: [0, 0], dedans: [0, 0], dehors: [0, 0] };
  for (let i = 0; i < N; i++) {
    if (R.tri[i] < 0) continue;
    const c = cellule(S.G, R.pos[i * 3], R.pos[i * 3 + 1], R.pos[i * 3 + 2]); if (c < 0) continue;
    const d = D[c];
    const m = Math.hypot(img.data[i * img.C] - 128, img.data[i * img.C + 1] - 128);
    const k = d === 0 ? (alphaHard[i] ? 'dedans' : null) : d < 0.007 ? 'bord' : d < 0.02 ? 'dehors' : null;
    if (k) { acc[k][0] += m; acc[k][1]++; }
  }
  const r = {}; for (const [k, [s, n]] of Object.entries(acc)) r[k] = n ? +(s / n).toFixed(2) : null;
  return r;
}

// Zone de relief à effacer dans le maillage : sommets à moins de `marge` d'une plaque (distance 3D au masque de
// segmentation) ou d'un sommet de liseré / pli relevé par l'analyse géométrique (le bord modelé déborde parfois de
// la couleur de quelques millimètres), hors mèche de crinière et toupet du garrot.
function zoneRelief(pos, plaques, P, meche, geo) {
  const nv = pos.length / 3, zone = new Uint8Array(nv), parPlaque = {};
  const bornes = {}, m = P.relief.marge, cle = (a, b, c) => `${a},${b},${c}`;
  const proches = Object.fromEntries(Object.keys(plaques).map((nom) => {
    const h = new Map(), r = geo.reliefPlaques[nom];
    for (const q of [...r.sommetsMarques, ...r.plisInternes.sommets]) { const k = cle(Math.floor(q[0] / m), Math.floor(q[1] / m), Math.floor(q[2] / m)); let l = h.get(k); if (!l) h.set(k, (l = [])); l.push(q); }
    return [nom, (x, y, z) => {
      const i = Math.floor(x / m), j = Math.floor(y / m), k = Math.floor(z / m);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const q of h.get(cle(i + a, j + b, k + c)) || []) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2 <= m * m) return true;
      return false;
    }];
  }));
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (const [nom, p] of Object.entries(plaques)) {
      if (distPlaque(p.S, p.D, x, y, z) > m && !proches[nom](x, y, z)) continue;
      if (meche.garde(x, y, z) > 0.5) continue;
      if (nom === 'tapis' && z > P.relief.toupet.zMin && Math.abs(x) < P.relief.toupet.xMax) continue;
      zone[v] = 1;
      parPlaque[nom] = (parPlaque[nom] || 0) + 1;
      const b = (bornes[nom] ||= [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9]]);
      for (let d = 0; d < 3; d++) { b[d][0] = Math.min(b[d][0], pos[v * 3 + d]); b[d][1] = Math.max(b[d][1], pos[v * 3 + d]); }
      break;
    }
  }
  return { zone, sommets: parPlaque, boites: Object.fromEntries(Object.entries(bornes).map(([k, b]) => [k, b.map((r) => r.map((v) => +v.toFixed(3)))])) };
}

// Géométrie : bosse locale des sommets (écart à la moyenne des voisins le long de la normale) selon la distance au
// bord de la plaque ; faces dont l'orientation contredit les normales de sommets (micro-replis).
function analyseGeometrie(positions, normals, indices, plaques, P) {
  const nv = positions.length / 3, cs = 0.006, hash = new Map();
  const cle = (x, y, z) => `${Math.floor(x / cs)},${Math.floor(y / cs)},${Math.floor(z / cs)}`;
  for (let v = 0; v < nv; v++) { const k = cle(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(v); }
  // Bosse (écart le long de la normale à la moyenne des voisins) et cassure (écart de normale), rayon cs.
  const mesure = (v) => {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    let sx = 0, sy = 0, sz = 0, mx = 0, my = 0, mz = 0, n = 0;
    const ix = Math.floor(x / cs), iy = Math.floor(y / cs), iz = Math.floor(z / cs);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = hash.get(`${ix + a},${iy + b},${iz + c}`); if (!l) continue;
      for (const u of l) {
        const dx = positions[u * 3] - x, dy = positions[u * 3 + 1] - y, dz = positions[u * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz > cs * cs) continue;
        if (normals[u * 3] * nx + normals[u * 3 + 1] * ny + normals[u * 3 + 2] * nz < 0.3) continue;
        sx += positions[u * 3]; sy += positions[u * 3 + 1]; sz += positions[u * 3 + 2]; mx += normals[u * 3]; my += normals[u * 3 + 1]; mz += normals[u * 3 + 2]; n++;
      }
    }
    if (n < 4) return [0, 0];
    const ml = Math.hypot(mx, my, mz) || 1;
    return [(x - sx / n) * nx + (y - sy / n) * ny + (z - sz / n) * nz, 1 - (mx * nx + my * ny + mz * nz) / ml];
  };
  const res = {};
  for (const [nom, { S, D, cfg }] of Object.entries(plaques)) {
    const bandes = { dedans: [], liseré: [], dehors: [] }, releves = [];
    for (let v = 0; v < nv; v++) {
      const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
      if (!dansBox(cfg.roi, x, y, z)) continue;
      const c = cellule(S.G, x, y, z); if (c < 0 || !S.cnt[c]) continue;
      const d = D[c];
      // Liseré : voxels du masque touchant le pelage, ou voxels hors masque à moins de 2 voxels.
      let bordInt = false;
      if (S.masque[c]) voisins(S.G, c, (q) => { if (S.cnt[q] && !S.masque[q]) bordInt = true; });
      const k = S.masque[c] ? (bordInt ? 'liseré' : 'dedans') : d <= 2 * S.G.h + 1e-9 ? 'liseré' : d < 0.025 ? 'dehors' : null;
      if (!k) continue;
      const m = mesure(v);
      bandes[k].push(m);
      if (k === 'liseré') releves.push([m[0], x, y, z, m[1]]);
    }
    const st = (a, j) => { if (!a.length) return null; const ab = a.map((m) => Math.abs(m[j])).sort((p, q) => p - q); const moy = a.reduce((p, m) => p + m[j], 0) / a.length; return { n: a.length, moyenne: +moy.toFixed(5), p50abs: +ab[ab.length >> 1].toFixed(5), p95abs: +ab[Math.floor(ab.length * 0.95)].toFixed(5), maxAbs: +ab[ab.length - 1].toFixed(5) }; };
    const B = { dedans: st(bandes.dedans, 0), liseré: st(bandes.liseré, 0), dehors: st(bandes.dehors, 0) };
    const K = { dedans: st(bandes.dedans, 1), liseré: st(bandes.liseré, 1), dehors: st(bandes.dehors, 1) };
    // Sommets du liseré nettement marqués (bosse ou cassure au-delà de 2× le 95e centile du pelage voisin).
    const sB = B.dehors ? Math.max(0.0004, 2 * B.dehors.p95abs) : 0.0004, sK = K.dehors ? Math.max(0.004, 2 * K.dehors.p95abs) : 0.004;
    const marques = releves.filter((r) => Math.abs(r[0]) > sB || r[4] > sK);
    const boite = (l) => (l.length ? [0, 1, 2].map((d) => [+Math.min(...l.map((r) => r[d + 1])).toFixed(3), +Math.max(...l.map((r) => r[d + 1])).toFixed(3)]) : null);
    const ratioB = B.liseré && B.dehors ? B.liseré.p95abs / Math.max(1e-6, B.dehors.p95abs) : 0;
    const ratioK = K.liseré && K.dehors ? K.liseré.p95abs / Math.max(1e-6, K.dehors.p95abs) : 0;
    // Plis internes (coutures / replis modelés dans la plaque) : mêmes seuils, voxels intérieurs.
    const plis = [];
    for (let v = 0; v < nv; v++) {
      const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
      if (!dansBox(cfg.roi, x, y, z)) continue;
      const c = cellule(S.G, x, y, z); if (c < 0 || !S.masque[c]) continue;
      const m = mesure(v); if (Math.abs(m[0]) > sB || m[1] > sK) plis.push([x, y, z]);
    }
    res[nom] = {
      sommetsMarques: marques.map((r) => r.slice(1, 4).map((v) => +v.toFixed(4))),
      plisInternes: { nombre: plis.length, boite: boite(plis.map((p) => [0, ...p])), sommets: plis.map((p) => p.map((v) => +v.toFixed(4))) },
      bosse: B, cassureNormale: K, ratioBosse: +ratioB.toFixed(2), ratioCassure: +ratioK.toFixed(2),
      seuils: { bosse: +sB.toFixed(5), cassure: +sK.toFixed(4) }, sommetsLisereMarques: marques.length,
      zoneGauche: boite(marques.filter((r) => r[1] >= 0)), zoneDroite: boite(marques.filter((r) => r[1] < 0)),
      exemples: marques.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 12).map((r) => ({ p: r.slice(1, 4).map((v) => +v.toFixed(3)), bosse: +r[0].toFixed(4), cassure: +r[4].toFixed(4) })),
      lisereEnRelief: (ratioB > 1.6 || ratioK > 1.6) && marques.length > 20,
    };
  }
  // Micro-replis : faces contre les normales de sommets.
  const replis = [];
  for (let t = 0; t < indices.length / 3; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    const ux = positions[b * 3] - positions[a * 3], uy = positions[b * 3 + 1] - positions[a * 3 + 1], uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const vx = positions[c * 3] - positions[a * 3], vy = positions[c * 3 + 1] - positions[a * 3 + 1], vz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = normals[a * 3] + normals[b * 3] + normals[c * 3], ny = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1], nz = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz >= 0) continue;
    const cx = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3, cy = (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3, cz = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
    const zone = P.exclusions.find((z) => dansBox(z.box, cx, cy, cz))?.nom || Object.entries(P.plaques).find(([, p]) => dansBox(p.roi, cx, cy, cz))?.[0] || 'pelage';
    replis.push({ triangle: t, centre: [cx, cy, cz].map((v) => +v.toFixed(3)), aire: +(Math.hypot(fx, fy, fz) / 2).toExponential(2), zone });
  }
  // Trous : arêtes de bord après soudure des sommets par position (doublons de couture UV).
  const soude = new Int32Array(nv), cles = new Map();
  for (let v = 0; v < nv; v++) { const k = `${Math.round(positions[v * 3] * 1e6)},${Math.round(positions[v * 3 + 1] * 1e6)},${Math.round(positions[v * 3 + 2] * 1e6)}`; if (!cles.has(k)) cles.set(k, v); soude[v] = cles.get(k); }
  const aretes = new Map();
  for (let t = 0; t < indices.length / 3; t++) for (let e = 0; e < 3; e++) {
    const a = soude[indices[t * 3 + e]], b = soude[indices[t * 3 + (e + 1) % 3]]; if (a === b) continue;
    const k = a < b ? `${a}_${b}` : `${b}_${a}`; aretes.set(k, (aretes.get(k) || 0) + 1);
  }
  const bords = [];
  for (const [k, n] of aretes) if (n === 1) { const [a, b] = k.split('_').map(Number); bords.push([0, 1, 2].map((d) => +((positions[a * 3 + d] + positions[b * 3 + d]) / 2).toFixed(4))); }
  return { trous: { aretesDeBord: bords.length, milieux: bords }, reliefPlaques: res, microReplis: { nombre: replis.length, parZone: replis.reduce((m, r) => ((m[r.zone] = (m[r.zone] || 0) + 1), m), {}), liste: replis } };
}

// Relais des triangles orphelins : texels de marge lus par un triangle sans texel propre (uv-raster) dont la source
// de marge (texel couvert le plus proche dans l'atlas) est à plus de `seuil` en 3D du point lu : ils prennent la valeur
// du texel couvert le plus proche de ce point en 3D. Renvoie les paires [texel de marge, texel source].
function relaisOrphelins(R, seuil) {
  const { texel, pos } = R.relais, loin = [];
  for (let k = 0; k < texel.length; k++) {
    const s = R.src[texel[k]];
    if (s >= 0 && (R.pos[s * 3] - pos[k * 3]) ** 2 + (R.pos[s * 3 + 1] - pos[k * 3 + 1]) ** 2 + (R.pos[s * 3 + 2] - pos[k * 3 + 2]) ** 2 > seuil * seuil) loin.push(k);
  }
  if (!loin.length) return [];
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const k of loin) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], pos[k * 3 + d] - 0.03); mx[d] = Math.max(mx[d], pos[k * 3 + d] + 0.03); }
  const g = grilleTexels(R, (t) => R.tri[t] >= 0, mn, mx, 0.004), paires = [];
  for (const k of loin) {
    const j = g.chercher(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], 0, 0, 0, -2, 0.02);
    if (j >= 0) paires.push([texel[k], j]);
  }
  return paires;
}
const appliquerRelais = (paires, out, C) => { for (const [i, j] of paires) for (let c = 0; c < C; c++) out[i * C + c] = out[j * C + c]; };

// Zones de relief des nettoyages de ce processus, indexées par l'empreinte des masques tapis + quartiers décodés
// (niveaux de gris) : la construction retrouve la zone à partir des seuls masques (mesh-clean.smoothMaskedRelief).
const zonesParMasques = new Map();
const empreinte = (masques) => { const h = createHash('sha1'); for (const m of masques) { h.update(`${m.width}x${m.height}:`); h.update(m.data); } return h.digest('hex'); };
async function grisBrut(png) { const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true }); return { data, width: info.width, height: info.height }; }
/** Zone de relief (Uint8Array par sommet) d'un nettoyage dont les masques [tapis, quartiers] sont ceux-ci, sinon null. */
export function zoneReliefDesMasques(masques, nv) {
  if (!Array.isArray(masques) || masques.length !== 2) return null;
  const z = zonesParMasques.get(empreinte(masques));
  return z && z.length === nv ? z : null;
}

async function pngGris(a, W, H) {
  const b = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) b[i] = Math.round(Math.min(1, a[i]) * 255);
  return sharp(b, { raw: { width: W, height: H, channels: 1 } }).toColourspace('b-w').png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Nettoie les trois textures du cheval Tripo.
 * @param {object} e positions/normals (Float32Array, unités natives ou mises à l'échelle), uvs, indices, images encodées
 * @param {object} [opts] { unitScale = 1, origin = [0,0,0], params } : native = (p - origin) / unitScale
 */
export async function cleanTripoTextures({ positions, normals, uvs, indices, baseColor, normal, metallicRoughness, unitScale: us0, origin: or0 }, opts = {}) {
  const t0 = Date.now();
  const unitScale = opts.unitScale ?? us0 ?? 1, origin = opts.origin ?? or0 ?? [0, 0, 0];
  const P = { ...DEFAUTS, ...(opts.params || {}) };
  // Retour aux unités natives pour que tous les seuils restent exprimés dans le repère Tripo.
  const pos = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i++) pos[i] = (positions[i] - origin[i % 3]) / unitScale;
  const mesh = { positions: pos, normals, uvs, indices };
  const temps = {};
  const tic = (k, t) => { temps[k] = Date.now() - t; };

  let t = Date.now();
  const bc = await decode(baseColor), nm = await decode(normal), mr = await decode(metallicRoughness);
  const rasters = new Map();
  const raster = (W, H) => { const k = `${W}x${H}`; if (!rasters.has(k)) rasters.set(k, rasterizeUV(mesh, W, H)); return rasters.get(k); };
  const Rb = raster(bc.W, bc.H), Rn = raster(nm.W, nm.H), Rm = raster(mr.W, mr.H);
  tic('decodageRasterisation', t);

  // 1) Plaques (tapis, quartiers) : segmentation 3D sur l'albédo puis alpha par texel pour chaque résolution.
  t = Date.now();
  const plaques = {};
  for (const [nom, cfg] of Object.entries(P.plaques)) {
    const S = segmenterPlaque(Rb, bc, cfg, P);
    plaques[nom] = { S, D: distanceMasque(S), cfg };
  }
  // Mèche de crinière couchée à l'avant du tapis : gardée (alpha nul), ignorée par le champ basse fréquence.
  const meche = profilMeche(Rb, P.meche);
  const alphaPlaques = (R) => {
    const N = R.W * R.H, a = new Float32Array(N), qui = new Int8Array(N).fill(-1), noms = Object.keys(plaques), ign = new Uint8Array(N);
    let nMeche = 0;
    const bMeche = [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9]];
    for (let i = 0; i < N; i++) {
      if (R.tri[i] < 0) continue;
      const x = R.pos[i * 3], y = R.pos[i * 3 + 1], z = R.pos[i * 3 + 2];
      for (let k = 0; k < noms.length; k++) {
        const p = plaques[noms[k]];
        let v = alphaPlaque(p.S, p.D, P, p.cfg, x, y, z);
        if (v > 0 && noms[k] === 'tapis') {
          const m = meche.garde(x, y, z);
          if (m > 0.02) ign[i] = 1;
          if (m > 0.5) { nMeche++; [x, y, z].forEach((q, d) => { bMeche[d][0] = Math.min(bMeche[d][0], q); bMeche[d][1] = Math.max(bMeche[d][1], q); }); }
          v *= 1 - m;
          if (v < 1 / 255) v = 0;
        }
        if (v > a[i]) { a[i] = v; qui[i] = k; }
      }
    }
    return { a, qui, noms, ign, nMeche, bMeche: bMeche.map((r) => r.map((q) => +q.toFixed(3))) };
  };
  const APb = alphaPlaques(Rb), APn = Rn === Rb ? APb : alphaPlaques(Rn), APm = Rm === Rb ? APb : alphaPlaques(Rm);
  tic('masquesPlaques', t);
  // Géométrie : analyse seule (aucune modification), puis zone de relief à replacer (relief-plaques.mjs).
  t = Date.now();
  const geo = analyseGeometrie(pos, normals, indices, plaques, P);
  const zr = zoneRelief(pos, plaques, P, meche, geo);
  tic('geometrie', t);

  // 2) Points sombres : albédo (luminance) et rugosité (points brillants qui deviennent noirs avec le métal).
  t = Date.now();
  const Nb = Rb.W * Rb.H, lumB = new Uint8Array(Nb);
  for (let i = 0; i < Nb; i++) lumB[i] = Math.round(lum(bc.data[i * bc.C], bc.data[i * bc.C + 1], bc.data[i * bc.C + 2]));
  const exclPoints = [...P.exclusions, ...Object.values(P.plaques).map((p) => ({ nom: 'plaque', box: p.roi }))];
  const ptsB = detecterPoints(Rb, lumB, P.points, P, exclPoints);
  const Nm = Rm.W * Rm.H, rough = new Uint8Array(Nm);
  for (let i = 0; i < Nm; i++) rough[i] = mr.data[i * mr.C + 1];
  const ptsR = detecterPoints(Rm, rough, P.rugosite, P, exclPoints);
  tic('points', t);

  // 3) Sources du grain (par plaque, décalages multiples) pour l'albédo/normales et pour la rugosité.
  t = Date.now();
  // Texels à remplir (alpha) ; texels ignorés par le champ basse fréquence et comme sources (alphaLF : mèche en plus).
  const alphaB = new Float32Array(Nb), alphaLFb = new Float32Array(Nb);
  for (let i = 0; i < Nb; i++) { alphaB[i] = Math.max(APb.a[i], ptsB.alpha[i]); alphaLFb[i] = APb.ign[i] ? Math.max(alphaB[i], 1e-3) : alphaB[i]; }
  const alphaM = new Float32Array(Nm), alphaLFm = new Float32Array(Nm);
  for (let i = 0; i < Nm; i++) { alphaM[i] = Math.max(APm.a[i], ptsR.alpha[i]); alphaLFm[i] = APm.ign[i] ? Math.max(alphaM[i], 1e-3) : alphaM[i]; }
  const exS = P.marge + P.fondu + P.grain.ecartPlaque, okB = sourcesPossibles(Rb, alphaLFb, P.exclusions, plaques, exS), SRb = sourcesPlaques(Rb, APb, okB, P);
  const okM = Rm === Rb ? okB : sourcesPossibles(Rm, alphaLFm, P.exclusions, plaques, exS), SRm = Rm === Rb ? SRb : sourcesPlaques(Rm, APm, okM, P);
  let SRn = SRb;
  if (Rn !== Rb) {
    const invN = new Float32Array(Rn.W * Rn.H);
    for (let i = 0; i < invN.length; i++) invN[i] = APn.a[i] > 0 || APn.ign[i] ? 1 : 0;
    SRn = sourcesPlaques(Rn, APn, sourcesPossibles(Rn, invN, P.exclusions, plaques, exS), P);
  }
  tic('sources', t);

  // 4) Albédo : plaques (champ guidé + grain) et points (champ seul), puis contrôle des taches résiduelles.
  t = Date.now();
  const G = P.grain, lumF = new Float32Array(Nb);
  for (let i = 0; i < Nb; i++) lumF[i] = lumB[i];
  const bandesB = bandesDetail(Rb, lumF, G.rFin, G.rMoyen, true);
  const rejetB = new Float32Array(Nb), lr0 = Math.log(G.rejet[0]), lr1 = Math.log(G.rejet[1]);
  // Rejet progressif (degré 0..1, le mélange reste continu) : rapport total hors bornes, ou bande moyenne marquée
  // (pli, ombre portée, bord de tache : pas du moutonnement).
  const lm0 = Math.log(G.moyenMax[0]), lm1 = Math.log(G.moyenMax[1]);
  for (let i = 0; i < Nb; i++) {
    const v = bandesB.f[i] + bandesB.m[i];
    rejetB[i] = Math.max(1 - smooth(lr0 - 0.03, lr0 + 0.03, v), smooth(lr1 - 0.03, lr1 + 0.03, v), smooth(lm0, lm1, Math.abs(bandesB.m[i])));
  }
  const LFb = champBasseFrequence(Rb, bc, [0, 1, 2], alphaLFb, P.voxelLF);
  const guides = APb.noms.map((nom) => champGuide(Rb, bc, [0, 1, 2], alphaLFb, P.voxelLF, plaques[nom], P));
  const gainsB = gainsGrain(Rb, APb, SRb, okB, plaques, [bandesB.f, bandesB.m], rejetB, P);
  const fillB = remplirImage(Rb, bc, [0, 1, 2], alphaB, LFb, guides, APb.qui, { S: SRb, bandes: [bandesB.f, bandesB.m], gains: gainsB, rapport: true, bornes: [G.bornesFin, G.bornesMoyen], rejet: rejetB });
  const lumOut = new Uint8Array(Nb);
  for (let i = 0; i < Nb; i++) lumOut[i] = Math.round(lum(fillB.out[i * bc.C], fillB.out[i * bc.C + 1], fillB.out[i * bc.C + 2]));
  const residus = detecterPoints(Rb, lumOut, P.residus, P, [], (i) => APb.a[i] >= 0.5);
  if (residus.liste.length) {
    const marque = new Uint8Array(Nb);
    for (let i = 0; i < Nb; i++) if (residus.alpha[i] > 0 && APb.a[i] > 0) marque[i] = 1;
    fillB.reprendre(marque);
  }
  const bcOut = fillB.out;
  tic('albedo', t);

  // 5) Normales : plaques seulement (liseré / coutures en relief), mesure avant/après.
  t = Date.now();
  const reliefAvant = {};
  for (const [nom, p] of Object.entries(plaques)) {
    const hard = new Uint8Array(Rn.W * Rn.H);
    for (let i = 0; i < hard.length; i++) if (Rn.tri[i] >= 0) { const c = cellule(p.S.G, Rn.pos[i * 3], Rn.pos[i * 3 + 1], Rn.pos[i * 3 + 2]); if (c >= 0 && p.S.masque[c]) hard[i] = 1; }
    reliefAvant[nom] = mesureRelief(Rn, nm, hard, p.S, p.D);
  }
  const Nn = Rn.W * Rn.H, nxA = new Float32Array(Nn), nyA = new Float32Array(Nn);
  for (let i = 0; i < Nn; i++) { nxA[i] = nm.data[i * nm.C] / 127.5 - 1; nyA[i] = nm.data[i * nm.C + 1] / 127.5 - 1; }
  const kN = 2048 / Rn.W, bx = bandesDetail(Rn, nxA, Math.max(1, Math.round(G.rFin / kN)), Math.max(2, Math.round(G.rMoyen / kN)), false), by = bandesDetail(Rn, nyA, Math.max(1, Math.round(G.rFin / kN)), Math.max(2, Math.round(G.rMoyen / kN)), false);
  const rejetN = new Uint8Array(Nn);
  for (let i = 0; i < Nn; i++) if (Math.hypot(bx.f[i] + bx.m[i], by.f[i] + by.m[i]) > 0.3) rejetN[i] = 1;
  const nmOut = remplirNormales(Rn, nm, APn.a, { S: SRn, x: [bx.f, bx.m], y: [by.f, by.m], moyen: G.moyenNormales, rejet: rejetN });
  const reliefApres = {};
  for (const [nom, p] of Object.entries(plaques)) {
    const hard = new Uint8Array(Rn.W * Rn.H);
    for (let i = 0; i < hard.length; i++) if (Rn.tri[i] >= 0) { const c = cellule(p.S.G, Rn.pos[i * 3], Rn.pos[i * 3 + 1], Rn.pos[i * 3 + 2]); if (c >= 0 && p.S.masque[c]) hard[i] = 1; }
    reliefApres[nom] = mesureRelief(Rn, { data: nmOut, C: nm.C }, hard, p.S, p.D);
  }
  tic('normales', t);

  // 6) Métal/rugosité : bleu (métal) à 0 partout, vert (rugosité) conservé hors masques, rempli dans les masques.
  t = Date.now();
  const roughF = new Float32Array(Nm);
  for (let i = 0; i < Nm; i++) roughF[i] = rough[i];
  const kM = 2048 / Rm.W, bandesM = bandesDetail(Rm, roughF, Math.max(1, Math.round(G.rFin / kM)), Math.max(2, Math.round(G.rMoyen / kM)), false);
  const rejetM = new Uint8Array(Nm);
  for (let i = 0; i < Nm; i++) if (Math.abs(bandesM.f[i] + bandesM.m[i]) > 30) rejetM[i] = 1;
  const LFm = champBasseFrequence(Rm, mr, [1], alphaLFm, P.voxelLF);
  const gainsM = gainsGrain(Rm, APm, SRm, okM, plaques, [bandesM.f, bandesM.m], rejetM, P);
  const mrOut = remplirImage(Rm, mr, [1], alphaM, LFm, null, null, { S: SRm, bandes: [bandesM.f, bandesM.m], gains: gainsM, rapport: false, bornes: [[-20, 20], [-15, 15]], rejet: rejetM }).out;
  let metalMaxAvant = 0;
  for (let i = 0; i < Nm; i++) { metalMaxAvant = Math.max(metalMaxAvant, mr.data[i * mr.C + 2]); mrOut[i * mr.C + 2] = 0; }
  tic('metalRugosite', t);


  // 7) Triangles orphelins : marges lues loin de leur source (après tous les remplissages).
  t = Date.now();
  // Seuil rapporté à la taille des texels (marges plus lointaines à basse résolution).
  const seuilR = (R) => P.relais.seuil * (2048 / R.W);
  const relB = relaisOrphelins(Rb, seuilR(Rb)), relN = Rn === Rb ? relB : relaisOrphelins(Rn, seuilR(Rn)), relM = Rm === Rb ? relB : relaisOrphelins(Rm, seuilR(Rm));
  appliquerRelais(relB, bcOut, bc.C); appliquerRelais(relN, nmOut, nm.C); appliquerRelais(relM, mrOut, mr.C);
  tic('relais', t);

  // Sorties.
  t = Date.now();
  const enc = (data, img) => sharp(data, { raw: { width: img.W, height: img.H, channels: img.C } }).png({ compressionLevel: 9 }).toBuffer();
  const maskPad = new Float32Array(Nb), maskFlap = new Float32Array(Nb), maskDots = new Float32Array(Nb);
  const kTapis = APb.noms.indexOf('tapis');
  for (let i = 0; i < Nb; i++) {
    const s = Rb.tri[i] >= 0 ? i : Rb.src[i]; if (s < 0) continue;
    if (APb.qui[s] === kTapis) maskPad[i] = APb.a[s]; else if (APb.qui[s] >= 0) maskFlap[i] = APb.a[s];
    maskDots[i] = ptsB.alpha[s];
  }
  // Plaques remplies à la résolution de la rugosité (alpha calculé sur ses propres texels) : ajoutées aux masques.
  if (Rm !== Rb) for (let y = 0; y < Rb.H; y++) for (let x = 0; x < Rb.W; x++) {
    const im = Math.min(Rm.H - 1, Math.floor((y * Rm.H) / Rb.H)) * Rm.W + Math.min(Rm.W - 1, Math.floor((x * Rm.W) / Rb.W)), s = Rm.tri[im] >= 0 ? im : Rm.src[im];
    if (s < 0 || !(APm.a[s] > 0)) continue;
    const i = y * Rb.W + x;
    if (APm.qui[s] === kTapis) maskPad[i] = Math.max(maskPad[i], APm.a[s]); else maskFlap[i] = Math.max(maskFlap[i], APm.a[s]);
  }
  // Texels relayés (triangles orphelins) : masque des points à 1.
  for (const [i] of relB) maskDots[i] = 1;
  for (const [i] of relM) { const x = i % Rm.W, y = (i / Rm.W) | 0, f = Rb.W / Rm.W; for (let a = 0; a < f; a++) for (let b = 0; b < f; b++) maskDots[(y * f + a) * Rb.W + x * f + b] = 1; }
  // Points de rugosité reportés dans le masque des points (résolution de l'albédo, au plus proche).
  for (let y = 0; y < Rb.H; y++) for (let x = 0; x < Rb.W; x++) {
    const xm = Math.min(Rm.W - 1, Math.floor(x * Rm.W / Rb.W)), ym = Math.min(Rm.H - 1, Math.floor(y * Rm.H / Rb.H));
    const s = Rm.tri[ym * Rm.W + xm] >= 0 ? ym * Rm.W + xm : Rm.src[ym * Rm.W + xm];
    if (s >= 0) maskDots[y * Rb.W + x] = Math.max(maskDots[y * Rb.W + x], ptsR.alpha[s] * 0.6);
  }
  const [bcPng, nmPng, mrPng, mPad, mFlap, mDots] = await Promise.all([
    enc(bcOut, bc), enc(nmOut, nm), enc(mrOut, mr), pngGris(maskPad, Rb.W, Rb.H), pngGris(maskFlap, Rb.W, Rb.H), pngGris(maskDots, Rb.W, Rb.H),
  ]);
  tic('encodage', t);

  const r3 = (a) => a.map((v) => +v.toFixed(3));
  const texelsMasque = (k) => { let n = 0; for (let i = 0; i < Nb; i++) if (Rb.tri[i] >= 0 && APb.qui[i] === k && APb.a[i] >= 0.5) n++; return n; };
  const g = geo.reliefPlaques;
  const diagnostic = {
    tapis: `Tapis rosé (plus rouge que la robe : r/g ≥ ${P.plaques.tapis.faible.rgMin} contre 1,11-1,24 sur le pelage voisin) à cheval sur la colonne, ${report0(plaques.tapis.S)} ; liseré et coutures en relief dans la carte de normales (|xy| ${reliefAvant.tapis.bord} au bord contre ${reliefAvant.tapis.dehors} sur le pelage voisin, ${reliefApres.tapis.bord} après). Bord également modelé dans le maillage (${g.tapis.sommetsLisereMarques} sommets de liseré marqués) : géométrie non modifiée ici, zone à replacer fournie (geometry.zoneRelief, voir relief-plaques.mjs ; la construction l'applique par mesh-clean.smoothMaskedRelief). Mèche de crinière couchée sur le garrot à l'avant du tapis : couleur d'origine gardée sur sa partie à mèches nettes (${APb.nMeche} texels à plus de 50 %), fondue vers le pelage sur 4 mm autour et au pied ; sa pointe effilée, teintée par le tapis, est remplie comme le tapis.`,
    quartiers: `Rectangles bruns sur chaque flanc, gauche ${report0(plaques.quartierG.S)}, droit ${report0(plaques.quartierD.S)} ; bord en relief dans la carte de normales (|xy| au bord ${reliefAvant.quartierG.bord} / ${reliefAvant.quartierD.bord} contre ${reliefAvant.quartierG.dehors} / ${reliefAvant.quartierD.dehors} autour ; ${reliefApres.quartierG.bord} / ${reliefApres.quartierD.bord} après) et dans le maillage (bord haut en marche d'environ 0,002 et plis internes) : géométrie non modifiée ici, zone à replacer fournie.`,
    points: `Albédo : aucun point noir isolé sur la robe hors zones naturellement sombres ; ${ptsB.liste.length} petites taches sombres corrigées (intérieur des cuisses, poitrail, membres). Rugosité : ${ptsR.liste.length} points brillants (rugosité basse) corrigés ; avec metallicFactor 1, ces points et les micro-replis du maillage (${geo.microReplis.nombre} faces retournées, liste dans geometrie.microReplis) apparaissent comme des points sombres selon l'éclairage. Les micro-replis relèvent de la géométrie (non modifiée ici). Après remplissage, ${residus.liste.length} tache(s) sombre(s) résiduelle(s) du grain transplanté remise(s) à la valeur sans grain. Triangles orphelins (UV dégénérés, ${Rb.relais.orphelins} triangles sans texel propre) : ${relB.length} texels de marge (albédo, normales) et ${relM.length} (rugosité) lus par eux loin de leur source sont recopiés depuis le texel le plus proche en 3D (sinon taches, par ex. sur le bord bas droit de l'ancien tapis). Lignes fines le long de coutures (encolure) : normales de sommets incohérentes entre doublons de couture, corrigées par mesh-clean.repairSeamNormals (géométrie, pas texture).`,
    metal: `Bleu (métal) du MR jusqu'à ${metalMaxAvant}/255 avec metallicFactor 1 : mis à 0 partout ; vert (rugosité) conservé hors masques.`,
  };
  const report = {
    diagnostic,
    unites: { unitScale, origin, note: 'seuils exprimés en unités natives Tripo' },
    textures: { baseColor: [bc.W, bc.H], normal: [nm.W, nm.H], metallicRoughness: [mr.W, mr.H] },
    texelsCouverts: Rb.tri.reduce((n, v) => n + (v >= 0), 0),
    plaques: Object.fromEntries(Object.entries(plaques).map(([nom, p], k) => [nom, {
      voxels: p.S.voxels, trousBouches: p.S.trous, boite: { min: r3(p.S.bbox[0]), max: r3(p.S.bbox[1]) }, zMesure: r3(p.S.zBande),
      texelsAlbedo: texelsMasque(k),
      grain: { ...SRb.info[nom], gainFin: +gainsB[k][0].toFixed(2), gainMoyen: +gainsB[k][1].toFixed(2) },
      grainRugosite: { ...SRm.info[nom], gainFin: +gainsM[k][0].toFixed(2), gainMoyen: +gainsM[k][1].toFixed(2) },
      reliefCarteNormales: { avant: reliefAvant[nom], apres: reliefApres[nom] },
    }])),
    meche: { texels: APb.nMeche, boite: APb.bMeche, parametres: P.meche, note: 'mèche de crinière couchée sur le garrot (avant du tapis) : couleur gardée selon la distance 3D au cœur (hauteur > coeur) et la hauteur au-dessus du dos ; exclue du champ basse fréquence (part gardée > 2 %) et de la zone de relief (part gardée > 50 %)' },
    residusGrain: { nombre: residus.liste.length, liste: residus.liste },
    trianglesOrphelins: { triangles: Rb.relais.orphelins, texelsRelaisAlbedoNormales: relB.length, texelsRelaisRugosite: relM.length, seuil: P.relais.seuil, note: 'triangles sans texel propre (UV dégénérés) lisant une marge d\'un autre îlot : texels de marge recopiés depuis le texel couvert le plus proche en 3D (comptés dans le masque des points)', exemples: relB.slice(0, 8).map(([i, j]) => ({ texel: [i % Rb.W, (i / Rb.W) | 0], source: [j % Rb.W, (j / Rb.W) | 0], p: r3([Rb.pos[j * 3], Rb.pos[j * 3 + 1], Rb.pos[j * 3 + 2]]) })) },
    zoneRelief: { sommets: zr.sommets, boites: zr.boites, marge: P.relief.marge, note: 'sommets à replacer par relief-plaques.mjs (effacerReliefPlaques), indexés comme la source' },
    points: {
      albedo: { nombre: ptsB.liste.length, liste: ptsB.liste },
      rugosite: { nombre: ptsR.liste.length, liste: ptsR.liste },
    },
    champBasseFrequence: {
      voxelsInconnusAlbedo: LFb.inconnus, voxelsInconnusRugosite: LFm.inconnus,
      modeleOmbrage: Object.fromEntries(APb.noms.map((nom, k) => [nom, { voxelsAnneau: guides[k].nAnneau, coefRVB_1_ny_ny2: guides[k].coef.map((c) => c.map((v) => +v.toFixed(1))) }])),
    },
    metal: { maxAvant: metalMaxAvant, maxApres: 0 },
    geometrie: geo,
    tempsMs: { ...temps, total: Date.now() - t0 },
  };
  zonesParMasques.set(empreinte([await grisBrut(mPad), await grisBrut(mFlap)]), zr.zone);
  return { baseColor: bcPng, normal: nmPng, metallicRoughness: mrPng, masks: { pad: mPad, flap: mFlap, dots: mDots }, geometry: { zoneRelief: zr.zone }, report };
}
