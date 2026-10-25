// « Surface nets » sur grille creuse : seuls les blocs traversés par la surface sont échantillonnés.
// Renvoie { positions: Float32Array, indices: Uint32Array } (triangles orientés vers l'extérieur).

import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';

// Échantillonnage parallèle : chaque fil reconstruit la scène et calcule une liste de blocs.
export function parallelSampler(threads = Math.max(1, cpus().length)) {
  return async (geom, keys) => {
    const chunks = Array.from({ length: threads }, () => []);
    keys.forEach((k, i) => chunks[i % threads].push(k));
    const parts = await Promise.all(
      chunks.map(
        (list) =>
          new Promise((resolve, reject) => {
            const w = new Worker(new URL('./sampleWorker.mjs', import.meta.url), { workerData: { geom, keys: list } });
            w.once('message', resolve);
            w.once('error', reject);
          }),
      ),
    );
    const out = new Map();
    for (const p of parts) for (let i = 0; i < p.keys.length; i++) out.set(p.keys[i], p.arrays[i]);
    return out;
  };
}

// Calcul d'un bloc (partagé par le fil principal et les fils de calcul).
export function sampleBlockArray(scene, geom, key) {
  const { ox, oy, oz, h, B, nbx, nby } = geom;
  const S = B + 1;
  const bx = key % nbx, by = Math.floor(key / nbx) % nby, bz = Math.floor(key / (nbx * nby));
  const x0 = ox + bx * B * h, y0 = oy + by * B * h, z0 = oz + bz * B * h;
  const box = [x0, y0, z0, x0 + B * h, y0 + B * h, z0 + B * h];
  const ops = scene.cull(box, 0.005);
  const arr = new Float32Array(S * S * S);
  for (let k = 0; k < S; k++) {
    const z = z0 + k * h;
    for (let j = 0; j < S; j++) {
      const y = y0 + j * h;
      let o = (k * S + j) * S;
      for (let i = 0; i < S; i++) arr[o++] = scene.dist(x0 + i * h, y, z, ops);
    }
  }
  return arr;
}

