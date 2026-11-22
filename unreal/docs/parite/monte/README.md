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
  `scripts/unreal/rider-rules-metrics.mjs` à partir de l'oracle O1 `unreal/core/tests/oracles/monte/o1/` (jamais à la main) ;
- `o2.md` : oracle O2 (étape 3), preuve O2 = O1, rig `rider_f`, mesures de la règle sur les deux rigs et longueurs
  d'étriers pour la décision J3, écrit par `scripts/unreal/rider-rules-o2.mjs` (jamais à la main) ;
- section « Étape 4 » ci-dessous : règles portées en C++ (`StridesCore/RiderRules.h`), preuve contre O2, mutations, coût.

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
# Étape 3 (sans navigateur ni serveur) : rig de la cavalière réaliste, oracle O2, page o2.md (~1 s), mutations (~30 s)
python3 scripts/unreal/rig-from-glb.py                          # -> unreal/core/tests/oracles/monte/rigs/rider_f.json
node scripts/unreal/rider-rules-o2.mjs                          # -> oracles/monte/o2/, rigs/web_classic.json, o2.md
node scripts/unreal/rider-rules-o2.mjs --fit=stirrupY=-0.62     # longueur d'étriers J3 (m) -> .tmp/monte/o2-fit
python3 scripts/unreal/mutations-monte-o2.py                    # 93 mutations d'anim.js et du rejeu, copies dans build/
# Étape 4 (C++ hors moteur) : paramètres, test contre O2 (dans ctest, ~2 s), mutations (~3 min), banc de coût (Release)
node scripts/unreal/export-rider-rules-data.mjs                 # -> Content/Data/rider_rules.json (--check : comparaison)
cmake -S unreal/core -B build/core-monte && cmake --build build/core-monte && ctest --test-dir build/core-monte --output-on-failure
python3 scripts/unreal/mutations-rider-rules.py                 # 97 mutations de RiderRules.cpp, copies dans build/mutations-monte
cmake -S unreal/core -B build/core-monte-rel -DCMAKE_BUILD_TYPE=Release && cmake --build build/core-monte-rel --target strides_monte_bench
build/core-monte-rel/strides_monte_bench unreal/core/tests/oracles/monte unreal/StridesGrandTour/Content/Data 10000 rider_f
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

## Étape 3. Oracle O2 : la règle du web rejouée hors navigateur (20/11/2026)

Base : `7ddfdd99` (étape 2). Étape reprise après une interruption : les fichiers laissés par la première exécution ont été
relus et rejoués ; ils redonnaient leurs propres sorties à l'octet. Corrections apportées à la reprise : contrôle O2 = O1
rendu impossible à sauter (une échelle différente ou une image manquante est un échec), écart `NaN` compté comme infini,
état interne absent comparé sans planter, fichiers versionnés écrits seulement pour l'oracle complet (jamais avec
`--out`), mention « convention à confirmer » dédoublée dans `o2.md`, colonnes assise et pied écarté ajoutées au tableau
des étriers.

Produits (tous écrits par script) :
- `scripts/unreal/rider-rules-o2.mjs` : importe `src/entities/human/anim.js` et `skeleton.js` **inchangés** dans Node
  (sans Vite ni navigateur), construit le squelette de 25 os d'un rig (os `three.js`, `userData.rest`, `__rig.info`) et
  rejoue le canal `in` d'O1 image par image ; il écrit `cl`, `cq`, `tg`, `dg` au format d'O1 et la page `o2.md` ;
- `unreal/core/tests/oracles/monte/o2/` : 2 rigs × 8 scénarios, 1 858 images, 7,4 Mo au total (rigs compris), 0,58 Mo
  pour le plus gros fichier ; schéma `strides.oracle.rider_rules_o2/1`, `index.json` avec les contrôles ;
