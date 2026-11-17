// Export des données et des cas de référence (oracles) du jeu web vers le portage Unreal (hors runtime).
// Les modules JS du jeu sont la spécification : les valeurs sont lues dans le code tel qu'il est, jamais recopiées à la
// main. Sorties versionnées (champ "schema"), indépendantes de Three.js, unités SI (m, s, m/s, rad) — la conversion en
// centimètres d'Unreal se fait à la lecture (voir unreal/docs/conventions.md).
//  - unreal/StridesGrandTour/Content/Data/*.json : données lues par le jeu Unreal ;
//  - unreal/core/tests/oracles/*.json : entrées et sorties attendues, rejouées par les tests du cœur C++.
// Usage : npx vite-node scripts/unreal/export-data.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JUMP, planJump, railsAhead, takeoffQuality, speedFactor, angleFactor } from '../../src/gameplay/jumpModel.js';
import { CSO_RIDE, steerRate, cadenceDelta, minRadius, maxTurnRate } from '../../src/gameplay/csoRide.js';
import { CSO_DESIGN, traceCourse, csoHeights } from '../../src/gameplay/csoCourse.js';
import { timeFaults, compareResults } from '../../src/gameplay/challenge.js';
import { COURSE_SPEED, COURSE_LENGTH, timeAllowedFor } from '../../src/gameplay/courses.js';
import { HORSE } from '../../src/config.js';
import { POLE } from '../../src/world/sites.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = join(ROOT, 'unreal/StridesGrandTour/Content/Data');
const ORA = join(ROOT, 'unreal/core/tests/oracles');
mkdirSync(DATA, { recursive: true });
mkdirSync(ORA, { recursive: true });
const write = (dir, name, obj) => writeFileSync(join(dir, name), JSON.stringify(obj, null, 1) + '\n');
const src = (f) => `src/${f}`;

// ---------- Données ----------
write(DATA, 'horse_gaits.json', { schema: 'strides.horse_gaits/1', source: src('config.js'), units: 'm/s', gaits: HORSE.gaits.map((g) => ({ id: g.short, name: g.name, speed: g.speed, max: g.max ?? null })), jumpPeak: HORSE.jumpPeak, jumpDuration: HORSE.jumpDuration, minJumpSpeed: HORSE.minJumpSpeed, stamina: HORSE.stamina, gallopDrain: HORSE.gallopDrain, staminaRegen: HORSE.staminaRegen });
write(DATA, 'jump_model.json', { schema: 'strides.jump_model/1', source: src('gameplay/jumpModel.js'), units: 'm, s', ...JUMP });
write(DATA, 'cso_ride.json', { schema: 'strides.cso_ride/1', source: src('gameplay/csoRide.js'), units: 'm, s, rad', ...CSO_RIDE });
write(DATA, 'cso_course_pole.json', { schema: 'strides.cso_course/1', source: src('gameplay/csoCourse.js'), frame: 'arena: x east, z south, heading h -> (sin h, cos h)', arena: POLE.arena, design: CSO_DESIGN, length: COURSE_LENGTH.cso, speeds: COURSE_SPEED, rules: { rail: 4, firstRefusal: 4, refusalsToEliminate: 2, timeFaultPerSecond: 1 } });

// ---------- Oracles ----------
// Saut : grille d'appels devant un vertical et un oxer, plusieurs vitesses, angles, puissances.
const fence = (kind, spread, h) => ({ x: 0, z: 0, n: { x: 0, z: 1 }, t: { x: 1, z: 0 }, kind, bars: kind === 'o' ? [{ s: -spread / 2, h: h - 0.05 }, { s: spread / 2, h }] : [{ s: 0, h }] });
const jump = [];
for (const [kind, spread, h] of [['v', 0, 1.1], ['o', 1.3, 1.2], ['v', 0, 1.45], ['w', 0, 1.0]])
  for (const d of [0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6])
    for (const v of [4.6, 6.2, 7.5, 9.5])
      for (const ang of [0, 0.35])
        for (const cso of [true, false]) {
          const f = fence(kind, spread, h);
          const fx = Math.sin(ang), fz = Math.cos(ang);
          const px = -fx * d, pz = -fz * d - (kind === 'o' ? spread / 2 : 0);
          const geo = railsAhead(f, px, pz, fx, fz);
          const horse = { v, power: 1.55, clearance: 0.04, cso };
          const p = planJump(horse, geo);
          jump.push({ in: { fence: f, px, pz, fx, fz, horse }, out: { L: p.L, H: p.H, margin: p.margin === Infinity ? null : p.margin, margins: p.margins, zone: p.zone, cause: p.cause ?? null, quality: takeoffQuality(p) } });
        }
write(ORA, 'jump.json', { schema: 'strides.oracle.jump/1', source: src('gameplay/jumpModel.js'), factors: [0, 2, 3.5, 5, 6.5, 8, 9, 10.5, 12, 14].map((v) => ({ v, speed: speedFactor(v) })).concat([1, 0.9, 0.5].map((c) => ({ cosA: c, angle: angleFactor(c) }))), cases: jump });
// Conduite CSO.
const ride = [];
for (const v of [0, 0.5, 1, 3, 4.6, 6.2, 8]) for (const x of [-1, -0.5, -0.05, 0, 0.3, 1]) ride.push({ fn: 'steerRate', in: [x, v], out: steerRate(x, v) });
for (const c of [2, 4.6, 6.2]) for (const [y, x] of [[1, 0], [0.5, 0], [0.3, 0], [-1, 0], [0.8, 0.9], [-0.6, 0.2]]) ride.push({ fn: 'cadenceDelta', in: [y, x, c], out: cadenceDelta(y, x, c) });
for (const v of [0, 0.5, 1, 4.6, 6.2, 9]) ride.push({ fn: 'minRadius', in: [v], out: minRadius(v) }, { fn: 'maxTurnRate', in: [v], out: maxTurnRate(v) });
write(ORA, 'cso_ride.json', { schema: 'strides.oracle.cso_ride/1', source: src('gameplay/csoRide.js'), cases: ride });
// Tracé du parcours et règles de temps.
const tr = traceCourse();
write(ORA, 'cso_course.json', {
  schema: 'strides.oracle.cso_course/1', source: src('gameplay/csoCourse.js'),
  length: tr.length, fences: tr.fences.map((f) => ({ label: f.label, kind: f.kind, spread: f.spread, x: f.x, z: f.z, rot: f.rot, s: f.s })), marks: tr.marks,
  samplePts: tr.pts.filter((_, i) => i % 25 === 0), heights110: csoHeights(1.1),
  timeAllowed: Object.fromEntries(Object.entries(COURSE_SPEED).map(([k, sp]) => [k, timeAllowedFor(COURSE_LENGTH.cso, sp)])),
  timeFaults: [[40, 45], [45, 45], [45.01, 45], [46, 45], [47.5, 45], [60, 45]].map(([t, a]) => ({ t, allowed: a, out: timeFaults(t, a) })),
  compare: [[{ penalties: 0, time: 50 }, { penalties: 4, time: 40 }], [{ penalties: 4, time: 40 }, { penalties: 4, time: 41 }], [{ eliminated: 'r' }, { penalties: 12, time: 80 }]].map(([a, b]) => ({ a, b, out: Math.sign(compareResults(a, b)) })),
});
console.log('données :', DATA, '\noracles :', ORA, '\nsauts', jump.length, 'conduite', ride.length, 'obstacles', tr.fences.length);
