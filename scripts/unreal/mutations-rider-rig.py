#!/usr/bin/env python3
"""Mutations de la cavalière montée par les règles (essai de monte, voie A, étape 6) : preuve que les tests départagent
StridesCore/RiderPose.cpp (chaîne cheval → entrées → règle, retard d'une image) et le composant UStridesRiderRig
(reciblage, deux os par membre, repère du siège).

Deux niveaux, comme scripts/unreal/mutations-horse-tack.py.
- « cœur » : mutation appliquée à une copie de RiderPose.cpp (source du dépôt intact), reliée à
  unreal/core/tests/test_rider_pose.cpp (ctest « monte-cavaliere ») ; elle doit le faire échouer.
- « moteur » (option --moteur) : mutation appliquée AU SOURCE DU DÉPÔT, Unreal Build Tool recompile, l'éditeur rejoue
  Strides.Parite.RiderRules, puis le source est rétabli (try/finally) et une dernière compilation remet le module à
  l'identique ; le script vérifie à la fin que les sources mutés n'ont plus aucune différence avec git.
  Environ 3 min par mutation. Une seule instance d'UnrealEditor à la fois.

Après la migration du 23/11/2026 (projet et moteur sur le disque externe, chemins habituels par liens symboliques) :
UBT est appelé avec -NoUBA (l'exécuteur UBA refuse d'écrire par le chemin du lien symbolique) et l'éditeur par le
chemin réel du moteur (UE_REAL ; par le lien, l'éditeur calcule un chemin relatif du projet faux et ne démarre pas).

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-rider-rig.py [--moteur] [--sortie=dossier]
Défaut de sortie : build/mutations-rider-rig. Code 1 si une mutation n'est pas détectée (hors ATTENDUES), si le témoin ne
passe pas, ou si un source n'est pas rétabli.
"""
import json
import os
import re
import subprocess
import sys
import time

repo = os.path.realpath(os.path.join(os.path.dirname(__file__), '../..'))
arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}
out = os.path.abspath(arg.get('--sortie', os.path.join(repo, 'build/mutations-rider-rig')))
MOTEUR = bool(arg.get('--moteur'))
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
game = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesGrandTour')
POSE_CPP = os.path.join(core, 'Private/RiderPose.cpp')
RIG_CPP = os.path.join(game, 'Private/StridesRiderRig.cpp')
RIG_H = os.path.join(game, 'Public/StridesRiderRig.h')
ora = os.path.join(repo, 'unreal/core/tests/oracles/monte')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
test = os.path.join(repo, 'unreal/core/tests/test_rider_pose.cpp')
uproject = os.path.join(repo, 'unreal/StridesGrandTour/StridesGrandTour.uproject')
UE_REAL = os.path.realpath(os.environ.get('UE', '/Users/Shared/Epic Games/UE_5.8'))

C, E = 'cœur', 'moteur'
M = [
 # Chaîne cheval → entrées → règle (human.js animateRiding : le cavalier lit le cheval de l'image précédente)
 (C, POSE_CPP, 'retard d’une image supprimé (état du cheval)', 'const RideHorseSample& h = hasPrev_ ? prev_ : hNow;', 'const RideHorseSample& h = hNow;'),
 (C, POSE_CPP, 'retard d’une image supprimé (profils du cheval)', 'const RideFitMeters& f = hasPrev_ ? prevFit_ : fitNow;', 'const RideFitMeters& f = fitNow;'),
 (C, POSE_CPP, 'première image non jouée par la règle', '  filt_.seed(first);\n  rules_.step(first);', '  filt_.seed(first);'),
 (C, POSE_CPP, 'kneeOut mis à l’échelle (direction)', '!std::strcmp(key, "kneeOut") || ', ''),
 (C, POSE_CPP, 'rotations monde : ordre du produit inversé', 'qmul(out.world[p], r.boneQuat(b))', 'qmul(r.boneQuat(b), out.world[p])'),
 # Composant Unreal : repère du siège, reciblage, deux os par membre
 (E, RIG_H, 'signe de Y (repère du siège)', 'FVector(100.0 * P.z, -100.0 * P.x, 100.0 * P.y)', 'FVector(100.0 * P.z, 100.0 * P.x, 100.0 * P.y)'),
 (E, RIG_CPP, 'pôle en direction (et non en position)', 'const FVector Pole = ModelToMesh(P.joints[L.joint]);', 'const FVector Pole = PA + ModelToMesh(P.joints[L.joint]);'),
 (E, RIG_CPP, 'étirement activé', 'bEnableStretch, StretchStartRatio, StretchMaximumRatio);', 'true, StretchStartRatio, StretchMaximumRatio);'),
 (E, POSE_CPP, 'retard d’une image supprimé (dans le moteur)', 'const RideHorseSample& h = hasPrev_ ? prev_ : hNow;', 'const RideHorseSample& h = hNow;'),
 (E, RIG_CPP, 'conjugaison des rotations sans le signe de la symétrie', 'Mul(Axes, FVector(Q.x, Q.y, Q.z)) * Det;', 'Mul(Axes, FVector(Q.x, Q.y, Q.z));'),
 (E, RIG_CPP, 'bassin non posé', '		if (I == Pelvis) T = PelvisPos;\n', ''),
 (E, RIG_CPP, 'calage des membres supprimé', 'SetWorld(T, FQuat::FindBetweenNormals(DT, DO) * Cal[T].GetRotation());', 'SetWorld(T, Cal[T].GetRotation());'),
]
# Mutations dont la non-détection est attendue (raison).
ATTENDUES = {}

