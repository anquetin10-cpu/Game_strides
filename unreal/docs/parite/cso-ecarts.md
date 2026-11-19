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
   FOV 70 (`SG/StridesShots.cpp:28-35`, `67`), aucune dans une pose de la recette CSO. `unreal/docs/parite/<système>/` :
   aucune capture.

---

## 1. Synthèse

Décompte du tableau §2 (122 lignes) : **identique_prouve 10**, **partiel 51**, **absent 61** ; niveaux : teste 21,
joue_ecran 7, compile 33, aucun 61. Tout ce qui est
identique_prouve est de la logique pure de `StridesCore` (tracé, hauteurs, temps accordé, pénalités de temps, saut, conduite
en fonctions) ; rien de ce qui se voit ou s'entend n'est prouvé.

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
   0,2 − 1,10 = −0,90 ⇒ barre comptée à la réception (`SG/StridesCourse.cpp:79-82`), environ 5,5 m avant l'obstacle.
   La démonstration appelle à 0,9 × 13 m (`SG/StridesHorse.cpp:217-218`), ce qui est cohérent avec les 4 points pris à
   presque chaque obstacle dans `.tmp/shots.log` (lien de cause déduit du code, à confirmer à l'écran).
3. **Saut oblique compté franchi.** `FenceAhead` n'a aucun filtre d'angle (`SG/StridesCourse.cpp:60-74`) ; au-delà de 60°,
   `planJump` rend un plan sans marge (`SC/JumpModel.cpp:74-80`) et `JumpLanded` compte l'obstacle franchi
   (`SG/StridesCourse.cpp:80-81`). Web : pas de cible (`obstacles.js:358`), donc pas de saut, et refus si l'écart nez/face
   < v²/16 + 0,3 (`obstacles.js:455`).
4. **Saut libre en épreuve** (`SG/StridesHorse.cpp:172`) ; web : interdit en commandes de concours (`horse.js:119`).
5. **Barres jugées à la réception sur la marge du plan**, pas au passage de chaque barre (`SG/StridesCourse.cpp:76-86`) ;
   seule la dernière barre bouge, téléportée de 40 cm (`SG/StridesFence.cpp:76-81`).
6. **Refus** décidé seulement à moins de 0,55 m de la première barre mesurés depuis l'origine du cheval
   (`SG/StridesHorse.cpp:249-256`), arrêt instantané sans freinage ni cabré, aucune règle de recomptage ; toast « +4 »
   même quand le juge ignore le refus (`SG/StridesCourse.cpp:91-92`).
7. **Aucune interface d'épreuve** : HUD texte de débogage (`SG/StridesHUD.cpp:25-79`), minicarte et huit boutons
   tactiles toujours visibles, aucun son dans tout `Source/`.
8. **Caméra** : 55° horizontaux (≈ 27,1° verticaux en 844 × 390, calcul) contre 58° verticaux (≈ 100,4° horizontaux) :
   champ vertical environ deux fois plus étroit (`SG/StridesHorse.cpp:63`).

Contrainte vérifiée : Pixel Streaming 2 est limité au Mac (`unreal/StridesGrandTour/StridesGrandTour.uproject:15`,
`PlatformAllowList: ["Mac"]`), conforme à « jamais dans iOS ».

---

## 2. Tableau d'écarts par élément de la spécification

### 2.1 Entrée dans l'épreuve (§1)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 1.1 | Poteau « Chrono » en (336 ; −184), zone r 6 m centrée sur CSO_GATE, à cheval, sans mission | absent | aucun | aucune occurrence dans `Source/` | pas de poteau ni d'interaction ; la ligne de départ est toujours active |
| 1.1 | App Activités : carte, meilleur temps, bouton `Itinéraire` (GPS) | absent | aucun | téléphone = liste de noms (`SG/StridesHUD.cpp:57-75`) | pas d'app Activités, pas de GPS vers le poteau |
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
| 2.2 | Tracé : positions, caps, abscisses des 10 éléments | identique_prouve | teste | `SC/CsoCourse.cpp:32-71` ; `TC:79-97` | trou de preuve : le test trace `poleDesign()` recopié à la main (`SC/CsoCourse.cpp:11-30`) alors que le jeu trace le design lu dans le JSON (`SG/StridesDataSubsystem.cpp:84-108`) ; contenu identique aujourd'hui, chemin JSON non testé |
| 2.2 | Longueur 368,44 m, arrondi 368 | identique_prouve | teste | `TC:83`, `100` ; `SG/StridesCourse.cpp:26` | — |
| 2.2 | Abord hors chrono (lead-in) | partiel | compile | `SC/CsoCourse.cpp:65` | calculé, utilisé par la démo seulement (`SG/StridesHorse.cpp:186-192`) ; absent de l'oracle |
| 2.3 | Hauteurs `cso_train` (1,1 + profil, arrondi au cm) | identique_prouve | teste | `TC:98-99` ; `SG/StridesCourse.cpp:15` ; `SGh/StridesCourse.h:22` | — |
| 2.3 | Hauteurs hors épreuve `csoHeights(1.15)` | absent | aucun | `SGh/StridesCourse.h:22` | toujours 1,10 |
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
| 2.4 | Franchissement du départ (\|u\| < 3,8 m, cap à 60°) | partiel | compile | `SG/StridesCourse.cpp:30-39` | demi-largeur 6 m au lieu de 3,8 ; sens et cap conformes |
| 2.4 | Franchissement de l'arrivée (sans cap, après le dernier élément) | partiel | teste | `SG/StridesCourse.cpp:38`, `53` ; `SC/CsoCourse.cpp:131-135` ; `TC:124` | cap exigé (pas au web) ; demi-largeur 6 m ; ordre « après le dernier » testé à la main |
| 2.4 | Bip de départ `tone(1568, 0.1)` | absent | aucun | — | remplacé par un texte « Départ : le chrono est lancé » sans équivalent web (`SG/StridesCourse.cpp:48`) |
| 2.5 | Temps accordé 64 / 59 / 56 s | identique_prouve | teste | `TC:100-102` ; `SG/StridesCourse.cpp:26` | — |
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
| 3 | Clavier : flèches / WASD (ZQSD), Espace, Échap, P/Tab, M ; Ctrl / Alt = amplitude 0,5 / 0,25 | partiel | joue_ecran | `SG/StridesPlayerController.cpp:45-63` ; VM:15 | liaisons par caractère doublées (W et Z, A et Q) au lieu des codes physiques ; pas d'Échap ni de Tab ; M lance une mission ; Ctrl / Maj = allure −/+ |
| 3 | Tactile : joystick flottant r 58 px, zone x < 45 %, y > 30 % | absent | aucun | `unreal/StridesGrandTour/Config/DefaultInput.ini:4-5` | joysticks virtuels fixes du moteur |
| 3 | Sortie de piste 2,6 s, cadence → 1,9 m/s à −1,6 m/s² | absent | aucun | — | — |
| 3 | Menu pause : rappel des commandes, bascules `Tracé au sol` et `Aide au saut` | absent | aucun | `SCh/SaveGame.h:26` | réglage `jumpAid` stocké sans effet ; `courseLine` absent |
| 3 | Gel cheval + chrono (téléphone, pause, carte, dialogue) | absent | aucun | `SG/StridesPlayerController.cpp:156` ; `SG/StridesCourse.cpp:51` | téléphone ouvert : cheval et chrono continuent |

### 2.4 Aide à l'appel (§4)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 4.1 | État `timing()` (none en l'air, en refus, v < 3,2 ; refuse → near ; aide off → none) | absent | aucun | — | — |
| 4.1 | Obstacle visé `target()` (épaules à 0,4 m, cos ≥ 0,5, première ≤ 13 m, dernière ≥ −0,3, \|u\| ≤ 2,25) | partiel | compile | `SG/StridesCourse.cpp:60-74` | centre de l'obstacle depuis l'origine ; écart latéral < 2,5 m ; aucun filtre d'angle ; « centre devant » au lieu de « dernière barre ≥ −0,3 » |
| 4.1 | Bouton SAUT coloré (Trop loin / Saute ! / Trop près / Saut / Trop tôt 600 ms) | absent | aucun | `SG/StridesTouchControls.cpp:43` | libellé fixe `SAUT`, fond fixe |
| 4.2 | Zone d'appel au sol (`takeoffZone`, bandes verte / ambre) | absent | aucun | — | — |
| 4.3 | Tracé au sol (tirets, opacités, masquage, règle des 15 m) | absent | aucun | — | — |
| 4.4 | Repère conique au-dessus de l'obstacle suivant | absent | aucun | — | — |

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
| 5.5 | Jugement de chaque barre au passage des épaules (interpolation, marge, −0,06) | partiel | compile | `SG/StridesCourse.cpp:76-86` | décidé à la réception sur `Plan.margin` ; virage en l'air sans effet ; seul l'obstacle visé à l'appel est jugé |
| 5.5 | Effleurement (marge < 0,04 : tinte, vibre) | absent | aucun | — | — |
| 5.5 | Cause `short` (au sol pendant le passage), cause `angle` si marge du plan ≥ 0 | absent | aucun | — | — |
| 5.5 | Résultat différé (membres jugés : 2,2 m ou 1,2 s) | absent | aucun | — | — |
| 5.6 | `takeoffQuality` | identique_prouve | teste | `SC/JumpModel.cpp:127-140` ; `TC:58` | — |
| 5.6 | Mot d'appel sous le chrono (textes FR, couleurs, 1500 ms, règles barre / sans-faute) | partiel | compile | `SG/StridesHUD.cpp:39` ; `SG/StridesCourse.cpp:83-85` | identifiant anglais brut (`perfect`), permanent ; ni table de textes, ni couleurs, ni règles de choix |
| 5.6 | Sans-faute : bip 990 Hz, obstacle suivant surligné | absent | aucun | `SG/StridesCourse.cpp:85` | à la place, un message « {n°} franchi · appel {id} » sans équivalent web |

### 2.6 Barres qui tombent (§6)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 6.1 | Moment de la chute (montée : tout de suite ; descente : après 1,1 m ou > 8 m) | absent | aucun | `SG/StridesCourse.cpp:82` | chute à la réception |
| 6.1 | Oxer : chaque barre touchée tombe, une seule faute | partiel | compile | `SG/StridesFence.cpp:78-80` | une faute (conforme), mais seule `Bars.Last()` (barre arrière) bouge |
| 6.2 | Chute déterministe (taquets, élan, rebonds, glisse, roulement, inclinaison) | absent | aucun | `SG/StridesFence.cpp:80` | téléportation +40 cm en X local, à 6 cm du sol ; cumulatif à chaque appel |
| 6.2 | Vibration d'effleurement | absent | aucun | — | — |
| 6.3 | Contacts des membres (capsules, balayage, fenêtre) | absent | aucun | — | — |
| 6.4 | Barre comptée +4 (attendu, bon sens) | partiel | teste | `SC/CsoCourse.cpp:110-115` ; `TC:126-136` | scénario écrit à la main |
| 6.4 | Toast « Barre au {n°} · +4 · {cause} » et textes de cause | partiel | compile | `SG/StridesCourse.cpp:85` ; `SC/JumpModel.cpp:151-161` | texte « {n°} barre +4 · appel {id} » ; aucun texte de cause (identifiants seulement) |
| 6.4 | Barres au sol jusqu'à la fin, remise à la manche suivante ou hors mission > 60 m | partiel | compile | — | jamais remises |

### 2.7 Refus (§7)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 7.1 | Décision (largeur, toward > 0,3, v > 0,5 ; zone refuse, marge < −0,3 côté près, lent et nez < 1,5 m ; oblique : écart < v²/16 + 0,3) | partiel | compile | `SG/StridesHorse.cpp:249-259` | seul cas : première barre à < 0,55 m de l'origine ; branche `else StartJump(F)` (`:257`) = saut automatique sans équivalent web, inatteignable car première barre < 0,55 implique zone refuse (`SC/JumpModel.cpp:92`, déduit du code) |
| 7.1 | Freinage jusqu'à l'arrêt, cabré 1,1 s, `neigh` | absent | aucun | `SG/StridesHorse.cpp:167`, `256` | vitesse mise à 0 d'un coup, 1,2 s sans animation |
| 7.1 | Refus tout contre : barre avant tombe vers le cheval, remontée 3 s plus tard | absent | aucun | — | — |
| 7.1 | Dérobade : rien compté ; SAUT → « Trop tôt » | partiel | compile | `SG/StridesCourse.cpp:71` | rien compté (conforme) ; SAUT lance un saut libre, ou un saut vers l'obstacle si l'écart latéral < 2,5 m |
| 7.2 | Recomptage seulement après détour (> profondeur/2 + 6 m) ou 5 s | absent | aucun | `SG/StridesHorse.cpp:228` | seul délai : 1,2 s |
| 7.2 | Refus compté (chrono lancé, face, attendu) +4 | partiel | teste | `SC/CsoCourse.cpp:116-120` ; `TC:137-144` | scénario écrit à la main |
| 7.2 | Refus sur un élément B : reprise au A | partiel | teste | `SC/CsoCourse.cpp:121-126` ; `TC:141-142` | scénario écrit à la main |
| 7.2 | Cadence remise à 0 sur refus compté | partiel | compile | `SG/StridesHorse.cpp:167`, `256` | remise à 0 à tout refus, compté ou non |
| 7.2 | Toast « Refus au {n°} · +4 », hints 3500 ms (double / demi-tour) | partiel | compile | `SG/StridesCourse.cpp:91-92` | toast émis même si le juge ignore le refus ; hints absents |
| 7.2 | Élimination au 2e refus | partiel | teste | `SC/CsoCourse.cpp:127` ; `TC:145-146` | texte « 2e refus : éliminé » au lieu de « 2e refus : éliminé du parcours. » ; pas de grand message |

### 2.8 Chrono (§8)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 8.1 | Départ par la ligne, par les 45 s, ou départ lancé | partiel | compile | `SG/StridesCourse.cpp:45-49` | ligne seule (6 m) |
| 8.1 | Obstacles sautés avant le départ ignorés, hint 3000 ms | partiel | teste | `SC/CsoCourse.cpp:105`, `111` ; `TC:120-121` | hint absent |
| 8.2 | Écoulement : dt de mission, nul en pause / téléphone / dialogue | partiel | compile | `SG/StridesCourse.cpp:51` | dt compté dès l'image du départ (web : à partir de l'image suivante, `courses.js:291-303`) ; aucun gel |
| 8.3 | Affichage `dec(t, 2)` (virgule) `/ 64 s`, `Départ {ceil(bell)} s · accordé 64 s`, ambre en dépassement | partiel | compile | `SG/StridesCourse.cpp:103-112` | « %.2f s · %d pts · prochain : %s » : point décimal, pas de « / 64 s », points sans pénalités de temps (web : en direct, `courses.js:148`), pas d'ambre, pas de décompte |
| 8.4 | Pénalités de temps (1 par seconde entamée) | identique_prouve | teste | `SC/CsoCourse.cpp:83-86` ; `ORA/cso_course.json` `timeFaults` ; `TC:103` | `points()` (`:136-139`) reprend la formule, couvert par un seul scénario manuel (`TC:134-135`) |
| 8.4 | Élimination : descente de cheval | partiel | teste | `SG/StridesCourse.cpp:95-98` ; `SG/StridesRider.cpp:118` ; `TC:154-158` | seulement après le départ (web : à chaque image, y compris avant, `courses.js:322`) ; descente impossible en l'air ; message différent |
| 8.4 | Élimination : effets (`bell(2)`, `ÉLIMINÉ` / motif 2600 ms, fin immédiate et bilan) | absent | aucun | `SG/StridesCourse.cpp:52`, `97` | ligne de texte seulement |
| 8.5 | Erreur de parcours (une fois par obstacle, son, toast, hint 3500 ms) | partiel | teste | `SC/CsoCourse.cpp:107`, `113` ; `TC:131` ; `SG/StridesCourse.cpp:84` | comptée à chaque passage ; message nommant l'obstacle sauté au lieu de l'attendu ; ni son ni hint |

