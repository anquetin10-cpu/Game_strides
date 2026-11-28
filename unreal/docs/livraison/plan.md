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

### État J2 au 27/11/2026 (étape « Gameplay équestre fiable », base `f61faf8d`)

Légende : **écrit**, **compilé**, **testé (ctest / moteur)**, **joué par l'agent** (paquet Development lancé normalement,
entrées injectées par l'agent : touches CGEvent, joueur de l'agent `pilote.py` qui lit l'écran ; ni F8, ni autopilote, ni
`-StridesShots`, ni console). Jeu à la main par Julien : **à confirmer**. Sélection : `unreal/docs/livraison/preuves/j2-20261127/`
(5 captures, extrait du journal du jeu) ; tout le reste : `.ue-cache/travail/livraison/preuves/j2/`.

Audit d'entrée (réel, pas les README) : le jugement des barres, refus, chutes, vibrations et sons était déjà porté et prouvé
(tranche T3, `CsoFences`) ; **écart P1 trouvé** : le cheval du jeu est affiché en vue du web (WildMesh) par défaut, et le web
juge alors les **membres visibles** (`Obstacles._limbJudged`, `PjlHorse._limbContacts`) ; le portage passait
`limbJudged = false` et ne détectait aucun contact. Conséquence mesurée sur l'oracle : avec une marge de trajectoire de
+0,02 à +0,04 m, le web fait tomber la barre (antérieur à 2,3 cm dans la barre, faute) là où le portage annonçait « franchi » ;
même chose pour un postérieur (j2-effleurement, 9,1 cm). Résultat faux : P1. Aucun oracle existant ne contenait de contact
(canal `lc` vide partout) : la règle de `csoLimbContact` n'était donc pas prouvée non plus.

| Point | État | Preuve |
|---|---|---|
| Contacts membres / barres (port de `_limbContacts`, `limbContact.js`) | **écrit, testé ctest, testé moteur, joué** : `StridesCore/LimbContact` (géométrie, choix de l'obstacle jugé ou visé à 4 m, pose précédente, balayage 6 pas, contact le plus profond par barre, au-delà de 1 cm, barre en chute ignorée) ; branché dans `AStridesHorse::PostPoseView` sur la pose finale (replis et bascule compris), contact passé à `csoLimbContact` (barre, faute, cause), son et faute vus par l'épreuve ; `limbJudged` vrai quand la vue du web est active | ctest `limb` : 1 149 cas de `limb_contact.json`, 0 écart (≤ 1e-12) ; ctest `fences` : 10 scénarios `j2-*` exportés du jeu web avec pose des membres (canal `lb`), contacts recalculés identiques au web (5 contacts, écart ≤ 3e-17 m), rejeu complet sans écart |
| Jugement épaules / postérieurs, résultat différé | **testé** : résultat annoncé après le passage des postérieurs (2,2 m) ou 1,2 s, comme le web (témoin « résultat différé » 179 images) | ctest `fences` |
| Saut propre, postérieur qui touche, antérieur qui touche, barre qui tombe, effleurement sans chute, refus, saut en virage | **oracle exporté du web** (`export-cso-runs.mjs --only=j2-…`, cheval WildMesh) et **rejoué** (ctest) ; **scénarios moteur** `Strides.Scenario.Jump.Oracle` pilotés par les entrées du joueur (Espace, manette pour le virage), pose réellement évaluée : **10 / 10** abords avec le même résultat que le web (événements, barres tombées, tintements) ; contacts : **9 / 10** identiques au web, membre compris ; écart de pose déclaré sur `j2-posterieurs` (antérieur à 6,0 cm au web, aucun ici ; barre tombée sous les postérieurs 12 images plus tard : faute, cause et barre identiques) | journal `.ue-cache/journaux/j2-jump-3.log` |
| Sons et annonces de faute | **testé moteur** `Strides.Scenario.Jump.InCourse` : épreuve lancée au poteau (E), « Entrer en piste », cloche, 1 sauté trop loin à l'Espace : toast « Barre au 1 · +4 · Appel trop loin », 4 points, journal d'épreuve, son `railFall`, barre à terre ; **joué en paquet** : toast identique après un contact du postérieur droit (7,1 cm) | capture `040954-…`, `journal-partie-j2.txt` |
| Refus ; dérobés | refus : déjà portés (T3), rejoués avec le cheval WildMesh (`j2-refus-lent`) et 29 refus comptés en partie ; **dérobés : absents du jeu web** (aucune règle dans `src/`), non ajoutés | — |
| Collisions des obstacles | déjà portées (chandeliers, ailes, lice : `horseCollide`, J1) ; inchangées ; rien de neuf constaté en partie | — |
| Trajectoire et calage visuel du saut | inchangés (vue du web, ctest « monte-vue », `Strides.Parite.HorseView`) ; les contacts mesurés sur la pose montrent le calage : 9 / 10 contacts identiques au web | ci-dessus |
| Mutations | `mutations-limb-contact.py` : **26 mutations, 24 détectées**, 2 attendues (cheval d'un autre cavalier ; changement d'obstacle en moins de 0,1 s), raisons écrites ; `mutations-cso-fences.py` : la mutation « profondeur minimale » est désormais détectée (liste corrigée), raisons des deux autres mutations « membres » réécrites ; relancé : **55 mutations, 39 détectées, 16 attendues, code 0** | `.ue-cache/travail/livraison/mutations-fences-2.log` |
| Matrice de fin d'étape | **verte** : ctest **11 / 11**, Automation `Strides` **52 succès, 0 échec** (`Jump.Oracle`, `Jump.InCourse` en plus ; 1 attente « Waiting for ZenServer » résolue seule, aucun arrêt d'éditeur), paquets Development et Shipping de ce code (`-skipcook` : contenu inchangé), Shipping **0 / 14** chaînes d'outils ; captures CSO G5 non refaites (aucun visuel du CSO touché) | `check-shipping-tools.txt`, `.ue-cache/journaux/j2-matrice-automation.log` |
| Partie en paquet (Development, entrées injectées) | **jouée par l'agent** : écurie → poteau, invite « E · Chrono », E, « Entrer en piste » au clavier, 8 manches, 7 « Recommencer » au clavier ; **1 obstacle franchi** (1, marge 0,26 m), **4 fautes** dont **2 par contact d'un membre** (postérieur droit 7,1 cm, postérieur gauche 9,5 cm : « Barre au 1 · +4 »), 29 refus, 8 bilans « Éliminé », 0 `Fatal` / `Critical error`. Option `rafale=<m>` ajoutée au joueur de l'agent (SAUT toutes les 0,2 s dès <m> m). **Pas obtenu : parcours complet** (même limite qu'en J1 : zone d'appel ratée, refus) ; à confirmer par Julien | `journal-partie-j2.txt`, captures |

Écarts déclarés :
- **ordre dans l'image** : le web mesure les membres pendant `horse.update`, avant `Obstacles.updateHorse` ; le portage après
  l'animation (après `updateHorse` de la même image). Effet seulement si un contact et l'annonce différée tombent sur la même
  image (non vu dans les 10 scénarios ni en partie).
- **P1 candidat, à confirmer** : en partie (manche 8), une faute « au 2, saut trop court » a été annoncée à l'abord du 1, avec
  « Erreur de parcours : ce n'est pas le 1 », alors que le cheval venait de l'autre côté de la carrière (capture `041240-…`).
  Lecture : un passage de l'oxer 2 resté ouvert (épaules entrées sans ressortir, refus contre l'oxer) est annoncé à l'abord
  suivant, comme le prévoit `_judge` du web (« résultat précédent encore en attente »), et « Recommencer » ne remet pas
  `horse._pass` à zéro, ni au web ni ici. Code porté ligne à ligne : défaut probablement **commun au web**. Non corrigé
  (le web tranche) ; à reproduire au web puis à décider (voir décision demandée).
- les refus comptés juste après « Recommencer » quand le cheval est resté devant un obstacle (manches 7 et 8) : même
  comportement que le web (pas de remise en place au recommencement) ; à confirmer.

### État J2b au 27/11/2026 (étape « J2 suite : faute fantôme et lots restants », base `bcafa138`)

Même légende que J2 (**écrit**, **compilé**, **testé ctest / moteur**, **joué par l'agent** avec entrées injectées ; jeu à
la main par Julien : **à confirmer**). Sélection : `unreal/docs/livraison/preuves/j2b-20261127/` ; reste :
`.ue-cache/travail/livraison/j2b/` et `.ue-cache/travail/livraison/preuves/j2b/`.

**Faute fantôme (P1 candidat de J2) : reproduite au web et dans Unreal, corrigée dans le portage (option b).**

- Cause relevée dans le code du web : `horse._pass` (passage d'obstacle en cours) n'est remis à zéro que par
  `horse.setPosition` ; « Recommencer » (`courses.js:428-431`) et l'entrée en piste (`courses.js:446-466`) ne touchent pas
  au cheval. Un passage resté ouvert (épaules entrées dans l'oxer au sol après un appel bien trop tôt, cheval arrêté entre
  les barres, sortie jamais franchie) survit à la manche et est annoncé au premier saut suivant (`_judge` : « résultat
  précédent encore en attente »).
- **Reproduit au web** (lecture seule, Playwright sur Vite 5178) : scénario `j2b-fantome` ajouté au banc
  `scripts/unreal/export-cso-runs.mjs` (canal `ps` = `horse._pass` à chaque image ; actions `ride` et `noPlace` qui ne
  posent pas le cheval, puisque `setPosition` oublierait le passage) : le 1 franchi, l'oxer 2 sauté à 7,5 m (passage
  ouvert, faute `short`, image 308), temps limite, « Recommencer », chevauchée jusqu'au 1 sauté : à l'appel du 1,
  `obstacle:fault 2 (marge −0,85, short)` et toast « Erreur de parcours : ce n'est pas le 1 » (image 6795). Oracle hors
  index : `.ue-cache/travail/livraison/j2b/web-oracle/`.
- **Même trace qu'en partie** (J2, manche 8 : « obstacle:fault 2, marge −0,85 m, cause short » puis « Erreur de
  parcours ») et **reproduit dans le moteur** : `Strides.Scenario.Jump.Fantome`, passe « comportement du web » (remise
  désactivée par un réglage de test absent du Shipping) : faute du 2 et « Erreur de parcours » à l'abord du 1.
- **Gravité revue : P2, pas P1.** Mesuré au web et dans Unreal : 0 point compté (la faute d'un autre obstacle ne passe
  que par `wrongCourse` : toast, astuce et son de faute) ; le 1 reste franchi. Une variante P1 n'existerait que si le
  passage ouvert était sur l'obstacle 1 (le premier saut de la manche suivante le continuerait) ; le 1 du Pôle est un
  droit, dont l'entrée et la sortie se franchissent dans la même image : non atteignable sur ce parcours.
- **Correction (option b de l'arbitrage, remise à zéro, pas une nouvelle règle)** : `strides::csoEntryResetPass`
  (StridesCore/CsoFences) appelé par `AStridesHorse` à chaque remise des barres de l'entrée en piste (première manche et
  « Recommencer ») ; dernier refus et dernier saut gardés ; option c (fermeture à 8 m) **non appliquée**. Écart volontaire
  au web, documenté (choix n° 11 ci-dessous).
- Tests : ctest `fantome` (cœur : sans remise, faute du 2 annoncée à l'abord du 1 comme au web ; avec remise, rien ;
  mutation « remise vide » détectée : 2 échecs) ; Automation `Strides.Scenario.Jump.Fantome` (moteur, entrées du joueur :
  Espace, S tenu, bouton « Recommencer », manche 2 conduite au stick sans pose) : web → défaut reproduit ; portage →
  aucune « Erreur de parcours », aucune faute du 2, le 1 franchi, 0 point, prochain obstacle 2.

