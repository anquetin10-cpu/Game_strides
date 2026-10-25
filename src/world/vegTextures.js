// Textures procédurales de la végétation (aucune image externe) : atlas de rameaux feuillus, écorces (couleur + relief),
// feuillage de haie répétable. Teintes de fin d'été, albédos naturels (verts sombres et peu saturés).
import * as THREE from 'three';
import { mulberry32, clamp } from '../core/math.js';

// ---------- Atlas de feuillage : 4 × 4 cellules ----------
export const LEAF = {
  oak: 0, oak2: 1, beech: 2, beech2: 3, ash: 4, birch: 5, poplar: 6, apple: 7,
  appleFruit: 8, pine: 9, hawthorn: 10, hazel: 11, bramble: 12, ivy: 13, grass: 14, fern: 15,
};
const COLS = 4;
const ROWS = 4;

// Rectangle UV [u0, v0, u1, v1] d'une cellule (le rameau part du bas, au centre).
export function leafCell(i) {
  const c = i % COLS, r = Math.floor(i / COLS);
  const pad = 0.002;
  return [c / COLS + pad, 1 - (r + 1) / ROWS + pad, (c + 1) / COLS - pad, 1 - r / ROWS - pad];
}

const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

// Contour d'une feuille pointant vers +x (pétiole en 0), longueur L, demi-largeur W.
function leafProfile(shape, s) {
  let w;
  switch (shape) {
    case 'oak': {
      // Obovale à 4-5 lobes arrondis, oreillettes à la base.
      w = Math.pow(s, 0.45) * Math.pow(1 - s, 0.4) * 1.75;
      if (s > 0.08 && s < 0.97) w *= 0.58 + 0.42 * Math.abs(Math.cos(Math.PI * (s - 0.08) * 4.6));
      break;
    }
    case 'lobed': // aubépine : lobes profonds
      w = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.8) * (0.4 + 0.6 * Math.abs(Math.sin(Math.PI * s * 2.6)));
      break;
    case 'lance':
      w = Math.pow(Math.sin(Math.PI * s), 1.15);
      break;
    case 'rhombic': // peuplier, bouleau
      w = s < 0.38 ? Math.pow(s / 0.38, 0.8) : Math.pow((1 - s) / 0.62, 0.9);
      break;
    case 'round': // noisetier
      w = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 0.55);
      break;
    case 'ivy':
      w = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.7)), 0.7) * (0.55 + 0.45 * Math.abs(Math.cos(Math.PI * s * 2.5)));
      break;
    default: // ovale pointu (hêtre, pommier)
      w = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.78)), 0.85);
  }
  return w;
}

