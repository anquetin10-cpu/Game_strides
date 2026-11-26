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

## Risques

- Cuisson longue (17 à 18 min par paquet) et cache Zen sur disque externe : prévoir les paquets en fin de lot, pas à chaque essai.
- Blocages « Waiting for ZenServer » (1 sur 5 lancements à l'audit) : arrêter le seul processus éditeur, relancer, compter.
- Écart vitesse / carte (B5) pourrait toucher le chrono du CSO : à trancher en J1-C avant J1-E.
- SIGBUS d'animation (J1-H) : peut ruiner une partie longue ; à reproduire tôt.
- Navigation par entrées injectées coûteuse sans GPS (36 essais à l'audit) : J1-D réduit ce coût pour toutes les preuves suivantes.
- Fenêtres système (trousseau, rapports de plantage d'Epic) ouvertes sur l'écran de Julien : ne jamais les manipuler, viser la
  fenêtre du jeu par son identifiant.
