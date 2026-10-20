// Textures générées (logo Strides, panneaux publicitaires, enseignes, bannières).
import * as THREE from 'three';

export const FONT_DISPLAY = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
export const FONT_UI = 'Inter, -apple-system, "Helvetica Neue", Arial, sans-serif';
const INK = '#141517';
const PAPER = '#f4f3ef';

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

// Marque Strides : trois barres obliques (le mouvement) + logotype espacé.
export function drawStridesMark(ctx, x, y, h, color) {
  ctx.save();
  ctx.fillStyle = color;
  const w = h * 0.22;
  const skew = h * 0.42;
  for (let i = 0; i < 3; i++) {
    const bx = x + i * w * 1.55;
    const bh = h * (0.55 + i * 0.225);
    const by = y + (h - bh);
    ctx.beginPath();
    ctx.moveTo(bx + skew * (bh / h), by);
    ctx.lineTo(bx + skew * (bh / h) + w, by);
    ctx.lineTo(bx + w, y + h);
    ctx.lineTo(bx, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return w * 1.55 * 3 + skew;
}

export function drawWordmark(ctx, x, y, h, color, { mark = true, spacing = 0.18 } = {}) {
  let cx = x;
  if (mark) cx += drawStridesMark(ctx, x, y, h, color) + h * 0.35;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `800 ${h * 1.12}px ${FONT_DISPLAY}`;
  ctx.textBaseline = 'alphabetic';
  const letters = 'STRIDES';
  for (const ch of letters) {
    ctx.fillText(ch, cx, y + h);
    cx += ctx.measureText(ch).width + h * spacing;
  }
  ctx.restore();
  return cx - x;
}

export function logoTexture(dark = true) {
  const key = `logo${dark}`;
  if (cache.has(key)) return cache.get(key);
  const cv = canvas(1024, 256);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = dark ? INK : PAPER;
  ctx.fillRect(0, 0, 1024, 256);
  const fg = dark ? PAPER : INK;
  const w = drawWordmark(ctx, 0, 0, 120, fg, { mark: true });
  // Re-centre.
  const img = ctx.getImageData(0, 0, 1024, 256);
  ctx.fillRect(0, 0, 1024, 256);
  ctx.putImageData(img, (1024 - w) / 2, 68);
  const t = toTexture(cv);
  cache.set(key, t);
  return t;
}

const ADS = [
  { title: 'LE BON PRO.\nEN QUELQUES MINUTES.', sub: 'Grooms, cavaliers, maréchaux, vétérinaires — vérifiés.', tag: 'JOBS & SERVICES' },
  { title: 'VOTRE CHEVAL VOYAGE.\nVOUS SUIVEZ TOUT.', sub: 'Transport équin entre pros, suivi en temps réel.', tag: 'TRANSPORT' },
  { title: 'CONCOURS. VENTES.\nFORMATIONS.', sub: 'Tous les événements équestres au même endroit.', tag: 'ÉVÉNEMENTS' },
  { title: 'LA PLATEFORME\nDES PROS DU CHEVAL.', sub: 'Jobs · Écuries · Transport · Événements · Annuaire', tag: 'STRIDES' },
  { title: 'TROUVEZ L’ÉCURIE\nQUI VOUS RESSEMBLE.', sub: 'Pensions, services, avis vérifiés.', tag: 'ÉCURIES' },
];
export const AD_COUNT = ADS.length;

export function adTexture(i) {
  const key = `ad${i}`;
  if (cache.has(key)) return cache.get(key);
  const ad = ADS[i % ADS.length];
  const W = 1024, H = 512;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#16171a');
  g.addColorStop(1, '#0d0e10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Lignes de vitesse.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 18;
  for (let k = 0; k < 9; k++) {
    ctx.beginPath();
    ctx.moveTo(560 + k * 60, H);
    ctx.lineTo(760 + k * 60, 0);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 26px ${FONT_UI}`;
  ctx.fillText(ad.tag, 64, 92);
  ctx.fillStyle = PAPER;
  ctx.font = `italic 800 84px ${FONT_DISPLAY}`;
  ad.title.split('\n').forEach((l, k) => ctx.fillText(l, 60, 196 + k * 84));
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `500 28px ${FONT_UI}`;
  ctx.fillText(ad.sub, 64, 400);
  drawWordmark(ctx, 64, 432, 40, PAPER, { mark: true });
  ctx.fillStyle = PAPER;
  ctx.fillRect(W - 300, 430, 236, 48);
  ctx.fillStyle = INK;
  ctx.font = `700 22px ${FONT_UI}`;
  ctx.fillText('TÉLÉCHARGER L’APP', W - 284, 462);
  const t = toTexture(cv);
  cache.set(key, t);
  return t;
}

export function signTexture(title, sub = '', { dark = true, w = 1024, h = 256, mark = false } = {}) {
  const key = `sign:${title}:${sub}:${dark}:${w}x${h}:${mark}`;
  if (cache.has(key)) return cache.get(key);
  const cv = canvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = dark ? '#17181b' : PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = h * 0.03;
  ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  ctx.fillStyle = dark ? PAPER : INK;
  ctx.textAlign = 'center';
  const ts = sub ? h * 0.36 : h * 0.46;
  ctx.font = `800 ${ts}px ${FONT_DISPLAY}`;
  let size = ts;
  while (ctx.measureText(title).width > w * 0.86 && size > 10) {
    size *= 0.92;
    ctx.font = `800 ${size}px ${FONT_DISPLAY}`;
  }
  ctx.fillText(title, w / 2, sub ? h * 0.5 : h * 0.64);
  if (sub) {
    ctx.font = `500 ${h * 0.16}px ${FONT_UI}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText(sub, w / 2, h * 0.78);
  }
  if (mark) {
    ctx.globalAlpha = 1;
    drawStridesMark(ctx, h * 0.15, h * 0.3, h * 0.4, dark ? PAPER : INK);
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
  drawWordmark(ctx, 40, 28, 70, PAPER);
  ctx.fillStyle = PAPER;
  ctx.fillRect(520, 0, 504, 128);
  ctx.fillStyle = INK;
  ctx.font = `italic 800 64px ${FONT_DISPLAY}`;
  ctx.fillText('JOBS · TRANSPORT · ÉVÉNEMENTS', 548, 88);
  const t = toTexture(cv, true);
  cache.set('banner', t);
  return t;
}

export function truckTexture() {
  if (cache.has('truck')) return cache.get('truck');
  const cv = canvas(1024, 512);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f2f1ed';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 400, 1024, 112);
  // Bandes de vitesse.
  ctx.fillStyle = '#1d1e21';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(700 + k * 70, 400);
    ctx.lineTo(820 + k * 70, 120);
    ctx.lineTo(850 + k * 70, 120);
    ctx.lineTo(730 + k * 70, 400);
    ctx.fill();
  }
  drawWordmark(ctx, 60, 170, 110, INK);
  ctx.font = `600 34px ${FONT_UI}`;
  ctx.fillStyle = '#3a3b3f';
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
  ctx.fillStyle = '#0f1012';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = PAPER;
  ctx.font = `600 34px ${FONT_UI}`;
  ctx.fillText('CSI 5★ DEAUVELLE — GRAND PRIX', 60, 90);
  ctx.font = `italic 800 120px ${FONT_DISPLAY}`;
  ctx.fillText('LIVE', 60, 250);
  ctx.fillStyle = '#e8473f';
  ctx.beginPath();
  ctx.arc(300, 210, 18, 0, Math.PI * 2);
  ctx.fill();
  drawWordmark(ctx, 60, 360, 80, PAPER);
  const t = toTexture(cv);
  cache.set('screen', t);
  return t;
}
