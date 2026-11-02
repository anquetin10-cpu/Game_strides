// Boutique d'équitation de Deauville City : textures de l'habillage de marque (bandeau, enseigne drapeau, vitrines,
// panneaux de l'intérieur). Règles et ressources : voir storeSkin.js. Les images officielles sont chargées à part : la
// version texte est dessinée d'abord, l'image officielle la remplace dès qu'elle est chargée (image illisible : la
// version texte reste).
import * as THREE from 'three';
import { storeSkin } from './storeSkin.js';
import { fasciaTexture } from './textures.js';
import { t } from '../core/i18n.js';

export { storeSkin, STORE_BRAND } from './storeSkin.js';

const SERIF = 'Georgia, "Times New Roman", serif';

const cache = new Map();
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function toTex(cv) {
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}
// Image officielle dessinée dans le rectangle (x, y, w, h), centrée, à ses proportions (contenue).
function fit(ctx, img, x, y, w, h) {
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k, dh = img.height * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
// Charge une ressource officielle puis redessine la texture (draw(ctx, img)).
function withImage(url, tex, draw) {
  if (!url || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    draw(tex.image.getContext('2d'), img);
    tex.needsUpdate = true;
  };
  img.onerror = () => console.warn('[boutique] ressource officielle illisible', url);
  img.src = url;
}

// Fer à cheval (pictogramme générique du métier), ouverture vers le haut ; (cx, cy) centre, r rayon.
// bg : couleur du fond (étampures).
function horseshoe(ctx, cx, cy, r, color, bg) {
  ctx.save();
  ctx.fillStyle = color;
  // Branches montant au-dessus du centre (canevas : y vers le bas, angles dans le sens horaire).
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 1.12, -Math.PI * 0.12, true);
  ctx.arc(cx, cy, r * 0.6, -Math.PI * 0.12, Math.PI * 1.12, false);
  ctx.closePath();
  ctx.fill();
  // Éponges (bouts des branches).
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * r * 0.8, cy - r * 0.32, r * 0.22, r * 0.09, s * -0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  // Étampures (trous des clous) le long des branches.
  ctx.fillStyle = bg;
  for (const a of [0.1, 0.22, 0.34, 0.66, 0.78, 0.9, -0.04, 1.04]) {
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a * Math.PI) * r * 0.8, cy + Math.sin(a * Math.PI) * r * 0.8, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Bandeau de la devanture : lettres peintes (nom neutre ou officiel) ; logo officiel s'il est fourni.
export function storeFascia(spec, skin = storeSkin()) {
  if (!skin.logo) return fasciaTexture(skin.name, skin.sub, spec.front, spec.letters);
  const key = `fascia:${skin.logo}:${spec.front}`;
  if (cache.has(key)) return cache.get(key);
  // Version texte (nom officiel) tant que le logo n'est pas chargé.
  const base = fasciaTexture(skin.name, skin.sub, spec.front, spec.letters);
  const cv = canvas(2048, 256);
  const tex = toTex(cv);
  const ctx = cv.getContext('2d');
  const paintBase = () => {
    ctx.fillStyle = spec.front;
    ctx.fillRect(0, 0, 2048, 256);
    ctx.strokeStyle = spec.letters;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, 2004, 212);
    ctx.globalAlpha = 1;
  };
  ctx.drawImage(base.image, 0, 0, 2048, 256);
  withImage(skin.logo, tex, (c, img) => {
    paintBase();
    fit(c, img, 160, 44, 1728, 168);
  });
  cache.set(key, tex);
  return tex;
}

// Enseigne drapeau (médaillon) : fer à cheval générique ; logo officiel s'il est fourni.
export function storeBlade(spec, skin = storeSkin()) {
  const key = `blade:${skin.logo || 'neutre'}:${spec.front}:${spec.letters}`;
  if (cache.has(key)) return cache.get(key);
  const cv = canvas(256, 256);
  const ctx = cv.getContext('2d');
  const disc = () => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = spec.front;
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = spec.letters;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
  };
  disc();
  horseshoe(ctx, 128, 142, 64, spec.letters, spec.front);
  const tex = toTex(cv);
  withImage(skin.logo, tex, (c, img) => {
    disc();
    c.save();
    c.beginPath();
    c.arc(128, 128, 100, 0, Math.PI * 2);
    c.clip();
    fit(c, img, 52, 52, 152, 152);
    c.restore();
  });
  cache.set(key, tex);
  return tex;
}

