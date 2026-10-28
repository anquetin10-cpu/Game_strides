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

## Cheval

| Fichier | Contenu | Licence | Source |
| --- | --- | --- | --- |
| `horse.glb` | Cheval : corps, crins, cornées, fers, selle, filet, squelette de 99 os | CC BY 4.0 | « [Horse](https://sketchfab.com/3d-models/horse-a6f860e43e364619bccb174a1ac7d0c9) » de **Henry S** (henry_7, Sketchfab), version redistribuée par [miskibin/warbell](https://github.com/miskibin/warbell/blob/1c73afb4a5fd03744d3bf62483dae45a7bd7f0da/assets/CREDITS.md), commit `1c73afb` |

Licence : [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Modifications par
STRIDES Grand Tour : animations d'origine retirées, robe pie rendue neutre (détail du poil seul, couleur appliquée par
le jeu), zones de robe ajoutées par sommet, textures converties en WebP et redimensionnées, maillages compressés.
Le crédit est affiché dans le jeu (téléphone → Réglages, sous « Modèles 3D »). Fichier produit par
`node scripts/real/build-horse.mjs`.

## Voitures

| Fichier | Modèle d'origine | Auteur | Licence |
| --- | --- | --- | --- |
| `car_defender.glb` | « [Land Rover Defender Grasmere](https://sketchfab.com/3d-models/land-rover-defender-edition-grasmere-green-b7596dc0abc749c3b076d1f830715a54) » | PROJECT CAR90 / Samuel Carvalho | CC BY 4.0 |
| `car_punto.glb` | « [Fiat Punto GT 1995](https://sketchfab.com/3d-models/free-1995-fiat-punto-gt-48db6facb4b64e99b60f36b8c01185e1) » | Karol Miklas | CC BY 4.0 |

Versions préparées redistribuées par [TonPlaygramBot/TonPlaygramWebApp](https://github.com/TonPlaygramBot/TonPlaygramWebApp/blob/ee96cdbe3b1faae07cb58d7ecf42c4e9407d8039/webapp/public/assets/tirana-streets/vehicle-collection/ATTRIBUTION.md)
(commit `ee96cdb`). Licence : [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Modifications par STRIDES Grand Tour : logos, lettrages et plaques retirés, intérieur ajouté par le redistributeur
retiré, modèle réorienté et recentré, roues découpées en objets séparés, pièces lourdes peu visibles simplifiées,
peinture rendue neutre (teinte appliquée par le jeu), textures converties en WebP, maillages compressés. Les noms des
modèles d'origine désignent des véhicules réels ; aucune marque n'est affichée dans le jeu. Fichiers produits par
`node scripts/real/build-cars.mjs`.
