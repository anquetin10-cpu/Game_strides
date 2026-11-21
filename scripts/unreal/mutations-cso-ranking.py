#!/usr/bin/env python3
"""Mutations du portage de l'arrivée et du bilan (tranche T11) : preuve que les oracles départagent la logique.

Chaque mutation est appliquée à une copie de StridesCore/Private/Ranking.cpp (mulberry32, simulateField, rankResults,
carte de bilan, mise en page de la carte), CsoRun.cpp (étape d'enregistrement du meilleur temps, fin de la mission) ou SaveGame.cpp (bestTimes)
— le source du dépôt n'est jamais modifié ; le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et
rejoué (STRIDES_TESTS : seulement les bancs concernés) sur les oracles exportés du jeu web (cso_ranking.json,
cso_result.json, cso_result_layout.json ; cso_runs/ : canal « bl » des bilans, ep.bt des meilleurs temps, fin de la mission). Une mutation doit
faire échouer le banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas détectée, hors des mutations
listées dans ATTENDUES (raison donnée) — et aussi si l'une de celles-ci devient détectée.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-cso-ranking.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-ranking.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-ranking')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
K, R, S = 'Ranking.cpp', 'CsoRun.cpp', 'SaveGame.cpp'
M = [
 # mulberry32 (math.js:20-28) et ToUint32
 (K, 'mulberry32 : pas 0x6d2b79f5 -> 0x6d2b79f4', 'a_ = a_ + 0x6d2b79f5u;', 'a_ = a_ + 0x6d2b79f4u;'),
 (K, 'mulberry32 : a >>> 15 -> 16', '(a_ ^ (a_ >> 15)) * (1u | a_)', '(a_ ^ (a_ >> 16)) * (1u | a_)'),
 (K, 'mulberry32 : 61 | t -> 63 | t', '(61u | t)', '(63u | t)'),
 (K, 'mulberry32 : sortie t >>> 14 -> 13', '(t ^ (t >> 14))', '(t ^ (t >> 13))'),
 (K, 'ToUint32 : graine négative sans modulo', '  if (m < 0) m += 4294967296.0;\n', ''),
 (K, 'ToUint32 : arrondi inférieur au lieu de la troncature', 'const double t = std::trunc(x);', 'const double t = std::floor(x);'),
 # simulateField (ranking.js:8-21)
 (K, 'fautes : seuil 0,34 -> 0,35', 'r < 0.34 ? 0', 'r < 0.35 ? 0'),
 (K, 'fautes : seuil 0,68 -> 0,67', 'r < 0.68 ? 4', 'r < 0.67 ? 4'),
 (K, 'fautes : seuil 0,86 -> 0,85', 'r < 0.86 ? 8', 'r < 0.85 ? 8'),
 (K, 'fautes : seuil 0,95 -> 0,96', 'r < 0.95 ? 12', 'r < 0.96 ? 12'),
 (K, 'am2 : 25 % -> 30 %', 'rnd.next() < 0.25', 'rnd.next() < 0.3'),
 (K, 'am2 : remise de 4 points pour toutes les classes', 'cls.id == "am2" && faults > 0', 'faults > 0'),
 (K, 'am2 : remise sans faute préalable', 'cls.id == "am2" && faults > 0', 'cls.id == "am2" && faults >= 0'),
 (K, 'chrono : ta − 4 -> ta − 3', 'const double a = cls.ta - 4;', 'const double a = cls.ta - 3;'),
 (K, 'chrono : écart × 4,2 -> × 4', 'const double e = s * 4.2;', 'const double e = s * 4.0;'),
 (K, 'chrono : centrage 1,5 -> 1,4', 's = s - 1.5;', 's = s - 1.4;'),
 (K, 'chrono : 0,15 s par point -> 0,1', 'const double g = faults * 0.15;', 'const double g = faults * 0.1;'),
 (K, 'pénalités de temps : arrondi au plus proche', 'std::max(0, (int)std::ceil(over))', 'std::max(0, (int)std::round(over))'),
 (K, 'pénalités de temps : marge 1e-9 omise', '    over = over - 1e-9;\n', ''),
 (K, 'cavalier : prénom entier', 'const std::string first = firstChar(names.first[pick(rnd, names.first.size())]);', 'const std::string first = names.first[pick(rnd, names.first.size())];'),
 (K, 'cavalier : sans point', 'x.rider = first + ". " +', 'x.rider = first + " " +'),
 (K, 'cheval : graine ignorée', 'const double hi = (double)i + fs;', 'const double hi = (double)i;'),
 (K, 'chrono : tronqué au centième', 'x.time = jsRound(c) / 100;', 'x.time = std::floor(c) / 100;'),
 # rankResults (ranking.js:23-25)
 (K, 'classement : chrono avant les points', 'return a.faults != b.faults ? a.faults < b.faults : a.time < b.time;', 'return a.time != b.time ? a.time < b.time : a.faults < b.faults;'),
 (K, 'classement : égalité, le joueur d’abord', 'return a.faults != b.faults ? a.faults < b.faults : a.time < b.time;', 'return a.faults != b.faults ? a.faults < b.faults : a.time != b.time ? a.time < b.time : a.me && !b.me;'),
 (K, 'classement : tri non stable', 'std::stable_sort(v.begin(), v.end(),', 'std::sort(v.begin(), v.end(),'),
 # Carte de bilan (courses.js:372-424)
 (K, 'joueur : chrono non arrondi', 'me.time = jsRound(tc) / 100;', 'me.time = st.t;'),
 (K, 'graine : manche × 31 -> × 30', '(double)st.attempt * 31;', '(double)st.attempt * 30;'),
 (K, 'graine : opts.result.seed ignorée', '(res.hasSeed ? res.seed : 7.0)', '7.0'),
 (K, 'éliminé : classé quand même', '  if (!c.out) field.push_back(me);', '  field.push_back(me);'),
 (K, 'cheval absent : nom vide', 'me.horse = in.hasHorse && !in.horseName.empty() ? in.horseName : t("Cheval");', 'me.horse = in.horseName;'),
 (K, 'récompense : « hors dotation » pour l’éliminé', 'c.out ? t("aucune (éliminé)") : t("hors dotation")', 't("hors dotation")'),
 (K, 'fautes : cause sans minuscules', '" (" + jsLower(l.causeText) + ")"', '" (" + l.causeText + ")"'),
 (K, 'fautes : refus écrit comme une barre', 'if (l.kind == "refusal") faultsTxt', 'if (l.kind == "refus") faultsTxt'),
 (K, 'fautes : séparateur « ; »', 'joined += (i ? ", " : "")', 'joined += (i ? "; " : "")'),
 (K, 'tableau : 7 premiers', 'i < c.ranked.size() && i < 8; i++', 'i < c.ranked.size() && i < 7; i++'),
 (K, 'tableau : joueur au-delà du 8e omis', '  if (c.rank && meAt >= 8) rows.push_back((size_t)meAt);\n', ''),
 (K, 'tableau : séparateur cavalier · cheval', 'r.name = x.rider + " · " + x.horse;', 'r.name = x.rider + " - " + x.horse;'),
 (K, 'tableau : chrono à un chiffre', 'r.time = dec(x.time, 2, lang) + " s";', 'r.time = dec(x.time, 1, lang) + " s";'),
 (K, 'grille : chrono de l’éliminé affiché', '{t("Chrono"), c.out ? std::string("—")', '{t("Chrono"), false ? std::string("—")'),
 (K, 'grille : total sans les pénalités de temps', 'c.total = st.faults + st.timeFaults;', 'c.total = st.faults;'),
 (K, 'grille : classement « sur » n − 1', 'jsInt(c.fieldSize)}', 'jsInt(c.fieldSize - 1)}'),
 (K, 'titre : 2e = victoire', ': c.rank == 1 ? (c.total == 0', ': c.rank <= 2 ? (c.total == 0'),
 (K, 'titre : sans-faute non signalé', ': c.total == 0 ? T("Sans faute · {0}"', ': false ? T("Sans faute · {0}"'),
 (K, 'kicker : manche affichée dès la 1re', 'st.attempt > 1 ? T(" · manche {0}"', 'st.attempt > 0 ? T(" · manche {0}"'),
 (K, 'kicker : titre de l’épreuve au lieu de res.title', 'res.title.empty() ? tt.t(in.courseTitle, lang) : tt.t(res.title, lang)', 'tt.t(in.courseTitle, lang)'),
 (K, 'boutons : Quitter non principal', 'tt.t(res.continueLabel, lang), true}}', 'tt.t(res.continueLabel, lang), false}}'),
 (K, 'boutons : libellé Continuer imposé', 'res.continueLabel.empty() ? t("Continuer") : tt.t(res.continueLabel, lang)', 't("Continuer")'),
 # Contrôle adverse de T11 : sous-branches départagées par les états « victoire-fautes » et « neuvieme » de cso_result.json
 (K, 'titre : vainqueur avec des fautes « sans faute »', ': t("Victoire !"))', ': t("Victoire, sans faute !"))', 'result'),
 (K, 'tableau : joueur exactement 9e omis', 'c.rank && meAt >= 8', 'c.rank && meAt >= 9', 'result'),
 # Mise en page de la carte (csoResultLayout : flux CSS, colonnes du tableau, défilement, classe more)
 (K, 'mise en page : rangée de la grille sans décalage des suivantes', '    dy += k.h - h0;\n', '', 'layout'),
 (K, 'mise en page : rangée de la grille toujours sur une ligne', 'k.h = v.h = h0 * std::max(1, n);', 'k.h = v.h = h0;', 'layout'),
 (K, 'mise en page : lignes de la clé ignorées', 'std::max(i < in.keyLines.size() ? in.keyLines[i] : 1, i < in.valueLines.size() ? in.valueLines[i] : 1)', '(i < in.valueLines.size() ? in.valueLines[i] : 1)', 'layout'),
 (K, 'mise en page : tableau non décalé par la grille', 'o.table.y = b.table.y + dy;', 'o.table.y = b.table.y;', 'layout'),
 (K, 'mise en page : lignes du tableau de 24 px', 'const double step = b.rows.empty() ? 0 : b.rows[0].h;', 'const double step = b.rows.empty() ? 0 : b.rows[0].h - 1;', 'layout'),
 (K, 'mise en page : 8 lignes de tableau au plus', 'const size_t n = in.cellText.size();', 'const size_t n = std::min<size_t>(in.cellText.size(), 8);', 'layout'),
 (K, 'colonnes : padding omis', 'm[k] = std::max(m[k], row[k] + b.cellPad[k]);', 'm[k] = std::max(m[k], row[k]);', 'layout'),
 (K, 'colonnes : largeurs égales', 'ws[k] = sum > 0 ? m[k] * b.table.w / sum : b.table.w / (double)nc;', 'ws[k] = b.table.w / (double)nc;', 'layout'),
 (K, 'colonnes : texte de la dernière ligne seulement', 'for (size_t k = 0; k < nc && k < row.size(); k++) m[k] = std::max(m[k], row[k] + b.cellPad[k]);', 'for (size_t k = 0; k < nc && k < row.size(); k++) m[k] = row[k] + b.cellPad[k];', 'layout'),
 (K, 'défilement : padding-bottom omis', 'o.table.h - b.body.y + b.padBottom);', 'o.table.h - b.body.y);', 'layout'),
 (K, 'défilement : hauteur tronquée', 'o.scrollHeight = (int)std::round(', 'o.scrollHeight = (int)std::floor(', 'layout'),
 (K, 'défilement : hauteur arrondie au-dessus', 'o.scrollHeight = (int)std::round(', 'o.scrollHeight = (int)std::ceil(', 'layout'),
 (K, 'défilement maximal : hauteur visible ignorée', 'std::max(0.0, (double)scrollHeight - clientHeight)', 'std::max(0.0, (double)scrollHeight)', 'layout'),
 (K, 'classe more : position du défilement ignorée', '(double)scrollHeight - scrollTop - clientHeight > 4', '(double)scrollHeight - clientHeight > 4', 'layout'),
 (K, 'classe more : seuil 4 px -> 0', '(double)scrollHeight - scrollTop - clientHeight > 4', '(double)scrollHeight - scrollTop - clientHeight > 0', 'layout'),
 # Déroulé (CsoRun) : bilan, enregistrement du meilleur temps (activities.js:111-129), fin de la mission
 (R, 'enregistrement : pénalités omises', 'const double score = st_.t + pen;', 'const double score = st_.t;'),
 (R, 'enregistrement : pénalités de temps omises', '(double)(st_.faults + st_.timeFaults)', '(double)st_.faults'),
 (R, 'enregistrement : étape absente', '  if (cfg_.record) steps_.push_back(CsoStep::Record);\n', ''),
 (R, 'enregistrement : rien écrit', '      record_.rec = noBest || score < cfg_.best;', '      record_.rec = false;'),
 (R, 'enregistrement : après une élimination aussi', '      if (st_.eliminated) break;\n      const double pen', '      const double pen'),
 (R, 'enregistrement : égalité comptée comme record', 'score < cfg_.best;', 'score <= cfg_.best;'),
 (R, 'fin de mission : consigne non effacée', '    hud("clearHint", {});\n    hud("closeDialog", {});', '    hud("closeDialog", {});'),
 (R, 'bilan : jamais ouvert', '      resultOpened_ = true;', '      resultOpened_ = false;'),
 # Sauvegarde (save.js bestTimes)
 (S, 'sauvegarde : bestTimes non écrit', 'for (auto& [k, v] : bestTimes) { o <<', 'for (auto& [k, v] : std::map<std::string, double>()) { o <<'),
 (S, 'sauvegarde : bestTimes non relu', '  for (auto& [k, v2] : j["bestTimes"].o) if (v2.t == J::Num) s.bestTimes[k] = v2.n;\n  for (auto& [k, v2] : j["settings"].o) s.settings[k] = v2.s;', '  for (auto& [k, v2] : j["settings"].o) s.settings[k] = v2.s;'),
 (S, 'import web : bestTimes ignoré', '  for (auto& [k, v2] : j["bestTimes"].o) if (v2.t == J::Num) s.bestTimes[k] = v2.n;\n  for (auto& [k, r] : j["challenges"]', '  for (auto& [k, r] : j["challenges"]'),
]
# Bancs rejoués par fichier muté (les autres ne lisent pas le code muté) ; une mutation peut nommer les siens (5e champ :
# carte de bilan → result, mise en page → layout).
TESTS = {K: 'ranking,result,layout,csoruns', R: 'csoruns', S: 'save'}
# Sous-branches qu'aucun oracle exporté du web ne départage (déclarées dans l'inventaire : activites.parcours-pole pour
# l'enregistrement, cso.classement-simule pour le tirage et le tri, cso.bilan pour la carte et sa mise en page) : les exécutions de cso_runs/ partent d'une sauvegarde neuve (aucun meilleur temps), ne quittent
# jamais l'épreuve après une élimination et n'ont pas de pénalité de temps à l'arrivée.
ATTENDUES = {
 'enregistrement : pénalités de temps omises': 'aucune exécution enregistrée avec une pénalité de temps (t11-refus : 4 points de refus, 0 de temps ; t11-manche-2 : 0)',
 'enregistrement : après une élimination aussi': 'aucune exécution ne touche « Quitter l’épreuve » après une élimination',
 'enregistrement : égalité comptée comme record': 'sauvegarde neuve à chaque exécution : aucun meilleur temps à égaler',
 'classement : tri non stable': 'libc++ trie les tableaux de moins de 31 éléments par insertion (tri stable) : 15 engagés au plus dans les oracles',
 'pénalités de temps : marge 1e-9 omise': 't − ta jamais entier (à 1e-9 près) parmi les engagés tirés par les graines de l’oracle',
 'joueur : chrono non arrondi': 'chrono du joueur jamais à moins d’un demi-centième de celui d’un engagé dans les oracles ; affichage dec(…, 2) inchangé',
 'mise en page : lignes de la clé ignorées': 'les lignes de chaque case sont tirées de la hauteur de sa boîte dans le navigateur, où clé et valeur sont étirées à la hauteur de la rangée (même nombre de lignes) ; aucune clé ne passe sur deux lignes dans le web',
 'défilement : hauteur arrondie au-dessus': 'bas du tableau + padding-bottom toujours à x,5 ou x,8 px dans les oracles (lignes de 25 px, boîtes relevées à 0,5 ou 0,8 px) : arrondi et arrondi au-dessus donnent le même entier',
 'classe more : seuil 4 px -> 0': 'aucun état ne laisse entre 0 et 4 px à défiler (en haut : plus de 100 px ; défilé jusqu’en bas : 0)',
}
os.makedirs(out, exist_ok=True)
srcs = {f: open(os.path.join(core, 'Private', f)).read() for f in (K, R, S)}
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
# Témoin : le banc passe sans mutation (sinon aucune détection n'a de sens).
exe = os.path.join(out, 'mut')
c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, *objs.values(), '-o', exe], capture_output=True, text=True)
if c.returncode: sys.exit(f'édition des liens du témoin échouée\n{c.stderr[:600]}')
for f, sel in TESTS.items():
    r = subprocess.run([exe, ora, data], capture_output=True, text=True, env={**os.environ, 'STRIDES_TESTS': sel})
    if r.returncode: sys.exit(f'témoin ({sel}) en échec sans mutation : {r.stdout.strip().splitlines()[-1:]}')
print('témoin : banc vert sans mutation', flush=True)
undetected = []
for mut in M:
    file, name, a, b = mut[:4]
    sel = mut[4] if len(mut) > 4 else TESTS[file]
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
