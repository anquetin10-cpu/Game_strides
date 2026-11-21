# Analyse d'écarts — parcours CSO du Pôle (tranche a), jeu web → Unreal

Date : 18/11/2026. Arbre de travail `claude/unreal-port`, HEAD `5837a02e` (modifications non commitées dans `JumpModel.h` et
`StridesCore.Build.cs` : commentaires C++17 → C++20, sans effet fonctionnel). Spécification : `unreal/docs/parite/cso-spec.md`
(référence : activité `cso_train`, « Parcours du Pôle », Prix STRIDES). Le JS fait foi ; les docs Unreal (`README.md`,
`MATRICE.md`, `decors.md`) n'ont pas été crues sur parole.

Abréviations de chemins :
- `SG/` = `unreal/StridesGrandTour/Source/StridesGrandTour/Private/` ; `SGh/` = `.../StridesGrandTour/Public/`
- `SC/` = `unreal/StridesGrandTour/Source/StridesCore/Private/` ; `SCh/` = `.../StridesCore/Public/StridesCore/`
- `TC` = `unreal/core/tests/test_core.cpp` ; `ORA/` = `unreal/core/tests/oracles/` ; `EXP` = `scripts/unreal/export-data.mjs`
- `VM` = `unreal/docs/validation-mac-2026-11-17.md` ; `§x.y` = section de `cso-spec.md`

États et niveaux : définitions strictes de la mission (identique_prouve = oracle JS comparé par un test C++ qui passe, ou
capture côte à côte ; aucune capture côte à côte n'existe). Niveau « compile » = code présent dans `Source/` (VM:12 : cible
éditeur Mac compilée le 17/11 sur `285404cc`). Niveau « joue_ecran » = cité dans VM ; VM porte sur `285404cc` : depuis, la
conduite, la cadence et le saut de `StridesHorse.cpp` n'ont pas changé (diff `285404cc..HEAD` : animations, relief, démo),
la citation reste donc valable mais à revérifier sur HEAD.

---

## 0. Preuves exécutées pour cette analyse

1. **Oracles à jour** : copie de `EXP` dans le scratchpad, chemins de sortie redirigés, exécutée par `vite-node` sur le JS
   actuel. `ORA/jump.json`, `ORA/cso_ride.json`, `ORA/cso_course.json` et les données `Content/Data/cso_course_pole.json`,
   `cso_ride.json`, `jump_model.json` régénérés sont **identiques octet pour octet** aux fichiers du dépôt.
2. **Tests du cœur** : `unreal/core` compilé (CMake, AppleClang, Release) et exécuté sur les oracles du dépôt :
   `saut : 576 cas`, `conduite CSO : 72 cas`, `parcours : 10 obstacles, longueur 368.44 m`, `4944 vérifications, 0 échecs`.
3. **Non exécuté ici** : compilation UBT, lancement du jeu, tests Automation (le dernier passage connu est VM:13 :
   `Strides.Core.Course`, `Strides.Core.Save`, `Strides.Units`).
4. **Indice hors VM** : `.tmp/shots.log` (18/11, 14:54, `-StridesShots`) : démonstration automatique partie de
   (330 ; −191), 4 points pris à presque chaque obstacle, « prochain : 7 » affiché de 55,34 s à 80,51 s, captures
   1600 × 900. `unreal/docs/decors.md:38` en tire « parcours complet joué » : c'est la conduite automatique de démonstration,
   pas une partie jouée ni une validation VM ; aucun niveau n'est relevé sur cette base.
5. **Captures** : web `tests/e2e/out/cso/1-presentation.png` à `7-barre-au-sol.png` (844 × 390). Unreal :
   `unreal/StridesGrandTour/Saved/Screenshots/Strides/` = décor (01 à 08), `09_jeu`, `10_galop_00` à `18`, en 1600 × 900,
   FOV 70 (`SG/StridesShots.cpp:32-39`, `69`), aucune dans une pose de la recette CSO. `unreal/docs/parite/<système>/` :
   aucune capture.

---

## 1. Synthèse

Décompte du tableau §2 à l'analyse (18/11/2026, 122 lignes) : identique_prouve 10, partiel 51, absent 61 ; niveaux :
teste 21, joue_ecran 7, compile 33, aucun 61. À cette date, tout ce qui était identique_prouve était de la logique pure
de `StridesCore` (tracé, hauteurs, temps accordé, pénalités de temps, saut, conduite en fonctions) et rien de ce qui se
voit ou s'entend n'était prouvé.

**Recompté le 20/11/2026** (contrôle des remarques, `python3` sur le tableau tel qu'il est écrit) : **identique_prouve
13**, **partiel 58**, **absent 51** ; niveaux : teste 36, joue_ecran 10, compile 25, aucun 51. Ce tableau n'a été tenu
à jour que pour les lignes que T6, T7 et T8 ont touchées (mention « (T6) », références récentes) ; les lignes que T2 à T5
ont changées (conduite, saut, refus, barres, déroulé, habillage) gardent l'état du 18/11. **L'état courant fait foi dans
l'inventaire** (`unreal/docs/parite/inventaire/*.json`, rendu en `unreal/docs/PARITE.md`), pas dans ce décompte. Depuis
T5, des éléments visibles sont prouvés par montage côte à côte (obstacles et lignes, cadrage de la caméra, HUD
d'épreuve, boutons SAUT et pause, carte Pause, aides à l'appel, cartes de présentation et du plan, annonce du dossard
et cloche : `unreal/docs/parite/cso/`) ; depuis T12, les sons de l'épreuve sont portés (journal identique au canal
« audio » du web, rendu hors ligne importé à l'identique ; compresseur du bus maître non porté, écoute non faite).

**Hygiène finale du 21/11/2026** : l'inventaire compte pour la tranche a **27 identique_prouve**, **37 partiel**,
**14 absent** (78 lignes ; niveaux : teste 48, joue_ecran 14, compile 2, aucun 14). Ce qui reste pour une tranche a
entièrement identique, par ordre d'importance visible pour le joueur : §4, « Ce qui reste pour une tranche a
entièrement identique ».

Écarts structurels, par gravité (constat du code, chiffres calculés signalés) :

1. **Il n'y a pas d'épreuve.** Le juge est créé à la construction du monde (`SG/StridesWorldDirector.cpp:40-45`), le
   cheval est relié au parcours en permanence (`SG/StridesGameMode.cpp:87`) et en commandes de concours partout, y compris
   dans le monde ouvert (`SGh/StridesHorse.h:27`, `bCsoControls = true`). Franchir la ligne de départ à n'importe quel
   moment lance le chrono. Ni poteau, ni présentation, ni entrée en piste, ni cloche, ni bilan ; une seule manche par
   session (le juge n'est jamais recréé, les barres jamais remises).
2. **Barre fantôme sur appui précoce.** Web : en épreuve, aucun saut si la première barre est au-delà de 1,9 × L0
   (`horse.js:119-122`, bouton « Trop tôt »). Unreal : saut accepté vers tout obstacle à moins de 13 m
   (`SG/StridesHorse.cpp:245-246`, `FenceAhead(..., JP.reach)`). Calcul (puissance 1,35 supposée, profil à confirmer ;
   v 6,2 m/s ; vertical 1,10 m ; appui à 10 m) : L0 = 4,23 m, L = 1,06 × L0 = 4,48 m < 10 m ⇒ arcY = 0, marge =
   0,2 − 1,10 = −0,90 ⇒ barre comptée à la réception (`SG/StridesCourse.cpp:81-84`), environ 5,5 m avant l'obstacle.
   La démonstration appelle à 0,9 × 13 m (`SG/StridesHorse.cpp:217-218`), ce qui est cohérent avec les 4 points pris à
   presque chaque obstacle dans `.tmp/shots.log` (lien de cause déduit du code, à confirmer à l'écran).
3. **Saut oblique compté franchi.** `FenceAhead` n'a aucun filtre d'angle (`SG/StridesCourse.cpp:62-76`) ; au-delà de 60°,
   `planJump` rend un plan sans marge (`SC/JumpModel.cpp:74-80`) et `JumpLanded` compte l'obstacle franchi
   (`SG/StridesCourse.cpp:82-83`). Web : pas de cible (`obstacles.js:358`), donc pas de saut, et refus si l'écart nez/face
   < v²/16 + 0,3 (`obstacles.js:455`).
4. **Saut libre en épreuve** (`SG/StridesHorse.cpp:172`) ; web : interdit en commandes de concours (`horse.js:119`).
5. **Barres jugées à la réception sur la marge du plan**, pas au passage de chaque barre (`SG/StridesCourse.cpp:78-88`) ;
   seule la dernière barre bouge, téléportée de 40 cm (`SG/StridesFence.cpp:76-81`).
6. **Refus** décidé seulement à moins de 0,55 m de la première barre mesurés depuis l'origine du cheval
   (`SG/StridesHorse.cpp:249-256`), arrêt instantané sans freinage ni cabré, aucune règle de recomptage ; toast « +4 »
   même quand le juge ignore le refus (`SG/StridesCourse.cpp:93-94`).
7. **Aucune interface d'épreuve** : HUD texte de débogage (`SG/StridesHUD.cpp:25-83`), minicarte et huit boutons
   tactiles toujours visibles, aucun son dans tout `Source/`.
8. **Caméra** : 55° horizontaux (≈ 27,1° verticaux en 844 × 390, calcul) contre 58° verticaux (≈ 100,4° horizontaux) :
   champ vertical environ deux fois plus étroit (`SG/StridesHorse.cpp:63`). **Mesuré en T6** (matrice de projection du
   moteur) : avec l'axe Y maintenu du joueur local, UE 5.8 garde le champ vertical 2 atan(tan(FieldOfView / 2) /
   AspectRatio) ; la perche (16:9 par défaut) montre 32,6° verticaux à tout format. La caméra de concours de T6 impose
   l'axe Y et AspectRatio 1 : 58° verticaux, comme le web.

Contrainte vérifiée : Pixel Streaming 2 est limité au Mac (`unreal/StridesGrandTour/StridesGrandTour.uproject:15`,
`PlatformAllowList: ["Mac"]`), conforme à « jamais dans iOS ».

---

## 2. Tableau d'écarts par élément de la spécification

**Tableau historique** (analyse du 18/11/2026, HEAD `5837a02e`) : les références `fichier:ligne` et les états sont ceux
de cette date, sauf sur les lignes mises à jour par T6, T7, T8, T9 ou le contrôle des remarques du 20/11 (mention de la
tranche ou référence récente). Par exemple les citations de `SG/StridesHUD.cpp:25-83`, `:39`, `:40-41`, `:61-79` décrivent
le HUD de débogage d'avant T7 (aujourd'hui `DrawHUD`, masqué en épreuve) ; celles de `SG/StridesHorse.cpp` d'avant T2
décrivent l'ancienne conduite. État courant : inventaire (`unreal/docs/PARITE.md`).

### 2.1 Entrée dans l'épreuve (§1)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 1.1 | Poteau « Chrono » en (336 ; −184), zone r 6 m centrée sur CSO_GATE, à cheval, sans mission | absent | aucun | aucune occurrence dans `Source/` | pas de poteau ni d'interaction ; la ligne de départ est toujours active |
| 1.1 | App Activités : carte, meilleur temps, bouton `Itinéraire` (GPS) | absent | aucun | téléphone = liste de noms (`SG/StridesHUD.cpp:61-79`) | pas d'app Activités, pas de GPS vers le poteau |
| 1.1 | Lancement : `PARCOURS DU PÔLE` / `Événement · Entraînement` 2600 ms, `notify`, bandeau d'objectif | absent | aucun | — | — |
| 1.2 | Enchaînement des étapes (goto, capacité, présentation, entrée, cloche, parcours, bilan, record) | absent | aucun | juge créé au démarrage (`SG/StridesWorldDirector.cpp:40-45`) | aucune machine d'étapes |
| 1.2 | Contrôle de capacité (grille v × d, dialogue Entraîneur, reach) | absent | aucun | — | — |
| 1.3 | Carte de présentation (kicker, titre, grille, règles, boutons, pause de la simulation) | absent | aucun | — | — |
| 1.4 | Plan SVG et légende, bouton `Retour` | absent | aucun | — | — |
| 1.5 | Entrée en piste : mode concours, hauteurs posées, barres remises, n° 1 surligné, `N° {dossard} · {joueur}` 2400 ms, `applause(0.5, 2.2)` | absent | aucun | commandes de concours permanentes (`SGh/StridesHorse.h:27`) | rien n'est déclenché ; le mode concours n'est pas un état d'épreuve |
| 1.6 | Cloche, `CLOCHE` 2000 ms, décompte 45 s, chrono lancé d'office + toast | absent | aucun | — | — |
| 1.6 | Départ lancé (0 ≤ s < 12 m, \|u\| < 3,8, cap 60°) | absent | aucun | — | — |
| 1.6 | Astuce d'ouverture (6000 / 5000 ms) | absent | aucun | consigne permanente de débogage (`SG/StridesHUD.cpp:40-41`) | texte différent, permanent |

### 2.2 Piste et parcours (§2)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 2.1 | Carrière 120 × 76 centrée (330 ; −224), décalage monde du tracé | partiel | compile | `SG/StridesDataSubsystem.cpp:87-88`, `SG/StridesWorldDirector.cpp:42-44` | valeurs exportées par script, mais décalage monde non testé ; sable, tribunes, paddock relèvent de l'inventaire monde |
| 2.2 | Tracé : positions, caps, abscisses des 10 éléments | identique_prouve | teste | `SC/CsoCourse.cpp:32-71` ; `TC:79-97` | trou de preuve : le test trace `poleDesign()` recopié à la main (`SC/CsoCourse.cpp:11-30`) alors que le jeu trace le design lu dans le JSON (`SG/StridesDataSubsystem.cpp:84-111`) ; contenu identique aujourd'hui, chemin JSON non testé |
| 2.2 | Longueur 368,44 m, arrondi 368 | identique_prouve | teste | `TC:83`, `100` ; `SG/StridesCourse.cpp:28` | — |
| 2.2 | Abord hors chrono (lead-in) | partiel | compile | `SC/CsoCourse.cpp:65` | calculé, utilisé par la démo seulement (`SG/StridesHorse.cpp:186-192`) ; absent de l'oracle |
| 2.3 | Hauteurs `cso_train` (1,1 + profil, arrondi au cm) | identique_prouve | teste | `TC:98-99` ; `SG/StridesCourse.cpp:17` ; `SGh/StridesCourse.h:25` | — |
| 2.3 | Hauteurs hors épreuve `csoHeights(1.15)` | absent | aucun | `SGh/StridesCourse.h:25` | toujours 1,10 |
| 2.3 | Barres jugées : vertical, oxer montant | partiel | compile | `SG/StridesFence.cpp:31-32` | conforme à `obstacles.js:100-103` mais recopié, non testé |
| 2.3 | Mur : barre jugée à h, posée à h − 0,05 ; bloc h − 0,15, couvertine, piliers | partiel | compile | `SG/StridesFence.cpp:45-51` | jugement à h conforme ; visuel : cube plein jusqu'à h, sans couvertine ni piliers |
| 2.3 | Repère d'obstacle n / t | partiel | compile | `SG/StridesFence.cpp:25-28` | convention conforme, non testée (l'oracle construit n / t lui-même, `TC:42-46`) |
| 2.3 | Couleurs `COLORS[i % 5]`, 8 bandes, embouts | absent | aucun | `SG/StridesFence.cpp:37-59` | formes de base du moteur, matériau par défaut |
| 2.3 | Chandeliers h + 0,75, ailes 0,95 m à 4 lattes, barres basses h × 0,62 et h × 0,3, jardinières | partiel | compile | `SG/StridesFence.cpp:63-73` | deux cubes h + 0,3 aux extrémités ; ni ailes, ni barres basses, ni jardinières |
| 2.3 | Ailes en collision pleine | absent | aucun | `unreal/StridesGrandTour/Config/DefaultEngine.ini:47` ; `SG/StridesHorse.cpp:277` | profil en recouvrement ; cheval déplacé sans balayage : il traverse ailes et chandeliers |
| 2.3 | Fanions, panneau numéro, n° attendu `#7dffc4` | absent | aucun | — | — |
| 2.3 | Faces d'entrée / sortie (±0,06 ; ±(spread/2 + 0,06) ; ±0,3) | absent | aucun | — | utilisées par le refus et le jugement web |
| 2.4 | Position et cap des lignes `CSO_START` / `CSO_FINISH` | partiel | teste | `TC:92` | seuls x et s comparés à l'oracle ; z et rot non |
| 2.4 | Habillage des lignes (poteaux, fanions, cellules, sciure, panneaux) | absent | aucun | — | lignes invisibles |
| 2.4 | Franchissement du départ (\|u\| < 3,8 m, cap à 60°) | partiel | compile | `SG/StridesCourse.cpp:32-41` | demi-largeur 6 m au lieu de 3,8 ; sens et cap conformes |
| 2.4 | Franchissement de l'arrivée (sans cap, après le dernier élément) | partiel | teste | `SG/StridesCourse.cpp:40`, `55` ; `SC/CsoCourse.cpp:131-135` ; `TC:124` | cap exigé (pas au web) ; demi-largeur 6 m ; ordre « après le dernier » testé à la main |
| 2.4 | Bip de départ `tone(1568, 0.1)` | absent | aucun | — | remplacé par un texte « Départ : le chrono est lancé » sans équivalent web (`SG/StridesCourse.cpp:50`) |
| 2.5 | Temps accordé 64 / 59 / 56 s | identique_prouve | teste | `TC:100-102` ; `SG/StridesCourse.cpp:28` | — |
| 2.5 | Temps limite 2 × TA = 128 s | partiel | teste | `SC/CsoCourse.cpp:101` ; `TC:148-153` | scénario écrit à la main, sans oracle |

