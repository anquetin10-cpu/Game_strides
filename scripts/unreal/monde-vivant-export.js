// Jalon J3 (monde vivant de Deauville) : oracle relevé dans le jeu web EN COURS D'EXÉCUTION (modules importés tels quels,
// rien n'est modifié dans src/, public/ ni tests/).
//  - Ambient (src/gameplay/npcs.js) construit sur un jeu minimal (scène, terrain plat, joueur, listes de véhicules et de
//    chevaux) : voitures de la circulation (classe Car, privée au module, lue par amb.cars), passants (WalkAI, lus par
//    amb.walkers), spectateurs de la carrière du Pôle ; puis trajectoires simulées avec Car.update, WalkAI.update et
//    Ambient.update (séparation des passants) au pas fixe, Math.random remplacé par mulberry32 (graine écrite).
//  - Minimap (src/ui/minimap.js) dessinée sur une toile factice qui enregistre les appels : rotation de la carte, image,
//    itinéraire GPS, repères, flèche du joueur, pastille du nord.
// Pilote : scripts/unreal/export-monde-vivant.mjs (Playwright), qui lit window.__monde.run().
import { Ambient } from '/src/gameplay/npcs.js';
import { Minimap } from '/src/ui/minimap.js';
import { ROADS, WORLD } from '/src/world/layout.js';
import { TOWN_BLOCKS, POLE } from '/src/world/sites.js';
import { CARS, CAR_COLORS, CAR_MODELS } from '/src/world/props.js';
import { mulberry32 } from '/src/core/math.js';

const realRandom = Math.random;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

function fakeGame() {
  const g = {
    scene: { add() {}, remove() {} },
    terrain: { getHeight: () => 0 },
    player: { focus: { pos: { x: -104, y: 0, z: 168 }, speed: 0, heading: 0 }, mode: 'ride', vehicle: null, inTruck: false },
    vehicles: [],
    drivables: [],
    horses: [],
    colliders: { resolve() {} },
    horns: 0,
    sky: { nightFactor: 0, rain: 0 },
    cheerT: 0,
    spawnHorse(def, x, z, heading) {
      return { def, pos: { x, y: 0, z }, heading, control: {}, anim: {}, mesh: { visible: true } };
    },
    spawnHuman(outfit, x, z, heading) {
      // Collisions du monde (colliders.resolve de WalkAI : lampadaires, voitures garées) sans effet ici : hors de l'oracle.
      return { outfit, pos: { x, y: 0, z }, heading, speed: 0, mesh: { visible: true }, mount(h) { this.mounted = h; } };
    },
  };
  g.audio = { horn: () => g.horns++ };
  return g;
}

function build(seed) {
  Math.random = mulberry32(seed);
  const g = fakeGame();
  const amb = new Ambient(g);
  return { g, amb };
}

function carState(c) {
  return { s: r6(c.s), dir: c.dir, x: r6(c.pos.x), z: r6(c.pos.z), heading: r6(c.heading), speed: r6(c.speed), uturn: c.uturn ? r6(c.uturn.th) : null };
}
function walkerState(p) {
  return { x: r6(p.pos.x), z: r6(p.pos.z), heading: r6(p.heading), speed: r6(p.speed), i: p.ai.i, wait: r6(p.ai.wait) };
}

// Simulation : passants (dans l'ordre d'apparition), puis Ambient.update (voitures, puis séparation une image sur deux).
function simulate({ seed, simSeed, frames, every, dt = 1 / 30, setup }) {
  const { g, amb } = build(seed);
  setup?.(g, amb);
  Math.random = mulberry32(simSeed);
  const camPos = g.player.focus.pos;
  const out = [];
  for (let f = 0; f < frames; f++) {
    for (const p of amb.walkers) p.ai.update(p, dt);
    amb.update(dt, camPos);
    if ((f + 1) % every === 0) out.push({ f: f + 1, cars: amb.cars.map(carState), walkers: amb.walkers.map(walkerState), horns: g.horns });
  }
  Math.random = realRandom;
  return out;
}

