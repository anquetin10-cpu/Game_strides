#!/usr/bin/env python3
"""Mutations du portage de la caméra de concours (tranche T6) : preuve que le canal « cc » des oracles exerce chaque règle.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoCamera.cpp (le source du dépôt n'est jamais modifié) ;
le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué sur les oracles exportés du jeu web
(cso_runs/ : canal « cc », setup.cc0, mesures du cadrage fr ; Content/Data/cso_camera.json). Une mutation doit faire
échouer le banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas détectée, hors des mutations
listées dans ATTENDUES (raison donnée) — et aussi si l'une de celles-ci devient détectée.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-cso-camera.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-camera.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-camera')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
src = open(os.path.join(core, 'Private/CsoCamera.cpp')).read()
M = [
 # Lacet
 ('anticipation du lacet ignorée', 'const double want = h.heading + yawRate * C.lead;', 'const double want = h.heading;'),
 ('lacet suivi aussi en vol', 'const double yawRate = h.jumpT >= 0 ? 0 : h.yawRate;', 'const double yawRate = h.yawRate;'),
 ('accélération angulaire non bornée', 's.w += clampd(wWant - s.w, -C.yawAcc * dt, C.yawAcc * dt);', 's.w = wWant;'),
 ('vitesse de lacet du cheval non ajoutée', 'const double wWant = d * C.yawK + (instant ? 0 : yawRate);', 'const double wWant = d * C.yawK;'),
 ('entrée : cap vers le cheval -> cap du cheval', 's.cH = instant ? want : ch;', 's.cH = want;'),
 # Ancrage
 ('suivi horizontal instantané', 'const double kp = instant ? 1 : 1 - std::exp(-C.posK * dt);', 'const double kp = 1;'),
 ('part du saut suivie 0,12 -> 0,3', 'std::max(0.0, h.jumpY) * C.jumpFollow', 'std::max(0.0, h.jumpY) * 0.3'),
 ('suivi vertical 3 /s -> 6 /s', '(instant ? 1 : 1 - std::exp(-C.yK * dt))', '(instant ? 1 : 1 - std::exp(-6 * dt))'),
 # Perche
 ('perche : premier point à 1,4 m', 'for (double q = 1.0; q <= C.back + 1e-6; q += 0.4, k++) {', 'for (double q = 1.4; q <= C.back + 1e-6; q += 0.4, k++) {'),
 ('perche : hauteur 2,2 -> 2,0', 'const double y = s.ay + 2.2 + (C.up - 2.2) * (q / C.back);', 'const double y = s.ay + 2.0 + (C.up - 2.0) * (q / C.back);'),
 ('perche : marge 0,45 -> 0,3', 'back = std::max(C.minBack, q - 0.45);', 'back = std::max(C.minBack, q - 0.3);'),
 ('perche : recul minimal ignoré', 'back = std::max(C.minBack, q - 0.45);', 'back = q - 0.45;'),
 ('recul : rapprochement 10 /s -> 2,5 /s', 'back < s.back ? 10 : 2.5', 'back < s.back ? 2.5 : 2.5'),
 ('recul : éloignement 2,5 /s -> 10 /s', 'back < s.back ? 10 : 2.5', 'back < s.back ? 10 : 10'),
 # Hauteur
 ('obstacle survolé ignoré', 'cy = std::max(cy, o.ground + o.h + 0.75 + C.fenceClear);', '(void)0;'),
 ('sol sous la caméra ignoré', 'cy = std::max(cy, std::max(h.groundY, gc) + 0.8);', 'cy = std::max(cy, h.groundY + 0.8);'),
 # Point visé
 ('attirance vers l’obstacle suivant supprimée', '      lx += (in.nextX - lx) * kb;\n      lz += (in.nextZ - lz) * kb;\n', ''),
 ('attirance : cône cos 0,5 -> 0,9', '(dx * fx + dz * fz) / dd > 0.5', '(dx * fx + dz * fz) / dd > 0.9'),
 ('attirance : atténuation dès 60 % -> 80 %', 'smoothstep(C.fenceRange * 0.6, C.fenceRange, dd)', 'smoothstep(C.fenceRange * 0.8, C.fenceRange, dd)'),
 ('point visé non lissé', 'const double ka = 1 - std::exp(-4 * dt);', 'const double ka = 1;'),
 # Fondu d'entrée et FOV
 ('fondu d’entrée supprimé', 'const double e = smoothstep(0, C.enter, s.t);', 'const double e = 1;'),
 ('point visé d’entrée à 1,6 -> 1,1 m', 's.fromLook = CsoVec3{h.x, h.groundY + 1.6, h.z};', 's.fromLook = CsoVec3{h.x, h.groundY + 1.1, h.z};'),
 ('FOV : amorti 3 /s -> 5 /s', 's.fov = instant ? C.fov : damp(s.fov, C.fov, 3, dt);', 's.fov = instant ? C.fov : damp(s.fov, C.fov, 5, dt);'),
 ('FOV : appliqué à chaque image (sans palier de 0,05°)', 'if (std::abs(s.camFov - s.fov) > 0.05) s.camFov = s.fov;', 's.camFov = s.fov;'),
]
# Mutations qu'aucun oracle ne peut départager (raison donnée) : listées pour mémoire, pas comme des succès.
ATTENDUES = {
}
os.makedirs(out, exist_ok=True)
others = [os.path.join(core, 'Private', f) for f in ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'CsoHud.cpp', 'CsoInput.cpp', 'Text.cpp', 'SaveGame.cpp')]
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
undetected = []
for name, a, b in M:
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected.append(name); continue
    f = os.path.join(out, 'CsoCamera.cpp')
    open(f, 'w').write(src.replace(a, b))
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