### 2.3 Conduite (§3)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 3 | `steerRate`, `cadenceDelta`, `minRadius`, `maxTurnRate` et leurs constantes | identique_prouve | teste | `SC/CsoRide.cpp:12-29` ; `ORA/cso_ride.json` (72 cas) ; `TC:64-77` | constantes par défaut prouvées ; lecture de `cso_ride.json` (`SG/StridesDataSubsystem.cpp:74-81`) non testée |
| 3 | Cadence initiale = vitesse réelle arrondie au dixième | absent | aucun | `SGh/StridesHorse.h:29` | cadence à 0 au lancement, jamais réinitialisée |
| 3 | Cadence gardée joystick relâché ; figée pendant le refus | partiel | joue_ecran | `SG/StridesHorse.cpp:233` ; VM:15 | figée 1,2 s (`RefuseT`) ; web : figée pendant le freinage et le cabré (`csoRide.js:74-77`) |
| 3 | Vitesse vers la cadence : 4,5 m/s² sous 5 m/s, 3,6 au-delà, décélération 9 | partiel | joue_ecran | `SG/StridesHorse.cpp:237` ; VM:15 | 3 m/s² dans les deux sens |
| 3 | Lacet : approche exponentielle τ 0,2 puis borne 3 rad/s² ; pas de direction pendant le cabré | partiel | joue_ecran | `SG/StridesHorse.cpp:240-243` ; VM:15 | Euler explicite (consigne − actuel)/τ borné ; direction active pendant `RefuseT` |
| 3 | En l'air × 0,3 sur la rotation effective | partiel | joue_ecran | `SG/StridesHorse.cpp:240` ; VM:19 | × 0,3 appliqué à la consigne, pas à la rotation (`horse.js:236`) |
| 3 | Perte à la réception v × (1 − min(0,04 ; \|dev\| × 0,5)) | partiel | compile | `SG/StridesHorse.cpp:274` | −4 % fixe dès \|dev\| > 0,02, sinon rien |
| 3 | Rampe clavier 3,2 /s (× 2 en relâchant / inversant) | absent | aucun | `SG/StridesDataSubsystem.cpp:81` | paramètre lu, jamais utilisé |
| 3 | Clavier : flèches / WASD (ZQSD), Espace, Échap, P/Tab, M ; Ctrl / Alt = amplitude 0,5 / 0,25 | partiel | teste | `SC/CsoInput.cpp:109-163` ; `SG/StridesPlayerController.cpp:35-69`, `277-334`, `422-423` ; `ORA/cso_input.json`, `ORA/cso_freeze.json` | codes physiques (code matériel du Mac, T8) ; Échap pause, P / Tab téléphone, M carte (image par image comme le web) ; allures du portage sans effet en épreuve (testé, mutations détectées) ; code matériel supposé = kVK_* (pas essayé sur un vrai clavier AZERTY) ; hors Mac, repli par nom de touche |
| 3 | Tactile : joystick flottant r 58 px, zone x < 45 %, y > 30 % | partiel | joue_ecran | `SC/CsoInput.cpp:12-99` ; `SG/StridesPlayerController.cpp:239-266` ; `SG/StridesTouchControls.cpp:265-288`, `383-401` ; `ORA/cso_input.json` ; `cso/cmd-joystick-*` | logique rejouée (624 appels, 0 écart) ; `InputTouch` testé (facteur 3, identifiants, types de toucher, 8 mutations détectées) ; montages côte à côte, doigt routé par Slate jusqu'au viewport ; joysticks du moteur retirés ; logique identique (oracle), rendu non identique : pas de transition d'opacité de 0,2 s au relâché (`styles.css:90`), dégradé et ombre approchés ; facteur de pixels iOS et toucher réel non vérifiés (aucun appareil iOS, couche UIKit non exercée) |
| 3 | Sortie de piste 2,6 s, cadence → 1,9 m/s à −1,6 m/s² | absent | aucun | — | — |
| 3 | Menu pause : rappel des commandes, bascules `Tracé au sol` et `Aide au saut` | partiel | joue_ecran | `SG/StridesPauseMenu.cpp:144-410` ; `SC/SaveGame.cpp:107-140` ; `ORA/cso_pause.json` ; `cso/cmd-pause-*` | bascules rejouées (27 étapes, 0 écart), réglages sauvegardés et relus, aide appliquée à l'épreuve en cours ; Écran titre, Découvrir, Partager sans effet ; police et interlignes approchés |
| 3 | Gel cheval + chrono (téléphone, pause, carte, dialogue) | partiel | teste | `SG/StridesHorse.cpp:288-305`, `373` ; `SG/StridesPlayerController.cpp:286`, `355-393` ; `ORA/cso_freeze.json` | image par image comme le web (338 images, 0 écart : l'image d'Échap et celle de l'ouverture du téléphone avancent, celle de la fermeture reste figée) ; pause et téléphone : 150 images sans bouger chrono ni cheval (`Strides.Cso.Controls`) ; dialogues et écrans de choix non portés |

### 2.4 Aide à l'appel (§4)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 4.1 | État `timing()` (none en l'air, en refus, v < 3,2 ; refuse → near ; aide off → none) | identique_prouve | joue_ecran | `SC/CsoHorse.cpp:120-126` ; `SC/CourseAids.cpp:93-96` (`csoJumpTiming` : hors épreuve, entrée en piste, aide off) ; `SG/StridesCourse.cpp:239-259` ; `ORA/cso_target.json`, canal « ai » des exécutions `t9-*` (`testCsoAids`) ; `Strides.Cso.Aids` (T9) | aucun |
| 4.1 | Obstacle visé `target()` (épaules à 0,4 m, cos ≥ 0,5, première ≤ 13 m, dernière ≥ −0,3, \|u\| ≤ 2,25) | identique_prouve | teste | `SC/CsoHorse.cpp:94-118` ; `ORA/cso_target.json` (T2) | aucun sur la visée ; puissance du saut du portage : inventaire `cso.declenchement-saut` |
| 4.1 | Bouton SAUT coloré (Trop loin / Saute ! / Trop près / Saut / Trop tôt 600 ms) | partiel | joue_ecran | `SC/CsoHud.cpp:179-185`, `205-215` ; `SG/StridesTouchControls.cpp:413-527` ; `DATA/cso_jump_style.json` ; canal « ai » (`testCsoAids`) ; `Strides.Cso.Aids` ; `cso/aide-*` (T9) | état, classes, signe, libellé, « Trop tôt » relancé : identiques image par image ; aide imposée par un défi (`opts.jumpAid`, `aidLocked`) non portée (défis absents) ; police du moteur, halo approché, transition de l'anneau et état enfoncé non portés |
| 4.2 | Zone d'appel au sol (`takeoffZone`, bandes verte / ambre) | partiel | joue_ecran | `SC/CourseAids.cpp:17-51`, `105-118`, `121-174` ; `SG/StridesCourseAids.cpp:208-239` ; `ORA/cso_takeoff_zone.json`, canal « ai » (bande ambre seule : `t9-ambre`) ; `cso/aide-4-trop-loin-*`, `aide-5-bonne-zone-*` (PNG de la recette, `t9-recette`), `aide-ambre-*` (T9) | logique identique ; non départagés : bande de moins de 0,2 m (aucune exécution n'en pose ; elle existe aussi aux hauteurs de l'épreuve : 18 cas de la grille à la base 1,05, 11 à 1,10, 195 sur toute la grille), cheval absent (aucun appel à hh faux), zone sans aucune plage (pass nul : jamais avec le cheval des exécutions ; à 1,10 m, cheval de puissance 1,1 seulement) ; rendu : tone mapping et mélange différents (bandes plus ternes) |
| 4.3 | Tracé au sol (tirets, opacités, masquage, règle des 15 m) | partiel | joue_ecran | `SC/CourseAids.cpp:54-90`, `121-174` ; `SG/StridesCourseAids.cpp:161-184` ; `SG/StridesCourse.cpp:369-406` ; tirets de `ORA/cso_takeoff_zone.json` (coins et hauteur sol + 0,04), canal « ai » ; `cso/aide-trace-*` et `aide-sans-trace-*` (même image, tracé affiché / masqué) (T9) | logique identique ; début du tronçon borné par prevS non départagé (égalité à l'arrondi près sur le tracé du Pôle) ; rendu : tone mapping et mélange |
| 4.4 | Repère conique au-dessus de l'obstacle suivant | partiel | joue_ecran | `SC/CourseAids.cpp:121-174` ; `SG/StridesCourseAids.cpp:208-239` (géométrie du web, `DATA/cso_aids.json`) ; canal « ai » ; `cso/aide-*` (T9) | position, oscillation, cap identiques ; rendu : tone mapping et mélange |

### 2.5 Saut (§5)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 5.1 | Refus d'appel en l'air ou v < 3,2 m/s | partiel | joue_ecran | `SG/StridesHorse.cpp:245` ; VM:19 | conforme ; astuce « Trop lent pour sauter… » (2500 ms, 1 fois / 45 s) absente |
| 5.1 | Appel bloqué si un refus est engagé | partiel | compile | `SG/StridesHorse.cpp:245` | bloqué pendant `RefuseT` ; pas de phase « refus engagé » |
| 5.1 | Épreuve : sans cible, zone none ou > 1,9 × L0 → aucun saut, « Trop tôt » | absent | aucun | `SG/StridesHorse.cpp:172`, `246` | saut libre, ou saut jusqu'à 13 m ⇒ barre fantôme (§1, point 2) |
| 5.1 | Zone refuse et barre devant → refus | partiel | compile | `SG/StridesHorse.cpp:164-169` | arrêt instantané au lieu du freinage ; pas de test x ≥ 0 |
| 5.2 | Constantes `JUMP` | identique_prouve | teste | `SCh/JumpModel.h:13-17` ; `SG/StridesDataSubsystem.cpp:68-72` ; `TC:31-62` | lecture de `jump_model.json` non testée |
| 5.2 | Point de référence aux épaules (0,4 m devant l'origine) | absent | aucun | `SG/StridesHorse.cpp:160`, `252` | origine du cheval : distances d'appel décalées de 0,4 m |
| 5.2 | Puissance 1,35 × jump × (1 + mods.jump) × condition ; clearance | partiel | compile | `SG/StridesHorse.cpp:105-111`, `157` | ni équipement ni état ; clearance toujours 0 |
| 5.3 | `planJump`, zones, causes | identique_prouve | teste | `SC/JumpModel.cpp:65-125` ; `ORA/jump.json` (576 cas) ; `TC:31-62` | — |
| 5.4 | Trajectoire : durée L / max(v ; 1,5), jumpY = 4Hτ(1 − τ) | partiel | joue_ecran | `SG/StridesHorse.cpp:265-276` ; VM:19 | menée par la distance (équivalent à vitesse constante, non testé) ; clip choisi par v ≥ 7 (`:79`) sans calage sur τ (à confirmer) |
| 5.4 | Sons d'appel et de réception, sable | absent | aucun | — | — |
| 5.5 | Jugement de chaque barre au passage des épaules (interpolation, marge, −0,06) | partiel | compile | `SG/StridesCourse.cpp:78-88` | décidé à la réception sur `Plan.margin` ; virage en l'air sans effet ; seul l'obstacle visé à l'appel est jugé |
| 5.5 | Effleurement (marge < 0,04 : tinte, vibre) | absent | aucun | — | — |
| 5.5 | Cause `short` (au sol pendant le passage), cause `angle` si marge du plan ≥ 0 | absent | aucun | — | — |
| 5.5 | Résultat différé (membres jugés : 2,2 m ou 1,2 s) | absent | aucun | — | — |
| 5.6 | `takeoffQuality` | identique_prouve | teste | `SC/JumpModel.cpp:127-140` ; `TC:58` | — |
| 5.6 | Mot d'appel sous le chrono (textes FR, couleurs, 1500 ms, règles barre / sans-faute) | partiel | compile | `SG/StridesHUD.cpp:39` ; `SG/StridesCourse.cpp:85-87` | identifiant anglais brut (`perfect`), permanent ; ni table de textes, ni couleurs, ni règles de choix |
| 5.6 | Sans-faute : bip 990 Hz, obstacle suivant surligné | absent | aucun | `SG/StridesCourse.cpp:87` | à la place, un message « {n°} franchi · appel {id} » sans équivalent web |

### 2.6 Barres qui tombent (§6)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 6.1 | Moment de la chute (montée : tout de suite ; descente : après 1,1 m ou > 8 m) | absent | aucun | `SG/StridesCourse.cpp:84` | chute à la réception |
| 6.1 | Oxer : chaque barre touchée tombe, une seule faute | partiel | compile | `SG/StridesFence.cpp:78-80` | une faute (conforme), mais seule `Bars.Last()` (barre arrière) bouge |
| 6.2 | Chute déterministe (taquets, élan, rebonds, glisse, roulement, inclinaison) | absent | aucun | `SG/StridesFence.cpp:80` | téléportation +40 cm en X local, à 6 cm du sol ; cumulatif à chaque appel |
| 6.2 | Vibration d'effleurement | absent | aucun | — | — |
| 6.3 | Contacts des membres (capsules, balayage, fenêtre) | absent | aucun | — | — |
| 6.4 | Barre comptée +4 (attendu, bon sens) | partiel | teste | `SC/CsoCourse.cpp:110-115` ; `TC:126-136` | scénario écrit à la main |
| 6.4 | Toast « Barre au {n°} · +4 · {cause} » et textes de cause | partiel | compile | `SG/StridesCourse.cpp:87` ; `SC/JumpModel.cpp:151-161` | texte « {n°} barre +4 · appel {id} » ; aucun texte de cause (identifiants seulement) |
| 6.4 | Barres au sol jusqu'à la fin, remise à la manche suivante ou hors mission > 60 m | partiel | compile | — | jamais remises |

### 2.7 Refus (§7)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 7.1 | Décision (largeur, toward > 0,3, v > 0,5 ; zone refuse, marge < −0,3 côté près, lent et nez < 1,5 m ; oblique : écart < v²/16 + 0,3) | partiel | compile | `SG/StridesHorse.cpp:249-259` | seul cas : première barre à < 0,55 m de l'origine ; branche `else StartJump(F)` (`:257`) = saut automatique sans équivalent web, inatteignable car première barre < 0,55 implique zone refuse (`SC/JumpModel.cpp:92`, déduit du code) |
| 7.1 | Freinage jusqu'à l'arrêt, cabré 1,1 s, `neigh` | absent | aucun | `SG/StridesHorse.cpp:167`, `256` | vitesse mise à 0 d'un coup, 1,2 s sans animation |
| 7.1 | Refus tout contre : barre avant emportée dans le sens de la marche (spécification corrigée en T3, §7.1), remontée 3 s plus tard | absent | aucun | — | — (historique : porté en T3, voir l'inventaire `cso.refus-decision`) |
| 7.1 | Dérobade : rien compté ; SAUT → « Trop tôt » | partiel | compile | `SG/StridesCourse.cpp:73` | rien compté (conforme) ; SAUT lance un saut libre, ou un saut vers l'obstacle si l'écart latéral < 2,5 m |
| 7.2 | Recomptage seulement après détour (> profondeur/2 + 6 m) ou 5 s | absent | aucun | `SG/StridesHorse.cpp:228` | seul délai : 1,2 s |
| 7.2 | Refus compté (chrono lancé, face, attendu) +4 | partiel | teste | `SC/CsoCourse.cpp:116-120` ; `TC:137-144` | scénario écrit à la main |
| 7.2 | Refus sur un élément B : reprise au A | partiel | teste | `SC/CsoCourse.cpp:121-126` ; `TC:141-142` | scénario écrit à la main |
| 7.2 | Cadence remise à 0 sur refus compté | partiel | compile | `SG/StridesHorse.cpp:167`, `256` | remise à 0 à tout refus, compté ou non |
| 7.2 | Toast « Refus au {n°} · +4 », hints 3500 ms (double / demi-tour) | partiel | compile | `SG/StridesCourse.cpp:93-94` | toast émis même si le juge ignore le refus ; hints absents |
| 7.2 | Élimination au 2e refus | partiel | teste | `SC/CsoCourse.cpp:127` ; `TC:145-146` | texte « 2e refus : éliminé » au lieu de « 2e refus : éliminé du parcours. » ; pas de grand message |

### 2.8 Chrono (§8)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 8.1 | Départ par la ligne, par les 45 s, ou départ lancé | partiel | compile | `SG/StridesCourse.cpp:47-51` | ligne seule (6 m) |
| 8.1 | Obstacles sautés avant le départ ignorés, hint 3000 ms | partiel | teste | `SC/CsoCourse.cpp:105`, `111` ; `TC:120-121` | hint absent |
| 8.2 | Écoulement : dt de mission, nul en pause / téléphone / dialogue | partiel | teste | `SG/StridesCourse.cpp:53` ; `SG/StridesHorse.cpp:299-305`, `373` | dt compté dès l'image du départ (web : à partir de l'image suivante, `courses.js:291-303`) ; gel en pause et téléphone image par image comme le web (T8, `ORA/cso_freeze.json`, `Strides.Cso.Controls`) ; pas de dialogue |
| 8.3 | Affichage `dec(t, 2)` (virgule) `/ 64 s`, `Départ {ceil(bell)} s · accordé 64 s`, ambre en dépassement | partiel | compile | `SG/StridesCourse.cpp:105-114` | « %.2f s · %d pts · prochain : %s » : point décimal, pas de « / 64 s », points sans pénalités de temps (web : en direct, `courses.js:148`), pas d'ambre, pas de décompte |
| 8.4 | Pénalités de temps (1 par seconde entamée) | identique_prouve | teste | `SC/CsoCourse.cpp:83-86` ; `ORA/cso_course.json` `timeFaults` ; `TC:103` | `points()` (`:136-139`) reprend la formule, couvert par un seul scénario manuel (`TC:134-135`) |
| 8.4 | Élimination : descente de cheval | partiel | teste | `SG/StridesCourse.cpp:97-100` ; `SG/StridesRider.cpp:118` ; `TC:154-158` | seulement après le départ (web : à chaque image, y compris avant, `courses.js:322`) ; descente impossible en l'air ; message différent |
| 8.4 | Élimination : effets (`bell(2)`, `ÉLIMINÉ` / motif 2600 ms, fin immédiate et bilan) | absent | aucun | `SG/StridesCourse.cpp:54`, `99` | ligne de texte seulement |
| 8.5 | Erreur de parcours (une fois par obstacle, son, toast, hint 3500 ms) | partiel | teste | `SC/CsoCourse.cpp:107`, `113` ; `TC:131` ; `SG/StridesCourse.cpp:86` | comptée à chaque passage ; message nommant l'obstacle sauté au lieu de l'attendu ; ni son ni hint |

### 2.9 HUD (§9)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 9 | Classes `cso-ctl` / `cso-sober` / `cso-on` et masquages | partiel | testé | `SC/CsoHud.cpp:42`, `SG/StridesHUD.cpp:53`, `SG/StridesTouchControls.cpp:310-328` | table des masquages du navigateur rejouée (T7) ; en épreuve SAUT et pause seuls (T8) ; joysticks du moteur retirés |
| 9 | Tableau `.cso-board` (chrono, accordé, points, prochain, style) | partiel | testé | `SG/StridesCsoHud.cpp:567` | UMG, montages `cso/hud-*` ; police du moteur (Geist non embarquée), « ▸ » dessiné |
| 9 | Crans de cadence (6 barres, 2 s après réglage) | partiel | testé | `SC/CsoHud.cpp:205` | logique rejouée (`cso_hud.json`), montage `cso/hud-cadence-*` ; fondu non comparé image par image |
| 9 | Objectif masqué en épreuve | partiel | testé | `SC/CsoHud.cpp:42` | HUD de débogage masqué en mode concours ; carte d'objectif non portée |
| 9 | Astuce `.hint` | partiel | testé | `SC/CsoHud.cpp:145-160` | rejouée et affichée (texte riche) ; logement dans la carte d'objectif non dessiné |
| 9 | Toasts (2 au plus, 1 si h ≤ 420 px, 3200 ms) | partiel | testé | `SC/CsoHud.cpp:126` | rejoués (deux toasts : séquence synthétique) ; police, ombre portée |
| 9 | Grand message (titre, sous-titre, `pop` 0,5 s) | partiel | testé | `SC/CsoHud.cpp:135` | rejoué, montages ; animation non comparée image par image |
| 9 | Bouton SAUT 104 × 104, 6 px du bord, 8 px du bas | partiel | joue_ecran | `SG/StridesTouchControls.cpp:211-238`, `261`, `413-527` ; `Strides.Cso.Controls`, `Strides.Cso.Aids` ; `cso/hud-*`, `cso/cmd-*`, `cso/aide-*` | boîte affichée = boîte du web (104 px CSS, réduits à 91,5 px par le bloc d'actions sous 420 px) ; icône rendue par le navigateur ; anneau, halo, pastille et libellés d'appel portés (T9, styles relevés par état) ; état enfoncé non porté |
| 9 | Bouton pause en haut à droite | partiel | joue_ecran | `SG/StridesTouchControls.cpp:239-260` ; `cso/hud-*`, `cso/cmd-*` | boîte, fond, rayon, ombre et icône du web ; ouvre la carte Pause (bindButton) |
| 9 | Éléments masqués en épreuve (portefeuille, téléphone, BOOST, sifflet, cardio, endurance, action) | partiel | testé | `SG/StridesTouchControls.cpp:310-328` | MONTER, ALLURE ±, SAUVER, CHARGER, TÉLÉPHONE, MISSION masqués en épreuve (T7, T8) |
| 9 | Notifications retenues puis relâchées | absent | aucun | — | — |

### 2.10 Caméra (§10)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 10 | Caméra de concours (back 6,6, up 3,4, lookAhead 9, lookUp 1,1, fenceBias, lead 0,18, yawK / yawAcc, posK / yK, jumpFollow 0,12, minBack, fenceClear, enter 1,2 s) | identique_prouve (T6) | teste | `SC/CsoCamera.cpp:36-134`, `SG/StridesHorse.cpp:446-550` | pas porté ligne à ligne, oracle « cc » rejoué à 5,7e-14 m près, montages aux 6 instants ; entrée depuis la perche du portage (caméra du monde ouvert non portée) |
| 10 | FOV 58° vertical fixe | identique_prouve (T6) | teste | `SG/StridesHorse.cpp:68-82` | axe Y maintenu + AspectRatio 1 : M11 = 1/tan(FOV/2) mesuré sur la projection du moteur ; amorti et paliers de 0,05° portés |
| 10 | Perche anti-collision (1,0 → 6,6 m, pas 0,4, hauteur 2,2 → 3,4, ≥ 0,8 m du sol) | partiel (T6) | teste | `SC/CsoCamera.cpp:72-102`, `SG/StridesHorse.cpp:459-466` | règles prouvées sonde réinjectée ; sonde du jeu = sphère de 0,45 m sur le canal Camera, pas les colliders du web |
| 10 | Verrouillage derrière le cavalier, sans orbite ni tremblement | identique_prouve (T6) | teste | `SG/StridesHorse.cpp:499-550` | caméra posée en absolu par le cœur à chaque image, aucune entrée de l'orbite |
| 10 | Caméra du monde ouvert rétablie à la sortie (FOV 60 + vitesse, 6,6 m, 2,35 m) | absent | aucun | `SG/StridesHorse.cpp:489-497` | coupe franche vers la perche du SpringArm (état commun de `camera.js:270-282` non porté) |

### 2.11 Arrivée et bilan (§11)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 11.1 | Arrivée : points = fautes + pénalités de temps | partiel | teste | `SC/CsoCourse.cpp:136-139` ; `TC:135` | scénario écrit à la main |
| 11.1 | `SANS FAUTE !` / `{n} POINTS` / `1 POINT`, sous-titre `{dec(t,2)} s`, 2600 ms | identique_prouve | joue_ecran | `SC/CsoRun.cpp` (courseUpdate) ; HUD UMG (T7) | T4 / T7 : appel `big` identique (cso_runs/) ; T11 : montage `bilan-1-sans-faute-*` |
| 11.1 | Sons d'arrivée, public en liesse 3,5 s | absent | aucun | — | — |
| 11.2 | Classement simulé (`simulateField`, `mulberry32`, `rankResults`) | identique_prouve | teste | `SC/Ranking.cpp:21-111` ; `TC:1723` | T11 : `ORA/cso_ranking.json` rejoué à l'identique ; marge 1e-9 et tri stable non départagés (mutations déclarées) |
| 11.2 | Comparaison de résultats (`compareResults`) | identique_prouve | teste | `SC/CsoCourse.cpp:87-92` ; `TC:104-108` | 3 cas seulement ; le bilan web trie par `rankResults` (`ranking.js:23-25`), absent |
| 11.2 | Carte de bilan (kicker, titre, grille, tableau 8 premiers + joueur) | partiel | joue_ecran | `SC/Ranking.cpp:113-185`, `:200-263` (mise en page) ; `SG/StridesCsoScreens.cpp:586-765` ; `TC:1775`, `TC:1851`, `TC:2160` | T11 : textes identiques (`ORA/cso_result.json` : 30 cartes ; canal « bl » : 25 cartes) ; contrôle adverse : mise en page par le flux CSS (`ORA/cso_result_layout.json`, 60 vues, 3 876 boîtes à 0,088 px), lignes de la grille du moteur identiques au web (60 vues), colonnes du tableau à 8,2 px au plus (police du moteur étalonnée) ; montages `bilan-2`, `bilan-3`, `bilan-4` ; dotation non portée |
| 11.2 | Boutons `Recommencer`, `S'entraîner`, `Quitter l'épreuve` | partiel | teste | `SC/CsoRun.cpp:265-279` ; `SG/StridesCourse.cpp:217-224` ; `Strides.Cso.Result` | T11 : Recommencer et Quitter identiques (t11-manche-2, t11-refus) ; S'entraîner : `cso_warmup` absent, rien n'est lancé |
| 11.2 | Meilleur temps `bestTimes.cso_train` = temps + pénalités | partiel | teste | `SC/CsoRun.cpp:242-253` ; `SG/StridesSaveSubsystem.cpp:106-125` | T11 : écrit à l'étape d'enregistrement sans F5, égal à `ep.bt` du web (6 cas) ; pénalités de temps, élimination et meilleur temps existant non départagés |
| 11.2 | Classement en ligne `reportScore` | absent | aucun | — | — |
| 11.3 | Concours, défi v6, missions d'histoire | absent | aucun | — | — |

### 2.12 Sons (§12) et recette (§13)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 12 | 14 événements sonores (notify, applause, bell, tone, snort, hoof, landing, railTouch, railFall, thud, fault, crowdOoh, neigh, cheer) et ambiance public | partiel | teste | T12 : `SC/CsoAudio.cpp`, `SG/StridesCsoAudio.cpp`, `Content/Audio/Cso` (19 `USoundWave`) ; `testCsoSounds`, `testCsoCrowd`, `Strides.Cso.AudioAssets`, `Strides.Cso.Audio` | journal identique au canal « audio » (94 exécutions ; légères : sons du cheval tirés des événements de l'oracle) ; compresseur du bus maître non porté, une seule réalisation du hasard, écoute non faite (`audio.concours`) |
| 13 | Captures Unreal aux poses de la recette (844 × 390) | partiel | joue_ecran | T1 à T12 : `-StridesShots=cso`, `SG/StridesShots.cpp` ; `unreal/docs/parite/cso/` (montages côte à côte des 13 étapes, sauf le concours complet) | table des étapes : `unreal/docs/validation-mac-2026-11-20.md` ; captures antérieures à C1 : cheval gris |

---

## 3. Corrections et compléments à la §14 de la spécification

- §14 est exacte sur tous ses constats « partiel » / « absent », vérifiés dans le code (lignes citées conformes), et
  sur le résultat des tests du cœur (4 944 vérifications, 0 échec, rejoué ici).
- À ajouter : barre fantôme sur appui précoce, saut oblique compté franchi, saut libre en épreuve, toast de refus émis à
  tort, erreur de parcours mal nommée et non dédoublonnée, téléphone qui ne gèle pas le chrono, image de départ comptée,
  hauteurs hors épreuve, descente de cheval non éliminatoire avant le départ, `kbdRamp` inutilisé.
- Trous de preuve dans l'existant identique_prouve : chemin JSON du tracé non testé (le test utilise `poleDesign()` recopié),
  repères z et rot non comparés, `compareResults` sur 3 cas, `points()` hors oracle.
- Correction de `cso-spec.md` §7.1 (19/11/2026, tranche T3) : sur un refus tout contre, la barre avant part dans le sens
  de la marche du cheval (`obstacles.js:459`, sens +1 quand il arrive du côté s < 0), pas vers lui ; vérifié par les
  scénarios `refus`, `t3-refus-62` et `t3-tout-contre-remonte` (position z de la barre croissante).
- `README.md:33` (« Parcours du Pôle … classement : portés, testés et branchés ») surestime : classement simulé absent,
  jugement couvert par des scénarios écrits à la main, aucun oracle de bout en bout.

---

## 4. Plan de tranches d'implémentation

Principes communs :
- La logique va dans `StridesCore` (C++20 sans type Unreal), portée ligne à ligne du JS ; le module de jeu ne fait
  qu'appeler, convertir (cm, axes, `SGh/StridesUnits.h`) et afficher.
- Toute valeur vient d'un export par script (`EXP` pour les modules purs importables par `vite-node` ; un exporteur
  Playwright pour ce qui n'existe qu'à l'exécution du jeu : classes `Obstacles`, `FollowCamera`, DOM, audio). Les
  constantes non exportées du JS (`NOSE`, `REF`, `OVERRUN`, `HIND_TRAIL`, matériaux de `courseAids.js`) sont lues dans le
  jeu en cours d'exécution ou extraites du source par le script, puis recoupées par un oracle de comportement ; jamais
  recopiées.
- Preuve d'identité : oracle JS rejoué par `TC` (et, si utile, un test Automation miroir dans
  `SG/Tests/StridesCoreTests.cpp`). Preuve visuelle : capture web (Playwright, 844 × 390, `deviceScaleFactor` 1, pose
  identique à `tests/e2e/cso-shots.mjs`) et capture Unreal à la même pose, montées côte à côte dans
  `unreal/docs/parite/cso/<étape>.png`.
- Chaque tranche se termine par : `cmake --build` + `ctest` de `unreal/core` (secondes), compilation UBT incrémentale
  (environ 1 min), tests Automation, captures (rendu GPU réel sur le Mac mini, pas `-nullrhi`).

### T1. Banc de parité CSO (oracles de scénario et captures jumelles)

- **Objectif** : l'outillage dont dépendent toutes les tranches, et la fermeture des trous de preuve existants.
- **Critère d'acceptation** : (1) `scripts/unreal/export-cso-runs.mjs` produit deux fois de suite un
  `ORA/cso_runs.json` identique octet pour octet ; (2) `TC` charge `cso_runs.json` (contrôle de schéma) et trace le
  design lu dans `Content/Data/cso_course_pole.json` en le comparant à l'oracle, repères x, z, rot, s compris ; (3) une
  pose (vue aérienne de la carrière) capturée côté web et côté Unreal en exactement 844 × 390 px (vérifié par
  `sips -g pixelWidth -g pixelHeight`), montage présent dans `unreal/docs/parite/cso/`.
- **Fichiers** : créer `scripts/unreal/export-cso-runs.mjs` (Playwright via `scripts/unreal/pw-chrome.mjs`, injection
  de `tests/e2e/autopilot.js`, pas fixe 1/30 s, langue `?lang=fr` puis `en`), `scripts/unreal/parite-montage.py` ;
  modifier `SG/StridesShots.cpp`, `SGh/StridesShots.h` (mode `-StridesShots=cso` : lit `unreal/docs/parite/cso/poses.json`,
  place cheval et `ACameraActor` à l'œil / cible / FOV web, FOV vertical converti en horizontal), `TC`, `EXP` (cas
  supplémentaires `compare` et `timeFaults`, design complet).
- **Oracle** : format `cso_runs.json` = scénarios { entrées par image (move x / y, keyMove, jump, modifiers), puis par
  image : état du cheval, état de l'épreuve, événements du bus, appels `hud.*` (texte, durée), appels `audio.*` (nom,
  arguments), caméra (œil, cible, FOV), transformées des barres }. T1 fournit le format et un scénario d'abord droit ;
  les tranches suivantes ajoutent leurs scénarios.
- **Données** : `poses.json` (pose du cheval, œil, cible, FOV vertical, viewport) écrit par l'exporteur web.
- **Preuve visuelle** : vue aérienne de la carrière (pose nouvelle, aucune capture web existante pour l'étape 2 de la
  recette).
- **Dépendances / risques** : aucune dépendance. Rendu SwiftShader lent côté web (minutes) ; écran Retina : une fenêtre
  `-ResX=844 -ResY=390 -windowed` peut produire 1688 × 780 px (à confirmer, le critère de taille le détecte) ; captures
  Unreal à faire session ouverte (runbook `banc-test-mac-mini`) ; outil de montage gratuit à confirmer sur le Mac mini
  (Pillow ou `ffmpeg hstack`).
- **Livré (19/11/2026)** : `cso_runs.json` (scénario « droit », fr et en, 298 images chacun) identique sur trois
  exécutions ; `TC` compare le tracé lu par `parseCourseFile` (fonction du jeu) à l'oracle et contrôle le schéma des
  scénarios ; `unreal/docs/parite/cso/carriere-aerienne.png` (web à gauche, Unreal à droite). Constats pour la suite :
  (1) le joueur local d'UE 5.8 maintient l'axe **Y** par défaut (`BaseEngine.ini:2900`) : la capture impose l'axe X ;
  le FOV 55 de `SG/StridesHorse.cpp:63` n'est donc probablement pas horizontal (§1 point 8, à mesurer en T6) ;
  (2) sans `DEVELOPER_DIR` exporté, le jeu se bloque sur une fenêtre « Xcode introuvable » à l'initialisation Metal ;
  (3) déterminisme web : remettre à neuf l'animation du cheval (`anim`, `anim._a`, `pjl.ph`) et mettre à jour les
  matrices monde après chaque `g.update` (ce que fait le rendu), sinon les foulées (`horse:step`) varient ;
  (4) le canal caméra n'enregistre pas encore la distance de perche (à ajouter en T6).
- **Format découpé (R0, 19/11/2026)** : l'ancien fichier unique `ORA/cso_runs.json` (42 Mo, recommité à chaque
  tranche) est remplacé par le dossier `ORA/cso_runs/` : `index.json` (en-tête des canaux, schéma
  `strides.oracle.cso_runs/2`, liste des exécutions) et un fichier par scénario et par langue, `<id>.<lang>.json`
  (le plus gros ~4 Mo), écrits par `scripts/unreal/cso-runs-io.mjs` ; un fichier inchangé n'est pas réécrit. Les
  mentions de `cso_runs.json` ci-dessous datent d'avant ce découpage ; mode d'emploi : `unreal/docs/parite/README.md`.
  Écart de `t3-refus-5s` (événement `horse:exhausted` de `rider230`, voir T4) : cause établie le 19/11/2026. Les
  cavaliers du décor (`Ambient.rider`, `npcs.js:552-560`) gardaient l'état atteint pendant les images jouées en temps
  réel avant `stopLoop` : `rider230` relevé au `setup` à 0,447 puis 0,522 m/s selon l'export, épuisement à l'image
  428, 429 ou 430. L'exporteur les remet à leur état d'apparition (point 0 de leur trajet, arrêt, endurance pleine) :
  trois exports isolés identiques à l'octet, épuisement à l'image 432.

### T2. Cheval de concours dans StridesCore (conduite intégrée, visée, déclenchement du saut)

- **Objectif** : remplacer la conduite et le saut de `AStridesHorse::Tick` par un pas pur `strides::CsoHorse` identique à
  `csoRideStep` + branche concours de `horse.js` + `Obstacles.target()` / `timing()`.
- **Critère d'acceptation** : `TC` rejoue au moins 8 scénarios de `cso_runs.json` (abord droit 6,2 m/s, virage serré,
  rampe clavier, Ctrl / Alt, appui à 10 m, appui en bonne zone, appui à 3 m/s, abord à 70°) sans écart > 1e-6 m / rad /
  m/s par image et avec la même suite d'événements (`horse:jump`, `horse:jumpEarly`, `horse:tooSlow`) ; dans le jeu, un
  appui à 10 m ne déclenche plus de saut.
