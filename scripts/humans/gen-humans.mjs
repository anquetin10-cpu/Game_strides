// Générateur hors ligne des personnages réalistes : SDF anatomique → surface nets → découpe des zones → coutures →
// LOD (meshoptimizer) → normales/poids/occlusion → données compactes dans src/entities/human/data/.
// Usage : node scripts/humans/gen-humans.mjs [nom...]   (sans argument : tout)
import { writeFileSync, mkdirSync } from 'node:fs';
import { Evaluator } from './sdf.mjs';
import { meshSDF } from './mesher.mjs';
import { ready, simplifyPositions, cutZones, splitSeams, simplifyLOD, optimize, bakeAO, skinWeights } from './mesh.mjs';
import { buildHuman } from './body.mjs';
import { buildHairAssets } from './hair.mjs';
import { encodeAsset } from './encode.mjs';
import { Z, LOD_MERGE } from '../../src/entities/human/zones.js';

const OUT = new URL('../../src/entities/human/data/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const H = Number(process.env.H || 0.0025);

const BODIES = [
  { name: 'f_rider', sex: 'f', variant: 'rider', lods: [8800, 2100, 650] },
  { name: 'm_rider', sex: 'm', variant: 'rider', lods: [8800, 2100, 650] },
  { name: 'f_casual', sex: 'f', variant: 'casual', lods: [8500, 2050, 620] },
  { name: 'm_casual', sex: 'm', variant: 'casual', lods: [8500, 2050, 620] },
  { name: 'f_dress', sex: 'f', variant: 'dress', lods: [8400, 2050, 620] },
];

const log = (...a) => console.log(...a);

function importance(zone, p, headY) {
  switch (zone) {
    case Z.LIPS: case Z.SCLERA: case Z.IRIS: case Z.PUPIL: case Z.BROW: case Z.EYE_LOD: return 3.2;
    case Z.SKIN: case Z.BEARD: case Z.SCALP: return p[1] > headY - 0.09 ? (p[2] > headY * 0 + 0.0 ? 2.6 : 1.5) : 1.2;
    case Z.HAND: return 1.7;
    case Z.HAIR: case Z.HAIR_TIE: return 1.2;
    case Z.SOLE: case Z.FOOT: return 0.8;
    default: return 1;
  }
}

// Construit les LOD d'une surface (corps, cheveux, coiffe) à partir d'un évaluateur et d'une fonction de zones.
export function buildLODs(ev, cut, lods, { headY = 1.6, keep = null } = {}) {
  const out = [];
  for (let l = 0; l < lods.length; l++) {
    const sm = splitSeams(cut.pos, cut.idx, cut.tz, LOD_MERGE[l] || null);
    const nv = sm.pos.length / 3;
    const imp = new Float32Array(nv);
    for (let v = 0; v < nv; v++) imp[v] = importance(sm.vz[v], [sm.pos[v * 3], sm.pos[v * 3 + 1], sm.pos[v * 3 + 2]], headY);
    const s = simplifyLOD(sm.pos, sm.idx, sm.vz, imp, lods[l], { attrWeight: l === 0 ? 0.9 : 0.6, flags: l === 2 ? ['Regularize'] : ['RegularizeLight'] });
    const n = s.pos.length / 3;
    const nrm = new Float32Array(n * 3);
    const ao = new Float32Array(n);
    const skin = [];
    for (let v = 0; v < n; v++) {
      const p = [s.pos[v * 3], s.pos[v * 3 + 1], s.pos[v * 3 + 2]];
      const g = ev.grad(p[0], p[1], p[2], 0.0008);
      nrm.set(g, v * 3);
      ao[v] = bakeAO(ev, p, g);
      skin.push(skinWeights(ev, p));
    }
    // ordre optimisé (cache GPU + compression)
    const idx = new Uint32Array(s.idx);
    const zone = Uint8Array.from(s.vz);
    const opt = optimize(s.pos, idx, [nrm, ao, zone, Int32Array.from(skin.map((_, i) => i))]);
    const [nrm2, ao2, zone2, order] = opt.extras;
    out.push({ pos: opt.pos, nrm: nrm2, ao: ao2, zone: zone2, skin: Array.from(order, (i) => skin[i]), idx: opt.idx });
    log(`  LOD${l} : ${opt.idx.length / 3} triangles, ${opt.pos.length / 3} sommets (erreur ${(s.error * 1000).toFixed(2)} mm)`);
  }
  return out;
}

function writeAsset(name, meshes) {
  const enc = encodeAsset(meshes);
  writeFileSync(new URL(`${name}.js`, OUT), `// Généré par scripts/humans/gen-humans.mjs — ne pas modifier à la main.\nexport default '${enc.b64}';\n`);
  log(`  → ${name}.js : ${(enc.b64.length / 1024).toFixed(1)} Ko (brut ${(enc.raw / 1024).toFixed(1)} Ko)`);
  return enc.b64.length;
}

await ready();
let total = 0;
// Mode mise au point : région seule (tête, main, pied) → tests/e2e/out/humans/debug_<région>.js
if (process.env.REGION) {
  const [name, sex = 'f', variant = 'rider'] = process.env.REGION.split(':');
  const model = buildHuman(sex, variant);
  const ev = new Evaluator(model.root, model.skel);
  const J = model.skel.rest;
  const R = {
    head: [-0.11, J.head[1] - 0.14, J.head[2] - 0.12, 0.11, J.head[1] + 0.17, J.head[2] + 0.16],
    hand: [J.lHand[0] - 0.04, J.lHand[1] - 0.25, J.lHand[2] - 0.08, J.lHand[0] + 0.25, J.lHand[1] + 0.06, J.lHand[2] + 0.08],
    foot: [J.lFoot[0] - 0.08, -0.01, J.lFoot[2] - 0.1, J.lFoot[0] + 0.12, J.lFoot[1] + 0.25, J.lFoot[2] + 0.32],
  }[name];
  // la main en pose de liaison est tournée : boîte large autour du poignet en liaison
  const bb = name === 'hand' ? [0.38, 0.6, -0.12, 0.75, 1.05, 0.12] : R;
  const surf = meshSDF(ev, bb, Number(process.env.H || 0.0018), { log: (m) => log('  ' + m) });
  const pre = simplifyPositions(surf.pos, surf.idx, 60000, 0.0002);
  const cut = cutZones(pre.pos, pre.idx, ev, (x, y, z) => model.zoneOf(ev, x, y, z), (m) => log('  ' + m));
  const meshes = buildLODs(ev, cut, [Number(process.env.TRIS || 3000)], { headY: J.head[1] });
  const enc = (await import('./encode.mjs')).encodeAsset(meshes);
  writeFileSync(new URL(`../../tests/e2e/out/humans/debug_${name}.js`, import.meta.url), `export default '${enc.b64}';\n`);
  log('ok');
  process.exit(0);
}
for (const B of BODIES) {
  if (args.length && !args.includes(B.name) && !args.includes('bodies')) continue;
  const t0 = Date.now();
  log(`${B.name} (${B.sex}, ${B.variant})`);
  const model = buildHuman(B.sex, B.variant);
  const ev = new Evaluator(model.root, model.skel);
  log(`  ${ev.prims.length} primitives`);
  const surf = meshSDF(ev, model.root.bb, H, { log: (m) => log('  ' + m) });
  const pre = simplifyPositions(surf.pos, surf.idx, 140000, 0.00025);
  log(`  pré-simplifié : ${pre.idx.length / 3} triangles`);
  const cut = cutZones(pre.pos, pre.idx, ev, (x, y, z) => model.zoneOf(ev, x, y, z), (m) => log('  ' + m));
  const meshes = buildLODs(ev, cut, B.lods, { headY: model.skel.rest.head[1] });
  total += writeAsset(B.name, meshes);
  log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
if (!args.length || args.includes('hair') || args.some((a) => /^(hair_|helmet|cap)/.test(a))) {
  // Cheveux et coiffes : coordonnées locales de la tête, regroupés dans data/hair.js.
  const pack = {};
  const prev = new URL('hair.js', OUT);
  try {
    Object.assign(pack, (await import(prev.href + '?t=' + Date.now())).default);
  } catch {}
  for (const a of buildHairAssets()) {
    if (args.length && !args.includes('hair') && !args.includes(a.name)) continue;
    const t0 = Date.now();
    log(`${a.name}`);
    const ev = new Evaluator(a.root, a.skel);
    const surf = meshSDF(ev, a.root.bb, a.h || 0.002, { log: (m) => log('  ' + m) });
    let pos = surf.pos, idx = surf.idx;
    if (a.cull) {
      // supprimer les triangles enfouis dans la tête
      const keep = [];
      for (let i = 0; i < idx.length; i += 3) {
        let inside = 0;
        for (let k = 0; k < 3; k++) {
          const v = idx[i + k];
          if (a.cull(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) < -0.0012) inside++;
        }
        if (inside < 3) keep.push(idx[i], idx[i + 1], idx[i + 2]);
      }
      idx = Uint32Array.from(keep);
    }
    const pre = simplifyPositions(pos, idx, 40000, 0.0002);
    const cut = cutZones(pre.pos, pre.idx, ev, (x, y, z) => a.zoneOf(ev, x, y, z), (m) => log('  ' + m));
    const meshes = buildLODs(ev, cut, a.lods, { headY: 0 });
    for (const m of meshes) for (let v = 0; v < m.pos.length; v += 3) for (let k = 0; k < 3; k++) m.pos[v + k] -= a.local[k];
    const enc = (await import('./encode.mjs')).encodeAsset(meshes);
    pack[a.name] = enc.b64;
    log(`  → ${a.name} : ${(enc.b64.length / 1024).toFixed(1)} Ko, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const body = Object.entries(pack).map(([k, v]) => `  ${k}: '${v}',`).join('\n');
  writeFileSync(prev, `// Généré par scripts/humans/gen-humans.mjs — cheveux et coiffes (coordonnées locales de la tête).\nexport default {\n${body}\n};\n`);
  total += Object.values(pack).reduce((t, v) => t + v.length, 0);
}
log(`total ${(total / 1024).toFixed(1)} Ko`);
