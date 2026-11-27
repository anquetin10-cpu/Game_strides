# Actifs du portage Unreal : définitifs, provisoires, hors version 1

Écrit le 27/11/2026 (jalon J3, « Monde vivant de Deauville »), relu dans le code et les données du dépôt (pas dans les
README). « Définitif » = repris ou exporté du jeu web, gardé pour la version 1 ; « provisoire » = forme ou dessin de
remplacement, à remplacer avant une diffusion ; « hors V1 » = absent du portage, avec ce qu'il faudrait faire.
Le jeu web (`src/`, `public/`) reste la source de vérité.

## Définitifs (repris ou exportés du web)

| Actif | Source web | Dans Unreal | Remarque |
|---|---|---|---|
| Relief, routes, mer, architecture, haies, arbres de Deauville (1 200 × 1 200 m) | `src/world/*` | `Content/Data/World`, `Content/World/Meshes`, `StridesScenery` | export du monde (J0), matériaux photo |
| Carrière, obstacles, lice, tribunes du Pôle ; paddock d'échauffement | `courses.js`, `obstacles.js`, `world.js` | `Content/World/Cso`, `cso_course_pole.json` | prouvés en J1-J2 |
| Cheval WildMesh, robes, sellerie | `pjlHorse.js`, `horse/*` | `Content/Characters/Horse` | prouvés en J2 |
| Cavalière du joueur | `human.js` (règles de monte) | `Content/Characters/Riders/Female` | |
| Sons du concours | `audio.js` (rendus) | `Content/Audio/Cso` | |
| Données de la vie ambiante : routes complètes (14), îlots de la ville, 7 voitures (route, abscisse, sens, allure, modèle, teinte), 24 passants (boucle, vitesse, tenue), 8 spectateurs | `npcs.js` `Ambient.spawn`, `layout.js` `ROADS`, `sites.js` `TOWN_BLOCKS`, `props.js` `CARS`/`CAR_COLORS`, `outfits.js` | `Content/Data/world_ambient.json` (`scripts/unreal/export-monde-vivant.mjs`) | J3 ; relevé dans le jeu web en cours d'exécution |
| Règles de circulation, de marche des passants, de la mini-carte | `npcs.js` `Car`, `WalkAI`, `_separateWalkers` ; `minimap.js` `draw` | `StridesCore/WorldLife`, `StridesCore/Minimap` | J3 ; écart à l'oracle < 1e-6 m (ctest « monde-vivant ») |
| Missions de l'histoire (titres, lieux, paiements, prérequis) | `story.js` | `world_architecture.json` `missions` | données ; déroulé par étapes : voir hors V1 |

## Provisoires (à remplacer)

| Actif | Aujourd'hui | Ce que fait le web | Pour le remplacer |
|---|---|---|---|
| Voitures de la circulation | blocs aux gabarits et teintes du web (caisse, habitacle, 4 roues qui tournent) | modèles extrudés de `props.js` (`carGeo`), phares, feux stop, faisceaux la nuit (`TrafficFx`) | exporter `carGeo` en glTF par modèle (5) comme l'architecture ; feux avec J3-C (nuit) |
| Passants, palefreniers, spectateurs | jambes, buste, tête, cheveux ou casquette en formes simples, couleurs de la tenue du web ; sans animation | `humanModel.js` (modèle procédural animé, marche, applaudissements des spectateurs `cheer`) | modèle humain animé (le corps de la cavalière n'a pas de clip de marche à pied) |
| Balise du GPS et de la mission | colonne orange de 18 m qui tourne | faisceau lumineux additif + anneau au sol (`gps.js`) | matériau additif et anneau |
| Balise du chrono du Pôle | colonne claire de 30 m | même faisceau que le GPS | idem |
| Téléphone | dessiné par le HUD (cartes, textes, sélection), sans icônes ni logo | DOM du web (`phone.js`, icônes, logo Strides, horloge, météo) | interface UMG avec les icônes du web (`Content/Data/ui` en a déjà une partie) |
| Mini-carte | zones du monde en aplats, routes en traits, repères carrés | image de carte dessinée (`buildMapImage` : prés, bâtiments, chemins, mer), pictogrammes (`drawBlip`) | exporter l'image de carte du web en texture |
| Carte plein écran | aplats et routes, nord en haut, centrée sur le joueur, sans geste | `drawFullMap` avec zoom, déplacement, repère posé au doigt | choix n° 16 de plan.md |

## Hors version 1 (absents du portage)

| Fonction du web | Fichiers | Pourquoi | Effet pour le joueur |
|---|---|---|---|
| Véhicules conduits (voitures, camion de l'écurie, transport des chevaux) | `vehicle.js`, `transport.js`, `vanLoading.js`, `fuel.js` | grosse brique (conduite, embarquement, carburant) ; le GPS par la route (`gps.js roadRoute`) n'en a besoin qu'au volant | aucune conduite ; missions « Transport express » jouées comme une mission de lieu |
| Voitures garées | `world.js parkedVehicles` | pas d'actif de voiture définitif | rues sans voitures garées |
| Chevaux d'ambiance (paddocks, boxes) et cavaliers d'entraînement (paddock du Pôle, plage, hippodrome, carrière du Val) | `npcs.js` `GrazeAI`, `PathAI`, `rider` | un second `AStridesHorse` fausserait les recherches « le cheval du joueur » du portage ; à faire avec une classe de cheval d'ambiance légère | paddocks vides |
| Discussions avec les passants (`chatter`) | `npcs.js nearestTalker`, `data.js CHATTER` | interaction à porter avec la bulle d'action | les passants s'arrêtent et se tournent vers le joueur (règle du web), sans réplique |
| Intérieurs et boutiques (sellerie, clinique, café, boutique Strides), achats | `shops.js`, `shopInteriors.js`, `storeInterior.js`, `commerce.js` | J3-D non fait dans cette étape | lieux visibles sur la carte, sans entrée |
| Fers d'or à collectionner | `collectibles.js` | J3-D | — |
| Jour et nuit, météo, marées, pluie | `weather.js`, `sky.js`, `rain.js`, `game.js:824` | J3-C non fait dans cette étape | soleil fixe |
| Déroulé par étapes des missions (dialogues, actions sur place, chevaux de mission, choix) | `missions.js makeSteps`, `story.js`, `jobs.js` | jalon J4-C | une mission = rejoindre son lieu (18 m), payée à l'arrivée |
| Apps Messages, Mes chevaux, Mon écurie, Guide local, Classements, Trophées, Météo, Photo, Réglages | `phone.js` | jalon J4-B | écran « pas encore portée » |
| Paris (finale) | `paris.js`, `parisGP.js` | hors périmètre actuel | la finale part du Pôle |
| Oiseaux, bateaux, particules, traces de sabots | `birds.js`, `boats.js`, `particles.js`, `hoofprints.js` | finition (J5) | — |
