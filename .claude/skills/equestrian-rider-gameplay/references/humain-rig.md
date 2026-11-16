# Humain, tenue et squelette

Ces critères sont des propositions de conception pour le jeu, pas des normes anatomiques chiffrées.

- Échelle : confronter la stature du modèle à la selle et au cheval avec une référence connue ; contrôler les transformations après import.
- Silhouette : tête, cou, épaules, bassin, bras et jambes crédibles dans le style du jeu ; ne pas imposer des proportions génériques à tous les personnages.
- Tenue : casque, veste, pantalon, gants, bottes selon le personnage ; vérifier déformations et traversées aux hanches, genoux, épaules et coudes. Aucune certification réelle des équipements n'est impliquée.
- Maillage : boucles suffisantes aux articulations, absence d'influences osseuses aberrantes ; ne pas compter sur le nombre de polygones pour corriger une mauvaise topologie.
- Rig : pose de repos documentée, hiérarchie/axes connus, poids testés en position assise, jambes fléchies et bras tendus. Vérifier gauche/droite, twists et normales.
- Export : contrôler skin, bind pose, unités, matériaux, textures et clips après réimport puis dans le moteur cible. FBX/GLB ne sont pas interchangeables sans validation.
- Mobile : mesurer triangles, draw calls, textures, os influents et temps de frame dans une scène représentative. Ne pas dégrader l'articulation sans comparer le rendu.
- MPFB : option gratuite pour générer un humain dans Blender. Vérifier version Blender/MPFB, rig exportable et licence propre à chaque vêtement, texture et asset ; la licence du logiciel ne règle pas les droits de tous les contenus.