export async function surfaceNets(scene, bbox, h, { block = 10, log = () => {}, sampler = null } = {}) {
  const B = block;
  const pad = 3 * h;
  const ox = bbox[0] - pad, oy = bbox[1] - pad, oz = bbox[2] - pad;
  const nx = Math.ceil((bbox[3] - bbox[0] + 2 * pad) / h) + 1;
  const ny = Math.ceil((bbox[4] - bbox[1] + 2 * pad) / h) + 1;
  const nz = Math.ceil((bbox[5] - bbox[2] + 2 * pad) / h) + 1;
  const nbx = Math.ceil(nx / B), nby = Math.ceil(ny / B), nbz = Math.ceil(nz / B);
  const S = B + 1;
  const blocks = new Map(); // clé de bloc → Float32Array (S³ échantillons)
  const bkey = (bx, by, bz) => bx + nbx * (by + nby * bz);
  const halfDiag = (B * h * Math.sqrt(3)) / 2;
  const geom = { ox, oy, oz, h, B, nbx, nby };
  let tested = 0;
  // 1) Blocs actifs.
  const pending = [];
  const sampleBlock = (bx, by, bz) => {
    const key = bkey(bx, by, bz);
    if (blocks.has(key)) return;
    if (sampler) {
      pending.push(key);
      blocks.set(key, null);
    } else blocks.set(key, sampleBlockArray(scene, geom, key));
  };
  for (let bz = 0; bz < nbz; bz++) {
    for (let by = 0; by < nby; by++) {
      for (let bx = 0; bx < nbx; bx++) {
        const cx = ox + (bx + 0.5) * B * h, cy = oy + (by + 0.5) * B * h, cz = oz + (bz + 0.5) * B * h;
        const box = [cx - halfDiag, cy - halfDiag, cz - halfDiag, cx + halfDiag, cy + halfDiag, cz + halfDiag];
        const ops = scene.cull(box, 0.01);
        if (!ops.length) continue;
        tested++;
        const d = scene.dist(cx, cy, cz, ops);
        if (Math.abs(d) > halfDiag * 1.5 + 0.004) continue;
        sampleBlock(bx, by, bz);
      }
    }
  }
  if (sampler && pending.length) {
    const res = await sampler(geom, pending.splice(0));
    for (const [k, a] of res) blocks.set(k, a);
  }
  // Propagation : si une face de bloc présente un changement de signe, activer le voisin.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, arr] of [...blocks]) {
      const bx = key % nbx, by = Math.floor(key / nbx) % nby, bz = Math.floor(key / (nbx * nby));
      for (let f = 0; f < 6; f++) {
        const axis = f >> 1;
        const side = f & 1 ? S - 1 : 0;
        let pos = 0, neg = 0;
        for (let a = 0; a < S && !(pos && neg); a++) {
          for (let b = 0; b < S; b++) {
            const i = axis === 0 ? side : a, j = axis === 1 ? side : axis === 0 ? a : b, k = axis === 2 ? side : b;
            const v = arr[(k * S + j) * S + i];
            if (v < 0) neg = 1;
            else pos = 1;
          }
        }
        if (pos && neg) {
          const nb = [bx, by, bz];
          nb[axis] += f & 1 ? 1 : -1;
          if (nb[0] < 0 || nb[1] < 0 || nb[2] < 0 || nb[0] >= nbx || nb[1] >= nby || nb[2] >= nbz) continue;
          const nk = bkey(nb[0], nb[1], nb[2]);
          if (!blocks.has(nk)) {
            blocks.set(nk, sampleBlockArray(scene, geom, nk));
            changed = true;
          }
        }
      }
    }
  }
  log(`blocs testés ${tested}, actifs ${blocks.size} (${((blocks.size * S * S * S) / 1e6).toFixed(1)} M échantillons)`);

  // 2) Sommets : un par cellule traversée (moyenne des intersections sur les arêtes).
  const cellIndex = new Map();
  let pos = new Float32Array(1 << 20);
  let nv = 0;
  const ckey = (gx, gy, gz) => gx + nx * (gy + ny * gz);
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cv = new Float32Array(8);
  for (const [key, arr] of blocks) {
    const bx = key % nbx, by = Math.floor(key / nbx) % nby, bz = Math.floor(key / (nbx * nby));
    for (let k = 0; k < B; k++) {
      for (let j = 0; j < B; j++) {
        for (let i = 0; i < B; i++) {
          let mask = 0;
          for (let c = 0; c < 8; c++) {
            const v = arr[((k + (c >> 2)) * S + (j + ((c >> 1) & 1))) * S + (i + (c & 1))];
            cv[c] = v;
            if (v < 0) mask |= 1 << c;
          }
          if (mask === 0 || mask === 255) continue;
          let sx = 0, sy = 0, sz = 0, n = 0;
          for (const [a, b] of EDGES) {
            const va = cv[a], vb = cv[b];
            if (va < 0 === vb < 0) continue;
            const t = va / (va - vb);
            sx += (a & 1) + ((b & 1) - (a & 1)) * t;
            sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
            sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
            n++;
          }
          const gx = bx * B + i, gy = by * B + j, gz = bz * B + k;
          if (nv * 3 + 3 > pos.length) {
            const np = new Float32Array(pos.length * 2);
            np.set(pos);
            pos = np;
          }
          pos[nv * 3] = ox + (gx + sx / n) * h;
          pos[nv * 3 + 1] = oy + (gy + sy / n) * h;
          pos[nv * 3 + 2] = oz + (gz + sz / n) * h;
          cellIndex.set(ckey(gx, gy, gz), nv++);
        }
      }
    }
  }
  // 3) Quadrilatères : un par arête de grille traversée.
  let idx = new Uint32Array(1 << 21);
  let ni = 0;
  const pushTri = (a, b, c) => {
    if (ni + 3 > idx.length) {
      const n2 = new Uint32Array(idx.length * 2);
      n2.set(idx);
      idx = n2;
    }
    idx[ni++] = a;
    idx[ni++] = b;
    idx[ni++] = c;
  };
  const quad = (c0, c1, c2, c3, flip) => {
    const a = cellIndex.get(c0), b = cellIndex.get(c1), c = cellIndex.get(c2), d = cellIndex.get(c3);
    if (a === undefined || b === undefined || c === undefined || d === undefined) return;
    if (flip) {
      pushTri(a, c, b);
      pushTri(a, d, c);
    } else {
      pushTri(a, b, c);
      pushTri(a, c, d);
    }
  };
  for (const [key, arr] of blocks) {
    const bx = key % nbx, by = Math.floor(key / nbx) % nby, bz = Math.floor(key / (nbx * nby));
    for (let k = 0; k < B; k++) {
      for (let j = 0; j < B; j++) {
        for (let i = 0; i < B; i++) {
          const v0 = arr[(k * S + j) * S + i];
          const gx = bx * B + i, gy = by * B + j, gz = bz * B + k;
          const in0 = v0 < 0;
          // Arête +x.
          const vx = arr[(k * S + j) * S + i + 1];
          if (in0 !== vx < 0 && gy > 0 && gz > 0) {
            quad(ckey(gx, gy - 1, gz - 1), ckey(gx, gy, gz - 1), ckey(gx, gy, gz), ckey(gx, gy - 1, gz), !in0);
          }
          const vy = arr[(k * S + j + 1) * S + i];
          if (in0 !== vy < 0 && gx > 0 && gz > 0) {
            quad(ckey(gx - 1, gy, gz - 1), ckey(gx - 1, gy, gz), ckey(gx, gy, gz), ckey(gx, gy, gz - 1), !in0);
          }
          const vz = arr[((k + 1) * S + j) * S + i];
          if (in0 !== vz < 0 && gx > 0 && gy > 0) {
            quad(ckey(gx - 1, gy - 1, gz), ckey(gx, gy - 1, gz), ckey(gx, gy, gz), ckey(gx - 1, gy, gz), !in0);
          }
        }
      }
    }
  }
  return { positions: pos.slice(0, nv * 3), indices: idx.slice(0, ni) };
}
