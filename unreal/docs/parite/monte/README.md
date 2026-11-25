# Essai de monte, voie A : journal

Voie A choisie par Julien le 20/11/2026, voie B (MetaHuman) écartée pour l'instant. Objet : porter les règles de monte du
jeu web v3 (pied dans l'étrier, étrivière de longueur fixe, genou continu, jambe contre le flanc sans le traverser, mains
au-dessus de l'encolure, accompagnement du saut calé sur les posers, montée et descente) en C++ dans `StridesCore`, les
prouver par oracle image par image, puis les appliquer par Control Rig à la cavalière actuelle.

Documents de ce dossier :
- `plan-essai.md` : plan d'essai (étapes, portes G1 à G7, tolérances, conditions d'arrêt) ;
- `oracle-monte.md` : étude des règles du web v3 et de l'oracle ;
- `faisabilite.md` : faisabilité MetaHuman dans UE 5.8.4 (voie B, conservée pour mémoire) ;
- `base.json` : ligne de base de l'étape 1, écrite par `scripts/unreal/monte-base.py` (jamais à la main) ;
- `v3-mesures.md` et `v3-mesures.json` : première mesure de la v3 (étape 2), écrites par
  `scripts/unreal/rider-rules-metrics.mjs` à partir de l'oracle O1 `unreal/core/tests/oracles/monte/o1/` (jamais à la main) ;
- `o2.md` : oracle O2 (étape 3), preuve O2 = O1, rig `rider_f`, mesures de la règle sur les deux rigs et longueurs
  d'étriers pour la décision J3, écrit par `scripts/unreal/rider-rules-o2.mjs` (jamais à la main) ;
- section « Étape 4 » ci-dessous : règles portées en C++ (`StridesCore/RiderRules.h`), preuve contre O2, mutations, coût.

## Synthèse de la voie A pour Julien (24/11/2026, après l'étape 7, les reliquats M1, les clips miroir M2 et le niveau B M3)

La voie A s'arrête à l'étape 7 : la voie B (MetaHuman) est écartée, donc pas d'étape 8 ni suivantes. Les niveaux de preuve
sont séparés : **hors moteur** (C++ seul, `ctest`), **dans le moteur sans rendu** (tests Automation), **en jeu avec rendu**
(captures, mesures du coût).

**Prouvé**
- Hors moteur : les règles de monte du web v3 sont portées en C++ et donnent les mêmes poses que le web, à 0,1 mm près
  (étape 4, ctest `monte`, 306 914 vérifications). La sellerie du cheval (siège, ancres, postérieurs) est portée et
  vérifiée contre O1 (étape 5, ctest `monte-cheval`). La chaîne cheval → règle → pose, avec le retard d'une image du web,
  est elle aussi vérifiée (étape 6, ctest `monte-cavaliere`).
- Dans le moteur, sans rendu, **niveau A** : avec `-StridesRider=regles`, la cavalière actuelle, rejouée avec les entrées
  du web, est à 0,0001 cm d'O2 sur 689 images (arrêt, transition, galop à gauche et à droite, sauts de 1,10 m et
  1,40 m ; `Strides.Parite.RiderRules`, `niveau-a.md`). Posé comme le web, le cheval Unreal donne le même siège et les
  mêmes repères : ancres à 1,8 mm, siège à 0,08° (`Strides.Parite.HorseSeat`).
- **Clips miroir (étape M2)** : la cuisson `bakeMirror` portée en C++ redonne au bit près les 11 clips à main gauche du
  web (ctest `monte-miroir`) ; dans Unreal, avec `-StridesHorseLead=web`, galop et saut à main gauche, os visibles à
  0,0124 cm du web pour les clips importés à 24 images/s (`Strides.Parite.HorseMirror`) ; trot et jump_gallop, importés à
  30 images/s, s'écartent de 2,7 à 20,9 cm (import, déclaré).
- **Par défaut depuis l'étape S2 b (25/11/2026)** : cavalière de la règle, main du web et sellerie du web forment un
  ensemble (`StridesMonteOptions`, `Strides.Monte.Options`) ; `-StridesMonte=ancien` rend l'ancien comportement.
  Captures du CSO refaites, relevés du concours identiques avant et après (étapes S2 a et S2 b ci-dessous).
- **Taille du cheval (étape S3 a, 25/11/2026)** : l'écart de 3,74 % vient de la constante 0,01 de l'acteur (import et
  clips redonnent l'échelle du web à 2,6e-7 près) ; `-StridesHorseScale=web` donne la taille du web (garrot à 1,48 m des
  sabots, `Strides.Parite.HorseScale`) ; relevés du concours identiques, niveau B 61 → 58 critères non tenus.
- **Coût en jeu, rendu réel (étape 7)** : la règle ajoute **+0,03 ms à l'arrêt et +0,05 ms au galop** au temps du jeu. Le
  seuil était de 0,3 ms ; la mesure se répète d'une passe à l'autre à 3,5 % près. Aucune différence de temps GPU n'est
  mesurable au-delà du bruit (`cout.md`).

- **Phase de foulée (étape M3)** : le cheval Unreal donne à la règle la phase du web (`horse.anim.phase` : calage des clips
  `align` et `gaitInfo.offset` porté en C++, `StridesCore/HorsePhase`), et non plus la phase brute de son clip : calage
  recalculé égal à celui du jeu web (écart 0), phase égale à celle d'O1 à 2,2e-16 près sur 753 images (ctest
  `monte-cheval`) et à 5e-10 près sur 515 images du cheval Unreal posé par son mélangeur (`Strides.Parite.RiderOnHorse`).
  `contactOff`, `horseY` et `postOffset` valent 0 : exact pour le cheval Unreal (il n'abaisse pas son corps à l'appel, ne
  suit pas la pente ; `riderPostOffset` n'est affecté nulle part dans le web), vérifié par le test.

**Partiel**
- **Niveau B (étape M3, dans le moteur sans rendu)** : la cavalière est rejouée sur le cheval Unreal (689 images, E1 à
  E3b, dont 362 avec un clip miroir), tout ce que la règle lit venant d'Unreal. Le rejeu lui-même est juste : avec le même
  cheval posé comme celui du web, la cavalière redonne O2 à 0,64 cm près avant le premier saut (555 images). Sur le cheval
  du jeu, **61 critères sur 215 ne sont pas tenus** contre O1 (`niveau-b.md`) ; 20 des 23 seuils absolus manqués le sont
  aussi par O1 (règle du web) ; contre O2 (mêmes proportions), 22 écarts sur 83 et 2 phases du saut. Sans saut (E1 à
  E2d), ils viennent du cheval du jeu (3,7 % plus petit, pas d'inclinaison en virage ; le contrôle, cheval posé comme le
  web, reste sous 0,64°) : hanche jusqu'à 14°, ouverture du genou jusqu'à 21°, assise au pas jusqu'à 2,3 cm. Aux sauts
  s'ajoutent le corps non remonté (poser des postérieurs d'E3 détecté 12 images trop tôt) et la phase tenue (locomotion
  procédurale du web non portée : jusqu'à 4,1 cm aux mains après la réception ; dans le contrôle, jusqu'à 7,1° sur l'ouverture du genou et 3,7° sur la hanche en E3).
- Captures appariées (même image d'O1, même caméra dans le repère du cheval) à l'arrêt, au galop à droite et à gauche et
  au sommet du saut (`captures/niveau-b/`, étape M3) ; décors différents ; sellerie absente du cheval Unreal à M3, refaites
  avec la sellerie complète à l'étape S1 (`captures/sellerie/`, avant / après).
- **Sellerie complète (étape S1)** : selle, tapis, liseré, sangle, filet, mors et guêtres importés du web (géométries de
  `pjl/tack.js`, mêmes os, mêmes poids), étriers, étrivières et rênes portés en C++ (`StridesCore/HorseStraps`, identiques au
  bit au web sur 929 images) ; étrier sous l'orteil de la cavalière. Avec `-StridesRider=regles` ou `-StridesTack=web`.
  Pièces à 0,44 cm du web aux images posées par les seuls clips ; au saut, elles suivent le cheval Unreal (corps au saut
  non porté : S4). M4 ≤ 1,00 cm (seuil 2 cm), M5, M8 et M18 mesurés (`niveau-b.md`).
- Captures côte à côte à l'arrêt et au galop (`captures/`, refaites le 24/11 aux reliquats M1) : la cavalière est assise,
  pieds sous elle, mains au-dessus du garrot ; avec l'option, queue de cheval, yeux et sourcils de nouveau rendus. Ce ne
  sont pas des poses jumelles (décor et phase différents). Le « retard de 9 cm » au galop était l'instant du relevé (milieu
  de l'image) : en fin d'image, la cavalière est sur le siège (0 cm, `Strides.Monte.EnJeu`).
- Le Control Rig est construit par script, mais le jeu utilise un calcul C++ équivalent, non prouvé identique au nœud
  du Control Rig.
- Mutations du composant de sellerie dans le moteur : les 18 passées aux reliquats M1 ; 16 détectées, 2 déclarées dont une
  non départagée (tangage, bassin et garrot inversés), en plus de « saut ignoré » déjà déclarée.
- Mesure du coût : le temps du fil de rendu inclut l'attente de l'écran à 60 Hz et ne mesure pas le travail. La valeur
  absolue du GPU sur Metal est à confirmer. La mémoire est celle du processus entier et ne départage pas les options.
  L'aperçu du rendu mobile sur Mac démarre, mais se fige à la capture, avec un `ensure` Metal (`cout.md`).

**Non vérifié**
- **Niveau B en jeu avec rendu** : le niveau B est mesuré sur le cheval Unreal rejoué par les oracles (trajectoire et
  clips du web), pas sur une partie jouée : en jeu, le cheval Unreal avance ses clips à vitesse 1 (cadence du web non
  portée), lit son propre virage et ses propres sauts (horloge du saut du web non portée).
- Sellerie dans le jeu par défaut : faite à l'étape S2 b ; M19 (montée, descente) sans oracle. Jeu empaqueté iOS avec le
  nouveau défaut : non construit (à confirmer).
- Coût sur iPhone ou iPad : aucun appareil branché (étape 16). Les chiffres du Mac classent les options, sans prédire le
  coût sur un téléphone.
- Réalisme équestre : c'est à Julien d'en juger sur les captures ; aucun oracle ne le prouve.

Cadre de la phase en cours : copie de travail isolée (branche locale `claude/monte-voie-a`, sans les binaires de
`Content/` sauf `Content/Data`, `node_modules` en lien vers le dépôt principal), aucun Unreal Build Tool, aucun
UnrealEditor ; la tranche CSO avance en parallèle sur `claude/unreal-port`. Fusion après la fin de la tranche CSO.

## Commandes (depuis la racine de la copie, `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`)

```sh
python3 scripts/unreal/monte-base.py              # relève la base : G1, G5, G6, G7, versions, disque -> base.json (~1 min 30)
python3 scripts/unreal/monte-base.py --verifier   # portes de fin d'étape comparées à base.json (code 1 : régression ;
                                                  # code 2 : moins de 8 Gio libres, condition d'arrêt S3)
npx vite --config scripts/unreal/vite-monte.config.mjs --host 127.0.0.1 --port 5176 --strictPort   # jeu web de référence
# Étape 2 (serveur 5176 lancé) : oracle O1 et ancres de sellerie (~15 min), puis mesures (quelques secondes)
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-rider-rules.mjs --anchors   # [--only=E1,E3]
node scripts/unreal/rider-rules-metrics.mjs                     # -> unreal/docs/parite/monte/v3-mesures.md et .json
# Étape 3 (sans navigateur ni serveur) : rig de la cavalière réaliste, oracle O2, page o2.md (~1 s), mutations (~30 s)
python3 scripts/unreal/rig-from-glb.py                          # -> unreal/core/tests/oracles/monte/rigs/rider_f.json
node scripts/unreal/rider-rules-o2.mjs                          # -> oracles/monte/o2/, rigs/web_classic.json, o2.md
node scripts/unreal/rider-rules-o2.mjs --fit=stirrupY=-0.62     # longueur d'étriers J3 (m) -> .tmp/monte/o2-fit
python3 scripts/unreal/mutations-monte-o2.py                    # 93 mutations d'anim.js et du rejeu, copies dans .ue-cache/travail/
# Étape 4 (C++ hors moteur) : paramètres, test contre O2 (dans ctest, ~2 s), mutations (~3 min), banc de coût (Release)
node scripts/unreal/export-rider-rules-data.mjs                 # -> Content/Data/rider_rules.json (--check : comparaison)
cmake -S unreal/core -B build/core-monte && cmake --build build/core-monte && ctest --test-dir build/core-monte --output-on-failure
python3 scripts/unreal/mutations-rider-rules.py                 # 97 mutations de RiderRules.cpp, copies dans .ue-cache/travail/mutations-monte
cmake -S unreal/core -B build/core-monte-rel -DCMAKE_BUILD_TYPE=Release && cmake --build build/core-monte-rel --target strides_monte_bench
build/core-monte-rel/strides_monte_bench unreal/core/tests/oracles/monte unreal/StridesGrandTour/Content/Data 10000 rider_f
# Étape 5 (moteur) : données de sellerie (Node seul, ~2 s), ctest « monte-cheval », test moteur, mutations
node scripts/unreal/export-horse-tack.mjs                      # -> Content/Data/pjl_horse_tack.json (--check : comparaison)
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides.Parite.HorseSeat; Quit" -unattended -nullrhi -nosplash -log -stdout -ReportExportPath=<dossier>
python3 scripts/unreal/mutations-horse-tack.py [--moteur]      # cœur : copies dans .ue-cache/travail/ (~30 s) ; --moteur : UBT + éditeur (~25 s chacune)
# Étape 6 (moteur) : données de la cavalière, ctest « monte-cavaliere », test moteur (niveau A), page niveau-a.md, mutations.
# Depuis la migration (23/11/2026) : éditeur par le chemin réel du moteur et du projet (étape 6) ; par les chemins réels, UBT
# compile sans -NoUBA (reliquats M1, 24/11/2026).
python3 scripts/unreal/export-rider-rig-data.py                # -> Content/Data/monte_rider_f.json (--check : comparaison)
"$UE_REEL/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "<chemin réel>/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides.Parite.RiderRules; Quit" -unattended -nullrhi -nosplash -log -stdout \
  -StridesMonteDir=<dossier> -ReportExportPath=<dossier>
node scripts/unreal/rider-rules-niveau-a.mjs --unreal=<dossier>/unreal-rider_f   # -> niveau-a.md, niveau-a.json
python3 scripts/unreal/mutations-rider-rig.py [--moteur]       # cœur : ~15 s ; --moteur : UBT + éditeur (~3 min chacune)
"$UE_REEL/Engine/Binaries/Mac/UnrealEditor-Cmd" "<chemin réel>/…/StridesGrandTour.uproject" -run=pythonscript \
  -script="<chemin réel>/scripts/unreal/build-rider-controlrig.py" -unattended -nullrhi   # asset Control Rig (non utilisé en jeu)
# Étape 7 (rendu GPU réel, session ouverte) : ctest « perf », passes du mode -StridesShots=perf (~2 min 30 chacune), résumé
python3 scripts/unreal/perf-summary.py --mesurer --sortie=<dossier> --passes=3 [--libre] [--apercu-mobile] --ecrire  # -> cout.md, perf/
python3 scripts/unreal/perf-summary.py unreal/docs/parite/monte/perf   # résumé seul, depuis les fichiers versionnés
python3 scripts/unreal/mutations-perf.py                       # 12 mutations (PerfStats.cpp, recalcul du résumé), ~20 s
# Reliquats M1 : sorties des mutations sous .ue-cache/travail/ (scripts/unreal/ue_travail.py, chemins réels, -trace=none)
"$UE_REEL/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "<chemin réel>/…/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides.Monte.EnJeu; Quit" -unattended -nullrhi -nosplash -trace=none -abslog=<journal> -ReportExportPath=<dossier>
python3 scripts/unreal/mutations-monte-jeu.py                  # 9 mutations moteur (ordre des ticks, bornes, BeginPlay), ~13 min
# Étape M3 (niveau B) : calage de la phase (Vite 5178), test moteur, page niveau-b.md, mutations, captures appariées
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-horse-phase.mjs   # -> Content/Data/pjl_horse_phase.json (--check)
"$UE_REEL/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "<chemin réel>/…/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides.Parite.RiderOnHorse; Quit" -unattended -nullrhi -nosplash -trace=none \
  -abslog=<journal> -StridesMonteDir=<dossier> -ReportExportPath=<dossier>
node scripts/unreal/rider-rules-niveau-b.mjs --unreal=<dossier>/unreal-niveau-b --controle=<dossier>/unreal-niveau-b-web   # -> niveau-b.md, .json
python3 scripts/unreal/mutations-rider-on-horse.py [--moteur]   # cœur ~20 s ; --moteur : UBT + éditeur (~2 min 30 chacune)
BASE=http://127.0.0.1:5178 node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-rider-rules.mjs --shots=<dossier> \
  --only-shots=arret,galop,galop-gauche,saut-sommet                               # web + poses.json (-> captures/niveau-b/)
"$UE_REEL/…/UnrealEditor" "<chemin réel>/…/StridesGrandTour.uproject" -game -windowed -ResX=844 -ResY=390 -StridesShots=monte-b \
  -StridesRider=regles -StridesHorseLead=web -StridesShotsDir=<dossier> -StridesMontePoses=<captures/niveau-b/poses.json> -abslog=<journal>
# Étape S1 (sellerie complète) : oracle sellerie/ et géométrie (Vite 5178), GLB et données, import, ctest, tests moteur,
# mutations, captures avant / après, coût
BASE=http://127.0.0.1:5178 node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-rider-rules.mjs --sellerie   # -> oracles/monte/sellerie/
BASE=http://127.0.0.1:5178 node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-rider-rules.mjs --sellerie-maillage=<travail>
python3 scripts/unreal/tack-horse-glb.py --travail=<travail>   # -> <travail>/horse_pjl_tack.glb, Content/Data/pjl_horse_tack_mesh.json
STRIDES_TACK_GLB=<travail>/horse_pjl_tack.glb "$UE_REEL/Engine/Binaries/Mac/UnrealEditor-Cmd" "<chemin réel>/…/StridesGrandTour.uproject" \
  -run=pythonscript -script="<chemin réel>/scripts/unreal/import-horse-tack.py" -unattended -nosplash -nullrhi   # -> Content/Characters/Horse/horse_pjl_tack
"$UE_REEL/…/UnrealEditor" "<chemin réel>/…/StridesGrandTour.uproject" -ExecCmds="Automation RunTests Strides.Parite.HorseTackMesh+Strides.Parite.RiderOnHorse; Quit" \
  -unattended -nullrhi -nosplash -trace=none -abslog=<journal> -ReportExportPath=<dossier> -StridesMonteDir=<dossier>
python3 scripts/unreal/mutations-horse-straps.py [--moteur]    # cœur ~30 s ; --moteur : UBT + éditeur
"$UE_REEL/…/UnrealEditor" "<chemin réel>/…/StridesGrandTour.uproject" -game -windowed -ResX=844 -ResY=390 -StridesShots=monte-b -StridesRider=regles \
  -StridesHorseLead=web [-StridesTack=aucune] -StridesShotsDir=<dossier> -StridesMontePoses=unreal/docs/parite/monte/captures/niveau-b/poses.json -abslog=<journal>
python3 scripts/unreal/perf-summary.py --mesurer --sellerie --sortie=<dossier> --passes=3     # regles contre regles-sans-sellerie
# Étape S3 (taille du cheval) : mesure et option (sans rendu), niveau B avant / après, captures avant / après, mutations
"$UE_REEL/…/UnrealEditor" "<chemin réel>/…/StridesGrandTour.uproject" -ExecCmds="Automation RunTests Strides.Parite.HorseScale+Strides.Monte.Options; Quit" \
  -unattended -nullrhi -nosplash -trace=none -abslog=<journal> -ReportExportPath=<dossier>
"$UE_REEL/…/UnrealEditor" … -ExecCmds="Automation RunTests Strides.Parite.RiderOnHorse; Quit" … -StridesMonteDir=<dossier> [-StridesHorseScale=web]
node scripts/unreal/rider-rules-niveau-b.mjs --unreal=<dossier>/unreal-niveau-b --controle=<dossier>/unreal-niveau-b-web --out=<dossier>/niveau-b
"$UE_REEL/…/UnrealEditor" … -game -windowed -ResX=844 -ResY=390 -StridesShots=monte-s2 -StridesMonteS2Parcours -StridesShotsTag=<avant | apres> \
  -StridesShotsDir=<dossier> [-StridesHorseScale=web]           # captures et regard sur chaque saut du parcours (journal)
python3 scripts/unreal/mutations-monte-jeu.py --noms=S3        # 14 mutations de la taille (Strides.Monte et HorseScale)
```

`vite-monte.config.mjs` reprend `vite.config.js` et place le cache de Vite dans `.tmp/monte/vite-cache` : sans lui, le
serveur de la copie écrirait `node_modules/.vite` du dépôt principal, que le serveur du port 5173 utilise (le hachage de
pré-optimisation dépend de la racine du projet). `monte-base.py` fait de même pour Vitest.

## Étape 1. Préflight et ligne de base (20/11/2026)

Base : `3e188b91` (« Aides à l'appel : bouton SAUT coloré… (T9) »). Valeurs exactes dans `base.json`.

| Porte | Résultat à la base |
|---|---|
| G1 cœur | vert : 1 test ctest, 248 386 vérifications, 0 échec, 0 avertissement à la compilation complète |
| G5 captures | vert : montage des 150 PNG de `parite/cso` refait sans aucun octet changé ; empreinte globale dans `base.json` |
| G6 inventaire | vert : code 0 ; 687 fonctions, 29 identiques prouvées, 262 partielles, 396 absentes ; 169/169 fichiers JS ; `PARITE.md` inchangé |
| G7 web intact | vert : `git diff --quiet HEAD -- src public tests` code 0 ; `riderPosture` 4/4 ; suite unitaire 30 fichiers, 297/297 |
| G2, G3, G4 | non lancées dans cette phase (UBT et UnrealEditor exclus ; aucun source CSO touché) |

Constats :
- Le jeu web de la copie, servi sur le port 5176, atteint l'état `play` depuis `/?autostart` sans erreur de page ni de
  console (Chrome sans tête du Mac, 844 × 390).
- Versions, mémoire, disque libre et tailles des paquets locaux du dépôt principal (`Builds/`, ignorés par git) : `base.json`.

## Étape 2. Oracle O1 des règles de monte du web v3 (20/11/2026)

Produits (tous écrits par script) :
- `scripts/unreal/export-rider-rules.mjs` : export du jeu web en cours d'exécution, au moule de `rider-audit.mjs`
  (plans des scénarios relus dans son source) et d'`export-cso-runs.mjs` (graine 20261118, horloges virtuelles) ;
- `unreal/core/tests/oracles/monte/o1/` : 8 scénarios, 929 images, 8,9 Mo au total, 1,36 Mo pour le plus gros
  fichier ; schéma `strides.oracle.rider_rules/1`, canaux `ui`, `in`, `cl`, `cq`, `tg`, `hz`, `mx`, `rz`, `dg`, `pe`
  décrits dans `index.json` ;
- `unreal/StridesGrandTour/Content/Data/pjl_tack_anchors.json` (option `--anchors`) : 11 ancres de sellerie (os par nom,
  poids, point local en espace de liaison, matrices inverses de liaison), 450 sommets du profil de flanc et 288 de
  l'encolure, réglages du cheval ;
- `scripts/unreal/rider-rules-metrics.mjs` : M1 à M18 depuis n'importe quel dossier au format (O1 aujourd'hui, O2 et les
  sorties Unreal ensuite), avec `flankAt`, `crestAt` et `THIGH_MARGIN` relus dans `anim.js` ; il écrit `v3-mesures.md`
  et `v3-mesures.json`.

Acceptation :

| Critère du plan | Résultat |
|---|---|
| Deux exports successifs identiques à l'octet | atteint : deux exports complets depuis des pages neuves, `shasum` identique pour les 9 fichiers de `o1/` et pour `pjl_tack_anchors.json` (le second export n'a réécrit aucun fichier) |
| M4 = 0,015 m ± 1e-6 à toutes les images en selle | atteint sous sa forme exacte : l'étrier est posé à `0,015 · scale` sous l'avant-pied (`horse.js:209-210`), soit 0,014775 m ; écart maximal 5,6e-14 m sur les 929 images. Le plan écrivait 0,015 m : c'est le chiffre arrondi de l'audit v2 |
| Plus gros fichier sous 20 Mo | atteint : 1,36 Mo |
| `v3-mesures.md` : min et max de M1 à M17 par scénario, écart rendu–règles | atteint (M8 mesuré dans la page sur la fenêtre de mesure ; M18 en plus) |
| G7 | atteint : `git diff --quiet HEAD -- src public tests` code 0 ; voir la vérification de fin d'étape |

Adaptations du plan (déclarées dans les en-têtes des fichiers) :
- Dossier `oracles/monte/o1/` au lieu de `oracles/rider_rules/` (consigne de la phase).
- Le canal `in` est relevé **juste après** `hu.animateRiding`, pas avant : `animateRiding` calcule les entrées puis appelle
  `animateHuman`, qui ne les modifie pas ; avant l'appel, `hu.anim` contient encore celles de l'image précédente.
- `in.fit` est en unités du modèle, exactement ce que lit la règle (mètres = valeur × `scale`) : la relecture d'O2 à 1e-6
  ne dépend ainsi d'aucune conversion.
- Mise en selle : `Human.mount` immédiat dans une page neuve, après une image de mise en place non exportée qui donne au
  cheval WildMesh recréé ses premiers profils (sans elle, la première image voit un flanc nul).
- E2g et E2d partent de l'arrêt : 60 images de mise en train sur le même cercle précèdent les 80 images du plan. E3 et
  E3b finissent 45 images après la réception (30 dans `rider-audit.mjs`), pour inclure le retour sous 10 %.
- E4 et E5 (montée, descente) non exportés ; E6t (trot) et E6v (virage à droite) exportés hors acceptation.
- Point 7 du plan (champs du mélangeur) : canal `mx` = actions actives (nom, poids, temps du clip), état de saut de la
  vue, `leadBlend`, `idleTime`, hauteur et roulis du corps, `contactOff`, ressorts de `SecondaryMotion` (la bascule
  tourne les os de l'encolure, donc le profil `crest`), instantané `_snapshot`.

Constats de cette première mesure (chiffres : `v3-mesures.md`) :
1. **Cheville à 1,0 cm de sa cible, à toutes les images.** L'os `lFoot` a un décalage de repos `[0, −0,39, −0,01]` ;
   `ik2` prend sa longueur mais suppose le segment le long de −Y. Le portage C++ doit reproduire ce comportement tel quel.
2. **Jambe dans le profil de flanc vu par la règle**, au galop, à l'arrêt depuis le galop et au saut : M7 jusqu'à
   −13,2 cm (cuisse à mi-longueur, E3b), −7,9 cm au tibia (E6v), −5,9 cm au genou (E3b) ; en E3, le pôle du genou
   gauche est à sa borne (0,90) à ces images. Les axes d'os n'entrent pourtant pas dans le maillage du cheval (M8 de 0,2 cm au plus). **Le seuil absolu
   « M7 ≥ −1,0 cm » des niveaux A et B est donc dépassé par le web lui-même** : à trancher avant l'étape 4 (garder
   seulement |Unreal − O2| ≤ 1 cm au niveau A, ou se fixer un autre seuil).
3. **Postérieurs reposés détectés tard en E3** : entre le poser des antérieurs (image 59) et l'image 80, les os
   `toes_02` restent à 11,4 cm du sol au moins (seuil `HIND_DOWN` 10 cm) ; la règle cesse d'attendre au bout de `holdMax`
   (image 73) et la détection n'arrive qu'à la foulée suivante (cheval à l'image 81, règle à l'image 82). En E3b, elle a
   lieu à l'image 76, juste avant `holdMax`.
4. **Poignet sous `handClear` au saut** : M9 descend à 6,8 cm en E3 (règle 10 cm, seuil B 9 cm) ; l'allonge du bras à
   0,97 ramène le poignet vers l'épaule. M9 = 8,9 cm en E2g, E3b et E6v.
5. **Continuité** : 20,1° en une image sur l'avant-bras gauche en E3 (24,8° en quaternion local), à l'image 42 qui suit
   l'appel (main rendue) ; dans les autres scénarios, 10,3° au plus par segment et 13,6° en quaternion (E1b).
6. **Étrivières dissymétriques à l'arrêt** : 47,9 cm à gauche, 53,0 cm à droite (E1). Dans S, les porte-étrivières sont
   à +14,1 et −8,6 cm de l'axe (S est recentré sur le milieu des ancres d'étrier qui pendent), les plantes à +40,8 et
   −42,3 cm.
