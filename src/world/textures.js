// Textures générées (logo Strides, panneaux publicitaires, enseignes, bannières) — design system STRIDES.
import * as THREE from 'three';
import { drawLogo, LOGO_FULL, LOGO_MARK } from '../ui/logo.js';

export const FONT_DISPLAY = 'Geist, -apple-system, "Helvetica Neue", Arial, sans-serif';
export const FONT_UI = 'Geist, -apple-system, "Helvetica Neue", Arial, sans-serif';
export const FONT_MONO = '"Geist Mono", ui-monospace, Menlo, monospace';
const INK = '#0f0f0e';
const PAPER = '#efeae0';
const SURFACE = '#f7f4ed';
const GOLD = '#b8953a';
// Pictos Ionicons (MIT) des badges de téléchargement.
const APPLE_D = 'M349.13 136.86c-40.32 0-57.36 19.24-85.44 19.24-28.79 0-50.75-19.1-85.69-19.1-34.2 0-70.67 20.88-93.83 56.45-32.52 50.16-27 144.63 25.67 225.11 18.84 28.81 44 61.12 77 61.47h.6c28.68 0 37.2-18.78 76.67-19h.6c38.88 0 46.68 18.89 75.24 18.89h.6c33-.35 59.51-36.15 78.35-64.85 13.56-20.64 18.6-31 29-54.35-76.19-28.92-88.43-136.93-13.08-178.34-23-28.8-55.32-45.48-85.79-45.48ZM340.25 32c-24 1.63-52 16.91-68.4 36.86-14.88 18.08-27.12 44.9-22.32 70.91h1.92c25.56 0 51.72-15.39 67-35.11 14.72-18.77 25.88-45.37 21.8-72.66';
let apple = null;

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(cv, repeat = false) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Marque STRIDES : le « S » en tête de cheval du logo officiel (hauteur h). Renvoie la largeur.
export function drawStridesMark(ctx, x, y, h, color) {
  return drawLogo(ctx, x, y, h, color, true);
}

// Logo complet ; h = hauteur des capitales « TRIDES » (le S déborde au-dessus et au-dessous).
export function drawWordmark(ctx, x, y, h, color) {
  const lh = h / 0.3;
  return drawLogo(ctx, x, y + h * 0.5 - lh * 0.55, lh, color);
}

// Badge « Télécharger dans l'App Store » (encre, comme sur strides-app.com).
function drawStoreBadge(ctx, x, y, h, dark = true) {
  const w = h * 3.3;
  ctx.save();
  ctx.fillStyle = dark ? INK : SURFACE;
  ctx.beginPath();
  // roundRect n'existe qu'à partir de Safari 16.
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h * 0.22);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.fillStyle = dark ? '#fff' : INK;
  ctx.save();
  ctx.translate(x + h * 0.22, y + h * 0.18);
  ctx.scale((h * 0.62) / 512, (h * 0.62) / 512);
  ctx.fill((apple ??= new Path2D(APPLE_D)));
  ctx.restore();
  ctx.font = `400 ${h * 0.2}px ${FONT_UI}`;
  ctx.fillText('Télécharger dans l’', x + h * 0.98, y + h * 0.4);
  ctx.font = `600 ${h * 0.36}px ${FONT_UI}`;
  ctx.fillText('App Store', x + h * 0.98, y + h * 0.78);
  ctx.restore();
  return w;
}

export function logoTexture(dark = true) {
  const key = `logo${dark}`;
  if (cache.has(key)) return cache.get(key);
  const cv = canvas(1024, 256);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = dark ? INK : PAPER;
  ctx.fillRect(0, 0, 1024, 256);
  const lh = 196;
  drawLogo(ctx, (1024 - (lh * LOGO_FULL.w) / LOGO_FULL.h) / 2, 30, lh, dark ? SURFACE : INK);
  const t = toTexture(cv);
  cache.set(key, t);
  return t;
}

// Affiches : textes du site strides-app.com.
const ADS = [
  { tag: 'TROUVER UN PROFESSIONNEL', title: 'Qui cherchez-vous\naujourd’hui ?', sub: 'Grooms, palefreniers, chauffeurs, enseignants — vérifiés.', color: '#b8953a' },
  { tag: 'L’APPLICATION MOBILE', title: 'Emportez STRIDES\navec vous', sub: 'Disponible sur l’App Store et Google Play.', color: '#2d6a4f' },
  { tag: 'NOS MÉTIERS', title: 'Groom concours,\ncavalier, chauffeur…', sub: 'Les métiers du cheval, au même endroit.', color: '#8f3a4a' },
  { tag: 'PAIEMENT SÉCURISÉ', title: 'Chaque prestation\npayée et garantie.', sub: 'Paiement garanti et sécurisé, partout en France.', color: '#5a7a8f' },
  { tag: 'REJOIGNEZ STRIDES', title: 'Vous êtes prestataire ?\nInscrivez-vous.', sub: 'Inscription gratuite · missions près de chez vous.', color: '#a14a38' },
];
export const AD_COUNT = ADS.length;

