# Equestrian Tour — portage natif Unreal Engine 5 (iPhone/iPad en priorité)

Branche `claude/unreal-port`. Le jeu web (`src/`, `public/`) reste intact : c'est la référence de comportement.

| Dossier | Contenu |
|---|---|
| `StridesGrandTour/StridesGrandTour.uproject` | projet Unreal UE 5.8.4, cibles iOS et Mac |
| `StridesGrandTour/Config/` | rendu mobile (sans Lumen, Nanite ni ombres virtuelles), iOS paysage, Enhanced Input |
| `StridesGrandTour/Source/StridesCore/` | **cœur C++20 sans type Unreal** (compilé par UE 5.8.4 et hors moteur) : saut, conduite CSO, cheval de concours, obstacles, déroulé d'épreuve et textes, caméra de concours, HUD d'épreuve, commandes, sauvegarde native |
| `StridesGrandTour/Source/StridesGrandTour/` | module de jeu : cheval, cavalier, obstacles, parcours, données, sauvegarde, commandes, HUD, tests d'automatisation |
| `StridesGrandTour/Content/Data/` | données versionnées exportées du jeu web (JSON, unités SI) |
| `core/` | compilation et tests du cœur hors moteur (CMake), oracles exportés du jeu web |
| `docs/MATRICE.md` | matrice de migration module par module |
| `docs/conventions.md` | unités, axes, caps, modèles importés |
| `docs/relais-mac.md` | compiler, ouvrir, jouer, importer, construire pour iOS — et ce qui n'est pas vérifié |
| `docs/PARITE.md`, `docs/parite/` | inventaire de parité (source de vérité), spécification et écarts de la tranche a (`cso-spec.md`, `cso-ecarts.md`), banc de parité et montages côte à côte (`parite/README.md`, `parite/cso/`) |
| `../scripts/unreal/export-data.mjs` | export des données et des oracles (lit le code JS existant) |

## Décisions d'architecture
- **Règles sportives en C++ standard** (StridesCore), testées hors moteur contre le jeu web : aucune règle dans des
  graphes Blueprint ; paramètres en données JSON versionnées (lus par `UStridesDataSubsystem`), exposés en UPROPERTY.
- **Simulation équestre conservée** (vitesses, cadence, rayon de virage, trajectoire de saut, jugement) : pas de physique
  générique ; le moteur sert au rendu, aux collisions de décor, à l'animation et aux entrées.
- Unités SI dans le cœur ; conversion unique en cm / axes Unreal (`StridesUnits.h`).
- Pas de GAS ; sous-systèmes `UGameInstanceSubsystem` (données, sauvegarde) ; Enhanced Input créé dans le code ;
  UMG pour l'interface (tranche « écrans ») ; Animation Blueprint / Control Rig pour cheval et cavalier (après import).
- Mobile dès le départ : chemin de rendu mobile, MSAA, ombres en cascade limitées ; budgets mesurés sur appareil réel.

