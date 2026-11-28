# Essai de monte, voie A, étape 7 : coût de la cavalière montée par les règles, ligne de base

Le plan (`plan-essai.md`, étape 7) place ce tableau dans `unreal/docs/essai-metahuman/cout.md`. La voie B (MetaHuman) est
écartée et ce dossier n'existe pas : le tableau est rangé ici, avec les autres pages de la voie A.

**Rappel.** Les chiffres du Mac classent les options entre elles. Ils ne disent pas le coût sur iPhone ou iPad (étape 16,
non faite : aucun appareil branché).

## Ce qui est mesuré, et comment

- **Mode** `-StridesShots=perf` (`SG/StridesShots.cpp`, `AStridesShots::TickPerf`), rendu GPU réel, jeu lancé par
  `UnrealEditor <uproject> -game -windowed -ResX=844 -ResY=390` (binaire de développement de l'éditeur, comme toutes les
  captures du banc : ce n'est pas un paquet Shipping).
- **Scène** : fenêtre de 844 × 390, cheval à l'entrée du tracé du Pôle, cavalière en selle, activité lancée au poteau et
  « Entrer en piste » touché, donc caméra de concours du jeu (`AStridesHorse::StepCourseCamera`) et HUD d'épreuve affiché.
- **Phases** : `arret` (cheval immobile, comme le scénario E1), puis `galop` (parcours de démonstration, mesure à partir du
  premier galop hors saut). **Le galop à gauche d'E2g n'est pas rejouable dans Unreal** : le cheval Unreal n'a pas les clips
  en miroir (étape 5, écart 1) ; la phase `galop` est le galop du parcours de démonstration, sauts compris s'il en
  rencontre (nombre d'images en saut donné par passe).
- **Par phase** : 120 images de chauffe, puis 600 images mesurées. Par image : `GGameThreadTime` (temps du jeu),
  `GRenderThreadTime` (rendu), `RHIGetGPUFrameCycles(0)` (GPU), convertis en ms, et pas de l'image ; ce sont les temps de
  l'image précédente, relevés au tick de fin d'image. LOD prédit du maillage du corps de la cavalière
  (`GetPredictedLODLevel`), nombre d'os (`GetNumBones`). Mémoire (`FPlatformMemory::GetStats`, `UsedPhysical` et
  `PeakUsedPhysical`) toutes les 30 images, pour ne pas peser sur le temps du jeu.
- **Statistiques** : médiane et 95e centile (définition « type 7 », `StridesCore/PerfStats`, ctest « perf » et
  `Strides.Shots.PerfStats`) écrits par le jeu dans `perf-unreal.json` ; `scripts/unreal/perf-summary.py` les recalcule
  depuis les valeurs brutes avec `statistics.quantiles` de Python (implantation indépendante) et vérifie l'égalité.
- **Passes** : trois par configuration, en alternance `actuel`, `regles`, `actuel`… pour ne pas mettre une dérive de la
  machine au compte d'une configuration. Valeur d'une configuration : moyenne des médianes de ses passes. Dispersion :
  (max − min) / min des médianes des passes.
- **Préconditions** vérifiées par le script avant chaque passe : session graphique ouverte (`who` : console), économiseur
  d'écran arrêté (`pgrep -x ScreenSaverEngine`), aucune autre instance d'UnrealEditor ; écran réveillé (`caffeinate -u`),
  et `caffeinate -d -i` pendant la passe.

Commande :

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
python3 scripts/unreal/perf-summary.py --mesurer --sortie=<dossier de travail> --passes=3 --libre --apercu-mobile --ecrire
python3 scripts/unreal/perf-summary.py unreal/docs/parite/monte/perf    # résumé seul, depuis les fichiers versionnés
```

Fichiers : `perf/<config>-<n>.json` (valeurs brutes de chaque passe), `perf/resume.json` (résumé du script). Les captures
de contrôle (`perf-arret.png`, `perf-galop.png`, prises après la mesure) restent dans le dossier de travail.

## Ligne de base

<!-- perf-summary:debut (écrit par scripts/unreal/perf-summary.py, ne pas modifier à la main) -->

| Configuration | Phase | Passes | Jeu (ms) méd. [p95] | Rendu (ms) méd. [p95] | GPU (ms) méd. [p95] | Image (ms) méd. | Dispersion des médianes jeu / rendu / GPU | Règle + sellerie (ms) méd. | Mémoire résidente (Mo) méd. / pic | Os du corps, LOD | Images : caméra de concours / au galop / en saut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| actuel | arret | 3 × 600 | 1,320 [1,549] | 16,660 [17,247] | 13,638 [15,316] | 16,66 | 1,9 % / 0,1 % / 3,5 % | — | 5529 / 7457 | 53, LOD 0 | 600/600/600 ; 0/0/0 ; 0/0/0 |
| actuel | galop | 3 × 600 | 1,319 [1,497] | 16,657 [17,210] | 13,930 [15,114] | 16,66 | 0,6 % / 0,0 % / 0,4 % | — | 5534 / 7457 | 53, LOD 0 | 600/600/600 ; 600/600/600 ; 43/43/43 |
| actuel-libre | arret | 3 × 600 | 1,315 [1,523] | 16,661 [17,213] | 13,567 [15,236] | 16,66 | 2,9 % / 0,0 % / 2,3 % | — | 5501 / 7407 | 53, LOD 0 | 600/600/600 ; 0/0/0 ; 0/0/0 |
| actuel-libre | galop | 3 × 600 | 1,334 [1,655] | 16,658 [17,260] | 13,949 [15,269] | 16,66 | 5,3 % / 0,1 % / 0,4 % | — | 5517 / 7407 | 53, LOD 0 | 600/600/600 ; 600/600/600 ; 43/33/43 |
| actuel-mobile | arret | 1 × 600 | 1,069 [1,187] | 4,727 [4,973] | 7,692 [8,950] | 16,66 | 0,0 % / 0,0 % / 0,0 % | — | 5128 / 7100 | 53, LOD 0 | 600 ; 0 ; 0 |
| actuel-mobile | galop | 1 × 600 | 1,140 [1,606] | 4,673 [6,029] | 8,255 [9,301] | 16,67 | 0,0 % / 0,0 % / 0,0 % | — | 5132 / 7100 | 53, LOD 0 | 600 ; 600 ; 43 |
| regles | arret | 3 × 600 | 1,351 [1,509] | 16,661 [17,227] | 13,804 [15,187] | 16,67 | 1,3 % / 0,1 % / 0,8 % | 0,0467 | 5489 / 7418 | 53, LOD 0 | 600/600/600 ; 0/0/0 ; 0/0/0 |
| regles | galop | 3 × 600 | 1,365 [1,532] | 16,660 [17,206] | 13,959 [15,141] | 16,66 | 2,3 % / 0,0 % / 1,1 % | 0,0442 | 5495 / 7418 | 53, LOD 0 | 600/600/600 ; 600/600/600 ; 43/44/43 |
| regles-libre | arret | 3 × 600 | 1,347 [1,500] | 16,657 [17,235] | 13,729 [15,222] | 16,66 | 0,6 % / 0,0 % / 3,3 % | 0,0475 | 5502 / 7409 | 53, LOD 0 | 600/600/600 ; 0/0/0 ; 0/0/0 |
| regles-libre | galop | 3 × 600 | 1,358 [1,522] | 16,655 [17,240] | 14,032 [15,105] | 16,66 | 0,7 % / 0,0 % / 0,6 % | 0,0449 | 5514 / 7409 | 53, LOD 0 | 600/600/600 ; 600/600/600 ; 44/34/43 |

Critères du plan (étape 7) :

- dispersion actuel arret gameMs : 1,9 % (seuil 5 %) : tenu
- dispersion actuel arret renderMs : 0,1 % (seuil 5 %) : tenu
- dispersion actuel arret gpuMs : 3,5 % (seuil 5 %) : tenu
- dispersion actuel galop gameMs : 0,6 % (seuil 5 %) : tenu
- dispersion actuel galop renderMs : 0,0 % (seuil 5 %) : tenu
- dispersion actuel galop gpuMs : 0,4 % (seuil 5 %) : tenu
- dispersion actuel-libre arret gameMs : 2,9 % (seuil 5 %) : tenu
- dispersion actuel-libre arret renderMs : 0,0 % (seuil 5 %) : tenu
- dispersion actuel-libre arret gpuMs : 2,3 % (seuil 5 %) : tenu
- dispersion actuel-libre galop gameMs : 5,3 % (seuil 5 %) : NON TENU
- dispersion actuel-libre galop renderMs : 0,1 % (seuil 5 %) : tenu
- dispersion actuel-libre galop gpuMs : 0,4 % (seuil 5 %) : tenu
- dispersion regles arret gameMs : 1,3 % (seuil 5 %) : tenu
- dispersion regles arret renderMs : 0,1 % (seuil 5 %) : tenu
- dispersion regles arret gpuMs : 0,8 % (seuil 5 %) : tenu
- dispersion regles galop gameMs : 2,3 % (seuil 5 %) : tenu
- dispersion regles galop renderMs : 0,0 % (seuil 5 %) : tenu
- dispersion regles galop gpuMs : 1,1 % (seuil 5 %) : tenu
- dispersion regles-libre arret gameMs : 0,6 % (seuil 5 %) : tenu
- dispersion regles-libre arret renderMs : 0,0 % (seuil 5 %) : tenu
- dispersion regles-libre arret gpuMs : 3,3 % (seuil 5 %) : tenu
- dispersion regles-libre galop gameMs : 0,7 % (seuil 5 %) : tenu
- dispersion regles-libre galop renderMs : 0,0 % (seuil 5 %) : tenu
- dispersion regles-libre galop gpuMs : 0,6 % (seuil 5 %) : tenu
- delta jeu regles - actuel arret : 0,031 ms (seuil 0,3 ms) : tenu
- delta jeu regles - actuel galop : 0,047 ms (seuil 0,3 ms) : tenu
- delta jeu regles-libre - actuel-libre arret : 0,033 ms (seuil 0,3 ms) : tenu
- delta jeu regles-libre - actuel-libre galop : 0,025 ms (seuil 0,3 ms) : tenu
- information, Δ regles − actuel vsync arret renderMs : 0,001 ms
- information, Δ regles − actuel vsync arret gpuMs : 0,166 ms
- information, Δ regles − actuel vsync arret frameMs : 0,005 ms
- information, Δ regles − actuel vsync galop renderMs : 0,003 ms
- information, Δ regles − actuel vsync galop gpuMs : 0,029 ms
- information, Δ regles − actuel vsync galop frameMs : -0,000 ms
- information, Δ regles − actuel libre arret renderMs : -0,004 ms
- information, Δ regles − actuel libre arret gpuMs : 0,162 ms
- information, Δ regles − actuel libre arret frameMs : 0,003 ms
- information, Δ regles − actuel libre galop renderMs : -0,003 ms
- information, Δ regles − actuel libre galop gpuMs : 0,083 ms
- information, Δ regles − actuel libre galop frameMs : -0,006 ms

<!-- perf-summary:fin -->

## Lecture (24/11/2026, Mac mini M2, 16 Go, macOS 26.5.2, Metal SM6, écran 4K, UE 5.8 binaire de développement)

**Critères du plan, configurations `actuel` et `regles` : tenus.**
- Dispersion des médianes entre passes : 3,5 % au plus (GPU à l'arrêt, `actuel`), 2,3 % au plus pour le temps du jeu ; seuil
  5 %.
- Δ temps du jeu `regles` − `actuel` : **+0,031 ms à l'arrêt, +0,047 ms au galop** (seuil 0,3 ms). C'est l'ordre de
  grandeur du coût mesuré par les composants eux-mêmes (règle et sellerie : 0,044 à 0,047 ms par image, médiane).
- Les deux configurations ont le même corps : 53 os, LOD 0 à toutes les images (cavalière à quelques mètres de la caméra).

**Ce que les chiffres ne disent pas, ou disent mal.**
1. **Temps du rendu** (`GRenderThreadTime`) : 16,66 ms dans toutes les passes en SM6, égal au pas de l'image. Le fil de rendu
   attend l'écran (60 Hz) et cette attente est comptée : la valeur ne mesure pas le travail du rendu. En aperçu mobile, il
   tombe à 4,7 ms : l'attente n'y est pas comptée de la même façon. Cause exacte à confirmer.
2. **Variante `-libre`** (`r.VSync 0`, `t.MaxFPS 0` par `-ExecCmds`) : les deux variables sont bien posées (journal), mais
   l'image reste à 16,66 ms : sur ce Mac, en fenêtre, le jeu reste calé à 60 Hz. Ces passes sont donc une **répétition
   dans les mêmes conditions**, pas une mesure sans synchronisation. Elles confirment le Δ du jeu (+0,033 et +0,025 ms). Une
   dispersion y dépasse le seuil : temps du jeu au galop en `actuel-libre`, 5,3 %, à cause d'un p95 plus haut sur une passe.
   Cela ne touche pas les configurations du plan.
3. **GPU** (`RHIGetGPUFrameCycles`) : environ 13,6 à 14,0 ms pour 844 × 390, Δ `regles` − `actuel` de +0,17 ms à l'arrêt
   et +0,03 ms au galop. C'est en dessous de la dispersion entre passes (jusqu'à 0,47 ms) : **aucune différence de GPU
   attribuable à la règle n'est mesurée**. Sur Metal, ce compteur pourrait inclure des temps morts entre tampons de
   commandes : la valeur absolue est **à confirmer** (Instruments ou `stat gpu`), le classement relatif reste valable.
4. **Mémoire** : `UsedPhysical` est celle du processus entier (éditeur lancé en `-game`, 5,5 Go). `regles` y est 40 Mo plus
   bas qu'`actuel` : bruit de l'éditeur, pas un gain. Cette mesure ne départage pas les options ; le coût mémoire propre de
   la règle n'est pas mesuré.
5. **À-coups** : au galop, chaque passe contient une ou deux images isolées de 54 à 91 ms (temps du jeu), dans les deux
   configurations. Elles pèsent sur le maximum, pas sur la médiane ni sur le 95e centile. Cause non cherchée (chargement
   en flux probable, à confirmer).
6. **Galop** : celui du parcours de démonstration (6,2 m/s, galop à droite des clips d'origine, 43 ou 44 images en saut
   sur 600), et non E2g (galop à gauche, sans clip en miroir dans Unreal).

## Aperçu du rendu mobile sur Mac (essai, noté à part)

`-FeatureLevelES31` (Metal ES3_1, plateforme de shaders `METAL_ES3_1`), configuration `actuel` seule, une passe :
- **Premier essai** : compilation des shaders mobiles pendant environ 6 min, un `ensure` du moteur au démarrage
  (`MetalStateCache.cpp:2273`, « Mismatched texture type »), phase d'arrêt mesurée, puis **jeu figé à la demande de
  capture de contrôle** (plus aucune ligne au journal pendant 10 min). J'ai arrêté ce processus, que j'avais lancé.
  Aucun fichier de résultat.
- **Second essai**, avec `-StridesPerfSansCapture` (option ajoutée pour cela) : passe complète, même `ensure` au démarrage.
  Temps du jeu 1,07 ms à l'arrêt et 1,14 ms au galop ; GPU 7,7 et 8,3 ms ; rendu 4,7 ms ; image toujours à 16,66 ms.
- Ce n'est **pas** une mesure iPhone : même machine, même binaire de développement, chemin de rendu mobile émulé. Une seule
  passe, sans `regles`, donc ni dispersion ni Δ. Le blocage à la capture et l'`ensure` Metal restent à comprendre avant
  d'utiliser ce mode.
