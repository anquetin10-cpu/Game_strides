// Jalon J2 : oracle des fonctions géométriques du contact membre / barre du jeu web (src/gameplay/limbContact.js :
// toLocal, segAxis, capsuleRail, sweepRail), importées telles quelles (module sans dépendance au rendu). Le jeu web est la
// spécification ; ce script ne modifie rien dans src/ ni tests/.
// Cas : tirage déterministe (générateur à graine) autour d'une barre, plus des cas limites écrits à la main (segment
// réduit à un point, projection hors du segment des deux côtés, bord de la largeur, contact rasant, balayage qui traverse
// la barre entre deux images sans contact à l'une ni à l'autre).
// Sortie : unreal/core/tests/oracles/limb_contact.json (réécrit seulement s'il change), rejoué par
// unreal/core/tests/test_core.cpp (testLimbContact) avec strides::limb.
// Usage : node scripts/unreal/export-limb-contact.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAIL_R, toLocal, segAxis, capsuleRail, sweepRail } from '../../src/gameplay/limbContact.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'unreal/core/tests/oracles/limb_contact.json');

// mulberry32 : suite déterministe.
let seed = 0x5a17c0de;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const U = (a, b) => a + (b - a) * rnd();
const P = () => ({ s: U(-0.6, 0.6), u: U(-2.2, 2.2), y: U(0.6, 1.8) });
const bar = () => ({ s: U(-0.4, 0.4), h: U(0.8, 1.6) });
const near = (b, d) => ({ s: b.s + U(-d, d), u: U(-2.0, 2.0), y: b.h + U(-d, d) });

const toLocalCases = [];
for (let i = 0; i < 40; i++) {
  const a = U(-Math.PI, Math.PI);
  const o = { x: U(-60, 60), z: U(-60, 60), n: { x: Math.sin(a), z: Math.cos(a) }, t: { x: Math.cos(a), z: -Math.sin(a) }, ground: U(-0.3, 0.6) };
  const p = { x: o.x + U(-5, 5), y: U(0, 2.5), z: o.z + U(-5, 5) };
  toLocalCases.push({ o, p, r: toLocal(o, p) });
}

const segCases = [];
const capCases = [];
for (let i = 0; i < 400; i++) {
  const b = bar();
  const a = i % 3 ? near(b, 0.4) : P();
  const c = i % 3 ? near(b, 0.4) : P();
  segCases.push({ a, b: c, bar: b, r: segAxis(a, c, b) });
  const r = i % 2 ? 0.045 : 0.055;
  const halfW = U(1.4, 2.0);
  capCases.push({ a, b: c, rad: r, bar: b, halfW, r: capsuleRail(a, c, r, b, halfW) });
}
// Cas limites.
const B0 = { s: 0, h: 1.2 };
const pt = { s: 0.03, u: 0.5, y: 1.25 };
segCases.push({ a: pt, b: pt, bar: B0, r: segAxis(pt, pt, B0) }); // segment réduit à un point (k = 0)
segCases.push({ a: { s: 0.2, u: 0, y: 1.4 }, b: { s: 0.4, u: 0, y: 1.6 }, bar: B0, r: segAxis({ s: 0.2, u: 0, y: 1.4 }, { s: 0.4, u: 0, y: 1.6 }, B0) }); // k < 0
segCases.push({ a: { s: -0.4, u: 0, y: 0.8 }, b: { s: -0.2, u: 0, y: 1.0 }, bar: B0, r: segAxis({ s: -0.4, u: 0, y: 0.8 }, { s: -0.2, u: 0, y: 1.0 }, B0) }); // k > 1
for (const u of [1.7 + 0.055 - 1e-6, 1.7 + 0.055 + 1e-6, -1.7 - 0.055 - 1e-6]) {
  const a = { s: 0, u, y: 1.1 }, c = { s: 0, u, y: 1.3 };
  capCases.push({ a, b: c, rad: 0.055, bar: B0, halfW: 1.7, r: capsuleRail(a, c, 0.055, B0, 1.7) }); // bord de la largeur
}
{
  const a = { s: 0.105, u: 0, y: 1.0 }, c = { s: 0.105, u: 0, y: 1.4 };
  capCases.push({ a, b: c, rad: 0.055, bar: B0, halfW: 1.7, r: capsuleRail(a, c, 0.055, B0, 1.7) }); // contact rasant
}

const sweepCases = [];
for (let i = 0; i < 300; i++) {
  const b = bar();
  const a0 = near(b, 0.5), b0 = near(b, 0.5);
  const d = { s: U(-0.3, 0.3), u: U(-0.1, 0.1), y: U(-0.3, 0.3) };
  const a1 = { s: a0.s + d.s, u: a0.u + d.u, y: a0.y + d.y }, b1 = { s: b0.s + d.s + U(-0.05, 0.05), u: b0.u + d.u, y: b0.y + d.y + U(-0.05, 0.05) };
  const r = i % 2 ? 0.045 : 0.055, halfW = U(1.4, 2.0), steps = i % 5 === 0 ? 3 : 6;
  sweepCases.push({ a0, b0, a1, b1, rad: r, bar: b, halfW, steps, r: sweepRail(a0, b0, a1, b1, r, b, halfW, steps) });
}
{
  // Sabot qui traverse la barre d'une image à l'autre : aucun contact aux deux images, contact pendant le balayage.
  const a0 = { s: -0.3, u: 0, y: 1.25 }, b0 = { s: -0.3, u: 0, y: 1.1 }, a1 = { s: 0.3, u: 0, y: 1.25 }, b1 = { s: 0.3, u: 0, y: 1.1 };
  sweepCases.push({ a0, b0, a1, b1, rad: 0.055, bar: B0, halfW: 1.7, steps: 6, r: sweepRail(a0, b0, a1, b1, 0.055, B0, 1.7, 6), note: 'traversée entre deux images' });
  sweepCases.push({ a0, b0, a1, b1, rad: 0.055, bar: B0, halfW: 1.7, steps: 1, r: sweepRail(a0, b0, a1, b1, 0.055, B0, 1.7, 1), note: 'traversée, un seul pas : manquée' });
}

const doc = {
  schema: 'strides.oracle.limb_contact/1',
  generator: 'scripts/unreal/export-limb-contact.mjs',
  source: ['src/gameplay/limbContact.js'],
  RAIL_R,
  frame: "repère de l'obstacle : s le long de l'axe de saut n, u le long des barres t, y au-dessus du sol ; m",
  toLocal: toLocalCases,
  segAxis: segCases,
  capsuleRail: capCases,
  sweepRail: sweepCases,
};
const txt = JSON.stringify(doc, (k, v) => (v === undefined ? null : v)) + '\n';
if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== txt) {
  writeFileSync(OUT, txt);
  console.log(`écrit ${OUT}`);
} else console.log(`inchangé ${OUT}`);
const hits = sweepCases.filter((c) => c.r).length, caps = capCases.filter((c) => c.r && c.r.depth > 0).length, outW = capCases.filter((c) => !c.r).length;
console.log(`toLocal ${toLocalCases.length}, segAxis ${segCases.length}, capsuleRail ${capCases.length} (contact ${caps}, hors largeur ${outW}), sweepRail ${sweepCases.length} (contact ${hits})`);