function spawnData(seed) {
  const { amb } = build(seed);
  Math.random = realRandom;
  return {
    cars: amb.cars.map((c) => ({ road: c.road.id, s: c.s, dir: c.dir, cruise: c.cruise, kind: c.kind, color: c.color })),
    walkers: amb.walkers.map((p) => ({ points: p.ai.points.map(([x, z]) => [r6(x), r6(z)]), speed: p.ai.speed, outfit: p.outfit, chatter: p.chatter })),
    spectators: amb.people.filter((p) => p.spectator).map((p) => ({ x: r6(p.pos.x), z: r6(p.pos.z), heading: r6(p.heading), outfit: p.outfit })),
  };
}

// ---------- Mini-carte ----------
function recordingCanvas(W) {
  const ops = [];
  const ctx = new Proxy(
    {},
    {
      get(t, k) {
        if (k in t) return t[k];
        return (...a) => ops.push([k, ...a.map((v) => (typeof v === 'number' ? r6(v) : typeof v === 'object' ? '[obj]' : v))]);
      },
      set(t, k, v) {
        t[k] = v;
        return true;
      },
    }
  );
  return { canvas: { width: W, height: W, getContext: () => ctx, getBoundingClientRect: () => ({ width: W, height: W }) }, ops };
}

// Lecture des appels d'une image : rotation de la carte, image, itinéraire (tirets), repères (translate après save),
// flèche (translate(R,R) puis rotate), nord (arc du rond).
function parseFrame(ops, R) {
  const fr = { mapRotate: null, image: null, route: [], blips: [], arrowRotate: null, north: null };
  let i = 0;
  const n = ops.length;
  for (; i < n; i++) {
    if (ops[i][0] === 'rotate' && fr.mapRotate === null) fr.mapRotate = ops[i][1];
    if (ops[i][0] === 'drawImage') {
      fr.image = ops[i].slice(2);
      i++;
      break;
    }
  }
  let inRoute = false;
  for (; i < n; i++) {
    const o = ops[i];
    if (o[0] === 'setLineDash') inRoute = true;
    else if (inRoute && (o[0] === 'moveTo' || o[0] === 'lineTo')) fr.route.push([o[1], o[2]]);
    else if (inRoute && o[0] === 'stroke') {
      inRoute = false;
      i++;
      break;
    } else if (!inRoute && o[0] === 'save' && ops[i + 1] && ops[i + 1][0] === 'translate') break;
  }
  for (; i < n; i++) {
    const o = ops[i];
    if (o[0] === 'save' && ops[i + 1] && ops[i + 1][0] === 'translate') {
      const tx = ops[i + 1][1], ty = ops[i + 1][2];
      if (Math.abs(tx - R) < 1e-9 && Math.abs(ty - R) < 1e-9 && ops[i + 2] && ops[i + 2][0] === 'rotate') {
        fr.arrowRotate = ops[i + 2][1];
        i += 3;
        break;
      }
      const sc = ops[i + 2] && ops[i + 2][0] === 'scale' ? ops[i + 2][1] : 1;
      fr.blips.push([tx, ty, sc]);
    }
  }
  for (; i < n; i++) if (ops[i][0] === 'arc') { fr.north = [ops[i][1], ops[i][2]]; break; }
  return fr;
}

