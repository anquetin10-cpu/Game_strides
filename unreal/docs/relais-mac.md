# Relais local (Mac) — ouvrir, compiler, jouer, construire pour iPhone/iPad

État vérifié sur le Mac de développement le 17 novembre 2026, revérifié le 18 novembre 2026 : module compilé avec
UE 5.8.4 (recompilation complète des modules du projet, 0 erreur, 0 avertissement), cœur en **C++20**, 6 tests
Automation `Strides` réussis. **Mis à jour le 21 novembre 2026** (tranche a, parcours CSO du Pôle, livrée de T1 à T12,
plus la robe du cheval engagé C1 et l'hygiène finale de la tranche) : dernière compilation incrémentale
`StridesGrandTourEditor Mac Development` réussie le 22/11/2026 (reprise du contrôle adverse de l'hygiène finale :
remarques 16, 17 et 26 corrigées) ; `ctest` 300 729 vérifications, 0 échec (22/11/2026) ; **32 tests** Automation
`Strides` en `Result={Success}` (22/11/2026, après ces corrections). Inventaire de parité avec le jeu web :
[`PARITE.md`](PARITE.md) ; plan et écarts de la tranche a : [`parite/cso-ecarts.md`](parite/cso-ecarts.md).

| Étape | État |
|---|---|
| Code C++ du cœur (règles) écrit | fait ; 5 722 lignes dans StridesCore (21/11/2026, `wc -l` des .cpp et .h) |
| Cœur compilé et testé hors moteur (clang, C++20) | **fait** : 300 729 vérifications, 0 échec (22/11/2026) ; oracles exportés du jeu web ; scripts de mutations du cœur réparés et rejoués le 21/11/2026, puis durcis (mutation non jouée = échec, code 2) et rejoués à la reprise du 22/11/2026 |
| Code du module Unreal écrit (acteurs, sous-systèmes, commandes, HUD, tests d'automatisation) | fait |
| Module Unreal compilé (UnrealBuildTool) | **fait** avec UE 5.8.4 (incrémental, dernier le 22/11/2026) ; cible `StridesGrandTour IOS Shipping` compilée et liée le 20/11/2026 (T12) |
| Tests Automation `Strides` (éditeur, `-nullrhi`) | **fait** : 32 `Result={Success}` (22/11/2026) |
| Projet ouvert dans l'éditeur, scène lancée | **fait** |
| Boucle jouée et parcours complet jugé | **démonstration automatique seulement** (F8 / `-StridesShots=cso-jeu` : activité lancée au poteau, carte validée, « 60,28 / 64 s 0 pt Arrivée ✓ » après T12 ; au vert en C1 ; « 60,52 / 64 s 0 pt Arrivée ✓ » le 22/11/2026, chrono variable d'un passage à l'autre à 0,3 s près) ; aucune partie jouée à la main comparée au web |
| Archive iOS arm64 complète | **faite sans signature** le 18/11/2026 ; **pas refaite** : le 20/11/2026 (T12), binaire IOS Shipping lié sans Pixel Streaming, paquet non fait faute de disque et finalisation refusée faute d'équipe de signature |
| Package iOS signé pour TestFlight | bloqué par l'accord Apple Developer et l'absence de certificat/profil de distribution |
| Installé et testé sur iPhone / iPad réel | **non vérifié** (toucher réel, facteur de pixels, zones sûres, budget de triangles non mesurés) |

## Parité de la tranche a (parcours CSO du Pôle), au 22/11/2026

Source de vérité : l'inventaire (`parite/inventaire/*.json`, rendu en [`PARITE.md`](PARITE.md)) ; 78 lignes marquées
tranche a : **23 identique_prouve**, **41 partiel**, **14 absent** (niveaux : testé 48, joué à l'écran 14, compilé 2,
aucun 14), après le contrôle adverse de l'hygiène finale (27 / 37 / 14 avant : quatre lignes d'intégration ramenées à
partiel). Sous-tranches livrées : T1 à T12 (banc, cheval, obstacles, déroulé et textes, géométrie des obstacles, caméra,
HUD d'épreuve, commandes, aides à l'appel, entrée dans l'épreuve, arrivée et bilan, sons et recette), puis l'hygiène
finale du 21/11/2026, son contrôle adverse et sa reprise du 22/11/2026 (remarques 16, 17 et 26 corrigées par
alignement sur le JS, sans changer l'état d'une ligne ; `parite/cso-ecarts.md` §4). « Prouvé » vaut pour la règle, les textes et
les appels ; le rendu de ce qui s'affiche ou s'entend est déclaré dans les lignes `interface.*` et `audio.*`, partielles ;
le branchement dans le jeu est porté par les lignes d'intégration (conduite, déclenchement du saut, jugement des barres,
caméra de concours), partielles (convention d'état : `parite/cso-ecarts.md` §4).

- **Prouvé (23)** (oracle exporté du jeu web, comparé par un test qui passe, écart sans différence d'un élément de la
  fonction) : cheval de concours (direction, cadence, prise du cap, réception, refus), saut (plan, facteurs de vitesse
  et d'angle, qualité de l'appel), obstacles (décision et pénalité de refus, ordre des fautes), déroulé (cloche, ligne
  de départ et départ lancé, arrivée, temps accordé, pénalités de temps, temps limite, élimination à la descente : deux
  lignes), tracé du Pôle et hauteurs du profil, géométrie des chandeliers et des barres, comparaison de deux résultats.
- **Partiel (41)** : conduite intégrée (commandes de concours armées hors épreuve), déclenchement du saut (visée
  prouvée ; puissance sans équipement ni état, dégagement 0), jugement des barres (règle prouvée ; membres non jugés,
  annonce sans attendre les postérieurs), caméra de concours (règle prouvée ; fondu d'entrée parti de la perche du
  portage), rendu du HUD d'épreuve (tableau et chrono, mot d'appel, cadence, masquages : police du moteur au
  lieu de Geist, animations non comparées image par image), bouton SAUT coloré et aides au sol (logique sans écart,
  rendu plus terne, aide imposée par un défi non portée), cause de barre (causes des membres jamais produites),
  trajectoire (calage du clip non vérifié), animation du saut, appel (astuce « Trop lent » absente), astuces (seul
  « Trop tôt » porté), effleurement, contacts des membres (effet porté sans détection), chute des barres, refus unique,
  affichage de l'élimination, entrée en piste, contrôle de capacité, cartes de présentation et du plan, géométrie des
  obstacles (faces non vérifiées par le test de T5), habillage (couleur du mur), guidage (cible GPS absente), caméra
  dès l'entrée en piste et contre le décor, bilan (police, colonnes à 8,2 px au plus), Recommencer (« S'entraîner » sans
  effet), classement simulé (graine négative refusée), résultat de tentative, règles du cross, sauts libres, sons de
  concours (compresseur non porté, écoute non faite), activité Parcours du Pôle (meilleur temps).
