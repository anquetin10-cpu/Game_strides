// Primitives de décor : bâtiments, clôtures, haies, arbres, mobilier.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, cone, ico, gableRoof, hipRoof, paint, transformed, prep, limb } from './shapes.js';

export const PALETTE = {
  walls: ['#efe6d2', '#ebe0cc', '#f3eee4', '#e3d3bb', '#d8c0a0'],
  brick: ['#b9765a', '#a86a50', '#c08060'],
  roofs: ['#4a4f57', '#565a61', '#5d4a42', '#7d5242'],
  timber: '#4a3427',
  ink: '#1b1c1f',
  white: '#f2f1ec',
  wood: '#9b7650',
  darkWood: '#5b4330',
  glass: '#2d3c4b',
  glassLit: '#3a4a5a',
};

// Vitrage avec coordonnées locales de fenêtre (attribut « win » : u, v centrés, largeur, hauteur) pour
// l'effet de pièce intérieure. Largeur négative : ouverture de box (sans vitre) ; nulle : sans intérieur.
export function winBox(w, h, d, kind = 1) {
  const g = box(w, h, d);
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const a = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    // Face -z tournée vers l'extérieur (fenêtres arrière, dos des baies) : u inversé pour suivre le repère
    // horizontal de la face vu de dehors (sinon la pièce simulée est vue en miroir).
    a[i * 4] = pos.getX(i) * (nrm.getZ(i) < -0.5 ? -1 : 1);
    a[i * 4 + 1] = pos.getY(i) - h / 2;
    a[i * 4 + 2] = kind ? w * kind : 0;
    a[i * 4 + 3] = kind ? h : 0;
  }
  g.setAttribute('win', new THREE.BufferAttribute(a, 4));
  return g;
}
// Ajoute un attribut « win » nul aux vitrages qui n'en ont pas (fusion possible avec les autres).
export function ensureWin(g) {
  if (g && !g.attributes.win) g.setAttribute('win', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4));
  return g;
}

// Part = [geometry, color, transform]
// Couleur null : la pièce garde ses couleurs de sommets (déjà peinte).
function partsToGeo(parts) {
  const geos = [];
  for (const [g, color, tf] of parts) {
    const t = tf ? transformed(g, tf) : g.clone();
    if (color !== null) paint(t, color);
    geos.push(t);
  }
  return mergeGeometries(geos, false);
}

// Pièce plaquée contre un mur (face locale -z côté mur) : sans sa face arrière, toujours cachée ou vue de dos.
function flatBox(w, h, d) {
  const g = box(w, h, d);
  g.setIndex(Array.from(g.index.array.subarray(0, 30)));
  g.clearGroups();
  return g;
}

