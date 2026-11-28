#!/usr/bin/env python3
"""Mutations du portage du cheval de concours (tranche T2) : preuve que les oracles exercent bien chaque branche.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoHorse.cpp (le source du dépôt n'est jamais modifié) ;
le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué sur les oracles exportés du jeu web.
Une mutation doit faire échouer le banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas détectée,
hors des mutations listées dans ATTENDUES (branche qu'aucun scénario exporté n'exerce, raison donnée) — et aussi si l'une
de celles-ci devient détectée (la liste est alors à corriger).
Code 2 si une mutation n'a pas pu être jouée (motif absent ou en double, compilation échouée), même listée dans ATTENDUES.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-cso-horse.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et .ue-cache/travail/mutations.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, '.ue-cache/travail/mutations')
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
 # Contrôle des remarques (hygiène, 20/11/2026) : branches que le contrôle adverse de T2 avait vues passer (38 mutations,
 # 15 non détectées), refaites ici ; celles qu'aucun scénario ne discrimine sont listées dans ATTENDUES avec la raison.
 ('cadence de départ : arrondi par défaut', 's.cadence = jsRound(clampd(s.speed, 0, R.maxSpeed) * 10) / 10;', 's.cadence = std::floor(clampd(s.speed, 0, R.maxSpeed) * 10) / 10;'),
 ('cadence de départ : std::round au lieu de jsRound', 's.cadence = jsRound(clampd(s.speed, 0, R.maxSpeed) * 10) / 10;', 's.cadence = std::round(clampd(s.speed, 0, R.maxSpeed) * 10) / 10;'),
 ('cabré affiché : phase sur 1,0 s au lieu de 1,1', 's.rearAnim = std::max(0.0, std::sin(std::min(1.0, s.rearT / 1.1) * kPi));', 's.rearAnim = std::max(0.0, std::sin(std::min(1.0, s.rearT / 1.0) * kPi));'),
 ('eau : seuil 0,15 -> 0,3', 'if (depth > 0.15) desired', 'if (depth > 0.3) desired'),
 ('pente : seuil 0,25 -> 0,35', 'if (in.slope > 0.25) desired *= clampd(1 - (in.slope - 0.25) * 1.2, 0.35, 1);', 'if (in.slope > 0.35) desired *= clampd(1 - (in.slope - 0.35) * 1.2, 0.35, 1);'),
 ('hors épreuve : lacet de concours gardé', '    s.yawRate = 0;\n  }\n  s.lastTurn', '  }\n  s.lastTurn'),
 ('hors épreuve : perte à la réception 0,94 -> 0,9', 's.speed *= 0.94 - std::min(0.08, dev * 0.5);', 's.speed *= 0.9 - std::min(0.08, dev * 0.5);'),
 ('hors épreuve : freinage devant un obstacle du monde 1,45 -> 1', 'csoBrake(s, block - 1.45);', 'csoBrake(s, block - 1);'),
 ('abord : rayon 12 m -> 8 m', 'if (o.off || std::abs(o.x - px) > 12 || std::abs(o.z - pz) > 12) continue;', 'if (o.off || std::abs(o.x - px) > 8 || std::abs(o.z - pz) > 8) continue;'),
 ('abord : en l\'air sans jt0', 'const bool airborne = s.jumpT >= 0 || s.jt0 >= 0;', 'const bool airborne = s.jumpT >= 0;'),
 ('abord : fenêtre de réception 0,6 s -> 0,2 s', 's.lastLanded && time - s.lastLandTime < 0.6', 's.lastLanded && time - s.lastLandTime < 0.2'),
 ('abord : largeur ± 0,35 -> ± 0', 'const bool inWidth = std::abs(bu) < o.w / 2 + 0.35;', 'const bool inWidth = std::abs(bu) < o.w / 2;'),
 ('abord : part vers l\'obstacle 0,3 -> 0,5', 'if (toward > 0.3 && s.speed > 0.5) {', 'if (toward > 0.5 && s.speed > 0.5) {'),
 ('abord : vitesse 0,5 -> 1 m/s', 'if (toward > 0.3 && s.speed > 0.5) {', 'if (toward > 0.3 && s.speed > 1) {'),
 ('abord : marge < −late supprimée', 'plan.zone == Zone::Refuse || (plan.margin < -J.late && plan.ideal <= plan.L) || (s.speed', 'plan.zone == Zone::Refuse || (s.speed'),
 ('abord : ideal ≤ L ignoré', '(plan.margin < -J.late && plan.ideal <= plan.L)', '(plan.margin < -J.late)'),
 ('abord : refus lent 1,5 m -> 1,2 m', '(s.speed < P.minJumpSpeed && gap < 1.5)) return (int)i;', '(s.speed < P.minJumpSpeed && gap < 1.2)) return (int)i;'),
 ('abord : refus lent 3,2 m/s ignoré', '(s.speed < P.minJumpSpeed && gap < 1.5)) return (int)i;', '(gap < 1.5)) return (int)i;'),
]
# Branches portées qu'aucun scénario de cso_runs/ ne discrimine (raison ; déclaré dans l'inventaire, champ « ecart »).
ATTENDUES = {
 'cadence de départ : std::round au lieu de jsRound': 'équivalente : vitesse bornée à [0, maxSpeed], les deux arrondis coïncident pour x ≥ 0',
 'eau : seuil 0,15 -> 0,3': 'aucun scénario dans l’eau (carrière du Pôle sèche ; profondeur relevée nulle)',
 'pente : seuil 0,25 -> 0,35': 'aucun scénario sur une pente de plus de 0,25 (carrière plate ; t6-relief sous ce seuil)',
 'hors épreuve : lacet de concours gardé': 'branche hors commandes de concours : aucun scénario exporté hors épreuve',
 'hors épreuve : perte à la réception 0,94 -> 0,9': 'branche hors commandes de concours : aucun scénario exporté hors épreuve',
 'hors épreuve : freinage devant un obstacle du monde 1,45 -> 1': 'saut bloqué par le décor (_jumpBlocked) jamais relevé : hors épreuve seulement',
 'abord : rayon 12 m -> 8 m': 'équivalente sur le parcours du Pôle : aucune décision de refus à plus de ~5 m du centre d’un obstacle (largeur 3,8 m)',
 'abord : en l\'air sans jt0': 'aucun obstacle abordé à l’image même de la réception',
 'abord : fenêtre de réception 0,6 s -> 0,2 s': 'aucun scénario ne retombe dans l’obstacle visé (appel bien trop loin)',
 'abord : marge < −late supprimée': 'aucun abord où la marge passe sous −late avec ideal ≤ L avant que la zone ne devienne « refuse » ou que le refus lent ne s’applique',
}
os.makedirs(out, exist_ok=True)
others = [os.path.join(core, 'Private', f) for f in ('JumpModel.cpp', 'LimbContact.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'CsoHud.cpp', 'CsoCamera.cpp', 'CsoInput.cpp', 'CourseAids.cpp', 'Text.cpp', 'SaveGame.cpp', 'CoursePlan.cpp', 'CsoEntry.cpp', 'Ranking.cpp', 'CsoAudio.cpp', 'HorseCoat.cpp')]
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
# broken : mutations non jouées (motif absent ou en double, compilation échouée) : jamais comptées non détectées.
undetected, broken = [], []
for name, a, b in M:
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); broken.append(name); continue
    f = os.path.join(out, 'CsoHorse.cpp')
    open(f, 'w').write(src.replace(a, b))
    exe = os.path.join(out, 'mut')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', os.path.join(core, 'Public'), test, f, *others, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        print(f'{name} : compilation échouée\n{c.stderr[:400]}'); broken.append(name); continue
    r = subprocess.run([exe, ora, data], capture_output=True, text=True)
    last = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    fails = [l.strip() for l in r.stdout.splitlines() if l.startswith('ÉCHEC') or l.startswith('ECHEC') or 'ÉCHEC' in l][:2]
    status = 'détectée' if r.returncode else 'NON DÉTECTÉE'
    if not r.returncode: undetected.append(name)
    print(f'{name} : {status} (code {r.returncode}, {last}){" ; " + " | ".join(fails) if fails else ""}')
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and n not in broken]
print(f'{len(M)} mutations, {len(M) - len(undetected) - len(broken)} détectées, {len(undetected)} non détectées, {len(broken)} non jouées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
# Une mutation non jouée ne prouve rien : code 2, même si elle figure dans ATTENDUES.
if broken: print('NON JOUÉES (motif absent ou en double, ou compilation échouée) : ' + ' ; '.join(broken))
sys.exit(2 if broken else 1 if unexpected or now_detected else 0)
