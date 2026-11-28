// Essai de monte, voie A, étape 6 : niveau A (plan-essai.md §5), la cavalière Unreal posée par la règle contre l'oracle O2
// rider_f, grandeur par grandeur, avec le code de métriques du web (rider-rules-metrics.mjs frameMetrics et jumpPhases) :
// les grandeurs ne peuvent donc pas diverger entre O2 et Unreal.
//
// Entrée : l'export du test moteur Strides.Parite.RiderRules (dossier unreal-rider_f : index.json et un fichier par
// scénario ; articulations relues sur le maillage Unreal dans S, canal cl comme O2 ; entrées scalaires de la chaîne
// Unreal, canal in ; état de la règle, canal dg). Le reste du contexte d'une image (repères du cheval hz, réglages
// in.fit × setup.fitScale, cibles tg) vient d'O1 et d'O2, comme pour les synthèses d'o2.md (rider-rules-o2.mjs asRun).
//
// Usage : node scripts/unreal/rider-rules-niveau-a.mjs --unreal=<dossier unreal-rider_f> [--out=unreal/docs/parite/monte/niveau-a]
//   écrit <out>.json et <out>.md ; code 1 si une tolérance du niveau A n'est pas tenue sur l'écart à O2.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameMetrics, jumpPhases } from './rider-rules-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORA = join(ROOT, 'unreal/core/tests/oracles/monte');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const UE = arg('unreal', '');
const OUT = arg('out', join(ROOT, 'unreal/docs/parite/monte/niveau-a'));
if (!UE || !existsSync(join(UE, 'index.json'))) throw new Error(`export Unreal absent : --unreal=${UE}`);
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Réglages vus par la règle sur un rig à une autre échelle (rider-rules-o2.mjs rigFit) : × k sauf les directions.
function rigFit(fit, k) {
  if (!fit || k === 1) return fit;
  const o = {};
  for (const [key, v] of Object.entries(fit)) {
    if (key === 'kneeOut' || key === 'mountKneeOut') o[key] = v;
    else if (Array.isArray(v)) o[key] = v.map((x) => x * k);
    else o[key] = typeof v === 'number' ? v * k : v;
  }
  return o;
}

// Tolérances du niveau A (plan-essai.md §5), sur l'écart Unreal − O2 à chaque image (|Δ|). Clés de frameMetrics ;
// L/R : deux côtés. Les seuils absolus du niveau A (M7 ≥ −1 cm, M9 ≥ 9 cm, M10 ≤ 0,97) sont rapportés à part, pour
// Unreal ET pour O2 : ce sont des propriétés de la règle, que le portage ne peut que reproduire.
const TOL = [
  ['M1', 'plante – point d’étrier, y et z', ['M1y', 'M1z'], 0.01, 'm'],
  ['M2', 'écart latéral du pied', ['M2'], 0.01, 'm'],
  ['M6', 'portée de la jambe ρ', ['M6'], 0.005, ''],
  ['M7', 'écarts au flanc (genou, tibia 35 et 65 %, cuisse 50 et 75 %)', ['M7genou', 'M7tibia35', 'M7tibia65', 'M7cuisse50', 'M7cuisse75'], 0.01, 'm'],
  ['M9', 'poignet au-dessus de l’encolure', ['M9'], 0.01, 'm'],
  ['M10', 'bras : allonge', ['M10'], 1e-4, ''],
  ['M10', 'bras : coude', ['coude'], 2, '°'],
  ['M11', 'genou, hanche, cheville', ['genou', 'hanche', 'cheville'], 2, '°'],
  ['M12', 'ouverture du genou', ['ouvGenou'], 3, '°'],
  ['M13', 'buste', ['buste*'], 1, '°'],
  ['M14', 'assise', ['assise*'], 0.005, 'm'],
  ['M15', 'talon bas, pointe ouverte', ['talon', 'pointe'], 2, '°'],
  ['M16', 'continuité : rotation des segments par image (Unreal ≤ O2 + 2°)', ['rotSeg*'], 2, '°'],
  ['M16', 'continuité : à-coup (Unreal ≤ O2 + 2°)', ['acoupSeg*'], 2, '°'],
];
const ONE_SIDED = new Set(['rotSeg', 'acoupSeg']);  // M16 : seul un excès d'Unreal compte