### 2.9 HUD (§9)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 9 | Classes `cso-ctl` / `cso-sober` / `cso-on` et masquages | absent | aucun | `SG/StridesHUD.cpp:36-53` | minicarte, vitesse, sauvegarde, progression, mission toujours affichées |
| 9 | Tableau `.cso-board` (chrono, accordé, points, prochain, style) | partiel | compile | `SG/StridesHUD.cpp:37` | une ligne de texte `DrawText` |
| 9 | Crans de cadence (6 barres, 2 s après réglage) | absent | aucun | `SG/StridesHUD.cpp:36` | valeur numérique « cadence %.1f » |
| 9 | Objectif masqué en épreuve | absent | aucun | `SG/StridesHUD.cpp:50` | statut de mission affiché |
| 9 | Astuce `.hint` | absent | aucun | — | — |
| 9 | Toasts (2 au plus, 1 si h ≤ 420 px, 3200 ms) | partiel | compile | `SG/StridesHUD.cpp:19-23`, `44` | une seule ligne, 3 s, écrasée par l'événement suivant |
| 9 | Grand message (titre, sous-titre, `pop` 0,5 s) | absent | aucun | — | — |
| 9 | Bouton SAUT 104 × 104, 6 px du bord, 8 px du bas | partiel | compile | `SG/StridesTouchControls.cpp:43` | 150 × 92 à (−32 ; −132) |
| 9 | Bouton pause en haut à droite | absent | aucun | — | — |
| 9 | Éléments masqués en épreuve (portefeuille, téléphone, BOOST, sifflet, cardio, endurance, action) | absent | aucun | `SG/StridesTouchControls.cpp:44-50` | MONTER, ALLURE ±, SAUVER, CHARGER, TÉLÉPHONE, MISSION toujours visibles |
| 9 | Notifications retenues puis relâchées | absent | aucun | — | — |

