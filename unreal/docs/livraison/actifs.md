# Actifs du portage Unreal : définitifs, provisoires, non faits

Écrit le 27/11/2026 (jalon J3, « Monde vivant de Deauville »), relu dans le code et les données du dépôt (pas dans les
README). « Définitif » = repris ou exporté du jeu web, gardé pour la version 1 ; « provisoire » = forme ou dessin de
remplacement, à remplacer avant une diffusion ; « non fait » = absent du portage, avec ce qu'il faudrait faire.
**Aucune fonction n'est rangée « hors version 1 » sans arbitrage de Julien** (correction du 27/11 au soir : la version
précédente de cette liste le faisait pour des lots que plan.md marque « non fait dans cette étape »).
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
| Missions de l'histoire (titres, catégories, paliers, lieux, paiements, réputation, prérequis) et paliers de réputation | `story.js`, `story2.js` (chapitre 1 : m1 à m3), `parisGP.js`, `config.js` `REPUTATION` | `Content/Data/story_missions.json` (`scripts/unreal/export-missions.mjs`, modules du web importés tels quels) | **corrigé le 27/11 après contrôle adverse** : jusque-là, `world_architecture.json` portait une liste écrite à la main le 17/11 (titres, sommes et prérequis inventés, ex. « Première mission » 90 € / 100 au lieu de « Deux écuries, une matinée » 90 € / 60) ; elle est retirée. Écarts restants assumés : pourboire de 5 étoiles non porté (choix n° 19), dotation de M3 non portée |
| Itinéraires des missions (positions et textes des étapes à position fixe), comptes à rebours et règles de résultat | étapes `steps()` de `story.js`, `story2.js` (fichier:ligne dans le script), `missions.js` (`r.timer`, `fail`, `timeoutText`) | `story_missions.json` `route` (`timer`, `stopTimer`, `maxPenalties`, `beat`) | 13 missions sur 16 : tuto, m1 (option Val), m2 (option seul·e), m3, groom, transport, **livraison (105 s), fugueur (130 s), plage (95 s), fer, pension, csi3 (8 pénalités au plus), gp (battre Van Dijk)** (2e correction du 27/11). Restent réduites à « rejoindre le lieu » : **cross, derby, gpparis** (épreuves cross, course et Paris non portées : arbitrage demandé à Julien) |
| Heure du jeu, météo, marées, soleil | `weather.js`, `sun.js`, `game.js:1448` | `StridesCore/WorldClock` (`export-meteo.mjs`, oracle du web, ctest « meteo » : écarts < 1e-12) | J3-C, 27/11 au soir |
| Fers d'or (20 positions et règles) | `collectibles.js`, `game.js` getBlips | `Content/Data/world_horseshoes.json` (`export-fers.mjs`), `StridesCore/Collectibles` | J3-D, 27/11 au soir |

## Provisoires (à remplacer)

| Actif | Aujourd'hui | Ce que fait le web | Pour le remplacer |
|---|---|---|---|
| Voitures garées (14 : tracteur et Duster du Val, 12 places de la ville) | blocs aux gabarits et teintes du web, posés à la place et au cap du web (`world_parked.json`, `export-voitures-garees.mjs`), **infranchissables** (collision `vehicle.js` : boîte W/2 + 0,12 × L/2 + 0,1) ; tracteur en blocs plus hauts (forme provisoire) | `vehicle.js` : voitures conduisibles, tracteur `tractorGeo` | modèles exportés comme pour la circulation ; la conduite reste à faire (J3, voir « Non faits ») |
| Voitures de la circulation | blocs aux gabarits et teintes du web (caisse, habitacle, 4 roues qui tournent) | modèles extrudés de `props.js` (`carGeo`), phares, feux stop, faisceaux la nuit (`TrafficFx`) | exporter `carGeo` en glTF par modèle (5) comme l'architecture ; feux avec J3-C (nuit) |
| Passants, palefreniers, spectateurs | jambes, buste, tête, cheveux ou casquette en formes simples, couleurs de la tenue du web ; sans animation | `humanModel.js` (modèle procédural animé, marche, applaudissements des spectateurs `cheer`) | modèle humain animé (le corps de la cavalière n'a pas de clip de marche à pied) |
| Balise du GPS et de la mission | colonne orange de 18 m qui tourne | faisceau lumineux additif + anneau au sol (`gps.js`) | matériau additif et anneau |
| Balise du chrono du Pôle | colonne claire de 30 m | même faisceau que le GPS | idem |
| Téléphone | dessiné par le HUD (cartes, textes, sélection), sans icônes ni logo | DOM du web (`phone.js`, icônes, logo Strides, horloge, météo) | interface UMG avec les icônes du web (`Content/Data/ui` en a déjà une partie) |
| Mini-carte | zones du monde en aplats, routes en traits, repères carrés | image de carte dessinée (`buildMapImage` : prés, bâtiments, chemins, mer), pictogrammes (`drawBlip`) | exporter l'image de carte du web en texture |
| Carte plein écran | aplats et routes, nord en haut, centrée sur le joueur, sans geste | `drawFullMap` avec zoom, déplacement, repère posé au doigt | choix n° 16 de plan.md |
| Lumière du jour et de la nuit | soleil du web (direction exacte), intensités, couleur, lune, lumière du ciel, exposition et brouillard **réglés par le portage** ; pas de nuages, d'étoiles, de pluie ni de lampadaires | `sky.js` (ciel, nuages, étoiles, éclairage), `rain.js`, lampadaires et phares la nuit | porter `sky.js` (courbes d'éclairage) et `rain.js` ; à confirmer à l'œil par Julien |
| Fers d'or | disque doré qui tourne (cylindre), sans halo | tore doré `TorusGeometry` + halo additif (`horseshoeSpriteTexture`) | maillage de tore et halo |
| Repère « Cheval » de la mini-carte | carré beige | pastille ronde `#c8a46a` (`minimap.js`) | pictogrammes de la mini-carte (avec les autres repères) |

