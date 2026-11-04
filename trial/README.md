# trial/ : rapport de construction du cheval Tripo

Ce dossier, hors de `public/`, n'est jamais copié dans les versions construites. Il contient `horse_tripo.json`,
le rapport de la dernière construction du cheval Tripo : mesures, os, poids, réduction, nettoyage, filet.

## Cheval Tripo : deuxième cheval de l'écurie (à l'essai)

- **Comète n'est pas remplacée.** Le Tripo est un deuxième cheval, disponible dans toutes les parties, nouvelles
  ou anciennes. Pour le monter : téléphone → « Mes chevaux » → « Seller ce cheval ».
  - Il n'est pas écrit dans la liste des chevaux de la sauvegarde ; seul le choix de la monture l'est.
  - Si on le retire du jeu, une partie qui le montait reprend avec Comète.
- **Modèle.** `public/real/horse_tripo.glb`, construit par `node scripts/real/build-tripo-horse.mjs` (environ 45 s).
  Source : `assets-src/horse-tripo/Cheval_Tripo_Optimise_Qualite.glb`. La construction est reproductible : deux
  exécutions donnent le même fichier, octet pour octet.
- **Contenu.**
  - deux niveaux de détail skinnés sur le même squelette : environ 30 000 et 8 000 triangles ;
  - squelette du jeu : 50 os, mêmes noms ;
  - textures nettoyées en WebP : couleur 2048, normales et rugosité 1024 ;
  - filet et rênes ajustés à sa tête (`scripts/real/tripo/bridle.mjs`) : 3 770 triangles ;
  - taille : environ 1,0 Mo.
- **Affichage.**
  - Le cheval dont la définition porte `model: 'horse_tripo'` est toujours montré avec ce modèle, quels que soient
    les réglages d'affichage (`src/entities/realistic.js`, `src/entities/tripoHorse.js`).
  - Le filet et les rênes n'apparaissent que lorsqu'il est monté.
  - En mode développement, `?tripohorse` met aussi le modèle sur le cheval principal, pour l'essai technique.
- **Tests.**
  - `BASE=http://127.0.0.1:5173 node tests/e2e/tripo-stable.mjs` : écurie, sauvegardes, filet.
  - `BASE=http://127.0.0.1:5173 node tests/e2e/tripo-horse.mjs [--only=A,B,C,D,E]` : allures, sauts, CSO, filet.

Rapport complet : `LIVRAISON_CHEVAL_TRIPO/LISEZMOI.md`.

## Nettoyage du modèle

- **Textures.** Le tapis et les quartiers peints et modelés, ainsi que les points sombres, sont nettoyés par
  `scripts/real/tripo/clean-texture.mjs`.
- **Relief des plaques.** Il est effacé dans le maillage par `scripts/real/tripo/relief-plaques.mjs`.
- **Normales.** Les normales de couture incohérentes sont corrigées par `scripts/real/tripo/mesh-clean.mjs`.

Les sorties intermédiaires (`textures/`, `review/`, `debug/`, aperçus `tripo_clean_*.glb`) ne sont pas versionnées.
