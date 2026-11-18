# Equestrian Tour — portage natif Unreal Engine 5 (iPhone/iPad en priorité)

Branche `claude/unreal-port`. Le jeu web (`src/`, `public/`) reste intact : c'est la référence de comportement.

| Dossier | Contenu |
|---|---|
| `StridesGrandTour/StridesGrandTour.uproject` | projet Unreal (UE 5.8, à confirmer avec la chaîne Apple), cibles iOS et Mac |
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
| Conduite de concours (cadence, virages) | **portée, identique** ; branchée sur le cheval (non compilé) |
| Parcours du Pôle, temps accordé, fautes, refus, éliminations, classement | **portés, testés** ; branchés (non compilé) |
| Sauvegarde | **schéma natif v1 + import de l'export web, testés** ; emplacement Unreal (non compilé) |
| Déplacement à pied, monter, descendre | code écrit (formes provisoires, transition 0,8 s), non compilé |
| Cheval PJL (modèle, 17 clips), cavalier réaliste (visages, mains, posture) | relais d'import ; animation à porter |
| Monde (Deauville, Pôle, Paris, écuries, maison, boutiques), météo, jour/nuit | à faire |
| Missions, histoire, téléphone Strides, progression, réputation, compétences, énergie | à faire (logique pure, portable) |
| Véhicules, transport du cheval, carburant | à faire |
| PNJ, foule, cavaliers PNJ | à faire |
| Audio, traductions FR/EN | à faire (export) |
| Interface tactile UMG | à faire (joystick virtuel du moteur en attendant) |

## Prochaine tranche
1. Sur Mac : compiler, corriger, jouer la boucle (relais §3-5), importer le cheval PJL et la cavalière (§6).
2. Animation : Animation Blueprint du cheval (choix des clips selon allure, virage, saut — logique de `pjlHorse.js`)
   et posture du cavalier (selle, mains, étriers — `human/anim.js`).
3. Puis : interface UMG (HUD, téléphone), monde du Pôle et de l'Écurie du Val, missions et progression.
