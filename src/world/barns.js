// Écuries « à l'américaine » (barns) : un bâtiment fermé traversé par un couloir central, boxes des deux côtés,
// locaux de service. Inspirées des écuries de propriétaires et des haras normands : soubassement béton, bardage bois
// ou murs enduits, grandes portes coulissantes en pignon et sur l'allée transversale, charpente apparente, façades de
// boxes à barreaudage (bas en planches, haut en barreaux d'acier, porte coulissante), fenêtres de box ouvrantes côté
// cour pour que les chevaux regardent dehors, aire de pansage avec attaches croisées, douche carrelée avec lampe
// chauffante, sellerie (porte-selles, porte-filets, armoires, malles), salle d'aliments (coffres, sacs), éclairage
// suspendu. Le club-house est un bâtiment voisin, vitré, avec terrasse sur la carrière.
//
// Repère local : x le long du bâtiment (longueur w), z en travers (largeur d), côté « P » = +z, côté « N » = -z.
// Les colonnes (modules) se suivent d'ouest (-x) en est (+x). Chaque module donne ce qu'il y a de chaque côté de
// l'allée : 'box', 'groom' (aire de pansage), 'wash' (douche), 'tack' (sellerie), 'feed' (aliments), 'wall' (mur
// plein), ou bien 'cross' (allée transversale, portes sur les deux façades).
import * as THREE from 'three';
import { box, cyl, prep } from './shapes.js';
import { partsToGeo, winBox } from './builders.js';

export const BOX_W = 3.6;
const ROOMS = new Set(['tack', 'feed', 'wall']); // box de 3,6 × 3,6 m (12 m² : cheval de sport)
const T = 0.25; // épaisseur des murs extérieurs

// Barre horizontale (le long de x ou de z), centrée sur sa position.
const barX = (len, r, seg = 6) => prep(new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2));
const barZ = (len, r, seg = 6) => prep(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2));
const bar = (len, r, seg = 4) => cyl(r, r, len, seg); // verticale, posée au sol
// Pignon : triangle extrudé (épaisseur e selon x), base d, hauteur rise.
function gable(d, rise, e) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: e, bevelEnabled: false });
  g.translate(0, 0, -e / 2);
  g.rotateY(Math.PI / 2);
  return prep(g);
}
// Toit à deux pans d'épaisseur réelle (couverture vue dessus et dessous) : faîtage selon x.
function roofSlab(w, rise, d, over, th) {
  const g = [];
  const half = d / 2 + over;
  const slope = Math.atan2(rise, d / 2);
  const len = half / Math.cos(slope);
  for (const s of [-1, 1]) {
    const p = box(w + 2 * over, th, len, false);
    p.rotateX(s * slope);
    p.translate(0, rise - (half * Math.tan(slope)) / 2 + th / 2, s * (half / 2));
    g.push(p);
  }
  return g;
}

// Mur droit le long de x (de x0 à x1, centre zc), avec ouvertures [{ a, b, y0, y1 }] (bornes en x, hauteurs).
function wallAlongX(parts, x0, x1, zc, th, h, openings, color, y = 0) {
  const ops = [...openings].sort((p, q) => p.a - q.a);
  let cur = x0;
  for (const o of ops) {
    if (o.a > cur + 0.01) parts.push([box(o.a - cur, h, th), color, { x: (cur + o.a) / 2, y, z: zc }]);
    if (o.y0 > 0.01) parts.push([box(o.b - o.a, o.y0, th), color, { x: (o.a + o.b) / 2, y, z: zc }]);
    if (o.y1 < h - 0.01) parts.push([box(o.b - o.a, h - o.y1, th), color, { x: (o.a + o.b) / 2, y: y + o.y1, z: zc }]);
    cur = o.b;
  }
  if (x1 > cur + 0.01) parts.push([box(x1 - cur, h, th), color, { x: (cur + x1) / 2, y, z: zc }]);
}
function wallAlongZ(parts, z0, z1, xc, th, h, openings, color, y = 0) {
  const ops = [...openings].sort((p, q) => p.a - q.a);
  let cur = z0;
  for (const o of ops) {
    if (o.a > cur + 0.01) parts.push([box(th, h, o.a - cur), color, { x: xc, y, z: (cur + o.a) / 2 }]);
    if (o.y0 > 0.01) parts.push([box(th, o.y0, o.b - o.a), color, { x: xc, y, z: (o.a + o.b) / 2 }]);
    if (o.y1 < h - 0.01) parts.push([box(th, h - o.y1, o.b - o.a), color, { x: xc, y: y + o.y1, z: (o.a + o.b) / 2 }]);
    cur = o.b;
  }
  if (z1 > cur + 0.01) parts.push([box(th, h, z1 - cur), color, { x: xc, y, z: (cur + z1) / 2 }]);
}
// Segments pleins d'un mur à ouvertures (pour les collisions) : [x0, x1] hors des ouvertures qui descendent au sol.
function solidSpans(x0, x1, openings) {
  const out = [];
  let cur = x0;
  for (const o of [...openings].filter((p) => p.y0 < 0.3).sort((p, q) => p.a - q.a)) {
    if (o.a > cur + 0.05) out.push([cur, o.a]);
    cur = Math.max(cur, o.b);
  }
  if (x1 > cur + 0.05) out.push([cur, x1]);
  return out;
}

