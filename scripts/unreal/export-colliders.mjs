// Oracle des collisions (jalon J1, correction) : src/world/colliders.js tel quel, clôture de la carrière du Pôle
// (world.js rectFence(POLE.arena, …, 's', 7, 0.5), sol plat), ailes d'un droit et d'un oxer (obstacles.js add), puis
// la résolution du cheval de horse.js:344-360 recopiée ligne à ligne (elle vit dans Horse.update, qui n'est pas isolable).
// Écrit unreal/core/tests/oracles/colliders.json, lu par le ctest « colliders ».
// Usage : node scripts/unreal/export-colliders.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { Colliders } from '../../src/world/colliders.js';
// POLE.arena (src/world/sites.js, qui importe des images : non chargeable sous Node) relu dans l'export du jeu.
const POLE_FILE = JSON.parse(readFileSync(new URL('../../unreal/StridesGrandTour/Content/Data/cso_course_pole.json', import.meta.url), 'utf8'));
const POLE = { arena: POLE_FILE.arena, stands: POLE_FILE.stands };

const C = new Colliders();
const ground = () => 0;
// world.js fence / rectFence (opts : height 1.0, tag 'arena').
function fence(points, height, tag) {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const top = Math.max(ground(ax, az), ground(bx, bz), ground((ax + bx) / 2, (az + bz) / 2)) + height;
    C.addSegment(ax, az, bx, bz, 0.35, top, tag);
  }
}
function rectFence(r, gapSide, gap, gapPos) {
  const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2;
  const gx = x0 + r.w * gapPos;
  if (gapSide === 's') return [[gx + gap / 2, z1], [x1, z1], [x1, z0], [x0, z0], [x0, z1], [gx - gap / 2, z1]];
  throw new Error('côté non couvert');
}
const A = POLE.arena;
const pts = rectFence(A, 's', 7, 0.5);
fence(pts, 1.0, 'arena');
// obstacles.js add : ailes.
function wings(o) {
  const ob = { w: 3.6, h: 1.1, kind: 'v', spread: 0, ...o };
  if (ob.kind === 'o' && !ob.spread) ob.spread = 1.2;
  ob.t = { x: Math.cos(ob.rot), z: -Math.sin(ob.rot) };
  const u0 = ob.w / 2 + 0.5, u1 = ob.w / 2 + 1.06;
  for (const side of [-1, 1]) {
    const u = (side * (u0 + u1)) / 2;
    C.addBox(ob.x + ob.t.x * u, ob.z + ob.t.z * u, (u1 - u0) / 2, ob.spread / 2 + 0.12, ob.rot, 0 + ob.h + 0.75, 'wing');
  }
}
const obstacles = [{ kind: 'v', x: 320, z: -230, rot: 0.6, w: 3.6, h: 1.15 }, { kind: 'o', x: 345, z: -215, rot: -1.1, w: 3.8, h: 1.2, spread: 0 }];
obstacles.forEach(wings);
// Jalon J2b (B9) : tribunes du Pôle, world.js buildStands(POLE.stands, 0) : boîte pleine w × d, sans sommet.
const ST = POLE.stands;
C.addBox(ST.x, ST.z, ST.w / 2, ST.d / 2, 0, Infinity, 'stands');
const boxes = C.all.map((c) => ({ x: c.x, z: c.z, hw: c.hw, hd: c.hd, rot: c.rot, top: c.top, tag: c.tag }));

