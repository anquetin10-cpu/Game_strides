# Validation Mac — 20 novembre 2026 (tranche a, T12 : sons de l'épreuve et recette complète)

Branche `claude/unreal-port`, base `0fdf2f4b` (fin de T11). Mac mini, Xcode 26.6, Unreal Engine 5.8.4, Chrome 158
(Playwright, aucun téléchargement). Jeu web (`src/`, `public/`, `tests/`) en lecture seule : `git diff 0fdf2f4b HEAD --stat
-- src public tests` vide. Niveaux séparés : code écrit, compilé, testé, lu en jeu, paquet iOS, appareil réel.

## Prouvé

| Quoi | Preuve | Résultat |
|---|---|---|
| Cœur hors moteur | `ctest --test-dir build/core` | 300 639 vérifications, 0 échec |
| Journal des sons = canal « audio » du web | `testCsoSounds` (`unreal/core/tests/test_core.cpp`) | 94/94 exécutions de `cso_runs/`, 52 446 images, 1 367 appels (nom, arguments, fichier appelant, ordre) ; précisé à l'hygiène finale du 21/11 : produits par les rejeux du cœur dans les 34 exécutions complètes ; dans les 60 légères, sons du cheval tirés des événements `horse:*` de l'oracle et click recomposé par une règle écrite dans le test (pas par `DoAction`) ; exclus déclarés : breath (1 224), obstacles des exécutions légères (82), déroulé des exécutions posées en cours (36) |
| Sons rendus par le web, importés à l'identique | `export-cso-sounds.mjs` → `import-cso-sounds.py` → `Strides.Cso.AudioAssets` | 19 USoundWave sous `/Game/Audio/Cso` (18 sons des 14 fonctions de `cso-spec.md` §12 et click, plus la boucle du public) : PCM importé = SHA-1 du rendu, 48 kHz, mono, compression PCM |
| Bus du public (0,6 × 0,08 dans les 90 m) | `testCsoCrowd`, `Strides.Cso.Audio` | gain rendu par le web (7 séquences, 3 380 relevés) rejoué à 4,47e-5 ; niveau relevé dans le jeu web à 88 / 89,5 / 90,5 / 92 / 40 / 200 m ; en jeu : 0,6 à 50 m, 0 à 120 m, 0,6 en épreuve à 300 m, gain établi 0,048 |
| Sources des sons câblées dans le jeu | `Strides.Cso.Audio` | lancement au poteau (notify puis click), entrée (applause 0,5 / 2,2), cloche, départ (tone 1568), appel (snort puis hoof « sand » 1,4, adjacents dans le journal : le numéro d'image n'est pas comparé), réception (landing 1), obstacle franchi (tone 990), refus (neigh, fault, crowdOoh ; partie sautée sans erreur si l'obstacle 2 manque), descente (click) et élimination (bell 2) |
| Mutations | `mutations-cso-audio.py` | 27 mutations, 22 détectées, 5 déclarées (code 0) |
| Tests moteur | `Automation RunTests Strides` (-nullrhi) | 30/30 Result={Success} |
| Démonstration F8 | `-StridesShots -StridesShotsDir=<scratchpad>` (rendu Metal) | 26 captures hors dépôt, « 60,28 / 64 s 0 pt Arrivée ✓ » ; `Saved/Screenshots/Strides` et `MacEditor` identiques avant et après (`shasum`) |
| Pixel Streaming absent d'iOS | `check-pixel-streaming-ios.py --binary=…IOS-Shipping` | `.uproject` : PixelStreaming2 limité à `Mac` ; UBT `-Mode=JsonExport` : IOS 429 modules, aucun PixelStreaming ; Mac 486 modules dont 7 PixelStreaming2 ; binaire IOS Shipping lié (arm64, 235 Mo) : 0 occurrence de « pixelstreaming » |
| Cible iOS compilée | `Build.sh StridesGrandTour IOS Shipping` | 36 unités compilées et liées ; échec à la finalisation de l'app : « Signing for "StridesGrandTour" requires a development team » (blocage de signature connu). Correction faite pour y arriver : exceptions permises dans le module de jeu (`MiniJson.h`, inclus depuis T9 par 6 tests et `StridesShots.cpp`, empêchait la compilation IOS Shipping) |

## Recette complète (`cso-spec.md` §13, 13 étapes)

Montages côte à côte (web à gauche, Unreal à droite) dans `unreal/docs/parite/cso/`. Les captures Unreal des 70 poses
existantes ont été refaites avec le build de T12 dans un dossier dédié et comparées aux captures versionnées (PSNR par
`ffmpeg`) : 66 à plus de 37 dB (écart moyen ≤ 0,69 / 255 : bruit de rendu) ; `entree-1-*` et `entree-2-*` différaient
quand toutes les poses tournent dans une même session (carte non ouverte : outil sensible à l'ordre des poses), et sont
identiques (62 à 71 dB) quand on les rejoue par famille, comme le prévoit `unreal/docs/parite/README.md`. Aucun montage
n'est donc périmé par T12 ; les écarts déjà déclarés par les tranches restent (inventaire).

| Étape | Montages | État |
|---|---|---|
| 1 Entrée : présentation, plan, annonce « N° », cloche | `entree-1-presentation`, `entree-2-plan`, `entree-3-annonce`, `entree-4-cloche` (844 × 390 et 667 × 308), `hud-cloche`, `hud-depart` | fait (écarts T10 déclarés : PNG de la recette sans « CLOCHE », fond flouté, police) |
| 2 Piste, tracé, lignes | `carriere-aerienne`, `ligne-depart`, `ligne-arrivee`, `poteau-chrono` | fait (T5 ; couleur du mur déclarée) |
| 3 Conduite, cadence | `hud-cadence` (crans), `cmd-joystick` | partiel : `touch-abord`, `touch-double`, `touch-arrivee` (vrai tactile du web) sans jumeau Unreal |
| 4 Aide à l'appel | `aide-4-trop-loin`, `aide-5-bonne-zone`, `aide-trop-pres`, `aide-bouton`, `aide-off`, `aide-sans-trace`, `aide-trace`, `aide-saute`, `aide-trop-tot`, `aide-ambre` | fait (T9) ; `aide-ambre` ne montre pas la bande (masquée par le couple) : preuve par le canal « ai » ; état du HUD de `aide-4` et `aide-5` : modèle ajusté (CAPTURE_MS = 250 ms) |
| 5 Saut | `cadrage-440` (cheval en l'air, τ ≈ 0,23), `hud-appel` (« Appel parfait »), `aide-saute` | partiel : τ = 0,5 et 0,75 non capturés ; `6-saut.png` de la recette sans jumeau ; animation du cheval non identique |
| 6 Barre au sol | `chute-barre-0_1s`, `-0_3s`, `-0_6s`, `-1_5s` | fait (T5) ; `7-barre-au-sol.png` de la recette sans jumeau |
| 7 Refus | `hud-refus` (nouveau, T12 : toast « Refus au 4B · +4 », consigne du double, tableau « 4 pts ») | partiel : cabré du cheval non capturé (scène de `cadrage-040`) |
| 8 Chrono, élimination | `hud-elimine`, `hud-depassement` (tableau en ambre) | fait |
| 9 HUD | `hud-*` (9 états × 2 viewports), `cmd-*` | fait |
| 10 Caméra | `cadrage-040` … `cadrage-440` (6 instants) | fait (T6) |
| 11 Arrivée, bilan | `bilan-1-sans-faute` (« SANS FAUTE ! »), `bilan-2-carte`, `bilan-3-trois-barres`, `bilan-4-trois-barres-bas`, `bilan-touch` | fait ; `bilan-touch` partiel (partie au doigt, chrono différent ; réassemblé le 21/11 sur la capture `bilan-2` refaite) ; `bilan-3` et `bilan-4` : HUD derrière la carte différent du web (temporisations figées par la page `?classic`), défilement posé par programme |
| Concours complet | aucun | absent : `tests/e2e/contest-full.mjs` dépend d'un état privé et les entrées de concours ne sont pas portées (hors plan) |
| 12 Sons | journal, pas d'image : `testCsoSounds`, `Strides.Cso.AudioAssets`, `Strides.Cso.Audio` | fait par journal ; écoute non faite |

## Partiel ou déclaré

- Compresseur du bus maître non porté : la chaîne du web change le RMS d'un son seul de −8,7 à +3,5 dB (mesure `gameChain`
  de `Content/Data/cso_sounds.json`) ; dans le jeu web, il dépend aussi du mélange.
- Une seule réalisation du hasard par son (graine fixe) au lieu d'un tirage par appel ; WAV en 16 bits.
- Gain du public : la formule exacte de la spécification ; Chrome cale juste sous la cible (0,0479553 au lieu de 0,048).
- Sol du sabot à l'appel passé « sand » par le jeu (carrière) ; ordre des sons d'une même image entre barres, glissade et
  écouteurs d'obstacle choisi fixe (aucune image de l'oracle ne les mêle).
- Click d'une réplique du dialogue de l'entraîneur câblé, non exercé par un test.
- Un nouvel export des styles du HUD par Chrome 158 écrit `alignItems: "flow-start"` au lieu de `"flex-start"` (changement
  de sérialisation du navigateur, pas du jeu web) : fichier `hud_cso_style.json` non réécrit.

## Absent

- Souffle au galop et pas des sabots (foulées de l'animation du cheval, non portées), vent, mer, moteur, musique, pluie,
  oiseaux, commerces ; réglage « Son » de la carte Pause.
- Concours complet ; entraînement au paddock (`cso_warmup`) : bouton « S'entraîner » non simulé.

## Non vérifié

- **Écoute** : aucun son entendu ni enregistré ; la sortie audio du Mac mini est le téléviseur HDMI « Beyond TV »
  (CoreAudio, 48 kHz ; Unreal journalise « Error querying Sample Rate » au démarrage).
- **Paquet iOS complet : non fait (disque)** : 12,8 Go libres avant la compilation IOS, 12,0 Go après ; c'est
  l'estimation du paquet (cuisson, mise en scène et archive : environ 3 Go d'après les sorties du 18/11), soit environ
  9 Go restants après, qui le place sous le seuil de 12 Go exigé après (précisé le 21/11).
- **Appareil réel (iPhone, iPad)** : aucun appareil détecté, signature bloquée (équipe de développement Apple absente).
- Rendu mobile (ES3.1 / Metal mobile) non comparé.

## Commandes

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; UE="/Users/Shared/Epic Games/UE_5.8"
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-sounds.mjs
"$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \
  -script="$PWD/scripts/unreal/import-cso-sounds.py" -unattended -nosplash -nullrhi
cmake -S unreal/core -B build/core && cmake --build build/core && ctest --test-dir build/core --output-on-failure
python3 scripts/unreal/mutations-cso-audio.py
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides; Quit" -unattended -nullrhi -nosplash -log -stdout > .tmp/automation.log
"$UE/Engine/Build/BatchFiles/Mac/Build.sh" StridesGrandTour IOS Shipping -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -WaitMutex
python3 scripts/unreal/check-pixel-streaming-ios.py --binary=unreal/StridesGrandTour/Binaries/IOS/StridesGrandTour-IOS-Shipping
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-hud-style.mjs --shots --no-oracle --specs=hud-refus
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -game -windowed -ResX=844 -ResY=390 -nosplash -StridesShots=cso -StridesPose=hud-refus -StridesShotsDir=<dossier dédié>
python3 scripts/unreal/parite-montage.py unreal/docs/parite/cso hud-refus
```
