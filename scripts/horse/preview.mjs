// Aperçu rapide de la forme : polygonise le champ de distance et écrit un maillage brut pour la visionneuse de test.
// Usage : node scripts/horse/preview.mjs [pas en mm] [triangles]
import { writeFileSync, mkdirSync } from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
import { buildHorse } from './anatomy.mjs';
import { surfaceNets, parallelSampler } from './mesher.mjs';

const h = (Number(process.argv[2]) || 5) / 1000;
const target = Number(process.argv[3]) || 80000;
const t0 = Date.now();
const S = buildHorse();
const bb = S.bbox();
const mesh = await surfaceNets(S, bb, h, { log: (m) => console.log(m), sampler: parallelSampler() });
console.log(`nets: ${mesh.positions.length / 3} sommets, ${mesh.indices.length / 3} triangles, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await MeshoptSimplifier.ready;
const [idx] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, Math.min(mesh.indices.length, target * 3), 0.01, []);
const [remap, nv] = MeshoptSimplifier.compactMesh(idx);
const pos = new Float32Array(nv * 3);
for (let i = 0; i < remap.length; i++) {
  const r = remap[i];
  if (r === 0xffffffff) continue;
  pos[r * 3] = mesh.positions[i * 3];
  pos[r * 3 + 1] = mesh.positions[i * 3 + 1];
  pos[r * 3 + 2] = mesh.positions[i * 3 + 2];
}
// Projection sur la surface et normales du champ.
const nor = new Float32Array(nv * 3);
for (let i = 0; i < nv; i++) {
  let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  for (let it = 0; it < 3; it++) {
    const d = S.dist(x, y, z);
    const g = S.grad(x, y, z);
    x -= g[0] * d;
    y -= g[1] * d;
    z -= g[2] * d;
  }
  const g = S.grad(x, y, z);
  pos.set([x, y, z], i * 3);
  nor.set(g, i * 3);
}
// Couleur de débogage : primitive dominante (option « tags »).
const tags = new Float32Array(nv * 3);
if (process.argv.includes('tags')) {
  for (let i = 0; i < nv; i++) {
    const { w } = S.own(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    let best = null, bw = -1;
    for (const [o, v] of w) if (v > bw) { bw = v; best = o; }
    const id = S.ops.indexOf(best);
    const hsh = Math.sin(id * 12.9898) * 43758.5453;
    const r = hsh - Math.floor(hsh), g = (r * 7.31) % 1, b = (r * 3.17 + 0.3) % 1;
    tags.set([r, g, b], i * 3);
  }
}
console.log(`simplifié : ${nv} sommets, ${idx.length / 3} triangles, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
mkdirSync('tests/e2e/out/horse', { recursive: true });
const head = new Uint32Array([nv, idx.length]);
const buf = Buffer.concat([Buffer.from(head.buffer), Buffer.from(pos.buffer), Buffer.from(nor.buffer), Buffer.from(idx.buffer), Buffer.from(tags.buffer)]);
writeFileSync('tests/e2e/out/horse/preview.bin', buf);
