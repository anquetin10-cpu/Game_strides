// Jalon J3 (correction après contrôle adverse) : véhicules garés du jeu web (world.js parkedVehicles : tracteur et voiture
// de l'Écurie du Val, 12 places de TOWN_PARKING en ville), avec gabarit (props.js CARS, vehicle.js TRACTOR), teinte
// (CAR_COLORS, même tirage que world.js) et collision (vehicle.js : addBox(x, z, W/2 + 0.12, L/2 + 0.1, cap)).
// Les tableaux TOWN_PARKING et TRACTOR ne sont pas exportés par leurs modules : relevés dans le texte source (littéraux
// évalués tels quels, Math.PI compris). Rien n'est modifié dans src/.
// Sortie : unreal/StridesGrandTour/Content/Data/world_parked.json (--check : compare sans écrire, code 1 si différent).
// Usage : node --import ./scripts/unreal/node-web/register.mjs scripts/unreal/export-voitures-garees.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = process.argv.includes('--check');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const { CARS, CAR_COLORS, CAR_MODELS } = await import(pathToFileURL(join(ROOT, 'src/world/props.js')).href);

const literal = (text, re, what) => {
  const m = text.match(re);
  if (!m) throw new Error(`${what} introuvable`);
  return Function('Math', `return (${m[1]});`)(Math);
};
const world = src('src/world/world.js');
const TOWN_PARKING = literal(world, /const TOWN_PARKING = (\[[\s\S]*?\]);/, 'TOWN_PARKING');
const VAL = literal(world, /this\.parkedVehicles\.push\(\s*(\{[\s\S]*?\}),\s*(?:\{[\s\S]*?\}),?\s*\);/, 'véhicule 1 du Val');
const VAL2 = literal(world, /this\.parkedVehicles\.push\(\s*\{[\s\S]*?\},\s*(\{[\s\S]*?\}),?\s*\);/, 'véhicule 2 du Val');
const TRACTOR = literal(src('src/entities/vehicle.js'), /const TRACTOR = (\{[^}]*\});/, 'TRACTOR');

const r3 = (v) => Math.round(v * 1000) / 1000;
const list = [VAL, VAL2];
TOWN_PARKING.forEach(([x, z, r], i) => {
  const kind = CAR_MODELS[i % CAR_MODELS.length];
  list.push({ kind, color: CAR_COLORS[kind][(i * 3 + 1) % CAR_COLORS[kind].length], x, z, heading: r });
});
const vehicles = list.map((v) => {
  const S = v.kind === 'tractor' ? TRACTOR : CARS[v.kind] || CARS.clio;
  return { kind: v.kind, color: v.color, x: r3(v.x), z: r3(v.z), heading: r3(v.heading), L: r3(S.L), W: r3(S.W), wb: r3(S.wb), r: r3(S.r), hw: r3(S.W / 2 + 0.12), hd: r3(S.L / 2 + 0.1) };
});
const out = { schema: 'strides.parked.v1', generator: 'scripts/unreal/export-voitures-garees.mjs', source: ['src/world/world.js', 'src/world/props.js', 'src/entities/vehicle.js'], vehicles };
const path = join(ROOT, 'unreal/StridesGrandTour/Content/Data/world_parked.json');
const text = JSON.stringify(out, null, 1) + '\n';
const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
if (old === text) console.log('inchangé', path);
else if (CHECK) { console.log('DIFFÉRENT', path); process.exit(1); }
else { writeFileSync(path, text); console.log('écrit', path); }
console.log(`${vehicles.length} véhicules garés`);
