// Textures générées (logo Strides, panneaux publicitaires, enseignes, bannières) — design system STRIDES.
import * as THREE from 'three';
import { drawLogo, LOGO_FULL } from '../ui/logo.js';

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

export function truckTexture() {
  if (cache.has('truck')) return cache.get('truck');
  const cv = canvas(1024, 512);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 400, 1024, 112);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 388, 1024, 12);
  drawLogo(ctx, 56, 90, 200, INK);
  ctx.font = `500 30px ${FONT_MONO}`;
  ctx.fillStyle = '#46443e';
  ctx.fillText('TRANSPORT DE CHEVAUX · RÉSERVEZ SUR L’APP', 64, 350);
  const t = toTexture(cv);
  cache.set('truck', t);
  return t;
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
