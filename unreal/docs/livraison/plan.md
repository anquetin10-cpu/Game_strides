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

## Risques

- Cuisson longue (17 à 18 min par paquet) et cache Zen sur disque externe : prévoir les paquets en fin de lot, pas à chaque essai.
- Blocages « Waiting for ZenServer » (1 sur 5 lancements à l'audit) : arrêter le seul processus éditeur, relancer, compter.
- Écart vitesse / carte (B5) pourrait toucher le chrono du CSO : à trancher en J1-C avant J1-E.
- SIGBUS d'animation (J1-H) : peut ruiner une partie longue ; à reproduire tôt.
- Navigation par entrées injectées coûteuse sans GPS (36 essais à l'audit) : J1-D réduit ce coût pour toutes les preuves suivantes.
- Fenêtres système (trousseau, rapports de plantage d'Epic) ouvertes sur l'écran de Julien : ne jamais les manipuler, viser la
  fenêtre du jeu par son identifiant.