const index = load(join(UE, 'index.json'));
const rows = [], phases = [], absolutes = [];
let ok = true;
for (const e of index.runs) {
  const o1 = load(join(ORA, 'o1', e.id + '.json'));
  const o2 = load(join(ORA, 'o2/rider_f', e.id + '.json'));
  const ue = load(join(UE, e.file));
  const k = o2.setup.fitScale;
  if (ue.frames.length !== o1.frames.length) throw new Error(`${e.id} : ${ue.frames.length} images Unreal, ${o1.frames.length} O1`);
  const setup = { ...o1.setup, scale: o2.setup.scale, rig: o2.setup.rig, rest: o2.setup.rest, real: null };
  const base = (f, i) => ({ ...f, cq: o2.frames[i].cq, tg: o2.frames[i].tg, rz: null, pe: null });
  const runO2 = { id: e.id, setup, frames: o1.frames.map((f, i) => ({ ...base(f, i), cl: o2.frames[i].cl, dg: o2.frames[i].dg, in: { ...f.in, fit: rigFit(f.in.fit, k) } })) };
  const runUE = {
    id: e.id, setup,
    frames: o1.frames.map((f, i) => ({ ...base(f, i), cl: ue.frames[i].cl, dg: { ...o2.frames[i].dg, ...ue.frames[i].dg }, in: { ...f.in, ...ue.frames[i].in, fit: rigFit(f.in.fit, k) } })),
  };
  const worst = {};
  const absU = { M7: Infinity, M9: Infinity, M10: -Infinity }, absO = { M7: Infinity, M9: Infinity, M10: -Infinity };
  for (let i = 0; i < o1.frames.length; i++) {
    const a = frameMetrics(runUE, i), b = frameMetrics(runO2, i);
    for (const [, , keys] of TOL)
      for (const key of keys) {
        const names = key.endsWith('*') ? [key.slice(0, -1)] : [key + 'L', key + 'R'];
        for (const n of names) {
          if (typeof a[n] !== 'number' || typeof b[n] !== 'number') continue;
          const d = ONE_SIDED.has(n) ? a[n] - b[n] : Math.abs(a[n] - b[n]);
          if (!worst[n] || d > worst[n].v) worst[n] = { v: d, f: o1.frames[i].f };
        }
      }
    for (const SD of ['L', 'R']) {
      for (const [m, r] of [[a, absU], [b, absO]]) {
        if (typeof m['M7min' + SD] === 'number') r.M7 = Math.min(r.M7, m['M7min' + SD]);
        if (typeof m['M9' + SD] === 'number') r.M9 = Math.min(r.M9, m['M9' + SD]);
        if (typeof m['M10' + SD] === 'number') r.M10 = Math.max(r.M10, m['M10' + SD]);
      }
    }
  }
  const row = { id: e.id, images: o1.frames.length, checks: [] };
  for (const [id, label, keys, tol, unit] of TOL) {
    let v = -Infinity, at = null, n = null;
    for (const key of keys) {
      const names = key.endsWith('*') ? [key.slice(0, -1)] : [key + 'L', key + 'R'];
      for (const nm of names) if (worst[nm] && worst[nm].v > v) (v = worst[nm].v), (at = worst[nm].f), (n = nm);
    }
    if (v === -Infinity) continue;
    const pass = v <= tol;
    ok &&= pass;
    row.checks.push({ id, label, max: v, at, key: n, tol, unit, pass });
  }
  rows.push(row);
  absolutes.push({ id: e.id, unreal: absU, o2: absO });
  // M17 : phases du saut, Unreal contre O2 (± 1 image).
  const pu = jumpPhases(runUE), po = jumpPhases(runO2);
  if (pu && po) {
    const keys = ['appel', 'sommet', 'poserAnterieurs', 'poserPosterieursRegle', 'jumpK50Montee', 'jumpKMax', 'jumpK50Descente', 'jumpK10Descente'];
    const d = keys.map((key) => ({ phase: key, ue: pu[key], o2: po[key], diff: pu[key] === null || po[key] === null ? (pu[key] === po[key] ? 0 : Infinity) : Math.abs(pu[key] - po[key]) }));
    const pass = d.every((x) => x.diff <= 1);
    ok &&= pass;
    phases.push({ id: e.id, phases: d, pass });
  }
}

