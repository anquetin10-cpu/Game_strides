# Essai de monte, voie A : journal

Voie A choisie par Julien le 20/11/2026, voie B (MetaHuman) écartée pour l'instant. Objet : porter les règles de monte du
jeu web v3 (pied dans l'étrier, étrivière de longueur fixe, genou continu, jambe contre le flanc sans le traverser, mains
au-dessus de l'encolure, accompagnement du saut calé sur les posers, montée et descente) en C++ dans `StridesCore`, les
prouver par oracle image par image, puis les appliquer par Control Rig à la cavalière actuelle.

Documents de ce dossier :
- `plan-essai.md` : plan d'essai (étapes, portes G1 à G7, tolérances, conditions d'arrêt) ;
- `oracle-monte.md` : étude des règles du web v3 et de l'oracle ;
- `faisabilite.md` : faisabilité MetaHuman dans UE 5.8.4 (voie B, conservée pour mémoire) ;
- `base.json` : ligne de base de l'étape 1, écrite par `scripts/unreal/monte-base.py` (jamais à la main).

Cadre de la phase en cours : copie de travail isolée (branche locale `claude/monte-voie-a`, sans les binaires de
`Content/` sauf `Content/Data`, `node_modules` en lien vers le dépôt principal), aucun Unreal Build Tool, aucun
UnrealEditor ; la tranche CSO avance en parallèle sur `claude/unreal-port`. Fusion après la fin de la tranche CSO.

## Commandes (depuis la racine de la copie, `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`)

```sh
python3 scripts/unreal/monte-base.py              # relève la base : G1, G5, G6, G7, versions, disque -> base.json (~1 min 30)
python3 scripts/unreal/monte-base.py --verifier   # portes de fin d'étape comparées à base.json (code 1 : régression ;
                                                  # code 2 : moins de 8 Gio libres, condition d'arrêt S3)
npx vite --config scripts/unreal/vite-monte.config.mjs --host 127.0.0.1 --port 5176 --strictPort   # jeu web de référence
```

`vite-monte.config.mjs` reprend `vite.config.js` et place le cache de Vite dans `.tmp/monte/vite-cache` : sans lui, le
serveur de la copie écrirait `node_modules/.vite` du dépôt principal, que le serveur du port 5173 utilise (le hachage de
pré-optimisation dépend de la racine du projet). `monte-base.py` fait de même pour Vitest.

## Étape 1. Préflight et ligne de base (20/11/2026)

Base : `3e188b91` (« Aides à l'appel : bouton SAUT coloré… (T9) »). Valeurs exactes dans `base.json`.

| Porte | Résultat à la base |
|---|---|
| G1 cœur | vert : 1 test ctest, 248 386 vérifications, 0 échec, 0 avertissement à la compilation complète |
| G5 captures | vert : montage des 150 PNG de `parite/cso` refait sans aucun octet changé ; empreinte globale dans `base.json` |
| G6 inventaire | vert : code 0 ; 687 fonctions, 29 identiques prouvées, 262 partielles, 396 absentes ; 169/169 fichiers JS ; `PARITE.md` inchangé |
| G7 web intact | vert : `git diff --quiet HEAD -- src public tests` code 0 ; `riderPosture` 4/4 ; suite unitaire 30 fichiers, 297/297 |
| G2, G3, G4 | non lancées dans cette phase (UBT et UnrealEditor exclus ; aucun source CSO touché) |

Constats :
- Le jeu web de la copie, servi sur le port 5176, atteint l'état `play` depuis `/?autostart` sans erreur de page ni de
  console (Chrome sans tête du Mac, 844 × 390).
- Versions, mémoire, disque libre et tailles des paquets locaux du dépôt principal (`Builds/`, ignorés par git) : `base.json`.
