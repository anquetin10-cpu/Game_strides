#!/usr/bin/env python3
"""Mutations de l'interface d'épreuve (tranche T7) : preuve que les oracles exercent chaque règle du HUD et du mot d'appel.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoHud.cpp (modèle du HUD : toasts, grand message,
astuce, mot d'appel, crans de cadence, classes, masquages) ou CsoRun.cpp (choix du mot d'appel, courses.js:203-211) ; le
source du dépôt n'est jamais modifié. Le banc unreal/core/tests/test_core.cpp est recompilé avec la copie et rejoué sur
les oracles exportés du jeu web (cso_hud.json, cso_feedback.json, cso_runs/ ; Content/Data/hud_cso_style.json). Une
mutation doit faire échouer le banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas détectée, hors
des mutations listées dans ATTENDUES (raison donnée) — et aussi si l'une de celles-ci devient détectée.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-cso-hud.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-hud.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-hud')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
H, R = 'CsoHud.cpp', 'CsoRun.cpp'
M = [
 # Toasts (hud.js:444-450)
 (H, 'toasts : écran bas au-dessous de 390 px (et non ≤ 420)', 'const size_t max = vh_ <= 420 ? 1 : 2;', 'const size_t max = vh_ < 390 ? 1 : 2;'),
 (H, 'toasts : trois sur écran haut', 'const size_t max = vh_ <= 420 ? 1 : 2;', 'const size_t max = vh_ <= 420 ? 1 : 3;'),
 (H, 'toasts : durée 3200 -> 3000 ms', 'schedule(3200, TimerKind::ToastRemove, id);', 'schedule(3000, TimerKind::ToastRemove, id);'),
 (H, 'toasts : le plus récent retiré au lieu du plus ancien', 'while (toasts_.size() > max) toasts_.erase(toasts_.begin());', 'while (toasts_.size() > max) toasts_.erase(toasts_.end() - 1);'),
 (H, 'toasts : classe ignorée', 'toasts_.push_back({id, text, kind});', 'toasts_.push_back({id, text, std::string()});'),
 # Grand message (hud.js:452-467)
 (H, 'grand message : temporisation précédente non annulée', '  cancel(bigT_);\n  bigT_ = schedule(ms, TimerKind::BigHide);', '  bigT_ = schedule(ms, TimerKind::BigHide);'),
 (H, 'grand message : marge de big-on 400 -> 0 ms', 'bigT_ = schedule(400, TimerKind::BigOnOff);', 'bigT_ = schedule(0, TimerKind::BigOnOff);'),
 (H, 'grand message : big-on non posé', '  bigOn_ = true;\n  cancel(bigT_);', '  cancel(bigT_);'),
 (H, 'grand message : durée par défaut 2200 -> 2000 ms (appel sans durée)', 'else if (c.fn == "big") big(str(0, ""), str(1, ""), num(2, 2200));', 'else if (c.fn == "big") big(str(0, ""), str(1, ""), num(2, 2000));'),
 # Astuce (hud.js:469-475, 166-172)
 (H, 'astuce : durée nulle traitée comme une durée', 'if (ms != 0 && !std::isnan(ms)) hintT_ = schedule(ms, TimerKind::HintOff);', 'if (!std::isnan(ms)) hintT_ = schedule(ms, TimerKind::HintOff);'),
 (H, 'astuce : temporisation précédente non annulée', '  cancel(hintT_);\n  hintT_ = 0;\n', ''),
 (H, 'astuce : clearHint sans effet', 'void CsoHud::clearHint() { hintOff_ = true; }', 'void CsoHud::clearHint() {}'),
 (H, 'astuce : durée par défaut 4500 -> 4000 ms', 'else if (c.fn == "hint") hint(str(0, ""), num(1, 4500));', 'else if (c.fn == "hint") hint(str(0, ""), num(1, 4000));'),
 (H, 'astuce : placement sans le tableau (cso-on)', 'hintInline_ = !objOff_ && !csoOn_;', 'hintInline_ = !objOff_;'),
 (H, 'objectif : astuce non replacée', '  objOff_ = !present;\n  placeHint();', '  objOff_ = !present;'),
 # Mot d'appel (hud.js:420-430)
 (H, 'mot d’appel : durée 1500 -> 1000 ms', 'fbT_ = schedule(1500, TimerKind::FbOff);', 'fbT_ = schedule(1000, TimerKind::FbOff);'),
 (H, 'mot d’appel : texte vide accepté', '  if (text.empty()) return;\n  fbText_ = text;', '  fbText_ = text;'),
 (H, 'mot d’appel : texte gardé une fois masqué', '      fbOff_ = true;\n      fbText_.clear();', '      fbOff_ = true;'),
 (H, 'mot d’appel : genre par défaut ok -> good', 'else if (c.fn == "jumpFeedback") jumpFeedback(str(0, ""), str(1, "ok"));', 'else if (c.fn == "jumpFeedback") jumpFeedback(str(0, ""), str(1, "good"));'),
 # Crans de cadence (hud.js:394-406)
 (H, 'crans : affichés 1 s au lieu de 2', '      cadT_ = 2;', '      cadT_ = 1;'),
 (H, 'crans : réglage au joystick ignoré', 'if (!hasCad_ || f.cadAdjust) {', 'if (!hasCad_) {'),
 (H, 'crans : arrondi par défaut (floor)', 'const double n = jsRound((f.cadence / 8) * 6);', 'const double n = std::floor((f.cadence / 8) * 6);'),
 (H, 'Math.round : égalité vers le bas', 'if (x - r >= 0.5) r += 1.0;', 'if (x - r > 0.5) r += 1.0;'),
 (H, 'crans : état gardé quand la cadence disparaît (ré-amorçage perdu)', '  } else\n    hasCad_ = false;', '  }'),
 # Classes et tableau (hud.js:381-414)
 (H, 'HUD sobre sans le genre d’épreuve', 'csoSober_ = csoCtl_ && f.kindCso;', 'csoSober_ = csoCtl_;'),
 (H, 'commandes de concours sans game.course', 'csoCtl_ = f.course && f.controlsCso;', 'csoCtl_ = f.controlsCso || f.course;'),
 (H, 'tableau sans game.course', 'const bool ci = f.course && f.board;', 'const bool ci = f.board;'),
 (H, 'pénalités en rouge dès 0 point', 'faults_ = f.info.pen > 0;', 'faults_ = f.info.pen >= 0;'),
 (H, 'temporisations : ordre de création inversé à échéance égale', 'return a.due != b.due ? a.due < b.due : a.seq < b.seq;', 'return a.due != b.due ? a.due < b.due : a.seq > b.seq;'),
 (H, 'temporisations : échéance strictement passée', 'if (it == timers_.end() || it->due > target) break;', 'if (it == timers_.end() || it->due >= target) break;'),
 # Masquages (styles.css:150, 244, 988-997)
 (H, 'masquage : portefeuille visible sous big-on', 'case CsoHudElement::Wallet: return csoCtl || bigOn;', 'case CsoHudElement::Wallet: return csoCtl;'),
 (H, 'masquage : objectif visible sous big-on', 'case CsoHudElement::Objective: return csoOn || bigOn;', 'case CsoHudElement::Objective: return csoOn;'),
 (H, 'masquage : astuce visible sous big-on', 'case CsoHudElement::Hint: return bigOn;', 'case CsoHudElement::Hint: return false;'),
 (H, 'masquage : minicarte gardée en concours', '    case CsoHudElement::Minimap:\n', ''),
 (H, 'masquage : télémétrie gardée en épreuve sobre', '    case CsoHudElement::Telemetry:\n', ''),
 # Mot d'appel (courses.js:203-211)
 (R, 'mot d’appel : aide « off » ignorée', 'if (!cso || aid == "off") return false;', 'if (!cso) return false;'),
 (R, 'mot d’appel : dernier saut d’un autre obstacle accepté', 'std::string q = last.has && last.num == num ? last.quality : std::string();', 'std::string q = last.has ? last.quality : std::string();'),
 (R, 'mot d’appel : saut trop court -> trop près', 'cause == "short" ? "far"', 'cause == "short" ? "near"'),
 (R, 'mot d’appel : trop vite gardé tel quel', 'cause == "fast" ? "far" : cause', 'cause'),
 (R, 'mot d’appel : sur barre, appel parfait gardé', '(q == "perfect" || q == "good" ? std::string() : q)', 'q'),
 (R, 'mot d’appel : sans-faute loin non adouci', '  else if (q == "far") q = "bitFar";\n', ''),
 (R, 'mot d’appel : sans-faute tout contre non adouci', 'else if (q == "near" || q == "tooClose") q = "bitNear";', 'else if (q == "near") q = "bitNear";'),
 (R, 'mot d’appel : genre good pour tout sans-faute', 'kind = clear ? (q == "perfect" || q == "good" ? "good" : "ok") : "bad";', 'kind = clear ? "good" : "bad";'),
 (R, 'mot d’appel : absent sur sans-faute', '      feedback(num, true, std::string());\n', ''),
 (R, 'mot d’appel : absent sur barre', '      feedback(num, false, cause);\n', ''),
]
# Mutations qu'aucun oracle ne peut départager (raison donnée) : listées pour mémoire, pas comme des succès.
ATTENDUES = {
}
os.makedirs(out, exist_ok=True)
allc = ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'CsoHud.cpp', 'CsoCamera.cpp', 'Text.cpp', 'SaveGame.cpp')
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
undetected = []
for file, name, a, b in M:
    src = open(os.path.join(core, 'Private', file)).read()
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
