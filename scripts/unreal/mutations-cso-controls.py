#!/usr/bin/env python3
"""Mutations des commandes d'épreuve dans le module de jeu (tranche T8, contrôle adverse) : preuve que le test moteur
Strides.Cso.Controls exerce le chemin réel du doigt (AStridesPlayerController::InputTouch : px du viewport divisés par le
facteur de pixels, identifiant par doigt et par appareil, types de toucher), le gel en pause et au téléphone image par
image (ORA/cso_freeze.json) et le retrait des allures du portage en épreuve.

Le module de jeu est compilé par UnrealBuildTool à partir des sources du dépôt : chaque mutation est écrite dans le
fichier source, le module est recompilé, le test est joué (UnrealEditor -nullrhi), puis le fichier d'origine est
TOUJOURS remis octet pour octet (finally, contrôle par empreinte) ; à la fin, le module d'origine est recompilé. Une
mutation doit faire échouer le test (Result={Fail}, ou aucun résultat) ; le script sort en code 1 si l'une passe.

Usage (DEVELOPER_DIR réglé sur Xcode ; une seule instance d'UnrealEditor) :
  [MUT_ONLY=<texte>] [MUT_FROM=<numéro>] python3 scripts/unreal/mutations-cso-controls.py [dossier de travail]
Défaut : build/mutations-controls (journaux des tests).
"""
import hashlib, os, subprocess, sys

repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
out = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'build/mutations-controls')
src = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesGrandTour')
proj = os.path.join(repo, 'unreal/StridesGrandTour/StridesGrandTour.uproject')
UE = '/Users/Shared/Epic Games/UE_5.8'
BUILD = [f'{UE}/Engine/Build/BatchFiles/Mac/Build.sh', 'StridesGrandTourEditor', 'Mac', 'Development', f'-project={proj}', '-WaitMutex']
EDITOR = f'{UE}/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor'
TEST = 'Strides.Cso.Controls'
PC, PCH, HO = 'Private/StridesPlayerController.cpp', 'Public/StridesPlayerController.h', 'Private/StridesHorse.cpp'

# (fichier, nom, [(texte d'origine, texte muté), ...]) : chaque texte d'origine doit apparaître une seule fois.
M = [
 # Chemin du doigt (InputTouch)
 (PC, 'px du viewport non divisés par le facteur de pixels', [('const FVector2D Css = TouchLocation / UStridesCsoHud::PixelRatio();', 'const FVector2D Css = TouchLocation;')]),
 (PC, 'identifiant du doigt sans l’appareil', [('return (int64)TouchId.GetIndex() + 100 * (int64)TouchId.GetDeviceId().GetId();', 'return (int64)TouchId.GetIndex();')]),
 (PC, 'Began ignoré', [('Name = TEXT("Began"); FeedPointerDown(Id, false, Css); break;', 'Name = TEXT("Began"); break;')]),
 (PC, 'Moved ignoré', [('Name = TEXT("Moved"); FeedPointerMove(Id, false, Css); break;', 'Name = TEXT("Moved"); break;')]),
 (PC, 'FirstMove ignoré', [('Name = TEXT("FirstMove"); FeedPointerMove(Id, false, Css); break;', 'Name = TEXT("FirstMove"); break;')]),
 (PC, 'Stationary traité comme Moved', [('Name = TEXT("Stationary"); break;', 'Name = TEXT("Stationary"); FeedPointerMove(Id, false, Css); break;')]),
 (PC, 'ForceChanged traité comme Moved', [('Name = TEXT("ForceChanged"); break;', 'Name = TEXT("ForceChanged"); FeedPointerMove(Id, false, Css); break;')]),
 (PC, 'Ended ignoré', [('Name = TEXT("Ended"); FeedPointerUp(Id); break;', 'Name = TEXT("Ended"); break;')]),
 # Gel en pause et au téléphone (game.js:1444-1445, 1462-1467, 1488, 1507, boucle 1406)
 (PC, 'simPaused relevé après les boutons globaux', [
   ('	bSimPausedFrame = bPhoneOpen || bOverlay;\n', ''),
   ('	const bool bCanAct = !bPhoneOpen && !bOverlay;\n', '	bSimPausedFrame = bPhoneOpen || bOverlay;\n	const bool bCanAct = !bPhoneOpen && !bOverlay;\n')]),
 (PCH, 'simPaused vivant, pause comprise (portage d’avant le contrôle)', [('bool IsSimPaused() const { return bSimPausedFrame; }', 'bool IsSimPaused() const { return bPhoneOpen || bPausedState; }')]),
 (PCH, 'pause dès l’image d’Échap', [('bool SkipsUpdate() const { return bPausedState && !bPauseThisFrame; }', 'bool SkipsUpdate() const { return bPausedState; }')]),
 (PC, 'Échap avec le téléphone ouvert : pause au lieu de fermer', [('		if (bPhoneOpen) ClosePhone();\n		else PauseGame();', '		PauseGame();')]),
 (HO, 'chrono (sdt) non figé téléphone ouvert', [('	const float HDt = bSimPaused ? 0.f : Dt;\n	const float SDt = bSimPaused ? 0.f : Dt;', '	const float HDt = bSimPaused ? 0.f : Dt;\n	const float SDt = Dt;')]),
 (HO, 'cheval (hdt) non figé téléphone ouvert', [('const float HDt = bSimPaused ? 0.f : Dt;', 'const float HDt = Dt;')]),
 # Allures du portage sans effet en épreuve
 (PC, 'Maj : allure + en épreuve', [('H && !InRace()) H->ChangeGait(1);', 'H) H->ChangeGait(1);')]),
 (PC, 'Ctrl : allure − en épreuve', [('H && !InRace()) H->ChangeGait(-1);', 'H) H->ChangeGait(-1);')]),
]