// horse.js:344-360.
function collide(h, dt, time) {
  const fw = { x: Math.sin(h.heading), z: Math.cos(h.heading) };
  const cx = h.x + fw.x * 0.45, cz = h.z + fw.z * 0.45;
  const probe = { x: cx, z: cz };
  const groundNow = 0;
  const hit = C.resolve(probe, 0.85, groundNow + h.jumpY + (h.jumpT >= 0 ? 0.2 + h.clearance : 0), null);
  let bump = false;
  if (hit) {
    h.x += probe.x - cx;
    h.z += probe.z - cz;
    const into = -(fw.x * hit.nx + fw.z * hit.nz);
    if (into > 0.5 && h.speed > 5 && time - h.lastBump > 0.6) {
      h.lastBump = time;
      bump = true;
    }
    h.speed *= 1 - Math.min(Math.max(into, 0), 1) * Math.min(1, dt * 12);
  }
  return { hit: !!hit, bump, x: h.x, z: h.z, speed: h.speed, lastBump: h.lastBump };
}
// Cas : un cheval lancé contre chaque côté, en biais, dans l'ouverture, au-dessus (saut), contre une aile, au centre
// d'un obstacle (pas de collision : les barres ne sont pas des colliders).
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cases = [];
const starts = [
  { x: 330, z: -224 + 38 - 0.3, heading: 0, speed: 7, jumpY: 0, jumpT: -1, clearance: 0 },      // vers la lice sud (hors ouverture : x 330 = ouverture !)
  { x: 300, z: -224 + 38 - 0.6, heading: 0.2, speed: 7, jumpY: 0, jumpT: -1, clearance: 0 },    // lice sud, en biais
  { x: 330 + 60 - 0.5, z: -230, heading: Math.PI / 2, speed: 6, jumpY: 0, jumpT: -1, clearance: 0 },  // lice est
  { x: 330 - 60 + 0.4, z: -210, heading: -Math.PI / 2 + 0.3, speed: 8, jumpY: 0, jumpT: -1, clearance: 0 },
  { x: 350, z: -224 - 38 + 0.2, heading: Math.PI, speed: 5.5, jumpY: 0, jumpT: -1, clearance: 0 }, // lice nord
  { x: 350, z: -224 - 38 + 0.2, heading: Math.PI, speed: 5.5, jumpY: 1.4, jumpT: 0.5, clearance: 0 }, // au-dessus (saut)
  { x: 320 + Math.cos(0.6) * 2.6, z: -230 - Math.sin(0.6) * 2.6, heading: 0.6, speed: 6, jumpY: 0, jumpT: -1, clearance: 0 }, // aile du droit
  { x: 320, z: -230, heading: 0.6, speed: 6, jumpY: 0, jumpT: -1, clearance: 0 }, // milieu du droit : rien
  // J2b (B9) : tribunes du Pôle, abordées par la carrière (nord de la lice) et par l'arrière, et au-dessus en saut.
  { x: 340, z: -265.6, heading: Math.PI, speed: 7, jumpY: 0, jumpT: -1, clearance: 0 },
  { x: 300, z: -280.6, heading: 0.15, speed: 5, jumpY: 0, jumpT: -1, clearance: 0 },
  { x: 368.6, z: -273, heading: -Math.PI / 2, speed: 6, jumpY: 1.4, jumpT: 0.5, clearance: 0 },
];
for (let i = 0; i < 40; i++) {
  starts.push({ x: 270 + rnd() * 120, z: -262 + rnd() * 76, heading: rnd() * 6.283 - 3.14, speed: rnd() * 8, jumpY: rnd() < 0.2 ? rnd() * 1.5 : 0, jumpT: rnd() < 0.2 ? 0.4 : -1, clearance: 0.05 });
}
for (const s of starts) {
  const h = { ...s, lastBump: -10 };
  const steps = [];
  for (let k = 0; k < 12; k++) {
    const dt = 1 / 60;
    h.x += Math.sin(h.heading) * h.speed * dt;
    h.z += Math.cos(h.heading) * h.speed * dt;
    steps.push(collide(h, dt, k * dt));
  }
  cases.push({ start: s, steps });
}
writeFileSync(new URL('../../unreal/core/tests/oracles/colliders.json', import.meta.url), JSON.stringify({ source: 'src/world/colliders.js, world.js fence/rectFence, buildStands, obstacles.js add, horse.js:344-360', arena: A, stands: ST, fence: pts, obstacles, boxes, cases }, null, 0));
console.log(`colliders.json : ${boxes.length} boîtes, ${cases.length} cas`);
