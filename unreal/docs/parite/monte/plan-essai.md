# Plan d'essai : cavalière MetaHuman montée par les règles du web (Control Rig), prouvée par oracle

> **Voie A choisie par Julien le 20/11/2026, voie B (MetaHuman) écartée pour l'instant.**
> Copie versionnée le 20/11/2026 du document de préparation ; le texte sous cet encadré est inchangé. Phase en cours :
> règles de monte du web v3 portées en C++ dans StridesCore et prouvées par oracle (étapes 1 à 4), puis appliquées par
> Control Rig à la cavalière actuelle (étapes 5 à 7). Adaptations de cette phase : travail sur la branche locale
> `claude/monte-voie-a`, fusionnée dans `claude/unreal-port` après la tranche CSO ; comptes rendus dans
> `unreal/docs/parite/monte/` (et non `unreal/docs/essai-metahuman/`) ; étape 1 sans Unreal Build Tool ni UnrealEditor
> (portes G1, G5, G6, G7 seulement, `scripts/unreal/monte-base.py`). Les outils d'inspection cités
> (`essai-metahuman/outils/`) sont restés dans le dossier de travail de la préparation, non versionnés.

Rédigé le 20/11/2026 (Europe/Paris), à exécuter dès que la machine est libre (série T9 à T12 du CSO terminée et commitée).
Base : dépôt `grand-tour-unreal`, branche `claude/unreal-port`, HEAD `3e188b91`. Moteur UE 5.8.4, Mac mini M2 16 Go.
Entrées : `faisabilite.md` et `oracle-monte.md` (même dossier), `unreal/docs/parite/README.md`, `unreal/docs/parite/cso-ecarts.md`,
`unreal/docs/PARITE.md` (tranche b). Rien n'a été lancé, installé ni écrit dans le dépôt pour rédiger ce plan.

Notation :
- **[V]** vérifié : fichier:ligne, commande, ou page officielle citée dans les deux documents d'entrée.
- **[AC]** à confirmer au moment de l'exécution.
- **[P]** seuil proposé : c'est une décision à valider, pas un fait mesuré.

---

## 0. En bref

L'essai répond à une question de Julien : une cavalière créée nativement dans Unreal (MetaHuman), habillée comme dans le web et
montée selon les règles du web v3, est-elle meilleure que le modèle importé du web, et à quel coût ?

Il avance sur deux voies.
- **Voie A, sans compte ni téléchargement (étapes 1 à 7).** Oracle des règles exporté du web, règles portées en C++ et
  appliquées par Control Rig sur la cavalière actuelle (`rider_f_animated`). Cette voie est utile même si MetaHuman est
  abandonné.
- **Voie B, MetaHuman (étapes 8 à 15).** Elle exige trois gestes de Julien : place disque, Core Data, connexion Epic.

Rien ne change dans le jeu par défaut. Les deux cavalières nouvelles passent par une option de ligne de commande
(`-StridesRider=regles` ou `-StridesRider=mh`). Le verdict final reste à Julien : réalisme équestre sur la page côte à côte,
et décision de production.

---

## 1. Invariants (valables à chaque étape)

1. **Rien de payant.** Aucun achat, abonnement ou contenu Fab payant. Tom ne crée aucun compte et ne se connecte à aucun
   compte. La connexion Epic est faite par Julien seul (étape 9).
2. **Le web ne change jamais.** Contrôle à chaque commit : `git diff --quiet HEAD -- src public tests` (code 0).
3. **Le jeu par défaut ne change pas.** Le cavalier par défaut reste `rider_f_animated` avec ses clips cuits, et les captures
   versionnées du CSO restent identiques. La seule exception est une recapture voulue, annoncée dans le commit.
4. **Pixel Streaming jamais dans iOS.** `PlatformAllowList: ["Mac"]` reste en place
   (`StridesGrandTour.uproject`, plugin `PixelStreaming2` [V]). Toute archive iOS produite par l'essai est contrôlée :
   `rg -c -i pixelstreaming` sur l'archive doit renvoyer 0.
5. **Dépôt.**
   - Commits sur `claude/unreal-port` uniquement. Aucune autre branche, aucune fusion, aucun push sans demande de Julien.
   - Chaque commit est cohérent seul : code, oracles, inventaire, et `PARITE.md` régénéré.
6. **Gros binaires hors git.** Le contenu `Content/` est versionné en git simple, sans LFS (834 `.uasset` suivis, `git lfs
   ls-files` vide [V]). Les assets MetaHuman et les sorties du Creator restent donc ignorés par git pendant l'essai :
   - le projet atelier `unreal/EssaiMetaHuman/` (tout sauf `.uproject`, `Config/` et scripts) ;
   - `unreal/StridesGrandTour/Content/Essai/`.

   On les ajoute au `.gitignore` à l'étape 8. On ne versionne que ce qui permet de les régénérer : scripts, paramètres,
   mesures. La publication des assets eux-mêmes est une décision de Julien en fin d'essai.
7. **Une seule instance d'UnrealEditor à la fois** [V README §3]. Un seul assemblage MetaHuman par processus, à cause de la
   fuite mémoire signalée en 5.8.4 [AC, faisabilité §5].
8. **Environnement de chaque commande moteur** [V README:8-10] : `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
   et `UE="/Users/Shared/Epic Games/UE_5.8"`.
9. **Correction apportée à `oracle-monte.md` §6 risque 7.** `TwoBoneIKSimple` n'étire **pas** par défaut :
   `bEnableStretch = false` (`RigUnit_TwoBoneIKSimple.h:59` et `:220` pour `PerItem` [V]). `StretchStartRatio 0.75` ne
   s'applique que si l'étirement est activé. Le Control Rig de l'essai le laisse désactivé et le vérifie par un test
   (étape 6).

---

## 2. Architecture

```
jeu web v3 (src/, inchangé)
  └─ export-rider-rules.mjs (Playwright, pas 1/30, graine) ──► O1 : entrées de la règle, articulations du squelette classique (25 os),
                                                                cibles, repères du cheval, état du mélangeur PJL, rendu réaliste (info)
anim.js inchangé, hors navigateur
  └─ rider-rules-o2.mjs (vite-node) + rigs/<rig>.json ───────► O2 : ce que la règle web produit avec les longueurs d'un autre corps
StridesCore (C++20, sans type Unreal)
  └─ RiderRules : entrées (human.js:317-383) + riding() + ik2 ─► ctest « rider » : identique à O2 au dixième de millimètre
