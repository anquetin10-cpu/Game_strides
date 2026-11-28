// Jalon J3b : véhicules conduisibles du jeu web (src/entities/truckPhysics.js TruckSim, TRUCK_SPEC, VEHICLE_SPECS ;
// src/entities/vehicle.js doorPoint, seat, TRACTOR ; src/entities/truck.js doorPoint, collision ; truckModel.js
// TRUCK_DIM ; sites.js HOME.truck). Les caractéristiques sont lues dans les modules du web eux-mêmes ; la portière est
// calculée par les vraies méthodes du web (Vehicle.prototype.doorPoint, Truck.prototype.doorPoint) sur un objet minimal.
// Oracle : TruckSim du web pilotée par des commandes scriptées (accélération, virage, freinage, marche arrière, arrêt),
// relevée à chaque dixième de seconde, pour le ctest « vehicules ». Rien n'est modifié dans src/.
// Sorties : unreal/StridesGrandTour/Content/Data/vehicles.json, unreal/core/tests/oracles/vehicles.json
// Usage : node --import ./scripts/unreal/node-web/register.mjs scripts/unreal/export-vehicules.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = process.argv.includes('--check');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { TruckSim, TRUCK_SPEC, VEHICLE_SPECS } = await imp('src/entities/truckPhysics.js');
const { Vehicle } = await imp('src/entities/vehicle.js');
const { Truck } = await imp('src/entities/truck.js');
const { TRUCK_DIM } = await imp('src/entities/truckModel.js');
const { CARS } = await imp('src/world/props.js');
const { HOME } = await imp('src/world/sites.js');
const literal = (text, re, what) => {
  const m = text.match(re);
  if (!m) throw new Error(`${what} introuvable`);
  return Function('Math', `return (${m[1]});`)(Math);
};
const TRACTOR = literal(readFileSync(join(ROOT, 'src/entities/vehicle.js'), 'utf8'), /const TRACTOR = (\{[^}]*\});/, 'TRACTOR');

const r6 = (v) => Math.round(v * 1e6) / 1e6;
// Caractéristiques : nombres, tableaux de nombres et chaînes (nom, carburant, motricité) de chaque modèle.
const plain = (s) => {
  const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') o[k] = v;
    else if (Array.isArray(v)) o[k] = v;
  }
  return o;
};
const specs = { truck: plain(TRUCK_SPEC) };
for (const [k, v] of Object.entries(VEHICLE_SPECS)) specs[k] = plain(v);

// Gabarit et portière conducteur (côté gauche, side = 1) dans le repère du véhicule : x à gauche, z vers l'avant.
const at0 = { x: 0, y: 0, z: 0 };
const geometry = {};
for (const kind of Object.keys(VEHICLE_SPECS)) {
  if (kind === 'master' || kind === 'defender110_hero') continue; // modèles fournis (van, Defender) : non posés au monde porté
  const isTractor = kind === 'tractor';
  const spec = isTractor ? TRACTOR : CARS[kind];
  if (!spec) continue;
  const v = Object.create(Vehicle.prototype);
  Object.assign(v, { isTractor, spec, pos: at0, sim: { heading: 0 } });
  const d = v.doorPoint(1, {});
  geometry[kind] = {
    L: r6(spec.L), W: r6(spec.W), H: r6(spec.H ?? (isTractor ? 3 : 1.6)), zc: r6(spec.zc || 0), wb: r6(spec.wb), r: r6(spec.r),
    doorX: r6(d.x), doorZ: r6(d.z), camDist: v.camDist, hw: r6(spec.W / 2 + 0.12), hd: r6(spec.L / 2 + 0.1),
  };
}
{
  const t = Object.create(Truck.prototype);
  Object.assign(t, { pos: at0, sim: { heading: 0 } });
  const d = t.doorPoint(1, {});
  geometry.truck = {
    L: r6(TRUCK_DIM.L), W: r6(TRUCK_DIM.W), H: r6(TRUCK_DIM.H ?? 3.6), zc: 0, wb: r6(TRUCK_SPEC.zFront - TRUCK_SPEC.zRear), r: TRUCK_SPEC.wheelR,
    doorX: r6(d.x), doorZ: r6(d.z), camDist: TRUCK_DIM.L > 10 ? 16 : 11, camHeight: TRUCK_DIM.L > 10 ? 4.3 : null,
    hw: r6(TRUCK_DIM.W / 2), hd: r6(TRUCK_DIM.L / 2),
  };
}
const truckHome = { x: HOME.truck.x, z: HOME.truck.z, heading: r6(HOME.truck.rot) };