function drawLeaf(ctx, shape, x, y, ang, L, W, h, sat, lit, rnd, { teeth = 0, rib = 0.35, flat = false } = {}) {
  const n = 16;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // Pétiole.
  ctx.strokeStyle = hsl(h - 10, sat * 0.7, lit * 0.8);
  ctx.lineWidth = Math.max(0.8, W * 0.12);
  ctx.beginPath();
  ctx.moveTo(-L * 0.12, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();
  ctx.beginPath();
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    let w = leafProfile(shape, s) * W;
    if (teeth && i % 2 && i < n) w *= 1 - teeth;
    pts.push([s * L, w]);
  }
  ctx.moveTo(0, 0);
  for (const [px, py] of pts) ctx.lineTo(px, -py);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  // Limbe légèrement plié : une moitié plus claire.
  if (flat) ctx.fillStyle = hsl(h, sat, lit);
  else {
    const g = ctx.createLinearGradient(0, -W, 0, W);
    const side = rnd() < 0.5 ? 1 : -1;
    g.addColorStop(0, hsl(h, sat, lit * (side > 0 ? 1.12 : 0.86)));
    g.addColorStop(0.5, hsl(h + 2, sat, lit));
    g.addColorStop(1, hsl(h, sat * 0.95, lit * (side > 0 ? 0.86 : 1.12)));
    ctx.fillStyle = g;
  }
  ctx.fill();
  // Nervure centrale.
  if (rib > 0 && L > 9) {
    ctx.strokeStyle = hsl(h + 6, sat * 0.6, Math.min(0.9, lit * 1.45), rib);
    ctx.lineWidth = Math.max(0.6, W * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(L * 0.92, 0);
    ctx.stroke();
  }
  ctx.restore();
}

// Rameau générique : tige principale, rameaux latéraux, feuilles alternes. Origine en bas au centre de la cellule.
function spray(ctx, rnd, o) {
  const S = 256;
  const twigs = [];
  const main = { x0: S / 2 + (rnd() - 0.5) * 20, y0: S - 4, ang: -Math.PI / 2 + (rnd() - 0.5) * 0.3, len: S * (0.82 + rnd() * 0.1), w: o.twigW || 2.4 };
  twigs.push(main);
  const nSide = o.sides ?? 5;
  for (let k = 0; k < nSide; k++) {
    const t = 0.15 + (k / nSide) * 0.7 + rnd() * 0.08;
    const side = k % 2 ? 1 : -1;
    const bx = main.x0 + Math.cos(main.ang) * main.len * t;
    const by = main.y0 + Math.sin(main.ang) * main.len * t;
    twigs.push({ x0: bx, y0: by, ang: main.ang + side * (o.sideAng ?? 0.95) * (0.7 + rnd() * 0.6), len: main.len * (0.42 + rnd() * 0.26) * (1 - t * 0.4), w: main.w * 0.6 });
  }
  ctx.lineCap = 'round';
  for (const tw of twigs) {
    ctx.strokeStyle = o.twig || '#4a3b2c';
    ctx.lineWidth = tw.w;
    ctx.beginPath();
    ctx.moveTo(tw.x0, tw.y0);
    const bend = (rnd() - 0.5) * 0.4;
    const mx = tw.x0 + Math.cos(tw.ang + bend) * tw.len * 0.5, my = tw.y0 + Math.sin(tw.ang + bend) * tw.len * 0.5;
    tw.x1 = tw.x0 + Math.cos(tw.ang) * tw.len;
    tw.y1 = tw.y0 + Math.sin(tw.ang) * tw.len;
    ctx.quadraticCurveTo(mx, my, tw.x1, tw.y1);
    ctx.stroke();
  }
  // Feuilles : de l'arrière (sombres) vers l'avant (claires).
  const leaves = [];
  for (const tw of twigs) {
    const n = Math.round((o.perTwig ?? 9) * (tw === main ? 1.2 : 1) * (0.8 + rnd() * 0.4));
    for (let i = 0; i < n; i++) {
      const t = 0.18 + (i / n) * 0.82;
      const x = tw.x0 + (tw.x1 - tw.x0) * t, y = tw.y0 + (tw.y1 - tw.y0) * t;
      const side = i % 2 ? 1 : -1;
      const ang = tw.ang + side * (o.leafAng ?? 0.8) * (0.6 + rnd() * 0.7);
      const sc = 1 - t * 0.35;
      leaves.push({ x, y, ang, sc });
    }
    leaves.push({ x: tw.x1, y: tw.y1, ang: tw.ang + (rnd() - 0.5) * 0.4, sc: 0.85 });
  }
  // Remplissage : feuilles libres pour densifier le cœur du rameau.
  for (let i = 0; i < (o.fill ?? 20); i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * S * 0.4;
    leaves.push({ x: S / 2 + Math.cos(a) * r, y: S * 0.48 + Math.sin(a) * r * 0.95, ang: -Math.PI / 2 + (rnd() - 0.5) * 3, sc: 0.8 + rnd() * 0.3 });
  }
  leaves.sort(() => rnd() - 0.5);
  leaves.forEach((lf, k) => {
    const depth = k / leaves.length; // les dernières sont devant
    const [h, s, l] = o.color(rnd);
    const L = (o.len[0] + rnd() * (o.len[1] - o.len[0])) * lf.sc;
    drawLeaf(ctx, o.shape, lf.x, lf.y, lf.ang, L, L * o.wid, h, s, l * (0.78 + depth * 0.32), rnd, { teeth: o.teeth || 0, rib: o.rib ?? 0.35 });
  });
  return leaves;
}

function drawAsh(ctx, rnd) {
  const S = 256;
  ctx.lineCap = 'round';
  // Feuilles composées pennées : rachis + 4-6 paires de folioles lancéolées.
  for (let k = 0; k < 11; k++) {
    const x0 = S / 2 + (rnd() - 0.5) * 50, y0 = S - 8 - rnd() * 110;
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
    const len = 80 + rnd() * 50;
    ctx.strokeStyle = '#5b5a3c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
    const pairs = 4 + Math.floor(rnd() * 3);
    for (let p = 0; p <= pairs; p++) {
      const t = 0.22 + (p / pairs) * 0.78;
      const x = x0 + Math.cos(ang) * len * t, y = y0 + Math.sin(ang) * len * t;
      const L = 24 + rnd() * 8;
      for (const side of p === pairs ? [0] : [-1, 1]) {
        const h = 88 + rnd() * 14, s = 0.36 + rnd() * 0.1, l = 0.27 + rnd() * 0.09;
        drawLeaf(ctx, 'lance', x, y, ang + side * (1.05 + rnd() * 0.2), L, L * 0.24, h, s, l, rnd, { teeth: 0.05 });
      }
    }
  }
}

function drawPine(ctx, rnd) {
  const S = 256;
  ctx.lineCap = 'round';
  // Pin maritime : rameau brun, longues aiguilles par deux en touffes.
  const tips = [];
  const x0 = S / 2, y0 = S - 4;
  for (let k = 0; k < 5; k++) {
    const ang = -Math.PI / 2 + (k - 2) * 0.42 + (rnd() - 0.5) * 0.2;
    const len = 90 + rnd() * 70;
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    ctx.strokeStyle = '#6a4a32';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    for (let t = 0.3; t <= 1.0; t += 0.14) tips.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ang, t]);
  }
  for (const [x, y, ang, t] of tips) {
    const n = 26 + Math.floor(t * 20);
    for (let i = 0; i < n; i++) {
      const a = ang + (rnd() - 0.5) * 2.6 * (0.5 + t * 0.5);
      const L = 26 + rnd() * 22;
      const h = 95 + rnd() * 20, s = 0.22 + rnd() * 0.12, l = 0.22 + rnd() * 0.14;
      ctx.strokeStyle = hsl(h, s, l);
      ctx.lineWidth = 1.3 + rnd() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const c = (rnd() - 0.5) * 0.3;
      ctx.quadraticCurveTo(x + Math.cos(a + c) * L * 0.5, y + Math.sin(a + c) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
  }
}

function drawGrassTuft(ctx, rnd) {
  const S = 256;
  ctx.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const x = S / 2 + (rnd() - 0.5) * S * 0.9;
    const H = S * (0.35 + rnd() * 0.6);
    const lean = (rnd() - 0.5) * 0.9;
    const dry = rnd() < 0.18;
    ctx.strokeStyle = dry ? hsl(48 + rnd() * 10, 0.35, 0.45 + rnd() * 0.12) : hsl(80 + rnd() * 18, 0.38 + rnd() * 0.12, 0.25 + rnd() * 0.12);
    ctx.lineWidth = 1.8 + rnd() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, S);
    ctx.quadraticCurveTo(x + lean * H * 0.3, S - H * 0.55, x + lean * H, S - H);
    ctx.stroke();
  }
}

