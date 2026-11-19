#!/usr/bin/env python3
"""Mutations du portage du cheval de concours (tranche T2) : preuve que les oracles exercent bien chaque branche.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoHorse.cpp (le source du dépôt n'est jamais modifié) ;
le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué sur les oracles exportés du jeu web.
Une mutation doit faire échouer le banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas détectée.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-cso-horse.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
src = open(os.path.join(core, 'Private/CsoHorse.cpp')).read()
M = [
 ('airTurn supprimé', 'const double r = s.yawRate * (s.jumpT >= 0 ? c.airTurn : 1);', 'const double r = s.yawRate;'),
 ('ralentissement 9 -> 6', '(s.speed < 5 ? 4.5 : 3.6) : 9;', '(s.speed < 5 ? 4.5 : 3.6) : 6;'),
 ('freinage v/0,5 -> v/0,4', 'v / 0.5);', 'v / 0.4);'),
 ('freinage 2d -> 3d', '(2 * std::max(dist, 0.02))', '(3 * std::max(dist, 0.02))'),
 ('terme v/0,5 supprimé', 'std::max((v * v) / (2 * std::max(dist, 0.02)), v / 0.5)', '(v * v) / (2 * std::max(dist, 0.02))'),
 ('refus OVERRUN x 0,7 -> x 0,5', 'gap + P.overrun * 0.7', 'gap + P.overrun * 0.5'),
 ('refus toward min 0,3 -> 0,4', 'const double toward = std::max(0.3, -fn * side);', 'const double toward = std::max(0.4, -fn * side);'),
 ('refus distance min 0,35 -> 0,3', 'std::max(0.35, gap + P.overrun', 'std::max(0.3, gap + P.overrun'),
 ('visée marge latérale 0,35 supprimée', 'if (std::abs((first.u + last.u) / 2) > o.w / 2 + 0.35) continue;', 'if (std::abs((first.u + last.u) / 2) > o.w / 2) continue;'),
 ('startJump : condition x >= 0 supprimée', 'if (tgt.geo.rails.front().x >= 0) csoRefuse', 'csoRefuse'),
 ('abord hors angle v²/16 -> v²/12', '(s.speed * s.speed) / 16 + 0.3', '(s.speed * s.speed) / 12 + 0.3'),
 ('perte à la réception sans plafond', 'std::min(c.landingLoss, std::abs', 'std::min(1.0, std::abs'),
 ('startJump : refus engagé ignoré', '  if (s.refusing >= 0) return false;\n  const double L0', '  const double L0'),
 ('startJump : seuil 1,9 -> 2,1', 'tgt.plan.L0 * 1.9', 'tgt.plan.L0 * 2.1'),
]
os.makedirs(out, exist_ok=True)
others = [os.path.join(core, 'Private', f) for f in ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'SaveGame.cpp')]
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
undetected = 0
for name, a, b in M:
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected += 1; continue
    f = os.path.join(out, 'CsoHorse.cpp')
    open(f, 'w').write(src.replace(a, b))
    exe = os.path.join(out, 'mut')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', os.path.join(core, 'Public'), test, f, *others, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        print(f'{name} : compilation échouée\n{c.stderr[:400]}'); undetected += 1; continue
    r = subprocess.run([exe, ora, data], capture_output=True, text=True)
    last = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    fails = [l.strip() for l in r.stdout.splitlines() if l.startswith('ÉCHEC') or l.startswith('ECHEC') or 'ÉCHEC' in l][:2]
    status = 'détectée' if r.returncode else 'NON DÉTECTÉE'
    if not r.returncode: undetected += 1
    print(f'{name} : {status} (code {r.returncode}, {last}){" ; " + " | ".join(fails) if fails else ""}')
print(f'{len(M)} mutations, {undetected} non détectées')
sys.exit(1 if undetected else 0)
