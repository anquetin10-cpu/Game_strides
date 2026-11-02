// Logo officiel Strides : le fichier d'origine de la marque (src/assets/partners/strides/, référencé par
// src/partners/partners.js), jamais redessiné, recomposé ni déformé. Point d'entrée unique du logo dans le jeu :
//   - interface (HTML) : logoImg() / markImg() affichent le fichier tel quel (noir sur transparent) ; logoMask() /
//     markMask() le recolorent d'une seule teinte (currentColor) par un masque CSS — même géométrie, seul l'aplat change ;
//   - textures du monde (canvas 2D) : drawLogo(), une fois les images chargées (loadBrandImages(), attendu au démarrage
//     avant la construction du monde) ;
//   - proportions du fichier : LOGO_FULL (1247 × 355) et LOGO_MARK (248 × 355 : le « S » à tête de cheval, découpe exacte
//     du même fichier). La largeur se déduit toujours de la hauteur : jamais d'étirement.
// Strides est la plateforme réelle intégrée au téléphone du personnage ; le jeu, lui, s'appelle Equestrian Tour.
import { BRANDS } from '../partners/partners.js';

const ASSETS = BRANDS.strides.assets;
export const LOGO_FULL = { w: 1247, h: 355, src: ASSETS.logoFull };
export const LOGO_MARK = { w: 248, h: 355, src: ASSETS.mark };
export const LOGO_ASPECT = LOGO_FULL.w / LOGO_FULL.h;
export const MARK_ASPECT = LOGO_MARK.w / LOGO_MARK.h;

// Adresse absolue (le masque CSS est déclaré sur la racine du document : pas d'ambiguïté de chemin relatif).
const abs = (src) => {
  try {
    return new URL(src, document.baseURI).href;
  } catch {
    return src;
  }
};
if (typeof document !== 'undefined') {
  const s = document.documentElement.style;
  s.setProperty('--strides-logo', `url("${abs(LOGO_FULL.src)}")`);
  s.setProperty('--strides-mark', `url("${abs(LOGO_MARK.src)}")`);
}

// ---------- Interface ----------
// Fichier tel quel (noir) : fonds clairs. La hauteur est fixée par la feuille de style, la largeur suit le fichier.
const img = (l, cls) => `<img class="st-logo ${cls}" src="${l.src}" width="${l.w}" height="${l.h}" alt="Strides" draggable="false">`;
export const logoImg = () => img(LOGO_FULL, 'st-logo-full');
export const markImg = () => img(LOGO_MARK, 'st-logo-mark');
// Recoloré en currentColor (fonds sombres, icônes) : masque CSS du même fichier, proportions du fichier.
export const logoMask = () => '<i class="st-logo st-logo-full st-mask" role="img" aria-label="Strides"></i>';
export const markMask = () => '<i class="st-logo st-logo-mark st-mask" role="img" aria-label="Strides"></i>';

// ---------- Canvas (textures du monde, carte) ----------
const images = { full: null, mark: null };
let loading = null;
let warned = false;

// Précharge les deux fichiers (une seule fois). Ne rejette jamais : un fichier illisible laisse l'emplacement neutre.
export function loadBrandImages(timeoutMs = 15000) {
  if (loading) return loading;
  if (typeof Image === 'undefined') return (loading = Promise.resolve(false));
  const load = (src) =>
    new Promise((done) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => done(im);
      im.onerror = () => {
        console.warn(`[logo] fichier officiel Strides illisible : ${String(src).slice(0, 80)}`);
        done(null);
      };
      im.src = src;
    });
  const both = Promise.all([load(LOGO_FULL.src), load(LOGO_MARK.src)]).then(([full, mark]) => {
    images.full = full;
    images.mark = mark;
    return !!(full && mark);
  });
  const late = new Promise((done) => setTimeout(() => done(false), timeoutMs));
  loading = Promise.race([both, late]);
  return loading;
}
export const brandImagesReady = () => !!(images.full && images.mark);

// Versions recolorées (une teinte unie, alpha d'origine) et réduites par moitiés successives pour un rendu net à
// petite taille ; cache par fichier et par couleur.
const tinted = new Map();
function levels(which, color) {
  const key = `${which}|${color}`;
  let lv = tinted.get(key);
  if (lv) return lv;
  const im = images[which];
  const l = which === 'mark' ? LOGO_MARK : LOGO_FULL;
  const c = document.createElement('canvas');
  c.width = l.w;
  c.height = l.h;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0, l.w, l.h);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, l.w, l.h);
  lv = [c];
  let prev = c;
  while (prev.height > 24) {
    const n = document.createElement('canvas');
    n.width = Math.max(1, Math.round(prev.width / 2));
    n.height = Math.max(1, Math.round(prev.height / 2));
    const nx = n.getContext('2d');
    nx.imageSmoothingEnabled = true;
    nx.imageSmoothingQuality = 'high';
    nx.drawImage(prev, 0, 0, n.width, n.height);
    lv.push(n);
    prev = n;
  }
  tinted.set(key, lv);
  return lv;
}

// Dessine le logo officiel (complet, ou le monogramme si mark) recoloré en `color`, coin haut-gauche (x, y), hauteur h,
// largeur déduite des proportions du fichier ; renvoie la largeur. Fichier non chargé : rien n'est dessiné (habillage
// neutre, jamais un logo de substitution) et un avertissement est noté une fois.
export function drawLogo(ctx, x, y, h, color, mark = false) {
  const which = mark ? 'mark' : 'full';
  const l = mark ? LOGO_MARK : LOGO_FULL;
  const w = (h * l.w) / l.h;
  if (!images[which]) {
    if (!warned) {
      warned = true;
      console.warn('[logo] logo officiel Strides non chargé : emplacement laissé neutre');
    }
    return w;
  }
  const lv = levels(which, color);
  // Hauteur réelle en pixels du canevas (transformation courante) : niveau juste au-dessus, puis réduction finale.
  const m = ctx.getTransform ? ctx.getTransform() : null;
  const k = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1 : 1;
  const target = h * k;
  let src = lv[0];
  for (const c of lv) if (c.height >= target) src = c;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h);
  ctx.restore();
  return w;
}