function drawFern(ctx, rnd) {
  const S = 256;
  ctx.lineCap = 'round';
  // Fougère aigle : frondes triangulaires, pinnules serrées, tons jaunissants de fin d'été.
  for (let f = 0; f < 4; f++) {
    const x0 = S / 2 + (f - 1.5) * 26, y0 = S;
    const ang = -Math.PI / 2 + (f - 1.5) * 0.35 + (rnd() - 0.5) * 0.2;
    const len = 200 + rnd() * 40;
    const hue = 70 + rnd() * 22;
    ctx.strokeStyle = hsl(hue - 10, 0.3, 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
    for (let t = 0.25; t < 1; t += 0.045) {
      const x = x0 + Math.cos(ang) * len * t, y = y0 + Math.sin(ang) * len * t;
      const pl = (1 - t) * 70 + 8;
      for (const side of [-1, 1]) {
        const a = ang + side * 1.25;
        for (let q = 0.15; q < 1; q += 0.16) {
          const px = x + Math.cos(a) * pl * q, py = y + Math.sin(a) * pl * q;
          drawLeaf(ctx, 'lance', px, py, a + side * 0.9, 9 + (1 - q) * 6, 3, hue + rnd() * 8, 0.42, 0.27 + rnd() * 0.1, rnd, { rib: 0 });
        }
      }
    }
  }
}

function drawFruit(ctx, rnd, n, r, colors, near) {
  for (let i = 0; i < n; i++) {
    const lf = near[Math.floor(rnd() * near.length)];
    const x = clamp(lf.x + (rnd() - 0.5) * 10, r + 2, 254 - r), y = clamp(lf.y + (rnd() - 0.5) * 10, r + 2, 254 - r);
    const [c0, c1] = colors[Math.floor(rnd() * colors.length)];
    const rr = r * (0.8 + rnd() * 0.4);
    const g = ctx.createRadialGradient(x - rr * 0.35, y - rr * 0.35, rr * 0.1, x, y, rr);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3b2a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - rr * 0.8);
    ctx.lineTo(x + 1.5, y - rr * 1.3);
    ctx.stroke();
  }
}

