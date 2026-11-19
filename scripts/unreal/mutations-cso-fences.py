#!/usr/bin/env python3
"""Mutations du portage des obstacles de concours (tranche T3) : preuve que les oracles exercent bien chaque branche.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoFences.cpp (le source du dépôt n'est jamais modifié) ;
le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué sur les oracles exportés du jeu web.
Une mutation doit faire échouer le banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas détectée,
hors des mutations listées dans ATTENDUES (branche qu'aucun scénario exporté n'exerce, raison donnée) — et aussi si l'une
de celles-ci devient détectée (la liste est alors à corriger).

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-cso-fences.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-fences.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-fences')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
src = open(os.path.join(core, 'Private/CsoFences.cpp')).read()
M = [
 # Jugement au passage (_judge)
 ('faute : seuil −0,06 -> −0,08', 'if (margin < -J.rub) {', 'if (margin < -J.rub - 0.02) {'),
 ('effleurement : seuil 0,04 -> 0,02', '} else if (margin < 0.04 &&', '} else if (margin < 0.02 &&'),
 ('postérieurs : τ > 0,5 -> τ > 2 (jamais différée)', 'if (tau > 0.5) states[oi]', 'if (tau > 2) states[oi]'),
 ('postérieurs : 1,1 m -> 0,8 m', '-margin, 1.1});', '-margin, 0.8});'),
 ('cause short -> far', 'pass.cause = tau < 0 ? "short"', 'pass.cause = tau < 0 ? "far"'),
 ('hauteur interpolée : q ignoré', 'const double tau = t0 >= 0 ? t0 + (t1 - t0) * q : -1;', 'const double tau = t0 >= 0 ? t1 : -1;'),
 ('franchissement annoncé à l\'entrée', 'const double exit = dir > 0 ? o.back : o.front;\n  if (!pass.exitT', 'const double exit = dir > 0 ? o.front : o.back;\n  if (!pass.exitT'),
 ('membres jugés : HIND_TRAIL ignoré', '(ls - exit) * s.pass.dir > F.hindTrail', '(ls - exit) * s.pass.dir > F.hindTrail + 3'),
 ('membres jugés : 1,2 s -> 0,6 s', 'in.time - s.pass.exitT > 1.2', 'in.time - s.pass.exitT > 0.6'),
 ('largeur ± 0,35 -> ± 0', 'const bool inWidth = std::abs(b.u) < o.w / 2 + 0.35;', 'const bool inWidth = std::abs(b.u) < o.w / 2;'),
 ('réception < 0,6 s -> < 0,2 s', 'in.time - s.lastLandTime < 0.6', 'in.time - s.lastLandTime < 0.2'),
 # Refus et comptage (_count, updateHorse)
 ('recomptage 5 s -> 3 s', 'time - s.refusal.t < 5;', 'time - s.refusal.t < 3;'),
 ('recomptage : détour ignoré', '&& !s.refusal.away && time', '&& time'),
 ('détour : profondeur/2 + 6 -> + 2', 'ro.depth / 2 + 6) s.refusal.away = true;', 'ro.depth / 2 + 2) s.refusal.away = true;'),
 ('détour : sens ignoré', '(fx * ro.n.x + fz * ro.n.z) * signd(ls) > 0 ||', 'false ||'),
 ('refus compté : sens inversé', 'e.dir = ls < 0 ? 1 : -1;', 'e.dir = ls < 0 ? -1 : 1;'),
 ('tout contre : −0,24 -> −0,4', 'if (gap < -P.overrun * 0.4 && s.refusing == oi', 'if (gap < -P.overrun * 0.67 && s.refusing == oi'),
 ('tout contre : remise 3 s -> 2 s', 'states[i].rebuild = in.time + 3;', 'states[i].rebuild = in.time + 2;'),
 ('garde-fou du nez : 0,3 -> 0,1 par image', 'std::min(-P.overrun - gap, 0.3) * side', 'std::min(-P.overrun - gap, 0.1) * side'),
 ('glissade : profondeur/2 + 0,1 -> + 0,2', 'const double depth = o.depth / 2 + 0.1;', 'const double depth = o.depth / 2 + 0.2;'),
 ('refus lent : nez 1,5 m -> 1,2 m', '(s.speed < P.minJumpSpeed && gap < 1.5)) csoRefuse', '(s.speed < P.minJumpSpeed && gap < 1.2)) csoRefuse'),
 ('refus oblique v²/16 -> v²/12', 'else if (gap < (s.speed * s.speed) / 16 + 0.3) csoRefuse', 'else if (gap < (s.speed * s.speed) / 12 + 0.3) csoRefuse'),
 # Chute des barres (update)
 ('remise : 5 m -> 3 m', 'std::hypot(o.x - in.focusX, o.z - in.focusZ) > 5)', 'std::hypot(o.x - in.focusX, o.z - in.focusZ) > 3)'),
 ('pesanteur 9,81 -> 9,8', 'const double G = 9.81, R = 0.05;', 'const double G = 9.8, R = 0.05;'),
 ('rebond 0,28 -> 0,3', 'e.vy = -e.vy * 0.28;', 'e.vy = -e.vy * 0.3;'),
 ('rebond si |vy| > 0,6 -> 0,4', 'if (std::abs(e.vy) > 0.6) {', 'if (std::abs(e.vy) > 0.4) {'),
 ('glisse e^(−2,6 dt) -> e^(−2 dt)', 'f.vz *= std::exp(-2.6 * dt);', 'f.vz *= std::exp(-2.0 * dt);'),
 ('retard du 2e bout 0,2 -> 0,25', 'const double lag = 0.2 - 0.3 *', 'const double lag = 0.25 - 0.3 *'),
 ('élan 0,7 + 2,2 hit -> 0,8 + 2,2 hit', 'f.dir * (0.7 + 2.2 *', 'f.dir * (0.8 + 2.2 *'),
 ('bout touché : ordre inversé', 'if ((f.side ? f.side : 1) > 0) std::swap', 'if ((f.side ? f.side : 1) < 0) std::swap'),
 ('roulement / R -> / 0,06', 'f.roll += (f.vz * dt) / R;', 'f.roll += (f.vz * dt) / 0.06;'),
 ('fin de chute t > 0,5 -> t > 3', 'if (resting && f.t > 0.5) f.done = true;', 'if (resting && f.t > 3) f.done = true;'),
 ('vibration : 2,5 /s -> 2 /s', 'r.rattle - dt * 2.5', 'r.rattle - dt * 2'),
 ('vibration : rotation 0,05 -> 0,04', 'std::sin(r.rattle * 40) * 0.05 * r.rattle', 'std::sin(r.rattle * 40) * 0.04 * r.rattle'),
 ('vibration : levée 0,012 -> 0,01', '* 0.012 * r.rattle', '* 0.01 * r.rattle'),
 ('profondeur bornée à 0,5 -> 0,3', 'clampd(hit, 0.02, 0.5)', 'clampd(hit, 0.02, 0.3)'),
 ('mur : barre à h − 0,05 -> h', 'railAt(o.h - 0.05, 0)', 'railAt(o.h, 0)'),
]
# Branches portées qu'aucun scénario de cso_runs/ ne discrimine (écrit dans l'inventaire, champ « ecart »).
ATTENDUES = {
 'membres jugés : 1,2 s -> 0,6 s': 'les postérieurs passent toujours 2,2 m après la sortie avant 0,6 s',
 'recomptage : détour ignoré': 'aucun nouveau refus moins de 5 s après un détour (cabré 1,1 s, demi-tour à 0,8 rad/s)',
 'rebond si |vy| > 0,6 -> 0,4': 'aucun impact entre 0,4 et 0,6 m/s pour des barres de 1,05 à 1,2 m',
}
os.makedirs(out, exist_ok=True)
others = [os.path.join(core, 'Private', f) for f in ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoRun.cpp', 'CsoCamera.cpp', 'Text.cpp', 'SaveGame.cpp')]
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
undetected = []
for name, a, b in M:
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected.append(name); continue
    f = os.path.join(out, 'CsoFences.cpp')
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
    print(f'{name} : {status} (code {r.returncode}, {last}){" ; " + fails[0][:160] if fails else ""}')
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected]
print(f'{len(M)} mutations, {len(M) - len(undetected)} détectées, {len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
sys.exit(1 if unexpected or now_detected else 0)