os.makedirs(out, exist_ok=True)
t0 = time.time()
srcs = {p: open(p).read() for p in {m[1] for m in M}}
flags = ['clang++', '-std=c++20', '-O1', '-I', os.path.join(core, 'Public')]


def core_run(text, tag):
    f = os.path.join(out, 'RiderPose-' + re.sub(r'[^a-z0-9]+', '-', tag.lower())[:40] + '.cpp')
    open(f, 'w').write(text)
    exe = f[:-4]
    c = subprocess.run(flags + [test, os.path.join(core, 'Private/RiderRules.cpp'), f, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        return None, 'compilation échouée : ' + c.stderr[-300:]
    return subprocess.run([exe, ora, data], capture_output=True, text=True), ''


def ubt():
    env = dict(os.environ, DEVELOPER_DIR=os.environ.get('DEVELOPER_DIR', '/Applications/Xcode.app/Contents/Developer'))
    c = subprocess.run([f'{UE_REAL}/Engine/Build/BatchFiles/Mac/Build.sh', 'StridesGrandTourEditor', 'Mac', 'Development', f'-project={uproject}',
                        '-WaitMutex', '-NoUBA'], capture_output=True, text=True, env=env)
    return c.returncode, c.stdout[-1500:]


def engine_run(tag):
    slug = re.sub(r'[^a-z0-9]+', '-', tag.lower())[:40]
    rep = os.path.join(out, 'auto-' + slug)
    # Journal dans un fichier, pas dans un tube : le démon UnrealTraceServer lancé par l'éditeur hérite de la sortie et la
    # garderait ouverte (constaté le 23/11/2026 : éditeur zombie, script bloqué) ; -trace=none évite ce démon.
    log = open(os.path.join(out, 'editeur-' + slug + '.log'), 'w')
    c = subprocess.run([f'{UE_REAL}/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor', uproject,
                        '-ExecCmds=Automation RunTests Strides.Parite.RiderRules; Quit', '-unattended', '-nullrhi', '-nosplash', '-log', '-stdout',
                        f'-StridesShotsDir={os.path.join(out, "shots")}', f'-StridesMonteDir={os.path.join(out, "monte-" + slug)}',
                        f'-ReportExportPath={rep}', '-trace=none'], stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
    log.close()
    try:
        d = json.load(open(os.path.join(rep, 'index.json'), encoding='utf-8-sig'))
        t = d['tests'][0]
        errs = [e['event']['message'] for e in t['entries'] if e['event']['type'] == 'Error']
        return t['state'], errs
    except Exception as ex:  # pas de rapport : éditeur en échec
        return f'sans rapport ({ex}; code {c.returncode})', []


def run_level(level, path, a, b, name):
    src = srcs[path]
    n = src.count(a)
    if n != 1:
        return None, f'motif trouvé {n} fois, mutation non appliquée'
    if level == C:
        r, err = core_run(src.replace(a, b), name)
        if r is None:
            return None, err
        fails = [l.strip() for l in r.stdout.splitlines() if 'ÉCHEC' in l][:1]
        return bool(r.returncode), (fails[0].split(' : ', 1)[-1][:150] if fails else '')
    try:
        open(path, 'w').write(src.replace(a, b))
        code, log = ubt()
        if code:
            return None, 'compilation UBT échouée : ' + log[-300:]
        state, errs = engine_run(name)
    finally:
        open(path, 'w').write(src)
    return state != 'Success', (errs[0][:170] if errs else state)


r, err = core_run(srcs[POSE_CPP], 'témoin')
if r is None or r.returncode:
    print(err or ('témoin cœur (source non muté) en échec :\n' + r.stdout[-800:])); sys.exit(1)
print(f'témoin cœur : passe ({r.stdout.strip().splitlines()[-1]})', flush=True)
if MOTEUR:
    code, log = ubt()
    state, errs = engine_run('témoin') if not code else ('UBT en échec', [])
    if state != 'Success':
        print(f'témoin moteur en échec : {state} {errs[:1]}'); sys.exit(1)
    print('témoin moteur : Strides.Parite.RiderRules passe', flush=True)

undetected, skipped = [], []
try:
    for level, path, name, a, b in M:
        if level == E and not MOTEUR:
            skipped.append(name)
            print(f'[{level}] {name} : non vérifiée (option --moteur)')
            continue
        det, info = run_level(level, path, a, b, name)
        if det is None:
            print(f'[{level}] {name} : {info}'); undetected.append(name); continue
        if not det: undetected.append(name)
        print(f'[{level}] {name} : {"détectée" if det else "NON DÉTECTÉE"}{" ; " + info if info else ""}', flush=True)
finally:
    for p, s in srcs.items():
        open(p, 'w').write(s)
    if MOTEUR:
        code, _ = ubt()
        print(f'recompilation finale du source non muté : code {code}')
clean = subprocess.run(['git', '-C', repo, 'diff', '--quiet', '--'] + list(srcs)).returncode == 0 or all(open(p).read() == s for p, s in srcs.items())
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and n not in skipped]
done = len(M) - len(skipped)
print(f'{len(M)} mutations ({sum(1 for m in M if m[0] == C)} cœur, {sum(1 for m in M if m[0] == E)} moteur), {done} vérifiées, {done - len(undetected)} détectées, '
      f'{len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
print(f'sources rétablis : {"oui" if clean else "NON"} ; durée : {time.time() - t0:.0f} s')
sys.exit(1 if unexpected or now_detected or not clean else 0)
