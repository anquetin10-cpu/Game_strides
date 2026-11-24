#!/usr/bin/env python3
"""Mutations de la sellerie du cheval (essai de monte, voie A, étape 5) : preuve que les tests départagent les constantes
et les branches de StridesCore/HorseTack.cpp (port de pjlHorse.js et pjl/view.js) et du composant UStridesHorseTack.

Deux niveaux.
- « cœur » : la mutation est appliquée à une copie de HorseTack.cpp (le source du dépôt n'est pas touché), reliée au banc
  unreal/core/tests/test_horse_tack.cpp (ctest « monte-cheval ») et rejouée sur l'oracle O1 ; elle doit le faire échouer.
- « moteur » (option --moteur) : ce que le banc hors moteur ne voit pas (siège, profils, conversion du composant : il faut
  le cheval Unreal posé). La mutation est appliquée AU SOURCE DU DÉPÔT, Unreal Build Tool recompile, l'éditeur rejoue
  Strides.Parite.HorseSeat, puis le source est rétabli (try/finally), et une dernière compilation remet le module à
  l'identique ; le script vérifie à la fin que les sources mutés n'ont plus aucune différence avec git (HEAD ou index).
  Environ 3 min par mutation (UBT incrémental puis éditeur sans rendu). Une seule instance d'UnrealEditor à la fois.

Une mutation doit être détectée par son niveau ; le script sort en code 1 si l'une ne l'est pas, hors des mutations
listées dans ATTENDUES (raison donnée), si l'une de celles-ci devient détectée, ou si le témoin non muté ne passe pas.
Sans --moteur, les mutations du niveau moteur sont seulement listées (non vérifiées).

Usage (DEVELOPER_DIR réglé sur Xcode ; UE = dossier du moteur pour --moteur, chemin réel par défaut) :
  python3 scripts/unreal/mutations-horse-tack.py [--moteur] [--sortie=dossier]
Défaut de sortie : .ue-cache/travail/mutations-horse-tack (copies, journaux, rapports ; exclu de git). Chemins réels du
moteur et du projet, éditeur avec -trace=none et journal dans un fichier : scripts/unreal/ue_travail.py.
"""
import os
import re
import subprocess
import sys
import time
import json
import ue_travail

repo = ue_travail.REPO
arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}
out = os.path.abspath(arg.get('--sortie', ue_travail.sortie('mutations-horse-tack')))
MOTEUR = bool(arg.get('--moteur'))
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
game = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesGrandTour')
CORE_CPP = os.path.join(core, 'Private/HorseTack.cpp')
COMP_CPP = os.path.join(game, 'Private/StridesHorseTack.cpp')
ora = os.path.join(repo, 'unreal/core/tests/oracles/monte')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
test = os.path.join(repo, 'unreal/core/tests/test_horse_tack.cpp')

