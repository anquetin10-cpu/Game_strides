# Oracle des règles de monte : cavalière MetaHuman contre jeu web v3

> **Voie A choisie par Julien le 20/11/2026, voie B (MetaHuman) écartée pour l'instant.**
> Copie versionnée le 20/11/2026 du document de préparation ; le texte sous cet encadré est inchangé. Phase en cours :
> règles de monte du web v3 portées en C++ dans StridesCore et prouvées par oracle (étapes 1 à 4), puis appliquées par
> Control Rig à la cavalière actuelle (étapes 5 à 7). Adaptations de cette phase : travail sur la branche locale
> `claude/monte-voie-a`, fusionnée dans `claude/unreal-port` après la tranche CSO ; comptes rendus dans
> `unreal/docs/parite/monte/` (et non `unreal/docs/essai-metahuman/`) ; étape 1 sans Unreal Build Tool ni UnrealEditor
> (portes G1, G5, G6, G7 seulement, `scripts/unreal/monte-base.py`). Les outils d'inspection cités
> (`essai-metahuman/outils/`) sont restés dans le dossier de travail de la préparation, non versionnés.

Préparation du 20/11/2026 (Europe/Paris). Lecture seule du dépôt `grand-tour-unreal` (branche `claude/unreal-port`), du moteur
UE 5.8.4 et de deux pages officielles Epic. Rien n'a été compilé, lancé ou écrit dans le dépôt. Les scripts d'inspection
utilisés sont dans `essai-metahuman/outils/` (lecture de GLB et de noms d'os).

Légende : **[V]** vérifié (fichier:ligne, commande ou page officielle citée) ; **[AC]** à confirmer.

---

## 0. Ce qui sert de référence, et deux constats préalables

**Référence v3 = c7268de [V].** `git diff --quiet c7268dea HEAD -- src tests/unit/riderPosture.test.js tests/e2e/pjl/rider-audit.mjs`
ne trouve aucune différence. Le contenu de `src/` à HEAD est donc celui de la v3, même si c7268de n'est pas un ancêtre de
HEAD (`git merge-base --is-ancestor` : non).

**Constat 1 : la v3 n'a jamais été auditée en entier [V].** Selon `docs/humains-v3/ETAT.md` (dans c7268de), la série de
preuves v3 a été interrompue : pas de vidéos finales, pas d'audit allures ou CSO, pas de tests legs ou montée. Les seuls
chiffres d'audit enregistrés, `docs/humains-v2/audit-allures.json`, `audit-cso.json` et `docs/cavalier-2026-11-16.md`
section 4, datent du lot cavalier v2 (`d193ba7`).
**Conséquence : la première action de l'essai est de produire l'oracle sur la v3 elle-même.** Les chiffres v2 de l'annexe
ne servent qu'à donner des ordres de grandeur.

**Constat 2 : les règles s'appliquent au squelette procédural de 25 os, pas aux 53 os de `rider_f.glb` [V].**
- `src/entities/human/skeleton.js:6-12` déclare 25 os, dont `root`. C'est sur ce squelette que travaillent `anim.js`
  (IK, flanc, encolure, saut) et que l'étrier est accroché (`horse.js:201`, os `lToe` du personnage classique).
- Le modèle réaliste `public/real/rider_f.glb` a 53 os (lecture du skin : `Root`, `pelvis`, `spine_01..03`, bras, 15
  phalanges par main, `neck_01`, `head`, jambes jusqu'à `ball`). Il ne fait que **recopier les rotations** du squelette
  classique (`realistic.js:2-8`, `:717-722` et `:745-766`). Le bassin est mis à l'échelle (`hipScale`, `:723-726`) et le
  modèle est affiché à sa taille naturelle (`:393-395`).
- Les longueurs diffèrent (glTF, mètres) :

| Segment | Classique (×échelle 0,985 de l'audit v2) | `rider_f.glb` |
|---|---|---|
| Cuisse + jambe | 0,795 → 0,783 m | 0,398 + 0,406 = **0,804 m** |
| Bras + avant-bras | 0,525 → 0,517 m | 0,242 + 0,223 = **0,465 m** |

- **Ce que voit Julien dans le web ne satisfait donc pas exactement les règles.** La botte réaliste n'est pas exactement
  sur l'étrier, et le poignet réaliste n'est pas exactement à `handClear` au-dessus de l'encolure. L'écart réel reste à
  mesurer **[AC]**, de l'ordre de quelques centimètres d'après les longueurs.
- **L'oracle se mesure sur le squelette classique**, où les règles sont appliquées. La pose réaliste est exportée à part,
  comme « rendu visible », sans valeur de preuve.
- Une MetaHuman qui applique les règles **sur son propre squelette** peut donc faire mieux que le rendu web visible.

---

## 1. Règles de monte du web v3 (fichier:ligne, constantes)

Toutes les règles s'expriment dans le **repère du siège S** : x vers la gauche du cheval, y vers le haut, z vers l'avant,
origine au point d'assise (`horseMount.js:9-13`, `pjlHorse.js:261`) **[V]**. Le maillage du cavalier est enfant de l'os
`saddle` du cheval du jeu, à l'offset `RIDER_SEAT.saddle = (0,0,0)` (`human.js:48`, `:247-272`). Son échelle compense
celle du cheval : `mesh.scale = scale / parentScale` (`human.js:261-265`).

### R0. Repère du siège et attache (ce que la MetaHuman doit recevoir)

- **Position [V].** Ancre `seat` de la sellerie, recentrée latéralement à chaque image sur le milieu des ancres
  `ironL`/`ironR`, avec un lissage `damp(…, 12)` (`pjlHorse.js:833-844`).
- **Tangage [V].** Tangage du dos = `atan2` de `spine_04` par rapport à `pelvis`, relatif au repos, lissé `damp(…, 18)`.
  S'y ajoute le roulis de la vue (`V.body.rotation.z`) (`pjlHorse.js:845-859`).
- **Ancre de sellerie [V].** Point skinné à 4 influences sur le maillage du cheval :
  `Σ w_k · (bone_k.matrixWorld · boneInverse_k · bindMatrix) · p` (`pjl/view.js:106-124`). Les ancres sont définies sur
  la surface du tronc, avec `at(z, s)` = abscisse z et longueur d'arc s depuis la ligne du dessus (`pjl/tack.js:74-82`,
  `:342-360`) :
  - `seat` = `at(-0.1, 0)` + 0,07 m en y ;
  - `barL`/`barR` = `at(0.04, ±0.13)` ;
  - `ironL`/`ironR` = `at(0.06, ±0.6)` + 0,10 m le long de la normale ;
  - `crest` = `at(0.36, 0)` ;
  - `withers` = `at(0.22, 0)` ;
  - `kneeL`/`kneeR` = `at(0.13, ±0.3)` + 0,08 m le long de la normale.
- **Ordre de mise à jour [V].** Le cavalier est animé **avant** la mise à jour du cheval. Le profil de flanc qu'il voit
  est donc celui de l'image précédente (`human.js:363-364`). Les étriers sont replacés après le siège de l'image courante
  (`pjlHorse.js:757-761`).

### R1. Étrier sous l'avant-pied (plante sur la grille)

- **Cible de la cheville [V].** `f.pos = étrier − R_pied · (0, −ankleY + 0.012, toe.z − 0.005)`, avec
  `étrier = (sg·stirrupX, stirrupY + post·0.012 + two·0.02, stirrupZ − two·0.02)` (`anim.js:766-772`). Le point
  `(0, −ankleY+0,012, toe.z−0,005)` du repère du pied est la **plante sous l'articulation des orteils**, 1,2 cm au-dessus
  de la semelle.
- **Orientation du pied [V].** Talon bas : `heel = 0.14 + 0.06·two + 0.04·jumpK` rad (8,0° à 13,8°). Pointe ouverte :
  `sg·0.10` rad (5,7°) (`anim.js:767-769`).
- **Réglages du cheval PJL [V]** (`pjlHorse.js:252-277`) :
  - `stirrupY = clamp(iron.y − seat.y − 0.06, −0.85, −0.64)` ;
  - `stirrupZ = clamp(iron.z − seat.z − 0.09, −0.10, 0.16)` ;
  - `stirrupX = clamp(demi-largeur du tronc + LEG_CLEAR 0.025, 0.30, 0.55)`, dans la bande y [étrier+0,04 ; −0,16] et z
    [étrier−0,30 ; étrier+0,08] ;
  - réglages par défaut `RIDER_FIT` (`human.js:51`), remplacés par ceux du cheval PJL. L'audit v2 relevait
    `stirrupX 0.4016, stirrupY −0.64, stirrupZ 0.101`.
- **L'étrier affiché suit le pied, par construction [V].** Il est placé sur l'os `lToe`/`rToe` moins `0.015·scale` en y
  (`horse.js:191-216`, appelé par `pjlHorse.js:761`). La distance pied–étrier vaut donc 1,5 cm à chaque image : c'est le
  `piedEtrierMax` de l'audit, toujours 0,015. **Ce n'est pas une preuve.** La règle vérifiable est la position de
  l'avant-pied dans S (R2).

### R2. Étrivière de longueur fixe

- **Principe [V].** Les pieds sont posés d'après le cavalier assis. Quand le bassin monte (trot enlevé, suspension,
  obstacle), ce sont genoux et hanches qui s'ouvrent (`anim.js:755-760`).
- **Portée de la jambe [V]** (`RIDE`, `anim.js:491`) :
  - assis : `seatReach 0.93` (genou à 136,9° à la portée maximale, calculé) ;
  - hors de la selle : `riseReach 0.95` (143,6°).
- **Bassin [V].** Il monte au plus de `dy`, dans la limite de la portée des jambes (`anim.js:804-816`).
- **Cheval large [V].** Le bassin ne descend que de `0.035·L/0.9` au plus ; au-delà, c'est le pied qui remonte (étrier un
  peu plus court) (`anim.js:787-803`).
