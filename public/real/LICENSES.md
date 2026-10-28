# Modèles réalistes (prototype)

| Fichier | Contenu | Licence | Source |
| --- | --- | --- | --- |
| `rider_f.glb` | Cavalière : corps, peau, yeux, cils, sourcils, cheveux (queue de cheval), chemise, pantalon, chaussures | CC0-1.0 | [kblood/CharacterCreator](https://github.com/kblood/CharacterCreator/tree/852e48f316b90a0937234886630e4fb4cdfd1f78/output), commit `852e48f` |
| `rider_m.glb` | Cavalier : mêmes éléments, cheveux courts | CC0-1.0 | idem |

Les fichiers source de CharacterCreator sont générés à partir des ressources de [MakeHuman](http://www.makehumancommunity.org/)
(modèle de base, cibles de morphologie, peaux, yeux, cheveux, vêtements, squelette « game_engine »), publiées sous CC0.
Aucune attribution n'est exigée ; elle est donnée ici par courtoisie.

Les fichiers sont produits par `node scripts/real/build-humans.mjs` (téléchargement à un commit figé, fusion,
morphologie, squelette recalé, compression meshopt).