let atlas = null;
export function leafAtlas() {
  if (atlas) return atlas;
  const cell = 256;
  const cv = document.createElement('canvas');
  cv.width = COLS * cell;
  cv.height = ROWS * cell;
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(905);
  const cells = [
    // [cellule, fonction de dessin]
    [LEAF.oak, (c) => spray(c, rnd, { shape: 'oak', len: [24, 34], wid: 0.42, perTwig: 10, fill: 26, color: (r) => [84 + r() * 16, 0.34 + r() * 0.12, 0.2 + r() * 0.1] })],
    [LEAF.oak2, (c) => spray(c, rnd, { shape: 'oak', len: [22, 32], wid: 0.44, perTwig: 9, fill: 30, sides: 6, color: (r) => [78 + r() * 18, 0.3 + r() * 0.14, 0.19 + r() * 0.11] })],
    [LEAF.beech, (c) => spray(c, rnd, { shape: 'ovate', len: [22, 30], wid: 0.32, perTwig: 11, fill: 18, sideAng: 1.0, leafAng: 1.1, teeth: 0.03, color: (r) => [86 + r() * 12, 0.42 + r() * 0.12, 0.24 + r() * 0.1] })],
    [LEAF.beech2, (c) => spray(c, rnd, { shape: 'ovate', len: [20, 28], wid: 0.33, perTwig: 10, fill: 24, sides: 6, sideAng: 1.1, leafAng: 1.15, teeth: 0.03, color: (r) => [82 + r() * 14, 0.4 + r() * 0.12, 0.22 + r() * 0.1] })],
    [LEAF.ash, (c) => drawAsh(c, rnd)],
    [LEAF.birch, (c) => spray(c, rnd, { shape: 'rhombic', len: [15, 21], wid: 0.36, perTwig: 13, fill: 16, sides: 7, sideAng: 0.55, leafAng: 0.9, teeth: 0.1, twigW: 1.6, twig: '#5a4436', color: (r) => [74 + r() * 14, 0.42 + r() * 0.14, 0.28 + r() * 0.11] })],
    [LEAF.poplar, (c) => spray(c, rnd, { shape: 'rhombic', len: [17, 24], wid: 0.42, perTwig: 12, fill: 26, sides: 6, sideAng: 0.35, leafAng: 0.7, teeth: 0.06, color: (r) => [80 + r() * 14, 0.36 + r() * 0.12, 0.23 + r() * 0.1] })],
    [LEAF.apple, (c) => spray(c, rnd, { shape: 'ovate', len: [20, 28], wid: 0.36, perTwig: 9, fill: 22, teeth: 0.04, color: (r) => [88 + r() * 14, 0.26 + r() * 0.12, 0.25 + r() * 0.12] })],
    [LEAF.appleFruit, (c) => {
      const lv = spray(c, rnd, { shape: 'ovate', len: [20, 28], wid: 0.36, perTwig: 8, fill: 18, teeth: 0.04, color: (r) => [88 + r() * 14, 0.26 + r() * 0.12, 0.25 + r() * 0.12] });
      drawFruit(c, rnd, 10, 9, [['#d8532f', '#7d1c14'], ['#e2a43d', '#9a3b1c'], ['#c9d06a', '#6f7a2a']], lv);
    }],
    [LEAF.pine, (c) => drawPine(c, rnd)],
    [LEAF.hawthorn, (c) => {
      const lv = spray(c, rnd, { shape: 'lobed', len: [16, 22], wid: 0.5, perTwig: 12, fill: 34, sides: 7, twigW: 2, color: (r) => [88 + r() * 14, 0.36 + r() * 0.12, 0.18 + r() * 0.09] });
      drawFruit(c, rnd, 16, 3.2, [['#b0261c', '#5c0f0b']], lv);
    }],
    [LEAF.hazel, (c) => spray(c, rnd, { shape: 'round', len: [24, 32], wid: 0.42, perTwig: 8, fill: 18, teeth: 0.07, color: (r) => [80 + r() * 14, 0.36 + r() * 0.12, 0.25 + r() * 0.1] })],
    [LEAF.bramble, (c) => {
      const lv = spray(c, rnd, { shape: 'ovate', len: [18, 26], wid: 0.42, perTwig: 9, fill: 30, sides: 6, teeth: 0.1, twig: '#5d2f2a', color: (r) => [90 + r() * 14, 0.32 + r() * 0.1, 0.17 + r() * 0.08] });
      drawFruit(c, rnd, 12, 4.5, [['#3a1830', '#0d0610'], ['#a3262a', '#4c0d10']], lv);
    }],
    [LEAF.ivy, (c) => spray(c, rnd, { shape: 'ivy', len: [20, 28], wid: 0.5, perTwig: 8, fill: 22, twig: '#4b4630', color: (r) => [100 + r() * 16, 0.3 + r() * 0.12, 0.14 + r() * 0.08], rib: 0.5 })],
    [LEAF.grass, (c) => drawGrassTuft(c, rnd)],
    [LEAF.fern, (c) => drawFern(c, rnd)],
  ];
  for (const [i, draw] of cells) {
    const cx = (i % COLS) * cell, cy = Math.floor(i / COLS) * cell;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cell, cell);
    ctx.clip();
    ctx.translate(cx, cy);
    draw(ctx);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  atlas = { texture: tex, canvas: cv };
  return atlas;
}

