# Portage natif Unreal — matrice de migration (17/11/2026)

Base : `claude/gt-humains-v3` @ `c7268de`, qui contient la production `84dee94` (`claude/strides-grand-tour`) et toutes
les branches de travail existantes (socle, cheval PJL, interface iPhone, cavalier, humains v1/v2/v3). Branche de
migration : `claude/unreal-port`. Le jeu web reste intact (`src/`, `public/`, `tests/`) : c'est la **référence de
comportement**.

**Mesure** (script dans le commit, fichier par fichier de `src/`) : 52 897 lignes de JS ; 11 743 lignes sans Three.js ni
API du navigateur (règles, données, missions, traductions) ; 35 219 lignes dépendantes de Three.js (rendu, scènes,
modèles procéduraux) ; 5 935 lignes dépendantes du DOM ou du navigateur (interface, entrées, stockage).

Légende : **Conserver** (fichier repris tel quel) · **Exporter** (données / ressources converties par un script) ·
**Porter** (algorithme réécrit en C++, le JS sert de spécification et d'oracle) · **Remplacer** (système Unreal équivalent).

## 1. Règles et données (indépendantes du rendu)

| Module | Lignes | Décision | Raison / preuve | État |
|---|---|---|---|---|
| `gameplay/jumpModel.js` (saut, appel, marges, causes) | 152 | Porter | cœur du CSO, pur | **Porté** (`StridesCore/JumpModel`) ; 576 cas d'oracle identiques au JS |
| `gameplay/csoRide.js` (conduite de concours) | 97 | Porter | pur | **Porté** (`CsoRide`) ; 72 cas identiques |
| `gameplay/csoCourse.js` (tracé du Pôle) | 96 | Porter + Exporter | pur ; tracé en données | **Porté** (`CsoCourse`) ; tracé, obstacles, longueur identiques (1e-7 m) ; `cso_course_pole.json` |
| `gameplay/courses.js` (jugement : fautes, refus, éliminations, temps) | 823 | Porter (règles) / Remplacer (affichage) | règles mêlées au HUD et aux sons | **Règles portées** (`CourseJudge`), scénarios testés ; affichage : HUD provisoire |
| `gameplay/challenge.js` (pénalités de temps, classement, défis) | 284 | Porter | pur | pénalités et classement **portés** ; défis rejouables : à faire |
| `config.js` (allures, endurance, saut) | 62 | Exporter | données | **Exporté** (`horse_gaits.json`) |
| `gameplay/data.js` (chevaux, boutique, cafés, compétences) | 184 | Exporter | données | chevaux **exportés** (`horse_profiles.json`) ; boutique, cafés : à faire |
| `gameplay/obstacles.js` (barres, chute, contacts) | 707 | Porter (géométrie des barres, jugement) / Remplacer (maillages) | barres reprises (`AStridesFence`) | barres et repère **portés** ; chute animée des barres, contact des membres (`limbContact.js`) : à faire |
| `gameplay/courseAids.js`, `courseLint.js` | 599 | Porter | aides d'appel, règles de tracé (tests) | à faire |
| `gameplay/missions.js`, `story.js`, `story2.js`, `jobs.js`, `travel.js`, `stabling.js`, `commerce.js`, `fuel.js`, `ranking.js`, `parisCourse.js`, `parisGP.js` | ≈ 3 600 | Porter (logique) + Exporter (textes, données) | missions et progression : purs | à faire (tranche « missions et progression ») |
| `gameplay/energy.js`, `condition.js` | 578 | Porter | rythme de vie, état du cheval | à faire |
| `core/save.js` (version 2, migrations, secours) | 284 | Porter (schéma) | stockage web non transférable | **Schéma natif v1** (`SaveGame`) + import de l'export web ; secours et migrations natives : à faire |
| `core/math.js`, `noise.js` | 169 | Porter | utilitaires | `MathUtil.h` (clamp, smoothstep) |
| `i18n/` (FR, EN) | ≈ 2 260 | Exporter | textes | à faire (vers les tables de chaînes Unreal) |
| `partners/` (campagnes, livrées) | 333 | Exporter | données | à faire |
| `world/sites.js`, `layout.js`, `colliders.js`, `fields.js` | ≈ 700 | Exporter | plan du monde (positions, zones) | carrière du Pôle seulement ; le reste : tranche « monde » |

## 2. Rendu, scènes, modèles (dépendants de Three.js)

| Module | Décision | Raison | État |
|---|---|---|---|
| `game.js` (boucle, scène, chargement) | Remplacer | GameMode, GameInstance, sous-systèmes Unreal | GameMode de la première boucle (scène construite par code) |
| `entities/camera.js` | Remplacer | SpringArm + Camera | caméra de suivi provisoire (cavalier, cheval) |
| `entities/horse.js`, `horse/anim.js`, `horse/*` (cheval procédural) | Remplacer (rendu) / Porter (simulation : vitesses, saut, endurance) | rendu remplacé par le cheval PJL importé | simulation de base **portée** (`AStridesHorse`) ; endurance, état, allures du monde ouvert complètes : à faire |
| `entities/pjlHorse.js`, `pjl/*` (cheval WildMesh, 17 clips) | Exporter (modèle, clips) / Porter (choix des clips, phases, saut calé, flanc pour le cavalier) | le cheval validé doit rester celui-là | relais : import du GLB, Animation Blueprint ; logique de phases : à porter |
| `entities/human.js`, `human/anim.js` (cavalier, à pied, en selle, IK) | Porter (posture, IK, pieds posés, montée/descente) → Animation Blueprint + Control Rig ou nœuds C++ | acquis du lot cavalier et humains v3 | à faire ; forme provisoire (capsule) |
| `entities/realistic.js` (modèles réalistes, visages, peau) | Exporter (GLB humains, formes) / Remplacer (shaders → matériaux Unreal) | MakeHuman CC0, chaîne Blender reproductible | relais : import de `rider_f/m.glb` |
| `entities/truck*.js`, `vehicle.js`, `defender*.js`, `horseVan.js` | Porter (physique de conduite) / Exporter (modèles) | Chaos Vehicles ou physique portée | tranche « véhicules et transport » |
| `world/*` (terrain, ciel, eau, végétation, bâtiments procéduraux) | Remplacer | terrain Unreal (Landscape mobile), matériaux, foliage ; générateurs procéduraux : à réévaluer cas par cas (export de maillages ou portage) | tranche « monde » |
| `world/world.js` (public assis…) | Porter (générateur de foule) ou Exporter (instances) | instanced static meshes | tranche « PNJ et foule » |

## 3. Interface, entrées, audio, stockage (dépendants du navigateur)

| Module | Décision | État |
|---|---|---|
| `ui/*` (HUD, téléphone Strides, écrans, minicarte) | Remplacer par UMG (safe areas, tailles tactiles) | HUD texte provisoire |
| `core/input.js` (clavier, tactile, manette) | Remplacer par Enhanced Input (+ commandes tactiles UMG) | Enhanced Input créé dans le code ; joystick virtuel du moteur |
| `core/audio.js` (Web Audio) | Remplacer (sons exportés + MetaSounds / SoundCues) | à faire |
| `core/online.js` (sauvegarde en ligne, classements) | Remplacer (service à confirmer) | à faire, rien de payant engagé |
| `core/crashGuard.js`, `devHooks.js`, `metrics.js` | Remplacer (outils Unreal, journaux) | — |

## 4. Ressources

| Ressource | Licence | Décision | État |
|---|---|---|---|
| `public/real/horse_pjl.glb` (cheval WildMesh, 419 os, 17 clips) | CC BY 4.0 (attribution WildMesh 3D) | Exporter (import glTF dans l'éditeur, vérification du squelette, de l'échelle et des clips) | relais |
| `public/real/rider_f.glb`, `rider_m.glb` (+ chaîne `scripts/humans/build-real-humans.sh`) | CC0 | Exporter | relais ; formes (visage, expressions) gardées par l'export glTF |
| `public/real/horse_tripo.glb` | **conditions à confirmer** | ne pas embarquer avant confirmation | — |
| `public/real/car_*.glb` | voir `LICENSES.md` | Exporter | tranche véhicules |
| Personnages procéduraux (`scripts/humans`, `src/entities/human/data`) | projet | à réévaluer : remplacés à distance par les modèles réalistes en LOD, ou exportés en glTF par un script | — |

## 5. Tests (oracles)
- Tests unitaires du jeu web (`tests/unit`, 297) : spécification ; les règles portées sont rejouées par
  `unreal/core/tests` (oracles exportés du JS, scénarios de jugement).
- Tests de bout en bout (`tests/e2e`) : scénarios de référence pour la recette des tranches (CSO, montée, saut,
  sauvegarde) ; à rejouer dans Unreal par des tests fonctionnels (Automation) quand la scène tournera.
