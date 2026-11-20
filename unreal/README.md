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
| Règles du saut (appel, marges, causes, qualité) | **identiques au JS (oracles)** : plan du saut, zones et causes, facteurs vitesse et angle, qualité de l'appel ; **partiel** : trajectoire (pas encore utilisée barre par barre), cause et mot d'appel affichés (rendu du HUD), textes « Trop lent » et « Trop tôt » absents |
| Conduite de concours (cadence, virages), cheval de concours (visée, appel, refus) | **identiques au JS (oracles de scénario rejoués image par image)** : cap, cadence, conduite, déclenchement du saut, réception, refus ; règle d'appui identique, textes d'aide absents (**partiel**) ; branches non départagées déclarées |
| Parcours du Pôle : obstacles (jugement au passage, chute des barres, refus), déroulé d'épreuve (cloche, départ, arrivée, éliminations, textes FR / EN), temps et pénalités | **identiques au JS (oracles)** : jugement des barres au passage, décision et pénalité de refus, ordre des fautes, cloche, départ et départ lancé, arrivée, élimination à la descente, temps accordé, pénalités de temps, temps limite ; **partiels** : chute des barres (remise en piste sans oracle), refus unique (recomptage après détour non exercé), contacts des membres (non portés), effleurement (son absent), affichage de l'élimination, entrée en piste, habillage des obstacles (forme et position en montage côte à côte, couleur du mur différente) ; présentation, bilan et classement simulé **absents** (T10, T11) |
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
| Audio | à faire (T12 pour l'épreuve) ; traductions FR / EN des textes de l'épreuve **portées** (strings_cso.json), le reste à faire |
| Interface tactile UMG | en épreuve : joystick flottant du web, SAUT et pause (joysticks du moteur retirés) ; hors épreuve : boutons du portage (monter, allures, sauvegarde, chargement) ; compilée pour iOS le 18/11 seulement, test sur appareil réel requis |

## Distribution iOS

- Identité : `Equestrian Tour`, `com.strides.equestriantour`, version marketing `1.0.0`, iOS 16 minimum.
- Archive arm64 non signée validée avec les données cuites du jeu, les icônes et le manifeste de confidentialité.
- Procédure, état vérifié et blocages Apple : [`docs/testflight.md`](docs/testflight.md).

## Prochaine tranche
Tranche a (parcours CSO du Pôle), sous-tranches T10 à T12 de `docs/parite/cso-ecarts.md` §4 (T9, aides à l'appel, livrée
le 20/11/2026) : entrée dans l'épreuve (poteau « Chrono », présentation, plan), arrivée et
bilan (classement simulé, recommencer, record), sons et recette complète. État prouvé, partiel et absent de la tranche :
`docs/relais-mac.md` (« Parité de la tranche a ») et `docs/PARITE.md`.