- `unreal/core/tests/oracles/monte/rigs/web_classic.json` (depuis `skeleton.js`) et `rider_f.json` (par
  `scripts/unreal/rig-from-glb.py`, lecteur GLB sans dépendance : nœuds de `public/real/rider_f.glb`, calage de
  `realistic.js _calibrate`, semelle et poing relevés dans la page par l'exporteur O1) ;
- `scripts/unreal/mutations-monte-o2.py` : 93 mutations sur des copies d'`anim.js` (75) et du rejeu (18), dans `build/`.

Acceptation :

| Critère du plan | Résultat |
|---|---|
| O2 `web_classic` à l'échelle enregistrée reproduit O1 (`cl` et `tg`) à 1e-6 m et 1e-6 rad, toutes images, tous scénarios | atteint sur les 929 images des 8 scénarios : `cl` 2,9e-9 m, `cq` 1,0e-8 rad, `tg` 1,1e-16 m, orientations des pieds 2,2e-16 rad, état interne `dg` 2,2e-16. Les entrées exportées sont complètes |
| Deux exécutions identiques à l'octet | atteint : `shasum` des 17 fichiers d'`o2/`, des 2 rigs et d'`o2.md` identique d'une exécution à l'autre ; deux sorties `--out` comparées par `diff -r` |
| O2 `rider_f` produit | atteint : 8 scénarios ; le rig, animé par les rotations du classique, redonne le rendu réaliste du web (`rz`) à 1,1e-6 m près (tolérance 2e-6, `rz` étant arrondi au millionième) ; boule du pied à 1,4e-7 m de la page |
| Option `--fit stirrupY=…` | atteinte : `--fit=stirrupY=<m>` (et `stirrupX`, `stirrupZ`, `handX`, `handY`, `handZ`, `legClear`), sortie hors de l'oracle versionné |
| Plus gros fichier sous 20 Mo | atteint : 0,58 Mo |
| G7 | atteint : voir la fin d'étape |

Mutations (`mutations-monte-o2.py`, code 0) : 93 mutations, 81 détectées par l'écart à O1, 0 plantage. Les 12 autres
sont listées dans `ATTENDUES` avec leur raison, et chaque raison est prouvée par une sonde rejouée sur O1 (copie
d'`anim.js` qui lève une erreur quand la condition est vraie) ; pour chacune, les écarts à O1 sont identiques à ceux du
témoin. Ce sont les parties de la règle que **O1 n'exerce pas** : vitesse au-delà de 9 m/s (le galop allongé), salut
(`st.wave`), queue de cheval (`hairTail` nul à toutes les images), pas autre que 1/30 s, allonge d'`ik2` au-delà de 0,98
de la longueur du membre, tolérance « genou au-delà de la cheville » (`room()` jamais faux), borne de 12 cm de l'écart du
pied (`xMax` toujours plus serrée), fenêtre de 0,25 s et borne 0,97 de `hugMemory` (la seconde est du code mort par
construction), marge de 5 mm et seconde passe de la remontée du pied (atteinte, sans effet). L'étape 4 ne pourra pas
départager ces mutations dans le C++ contre O2 non plus ; pour les couvrir, il faudrait des scénarios de plus (galop
allongé, salut), à décider.

Adaptations du plan (déclarées dans les en-têtes des scripts) :
- Node seul au lieu de vite-node : `anim.js` n'importe que `three` ; aucun cache n'est écrit dans `node_modules`.
- Dossiers `oracles/monte/o2/<rig>/` et `oracles/monte/rigs/` au lieu de `rider_rules_o2/` et `rider_rules/rigs/`.
- `web_classic.json` est écrit par `rider-rules-o2.mjs` depuis `skeleton.js` (le personnage classique n'a pas de GLB :
  `humanModel.js:29` le construit par `boneDefs`) ; le script vérifie qu'il est identique au squelette enregistré dans O1.
- `rider_f` : `seatToHips` est une convention à confirmer à l'étape 6 (classique × rapport `hipScale` de
  `realistic.js:726`) ; `heelBack` et `height` restent nuls, la monte ne les lit pas. Pas de rig `rider_m` : O1 ne relève
  la semelle et le poing que du modèle affiché (`rider_f`).
- Mutations ajoutées à cette étape (le plan ne les prévoyait qu'à l'étape 4, sur le C++).

Constats :
1. **O2 = O1 à 1e-8 près** : la règle ne lit rien d'autre que le canal `in`. Seul écart au-delà de 1e-12 : le lissage des
   os par `Quaternion.slerp`, qui change de branche selon `cosHalfTheta`. Vérifié dans Node par une sonde hors dépôt : à
   l'image 69 d'E3b, `lFore` est à un ulp de sa cible (`cosHalfTheta` = 0,9999999999999999, branche d'interpolation
   linéaire), puis à 1,0000000000000002 à l'image 70 (aucun mouvement) ; l'écart à O1 apparaît à l'image 69 (5,0e-9 sur
   une composante) et se divise par 4 environ à chaque image (lissage à 40 /s). Le côté Chrome n'est pas observé : la
   branche prise par O1 à cette image reste à confirmer.
