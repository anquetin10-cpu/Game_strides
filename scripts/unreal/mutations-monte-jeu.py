#!/usr/bin/env python3
"""Mutations des reliquats M1 de l'essai de monte (voie A) : preuve que Strides.Monte.EnJeu départage l'ordre des ticks
cheval → sellerie → cavalière, les bornes des suiveurs du maillage posé (queue de cheval, yeux, sourcils, cils) et la
création de la règle par BeginPlay selon -StridesRider=regles.

Niveau « moteur » seulement : la mutation est appliquée AU SOURCE DU DÉPÔT (StridesRider.cpp, StridesHorse.cpp), Unreal
Build Tool recompile, l'éditeur rejoue Strides.Monte.EnJeu sans rendu, puis le source est rétabli (try/finally) et une
dernière compilation remet le module à l'identique ; le script vérifie à la fin que les sources mutés sont identiques à
leur état de départ. Environ 3 à 4 min par mutation. Une seule instance d'UnrealEditor à la fois.

Non couvert par une mutation : le relevé de fin d'image de -StridesShots=monte (AStridesShots), mode de capture sans test
Automation ; sa sortie est lue dans le journal des captures (unreal/docs/parite/monte/README.md, reliquats M1).

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-monte-jeu.py [--sortie=dossier]
Défaut de sortie : .ue-cache/travail/mutations-monte-jeu (exclu de git). Code 1 si une mutation n'est pas détectée (hors
ATTENDUES), si l'une de celles-ci devient détectée, si le témoin ne passe pas, ou si un source n'est pas rétabli.
"""
import os
import sys
import time
import ue_travail

arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}
out = os.path.abspath(arg.get('--sortie', ue_travail.sortie('mutations-monte-jeu')))
game = os.path.join(ue_travail.REPO, 'unreal/StridesGrandTour/Source/StridesGrandTour')
RIDER = os.path.join(game, 'Private/StridesRider.cpp')
HORSE = os.path.join(game, 'Private/StridesHorse.cpp')
TEST = 'Strides.Monte.EnJeu'

# (fichier, nom, motif, remplacement) : chaque motif doit apparaître une seule fois.
M = [
 (RIDER, 'ordre : prérequis du cheval et de la sellerie retirés',
  '\t\tif (Tack) AddTickPrerequisiteComponent(Tack);\n\t\tif (MountedOn) AddTickPrerequisiteActor(MountedOn);\n', ''),
 (RIDER, 'ordre : prérequis de la sellerie retiré', '\t\tif (Tack) AddTickPrerequisiteComponent(Tack);\n', ''),
 (RIDER, 'ordre : prérequis du cheval retiré', '\t\tif (MountedOn) AddTickPrerequisiteActor(MountedOn);\n', ''),
 (RIDER, 'bornes : suiveurs gardent leurs bornes propres en selle', 'Part->bUseBoundsFromLeaderPoseComponent = true;', 'Part->bUseBoundsFromLeaderPoseComponent = false;'),
 (RIDER, 'bornes : pas de rafraîchissement à chaque image',
  '\t\tfor (USkeletalMeshComponent* Part : MeshParts)\n\t\t{\n\t\t\tPart->InvalidateCachedBounds();\n\t\t\tPart->UpdateBounds();\n\t\t\tPart->MarkRenderTransformDirty();\n\t\t}\n\t\treturn;',
  '\t\treturn;'),
 (RIDER, 'pied à terre : bornes du meneur gardées', 'Part->bUseBoundsFromLeaderPoseComponent = false;  // comme le jeu par défaut', 'Part->bUseBoundsFromLeaderPoseComponent = true;'),
 (RIDER, 'BeginPlay : règle créée sans l’option', 'RiderOption) && RiderOption == TEXT("regles"))', 'RiderOption) || true)'),
 (RIDER, 'BeginPlay : règle jamais créée', 'RiderOption) && RiderOption == TEXT("regles"))', 'RiderOption) && RiderOption == TEXT("jamais"))'),
 (HORSE, 'BeginPlay : sellerie créée sans l’option', 'RiderOption) && RiderOption == TEXT("regles") && Mesh)', 'RiderOption) || Mesh)'),
]

ATTENDUES = {
 'ordre : prérequis du cheval retiré': 'mutation équivalente : la sellerie tique en TG_PostUpdateWork, donc après le tick du cheval (TG_PrePhysics) ; '
                                      'son prérequis repousse la cavalière dans ce groupe, après le cheval',
 'bornes : pas de rafraîchissement à chaque image': 'non départagée : sans lui, le cache invalidé à l’activation reste juste (bornes locales du meneur, déplacées avec le '
                                                    'composant ; au galop la pose assise bouge peu dans le repère du maillage). Gardé pour les grands changements de '
                                                    'pose (montée, saut), que le test n’exerce pas : faiblesse déclarée',
}

os.makedirs(out, exist_ok=True)
t0 = time.time()
srcs = {p: open(p).read() for p in {m[0] for m in M}}


def run(tag):
    state, errs, log = ue_travail.editor_test(TEST, out, tag)
    return state, errs


code, _ = ue_travail.ubt(os.path.join(out, 'ubt-temoin.log'))
state, errs = run('témoin') if not code else ('UBT en échec', [])
if state != 'Success':
    print(f'témoin en échec : {state} {errs[:1]}'); sys.exit(1)
print(f'témoin : {TEST} passe', flush=True)

undetected = []
try:
    for i, (path, name, a, b) in enumerate(M):
        src = srcs[path]
        n = src.count(a)
        if n != 1:
            print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected.append(name); continue
        try:
            open(path, 'w').write(src.replace(a, b))
            code, log = ue_travail.ubt(os.path.join(out, f'ubt-m{i + 1:02d}.log'))
            if code:
                print(f'{name} : compilation UBT échouée : {log[-300:]}'); undetected.append(name); continue
            state, errs = run(f'm{i + 1:02d}')
        finally:
            open(path, 'w').write(src)
        det = state != 'Success'
        if not det: undetected.append(name)
        print(f'{name} : {"détectée" if det else "NON DÉTECTÉE"} ; {(errs[0][:200] if errs else state)}', flush=True)
finally:
    for p, s in srcs.items():
        open(p, 'w').write(s)
    code, _ = ue_travail.ubt(os.path.join(out, 'ubt-final.log'))
    print(f'recompilation finale du source non muté : code {code}')
clean = all(open(p).read() == s for p, s in srcs.items())
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected]
print(f'{len(M)} mutations, {len(M) - len(undetected)} détectées, {len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
print(f'sources rétablis : {"oui" if clean else "NON"} ; durée : {time.time() - t0:.0f} s')
sys.exit(1 if unexpected or now_detected or not clean else 0)