// ---------- Bruit de valeur périodique (répétable) ----------
function pnoise(w, h, cx, cy, seed) {
  const rnd = mulberry32(seed);
  const g = new Float32Array(cx * cy).map(() => rnd());
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const fy = (j / h) * cy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
    for (let i = 0; i < w; i++) {
      const fx = (i / w) * cx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
      const x1 = (x0 + 1) % cx, y1 = (y0 + 1) % cy;
      const a = g[y0 * cx + x0], b = g[y0 * cx + x1], c = g[y1 * cx + x0], d = g[y1 * cx + x1];
      out[j * w + i] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

// Plaques (distance au bord de cellule, grille périodique anisotrope) : écorce de pin, galets.
function plates(w, h, cx, cy, seed) {
  const rnd = mulberry32(seed);
  const pts = new Float32Array(cx * cy * 2).map(() => 0.15 + rnd() * 0.7);
  const out = new Float32Array(w * h);
  const sw = w / cx, sh = h / cy;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const gx = Math.floor(i / sw), gy = Math.floor(j / sh);
      let f1 = 1e9, f2 = 1e9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const X = gx + ox, Y = gy + oy;
          const wx = ((X % cx) + cx) % cx, wy = ((Y % cy) + cy) % cy;
          const px = (X + pts[(wy * cx + wx) * 2]) * sw, py = (Y + pts[(wy * cx + wx) * 2 + 1]) * sh;
          const dx = (px - i) / sw, dy = (py - j) / sh;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
        }
      }
      out[j * w + i] = f2 - f1;
    }
  }
  return out;
}