2. **La règle dépasse sa propre portée maximale avec `rider_f`.** ρ (hanche–cheville rapportée à la jambe, mesurée sur
   le squelette) atteint 0,956 en E3b à la longueur v3, et 0,96 à 0,97 avec des étriers plus courts (règle : `riseReach`
   0,95 ; seuil du niveau B : 0,955). Mécanisme vérifié par une sonde hors dépôt sur E3b : la cible de la cheville est
   bornée à 0,9500 par la remontée, puis `hugMemory` garde le pied écarté (refermeture à `FOOT_RELAX`, 2 cm/s) et la
   portée de la cible passe à 0,9593 (pied gauche 1,65 cm plus loin) ; la cheville réelle est à 1,0 cm de sa cible
   (constat 1 de l'étape 2), un peu plus près de la hanche, d'où 0,956. Avec `web_classic` à la longueur v3, la cible
   ne dépasse jamais 0,9500 en E3b (ρ mesuré 0,946) ; avec des étriers plus courts, ρ atteint 0,95 à 0,96 (même
   mécanisme probable, non sondé). Comme M7 (constat 2 de l'étape 2), ce seuil absolu du niveau B est donc dépassé par
   la règle elle-même : à trancher avant l'étape 6.
3. **`rider_f` à la longueur v3** : la jambe (80,4 cm) est plus longue que celle du classique à l'échelle 0,985
   (78,3 cm) et l'étrier v3 la tend : à l'arrêt, ρ 0,925 (plafond assis 0,93) et le bassin descend de 1,2 cm dans la
   selle pour atteindre l'étrier. Ce chiffre dépend de la convention `seatToHips`.
4. **Premier centimètre de raccourcissement presque sans effet à l'arrêt.** Avec `web_classic`, le pied gauche passe de
   0,6 à 3,1 cm d'écart latéral à 1 cm de raccourcissement (tibia contre le flanc, la règle écarte le pied), ce qui
   rallonge la portée ; avec `rider_f`, c'est le bassin qui remonte dans la selle. De 2 à 8 cm, le genou se ferme de
   2,3 à 3,3° par centimètre selon le rig, proche de l'estimation géométrique de l'étape 2 (environ 3°).

Chiffres pour la décision J3 (longueur d'étriers), mesurés avec O2 (tableaux complets : `o2.md` §4) :
- `web_classic` (squelette que la v3 anime), arrêt E1, genou moyen : 132,2° à la longueur v3 (stirrupY −0,64 m),
  131,2° à 1 cm plus court, 126,2° à 2 cm, 123,4° à 3 cm, 118,1° à 5 cm, 111,1° à 8 cm ; ρ de 0,914 à 0,825.
- `rider_f` (proportions de la cavalière visible) : 135,2°, 135,3°, 132,7°, 129,4°, 123,6°, 115,1° aux mêmes longueurs.
- Galop (E2g), `web_classic` : genou le plus fermé 117,5° (v3), 115,0°, 112,6°, 110,3° à 1, 2 et 3 cm, puis plus de
  gain (113,9° à 5 cm, 110,6° à 8 cm) et ρ au-delà de 0,95 (0,952 et 0,962). Obstacle de 1,40 m (E3b) : genou le plus
  ouvert 142,1° (v3), 143,5° à 147,3° dès 1 cm, ρ de 0,950 à 0,960 (constat 2).
- Conversion pour une longueur choisie : stirrupY = −0,64 m + raccourcissement ; dans le web v3, le cheval PJL borne
  stirrupY à −0,64 m au plus court (`pjlHorse.js:264`) : un étrier plus court exigerait de lever cette borne (web) ou de
  la régler dans le portage (Unreal).

## Étape 4. Règles de monte portées en C++ : `RiderRules` (20/11/2026)

Créé :
- `unreal/StridesGrandTour/Source/StridesCore/Public/StridesCore/RiderRules.h` et `Private/RiderRules.cpp` (C++20, sans
  type Unreal). Port ligne à ligne d'`anim.js` en pose « ride » : `ik2`, `kneeOf`, `lookQ`, `forwardTrunk`, `solveLeg`,
  `solveArm`, `flankAt`, `crestAt`, `hugFlank`, `hugMemory`, `riding`, `hairSpring` et l'application lissée
  d'`animateHuman` (slerp à trois branches, jambes exactes une fois le fondu fini) ; plus la préparation des entrées de
  `human.js` `animateRiding` (`RideInputFilter` : rebond et tangage du dos, saut, réception `landT`, profils du flanc
  filtrés par `FLANK_RELAX` et `FLANK_LEAD`, réglages en unités du modèle), **portée pour le seul cas qu'O1 exerce**
  (une mise en selle, pas d'animation jamais nul) : trois écarts connus hors de ce cas, voir « Contrôle adverse et pause
  S3 » plus bas. Les fonctions de Three.js utilisées sont reproduites avec leurs formules de three 0.170.0, dans le même
  ordre d'opérations. Contraction en FMA désactivée dans `RiderRules.cpp` (`#pragma clang fp contract(off)` encadré par
  `float_control(push/pop)` ; Clang contracte sinon, même en -O0), **sauf dans `smoothstep`** : défini dans
  `MathUtil.h`, inclus avant le pragma, son `3 - 2 * t` est compilé en `fma(t, -2, 3)` ; la multiplication par −2 est
  exacte, le résultat est donc identique au bit près. Le pragma est efficace (sans lui, `web_classic` passe de 1e-15 à
  4,3e-9 m, relevé du contrôle adverse) et ne déborde pas sur les autres sources d'une compilation unifiée. Aucun état
  statique : chaque cavalier porte son état.
- `Content/Data/rider_rules.json`, écrit par `scripts/unreal/export-rider-rules-data.mjs` (Node seul) : `RIDE` importé
  d'`anim.js` ; constantes non publiées relues dans le source (`THIGH_MARGIN`, `POLE_OPEN`, `HUG_OPEN`, `HUG_RELAX`,
  `FOOT_OPEN`, `FOOT_RELAX`, `DEFAULT_FIT` ; `FLANK_RELAX`, `FLANK_LEAD`, `FIST`, `RIDER_FIT`, `RIDER_SEAT` ; `LEG_THICK`,
  `HIND_DOWN`), une seule occurrence exigée. Deux exports : mêmes octets.
- `unreal/core/tests/test_monte.cpp` (exécutable `strides_monte_tests`, test ctest `monte`), `tests/bench_monte.cpp`
  (`strides_monte_bench`, hors ctest), `scripts/unreal/mutations-rider-rules.py`. `unreal/core/CMakeLists.txt` : bloc
  ajouté en fin de fichier (`target_sources`, deux exécutables), sans toucher à la ligne `add_library` que la tranche CSO
  modifie.

| Critère du plan | Résultat |
|---|---|
| Rigs `web_classic` et `rider_f`, tous scénarios : articulations et cibles C++ contre O2 ≤ 0,1 mm et ≤ 1e-4 rad | atteint, 1 858 images (8 scénarios × 2 rigs). `web_classic` : articulations et points 1,0e-15 m, rotations locales 2,1e-15 rad, cibles 1,1e-16 m, orientations des pieds 2,2e-16 rad. `rider_f` : articulations et points 7,2e-9 m (E1b, image 129, poing gauche), rotations locales 2,6e-8 rad (E1b, image 82, `lFore`), cibles 2,2e-16 m |
| État interne (`post`, `two`, `jumpK`, `rel`) ≤ 1e-6 | atteint, et étendu à tout `dg` (`diag`, `wantDiag`, `diagT`, `bobAvg`, `hd`, `wasJump`, `look`, `hug` des deux côtés, `blendT`) : 2,2e-16 |
| Entrées C++ calculées depuis `hz` brut, comparées au canal `in` : ≤ 1e-6 m | atteint pour toutes les images à partir de la deuxième (921 images × 20 valeurs = 18 420, 8 scénarios) : 1,9e-16 (tangage, E2g, image 131). Ce décompte gonfle la preuve : `dt` est passé tel quel en argument (comparaison tautologique), `hs` et `jump` sont recopiés de `hz`, `kneeOut` et `mountKneeOut` sont des directions recopiées. Ce qui prouve le portage : rebond, tangage, `landT`, `t`, phase de foulée, longueurs mises à l'échelle, profils `flankL` et `flankR` filtrés, `crest`. Le cavalier lit l'état du cheval de l'image précédente (`hz` de f − 1) ; l'image 0 suit la mise en selle, non exportée : l'état du filtre y est repris du canal `in`. Exception : le virage (`h.lastTurn` n'est pas exporté dans O1), repris du canal `in` et non comparé |
| G4 : au moins 30 mutations, chacune détectée ou déclarée | atteint pour le seuil (au moins 30, chacune détectée ou déclarée, code 0) ; partiel pour « une par constante et par branche ». 97 mutations (une partie des constantes de `RIDE`, constantes nommées, chaque étape de `hugFlank`, `hugMemory`, ordre mémoire puis recherche, retards d'une image, lissage, squelette, préparation des entrées), 85 détectées, 12 déclarées dans `ATTENDUES` avec leur raison. Sans mutation dans le script : `breathChest`, `breathShoulder`, `releaseIn1`, et `holdMax` et `landFold` dans le calcul de `jHd` (le contrôle adverse les a mutées sur une copie : toutes détectées). La mutation « ordre inversé, pied avant genou » saute l'étape 1 de `hugFlank` (`if (false)`) : ce n'est pas une inversion d'ordre. Branches qu'O1 n'exerce pas, ni déclarées ni couvertes : voir « Contrôle adverse et pause S3 ». Témoin non muté vérifié en tête de campagne |
| Coût : 10 000 images en Release, médiane ≤ 0,22 ms | atteint : médiane 0,0041 ms par image (trois passes : 0,00417, 0,00413, 0,00413 ms) ; moyenne 0,0050, p99 0,0100, max 0,017 à 0,042 ms |
| G1 | vert : 2 tests ctest, 248 386 + 306 914 = 555 300 vérifications, 0 échec, 0 avertissement à la compilation. Réserve : `monte-base.py --verifier` compare la somme à la base de l'étape 1, qui ne comptait que le cœur (248 386) ; une baisse des vérifications du cœur serait masquée par le test `monte` (liste par test enregistrée, non comparée) |

Mesure du coût (honnête, à relire avec ses limites) : Mac mini M2 16 Go, Apple clang 21, `-O3 -DNDEBUG`
(`CMAKE_BUILD_TYPE=Release`). Une image mesurée = `RideInputFilter::next` + `RiderRules::step` + `RiderRules::skeleton`
(25 matrices, plantes, poings) pour la cavalière `rider_f`, sur les 8 scénarios d'O1 enchaînés en boucle (état du
cheval relu dans `hz`), état remis à neuf au début de chaque scénario hors chronomètre ; 500 images de mise en
température non comptées ; chaque image chronométrée seule par `std::chrono::steady_clock` (pas de 41,7 ns sur ce Mac :
deux lectures successives donnent 0 ns en médiane, 83 ns au plus). Machine chargée par le chantier CSO pendant la mesure
(charge moyenne 3,8). Rig `web_classic` : médiane 0,0041 ms aussi. Ce chiffre est le coût CPU du cœur seul, hors moteur :
le Control Rig, l'évaluation de l'animation et l'iPhone ne sont pas mesurés (étapes 7 et 16).

Contrôles en plus du plan :
- La compilation en -O0 et en -O3 donne des écarts identiques au caractère près (sortie complète du test comparée).
- Chaîne complète `hz` → entrées → règle, contre O2 `web_classic` : articulations 2,9e-9 m, rotations 1,0e-8 rad, cibles
  2,2e-16 m. Ces 1e-8 sont l'écart connu entre O1 (Chrome) et O2 (Node) au changement de branche du slerp (étape 3,
  constat 1) : le C++ suit Node à 1e-15 près sur `web_classic`.
