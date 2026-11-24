#!/usr/bin/env python3
"""Mutations du niveau B de l'essai de monte (voie A, étape M3) : preuve que les tests départagent la phase de foulée du
web portée en C++ (StridesCore/HorsePhase.cpp : pjlHorse.js circularOffset, _calibrate, _snapshot ; pjl/view.js), son
adaptateur Unreal (StridesHorseTack.cpp : clip d'allure joué, allure et main du jeu), l'état du cheval lu par la règle
(StridesRiderRig.cpp SampleFromTack) et le rejeu sur le cheval Unreal (StridesRiderReplay.cpp).

Deux niveaux, comme scripts/unreal/mutations-horse-mirror.py.
- « cœur » : la mutation est appliquée à une copie de HorsePhase.cpp (le source du dépôt n'est pas touché), reliée au banc
  unreal/core/tests/test_horse_tack.cpp (ctest « monte-cheval » : calage contre le jeu, phase contre hz.ph d'O1) avec
  HorseTack.cpp ; elle doit le faire échouer.
- « moteur » (option --moteur) : mutation appliquée AU SOURCE DU DÉPÔT, Unreal Build Tool recompile, l'éditeur rejoue
  Strides.Parite.RiderOnHorse, puis le source est rétabli (try/finally) et une dernière compilation remet le module à
  l'identique ; le script vérifie à la fin que les sources mutés n'ont plus aucune différence avec leur contenu initial.

Code de sortie 1 si une mutation n'est pas détectée hors de la liste ATTENDUES (raison donnée), si l'une de celles-ci
devient détectée, ou si un témoin non muté ne passe pas.

Usage (DEVELOPER_DIR réglé sur Xcode) : python3 scripts/unreal/mutations-rider-on-horse.py [--moteur] [--noms=a|b] [--sortie=dossier]
Défaut de sortie : .ue-cache/travail/mutations-rider-on-horse (exclu de git).
"""
import os
import subprocess
import sys
import time
import ue_travail

repo = ue_travail.REPO
arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}
out = os.path.abspath(arg.get('--sortie', ue_travail.sortie('mutations-rider-on-horse')))
MOTEUR = bool(arg.get('--moteur'))
NOMS = [n for n in str(arg.get('--noms', '')).split('|') if n]
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
game = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesGrandTour')
PHASE_CPP = os.path.join(core, 'Private/HorsePhase.cpp')
TACK_CORE = os.path.join(core, 'Private/HorseTack.cpp')
TACK_CPP = os.path.join(game, 'Private/StridesHorseTack.cpp')
RIG_CPP = os.path.join(game, 'Private/StridesRiderRig.cpp')
REPLAY_CPP = os.path.join(game, 'Private/StridesRiderReplay.cpp')
ora = os.path.join(repo, 'unreal/core/tests/oracles/monte')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
test = os.path.join(repo, 'unreal/core/tests/test_horse_tack.cpp')

