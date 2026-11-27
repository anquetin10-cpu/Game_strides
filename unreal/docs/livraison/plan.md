# Plan de livraison J1 à J6 — Strides Grand Tour / Equestrian Tour sur Unreal

Écrit le 26/11/2026 à partir de `audit.md` (base `357defd0`). Le jeu web (`src/`, `public/`, `tests/`) reste la source de
vérité quand une fonction y existe. Quand il ne tranche pas, le choix le plus simple est pris et écrit ici dans
« Choix non tranchés par le web » ; il est signalé à Julien.

## Règles communes à tous les lots

- Ordre de correction : P0, puis P1, puis P2, puis P3.
- Logique pure dans StridesCore (C++20 sans type Unreal), testée par ctest ; branchement moteur testé par Automation `Strides.*` ;
  boucles de jeu testées par un scénario fonctionnel (Automation latente ou Gauntlet simple).
- **Preuve de jeu** = partie manuelle par entrées système (`scripts/unreal/partie-manuelle/`), sur un **paquet** Mac (Development
  pour jouer, Shipping pour prouver l'absence des outils), jamais F8, autopilote, `-StridesShots` ni console. Captures
  horodatées et journal du jeu sous `.ue-cache/travail/livraison/preuves/`, sélection < 5 Mo dans
  `unreal/docs/livraison/preuves/`. Toujours écrit : « entrées injectées par l'agent ; jeu à la main par Julien à confirmer ».
- Mode rapide pendant un lot (tests ciblés, une ou deux captures) ; **matrice complète en fin de jalon** : ctest toutes cibles,
  Automation `Strides` complet, scénarios, captures G5 du CSO si le périmètre CSO est touché, paquet Mac Shipping lancé.
- Fin de jalon : commit clair en français sur `claude/unreal-port`, push sans force.
- Disque : `df -h` des deux volumes avant toute cuisson ; sous 8 Go libres : pause et blocage signalé.

## J1 — Tranche jouable manuelle (priorité absolue)

Objectif : depuis un paquet Mac, un joueur va de l'écurie au Pôle, lance le parcours du Pôle, saute, fait tomber une barre,
termine, voit chrono, pénalités, résultat et record, met en pause, sauvegarde et retrouve le record au relancement.

| Lot | Contenu | Critères d'acceptation vérifiables | Tests prévus | Preuves attendues | Dépend de |
|---|---|---|---|---|---|
| J1-A (P0) | Paquet Mac qui démarre : trouver pourquoi `FXRCubemapPS` manque (piste : `PixelStreaming2` activé sur Mac depuis `9ab9126f`, greffon XRBase) et corriger la configuration, sans toucher au cache Zen | Paquets Mac Development **et** Shipping de HEAD : fenêtre de jeu ouverte, monde visible, 0 `Fatal error` dans le journal sur 3 lancements | BuildCookRun Dev + Shipping ; lancement ×3 chacun ; contrôle `rg "Fatal\|appError"` du journal | captures de l'écran d'ouverture des deux paquets, journaux | — |
| J1-B (P0) | Départ de l'épreuve visible et utilisable au clavier : poteau « Chrono » avec maillage (`marker` du web, cso_activity.json) et invite « E · Chrono » dans le HUD hors tactile quand `ActionLabel()` n'est pas vide | À ≤ 6 m du départ, le HUD affiche le libellé ; E lance l'activité ; à 7 m, rien | Automation `Strides.Cso.ActivityPrompt` (nouveau : invite visible/masquée selon la distance et la mission) ; ctest inchangé (règle `csoActivityAvailable` déjà testée) | partie manuelle : approche, invite, E, écran d'entrée | J1-A |
| J1-C (P1) | Orientation : mini-carte dans le sens du web (z vers le bas) et flèche de cap juste ; mesure instrumentée de la vitesse réelle du cheval contre le HUD (B5) et correction de l'écart s'il est confirmé | Virage à droite → flèche tourne à droite ; marqueur du Pôle placé comme sur la carte du web (capture côte à côte) ; écart vitesse affichée / déplacement mesuré ≤ 5 % au pas, trot, galop | Automation `Strides.Hud.MinimapFrame` (projection de 4 points connus) ; scénario latent : 10 s de galop, distance parcourue / vitesse HUD | captures web / Unreal de la mini-carte au même point, relevé de vitesse | J1-A |
| J1-D (P1) | Aller à l'épreuve sans tâtonner : cible GPS vers le Pôle quand aucune mission n'est active et que le joueur ouvre « Événements » ou se trouve hors du Pôle (choix simple, voir plus bas), balise visible | Depuis l'écurie, en suivant la cible, arrivée au départ en < 2 min de jeu sans essai à l'aveugle | Automation `Strides.World.PoleTarget` (cible posée, distance décroissante en suivant le cap) | partie manuelle chronométrée | J1-C |
| J1-E (P1) | Parcours complet joué : entrée, cloche, départ, 8 obstacles dont deux doubles, barre tombée, refus éventuel, arrivée, chrono, pénalités, carte de résultat, classement, record | Une partie manuelle complète ; résultat cohérent avec les règles du web (barème A, temps accordé 350 m/min) ; record écrit puis relu après relancement du paquet | scénario fonctionnel `Strides.Scenario.PoleRun` (entrées simulées au niveau du contrôleur, pas l'autopilote) ; tests existants Strides.Cso.* verts | vidéo ou suite de captures + journal ; fichier de sauvegarde avant / après | J1-B, J1-D |
| J1-F (P1) | Outils hors chemin Shipping : `AStridesShots` et lecture des options `-Strides*` de débogage compilés seulement hors Shipping (`#if !UE_BUILD_SHIPPING`), F8 / F5 / F9 / N non liés en Shipping, ligne « Démo parcours : F8 » retirée du HUD Shipping | Recherche de chaînes UTF-32 dans le binaire Shipping : `StridesShotsDir`, `Démo parcours`, `StridesPerfSansCapture` absentes ; F8 sans effet ni texte | Automation inchangée (outils de test toujours compilés en Development) ; script de contrôle des chaînes du binaire Shipping ajouté à `package.json` ou à la matrice | sortie du script de chaînes | J1-A |
| J1-G (P2) | Pause et sauvegarde joueur : Échap → carte Pause, reprendre ; sauvegarde automatique à la fin d'épreuve (au lieu de F5) | Pause gèle le chrono ; record conservé après fermeture brutale du paquet | Automation existante (pause) + scénario de relance | captures | J1-E |
| J1-H (P0 latent) | SIGBUS `FStridesHorseAnimProxy::Evaluate` : reproduire hors capture (30 min de jeu cumulé) ; si reproduit, copier l'état du proxy au lieu de partager `Set`/couches avec l'évaluation parallèle | 0 plantage sur 30 min cumulées de partie et sur 10 lancements du paquet | test de charge latent (évaluation parallèle forcée) | journaux sans `Critical error` | J1-A |

Sortie de J1 : matrice complète verte, partie manuelle complète sur paquet Development, contrôle des chaînes sur paquet Shipping.

### État J1 au 26/11/2026 (étape « Tranche jouable manuelle », base `c21918c5`)

Légende : **écrit** (code), **compilé**, **testé moteur** (Automation), **joué par l'agent** (paquet lancé, entrées système
injectées par l'agent : CGEvent via `scripts/unreal/partie-manuelle/`). Le jeu à la main par Julien reste **à confirmer**.
Captures citées : `unreal/docs/livraison/preuves/j1-20261126/` (sélection) ; toutes les captures horodatées, plans d'entrées et
journal du jeu : `.ue-cache/travail/livraison/preuves/j1-20261126/partie/`.

| Lot | État | Preuve |
|---|---|---|
| J1-A paquet qui démarre | **fait, joué par l'agent** : paquet Development mis en scène lancé 2 fois, paquet Shipping lancé 1 fois (monde visible, données chargées), 0 `Fatal error` ; les 3 lancements par paquet du critère ne sont pas tous faits. Trois causes : (1) l'étape `-archive` de BuildCookRun recopie `unreal/StridesGrandTour/Binaries/Mac/StridesGrandTour.app`, qui contient des **paks du 17/11** (binaire neuf, contenu ancien) → on lance le paquet **mis en scène** (`-stage`, `staged-*/Mac/StridesGrandTour.app`), jamais l'archive ; (2) la cuisson n'écrit pas les shaders globaux de XRBase (`FXRCubemapPS` absent de `Saved/Cooked/Mac/Engine/GlobalShaderCache-METAL_SM6.bin`, vérifié) alors que Pixel Streaming 2 charge XRBase → `PixelStreaming2` limité à la cible **Editor** (`TargetAllowList`, choix n° 6) ; (3) `AndroidFileServer` désactivé dans le .uproject mais monté quand même par le jeu empaqueté, module absent → boîte « Plugin failed to load » puis sortie → entrée retirée (défaut du moteur, comme le 17/11). Manques de contenu corrigés : JSON de `Content/World/Cso` mis en scène, `rider_rules.json` / `monte_rider_f.json` lus par `FFileHelper` (pak) et non `std::ifstream`, `/Game/Audio` cuit (ces deux derniers : dans le paquet Shipping, pas dans le paquet Development joué) | `j1-01-monde-paquet-dev.jpg`, `j1-11-shipping-lancement.jpg` |
| J1-B invite au clavier | **fait, testé moteur, joué par l'agent** : bulle « E · Chrono » en bas au centre hors tactile ; E lance l'activité dans le paquet | `Strides.Cso.ActivityPrompt` ; `j1-03-invite-chrono.jpg`, `j1-04-presentation.jpg` |
| J1-C mini-carte | **sens corrigé, testé moteur, joué** (z vers le bas, `src/ui/minimap.js:9-11`) ; flèche de cap effilée (l'ancienne se lisait dans les deux sens, constaté en partie). Vitesse (B5) : au pas 2,8 m/s affiché pour 2,9 mesuré, au galop 6,7 affiché pour 6,4 à 6,9 mesuré sur la distance du guidage : **B5 non reproduit** | `Strides.Hud.MinimapFrame` ; relevés OCR de `drive.log` |
| J1-D guidage | **fait (choix n° 5), joué** : sans mission, « Chrono du Pôle · 563 m · à gauche / tout droit / à droite / demi-tour » + repère de mini-carte. Écurie → poteau en 9 min de jeu par entrées injectées (latence de l'agent comprise), sans essai à l'aveugle | `j1-02-monte-guidage.jpg` |
| J1-E parcours | **partiel** : joués en paquet : entrée, présentation, « Entrer en piste », annonce, cloche, départ lancé à 45 s, barre tombée au 3 (journal `railFall`), élimination « Temps limite dépassé », bilan, « Recommencer » (manche 2 remise à zéro : 0 pt, ▸1, barres remises), 2e bilan, « Quitter l'épreuve », retour au monde. **Pas obtenus en partie réelle** : saut franchi, refus compté, erreur de parcours comptée, arrivée, 2e partie relancée au poteau (défauts P1 ci-dessous ; partie interrompue quand Julien a repris la main sur l'écran). Boucle complète **testée moteur** : `Strides.Scenario.PoleLoop` (faute, refus, erreur de parcours, arrivée, élimination à 2 refus, Recommencer ×2, nouvelle partie, état remis à zéro champ par champ, meilleur temps écrit sans F5) | `j1-05` à `j1-10` |
| J1-F outils hors Shipping | **écrit, compilé** : `AStridesShots` vide en Shipping, options `-Strides*` ignorées, F5 / F9 / F8 non liés, lignes F8 / F5 du HUD retirées ; contrôle `scripts/unreal/check-shipping-tools.py` : **0 chaîne sur 13 dans le binaire Shipping**, 13 sur 13 dans le témoin Development | `j1-20261126/check-shipping-tools.txt` |
| J1-G pause, sauvegarde auto | inchangé ; meilleur temps écrit en fin d'épreuve sans F5 (vérifié par `Strides.Scenario.PoleLoop`) | — |
| J1-H SIGBUS | **non traité** ; 0 plantage pendant ~25 min de paquet Development | journal du jeu |

Défauts trouvés en partie réelle, à traiter avant de clore J1 :

- **P1** le cheval traverse un obstacle en biais sans refus ni saut puis reste coincé dedans (le « 3 », manche 1), et n'en sort
  qu'après « Recommencer » (`j1-06-traverse-obstacle-3.jpg`).
- **P1** en épreuve, rien ne retient le cheval dans la carrière : il sort de la piste jusqu'en ville (240 m) sans élimination
  (règle du web à vérifier : clôture de carrière ou sortie de piste).
- **P1** en épreuve, aucun repère visible de l'obstacle suivant (mini-carte masquée comme au web, aides « repère vert » non vues) :
  la navigation par entrées injectées n'a pas atteint le 1.
- **P2** texte du HUD peu lisible sur fond clair ; saut hors obstacle refusé « TROP TÔT » (conforme au web : à confirmer).
- **P3** sons `neigh` sans WAV, animation `Rider_jump_gallop` introuvable.
- Dépôt : l'éditeur ajoute à `Config/DefaultEngine.ini` une section `AndroidFileServerRuntimeSettings` avec un `SecurityToken`
  depuis que le greffon n'est plus désactivé : section **retirée avant commit**, à ne jamais versionner (`bIncludeInShipping=False`).
- Banc de test : une touche injectée va à l'application au premier plan ; le garde-fou `front <nom>` d'`entrees.py` arrête
  désormais un plan si le jeu n'est plus devant (un « e » parti dans l'app Claude de Julien à 09:34 a été effacé aussitôt, rien
  n'a été envoyé).

### Correction après contrôle adverse (26/11 après-midi, base `e29b18a5`)

Légende inchangée. Preuves : sélection `unreal/docs/livraison/preuves/fix-j1-20261126/` (12 captures, extrait du journal du
jeu) ; toutes les captures, journaux du jeu et `drive.log` : `.ue-cache/travail/livraison/preuves/fix-j1/`.

Cause du « cheval qui traverse les obstacles » : la règle des barres et des refus du cœur était juste (rejouée au clavier
dans `Strides.Scenario.PoleRun` : refus, saut, barre, erreur de parcours), mais **le portage n'avait aucun des colliders du
web** : ni la lice de la carrière (`world.js` `rectFence(POLE.arena, …, 's', 7, 0.5)`), ni les chandeliers et ailes des
droits et oxers (`obstacles.js` `add`). Un cheval abordant en biais passait entre l'aile et la barre ; il sortait de la
carrière. Second défaut trouvé en partie : hors épreuve, un refus relançait le cheval sans fin contre la barre (cadence
gardée, cabré sans virage), d'où le cheval « coincé » dans le 3, le 5, le 8.

| Point | État | Preuve |
|---|---|---|
| Colliders du web (lice du Pôle, ailes) | **écrit, testé (ctest + moteur), joué** : `StridesCore/Colliders` (portage de `colliders.js`, `fence`, `rectFence`, ailes, résolution de `horse.js:344-360`), appliqués dans `AStridesHorse::TickCso` | ctest « colliders » 597 vérifications contre l'oracle du web ; `Strides.Scenario.PoleRun` (lice, aile) ; en partie : le cheval reste dans la carrière, bloqué par la lice et par les obstacles abordés de dos (refus « sens -1 » au journal) |
| Refus hors épreuve : cadence à 0 | **écrit, testé moteur, joué** | `Strides.World.PoleTarget` (refus, cadence 0, demi-tour possible) ; avant / après : `10-avant-correctif-coince-au-3.jpg` |
| Événements d'obstacle au journal du jeu | **écrit, joué** : chaque `obstacle:clear / fault / refusal` est écrit | `journal-partie-finale.txt` |
| Guidage en épreuve (choix n° 7) | **écrit, testé moteur, joué** : pastille « Ligne de départ / Obstacle n / Arrivée · m · direction » ; abord passé, la cible devient l'obstacle | `PoleRun` ; captures `06`, `07` |
| J1-D écurie → poteau | **testé moteur** : `Strides.World.PoleTarget`, en ne suivant que le mot du guidage : **100,2 s de jeu, 0 contact** (< 2 min). **Joué** : 2 min 32 s de l'apparition à l'invite (16:04:41 → 16:07:13), latence de l'agent comprise, par le joueur de l'agent qui lit la ligne du HUD ; essais précédents 7 à 8 min (défauts du guidage corrigés entre-temps : aller-retour à l'entrée de la lice, lecture OCR). Balise au poteau, lignes du HUD sur fond sombre | `01-invite-chrono-poteau.jpg` |
| Cartes au clavier / à la manette (choix n° 8) | **écrit, testé moteur, joué** : Entrée / E / F / X = bouton choisi ; gauche / droite (flèches, A / Q / D, stick) changent de bouton, liseré vert | `PoleRun` (« Recommencer » au clavier) ; captures `04`, `12` ; journal « bouton « cso-retry » au clavier » |
| N et croix haut (J1-F) | **écrit, compilé, vérifié en paquet Shipping** : liés seulement hors Shipping ; Shipping de `b60f8c02` lancé, N puis F8 tapés : « Aucune mission active » inchangé, aucune démonstration ; contrôle des chaînes : **0 sur 13** dans le Shipping, 13 sur 13 dans le Development | `13-shipping-N-F8-sans-effet.jpg`, `check-shipping-tools.txt` |
| Scénarios | **testé moteur** : `Strides.Scenario.PoleRun` (parcours conduit au clavier, obstacles réels : refus au 1 sans traversée, 1 sauté, barre au 2, erreur de parcours, doubles enchaînés, arrivée, « Recommencer » ×2 avec état remis à zéro champ par champ, élimination à deux refus, lice, aile), `Strides.World.PoleTarget` ; `Strides.Scenario.PoleLoop` gardé | Automation `Strides` 47/47, EXIT CODE 0 ; ctest 9/9 (nouveau : « colliders ») |

Partie réelle (paquet Development de `b60f8c02`, plein écran par défaut, **entrées injectées par l'agent** : touches CGEvent,
joueur de l'agent `scripts/unreal/partie-manuelle/suivre.py` qui lit la pastille par reconnaissance de texte ; ni F8, ni
console, ni `-StridesShots` ; jeu à la main par Julien **à confirmer**) :

- **obtenus** : écurie → poteau, invite, présentation (E), « Entrer en piste » au clavier, entrée, cloche, départ ;
  **refus au 1 compté** (bilan « 4 pts : refus au 1 », capture `03`, `04`) ; **le 1 sauté** (`obstacle:clear 1`, marge
  0,23 m, chrono reparti vers le 2, `06`) ; éliminations « Temps limite dépassé » (barème du web : double du temps
  accordé), trois bilans ; **« Recommencer » deux fois** (manches 2 et 3, état neuf : 0 pt, ▸ 1, `07`) ; « Quitter
  l'épreuve », **retour au monde** (`08`) ; **deuxième partie** relancée au poteau, état neuf (`09`) ; 0 `Fatal error`
  sur 4 lancements du paquet Development.
- **pas obtenus en partie réelle** : barre tombée, arrivée et record (ils le sont dans `PoleRun`). Le parcours complet en
  moins de 128 s n'a pas été tenu par le joueur de l'agent : une lecture d'écran toutes les 1,5 à 2 s ne suffit pas à
  tenir les courbes au galop entre obstacles rapprochés ; il bute dans des obstacles pris de dos (refus « sens -1 »).
  **À confirmer par Julien à la main.**
- **défauts restants** : (P1, à confirmer) en plein écran, le **clic souris** sur les boutons du bilan est resté sans
  effet sur 4 essais (clics injectés), alors que le clic sur « Entrer en piste » de la présentation a marché ; le
  relâchement de la capture de souris à l'ouverture des cartes n'a pas suffi ; contournement livré : clavier / manette.
  (P2) le liseré du bouton choisi restait sur le bouton choisi au bilan précédent (corrigé après la partie, voir
  commit suivant). (P2) le guidage vers le poteau mène tout droit, à travers les obstacles sur le chemin (le cheval
  refuse puis il faut les contourner).

### 2e correction après contrôle adverse (26/11 soir, base `4754d020`)

Légende inchangée : **écrit**, **compilé**, **testé moteur**, **joué par l'agent** (paquet lancé, entrées injectées par
l'agent : touches CGEvent, joueur de l'agent `scripts/unreal/partie-manuelle/pilote.py` qui lit la pastille, le tableau, la
ligne d'allure et le libellé du bouton SAUT par captures d'écran ; ni F8, ni autopilote, ni `-StridesShots`, ni console).
Le jeu à la main par Julien reste **à confirmer**. Sélection : `unreal/docs/livraison/preuves/fix2-j1-20261126/` (12 captures,
journal des événements du jeu, contrôle des chaînes) ; tout le reste : `.ue-cache/travail/livraison/preuves/fix2-j1/`.

| Point du contrôle | État | Preuve |
|---|---|---|
| Guidage à travers les obstacles (bloquait J1-D et la boucle) | **écrit, testé (ctest + moteur), joué** : `StridesCore/CsoGuide` (choix n° 7 révisé) : grille de 1 m, chemin A* autour de la lice, des ailes et des obstacles (marge 1,8 m ; cœur à 0,5 m jamais traversé, même depuis la marge) ; abord d'un axe : poursuite de l'axe dans le couloir (16 m), centre dans les 3 derniers mètres s'il y va, sortie à 18 m après un refus ou dos à l'obstacle, sinon abord à 12 m par le chemin. Branché sur la pastille d'épreuve et la ligne « Chrono du Pôle » (distance = longueur du chemin) | ctest « guidage » 28 vérifications (dont le bout de lice relevé en partie) ; `Strides.Scenario.PoleGuided` : arrivée → poteau en 26,4 s, **0 refus** en chemin ; `Strides.World.PoleTarget` 100,4 s, 0 contact. Partie : écurie → invite en **2 min 11 s** (20:08:58 → 20:11:09), 2 min 2 s au 1er essai |
| Joystick tactile et manette non testés | **testé moteur** : `Strides.Scenario.PoleGuided`, trois parcours complets conduits **seulement d'après la pastille et le bouton SAUT**, sans aucun placement entre l'entrée et le bilan : clavier (refus voulu au 1, barre voulue au 2, arrivée, 91,2 s, 36 pts), **manette** (rappels Enhanced Input Move/Jump, arrivée 61,1 s, 0 pt), **joystick tactile** (doigts par `InputTouch`, bouton SAUT tactile, arrivée 62,8 s, 0 pt) ; Recommencer ×2, Quitter, meilleur temps écrit. **Pas joué** : sans manette physique ni écran tactile sur le Mac mini (aucun moyen gratuit d'injecter une manette virtuelle) ; limite du test : sans joueur local, la correspondance touche de manette → action n'est pas rejouée. **À confirmer par Julien** sur manette et iPad | journal `.ue-cache/journaux/fix2-g6.log` |
| Carte Pause qui piège le clavier | **écrit, testé moteur, joué** (choix n° 9) : Échap referme la pause (reprise, sans pause relancée), Entrée / E / F / X = bouton choisi, « Reprendre » d'office, gauche / droite / stick changent de bouton avec liseré | `Strides.Cso.PauseKeys` ; paquet : captures `08` à `10`, journal « Strides pause : Échap, reprise », « bouton choisi « share » », « bouton « resume » au clavier » |
| Premier clic absorbé | **écrit (NoCapture posé après le mode GameAndUI, aussi pour la pause), non résolu en partie** : dans le paquet du soir, **aucun** clic souris injecté n'a eu d'effet, ni sur le bilan ni sur « Reprendre » (2 clics chacun, capture `11`), alors que le journal montre la vue en `NoCapture`. Une alerte système de confidentialité était ouverte pendant ces essais (voir blocage) : cause **à confirmer** ; P2, clavier et manette suffisent pour jouer | `11-pause-clics-souris-sans-effet.jpg` |
| Contrôle Shipping hors matrice | **fait** : `npm run unreal:shipping-outils` et `npm run unreal:matrice` (`scripts/unreal/matrice.sh` : ctest, Automation `Strides` complet, chaînes du Shipping contre le Development) | `check-shipping-tools.txt` : 0 / 13 dans le Shipping de `e1cea4af`+, 13 / 13 dans le Development |
| Jeton AndroidFileServer réécrit | **corrigé** : section figée dans `DefaultEngine.ini` (greffon désactivé, jeton public sans objet) ; après 6 lancements de l'éditeur et une cuisson complète, `DefaultEngine.ini` inchangé (shasum `15b62b1a…`) | `git status` propre après cuisson |
| J1-A 3 lancements Shipping | **fait, joué** : paquet Shipping de ce soir lancé 3 fois (21:11, 21:12, 21:14), monde affiché, monte, N et F8 sans effet (« Aucune mission active », pas de démonstration, pas de ligne « Démo parcours ») ; Development lancé 3 fois, 0 `Fatal error` / `Critical error` | `12-shipping-N-F8-sans-effet.jpg` |
| J1-H SIGBUS | **non reproduit, non traité** : 0 plantage sur ~1 h 05 de jeu continu du paquet Development (20:08 → 21:03, 15 manches) et 6 lancements de paquets ; le critère de 10 lancements n'est pas atteint | journal du jeu |
| J1-E record relu après relancement, J1-G record après fermeture brutale | **non faits en paquet** (aucune arrivée obtenue en partie réelle) ; meilleur temps écrit sans F5 vérifié moteur (`PoleGuided`, `PoleLoop`) | — |

Partie réelle de ce soir (paquet Development de `e1cea4af`, entrées injectées par l'agent) : écurie → poteau, invite, E,
présentation, « Entrer en piste » au clavier, **15 manches** et **14 « Recommencer »** au clavier (gauche ×2, F), **8 obstacles
franchis** (1, 2, 3, 4A en une manche), **5 barres tombées** (dont « barre au 1 » et « barre au 2 » au bilan de la manche 7,
cause « saut trop court »), **45 refus** comptés (« Refus au 1 · +4 » à l'écran), 15 bilans « Éliminé » (deux refus, ou temps
limite), pause ouverte et refermée au clavier. **Pas obtenu : l'arrivée** (donc ni bilan d'un parcours fini, ni record en
paquet). Le joueur de l'agent lit l'écran 3 à 5 fois par seconde : il tient les lignes droites et le guidage, mais rate le
plus souvent la zone d'appel (fenêtre de 0,1 à 0,2 s) ou arrive de biais ; deux refus éliminent (règle du web). Avec la
capture ScreenCaptureKit (une lecture en ~0,25 s), il a franchi 1, 2, 3 et 4A d'affilée ; macOS a ensuite ouvert une demande
d'accès direct à l'écran pour python3.11 que l'agent n'a pas le droit d'accorder, d'où le repli sur `screencapture`, plus lent.
**Arrivée et parcours complet à la main : à confirmer par Julien.** Le parcours complet conduit d'après la pastille seule est
prouvé dans le moteur (`PoleGuided`, trois arrivées).

Sortie de J1 : **non atteinte** (arrivée en partie réelle, record relu après relance, J1-H).

### J1b « stabilité et points autonomes » (26/11 nuit, base `3fbb3253`)

En attente de la décision de Julien sur l'arrivée jouée (lui-même, ou lecture rapide de l'écran par python3.11), tout ce qui
ne dépend pas de lui. Légende inchangée ; entrées injectées par l'agent (CGEvent), jeu à la main par Julien **à confirmer**.
Sélection : `unreal/docs/livraison/preuves/j1b-20261126/` ; tout le reste : `.ue-cache/travail/livraison/preuves/j1b/`.

| Point | État | Preuve |
|---|---|---|
| J1-H SIGBUS `FStridesHorseAnimProxy::Evaluate` | **cause trouvée, corrigée, testée moteur** : les deux SIGBUS (25/11 14:30 et 26/11 01:10, même adresse `0x2000001f3`) sont des clips libérés par le ramasse-miettes puis lus par le mélangeur. Le 1er est le défaut corrigé par `fe5701f9` (clips de la vue retenus) ; le 2e est la **mutation volontaire** de ce correctif (`-StridesShotsTag=gc`, journal `ctrl-final-s4/journaux/ms2-gc.log`, plantage « vers la 32e seconde » noté dans `parite/monte/README.md`). Reste un trou de même nature : les sources des clips miroir n'étaient retenues que par la vue du web ; avec la main du web seule (vue refusée ou `-StridesHorseView=jeu`), 6 sources sur 11 étaient libérables. Corrigé : `AStridesHorse::MirrorClipRefs` (UPROPERTY) rempli par `EnableWebLead` | `Strides.Monte.MirrorRetention` (nouveau : retire `RF_Standalone` des sources comme dans un jeu cuit, passe le ramasse-miettes) : vert ; **mutation** (remplissage retiré) : rouge, « 11 sources, 6 libérées » (`.ue-cache/journaux/j1b-mirror-retention-mutation.log`) |
| Plantage du 26/11 18:28 (`+0x1bb03c`) | **expliqué, sans correction de jeu** : le journal du rapport le symbolise déjà : SIGSEGV (adresse `0x70`) dans `FStridesScenarioPoleGuidedTest::RunTest`, le test alors en cours d'écriture (non commité à 18:28, commité à 19:07 dans `eebd9cfe`). Chemin de test seulement, pas de jeu. Ligne exacte **non récupérable** : la bibliothèque de 18:28 a été reconstruite, aucun dSYM conservé (`atos` sans objet). `PoleGuided` passe depuis (matrices de 21:20 et de ce soir) | rapport `CrashReport-UE-StridesGrandTour-pid-74033-*/StridesGrandTour.log` |
| J1-H 10 lancements, 30 min | **joué par l'agent** : paquets de HEAD+correctifs, **10 lancements** (3 Shipping, 7 Development), **0 plantage** (0 `Critical error` / `Fatal error`, aucun rapport de plantage nouveau). Development : **36,5 min** monde chargé (40,0 min de processus), dont un `kill -9` voulu ; joueur de l'agent : écurie → poteau (≈ 2 min à chaque fois), 4 bilans « Éliminé », 21 refus, 2 obstacles franchis, aucune arrivée | `journaux-j1b.txt`, journaux `j1b-dev01..07.log` (conteneur du jeu) |
| Premier clic absorbé | **conclusion fausse, invalidée par le contrôle de J1b, corrigée en J1c (voir plus bas)** : le protocole mettait une autre fenêtre au premier plan avant le clic, ce qui fait notifier à macOS le déplacement de la fenêtre et masquait le défaut ; un clic absorbé à 22:22:32 (`j1b-dev01.log`, (1730, 885)) manquait à l'extrait. Texte d'origine : un seul clic, le jeu n'étant pas au premier plan, déclenche le bouton : « Entrer en piste » (fenêtre `focuswin` de l'agent au premier plan) et « Recommencer » (alerte système au premier plan, non touchée) ; dans l'éditeur `-game`, « Reprendre » de la pause, jeu actif puis inactif. Le correctif est celui de la 2e correction (NoCapture posé après GameAndUI) ; l'échec du soir précédent tenait à l'alerte ouverte. Tactile non rejoué ici | `02-…`, `04-…`, `journaux-j1b.txt` (« Strides souris », « bouton … cliqué ou touché ») |
| `AndroidFileServer` dans `DefaultEngine.ini` | **corrigé proprement** : greffon limité aux cibles de jeu (`TargetAllowList` Game/Client/Server dans le .uproject) : l'éditeur et la cuisson ne chargent plus son module d'éditeur, qui écrivait le jeton ; jeton fixe retiré de l'ini, serveur éteint en jeu. Le désactiver tout à fait casse le paquet Mac (J1). Aucun module de ce greffon ne vise iOS : rien de perdu | `DefaultEngine.ini` identique (shasum `c4b69e26…`) après un lancement de l'éditeur, une cuisson complète et 7 lancements ; paquet : « Mounting Engine plugin AndroidFileServer », aucun « Plugin failed to load » |
| J1-E record relu après relancement | **fait (record issu d'un scénario, déclaré)** : meilleur temps `cso_train` = 62,967 s écrit par `Strides.Scenario.PoleGuided` (matrice de ce soir), fichier copié tel quel en `strides_main` du paquet ; relancement : « emplacement strides_main lu, 1 meilleur(s) temps cso_train = 62.967 s » (journal ajouté à la lecture) | `journaux-j1b.txt` |
| J1-G record après fermeture brutale | **partiel (preuve faible, reprise en J1c)** : le paquet n'avait rien écrit avant le `kill -9`, le fichier venait d'une copie ; `kill -9` du paquet en épreuve, fichier inchangé (shasum `604cc7cc…`), relancement : record relu. **Non fait** : écriture par le paquet juste avant la fermeture (réglage de la pause) : la ligne de réglage était sous l'alerte système, que l'agent ne touche pas | idem |
| `check-shipping-tools.py` | **dans `package.json` et la matrice** (fait en 2e correction, vérifié ce soir) ; chaîne « Strides souris » ajoutée : 0 / 14 dans le Shipping, 14 / 14 dans le Development | `check-shipping-tools.txt` |
| Incident « Note rapide » | **trouvé et corrigé dans les outils de l'agent** : une touche F injectée (F8) laissait le drapeau Fn posé ; la touche Q injectée ensuite (A du clavier QWERTY) valait Globe+Q et ouvrait Notes au premier plan, deux fois ; le garde-fou « premier plan » a coupé le joueur avant toute touche dans Notes. Drapeaux remis à zéro sur chaque touche (`entrees.py`, `pilote.py`, `suivre.py`). Capture d'écran qui montrait Notes mise à la corbeille, aucune conservée. Notes est resté ouvert sur l'écran de Julien | `dev01/drive.log` |
| Blocages « Waiting for ZenServer » | **3, tous causés par l'agent** : éditeur `-game` lancé sans `-unattended`, donc boîte « Attendre ZenServer ? » en attente ; avec `-unattended` : 0 blocage. Zen et son cache non touchés | `.ue-cache/travail/livraison/j1b/zen-blocages.txt` |

Matrice de fin d'étape : ctest **10 / 10**, Automation `Strides` **50 succès, 0 échec** (`MirrorRetention` en plus), Shipping
**0 / 14** chaînes d'outils. Restent à Julien : arrivée jouée à la main (ou autorisation de lecture rapide de l'écran),
manette et tactile sur appareil, choix n° 9 et 10.

### J1c, correction après contrôle adverse de J1b (27/11 nuit, base `307e4cce`)

Entrées injectées par l'agent (CGEvent, `scripts/unreal/partie-manuelle/`), jeu lancé normalement et **resté au premier
plan** depuis le lancement (plus de passage par une autre fenêtre avant un clic). L'alerte de confidentialité python3.11
est restée à l'écran, non touchée, pendant tous les essais. Jeu à la main par Julien : **à confirmer**.
Sélection : `unreal/docs/livraison/preuves/j1c-20261127/` ; tout le reste : `.ue-cache/travail/livraison/j1c/`.

| Point | État | Preuve |
|---|---|---|
| Premier clic sur les cartes (P1) | **cause trouvée, corrigée, testée moteur, jouée par l'agent en paquet Development**. Cause (journal de diagnostic hors Shipping) : en plein écran fenêtré, la fenêtre native rend une position périmée, **(0, 2159)** au lieu de (0, 0) sur l'écran 1920 x 1080 (`GetFullScreenInfo` compris), et Slate la garde. La recherche du widget sous le pointeur ne trouve alors **rien** : aucun bouton ne répond, quel que soit le nombre de clics, jusqu'à une sortie de l'espace plein écran suivie d'un retour, qui fait notifier le déplacement. La capture de la souris n'y est pour rien (« capture non », haute précision 0). Correction : `ResyncGameWindowPosition`, appelée à chaque image de Slate (Tick du préprocesseur, avant le dessin) et avant chaque clic. Elle recale la fenêtre plein écran sur l'écran du pointeur (règle pure `StridesCore/WindowFit`, ctest `fenetre`, 10 vérifications ; mutation « sans contrôle de taille » : 3 échecs). Un recalage au clic seul ne suffisait pas : le clic courant cherche dans la grille de l'image d'avant (essai `fix2`, constaté). Après correction, lancement neuf, **un seul clic** à chaque fois : « Entrer en piste », « Reprendre » (deux fois), bascule « Tracé au sol », « Recommencer » du bilan « Éliminé ». Shipping : voir la ligne suivante. Tactile sur appareil : non rejoué | `01-…` (avant : 2 clics sans effet), `02-…` à `07-…`, `journaux-j1c.txt` |
| Shipping, premier clic | **joué par l'agent** : paquet Shipping de ce code, lancement neuf, jeu au premier plan, Échap puis **un seul clic** sur « Reprendre » : la carte Pause se ferme (contrôle J1b : elle restait ouverte). Outils absents du Shipping : 0 / 14 chaînes | `09a-…`, `09-…`, `check-shipping-tools.txt` |
| Bande noire de 30 px en haut | **vu une fois, cause à confirmer** : pendant `g1`, 77 s après le lancement, la fenêtre est passée à 1920 x 1050 en (0, 30) (`Viewport Size Mismatch` au journal) ; les clics restaient justes. Rien de tel en `g2` (6 min 30 de monte, même paquet), ni dans les 7 journaux `j1b-dev*` (ancien paquet). P3, suivi | `08-…` |
| J1-G record après fermeture brutale | **fait, écriture par le paquet** : en épreuve, pause, un clic sur « Tracé au sol » ; le paquet réécrit `strides_main.sav` (shasum `604cc7cc…` → `eb824670…`, `courseLine` « false », meilleur temps 62,967 s conservé), puis `kill -9` 6 s plus tard. Relance : « emplacement strides_main lu, 1 meilleur(s) temps cso_train = 62.967 s ». La même bascule donne alors `courseLine` « true » (`74e0ad71…`) : le « false » écrit avant la fermeture brutale a donc bien été relu. Le record lui-même vient toujours d'un scénario (déclaré) : l'arrivée jouée reste à Julien | `journaux-j1c.txt` |
| Texte de la carte Pause coupé en bas (P3) | **infondé, conforme au web** : le corps de la carte défile (`.card-body { overflow-y: auto }`, `src/styles.css:350`) ; le web coupe « sifflet. » au même endroit (`unreal/docs/parite/cso/cmd-pause-844x390-web.png`) ; la molette et le glisser font défiler | parité CSO |
| Matrice de fin d'étape | **verte** : ctest **11 / 11** (`fenetre` en plus), Automation `Strides` **50 succès, 0 échec**, Shipping **0 / 14** chaînes d'outils ; `DefaultEngine.ini` inchangé (`c4b69e26`) après l'éditeur de la matrice | `matrice.txt` |
| `Samples/PixelStreaming2/` non suivi | **ignoré** : scripts copiés par le greffon Pixel Streaming 2 (`Engine/Plugins/Media/PixelStreaming2/Resources/WebServers/get_ps_servers.*`) au lancement de l'éditeur ; ajouté au `.gitignore` | `.gitignore` |

## J2 — Gameplay équestre fiable

| Lot | Contenu | Critères | Tests | Preuves | Dépend de |
|---|---|---|---|---|---|
| J2-A | Allures, cadence, arrêt lisibles : comportement du web conservé (cadence gardée en concours), arrêt et ralentissement documentés dans le HUD | Pas / trot / galop / grand galop atteints et quittés au clavier et au tactile en < 2 s | ctest `csoRideStep` existant ; Automation de contrôle d'allure | captures | J1 |
| J2-B | Saut : appel, trajectoire, réception, refus, dérobé, barre effleurée / tombée conformes au modèle du web (jumpModel.js) | Oracle existant vert ; 20 sauts manuels : résultats conformes à la règle (marge affichée) | ctest oracles, Strides.Parite.CsoRun, scénario | captures avant / après | J2-A |
| J2-C | Monter / descendre, collisions avec décor et tribunes (B9) | Plus de traversée des tribunes ; descente refusée au-dessus de 2,5 m/s comme le web | Automation collisions sur 5 points connus | captures | J1 |
| J2-D | Entraînement à l'abord au paddock du Pôle (vertical + oxer, explications de saut) | Activité lançable, explications en cm comme le web | ctest + scénario | partie manuelle | J2-B |
| J2-E | Commandes tactiles sur iPhone / iPad simulées (844 × 390 et iPad) | Tous les boutons atteignables, zones sûres | Strides.Cso.Controls + captures | captures | J1 |

## J3 — Monde vivant de Deauville

| Lot | Contenu | Critères | Tests | Preuves | Dépend de |
|---|---|---|---|---|---|
| J3-A | Circulation (src/gameplay/npcs.js:73 `Car`, :323 `TrafficFx`) sur les 8 routes | Voitures sur les routes, arrêt devant le cheval, pas de collision bloquante | ctest de la logique de suivi de route (portée dans StridesCore) | captures, vidéo | J1 |
| J3-B | PNJ piétons et ambiance (npcs.js:16 `WalkAI`, :421 `Ambient`) | Densité et zones du web | ctest | captures | J3-A |
| J3-C | Jour / nuit, météo, marées (src/world/weather.js, game.js:824) | Heure du jeu suit le web ; ciel et lumière changent | ctest des fonctions de weather.js portées | captures à 4 heures | J1 |
| J3-D | Lieux et intérieurs utiles (sellerie, clinique, cafés), boutiques (shops.js:38), fers d'or (collectibles.js:16) | Chaque POI a une entrée ou une action | ctest | captures | J3-A |
| J3-E | Performance du monde vivant sur Mac et budget iOS mesuré (dessin, triangles, mémoire) | Valeurs mesurées et écrites | -StridesShots=perf **hors Shipping** | relevé | J3-A à J3-D |

## J4 — Boucle produit

| Lot | Contenu | Critères | Tests | Preuves | Dépend de |
|---|---|---|---|---|---|
| J4-A | Écran titre, création du personnage (screens.js:32, :45), langue | Première partie guidée | Automation écrans | captures | J1 |
| J4-B | Téléphone interactif (phone.js:23) : Missions, Événements, Carte plein écran (minimap.js:372), Trophées, Profil, Réglages | Chaque app ouvre un écran utile ; GPS posé depuis la carte | Automation par app | captures | J1-D |
| J4-C | Missions à étapes du web (missions.js:11 `makeSteps`, :256) et histoire (story.js:49), progression crédits / réputation / rangs | 3 premières missions du web jouables de bout en bout | ctest des étapes ; scénario | partie manuelle | J4-B |
| J4-D | Défis (challenge.js:15-87, challengeRun.js:31) et records par défi, classement | Défi Pôle V1 jouable, record enregistré | ctest + scénario | partie manuelle | J1-E |
| J4-E | Sauvegarde complète (save.js:129 version 2, migration) et reprise | Relance du paquet : tout l'état revient | Strides.Core.Save étendu | fichiers avant / après | J4-C |

## J5 — Finition et performance

| Lot | Contenu | Critères | Tests | Preuves | Dépend de |
|---|---|---|---|---|---|
| J5-A | Interface : lisibilité du HUD (B9), textes, sons | Contraste lisible sur fond clair, 0 texte de développement | revue de captures | captures | J4 |
| J5-B | Performance mobile : rendu mobile, ombres, LOD, arbres ; budget iPhone | Cible mesurée sur Mac en résolution iPhone ; valeurs iOS à confirmer sur appareil (J6) | perf hors Shipping | relevé | J3-E |
| J5-C | Stabilité : 60 min de jeu cumulé sans plantage, mémoire stable | 0 plantage | test d'endurance | journaux | J1-H |
| J5-D | Matrice complète et contrôle des chaînes Shipping | tout vert | matrice | rapport | J5-A à J5-C |

## J6 — Build iOS réel

| Lot | Contenu | Critères | Tests | Preuves | Dépend de |
|---|---|---|---|---|---|
| J6-A | Paquet iOS Shipping non signé de HEAD (`.app` arm64, archive) sans Pixel Streaming dans iOS | BuildCookRun IOS vert ; `codesign` : non signé ; greffon PixelStreaming2 absent de la cible iOS | script de contrôle du paquet | rapport | J5 |
| J6-B | **Signature et installation sur appareil : exige Julien** (voir ci-dessous) | Jeu lancé sur un iPhone ou iPad réel, partie J1 jouée | partie manuelle sur appareil (Julien) | vidéo de l'appareil | J6-A + actions de Julien |
| J6-C | TestFlight / App Store : **hors mandat actuel**, interdit sans décision explicite de Julien | — | — | — | — |

## Actions minimales qui exigeront Julien

| Action | Quand elle devient incontournable | Alternative gratuite étudiée |
|---|---|---|
| Accepter l'accord Apple Developer en attente (état à confirmer, non visible sans connexion) | début de J6-B, pas avant | Compte Apple gratuit + signature « Personal Team » d'Xcode : installation possible sur ses propres appareils pour 7 jours, sans TestFlight ; à confirmer pour un projet Unreal |
| Choisir l'équipe de signature (Personal Team gratuite ou compte payant existant) et créer le certificat de développement dans Xcode (connexion Apple ID par Julien) | début de J6-B | Personal Team (gratuit) |
| Brancher et faire confiance à un iPhone / iPad (mode développeur activé) | J6-B | — |
| Jouer la tranche J1 à la main et dire si le ressenti est bon | fin de J1 (recommandé), fin de J2 | aucune : seul Julien peut confirmer le jeu à la main |
| Toute dépense (programme Apple, service payant) | jamais pré-autorisée ; ne bloque aucun jalon J1 à J5 | voir ci-dessus |

## Choix non tranchés par le web (le plus simple, signalé)

1. **Paquet de preuve sur Mac** : le web n'a pas de paquet ; la preuve de jeu se fait sur le paquet Mac (le jeu iOS n'est
   jouable par l'agent qu'après J6-B).
2. **Invite du poteau au clavier** : le web affiche une bulle d'interaction commune clavier / tactile ; Unreal ne l'a qu'en
   tactile. Choix : la même bulle dans le HUD clavier (J1-B).
3. **Cible GPS vers le Pôle hors mission** (J1-D) : le web passe par l'app Activités ou la carte pour poser un repère ; en
   attendant le téléphone interactif (J4-B), la cible vers le Pôle est posée par l'app « Événements » du téléphone, rien de plus.
4. **Sauvegarde automatique en fin d'épreuve** (J1-G) : le web sauvegarde de lui-même ; F5/F9 deviennent des outils hors Shipping.

5. **Guidage vers le chrono du Pôle sans mission** (J1-D, 26/11) : le plus simple a été retenu — la ligne de guidage et le repère de
   mini-carte sont affichés dès qu'aucune mission ni épreuve n'est en cours, sans passer par l'app « Événements ». Écart assumé
   avec le web, à valider par Julien.
6. **Pixel Streaming 2 retiré des paquets Mac** (J1-A, 26/11) : limité à l'éditeur (`TargetAllowList: Editor`), parce que la
   cuisson n'emporte pas les shaders de XRBase. Le paquet Mac avec Pixel Streaming n'a jamais démarré depuis le 18/11 ; rien de
   ce qui marchait n'est perdu. Réversible en une ligne du .uproject.

7. **Guidage en épreuve** (26/11, correction J1) : le web masque la minicarte en concours et ne montre que le numéro vert
   de l'obstacle attendu et les repères au sol ; le contrôle a constaté qu'on s'y perd. Choix : une pastille sous le
   chrono avec la cible du GPS de l'étape de parcours du web (abord du départ, abord de l'obstacle attendu, arrivée),
   distance et direction ; abord passé, l'obstacle lui-même. Écart assumé, à valider par Julien.
