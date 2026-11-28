// Jalon J3-C (monde vivant de Deauville) : oracle de l'heure, de la météo, des marées et du soleil, calculé par les
// modules du web eux-mêmes (src/world/weather.js, src/world/sun.js, src/config.js CONFIG.dayLength) importés sous Node.
// Rien n'est modifié dans src/. Sortie déterministe : unreal/core/tests/oracles/meteo.json (ctest « meteo »).
// Usage : node --import ./scripts/unreal/node-web/register.mjs scripts/unreal/export-meteo.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = process.argv.includes('--check');
const web = (p) => import(pathToFileURL(join(ROOT, p)).href);
const W = await web('src/world/weather.js');
const S = await web('src/world/sun.js');
const { CONFIG } = await web('src/config.js');

const weather = [];
for (let day = -1; day <= 10; day++)
  for (let h = 0; h < 24; h += 0.37) {
    const w = W.wind(day, h);
    weather.push({ day, h, cover: W.coverAt(day, h), rain: W.rainTarget(day, h), temp: W.temperature(day, h), kmh: w.kmh, deg: w.deg, dir: w.dir, text: W.conditionText(day, h) });
  }
const tide = [];
for (let t = 0; t < 400; t += 1.7) {
  const s = W.tideState(t);
  tide.push({ t, level: W.tideLevel(t), coef: W.tideCoef(t), wet: s.wet, mark: s.mark, rising: s.rising });
}
const sun = [];
for (let h = 0; h <= 24; h += 0.25) {
  const p = S.sunPosition(h);
  const d = S.sunDirection(h, {});
  sun.push({ h, alt: p.alt, az: p.az, x: d.x, y: d.y, z: d.z });
}
const times = S.sunTimes();
const out = { schema: 'strides.meteo.oracle.v1', dayLength: CONFIG.dayLength, extremes: W.TIDE_EXTREMES, sunTimes: times, weather, tide, sun };
const path = join(ROOT, 'unreal/core/tests/oracles/meteo.json');
const text = JSON.stringify({ ...out, source: 'src/world/weather.js, src/world/sun.js, src/config.js' }) + '\n';
if (CHECK) {
  const same = existsSync(path) && readFileSync(path, 'utf8') === text;
  console.log(same ? 'inchangé' : 'DIFFÉRENT', path);
  process.exit(same ? 0 : 1);
}
writeFileSync(path, text);
console.log('écrit', path, `${weather.length} météo, ${tide.length} marée, ${sun.length} soleil`);