env = dict(os.environ, DEVELOPER_DIR=os.environ.get('DEVELOPER_DIR', '/Applications/Xcode.app/Contents/Developer'))
os.makedirs(out, exist_ok=True)


def build():
  r = subprocess.run(BUILD, env=env, capture_output=True, text=True)
  return 'Result: Succeeded' in r.stdout, r.stdout[-3000:]


def run_test(tag):
  log = os.path.join(out, f'{tag}.log')
  with open(log, 'w') as f:
    subprocess.run([EDITOR, proj, f'-ExecCmds=Automation RunTests {TEST}; Quit', '-unattended', '-nullrhi', '-nosplash', '-log', '-stdout'], env=env, stdout=f, stderr=subprocess.STDOUT)
  text = open(log, errors='replace').read()
  if f'Result={{Success}} Name={{Controls}} Path={{{TEST}}}' in text: return 'passe', log
  if f'Path={{{TEST}}}' in text: return 'échoue', log
  return 'aucun résultat', log


def sha(b):
  return hashlib.sha256(b).hexdigest()


ok, tail = build()
if not ok: sys.exit('module d’origine non compilé :\n' + tail)
st, log = run_test('origine')
if st != 'passe': sys.exit(f'test d’origine : {st} ({log})')
print(f'origine : {TEST} passe')
only = os.environ.get('MUT_ONLY')
missed, done, detected = [], 0, 0
for i, (rel, name, subs) in enumerate(M):
  if only and only not in name: continue
  if i + 1 < int(os.environ.get('MUT_FROM', '1')): continue
  path = os.path.join(src, rel)
  orig = open(path, 'rb').read()
  text = orig.decode('utf8')
  for a, b in subs:
    if text.count(a) != 1: sys.exit(f'mutation « {name} » : texte d’origine trouvé {text.count(a)} fois dans {rel}')
    text = text.replace(a, b)
  try:
    open(path, 'wb').write(text.encode('utf8'))
    ok, tail = build()
    if not ok:
      print(f'{i + 1:2d}. NON COMPILÉE  {name}\n{tail}')
      missed.append(name)
      continue
    st, log = run_test(f'm{i + 1:02d}')
    done += 1
    det = st != 'passe'
    detected += det
    if not det: missed.append(name)
    print(f'{i + 1:2d}. {"détectée " if det else "NON DÉTECTÉE"}  {name}  ({st})')
  finally:
    open(path, 'wb').write(orig)
    assert sha(open(path, 'rb').read()) == sha(orig), f'{rel} non restauré'
ok, tail = build()
print(f'{done} mutation(s) jouée(s), {detected} détectée(s) ; module d’origine recompilé : {"oui" if ok else "NON"}')
if missed or not ok:
  for m in missed: print('  non détectée :', m)
  sys.exit(1)
