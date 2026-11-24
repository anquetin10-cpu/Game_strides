#!/usr/bin/env python3
"""Mutations du mode de mesure du coût (essai de monte, voie A, étape 7) : preuve que les contrôles départagent
StridesCore/PerfStats.cpp (médiane, 95e centile, dispersion) et le recalcul de scripts/unreal/perf-summary.py.

- « cœur » : mutation appliquée à une copie de PerfStats.cpp (source du dépôt intact), compilée avec
  unreal/core/tests/test_perf_stats.cpp (ctest « perf ») ; le test doit échouer.
- « résumé » : mutation appliquée à une copie de perf-summary.py, lancée sur un perf-unreal.json écrit par le jeu
  (--json=<fichier>, par défaut le premier de unreal/docs/parite/monte/perf/) ; le recalcul indépendant doit signaler
  l'écart (code 1).
Le témoin (copies non mutées) doit passer. Le module Unreal n'est pas recompilé : Strides.Shots.PerfStats appelle le même
strides::perf::summarize, prouvé ici.

Usage : python3 scripts/unreal/mutations-perf.py [--json=<perf-unreal.json>] [--sortie=<dossier>]
Défaut de sortie : .ue-cache/travail/mutations-perf. Code 1 si une mutation n'est pas détectée ou si un témoin échoue.
"""
import glob
import os
import re
import subprocess
import sys

repo = os.path.realpath(os.path.join(os.path.dirname(__file__), '../..'))
arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}
out = os.path.abspath(arg.get('--sortie', os.path.join(repo, '.ue-cache/travail/mutations-perf')))
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
SRC = os.path.join(core, 'Private/PerfStats.cpp')
TEST = os.path.join(repo, 'unreal/core/tests/test_perf_stats.cpp')
SUMMARY = os.path.join(repo, 'scripts/unreal/perf-summary.py')
perf_files = sorted(f for f in glob.glob(os.path.join(repo, 'unreal/docs/parite/monte/perf/*.json')) if not f.endswith('resume.json'))
JSON = arg.get('--json', perf_files[0] if perf_files else '')

C, S = 'cœur', 'résumé'
M = [
 (C, 'médiane prise au 49e centile', 's.median = percentile(v, 0.5);', 's.median = percentile(v, 0.49);'),
 (C, '95e centile pris au 90e', 's.p95 = percentile(v, 0.95);', 's.p95 = percentile(v, 0.90);'),
 (C, 'rang n · p au lieu de (n − 1) · p', 'const double h = (double)(v.size() - 1) * p;', 'const double h = (double)(v.size()) * p;'),
 (C, 'rang arrondi (sans interpolation)', 'return v[lo] + (h - (double)lo) * (v[hi] - v[lo]);', 'return v[(std::size_t)std::lround(h) < v.size() ? (std::size_t)std::lround(h) : v.size() - 1];'),
 (C, 'valeurs non triées', '  std::sort(v.begin(), v.end());\n', ''),
 (C, 'p non borné', '  p = std::clamp(p, 0.0, 1.0);\n', ''),
 (C, 'dispersion rapportée à la plus grande médiane', 'return (*hi - *lo) / *lo;', 'return (*hi - *lo) / *hi;'),
 (C, 'moyenne sur n − 1', 's.mean = sum / (double)v.size();', 's.mean = sum / (double)(v.size() - 1);'),
 (C, 'médiane nulle non signalée', '  if (*lo <= 0) return -1;\n', ''),
 (S, 'recalcul : centile « exclusive »', "method='inclusive')\n    return", "method='exclusive')\n    return"),
 (S, 'recalcul : 95e centile pris au 94e', 'return statistics.median(values), cuts[94]', 'return statistics.median(values), cuts[93]'),
 (S, 'recalcul : médiane prise au 50e point de coupe', 'return statistics.median(values), cuts[94]', 'return cuts[50], cuts[94]'),
]

os.makedirs(out, exist_ok=True)
src = open(SRC).read()
summary = open(SUMMARY).read()
flags = ['clang++', '-std=c++20', '-O1', '-I', os.path.join(core, 'Public')]


def core_run(text, tag):
    f = os.path.join(out, 'PerfStats-' + tag + '.cpp')
    open(f, 'w').write(text)
    exe = f[:-4]
    c = subprocess.run(flags + [TEST, f, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        return None, 'compilation échouée : ' + c.stderr[-200:]
    r = subprocess.run([exe], capture_output=True, text=True)
    return r.returncode, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''


def summary_run(text, tag, json_file):
    f = os.path.join(out, 'perf-summary-' + tag + '.py')
    # Copie hors de scripts/unreal : repo calculé depuis le fichier ; on le fixe au vrai dépôt.
    open(f, 'w').write(text.replace("repo = os.path.realpath(os.path.join(os.path.dirname(__file__), '../..'))", f'repo = {repo!r}'))
    r = subprocess.run([sys.executable, f, json_file], capture_output=True, text=True)
    return r.returncode, (r.stdout.strip().splitlines() or [''])[0][:120]


fails = 0
code, msg = core_run(src, 'temoin')
print(f'témoin cœur : code {code} ({msg})')
fails += code != 0
if JSON:
    code, msg = summary_run(summary, 'temoin', JSON)
    print(f'témoin résumé ({os.path.relpath(JSON, repo)}) : code {code}')
    fails += code != 0
else:
    print('aucun perf-unreal.json : mutations du résumé non passées')
for i, (lvl, name, a, b) in enumerate(M):
    tag = f'{i:02d}-' + re.sub(r'[^a-z0-9]+', '-', name.lower())[:30]
    base = src if lvl == C else summary
    if base.count(a) != 1:
        print(f'[{lvl}] {name} : motif trouvé {base.count(a)} fois : ÉCHEC du script')
        fails += 1
        continue
    if lvl == S and not JSON:
        continue
    code, msg = core_run(base.replace(a, b), tag) if lvl == C else summary_run(base.replace(a, b), tag, JSON)
    detected = code != 0
    print(f'[{lvl}] {name} : {"détectée" if detected else "NON DÉTECTÉE"} (code {code} ; {msg})')
    fails += not detected
assert open(SRC).read() == src and open(SUMMARY).read() == summary, 'source du dépôt modifié'
print(f'{len(M)} mutations, {fails} échec(s)')
sys.exit(1 if fails else 0)