# (niveau, fichier, nom, motif, remplacement)
C, E = 'cœur', 'moteur'
M = [
 # Horloge de réception et postérieurs (pjlHorse.js:437-439, :763-769)
 (C, CORE_CPP, 'réception : remise à 0 au poser supprimée', 'if (s.wasJump && !jumping) s.landT = 0;', ''),
 (C, CORE_CPP, 'réception : horloge au double du pas', 's.landT += dt;', 's.landT += 2 * dt;'),
 (C, CORE_CPP, 'réception : état du saut non retenu', 's.wasJump = jumping;\n  s.landT += dt;', 's.landT += dt;'),
 (C, CORE_CPP, 'postérieurs : fenêtre 1,5 s -> 0,5 s', 's.landT < m.hindWithin', 's.landT < m.hindWithin / 3'),
 (C, CORE_CPP, 'postérieurs : seuil 10 cm -> 12 cm', 'toeHeight[k] < m.hindDown', 'toeHeight[k] < m.hindDown + 0.02'),
 (C, CORE_CPP, 'postérieurs : seuil 10 cm -> 8 cm', 'toeHeight[k] < m.hindDown', 'toeHeight[k] < m.hindDown - 0.02'),
 (C, CORE_CPP, 'postérieurs : levés au saut supprimé', 'if (jumping) s.hindDown = false;', 'if (false) s.hindDown = false;'),
 (C, CORE_CPP, 'postérieurs : droit seul', 'for (int k = 0; k < 2; k++)\n      if (toeHeight[k]', 'for (int k = 1; k < 2; k++)\n      if (toeHeight[k]'),
 (C, CORE_CPP, 'postérieurs : gauche seul', 'for (int k = 0; k < 2; k++)\n      if (toeHeight[k]', 'for (int k = 0; k < 1; k++)\n      if (toeHeight[k]'),
 # Calculs de Three.js et groupe intérieur de la vue
 (C, CORE_CPP, 'Euler YXZ : signe du terme y', 'c1 * s2 * c3 - s1 * c2 * s3', 'c1 * s2 * c3 + s1 * c2 * s3'),
 (C, CORE_CPP, 'Euler YXZ : ordre XYZ (terme z)', 'c1 * c2 * s3 - s1 * s2 * c3', 'c1 * c2 * s3 + s1 * s2 * c3'),
 (C, CORE_CPP, 'applyQuaternion : signe', 'const double tx = 2 * (q.y * v.z - q.z * v.y)', 'const double tx = 2 * (q.y * v.z + q.z * v.y)'),
 (C, CORE_CPP, 'vue : lacet du modèle ignoré', 'std::cos(-m.innerYaw), s = std::sin(-m.innerYaw)', 'std::cos(0.0), s = std::sin(0.0)'),
 (C, CORE_CPP, 'vue : sol du modèle ignoré', '-m.innerGroundY * k', '0.0'),
 (C, CORE_CPP, 'ancres : poids ignorés', 'o.x += v.x * f.w, o.y += v.y * f.w, o.z += v.z * f.w;', 'o.x += v.x * 0.25, o.y += v.y * 0.25, o.z += v.z * 0.25;'),
 (C, CORE_CPP, 'moindres carrés : translation oubliée', "out.m[r * 4 + 3] = (r == 0 ? mt.x : r == 1 ? mt.y : mt.z) - (", "out.m[r * 4 + 3] = 0 * (r == 0 ? mt.x : r == 1 ? mt.y : mt.z) - ("),
 (C, CORE_CPP, 'inverse : signe de la translation', 'o.m[r * 4 + 3] = -(', 'o.m[r * 4 + 3] = ('),
 # Siège S (pjlHorse.js:833-859) et profils (:807-825) : cheval Unreal posé
 (E, CORE_CPP, 'siège : recentrage 12 /s -> 6 /s', 'damp(s.seatX, mid, m.recenterDamp, step)', 'damp(s.seatX, mid, 0.5 * m.recenterDamp, step)'),
 (E, CORE_CPP, 'siège : étrier gauche seul', 'const double mid = (a.x + b.x) * 0.5;', 'const double mid = a.x;'),
 (E, CORE_CPP, 'siège : hauteur de l’ancre + 1 cm', 'out.seatPos = {s.seatX, out.anchorH[Seat].y, out.anchorH[Seat].z};', 'out.seatPos = {s.seatX, out.anchorH[Seat].y + 0.01, out.anchorH[Seat].z};'),
 (E, CORE_CPP, 'tangage : repos non retiré', 'damp(s.dPitch, pitch - s.pitch0, m.pitchDamp, step)', 'damp(s.dPitch, pitch, m.pitchDamp, step)'),
 (E, CORE_CPP, 'tangage : lissage 18 /s -> 9 /s', 'damp(s.dPitch, pitch - s.pitch0, m.pitchDamp, step)', 'damp(s.dPitch, pitch - s.pitch0, 0.5 * m.pitchDamp, step)'),
 (E, CORE_CPP, 'tangage : signe', 'out.seatQ = eulerYXZ(-s.dPitch, 0, roll);', 'out.seatQ = eulerYXZ(s.dPitch, 0, roll);'),
 (E, CORE_CPP, 'tangage : bassin et garrot inversés', 'std::atan2(out.spine04.y - out.pelvis.y, out.spine04.z - out.pelvis.z)', 'std::atan2(out.pelvis.y - out.spine04.y, out.pelvis.z - out.spine04.z)'),
 (E, CORE_CPP, 'inclinaison de la vue ignorée', 'out.seatQ = eulerYXZ(-s.dPitch, 0, roll);', 'out.seatQ = eulerYXZ(-s.dPitch, 0, 0);'),
 (E, CORE_CPP, 'repère S : rotation non inversée', 'const Q4 c{-seatQ.x, -seatQ.y, -seatQ.z, seatQ.w};', 'const Q4 c{seatQ.x, seatQ.y, seatQ.z, seatQ.w};'),
 (E, CORE_CPP, 'flanc : arrondi -> troncature', 'jsRound((p.y - m.flankY0) / m.flankStep)', 'std::floor((p.y - m.flankY0) / m.flankStep)'),
 (E, CORE_CPP, 'flanc : côtés inversés', 'if (p.x > 0) out.flankL[i]', 'if (p.x < 0) out.flankL[i]'),
 (E, CORE_CPP, 'flanc : dernier sommet au lieu du plus écarté', 'out.flankL[i] = std::max(out.flankL[i], p.x);', 'out.flankL[i] = p.x;'),
 (E, CORE_CPP, 'flanc : sommets du bord inférieur exclus', 'if (k < 0 || k >= n) continue;', 'if (k < 1 || k >= n) continue;'),
 (E, CORE_CPP, 'encolure : tranche vide à 0 au lieu de −9', 'out.crest.assign(2 + m.crestSlices, -9);', 'out.crest.assign(2 + m.crestSlices, 0);'),
 (E, CORE_CPP, 'encolure : tranche par la hauteur', 'jsRound((p.z - m.crestZ0) / m.crestStep)', 'jsRound((p.y - m.crestZ0) / m.crestStep)'),
 (E, COMP_CPP, 'composant : matrice Unreal transposée', 'for (int C = 0; C < 3; C++) A.m[R * 4 + C] = M.M[C][R];', 'for (int C = 0; C < 3; C++) A.m[R * 4 + C] = M.M[R][C];'),
 (E, COMP_CPP, 'composant : repos de l’os ignoré', 'RestInv.push_back(compose(ToAffine(RestM.Inverse()), Glb2Mesh));', 'RestInv.push_back(Glb2Mesh);'),
 (E, COMP_CPP, 'composant : saut ignoré', 'landStep(State_, bJumping, Dt);', 'landStep(State_, false, Dt);'),
]

