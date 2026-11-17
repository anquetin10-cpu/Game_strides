# Reprise Mac — 17 novembre 2026

## Résultats effectivement vérifiés
- Source : `anquetin10-cpu/Game_strides`, branche `claude/unreal-port`, commit `285404ccfbc7f0f28ec64901f1061aa2b3635a29`.
- Clone isolé : `/Users/julien/.openclaw/workspace/projects/grand-tour-unreal` ; aucun changement du jeu web publié.
- Mac mini M2, 16 Go de RAM, macOS 26.5.2.
- Xcode 26.6, SDK iOS 26.5. Sélection par `DEVELOPER_DIR` pour chaque commande ; aucune modification globale de `xcode-select`.
- Cœur compilé avec AppleClang 21, Debug, `-Werror`, Ninja.
- CTest : 1 suite réussie, **4 944 vérifications, zéro échec**. Journal : `build/core-mac/Testing/Temporary/LastTest.log`.
- Unreal Engine **5.8.4** installé par Epic dans `/Users/Shared/Epic Games/UE_5.8`; UE 5.6 retiré. UnrealBuildTool accepte Xcode 26.6 et compile avec le SDK Mac 26.5.
- Composant Metal Toolchain Apple installé et reconnu par Unreal (`metal` 32023.883, toolchain 17F109).
- Cible `StridesGrandTourEditor Mac Development` compilée avec succès. Bibliothèques produites : `libUnrealEditor-StridesCore.dylib` et `libUnrealEditor-StridesGrandTour.dylib`.
- Tests dans le moteur : `Strides.Core.Course`, `Strides.Core.Save` et `Strides.Units` réussis, sortie `EXIT CODE: 0`. Journal de contrôle : `/tmp/grandtour-unreal-tests-rerun-14868.log`.
- Démarrage graphique en mode jeu vérifié : carte `/Engine/Maps/Entry`, classe `StridesGameMode` et HUD visibles.
- Boucle contrôlée à l'écran : monter, accélérer jusqu'au galop à 8,0 m/s, descendre, sauvegarder puis recharger. L'installation du contexte Enhanced Input a été fiabilisée dans `SetupInputComponent` et `BeginPlay`.
- Modèles cheval PJL et cavalière convertis puis importés dans `Content/Characters`. Leur échelle, leur orientation et leur placement en selle ont été contrôlés sur une capture montée. La pose d'attente utilise provisoirement la première image du trot, car le clip `idle` importé déforme le squelette.

## Commandes reproductibles
```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cmake -S unreal/core -B build/core-mac -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_COMPILER="$DEVELOPER_DIR/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang++" -DCMAKE_CXX_FLAGS=-Werror
cmake --build build/core-mac
ctest --test-dir build/core-mac --output-on-failure -V

UE="/Users/Shared/Epic Games/UE_5.8"
"$UE/Engine/Build/BatchFiles/Mac/Build.sh" StridesGrandTourEditor Mac Development \
  -project="$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -WaitMutex
"$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" \
  "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" \
  -ExecCmds="Automation RunTests Strides; Quit" -unattended -nullrhi -nosplash
```

## Blocages réels
- Le nettoyage et la sauvegarde ont porté la marge disque à environ **26 Gio** ; le stockage ne bloque plus la tranche Mac actuelle.
- L’outil `idevice_id` fourni avec UE 5.8 est Intel et échoue sur ce Mac Apple Silicon (`Bad CPU type in executable`). La plateforme iOS est reconnue valide par Unreal, mais la détection d’un appareil par cet outil reste à corriger ou contourner.
- Aucun appareil iOS détecté par `xcrun devicectl list devices`.
- Les clips importés restent à retargeter et à valider en mouvement (notamment attente, saut et synchronisation cavalier-cheval). Aucun package iOS produit.

## Stockage : diagnostic, aucune suppression
- Cache uv : environ 3,2 Gio ; à contrôler avant nettoyage, puis à retélécharger si nécessaire.
- Runtimes Codex en cache : environ 1,6 Gio ; vérifier les processus actifs avant toute action.
- Données CoreSimulator : environ 18 Gio ; runtime iOS 26.5 utilisé, aucun appareil signalé indisponible. Pas un ensemble de fichiers jetables : contient apps et états de tests.
- Modèles Hugging Face : environ 8,1 Gio ; comprennent la voix Qwen et la transcription, à conserver par défaut.
- Corbeille vide ; téléchargements environ 99 Mio : ne résoudront pas le problème.
- En attente du choix de Julien : SSD externe existant ou sélection explicite de données à libérer. Aucun achat, aucune suppression, aucune publication.

## Prochaine reprise
1. Retargeter les animations cheval et cavalier, puis valider visuellement chaque allure et le saut.
2. Finaliser un parcours complet à l'écran avec obstacles et jugement.
3. Corriger ou contourner `idevice_id`, connecter un appareil et vérifier la détection.
4. Construire et tester sur appareil ; compilation et tests moteur ne prouvent pas encore le package iOS ni la performance réelle.
