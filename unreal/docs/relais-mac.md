# Relais local (Mac) — ouvrir, compiler, jouer, construire pour iPhone/iPad

État vérifié sur le Mac de développement le 17 novembre 2026, revérifié le 18 novembre 2026 : module compilé avec
UE 5.8.4 (recompilation complète des modules du projet, 0 erreur, 0 avertissement), cœur en **C++20**, 6 tests
Automation `Strides` réussis. **Mis à jour le 20 novembre 2026** (tranche a, parcours CSO du Pôle, après T8 et le
contrôle des remarques) : compilation incrémentale `StridesGrandTourEditor Mac Development` réussie, `ctest` 200 115
vérifications, 0 échec, **23 tests** Automation `Strides` en `Result={Success}`. Inventaire de parité avec le jeu web :
[`PARITE.md`](PARITE.md) ; plan et écarts de la tranche a : [`parite/cso-ecarts.md`](parite/cso-ecarts.md).

| Étape | État |
|---|---|
| Code C++ du cœur (règles) écrit | fait ; 3 705 lignes dans StridesCore (20/11/2026, `wc -l`) |
| Cœur compilé et testé hors moteur (clang, C++20) | **fait** : 200 115 vérifications, 0 échec (20/11/2026) ; oracles exportés du jeu web |
| Code du module Unreal écrit (acteurs, sous-systèmes, commandes, HUD, tests d'automatisation) | fait |
| Module Unreal compilé (UnrealBuildTool) | **fait** avec UE 5.8.4 (incrémental le 20/11/2026) |
| Tests Automation `Strides` (éditeur, `-nullrhi`) | **fait** : 23/23 `Result={Success}` le 20/11/2026 |
| Projet ouvert dans l'éditeur, scène lancée | **fait** |
| Boucle jouée et parcours complet jugé | **démonstration automatique seulement** (F8 / `-StridesShots`, 20/11/2026 : « 60,32 / 64 s 0 pt Arrivée ✓ ») ; aucune partie jouée à la main comparée au web |
| Archive iOS arm64 complète | **faite sans signature** le 18/11/2026 ; **pas refaite** depuis la tranche a (paquet iOS hors périmètre) |
| Package iOS signé pour TestFlight | bloqué par l'accord Apple Developer et l'absence de certificat/profil de distribution |
| Installé et testé sur iPhone / iPad réel | **non vérifié** (toucher réel, facteur de pixels, zones sûres, budget de triangles non mesurés) |

## Parité de la tranche a (parcours CSO du Pôle), au 20/11/2026

Source de vérité : l'inventaire (`parite/inventaire/*.json`, rendu en [`PARITE.md`](PARITE.md)) ; 78 lignes marquées
tranche a : **27 identique_prouve**, **29 partiel**, **22 absent**. Sous-tranches livrées : T1 à T8 (banc, cheval,
obstacles, déroulé et textes, géométrie des obstacles, caméra, HUD d'épreuve, commandes). Restent T9 à T12.

- **Prouvé** (oracle exporté du jeu web, comparé par un test qui passe, ou montage côte à côte dans `parite/cso/`) :
  tracé et hauteurs, plan de saut et qualité de l'appel, conduite de concours et cadence, visée et déclenchement du
  saut, réception et refus du cheval, jugement des barres au passage, décision et pénalité de refus, ordre des fautes,
  temps accordé, pénalités de temps et temps limite, déroulé de l'épreuve (cloche, départ, départ lancé, arrivée,
  élimination à la descente, textes en français et en anglais), règle de la caméra de concours (dont champ vertical
  58°), géométrie des chandeliers et des barres.
- **Partiel** : habillage des obstacles (forme et position prouvées, couleur du mur différente : beige saumon au lieu
  de rouge brique), rendu du HUD (police du moteur au lieu de Geist, animations non comparées image par image ; sa
  logique et celle de la file de toasts sont rejouées sans écart, seuil de 420 px et pas du décompte des crans non
  départagés), joystick (logique identique, rendu approché, pas de fondu de 0,2 s), contacts des membres (non portés :
  pose animée requise ; effet porté sans oracle), chute des barres (remise en piste sans oracle, branches non
  départagées déclarées), refus unique (recomptage après détour non exercé), effleurement (son absent), affichage de
  l'élimination, entrée en piste (carte de présentation non portée), record personnel, caméra dès l'entrée en piste
  (pas d'orbite manuelle à rendre) et contre le décor (sonde du moteur, pas les colliders du web), taille rendue du
  couple cheval-cavalier.
- **Absent** : carte de présentation et plan, bilan et classement simulé, aides à l'appel (bouton SAUT coloré, zone et
  tracé au sol : T9), poteau interactif (T10), carte de bilan et bouton Recommencer (T11 ; le choix Recommencer est
  écrit dans `CsoRun`, aucun bouton ne l'appelle), sons (T12), collisions des ailes, contacts réels des membres,
  défis.
- **Non vérifié** : tout ce qui demande un appareil iOS (toucher réel, facteur de pixels, performances) ; un vrai
  clavier AZERTY.

## 1. Prérequis (Mac)
- **Unreal Engine 5.8.4**, installé avec le composant officiel **iOS**.
- **Xcode 26.6** et SDK iOS 26.5, en forçant `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- Compte Apple Developer pour signer sur appareil (gratuit pour un appareil personnel, payant pour TestFlight/App Store :
  **ne pas engager sans mandat**).
- Node 20+ (outils d'export), Python avec `bpy` facultatif (reconstruction des humains).

## 2. Données (déjà dans le dépôt, à régénérer si le jeu web change)
```
npm ci
npx vite-node scripts/unreal/export-data.mjs        # Content/Data/*.json + oracles
cmake -S unreal/core -B build/core && cmake --build build/core && ctest --test-dir build/core --output-on-failure
```

## 3. Compiler et ouvrir
```
UE=/Users/Shared/Epic\ Games/UE_5.8
"$UE/Engine/Build/BatchFiles/Mac/GenerateProjectFiles.sh" -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -game
"$UE/Engine/Build/BatchFiles/Mac/Build.sh" StridesGrandTourEditor Mac Development -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject"
open unreal/StridesGrandTour/StridesGrandTour.uproject
```
La compilation Mac et iOS est vérifiée. Toute régression doit être corrigée et consignée avant archivage.

## 4. Tests dans le moteur
```
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides; Quit" -unattended -nullrhi -log
```
Attendu (20/11/2026) : 23 tests en `Result={Success}` (`Strides.Core.*`, `Strides.Units`, `Strides.World.*`,
`Strides.Shots.OutputDir`, `Strides.Parite.*`, `Strides.Cso.*`, `Strides.Hud.ObjectiveLines`). Toujours exporter
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (sinon une fenêtre « Xcode introuvable » bloque Metal).
Captures et démonstration : toujours avec `-StridesShotsDir=<dossier dédié>` (voir `parite/README.md`) ; le mode
refuse d'écrire dans `Saved/Screenshots/Strides` ou `MacEditor` s'ils contiennent des fichiers, quelle que soit la casse.

## 5. Boucle jouable (éditeur, Play)
Scène construite au lancement (carte `Entry` du moteur, `AStridesGameMode`) : départ à l'Écurie du Val, cavalier à pied
à 2 m du cheval ; l'épreuve « Parcours du Pôle » (`cso_train`) est lancée d'office (le poteau « Chrono » interactif et la
carte de présentation relèvent de T10).
1. À pied : ZQSD/WASD (codes physiques) ou joystick ; approcher du cheval (< 3 m), **E** : monter.
2. Rejoindre l'entrée de la carrière du Pôle (objectif affiché) ; entrée en piste, annonce, **cloche** (45 s).
3. Joystick avant / arrière : cadence (gardée au relâché, max 8 m/s) ; gauche / droite : virages ; clavier : flèches ou
   WASD, Ctrl / Alt gauche = amplitude 0,5 / 0,25.
4. HUD d'épreuve (UMG, styles relevés dans le navigateur) : tableau « Départ 45 s · accordé 64 s », chrono, points,
   prochain obstacle, crans de cadence, mot d'appel, toasts ; seuls les boutons SAUT et pause restent en épreuve.
5. **Espace** / bouton SAUT au bon moment ; trop tôt : rien ; trop près ou trop lent : refus (freinage, cabré).
6. **Échap** / bouton pause : carte Pause (bascules « Tracé au sol » et « Aide au saut », sauvegardées) ; **P** / Tab :
   téléphone (cheval et chrono figés) ; **M** : carte (non portée : panneau texte).
7. **F8** : démonstration automatique du parcours (hors version Shipping) ; **F5** / **F9** : sauvegarder / recharger.
Limites connues : à l'arrivée, le bilan n'est pas porté (l'épreuve reste au bilan, T11) ; aucun son (T12). À vérifier
sur appareil réel : toucher, facteur de pixels, zones sûres, cadence d'images.

## 6. Ressources à importer (éditeur)
1. `public/real/horse_pjl.glb` → `Content/Horse/` (importeur glTF) : vérifier squelette (419 os), échelle (≈ 1,65 m au
   garrot), orientation (+X), 17 clips ; créer les sockets `SaddleSeat`, `Stirrup_L/R`, `ReinHand_L/R` ; l'assigner au
   `Mesh` de `AStridesHorse` (Blueprint enfant `BP_Horse`) et cacher `Body`.
2. `public/real/rider_f.glb` / `rider_m.glb` → `Content/Riders/` : 53 os, formes (`face_*`, `blink_*`, `look_*`,
   expressions) ; Blueprint enfant de `AStridesRider`.
3. Attribution obligatoire (CC BY 4.0) du cheval WildMesh 3D dans les crédits de l'application.
4. Ne pas embarquer `horse_tripo.glb` tant que ses conditions ne sont pas confirmées.

## 7. iPhone / iPad
- Project Settings > iOS : Bundle Identifier (`com.strides.equestriantour`), équipe de signature,
  orientations paysage (déjà dans `DefaultEngine.ini`).
- Construire :
```
"$UE/Engine/Build/BatchFiles/RunUAT.sh" BuildCookRun -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -platform=IOS -clientconfig=Development -build -cook -stage -pak -package -archive -archivedirectory="$PWD/build/ios"
```
- Voir `testflight.md` pour la commande vérifiée, la signature et les contrôles pré-envoi.
- Installer sur un appareil personnel (Xcode, Devices) ; mesurer sur l'appareil (`stat fps`, `stat unit`, `stat rhi`) :
  cible de départ 30 i/s stables sur iPhone 12 et iPad équivalent, à confirmer avec Julien.
