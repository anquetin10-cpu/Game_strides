// Commerces de Deauville City : façade à vraies ouvertures et pièces d'intérieur.
// Repère local d'un commerce : façade vers +z, x le long de la façade, y = 0 au niveau du sol ; le monde place ce
// repère au centre de l'emprise et le tourne de spec.rot (comme buildingGeo).
// - Rez-de-chaussée : murs maçonnés épais (WALL_T) percés des baies, devanture en applique de bois peint (pilastres,
//   soubassements à panneaux, bandeau d'enseigne, corniche), vitrines vitrées en retrait avec petits bois, porte
//   vitrée au fond de l'embrasure, seuil en pierre, lanternes, store banne et enseigne drapeau ;
// - étages : buildingGeo posé sur le rez-de-chaussée (sans socle) ;
// - pièces d'intérieur (Kit) rangées par matériau : A architecture et bois (shader de surfaces), L cuir, F tissu,
//   M métal, G verre, E ampoules (émissif).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, sphere, prep, paint } from './shapes.js';
import { buildingGeo } from './builders.js';

export const WALL_T = 0.32;
export const FLOOR_Y = 0.18;
// Hauteurs de la devanture : allège des vitrines, haut des baies (sous le bandeau d'enseigne).
export const SILL = 0.6;
export const headY = (G) => G - 1.15;

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function mat4(tf = {}) {
  const m = new THREE.Matrix4();
  _p.set(tf.x || 0, tf.y || 0, tf.z || 0);
  _q.setFromEuler(_e.set(tf.rx || 0, tf.ry || 0, tf.rz || 0, 'YXZ'));
  _s.set(tf.sx ?? 1, tf.sy ?? 1, tf.sz ?? 1);
  return m.compose(_p, _q, _s);
}

// Assemblage de pièces peintes dans des listes par matériau, avec une pile de repères (objets composés : une selle
// posée sur un porte-selle, lui-même fixé au mur…).
export class Kit {
  constructor() {
    this.lists = {};
    this.stack = [new THREE.Matrix4()];
  }
  top() {
    return this.stack[this.stack.length - 1];
  }
  push(tf) {
    this.stack.push(this.top().clone().multiply(mat4(tf)));
    return this;
  }
  pop() {
    this.stack.pop();
    return this;
  }
  add(matKey, geo, color, tf) {
    const g = geo.clone();
    g.applyMatrix4(tf ? this.top().clone().multiply(mat4(tf)) : this.top());
    paint(g, color);
    (this.lists[matKey] ||= []).push(g);
    return this;
  }
  geo(matKey) {
    const l = this.lists[matKey];
    if (!l || !l.length) return null;
    const g = mergeGeometries(l, false);
    l.forEach((x) => x.dispose());
    this.lists[matKey] = [];
    return g;
  }
}

export const torus = (r, t, rs = 6, ts = 18, arc = Math.PI * 2) => prep(new THREE.TorusGeometry(r, t, rs, ts, arc));
export const lathe = (pts, seg = 16) => prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
// Capsule couchée selon x (baguettes, éclairs, rouleaux).
export const capsule = (r, len, seg = 8) => prep(new THREE.CapsuleGeometry(r, len, 3, seg).rotateZ(Math.PI / 2));

// Mur droit percé de baies : x le long du mur (centré), épaisseur selon z (centrée), y depuis 0.
// holes : [{ x0, x1, y0, y1 }] triés selon x.
export function wallWithHoles(kit, key, color, len, H, thick, holes, tf) {
  kit.push(tf);
  let x = -len / 2;
  for (const h of holes) {
    if (h.x0 > x + 0.001) kit.add(key, box(h.x0 - x, H, thick), color, { x: (x + h.x0) / 2 });
    const cx = (h.x0 + h.x1) / 2, wd = h.x1 - h.x0;
    if (h.y0 > 0.001) kit.add(key, box(wd, h.y0, thick), color, { x: cx });
    if (h.y1 < H - 0.001) kit.add(key, box(wd, H - h.y1, thick), color, { x: cx, y: h.y1 });
    x = h.x1;
  }
  if (x < len / 2 - 0.001) kit.add(key, box(len / 2 - x, H, thick), color, { x: (x + len / 2) / 2 });
  kit.pop();
}