C, E = 'cœur', 'moteur'
M = [
 # Calage des clips (pjlHorse.js circularOffset, _calibrate)
 (C, PHASE_CPP, 'calage : écart circulaire de signe inversé', 'const double d = (a[i] - b[i]) * kPi * 2;', 'const double d = (b[i] - a[i]) * kPi * 2;'),
 (C, PHASE_CPP, 'calage : résidu sans valeur absolue', 'res += std::fabs(d);', 'res += d;'),
 (C, PHASE_CPP, 'calage : appuis sans le décalage gaitInfo', 'sim.push_back(wrap01(x - inf->second));', 'sim.push_back(wrap01(x));'),
 (C, PHASE_CPP, 'calage : main gauche calée sur le clip d’origine', 'm.align["canter" + left] = fit("canter_M", "canter" + left, "canter");', 'm.align["canter" + left] = fit("canter", "canter" + left, "canter");'),
 (C, PHASE_CPP, 'calage : leadSwap sans la marge de 0,02', 'm.leadSwap = r.ok && l.ok && l.res + 0.02 < r.res;', 'm.leadSwap = r.ok && l.ok && l.res - 0.5 < r.res;'),
 # Phase lue par le cavalier (pjlHorse.js _snapshot, view.js)
 (C, PHASE_CPP, 'phase : décalage gaitInfo ajouté au lieu de retiré', 'const double ph = wrap01(clipPhase - inf->second);', 'const double ph = wrap01(clipPhase + inf->second);'),
 (C, PHASE_CPP, 'phase : calage align ignoré', 'st.animPhase = wrap01(ph - al->second.off);', 'st.animPhase = ph;'),
 (C, PHASE_CPP, 'phase : clé de main inversée', '(lead == \'L\' ? "L" : "R")', '(lead == \'L\' ? "R" : "L")'),
 (C, PHASE_CPP, 'phase : grand galop dès 6,8 m/s', 'speed > m.gallopAbove ? "gallop" : "canter"', 'speed > m.gallopAbove - 3 ? "gallop" : "canter"'),
 (C, PHASE_CPP, 'phase : réécrite aussi pendant le saut', '&& !jumping && speed > m.minSpeed', '&& speed > m.minSpeed'),
 (C, PHASE_CPP, 'phase : réécrite aussi à l’arrêt', '&& !jumping && speed > m.minSpeed', '&& !jumping'),
 # Adaptateur Unreal : clip d'allure joué, allure et main du jeu
 (E, TACK_CPP, 'adaptateur : phase du clip décalée de 0,1', 'Phase = FMath::Frac(Ly.Time / Len);', 'Phase = FMath::Frac(Ly.Time / Len + 0.1);'),
 (E, TACK_CPP, 'adaptateur : première couche prise même hors allure', 'if (Len <= 0 || strides::phase::clipFamily(TCHAR_TO_UTF8(*Web)).empty()) continue;', 'if (Len <= 0) continue;'),
 (E, TACK_CPP, 'adaptateur : nom du clip miroir pris sur le clip source', 'const FString N = bMirror ? Lead->Set->Name(Ly.Mirror) : Ly.Seq ? Ly.Seq->GetName() : FString();', 'const FString N = bMirror ? Lead->Set->Source(Ly.Mirror)->GetName() : Ly.Seq ? Ly.Seq->GetName() : FString();'),
 (E, TACK_CPP, 'jeu : main du jeu ignorée (toujours à droite)', "const TCHAR Lead = Horse->UsesWebLead() ? (TCHAR)strides::mirror::clipLead(Horse->LeadState().lead, false) : (Phase_.leadSwap ? TEXT('L') : TEXT('R'));", "const TCHAR Lead = TEXT('R');"),
 (E, TACK_CPP, 'jeu : allure décalée d’un rang', 'const FString Gait = Horse->GaitIndex >= 0 && Horse->GaitIndex < (int32)UE_ARRAY_COUNT(GaitNames) ? GaitNames[Horse->GaitIndex] : TEXT("idle");', 'const FString Gait = Horse->GaitIndex >= 1 && Horse->GaitIndex <= (int32)UE_ARRAY_COUNT(GaitNames) ? GaitNames[Horse->GaitIndex - 1] : TEXT("idle");'),
 (E, TACK_CPP, 'jeu : phase non calculée au tick', '		StepPhase(Gait, Horse->SpeedMS, Lead, Horse->IsJumping());', '		(void)Lead;'),
 # État du cheval lu par la règle (human.js animateRiding)
 (E, RIG_CPP, 'règle : phase brute du clip (avant M3)', '	H.phase = Tack.RiderPhase();', '	H.phase = FMath::Max(0.0, Tack.PlayedClipPhase());'),
 (E, RIG_CPP, 'règle : horseY pris égal à la hauteur du siège', '	H.horseY = 0;', '	H.horseY = O.seatPos.y;'),
 (E, RIG_CPP, 'règle : contactOff non nul', '	H.contactOff = 0;', '	H.contactOff = 0.05;'),
 # Rejeu sur le cheval Unreal
 (E, REPLAY_CPP, 'rejeu : temps des clips du web ignorés', '		L.Time = A[2].num();', '		L.Time = 0;'),
 (E, REPLAY_CPP, 'rejeu : phase du web passée à la règle en jeu', '	if (bWebPhase) LastH.phase = Hz["ph"].num();', '	LastH.phase = Hz["ph"].num();'),
]

ATTENDUES = {
 'adaptateur : nom du clip miroir pris sur le clip source': 'équivalente : le nom ne sert qu’à la famille d’allure (canter_M → canter), la même pour un clip miroir et son source, et la durée lue est celle du clip miroir dans les deux cas',
}