## Parité fonctionnelle (jeu web → Unreal)
| Fonction du jeu web | Unreal |
|---|---|
| Règles du saut (appel, marges, causes, qualité) | **identiques au JS (oracles)** : plan du saut, zones et causes, facteurs vitesse et angle, qualité de l'appel, visée et déclenchement ; **partiel** : trajectoire (juge chaque barre depuis T3 ; calage du clip animé non vérifié, dégagement toujours 0), cause et mot d'appel affichés (rendu du HUD, police du moteur), « Trop tôt » affiché (T9), astuce « Trop lent » absente |
| Conduite de concours (cadence, virages), cheval de concours (visée, appel, refus) | **identiques au JS (oracles de scénario rejoués image par image)** : cap, cadence, conduite, déclenchement du saut, réception, refus ; règle d'appui identique, astuce « Trop lent » absente (**partiel**) ; branches non départagées déclarées |
| Parcours du Pôle : obstacles (jugement au passage, chute des barres, refus), déroulé d'épreuve (entrée, cloche, départ, arrivée, éliminations, textes FR / EN), temps et pénalités, bilan | **identiques au JS (oracles)** : jugement des barres au passage, décision et pénalité de refus, ordre des fautes, cloche, départ et départ lancé, arrivée, élimination à la descente, temps accordé, pénalités de temps, temps limite, comparaison de deux résultats ; **partiels** : chute des barres (remise en piste sans oracle), refus unique (recomptage après détour non exercé), contacts des membres (non portés), effleurement, affichage de l'élimination, habillage des obstacles (couleur du mur), entrée dans l'épreuve (T10 : poteau « Chrono », lancement, contrôle de capacité, cartes de présentation et du plan, annonce : contenus identiques aux oracles, montages côte à côte, police du moteur), bilan et classement simulé (T11 : textes, classement et mise en page identiques aux oracles, colonnes à 8,2 px au plus, graine négative refusée), Recommencer (« S'entraîner » sans effet : `cso_warmup` absent) ; **absents** : défis, entraînement au paddock, collisions des obstacles |
| Caméra de concours (champ vertical 58°) | règle de la caméra **identique au JS (oracle « cc »)**, montages aux 6 instants de `cso-framing.mjs` ; **partiel** : caméra dès l'entrée en piste (pas d'orbite manuelle à rendre) et contre le décor (sonde du moteur, pas les colliders du web) |
| HUD d'épreuve UMG, commandes d'épreuve (joystick flottant, SAUT, pause, clavier par codes physiques) | logique rejouée **sans écart contre les oracles** (seuil de 420 px des toasts et pas du décompte des crans non départagés) ; rendu **partiel** (police du moteur, animations non comparées, joystick approché) ; toucher réel iOS **non vérifié** |
| Aides à l'appel (bouton SAUT coloré, zone d'appel et tracé au sol, repère) | logique rejouée **sans écart contre les oracles** (`takeoffZone`, canal « ai » des exécutions `t9-*`, dont `tests/e2e/cso-shots.mjs` rejoué), montages côte à côte (dont les captures de la recette) ; **partiel** : rendu des bandes et tirets plus terne, aide imposée par un défi non portée, bande de moins de 0,2 m et zone sans aucune plage non départagées |
| Sauvegarde | **schéma natif v1 + import de l'export web, testés** ; sauvegarde/rechargement vérifiés à l'écran |
| Déplacement à pied, monter, descendre | **compilé et vérifié à l'écran**, transition 0,8 s |
| Cheval PJL (modèle, 17 clips), cavalier réaliste (visages, mains, posture) | **importés et positionnés** ; 17 animations cheval normalisées, allures/sauts branchés ; cavalier ancré sur le point de selle animé, animation squelettique à finir |
| Monde (Deauville, Pôle, écuries, maison, ville, plage, bocage, forêts) | **exporté du jeu web et rhabillé en matériaux photo**, relief à collisions, cheval sur le relief : [`docs/decors.md`](docs/decors.md) ; Paris, intérieurs, météo, jour/nuit à faire |
| Missions, histoire, téléphone Strides, progression, réputation, compétences, énergie | à faire (logique pure, portable) |
| Véhicules, transport du cheval, carburant | à faire |
| PNJ, foule, cavaliers PNJ | à faire |
| Audio | épreuve du Pôle : sons portés en T12 (rendu hors ligne de `audio.js` importé à l'identique, journal identique au canal « audio » du web ; compresseur du bus maître non porté, écoute réelle non faite) ; reste du jeu à faire ; traductions FR / EN des textes de l'épreuve **portées** (strings_cso.json), le reste à faire |
| Interface tactile UMG | en épreuve : joystick flottant du web, SAUT et pause (joysticks du moteur retirés) ; hors épreuve : boutons du portage (monter, allures, sauvegarde, chargement) ; compilée pour iOS le 18/11 seulement, test sur appareil réel requis |

## Distribution iOS

- Identité : `Equestrian Tour`, `com.strides.equestriantour`, version marketing `1.0.0`, iOS 16 minimum.
- Archive arm64 non signée validée avec les données cuites du jeu, les icônes et le manifeste de confidentialité.
- Procédure, état vérifié et blocages Apple : [`docs/testflight.md`](docs/testflight.md).

## Prochaine tranche
Tranche a (parcours CSO du Pôle) livrée de T1 à T12, hygiène finale et contrôle adverse le 21/11/2026 : 78 fonctions,
**23 identiques prouvées, 41 partielles, 14 absentes**, rien de vérifié sur appareil iOS ; remarques 16, 17 et 26
corrigées à la reprise du 22/11/2026 (alignement sur le JS, 32 tests Automation au vert). Ce qui reste pour qu'elle soit entièrement
identique, par ordre d'importance visible pour le joueur : `docs/parite/cso-ecarts.md` §4 (« Ce qui reste pour une
tranche a entièrement identique ») ; détail : `docs/relais-mac.md` (« Parité de la tranche a ») et `docs/PARITE.md`.
Tranche suivante : à décider par Julien.