function dataTex(data, w, h, srgb) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Carte normale (espace tangent) à partir d'une hauteur ; ligne 0 = v 0.
function normalFromHeight(hgt, w, h, k) {
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const l = hgt[j * w + ((i + w - 1) % w)], r = hgt[j * w + ((i + 1) % w)];
      const d = hgt[((j + h - 1) % h) * w + i], u = hgt[((j + 1) % h) * w + i];
      let nx = -(r - l) * k, ny = -(u - d) * k, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const o = (j * w + i) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * 0.5 + 0.5) * 255;
      out[o + 2] = (nz * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

const BARK_W = 128, BARK_H = 256;
const barkCache = {};
// Écorces : 'fissured' (chêne, frêne, peuplier, pommier), 'smooth' (hêtre, noisetier), 'birch', 'pine'.
export function barkTextures(type) {
  if (barkCache[type]) return barkCache[type];
  const w = BARK_W, h = BARK_H, n = w * h;
  const hgt = new Float32Array(n);
  const col = new Uint8Array(n * 4);
  const fine = pnoise(w, h, 32, 64, 11);
  const mid = pnoise(w, h, 8, 12, 12);
  const set = (k, r, g, b) => { col[k * 4] = clamp(r, 0, 255); col[k * 4 + 1] = clamp(g, 0, 255); col[k * 4 + 2] = clamp(b, 0, 255); col[k * 4 + 3] = 255; };
  if (type === 'fissured') {
    const warp = pnoise(w, h, 4, 8, 13);
    const ridge = pnoise(w, h, 16, 4, 14);
    const ridge2 = pnoise(w, h, 26, 7, 15);
    const lichen = pnoise(w, h, 12, 20, 16);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const ii = (i + Math.floor((warp[k] - 0.5) * 18) + w) % w;
        const r1 = Math.abs(ridge[j * w + ii] * 2 - 1), r2 = Math.abs(ridge2[j * w + ii] * 2 - 1);
        const fis = smooth(0.04, 0.34, r1) * smooth(0.03, 0.3, r2);
        const hh = fis * (0.8 + 0.2 * mid[k]) + fine[k] * 0.14;
        hgt[k] = hh;
        const t = clamp(hh, 0, 1);
        let r = 30 + t * 92 + mid[k] * 8, g = 27 + t * 84 + mid[k] * 7, b = 24 + t * 74 + mid[k] * 6;
        const lc = smooth(0.62, 0.8, lichen[k]) * t;
        r += (128 - r) * lc * 0.55; g += (138 - g) * lc * 0.55; b += (104 - b) * lc * 0.55;
        set(k, r, g, b);
      }
    }
  } else if (type === 'smooth') {
    const blot = pnoise(w, h, 6, 10, 21);
    for (let k = 0; k < n; k++) {
      const hh = 0.55 + fine[k] * 0.15 + mid[k] * 0.15;
      hgt[k] = hh;
      const m = smooth(0.55, 0.85, blot[k]);
      set(k, 116 - m * 30 + fine[k] * 14, 118 - m * 26 + fine[k] * 14, 110 - m * 30 + fine[k] * 12);
    }
    // Fines marques horizontales.
    const rnd = mulberry32(22);
    for (let q = 0; q < 26; q++) {
      const y = Math.floor(rnd() * h), x0 = Math.floor(rnd() * w), len = 6 + Math.floor(rnd() * 22);
      for (let x = 0; x < len; x++) {
        const k = y * w + ((x0 + x) % w);
        hgt[k] -= 0.12;
        col[k * 4] *= 0.8; col[k * 4 + 1] *= 0.8; col[k * 4 + 2] *= 0.8;
      }
    }
  } else if (type === 'birch') {
    const blot = pnoise(w, h, 9, 16, 31);
    for (let k = 0; k < n; k++) {
      hgt[k] = 0.6 + fine[k] * 0.1;
      const m = smooth(0.5, 0.75, mid[k]);
      set(k, 222 - m * 26 + fine[k] * 10, 220 - m * 26 + fine[k] * 10, 212 - m * 26 + fine[k] * 8);
      const dark = smooth(0.8, 0.86, blot[k]);
      if (dark > 0) {
        set(k, 222 - dark * 192, 220 - dark * 192, 212 - dark * 188);
        hgt[k] -= dark * 0.3;
      }
    }
    // Lenticelles : tirets sombres horizontaux.
    const rnd = mulberry32(32);
    for (let q = 0; q < 70; q++) {
      const y = Math.floor(rnd() * h), x0 = Math.floor(rnd() * w), len = 5 + Math.floor(rnd() * 20), th = rnd() < 0.3 ? 2 : 1;
      for (let x = 0; x < len; x++) {
        for (let t = 0; t < th; t++) {
          const k = ((y + t) % h) * w + ((x0 + x) % w);
          set(k, 58, 52, 48);
          hgt[k] -= 0.25;
        }
      }
    }
  } else {
    // Pin maritime : plaques brun-rouge, crevasses profondes.
    const pl = plates(w, h, 6, 5, 41);
    const tone = pnoise(w, h, 5, 9, 42);
    for (let k = 0; k < n; k++) {
      const e = smooth(0.02, 0.24, pl[k]);
      hgt[k] = e * (0.75 + fine[k] * 0.25);
      const t = e * (0.6 + tone[k] * 0.4);
      const red = smooth(0.45, 0.8, tone[k]) * e;
      set(k, 30 + t * 72 + red * 42 + fine[k] * 12, 24 + t * 54 + red * 12 + fine[k] * 10, 21 + t * 44 + fine[k] * 8);
    }
  }
  const res = { map: dataTex(col, w, h, true), normalMap: dataTex(normalFromHeight(hgt, w, h, type === 'smooth' || type === 'birch' ? 3 : 7), w, h, false) };
  barkCache[type] = res;
  return res;
}

