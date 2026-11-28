# Essai MetaHuman : faisabilité dans UE 5.8.4

> **Voie A choisie par Julien le 20/11/2026, voie B (MetaHuman) écartée pour l'instant.**
> Copie versionnée le 20/11/2026 du document de préparation ; le texte sous cet encadré est inchangé. Phase en cours :
> règles de monte du web v3 portées en C++ dans StridesCore et prouvées par oracle (étapes 1 à 4), puis appliquées par
> Control Rig à la cavalière actuelle (étapes 5 à 7). Adaptations de cette phase : travail sur la branche locale
> `claude/monte-voie-a`, fusionnée dans `claude/unreal-port` après la tranche CSO ; comptes rendus dans
> `unreal/docs/parite/monte/` (et non `unreal/docs/essai-metahuman/`) ; étape 1 sans Unreal Build Tool ni UnrealEditor
> (portes G1, G5, G6, G7 seulement, `scripts/unreal/monte-base.py`). Les outils d'inspection cités
> (`essai-metahuman/outils/`) sont restés dans le dossier de travail de la préparation, non versionnés.

Date : 20/11/2026, Europe/Paris. Machine : Mac mini M2, 16 Go. Moteur : `/Users/Shared/Epic Games/UE_5.8` (5.8.4-58902052).
Méthode : lecture seule du moteur, du dépôt et du web public. Aucun lancement d'UnrealEditor, aucune installation, aucune connexion à un compte.
Notation : **[V]** vérifié (fichier, commande ou page officielle citée) ; **[AC]** à confirmer.

## Verdict

L'essai est faisable, mais il bute sur trois points avant de pouvoir commencer.

1. **Le contenu « MetaHuman Creator Core Data » n'est pas installé.** Ce contenu fournit les préréglages, les cheveux, les vêtements et les modèles de texture. Il s'installe par le Launcher Epic, et pèse environ 6 Go [AC]. Sans lui, aucune coiffure ni aucun vêtement Epic n'est disponible.
2. **Deux étapes obligatoires passent par le cloud Epic et demandent un compte connecté.** Ce sont l'auto-rigging et le téléchargement des textures haute résolution. La documentation officielle dit qu'un personnage ne peut pas être assemblé sans elles. La première connexion doit être faite par Julien.
3. **Disque et mémoire.** Il reste 13 Gio libres. Les retours de la communauté signalent une fuite mémoire pendant les assemblages scriptés, sur des machines de 32 Go. Le Mac a 16 Go.

Tout le reste se scripte en Python, et Epic fournit des exemples pour chaque étape : création, morphologie, peau, coiffure, vêtements, assemblage « Optimized Low » et Control Rig. Les modules d'exécution sont déjà compilés pour iOS. La licence permet un jeu commercial sur l'App Store sans frais propres à MetaHuman.

## 1. Plugins installés et API exposée

### 1.1 Inventaire [V]

Source : lecture des `.uplugin` sous `Engine/Plugins/MetaHuman/*`, `Engine/Plugins/Experimental/MetaHuman/*` et `Engine/Plugins/Experimental/Toolsets/MetaHumanGenerator`, plus `du -sh`.

