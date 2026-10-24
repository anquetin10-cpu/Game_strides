// Modèle 3D du camion porte-chevaux STRIDES : porteur 7,5 t à cabine avancée (type Renault D / Iveco Eurocargo),
// carrosserie chevaux 2 places avec capucine, espace de vie, porte de service, pont arrière à portillons,
// intérieur (sol caoutchouc, parois matelassées, bat-flanc, barres de poitrail, anneaux, filets à foin).
// Tout est procédural. Pièces statiques fusionnées (un seul matériau PBR via l'atlas) ; seules les pièces
// animées sont séparées : pont, portillons, bat-flanc, porte, roues. Repère : x à gauche, y en haut, z vers l'avant.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { truckTexture } from '../world/textures.js';

// Cotes principales (m).
export const TRUCK_DIM = {
  L: 8.5,
  W: 2.5,
  H: 3.4,
  floor: 0.92, // plancher du box
  wheelR: 0.385,
  zFront: 2.75,
  zRear: -1.45,
  trackF: 1.95,
  rampLen: 2.3,
  rampW: 2.3,
  hingeZ: -4.2,
  bulkZ: -0.82, // cloison avant du compartiment chevaux
  doorZ: [-0.45, 0.25], // porte de service (flanc droit)
  stalls: [
    { x: -0.6, z: -2.9 }, // stalle droite (côté trottoir)
    { x: 0.6, z: -2.9 },
  ],
  corridor: -1.45, // couloir de service devant les têtes (porte de passage à droite)
  passDoor: [-0.92, -0.32],
  partitionHinge: { x: 0, z: -1.45 },
  partitionOpen: -0.45,
  seat: { x: 0.56, y: 1.12, z: 2.72 }, // origine du personnage assis (poste de conduite, à gauche)
  camRear: { x: -3.6, y: 2.6, z: -10.5 },
};

// Groupes de feux (texels de la carte d'émission).
export const LIGHT = { head: 0, drl: 1, tail: 2, brake: 3, rev: 4, indL: 5, indR: 6, side: 7, interior: 8, plate: 9, fog: 10, clearF: 11, clearR: 12, dash: 13 };
const LIGHT_N = 16;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function tfm({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}

// Géométries de base (centrées).
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, r);
// Dalle en plan arrondi (x × [z0, z1]) : rayons d'angle avant rf et arrière rb, épaisseur h vers le bas, biseau.
function planSlab(w, z0, z1, rf, rb, h, bevel) {
  const s = new THREE.Shape();
  const x0 = -w / 2 + bevel, x1 = w / 2 - bevel;
  const za = z0 + bevel, zb = z1 - bevel;
  s.moveTo(x0 + rb, za);
  s.lineTo(x1 - rb, za);
  s.quadraticCurveTo(x1, za, x1, za + rb);
  s.lineTo(x1, zb - rf);
  s.quadraticCurveTo(x1, zb, x1 - rf, zb);
  s.lineTo(x0 + rf, zb);
  s.quadraticCurveTo(x0, zb, x0, zb - rf);
  s.lineTo(x0, za + rb);
  s.quadraticCurveTo(x0, za, x0 + rb, za);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(Math.PI / 2);
  g.translate(0, -bevel, 0);
  return g;
}
const cylX = (r, len, seg = 12, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateZ(Math.PI / 2); // axe x
const cylY = (r, len, seg = 12, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg);
const cylZ = (r, len, seg = 12, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2);
// Tube entre deux points.
function tube(a, b, r, seg = 8) {
  _a.set(...a);
  _b.set(...b);
  const dir = _b.clone().sub(_a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(_q.setFromUnitVectors(_n.set(0, 1, 0), dir.normalize()));
  g.translate(_a.x, _a.y, _a.z);
  return g;
}

// Collecteur de pièces : géométries non indexées, UV vers l'atlas, fusion par « emplacement » (maillage final).
class Kit {
  constructor(atlas) {
    this.atlas = atlas;
    this.slots = {};
  }
  add(slot, geo, mat, tf) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (tf) g.applyMatrix4(tf.isMatrix4 ? tf : tfm(tf));
    if (typeof mat === 'string') this.swatch(g, mat);
    else if (typeof mat === 'function') mat(g, this);
    (this.slots[slot] ||= []).push(g);
    return g;
  }
  swatch(g, name) {
    const uv = this.atlas.swatchUV[name];
    if (!uv) throw new Error(`pastille inconnue : ${name}`);
    const a = g.attributes.uv.array;
    for (let i = 0; i < a.length; i += 2) {
      a[i] = uv[0];
      a[i + 1] = uv[1];
    }
  }
  // Attribue une pastille ou une projection par triangle selon la normale de la face (repère du camion).
  byFace(fn) {
    return (g) => {
      const p = g.attributes.position.array;
      const uv = g.attributes.uv.array;
      for (let t = 0; t < p.length / 9; t++) {
        const i = t * 9;
        _a.set(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]);
        _b.set(p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]);
        _n.crossVectors(_a, _b).normalize();
        const cx = (p[i] + p[i + 3] + p[i + 6]) / 3, cy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3, cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
        const res = fn(_n, cx, cy, cz);
        for (let k = 0; k < 3; k++) {
          const vi = t * 3 + k;
          if (typeof res === 'string') {
            const sw = this.atlas.swatchUV[res];
            uv[vi * 2] = sw[0];
            uv[vi * 2 + 1] = sw[1];
          } else {
            const [u, v] = res(p[(t * 3 + k) * 3], p[(t * 3 + k) * 3 + 1], p[(t * 3 + k) * 3 + 2]);
            uv[vi * 2] = u;
            uv[vi * 2 + 1] = v;
          }
        }
      }
    };
  }
  // Projection plane d'un rectangle de livrée : (a, b) ∈ [a0, a1] × [b0, b1] → rectangle UV.
  proj(rect, a0, a1, b0, b1, pick) {
    const r = this.atlas.rectUV[rect];
    return (x, y, z) => {
      const [pa, pb] = pick(x, y, z);
      const ka = Math.min(1, Math.max(0, (pa - a0) / (a1 - a0)));
      const kb = Math.min(1, Math.max(0, (pb - b0) / (b1 - b0)));
      return [r.u0 + ka * (r.u1 - r.u0), r.v0 + kb * (r.v1 - r.v0)];
    };
  }
  merge(slot) {
    const list = this.slots[slot];
    if (!list || !list.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(list, false);
    list.forEach((x) => x.dispose());
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- Roue 225/75 R17,5 (axe x, face extérieure vers +x) ----------
function wheelGeo(kit, slot, tf, front) {
  const R = TRUCK_DIM.wheelR;
  // Pneu : profil (rayon, x) révolu autour de l'axe ; sculptures longitudinales.
  const P = [
    [0.226, -0.094], [0.262, -0.104], [0.31, -0.112], [0.35, -0.106], [0.372, -0.092], [0.383, -0.075],
    [0.385, -0.052], [0.376, -0.05], [0.376, -0.036], [0.385, -0.034], [0.385, -0.008], [0.376, -0.006],
    [0.376, 0.006], [0.385, 0.008], [0.385, 0.034], [0.376, 0.036], [0.376, 0.05], [0.385, 0.052],
    [0.383, 0.075], [0.372, 0.092], [0.35, 0.106], [0.31, 0.112], [0.262, 0.104], [0.226, 0.094],
  ].map(([r, x]) => new THREE.Vector2(r * (R / 0.385), x));
  // Lathe tourne autour de y : on bascule ensuite y → x. Points (rayon, hauteur) avec hauteur = position axiale.
  const tyre = new THREE.LatheGeometry(P, 30);
  tyre.rotateZ(-Math.PI / 2);
  kit.add(slot, tyre, kit.byFace((n, cx, cy, cz) => (Math.abs(n.x) > 0.55 ? 'tyreSide' : 'tyre')), tf);
  // Jante acier 17,5" : bord, voile embouti, trous d'aération, écrous, cache-moyeu.
  const dish = front ? 0.07 : 0.085;
  const J = [
    [0.231, -0.096], [0.221, -0.09], [0.207, -0.084], [0.205, 0.06], [0.212, 0.082], [0.224, 0.09], [0.229, 0.096],
    [0.214, 0.098], [0.196, 0.075], [0.165, dish], [0.125, dish + 0.004], [0.105, dish + 0.016], [0.07, dish + 0.02], [0.0, dish + 0.02],
  ].map(([r, x]) => new THREE.Vector2(r, x));
  const rim = new THREE.LatheGeometry(J, 24);
  rim.rotateZ(-Math.PI / 2);
  kit.add(slot, rim, 'rim', tf);
  const m0 = tf.clone();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    // Trous ovales du voile.
    const hole = new THREE.CylinderGeometry(0.028, 0.028, 0.012, 10);
    hole.scale(1, 1, 1.45);
    hole.rotateZ(Math.PI / 2);
    hole.rotateX(a);
    hole.translate(dish + 0.004, Math.cos(a) * 0.145, Math.sin(a) * 0.145);
    kit.add(slot, hole, 'darkHole', m0);
    // Écrous.
    const b = a + Math.PI / 6;
    const nut = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6);
    nut.rotateZ(Math.PI / 2);
    nut.translate(dish + 0.032, Math.cos(b) * 0.092, Math.sin(b) * 0.092);
    kit.add(slot, nut, 'steel', m0);
  }
  const cap = new THREE.CylinderGeometry(0.052, 0.06, 0.05, 16);
  cap.rotateZ(Math.PI / 2);
  cap.translate(dish + 0.045, 0, 0);
  kit.add(slot, cap, 'hub', m0);
}