### 2.10 Caméra (§10)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 10 | Caméra de concours (back 6,6, up 3,4, lookAhead 9, lookUp 1,1, fenceBias, lead 0,18, yawK / yawAcc, posK / yK, jumpFollow 0,12, minBack, fenceClear, enter 1,2 s) | partiel | compile | `SG/StridesHorse.cpp:53-63` | SpringArm 6,5 m depuis un pivot à 1,85 m, inclinaison −9°, retard 6 ; aucun des paramètres web ; suit 100 % de la parabole (bras sur la racine) |
| 10 | FOV 58° vertical fixe | partiel | compile | `SG/StridesHorse.cpp:63` | 55° horizontal (≈ 27,1° vertical en 844 × 390, calcul) |
| 10 | Perche anti-collision (1,0 → 6,6 m, pas 0,4, hauteur 2,2 → 3,4, ≥ 0,8 m du sol) | partiel | compile | `SG/StridesHorse.cpp:53-60` | sonde du SpringArm par défaut (non paramétrée) |
| 10 | Verrouillage derrière le cavalier, sans orbite ni tremblement | partiel | compile | `SG/StridesHorse.cpp:53-60` | `bUsePawnControlRotation` non modifié (défaut moteur : faux, à confirmer) ; non vérifié à l'écran |
| 10 | Caméra du monde ouvert rétablie à la sortie (FOV 60 + vitesse, 6,6 m, 2,35 m) | absent | aucun | — | une seule caméra |