## Non faits (prévus au plan, à faire ou à arbitrer par Julien)

Colonne « Statut » : **J3 à faire** = demandé par la consigne de J3, non livré ; **jalon Jx** = prévu par plan.md à ce jalon ;
**à arbitrer** = rien ne le prévoit, décision de Julien attendue. Aucun de ces lots n'est « hors V1 » sans son accord.

| Fonction du web | Fichiers | Statut et raison | Effet pour le joueur |
|---|---|---|---|
| Véhicules conduits (voitures, camion de l'écurie, transport des chevaux) | `vehicle.js`, `transport.js`, `vanLoading.js`, `fuel.js` | **J3 à faire** (consigne : « véhicules pilotables prévus par le jeu web ») ; grosse brique (conduite, embarquement, carburant) | aucune conduite ; « Transport express » et m3 faits à cheval |
| Chevaux d'ambiance (paddocks, boxes) et cavaliers d'entraînement (paddock du Pôle, plage, hippodrome, carrière du Val) | `npcs.js` `GrazeAI`, `PathAI`, `rider` | **J3 à faire** ; un second `AStridesHorse` fausserait les recherches « le cheval du joueur » du portage ; à faire avec une classe de cheval d'ambiance légère | paddocks vides |
| Discussions avec les passants (`chatter`) | `npcs.js nearestTalker`, `data.js CHATTER` | **J3 à faire** (interactions contextuelles) | les passants s'arrêtent et se tournent vers le joueur (règle du web), sans réplique |
| Intérieurs et boutiques (sellerie, clinique, café, boutique Strides), achats | `shops.js`, `shopInteriors.js`, `storeInterior.js`, `commerce.js` | **J3 à faire** (J3-D) | lieux visibles sur la carte, sans entrée ; « Selle sur-mesure » se retire devant la porte |
| Pluie visible, nuages, étoiles, éclairage nocturne (lampadaires, phares), estran mouillé et laisse de mer | `sky.js`, `rain.js`, `TrafficFx`, `weather.js` (`tdWet`, `tdMark`) | **J3 à faire** (J3-C : heure, soleil, météo et marée faits le 27/11 au soir, voir Définitifs) | le temps « Averses » s'affiche, sans pluie à l'écran |
| Épreuves des missions cross, derby, Grand Prix de Paris | `courses.js` (`xc`), `raceSteps`, `parisGP.js`, `paris.js` | **à arbitrer** (voir plan.md, décision demandée) | ces 3 missions paient encore à l'arrivée au lieu |
| Actions des missions (dialogues, préparation au box, chevaux de mission, choix, camion, dotation, note et pourboire) ; jobs ponctuels (`generateJob`) | `missions.js makeSteps`, `story.js`, `story2.js`, `jobs.js` | **jalon J4-C** | itinéraire des étapes à position fixe (voir plus haut) ; choix figés (m1 : Val ; m2 : seul·e) ; trajets du camion faits à cheval ; payée à la dernière étape |
| Apps Messages, Mes chevaux, Mon écurie, Guide local, Classements, Trophées, Météo, Photo, Réglages | `phone.js` | **jalon J4-B** | écran « pas encore portée » |
| Paris (finale) | `paris.js`, `parisGP.js` | **à arbitrer** | la finale part du Pôle |
| Oiseaux, bateaux, particules, traces de sabots | `birds.js`, `boats.js`, `particles.js`, `hoofprints.js` | **jalon J5** | — |