// ---------- Mur à ouvertures : découpe en cellules autour des trous ----------
function wallCells(z0, z1, y0, y1, holes, cutsZ = [], cutsY = []) {
  const zs = [z0, z1, ...cutsZ];
  const ys = [y0, y1, ...cutsY];
  for (const h of holes) {
    zs.push(h.z0, h.z1);
    ys.push(h.y0, h.y1);
  }
  const uz = [...new Set(zs.map((v) => +v.toFixed(4)))].sort((a, b) => a - b).filter((v) => v >= z0 && v <= z1);
  const uy = [...new Set(ys.map((v) => +v.toFixed(4)))].sort((a, b) => a - b).filter((v) => v >= y0 && v <= y1);
  const cells = [];
  for (let i = 0; i < uz.length - 1; i++) {
    for (let j = 0; j < uy.length - 1; j++) {
      const cz = (uz[i] + uz[i + 1]) / 2, cy = (uy[j] + uy[j + 1]) / 2;
      if (holes.some((h) => cz > h.z0 && cz < h.z1 && cy > h.y0 && cy < h.y1)) continue;
      cells.push({ z0: uz[i], z1: uz[i + 1], y0: uy[j], y1: uy[j + 1] });
    }
  }
  return cells;
}

// Construit l'ensemble des maillages du camion. Renvoie { root, body, wheels, ramp, gates, partition, door, materials, lights }.
export function buildTruckModel({ textureScale = 1 } = {}) {
  const D = TRUCK_DIM;
  const atlas = truckTexture(textureScale);
  const kit = new Kit(atlas);
  const hF = D.floor;
  const XO = 1.25; // face extérieure des flancs
  const XI = 1.205; // face intérieure
  const ZB = -4.25; // arrière
  const ZF = 2.05; // avant du box
  const TOP = 3.3;
  const lights = [];
  const glass = [];
  const addLight = (geo, group, color, tf) => lights.push([geo, group, color, tf]);
  const addGlass = (geo, tf) => glass.push([geo, tf]);

  // ===== Cabine =====
  const CB = 2.22, CF = 4.17, CW = 2.32, CY0 = 0.98, CBELT = 1.78, CROOF = 2.82;
  // Bas de caisse (sous la ceinture de vitrage) : plan arrondi aux angles avant, arêtes adoucies.
  kit.add('body', planSlab(CW, CB, CF, 0.24, 0.05, CBELT - CY0, 0.025), 'paint', { y: CBELT });
  // Pavillon.
  kit.add('body', planSlab(CW, CB, 4.08, 0.2, 0.05, 0.13, 0.03), 'paint', { y: CROOF });
  // Montants de pare-brise (inclinés), montants milieu, panneaux arrière de cabine.
  for (const s of [-1, 1]) {
    kit.add('body', rbox(0.1, CROOF - 0.1 - CBELT, 0.075, 0.025), 'paint', { x: s * 1.105, y: (CBELT + CROOF - 0.1) / 2, z: 4.055, rx: -Math.atan2(0.14, CROOF - 0.13 - CBELT) });
    kit.add('body', boxG(0.075, CROOF - CBELT, 0.13), 'paint', { x: s * 1.12, y: (CBELT + CROOF) / 2, z: 2.97 });
    kit.add('body', boxG(0.06, CROOF - CBELT, 0.72), 'paint', { x: s * 1.13, y: (CBELT + CROOF) / 2, z: 2.6 });
    // Joint de vitre (noir).
    kit.add('body', boxG(0.02, 0.025, 0.98), 'rubber', { x: s * 1.163, y: CBELT + 0.012, z: 3.5 });
  }
  kit.add('body', boxG(CW - 0.04, CROOF - CBELT, 0.08), 'paint', { y: (CBELT + CROOF) / 2, z: CB + 0.04 });
  // Pare-brise (incliné ~9°) et vitres latérales.
  const wsTilt = Math.atan2(0.14, CROOF - 0.13 - CBELT);
  addGlass(boxG(2.1, 0.92, 0.012), { y: (CBELT + CROOF - 0.12) / 2 + 0.005, z: 4.065, rx: -wsTilt });
  kit.add('body', boxG(2.16, 0.04, 0.03), 'rubber', { y: CBELT + 0.02, z: 4.13 });
  kit.add('body', boxG(2.12, 0.035, 0.03), 'rubber', { y: CROOF - 0.12, z: 3.99 });
  for (const s of [-1, 1]) addGlass(boxG(0.012, 0.86, 0.95), { x: s * 1.155, y: CBELT + 0.45, z: 3.5 });
  // Pare-soleil extérieur : non (capucine). Essuie-glaces au repos.
  for (const s of [-1, 1]) {
    kit.add('body', boxG(0.82, 0.012, 0.018), 'plastic', { x: s * 0.42 - 0.08, y: CBELT + 0.07, z: 4.135, rz: s * 0.06, rx: -wsTilt });
    kit.add('body', boxG(0.05, 0.03, 0.06), 'plastic', { x: s * 0.82 - 0.08, y: CBELT + 0.04, z: 4.15 });
  }
  // Intérieur de cabine (visible par les vitres) : planche de bord, volant, sièges.
  kit.add('body', boxG(2.18, 0.16, 0.5), 'dash', { y: CBELT - 0.02, z: 3.85 });
  kit.add('body', rbox(0.6, 0.1, 0.22, 0.04), 'dash', { x: 0.56, y: CBELT + 0.1, z: 3.9 });
  const wheel = new THREE.TorusGeometry(0.22, 0.022, 6, 22);
  kit.add('body', wheel, 'dash', { x: 0.56, y: 1.92, z: 3.55, rx: -1.2 });
  kit.add('body', cylY(0.035, 0.42, 8), 'dash', { x: 0.56, y: 1.85, z: 3.72, rx: 0.35 });
  for (const sx of [0.56, -0.56]) {
    kit.add('body', rbox(0.5, 0.72, 0.13, 0.05), 'seat', { x: sx, y: 1.92, z: 2.52, rx: -0.2 });
    kit.add('body', rbox(0.3, 0.2, 0.1, 0.04), 'seat', { x: sx, y: 2.38, z: 2.43, rx: -0.2 });
  }
  kit.add('body', rbox(0.4, 0.5, 0.12, 0.04), 'seat', { y: 1.85, z: 2.4, rx: -0.15 });
  kit.add('body', boxG(CW - 0.12, 0.02, 1.8), 'cabTrim', { y: CROOF - 0.15, z: CB + 0.95 });
  for (const s of [-1, 1]) kit.add('body', boxG(0.5, 0.02, 0.22), 'cabTrim', { x: s * 0.55, y: CROOF - 0.18, z: 3.95, rx: 0.2 });
  // Calandre : fond sombre, lames, logo.
  kit.add('body', boxG(1.62, 0.5, 0.03), 'grille', { y: 1.45, z: CF + 0.005 });
  for (let i = 0; i < 4; i++) kit.add('body', rbox(1.66, 0.045, 0.05, 0.015), 'plastic', { y: 1.27 + i * 0.12, z: CF + 0.03 });
  kit.add('body', boxG(1.7, 0.03, 0.05), 'alu', { y: 1.72, z: CF + 0.02 });
  kit.add('body', boxG(0.22, 0.22, 0.012), kit.byFace((n) => (n.z > 0.5 ? (x, y) => {
    const r = atlas.rectUV.badge;
    return [r.u0 + ((x + 0.11) / 0.22) * (r.u1 - r.u0), r.v0 + ((y - 1.36) / 0.22) * (r.v1 - r.v0)];
  } : 'chrome')), { y: 1.47, z: CF + 0.06 });
  // Projecteurs : boîtier noir, deux paraboles chromées (code / route) et ampoules, feu de jour, clignotant.
  for (const s of [-1, 1]) {
    kit.add('body', rbox(0.42, 0.22, 0.09, 0.04), 'plastic', { x: s * 0.81, y: 1.11, z: CF + 0.0 });
    for (const [dx, r] of [[0.08, 0.072], [-0.07, 0.06]]) {
      const bowl = new THREE.LatheGeometry([[0.0, -0.035], [r * 0.45, -0.03], [r * 0.85, -0.012], [r, 0.0]].map(([a, b]) => new THREE.Vector2(a, b)), 16);
      bowl.rotateX(-Math.PI / 2);
      kit.add('body', bowl, 'chrome', { x: s * (0.81 + dx), y: 1.115, z: CF + 0.07 });
      addLight(new THREE.SphereGeometry(r * 0.32, 10, 6), LIGHT.head, '#eef1f2', { x: s * (0.81 + dx), y: 1.115, z: CF + 0.05 });
    }
    addLight(boxG(0.04, 0.16, 0.02), s > 0 ? LIGHT.indL : LIGHT.indR, '#c07a20', { x: s * 0.995, y: 1.11, z: CF + 0.05 });
    addLight(boxG(0.3, 0.018, 0.02), LIGHT.drl, '#e5e7e9', { x: s * 0.8, y: 1.03, z: CF + 0.05 });
    addGlass(boxG(0.4, 0.2, 0.01), { x: s * 0.81, y: 1.11, z: CF + 0.078 });
    // Répétiteur latéral.
    addLight(boxG(0.02, 0.035, 0.09), s > 0 ? LIGHT.indL : LIGHT.indR, '#b8741c', { x: s * 1.168, y: 1.42, z: 3.98 });
  }
  // Pare-chocs (plastique grainé) : plaque, antibrouillards, prise d'air.
  kit.add('body', rbox(CW + 0.04, 0.52, 0.32, 0.07, 2), 'plastic', { y: 0.71, z: 4.07 });
  kit.add('body', boxG(1.2, 0.12, 0.03), 'grille', { y: 0.5, z: 4.235 });
  kit.add('body', boxG(0.53, 0.115, 0.012), kit.byFace((n) => (n.z > 0.5 ? (x, y) => {
    const r = atlas.rectUV.plate;
    return [r.u0 + ((x + 0.265) / 0.53) * (r.u1 - r.u0), r.v0 + ((y - 0.65) / 0.115) * (r.v1 - r.v0)];
  } : 'plastic')), { y: 0.708, z: 4.236 });
  for (const s of [-1, 1]) {
    kit.add('body', cylZ(0.06, 0.03, 14), 'chrome', { x: s * 0.86, y: 0.6, z: 4.225 });
    addLight(cylZ(0.052, 0.02, 14), LIGHT.fog, '#d6dadc', { x: s * 0.86, y: 0.6, z: 4.24 });
  }
  // Marchepieds (2 marches alu larmé) et poignées.
  for (const s of [-1, 1]) {
    kit.add('body', boxG(0.06, 0.62, 0.62), 'plastic', { x: s * 0.9, y: 0.66, z: 3.32 });
    kit.add('body', boxG(0.3, 0.06, 0.62), 'plastic', { x: s * 1.0, y: 0.95, z: 3.32 });
    for (const [y, dx] of [[0.48, 0.0], [0.78, 0.04]]) kit.add('body', boxG(0.24, 0.03, 0.5), 'tread', { x: s * (1.04 - dx), y, z: 3.33 });
    kit.add('body', tube([s * 1.19, 1.12, 2.9], [s * 1.19, 1.72, 2.9], 0.017, 8), 'alu');
    kit.add('body', boxG(0.02, 0.04, 0.17), 'plastic', { x: s * 1.17, y: 1.58, z: 3.18 });
    // Lignes d'ouvrant de porte.
    for (const z of [2.96, 4.02]) kit.add('body', boxG(0.012, CBELT - CY0 - 0.05, 0.008), 'rubber', { x: s * 1.163, y: (CY0 + CBELT) / 2, z });
    // Logo de porte.
    kit.add('body', boxG(0.004, 0.42, 0.75), kit.byFace((n) => (Math.abs(n.x) > 0.5 ? (x, y, z) => {
      const r = atlas.rectUV.door;
      const u = s > 0 ? (3.875 - z) / 0.75 : (z - 3.125) / 0.75;
      return [r.u0 + u * (r.u1 - r.u0), r.v0 + ((y - 1.13) / 0.42) * (r.v1 - r.v0)];
    } : 'paint')), { x: s * 1.163, y: 1.34, z: 3.5 });
  }
  // Rétroviseurs sur bras (principal + grand-angle), rétro d'accostage côté passager.
  for (const s of [-1, 1]) {
    kit.add('body', tube([s * 1.1, 2.62, 4.0], [s * 1.38, 2.6, 4.14], 0.018, 8), 'plastic');
    kit.add('body', tube([s * 1.12, 1.88, 4.06], [s * 1.38, 1.92, 4.14], 0.016, 8), 'plastic');
    kit.add('body', tube([s * 1.38, 2.6, 4.14], [s * 1.38, 1.92, 4.14], 0.017, 8), 'plastic');
    kit.add('body', rbox(0.2, 0.36, 0.08, 0.03), 'plastic', { x: s * 1.46, y: 2.34, z: 4.12 });
    kit.add('body', boxG(0.175, 0.33, 0.006), 'mirror', { x: s * 1.46, y: 2.34, z: 4.077 });
    kit.add('body', rbox(0.19, 0.17, 0.07, 0.03), 'plastic', { x: s * 1.45, y: 2.04, z: 4.12 });
    kit.add('body', boxG(0.165, 0.145, 0.006), 'mirror', { x: s * 1.45, y: 2.04, z: 4.082 });
  }
  kit.add('body', tube([-1.0, CROOF - 0.03, 3.98], [-1.0, CROOF + 0.06, 4.22], 0.014, 6), 'plastic');
  kit.add('body', rbox(0.26, 0.06, 0.18, 0.025), 'plastic', { x: -1.0, y: CROOF + 0.02, z: 4.28 });
  // Ailes avant (passages de roue).
  for (const s of [-1, 1]) {
    const arch = new THREE.CylinderGeometry(0.47, 0.47, 0.32, 18, 1, true, Math.PI * 0.08, Math.PI * 0.84);
    arch.rotateZ(Math.PI / 2);
    kit.add('body', arch, 'plastic', { x: s * 0.98, y: D.wheelR, z: D.zFront });
    kit.add('body', boxG(0.3, 0.38, 0.015), 'rubber', { x: s * 0.98, y: 0.27, z: D.zFront - 0.5 });
  }

  // ===== Châssis =====
  for (const s of [-1, 1]) {
    kit.add('body', boxG(0.075, 0.26, 7.95), 'paintSatin', { x: s * 0.43, y: 0.73, z: -0.05 });
    // Ressorts à lames.
    for (const za of [D.zFront, D.zRear]) {
      for (let k = 0; k < 4; k++) kit.add('body', boxG(0.075, 0.018, 1.25 - k * 0.2), 'steel', { x: s * 0.43, y: 0.5 + k * 0.02, z: za });
      kit.add('body', cylY(0.03, 0.32, 8), 'steel', { x: s * 0.55, y: 0.6, z: za + 0.32, rz: s * 0.15 });
    }
  }
  for (const z of [3.6, 2.0, 0.4, -1.0, -2.4, -3.8]) kit.add('body', boxG(0.86, 0.12, 0.08), 'paintSatin', { y: 0.74, z });
  kit.add('body', boxG(0.14, 0.12, 2.0), 'steel', { y: 0.39, z: D.zFront, ry: Math.PI / 2 }); // essieu avant
  kit.add('body', cylX(0.07, 1.78, 10), 'steel', { y: D.wheelR, z: D.zRear });
  kit.add('body', new THREE.SphereGeometry(0.2, 12, 8).scale(1, 0.85, 1.1), 'steel', { y: D.wheelR, z: D.zRear });
  kit.add('body', cylZ(0.045, 3.1, 8), 'steel', { y: 0.47, z: 0.25, rx: 0.03 });
  kit.add('body', boxG(0.7, 0.55, 1.2), 'paintSatin', { y: 0.82, z: 3.35 }); // moteur sous cabine
  kit.add('body', boxG(0.5, 0.4, 0.6), 'paintSatin', { y: 0.68, z: 2.35 });
  // Réservoir alu (gauche), AdBlue, garde latéral.
  kit.add('body', rbox(0.5, 0.48, 1.2, 0.08, 2), 'alu', { x: 0.88, y: 0.56, z: 1.15 });
  for (const z of [0.75, 1.55]) kit.add('body', boxG(0.52, 0.5, 0.04), 'plastic', { x: 0.88, y: 0.56, z });
  kit.add('body', cylX(0.05, 0.04, 12), 'alu', { x: 1.15, y: 0.74, z: 1.4 });
  kit.add('body', rbox(0.34, 0.36, 0.38, 0.05), 'plasticLight', { x: 0.92, y: 0.55, z: 0.25 });
  kit.add('body', cylY(0.045, 0.04, 10), 'blue', { x: 0.92, y: 0.75, z: 0.25 });
  for (const y of [0.45, 0.68]) kit.add('body', boxG(0.03, 0.1, 2.85), 'alu', { x: 1.2, y, z: 0.66 });
  for (const z of [-0.65, 0.66, 1.95]) kit.add('body', boxG(0.07, 0.4, 0.04), 'aluDark', { x: 1.16, y: 0.58, z });
  // Coffres de rangement (droite) avec portes et poignées.
  kit.add('body', boxG(0.5, 0.44, 3.0), 'paint', { x: -1.0, y: 0.58, z: 0.7 });
  for (const z of [-0.05, 1.45]) {
    kit.add('body', boxG(0.008, 0.36, 1.4), 'paint', { x: -1.253, y: 0.58, z });
    kit.add('body', boxG(0.02, 0.03, 0.16), 'alu', { x: -1.262, y: 0.71, z });
  }
  for (const z of [0.7]) kit.add('body', boxG(0.01, 0.4, 0.012), 'rubber', { x: -1.256, y: 0.58, z });
  // Réservoirs d'air, batteries, échappement.
  kit.add('body', cylZ(0.11, 0.9, 12), 'steel', { x: -0.6, y: 0.55, z: 2.0 });
  kit.add('body', cylZ(0.05, 1.6, 8), 'exhaust', { x: -0.62, y: 0.42, z: -0.2 });
  kit.add('body', cylY(0.055, 0.2, 8), 'exhaust', { x: -0.62, y: 0.33, z: -1.0, rx: 0.5 });
  // Garde-boue arrière (jumelées) et bavettes.
  for (const s of [-1, 1]) {
    const mg = new THREE.CylinderGeometry(0.5, 0.5, 0.62, 18, 1, true, Math.PI * 0.12, Math.PI * 0.76);
    mg.rotateZ(Math.PI / 2);
    kit.add('body', mg, 'plastic', { x: s * 0.9, y: D.wheelR + 0.02, z: D.zRear });
    kit.add('body', boxG(0.62, 0.45, 0.015), 'rubber', { x: s * 0.9, y: 0.31, z: D.zRear - 0.62 });
  }
  // Barre anti-encastrement arrière, plaque, feux.
  kit.add('body', boxG(2.2, 0.12, 0.1), 'aluDark', { y: 0.47, z: -4.12 });
  for (const s of [-1, 1]) kit.add('body', boxG(0.06, 0.32, 0.08), 'steel', { x: s * 0.43, y: 0.62, z: -4.08 });
  kit.add('body', boxG(0.53, 0.115, 0.012), kit.byFace((n) => (n.z < -0.5 ? (x, y) => {
    const r = atlas.rectUV.plate;
    return [r.u0 + ((0.265 - x) / 0.53) * (r.u1 - r.u0), r.v0 + ((y - 0.365) / 0.115) * (r.v1 - r.v0)];
  } : 'plastic')), { y: 0.425, z: -4.178 });
  addLight(boxG(0.1, 0.02, 0.03), LIGHT.plate, '#d0d0c8', { y: 0.5, z: -4.17 });
  for (const s of [-1, 1]) {
    kit.add('body', rbox(0.36, 0.17, 0.08, 0.025), 'plastic', { x: s * 0.98, y: 0.64, z: -4.2 });
    addLight(boxG(0.09, 0.13, 0.02), LIGHT.tail, '#5c0d0b', { x: s * 1.105, y: 0.64, z: -4.245 });
    addLight(boxG(0.08, 0.13, 0.02), LIGHT.brake, '#6a0f0c', { x: s * 1.01, y: 0.64, z: -4.245 });
    addLight(boxG(0.075, 0.13, 0.02), s > 0 ? LIGHT.indL : LIGHT.indR, '#94530f', { x: s * 0.925, y: 0.64, z: -4.245 });
    addLight(boxG(0.06, 0.13, 0.02), s > 0 ? LIGHT.rev : LIGHT.tail, s > 0 ? '#c8cccf' : '#5c0d0b', { x: s * 0.855, y: 0.64, z: -4.245 });
    kit.add('body', boxG(0.07, 0.07, 0.01), 'reflRed', { x: s * 0.7, y: 0.47, z: -4.176 });
  }

  // ===== Carrosserie (box) =====
  // Plancher.
  kit.add('body', boxG(2.42, 0.09, ZF - ZB - 0.05), 'paintSatin', { y: hF - 0.045, z: (ZB + ZF) / 2 + 0.025 });
  // Flancs avec ouvertures (fenêtres chevaux, porte de service, fenêtres de l'espace de vie).
  const horseWin = { z0: -2.2, z1: -1.4, y0: 2.38, y1: 2.95 };
  const sideHoles = {
    1: [horseWin, { z0: -0.4, z1: 0.95, y0: 1.95, y1: 2.55 }],
    [-1]: [horseWin, { z0: D.doorZ[0], z1: D.doorZ[1], y0: 0.95, y1: 2.85 }, { z0: 0.6, z1: 1.6, y0: 1.95, y1: 2.55 }],
  };
  const logoZ = [ZB, -1.9];
  const bandY = [1.22, 1.5], bandZ = [-1.85, 1.95];
  for (const s of [-1, 1]) {
    const cells = wallCells(ZB, ZF, 0.8, TOP, sideHoles[s], [logoZ[1], bandZ[0], bandZ[1]], [bandY[0], bandY[1], hF + 1.28]);
    for (const c of cells) {
      const inLogo = c.z1 <= logoZ[1] + 1e-4 && c.z0 >= logoZ[0] - 1e-4;
      const outer = inLogo
        ? kit.proj('sideLogo', 0, 1, 0.8, TOP, (x, y, z) => [s < 0 ? (z - logoZ[0]) / (logoZ[1] - logoZ[0]) : (logoZ[1] - z) / (logoZ[1] - logoZ[0]), y])
        : null;
      const band = kit.proj('band', 0, 1, bandY[0], bandY[1], (x, y, z) => [s < 0 ? (z - bandZ[0]) / (bandZ[1] - bandZ[0]) : (bandZ[1] - z) / (bandZ[1] - bandZ[0]), y]);
      const geo = boxG(XO - XI, c.y1 - c.y0, c.z1 - c.z0);
      kit.add('body', geo, kit.byFace((n, cx, cy, cz) => {
        if (n.x * s > 0.5) {
          if (outer && cz > logoZ[0] - 0.05) return outer;
          if (cy > bandY[0] && cy < bandY[1] && cz > bandZ[0] && cz < bandZ[1]) return band;
          return 'paint';
        }
        if (n.x * s < -0.5) return cz > D.bulkZ ? 'grp' : cy < hF + 1.28 ? 'pad' : 'grp';
        return 'paint';
      }), { x: s * (XO + XI) / 2, y: (c.y0 + c.y1) / 2, z: (c.z0 + c.z1) / 2 });
    }
    // Liseré or le long du flanc, joint de toit, profils d'angle alu.
    kit.add('body', boxG(0.006, 0.03, ZF - ZB - 0.1), 'gold', { x: s * (XO + 0.003), y: 1.0, z: (ZB + ZF) / 2 });
    kit.add('body', boxG(0.05, 0.05, ZF - ZB + 0.02), 'aluDark', { x: s * (XO - 0.01), y: TOP + 0.005, z: (ZB + ZF) / 2 });
    kit.add('body', boxG(0.06, TOP - 0.78, 0.06), 'aluDark', { x: s * (XO - 0.01), y: (TOP + 0.78) / 2, z: ZB + 0.01 });
    kit.add('body', boxG(0.05, 0.05, ZF - ZB), 'aluDark', { x: s * (XO - 0.005), y: 0.81, z: (ZB + ZF) / 2 });
    // Feux de gabarit latéraux (orange).
    for (const z of [-3.7, -2.2, -0.6, 1.2]) addLight(boxG(0.02, 0.04, 0.09), LIGHT.side, '#9a5a12', { x: s * (XO + 0.012), y: 0.88, z });
    // Fenêtres chevaux : cadre alu, deux vitres coulissantes (une entrouverte), barreaux.
    const wz = (horseWin.z0 + horseWin.z1) / 2, wy = (horseWin.y0 + horseWin.y1) / 2;
    const ww = horseWin.z1 - horseWin.z0, wh = horseWin.y1 - horseWin.y0;
    kit.add('body', boxG(0.06, 0.05, ww + 0.1), 'alu', { x: s * (XO + 0.005), y: horseWin.y1 + 0.02, z: wz });
    kit.add('body', boxG(0.06, 0.05, ww + 0.1), 'alu', { x: s * (XO + 0.005), y: horseWin.y0 - 0.02, z: wz });
    for (const z of [horseWin.z0 - 0.02, horseWin.z1 + 0.02]) kit.add('body', boxG(0.06, wh + 0.09, 0.05), 'alu', { x: s * (XO + 0.005), y: wy, z });
    kit.add('body', boxG(0.02, wh, 0.03), 'alu', { x: s * (XO - 0.005), y: wy, z: wz });
    addGlass(boxG(0.01, wh - 0.02, ww / 2), { x: s * (XO + 0.012), y: wy, z: wz - ww / 4 });
    addGlass(boxG(0.01, wh - 0.02, ww / 2), { x: s * (XO - 0.012), y: wy, z: wz - ww / 4 + 0.12 });
    for (let k = 1; k <= 4; k++) kit.add('body', cylY(0.009, wh, 6), 'steelInt', { x: s * (XI - 0.03), y: wy, z: horseWin.z0 + (ww * k) / 5 });
    // Aérations à volets en haut du compartiment chevaux.
    for (let k = 0; k < 3; k++) {
      const z = -3.75 + k * 0.62;
      kit.add('body', boxG(0.03, 0.18, 0.46), 'plastic', { x: s * (XO + 0.01), y: 2.86, z });
      for (let j = 0; j < 4; j++) kit.add('body', boxG(0.035, 0.012, 0.44), 'rubber', { x: s * (XO + 0.02), y: 2.8 + j * 0.04, z, rz: s * 0.4 });
    }
  }
  // Fenêtres de l'espace de vie (cadres + vitres).
  const lifeWins = [[1, -0.4, 0.95], [-1, 0.6, 1.6]];
  for (const [s, z0, z1] of lifeWins) {
    const wz = (z0 + z1) / 2;
    kit.add('body', boxG(0.04, 0.66, z1 - z0 + 0.08), 'plastic', { x: s * (XO + 0.002), y: 2.25, z: wz });
    addGlass(boxG(0.012, 0.58, z1 - z0), { x: s * (XO + 0.024), y: 2.25, z: wz });
  }
  // Paroi avant du box, toit (bombé, arrondis), plafond, lanterneaux.
  kit.add('body', boxG(2.5, TOP - 0.8, 0.06), kit.byFace((n) => (n.z < -0.5 ? 'grp' : 'paint')), { y: (TOP + 0.8) / 2, z: ZF - 0.03 });
  kit.add('body', rbox(2.52, 0.09, ZF - ZB + 0.02, 0.04, 2), 'paint', { y: TOP + 0.01, z: (ZB + ZF) / 2 });
  kit.add('body', boxG(2.4, 0.02, ZF - ZB - 0.1), 'ceiling', { y: TOP - 0.045, z: (ZB + ZF) / 2 });
  for (const z of [-3.2, -1.6, 0.55]) {
    kit.add('body', rbox(0.62, 0.1, 0.62, 0.04, 2), 'plasticGrey', { y: TOP + 0.07, z });
    kit.add('body', rbox(0.56, 0.05, 0.56, 0.03), 'plasticLight', { y: TOP + 0.13, z, rx: 0.06 });
    kit.add('body', boxG(0.5, 0.012, 0.5), 'plastic', { y: TOP - 0.06, z });
  }
  // Capucine au-dessus de la cabine (face avant arrondie, logo).
  const LZ0 = 1.55, LZ1 = 3.32, LY0 = 2.93, LTOP = TOP + 0.054;
  kit.add('body', rbox(2.49, LTOP - LY0, LZ1 - LZ0, 0.14, 3), kit.byFace((n, cx, cy, cz) => {
    if (n.z > 0.6) return kit.proj('luton', -1.18, 1.18, LY0 + 0.03, LTOP - 0.03, (x, y) => [x, y]);
    return 'paint';
  }), { y: (LY0 + LTOP) / 2, z: (LZ0 + LZ1) / 2 });
  for (const s of [-1, 1]) {
    addLight(boxG(0.1, 0.04, 0.02), LIGHT.clearF, '#d8dadc', { x: s * 1.05, y: TOP - 0.06, z: LZ1 + 0.002 });
    addLight(boxG(0.05, 0.04, 0.02), LIGHT.side, '#9a5a12', { x: s * 1.18, y: TOP - 0.06, z: LZ1 - 0.05 });
  }
  // Cadre arrière (montants, linteau, seuil), feux de gabarit, 3e feu stop, caméra.
  for (const s of [-1, 1]) kit.add('body', boxG(0.1, TOP - 0.78, 0.16), kit.byFace((n) => (n.x * s < -0.5 ? 'alu' : 'paint')), { x: s * 1.2, y: (TOP + 0.78) / 2, z: ZB + 0.08 });
  kit.add('body', boxG(2.5, TOP - 3.21, 0.16), 'paint', { y: (TOP + 3.21) / 2, z: ZB + 0.08 });
  kit.add('body', boxG(2.4, hF - 0.74, 0.18), 'paintSatin', { y: (hF + 0.74) / 2 - 0.01, z: ZB + 0.09 });
  kit.add('body', boxG(2.3, 0.04, 0.06), 'alu', { y: hF - 0.01, z: D.hingeZ + 0.01 });
  for (const s of [-1, 1]) addLight(boxG(0.1, 0.05, 0.02), LIGHT.clearR, '#5c0d0b', { x: s * 1.08, y: TOP - 0.05, z: ZB - 0.012 });
  addLight(boxG(0.4, 0.035, 0.02), LIGHT.brake, '#5c0d0b', { y: 3.255, z: ZB - 0.012 });
  kit.add('body', rbox(0.12, 0.08, 0.1, 0.02), 'plastic', { x: 0.35, y: 3.255, z: ZB - 0.02 });

  // ===== Intérieur du compartiment chevaux =====
  const hz0 = D.hingeZ + 0.02, hz1 = D.bulkZ - 0.05;
  kit.add('body', boxG(2.4, 0.018, hz1 - hz0), 'rubberFloor', { y: hF + 0.009, z: (hz0 + hz1) / 2 });
  for (let k = 0; k < 12; k++) kit.add('body', boxG(2.38, 0.006, 0.025), 'padSeam', { y: hF + 0.019, z: hz0 + 0.12 + k * 0.27 });
  // Coutures verticales des parois matelassées.
  for (const s of [-1, 1]) for (let z = hz0 + 0.45; z < hz1; z += 0.5) kit.add('body', boxG(0.01, 1.25, 0.02), 'padSeam', { x: s * (XI - 0.004), y: hF + 0.63, z });
  // Cloison avant matelassée avec porte de passage (à droite, battant ouvert côté vie), anneaux, filets à foin.
  const pd = D.passDoor;
  for (const c of wallCells(-1.21, 1.21, hF, TOP, [{ z0: pd[0], z1: pd[1], y0: hF, y1: hF + 1.95 }], [], [hF + 1.3])) {
    kit.add('body', boxG(c.z1 - c.z0, c.y1 - c.y0, 0.06), kit.byFace((n, cx, cy) => (n.z < -0.5 ? (cy < hF + 1.3 ? 'pad' : 'grp') : 'grp')), { x: (c.z0 + c.z1) / 2, y: (c.y0 + c.y1) / 2, z: D.bulkZ - 0.03 });
  }
  kit.add('body', boxG(0.04, 1.93, 0.6), 'grp', { x: pd[1] - 0.03, y: hF + 0.97, z: D.bulkZ + 0.31 });
  kit.add('body', boxG(0.05, 0.03, 0.12), 'steelInt', { x: pd[1] - 0.06, y: hF + 1.05, z: D.bulkZ + 0.52 });
  for (const x of pd) kit.add('body', boxG(0.04, 1.97, 0.08), 'aluDark', { x, y: hF + 0.985, z: D.bulkZ - 0.03 });
  for (const sx of [-0.6, 0.6]) {
    kit.add('body', new THREE.TorusGeometry(0.045, 0.008, 6, 14), 'steelInt', { x: sx, y: hF + 1.45, z: D.bulkZ - 0.075, rx: 0.4 });
    // Filet à foin (dans l'angle avant, à côté de la tête) : sac de foin + mailles.
    const nx = sx * 1.52, nz = D.bulkZ - 0.24;
    const bag = new THREE.LatheGeometry([[0.0, 0.0], [0.15, 0.06], [0.22, 0.24], [0.21, 0.45], [0.11, 0.6], [0.02, 0.66]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
    kit.add('body', bag, 'hay', { x: nx, y: hF + 1.2, z: nz, sx: 0.8, sz: 0.75 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      kit.add('body', tube([nx + Math.cos(a) * 0.04, hF + 1.86, nz + Math.sin(a) * 0.03], [nx + Math.cos(a) * 0.18, hF + 1.5, nz + Math.sin(a) * 0.165], 0.007, 4), 'net');
      kit.add('body', tube([nx + Math.cos(a) * 0.18, hF + 1.5, nz + Math.sin(a) * 0.165], [nx + Math.cos(a) * 0.03, hF + 1.21, nz + Math.sin(a) * 0.03], 0.007, 4), 'net');
    }
    kit.add('body', tube([nx, hF + 1.86, nz], [sx * 1.0, hF + 2.05, D.bulkZ - 0.07], 0.008, 4), 'net');
    // Barres de poitrail matelassées.
    kit.add('body', cylX(0.05, 1.1, 10), 'pad', { x: sx, y: hF + 1.12, z: -2.05 });
  }
  for (const s of [-1, 1]) kit.add('body', boxG(0.08, 0.12, 0.08), 'steelInt', { x: s * (XI - 0.04), y: hF + 1.12, z: -2.05 });
  // Plafonniers LED.
  for (const z of [-3.3, -1.9]) addLight(boxG(0.7, 0.02, 0.09), LIGHT.interior, '#d6d6d0', { y: TOP - 0.065, z });
  addLight(boxG(0.5, 0.02, 0.09), LIGHT.interior, '#d6d6d0', { y: TOP - 0.065, z: 0.6 });
  // Espace de vie (aperçu par la porte et les fenêtres).
  kit.add('body', boxG(2.4, 0.02, ZF - D.bulkZ - 0.08), 'woodFloor', { y: hF + 0.01, z: (D.bulkZ + ZF) / 2 });
  kit.add('body', boxG(0.55, 0.45, 1.3), 'seat', { x: 0.9, y: hF + 0.23, z: 0.9 });
  kit.add('body', boxG(0.1, 0.6, 1.3), 'seat', { x: 1.15, y: hF + 0.75, z: 0.9 });
  kit.add('body', boxG(0.6, 0.92, 0.85), 'grp', { x: -0.88, y: hF + 0.46, z: 1.55 });
  kit.add('body', boxG(0.62, 0.03, 0.87), 'woodFloor', { x: -0.88, y: hF + 0.935, z: 1.55 });
  kit.add('body', boxG(0.55, 0.5, 1.6), 'grp', { x: -0.92, y: TOP - 0.33, z: 1.15 });
  // Selles sur porte-selles près de la porte de service.
  for (const z of [-0.65]) {
    kit.add('body', boxG(0.35, 0.03, 0.4), 'steelInt', { x: 0.95, y: hF + 1.2, z });
    kit.add('body', rbox(0.34, 0.16, 0.48, 0.07), 'seat', { x: 0.95, y: hF + 1.3, z });
  }
  // Marchepied rabattable sous la porte de service.
  kit.add('body', boxG(0.28, 0.03, 0.62), 'tread', { x: -1.36, y: 0.62, z: (D.doorZ[0] + D.doorZ[1]) / 2 });
  for (const z of D.doorZ) kit.add('body', boxG(0.24, 0.03, 0.03), 'aluDark', { x: -1.33, y: 0.66, z: z + (z < 0 ? 0.04 : -0.04), rz: 0.5 });

  // ===== Pont arrière (pivot à la charnière ; fermé : vertical, s'étend vers +y) =====
  const RL = D.rampLen, RW = D.rampW, RT = 0.07;
  kit.add('ramp', boxG(RW, RL, RT), kit.byFace((n) => {
    if (n.z < -0.5) return kit.proj('rear', -RW / 2, RW / 2, 0, RL, (x, y) => [-x, y]);
    if (n.z > 0.5) return 'rubberFloor';
    return 'aluDark';
  }), { y: RL / 2, z: -RT / 2 });
  for (let k = 0; k < 10; k++) kit.add('ramp', boxG(RW - 0.14, 0.035, 0.026), 'alu', { y: 0.18 + k * 0.215, z: 0.013 });
  for (const s of [-1, 1]) {
    kit.add('ramp', boxG(0.035, RL, 0.09), 'alu', { x: s * (RW / 2 - 0.0175), y: RL / 2, z: 0.0 });
    kit.add('ramp', cylX(0.05, 0.12, 10), 'steel', { x: s * (RW / 2 - 0.25), y: 0.02, z: -0.03 });
    kit.add('ramp', cylY(0.03, 0.55, 8), 'steel', { x: s * (RW / 2 - 0.12), y: 0.4, z: 0.04 });
    kit.add('ramp', boxG(0.07, 0.14, 0.04), 'alu', { x: s * (RW / 2 - 0.1), y: RL - 0.35, z: -RT - 0.015 });
    kit.add('ramp', boxG(0.035, 0.035, 0.08), 'alu', { x: s * (RW / 2 - 0.02), y: RL - 0.35, z: -RT + 0.02 });
  }
  kit.add('ramp', boxG(RW, 0.03, 0.02), 'rubber', { y: RL - 0.01, z: -0.02 });
  kit.add('ramp', boxG(RW - 0.05, 0.12, 0.012), 'aluDark', { y: RL + 0.04, z: 0.0, rx: 0.5 });
  for (let k = 0; k < 7; k++) kit.add('ramp', cylX(0.02, 0.2, 8), 'steel', { x: -0.9 + k * 0.3, y: 0.0, z: -0.015 });

  // ===== Portillons de pont (pivot au coin arrière ; rangés : le long du flanc vers l'avant) =====
  for (const s of [-1, 1]) {
    const slot = s > 0 ? 'gateL' : 'gateR';
    const GL = 1.2, GH = 1.3;
    kit.add(slot, boxG(0.035, GH - 0.1, GL - 0.08), 'pad', { x: -s * 0.02, y: hF + 0.12 + GH / 2, z: GL / 2 });
    kit.add(slot, tube([-s * 0.02, hF + 0.12 + GH, 0.02], [-s * 0.02, hF + 0.12 + GH, GL], 0.022, 8), 'alu');
    kit.add(slot, tube([-s * 0.02, hF + 0.1, GL], [-s * 0.02, hF + 0.12 + GH, GL], 0.022, 8), 'alu');
    kit.add(slot, tube([-s * 0.02, hF + 0.12, 0.02], [-s * 0.02, hF + 0.12, GL], 0.018, 8), 'alu');
    kit.add(slot, cylY(0.03, GH + 0.1, 8), 'steel', { x: 0, y: hF + 0.12 + GH / 2, z: 0 });
  }

  // ===== Bat-flanc (pivot avant, au centre ; fermé : dans l'axe, vers l'arrière) =====
  {
    const PL = 2.5, py0 = hF + 0.42, py1 = hF + 1.82;
    kit.add('partition', boxG(0.06, py1 - py0, PL), 'pad', { y: (py0 + py1) / 2, z: -PL / 2 - 0.03 });
    kit.add('partition', tube([0, py1 + 0.03, -0.02], [0, py1 + 0.03, -PL - 0.02], 0.028, 8), 'alu');
    kit.add('partition', tube([0, py1 + 0.03, -PL - 0.02], [0, py0 - 0.05, -PL - 0.02], 0.028, 8), 'alu');
    kit.add('partition', boxG(0.012, 0.36, PL - 0.2), 'rubber', { y: py0 - 0.17, z: -PL / 2 - 0.05 });
    for (let k = 1; k < 5; k++) kit.add('partition', boxG(0.066, py1 - py0 - 0.06, 0.014), 'padSeam', { y: (py0 + py1) / 2, z: -k * (PL / 5) });
    kit.add('partition', cylY(0.035, py1 - py0 + 0.3, 8), 'steelInt', { y: (py0 + py1) / 2, z: 0 });
  }

  // ===== Porte de service (pivot à l'arête avant, côté droit) =====
  {
    const z0 = D.doorZ[0], z1 = D.doorZ[1], y0 = 0.96, y1 = 2.84;
    const dz = z1 - z0;
    const bandP = kit.proj('band', 0, 1, bandY[0], bandY[1], (x, y, z) => [(z - bandZ[0]) / (bandZ[1] - bandZ[0]), y]);
    // Géométrie en position fermée (repère camion), puis ramenée au repère de la charnière (x = -XO, z = z1).
    const hingeTf = (g) => g.translate(XO, 0, -z1);
    const add = (geo, mat, tf) => {
      const g = kit.add('door', geo, mat, tf);
      hingeTf(g);
      return g;
    };
    // Panneau en trois bandes pour que le bandeau de livrée se prolonge sur la porte.
    for (const [a, b] of [[y0, bandY[0]], [bandY[0], bandY[1]], [bandY[1], y1]]) {
      add(boxG(0.05, b - a, dz - 0.012), kit.byFace((n, cx, cy) => {
        if (n.x < -0.5) return cy > bandY[0] && cy < bandY[1] ? bandP : 'paint';
        if (n.x > 0.5) return 'grp';
        return 'paint';
      }), { x: -XO + 0.024, y: (a + b) / 2, z: (z0 + z1) / 2 });
    }
    add(boxG(0.012, 0.55, dz - 0.18), 'darkGlass', { x: -XO - 0.002, y: 2.3, z: (z0 + z1) / 2 });
    add(boxG(0.03, 0.03, 0.14), 'alu', { x: -XO - 0.018, y: 1.62, z: z0 + 0.12 });
    add(boxG(0.03, 0.12, 0.03), 'alu', { x: -XO - 0.018, y: 1.62, z: z0 + 0.06 });
    for (const y of [1.2, 2.5]) add(cylY(0.018, 0.16, 8), 'alu', { x: -XO - 0.01, y, z: z1 - 0.01 });
  }

  // ===== Roues =====
  const front = {};
  for (const s of [-1, 1]) {
    const slot = s > 0 ? 'wheelFL' : 'wheelFR';
    wheelGeo(kit, slot, new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI), true);
    front[s] = slot;
  }
  for (const s of [-1, 1]) {
    wheelGeo(kit, 'wheelR', new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI).setPosition(s * 1.02, 0, 0), false);
    wheelGeo(kit, 'wheelR', new THREE.Matrix4().makeRotationY(s > 0 ? Math.PI : 0).setPosition(s * 0.745, 0, 0), false);
    kit.add('wheelR', cylX(0.1, 0.06, 12), 'hub', { x: s * 1.12 });
  }

  // ===== Matériaux =====
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: atlas.map,
    aoMap: atlas.orm,
    roughnessMap: atlas.orm,
    metalnessMap: atlas.orm,
    clearcoatMap: atlas.coat,
    emissiveMap: atlas.emit,
    roughness: 1,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 0.72,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 0,
  });
  bodyMat.name = 'truckBody';
  // Feux : couleur « éteinte » par sommet, émission par groupe (texture 16 × 1 mise à jour à la volée).
  const lightData = new Uint8Array(LIGHT_N * 4);
  const lightTex = new THREE.DataTexture(lightData, LIGHT_N, 1, THREE.RGBAFormat);
  lightTex.colorSpace = THREE.SRGBColorSpace;
  lightTex.magFilter = THREE.NearestFilter;
  lightTex.minFilter = THREE.NearestFilter;
  lightTex.needsUpdate = true;
  const lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, emissive: new THREE.Color(1, 1, 1), emissiveMap: lightTex, emissiveIntensity: 7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d1317'), roughness: 0.03, metalness: 0, transparent: true, opacity: 0.55, envMapIntensity: 1.6, depthWrite: false });
  glassMat.name = 'truckGlass';

  const lgList = [];
  const col = new THREE.Color();
  for (const [geo, group, color, tf] of lights) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(tfm(tf));
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    col.set(color);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
      uv[i * 2] = (group + 0.5) / LIGHT_N;
      uv[i * 2 + 1] = 0.5;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    lgList.push(g);
  }
  const glList = glass.map(([geo, tf]) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    return g.applyMatrix4(tfm(tf));
  });

  // ===== Assemblage =====
  const mesh = (geo, mat, cast = true, recv = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    return m;
  };
  const root = new THREE.Group(); // suit le sol (tangage/roulis du terrain)
  root.rotation.order = 'YXZ';
  const body = new THREE.Group(); // masse suspendue
  root.add(body);
  const bodyMesh = mesh(kit.merge('body'), bodyMat);
  body.add(bodyMesh);
  const glassMesh = mesh(mergeGeometries(glList, false), glassMat, false, false);
  glassMesh.renderOrder = 2;
  body.add(glassMesh);
  const lightMesh = mesh(mergeGeometries(lgList, false), lightMat, false, false);
  body.add(lightMesh);
  // Pont.
  const ramp = new THREE.Group();
  ramp.position.set(0, hF - 0.01, D.hingeZ);
  ramp.add(mesh(kit.merge('ramp'), bodyMat));
  body.add(ramp);
  // Portillons.
  const gates = [];
  for (const s of [1, -1]) {
    const gp = new THREE.Group();
    gp.position.set(s * 1.13, 0, D.hingeZ + 0.03);
    gp.add(mesh(kit.merge(s > 0 ? 'gateL' : 'gateR'), bodyMat));
    gp.userData.side = s;
    body.add(gp);
    gates.push(gp);
  }
  // Bat-flanc.
  const partition = new THREE.Group();
  partition.position.set(D.partitionHinge.x, 0, D.partitionHinge.z);
  partition.add(mesh(kit.merge('partition'), bodyMat));
  body.add(partition);
  // Porte de service.
  const door = new THREE.Group();
  door.position.set(-XO, 0, D.doorZ[1]);
  door.add(mesh(kit.merge('door'), bodyMat));
  body.add(door);
  // Roues (non suspendues : enfants de root).
  const wheels = { front: [], rear: null };
  for (const s of [1, -1]) {
    const steer = new THREE.Group();
    steer.position.set(s * D.trackF / 2, D.wheelR, D.zFront);
    const spin = mesh(kit.merge(front[s]), bodyMat, true, false);
    steer.add(spin);
    root.add(steer);
    wheels.front.push({ steer, spin, side: s });
  }
  const rear = mesh(kit.merge('wheelR'), bodyMat, true, false);
  rear.position.set(0, D.wheelR, D.zRear);
  root.add(rear);
  wheels.rear = rear;

  return { root, body, bodyMesh, glassMesh, lightMesh, ramp, gates, partition, door, wheels, materials: { body: bodyMat, glass: glassMat, light: lightMat }, lightTex, lightData };
}