7. **Rendu réaliste contre règles** : la botte de `rider_f.glb` est à 2,5 à 3,3 cm de la plante des règles (1,8 à
   2,5 cm plus haut), à 2,4 à 3,3 cm de l'étrier affiché ; son poignet est à 0,3 à 4,9 cm de celui des règles (bras plus
   court), mais plus haut au-dessus de l'encolure (22,0 cm contre 16,4 à l'arrêt, 9,3 contre 6,8 en E3).

Chiffres pour la décision J3 (longueur d'étriers), détaillés dans `v3-mesures.md` :
- stirrupY retenu par le cheval : −64,0 cm sous le point d'assise, c'est la borne la plus courte ; l'ancre seule
  donnerait −63,8 cm (1,6 mm plus court). stirrupZ 10,1 cm, stirrupX 40,2 cm.
- À l'arrêt (E1) : genou 132,2° en moyenne, ρ 0,914 (plafond assis 0,93), hanche 141,9°, talon 8,0°.
- Au galop (E2g, E2d) : genou de 117,5 à 142,1°, ρ jusqu'à 0,946 (plafond de la règle hors de la selle : 0,95) ; le bassin descend
  jusqu'à 3,0 cm sous sa hauteur assise et la plante remonte jusqu'à 2,9 cm au-dessus du point d'étrier. Au galop, la
  jambe de la v3 est donc à sa portée maximale.
- Au sommet du saut (E3, E3b) : genou 142,1°, ρ 0,946, hanche 116,4 à 116,7°, assise +1,6 à +1,7 cm.
- Estimation géométrique, à confirmer par O2 à l'étape 3 : à l'arrêt, chaque centimètre de raccourcissement ferme le
  genou d'environ 3° (131,4° à 0 cm, 125,3° à 2 cm, 117,4° à 5 cm).

Fin d'étape : `python3 scripts/unreal/monte-base.py --verifier` s'est arrêté sur la condition S3 (7,9 Gio libres, sous
le seuil de 8 Gio ; l'étape elle-même occupe environ 25 Mo). Portes légères passées à la main, sans rien supprimer :
G7 (`git diff` code 0, aucun fichier non suivi sous `src`, `public`, `tests` ; `riderPosture` 4/4), G1 (`ctest` sur
`build/core-monte` : 1/1, cœur non modifié), G6 (`build-parite.py` code 0, `PARITE.md` inchangé). G5 non relancée :
aucune capture touchée. Mutations : sans objet à cette étape (le web est en lecture seule) ; elles portent sur le C++ à
l'étape 4 (`mutations-rider-rules.py`).

## Étape 3. Oracle O2 : la règle du web rejouée hors navigateur (20/11/2026)

Base : `7ddfdd99` (étape 2). Étape reprise après une interruption : les fichiers laissés par la première exécution ont été
relus et rejoués ; ils redonnaient leurs propres sorties à l'octet. Corrections apportées à la reprise : contrôle O2 = O1
rendu impossible à sauter (une échelle différente ou une image manquante est un échec), écart `NaN` compté comme infini,
état interne absent comparé sans planter, fichiers versionnés écrits seulement pour l'oracle complet (jamais avec
`--out`), mention « convention à confirmer » dédoublée dans `o2.md`, colonnes assise et pied écarté ajoutées au tableau
des étriers.

Produits (tous écrits par script) :
- `scripts/unreal/rider-rules-o2.mjs` : importe `src/entities/human/anim.js` et `skeleton.js` **inchangés** dans Node
  (sans Vite ni navigateur), construit le squelette de 25 os d'un rig (os `three.js`, `userData.rest`, `__rig.info`) et
  rejoue le canal `in` d'O1 image par image ; il écrit `cl`, `cq`, `tg`, `dg` au format d'O1 et la page `o2.md` ;
- `unreal/core/tests/oracles/monte/o2/` : 2 rigs × 8 scénarios, 1 858 images, 7,4 Mo au total (rigs compris), 0,58 Mo
  pour le plus gros fichier ; schéma `strides.oracle.rider_rules_o2/1`, `index.json` avec les contrôles ;
- `unreal/core/tests/oracles/monte/rigs/web_classic.json` (depuis `skeleton.js`) et `rider_f.json` (par
  `scripts/unreal/rig-from-glb.py`, lecteur GLB sans dépendance : nœuds de `public/real/rider_f.glb`, calage de
  `realistic.js _calibrate`, semelle et poing relevés dans la page par l'exporteur O1) ;
- `scripts/unreal/mutations-monte-o2.py` : 93 mutations sur des copies d'`anim.js` (75) et du rejeu (18), dans `build/`.

Acceptation :

| Critère du plan | Résultat |
|---|---|
| O2 `web_classic` à l'échelle enregistrée reproduit O1 (`cl` et `tg`) à 1e-6 m et 1e-6 rad, toutes images, tous scénarios | atteint sur les 929 images des 8 scénarios : `cl` 2,9e-9 m, `cq` 1,0e-8 rad, `tg` 1,1e-16 m, orientations des pieds 2,2e-16 rad, état interne `dg` 2,2e-16. Les entrées exportées sont complètes |
| Deux exécutions identiques à l'octet | atteint : `shasum` des 17 fichiers d'`o2/`, des 2 rigs et d'`o2.md` identique d'une exécution à l'autre ; deux sorties `--out` comparées par `diff -r` |
| O2 `rider_f` produit | atteint : 8 scénarios ; le rig, animé par les rotations du classique, redonne le rendu réaliste du web (`rz`) à 1,1e-6 m près (tolérance 2e-6, `rz` étant arrondi au millionième) ; boule du pied à 1,4e-7 m de la page |
| Option `--fit stirrupY=…` | atteinte : `--fit=stirrupY=<m>` (et `stirrupX`, `stirrupZ`, `handX`, `handY`, `handZ`, `legClear`), sortie hors de l'oracle versionné |
| Plus gros fichier sous 20 Mo | atteint : 0,58 Mo |
| G7 | atteint : voir la fin d'étape |

Mutations (`mutations-monte-o2.py`, code 0) : 93 mutations, 81 détectées par l'écart à O1, 0 plantage. Les 12 autres
sont listées dans `ATTENDUES` avec leur raison, et chaque raison est prouvée par une sonde rejouée sur O1 (copie
d'`anim.js` qui lève une erreur quand la condition est vraie) ; pour chacune, les écarts à O1 sont identiques à ceux du
témoin. Ce sont les parties de la règle que **O1 n'exerce pas** : vitesse au-delà de 9 m/s (le galop allongé), salut
(`st.wave`), queue de cheval (`hairTail` nul à toutes les images), pas autre que 1/30 s, allonge d'`ik2` au-delà de 0,98
de la longueur du membre, tolérance « genou au-delà de la cheville » (`room()` jamais faux), borne de 12 cm de l'écart du
pied (`xMax` toujours plus serrée), fenêtre de 0,25 s et borne 0,97 de `hugMemory` (la seconde est du code mort par
construction), marge de 5 mm et seconde passe de la remontée du pied (atteinte, sans effet). L'étape 4 ne pourra pas
départager ces mutations dans le C++ contre O2 non plus ; pour les couvrir, il faudrait des scénarios de plus (galop
allongé, salut), à décider.

Adaptations du plan (déclarées dans les en-têtes des scripts) :
- Node seul au lieu de vite-node : `anim.js` n'importe que `three` ; aucun cache n'est écrit dans `node_modules`.
- Dossiers `oracles/monte/o2/<rig>/` et `oracles/monte/rigs/` au lieu de `rider_rules_o2/` et `rider_rules/rigs/`.
- `web_classic.json` est écrit par `rider-rules-o2.mjs` depuis `skeleton.js` (le personnage classique n'a pas de GLB :
  `humanModel.js:29` le construit par `boneDefs`) ; le script vérifie qu'il est identique au squelette enregistré dans O1.
- `rider_f` : `seatToHips` est une convention à confirmer à l'étape 6 (classique × rapport `hipScale` de
  `realistic.js:726`) ; `heelBack` et `height` restent nuls, la monte ne les lit pas. Pas de rig `rider_m` : O1 ne relève
  la semelle et le poing que du modèle affiché (`rider_f`).
- Mutations ajoutées à cette étape (le plan ne les prévoyait qu'à l'étape 4, sur le C++).

Constats :
1. **O2 = O1 à 1e-8 près** : la règle ne lit rien d'autre que le canal `in`. Seul écart au-delà de 1e-12 : le lissage des
   os par `Quaternion.slerp`, qui change de branche selon `cosHalfTheta`. Vérifié dans Node par une sonde hors dépôt : à
   l'image 69 d'E3b, `lFore` est à un ulp de sa cible (`cosHalfTheta` = 0,9999999999999999, branche d'interpolation
   linéaire), puis à 1,0000000000000002 à l'image 70 (aucun mouvement) ; l'écart à O1 apparaît à l'image 69 (5,0e-9 sur
   une composante) et se divise par 4 environ à chaque image (lissage à 40 /s). Le côté Chrome n'est pas observé : la
   branche prise par O1 à cette image reste à confirmer.
2. **La règle dépasse sa propre portée maximale avec `rider_f`.** ρ (hanche–cheville rapportée à la jambe, mesurée sur
   le squelette) atteint 0,956 en E3b à la longueur v3, et 0,96 à 0,97 avec des étriers plus courts (règle : `riseReach`
   0,95 ; seuil du niveau B : 0,955). Mécanisme vérifié par une sonde hors dépôt sur E3b : la cible de la cheville est
   bornée à 0,9500 par la remontée, puis `hugMemory` garde le pied écarté (refermeture à `FOOT_RELAX`, 2 cm/s) et la
   portée de la cible passe à 0,9593 (pied gauche 1,65 cm plus loin) ; la cheville réelle est à 1,0 cm de sa cible
   (constat 1 de l'étape 2), un peu plus près de la hanche, d'où 0,956. Avec `web_classic` à la longueur v3, la cible
   ne dépasse jamais 0,9500 en E3b (ρ mesuré 0,946) ; avec des étriers plus courts, ρ atteint 0,95 à 0,96 (même
   mécanisme probable, non sondé). Comme M7 (constat 2 de l'étape 2), ce seuil absolu du niveau B est donc dépassé par
   la règle elle-même : à trancher avant l'étape 6.
3. **`rider_f` à la longueur v3** : la jambe (80,4 cm) est plus longue que celle du classique à l'échelle 0,985
   (78,3 cm) et l'étrier v3 la tend : à l'arrêt, ρ 0,925 (plafond assis 0,93) et le bassin descend de 1,2 cm dans la
   selle pour atteindre l'étrier. Ce chiffre dépend de la convention `seatToHips`.
4. **Premier centimètre de raccourcissement presque sans effet à l'arrêt.** Avec `web_classic`, le pied gauche passe de
   0,6 à 3,1 cm d'écart latéral à 1 cm de raccourcissement (tibia contre le flanc, la règle écarte le pied), ce qui
   rallonge la portée ; avec `rider_f`, c'est le bassin qui remonte dans la selle. De 2 à 8 cm, le genou se ferme de
   2,3 à 3,3° par centimètre selon le rig, proche de l'estimation géométrique de l'étape 2 (environ 3°).

Chiffres pour la décision J3 (longueur d'étriers), mesurés avec O2 (tableaux complets : `o2.md` §4) :
- `web_classic` (squelette que la v3 anime), arrêt E1, genou moyen : 132,2° à la longueur v3 (stirrupY −0,64 m),
  131,2° à 1 cm plus court, 126,2° à 2 cm, 123,4° à 3 cm, 118,1° à 5 cm, 111,1° à 8 cm ; ρ de 0,914 à 0,825.
- `rider_f` (proportions de la cavalière visible) : 135,2°, 135,3°, 132,7°, 129,4°, 123,6°, 115,1° aux mêmes longueurs.
- Galop (E2g), `web_classic` : genou le plus fermé 117,5° (v3), 115,0°, 112,6°, 110,3° à 1, 2 et 3 cm, puis plus de
  gain (113,9° à 5 cm, 110,6° à 8 cm) et ρ au-delà de 0,95 (0,952 et 0,962). Obstacle de 1,40 m (E3b) : genou le plus
  ouvert 142,1° (v3), 143,5° à 147,3° dès 1 cm, ρ de 0,950 à 0,960 (constat 2).
- Conversion pour une longueur choisie : stirrupY = −0,64 m + raccourcissement ; dans le web v3, le cheval PJL borne
  stirrupY à −0,64 m au plus court (`pjlHorse.js:264`) : un étrier plus court exigerait de lever cette borne (web) ou de
  la régler dans le portage (Unreal).

## Étape 4. Règles de monte portées en C++ : `RiderRules` (20/11/2026)

Créé :
- `unreal/StridesGrandTour/Source/StridesCore/Public/StridesCore/RiderRules.h` et `Private/RiderRules.cpp` (C++20, sans
  type Unreal). Port ligne à ligne d'`anim.js` en pose « ride » : `ik2`, `kneeOf`, `lookQ`, `forwardTrunk`, `solveLeg`,
  `solveArm`, `flankAt`, `crestAt`, `hugFlank`, `hugMemory`, `riding`, `hairSpring` et l'application lissée
  d'`animateHuman` (slerp à trois branches, jambes exactes une fois le fondu fini) ; plus la préparation des entrées de
  `human.js` `animateRiding` (`RideInputFilter` : rebond et tangage du dos, saut, réception `landT`, profils du flanc
  filtrés par `FLANK_RELAX` et `FLANK_LEAD`, réglages en unités du modèle), **portée pour le seul cas qu'O1 exerce**
  (une mise en selle, pas d'animation jamais nul) : trois écarts connus hors de ce cas, voir « Contrôle adverse et pause
  S3 » plus bas. Les fonctions de Three.js utilisées sont reproduites avec leurs formules de three 0.170.0, dans le même
  ordre d'opérations. Contraction en FMA désactivée dans `RiderRules.cpp` (`#pragma clang fp contract(off)` encadré par
  `float_control(push/pop)` ; Clang contracte sinon, même en -O0), **sauf dans `smoothstep`** : défini dans
  `MathUtil.h`, inclus avant le pragma, son `3 - 2 * t` est compilé en `fma(t, -2, 3)` ; la multiplication par −2 est
  exacte, le résultat est donc identique au bit près. Le pragma est efficace (sans lui, `web_classic` passe de 1e-15 à
  4,3e-9 m, relevé du contrôle adverse) et ne déborde pas sur les autres sources d'une compilation unifiée. Aucun état
  statique : chaque cavalier porte son état.
- `Content/Data/rider_rules.json`, écrit par `scripts/unreal/export-rider-rules-data.mjs` (Node seul) : `RIDE` importé
  d'`anim.js` ; constantes non publiées relues dans le source (`THIGH_MARGIN`, `POLE_OPEN`, `HUG_OPEN`, `HUG_RELAX`,
  `FOOT_OPEN`, `FOOT_RELAX`, `DEFAULT_FIT` ; `FLANK_RELAX`, `FLANK_LEAD`, `FIST`, `RIDER_FIT`, `RIDER_SEAT` ; `LEG_THICK`,
  `HIND_DOWN`), une seule occurrence exigée. Deux exports : mêmes octets.
- `unreal/core/tests/test_monte.cpp` (exécutable `strides_monte_tests`, test ctest `monte`), `tests/bench_monte.cpp`
  (`strides_monte_bench`, hors ctest), `scripts/unreal/mutations-rider-rules.py`. `unreal/core/CMakeLists.txt` : bloc
  ajouté en fin de fichier (`target_sources`, deux exécutables), sans toucher à la ligne `add_library` que la tranche CSO
  modifie.

| Critère du plan | Résultat |
|---|---|
| Rigs `web_classic` et `rider_f`, tous scénarios : articulations et cibles C++ contre O2 ≤ 0,1 mm et ≤ 1e-4 rad | atteint, 1 858 images (8 scénarios × 2 rigs). `web_classic` : articulations et points 1,0e-15 m, rotations locales 2,1e-15 rad, cibles 1,1e-16 m, orientations des pieds 2,2e-16 rad. `rider_f` : articulations et points 7,2e-9 m (E1b, image 129, poing gauche), rotations locales 2,6e-8 rad (E1b, image 82, `lFore`), cibles 2,2e-16 m |
| État interne (`post`, `two`, `jumpK`, `rel`) ≤ 1e-6 | atteint, et étendu à tout `dg` (`diag`, `wantDiag`, `diagT`, `bobAvg`, `hd`, `wasJump`, `look`, `hug` des deux côtés, `blendT`) : 2,2e-16 |
| Entrées C++ calculées depuis `hz` brut, comparées au canal `in` : ≤ 1e-6 m | atteint pour toutes les images à partir de la deuxième (921 images × 20 valeurs = 18 420, 8 scénarios) : 1,9e-16 (tangage, E2g, image 131). Ce décompte gonfle la preuve : `dt` est passé tel quel en argument (comparaison tautologique), `hs` et `jump` sont recopiés de `hz`, `kneeOut` et `mountKneeOut` sont des directions recopiées. Ce qui prouve le portage : rebond, tangage, `landT`, `t`, phase de foulée, longueurs mises à l'échelle, profils `flankL` et `flankR` filtrés, `crest`. Le cavalier lit l'état du cheval de l'image précédente (`hz` de f − 1) ; l'image 0 suit la mise en selle, non exportée : l'état du filtre y est repris du canal `in`. Exception : le virage (`h.lastTurn` n'est pas exporté dans O1), repris du canal `in` et non comparé |
| G4 : au moins 30 mutations, chacune détectée ou déclarée | atteint pour le seuil (au moins 30, chacune détectée ou déclarée, code 0) ; partiel pour « une par constante et par branche ». 97 mutations (une partie des constantes de `RIDE`, constantes nommées, chaque étape de `hugFlank`, `hugMemory`, ordre mémoire puis recherche, retards d'une image, lissage, squelette, préparation des entrées), 85 détectées, 12 déclarées dans `ATTENDUES` avec leur raison. Sans mutation dans le script : `breathChest`, `breathShoulder`, `releaseIn1`, et `holdMax` et `landFold` dans le calcul de `jHd` (le contrôle adverse les a mutées sur une copie : toutes détectées). La mutation « ordre inversé, pied avant genou » saute l'étape 1 de `hugFlank` (`if (false)`) : ce n'est pas une inversion d'ordre. Branches qu'O1 n'exerce pas, ni déclarées ni couvertes : voir « Contrôle adverse et pause S3 ». Témoin non muté vérifié en tête de campagne |
| Coût : 10 000 images en Release, médiane ≤ 0,22 ms | atteint : médiane 0,0041 ms par image (trois passes : 0,00417, 0,00413, 0,00413 ms) ; moyenne 0,0050, p99 0,0100, max 0,017 à 0,042 ms |
| G1 | vert : 2 tests ctest, 248 386 + 306 914 = 555 300 vérifications, 0 échec, 0 avertissement à la compilation. Réserve : `monte-base.py --verifier` compare la somme à la base de l'étape 1, qui ne comptait que le cœur (248 386) ; une baisse des vérifications du cœur serait masquée par le test `monte` (liste par test enregistrée, non comparée) |

Mesure du coût (honnête, à relire avec ses limites) : Mac mini M2 16 Go, Apple clang 21, `-O3 -DNDEBUG`
(`CMAKE_BUILD_TYPE=Release`). Une image mesurée = `RideInputFilter::next` + `RiderRules::step` + `RiderRules::skeleton`
(25 matrices, plantes, poings) pour la cavalière `rider_f`, sur les 8 scénarios d'O1 enchaînés en boucle (état du
cheval relu dans `hz`), état remis à neuf au début de chaque scénario hors chronomètre ; 500 images de mise en
température non comptées ; chaque image chronométrée seule par `std::chrono::steady_clock` (pas de 41,7 ns sur ce Mac :
deux lectures successives donnent 0 ns en médiane, 83 ns au plus). Machine chargée par le chantier CSO pendant la mesure
(charge moyenne 3,8). Rig `web_classic` : médiane 0,0041 ms aussi. Ce chiffre est le coût CPU du cœur seul, hors moteur :
le Control Rig, l'évaluation de l'animation et l'iPhone ne sont pas mesurés (étapes 7 et 16).

Contrôles en plus du plan :
- La compilation en -O0 et en -O3 donne des écarts identiques au caractère près (sortie complète du test comparée).
- Chaîne complète `hz` → entrées → règle, contre O2 `web_classic` : articulations 2,9e-9 m, rotations 1,0e-8 rad, cibles
  2,2e-16 m. Ces 1e-8 sont l'écart connu entre O1 (Chrome) et O2 (Node) au changement de branche du slerp (étape 3,
  constat 1) : le C++ suit Node à 1e-15 près sur `web_classic`.
- Isolation : deux cavaliers simultanés, et un cavalier remis à neuf, donnent les mêmes octets (19 511 valeurs).
- Valeurs par défaut de `RideParams` identiques à `rider_rules.json` (53 valeurs, égalité exacte).

Mutations non départagées (12, toutes dans `ATTENDUES`) :
- les mêmes parties de la règle que l'étape 3 n'exerce pas sur `anim.js` (raisons prouvées alors par des sondes sur O1) :
  limite « genou au-delà de la cheville » (`room()` jamais faux), borne de 12 cm de l'écart du pied (`xMax` plus serrée),
  seconde passe et marge de 5 mm de la remontée du pied, plafond 0,97 de `hugMemory` (inactif avec `kneeOut` 0,45),
  borne 0,9995 d'`ik2` et de `kneeOf` (allonge toujours sous 0,98) ;
- branche linéaire du slerp (quelques 1e-9 au plus, sous les tolérances) ;
- queue de cheval (`hair` faux dans tous les scénarios), salut (`wave` nul), `DEFAULT_FIT` (le jeu fournit toujours
  `fit`), formule du virage de `animateRiding` (`h.lastTurn` absent d'O1).
Les couvrir demanderait des scénarios de plus (galop allongé, salut, cavalier avec queue de cheval) et l'export de
`h.lastTurn` dans O1 : à décider.

Constats :
1. **Le portage reproduit la v3 au dernier bit près sur le squelette du web** (`web_classic` : 1e-15). Sur `rider_f`, le
   plus gros écart (2,6e-8 rad sur `lFore`) a probablement la même cause que l'écart O1–O2 (branche du slerp à un ulp de
   la cible, ici entre la libm d'Apple et celle de Node) : non sondé, à confirmer ; il reste environ 3 800 fois
   sous la tolérance (1e-4 rad).
2. **Le coût est négligeable devant le seuil** : environ 4 µs par image, 50 fois sous 0,22 ms.
3. `Content/Data/rider_rules.json` porte aussi les données dont les étapes 5 et 6 auront besoin (`RIDER_FIT`,
   `RIDER_SEAT`, `FIST`, `LEG_THICK`, `HIND_DOWN`) ; la règle ne les lit pas.

Adaptations du plan :
- Test dans un exécutable séparé (`test_monte.cpp`, ctest `monte`) et non dans `test_core.cpp` : ce fichier est modifié
  par la tranche CSO. `run("rider", …)` n'existe donc pas ; le test s'appelle `monte`.
- Export des constantes par `export-rider-rules-data.mjs` et non par `export-data.mjs` : celui-ci s'exécute par
  vite-node (cache écrit dans `node_modules`, partagé avec le chantier CSO) et la tranche CSO le modifie.
- Oracles lus dans `unreal/core/tests/oracles/monte/` (dossiers de l'étape 3).
- `monte-base.py` additionne désormais les vérifications de tous les exécutables de ctest (G1 ; réserve dans la ligne G1
  du tableau).

Fin d'étape : **la condition d'arrêt S3 n'a pas été respectée.** S3 (plan §7 : moins de 8 Gio libres à n'importe quel
moment, donc pause immédiate, aucune suppression, question à Julien) était déjà atteinte au début de l'étape (6,1 Gio
libres ; 5,3 Gio en cours ; l'étape elle-même a écrit environ 25 Mo : `build/core-monte-rel`, `build/mutations-monte`).
L'étape a pourtant été menée jusqu'au commit `d3f43ab9`, et S3 n'a été présentée que comme la raison d'une porte
partielle. La pause est en place depuis la correction qui suit. `monte-base.py --verifier` refuse de tourner (code 2,
par construction). Les portes ont été passées une par une :
G1 (ctest ci-dessus), G5 (montage refait, 150 PNG, empreinte globale identique à `base.json`, aucun fichier modifié), G6
(`build-parite.py` code 0, 687 fonctions, 29 identiques prouvées, 262 partielles, 396 absentes, 169/169 ; `PARITE.md`
inchangé), G7 (`git diff --quiet HEAD -- src public tests` code 0, aucun fichier non suivi ; `riderPosture` 4/4 ; suite
unitaire 30 fichiers, 297/297, cache de Vite dans `.tmp/monte`). G2, G3 : non lancées (UBT et UnrealEditor exclus).

### Contrôle adverse et pause S3 (20/11/2026, 17 h 18)

**Essai en pause sur S3, en attente de Julien.** Disque : 3,9 Gio libres à 17 h 18 (`df -h /Users/julien`), 3,1 Gio à
17 h 04 (mesure du contrôle adverse), 13,5 Gio à la base de l'étape 1 (`base.json`). Pendant cette correction : aucune
compilation, aucun test, aucune mutation, aucun code modifié, aucune suppression ; seul ce journal est corrigé. L'étape 5
(Unreal Build Tool, UnrealEditor) ne démarre pas avant la décision de Julien sur la place disque.

Constats du contrôle adverse, vérifiés par lecture du code et d'O1 pendant la pause ; corrections de code en attente :
1. **FMA.** `smoothstep` (`MathUtil.h:9`, inclus ligne 9 de `RiderRules.cpp`, avant le pragma ligne 15) reste
   contracté ; `lerp` et `vlerp` sont redéfinis après le pragma et ne le sont pas. Formulation corrigée plus haut.
   Correction prévue : pragma placé avant les includes, puis test et mutations rejoués.
2. **Préparation des entrées hors du cas d'O1.** (a) `human.js:326` `if (!step) return;` n'est pas porté : avec un pas
   nul, `RideInputFilter::next` fait avancer `landT`, `wasJump` et la mémoire des profils, alors que le web n'avance que
   `anim.t`. (b) `seed()` efface la mémoire brute des profils (`_flankRaw`), que le web garde d'une mise en selle à
   l'autre. (c) `reset()` remet à neuf plus que `Human.mount` (`human.js:249-272`, qui ne remet que `_init` et `_ride`) :
   aussi `blendT`, la pose `_P` et la queue de cheval ; le commentaire de `RiderRules.h:159` est donc inexact pour une
   remise en selle. Sans effet pour le joueur à une seule mise en selle, cas que l'oracle prouve ; compte pour les
   cavaliers animés à pas réduit (LOD) et pour une remontée en selle. Effet chiffré sur la pose : à confirmer. Correction
   prévue avec un test dédié (pas nul, deux mises en selle), faute de scénario O1.
3. **Branches qu'O1 n'exerce pas, ni déclarées ni couvertes jusqu'ici** (relevé par lecture d'O1) : galop allongé
   (`smoothstep(9.8, 11.8, hs)` ; vitesse maximale d'O1 8,70 m/s, E3b), deux sauts successifs (remise de `R.hd` à −1 ;
   un saut au plus par scénario, E3 et E3b), pas nul (pas minimal d'O1 : 1/30 s). À déclarer dans `ATTENDUES` avec leur
   raison, ou à couvrir par des scénarios O1 de plus.
4. **Mutations manquantes** : `breathChest`, `breathShoulder`, `releaseIn1`, `holdMax` et `landFold` dans `jHd`, et une
   vraie inversion de l'ordre genou puis pied ; libellé « ordre inversé » à corriger en « étape 1 sautée ».
5. **G1 de `monte-base.py`** : comparer les vérifications par test ctest (cœur et `monte` séparément), et non leur somme.


## Étape 5. Le cheval Unreal fournit ce que la règle lit (R0) (23/11/2026)

Base : `95536019` (fusion de la voie A dans `claude/unreal-port`). Dépôt déplacé le 23/11/2026 sur le disque externe APFS
`/Volumes/Stockage-Qualification` (lien symbolique depuis `~/.openclaw/workspace/projects/grand-tour-unreal`) : Unreal Build
Tool et UnrealEditor ont été lancés avec le chemin réel `/Volumes/Stockage-Qualification/Mac-Mini-Migration/Active-Projects/
grand-tour-unreal/…` ; aucun défaut lié au lien n'a été constaté (compilation de la base : code 0, 89 s ; un premier lancement
de l'éditeur par le chemin du lien a fonctionné aussi). Captures du banc dans le dossier de travail de la session, jamais dans
`Saved/Screenshots`.

Créé :
- `scripts/unreal/export-horse-tack.mjs` (Node seul, `@gltf-transform` et `meshoptimizer` déjà installés) → `Content/Data/
  pjl_horse_tack.json` (267 Ko). Il relit le cheval du web (`public/real/horse_pjl.glb`, décodé comme three.js), les ancres et
  les indices de sommets relevés dans la page à l'étape 2 (`pjl_tack_anchors.json`) et les constantes de `pjlHorse.js` (CREST,
  HIND_DOWN, lissages 12 et 18, fenêtre de 1,5 s, `landT` initial ; une seule occurrence exigée). Pour chaque ancre et chacun
  des 738 sommets retenus (450 du flanc, 288 de l'encolure), et pour chacun de ses os, il écrit le poids et le point
  q = W_repos · boneInverse · p (espace de la scène du GLB, pose de repos des nœuds), plus les positions de repos des 419
  articulations. Raison : l'import Unreal renumérote les sommets, et le GLB du web encode une pose de liaison qui n'est pas sa
  pose de repos (quantification). Contrôles écrits dans le fichier : matrices inverses de liaison identiques à la page (écart
  0), ancres d'étrier au repos à 2,8e-16 m de `pjlRest` d'O1. Deux exports : mêmes octets (`--check`).
- `StridesCore/HorseTack.h`, `Private/HorseTack.cpp` (C++20, sans type Unreal) : port de `pjlHorse.js` `_snapshot` (horloge de
  réception), `_attachRider` (siège S : ancre `seat` recentrée sur le milieu des ancres d'étrier, lissage 12/s ; tangage
  `spine_04` → `pelvis` par rapport au repos, lissage 18/s ; inclinaison de la vue ; Euler `YXZ`), `update` (postérieurs
  reposés : `toes_02` à moins de 10 cm du sol, fenêtre de 1,5 s après le poser) et `_flankUpdate` (profils du flanc et du dessus
  de l'encolure), et de `pjl/view.js` `anchorWorld` ; moindres carrés affines pour la conversion d'axes.
- `SG/StridesHorseTack.cpp`, `SGh/StridesHorseTack.h` : `UStridesHorseTack` (composant d'`AStridesHorse`). À
  l'initialisation : données lues, 30 os retrouvés par nom, conversion d'axes scène du GLB → maillage déduite des positions de
  repos des 419 articulations (résidu 0,00097 unité du maillage ; c'est une symétrie d'axes de facteur 100 :
  X = 100 x, Y = −100 y, Z = 100 z). À chaque image : transformée de peau de chaque os (os posé ∘ os au repos⁻¹ ∘ conversion),
  puis le cœur. Expose le siège S (repère du cheval du web, repère de l'acteur et monde), les ancres dans S, les profils, les
  hauteurs des postérieurs, `hindDown`, la phase du clip joué et le coût de l'image. **Créé seulement avec
  `-StridesRider=regles`** (`StridesHorse.cpp:102-110`) ; sans l'option, `HorseTack()` est nul (vérifié par le test) et
  `SeatTransform()` n'a pas changé (même code, `StridesHorse.cpp:290-305`).
- `unreal/core/tests/test_horse_tack.cpp` (ctest `monte-cheval`, 3 719 vérifications) et `SG/Tests/StridesRiderTests.cpp`
  (`Strides.Parite.HorseSeat`), `scripts/unreal/mutations-horse-tack.py`.

Mesure préalable (plan : « mesurer d'abord »), clip idle à 0,5 s, même pose Unreal calculée deux fois :

| Os | Jeu Unreal (échelle 0,01) | Posé comme le web (échelle 0,010388, lacet, sol) | Écart |
|---|---|---|---|
| `spine_04_09` | 151,69 cm du sol | 158,38 cm | −6,69 cm |
| `saddle_0168` | 172,62 cm | 180,13 cm | −7,50 cm |
| `pelvis_05` | 160,90 cm | 167,95 cm | −7,05 cm |

**Écart supérieur à 1 cm : l'échelle du cheval n'est pas changée** (elle sert au CSO déjà prouvé). Le cheval Unreal est
3,7 % plus petit que celui du web (0,01 contre 0,0103883 m par unité de la scène du GLB, rapport 0,9626) ; le web tourne
aussi le modèle de −0,69° (lacet −0,0120 rad) et le soulève de 0,80 cm (semelles au sol), ce que le jeu Unreal ne fait pas.
Le niveau B se jugera donc sur les seuils absolus des règles pour les grandeurs qui dépendent du cheval (plan, étape 5). Le
chiffre du web « `spine_04` à 1,48 m » se rapporte aux articulations des sabots ; au-dessus des semelles, le même calcul donne
1,584 m.

Constat de l'import : la racine `_rootJoint` des clips Unreal porte une rotation de 90° (axe −X) par rapport à la pose de
référence du maillage (Interchange y a cuit le nœud racine de la scène) ; le web retire les pistes des racines (`pjl/asset.js`).
Le jeu en tient compte (le maillage du jeu est droit) ; pour comparer au web, le test laisse les trois racines du web
(`root_04`, `_rootJoint`, `rootmountpoint_01_0289`) à la pose de référence.

`Strides.Parite.HorseSeat` (vert) : le cheval du jeu est créé dans un monde de test, le composant initialisé sur son maillage.
Aux images d'O1 dont tous les clips actifs existent dans Unreal (aucun clip en miroir) et sans bascule ni levée de tête, les
clips Unreal sont échantillonnés aux temps du canal `mx` et mélangés comme le mélangeur WildMesh (`PropertyMixer` de three.js :
première action copiée, puis mélange au poids relatif, `slerpFlat`, complément à 1 par la pose d'origine), avec le corps de la
vue (hauteur, inclinaison) de l'image. Les lissages partent de la mise en place (idle au premier pas) à l'image 0, sinon de
l'état du web à l'image précédente (x et tangage de S, réception, postérieurs). 537 images rejouées (E1 65, E1b 115, E2g 21,
E2d 126, E6t 105, E6v 105 ; E3 et E3b n'ont aucune image sans clip en miroir), en 10 plages ; la pose échantillonnée est celle
que le maillage du jeu évalue (écart 0,0099 unité du maillage, soit 0,0001 cm dans le jeu).

| Critère (plan, étape 5) | Images à un clip ≥ 0,99 (sélection du plan, 105) | Toutes les images rejouées (537) |
|---|---|---|
| Ancres dans S ≤ 0,5 cm | 0,021 cm (E1 image 37, `bitL`) | 0,184 cm (E6t image 77, `ironL`) |
| Position de S dans le repère du cheval | — | 0,239 cm (E6t image 90) |
| Orientation de S ≤ 0,5° | 0,0003° | 0,079° (E6t image 114) |
| Chaque tranche du flanc ≤ 0,5 cm | 0,0012 cm | **2,369 cm** (E6t image 111, flanc gauche, tranche 7) ; 7 tranches sur 21 480 au-delà de 0,5 cm |
| Chaque tranche de l'encolure ≤ 0,5 cm | 0,0061 cm | 0,281 cm (E6t image 53) ; tranches mesurées des deux côtés ou d'aucun |
| `hindDown` à la même image ± 1 | toujours identique au web, mais aucune image de saut posée (voir plus bas) | idem |
| Coût ≤ 0,1 ms par image (`FPlatformTime`) | médiane 0,0112 ms, p99 0,0126 ms, maximum 0,0156 ms (537 images) | |

Données brutes et compressées des clips donnent les mêmes chiffres (au dix-millième de centimètre près) : la compression
d'animation n'est pas en cause. Aux allures, les clips importés sont rééchantillonnés à 24 ou 30 images/s (canter : 18 clés
contre 34 clés irrégulières dans le GLB du web ; trot : 26 clés à 30 images/s) : cause probable des millimètres d'écart des
ancres aux allures, **à confirmer**. Les 7 tranches du flanc au-delà de 0,5 cm sont des tranches basses (bord du ventre), où un
déplacement de quelques millimètres change le sommet le plus écarté de la tranche.

Hors moteur (`ctest` `monte-cheval`, 3 719 vérifications) : données lues ; pose de repos skinnée par la formule du web =
`pjlRest` d'O1 à 4,5e-16 m ; horloge de réception et `hindDown` identiques à O1 à chaque image des 8 scénarios (929 images,
`landT` exact, poses des postérieurs en E3 image 81 et E3b image 75), à partir de `hz.jT` et des hauteurs `hz.hv` exportées par
le web ; recentrage du siège (lissage 12/s du milieu des ancres d'étrier) contre `hz` à 1,8e-13 m ; orientation de S = Euler
`YXZ` (tangage, 0, inclinaison `mx.rz`) à 5,2e-8 rad ; moindres carrés affines et inverse sur une similitude connue.

Mutations (`scripts/unreal/mutations-horse-tack.py`), 35 au total :
- niveau cœur (17, copies dans `build/`, ~30 s) : 14 détectées par `monte-cheval`, 3 déclarées dans `ATTENDUES` avec leur
  raison (un saut au plus par scénario : postérieurs « levés au saut » non départagés ; dans O1, l'os gauche passe sous 10 cm à
  la même image que le droit ou avant lui ; ordre d'Euler XYZ équivalent à YXZ quand l'angle y est nul, mutation équivalente) ;
  code 0 ;
- niveau moteur (18 : siège, tangage, inclinaison, profils, conversion du composant ; UBT puis `Strides.Parite.HorseSeat`) :
  témoin vert, **1 seule vérifiée** (recentrage 12/s → 6/s : détectée, cinq critères en échec). La campagne a été suspendue de
  l'extérieur le 23/11/2026 vers 21 h 31 (`kill -STOP` envoyé par la session de migration, pendant la synchronisation finale de
  `UE_5.8` vers le disque externe) ; le source resté muté a été rétabli à la main (comparé à la copie du cœur : identique à
  l'original) et le processus arrêté. **17 mutations moteur restent à passer** (*passées aux reliquats M1 : voir la fin de ce
  journal*), après la migration du moteur, par
  `python3 scripts/unreal/mutations-horse-tack.py --moteur` (environ 3 min chacune). **Les binaires locaux du module
  (`Binaries/`, `Intermediate/`) sont ceux de la compilation mutée : une compilation UBT est nécessaire avant tout lancement
  de l'éditeur ou du jeu.** Les preuves G2 et G3 ci-dessus portent sur le source commité, compilé et testé avant la campagne.

Écarts et limites (déclarés, non corrigés à cette étape) :
1. **Clips en miroir** (main gauche, `*_M`, cuits par `pjl/asset.js bakeMirror`) : absents d'Unreal. Aucune image de saut ni de
   galop à gauche n'est posée ; le jeu Unreal joue toujours les clips d'origine. `hindDown` n'est donc prouvé qu'au niveau
   logique (hauteurs des os relevées dans le web) ; dans Unreal, il reste faux aux 537 images comme dans le web.
2. **Échelle et placement du cheval** : voir la mesure préalable (−3,7 %, lacet, sol).
3. **Inclinaison de la vue** : le cheval Unreal ne s'incline pas dans les virages ; le composant reçoit un roulis nul en jeu
   (le test lui donne `mx.rz`).
4. **Phase de foulée** : `PlayedClipPhase()` donne la phase du clip joué, pas `horse.anim.phase` du web (décalages
   `gaitInfo.offset` et `align.off`, calculés par la page, non exportés).
5. **Hauteur des postérieurs** : en jeu, mesurée au-dessus du relief (`AStridesHorse::GroundAt`) ; dans le test, au-dessus du
   plan du cheval (écart à `hz.hv` 3,35 cm au plus, information : le web mesure au-dessus du relief).
6. **Mouvements secondaires** (bascule, levée de tête) : non portés ; les images où ils sont non nuls sont exclues du test.

## Étape 6. Cavalière actuelle montée par les règles, option `-StridesRider=regles` (23/11/2026)

Base : `a61df9aa` (étape 5), branche `claude/unreal-port`. Premier passage après la migration de Tom (projet et moteur sur
le disque externe APFS `/Volumes/Stockage-Qualification`, chemins habituels conservés par liens symboliques).

### Migration : ce qui a dû changer dans les commandes (constaté, rien supprimé)

- **Point de montage** : `/dev/disk10s1` sur `/Volumes/Stockage-Qualification` (apfs, local, journaled) ; dépôt réel
  `/Volumes/Stockage-Qualification/Mac-Mini-Migration/Active-Projects/grand-tour-unreal` (lien depuis
  `~/.openclaw/workspace/projects/grand-tour-unreal`) ; moteur réel `/Volumes/Stockage-Qualification/Mac-Mini-Migration/Applications/UE_5.8`
  (lien depuis `/Users/Shared/Epic Games/UE_5.8`, posé à 22 h 03). Place libre : 71 Gio (interne), 841 Gio (externe).
- **PCH partagés périmés** : construits à 21 h 58 contre l'ancienne copie du moteur ; UBT les jugeait à jour (horodatages
  gardés par rsync) et la compilation échouait par redéfinitions (`CoreTypes.h`, 720 erreurs). Corrigé sans rien supprimer :
  date de modification des 14 en-têtes `Intermediate/Build/Mac/arm64/StridesGrandTourEditor/Development/*/SharedPCH.*.h`
  avancée (`touch`), UBT les a recompilés.
- **UBA** (exécuteur Unreal Build Accelerator) : refuse d'écrire par le chemin du lien symbolique (« Refusing to register
  create-for-write … dir not populated ») ; compilation verte avec **`-NoUBA`**.
- **Éditeur** : lancé par `/Users/Shared/Epic Games/UE_5.8/…`, il calcule le chemin du projet relativement à son dossier réel
  et ne démarre pas (« Failed to open descriptor file ../../../../../../../Volumes/… ») ; lancé par le **chemin réel du moteur**
  avec le chemin réel du projet, il démarre.
- `Strides.Cso.CameraInGame` passe avec un avertissement nouveau : l'éditeur ne lance plus `libimobiledevice` depuis le moteur
  déplacé (outil iOS, sans effet sur le test) ; à regarder par Tom.

### Ce qui est fait

- **Données** (`scripts/unreal/export-rider-rig-data.py` → `Content/Data/monte_rider_f.json`) : rig de règle `rider_f`
  (`rigs/rider_f.json` tel quel), réglages de mise en selle `fit0` d'O1 (identiques dans les 8 scénarios ; `stirrupY`
  −0,64 m, décision J3), et, lus dans `src/entities/realistic.js` par expressions régulières (jamais recopiés) : `MAP`
  (21 os), `ALIGN` (14 chaînes, dans l'ordre), flexion des doigts au calage.
- **Cœur** (`StridesCore/RiderPose`) : lecteurs des canaux d'O1 ; `RideDriver`, la chaîne du web `animateRiding` avec son
  **retard d'une image** (le cavalier lit le cheval de l'image précédente) ; `poseInSeat` (rotations monde des 25 os dans S).
  ctest `monte-cavaliere` (72 547 vérifications) : chaîne du jeu depuis `hz`/`mx` d'O1, rig `rider_f` à l'échelle 1, contre O2
  `rider_f` sur les 8 scénarios (929 images) : 9,1e-9 m ; rejeu direct du canal `in` : 7,2e-9 m.
- **Composant** `UStridesRiderRig` (`SG/StridesRiderRig.cpp`) : entrées depuis `UStridesHorseTack` (siège S, profils,
  postérieurs) et `AStridesHorse` (vitesse, `jumpT`, virage) ; règle ; **reciblage comme le web** (`realistic.js` update :
  rotation monde de l'os classique × décalage du calage ; le calage `_calibrate` est refait sur la pose de référence du
  maillage Unreal, même squelette que `public/real/rider_f.glb` : translations identiques, rotations à 0,04° près) ; espace du
  maillage déduit par une similitude à axes signés sur 9 articulations (résidu 0,00001 cm) ; puis **deux os par membre**
  (`AnimationCore::SolveTwoBoneIK`, étirement désactivé, pôle en position = genou ou coude de la règle, `kneeOf`).
- **Jeu** (`StridesRider.cpp`) : avec `-StridesRider=regles`, `EnableRulesRig` crée un `UPoseableMeshComponent` (mêmes
  vêtements, meneurs) et le composant ; en selle sur un cheval dont la sellerie est prête, clips cuits coupés, cavalière
  posée au siège S. **Sans l'option, rien n'est créé** (vérifié par le test) et `SeatTransform()` n'est pas touché.

### Control Rig : construit par Python, mais le jeu utilise le repli C++ (déclaré)

`scripts/unreal/build-rider-controlrig.py` (`UnrealEditor-Cmd -run=pythonscript`, sans interface) construit
`/Game/Characters/Riders/Rig/CR_StridesMonte_riderF` (233 Ko) : os importés du maillage, quatre `TwoBoneIKSimplePerItem`
(jambes `thigh/calf/foot`, bras `upperarm/lowerarm/hand`), `bEnableStretch` relu à `False` sur les quatre, `PoleVectorKind`
`Location`, cibles et pôles lus sur des repères (« nulls ») de la hiérarchie. Trois tentatives : (1) graphe neuf sans nœud
d'exécution ; (2) `add_member_variable(…, 'FVector')` fait échouer une assertion du moteur 5.8.4
(`RigVMExternalVariable.cpp:280`, `CPPTypeObject`) et l'éditeur s'arrête ; (3) avec des repères : réussi.
**Le jeu n'utilise pas cet asset** : le graphe ne contient que les quatre membres (ni bassin, ni colonne, ni pieds, ni doigts),
et son évaluation à l'exécution (`UControlRigComponent`, dépendance au module `ControlRig`) n'est ni écrite ni prouvée. La pose
du jeu est calculée en C++ (`UStridesRiderRig`), avec le solveur de deux os d'AnimationCore ; l'équivalence de ce solveur avec
le nœud `TwoBoneIKSimplePerItem` n'est **pas vérifiée** (source du nœud absent du moteur installé).

### Preuve : `Strides.Parite.RiderRules` (niveau A dans le moteur) et `niveau-a.md`

Le test crée la cavalière du jeu, appelle `EnableRulesRig`, rejoue E1, E1b, E2g, E2d, E3 et E3b par la chaîne du jeu (première
image par son canal `in`, puis `hz` et `mx` d'O1 avec le retard d'une image), pose le maillage, **relit les articulations sur le
maillage** (`GetBoneLocation`), les ramène dans S par une conversion inverse écrite dans le test, et compare à O2 `rider_f` à
chaque image (689 images) : **écart maximal 0,0001 cm** ; correction des deux os par membre 0,0001 cm au plus (le reciblage
place déjà les articulations) ; coût moyen 0,012 ms par image (max 0,033 ms, `FPlatformTime`, éditeur sans rendu). Les
grandeurs M1 à M17 sont calculées sur l'export du test par `scripts/unreal/rider-rules-niveau-a.mjs`, avec le code de
`rider-rules-metrics.mjs` : toutes les tolérances du niveau A sur l'écart à O2 sont tenues (écarts de 1e-5 cm et 1e-4° au plus ;
phases du saut identiques à l'image près). Les seuils absolus M7 ≥ −1 cm et M9 ≥ 9 cm ne sont pas tenus **par O2 lui-même**
(règle web, mêmes proportions) : rapportés dans `niveau-a.md`, pas comptés comme écart du portage.

Mutations (`scripts/unreal/mutations-rider-rig.py --moteur`, 620 s) : **12 sur 12 détectées**, code 0, sources rétablis.
- cœur (5, ctest `monte-cavaliere` sur une copie) : retard d'une image supprimé, état du cheval (2,1e-4 m) et profils
  (2,6e-4 m) ; première image non jouée ; `kneeOut` mis à l'échelle (détectée seulement après ajout au test du rejeu direct du
  canal `in` : la première version du test ne la voyait pas) ; ordre du produit des rotations monde inversé ;
- moteur (7, UBT puis `Strides.Parite.RiderRules`) : signe de Y du repère du siège (repère indirect, initialisation refusée) ;
  pôle en direction (coude à 10,3 cm) ; étirement activé (6,0 cm) ; retard d'une image supprimé (1,11 cm : détectée de peu par
  le seuil de 1 cm du moteur, nettement par le cœur) ; conjugaison des rotations sans le signe de la symétrie (1,4 cm) ; bassin
  non posé (79 cm) ; calage des membres supprimé (5,1 cm).
- Le script appelle UBT avec `-NoUBA` et l'éditeur par le chemin réel, journal dans un fichier et `-trace=none` : un premier
  passage est resté bloqué (le démon `UnrealTraceServer` de l'éditeur gardait ouvert le tube de sortie ; arrêt de ma propre
  tâche, aucun source n'était muté à ce moment, vérifié).

### Écarts et limites (déclarés)

1. **Niveau B non mesuré** : en jeu, les entrées viennent du cheval Unreal (phase du clip joué au lieu de `horse.anim.phase`,
   `contactOff` absent, cheval 3,7 % plus petit, profils du flanc jusqu'à 2,4 cm du web en 7 tranches, galop à gauche et sauts
   sans clips en miroir) : rien n'est prouvé en jeu au-delà du niveau A.
2. **Étriers du cheval** non pilotés par les pieds ; **rênes** absentes (les poings sont calculés).
3. **Control Rig** : voir plus haut (asset construit, non utilisé).
4. **`seatToHips` de `rider_f`** reste la convention de l'étape 3 (classique × rapport des hauteurs de bassin), non mesurée.
5. **Cheveux** : avec l'option, la queue de cheval (`Hair_ponytail`) n'est pas rendue (présente dans le jeu par défaut) ; cause
   non trouvée (suiveur du maillage posé), à corriger.
6. **Retard apparent au galop** : à la capture, l'acteur de la cavalière est à 9 cm du siège relu en fin d'image (une image à
   6 m/s), malgré la dépendance de tick sur le cheval et sa sellerie ; cause à confirmer.
   *Corrigé ou expliqué aux reliquats M1 (fin de ce journal) : 5, bornes des suiveurs ; 6, relevé fait au milieu de l'image.*

### Captures côte à côte (rendu GPU réel, 844 × 390) : `captures/`

- Web : `node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-rider-rules.mjs --shots=<dossier>` (serveur 5177),
  scénarios E1 (image 40, arrêt) et E2d (image 100, galop à droite, 8,45 m/s), caméra posée dans le repère du cheval (holder :
  œil à 4,2 m à gauche, 1,5 m de haut ; FOV vertical 38°) ; `poses.json` donne les poses, relues côté Unreal ; rien n'est
  écrit dans les oracles.
- Unreal : `-game -windowed -ResX=844 -ResY=390 -StridesShots=monte [-StridesRider=regles] -StridesShotsDir=<dossier>
  -StridesMontePoses=<poses.json>` : cheval à l'entrée du tracé du Pôle, cavalière en selle, même caméra dans le repère de
  l'acteur du cheval ; arrêt, puis parcours de démonstration et capture au premier galop hors saut (6,2 m/s).
- Fichiers : `monte-<arret|galop>-web.png`, `-unreal.png` (option `regles`), `-unreal-defaut.png` (jeu par défaut, même scène).
- Ce que les captures montrent : avec l'option, la cavalière est assise dans la selle, pieds sous elle, mains au-dessus du
  garrot, comme dans le web ; sans l'option, la cavalière du jeu par défaut (clips cuits). Ce ne sont **pas** des poses
  jumelles : décor différent (plage du web, carrière du Pôle), phase de galop différente (le web rejoue E2d, Unreal joue le
  parcours de démonstration), cheval Unreal 3,7 % plus petit. Elles ne prouvent rien au-delà du niveau A ; le jugement du
  réalisme reste à Julien.
- Premiers essais (non gardés) : vêtements restés en pose de référence (suiveurs attachés à l'ancien maillage : corrigé en les
  rattachant au maillage posé) ; galop jamais atteint (carte d'activité non validée : corrigé).


## Étape 7. Mode de mesure du coût, et ligne de base (24/11/2026)

Base : `cf24a9f6` (étape 6), branche `claude/unreal-port`. Chemin réel du dépôt (disque externe APFS `/dev/disk10s1` sur
`/Volumes/Stockage-Qualification`) ; UBT avec `-NoUBA`, éditeur par le chemin réel du moteur, comme à l'étape 6. Aucun
défaut nouveau dû au lien symbolique. Place libre au départ : 66 Gio (interne), 841 Gio (externe).

Créé ou modifié :
- `StridesCore/PerfStats` (C++20 seul) : médiane, 95e centile (définition « type 7 »), dispersion des médianes ; ctest
  « perf » (20 vérifications, valeurs attendues calculées à la main).
- `SG/StridesShots.cpp` et `.h` : mode `-StridesShots=perf` (`TickPerf`), options `-StridesPerfWarm=`,
  `-StridesPerfFrames=` et `-StridesPerfSansCapture`. Il écrit `perf-unreal.json` (valeurs brutes et résumé par
  `PerfStats`). Il exige `-StridesShotsDir` et n'écrit jamais dans `Saved/Screenshots`. Modules `RenderCore` et `RHI`
  ajoutés aux dépendances privées (`GGameThreadTime`, `RHIGetGPUFrameCycles`).
- `Strides.Shots.PerfStats` : résumé du module contre les mêmes valeurs attendues.
- `scripts/unreal/perf-summary.py` : passes (préconditions de session, `caffeinate`), recalcul indépendant par
  `statistics.quantiles`, tableau de `cout.md`, copies dans `perf/`.
- `scripts/unreal/mutations-perf.py` : 12 mutations (9 dans `PerfStats.cpp`, 3 dans le recalcul du résumé), **12 sur 12
  détectées**, témoins verts.
- `cout.md` : tableau, critères et lecture ; `perf/` : 13 passes (1,7 Mo) et `resume.json`. Le plan voulait
  `unreal/docs/essai-metahuman/cout.md` ; ce dossier n'existe pas (voie B écartée), le tableau est donc rangé ici.

Résultats (détail dans `cout.md`) :
- Trois passes `actuel` et trois `regles`, alternées, de 2 × 600 images mesurées. Dispersion des médianes ≤ 3,5 %.
  **Δ temps du jeu : +0,031 ms à l'arrêt et +0,047 ms au galop** (seuil 0,3 ms) : critère tenu.
- La variante `-libre` (synchronisation coupée par `-ExecCmds`) n'a pas libéré l'image : elle reste à 60 Hz. Ce sont donc
  trois passes de plus par configuration, dans les mêmes conditions.
- Aperçu mobile (`-FeatureLevelES31`) : premier essai figé à la capture, arrêté par moi ; second essai sans capture,
  complet. Noté à part dans `cout.md`.

Portes : G1 vert (300 729 cœur, 306 914 monte, 3 719 monte-cheval, 72 547 monte-cavaliere, 20 perf ; 0 échec) ; G2 vert
(UBT code 0, aucun avertissement, deux compilations) ; G3 vert (35 tests, 35 réussis, 0 échec ; l'avertissement
`idevice_id` déjà connu sur un test) ; G4 : `mutations-perf.py` code 0, aucun source muté par les scripts `mutations-cso-*`
touché ; G5 : empreintes des 238 PNG de `parite/cso` identiques avant et après ; G6 code 0, `PARITE.md` inchangé ; G7
`git diff --quiet HEAD -- src public tests` code 0, `riderPosture` 4/4.

## Reliquats M1 des étapes 5 à 7 (24/11/2026)

Base : `cce6bad3` (étape 7), branche `claude/unreal-port`. Chemins réels du dépôt et du moteur (disque externe) ; UBT
sans `-NoUBA` (compile par les chemins réels, code 0) ; fichiers lourds et journaux sous `.ue-cache/travail/` (exclu de git).

### (a) Scripts de mutations après la migration

- `scripts/unreal/ue_travail.py` (nouveau) : chemins réels (dépôt par `realpath`, moteur par `UE` ou
  `/Volumes/Stockage-Qualification/Mac-Mini-Migration/Applications/UE_5.8`), UBT, éditeur sans rendu avec `-trace=none`
  et journal dans un fichier (`-abslog`), sorties sous `.ue-cache/travail/<nom>`.
- `mutations-horse-tack.py`, `mutations-rider-rig.py`, `mutations-cso-controls.py` : lancements par ce module ; les 15
  autres `mutations-*.py` : dossier de travail par défaut déplacé de `build/` vers `.ue-cache/travail/`. **Les listes de
  mutations ne changent pas** (seuls l'en-tête, les chemins et les fonctions de lancement sont modifiés : `git diff`).
- `mutations-horse-tack.py --moteur` (campagne complète, les 18 mutations moteur rejouées, pas seulement les 17 restantes) :
  témoin cœur et témoin moteur verts ; 35 mutations (17 cœur, 18 moteur), **29 détectées**, 6 déclarées
  dans `ATTENDUES`, code 0, sources rétablis, recompilation finale code 0 (478 s : UBT incrémental et éditeur sans rendu
  prennent environ 25 s par mutation moteur, et non 3 min comme estimé à l'étape 5). Sur les 18 moteur, 16 détectées par
  `Strides.Parite.HorseSeat`. Deux mutations moteur non détectées, ajoutées à `ATTENDUES` avec leur raison après une
  première passe en code 1 (même campagne, 570 s) :
  - « flanc : sommets du bord inférieur exclus » : **équivalente**, mesuré sur l'oracle : la tranche 0 du flanc vaut 0
    (`hz.fl[2]`, `hz.fr[2]`) à toutes les images des 8 scénarios d'O1 ; aucun sommet n'y tombe ;
  - « tangage : bassin et garrot inversés » : **non départagée** (faiblesse du test) : l'inversion ajoute ±π à `pitch` et à
    `pitch0`, la différence ne change qu'au passage à ±π (signe de la hauteur garrot − bassin qui change entre le repos et
    l'image), non exercé par les images testées ; raison déduite, non mesurée.
  La troisième non détectée du niveau moteur, « composant : saut ignoré », était déjà déclarée (clips en miroir absents).
- `mutations-rider-rules.py` rejoué : 97 mutations, 85 détectées, 12 déclarées dans `ATTENDUES` (mêmes raisons qu'à
  l'étape 4), code 0, 130 s.

### (b) Cheveux non rendus avec `-StridesRider=regles` : cause et correction

Mesuré par `Strides.Monte.EnJeu` (diagnostic avant correction) : les 8 suiveurs (vêtements, yeux, sourcils, cils, queue de
cheval) suivent bien le maillage posé (53 os, aucun absent du meneur), mais leurs **bornes** restent celles de leur pose de
référence (cavalière debout) : pour `Hair_ponytail01`, `Eyes`, `Eyebrows` et `Eyelashes`, la boîte est 74 à 87 cm
au-dessus de l'os `head` de la cavalière assise. Le rendu écarte ces petites pièces (boîte hors du champ de la caméra) ;
les vêtements, grands, restent dans le champ. Avec un meneur `USkeletalMeshComponent` (jeu par défaut), le cache des
bornes d'un suiveur est invalidé par le meneur ; un `UPoseableMeshComponent` ne le fait pas.
Correction (`StridesRider.cpp`, seulement en selle avec la règle) : `bUseBoundsFromLeaderPoseComponent` vrai et cache des
bornes invalidé à l'activation et à chaque image après la pose ; rétabli à faux pied à terre (comportement par défaut).
Activer seulement le drapeau ne suffit pas (mesuré : bornes toujours à 74 cm, cache non invalidé).
Preuve : `Strides.Monte.EnJeu` (bornes des 4 pièces de la tête autour de l'os `head`) et captures (queue de cheval, yeux,
sourcils visibles).

### (c) « Retard de 9 cm » au galop : mesure et cause

- Relevé de l'étape 6 refait avant correction (`-StridesShots=monte -StridesRider=regles`, rendu réel) : au tick de
  `AStridesShots`, acteur de la cavalière à 9,7 cm du siège S (pelvis à −11,3 cm dans S), à 6,2 m/s.
- Ordre réel des ticks (mesuré, `GetActualTickGroup`) : cheval en `TG_PrePhysics` (0), sellerie en `TG_PostUpdateWork` (5,
  après l'animation du cheval), cavalière **repoussée en `TG_PostUpdateWork`** (5) par son prérequis sur la sellerie.
  `AStridesShots` tique en `TG_PrePhysics`, après le cheval et avant la cavalière : il lisait le siège de l'image
  courante et la cavalière de l'image précédente, soit un pas du cheval (6,2 m/s ÷ 60 = 10,3 cm).
- **En fin d'image** (`FWorldDelegates::OnWorldPostActorTick`, état rendu dans la capture) : écart **0,0000 cm** à l'arrêt
  et au galop (même passe de capture, `-StridesShots=monte`, relevé « fin d'image » ajouté au journal). Le retard n'était
  donc pas dans l'image rendue : c'était l'instant du relevé.
- Correction : le relevé de `-StridesShots=monte` est fait en fin d'image (et l'écart au tick de la capture est gardé dans
  le journal pour mémoire). L'ordre des ticks de la cavalière est inchangé (déjà correct) et désormais vérifié par test.
- Test moteur `Strides.Monte.EnJeu` (nouveau, `Private/Tests/StridesMonteInGameTests.cpp`) : monde de test commencé
  comme le jeu (`InitializeActorsForPlay`, `BeginPlay`), cheval et cavalière créés avec `-StridesRider=regles` posé le temps
  du `SpawnActor`, montée, 240 images de 1/60 s au galop (`World->Tick`, `GFrameCounter` avancé ; sans cela chaque tick
  ne passe qu'une fois). Mesuré : 8,00 m/s, pas du cheval 13,56 cm par image ; **fin d'image : écart 0,000000 cm et
  0,000003°** sur 150 images ; un observateur en `TG_PrePhysics` après le cheval voit 13,56 cm (le relevé de l'étape 6,
  reproduit : le test voit un retard quand il y en a un).

### (d) Mineurs des contrôles des étapes 5 à 7

- Inventaire : 48 références `StridesRider.cpp:<ligne>` décalées par les étapes 5 et 6 (et par M1) recalées, dans 6
  fichiers de `unreal/docs/parite/inventaire/` : 40 par correspondance des lignes (diff de la version où la référence a
  été écrite à la version actuelle, contenu identique), 8 étendues de fonction (`TryMount`, `Dismount`, `Tick`) recalées à
  la main sur la fonction actuelle. Références `StridesHorse.cpp` : toutes justes (vérifié de la même façon, aucune
  décalée). Les tableaux historiques datés de `cso-ecarts.md` et `oracle-monte.md` ne sont pas réécrits.
- « `HorseTack()` nul sans l'option » : la preuve de l'étape 5 créait le cheval dans un monde sans `BeginPlay`, donc ne
  prouvait rien. `Strides.Monte.EnJeu` le prouve avec `BeginPlay` : sans l'option, ni sellerie, ni règle, ni maillage
  posé ; avec l'option, les trois sont créés (contrôle positif) ; la ligne de commande est rétablie après le bloc.
- G3 : compte exact ci-dessous, avertissements nommés par test.

### Mutations `scripts/unreal/mutations-monte-jeu.py` (moteur, UBT puis `Strides.Monte.EnJeu`)

Témoin vert ; 9 mutations, **7 détectées**, 2 déclarées, code 0, sources rétablis, recompilation finale code 0 (770 s).
Détectées : prérequis du cheval et de la sellerie retirés (cavalière en `TG_PrePhysics`) ; prérequis de la sellerie seul
retiré ; suiveurs gardant leurs bornes propres en selle ; bornes du meneur gardées pied à terre ; règle créée par
`BeginPlay` sans l'option ; règle jamais créée ; sellerie créée sans l'option. Déclarées : prérequis du cheval seul retiré
(équivalente : la sellerie tique en `TG_PostUpdateWork`, après le cheval) ; rafraîchissement des bornes à chaque image
retiré (**non départagée** : le cache invalidé à l'activation suit le composant et la pose assise bouge peu au galop ; le
rafraîchissement est gardé pour la montée et le saut, que le test n'exerce pas). Non couvert : le relevé de fin d'image de
`-StridesShots=monte` (mode de capture, sans test Automation ; sortie lue dans le journal).

### Captures (`captures/`, rendu GPU réel, 844 × 390)

Refaites le 24/11/2026 : web (`export-rider-rules.mjs --shots`, Vite sur le port 5178 ; `poses.json` identique octet pour
octet à celui de l'étape 6), Unreal par défaut et Unreal avec `-StridesRider=regles`. Montages web | défaut | règles sous
`.ue-cache/travail/m1/montages/` (non versionnés). Avec la règle, la queue de cheval, les yeux et les sourcils sont
rendus. Mêmes limites qu'à l'étape 6 : pas des poses jumelles (décor, phase de galop, cheval 3,7 % plus petit).
Relevés du journal de la passe `regles` : arrêt, fin d'image, écart 0,0000 cm ; galop (6,20 m/s), fin d'image, écart
0,0000 cm, au tick de la capture 9,94 cm ; pelvis dans S (−1,9 ; 0,0 ; 10,1) cm au galop (−11,3 cm à l'étape 6 : relevé au
milieu de l'image). Coût de la règle 0,033 à 0,039 ms à l'image capturée.

### Portes

- G1 : ctest code 0 ; cœur 300 729, `monte` 306 914, `monte-cheval` 3 719, `monte-cavaliere` 72 547, `perf` 20
  vérifications, 0 échec (construit sous `.ue-cache/travail/core`).
- G2 : UBT code 0, aucune erreur ni avertissement du compilateur dans les journaux (compilations successives de M1).
- G3 : `Automation RunTests Strides` : **36 tests, 36 en succès** (35 sans avertissement, 1 avec), 0 échec. Le nouveau test
  est `Strides.Monte.EnJeu`. Avertissements, nommés exactement : **2, tous deux sur `Strides.Parite.CsoFences`** (le test en
  cours quand l'éditeur cherche les appareils iOS) : `FMacPlatformProcess::CreateProc: posix_spawn(".../libimobiledevice/Mac/idevice_id") failed (86, …)`
  et `Failed to launch Tool. (.../idevice_id)`. `idevice_id` est un exécutable x86_64 (`file`) ; l'erreur 86 est
  « Bad CPU type in executable » (Rosetta absent : à confirmer). Sans effet sur les tests. Les étapes 6 et 7 rattachaient
  cet avertissement à `Strides.Cso.CameraInGame` ou à « un test » : il tombe sur le test en cours à ce moment.
- G4 : `mutations-horse-tack.py --moteur` code 0, `mutations-rider-rules.py` code 0, `mutations-monte-jeu.py` code 0.
- G5 : empreintes des 238 PNG de `parite/cso` identiques avant et après (captures non régénérées : le jeu par défaut et le
  mode `cso` ne sont pas touchés).
- G6 : `build-parite.py` code 0 ; `PARITE.md` régénéré (références recalées, preuve et écart des lignes de la cavalière).
- G7 : `git diff --quiet HEAD -- src public tests` code 0.

## Étape M2. Clips miroir du cheval : bakeMirror porté et prouvé contre le web (24/11/2026)

Base : `79d00c54` (reliquats M1), branche `claude/unreal-port`. Décision de Julien du 24/11/2026 (`decisions.md`) : porter
dans Unreal la logique du web qui inverse les clips de droite (`src/entities/pjl/asset.js` prepare et bakeMirror,
`src/entities/pjl/view.js` leadBlend, `src/entities/horse/anim.js` main au galop), puis la prouver face au web.

### Oracle (`unreal/core/tests/oracles/monte/miroir/`, 8,5 Mo, plus gros fichier 1,1 Mo)

`scripts/unreal/export-horse-mirror.mjs` ouvre la page `scripts/unreal/horse-mirror-export.html` (Vite, port 5178,
Playwright avec le Chrome installé) qui prépare le cheval **avec les modules du jeu** (`loadHorseAsset`, chargeur
`loadRealGltf('horse_pjl')`) et relève les 11 clips `_M` que le jeu a cuits (Float32Array, au bit près), plus les entrées
de la cuisson : squelette (419 os, parents, repos, parent non-os `_rootJoint`), pose idle à 0,5 s, et pour chaque clip
source la pose posée par le mélangeur three.js à chaque instant de la cuisson (doubles : le mélangeur interpole dans un
`Float64Array`), avec le temps de clip bouclé (`AnimationAction.time`). FPS et liste des clips sont relus dans `asset.js`.
La page vérifie que les propriétés sans piste restent au repos et que le parent non-os ne bouge pas. Deux exports
identiques à l'octet (`diff -r`) ; un troisième n'écrit rien. 168 os sur 419 portent un sommet (`rig.skinned`).

Constats du web relevés au passage : au dernier instant des allures (t = durée), `AnimationAction` boucle et pose le clip
à **t = 0** ; les sauts ont une durée flottante 32 bits supérieure à 49/24 s, donc leur dernier instant n'est pas bouclé.

### Cœur C++ (`StridesCore/HorseMirror`) et ctest `monte-miroir`

Port ligne pour ligne (opérations de three.js 0.170.0 dans leur ordre, `Math.hypot` de V8, sans contraction FMA, tableaux
`Float32Array` en `float`) : paires gauche/droite (`_l`, `_r`, `_left`, `_right`, dernier os d'un nom de base), plan des
bras, réflexion S, matrices C de la pose de repos, pose monde miroir S·W·C, retour en local, conservation des longueurs
(os fixes au repos, sinon direction cuite à la longueur du partenaire ; bassin et racines exclus), continuité du signe des
quaternions, pistes de `root_04` et `_rootJoint` omises, renommage des virages, temps bouclés, lecture des clés
(`LinearInterpolant`, `slerpFlat`) ; main au galop (anim.js:287-294), main des clips, fondu leadBlend (10/s).

Résultat (`ctest monte-miroir`, 4 202 vérifications, 0 échec) : nourris des poses source du web, **les 11 clips miroir
du C++ sont identiques au bit près à ceux du jeu (758 940 valeurs sur 758 940)** ; positions monde des bras identiques à
three.js (écart 0) ; sur les 921 images d'O1, main du cheval, main des clips et leadBlend identiques au web au bit près
(4 changements de main, après 16 images de virage tenu), saut en miroir selon la main aux 2 départs de saut (affirmation corrigée plus bas : le ctest ne faisait alors que
comparer deux champs d'O1 entre eux). Les
tolérances prévues (1e-6 m, 1e-6 sur les quaternions) n'ont pas servi : écart nul.

### Dans Unreal : cuisson au chargement, option `-StridesHorseLead=web`

Choix : **cuisson au chargement** (`FStridesHorseMirrorSet`, `StridesHorseMirror.cpp`) plutôt que des AnimSequence `_M`
écrites par l'éditeur : c'est le même code que le ctest prouve, sans recompression d'animation par Unreal ni ~25 Mo de
binaires ; 0,4 à 0,8 s au chargement dans l'éditeur (11 clips, mesuré). Entrées : squelette de référence du maillage
(espace du composant), clips importés échantillonnés par Unreal aux instants de la cuisson (racines du web au repos),
durée = longueur du clip en flottant 32 bits, comme les temps des clés glTF (`GetPlayLength` rend déjà un `float` : la
conversion gardée dans le code est sans effet, voir les mutations). La compression de chaque clip est attendue avant l'échantillonnage : sans cela, l'éditeur lisait
tantôt les données brutes, tantôt les compressées, et deux lancements donnaient des cuissons différentes (constaté).

Jeu : sans option, rien ne change (mode à un clip, `PlayAnimation`). Avec `-StridesHorseLead=web`, le cheval prend un
mélangeur à couches (`UStridesHorseAnimInstance`, mélange du `PropertyMixer` de three.js) : main au galop depuis
`lastTurn` (concours) ou le lacet du monde ouvert lissé de même (hypothèse, à confirmer), fondu leadBlend 10/s, clip
d'origine au poids leadBlend et clip miroir au poids 1 − leadBlend au même temps de clip (trot, galop, grand galop), saut
en miroir si la main est à gauche au départ. Main initiale du web : à gauche (`A.lead = 1`) ; `leadSwap` pris faux (prouvé
pour ce cheval : O1 associe la main 1 aux clips « L » à chaque image). Non portés : variantes de virage dans le mélange,
lissage des poids (14/s), phase de foulée par main ; horloge du saut et fondu `jumpWeight` (voir la correction plus bas). `UStridesHorseTack::PlayedClipPhase` lit la phase de la première
couche.

### Rééchantillonnage à l'import (mesuré, déclaré, non corrigé)

Les clips Unreal sont rééchantillonnés à l'import : canter, gallop, leurs virages et jump_canter à **24 images/s** (canter :
18 clés contre 34 clés irrégulières dans le GLB), trot, ses virages et jump_gallop à **30 images/s** (26 et 56 clés). Aux
instants de la cuisson (f / 24 s), les clés à 24 images/s tombent juste : la pose source d'Unreal est à 0,0119 cm du web
(os skinnés). À 30 images/s, Unreal interpole entre ses clés : la pose source s'écarte de **2,8 à 8,0 cm** (pied, poignet,
trot et jump_gallop). Réimporter ces clips à 24 images/s toucherait les clips du CSO prouvé : non fait, déclaré.

### Preuve dans le moteur : `Strides.Parite.HorseMirror` (vert)

- Jeu par défaut : pas de mélangeur à couches, aucun clip miroir cuit.
- Entrées : paires d'os identiques au web (par nom, 419 os) ; plan de symétrie à **0,0001°** et **0,0001 cm** de celui du
  web (dans la scène du GLB, conversion d'axes de `UStridesHorseTack`).
- Clés des 11 clips (260), positions des articulations dans la scène du GLB, données compressées (celles du jeu) :
  - clips à 24 images/s, os skinnés : source **0,0119 cm**, miroir **0,0124 cm** du web (critères : miroir ≤ source +
    0,05 cm et ≤ 0,5 cm) ;
  - clips à 30 images/s (trot, ses virages, jump_gallop), sans critère : source jusqu'à 7,99 cm, miroir jusqu'à
    **20,87 cm** (jump_gallop_M clé 23, `toes_01_middleslider_01_out_l`) : l'écart d'import change aussi la décision « l'os
    partenaire bouge » de la conservation des longueurs ;
  - toutes articulations : l'os d'aide `mountpoint_01` (aucun sommet) s'écarte de **91,6 cm** avec les données
    compressées (20,9 cm au plus avec les données brutes) : invisible, déclaré ;
  - données brutes (information) : mêmes chiffres pour les os skinnés.
- Images d'O1 avec un clip miroir (cheval posé par le mélangeur WildMesh, clips miroir d'Unreal), 170 images retenues
  (E2g 90, E3 40, E3b 40 ; source à 24 images/s, hors saut) : **ancres dans S 0,0043 cm, siège 0,0013 cm, 0,0004°**,
  ancres dans le repère du cheval 0,0061 cm, postérieurs identiques au web ; encolure sur la sélection du plan (un clip
  ≥ 0,99) dans la tolérance, aux allures mêlées 0,515 cm au plus (E2g image 77, tranche 17 : déclaré, comme le flanc de
  l'étape 5). À part, sans critère : 88 images de trot en miroir (ancres 0,18 cm) et 4 images de saut (ancres **9,4 cm**) :
  la vue du web fait basculer le corps face aux barres (`pjlHorse.js` `_barClear` : `body.rotation.x`, `body.position.z`),
  ce qu'O1 n'exporte pas ; la pose mêlée elle-même a été comparée au web, mélangeur reconstruit dans la page aux images
  E3 39 à 41 : **0,0045 cm** (diagnostic du 24/11, non versionné).
- Jeu avec l'option : le maillage posé par le mélangeur à couches = lecture du clip miroir à **0,00003 cm** (couche seule,
  et 0,3 canter + 0,7 canter_M) ; au galop sans virage, 40 images : couches canter (poids leadBlend) et canter_M (1 −
  leadBlend) au même temps de clip, poids identiques au calcul du cœur, main gardée à gauche.

### Mutations (`scripts/unreal/mutations-horse-mirror.py`)

Cœur (copie de `HorseMirror.cpp`, ctest `monte-miroir`, ~30 s) : 23 mutations, **19 détectées**, 4 déclarées dans
`ATTENDUES` : normale du plan inversée (équivalente : S ne dépend que de n nᵀ et d n) ; signe du déterminant ignoré à la
décomposition (équivalente, déduit : les matrices locales de la cuisson sont de déterminant positif) ; seuil de virage
0,25 → 0,30 rad/s et maintien non remis à zéro (**faiblesses** : O1 n'a ni virage entre 0,25 et 0,30 rad/s pendant un
maintien, ni maintien interrompu ; le seuil 0,45 est départagé). Détectées notamment : aucune paire, pose miroir sur l'os
lui-même, côté `_right` ignoré, plan décalé, signe de la réflexion, matrices C omises, longueurs non conservées, os fixes
non remis au repos, seuil de mouvement ×10, bassin corrigé, continuité du signe, racines gardées, virages non renommés,
fin non bouclée, poids des clés, main (maintien 0,4 s, seuil 0,45, main des clips inversée), fondu 5/s.

Moteur (`--moteur`, source du dépôt muté, UBT puis `Strides.Parite.HorseMirror`) : témoin vert ; 11 mutations, **7
détectées** (aucun os apparié : 143 cm ; longueurs non conservées : 13,6 cm ; signe de la réflexion : 28,1 cm ; plan
incliné : 3,3 cm ; plan pris à 0 s au lieu de 0,5 s ; clip miroir au poids leadBlend ; fondu de main absent), 4
déclarées : plan décalé de 0,5 unité (équivalente dans Unreal, déduit : translation absorbée par la racine dont la piste est
omise ; détectée au niveau cœur), racines non remises au repos à la cuisson (équivalente, déduit : la rotation de 90° de la
racine est autour de l'axe latéral et commute avec S), durée non arrondie (équivalente : `GetPlayLength` rend un `float`),
poids relatif oublié au mélange (équivalente pour le jeu, qui ne mêle que deux couches de poids w et 1 − w). Campagne du
24/11 : 10 mutations en 1 138 s, code de sortie 1 car ces 4 n'étaient pas encore listées ; liste corrigée, puis plan
incliné ajouté et passé seul (`--noms=`, 283 s, code 0) ; sources rétablis et recompilation finale code 0 les deux fois.

### Captures côte à côte (rendu GPU réel, 844 × 390, `captures/`)

Web : `export-rider-rules.mjs --shots=<dossier> --only-shots=galop-gauche,saut-gauche` (E2g image 100, galop à gauche
sur canter_M et canter_L90_M ; E3 image 50, en vol sur jump_canter_M) ; poses dans `captures/poses-miroir.json`. Unreal :
`-game -windowed -ResX=844 -ResY=390 -StridesShots=miroir -StridesRider=regles -StridesHorseLead=web
-StridesShotsDir=<dossier> -StridesMontePoses=<poses-miroir.json>` : parcours de démonstration, capture au premier galop
sur les clips miroir seuls (leadBlend 0,0000, 6,22 m/s), puis 0,36 s après un départ de saut en miroir. Fichiers
`monte-galop-gauche-{web,unreal}.png`, `monte-saut-gauche-{web,unreal}.png` ; montages sous
`.ue-cache/travail/m2/montages/` (non versionnés). Pas des poses jumelles (décor, phase, hauteur d'obstacle, cheval
3,7 % plus petit) : elles montrent le galop et le saut à main gauche dans les deux jeux.

### Portes

- G1 : ctest code 0 ; cœur 300 729, `monte` 306 914, `monte-cheval` 3 719, `monte-cavaliere` 72 547, `perf` 20,
  **`monte-miroir` 4 202** vérifications, 0 échec (construit sous `.ue-cache/travail/core`).
- G2 : UBT code 0, aucun avertissement ni erreur du compilateur dans le journal final.
- G3 : `Automation RunTests Strides` : **37 tests, 37 en succès**, 0 échec (nouveau : `Strides.Parite.HorseMirror`).
  Avertissements : 2, sur `Strides.Parite.CsoHorse` (test en cours quand l'éditeur cherche les appareils iOS :
  `idevice_id`, erreur 86, déjà relevé aux reliquats M1).
- G4 : `mutations-horse-mirror.py` (cœur code 0 ; moteur : voir ci-dessus).
- G5 : `git diff --quiet HEAD -- unreal/docs/parite/cso` code 0 (PNG du CSO non régénérés : le jeu par défaut et le mode
  `cso` ne prennent pas l'option).
- G6 : `build-parite.py` code 0 ; lignes `cheval.main-galop` (absent → partiel, joué à l'écran avec l'option) et
  `cheval.saut-animation` (miroir) mises à jour.
- G7 : `git diff --quiet HEAD -- src public tests` code 0.

Reste à faire (M2) : clips à 30 images/s (trot, jump_gallop) à réimporter à 24 images/s si Julien l'accepte (toucherait
les clips du CSO prouvé, captures CSO à refaire) ; variantes de virage et lissage des poids du mélangeur ; images de saut
d'O1 non comparables tant que la bascule `_barClear` n'est ni exportée ni portée ; option `-StridesHorseLead=web` à faire
passer au jeu par défaut sur décision de Julien (elle change le galop du départ : le web part à main gauche).

## Étape M2, correction après contrôle adverse (24/11/2026)

Base : `e42cd907` (M2 b). Cinq constats du contrôle adverse, traités un par un.

### 1. Saut en miroir selon la main : la preuve annoncée était absente (constat fondé, corrigé)

Le ctest comparait deux champs d'O1 entre eux (`jm == (lead == 'L')`) sans appeler le port, et le choix du moteur
(`StridesHorse.cpp`, `bJumpMirror = Lead == 'L'`) n'était vérifié par aucun test : une mutation `Lead == 'R'` passait
(« NON DÉTECTÉE ; Success », journal du contrôleur). Correction :

- Cœur : `strides::mirror::jumpChoice`, `jumpClipName`, `jumpViewStep` (port de `view.js:229-233` : choix au premier instant
  de saut seulement, clip `jump_gallop` si `s.speed > 8`, miroir si `s.lead === 'L'`, choix gardé jusqu'au saut suivant).
  Le moteur appelle `jumpViewStep` ; le seuil 7 m/s ne reste que dans le jeu par défaut (sans l'option, inchangé, G5).
- ctest : `jumpViewStep` rejoué à chaque image d'O1 (921 images) depuis le mode, `hz.v` et la main des clips, comparé au
  clip (`jc`) et au miroir (`jm`) relevés dans la vue du web, puis aux décisions de synthèse (point 5).
- Moteur : section 6 de `Strides.Parite.HorseMirror`, cheval Unreal avec l'option mis à jour par `StepAnimation` (même
  code que le jeu), saut, vitesse et main posés par des points d'entrée de test (`SetJumpingForTests`, `SetLeadForTests`,
  `SetTurnForTests`, `ResetWebLeadForTests`, non appelés par le jeu) : 19 scénarios de la vue du web, 348 images,
  20 départs de saut dont 10 en miroir : **0 écart** de clip ou de miroir, **0 couche de saut fausse** (couche unique au
  poids 1 : `jump_*_M` cuit si le web joue le miroir, sinon le clip importé), leadBlend à 0 du web.
- Mutations moteur ajoutées, dont celle du contrôleur (point 4).

Pour rejouer les pas du web sans arrondi, le pas de l'animation du cheval est passé en `double` (`StepAnimation`,
`LastDt`, `UpdateWebLeadAnimation`) ; dans le jeu, il reçoit toujours `DeltaSeconds` (float), valeur identique.

### 2. Branchement du saut : seuil corrigé, écarts restants déclarés (constat fondé)

Seuil corrigé avec l'option : `jump_gallop` au-delà de 8 m/s (strict), départagé par les cas 7,999 / 8 / 8,000001 m/s.
**Non portés (avec l'option comme sans)** : horloge du saut du web (`ct = toeOff + jt` avant l'appel, puis `toeOff + (jt / T)
· (foreLand − toeOff)`, bornée à la fin du clip), contacts du clip qui la calent (`asset.js:174-230` : toeOff, foreLand,
hindLand, nextFore, pelvisRise), fondu `jumpWeight` (18/s à la montée, 12/s au retour), suite après réception (`postLand`,
fondu de sortie jusqu'au poser suivant), hauteur `rootY` retranchée, saut tenu à part du mélange des allures (poids
`groundW`), repli `?? jump_gallop`. Le clip de saut d'Unreal est lu depuis 0 au temps du jeu et coupé à la réception.

### 3. Captures : illustrations, pas une comparaison de pose (constat fondé, déclaré)

Les captures `captures/monte-{galop,saut}-gauche-*.png` montrent le galop et le saut à main gauche dans les deux jeux,
mais ni le même décor, ni le même instant de foulée, ni la même phase de saut (web : E3 image 50, appel ou début du vol ;
Unreal : 0,37 s après le départ dans les captures refaites, horloge du saut non portée). Sur une image fixe, la main ne se lit pas avec certitude :
elle est attestée par le journal de capture (leadBlend, clip miroir) et par l'état d'O1, et prouvée par les tests ci-dessus,
pas par les images.

### 4. Plan décalé au niveau moteur (constat fondé, corrigé)

`Strides.Parite.HorseMirror` vérifie désormais la réflexion de la cuisson elle-même : le milieu des bras est un point fixe
de S et milieu + n est envoyé sur milieu − n (Unreal : 1,8e-12 cm ; web : 2,8e-14 unité), et le plan du web recalculé par
le port est celui des bras relevés par three.js (`idle.upperarm` : milieu 0, décalage d 1,8e-15 unité). Le décalage de
0,5 unité ne déplace aucune pose locale dans Unreal (translation absorbée par la racine dont la piste est omise), mais il
fausse la réflexion : il est désormais détecté.

### 5. Faiblesses d'O1 (constat fondé, corrigé) et ressource 404 (identifiée)

Oracle de synthèse `miroir/decisions.json` (55 Ko), écrit par le même pilote `export-horse-mirror.mjs` : scénarios
d'entrée écrits par le pilote, sorties produites par le code du jeu dans la page (`animateHorse` sur un cheval procédural
`createHorseMesh`, état neuf par scénario ; `HorseView.update` sur le cheval préparé par le jeu, vue neuve par scénario).
10 scénarios de main (648 images, 14 changements : virage 0,27 et 0,26 tenu, 0,25 exact, maintien interrompu par un virage
nul ou du côté de la main, maintien de 0,5 s exact au pas de 0,0625 s, pas de 0,15 s, pas variables, aller-retour,
sinus) et 19 de saut (8 vitesses × 2 mains, mode `takeoff`, main changée en vol puis second saut). Constat du web relevé au
passage : `animateHorse` borne le pas à 0,1 s avant la main (`anim.js:267`) ; le port ne le faisait pas, corrigé
(`leadStep`). Deux exports identiques à l'octet (`diff -r`), un troisième n'écrit rien ; les 24 fichiers d'O-miroir déjà
versionnés sont inchangés. ctest et moteur : égalité exacte (main, maintien, clip, miroir, leadBlend).

La ressource 404 de l'export était `/favicon.ico` (la page n'en déclarait pas) : `<link rel="icon" href="data:,">` ajouté,
plus aucune erreur de chargement (écouteurs `response` et `requestfailed` ajoutés au pilote). Reste un avertissement
`[logo] logo officiel Strides non chargé`, émis par la sellerie de `HorseView` à sa construction (logo du tapis dessiné
avant le chargement de l'image) : sans effet sur les décisions relevées.

### Mutations (campagne du 24/11 après correction)

Cœur : 31 mutations, **29 détectées**, 2 équivalentes déclarées (normale inversée, signe du déterminant). Désormais
détectées : seuil 0,25 → 0,30 rad/s et maintien non remis à zéro (faiblesses d'O1), plus les nouvelles : pas non borné,
maintien ≥ 0,5 s, virage ≥ 0,25, miroir à main droite, galop dès 7 m/s, galop à 8 m/s inclus, choix refait à chaque image,
choix effacé à la réception.

Moteur (`--moteur`, campagne complète du 24/11, 2 933 s, sources rétablis, recompilation finale code 0) : 17 mutations,
**14 détectées**, 3 équivalentes déclarées (racines non remises au repos, durée non arrondie, poids relatif au mélange).
Désormais détectées : plan décalé de 0,5 unité (par le contrôle de la réflexion), et les nouvelles : **saut en miroir à main
droite** (`Lead == 'L' ? 'R' : 'L'` passé à `jumpViewStep`, l'équivalent de la mutation du contrôleur), miroir du saut
jamais joué, saut au galop dès 7 m/s, choix du saut refait à chaque image, virage de signe inversé pour la main, pas de la
main pris en 32 bits. La mutation « miroir jamais joué » écrite `false ? …` ne compilait pas (`-Wunreachable-code`) et
comptait comme non détectée : réécrite `Dt < 0 ? …` (fausse à l'exécution) et passée seule (`--noms=`, 325 s, code 0,
détectée).

### Portes (correction)

- G1 : ctest code 0 ; cœur 300 729, `monte` 306 914, `monte-cheval` 3 719, `monte-cavaliere` 72 547, `perf` 20,
  **`monte-miroir` 7 069** vérifications (4 202 avant), 0 échec.
- G2 : UBT code 0, aucun avertissement ni erreur du compilateur.
- G3 : `Automation RunTests Strides` : 37 tests, 37 en succès.
- G4 : `mutations-horse-mirror.py` : cœur 29/31 (2 équivalentes), moteur 14/17 (3 équivalentes), voir ci-dessus.
- G5 : `git diff --quiet HEAD -- unreal/docs/parite/cso` code 0 (le jeu par défaut garde le seuil de 7 m/s et les clips
  d'origine).
- G6 : `build-parite.py` code 0 ; lignes `cheval.main-galop` et `cheval.saut-animation` mises à jour (preuve et écarts).
- G7 : `git diff --quiet HEAD -- src public tests` code 0.

Captures Unreal refaites avec le code corrigé (même commande, journal
`.ue-cache/travail/m2c/shots-unreal/jeu.log` : galop à gauche leadBlend 0,0000 ; saut `jump_canter_M`, 0,37 s après le
départ, 6,20 m/s) et remplacées dans `captures/` ; captures web inchangées. Montages sous `.ue-cache/travail/m2c/montages/`.

Reste à faire (correction de M2) : horloge du saut du web et ses contacts, fondu `jumpWeight`, suite `postLand` et
hauteur `rootY` (point 2) : à porter dans une étape dédiée au saut animé, avec un oracle des contacts de `asset.js` ;
seuil de 7 m/s du jeu par défaut à aligner sur 8 m/s seulement avec les preuves CSO refaites (décision de Julien) ;
captures appariées (même instant de foulée et même phase de saut) quand l'horloge du saut sera portée.

## Étape M3. Niveau B : cavalière sur le cheval Unreal (24/11/2026)

Base : `246c4e3a` (correction de M2), branche `claude/unreal-port`. Plan §5 et étape 12, adaptés à la voie A (option
`-StridesRider=regles`, pas de MetaHuman). Chemins réels du dépôt et du moteur ; fichiers lourds sous `.ue-cache/travail/m3/`.

### 1. Entrées de la règle venues du cheval Unreal, rendues fidèles au web

- **Phase de foulée** (`gaitInfo.offset`, `align`). Avant M3, la règle lisait la phase brute du clip joué. Le web lui donne
  `horse.anim.phase = wrap01(ph − align[clé].off)`, où `ph` est la phase des clips de la vue (temps du clip =
  `((ph + gaitInfo[k].offset) % 1) · durée`), réécrite seulement sans saut au-delà de 0,2 m/s (`pjlHorse.js` `_snapshot`).
  - Données : `scripts/unreal/export-horse-phase.mjs` (page `horse-phase-export.html`, Vite 5178) relève dans le jeu en
    cours d'exécution les appuis des clips (`asset.gaitContacts`), `gaitInfo`, `GAIT_OFFSETS`, et la sortie du calage d'un
    `PjlHorse` construit sur le cheval préparé par le jeu (`align`, `leadSwap`) ; seuils 9,8 m/s et 0,2 m/s relus dans
    `pjlHorse.js` (une seule occurrence exigée) ; → `Content/Data/pjl_horse_phase.json` (4 183 octets). Deux exports : même
    contenu (`--check`).
  - Cœur : `StridesCore/HorsePhase` (port de `circularOffset`, `_calibrate`, de la réécriture de `_snapshot` et, inversée,
    de la formule de `view.js`). ctest `monte-cheval` (4 488 vérifications, 3 719 avant) : calage recalculé = calage du jeu
    (écart 0 sur les 6 clés, `leadSwap` faux) ; à chaque image d'O1 (8 scénarios, 929 images), phase retrouvée depuis le
    temps du clip d'allure du mélangeur (`mx.a`) contre `hz.ph` : **753 images réécrites, écart max 2,2e-16** ; 176 images
    tenues (arrêt, saut) : écart de la phase tenue jusqu'à 0,4985 (E3b image 55), déclaré ; 32 images n'ont que des clips
    de virage (durée propre) : non comparées.
  - Jeu : `UStridesHorseTack::StepPhase` (clip d'allure relu sur le maillage : mélangeur à couches ou mode à un clip ;
    allure `GaitIndex` ; main du web avec `-StridesHorseLead=web`, sinon droite, celle des clips d'origine) ;
    `UStridesRiderRig::SampleFromTack` lit `RiderPhase()`.
- **contactOff, horseY, postOffset** : 0, et c'est exact pour le cheval Unreal (commentaires dans `SampleFromTack`). Le
  web retire de `bob` l'abaissement d'appel de sa vue (`_pushContact`, E3b : 7 images, jusqu'à 25,6 cm) et lit la hauteur
  et le tangage du siège dans le monde (son cheval suit la pente : jusqu'à 1,5 cm en E2) ; le cheval Unreal n'abaisse pas
  son corps et ne suit pas la pente, son repère n'a que le cap. `riderPostOffset` n'est affecté nulle part dans `src/`
  (compte écrit dans `pjl_horse_phase.json`, vérifié par le ctest et le test moteur).

### 2. Rejeu sur le cheval Unreal : `FStridesRiderOnHorseReplay` et `Strides.Parite.RiderOnHorse`

`SG/StridesRiderReplay.cpp` (code commun au test et aux captures) : à chaque image d'O1, le mélangeur du jeu
(`UStridesHorseAnimInstance`, option `-StridesHorseLead=web`) reçoit les clips, poids et temps du web (`mx.a`, clips
miroir cuits par M2), le maillage du jeu est évalué (échelle du jeu ; ni inclinaison `mx.rz` ni corps `mx.by`, comme en
jeu), la sellerie Unreal calcule siège, ancres, profils, postérieurs et phase, puis la chaîne du jeu pose la cavalière
(première image par son canal `in`, virage par le canal `in` comme au niveau A).

`Strides.Parite.RiderOnHorse` (E1, E1b, E2g, E2d, E3, E3b : 689 images, dont 362 avec un clip miroir) vérifie :
- phase réécrite depuis le clip Unreal = `hz.ph` : **515 images, écart ≤ 5e-10** (critère 1e-5) ;
- adaptateur (clip relu sur le maillage) = cœur nourri des clips du web, mêmes images réécrites, même phase ;
- chemin du jeu (`UStridesHorseTack::Step`) : 15 cas d'allure, de main et de clip (canter, canter_M, gallop, gallop_M,
  trot, walk, seuil 9,8 m/s, couche idle en tête) → phase du web ;
- `contactOff`, `horseY`, `postOffset` nuls, `bob` = hauteur du siège Unreal de l'image précédente (écart 0), phase du
  composant avec le retard d'une image ;
- allonge du bras ≤ 0,97 (bornée par la règle), articulations finies ;
- **contrôle** : le même rejeu avec le cheval Unreal posé comme celui du web (échelle 0,010388, lacet, sol, corps et
  inclinaison de la vue, pente du terrain) : **avant le premier saut, la cavalière redonne O2 rider_f à 0,64 cm près (555
  images)** ; avec en plus la phase du web : au sol 0,637 cm (clips du trot importés à 30 images/s), 0,127 cm hors trot ;
  toutes images 4,06 cm (E3 image 64, saut : bascule `_barClear` non exportée), 5,68 cm avec la phase tenue (E3 image 48).
  Le rejeu ne fausse donc pas la mesure : les écarts du niveau B viennent du cheval du jeu.
- information : `ρ` max 0,9605 (E2g image 46 ; la règle ne la borne pas, O2 va jusqu'à 0,9556) ; cheval Unreal contre web :
  `bob` jusqu'à 14,66 cm (E3 image 72, corps non retenu au saut), tangage 6,45° (E3 image 43), siège dans le repère du
  cheval 28,67 cm (E3 image 41) ; au galop en cercle, le siège du web est déporté de 24 cm par l'inclinaison de la vue,
  celui d'Unreal non. Coût du rejeu (cheval, sellerie, règle, pose ; éditeur sans rendu) 0,11 à 0,28 ms par image en
  moyenne selon la passe, information (le coût en jeu reste celui de l'étape 7).

### 3. Grandeurs M1 à M18 : `niveau-b.md` (`scripts/unreal/rider-rules-niveau-b.mjs`)

Même code de métriques que le web (`rider-rules-metrics.mjs`) ; références O1 (plan) et O2 rider_f (mêmes proportions) ;
colonnes de décomposition O2 − O1 (proportions) et contrôle − O2 (rejeu).
- **61 critères sur 215 non tenus contre O1.** Seuils absolus : 23 manqués sur 114, dont **20 aussi manqués par O1** (M6
  ρ assis, M7 flanc, M9 poignet : limites de la règle du web) ; les 3 propres à Unreal : ρ hors de la selle 0,9605 (E2g)
  et 0,9571 (E2d), seuil 0,955, O1 0,9459 ; poignet 8,99 cm en E2d (seuil 9, O1 9,01). M1 et M2 tenus partout (44 et 12
  critères), coude et allonge tenus.
- Écarts aux références : 36 sur 83 non tenus contre O1, **22 sur 83 contre O2** (plus 2 phases du saut d'E3) ; dans les
  scénarios sans saut (E1 à E2d), la colonne contrôle − O2 reste ≤ 0,64° et ≤ 0,06 cm : l'écart vient du cheval du jeu. Les plus grands, au galop en cercle (inclinaison absente) : hanche 14,0° (E2g), ouverture du genou
  21,2° (E2d), cheville 11,8° (E2d) ; assise au pas 2,3 cm (E2d) ; levée maximale de l'assise O2 + 3,3 cm.
- M17 : appel, sommet, poser des antérieurs, montée et maximum de jumpK identiques à O1 ; poser des postérieurs détecté
  **12 images trop tôt en E3** (70 contre 82) et retenu par la règle 3 images trop tôt (70 contre 73) ; E3b dans ± 2.
- Non mesurables dans Unreal : M4 (aucun étrier affiché), M5, M8 (pénétration par rayons dans la page web), M18 (rênes) ;
  M19 (montée et descente) : aucun oracle.

### 4. Captures appariées (rendu GPU réel, 844 × 390) : `captures/niveau-b/`

Web : `export-rider-rules.mjs --shots --only-shots=arret,galop,galop-gauche,saut-sommet` (nouvelle pose `saut-sommet` :
image relue dans O1 par `jumpPhases`, E3 image 50) ; `poses.json` versionné. Unreal : `-StridesShots=monte-b
-StridesRider=regles -StridesHorseLead=web` (nouveau mode : ticks du cheval, de la sellerie et de la cavalière suspendus,
rejeu de l'image d'O1 de la pose sur le cheval Unreal, cheval soulevé de la hauteur du saut enregistrée, même caméra dans
le repère du cheval). Cette fois les poses sont **jumelles** (même image d'O1, même instant de foulée et de saut) ; le
décor diffère (plage du web, carrière du Pôle), et le cheval Unreal n'a ni selle, ni bride, ni étriers. Journal de la passe
(`.ue-cache/travail/m3/shots-unreal/jeu.log`) : galop à droite, phase lue 0,4791, 2 clips ; galop à gauche, 2 clips miroir ;
sommet du saut, 2 clips miroir, cheval soulevé de 1,135 m ; cavalière à 0,0000 cm du siège à chaque capture. Les PNG web
refaits ne sont pas identiques à l'octet à ceux de M1 et M2 (rendu SwiftShader) ; ceux de `captures/` ne sont pas remplacés.
Montages web | Unreal sous `.ue-cache/travail/m3/montages/`.

### 5. Mutations (`scripts/unreal/mutations-rider-on-horse.py`)

22 mutations, **21 détectées**, 1 équivalente déclarée (`ATTENDUES`), sources rétablis, recompilation finale code 0.
- Cœur (11, copie de `HorsePhase.cpp` reliée au ctest `monte-cheval`, ~20 s) : 11 détectées. Calage (signe de l'écart
  circulaire, résidu sans valeur absolue, appuis sans `gaitInfo.offset`, main gauche calée sur le clip d'origine, marge de
  `leadSwap`) ; phase (`gaitInfo.offset` ajouté, `align` ignoré, clé de main inversée, grand galop dès 6,8 m/s, réécrite
  pendant le saut, réécrite à l'arrêt).
- Moteur (11, source du dépôt muté, UBT puis `Strides.Parite.RiderOnHorse`) : 10 détectées. Phase du clip décalée de
  0,1 ; première couche prise même hors allure (**non détectée au premier passage** : dans les mélanges d'O1 un clip
  d'allure est toujours en tête, 558 images sur 558 ; cas de synthèse ajouté au chemin du jeu, couche idle avant
  canter_M, puis détectée, passe seule `--noms=`, 439 s) ; main du jeu ignorée ; allure décalée d'un rang ; phase non
  calculée au tick ; phase brute du clip (comportement d'avant M3) ; `horseY` = hauteur du siège ; `contactOff` non nul ;
  temps des clips du web ignorés au rejeu ; phase du web passée à la règle en jeu. Équivalente : nom du clip miroir pris
  sur le clip source (le nom ne sert qu'à la famille d'allure, la même ; la durée lue est celle du clip miroir).
- Campagne du 24/11 : 3 045 s pour les 22 (code de sortie 1 : 2 non détectées hors liste) ; le test a ensuite reçu la
  comparaison adaptateur = cœur et le cas de synthèse ; les 2 mutations alors non détectées ont été rejouées avec le test
  final (596 s, puis 439 s). Les 9 autres mutations moteur détectées l'ont été par la version précédente du test, dont
  la version finale ne retire aucune vérification.

### 6. Portes

- G1 : ctest code 0 (construit sous `.ue-cache/travail/core`) ; cœur 300 729, `monte` 306 914, **`monte-cheval` 4 488**
  (3 719 avant : phase de foulée), `monte-cavaliere` 72 547, `perf` 20, `monte-miroir` 7 069 vérifications, 0 échec.
- G2 : UBT code 0, aucune erreur ni avertissement du compilateur dans les journaux.
- G3 : `Automation RunTests Strides` : **38 tests, 38 en succès** (nouveau : `Strides.Parite.RiderOnHorse`). Avertissements,
  5 : `idevice_id` (erreur 86, déjà relevé) deux fois sur `Strides.Cso.Aids` et deux fois sur `Strides.Parite.CsoRun`, et
  « HTTP request timed out after 3.00 seconds URL=https://www.google.com/generate_204 » sur `Strides.Cso.Aids` (test de
  connexion de l'éditeur, sans effet sur les tests).
- G4 : `mutations-rider-on-horse.py` (ci-dessus) ; sources touchés : `mutations-horse-tack.py --moteur` (après ajout de
  `HorsePhase.cpp` à l'édition de liens du banc, liste inchangée) 35 mutations, 29 détectées, 6 déclarées, code 0, 1 758 s
  (la raison déclarée de « composant : saut ignoré », clips de saut absents d'Unreal, est périmée depuis M2 :
  `Strides.Parite.HorseSeat` ne pose toujours aucune image de saut, mais `Strides.Parite.RiderOnHorse` le fait) ;
  `mutations-rider-rig.py --moteur` 12 sur 12, code 0, 1 472 s. Sources rétablis, recompilation finale code 0.
- G5 : `git diff --quiet HEAD -- unreal/docs/parite/cso` code 0 (jeu par défaut inchangé : la phase n'est lue que par la
  règle, option `-StridesRider=regles` ; le mode `monte-b` est nouveau).
- G6 : `build-parite.py` code 0 ; lignes `cavaliere.amorti-dos`, `suspension-galop`, `saut`, `jambes-etriers`, `flanc`,
  `mains-renes` mises à jour (preuve et écart du niveau B).
- G7 : `git diff --quiet HEAD -- src public tests` code 0.

Reste à faire (M3) : phase de la locomotion procédurale du web pendant le saut et à l'arrêt (`horse/anim.js`), horloge du
saut, corps et bascule au saut, inclinaison en virage, cadence de foulée réglée sur la vitesse (en partie jouée le cheval
Unreal joue ses clips à vitesse 1) ; sellerie absente ; mesure du niveau B en partie jouée (ici : rejeu des oracles) ;
décisions de Julien listées dans `decision-voie-a.md`.

## Étape S1. Sellerie complète du cheval Unreal (24-25/11/2026)

Décision de Julien du 24/11/2026 (`decisions.md`), première étape. Base : `b369dcbd`. Le web est la spécification : rien
n'est dessiné à la main, les géométries, couleurs et constantes viennent de la page ou du source.

### Ce que le web fait (lu dans le JS)

- **Pièces skinnées** (`pjl/tack.js buildTack`, `pjl/view.js buildTackMeshes`, `setTackVisible`) : tapis (matelassé,
  `quiltMaterial`), liseré, selle, sangle, filet (muserolle, têtière, frontal, montants), mors, guêtres, bonnet. Ce ne sont
  **pas** des maillages du GLB : elles sont construites au chargement sur la surface du corps, skinnées sur les os du corps
  (espace de liaison). Visibles selon l'équipement : dans le scénario E1 d'O1, 7 pièces sur 8 (bonnet masqué).
- **Étriers, étrivières, rênes** (`pjlHorse.js` `ironGeometry`, `Strap`, `_straps` ; `horse.js _stirrupsFollow`) : étrier
  sous l'os de l'orteil du cavalier abaissé de 0,015 · scale (sinon à l'ancre d'étrier), étrivière (6 segments, 1,3 cm) du
  porte-étrivière à l'œil de l'étrier (+11,5 cm à la verticale), rênes (16 segments, 8 mm) du mors aux poings, flèche
  min(6 cm ; 5 % de la longueur), ou sur l'encolure sans cavalier (flèche 12 cm) ; rien au-delà de 30 m de la caméra.
- **Instants de lecture** (mesurés, ctest) : l'orteil lu est celui de la pose du cavalier **de la même image** ; les poings
  (creux du poing du modèle réaliste, `realistic.js gripPoint`) sont ceux de la pose **de l'image précédente**, dans le siège
  de l'image courante.

Vérifié : le cheval Unreal est le même cheval PJL que le web (mêmes 419 articulations, mêmes noms ; la formule de la page
appliquée à 160 sommets du corps redonne le corps du GLB normalisé à 9,8e-6 près, taille 250,8).

### Ce qui est fait

- **Oracle `unreal/core/tests/oracles/monte/sellerie/`** (`export-rider-rules.mjs --sellerie`, 6,9 Mo, plus gros fichier
  1,1 Mo) : les 8 scénarios d'O1 rejoués à l'identique (repère S égal à O1 à chaque image, contrôlé par l'export), relevé à
  l'appel de `_straps` et de `_stirrupsFollow` (enveloppes en lecture seule des méthodes) : entrées (ancres, poings,
  repère du cheval, caméra, orteils) et sorties (visibilité, étriers, sommets des rubans) ; une image sur dix, 109 sommets
  témoins des pièces skinnées dans S. **Deux exports identiques à l'octet** (shasum des 9 fichiers). Image 0 : poings et
  rênes non exportés : les poings du modèle réaliste avant la première image variaient d'un export à l'autre (3e-5 m).
- **Géométrie** (`--sellerie-maillage`, hors dépôt) → `tack-horse-glb.py` : GLB des 8 pièces sur le squelette et la peau
  du GLB normalisé (sommets à la pose de repos de la scène, formule de `anchorWorld`) et `Content/Data/pjl_horse_tack_mesh.json`
  (52 Ko : visibilité, couleurs linéaires, sommets témoins et leurs os, géométrie des étriers, constantes de `_straps` et
  `_stirrupsFollow` **relues dans le source**, une seule occurrence exigée) → `import-horse-tack.py` (Interchange, squelette
  `Object_426_Skeleton`, une pièce par asset, poids sur 16 bits) : `Content/Characters/Horse/horse_pjl_tack` (3,8 Mo,
  `SK_Tack_*`, `M_StridesTack` avec le motif matelassé de `quiltMaterial`, `MI_Tack_*`).
- **Cœur `StridesCore/HorseStraps`** (C++20, sans type Unreal) : `strapSet`, `stirrupUnderToe`, `strapsStep`.
- **Composant `UStridesHorseTackMesh`** (créé par `AStridesHorse` avec `-StridesRider=regles` ou `-StridesTack=web` ;
  `-StridesTack=aucune` l'empêche, pour les captures « avant ») : pièces suiveuses du maillage du cheval
  (`UStridesTackPieceComponent`), étriers et rubans en `UProceduralMeshComponent`, tick après le cheval et la cavalière ;
  orteils et creux des poings lus sur la cavalière de la règle (`UStridesRiderRig::ToePoint`, `GripPoint`) ; coût mesuré.
  Sans cavalière posée par la règle : étriers pendants, rênes sur l'encolure (comme le web sans cavalier).
- **Jeu par défaut inchangé** : sans option, aucun composant (vérifié par le test) ; captures du CSO intactes (G5).

Deux défauts trouvés au rendu, corrigés (aucun ne se voyait dans les tests sans rendu, ce qui justifie les captures) :
1. les matériaux enregistrés dans les assets importés n'étaient pas relus en jeu (`WorldGridMaterial`) : posés par le
   composant ; vérifié par le test ;
2. selle, tapis, liseré, sangle, filet et mors n'étaient **pas rendus** (guêtres seules visibles) : les bornes d'un suiveur
   viennent de la pose de référence de la pièce, où le cheval du GLB est couché (racine tournée de 90°) ; le rendu les
   écartait. Bornes recalculées sur les os du meneur qui portent la pièce (marge 40 cm) ; test : bornes contenant tous les
   sommets posés (chemin du rendu, `ComputeSkinnedPositions`) à chaque image des 6 scénarios.

### Preuves

- **ctest `monte-sellerie`** (7 443 vérifications, 0 échec) : 929 images, toutes affichées ; os d'étrier à 2e-13 m de
  l'orteil abaissé ; étriers à 0 m, orientation exacte ; **265 920 coordonnées des rubans identiques au bit** aux flottants
  32 bits du web (0 ulp) ; orteil lu = pose de la même image à 1,6e-13 m (7,8 cm de la précédente) ; poings = pose
  précédente à 8,2e-7 m (5,5 cm de celle de l'image).
- **`Strides.Parite.HorseTackMesh`** (nouveau, vert) :
  - 8 pièces, même squelette, suiveuses et rattachées au maillage du cheval, 7 visibles comme dans le web, triangles égaux
    au web ; 109 sommets témoins retrouvés au repos à 0,0034 unité du maillage, **mêmes os porteurs, poids à 1,9e-5** ;
  - cheval posé comme le web (contrôle du rejeu), témoins skinnés contre le canal `tk` : **0,436 cm au plus sur 5 432
    points** aux images posées par les seuls clips. Au saut, à la réception et avec bascule ou levée de tête du web :
    16,8 cm au plus (2 198 points), et les **ancres du cheval** s'écartent déjà de 11,1 cm aux mêmes images : la pièce suit
    le cheval Unreal, qui n'a pas ces mouvements (S4). Bonnet (masqué) : 3,1 cm (oreilles, earPrick non porté) ;
  - étrier sous l'orteil de la pose de l'image à 4,4e-14 cm ; contre l'étrier du web recalculé sur O2 rider_f : **0,64 cm
    avant le premier saut** (1 110 étriers), 4,06 cm au plus (saut) ; étrivière et rênes aux bonnes extrémités (≤ 3e-14 cm) ;
    rubans dans le bon axe ; creux du poing = milieu des 4 os relus par leur nom (8e-8 cm) ; géométrie des étriers = web ;
    tampons affichés = sortie du cœur ; bornes et matériaux des pièces à chaque image ;
  - coût de `StepStraps` (logique et rubans) dans le test : 0,0024 ms en moyenne, 0,072 ms au plus (1 378 images).
- **Niveau B** (`Strides.Parite.RiderOnHorse` exporte maintenant les étriers affichés et M8 ; `niveau-b.md` régénéré) :
  - **M4** (plante – étrier affiché) ≤ 1,00 cm partout, seuil 2 cm tenu (O1 : ≤ 0,82 cm) ;
  - **M5** (étrivière) et **M18** (rênes) relevés : par exemple E1, étrivière gauche 49,2 – 49,5 cm (O1 47,9 – 48,0), rêne
    gauche 96,9 – 99,2 cm (O1 102,7 – 104,6 : cheval Unreal 3,7 % plus petit) ;
  - **M8** (6 rayons, maillage du cheval Unreal skinné) : 0,00 cm aux 449 images de la fenêtre (O1 ≤ 0,07 cm) ; témoin
    positif : un point 30 cm sous le siège est vu dans le corps à 443 images sur 449 (25,8 cm au plus) ;
  - verdict : 61 critères sur 233 non tenus (61 sur 215 avant : les 18 nouveaux critères, M4 et M8, sont tous tenus).
- **Captures** (rendu GPU réel, 844 × 390, `captures/sellerie/monte-<arret | galop | galop-gauche | saut-sommet>-<avant |
  apres>.png`, web : `captures/niveau-b/monte-*-web.png`) ; montages avant | après | web hors dépôt
  (`.ue-cache/travail/s1/montages/`). Ce sont des illustrations (décors différents), pas une comparaison de pose.

### Coût (méthode de l'étape 7, rendu GPU réel, Mac mini, 844 × 390, synchronisation 60 Hz)

`perf-summary.py --mesurer --sellerie --passes=3` : passes alternées « regles » (cavalière de la règle et sellerie
affichée) et « regles-sans-sellerie » (`-StridesTack=aucune`), 600 images par phase ; fichiers `perf/sellerie/`.
- Sellerie affichée mesurée par le jeu (`strapsMs` : logique des lanières et mise à jour des rubans) : **0,013 à 0,014 ms**
  par image (médianes des 3 passes, arrêt et galop ; 95e centile ≤ 0,017 ms).
- Δ temps du jeu (moyenne des médianes) : **+0,093 ms à l'arrêt, +0,096 ms au galop** (seuil de la règle : 0,3 ms, tenu) ;
  dispersion des médianes ≤ 3,7 % (seuil 5 %). Le Δ dépasse le coût mesuré des lanières : le reste (pièces skinnées,
  bornes recalculées, sections des rubans) n'est pas isolé (à confirmer par une mesure dédiée).
- Rendu : Δ fil de rendu +0,003 / +0,002 ms ; GPU −0,031 ms à l'arrêt, +0,119 ms au galop : dans le bruit de la mesure
  sur Metal (valeur absolue du GPU à confirmer, étape 7). Rien n'est mesuré sur iPhone ou iPad.
- Pendant la mise au point, un éditeur bloqué après un plantage de test a tourné jusqu'à 01 h 13 ; arrêté avant ces passes
  (aucune autre instance pendant la mesure, contrôle de `perf-summary.py`).

### Mutations (`scripts/unreal/mutations-horse-straps.py --moteur`, 25/11/2026, 1 613 s)

31 mutations : 22 cœur (copies, ctest `monte-sellerie`), 9 moteur (UBT puis `Strides.Parite.HorseTackMesh`) ; **28
détectées**, 3 non départagées et déclarées : rênes posées sur l'encolure (côté inversé), selle ignorée par la visibilité,
axe latéral du repère du cheval inversé : les trois ne touchent que des branches qu'aucun scénario d'O1 n'exerce (cheval
toujours sellé, cavalier toujours en selle ; l'axe latéral ne sert qu'aux rênes posées). La troisième a été ajoutée à
`ATTENDUES` après cette campagne (le script sortait en code 1 sur elle), sans nouvelle campagne. Sources rétablis,
recompilation finale code 0. Exemples : poings de l'image courante (rênes à 5,4 cm), orteil de la pose précédente (étrier
à 7,7 cm), orteil remplacé par le pied (12,9 cm contre l'étrier du web), pièces sans meneur, visibilité du web ignorée,
étriers sans la symétrie des axes, creux du poing sur trois os : tous détectés.

### Écarts déclarés

1. Corps du cheval au saut, bascule, levée de tête, oreilles : non portés (S4) ; les pièces suivent le cheval Unreal.
2. Cheval Unreal 3,7 % plus petit (S3) : étrivières et rênes plus courtes que le web.
3. Rênes sur l'encolure et seuil de 30 m : codés, non départagés par l'oracle (aucun scénario sans cavalier, caméra proche).
4. Matériaux simplifiés : couleur, rugosité et métal du web, motif matelassé ; `envMapIntensity`, éclairage et ombrage
   d'Unreal différents ; normales des rubans calculées par Unreal (le web n'en donne pas).
5. Licol, sellerie allégée au loin, montée et descente (un pied dans l'étrier), étriers relevés sans cavalier, changement
   d'équipement : non portés.
6. Le jeu par défaut n'affiche pas la sellerie : elle change les captures du CSO ; passage par défaut avec S2.
7. Un éditeur resté bloqué après un plantage de test (le mien, pendant la mise au point) a tourné en parallèle environ 1 h 35
   (01 h 13 au plus tard) ; arrêté avant la mesure du coût et la campagne finale.

### Portes

- G1 : ctest code 0 (construit sous `.ue-cache/travail/core-s1`) : cœur 300 729, `monte` 306 914, `monte-cheval` 4 488,
  `monte-cavaliere` 72 547, `perf` 20, `monte-miroir` 7 069, **`monte-sellerie` 7 443** vérifications, 0 échec.
- G2 : UBT code 0, aucune erreur (compilations successives de S1 ; avertissements du compilateur traités comme erreurs par
  le module : un seul, corrigé, ombrage de variable).
- G3 : `Automation RunTests Strides` : **39 tests, 39 en succès** (nouveau : `Strides.Parite.HorseTackMesh`), 0 échec ;
  avertissements : `idevice_id` (erreur 86, déjà relevé) deux fois, sur le test en cours.
- G4 : `mutations-horse-straps.py --moteur` (ci-dessus) ; cœur seul : code 0 (20 détectées, 2 déclarées).
- G5 : `git diff --quiet HEAD -- unreal/docs/parite/cso` code 0 (jeu par défaut inchangé, captures du CSO intactes).
- G6 : `build-parite.py` code 0 : lignes `cheval.etriers`, `cheval.lanieres`, `cheval.sellerie` (partiel, joué à
  l'écran), `cheval.sellerie-couleurs`, `cheval.renes`, `cavaliere.mains-renes` mises à jour.
- G7 : `git diff --quiet HEAD -- src public tests` code 0.

Reste à faire (S1) : sellerie visible dans le jeu par défaut (avec S2) ; corps du cheval au saut (S4) ; montée et
descente ; coût sur iPhone ou iPad ; isoler le coût des pièces skinnées.

## Étape S2 (a). Monte du web en un ensemble, derrière options, et preuves (25/11/2026)

Décision de Julien du 24/11/2026 (`decisions.md`) : regrouper la cavalière réglée comme le web (étape 6) et la main du web
(étape M2), avec la sellerie de l'étape S1, d'abord derrière options ; captures comparatives et preuves ; passage par
défaut seulement si les contrôles sont conformes (S2 b, commit séparé). Base : `e7e4d3c9` (S1).

### Ce qui est fait

- **`StridesMonteOptions`** (`Public/StridesMonteOptions.h`, `Private/StridesMonteOptions.cpp`) : lecture unique de la
  ligne de commande par le cheval, la cavalière et le mode `perf`. `-StridesMonte=web | ancien` règle l'ensemble ;
  `-StridesRider=regles | ancien`, `-StridesHorseLead=web | droite`, `-StridesTack=web | aucune` règlent une partie et
  l'emportent sur l'ensemble ; sans option de sellerie, la sellerie suit l'ensemble ou la cavalière de la règle
  (comportement de S1 : `-StridesRider=regles` l'affiche) ; une valeur inconnue est ignorée et signalée au journal.
  Défaut sans option : `bWebByDefault = false` à cette étape (ancien comportement : **jeu par défaut inchangé**).
  `AStridesHorse::BeginPlay` et `AStridesRider::BeginPlay` ne lisent plus les options eux-mêmes ; le relevé `perf` note
  l'ensemble (`monte`).
- **Nouveau test `Strides.Monte.Options`** : 21 lignes de commande résolues (dont l'ensemble seul, chaque option seule,
  chaque option contre l'ensemble, les clés voisines `-StridesMonteDir=` et `-StridesMontePoses=`), valeurs inconnues
  ignorées et comptées, sous l'ensemble « web » et « ancien » ; défaut du jeu **épinglé dans le test** (changer le défaut
  exige de changer le test) ; puis, pour 9 lignes de commande, cheval et cavalière créés par `SpawnActor` dans un monde
  commencé comme le jeu : main du web et clips miroir cuits, sellerie lue, sellerie affichée prête, règle et maillage posé
  de la cavalière **exactement** comme la résolution l'annonce ; avec l'ensemble « web », en selle : maillage posé visible,
  maillage du jeu caché, règle prête sur la sellerie du cheval.
- **Mode de capture `-StridesShots=monte-s2`** (`AStridesShots::TickMonteS2`) : partie jouée (parcours de démonstration
  du Pôle, comme les modes `monte` et `miroir`) ; captures à l'arrêt, au premier galop hors saut à main droite et à main
  gauche (fondu de main achevé avec la main du web), 0,35 s après le départ d'un saut à main droite et d'un saut à main
  gauche. La main est celle du cheval avec la main du web, sinon celle que la main du web aurait au même virage
  (`strides::mirror::leadStep` sur `lastTurn`, calculée par le mode) : les deux configurations sont capturées aux mêmes
  instants du parcours. Avec la main du web, cette « ombre » est comparée à la main du cheval à chaque image.
- **Référence web à main droite** (`export-rider-rules.mjs --shots`, pose `saut-droite`) : les deux sauts d'O1 sont à main
  gauche (main initiale du web : `A.lead = 1`). Le même saut d'E3 est rejoué avec la main imposée à droite par l'entrée
  `lead` de la locomotion du web (`horse/anim.js:287`, `st.lead`, posée sur `h.anim` après la préparation) : capture
  seulement, rien n'est écrit dans O1. Relevé du web à l'image : main « R », clip `jump_canter`, miroir faux, leadBlend 1.
- **Outil `scripts/unreal/parite-avant-apres.py`** : PSNR avant → après (ffmpeg) et montages avant | après | web.

### Captures (rendu GPU réel, 844 × 390)

Partie jouée (`captures/s2/`, `monte-<arret | galop-droite | galop-gauche | saut-droite | saut-gauche>-<avant | apres>.png`,
web `monte-<arret | galop | galop-gauche | saut-droite | saut-gauche>-web.png`, poses `captures/s2/poses.json`) :
- **avant** = jeu par défaut (aucune option) ; **après** = `-StridesMonte=web` ; même compilation, même parcours.
- Instants (temps de parcours) : galop à gauche 2,83 s / 2,84 s ; départ du saut à main gauche 5,63 s / 5,63 s ; galop à
  droite 9,45 s / 9,88 s (après : attente du fondu de main, leadBlend 0,9906) ; départ du saut à main droite 17,80 s /
  17,82 s ; vitesse aux sauts 6,20 m/s. Main de l'ombre égale à la main du cheval : **1 041 images sur 1 041**.
- Avant : clips d'origine partout (galop et saut « à gauche » joués sur les clips à main droite), clip `jump_canter`
  (seuil de 7 m/s), cavalière aux clips cuits, sans sellerie. Après : `canter_M` puis `canter` (leadBlend 0,0000 puis
  0,9906), sauts `jump_canter_M` à gauche et `jump_canter` à droite, comme la vue du web ; règle active (coût relevé
  0,027 à 0,035 ms), sellerie affichée.
- Ce sont des illustrations (décor, phase, obstacle et cheval 3,7 % plus petit différents du web), pas des poses jumelles.
  Montages avant | après | web hors dépôt : `.ue-cache/travail/s2/montages/s2-*.png` et `s2-planche.png`.

Concours (`-StridesShots=cso` par famille de poses, puis `-StridesShots=cso-jeu -TouchControls`), 80 captures, relancées
avant (jeu par défaut) et après (`-StridesMonte=web`) avec la même compilation, dossiers dédiés sous `.ue-cache/travail/s2/` :
- **Tous les relevés du concours sont identiques** entre avant et après : `aide-unreal.json` (1 173 champs),
  `bilan-unreal.json` (759), `cadrage-unreal.json` (111 : cadrage, caméra, FOV), `cmd-unreal.json` (201),
  `entree-unreal.json` (557), `hud-unreal.json` (731) : 0 champ différent. `jeu-unreal.json` (partie réelle) : 4 champs
  sur 90, le chrono au moment de la capture (2,33 / 2,34 s ; 34,91 / 34,94 s) et le cran de cadence affiché (4 / 5) ;
  démonstration finie en 60,33 et 60,42 s (« 0 pt Arrivée ✓ » les deux fois ; variabilité connue de ±0,3 s d'un passage
  à l'autre, `relais-mac.md`). La monte du web ne change que l'image.
- PSNR avant → après : 22,2 à 73,1 dB (`captures/s2/cso-avant-apres.json`) ; il mesure le changement, pas la justesse. Bruit
  du rendu : la même configuration (jeu par défaut) relancée ne redonne pas les PNG versionnés à l'octet (robe-* : 28,5 à
  36,4 dB contre les versionnés).
- Montages avant | après | web (5 versionnés dans `captures/s2/cso/`, les 80 hors dépôt sous
  `.ue-cache/travail/s2/montages/cso/`) : sellerie et posture de la règle visibles sur toutes les poses où le couple est
  vu ; poses du concours inchangées par ailleurs (cheval posé à l'arrêt aux poses de chute de barre, comme avant).
- Constat : plusieurs PNG versionnés du concours sont antérieurs à C1 (cheval gris : `chute-barre-*`, `jeu-*`) ; les
  captures « avant » relancées montrent le cheval bai du jeu actuel.

### Écarts déclarés (S2 a)

1. La « main gauche » des captures avant est celle que la main du web aurait : le jeu par défaut joue les clips à main
   droite partout (c'est l'écart que S2 corrige).
2. Référence web à main droite obtenue en imposant `st.lead` (entrée de la locomotion du web, état qu'un virage à droite
   tenu donne en jeu), pas par un virage joué.
3. Le mode `monte-s2` n'a pas de test Automation (mode de capture) ; son relevé est dans le journal des captures.

### Mutations (`scripts/unreal/mutations-monte-jeu.py`, étendu ; test `Strides.Monte`, soit EnJeu et Options)

29 mutations (9 des reliquats M1, motifs du branchement mis à jour ; 20 de S2 : branchement du cheval sur l'ensemble,
résolution, défaut épinglé) ; campagne du 25/11 (1 540 s) : 24 détectées, 2 attendues (déjà déclarées aux reliquats M1),
3 **non compilées** (`if (false)` : code inaccessible traité en erreur par le module) ; réécrites sans constante
(`&& GetWorld() == nullptr`, `Unknown->Num() < 0`) et repassées seules (`--noms=`, option ajoutée) : 3 détectées. La
première (« règle jamais créée ») faisait planter `Strides.Monte.Options` (accès au maillage posé absent après l'échec
d'EnJeu) : test corrigé (garde avant l'accès), mutation repassée : détectée proprement (« option : règle créée par
BeginPlay »). Bilan : **27 détectées sur 29, 2 attendues**. Exemples : ensemble ignoré, valeurs de l'ensemble inversées, clé
sans « = » (qui prend `-StridesMonteDir=`), chaque option précise ignorée ou détachée de l'ensemble, sellerie qui ne suit plus
la cavalière ou l'ensemble, `-StridesTack=aucune` sans effet, valeur inconnue prise pour « non » ou non signalée, défaut
basculé, main du web suivant la cavalière, sellerie lue suivant la main. Sources rétablis et recompilation finale code 0 à
chaque passe.

### Portes (S2 a)

- G1 : ctest code 0 (construit sous `.ue-cache/travail/core-s2`) : cœur 300 729, `monte` 306 914, `monte-cheval` 4 488,
  `monte-cavaliere` 72 547, `perf` 20, `monte-miroir` 7 069, `monte-sellerie` 7 443 vérifications, 0 échec (cœur non
  touché).
- G2 : UBT code 0, aucun avertissement ni erreur du compilateur.
- G3 : `Automation RunTests Strides` : **40 tests, 40 en succès** (nouveau : `Strides.Monte.Options`), dont
  `Strides.Parite.RiderOnHorse` et `Strides.Parite.HorseMirror` ; 2 avec l'avertissement `idevice_id` (erreur 86, déjà
  relevé). Après la garde ajoutée au test : `Strides.Monte` (EnJeu, Options) repassé, vert.
- G4 : ci-dessus.
- G5 : `git diff --quiet HEAD -- unreal/docs/parite/cso` code 0 (jeu par défaut inchangé ; captures relancées dans des
  dossiers dédiés seulement).
- G6 : `build-parite.py` code 0, PARITE.md inchangé (inventaire mis à jour au passage par défaut, S2 b).
- G7 : `git diff --quiet HEAD -- src public tests` code 0.

Conclusion de S2 a : contrôles conformes (preuves vertes, relevés du concours identiques, captures conformes à la vue du
web) ; passage par défaut fait dans un commit séparé (S2 b).

## Étape S2 (b). Monte du web par défaut (25/11/2026)

Contrôles de S2 a conformes (commit `544e1b7b`) : la monte du web devient le comportement du jeu sans option.

### Ce qui change

- `StridesMonteOptions::bWebByDefault = true` : sans option, cavalière posée par les règles du web, main du web (départ au
  galop à main gauche comme le web, `A.lead = 1`, clips miroir, sauts en miroir, `jump_gallop` au-delà de **8 m/s** au lieu
  de 7), sellerie du web affichée. **Retour à l'ancien comportement : `-StridesMonte=ancien`** ; ou partie par partie :
  `-StridesRider=ancien`, `-StridesHorseLead=droite`, `-StridesTack=aucune`.
- Tests : `Strides.Monte.Options` épingle le nouveau défaut ; `Strides.Monte.EnJeu` vérifie l'ancien comportement par
  `-StridesMonte=ancien` ; les messages « jeu par défaut » des tests dont le monde n'est pas commencé (BeginPlay non
  distribué : `HorseSeat`, `HorseMirror`, `RiderRules`, `HorseTackMesh`) disent maintenant ce qu'ils vérifient (« sans
  BeginPlay »), sans changer les vérifications.
- `perf-summary.py` : les configurations de l'étape 7 et de S1 sont nommées explicitement (`-StridesMonte=ancien`, avec
  ou sans `-StridesRider=regles`) pour garder leur sens.
- `monte-base.py --maj-g5=<motif>` : nouvelle base G5 (montages refaits, ancienne empreinte et motif gardés dans `base.json`).

### Preuves du concours refaites

Captures Unreal du CSO régénérées **sans option** (rendu GPU réel, `-StridesShots=cso` par famille de poses puis
`-StridesShots=cso-jeu -TouchControls`, dossier dédié `.ue-cache/travail/s2/cso-defaut-web/`, copiées ensuite dans
`unreal/docs/parite/cso/`) : 75 `<pose>-unreal.png`, 5 `jeu-*.png`, 7 relevés JSON ; 71 montages refaits par
`parite-montage.py` ; captures web, `-oracle.png` et `t4-hud-debogage-galop-unreal.png` (antérieure à T7, sans moyen de
la refaire à l'identique) inchangées.
- Le défaut redonne l'ensemble « web » de S2 a : les 6 relevés `aide`, `bilan`, `cadrage`, `cmd`, `entree`, `hud` sont
  **identiques champ pour champ** à ceux de `-StridesMonte=web` et à ceux de l'ancien comportement ; `jeu-unreal.json` :
  seul le chrono au moment des captures 3 et 4 varie ; démonstration finie en 60,48 s « 0 pt Arrivée ✓ ».
- `-StridesShots=monte-s2` sans option (`.ue-cache/travail/s2/ms2-defaut/`) : configuration « web », mêmes clips
  (`canter_M`, `jump_canter_M` à gauche, `jump_canter` à droite), mêmes instants à 0,02 s près, main de l'ombre égale à
  celle du cheval sur 1 061 images sur 1 061.
- **G5** : nouvelles empreintes dans `unreal/docs/parite/monte/base.json` (`portes.G5`, 238 PNG, empreinte globale
  `d51c51b9…` ; 195 PNG différents de l'ancienne base, qui datait de l'étape 1 et ne comptait que 150 PNG).

### Écarts des captures du concours, un par un, justifiés par le web

1. **Posture de la cavalière** : celle des règles du web v3 (pied dans l'étrier, jambe le long du flanc, mains au-dessus
   de l'encolure, accompagnement du saut), prouvée au niveau A (0,0001 cm d'O2) ; elle remplace les clips cuits. Visible
   sur toutes les poses où le couple est vu. Écart restant au web : cheval Unreal 3,7 % plus petit et sans inclinaison en
   virage (niveau B, S3 et S4).
2. **Sellerie** : selle, tapis, liseré, sangle, filet, mors, guêtres, étriers, étrivières et rênes du web (S1), désormais
   sur toutes les captures où le cheval est vu, comme dans le web.
3. **Main de départ** : le web part au galop à main gauche (`horse/anim.js` : `lead: 1` à la création) ; le cheval Unreal
   aussi désormais (clips miroir, `bakeMirror` du web). Les poses du concours posent un cheval à l'arrêt (chute de barre,
   robe, aides) : la main ne s'y voit pas ; elle se voit dans la partie réelle (`jeu-*`) et dans `monte-s2`.
4. **Seuil du grand saut** : 8 m/s comme la vue du web (`pjl/view.js:229-233`, `s.speed > 8`) au lieu de 7 m/s ; aucune des
   captures du concours ne saute entre 7 et 8 m/s (démonstration à 6,20 m/s aux sauts), donc aucun PNG n'en change.
5. **Sauts en miroir** : saut à main gauche sur `jump_canter_M` (vue du web : `jumpMirror = s.lead === 'L'`).
6. **Bruit de rendu** : une même configuration relancée ne redonne pas les PNG à l'octet (S2 a) ; les nouveaux PNG sont
   ceux d'un seul passage.
7. Les anciens PNG `chute-barre-*` et `jeu-*` montraient encore le cheval gris d'avant C1 : remplacés par le cheval bai.

### Portes (S2 b)

- G1 : ctest code 0 (cœur non touché) : cœur 300 729, `monte` 306 914, `monte-cheval` 4 488, `monte-cavaliere` 72 547,
  `perf` 20, `monte-miroir` 7 069, `monte-sellerie` 7 443 vérifications, 0 échec.
- G2 : UBT code 0, aucun avertissement ni erreur.
- G3 : `Automation RunTests Strides` avec le nouveau défaut : **40 tests, 40 en succès** (2 avec l'avertissement
  `idevice_id`), dont `Strides.Parite.RiderOnHorse`, `Strides.Parite.HorseMirror`, `Strides.Monte.Options`.
- G4 : `mutations-monte-jeu.py` repassé avec le nouveau défaut (mutation du défaut inversée : vrai → faux) : 29 mutations,
  **27 détectées, 2 attendues** (celles des reliquats M1), code 0, 2 350 s ; sources rétablis, recompilation finale code 0.
- G5 : captures du CSO refaites volontairement, nouvelles empreintes (ci-dessus).
- G6 : `build-parite.py` code 0, inventaire à jour (lignes `cavaliere.*`, `cheval.main-galop`, `cheval.saut-animation`,
  `cheval.assise-cavalier`, `cheval.etriers`, `cheval.lanieres`, `cheval.sellerie`, `cheval.renes`).
- G7 : `git diff --quiet HEAD -- src public tests` code 0.

Non vérifié : le jeu empaqueté pour iOS avec le nouveau défaut (clips miroir cuits au chargement depuis des clips cuisinés,
données de la règle sous `Content/Data`, coût sur appareil) : aucun paquet construit (interdit dans cette phase), à
confirmer. Coût mesuré sur Mac seulement (règle +0,03 à +0,05 ms, sellerie +0,09 ms par image).

Reste à faire (S2) : rien pour S2 ; S3 (cheval +3,7 % derrière une option), S4, S5.

## Étape S3 (a). Cheval à la taille du web, derrière une option (25/11/2026)

Décision de Julien du 24/11/2026 (`decisions.md`, choix C de `decision-voie-a.md`) : agrandir le cheval à la taille du web
derrière une option, mesurer l'effet sur la cavalière, les sauts, la caméra et le concours, et ne le rendre définitif
qu'après captures et reprise des preuves concernées. Base : `cc20c6a6` (S2 b).

### Mesure de l'écart et cause (`Strides.Parite.HorseScale`, nouveau test, dans le moteur sans rendu)

Ce que fait le web (`src/entities/pjl/asset.js:94-154`) : sol = articulations des sabots (`fingers_02_l/r`, `toes_02_l/r`) les
plus basses sur 17 images du galop à 24 images/s ; échelle = (1,68 − 0,2) / hauteur de `spine_04` à l'idle 0,5 s, racines
du web à la pose de référence. Valeur exportée par `export-horse-tack.mjs` : `inner.scale` = 0,0103882601 m par unité de la
scène du GLB (`Content/Data/pjl_horse_tack.json`).

| Cause possible | Mesure | Verdict |
|---|---|---|
| Import (maillage, squelette) | conversion GLB → maillage déduite des 419 articulations : similitude de facteur 99,999998, résidu 0,00097 unité du maillage | pas en cause |
| Clips importés | calibrage du web refait sur les clips Unreal : garrot à 142,4686 unités du GLB au-dessus des sabots, échelle 0,0103882573 contre 0,0103882601 (écart relatif −2,6e-7) | pas en cause |
| Échelle de l'acteur | constante 0,01 du constructeur d'`AStridesHorse` (« ~1,5 m au bassin », posée à la main au 18/11) | **cause** : rapport 0,962625, cheval 3,74 % plus petit ; ×1,038826 (+3,88 %) pour la taille du web |

Cheval du jeu évalué par son maillage (racines du jeu), aux deux échelles :

| Grandeur | Jeu (0,01) | Taille du web | Écart |
|---|---|---|---|
| garrot (`spine_04`) au-dessus des articulations des sabots | 142,47 cm | **148,00 cm** (web : 1,48 m) | +5,53 cm |
| `spine_04` au-dessus du sol (idle 0,5 s) | 151,69 cm | 157,58 cm | +5,89 cm |
| `saddle` au-dessus du sol | 172,62 cm | 179,32 cm | +6,70 cm |
| `pelvis` au-dessus du sol | 160,90 cm | 167,15 cm | +6,25 cm |
| longueur tête – queue (`head`, `tail_01`, à plat) | 194,13 cm | 201,67 cm | +7,54 cm |
| écartement des épaules (`upperarm`) | 32,37 cm | 33,63 cm | +1,26 cm |

Chaque grandeur est multipliée par 1,038826 (vérifié à 1e-6). Reste au web, non repris (déclaré) : lacet du modèle de
−0,69° et calage du sol sur la sole des sabots (+0,80 cm) ; d'où `spine_04` à 157,58 cm contre 158,38 cm « posé comme le
web » (étape 5).

### Ce qui est fait

- **Option `-StridesHorseScale=web | jeu`** (`StridesMonteOptions::ResolveWebHorseScale`, `WebHorseScaleFromCommandLine`) :
  décision séparée de l'ensemble de la monte ; sans elle, « jeu » avec `-StridesMonte=ancien`, sinon
  `bWebHorseScaleByDefault` (**faux à cette étape : jeu par défaut inchangé**) ; valeur inconnue ignorée et signalée.
- **`AStridesHorse::EnableWebScale(bool)`** : échelle du maillage du corps = `inner.scale` lue dans `pjl_horse_tack.json`
  (jamais recopiée), ou `GameMeshScale` (0,01) ; yeux, crins et sellerie skinnée suivent ; appelée par `BeginPlay` avant la
  sellerie. Rien d'autre ne change : simulation, caméra de concours, obstacles et chronomètre ne lisent pas le maillage
  (vérifié par lecture : `CameraHorse()` lit la simulation ; `UStridesHorseTack::GameMeshToHolder` lit l'échelle à chaque
  image ; étriers dans le monde, en mètres du web).
- `Strides.Monte.Options` : 12 lignes de commande de la taille résolues (défaut épinglé, ensemble, inconnues, clés
  voisines), l'ensemble de la monte inchangé par l'option, et 3 lignes de plus créées par `BeginPlay` (échelle du maillage
  exacte). `Strides.Parite.RiderOnHorse` applique l'option si elle est sur la ligne de commande (monde non commencé) et
  note l'échelle dans son export (`meshScale`).
- Mode `-StridesShots=monte-s2` : relève la taille et, par saut, le regard sur le maillage affiché (marge sabot − dessus de
  barre quand un os de sabot passe au-dessus d'une barre, sabot le plus bas, garrot) ; `-StridesMonteS2Parcours` mesure tout
  le parcours de démonstration.

### Effet sur la cavalière : niveau B (`Strides.Parite.RiderOnHorse`, `rider-rules-niveau-b.mjs`)

Même compilation, sans option puis avec `-StridesHorseScale=web` (exports sous `.ue-cache/travail/s3/nb-*`) :
- **61 → 58 critères non tenus sur 233** (contre O1) ; contre O2 : 24 → 20 écarts non tenus. Devenus tenus : M6 portée de
  la jambe (E2g droite), M9 poignet au-dessus de l'encolure (E2d gauche, E3b gauche et droite) ; devenu non tenu : M6 E3b
  gauche (0,9460 → 0,9556 pour un seuil de 0,955 : la jambe se tend sur un cheval plus large).
- Sellerie affichée contre O1 (bornes min et max, moyenne sur les 6 scénarios) : rênes gauche 4,34 → 2,66 cm, droite
  5,02 → 2,42 cm (au plus 10,8 → 6,5 cm) ; à l'arrêt (E1), rênes 96,9 – 99,2 cm → 102,5 – 104,6 cm pour 102,7 – 104,6 cm au
  web. Étrier sous le pied (M4) inchangé (≤ 0,50 cm d'O1) ; étrivières 2,3 – 2,9 cm → 2,2 – 2,7 cm.
- Écarts restants : inclinaison en virage, corps et horloge du saut (S4), clips à 30 images/s (S5).

### Effet sur les sauts, la caméra et le concours

Partie jouée, parcours de démonstration entier (`-StridesShots=monte-s2 -StridesMonteS2Parcours`, rendu GPU réel,
844 × 390) : **mêmes 10 sauts** aux mêmes instants (départs à 0,1 – 0,2 s près, variabilité connue d'un passage à l'autre),
même main, même clip, vitesse 6,22 / 6,20 m/s ; « 0 pt Arrivée ✓ » en 60,33 s puis 60,51 s. La trajectoire, la hauteur
franchie et le contact des barres sont ceux de la simulation (`StridesCore`, `JumpModel`), qui ne lit pas le maillage : ils
ne changent pas. Regard sur le maillage affiché (avant / après, cm) :

| Saut | Obstacle | Barre | Marge sabot − barre | Sabot le plus bas, au plus haut | Garrot, au plus haut |
|---|---|---|---|---|---|
| 1 | 1 (v) | 1,05 | −23,6 / −20,4 | 128,4 / 128,6 | 289,8 / 296,6 |
| 2 | 2 (o) | 1,05 | +36,6 / +36,6 | 155,3 / 156,5 | 306,3 / 312,9 |
| 3 | 3 (v) | 1,10 | −1,3 / +4,7 | 139,3 / 140,8 | 294,4 / 301,1 |
| 4 | 4A (v) | 1,05 | −1,2 / +2,9 | 134,5 / 135,9 | 289,5 / 296,2 |
| 5 | 4B (o) | 1,05 | +34,2 / +37,5 | 152,2 / 153,4 | 306,5 / 313,1 |
| 6 | 5 (w) | 1,10 | −2,5 / +3,0 | 139,5 / 141,1 | 294,5 / 301,2 |
| 7 | 6A (v) | 1,10 | −21,9 / −18,7 | 131,6 / 132,4 | 294,8 / 301,6 |
| 8 | 6B (o) | 1,05 | +22,1 / +20,8 | 144,3 / 144,7 | 306,8 / 313,5 |
| 9 | 7 (v) | 1,10 | −26,3 / −22,2 | 131,6 / 132,1 | 294,8 / 301,6 |
| 10 | 8 (o) | 1,10 | +21,8 / +20,6 | 144,2 / 144,8 | 306,9 / 313,5 |

Marge : os de sabot (articulation, quelques cm au-dessus de la sole) à moins de 15 cm du plan d'une barre, dans la
largeur de l'obstacle. Constat, **défaut existant avant S3** : sur 4 verticaux sur 7, un postérieur passe visuellement
sous le dessus de la barre (−19 à −26 cm) alors que la simulation franchit sans faute, et le garrot monte à 2,9 – 3,1 m. Le
corps du cheval au saut et l'horloge du saut du web ne sont pas portés (S4) ; les valeurs du web pour ce regard ne sont pas
mesurées (à confirmer en S4). L'agrandissement ne crée aucun contact : il relève les marges de 4,1 à 6,0 cm sur 3 obstacles
(3, 4A, 5 : de −1,2 à −2,5 cm à +2,9 à +4,7 cm), de 3,2 à 4,1 cm sur 4 autres, ne change pas l'oxer 2 et les baisse de 1,2
et 1,3 cm sur les oxers 6B et 8 (toujours plus de 20 cm au-dessus).

Concours (`-StridesShots=cso` par famille de poses, puis `-StridesShots=cso-jeu -TouchControls`, 80 captures, avant = jeu par
défaut, après = `-StridesHorseScale=web`, même compilation, `.ue-cache/travail/s3/cso-*`) :
- Relevés **identiques champ pour champ** : `aide` (1 173 champs), `bilan` (759), `cadrage` (111 : cadrage, caméra, FOV),
  `cmd` (201), `entree` (557), `hud` (731) ; `jeu-unreal.json` : 2 champs sur 90, le chrono au moment de la capture 4
  (34,96 / 35,01 s), variabilité d'un passage à l'autre (le relancé « avant » diffère du versionné de 4 champs) ;
  démonstration finie en 60,45 et 60,52 s, « 0 pt Arrivée ✓ ».
- PSNR avant → après : 24,4 à 72,0 dB (`captures/s3/cso-avant-apres.json`) ; il mesure le changement, pas la justesse :
  le cheval est plus grand sur toutes les poses où il est vu, l'interface ne bouge pas (≥ 69 dB sur `entree`, `cmd`,
  `bilan`).
- Caméra : la caméra de concours suit la simulation (`CameraHorse()`), son relevé est identique ; le cheval, plus grand,
  occupe plus de l'image, comme dans le web.

### Captures (rendu GPU réel, 844 × 390, `captures/s3/`)

- Partie jouée : `monte-<arret | galop-droite | galop-gauche | saut-droite | saut-gauche>-<avant | apres>.png` ; web :
  `captures/s2/monte-*-web.png`.
- Poses jumelles du niveau B (même image d'O1, même caméra du web dans le repère du cheval) :
  `monte-b-<arret | galop | galop-gauche | saut-sommet>-<avant | apres>.png` ; web : `captures/niveau-b/monte-*-web.png`.
  PSNR avant → après 20,9 à 22,5 dB, contre 27,1 à 29,2 dB pour le bruit de rendu (« avant » relancé contre le versionné).
- Concours : 4 montages avant | après | web dans `captures/s3/cso/` ; les 80 hors dépôt (`.ue-cache/travail/s3/montages/cso/`).
- Montages avant | après | web hors dépôt : `.ue-cache/travail/s3/montages/s3-*.png`.

### Incident

Une capture « avant » (`-StridesPose=aide-`) est restée bloquée 12 min au démarrage, l'éditeur attendant le serveur Zen
local (`FZenServiceInstance::AutoLaunch`, serveur lancé mais jamais vu prêt) ; processus arrêté (`kill -9`, le mien), la
famille relancée seule ensuite (code 0). Aucun autre effet.

### Mutations (`scripts/unreal/mutations-monte-jeu.py --noms=S3`, campagne du 25/11, 1 043 s)

14 mutations de la taille (résolution de l'option, branchement de `BeginPlay`, `EnableWebScale`, `WebMeshScale`), jouées
contre `Strides.Monte` (EnJeu, Options) et `Strides.Parite.HorseScale` : **13 détectées, 1 attendue** (« `-StridesMonte=ancien`
sans effet sur la taille » : équivalente tant que la taille du web n'est pas le défaut ; sa jumelle « `-StridesMonte=ancien`
donne la taille du web » est détectée). Exemples : défaut basculé, `web` ignorée, `jeu` prise pour `web`, clé sans « = »,
taille jamais ou toujours appliquée par `BeginPlay`, échelle approchée ×1,0001 (détectée par le rapport 1,038930 au lieu de
1,038826), échelle lue dans `inner.groundY`, retour à 0,01 impossible. Le motif de la mutation S2 « valeur inconnue non
signalée » est précisé (il apparaissait deux fois). Sources rétablis, recompilation finale code 0.

### Portes (S3 a)

- G1 : ctest code 0 (`.ue-cache/travail/core-s3`, cœur non touché) : cœur 300 729, `monte` 306 914, `monte-cheval` 4 488,
  `monte-cavaliere` 72 547, `perf` 20, `monte-miroir` 7 069, `monte-sellerie` 7 443 vérifications, 0 échec.
- G2 : UBT code 0, aucun avertissement ni erreur du compilateur.
- G3 : `Automation RunTests Strides` sans option : **41 tests, 41 en succès** (nouveau : `Strides.Parite.HorseScale` ;
  3 avec l'avertissement `idevice_id`). Avec `-StridesHorseScale=web` : 40 en succès, `Strides.Monte.Options` en échec par
  sa garde (« ligne de commande du test sans -StridesHorseScale= », attendu : le test épingle le défaut).
- G4 : ci-dessus.
- G5 : `git diff --quiet HEAD -- unreal/docs/parite/cso` code 0 (jeu par défaut inchangé).
- G6 : `build-parite.py` code 0 ; lignes `cheval.pjl-modele` (taille mesurée, option, preuve) et `cheval.assise-cavalier`.
- G7 : `git diff --quiet HEAD -- src public tests` code 0.

Conclusion de S3 a : contrôles conformes. La valeur vient du web (`asset.js`, exportée et recalculée sur les clips
Unreal) ; aucune preuve du concours ne change hors image ; le niveau B s'améliore. Passage par défaut dans un commit séparé
(S3 b), avec les captures du CSO refaites.