ATTENDUES = {
 'postérieurs : gauche seul': 'dans O1, l’os toes_02_l passe sous 10 cm à la même image que l’os droit ou avant lui (poses E3 image 81, E3b image 75) : la branche du postérieur droit n’est pas départagée',
 'Euler YXZ : ordre XYZ (terme z)': 'mutation équivalente : le siège est composé avec un angle y nul (pjlHorse.js:854), et Ry(0)·Rx·Rz = Rx·Ry(0)·Rz',
 'postérieurs : levés au saut supprimé': 'un saut au plus par scénario d’O1 (E3, E3b) : avant l’appel, postérieurs non détectés (landT > 1,5 s) ; il faudrait deux sauts successifs',
 'composant : saut ignoré': 'aucune image de saut posée dans Unreal (clips de saut d’O1 en miroir, absents d’Unreal) ; la logique du saut est prouvée au niveau cœur',
 # Constatées à la campagne moteur complète du 24/11/2026 (reliquats M1) :
 'flanc : sommets du bord inférieur exclus': 'tranche 0 du flanc toujours vide dans le web : hz.fl[2] et hz.fr[2] valent 0 à toutes les images des 8 scénarios d’O1 (relevé sur l’oracle) ; aucun sommet n’y tombe, l’exclure ne change rien',
 'tangage : bassin et garrot inversés': 'inverser le vecteur ajoute ±π à pitch ET à pitch0 (même formule au repos) : pitch − pitch0 ne change que si le signe de la hauteur garrot − bassin change entre le repos et l’image (passage à ±π), ce que les images testées n’exercent pas (déduit, non mesuré) ; faiblesse du test déclarée',
}