// Baies de la devanture (repère local) avec leurs hauteurs.
export function shopHoles(spec) {
  return spec.openings.map(([x0, x1, kind]) => ({ x0, x1, kind, y0: kind === 'door' ? 0 : SILL, y1: headY(spec.G) }));
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

/**
 * Extérieur d'un commerce (repère local). Renvoie :
 * { body, detail, glass, glow : géométries (lot statique, vitrage clair, lanternes), upper : étages (buildingGeo, à
 *   poser à y = G), signs : [{ kind, w, h, x, y, z, ry, double }], colliders : boîtes locales [x, z, hw, hd] }.
 */
export function shopExterior(spec) {
  const { w, d, G } = spec;
  const T = WALL_T;
  const k = new Kit();
  const zf = d / 2;
  const up = spec.upper;
  const side = up.timber ? '#e6dccb' : up.wall;
  const front = spec.front;
  const holes = shopHoles(spec);
  // Murs du rez-de-chaussée : façade percée, pignons et mur arrière pleins.
  wallWithHoles(k, 'body', side, w, G, T, holes, { z: zf - T / 2 });
  k.add('body', box(w, G, T), side, { z: -zf + T / 2 });
  for (const sx of [-1, 1]) k.add('body', box(T, G, d - 2 * T), side, { x: sx * (w / 2 - T / 2) });
  // Soubassement en pierre sur les côtés et à l'arrière.
  k.add('body', box(w + 0.08, 0.45, 0.06), '#9a948a', { z: -zf - 0.03 });
  for (const sx of [-1, 1]) k.add('body', box(0.06, 0.45, d + 0.08), '#9a948a', { x: sx * (w / 2 + 0.03) });
  // Devanture en applique : pilastres sur les trumeaux, chapiteaux et socles.
  const piers = [];
  let x = -w / 2;
  for (const h of holes) {
    if (h.x0 > x + 0.01) piers.push([x, h.x0]);
    x = h.x1;
  }
  if (x < w / 2 - 0.01) piers.push([x, w / 2]);
  const hy = headY(G);
  for (const [a, b] of piers) {
    const cx = (a + b) / 2, pw = b - a;
    k.add('body', box(pw + 0.04, hy, 0.1), front, { x: cx, z: zf + 0.05 });
    k.add('body', box(pw + 0.12, 0.3, 0.16), shade(front, 0.85), { x: cx, z: zf + 0.08 });
    k.add('detail', box(pw + 0.14, 0.16, 0.18), front, { x: cx, y: hy - 0.16, z: zf + 0.09 });
    // Panneau mouluré en creux sur les trumeaux larges.
    if (pw > 0.9) k.add('detail', box(pw - 0.32, hy - 1.1, 0.03), shade(front, 0.82), { x: cx, y: 0.6, z: zf + 0.115 });
  }
  // Soubassements des vitrines (panneaux moulurés), encadrements, petits bois, vitrage.
  for (const h of holes) {
    const cx = (h.x0 + h.x1) / 2, wd = h.x1 - h.x0;
    if (h.kind === 'win') {
      k.add('body', box(wd, SILL, 0.1), front, { x: cx, z: zf + 0.02 });
      k.add('detail', box(wd - 0.3, SILL - 0.26, 0.03), shade(front, 0.82), { x: cx, y: 0.13, z: zf + 0.085 });
      k.add('body', box(wd + 0.06, 0.07, 0.42), shade(front, 1.1), { x: cx, y: SILL - 0.04, z: zf - 0.08 });
      const zg = zf - 0.17;
      const fr = 0.07;
      k.add('body', box(fr, h.y1 - h.y0, 0.12), front, { x: h.x0 + fr / 2, y: h.y0, z: zg });
      k.add('body', box(fr, h.y1 - h.y0, 0.12), front, { x: h.x1 - fr / 2, y: h.y0, z: zg });
      k.add('body', box(wd, fr, 0.12), front, { x: cx, y: h.y1 - fr, z: zg });
      const ty = h.y0 + (h.y1 - h.y0) * 0.74;
      k.add('detail', box(wd, 0.06, 0.1), front, { x: cx, y: ty, z: zg });
      const panes = wd > 3.4 ? 3 : wd > 2.2 ? 2 : 1;
      for (let i = 1; i < panes; i++) k.add('detail', box(0.06, h.y1 - h.y0, 0.1), front, { x: h.x0 + (wd * i) / panes, y: h.y0, z: zg });
      // Petits bois de l'imposte (au-dessus de la traverse).
      for (let i = 1; i < panes * 3; i++) k.add('detail', box(0.03, h.y1 - ty, 0.06), front, { x: h.x0 + (wd * i) / (panes * 3), y: ty, z: zg });
      k.add('glass', box(wd - 0.04, h.y1 - h.y0 - 0.04, 0.012), '#ffffff', { x: cx, y: h.y0 + 0.02, z: zg - 0.01 });
    } else {
      // Porte vitrée au fond de l'embrasure : montants, traverses, panneau bas, poignée de laiton, imposte.
      const zd = zf - T + 0.05;
      const dh = 2.42;
      const st = 0.11;
      k.push({ x: cx, z: zd });
      k.add('body', box(st, dh, 0.06), front, { x: -wd / 2 + st / 2 });
      k.add('body', box(st, dh, 0.06), front, { x: wd / 2 - st / 2 });
      k.add('body', box(wd, 0.28, 0.06), front, { y: 0 });
      k.add('body', box(wd, 0.12, 0.06), front, { y: 0.92 });
      k.add('body', box(wd, 0.13, 0.06), front, { y: dh - 0.13 });
      k.add('body', box(wd - 2 * st, 0.64, 0.035), shade(front, 0.82), { y: 0.28 });
      k.add('detail', box(0.035, 0.48, 0.05), '#b08d57', { x: wd / 2 - 0.2, y: 0.85, z: 0.07 });
      k.add('detail', box(0.035, 0.48, 0.05), '#b08d57', { x: wd / 2 - 0.2, y: 0.85, z: -0.07 });
      k.add('glass', box(wd - 2 * st, dh - 1.17, 0.012), '#ffffff', { y: 1.04 });
      // Imposte vitrée et dormant.
      k.add('body', box(wd, 0.08, 0.1), front, { y: dh });
      if (h.y1 - dh > 0.25) k.add('glass', box(wd - 0.08, h.y1 - dh - 0.1, 0.012), '#ffffff', { y: dh + 0.08 });
      k.pop();
      // Seuil en pierre débordant sur le trottoir (marche de 16 cm).
      k.add('body', box(wd + 0.5, 0.16, T + 0.4), '#b9b4a8', { x: cx, z: zf - T / 2 + 0.2 });
      // Lanternes de part et d'autre de la porte : potence, cage noire, verre éclairé la nuit.
      for (const sx of [-1, 1]) {
        const lx = sx > 0 ? h.x1 + 0.35 : h.x0 - 0.35;
        k.add('detail', box(0.04, 0.04, 0.3), '#1b1c1f', { x: lx, y: 2.62, z: zf + 0.25 });
        k.add('body', box(0.22, 0.36, 0.22), '#1b1c1f', { x: lx, y: 2.3, z: zf + 0.42 });
        k.add('glow', box(0.17, 0.26, 0.24), '#ffe6b0', { x: lx, y: 2.35, z: zf + 0.42 });
        k.add('detail', cyl(0.02, 0.14, 0.12, 6), '#1b1c1f', { x: lx, y: 2.66, z: zf + 0.42 });
      }
    }
  }
  // Bandeau d'enseigne, moulure basse, corniche et bavette de zinc.
  k.add('body', box(w + 0.12, 0.86, 0.16), front, { y: hy, z: zf + 0.08 });
  k.add('body', box(w + 0.22, 0.08, 0.22), shade(front, 0.85), { y: hy - 0.06, z: zf + 0.11 });
  k.add('body', box(w + 0.38, 0.16, 0.36), front, { y: G - 0.3, z: zf + 0.17 });
  k.add('detail', box(w + 0.42, 0.03, 0.4), '#8d9296', { y: G - 0.14, z: zf + 0.19 });
  const signs = [{ kind: 'fascia', w: w - 0.9, h: 0.66, x: 0, y: hy + 0.43, z: zf + 0.165, ry: 0 }];
  // Store banne rayé sur toute la devanture (café, boutique).
  if (spec.awning) {
    const [c1, c2] = spec.awning;
    const aw = w - 0.4;
    const n = Math.max(3, Math.round(aw / 0.55));
    const y0 = hy - 0.02;
    for (let i = 0; i < n; i++) k.add('body', box(aw / n + 0.01, 0.05, 1.5), i % 2 ? c1 : c2, { x: -aw / 2 + (aw / n) * (i + 0.5), y: y0, z: zf + 0.2 + 0.72, rx: 0.36 });
    // Lambrequin festonné.
    for (let i = 0; i < n; i++) k.add('body', box(aw / n - 0.02, 0.24, 0.03), i % 2 ? c1 : c2, { x: -aw / 2 + (aw / n) * (i + 0.5), y: y0 - 0.77, z: zf + 0.2 + 1.4 });
    k.add('detail', box(0.03, 0.03, 1.5), '#1b1c1f', { x: -aw / 2, y: y0 - 0.3, z: zf + 0.9, rx: 0.36 });
    k.add('detail', box(0.03, 0.03, 1.5), '#1b1c1f', { x: aw / 2, y: y0 - 0.3, z: zf + 0.9, rx: 0.36 });
  }
  // Enseigne drapeau sur sa potence en fer forgé, au premier étage, côté porte.
  const door = holes.find((h) => h.kind === 'door');
  const bx = door.x0 + (door.x1 - door.x0) / 2 < 0 ? -w / 2 + 0.6 : w / 2 - 0.6;
  k.add('detail', box(0.05, 0.05, 1.05), '#1b1c1f', { x: bx, y: G + 0.95, z: zf + 0.52 });
  k.add('detail', box(0.04, 0.5, 0.04), '#1b1c1f', { x: bx, y: G + 0.48, z: zf + 0.06, rx: 0 });
  k.add('detail', box(0.03, 0.03, 0.62), '#1b1c1f', { x: bx, y: G + 0.7, z: zf + 0.3, rx: -0.75 });
  k.add('body', cyl(0.42, 0.42, 0.06, 20), spec.front, { x: bx, y: G + 0.52, z: zf + 0.7, rz: Math.PI / 2 });
  signs.push({ kind: 'blade', w: 0.78, h: 0.78, x: bx + 0.035, y: G + 0.52 + 0.42 - 0.42, z: zf + 0.7, ry: Math.PI / 2, double: true, bx });
  // Étages d'habitation au-dessus du commerce.
  const upper = buildingGeo({ w, d, h: up.h, floors: up.floors, wall: up.wall, roof: up.roof, roofType: up.roofType, timber: !!up.timber, fill: up.fill ?? null, wood: up.wood ?? null, trim: up.trim || null, chimney: !!up.chimney, door: false, plinth: null, sink: 0, bays: false });
  // Collisions : les quatre murs (porte fermée : on entre avec l'action « Entrer »).
  const colliders = [
    [0, zf - T / 2, w / 2, T / 2],
    [0, -zf + T / 2, w / 2, T / 2],
    [-w / 2 + T / 2, 0, T / 2, d / 2],
    [w / 2 - T / 2, 0, T / 2, d / 2],
  ];
  return { body: k.geo('body'), detail: k.geo('detail'), glass: k.geo('glass'), glow: k.geo('glow'), upper, signs, colliders };
}

// ---------- Pièces d'intérieur ----------

// Habillage intérieur : plancher, plafond, murs (lambris bas, enduit), plinthes, retours des baies de la façade.
export function roomShell(k, spec, { floor, wall, wainscot = null, wainH = 1.0, ceiling = '#efe9df', beams = null, skirting = '#5b4330' }) {
  const { w, d, G } = spec;
  const T = WALL_T;
  const iw = w - 2 * T, id = d - 2 * T;
  const F = FLOOR_Y;
  k.add('A', box(iw, F, id), floor, { y: 0 });
  k.add('A', box(iw, 0.1, id), ceiling, { y: G - 0.1 });
  if (beams) for (let x = -iw / 2 + 1.1; x < iw / 2 - 0.5; x += 2.2) k.add('A', box(0.18, 0.24, id), beams, { x, y: G - 0.34 });
  const H = G - F - 0.1;
  const L = 0.03;
  // Murs pleins : arrière et côtés.
  const plain = [
    { len: iw, tf: { z: -id / 2 + L / 2 } },
    { len: id, tf: { x: -iw / 2 + L / 2, ry: Math.PI / 2 } },
    { len: id, tf: { x: iw / 2 - L / 2, ry: Math.PI / 2 } },
  ];
  for (const p of plain) {
    k.push({ ...p.tf, y: F });
    k.add('A', box(p.len, H, L), wall);
    if (wainscot) {
      k.add('A', box(p.len, wainH, 0.04), wainscot, { z: 0 });
      k.add('A', box(p.len, 0.05, 0.07), shade(wainscot, 1.15), { y: wainH });
    }
    k.add('A', box(p.len, 0.14, 0.06), skirting, { z: 0 });
    k.pop();
  }
  // Façade vue de l'intérieur : mêmes baies que la maçonnerie.
  const holes = shopHoles(spec).map((h) => ({ ...h, y0: Math.max(0, h.y0 - F), y1: h.y1 - F }));
  wallWithHoles(k, 'A', wall, iw, H, L, holes.map((h) => ({ ...h })), { z: id / 2 - L / 2, y: F });
  // Ébrasements intérieurs des vitrines (tablettes) et des portes.
  for (const h of holes) {
    const cx = (h.x0 + h.x1) / 2;
    if (h.kind === 'win') k.add('A', box(h.x1 - h.x0, 0.05, 0.36), shade(wall, 0.92), { x: cx, y: F + h.y0, z: id / 2 - 0.15 });
  }
}

// Selle (repère : centre du siège au sol de la selle, pommeau vers +z) ; pad : couleur du tapis (null : sans).
export function saddle(k, tf, leather = '#5a3520', pad = null, trim = '#f2f1ec') {
  k.push(tf);
  const dark = shade(leather, 0.7);
  // Siège creusé, panneaux rembourrés, troussequin et pommeau, quartiers larges et taquets.
  k.add('L', sphere(1, 16, 8), leather, { y: 0.05, sx: 0.23, sy: 0.08, sz: 0.31 });
  k.add('L', box(0.38, 0.1, 0.56), dark, { y: -0.05 });
  k.add('L', box(0.28, 0.12, 0.06), leather, { y: 0.06, z: -0.27, rx: -0.5 });
  k.add('L', box(0.18, 0.09, 0.07), leather, { y: 0.05, z: 0.27, rx: 0.4 });
  for (const s of [-1, 1]) {
    // Quartiers tombant presque droit le long des panneaux ; étrivières et étriers remontés (selle en présentation).
    k.add('L', box(0.03, 0.46, 0.46), leather, { x: s * 0.2, y: -0.45, z: 0.06, rz: s * 0.12, rx: -0.12 });
    k.add('L', box(0.04, 0.24, 0.1), dark, { x: s * 0.225, y: -0.3, z: 0.2, rz: s * 0.12, rx: -0.2 });
    k.add('L', box(0.014, 0.2, 0.03), dark, { x: s * 0.245, y: -0.22, z: 0.0, rz: s * 0.1 });
    k.add('M', torus(0.05, 0.008, 4, 12), '#c9cdd0', { x: s * 0.255, y: -0.3, z: 0, ry: Math.PI / 2 });
    k.add('M', box(0.09, 0.012, 0.03), '#c9cdd0', { x: s * 0.255, y: -0.35, z: 0 });
  }
  if (pad) {
    k.add('F', box(0.5, 0.02, 0.62), pad, { y: -0.1 });
    for (const s of [-1, 1]) {
      k.add('F', box(0.02, 0.5, 0.62), pad, { x: s * 0.24, y: -0.58, z: -0.02, rz: s * 0.2 });
      k.add('F', box(0.022, 0.03, 0.62), trim, { x: s * 0.33, y: -0.6, z: -0.02, rz: s * 0.2 });
    }
  }
  k.pop();
}

// Bridon suspendu à un crochet (repère : le crochet, bridon face à +z).
export function bridle(k, tf, leather = '#3a2516', bit = '#c9cdd0') {
  k.push(tf);
  k.add('M', cyl(0.025, 0.025, 0.12, 6), '#b08d57', { z: 0.06, rx: Math.PI / 2 });
  k.add('L', torus(0.085, 0.011, 4, 14, Math.PI), leather, { y: -0.08, z: 0.08 });
  for (const s of [-1, 1]) k.add('L', box(0.022, 0.42, 0.012), leather, { x: s * 0.085, y: -0.5, z: 0.08 });
  k.add('L', box(0.2, 0.025, 0.012), leather, { y: -0.2, z: 0.08 });
  k.add('L', torus(0.09, 0.014, 4, 16), leather, { y: -0.5, z: 0.08, rx: Math.PI / 2, sz: 0.6 });
  k.add('M', box(0.22, 0.012, 0.012), bit, { y: -0.72, z: 0.08 });
  for (const s of [-1, 1]) k.add('M', torus(0.025, 0.005, 4, 10), bit, { x: s * 0.11, y: -0.72, z: 0.08, ry: Math.PI / 2 });
  // Rênes en boucle.
  k.add('L', torus(0.24, 0.009, 4, 20), leather, { y: -0.98, z: 0.1, sx: 0.5 });
  k.pop();
}

// Licol en sangle colorée avec sa longe enroulée.
export function halter(k, tf, color = '#1f2b45') {
  k.push(tf);
  k.add('M', cyl(0.025, 0.025, 0.12, 6), '#b08d57', { z: 0.06, rx: Math.PI / 2 });
  k.add('F', torus(0.08, 0.014, 4, 12, Math.PI), color, { y: -0.08, z: 0.08 });
  for (const s of [-1, 1]) k.add('F', box(0.028, 0.32, 0.014), color, { x: s * 0.08, y: -0.4, z: 0.08 });
  k.add('F', torus(0.085, 0.016, 4, 14), color, { y: -0.42, z: 0.08, rx: Math.PI / 2, sz: 0.6 });
  k.add('F', torus(0.14, 0.02, 5, 16), shade(color, 1.25), { y: -0.66, z: 0.1, sx: 0.8 });
  k.add('M', box(0.05, 0.03, 0.03), '#c9cdd0', { y: -0.5, z: 0.12 });
  k.pop();
}

// Pile de tapis pliés (couleur, nombre, liseré).
export function padStack(k, tf, color, n = 6, trim = '#f2f1ec') {
  k.push(tf);
  for (let i = 0; i < n; i++) {
    const j = ((i * 37) % 7) / 100;
    k.add('F', box(0.52, 0.04, 0.4), color, { y: i * 0.042, x: j - 0.03, ry: j * 0.6 });
    k.add('F', box(0.54, 0.012, 0.42), trim, { y: i * 0.042 + 0.012, x: j - 0.03, ry: j * 0.6 });
  }
  k.pop();
}

// Paire de guêtres (coques) ou de cloches posées.
export function bootsPair(k, tf, kind = 'guetres', color = '#17181b') {
  k.push(tf);
  for (const s of [-1, 1]) {
    if (kind === 'guetres') {
      k.add('L', cyl(0.06, 0.075, 0.26, 10), color, { x: s * 0.09, rx: 0.08 });
      k.add('F', box(0.1, 0.03, 0.03), '#c8c2b6', { x: s * 0.09, y: 0.08, z: 0.07 });
      k.add('F', box(0.1, 0.03, 0.03), '#c8c2b6', { x: s * 0.09, y: 0.17, z: 0.07 });
    } else {
      k.add('L', cyl(0.05, 0.1, 0.13, 12), color, { x: s * 0.12 });
    }
  }
  k.pop();
}

// Casque d'équitation (coque, visière, harnais).
export function helmet(k, tf, color = '#1f2b45') {
  k.push(tf);
  k.add('L', sphere(1, 14, 8), color, { y: 0.0, sx: 0.115, sy: 0.12, sz: 0.14 });
  k.add('L', box(0.2, 0.012, 0.06), shade(color, 0.8), { y: 0.0, z: 0.13, rx: 0.15 });
  k.add('F', box(0.012, 0.12, 0.012), '#1b1c1f', { x: 0.1, y: -0.08 });
  k.add('F', box(0.012, 0.12, 0.012), '#1b1c1f', { x: -0.1, y: -0.08 });
  k.pop();
}

// Paire de bottes hautes.
export function ridingBoots(k, tf, color = '#121214') {
  k.push(tf);
  for (const s of [-1, 1]) {
    k.add('L', cyl(0.06, 0.055, 0.5, 10), color, { x: s * 0.08, y: 0.07 });
    k.add('L', box(0.1, 0.08, 0.27), color, { x: s * 0.08, z: 0.06 });
    k.add('L', box(0.1, 0.02, 0.28), '#0b0b0c', { x: s * 0.08, y: 0, z: 0.06 });
  }
  k.pop();
}

// Vêtement sur cintre (veste, pull, polo) : repère au crochet du cintre, face à +z.
export function garment(k, tf, color, { len = 0.72, wid = 0.48, collar = null } = {}) {
  k.push(tf);
  k.add('M', torus(0.03, 0.005, 4, 8, Math.PI * 1.4), '#8d9296', { y: 0.02, rz: -0.4 });
  k.add('A', box(wid, 0.02, 0.02), '#a37a52', { y: -0.06, rz: 0 });
  k.add('F', box(wid - 0.04, len, 0.07), color, { y: -0.06 - len });
  for (const s of [-1, 1]) k.add('F', box(0.1, len * 0.85, 0.06), shade(color, 0.92), { x: s * (wid / 2 + 0.02), y: -0.1 - len * 0.85, rz: s * 0.05 });
  if (collar) k.add('F', box(0.16, 0.06, 0.075), collar, { y: -0.12 });
  k.pop();
}

// Mannequin de vitrine (sans visage) : pied, buste, épaules, tête ; vêtement de couleur top.
export function mannequin(k, tf, { top = '#1f2b45', bottom = '#efeae0', collar = null, cap = null, head = '#e9e2d6', jacket = false } = {}) {
  k.push(tf);
  k.add('M', cyl(0.18, 0.2, 0.03, 16), '#1b1c1f');
  k.add('M', cyl(0.018, 0.018, 0.85, 6), '#8d9296');
  k.add('F', cyl(0.13, 0.15, 0.32, 12), bottom, { y: 0.78 });
  k.add('F', cyl(0.15, 0.13, 0.55, 12), top, { y: 1.08, sz: 0.75 });
  k.add('F', sphere(1, 12, 8), top, { y: 1.6, sx: 0.21, sy: 0.07, sz: 0.12 });
  for (const s of [-1, 1]) k.add('F', cyl(0.045, 0.04, 0.55, 8), jacket ? top : shade(top, 0.95), { x: s * 0.2, y: 1.06, rz: s * 0.08 });
  if (collar) k.add('F', cyl(0.06, 0.07, 0.07, 10), collar, { y: 1.63 });
  k.add('A', cyl(0.035, 0.04, 0.1, 8), head, { y: 1.64 });
  k.add('A', sphere(1, 12, 10), head, { y: 1.83, sx: 0.09, sy: 0.115, sz: 0.1 });
  if (cap) {
    k.add('F', sphere(1, 12, 6), cap, { y: 1.86, sx: 0.1, sy: 0.07, sz: 0.11 });
    k.add('F', box(0.13, 0.012, 0.09), cap, { y: 1.86, z: 0.12 });
  }
  k.pop();
}

// Étagère (montants et tablettes) : largeur w (x), profondeur dp, tablettes aux hauteurs ys.
export function shelving(k, tf, w, dp, ys, color = '#a37a52', back = null) {
  k.push(tf);
  const H = ys[ys.length - 1] + 0.04;
  for (const s of [-1, 1]) k.add('A', box(0.04, H, dp), color, { x: s * (w / 2 - 0.02) });
  for (const y of ys) k.add('A', box(w, 0.035, dp), color, { y });
  if (back) k.add('A', box(w, H, 0.02), back, { z: -dp / 2 + 0.01 });
  k.pop();
}

// Suspension : fil, abat-jour, ampoule (y = hauteur du plafond).
export function pendant(k, x, z, ceilY, { drop = 0.9, shadeColor = '#1f3a2c', kind = 'cone' } = {}) {
  k.add('M', cyl(0.006, 0.006, drop, 4), '#1b1c1f', { x, y: ceilY - drop, z });
  if (kind === 'globe') k.add('E', sphere(1, 14, 10), '#fff1d0', { x, y: ceilY - drop - 0.12, z, sx: 0.16, sy: 0.16, sz: 0.16 });
  else {
    k.add('M', lathe([[0.03, 0.2], [0.07, 0.17], [0.2, 0.02], [0.21, 0]], 16), shadeColor, { x, y: ceilY - drop - 0.2, z });
    k.add('E', sphere(1, 10, 8), '#fff1d0', { x, y: ceilY - drop - 0.16, z, sx: 0.06, sy: 0.06, sz: 0.06 });
  }
}

// Petite étiquette de prix (carton blanc) posée ou suspendue.
export function tag(k, tf) {
  k.add('A', box(0.11, 0.07, 0.008), '#f7f4ed', tf);
}
