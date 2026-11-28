#!/usr/bin/env python3
"""Mutations des reliquats M1 de l'essai de monte (voie A) : preuve que Strides.Monte.EnJeu départage l'ordre des ticks
cheval → sellerie → cavalière, les bornes des suiveurs du maillage posé (queue de cheval, yeux, sourcils, cils) et la
création de la règle par BeginPlay selon -StridesRider=regles ; étape S2 : la monte du web lue comme un ensemble
(StridesMonteOptions : -StridesMonte=, -StridesRider=, -StridesHorseLead=, -StridesTack=, défaut du jeu épinglé), prouvée par
Strides.Monte.Options (résolution et effet réel par BeginPlay) ; étape S3 : taille du cheval du web (-StridesHorseScale=,
AStridesHorse::EnableWebScale), prouvée par Strides.Monte.Options et Strides.Parite.HorseScale.

Niveau « moteur » seulement : la mutation est appliquée AU SOURCE DU DÉPÔT (StridesRider.cpp, StridesHorse.cpp,
StridesMonteOptions.cpp et .h), Unreal Build Tool recompile, l'éditeur rejoue Strides.Monte.EnJeu et Strides.Monte.Options
et Strides.Parite.HorseScale sans rendu (Automation RunTests Strides.Monte+Strides.Parite.HorseScale ; mutation détectée si l'un
des trois échoue), puis le source est rétabli (try/finally) et une
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
OPTS = os.path.join(game, 'Private/StridesMonteOptions.cpp')
OPTS_H = os.path.join(game, 'Public/StridesMonteOptions.h')
TEST = 'Strides.Monte+Strides.Parite.HorseScale'
TESTS = ('Strides.Monte.EnJeu', 'Strides.Monte.Options', 'Strides.Parite.HorseScale')

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
 (RIDER, 'BeginPlay : règle créée sans l’option', 'if (StridesMonteOptions::FromCommandLine().bRiderRules)', 'if (true)'),
 # Conditions jamais vraies écrites sans constante : « if (false) » ne compile pas (-Wunreachable-code traité en erreur).
 (RIDER, 'BeginPlay : règle jamais créée', 'if (StridesMonteOptions::FromCommandLine().bRiderRules)', 'if (StridesMonteOptions::FromCommandLine().bRiderRules && GetWorld() == nullptr)'),
 (HORSE, 'BeginPlay : sellerie créée sans l’option', 'if (Monte.bRiderRules && Mesh)', 'if (Mesh)'),
 # Étape S2 : branchement du cheval sur l'ensemble.
 (HORSE, 'S2 BeginPlay : main du web suivant la cavalière', 'if (Monte.bWebLead)', 'if (Monte.bRiderRules)'),
 (HORSE, 'S2 BeginPlay : main du web jamais activée', 'if (Monte.bWebLead)', 'if (Monte.bWebLead && GetWorld() == nullptr)'),
 (HORSE, 'S2 BeginPlay : sellerie affichée suivant la cavalière', 'if (Mesh && Monte.bTackMesh)', 'if (Mesh && Monte.bRiderRules)'),
 (HORSE, 'S2 BeginPlay : sellerie lue suivant la main', 'if (Monte.bRiderRules && Mesh)', 'if (Monte.bWebLead && Mesh)'),
 # Étape S2 : résolution des options (StridesMonteOptions.cpp, .h).
 (OPTS, 'S2 ensemble -StridesMonte= ignoré', 'const bool bGroup = Group < 0 ? bWebByDefault : Group == 1;', 'const bool bGroup = bWebByDefault;'),
 (OPTS, 'S2 ensemble : valeurs inversées', 'Read(TEXT("StridesMonte="), TEXT("web"), TEXT("ancien"))', 'Read(TEXT("StridesMonte="), TEXT("ancien"), TEXT("web"))'),
 (OPTS, 'S2 clé de l’ensemble sans « = » (prend -StridesMonteDir=)', 'Read(TEXT("StridesMonte="), ', 'Read(TEXT("StridesMonte"), '),
 (OPTS, 'S2 -StridesRider= ignorée', 'M.bRiderRules = Rider < 0 ? bGroup : Rider == 1;', 'M.bRiderRules = bGroup;'),
 (OPTS, 'S2 cavalière hors de l’ensemble', 'M.bRiderRules = Rider < 0 ? bGroup : Rider == 1;', 'M.bRiderRules = Rider == 1;'),
 (OPTS, 'S2 -StridesHorseLead= ignorée', 'M.bWebLead = Lead < 0 ? bGroup : Lead == 1;', 'M.bWebLead = bGroup;'),
 (OPTS, 'S2 main hors de l’ensemble', 'M.bWebLead = Lead < 0 ? bGroup : Lead == 1;', 'M.bWebLead = Lead == 1;'),
 (OPTS, 'S2 -StridesHorseLead=droite sans effet', 'Read(TEXT("StridesHorseLead="), TEXT("web"), TEXT("droite"))', 'Read(TEXT("StridesHorseLead="), TEXT("web"), TEXT("gauche"))'),
 (OPTS, 'S2 sellerie ne suit plus la cavalière', '(bGroup || M.bRiderRules)', 'bGroup'),
 (OPTS, 'S2 sellerie ne suit plus l’ensemble', '(bGroup || M.bRiderRules)', 'M.bRiderRules'),
 (OPTS, 'S2 -StridesTack=aucune sans effet', ': Tack == 1;', ': true;'),
 (OPTS, 'S2 -StridesRider=ancien sans effet', 'Read(TEXT("StridesRider="), TEXT("regles"), TEXT("ancien"))', 'Read(TEXT("StridesRider="), TEXT("regles"), TEXT("aucune"))'),
 (OPTS, 'S2 valeur inconnue non signalée', '\t\tif (Unknown) Unknown->Add(FString::Printf(TEXT("-%s%s")', '\t\tif (Unknown && Unknown->Num() < 0) Unknown->Add(FString::Printf(TEXT("-%s%s")'),
 (OPTS, 'S2 valeur inconnue prise pour « non »', '\t\treturn -1;\n\t};', '\t\treturn 0;\n\t};'),
 (OPTS, 'S2 description de l’ensemble inversée', 'return TEXT("web");', 'return TEXT("ancien");'),
 (OPTS_H, 'S2 défaut du jeu basculé', 'inline constexpr bool bWebByDefault = true;', 'inline constexpr bool bWebByDefault = false;'),
 # Étape S3 : taille du cheval du web (-StridesHorseScale=, StridesMonteOptions et AStridesHorse::EnableWebScale), prouvée
 # par Strides.Monte.Options (résolution, effet par BeginPlay) et Strides.Parite.HorseScale (échelle exacte, mesures).
 (OPTS_H, 'S3 taille du web par défaut basculée', 'inline constexpr bool bWebHorseScaleByDefault = true;', 'inline constexpr bool bWebHorseScaleByDefault = false;'),
 (OPTS, 'S3 -StridesHorseScale=web prise pour jeu', 'if (V == TEXT("web")) return true;', 'if (V == TEXT("web")) return false;'),
 (OPTS, 'S3 -StridesHorseScale=jeu prise pour web', 'if (V == TEXT("jeu")) return false;', 'if (V == TEXT("jeu")) return true;'),
 (OPTS, 'S3 -StridesMonte=ancien donne la taille du web', 'G == TEXT("ancien")) return false;', 'G == TEXT("ancien")) return true;'),
 (OPTS, 'S3 -StridesMonte=ancien sans effet sur la taille', 'G == TEXT("ancien")) return false;', 'G == TEXT("ancien")) return bWebHorseScaleByDefault;'),
 (OPTS, 'S3 valeur inconnue non signalée', 'if (Unknown) Unknown->Add(FString::Printf(TEXT("-StridesHorseScale=%s"), *V));',
  'if (Unknown && Unknown->Num() < 0) Unknown->Add(FString::Printf(TEXT("-StridesHorseScale=%s"), *V));'),
 (OPTS, 'S3 clé de la taille sans « = »', 'FParse::Value(Cmd, TEXT("StridesHorseScale="), V)', 'FParse::Value(Cmd, TEXT("StridesHorseScale"), V)'),
 (HORSE, 'S3 BeginPlay : taille jamais appliquée', 'if (StridesMonteOptions::WebHorseScaleFromCommandLine())', 'if (StridesMonteOptions::WebHorseScaleFromCommandLine() && GetWorld() == nullptr)'),
 (HORSE, 'S3 BeginPlay : taille toujours appliquée', 'if (StridesMonteOptions::WebHorseScaleFromCommandLine())', 'if (GetWorld() != nullptr)'),
 (HORSE, 'S3 échelle du web non posée sur le maillage', 'Mesh->SetRelativeScale3D(FVector(S));', 'Mesh->SetRelativeScale3D(FVector(GameMeshScale));'),
 (HORSE, 'S3 échelle du web approchée (×1,0001)', 'S = WebMeshScale(Err);', 'S = WebMeshScale(Err) * 1.0001;'),
 (HORSE, 'S3 échelle lue dans inner.groundY', 'TryGetNumberField(TEXT("scale"), S)', 'TryGetNumberField(TEXT("groundY"), S)'),
 (HORSE, 'S3 retour à l’échelle du jeu impossible', 'double S = GameMeshScale;', 'double S = WebMeshScale();'),
 (HORSE, 'S3 indicateur de taille non posé', 'bScaleWeb = bWeb;', 'bScaleWeb = false;'),
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
    """Strides.Monte (EnJeu et Options) : Success seulement si les deux passent ; erreurs du premier en échec."""
    import json
    state, errs, log = ue_travail.editor_test(TEST, out, tag)
    rep = os.path.join(out, 'auto-' + ue_travail.re.sub(r'[^a-z0-9]+', '-', tag.lower())[:40], 'index.json')
    try:
        d = json.load(open(rep, encoding='utf-8-sig'))
    except Exception as ex:
        return f'sans rapport ({ex})', []
    by = {t['fullTestPath']: t for t in d['tests']}
    for name in TESTS:
        t = by.get(name)
        if not t:
            return f'{name} absent du rapport', []
        if t['state'] != 'Success':
            return f"{name} : {t['state']}", [e['event']['message'] for e in t['entries'] if e['event']['type'] == 'Error']
    return 'Success', []


code, _ = ue_travail.ubt(os.path.join(out, 'ubt-temoin.log'))
state, errs = run('témoin') if not code else ('UBT en échec', [])
if state != 'Success':
    print(f'témoin en échec : {state} {errs[:1]}'); sys.exit(1)
print(f'témoin : {TEST} passe', flush=True)

undetected = []
# --noms=a,b : seulement les mutations dont le nom contient l'un de ces textes (reprise ciblée).
noms = [n for n in str(arg.get('--noms', '')).split(',') if n]
try:
    for i, (path, name, a, b) in enumerate(M):
        if noms and not any(n in name for n in noms):
            continue
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
ran = [m[1] for m in M if not noms or any(n in m[1] for n in noms)]
now_detected = [n for n in ATTENDUES if n in ran and n not in undetected]
M = [m for m in M if m[1] in ran]
print(f'{len(M)} mutations, {len(M) - len(undetected)} détectées, {len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
print(f'sources rétablis : {"oui" if clean else "NON"} ; durée : {time.time() - t0:.0f} s')
sys.exit(1 if unexpected or now_detected or not clean else 0)