// Selle sur son porte-selle : siège creusé entre pommeau et troussequin, quartiers et tapis retombant de chaque côté,
// étrivières et étriers remontés. Repère local : x le long du porte-selle (avant +), z de part et d'autre.
function saddle(parts, x, y, z, ry, leather, pad) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  // Tapis : dessus et deux pans tombants (un peu plus grands que les quartiers).
  parts.push([box(0.6, 0.015, 0.36), pad, { ...at(0, 0), y: y + 0.03, ry }]);
  for (const sd of [-1, 1]) parts.push([box(0.6, 0.46, 0.015), pad, { ...at(0, sd * 0.19), y: y - 0.42, ry, rx: sd * 0.08 }]);
  // Siège, troussequin relevé à l'arrière, pommeau à l'avant.
  parts.push([box(0.46, 0.07, 0.3), leather, { ...at(0, 0), y: y + 0.045, ry }]);
  parts.push([box(0.07, 0.15, 0.3), leather, { ...at(-0.22, 0), y: y + 0.06, ry }]);
  parts.push([box(0.07, 0.1, 0.22), leather, { ...at(0.22, 0), y: y + 0.06, ry }]);
  // Quartiers, étrivières remontées, étriers.
  for (const sd of [-1, 1]) {
    parts.push([box(0.42, 0.4, 0.02), leather, { ...at(0.05, sd * 0.205), y: y - 0.35, ry, rx: sd * 0.08 }]);
    parts.push([box(0.035, 0.3, 0.012), '#2a1c12', { ...at(0.08, sd * 0.225), y: y - 0.28, ry }]);
    parts.push([box(0.12, 0.05, 0.035), '#b7bbbf', { ...at(0.08, sd * 0.235), y: y - 0.3, ry }]);
  }
}

// Filet (bridon) accroché à son porte-filet : têtière en boucle, mors, rênes pendantes.
function bridle(parts, x, y, z, ry, leather) {
  const loop = prep(new THREE.TorusGeometry(0.14, 0.012, 4, 10));
  parts.push([loop, leather, { x, y: y - 0.14, z, ry, sy: 1.6 }]);
  parts.push([barX(0.12, 0.008), '#c9ccd0', { x, y: y - 0.38, z, ry }]);
  parts.push([box(0.02, 0.55, 0.01), leather, { x, y: y - 0.95, z, ry }]);
  parts.push([cyl(0.025, 0.025, 0.06, 6), '#2b2d31', { x, y: y - 0.03, z, ry, rx: Math.PI / 2 }]);
}