- **Fichiers** : créer `SCh/CsoHorse.h`, `SC/CsoHorse.cpp` ; modifier `SG/StridesHorse.cpp` (délégation ; suppression de
  `FenceAhead` pour la visée, du saut libre et du saut automatique en épreuve ; démo F8 gardée derrière un drapeau de
  développement), `SGh/StridesHorse.h`, `SG/StridesCourse.cpp` (liste d'obstacles pour la visée), `TC`,
  `unreal/core/CMakeLists.txt`.
- **Logique à porter** : cadence initiale arrondie, rampe clavier, gel pendant cabré / refus, accélération 4,5 / 3,6 / 9,
  freinage `brake(dist)`, lacet exponentiel puis borné, `airTurn` sur la rotation effective, pas de direction pendant le
  cabré, progression du saut par dt / jumpDur, perte à la réception, `startJump` (trop lent, refus engagé, règle des
  1,9 × L0, zone refuse et x ≥ 0), point de référence aux épaules, `target()` et `timing()`.
- **Oracle** : canal « cheval » de `cso_runs.json` ; grille `ORA/cso_target.json` produite dans le navigateur
  (`g.obstacles.target(h)` et `timing(h)` pour chaque obstacle × distances 0 à 14 m × angles 0 à 75° × décalages latéraux).
- **Données** : constantes `REF`, `NOSE`, `OVERRUN` et `HORSE.jumpDuration` / `minJumpSpeed` exportées ; puissance du
  cheval (`jumpPower`) relevée dans le jeu pour chaque scénario.
- **Preuve visuelle** : capture « appui trop tôt » (bouton et cheval) reportée à T9 ; ici preuve par oracle seulement
  (faite en T9 : montages `cso/aide-trop-tot-844x390.png` et `aide-trop-tot-667x308.png`).
- **Dépendances / risques** : T1. Accumulation d'écarts d'arrondi sur des centaines d'images (`Math.exp` / `std::exp`
  peuvent différer d'un ulp) : tolérance relative et rejeu image par image avec recalage optionnel à documenter ; la
  puissance dépend de l'équipement et de l'état, non portés (relevés comme entrées de l'oracle, port complet ailleurs).
- **Livré (19/11/2026)** : `SCh/CsoHorse.h`, `SC/CsoHorse.cpp` (`csoHorseStep` = `csoRideStep` + `Horse.update` jusqu'au
  déplacement ; `startJump`, `brake`, `refuse` du cheval ; `makeCsoObstacle`, `csoTarget`, `csoTiming`, `csoRefuse` de
  `obstacles.js` ; `keyboardMove` de `input.js` ; `csoApproachRefusal` = décision de refus à l'abord extraite de
  `updateHorse`, seule partie de T3 avancée). `scripts/unreal/export-cso-runs.mjs` relève un canal « ch » en pleine
  précision (entrées vues par `player.update` et `horse.update`, état complet, corrections extérieures au pas du cheval
  signalées, aide et cible après chaque image) et 8 scénarios « pose » après la cloche (`bonne-zone`, `virage-serre`,
  `rampe-clavier`, `ctrl-alt`, `appui-10m`, `appui-3ms`, `abord-70`, `refus`), plus `ORA/cso_target.json` (8 980 poses) ;
  deux exécutions donnent des fichiers identiques octet pour octet ; « droit » est inchangé hors des nouveaux champs.
  `REF`, `NOSE`, `OVERRUN`, `HIND_TRAIL` et la largeur 3,8 m sont extraits du source par `EXP` dans
  `Content/Data/cso_horse.json`. `TC` (`testHorseRuns`, `testTarget`) : les 8 scénarios requis sont rejoués en chaîne
  sans recalage, écart maximal 8,9e-16 (cap) et 4,4e-16 (saut), mêmes événements ; le scénario `refus` est recalé aux 9
  images où `updateHorse` (T3) agit ; ctest 11 312 vérifications, 0 échec ; quatre mutations du portage sont détectées.
  Jeu : `AStridesHorse` délègue au cœur (`FenceAhead`, saut libre et saut automatique en épreuve supprimés ; refus à
  l'abord par le cœur ; démo F8 hors `UE_BUILD_SHIPPING`, appui selon la règle de `tests/e2e/autopilot.js`). Tests moteur
  `Strides.Parite.CsoHorse` (miroir) et `Strides.Cso.HorseInGame` (acteurs réels dans un monde de test : appui à 10 m
  sans saut, appui en bonne zone suivi du saut, refus sans appel) : Result={Success}. Démonstration `-StridesShots` en
  rendu GPU (Metal, bureau) : parcours complet « Terminé : 0 pts en 60.42 s ». Restent hors T2 : jugement des barres au
  passage, glissade, garde-fou du nez, comptage unique des refus (T3) ; affichage « Trop tôt » / « Trop lent » (T7, T9) ;
  puissance sans équipement ni état ; commandes de concours toujours actives hors épreuve (T4, T10).
- **Contrôle adverse et corrections (19/11/2026)** : la livraison revendiquait des branches qu'aucun oracle n'exerçait
  (rotation en l'air `airTurn`, plafond de ralentissement de 9 m/s², valeur du freinage de refus, tolérance latérale de
  0,35 m, refus de `startJump` si la barre avant est encore devant). Ajouts, tous exportés du jeu en cours d'exécution par
  `EXP` : scénarios `virage-en-lair` (joystick à droite pendant le vol), `survitesse` (cheval posé à 9,6 m/s, cadence
  bornée à 8), `abord-61` (abord hors de l'angle de saut, refus au seuil v²/16 + 0,3), `appel-pres` (perte d'élan
  plafonnée à 4 %) ; dans `ORA/cso_target.json`, 2 240 poses décalées de 2,1 et −2,2 m, 2 740 appuis (`Horse.startJump`
  appelé seul, liste `press`) et 960 refus décidés (`Obstacles.refuse` appelé seul, liste `refuse`). `TC` compare en plus
  le freinage de chaque refus décidé dans la chaîne du jeu (`csoApproachRefusal` puis `csoRefuse`) et vérifie dans
  l'oracle des témoins de chaque branche ; `csoStartJump` est exposé pour le test. `scripts/unreal/mutations-cso-horse.py`
  applique 14 mutations à une copie de `CsoHorse.cpp` : toutes détectées (dont les six que le contrôle avait vues passer).
  Les 10 scénarios et les 8 980 poses d'origine sont inchangés à l'octet près. ctest : 12 267 vérifications, 0 échec.
  `Strides.Cso.HorseInGame` tourne désormais dans une instance de jeu autonome (données de `Content/Data`, puissance
  exacte en double au lieu de float) et appuie par le contrôleur du joueur (`TouchJump`, même gestionnaire que la touche
  Espace) ; la frappe de la touche par Enhanced Input et la capture restent hors test.

### T3. Obstacles : jugement au passage, refus, chute des barres (StridesCore)

- **Objectif** : porter `Obstacles.updateHorse`, `_judge`, `_count`, `refuse`, `knock` et la chute déterministe dans
  `strides::CsoFences` ; `AStridesFence` affiche les transformées calculées.
- **Critère d'acceptation** : `TC` rejoue au moins 10 scénarios (sans-faute, appel loin sur oxer avec deux barres, appel
  près en montée, faute des postérieurs différée de 1,1 m, effleurement, refus au freinage à 6,2 m/s, refus lent, refus
  tout contre avec barre emportée et remontée 3 s, refus oblique, second refus après détour ou 5 s) : mêmes événements
  `obstacle:clear` / `obstacle:fault` (marge à 1e-6, cause), même comptage, transformées des barres à 1e-6 m / rad par
  image ; dans le jeu, un abord à 70° n'est plus compté franchi.
- **Fichiers** : créer `SCh/CsoFences.h`, `SC/CsoFences.cpp` ; modifier `SG/StridesFence.cpp` / `.h` (une composante par
  barre, transformées venant du cœur), `SG/StridesCourse.cpp` (`JumpLanded` et `Refused` remplacés par les événements du
  cœur), `SG/StridesHorse.cpp` (refus = freinage puis cabré 1,1 s), `TC`.
- **Logique à porter** : faces avant / arrière, jugement interpolé entre deux images, seuils −0,06 / 0,04, une faute par
  élément, causes `short` / `angle`, file des barres en attente (1,1 m, 8 m), refus (toward, gap, v²/16 + 0,3, marge
  −0,3 côté près), recomptage (détour, 5 s), barre emportée sur refus tout contre, physique de chute (G, taquets, élan,
  rebond −0,28, glisse e^(−2,6 dt), roulement, fin au repos après 0,5 s), vibration d'effleurement.
- **Oracle** : canaux « obstacles » et « barres » de `cso_runs.json`, scénarios enregistrés avec les contacts des membres
  désactivés (qualité `low` ou personnages `classic`, condition de `realistic.js:878` à confirmer).
- **Données** : constantes du jugement relues dans le jeu ; `HIND_TRAIL` exporté.
- **Preuve visuelle** : séquence de chute à 0,1 / 0,3 / 0,6 / 1,5 s après le contact, web et Unreal, même pose (étape 6
  de la recette ; capture web existante `7-barre-au-sol.png` en référence de pose finale).
- **Dépendances / risques** : T2 (état du cheval, cible). Les contacts des membres (WildMesh) restent hors de cette
  tranche : ils exigent la pose animée du cheval PJL (`pjlHorse.js:674-700`) identique au web ; sans eux, l'Unreal juge
  comme le web en qualité basse seulement (écart à garder visible dans l'inventaire).

- **Livré (19/11/2026)** : `SCh/CsoFences.h`, `SC/CsoFences.cpp` (`csoFencesUpdateHorse` = `updateHorse` entier : détour,
  résultat différé, barres en attente, comptage à l'arrêt, décision, barre emportée, garde-fou du nez, glissade ;
  `_judge`, `_finishPass`, `_count`, `knock`, `_rest`, effet de `limbContact` ; `csoFencesUpdate` = `update` : chute,
  vibration, remises). Le passage (`_pass`) et le dernier refus compté (`_refusal`) sont dans `CsoHorseState`.
  `scripts/unreal/export-cso-runs.mjs` : 13 scénarios « pose » nouveaux en personnages classiques (`?classic` : pas de
  cheval WildMesh, donc `_limbJudged` faux ; condition lue dans `realistic.js:876-879`) : `t3-sans-faute`,
  `t3-oxer-loin`, `t3-pres-montee`, `t3-posterieurs`, `t3-effleurement`, `t3-faute-limite` (marge −0,075),
  `t3-effleurement-haut` (marge +0,026), `t3-refus-62`, `t3-tout-contre-remonte`, `t3-refus-lent`, `t3-refus-oblique`
  (66°), `t3-refus-5s`, `t3-glissade` ; canal « ch » complété (`oe` événements d'obstacle en pleine précision, `ob`
  passage / dernier refus / barres hors repos avec l'état interne de chaque chute, `lc` contacts des membres, `he`
  événements émis pendant `horse.update`, entrées `lj`, `ma`) ; `setup.rails` des scénarios « pose » corrigé (il
  donnait l'état final). Les 14 scénarios antérieurs sont inchangés hors des nouveaux champs (vérifié champ à champ) ;
  `cso_target.json` inchangé à l'octet ; deux exécutions complètes de l'exporteur donnent des fichiers identiques octet
  pour octet. `TC` (`testFenceRuns`) rejoue les 27 exécutions (26 scénarios, « droit » en
  fr et en) en chaîne (pas du cheval, contacts relevés, `updateHorse`, `update`) : 25 scénarios sans recalage ni écart
  (barres ≤ 1,1e-14 en interne, ≤ 5e-7 contre le canal « rails » arrondi au millionième), dont les 14 requis ; `t3-tout-contre-remonte` sans écart mais recalé aux 13
  images où le cheval frôle une aile (collisions du décor, non portées). ctest 18 853 vérifications, 0 échec ;
  `scripts/unreal/mutations-cso-fences.py` : 37 mutations, 34 détectées, 3 attendues non détectées (branches qu'aucun scénario n'exerce, listées dans le script). Jeu : `AStridesFence` affiche une composante par barre à la
  transformée du cœur (`RailTransform`, `ApplyRails` ; mur = bloc fixe + barre du dessus), `AStridesCourse` reçoit les
  événements du cœur (`HandleFenceOut` ; `JumpLanded` et `Refused` supprimés) et fait tourner `csoFencesUpdate`
  (`UpdateFences`), `AStridesHorse::TickCso` appelle `csoFencesUpdateHorse` après le pas du cheval (membres non jugés).
  Tests moteur `Strides.Parite.CsoFences` (miroir) et `Strides.Cso.FencesInGame` (transformée vérifiée par la
  géométrie ; abord du 4A à 70° : appui sans saut, refus, jamais compté franchi ; sans-faute au 3 ; refus tout contre au
  3 avec barre affichée à la transformée du cœur) : Result={Success}, comme les 9 autres tests Strides. Preuve
  visuelle : `unreal/docs/parite/cso/chute-barre-0_1s.png`, `-0_3s`, `-0_6s`, `-1_5s` (chute de la barre du 3 touchée en
  montée, `t3-pres-montee`, même caméra, 15 h, 844 × 390 de chaque côté ; la partie jouée pendant les captures web est
  identique à l'oracle image par image ; côté Unreal, la barre est renversée et tombée par le cœur avec les paramètres
  du contact web, valeurs identiques dans le journal). Constats : (1) la spécification disait la barre emportée « vers
  le cheval » ; le code l'envoie dans le sens de sa marche (`cso-spec.md` §7.1 corrigé) ; (2) aucun scénario exporté ne
  contient de contact de membre, même en qualité haute (`lc` vide) : l'effet `csoLimbContact` est porté sans oracle ;
  (3) branches non discriminées par l'oracle (mutations non détectées, détail dans l'inventaire) : résultat différé
  « 1,2 s au plus », détour suivi d'un nouveau refus en moins de 5 s, rebond au seuil 0,6 m/s ; (4) sur les montages, le cheval Unreal est à la position et à la hauteur du saut web mais dans une
  pose de clip non calée sur le saut, et l'obstacle n'a ni ailes ni barres basses (T5).

### T4. Déroulé d'épreuve, textes et formats (StridesCore `CsoRun`)

- **Objectif** : porter la machine d'étapes de `courses.js` (entrée, cloche, 45 s, départ lancé, lignes, chrono, points
  en direct, éliminations, erreur de parcours, sortie de piste) et les textes (clés FR, traductions EN, `T`, `dec`,
  ordinaux, pluriels) ; remplacer `CourseJudge` dans le jeu.
- **Critère d'acceptation** : `TC` rejoue au moins 8 scénarios en réinjectant la trajectoire et les événements d'obstacles
  enregistrés (sans-faute, départ lancé, cloche écoulée, erreur de parcours, deux refus, temps limite, descente avant le
  départ, obstacle sauté avant le départ) et reproduit exactement l'état (`started`, `t`, `next`, points, `eliminated`) et
  les appels `hud.big` / `toast` / `hint` (texte FR et EN, durée) et `audio.*` image par image ; `ORA/cso_text.json`
  (`dec`, ordinaux, pluriels, gabarits) passe à 100 %.
- **Fichiers** : créer `SCh/CsoRun.h`, `SC/CsoRun.cpp`, `SCh/Text.h`, `SC/Text.cpp` ; modifier `SG/StridesCourse.cpp` / `.h`
  (états, événements typés au lieu de chaînes en dur), `SG/StridesRider.cpp` (descente = élimination à tout moment de
  l'épreuve), `EXP` (table de textes, oracle de formats), `TC`.
- **Logique à porter** : `courses.js:446-539` et la boucle `update` (`:286-349`) : lignes à w/2 + 0,3 et cap au départ
  seulement, dt compté à partir de l'image suivant le départ, `BELL_DELAY`, départ lancé, éliminations à chaque image,
  dédoublonnage de l'erreur de parcours, reprise au A, sortie 2,6 s avec cadence → 1,9 m/s, dossard
  `40 + floor(game.time) % 50`.
- **Oracle** : canaux « épreuve », « hud » et « audio » de `cso_runs.json` ; `ORA/cso_text.json` par `EXP` (`dec` et
  gabarits appelés avec `LANG` fr puis en).
- **Données** : `Content/Data/strings_cso.json` exporté depuis les clés françaises du code et `src/i18n/en/gameplay.js`,
  `src/i18n/en/ui.js` (jamais recopié) ; `BELL_DELAY`, `maxRefusals`, `COURSE_SPEED` exportés.
- **Preuve visuelle** : aucune (logique et textes) ; les textes sont rendus en T7.
- **Dépendances / risques** : T1 pour le test (rejeu de la trajectoire web, indépendant de T2 / T3) ; branchement dans
  le jeu après T3. Extraction automatique des clés `t('…')` du code à fiabiliser (gabarits `T\`…\``).
- **Livré (19/11/2026)** : `SCh/CsoRun.h`, `SC/CsoRun.cpp` (`strides::CsoRun` = `courseSteps` de `courses.js` tel que
  `cso_train` le construit, plus le déroulé de mission qui l'exécute : `Run.next` / `update` / `text` de `missions.js`,
  étape `goto`) : étapes goto, capacité, présentation, entrée en piste (dossard, annonce, applaudissements, barres
  remises, n° 1 surligné, mode concours `pre`), cloche, parcours (lignes à w/2 + 0,3, cap au départ seulement, départ
  lancé, 45 s, chrono à partir de l'image suivant le départ, points en direct, écouteurs d'obstacle : obstacle attendu,
  sens, chrono pas lancé, erreur de parcours dédoublonnée, refus +4 avec reprise au A et cadence remise à 0, barre +4
  avec la cause ; éliminations à chaque image ; arrivée sans cap, grand message, sons, sortie 2,6 s avec cadence → 1,9),
  bilan (attente du choix ; « Recommencer » insère une manche neuve, sans oracle) ; appels `hud.*` / `audio.*` restitués
  dans l'ordre du jeu ; tableau de chrono (`hudInfo` et textes de `hud.js:407-412`). `SCh/Text.h`, `SC/Text.cpp` :
  `t` / `T` (table), `toFixed` du JS (développement décimal exact, égalité vers le haut), `dec`, `enOrdinal`, `ordinal`,
  `nth`, `ptsText`, gabarits. `EXP` : `Content/Data/strings_cso.json` (190 clés extraites par analyse syntaxique —
  `rollup/parseAst` — de `courses.js`, `missions.js`, `hud.js`, `jumpModel.js` ; anglais donné par `i18n.js` lui-même ;
  7 clés sans traduction, dont « · double ») ; `ORA/cso_text.json` (12 168 cas : `dec` sur 1 366 valeurs × 4 précisions,
  ordinaux, `nth` et `ptsText` évalués depuis leur source extraite, 190 gabarits, fr et en) ; objet `run` de
  `cso_course_pole.json` (`maxRefusals`, `pen`, `rail`, rayon de l'entrée de piste extraits du source, `BELL_DELAY`,
  `CSO_GATE`, `CSO_START`, `CSO_FINISH`, temps accordé ; le bloc `rules` écrit à la main en vient désormais, mêmes
  valeurs). `scripts/unreal/export-cso-runs.mjs` : canal « ep » (entrées de `Run.update` en pleine précision), fichier
  appelant de chaque appel `hud.*` / `audio.*` (`src`, pile d'appel), images « légères » (sans caméra ni « ch », sans les
  événements des chevaux du décor), et 10 scénarios `t4-*` en français et en anglais enregistrés depuis le lancement de
  l'activité (`t4-sans-faute` : parcours complet à la poursuite du tracé ; `t4-depart-lance` ; `t4-cloche` ;
  `t4-erreur-parcours` ; `t4-deux-refus` avec reprise du double au 4A ; `t4-temps-limite` ; `t4-descente` ;
  `t4-saute-avant-depart` ; `t4-arrivee-barre`, arrivée de biais à 3 m/s ; `t4-lignes` : ligne de départ franchie à 70°,
  puis à 3,95 m du milieu, puis à 3,65 m) ; les 27 exécutions
  antérieures sont inchangées hors des nouveaux champs (comparées champ à champ) et `cso_target.json` est identique à
  l'octet ; deux exécutions complètes de l'exporteur donnent un `cso_runs.json` identique octet pour octet (sha256
  45b3d102…) ; il passe de 8,6 à 31,3 Mo. `TC` (`testText`, `testCsoRuns`) : 12 168 cas de format, 0 écart ;
  22 exécutions (les 10 `t4-*` et « droit », fr et en) rejouées sans écart en réinjectant trajectoire, mode et
  événements d'obstacle : 21 146 images, 212 appels d'interface et 142 sons de `courses.js` identiques, étape, objectif,
  état (`started`, `t`, `next`, fautes, refus, `eliminated` et son motif, pénalités), mode de concours, 19 348 tableaux
  (données et textes) et cadence réécrite identiques image par image ; aucune clé demandée absente de la table ; ctest
  133 412 vérifications, 0 échec ; `scripts/unreal/mutations-cso-run.py` : 33 mutations de `CsoRun.cpp` et
  `Text.cpp`, toutes détectées (la marge de 0,3 m et le cap de 60° de la ligne de départ et le plancher de 1,9 m/s de la
  sortie ne l'étaient pas avant l'ajout de `t4-lignes` et de l'arrivée lente de `t4-arrivee-barre`) ; mutations du
  cheval (14 sur 14) et des obstacles (34 sur 37, les 3 mêmes branches non discriminées) inchangées. Jeu : `AStridesCourse` remplace `CourseJudge` par `CsoRun` (`Build` prépare règles et
  textes des données, `StartRun` lancé par `AStridesGameMode`, `TickRun` appelé par le cheval après le cœur et les
  obstacles, `HandleFenceOut` transmet les événements avec la cause traduite, barres remises à l'entrée en piste,
  journaux `HudLog` / `AudioLog`, tableau de chrono dans `StatusText`) ; `AStridesHorse::RunFrame` lit à chaque image si
  le cavalier est en selle (`StridesRider` n'appelle plus le parcours : descente éliminatoire à tout moment du parcours,
  avant le départ compris) ; record de `StridesSaveSubsystem` tiré de `CsoRun`. Tests moteur `Strides.Parite.CsoRun`
  (mêmes 22 exécutions par l'acteur du jeu, cause traduite par le jeu) et `Strides.Cso.RunInGame` (cheval, cavalier et
  parcours réels : entrée, annonce, cloche, ligne franchie, descente pendant le parcours → éliminé) : Result={Success},
  comme les 11 autres tests Strides (le test miroir `Strides.Parite.CsoHorse` saute les scénarios légers). Démonstration
  `-StridesShots` en rendu GPU (Metal, bureau, fenêtre 844 × 390) : la conduite automatique part de l'entrée de piste,
  le parcours s'ouvre (« Départ 45 s · accordé 64 s 0 pt ▸ 1 · Franchis la ligne de départ » à la première capture) et
  se termine sans faute (« 60,50 / 64 s 0 pt Arrivée ✓ » dans le journal).
  Constats :
  (1) les foulées des chevaux des cavaliers du décor varient d'une exécution à l'autre au-delà de 47 s de parcours
  (`t4-sans-faute`, deux exécutions complètes comparées : seuls ces événements et leur compte `e0` différaient) ; ils ne
  sont plus relevés dans les scénarios légers et sont exclus de la comparaison entre langues (`testRuns`), sans effet
  sur l'épreuve ; (2) le texte de cause d'une faute (`causeText`) voyage traduit dans l'événement ; (3) le déroulé web compte
  une 8e étape après le bilan (enregistrement du record, `activities.js`), hors de cette tranche (T11). Restent hors T4 :
  poteau et carte de présentation (le jeu entre en piste aussitôt), grille et dialogue de capacité (T10) ; carte de
  bilan et boutons (T11 : le jeu reste au bilan) ; interface d'épreuve (T7 : les appels vont au HUD de débogage) ; sons
  (T12) ; mot d'appel `jumpFeedback` (T7) ; gel en pause et téléphone (T8) ; commandes de concours toujours actives
  hors épreuve et hauteurs posées à la construction (T10) ; cible GPS ; joueur et langue d'une sauvegarde neuve.
- **Corrigé après le contrôle adverse (19/11/2026)** : (1) l'inventaire affirmait un « refus au 1 compté » dans
  `t4-temps-limite`, où aucun refus n'a lieu : phrase retirée. (2) Aucun oracle n'exerçait les gardes des écouteurs
  d'obstacle (`courses.js:221, 231, 243, 245`) : `EXP` relève maintenant `t4-gardes` (refus au 1 avant le départ, abordé
  à 66° de son axe ; refus au 3 quand le 1 est attendu ; refus au 1 et sauts du 1 et du 3 abordés par l'arrière ; le 1
  dans son sens, compté) et `t4-un-point` (arrivée à 64,57 s : « 1 POINT » / « 1 FAULT », puis le 8 sauté pendant la
  sortie de piste) ; `TC` exige qu'au moins un événement de l'oracle exerce chacune des 7 gardes (2 par garde). Les
  9 mutations de gardes sont dans `mutations-cso-run.py` : 6 détectées, 3 équivalentes par construction et déclarées
  (`ATTENDUES`) — refus « après l'arrivée » (l'arrivée exige next > n, l'obstacle attendu n'existe plus), refus et saut
  « après l'élimination » (`out()` termine l'étape dans la même image : `missions.js:230-233` → `end()` retire les
  écouteurs, `courses.js:352-354` ; portage : `update` → `next()`, `obstacleEvent` hors de l'étape de parcours ignoré).
  (3) Étape goto : oracle `ORA/cso_goto.json` (l'étape du jeu, `g.missions.active.steps[0]`, évaluée sur 52 points ×
  4 modes du joueur, fr et en : 416 cas) et scénario `t4-entree` (cheval posé à 127, 64, 46, 30 m ; pied à terre ;
  camion ; en selle à 5 m) ; consigne « au volant » portée (`CsoRunFrame.driving / inTruck / vehicle`,
  `csoGotoText` / `csoGotoDone`). La grille a révélé un écart d'un ulp entre `std::hypot` et `Math.hypot` de V8
  (994,99999999999989 au lieu de 995 : « 990 m » au lieu de « 1000 m ») : `jsHypot` (`StridesCore/MathUtil.h`) reproduit
  l'algorithme de V8 (Math.hypot de Safari non comparé, à confirmer ; les autres `std::hypot` de `CsoFences.cpp` et
  `CsoHorse.cpp` ne sont pas encore remplacés). (4) Canal « ep » : numéro surligné (dernier appel de
  `Obstacles.highlight`), remises des barres (`resetRails`) et `game.cheerT` relevés quand ils changent, comparés par `TC`
  (120 changements, 28 remises, 2 ovations ; `takeCheer` rend désormais la durée, 3,5 s). (5) Le test moteur
  `Strides.Parite.CsoRun` compare tout ce que compare `TC` (cadence, étape, pas de l'étape, état complet, mode de
  concours, tableau, surlignage, remises comptées par `AStridesCourse::RailResets`, public en liesse) : 28 exécutions
  sans écart, 27 864 images, 25 540 tableaux. (6) HUD de débogage : balises `<b>` retirées, « ▸ » rendu « > » (glyphe
  absent de la police par défaut du moteur), objectif de l'épreuve à la place de « Aucune mission active » (capture GPU
  `10_galop_00` refaite). Résultats : ctest 170 550 vérifications, 0 échec ; `TC` 28 exécutions sans écart, 27 864
  images, 264 appels d'interface et 182 sons de `courses.js`, 25 540 tableaux ; `cso_goto.json` 416 cas sans écart ;
  `cso_target.json` identique à l'octet ; deux exécutions complètes de l'exporteur (24 min chacune) donnent les 53
  exécutions de `cso_runs.json` identiques (hors `setup.pre` / `setup.at`, ajoutés entre les deux) et `cso_goto.json`
  identique à l'octet ; par rapport à l'oracle précédent, 46 des 47 exécutions antérieures sont identiques hors des
  nouveaux champs ; dans la 47e, `t3-refus-5s`, une image diffère dans les deux exécutions du jour (événement
  `horse:exhausted` du cheval d'un cavalier du décor, `rider230`, absent ; cause non établie, à confirmer : même
  famille que le constat (1), sans effet sur l'épreuve ni sur le cheval du joueur ; `TC` ne lit dans « ev » que les
  événements de saut et de refus du cheval du joueur).
