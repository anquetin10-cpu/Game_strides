#!/usr/bin/env python3
"""Mutations du portage du déroulé d'épreuve et des textes (tranche T4) : preuve que les oracles exercent chaque règle.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoRun.cpp ou Text.cpp (le source du dépôt n'est jamais
modifié) ; le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué sur les oracles exportés du
jeu web (cso_runs.json, cso_text.json). Une mutation doit faire échouer le banc (code de sortie non nul) ; le script sort
en code 1 si l'une n'est pas détectée, hors des mutations listées dans ATTENDUES (raison donnée) — et aussi si l'une de
celles-ci devient détectée.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-cso-run.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-run.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-run')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
R, T = 'CsoRun.cpp', 'Text.cpp'
M = [
 # Lignes, cloche, départ lancé, chrono
 (R, 'ligne : marge 0,3 -> 0', 'return s0 < 0 && s1 >= 0 && u < L.w / 2 + 0.3;', 'return s0 < 0 && s1 >= 0 && u < L.w / 2;'),
 (R, 'ligne de départ : cap 60° -> 90°', 'std::cos(*heading) * nz < 0.5) return false;', 'std::cos(*heading) * nz < 0) return false;'),
 (R, 'arrivée : ligne jamais franchie', 'lineCrossed(cfg_.finish, hasP0, x0, z0, f.x, f.z, nullptr)', 'false'),
 (R, 'départ lancé supprimé', 'if (sP >= 0 && sP < 12 &&', 'if (false && sP < 12 &&'),
 (R, 'cloche : 45 s -> 45,5 s', '} else if (st_.bell <= 0) {', '} else if (st_.bell <= -0.5) {'),
 (R, 'chrono : image du départ comptée', '} else if (!st_.finished) st_.t += f.dt;', '}\n  if (st_.started && !st_.finished) st_.t += f.dt;'),
 (R, 'entrée en piste 2,4 s -> 2,3 s', 'return stepT_ > 2.4;', 'return stepT_ > 2.3;'),
 (R, 'dossard 40 + … -> 41 + …', 'bib_ = cfg_.bib >= 0 ? cfg_.bib : 40 +', 'bib_ = cfg_.bib >= 0 ? cfg_.bib : 41 +'),
 (R, 'pas de mission non cumulé', '  stepT_ += f.dt;\n', '\n'),
 # Éliminations
 (R, 'descente comptée après le départ seulement', 'if (!f.riding) return out(', 'if (!f.riding && st_.started) return out('),
 (R, 'deuxième refus : >= -> >', 'if (st_.refusals >= cfg_.maxRefusals) return out(', 'if (st_.refusals > cfg_.maxRefusals) return out('),
 (R, 'temps limite 2 TA -> 2 TA + 1', 'if (st_.t > cfg_.timeAllowed * 2) return out(', 'if (st_.t > cfg_.timeAllowed * 2 + 1) return out('),
 (R, 'élimination : cloche simple', 'audio("bell", {N(2)});', 'audio("bell", {});'),
 # Événements d'obstacle
 (R, 'obstacle sauté avant le départ compté', 'if (st_.finished || st_.eliminated || notStarted()) return;', 'if (st_.finished || st_.eliminated) return;'),
 (R, 'erreur de parcours non dédoublonnée', 'if (st_.wrong.count(num)) return;', ''),
 (R, 'erreur de parcours : obstacle sauté nommé', 'const std::string want = labelOf(st_.next);', 'const std::string want = labelOf(num);'),
 (R, 'refus : reprise du double au A supprimée', "if (!label.empty() && label.back() == 'B') {", 'if (false) {'),
 (R, 'refus : cadence non remise à 0', 'if (cad.has) cad.v = 0;', ''),
 (R, 'refus : astuce aussi au refus éliminatoire', 'if (st_.refusals < cfg_.maxRefusals && st_.fenceRefusals < 3)', 'if (st_.refusals <= cfg_.maxRefusals && st_.fenceRefusals < 3)'),
 (R, 'refus : astuce 3,5 s -> 3 s', 'hud("hint", {S(msg), N(3500)});', 'hud("hint", {S(msg), N(3000)});'),
 (R, 'barre : +4 -> +3', 'st_.faults += cfg_.rail;', 'st_.faults += 3;'),
 # Arrivée et sortie de piste
 (R, 'sortie de piste 2,6 s -> 2 s', 'return st_.exitT > 2.6 || !f.riding;', 'return st_.exitT > 2.0 || !f.riding;'),
 (R, 'sortie : cadence 1,9 -> 2', 'std::max(std::min(cad.v, 1.9), cad.v - 1.6 * f.dt)', 'std::max(std::min(cad.v, 2.0), cad.v - 1.6 * f.dt)'),
 (R, 'sortie : 1,6 m/s² -> 1,5', 'std::max(std::min(cad.v, 1.9), cad.v - 1.6 * f.dt)', 'std::max(std::min(cad.v, 1.9), cad.v - 1.5 * f.dt)'),
 (R, 'applaudissements du sans-faute 1,3 -> 1,2', 'audio("applause", {N(pts == 0 ? 1.3 : 0.55)', 'audio("applause", {N(pts == 0 ? 1.2 : 0.55)'),
 (R, 'pénalités de temps en direct supprimées', 'return st_.faults + (int)std::ceil(over - 1e-9);', 'return st_.faults;'),
 # Tableau et objectif
 (R, 'tableau : décompte arrondi par défaut', 'jsInt((long long)std::max(0.0, std::ceil(b.bell)))', 'jsInt((long long)std::max(0.0, std::floor(b.bell)))'),
 (R, 'tableau : « Arrivée » au lieu du libellé', 'b.next = st_.next <= n ? labelOf(st_.next)', 'b.next = st_.next < n ? labelOf(st_.next)'),
 (R, 'objectif : « · double » oublié', "const bool dbl = !lab.empty() && lab.back() == 'A';", 'const bool dbl = false;'),
 # Formats (Text.cpp)
 (T, 'toFixed : égalité vers le bas', "if (fp.size() > (size_t)k && fp[(size_t)k] >= '5') {", "if (fp.size() > (size_t)k && fp[(size_t)k] > '5') {"),
 (T, 'dec : point en français', "    if (p != std::string::npos) s[p] = ',';", ''),
 (T, 'ordinal : « 1er »', 'std::string("1re")', 'std::string("1er")'),
 (T, 'enOrdinal : 11e en « st »', "const char* suf = a >= 0 && a < 4 ? S[a] : v >= 0 && v < 4 ? S[v] : S[0];", "const char* suf = v % 10 < 4 ? S[v % 10] : S[0];"),
]
# Règles portées que les scénarios ne discriminent pas (raison donnée ; écrit dans l'inventaire, champ « ecart »).
ATTENDUES = {}
os.makedirs(out, exist_ok=True)
srcs = {f: open(os.path.join(core, 'Private', f)).read() for f in (R, T)}
allc = ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'Text.cpp', 'SaveGame.cpp')
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
undetected = []
for file, name, a, b in M:
    src = srcs[file]
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected.append(name); continue
    f = os.path.join(out, file)
    open(f, 'w').write(src.replace(a, b))
    others = [os.path.join(core, 'Private', x) for x in allc if x != file]
    exe = os.path.join(out, 'mut')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', os.path.join(core, 'Public'), test, f, *others, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        print(f'{name} : compilation échouée\n{c.stderr[:400]}'); undetected.append(name); continue
    r = subprocess.run([exe, ora, data], capture_output=True, text=True)
    last = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    fails = [l.strip() for l in r.stdout.splitlines() if 'ÉCHEC' in l][:1]
    status = 'détectée' if r.returncode else 'NON DÉTECTÉE'
    if not r.returncode: undetected.append(name)
    print(f'{name} : {status} (code {r.returncode}, {last}){" ; " + fails[0][:160] if fails else ""}', flush=True)
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected]
print(f'{len(M)} mutations, {len(M) - len(undetected)} détectées, {len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
sys.exit(1 if unexpected or now_detected else 0)
