# Essai de monte, voie A : journal

Voie A choisie par Julien le 20/11/2026, voie B (MetaHuman) écartée pour l'instant. Objet : porter les règles de monte du
jeu web v3 (pied dans l'étrier, étrivière de longueur fixe, genou continu, jambe contre le flanc sans le traverser, mains
au-dessus de l'encolure, accompagnement du saut calé sur les posers, montée et descente) en C++ dans `StridesCore`, les
prouver par oracle image par image, puis les appliquer par Control Rig à la cavalière actuelle.

Documents de ce dossier :
- `plan-essai.md` : plan d'essai (étapes, portes G1 à G7, tolérances, conditions d'arrêt) ;
- `oracle-monte.md` : étude des règles du web v3 et de l'oracle ;
- `faisabilite.md` : faisabilité MetaHuman dans UE 5.8.4 (voie B, conservée pour mémoire) ;
- `base.json` : ligne de base de l'étape 1, écrite par `scripts/unreal/monte-base.py` (jamais à la main) ;
- `v3-mesures.md` et `v3-mesures.json` : première mesure de la v3 (étape 2), écrites par
  `scripts/unreal/rider-rules-metrics.mjs` à partir de l'oracle O1 `unreal/core/tests/oracles/monte/o1/` (jamais à la main).

Cadre de la phase en cours : copie de travail isolée (branche locale `claude/monte-voie-a`, sans les binaires de
`Content/` sauf `Content/Data`, `node_modules` en lien vers le dépôt principal), aucun Unreal Build Tool, aucun
UnrealEditor ; la tranche CSO avance en parallèle sur `claude/unreal-port`. Fusion après la fin de la tranche CSO.

## Commandes (depuis la racine de la copie, `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`)

