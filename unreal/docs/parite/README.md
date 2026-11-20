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
| `unreal/core/tests/oracles/cso_runs/` | `export-cso-runs.mjs` (jeu web en cours d'exécution) | scénarios rejoués image par image : `index.json` (en-tête des canaux, liste des exécutions) et un fichier par scénario et par langue, `<id>.<lang>.json` ; canal « cc » de la caméra de concours (tranche T6) dans toutes les exécutions non légères, scénario `cadrage` = `tests/e2e/cso-framing.mjs` au pas fixe |
| `unreal/StridesGrandTour/Content/Data/cso_camera.json` | `export-data.mjs` | réglages `CAM_COMP` de `src/entities/camera.js` (tranche T6 ; `fov` = champ vertical, degrés) |
| `unreal/core/tests/oracles/cso_target.json`, `cso_goto.json` | idem | grille de visée et d'appui ; étape « rejoindre l'entrée » |
| `unreal/core/tests/oracles/cso_input.json` | `node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-input.mjs` (~1 min, page de test sans le jeu) | commandes (tranche T8) : vraie classe `Input` de `src/core/input.js` soumise à des événements tactiles, souris et clavier synthétiques (DevTools), chaque appel reçu et l'état complet juste après ; rejoué par `testCsoInput` |
| `unreal/core/tests/oracles/cso_freeze.json` | `export-cso-runs.mjs --freeze` (~45 s, jeu web en cours d'exécution) | gel en pause et au téléphone (tranche T8, contrôle adverse) : après le départ du chrono du Pôle, 338 images jouées par la boucle du jeu (`game.js:1406`, update seulement à l'état « play ») avec Échap, P, M et Reprendre ; par image : update appelée, état, `simPaused`, téléphone, chrono, position du cheval ; rejoué par le test moteur `Strides.Cso.Controls` |
| `unreal/core/tests/oracles/cso_takeoff_zone.json`, `unreal/StridesGrandTour/Content/Data/cso_aids.json` | `export-cso-runs.mjs --aids` (~40 s, jeu web en cours d'exécution) | aides à l'appel (tranche T9) : `takeoffZone` de `courseAids.js` appelée dans la page sur les obstacles du parcours (8 jeux de hauteurs × 15 vitesses × 4 puissances × 3 bonus = 14 400 cas) et tirets du tracé d'un vrai `CourseAids` avec le sol lu pour chaque coin (rejoués par `testCsoTakeoffZone` : coins, hauteur sol + 0,04) ; données du jeu : `LINE_MARK`, matériaux (couleur, opacité, faces), ordre de rendu et géométries du repère et des bandes relus dans la scène |
| canal « ai » des exécutions `t9-*` de `cso_runs/` | `export-cso-runs.mjs --only=t9-parcours,t9-appel,t9-retour,t9-aide-bouton,t9-aide-off,t9-sans-trace,t9-ambre,t9-courbe,t9-recette` | appels de `CourseAids.update` (entrées, sol lu, maillages après l'appel), bouton SAUT (aide lue par `hud.update`, état du DOM), temporisation de « Trop tôt » sur une horloge virtuelle (100 ticks de 1/3 ms par image) ; rejoués par `testCsoAids` et `Strides.Cso.Aids`. `t9-ambre` : bande ambre sans bande verte (abord lent du 8). `t9-courbe` : jumeau de `t9-parcours` tracé masqué jusqu'au 2 (paire `aide-trace` / `aide-sans-trace`). `t9-recette` : `tests/e2e/cso-shots.mjs` rejoué au pas fixe jusqu'aux captures `4-abord-trop-loin` et `5-abord-bonne-zone` (réglages relus dans le test ; état de l'épreuve écrit par le test dans le champ `fs`, non rejoué par `testCsoRuns` ; pauses des captures du test dans `hw`, modèle et intervalle de validité dans `setup.recette.pause`) |
| `unreal/StridesGrandTour/Content/Data/cso_jump_style.json` | `export-hud-style.mjs --jump-states` (seul, rien d'autre n'est réécrit) | bouton SAUT dans chacun des 8 états (none, far, good, near, et les mêmes pendant « Trop tôt ») posés par le vrai HUD, 844 × 390 et 667 × 308 : styles et boîtes du bouton, de l'anneau, de la pastille, du libellé |
| `unreal/core/tests/oracles/cso_plan.json` | `npx vite-node scripts/unreal/export-data.mjs` | plan du parcours (tranche T10) : `coursePlanSvg` et `coursePlanLegend` de `src/ui/coursePlan.js` appelés tels quels (csoHeights 1,05 / 1,10 / 1,15 / 1,25 / 1,40 / 1,55, sans hauteurs, numéros surlignés ; fr et en), chaîne SVG exacte ; rejoué caractère pour caractère par `testCoursePlan` |
| `unreal/core/tests/oracles/cso_entry.json`, `unreal/StridesGrandTour/Content/Data/cso_activity.json` | `node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-entry.mjs` (~3 min, jeu web en cours d'exécution) | entrée dans l'épreuve (tranche T10) : `courseSteps` appelé dans la page avec les vraies étapes de mission pour 21 configurations (cartes de présentation et du plan : arguments de `screens.card` et DOM ; boutons Voir le plan, Retour, Entrer en piste contrôlés) et une grille de chevaux (contrôle de capacité, dont les deux bords du seuil de puissance cherché par dichotomie), action du poteau proposée par `interact.update` autour du départ (fr et en) ; données de l'activité `cso_train` relevées dans le jeu (poteau, action « Chrono », offre de mission) ; rejoués par `testCsoEntry` |
| `unreal/StridesGrandTour/Content/Data/cso_screens_style.json` | `export-cso-entry.mjs --screens` | styles calculés et boîtes des cartes de présentation et du plan et du dialogue de l'entraîneur, ouverts comme dans la recette, 844 × 390 et 667 × 308 |
| `unreal/core/tests/oracles/cso_ranking.json`, `unreal/StridesGrandTour/Content/Data/cso_ranking.json` | `npx vite-node scripts/unreal/export-data.mjs` | classement simulé (tranche T11) : `mulberry32` (`src/core/math.js`), `simulateField` et `rankResults` (`src/gameplay/ranking.js`) appelés tels quels (graines 5150 + 31 k, k = 0 à 9, classes du Pôle et du concours de `trip.js`, graines de concours ; 112 classements avec le joueur) ; données : `FIRST_NAMES`, `LAST_NAMES`, `HORSE_NAMES` ; rejoué par `testRanking` |
| `unreal/core/tests/oracles/cso_result.json` | `node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-result.mjs` (~2 min, jeu web en cours d'exécution) | bilan (tranche T11) : étape de bilan de l'activité `cso_train` construite par le jeu, démarrée sur 15 états posés × 2 langues, carte relevée dans le DOM (kicker, titre, grille, tableau, boutons) ; boutons Recommencer, Quitter l'épreuve, S'entraîner touchés sur 3 cas ; rejoué par `testCsoResult` |
| `unreal/StridesGrandTour/Content/Data/cso_result_style.json` | `export-cso-result.mjs --screens` | relevé de base de la carte de bilan, par langue (fr, en) et par viewport (844 × 390, 667 × 308) : styles calculés, boîtes et largeur Geist de chaque texte (état du bilan de `t9-parcours`), lus par `UStridesCsoScreens` (mise en page `csoResultLayout`, étalonnage de la police du moteur) |
| `unreal/core/tests/oracles/cso_result_layout.json` | `export-cso-result.mjs --screens` | mise en page de la carte de bilan dans le navigateur pour les 15 états posés × 2 langues × 2 viewports (boîtes, largeurs de texte des cellules, `scrollHeight`, classe `more` en haut et défilé jusqu'en bas) ; rejoué par `testCsoResultLayout` et `Strides.Cso.ResultLayout` |
| canal « bl » et `ep.bt` de `cso_runs/`, exécutions `t11-refus`, `t11-manche-2`, `t11-trois-barres` | `export-cso-runs.mjs --only=t11-refus,t11-manche-2,t11-trois-barres` (et toute exécution qui atteint le bilan) | carte de bilan relevée dans le DOM à l'image où elle s'ouvre ; meilleur temps `save.data.bestTimes.cso_train` relevé quand il change (tranche T11) |
| `unreal/StridesGrandTour/Content/Data/cso_sounds.json`, `unreal/core/tests/oracles/cso_crowd.json`, `.tmp/unreal-import/cso-sounds/*.wav` | `node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-sounds.mjs` (~1 min ; `--no-game` : sans le relevé du niveau du public dans le jeu) | sons de l'épreuve (tranche T12) : chaque variante appelée dans `cso_runs/` rendue hors ligne par la vraie classe `Audio` de `src/core/audio.js` (OfflineAudioContext passé à `unlock()`, `Math.random` → `mulberry32` à graine fixe), PCM 16 bits 48 kHz après le gain maître et avant le compresseur (mesuré par son : `gameChain`), bus du public débranché ; boucle du bus du public ; manifeste (clé, actif, SHA-1 du PCM, constantes du bus lues dans le source, niveau relevé dans le jeu autour des 90 m) ; gain du bus du public rendu échantillon par échantillon (7 séquences d'images) rejoué par `testCsoCrowd` |
| `unreal/StridesGrandTour/Content/World/Cso/cso_fences.json` | `export-cso-runs.mjs --fences` (jeu web en cours d'exécution, `scripts/unreal/cso-export.js`) | géométrie du parcours du Pôle (tranche T5) : pièces des obstacles, des lignes de départ et d'arrivée et du poteau « Chrono » (catégorie, maillage, pivot local et monde, barycentre), hauteurs hors épreuve et en épreuve, couleurs de surlignage, matériaux |

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

Géométrie du parcours (tranche T5) : construite par le jeu web dans la page (classe `Obstacles`, `showJumpGeo`, `railGeo`,
poteau de `activities.js`, sur un jeu témoin), chaque primitive relevée à sa création et à sa peinture puis découpée en
pièces (table `SITES` de `cso-export.js` : site `fichier:ligne` → catégorie ; un site inconnu arrête l'export). La
construction témoin est comparée au jeu réel au bit près, hors épreuve (avant le lancement de l'activité) et en épreuve
(après l'entrée en piste). Deux exports donnent les mêmes octets.

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --fences     # ~40 s
"$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \
  -script="$PWD/scripts/unreal/import-cso-fences.py" -unattended -nosplash -nullrhi              # ~20 s
```

- `--fences` écrit `.tmp/unreal-import/cso/` (`cso_fences.glb` : un nœud par maillage unique, centré sur son pivot ;
  `sign_*.png` : textures des panneaux, DÉPART / ARRIVÉE en français et en anglais) et le manifeste (réécrit seulement
  s'il change). Seul, il ne rejoue aucun scénario.
- `import-cso-fences.py` importe maillages, textures et matériaux sous `/Game/World/Cso`, vérifie que la boîte
  englobante de chaque maillage importé est celle du manifeste (repère x → X, z → Y, y → Z) et écrit
  `Content/World/Cso/cso_assets.json` (chemins des maillages et des matériaux de panneaux). Compte rendu :
  `.tmp/unreal-import/import-cso-fences.log` (dernière ligne `TERMINÉ`).
- Le jeu lit les deux fichiers au démarrage (`UStridesDataSubsystem::CsoScenery`) ; sans eux, obstacles en formes de base.

## 2. Tests

```sh
cmake -S unreal/core -B build/core && cmake --build build/core && ctest --test-dir build/core --output-on-failure
"$UE/Engine/Build/BatchFiles/Mac/Build.sh" StridesGrandTourEditor Mac Development \
  -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -WaitMutex
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides; Quit" -unattended -nullrhi -nosplash -log -stdout \
  -ReportExportPath="$PWD/.tmp/automation" > .tmp/automation.log   # chaque test : Result={Success}
python3 scripts/unreal/mutations-cso-horse.py    # aussi mutations-cso-fences.py, mutations-cso-run.py, mutations-cso-camera.py,
                                                 # mutations-cso-hud.py, mutations-cso-input.py, mutations-cso-aids.py,
                                                 # mutations-cso-entry.py, mutations-cso-audio.py (~25 min)
                                                 # (~1 min à ~2 min, objets communs compilés une fois)
```

- Entrée dans l'épreuve (tranche T10) : `Strides.Cso.Entry` et `Strides.Cso.EntryDialog`
  (`Private/Tests/StridesCsoEntryTests.cpp`) relisent `unreal/core/tests/oracles/cso_entry.json` par le chemin du jeu
  (poteau, action du joueur, cartes et dialogue affichés par `UStridesCsoScreens`).

- `STRIDES_TESTS=input,save` : le banc ne lance que ces parties (noms dans le `main` de `test_core.cpp`) ; sans la
  variable, tout.
- `ctest` lance `strides_core_tests <oracles> <Content/Data>` : lecture de `cso_runs/` par `loadRuns`
  (`unreal/core/tests/test_core.cpp`), qui contrôle l'index (schéma, nom de fichier, identifiant, langue, nombre
  d'images) avant les rejeux.
- Tests moteur `Strides.Parite.*` : même lecture par `Private/Tests/StridesOracleRuns.h`. `Strides.Parite.CsoScenery`
  relit `cso_fences.json` : hauteurs hors épreuve et en épreuve, pièces de chaque obstacle, des lignes et du poteau
  (nombre par catégorie, maillage, pivot, boîte englobante, barycentre), numéro surligné. Les messages d'information
  (compteurs d'images, d'appels comparés) sont dans `.tmp/automation/index.json` (`-ReportExportPath`).
- Mutations : chaque script recompile le banc avec une copie mutée d'un source du cœur (le dépôt n'est jamais
  modifié) ; une mutation doit faire échouer le banc. Les mutations équivalentes sont déclarées dans le script
  (`ATTENDUES`) et dans l'inventaire.

## 3. Captures jumelles (même lieu, même heure, même caméra, 844 × 390)

Web (poses écrites dans `unreal/docs/parite/cso/poses.json`, captures `<pose>-web.png`) :

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots        # toutes les poses
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=chute  # chute de barre seule
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=carriere  # carrière, lignes, poteau
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=cadrage   # caméra de concours (T6)
```

Poses `cadrage-NNN` (tranche T6) : vue de la caméra du jeu web aux 6 instants de `tests/e2e/cso-framing.mjs` (scénario
`cadrage`, image NNN), avec la mesure du cadrage du web (`framing`) et l'exécution de l'oracle à rejouer (`camRun`). Le
script vérifie que la partie jouée pendant les captures est celle de l'oracle (cheval, caméra, snap). Côté Unreal, la
caméra n'est pas posée : `-StridesShots=cso` rejoue l'exécution par la caméra du cheval
(`AStridesHorse::StepCourseCamera` : sonde par traces dans le décor chargé, sol du relief exporté) jusqu'à l'image, capture
par cette caméra, mesure le cadrage sur la vue de rendu et écrit `cadrage-unreal.json` dans le dossier des captures.

Chaque pose relève aussi l'état des obstacles dans le jeu web au moment de la capture (`course` : hauteurs dans l'ordre
du parcours, numéro surligné) ; `-StridesShots=cso` le pose sur le parcours Unreal avant la capture.

Unreal (rendu GPU réel, jamais `-nullrhi` ; une seule instance d'UnrealEditor, qui quitte seule après la dernière pose) :

```sh
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso [-StridesPose=<préfixe>] \
  [-StridesShotsDir=<dossier dédié>] -abslog="$PWD/.tmp/shots-cso.log"
```

- Lancer `-StridesShots=cso` **par famille de poses** (`-StridesPose=<préfixe>`) : en une seule session, les poses
  `entree-1-*` et `entree-2-*` jouées après d'autres poses n'ouvrent pas la carte (constaté le 20/11/2026, T12 ; par famille,
  captures identiques aux versionnées).
- `-StridesShots=cso` lit `poses.json` (`-StridesPoses=<fichier>` pour un autre) ; `-StridesPose=<préfixe>` : seulement
  les poses dont le nom commence ainsi. Sans `-StridesShotsDir`, chaque capture va au chemin `unreal` de sa pose
  (`unreal/docs/parite/cso/<pose>-unreal.png`, versionné) ; avec, au même nom dans le dossier donné (essai sans toucher
  les captures versionnées).
- FOV : le web règle un FOV **vertical** ; UE 5.8 maintient l'axe **Y** par défaut (`AspectRatio_MaintainYFOV`). La
  caméra de capture des poses fixes impose l'axe **X** et reçoit le FOV horizontal équivalent
  (`AStridesShots::HorizontalFov`). La caméra de concours du cheval (tranche T6) impose l'axe **Y** et reçoit le FOV
  vertical du web tel quel (vérifié par `Strides.Cso.CameraInGame` : projection du moteur en 844 × 390 = projection du
  web ; AspectRatio 1 imposé, sans quoi UE 5.8 garde le champ vertical 2 atan(tan(FieldOfView / 2) / AspectRatio)). La
  perche du monde ouvert garde le réglage du joueur local (axe Y, AspectRatio 16:9 par défaut) : elle montre
  2 atan(tan(27,5°) / 1,778) = 32,6° verticaux, et non 55° (mesure de T6).
- Contrôle : `grep "Strides parite" .tmp/shots-cso.log` (pose, FOV vertical → horizontal, soleil, « écrite ») et
  `sips -g pixelWidth -g pixelHeight <capture>`.

Partie réelle avec l'interface (tranche T7, contrôle adverse) : `-StridesShots=cso-jeu`, avec `-TouchControls` pour les
commandes tactiles sur Mac. Le jeu tourne tel quel (HUD de débogage, interface d'épreuve UMG) ; cavalier à pied au départ
du jeu, puis cheval posé à l'entrée du tracé, cavalière en selle, démonstration automatique de l'épreuve. Captures de la
fenêtre **avec l'interface** aux instants choisis par l'état de l'épreuve (`jeu-1-hors-epreuve`, `jeu-2-cloche`,
`jeu-3-mot`, `jeu-4-course`, `jeu-5-bilan`) et relevé, à l'image rendue, de ce qui est affiché (`jeu-unreal.json` : HUD
de débogage dessiné ou non, boutons tactiles visibles, éléments de l'interface d'épreuve, classes du HUD). Sortie par
défaut : `unreal/docs/parite/cso/` ; `-StridesShotsDir=<dossier>` pour un essai.

```sh
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso-jeu -TouchControls [-StridesShotsDir=<dossier dédié>] \
  -abslog="$PWD/.tmp/shots-jeu.log"
```

Revue des décors et démonstration (`-StridesShots` sans mode) : **toujours avec un dossier dédié**.

```sh
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=1600 -ResY=900 -nosplash -StridesShots -StridesShotsDir=.tmp/shots/$(date +%Y%m%d-%H%M%S) \
  -abslog="$PWD/.tmp/shots.log"
```

- `-StridesShotsDir=<chemin>` : absolu, ou relatif à la racine du dépôt ; créé au besoin.
- Garde-fou : `Saved/Screenshots/Strides/` et `Saved/Screenshots/MacEditor/` contiennent des captures de Julien. Si le
  dossier retenu est l'un d'eux et qu'il contient déjà un fichier (cas de `-StridesShots` sans option), le mode
  n'écrit rien, journalise `Strides shots: REFUS, aucune capture écrite : …` et quitte. La comparaison ne tient pas
  compte de la casse (le volume APFS du Mac ne la distingue pas : `…/Screenshots/strides` est le vrai dossier, refusé
  aussi ; corrigé le 20/11/2026). Un lien symbolique vers ces dossiers n'est pas reconnu : ne pas en créer. Test moteur
  `Strides.Shots.OutputDir`. `scripts/unreal/rebuild-world.sh shots` passe un dossier daté sous `.tmp/shots/`.

### HUD d'épreuve (tranche T7) : poses `hud-*`, 844 × 390 et 667 × 308

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-hud-style.mjs            # styles et oracle cso_hud.json
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-hud-style.mjs --shots --no-oracle  # poses hud-* et captures web
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso -StridesPose=hud- [-StridesShotsDir=<dossier dédié>] \
  -abslog="$PWD/.tmp/shots-hud.log"
```

- `export-hud-style.mjs` lit le DOM et les styles calculés du jeu web en cours d'exécution (rien n'est modifié dans
  `src/`) : `Content/Data/hud_cso_style.json` (styles et boîtes des éléments du HUD d'épreuve dans un état de référence,
  par viewport ; table des masquages par classe), `unreal/core/tests/oracles/cso_hud.json` (le vrai HUD rejoue les appels
  `hud.*` des exécutions de `cso_runs/` et une séquence synthétique sur une horloge virtuelle, à 390 et 768 px de haut ;
  rejoué par `testCsoHud` et `Strides.Parite.CsoHud`). Animations et transitions CSS du HUD coupées dans la page : les
  relevés et les captures montrent l'état d'arrivée.
- `--shots` : 8 états × 2 viewports ; chaque pose garde la caméra et l'heure de `cadrage-040` et rejoue une exécution de
  l'oracle jusqu'à son image (`hud.run`, `hud.frame`, appels ajoutés `hud.extra`), l'état du DOM est relevé (`state`). Les
  autres poses de `poses.json` sont gardées (`export-cso-runs.mjs --shots` garde les poses `hud-*`).
- Unreal : la fenêtre est mise à la taille de la pose (`FSystemResolution::RequestResolutionChange`), le widget `UStridesCsoHud` affiche le
  `strides::CsoHud` rejoué de la même façon, la capture prend la fenêtre AVEC l'interface (`FScreenshotRequest`) ;
  l'état rejoué est comparé à `state` (« identique au web » dans le journal) et l'affichage du widget est écrit dans
  `hud-unreal.json` du dossier des captures. Les joysticks virtuels par défaut du moteur, visibles sur les
  premières captures, sont retirés depuis la tranche T8 (captures refaites : boutons SAUT et pause du web).

### Commandes d'épreuve (tranche T8) : poses `cmd-*`, 844 × 390 et 667 × 308

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-input.mjs              # oracle cso_input.json (~1 min)
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-hud-style.mjs --controls   # styles, cso_pause.json, poses cmd-*
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --freeze     # oracle cso_freeze.json (~45 s)
python3 scripts/unreal/mutations-cso-controls.py   # module de jeu : 16 mutations (~25 min, une instance d'UnrealEditor)
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso -StridesPose=cmd- [-StridesShotsDir=<dossier dédié>] \
  -abslog="$PWD/.tmp/shots-cmd.log"
```

- `--controls` n'écrit que ses sorties (page **tactile** du jeu : `hasTouch`, joystick dessiné ; cavalière montée pour le
  bouton SAUT) : `Content/Data/cso_controls_style.json` (joystick au repos et tenu, boutons SAUT et pause, carte Pause
  ouverte en épreuve, libellés des bascules relevés dans le DOM), `Content/Data/ui/icon-jump.png` et `icon-pause.png`
  (icônes rendues par le navigateur), `unreal/core/tests/oracles/cso_pause.json` (bascules cliquées dans la vraie carte),
  poses `cmd-*` de `poses.json` et leurs captures web. Styles, oracle et poses du HUD (T7) ne sont pas réécrits.
- Pose `cmd-joystick-*` : champ `touch` (doigt posé puis glissé, px CSS) envoyé par `-StridesShots=cso` comme un message
  tactile de la plateforme (`FSlateApplication::OnTouchStarted` / `OnTouchMoved`, ceux qu'envoie iOS), routé par Slate
  jusqu'au viewport du jeu puis à `AStridesPlayerController::InputTouch` (`AStridesShots::SlateTouch`), cheval figé ; les
  doigts reçus par `InputTouch` sont notés dans `cmd-unreal.json` (`touch.events`) ; pose `cmd-pause-*` (`pause`) : carte Pause ouverte par
  le contrôleur (jeu suspendu, l'acteur des captures continue). `tactile` : joystick dessiné (page tactile du web).
- Relevé de l'affichage par famille de poses : `hud-unreal.json` (T7), `cmd-unreal.json` (T8), `aide-unreal.json` (T9 :
  aides affichées et bouton SAUT), `entree-unreal.json` (T10 : cartes et plan) ; chaque pose y note les
  boutons visibles et les boîtes de SAUT, pause et joystick (px CSS) et, en pause, les éléments de la carte.
- Clavier : les touches sont lues par leur code physique (code matériel du Mac) ; `Strides.Cso.PhysicalKeys` vérifie la
  table sur des événements construits (un vrai clavier AZERTY n'a pas été essayé).

### Aides à l'appel (tranche T9) : poses `aide-*`, 844 × 390 et 667 × 308

```sh
"$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \
  -script="$PWD/scripts/unreal/import-cso-aids.py" -unattended -nosplash -nullrhi            # matériaux M_CsoAid(TwoSided)
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=aides  # ~40 min, 20 captures web
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=aides --poses=aide-trace,aide-sans-trace  # quelques poses
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso -StridesPose=aide- -StridesShotsDir=<dossier dédié> \
  -abslog="$PWD/.tmp/shots-aides.log"
```

- `--shots=aides` : partie réelle (exécutions `t9-recette`, `t9-appel`, `t9-aide-bouton`, `t9-aide-off`, `t9-parcours`,
  `t9-courbe`, `t9-ambre` de l'oracle, rejouées depuis le début dans une page neuve par capture) arrêtée à l'image choisie par une
  règle lue dans l'oracle (captures 4 et 5 de la recette, première image « Saute ! », « Trop près » au 3, « Trop tôt » au
  1, aide « bouton seul », aide coupée, volte entre le 1 et le 2 avec et sans tracé, bande ambre seule au 8) ; `--poses=` : ces
  poses seulement (les autres poses `aide-*` de `poses.json` sont gardées). Poses `aide-4-trop-loin-844x390` et
  `aide-5-bonne-zone-844x390` : la capture web du montage est le PNG de la recette (`tests/e2e/out/cso/*.png`, copié,
  empreinte et écart à la capture de l'oracle notés dans `recette`), la capture de l'exécution `t9-recette` est gardée
  dans `<pose>-oracle.png` ; vue de la caméra de concours du jeu, HUD affiché (animations coupées), temporisations de
  `hud.js` sur l'horloge virtuelle, état du DOM relevé (`state`, bouton SAUT compris) ; le canal « ai » de l'image est
  comparé à l'oracle (arrêt sinon). Les autres poses de `poses.json` sont gardées à leur place.
- Unreal : la pose rejoue le canal « ai » jusqu'à l'image dans les aides du parcours (`AStridesShots::ApplyAidsPose`,
  sol du relief du jeu ; aides figées ensuite) et le HUD (bouton SAUT compris) ; caméra posée à l'œil, au point visé et
  au FOV vertical du web ; relevé `aide-unreal.json` (aides et bouton affichés, écarts au web). Copier ensuite les
  captures `aide-*-unreal.png` et `aide-unreal.json` du dossier dédié dans `unreal/docs/parite/cso/`.

### Entrée dans l'épreuve (tranche T10) : poses `entree-*`, 844 × 390 et 667 × 308

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=entree   # ~8 min, 8 captures web
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=entree --poses=entree-2-plan
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso -StridesPose=entree- -StridesShotsDir=<dossier dédié> \
  -abslog="$PWD/.tmp/shots-entree.log"
python3 scripts/unreal/parite-montage.py unreal/docs/parite/cso entree-
```

- `--shots=entree` : exécution `t9-recette` de l'oracle (`tests/e2e/cso-shots.mjs` au pas fixe) rejouée depuis le début
  dans une page neuve par capture, arrêtée à l'image de la capture ; gestes du test entre deux images (pauses des
  captures sur l'horloge virtuelle du HUD, « Voir le plan » touché) ; carte ouverte relevée dans le DOM (`entree.card` :
  kicker, titre, grille, règles, légende, textes et primitives du plan, boutons) ; canal « ai » comparé à l'oracle.
  Poses : `entree-1-presentation` et `entree-2-plan` (image 5), `entree-3-annonce` (28e image après « Entrer en piste »,
  `tick(28)` de `tests/e2e/cso.mjs:62`), `entree-4-cloche` (capture 3-cloche). En 844 × 390, la capture web des poses 1, 2
  et 4 est le PNG de la recette (`tests/e2e/out/cso/`, copie, empreinte et écart notés dans `recette`), la capture de
  l'exécution est gardée dans `<pose>-oracle.png`. `hud.hw` : pause de l'horloge virtuelle après l'image (une capture
  pour la présentation, deux pour le plan).
- Unreal : le cheval monté est posé à la pose ; l'activité est lancée par l'action du joueur au poteau
  (`AStridesPlayerController::DoAction`), la carte s'ouvre au fil des images du déroulé, les boutons sont touchés par le
  widget (`UStridesCsoScreens::ClickForTest`) jusqu'à la carte de la pose (`AStridesShots::ApplyEntreePose`) ; HUD rejoué
  de la même exécution (`hud.hw` compris) ; relevé `entree-unreal.json` (carte affichée comparée au DOM du web, éléments
  affichés, primitives du plan peintes). Copier ensuite `entree-*-unreal.png` et `entree-unreal.json` du dossier dédié
  dans `unreal/docs/parite/cso/`.
- Démonstration (`-StridesShots` sans mode) et partie `-StridesShots=cso-jeu` : depuis T10 rien n'est lancé au démarrage ;
  l'outil lance l'activité par l'action du poteau (le départ du tracé est l'entrée de la carrière, dans la zone de 6 m)
  et touche « Entrer en piste » à l'ouverture de la carte.

### Arrivée et bilan (tranche T11) : poses `bilan-*`, 844 × 390 et 667 × 308

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --shots=bilan   # ~8 min, 8 captures web
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso -StridesPose=bilan- -StridesShotsDir=<dossier dédié> \
  -abslog="<dossier dédié>/shots-bilan.log"
python3 scripts/unreal/parite-montage.py unreal/docs/parite/cso bilan-
```

- `--shots=bilan` : exécution `t9-parcours` de l'oracle (parcours complet sans faute) rejouée dans une page neuve par
  capture, arrêtée à la 15e image après le grand message « SANS FAUTE ! » (`bilan-1-sans-faute`) puis 3 images après
  l'ouverture de la carte de bilan (`bilan-2-carte`) ; carte relevée dans le DOM et comparée au canal « bl » de l'oracle.
  Contrôle adverse de T11 : exécution `t11-trois-barres` (page `?classic` comme son export ; fautes sur deux lignes,
  joueur 14e) arrêtée 3 images après l'ouverture de la carte, corps en haut (`bilan-3-trois-barres`) puis défilé jusqu'en
  bas (`bilan-4-trois-barres-bas`, `scroll: "end"`) ; mise en page de la carte relevée après l'animation d'ouverture
  (boîtes, `scrollHeight`, `more`, puis `scrollTop` et `more` après le défilement : champ `bilan.layout` de la pose).
- Unreal : `bilan-1-*` rejoue le HUD de l'exécution (comme les poses `aide-*`) ; `bilan-2-*` lance l'activité dans
  l'épreuve du niveau et rejoue l'exécution image par image par le chemin du jeu (`StridesCsoRunReplay` : boutons de
  carte touchés par le widget, événements d'obstacle, `TickRun`) jusqu'à l'image de la pose ; carte comparée au DOM du
  web (`AStridesShots::ApplyBilanPose`) ; corps défilé comme le doigt pour `bilan-4` ; boîtes du widget, lignes de la
  grille, défilement et `more` comparés au relevé du web (`layout` de `bilan-unreal.json`). Copier ensuite
  `bilan-*-unreal.png` et `bilan-unreal.json` du dossier dédié dans `unreal/docs/parite/cso/`.
- Référence tactile : `tests/e2e/cso-touch.mjs` écrit `tests/e2e/out/cso/touch-bilan.png` (1688 × 780) ; réduit à
  844 × 390 (`ffmpeg -vf scale=844:390:flags=area`) dans `bilan-touch-844x390-web.png`, assemblé à côté de
  `bilan-2-carte-844x390-unreal.png` dans `bilan-touch-844x390.png` (partie au doigt, chrono différent : voir
  `cso-ecarts.md`, T11).
- Mutations : `python3 scripts/unreal/mutations-cso-ranking.py` (code 0 attendu, non détectées déclarées dans `ATTENDUES`).

### Sons de l'épreuve (tranche T12) et Pixel Streaming

```sh
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-sounds.mjs        # WAV, manifeste, cso_crowd.json
"$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \
  -script="$PWD/scripts/unreal/import-cso-sounds.py" -unattended -nosplash -nullrhi           # /Game/Audio/Cso (PCM)
python3 scripts/unreal/check-pixel-streaming-ios.py [--binary=unreal/StridesGrandTour/Binaries/IOS/StridesGrandTour-IOS-Shipping]
```

- Rendu déterministe : deux exports donnent les mêmes octets ; Chrome somme les connexions d'une entrée dans un ordre
  variable, un rendu peut différer d'un pas de quantification sur quelques échantillons (applause_1p3_4, bell, bell_2) :
  le fichier existant est alors gardé (signalé à l'export).
- Jeu : `UStridesCsoAudio` (sous-système du monde) écrit chaque appel de premier niveau au journal (`fn(arguments)@fichier`,
  même écriture que `testCsoSounds`) et joue son WAV ; bus du public : boucle `crowd_loop` dont le volume suit
  `strides::CsoCrowd` (ambience à la fin de chaque image de jeu, cheer, applause) sur l'horloge audio (temps réel).
- Preuves : `testCsoSounds` (journal du portage = canal « audio » des 94 exécutions), `testCsoCrowd`, tests moteur
  `Strides.Cso.AudioAssets` (SHA-1 du PCM importé) et `Strides.Cso.Audio` (sources câblées dans le jeu),
  `mutations-cso-audio.py`. `check-pixel-streaming-ios.py` : `.uproject` (PixelStreaming2 limité à Mac), modules de la cible
  IOS et Mac selon UnrealBuildTool (`-Mode=JsonExport`), chaîne « pixelstreaming » dans un binaire iOS lié.

## 4. Montage côte à côte

```sh
python3 scripts/unreal/parite-montage.py [unreal/docs/parite/cso] [préfixe]
```

Pour chaque pose de `poses.json` (avec un préfixe : seulement les poses dont le nom commence ainsi) : vérifie que
`<pose>-web.png` et `<pose>-unreal.png` ont exactement la taille du viewport (`sips`), puis les assemble (web à gauche,
`ffmpeg hstack`) dans `<pose>.png`. Code 1 au premier écart.

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