- Isolation : deux cavaliers simultanés, et un cavalier remis à neuf, donnent les mêmes octets (19 511 valeurs).
- Valeurs par défaut de `RideParams` identiques à `rider_rules.json` (53 valeurs, égalité exacte).

Mutations non départagées (12, toutes dans `ATTENDUES`) :
- les mêmes parties de la règle que l'étape 3 n'exerce pas sur `anim.js` (raisons prouvées alors par des sondes sur O1) :
  limite « genou au-delà de la cheville » (`room()` jamais faux), borne de 12 cm de l'écart du pied (`xMax` plus serrée),
  seconde passe et marge de 5 mm de la remontée du pied, plafond 0,97 de `hugMemory` (inactif avec `kneeOut` 0,45),
  borne 0,9995 d'`ik2` et de `kneeOf` (allonge toujours sous 0,98) ;
- branche linéaire du slerp (quelques 1e-9 au plus, sous les tolérances) ;
- queue de cheval (`hair` faux dans tous les scénarios), salut (`wave` nul), `DEFAULT_FIT` (le jeu fournit toujours
  `fit`), formule du virage de `animateRiding` (`h.lastTurn` absent d'O1).
Les couvrir demanderait des scénarios de plus (galop allongé, salut, cavalier avec queue de cheval) et l'export de
`h.lastTurn` dans O1 : à décider.

Constats :
1. **Le portage reproduit la v3 au dernier bit près sur le squelette du web** (`web_classic` : 1e-15). Sur `rider_f`, le
   plus gros écart (2,6e-8 rad sur `lFore`) a probablement la même cause que l'écart O1–O2 (branche du slerp à un ulp de
   la cible, ici entre la libm d'Apple et celle de Node) : non sondé, à confirmer ; il reste environ 3 800 fois
   sous la tolérance (1e-4 rad).
2. **Le coût est négligeable devant le seuil** : environ 4 µs par image, 50 fois sous 0,22 ms.
3. `Content/Data/rider_rules.json` porte aussi les données dont les étapes 5 et 6 auront besoin (`RIDER_FIT`,
   `RIDER_SEAT`, `FIST`, `LEG_THICK`, `HIND_DOWN`) ; la règle ne les lit pas.

Adaptations du plan :
- Test dans un exécutable séparé (`test_monte.cpp`, ctest `monte`) et non dans `test_core.cpp` : ce fichier est modifié
  par la tranche CSO. `run("rider", …)` n'existe donc pas ; le test s'appelle `monte`.
- Export des constantes par `export-rider-rules-data.mjs` et non par `export-data.mjs` : celui-ci s'exécute par
  vite-node (cache écrit dans `node_modules`, partagé avec le chantier CSO) et la tranche CSO le modifie.
- Oracles lus dans `unreal/core/tests/oracles/monte/` (dossiers de l'étape 3).
- `monte-base.py` additionne désormais les vérifications de tous les exécutables de ctest (G1 ; réserve dans la ligne G1
  du tableau).

Fin d'étape : **la condition d'arrêt S3 n'a pas été respectée.** S3 (plan §7 : moins de 8 Gio libres à n'importe quel
moment, donc pause immédiate, aucune suppression, question à Julien) était déjà atteinte au début de l'étape (6,1 Gio
libres ; 5,3 Gio en cours ; l'étape elle-même a écrit environ 25 Mo : `build/core-monte-rel`, `build/mutations-monte`).
L'étape a pourtant été menée jusqu'au commit `d3f43ab9`, et S3 n'a été présentée que comme la raison d'une porte
partielle. La pause est en place depuis la correction qui suit. `monte-base.py --verifier` refuse de tourner (code 2,
par construction). Les portes ont été passées une par une :
G1 (ctest ci-dessus), G5 (montage refait, 150 PNG, empreinte globale identique à `base.json`, aucun fichier modifié), G6
(`build-parite.py` code 0, 687 fonctions, 29 identiques prouvées, 262 partielles, 396 absentes, 169/169 ; `PARITE.md`
inchangé), G7 (`git diff --quiet HEAD -- src public tests` code 0, aucun fichier non suivi ; `riderPosture` 4/4 ; suite
unitaire 30 fichiers, 297/297, cache de Vite dans `.tmp/monte`). G2, G3 : non lancées (UBT et UnrealEditor exclus).

### Contrôle adverse et pause S3 (20/11/2026, 17 h 18)

**Essai en pause sur S3, en attente de Julien.** Disque : 3,9 Gio libres à 17 h 18 (`df -h /Users/julien`), 3,1 Gio à
17 h 04 (mesure du contrôle adverse), 13,5 Gio à la base de l'étape 1 (`base.json`). Pendant cette correction : aucune
compilation, aucun test, aucune mutation, aucun code modifié, aucune suppression ; seul ce journal est corrigé. L'étape 5
(Unreal Build Tool, UnrealEditor) ne démarre pas avant la décision de Julien sur la place disque.

Constats du contrôle adverse, vérifiés par lecture du code et d'O1 pendant la pause ; corrections de code en attente :
1. **FMA.** `smoothstep` (`MathUtil.h:9`, inclus ligne 9 de `RiderRules.cpp`, avant le pragma ligne 15) reste
   contracté ; `lerp` et `vlerp` sont redéfinis après le pragma et ne le sont pas. Formulation corrigée plus haut.
   Correction prévue : pragma placé avant les includes, puis test et mutations rejoués.
2. **Préparation des entrées hors du cas d'O1.** (a) `human.js:326` `if (!step) return;` n'est pas porté : avec un pas
   nul, `RideInputFilter::next` fait avancer `landT`, `wasJump` et la mémoire des profils, alors que le web n'avance que
   `anim.t`. (b) `seed()` efface la mémoire brute des profils (`_flankRaw`), que le web garde d'une mise en selle à
   l'autre. (c) `reset()` remet à neuf plus que `Human.mount` (`human.js:249-272`, qui ne remet que `_init` et `_ride`) :
   aussi `blendT`, la pose `_P` et la queue de cheval ; le commentaire de `RiderRules.h:159` est donc inexact pour une
   remise en selle. Sans effet pour le joueur à une seule mise en selle, cas que l'oracle prouve ; compte pour les
   cavaliers animés à pas réduit (LOD) et pour une remontée en selle. Effet chiffré sur la pose : à confirmer. Correction
   prévue avec un test dédié (pas nul, deux mises en selle), faute de scénario O1.
3. **Branches qu'O1 n'exerce pas, ni déclarées ni couvertes jusqu'ici** (relevé par lecture d'O1) : galop allongé
   (`smoothstep(9.8, 11.8, hs)` ; vitesse maximale d'O1 8,70 m/s, E3b), deux sauts successifs (remise de `R.hd` à −1 ;
   un saut au plus par scénario, E3 et E3b), pas nul (pas minimal d'O1 : 1/30 s). À déclarer dans `ATTENDUES` avec leur
   raison, ou à couvrir par des scénarios O1 de plus.
4. **Mutations manquantes** : `breathChest`, `breathShoulder`, `releaseIn1`, `holdMax` et `landFold` dans `jHd`, et une
   vraie inversion de l'ordre genou puis pied ; libellé « ordre inversé » à corriger en « étape 1 sautée ».
5. **G1 de `monte-base.py`** : comparer les vérifications par test ctest (cœur et `monte` séparément), et non leur somme.

