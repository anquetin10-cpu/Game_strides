// Générateur hors ligne du cheval : champ de distance anatomique → maillage lisse (surface nets),
// simplification (meshoptimizer), LOD, poids de peau, occlusion ambiante, globes oculaires, crins et sellerie.
// Écrit src/entities/horseData.js (données quantifiées, compressées, base64).
// Usage : node scripts/horse/build.mjs [pas en mm = 3.5]
import { writeFileSync } from 'node:fs';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { buildHorse, EYE, EYE_R, HEAD_F, HEAD_U, HEAD_O } from './anatomy.mjs';
import { surfaceNets, parallelSampler } from './mesher.mjs';
import { packBlob, encodeIndices, encodeIndicesZigzag, encodePositions, encodeNormals } from './pack.mjs';
import { BONES, BONE_INDEX, MODEL_SCALE } from '../../src/entities/horse/skeleton.js';
import { norm, add, mul, cross } from './sdf.mjs';
import { buildHair } from './hair.mjs';
import { buildTack } from './tack.mjs';

const H = (Number(process.argv[2]) || 3.5) / 1000;
const LOD0 = 22000, LOD1 = 5200;
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`);

const S = buildHorse();
const bb = S.bbox();
const raw = await surfaceNets(S, bb, H, { log, sampler: parallelSampler() });
log(`surface nets : ${raw.positions.length / 3} sommets, ${raw.indices.length / 3} triangles`);
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

// ---------- LOD0 ----------
const [i0] = MeshoptSimplifier.simplify(raw.indices, raw.positions, 3, LOD0 * 3, 0.02, []);
const [remap0, nv0] = MeshoptSimplifier.compactMesh(i0);
let pos = new Float32Array(nv0 * 3);
for (let i = 0; i < remap0.length; i++) {
  const r = remap0[i];
  if (r !== 0xffffffff) pos.set(raw.positions.subarray(i * 3, i * 3 + 3), r * 3);
}
log(`LOD0 : ${nv0} sommets, ${i0.length / 3} triangles`);
// Projection sur la surface exacte, normales du champ.
let nor = new Float32Array(nv0 * 3);
for (let i = 0; i < nv0; i++) {
  let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  for (let it = 0; it < 4; it++) {
    const d = S.fast(x, y, z);
    if (Math.abs(d) < 1e-5) break;
    const g = S.grad(x, y, z);
    x -= g[0] * d;
    y -= g[1] * d;
    z -= g[2] * d;
  }
  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;
  nor.set(S.grad(x, y, z, 0.0012), i * 3);
}
log('projection et normales');

// ---------- Globes oculaires (maillage séparé, os de la tête) ----------
const eyeTris = [];
const eyeVerts = [];
const EYE_AXIS = [];
const LID_AXIS = [];
const lidTris = [];
for (const s of [1, -1]) {
  const c = EYE(s);
  // Axe du regard : latéral, un peu vers l'avant.
  const ax = norm(add([s, 0, 0], mul(HEAD_F, 0.32)));
  EYE_AXIS.push(ax);
  const u = norm(cross(ax, HEAD_U)), v = cross(u, ax);
  const NS = 14, NR = 20;
  const base = nv0 + eyeVerts.length;
  for (let i = 0; i <= NS; i++) {
    const th = (i / NS) * Math.PI;
    for (let j = 0; j < NR; j++) {
      const ph = (j / NR) * Math.PI * 2;
      const d = add(add(mul(ax, Math.cos(th)), mul(u, Math.sin(th) * Math.cos(ph))), mul(v, Math.sin(th) * Math.sin(ph)));
      eyeVerts.push({ p: add(c, mul(d, EYE_R)), n: d });
    }
  }
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NR; j++) {
      const a = base + i * NR + j, b = base + i * NR + ((j + 1) % NR), cc = base + (i + 1) * NR + j, dd = base + (i + 1) * NR + ((j + 1) % NR);
      if (i > 0) eyeTris.push(a, b, cc); // sens direct vu de l'extérieur
      if (i < NS - 1) eyeTris.push(b, dd, cc);
    }
  }
  // Paupière supérieure mobile : calotte cachée sous l'arcade (œil ouvert), abaissée par l'os lidL/lidR (clignement).
  LID_AXIS.push(u);
  const lb = nv0 + eyeVerts.length;
  const NA = 6, NB = 10, RL = EYE_R + 0.0028;
  for (let i = 0; i <= NA; i++) {
    const al = ((24 + (64 * i) / NA) * Math.PI) / 180;
    for (let j = 0; j <= NB; j++) {
      const be = ((-62 + (124 * j) / NB) * Math.PI) / 180;
      const d = add(add(mul(ax, Math.cos(al) * Math.cos(be)), mul(v, Math.sin(al) * Math.cos(be))), mul(u, Math.sin(be)));
      eyeVerts.push({ p: add(c, mul(d, RL)), n: d, lid: s > 0 ? 'lidL' : 'lidR' });
    }
  }
  for (let i = 0; i < NA; i++) {
    for (let j = 0; j < NB; j++) {
      const a = lb + i * (NB + 1) + j, b = a + 1, cc = a + NB + 1, dd = cc + 1;
      lidTris.push(a, cc, b, b, cc, dd);
    }
  }
}
{
  const p2 = new Float32Array((nv0 + eyeVerts.length) * 3), n2 = new Float32Array(p2.length);
  p2.set(pos);
  n2.set(nor);
  eyeVerts.forEach((e, k) => {
    p2.set(e.p, (nv0 + k) * 3);
    n2.set(e.n, (nv0 + k) * 3);
  });
  pos = p2;
  nor = n2;
}
const nv = pos.length / 3;

// ---------- LOD1 : sous-ensemble de sommets du LOD0 ----------
const [i1body] = MeshoptSimplifier.simplify(i0, pos, 3, LOD1 * 3, 0.05, []);
log(`LOD1 : ${i1body.length / 3} triangles`);

// ---------- Ordre de rendu (cache GPU) et de lecture des sommets ----------
const all0 = new Uint32Array([...i0, ...eyeTris, ...lidTris]);
// (reorderMesh réordonne all0 sur place et renvoie la table des nouveaux numéros de sommets)
const [remap] = MeshoptEncoder.reorderMesh(all0, true, false);
const rp = new Float32Array(nv * 3), rn = new Float32Array(nv * 3);
for (let i = 0; i < nv; i++) {
  const r = remap[i];
  if (r === 0xffffffff) continue;
  rp.set(pos.subarray(i * 3, i * 3 + 3), r * 3);
  rn.set(nor.subarray(i * 3, i * 3 + 3), r * 3);
}
const eyeIdx = eyeTris.map((i) => remap[i]);
const lidIdx = lidTris.map((i) => remap[i]);
// Paupières : os propre, pas de drapeau « œil ».
const lidBone = new Map();
eyeVerts.forEach((e, k) => e.lid && lidBone.set(remap[nv0 + k], e.lid));
// LOD1 : triangles tournés (plus petit indice en tête, même sens) puis triés → écarts faibles, meilleure compression.
const lod1Tris = [];
const l1 = [...Array.from(i1body, (i) => remap[i]), ...eyeIdx, ...lidIdx];
for (let t = 0; t < l1.length; t += 3) {
  const a = l1[t], b = l1[t + 1], c = l1[t + 2];
  lod1Tris.push(a <= b && a <= c ? [a, b, c] : b <= c ? [b, c, a] : [c, a, b]);
}
lod1Tris.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
const lod1 = new Uint32Array(lod1Tris.flat());
pos = rp;
nor = rn;
const eyeFlag = new Uint8Array(nv);
for (const i of eyeIdx) eyeFlag[i] = 255;

// ---------- Poids de peau ----------
const nb = BONES.length;
const skinI = new Uint8Array(nv * 4), skinW = new Uint8Array(nv * 4);
const wv = Array.from({ length: nv }, () => new Map());
const ownerOf = (op, x, y, z) => (typeof op.owner === 'function' ? op.owner(x, y, z) : { [op.owner]: 1 });
for (let i = 0; i < nv; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  const m = wv[i];
  if (lidBone.has(i)) {
    m.set(BONE_INDEX[lidBone.get(i)], 1);
    continue;
  }
  if (eyeFlag[i]) {
    m.set(BONE_INDEX.head, 1);
    continue;
  }
  const { w } = S.own(x, y, z);
  for (const [op, k] of w) {
    if (!op.owner || k < 1e-4) continue;
    const ow = ownerOf(op, x, y, z);
    for (const name in ow) {
      const bi = BONE_INDEX[name];
      if (bi === undefined) throw new Error(`os inconnu ${name}`);
      m.set(bi, (m.get(bi) || 0) + k * ow[name]);
    }
  }
}
log('poids bruts');
// Lissage sur le maillage (2 passes), puis 4 influences au plus.
const adj = Array.from({ length: nv }, () => new Set());
for (let t = 0; t < all0.length; t += 3) {
  const a = all0[t], b = all0[t + 1], c = all0[t + 2];
  adj[a].add(b).add(c);
  adj[b].add(a).add(c);
  adj[c].add(a).add(b);
}
let cur = wv;
for (let pass = 0; pass < 2; pass++) {
  const next = cur.map((m, i) => {
    if (eyeFlag[i] || lidBone.has(i)) return m;
    const o = new Map();
    for (const [k, v] of m) o.set(k, v * 0.5);
    const nn = adj[i].size || 1;
    for (const j of adj[i]) for (const [k, v] of cur[j]) o.set(k, (o.get(k) || 0) + (v * 0.5) / nn);
    return o;
  });
  cur = next;
}
for (let i = 0; i < nv; i++) {
  const top = [...cur[i]].filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const tot = top.reduce((s, e) => s + e[1], 0) || 1;
  // Quantification 8 bits : somme exacte de 255 (le reste va au poids principal).
  const q = top.map(([, v]) => Math.floor((v / tot) * 255));
  q[0] += 255 - q.reduce((s, v) => s + v, 0);
  top.forEach(([b], k) => {
    skinI[i * 4 + k] = b;
    skinW[i * 4 + k] = q[k];
  });
}
log('poids lissés');

// ---------- Occlusion ambiante (lancer de rayons dans une grille grossière du champ) ----------
const G = 0.012;
const gx0 = bb[0] - 0.1, gy0 = bb[1] - 0.1, gz0 = bb[2] - 0.1;
const gnx = Math.ceil((bb[3] - bb[0] + 0.2) / G) + 1, gny = Math.ceil((bb[4] - bb[1] + 0.2) / G) + 1, gnz = Math.ceil((bb[5] - bb[2] + 0.2) / G) + 1;
const grid = new Float32Array(gnx * gny * gnz);
for (let k = 0; k < gnz; k++) for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) grid[(k * gny + j) * gnx + i] = Math.min(S.fast(gx0 + i * G, gy0 + j * G, gz0 + k * G), 0.5);
log(`grille ${gnx}×${gny}×${gnz}`);
const sdfAt = (x, y, z) => {
  let fx = (x - gx0) / G, fy = (y - gy0) / G, fz = (z - gz0) / G;
  if (fx < 0 || fy < 0 || fz < 0 || fx >= gnx - 1 || fy >= gny - 1 || fz >= gnz - 1) return 0.5;
  const i = fx | 0, j = fy | 0, k = fz | 0;
  fx -= i;
  fy -= j;
  fz -= k;
  const o = (k * gny + j) * gnx + i, sx = 1, sy = gnx, sz = gnx * gny;
  const c00 = grid[o] + (grid[o + sx] - grid[o]) * fx, c10 = grid[o + sy] + (grid[o + sy + sx] - grid[o + sy]) * fx;
  const c01 = grid[o + sz] + (grid[o + sz + sx] - grid[o + sz]) * fx, c11 = grid[o + sz + sy] + (grid[o + sz + sy + sx] - grid[o + sz + sy]) * fx;
  const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
  return c0 + (c1 - c0) * fz;
};
const AOD = [];
for (let i = 0; i < 40; i++) {
  // Directions de Fibonacci (hémisphère pondéré plus tard).
  const y = 1 - (i + 0.5) / 40;
  const r = Math.sqrt(1 - y * y), ph = i * 2.39996;
  AOD.push([r * Math.cos(ph), y, r * Math.sin(ph)]);
}
const ao = new Uint8Array(nv);
for (let i = 0; i < nv; i++) {
  if (lidBone.has(i)) {
    ao[i] = 190;
    continue;
  }
  if (eyeFlag[i]) {
    ao[i] = 230;
    continue;
  }
  const n = [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
  const t = Math.abs(n[1]) < 0.9 ? norm(cross(n, [0, 1, 0])) : norm(cross(n, [1, 0, 0]));
  const b = cross(n, t);
  let occ = 0, tot = 0;
  for (const d of AOD) {
    const dir = add(add(mul(t, d[0]), mul(n, d[1])), mul(b, d[2]));
    const wgt = d[1]; // cosinus
    let s = 0.012, hit = 0;
    const px = pos[i * 3] + n[0] * 0.006, py = pos[i * 3 + 1] + n[1] * 0.006, pz = pos[i * 3 + 2] + n[2] * 0.006;
    while (s < 0.45) {
      const q = sdfAt(px + dir[0] * s, py + dir[1] * s, pz + dir[2] * s);
      if (q < 0.003) {
        hit = 1 - s / 0.45;
        break;
      }
      s += Math.max(q * 0.8, 0.008);
    }
    occ += hit * wgt;
    tot += wgt;
  }
  ao[i] = Math.round(255 * Math.max(0, 1 - (occ / tot) * 1.15));
}
log('occlusion ambiante');

// ---------- Crins et sellerie ----------
const hair = buildHair(S, log);
const tack = buildTack(S, log);

// ---------- Méta-données utiles au rendu ----------
const meta = {
  scale: MODEL_SCALE,
  q: 0.00025,
  counts: { nv, lod0: all0.length, lod1: lod1.length },
  eyes: [EYE(1), EYE(-1)],
  eyeAxis: EYE_AXIS,
  lidAxis: LID_AXIS,
  eyeR: EYE_R,
  head: { o: HEAD_O, f: HEAD_F, u: HEAD_U },
  hair: hair.meta,
  tack: tack.meta,
};
const arrays = {
  pos: encodePositions(pos, meta.q),
  nor: encodeNormals(nor),
  skinI,
  skinW,
  ao,
  eye: eyeFlag,
  lod0: encodeIndices(all0),
  lod1: encodeIndicesZigzag(lod1),
  ...hair.arrays,
  ...tack.arrays,
};
const blob = packBlob(arrays, meta);
const src = `// Données générées par scripts/horse/build.mjs — ne pas modifier à la main.
// Cheval de sport : maillage lisse (LOD0 ${all0.length / 3} triangles, LOD1 ${lod1.length / 3}), poids de peau, occlusion, crins, sellerie.
export const HORSE_DATA = '${blob.base64}';
`;
writeFileSync('src/entities/horseData.js', src);
log(`horseData.js : ${(src.length / 1024).toFixed(0)} Ko (brut ${(blob.raw / 1024).toFixed(0)} Ko, deflate ${(blob.packed / 1024).toFixed(0)} Ko)`);
void nb;