// Lettrage des vitrines et de la porte (vitrophanie, fond transparent) : kind 'win0', 'win1' (vitrines gauche et
// droite), 'door'. Neutre : textes génériques du métier ; autorisé : logo officiel au-dessus du texte.
const DECAL_PX = { win: [1024, 256], door: [512, 192] };
export function storeDecal(kind, spec, skin = storeSkin()) {
  const key = `decal:${kind}:${skin.logo || 'neutre'}:${skin.name}`;
  if (cache.has(key)) return cache.get(key);
  const door = kind === 'door';
  const [W, H] = DECAL_PX[door ? 'door' : 'win'];
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  const lines = door
    ? [skin.name, t('Ouvert · 10 h – 19 h')]
    : kind === 'win0'
      ? [t('Tenues d’équitation'), t('Vestes de concours · Pantalons · Polos · Gants')]
      : [t('Équipement du cheval'), t('Tapis · Bonnets · Guêtres')];
  const ink = spec.decalInk || '#f1e6c8';
  const text = (withLogo) => {
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    const big = door ? 40 : 72, small = door ? 26 : 34;
    let s = big;
    ctx.font = `600 ${s}px ${SERIF}`;
    const spaced = lines[0].toUpperCase();
    while (ctx.measureText(spaced).width > W * 0.92 && s > 18) ctx.font = `600 ${(s *= 0.94)}px ${SERIF}`;
    const y0 = withLogo ? H * 0.72 : H * 0.4;
    if (!withLogo) ctx.fillText(spaced, W / 2, y0);
    ctx.font = `italic 400 ${small}px ${SERIF}`;
    ctx.globalAlpha = 0.92;
    ctx.fillText(lines[1], W / 2, withLogo ? H * 0.86 : H * 0.76);
    ctx.globalAlpha = 1;
    // Filet fin sous le titre.
    if (!withLogo) ctx.fillRect(W * 0.38, H * 0.585, W * 0.24, 2);
  };
  text(false);
  const tex = toTex(cv);
  withImage(skin.logo, tex, (c, img) => {
    text(true);
    fit(c, img, W * 0.18, H * 0.06, W * 0.64, H * 0.56);
  });
  cache.set(key, tex);
  return tex;
}

// Panneaux de l'intérieur : 'brand' (bandeau rétroéclairé derrière le comptoir : nom ou logo officiel) et 'poster'
// (caisson lumineux : visuel de vitrine officiel s'il est fourni, sinon affiche neutre du métier).
export function storeSignTexture(kind, spec, skin = storeSkin()) {
  const key = `sign:${kind}:${skin.logo || ''}:${skin.storefront || ''}:${skin.name}`;
  if (cache.has(key)) return cache.get(key);
  const poster = kind === 'poster';
  const [W, H] = poster ? [512, 740] : [1024, 256];
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  const bg = spec.panel || '#232427', ink = spec.letters || '#e2cfa2';
  const neutral = () => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (poster) {
      horseshoe(ctx, W / 2, H * 0.34, 92, ink, bg);
      ctx.font = `600 50px ${SERIF}`;
      ctx.fillText(t('Tenues de concours'), W / 2, H * 0.6);
      ctx.font = `italic 400 28px ${SERIF}`;
      ctx.fillText(t('Vestes · Pantalons blancs · Gants'), W / 2, H * 0.69);
      ctx.font = `400 24px ${SERIF}`;
      ctx.globalAlpha = 0.8;
      ctx.fillText(t('Cabine d’essayage au fond du magasin'), W / 2, H * 0.86);
      ctx.globalAlpha = 1;
    } else {
      let s = 92;
      ctx.font = `600 ${s}px ${SERIF}`;
      const name = skin.name.toUpperCase();
      while (ctx.measureText(name).width > W * 0.88 && s > 30) ctx.font = `600 ${(s *= 0.94)}px ${SERIF}`;
      ctx.fillText(name, W / 2, H * 0.42);
      ctx.font = `italic 400 34px ${SERIF}`;
      ctx.fillText(skin.sub, W / 2, H * 0.76);
    }
  };
  neutral();
  const tex = toTex(cv);
  const url = poster ? skin.storefront : skin.logo;
  withImage(url, tex, (c, img) => {
    c.fillStyle = poster ? '#111214' : bg;
    c.fillRect(0, 0, W, H);
    if (poster) fit(c, img, 0, 0, W, H);
    else fit(c, img, W * 0.08, H * 0.12, W * 0.84, H * 0.76);
  });
  cache.set(key, tex);
  return tex;
}

// Vitrophanie : plan transparent (lettrage sur le verre), vu de la rue.
export function decalMesh(tex, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false, roughness: 0.5 }));
  m.renderOrder = 4;
  return m;
}

let FRAME_MAT = null; // cadre des panneaux (partagé : jamais libéré avec l'intérieur)
// Panneau d'intérieur (repère du commerce) : rétroéclairé (indépendant de l'éclairage de la pièce), cadre sombre.
export function storeSignMesh(sg, spec) {
  const g = new THREE.Group();
  const tex = storeSignTexture(sg.kind, spec);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.92, 0.92, 0.92) }));
  face.position.z = 0.032;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(sg.w + 0.08, sg.h + 0.08, 0.06), (FRAME_MAT ||= new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.5 })));
  g.add(frame, face);
  g.position.set(sg.x, sg.y, sg.z);
  g.rotation.y = sg.ry || 0;
  return g;
}
