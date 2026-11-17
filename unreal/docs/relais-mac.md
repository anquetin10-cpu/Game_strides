# Relais local (Mac) — ouvrir, compiler, jouer, construire pour iPhone/iPad

Ce qui a été fait **dans la session cloud (Linux, sans Unreal ni Xcode)** et ce qui reste à faire sur un Mac.

| Étape | État |
|---|---|
| Code C++ du cœur (règles) écrit | fait |
| Cœur compilé et testé hors moteur (g++ 13, clang -Werror ; 4 944 vérifications) | **fait** |
| Code du module Unreal écrit (acteurs, sous-systèmes, commandes, HUD, tests d'automatisation) | fait |
| Module Unreal compilé (UnrealBuildTool) | **non vérifié** (aucun Unreal dans la session) |
| Projet ouvert dans l'éditeur, scène lancée | **non vérifié** |
| Boucle jouée (à pied → monter → allures → obstacle → descendre → sauvegarder → recharger) | **non vérifié** |
| Package iOS construit, signé | **non vérifié** (pas de Mac ni de Xcode) |
| Installé et testé sur iPhone / iPad réel | **non vérifié** |

## 1. Prérequis (Mac)
- **Unreal Engine 5.6** (`EngineAssociation` du `.uproject`), installé par le lanceur Epic avec la plateforme **iOS**.
  Si une autre version stable est déjà installée, changer `EngineAssociation` et refaire l'étape 3 ; le code n'utilise
  que des API stables (Enhanced Input, sous-systèmes, USaveGame, FJsonSerializer).
- **Xcode** dans la version que la documentation Epic indique pour UE 5.6 et iOS (page « iOS, iPadOS and tvOS
  Development Requirements » de la version) ; à confirmer avant tout achat de matériel : aucun achat n'est engagé.
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
UE=/Users/Shared/Epic\ Games/UE_5.6
"$UE/Engine/Build/BatchFiles/Mac/GenerateProjectFiles.sh" -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -game
"$UE/Engine/Build/BatchFiles/Mac/Build.sh" StridesGrandTourEditor Mac Development -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject"
open unreal/StridesGrandTour/StridesGrandTour.uproject
```
Corriger les erreurs de compilation éventuelles (le module n'a jamais été compilé) ; consigner chaque correction.

## 4. Tests dans le moteur
```
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides; Quit" -unattended -nullrhi -log
```
Attendu : `Strides.Core.Course`, `Strides.Core.Save`, `Strides.Units` réussis.

## 5. Boucle jouable (éditeur, Play)
Scène construite au lancement (carte `Entry` du moteur, `AStridesGameMode`) : carrière 140 × 96 m, parcours du Pôle à
1,10 m (10 sauts), cheval à l'entrée de piste, cavalier à côté.
1. À pied : ZQSD/WASD ou joystick ; approcher du cheval (< 3 m), **E** : monter.
2. Joystick avant : la cadence monte (galop de concours 6,2 m/s, max 8) ; gauche/droite : virages (rayon 2,6 + 0,8 × v).
3. Franchir la ligne de départ (HUD : chrono lancé, temps accordé 64 s).
4. **Espace** devant l'obstacle 1 : HUD « 1 franchi · appel … » ou « barre +4 » ; trop près sans appel : refus.
5. Terminer ou **E** pour descendre (en épreuve : éliminé, règle du jeu web).
6. **F5** : sauvegarder ; **F9** : recharger (position, à pied ou à cheval).
À vérifier par observation (et à noter) : virages des deux côtés, saut complet (appel, montée, sommet, réception),
refus, caméra, tactile (joystick virtuel sur iPad).

## 6. Ressources à importer (éditeur)
1. `public/real/horse_pjl.glb` → `Content/Horse/` (importeur glTF) : vérifier squelette (419 os), échelle (≈ 1,65 m au
   garrot), orientation (+X), 17 clips ; créer les sockets `SaddleSeat`, `Stirrup_L/R`, `ReinHand_L/R` ; l'assigner au
   `Mesh` de `AStridesHorse` (Blueprint enfant `BP_Horse`) et cacher `Body`.
2. `public/real/rider_f.glb` / `rider_m.glb` → `Content/Riders/` : 53 os, formes (`face_*`, `blink_*`, `look_*`,
   expressions) ; Blueprint enfant de `AStridesRider`.
3. Attribution obligatoire (CC BY 4.0) du cheval WildMesh 3D dans les crédits de l'application.
4. Ne pas embarquer `horse_tripo.glb` tant que ses conditions ne sont pas confirmées.

## 7. iPhone / iPad
- Project Settings > iOS : Bundle Identifier (`com.strides.equestriantour` provisoire), équipe de signature,
  orientations paysage (déjà dans `DefaultEngine.ini`).
- Construire :
```
"$UE/Engine/Build/BatchFiles/RunUAT.sh" BuildCookRun -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -platform=IOS -clientconfig=Development -build -cook -stage -pak -package -archive -archivedirectory="$PWD/build/ios"
```
- Installer sur un appareil personnel (Xcode, Devices) ; mesurer sur l'appareil (`stat fps`, `stat unit`, `stat rhi`) :
  cible de départ 30 i/s stables sur iPhone 12 et iPad équivalent, à confirmer avec Julien.
