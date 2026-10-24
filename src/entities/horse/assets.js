// Décodage des données du cheval (générées hors ligne) en géométries partagées par tous les chevaux.
import * as THREE from 'three';
import { inflateSync } from 'three/addons/libs/fflate.module.js';
import { HORSE_DATA } from '../horseData.js';
import { BONES } from './skeleton.js';

let cache = null;

export function horseAssets() {
  if (!cache) cache = decode();
  return cache;
}

function unpack(b64) {
  const bin = atob(b64);
  const z = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) z[i] = bin.charCodeAt(i);
  const raw = inflateSync(z);
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const dv = new DataView(buf);
  const hlen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  const base = 4 + hlen + ((4 - ((4 + hlen) % 4)) % 4);
  const arrays = {};
  const T = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array };
  for (const a of header.arrays) arrays[a.name] = new T[a.type](buf, base + a.offset, a.length);
  return { meta: header.meta, arrays };
}

// Positions : deltas entiers × pas de quantification × échelle du modèle.
export function decodePositions(d, q) {
  const out = new Float32Array(d.length);
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < d.length; i += 3) {
    x += d[i];
    y += d[i + 1];
    z += d[i + 2];
    out[i] = x * q;
    out[i + 1] = y * q;
    out[i + 2] = z * q;
  }
  return out;
}

function decodeNormals(d) {
  const n = d.length / 2;
  const out = new Float32Array(n * 3);
  let u = 0, v = 0;
  for (let i = 0; i < n; i++) {
    u += d[i * 2];
    v += d[i * 2 + 1];
    let x = u / 16383, y = v / 16383;
    const z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) {
      const ox = x;
      x = (1 - Math.abs(y)) * Math.sign(ox || 1);
      y = (1 - Math.abs(ox)) * Math.sign(y || 1);
    }
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l;
    out[i * 3 + 1] = y / l;
    out[i * 3 + 2] = z / l;
  }
  return out;
}

export function decodeIndices(d, out, off = 0) {
  let next = 0;
  for (let i = 0; i < d.length; i++) {
    const v = next - d[i];
    out[off + i] = v;
    if (v === next) next++;
  }
  return out;
}

export function decodeIndicesZigzag(d, out, off = 0) {
  let prev = 0;
  for (let i = 0; i < d.length; i++) {
    const z = d[i];
    prev += z & 1 ? -((z + 1) >> 1) : z >> 1;
    out[off + i] = prev;
  }
  return out;
}

function decode() {
  const { meta, arrays: A } = unpack(HORSE_DATA);
  const S = meta.scale;
  const nv = meta.counts.nv;
  const pos = decodePositions(A.pos, meta.q * S);
  const nor = decodeNormals(A.nor);
  // Indices : LOD0 puis LOD1 dans un même tampon (plage de dessin selon la distance).
  const n0 = A.lod0.length, n1 = A.lod1.length;
  const idx = new Uint16Array(n0 + n1);
  decodeIndices(A.lod0, idx, 0);
  decodeIndicesZigzag(A.lod1, idx, n0);
  const extra = new Uint8Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    extra[i * 2] = A.ao[i];
    extra[i * 2 + 1] = A.eye[i];
  }
  const body = {
    position: new THREE.BufferAttribute(pos, 3),
    normal: new THREE.BufferAttribute(nor, 3),
    skinIndex: new THREE.BufferAttribute(A.skinI, 4),
    skinWeight: new THREE.BufferAttribute(A.skinW, 4, true),
    aExtra: new THREE.BufferAttribute(extra, 2, true),
    index: new THREE.BufferAttribute(idx, 1),
    lod: [[0, n0], [n0, n1]],
    rest: pos,
    restNormal: nor,
    ao: A.ao,
    eye: A.eye,
    skinI: A.skinI,
    skinW: A.skinW,
  };
  // Crins : cartes de mèches (couleur de sommet grise = variation par mèche).
  let hair = null;
  if (A.hairPos) {
    const hv = A.hairCol.length;
    const hc = new Uint8Array(hv * 3);
    for (let i = 0; i < hv; i++) hc[i * 3] = hc[i * 3 + 1] = hc[i * 3 + 2] = A.hairCol[i];
    hair = {
      position: new THREE.BufferAttribute(decodePositions(A.hairPos, meta.q * S), 3),
      normal: new THREE.BufferAttribute(decodeNormals(A.hairNor), 3),
      uv: new THREE.BufferAttribute(A.hairUv, 2, true),
      color: new THREE.BufferAttribute(hc, 3, true),
      skinIndex: new THREE.BufferAttribute(A.hairSkinI, 4),
      skinWeight: new THREE.BufferAttribute(A.hairSkinW, 4, true),
      index: new THREE.BufferAttribute(decodeIndicesZigzag(A.hairIdx, new Uint16Array(A.hairIdx.length)), 1),
      lod: [[0, meta.hair.lod0], [0, meta.hair.lod1]],
    };
  }
  // Sellerie : un tampon de sommets, des plages de triangles par pièce.
  let tack = null;
  if (A.tackPos) {
    tack = {
      position: new THREE.BufferAttribute(decodePositions(A.tackPos, meta.q * S), 3),
      normal: new THREE.BufferAttribute(decodeNormals(A.tackNor), 3),
      uv: new THREE.BufferAttribute(A.tackUv, 2, true),
      aMat: new THREE.BufferAttribute(A.tackMat, 1),
      skinIndex: new THREE.BufferAttribute(A.tackSkinI, 4),
      skinWeight: new THREE.BufferAttribute(A.tackSkinW, 4, true),
      indices: decodeIndicesZigzag(A.tackIdx, new Uint16Array(A.tackIdx.length)),
      ranges: meta.tack.ranges,
    };
  }
  // Squelette de repos (unités du modèle).
  const bones = BONES.map((b) => ({ name: b.name, parent: b.parent, pos: b.pos.map((v) => v * S) }));
  return { meta, A, body, hair, tack, bones, scale: S };
}