function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------- Haie : feuillage dense répétable (u le long de la haie) + talus herbeux en bas ----------
let hedgeTex = null;
export function hedgeTextures() {
  if (hedgeTex) return hedgeTex;
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const rnd = mulberry32(77);
  // Fond : pénombre du cœur de la haie (haut) et terre du talus (bas).
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1d2814');
  g.addColorStop(0.7, '#18210f');
  g.addColorStop(0.74, '#3a3a22');
  g.addColorStop(1, '#4a4128');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const foliageBottom = H * 0.74;
  // Feuilles (dessinées trois fois pour raccorder horizontalement).
  const shapes = ['lobed', 'round', 'ovate', 'oak'];
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * W, y = rnd() * foliageBottom * 1.02;
    const depth = y / foliageBottom;
    const shape = shapes[Math.floor(rnd() * shapes.length)];
    const L = 12 + rnd() * 12;
    const h = 82 + rnd() * 20, s = 0.3 + rnd() * 0.14, l = (0.13 + rnd() * 0.12) * (1.15 - depth * 0.35) * (0.7 + 0.5 * (i / 1500));
    const ang = rnd() * Math.PI * 2;
    for (const dx of [-W, 0, W]) if (x + dx > -L && x + dx < W + L) drawLeaf(ctx, shape, x + dx, y, ang, L, L * 0.42, h, s, l, rnd, { rib: 0.25, flat: true });
  }
  // Talus : herbes et terre.
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W, y0 = H, hh = 10 + rnd() * (H - foliageBottom + 22);
    const dry = rnd() < 0.2;
    ctx.strokeStyle = dry ? hsl(48 + rnd() * 10, 0.3, 0.38 + rnd() * 0.12) : hsl(78 + rnd() * 18, 0.36, 0.2 + rnd() * 0.12);
    ctx.lineWidth = 1 + rnd() * 1.3;
    const lean = (rnd() - 0.5) * 0.8;
    for (const dx of [-W, 0, W]) {
      if (x + dx < -hh || x + dx > W + hh) continue;
      ctx.beginPath();
      ctx.moveTo(x + dx, y0);
      ctx.quadraticCurveTo(x + dx + lean * hh * 0.3, y0 - hh * 0.6, x + dx + lean * hh, y0 - hh);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  // Relief déduit de la luminance (feuilles claires = en avant).
  const d = ctx.getImageData(0, 0, W, H).data;
  const hgt = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = ((H - 1 - j) * W + i) * 4;
      hgt[j * W + i] = (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) / 255;
    }
  }
  const nm = new THREE.DataTexture(normalFromHeight(hgt, W, H, 9), W, H, THREE.RGBAFormat);
  nm.wrapS = THREE.RepeatWrapping;
  nm.wrapT = THREE.ClampToEdgeWrapping;
  nm.generateMipmaps = true;
  nm.minFilter = THREE.LinearMipmapLinearFilter;
  nm.magFilter = THREE.LinearFilter;
  nm.needsUpdate = true;
  hedgeTex = { map: tex, normalMap: nm };
  return hedgeTex;
}