- **Écart du pied [V].** Le pied peut s'écarter du flanc (R4), puis remonter si la jambe n'atteint plus
  (`anim.js:823-838`).
- **Test [V]** (`tests/unit/riderPosture.test.js:24-44`) : au grand galop et en vol, `toe.y − assis < 0,03 m` et
  `|Δz| < 0,05 m`, alors que le bassin monte de plus de 5 mm.

### R3. Genou continu dans le temps

- **Mémoire par côté [V]** (`hugMemory`, `anim.js:628-659`) :
  - le genou s'ouvre au plus de `HUG_OPEN 2.4/s` (composante latérale du pôle) et se referme de `HUG_RELAX 0.12/s` ;
  - le pied s'écarte au plus de `FOOT_OPEN 0.6 m/s` et revient de `FOOT_RELAX 0.02 m/s` ;
  - la mémoire est valable 0,25 s ;
  - si la limite laisse le genou ou le tibia à plus de 1 cm dans le flanc, la solution exacte est appliquée.
- **Profil du flanc vu par le cavalier [V]** (`human.js:58-61`, `:359-374`) : il se resserre au plus de
  `FLANK_RELAX 0.3 m/s`, et l'élargissement est anticipé (`FLANK_LEAD 2`).
- **Jambes non lissées [V].** En selle, une fois la transition finie (`blendT ≥ 0,45 s`), le bassin et la chaîne des
  jambes sont appliqués exactement, sans lissage (`anim.js:963-973`).
- **Cible v3 [V]** (`ETAT.md`) : rotation maximale d'un os par image inférieure à 15° en régime établi. À-coups restants
  sur l'image de départ des scénarios.

### R4. Jambe contre le flanc sans le traverser

- **Profil du flanc [V].** `flankL`/`flankR` = `[−1.0, 0.05, d0..d19]` : demi-largeur du tronc par tranche de 5 cm sous le
  siège, dans S. Seuls les sommets du tronc, ni membres ni tête, sont pris dans une bande z de ±0,22 m autour de l'étrier.
  Le profil est recalculé à chaque image (`pjlHorse.js:269-274`, `:774-815`).
- **Épaisseur de la jambe [V].** `legClear = LEG_THICK 0.05` m, demi-épaisseur du mollet et de la botte
  (`pjlHorse.js:104-106`).
- **Écart au flanc [V]** (`anim.js:543-626`, `hugFlank`) : `gap(p) = sg·p.x − (flankAt(p.y) + legClear + 0.01)`. Il doit
  être ≥ 0 pour :
  - le genou ;
  - le tibia à 35 % et à 65 % ;
  - la cuisse à 50 % et à 75 %, moins `THIGH_MARGIN 0.02` (`:550-553`).
- **Ordre de correction [V].** D'abord ouvrir le genou (pôle) jusqu'à `POLE_OPEN 0.9`, sans dépasser la cheville de plus
  de 1 cm (pas de genoux en ailes). Ensuite écarter le pied, de 4 cm au plus au-delà de sa place naturelle (`f.xMax`,
  `:777-778`, `:599-610`). Enfin rouvrir le genou.
- **Pôle du genou au repos [V].** `(sg·kneeOut 0.45, −0.05, 1)` normalisé (`anim.js:780`, `:821`).
- **Seuil effectif [V].** La mémoire accepte jusqu'à 1 cm dans le profil (`:647-653`). `hugFlank` vise 1 cm de marge.

### R5. Mains au-dessus de l'encolure, bras jamais verrouillé

- **Cible du poignet (os `hand`) [V]** (`anim.js:843-857`) :
  - `x = sg·(handX 0.065 + handSpread 0.02)` ;
  - `y = handY 0.2 − 0.07·two − 0.12·rel − 0.3·bobHP` ;
  - `z = handZ 0.36 + 0.13·two + 0.22·rel + nod + 0.02·post`.
- **Encolure [V].** `y ≥ crestAt(crest, z + 0.06) + handClear 0.10`. Le profil `crest` = `[0.15, 0.05, 18 tranches]` est
  le plus haut sommet de l'encolure et du garrot par tranche d'avance (`|x − seat.x| < 0.07`) (`pjlHorse.js:67-68`,
  `:795-796`, `:816-825`).
- **Bras [V].** Poignet ramené vers l'épaule au-delà de `handReach 0.97`, soit un coude à 151,7° au plus (calculé).
- **Test [V]** (`riderPosture.test.js:59-76`) : poignet ≥ encolure + 0,10 − 0,01 et coude < 160°. Audit v2 : coude
  maximal 152°.
- **Rênes [V].** Elles vont du mors aux poings. Avec le modèle réaliste, le poing est le « creux » moyen de `index_02`,
  `middle_02`, `pinky_02` et `middle_01` (`realistic.js:472-484`, `human.js:385-394`).

### R6. Accompagnement du saut calé sur les posers du cheval

