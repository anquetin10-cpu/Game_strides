// Oracles de scénario du banc de parité CSO : format sur disque, partagé par scripts/unreal/export-cso-runs.mjs.
//
// Un dossier (défaut unreal/core/tests/oracles/cso_runs/) : un fichier par exécution, <id>.<lang>.json, et un index,
// index.json (en-tête descriptif des canaux, puis la liste des exécutions dans l'ordre des scénarios de l'exporteur :
// id, lang, file, frames = nombre d'images). Chaque fichier d'exécution est l'objet { id, lang, desc, setup, frames } :
// en-tête sur la première ligne, puis une image par ligne (diffs lisibles). Écriture déterministe : mêmes entrées, mêmes
// octets ; un fichier dont le contenu ne change pas n'est pas réécrit. Les lecteurs (unreal/core/tests/test_core.cpp,
// tests moteur Strides.Parite.*) lisent l'index puis chaque fichier qu'il nomme.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RUNS_SCHEMA = 'strides.oracle.cso_runs/2';
export const RUNS_LAYOUT =
  'un fichier par exécution dans ce dossier (runs[].file = <id>.<lang>.json) : objet { id, lang, desc, setup, frames }, en-tête sur la première ligne puis une image par ligne ; runs[].frames = nombre d’images ; ordre de la liste = ordre des scénarios de l’exporteur, français puis anglais ; les clés ci-dessous décrivent les champs des images';

export const runFile = (id, lang) => `${id}.${lang}.json`;

// Texte d'une exécution (même découpe que l'ancien fichier unique, une image par ligne).
export function runText(run) {
  const { frames, ...rest } = run;
  const text = JSON.stringify(rest).replace(/}$/, ',"frames":[\n') + frames.map((f) => JSON.stringify(f)).join(',\n') + '\n]}\n';
  JSON.parse(text); // contrôle de forme
  return text;
}

// Texte de l'index : en-tête indenté, puis une ligne par exécution.
export function indexText(head, entries) {
  const text = JSON.stringify(head, null, 1).replace(/\n}$/, ',\n "runs": [\n') + entries.map((e) => JSON.stringify(e)).join(',\n') + '\n]}\n';
  JSON.parse(text);
  return text;
}

export function readIndex(dir) {
  const file = join(dir, 'index.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// Écrit un fichier seulement si son contenu change ; rend true s'il a été écrit.
function writeIfChanged(file, text) {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  writeFileSync(file, text);
  return true;
}

// Écrit les exécutions `runs` ({ id, lang, desc, setup, frames }) et l'index. `order` = liste [id, lang] de tous les
// scénarios de l'exporteur, dans l'ordre ; une exécution absente de `runs` garde l'entrée de l'index existant si son
// fichier existe (export partiel --only), sinon elle n'est pas listée. Rend { written, kept, orphans } : fichiers
// réécrits, fichiers inchangés, fichiers .json du dossier que l'index ne nomme pas (signalés, jamais supprimés).
export function writeRuns(dir, head, runs, order) {
  mkdirSync(dir, { recursive: true });
  const prev = readIndex(dir);
  const prevEntries = prev && prev.schema === RUNS_SCHEMA ? prev.runs : [];
  const written = [];
  const kept = [];
  const fresh = new Map();
  for (const r of runs) {
    const file = runFile(r.id, r.lang);
    (writeIfChanged(join(dir, file), runText(r)) ? written : kept).push(file);
    fresh.set(file, { id: r.id, lang: r.lang, file, frames: r.frames.length });
  }
  const entries = [];
  for (const [id, lang] of order) {
    const file = runFile(id, lang);
    const e = fresh.get(file) ?? prevEntries.find((x) => x.file === file && existsSync(join(dir, file)));
    if (e) entries.push(e);
  }
  (writeIfChanged(join(dir, 'index.json'), indexText(head, entries)) ? written : kept).push('index.json');
  const listed = new Set(['index.json', ...entries.map((e) => e.file)]);
  const orphans = readdirSync(dir).filter((f) => f.endsWith('.json') && !listed.has(f));
  return { written, kept, orphans };
}
