# Equestrian Tour — portage natif Unreal Engine 5 (iPhone/iPad en priorité)

Branche `claude/unreal-port`. Le jeu web (`src/`, `public/`) reste intact : c'est la référence de comportement.

| Dossier | Contenu |
|---|---|
| `StridesGrandTour/StridesGrandTour.uproject` | projet Unreal UE 5.8.4, cibles iOS et Mac |
| `StridesGrandTour/Config/` | rendu mobile (sans Lumen, Nanite ni ombres virtuelles), iOS paysage, Enhanced Input |
| `StridesGrandTour/Source/StridesCore/` | **cœur C++17 sans type Unreal** : saut, conduite CSO, parcours et jugement, sauvegarde native |
| `StridesGrandTour/Source/StridesGrandTour/` | module de jeu : cheval, cavalier, obstacles, parcours, données, sauvegarde, commandes, HUD, tests d'automatisation |
| `StridesGrandTour/Content/Data/` | données versionnées exportées du jeu web (JSON, unités SI) |
| `core/` | compilation et tests du cœur hors moteur (CMake), oracles exportés du jeu web |
| `docs/MATRICE.md` | matrice de migration module par module |
| `docs/conventions.md` | unités, axes, caps, modèles importés |
| `docs/relais-mac.md` | compiler, ouvrir, jouer, importer, construire pour iOS — et ce qui n'est pas vérifié |
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
| Règles du saut (appel, marges, causes, qualité) | **portées, identiques au JS (oracles)** |
| Conduite de concours (cadence, virages) | **portée, compilée et jouée** ; allure affichée jusqu'au galop à 8,0 m/s |
| Parcours du Pôle, temps accordé, fautes, refus, éliminations, classement | **portés, testés et branchés** ; parcours complet à valider visuellement |
| Sauvegarde | **schéma natif v1 + import de l'export web, testés** ; sauvegarde/rechargement vérifiés à l'écran |
| Déplacement à pied, monter, descendre | **compilé et vérifié à l'écran**, transition 0,8 s |
| Cheval PJL (modèle, 17 clips), cavalier réaliste (visages, mains, posture) | **importés et positionnés** ; 17 animations cheval normalisées, allures/sauts branchés ; cavalier ancré sur le point de selle animé, animation squelettique à finir |
| Monde (Deauville, Pôle, écuries, maison, ville, plage, bocage, forêts) | **exporté du jeu web et rhabillé en matériaux photo**, relief à collisions, cheval sur le relief : [`docs/decors.md`](docs/decors.md) ; Paris, intérieurs, météo, jour/nuit à faire |
| Missions, histoire, téléphone Strides, progression, réputation, compétences, énergie | à faire (logique pure, portable) |
| Véhicules, transport du cheval, carburant | à faire |
| PNJ, foule, cavaliers PNJ | à faire |
| Audio, traductions FR/EN | à faire (export) |
| Interface tactile UMG | **portée et compilée pour iOS** : joystick moteur, saut, monter/descendre, allures, sauvegarde et chargement ; test sur appareil réel requis |

## Distribution iOS

- Identité : `Equestrian Tour`, `com.strides.equestriantour`, version marketing `1.0.0`, iOS 16 minimum.
- Archive arm64 non signée validée avec les données cuites du jeu, les icônes et le manifeste de confidentialité.
- Procédure, état vérifié et blocages Apple : [`docs/testflight.md`](docs/testflight.md).

## Prochaine tranche
1. Sur Mac : approfondir la revue visuelle de la posture de la cavalière au galop et au saut.
2. Animation : finaliser l'Animation Blueprint du cheval (virages et transitions — logique de `pjlHorse.js`)
   et l'animation squelettique du cavalier (mains, étriers — `human/anim.js`).
3. Puis : HUD et téléphone UMG, monde du Pôle et de l'Écurie du Val, missions et progression.
