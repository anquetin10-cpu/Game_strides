# Equestrian Tour — Cheval issu du fichier Tripo, version optimisée

## Fichiers

- `Cheval_Tripo_Optimise_HD.glb` : 300 000 triangles, 179 905 sommets, textures 2K/1K/2K, environ 10,4 Mo. À privilégier comme source de travail et comparaison visuelle.
- `Cheval_Tripo_Optimise_Qualite.glb` : 100 000 triangles, 79 904 sommets, textures 2K/1K/2K, environ 4,8 Mo. Version intermédiaire.
- `Cheval_Tripo_Optimise_Mobile.glb` : environ 74 390 triangles, 67 099 sommets, textures 1K, environ 3,5 Mo. Version d'essai sur mobile.

## Consigne prête à envoyer

J'ai fourni trois versions allégées du même modèle de cheval Tripo pour Equestrian Tour.
Commence par importer `Cheval_Tripo_Optimise_Qualite.glb` dans une scène d'essai Three.js avec GLTFLoader. Ne remplace pas encore les chevaux existants. Compare sa robe, sa silhouette, ses marques, son éclairage et ses UV à la version HD. Mesure les performances et la mémoire sur iPhone lorsque l'appareil est disponible, puis choisis la version appropriée.

Ces fichiers sont des maillages statiques : ils ne contiennent PAS de squelette, de skinning ni d'animations de pas/trot/galop/saut. Prépare une retopologie/rigging et l'adaptation des animations du cheval du jeu avant toute substitution définitive. Ne considère pas la simple réussite de l'import comme un cheval jouable. Vérifie aussi l'échelle : dimensions natives d'environ 0,246 × 0,738 × 0,980 unité (largeur × hauteur × longueur). Mesure et calibre la taille avec le référentiel du jeu plutôt que supposer une unité en mètres.

Le fichier original avait déjà des points noirs et des irrégularités visuelles sur la peau et la robe. Le décimage ne les corrige pas. Contrôle et nettoie le mesh et les textures s'ils restent visibles dans Three.js. Le ZIP ne contient pas l'original de 64 Mo.

Vérifie : yeux, oreilles, crinière, queue, pieds, surfaces et détails des marques; absence de mesh perforé ou de faces inversées, UV stables; collisions; performance et compatibilité tactile. Termine par captures de profil, face et trois-quarts réellement rendues par le jeu et un bilan des tests.
