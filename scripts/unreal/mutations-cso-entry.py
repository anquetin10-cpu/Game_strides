#!/usr/bin/env python3
"""Mutations du portage de l'entrée dans l'épreuve (tranche T10) : preuve que les oracles départagent la logique.

Chaque mutation est appliquée à une copie de StridesCore/Private/CoursePlan.cpp, CsoEntry.cpp, Text.cpp ou CsoRun.cpp
(le source du dépôt n'est jamais modifié) ; le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et
rejoué (STRIDES_TESTS : seulement les bancs concernés) sur les oracles exportés du jeu web (cso_plan.json, cso_entry.json,
cso_text.json ; cso_runs/ pour le lancement de l'activité). Une mutation doit faire échouer le banc (code de sortie non
nul) ; le script sort en code 1 si l'une n'est pas détectée, hors des mutations listées dans ATTENDUES (raison donnée)
— et aussi si l'une de celles-ci devient détectée.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-cso-entry.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-entry.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-entry')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
P, E, T, R = 'CoursePlan.cpp', 'CsoEntry.cpp', 'Text.cpp', 'CsoRun.cpp'
FAST = 'text,plan,entry'
M = [
 # Plan du parcours (coursePlan.js:11-58)
 (P, 'viewBox : marge 6 -> 5', 'const double W = arena.w, D = arena.d, pad = 6;', 'const double W = arena.w, D = arena.d, pad = 5;'),
 (P, 'ouverture d’entrée : D/2 − 0,4 -> D/2 − 0,5', 'e.g("x", "-3.5").g("y", N(D / 2 - 0.4))', 'e.g("x", "-3.5").g("y", N(D / 2 - 0.5))'),
 (P, 'tribunes : largeur de la carrière', 'e.g("x", N(-arena.standsW / 2))', 'e.g("x", N(-W / 2))'),
 (P, 'abord entrée → départ omis', 'if (trace.leadIn.size() > 1) P.push_back(', 'if (false) P.push_back('),
 (P, 'ligne du cavalier : tous les points', 'for (size_t i = 0; i < pts.size(); i += 2) {', 'for (size_t i = 0; i < pts.size(); i += 1) {'),
 (P, 'ligne du cavalier : tirets 1,2 1 -> 1 1', '.dash("1.2 1")', '.dash("1 1")'),
 (P, 'lignes de départ / d’arrivée : sens inversé', 'tz = -std::sin(m.rot) * 3.5;', 'tz = std::sin(m.rot) * 3.5;'),
 (P, 'mots Départ / Arrivée : +1 omis', '.g("y", F2(m.z + tz * 1.5 + 1))', '.g("y", F2(m.z + tz * 1.5))'),
 (P, 'mots Départ / Arrivée intervertis', 'std::string(mk.k) == "D" ? tt.t("Départ", lang)', 'std::string(mk.k) != "D" ? tt.t("Départ", lang)'),
 (P, 'oxer : une seule barre', '      P.push_back(bar(f.spread / 2, col, "0.8"));\n', ''),
 (P, 'mur : trait 1,3 -> 0,8', 'P.push_back(bar(0, "#a4553f", "1.3"));', 'P.push_back(bar(0, "#a4553f", "0.8"));'),
 (P, 'numéro surligné ignoré', 'const bool hot = next == (int)i + 1;', 'const bool hot = false;'),
 (P, 'flèche : pointe 1,1 -> 1,2', 'x1 = F2(ax + nx * 1.1), y1 = F2(az + nz * 1.1)', 'x1 = F2(ax + nx * 1.2), y1 = F2(az + nz * 1.2)'),
 (P, 'pastille du côté opposé', 'const double lx = f.x - tx * 3.6, lz = f.z - tz * 3.6;', 'const double lx = f.x + tx * 3.6, lz = f.z + tz * 3.6;'),
 (P, 'numéro : taille unique', 'fontSize(f.label.size() > 1 ? "1.9" : "2.4")', 'fontSize("2.4")'),
 (P, 'hauteur : 3,6 sous la pastille -> 3', '.g("y", F2(lz + 3.6)).fontSize("1.5")', '.g("y", F2(lz + 3)).fontSize("1.5")'),
 (P, 'hauteur : un chiffre après la virgule', 'text(dec((*heights)[i], 2, lang))', 'text(dec((*heights)[i], 1, lang))'),
 (P, 'barres : extrémités carrées', 'strokeWidth(width).a("stroke-linecap", "round");', 'strokeWidth(width);'),
 (P, 'légende : séparateur « , »', 'if (!s.empty()) s += " · ";', 'if (!s.empty()) s += ", ";'),
 (P, 'légende : mur nommé oxer', 'f.kind == "w" ? tt.t("mur", lang)', 'f.kind == "w" ? tt.t("oxer", lang)'),
 # Présentation (courses.js:91-138)
 (E, 'hauteur de l’épreuve : dernier des plus fréquents', 'if (n > bestN) {', 'if (n >= bestN) {'),
 (E, 'opts.height ignoré', '  if (in.hasHeight) {\n    out = in.height;', '  if (false) {\n    out = in.height;'),
 (E, 'seuil Facile 1,08 -> 1,09', 'h < 1.08 ? "Facile"', 'h < 1.09 ? "Facile"'),
 (E, 'seuil Moyenne 1,18 -> 1,17', 'h < 1.18 ? "Moyenne"', 'h < 1.17 ? "Moyenne"'),
 (E, 'seuil Difficile 1,35 -> 1,36', 'h < 1.35 ? "Difficile"', 'h < 1.36 ? "Difficile"'),
 (E, 'difficulté sans minuscules', 'jsLower(tt.t(csoDifficultyKey(classH), lang))', 'tt.t(csoDifficultyKey(classH), lang)'),
 (E, 'composition : éléments B comptés', 'const long n = (long)labels.size() - (long)firsts.size();', 'const long n = (long)labels.size();'),
 (E, 'composition : un double écrit au pluriel', 'if (firsts.size() > 1) {', 'if (firsts.size() > 0) {'),
 (E, 'composition : paire « 4A - 4B »', 'pairs += (pairs.empty() ? "" : ", ") + a + " – " + toB(a);', 'pairs += (pairs.empty() ? "" : ", ") + a + " - " + toB(a);'),
 (E, 'kicker : lieu donné ignoré', '(in.place.empty() ? in.defaultPlace : in.place)', 'in.defaultPlace'),
 (E, 'cheval absent : nom vide', 'in.hasHorse ? in.horseName : "—"', 'in.horseName'),
 (E, 'jury : lignes collées', 'p.jury += (p.jury.empty() ? "" : " ") + l;', 'p.jury += l;'),
 (E, 'règles données ignorées', 'p.rules = in.rulesText.empty() ?', 'p.rules = true ?'),
 (E, 'légende du plan : longueur entière', '" · " + jsNumber(in.length) + " m · "', '" · " + jsInt((long long)in.length) + " m · "'),
 # Capacité (courses.js:499-528)
 (E, 'capacité : galop 6,2 m/s omis', 'for (double v : {6.2, 7.0, 7.8}) {', 'for (double v : {7.0, 7.8}) {'),
 (E, 'capacité : appel à 0,7 m au plus près', 'for (double d = 0.6; d < 5 && !passes; d += 0.1) {', 'for (double d = 0.7; d < 5 && !passes; d += 0.1) {'),
 (E, 'capacité : appel à 4 m au plus loin', 'for (double d = 0.6; d < 5 && !passes; d += 0.1) {', 'for (double d = 0.6; d < 4 && !passes; d += 0.1) {'),
 (E, 'capacité : marge −rub -> 0', 'p.margin >= -P.rub) passes = true;', 'p.margin >= 0) passes = true;'),
 (E, 'capacité : refus accepté', 'if (p.zone != Zone::Refuse && p.margin', 'if (p.margin'),
 (E, 'capacité : oxer, barre avant à la hauteur', 'f.bars = {{-o.spread / 2, hh - 0.05}, {o.spread / 2, hh}};', 'f.bars = {{-o.spread / 2, hh}, {o.spread / 2, hh}};'),
 (E, 'capacité : portée +0,2 -> +0,25', 'c.reach = in.hasHorse ? in.power + 0.2 + in.clearance : 99;', 'c.reach = in.hasHorse ? in.power + 0.25 + in.clearance : 99;'),
 (E, 'capacité : bonus de franchissement oublié dans la portée', 'c.reach = in.hasHorse ? in.power + 0.2 + in.clearance : 99;', 'c.reach = in.hasHorse ? in.power + 0.2 : 99;'),
 (E, 'capacité : sans cheval, portée 0', 'c.reach = in.hasHorse ? in.power + 0.2 + in.clearance : 99;', 'c.reach = in.hasHorse ? in.power + 0.2 + in.clearance : 0;'),
 (E, 'capacité hors CSO : marge 0,04 omise', 'c.hopeless = c.reach < maxH + 0.04;', 'c.hopeless = c.reach < maxH;'),
 (E, 'capacité : hauteur posée de l’obstacle', 'const double hh = i < in.heights.size() ? in.heights[i] : o.h;', 'const double hh = o.h;'),
 (E, 'capacité : bonus ignoré par le saut', 'h.clearance = in.clearance;', 'h.clearance = 0;'),
 (E, 'dialogue : hauteur au dixième', '{dec(maxH, 2, lang), in.horseName, dec(c.reach, 2, lang)}', '{dec(maxH, 1, lang), in.horseName, dec(c.reach, 2, lang)}'),
 # Action du poteau (interact.js:33-44, activities.js:84-94)
 (E, 'poteau : rayon strict', 'if (jsHypot(a.startX - focusX, a.startZ - focusZ) > a.r) return false;', 'if (jsHypot(a.startX - focusX, a.startZ - focusZ) >= a.r) return false;'),
 (E, 'poteau : mission active ignorée', 'return !missionActive;  // when', 'return true;  // when'),
 (E, 'poteau : tous les modes', '  if (!modeOk) return false;\n', '\n'),
 # Textes (String(n), casse)
 (T, 'String(n) : exponentielle dès 1e20', 'if (k <= n && n <= 21) out =', 'if (k <= n && n <= 20) out ='),
 (T, 'String(n) : 0,000001 en exponentielle', 'else if (-6 < n && n <= 0) out =', 'else if (-5 < n && n <= 0) out ='),
 (T, 'String(n) : 17 chiffres', 'for (int p = 1; p <= 17; p++) {', 'for (int p = 17; p <= 17; p++) {'),
 (T, 'majuscules : Latin-1 ignoré', 'else if (d >= 0xA0 && d <= 0xBE && d != 0xB7) { o += (char)0xC3; o += (char)(d - 0x20); }', 'else if (false) {}'),
 (T, 'minuscules : Latin-1 ignoré', 'if (d >= 0x80 && d <= 0x9E && d != 0x97) { o += (char)0xC3; o += (char)(d + 0x20); }', 'if (false) {}'),
 # Déroulé (CsoRun) : lancement de l'activité et dialogue de capacité
 (R, 'lancement : grand message omis', '    hud_.push_back(cfg_.launchBig);\n', '\n'),
 (R, 'lancement : son notify omis', '    audio("notify", {});\n', '\n'),
 (R, 'dialogue de capacité non demandé', 'if (capWarn_) hud("dialog",', 'if (false) hud("dialog",'),
 (R, 'capacité : étape non tenue', 'case CsoStep::Capacity: return !capWarn_;', 'case CsoStep::Capacity: return true;'),
]
# Bancs rejoués par fichier muté (les autres ne lisent pas le code muté) : lancement de l'activité dans cso_runs/.
TESTS = {P: FAST, E: FAST, T: FAST, R: 'entry,csoruns'}
# Sous-branches de la grille de capacité qu'aucun oracle ne départage sur le parcours du Pôle : le seuil de puissance où
# le dialogue bascule (cherché par dichotomie dans le jeu web pour 6 hauteurs × 3 bonus et 2 compositions réduites, cas
# aux deux bords à 2⁻⁵⁰ près dans cso_entry.json) reste le même au bit près avec ces mutations. Raison : au seuil, le saut
# est plafonné par la puissance (H = Hcap = puissance × speedFactor(v), croissant avec la vitesse) et l'appel décisif est
# au galop le plus rapide (7,8 m/s) à une distance intermédiaire (ni 0,6 m, ni au-delà de 4 m) ; un appel en deçà de
# minFront (0,55 m de la barre avant, zone « refuse ») n'est jamais le meilleur. Déclarées non départagées dans
# l'inventaire (cso.capacite-cheval).
ATTENDUES = {
 'capacité : galop 6,2 m/s omis': "seuil inchangé : l'appel décisif est à 7,8 m/s (Hcap croît avec la vitesse)",
 'capacité : appel à 0,7 m au plus près': "seuil inchangé : l'appel décisif n'est jamais à 0,6 m",
 'capacité : appel à 4 m au plus loin': "seuil inchangé : l'appel décisif n'est jamais au-delà de 4 m",
 'capacité : refus accepté': "seuil inchangé : un appel en zone de refus (barre avant à moins de 0,55 m) n'est jamais le meilleur",
}
os.makedirs(out, exist_ok=True)
srcs = {f: open(os.path.join(core, 'Private', f)).read() for f in (P, E, T, R)}
allc = ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'CsoHud.cpp', 'CsoCamera.cpp', 'CsoInput.cpp', 'CourseAids.cpp', 'Text.cpp', 'SaveGame.cpp', 'CoursePlan.cpp', 'CsoEntry.cpp', 'Ranking.cpp', 'CsoAudio.cpp', 'HorseCoat.cpp')
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
inc = os.path.join(core, 'Public')
# Objets communs compilés une fois (seul le fichier muté est recompilé).
objs = {}
for x in allc + ('test_core.cpp',):
    src = test if x == 'test_core.cpp' else os.path.join(core, 'Private', x)
    o = os.path.join(out, x + '.o')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, '-c', src, '-o', o], capture_output=True, text=True)
    if c.returncode: sys.exit(f'{x} : compilation échouée\n{c.stderr[:600]}')
    objs[x] = o
undetected = []
for file, name, a, b in M:
    src = srcs[file]
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected.append(name); continue
    f = os.path.join(out, 'mut_' + file)
    open(f, 'w').write(src.replace(a, b))
    exe = os.path.join(out, 'mut')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, f, *[o for k, o in objs.items() if k != file], '-o', exe], capture_output=True, text=True)
    if c.returncode:
        print(f'{name} : compilation échouée\n{c.stderr[:400]}'); undetected.append(name); continue
    r = subprocess.run([exe, ora, data], capture_output=True, text=True, env={**os.environ, 'STRIDES_TESTS': TESTS[file]})
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
