// Décodage des maillages humains générés hors ligne (scripts/humans) : flux quantifiés, deltas, varints, puis DEFLATE.
// Format par maillage : nv, ni, boîte, positions (14 bits, deltas zigzag), normales octaédriques (2 octets),
// peau (nombre d'influences + os 6 bits + poids 8 bits), zone, occlusion, indices (« niveau d'eau »).
import { inflateSync } from 'three/addons/libs/fflate.module.js';

const B64 = typeof atob === 'function' ? (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : (s) => new Uint8Array(Buffer.from(s, 'base64'));

class Reader {
  constructor(u8) {
    this.u = u8;
    this.p = 0;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  byte() {
    return this.u[this.p++];
  }
  vu() {
    let r = 0, s = 0, b;
    do {
      b = this.u[this.p++];
      r += (b & 127) * 2 ** s;
      s += 7;
    } while (b & 128);
    return r;
  }
  vs() {
    const v = this.vu();
    return v & 1 ? -(v + 1) / 2 : v / 2;
  }
  f32() {
    const v = this.dv.getFloat32(this.p, true);
    this.p += 4;
    return v;
  }
}

export const POS_BITS = 14;

export function decodeAsset(b64) {
  const r = new Reader(inflateSync(B64(b64)));
  if (r.byte() !== 72 || r.byte() !== 51) throw new Error('humain : format inconnu');
  const n = r.byte();
  const meshes = [];
  for (let m = 0; m < n; m++) meshes.push(decodeMesh(r));
  return meshes;
}

function decodeMesh(r) {
  const nv = r.vu(), ni = r.vu();
  const bb = [r.f32(), r.f32(), r.f32(), r.f32(), r.f32(), r.f32()];
  const Q = (1 << POS_BITS) - 1;
  const pos = new Float32Array(nv * 3);
  const last = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    for (let k = 0; k < 3; k++) {
      last[k] += r.vs();
      pos[v * 3 + k] = bb[k] + (last[k] / Q) * (bb[k + 3] - bb[k]);
    }
  }
  const nrm = new Int8Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    let x = (r.byte() / 255) * 2 - 1, y = (r.byte() / 255) * 2 - 1;
    let z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) {
      const ox = x;
      x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1);
      y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1);
    }
    const l = Math.hypot(x, y, z) || 1;
    nrm[v * 3] = Math.round((x / l) * 127);
    nrm[v * 3 + 1] = Math.round((y / l) * 127);
    nrm[v * 3 + 2] = Math.round((z / l) * 127);
  }
  const si = new Uint8Array(nv * 4), sw = new Uint8Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const b0 = r.byte();
    const cnt = (b0 >> 6) + 1;
    si[v * 4] = b0 & 63;
    for (let k = 1; k < cnt; k++) si[v * 4 + k] = r.byte();
    let left = 255;
    for (let k = 0; k < cnt - 1; k++) {
      const w = r.byte();
      sw[v * 4 + k] = w;
      left -= w;
    }
    sw[v * 4 + cnt - 1] = left;
  }
  const zone = new Uint8Array(nv);
  for (let v = 0; v < nv; v++) zone[v] = r.byte();
  const ao = new Uint8Array(nv);
  for (let v = 0; v < nv; v++) ao[v] = r.byte();
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  decodeIndices(r, index);
  return { nv, pos, nrm, skinIndex: si, skinWeight: sw, zone, ao, index, bbox: bb };
}

// Indices : FIFO d'arêtes (15) et de sommets récents (14) ; voir scripts/humans/encode.mjs.
const EA = new Int32Array(16), EB = new Int32Array(16), VFI = new Int32Array(16);
function decodeIndices(r, index) {
  const EF = 15, VF = 14;
  EA.fill(-1);
  EB.fill(-1);
  VFI.fill(-1);
  let eo = 0, vo = 0, next = 0;
  for (let i = 0; i < index.length; i += 3) {
    const code = r.byte();
    if (code === 0xf0) {
      for (let k = 0; k < 3; k++) {
        const d = r.vu();
        const v = d === 0 ? next++ : next - d;
        index[i + k] = v;
        VFI[vo] = v;
        vo = (vo + 1) % VF;
      }
      for (let k = 0; k < 3; k++) {
        EA[eo] = index[i + k];
        EB[eo] = index[i + ((k + 1) % 3)];
        eo = (eo + 1) % EF;
      }
      continue;
    }
    const e = code >> 4, c = code & 15;
    const j = (eo - 1 - e + EF * 2) % EF;
    const x = EB[j], y = EA[j];
    let z;
    if (c === 0) z = next++;
    else if (c === 15) z = next - r.vu();
    else z = VFI[(vo - c + VF * 2) % VF];
    index[i] = x;
    index[i + 1] = y;
    index[i + 2] = z;
    EA[eo] = x; EB[eo] = y; eo = (eo + 1) % EF;
    EA[eo] = y; EB[eo] = z; eo = (eo + 1) % EF;
    EA[eo] = z; EB[eo] = x; eo = (eo + 1) % EF;
    VFI[vo] = z;
    vo = (vo + 1) % VF;
  }
}
