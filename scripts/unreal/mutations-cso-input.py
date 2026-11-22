#!/usr/bin/env python3
"""Mutations des commandes (tranche T8) : preuve que l'oracle cso_input.json exerce chaque règle de src/core/input.js.

Chaque mutation est appliquée à une copie de StridesCore/Private/CsoInput.cpp (joystick flottant, zone, regard, boutons,
clavier par codes physiques, amplitude Ctrl / Alt, commandes désactivées, relâchement) ou SaveGame.cpp (bascules de la
carte Pause : tracé au sol, aide au saut) ; le source du dépôt n'est jamais modifié. Le banc unreal/core/tests/test_core.cpp est recompilé avec la copie et rejoué sur les oracles exportés du jeu
web. Une mutation doit faire échouer le banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas
détectée, hors des mutations listées dans ATTENDUES (raison donnée) — et aussi si l'une de celles-ci devient détectée.
Code 2 si une mutation n'a pas pu être jouée (motif absent ou en double, compilation échouée), même listée dans ATTENDUES.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  [MUT_ONLY=<texte>] python3 scripts/unreal/mutations-cso-input.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-input.
"""
import subprocess, sys, os
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-input')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
I, S = 'CsoInput.cpp', 'SaveGame.cpp'
M = [
 # Zone et prise du joystick (input.js:40-43, 66-79)
 (I, 'zone : 50 % de la largeur au lieu de 45 %', 'const double zx = viewW * 0.45;', 'const double zx = viewW * 0.5;'),
 (I, 'zone : 25 % de la hauteur au lieu de 30 %', 'const double zy = viewH * 0.3;', 'const double zy = viewH * 0.25;'),
 (I, 'zone : bord gauche inclus (x ≤)', 'return x < zx && y > zy;', 'return x <= zx && y > zy;'),
 (I, 'zone : bord haut inclus (y ≥)', 'return x < zx && y > zy;', 'return x < zx && y >= zy;'),
 (I, 'souris acceptée par le joystick', 'if (type != CsoPointer::Mouse && !joy.on && inJoyZone(x, y, viewW, viewH)) {', 'if (!joy.on && inJoyZone(x, y, viewW, viewH)) {'),
 (I, 'deuxième doigt dans la zone : reprend le joystick', 'if (type != CsoPointer::Mouse && !joy.on && inJoyZone(x, y, viewW, viewH)) {', 'if (type != CsoPointer::Mouse && inJoyZone(x, y, viewW, viewH)) {'),
 (I, 'gestes acceptés commandes désactivées', '  if (!enabled) return;\n  if (type', '  if (type'),
 (I, 'regard : premier pointeur remplacé par le suivant', '  if (!lookPtr.on) {\n    lookPtr.on = true;', '  {\n    lookPtr.on = true;'),
 # Joystick flottant (input.js:113-132)
 (I, 'rayon de l’amplitude 58 -> 60 px', 'const double mag = std::min(1.0, jsHypot(dx, dy) / R);', 'const double mag = std::min(1.0, jsHypot(dx, dy) / 60);'),
 (I, 'joystick fixe : la base ne suit pas le doigt', '  if (d > R) {\n    const double k', '  if (false) {\n    const double k'),
 (I, 'rebasage : base ramenée au doigt (k = 1)', 'const double k = (d - R) / d;', 'const double k = 1;'),
 (I, 'rebasage : direction recalculée oubliée', '    dx = joy.x - joy.ox;\n    dy = joy.y - joy.oy;\n    view.left', '    view.left'),
 (I, 'amplitude non bornée à 1', 'const double mag = std::min(1.0, jsHypot(dx, dy) / R);', 'const double mag = jsHypot(dx, dy) / R;'),
 (I, 'axe vertical non inversé (y écran vers le bas)', 'move.y = -dy / R;', 'move.y = dy / R;'),
 (I, 'Math.hypot de V8 remplacé par std::hypot', 'const double d = jsHypot(dx, dy);', 'const double d = std::hypot(dx, dy);'),
 (I, 'élément : base pas replacée au rebasage', '    view.left = joy.ox;\n    view.top = joy.oy;\n', ''),
 (I, 'élément : translation du bouton oubliée', '  view.knobX = dx;\n  view.knobY = dy;\n', ''),
 (I, 'élément : base posée à l’origine au lieu du doigt', '    view.left = x;\n    view.top = y;\n    updJoy();', '    view.left = 0;\n    view.top = 0;\n    updJoy();'),
 # Regard (input.js:93-101)
 (I, 'regard : facteur 1,25 au doigt -> 1', 'const double k = type == CsoPointer::Mouse ? 1 : 1.25;', 'const double k = 1;'),
 (I, 'regard : position du pointeur non suivie', '    lookPtr.x = x;\n    lookPtr.y = y;\n    lastLookTime', '    lastLookTime'),
 # Levée (input.js:104-110)
 (I, 'levée : move gardé', '    joy.on = false;\n    move.x = move.y = move.mag = 0;\n    restJoy();', '    joy.on = false;\n    restJoy();'),
 (I, 'levée : élément non remis au repos', '    joy.on = false;\n    move.x = move.y = move.mag = 0;\n    restJoy();', '    joy.on = false;\n    move.x = move.y = move.mag = 0;'),
 (I, 'levée : pointeur de regard gardé', '  if (lookPtr.on && id == lookPtr.id) lookPtr.on = false;', ''),
 # Boutons (input.js:135-149)
 (I, 'bouton SAUT accepté commandes désactivées', 'if (!enabled && name != "phone" && name != "pause") return;', 'if (!enabled && name != "phone" && name != "pause" && name != "jump") return;'),
 (I, 'bouton pause ignoré commandes désactivées', 'if (!enabled && name != "phone" && name != "pause") return;', 'if (!enabled && name != "phone") return;'),
 (I, 'bouton : appui non compté (pressed)', '  held.insert(name);\n  pressed.insert(name);\n}', '  held.insert(name);\n}'),
 (I, 'bouton : relâché sans effet', 'void CsoInput::buttonUp(const std::string& name) { held.erase(name); }', 'void CsoInput::buttonUp(const std::string&) {}'),
 # Clavier (input.js:153-174)
 (I, 'clavier : Échap sans action', '{"Escape", "pause"}', '{"Escape", "x"}'),
 (I, 'clavier : Tab sans action', '{"Tab", "phone"}', '{"Tab", "x"}'),
 (I, 'clavier : M sans action', '{"KeyM", "map"}', '{"KeyM", "x"}'),
 (I, 'clavier : Espace sans action', '{"Space", "jump"}', '{"Space", "x"}'),
 (I, 'clavier : répétition retenue commandes désactivées puis réactivées', 'if (enabled && (!repeat || keys.count(code))) keys.insert(code);', 'if (enabled) keys.insert(code);'),
 (I, 'clavier : touche retenue commandes désactivées', 'if (enabled && (!repeat || keys.count(code))) keys.insert(code);', 'if (!repeat || keys.count(code)) keys.insert(code);'),
 (I, 'clavier : répétition comptée comme appui', '    if (down && !repeat) {\n      if (enabled', '    if (down) {\n      if (enabled'),
 (I, 'clavier : carte ignorée commandes désactivées', 'if (enabled || name == "phone" || name == "pause" || name == "map") pressed.insert(name);', 'if (enabled || name == "phone" || name == "pause") pressed.insert(name);'),
 (I, 'clavier : action tenue commandes désactivées', '    if (down && enabled) held.insert(name);', '    if (down) held.insert(name);'),
 # Déplacement du clavier (input.js:177-206)
 (I, 'clavier : W lu comme Z (caractère, AZERTY)', 'if (keys.count("KeyW") || keys.count("ArrowUp")) y += 1;', 'if (keys.count("KeyZ") || keys.count("ArrowUp")) y += 1;'),
 (I, 'clavier : A lu comme Q (caractère, AZERTY)', 'if (keys.count("KeyA") || keys.count("ArrowLeft")) x -= 1;', 'if (keys.count("KeyQ") || keys.count("ArrowLeft")) x -= 1;'),
 (I, 'clavier : flèche bas ignorée', 'if (keys.count("KeyS") || keys.count("ArrowDown")) y -= 1;', 'if (keys.count("KeyS")) y -= 1;'),
 (I, 'clavier : Ctrl gauche 0,5 -> 0,6', 'const double s = walk ? 0.25 : trot ? 0.5 : 1;', 'const double s = walk ? 0.25 : trot ? 0.6 : 1;'),
 (I, 'clavier : Alt gauche 0,25 -> 0,3', 'const double s = walk ? 0.25 : trot ? 0.5 : 1;', 'const double s = walk ? 0.3 : trot ? 0.5 : 1;'),
 (I, 'clavier : Ctrl prioritaire sur Alt', 'const double s = walk ? 0.25 : trot ? 0.5 : 1;', 'const double s = trot ? 0.5 : walk ? 0.25 : 1;'),
 (I, 'clavier : Ctrl droit compté', 'const bool trot = keys.count("ControlLeft") > 0;', 'const bool trot = keys.count("ControlLeft") > 0 || keys.count("ControlRight") > 0;'),
 (I, 'clavier : diagonale non normalisée', 'move.x = (x / m) * s;\n      move.y = (y / m) * s;', 'move.x = x * s;\n      move.y = y * s;'),
 (I, 'clavier : drapeau keyMove non posé', '    if (m > 0) {\n      keyMove = true;', '    if (m > 0) {'),
 (I, 'clavier : lu même joystick pris', '  if (!joy.on) {\n    double x = 0, y = 0;', '  {\n    double x = 0, y = 0;'),
 (I, 'clavier relâché : move gardé', '    } else if (move.mag != 0 && !std::isnan(move.mag) && !virtualMove) {\n      move.x = move.y = move.mag = 0;\n    }', '    }'),
 (I, 'clavier relâché : déplacement virtuel effacé', '} else if (move.mag != 0 && !std::isnan(move.mag) && !virtualMove) {', '} else if (move.mag != 0 && !std::isnan(move.mag)) {'),
 (I, 'désactivé : move gardé par poll', '  if (!enabled) {\n    move.x = move.y = move.mag = 0;\n    look.dx = look.dy = 0;\n  }', '  if (!enabled) {\n    look.dx = look.dy = 0;\n  }'),
 (I, 'désactivé : regard gardé par poll', '  if (!enabled) {\n    move.x = move.y = move.mag = 0;\n    look.dx = look.dy = 0;\n  }', '  if (!enabled) {\n    move.x = move.y = move.mag = 0;\n  }'),
 # Virtuel, fin d'image, relâchement, activation (input.js:210-243)
 (I, 'virtuel : amplitude non bornée', 'const double m = std::min(1.0, jsHypot(x, y));', 'const double m = jsHypot(x, y);'),
 (I, 'virtuel : drapeau gardé à 0, 0', 'virtualMove = x != 0 || y != 0;', 'virtualMove = true;'),
 (I, 'fin d’image : appuis gardés', 'void CsoInput::endFrame() {\n  pressed.clear();', 'void CsoInput::endFrame() {'),
 (I, 'fin d’image : regard gardé', '  pressed.clear();\n  look.dx = 0;\n  look.dy = 0;', '  pressed.clear();'),
 (I, 'releaseAll : touches gardées', '  held.clear();\n  keys.clear();', '  held.clear();'),
 (I, 'releaseAll : appuis effacés aussi', '  held.clear();\n  keys.clear();', '  held.clear();\n  pressed.clear();\n  keys.clear();'),
 (I, 'releaseAll : joystick gardé', '  keys.clear();\n  joy.on = false;\n  lookPtr.on = false;', '  keys.clear();\n  lookPtr.on = false;'),
 (I, 'setEnabled : relâchement même sans changement', 'if (v != enabled) releaseAll();', 'releaseAll();'),
 (I, 'setEnabled : pas de relâchement', 'if (v != enabled) releaseAll();', ''),
 # Carte Pause (screens.js:224-243)
 (S, 'tracé : absent lu comme masqué', 'return !(it != s.end() && it->second == "false");', 'return it != s.end() && it->second == "true";'),
 (S, 'tracé : bascule sans effet sur « false »', 's["courseLine"] = it != s.end() && it->second == "false" ? "true" : "false";', 's["courseLine"] = "false";'),
 (S, 'aide : absente lue comme « button »', 'return it == s.end() || it->second.empty() ? std::string("full") : it->second;', 'return it == s.end() || it->second.empty() ? std::string("button") : it->second;'),
 (S, 'aide : ordre full → off → button', 'static const char* order[] = {"full", "button", "off"};', 'static const char* order[] = {"full", "off", "button"};'),
 (S, 'aide : imposée mais basculée', '  if (locked) return;\n  static const char', '  static const char'),
 (S, 'aide : valeur inconnue gardée', '  s["jumpAid"] = order[(i + 1) % 3];', '  if (i >= 0) s["jumpAid"] = order[(i + 1) % 3];'),
 (S, 'libellé : aide imposée non signalée', '  if (locked) return "aid.locked";\n', ''),
 (S, 'libellé : valeur inconnue affichée comme « complète »', 'return a == "full" || a == "button" || a == "off" ? "aid." + a : std::string();', 'return a == "button" || a == "off" ? "aid." + a : std::string("aid.full");'),
 # Contrôle des remarques (hygiène, 20/11/2026) : deux branches que le contrôle adverse de T8 avait vues passer.
 (I, 'stylet traité comme une souris (joystick)', 'if (type != CsoPointer::Mouse && !joy.on', 'if (type != CsoPointer::Mouse && type != CsoPointer::Pen && !joy.on'),
 (I, 'base suivie dès d = R (d >= R)', '  if (d > R) {\n    const double k = (d - R) / d;', '  if (d >= R) {\n    const double k = (d - R) / d;'),
]
# Mutations qu'aucun oracle ne peut départager (raison donnée) : listées pour mémoire, pas comme des succès.
ATTENDUES = {
 'stylet traité comme une souris (joystick)': 'aucun événement de type « pen » dans cso_input.json ; sans effet en jeu (InputTouch n’envoie jamais Pen)',
 'base suivie dès d = R (d >= R)': 'équivalente : à d = R, k = (d − R) / d = 0, la base ne bouge pas',
}
only = os.environ.get('MUT_ONLY')
if only: M = [m for m in M if only in m[1]]
os.makedirs(out, exist_ok=True)
allc = ('JumpModel.cpp', 'CsoRide.cpp', 'CsoCourse.cpp', 'CsoHorse.cpp', 'CsoFences.cpp', 'CsoRun.cpp', 'CsoHud.cpp', 'CsoCamera.cpp', 'CsoInput.cpp', 'CourseAids.cpp', 'Text.cpp', 'SaveGame.cpp', 'CoursePlan.cpp', 'CsoEntry.cpp', 'Ranking.cpp', 'CsoAudio.cpp', 'HorseCoat.cpp')
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
# broken : mutations non jouées (motif absent ou en double, compilation échouée) : jamais comptées non détectées.
undetected, broken = [], []
# Objets communs compilés une fois (banc et sources non mutées) ; seule la copie mutée est recompilée, puis liée. Seul
# testCsoInput et testCsoPause tournent (STRIDES_TESTS=input,pause, filtre du main du banc) : les autres oracles ne lisent
# ni CsoInput ni les bascules de la carte Pause.
inc = ['-I', os.path.join(core, 'Public')]
objs = {}
for x in ('test_core.cpp',) + allc:
    src = test if x == 'test_core.cpp' else os.path.join(core, 'Private', x)
    o = os.path.join(out, x.replace('.cpp', '.o'))
    c = subprocess.run(['clang++', '-std=c++20', '-O1', *inc, '-c', src, '-o', o], capture_output=True, text=True)
    if c.returncode: sys.exit(f'{x} : compilation échouée\n{c.stderr[:400]}')
    objs[x] = o
env = dict(os.environ, STRIDES_TESTS='input,pause')
for file, name, a, b in M:
    src = open(os.path.join(core, 'Private', file)).read()
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); broken.append(name); continue
    f = os.path.join(out, file)
    open(f, 'w').write(src.replace(a, b))
    exe = os.path.join(out, 'mut')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', *inc, f, *[o for k, o in objs.items() if k != file], '-o', exe], capture_output=True, text=True)
    if c.returncode:
        print(f'{name} : compilation échouée\n{c.stderr[:400]}'); broken.append(name); continue
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
now_detected = [n for n in ATTENDUES if n not in undetected and n not in broken and any(m[1] == n for m in M)]
print(f'{len(M)} mutations, {len(M) - len(undetected) - len(broken)} détectées, {len(undetected)} non détectées, {len(broken)} non jouées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
# Une mutation non jouée ne prouve rien : code 2, même si elle figure dans ATTENDUES.
if broken: print('NON JOUÉES (motif absent ou en double, ou compilation échouée) : ' + ' ; '.join(broken))
sys.exit(2 if broken else 1 if unexpected or now_detected else 0)
