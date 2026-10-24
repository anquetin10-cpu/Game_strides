// Empaquetage compact des données du cheval : tableaux typés concaténés, en-tête JSON, compression deflate, base64.
import { deflateRawSync } from 'node:zlib';

// Codage « delta » des indices : écart à (max vu + 1) — petits nombres pour un maillage ordonné.
export function encodeIndices(idx) {
  const out = new Uint16Array(idx.length);
  let next = 0;
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    const c = next - v; // 0 = nouveau sommet, >0 = sommet récent
    if (c < 0 || c > 65535) throw new Error(`indice hors plage (${v}, attendu ≤ ${next})`);
    out[i] = c;
    if (v === next) next++;
  }
  return out;
}

// Indices dont l'ordre d'apparition des sommets n'est pas croissant (LOD réduit) : delta zigzag 16 bits.
export function encodeIndicesZigzag(idx) {
  const out = new Uint16Array(idx.length);
  let prev = 0;
  for (let i = 0; i < idx.length; i++) {
    const d = idx[i] - prev;
    const z = d >= 0 ? d * 2 : -d * 2 - 1;
    if (z > 65535) throw new Error('écart d’indice trop grand');
    out[i] = z;
    prev = idx[i];
  }
  return out;
}

// Positions quantifiées (pas q mètres), delta entre sommets successifs, entiers 16 bits.
export function encodePositions(pos, q) {
  const n = pos.length / 3;
  const out = new Int16Array(pos.length);
  const prev = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = Math.round(pos[i * 3 + k] / q);
      const d = v - prev[k];
      if (d < -32768 || d > 32767) throw new Error('delta de position trop grand');
      out[i * 3 + k] = d;
      prev[k] = v;
    }
  }
  return out;
}

// Normales en octaèdre (2 × 16 bits), delta.
export function encodeNormals(nor) {
  const n = nor.length / 3;
  const out = new Int16Array(n * 2);
  let px = 0, py = 0;
  for (let i = 0; i < n; i++) {
    let x = nor[i * 3], y = nor[i * 3 + 1], z = nor[i * 3 + 2];
    const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
    x /= l;
    y /= l;
    z /= l;
    let u = x, v = y;
    if (z < 0) {
      u = (1 - Math.abs(y)) * Math.sign(x || 1);
      v = (1 - Math.abs(x)) * Math.sign(y || 1);
    }
    const qu = Math.round(u * 16383), qv = Math.round(v * 16383);
    out[i * 2] = qu - px;
    out[i * 2 + 1] = qv - py;
    px = qu;
    py = qv;
  }
  return out;
}

// Assemble { nom: tableau typé } + méta-données → chaîne base64 (deflate brut).
export function packBlob(arrays, meta = {}) {
  const parts = [];
  const header = { meta, arrays: [] };
  let off = 0;
  for (const [name, arr] of Object.entries(arrays)) {
    const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    // Alignement sur 4 octets pour pouvoir créer des vues typées.
    const pad = (4 - (off % 4)) % 4;
    if (pad) {
      parts.push(Buffer.alloc(pad));
      off += pad;
    }
    header.arrays.push({ name, type: arr.constructor.name, offset: off, length: arr.length });
    parts.push(bytes);
    off += bytes.length;
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const hlen = Buffer.alloc(4);
  hlen.writeUInt32LE(json.length, 0);
  const hpad = Buffer.alloc((4 - ((4 + json.length) % 4)) % 4);
  const raw = Buffer.concat([hlen, json, hpad, ...parts]);
  const z = deflateRawSync(raw, { level: 9 });
  return { base64: z.toString('base64'), raw: raw.length, packed: z.length };
}