StridesGrandTour (module de jeu)
  ├─ UStridesHorseTack : siège S, ancres, profils de flanc et d'encolure, hindDown, phase ─► Strides.Parite.HorseSeat
  └─ UStridesRiderRig : RiderRules → cibles → Control Rig (2 IK de jambe, 2 de bras, bassin, colonne, pieds)
        ├─ cavalière actuelle (option regles) ─► Strides.Parite.RiderRules (niveau A), Strides.Parite.RiderOnHorse (niveau B)
        └─ MetaHuman (option mh)              ─► Essai.Monte.RiderRules (niveau A), Essai.Monte.OnHorse (niveau B)
Projet atelier unreal/EssaiMetaHuman (Creator, Python, cloud) ─► MetaHuman assemblée « Optimized Low » migrée dans Content/Essai/
```

Principes repris du banc CSO [V README, PARITE « Méthode ») :
- tout est exporté par script, jamais recopié ;
- la logique pure va dans `StridesCore` et se prouve par `ctest` ;
- le visible se prouve par capture côte à côte, en 844 × 390, même pose, même caméra.

Les grandeurs M1 à M19 sont calculées **par un seul script** (`scripts/unreal/rider-rules-metrics.mjs`), pour O1, O2 et
les sorties Unreal exportées au même format. Les métriques ne peuvent donc pas diverger entre le web et Unreal.

Préfixes de tests moteur :
- `Strides.*` pour ce qui ne dépend que d'assets versionnés. Ces tests entrent dans la porte habituelle
  `Automation RunTests Strides`.
- `Essai.Monte.*` pour ce qui dépend des assets MetaHuman non versionnés. La porte habituelle ne les voit pas, et elle
  reste verte sur une copie neuve du dépôt.

---

## 3. Portes de non-régression

À passer en fin de toute étape qui touche le dépôt. Les valeurs de référence sont relevées à l'étape 1.

| Porte | Commande [V README §2, §4, §5] | Attendu |
|---|---|---|
| G1 cœur | `cmake -S unreal/core -B build/core && cmake --build build/core && ctest --test-dir build/core --output-on-failure` | 0 échec ; nombre de vérifications ≥ base |
| G2 compilation | `"$UE/Engine/Build/BatchFiles/Mac/Build.sh" StridesGrandTourEditor Mac Development -project=… -WaitMutex` | 0 erreur, 0 avertissement nouveau |
| G3 moteur | `UnrealEditor … -ExecCmds="Automation RunTests Strides; Quit" -unattended -nullrhi …` | tous `Result={Success}`, nombre ≥ base |
| G4 mutations | les `mutations-cso-*.py` dont un source est touché, plus `mutations-rider-rules.py` | code 0 |
| G5 captures | `python3 scripts/unreal/parite-montage.py unreal/docs/parite/cso` ; `shasum` de `unreal/docs/parite/cso/*.png`, `Saved/Screenshots/Strides/` et `Saved/Screenshots/MacEditor/` | code 0 ; empreintes identiques à la base |
| G6 inventaire | `python3 scripts/unreal/build-parite.py` | code 0 ; `PARITE.md` committé avec l'inventaire |
| G7 web intact | `git diff --quiet HEAD -- src public tests` et `npx vitest run tests/unit/riderPosture.test.js` | code 0 ; test vert |

G4 complète (environ 25 min pour `mutations-cso-controls.py` [V README:199]) n'est due qu'à l'étape 1 et aux étapes qui
touchent un source muté.

---

## 4. Étapes

Chaque étape tient dans une session d'agent. Elle se termine par les portes indiquées et un commit, sauf mention contraire.
Tous les chemins sont relatifs à la racine du dépôt. Les comptes rendus de l'essai vont dans `unreal/docs/essai-metahuman/`
(versionné).

### Étape 1. Préflight et ligne de base (Tom)

- **Préalable.**
  - T9 à T12 commitées.
  - `pgrep -lf 'UnrealEditor|UnrealBuildTool|ShaderCompileWorker|Build.sh'` ne renvoie rien. Seul `UnrealEditorServices`
    est toléré : il tourne aujourd'hui et n'est pas l'éditeur [V].
  - `git status` ne montre que `.claude/launch.json`.
- **Faire.**
  - Passer G1 à G7 au complet.
  - Relever : versions (`Build.version`, Xcode), `df -h /Users/julien` (13 Gio libres le 20/11/2026 [V]), mémoire, et
    tailles de `unreal/StridesGrandTour/Builds/*` (598 Mo, 855 Mo et 964 Mo le 20/11/2026 [V]).
- **Créer.**
  - `unreal/docs/essai-metahuman/README.md` : journal de l'essai, commandes exactes, constats.
  - `unreal/docs/essai-metahuman/base.json` : compteurs G1 et G3, empreintes G5, disque.
- **Accepter.** Toutes les portes sont vertes à la base.
- **Arrêt.** Une porte rouge à la base arrête l'essai : ce n'est pas à l'essai de réparer la série T. On le signale.

### Étape 2. Oracle O1 : les règles v3 exportées du web (Tom)

- **Créer `scripts/unreal/export-rider-rules.mjs`.**
  - Il suit le même moule que `export-cso-runs.mjs` et `rider-audit.mjs` : Chrome du Mac par `pw-chrome.mjs`, pas fixe de
    1/30 s, `Math.random` à graine 20261118, horloges virtuelles, animation du cheval remise à neuf.
  - **Graine posée avant la création du joueur**, à cause de l'échelle et de la phase tirées dans `Human`
    (`outfits.js:164`, `human.js:79` [V oracle §2.6]).
  - **Chaque scénario part de la mise en selle.** L'état interne est neuf et toutes les images sont exportées. La fenêtre
    de mesure est écrite dans l'en-tête, après le fondu de 0,45 s (`anim.js:960-973` [V]).
- **Format.** C'est celui de `cso-runs-io.mjs` [V] : en-tête, puis une image par ligne. Schéma
  `strides.oracle.rider_rules/1`, sortie `unreal/core/tests/oracles/rider_rules/` (`index.json` et un fichier par scénario).
- **Canaux.**
  - `in` : entrées vues par la règle, capturées avant `orig(dt)` dans l'enrobage de `hu.animateRiding` (oracle §2.2).
    Profils de flanc pris tels que le cavalier les voit, avec une image de retard (risque 9).
  - `cl` : articulations du squelette classique dans S (oracle §2.3).
  - `tg` : cibles (`_P.feet`, `_P.hands`, `_P.hips`).
  - `hz` : repères du cheval, profils bruts de l'image courante, saut (oracle §2.4).
  - `mx` : état du mélangeur PJL, c'est-à-dire clips, poids et temps. Les noms des champs sont à lire dans `pjlHorse.js`
    et `pjl/view.js` [AC]. Unreal en a besoin pour poser le cheval à l'identique.
  - `rz` : articulations de `rider_f.glb`. C'est le rendu visible, pour information.
  - `dg` : état interne `_ride`.
- **Scénarios.**
  - Obligatoires : E1 (arrêt, 20 + 45 images), E1b (arrêt depuis le galop), E2g et E2d (galop à gauche et à droite,
    80 images), E3 (`v110:6.5:normal`) et E3b (`v140:9:normal`).
  - Exportés pour plus tard, hors acceptation de l'essai : E4 et E5 (montée et descente), E6 (trot, virage à droite).
  - Plans repris de `rider-audit.mjs:286-292` et `:321-390` [V].
- **Option `--anchors`.** Elle écrit `unreal/StridesGrandTour/Content/Data/pjl_tack_anchors.json` :
  - pour chaque ancre (`seat`, `barL/R`, `ironL/R`, `crest`, `withers`, `kneeL/R`, `bitL/R`) : os par nom, poids et point
    local en espace de liaison, lus dans la page (`pjl/view.js:106-124`, `pjl/tack.js:342-360` [V]) ;
  - les indices de sommets et les bandes des profils de flanc et d'encolure (`pjlHorse.js:774-826` [V]).
- **Créer `scripts/unreal/rider-rules-metrics.mjs`.** Il calcule M1 à M19 à partir de n'importe quel fichier au format,
  et produit `unreal/docs/essai-metahuman/v3-mesures.md` et `.json`.
  - C'est la **première mesure jamais faite de la v3** (constat 1).
  - Il mesure aussi l'écart entre le rendu réaliste et les règles (constat 2) : botte contre plante, poignet contre
    `handClear`, en cm.
- **Accepter.**
  - Deux exports successifs identiques à l'octet (`shasum` de tous les fichiers).
  - M4 = 0,015 m ± 1e-6 à toutes les images en selle. C'est vrai par construction (`horse.js:193-216` [V]), et ce test
    prouve que l'export lit les bons os aux bonnes images.
  - Le plus gros fichier fait moins de 20 Mo [V README:44-45].
  - `v3-mesures.md` donne, pour chaque scénario, le minimum et le maximum de M1 à M17, et l'écart rendu–règles.
  - G7.
- **Ensuite.** Julien décide de la longueur d'étriers (J3), chiffres v3 en main.

### Étape 3. Oracle O2 : la règle web rejouée avec d'autres proportions (Tom)

- **Créer.**
  - `scripts/unreal/rider-rules-o2.mjs` (vite-node). Il importe `src/entities/human/anim.js` et `skeleton.js`
    **inchangés** : `anim.js` n'importe que `three` [V oracle §2.6]. Il construit un squelette de 25 os aux offsets de
    repos du rig donné, avec `__rig.info` et `userData.rest`, puis rejoue le canal `in` et écrit `tg` et `cl`.
  - `scripts/unreal/rig-from-glb.py` : lecteur GLB sans dépendance, sur le modèle de `outils/glb_bones.py`. Il écrit
    `unreal/core/tests/oracles/rider_rules/rigs/web_classic.json` et `rider_f.json` : longueurs, repos, `ankleY`, `toe`,
    `heelBack`, `seatToHips`, poing.
  - Option `--fit stirrupY=…`, pour appliquer la longueur choisie par Julien (J3) sans toucher au web.
- **Sortie.** `unreal/core/tests/oracles/rider_rules_o2/<rig>/<scénario>.json`.
- **Accepter.**
  - O2 avec le rig `web_classic` à l'échelle enregistrée reproduit O1 (`cl` et `tg`) à 1e-6 m et 1e-6 rad près, à
    toutes les images de tous les scénarios. C'est la preuve que les entrées exportées sont complètes : un écart désigne
    une entrée manquante, à corriger dans l'exporteur.
  - Deux exécutions sont identiques à l'octet.
  - O2 `rider_f` est produit.

### Étape 4. Règles portées en C++ dans StridesCore (Tom)

- **Créer.**
  - `unreal/StridesGrandTour/Source/StridesCore/Public/StridesCore/RiderRules.h` et `Private/RiderRules.cpp`. Ils portent
    ligne à ligne `ik2`, `kneeOf`, `hugFlank`, `hugMemory`, `riding` et l'application des poses (`anim.js:75-110`,
    `:485-925` [V]), plus la préparation des entrées de `human.js:317-383` : `FLANK_RELAX`, `FLANK_LEAD`, bob, tangage,
    `jump`, `landT`, `hindDown`.
  - Test `testRiderRules` dans `unreal/core/tests/test_core.cpp`, avec `run("rider", …)`, et ajout du source à
    `unreal/core/CMakeLists.txt`.
  - `scripts/unreal/mutations-rider-rules.py`, sur le modèle des scripts de mutations existants.
- **Modifier `scripts/unreal/export-data.mjs`.** Il exporte `RIDE`, `RIDER_FIT`, `RIDER_SEAT`, `FLANK_RELAX`, `FLANK_LEAD`,
  `LEG_THICK`, `HIND_DOWN` dans `Content/Data/rider_rules.json`. Rien n'est recopié à la main.
- **Accepter (G1).**
  - Pour les rigs `web_classic` et `rider_f`, tous scénarios : articulations et cibles C++ contre O2 ≤ 0,1 mm et
    ≤ 1e-4 rad [P]. C'est 100 fois plus strict que le niveau A ; la marge couvre les écarts de dernier bit des `sin` et
    `atan2` entre V8 et la libm Apple, amplifiés par les dichotomies [AC].
  - État interne (`post`, `two`, `jumpK`, `rel`) ≤ 1e-6.
  - Entrées C++ calculées depuis `hz` brut, comparées au canal `in` : ≤ 1e-6 m.
- **Accepter (G4).** Au moins 30 mutations, une par constante et par branche (`HUG_OPEN`, `FOOT_RELAX`, `seatReach`,
  `handClear`, `foldIn`, `holdMax`, ordre genou puis pied, retard d'une image…). Chacune est détectée, ou déclarée dans
  `ATTENDUES` avec sa raison. Code 0.
- **Coût.** Banc de 10 000 images pour une cavalière, compilé en Release : médiane ≤ 0,22 ms par image [P]. C'est le haut
  de la fourchette mesurée dans le web v2 (0,09 à 0,22 ms, `docs/cavalier-2026-11-16.md:129` [V]). La valeur est notée.

### Étape 5. Le cheval Unreal fournit ce que la règle lit (R0) (Tom)

- **Mesurer d'abord** `spine_04_09` et `saddle_0168` au-dessus du sol dans Unreal, et comparer au web (`spine_04` à 1,48 m,
  `pjl/asset.js:144-154` [V]).
  - **Si l'écart dépasse 1 cm, on ne change pas l'échelle du cheval** : elle sert au CSO déjà prouvé. On déclare l'écart
    dans `README.md`. Le niveau B se juge alors sur les seuils absolus des règles, et non contre O1, pour les grandeurs
    qui dépendent du cheval.
- **Créer `SG/StridesHorseTack.cpp` et `SGh/StridesHorseTack.h`** (composant d'`AStridesHorse`).
  - Ancres skinnées comme `anchorWorld`, à partir de `pjl_tack_anchors.json` : `GetBoneTransform` et matrices de référence
    inverses.
  - Siège S : recentrage `damp 12`, tangage `spine_04`/`pelvis` `damp 18`, roulis (`pjlHorse.js:829-861` [V]).
  - Profils de flanc et d'encolure par `GetSkinnedVertexPosition` sur les sommets listés (`SkinnedMeshComponent.h:1477`
    [V]). L'accès CPU au maillage sur iOS est [AC] ; repli : tables par clip et par phase exportées du web.
  - `hindDown` (`toes_02_l_0218`, `toes_02_r_0255` à moins de 0,1 m), phase de foulée, bob et tangage.
  - **`SeatTransform()` existant inchangé.** Le jeu par défaut ne lit pas encore ce composant.
- **Créer le test** `Strides.Parite.HorseSeat` dans `SG/Tests/StridesRiderTests.cpp`. Il pose le cheval Unreal au clip et
  au temps du canal `mx`, sur des images où un seul clip pèse au moins 0,99. Il compare les ancres et les profils au canal
  `hz`, après conversion `X = 100·z`, `Y = −100·x`, `Z = 100·y` [V oracle §2.1].
- **Accepter.**
  - Ancres ≤ 0,5 cm ; orientation du siège ≤ 0,5° ; chaque tranche de profil ≤ 0,5 cm ; `hindDown` à la même image ±1
    [P].
  - Coût du composant, mesuré par `FPlatformTime` dans le test : ≤ 0,1 ms par image [P]. Au-delà, on passe aux tables.
  - G1, G2, G3, G5 et G6. Ligne d'inventaire `cheval.assise-cavalier` mise à jour (preuve, écart).

### Étape 6. Control Rig de monte sur la cavalière actuelle, option `regles` (Tom)

C'est l'option qui réduit le risque, recommandée par `faisabilite.md` §7 : les règles sont prouvées sans dépendre de
MetaHuman.

- **Créer `scripts/unreal/build-rider-controlrig.py`.** Il construit le graphe avec `RigVMController`, sur le modèle de
  `ControlRigWorkflows/workflow_two_bone_ik.py` [V].
  - Deux `TwoBoneIKSimplePerItem` de jambe (`thigh`, `calf`, `foot`) et deux de bras (`upperarm`, `lowerarm`, `hand`).
  - `bEnableStretch` à faux, vérifié. Pôle en **position** (`PoleVectorKind` à Location), égal au genou calculé comme
    `kneeOf`.
  - Bassin, colonne répartie, orientation du pied (talon bas, pointe ouverte), fermeture des doigts.
  - Table de correspondance des os dans le script (oracle §3.1).
  - Asset `/Game/Characters/Riders/Rig/CR_StridesMonte_riderF`.
- **Créer `SG/StridesRiderRig.cpp` et `.h`.** À chaque image : entrées depuis `UStridesHorseTack`, appel de `RiderRules`,
  conversion de S vers le repère de l'acteur, variables du Control Rig.
- **Modifier `StridesRider.cpp`.** Option `-StridesRider=regles` : en selle, clips cuits coupés et Control Rig actif. Sans
  l'option, le comportement est identique.
- **Créer le test** `Strides.Parite.RiderRules` (niveau A dans le moteur). Il rejoue les entrées O2 `rider_f` image par
  image, évalue le rig sur le maillage sans rendu, lit les articulations dans S et compare à O2.
- **Accepter.**
  - Niveau A (tableau du §5) sur E1, E1b, E2g, E2d, E3 et E3b.
  - Mutations du composant détectées : signe de Y, pôle en direction, étirement activé, retard d'une image supprimé.
  - G1 à G6 ; G5 prouve que les captures du CSO n'ont pas bougé.
  - Inventaire : `cavaliere.jambes-etriers`, `cavaliere.mains-renes`, `cavaliere.saut`, `cavaliere.flanc`,
    `cavaliere.amorti-dos`, `cavaliere.suspension-galop`. Elles restent « partiel » tant que l'option n'est pas le
    comportement par défaut, avec l'écart écrit : « prouvé derrière `-StridesRider=regles` ».

### Étape 7. Mode de mesure du coût, et ligne de base (Tom, rendu GPU réel, session ouverte)

- **Modifier `SG/StridesShots.cpp` et `.h`** : mode `-StridesShots=perf`.
  - Scène : piste du Pôle, en 844 × 390, caméra de concours. Le cheval rejoue E1 (arrêt) puis E2g (galop).
  - Mesure : 120 images de chauffe, puis 600 images mesurées.
  - Par image : `GGameThreadTime` et `GRenderThreadTime` (`RenderTimer.h:8,17` [V]), `RHIGetGPUFrameCycles()`
    (`DynamicRHI.h:1250` [V]) converti en ms, `FPlatformMemory::GetStats()` (`UsedPhysical`, `PeakUsedPhysical`,
    `GenericPlatformMemory.h:141,144` [V]). Pour le cavalier : `GetNumBones()` et `GetPredictedLODLevel()`
    (`SkinnedMeshComponent.h:1144,1685` [V]).
  - Sortie `perf-unreal.json` : médiane et 95e centile. Résumé par `scripts/unreal/perf-summary.py`.
- **Mesurer.** Trois passes pour chaque configuration, `actuel` et `regles`. Essai de l'aperçu de rendu mobile sur Mac
  [AC], noté séparément.
- **Accepter.**
  - Dispersion des médianes entre passes ≤ 5 % [P]. Au-delà, la mesure est inutilisable et il faut allonger.
  - Δ temps jeu (`regles` − `actuel`) ≤ 0,3 ms [P].
  - Tableau de base dans `unreal/docs/essai-metahuman/cout.md`.
  - G2, G3, G5.

**Fin de la voie A.** Si la voie B s'arrête (§7), les étapes 13 et 15 se font quand même avec l'option `regles` seule.

### Étape 8. Atelier MetaHuman et candidates d'apparence (Tom, après J1 et J2)

- **Préalable.**
  - ≥ 25 Gio libres [P]. Calcul : Core Data environ 6 Go [AC], atelier, cache dérivé et shaders [AC], cuisson iOS de
    l'étape 14 [AC], marge.
  - `Engine/Plugins/MetaHuman/MetaHumanCharacter/Content/Optional` existe (absent le 20/11 [V]).
- **Créer `unreal/EssaiMetaHuman/EssaiMetaHuman.uproject`.**
  - Plugins activés : `MetaHumanCharacter`, `PythonScriptPlugin`, `ControlRig`.
  - `TargetPlatforms: ["Mac"]`, ce qui évite les shaders iOS dans l'atelier. Pas de Pixel Streaming.
- **Créer aussi** `Config/DefaultEngine.ini` (réglages mobiles du jeu, `Compat.MAX_GPUSKIN_BONES=75` [V faisabilité §4.3])
  et les entrées de `.gitignore` (invariant 6).
- **Écrire les scripts** `scripts/unreal/metahuman/01_create.py` à `04_candidates.py`, adaptés des exemples d'Epic
  (`example_create_asset.py`, `example_sculpt_body.py`, `example_conform_from_custom_mesh.py`, `example_modify_skin.py`,
  `example_add_grooms.py` [V]).
- **Trancher le mode sans interface, puis le noter dans `README.md`.** Essais dans l'ordre :
  1. `UnrealEditor-Cmd … -run=pythonscript -script=… -unattended -nullrhi` ;
  2. la même commande avec `-AllowCommandletRendering` ;
  3. l'éditeur complet avec `-ExecutePythonScript=… -unattended`.

  Tout reste [AC] avant l'essai.
- **Morphologie.**
  - Taille : 1,68 m × l'échelle de la cavalière web (0,985 [V PARITE `joueur.avatar`]).
  - Longueur de jambe L visée entre 0,78 et 0,80 m (oracle §4.1), par `set_body_constraints`, ou par conformation sur
    le corps de `rider_f`.
  - Mesures notées.
- **Candidates.** Quatre candidates, toutes aux couleurs du web : peau `#e8bea0`, cheveux `#7a4a28`, yeux `#5b4632`
  [V PARITE l.166, l.175], coiffure courte ou chignon compatible avec le casque.
  - Portraits de face et de trois quarts, rangés dans `.tmp/essai-mh/candidats/`.
  - Une page HTML de choix pour Julien, publiée en privé.
  - Aucune candidate ne reprend les traits d'une personne réelle.
- **Accepter.**
  - Asset créé.
  - Taille à ±1 cm de la cible, L à ±1 cm [P].
  - Quatre candidates.
  - Aucun appel au cloud : `rg -c 'autorig-service|texture-synthesis-service'` sur le journal renvoie 0.
  - Disque restant noté.
  - G5. Rien d'autre n'est touché dans le jeu.
- **Arrêt.** Voir S2 et S5 (§7).

### Étape 9. Rig, textures et assemblage par le cloud Epic (Tom, avec J5)

- **Pendant la session de Julien.** Éditeur de l'atelier ouvert en session graphique, devant le Mac ou en partage
  d'écran. Le premier appel `request_auto_rigging` déclenche la connexion [V doc Python 5.8]. Julien se connecte, lit les
  conditions du service et décide.
- **Scripts.**
  - `05_rig_textures.py` : `JOINTS_ONLY` (`example_auto_rig.py:20-21` [V]), puis textures 2k, les deux avec
    `blocking=True`.
  - `06_assemble.py` : `OPTIMIZED`, qualité `LOW`. L'exemple d'Epic utilise `MEDIUM` (`example_assembly.py:19-20` [V]),
    on le change. Un seul assemblage, puis l'éditeur est fermé.
- **Mesurer.**
  - Mémoire de pointe du processus, par `/usr/bin/time -l`.
  - Taille du dossier produit.
  - Os du corps et du visage, LOD gardés, sections, taille maximale des textures.
  - Résultat dans `unreal/docs/essai-metahuman/assemblage.md`.
- **Accepter.**
  - `can_build_meta_human` vrai avant l'assemblage, puis assemblage réussi.
  - Sortie ≤ 100 Mo [P]. Epic indique moins de 100 Mo en moyenne pour l'Optimized [V faisabilité §4.2].
  - Textures ≤ 2048 [V spécification mobile d'Epic].
  - LOD 3 présent pour le visage et le corps [V : meilleur LOD utilisable sur iOS].
  - Mémoire de pointe ≤ 13 Go [P] sur cette machine de 16 Go.
  - Aucune étape payante rencontrée.
- **Arrêt.** S1, S4.

### Étape 10. Tenue, casque et sellerie de monte (Tom, Blender installé [V faisabilité §6])

- **Export web `export-rider-rules.mjs --props`.** `GLTFExporter` est présent (three 0.170.0 [V]).
  - Casque par `makeRidingHelmet` (`ridingHelmet.js:5` [V]), couleur `#16171a`.
  - Selle, tapis, sangle, étrivières et étriers par `buildTack` (`pjl/tack.js:8` [V]), skinnés sur le squelette PJL.
    C'est le même squelette de 419 articulations, avec les mêmes noms dans Unreal [V oracle §3.3].
  - Sortie dans `.tmp/unreal-import/monte/`. Une boîte englobante par pièce est notée dans le manifeste.
- **Créer `scripts/unreal/metahuman/refit-garments.py`** (Blender sans interface).
  - Il recale `Cloth_jacket`, `Cloth_shirt`, `Cloth_jeans` (culotte), `Cloth_boots` et les bottes hautes de `rider_f.glb`
    sur le corps MetaHuman exporté par `ExportGeometry`. Les vêtements sont CC0 [V faisabilité §6].
  - Les bottes hautes sont une primitive du corps : on les sépare par matériau.
  - Déformation de surface, puis transfert des poids. Les faces du corps cachées sous les vêtements sont masquées.
- **Importer.**
  - Script Python Unreal. Couleurs par paramètres de matériau, comme `applyOutfit` (veste `#1f2b45` ou `#1b1c1f`, culotte
    `#f2f1ec`, bottes `#121214` [V faisabilité §6]).
  - Le casque est attaché à la socket `head`.
  - La sellerie est un maillage skinné avec `LeaderPose` sur le cheval. Elle est affichée **seulement** avec les options
    `regles` et `mh` : le CSO par défaut reste identique (G5).
- **Mesurer l'épaisseur de semelle des bottes.** Elle sert à calibrer la plante (oracle §3.2, risque 12).
- **Accepter.**
  - Boîte du casque 0,105 × 0,11 × 0,128 m à ±2 mm [V PARITE `realiste.casque-casquette`].
  - Boîtes des pièces de sellerie égales au manifeste à ±0,5 cm, contrôlées comme `import-cso-fences.py` [V README §1].
  - Aucune peau visible à travers la tenue sur les 15 poses de l'étape 13 : contrôle visuel par Tom, noté.
  - G2, G3, G5.

### Étape 11. MetaHuman dans le jeu (option `mh`) et niveau A (Tom, peut demander J6)

- **Migrer** la MetaHuman assemblée et la tenue vers `unreal/StridesGrandTour/Content/Essai/MetaHuman/` (ignoré par git).
  On passe par `MigratePackages` (`IAssetTools.h:634` [V] ; exposition Python [AC]). Repli : copie du dossier, éditeurs
  fermés.
- **Lister les plugins dont l'asset dépend** (dépendances du registre d'assets).
  - Si seul `MetaHumanSDK` est requis : il est activé par défaut [V faisabilité §1.1], rien ne change dans le `.uproject`.
  - Sinon, J6 avant de toucher `StridesGrandTour.uproject`.
- **Créer `scripts/unreal/measure-rig.py`.** Il écrit `rigs/metahuman.json` : longueurs, repos, `ankleY`, `heelBack`,
  `toe` avec la semelle de l'étape 10, `seatToHips` (point le plus bas des fessiers sous `pelvis`), poing (moyenne de
  4 os).
- **Générer O2 `metahuman`** (étape 3) et l'ajouter au test `rider` de G1.
- **Construire `CR_StridesMonte_MH`** avec le même script de l'étape 6 et la table d'os MetaHuman. Les os de torsion et
  les correctifs sont ignorés par les mesures (oracle §3.1).
- **Régler `UMetaHumanComponentBase`** pour le mobile : `ControlRigLODThreshold`, `RigLogicLODThreshold`
  (`MetaHumanComponentBase.h:60` [V]).
- **Créer les tests** `Essai.Monte.RiderRules` (niveau A, mêmes scénarios que l'étape 6).
- **Accepter.**
  - C++ contre O2 `metahuman` ≤ 0,1 mm (G1).
  - Niveau A (§5) sur E1 à E3b.
  - `Automation RunTests Essai.Monte` : tous `Result={Success}`.
  - G2, G3, G5 et G6 : la porte `Strides` est inchangée et verte.
- **Arrêt.** S6.

### Étape 12. Niveau B : cheval et cavalière Unreal (Tom)

- **Créer les tests** `Strides.Parite.RiderOnHorse` (option `regles`) et `Essai.Monte.OnHorse` (option `mh`).
  - Le cheval Unreal rejoue la trajectoire et le clip enregistrés (`hz`, `mx`).
  - Siège, profils et événements du saut sont calculés **par Unreal** (étape 5).
  - Les sorties sont exportées au format O1, puis passées dans `rider-rules-metrics.mjs`.
  - Longueur d'étriers : celle de J3.
- **Accepter.**
  - Niveau B (§5) sur E1, E1b, E2g, E2d.
  - E3 et E3b au niveau B seulement si le saut Unreal fournit `landT` et `hindDown`. Sinon, l'écart est déclaré.
  - E4 et E5 hors acceptation.
- **Livrer** la comparaison chiffrée à O1 dans `unreal/docs/essai-metahuman/niveau-b.md`.

### Étape 13. Captures côte à côte, à l'arrêt et au galop (Tom, rendu GPU réel)

- **Web : `export-rider-rules.mjs --shots=monte`.**
  - Cinq instants : E1 à l'image 30, et quatre instants d'une foulée de E2g choisis par la phase (poser du postérieur
    extérieur, diagonal, poser de l'antérieur meneur, suspension).
  - Trois vues pour chaque instant : latérale gauche, trois-quarts avant gauche, face. Cela fait **15 poses** en
    844 × 390, `deviceScaleFactor` 1.
  - Sorties : `unreal/docs/parite/monte/poses.json` (pose du cheval, clip et temps, œil, cible, FOV vertical, image de
    l'oracle), les `<pose>-web.png`, et une variante `-calque` où les articulations du squelette classique (la vérité des
    règles) sont projetées en points.
- **Unreal : `-StridesShots=monte -StridesRider=regles|mh -StridesShotsDir=<dossier dédié>`.**
  - Le cheval et la cavalière sont posés depuis l'image de l'oracle. La caméra est placée à l'œil et à la cible, avec le
    FOV vertical du web (traitement des axes [V README §3]).
  - Sorties : `<pose>-unreal-regles.png`, `<pose>-unreal-mh.png`, et `monte-unreal.json` (articulations relevées à
    l'image rendue, écart à O2).
- **Modifier `parite-montage.py`.** Option `--unreal-suffix`, et montage à trois colonnes. Le comportement par défaut ne
  change pas, et G5 sur `parite/cso` le prouve.
- **Accepter.**
  - 15 × 3 captures en exactement 844 × 390 (`sips` [V README §3]). Montage en code 0.
  - Temps du clip du cheval identique au web à 1/60 s près ; caméra identique à 1 mm et 0,01° près [P].
  - Articulations de l'image rendue conformes à O2 aux tolérances du niveau A.
  - Écarts visuels connus écrits sous chaque montage : rênes absentes (`cheval.renes` absent [V PARITE]), rendu web en
    SwiftShader [V cso-ecarts, risques transverses].

### Étape 14. Coût de la MetaHuman sur le Mac, et poids (Tom)

- **Configurations du mode `perf`** (étape 7) : `actuel`, `regles`, `mh` en LOD automatique, et `mh` en LOD 3 forcé
  (`SetForcedLOD`, `SkinnedMeshComponent.h:1104` [V] ; convention de l'indice [AC]). Trois passes chacune.
- **Poids.**
  - `du -sh Content/Essai/MetaHuman`.
  - Cuisson iOS non signée avec la commande de `testflight.md`. La MetaHuman y est incluse pour cette seule cuisson
    (carte d'essai ou `DirectoriesToAlwaysCook` [AC]).
  - Δ de taille d'archive par rapport à l'archive candidate de 598 Mo [V].
  - Archive d'essai mise à la corbeille (`trash`) après mesure, pour rendre la place.
- **Accepter** (seuils [P], à valider par Julien).

| Grandeur (Mac M2, 844 × 390) | Seuil `mh` − `actuel` | Source du seuil |
|---|---|---|
| temps jeu, médiane | ≤ 0,5 ms | 1,5 % d'une image à 30 i/s, cible de `relais-mac.md:126` (« à confirmer avec Julien ») |
| temps GPU, médiane | ≤ 1,0 ms | 3 % d'une image à 30 i/s |
| mémoire résidente | ≤ 150 Mo | ordre de grandeur des textures de la cavalière web (61 → 40 Mo, PARITE `realiste.peau-matieres` [V]) |
| archive iOS | ≤ 100 Mo | moyenne Optimized annoncée par Epic [V] |
| os par section skinnée | ≤ 75 | `Compat.MAX_GPUSKIN_BONES=75` recommandé par Epic [V] |
| texture la plus grande sur iOS | ≤ 2048 | spécification mobile d'Epic [V] |
| Pixel Streaming dans l'archive iOS | 0 occurrence | invariant 4 |

- **Rappel écrit dans `cout.md`.** Les chiffres du Mac classent les options entre elles. Ils ne disent pas le coût sur
  iPhone (étape 16).

### Étape 15. Bilan, inventaire et page de décision (Tom, puis J7)

- **`unreal/docs/essai-metahuman/BILAN.md`** :
  - tableau de tous les critères (passé, échoué, non mesuré) avec les chiffres ;
  - écarts déclarés ;
  - ce que l'essai ne prouve pas (§8) ;
  - recommandation argumentée entre trois voies : MetaHuman, cavalière du web avec les règles, ou statu quo.
- **Inventaire.** Lignes touchées dans `humains-vehicules.json` et `cheval.json`, sans rien déclarer « identique » qui ne
  soit pas le comportement par défaut. G6.
- **Page HTML autonome** (artifact privé, lisible sur iPad) : montages côte à côte, calques, chiffres du coût, choix à
  faire.
- G1 à G7 au complet, puis commit final de l'essai.

### Étape 16. Mesure sur iPhone ou iPad (quand un appareil est branché, J8)

À mesurer :
- images par seconde stables sur 10 minutes de galop au Pôle, chauffe comprise (cible de départ 30 i/s sur iPhone 12, à
  confirmer avec Julien [V relais-mac.md:126]) ;
- `stat unit`, `stat rhi`, mémoire et marge avant la limite de mémoire d'iOS [AC] ;
- LOD réellement choisi à la distance de jeu ;
- coût du matériau de peau en rendu mobile « forward » ;
- temps de chargement et taille installée.

Rien n'est publié.

---

## 5. Tolérances des oracles (reprises d'`oracle-monte.md` §5, avec contexte)

| Grandeur | Niveau A (Unreal contre O2, mêmes proportions) | Niveau B (Unreal intégré, contre les règles et O1) |
|---|---|---|
| M1 plante – point d'étrier, y et z | ≤ 1,0 cm | Δy ≤ 3 cm et \|Δz\| ≤ 5 cm par rapport à la plante assise ; ≤ 2 cm assis |
| M2 écart latéral du pied | ≤ 1,0 cm | ≤ `xMax` + 1 cm |
| M4 plante – étrier affiché | — | ≤ 2,0 cm |
| M6 portée de la jambe ρ | ±0,005 | ≤ 0,935 assis, ≤ 0,955 hors de la selle |
| M7 écarts au flanc (genou, tibia 35 et 65 %, cuisse 50 et 75 %) | ≥ −1,0 cm et \|Δ\| ≤ 1,0 cm | ≥ −1,0 cm ; au plus 3 images de suite entre −1 et −2 cm aux changements de pied |
| M8 pénétration de l'axe des os | — | ≤ max(1,0 cm ; O1 + 0,5 cm) |
| M9 poignet au-dessus de l'encolure | ≥ 9,0 cm et \|Δ\| ≤ 1,0 cm | ≥ 9,0 cm |
| M10 bras | ≤ 0,97 ; coude ±2° | coude ≤ 155° |
| M11 genou, hanche, cheville | ±2° | hanche et cheville ±6° contre O1 ; genou par ρ |
| M12 ouverture du genou | ±3° | ±8° contre O1, sans genoux en ailes |
| M13 buste | ±1° | ±3° assis, ±5° à l'obstacle |
| M14 assise | ±0,5 cm | \|Δ\| ≤ 0,4 cm au pas ; lever ≤ O1 + 1 cm |
| M15 talon bas, pointe ouverte | ±2° | ±4° contre O1 |
| M16 continuité | ≤ O2 + 2° par image, à-coup ≤ O2 + 2° | ≤ 15° par image en régime établi ; ≤ O1 + 5° en transition |
| M17 phases du saut | ±1 image | ±2 images |

À ces tolérances s'ajoutent les deux étages internes :
- C++ contre O2 ≤ 0,1 mm (étape 4) ;
- O2 `web_classic` contre O1 ≤ 1e-6 (étape 3).

Si Julien choisit une autre longueur d'étriers (J3), O2 est rejoué avec cette valeur. Le niveau A reste exigible tel quel.
Au niveau B, l'écart à O1 sur M1, M6 et M11 est voulu et déclaré.

---

## 6. Interventions de Julien

| Id | Quand | Ce que Julien fait | Ce que Tom prépare |
|---|---|---|---|
| J1 | avant l'étape 8 | **Libérer de la place** : 25 Gio libres visés [P], 13 Gio aujourd'hui [V]. Il choisit quoi mettre à la corbeille. | La liste chiffrée : `Builds/EquestrianTour-IOS-Unsigned` 855 Mo et `Builds/EquestrianTour-Mac` 964 Mo, régénérables et ignorés par git (`.gitignore:26` [V]) ; cache dérivé Zen 7,2 Gio [V faisabilité], régénérable au prix de recompilations de shaders. Tom met à la corbeille (`trash`) seulement ce que Julien a nommé. |
| J2 | avant l'étape 8 | **Installer « MetaHuman Creator Core Data »** par le Launcher Epic (Options du moteur UE 5.8). C'est gratuit ; la taille réelle se lit dans le Launcher. | Vérifier ensuite que `MetaHumanCharacter/Content/Optional` existe. |
| J3 | après l'étape 2 | **Longueur d'étriers.** (a) Celle de la v3, réglée par le cheval PJL (`stirrupY` borné entre −0,85 et −0,64 m ; −0,64 m relevé en v2, soit la borne la plus courte [V oracle §1 R1]). (b) Une autre longueur, donnée en angle de genou à l'arrêt ou en « N trous plus court ». | Les chiffres v3 mesurés (genou au repos, ρ, `stirrupY` retenu) et, pour (b), la conversion en `stirrupY`. |
| J4 | après l'étape 8 | **Choisir l'apparence** parmi quatre candidates : visage, teint, cheveux sous le casque, yeux. La tenue et ses couleurs sont celles du web. | La page de portraits. |
| J5 | étape 9 | **Se connecter à son compte Epic dans l'éditeur** au premier auto-rig, lire les conditions du service MetaHuman Cloud et décider de les accepter. Devant le Mac ou en partage d'écran. | L'éditeur ouvert, prêt à lancer l'appel ; les scripts suivants s'enchaînent seuls avec `blocking=True`. |
| J6 | étape 11, si nécessaire | **Accord pour activer un plugin MetaHuman d'exécution** dans `StridesGrandTour.uproject`, si l'asset assemblé l'exige. Cela change le contenu du paquet iOS. | La liste exacte des plugins, et la preuve que G1 à G7 restent verts. |
| J7 | étape 15 | **Juger le réalisme équestre** sur la page côte à côte, ce qu'aucun oracle ne prouve. Décider : MetaHuman en production, cavalière du web avec les règles, ou abandon. | Le bilan chiffré et la recommandation. |
| J8 | étape 16 | **Brancher un iPhone ou un iPad** et décider de la signature. L'accord Apple Developer reste sa décision ; rien n'est engagé sans lui. | La liste des mesures. |

---

## 7. Conditions d'arrêt

| Id | Condition | Décision |
|---|---|---|
| S1 | Julien refuse la connexion Epic ou les conditions du service, ou ces conditions comportent un paiement, un abonnement ou une collecte que Julien refuse | **La voie B est impossible sans compte** : une MetaHuman ne s'assemble pas sans rig et textures du cloud (« To be assembled, a character must be rigged and the high-resolution textures downloaded » [V page Assembly]). On arrête la voie B. On livre la voie A avec l'option `regles` (étapes 13 à 15 sans `mh`), et on le dit en une phrase dans le bilan. |
| S2 | Core Data non installable (place, Launcher), ou `create_asset` / `can_build_meta_human` impossibles sans lui | Même issue que S1, en citant la cause exacte. |
| S3 | Moins de 8 Gio libres à n'importe quel moment [P] | Pause immédiate, aucune suppression, question à Julien. |
| S4 | Assemblage tué ou mémoire de pointe au-delà de 14 Go, deux fois, machine sans autre charge | Arrêt de la voie B ; constat chiffré à Julien (fuite connue en 5.8.4 [AC]). |
| S5 | Python impossible sans interface | **Pas un arrêt.** On passe à l'éditeur en session graphique (runbook `banc-test-mac-mini`), noté au journal. |
| S6 | Niveau A inatteignable sur le squelette MetaHuman avec `TwoBoneIK` après une session : torsions ou correctifs qui déplacent les articulations, axes | Une seule tentative de plus, en RigUnit C++ ou `FAnimNode`. Sinon, arrêt de la voie B, écart documenté. |
| S7 | Coût Mac au-delà du double d'un seuil du §4, étape 14 | Essai conclu **négatif** pour la production. On livre quand même captures et chiffres. |
| S8 | Une étape exige un achat (contenu Fab, plugin) | L'étape n'est pas faite ; on cherche une alternative gratuite. Sinon, arrêt de cette étape. |
| S9 | Une porte G1 à G7 vire au rouge à cause de l'essai et n'est pas réparée dans la session | Retour arrière du commit fautif (`git revert`), essai suspendu. |
| S10 | Pixel Streaming, ou un module éditeur MetaHuman, trouvé dans une archive iOS | Corriger avant toute autre étape. |

---

## 8. Hors périmètre, et ce que l'essai ne prouve pas

- **Le réalisme équestre.** Les tests le disent eux-mêmes (`riderPosture.test.js:1-3` [V]) : il reste au jugement de
  Julien (J7).
- **Le coût sur iPhone.** Aucun appareil n'est branché (PARITE, « Testé sur iPhone / iPad réel : non vérifié » [V]).
- **Montée et descente** (R9, E4, E5) : oracle exporté, portage non exigé.
- **Marche à pied** : elle sera native Unreal (`IK_MH_IKRig`, `RTG_MH_IKRig` présents [V oracle §3.1]), hors essai.
- **Rênes et lanières** (`cheval.renes`, `cheval.lanieres` absents [V]). Expressions, regard, clignements.
- **Tribunes et foule MetaHuman** (`MetaHumanCrowd`, expérimental [V faisabilité §1.1]).
- **Publication App Store.** Le contrat Unreal en vigueur reste à relire avant toute publication [AC faisabilité §3].

---

## 9. Points à confirmer pendant l'exécution

1. Python MetaHuman sans interface : `-nullrhi`, `-AllowCommandletRendering`, ou éditeur complet (étape 8).
2. Persistance de la connexion Epic d'une session à l'autre (faisabilité §2).
3. Taille réelle de Core Data, lue dans le Launcher.
4. Plugins d'exécution exigés par la MetaHuman assemblée (étape 11).
5. Accès CPU aux sommets du cheval sur iOS pour les profils de flanc (étape 5) ; repli par tables.
6. Échelle du cheval Unreal contre le web (étape 5).
7. Noms des champs du mélangeur PJL à exporter (étape 2).
8. `migrate_packages` exposé à Python (étape 11).
9. Convention d'indice de `SetForcedLOD`, et aperçu du rendu mobile sur Mac (étapes 7 et 14).
10. Écart de dernier bit de la libm entre V8 et Apple, sous la tolérance de 0,1 mm (étape 4).

---

## 10. Ordre et dépendances

```
1 ─ 2 ─ 3 ─ 4 ─┬─ 5 ─┬─ 6 ─ 7                       (voie A, sans compte)
               │     │
2 ─ J3         │     └──────────────┐
J1 + J2 ─ 8 ─ J4 ─ 9 (J5) ─ 10 ─ 11 (J6?) ─ 12 ─ 13 ─ 14 ─ 15 (J7) ─ 16 (J8)
```

- La voie A peut avancer pendant que Julien prépare J1 et J2.
- J3 doit être tranché avant les étapes 12 et 13.
- Après S1 ou S2, on va directement de l'étape 7 aux étapes 13, 14 et 15, avec l'option `regles` seule.