- **Corrigé après le second contrôle adverse (19/11/2026)** : (1) Règles portées sans oracle, désormais exercées par
  `EXP` et couvertes par des mutations : conditions du départ lancé (`courses.js:274`) — six scénarios `t4-lance-*`,
  cheval posé à l'arrêt à la cloche (`setup.pose.ang` = cap tourné de l'axe) : s = 11,8 m, u = 3,7 m, cap à 55° et
  s = 0,2 m, u = −3,7 m, cap à −55° (chrono lancé) ; s = 12,2 m, |u| = 3,9 m, cap à 62°, s = −0,2 m (pas lancé) ;
  arrivée seulement après le dernier obstacle (`courses.js:333`), sortie de piste écourtée par une descente
  (`courses.js:320`) et écouteurs limités à l'étape de parcours — `t4-hors-parcours` (le 3 sauté pendant l'entrée en
  piste, `setup.ent` ; faute au 2 avant le départ ; ligne d'arrivée franchie avant le départ, puis après le départ le 1
  étant attendu ; fautes au 3 et au 1 à rebours) et `t4-sortie-descente` (pied à terre 0,37 s après l'arrivée : bilan
  sans élimination). `TC` exige qu'au moins un relevé exerce chacune de ces règles (19 classes au total avec les
  7 gardes : chaque condition du départ lancé seule en défaut près de sa limite, départ accordé près des limites,
  arrivée franchie trop tôt deux fois, sortie écourtée, faute à rebours et avant le départ, saut hors de l'étape de
  parcours). `mutations-cso-run.py` : 78 mutations détectées sur 83, dont les 6 lacunes relevées par le contrôle
  (arrivée sans `next > n`, 12 → 40 m, largeur ignorée, cap ignoré, descente ignorée en sortie, écouteurs hors de
  l'étape de parcours) ; 5 équivalentes par construction et déclarées (`ATTENDUES`) : les 3 d'avant, dont la raison
  repose maintenant sur une garde prouvée, plus « arrivée : départ non exigé » (next ne dépasse 1 qu'après le départ)
  et « prochain obstacle gardé à l'arrivée » (next − 1 = n, hors de la liste). (2) Journal des fautes du bilan
  (`state.log`) : relevé par `EXP` dans le canal « ep » (`lg`, entrées [label, kind, cause, causeText] quand il change ;
  l'ancien champ `run.course.log` ne contenait que des `null`), comparé à chaque image par `TC` et par
  `Strides.Parite.CsoRun` (102 changements) ; mutations « refus absent », « saut franchi absent », « barre sans sa
  cause », « barre notée franchie » détectées. (3) HUD de débogage : `AStridesHUD::ObjectiveLines` affiche l'objectif
  de l'épreuve puis la mission de carrière lancée (touche M) ; test moteur `Strides.Hud.ObjectiveLines`. (4)
  Inventaire : pénalités de temps comparées par `csoPoints` (fonction de `CsoRun::points`, 56 cas de
  `cso_course.json`) ; règles du cross déclarées non portées (`cso.refus-penalite`) ; capture du HUD de débogage
  rangée dans `unreal/docs/parite/cso/t4-hud-debogage-galop-unreal.png` avec son débordement déclaré
  (`cso.tableau-chrono`) ; niveaux globaux de `PARITE.md` à jour. (5) Grand message du lancement de l'activité
  (`missions.js:476`, « PARCOURS DU PÔLE » / « Événement · Entraînement », 2,6 s, puis `audio.notify`) non porté :
  déclaré dans `cso.entree-piste`, à porter avec le poteau (T10). (6) Limites restantes : fautes à rebours et avant le
  départ maintenant relevées (barres tombées par un appel à 4,2 m) ; écart de `t3-refus-5s` signalé par le contrôle : l'événement horse:exhausted du cheval du cavalier du décor rider230 tombe à l'image 430 au lieu de 429 dans les trois exportations faites depuis a8a34613 (deux du contrôle précédent, une ici), identiques entre elles : décalage reproductible d'une image par rapport à 8889a03d plutôt qu'un tirage différent d'une exportation à l'autre ; cause non établie (à confirmer), sans effet sur l'épreuve ni sur le cheval du joueur.
  Résultats : ctest 190 369 vérifications, 0 échec ; `TC` 44 exécutions sans écart, 31 370 images, 398 appels
  d'interface et 246 sons de `courses.js`, 27 830 tableaux ; `cso_target.json` et `cso_goto.json` identiques à l'octet à ceux de a8a34613 ; les 53 exécutions antérieures de cso_runs.json identiques hors du nouveau champ ep.lg (comparées champ à champ), 16 exécutions ajoutées ;
  tests moteur : les 14 tests Strides en Result={Success}, dont Strides.Parite.CsoRun (44 exécutions sans écart, 31 370 images, 27 830 tableaux, 102 changements du journal) et Strides.Hud.ObjectiveLines.

### T5. Obstacles, lignes et poteau visibles (géométrie exportée du web)

- **Objectif** : remplacer les formes de base par la géométrie construite par le jeu web (`builders.js:594-705`,
  `obstacles.js:116-255`), barres séparées pour l'animation, surlignage du numéro attendu.
- **Critère d'acceptation** : vue aérienne de la carrière, vues des lignes de départ et d'arrivée et du poteau « Chrono »
  en montage côte à côte web / Unreal à la même pose (844 × 390) ; nombre et position des pièces (chandeliers, ailes,
  barres, jardinières, fanions, panneaux, cellules) identiques au relevé exporté ; hauteurs 1,15 hors épreuve et profil
  1,10 en épreuve vérifiés par un test Automation qui relit le manifeste exporté.
- **Fichiers** : créer `scripts/unreal/cso-export.html`, `scripts/unreal/cso-export.js` (même principe que
  `world-export.js` : construit les obstacles du parcours dans le navigateur, exporte GLB par type et hauteur avec nœuds
  nommés, textures des panneaux), `scripts/unreal/import-cso-fences.py` ; modifier `SG/StridesFence.cpp` / `.h`,
  `SG/StridesCourse.cpp` (lignes, poteau, hauteurs selon l'état d'épreuve), `SG/Tests/StridesCoreTests.cpp`.
- **Logique pure** : aucune nouvelle ; les transformées des barres viennent de T3.
- **Oracle** : manifeste `Content/World/Cso/cso_fences.json` (pièces, couleurs, positions) exporté et relu par le test.
- **Données** : GLB et textures exportés par script ; couleurs `COLORS`, `#7dffc4`, fanions, sciure, cellules lues dans
  la scène web.
- **Preuve visuelle** : vue aérienne, ligne de départ, ligne d'arrivée, poteau (étape 2 de la recette, à créer côté web).
- **Dépendances / risques** : T1. Différences d'éclairage SwiftShader / Metal attendues : la comparaison porte sur la forme,
  la position et la couleur de base, pas sur les pixels ; budget de triangles iOS à mesurer (instanciation).
- **Livré (19/11/2026)** : (1) Export dans le jeu web en cours d'exécution, pas dans une page séparée : `cso-export.html`
  n'a pas été créé, car les panneaux sont des canvas dessinés avec la police chargée par le jeu et le relief est celui du
  jeu. `scripts/unreal/cso-export.js` est chargé dans la page par `export-cso-runs.mjs --fences`. Il construit les
  obstacles avec le code du jeu (`new Obstacles`, `new Activities` sur un jeu témoin) et relève chaque primitive à sa
  création (pile d'exécution : site `fichier:ligne`) puis à sa peinture (couleur, sommets). Les maillages fusionnés du web
  se découpent ainsi exactement en pièces : table `SITES` (site → catégorie), regroupement par contact. La construction
  témoin est comparée au jeu réel au bit près, hors épreuve et en épreuve, lignes et poteau compris. Les hauteurs de base
  (1,15 dans `_build`, 1,10 dans `cso_train`) sont lues dans le source, puis recoupées : `csoHeights(base)` doit redonner
  les hauteurs construites. Sorties : 95 maillages uniques (GLB), 14 textures (DÉPART / ARRIVÉE en français et en
  anglais), manifeste `Content/World/Cso/cso_fences.json` (positions locale et monde du pivot, barycentre, hauteurs par
  état, `#7dffc4` / `#ffffff` lus sur les panneaux, matériaux). Deux exports consécutifs donnent les mêmes octets.
  (2) `scripts/unreal/import-cso-fences.py` importe le tout et vérifie les boîtes englobantes des 95 maillages contre le
  manifeste : écart 0,0001 cm, repère x → X, z → Y, y → Z. Matériaux : bois peint (couleur de sommet, rugosité 0,42),
  poteau mat à facettes, panneaux sans éclairage et double face (texture × teinte) ; le mur reprend `MI_Brick` et
  `MI_Plaster` du monde. Le script écrit `cso_assets.json`.
  (3) Jeu : `AStridesFence` pose une composante par pièce (`BuildExported`), les barres du haut restant à part et animées
  par le cœur (`RailMeshTransform`). `SetHeight` refait l'obstacle du cœur et ses pièces ; repli sur les formes de base
  sans manifeste. `AStridesCourse` pose les hauteurs hors épreuve au `Build` (`csoHeights(1,15)`), puis celles de
  l'épreuve à l'entrée en piste (avant la remise des barres). Il suit le numéro surligné du déroulé et pose les lignes,
  aux positions du déroulé, ainsi que le poteau. `-StridesShots=cso` pose l'état relevé dans le web (`course` de
  `poses.json` : hauteurs et numéro surligné). (4) Preuves : test moteur `Strides.Parite.CsoScenery`
  (`SG/Tests/StridesCoreTests.cpp`) en Result={Success}. Hors épreuve comme en épreuve, les hauteurs du jeu sont égales
  aux hauteurs relevées et à `courseHeights(base)`. Les 225 pièces par état gardent les nombres par catégorie et le
  maillage du relevé ; pivots, boîtes englobantes et barycentres (orientation) sont à 0,0001 cm. Les 30 pièces des lignes
  et du poteau passent les mêmes contrôles. Le n° 1 est teinté `#7dffc4` après l'entrée en piste. Mutations faites en
  session (source restauré) : 6 détectées sur 7, la septième étant équivalente (yaw ∈ {0, π}).
  Montages `cso/carriere-aerienne.png`, `ligne-depart.png`, `ligne-arrivee.png`, `poteau-chrono.png` (844 × 390 de
  chaque côté). Les poses de chute (T3) ont été refaites avec l'état relevé. Démonstration F8 (`-StridesShots`) :
  « Arrivée ✓ » en 60,44 s, 0 point. (5) Limites :
  - au poteau, le sol Unreal (grille de 2 m) est 7,27 cm plus bas que le maillage de relief du web (6 m) ;
  - ombres des nuages non portées ; mur sans le shader de surfaces du web ;
  - pas d'instanciation : 30 560 triangles par état, budget iOS non mesuré ;
  - pièces sans collision (ailes : `cso.obstacles-collisions`) ;
  - une barre du haut retournée de 180° (bandes inversées) ne serait vue que sur les montages ;
  - seul le poteau de `cso_train` est affiché, sans interaction (T10).

### T6. Caméra de concours (StridesCore `CsoCamera`)

- **Objectif** : porter la branche concours de `FollowCamera` (`camera.js:13-30`, `184-283`) en pas pur ; le jeu fournit
  la sonde de collision (traces) et applique œil, cible et FOV vertical.
- **Critère d'acceptation** : `TC` rejoue le canal « caméra » des scénarios (dont les 6 instants de
  `tests/e2e/cso-framing.mjs`) à 1e-6 m près, résultats de sonde réinjectés depuis l'oracle ; montages côte à côte aux 6
  instants ; le couple cheval-cavalier occupe la même part de la hauteur d'écran qu'au web (mesure de
  `cso-framing.mjs:60-65` reprise sur la capture Unreal).
- **Fichiers** : créer `SCh/CsoCamera.h`, `SC/CsoCamera.cpp` ; modifier `SG/StridesHorse.cpp` / `.h` (remplacer le
  SpringArm en épreuve par une caméra pilotée ; FOV vertical : `AspectRatioAxisConstraint` en maintien vertical ou
  conversion par image), `TC`.
- **Logique à porter** : back, up, lookAhead, lookUp, fenceBias / fenceRange, lead, yawK / yawAcc, posK / yK, jumpFollow,
  FOV 58 amorti, minBack, fenceClear, fondu d'entrée 1,2 s, perche (sondage 1,0 → 6,6 m), point visé lissé.
- **Oracle** : canal « caméra » de `cso_runs/` (œil, cible, FOV, distance de perche retenue par image).
- **Données** : `CAM_COMP` exporté par `EXP` (module `camera.js` importé dans le navigateur si `vite-node` échoue sur
  `three`).
- **Preuve visuelle** : 6 instants de `cso-framing.mjs` capturés des deux côtés (étape 10 de la recette).
- **Dépendances / risques** : T1 ; branchement réaliste après T2. La sonde de collision dépend du décor : ne comparer que
  des poses sans obstacle à la perche, ou réinjecter les distances sondées ; le décor exporté doit être identique (inventaire
  monde).

- **Livré (19/11/2026)** : (1) `SCh/CsoCamera.h`, `SC/CsoCamera.cpp` : `csoCamStep` = `_updateComp` ligne à ligne (lacet
  à accélération bornée et anticipation, ancrage lissé, perche sondée de 1,0 à 6,6 m par une sonde fournie, recul amorti
  10 / 2,5 par seconde, obstacle survolé, sol, visée attirée puis lissée, fondu de 1,2 s, FOV 58° amorti appliqué par
  paliers de plus de 0,05°, snap) ; `CAM_COMP` exporté par `EXP` dans `Content/Data/cso_camera.json` (import de
  `camera.js` par `vite-node`, sans repli navigateur), relu par `UStridesDataSubsystem::CameraParams`. (2) Banc : canal
  « cc » dans toutes les exécutions non légères (appels de `_updateComp` : cheval vu par la caméra, obstacle suivant,
  réponses de la sonde et du sol, œil, point visé, FOV, recul), snap relevé et rejoué ; scénarios `cadrage`
  (`cso-framing.mjs` au pas fixe, réglages relus dans le test, mesures `fr` aux 6 instants et à 1 instant en l'air),
  `t6-tribunes`, `t6-mat` (perche bloquée, recul minimal, rapprochement puis éloignement), `t6-entree` (entrée depuis une
  caméra décalée), `t6-relief`, `t6-survol` (sol et obstacle survolé, hors de la carrière). Les autres canaux des 27
  exécutions réexportées sont identiques au bit près à ceux de `f6909053`. (3) Preuves : `TC` (`testCamRuns`) rejoue
  33 exécutions, 5 824 appels, sans recalage, écart max 5,7e-14 m (œil et point visé), FOV et recul exacts ; ctest
  193 284 vérifications, 0 échec. `Strides.Parite.CsoCamera` (cœur dans le module) : même rejeu, 2,8e-14 m.
  `Strides.Cso.CameraInGame` : la caméra du cheval du jeu (`StepCourseCamera`, sonde par traces, sol du relief,
  obstacles du parcours) rejoue `cadrage` : 461 appels, 1,1e-13 m ; projection du moteur en 844 × 390 : M11 =
  1/tan(FOV/2) (champ vertical), cadrage du couple = web à 6e-8 de la hauteur. `Strides.Cso.RunInGame` : caméra de
  concours active à l'étape de parcours, quittée à pied. 18 tests Strides en Result={Success}. Mutations : 24 sur 24
  détectées (`scripts/unreal/mutations-cso-camera.py`). (4) Montages `cso/cadrage-040.png` à `cadrage-440.png` (web à
  gauche, 844 × 390 de chaque côté) : côté Unreal la caméra n'est pas posée, `-StridesShots=cso` rejoue l'exécution par la
  caméra du cheval dans le décor chargé ; mesure de `cso-framing.mjs:31-39` sur la vue de rendu = web à moins de 1e-7 de
  la hauteur aux 6 instants (couple sur 36,7 / 36,3 / 36,3 / 36,3 / 36,6 / 36,0 %, `cso/cadrage-unreal.json`).
  Démonstration F8 : caméra de concours active, « Arrivée ✓ » en 60,20 s, 0 point (conduite automatique, pas une partie
  jouée). (5) Limites :
  - la mesure de `cso-framing.mjs` projette une silhouette fixe (sabots, croupe, tête, casque à 2,55 m) : identique, mais
    le couple **rendu** n'a pas la même taille. Estimation à l'œil sur `cadrage-120` (±5 px) : environ 182 px de haut au
    web (cavalier debout sur un cheval au galop, modèles du web) contre 136 px côté Unreal (cheval figé au repos,
    cavalière assise, autres modèles) : écart des modèles et des poses, pas de la caméra (horizon, tribunes et mâts
    coïncident) ;
  - sonde de la perche du jeu : sphère de 0,45 m contre la collision du décor Unreal, pas les colliders du web (non
    exportés) ; dans la carrière, aux 6 instants, aucune des deux n'a bloqué ; comportement contre les tribunes et les mâts
    prouvé seulement sonde réinjectée ;
  - obstacles survolés : ceux du parcours seulement ; entrée : fondu depuis la perche du monde ouvert du portage (champ
    vertical 32,6°) ; sortie : coupe franche vers la perche, l'état commun de `camera.js:270-282` n'est pas porté
    (`camera.concours-sortie`) ;
  - critère « à 1e-6 m près » tenu en double sur le cœur ; le composant Unreal stocke le FOV en `float` (écart 1,3e-6°) ;
  - (ajout du contrôle des remarques, 20/11/2026) le canal « cc » ne départage pas l'emprise de la règle « obstacle
    survolé » (`camera.js:233-238` : boîte de 4 m, demi-largeur w/2 + 2,4, demi-profondeur depth/2 + 0,8, filtre
    `o.off`), ni le terme `h.groundY` du plancher (`camera.js:239`), ni la remise à zéro du point visé lors d'une nouvelle
    entrée sans snap : seule `t6-survol` exerce la remontée, caméra immobile au centre d'une haie de cross. Six mutations
    sondées, non détectées, déclarées dans `ATTENDUES` de `scripts/unreal/mutations-cso-camera.py` (30 mutations, 24
    détectées). Impact nul dans la carrière : avec cy = ay + 3,4, la remontée ne joue que si o.h dépasse environ 1,95 m,
    le parcours monte au plus à 1,15 m. La phrase « 24 sur 24 détectées » ci-dessus ne valait que pour les mutations de
    l'époque.

### T7. HUD d'épreuve UMG (tableau, crans, mot d'appel, astuce, toasts, grand message, masquages)

- **Objectif** : remplacer le HUD texte en épreuve par un widget UMG construit en C++ (comme `StridesTouchControls`),
  alimenté par les événements de `CsoRun` (T4) et l'état de `CsoHorse` (T2).
- **Critère d'acceptation** : montages côte à côte en 844 × 390 et 667 × 308 pour au moins 7 états (avant départ
  « Départ 45 s · accordé 64 s », en course « ▸ 4A », dépassement en ambre, `CLOCHE`, toast « Barre au 2 · +4 · … »,
  mot « Appel parfait », crans de cadence visibles) ; minicarte, lignes de débogage et boutons hors épreuve absents en
  épreuve ; textes identiques caractère pour caractère à l'oracle de T4.
- **Fichiers** : créer `SGh/StridesCsoHud.h`, `SG/StridesCsoHud.cpp`, `scripts/unreal/export-hud-style.mjs` ; modifier
  `SG/StridesHUD.cpp` (débogage hors épreuve seulement), `SG/StridesShots.cpp` (états forcés pour les captures).
- **Logique pure** : choix du mot d'appel (`courses.js:203-211`), crans round(cadence / 8 × 6), file de toasts (2 ou 1
  selon la hauteur), durées ; dans `SC/CsoRun.cpp` avec oracle « hud » de T4.
- **Données** : styles de `src/styles.css` (sélecteurs `.cso-board`, `.jump-fb`, `.hint`, `.toast`, `.big`, `.cso-pres`,
  `.cso-rank`, lignes 220-254, 305-320, 988-1009) extraits par script dans `Content/Data/hud_cso_style.json`.
- **Preuve visuelle** : étapes 3 et 9 de la recette (`3-cloche.png` existe côté web).
- **Dépendances / risques** : T4 (textes, événements), T2 (cadence). Mise à l'échelle UMG (courbe DPI) à régler pour
  qu'une unité Slate vaille un pixel CSS en 844 × 390 (à confirmer) ; police : la pile système du web (SF sur iOS) n'est
  pas embarquable telle quelle, licence à vérifier avant tout choix, écart à documenter ; zones sûres iOS (`--st`).

- **Livré (19/11/2026)** : (1) Cœur : `SCh/CsoHud.h`, `SC/CsoHud.cpp` (`strides::CsoHud`, nouveau fichier, au lieu de
  `SC/CsoRun.cpp` prévu : c'est le HUD de `hud.js`, pas le déroulé) = `toast` (1 toast si la hauteur ≤ 420 px, sinon 2,
  3,2 s), `big` (2,2 s par défaut, `big-on` retiré 400 ms après), `hint` / `clearHint` / `_placeHint`, `jumpFeedback`
  (1,5 s), `setObjective`, partie concours de `update` (classes `cso-on` / `cso-ctl` / `cso-sober`, tableau masqué,
  `over`, `faults`, crans round(cadence / 8 × 6) par `Math.round`, 2 s après un réglage) sur une horloge en ticks de
  1/3 ms (temporisateurs échus dans l'ordre échéance puis création) ; `csoHudMasked` (masquages de `styles.css:150, 244,
  988-997`). Mot d'appel : `csoTakeoffFeedback` et `CsoRun::feedback` (`SC/CsoRun.cpp:405-427`, `courses.js:203-211`,
  aide lue dans `CsoRunConfig::aid`, dernier saut fourni par `CsoRun::setLastJump`). (2) Données et oracles par script :
  `scripts/unreal/export-hud-style.mjs` (jeu web en cours d'exécution, rien de modifié dans `src/`) écrit
  `Content/Data/hud_cso_style.json` (styles calculés et boîtes des éléments du HUD d'épreuve par viewport, arrondis au
  dixième de pixel après chargement des polices ; table des masquages : 19 éléments × 8 combinaisons de classes),
  `ORA/cso_hud.json` (le vrai HUD rejoue sur une horloge virtuelle les appels `hud.*` et l'état lu par `hud.update` des
  75 exécutions de `cso_runs/` et d'une séquence synthétique — deux et trois toasts, durées par défaut, big relancé dans la
  marge, cadence sur les égalités d'arrondi… — à 390 et 768 px : 152 rejeux, 1 463 relevés) et, avec `--shots`, les
  poses `hud-*` ; `EXP` écrit `ORA/cso_feedback.json` (fonction `feedback` extraite de `courses.js` et évaluée sur 1 638
  cas) ; `export-cso-runs.mjs` relève le dernier saut du cheval dans le canal « ep » (`ep.lj`) : réexport complet, 34
  exécutions changées par ce seul champ (comparées champ à champ), les 41 autres identiques à l'octet, `cso_target.json`
  et `cso_goto.json` identiques ; deux exports successifs de `export-hud-style.mjs` donnent les mêmes octets. (3) Jeu :
  `SGh/StridesCsoHud.h`, `SG/StridesCsoHud.cpp` (`UStridesCsoHud`, UMG construit en C++, créé par
  `AStridesPlayerController` sur toutes les plateformes) : tableau (boîte arrondie, alignement sur la ligne de base
  relevé, chrono ambre en dépassement, points rouges), crans, mot d'appel teinté par genre, astuce en texte riche
  (`<b>` → style « b »), toasts, grand message (centre et largeur relevés, animation pop), une unité de mise en page =
  un px CSS (`UScaleBox` : facteur de pixels de la plateforme / échelle DPI du moteur) ; `AStridesCourse` nourrit le
  modèle (`BeginHudFrame` avant les événements d'obstacle, appels de `CsoRun`, `UpdateHud` après `TickRun`,
  `NoteLastJump`) ; `AStridesHUD::DebugVisible` : ni lignes de débogage ni minicarte en mode concours ;
  `UStridesTouchControls::ButtonVisible` : SAUT seul en épreuve ; `-StridesShots=cso` : poses du HUD (fenêtre mise à la
  taille de la pose, HUD figé rejoué comme au web, capture de la fenêtre avec l'interface, état comparé à celui du DOM).
  (4) Preuves : `TC` (`testCsoFeedback` 1 638 cas, `testCsoHud` 152 rejeux, 73 554 images et 152 masquages,
  `testCsoRuns` désormais avec les 98 appels `hud.jumpFeedback`) : ctest 194 398 vérifications, 0 échec ; tests moteur
  `Strides.Parite.CsoHud` (mêmes rejeux par le module), `Strides.Cso.HudWidget` (textes affichés par le widget égaux à
  l'oracle : tableau, CLOCHE, toast, mot, 5 crans), `Strides.Parite.CsoRun` (540 appels d'interface dont les mots
  d'appel), `Strides.Cso.RunInGame` (modèle nourri en jeu : classes, « Départ … s », CLOCHE, HUD de débogage et boutons
  masqués en épreuve puis rendus au bilan) : 20 tests Strides en Result={Success}. `scripts/unreal/mutations-cso-hud.py` :
  45 mutations, 44 détectées ; la 45e (ordre des temporisations à échéance égale) est équivalente par construction
  (rappels commutatifs, `ATTENDUES`). Montages `cso/hud-<état>-844x390.png`
  et `-667x308.png` (web à gauche) pour 8 états : cloche (« Départ 45 s · accordé 64 s », CLOCHE), avant le départ,
  en course « ▸ 4A », dépassement en ambre (« 64,57 », 1 pt rouge, « Arrivée ✓ »), « Barre au 2 · +4 · Appel trop
  loin » avec le mot et « Appel parfait » (exécution `t7-parfait-barre-2`, depuis la correction), crans de cadence,
  ÉLIMINÉ ; état rejoué identique à l'état du DOM du web pour
  les 16 poses (`cso/hud-unreal.json`). Démonstration F8 : « 60,25 / 64 s 0 pt Arrivée ✓ ». (5) Écarts restants :
  - police : le web charge Geist et Geist Mono depuis Google Fonts ; Unreal affiche Roboto et Droid Sans Mono du moteur
    (graisse 600 en gras, chiffres du chrono non monospaces, tableau 2 à 3 px plus haut) : choix et licence d'une
    police embarquée à trancher ; « ▸ » (U+25B8) absent de toutes les polices du moteur : dessiné (triangle plein, à la
    taille de l'encre mesurée dans le navigateur) ; « ✓ » par la police de secours (vu comme « √ » sur hud-depassement) ;
    ombres portées absentes, une seule ombre du titre (la première du text-shadow relevé, sans flou) ;
  - animations (pop, toastIn, hintIn, fondu des crans) portées avec durée, courbe et image de départ relevées, mais non
    comparées image par image : les captures montrent l'état d'arrivée (animations CSS coupées dans la page de capture
    web) ; fondu de 0,25 s de l'astuce sous big-on non porté (masquée d'un coup) ;
  - bouton pause, bouton SAUT de 104 × 104 px et joysticks virtuels du moteur (visibles sur les captures Unreal) : T8
    (livré : voir T8, captures `hud-*` et `jeu-*` refaites) ;
    astuce dans la carte d'objectif (hors parcours) non dessinée, la carte n'étant pas portée ; hors mode concours (après
    l'élimination), la colonne du web commence après la minicarte, celle d'Unreal garde la position d'épreuve ;
  - facteur de pixels : écran du Mac (1 sur le Mac mini) ; iOS rend 1 par la plateforme générique (facteur natif 2 ou 3
    attendu) : **non vérifié, risque ouvert** — le moteur installé n'a pas les sources privées iOS
    (`GetDPIScaleFactorAtPoint` non surchargé d'après les en-têtes publics ; facteur de l'écran dans `IOSAppDelegate`
    `NativeScale` / `MobileContentScaleFactor`, en Objective-C) et cette session n'a ni compilation iOS ni appareil ; à
    traiter avec la recette sur appareil ; zones sûres iOS (`--st`) non traitées ; autres viewports : relevé le plus
    proche en hauteur ;
  - objectif (setObjective) en jeu : présent tant que l'épreuve n'est pas terminée (le texte de mission de `missions.js`
    n'est pas porté) ; les quatre scripts de mutations existants listent `CsoHud.cpp` (motifs tous applicables) mais
    n'ont pas été relancés en entier ;
  - historique : le premier commit de T7 (`40d4069b`) n'est pas cohérent seul — `mutations-cso-hud.py` y sort en code 1
    (liste `ATTENDUES` vide alors que la mutation d'ordre à échéance égale n'est pas détectée) ; corrigé au commit
    suivant (`4e225342`) ; historique non réécrit (jamais de force push).

- **Correction après contrôle adverse (20/11/2026)** : (1) critère 2 prouvé à l'écran et par les effets réels, plus
  seulement par des prédicats : `Strides.Cso.RunInGame` appelle `DrawHUD` du HUD de débogage en épreuve sur une toile de
  844 × 390 (retour anticipé, `DrewDebugLastFrame` faux) et replie les commandes tactiles par
  `UStridesTouchControls::Sync` (le corps de `NativeTick`, `VisibleButtons` = SAUT), puis 8 boutons au bilan ; nouveau
  mode `-StridesShots=cso-jeu -TouchControls` : partie réelle en 844 × 390 avec l'interface, démonstration automatique de
  l'épreuve, captures `cso/jeu-1-hors-epreuve.png` (lignes, minicarte, 8 boutons), `jeu-2-cloche.png`, `jeu-3-mot.png`,
  `jeu-4-course.png` (interface d'épreuve seule, SAUT seul), `jeu-5-bilan.png` (tout rendu), relevé à l'image rendue
  dans `cso/jeu-unreal.json` ; `AStridesHUD::DrawHUD` cherche l'épreuve à chaque image tant qu'aucune n'est connue. Les
  montages `hud-*` ne prouvent pas le masquage (HUD de débogage masqué par la pose depuis `b064edc5`). (2) Toasts
  reconstruits au style du nouveau viewport (`ToastIds` remis à zéro par `Refresh`) ; `Strides.Cso.HudWidget` :
  844 × 390 puis 667 × 308 = 667 × 308 d'emblée ; `hud-barre-667x308` refaite seule : bande haute à 49,2 dB de la
  capture de la série (20,6 dB avant). (3) « Barre au 2 · +4 · Appel trop loin » et « Appel parfait » d'une vraie
  exécution : scénario `t7-parfait-barre-2` (`export-cso-runs.mjs`, règle de saut `perfect`), rejoué sans écart par
  `testCsoRuns` (exécution requise) et `Strides.Parite.CsoRun`, ajouté à `cso_hud.json` (156 rejeux) ; poses
  `hud-barre` et `hud-appel` sur cette exécution, sans appel ajouté. (4) Horloge des temporisations : murale
  (`AStridesCourse::SyncHudClock`, `UWorld::GetRealTimeSeconds` : court en pause, ni ralentie ni accélérée, comme
  `setTimeout`), avancée par le cheval en début d'image et par le widget (images sans pas du cheval) ;
  `Strides.Cso.HudClock` ; `CsoHud::advance` tolère l'arrondi (un millionième de tick) et `testCsoHud` rejoue l'oracle
  sur 4 horloges (ticks entiers, pas de 1/30 s, pas découpés, pas arrondis en float) : 0 écart ; 4 mutations de
  l'horloge ajoutées, toutes détectées (49 mutations, 48 détectées, la 49e équivalente par construction). (5) Valeurs du
  widget lues dans `hud_cso_style.json` (relevées par `export-hud-style.mjs`) : `textTransform` du sous-titre,
  `textShadow` du titre, durées, courbes et images de départ des animations (`motion`), boîte d'encre de « ▸ »
  (`glyphs.next`). (6) Inventaire : `cso.retour-appel` et `cso.tableau-chrono` passent en `partiel` (logique prouvée,
  rendu à écarts connus). (7) Tests moteur : exécutions légères reconnues par `setup.lite` (même règle que le cœur), `t7-*` rejouées par `Strides.Parite.CsoRun`. ctest :
  199 878 vérifications, 0 échec ; 21 tests Strides en Result={Success}.

### T8. Commandes d'épreuve (tactile, clavier, pause)

- **Objectif** : joystick flottant du web, clavier par codes physiques avec Ctrl / Alt, menu pause avec ses deux bascules,
  gel du cheval et du chrono en pause / téléphone, boutons tactiles réduits en épreuve.
- **Critère d'acceptation** : `ORA/cso_input.json` (gestes tactiles synthétiques → `input.move`, touches → amplitude)
  rejoué à 100 % ; en épreuve seuls SAUT (104 × 104) et pause sont visibles ; pause ou téléphone ouverts 5 s ⇒ chrono et
  position du cheval inchangés (test Automation) ; réglages `jumpAid` et `courseLine` sauvegardés et relus.
- **Fichiers** : créer `SCh/CsoInput.h`, `SC/CsoInput.cpp` ; modifier `SG/StridesPlayerController.cpp` / `.h` (Échap,
  Tab, M = carte, Ctrl / Alt d'amplitude ; allures retirées de Ctrl / Maj en épreuve), `SG/StridesTouchControls.cpp`
  (joystick flottant, visibilité selon l'état), `unreal/StridesGrandTour/Config/DefaultInput.ini` (joysticks virtuels du
  moteur retirés), `SCh/SaveGame.h`, `SC/SaveGame.cpp` (`courseLine`), `SG/StridesCourse.cpp` (gel).
- **Logique pure** : `input.js:16`, `40-43`, `158-198` (rayon 58 px, zone, amplitude clavier).
- **Oracle** : exporté dans le navigateur par événements tactiles et clavier synthétiques.
- **Données** : textes du menu pause (T4) ; dimensions des boutons depuis `hud_cso_style.json` (T7).
- **Preuve visuelle** : HUD d'épreuve avec joystick affiché (étape 3 de la recette, `cso-touch.mjs` en référence) et menu
  pause, côte à côte.
- **Dépendances / risques** : T2, T7. Tactile vérifiable sur Mac seulement via `-TouchControls` (souris) : vrai tactile
  à valider sur appareil iOS, bloqué tant que `idevice_id` échoue (VM:44-45).
- **Livré (20/11/2026)** : (1) Cœur : `SCh/CsoInput.h`, `SC/CsoInput.cpp` (`strides::CsoInput` = classe `Input` de
  `input.js` ligne à ligne : joystick flottant, zone, regard, `bindButton`, clavier par codes physiques, Ctrl / Alt,
  `setEnabled`, `releaseAll`, `setVirtualMove` ; tables des codes matériels du Mac et des noms de touches Unreal) ; réglages
  de la carte Pause dans `SCh/SaveGame.h` / `SC/SaveGame.cpp` (`courseLine` « true » par défaut comme `save.js:37`,
  `toggleCourseLine`, `cycleJumpAid`, clés des libellés) ; `CsoRun::setAid` (aide relue en cours d'épreuve). (2) Oracles :
  `ORA/cso_input.json` par `scripts/unreal/export-cso-input.mjs` (vraie classe du web, servie par Vite dans une page de
  test sans le jeu, soumise à des événements DevTools tactiles, souris et clavier — un doigt est levé par `touchEnd` avec
  ce seul point, constaté sur le Chrome du Mac ; disposition AZERTY simulée par `code` ≠ `key` ; appels imbriqués non
  relevés) : 18 scénarios, 624 appels, état complet comparé après chaque appel, **0 écart** (position de l'élément du
  joystick au 1e-5 relatif : sérialisation CSS du navigateur) ; `ORA/cso_pause.json` et `Content/Data/cso_controls_style.json`
  par `export-hud-style.mjs --controls` (page tactile du jeu, HUD de la pose `hud-course`, cavalière montée : styles et
  boîtes du joystick, des boutons SAUT et pause et de la carte Pause, libellés des bascules relevés dans le DOM, icônes
  « saut » et « pause » rendues en PNG par le navigateur ; identifiant de build remplacé par `{build_id}`) : 6 cas,
  27 étapes, **0 écart** ; deux exports donnent les mêmes octets. `mutations-cso-input.py` : 67 mutations (59 de
  `CsoInput.cpp`, 8 des bascules), 67 détectées (objets communs compilés une fois, `STRIDES_TESTS=input,pause`).
  (3) Jeu : `AStridesPlayerController` réécrit (préprocesseur Slate des touches, codes physiques par
  `WebCodeOf` ; `InputTouch` → px CSS ; `StepCommands` = début de `game.update` : `poll`, `simPaused`, téléphone / carte / pause,
  gel des commandes, cheval, `endFrame` ; `PauseGame` / `ResumeGame` : état « paused », commandes désactivées, carte,
  `SetGamePaused` ; téléphone : `setEnabled(false)` ; allures sans effet en épreuve ; mission du portage passée de M à N) ;
  `AStridesHorse::Tick` : rien en pause à partir de l'image suivante (le web finit l'image d'Échap), hdt et sdt nuls
  téléphone ouvert ; `UStridesTouchControls` réécrit (SAUT et pause du web sur toutes les plateformes, joystick en mode
  tactile, boutons du portage hors épreuve) ; `UStridesPauseMenu` (nouveau) ; `StridesCss.h` (lecture des styles
  calculés) ; `UStridesSaveSubsystem` : réglages en cours, `SaveSettings` / `ReloadSettings`, emplacement réglable (les
  tests écrivent dans `strides_test_t8`, jamais dans la partie du joueur) ; `AStridesHUD::DrawPhone` (panneau aussi en
  épreuve) ; `DefaultInput.ini` : joysticks virtuels du moteur retirés. (4) Preuves : ctest 0 échec ; 23 tests Strides
  en Result={Success}, dont `Strides.Cso.Controls` (épreuve réelle : en épreuve boutons SAUT et pause seuls, boîtes =
  relevé du web, SAUT de 104 px CSS ; joystick tenu au doigt ; KeyZ sans effet, KeyW avance, Ctrl 0,5 ; **Échap : 150
  images (5 s) sans que le chrono ni la position du cheval ne bougent** ; carte Pause, bascules, réglages écrits puis
  relus, aide de l'épreuve passée à « button » ; reprise ; **téléphone ouvert 150 images : chrono et cheval figés** ;
  Tab, M, Échap qui ferme le téléphone ; bouton pause) et `Strides.Cso.PhysicalKeys` ; montages côte à côte
  `cso/cmd-joystick-844x390.png`, `cmd-joystick-667x308.png` (joystick de 112 px du web sous 320 px de haut),
  `cmd-pause-844x390.png`, `cmd-pause-667x308.png` ; captures Unreal `hud-*` refaites (SAUT et pause, plus de joystick du
  moteur ; relevés `hud-unreal.json`, `cmd-unreal.json` : boutons visibles et boîtes) ; partie réelle
  `-StridesShots=cso-jeu -TouchControls` refaite (`jeu-1` à `jeu-5`) ; démonstration F8 : « 60,38 / 64 s 0 pt
  Arrivée ✓ ». (5) Écarts restants : code matériel des touches supposé égal au kVK_* de macOS (sources privées Mac du
  moteur absentes ; vérifié sur des événements construits, pas sur un vrai clavier AZERTY) et repli par nom de touche
  hors Mac ; toucher réel non essayé (aucun appareil iOS ; facteur de pixels iOS toujours à vérifier) ; souris : regard
  sans clic (Mouse2D) ; regard au doigt appliqué à la perche du monde ouvert, sens à confirmer ; carte Pause en français,
  mise en page relevée en épreuve seulement, Écran titre / Découvrir / Partager sans effet, polices et interlignes
  approchés ; état enfoncé des boutons ronds non porté ; carte du téléphone = titre du panneau (application non portée) ;
  après l'élimination, le web montre le HUD du cavalier à pied, le portage la cavalière en selle (SAUT, pause).
- **Correction après contrôle adverse (20/11/2026)** : (1) Chemin réel du doigt : la livraison disait les gestes
  injectés dans `InputTouch` alors que tests et captures appelaient `FeedPointer*`. `Strides.Cso.Controls` appelle
  désormais `AStridesPlayerController::InputTouch` par l'interface de `APlayerController` (celle qu'appelle
  `UGameViewportClient::InputTouch`), positions en px du viewport, facteur de pixels imposé à 3 (iPhone,
  `UStridesCsoHud::SetPixelRatioForTest`) : division par le facteur (Began à (450 ; 900) px → base en (150 ; 300) px
  CSS), identifiant = index + 100 × appareil (deux doigts d'index 1 sur deux appareils : joystick et regard distincts,
  regard (25 ; −12,5) = 1,25 × px CSS), Began, FirstMove (désormais traité comme Moved : qu'il précède un Moved au même
  point — répété sans effet, vérifié — ou qu'il le remplace, rien n'est perdu), Moved, Stationary et ForceChanged (sans
  effet), Ended (joystick et regard relâchés). Les captures `cmd-joystick-*` passent par Slate :
  `AStridesShots::SlateTouch` envoie `FSlateApplication::OnTouchStarted` / `OnTouchMoved` (les messages qu'envoie la
  couche iOS), routés jusqu'au `SViewport` du jeu, `UGameViewportClient::InputTouch` puis `InputTouch` ; `cmd-unreal.json`
  note les doigts reçus (`Began#1(150.0;300.0) Moved#1(178.0;270.0)` : Slate du Mac n'émet pas FirstMove) ; boîtes du
  joystick identiques à la série précédente, captures refaites (50 à 51 dB de PSNR contre l'ancienne, bruit de rendu).
  Sur Mac, `-TouchControls` n'active pas `bUseMouseForTouch` : la souris ne pilote pas le joystick (comme le web). Reste
  non exercée : la couche UIKit d'iOS (aucun appareil). (2) Gel décalé d'une image : `game.simPaused` est relevé en tête
  de `StepCommands`, après `poll` et avant les boutons globaux (`game.js:1444-1445`, `1462-1467`) ; l'image d'Échap et
  celle de l'ouverture du téléphone avancent encore, celle de la fermeture reste figée. Nouvel oracle `ORA/cso_freeze.json`
  (`export-cso-runs.mjs --freeze` : après le départ du chrono du Pôle, 338 images jouées par la boucle du jeu web,
  `game.js:1406`, avec Échap, P, M et Reprendre ; deux exports donnent les mêmes octets) rejoué par
  `Strides.Cso.Controls` : 338 images, 0 écart (update appelée, état, `simPaused`, téléphone et application, chrono
  avancé, cheval déplacé) ; pause : 150 images sans update, chrono figé à 0,466667 s ; téléphone : 151 images figées à
  0,700000 s (mêmes valeurs que le web). (3) Allures retirées de Maj / Ctrl en épreuve testées : cheval à l'allure 2,
  `OnGaitUp` / `OnGaitDown` sans effet en épreuve, effectifs une fois le parcours retiré (2 → 3 → 2). (4) Inventaire :
  `boucle.gel-commandes` pointe le gel (`StridesPlayerController.cpp:298-304`), références des fichiers réécrits
  transportées (difflib, première ligne de chaque plage relue). (5) `scripts/unreal/mutations-cso-controls.py` : 16
  mutations du module de jeu (8 du chemin du doigt, 6 du gel, 2 des allures), écrites dans le source puis remises octet
  pour octet, 16 détectées par `Strides.Cso.Controls`. ctest : 199 918 vérifications, 0 échec ; 23 tests Strides en
  Result={Success}.

### T9. Aides à l'appel (bouton SAUT coloré, zone au sol, tracé au sol, repère)

- **Objectif** : porter `courseAids.js` et l'état du bouton (`hud.js:373-380`, `433-442`).
- **Critère d'acceptation** : `ORA/cso_takeoff_zone.json` (`takeoffZone` pour chaque obstacle × vitesses × aides) rejoué
  à 1e-9 ; canal « aides » de `cso_runs/` (tirets visibles et opacités, bandes, état du bouton par image) identique ;
  montages côte à côte de `4-abord-trop-loin` et `5-abord-bonne-zone` (captures web existantes) plus « Trop près »,
  aide `button`, aide `off`, tracé masqué.
- **Fichiers** : créer `SCh/CourseAids.h`, `SC/CourseAids.cpp`, `SGh/StridesCourseAids.h`, `SG/StridesCourseAids.cpp`
  (maillages instanciés au sol, cône) ; modifier `SG/StridesCsoHud.cpp` (états du bouton), `TC`.
- **Logique pure** : `takeoffZone` (v = max(vitesse ; 5,5), d de 8 à 0 par 0,1), règles du tracé (0,7 × 0,26 tous les
  1,5 m, 12 m après, masqué sur 1,5 m, règle des 15 m), recalcul 0,25 s, cône à h + 1,15 + 0,06 sin(2,4 t).
- **Oracle** : appels de `takeoffZone` et lecture des maillages d'aide dans le navigateur.
- **Données** : couleurs et opacités des matériaux d'aide relues dans la scène web ; points du tracé = trace déjà prouvée.
- **Preuve visuelle** : étape 4 de la recette.
- **Dépendances / risques** : T2 (`timing`), T5 (obstacles visibles pour la capture), T7 (bouton), T8 (réglages).
  Rendu translucide au sol sur mobile (tri, z-fighting à +0,035 m) à vérifier.
- **Réalisé (20/11/2026, première livraison ; décomptes à jour au contrôle adverse plus bas)** : (1) Cœur : `SCh/CourseAids.h`, `SC/CourseAids.cpp` (`csoTakeoffZone`, `csoLineMarks`,
  `csoMarkRange`, `csoJumpTiming`, `CsoCourseAids::update` : tracé, repère, zone recalculée toutes les 0,25 s et au
  changement d'obstacle, bandes) ; bouton SAUT dans `CsoHud` (`SC/CsoHud.cpp:179-185`, `205-215` : `_jt`, classes,
  signe, clé du libellé, « Trop tôt » 600 ms sur l'horloge des temporisations du HUD). (2) Oracles exportés du jeu web :
  `ORA/cso_takeoff_zone.json` (`export-cso-runs.mjs --aids` : `takeoffZone` appelée dans la page sur les 10 obstacles à
  8 jeux de hauteurs, 15 vitesses, 4 puissances, 3 bonus, 14 400 cas ; 231 tirets d'un vrai `CourseAids`) rejoué à 1e-9
  par `testCsoTakeoffZone` (« × aides » du critère : l'aide ne change pas `takeoffZone`, elle décide seulement de
  l'affichage, départagé par le canal « ai ») ; canal « ai » de 7 exécutions `t9-*` (parcours complet en français et en
  anglais, états du bouton, branches de retour, aide « bouton seul », aide coupée, tracé masqué : appels de
  `CourseAids.update` avec entrées, sol lu et maillages après l'appel ; aide lue par `hud.update` et état du bouton dans le
  DOM à chaque image, temporisation de « Trop tôt » sur une horloge virtuelle de 100 ticks de 1/3 ms par image) rejoué par
  `testCsoAids` : 5 680 appels, 6 227 images, 0 écart (dont entrée en piste en visée, à pied près de l'obstacle, point
  du tracé avant l'obstacle précédent, loin du tracé, « Trop tôt » relancé). `testCsoRuns` rejoue aussi le canal « ep »
  de ces exécutions (réglage jumpAid lu dans `setup.aid`). Deux exports donnent les mêmes octets (`t9-retour` en
  personnages classiques : la descente du modèle réaliste variait de 1e-9 m). (3) `scripts/unreal/mutations-cso-aids.py` :
  50 mutations, 42 détectées, 8 déclarées (équivalentes ou non départagées, raisons dans le script : distance 0 et
  7-8 m hors de toute zone, plan sans barre impossible à l'abord droit, dernier point du tracé, obstacle sans lineS,
  « refuse » jamais reçu par le bouton ; sous-branches non départagées : début du tronçon borné par prevS, bande de
  moins de 0,2 m). (4) Jeu : `AStridesCourseAids` (`SGh/StridesCourseAids.h`, `SG/StridesCourseAids.cpp` : maillages
  procéduraux, sommets calculés dans le repère du web puis convertis, géométries, couleurs linéaires, opacités, faces et
  ordre de rendu relus dans la scène du web, `DATA/cso_aids.json` ; matériaux translucides sans éclairage
  `M_CsoAid` / `M_CsoAidTwoSided` créés par `scripts/unreal/import-cso-aids.py`) ; `AStridesCourse::UpdateAids`
  (`SG/StridesCourse.cpp:369-406` : aides créées à l'étape de parcours, obstacle suivant, début du tronçon, réglages
  courseLine relu dans la sauvegarde et jumpAid ; supprimées à la fin de l'étape) ; bouton coloré par
  `UStridesTouchControls::ApplyJumpState` (`SG/StridesTouchControls.cpp:413-527` : fond, anneau, halo, pastille,
  libellé traduit, styles des 8 états relevés par `export-hud-style.mjs --jump-states` dans `DATA/cso_jump_style.json`) ;
  `horse:jumpEarly` → `jumpEarly` (`SG/StridesHorse.cpp:332-333`). Le fichier `SG/StridesCsoHud.cpp` cité plus haut n'a
  pas changé : le bouton SAUT est dessiné par `UStridesTouchControls` depuis T8. Casse des libellés : `text-transform:
  uppercase` passe par la culture (`FText::ToUpper`, « TROP PRÈS ») au lieu de `FString::ToUpper` (ASCII seul).
  (5) Moteur : `Strides.Cso.Aids` (canal « ai » rejoué dans l'acteur, relief du jeu : 0 écart, sol des bandes à 0 m du
  web ; maillages, matériaux et ordre de rendu ; bouton affiché par le widget à chaque image de deux exécutions et deux
  viewports, 0 écart au DOM ; épreuve réelle : repère sur le 1, zone à l'abord, aides « bouton seul » et « off »,
  tracé masqué par la sauvegarde) ; 24 tests Strides en Result={Success} ; ctest vert ; démonstration en partie réelle
  (`-StridesShots=cso-jeu -TouchControls`, dossier dédié) : « 60,33 / 64 s 0 pt Arrivée ✓ », tirets du tracé visibles
  vers l'obstacle suivant (capture `jeu-3-mot` du dossier dédié, non versionnée). (6) Captures (`--shots=aides`,
  partie réelle arrêtée à l'image, HUD affiché, canal « ai » comparé à l'oracle ; Unreal : `-StridesShots=cso
  -StridesPose=aide-` dans un dossier dédié, aides et HUD rejoués, état identique au web pour les 20 poses,
  `cso/aide-unreal.json`) : montages côte à côte `cso/aide-4-trop-loin-*`, `aide-5-bonne-zone-*` (captures de la
  recette, voir le contrôle adverse ci-dessous), `aide-saute-*`, `aide-trop-pres-*`, `aide-trop-tot-*`, `aide-bouton-*`,
  `aide-off-*`, `aide-trace-*`, `aide-sans-trace-*`, `aide-ambre-*`, en 844 × 390 et 667 × 308. (7) Écarts restants : rendu des aides
  (le web tone-mappe chaque matériau, ACES à 0,42, puis mélange en sRGB ; Unreal mélange en linéaire avant son
  tonemapper : bandes et tirets plus ternes, teintes différentes ; z-fighting non observé sur Mac, rendu mobile iOS non
  essayé) ; police du moteur sur le libellé et la pastille, halo approché, transition de l'anneau et état enfoncé non
  portés ; entraînement au paddock (`cso_warmup`) absent.
- **Contrôle adverse et corrections (20/11/2026)** : (1) Bande ambre sans bande verte (`takeoffZone` rend pass, pas
  good : garde `if (!r) return;` de `place`, `courseAids.js:155`, portée par `placeBand`) : la livraison ne l'exerçait
  pas et la déclarait à tort ; exécution `t9-ambre` (éléments 1 à 7 sautés, cheval posé 16 m devant le 8 à 4,6 m/s, zone
  calculée à 5,5 m/s) : 36 appels à bande ambre seule, bande verte masquée relevée de 0,005 m comme le web ;
  `testCsoAids` l'exige ; mutations de la garde et de la plage verte détectées (`t9-ambre` image 734) ; montage
  `cso/aide-ambre-*` (bande au pied du 8, masquée par le couple dans les deux captures : aucune preuve visuelle de la
  bande, précisé à l'hygiène finale ; ambre affichée et verte masquée relevées dans `aide-unreal.json`). Zone sans aucune
  plage (pass nul) : jamais avec le cheval des exécutions (puissance 1,38) ; aux hauteurs de l'épreuve, seulement pour un
  cheval de puissance 1,1 sous 5,8 m/s (13 cas de la grille) : non départagée, déclarée (mutation « ambre posée sans
  plage ambre » non détectée, raison dans le script). (2) Captures de la recette : exécution `t9-recette` =
  `tests/e2e/cso-shots.mjs` rejoué au pas fixe, réglages relus dans le test (`readShots` : 6 images, plan, retour,
  Entrer en piste, 80 images, état forcé chrono lancé / obstacle 2 / 7,42 s / surlignage, cheval posé 16 m devant le 2
  à 6,6 m/s, boucle du test à 0,62 jusqu'à 7,5 + 0,6 m puis 1,7 + 0,6 m) ; état écrit par le test relevé dans `fs`,
  exécution non rejouée par `testCsoRuns` (seule exécution à état forcé, vérifié). Images 119 et 181 : chrono 8,55 et
  9,49, bouton « Trop loin », astuce affichée, comme les PNG de la recette. Temporisations du HUD : la recette les fait
  courir sur l'horloge réelle pendant ses captures (une copie chronométrée du test sur ce Mac a éteint l'astuce avant
  la capture 5, que le PNG d'origine affiche : non reproductible) ; modèle de l'oracle : temps de jeu + une pause par
  capture de 450 ms (relus) + 250 ms (valeur retenue, intervalle de validité 67 à 416 ms calculé par l'export pour
  l'état des deux PNG), champ `hw`, rejoué par `StridesCsoHudReplay` et `testCsoAids`. Montages
  `cso/aide-4-trop-loin-844x390.png` et `aide-5-bonne-zone-844x390.png` : PNG d'origine de la recette (copie, empreinte
  notée) à côté d'Unreal rejouant `t9-recette` à l'image de la capture ; capture du web de l'exécution de l'oracle
  gardée (`*-oracle.png`, écart au PNG relevé dans `poses.json` : foule et animation du cheval, hasard non tiré pareil) ;
  667 × 308 : capture de l'oracle. L'ancienne pose « Saute ! » de `t9-appel` devient `aide-saute-*`. (3)
  `cso.aide-bouton-saut` ramené à partiel : aide imposée par un défi (`opts.jumpAid`, `aidLocked`) non portée. (4)
  Hauteur des tirets : sol lu par `_strip` pour chaque coin exporté (`marks[].g` de `ORA/cso_takeoff_zone.json`) ;
  `testCsoTakeoffZone` compare y = sol + `lineLift` au tampon float32 du web (924 coins), `Strides.Cso.Aids` les coins
  posés par l'acteur sur le relief du jeu (à 1,7e-5 m au plus du web) ; mutations à +0,05 et +0,035 m détectées. (5)
  Tracé masqué : paire `aide-trace-*` (`t9-parcours`) / `aide-sans-trace-*` (`t9-courbe`, jumeau tracé masqué, mêmes
  entrées depuis le lancement, vérifié par l'export) à la même image de la volte entre le 1 et le 2, tirets en courbe
  hors de l'axe de la caméra. (6) Commentaire du test corrigé (8 jeux de hauteurs). Mutations : 55, 46 détectées,
  9 déclarées ; `testCsoAids` : 10 exécutions, 7 801 images, 7 022 appels, 0 écart ; ctest : 253 115 vérifications,
  0 échec ; 24 tests Strides en Result={Success} (`Strides.Cso.Aids` : 7 exécutions rejouées dans l'acteur dont
  `t9-ambre` et `t9-recette`, 4 097 appels, 36 à bande ambre seule) ; captures Unreal des 20 poses `aide-*` (dossier
  dédié) : HUD et aides identiques au web ; démonstration `-StridesShots=cso-jeu -TouchControls` (dossier dédié) :
  « 60,33 / 64 s 0 pt Arrivée ✓ ».

### T10. Entrée dans l'épreuve (poteau, présentation, plan, entrée en piste, cloche)

- **Objectif** : poteau « Chrono » et interaction, lancement de l'activité, contrôle de capacité, carte de présentation,
  plan, annonce du dossard, cloche (la logique d'étapes est en T4).
- **Critère d'acceptation** : montages côte à côte de `1-presentation`, `2-plan`, `3-cloche` et de l'annonce
  `N° {dossard}` (à `tick(28)` après `enter`) ; `ORA/cso_plan.json` (sortie de `coursePlanSvg` et `coursePlanLegend`
  pour hauteurs 1,05 / 1,10 / 1,15 / 1,25 / 1,40 / 1,55) reproduit exactement par le port C++ ; oracle de la grille de
  présentation (difficulté, ligne « Parcours ») et du contrôle de capacité (dialogue affiché ou non, reach) à 100 %.
- **Fichiers** : créer `SCh/CoursePlan.h`, `SC/CoursePlan.cpp` (primitives du plan), `SGh/StridesCsoScreens.h`,
  `SG/StridesCsoScreens.cpp` (cartes UMG, plan dessiné en Slate), `SGh/StridesActivityPost.h`,
  `SG/StridesActivityPost.cpp` ; modifier `SG/StridesCourse.cpp`, `SG/StridesPlayerController.cpp` (interaction), `EXP`,
  `TC`.
- **Logique pure** : seuils de difficulté (`courses.js:51`, `94`), chaîne « 8 obstacles dont 2 doubles … » (`:100-108`),
  grille de capacité (`:499-528`), primitives du plan (`coursePlan.js:11-66`), dossard.
- **Oracle** : `coursePlanSvg` est importable par `vite-node` (`EXP`) ; présentation et capacité relevées dans le DOM par
  Playwright (puissances de cheval variées).
- **Données** : position du poteau, rayon, libellé, textes (T4), styles (T7).
- **Preuve visuelle** : étape 1 de la recette (captures web existantes pour présentation, plan, cloche).
- **Dépendances / risques** : T4, T7, T5 (poteau). Le plan SVG n'a pas de rendu natif en UMG : port en primitives
  (préféré, toutes hauteurs) ; repli possible : PNG rendus par Playwright pour chaque variante.
- **Réalisé (20/11/2026 ; deux commits : cœur `dbe34ef1`, puis jeu, captures et inventaire)** (le message du commit
  `dbe34ef1` annonce « ctest 258 758 vérifications » : faux, ce commit compilé seul en donne 259 715 d'après le contrôle
  adverse ; message non réécrit, force push interdit) : (1) Cœur :
  `SCh/CoursePlan.h`, `SC/CoursePlan.cpp` (`coursePlan` : primitives du plan, chacune avec son élément SVG exact et sa
  géométrie relue dans ses attributs ; `coursePlanSvg`, `coursePlanLegend`) ; `SCh/CsoEntry.h`, `SC/CsoEntry.cpp`
  (activité `cso_train` lue dans `DATA/cso_activity.json`, action du poteau `csoActivityAvailable`, grand message du
  lancement, `csoPresentation`, `csoPlanCard`, `csoCapacity`) ; `CsoRun` (lancement : grand message et `notify` de
  `missions.start` ; dialogue de l'entraîneur et attente de sa fermeture) ; `Text` (`String(n)`, casse). (2) Oracles
  exportés du jeu web : `ORA/cso_plan.json` (`export-data.mjs`, vite-node : 22 SVG pour csoHeights 1,05 / 1,10 / 1,15 /
  1,25 / 1,40 / 1,55, sans hauteurs et numéros surlignés, fr et en, et 2 légendes) reproduit caractère pour caractère
  par `testCoursePlan` ; `ORA/cso_entry.json` (`export-cso-entry.mjs`, Playwright, `courseSteps` appelé dans la page
  avec les vraies étapes de mission) : 42 cartes de présentation et 42 cartes du plan (grille, difficulté, ligne
  « Parcours »), 406 contrôles de capacité (dialogue affiché ou non, portée, texte ; bords du seuil de puissance par
  dichotomie), 168 positions de l'action du poteau, rejoués à 100 % par `testCsoEntry` ; ctest : 259 715 vérifications,
  0 échec ; `scripts/unreal/mutations-cso-entry.py` : 55 détectées sur 59, 4 déclarées. (3) Jeu : rien n'est lancé au
  démarrage (`SG/StridesGameMode.cpp:91-115`) ; poteau `AStridesActivityPost` (`SGh/StridesActivityPost.h`,
  `SG/StridesActivityPost.cpp`) posé avec `DATA/cso_activity.json` ; action du web dans
  `AStridesPlayerController::DoAction` (`SG/StridesPlayerController.cpp:486-508` : dialogue fermé d'abord, puis poteau,
  sinon monter / descendre ; E, F, Entrée par les commandes du web, `:328-329`) ; carte ouverte ou dialogue :
  simulation suspendue, commandes gelées, boutons globaux coupés sous la carte (`:294-336`) ;
  `AStridesCourse::StartActivity` (`SG/StridesCourse.cpp:154-185` : grand message, contrôle de capacité avec le cheval
  du joueur), cartes et boutons (`:187-244`, `:319-325`) ; `UStridesCsoScreens` (`SGh/StridesCsoScreens.h`,
  `SG/StridesCsoScreens.cpp` : voile flouté, carte, grille, règles, barre d'actions, boutons aux boîtes relevées dans
  `DATA/cso_screens_style.json` ; plan dessiné en Slate depuis les primitives du cœur, `SStridesCoursePlan::OnPaint` ;
  dialogue de l'entraîneur) ; bouton tactile au libellé « Chrono » (`SG/StridesTouchControls.cpp:373-380`). Le fichier
  `SG/StridesPlayerController.cpp` prévu pour l'« interaction » porte l'action ; `TC` n'était pas à modifier pour le jeu
  (tests moteur à part). (4) Moteur : `Strides.Cso.Entry` (action du poteau aux 84 positions sans mission et 42 avec
  mission de l'oracle, fr et en ; touche E au poteau ; lancement ; carte ouverte : contenu identique au DOM du web, boîtes
  du relevé, cheval immobile touche W tenue, P / M / Échap / E sans effet ; élément svg de la carte du plan identique au
  caractère près au HTML de la carte du web ; Voir le plan, Retour, Entrer en piste ; annonce, cloche) et
  `Strides.Cso.EntryDialog` (cas de l'oracle aux hauteurs de l'épreuve : dialogue identique, affiché, simulation
  suspendue, fermé par E, présentation ensuite) ; 26 tests Strides en Result={Success} ; mutations du module faites en
  session (source muté, éditeur recompilé, tests relancés, source restauré ; script non versionné) : carte sans
  simulation suspendue, action sans fermeture du dialogue d'abord, carte jamais ouverte, poteau proposé malgré une
  mission, « Entrer en piste » sans valider l'étape : notées 5 détectées sur 5, **non rejouables** faute de script
  versionné (hygiène finale : elles ne comptent pas comme preuve). (5) Captures (`export-cso-runs.mjs
  --shots=entree` : exécution `t9-recette` = `tests/e2e/cso-shots.mjs` rejouée au pas fixe jusqu'à l'image de chaque
  capture, gestes du test entre deux images, carte relevée dans le DOM ; Unreal : `-StridesShots=cso -StridesPose=entree-`
  dans un dossier dédié, activité lancée par l'action du poteau, carte ouverte par le déroulé et boutons touchés par le
  widget, HUD rejoué de la même exécution (appels `hud.*` enregistrés de `t9-recette` rejoués par
  `StridesCsoHudReplay::Run` puis figés par `SetFrozen` : « N° 40 · Test » est le texte du web rendu par le widget, le
  dossard propre au jeu n'apparaît sur aucun montage) ; relevé `cso/entree-unreal.json` : carte identique au DOM du web
  pour les 4 poses qui ont une carte (entree-3 et entree-4 n'en ont pas), champ `gestures` vide pour les 8 poses (relevé
  recréé à chaque rappel d'`ApplyPose`), comptes du plan égaux au SVG du web (itérations de la boucle d'`OnPaint`, pas
  primitives dessinées) : montages `cso/entree-1-presentation-*`, `entree-2-plan-*`,
  `entree-3-annonce-*` (annonce « N° 40 · Test » à la 28e image après « Entrer en piste » ; `tests/e2e/cso.mjs:59-63`
  la lit après `tick(2)` puis `tick(28)`, soit 30 images, même texte) et `entree-4-cloche-*`, en 844 × 390 (captures de la recette pour 1, 2 et 3-cloche) et
  667 × 308. Démonstration `-StridesShots` (dossier dédié) : activité lancée au poteau, carte validée, « 60,34 / 64 s
  0 pt Arrivée ✓ » ; `-StridesShots=cso-jeu -TouchControls` refaite (`jeu-1` sans activité au départ du jeu).
  (6) Écarts restants : police du moteur (cartes, plan, dialogue) ; mise en page relevée en français pour Comète, non
  recalculée pour un autre texte ; animation de l'overlay, clignotement de « Toucher pour fermer », clics sonores non
  portés ; ombre de la barre d'actions plus sombre (corrigé au contrôle adverse de T11 : ombres de bord de la boîte
  défilante Slate retirées). Captures de la recette : en 1-presentation et 2-plan, le fond (flouté)
  montre une autre vue que l'exécution rejouée (écarts moyens 10,85 et 9,51 / 255 entre PNG et capture de l'exécution,
  `poses.json`, champ `recette`) ; en 3-cloche, le PNG n'a plus le grand message « CLOCHE » (temporisations du HUD sur
  l'horloge réelle pendant `A.tick(80)`) alors que le modèle de l'oracle (pause de 700 ms par capture, T9) l'affiche,
  comme Unreal et la capture de l'exécution (`entree-4-cloche-844x390-oracle.png`) : écart déclaré, le modèle n'est pas
  recalé sur ce PNG. État du HUD rejoué identique au DOM du web sauf le texte initial du tableau caché (« 0,00 » de
  `hud.js:74`, vide dans le modèle du cœur ; invisible). Décor des montages d'annonce et de cloche : arche « ENTRÉE DE
  PISTE » mal convertie côté Unreal, cheval gris (captures antérieures à C1, qui engage depuis le cheval bai de la
  sauvegarde : montages non refaits), tenue du cavalier (hors de cette tranche). Cible GPS vers le poteau,
  app Activités et meilleur temps, autres poteaux, masquage du poteau au-delà de 300 m non portés ; dialogue sans
  capture côte à côte ; aucun paquet iOS, aucun appareil réel.

### T11. Arrivée, bilan, classement simulé, recommencer, record

- **Objectif** : grand message d'arrivée, carte de bilan complète, classement simulé, boutons, meilleur temps.
- **Critère d'acceptation** : `ORA/cso_ranking.json` (`simulateField` et `rankResults` pour les graines
  5150 + 31 k, k = 0 à 9, et les classes du concours) reproduit exactement ; textes de bilan identiques à l'oracle DOM pour
  5 issues (sans-faute vainqueur, barres, refus, éliminé, 2e manche) ; `Recommencer` relance une manche neuve (barres
  remises, entrée, cloche) vérifiée par test Automation ; `bestTimes.cso_train` = temps + pénalités enregistré à la fin de
  la manche, sans F5 ; montage côte à côte du bilan (`touch-bilan.png` de `cso-touch.mjs` en référence) et de
  `SANS FAUTE !`.
- **Fichiers** : créer `SCh/Ranking.h`, `SC/Ranking.cpp` ; modifier `SG/StridesCsoScreens.cpp`,
  `SG/StridesSaveSubsystem.cpp`, `SCh/SaveGame.h`, `SG/StridesCourse.cpp`, `EXP`, `TC`.
- **Logique pure** : `mulberry32`, `simulateField`, `rankResults`, titre et grille du bilan (`courses.js:372-424`),
  ordinaux.
- **Oracle** : `EXP` (modules purs `ranking.js`, `math.js`) ; DOM du bilan par Playwright.
- **Données** : `FIRST_NAMES`, `LAST_NAMES`, `HORSE_NAMES` exportés.
- **Preuve visuelle** : étape 11 de la recette.
- **Dépendances / risques** : T4, T7, T10 (cartes). `S'entraîner` mène à l'entraînement au paddock (`cso_warmup`), absent
  de l'Unreal : bouton à brancher quand cette activité sera portée, sans rien inventer en attendant ; `reportScore`
  (réseau) hors plan.

#### Réalisation de T11 (20/11/2026, reprise après la pause disque)

- **Cœur** (`SC/Ranking.cpp`, `SCh/Ranking.h`) : `mulberry32` (arithmétique 32 bits, `ToUint32` du web), `simulateField`,
  `rankResults` (tri stable), carte de bilan `csoResultCard` (kicker, titre, grille, tableau des 8 premiers et du joueur,
  boutons), `csoResultInputOf`. `CsoRun` : étape d'enregistrement du meilleur temps (`activities.js:111-129` : rien après
  une élimination, score = chrono + fautes + pénalités de temps, record sans meilleur temps ou s'il est battu), fin de la
  mission (`run.cleanup` : `clearHint`, `closeDialog`). `SaveGame` : `bestTimes` écrit, relu et importé du web ; l'ancien
  record « cso_pole » pris à la sauvegarde F5 est retiré (le web n'en écrit pas pour cette activité).
- **Oracles** : `ORA/cso_ranking.json` (export-data.mjs : 216 tirages, 861 engagés, 112 classements, identiques) ;
  `ORA/cso_result.json` (export-cso-result.mjs : 13 états × 2 langues, dont vainqueur sans faute, barres, refus,
  éliminé, manches 2, 3 et 10, joueur au-delà du 8e, sans cheval ; 26 cartes identiques ; boutons touchés sur 3 cas) ;
  canal « bl » et `ep.bt` de `cso_runs/` (23 bilans de vraies parties identiques ; 4 meilleurs temps égaux au bit près) ;
  exécutions `t11-refus` (refus au 3, Quitter) et `t11-manche-2` (barre au 2, Recommencer, manche 2 sans faute,
  Quitter), réexportées à l'identique.
- **Jeu** : carte UMG (`SG/StridesCsoScreens.cpp`, styles `Content/Data/cso_result_style.json`), boutons, meilleur
  temps écrit dans l'emplacement de sauvegarde à l'étape d'enregistrement (`UStridesSaveSubsystem::RecordBestTime`, sans
  F5). Test moteur `Strides.Cso.Result` : `t11-refus` et `t11-manche-2` (fr, en) rejouées par le chemin du jeu
  (`SG/StridesCsoRunReplay.h`, widget des cartes) : 5 446 images, 146 appels d'interface, 96 sons, 6 bilans identiques au
  DOM et affichés, 2 Recommencer (barre du 2 renversée puis remise à l'entrée en piste, annonce, cloche, manche 2),
  4 meilleurs temps relus sur le disque. 27 tests Automation Strides au vert ; ctest au vert ; démo F8 rejouée dans un
  dossier dédié (« 60,46 / 64 s 0 pt Arrivée ✓ », captures de Julien inchangées).
- **Preuves visuelles** : `cso/bilan-1-sans-faute-{844x390,667x308}.png` (15e image après « SANS FAUTE ! » de
  `t9-parcours`, HUD rejoué identique au web), `cso/bilan-2-carte-{844x390,667x308}.png` (exécution rejouée par le jeu
  jusqu'à l'image 2071, carte identique au web : `bilan-unreal.json`), référence tactile `cso/bilan-touch-844x390.png`
  (`touch-bilan.png` de `tests/e2e/cso-touch.mjs`, sha256 c7172cdd…, réduit à 844 × 390).
- **Mutations** : `scripts/unreal/mutations-cso-ranking.py`, 59 mutations, 53 détectées, 6 déclarées non départagées :
  marge 1e-9 des pénalités de temps des engagés, tri non stable (libc++ stable sous 31 éléments), chrono du joueur non
  arrondi avant le tri, et trois branches de l'enregistrement (pénalités de temps dans le score, Quitter après une
  élimination, meilleur temps existant égalé) : aucune exécution enregistrée ne les exerce (sauvegarde neuve, aucune
  pénalité de temps, aucune élimination quittée).
- **Écarts déclarés** : dotation (`prizes`, concours) non portée (`csoResultCard` la refuse) ; `S'entraîner` termine la
  mission sans rien lancer (`cso_warmup` absent) ; récompenses de fin de mission (réputation, compétence organisation,
  statistiques, offres, objectif « Une mission t'attend ») et `reportScore` non portés ; sons d'arrivée journalisés, non
  joués (T12) ; rendu : police du moteur, fondu d'ouverture de l'overlay absent, HUD hors épreuve (mini-carte,
  porte-monnaie) absent derrière la carte, robe du cheval, sable et bandeaux de la lice déjà différents (décor, T5) ;
  la référence tactile est prise pendant le fondu de l'overlay et vient d'une partie au doigt en temps réel (chrono
  60,77 s au lieu de 59,80 s, même classement 5e sur 15), non rejouable au pas fixe ; sans sauvegarde existante,
  `RecordBestTime` crée une sauvegarde sans position (le chargement F9 la refuse ensuite, comme avant).

#### Contrôle adverse de T11 (20/11/2026)

Base `97d1d013`. C = corrigé, D = déclaré.

1. C (majeur) — mise en page de la carte figée sur le relevé de `t9-parcours` (joueur 9e ou au-delà posé sous la zone
   de défilement ; fautes sur deux lignes débordant sur la ligne suivante). Mise en page portée en logique pure :
   `strides::csoResultLayout` (`SC/Ranking.cpp:200-263`) reproduit le flux CSS du corps (`styles.css:246-254`, `350-355`) à
   partir du relevé de base de la vue (désormais par langue : `cso_result_style.json` schéma 2, fr et en, avec la largeur
   Geist de chaque texte) : chaque bloc garde sa distance au précédent, sa hauteur suit ses lignes de texte, une ligne de
   tableau par engagé affiché, colonnes réparties en proportion de leur largeur maximale (table-layout auto, vérifié à
   0,09 px), `scrollHeight` = bas du tableau + padding-bottom, classe `more` (`screens.js:151`) suivie au défilement.
   Oracle `ORA/cso_result_layout.json` (`export-cso-result.mjs --screens` : 15 états × 2 langues × 2 viewports, boîtes,
   largeurs de texte des cellules, défilement et `more` en haut et en bas) : `testCsoResultLayout` (`TC:1851`) 60 vues,
   3 876 boîtes à 0,088 px, défilement et `more` identiques ; 15 mutations de la mise en page dans
   `mutations-cso-ranking.py`, 12 détectées, 3 déclarées (lignes d'une clé, arrondi au-dessus de `scrollHeight`, seuil de
   4 px de `more`) ; le script entier : 76 mutations, 67 détectées, 9 déclarées, code 0. Jeu
   (`SG/StridesCsoScreens.cpp:586-765`) : lignes des valeurs mesurées par le moteur à la largeur de la colonne divisée par
   le rapport Geist / moteur étalonné sur le relevé, largeurs de texte des cellules estimées par colonne et par graisse ;
   test moteur `Strides.Cso.ResultLayout` : lignes identiques au web dans les 60 vues, flux à 0,000 px, défilement et
   `more` identiques, colonnes à 8,2 px au plus (déclaré). Partie réelle `t11-trois-barres` (12 pts sur deux lignes,
   joueur 14e, 9 lignes) exportée du web et rejouée (`testCsoRuns`, `Strides.Cso.Result`) ; montages
   `bilan-3-trois-barres-*` (corps en haut) et `bilan-4-trois-barres-bas-*` (défilé jusqu'en bas : 195 px et 247 px comme
   le web, ombre de la barre retirée), boîtes comparées au web dans `bilan-unreal.json`. `cso.bilan` passe en `partiel`
   (police du moteur : colonnes, mot coupé ; comme les autres lignes qui déclarent la police).
2. C — sous-branches « Victoire ! » et « joueur exactement 9e » : états `victoire-fautes` (manche 268, aucun engagé
   sans faute) et `neuvieme` (4 pts en 60,00 s) ajoutés à `cso_result.json` ; mutations détectées.
3. C — `socle.json` `sauvegarde.auto` et `vie.json` `missions.sauvegarde-carriere` : écritures automatiques ciblées
   (réglages de la Pause, meilleur temps de T11) déclarées.
4. C — références vers `export-data.mjs` recalées (`:40` horse_gaits, `:41` horse_profiles, `:82` cso_course_pole) ;
   références vers les fichiers réécrits par cette correction recalées par projection du diff (17), cibles relues.
5. C — `bilan-unreal.json` : images rejouées gardées pour les poses suivantes de même exécution et même image (2 072
   pour `bilan-2`, 902 pour `bilan-3` et `bilan-4`).
6. C — trait sombre au-dessus de la barre d'actions : ombres de bord de la boîte défilante Slate retirées (aussi sur les
   cartes de T10 : captures `entree-1-presentation-667x308` et `entree-2-plan-*` refaites) ; `testCsoResult` lit le temps
   accordé dans `cso_course_pole.json` ; identifiant d'inventaire du commentaire de `mutations-cso-ranking.py` corrigé
   (`activites.parcours-pole`, `cso.classement-simule`, `cso.bilan`). D — référence tactile `bilan-touch` : état
   différent (partie au doigt), déclarée `partiel`, inchangée.

### T12. Sons de l'épreuve et recette complète

- **Objectif** : rendre chaque son de `audio.js` hors ligne en WAV, les jouer aux événements de `CsoRun` / `CsoFences`,
  puis dérouler la recette complète.
- **Critère d'acceptation** : journal des appels sonores de l'Unreal (nom, arguments, image) identique au canal « audio »
  de `cso_runs/` pour tous les scénarios ; 14 sons présents dans `Content/Audio/Cso/` avec la somme de contrôle du
  rendu exporté ; ambiance public à 0,6 × 0,08 dans les 90 m ; `unreal/docs/parite/cso/` contient les montages des 13
  étapes de §13 ; un paquet iOS se construit sans Pixel Streaming (contrôle du `.uproject` et du journal UBT).
- **Fichiers** : créer `scripts/unreal/export-cso-sounds.mjs` (Playwright, `OfflineAudioContext`, bruit à graine fixe),
  `scripts/unreal/import-cso-sounds.py`, `SGh/StridesCsoAudio.h`, `SG/StridesCsoAudio.cpp` ; modifier
  `SG/StridesCourse.cpp`, `unreal/docs/validation-mac-2026-11-17.md` ou une nouvelle note de validation datée.
- **Logique pure** : aucune nouvelle (les appels sonores sont des événements de T3 / T4).
- **Oracle** : canal « audio » de `cso_runs/`.
- **Données** : WAV exportés (paramètres d'appel : `applause(intensité, durée)` rendus par variante utilisée).
- **Preuve visuelle** : recette complète §13 (13 étapes) ; preuve sonore par journal.
- **Dépendances / risques** : T3, T4, puis toutes les tranches pour la recette. `audio.js` suppose un `AudioContext` vivant :
  faisabilité du rendu hors ligne à confirmer ; validation sur appareil bloquée par `idevice_id` (VM:44-45).

#### Réalisation de T12 (20/11/2026)

Base `0fdf2f4b`. Niveaux séparés : code écrit, compilé (Mac Editor et cible IOS Shipping liée), testé (cœur et moteur),
lu en jeu sur Mac sans écoute ; **aucun appareil iOS**, **aucun paquet iOS** (disque, voir plus bas).

- **Rendu hors ligne** (`scripts/unreal/export-cso-sounds.mjs`) : la vraie classe `Audio` de `src/core/audio.js` est
  chargée dans une page de test (rien n'est modifié dans `src/`) ; `unlock()` reçoit un `OfflineAudioContext` (48 kHz,
  mono) à la place d'`AudioContext` : même graphe que le jeu (gain maître 0,8, compresseur, boucles d'ambiance, tampon de
  bruit de 2 s). `Math.random` → `mulberry32` (`src/core/math.js`), graine fixe pour le tampon de bruit, graine par clé pour
  l'appel. Variantes rendues : **toutes celles appelées dans `cso_runs/`** (relevées dans l'oracle, aucune liste écrite à la
  main) : 18 sons pour les 14 fonctions de §12 (applause ×3, bell ×2, tone ×2, hoof « sand » 1,4, landing 1, notify, snort,
  railTouch, railFall, thud, fault, crowdOoh, neigh) plus click ; `cheer` n'est pas un son mais une automation du gain du
  bus du public ; `breath` n'est pas rendu (foulées de l'animation non portées). WAV PCM 16 bits **après le gain maître et
  avant le compresseur** ; boucle du bus du public (seconde période de 2 s du bruit bouclé passé au passe-bande 900 Hz).
  Deux exports successifs donnent les mêmes octets parce que l'exporteur garde le WAV existant quand l'écart reste dans
  sa tolérance (au plus 1 pas sur au plus 16 échantillons ; ordre de sommation de Chrome) ; un export dans un dossier
  vide change la SHA-1 de 3 sons sur 19 (`applause_1p3_4`, `bell_2` et `bell` ; constat du contrôle adverse, précisé à
  l'hygiène finale).
- **Import** (`scripts/unreal/import-cso-sounds.py`) : 19 `USoundWave` sous `/Game/Audio/Cso` (808 Ko), compression PCM,
  boucle jouée même silencieuse ; `Strides.Cso.AudioAssets` : PCM importé (`GetImportedSoundWaveData`) = SHA-1 du rendu
  pour les 19, 48 kHz, mono.
- **Logique pure** (`StridesCore/CsoAudio`) : écouteurs de `game.js:716-728` (landing, snort, hoof à l'appel en
  concours, neigh), click d'`interact.js:52`, clé des WAV, fichier appelant, `WebAudioParam` (sémantique de
  setValueAtTime / setTargetAtTime / cancelScheduledValues), bus du public (`ambience`, `cheer`, `applause`), niveau du
  public (`game.js:1553`), manifeste. Constantes lues dans le source par l'exporteur.
- **Jeu** (`UStridesCsoAudio`) : journal de chaque appel de premier niveau et lecture du WAV ; sources :
  `AStridesHorse::TickCso` (cheval, barres, cabré de la glissade), `AStridesCourse` (déroulé, chute des barres),
  `AStridesPlayerController::DoAction` (click d'une action ou d'une réplique) ; ambience à la fin de chaque image de jeu.
- **Oracle et preuves** : `testCsoSounds` : journal du portage = canal « audio » des **94 exécutions** (52 446 images,
  1 367 appels, ordre compris ; précisé à l'hygiène finale : dans les 60 exécutions légères, que `testHorseRuns` et
  `testFenceRuns` sautent, les sons du cheval sont tirés des événements `horse:jump`, `horse:land`, `horse:refuse` de
  l'oracle et le click recomposé par une règle écrite dans le test, pas par `DoAction`) ; exclus et déclarés : breath (1 224), sons des obstacles des 60 exécutions légères (82),
  sons du déroulé des 32 exécutions posées en cours de parcours (36). `testCsoCrowd` : gain du bus du public rendu par le web
  (7 séquences, 3 380 relevés) rejoué à 4,47e-5 près (plateau du navigateur juste sous la cible, 0,0479553 au lieu de
  0,048 ; cause supposée, à confirmer : float32) ; niveau relevé dans le jeu à 88 / 89,5 / 90,5 / 92 / 40 / 200 m.
  `mutations-cso-audio.py` : 27 mutations, 22 détectées, 5 déclarées (landing 0,5 et snort des chevaux du décor, sabot
  hors commandes de concours : jamais exercés ; annulation « > t » : doublon sans effet ; bord des 90 m non relevé).
  `Strides.Cso.Audio` : sources câblées en jeu (plus faible que son commentaire : le refus au 2 est sauté sans erreur si
  l'obstacle 2 manque, et « même image » pour snort puis hoof n'est vérifié que par l'adjacence dans le journal). ctest : 300 639 vérifications, 0 échec ; Automation : 30/30.
- **Écarts déclarés** : compresseur du bus maître non porté (par son seul, la chaîne du web change le RMS de −8,7 à
  +3,5 dB : mesure `gameChain` du manifeste) ; une seule réalisation du hasard au lieu d'un tirage par appel ; pas des
  sabots, souffle, vent, mer, moteur, musique, pluie, oiseaux non portés ; réglage « Son » absent de la carte Pause ;
  écoute réelle non faite (sortie du Mac mini : téléviseur HDMI « Beyond TV ») ; sol du sabot passé « sand » par le jeu.
- **Pixel Streaming** (`scripts/unreal/check-pixel-streaming-ios.py`) : `.uproject` (PixelStreaming2, `PlatformAllowList`
  `["Mac"]`) ; UnrealBuildTool `-Mode=JsonExport` : cible IOS Development 429 modules, **aucun** PixelStreaming ; cible
  Mac 486 modules dont 7 PixelStreaming2 (témoin) ; cible **IOS Shipping compilée et liée** (`Build.sh StridesGrandTour IOS
  Shipping` : 36 unités, binaire arm64 de 235 Mo, 0 occurrence de « pixelstreaming ») ; échec à la finalisation de l'app
  (« Signing for "StridesGrandTour" requires a development team ») : blocage de signature déjà connu. La cible IOS ne
  compilait plus depuis T9 (`MiniJson.h` lève des exceptions, interdites dans le module de jeu en Shipping : 6 tests et
  `StridesShots.cpp`) : exceptions permises dans `StridesGrandTour.Build.cs`, comme dans `StridesCore`.
- **Paquet iOS complet : non fait (disque)** : 12,0 Go libres après la compilation IOS (12,8 Go avant) ; c'est
  l'estimation du paquet (cuisson + mise en scène + archive : environ 3 Go d'après les sorties du 18/11 : `Saved/Cooked`
  710 Mo, `Saved/StagedBuilds` 1,2 Go, archive 0,9 Go), soit environ 9 Go restants après, qui le place sous le seuil de
  12 Go exigé après (précisé à l'hygiène finale).
- **Recette (§13)** : voir `unreal/docs/validation-mac-2026-11-20.md` (table des 13 étapes et montages).

### Contrôle des remarques des contrôles adverses (hygiène, 20/11/2026)

Base `055c2c92`. Chaque remarque des contrôles de R0 à T8 est corrigée, prouvée déjà réglée, ou déclarée (branche
qu'aucun oracle ne départage, raison écrite dans le script de mutations et l'inventaire). Aucun comportement du jeu n'a
changé, sauf pour l'aligner sur le JS (points 17, 25, 33, 34). Abréviations : C = corrigé, R = déjà réglé (preuve),
D = déclaré, H = historique (rien à réécrire sans force push, interdit).

1. C — `cso.trace-pole` : `CsoCourse.cpp:51-70 (poleDesign)`. Références `fichier:ligne` de l'inventaire revues en
   deux passes. Première passe (`58cb93da`) : test_core, StridesHUD, StridesHorse, StridesHorse.h, CsoCourse, CsoHorse,
   CsoFences, StridesCourse, StridesCsoHud, StridesShots, StridesGameMode, StridesDataSubsystem, StridesTouchControls,
   StridesCoreTests et tests moteur, 285 références remplacées (voir 29, 36, 42) ; elle laissait de côté d'autres
   fichiers touchés par la tranche a (contrôle adverse : `StridesSaveSubsystem.cpp`, modifié en `88eec8c7` et `ecc723b0`,
   références fausses de 2 à 29 lignes). Seconde passe (après ce contrôle), sur les 60 fichiers de code touchés par la
   tranche a (`git diff --name-only 250a9b4e HEAD`), vers lesquels l'inventaire porte 563 références explicites : relues
   une à une contre le texte de HEAD, les 184 références vers les 19 fichiers hors première passe, les 20 de
   `StridesTouchControls.cpp` et toutes les références nues (« :82-89 », « lignes 86-87 », « (83-89 : ») ; dans les
   fichiers de la première passe, les trois références qu'une projection par diff (texte cité au commit qui l'introduit,
   suivi jusqu'à HEAD) signalait encore (`StridesHorse.cpp:67`, `:365`, `StridesHUD.cpp:49`), justes ; 54 remplacements :
   `StridesSaveSubsystem.cpp` (19 : LoadNow 71-96, Dismount 86, ImportWebExport 125-138, ActiveMissionId 63 et 80,
   LastMessage 67 et 94, record 45-56), `StridesRider.cpp` (19 : +1 après la ligne 119 depuis `88eec8c7` ; TryMount
   91-113), `StridesPlayerController.cpp` (OnInteract 412-419, 5), `StridesTouchControls.cpp` (3, dont « :127-141 »
   rendu explicite), `StridesFence.cpp` (2), `StridesCourse.h`, `StridesCsoScenery.cpp`, `StridesDataSubsystem.h`,
   `MathUtil.h`, `StridesHUD.cpp` (rayon 160 m, ligne 129) et `StridesDataSubsystem.cpp` (LoadScene 200-232). Les
   références vers les fichiers que la tranche a n'a pas touchés (inchangés depuis la base `250a9b4e`) n'ont pas été
   revues.
2. C — commentaire de `SG/StridesDataSubsystem.cpp:126` : `testCourse`.
3. C — `testRuns` lit la ligne de départ dans l'oracle (`setup.start` : x, z, rot, **w**) et la déclare franchie par
   `strides::lineCrossed` (fonction du cœur, désormais exposée dans `CsoRun.h` : w/2 + 0,3 et cap à 60° compris) ; le
   départ du web est lu dans l'état relevé (`run.course.started`) avec le bip « tone » de `courses.js` à cette image :
   plus de 3,8 ni de 1568 recopiés.
4. R + D — recul de la caméra enregistré depuis T6 (`cc.bk`, comparé par `testCamRuns`) ; journal des fautes complet
   dans `ep.lg` depuis le second contrôle de T4 (comparé par `testCsoRuns`). La réduction de `summ` (au-delà de deux
   niveaux : `run.course.log`, `steps` de `mission:start` à null) est maintenant écrite dans l'en-tête de l'index
   (`state`), réexporté.
5. C — l'exporteur lit les valeurs initiales du cheval WildMesh (`stride`, `roll`, `landT`, `wasJump`) dans le source de
   la classe `PjlHorse` chargée par la page (`pjlInitial`, erreur si l'une manque) ; `ph` = `horse.anim.phase` comme le
   constructeur. Preuve : `droit` (fr, en) et `t3-refus-5s` réexportés, identiques à l'octet.
6. R + D — la formule de l'épreuve est comparée directement au web par le déroulé, pas seulement à la lecture :
   `courses.js:148` (tableau) à chaque image (28 409 tableaux, dont `t4-temps-limite` et `t4-un-point`), `:341` (texte du
   grand message), `:364` (`state.timeFaults`). Les cas limites de la grille ne passent que par `timeFaults` et
   `csoPoints` (déclaré à `cso.penalites-temps`).
7. C — `testRuns` présenté comme un contrôle de **forme** (commentaire du test) ; les preuves d'identité sont les rejeux.
8. C — `cheval.reception-concours` : plafond de 4 % exercé par `appel-pres` ; `cheval.acceleration` : 34 exécutions du
   canal « ch » (et non 10).
9. C + D — `diffHorse` compare désormais `rearAnim` (mutation de la phase du cabré détectée) ; nouveau scénario
   `cadence-depart` (cheval posé à 5,47 m/s : cadence de départ 5,5 et non 5,4 ; mutation « arrondi par défaut »
   détectée, témoin vérifié par `testHorseRuns`). `mutations-cso-horse.py` : 32 mutations, 22 détectées, 10 déclarées dans
   `ATTENDUES` (std::round ≡ jsRound pour v ≥ 0 ; eau ; pente ; trois branches hors épreuve ; rayon 12 m ; jt0 ; fenêtre
   de réception ; clause « marge < −late »).
10. D — sous-règles de `csoApproachRefusal` : refus lent (1,5 m, 3,2 m/s) **exercé** (mutations détectées) ; clause
    « marge < −late avec ideal ≤ L », rayon 12 m, fenêtre 0,6 s et état en l'air jt0 non départagés, déclarés (script,
    `cso.refus-decision`).
11. C — `Strides.Cso.HorseInGame` vérifie le nez : au plus OVERRUN (0,6 m) au-delà de la face tant que le cheval avance
    à plus de 0,5 m/s. Le garde-fou du web ne s'applique qu'au-dessus de 0,5 m/s (`obstacles.js:444`, `462-465`) : à
    l'arrêt le nez glisse encore, 0,708 m dans l'oracle `t3-refus-62` (0,15 m/s) ; le test relève la valeur à l'arrêt.
12. C — références de `StridesHorse.cpp` et `StridesHorse.h` dans `cso.json`, `interface.json`, `socle.json` et les
    autres fichiers d'inventaire recalées (`StartJump` n'existe plus : `TickCso :299-381`, seuils d'allure `:380`).
13. C — démo F8 rejouée (`-StridesShots -StridesShotsDir=<scratchpad>`, rendu Metal, 26 captures hors du dépôt) :
    « 60,32 / 64 s 0 pt Arrivée ✓ » ; dossiers `Saved/Screenshots/Strides` et `MacEditor` identiques avant et après
    (`shasum`). Inventaire : appui à **9,87 m** (première barre au moment de l'appui ; 9,66 m après le pas de l'image).
14. D — `mutations-cso-fences.py` : 18 mutations de plus sondées ; 55 au total, 38 détectées, 17 dans `ATTENDUES` (dont
    14 nouvelles : rayon 12 m, jt0, clause « marge < −late », éloignement de 8 m, cause « angle », trois des membres, résultat
    précédent annoncé, distance du détour, obstacle plein, entraînement, hors mission, seuil de vibration). Inventaire
    `cso.jugement-barres`, `cso.chute-barre`, `cso.contact-membres`, `cso.effleurement`, `cso.refus-unique`.
15. H — `cc66e3da` incohérent seul (captures au commit suivant) : non réécrit ; chaque commit de ce contrôle est
    cohérent seul (code, inventaire, `PARITE.md`).
16. C — « barre emportée vers le cheval » remplacée par « dans le sens de la marche » : §2 (ligne 7.1), description du
    scénario `t3-refus-62` (exporteur et oracle réexporté : seul le champ `desc` change), commentaire de
    `Strides.Cso.FencesInGame`.
17. C — `Strides.Cso.FencesInGame` avance l'heure du monde (`World->TimeSeconds`) à chaque pas : règle des 5 s vérifiée
    en jeu (refus non recompté puis recompté), barre emportée remontée plus de 3 s après le refus et cheval à plus de 5 m
    (au sol tant qu'il reste près). `UpdateFences` passe `missionActive` = épreuve du Pôle en cours (`CsoRun` non
    terminée), comme `g.missions.active` du web. La fenêtre de réception de 0,6 s n'est pas exercée en jeu (D, point 10).
18. R + D — déjà déclaré (`ATTENDUES`, `cso.refus-unique`) ; complété : « distance du détour ignorée » non détectée.
19. C — démo F8 et `-StridesShots` sans mode rejoués dans un dossier dédié (point 13) ; garde-fou renforcé (point 25).
20. C — `cso.capacite-cheval` : 47 exécutions rejouées depuis le lancement de l'activité franchissent l'étape (21
    scénarios t4-* en français et en anglais, `droit` et `t7-parfait-barre-2` dans les deux langues, `t6-entree` en
    français) ; le « 44 (22 scénarios) » de la première passe était faux (contrôle adverse).
21. C — §2 annoté comme tableau historique (références du 18/11, dont `SG/StridesHUD.cpp`).
22. C — `etat.json` : recompté par `wc -l` (voir l'inventaire, niveau « Code écrit »).
23. R — cause établie en R0 (`063d377d`) : cavaliers du décor remis à leur état d'apparition au setup ; réexport de
    `t3-refus-5s` ce jour identique à l'octet (épuisement de `rider230` à l'image 432).
24. D — épreuve lancée au démarrage et jamais terminée (bilan et fin de mission : T10, T11) : « Aucune mission active »
    ne s'affiche plus, l'objectif « Résultats… » reste ; écrit à `interface.objectif`.
25. C — `AStridesShots::ResolveShotsDir` compare sans tenir compte de la casse ; `Strides.Shots.OutputDir` couvre
    `…/PROTEGE`, une option relative en minuscules et le vrai dossier `…/Screenshots/strides`.
26. H — `23d57d32` affirmait un déterminisme atteint en `063d377d` ; HEAD est juste.
27. C — `cso.obstacles-habillage` dit en toutes lettres la couleur du mur (MI_Brick, MI_Plaster au lieu de #a4553f et
    #e9e6de : beige saumon contre rouge brique sur les montages) et passe de identique_prouve à **partiel** (contrôle
    adverse : l'état contredisait l'écart, le montage montrant la différence) ; tranche a : 27 / 29 / 22.
28. D — aucun contrôle ne voit un maillage importé en miroir (boîtes symétriques, barycentres pris dans le manifeste) :
    déclaré à l'inventaire ; message et commentaire de `Strides.Parite.CsoScenery` corrigés (« pose des pièces », signe
    des axes non relu) au lieu de « orientation ».
29. C — références décalées de T5 recalées (point 1).
30. D — état d'épreuve des captures posé depuis `poses.json` ; passage hors épreuve → épreuve prouvé par le test seul,
    aucun montage de l'état hors épreuve : écrit à `cso.obstacles-habillage`.
31. D — voir T6, Limites (ajout) et `camera.concours-decor` ; 6 mutations dans `ATTENDUES`.
32. C — `cso-spec.md` (§10, Unreal) et `unreal/docs/parite/README.md` (FOV) : `FieldOfView` n'est vertical qu'avec
    AspectRatio 1 ; la perche montre 32,6° verticaux.
33. C — gap flex : le chrono n'a plus d'écart de 9 px quand l'icône d'horloge est repliée (`cso-sober`) ;
    `Strides.Cso.HudWidget` compare sa marge à la position relevée dans le navigateur (0 px). Captures Unreal `hud-*`
    (16) et `cmd-*` (4) refaites en rendu Metal et montages régénérés ; `jeu-1` à `jeu-5` (partie réelle) **non refaites** :
    elles gardent le décalage de 9 px (refaites ensuite en T10, `46d41417` : voir l'hygiène finale, point 5).
34. C — `UStridesCsoHud::SetCourseViewport` transmet la hauteur réelle (px CSS) au modèle de l'épreuve ;
    `Strides.Cso.HudClock` l'appelle directement : 1280 × 720 → deux toasts, 844 × 390 → un, widget figé sans effet.
    L'appel à chaque image (`NativeTick`, `SG/StridesCsoHud.cpp:587`) n'est établi que par lecture du code : aucun test
    ne passe par `NativeTick` (écrit à `interface.toasts`).
35. D — seuil 420 px (seules 390 et 768 rejouées) et pas dt du décompte des crans (toujours 1/30) non départagés :
    écrit à `interface.toasts` et `interface.cadence-cso`.
36. C — références de `StridesHUD.cpp` recalées sur le fichier actuel (42 substitutions, toutes les références au fichier relues).
37. H — `40d4069b` incohérent seul (script en code 1) ; déclaré en T7, corrigé en `4e225342`.
38. C — `entrees.joystick` et la ligne §2 « Tactile : joystick flottant » ramenés à **partiel** (logique identique,
    rendu non identique, facteur de pixels iOS non vérifié) ; synthèse §1 corrigée.
39. C — synthèse §1 recomptée (13 / 58 / 51) avec l'avertissement que le §2 n'est pas tenu à jour pour T2 à T5.
40. C + D — `Strides.Cso.Controls` compare aussi la valeur du chrono écoulé à chaque image (au millionième de l'oracle) ;
    positions comparées par « déplacé ou non » seulement ; l'exporteur reproduit la condition de la boucle de
    `game.js:1406` sans la branche `renderHold` : écrit à `boucle.pause` et `boucle.suspension-simulation`.
41. D — `mutations-cso-input.py` : « stylet traité comme une souris » et « d ≥ R » ajoutées, non détectées, dans
    `ATTENDUES` (69 mutations, 67 détectées, code 0) ; `entrees.joystick`.
42. C — `StridesGameMode.cpp:28, 107-110` (cavalier à pied, 2 m à gauche) ; `SetActorLocationAndRotation` :
    `StridesHorse.cpp:126, 365, 430`.
43. C — `Strides.Cso.Controls` relit le slot du canevas (`SlotBoxOf`, placement effectif) et le dit (« placement, pas
    identité ») ; la preuve d'identité reste le montage. L'ancrage pour un viewport sans relevé n'est comparé par aucun
    test.

### Contrôle des remarques des contrôles adverses de T9 à C1 (hygiène finale, 21/11/2026)

Base `4b62c5f5`. C = corrigé, R = déjà réglé (preuve), D = déclaré (inventaire, ce document, script), H = historique
(rien à réécrire sans force push, interdit). **Aucun source du cœur ni du module de jeu n'est modifié** : 2,7 Go libres
(`df -h /Users/julien`), sous les 8 Go demandés avant une étape lourde, donc ni compilation Unreal, ni tests Automation,
ni captures Unreal, ni démonstration F8 dans cette passe ; le dernier passage vert (C1 : compilation, 32 tests
Automation, démo F8) vaut pour le code inchangé. Corrections : inventaire, documents, scripts de mutations, un montage
réassemblé. `ctest` rejoué : 300 728 vérifications, 0 échec.

1. C — écarts d'avant T5 et T7 : `cso.ordre-fautes` (numéro surligné affiché depuis T5 par
   `AStridesCourse::SetHighlight`, `SG/StridesCourse.cpp:56-61`, appelée par `FlushRunCalls` quand le numéro change, ligne
   350), `cso.cloche`, `cso.temps-limite`
   et `cso.arrivee` (grand message du HUD d'épreuve UMG, rendu à `interface.grand-message`), `cso.cause-barre` (toast du
   HUD UMG, `interface.toasts`), `cso.guidage-prochain` (« ▸ » dessiné par le HUD UMG ; « > » seulement dans le HUD de
   débogage, hors épreuve).
2. C — `cso.chute-barre` : « le parcours Unreal passe toujours « mission en cours » » retiré (`missionActive` = épreuve
   en cours, `SG/StridesCourse.cpp:481`) ; la remise hors mission à 60 m reste non exercée, faute d'oracle.
3. C — `relais-mac.md`, « Parité de la tranche a » : recomptée sur les 78 lignes (27 / 37 / 14) ; joystick retiré
   (tranche h), `cso.comparaison-resultats` parmi les prouvés, Recommencer parmi les partiels.
4. C — `camera.concours` : sous-branches non départagées écrites dans son écart (point visé remis à zéro, `h.groundY`,
   emprise de l'obstacle survolé), comme dans `camera.concours-decor` et `ATTENDUES`.
5. R — `jeu-1` à `jeu-5` ont été refaites en T10 (`46d41417`, 20/11 16:39), après la correction du décalage
   (`58cb93da`, 09:09 ; `SG/StridesCsoHud.cpp:632`) : « non refaites » de `interface.tableau-cso` était faux, corrigé.
   D — ces captures précèdent T11 (`jeu-5-bilan` sans carte de bilan), T12 et C1 (cheval gris) :
   `interface.hud-sobre-cso`, `parite/README.md`.
6. C — bande de moins de 0,2 m : recomptée dans `ORA/cso_takeoff_zone.json` (`python3`) : 195 cas sur les 8 jeux de
   hauteurs, toutes hauteurs confondues, dont 18 à la base 1,05 et 11 à la base 1,10 de l'épreuve (puissances 1,1 et
   1,35), 39 hors épreuve, 54 à 1,55 ; justification corrigée dans `cso.aide-zone-appel`, la ligne 4.2 du §2 et
   `ATTENDUES` de `mutations-cso-aids.py` (aucune exécution n'en pose ; seule la plage est comparée, pas la bande).
7. D — branche « cheval absent » : mutations « tracé borné au cheval sans cheval » et « zone affichée sans cheval »
   ajoutées, non détectées, déclarées (`player.js:56`, `SG/StridesCourse.cpp:567`) ; écarts de `cso.aide-zone-appel` et
   `cso.aide-trace-sol`.
8. C — `cso.aide-bouton-saut` : `test_core.cpp:640` (`testTarget`) et `:593` (`csoTiming` après chaque image,
   `testHorseRuns`).
9. D — `aide-ambre-*` requalifié : aucune preuve visuelle de la bande (masquée par le couple) ; preuve par le canal
   « ai » (36 appels) et `aide-unreal.json` : inventaire, T9 ci-dessus, `parite/README.md`, note de validation.
10. D — composition des entrées des aides par `AStridesCourse::UpdateAids` (next, prevS, showLine, showZone, dt,
    clearance) non comparée image par image : `cso.aide-zone-appel`, `cso.aide-trace-sol`.
11. D — `CAPTURE_MS` = 250 ms : écrit comme modèle ajusté, pas une reproduction, sans effet sur les aides ni sur le bouton
    SAUT (`cso.aide-zone-appel` ; `export-cso-runs.mjs:362-366` le disait déjà).
12. H — message de `dbe34ef1` (258 758 vérifications annoncées, 259 715 réelles d'après le contrôle) : non réécrit,
    noté dans T10.
13. C — `cso.trace-pole` `:154-188` (`checkTrace`) ; `cso.plan-parcours` `test_core.cpp:1202-1257` et
    `SC/CoursePlan.cpp:73-160` (fonctions relues à HEAD : `test_core.cpp` a encore bougé depuis la remarque).
14. D — HUD des montages `entree-3` et `entree-4` : appels `hud.*` de l'exécution web rejoués (`StridesCsoHudReplay::Run`,
    `SetFrozen`), « N° 40 · Test » est le texte du web, le dossard du jeu (40 + ⌊temps⌋ mod 50) n'est sur aucun
    montage ; logique de l'annonce prouvée par `testCsoRuns` et `Strides.Cso.Entry` (début et fin du texte seulement) :
    `cso.entree-piste`, `cso.cloche`, T10, `parite/README.md`.
15. D — mutations du module de jeu de T10, sans script versionné : retirées des preuves (`cso.presentation`,
    `cso.entree-piste`, T10) ; script à écrire (voir la liste ci-dessous).
16. D — `entree-unreal.json` : `gestures` vide pour les 8 poses (relevé recréé à chaque rappel d'`ApplyPose`), comptes du
    plan = itérations d'`OnPaint`, carte comparée pour 4 poses seulement : `cso.presentation`, `cso.plan-parcours`, T10,
    `parite/README.md`. Correction de l'outil non faite (compilation et captures).
17. D — texte initial « 0,00 » (`hud.js:74`) : déclaré dans `cso.tableau-chrono` et `interface.tableau-cso`. Correction du
    cœur non faite : elle change l'état que le module de jeu rejoue, sans pouvoir relancer les tests moteur.
18. C — instant de l'annonce : `cso.mjs:59-63` lit le grand message après `tick(2)` puis `tick(28)` (30 images ; la pose
    est à la 28e, même texte) : `cso.entree-piste`, T10, `parite/README.md`.
19. C — `cso.cloche` : écart réécrit (rien sur la logique et les textes ; rendu à `interface.grand-message` ; son joué
    depuis T12) ; la ligne reste identique_prouve (convention ci-dessous).
20. C — `cso/bilan-touch-844x390.png` réassemblé (`ffmpeg … hstack`) avec `bilan-2-carte-844x390-unreal.png` actuelle :
    moitié droite = capture versionnée (empreinte des pixels RGB identique), au lieu de la capture de `97d1d013`.
21. D — `bilan-3` et `bilan-4` : HUD derrière la carte différent du web (`diffs` de `bilan-unreal.json` : toasts, grand
    message, mot d'appel, crans) : `cso.bilan`, `parite/README.md`, note de validation.
22. C — `cso.arrivee` et `cso.cause-barre` réécrits (HUD UMG, sons de T12, causes des membres jamais produites) ;
    `cso.arrivee` reste identique_prouve (convention ci-dessous), `cso.cause-barre` partiel.
23. C — `cso.classement-simule` ramené à **partiel** : graine négative, le web tire et nomme un cheval `undefined`
    (`ranking.js:18`), le portage lève une exception (`SC/Ranking.cpp:70`) ; non atteignable en jeu.
24. C — « défilé comme le doigt » remplacé par « défilé par programme » (`ScrollCardForTest`, `SetScrollOffset` ; web :
    `scrollTop`) ; défilement au doigt non exercé : `cso.bilan`, `parite/README.md`.
25. C — provenance du journal des sons : dans les 60 exécutions légères, sons du cheval tirés des événements de l'oracle
    et click recomposé par une règle écrite dans le test : `cso.sons-parcours`, `audio.cheval`, `audio.concours`,
    `audio.interface`, T12, note de validation.
26. D — click joué sur une descente refusée (saut) ou au-delà de 2,5 m/s : `audio.interface`. Correction de `DoAction`
    non faite (compilation et tests moteur requis).
27. C — §1 et §2.12 de ce document : sons portés en T12, captures de la recette faites.
28. C — « deux exports donnent les mêmes octets » précisé (tolérance ; dossier vide : 3 sons sur 19, dont `bell`) : T12,
    `audio.*`, commentaires d'`export-cso-sounds.mjs`. Non revérifié par un nouvel export (il réécrirait le manifeste et
    les WAV de travail).
29. D — `Strides.Cso.Audio` plus faible que son commentaire (refus au 2 sauté sans erreur si l'obstacle manque ; « même
    image » par adjacence) : T12, note de validation. C — paquet iOS non fait : justifié par l'estimation (environ 3 Go,
    soit environ 9 Go restants), pas par les 12,0 Go.
30. C — `joueur.teleport-reprise` `:82-89` ; `monde.carre-du-monde` `LoadScene :246-278` ; `cheval.robes`
    (`HorseCoat.cpp:77-204`, `coatUniforms :108-134`, `srgbHexToLinear :95-105`, `ownedHorses :137-160`,
    `activeHorseId :163-168` et `:170-187`) ; `donnees.ecurie-joueur` `:137-187`.
31. C — cheval gris : `cso.entree-piste` et T10 disent « captures antérieures à C1 » ; `parite/README.md` pour `jeu-*`.
32. C — `cheval.mouille` ramené à **absent** (point d'entrée du shader seulement).
33. D — réglages fixes des matériaux de robe écrits dans `import-horse-coat.py` sans oracle (deux faces, 0,35, Specular
    0, 0,32) ; `alphaTest` et `doubleSided` comparés à l'oracle mais non appliqués : `cheval.robes`.
34. D — identifiant non chaîne dans `save.horses` (`[["ulysse"]]`) : `donnees.ecurie-joueur`.

**Recontrôle des 78 lignes de la tranche a** (écarts relus contre le code de HEAD, références vérifiées par un relevé
des bornes de fonction, `python3` dans le scratchpad) : écarts devenus faux hors de la liste, corrigés :
`cso.declenchement-saut` (« Trop tôt » affiché depuis T9), `cso.trajectoire-saut` (la hauteur réelle juge chaque barre
depuis T3), `cso.qualite-appel` (« short » produit par le jugement porté en T3, `SC/CsoFences.cpp:133`),
`cso.obstacles-habillage` (tracé au sol porté en T9), `cso.hauteurs-profil` (6 bases comparées depuis T10,
`test_core.cpp:1224`), `cso.comparaison-resultats` (`rankResults` porté en T11), `interface.celebration` (non appelée au
Pôle ; ovation jouée depuis T12), `interface.astuces-cheval` (« Trop tôt » porté en T9 : **absent → partiel**, joué à
l'écran) ; écarts recadrés sur leur fonction : `cso.geometrie-chandeliers-barres`, `cso.elimination-descente`,
`monte.descente-elimination` (conditions de descente renvoyées à `monte.interaction-descendre` : au galop, le portage
laisse descendre et donc éliminer) ; références : `camera.concours` `CsoCamera.cpp:36-135`, `cso.entree-piste`
`StridesCourse.cpp:141-154`, `cso.capacite-cheval` `CsoEntry.cpp:168-211`, `cso.presentation` `CsoEntry.cpp:91-164`,
`cso.classement-simule` `Ranking.cpp:13-111`, `testCsoSounds` `test_core.cpp:3073-3190` (4 lignes). Tranche a :
**27 identique_prouve, 37 partiel, 14 absent** (28 / 35 / 15 avant).

**Scripts de mutations du cœur** : depuis T12 (`CsoAudio.cpp`) puis C1 (`HorseCoat.cpp`), l'édition de liens de leur
banc échouait (symboles indéfinis : `test_core.cpp` appelle `testCsoSounds` et `testHorseCoat`) : chaque mutation
sortait « compilation échouée », comptée non détectée, et le témoin non muté plantait ; 9 scripts sur 10 ne jugeaient
plus rien depuis T12, `mutations-cso-audio.py` depuis C1. Listes de sources complétées ; rejeu complet le 21/11/2026 :
les 11 scripts du cœur sortent en code 0, toutes les non détectées
dans `ATTENDUES` : `mutations-cso-aids.py` 57 mutations, 46 détectées, 11 déclarées (dont les deux « cheval absent ») ;
`-audio` 27, 22, 5 ; `-camera` 30, 24, 6 ; `-entry` 59, 55, 4 ; `-fences` 55, 38, 17 ; `-horse` 32, 22, 10 ; `-hud` 49,
48, 1 ; `-input` 69, 67, 2 ; `-ranking` 76, 67, 9 ; `-run` 83, 78, 5 ; `mutations-horse-coat.py` 39, 38, 1 (sources pris
par motif, intact). `mutations-cso-controls.py` (module de jeu, UnrealEditor) n'est pas rejoué (disque).

**Convention d'état** : une ligne de règle (déroulé, texte, journal d'appels) est identique_prouve quand sa règle, ses
textes et ses appels sont prouvés par oracle et que tout son rendu relève d'une ligne `interface.*` ou `audio.*` qui en
porte les écarts (`cso.cloche`, `cso.temps-limite`, `cso.arrivee`, `cso.ordre-fautes`) ; une ligne qui déclare elle-même
une différence de rendu ou de comportement reste partielle (`cso.retour-appel`, `cso.tableau-chrono`,
`cso.presentation`, `cso.classement-simule`). Un cas que le portage ne peut pas recevoir et qu'aucun appel ne passe
(`cso.comparaison-resultats` : résultat absent) est déclaré non départagé, pas compté comme différence.

### Ce qui reste pour une tranche a entièrement identique (21/11/2026, par ordre d'importance visible pour le joueur)

1. **Cheval et cavalière en mouvement** : clip de saut non calé sur la parabole (seuil 7 m/s au lieu de 8, durée non
   ajustée, retour sec à la réception : `cheval.saut-animation`), postérieurs libres à l'appel, membres non réglés sur
   la hauteur des barres, sellerie absente, couple rendu d'une autre taille (T6) ; cavalière : tranche b (référence à
   trancher).
2. **Contacts et collisions** : barres qui tombent sans contact visible ou membre qui traverse une barre (détection des
   membres non portée : `cso.contact-membres`, `cheval.contacts-membres-barres`) ; ailes et barres traversables
   (`cso.obstacles-collisions`).
3. **Couleurs et lumière** : mur beige saumon au lieu de rouge brique (couleurs de sommet exportées non appliquées),
   ombres des nuages des obstacles absentes, rendu Metal plus clair (flanc du cheval 20 à 30 %), bandes et tirets des
   aides plus ternes (mélange avant tone mapping), cheval gris sur les captures antérieures à C1.
4. **Sons** : compresseur du bus maître non porté (la chaîne du web change le RMS d'un son seul de −8,7 à +3,5 dB), une seule réalisation
   du hasard par son, souffle au galop et pas des sabots absents (foulées de l'animation), click sur une descente
   refusée ; écoute réelle jamais faite.
5. **Police Geist** non embarquée (licence et fichier à décider) : graisses, chiffres non monospaces, hauteur du tableau
   (2 à 3 px), colonnes du bilan à 8,2 px au plus, mot coupé autrement, cartes de présentation et du plan relevées pour
   Comète en français seulement.
6. **Animations et effets d'interface** : fondu d'ouverture des cartes absent, « Toucher pour fermer » sans
   clignotement, transition et état enfoncé du bouton SAUT, halo approché, ombres portées absentes, pop du grand message
   et fondu des crans non comparés image par image.
7. **Autour de l'épreuve** : public en liesse non animé au sans-faute, coupe franche à la sortie de piste au lieu de la
   caméra du monde ouvert, HUD du cavalier à pied après l'élimination et HUD hors épreuve derrière le bilan non portés,
   cible GPS (7 m avant l'obstacle) et bandeau d'objectif du lancement absents.
8. **Fonctions absentes** : « S'entraîner » et paddock (`cso_warmup`), défis (versions, déroulé, accès, écrans, carte de
   partage) et records par défi, astuces « Trop lent » et « Cheval essoufflé », dotation, `reportScore`, récompenses de
   fin de mission.
9. **Différences de logique peu visibles** : commandes de concours actives hors épreuve (`bCsoControls`), descente
   possible au galop (élimination que le web ne permet pas), graine négative du classement, texte initial « 0,00 » du
   tableau caché, dégagement toujours 0 et puissance sans équipement ni état.
10. **Preuves à compléter** : rendu mobile iOS (ES3.1 / Metal mobile), appareil réel (toucher, facteur de pixels, zones
    sûres, performances, budget de triangles), paquet iOS signé ; montages à refaire après C1 et T11 (`entree-*`,
    `carriere-*`, `hud-*`, `aide-*`, `bilan-*`, `jeu-*`) ; défilement de la carte de bilan au doigt ; script versionné
    des mutations du module de jeu de T10 ; relevé `entree-unreal.json` à corriger (gestes, primitives dessinées) ;
    sous-branches non départagées déclarées dans les `ATTENDUES` des scripts.

### Ordre et dépendances

```
T1 ─┬─ T2 ─ T3 ─┬─ T12
    ├─ T4 ──────┤
    ├─ T5       │
    └─ T6       │
T2 + T4 ─ T7 ─ T8 ─ T9 (avec T5)
T4 + T7 + T5 ─ T10 ─ T11 ─ T12 (recette)
```

Ordre conseillé : T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12. T4, T5 et T6 peuvent avancer en parallèle de T2 / T3
une fois T1 livré (leurs tests rejouent la trajectoire web, pas le cheval Unreal).

### Hors plan (à inscrire à l'inventaire, sans rien inventer)

- Contacts des membres (WildMesh) : dépend de la parité de l'animation du cheval PJL.
- Entrées concours, défi v6, missions d'histoire, `cso_warmup`, `reportScore`.
- Chute du cavalier : absente du web, donc à ne pas ajouter.
- Démonstration automatique F8 et `-StridesShots` : outils de développement, à garder hors du chemin de jeu iOS.

### Risques transverses

- Compilation UBT incrémentale environ 1 min par itération ; `unreal/core` hors moteur en secondes : y faire l'essentiel.
- Captures : rendu GPU réel sur le Mac mini, session ouverte ; web en SwiftShader (lent, rendu différent) : la parité
  visuelle porte sur la mise en page, la géométrie, les couleurs de base et les textes, pas sur le pixel.
- Rendu mobile : les captures Mac utilisent le rendu de bureau ; l'aperçu du rendu mobile (ES3.1 / Metal mobile) est à
  confirmer pour que la comparaison vaille pour iOS.
- Pixel Streaming : seulement pour les essais à distance sur Mac (déjà limité au Mac dans le `.uproject`), jamais dans un
  paquet iOS.
- Le web de référence (`claude/gt-humains-v3`) n'est pas la production : seul le chantier cavalier diffère, sans effet
  sur les règles du CSO ; recontrôler l'identité des oracles (procédure du §0, point 1) à chaque reprise.