8. **Cartes au clavier et à la manette** (26/11, correction J1) : le web n'offre que le clic / toucher (boutons HTML,
   focalisables au clavier dans un navigateur). Choix : bouton principal choisi d'office, gauche / droite pour changer,
   Entrée / E / F / X pour valider.
9. **Carte Pause au clavier et à la manette** (26/11 soir, 2e correction J1) : le web ne referme pas la pause par Échap
   (Échap reste en attente et reprend effet à la reprise). Choix : Échap referme la pause (Reprendre) sans relancer la
   pause, Entrée / E / F / X déclenchent le bouton choisi, « Reprendre » choisi d'office. Écart assumé, à valider par Julien.
10. **Guidage qui contourne** (26/11 soir) : le choix n° 7 est révisé : abord à 12 m de la face (et non 7 m), chemin autour des
   obstacles, ailes et lice, « demi-tour » vers une sortie à 18 m après un refus. Toujours sans équivalent au web.

## Risques

- Cuisson longue (17 à 18 min par paquet) et cache Zen sur disque externe : prévoir les paquets en fin de lot, pas à chaque essai.
- Blocages « Waiting for ZenServer » (1 sur 5 lancements à l'audit) : arrêter le seul processus éditeur, relancer, compter.
- Écart vitesse / carte (B5) pourrait toucher le chrono du CSO : à trancher en J1-C avant J1-E.
- SIGBUS d'animation (J1-H) : peut ruiner une partie longue ; à reproduire tôt.
- Navigation par entrées injectées coûteuse sans GPS (36 essais à l'audit) : J1-D réduit ce coût pour toutes les preuves suivantes.
- Fenêtres système (trousseau, rapports de plantage d'Epic) ouvertes sur l'écran de Julien : ne jamais les manipuler, viser la
  fenêtre du jeu par son identifiant.
