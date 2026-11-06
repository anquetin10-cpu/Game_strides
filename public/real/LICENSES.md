# Modèles réalistes (prototype)

## Personnages

| Fichier | Contenu | Licence | Source |
| --- | --- | --- | --- |
| `rider_f.glb` | Cavalière : corps, peau, yeux, cils, sourcils, cheveux (queue de cheval), chemise, pantalon, chaussures | CC0-1.0 | [kblood/CharacterCreator](https://github.com/kblood/CharacterCreator/tree/852e48f316b90a0937234886630e4fb4cdfd1f78/output), commit `852e48f` |
| `rider_m.glb` | Cavalier : mêmes éléments, cheveux courts | CC0-1.0 | idem |

Les fichiers source de CharacterCreator sont générés à partir des ressources de [MakeHuman](http://www.makehumancommunity.org/)
(modèle de base, cibles de morphologie, peaux, yeux, cheveux, vêtements, squelette « game_engine »), publiées sous CC0.
Aucune attribution n'est exigée ; elle est donnée ici par courtoisie.

Les fichiers sont produits par `node scripts/real/build-humans.mjs` (téléchargement à un commit figé, fusion,
morphologie, squelette recalé, compression meshopt).

## Cheval à l'essai « Tripo »

| Fichier | Contenu | Licence | Source |
| --- | --- | --- | --- |
| `horse_tripo.glb` | Cheval « Tripo » (deuxième cheval de l'écurie, à l'essai) : corps et crins en un maillage skinné à deux niveaux de détail (environ 30 000 et 8 000 triangles), squelette du cheval du jeu (50 os), textures couleur, normales et rugosité ; filet et rênes (affichés quand il est monté) | **Conditions d'utilisation à confirmer** | Modèle généré avec [Tripo AI](https://www.tripo3d.ai/), fourni par le propriétaire du projet (`assets-src/horse-tripo/`, versions optimisées « HD », « Qualité » et « Mobile ») |

Droits : le modèle a été généré avec Tripo AI et fourni par le propriétaire du projet ; les conditions d'utilisation
et de redistribution qui s'appliquent (offre du compte Tripo utilisé à la génération, attribution éventuelle) restent
à confirmer par lui avant toute publication. Modifications par Equestrian Tour : source « Qualité » calée en mètres
dans le repère du jeu, tête redressée, faces et normales incohérentes corrigées, tapis et quartiers de selle peints et
modelés retirés (texture et relief), points sombres nettoyés, squelette du cheval du jeu ajouté avec poids de peau
calculés, polygones réduits en deux niveaux de détail, textures converties en WebP, maillages compressés ; filet
(bridon à muserolle française) et rênes ajoutés, modélisés par le projet et ajustés à sa tête
(`scripts/real/tripo/bridle.mjs`, appelé par la construction). Le crédit est
affiché dans le jeu (téléphone → Réglages, sous « Modèles 3D »). Fichier produit par
`node scripts/real/build-tripo-horse.mjs` (environ 45 s ; rapport dans `trial/horse_tripo.json`).

## Cheval WildMesh (repris de Jumping League Sim)

| Fichier | Contenu | Licence | Source |
| --- | --- | --- | --- |
| `horse_pjl.glb` (6,4 Mo) | Cheval réaliste riggé (419 os), 17 animations (pas, trot, galop, grand galop, virages à 90°, sauts au galop et au grand galop, arrêt glissé, repos) | **CC BY 4.0** (preuve : métadonnées `asset.extras` écrites par l'exportateur Sketchfab, conservées dans le fichier) | « [Realistic Animated Horse](https://sketchfab.com/3d-models/realistic-animated-horse-75ca409fb4da47c9ae4725046e9bfa1e) » par **WildMesh 3D** ([sketchfab.com/WildMesh_3D](https://sketchfab.com/WildMesh_3D)) |

Fichier copié tel quel (octet pour octet, SHA-256 `06d8cb42e983f551b492a70e760fd19fce9f29d1c07e01faa1a6097dd406e714`) depuis le jeu
Jumping League Sim du même propriétaire (dépôt `anquetin10-cpu/PGL_Game-`, branche `claude/pjl-jumping-game`, commit
`afa56f9c84ab0cfbac47e77b8f0b38f17c7e5999`, `public/assets/models/horse.glb`), avec le code qui le prépare et l'anime
(`src/entities/pjl/`, converti de TypeScript). Modifications faites par Jumping League Sim (documentées dans son
`docs/ASSETS.md`) : sellerie western d'origine retirée, matériaux convertis en metal-rough, animations triées et
rééchantillonnées, textures WebP, géométrie quantifiée. Modifications au chargement (code repris) : mouvement de la racine
retiré des clips, clips à main gauche construits en miroir (longueurs d'os conservées), robes paramétriques par shader,
sellerie anglaise (tapis, selle, sangle, filet, mors, guêtres, bonnet) générée sur la surface du cheval. Ajouts
d'Equestrian Tour : étrivières, étriers et rênes dessinés par le jeu, calage des clips sur les allures du jeu.

Texte d'attribution (affiché dans le jeu : téléphone → Réglages, sous « Modèles 3D ») :

> Chevaux : « Realistic Animated Horse » par WildMesh 3D (sketchfab.com/WildMesh_3D), CC BY 4.0
> (https://creativecommons.org/licenses/by/4.0/) ; modifié : sellerie d'origine retirée, robes paramétriques,
> compression, sélection et miroir des animations, sellerie anglaise ajoutée.

Point d'attention relevé par Jumping League Sim : l'auteur a depuis republié le modèle (« 2.0 ») et présente la
version gratuite comme « personal use only ». La copie utilisée a été reçue sous CC BY 4.0 (licence irrévocable pour
cette copie, attribution ci-dessus). Pour une diffusion commerciale sans ambiguïté, une licence commerciale de
WildMesh 3D reste à décider par le propriétaire du projet ; **rien n'a été acheté**.

## Voitures

| Fichier | Modèle d'origine | Auteur | Licence |
| --- | --- | --- | --- |
| `car_defender.glb` | « [Land Rover Defender Grasmere](https://sketchfab.com/3d-models/land-rover-defender-edition-grasmere-green-b7596dc0abc749c3b076d1f830715a54) » | PROJECT CAR90 / Samuel Carvalho | CC BY 4.0 |
| `car_punto.glb` | « [Fiat Punto GT 1995](https://sketchfab.com/3d-models/free-1995-fiat-punto-gt-48db6facb4b64e99b60f36b8c01185e1) » | Karol Miklas | CC BY 4.0 |
| `car_sclass.glb` | « [2011 Mercedes-Benz S 65 AMG W221](https://sketchfab.com/3d-models/2011-mercedes-benz-s-65-amg-w221-8ffa2d947cce478eb0a60cf1a230c592) » | supercarmodels | CC BY 4.0 |
| `car_ipace.glb` | « [Jaguar I-Pace](https://sketchfab.com/3d-models/jaguar-i-pace-296a97a6c07041cf9c48f8a303315ed2) » | GT Cars / Car2022 | CC BY 4.0 |

Versions préparées redistribuées par [TonPlaygramBot/TonPlaygramWebApp](https://github.com/TonPlaygramBot/TonPlaygramWebApp/blob/ee96cdbe3b1faae07cb58d7ecf42c4e9407d8039/webapp/public/assets/tirana-streets/vehicle-collection/ATTRIBUTION.md)
(commit `ee96cdb`). Licence : [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Modifications par Equestrian Tour : logos, lettrages et plaques retirés, intérieur ajouté par le redistributeur
retiré, modèle réorienté et recentré, roues découpées en objets séparés, pièces lourdes peu visibles simplifiées,
peinture rendue neutre (teinte appliquée par le jeu), textures converties en WebP, maillages compressés. Les noms des
modèles d'origine désignent des véhicules réels ; aucune marque n'est affichée dans le jeu. Fichiers produits par
`node scripts/real/build-cars.mjs`.