| Plugin (nom affiché) | État | Taille | Rôle pour l'essai |
|---|---|---|---|
| MetaHumanCharacter (« MetaHuman Creator ») | **Beta**, désactivé par défaut | 761 Mo | Le Creator dans l'éditeur. Il contient l'asset `UMetaHumanCharacter`, le sous-système `MetaHumanCharacterEditorSubsystem`, la palette et la garde-robe, et les pipelines d'assemblage Cine, Optimized et UEFN. Modules runtime : MetaHumanCharacter, MetaHumanCharacterPalette, MetaHumanDefaultPipeline. **Indispensable.** |
| MetaHumanSDK | activé par défaut | 21 Mo | Côté runtime : le composant `MetaHumanComponentUE` et ses seuils de LOD (RigLogic, Control Rig, correctifs). Côté éditeur : le client cloud (authentification EOS, services d'auto-rig et de synthèse de texture), l'import et la vérification. **Indispensable.** |
| MetaHumanCoreTech | désactivé par défaut | 219 Mo | Technologie de base : DNA, synthèse de texture locale, conformation. Contient les DNA archétypes `Content/ArchetypeDNA/SKM_Body.dna` et `SKM_Face.dna`. Dépendance du Creator. |
| MetaHuman Animator (dossier MetaHumanAnimator) | Win64, Linux, Mac | 792 Mo | Capture faciale, identité, performance. Dépendance déclarée du Creator, mais inutile pour la monte. |
| MetaHumanCoreML | Mac, iOS, tvOS, visionOS | 164 Mo | Modèles CoreML pour l'inférence MetaHuman sur Apple, utilisés par Animator et Live Link. Inutile pour l'essai. |
| MetaHumanAnimationTools | désactivé par défaut | 0,8 Mo | Sérialisation d'animations MetaHuman. Inutile. |
| MetaHumanLiveLink, MetaHumanCalibrationProcessing, CalibrationDiagnostics | — | — | Flux temps réel et calibration de caméras. Inutiles. |
| MetaHumanCrowd | **Experimental** | 17 Mo | Foules MetaHuman sur Mass : fusion de corps, pipelines foule. Ses modules runtime sont compilés pour iOS. Hors essai, mais à évaluer plus tard pour les tribunes [AC]. |
| MetaHumanGenerator (Toolsets) | **Experimental**, éditeur | 0,4 Mo | API Python simplifiée « pour agents IA » : `create`, `set_body_shape` (masculin/féminin, gras, musculature, taille de 135 à 220 cm), `set_skin_tone`, `set_eye_color`. Fichier : `Content/Python/metahuman_toolset/metahuman.py`. |
| MetaHumanCharacterUAF | Experimental, **Win64 seulement** | — | Inutilisable sur Mac. |
| MetaHumanRuntime | déprécié | — | Redirige vers MetaHumanSDK. |

Plugins voisins [V] :
- **PythonScriptPlugin** : Beta, désactivé par défaut, à activer.
- **ControlRig** et **IKRig** : activés par défaut.
- **HairStrands**, **ChaosClothAsset** et **ChaosOutfitAsset** (ce dernier en Beta) : désactivés par défaut, déjà dépendances du Creator.

Le projet `StridesGrandTour.uproject` n'active aujourd'hui aucun plugin MetaHuman, ni Python.

### 1.2 Contenu manquant [V]

- `MetaHumanCharacter/Content/Optional` **n'existe pas**. Or la configuration du plugin (`Config/Editor.ini`) y cherche toute la garde-robe et les préréglages : `/MetaHumanCharacter/Optional/Grooms/...`, `/Optional/Clothing`, `/Optional/Presets`. Les exemples d'Epic chargent `/MetaHumanCharacter/Optional/Clothing/WI_DefaultGarment` et `/Optional/Grooms/Bindings/Hair/WI_Hair_L_StraightBangs`.
- Les étiquettes d'installation du Launcher pour UE_5.8 sont `['', 'templates', 'engine_source']`, sans aucune option MetaHuman (fichier `~/Library/Application Support/Epic/EpicGamesLauncher/Data/Manifests/*.item`).
- Un en-tête du code confirme que cette absence est un état prévu : `MetaHumanCharacterEditorModule.h` contient `IsOptionalMetaHumanContentInstalled()`.
- Pour l'installer, la documentation officielle décrit cette voie : Launcher, Options du moteur, case « MetaHuman Creator Core Data », Appliquer. Ce contenu comprend les préréglages, les cheveux, les modèles de texture et des fichiers d'export ([Getting started](https://dev.epicgames.com/documentation/metahuman/getting-started-with-metahuman-creator-in-unreal-engine)).
- Taille : environ 6 Go selon un seul utilisateur, sur la 5.7.1 [AC].

### 1.3 Ce que Python peut faire

Sources : `MetaHumanCharacterEditorSubsystem.h` (2 216 lignes, 51 fonctions `UFUNCTION(BlueprintCallable)`), les exemples de `MetaHumanCharacter/Content/Python/examples/` et la page [MetaHuman Creator Python Scripting](https://dev.epicgames.com/documentation/metahuman/metahuman-creator-python-scripting-in-unreal-engine?lang=en-US). Cette page vise UE 5.8 et plus.

| Étape | API | Preuve | Hors ligne ? |
|---|---|---|---|
| Créer une MetaHuman | `AssetTools.create_asset(..., MetaHumanCharacter, MetaHumanCharacterFactoryNew)` | `example_create_asset.py` [V] | oui |
| Partir d'un préréglage | `InitializeFromPreset` n'est **pas** exposée à Python : aucune `UFUNCTION` (ligne 1481 de l'en-tête) [V]. Contournement : dupliquer un asset préréglé de `Optional/Presets` [AC] | en-tête | oui, mais exige Core Data |
| Morphologie | `get_body_constraints` / `set_body_constraints` / `commit_body_state` (taille, longueur de bras, etc.) | `example_sculpt_body.py` [V] | oui |
| Caler sur le corps du web | `conform_to_target_meshes`, `get_mesh_data_for_conforming` : conformation de bout en bout sur un maillage quelconque | `example_conform_from_custom_mesh.py` [V] | oui [AC] |
| Peau | `commit_skin_settings` (teinte u/v, index de texture, rugosité, taches de rousseur, zones) | `example_modify_skin.py` [V] | synthèse locale de l'aperçu [AC] |
| Yeux, maquillage, tête | `commit_eyes_settings`, `commit_makeup_settings`, `commit_head_model_settings` | en-tête [V] | oui |
| Cheveux | `internal_collection.try_add_item_from_wardrobe_item("Hair", ...)`, puis paramètres d'instance (Melanin, etc.) | `example_add_grooms.py` [V] | exige Core Data |
| Vêtements | même mécanisme, emplacement `Outfits` (Chaos Outfit) ou `SkeletalMesh`, couleurs par paramètre (`PrimaryColorShirt`, etc.) | `example_add_clothing.py`, `Editor.ini` [V] | oui, si l'article existe |
| Auto-rigging | `request_auto_rigging(params)` avec `blocking=True`, `rig_type=JOINTS_ONLY` ou `JOINTS_AND_BLENDSHAPES` | `example_auto_rig.py` [V] | **non, cloud** |
| Textures haute résolution | `request_texture_sources(params)` avec `blocking=True` ; résolutions 2k, 4k ou 8k (`ERequestTextureResolution`) | `example_download_textures.py`, `MetaHumanCharacterSkin.h` [V] | **non, cloud** |
| Vérifier avant assemblage | `can_build_meta_human` : renvoie faux tant qu'il manque le rig **et** les textures téléchargées | `test_character_assembly.py` [V] | — |
| Assembler | `build_meta_human(params)`, `pipeline_type=OPTIMIZED`, `pipeline_quality=LOW` | `example_assembly.py` [V] | oui, après les deux étapes cloud |
| Export DNA, géométrie, matériaux | `MetaHumanCharacterExportBlueprintLibrary` | en-tête [V] | oui |

Limites relevées [V] :
- `FMetaHumanCharacterEditorBuildParameters.PipelineOverride` est un `UPROPERTY()` nu. Il n'est donc pas réglable depuis Python, et on ne passe pas un pipeline LOD sur mesure par les paramètres d'assemblage. Il faut utiliser les pipelines fournis ou régler le pipeline de l'asset [AC].
- Doc officielle : « In Unreal Engine 5.8, Bake Material is supported only on the Cinematic pipeline. » Le pipeline Optimized ne cuit donc pas les matériaux.

Sans interface, en commandlet :
- La documentation officielle dit : « Run scripts with `blocking = True`. This is the supported pattern for batch and commandlet contexts » [V]. Les exemples portent la mention « Required for running in batch » [V].
- Ce qui reste à confirmer [AC] : le comportement réel en `UnrealEditor-Cmd -run=pythonscript`, avec le RHI nul par défaut des commandlets. L'aperçu, la synthèse de texture et la cuisson Texture Graph peuvent avoir besoin du GPU. Il faudra peut-être `-AllowCommandletRendering`, ou l'éditeur complet en `-ExecutePythonScript=... -unattended`.
- Une session à heure creuse suffit pour trancher ce point, mais seulement quand l'autre travail a libéré la machine.

Control Rig en Python [V] : le graphe se pilote par `RigVMController`. Epic fournit des exemples dans `Plugins/Animation/ControlRig/Content/Python/ControlRigWorkflows/`, dont `workflow_two_bone_ik.py`.

## 2. Étapes qui exigent le cloud ou un compte Epic

| Étape | En ligne | Compte | Preuve |
|---|---|---|---|
| Installer Core Data | Launcher (téléchargement) | Launcher connecté | [doc Getting started](https://dev.epicgames.com/documentation/metahuman/getting-started-with-metahuman-creator-in-unreal-engine) [V] |
| Auto-rigging | `mh-uemhc-autorig-service.eeeb.live.use1a.on.epicgames.com` | oui | `Plugins/MetaHuman/MetaHumanSDK/Config/DefaultMetaHumanSDK.ini`, doc Python : « The editor must be signed in to an Epic account with MetaHuman Cloud access » [V] |
| Textures haute résolution | `mh-texture-synthesis-service.eeeb.live.use1a.on.epicgames.com`, et `s3.us-east-1.amazonaws.com` à autoriser | oui, même authentification | doc Python et Getting started [V] |
| Accepter un contrat d'utilisation du service | probable au premier appel | oui | codes `EulaNotAccepted` et `LoginFailed` dans `MetaHumanServiceRequest.h` [V] ; déroulé à l'écran [AC] |
| Contenus Fab (vêtements tiers) | oui | oui | hors essai |

- Mécanisme [V] : authentification EOS (`MetaHumanCloudAuthenticationInternal.h` : `LoginAsync`, `HasLoggedInUser`). La doc Python dit : « the first `request_auto_rigging` call against a session triggers the sign-in flow ».
- Assemblage [V] : page [Assembly](https://dev.epicgames.com/documentation/en-us/metahuman/assembly) : « To be assembled, a character must be rigged and the high-resolution textures downloaded. »

Points ouverts [AC] :
- La connexion persiste-t-elle d'une session à l'autre ? La doc ne le dit pas. Il faut prévoir que Julien se connecte au moins une fois, dans l'éditeur.
- Contournement possible de l'auto-rig : `import_from_face_dna` avec `import_whole_rig=True` sur le DNA archétype local (`MetaHumanCoreTech/Content/ArchetypeDNA/SKM_Face.dna`, 11 Mo) donne une tête déjà riggée. Mais le test d'Epic montre que l'assemblage exige aussi les textures téléchargées. Le cloud reste donc nécessaire en pratique.

Gratuité : aucune étape payante n'apparaît dans le code ni dans la doc.

## 3. Licence

Source principale : [metahuman.com/license](https://www.metahuman.com/license), page officielle Epic. D'après ses métadonnées, elle a été créée le 26/05/2025 et mise à jour le 02/02/2026. Je l'ai lue le 20/11/2026.

Citations [V] :
- « MetaHuman is included as part of your standard Unreal Engine license, meaning it's free to use for anyone making under $1 million USD in revenue and standard Unreal Engine terms apply above that threshold. »
- « From Unreal Engine 5.6, your use of MetaHuman is included under the terms of your existing Unreal Engine license. »
- Interdiction liée à l'IA : on ne peut pas utiliser les personnages ou les courbes d'animation MetaHuman pour « build or enhance any database or train or test artificial intelligence, machine learning [...] ». Comparer des positions à un oracle n'est pas concerné.

Pour Equestrian Tour : c'est un jeu Unreal publié sur l'App Store, donc la licence Unreal standard s'applique et MetaHuman n'ajoute aucun coût.

Redevance Unreal standard [AC] : 5 % du chiffre d'affaires brut au-delà du premier million de dollars, par produit et sur toute sa durée de vie. Ce chiffre vient de la page [unrealengine.com/license](https://www.unrealengine.com/license), que je n'ai pas pu lire directement (403). Il faudra le confirmer sur le texte du contrat avant publication.

Ce qui reste à vérifier avant l'App Store [AC] :
- le texte exact du contrat Unreal en vigueur (pages 403 pour les outils) ;
- la mise à jour du contrat annoncée le 29/10/2026 sur l'entraînement d'IA ;
- l'état Beta du Creator, qui n'empêche pas d'expédier, mais signifie une API mouvante.

## 4. Mobile et iOS

### 4.1 Niveaux de détail : chiffres officiels

Source [V] : [Platform Support and LOD Specifications](https://dev.epicgames.com/documentation/en-us/metahuman/platform-support-and-lod-specifications-for-metahumans).

Pour iOS et Android :
- pas de lancer de rayons ;
- cheveux en **cartes** ;
- **meilleur LOD utilisable : 3** ;
- textures de 2048 au maximum.

LOD 3 (valeurs indicatives d'Epic) :
- tête : 2 500 sommets, 283 os, 8 influences ;
- pas de blendshapes ni de cartes animées ;
- corps : 1 507 sommets, sans correctifs, 4 influences ;
- cheveux en cartes : 3 000 sommets ;
- pas de physique.

LOD 4 à 7 : tête de 1 300 à 130 sommets, cheveux en maillage de 500 à 100 sommets.

### 4.2 Options d'assemblage

- **UE Optimized** : moins de 100 Mo en moyenne, LOD plus agressifs, textures compressées. **UE Cine** : 1 à 2 Go (page Assembly [V]).
- Le préréglage Low (`BP_DefaultLegacyPipeline_Low.uasset`) référence `Face_LODSettings_Low` et `Body_LODSettings_Low`, avec des plafonds de texture `Res256` et `Res512`. Vérifié par `strings` [V] ; la répartition exacte par texture et les indices de LOD gardés restent [AC].
- Le pipeline expose `LODProperties.FaceLODs` et `BodyLODs` (« Which LODs [...] are going to be in the built MetaHuman »), `MaxTextureResolutions` et `bUsePreBakedGrooms` (`MetaHumanDefaultEditorPipelineBase.h` [V]).
- Au runtime, `MetaHumanComponentBase.h` [V] permet de couper des coûts par seuil de LOD : `RigLogicLODThreshold`, `ControlRigLODThreshold`, `bEnableBodyCorrectives`, `bEnableNeckCorrectives`, `bEnableNeckProcControlRig`, `RigidBodyLODThreshold`.

### 4.3 Réglages recommandés par Epic

Source [V] : [Requirements and Configuration Settings](https://dev.epicgames.com/documentation/metahuman/requirements-and-configuration-settings-for-metahumans-in-unreal-engine?lang=en-US).

- 75 os au maximum par appel de dessin sur GPU mobile : `Compat.MAX_GPUSKIN_BONES=75`.
- Cheveux : `r.HairStrands.UseCardsInsteadOfStrands=1` et `r.HairStrands.MinLOD=3`.
- `r.EarlyZPass=3` et `r.Mobile.EarlyZPassOnlyMaterialMasking=1`.
- Taille de texture plafonnée par `MaxLODSize` dans le profil d'appareil.
- Le projet d'exemple MetaHumans contient des configurations iOS et Android.

### 4.4 Compatibilité de compilation

Les modules runtime existent compilés pour iOS en Shipping dans le moteur installé : fichiers `.o` sous `Intermediate/Build/IOS/arm64/UnrealGame/Shipping` [V]. C'est le cas pour :
- MetaHumanCharacter, MetaHumanCharacterPalette, MetaHumanDefaultPipeline ;
- MetaHumanSDKRuntime, MetaHumanCoreTech, MetaHumanCrowd ;
- RigLogic ;
- HairStrandsCore et HairStrandsRuntime ;
- ControlRig, IKRig ;
- ChaosClothAssetEngine, ChaosOutfitAssetEngine.

### 4.5 Coût sur iPhone

**Aucun chiffre officiel par appareil.** Il faudra mesurer sur un appareil réel, et aucun n'est branché [AC].

- Matériaux : en 5.8, l'Optimized ne cuit pas les matériaux (doc Python [V]). Le coût du matériau de peau MetaHuman en rendu mobile « forward » (`r.Mobile.ShadingPath=0` dans `Config/DefaultEngine.ini` du projet), et son nombre d'échantillonneurs de texture, sont à mesurer [AC].
- Cheveux sous le casque : couper le groom ou prendre une coiffure courte en cartes. Le web fait pareil avec son chignon [AC].

### 4.6 Control Rig et Full Body IK

- Compilés pour iOS [V].
- Le coût de Full Body IK dépend surtout du nombre d'itérations (« increasing this value also increases the CPU cost », [Control Rig Full-Body IK](https://dev.epicgames.com/documentation/en-us/unreal-engine/control-rig-full-body-ik-in-unreal-engine) [V]). Epic ne publie aucun chiffre iOS.
- Recommandation [AC, à mesurer] : porter les règles du web en IK deux os par membre (pied vers l'étrier, main vers les rênes), avec des cibles exprimées dans le repère du cheval. C'est la même structure que `src/entities/human/anim.js` (`DEFAULT_FIT`, stirrupX/Y/Z, kneeOut, handX/Y/Z). Full Body IK seulement si nécessaire, avec peu d'itérations. On peut aussi écrire un RigUnit C++ si le coût de la VM se voit.

### 4.7 Squelette

Le corps MetaHuman a bien `root`, `pelvis`, `spine_01` à `spine_05`, `neck_01` et `neck_02`, `head`, `clavicle`, `upperarm`, `lowerarm`, `hand`, `thigh`, `calf`, `foot` et `ball` (chaînes lues dans `ArchetypeDNA/SKM_Body.dna` [V]), plus des os de torsion et des correctifs.

Le cavalier du web a 53 os : `Root`, `pelvis`, `spine_01` à `spine_03`, `neck_01`, `head`, les doigts, `thigh`, `calf`, `foot` et `ball` ([V], `public/real/rider_f.glb`). Les noms des membres coïncident. Seuls le dos (3 vertèbres contre 5) et le cou (1 contre 2) diffèrent : on porte donc les règles par **effecteurs**, pas par rotations d'os.

## 5. Disque

- Libre maintenant [V] : `df -h /Users/julien` donne 228 Gio au total, 184 Gio utilisés, **13 Gio libres** (94 %). C'est 4 Go de moins que les 17 Go annoncés précédemment, à cause du travail en cours.
- Déjà occupé [V] : plugins MetaHuman environ 2 Go (dont 761 Mo pour le Creator) ; cache dérivé Zen 7,2 Gio ; projet : Intermediate 2,7 Gio, Saved 2,1 Gio, Content 472 Mo.

Besoin estimé pour l'essai :

| Poste | Taille | Statut |
|---|---|---|
| Core Data | environ 6 Go | [AC], un seul témoignage, 5.7.1 |
| MetaHuman assemblé, UE Optimized | moins de 100 Mo en moyenne | [V], page Assembly |
| MetaHuman assemblé, Low avec textures 256/512 | sensiblement moins | [AC] |
| UE Cine, toutes LOD | 1 à 2 Go | [V], page Assembly ; inutile pour iOS |
| Asset source avec textures 2k téléchargées, cache dérivé et shaders Mac et iOS | plusieurs Go | [AC], à mesurer |

Conclusion : 13 Gio suffisent tout juste pour Core Data et un essai Optimized Low. C'est insuffisant si l'autre travail continue de consommer de la place. Il faut libérer de l'espace avant d'installer Core Data. C'est une décision de Julien, rien n'a été supprimé.

Mémoire, d'après un sujet du forum Epic du 02/11/2026 (UE 5.8.4, Windows, 32 Go) [AC] : un assemblage Cinematic scripté fait grimper la mémoire de 5 à 18 Go, sans jamais la rendre, même après le ramasse-miettes. La contre-mesure proposée est de relancer l'éditeur entre deux assemblages ([forum](https://forums.unrealengine.com/t/5-8-4-metahuman-creator-editor-memory-grows-by-5-18-gb-per-scripted-build-and-is-never-released/2848954)). Sur 16 Go, il faut donc un seul assemblage par processus, en Optimized Low, avec la machine libre.

## 6. Vêtements de monte

**Ce que fournit Epic.**
- Deux types d'articles de garde-robe [V] : la tenue paramétrique Chaos Outfit (`OA_`, retaillée au corps, emplacement `Outfits`) et le maillage squelettique à taille fixe (emplacement `SkeletalMesh`, `Config/Editor.ini`).
- Les vêtements par défaut sont dans Core Data (`WI_DefaultGarment`), non installé.
- Je ne connais aucune tenue d'équitation Epic : ni casque, ni veste de concours, ni culotte, ni bottes hautes [AC].
- Le retaillage d'une tenue se fait à l'assemblage, dans l'éditeur, pas au runtime (réponse d'Epic sur le forum [AC]).
- Le processus de création de tenue paramétrique est documenté ([Creating Parametric Clothing](https://dev.epicgames.com/documentation/metahuman/creating-parametric-clothing-for-metahuman?lang=en-US) [V]) : corps sources créés dans le Creator, Outfit Asset, empaquetage.

**Tenue du web : `public/real/rider_f.glb`, lu avec `glb_inspect.py` [V].**
- Vêtements déjà séparés en maillages skinnés sur le même squelette :
  - `Cloth_jacket` (2 153 sommets) ;
  - `Cloth_shirt` (1 603) ;
  - `Cloth_jeans` (645), teinté en culotte ;
  - `Cloth_boots` (1 952).
- Les bottes hautes `Cloth_tallboots` (638 sommets) sont une **primitive du maillage du corps**. On peut les séparer par matériau, mais elles ne forment pas un objet à part.
- Cheveux `Hair_ponytail01` (3 902 sommets).
- Le **casque n'est pas dans le glb**. Il est procédural (`src/entities/ridingHelmet.js`, étude photo d'un Samshield 2.0) et fixé à l'os de la tête.
- Les couleurs viennent de `applyOutfit` (`src/entities/realistic.js`) et de `_outfit` (`src/gameplay/player.js`) : par exemple veste `#1f2b45` ou `#1b1c1f`, culotte `#f2f1ec`, bottes `#121214`, casque `#16171a`.
- Licence : MakeHuman et CharacterCreator, CC0 (`public/real/LICENSES.md`) [V].

**Chemin proposé [AC].**
- **Casque** : maillage statique attaché à la socket `head`. On l'exporte depuis la géométrie three.js, ou on le reconstruit dans Blender (installé, `/Applications/Blender.app` [V]). C'est le plus simple et le moins coûteux.
- **Veste, chemise, culotte, bottes** : on recale les vêtements CC0 du web sur le corps MetaHuman, exporté par `ExportGeometry`. Dans Blender : déformation sur surface ou rétrécissement, puis transfert des poids depuis le corps MetaHuman. On les importe ensuite comme articles `SkeletalMesh` à taille fixe. Les couleurs passent par un paramètre de matériau, comme sur le web.
- **Tenue paramétrique Chaos Outfit** : seulement si plusieurs morphologies doivent porter la même tenue. Il faut alors plusieurs corps sources ; ce chantier est plus long.
- **Faces du corps cachées sous les vêtements** : à régler pour éviter que la peau ne traverse au genou et à la hanche en position montée [AC].

## 7. Déroulé proposé de l'essai

Chaque étape a son acteur et son préalable.

1. **Julien.** Libérer de la place, puis installer « MetaHuman Creator Core Data » par le Launcher : gratuit, environ 6 Go [AC]. Le faire quand l'autre travail est arrêté.
2. **Tom, scripté.** Créer un projet Unreal d'essai **séparé**, pour ne pas toucher `StridesGrandTour` pendant l'autre chantier. Y activer MetaHumanCharacter et PythonScriptPlugin. Créer la cavalière, régler la morphologie sur les proportions du cavalier du web (contraintes de taille, ou conformation sur `rider_f`), la peau, une coiffure courte en cartes et les yeux.
3. **Julien, une fois.** Se connecter à son compte Epic dans l'éditeur au premier auto-rig, et accepter les conditions du service s'il y en a. Ensuite : auto-rig `JOINTS_ONLY` et textures 2k, scriptés avec `blocking=True`.
4. **Tom, scripté.** Assemblage `OPTIMIZED` / `LOW`, un seul par processus. Mesurer la taille sur disque, le nombre d'os et de sections, les LOD gardés et la mémoire de pointe.
5. **Tom.** Casque statique et vêtements du web recalés. Control Rig de monte : IK deux os, cibles pied/étrier, genou et mains dans le repère du cheval PJL. Oracle exporté du web image par image, comme pour le CSO.
6. **Tom.** Page de comparaison côte à côte avec le web, à l'arrêt et au galop, coût mesuré sur le Mac. Mesure iPhone dès qu'un appareil est branché.

**Option qui réduit le risque [AC].** Porter d'abord les règles de monte dans Control Rig sur le cavalier déjà importé (`unreal/ImportSource/rider_f_unreal.glb`, mêmes noms d'os de membres). Les règles sont alors prouvées par oracle sans dépendre de MetaHuman. On change ensuite de maillage, et seules les cibles bougent.

## 8. Bloquants

1. Core Data non installé : installation par le Launcher, environ 6 Go [AC]. Décision de Julien.
2. Auto-rig et textures obligatoires pour assembler : il faut le compte Epic de Julien et l'accès réseau aux deux services, plus S3.
3. 13 Gio libres seulement, avec un autre travail qui consomme.
4. Mémoire de 16 Go face à une fuite signalée en 5.8.4 sur les assemblages scriptés [AC].
5. Fonctionnement sans interface (commandlet, RHI nul) à valider par un test [AC].
6. Aucun appareil iOS branché : le coût réel ne peut pas être mesuré.
7. Creator en Beta, et `InitializeFromPreset` non exposée à Python.

## Sources

- Fichiers locaux, en lecture seule :
  - `/Users/Shared/Epic Games/UE_5.8/Engine/Plugins/MetaHuman/**` (`.uplugin`, `Config/*.ini`, en-têtes `Source/**/Public`, `Content/Python/**`) ;
  - `/Users/Shared/Epic Games/UE_5.8/Engine/Plugins/Experimental/Toolsets/MetaHumanGenerator` ;
  - `/Users/Shared/Epic Games/UE_5.8/Engine/Plugins/Animation/ControlRig/Content/Python/ControlRigWorkflows` ;
  - `~/Library/Application Support/Epic/EpicGamesLauncher/Data/Manifests/*.item` ;
  - dépôt : `public/real/rider_f.glb`, `public/real/LICENSES.md`, `src/entities/realistic.js`, `src/entities/ridingHelmet.js`, `src/gameplay/player.js`, `src/entities/human/anim.js`, `unreal/StridesGrandTour/StridesGrandTour.uproject`, `unreal/StridesGrandTour/Config/DefaultEngine.ini`.
- [MetaHuman Creator Python Scripting in Unreal Engine (5.8+)](https://dev.epicgames.com/documentation/metahuman/metahuman-creator-python-scripting-in-unreal-engine?lang=en-US)
- [Getting started with MetaHuman Creator in Unreal Engine](https://dev.epicgames.com/documentation/metahuman/getting-started-with-metahuman-creator-in-unreal-engine)
- [Assembly](https://dev.epicgames.com/documentation/en-us/metahuman/assembly)
- [Platform Support and LOD Specifications for MetaHumans](https://dev.epicgames.com/documentation/en-us/metahuman/platform-support-and-lod-specifications-for-metahumans)
- [Requirements and Configuration Settings for MetaHumans](https://dev.epicgames.com/documentation/metahuman/requirements-and-configuration-settings-for-metahumans-in-unreal-engine?lang=en-US)
- [Tailoring Your Own Wardrobe Items](https://dev.epicgames.com/documentation/metahuman/tailoring-your-own-wardrobe-items)
- [Creating Parametric Clothing for MetaHuman](https://dev.epicgames.com/documentation/metahuman/creating-parametric-clothing-for-metahuman?lang=en-US)
- [Control Rig Full-Body IK](https://dev.epicgames.com/documentation/en-us/unreal-engine/control-rig-full-body-ik-in-unreal-engine)
- [MetaHuman Licensing](https://www.metahuman.com/license) (mise à jour le 02/02/2026)
- [Unreal Engine licensing](https://www.unrealengine.com/license) (non lisible par outil, 403)
- [Forum : mémoire en 5.8.4, 02/11/2026](https://forums.unrealengine.com/t/5-8-4-metahuman-creator-editor-memory-grows-by-5-18-gb-per-scripted-build-and-is-never-released/2848954)
- Taille de Core Data (environ 6 Go, 5.7.1) : un message de forum relevé par la recherche web, sans fil précis identifié ; chiffre [AC], à lire dans le Launcher au moment de l'installation.
