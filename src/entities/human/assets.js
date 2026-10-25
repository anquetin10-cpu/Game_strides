// Maillages humains : décodage paresseux des données générées et géométries partagées (corps + cheveux + coiffe),
// une géométrie par combinaison et par niveau de détail.
import * as THREE from 'three';
import { decodeAsset } from './codec.js';
import { boneDefs } from './skeleton.js';
import F_RIDER from './data/f_rider.js';
import M_RIDER from './data/m_rider.js';
import F_CASUAL from './data/f_casual.js';
import M_CASUAL from './data/m_casual.js';
import F_DRESS from './data/f_dress.js';
import HAIR from './data/hair.js';

const SRC = { f_rider: F_RIDER, m_rider: M_RIDER, f_casual: F_CASUAL, m_casual: M_CASUAL, f_dress: F_DRESS };
const decoded = {};

export const LOD_COUNT = 3;

// Articulation de la tête (repos) et échelle de la tête par sexe : les cheveux et coiffes sont stockés en local.
const HEAD = {};
for (const sex of ['f', 'm']) {
  const j = [0, 0, 0];
  const defs = boneDefs(sex);
  let n = defs.find((d) => d.name === 'head');
  while (n) {
    for (let k = 0; k < 3; k++) j[k] += n.pos[k];
    n = n.parent ? defs.find((d) => d.name === n.parent) : null;
  }
  HEAD[sex] = { j, s: sex === 'm' ? 1.055 : 1 };
}

function asset(name, sex) {
  const key = SRC[name] ? name : `${name}@${sex}`;
  if (decoded[key]) return decoded[key];
  if (SRC[name]) return (decoded[key] = decodeAsset(SRC[name]));
  if (!HAIR[name]) return null;
  // Pièce de tête : coordonnées locales → espace du modèle pour ce sexe.
  const local = decoded[name] || (decoded[name] = decodeAsset(HAIR[name]));
  const H = HEAD[sex];
  return (decoded[key] = local.map((m) => {
    const pos = new Float32Array(m.pos.length);
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = H.j[k] + m.pos[i + k] * H.s;
    return { ...m, pos };
  }));
}

export function hasAsset(name) {
  return !!SRC[name] || !!HAIR[name];
}

const geoCache = new Map();

// Fusionne le corps et les pièces rigides (cheveux, casque…) en une géométrie skinnée.
export function humanGeometry(body, parts, lod) {
  const key = `${body}|${parts.join(',')}|${lod}`;
  let g = geoCache.get(key);
  if (g) return g;
  const sex = body[0];
  const list = [asset(body)[lod]];
  for (const p of parts) {
    const a = asset(p, sex);
    if (a) list.push(a[Math.min(lod, a.length - 1)]);
  }
  let nv = 0, ni = 0;
  for (const m of list) {
    nv += m.nv;
    ni += m.index.length;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Int8Array(nv * 3);
  const si = new Uint8Array(nv * 4);
  const sw = new Uint8Array(nv * 4);
  const zone = new Uint8Array(nv);
  const ao = new Uint8Array(nv);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const m of list) {
    pos.set(m.pos, ov * 3);
    nrm.set(m.nrm, ov * 3);
    si.set(m.skinIndex, ov * 4);
    sw.set(m.skinWeight, ov * 4);
    zone.set(m.zone, ov);
    ao.set(m.ao, ov);
    for (let i = 0; i < m.index.length; i++) index[oi + i] = m.index[i] + ov;
    ov += m.nv;
    oi += m.index.length;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  g.setAttribute('zone', new THREE.BufferAttribute(zone, 1));
  g.setAttribute('ao', new THREE.BufferAttribute(ao, 1, true));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.1, -1), new THREE.Vector3(1, 2.1, 1));
  g.userData.triangles = ni / 3;
  geoCache.set(key, g);
  return g;
}
