# trial/ : modèles à l'essai (jamais publiés)

Ce dossier est hors de `public/` : Vite ne le copie pas dans les versions construites (`npm run build`, version
fichier unique). Les fichiers ne sont lus qu'en mode développement (`npm run dev`), et seulement avec l'option
d'URL prévue pour l'essai.

## horse_tripo.glb : cheval Tripo optimisé et animable (ESSAI)

- **Ne remplace pas le cheval du jeu.** Il n'apparaît qu'en mode développement avec `?tripohorse`
  (ex. `http://127.0.0.1:5173/?tripohorse`). Sans cette option, et dans toute version construite, le jeu est
  inchangé.
- **Construction.** `node scripts/real/build-tripo-horse.mjs` (environ 45 s). Source :
  `assets-src/horse-tripo/Cheval_Tripo_Optimise_Qualite.glb`. Écrit `horse_tripo.glb` et `horse_tripo.json`
  (mesures, os, poids, réduction, nettoyage). La construction est reproductible : deux exécutions donnent le même
  fichier, octet pour octet.
- **Contenu.**
  - deux niveaux de détail skinnés sur le même squelette : environ 30 000 et 8 000 triangles ;
  - squelette du jeu : 50 os, mêmes noms ;
  - textures nettoyées en WebP : couleur 2048, normales et rugosité 1024 ;
  - taille : environ 0,96 Mo.
- **Code d'essai.** `src/entities/tripoHorse.js`, chargé à la demande par `src/entities/realistic.js` en mode
  développement uniquement.
- **Test.** `BASE=http://127.0.0.1:5173 node tests/e2e/tripo-horse.mjs [--no-cso]`.

Rapport complet : `LIVRAISON_CHEVAL_TRIPO/LISEZMOI.md`.

Nettoyage du modèle (tapis et quartiers peints et modelés, points sombres) : textures par
`scripts/real/tripo/clean-texture.mjs`, relief des plaques effacé dans le maillage par `tripo/relief-plaques.mjs`
(la construction lui passe la zone fournie par le nettoyage et s'arrête si elle manque ; `relief` dans
`horse_tripo.json`), normales
de couture incohérentes corrigées par `mesh-clean.repairNormals`. Les planches de revue avant/après (aperçus et
modèle construit) ont été rendues par des scripts locaux de `tests/e2e/tmp/` (non versionnés) ; les principales sont
reprises dans `LIVRAISON_CHEVAL_TRIPO/captures/`.

Non versionnés (`.gitignore`) : `textures/`, `review/`, `debug/` et les aperçus `tripo_clean_*.glb`, qui sont les sorties
intermédiaires du nettoyage et du calage. Ils se régénèrent avec :

- `node scripts/real/tripo/clean-texture-cli.mjs` ;
- `node scripts/real/tripo/debug-skeleton.mjs`.