```sh
python3 scripts/unreal/monte-base.py              # relève la base : G1, G5, G6, G7, versions, disque -> base.json (~1 min 30)
python3 scripts/unreal/monte-base.py --verifier   # portes de fin d'étape comparées à base.json (code 1 : régression ;
                                                  # code 2 : moins de 8 Gio libres, condition d'arrêt S3)
npx vite --config scripts/unreal/vite-monte.config.mjs --host 127.0.0.1 --port 5176 --strictPort   # jeu web de référence
# Étape 2 (serveur 5176 lancé) : oracle O1 et ancres de sellerie (~15 min), puis mesures (quelques secondes)
node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-rider-rules.mjs --anchors   # [--only=E1,E3]
node scripts/unreal/rider-rules-metrics.mjs                     # -> unreal/docs/parite/monte/v3-mesures.md et .json
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

## Étape 2. Oracle O1 des règles de monte du web v3 (20/11/2026)

Produits (tous écrits par script) :
- `scripts/unreal/export-rider-rules.mjs` : export du jeu web en cours d'exécution, au moule de `rider-audit.mjs`
  (plans des scénarios relus dans son source) et d'`export-cso-runs.mjs` (graine 20261118, horloges virtuelles) ;
- `unreal/core/tests/oracles/monte/o1/` : 8 scénarios, 929 images, 8,9 Mo au total, 1,36 Mo pour le plus gros
  fichier ; schéma `strides.oracle.rider_rules/1`, canaux `ui`, `in`, `cl`, `cq`, `tg`, `hz`, `mx`, `rz`, `dg`, `pe`
  décrits dans `index.json` ;
- `unreal/StridesGrandTour/Content/Data/pjl_tack_anchors.json` (option `--anchors`) : 11 ancres de sellerie (os par nom,
  poids, point local en espace de liaison, matrices inverses de liaison), 450 sommets du profil de flanc et 288 de
  l'encolure, réglages du cheval ;
- `scripts/unreal/rider-rules-metrics.mjs` : M1 à M18 depuis n'importe quel dossier au format (O1 aujourd'hui, O2 et les
  sorties Unreal ensuite), avec `flankAt`, `crestAt` et `THIGH_MARGIN` relus dans `anim.js` ; il écrit `v3-mesures.md`
  et `v3-mesures.json`.

Acceptation :

| Critère du plan | Résultat |
|---|---|
| Deux exports successifs identiques à l'octet | atteint : deux exports complets depuis des pages neuves, `shasum` identique pour les 9 fichiers de `o1/` et pour `pjl_tack_anchors.json` (le second export n'a réécrit aucun fichier) |
| M4 = 0,015 m ± 1e-6 à toutes les images en selle | atteint sous sa forme exacte : l'étrier est posé à `0,015 · scale` sous l'avant-pied (`horse.js:209-210`), soit 0,014775 m ; écart maximal 5,6e-14 m sur les 929 images. Le plan écrivait 0,015 m : c'est le chiffre arrondi de l'audit v2 |
| Plus gros fichier sous 20 Mo | atteint : 1,36 Mo |
| `v3-mesures.md` : min et max de M1 à M17 par scénario, écart rendu–règles | atteint (M8 mesuré dans la page sur la fenêtre de mesure ; M18 en plus) |
| G7 | atteint : `git diff --quiet HEAD -- src public tests` code 0 ; voir la vérification de fin d'étape |

Adaptations du plan (déclarées dans les en-têtes des fichiers) :
- Dossier `oracles/monte/o1/` au lieu de `oracles/rider_rules/` (consigne de la phase).
- Le canal `in` est relevé **juste après** `hu.animateRiding`, pas avant : `animateRiding` calcule les entrées puis appelle
  `animateHuman`, qui ne les modifie pas ; avant l'appel, `hu.anim` contient encore celles de l'image précédente.
- `in.fit` est en unités du modèle, exactement ce que lit la règle (mètres = valeur × `scale`) : la relecture d'O2 à 1e-6
  ne dépend ainsi d'aucune conversion.
- Mise en selle : `Human.mount` immédiat dans une page neuve, après une image de mise en place non exportée qui donne au
  cheval WildMesh recréé ses premiers profils (sans elle, la première image voit un flanc nul).
- E2g et E2d partent de l'arrêt : 60 images de mise en train sur le même cercle précèdent les 80 images du plan. E3 et
  E3b finissent 45 images après la réception (30 dans `rider-audit.mjs`), pour inclure le retour sous 10 %.
- E4 et E5 (montée, descente) non exportés ; E6t (trot) et E6v (virage à droite) exportés hors acceptation.
- Point 7 du plan (champs du mélangeur) : canal `mx` = actions actives (nom, poids, temps du clip), état de saut de la
  vue, `leadBlend`, `idleTime`, hauteur et roulis du corps, `contactOff`, ressorts de `SecondaryMotion` (la bascule
  tourne les os de l'encolure, donc le profil `crest`), instantané `_snapshot`.

Constats de cette première mesure (chiffres : `v3-mesures.md`) :
1. **Cheville à 1,0 cm de sa cible, à toutes les images.** L'os `lFoot` a un décalage de repos `[0, −0,39, −0,01]` ;
   `ik2` prend sa longueur mais suppose le segment le long de −Y. Le portage C++ doit reproduire ce comportement tel quel.
2. **Jambe dans le profil de flanc vu par la règle**, au galop, à l'arrêt depuis le galop et au saut : M7 jusqu'à
   −13,2 cm (cuisse à mi-longueur, E3b), −7,9 cm au tibia (E6v), −5,9 cm au genou (E3b) ; en E3, le pôle du genou
   gauche est à sa borne (0,90) à ces images. Les axes d'os n'entrent pourtant pas dans le maillage du cheval (M8 de 0,2 cm au plus). **Le seuil absolu
   « M7 ≥ −1,0 cm » des niveaux A et B est donc dépassé par le web lui-même** : à trancher avant l'étape 4 (garder
   seulement |Unreal − O2| ≤ 1 cm au niveau A, ou se fixer un autre seuil).
3. **Postérieurs reposés détectés tard en E3** : entre le poser des antérieurs (image 59) et l'image 80, les os
   `toes_02` restent à 11,4 cm du sol au moins (seuil `HIND_DOWN` 10 cm) ; la règle cesse d'attendre au bout de `holdMax`
   (image 73) et la détection n'arrive qu'à la foulée suivante (cheval à l'image 81, règle à l'image 82). En E3b, elle a
   lieu à l'image 76, juste avant `holdMax`.
4. **Poignet sous `handClear` au saut** : M9 descend à 6,8 cm en E3 (règle 10 cm, seuil B 9 cm) ; l'allonge du bras à
   0,97 ramène le poignet vers l'épaule. M9 = 8,9 cm en E2g, E3b et E6v.
5. **Continuité** : 20,1° en une image sur l'avant-bras gauche en E3 (24,8° en quaternion local), à l'image 42 qui suit
   l'appel (main rendue) ; dans les autres scénarios, 10,3° au plus par segment et 13,6° en quaternion (E1b).
6. **Étrivières dissymétriques à l'arrêt** : 47,9 cm à gauche, 53,0 cm à droite (E1). Dans S, les porte-étrivières sont
   à +14,1 et −8,6 cm de l'axe (S est recentré sur le milieu des ancres d'étrier qui pendent), les plantes à +40,8 et
   −42,3 cm.
7. **Rendu réaliste contre règles** : la botte de `rider_f.glb` est à 2,5 à 3,3 cm de la plante des règles (1,8 à
   2,5 cm plus haut), à 2,4 à 3,3 cm de l'étrier affiché ; son poignet est à 0,3 à 4,9 cm de celui des règles (bras plus
   court), mais plus haut au-dessus de l'encolure (22,0 cm contre 16,4 à l'arrêt, 9,3 contre 6,8 en E3).

Chiffres pour la décision J3 (longueur d'étriers), détaillés dans `v3-mesures.md` :
- stirrupY retenu par le cheval : −64,0 cm sous le point d'assise, c'est la borne la plus courte ; l'ancre seule
  donnerait −63,8 cm (1,6 mm plus court). stirrupZ 10,1 cm, stirrupX 40,2 cm.
- À l'arrêt (E1) : genou 132,2° en moyenne, ρ 0,914 (plafond assis 0,93), hanche 141,9°, talon 8,0°.
- Au galop (E2g, E2d) : genou de 117,5 à 142,1°, ρ jusqu'à 0,946 (plafond de la règle hors de la selle : 0,95) ; le bassin descend
  jusqu'à 3,0 cm sous sa hauteur assise et la plante remonte jusqu'à 2,9 cm au-dessus du point d'étrier. Au galop, la
  jambe de la v3 est donc à sa portée maximale.
- Au sommet du saut (E3, E3b) : genou 142,1°, ρ 0,946, hanche 116,4 à 116,7°, assise +1,6 à +1,7 cm.
- Estimation géométrique, à confirmer par O2 à l'étape 3 : à l'arrêt, chaque centimètre de raccourcissement ferme le
  genou d'environ 3° (131,4° à 0 cm, 125,3° à 2 cm, 117,4° à 5 cm).

Fin d'étape : `python3 scripts/unreal/monte-base.py --verifier` s'est arrêté sur la condition S3 (7,9 Gio libres, sous
le seuil de 8 Gio ; l'étape elle-même occupe environ 25 Mo). Portes légères passées à la main, sans rien supprimer :
G7 (`git diff` code 0, aucun fichier non suivi sous `src`, `public`, `tests` ; `riderPosture` 4/4), G1 (`ctest` sur
`build/core-monte` : 1/1, cœur non modifié), G6 (`build-parite.py` code 0, `PARITE.md` inchangé). G5 non relancée :
aucune capture touchée. Mutations : sans objet à cette étape (le web est en lecture seule) ; elles portent sur le C++ à
l'étape 4 (`mutations-rider-rules.py`).