export function adTexture(i) {
  const key = `ad${i}`;
  if (cache.has(key)) return cache.get(key);
  const ad = ADS[i % ADS.length];
  const W = 1024, H = 512;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // Grand « S » en filigrane et liseré de couleur du métier, comme les cartes de l'app.
  ctx.globalAlpha = 0.07;
  drawLogo(ctx, W - 330, -30, 600, INK, true);
  ctx.globalAlpha = 1;
  ctx.fillStyle = ad.color;
  ctx.fillRect(0, 0, 16, H);
  drawLogo(ctx, 64, 44, 62, INK);
  ctx.fillStyle = '#76736b';
  ctx.font = `500 22px ${FONT_MONO}`;
  ctx.fillText(ad.tag, 66, 160);
  ctx.fillStyle = '#0a0a09';
  ctx.font = `600 66px ${FONT_DISPLAY}`;
  ad.title.split('\n').forEach((l, k) => ctx.fillText(l, 62, 236 + k * 72));
  ctx.fillStyle = '#46443e';
  ctx.font = `400 26px ${FONT_UI}`;
  ctx.fillText(ad.sub, 66, 390);
  drawStoreBadge(ctx, 64, 420, 66);
  const t = toTexture(cv);
  cache.set(key, t);
  return t;
}

export function signTexture(title, sub = '', { dark = true, w = 1024, h = 256, mark = false } = {}) {
  const key = `sign:${title}:${sub}:${dark}:${w}x${h}:${mark}`;
  if (cache.has(key)) return cache.get(key);
  const cv = canvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = dark ? INK : PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = dark ? 'rgba(251,250,245,0.22)' : 'rgba(10,10,9,0.18)';
  ctx.lineWidth = h * 0.03;
  ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  ctx.fillStyle = dark ? PAPER : INK;
  ctx.textAlign = 'center';
  const ts = sub ? h * 0.36 : h * 0.46;
  ctx.font = `600 ${ts}px ${FONT_DISPLAY}`;
  let size = ts;
  while (ctx.measureText(title).width > w * 0.86 && size > 10) {
    size *= 0.92;
    ctx.font = `600 ${size}px ${FONT_DISPLAY}`;
  }
  ctx.fillText(title, w / 2, sub ? h * 0.5 : h * 0.64);
  if (sub) {
    ctx.font = `500 ${h * 0.14}px ${FONT_MONO}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText(sub, w / 2, h * 0.78);
  }
  if (mark) {
    ctx.globalAlpha = 1;
    drawStridesMark(ctx, h * 0.15, h * 0.2, h * 0.6, dark ? PAPER : INK);
  }
  const t = toTexture(cv);
  cache.set(key, t);
  return t;
}

// Bandeau publicitaire répétable pour les lisses de carrière.
export function bannerTexture() {
  if (cache.has('banner')) return cache.get('banner');
  const cv = canvas(1024, 128);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, 1024, 128);
  drawLogo(ctx, 36, 18, 92, SURFACE);
  ctx.fillStyle = PAPER;
  ctx.fillRect(400, 0, 624, 128);
  ctx.fillStyle = GOLD;
  ctx.fillRect(400, 0, 10, 128);
  ctx.fillStyle = INK;
  ctx.font = `600 46px ${FONT_DISPLAY}`;
  ctx.fillText('La plateforme des pros du cheval', 436, 80);
  const t = toTexture(cv, true);
  cache.set('banner', t);
  return t;
}

// ---------- Camion porte-chevaux : atlas de livrée et de matériaux ----------
// Toute la carrosserie partage un seul matériau PBR : chaque pièce pointe (UV) vers une pastille de l'atlas
// qui fixe sa couleur, et la même zone des cartes ORM / vernis / émission fixe rugosité, métal, occlusion…
// Pastille : [couleur sRGB, rugosité, métal, vernis, occlusion, émission intérieure].
const PAINT = '#1d1e20';
const VINYL = '#e8e6e0';
export const TRUCK_SWATCHES = {
  paint: [PAINT, 0.5, 0, 1, 1],
  paintSatin: ['#2a2b2e', 0.58, 0, 0.2, 0.9],
  white: [VINYL, 0.36, 0, 1, 1],
  gold: ['#c9a24a', 0.32, 0.9, 1, 1],
  chrome: ['#e4e5e6', 0.07, 1, 0, 1],
  alu: ['#c4c7ca', 0.3, 1, 0, 1],
  aluDark: ['#868a90', 0.38, 1, 0, 1],
  steel: ['#5c5f63', 0.45, 0.85, 0, 0.9],
  mirror: ['#f0f0f0', 0.015, 1, 0, 1],
  plastic: ['#2c2d2f', 0.7, 0, 0, 1],
  plasticGrey: ['#45474a', 0.62, 0, 0, 1],
  plasticLight: ['#b9bbbd', 0.5, 0, 0, 1],
  rubber: ['#262626', 0.9, 0, 0, 1],
  tyre: ['#282828', 0.86, 0, 0, 1],
  tyreSide: ['#2b2b2b', 0.74, 0, 0, 1],
  rim: ['#b2b5b9', 0.3, 0.75, 0.3, 1],
  hub: ['#d0d2d4', 0.2, 1, 0, 1],
  darkHole: ['#0c0c0c', 0.9, 0, 0, 0.25],
  darkGlass: ['#101317', 0.04, 0, 1, 1],
  grille: ['#1e1f20', 0.6, 0, 0, 0.65],
  tread: ['#9b9ea2', 0.42, 1, 0, 1],
  exhaust: ['#56504a', 0.7, 0.6, 0, 1],
  blue: ['#2852a8', 0.5, 0, 0, 1],
  reflRed: ['#a3201b', 0.25, 0, 1, 1],
  reflAmber: ['#c27014', 0.25, 0, 1, 1],
  dash: ['#2a2b2d', 0.72, 0, 0, 0.55],
  seat: ['#333438', 0.92, 0, 0, 0.55],
  cabTrim: ['#3a3c40', 0.8, 0, 0, 0.5],
  // Intérieur du box : occlusion forte (le ciel ne l'éclaire pas), émission = plafonnier.
  rubberFloor: ['#2a2b2c', 0.93, 0, 0, 0.32, 0.1],
  pad: ['#3a3d42', 0.6, 0, 0, 0.32, 0.14],
  padSeam: ['#2a2c30', 0.7, 0, 0, 0.32, 0.08],
  grp: ['#d6d6d0', 0.42, 0, 0, 0.32, 0.28],
  ceiling: ['#e2e2dd', 0.5, 0, 0, 0.28, 0.36],
  hay: ['#a38d58', 0.95, 0, 0, 0.4, 0.2],
  net: ['#5a4632', 0.9, 0, 0, 0.4, 0.12],
  woodFloor: ['#6e563c', 0.62, 0, 0.3, 0.35, 0.12],
  steelInt: ['#8a8d92', 0.32, 1, 0, 0.45, 0.1],
};
// Rectangles de livrée (pixels de l'atlas de base 2048 × 1536, origine en haut à gauche).
export const TRUCK_RECTS = {
  sideLogo: [0, 0, 940, 1000], // panneau arrière des flancs : 2,35 × 2,5 m
  rear: [960, 0, 620, 620], // face extérieure du pont (rampe) : 2,3 × 2,3 m
  door: [1600, 0, 300, 170], // portes de cabine
  plate: [1600, 180, 264, 56], // plaque d'immatriculation
  badge: [1600, 246, 128, 128], // logo de calandre
  luton: [0, 1020, 1400, 220], // face avant de la capucine
  band: [0, 1250, 1400, 120], // bandeau de flanc
};
const SW_ORIGIN = [1420, 640];
const SW_CELL = 32;
const SW_COLS = 19;

export function truckTexture(scale = 1) {
  const key = `truck${scale}`;
  if (cache.has(key)) return cache.get(key);
  const W = 2048, H = 1536;
  const cv = canvas(Math.round(W * scale), Math.round(H * scale));
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = PAINT;
  ctx.fillRect(0, 0, W, H);
  const names = Object.keys(TRUCK_SWATCHES);
  const cell = (i) => [SW_ORIGIN[0] + (i % SW_COLS) * SW_CELL, SW_ORIGIN[1] + Math.floor(i / SW_COLS) * SW_CELL];
  names.forEach((n, i) => {
    const [x, y] = cell(i);
    ctx.fillStyle = TRUCK_SWATCHES[n][0];
    ctx.fillRect(x, y, SW_CELL, SW_CELL);
  });
  const R = TRUCK_RECTS;
  // Flancs : grand logo blanc, accroche en capitales mono.
  {
    const [x, y, w] = R.sideLogo;
    const lw = w * 0.84;
    const lh = (lw * LOGO_FULL.h) / LOGO_FULL.w;
    drawLogo(ctx, x + (w - lw) / 2, y + 300, lh, VINYL);
    ctx.fillStyle = VINYL;
    ctx.textAlign = 'center';
    ctx.font = `500 40px ${FONT_MONO}`;
    ctx.fillText('TRANSPORT DE CHEVAUX', x + w / 2, y + 640);
    ctx.globalAlpha = 0.72;
    ctx.font = `400 29px ${FONT_UI}`;
    ctx.fillText('Réservez un transporteur vérifié sur l’app', x + w / 2, y + 690);
    ctx.globalAlpha = 1;
  }
  // Rampe arrière : marque, site, panneau « chevaux ».
  {
    const [x, y, w] = R.rear;
    const mh = 250;
    drawLogo(ctx, x + w / 2 - (mh * LOGO_MARK.w) / LOGO_MARK.h / 2, y + 70, mh, VINYL, true);
    ctx.fillStyle = VINYL;
    ctx.textAlign = 'center';
    ctx.font = `600 64px ${FONT_DISPLAY}`;
    ctx.fillText('STRIDES', x + w / 2, y + 400);
    ctx.font = `500 26px ${FONT_MONO}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText('STRIDES-APP.COM', x + w / 2, y + 446);
    ctx.globalAlpha = 1;
    // Panneau réglementaire « CHEVAUX » (blanc, liseré noir).
    const sw = 300, sh = 92, sx = x + (w - sw) / 2, sy = y + 498;
    ctx.fillStyle = VINYL;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = PAINT;
    ctx.fillRect(sx + 6, sy + 6, sw - 12, sh - 12);
    ctx.fillStyle = VINYL;
    ctx.fillRect(sx + 10, sy + 10, sw - 20, sh - 20);
    ctx.fillStyle = '#16171a';
    ctx.font = `700 50px ${FONT_DISPLAY}`;
    ctx.fillText('CHEVAUX', sx + sw / 2, sy + 64);
  }
  // Portes de cabine.
  {
    const [x, y, w, h] = R.door;
    const lh = 64;
    const lw = (lh * LOGO_FULL.w) / LOGO_FULL.h;
    drawLogo(ctx, x + (w - lw) / 2, y + 30, lh, VINYL);
    ctx.fillStyle = VINYL;
    ctx.textAlign = 'center';
    ctx.font = `500 20px ${FONT_MONO}`;
    ctx.globalAlpha = 0.8;
    ctx.fillText('STRIDES-APP.COM', x + w / 2, y + h - 34);
    ctx.globalAlpha = 1;
  }
  // Plaque SIV (fictive) : bandes bleues, étoiles UE, « F », département 14 (Calvados).
  {
    const [x, y, w, h] = R.plate;
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1f3f9a';
    ctx.fillRect(x, y, 26, h);
    ctx.fillRect(x + w - 26, y, 26, h);
    ctx.fillStyle = '#f2c230';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillRect(x + 13 + Math.cos(a) * 7 - 1, y + 17 + Math.sin(a) * 7 - 1, 2, 2);
    }
    ctx.fillStyle = '#f4f4f0';
    ctx.textAlign = 'center';
    ctx.font = `700 16px ${FONT_UI}`;
    ctx.fillText('F', x + 13, y + 46);
    ctx.fillText('14', x + w - 13, y + 46);
    ctx.fillStyle = '#121212';
    ctx.font = `700 38px ${FONT_UI}`;
    ctx.fillText('ST-750-EQ', x + w / 2, y + 42);
    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  // Logo de calandre (marque argentée sur fond noir).
  {
    const [x, y, w, h] = R.badge;
    ctx.fillStyle = '#1e1f20';
    ctx.fillRect(x, y, w, h);
    const mh = 110;
    drawLogo(ctx, x + w / 2 - (mh * LOGO_MARK.w) / LOGO_MARK.h / 2, y + 9, mh, '#d9dadc', true);
  }
  // Capucine : logotype centré.
  {
    const [x, y, w, h] = R.luton;
    const lh = 150;
    const lw = (lh * LOGO_FULL.w) / LOGO_FULL.h;
    drawLogo(ctx, x + (w - lw) / 2, y + (h - lh) / 2, lh, VINYL);
  }
  // Bandeau de flanc.
  {
    const [x, y, w, h] = R.band;
    ctx.fillStyle = VINYL;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.85;
    ctx.font = `500 44px ${FONT_MONO}`;
    ctx.fillText('JOBS · ÉCURIES · TRANSPORT · ÉVÉNEMENTS', x + w / 2, y + h / 2 + 15);
    ctx.globalAlpha = 1;
  }
  const map = toTexture(cv);
  map.anisotropy = 8;
  // Cartes de propriétés (résolution réduite, sans mipmaps : zones uniformes).
  const small = (fn) => {
    const s = 0.25 * scale;
    const c = canvas(Math.round(W * s), Math.round(H * s));
    const x2 = c.getContext('2d');
    x2.scale(s, s);
    fn(x2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    return t;
  };
  const paintSw = TRUCK_SWATCHES.paint;
  const byte = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const fillSw = (x2, f) => {
    names.forEach((n, i) => {
      const [x, y] = cell(i);
      x2.fillStyle = f(TRUCK_SWATCHES[n]);
      x2.fillRect(x, y, SW_CELL, SW_CELL);
    });
  };
  const rgb = (r, g, b) => `rgb(${byte(r)},${byte(g)},${byte(b)})`;
  // ORM : R = occlusion, V = rugosité, B = métal (la livrée a les propriétés de la peinture).
  const orm = small((x2) => {
    x2.fillStyle = rgb(paintSw[4], paintSw[1], paintSw[2]);
    x2.fillRect(0, 0, W, H);
    x2.fillStyle = rgb(1, 0.4, 0);
    x2.fillRect(...R.plate);
    fillSw(x2, (s) => rgb(s[4], s[1], s[2]));
  });
  const coat = small((x2) => {
    x2.fillStyle = rgb(1, 1, 1);
    x2.fillRect(0, 0, W, H);
    x2.fillStyle = rgb(0.2, 0.2, 0.2);
    x2.fillRect(...R.plate);
    fillSw(x2, (s) => rgb(s[3], s[3], s[3]));
  });
  const emit = small((x2) => {
    x2.fillStyle = '#000';
    x2.fillRect(0, 0, W, H);
    fillSw(x2, (s) => rgb((s[5] || 0) * 1.0, (s[5] || 0) * 0.86, (s[5] || 0) * 0.68));
  });
  const uvOf = (px, py) => [px / W, 1 - py / H];
  const swatchUV = {};
  names.forEach((n, i) => {
    const [x, y] = cell(i);
    swatchUV[n] = uvOf(x + SW_CELL / 2, y + SW_CELL / 2);
  });
  // Rectangle en coordonnées de texture : u0 (gauche), u1, v0 (bas), v1 (haut).
  const rectUV = {};
  for (const [n, [x, y, w, h]] of Object.entries(R)) {
    const inset = 2;
    rectUV[n] = { u0: (x + inset) / W, u1: (x + w - inset) / W, v0: 1 - (y + h - inset) / H, v1: 1 - (y + inset) / H };
  }
  const out = { map, orm, coat, emit, swatchUV, rectUV };
  cache.set(key, out);
  return out;
}

// Texture d'asphalte avec marquage central (V le long de la route).
export function roadTexture() {
  if (cache.has('road')) return cache.get('road');
  const cv = canvas(128, 256);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#55575b';
  ctx.fillRect(0, 0, 128, 256);
  const img = ctx.getImageData(0, 0, 128, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 18;
    img.data[i] += v;
    img.data[i + 1] += v;
    img.data[i + 2] += v;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(240,240,235,0.9)';
  ctx.fillRect(4, 0, 4, 256);
  ctx.fillRect(120, 0, 4, 256);
  ctx.fillRect(61, 0, 6, 120);
  const t = toTexture(cv, true);
  t.wrapS = THREE.ClampToEdgeWrapping;
  cache.set('road', t);
  return t;
}

export function horseshoeSpriteTexture() {
  if (cache.has('glow')) return cache.get('glow');
  const cv = canvas(128, 128);
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,236,180,1)');
  g.addColorStop(0.3, 'rgba(255,214,120,0.45)');
  g.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = toTexture(cv);
  cache.set('glow', t);
  return t;
}

export function screenTexture() {
  if (cache.has('screen')) return cache.get('screen');
  const cv = canvas(1024, 512);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = PAPER;
  ctx.font = `500 32px ${FONT_MONO}`;
  ctx.fillText('CSI 5★ DEAUVELLE — GRAND PRIX', 60, 90);
  ctx.font = `700 120px ${FONT_DISPLAY}`;
  ctx.fillText('LIVE', 60, 250);
  ctx.fillStyle = '#e8473f';
  ctx.beginPath();
  ctx.arc(300, 210, 18, 0, Math.PI * 2);
  ctx.fill();
  drawLogo(ctx, 56, 330, 130, PAPER);
  const t = toTexture(cv);
  cache.set('screen', t);
  return t;
}