### 2.11 Arrivée et bilan (§11)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 11.1 | Arrivée : points = fautes + pénalités de temps | partiel | teste | `SC/CsoCourse.cpp:136-139` ; `TC:135` | scénario écrit à la main |
| 11.1 | `SANS FAUTE !` / `{n} POINTS` / `1 POINT`, sous-titre `{dec(t,2)} s`, 2600 ms | partiel | compile | `SG/StridesCourse.cpp:56` | « 1 POINTS » ; pas de sous-titre ; ligne de texte 3 s |
| 11.1 | Sons d'arrivée, public en liesse 3,5 s | absent | aucun | — | — |
| 11.2 | Classement simulé (`simulateField`, `mulberry32`, `rankResults`) | absent | aucun | — | — |
| 11.2 | Comparaison de résultats (`compareResults`) | identique_prouve | teste | `SC/CsoCourse.cpp:87-92` ; `TC:104-108` | 3 cas seulement ; le bilan web trie par `rankResults` (`ranking.js:23-25`), absent |
| 11.2 | Carte de bilan (kicker, titre, grille, tableau 8 premiers + joueur) | absent | aucun | `SG/StridesCourse.cpp:108` | ligne « Terminé : %d pts en %.2f s » |
| 11.2 | Boutons `Recommencer`, `S'entraîner`, `Quitter l'épreuve` | absent | aucun | — | — |
| 11.2 | Meilleur temps `bestTimes.cso_train` = temps + pénalités | partiel | compile | `SG/StridesSaveSubsystem.cpp:44-53` | clé `cso_pole`, résultat complet comparé par `compareResults`, écrit seulement à la sauvegarde manuelle F5 |
| 11.2 | Classement en ligne `reportScore` | absent | aucun | — | — |
| 11.3 | Concours, défi v6, missions d'histoire | absent | aucun | — | — |

### 2.12 Sons (§12) et recette (§13)

| § | Fonction | État | Niveau | Unreal | Écart précis |
|---|---|---|---|---|---|
| 12 | 14 événements sonores (notify, applause, bell, tone, snort, hoof, landing, railTouch, railFall, thud, fault, crowdOoh, neigh, cheer) et ambiance public | absent | aucun | aucune occurrence `Sound` / `Audio` dans `Source/` | — |
| 13 | Captures Unreal aux poses de la recette (844 × 390) | absent | aucun | `SG/StridesShots.cpp:28-35`, `67`, `96-105` | captures de décor et de démo en 1600 × 900, FOV 70 ; aucune pose CSO |

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
- **Preuve visuelle** : capture « appui trop tôt » (bouton et cheval) reportée à T9 ; ici preuve par oracle seulement.
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