// ----- Écurie -----
// style : { wall, plinth, trim, roof, slide (portes coulissantes), wood (façades de box), steel, lining (habillage
// intérieur), aisle (sol de l'allée), truss (charpente), kind: 'wood' | 'stone' | 'tent' }
export function barnGeo({ w, d, h = 4.2, aisle = 3.6, cols, style, windowsP = 'dutch', windowsN = 'high', endDoors = [true, true], over = 0.9 }) {
  const S = { wall: '#202125', plinth: '#8a877f', trim: '#f2f1ec', roof: '#3a3d42', slide: '#202125', wood: '#76563a', steel: '#1d1e21', lining: '#a98258', aisle: '#3b3c3e', truss: '#6e5236', kind: 'wood', ...style };
  const body = [], det = [], glass = [], lights = [];
  const colliders = []; // [x, z, hw, hd] en repère local (boîtes alignées)
  const hd = d / 2, hw = w / 2;
  const A2 = aisle / 2;
  const zIn = hd - T; // face intérieure des murs longs
  const depth = zIn - A2; // profondeur des boxes
  const rise = d * (S.kind === 'tent' ? 0.25 : 0.3); // pente d'environ 30° (bac acier, ardoise), 27° sous tente
  const tent = S.kind === 'tent';
  const slope0 = Math.atan2(rise, hd);
  // Implantation des modules.
  let x = -hw + T;
  const mods = cols.map((c) => {
    const m = { ...c, xa: x, xb: x + (c.w || BOX_W) };
    x = m.xb;
    return m;
  });
  const xEnd = hw - T;
  if (x < xEnd - 0.05) mods.push({ p: 'wall', n: 'wall', xa: x, xb: xEnd });
  const boxes = { P: [], N: [] };

  // --- Sol : dalle béton, allée en pavés caoutchouc, litière de copeaux dans les boxes. ---
  body.push([box(w + 1.2, 0.35, d + 1.2), '#a6a39b', { y: -0.33 }]);
  body.push([box(w - 2 * T, 0.03, aisle), S.aisle, { y: 0.0 }]);
  // Caniveau central à grille.
  det.push([box(w - 2 * T - 0.6, 0.012, 0.12), '#2a2b2d', { y: 0.03 }]);

  // --- Murs extérieurs : longs pans (ouvertures par module) et pignons (portes de l'allée). ---
  const opening = { P: [], N: [] };
  for (const m of mods) {
    const cx = (m.xa + m.xb) / 2;
    if (m.cross) {
      for (const sd of ['P', 'N']) opening[sd].push({ a: cx - 1.75, b: cx + 1.75, y0: 0, y1: 3.4, door: true });
      continue;
    }
    for (const sd of ['P', 'N']) {
      const kind = m[sd.toLowerCase()];
      const win = sd === 'P' ? windowsP : windowsN;
      if (kind === 'box' && win === 'dutch') opening[sd].push({ a: cx - 0.6, b: cx + 0.6, y0: 1.25, y1: 2.3, dutch: true });
      else if (kind === 'box' || kind === 'groom' || kind === 'wash') opening[sd].push({ a: cx - 0.5, b: cx + 0.5, y0: 2.3, y1: 2.95, high: true });
      else if (kind === 'tack' || kind === 'feed') opening[sd].push({ a: cx - 0.6, b: cx + 0.6, y0: 1.1, y1: 2.3, glass: true });
    }
  }
  for (const [sd, s] of [['P', 1], ['N', -1]]) {
    const zc = s * (hd - T / 2);
    wallAlongX(body, -hw, hw, zc, T, h, opening[sd], S.wall);
    // Soubassement (plinthe béton) sur la face extérieure, interrompu aux portes.
    if (!tent) wallAlongX(body, -hw - 0.02, hw + 0.02, s * (hd + 0.02), 0.06, 0.95, opening[sd].filter((o) => o.door).map((o) => ({ ...o, y1: 0.95 })), S.plinth);
    for (const [a, b] of solidSpans(-hw, hw, opening[sd])) colliders.push([(a + b) / 2, zc, (b - a) / 2, T / 2 + 0.08]);
    for (const o of opening[sd]) {
      const ox = (o.a + o.b) / 2, ow = o.b - o.a;
      if (o.door) {
        // Grande porte coulissante ouverte le long du mur (rail, galets), encadrement.
        det.push([box(ow * 2 + 0.6, 0.14, 0.12), S.steel, { x: ox + ow / 2, y: o.y1 + 0.1, z: s * (hd + 0.12) }]);
        body.push([box(ow + 0.1, o.y1 + 0.05, 0.08), S.slide, { x: ox + ow + 0.05, z: s * (hd + 0.1) }]);
        det.push([box(ow + 0.1, 0.06, 0.03), S.trim, { x: ox + ow + 0.05, y: o.y1 * 0.5, z: s * (hd + 0.15) }]);
        det.push([box(Math.hypot(ow, o.y1) - 0.2, 0.06, 0.03, false), S.trim, { x: ox + ow + 0.05, y: o.y1 * 0.5, z: s * (hd + 0.15), rz: Math.atan2(o.y1, ow) }]);
        for (const e of [o.a, o.b]) det.push([box(0.14, o.y1 + 0.1, 0.16), S.trim, { x: e, z: s * (hd + 0.02) }]);
      } else if (o.dutch) {
        // Fenêtre de box ouvrante : volet bas en planches rabattu, grille articulée, encadrement.
        for (const e of [o.a, o.b]) det.push([box(0.1, o.y1 - o.y0 + 0.1, 0.12), S.trim, { x: e, y: o.y0 - 0.05, z: s * (hd + 0.03) }]);
        det.push([box(ow + 0.2, 0.1, 0.12), S.trim, { x: ox, y: o.y1, z: s * (hd + 0.03) }]);
        det.push([box(ow + 0.3, 0.06, 0.2), S.trim, { x: ox, y: o.y0 - 0.06, z: s * (hd + 0.06) }]);
        // Volets ouverts à 90° contre la façade, croix de renfort.
        for (const [e, k] of [[o.b + 0.12, 1], [o.a - 0.12, -1]]) {
          body.push([box(0.06, o.y1 - o.y0, ow * 0.5), S.slide, { x: e, y: o.y0, z: s * (hd + 0.05 + ow * 0.25) }]);
          det.push([box(0.02, Math.hypot(o.y1 - o.y0, ow * 0.5) - 0.1, 0.05, false), S.trim, { x: e + k * 0.04, y: o.y0 + (o.y1 - o.y0) / 2, z: s * (hd + 0.05 + ow * 0.25), rx: Math.atan2(ow * 0.5, o.y1 - o.y0) }]);
        }
        // Grille de fenêtre de box (barreaux en haut).
        for (let k = 1; k < 6; k++) det.push([bar(o.y1 - o.y0 - 0.4, 0.008), S.steel, { x: o.a + (ow / 6) * k, y: o.y0 + 0.4, z: s * (hd - 0.15) }]);
      } else if (o.high) {
        det.push([box(ow + 0.14, o.y1 - o.y0 + 0.14, 0.1), S.trim, { x: ox, y: o.y0 - 0.07, z: s * (hd + 0.01) }]);
        glass.push([winBox(ow, o.y1 - o.y0, 0.04, 0), '#9fb0bd', { x: ox, y: o.y0, z: s * (hd - 0.05) }]);
        for (let k = 1; k < 6; k++) det.push([bar(o.y1 - o.y0, 0.01), S.steel, { x: o.a + (ow / 6) * k, y: o.y0, z: s * (hd - 0.12) }]);
      } else if (o.glass) {
        det.push([box(ow + 0.14, o.y1 - o.y0 + 0.14, 0.1), S.trim, { x: ox, y: o.y0 - 0.07, z: s * (hd + 0.01) }]);
        glass.push([winBox(ow, o.y1 - o.y0, 0.04, 0), '#9fb0bd', { x: ox, y: o.y0, z: s * (hd - 0.05) }]);
        det.push([box(0.05, o.y1 - o.y0, 0.06), S.trim, { x: ox, y: o.y0, z: s * (hd - 0.05) }]);
      }
    }
  }
  // Pignons : porte coulissante de l'allée (ouverte), oculus d'aération sous le faîtage.
  for (const [i, sx] of [[0, -1], [1, 1]]) {
    const xc = sx * (hw - T / 2);
    const door = endDoors[i];
    const ops = door ? [{ a: -A2 + 0.1, b: A2 - 0.1, y0: 0, y1: 3.6 }] : [];
    wallAlongZ(body, -hd, hd, xc, T, h, ops, S.wall);
    if (!tent) wallAlongZ(body, -hd - 0.02, hd + 0.02, sx * (hw + 0.02), 0.06, 0.95, ops.map((o) => ({ ...o, y1: 0.95 })), S.plinth);
    body.push([gable(d - 0.02, rise, T), S.wall, { x: xc, y: h }]);
    for (const [a, b] of solidSpans(-hd, hd, ops)) colliders.push([xc, (a + b) / 2, T / 2 + 0.08, (b - a) / 2]);
    if (door) {
      const ow = aisle - 0.2;
      det.push([box(0.12, 0.14, ow * 2 + 0.6), S.steel, { x: sx * (hw + 0.12), y: 3.7, z: ow / 2 }]);
      body.push([box(0.08, 3.65, ow + 0.1), S.slide, { x: sx * (hw + 0.1), z: ow + 0.05 - 0.05 + 0.05 }]);
      det.push([box(0.03, 0.06, ow), S.trim, { x: sx * (hw + 0.15), y: 1.8, z: ow }]);
      det.push([box(0.03, 0.06, Math.hypot(ow, 3.6) - 0.2, false), S.trim, { x: sx * (hw + 0.15), y: 1.8, z: ow, rx: -Math.atan2(3.6, ow) }]);
      for (const e of [-A2 + 0.1, A2 - 0.1]) det.push([box(0.16, 3.7, 0.14), S.trim, { x: sx * (hw + 0.02), z: e }]);
      // Applique extérieure au-dessus de la porte.
      det.push([box(0.2, 0.25, 0.2), S.steel, { x: sx * (hw + 0.12), y: 3.95 }]);
      lights.push([box(0.14, 0.1, 0.14), '#fff1c9', { x: sx * (hw + 0.14), y: 3.88 }]);
    }
    // Oculus d'aération à lames.
    det.push([box(0.08, 0.8, 1.3), S.trim, { x: sx * (hw + 0.04), y: h + rise * 0.42 }]);
    for (let k = 0; k < 4; k++) det.push([box(0.1, 0.05, 1.2), S.steel, { x: sx * (hw + 0.06), y: h + rise * 0.42 + 0.12 + k * 0.16 }]);
  }
  // Bandeau de rive et corniche.
  det.push([box(w + 0.1, 0.22, d + 0.1), S.trim, { y: h - 0.22 }]);

  // --- Toit : couverture (bac acier / ardoise / toile), faîtage ventilé, gouttières, charpente apparente. ---
  for (const g of roofSlab(w, rise, d, over, 0.12)) body.push([g, S.roof, { y: h - 0.06 }]);
  body.push([box(w + 2 * over, 0.22, 0.7), S.roof, { y: h + rise + 0.02 }]);
  det.push([box(w + 2 * over, 0.12, 0.6), S.steel, { y: h + rise - 0.08 }]);
  if (!tent) {
    for (const side of [-1, 1]) {
      const g = prep(new THREE.CylinderGeometry(0.07, 0.07, w + 2 * over, 8, 1, true, Math.PI, Math.PI).rotateZ(Math.PI / 2));
      const zg = side * (hd + over - 0.05);
      const yg = h - over * (rise / hd) - 0.16;
      det.push([g, '#8b9096', { y: yg, z: zg }]);
      for (const sx of [-1, 1]) det.push([cyl(0.045, 0.045, yg, 6), '#8b9096', { x: sx * (hw - 0.3), z: side * (hd + 0.1) }]);
    }
  } else {
    // Tente de concours : haubans et piquets le long des façades.
    for (let px = -hw + 1; px <= hw - 1; px += 5) for (const side of [-1, 1]) det.push([barZ(1.6, 0.01), '#d8d6cf', { x: px, y: h - 0.6, z: side * (hd + 0.75), rx: side * 0.75 }]);
  }
  // Lanterneaux d'aération sur le faîtage (un tous les ~10 m) et châssis éclairants (bandes translucides) sur les pans.
  if (!tent) {
    for (let lx = -hw + 5; lx < hw - 3; lx += 10) {
      body.push([box(1.4, 0.8, 1.4), S.wall, { x: lx, y: h + rise - 0.1 }]);
      for (let k = 0; k < 4; k++) det.push([box(1.44, 0.05, 1.44), S.trim, { x: lx, y: h + rise + 0.05 + k * 0.17 }]);
      body.push([gable(1.9, 0.5, 1.9), S.roof, { x: lx, y: h + rise + 0.7 }]);
    }
    for (let lx = -hw + 2.5; lx < hw - 2; lx += 5) for (const sd of [-1, 1]) det.push([box(1.0, 0.03, 2.2), '#d9e2e6', { x: lx, y: h + rise * 0.45 + 0.05, z: sd * hd * 0.55, rx: sd * slope0 }]);
  }
  // Fermes : entrait, arbalétriers, poinçon et contrefiches aux limites de modules (sous la couverture).
  const slope = slope0;
  const raft = hd / Math.cos(slope);
  for (const m of mods.slice(1)) {
    const fx = m.xa;
    body.push([barZ(d - 2 * T, 0.09, 4), S.truss, { x: fx, y: h - 0.12 }]);
    for (const sd of [-1, 1]) body.push([box(0.14, 0.2, raft, false), S.truss, { x: fx, y: h + rise / 2 - 0.2, z: sd * hd / 2, rx: sd * slope }]);
    body.push([box(0.14, rise - 0.2, 0.14), S.truss, { x: fx, y: h - 0.1 }]);
  }
  // Pannes (sous-face intérieure du toit).
  for (const sd of [-1, 1]) for (const f of [0.3, 0.65]) det.push([box(w - 2 * T, 0.14, 0.1), S.truss, { y: h + rise * (1 - f) - 0.32, z: sd * hd * f }]);

  // --- Habillage intérieur : lambris bas en planches sur les murs, peinture claire au-dessus. ---
  for (const [sd, s] of [['P', 1], ['N', -1]]) wallAlongX(det, -hw + T, hw - T, s * (zIn - 0.02), 0.04, 1.3, opening[sd].filter((o) => o.door), S.lining);

  // --- Modules. ---
  const plateCol = '#f2f1ec';
  const front = (m, s, kind) => {
    // Façade de box sur l'allée : poteaux acier, bas en planches (fixe + porte coulissante), barreaux en haut,
    // rail de porte, plaque nominative, porte-couverture, loquet.
    const zf = s * A2;
    const W = m.xb - m.xa, dw = 1.25;
    const cx = (m.xa + m.xb) / 2;
    const dc = cx + (W / 2 - dw / 2 - 0.15) * (s > 0 ? 1 : -1);
    for (const e of [m.xa + 0.05, m.xb - 0.05]) body.push([box(0.1, 2.35, 0.1), S.steel, { x: e, z: zf }]);
    body.push([box(W, 1.15, 0.05), S.wood, { x: cx, z: zf + s * 0.02 }]);
    det.push([box(W, 0.08, 0.1), S.steel, { x: cx, y: 1.13, z: zf }]);
    det.push([box(W, 0.08, 0.1), S.steel, { x: cx, y: 2.27, z: zf }]);
    det.push([box(W, 0.1, 0.12), S.steel, { x: cx, y: 2.38, z: zf - s * 0.08 }]);
    // Barreaux (16 mm, entraxe 7,5 cm).
    for (let bx = m.xa + 0.12; bx < m.xb - 0.08; bx += 0.075) {
      // Encolure de la porte (« yoke ») : barreaux absents au centre de la porte dans le haut.
      if (Math.abs(bx - dc) < 0.22) {
        det.push([bar(0.32, 0.008), S.steel, { x: bx, y: 1.17, z: zf }]);
        continue;
      }
      det.push([bar(1.1, 0.008), S.steel, { x: bx, y: 1.17, z: zf }]);
    }
    // Porte coulissante : cadre, poignée, galets sur le rail.
    for (const e of [dc - dw / 2, dc + dw / 2]) det.push([box(0.05, 2.28, 0.05), S.steel, { x: e, y: 0.02, z: zf - s * 0.07 }]);
    det.push([box(dw, 0.06, 0.05), S.steel, { x: dc, y: 2.24, z: zf - s * 0.07 }]);
    for (const k of [-1, 1]) det.push([box(0.04, 0.42, 0.04, false), S.steel, { x: dc + k * 0.16, y: 2.0, z: zf - s * 0.07, rz: k * 0.45 }]);
    body.push([box(dw - 0.08, 1.1, 0.05), S.wood, { x: dc, y: 0.04, z: zf - s * 0.07 }]);
    det.push([box(0.04, 0.2, 0.05), '#b7bbbf', { x: dc - (dw / 2 - 0.12) * (s > 0 ? 1 : -1), y: 1.05, z: zf - s * 0.11 }]);
    det.push([box(0.32, 0.11, 0.02), plateCol, { x: dc, y: 1.32, z: zf - s * 0.1 }]);
    det.push([barX(0.9, 0.016), '#b7bbbf', { x: cx - (W / 2 - 0.6) * (s > 0 ? 1 : -1), y: 1.25, z: zf - s * 0.14 }]);
    // Intérieur du box : litière de copeaux, abreuvoir automatique, mangeoire d'angle, anneau d'attache, lambris.
    const zb = s * (zIn - 0.25);
    body.push([box(W - 0.1, 0.08, depth - 0.1), '#c9b68b', { x: cx, y: 0.0, z: s * (A2 + depth / 2) }]);
    det.push([box(0.32, 0.18, 0.25), '#8a8f94', { x: m.xa + 0.3, y: 0.95, z: zb }]);
    det.push([box(0.6, 0.3, 0.45), '#1f2022', { x: m.xb - 0.4, y: 0.8, z: zb - s * 0.05 }]);
    det.push([box(0.1, 0.1, 0.03), '#b7bbbf', { x: cx, y: 1.5, z: s * (zIn - 0.05) }]);
    det.push([box(W - 0.1, 1.3, 0.04), S.lining, { x: cx, z: s * (zIn - 0.06) }]);
    if (kind === 'box') boxes[s > 0 ? 'P' : 'N'].push({ x: cx, s });
  };
  const partition = (xp, s, high) => {
    // Séparation entre deux boxes : planches jusqu'à 1,3 m, barreaux jusqu'à 2,3 m (chevaux qui se voient).
    const zc = s * (A2 + depth / 2);
    body.push([box(0.06, 1.3, depth), S.wood, { x: xp, z: zc }]);
    det.push([box(0.08, 0.08, depth), S.steel, { x: xp, y: 1.28, z: zc }]);
    if (high) body.push([box(0.06, 1.0, depth), S.wood, { x: xp, y: 1.3, z: zc }]);
    else for (let k = 0; k < depth / 0.15; k++) det.push([bar(1.0, 0.008), S.steel, { x: xp, y: 1.32, z: s * (A2 + 0.1 + k * 0.15) }]);
    det.push([box(0.08, 0.08, depth), S.steel, { x: xp, y: 2.28, z: zc }]);
  };
  const RH = 2.7; // hauteur sous plafond des locaux (grenier au-dessus)
  const rooms = [];
  const roomWall = (m, s, door, color) => {
    // Façade d'un local fermé sur l'allée (cloison pleine, porte entrouverte), plafond formant grenier au-dessus.
    const zf = s * A2;
    const cx = (m.xa + m.xb) / 2;
    const ops = door ? [{ a: cx - 0.55, b: cx + 0.55, y0: 0, y1: 2.15 }] : [];
    wallAlongX(body, m.xa, m.xb, zf, 0.12, RH, ops, color);
    body.push([box(m.xb - m.xa, 0.14, depth + 0.1), S.truss, { x: cx, y: RH, z: s * (A2 + depth / 2) }]);
    det.push([box(m.xb - m.xa, 0.9, 0.06), S.truss, { x: cx, y: RH + 0.14, z: zf }]);
    if (door) rooms.push({ x: cx, z: s * (A2 + depth / 2), hw: (m.xb - m.xa) / 2, hd: depth / 2, h: RH - 0.05 });
    for (const [a, b] of solidSpans(m.xa, m.xb, ops)) colliders.push([(a + b) / 2, zf, (b - a) / 2, 0.14]);
    if (door) {
      det.push([box(1.12, 2.22, 0.14), S.trim, { x: cx, y: 0, z: zf, sx: 1 }]);
      body.push([box(0.95, 2.1, 0.05), S.wood, { x: cx + 0.45 * (s > 0 ? -1 : 1), z: zf + s * 0.5, ry: Math.PI / 2 }]);
    }
  };
  const sideWall = (xp, s, color, hgt = h - 0.02) => {
    const zc = s * (A2 + depth / 2);
    body.push([box(0.12, hgt, depth), color, { x: xp, z: zc }]);
    colliders.push([xp, zc, 0.1, depth / 2]);
  };
  const light = (cx) => {
    // Réglette suspendue au-dessus de l'allée.
    det.push([box(0.02, 0.6, 0.02), S.steel, { x: cx, y: h - 0.1 }]);
    det.push([box(1.25, 0.07, 0.16), '#d9dadc', { x: cx, y: h - 0.72 }]);
    lights.push([box(1.15, 0.03, 0.12), '#fff4d8', { x: cx, y: h - 0.75 }]);
  };

  let prev = { P: null, N: null };
  for (const m of mods) {
    const cx = (m.xa + m.xb) / 2, W = m.xb - m.xa;
    light(cx);
    if (m.cross) {
      // Allée transversale : sol continu, extincteur et dévidoir.
      body.push([box(W, 0.03, d - 2 * T), S.aisle, { x: cx }]);
      det.push([cyl(0.09, 0.09, 0.55, 8), '#c8322b', { x: m.xa + 0.25, y: 0.9, z: hd - 0.45 }]);
      det.push([cyl(0.25, 0.25, 0.12, 12), '#2f6e4a', { x: m.xb - 0.3, y: 1.4, z: -(hd - 0.35), rx: Math.PI / 2 }]);
      for (const [sd, s] of [['P', 1], ['N', -1]]) if (prev[sd]) sideWall(m.xa, s, S.lining);
      prev = { P: 'cross', N: 'cross' };
      continue;
    }
    for (const [sd, s] of [['P', 1], ['N', -1]]) {
      const kind = m[sd.toLowerCase()] || 'wall';
      const zc = s * (A2 + depth / 2);
      const pk = prev[sd];
      // Cloison avec le module précédent (si les deux ne sont pas ouverts l'un sur l'autre).
      if (pk === 'cross') sideWall(m.xa, s, S.lining);
      else if (pk) {
        if (pk === 'box' && kind === 'box') partition(m.xa, s, false);
        else sideWall(m.xa, s, kind === 'wash' || pk === 'wash' ? '#e9ecee' : S.lining, kind === 'groom' && pk === 'groom' ? 2.4 : ROOMS.has(kind) || ROOMS.has(pk) ? RH : 2.6);
      }
      if (kind === 'box') {
        front(m, s, 'box');
        colliders.push([cx, zc, W / 2, depth / 2]);
      } else if (kind === 'groom') {
        // Aire de pansage : tapis caoutchouc, attaches croisées, anneaux, étagère avec caisse de pansage et seau.
        body.push([box(W - 0.1, 0.04, depth), '#232426', { x: cx, z: zc }]);
        const za = s * (A2 + depth * 0.55);
        for (const e of [m.xa + 0.08, m.xb - 0.08]) det.push([box(0.08, 0.08, 0.05), '#b7bbbf', { x: e, y: 1.7, z: za }]);
        for (const sx of [-1, 1]) det.push([barX(W / 2 - 0.35, 0.012), '#d9c27a', { x: cx + sx * (W / 4), y: 1.55, z: za, rz: sx * 0.08 }]);
        det.push([box(0.9, 0.04, 0.3), S.wood, { x: cx, y: 1.5, z: s * (zIn - 0.18) }]);
        det.push([box(0.45, 0.22, 0.25), '#2f5f8a', { x: cx - 0.2, y: 1.54, z: s * (zIn - 0.18) }]);
        det.push([cyl(0.13, 0.11, 0.25, 10), '#c8322b', { x: cx + 0.28, y: 1.54, z: s * (zIn - 0.18) }]);
        det.push([box(0.6, 0.8, 0.03), '#c9ced3', { x: cx, y: 1.75, z: s * (zIn - 0.05) }]);
        colliders.push([cx, s * (zIn - 0.2), W / 2, 0.2]);
      } else if (kind === 'wash') {
        // Douche : carrelage, caniveau à grille, potence pivotante avec tuyau, lampe chauffante infrarouge.
        body.push([box(W - 0.1, 0.04, depth), '#9aa1a6', { x: cx, z: zc }]);
        det.push([box(W - 0.2, 1.9, 0.04), '#e9ecee', { x: cx, z: s * (zIn - 0.06) }]);
        det.push([box(W - 0.2, 0.08, 0.05), '#5d7480', { x: cx, y: 1.9, z: s * (zIn - 0.06) }]);
        det.push([box(W - 0.4, 0.015, 0.14), '#5b5f64', { x: cx, y: 0.04, z: s * (zIn - 0.5) }]);
        det.push([cyl(0.04, 0.04, 2.9, 6), '#b7bbbf', { x: m.xa + 0.2, z: s * (zIn - 0.2) }]);
        det.push([barX(1.6, 0.03), '#b7bbbf', { x: m.xa + 1.0, y: 2.85, z: s * (zIn - 0.2) }]);
        det.push([barZ(0.9, 0.02), '#2f6e4a', { x: m.xa + 1.75, y: 2.4, z: s * (zIn - 0.2), rx: 1.2 }]);
        det.push([box(1.4, 0.12, 0.5), '#2b2d31', { x: cx, y: 2.75, z: zc }]);
        lights.push([box(1.3, 0.03, 0.4), '#ff9a5c', { x: cx, y: 2.72, z: zc }]);
        for (const e of [cx - 0.6, cx + 0.6]) det.push([box(0.02, h - 2.8, 0.02), S.steel, { x: e, y: 2.85, z: zc }]);
        colliders.push([cx, s * (zIn - 0.2), W / 2, 0.2]);
      } else if (kind === 'tack') {
        // Sellerie : porte sur l'allée ; porte-selles sur trois hauteurs, filets, armoires, malles, banc, tapis.
        roomWall(m, s, true, S.lining);
        body.push([box(W - 0.1, 0.03, depth), '#8a7a66', { x: cx, z: zc }]);
        det.push([box(W - 0.2, RH - 0.1, 0.04), '#b08a5e', { x: cx, z: s * (zIn - 0.05) }]);
        const leathers = ['#4a2f1e', '#1d1c1b', '#5a3a24', '#3d2a1d'];
        const pads = ['#f2f1ec', '#1b2a44', '#2f5f8a', '#f2f1ec', '#7a1f2b', '#1b1c1f'];
        let k = 0;
        for (let px = m.xa + 0.55; px < m.xb - 0.4; px += 0.75) {
          for (const py of [1.05, 1.7]) {
            det.push([box(0.06, 0.06, 0.45), '#2b2d31', { x: px, y: py - 0.03, z: s * (zIn - 0.28) }]);
            saddle(det, px, py, s * (zIn - 0.35), Math.PI / 2, leathers[k % 4], pads[k % 6]);
            k++;
          }
        }
        // Porte-filets sur le mur latéral, armoires et malles de concours.
        for (let i = 0; i < 6; i++) bridle(det, m.xb - 0.12, 2.0, s * (A2 + 0.6 + i * 0.32), Math.PI / 2, leathers[i % 4]);
        body.push([box(0.6, 2.1, 0.55), '#5d7480', { x: m.xa + 0.4, z: s * (A2 + 0.5) }]);
        det.push([box(0.02, 1.9, 0.02), '#2b2d31', { x: m.xa + 0.71, y: 0.1, z: s * (A2 + 0.5) }]);
        // Malle de concours et banc, de part et d'autre de la porte (passage dégagé).
        body.push([box(1.0, 0.55, 0.5), '#1b2a44', { x: cx + 1.4, z: s * (A2 + 0.6) }]);
        det.push([box(1.02, 0.05, 0.52), '#b7bbbf', { x: cx + 1.4, y: 0.5, z: s * (A2 + 0.6) }]);
        body.push([box(1.4, 0.45, 0.4), S.wood, { x: cx + 2.75, z: s * (A2 + 0.55) }]);
        lights.push([box(1.0, 0.03, 0.12), '#fff4d8', { x: cx, y: RH - 0.05, z: zc }]);
        colliders.push([cx, s * (zIn - 0.35), W / 2, 0.35]);
        colliders.push([m.xa + 0.4, s * (A2 + 0.5), 0.3, 0.3]);
        colliders.push([cx + 2.05, s * (A2 + 0.6), 1.25, 0.25]);
      } else if (kind === 'feed') {
        // Salle d'aliments : coffres galvanisés, sacs sur palette, seaux, balance.
        roomWall(m, s, true, S.lining);
        body.push([box(W - 0.1, 0.03, depth), '#9a978f', { x: cx, z: zc }]);
        for (let i = 0; i < 3; i++) {
          body.push([box(0.9, 0.75, 0.6), '#b7bbbf', { x: m.xa + 0.6 + i * 1.05, z: s * (zIn - 0.4) }]);
          det.push([box(0.92, 0.04, 0.62), '#9ca1a6', { x: m.xa + 0.6 + i * 1.05, y: 0.75, z: s * (zIn - 0.4) }]);
        }
        body.push([box(1.2, 0.12, 0.8), '#a98258', { x: m.xb - 0.8, z: s * (A2 + 0.7) }]);
        for (let i = 0; i < 6; i++) body.push([box(0.55, 0.18, 0.38), i % 2 ? '#e4dcc4' : '#d9cfb2', { x: m.xb - 1.08 + (i % 2) * 0.58, y: 0.12 + Math.floor(i / 2) * 0.18, z: s * (A2 + 0.7) }]);
        colliders.push([cx, s * (zIn - 0.4), W / 2, 0.4]);
        colliders.push([m.xb - 0.8, s * (A2 + 0.7), 0.65, 0.45]);
      } else {
        // Mur plein (local technique) : panneau d'affichage, extincteur.
        roomWall(m, s, false, S.lining);
        det.push([box(0.8, 0.6, 0.03), '#2a2b2f', { x: cx, y: 1.4, z: s * (A2 - 0.08) }]);
        det.push([box(0.7, 0.5, 0.02), '#f2f1ec', { x: cx, y: 1.45, z: s * (A2 - 0.1) }]);
      }
      prev[sd] = kind;
    }
  }
  const geo = (list) => (list.length ? partsToGeo(list) : null);
  return {
    body: geo(body), detail: geo(det), glass: geo(glass), lights: geo(lights),
    colliders, boxes, rooms,
    // Plafond pour la caméra : sous-face du toit (h aux murs, h + rise au faîtage).
    ceiling: { hw: hw - T, hd: hd - T, h: h - 0.15, rise },
  };
}

