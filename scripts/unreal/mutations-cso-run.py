#!/usr/bin/env python3
"""Mutations du portage du déroulé d'épreuve et des textes (tranche T4) : preuve que les oracles exercent chaque règle.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoRun.cpp ou Text.cpp (le source du dépôt n'est jamais
modifié) ; le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué sur les oracles exportés du
jeu web (cso_runs/, cso_text.json). Une mutation doit faire échouer le banc (code de sortie non nul) ; le script sort
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
 # Gardes des écouteurs d'obstacle (contrôle adverse de T4 : aucune n'était détectée avant t4-gardes et t4-un-point)
 (R, 'refus devant un obstacle non attendu compté', '    if (num != st_.next) return;\n', '\n'),
 (R, 'refus à rebours compté', 'if (st_.finished || st_.eliminated || !st_.started || dir < 0) return;', 'if (st_.finished || st_.eliminated || !st_.started) return;'),
 (R, 'refus avant le départ compté', 'if (st_.finished || st_.eliminated || !st_.started || dir < 0) return;', 'if (st_.finished || st_.eliminated || dir < 0) return;'),
 (R, 'refus après l’arrivée compté', 'if (st_.finished || st_.eliminated || !st_.started || dir < 0) return;', 'if (st_.eliminated || !st_.started || dir < 0) return;'),
 (R, 'refus après l’élimination compté', 'if (st_.finished || st_.eliminated || !st_.started || dir < 0) return;', 'if (st_.finished || !st_.started || dir < 0) return;'),
 (R, 'saut à rebours compté', '  if (num == st_.next && dir > 0) {', '  if (num == st_.next) {'),
 (R, 'erreur de parcours sur un saut à rebours', '  } else if (dir > 0) wrongCourse(num);', '  } else wrongCourse(num);'),
 (R, 'saut après l’arrivée compté', 'if (st_.finished || st_.eliminated || notStarted()) return;', 'if (st_.eliminated || notStarted()) return;'),
 (R, 'saut après l’élimination compté', 'if (st_.finished || st_.eliminated || notStarted()) return;', 'if (st_.finished || notStarted()) return;'),
 (R, 'faute : obstacle suivant non avancé', '      hud("toast", {S(Tr("Barre au {0} · +4{1}", {label, causeText.empty() ? std::string() : " · " + causeText}))});\n    }\n    advance();',
  '      hud("toast", {S(Tr("Barre au {0} · +4{1}", {label, causeText.empty() ? std::string() : " · " + causeText}))});\n      st_.next--;\n    }\n    advance();'),
 # Second contrôle adverse de T4 : départ lancé (courses.js:274), arrivée (courses.js:333), sortie écourtée par une
 # descente (courses.js:320), écouteurs limités à l'étape de parcours, journal des fautes (aucune n'était détectée avant
 # t4-lance-*, t4-hors-parcours, t4-sortie-descente et la comparaison du journal).
 (R, 'départ lancé : 12 m -> 40 m', 'if (sP >= 0 && sP < 12 &&', 'if (sP >= 0 && sP < 40 &&'),
 (R, 'départ lancé : 12 m -> 11,5 m', 'if (sP >= 0 && sP < 12 &&', 'if (sP >= 0 && sP < 11.5 &&'),
 (R, 'départ lancé : 0 m -> −1 m', 'if (sP >= 0 && sP < 12 &&', 'if (sP >= -1 && sP < 12 &&'),
 (R, 'départ lancé : 0 m -> 0,5 m', 'if (sP >= 0 && sP < 12 &&', 'if (sP >= 0.5 && sP < 12 &&'),
 (R, 'départ lancé : largeur ignorée', 'uP < L.w / 2 + 0.3 && std::sin(cur_.heading)', 'uP < 1e9 && std::sin(cur_.heading)'),
 (R, 'départ lancé : marge 0,3 -> 0', 'uP < L.w / 2 + 0.3 && std::sin(cur_.heading)', 'uP < L.w / 2 && std::sin(cur_.heading)'),
 (R, 'départ lancé : côté gauche non borné', 'const double uP = std::abs((cur_.x - L.x) * nz - (cur_.z - L.z) * nx);', 'const double uP = (cur_.x - L.x) * nz - (cur_.z - L.z) * nx;'),
 (R, 'départ lancé : cap ignoré', 'std::cos(cur_.heading) * nz > 0.5) {', 'std::cos(cur_.heading) * nz > -2) {'),
 (R, 'départ lancé : cap 60° -> 53°', 'std::cos(cur_.heading) * nz > 0.5) {', 'std::cos(cur_.heading) * nz > 0.6) {'),
 (R, 'arrivée : dernier obstacle non exigé', 'if (st_.started && st_.next > n && lineCrossed(cfg_.finish', 'if (st_.started && lineCrossed(cfg_.finish'),
 (R, 'arrivée : ni départ ni dernier obstacle exigés', 'if (st_.started && st_.next > n && lineCrossed(cfg_.finish', 'if (lineCrossed(cfg_.finish'),
 (R, 'arrivée : départ non exigé', 'if (st_.started && st_.next > n && lineCrossed(cfg_.finish', 'if (st_.next > n && lineCrossed(cfg_.finish'),
 (R, 'sortie de piste : descente ignorée', 'return st_.exitT > 2.6 || !f.riding;', 'return st_.exitT > 2.6;'),
 (R, 'écouteurs actifs hors de l’étape de parcours', 'if (done_ || step() != CsoStep::Course) return;', 'if (done_) return;'),
 (R, 'mode de concours : prochain obstacle gardé à l’arrivée', 'mode_.next = st_.finished || nextIdx < 0', 'mode_.next = nextIdx < 0'),
 (R, 'journal : refus absent', '    st_.log.push_back({label, "refusal", "", ""});\n', '\n'),
 (R, 'journal : saut franchi absent', '      st_.log.push_back({label, "clear", "", ""});\n', '\n'),
 (R, 'journal : barre sans sa cause', 'st_.log.push_back({label, "rail", cause, causeText});', 'st_.log.push_back({label, "rail", "", ""});'),
 (R, 'journal : barre notée franchie', 'st_.log.push_back({label, "rail", cause, causeText});', 'st_.log.push_back({label, "clear", cause, causeText});'),
 # Numéro surligné, barres remises, public en liesse
 (R, 'surlignage : faux au départ', '      highlight_ = st_.next;\n    } else if (st_.bell <= 0) {', '      highlight_ = 99;\n    } else if (st_.bell <= 0) {'),
 (R, 'surlignage : 1 non surligné à l’entrée', '      highlight_ = 1;\n', '\n'),
 (R, 'surlignage : pas avancé', '  st_.fenceRefusals = 0;\n  highlight_ = st_.next;', '  st_.fenceRefusals = 0;'),
 (R, 'surlignage : reprise du double sans surlignage', '          st_.next = fe.num;\n          highlight_ = st_.next;', '          st_.next = fe.num;'),
 (R, 'surlignage : éteint à la fin du parcours', '  highlight_ = -1;\n  mode_ = CsoCourseMode();\n  st_.running = false;', '  mode_ = CsoCourseMode();\n  st_.running = false;'),
 (R, 'barres jamais remises à l’entrée', '      resetRails_ = true;', '      resetRails_ = false;'),
 (R, 'ovation jamais demandée', '    if (pts == 0) cheer_ = 3.5;', ''),
 (R, 'ovation 3,5 s -> 3 s', '    if (pts == 0) cheer_ = 3.5;', '    if (pts == 0) cheer_ = 3;'),
 (R, 'arrivée : « 1 POINT » -> « 1 POINTS »', 'pts > 1 ? Tr("{0} POINTS"', 'pts >= 1 ? Tr("{0} POINTS"'),
 # Étape « rejoindre l'entrée de la carrière » (cso_goto.json et t4-entree)
 (R, 'goto : rayon ignoré', '  return jsHypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ) < cfg.gateR && f.riding;', '  return f.riding;'),
 (R, 'goto : rayon 9 -> 9,01 (inclusif)', '  return jsHypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ) < cfg.gateR && f.riding;', '  return jsHypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ) <= cfg.gateR && f.riding;'),
 (R, 'goto : à cheval non exigé', '  return jsHypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ) < cfg.gateR && f.riding;', '  return jsHypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ) < cfg.gateR;'),
 (R, 'goto : distance jamais affichée', 'if (d > std::max(45.0, cfg.gateR + 30)) {', 'if (false) {'),
 (R, 'goto : seuil max(45, r + 30) -> r + 30', 'if (d > std::max(45.0, cfg.gateR + 30)) {', 'if (d > cfg.gateR + 30) {'),
 (R, 'goto : distance arrondie par défaut', 'jsInt((long long)std::floor(d / 10 + 0.5) * 10)', 'jsInt((long long)std::floor(d / 10) * 10)'),
 (R, 'goto : kilomètres jamais', 'd >= 1000 ? dec(d / 1000, 1, cfg.lang)', 'false ? dec(d / 1000, 1, cfg.lang)'),
 (R, 'goto : camion et véhicule inversés', 'f.vehicle && !f.inTruck ? "Sors du véhicule', '!(f.vehicle && !f.inTruck) ? "Sors du véhicule'),
 (R, 'goto : au volant traité comme à pied', '    if (f.driving) return text.t(', '    if (false) return text.t('),
 (R, 'goto : consigne de montée jamais', '  if (!f.riding) {\n    // modeHint', '  if (false) {\n    // modeHint'),
 (R, 'goto : std::hypot au lieu de Math.hypot', '  const double d = jsHypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ);', '  const double d = std::hypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ);'),
 # Arrivée et sortie de piste
 (R, 'sortie de piste 2,6 s -> 2 s', 'return st_.exitT > 2.6 || !f.riding;', 'return st_.exitT > 2.0 || !f.riding;'),
 (R, 'sortie : cadence 1,9 -> 2', 'std::max(std::min(cad.v, 1.9), cad.v - 1.6 * f.dt)', 'std::max(std::min(cad.v, 2.0), cad.v - 1.6 * f.dt)'),
 (R, 'sortie : 1,6 m/s² -> 1,5', 'std::max(std::min(cad.v, 1.9), cad.v - 1.6 * f.dt)', 'std::max(std::min(cad.v, 1.9), cad.v - 1.5 * f.dt)'),
 (R, 'applaudissements du sans-faute 1,3 -> 1,2', 'audio("applause", {N(pts == 0 ? 1.3 : 0.55)', 'audio("applause", {N(pts == 0 ? 1.2 : 0.55)'),
 (R, 'pénalités de temps en direct supprimées', 'return faults + (int)std::ceil(over - 1e-9);', 'return faults;'),
 (R, 'points : seconde entamée arrondie au plus proche', 'return faults + (int)std::ceil(over - 1e-9);', 'return faults + (int)std::floor(over + 0.5);'),
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
# Équivalentes par construction, dans le jeu web comme dans le portage (aucun oracle ne peut les distinguer) :
ATTENDUES = {
 'refus après l’arrivée compté': "garde redondante : l'arrivée n'est franchie que si next > n (courses.js:333, CsoRun courseUpdate), "
   "next vaut alors n + 1 et le test de l'obstacle attendu (courses.js:245, `num != st_.next`) rejette déjà tout refus",
 'refus après l’élimination compté': "garde inatteignable : out() rend vrai, Run.update passe à l'étape suivante dans la même image "
   "(missions.js:230-233 → Run.next → end() retire les écouteurs, courses.js:352-354 ; portage : update → next(), puis "
   "obstacleEvent rejette tout événement hors de l'étape de parcours — garde prouvée par t4-hors-parcours, saut pendant "
   "l'entrée en piste : mutation « écouteurs actifs hors de l’étape de parcours » détectée)",
 'saut après l’élimination compté': "même raison que le refus après l'élimination (garde d'étape prouvée par t4-hors-parcours : "
   "mutation « écouteurs actifs hors de l’étape de parcours » détectée)",
 'arrivée : départ non exigé': "garde redondante : next ne dépasse 1 que par advance(), appelé seulement chrono lancé "
   "(courses.js:221, 231 ; portage : notStarted) ; next > n implique donc started, dans le jeu web comme dans le portage",
 'mode de concours : prochain obstacle gardé à l’arrivée': "garde redondante : l'arrivée exige next > n (courses.js:333), "
   "next - 1 vaut alors n, hors de la liste : game.course.next vaut null dans les deux branches (courses.js:308)",
}
os.makedirs(out, exist_ok=True)
srcs = {f: open(os.path.join(core, 'Private', f)).read() for f in (R, T)}
allc = ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'CsoHud.cpp', 'CsoCamera.cpp', 'CsoInput.cpp', 'CourseAids.cpp', 'Text.cpp', 'SaveGame.cpp', 'CoursePlan.cpp', 'CsoEntry.cpp', 'Ranking.cpp', 'CsoAudio.cpp', 'HorseCoat.cpp')
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
