# Audit factuel du portage Unreal — 26/11/2026

Base auditée : `357defd0` (branche `claude/unreal-port`, égale à `origin/claude/unreal-port` après `git fetch`, 0 commit d'écart
dans les deux sens). Audit fait du 26/11/2026 06:37 au 26/11/2026 08:15 (Europe/Paris) sur le Mac mini. Aucun README cru sur
parole : chaque ligne ci-dessous vient d'une commande relancée pendant l'audit, sauf mention « à confirmer ».

Niveaux employés : **écrit** (code présent), **compilé** (UBT vert), **testé moteur** (Automation ou ctest vert),
**joué par l'agent** (entrées système injectées par l'agent, voir § 6). Rien n'est « joué à la main par Julien » : à confirmer
par Julien.

Aucun correctif de code n'a été fait dans cette étape. Ajout seulement : ce document, `plan.md`, une sélection de preuves
(`preuves/audit-20261126/`, 0,7 Mo) et l'outil de partie manuelle `scripts/unreal/partie-manuelle/` (§ 6).

## 1. Dépôt et disques

| Élément | Constat |
|---|---|
| HEAD | `357defd0` « monte S4/S5 contrôle complémentaire… » |
| Distant | `origin/claude/unreal-port` = `357defd0` (fetch du 26/11 06:38) |
| Non suivi | `.claude/launch.json`, `scripts/unreal/__pycache__/` (normaux) ; rien d'autre |
| SSD interne (`/Users/julien`) | 51 Gi libres avant l'audit, 55 Gi après |
| Disque externe | 714 Gi libres avant, 707 Gi après (paquets et cuisson de l'audit : +7 Gi sous `.ue-cache/travail/livraison`) |
| Cache Zen | non touché (ni supprimé, ni vidé, ni zenserver arrêté) |

## 2. Outils

| Élément | Version mesurée |
|---|---|
| Unreal Engine | 5.8.4, CL 58902052 (`Engine/Build/Build.version`, chemin réel `/Volumes/…/Applications/UE_5.8`) |
| Xcode | 26.6 (17F113) ; SDK iPhoneOS 26.5 ; SDK macOS 26.5 ; macOS 26.5.2 (25F84) |
| Machine | Apple M2 (journal RHI : Metal, SM6) |

## 3. Compilation et tests

| Contrôle | Commande | Résultat |
|---|---|---|
| UBT éditeur | `Build.sh StridesGrandTourEditor Mac Development` | **vert**, 21 s, 0 avertissement |
| UBT jeu | `Build.sh StridesGrandTour Mac Development` | **vert**, 202 s, 3 avertissements (dossier `metal_irconverter_ext` absent du moteur, hors projet) |
| UBT jeu Shipping | `Build.sh StridesGrandTour Mac Shipping` | **vert**, 171 s, mêmes 3 avertissements |
| ctest (cœur StridesCore, C++20, Release) | `cmake -S unreal/core -B .ue-cache/travail/livraison/core-build` puis `ctest` | **8/8 cibles vertes** (oracles, monte, monte-cheval, monte-cavaliere, perf, monte-miroir, monte-sellerie, monte-vue) ; cible `oracles` : **300 729 vérifications, 0 échec** ; 17,1 s |
| Automation | `UnrealEditor … -ExecCmds="Automation RunTests Strides; Quit" -nullrhi` | **42 tests trouvés, 42 Result={Success}, 0 échec**, `TEST COMPLETE. EXIT CODE: 0`, 261 s |
| Avertissements du run Automation | journal `.ue-cache/journaux/audit-automation-20261126.log` | 9 avertissements relayés par le contrôleur : outil `idevice_id` non lançable (×3, libimobiledevice), journal « vue du cheval du web : demande la main du web » (×2), délai HTTP vers google.com (×1), etc. ; 20 lignes `LogAutomationTest: Error: Condition failed` émises à 05:50:23, **avant** le début des tests Strides (05:50:48) : hors tests Strides, origine à confirmer |
| Blocages « Waiting for ZenServer » | comptés sur chaque lancement | 4 messages sur 5 lancements ; **1 blocage réel** (éditeur -game, dialogue « Attendre ZenServer ? » 6 min) : mon processus arrêté puis relancé, zenserver et cache non touchés |

Répartition des tests (noms relevés dans le journal Automation) : 42 au total : Strides.Cso.* (15), Strides.Parite.* (14),
Strides.World.* (3), Strides.Core.* (2), Strides.Horse.* (2), Strides.Shots.* (2), Strides.Monte.* (2), Strides.Units (1),
Strides.Hud.ObjectiveLines (1).

## 4. Paquets

### 4.1 Paquets existants (`unreal/StridesGrandTour/Builds`, non modifiés)

| Paquet | Date | Taille | Signature |
|---|---|---|---|
| `EquestrianTour-Mac/Mac/StridesGrandTour-Mac-Shipping.app` | 17/11/2026 21:34 | 267 Mo | ad hoc, Team non défini ; **ne se lance pas** : `dyld: Library not loaded: @rpath/libtbb.12.dylib` (paquet incomplet) |
| `EquestrianTour-Mac/Equestrian Tour.app` | 17/11/2026 21:35 | 697 Mo | ad hoc ; **se lance** (fenêtre 1600 × 932 vue le 26/11 07:22), antérieur de 9 jours à HEAD |
| `EquestrianTour-IOS-Candidate-20261118/IOS/StridesGrandTour-IOS-Shipping.app` | 18/11/2026 06:01 | 276 Mo | `code object is not signed at all` |
| `EquestrianTour-IOS-Unsigned/*.xcarchive` (3) et `…Candidate-20261118/EquestrianTour-complete.xcarchive` | 17/11 21:58 à 18/11 06:03 | — | archives non signées |

### 4.2 Paquets de HEAD construits pendant l'audit (`.ue-cache/travail/livraison/builds/audit-20261126/`)

| Paquet | BuildCookRun | Lancement |
|---|---|---|
| Mac Development (887 Mo, ad hoc, `com.strides.equestriantour`) | **vert**, 1 086 s | **P0 : plantage au démarrage.** Boîte « Missing shader permutation » puis `Fatal error: [ShaderCompiler.cpp:4974] Missing global shader FXRCubemapPS's permutation 0` (journal `preuves/audit-20261126/extrait-log-paquet-development.txt`, capture `071108-message-shader-paquet-development.jpg`) |
| Mac Shipping | **vert**, 1 000 s | **P0 : même boîte au démarrage** (capture `074026-message-shader-paquet-shipping.jpg`) |

Cuisson : les bibliothèques globales `SF_METAL_SM5` et `SF_METAL_SM6` sont écrites, le jeu démarre en `METAL_SM6` et ne trouve
pas `FXRCubemapPS` (shader du greffon moteur XRBase). Le paquet du 17/11 démarrait. Changement de configuration suspect depuis :
`9ab9126f` (18/11) « enable Pixel Streaming 2 on Mac » ; cause **à confirmer** (lot J1-A du plan).

**Conséquence : aucun paquet jouable de HEAD n'existe aujourd'hui sur Mac.** La partie de l'audit a été jouée dans l'éditeur en
`-game` (repli autorisé).

## 5. Signature, appareils, Apple

| Élément | Constat |
|---|---|
| Identités de signature | `security find-identity -v -p codesigning` : **0 valid identities found** |
| Profils | `~/Library/MobileDevice/Provisioning Profiles` et `~/Library/Developer/Xcode/UserData/Provisioning Profiles` : absents |
| Équipe Xcode | `defaults read com.apple.dt.Xcode IDEProvisioningTeams` : absent |
| Appareils iOS | `xcrun devicectl list devices` : **No devices found** |
| Accord Apple Developer | non visible sans connexion : **à confirmer** (unreal/docs/testflight.md:31 dit « accord en attente », non vérifié ici) |
| Bundle ID | `com.strides.equestriantour` (Config/DefaultEngine.ini:28 et :41) |

## 6. Partie manuelle du jalon 1 (jouée par l'agent, entrées injectées)

**Méthode.** Jeu lancé comme un joueur, sans F8, sans autopilote, sans `-StridesShots`, sans console. Entrées clavier injectées
au niveau macOS par `CGEventPost` (python 3.11 autorisé par Julien pour l'accessibilité et l'enregistrement de l'écran, exécuté
dans un job launchd transitoire ; le Terminal n'a pas ces droits). Captures `screencapture -l <fenêtre>`. Outil versionné :
`scripts/unreal/partie-manuelle/` ; journal des 48 plans d'entrées : `preuves/audit-20261126/journal-entrees-injectees.log` ;
76 captures et journaux complets : `.ue-cache/travail/livraison/preuves/j1-audit-20261126/` (480 Mo, hors dépôt).
Deux boîtes de dialogue ont été fermées par un appui d'accessibilité (bouton OK du message de shader ; bouton « Non » du
dialogue Zen de mon éditeur bloqué). Un dialogue système « Terminal souhaiterait enregistrer l'écran », provoqué par l'agent,
a été refusé (aucun droit accordé).

**Support joué.** Paquets de HEAD inutilisables (§ 4.2) → éditeur `UnrealEditor <uproject> -game -windowed -ResX=1600 -ResY=900`
(Development, `SF_METAL_SM6`), 26/11 07:51 à 08:10.

**Déroulé (horodaté, captures dans `preuves/audit-20261126/`).**

1. 07:53 : monde chargé, joueuse à pied près du cheval, HUD « À pied · Monter à cheval : E (à moins de 3 m) », mini-carte
   (`075320-j1-02-monde.jpg`). Aucun écran titre ni création de personnage.
2. 07:53 : D 0,8 s puis E → « À cheval · ARRÊT » (`075337-j1-04-apres-E.jpg`). **Monter : atteint.**
3. 07:53 : W maintenu → « À cheval · GALOP · 6,9 m/s » (`075352-j1-05-galop.jpg`). **Galoper : atteint.**
4. 07:54 à 08:06 : recherche du Pôle International (≈ 560 m de l'écurie) à la mini-carte seule, 36 plans d'entrées. Arrivée
   dans la carrière du Pôle à 08:06 (`080649-j1-36.jpg`), obstacles 6A/6B vus à 08:08 (`080848-j1-42.jpg`), drapeau ARRIVÉE à
   08:09 (`080945-j1-46.jpg`). **Rejoindre le Pôle : atteint, au prix de ~13 min et de ~36 essais.**
5. 08:08 à 08:10 : passages à pied de cheval près du point de départ (330, −191) : **aucune invite « Chrono » affichée, aucun
   poteau visible** ; épreuve **non lancée**, donc entrée en piste, parcours, chute de barre, chrono, résultat et record
   **non joués**. Arrêt de la partie à 08:10 (budget de l'étape).

**Blocages relevés (gravité, preuve).**

| # | Gravité | Blocage | Preuve |
|---|---|---|---|
| B1 | **P0** | Paquets Mac Development et Shipping de HEAD : plantage au démarrage, `FXRCubemapPS` absent | § 4.2 |
| B2 | **P0** (pour J1) | Le départ de l'épreuve est **invisible et muet au clavier** : `AStridesActivityPost` n'a qu'un `USceneComponent` (StridesActivityPost.cpp:9-21, aucun maillage, alors que le web pose un `marker`) ; le libellé « Chrono » n'est dessiné que par les commandes tactiles (StridesTouchControls.cpp:378), actives seulement sur iOS ou avec `-TouchControls` (StridesPlayerController.cpp:78). Sur Mac au clavier, rien n'indique où appuyer sur E | partie 08:08-08:10, code cité |
| B3 | **P1** | Aucun moyen de trouver l'épreuve : pas de GPS ni de cible sans mission, application Carte « non portée » (StridesHUD.cpp:107), téléphone en lecture seule (StridesHUD.cpp:97-115) ; le web a `GPS` (src/gameplay/gps.js:17), la carte plein écran (src/ui/minimap.js:372) et l'app Activités | 36 essais de navigation |
| B4 | **P1** | Mini-carte inversée nord-sud par rapport au web et au monde : Unreal dessine `y = −(z − CZ)` (StridesHUD.cpp:133), le web `Z(z) = (z − z0)·s` (src/ui/minimap.js:23). Un virage à droite apparaît à gauche sur la carte ; les obstacles vus à droite sur la carte étaient à gauche à l'écran (08:07-08:08) | captures j1-41 à j1-42 |
| B5 | **P1, à confirmer** | Déplacement mesuré sur la mini-carte ≈ 2,5 à 5 fois la vitesse affichée au galop (ex. 08:06 : 71 m en ~3,5 s affiché 8,0 m/s ; marqueur des Dunes déplacé de 156 m en ~3,5 s) ; au pas, cohérent (5 m en ~4 s). Peut venir de la carte ou du cheval : mesure instrumentée à faire (lot J1-C) | captures j1-25, j1-35 |
| B6 | **P1** (règle de Julien) | Outils de développement présents dans le Shipping : `AStridesShots` compilé et lancé par `-StridesShots` (StridesShots.cpp:71, StridesGameMode.cpp:118, sans garde `UE_BUILD_SHIPPING`) ; chaînes `StridesShotsDir`, `StridesPerfSansCapture`, `StridesHorseView` présentes dans le binaire Shipping (recherche UTF-32 dans `StridesGrandTour-Mac-Shipping`) | § 7 |
| B7 | P2 | HUD du joueur : « Démo parcours : F8 » affiché, y compris en Shipping (StridesHUD.cpp:71, chaîne présente dans le binaire Shipping) ; « N mission » est un outil du portage (StridesPlayerController.cpp:111) | capture j1-04 |
| B8 | P2 | Le cheval garde sa cadence quand on lâche W (comportement du web en concours) : arrêt seulement en tenant S plusieurs secondes ; pas d'indication au joueur | j1-26 à j1-28 |
| B9 | P2 | La joueuse traverse le dessous des tribunes du Pôle (08:10, `j1-48`) ; HUD blanc illisible sur fond clair (j1-47) | captures |
| B10 | P3 | Pose de la joueuse à pied (mains sur les genoux) à l'ouverture ; aucun écran titre | j1-02 |

Plantages antérieurs relevés (hors partie de l'audit, rapports dans `~/Library/Application Support/Epic/UnrealEngine/5.8/Saved/Crashes`) :
SIGBUS dans `FStridesHorseAnimProxy::Evaluate` le 25/11 14:30 et le **26/11 01:10**, tous deux en `-StridesShots=monte-s2`,
le second **après** la parade `HandleExistingParallelEvaluationTask` de `fe5701f9` (StridesHorse.cpp:244-245). Non reproduit
pendant les ~19 min de partie de l'audit. **P0 latent, à confirmer** hors mode capture. Trois fenêtres CrashReportClient de ces
plantages restaient ouvertes sur l'écran de Julien ; laissées en l'état, rien n'a été envoyé à Epic.

## 7. Outils de développement et Shipping

| Outil | Hors Shipping ? | Preuve |
|---|---|---|
| Démonstration F8 (autopilote du parcours) | **oui pour l'effet** : `ToggleDemoCourse` et `TickDemo` vides en Shipping (StridesHorse.cpp:616, :656) ; chaîne « Strides demo course started » absente du binaire Shipping | recherche de chaînes |
| Touche F8 liée | **non** : `MapKey(DemoCourseAction, EKeys::F8)` sans garde (StridesPlayerController.cpp:109) ; sans effet en Shipping | code |
| Captures `-StridesShots` (et tous ses modes, perf, monte, cso, entree, bilan) | **non** : classe compilée et instanciée en Shipping si l'option est passée | StridesShots.cpp:71, StridesGameMode.cpp:118 ; chaînes présentes |
| Options `-StridesHorseView`, `-StridesHorseScale`, `-StridesHorseLead` | **non** (lues en Shipping) | chaîne `StridesHorseView` présente |
| F5 / F9 sauvegarde-rechargement, N mission suivante | non gardés ; outils du portage visibles du joueur | StridesPlayerController.cpp:107-111 |
| Tests Automation | oui (non compilés en Shipping par défaut du moteur) | — |

## 8. Inventaire J2 à J5 : web (source de vérité) et Unreal

« Existant » = écrit et branché dans le jeu ; « partiel » = écrit mais incomplet ou écart connu ; « absent » = rien.
Synthèse de `unreal/docs/PARITE.md` (687 fonctions : 24 identiques prouvées, 290 partielles, 373 absentes), **recoupée** par
lecture du code pour les lignes ci-dessous.

| Fonction | Web (`src/`) | Unreal | État Unreal |
|---|---|---|---|
| Monde de Deauville 1 200 × 1 200 m (1,44 km²) | src/world/layout.js:8 (`WORLD.size 1200`), src/world/world.js | StridesScenery.cpp:48 (relief 768 000 triangles, 206 maillages, 16 haies, 2 541 arbres d'après le journal), world_architecture.json (8 régions, 14 POI, 8 routes) | **existant** (décor) ; Paris absent |
| Circulation (voitures, feux) | src/gameplay/npcs.js:73 `Car`, :323 `TrafficFx`, src/entities/vehicle.js:17 | aucun | **absent** |
| PNJ piétons, ambiance | src/gameplay/npcs.js:16 `WalkAI`, :421 `Ambient` | aucun (sons de foule seulement, StridesCsoAudio) | **absent** |
| Téléphone | src/ui/phone.js:23 `Phone`, :64 `open` | StridesHUD.cpp:97 `DrawPhone` : panneau et noms de 10 apps, non interactif | **partiel** |
| GPS et carte | src/gameplay/gps.js:17, src/ui/minimap.js:248, :372 | StridesHUD.cpp:123 mini-carte (inversée, B4) ; cible GPS seulement pour une mission active (StridesHUD.cpp:199) ; carte plein écran absente | **partiel** |
| Missions | src/gameplay/missions.js:11 `makeSteps`, :256 `MissionManager`, jobs.js:53, story.js:49 | StridesProgressionSubsystem.cpp:12 ; 16 missions de données ; mission = rejoindre un point à 18 m (StridesWorldDirector.cpp:76-78), balise 18 m | **partiel** (étapes du web absentes) |
| Progression (crédits, réputation, rangs) | src/gameplay/story.js, src/core/save.js:8 | StridesProgressionSubsystem.h (Credits, Reputation, 5 rangs) | **partiel** |
| Sauvegarde | src/core/save.js:129 `SaveSystem` (version 2, migration) | StridesSaveSubsystem.cpp ; StridesCore/SaveGame (test Strides.Core.Save vert, import d'export web :151) | **existant** (auto-sauvegarde à confirmer) |
| Paddock / entraînement à l'abord | src/gameplay/activities.js (Pôle), stabling.js:21, home.js:24 | aucun (PARITE.md ligne « Entraînement à l'abord » : absent) | **absent** |
| Défis | src/gameplay/challenge.js:15-87 (DEFI_POLE_V1…V5, DEFI_PARIS_V1), challengeRun.js:31 | aucun moteur de défi | **absent** |
| Records | src/gameplay/activities.js:100-126 (`bestTimes`, « Nouveau record ») | StridesSaveSubsystem.cpp:31, :112 `BestTime` | **existant** (non joué) |
| Classement | src/gameplay/ranking.js:8 `simulateField`, :23 | StridesCore/Ranking, cso_ranking.json, test Strides.Cso.Result vert | **existant** (non joué) |
| Pause | src/ui/screens.js:216 | StridesPauseMenu (Échap), gel en pause | **existant** (non joué dans l'audit) |
| Écran titre, création du personnage | src/ui/screens.js:32, :45 | aucun | **absent** |
| Jour et nuit, météo, énergie | src/game.js:824-838, src/world/weather.js:17-114, src/gameplay/energy.js | soleil fixe | **absent** |
| Transport, camion, véhicules conduits | src/gameplay/transport.js:174, vehicle.js | aucun (StridesHorse.cpp:571 : « ni camion ni véhicule ») | **absent** |
| Boutiques, collectibles (fers d'or) | src/gameplay/shops.js:38, collectibles.js:16 | aucun | **absent** |
| Parcours CSO du Pôle (règles, HUD, caméra, appel, barres, chrono, résultat) | src/gameplay/courses.js, csoCourse.js, csoRide.js, jumpModel.js | StridesCore Cso* + 15 tests Strides.Cso.* et 14 Strides.Parite.* verts | **existant, testé moteur ; joué par l'agent le 26/11 en paquet Development jusqu'au bilan, Recommencer et retour au monde ; saut franchi, refus et arrivée non obtenus en partie réelle** (plan.md, État J1) |

## 9. Ce qui reste à confirmer

- Cause exacte de `FXRCubemapPS` manquant (Pixel Streaming 2 sur Mac suspect).
- Vitesse réelle du cheval au galop par rapport au HUD (B5).
- SIGBUS `FStridesHorseAnimProxy` hors mode capture.
- Accord Apple Developer, compte et équipe : non visibles sans connexion.
- Origine des 20 `Condition failed` du démarrage de l'éditeur avant les tests Strides.
- Le jeu à la main par Julien : rien n'a été joué par Julien dans cette étape.