// ----- Club-house -----
// Bâtiment bas en bardage, grande baie vitrée tournée vers la carrière (face +z), terrasse en bois avec tables et
// parasols ; à l'intérieur : comptoir, tables, canapé, vitrine de trophées et mur de flots.
export function clubHouseGeo({ w = 12, d = 8, h = 3.4, wall = '#202125', trim = '#f2f1ec', roof = '#3a3d42' } = {}) {
  const body = [], det = [], glass = [], lights = [];
  const colliders = [];
  const hw = w / 2, hd = d / 2;
  body.push([box(w + 0.4, 0.3, d + 0.4), '#a6a39b', { y: -0.28 }]);
  body.push([box(w - 0.4, 0.03, d - 0.4), '#b89a74', { y: 0.0 }]);
  // Façade vitrée (côté +z) : menuiseries noires, porte double au centre.
  const ops = [{ a: -hw + 0.6, b: -0.7, y0: 0.4, y1: 2.8 }, { a: -0.7, b: 0.7, y0: 0, y1: 2.3 }, { a: 0.7, b: hw - 0.6, y0: 0.4, y1: 2.8 }];
  wallAlongX(body, -hw, hw, hd - 0.1, 0.2, h, ops, wall);
  for (const sx of [-1, 1]) glass.push([winBox(hw - 1.3, 2.4, 0.04, 0), '#9fb0bd', { x: sx * (hw / 2 + 0.05), y: 0.4, z: hd - 0.1 }]);
  for (let k = 0; k <= 6; k++) if (k !== 3) det.push([box(0.08, 2.5, 0.12), '#1b1c1f', { x: -hw + 0.6 + ((w - 1.2) / 6) * k, y: 0.35, z: hd - 0.05 }]);
  for (const e of [-0.7, 0.7]) det.push([box(0.1, 2.35, 0.14), '#1b1c1f', { x: e, z: hd - 0.05 }]);
  body.push([box(0.7, 2.25, 0.05), '#1b1c1f', { x: 0.7 + 0.36, z: hd + 0.32, ry: 1.2 }]);
  wallAlongX(body, -hw, hw, -hd + 0.1, 0.2, h, [{ a: -1, b: 0.1, y0: 0, y1: 2.15 }], wall);
  wallAlongZ(body, -hd, hd, -hw + 0.1, 0.2, h, [{ a: -1.2, b: 1.2, y0: 1.0, y1: 2.2 }], wall);
  wallAlongZ(body, -hd, hd, hw - 0.1, 0.2, h, [], wall);
  glass.push([winBox(0.04, 1.2, 2.4, 0), '#9fb0bd', { x: -hw + 0.1, y: 1.0 }]);
  colliders.push([-(hw + 0.7) / 2, hd - 0.1, (hw - 0.7) / 2, 0.2], [(hw + 0.7) / 2, hd - 0.1, (hw - 0.7) / 2, 0.2], [-hw + 0.1, 0, 0.2, hd], [hw - 0.1, 0, 0.2, hd], [-hw / 2 - 0.5, -hd + 0.1, hw / 2 - 0.5, 0.2], [hw / 2 + 0.05, -hd + 0.1, hw / 2 - 0.05, 0.2]);
  // Toit monopente, débord sur la terrasse.
  const r = box(w + 0.8, 0.18, d + 2.2);
  body.push([r, roof, { y: h, z: 0.9, rx: -0.06 }]);
  det.push([box(w + 0.85, 0.24, 0.12), trim, { y: h + 0.02, z: hd + 2.0 }]);
  // Intérieur : comptoir, tables et chaises, canapé, vitrine de trophées, flots de concours au mur.
  body.push([box(3.2, 1.05, 0.6), '#5b4330', { x: -hw + 2.2, z: -hd + 1.4 }]);
  det.push([box(3.3, 0.05, 0.7), '#e9e6de', { x: -hw + 2.2, y: 1.05, z: -hd + 1.4 }]);
  for (const [tx, tz] of [[1, 1.5], [3.4, 1.5], [1, -0.6], [3.4, -0.6]]) {
    det.push([cyl(0.4, 0.4, 0.04, 12), '#e9e6de', { x: tx, y: 0.74, z: tz }]);
    det.push([cyl(0.04, 0.05, 0.74, 6), '#1b1c1f', { x: tx, z: tz }]);
    for (const a of [0, Math.PI]) det.push([box(0.42, 0.45, 0.42), '#2b2d31', { x: tx + Math.cos(a) * 0.6, z: tz + Math.sin(a) * 0.6 }]);
  }
  body.push([box(2.2, 0.45, 0.9), '#7a5f45', { x: -hw + 2.0, z: 1.0 }]);
  body.push([box(2.2, 0.5, 0.2), '#7a5f45', { x: -hw + 2.0, y: 0.45, z: 0.55 }]);
  body.push([box(1.6, 2.1, 0.4), '#1b1c1f', { x: hw - 1.2, z: -hd + 0.4 }]);
  for (let i = 0; i < 6; i++) det.push([cyl(0.06, 0.09, 0.28, 8), '#d9b46a', { x: hw - 1.75 + (i % 3) * 0.55, y: 0.9 + Math.floor(i / 3) * 0.6, z: -hd + 0.45 }]);
  const flots = ['#2f5f8a', '#c8322b', '#f2f1ec', '#e9c94a', '#2f6e4a', '#b55aa0'];
  for (let i = 0; i < 12; i++) {
    const fx = -hw + 4.6 + (i % 6) * 0.45, fy = 1.6 + Math.floor(i / 6) * 0.55;
    det.push([cyl(0.12, 0.12, 0.03, 10), flots[i % 6], { x: fx, y: fy, z: -hd + 0.22, rx: Math.PI / 2 }]);
    det.push([box(0.06, 0.3, 0.01), flots[i % 6], { x: fx, y: fy - 0.34, z: -hd + 0.22 }]);
  }
  for (const lx of [-3, 0, 3]) lights.push([cyl(0.18, 0.18, 0.05, 10), '#fff4d8', { x: lx, y: h - 0.3 }]);
  colliders.push([-hw + 2.2, -hd + 1.4, 1.6, 0.35], [-hw + 2.0, 0.9, 1.1, 0.5], [hw - 1.2, -hd + 0.4, 0.8, 0.25]);
  // Terrasse en bois devant la baie : tables, chaises, parasols.
  body.push([box(w, 0.18, 2.6), '#8a6a4a', { y: -0.05, z: hd + 1.3 }]);
  for (const tx of [-hw + 2, 0, hw - 2]) {
    det.push([cyl(0.35, 0.35, 0.04, 10), '#e9e6de', { x: tx, y: 0.86, z: hd + 1.4 }]);
    det.push([cyl(0.03, 0.03, 0.74, 6), '#1b1c1f', { x: tx, y: 0.12, z: hd + 1.4 }]);
    for (const a of [0.5, 2.6]) det.push([box(0.4, 0.45, 0.4), '#1b1c1f', { x: tx + Math.cos(a) * 0.65, y: 0.13, z: hd + 1.4 + Math.sin(a) * 0.4 }]);
  }
  return { body: partsToGeo(body), detail: partsToGeo(det), glass: partsToGeo(glass), lights: partsToGeo(lights), colliders, ceiling: { hw: hw - 0.2, hd: hd - 0.2, h: h - 0.1, rise: 0 } };
}

// Boxes de l'écurie du Val ouvrant sur la cour (fenêtres de box, côté +z) : centre de chaque box en x.
export function barnBoxCenters(w, cols) {
  let x = -w / 2 + T;
  const out = [];
  for (const c of cols) {
    const cw = c.w || BOX_W;
    if (!c.cross && c.p === 'box') out.push(x + cw / 2);
    x += cw;
  }
  return out;
}
