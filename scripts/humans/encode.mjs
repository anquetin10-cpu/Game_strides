// Encodage compact des maillages (inverse de src/entities/human/codec.js), compressé DEFLATE puis base64.
import { deflateRawSync } from 'node:zlib';
import { POS_BITS } from '../../src/entities/human/codec.js';

class Writer {
  constructor() {
    this.b = [];
  }
  byte(v) {
    this.b.push(v & 255);
  }
  vu(v) {
    do {
      let c = v % 128;
      v = Math.floor(v / 128);
      if (v > 0) c |= 128;
      this.b.push(c);
    } while (v > 0);
  }
  vs(v) {
    this.vu(v >= 0 ? v * 2 : -v * 2 - 1);
  }
  f32(v) {
    const a = new Float32Array([v]);
    const u = new Uint8Array(a.buffer);
    for (const x of u) this.b.push(x);
  }
}

function octEncode(x, y, z) {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let u = x / l, v = y / l;
  if (z < 0) {
    const ou = u;
    u = (1 - Math.abs(v)) * (ou >= 0 ? 1 : -1);
    v = (1 - Math.abs(ou)) * (v >= 0 ? 1 : -1);
  }
  return [Math.round((u * 0.5 + 0.5) * 255), Math.round((v * 0.5 + 0.5) * 255)];
}

// mesh : { pos Float32Array, nrm Float32Array, skin [[os, poids]...] par sommet, zone, ao (0..1), idx }
function encodeMesh(w, m) {
  const nv = m.pos.length / 3;
  w.vu(nv);
  w.vu(m.idx.length);
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) {
    bb[k] = Math.min(bb[k], m.pos[v * 3 + k]);
    bb[k + 3] = Math.max(bb[k + 3], m.pos[v * 3 + k]);
  }
  for (const x of bb) w.f32(x);
  // Les bornes sont relues en float32 : quantifier avec les mêmes valeurs.
  const bf = Float32Array.from(bb);
  const Q = (1 << POS_BITS) - 1;
  const last = [0, 0, 0];
  const qpos = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) {
    const span = bf[k + 3] - bf[k] || 1;
    const q = Math.round(((m.pos[v * 3 + k] - bf[k]) / span) * Q);
    w.vs(q - last[k]);
    last[k] = q;
    qpos[v * 3 + k] = bf[k] + (q / Q) * span;
  }
  for (let v = 0; v < nv; v++) {
    const [a, b] = octEncode(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]);
    w.byte(a);
    w.byte(b);
  }
  for (let v = 0; v < nv; v++) {
    let inf = m.skin[v].filter((e) => e[1] > 0.004).slice(0, 4);
    if (!inf.length) inf = [m.skin[v][0]];
    // poids quantifiés (somme exacte 255)
    const tot = inf.reduce((s, e) => s + e[1], 0);
    const q = inf.map((e) => Math.round((e[1] / tot) * 255));
    let diff = 255 - q.reduce((s, x) => s + x, 0);
    q[0] += diff;
    const keep = inf.map((e, i) => [e[0], q[i]]).filter((e) => e[1] > 0);
    w.byte(((keep.length - 1) << 6) | keep[0][0]);
    for (let k = 1; k < keep.length; k++) w.byte(keep[k][0]);
    for (let k = 0; k < keep.length - 1; k++) w.byte(keep[k][1]);
  }
  for (let v = 0; v < nv; v++) w.byte(m.zone[v]);
  for (let v = 0; v < nv; v++) w.byte(Math.round(Math.max(0, Math.min(1, m.ao[v])) * 255));
  encodeIndices(w, m.idx);
  return qpos;
}

// Indices : FIFO d'arêtes (triangle adjacent à un précédent → 1 octet) et FIFO de sommets récents.
export function encodeIndices(w, idx) {
  const EF = 15, VF = 14;
  const ea = new Int32Array(16).fill(-1), eb = new Int32Array(16).fill(-1);
  let eo = 0;
  const vf = new Int32Array(16).fill(-1);
  let vo = 0;
  let next = 0;
  const pushE = (a, b) => {
    ea[eo] = a;
    eb[eo] = b;
    eo = (eo + 1) % EF;
  };
  const pushV = (v) => {
    vf[vo] = v;
    vo = (vo + 1) % VF;
  };
  const vcode = (v) => {
    if (v === next) return 0;
    for (let k = 0; k < VF; k++) if (vf[(vo - 1 - k + VF * 2) % VF] === v) return 1 + k;
    return 15;
  };
  for (let i = 0; i < idx.length; i += 3) {
    const t = [idx[i], idx[i + 1], idx[i + 2]];
    let found = -1, rot = 0;
    for (let r = 0; r < 3 && found < 0; r++) {
      const x = t[r], y = t[(r + 1) % 3];
      for (let e = 0; e < EF; e++) {
        const j = (eo - 1 - e + EF * 2) % EF;
        if (ea[j] === y && eb[j] === x) {
          found = e;
          rot = r;
          break;
        }
      }
    }
    if (found >= 0) {
      const x = t[rot], y = t[(rot + 1) % 3], z = t[(rot + 2) % 3];
      const c = vcode(z);
      w.byte((found << 4) | c);
      if (c === 15) w.vu(next - z);
      if (z === next) next++;
      else if (z > next) throw new Error('indices non ordonnés');
      pushE(x, y);
      pushE(y, z);
      pushE(z, x);
      pushV(z);
    } else {
      w.byte(0xf0);
      for (const v of t) {
        if (v === next) {
          w.vu(0);
          next++;
        } else if (v < next) w.vu(next - v);
        else throw new Error('indices non ordonnés (optimiser le maillage avant encodage)');
        pushV(v);
      }
      pushE(t[0], t[1]);
      pushE(t[1], t[2]);
      pushE(t[2], t[0]);
    }
  }
}

export function encodeAsset(meshes) {
  const w = new Writer();
  w.byte(72);
  w.byte(51);
  w.byte(meshes.length);
  for (const m of meshes) encodeMesh(w, m);
  const raw = Uint8Array.from(w.b);
  const z = deflateRawSync(raw, { level: 9, memLevel: 9 });
  return { b64: Buffer.from(z).toString('base64'), raw: raw.length, packed: z.length };
}
