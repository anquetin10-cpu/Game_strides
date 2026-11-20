#!/usr/bin/env python3
"""Mutations des aides à l'appel (tranche T9) : preuve que les oracles départagent chaque règle portée.

Chaque mutation est appliquée à une copie de StridesCore/Private/CourseAids.cpp (takeoffZone, tirets du tracé, plages
affichées, update : tracé, repère, zone d'appel, bandes ; aide lue par le bouton) ou CsoHud.cpp (bouton SAUT : état,
classes, signe, libellé, « Trop tôt » 600 ms) ; le source du dépôt n'est jamais modifié. Le banc
unreal/core/tests/test_core.cpp est recompilé avec la copie et rejoué sur les oracles exportés du jeu web
(cso_takeoff_zone.json ; canal « ai » des exécutions t9-* de cso_runs/, dont t9-ambre et t9-recette ; Content/Data/cso_aids.json). Seuls testCsoTakeoffZone
et testCsoAids tournent (STRIDES_TESTS=zone,aids). Une mutation doit faire échouer le banc ; le script sort en code 1 si
l'une n'est pas détectée hors de la liste ATTENDUES (raison donnée), ou si l'une de celles-ci devient détectée.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  [MUT_ONLY=<texte>] python3 scripts/unreal/mutations-cso-aids.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-aids.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-aids')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
A, H = 'CourseAids.cpp', 'CsoHud.cpp'
M = [
 # takeoffZone (courseAids.js:25-34)
 (A, 'zone : vitesse non relevée à 5,5 m/s', 'st.v = std::max(speed, A.zoneMinSpeed);', 'st.v = speed;'),
 (A, 'zone : marge exigée ≥ 0 (au lieu de −rub)', 'if (margin >= -J.rub && p.zone != Zone::Refuse) {', 'if (margin >= 0 && p.zone != Zone::Refuse) {'),
 (A, 'zone : appel refusé compté dans la bande ambre', 'if (margin >= -J.rub && p.zone != Zone::Refuse) {', 'if (margin >= -J.rub) {'),
 (A, 'zone : bande verte élargie à la zone « loin »', 'if (p.zone == Zone::Good) {', 'if (p.zone == Zone::Good || p.zone == Zone::Far) {'),
 (A, 'zone : distance 0 exclue', 'for (double d = A.zoneFrom; d >= 0; d -= A.zoneStep) {', 'for (double d = A.zoneFrom; d > 0.05; d -= A.zoneStep) {'),
 (A, 'zone : pas de 0,2 m', 'for (double d = A.zoneFrom; d >= 0; d -= A.zoneStep) {', 'for (double d = A.zoneFrom; d >= 0; d -= 2 * A.zoneStep) {'),
 (A, 'zone : de 7 m au lieu de 8', 'for (double d = A.zoneFrom; d >= 0; d -= A.zoneStep) {', 'for (double d = 7; d >= 0; d -= A.zoneStep) {'),
 (A, 'zone : modèle hors concours (cso faux)', '  st.cso = true;\n', ''),
 (A, 'zone : plan sans barre à marge nulle (au lieu de +∞)', 'const double margin = p.hasMargin ? p.margin : std::numeric_limits<double>::infinity();', 'const double margin = p.hasMargin ? p.margin : -1.0;'),
 # Tirets du tracé (_marks, _range)
 (A, 'tirets : premier à s ≥ 0 (au lieu de 1)', '  double next = A.firstMark;', '  double next = 0;'),
 (A, 'tirets : point au pas exact sauté', '    if (p.s < next) continue;', '    if (p.s <= next) continue;'),
 (A, 'tirets : axe transversal inversé', 'tx = fz, tz = -fx;', 'tx = -fz, tz = fx;'),
 (A, 'tirets : demi-longueur = longueur', '    const double l = A.dash / 2, w = A.width / 2;', '    const double l = A.dash, w = A.width / 2;'),
 (A, 'tirets : dernier point du tracé compté', '  for (size_t i = 0; i + 1 < pts.size(); i++) {', '  for (size_t i = 0; i < pts.size(); i++) {'),
 (A, 'plage : premier tiret strictement après s0', '    if (marks[(size_t)i].s >= s0) { a = i; break; }', '    if (marks[(size_t)i].s > s0) { a = i; break; }'),
 (A, 'plage : dernier tiret avant s1 exclu', '    if (marks[(size_t)i].s > s1) { b = i; break; }', '    if (marks[(size_t)i].s >= s1) { b = i; break; }'),
 # Tracé (update, courseAids.js:109-131)
 (A, 'tracé : réglage showLine ignoré', '    const bool on = in.showLine && next;', '    const bool on = next != nullptr;'),
 (A, 'tracé : rien après l’obstacle suivant', '      const double s1 = sF + A_.after;', '      const double s1 = sF;'),
 (A, 'tracé : points cherchés depuis prevS (sans −2 m)', 'if (p.s < in.prevS - A_.lineBack || p.s > s1) continue;', 'if (p.s < in.prevS || p.s > s1) continue;'),
 (A, 'tracé : seuil « loin du tracé » à 15 (au lieu de 15²)', 'if (bd > A_.farFromLine * A_.farFromLine) s0 = in.prevS;', 'if (bd > A_.farFromLine) s0 = in.prevS;'),
 (A, 'tracé : tirets gardés sous le cheval', '        else s0 += A_.hideNear;', '        else s0 += 0;'),
 (A, 'tracé : début non borné par prevS', '        s0 = std::max(in.prevS, s0);\n', ''),
 (A, 'tracé : suite depuis l’obstacle (sans max(s0, sF))', 'csoMarkRange(marks_, std::max(s0, sF), s1, view_.afterFirst, view_.afterCount);', 'csoMarkRange(marks_, sF, s1, view_.afterFirst, view_.afterCount);'),
 (A, 'tracé : obstacle sans lineS à 0 (au lieu de 1e9)', 'const double sF = next->hasLineS ? next->lineS : 1e9;', 'const double sF = next->hasLineS ? next->lineS : 0;'),
 # Repère (courseAids.js:133-138)
 (A, 'repère : sol de l’obstacle ignoré', 'view_.markY = next->ground + next->ob.h + A_.markLift', 'view_.markY = next->ob.h + A_.markLift'),
 (A, 'repère : oscillation à 1 rad/s', 'std::sin(in.time * A_.markFreq)', 'std::sin(in.time)'),
 (A, 'repère : sans cap', '    view_.markRot = next->ob.rot;', '    view_.markRot = 0;'),
 # Zone d'appel (courseAids.js:139-167)
 (A, 'zone : affichée à pied', 'const bool zoneOn = in.showZone && next && in.hasHorse && in.riding;', 'const bool zoneOn = in.showZone && next && in.hasHorse;'),
 (A, 'zone : réglage showZone ignoré', 'const bool zoneOn = in.showZone && next && in.hasHorse && in.riding;', 'const bool zoneOn = next && in.hasHorse && in.riding;'),
 (A, 'zone : affichée jusqu’à 30 m', '  if (dist > A_.zoneMaxDist) return;', '  if (dist > 30) return;'),
 (A, 'zone : recalculée toutes les 0,5 s', '    zoneT_ = A_.zoneEvery;', '    zoneT_ = 0.5;'),
 (A, 'zone : temporisation non décomptée', '  zoneT_ -= in.dt;\n', ''),
 (A, 'zone : pas recalculée au changement d’obstacle', '  if (zoneT_ <= 0 || zoneFor_ != next->id) {', '  if (zoneT_ <= 0) {'),
 (A, 'bandes : posées aux épaules (sans 0,4 m)', '  const double nearD = r[0] + A_.bandShift, farD = r[1] + A_.bandShift;', '  const double nearD = r[0], farD = r[1];'),
 (A, 'bandes : longueur minimale 0,2 m ignorée', 'len = std::max(A_.bandMinLen, farD - nearD);', 'len = farD - nearD;'),
 (A, 'bandes : largeur non bornée à 2,2 m', '  m.sx = std::min(next.ob.w, A_.bandMaxWidth);', '  m.sx = next.ob.w;'),
 (A, 'bandes : posées à +0,04 m', '  m.y = (groundAt ? groundAt(x, zz) : 0.0) + A_.bandLift;', '  m.y = (groundAt ? groundAt(x, zz) : 0.0) + 0.04;'),
 (A, 'bandes : verte non relevée de 0,005 m', '  view_.good.y += A_.goodLift;', '  (void)0;'),
 (A, 'bandes : sans cap', '  m.rot = next.ob.rot;', '  m.rot = 0;'),
 # Contrôle adverse de T9 : garde de place (courseAids.js:155, `if (!r) return;`), plage absente de chaque bande, hauteur
 # des tirets (_strip : sol + 0,04, courseAids.js:67 ; constante lue par le jeu dans csoAidsDefaults()).
 (A, 'bandes : posées sans plage (garde de place retirée)', '  if (!has) return;\n', ''),
 (A, 'bandes : verte posée sans plage verte', '  placeBand(view_.good, zone_.hasGood, zone_.good, *next, groundAt);', '  placeBand(view_.good, true, zone_.good, *next, groundAt);'),
 (A, 'bandes : ambre posée sans plage ambre', '  placeBand(view_.ok, zone_.hasPass, zone_.pass, *next, groundAt);', '  placeBand(view_.ok, true, zone_.pass, *next, groundAt);'),
 (A, 'tirets : posés à sol + 0,05 m', '  static const CsoAidsParams A;', '  static const CsoAidsParams A = [] { CsoAidsParams p; p.lineLift = 0.05; return p; }();'),
 (A, 'tirets : posés à sol + 0,035 m', '  static const CsoAidsParams A;', '  static const CsoAidsParams A = [] { CsoAidsParams p; p.lineLift = 0.035; return p; }();'),
 (A, 'bandes : ambre et verte inversées', '  placeBand(view_.ok, zone_.hasPass, zone_.pass, *next, groundAt);\n  placeBand(view_.good, zone_.hasGood, zone_.good, *next, groundAt);',
  '  placeBand(view_.ok, zone_.hasGood, zone_.good, *next, groundAt);\n  placeBand(view_.good, zone_.hasPass, zone_.pass, *next, groundAt);'),
 # Aide lue par le bouton (courses.js:187, 458 ; hud.js:374)
 (A, 'bouton : entrée en piste non coupée', '  if (!course || pre) return Zone::None;', '  if (!course) return Zone::None;'),
 (A, 'bouton : aide « off » ignorée', '  return aid == "off" ? Zone::None : timing;', '  return timing;'),
 # Bouton SAUT (hud.js:373-380, 433-442)
 (H, 'bouton : état changé pendant « Trop tôt »', '  if (jt != jt_ && jt_ != "early") {', '  if (jt != jt_) {'),
 (H, 'bouton : « Trop tôt » 500 ms', 'earlyT_ = schedule(600, TimerKind::EarlyOff);', 'earlyT_ = schedule(500, TimerKind::EarlyOff);'),
 (H, 'bouton : état gardé à la fin de « Trop tôt »', '      jEarly_ = false;\n      jt_.clear();', '      jEarly_ = false;'),
 (H, 'bouton : classes d’état retirées par « Trop tôt »', '  jEarly_ = true;\n  jLabel_ = "Trop tôt";', '  jEarly_ = true;\n  jFar_ = jGood_ = jNear_ = false;\n  jLabel_ = "Trop tôt";'),
 (H, 'bouton : temporisation de « Trop tôt » non annulée', '  cancel(earlyT_);\n  earlyT_ = schedule(600', '  earlyT_ = schedule(600'),
 (H, 'bouton : signe « » » remplacé', 'jSign_ = jFar_ ? "»"', 'jSign_ = jFar_ ? ">"'),
 (H, 'bouton : libellé de « near » = Trop loin', 'jNear_ ? "Trop près" : "Saut"', 'jNear_ ? "Trop loin" : "Saut"'),
 (H, 'bouton : « refuse » affiché comme « near »', '    jNear_ = jt == "near";', '    jNear_ = jt == "near" || jt == "refuse";'),
]
# Mutations qu'aucun oracle ne peut départager (raison donnée) : listées pour mémoire, pas comme des succès.
ATTENDUES = {
 'zone : distance 0 exclue':
  'équivalente sur les obstacles du parcours (verticaux et oxers) : à d ≈ 0 la première barre est à moins de 0,55 m '
  '(JUMP.minFront) des épaules, zone « refuse », jamais comptée ni dans la bande ambre ni dans la verte',
 'zone : plan sans barre à marge nulle (au lieu de +∞)':
  'équivalente : abord droit depuis l’axe de l’obstacle (cosA = 1), railsAhead rend toujours ses barres ; le plan sans '
  'barre (margin: Infinity du web) n’arrive pas dans takeoffZone',
 'zone : de 7 m au lieu de 8':
  'équivalente par le modèle de saut : la longueur du saut est bornée à 1,06 × L0 (jumpModel.js:94), au-delà la parabole '
  'passe sous la barre ; la plus longue distance qui passe sur la grille (hauteurs 0,6 à 1,55 m, jusqu’à 9,6 m/s) est '
  '5,8 m',
 'tracé : début non borné par prevS':
  'sous-branche non départagée sur le tracé du Pôle : s0 vaut au moins prevS − 0,5 (point le plus proche ≥ prevS − 2, '
  'plus 1,5) ; un tiret ne tombe dans [s0 ; prevS) que s’il suit de 1,5 m exactement un point situé à prevS − 2 '
  '(obstacles 3, 4B, 6A, 6B : égalité à l’arrondi près), cas qu’aucune exécution ne pose',
 'tirets : dernier point du tracé compté':
  'équivalente sur le tracé du Pôle : le dernier point (s = 368,44) tombe avant le tiret suivant (pas de 1,5 m)',
 'tracé : obstacle sans lineS à 0 (au lieu de 1e9)':
  'équivalente en épreuve de CSO : tous les obstacles du parcours ont lineS (obstacles.js:184)',
 'bandes : longueur minimale 0,2 m ignorée':
  'sous-branche non départagée : une bande de moins de 0,2 m n’apparaît qu’à 1,55 m et plus (195 cas de la grille '
  'cso_takeoff_zone.json, base 1,55) ; l’épreuve se court à 1,05-1,15 m, aucune exécution ne l’affiche',
 'bandes : ambre posée sans plage ambre':
  'sous-branche non départagée : zone sans aucune plage (takeoffZone rend pass nul) jamais avec le cheval des exécutions '
  '(puissance 1,38) ; aux hauteurs de l’épreuve (base 1,10), seulement pour un cheval de puissance 1,1 sous 5,8 m/s '
  '(13 cas de la grille cso_takeoff_zone.json), qu’aucune exécution ne monte ; la garde elle-même (même fonction '
  'placeBand) est départagée par t9-ambre (verte sans plage verte)',
 'bouton : « refuse » affiché comme « near »':
  'équivalente par construction : obstacles.timing rend déjà « near » pour une zone « refuse » (obstacles.js:373), le '
  'bouton ne reçoit jamais « refuse »',
}
only = os.environ.get('MUT_ONLY')
if only: M = [m for m in M if only in m[1]]
os.makedirs(out, exist_ok=True)
allc = ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'CsoHud.cpp', 'CsoCamera.cpp', 'CsoInput.cpp', 'CourseAids.cpp', 'Text.cpp', 'SaveGame.cpp', 'CoursePlan.cpp', 'CsoEntry.cpp')
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
undetected = []
# Objets communs compilés une fois ; seule la copie mutée est recompilée, puis liée.
inc = ['-I', os.path.join(core, 'Public')]
objs = {}
for x in ('test_core.cpp',) + allc:
    src = test if x == 'test_core.cpp' else os.path.join(core, 'Private', x)
    o = os.path.join(out, x.replace('.cpp', '.o'))
    c = subprocess.run(['clang++', '-std=c++20', '-O1', *inc, '-c', src, '-o', o], capture_output=True, text=True)
    if c.returncode: sys.exit(f'{x} : compilation échouée\n{c.stderr[:400]}')
    objs[x] = o
env = dict(os.environ, STRIDES_TESTS='zone,aids')
for file, name, a, b in M:
    src = open(os.path.join(core, 'Private', file)).read()
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected.append(name); continue
    f = os.path.join(out, file)
    open(f, 'w').write(src.replace(a, b))
    exe = os.path.join(out, 'mut')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', *inc, f, *[o for k, o in objs.items() if k != file], '-o', exe], capture_output=True, text=True)
    if c.returncode:
        print(f'{name} : compilation échouée\n{c.stderr[:400]}'); undetected.append(name); continue
    r = subprocess.run([exe, ora, data], capture_output=True, text=True, env=env)
    last = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    fails = [l.strip() for l in r.stdout.splitlines() if 'ÉCHEC' in l][:1]
    status = 'détectée' if r.returncode else 'NON DÉTECTÉE'
    if not r.returncode: undetected.append(name)
    print(f'{name} : {status} (code {r.returncode}, {last}){" ; " + fails[0][:160] if fails else ""}', flush=True)
# Témoin : la copie non mutée passe le banc.
c = subprocess.run(['clang++', '-std=c++20', '-O1', *objs.values(), '-o', os.path.join(out, 'mut')], capture_output=True, text=True)
r = subprocess.run([os.path.join(out, 'mut'), ora, data], capture_output=True, text=True, env=env)
print(f'témoin non muté : code {r.returncode} ({r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""})')
if c.returncode or r.returncode: sys.exit('témoin non muté en échec : banc ou oracle à revoir')
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and any(m[1] == n for m in M)]
print(f'{len(M)} mutations, {len(M) - len(undetected)} détectées, {len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
sys.exit(1 if unexpected or now_detected else 0)