// ---- Oracle : TruckSim du web, commandes scriptées ----
const SCRIPT = [
  { t: 8, throttle: 1, steer: 0 },
  { t: 4, throttle: 1, steer: 0.6 },
  { t: 2, throttle: 0.4, steer: -1 },
  { t: 5, throttle: -1, steer: 0 },
  { t: 3, throttle: -1, steer: 0.5 },
  { t: 2, throttle: 0, steer: 0 },
  { t: 3, throttle: 1, steer: 0, slope: 0.08, soft: 1 },
  { t: 2, throttle: 0, steer: 0, park: true },
];
const DT = 1 / 60;
const runs = [];
for (const kind of ['clio', 'duster', 'tractor', 'truck', 'p508']) {
  const sim = new TruckSim(kind === 'truck' ? TRUCK_SPEC : VEHICLE_SPECS[kind]);
  sim.pos = { x: 10, y: 0, z: -20 };
  sim.heading = 0.3;
  sim.engineOn = true;
  sim.rpm = sim.spec.idle * 0.6; // vehicle.js startEngine
  sim.gear = sim.spec.startGear;
  if (kind === 'truck') sim.horses = 1;
  const rows = [];
  let n = 0;
  for (const ph of SCRIPT) {
    sim.slope = ph.slope || 0;
    sim.soft = ph.soft || 0;
    const steps = Math.round(ph.t / DT);
    for (let i = 0; i < steps; i++) {
      sim.step(DT, { throttle: ph.throttle, steer: ph.steer, park: !!ph.park });
      if (++n % 6 === 0) {
        rows.push([n, sim.pos.x, sim.pos.z, sim.heading, sim.vx, sim.vy, sim.r, sim.rpm, sim.gear, sim.steer, sim.brake, sim.throttle, sim.fuelL, sim.gearLabel].map((v) => (typeof v === 'number' ? r6(v) : v)));
      }
    }
  }
  const [al, ar] = sim.ackermann();
  runs.push({ kind, horses: sim.horses, dt: DT, script: SCRIPT, rows, final: { ackL: r6(al), ackR: r6(ar), tripM: r6(sim.tripM), tripL: r6(sim.tripL) } });
}

const out = [
  [join(ROOT, 'unreal/StridesGrandTour/Content/Data/vehicles.json'), {
    schema: 'strides.vehicles.v1', generator: 'scripts/unreal/export-vehicules.mjs',
    source: ['src/entities/truckPhysics.js', 'src/entities/vehicle.js', 'src/entities/truck.js', 'src/entities/truckModel.js', 'src/world/props.js', 'src/world/sites.js'],
    specs, geometry, truckHome,
  }],
  [join(ROOT, 'unreal/core/tests/oracles/vehicles.json'), { schema: 'strides.vehicles.oracle.v1', columns: ['n', 'x', 'z', 'heading', 'vx', 'vy', 'r', 'rpm', 'gear', 'steer', 'brake', 'throttle', 'fuelL', 'gearLabel'], runs }],
];
let diff = 0;
for (const [path, obj] of out) {
  const text = JSON.stringify(obj) + '\n';
  const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (old === text) { console.log('inchangé', path); continue; }
  diff++;
  if (CHECK) console.log('DIFFÉRENT', path);
  else { writeFileSync(path, text); console.log('écrit', path); }
}
console.log(`${Object.keys(specs).length} modèles, ${Object.keys(geometry).length} gabarits, ${runs.length} relevés de ${runs[0].rows.length} lignes`);
if (CHECK && diff) process.exit(1);
