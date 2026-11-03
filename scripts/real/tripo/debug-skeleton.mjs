// Outil de contrôle : maillage calé (tête redressée) + squelette ajusté → trial/debug/{calage.glb, squelette.json}.
import { writeFileSync } from 'node:fs';
import { SRC, makeIO, calibrated } from './frame.mjs';
import { straightenHead, fitSkeleton } from './skeleton-fit.mjs';
const io = await makeIO();
const doc = await io.read(SRC);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const m = calibrated(prim);
const st = straightenHead(m.positions, m.normals);
const fit = fitSkeleton(m.positions, m.indices);
prim.getAttribute('POSITION').setArray(m.positions);
prim.getAttribute('NORMAL').setArray(m.normals);
for (const mt of doc.getRoot().listMaterials()) mt.setMetallicFactor(0);
await io.write('trial/debug/calage.glb', doc);
writeFileSync('trial/debug/squelette.json', JSON.stringify({ straighten: st, bones: fit.bones, legs: fit.legs, ears: fit.ears }, null, 1));
console.log('redressement', st, '\njambes', JSON.stringify(fit.legs, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)), '\noreilles', JSON.stringify(fit.ears, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