- **Absent (14)** : défis (cinq lignes) et record par défi, entraînement au paddock (`cso_warmup`) et obstacles
  d'entraînement, collisions des obstacles, appui des postérieurs et membres réglés sur les barres, contacts réels des
  membres, caméra de sortie de piste, célébration (missions d'histoire et Paris, pas le Pôle).
- **Non vérifié** : tout ce qui demande un appareil iOS (toucher réel, facteur de pixels, zones sûres, rendu mobile,
  performances, budget de triangles) ; paquet iOS complet et signature ; écoute réelle des sons ; un vrai clavier
  AZERTY.

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
Attendu (21/11/2026) : 32 tests en `Result={Success}` (`Strides.Core.*`, `Strides.Units`, `Strides.World.*`,
`Strides.Shots.OutputDir`, `Strides.Parite.*`, `Strides.Cso.*`, `Strides.Horse.*`, `Strides.Hud.ObjectiveLines` : 32
déclarations `IMPLEMENT_*AUTOMATION_TEST` dans `Private/Tests/`) ; dernier passage complet au vert : 22/11/2026 (32/32). Toujours exporter
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (sinon une fenêtre « Xcode introuvable » bloque Metal).
Captures et démonstration : toujours avec `-StridesShotsDir=<dossier dédié>` (voir `parite/README.md`) ; le mode
refuse d'écrire dans `Saved/Screenshots/Strides` ou `MacEditor` s'ils contiennent des fichiers, quelle que soit la casse.

## 5. Boucle jouable (éditeur, Play)
Scène construite au lancement (carte `Entry` du moteur, `AStridesGameMode`) : départ à l'Écurie du Val, cavalier à pied
à 2 m du cheval ; rien n'est lancé au démarrage (tranche T10) : l'épreuve « Parcours du Pôle » (`cso_train`) se lance au
poteau « Chrono » de l'entrée de la carrière du Pôle, à cheval (action : **E**, F, Entrée ou bouton d'action « Chrono »).
1. À pied : ZQSD/WASD (codes physiques) ou joystick ; approcher du cheval (< 3 m), **E** : monter.
2. À cheval à l'entrée de la carrière du Pôle, **E** : grand message « PARCOURS DU PÔLE », carte de présentation (Voir le
   plan, Retour, **Entrer en piste**, à la souris sur Mac) ; entrée en piste, annonce, **cloche** (45 s).
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