**Entrées [V]** (`human.js:339-346`, `pjlHorse.js:762-769`) :
- `jump` = vol du jeu, de 0 à 1 (de l'appui des postérieurs au poser des antérieurs) ;
- `landT` = secondes depuis le poser des antérieurs ;
- `hindDown` = postérieurs reposés. L'os `toes_02` passe à moins de `HIND_DOWN 0.1` m du sol (`pjlHorse.js:69-70`).

**Paramètres** (`RIDE`, `anim.js:492-498`) :

| Paramètre | Valeur |
|---|---|
| `foldIn` | 0,18 |
| `releaseIn` | [0,12 ; 0,35] |
| `holdMax` | 0,45 s |
| `recover` | 0,5 s |
| `handBack` | 0,4 s |
| `landFold` | 0,6 |
| `hindFold` | 0,4 |

**Loi [V]** (`anim.js:691-713`) :
- **En vol :** `jk = sstep(0, 0.18, jump)·(1 − 0.4·sstep(0.5, 1, jump))` et `release = sstep(0.12, 0.35, jump)`.
- **Entre les deux posers :** `jk` passe de 0,6 à 0,4 en `holdMax`.
- **Après le poser des postérieurs :** `jk` décroît jusqu'à 0 en `recover`, et `release = 1 − sstep(0, 0.4, landT)`.
- **Lissages exponentiels :** `jumpK` taux 14/s, `two` 5/s, `rel` 10/s.

**Effets sur la posture [V]** (`anim.js:723-753`) :
- buste : `torso = 0.04 + 0.06·trot + 0.14·post + 0.52·two + 0.62·jumpK + 0.03·canterRock`, réparti sur `hips`, `spine`
  et `chest` ;
- tangage du dos compensé : `comp = −pitch·0.85·(1 − (pitch<0 ? 0.75 : 0.25)·jumpK)` ;
- lever du bassin : `lift = 0.085·post + 0.1·two + 0.05·jumpK`, borné par R2.

**Test [V]** (`riderPosture.test.js:78-107`) :
- `jumpK > 0,5` en fin de vol ;
- `> 0,35` tant que les postérieurs sont en l'air ;
- `< 0,05` après `recover + 0,3 s` ;
- pas d'à-coup supérieur à 0,12 par image.

### R7. Assiette

- **Assis [V].** Le bassin suit la selle. L'amorti du dos ne s'applique qu'hors de la selle (`offSeat = clamp(lift/0.04)`)
  (`anim.js:714-727`).
- **Test [V]** (`riderPosture.test.js:46-57`) : `|Δ hips.y| < 0,004` au pas, avec un dos qui monte et descend de ±3 cm.

### R8. Allures

- **Mélanges selon la vitesse [V]** (m/s, `anim.js:668-671`) :

| Allure | Montée | Sortie |
|---|---|---|
| pas | 0,4 → 1,2 | 2,8 → 3,6 |
| trot | 2,8 → 3,6 | 5,2 → 5,9 |
| galop | 5,2 → 5,9 | 9,8 → 11,8 |
| grand galop | 9,8 → 11,8 | — |

- **Trot enlevé [V]** (`anim.js:682-685`, `:672-681`) : on monte pour `u` ∈ [0,02 ; 0,2] et on redescend pour [0,34 ; 0,5].
  Changement de diagonal après 1,2 s en virage.
- **Suspension `two` [V].** 0,55 au galop, 1,0 au grand galop (`anim.js:710`).
- **Repos vivant [V].** Respiration à 0,25 Hz, transfert d'appui, regard (`anim.js:735-753`). Ces termes sont
  **pseudo-aléatoires en t**, donc déterministes à `t` égal.

### R9. Montée et descente (séquences pilotées)

- **Clés [V].** Elles sont exprimées dans le repère du siège, qui bascule de la verticale du cap au repère exact de l'os
  de selle (`tilt` de 0 à 1) (`horseMount.js:9-13`, `:35-55`).
- **Montée [V]** (`horseMount.js:109-158`) : environ 2,3 s, cadence `k = 0.84`.
  - Pied gauche à l'étrier qui pend (`{s:'iron'}`), sur l'ancre `ironL` via le repos de `stirL` (`:448-465`,
    `pjlHorse.js:862-869`).
  - Jambe droite en arc au-dessus de la croupe : `ARC` = `[0.48, −0.1, −0.52]` → `[0, 0.18, −0.76]` → `[−0.46, −0.1, −0.42]`
    (`:98-105`).
  - Descente douce dans la selle.
- **Descente [V].** Environ 2,2 s, `k = 0.9`, gestes inverses (`horseMount.js:161-207`).
- **Pied dans l'étrier [V].** Talon bas, pointe ouverte : `STIRRUP_Q = (0.32, 0.18, 0.06)` rad (`horseMount.js:28`).
- **Pôle du genou [V]** (`horseMount.js:505-525`) :
  - pied à l'étrier qui pend : 1,3 ; en selle : `kneeOut` ; ailleurs : 0,25 ;
  - en plus, `mountKneeOut 3`, plafonné à 1,5, multiplié par `(1 − tilt)` tant que le pied côté montoir pend.
- **Étrier qui suit le pied [V].** Seulement une fois que le pied y est arrivé : règle `inStirrup` (`horseMount.js:528-530`).
- **Recette [V]** (`tests/e2e/horse-mount.mjs:205-224`) :

| Contrôle | Seuil |
|---|---|
| HM-02a, plante sur la grille de l'étrier qui pend | < 6 cm |
| HM-02b, main au garrot | < 6 cm |
| HM-03, jambe opposée dans la croupe | ≤ 2 cm |
| HM-04, rattachement | < 1 cm et < 1° |
| HM-07, saut du personnage | < 0,15 m par image |
| HM-08a, durées | 1,5 à 2,5 s |

---

## 2. Grandeurs à exporter image par image

### 2.1 Repères, unités, conversion Unreal

- **S, repère du siège.** Os `saddle` du cheval du jeu, sans échelle. On le décompose comme dans `pjlHorse.js:803-805` :
  `matrixWorld.decompose → compose(p, q, 1) → invert`. C'est le repère des règles.
- **H, repère du cheval.** `holder` de la vue PJL : origine au sol sous le cheval, axes du cap. On s'en sert pour les
  angles par rapport à la verticale vraie (buste, comme `rider-audit.mjs:105-106` et `:123-124`) et pour le sol.
- **Unités.** Mètres et radians dans le fichier ; degrés seulement dans les synthèses.
- **Conversion vers le repère local d'un acteur Unreal [V].** `X_ue = 100·z`, `Y_ue = −100·x`, `Z_ue = 100·y`. Elle se
  déduit de `StridesUnits.h:9-13` (monde `X=x, Y=z, Z=y`, lacet `90° − h`) et du commentaire « gauche du cheval = −Y
  local » de `StridesRider.cpp:125`. C'est une symétrie, de déterminant −1 : le côté gauche web (`sg = +1`) devient
  `Y < 0`.

### 2.2 Entrées de la règle, à rejouer telles quelles (niveau A, section 5)

À capturer **juste avant** `orig(dt)`, dans un enrobage de `hu.animateRiding`, comme le fait déjà `rider-audit.mjs:63-64`
pour le temps CPU. C'est l'instant où `hu.anim` contient exactement ce que la règle lit (`human.js:317-383`).

| Clé | Source JS | Note |
|---|---|---|
| `dt`, `t` | pas fixe 1/30 ; `hu.anim.t` | |
| `horseSpeed`, `horseGaitPhase`, `turn` | `hu.anim.*` (`human.js:335-347`) | phase déjà décalée par `riderPostOffset` |
| `jump`, `landT`, `hindDown` | `hu.anim.*` (`human.js:339-346`) | événements du saut |
| `bob`, `pitch` | `hu.anim.*` (`human.js:333-334`) | dos du cheval au siège |
| `fit` | `hu.anim.fit` (unités du modèle) **× `hu.scale`** | `stirrupX/Y/Z`, `handX/Y/Z`, `kneeOut`, `legClear`, `flankL`, `flankR` (22 valeurs chacun, déjà filtrés par `FLANK_RELAX`), `crest` (20 valeurs) |
| `scale` | `hu.scale` | aléatoire à la création (`outfits.js:164` : 0,955 + r·0,08) ; 0,985 dans l'audit v2 |
| `seat` | matrice de S dans H (position, quaternion) | permet de recomposer le cheval |
| état interne, diagnostic | `hu.anim._ride` : `post`, `two`, `jumpK`, `rel`, `diag`, `hd`, `hug.{l,r}.{px,fx}` | non exigé de la MetaHuman, sert à localiser un écart |

### 2.3 Positions articulaires, dans S, par côté

Positions **d'articulations**, jamais de sommets : on compare sans exiger le même maillage, ni les mêmes axes locaux d'os.

| Grandeur | Os web classique (lu) | Os `rider_f.glb` (rendu) | Os MetaHuman | Source JS de la lecture |
|---|---|---|---|---|
| bassin | `hips` | `pelvis` | `pelvis` | `bones.hips.getWorldPosition` |
| hanche (tête du fémur) | `lThigh` | `thigh_l` | `thigh_l` | idem |
| genou | `lShin` | `calf_l` | `calf_l` | idem |
| cheville | `lFoot` | `foot_l` | `foot_l` | idem |
| avant-pied (articulation des orteils) | `lToe` | `ball_l` | `ball_l` | idem |
| plante (point de contact de la grille) | `lFoot.localToWorld(0, −ankleY+0.012, toe.z−0.005)` | calibré (3.2) | calibré (3.2) | `anim.js:771` |
| épaule | `lArm` | `upperarm_l` | `upperarm_l` | idem |
| coude | `lFore` | `lowerarm_l` | `lowerarm_l` | idem |
| poignet | `lHand` | `hand_l` | `hand_l` | idem |
| poing (rênes) | `lHand.localToWorld(FIST = 0, −0.068, 0.012)` | `gripPoint` (moyenne de 4 os) | même moyenne (`index_02`, `middle_02`, `pinky_02`, `middle_01`, noms présents [V]) | `human.js:56`, `:385-394` ; `realistic.js:474-484` |
| base du cou | `neck` | `neck_01` | `neck_01` | idem |
| tête | `head` | `head` | `head` | idem |

Le côté droit est symétrique (`r*`, `*_r`). Il faut aussi exporter les **cibles** de la règle : `hu.anim._P.feet[s].pos`
(cheville visée), `hu.anim._P.hands[s]` (poignet visé) et `hu.anim._P.hips`. On mesure ainsi l'écart cible–résultat de
chaque solveur.

### 2.4 Repères du cheval, dans S

| Grandeur | Source JS |
|---|---|
| étrier affiché (`ironL`/`ironR`) | `h.pjl.irons[k].position` (`pjlHorse.js:906`) |
| ancre d'étrier qui pend | `V.anchorWorld('ironL'/'ironR')` |
| porte-étrivière | `V.anchorWorld('barL'/'barR')` |
| mors | `V.anchorWorld('bitL'/'bitR')` |
| profils `flankL`, `flankR`, `crest` du cheval à cette image | `h.pjl.fit.*` (`pjlHorse.js:777-826`) ; à comparer à ceux vus par le cavalier, décalés d'une image |
| sabots les plus bas, temps du clip de saut, `toeOff`, `foreLand` | comme `rider-audit.mjs:183-192` |

### 2.5 Grandeurs dérivées : les règles en chiffres

Notations : `L = (thighLen + shinLen)·scale`, longueur de jambe propre à chaque rig ; `sg = +1` à gauche.

| Id | Grandeur | Définition | Règle (source) |
|---|---|---|---|
| M1 | écart de la plante au point d'étrier (y, z) | `plante − (stirrupY + (0.012·post + 0.02·two)·s ; stirrupZ − 0.02·two·s)` | R1, R2 (`anim.js:772`) |
| M2 | écart latéral du pied | `sg·plante.x − stirrupX`, avec `≤ xMax` | R4 (`anim.js:776-778`) |
| M3 | dérive de l'étrier quand le bassin monte | plante(t) − plante assise, même scénario | R2 (`riderPosture.test.js:36-41`) |
| M4 | plante – étrier affiché | `|plante − iron|` | R1 (vaut 1,5 cm dans le web, par construction) |
| M5 | longueur d'étrivière | `|bar − (iron + 0,115 en y)|`, et son écart min–max | R2 (`rider-audit.mjs:154-155`) ; dépend aussi du tronc qui bouge sous la selle |
| M6 | portée de la jambe ρ | `|hanche − cheville| / L` | R2 (`seatReach 0.93`, `riseReach 0.95`) |
| M7 | écarts au flanc g_genou, g_tibia35, g_tibia65, g_cuisse50, g_cuisse75 | `sg·p.x − (flankAt(profil vu, p.y) + legClear)`, cuisse −0,02 | R4 (`anim.js:560-569`, `:650-652`) |
| M8 | pénétration de l'axe des os dans le maillage du cheval | 6 rayons, comme `rider-audit.mjs:80-89` et `:131-150` | R4 et R5, contrôle indépendant du profil |
| M9 | hauteur du poignet au-dessus de l'encolure | `poignet.y − crestAt(crest, poignet.z + 0.06)` | R5 (`anim.js:852`) |
| M10 | allonge du bras | `|poignet − épaule| / (upperArmLen + foreArmLen)·s` et angle du coude | R5 (`handReach 0.97`) |
| M11 | angles articulaires | hanche (cou–hanche–genou), genou, cheville (genou–cheville–orteils), coude | `rider-audit.mjs:108-122` |
| M12 | ouverture du genou | direction du genou autour de l'axe hanche–cheville (0 = avant, > 0 = dehors) | `rider-audit.mjs:115-119` |
| M13 | buste, tête | angle bassin→cou (et cou→tête) avec la verticale vraie, dans le plan avant (H) | `rider-audit.mjs:123-126` |
| M14 | assise | `(hips.y − seatToHips)·scale`, et avance du bassin `hips.z·scale` | R7 (`rider-audit.mjs:127-129`) |
| M15 | talon bas, pointe ouverte | tangage et lacet de `cheville → avant-pied` dans S, **moins leur valeur au repos du rig** | R1 (`anim.js:767-769`) |
| M16 | continuité | rotation, d'une image à l'autre, de la direction de chaque segment (cuisse, tibia, pied, bras, avant-bras) dans S, en degrés par image ; sa différence seconde (à-coup) ; déplacement du bassin (cm par image) | R3. Défini sur les directions de segments, donc indépendant des axes locaux des os. `rider-audit` utilise les quaternions locaux (`:161-179`) : on l'exporte aussi, pour continuité avec la v2. |
| M17 | phases du saut | images où `jumpK` passe 0,5 à la montée, son maximum, puis 0,5 et 0,1 à la descente ; repères géométriques équivalents (buste, assise) | R6 (`rider-audit.mjs:408-424`) |
| M18 | mains et rênes | écartement des poignets, longueur mors–poing | R5 |
| M19 | montée et descente | contrôles HM-02a, HM-02b, HM-03, HM-04 et HM-07 aux temps des clés ; trajectoire du bassin et des pieds dans le repère de la séquence | R9 (`horse-mount.mjs:95-191`, `pjl/mount-pose.mjs:3-8`) |

### 2.6 Lecture dans le jeu web (Playwright)

C'est le même moule que `tests/e2e/pjl/rider-audit.mjs` pour les scénarios et les mesures, et que
`scripts/unreal/export-cso-runs.mjs` pour le déterminisme. Rien n'a été écrit ni lancé pour ce document.

- **Lancement.** Chrome installé, sans téléchargement (`node --import ./scripts/unreal/pw-chrome.mjs …`,
  `pw-chrome.mjs:1-9`), sur `?autostart`, au pas fixe de 1/30 s : `g.update(1/30)` puis `g.realism?.update()`
  (`rider-audit.mjs:65-74`).
- **Déterminisme.** `Math.random` à graine, `performance.now` et `Date.now` virtuels (`export-cso-runs.mjs:310-323`).
  Graine fixe, comme les exports CSO (20261118).
  - Une partie de l'aléa est tirée dans `Human` : phase initiale (`human.js:79`) et échelle (`outfits.js:164`).
  - Il faut donc semer **avant** la création du joueur, ou au minimum enregistrer `hu.scale` et l'état initial.
- **Capture des entrées (2.2).** Enrober `hu.animateRiding` et lire `hu.anim` avant l'appel.
- **Capture des sorties (2.3 à 2.5).** Après `g.realism.update()`, dans S.
  - Dans la page, la plante et le poing se lisent avec `bone.localToWorld(new T.Vector3(...))`. La matrice du bone
    contient l'échelle du maillage, ce qui donne les mètres directement.
  - Le modèle réaliste se lit en plus sur `g.realism.bodies.get(hu)` (os glTF par nom), comme rendu visible.
- **Sortie.** Un fichier par scénario dans le format des oracles existants (`unreal/core/tests/oracles/cso_runs`, en-tête
  qui décrit les canaux, puis images, `scripts/unreal/cso-runs-io.mjs`). Canal proposé : `rm` (règles de monte).
  Destination proposée : `unreal/core/tests/oracles/rider_rules/`. Écriture interdite pendant cette préparation.
- **Oracle reparamétré O2 (sans navigateur).** `src/entities/human/anim.js` n'importe que `three` [V]. Le test
  `riderPosture.test.js` l'exécute déjà hors navigateur.
  - On construit un squelette de 25 os dont les offsets de repos sont ceux de la MetaHuman (3.1, 3.2). On lui attache
    `__rig.info` (champs de `rigInfo`, `skeleton.js:62-83`) et `userData.rest` (`humanModel.js:54-57`, `:97`).
  - On rejoue les entrées 2.2. On obtient ce que la règle web aurait produit **avec les proportions de la MetaHuman**.
  - C'est l'oracle d'implémentation : il évite de devoir normaliser.

---

## 3. Correspondance des os

### 3.1 Cavalière : web classique (25) → web réaliste (53) → MetaHuman

Noms MetaHuman relevés dans le moteur installé [V] :
`Engine/Plugins/MetaHuman/MetaHumanCharacter/Content/Female/Medium/NormalWeight/Body/metahuman_base_skel.uasset`, table
de noms lue par `strings` (liste dans `outils/mh_skel_names.txt`). La table de noms ne donne pas la hiérarchie. Celle
indiquée ci-dessous est la hiérarchie standard **[AC]**, à relire dans l'éditeur.

| Web classique | `rider_f.glb` (`realistic.js:17-21`) | MetaHuman | Remarque |
|---|---|---|---|
| `root` | `Root` | `root` | MetaHuman en minuscules |
| `hips` | `pelvis` | `pelvis` | |
| `spine` | `spine_01` | `spine_01` + `spine_02` | Rotation web répartie sur deux os (proposition) |
| `chest` | `spine_03` | `spine_03` + `spine_04` + `spine_05` | idem. La mesure (buste) passe par `pelvis → neck_01` et ne dépend pas de la répartition. |
| `neck` | `neck_01` | `neck_01` (+ `neck_02`) | |
| `head` | `head` | `head` | |
| `hairTail` | (aucun) | (aucun) | Cheveux : sans objet pour l'oracle |
| `lClav` | `clavicle_l` | `clavicle_l` | |
| `lArm` | `upperarm_l` | `upperarm_l` | Ignorés par l'oracle : `upperarm_twist_01/02_l` et les correctifs `upperarm_bck/fwd/in/out/bicep/tricep_l` |
| `lFore` | `lowerarm_l` | `lowerarm_l` | Ignorés : `lowerarm_twist_01/02_l`, `lowerarm_bck/fwd/in/out_l` |
| `lHand` | `hand_l` | `hand_l` | Ignorés : `wrist_inner/outer_l` |
| `lFing` | `middle_01_l` (direction, `realistic.js:27`) | `middle_01_l` ; doigts `*_01..03_l` et `*_metacarpal_l` | Fermeture du poing pilotée à part |
| `lThigh` | `thigh_l` | `thigh_l` | Ignorés : `thigh_twist_01/02_l`, `thigh_bck/fwd/in/out(_lwr)_l` |
| `lShin` | `calf_l` | `calf_l` | Ignorés : `calf_twist_01/02_l`, `calf_knee_l` |
| `lFoot` | `foot_l` | `foot_l` | Ignorés : `ankle_bck/fwd_l` |
| `lToe` | `ball_l` | `ball_l` | Orteils `bigtoe_01..`, `indextoe_…` : sans objet |

- **Os d'IK.** Aucun os `ik_*` n'apparaît dans la table de noms MetaHuman [V]. Les cibles d'IK du Control Rig sont donc
  des contrôles ou des « nulls » du rig, pas des os.
- **Os de torsion et correctifs [AC].** Ils sont pilotés par le post-traitement MetaHuman (pose drivers et RigLogic) ; le
  mécanisme est à vérifier. Ils ne changent pas les positions d'articulations mesurées, mais ils déforment le maillage.
- **Rig d'animation MetaHuman.** `Content/Common/MetaHuman_ControlRig.uasset` (22 Mo) existe [V]. C'est un rig
  d'animation FK/IK : chaînes « FK Point At », « Spine Match IK onto FK ».
  - Il n'est probablement pas adapté à une exécution par image sur iPhone **[AC]**.
  - Proposition : un Control Rig dédié, léger, qui n'applique que les cibles (section 6).
- **Nœuds d'IK du moteur [V].** `FRigUnit_TwoBoneIKSimplePerItem`
  (`Plugins/Animation/ControlRig/Source/ControlRig/Public/Units/Highlevel/Hierarchy/RigUnit_TwoBoneIKSimple.h:207`, avec
  `PoleVector` et `StretchStartRatio` par défaut 0,75). `FRigUnit_PBIK` (`Plugins/Experimental/FullBodyIK/.../RigUnit_PBIK.h`,
  plugin expérimental).
- **Reciblage [V].** `IK_MH_IKRig` et `RTG_MH_IKRig` sont présents (`MetaHumanCharacter/Content/Animation/Retargeting/`).
  Utiles pour la marche native, pas pour les règles.

### 3.2 Points sans os : à calibrer une fois par rig, pose de référence

La plante, le talon et le poing n'ont pas d'os. Ce sont eux qui portent les contacts.

- **Plante.** Web : point fixe du repère du pied (`anim.js:771`).
  - MetaHuman : projeter `ball_l` sur la semelle, puis remonter de 1,2 cm.
  - Depuis la 5.6, la MetaHuman de base est **pieds nus**, alignée sur le sol, sans le décalage de +2 cm des versions
    5.5 et antérieures [V] (page officielle « Base Skeleton Offset Update »). L'épaisseur de semelle des bottes de la tenue
    s'ajoute donc. Elle est à mesurer sur le vêtement **[AC]**.
- **Hauteur de cheville (`ankleY`), recul du talon (`heelBack`), position des orteils (`toe`).** À mesurer sur la
  MetaHuman bottée, pied à plat **[AC]**.
- **Distance ischions–bassin (`seatToHips`, 0,115 chez la femme web).** À mesurer sur la MetaHuman assise : point le plus
  bas des fessiers sous `pelvis` **[AC]**. À défaut, la mettre à l'échelle par la hauteur du bassin.
- **Poing.** Même moyenne de 4 os que `gripPoint`. Les os existent chez la MetaHuman [V].

### 3.3 Cheval PJL : repères du web → repères dans Unreal

**Même cheval [V].** `public/real/horse_pjl.glb` (web) et `unreal/ImportSource/horse_pjl_unreal.glb` (Unreal) ont le même
skin de 419 articulations, mêmes noms et mêmes indices de nœuds :
- `saddle_0168` (nœud 253, enfant de `spine_03_08`) ;
- `stirrup_01_l_0169` → `stirrup_02_l_0170` ;
- `mountpoint_01_0179` ;
- `spine_04_09` ;
- `pelvis_05` ;
- `toes_02_l_0218`, `toes_02_r_0255` ;
- `fingers_02_l_0102`, `fingers_02_r_0137`.

Le web retire le suffixe (`pjl/names.js:1-2`). Unreal garde les noms complets : `StridesHorse.cpp:225` lit `saddle_0168`.

| Repère web | Définition web | Dans Unreal aujourd'hui | Pour l'essai |
|---|---|---|---|
| siège S | ancre `seat` skinnée, recentrage latéral, tangage `spine_04`/`pelvis`, roulis (R0) | `SeatTransform()` = position de `saddle_0168`, orientation de l'acteur, sans tangage ni roulis (`StridesHorse.cpp:216-231`) | Recalculer les ancres comme `anchorWorld` : mêmes os (par nom), mêmes poids, même point local, exportés une fois du web (`tack.anchorLocal`). Transforms d'os par `GetBoneTransform` (`SkinnedMeshComponent.h:1516` [V]) et matrices de référence inverses. Puis recentrage, tangage et roulis comme `pjlHorse.js:829-861`. |
| `ironL/R`, `barL/R`, `bitL/R`, `crest`, `withers`, `kneeL/R` | ancres skinnées (`tack.js:342-360`) | aucune | idem |
| étrier affiché | os `stirL/R` du cheval du jeu, placé à `lToe − 0.015·s` (`horse.js:193-216`) | aucun étrier piloté. Le rig d'origine a ses os `stirrup_01/02_*`, que le web n'utilise pas. | Piloter `stirrup_02_*` (ou un maillage d'étrier) depuis l'avant-pied, comme le web, **ou** le laisser pendre du porte-étrivière. Dans le second cas, M4 devient une vraie mesure. |
| profils `flankL/R`, `crest` | sommets du tronc skinnés à chaque image (`pjlHorse.js:777-826`) | aucun | Niveau A : profils web rejoués. Niveau B : `USkinnedMeshComponent::ComputeSkinnedPositions` ou `GetSkinnedVertexPosition` (`SkinnedMeshComponent.h:1477-1497` [V]) sur les mêmes indices de sommets. Accès CPU au maillage sur iOS **[AC]**. Variante : table précalculée par clip et par phase, exportée du web. |
| `hindDown` | `toes_02_*` à moins de 0,1 m du sol | absent : le cœur n'a que `jumpT` et `lastTurn` (`CsoHorse.h:83-84` [V]) | Lire `toes_02_l_0218` et `toes_02_r_0255` |
| phase de foulée | `h.anim.phase + riderPostOffset` (`human.js:338`) | absente du cœur | À exposer par `AStridesHorse` (phase du clip joué) |
| `bob`, `pitch` du siège | matrice de l'os de selle (`human.js:327-334`) | position seule | Découle du siège S recalculé |
| échelle du cheval | `spine_04` à 1,48 m au-dessus de la semelle des sabots (`pjl/asset.js:144-154` [V]). Le document v2 note un siège à 1,80 m (`cavalier-2026-11-16.md:55`). | échelle 0,01 « ~1,5 m au bassin » (`StridesHorse.cpp:33-41`). Siège « environ 173 cm » (commentaire `:222-224`). | **[AC]** Mesurer `spine_04_09` et `saddle_0168` au-dessus du sol dans Unreal. Si les deux chevaux n'ont pas la même taille, le niveau B ne compare pas la même chose. |

**Cavalier Unreal actuel, pour mémoire [V].** `rider_f_animated` (53 os, `Root`) joue des clips cuits dans Blender
(`export-rider-animations.py:78-97`).
- Cibles fixes, en repère modèle : mains à `(±0.14, 1.02, 0.30…)`, pieds à `(±0.39, 0.292, 0.22 − 0.018·énergie)`.
- `StridesRider.cpp:137-157` le colle au siège avec une inclinaison globale.
- Rien de R1 à R9 n'y est appliqué : ni flanc, ni encolure, ni phases du saut calées sur les posers.

---

## 4. Scénarios d'essai

Tous sont joués au pas de 1/30 s, avec la graine fixe, la même cavalière (échelle enregistrée) et le cheval principal PJL.
Les plans de scénario sont repris de `rider-audit.mjs:286-292` (allures) et `:321-390` (CSO). Chaque scénario est exporté
une fois du web. Il est rejoué en niveau A (entrées web vers le rig Unreal) puis joué en niveau B (cheval et cavalière
Unreal).

| Id | Scénario | Production web | Images | Instants contrôlés |
|---|---|---|---|---|
| E1 | Arrêt, en selle | plan `repos` (45 images) après 20 images de stabilisation | 45 | toutes : ρ, M1, M7, M9, M14 stables, M16 ≈ 0. Respiration présente (pas de pose figée). |
| E1b | Arrêt depuis le galop | plan `arret` (préparation 60, puis 70) | 70 | transition galop → arrêt : M16, M7 |
| E2 | Galop, deux foulées, main gauche puis main droite | plans `galop-gauche` et `galop-droite`, les 80 images enregistrées. Synthèse sur **deux foulées complètes** repérées par `horseGaitPhase` (deux passages par 0). | ≈ 2 × 18 par main (cadence 1,3 à 2,6 Hz, `pjlHorse.js:64`) | à chaque poser du meneur : M1 à M7, M9 ; sur la foulée : ρ max, M16 max. Le galop à droite est le pire cas connu en v2 (3,1 cm de cuisse). |
| E3 | Saut d'un vertical 1,10 m, appel normal | `cso`, cas `v110:6.5:normal` | environ 90 | appel (`jump` passe à 0) ; sommet (`jump` ≈ 0,5) ; poser des antérieurs (`jump` = −1, `landT` = 0) ; poser des postérieurs (`hindDown` vrai) ; retour à 10 % (`jumpK` < 0,1). Contrôles à chaque instant : M1, M3, M6, M7, M9, M10, M13, M14, M17. |
| E3b | Vertical 1,40 m à 9 m/s (galop) | `cso`, cas `v140:9:normal` | environ 90 | idem, avec le clip `jump_gallop` |
| E4 | Montée, côté gauche | séquence `horseMount` (appui E), cheval à l'arrêt | environ 70 (2,3 s) + approche | à chaque clé de `mountKeys` (`horseMount.js:114-156`) : M19, pied dans l'étrier qui pend (HM-02a), main au garrot (HM-02b), jambe droite au-dessus de la croupe (HM-03), dernière image = pose de monte (HM-04) |
| E5 | Descente, côté gauche | séquence `dismountKeys` | environ 66 (2,2 s) | idem, plus la réception au sol (pieds posés, `footTarget`) |
| E6 (facultatif) | Trot enlevé ; virage à droite au galop | plans `trot` et `virage-droite` | 75 / 60 | trot : montée et descente sur le diagonal (R8) ; virage à droite : à-coups et pénétration (pire cas connu v2 : 39° en une image, 2,2 cm) |

### 4.1 Différence de proportions : comment comparer juste

La MetaHuman n'aura ni les longueurs de la cavalière classique (jambe 0,783 m, bras 0,517 m à l'échelle 0,985), ni
celles de `rider_f.glb` (0,804 et 0,465 m). Normaliser par la longueur de jambe ne suffit pas ; il faut traiter trois
familles de grandeurs différemment.

1. **Contacts avec le cheval, en valeur absolue, sans normalisation : M1, M2, M4, M7, M8, M9.** Le cheval, l'étrier,
   le flanc et l'encolure sont les mêmes, quelle que soit la cavalière. Mettre ces écarts à l'échelle de la jambe
   reviendrait à tolérer un pied hors de l'étrier sous prétexte d'une jambe plus longue.
2. **Configuration du corps, rapportée aux proportions de chaque rig : M6, M10, M11, M12, M13, M14.**
   - La règle web travaille en **portée ρ = distance hanche–cheville / L** (seuils 0,93 et 0,95). Elle s'applique telle
     quelle à toute longueur de jambe.
   - L'angle du genou se déduit de ρ et du rapport cuisse/jambe de chaque rig. Il est **très sensible** près de
     l'extension : environ 3,7° par centimètre de portée à 135° (calculé pour la jambe web). Comparer les angles de genou
     entre deux rigs différents sans passer par ρ donnerait des écarts trompeurs.
   - Les positions du genou et du bassin se comparent relativement à la hanche, divisées par L.
   - Le buste, la hanche et le coude se comparent en degrés (sans dimension).
3. **Instants, en valeur absolue (images, secondes) : M17.** Ils sont dictés par le cheval (`jump`, `landT`,
   `hindDown`), pas par le corps.

**Mieux que normaliser : l'oracle reparamétré O2 (2.6).** On rejoue `anim.js`, inchangé, avec les longueurs de la
MetaHuman et les mêmes entrées. On obtient la pose cible exacte que la règle web donnerait à ce corps-là. La comparaison
Unreal / O2 peut alors être serrée (niveau A), sans aucune normalisation.

**Et réduire l'écart à la source [AC].** Dans MetaHuman Creator, les paramètres de corps se règlent et s'épinglent
(Global : « Height » ; régions dont « Legs » ; lectures « Rise » = entrejambe–sol et « Shoulder Height »), avec l'option
« Scale Ranges by Height » [V, page officielle « Body Params Tool »].
- Viser la taille de la cavalière web (1,68 m × échelle) et une hauteur d'entrejambe qui donne `L` ≈ 0,78 à 0,80 m.
- Les écarts résiduels de proportions restent alors de l'ordre du centimètre.
- La page officielle ne donne ni les unités ni les bornes de ces paramètres.

---

## 5. Tolérances défendables

Deux niveaux, pour séparer ce qui relève de **l'implémentation des règles** de ce qui relève du **cheval Unreal**.

- **Niveau A, boucle ouverte.** Le rig Unreal reçoit les entrées web image par image : siège, profils, phases. On compare
  à O2, mêmes proportions. Tout écart vient du portage. Le niveau A peut tourner en test automatique, sans rendu, comme
  les oracles CSO.
- **Niveau B, intégré.** Cheval et cavalière Unreal. On compare aux règles (seuils absolus) et au web O1, en grandeurs
  normalisées (4.1). Le niveau B dépend du siège S Unreal, des profils et de l'échelle du cheval.

| Grandeur | Niveau A (Unreal vs O2) | Niveau B (Unreal vs règles et O1) | Justification |
|---|---|---|---|
| Plante – point d'étrier (M1), y et z | ≤ 1,0 cm | Δy ≤ 3 cm et \|Δz\| ≤ 5 cm par rapport à la plante assise (M3) ; écart au point d'étrier ≤ 2 cm assis | 1 cm = seuil d'acceptation de la règle elle-même (`anim.js:653`) ; 3 et 5 cm = test web `riderPosture.test.js:39-40` |
| Écart latéral du pied (M2) | ≤ 1,0 cm | ≤ `xMax` + 1 cm, soit 4 cm au-delà de la place naturelle | `anim.js:599-610` |
| Plante – étrier affiché (M4) | sans objet | ≤ 2,0 cm | 1,5 cm dans le web par construction, plus l'écart de semelle (3.2) |
| Écarts au flanc (M7) : genou, tibia 35 et 65 %, cuisse 50 et 75 % (−2 cm) | ≥ −1,0 cm, et \|Unreal − O2\| ≤ 1,0 cm | ≥ −1,0 cm, avec 3 images consécutives au plus entre −1 et −2 cm aux changements de pied | Seuil de la mémoire (`anim.js:647-653`). Le web v2 garde 1,4 à 3,1 cm transitoires en virage ou changement de pied, et ETAT v3 note 1,7 cm de cuisse. Exiger mieux que le web est possible mais doit être annoncé. |
| Pénétration de l'axe des os (M8) | sans objet | ≤ max(1,0 cm ; valeur web O1 du même scénario + 0,5 cm) | méthode des 6 rayons, identique au web (`rider-audit.mjs:80-89`) |
| Poignet au-dessus de l'encolure (M9) | ≥ 9,0 cm et \|Unreal − O2\| ≤ 1,0 cm | ≥ 9,0 cm | `handClear 0.10`, moins 1 cm (`riderPosture.test.js:70`) |
| Allonge du bras et coude (M10) | ≤ 0,97 et coude ±2° vs O2 | coude ≤ 155° | 151,7° à 0,97 ; test web < 160° ; audit v2 maximum 152° |
| Portée de la jambe ρ (M6) | ±0,005 vs O2 | ≤ 0,935 assis ; ≤ 0,955 hors de la selle | `seatReach` et `riseReach`, +0,005 de jeu de solveur |
| Genou, hanche, cheville (M11) | ±2° vs O2 | genou : se déduit de ρ (pas de seuil propre) ; hanche ±6° vs O1 ; cheville ±6° vs O1 | 2° ≈ 0,5 cm au genou (calculé). En B, les proportions diffèrent (4.1). |
| Ouverture du genou (M12) | ±3° vs O2 | ±8° vs O1, sans genoux en ailes (genou à moins de 1 cm au-delà de la cheville) | `anim.js:573-578` |
| Buste (M13) | ±1° vs O2 | ±3° assis, ±5° à l'obstacle, vs O1 | 1° de buste ≈ 0,9 cm de déplacement du cou sur 0,5 m |
| Assise (M14) | ±0,5 cm vs O2 | assis : \|Δ\| ≤ 0,4 cm au pas ; lever ≤ valeur O1 + 1 cm | `riderPosture.test.js:55` (0,004) |
| Talon bas, pointe ouverte (M15) | ±2° vs O2 | ±4° vs O1 | 8 à 14° de talon visés : 4° reste lisible |
| Continuité (M16) | max par image ≤ O2 + 2°, à-coup ≤ O2 + 2° | ≤ 15° par image en régime établi, hors image de départ ; ≤ O1 + 5° en transition | cible v3 (ETAT.md) ; v2 : jusqu'à 39° en virage à droite |
| Phases du saut (M17) | ±1 image (33 ms) | ±2 images | lissage de `jumpK` à 14/s (constante de temps ≈ 71 ms ≈ 2 images) |
| Montée et descente (M19) | positions des clés ±1 cm vs O2 | seuils HM : plante–étrier < 6 cm, main–garrot < 6 cm, jambe opposée ≤ 2 cm, rattachement < 1 cm et < 1°, saut < 0,15 m par image, durées 1,5 à 2,5 s | `horse-mount.mjs:216-224` |

**Lecture.** Le niveau A prouve que la règle est portée. Le niveau B prouve qu'elle tient sur le cheval Unreal. Aucun des
deux ne prouve le réalisme équestre (`riderPosture.test.js:1-3`, `rider-audit.mjs:4`). Celui-ci reste au jugement visuel
de Julien, sur la page côte à côte.

---

## 6. Risques

1. **Référence v3 jamais mesurée [V].** Il faut produire l'oracle v3 avant toute comparaison. Les chiffres v2 de l'annexe
   ne sont pas la cible.
2. **Le rendu web visible ne respecte pas exactement les règles [V].** Les règles sont appliquées sur le squelette de
   25 os. Le corps réaliste recopie les rotations avec une jambe d'environ +2 cm et un bras d'environ −5 cm (constat 2).
   - Comparer la MetaHuman au rendu réaliste ferait passer pour des fautes des écarts qui viennent du web lui-même.
   - L'oracle se lit sur le classique ; l'écart du rendu réaliste est à mesurer et à montrer à Julien **[AC]**.
3. **Siège Unreal différent du web [V].** Position de `saddle_0168`, sans recentrage, sans tangage, sans roulis
   (`StridesHorse.cpp:216-231`). Le niveau B échouera tant que R0 n'est pas porté. Le niveau A n'en dépend pas.
4. **Taille du cheval peut-être différente [AC].** Web : `spine_04` à 1,48 m. Unreal : échelle 0,01, réglée « au
   bassin ». À mesurer avant le niveau B.
5. **Entrées absentes du cœur Unreal [V].** Phase de foulée, `landT`, `hindDown`, `bob`, `pitch`, profils de flanc et
   d'encolure. Le cœur n'expose que `jumpT` et `lastTurn` (`CsoHorse.h:83-84`).
6. **Profils de flanc sur iPhone [AC].** Le web skinne quelques centaines de sommets sur le CPU à chaque image. Dans
   Unreal, cela demande l'accès CPU au maillage (mémoire) et les fonctions de `SkinnedMeshComponent.h:1477-1500`.
   Alternative déterministe et peu coûteuse : tables de profils par clip et par phase, exportées du web. Les clips sont
   les mêmes.
7. **Solveur différent.**
   - `ik2` du web plafonne la portée à 0,9995 et a sa propre convention de pôle (`anim.js:75-102`).
   - `TwoBoneIKSimple` étire par défaut au-delà de 75 % de la portée (`StretchStartRatio 0.75` [V]). **L'étirement doit
     être coupé.**
   - Pour le pôle, passer la position du genou calculée comme `kneeOf` (`anim.js:530-540`), pas une direction.
8. **État mémorisé d'une image à l'autre.** `hugMemory`, filtres exponentiels, `bobAvg`, `diag`, `hd` et `FLANK_RELAX`
   demandent un état persistant et des dichotomies (14 itérations).
   - **Recommandation :** porter `riding()` en C++ pur (module cœur, testable hors moteur comme `test_core.cpp`), qui
     calcule les cibles. Le Control Rig ne fait qu'appliquer les IK.
   - C'est aussi ce qui rend le niveau A testable en intégration continue, sans éditeur.
9. **Décalage d'une image.** Le cavalier lit le profil de l'image précédente (`human.js:363-364`). Un oracle qui
   enregistrerait le profil courant du cheval produirait de faux écarts de 2 à 3 cm aux changements de pied. Il faut
   enregistrer le profil vu par la règle (2.2).
10. **Déterminisme.** Échelle aléatoire du personnage et phase initiale tirées à la création. La graine doit être posée
    avant, ou l'état enregistré.
11. **Fondu de 0,45 s après la mise en selle** (`anim.js:960-973`). Les 14 premières images d'un scénario de monte
    sont lissées. Il faut les exclure, ou reproduire le lissage.
12. **Plante et semelle.** MetaHuman est pieds nus depuis la 5.6 [V]. Les bottes ajoutent une semelle, à calibrer, sinon
    1 à 2 cm d'écart systématique sur M1 et M4.
13. **Os de torsion et correctifs MetaHuman [AC].** S'ils ne sont pas évalués dans un test sans rendu, les positions
    d'articulations ne changent pas, mais le maillage diffère du jeu. La pénétration M8 se mesure sur les axes d'os,
    donc elle n'en dépend pas.
14. **Plugin MetaHuman Creator [V].** `MetaHumanCharacter.uplugin` : `"IsBetaVersion": true`,
    `"EnabledByDefault": false`. L'activer modifie le `.uproject` : décision à prendre plus tard, pas pendant cette
    préparation. Certaines étapes du Creator peuvent demander une connexion Epic **[AC]**. Licence et publication App
    Store : hors de ce document **[AC]**.
15. **Dispersion des mesures [V].** `cavalier-2026-11-16.md:199` : les extrêmes des virages varient d'un passage à
    l'autre. Avec la graine et les horloges virtuelles, deux exports doivent être identiques octet pour octet, comme
    pour les oracles CSO. C'est à vérifier au premier export **[AC]**.

---

## 7. Ordre de travail proposé (après la série T9 à T12)

1. Exporter l'oracle v3 du web : scénarios E1 à E5, entrées 2.2, sorties 2.3 à 2.5, avec double export identique.
2. Créer la MetaHuman, sous réserve de l'activation du plugin. Relever ses longueurs et points calibrés (3.2). Générer
   O2.
3. Porter `riding()` en C++ et écrire le Control Rig minimal (deux IK de jambe, deux IK de bras, rotations du tronc et du
   pied). Faire passer le niveau A.
4. Porter le siège R0, les ancres et les profils, et `hindDown`. Mesurer l'échelle du cheval. Faire passer le niveau B.
5. Page côte à côte web / Unreal aux instants de la section 4, avec les mesures incrustées, pour le jugement de Julien.

---

## Annexe A. Ordres de grandeur v2 (pas la cible v3)

Source : `docs/humains-v2/audit-allures.json` et `audit-cso.json` (cavalière f, échelle 0,985 ; `stirrupX 0.4016`,
`stirrupY −0.64`, `stirrupZ 0.101`).

| Cas | Buste (°) | Genou min–max (°) | Coude max (°) | Assise min / max (m) | Pénétration max (m) | Écart d'étrivière (m) | Rotation max / image (°) |
|---|---|---|---|---|---|---|---|
| repos | 2 | 134–135 | 129 | 0 / 0 | 0 | 0,001 | 0,1 |
| galop à droite | 2 à 23 | 118–142 | 132 | −0,03 / −0,001 | 0,031 (cuisse) | 0,156 | 17,3 |
| saut, galop | 17 à 58 | 130–142 | 152 | −0,002 / 0,024 | 0 | 0,068 | 35,4 |
| CSO v110, appel normal | 13 à 56 | 120–142 | 152 | −0,03 / 0,024 | 0 | 0,089 | 25 |

Phases du saut, CSO v110, appel normal (images) :

| Événement | Image |
|---|---|
| appel | 41 |
| cavalier à 50 % de la position d'obstacle | 44 |
| maximum de la position d'obstacle | 51 |
| poser des antérieurs | 58 |
| retour à 50 % | 69 |
| poser des postérieurs | 82 |
| retour à 10 % | 87 |

L'écart de longueur d'étrivière va jusqu'à 15,6 cm. Il mesure le tronc qui bouge sous la selle (porte-étrivière skinné),
pas une faute de la règle : d'où M3 (plante dans S) comme critère, et M5 en simple information.

## Annexe B. Sources officielles consultées

- [Base Skeleton Offset Update (Epic)](https://dev.epicgames.com/documentation/en-us/metahuman/base-skeleton-offset-update) :
  suppression du +2 cm depuis la 5.6, MetaHuman pieds nus alignée sur le sol.
- [MetaHuman Creator Body Params Tool (Epic)](https://dev.epicgames.com/documentation/metahuman/metahuman-creator-body-params-tool-in-unreal-engine?lang=en-US) :
  paramètres Global (« Height »…), régions (« Legs »…), lectures « Rise » et « Shoulder Height », épinglage, « Scale
  Ranges by Height ».
- [Assets Overview (Epic)](https://dev.epicgames.com/documentation/metahuman/assets-overview) : emplacement de
  `metahuman_base_skel`. Le nom et le dossier `Female/Medium/NormalWeight/Body` ont été vérifiés dans le moteur installé.