// Repère de colombage pour le shader de surfaces : magenta codé (rouge = remplissage ou poutre, bleu = teinte des bois).
// Remplissage 0 enduit crème, 1 enduit blanc, 2 ocre, 3 briques en épi ; 5 + bois = pièce de bois pleine.
// Bois : 0 chêne brun, 1 vert-de-gris peint, 2 sang-de-bœuf.
export function colombage(fill = 0, wood = 0) {
  const hx = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hx(1 - fill * 0.1)}00${hx(1 - wood * 0.1)}`;
}

// Toit à deux pans sans pignons (les pignons sont des murs, posés à part) : faîtage selon x.
// Sous-face incluse (débords de toit visibles d'en bas) quand under est donné.
function roofSlopes(w, h, d, ov) {
  const hw = w / 2 + ov, hd = d / 2 + ov;
  const v = [-hw, 0, -hd, hw, 0, -hd, hw, h, 0, -hw, h, 0, -hw, 0, hd, hw, 0, hd, hw, h, 0, -hw, h, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  return g;
}
// Copie retournée d'une géométrie (sous-face des toits).
function flipped(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = p[i + 3 + k];
      p[i + 3 + k] = p[i + 6 + k];
      p[i + 6 + k] = t;
    }
  }
  g.computeVertexNormals();
  return prep(g);
}
// Murs pignons triangulaires aux deux bouts d'un toit à deux pans (faîtage selon x).
function gableWalls(w, h, d) {
  const hw = w / 2, hd = d / 2;
  const v = [-hw, 0, -hd, -hw, h, 0, -hw, 0, hd, hw, 0, -hd, hw, 0, hd, hw, h, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 2, 1, 3, 5, 4]);
  g.computeVertexNormals();
  return g;
}
// Toit à deux pans complet posé sur des murs de largeur d (égout au ras du haut des murs) :
// pans, sous-faces des débords et pignons maçonnés. Faîtage selon x, transformation tf (y = haut des murs).
function pitchedRoof(parts, w, rise, d, ov, roofC, wallC, soffitC, tf) {
  const drop = (rise * ov) / (d / 2 + ov);
  const slopes = roofSlopes(w, rise, d, ov);
  parts.push([slopes, roofC, { ...tf, y: tf.y - drop }]);
  parts.push([flipped(slopes), soffitC, { ...tf, y: tf.y - drop - 0.04 }]);
  parts.push([gableWalls(w, rise - drop, d), wallC, tf]);
}

/**
 * Bâtiment générique, façade principale vers +Z (local).
 * Maisons à colombage du Pays d'Auge (poteaux serrés dessinés par le shader, sablières, poteaux d'angle,
 * guettes, étage en encorbellement), pignons maçonnés, lucarnes, avant-corps à pignon sur les longues façades,
 * gouttières et descentes, cheminées à mitrons.
 * Retourne { body, glass, shutters, detail } (géométries locales peintes) ; volets et détails sans ombre portée visible
 * (voir StaticBatch) : les volets toujours dessinés, les détails (menuiseries, gouttières, mitrons) seulement de près ;
 * et bays : emprises locales des avant-corps [x, z, demi-largeur, demi-profondeur].
 */
export function buildingGeo({
  w, d, h, wall = PALETTE.walls[0], roof = PALETTE.roofs[0], roofType = 'gable', roofH = null,
  timber = false, floors = null, windows = true, door = true, doorColor = '#3b2f28', plinth = '#8f8a80', trim = null, chimney = false,
  fill = null, wood = null, dormers = true, bays = true,
}) {
  const body = [];
  const glass = [];
  const bayRects = [];
  const detail = [];
  const shut = [];
  const fl = floors ?? Math.max(1, Math.floor(h / 3));
  const hsh = (k) => {
    const s = Math.sin(w * 12.9898 + d * 78.233 + k * 4.137) * 43758.5453;
    return s - Math.floor(s);
  };
  // Volets typiques de la côte normande (couleur stable pour un même bâtiment).
  const SHUTTERS = ['#5d7480', '#7d8b6a', '#e9e6de', '#4a5560', '#8c6d55', '#6f8fa0'];
  const shutter = SHUTTERS[Math.floor(Math.abs(Math.sin(w * 12.9898 + d * 78.233) * 43758.5453)) % SHUTTERS.length];
  const isShop = !!(trim && trim.toLowerCase() === '#c8a96e');
  const woodT = wood ?? [0, 0, 0, 0, 0, 1, 2][Math.floor(hsh(2) * 7)];
  const wallC = timber ? colombage(fill ?? [0, 0, 0, 1, 1, 1, 2, 3][Math.floor(hsh(1) * 8)], woodT) : wall;
  const beamC = colombage(5 + woodT, woodT);
  const fh = h / fl;
  // Étage en encorbellement sur les maisons à pans de bois.
  const over = timber && fl > 1 ? 0.22 : 0;
  body.push([box(w, (over ? fh : h) + 2, d), wallC, { y: -2 }]);
  if (over) body.push([box(w + 2 * over, h - fh, d + 2 * over), wallC, { y: fh }]);
  body.push([box(w + 0.2, 2.6, d + 0.2), plinth, { y: -2 }]);
  const rh = roofH ?? Math.min(w, d) * 0.45;
  const along = w >= d;
  const L = along ? w : d, D = along ? d : w;
  const pitched = roofType === 'gable' || roofType === 'hip';
  const soffit = timber ? beamC : '#d8d3c8';
  const R = D / 2 + over + 0.45;
  // Abaissement de l'égout au bord du débord (le pan coupe le mur à la hauteur h).
  const drop = (rh * 0.45) / R;
  if (roofType === 'gable') pitchedRoof(body, L + 2 * over, rh, D + 2 * over, 0.45, roof, wallC, soffit, { y: h, ry: along ? 0 : Math.PI / 2 });
  else if (roofType === 'hip') {
    const hip = hipRoof(L + 2 * over, rh, D + 2 * over, 0.45);
    body.push([hip, roof, { y: h - drop, ry: along ? 0 : Math.PI / 2 }]);
    body.push([flipped(hip), soffit, { y: h - drop - 0.04, ry: along ? 0 : Math.PI / 2 }]);
  } else {
    body.push([box(w + 0.3, 0.5, d + 0.3), roof, { y: h }]);
  }
  if (trim) body.push([box(w + 0.15 + 2 * over, 0.25, d + 0.15 + 2 * over), trim, { y: h - 0.25 }]);
  if (chimney) {
    // Souche de cheminée en briques, couronnement et deux mitrons en terre cuite.
    const cx = w * 0.28, cz = -d * 0.12, ch = rh + 1.4;
    body.push([box(0.9, ch, 0.9), PALETTE.brick[0], { x: cx, y: h, z: cz }]);
    body.push([box(1.06, 0.14, 1.06), '#b9b4a8', { x: cx, y: h + ch, z: cz }]);
    for (const s of [-1, 1]) detail.push([cyl(0.09, 0.12, 0.42, 7), '#a0583c', { x: cx + s * 0.2, y: h + ch + 0.14, z: cz }]);
  }
  // Hauteur du pan long à une distance s en retrait du mur (le pan coupe le mur à la hauteur h).
  const roofY = (s) => h + (rh * s) / R;
  const facades = [
    { len: w, nx: 0, nz: 1, off: d / 2, ry: 0 },
    { len: w, nx: 0, nz: -1, off: d / 2, ry: Math.PI },
    { len: d, nx: 1, nz: 0, off: w / 2, ry: Math.PI / 2 },
    { len: d, nx: -1, nz: 0, off: w / 2, ry: -Math.PI / 2 },
  ];
  // Position locale d'un point de façade : t le long de la façade, k vers l'extérieur.
  const at = (f, t, k) => ({
    x: f.nx === 0 ? t * (f.nz > 0 ? 1 : -1) : f.nx * k,
    z: f.nz === 0 ? t * (f.nx > 0 ? -1 : 1) : f.nz * k,
  });
  facades.forEach((f, fi) => {
    const cols = Math.max(1, Math.floor(f.len / 3.4));
    const span = f.len / cols;
    const colT = (c) => -f.len / 2 + span * (c + 0.5);
    const isLong = pitched && (along ? fi < 2 : fi >= 2);
    // Avant-corps à pignon (longues façades) : deux travées qui avancent, coiffées d'un pignon.
    const bayCols = new Set();
    const proj = 0.8 + over;
    if (bays && isLong && f.len >= 20 && fl >= 2 && cols >= 6) {
      const bw = span * 2, rbh = bw * 0.5;
      const sb = ((rbh + 0.25) * R) / rh;
      const droof = proj + sb;
      const mid = (cols - 2) / 2;
      for (let k = 0; k < cols; k++) {
        for (const sgn of k ? [-1, 1] : [1]) {
          const c0 = Math.round(mid + sgn * k * 5);
          if (c0 < 0 || c0 + 1 >= cols || bayCols.has(c0) || bayCols.has(c0 + 1)) continue;
          const tb = (colT(c0) + colT(c0 + 1)) / 2;
          const limit = roofType === 'hip' ? f.len / 2 - droof - bw / 2 - 0.3 : f.len / 2 - bw / 2 - 0.4;
          if (Math.abs(tb) > limit || roofY(sb) > h + rh - 0.2) continue;
          bayCols.add(c0).add(c0 + 1);
          const bc = at(f, tb, f.off + proj / 2);
          bayRects.push([bc.x, bc.z, f.nx === 0 ? bw / 2 : proj / 2, f.nx === 0 ? proj / 2 : bw / 2]);
          body.push([box(bw, h + 2, proj), wallC, { ...bc, y: -2, ry: f.ry }]);
          pitchedRoof(body, droof, rbh, bw, 0.35, roof, wallC, soffit, { ...at(f, tb, f.off + proj - droof / 2), y: h, ry: f.ry + Math.PI / 2 });
          if (trim) body.push([box(bw + 0.1, 0.22, 0.12), trim, { ...at(f, tb, f.off + proj + 0.02), y: h - 0.22, ry: f.ry }]);
        }
        if (mid - k * 5 < 0 && mid + k * 5 > cols) break;
      }
    }
    for (let fl2 = 0; fl2 < fl; fl2++) {
      for (let c = 0; c < cols; c++) {
        const t = colT(c);
        const k0 = f.off + (bayCols.has(c) ? proj : fl2 > 0 ? over : 0);
        const isDoor = door && fi === 0 && fl2 === 0 && c === Math.floor(cols / 2);
        const wy = fl2 * fh + (isDoor ? 0 : fh * 0.32);
        const wh = isDoor ? Math.min(2.4, fh * 0.8) : Math.min(1.5, fh * 0.48);
        const ww = isDoor ? 1.5 : Math.min(1.2, span * 0.45);
        const tf = { ...at(f, t, k0 + 0.04), y: wy, ry: f.ry };
        const { x, z } = tf;
        if (isDoor) {
          // Porte d'entrée : vantail à panneaux, imposte vitrée, seuil en pierre.
          body.push([box(ww, wh, 0.14), doorColor, tf]);
          detail.push([flatBox(ww - 0.3, wh * 0.32, 0.03), doorColor, { ...tf, y: wy + wh * 0.12, z: z + f.nz * 0.08, x: x + f.nx * 0.08 }]);
          detail.push([flatBox(ww - 0.3, wh * 0.32, 0.03), doorColor, { ...tf, y: wy + wh * 0.52, z: z + f.nz * 0.08, x: x + f.nx * 0.08 }]);
          body.push([box(ww + 0.5, 0.12, 0.5), '#b9b4a8', { ...tf, y: -0.06 }]);
          body.push([box(ww + 0.3, 0.14, 0.18), trim || PALETTE.white, { ...tf, y: wy + wh }]);
        } else if (windows) {
          const tc = trim || PALETTE.white;
          // Fenêtre : dormant, appui saillant, petits bois (croisillons), volets battants sur les maisons maçonnées.
          // L'appui (saillant) porte une ombre ; dormant, petits bois et volets, plaqués au mur, n'en portent pas.
          detail.push([flatBox(ww + 0.2, wh + 0.2, 0.1), tc, { ...tf, y: wy - 0.1 }]);
          body.push([flatBox(ww + 0.36, 0.08, 0.26), timber ? beamC : '#c9c4b8', { ...tf, y: wy - 0.16 }]);
          const off = (kk) => ({ x: x + f.nx * kk, z: z + f.nz * kk });
          detail.push([flatBox(0.05, wh, 0.05), tc, { ...tf, ...off(0.07) }]);
          detail.push([flatBox(ww, 0.05, 0.05), tc, { ...tf, ...off(0.07), y: wy + wh * 0.62 }]);
          if (roofType !== 'flat' && !isShop && !timber) {
            const side = (kk) => (f.nx === 0 ? { x: x + kk * (f.nz > 0 ? 1 : -1), z: z + f.nz * 0.06 } : { x: x + f.nx * 0.06, z: z + kk * (f.nx > 0 ? -1 : 1) });
            for (const sd of [-1, 1]) shut.push([flatBox(ww * 0.52, wh + 0.12, 0.05), shutter, { ...tf, ...side(sd * (ww * 0.76 + 0.1)), y: wy - 0.06 }]);
          }
          glass.push([winBox(ww, wh, 0.16), PALETTE.glass, tf]);
        }
      }
      if (timber) {
        // Pans de bois : sablières à chaque niveau, poteaux d'angle et guettes (décharges) près des angles.
        const ko = f.off + (fl2 > 0 ? over : 0) + 0.05;
        const len = f.len + (fl2 > 0 ? 2 * over : 0);
        body.push([flatBox(len, 0.26, 0.13), beamC, { ...at(f, 0, ko), y: (fl2 + 1) * fh - 0.26, ry: f.ry }]);
        body.push([flatBox(len, 0.2, 0.13), beamC, { ...at(f, 0, ko), y: fl2 ? fl2 * fh : 0.5, ry: f.ry }]);
        // Lisses d'appui et de linteau au droit des fenêtres (grille du colombage), interrompues par la porte.
        const doorHere = door && fi === 0 && fl2 === 0;
        const td = colT(Math.floor(cols / 2));
        const rail = (y) => {
          if (!doorHere) return body.push([flatBox(len, 0.14, 0.12), beamC, { ...at(f, 0, ko), y, ry: f.ry }]);
          const a = -len / 2, b = td - 0.95, c2 = td + 0.95, e = len / 2;
          body.push([flatBox(b - a, 0.14, 0.12), beamC, { ...at(f, (a + b) / 2, ko), y, ry: f.ry }]);
          body.push([flatBox(e - c2, 0.14, 0.12), beamC, { ...at(f, (c2 + e) / 2, ko), y, ry: f.ry }]);
        };
        rail(fl2 * fh + fh * 0.32 - 0.24);
        rail(fl2 * fh + fh * 0.32 + Math.min(1.5, fh * 0.48) + 0.1);
        for (const sd of [-1, 1]) {
          body.push([flatBox(0.24, fh, 0.14), beamC, { ...at(f, sd * (len / 2 - 0.12), ko), y: fl2 * fh, ry: f.ry }]);
          // Guette : du pied du poteau d'angle vers l'intérieur (repère de façade : x local = t).
          const run = 0.55, bh = fh - 0.55;
          body.push([flatBox(0.15, Math.hypot(run, bh), 0.12), beamC, { ...at(f, sd * (len / 2 - 0.3), ko + 0.01), y: fl2 * fh + 0.27, ry: f.ry, rz: sd * Math.atan2(run, bh) }]);
        }
      }
    }
    if (!isLong) return;
    // Lucarnes à fronton dans le pan de toit, alignées sur une travée sur deux.
    if (dormers && rh > 2.6) {
      const dw = 1.5, dh = 1.55, dr = 0.75, s0 = 0.55;
      const y0 = roofY(s0) - 0.2;
      const dd = ((y0 + dh + dr + 0.15 - h) * R) / rh - s0;
      if (y0 + dh + dr < h + rh - 0.35 && dd > 0.3) {
        const mid = (cols - 1) / 2;
        for (let c = 0; c < cols; c++) {
          const rel = Math.abs(c - mid);
          if (Math.round(rel - (cols % 2 ? 0 : 0.5)) % 2 || bayCols.has(c)) continue;
          const t = colT(c);
          const limit = roofType === 'hip' ? f.len / 2 - s0 - dd - dw / 2 - 0.3 : f.len / 2 - dw / 2 - 0.6;
          if (Math.abs(t) > limit) continue;
          const kf = f.off + over - s0;
          body.push([box(dw, dh, dd), wallC, { ...at(f, t, kf - dd / 2), y: y0, ry: f.ry }]);
          pitchedRoof(body, dd, dr, dw, 0.15, roof, wallC, soffit, { ...at(f, t, kf - dd / 2), y: y0 + dh, ry: f.ry + Math.PI / 2 });
          const tc = trim || PALETTE.white;
          detail.push([flatBox(0.95, 1.12, 0.08), tc, { ...at(f, t, kf + 0.02), y: y0 + 0.22, ry: f.ry }]);
          glass.push([winBox(0.75, 0.92, 0.12), PALETTE.glass, { ...at(f, t, kf + 0.03), y: y0 + 0.32, ry: f.ry }]);
        }
      }
    }
    // Gouttière pendante en zinc sous le bord du débord, descentes le long du mur aux deux bouts et coudes jusqu'à la gouttière.
    if (!bayCols.size) {
      const zinc = '#8d9296';
      const yg = h - drop - 0.13, kg = f.off + over + 0.52, kp = f.off + over + 0.1;
      detail.push([box(f.len + 2 * over + 0.9, 0.13, 0.15), zinc, { ...at(f, 0, kg), y: yg, ry: f.ry }]);
      for (const sd of [-1, 1]) {
        const tp = sd * (f.len / 2 + over - 0.25);
        detail.push([box(0.09, yg - 0.3, 0.09), zinc, { ...at(f, tp, kp), y: 0, ry: f.ry }]);
        detail.push([box(0.09, Math.hypot(kg - kp, 0.3), 0.09), zinc, { ...at(f, tp, kp), y: yg - 0.3, ry: f.ry, rx: Math.atan2(kg - kp, 0.3) }]);
      }
    }
  });
  const geo = (list) => (list.length ? partsToGeo(list) : null);
  return { body: partsToGeo(body), glass: geo(glass), shutters: geo(shut), detail: geo(detail), bays: bayRects };
}

// Écurie : rangée de boxes ouvrant vers +Z.
// Bâtiment d'écurie (boxes extérieurs) : bardage, portes de box à deux vantaux (bas fermé, haut ouvert avec grille),
// plaques nominatives, auvent sur poteaux avec jambes de force, gouttières et descentes, lanterneaux d'aération.
export function stableGeo({ w, d, h = 4.2, boxes = 8, wall = '#26272b', trim = PALETTE.white, roof = '#3a3d42', door = '#3c3f45' }) {
  const parts = [];
  const glass = [];
  // Petites pièces (grilles, encadrements, ferrures, plaques, gouttières) : détails sans ombre, dessinés de près.
  const det = [];
  const zf = d / 2;
  parts.push([box(w, h + 2, d), wall, { y: -2 }]);
  parts.push([box(w + 0.2, 2.45, d + 0.2), '#8a877f', { y: -2 }]);
  // Toit avec débord formant auvent (sous-face visible d'en bas, 10 cm sous la couverture), rives et faîtage.
  const rise = d * 0.42;
  const roofG = gableRoof(w, rise, d, 1.6);
  parts.push([roofG, roof, { y: h }]);
  parts.push([flipped(roofG), roof, { y: h - 0.1 }]);
  parts.push([box(w + 3.3, 0.12, 0.2), '#2b2d31', { y: h + rise - 0.02 }]);
  parts.push([box(w + 0.1, 0.22, d + 0.1), trim, { y: h - 0.22 }]);
  // Gouttières demi-rondes ouvertes vers le haut (visibles des deux côtés) sous le bord du toit, et descentes.
  for (const side of [-1, 1]) {
    const g = prep(new THREE.CylinderGeometry(0.07, 0.07, w + 3.2, 8, 1, true, Math.PI, Math.PI).rotateZ(Math.PI / 2));
    const zg = side * (zf + 1.67);
    det.push([g, '#8b9096', { y: h - 0.11, z: zg }]);
    det.push([flipped(g), '#8b9096', { y: h - 0.11, z: zg }]);
    for (const sx of [-1, 1]) det.push([cyl(0.045, 0.045, h - 0.17, 6), '#8b9096', { x: sx * (w / 2 + 1.5), z: zg }]);
  }
  // Poteaux d'auvent jusque sous la couverture (hauteur du pan au droit de leur face extérieure).
  const postH = h + (rise * 0.07) / (zf + 1.6);
  const step = w / boxes;
  for (let i = 0; i < boxes; i++) {
    const x = -w / 2 + step * (i + 0.5);
    const dw = Math.min(1.25, step * 0.42);
    // Encadrement de porte.
    det.push([box(dw + 0.2, 0.1, 0.12), trim, { x, y: 2.3, z: zf + 0.06 }]);
    det.push([box(0.1, 2.3, 0.12), trim, { x: x - dw / 2 - 0.05, z: zf + 0.06 }]);
    det.push([box(0.1, 2.3, 0.12), trim, { x: x + dw / 2 + 0.05, z: zf + 0.06 }]);
    // Vantail bas en planches, renfort en Z, barre de pied en acier.
    parts.push([box(dw, 1.3, 0.06), door, { x, z: zf + 0.04 }]);
    det.push([box(dw - 0.1, 0.08, 0.03), trim, { x, y: 1.18, z: zf + 0.08 }]);
    det.push([box(dw - 0.1, 0.08, 0.03), trim, { x, y: 0.08, z: zf + 0.08 }]);
    det.push([box(Math.hypot(dw - 0.1, 1.0), 0.07, 0.03, false), trim, { x, y: 0.65, z: zf + 0.085, rz: Math.atan2(1.0, dw - 0.1) }]);
    det.push([box(dw, 0.12, 0.04), '#5b5f64', { x, y: 1.28, z: zf + 0.08 }]);
    // Ouverture haute (intérieur sombre) et grille de box.
    glass.push([winBox(dw, 0.98, 0.04, -1), '#0a0b0c', { x, y: 1.32, z: zf + 0.01 }]);
    for (let k = 1; k < 9; k++) det.push([cyl(0.011, 0.011, 0.95, 4), '#4a4d52', { x: x - dw / 2 + (dw / 9) * k, y: 1.33, z: zf + 0.05 }]);
    // Vantail haut ouvert, rabattu contre le mur.
    parts.push([box(0.05, 1.0, dw * 0.5), door, { x: x + dw / 2 + 0.16 + dw * 0.25, y: 1.32, z: zf + 0.05, ry: Math.PI / 2 }]);
    // Plaque nominative et applique.
    det.push([box(0.32, 0.12, 0.02), '#f2f1ec', { x, y: 2.45, z: zf + 0.13 }]);
    det.push([box(0.16, 0.22, 0.14), '#1d1e21', { x: x - step * 0.36, y: 2.55, z: zf + 0.07 }]);
    glass.push([winBox(0.12, 0.08, 0.08, 0), '#fff1c9', { x: x - step * 0.36, y: 2.5, z: zf + 0.11 }]);
    parts.push([box(0.14, h, 0.16), trim, { x: -w / 2 + step * i, y: 0, z: zf + 0.06 }]);
    // Poteaux d'auvent (un sur deux).
    if (i % 2 === 0) parts.push([box(0.16, postH, 0.16), trim, { x: -w / 2 + step * i, z: zf + 1.45 }]);
    // Fenêtre arrière avec cadre.
    det.push([box(1.12, 0.82, 0.08), trim, { x, y: 2.54, z: -zf - 0.03 }]);
    glass.push([winBox(1, 0.7, 0.12), PALETTE.glass, { x, y: 2.6, z: -zf - 0.05 }]);
    // Lanterneaux d'aération sur le faîtage.
    if (i % 3 === 1) {
      parts.push([box(0.9, 0.55, 0.9), wall, { x, y: h + d * 0.42 - 0.15 }]);
      for (let k = 0; k < 3; k++) det.push([box(0.94, 0.05, 0.94), trim, { x, y: h + d * 0.42 + 0.02 + k * 0.14 }]);
      parts.push([hipRoof(0.9, 0.35, 0.9, 0.12), roof, { x, y: h + d * 0.42 + 0.4 }]);
    }
  }
  parts.push([box(0.14, h, 0.16), trim, { x: w / 2, y: 0, z: zf + 0.06 }]);
  parts.push([box(0.16, postH, 0.16), trim, { x: w / 2, z: zf + 1.45 }]);
  // Dalle béton devant les boxes.
  parts.push([box(w + 1.2, 0.08, 2.0), '#a6a39b', { y: -0.04, z: zf + 1.0 }]);
  // eave / eaveY : débord du toit et hauteur de sa sous-face (pour que la caméra ne passe pas dans l'auvent).
  return { body: partsToGeo(parts), glass: partsToGeo(glass), detail: partsToGeo(det), eave: 1.6, eaveY: h - 0.1 };
}

export function shedGeo({ w, d, h = 5, roof = '#5a4a3f', post = PALETTE.darkWood, hay = true }) {
  const parts = [];
  const nx = Math.max(2, Math.round(w / 4));
  for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (w / nx) * i;
    parts.push([box(0.3, h, 0.3), post, { x, z: -d / 2 }]);
    parts.push([box(0.3, h, 0.3), post, { x, z: d / 2 }]);
  }
  parts.push([gableRoof(w, d * 0.35, d, 0.8), roof, { y: h }]);
  parts.push([box(w, h, 0.2), '#6d5440', { z: -d / 2 }]);
  if (hay) {
    for (let i = 0; i < 18; i++) {
      const x = -w / 2 + 1.6 + (i % 6) * ((w - 3) / 6);
      const y = Math.floor(i / 6) * 0.9;
      parts.push([box(1.8, 0.85, 1.1), i % 3 ? '#d9c27a' : '#cfb66a', { x, y, z: -d / 2 + 1.4 }]);
      parts.push([box(1.8, 0.85, 1.1), '#d4bc72', { x, y, z: -d / 2 + 2.6 }]);
    }
  }
  return partsToGeo(parts);
}

// Cylindre et cône sans fonds (faces toujours cachées : pied enterré, dessus sous le chapeau).
const openCyl = (rt, rb, h, seg) => prep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true).translate(0, h / 2, 0));
const openCone = (r, h, seg) => prep(new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, h / 2, 0));

// Clôture : poteaux + lisses entre deux points (coordonnées locales au sol, hauteurs données par getH).
export function fenceGeo(points, getH, { height = 1.15, rails = 2, color = PALETTE.white, post = null, spacing = 3, closed = false, board = false } = {}) {
  const geos = [];
  const pts = closed ? [...points, points[0]] : points;
  // Poteaux : ronds (bois traité) pour les lisses, carrés avec chapeau pour les pare-bottes de carrière.
  const postGeo = board
    ? mergeGeometries([box(0.12, height + 0.3, 0.12), transformed(box(0.16, 0.05, 0.16), { y: height + 0.3 })], false)
    : mergeGeometries([openCyl(0.065, 0.075, height + 0.3, 8), transformed(openCone(0.07, 0.06, 8), { y: height + 0.3 })], false);
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / spacing));
    const ang = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const y0 = getH(x0, z0);
      const y1 = getH(x1, z1);
      geos.push(paint(transformed(postGeo, { x: x0, y: y0 - 0.3, z: z0 }), post || color));
      const segLen = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
      const pitch = Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0));
      if (board) {
        // Pare-bottes plein (légèrement incliné vers l'extérieur) et lisse haute.
        const g = box(0.045, height * 0.55, segLen, false);
        geos.push(paint(transformed(g, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + height * 0.3, z: (z0 + z1) / 2, ry: ang, rx: -pitch, rz: 0.05 }), color));
        geos.push(paint(transformed(box(0.05, 0.12, segLen, false), { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + height * 0.92, z: (z0 + z1) / 2, ry: ang, rx: -pitch }), color));
      } else {
        for (let r = 0; r < rails; r++) {
          const ry = height * (0.45 + (0.5 * (r + 1)) / rails);
          const g = box(0.04, 0.14, segLen + 0.1, false);
          geos.push(paint(transformed(g, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + ry, z: (z0 + z1) / 2, ry: ang, rx: -pitch }), color));
        }
      }
    }
    if (s === pts.length - 2) {
      geos.push(paint(transformed(postGeo, { x: bx, y: getH(bx, bz) - 0.3, z: bz }), post || color));
    }
  }
  return mergeGeometries(geos, false);
}

// Lampadaire de style en fonte (vert sombre) : socle mouluré, fût cannelé, crosse à volute et lanterne hexagonale
// suspendue à 0,75 m du fût (la flaque de lumière au sol est calée dessous).
export function lampGeo() {
  const iron = '#1e2622';
  const scroll = new THREE.TorusGeometry(0.25, 0.022, 4, 8, Math.PI / 2);
  scroll.rotateZ(Math.PI / 2);
  prep(scroll);
  return {
    body: partsToGeo([
      [cyl(0.2, 0.24, 0.12, 8), iron],
      [cyl(0.13, 0.19, 0.55, 8), iron, { y: 0.12 }],
      [cyl(0.06, 0.085, 3.35, 8), iron, { y: 0.7 }],
      [box(0.75, 0.05, 0.05, false), iron, { x: 0.39, y: 4.08 }],
      [cyl(0.21, 0.21, 0.04, 6), iron, { x: 0.75, y: 3.94 }],
      [cone(0.21, 0.17, 6), iron, { x: 0.75, y: 3.98 }],
      [cyl(0.13, 0.06, 0.09, 6), iron, { x: 0.75, y: 3.46 }],
    ]),
    // Moulures, bagues, volute, tige et fleuron : trop fins pour une ombre visible, dessinés seulement de près.
    detail: partsToGeo([
      [cyl(0.17, 0.17, 0.06, 8), iron, { y: 0.66 }],
      [cyl(0.1, 0.1, 0.07, 8), iron, { y: 3.7 }],
      [ico(0.075, 0), iron, { y: 4.13 }],
      [scroll, iron, { x: 0.31, y: 3.83 }],
      [cyl(0.015, 0.015, 0.14, 4), iron, { x: 0.75, y: 3.96 }],
    ]),
    light: partsToGeo([[cyl(0.19, 0.13, 0.4, 6), '#fff1c9', { x: 0.75, y: 3.55 }]]),
  };
}

// Banc public : lattes de chêne (assise et dossier incliné), flancs et accoudoirs en fonte.
export function benchGeo() {
  const iron = '#1e2622', wood = PALETTE.wood;
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push([box(1.8, 0.035, 0.09), wood, { y: 0.44, z: 0.2 - i * 0.12 }]);
  for (let i = 0; i < 3; i++) parts.push([box(1.8, 0.09, 0.03), wood, { y: 0.58 + i * 0.13, z: -0.25 - i * 0.025, rx: -0.2 }]);
  for (const sx of [-0.78, 0.78]) {
    parts.push([box(0.05, 0.44, 0.06), iron, { x: sx, z: 0.2 }]);
    parts.push([box(0.05, 0.9, 0.06), iron, { x: sx, z: -0.24, rx: -0.12 }]);
    parts.push([box(0.05, 0.05, 0.52), iron, { x: sx, y: 0.41, z: -0.02 }]);
    parts.push([box(0.06, 0.04, 0.46), iron, { x: sx, y: 0.66, z: 0.0 }]);
    parts.push([box(0.04, 0.24, 0.04), iron, { x: sx, y: 0.43, z: 0.2 }]);
    parts.push([box(0.05, 0.03, 0.55), iron, { x: sx, y: 0.02, z: -0.02 }]);
  }
  return partsToGeo(parts);
}

// Parasol de plage : toile à huit panneaux légèrement creusée, lambrequins festonnés, mât à rotule (jusqu'au sommet de la toile), embout.
export function parasolGeo(c1, c2) {
  const parts = [[cyl(0.025, 0.03, 2.95, 6), '#f2f1ec'], [cyl(0.04, 0.04, 0.08, 6), '#b9b4a8', { y: 1.4 }], [ico(0.05, 0), '#f2f1ec', { y: 2.98 }]];
  const n = 8, R = 1.45;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const g = new THREE.BufferGeometry();
    // Panneau : sommet, milieu (creusé), bord ; deux triangles par anneau.
    const ring = (r, y, a) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const v = [
      ...ring(0, 2.95, 0), ...ring(R * 0.55, 2.72, a0), ...ring(R * 0.55, 2.72, a1),
      ...ring(R * 0.55, 2.72, a0), ...ring(R, 2.4, a0), ...ring(R, 2.4, a1),
      ...ring(R * 0.55, 2.72, a0), ...ring(R, 2.4, a1), ...ring(R * 0.55, 2.72, a1),
      // Lambrequin (bande verticale sous le bord).
      ...ring(R, 2.4, a0), ...ring(R, 2.26, a0), ...ring(R, 2.4, a1),
      ...ring(R, 2.4, a1), ...ring(R, 2.26, a0), ...ring(R, 2.26, a1),
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    const col = i % 2 ? c1 : c2;
    parts.push([prep(g), col]);
    const back = prep(g.clone().scale(1, 1, 1));
    const idx = back.index.array;
    for (let k = 0; k < idx.length; k += 3) {
      const t = idx[k + 1];
      idx[k + 1] = idx[k + 2];
      idx[k + 2] = t;
    }
    back.computeVertexNormals();
    parts.push([back, col, { y: -0.01 }]);
  }
  return partsToGeo(parts);
}

export function roundBaleGeo() {
  const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 10);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.75, 0);
  return partsToGeo([[prep(g), '#d7c27b']]);
}

// Obstacle de saut d'obstacles (montants + barres), largeur w, hauteur h.
// Chandeliers de CSO à ailes (montant intérieur, aile à lattes, pieds en croix, taquets métalliques),
// remplissage (planche ou bac à fleurs) et fanions : rouge à droite, blanc à gauche dans le sens du saut (+z).
export function showJumpGeo(w, h, colors = ['#f2f1ec', '#17181b'], oxer = false) {
  const parts = [];
  const [c0, c1] = colors;
  const postH = h + 0.75;
  const standard = (side, z) => {
    const x = side * (w / 2 + 0.07);
    // Montant intérieur peint, bandes de couleur.
    parts.push([box(0.09, postH, 0.09), c0, { x, z }]);
    for (let y = 0.25; y < postH - 0.2; y += 0.5) parts.push([box(0.095, 0.12, 0.095), c1, { x, y, z }]);
    // Pieds en croix.
    parts.push([box(0.6, 0.07, 0.08), c1, { x: x + side * 0.12, z }]);
    parts.push([box(0.08, 0.07, 0.7), c1, { x, z }]);
    // Aile : montant extérieur, lisse supérieure inclinée, lattes.
    const xo = x + side * 0.95;
    parts.push([box(0.08, postH * 0.72, 0.08), c0, { x: xo, z }]);
    const topY = postH - 0.12, outY = postH * 0.72;
    const len = Math.hypot(0.95, topY - outY);
    parts.push([box(len, 0.08, 0.07, false), c0, { x: x + side * 0.475, y: (topY + outY) / 2, z, rz: side * -Math.atan2(topY - outY, 0.95) }]);
    for (let k = 0; k < 4; k++) {
      const y = 0.18 + k * ((outY - 0.25) / 3.5);
      parts.push([box(0.95, 0.09, 0.035, false), k % 2 ? c1 : c0, { x: x + side * 0.475, y: y + 0.045, z }]);
    }
  };
  standard(-1, 0);
  standard(1, 0);
  if (oxer) {
    standard(-1, 1.2);
    standard(1, 1.2);
  }
  // Taquets (coupelles) sous chaque barre.
  for (const z of oxer ? [0, 1.2] : [0]) {
    for (const hh of z ? [h + 0.05] : [h, h * 0.62, h * 0.3]) {
      for (const side of [-1, 1]) parts.push([box(0.06, 0.05, 0.13), '#9ea3a8', { x: side * (w / 2 + 0.02), y: hh - 0.085, z }]);
    }
  }
  // Remplissage : planche peinte (vertical) ou bac de fleurs (oxer).
  if (!oxer) {
    parts.push([box(w - 0.1, 0.32, 0.04), c1, { y: 0.06, z: 0.02 }]);
    parts.push([box(w - 0.1, 0.05, 0.045), c0, { y: 0.22, z: 0.02 }]);
  } else {
    // Jardinière en bois : buis serrés et fleurs (géraniums, rudbeckias).
    parts.push([box(w * 0.85, 0.32, 0.45), '#6b5039', { y: 0, z: -0.45 }]);
    const n = Math.max(6, Math.floor(w * 4.5));
    for (let i = 0; i < n; i++) {
      const fx = -w * 0.41 + (i / (n - 1)) * w * 0.82;
      const fz = -0.45 + (((i * 7) % 5) - 2) * 0.05;
      parts.push([ico(0.11 + ((i * 3) % 4) * 0.012, 1), i % 2 ? '#2f4424' : '#34502a', { x: fx, y: 0.36, z: fz, sy: 0.75 }]);
      if (i % 2 === 0) parts.push([ico(0.035, 0), i % 6 === 0 ? '#e9c23c' : '#b3262b', { x: fx + 0.04, y: 0.45, z: fz + 0.03 }]);
      if (i % 3 === 1) parts.push([ico(0.03, 0), '#c42e35', { x: fx - 0.05, y: 0.44, z: fz - 0.06 }]);
    }
  }
  // Fanions (rouge à droite, blanc à gauche quand on saute vers +z).
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 0.07);
    parts.push([cyl(0.012, 0.012, 0.45, 4), '#d9d9d6', { x, y: postH }]);
    parts.push([box(0.01, 0.2, 0.26, false), side < 0 ? '#c62b2b' : '#f4f3ee', { x, y: postH + 0.32, z: 0.13 }]);
  }
  return partsToGeo(parts);
}

// Barre de 10 cm de diamètre, peinte en bandes de ~45 cm, embouts arrondis.
export function railGeo(w, colors = ['#f2f1ec', '#17181b']) {
  const parts = [];
  const n = Math.max(4, Math.round(w / 0.45));
  for (let i = 0; i < n; i++) {
    const g = new THREE.CylinderGeometry(0.05, 0.05, w / n, 14, 1, true);
    g.rotateZ(Math.PI / 2);
    parts.push([prep(g), colors[i % 2], { x: -w / 2 + (w / n) * (i + 0.5) }]);
  }
  for (const side of [-1, 1]) {
    const cap = new THREE.SphereGeometry(0.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.rotateZ(-side * Math.PI / 2);
    parts.push([prep(cap), colors[0], { x: side * w / 2 }]);
  }
  return partsToGeo(parts);
}

// Tronc de cross : écorce, cernes aux extrémités, chevalets.
export function logJumpGeo(w, h) {
  const r = h * 0.5;
  const g = new THREE.CylinderGeometry(r * 0.94, r, w, 18, 6);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + 0.035 * Math.sin(a * 9 + pos.getY(i) * 2.1) + 0.02 * Math.sin(a * 23);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.rotateZ(Math.PI / 2);
  g.translate(0, r, 0);
  const parts = [[prep(g), '#5d4a3a']];
  for (const side of [-1, 1]) {
    const end = new THREE.CircleGeometry(r * 0.95, 18);
    end.rotateY(side * Math.PI / 2);
    parts.push([prep(end), '#b8946a', { x: side * (w / 2 + 0.002), y: r }]);
    parts.push([box(0.22, r * 1.1, 0.22), '#4e3d2f', { x: side * (w / 2 - 0.35), z: 0.42, rz: 0 }]);
    parts.push([box(0.22, r * 1.1, 0.22), '#4e3d2f', { x: side * (w / 2 - 0.35), z: -0.42 }]);
  }
  return partsToGeo(parts);
}

// Haie de cross : caisson en bois et brosse de bouleau taillée.
export function brushJumpGeo(w, h) {
  const parts = [[box(w, h * 0.45, 1.1), '#5b4533']];
  parts.push([box(w + 0.04, 0.08, 1.14), '#4a382a', { y: h * 0.45 }]);
  const n = Math.floor(w / 0.18);
  for (let i = 0; i < n; i++) {
    for (const zz of [-0.3, 0, 0.3]) {
      const x = -w / 2 + 0.09 + i * 0.18 + ((i * 13 + zz * 10) % 5) * 0.012;
      parts.push([cone(0.11, h * 0.62 + ((i * 7) % 5) * 0.02, 5), (i + zz * 10) % 3 ? '#4a4b33' : '#57583c', { x, y: h * 0.38, z: zz }]);
    }
  }
  parts.push([box(0.22, h + 0.25, 0.22), '#f2f1ec', { x: -w / 2 - 0.3 }]);
  parts.push([box(0.22, h + 0.25, 0.22), '#f2f1ec', { x: w / 2 + 0.3 }]);
  return partsToGeo(parts);
}

export function flagGeo(color) {
  return partsToGeo([
    [cyl(0.05, 0.06, 7, 5), '#d9d9d6'],
    [box(0.04, 1.1, 1.7, false), color, { y: 6.2, z: 0.88 }],
  ]);
}

export function carGeo(color) {
  return partsToGeo([
    [box(1.8, 0.7, 4.2), color, { y: 0.35 }],
    [box(1.6, 0.62, 2.2), color, { y: 1.05, z: -0.2 }],
    [box(1.62, 0.5, 2.0), '#26313b', { y: 1.08, z: -0.2 }],
    [box(0.4, 0.18, 0.06), '#fff3d0', { x: -0.6, y: 0.6, z: 2.1 }],
    [box(0.4, 0.18, 0.06), '#fff3d0', { x: 0.6, y: 0.6, z: 2.1 }],
    [box(0.4, 0.15, 0.06), '#c8302a', { x: -0.6, y: 0.6, z: -2.1 }],
    [box(0.4, 0.15, 0.06), '#c8302a', { x: 0.6, y: 0.6, z: -2.1 }],
    ...[[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]].map(([x, z]) => [cyl(0.36, 0.36, 0.25, 8, false), '#141416', { x, y: 0.36, z, rz: Math.PI / 2 }]),
  ]);
}

// Auvent rayé au-dessus d'une vitrine (façade locale +Z).
export function awningGeo(w, c1, c2) {
  const parts = [];
  const n = Math.max(3, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) {
    parts.push([box(w / n + 0.01, 0.06, 1.5, false), i % 2 ? c1 : c2, { x: -w / 2 + (w / n) * (i + 0.5), y: 3.05, z: 0.72, rx: 0.32 }]);
  }
  parts.push([box(w, 0.25, 0.04, false), c1, { y: 2.72, z: 1.42 }]);
  return partsToGeo(parts);
}

// Jardinière de rue : bac en acier, feuillage dense et petites fleurs dispersées.
// Retourne { body, detail } : le bac porte l'ombre, la végétation est un détail dessiné de près.
export function planterGeo(flower) {
  const body = [[box(1.6, 0.5, 0.6), '#3a3d42'], [box(1.66, 0.05, 0.66), '#2b2d31', { y: 0.5 }]];
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const x = -0.62 + (i % 5) * 0.31, z = i < 5 ? -0.12 : 0.12;
    parts.push([ico(0.16 + (i % 3) * 0.02, 1), i % 2 ? '#3c5a2c' : '#476a33', { x, y: 0.56, z, sy: 0.6 }]);
  }
  for (let i = 0; i < 14; i++) {
    const x = -0.68 + ((i * 7) % 14) * 0.1, z = ((i * 5) % 5) * 0.09 - 0.18;
    parts.push([ico(0.045, 0), i % 4 === 3 ? '#f2f1ec' : flower, { x, y: 0.66 + (i % 3) * 0.02, z }]);
  }
  return { body: partsToGeo(body), detail: partsToGeo(parts) };
}

export { partsToGeo, box, cyl, cone, ico, limb };
