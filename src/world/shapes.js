// Fabrique de géométries low-poly et regroupement statique par tuiles (peu d'appels de dessin).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export function prep(g) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export const box = (w, h, d, bottom = true) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (bottom) g.translate(0, h / 2, 0);
  return prep(g);
};
export const cyl = (rt, rb, h, seg = 8, bottom = true) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (bottom) g.translate(0, h / 2, 0);
  return prep(g);
};
export const cone = (r, h, seg = 7) => {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(0, h / 2, 0);
  return prep(g);
};
export const ico = (r, detail = 0) => prep(new THREE.IcosahedronGeometry(r, detail));
export const sphere = (r, ws = 8, hs = 6) => prep(new THREE.SphereGeometry(r, ws, hs));

// Toit à deux pans : largeur w (axe x), hauteur h, profondeur d (faîtage selon x).
export function gableRoof(w, h, d, overhang = 0.4) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const v = [
    -hw, 0, -hd, hw, 0, -hd, hw, h, 0, -hw, h, 0,
    -hw, 0, hd, hw, 0, hd, hw, h, 0, -hw, h, 0,
    -hw, 0, -hd, -hw, h, 0, -hw, 0, hd,
    hw, 0, -hd, hw, 0, hd, hw, h, 0,
  ];
  const idx = [0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 8, 10, 9, 11, 13, 12];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Toit en croupe (quatre pans).
export function hipRoof(w, h, d, overhang = 0.4) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const r = Math.max(0, hw - hd);
  const v = [-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, -r, h, 0, r, h, 0];
  const idx = [0, 4, 5, 0, 5, 1, 1, 5, 2, 2, 5, 4, 2, 4, 3, 3, 4, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  // Pans plans : sommets propres à chaque pan (normales non lissées entre pans), sinon le repère des
  // ardoises et des tuiles tourne d'un bord à l'autre du pan et le motif se change en stries.
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return prep(flat);
}

// Segment cylindrique entre deux points (membres, cous, poteaux inclinés).
export function limb(a, b, r1, r2, seg = 6, sx = 1) {
  const A = Array.isArray(a) ? new THREE.Vector3(...a) : a.clone();
  const B = Array.isArray(b) ? new THREE.Vector3(...b) : b.clone();
  const dir = B.clone().sub(A);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  g.translate(0, len / 2, 0);
  if (sx !== 1) g.scale(sx, 1, 1);
  _q.setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(_q);
  g.translate(A.x, A.y, A.z);
  return prep(g);
}

export function transformed(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.clone();
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}

export function paint(geo, color, jitter = 0, rnd = Math.random) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const k = jitter ? 1 + (rnd() - 0.5) * jitter : 1;
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r * k;
    arr[i * 3 + 1] = _c.g * k;
    arr[i * 3 + 2] = _c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Merge a list of [geometry, color] parts into one painted geometry.
export function compose(parts) {
  const geos = parts.map(([g, color, tf]) => paint(tf ? transformed(g, tf) : g.clone(), color));
  return mergeGeometries(geos, false);
}

export class StaticBatch {
  constructor(chunk = 160) {
    this.chunk = chunk;
    this.groups = new Map();
  }
  // Ajoute une géométrie (déjà peinte ou non) à la position/orientation donnée.
  add(geo, color, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, opts = {}) {
    _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, ry), _s.set(sx, sy, sz));
    if (opts.rx || opts.rz) {
      const r = new THREE.Matrix4().makeRotationFromEuler(_e.set(opts.rx || 0, 0, opts.rz || 0));
      _m.multiply(r);
    }
    this.addMatrix(geo, color, _m, opts.jitter || 0, opts.rnd, x, z);
  }
  addMatrix(geo, color, m, jitter = 0, rnd, kx, kz) {
    const g = geo.clone();
    g.applyMatrix4(m);
    if (color !== null && color !== undefined) paint(g, color, jitter, rnd);
    else if (!g.attributes.color) paint(g, '#ffffff');
    else if (jitter) {
      const k = 1 + ((rnd || Math.random)() - 0.5) * jitter;
      const c = g.attributes.color.array;
      for (let i = 0; i < c.length; i++) c[i] *= k;
    }
    const e = m.elements;
    const key = `${Math.floor((kx ?? e[12]) / this.chunk)},${Math.floor((kz ?? e[14]) / this.chunk)}`;
    if (!this.groups.has(key)) this.groups.set(key, []);
    this.groups.get(key).push(g);
  }
  build(material, parent, { castShadow = true, receiveShadow = true, name = 'batch' } = {}) {
    const meshes = [];
    for (const [key, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.name = `${name}:${key}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}