os.makedirs(out, exist_ok=True)
t0 = time.time()
srcs = {CORE_CPP: open(CORE_CPP).read(), COMP_CPP: open(COMP_CPP).read()}


# ---------------------------------------------------------------- niveau cœur
inc = os.path.join(core, 'Public')
flags = ['clang++', '-std=c++20', '-O1', '-I', inc]
tobj = os.path.join(out, 'test_horse_tack.o')
c = subprocess.run(flags + ['-c', test, '-o', tobj], capture_output=True, text=True)
if c.returncode:
    print('compilation du banc échouée\n' + c.stderr[:800]); sys.exit(1)


def core_run(text, tag):
    f = os.path.join(out, 'HorseTack.cpp')
    open(f, 'w').write(text)
    obj, exe = os.path.join(out, 'HorseTack.o'), os.path.join(out, 'mut')
    c = subprocess.run(flags + ['-c', f, '-o', obj], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : compilation échouée\n{c.stderr[:400]}'
    c = subprocess.run(['clang++', tobj, obj, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : édition de liens échouée\n{c.stderr[:400]}'
    return subprocess.run([exe, ora, data], capture_output=True, text=True), ''


# ---------------------------------------------------------------- niveau moteur
def ubt():
    return ue_travail.ubt(os.path.join(out, 'ubt-dernier.log'))


def engine_run(tag):
    state, errs, _ = ue_travail.editor_test('Strides.Parite.HorseSeat', out, tag)
    return state, errs


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
        return bool(r.returncode), (fails[0].split(' : ', 1)[-1][:150] if fails else r.stdout.strip().splitlines()[-1] if r.stdout.strip() else '')
    try:
        open(path, 'w').write(src.replace(a, b))
        code, log = ubt()
        if code:
            return None, 'compilation UBT échouée : ' + log[-300:]
        state, errs = engine_run(name)
    finally:
        open(path, 'w').write(src)
    return state != 'Success', (errs[0][:170] if errs else state)


# Témoins
r, err = core_run(srcs[CORE_CPP], 'témoin')
if r is None or r.returncode:
    print(err or ('témoin cœur (source non muté) en échec :\n' + r.stdout[-800:])); sys.exit(1)
print(f'témoin cœur : passe ({r.stdout.strip().splitlines()[-1]})', flush=True)
if MOTEUR:
    code, log = ubt()
    state, errs = engine_run('témoin') if not code else ('UBT en échec', [])
    if state != 'Success':
        print(f'témoin moteur en échec : {state} {errs[:1]}'); sys.exit(1)
    print('témoin moteur : Strides.Parite.HorseSeat passe', flush=True)

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
clean = subprocess.run(['git', '-C', repo, 'diff', '--quiet', '--', CORE_CPP, COMP_CPP]).returncode == 0 or all(open(p).read() == s for p, s in srcs.items())
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and n not in skipped]
done = len(M) - len(skipped)
print(f'{len(M)} mutations ({sum(1 for m in M if m[0] == C)} cœur, {sum(1 for m in M if m[0] == E)} moteur), {done} vérifiées, {done - len(undetected)} détectées, '
      f'{len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
print(f'sources rétablis : {"oui" if clean else "NON"} ; durée : {time.time() - t0:.0f} s')
sys.exit(1 if unexpected or now_detected or not clean else 0)
