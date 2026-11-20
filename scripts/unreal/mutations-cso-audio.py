#!/usr/bin/env python3
"""Mutations du portage des sons de l'épreuve (tranche T12) : preuve que les oracles départagent la logique.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoAudio.cpp (écouteurs de game.js qui jouent les sons du
cheval, clé des WAV, fichier appelant, AudioParam du Web Audio, bus du public, niveau du public) — le source du dépôt
n'est jamais modifié ; le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué (STRIDES_TESTS)
sur les oracles exportés du jeu web (cso_runs/ : canal « audio » ; cso_crowd.json : gain du bus du public rendu hors
ligne ; cso_sounds.json : clés des WAV rendus, constantes et niveau relevés dans le jeu). Une mutation doit faire échouer
le banc ; le script sort en code 1 si l'une n'est pas détectée, hors des mutations listées dans ATTENDUES (raison
donnée) — et aussi si l'une de celles-ci devient détectée.

Usage (DEVELOPER_DIR réglé sur Xcode ; ~1 min 30 par mutation du journal, quelques secondes pour le bus du public) :
  python3 scripts/unreal/mutations-cso-audio.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-audio.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-audio')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
A = 'CsoAudio.cpp'
J = 'fences,csoruns,sounds'  # journal des sons (rejeux du cheval, des obstacles et du déroulé, puis comparaison)
C = 'crowd'                  # bus du public
M = [
 # Écouteurs de game.js:716-728
 (A, 'réception : 1 et 0,5 inversés', 'num(playerHorse ? 1 : 0.5)', 'num(playerHorse ? 0.5 : 1)', J),
 (A, 'réception : toujours 1', 'num(playerHorse ? 1 : 0.5)', 'num(1)', J),
 (A, 'appel : souffle pour tout cheval', '      if (!playerHorse) return;\n', '', J),
 (A, 'appel : sabot hors commandes de concours', 'if (csoControls) out.push_back(CsoCall{"hoof"', 'out.push_back(CsoCall{"hoof"', J),
 (A, 'appel : sabot jamais joué', 'if (csoControls) out.push_back(CsoCall{"hoof"', 'if (false) out.push_back(CsoCall{"hoof"', J),
 (A, 'appel : intensité du sabot 1,4 -> 1', 'num(1.4)', 'num(1)', J),
 (A, 'appel : sol ignoré (« grass »)', 'str(surface), num(1.4)', 'str("grass"), num(1.4)', J),
 (A, 'appel : sabot avant le souffle', '      out.push_back(call0("snort"));\n      if (csoControls) out.push_back(CsoCall{"hoof", {str(surface), num(1.4)}});', '      if (csoControls) out.push_back(CsoCall{"hoof", {str(surface), num(1.4)}});\n      out.push_back(call0("snort"));', J),
 (A, 'cabré : pas de hennissement', '      out.push_back(call0("neigh"));\n      return;\n    default:', '      return;\n    default:', J),
 (A, 'trop tôt : hennissement', '    default:\n      return;  // horse:jumpEarly', '    default:\n      if (e == CsoHorseEvent::JumpEarly) out.push_back(call0("neigh"));\n      return;  // horse:jumpEarly', J),
 # Clé des WAV et fichier appelant
 (A, 'clé : « . » gardé', "if (ch == '.') ch = 'p';", "if (ch == '.') ch = '.';", J),
 (A, 'clé : séparateur « - »', 'k += "_" + (a.isNum', 'k += "-" + (a.isNum', J),
 (A, 'clé : nombres en %g', '(a.isNum ? jsNumber(a.n) : a.s)', '(a.isNum ? std::to_string(a.n) : a.s)', J),
 (A, 'fichier : notify venu de courses.js', 'c.fn == "notify" ? "gameplay/missions.js"', 'c.fn == "notify" ? "gameplay/courses.js"', J),
 # AudioParam (spécification Web Audio)
 (A, 'AudioParam : événement inséré avant ceux du même instant', 'std::upper_bound(pending_.begin(), pending_.end(), e.t, [](double t, const Ev& x) { return t < x.t; });', 'std::lower_bound(pending_.begin(), pending_.end(), e.t, [](const Ev& x, double t) { return x.t < t; });', C),
 (A, 'AudioParam : annulation au-delà de t seulement', 'return x.t >= t; }), pending_.end());', 'return x.t > t; }), pending_.end());', C),
 (A, 'AudioParam : setTargetAtTime part de la cible précédente', 'v0_ = e.k == Kind::Set ? e.v : v;', 'v0_ = e.k == Kind::Set ? e.v : (hasCur_ ? cur_.v : v);', C),
 (A, 'AudioParam : décroissance en exp(−Δt·τ)', 'std::exp(-(t - cur_.t) / cur_.tau)', 'std::exp(-(t - cur_.t) * cur_.tau)', C),
 # Bus du public (audio.js:95, 366-372, 391) et niveau (game.js:1553)
 (A, 'ambience : τ 0,8 au lieu de 0,5', 'g_.setTargetAtTime(crowd * P_.scale, now, P_.tau);', 'g_.setTargetAtTime(crowd * P_.scale, now, P_.cheerTau);', C),
 (A, 'ambience : gain sans l’échelle 0,08', 'g_.setTargetAtTime(crowd * P_.scale, now, P_.tau);', 'g_.setTargetAtTime(crowd, now, P_.tau);', C),
 (A, 'cheer : sans annulation des événements', '  g_.cancelScheduledValues(now);\n  g_.setValueAtTime(P_.cheerPeak, now);', '  g_.setValueAtTime(P_.cheerPeak, now);', C),
 (A, 'cheer : montée progressive au lieu de la valeur', 'g_.setValueAtTime(P_.cheerPeak, now);', 'g_.setTargetAtTime(P_.cheerPeak, now, 0.05);', C),
 (A, 'cheer : maintien de 0,8 s', 'now + P_.cheerHold, P_.cheerTau', 'now + P_.cheerHold * 0.5, P_.cheerTau', C),
 (A, 'applause : sans cheer', 'if (c.fn == "cheer" || c.fn == "applause") cheer(now);', 'if (c.fn == "cheer") cheer(now);', C),
 (A, 'niveau : épreuve CSO ignorée', '< P.radius || courseCso ? P.level : 0', '< P.radius ? P.level : 0', C),
 (A, 'niveau : rayon 89 m', '< P.radius || courseCso', '< P.radius - 1 || courseCso', C),
 (A, 'niveau : bord compris (≤ 90 m)', '< P.radius || courseCso', '<= P.radius || courseCso', C),
]
ATTENDUES = {
 'réception : toujours 1': 'aucun cheval du décor ne se reçoit d’un saut dans les exécutions (aucun landing(0.5) dans l’oracle)',
 'appel : souffle pour tout cheval': 'seul le cheval du joueur saute dans les exécutions (événements des chevaux du décor : foulées et fatigue)',
 'appel : sabot hors commandes de concours': 'aucun saut hors des commandes de concours dans les exécutions (épreuve du Pôle seulement)',
 'AudioParam : annulation au-delà de t seulement': 'seul événement posé à l’instant exact d’un cheer() avant lui : le setValueAtTime(0,28, t) d’un premier cheer de la même image (applause puis cheer, courses.js:342-343), identique au second : doublon sans effet',
 'niveau : bord compris (≤ 90 m)': 'aucun relevé à exactement 90 m (89,5 et 90,5 m relevés dans le jeu)',
}
os.makedirs(out, exist_ok=True)
srcs = {A: open(os.path.join(core, 'Private', A)).read()}
allc = ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'CsoHud.cpp', 'CsoCamera.cpp', 'CsoInput.cpp', 'CourseAids.cpp', 'Text.cpp', 'SaveGame.cpp', 'CoursePlan.cpp', 'CsoEntry.cpp', 'Ranking.cpp', 'CsoAudio.cpp')
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
inc = os.path.join(core, 'Public')
objs = {}
for x in allc + ('test_core.cpp',):
    src = test if x == 'test_core.cpp' else os.path.join(core, 'Private', x)
    o = os.path.join(out, x + '.o')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, '-c', src, '-o', o], capture_output=True, text=True)
    if c.returncode: sys.exit(f'{x} : compilation échouée\n{c.stderr[:600]}')
    objs[x] = o
exe = os.path.join(out, 'mut')
c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, *objs.values(), '-o', exe], capture_output=True, text=True)
if c.returncode: sys.exit(f'édition des liens du témoin échouée\n{c.stderr[:600]}')
for sel in (J, C):
    r = subprocess.run([exe, ora, data], capture_output=True, text=True, env={**os.environ, 'STRIDES_TESTS': sel})
    if r.returncode: sys.exit(f'témoin ({sel}) en échec sans mutation : {r.stdout.strip().splitlines()[-1:]}')
print('témoin : banc vert sans mutation', flush=True)
undetected = []
for file, name, a, b, sel in M:
    src = srcs[file]
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected.append(name); continue
    f = os.path.join(out, 'mut_' + file)
    open(f, 'w').write(src.replace(a, b))
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, f, *[o for k, o in objs.items() if k != file], '-o', exe], capture_output=True, text=True)
    if c.returncode:
        print(f'{name} : compilation échouée\n{c.stderr[:400]}'); undetected.append(name); continue
    r = subprocess.run([exe, ora, data], capture_output=True, text=True, env={**os.environ, 'STRIDES_TESTS': sel})
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