os.makedirs(out, exist_ok=True)
t0 = time.time()
paths = sorted({m[1] for m in M})
srcs = {p: open(p).read() for p in paths}

inc = os.path.join(core, 'Public')
flags = ['clang++', '-std=c++20', '-O1', '-I', inc]
objs = {}
for name, src in (('test', test), ('tack', TACK_CORE)):
    objs[name] = os.path.join(out, name + '.o')
    c = subprocess.run(flags + ['-c', src, '-o', objs[name]], capture_output=True, text=True)
    if c.returncode:
        print(f'compilation de {src} échouée\n' + c.stderr[:800]); sys.exit(1)


def core_run(text, tag):
    f = os.path.join(out, 'HorsePhase.cpp')
    open(f, 'w').write(text)
    obj, exe = os.path.join(out, 'HorsePhase.o'), os.path.join(out, 'mut')
    c = subprocess.run(flags + ['-c', f, '-o', obj], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : compilation échouée\n{c.stderr[:400]}'
    c = subprocess.run(['clang++', objs['test'], objs['tack'], obj, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : édition de liens échouée\n{c.stderr[:400]}'
    return subprocess.run([exe, ora, data], capture_output=True, text=True), ''


def ubt():
    return ue_travail.ubt(os.path.join(out, 'ubt-dernier.log'))


def engine_run(tag):
    state, errs, _ = ue_travail.editor_test('Strides.Parite.RiderOnHorse', out, tag, extra=(f'-StridesMonteDir={os.path.join(out, "monte")}',))
    return state, errs


def run_level(level, path, a, b, name):
    src = srcs[path]
    n = src.count(a)
    if n != 1:
        return None, f'motif trouvé {n} fois, mutation non appliquée'
    if level == C:
        r, err = core_run(src.replace(a, b), name)
        if r is None:
            return None, err
        fails = [l.strip() for l in r.stdout.splitlines() if 'ÉCHEC' in l][:1]
        return bool(r.returncode), (fails[0].split(' : ', 1)[-1][:150] if fails else r.stdout.strip().splitlines()[-1] if r.stdout.strip() else '')
    try:
        open(path, 'w').write(src.replace(a, b))
        code, log = ubt()
        if code:
            return None, 'compilation UBT échouée : ' + log[-300:]
        state, errs = engine_run(name)
    finally:
        open(path, 'w').write(src)
    return state != 'Success', (errs[0][:170] if errs else state)


r, err = core_run(srcs[PHASE_CPP], 'témoin')
if r is None or r.returncode:
    print(err or ('témoin cœur (source non muté) en échec :\n' + r.stdout[-800:])); sys.exit(1)
print(f'témoin cœur : passe ({r.stdout.strip().splitlines()[-1]})', flush=True)
if MOTEUR:
    code, log = ubt()
    state, errs = engine_run('témoin') if not code else ('UBT en échec', [])
    if state != 'Success':
        print(f'témoin moteur en échec : {state} {errs[:1]}'); sys.exit(1)
    print('témoin moteur : Strides.Parite.RiderOnHorse passe', flush=True)

undetected, skipped = [], []
try:
    for level, path, name, a, b in M:
        if NOMS and name not in NOMS:
            skipped.append(name)
            continue
        if level == E and not MOTEUR:
            skipped.append(name)
            print(f'[{level}] {name} : non vérifiée (option --moteur)')
            continue
        det, info = run_level(level, path, a, b, name)
        if det is None:
            print(f'[{level}] {name} : {info}'); undetected.append(name); continue
        if not det: undetected.append(name)
        print(f'[{level}] {name} : {"détectée" if det else "NON DÉTECTÉE"}{" ; " + info if info else ""}', flush=True)
finally:
    for p, s in srcs.items():
        open(p, 'w').write(s)
    if MOTEUR:
        code, _ = ubt()
        print(f'recompilation finale du source non muté : code {code}')
clean = all(open(p).read() == s for p, s in srcs.items())
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and n not in skipped]
done = len(M) - len(skipped)
print(f'{len(M)} mutations ({sum(1 for m in M if m[0] == C)} cœur, {sum(1 for m in M if m[0] == E)} moteur), {done} vérifiées, {done - len(undetected)} détectées, '
      f'{len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
print(f'sources rétablis : {"oui" if clean else "NON"} ; durée : {time.time() - t0:.0f} s')
sys.exit(1 if unexpected or now_detected or not clean else 0)