function minimapRun() {
  const W = 132;
  const { canvas, ops } = recordingCanvas(W);
  const blips = [];
  const g = {
    player: { focus: { pos: { x: 0, z: 0 }, speed: 0, heading: 0 }, mode: 'ride' },
    cam: { yaw: 0 },
    gps: { route: null },
    getBlips: () => blips,
  };
  const m = new Minimap(canvas, g);
  m.setImage({ width: 1024, height: 1024 });
  // Images : départ à l'Écurie du Val, cap et regard qui tournent, vitesse qui monte puis descend, itinéraire vers le
  // chrono du Pôle (direct à cheval, gps.js updateRoute), repères dans le cadre et au bord (sticky).
  const frames = [];
  for (let k = 0; k < 90; k++) {
    const t = k / 89;
    const f = g.player.focus;
    f.pos.x = -104 + 300 * t;
    f.pos.z = 168 - 250 * t;
    f.speed = k < 45 ? k * 0.4 : (89 - k) * 0.4;
    f.heading = -2.2 + 4.1 * t;
    g.cam.yaw = 0.9 - 3.3 * t + 0.4 * Math.sin(k * 0.3);
    g.player.mode = k >= 70 && k < 80 ? 'drive' : 'ride';
    g.gps.route = k % 3 === 2 ? null : [[f.pos.x, f.pos.z], [330, -150]];
    blips.length = 0;
    blips.push({ x: 330, z: -150, kind: 'waypoint', sticky: true }, { x: -110, z: 172, kind: 'home' }, { x: 20, z: -266, kind: 'mission', sticky: true }, { x: f.pos.x + 30, z: f.pos.z - 20, kind: 'shop', small: true });
    ops.length = 0;
    const input = { x: f.pos.x, z: f.pos.z, speed: f.speed, heading: f.heading, yaw: g.cam.yaw, mode: g.player.mode, route: g.gps.route, blips: blips.map((b) => ({ ...b })) };
    m.draw(0.05);
    frames.push({ input, range: r6(m.range), ...parseFrame(ops, W / 2) });
  }
  return { W, initialRange: 170, frames };
}

window.__monde = {
  run() {
    const seed = 7;
    // Première construction à blanc : les caches de géométrie du web (voitures, tenues) tirent Math.random à leur
    // première création ; sans elle, l'apparition relevée et celle des simulations n'auraient pas les mêmes allures.
    spawnData(seed);
    const spawn = spawnData(seed);
    const again = spawnData(seed);
    if (JSON.stringify(again) !== JSON.stringify(spawn)) throw new Error('apparition non déterministe');
    const free = simulate({ seed, simSeed: 2026, frames: 2700, every: 15 });
    // Cheval arrêté sur la voie de droite de la route principale (sens +z) : les voitures s'arrêtent derrière, sans klaxon.
    const horse = simulate({
      seed, simSeed: 11, frames: 1800, every: 15,
      setup(g) {
        const h = { pos: { x: -32.2, y: 0, z: 100 }, heading: 0 };
        g.horses.push(h);
        g.player.focus.pos = h.pos;
        g.player.mode = 'ride';
      },
    });
    // Joueur à pied sur la chaussée : arrêt, klaxon au bout de 4 s à moins de 14 m.
    const foot = simulate({
      seed, simSeed: 12, frames: 1800, every: 15,
      setup(g) {
        g.player.focus.pos = { x: -32.2, y: 0, z: 100 };
        g.player.mode = 'foot';
      },
    });
    // Joueur posé à côté du premier passant : il s'arrête et se tourne vers lui.
    const near = simulate({
      seed, simSeed: 13, frames: 300, every: 5,
      setup(g, amb) {
        const p = amb.walkers[0];
        g.player.focus.pos = { x: p.pos.x + 1.5, y: 0, z: p.pos.z + 0.5 };
        g.player.mode = 'foot';
      },
    });
    return {
      world: { size: WORLD.size, half: WORLD.half },
      roads: ROADS.map((r) => ({ id: r.id, w: r.w, pts: r.pts })),
      townBlocks: TOWN_BLOCKS,
      poleArena: { x: POLE.arena.x, z: POLE.arena.z, w: POLE.arena.w, d: POLE.arena.d },
      cars: Object.fromEntries(CAR_MODELS.map((k) => [k, { L: r6(CARS[k].L), W: CARS[k].W, wb: CARS[k].wb, r: CARS[k].r }])),
      carColors: CAR_COLORS,
      seed,
      spawn,
      traces: { free, horse, foot, near },
      minimap: minimapRun(),
    };
  },
};
window.__mondeReady = true;
document.getElementById('log').textContent = 'prêt';