**Lots J2 restants.**

| Lot | État | Preuve |
|---|---|---|
| J2-A allures au clavier | **testé moteur** `Strides.Ride.Gaits` (W tenu, S tenu, ligne droite de la carrière) : pas 0,07 s, trot +1,37 s, galop +1,37 s, grand galop +1,27 s (7,02 m/s) ; retour galop 0,00 s (seuil 7,0 m/s), trot +1,27 s, pas +1,37 s, arrêt +1,37 s : chaque changement **< 2 s** ; cadence gardée sans touche (7,02 m/s après 1 s, comportement du web en concours). Pas de nouvel affichage d'aide (B8 reste P2). Tactile : non mesuré ici (voir J2-E) | journal `.ue-cache/journaux/j2b-tests-2.log` |
| J2-C tribunes (B9) | **écrit, testé ctest et moteur** : tribunes du Pôle pleines comme au web (`world.js buildStands` : boîte « stands » w × d sans sommet) — cheval : `strides::addStands` dans les colliders du parcours ; cavalier à pied : boîte invisible qui ne bloque que les pions (ni caméra ni visibilité). Oracle `colliders.json` régénéré par `export-colliders.mjs` avec les tribunes et 3 abords (dont un en saut) : ctest `colliders` 637 vérifications, 0 échec ; `Strides.World.Stands` : 5 abords au galop, 0 image dans l'emprise, contact sur les 5 ; piéton arrêté au bord ; la caméra traverse la boîte | idem |
| J2-C descente | **déjà porté** (player.js:225 : « Descendre » proposé sous 2,5 m/s hors saut) ; **testé moteur** dans `Strides.World.Stands` : E refusé à 3 m/s, descente à l'arrêt | idem |
| J2-C caméra collée au mur au départ | **non reproduit** : aucune trace précise dans l'audit ni dans les captures de J1/J2 ; la caméra de concours garde sa sonde portée en T6 (`t6-tribunes`, `t6-mat`). À décrire (lieu, vue) pour être traité ; à confirmer par Julien | — |
| J2-D entraînement au paddock | **fait en J2c (voir plus bas)** ; état J2b : non fait : activité `cso_warmup` du web (`activities.js:145` : paddock d'échauffement, vertical et oxer, explication de chaque saut, barres remontées) absente du portage ; le bouton « S'entraîner » du bilan existe mais ne lance pas cet entraînement | — |
| J2-E tactile | **partiel, inchangé** : `Strides.Cso.Controls` couvre 844 × 390 et 667 × 308 (relevés du web) ; format iPad non relevé ; appareil réel : J6 | — |
| Partie en paquet (Development, entrées injectées par l'agent) | **jouée par l'agent** : écurie → poteau (pilote), E, « Entrer en piste », 3 manches, 2 « Recommencer » au clavier. Manche 2 : refus contre l'oxer 2 en fin de manche, passage resté ouvert ; à l'entrée en piste de la manche 3, journal « entrée en piste, passage resté ouvert oublié (obstacle 2, faute 1) » ; premier saut de la manche 3 (le 1) : seulement « Barre au 1 · +4 · Barre touchée par les postérieurs » (contact réel du postérieur droit, 9,1 cm), **aucune faute du 2, aucune « Erreur de parcours »** (0 dans tout le journal), 0 `Fatal` / `Critical error`. Pas de parcours complet (mêmes limites du joueur de l'agent qu'en J2). Tribunes : **non jouées en paquet** (prouvées en ctest et dans le moteur seulement). Jeu à la main par Julien : à confirmer | `journal-partie-j2b.txt`, `055247-manche3-barre-au-1-sans-erreur.jpg` |
| Matrice de fin d'étape | **verte** : ctest **11 / 11** (bancs `fantome` et `colliders` étendus), Automation `Strides` **55 succès, 0 échec** (`Jump.Fantome`, `Ride.Gaits`, `World.Stands` en plus ; 0 attente Zen sur ce passage, 1 attente résolue seule sur chacun des deux passages ciblés, aucun éditeur arrêté), paquets Development et Shipping de ce code (`-skipcook` : contenu inchangé), Shipping **0 / 14** chaînes d'outils (le réglage de test `bEntryPassResetForTest` n'existe que sous `WITH_DEV_AUTOMATION_TESTS`) ; captures CSO G5 non refaites (aucun visuel du CSO touché) | `check-shipping-tools.txt`, `.ue-cache/journaux/j2b-matrice-automation.log` |

Alerte macOS : une deuxième alerte de confidentialité (python3.11, enregistrement de l'écran) est passée au premier plan
pendant la partie, bouton « Autoriser » en surbrillance ; le garde-fou `front` du plan a arrêté les touches ; le jeu a été
remis au premier plan par `open`, l'alerte **n'a pas été touchée**.


### État J2c au 27/11/2026 (correction de J2b après contrôle adverse, base `126d2493`)

Même légende. Sélection : `unreal/docs/livraison/preuves/j2c-20261127/` ; reste : `.ue-cache/travail/livraison/preuves/j2c/`
et `.ue-cache/travail/livraison/j2c/`.

**J2-D entraînement au paddock (problème majeur du contrôle) : fait.**

- **Web relevé** (lecture seule, Playwright sur Vite 5178) : `scripts/unreal/export-cso-training.mjs` lance l'activité
  `cso_warmup` comme le bouton « S'entraîner » (`startTraining`) dans le jeu web réel, relève l'objectif à 9 positions
  (loin, à pied, 60 / 50 / 47 / 19 m, dans le paddock), puis transmet aux écouteurs 8 événements d'obstacle (marges 8,5 /
  31 / 11,5 / 0,4 cm, faute avec et sans cause, refus, obstacle du parcours ignoré) et « Terminer » : appels de
  l'interface, son notify, mode de concours, action « Terminer », carte de fin. Oracle `unreal/core/tests/oracles/cso_training.json`
  (français et anglais).
- **Cœur** `strides::CsoTraining` (C++20 sans Unreal) : ctest `entrainement` **286 vérifications, 0 échec** ; mutation
  « rayon du goto 13 m » détectée (2 échecs).
- **Monde** : vertical (1,10 m) et oxer (1,00 m) du paddock exportés du web (`cso_fences.json « warmup »`, 11 maillages
  ajoutés par `import-cso-fences-add.py`, aucun maillage existant réimporté) ; lice du paddock (`rectFence 'e', 6 m`) dans
  les colliders du cheval et dans l'oracle `colliders.json` (ctest `colliders` **686 vérifications, 0 échec**, 3 abords du
  paddock ajoutés) ; poteau « Chrono » de l'activité au paddock (`a.start + 3 m`).
- **Jeu** : « S'entraîner » au bilan lance l'entraînement 300 ms après la fin de l'épreuve ; « Rejoins le paddock… ·
  distance » puis, dans le paddock, astuce de 7 s, mode de concours (caméra, commandes, bouton SAUT et zone d'appel),
  toasts « Sans faute · N cm de marge » / « Barre · cause » / « Refus : trop près… », barres remontées 2,5 s après,
  « Terminer » (E / X / bouton Action, priorité 2), fin. L'épreuve du Pôle ne voit plus que la course « cso »
  (resetRails, capacité, événements).
- **Testé moteur** : `Strides.Scenario.Training` (entrées du joueur : E, S tenu, bouton « S'entraîner », stick, Espace) :
  épreuve éliminée, « S'entraîner », entraînement lancé en 9 à 30 images, paddock atteint au stick par l'ouverture est,
  vertical sauté (« Sans faute · 31 cm de marge »), oxer sauté en zone loin (« Barre · Appel trop loin », barre remontée),
  refus au trot (« Refus… »), « Terminer » par E (« Entraînement terminé », « 1 saut sans faute sur 2. »), poteau du Pôle de
  nouveau proposé, barres du parcours intactes ; poteau du paddock : E lance un second entraînement.
- **Joué par l'agent dans le paquet Development** (entrées injectées CGEvent, captures système ; journal
  `journal-partie-j2c.txt`) : écurie → poteau du Pôle (pilote), E, « Entrer en piste », S tenu jusqu'à l'élimination,
  bilan, **« S'entraîner » au clavier** → « ENTRAÎNEMENT À L'ABORD », objectif « Rejoins le paddock d'échauffement du Pôle ·
  100 m » et ligne « Paddock du Pôle · 136 m » (capture `083025-entrainement-lance.jpg`) ; paddock atteint en suivant la
  ligne (capture `083227-etat-paddock.jpg`, vertical visible) ; **un refus** sur un obstacle du paddock avec le toast
  « Refus : trop près, appelle plus tôt » ; « Terminer » au clavier → « Entraînement terminé · 0 saut sans faute sur 0 ».
  **Aucun saut franchi dans le paquet** : le joueur de l'agent n'a pas de repère pour viser dans le paddock (pas de
  pastille au web pendant l'entraînement) et le jeu a perdu le premier plan 6 fois en 2 minutes (application Claude passée
  devant, garde-fou `front`) ; les sauts sont prouvés dans le moteur seulement. 0 `Fatal` / `Critical` / `Ensure`.
  Jeu à la main par Julien : à confirmer.

**Autres points du contrôle.**

| Point | État | Preuve |
|---|---|---|
| Tribunes (mineur) | **mutation ajoutée** : `Strides.World.Stands` retire le collider « stands » et vérifie que le premier abord entre alors dans l'emprise (test vert = mutation détectée). Piéton : toujours un balayage de capsule, pas un pion qui marche ; tribunes non jouées en paquet | journal `.ue-cache/journaux/j2c-stands.log` |
| Faute fantôme en paquet (mineur) | inchangé : cas non provoqué par le contrôle ; preuves moteur et ctest de J2b | — |
| J2-A / J2-E (mineur) | inchangés (clavier seulement, iPad et appareil non relevés) | — |
| Alertes macOS (mineur) | toujours présentes (4 alertes python3.11 superposées au centre de l'écran pendant toute la partie) ; **aucune touchée** ; à traiter par Julien | captures |

**Matrice de fin d'étape : verte.** ctest **12 / 12** (nouveau banc `entrainement`, `colliders` étendu) ; Automation
`Strides` **56 succès, 0 échec** (`Strides.Scenario.Training` en plus ; 1 attente Zen résolue seule, aucun éditeur
arrêté ; tests `Parite.CsoScenery`, `Scenario.PoleLoop`, `Scenario.PoleRun` adaptés : ils comptent désormais les obstacles
du parcours seuls, les deux du paddock suivant) ; paquet Development cuit (nouveaux maillages) puis reconstruit sur le
commit, paquet Shipping (`-skipcook`) : **0 / 14** chaînes d'outils (`check-shipping-tools.txt` ; le réglage
`SetStandsForTest` n'existe que sous `WITH_DEV_AUTOMATION_TESTS`). Captures CSO G5 non refaites (carrière du Pôle non
modifiée ; paddock vu dans les captures de la partie).

Choix nouveaux : n° 12 et 13 ci-dessous.

### État J2d au 27/11/2026 (correction de J2c après contrôle adverse, base `126d2493`)

Même légende. Sélection : `unreal/docs/livraison/preuves/j2d-20261127/` ; reste : `.ue-cache/travail/livraison/preuves/j2d/`
(captures horodatées, `drive.log` des entrées injectées, journaux `j2d-g1..g3.log` du paquet) et `.ue-cache/travail/livraison/j2d/`.

**HUD de l'entraînement au paddock (problème majeur du contrôle) : corrigé, vu à l'écran dans le paquet.**

- **Cause confirmée** : `AStridesHUD::DrawHUD` sortait tôt dès que le modèle du HUD masquait la minicarte (classe
  `cso-ctl`), et l'interface UMG d'épreuve n'a ni objectif ni bouton d'action. Le web ne masque la télémétrie et le bouton
  d'action que sous `cso-sober` (`kind === 'cso'`, `hud.js:390-392`, `styles.css:988-995`) et l'objectif que sous
  `cso-on` (tableau d'épreuve).
- **Code** (`4b1d8317`) : `RaceOverlay` / `DrawRaceOverlay` dessinent en mode concours l'objectif (haut gauche), la
  télémétrie « allure · km/h » (bas centre, km/h arrondis comme `hud.js:252`) et l'invite « E · Terminer », chacun selon
  le masque du modèle ; en épreuve (`cso-sober`, `cso-on`) la surcouche reste vide. Le modèle décide aussi pour un
  entraînement lancé au poteau du paddock sans épreuve préalable. La ligne d'objectif identique à la ligne d'état n'est
  plus répétée (doublon « Rejoins le paddock… », P3 du contrôle).
- **Testé moteur** : `Strides.Scenario.Training` appelle `DrawHUD` sur une toile 844 × 390 et lit le texte rendu :
  « Entraînement : 0 saut sans faute sur 0 », « PAS · 11 km/h », « E  ·  Terminer » ; « 1 saut sans faute sur 1 » après
  le vertical ; même rendu au poteau du paddock. `Strides.Cso.RunInGame` : surcouche vide en épreuve. Avant correction,
  le même test échouait (télémétrie et invite vides, journal `j2d-hud-1.log`).
- **Vu dans le paquet Development** (entrées injectées par l'agent, CGEvent, captures système) : `121743-paddock-hud.jpg`
  montre en même temps l'objectif « Entraînement : 0 saut sans faute sur 0 », « E · Terminer » et « PAS · 2 km/h » ;
  `123004-terminer.jpg` : « Terminer » par E (invite lue à l'écran, plus à l'aveugle) → « Entraînement terminé · 0 saut
  sans faute sur 0 » ; `guidage-carriere-…jpg` : objectif affiché une seule fois.

**Guidage « Paddock du Pôle » (défaut trouvé en jouant, P2 corrigé).** La ligne visait le centre du paddock en ligne
droite : cheval arrêté contre la lice nord du paddock, puis contre la lice ouest de la carrière (l'entraînement part du
bilan, cheval dans la carrière). `PaddockGuideAim` (`58c53baf`) : sortie de la carrière par son ouverture sud (autour des
obstacles), coin sud-ouest, allée, ouverture est du paddock, centre. Testé moteur (la ligne suivie au stick : depuis la
lice ouest de la carrière en 2 679 images, depuis le nord du paddock en 686) ; **joué en paquet** : bilan → « S'entraîner »
au clavier → ligne suivie par le joueur de l'agent (`suivre.py`) jusqu'au paddock (« 173 m · demi-tour » puis 19 m, étape
d'entraînement atteinte). Choix signalé n° 14 ci-dessous (le GPS du web n'est pas porté).

**Saut franchi au paddock dans le paquet (mineur) : toujours non obtenu.** Joueur `viser.py` (cercle à main droite,
tout droit si le bouton SAUT s'allume, SAUT au vert) : 555 lectures sur 3 essais, 0 bouton allumé détecté, 2 refus
(toasts « Refus : trop près, appelle plus tôt » au journal à 11:24:42 et 11:24:47 UTC) ; puis conduite pas à pas sur
captures : vertical manqué à droite. Les sauts sans faute et les barres avec cause restent prouvés dans le moteur seulement
(scénario qui pose le cheval à 13 m, comme relevé par le contrôle). À confirmer par Julien au clavier.

**Environnement de la partie (à connaître pour rejouer).** Le poste est partagé : boîte du trousseau « security veut
utiliser… » ouverte à répétition par le gateway OpenClaw (`security find-generic-password`, Chrome Safe Storage puis
`strides-ai-backoffice-session`), qui prend le premier plan et masque le haut-centre de l'écran (zone des toasts et de
l'astuce de 7 s : **non vérifiables à l'écran dans cette partie**) ; une touche S injectée est arrivée une fois dans son
champ (6 caractères, jamais validés ; aucune touche Entrée envoyée, aucun bouton touché). Chrome piloté par le gateway
(ports 18804-18806) a pris le premier plan deux fois. Deux clics souris dans le jeu à 11:14-11:15 (heure de Paris) ne
viennent pas de l'agent (bilan quitté). Mémoire saturée (swap 11,5 Go sur 12) : deux `CrashReportClient -Unattended`
bloqués à 100 % CPU depuis 17 h et 2 jours (anciens plantages d'éditeur) ont été arrêtés ; les rapports restent sur
disque, les deux autres (fenêtres) n'ont pas été touchés. Aucune alerte de confidentialité touchée.

| Point du contrôle | État | Preuve |
|---|---|---|
| HUD d'entraînement (majeur) | **corrigé, vu en paquet** | `121743-paddock-hud.jpg`, `123004-terminer.jpg`, `Strides.Scenario.Training` |
| Saut franchi en paquet (mineur) | **non obtenu** ; moteur seulement | `122446-viser-0080.jpg` (refus, cheval dans l'oxer), journal |
| Objectif en double (mineur) | **corrigé** | `guidage-carriere-…jpg` |
| Alertes et fenêtres système (mineur) | toujours présentes, aucune touchée ; trousseau ajouté à la liste | captures |

**Matrice de fin d'étape.** ctest **12 / 12** ; Automation `Strides` **56 succès, 0 échec** (sur `4b1d8317`, 1 attente
Zen résolue seule, aucun éditeur arrêté) ; `Strides.Scenario.Training` et `Strides.Cso.RunInGame` repassés verts sur
`58c53baf` ; paquets Development (cuisson complète puis `-skipcook` sur chaque commit) et Shipping reconstruits sur `58c53baf` :
**0 / 14** chaînes d'outils dans le Shipping (`check-shipping-tools.txt`). Captures CSO G5 non refaites (carrière du Pôle non modifiée).

## J3 — Monde vivant de Deauville

| Lot | Contenu | Critères | Tests | Preuves | Dépend de |
|---|---|---|---|---|---|
| J3-A | Circulation (src/gameplay/npcs.js:73 `Car`, :323 `TrafficFx`) sur les 8 routes | Voitures sur les routes, arrêt devant le cheval, pas de collision bloquante | ctest de la logique de suivi de route (portée dans StridesCore) | captures, vidéo | J1 |
| J3-B | PNJ piétons et ambiance (npcs.js:16 `WalkAI`, :421 `Ambient`) | Densité et zones du web | ctest | captures | J3-A |
| J3-C | Jour / nuit, météo, marées (src/world/weather.js, game.js:824) | Heure du jeu suit le web ; ciel et lumière changent | ctest des fonctions de weather.js portées | captures à 4 heures | J1 |
| J3-D | Lieux et intérieurs utiles (sellerie, clinique, cafés), boutiques (shops.js:38), fers d'or (collectibles.js:16) | Chaque POI a une entrée ou une action | ctest | captures | J3-A |
| J3-E | Performance du monde vivant sur Mac et budget iOS mesuré (dessin, triangles, mémoire) | Valeurs mesurées et écrites | -StridesShots=perf **hors Shipping** | relevé | J3-A à J3-D |

### État J3 au 27/11/2026 (étape « Monde vivant de Deauville », base `d6c08ee7`)

Légende : **écrit** (code), **compilé**, **testé moteur** (Automation ou ctest), **joué par l'agent** (paquet, entrées
système injectées par l'agent : CGEvent, captures `screencapture` ; jeu à la main par Julien : **à confirmer par Julien**).
Sélection : `unreal/docs/livraison/preuves/j3-20261127/` (1,7 Mo) ; reste : `.ue-cache/travail/livraison/preuves/j3/`
(captures horodatées, `drive.log`, journaux `j3-g1.log`, `j3-g2.log`, `j3-perf-844*.log`, sauvegardes avant / après).
Actifs définitifs, provisoires et hors V1 : [`actifs.md`](actifs.md).

**Ordre suivi : chemin principal d'abord.**

| Lot | État | Preuve |
|---|---|---|
| Mini-carte dans le sens du web (tournée selon le regard, ronde, portée selon la vitesse, repères au bord, flèche, N) | **testé moteur, joué** | ctest « monde-vivant » (90 images du web, écart < 5e-7) ; `Strides.Hud.MinimapRotation` (flèche en haut, N en bas en regardant le sud, à gauche en regardant l'est) ; captures `144105`, `144623` |
| GPS : guidage « GPS · lieu · distance · direction » vers la mission, balise, itinéraire sur la carte (direct à cheval, comme `gps.js`) ; « Itinéraire » de l'app Activités vers le chrono du Pôle | **testé moteur, joué** | `Strides.Phone.MissionFlow` ; paquet : mission « Trouver un professionnel » suivie au GPS de l'Écurie du Val à Deauville City (451 → 23 m, `suivre.py` mode gps), « Premier concours » jusqu'au Pôle International |
| Téléphone : 12 apps de l'accueil du web, app Strides (offres, demande, « Accepter la mission » en deux touchers ≥ 350 ms, rangé 1,3 s après), Activités (Itinéraire), Carte plein écran, autres apps « pas encore portée » ; clavier, souris, doigt | **testé moteur, joué au clavier** | `Strides.Phone.MissionFlow` ; journal `j3-g1.log` : `offer:tuto` → `accept` ×2 → `career start: tuto (téléphone)` |
| Missions et progression : 4 missions acceptées au téléphone et terminées en paquet (tuto, m1, m2, m3) : 440 crédits, 490 réputation | **joué par l'agent** | `journal-parties-g1-g2.txt` |
| Sauvegarde automatique (12 s, acceptation, fin de mission) et reprise au lancement ; mission en cours rechargée en point de reprise « REPRISE » (le web ne relance pas une mission seul) | **testé moteur, joué** | paquet relancé : « reprise au lancement faite », `offer:m3` en tête, acceptée puis terminée au Pôle ; Shipping relancé : 440 crédits, 490 réputation, offre suivante « Groom du matin » (`1559-shipping-reprise.jpg`) |
| J3-A circulation : 7 voitures du web (`Car` porté : voie de droite, 50 / 70 km/h, cheval croisé à 20 km/h, arrêt 5 m avant l'obstacle, klaxon devant un piéton, priorité à droite, demi-tour) | **testé (ctest + moteur), vu en paquet** | ctest (4 scénarios du web, écart < 1e-6 m) ; `Strides.World.AmbientLife` (2 voitures arrêtées derrière le cheval, klaxon devant le piéton) ; paquet : voiture arrêtée à 5,0 m du cheval, 0 klaxon (`perf-voiture-arretee-devant-cheval.jpg`) |
| J3-B passants et foule : 24 passants (ville, Planches, palefreniers) et 8 spectateurs du Pôle, séparation des passants, arrêt face au joueur | **testé, vu en paquet** | ctest ; `perf-passants-planches.jpg` |
| J3-C jour / nuit, météo, marées | **non fait** | hors de cette étape (voir actifs.md) |
| J3-D intérieurs, boutiques, fers d'or | **non fait** | idem |
| J3-E coût du monde vivant à 844 × 390 (paquet Development, Metal, Mac mini) | **mesuré** | `perf-monde-844.json` : jeu 1,52 → 1,96 ms (médiane, + 0,44 ms), GPU 14,6 → 14,4 ms, image 16,7 ms (60 i/s tenues), mémoire 3 065 → 3 084 Mo (+ 19 Mo) ; 170 pièces (≤ 170 appels de dessin), 80 544 triangles au LOD 0 (test moteur). Appels de dessin du RHI : compteur resté à 0 dans le paquet, **à confirmer** ; valeurs iPhone : **à confirmer sur appareil (J6)** |

**Défauts trouvés en jouant.** Corrigés : « rejoindre town » (identifiant du lieu au lieu de son nom, P3) ; têtes en
sphères trop coûteuses (109 216 triangles, P2) ; **une mesure `-StridesShots` a écrasé la sauvegarde** (outil avec
sauvegarde automatique, P1 côté outil, jamais côté joueur) : la sauvegarde de la 2e partie a été restaurée depuis la copie
gardée, et le mode capture n'écrit plus la sauvegarde (vérifié par empreinte md5 avant / après une mesure). Ouverts : HUD
et mini-carte trop grands à 844 × 390 (P2, J5-A) ; le téléphone dessiné est petit sur grand écran (P3) ; voitures et
passants provisoires (P2, actifs.md) ; touches SAUVER / CHARGER masquées mais textes présents dans le binaire Shipping
(P3, non comptés par le contrôle des 14 chaînes).

**Environnement des parties.** La boîte du trousseau « security veut utiliser… strides-ai-backoffice-session » est restée
ouverte au centre de l'écran toute la partie 1 et 2 (elle masque le haut du téléphone sur les captures ; le journal du jeu
fait foi pour les écrans) ; puis une boîte « CrashReportClientEditor a quitté de manière imprévue » pendant la partie
Shipping. Aucune n'a été touchée ; aucune touche n'est arrivée dans le champ du trousseau (premier plan vérifié avant chaque
groupe de touches, clic dans le jeu d'abord). Aucune alerte de confidentialité touchée.

**Matrice de fin d'étape** (sur `0e9566a6`) : ctest **13 / 13** ; Automation `Strides` **59 succès, 0 échec** ;
paquets Development (cuisson complète puis `-skipcook`) et Shipping reconstruits : **0 / 14** chaînes d'outils dans le
Shipping, et `perf-monde` absent du Shipping. Attentes « Waiting for ZenServer » : 6 lancements d'éditeur sur 7 en ont eu une, toutes résolues seules ; aucun éditeur arrêté.

### Correction de J3 après contrôle adverse (27/11 soir, base `d6c08ee7`)

Légende inchangée (écrit, compilé, testé moteur, joué par l'agent avec entrées système injectées par l'agent ; jeu à la
main par Julien : **à confirmer par Julien**). Preuves : `.ue-cache/travail/livraison/preuves/j3c/` (captures
horodatées, `drive.log` par dossier, journaux du jeu `j3c-g1.log` à `j3c-g3.log` en heure UTC, `journal-carriere.txt`,
sauvegardes avant / après) ; sélection versionnée : `preuves/j3c-20261127/`.

| Problème du contrôle | Verdict | Ce qui a été fait | Preuve |
|---|---|---|---|
| Missions et progression inventées (titres, lieux, gains de m1 à m3, fugueur, plage, csi3, gp) | **fondé, P1, corrigé** | Liste écrite à la main le 17/11 retirée de `world_architecture.json`. `scripts/unreal/export-missions.mjs` importe les modules du web sous Node (`story.js` `STORY`, `story2.js`, `parisGP.js`, `config.js` `REPUTATION`) et calcule les offres avec la vraie `MissionManager.refreshOffers` → `Content/Data/story_missions.json` et oracle. `StridesCore/Career` (offres, verrou de palier, acceptation, paiement unique, paliers) | ctest « carriere » 225 vérifications (m1 « Deux écuries, une matinée » 90 € / 60, m3 150 € + dotation / 200, fugueur 160 / 200, csi3 500 / 450, 23 relevés d'offres du web) ; tests moteur `Strides.Career.Story`, `Strides.World.CareerGraph` (somme du web 4 130 € / 5 510 points) |
| Tuto et m1 terminés 0,1 s après l'acceptation | **fondé, corrigé** | Chaque mission suit un **itinéraire relevé dans les étapes du web** (positions, textes, rayons) : tuto = entrée de la carrière du Val, 5 anneaux, Camille (7 étapes) ; m1 option Val (boxes, Iris, Narval, Camille) ; m2 option seul·e (obstacles 1 à 5 du Pôle, retour, Opale) ; m3 (parking des camions du Pôle, secrétariat, **épreuve du Pôle**, équipe) ; groom (foin ×4) ; transport (Haras, Pôle, Manon). Les 10 autres : lieu du web, déroulé J4-C. Étapes d'action non portées listées dans `skipped` | Paquet Development, entrées injectées : tuto acceptée au téléphone à 17:10:56 (UTC), 1re étape franchie à 17:11:58, payée à la 7e à 17:17:22 (+50 €, +60) ; m1 acceptée 17:18:31, payée 17:28:26 (+90 €, +60 ; total 140 € / 120) ; `journal-carriere.txt` |
| Voiture arrêtée devant le cheval vue seulement dans l'outil perf-monde | **fondé** | Critère J3-A ramené à **partiel** : arrêt prouvé par ctest et Automation, vu dans l'outil de mesure ; **aucune partie par entrées injectées ne l'a montré** (ni celles du contrôle, ni celles-ci) | — |
| GPS « direct à cheval » dans les façades et contre la lice | **fondé (P2), non corrigé** | Règle du web gardée (`gps.js` : direct à cheval). M3 passe désormais par le parking des camions et le secrétariat, hors de la lice. Reconnaissance de m2 : le cheval bute contre l'oxer n° 1 (le web la fait à pied ; le portage n'a pas de marche à pied utilisable, voir plus bas) → rayon 7 m au lieu de 4,5 (choix n° 20) | captures `m2/`, `m2d/` |
| Clavier du téléphone perdu après « Retour arrière » ; fuite des touches vers le cheval | **cause trouvée, corrigé ; fuite infondée** | Le Retour arrière (kVK_Delete) n'avait **aucun code** dans la table des touches : il n'arrivait jamais au jeu, et l'Entrée suivante touchait l'élément « ‹ Retour » de l'écran (ligne `back (écran map)` du journal du contrôle). Ajouté avec l'Entrée du pavé ; ctest. La « fuite » : la capture `g2-itin` est prise **après** « Itinéraire », qui range le téléphone (journal du contrôle : `itinerary:cso_train` puis `fermé` à 15:50:55) ; les touches suivantes vont légitimement au cheval | ctest « oracles » (codes physiques) ; `ctrlJ3-g2.log` lignes 1003-1051 |
| Plantage `AStridesHUD::DrawHUD` sous `-nullrhi` non signalé, boîte du rapport de plantage | **fondé, déjà corrigé avant 2ebc5a34, désormais signalé** | Plantage du 27/11 14:17 (pendant le développement de J3) : `AHUD::DrawRect` sans `FCanvas` sur une toile de test ; les enveloppes `DrawRect` / `DrawText` / `DrawLine` gardées par `Canvas->Canvas` sont entrées dans `2ebc5a34` (14:26). Le `CrashReportClient` 10899 resté ouvert a été arrêté (SIGTERM) ; la boîte système « CrashReportClientEditor a quitté » a été fermée par « Ignorer » | `Strides.Hud.MinimapRotation` vert (2 matrices) |
| J3-E : appels de dessin à 0, triangles comptés par test | **fondé, reste partiel** | Non repris dans cette correction | — |
| SAUVER, CHARGER, MISSION dans le binaire Shipping ; clic souris non prouvé en Shipping | **fondé, corrigé (libellés) ; clic à confirmer** | Les trois boutons ne sont plus construits en Shipping ; ajoutés au contrôle `check-shipping-tools.py` (17 chaînes) | contrôle du Shipping ci-dessous |
| J3 incomplet (voitures garées, véhicules pilotables, cavaliers et chevaux d'ambiance, commerces, intérieurs, jour/nuit, météo, marées) | **fondé** | **14 véhicules garés du web** (tracteur et Duster du Val, 12 places de la ville ; `export-voitures-garees.mjs`), infranchissables (collision de `vehicle.js`). Le reste : **non fait**, voir actifs.md | `Strides.World.AmbientLife` (14 garées, 14 collisions, cheval repoussé) ; journal du paquet « 7 voitures, 14 garées, 24 passants, 8 spectateurs » |

**Parties de l'agent (paquet Development, entrées injectées par l'agent, aucune console, ni F8, ni -StridesShots).**
Sauvegarde précédente mise de côté (copie et empreinte dans `sauvegardes-avant/`), partie neuve : « Premiers contrats ·
0 crédits · 0 réputation ». Tuto et m1 **acceptées au téléphone et terminées par tout leur itinéraire** (ci-dessus). m2
acceptée, étapes 1 à 6 sur 7 franchies (5 obstacles reconnus à cheval au rayon 4,5 m, retour au Val), la 7e (Opale, 3,4 m)
non atteinte avant l'incident ci-dessous. **Relance du paquet** : « reprise au lancement faite », 140 crédits, 120 points,
m2 reproposée « REPRISE », acceptée de nouveau (repart de l'étape 1, choix n° 17). **m3 et son étape d'épreuve n'ont pas
été jouées en paquet** (testées moteur seulement). Joué à la main par Julien : **à confirmer**.

**Incident pendant la 1re partie (non résolu, à surveiller).** 25 s après l'acceptation du tuto, le paquet est tombé de
33 à ~2 images/s, et son empreinte mémoire a atteint **42 Go, dont 39 Go d'IOSurface (5 246 régions)** au bout de 55 min
(`footprint`) ; macOS a mis en pause Claude, Chrome, Terminal et TextEdit (boîte « Forcer des applications à quitter »,
laissée telle quelle). Au même moment, une alerte de confidentialité macOS (« python3.11 … contourner le sélecteur de
fenêtre privée ») est apparue : **jamais touchée** ; le joueur de l'agent a cessé de pouvoir capturer pendant 11 min.
Relancé ensuite à l'identique (même paquet, même sauvegarde, mêmes entrées et captures toutes les secondes) : **24 Mo
d'IOSurface stables, 27 à 31 images/s** pendant 20 min. Cause **à confirmer** ; le jeu n'alloue aucune surface par image
dans le code de J3 (HUD dessiné au canevas, pièces posées une fois).

**Limites trouvées en jouant (ouvertes).** À pied, le joueur ne se déplace presque pas et la direction du guidage ne suit
pas la marche (P2, antérieur à J3) : la reconnaissance « à pied » du web est faite à cheval. Le joueur de l'agent tourne
autour des points de 4 m au galop (ralenti ajouté dans `suivre.py`, outil hors jeu). Libellé de l'étape doublement
numéroté « (4/5) (5/7) » (P3).

### Deuxième correction de J3 après contrôle adverse (27/11 soir, base `d6c08ee7`, commits depuis `d559d6be`)

Légende inchangée : **écrit**, **compilé**, **testé moteur** (Automation ou ctest), **joué par l'agent** (paquet,
entrées système injectées par l'agent : CGEvent, captures `screencapture`). Jeu à la main par Julien : **à confirmer
par Julien**. Preuves : `.ue-cache/travail/livraison/preuves/j3d/` (dossiers `g1` à `g10`, `s1`, `s2`, `drive.log`,
journaux du jeu `j3d-g2.log`, `j3d-g3-relance.log`, sauvegardes avant / pendant / après) ; sélection versionnée :
`preuves/j3d-20261127/` (0,6 Mo).

| Problème du contrôle | Verdict | Ce qui a été fait | État et preuve |
|---|---|---|---|
| Partie sauvegardée à pied : cheval perdu à la reprise (P1) | **fondé, corrigé** | La sauvegarde garde la position et le cap du cheval (`game.js` `_storePositions` `pos.horse`) ; la reprise à pied le repose (`game.js:1063`). Repère « Cheval » sur la mini-carte quand le joueur est à pied (`game.js:1382`, ramené au bord) ; aussi pour une ancienne sauvegarde sans position du cheval | **testé moteur** (`Strides.Save.HorseOnFoot` : cheval laissé à 345 m, relu à < 0,5 m, repère, remonté ; ctest « oracles ») ; **joué par l'agent en paquet Development** : descendu, éloigné de 8,6 m, sauvegarde automatique (`pose-sauvegardee-a-pied.json` : joueur (13,4 ; 486,2), cheval (9,4 ; 478,7)), paquet arrêté puis relancé : « Partie reprise », **cheval à côté du joueur et repère sur la mini-carte** (`g3-221315-demi-tour.jpg`). Shipping relancé sur l'ancienne sauvegarde du contrôle : repère « Cheval » au bord de la mini-carte (`s2-222900-ship2.jpg`). **Remonter après la reprise : non obtenu par entrées injectées** (10 plans : la marche à pied du portage ne se dirige pas au clavier de façon fiable, P2 antérieur à J3 ; le joueur est passé à 4,1 m du cheval) ; prouvé dans le moteur seulement |
| « Missions et progression conformes au web » exagéré : 10 missions payées à l'arrivée (P1) | **fondé, corrigé pour 7 sur 10** | `export-missions.mjs` relève les étapes du web de livraison, fugueur, plage, fer, pension, csi3, gp ; `StridesCore/Career` porte le compte à rebours et l'échec du web (`missions.js:226-228`, `fail`, `timeoutText`) et les règles de résultat de csi3 et du Grand Prix. Choix n° 23 et 24 | **testé** (ctest « carriere » : 105 s de la selle, échec « Trop tard : l’épreuve a commencé sans la selle. », rien payé, reproposée ; 9 pénalités refusées, 8 acceptées ; Van Dijk battu ou non ; moteur `Strides.Career.Story`). **Non joué en paquet** (ces missions demandent le palier 2 et la fin de groom). **Restent réduites : cross, derby, gpparis** (épreuves non portées) : décision demandée à Julien |
| J3 incomplet (véhicules, chevaux et cavaliers d'ambiance, J3-C, J3-D, J3-E) | **fondé** | **J3-C** : heure, soleil, météo et marée du web (`StridesCore/WorldClock`, oracle `export-meteo.mjs`, ctest « meteo » : 780 relevés de météo, 236 de marée, 97 de soleil, écarts < 1e-12) ; `AStridesWorldClock` : lumière, nuit, brouillard, mer à la marée ; heure gardée dans la sauvegarde, arrêtée téléphone ouvert ; HUD « 7:35 · Éclaircies · 13 °C ». **J3-D** : 20 fers d'or du web (`export-fers.mjs`, `StridesCore/Collectibles`) : 2,6 m, +25 €, +500 € à 20, sauvegardés, repères à 70 m | **testé moteur** (`Strides.World.DayNight` : soleil à 52,3° à 14 h, nuit à 23 h, marnage du jour 0 de −3,74 à 3,33 m, 1 200 s = un jour, heure relue ; `Strides.World.Horseshoes`) ; **vu en paquet** : heure qui avance (7:35 → 13:52 en 18 min réelles, relances comprises), aube, matin, Shipping (`g1`, `g2`, `g3`, `s2`). Fers d'or : **non ramassés en paquet**. **Restent non faits** : véhicules pilotables, chevaux et cavaliers d'ambiance, commerces et intérieurs, discussions, pluie visible et éclairage nocturne, J3-E (appels de dessin) |
| actifs.md range des lots en « Hors V1 » sans arbitrage | **fondé, corrigé** | Section renommée « Non faits », chaque ligne marquée **J3 à faire**, **jalon Jx** ou **à arbitrer** | `actifs.md` |
| m3 et son épreuve jamais jouées en paquet | **fondé, toujours vrai** | non rejoué dans cette correction | moteur seulement |
| Incident mémoire de 42 Go | **non reproduit** | sessions de cette correction : 2,89 à 3,24 Go pour le paquet Development, 2,97 à 4,99 Go pour le Shipping (au chargement), relevés dans le panneau système | cause à confirmer |
| Panneau « Forcer des applications à quitter » ; touche fn collée ; note de Notes | **constaté** | panneau toujours ouvert (non touché ; le premier plan a été vérifié avant chaque touche, aucune touche perdue au journal) ; joueur avec drapeaux à 0 (aucune touche N ni A envoyée) ; Notes non ouverte | **à signaler à Julien : un secret serait stocké en clair dans une note rapide de Notes (relevé du contrôle, non vérifié ici)** |
| Forme noire au poteau Chrono (P3) | **non traité** | — | ouvert |

**Défaut trouvé en jouant (corrigé)** : à l'aube (7 h 37 de jeu, soleil à 4°), la première version de l'éclairage
laissait la scène presque noire (`g1-215917-fin.jpg`) ; l'exposition suit désormais la lumière reçue au sol (choix n° 22)
(`g3-221315-demi-tour.jpg`, 8 h 48). **Défauts ouverts** : la marche à pied (P2, antérieur) ; au démarrage d'une partie
neuve (7 h, soleil à −1°) la lumière est celle de l'aube (fidèle à l'heure du web, à confirmer à l'œil par Julien).

**Matrice** (sur `7b3b6d4f` puis le réglage d'exposition) : ctest **15 / 15** (dont « meteo » nouveau) ; Automation `Strides`
**63 / 63** (62 succès sur la matrice complète, `Strides.World.Horseshoes` corrigé dans son test puis repassé ; les 14 tests
`Strides.World`, `Save`, `Career`, `Phone`, `Hud` repassés après le réglage) ; une attente « Waiting for ZenServer » par
lancement d'éditeur (6), toutes résolues seules, aucun éditeur arrêté. Paquets Development et Shipping reconstruits
(`-skipcook`, données `Content/Data` mises en scène) : **0 / 17** chaînes d'outils dans le Shipping
(`check-shipping-tools.txt`). Sauvegarde du joueur remise à l'identique après les parties (md5 `8d46a855…`).

### J3b « J3 suite : monde vivant, reste du périmètre » (27/11 nuit, base `7302f52e`)

Légende inchangée : **écrit**, **compilé**, **testé moteur** (ctest ou Automation), **vu en paquet** (lancé sans
aucune entrée), **joué par l'agent** (entrées système injectées par l'agent). Jeu à la main par Julien : **à confirmer
par Julien**. Preuves : `.ue-cache/travail/livraison/preuves/j3b/` ; sélection versionnée : `preuves/j3b-20261127/`.

| Lot | État | Preuve |
|---|---|---|
| Missions cross, derby, gpparis : « À venir » (choix n° 25, arbitrage provisoire de Tom) | **testé** | ctest « carriere » : offres identiques au web (23 relevés), acceptation refusée « À venir : … », carrière complète jusqu'à pension, csi3 acceptée si le derby était fait |
| Véhicules pilotables du web : 14 garés + camion de l'écurie (`truckPhysics.js`, `vehicle.js`, `truck.js`) | **testé moteur, vu en paquet ; non joué** | ctest « vehicules » (4 379 vérifications contre la vraie `TruckSim` du web, écart < 7e-7 m) ; `Strides.World.Vehicles` : E à la portière, Z 4 s → 31,9 m et 56 km/h en D2, S jusqu'à l'arrêt, E → à pied à la portière, boîte de collision déplacée ; contre une Golf garée : arrêtée à 4,38 m (2 chocs) ; camion : cheval embarqué, 9,2 m, déchargé 6,7 m derrière ; sauvegarde au volant relue |
| Camion des missions (m3, transport) | **écrit et testé moteur** : le camion se conduit et emporte le cheval (choix n° 26) ; les étapes du web restent franchies au lieu, en camion ou à cheval | `Strides.World.Vehicles` § 6 |
| Phares la nuit (`lightK`) | **testé moteur** | `Strides.World.Vehicles` § 5 |
| Pluie, étoiles, lune (`rain.js`, `sky.js`) | **testé, vu en paquet** : à 1 h 06 de jeu, les étoiles apparaissent, mais **le ciel de nuit reste clair** (atmosphère d'Unreal et exposition relevée du choix n° 22) et elles se détachent en gris sur ce fond (**P2 ouvert**, `paquet-dev-nuit-etoiles.jpg`) ; pluie non vue (pas d'averse pendant le lancement) | ctest « ciel » (hash13 du web, 1 693 étoiles, gouttes) ; `Strides.World.NightSky` |
| Marche à pied dirigeable (P2) | **testé moteur ; non joué** | `Strides.World.FootSteering` : 5,4 m/s au clavier, 7,2 m/s en sprint, Z + D en avant à droite de la caméra, caméra recentrée à 77° en 1 s sur un marcheur à 90° (camera.js) |
| Fer d'or ramassé | **testé moteur** (au volant : +25 € après 2,6 s) ; **non joué en paquet** | `Strides.World.Vehicles` § 8 |
| Nuages, halos des lampadaires | **non faits** : proposés en J5 (actifs.md) | — |
| Chevaux et cavaliers d'ambiance | **non faits** : proposés en J5 (actifs.md) | — |
| Commerces, intérieurs, discussions | **non faits** : achats proposés en J4, intérieurs **hors V1 PROPOSÉ**, discussions en J4 (actifs.md) | — |
| J3-E appels de dessin du RHI | **bloqué par le moteur** : le profileur CSV du paquet Development (`-csvCaptureFrames`) relève aussi `RHI/DrawCalls` = 0 et toutes les catégories `DrawCall/*` = 0 : le RHI Metal de cette version ne remplit pas ces compteurs. Même relevé : image 28,9 ms, jeu 1,7 ms, GPU 28,6 ms, 3,1 Go (Mac mini, 1920 × 1080). Mesure à reprendre sur iPhone avec la capture GPU de Xcode (J6) | `preuves/j3b/passif/profil-csv-dev.csv` |
| Forme noire au poteau Chrono (P3) | **non corrigé, cause non trouvée** : ce n'est ni la balise du Pôle (cachée à moins de 12 m) ni le repère des aides (cône de 30 cm) d'après le code ; à reproduire en jouant | — |

**Partie manuelle en paquet : BLOQUÉE.** La fenêtre système « Forcer des applications à quitter » (processus
`loginwindow`, 392 × 455 en (1500 ; 466)), ouverte depuis l'incident mémoire de J3, est toujours affichée et garde le
premier plan. Les règles du poste partagé interdisent toute entrée injectée tant qu'elle est ouverte, et interdisent d'y
toucher. Le nouvel outil `scripts/unreal/partie-manuelle/joueur-sur.py` (entrées au seul processus du jeu par
`CGEventPostToPid`, `garde.swift` avant chaque rafale, captures de la seule fenêtre du jeu) attend donc sans rien taper.
Non joués en paquet : mission au téléphone suivie au GPS puis reprise, véhicule conduit, fer d'or ramassé, remonte
après une reprise. Le paquet Development a été lancé **sans aucune entrée** : il démarre, reprend la partie et affiche
le HUD à pied avec « Monter en voiture : E à la portière ».

**Matrice** : ctest **17 / 17** (« vehicules » et « ciel » nouveaux) ; Automation `Strides` **66 / 66**, EXIT CODE 0, une
attente « Waiting for ZenServer » résolue seule ; paquets Development (cuisson complète, 12 min) et Shipping (`-skipcook`)
reconstruits : **0 / 17** chaînes d'outils dans le Shipping.

## J4 — Boucle produit

| Lot | Contenu | Critères | Tests | Preuves | Dépend de |
|---|---|---|---|---|---|
| J4-A | Écran titre, création du personnage (screens.js:32, :45), langue | Première partie guidée | Automation écrans | captures | J1 |
| J4-B | Téléphone interactif (phone.js:23) : Missions, Événements, Carte plein écran (minimap.js:372), Trophées, Profil, Réglages | Chaque app ouvre un écran utile ; GPS posé depuis la carte | Automation par app | captures | J1-D |
| J4-C | Missions à étapes du web (missions.js:11 `makeSteps`, :256) et histoire (story.js:49), progression crédits / réputation / rangs | 3 premières missions du web jouables de bout en bout | ctest des étapes ; scénario | partie manuelle | J4-B |
| J4-D | Défis (challenge.js:15-87, challengeRun.js:31) et records par défi, classement | Défi Pôle V1 jouable, record enregistré | ctest + scénario | partie manuelle | J1-E |
| J4-E | Sauvegarde complète (save.js:129 version 2, migration) et reprise | Relance du paquet : tout l'état revient | Strides.Core.Save étendu | fichiers avant / après | J4-C |

### État J4 au 28/11/2026 (étape « Boucle produit », base `3cb3e07f`)

Légende inchangée : **écrit**, **compilé**, **testé moteur** (ctest ou Automation), **vu en paquet** (lancé sans
aucune entrée), **joué par l'agent** (entrées système injectées par l'agent). Jeu à la main par Julien : **à confirmer
par Julien**. Preuves : `.ue-cache/travail/livraison/preuves/j4/` ; sélection versionnée : `preuves/j4-20261128/`.

| Lot | État | Preuve |
|---|---|---|
| Cross de Saint-Gatien (`courseSteps` kind « xc », mission `cross`) | **testé moteur** ; mission déverrouillée (choix n° 25 révisé) | ctest « epreuves » : la vraie MissionManager du web dans une partie factice (`export-epreuves.mjs`), 6 scénarios (sans faute, touché et temps dépassé, 3 refus au même obstacle, 4e refus, erreur de parcours puis cavalier descendu, temps limite) rejoués image par image : étape, objectif, état, appels `hud.*` / `audio.*`, issue et paiement ; `Strides.Events.Cross` (10 obstacles fixes sautés par le cœur, Espace en bonne zone, 320 € + pourboire 32 €, +350) et `Strides.Events.CrossRefusals` (3 refus au trot : « 3e refus sur le même obstacle : éliminé du parcours. », rien payé, offre rendue) |
| Derby de la Touques (`raceSteps`, mission `derby`) | **testé moteur** ; mission déverrouillée | ctest « epreuves » : 6 scénarios (victoire, 4e, 3e, 6e, sortie de piste, cavalier descendu) avec les 5 adversaires (PathAI du web) à 2e-3 m près ; `Strides.Events.Derby` : stalles, 5 adversaires affichés, course au clavier (Z, Q / D, Maj par à-coups), grand galop 14 m/s, victoire 420 € + 42 €, +400 |
| Grand Prix de Paris Indoor (`parisGP.js`) | **partiel : logique seule, testée** ; mission toujours « À venir » | ctest « epreuves » : `parisRivals`, `sprintField`, `rankSprint`, `gpField`, `barrageField` identiques au web sur 4 graines. Non porté : arène couverte de Paris (`paris.js`, région à part), trajet A13, Sprint et Grand Prix jouables, podium. Reste à faire (J4 suite) |
| J4-A Écran titre, création du personnage | **testé moteur** | `Strides.Scenario.Career` : « Jouer » sans sauvegarde, « Qui monte en selle ? », prénom effacé puis « Julie », « C'est parti » → partie neuve écrite ; relance : « Continuer » choisi d'office → reprise. Langue FR / EN non portée (choix n° 31) |
| Premier lancement : objectif clair | **testé moteur** | objectif d'accueil « Prochaine étape · P pour ouvrir le téléphone · Une mission t’attend sur Strides » (missions.js update, choix n° 32) |
| J4-C Missions, récompenses | **testé moteur** | 15 missions sur 16 jouables jusqu'au Grand Prix CSI 5★ (ctest « carriere » : 273 vérifications) ; pourboire de 10 % à 5 étoiles porté pour le cross et le derby (note du web calculable sur l'épreuve seule) |
| J4-D Défis et records | **testé moteur** | défi du Pôle v6 du web (`challenge.js`) : ctest « defis » (179 vérifications contre le vrai module : résultats, comparaisons, record par version, doublons) ; `Strides.Challenge.Pole` : app Activités → « Règles et départ », parcours sauté → « Nouveau record · 0 pt · … s » écrit dans la sauvegarde ; 2e tentative éliminée : record gardé, 2 tentatives. Défi de Paris refusé (« À venir ») |
| Erreurs et éliminations | **testé** | cross (refus, temps limite, descendu, erreur de parcours), derby (descendu, hors top 3, « Course terminée sans toi… »), défi (élimination = résultat, comme `challengeRun`) |
| J4-E Sauvegarde et reprise | **testé moteur** | `Strides.Scenario.Career` : titre → personnage → « Premiers pas » par le téléphone → m1, m2 → cross → récompense → sauvegarde → 2e monde (relance) → « Continuer » : prénom, 612 €, 2 010 points, 11 missions, position à 1 m près, derby proposé |
| Pause | inchangée (J1, carte Pause) ; l'écran titre met aussi le jeu en pause et coupe la sauvegarde automatique | `Strides.Scenario.Career` |
| Partie de 15 minutes en paquet par entrées injectées | **BLOQUÉE** : panneau « Forcer des applications à quitter » toujours ouvert (voir plus bas) | — |

**Vu en paquet (sans aucune entrée)** : paquets Development (cuisson complète, 16 min 36 s, code 0) et Shipping
(`-skipcook`, code 0) de cette étape ; lancés par `open`, ils s'ouvrent sur l'écran titre (« Continuer » choisi d'office,
« Nouvelle partie », pied de page du clavier ; journal : `Strides écran titre : ouvert`). Premier lancement : le HUD
de débogage restait visible derrière le titre (`titre-paquet-dev-hud-visible-avant-correction.jpg`), corrigé (HUD masqué
tant que le titre est ouvert, `titre-paquet-shipping.jpg`). **P2 ouvert** : derrière le titre, la caméra du cavalier à
pied est collée à son corps (gros plan du jean). Sauvegarde de Julien du paquet (`strides_main.sav`, md5 `8d46a855…`)
inchangée après les lancements (aucun choix fait sur le titre, sauvegarde automatique coupée).

**Partie manuelle en paquet : BLOQUÉE.** La fenêtre système « Forcer des applications à quitter » (`loginwindow`, 392 × 455
en (1500 ; 466)) est restée ouverte pendant toute l'étape (vérifiée à 23 h 57, 0 h 48, 1 h 09, après chaque paquet et à 2 h 20) ; les règles
du poste partagé interdisent toute entrée injectée tant qu'elle est affichée. Ni la session de 15 minutes de J4, ni les
vérifications en paquet de J3b (mission au téléphone, GPS, reprise, véhicule conduit, fer d'or) n'ont pu être jouées :
**à confirmer**. Le parcours joueur complet est couvert dans le moteur par `Strides.Scenario.Career`.

**Matrice** : ctest **19 / 19** (« epreuves » 51 385 vérifications, « defis » 179, « carriere » 273, nouveaux ou étendus) ;
Automation `Strides` **71 / 71**, EXIT CODE 0, une attente « Waiting for ZenServer » résolue seule. Le premier passage
complet a révélé que des tests et le surlignage du Pôle cherchaient les obstacles par numéro sans filtrer le parcours
(les obstacles du cross portent aussi 1 à 10) ; un test (`Strides.Scenario.Jump.Oracle`) faisait tomber l'éditeur. Corrigé
(`course == "cso"`), puis matrice verte. Shipping : **0 / 17** chaîne d'outils. Jeu web intact (`export-epreuves`,
`export-defis`, `export-missions` `--check` : inchangés).

### Correction de J4 après contrôle adverse (28/11 matin, base `3cb3e07f`, commits depuis `d2305bdb`)

Le contrôle a relevé : Grand Prix de Paris non porté (critère du jalon non atteint) ; aucune partie en paquet par entrées
injectées ; critère « missions, récompenses, erreurs, pause, sauvegarde et reprise » déclaré atteint sur la foi de
`Strides.Scenario.Career` (téléportations, missions marquées faites, « relance » = 2e monde dans le même éditeur) ; HUD
partiellement visible sous l'écran titre ; paquets antérieurs au dernier commit. Les cinq points sont fondés.

| Lot | État | Preuve |
|---|---|---|
| Grand Prix de Paris Indoor : logique (`PARIS_MISSION` de `parisGP.js`) | **testé (ctest)** contre le web | `export-paris.mjs` fait jouer la **vraie** `MissionManager` du web dans une partie factice (trajet A13, chargement, accréditation, échauffement, Sprint, présentation à 20 h, Grand Prix, barrage, podium, dotation, note, pourboire) ; ctest « paris » : 5 scénarios (victoire avec trajet complet et barrage, barres, double élimination, temps dépassé, barrage avec une barre) rejoués image par image : type d'étape, objectif, état de la manche, grands messages, toasts, dialogues, **cartes** (en-tête, titre, lignes, classement), issue : **18 814 vérifications, 0 écart** ; tracés du Sprint et du Grand Prix retracés par le cœur = obstacles posés par `Obstacles` du web |
| Arène de Paris, A13, manches jouables, podium | **compilé, testé moteur** (test fonctionnel), **vu dans le moteur** | `AStridesParisVenue` (salle, piste 86 × 46 m, lice, tribunes, paddock, tentes, parking, projecteurs provisoires, choix n° 35) ; obstacles du Sprint / du Grand Prix / du paddock sur l'acteur du parcours ; `Strides.Events.Paris` : mission acceptée → Margot (E ×3) → descendre, monter au volant (cheval embarqué) → bretelle → carte « Direction Paris » (Entrée) → +2 h 10, −46 l → descendre → accréditation (E) → monter → 2 sauts au paddock → Sprint (présentation, cloche, départ, 7 obstacles, arrivée) → classement → présentation des 40 cavaliers à 20 h → Grand Prix (dialogue de l'entraîneur : Comète plafonne sous 1,60 m) → podium → mission payée (+1 500 réputation). **Test fonctionnel** : cheval posé devant chaque obstacle et ligne (`PlaceAt`), Espace au moment calculé ; ce n'est pas une partie jouée. Captures du moteur (`-StridesShots=paris`, outil hors Shipping) : `preuves/j4c-20261128/paris-arene.jpg`, `paris-exterieur.jpg` |
| Mission gpparis déverrouillée | **testé** | `story_missions.json` : étape « event » `gpparis`, plus aucune mission « À venir » ; ctest « carriere » : les 16 missions se terminent |
| Défi de Paris (app Activités) | **non porté** (choix n° 33 inchangé) | l'arène existe désormais ; le défi rejouable de Paris reste à brancher (J5) |
| HUD sous l'écran titre | **compilé, à revoir en paquet** | interface d'épreuve UMG et commandes tactiles (bouton « II ») masquées tant que le titre est ouvert (`SyncTitleHud`) ; le gros plan sur le jean du cavalier (P2) reste |
| Missions, récompenses, erreurs, pause, sauvegarde et reprise | **partiel** (révisé) | `Strides.Scenario.Career` est un **test fonctionnel** (téléportations, 7 missions intermédiaires marquées faites, relance simulée par un 2e monde dans le même processus) : il prouve l'enchaînement et la sauvegarde, **pas** une partie jouée ni la reprise après une vraie relance du paquet : **à confirmer** |
| Partie de 15 minutes en paquet par entrées injectées ; reprise après vraie relance | **BLOQUÉE** | fenêtre système « Forcer des applications à quitter » (`loginwindow`, 392 × 455 en (1500 ; 466)) toujours ouverte (relevés de 02:21 à 04:37 : `ctrl-J4/panneau.log`, `ctrl-J4c/panneau.log`, et contrôles avant chaque étape) ; les règles du poste partagé interdisent toute entrée tant qu'elle est affichée ; elle n'est pas de l'agent et n'a pas été touchée |

**Paquets de HEAD** : Development et Shipping refaits **après** le commit de code `c425ca7e` (04:20:17) : binaires
Development 04:29:26 et Shipping 04:35:24 (`-skipcook` : seuls le code et les données JSON non cuites ont changé ; le
commit suivant ne change que des commentaires et le plan), sorties `.ue-cache/travail/livraison/builds/j4c/`, BuildCookRun
code 0 pour les deux. Shipping : **0 / 17** chaîne d'outils (`check-shipping-tools.txt`) ; le mode `-StridesShots=paris`
est dans le code compilé hors Shipping. Paquet Shipping lancé sans aucune entrée : fenêtre de jeu 1920 × 1080 ouverte,
puis fermée par l'agent (son propre processus) ; sauvegarde de Julien (`strides_main.sav`, md5 `8d46a855…`) inchangée.
**Capture de l'écran titre en paquet non refaite** : la session n'a pas le droit « Enregistrement de l'écran »
(`screencapture -l` : « could not create image from window », outil `oeil` : refus) ; le masquage du HUD sous le titre est
donc **compilé, non vu** : à confirmer.

**Matrice** : ctest **20 / 20** (nouveau : « paris ») ; Automation `Strides` **72 / 72**, EXIT CODE 0, repassée à HEAD après le dernier changement de code (`j4c-matrice-3.log`) (nouveau :
`Strides.Events.Paris` ; `Strides.Parite.CsoScenery` et `Strides.World.Stands` comptaient les obstacles et tribunes sans
ceux de Paris : comptes corrigés), attentes « Waiting for ZenServer » résolues seules (0 blocage). Jeu web intact
(`export-paris`, `export-epreuves`, `export-missions`, `export-defis` `--check` : inchangés).

### 2e correction de J4 après contrôle adverse (28/11, base `3cb3e07f`, commits depuis `25e4f433`)

Le 2e contrôle a relevé quatre points. Ils sont tous fondés. Trois sont corrigés. Le quatrième reste bloqué.

| Point | État | Preuve |
|---|---|---|
| Aides au sol des manches de Paris et du cross (courses.js:188 `CourseAids(game, courseId)`, courseAids.js:45) | **compilé, testé moteur** | `UpdateAids` couvre trois cas : le Pôle, la manche de Paris en cours et le cross. Paris : tracé `PARIS_COURSES[courseId].line`, repère, zone d'appel. Cross : repère et zone, sans tracé, car le web n'a pas de ligne pour `'xc'`. Le cœur expose `strides::parisAidLine`. Le ctest « paris » vérifie cette ligne point par point contre la `line` exportée du web, plus les `lineS` des obstacles : 18 834 vérifications, soit 20 de plus. `Strides.Events.Paris` vérifie, pour chaque manche, les aides en place (course `paris_sprint` / `paris_gp`), les tirets vers l'obstacle 1 et le repère. Il vérifie aussi que la zone d'appel affichée suit le calcul `takeoffZone`. `Strides.Events.Cross` vérifie la course « xc », le repère, la zone, l'absence de tracé et le retrait des aides en fin d'épreuve |
| Sortie de piste au pas après l'arrivée à Paris (courses.js:309) | **compilé, testé moteur** | Avant, la cadence calculée par la manche était jetée. Elle est maintenant relue dans le cheval (`CsoCadenceNow`), passée à `TickParis`, puis réécrite (`SetCsoCadence`). Un refus compté pendant une manche la remet aussi à 0 par ce chemin. `Strides.Events.Paris` : après l'arrivée, la cadence descend de 1,6 m/s² vers 1,9 m/s. L'écart à la formule du web est vérifié sous 0,1 m/s |
| `export-paris.mjs` absent de `package.json` | **corrigé** | Ajout de `unreal:oracles-paris` et de `unreal:oracles`, qui lance les quatre `--check`. La matrice (`scripts/unreal/matrice.sh`) commence désormais par ces quatre contrôles. Les quatre passent, et les fichiers sont inchangés |
| Écran titre : HUD masqué non vu en paquet ; gros plan du jean ; miniature en bas d'écran | **compilé, testé moteur, vu dans le moteur** (voir plus bas) | La cause du gros plan et de la miniature : la caméra restait sur le personnage. Le web, lui, survole Deauville sous le titre (game.js:1416-1422 `updateTitle`). Ce survol est porté : orbite autour de (60 ; −330), à 46 ± 6 m de haut, avec un champ vertical de 60°. La caméra du personnage revient à la fermeture du titre. `Strides.Scenario.Career` vérifie la caméra créée sur l'orbite du web, le regard vers (60 ; 6 ; −370), l'interface masquée et la caméra retirée à la fermeture. Dans un monde de test sans joueur local, le gestionnaire de caméra n'applique pas la cible. La vue réelle est donc vérifiée en jeu (`-StridesShots=titre`, outil hors Shipping). **Défaut trouvé en jeu** : le premier passage a écrit « HUD masqué 0, caméra de survol 0 ». Le titre met le jeu en pause, et en pause le moteur n'appelle pas `PlayerTick`. Le masquage de la 1re correction n'avait donc **jamais** lieu en jeu. Correction : `TickActor` en pause appelle `SyncTitleHud`. Au 2e passage, le HUD était masqué mais la vue restait figée (`titre-moteur-avant-camera-en-pause.jpg`) : en pause, le monde ne recalcule pas le point de vue. Le gestionnaire de caméra est maintenant mis à jour sous le titre. 3e passage : « HUD masqué 1, caméra de survol 1 ». Deauville est vue d'en haut, avec la mer, et la vue change entre les deux captures prises à 8 s d'écart (`preuves/j4d-20261128/titre-moteur-survol-1.jpg`, `-2.jpg`). Il n'y a plus de bouton « II », de mini-carte, de miniature ni de gros plan. **Vu dans le moteur** (éditeur en `-game`), **pas en paquet** : en paquet, la session n'a pas le droit de capture de l'écran |
| Partie de 15 minutes en paquet par entrées injectées ; reprise après vraie relance ; vérifications de J3b en paquet | **BLOQUÉE** (inchangé) | La fenêtre « Forcer des applications à quitter » (`loginwindow`, couche 8, 392 × 455 en (1500 ; 466)) est toujours ouverte. Relevés de cette correction : 05:17:46 et 05:38:25, à la suite de `ctrl-J4/panneau.log`. Elle n'est pas de l'agent : l'agent ne l'a pas touchée et n'a rien injecté |

Ce qui reste à confirmer : toute la boucle J4 côté joueur (missions, cross, derby, Grand Prix de Paris, récompenses,
sauvegarde, reprise après vraie relance) n'est prouvée que par des tests fonctionnels (`PlaceAt`, relance simulée par un
2e monde). La partie jouée en paquet attend la fermeture du panneau système. Le jeu à la main par Julien est à confirmer.

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
11. **Faute fantôme : passage d'obstacle oublié à l'entrée en piste** (27/11, J2b, arbitrage de Tom dans le mandat de
   Julien « recommencer une partie proprement ») : le web garde `horse._pass` d'une manche à l'autre (défaut du web, non
   reproduit dans le portage) ; Unreal l'oublie à chaque entrée en piste. Remise à zéro seulement, aucune règle de jugement
   changée (pas de fermeture d'un passage à 8 m). Effet mesuré au web : une « Erreur de parcours » et un son de faute
   injustifiés, 0 point.

12. **Fin de l'entraînement** (27/11, J2c) : le web ouvre la carte de fin de mission (`screens.missionResult` : titre,
   kicker, texte, +15 réputation) ; le portage n'a pas encore cette carte ni la réputation des missions (comme pour
   l'épreuve du Pôle) : titre et texte en grand message de 3,5 s. À reprendre avec la boucle produit (J4).
13. **Refus pendant l'entraînement** (27/11, J2c) : la règle du portage hors épreuve (un refus remet la cadence à 0,
   contrôle J1 : cheval « coincé » contre la barre) s'applique aussi à l'entraînement ; le web n'a pas d'écouteur qui
   remet la cadence pendant l'entraînement. Guidage « Paddock du Pôle » pendant l'étape « rejoindre le paddock » (même
   ligne que le choix n° 5, le GPS du web n'étant pas porté).

14. **Guidage vers le paddock** (27/11, J2d) : le web guide l'étape « rejoindre le paddock » par son GPS (non porté) ;
    le portage trace la ligne « Paddock du Pôle » par des points fixes (ouverture sud de la carrière, coin sud-ouest,
    allée, ouverture est du paddock), le plus simple qui ne traverse aucune lice.

15. **Téléphone au clavier** (27/11, J3) : le web n'a que le toucher et la souris (boutons HTML). Choix : flèches / ZQSD
    pour choisir, Entrée / E / F pour toucher, Retour arrière pour revenir, Échap / P / Tab ferment (comme au web).
16. **Carte plein écran** (27/11, J3) : `drawFullMap` du web permet zoom, déplacement et repère posé au doigt ; le
    portage affiche la carte centrée sur le joueur (700 m), nord en haut, sans geste. À reprendre en J4-B.
17. **Reprise au lancement** (27/11, J3) : le web reprend par « Continuer » à l'écran titre (non porté, J4-A) ; le
    portage recharge la sauvegarde dès le lancement. La mission en cours n'est pas relancée d'office (règle du web) :
    elle est reproposée en tête de l'app Strides, marquée « REPRISE ».
18. **Arrivée du GPS posé à la main** (27/11, J3) : effacé à 6 m (rayon par défaut de `gps.set`) ; une mission reste
    terminée à 18 m (choix antérieur du portage : missions à une étape).

19. **Paiement des missions** (27/11, correction J3) : `def.pay` et `def.xp` du web, une seule fois ; le pourboire de
    10 % à 5 étoiles (`missions.complete`) n'est pas porté, la note dépendant du déroulé complet (J4-C). **J4** : porté
    pour le cross et le derby, dont la note du web ne dépend que de l'épreuve. Dotation de M3
    (classement simulé) non portée : participation seule.
20. **Itinéraires des missions** (27/11, correction J3) : étapes du web à position fixe, dans l'ordre, au rayon du web ;
    choix figés (m1 : « Préparation (Val) », le tarif de base du web ; m2 : « s'organiser seul·e ») ; trajets du camion
    (m3, transport) faits à cheval ; reconnaissance des obstacles de m2 à cheval, rayon 7 m (4,5 m à pied au web), le
    portage n'ayant pas de marche à pied utilisable.
21. **Épreuve de M3** (27/11, correction J3) : l'étape « épreuve » ouvre le poteau « Chrono » du Pôle (épreuve Amateur
    1,10 m, la même classe que M3 au web) malgré la mission en cours, et se franchit quand le parcours commencé pendant
    l'étape est terminé, quel qu'en soit le résultat (la participation est due même éliminé, comme au web).
22. **Lumière du jour et de la nuit** (27/11 soir, J3-C) : la direction du soleil, l'heure, la couverture nuageuse, les
    averses et la marée sont ceux du web (oracle) ; les intensités (10 lux au plus, lune de 0,35 lux à l'opposé du
    soleil, lumière du ciel 0,3 à 1,5) et l'exposition (relevée quand la lumière baisse) sont un réglage du portage,
    `sky.js` n'étant pas porté. À confirmer à l'œil par Julien. Absent en mode capture (`-StridesShots`) pour garder la
    lumière des captures de référence (G5).
23. **Missions dont l'étape du web est à l'intérieur ou suit un cheval qui bouge** (27/11 soir) : « Selle sur-mesure » se
    retire devant la porte de la Sellerie (rayon 4 m ; comptoir intérieur au web, intérieurs non portés) ; « Le fugueur »
    se rattrape au point d'apparition de Tonnerre (−385 ; 70) dans les 130 s du web (Tonnerre ne fuit pas) ; « Galop sur la
    plage » garde les anneaux à mi-marée et le temps de base de 95 s (le web les recule à marée basse et ajoute du temps) ;
    « Fer perdu » et « La pension parfaite » sautent l'étape du Guide local (non porté). Chaque réduction est listée dans
    `skipped` de `story_missions.json`.
24. **Qualificative CSI 3★ et Grand Prix** (27/11 soir) : courus sur le Parcours du Pôle du portage (hauteurs et temps
    accordé du Parcours, pas 1,45 m / 1,55 m du web) avec les règles de résultat du web : 8 pénalités au plus ; battre
    Van Dijk (4 points en 52,4 s, `timeAllowedFor(cso, 400) − 3,6`). Un échec arrête la mission sans paiement, comme
    `missions.fail`.

25. **Missions « Cross de Saint-Gatien », « Derby de la Touques » et « Grand Prix de Paris Indoor »** (27/11 nuit, J3b,
    **arbitrage provisoire et réversible de Tom**, option A de la décision demandée en J3) : leur épreuve du web (cross
    `xc` de `courses.js`, course de `raceSteps`, `parisGP.js` / `paris.js`) n'est pas portée. Elles restent offertes
    dans l'app Strides **exactement comme au web** (ordre, verrou de palier : oracle `refreshOffers` inchangé) mais ne
    s'acceptent pas : « À venir : le cross de Saint-Gatien n'est pas encore porté. » (`story_missions.json` `upcoming`,
    `AcceptResult::Upcoming`). Raison : ne rien payer à la simple arrivée (P1 du contrôle) sans inventer de règle de
    résultat. Effet : la carrière s'arrête après « Fer perdu » et « La pension parfaite » (csi3 demande le derby, gp
    demande csi3). Les épreuves seront portées en J4 et les missions déverrouillées à ce moment-là (retirer `UPCOMING`
    dans `export-missions.mjs`). **Révisé le 28/11 (J4)** : cross et derby portés et déverrouillés ; seul le Grand Prix
    de Paris Indoor reste « À venir ».
26. **Camion de l'écurie et cheval** (27/11 nuit, J3b) : le web charge le cheval par la rampe (`vanLoading.js`,
    `transport.js` : longe, stalle, rampe, porte) ; le portage n'a pas cette séquence. Choix : en montant au volant du
    camion, le cheval laissé à moins de 15 m est embarqué d'office (`transport.loadInstant` du web, utilisé par le web
    pour les missions et la reprise), et il est déchargé à 2,5 m derrière le camion à la descente. Le camion a le gabarit
    du porteur d'origine (`truckModel.js` `TRUCK_DIM`, 8,5 m) et non le camion STX de 13 m chargé par défaut au web.
27. **Véhicules : simplifications** (27/11 nuit, J3b) : dynamique, commandes, portière, boîte de collision, phares et
    sauvegarde sont ceux du web. Non portés : séquence animée de montée et de descente (`boarding.js` ; le cavalier est
    caché au volant), eau trop profonde (`waterDepth`), bord de région (`clampToRegion`), collision boîte contre boîte
    avec les autres véhicules en plus des colliders (le portage garde les colliders du web, où chaque véhicule a déjà sa
    boîte), voitures de la circulation reprises au vol (`ambient.takeOver`), son du moteur, compteur et carburant à la
    pompe (`fuel.js`). Adhérence route / terre : le portage reste sur l'adhérence de route (`soft` = 0) ; le web la
    lit dans `nearestRoad`. Les bâtiments n'arrêtent pas les véhicules (pas plus que le cheval : leurs collisions ne
    sont pas dans les colliders du portage).
28. **Ciel de nuit et pluie** (27/11 nuit, J3b) : étoiles (densité, éclat, estompage de `sky.js`), lune et pluie
    (`rain.js`) portées ; le ciel physique de `sky.js` (diffusion, nuages procéduraux) ne l'est pas, le portage garde
    l'atmosphère d'Unreal. Étoiles et lune posées sur une sphère de 900 m qui suit la caméra (le brouillard d'Unreal
    masquerait une sphère plus lointaine). À confirmer à l'œil par Julien.

29. **Adversaires de la course de l'hippodrome** (28/11, J4) : vitesse et trajectoire par la vraie règle `PathAI.update`
    du web (points du couloir, regard à 7 m, vitesse selon l'écart au joueur et le dernier virage), puis le sous-ensemble
    cinématique de `Horse.update` (cap borné à `lerp(2,8 ; 1,45 ; v / 16)` rad/s, accélération 4,5 / 3,6 m/s², 9 au
    freinage, avance sur le cap) sur sol plat, sans pente, eau ni collision entre chevaux. Le fondu au noir avant les
    stalles est remplacé par un placement immédiat ; le cavalier d'entraînement de l'hippodrome n'est pas porté. Les
    adversaires sont affichés par un acteur léger (cheval du jeu, cavalière, casaque colorée), sans robe propre.
30. **Commandes à la course** (28/11, J4) : le portage garde les commandes de concours (direction par taux de virage,
    cadence) ; à la course, la cadence va jusqu'au galop allongé du web (9,72 m/s) et BOOST (Maj tenue) donne le grand
    galop à 14 m/s tant que le cheval n'est pas épuisé (endurance de `horse.js` : −7 / s au-dessus de 10,5 m/s, reprise
    9 / s, épuisé jusqu'à 35 %). Au web, la course se monte avec les commandes du monde ouvert (joystick relatif à la
    caméra), non portées.
31. **Écran titre** (28/11, J4-A) : non portés : bouton « Découvrir la vraie application Strides » (lien externe), bascule
    FR | EN (les textes des missions et des épreuves du portage sont en français seulement), écran de chargement et ses
    astuces, mode sûr après arrêt brutal. « Cavalier » est enregistré mais le portage n'a que le modèle de cavalière
    (à confirmer par Julien). Le prénom se tape au clavier (champ choisi aux flèches) ; sur iPhone, la saisie tactile est
    à faire en J6.
32. **Objectif d'accueil au clavier** (28/11, J4) : le web écrit « Prochaine étape · touche pour ouvrir » (bandeau qu'on
    touche) ; sur Mac, le bandeau n'est pas touchable : « Prochaine étape · P pour ouvrir le téléphone », sur iOS le
    texte du web.
33. **Défi du Pôle** (28/11, J4-D) : conditions de la version courante du web (v6 : 10 obstacles à 1,10 m, 64 s, 2 refus,
    Onyx, jour 2 à 11 h). Départ direct depuis « Règles et départ » de l'app Activités, sans la carte d'introduction ni
    la carte de résultat partageable (`challenge-screens.js`) : grand message (« NOUVEAU RECORD », résultat) et carte de
    l'app mise à jour. Le cheval fourni ne change que la puissance du saut (1,06) : robe, vitesse et endurance d'Onyx non
    portées. Ni panneau du défi au Pôle, ni classement en ligne. Défi de Paris refusé tant que l'arène n'est pas portée.
34. **Cross** (28/11, J4) : obstacles fixes en formes de base aux dimensions et couleurs de `builders.js` (tronc, haie,
    entrée dans l'eau), sans panneau numéro ; Paul Faure n'est pas affiché ; l'eau de la mare ne ralentit pas le cheval
    (profondeur d'eau non portée dans le pas du cheval). Le chrono part au compte à rebours, comme au web.
35. **Grand Prix de Paris Indoor** (28/11, correction de J4) : arène en blocs aux cotes de `sites.js` (salle sans toit,
    murs, piste, lice, tribunes en gradins, paddock, tentes, parking, voie d'accès) ; non portés : toit, écrans géants
    (`screenInfo` tenu par le cœur, non affiché), public, panneaux de lice, officiel des accréditations (tente seule),
    plan du parcours de Paris (« Voir le plan » retiré de la carte de présentation), fondu et carte de route du trajet
    (trajet immédiat puis carte « Bienvenue à Paris »), écran de fin de carrière (`screens.ending` : message de fin).
    Projecteurs : 8 lumières ponctuelles sans ombre (le Grand Prix se court à 20 h). Plein à l'aire de service : plein du
    réservoir payé sur le solde (le détail de `fillQuote` n'est pas porté). Textes en français seulement.
36. **Camion sans rampe** (28/11, correction de J4, suite du choix n° 26) : le portage n'a ni rampe ni cheval mené en
    main ; l'état « Ouvre la rampe arrière du camion » du chargement devient « Monte au volant du camion : … embarque
    avec toi », celui du déchargement « Gare-toi et descends du camion (ACTION à l'arrêt) ».
37. **Écran titre** (28/11, 2e correction de J4) : la caméra survole Deauville comme le web (`updateTitle`), mais le monde
    reste en pause derrière le titre. Ni l'heure fixée à 18 h 24 du web (`sky.update(18.4)`), ni les oiseaux, les bateaux
    ou les chevaux d'ambiance n'avancent : on voit l'heure et l'état de la partie au lancement. C'est le plus simple, et la
    sauvegarde du joueur reste intacte avant son choix.
38. **Aides des manches de Paris** (28/11, 2e correction de J4) : elles sont mises à jour dans l'image du cheval, alors que
    la manche avance dans l'image du parcours. L'obstacle suivant affiché peut donc changer une image (1/30 s) après le
    web. Effet invisible (P3).

## Risques

- Cuisson longue (17 à 18 min par paquet) et cache Zen sur disque externe : prévoir les paquets en fin de lot, pas à chaque essai.
- Blocages « Waiting for ZenServer » (1 sur 5 lancements à l'audit) : arrêter le seul processus éditeur, relancer, compter.
- Écart vitesse / carte (B5) pourrait toucher le chrono du CSO : à trancher en J1-C avant J1-E.
- SIGBUS d'animation (J1-H) : peut ruiner une partie longue ; à reproduire tôt.
- Navigation par entrées injectées coûteuse sans GPS (36 essais à l'audit) : J1-D réduit ce coût pour toutes les preuves suivantes.
- Fenêtres système (trousseau, rapports de plantage d'Epic) ouvertes sur l'écran de Julien : ne jamais les manipuler, viser la
  fenêtre du jeu par son identifiant.