const f = (v, unit) => {
  if (!Number.isFinite(v)) return '—';
  const x = unit === 'm' ? v * 100 : v;
  const s = Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential(1) : x.toFixed(unit === '' ? 5 : 3);
  return s.replace('.', ',').replace('e-', ' × 10^−');
};
const u = (unit) => (unit === 'm' ? ' cm' : unit === '°' ? '°' : '');
const L = [];
L.push('# Niveau A : la cavalière Unreal posée par la règle, contre O2 rider_f (essai de monte, voie A, étape 6)');
L.push('');
L.push('Page générée par `node scripts/unreal/rider-rules-niveau-a.mjs` (ne pas modifier à la main), à partir de l’export du test');
L.push('moteur `Strides.Parite.RiderRules` (articulations relues sur le maillage `rider_f_animated` posé dans Unreal). Grandeurs');
L.push('calculées par `rider-rules-metrics.mjs`, le même code que pour O1 et O2. Écart maximal |Unreal − O2| sur TOUTES les');
L.push('images de chaque scénario (M16 : excès d’Unreal sur O2). Tolérances : `plan-essai.md` §5, niveau A.');
L.push('');
L.push('| Scénario | Images | Grandeur | Écart max | Image | Tolérance | Tenu |');
L.push('|---|---|---|---|---|---|---|');
for (const r of rows)
  for (const c of r.checks) L.push(`| ${r.id} | ${r.images} | ${c.id} ${c.label} | ${f(c.max, c.unit)}${u(c.unit)} | ${c.at} | ${f(c.tol, c.unit)}${u(c.unit)} | ${c.pass ? 'oui' : '**non**'} |`);
L.push('');
L.push('## M17 : phases du saut (images), Unreal contre O2');
L.push('');
L.push('| Scénario | Phase | Unreal | O2 | Écart | Tenu (± 1) |');
L.push('|---|---|---|---|---|---|');
for (const p of phases) for (const x of p.phases) L.push(`| ${p.id} | ${x.phase} | ${x.ue ?? '—'} | ${x.o2 ?? '—'} | ${Number.isFinite(x.diff) ? x.diff : '—'} | ${x.diff <= 1 ? 'oui' : '**non**'} |`);
L.push('');
L.push('## Seuils absolus du niveau A : propriétés de la règle, mesurées sur Unreal et sur O2');
L.push('');
L.push('Le plan demande aussi, au niveau A, M7 ≥ −1,0 cm, M9 ≥ 9,0 cm et M10 ≤ 0,97. Ces seuils portent sur la règle web');
L.push('elle-même : O2 (anim.js inchangé, mêmes proportions) ne les tient pas toujours (transitions, réceptions). Le portage les');
L.push('reproduit à l’identique ; ils sont donc rapportés ici, pas comptés comme écart du portage.');
L.push('');
L.push('| Scénario | M7 min Unreal | M7 min O2 | M9 min Unreal | M9 min O2 | M10 max Unreal | M10 max O2 |');
L.push('|---|---|---|---|---|---|---|');
for (const a of absolutes)
  L.push(`| ${a.id} | ${f(a.unreal.M7, 'm')} cm | ${f(a.o2.M7, 'm')} cm | ${f(a.unreal.M9, 'm')} cm | ${f(a.o2.M9, 'm')} cm | ${f(a.unreal.M10, '')} | ${f(a.o2.M10, '')} |`);
L.push('');
L.push(`Verdict : ${ok ? 'toutes les tolérances du niveau A sur l’écart à O2 sont tenues.' : '**au moins une tolérance du niveau A n’est pas tenue.**'}`);
L.push('');
const json = { schema: 'strides.monte.niveau_a/1', generator: 'scripts/unreal/rider-rules-niveau-a.mjs', source: 'Strides.Parite.RiderRules', ok, scenarios: rows, phases, absolutes };
writeFileSync(OUT + '.json', JSON.stringify(json, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 1) + '\n');
writeFileSync(OUT + '.md', L.join('\n'));
console.log(`écrits : ${relative(ROOT, OUT)}.json, ${relative(ROOT, OUT)}.md (${rows.length} scénarios) ; niveau A ${ok ? 'tenu' : 'NON TENU'}`);
process.exit(ok ? 0 : 1);
