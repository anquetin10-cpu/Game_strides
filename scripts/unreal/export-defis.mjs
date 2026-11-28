// Jalon J4-D : défis à conditions fixes du web (src/gameplay/challenge.js : CHALLENGES, CURRENT_CHALLENGES, makeResult,
// compareResults, recordResult, resultLine). Ce script n'en modifie rien : il importe le vrai module dans Node
// (chargeur scripts/unreal/node-web) et relève :
//  - unreal/StridesGrandTour/Content/Data/challenges.json : versions courantes des défis (conditions, règles) ;
//  - unreal/core/tests/oracles/defis.json : résultats (makeResult), comparaisons, suite de tentatives enregistrées
//    (recordResult : record, précédent, doublon, nombre de tentatives) et textes (resultLine), rejoués par le ctest « defis ».
// Usage : node --import ./scripts/unreal/node-web/register.mjs scripts/unreal/export-defis.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = process.argv.includes('--check');
const web = (p) => import(pathToFileURL(join(ROOT, p)).href);
const git = (...a) => execFileSync('git', a, { cwd: ROOT }).toString().trim();
const C = await web('src/gameplay/challenge.js');
const { CSO_START } = await web('src/gameplay/obstacles.js');

const cfgOut = (c) => ({
  id: c.id, version: c.version, name: c.name, course: c.course, place: c.place, courseId: c.courseId, obstacles: [...c.obstacles],
  height: c.height, timeAllowed: c.timeAllowed, timeLimit: c.timeLimit,
  horse: { id: c.horse.id, name: c.horse.name, coat: c.horse.coat, speed: c.horse.speed, jump: c.horse.jump, stamina: c.horse.stamina },
  weather: { label: c.weather.label, day: c.weather.day, hour: c.weather.hour, rain: c.weather.rain, wet: c.weather.wet },
  jumpAid: c.jumpAid, rules: { ...c.rules }, where: c.where || null,
});
const data = {
  schema: 'strides.challenges.v1',
  current: C.CURRENT_CHALLENGE.id,
  // Défis proposés dans l'app Activités du web (CURRENT_CHALLENGES) ; le portage n'a pas l'arène de Paris (gpparis « À venir ») :
  // le défi de Paris est exporté mais marqué indisponible par le jeu.
  challenges: C.CURRENT_CHALLENGES.map(cfgOut),
  start: { x: CSO_START.x, z: CSO_START.z, rot: CSO_START.rot },
};

// ---- Oracle ----
const cfg = C.CURRENT_CHALLENGE;
const cases = [
  { attempt: 'a1', faults: 0, refusals: 0, rails: 0, t: 61.237 },
  { attempt: 'a2', faults: 4, refusals: 0, rails: 1, t: 58.004 },
  { attempt: 'a3', faults: 0, refusals: 0, rails: 0, t: 64.0 },
  { attempt: 'a4', faults: 0, refusals: 0, rails: 0, t: 64.0000001 },
  { attempt: 'a5', faults: 0, refusals: 0, rails: 0, t: 66.5 },
  { attempt: 'a6', faults: 8, refusals: 1, rails: 1, t: 70.33 },
  { attempt: 'a7', faults: 4, refusals: 1, rails: 0, t: 40, eliminated: '2e refus : éliminé du parcours.' },
  { attempt: 'a8', faults: 0, refusals: 0, rails: 0, t: 60.5 },
  { attempt: 'a8', faults: 0, refusals: 0, rails: 0, t: 59.0 },
  { attempt: 'a9', faults: 0, refusals: 0, rails: 0, t: 60.5 },
];
const store = {};
const seq = cases.map((c) => {
  const res = C.makeResult(cfg, { ...c, at: 0, build: 'oracle' });
  const rec = C.recordResult(store, res);
  const r = store.challenges.records[cfg.id];
  return {
    in: c,
    res: { eliminated: res.eliminated, rails: res.rails, refusals: res.refusals, faults: res.faults, timeFaults: res.timeFaults, penalties: res.penalties, time: res.time },
    line: C.resultLine(res),
    isRecord: rec.isRecord, duplicate: rec.duplicate, previous: rec.previous ? C.resultLine(rec.previous) : null,
    best: r.best ? C.resultLine(r.best) : null, attempts: r.attempts,
  };
});
const cmp = [];
for (let i = 0; i < seq.length; i++) for (let j = 0; j < seq.length; j++) {
  const a = C.makeResult(cfg, { ...cases[i], at: 0 }), b = C.makeResult(cfg, { ...cases[j], at: 0 });
  cmp.push([i, j, Math.sign(C.compareResults(a, b))]);
}
const oracle = { schema: 'strides.defis.oracle.v1', source: { webCommit: git('rev-parse', '--short', 'HEAD'), files: ['src/gameplay/challenge.js'] }, challenge: cfg.id, seq, cmp, timeFaults: [[64, 64], [64.0000001, 64], [64.2, 64], [65, 64], [70.5, 64], [10, 64]].map(([t, a]) => [t, a, C.timeFaults(t, a)]) };

const out = [
  [join(ROOT, 'unreal/StridesGrandTour/Content/Data/challenges.json'), { ...data, source: oracle.source }],
  [join(ROOT, 'unreal/core/tests/oracles/defis.json'), oracle],
];
let diff = 0;
for (const [path, obj] of out) {
  const text = JSON.stringify(obj, null, 1) + '\n';
  const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const strip = (s) => s.replace(/"webCommit": "[^"]*"/, '');
  if (strip(old) === strip(text)) { console.log('inchangé', path); continue; }
  diff++;
  if (CHECK) console.log('DIFFÉRENT', path);
  else { writeFileSync(path, text); console.log('écrit', path); }
}
console.log(`${data.challenges.length} défis (courant ${data.current}), ${seq.length} tentatives, ${cmp.length} comparaisons`);
if (CHECK && diff) process.exit(1);
