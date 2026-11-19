# Banc de parité web → Unreal : mode d'emploi

Le jeu web (`src/`, `public/`, `tests/`) est la spécification : il n'est jamais modifié. Tout ce qui sert de
référence au portage en est **exporté par script** (jamais recopié à la main), puis rejoué par des tests C++ (cœur
`StridesCore`) et des tests moteur, ou comparé à l'œil sur des captures jumelles. Plan et écarts du CSO :
`cso-ecarts.md` ; règles du jeu web : `cso-spec.md` ; état fonction par fonction : `../PARITE.md` (généré).

Toutes les commandes se lancent depuis la racine du dépôt, avec
`export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (sans lui, Unreal ouvre une fenêtre modale
« Xcode introuvable » qui bloque Metal) et `UE="/Users/Shared/Epic Games/UE_5.8"`.

## 1. Oracles

| Sortie | Produite par | Contenu |
|---|---|---|
| `unreal/StridesGrandTour/Content/Data/*.json` | `npx vite-node scripts/unreal/export-data.mjs` | données lues par le jeu Unreal (constantes extraites du source JS) |
| `unreal/core/tests/oracles/{jump,cso_ride,cso_course,cso_text}.json` | idem | cas de référence des fonctions pures |
| `unreal/core/tests/oracles/cso_runs/` | `export-cso-runs.mjs` (jeu web en cours d'exécution) | scénarios rejoués image par image : `index.json` (en-tête des canaux, liste des exécutions) et un fichier par scénario et par langue, `<id>.<lang>.json` |
| `unreal/core/tests/oracles/cso_target.json`, `cso_goto.json` | idem | grille de visée et d'appui ; étape « rejoindre l'entrée » |

Export en cours d'exécution (serveur Vite sur `http://127.0.0.1:5173`, sinon
`npx vite --host 127.0.0.1 --port 5173 --strictPort` ; Chrome du Mac, aucun téléchargement) :

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs               # tout (~30 min)
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --only=t4-cloche,target
```

- Déterministe (graine, horloges virtuelles, pas fixe de 1/30 s, cheval du joueur et cavaliers du décor remis à neuf
  au `setup`) : deux exports donnent les mêmes octets. Un fichier dont le contenu ne change pas n'est pas réécrit :
  après un export, `git status` ne montre que les scénarios touchés. Ne recommiter que ceux-là.
- `--only=id1,id2` : seulement ces scénarios (`target`, `goto` : les grilles) ; les autres entrées de l'index restent.
  `--out=<dossier>` : autre dossier d'exécutions (les grilles vont dans son dossier parent ; `--goto-out=<fichier>`).
- Format (`scripts/unreal/cso-runs-io.mjs`) : chaque fichier d'exécution est `{ id, lang, desc, setup, frames }`,
  en-tête sur la première ligne puis une image par ligne ; l'index (`schema` `strides.oracle.cso_runs/2`) décrit les
  canaux et liste `{ id, lang, file, frames }` dans l'ordre des scénarios. Un fichier `.json` du dossier absent de
  l'index est signalé à l'export, jamais supprimé. Taille : le plus gros fichier fait ~4 Mo ; aucun fichier de plus de
  20 Mo ne doit être commité (découper par scénario).

## 2. Tests

```sh
cmake -S unreal/core -B build/core && cmake --build build/core && ctest --test-dir build/core --output-on-failure
"$UE/Engine/Build/BatchFiles/Mac/Build.sh" StridesGrandTourEditor Mac Development \
  -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -WaitMutex
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides; Quit" -unattended -nullrhi -nosplash -log -stdout \
  -ReportExportPath="$PWD/.tmp/automation" > .tmp/automation.log   # chaque test : Result={Success}
python3 scripts/unreal/mutations-cso-horse.py    # aussi mutations-cso-fences.py, mutations-cso-run.py
```

- `ctest` lance `strides_core_tests <oracles> <Content/Data>` : lecture de `cso_runs/` par `loadRuns`
  (`unreal/core/tests/test_core.cpp`), qui contrôle l'index (schéma, nom de fichier, identifiant, langue, nombre
  d'images) avant les rejeux.
- Tests moteur `Strides.Parite.*` : même lecture par `Private/Tests/StridesOracleRuns.h`. Les messages d'information
  (compteurs d'images, d'appels comparés) sont dans `.tmp/automation/index.json` (`-ReportExportPath`).
- Mutations : chaque script recompile le banc avec une copie mutée d'un source du cœur (le dépôt n'est jamais
  modifié) ; une mutation doit faire échouer le banc. Les mutations équivalentes sont déclarées dans le script
  (`ATTENDUES`) et dans l'inventaire.

## 3. Captures jumelles (même lieu, même heure, même caméra, 844 × 390)

Web (poses écrites dans `unreal/docs/parite/cso/poses.json`, captures `<pose>-web.png`) :

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots        # toutes les poses
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=chute  # chute de barre seule
```

Unreal (rendu GPU réel, jamais `-nullrhi` ; une seule instance d'UnrealEditor, qui quitte seule après la dernière pose) :

```sh
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso [-StridesPose=<préfixe>] \
  [-StridesShotsDir=<dossier dédié>] -abslog="$PWD/.tmp/shots-cso.log"
```

- `-StridesShots=cso` lit `poses.json` (`-StridesPoses=<fichier>` pour un autre) ; `-StridesPose=<préfixe>` : seulement
  les poses dont le nom commence ainsi. Sans `-StridesShotsDir`, chaque capture va au chemin `unreal` de sa pose
  (`unreal/docs/parite/cso/<pose>-unreal.png`, versionné) ; avec, au même nom dans le dossier donné (essai sans toucher
  les captures versionnées).
- FOV : le web règle un FOV **vertical** ; UE 5.8 maintient l'axe **Y** par défaut (`AspectRatio_MaintainYFOV`). La
  caméra de capture impose l'axe **X** et reçoit le FOV horizontal équivalent (`AStridesShots::HorizontalFov`) ; la
  caméra de jeu garde le réglage par défaut.
- Contrôle : `grep "Strides parite" .tmp/shots-cso.log` (pose, FOV vertical → horizontal, soleil, « écrite ») et
  `sips -g pixelWidth -g pixelHeight <capture>`.

Revue des décors et démonstration (`-StridesShots` sans mode) : **toujours avec un dossier dédié**.

```sh
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=1600 -ResY=900 -nosplash -StridesShots -StridesShotsDir=.tmp/shots/$(date +%Y%m%d-%H%M%S) \
  -abslog="$PWD/.tmp/shots.log"
```

- `-StridesShotsDir=<chemin>` : absolu, ou relatif à la racine du dépôt ; créé au besoin.
- Garde-fou : `Saved/Screenshots/Strides/` et `Saved/Screenshots/MacEditor/` contiennent des captures de Julien. Si le
  dossier retenu est l'un d'eux et qu'il contient déjà un fichier (cas de `-StridesShots` sans option), le mode
  n'écrit rien, journalise `Strides shots: REFUS, aucune capture écrite : …` et quitte. Test moteur
  `Strides.Shots.OutputDir`. `scripts/unreal/rebuild-world.sh shots` passe un dossier daté sous `.tmp/shots/`.

## 4. Montage côte à côte

```sh
python3 scripts/unreal/parite-montage.py [unreal/docs/parite/cso]
```

Pour chaque pose de `poses.json` : vérifie que `<pose>-web.png` et `<pose>-unreal.png` ont exactement la taille du
viewport (`sips`), puis les assemble (web à gauche, `ffmpeg hstack`) dans `<pose>.png`. Code 1 au premier écart.

## 5. Inventaire et PARITE.md

- Une ligne d'inventaire = une fonction du jeu web : `unreal/docs/parite/inventaire/*.json` (`etat` : absent, partiel,
  identique_prouve ; `niveau` : aucun, code_ecrit, compile, teste, joue_ecran ; `preuve`, `ecart`, références
  `fichier:ligne`). Méta et niveaux globaux : `unreal/docs/parite/etat.json`.
- `identique_prouve` seulement avec un oracle exporté du JS comparé par un test qui passe, ou un montage côte à côte
  dans `unreal/docs/parite/cso/`. Les branches qu'aucun oracle ne départage sont écrites dans `ecart`.
- Après toute réécriture d'un fichier cité, mettre à jour ses références (`rg -n "<nom du fichier>"
  unreal/docs/parite/inventaire/`), puis régénérer, dans le même commit que le code :

```sh
python3 scripts/unreal/build-parite.py   # code 0 obligatoire ; ne jamais éditer PARITE.md à la main
```
