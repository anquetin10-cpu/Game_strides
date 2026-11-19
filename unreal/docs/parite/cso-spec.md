# Spécification exacte — parcours CSO du Pôle (jeu web → Unreal, tranche a)

Référence : jeu web du dépôt (`src/`, `tests/`), branche `claude/unreal-port`, commit `5837a02e` (18/11/2026), dont le
web correspond à `claude/gt-humains-v3` (c7268de). Règles, CSO et monde identiques à la production 84dee94.
Toutes les références `fichier:ligne` pointent dans ce dépôt. Les textes cités sont les clés françaises exactes
(`t('…')`) ; l'anglais est dans `src/i18n/en/gameplay.js` et `src/i18n/en/ui.js` (ex. `CLOCHE` → `BELL`,
`src/i18n/en/gameplay.js:194`). Unités : mètres, secondes, radians sauf mention. Repère web : x vers l'est, z vers le
sud, cap h → direction (sin h, cos h) (`src/gameplay/csoCourse.js:9`).

Quatre façons d'entrer sur ce même parcours ; la spécification décrit la référence **`cso_train` (« Parcours du
Pôle », Prix STRIDES)** et signale les écarts des autres :

| Entrée | Définition | Hauteur | Temps accordé | Présentation | Carte de fin |
|---|---|---|---|---|---|
| Activité `cso_train` (référence) | `src/gameplay/activities.js:30-40` | `csoHeights(1.1)` | 64 s (368 m à 350 m/min) | oui | bilan CSO, bouton « Quitter l’épreuve » |
| Concours du Pôle (offre Strides) | `src/gameplay/trip.js:142-349` | Am 2 1,05 / Am 1 1,15 / Pro 2 1,25 (`trip.js:143-145`) | 64 / 64 / 59 s | oui + ligne du jury | bilan CSO, bouton « Continuer », dotation |
| Défi du Pôle v6 | `src/gameplay/challenge.js:121-128`, `challengeRun.js:123-211` | tout à 1,10 | 64 s, limite 128 s | non (`present: false`) | carte du défi (`challenge-screens.js:186-227`) |
| Missions d'histoire CSI / GP | `src/gameplay/story.js:704-723`, `735-760` | `csoHeights(1.4)` / `csoHeights(1.55)` | 59 / 56 s | oui + jury | carte de mission (pas d'`opts.result`) |

---

## 1. Entrée dans l'épreuve

### 1.1 Où et comment (activité `cso_train`)
- Poteau « chrono » (mât blanc + panneau noir et blanc, `activities.js:70-74`) posé en (CSO_GATE.x + 6, CSO_GATE.z + 7)
  = (336, −184) (`activities.js:33`). Zone d'interaction centrée sur `start` = CSO_GATE = (330, −191)
  (`activities.js:32`, `obstacles.js:47` : `A0.z + A0.d/2 − 5`), rayon 6 m, à cheval seulement, libellé
  **`Chrono`**, icône `target`, priorité 1, seulement sans mission active (`activities.js:84-94`).
- Depuis le téléphone : app « Activités » › section **`Entraînements libres (chrono)`** › carte « Parcours du Pôle »
  (puce `CSO`, meilleur temps `formatTime`, description) › bouton **`Itinéraire`** (`data-activity="cso_train"`) qui
  pose seulement le GPS sur `a.start` et ferme le téléphone (`src/ui/activities-app.js:89-99`). Le lancement se fait
  toujours au poteau.
- Description affichée : « 8 obstacles dont deux doubles au Pôle International, 1,10 m, barème A au chrono. »
  (`activities.js:31`).
- Lancement (`Activities.start`, `activities.js:98-135`) → `missions.start` : grand message
  **`PARCOURS DU PÔLE`** / **`Événement · Entraînement`** pendant 2600 ms, son `notify`
  (`src/gameplay/missions.js:475-477`). Bandeau d'objectif : tag `Événement · Parcours du Pôle`
  (`missions.js:644-649`).

### 1.2 Déroulé des étapes (ordre exact, `src/gameplay/courses.js:495-539` puis `446-493`)
1. `S.goto(CSO_GATE, 'Entre en piste : rejoins l’entrée de la carrière', { r: 9, mode: 'ride' })`
   (`courses.js:496`). Le joueur y est déjà (poteau à l'entrée) : étape validée à la première image.
2. Contrôle de capacité (`courses.js:499-528`) : si aucun appel (v ∈ {6,2 ; 7,0 ; 7,8} m/s, distance 0,6 → 5 m pas
   0,1) ne passe un élément sans faute, dialogue **Entraîneur** (initiales `EN`) :
   « Obstacles jusqu’à {maxH} m : avec {cheval} et cet équipement, tu plafonnes vers {reach} m. Il faudra un cheval
   plus puissant ou une selle adaptée (Sellerie du Port, « Mes chevaux »), sinon les barres tomberont. » avec
   reach = jumpPower + 0,2 + clearance (`courses.js:503`).
3. Présentation (§1.3) (`courses.js:529-536`).
4. « Entrée en piste… » (§1.5), puis cloche (§1.6), puis parcours (§2-10), puis bilan (§11), puis étape d'enregistrement
   du record de l'activité (`activities.js:110-130`).

### 1.3 Écran de présentation (carte modale, `courses.js:119-138`, gabarit `src/ui/screens.js:159-177`)
- Kicker : `EQUESTRIAN TOUR · Pôle International` (`CONFIG.title` = `EQUESTRIAN TOUR`, `src/config.js:7` ;
  `opts.place` absent → `Pôle International`, `courses.js:130`).
- Titre : **`Prix STRIDES · Parcours du Pôle`** (`activities.js:36`).
- Grille clé / valeur (`.cso-pres`, 2 colonnes, 14 px, clé opacité 0,65, valeur gras, `src/styles.css:246-248`) :

| Clé | Valeur (cso_train) | Source |
|---|---|---|
| `Épreuve` | `Amateur 1,10 m · barème A au chrono` | `courses.js:122`, `activities.js:36` |
| `Hauteur` | `1,10 m · difficulté moyenne` (hauteur la plus fréquente ; < 1,08 Facile, < 1,18 Moyenne, < 1,35 Difficile, sinon Très difficile) | `courses.js:94`, `51`, `123` |
| `Cheval engagé` | nom du cheval monté | `courses.js:124` |
| `Temps accordé` | `64 s` | `courses.js:125` |
| `Parcours` | `8 obstacles dont 2 doubles (4A – 4B, 6A – 6B) · 368 m` | `courses.js:100-108`, `126` |

- Ligne du jury (`.cso-jury`) seulement si `intro` (absente pour cso_train). Concours :
  « Concurrent n° {dossard}, {joueur} et {cheval}. Barème A au chrono, temps accordé 1:04. » (`trip.js:271`).
- Règles (`.cso-rules`, 12,5 px, opacité 0,8) : « Barre ou premier refus : 4 points · deuxième refus : élimination ·
  1 point par seconde entamée au-delà du temps accordé. » (`courses.js:132`).
- Boutons : `Voir le plan` (`data-id="plan"`) ; `Entrer en piste` (primaire, `data-id="enter"`) (`courses.js:133-136`).
  Tout bouton ferme la carte (sauf `keep`) puis exécute son action (`screens.js:162-168`).
- Carte ouverte = simulation en pause (`src/game.js:1443-1445`), chrono de mission à dt nul (`game.js:1507`).

### 1.4 Plan du parcours (`courses.js:111-118`, `src/ui/coursePlan.js:11-66`)
- Kicker `Plan du parcours`, même titre, SVG + légende, bouton `Retour` (primaire, `data-id="plan-back"`) qui rouvre la
  présentation.
- SVG (nord en haut, viewBox carrière ± 6 m, `coursePlan.js:13-15`) : carrière 120 × 76 sable `#e8dcc0` liseré
  `#1b1c1f` 0,5 ; ouverture d'entrée 7 m au sud et mot `ENTRÉE` ; bande tribunes 78 m `#c9c6bd` au nord et mot
  `TRIBUNES` (`coursePlan.js:18-30`) ; abord entrée → départ en pointillé discret (opacité 0,22, tirets 0,6/1) et
  ligne du cavalier (opacité 0,45, tirets 1,2/1) (`coursePlan.js:32-34`) ; ligne `Départ` verte `#2f6e4a` et `Arrivée`
  rouge `#b8322a`, 7 m (`coursePlan.js:36-40`) ; obstacles : vertical 1 trait, oxer 2 traits (écart = spread), mur
  trait brique `#a4553f` épais 1,3 ; flèche du sens de saut ; pastille noire r 1,85 avec le numéro blanc, à 3,6 m côté
  −t (côté fanion rouge) ; hauteur sous la pastille en `dec(h, 2)` (`coursePlan.js:42-58`). Aucun obstacle surligné
  (`next` non passé).
- Légende : `1 vertical · 2 oxer · 3 vertical · 4A vertical · 4B oxer · 5 mur · 6A vertical · 6B oxer · 7 vertical ·
  8 oxer · 368 m · temps accordé 64 s` (`coursePlan.js:63-66`, `courses.js:115`).

### 1.5 Entrée en piste (`courses.js:450-465`)
- Texte d'objectif : `Entrée en piste…`. Hauteurs posées (`setHeights`), barres remises, numéro 1 surligné.
- Mode concours **dès maintenant** : `game.course = { running: false, kind: 'cso', pre: true, camera: true,
  controls: 'cso', jumpTiming: () => 'none' }` (`courses.js:458`) → caméra de concours (§10), commandes de concours
  (§3), HUD allégé (§9) ; tableau de chrono encore masqué (pas de `hud`).
- Grand message : **`N° {dossard} · {joueur}`** / `et {cheval}` (+ ` · {écurie}` au concours) pendant 2400 ms ;
  dossard = `opts.bib ?? run.data.bib ?? 40 + (floor(game.time) % 50)` (`courses.js:459-460`). Son :
  `applause(0.5, 2.2)` (`courses.js:461`). Durée de l'étape : 2,4 s (`courses.js:464`).

### 1.6 Cloche et règle des 45 s
- Étape suivante (une image) : son `bell()` et grand message **`CLOCHE`** / `Tu as 45 s pour franchir la ligne de
  départ` pendant 2000 ms (`courses.js:466-473`).
- `BELL_DELAY = 45` (`courses.js:22-23`). Le décompte `state.bell` diminue de dt tant que le départ n'est pas pris
  (`courses.js:291-292`), affiché dans le tableau `Départ {ceil(bell)} s` · `accordé 64 s` (`src/ui/hud.js:408-410`).
- À 0 : chrono lancé d'office, toast « 45 s écoulées : le chrono est lancé » (`courses.js:298-301`), sans le bip de
  ligne.
- Départ lancé : si au début du parcours le cheval est déjà au-delà de la ligne (0 ≤ s < 12 m, |u| < 3,8 m, cap à 60°
  près), chrono lancé tout de suite avec le bip (`courses.js:271-281`).
- Astuce à l'ouverture du parcours (6000 ms) : « **Gauche/droite** : diriger · **avant/arrière** : cadence (gardée) ·
  **SAUT** au bon moment. Franchis la **ligne de départ**. » (5000 ms et sans la dernière phrase si départ lancé)
  (`courses.js:282-283`).

---

## 2. Piste et parcours

### 2.1 Carrière
- `POLE.arena = { x: 330, z: −224, w: 120, d: 76 }` : x 270 → 390, z −262 → −186 (`src/world/sites.js:67`). Entrée au
  milieu du grand côté sud, `POLE.entrance = (330, −182)` (`sites.js:72`) ; tribunes au nord
  `{ x: 330, z: −273, w: 78, d: 14 }` (`sites.js:68`) ; paddock d'échauffement `(240, −232)`, 40 × 46
  (`sites.js:69`).

### 2.2 Tracé (`src/gameplay/csoCourse.js:19-37`, tracé par `traceCourse` `:43-89`, pas 0,5 m)
- Départ du tracé : local (0, 33) = monde (330, −191), cap π (nord) (`csoCourse.js:22`).
- Commandes : `L 13 45°`, `F 7`, **départ**, `F 11`, **1 v**, `F 14`, `R 17,7 135°`, `F 18`, **2 o (1,3)**, `F 22`,
  **3 v**, `F 12`, `R 14,5 180°`, `F 18`, **4A v**, `F 11,4`, **4B o (1,3)**, `F 18,4`, **5 mur**, `F 29`,
  `L 14 180°`, `F 18`, **6A v**, `F 7,8`, **6B o (1,2)**, `F 25,6`, **7 v**, `F 22`, **8 o (1,5)**, `F 10`, **arrivée**
  (`csoCourse.js:25-34`). Virage à droite du cavalier = cap décroissant (`csoCourse.js:65-66`).
- Abord (lead-in, hors chrono) : 13 × π/4 + 7 = 17,21 m (calcul). Non tracé au sol (le tracé au sol commence à la
  ligne de départ, `obstacles.js:44`) ; visible seulement sur le plan.
- Longueur chronométrée : **368,44 m** (oracle `unreal/core/tests/oracles/cso_course.json`, clé `length`) ;
  `CSO_LENGTH = Math.round(…) = 368` (`obstacles.js:45`).

### 2.3 Obstacles (positions de l'oracle `cso_course.json`, monde = local + (330, −224))

| N° | Type | Spread | Monde x ; z | Cap de saut | s (m) | Hauteur cso_train | Couleurs (barre, bandes) |
|---|---|---|---|---|---|---|---|
| 1 | vertical | — | 313,28 ; −212,84 | 225° (nord-ouest) | 11,00 | 1,05 | `#f2f1ec` / `#17181b` |
| 2 | oxer | 1,3 | 334,33 ; −252,78 | 90° (est) | 84,70 | 1,10 | `#f2f1ec` / `#b8322a` |
| 3 | vertical | — | 356,33 ; −252,78 | 90° | 106,70 | 1,10 | `#f2f1ec` / `#2f5f8a` |
| 4A | vertical | — | 349,83 ; −223,78 | −90° (ouest) | 182,26 | 1,05 | `#f2f1ec` / `#2f6e4a` |
| 4B | oxer | 1,3 | 338,43 ; −223,78 | −90° | 193,66 | 1,10 | `#17181b` / `#f2f1ec` |
| 5 | mur | — | 320,03 ; −223,78 | −90° | 212,06 | 1,10 | barre `#f2f1ec` / `#17181b` |
| 6A | vertical | — | 309,53 ; −195,79 | 90° | 303,04 | 1,10 | `#f2f1ec` / `#b8322a` |
| 6B | oxer | 1,2 | 317,33 ; −195,79 | 90° | 310,84 | 1,10 | `#f2f1ec` / `#2f5f8a` |
| 7 | vertical | — | 342,93 ; −195,79 | 90° | 336,44 | 1,10 | `#f2f1ec` / `#2f6e4a` |
| 8 | oxer | 1,5 | 364,93 ; −195,79 | 90° | 358,44 | 1,15 | `#17181b` / `#f2f1ec` |

- Hauteurs : `csoHeights(h)` = h + profil {1 : −0,05 ; 4A : −0,05 ; 8 : +0,05}, arrondi au cm (`csoCourse.js:36`,
  `96`) ; oracle `heights110` identique au tableau. Décor monde hors épreuve : `csoHeights(1.15)` (`obstacles.js:182`).
- Couleurs : `COLORS[i % 5]` (`obstacles.js:23-29`, `184`). Largeur des barres `w = 3.8` (`obstacles.js:184`).
- Barres jugées : vertical `{ s: 0, h }` ; oxer montant : avant `{ s: −spread/2, h − 0,05 }`, arrière
  `{ s: +spread/2, h }` (`obstacles.js:100-103`). Mur : barre jugée `{ s: 0, h }` mais posée à y = h − 0,05
  (`obstacles.js:128-132`).
- Géométrie vertical/oxer (`src/world/builders.js:594-616`) : chandeliers hauts de h + 0,75, bandes de couleur tous les
  0,5 m, ailes de 0,95 m avec 4 lattes ; deux barres basses fixes à h × 0,62 et h × 0,3 dans le plan avant
  (`obstacles.js:139`) ; jardinières (bac `#5d4632`, buis, fleurs) à w/2 + 1,6 (`obstacles.js:141-143`, `693-705`).
  Barre du haut : cylindre rayon 0,05 en `round(w/0,45)` = 8 bandes alternées, embouts hémisphériques
  (`builders.js:656-670`). Ailes = collisions pleines (vertical et oxer seulement) (`obstacles.js:88-94`).
- Mur : bloc brique `#a4553f` (w × (h − 0,15) × 0,5), couvertine `#e9e6de`, piliers 0,5 × (h + 0,35)
  (`obstacles.js:116-127`).
- Fanions : rouge `#c8262c` côté −X local (droite du cavalier), blanc `#f4f2ec` côté +X, drapeau 0,3 × 0,2 en haut
  d'une hampe de 0,42 (`obstacles.js:679-690`) ; à w/2 + 0,95 et h + 0,75 (vertical/oxer), w/2 + 0,3 et h + 0,4 (mur).
- Panneau numéro : plan 0,9 × 0,9 à (−w/2 − 0,65 ; h + 0,75 ; face avant), tourné vers l'abord (`obstacles.js:159-166`) ;
  le numéro attendu est teinté `#7dffc4`, les autres `#ffffff` (`obstacles.js:671-676`).
- Faces d'entrée/sortie (référence de franchissement) : vertical ±0,06 ; oxer ±(spread/2 + 0,06) ; mur ±0,3
  (`obstacles.js:155-158`).

### 2.4 Lignes de départ et d'arrivée
- `CSO_START` = monde (321,06 ; −205,07), cap 225°, `w: 7` ; `CSO_FINISH` = (374,93 ; −195,79), cap 90°, `w: 7`
  (`obstacles.js:42-43`, oracle `marks`).
- Habillage (`obstacles.js:223-255`) : poteaux blancs 1,6 m à ±3,5 m, fanion rouge `#c62b2b` à gauche (côté −) et
  blanc à droite, cellule photoélectrique jaune `#f0c419` sur trépied à 0,6 m à l'extérieur, ligne de sciure blanche
  au sol 7 × 0,12 ; panneau `DÉPART` / `ARRIVÉE` 1,3 × 0,42 à 1,95 m sur le poteau +t.
- Franchissement (`courses.js:28-36`) : passage de s < 0 à s ≥ 0 le long du cap de la ligne, |u| < w/2 + 0,3 = 3,8 m.
  Départ : cap du cheval à 60° près (produit scalaire ≥ 0,5). Arrivée : **sans** contrainte de cap
  (`courses.js:335`) et seulement après le dernier élément (`courses.js:334`).
- Bip au départ : `tone(1568, 0.1, 'sine', 0.08)` (`courses.js:295`).

### 2.5 Temps accordé, vitesse de référence
- `timeAllowedFor(L, v) = ceil(L / v × 60)` ; `COURSE_SPEED = { national: 350, csi: 375, gp: 400 }` m/min
  (`courses.js:18-20`). Pôle : 64 s (350), 59 s (375), 56 s (400) (oracle `timeAllowed`).
- Temps limite : 2 × temps accordé = 128 s → élimination (`courses.js:332-333`).
- Vitesse de référence de conduite : cadence 6,2 m/s ≈ 372 m/min (`src/gameplay/csoRide.js:12`).

---

## 3. Conduite pendant l'épreuve (`src/gameplay/csoRide.js`, appliquée par `src/gameplay/player.js:642-650`)

| Paramètre | Valeur | Source |
|---|---|---|
| cadence de référence | 6,2 m/s | `csoRide.js:12` |
| vitesse max | 8,0 m/s | `csoRide.js:13` |
| variation de cadence (≥ 4,6 m/s / < 4,6 m/s) | 1,2 / 2,2 m/s² à fond | `csoRide.js:14-15`, `55` |
| zone morte avant/arrière | 0,35 ; ignorée si \|y\| ≤ 0,65 \|x\| | `csoRide.js:16-17`, `53` |
| zone morte direction ; courbe | 0,06 ; exposant 1,35 | `csoRide.js:18-19`, `44-46` |
| rayon mini R(v) | 2,6 + 0,8 v (6,28 m au trot 4,6 ; 7,56 m à 6,2 ; 9,0 m à 8) | `csoRide.js:20-21`, `31` |
| vitesse de rotation max | v / R(v) si v ≥ 1 ; sinon 0,8 + (1/3,4 − 0,8) v (demi-tour sur les hanches) | `csoRide.js:32-38` |
| réponse de direction | τ = 0,2 s, accélération angulaire ≤ 3,0 rad/s² | `csoRide.js:23-24`, `src/entities/horse.js:235-238` |
| direction en l'air | × 0,3 | `csoRide.js:25`, `horse.js:239` |
| rampe clavier | 3,2 /s (× 2 en relâchant ou en inversant) | `csoRide.js:26`, `66-73` |
| perte à la réception | v × (1 − min(0,04 ; \|dev\| × 0,5)) | `csoRide.js:27`, `horse.js:331` |

- Cadence initiale = vitesse réelle du cheval arrondie au dixième (aucun élan automatique) (`csoRide.js:65`) ; elle est
  gardée au joystick relâché ; figée pendant un refus (cabré ou freinage) (`csoRide.js:74-77`).
- Vitesse visée = cadence, **sans** multiplicateur de vitesse du cheval (`horse.js:242`). Accélération du cheval vers
  la cadence : 4,5 m/s² sous 5 m/s, 3,6 au-delà ; décélération 9 m/s² (`horse.js:289-290`).
- Signe : x > 0 (droite) → rotation négative (`csoRide.js:46`).
- Clavier (`src/core/input.js:158-198`) : W/↑ avant, S/↓ arrière, D/→ droite, A/← gauche (codes physiques : Z/Q en
  AZERTY), Espace = SAUT, Échap = pause, P/Tab = téléphone, M = carte. Ctrl gauche / Alt gauche réduisent l'amplitude
  clavier à 0,5 / 0,25 (`input.js:190-198`) : en épreuve, variation de cadence plus lente (0,5) ou nulle (0,25, sous la
  zone morte 0,35).
- Tactile : joystick flottant, rayon 58 px, zone x < 45 % de la largeur et y > 30 % de la hauteur
  (`input.js:16`, `40-43`) ; bouton SAUT (§9). BOOST, sifflet masqués (§9).
- Sortie après l'arrivée : cadence ramenée vers 1,9 m/s (pas) à −1,6 m/s², pendant 2,6 s, commandes et caméra de
  concours gardées (`courses.js:307-313`).
- Pause : menu `Pause` avec rappel « **Épreuve** — **diriger** : joystick gauche/droite (←/→) · **cadence** : joystick
  avant/arrière (↑/↓), gardée quand on relâche · **SAUT** au bon moment (Espace). » et deux bascules :
  `Tracé au sol : affiché|masqué` (`data-id="pause-line"`), `Aide au saut : complète|bouton seul|aucune`
  (`data-id="pause-aid"`, désactivé « Aide au saut : imposée par l’épreuve » au défi) (`src/ui/screens.js:220-245`).
- Téléphone, pause, carte, dialogue : cheval et chrono figés ensemble (`game.js:1486-1489`, `1507`).

---

## 4. Aide à l'appel (`src/gameplay/courseAids.js`)

Réglages par défaut : `jumpAid: 'full'`, `courseLine: true` (`src/core/save.js:37`).

### 4.1 Bouton SAUT coloré (aides `full` et `button`)
- État = `obstacles.timing(cheval)` : `none` si en l'air, en refus ou v < 3,2 m/s ; sinon zone du plan de saut de
  l'obstacle visé, `refuse` affiché comme `near` (`src/gameplay/obstacles.js:370-375`). Aide `off` → `none`
  (`courses.js:187`). Pendant l'entrée en piste : `none` (`courses.js:458`).
- Obstacle visé : le plus proche devant, cos(angle) ≥ 0,5, première barre à ≤ 13 m (`JUMP.reach`) et dernière à
  ≥ −0,3 m, passage entre les chandeliers (|u| ≤ w/2 + 0,35) (`obstacles.js:349-367`). Le bouton se colore donc dès
  13 m.
- Rendu (`src/ui/hud.js:373-380`, `src/styles.css:220-232`) :

| État | Libellé | Signe | Anneau | Fond |
|---|---|---|---|---|
| `far` | `Trop loin` | `»` sur pastille `#f0b33a` | `#f0b33a` | inchangé |
| `good` | `Saute !` | `✓` sur pastille `#5fb87e` | `#5fb87e` + halo `rgba(61,220,151,.55)` 18 px | `rgba(31,92,62,0.78)` |
| `near` | `Trop près` | `!` sur pastille `#e25b4b`, texte blanc | `#e25b4b` | inchangé |
| `none` | `Saut` | — | transparent | `rgba(15,15,14,0.62)` |
| appui trop tôt | `Trop tôt` (600 ms) | — | `rgba(255,255,255,.55)` | inchangé |

### 4.2 Zone d'appel au sol (aide `full` seulement)
- Affichée si l'obstacle suivant est à ≤ 26 m du cheval, recalculée toutes les 0,25 s (`courseAids.js:139-151`).
- Calcul `takeoffZone` : v = max(vitesse, 5,5), distance d de 8 → 0 m par pas de 0,1, abord droit ; bande ambre
  = distances où marge ≥ −0,06 et pas de refus ; bande verte = zone `good` (`courseAids.js:25-34`).
- Bandes posées 0,4 m plus loin (sous les antérieurs), largeur min(w ; 2,2) = 2,2 m, longueur ≥ 0,2, à +0,035 m du sol
  (verte +0,005) (`courseAids.js:153-166`). Verte `#3ddc97` opacité 0,26 ; ambre `#f0b33a` opacité 0,16
  (`courseAids.js:20-21`).

### 4.3 Tracé au sol (réglage `courseLine`, indépendant)
- Tirets 0,7 × 0,26 m tous les 1,5 m, à +0,04 m, vert `#1d7a52` opacité 0,85 jusqu'à l'obstacle suivant, puis 12 m
  après lui à opacité 0,35 ; masqués sur 1,5 m sous le cheval ; si le cheval est à plus de 15 m de la ligne, tout le
  tronçon depuis l'obstacle précédent (`courseAids.js:15-19`, `104-131`).
- Avant le départ, tronçon de la ligne de départ à l'obstacle 1 (`courses.js:304`, `316`).

### 4.4 Repère au-dessus de l'obstacle suivant
- Cône à 3 faces (r 0,16, h 0,3) pointe en bas, `#7dffc4` opacité 0,8, à h + 1,15 + 0,06 sin(2,4 t)
  (`courseAids.js:22`, `55-57`, `133-138`). Toujours affiché quand un obstacle suivant existe (même aide `off`).

### 4.5 Textes liés
- Aucun texte d'aide pendant l'abord ; les textes sont sur le bouton (§4.1). Retour après le saut : §5.6.

---

## 5. Saut (`src/gameplay/jumpModel.js`, `src/entities/horse.js:107-151`, `314-339`)

### 5.1 Déclenchement
- Appui SAUT → `control.jump` (`csoRide.js:86`) → `startJump()` (`horse.js:315-319`).
- Refusé si en l'air, ou v < `minJumpSpeed` 3,2 m/s (`src/config.js:58`) → astuce « Trop lent pour sauter : passe au
  **trot**. » 2500 ms, au plus une fois par 45 s (`game.js:729-736`).
- Refusé si un refus est engagé (`horse.js:110`).
- Épreuve : sans obstacle visé, zone `none`, ou première barre à plus de 1,9 × L0 → aucun saut, bouton `Trop tôt`
  (`horse.js:119-122`, `hud.js:433-442`).
- Zone `refuse` et première barre devant (x ≥ 0) → refus (§7) (`horse.js:124-128`).

### 5.2 Constantes (`jumpModel.js:10-32`)
T 0,8 (hors CSO) ; lift 0,2 ; adapt 0,06 ; shorten 0,12 ; minFront 0,55 ; good 0,15 ; rub 0,06 ; late 0,3 ; maxAngle
0,5 ; reach 13 ; clear 0,32 ; spreadK 0,18 ; T0 0,56 ; Tk 0,1 ; Tmin 0,6 ; Tmax 0,74. Point de référence du saut :
épaules à 0,4 m devant l'origine du cheval (`obstacles.js:33`, `351`). Puissance : 1,35 × jump × (1 + mods.jump) ×
condition (`horse.js:67-69`, `config.js:56`).

### 5.3 Calcul de l'appel (`planJump`, `jumpModel.js:84-131`)
- `speedFactor(v) = (0,72 + 0,28 smoothstep(3,5 ; 6,5 ; v)) × (1 − 0,16 smoothstep(9 ; 12 ; v))` ;
  `angleFactor(cosA) = 1 − 0,6 (1 − cosA)` (`jumpModel.js:40-42`).
- Hcap = puissance × speedFactor × angleFactor ; hauteur voulue = barre la plus haute + 0,32 + 0,18 × écart des barres −
  0,2 ; H = min(Hcap, voulue) ; durée T = clamp(0,56 + 0,1 H ; 0,6 ; 0,74) ; L0 = max(1,5 ; v T)
  (`jumpModel.js:68-78`).
- Longueur visée = première + dernière barre (sommet au milieu) ; L = clamp(idéal ; 0,88 L0 ; 1,06 L0) ;
  dev = L/L0 − 1 ; H × (1 − 1,5 dev²) (`jumpModel.js:94-98`).
- Marge à chaque barre = arcY(H, L, x) + 0,2 + clearance − h_barre, avec arcY = 4 H x (L − x) / L²
  (`jumpModel.js:46`, `99-101`).
- Zone : `refuse` si première barre < 0,55 m ; `good` si marge mini ≥ 0,15 ; sinon `far` si idéal > L0, `near` sinon
  (`jumpModel.js:103-107`).
- Cause si marge < −0,06 : `angle` (cosA < 0,94 et le même appel passerait abord droit), `slow` (speedFactor < 0,97 et
  passerait à max(v ; 6,5)), sinon `far`/`near` ; `tooClose` pour `refuse` (`jumpModel.js:108-129`).

### 5.4 Trajectoire
- Le saut part du point d'appui, avec H = plan.H, longueur plan.L, durée L / max(v ; 1,5) (`horse.js:130-145`).
- Hauteur jumpY = 4 H τ (1 − τ), τ de 0 à 1 (`horse.js:171-173`, `338`) ; pieds = sol + jumpY + 0,2 + clearance
  (`horse.js:73-75`). Sons : `snort` + `hoof(sol, 1.4)` à l'appel (`game.js:721-726`), `landing(1)` + particules de
  sable à la réception (`game.js:716-720`).

### 5.5 Jugement des barres en vol (`obstacles.js:490-539`)
- Chaque barre jugée quand les épaules passent son plan, hauteur interpolée entre deux images : marge = arcY(H, 1, τ)
  + 0,2 + clearance − h. Faute si marge < −0,06 ; effleurement (tinte, vibre) si marge < 0,04 (`obstacles.js:509-530`).
- Une seule faute par élément. Cause : au sol pendant le passage (τ < 0) → `short` ; sinon cause du plan, ou `angle`
  si la marge du plan était ≥ 0, sinon `far` (`obstacles.js:520-525`).
- Résultat émis à la sortie de l'obstacle (`obstacle:clear` ou `obstacle:fault`, avec marge et cause)
  (`obstacles.js:532-552`). Avec membres jugés (§6.3) : différé jusqu'à ce que les épaules soient 2,2 m au-delà de la
  sortie, ou 1,2 s au plus (`obstacles.js:403-410`).

### 5.6 Qualité et retour visuel / textuel
- `takeoffQuality` : `perfect` (zone good et \|dev\| < 0,03), `good`, `bitFar` / `bitNear`, ou la cause
  (`short` → `far`) (`jumpModel.js:135-140`).
- Mot sous le chrono (aide ≠ off), 1500 ms (`courses.js:203-211`, `hud.js:420-430`) :

| Clé | Texte | Couleur |
|---|---|---|
| perfect | `Appel parfait` | `#7dffc4` (good) |
| good | `Bon appel` | `#7dffc4` |
| bitFar | `Un peu loin` | `#fbfaf5` (ok) |
| bitNear | `Un peu près` | `#fbfaf5` |
| far | `Appel trop loin` | `#ff9c8f` (bad) |
| near | `Appel trop près` | `#ff9c8f` |
| angle | `Abord en biais` | `#ff9c8f` |
| slow | `Manque d’impulsion` | `#ff9c8f` |
| tooClose | `Trop près` | `#ff9c8f` |

  Règles : sur barre, cause (`short` et `fast` → far) ou, sans cause, la qualité sauf perfect/good ; sur sans-faute,
  far → bitFar, near/tooClose → bitNear (`courses.js:206-210`). Causes `foreRail`/`hindRail` : aucune clé dans
  `TAKEOFF_TEXT` (`courses.js:39-49`) → pas de mot (constat du code).
- Sans-faute sur l'obstacle attendu : bip `tone(990, 0.06, 'sine', 0.06)`, obstacle suivant surligné
  (`courses.js:222-226`, `190-195`).

---

## 6. Barres qui tombent

### 6.1 Quand
- Contact en montée (τ ≤ 0,5) : la barre tombe tout de suite (antérieurs) ; en descente (τ > 0,5) : après 1,1 m
  parcourus par le cheval (postérieurs) ou dès qu'il est à plus de 8 m (`obstacles.js:513-518`, `411-424`).
- Oxer : chaque barre touchée tombe, une seule faute (`obstacles.js:502-525`). Une barre au sol ne remonte pas pour
  retomber (`obstacles.js:333`).

### 6.2 Animation (déterministe, `obstacles.js:610-668`)
- G 9,81 ; rayon 0,05. Le bout touché (côté `sign(u)`) quitte son taquet le premier, l'autre suit après
  max(0,06 ; 0,2 − 0,3 × clamp(hit ; 0 ; 0,4)) s (`obstacles.js:631-634`) ; `hit` = profondeur du contact,
  bornée 0,02 → 0,5 (`obstacles.js:334`).
- Élan horizontal dans le sens du saut : 0,7 + 2,2 × clamp(hit ; 0 ; 0,4) m/s (`obstacles.js:636`).
- Rebond si \|vy\| > 0,6 : vy = −0,28 vy (son `thud` au premier) ; sinon arrêt ; au sol, glisse freinée
  exp(−2,6 dt) et roulement (angle += vz dt / 0,05) ; inclinaison = atan2(Δy ; w) ; terminé si au repos et t > 0,5 s
  (`obstacles.js:639-665`).
- Effleurement : vibration décroissant de 2,5 /s, rotation 0,05 sin(40 r) r, levée |sin(31 r)| × 0,012 r
  (`obstacles.js:621-625`).
- Son de chute : `railFall` (`obstacles.js:335`, `src/core/audio.js:404-408`).

### 6.3 Contacts des membres (`src/gameplay/limbContact.js`, `src/entities/pjlHorse.js:674-700`)
- Actif seulement si le cheval du joueur est affiché en maillage réaliste « WildMesh » (`obstacles.js:543-545`) ;
  condition d'affichage : qualité ≠ low et personnages ≠ classic (`src/entities/realistic.js:878`, à confirmer).
- Capsules : canon r 0,045, paturon–sabot r 0,055 ; barre r 0,05 ; tolérance 0,01 ; balayage 6 positions entre deux
  images (`pjlHorse.js:92-97`, `limbContact.js:9`, `37-47`). Fenêtre : en vol ou < 0,8 s après la réception ; pose
  précédente gardée dès 4 m de l'obstacle (`pjlHorse.js:676-685`).
- Contact → barre tombée du côté poussé, faute, cause = cause du plan, sinon zone far/near, sinon `hindRail`/`foreRail`
  (`obstacles.js:558-579`).

### 6.4 Barre au sol, pénalité, remise en place
- Barre comptée pour l'obstacle attendu dans le bon sens : +4, journal, son `fault` + `crowdOoh`, toast
  « Barre au {n°} · +4 · {cause} » (`courses.js:229-240`). Textes de cause (`jumpModel.js:142-152`) : `Appel trop loin`,
  `Appel trop près`, `Trop près : plus de place pour sauter`, `Abord désaxé`, `Pas assez d’impulsion`,
  `Trop vite : saut à plat`, `Saut trop court : atterrissage dans l’obstacle`, `Barre touchée par les antérieurs`,
  `Barre touchée par les postérieurs`.
- Les barres restent au sol jusqu'à la fin de la manche (pas de reconstruction sur le parcours `cso`) ; remise à la
  manche suivante (`courses.js:454`) ou hors mission quand le joueur est à plus de 60 m (`obstacles.js:617`).

---

## 7. Refus et dérobades

### 7.1 Conditions (`obstacles.js:440-455`)
- Dans la largeur (|u| < w/2 + 0,35), cheval dirigé vers l'obstacle (composante > 0,3), v > 0,5 :
  - cos(angle) ≥ 0,5 : refus si zone `refuse`, ou marge < −0,3 côté « trop près », ou v < 3,2 et nez à moins de 1,5 m ;
  - abord trop oblique : refus si l'écart nez/face < v²/16 + 0,3.
- Freinage jusqu'à l'arrêt sur max(0,35 ; écart + 0,42) / composante m (`obstacles.js:378-389`), décélération
  max(v²/2d ; v/0,5) (`horse.js:186-189`) ; à l'arrêt : vitesse 0, cabré 1,1 s, son `neigh` (`horse.js:175-183`,
  `game.js:728`).
- Refus tout contre (nez 0,24 m dans l'obstacle) : la barre avant tombe dans le sens de la marche du cheval (sens +1
  quand il arrive du côté s < 0 : `side < 0 ? 1 : -1`, correction du 19/11/2026, vérifiée par l'oracle T3 ; la version
  précédente de cette ligne disait « vers le cheval »), remontée plus de 3 s plus tard, une fois le cheval à plus de 5 m ;
  compté comme refus, pas comme barre (`obstacles.js:456-461`, `618`).
- Dérobade (« passage à côté ») : non modélisée comme faute ; passer hors des chandeliers ne compte rien, appuyer
  SAUT donne `Trop tôt` (test `tests/e2e/cso.mjs:235`).

### 7.2 Comptage et pénalités (`obstacles.js:583-591`, `courses.js:241-267`)
- Un refus n'est recompté que si le cheval s'est détourné ou éloigné (> profondeur/2 + 6 m) ou après 5 s
  (`obstacles.js:398-402`, `586`).
- Compté seulement chrono lancé, face au sens de saut, sur l'obstacle attendu : +4, `refusals++`, son `fault` +
  `crowdOoh`, toast « Refus au {n°} · +4 », cadence remise à 0 (`courses.js:243-265`).
- Refus sur un élément B : on reprend au A, hint « Refus dans le double : reprends-le au **{A}**. » ; sinon hint
  « Fais demi-tour, reprends ta **cadence** (joystick vers l’avant) et représente l’obstacle. » (3500 ms)
  (`courses.js:253-266`).
- Élimination au 2e refus (`maxRefusals` 2, `courses.js:73`) : « 2e refus : éliminé du parcours. » (§8.4).
- Pas d'ajout de temps pour obstacle démoli sur refus (absent du web).
- Chute du cavalier : **absente du web** (aucun code). Descendre de cheval = élimination (§8.4).

---

## 8. Chrono

### 8.1 Démarrage
- Ligne de départ franchie dans son sens (§2.4), ou 45 s après la cloche (§1.6), ou départ lancé.
- Obstacles sautés avant : ignorés, hint « Le chrono n’est pas lancé : franchis d’abord la **ligne de départ**. »
  3000 ms (`courses.js:196-200`).

### 8.2 Écoulement
- `state.t += dt` avec dt de mission, nul en pause/téléphone/dialogue (`courses.js:303`, `game.js:1507`).

### 8.3 Affichage (`hud.js:407-414`)
- Avant départ : `Départ {ceil(bell)} s` et `· accordé {TA} s`. Après : `dec(t, 2)` (virgule en français, ex.
  `12,34`) et `/ 64 s`. Police mono 700 20 px, largeur mini 4,2 em (`styles.css:237`).
- Dépassement : chiffres en ambre `#f0b33a` (`.over`, `styles.css:241`).

### 8.4 Pénalités de temps et éliminations
- Barème A : 1 point par seconde entamée, `ceil(dépassement − 1e−9)` (`courses.js:341`, `364`) ; affiché en direct
  dans le compteur de points (`courses.js:148`).
- Éliminations (`courses.js:322-333`) : descendu de cheval « Tu es descendu de cheval : éliminé. » ; 2e refus
  « 2e refus : éliminé du parcours. » ; t > 128 s « Temps limite dépassé : éliminé. ». Effet : `bell(2)`, grand
  message `ÉLIMINÉ` / motif 2600 ms ; épreuve souple (cso_train, concours) → fin immédiate et bilan « Éliminé » ;
  défi → résultat éliminé (`challengeRun.js:186-195`) ; mission d'histoire → échec de mission.

### 8.5 Erreur de parcours
- Autre obstacle du parcours sauté dans le bon sens : non validé, sans pénalité, une fois par obstacle : son `fault`,
  toast « Erreur de parcours : ce n’est pas le {attendu} », hint « Erreur de parcours : saute l’obstacle **{attendu}**
  (repère vert). » 3500 ms (`courses.js:212-218`). Saut à l'envers : ignoré (`courses.js:222`, `227`).

---

## 9. HUD pendant l'épreuve

Classes du HUD : `cso-ctl` dès que `controls === 'cso'`, `cso-sober` si `kind === 'cso'`, `cso-on` dès que le tableau
existe (`hud.js:382-392`).

| Élément | Position | Contenu exact | Style | Source |
|---|---|---|---|---|
| Tableau `.cso-board` | haut, colonne centrale (`.top-mid`), sous la marge sûre `--st` = max(10 px ; safe-area) | `⏱` (masqué en `cso-sober`) · chrono · `/ 64 s` · `0 pt` / `1 pt` / `{n} pts` · `▸ {n°}` / `▸ Arrivée` / `Arrivée ✓` · crans de cadence | fond `rgba(15,15,14,0.72)`, texte `#fbfaf5`, rayon 12, 600 13 px ; temps accordé 11 px opacité 0,55 ; pénalités rouges `#e25b4b` si > 0 ; « prochain » sur fond `rgba(61,220,151,.18)` | `hud.js:73-85`, `407-414`, `styles.css:234-243`, `997-998` |
| Crans de cadence | dans le tableau | 6 barres 4 px (hauteurs 6→16 px), allumées round(cadence/8 × 6), visibles 2 s après un réglage | allumé `#fbfaf5`, éteint `rgba(255,255,255,.25)`, fondu 0,4 s | `hud.js:393-406`, `styles.css:999-1004` |
| Retour d'appel `.jump-fb` | sous le tableau | §5.6 | 600 12 px, fond glass | `hud.js:82`, `styles.css:1005-1009` |
| Objectif | masqué (`.hud.cso-on .objective`) ; texte encore calculé : `Franchis la ligne de départ`, `Obstacle n°{n°}[ · double] sur 10`, `Passe la ligne d’arrivée !`, `Éliminé` | — | — | `styles.css:244`, `courses.js:167-173` |
| Astuce `.hint` | haut, sous le tableau | textes §1.6, §7, §8 | glass, 500 12 px, max 420 px | `hud.js:469-475`, `styles.css:318-320` |
| Toasts | haut, colonne centrale | 2 au plus (1 si hauteur ≤ 420 px), 3200 ms | carte claire `#fbfaf5`, 500 12,5 px, max 260 px | `hud.js:444-450`, `styles.css:305-307` |
| Grand message | centre, top = max(34 % ; --st + 56 px), largeur min(66 vw ; 640 px) | §1.5, §1.6, §8.4, §11 | titre 700 clamp(30 ; 6,4 vw ; 58) px, sous-titre mono 12 px majuscules sur pastille sombre ; animation `pop` 0,5 s ; masque l'objectif | `hud.js:452-467`, `styles.css:312-316` |
| Bouton SAUT | bas droite, 104 × 104 px, à 6 px du bord droit et 8 px du bas du bloc d'actions | §4.1 | `styles.css:990-992` | `hud.js:113-118` |
| Bouton pause | haut droite | — | visible | `hud.js:60`, `86` |
| Masqués | minicarte, portefeuille, bouton téléphone, BOOST, sifflet, cardio, endurance, action secondaire (`cso-ctl`) ; télémétrie et bouton ACTION (`cso-sober`) | — | — | `styles.css:988-996` |

- Notifications retenues pendant le parcours, relâchées à la fin (`hud.js:486-487`, `courses.js:361`).
- Entraînement au paddock (`kind: 'cso-train'`) : pas de `cso-sober`, allure et bouton `Terminer` gardés
  (`hud.js:391-392`, `activities.js:182`).

---

## 10. Caméra de concours (`src/entities/camera.js:13-30`, `184-283`)

Active dès l'entrée en piste et jusqu'à la fin de la sortie de piste (`game.course.camera`, `camera.js:74`) ;
verrouillée derrière le cavalier, pas d'orbite au doigt, pas de tremblement (`camera.js:269`, `game.js:742-744`).

| Paramètre | Valeur | Rôle |
|---|---|---|
| back | 6,6 m | distance horizontale derrière le cheval |
| up | 3,4 m | hauteur au-dessus du sol sous le cheval |
| lookAhead / lookUp | 9 m / 1,1 m | point visé devant le cheval |
| fenceBias / fenceRange | 0,22 / 30 m | attirance du point visé vers l'obstacle suivant (devant, cône cos > 0,5), atténuée par smoothstep(18 ; 30 ; d) |
| lead | 0,18 s | anticipation : cap visé = cap + vitesse de lacet × 0,18 (lacet ignoré en vol) |
| yawK / yawAcc | 5 /s / 4 rad/s² | recentrage, accélération angulaire bornée |
| posK / yK | 10 /s / 3 /s | suivi horizontal / vertical (1 − e^(−k dt)) |
| jumpFollow | 0,12 | part de la hauteur du saut suivie |
| fov | **58° vertical**, fixe (amorti e^(−3 dt) vers 58 à l'entrée) | |
| minBack | 1,6 m | rapprochement mini contre un décor |
| fenceClear | 0,7 m | au-dessus d'un obstacle survolé : y ≥ sol + h + 0,75 + 0,7 si \|u\| < w/2 + 2,4 et \|s\| < profondeur/2 + 0,8 |
| enter | 1,2 s | fondu smoothstep depuis la caméra précédente |

- Perche anti-collision : sondage de 1,0 à 6,6 m par pas de 0,4, hauteur 2,2 → 3,4 ; recul amorti 10 /s en
  rapprochement, 2,5 /s en éloignement ; caméra au moins 0,8 m au-dessus du sol (`camera.js:219-239`).
- Point visé lissé e^(−4 dt) (`camera.js:252-258`).
- Unreal : correction du 19/11/2026 (tranches T1 et T6) : le joueur local d'UE 5.8 maintient l'axe **Y**
  (`BaseEngine.ini:2900`, `AspectRatio_MaintainYFOV`), `FieldOfView` y est donc un champ **vertical**. La caméra de
  concours du portage impose cet axe et reçoit 58° tels quels ; la projection du moteur en 844 × 390 redonne celle du web
  (`Strides.Cso.CameraInGame`). Le FOV horizontal équivalent, 2 atan(tan(29°) × largeur / hauteur) = 100,4° en 844 × 390,
  ne sert qu'aux caméras de capture qui imposent l'axe X.
- Monde ouvert (rétabli à la sortie) : FOV 60 + bonus de vitesse, distance 6,6, hauteur 2,35 (`camera.js:100-104`, `174`).
- Cadrage mesuré par `tests/e2e/cso-framing.mjs` : couple sur 25 à 42 % de la hauteur, moitié basse au galop, entier à
  l'écran (`cso-framing.mjs:60-65`). Son commentaire « 30 % de la hauteur » diffère de `jumpFollow: 0.12` : le code fait
  foi.

---

## 11. Arrivée et carte de résultat

### 11.1 Arrivée (`courses.js:334-349`)
- Points = fautes + pénalités de temps. Grand message `SANS FAUTE !` / `{n} POINTS` / `1 POINT`, sous-titre
  `{dec(t, 2)} s`, 2600 ms.
- Sons : sans faute `applause(1.3, 4)` + `cheer()`, public en liesse 3,5 s (`game.cheerT`, `src/gameplay/npcs.js:582`) ;
  sinon `applause(0.55, 2.6)`.
- Sortie de piste 2,6 s (§3), puis bilan.

### 11.2 Bilan (`courses.js:372-424`)
- Classement simulé : `simulateField({ ta: 64, id: 'am2', name: 'Prix STRIDES', prizes: [] }, 5150 + manche × 31, 14)`
  (`activities.js:37`, `courses.js:381-382`) ; tirage `mulberry32` (`src/core/math.js:20-28`) ; fautes 0/4/8/12/16
  avec seuils 0,34/0,68/0,86/0,95, −4 avec probabilité 0,25 pour `am2`, temps = ta − 4 + (r+r+r − 1,5) × 4,2 + fautes
  × 0,15 (`src/gameplay/ranking.js:8-21`) ; tri points puis temps (`ranking.js:23-25`). Joueur : points totaux, temps
  arrondi au centième.
- Kicker `Résultats · Prix STRIDES` (+ ` · manche {n}` dès la 2e) ; titre : `Éliminé` | `Victoire, sans faute !` |
  `Victoire !` | `Sans faute · {2e}` | `{3e} place` (ordinal `1re`, `{n}e`, `courses.js:57`).
- Grille :

| Clé | Valeur |
|---|---|
| `Chrono` | `{dec(t,2)} s (accordé 64 s)` ou `—` |
| `Fautes aux obstacles` | `{n} pts : barre au 2 (appel trop loin), refus au 5` ou `0 · aucune` |
| `Pénalités de temps` | `0 pt` / `1 pt` / `{n} pts` ou `—` |
| `Total` | idem ou `Éliminé` |
| `Classement` | `{1re} sur 15` ou `éliminé · {motif}` |
| `Récompense` | `aucune (éliminé)` / `hors dotation` (cso_train : toujours) / `{montant}` / `{montant} — dotation déjà reçue pour ta première manche classée` |

- Tableau `.cso-rank` (13 px) : 8 premiers + le joueur s'il est au-delà ; colonnes rang, `{cavalier} · {cheval}`,
  points, `{dec(temps,2)} s`, dotation `{n} €` ; ligne du joueur en gras sur `rgba(201,162,74,.18)`
  (`courses.js:399-404`, `styles.css:251-254`).
- Boutons : `Recommencer` (`data-id="cso-retry"`) → nouvelle manche (état neuf, entrée en piste, cloche) ;
  `S’entraîner` (`cso-train`) → fermeture puis entraînement au paddock (`cso_warmup`) 300 ms plus tard ;
  `Quitter l’épreuve` (primaire, `cso-done` ; `Continuer` au concours) (`courses.js:418-442`, `activities.js:37`).
- Aucun son à l'ouverture de ce bilan ; l'écran de mission générique n'est pas affiché (`resultCustom`,
  `src/ui/screens.js:180-182`, `missions.js:611`). Toast `Dotation versée : +{montant}` si dotation (concours).
- En arrière-plan : meilleur temps de l'activité = temps + pénalités (en secondes) dans `bestTimes.cso_train`,
  classement en ligne `reportScore` (`activities.js:113-126`).

### 11.3 Écarts des autres entrées
- Concours : dotation par rang `Am 2 [260, 180, 130, 100, 80]`, `Am 1 [420, 290, 210, 160, 120, 90]`,
  `Pro 2 [650, 450, 320, 240, 180, 140]` (`trip.js:143-145`) ; 14 concurrents simulés, graine
  `floor(game.time × 7 + dossard)` (`trip.js:274`, `courses.js:382`) ; dotation versée une seule fois (première manche
  classée, `courses.js:390-395`) ; titre de mission `Victoire au Pôle !` ou `{rang} place — {classe}`
  (`trip.js:276-281`).
- Défi v6 : carte kicker `Défi du Pôle · defi-pole-v6`, titre `Éliminé` | `Nouveau record` | `Sans faute` |
  `Parcours terminé`, détail « Barres : {n} · refus : {n} · pénalités de temps : {n}. Cheval : Onyx. », grille
  `Pénalités` / `Temps` / `Record v6`, boutons `Quitter` (`challenge-quit`), `Carte de résultat` (`challenge-card`),
  `Recommencer` (`challenge-retry`) ; son `success` ou `fail` (`src/ui/challenge-screens.js:186-227`).

---

## 12. Sons par événement (`src/core/audio.js`, synthèse Web Audio)

| Événement | Appel | Définition |
|---|---|---|
| lancement de l'activité | `notify()` | 1318 Hz 0,12 s puis 1760 Hz 0,18 s à +0,1 s (`audio.js:283-286`) |
| entrée en piste | `applause(0.5, 2.2)` | 90 × intensité × durée claquements filtrés 1400–3200 Hz + `cheer` (`audio.js:383-392`) |
| cloche | `bell()` | partiels 880/1210/1780/2340 Hz, gains 0,16/0,07/0,05/0,03, 1,6 s + bruit passe-haut 3500 Hz (`audio.js:374-381`) |
| ligne de départ | `tone(1568, 0.1, 'sine', 0.08)` | `courses.js:295` |
| appel | `snort()` + `hoof(sol, 1.4)` | `game.js:721-726` |
| réception | `landing(1)` | deux bruits passe-bas 520 et 460 Hz à 0 et 0,11 s (`audio.js:410-414`) |
| obstacle franchi (attendu) | `tone(990, 0.06, 'sine', 0.06)` | `courses.js:224` |
| barre effleurée | `railTouch()` | 620 Hz triangle 0,09 s + bruit 2200 Hz (`audio.js:400-403`) |
| barre qui tombe | `railFall()` puis `thud()` au premier rebond | `audio.js:404-408`, `obstacles.js:649` |
| barre comptée / refus compté | `fault()` + `crowdOoh()` | 220 Hz carré 0,18 s + choc ; murmure 380/620 Hz (`audio.js:306-309`, `394-398`) |
| refus (cheval) | `neigh()` | `game.js:728`, `audio.js:338-365` |
| erreur de parcours | `fault()` | `courses.js:215` |
| élimination | `bell(2)` | deux coups à 0,55 s d'intervalle |
| arrivée | `applause(1.3, 4)` + `cheer()` ou `applause(0.55, 2.6)` | `courses.js:342-343` |
| ambiance public | gain 0,6 × 0,08 si à < 90 m de la carrière ou en épreuve | `game.js:1553`, `audio.js:95` |

---

## 13. Recette : captures de référence web existantes et à ajouter

Pré-requis communs : serveur Vite (`BASE`, défaut `http://127.0.0.1:5173`), `?autostart`, pilote injecté
`tests/e2e/autopilot.js` (pas fixe 1/30 s, `autopilot.js:4`, `48-50`), rendu SwiftShader.

| Étape | Script existant (fichier:lignes) | Pose | Capture | À ajouter |
|---|---|---|---|---|
| 1 Présentation | `tests/e2e/cso-shots.mjs:18-30` | cheval à CSO_GATE + 4 m, cap π, 15 h, 844 × 390, `quality=high` | `out/cso/1-presentation.png` | même capture côté Unreal ; ligne du jury (concours) |
| 1 Plan | `cso-shots.mjs:31-32` ; vérif textes `cso.mjs:52-73` | idem | `2-plan.png` | — |
| 1 Entrée + annonce N° | `cso.mjs:58-63` (lecture du texte, pas d'image) | — | aucune | capture à `tick(28)` après `enter` |
| 1 Cloche | `cso-shots.mjs:33-34` (`tick(80)` après `enter`) | caméra de concours | `3-cloche.png` | capture du tableau `Départ 45 s` |
| 2 Piste, tracé, lignes | aucune vue d'ensemble | — | — | plan fixe aérien de la carrière, vue de la ligne de départ et d'arrivée |
| 3 Conduite, cadence | `cso.mjs:83-100` (mesures), `cso-touch.mjs:99-139` (vrai tactile) | — | `touch-abord`, `touch-double`, `touch-arrivee` | capture des crans de cadence |
| 4 Aide à l'appel | `cso-shots.mjs:36-58` : obstacle 2 posé à 16 m, v 6,6, `cam.snap`, arrêt à 7,5 m / 1,7 m de la barre (état forcé `started`, `t = 7.42`) | caméra de concours | `4-abord-trop-loin.png`, `5-abord-bonne-zone.png` | état `Trop près`, aide `button` et `off`, tracé masqué |
| 5 Saut | `cso-shots.mjs:59-60` (`jump` + 10 images) | idem | `6-saut.png` | captures à τ = 0,25 / 0,5 / 0,75 ; mot `Appel parfait` |
| 6 Barre au sol | `cso-shots.mjs:61-83` (appel à 5,8 m du 3, `cam.yaw += 2.3`, probablement sans effet en caméra de concours, `camera.js:277`, à confirmer) | — | `7-barre-au-sol.png` | séquence de chute à 0,1 / 0,3 / 0,6 / 1,5 s |
| 7 Refus | `cso.mjs:238-285` (vérifications), aucune image | — | — | capture du cabré et du toast `Refus au 4B · +4` |
| 8 Chrono, élimination | `cso.mjs:287-329` (2e refus, bilan Éliminé) | — | — | capture `ÉLIMINÉ`, tableau en ambre (dépassement) |
| 9 HUD | `cso.mjs:66-78` (classes, display), `hud-shot.mjs` (HUD hors épreuve) | — | — | capture HUD épreuve 844 × 390 et 667 × 308 |
| 10 Caméra | `cso-framing.mjs:13-56` (6 instants, mesures sans image), `cso.mjs:331-361` (décor) | — | — | captures aux 6 instants pour comparaison |
| 11 Arrivée, bilan | `cso.mjs:104-147`, `cso-touch.mjs:139-150` | — | `touch-arrivee.png`, `touch-bilan.png` | grand message `SANS FAUTE !` |
| Concours complet | `tests/e2e/contest-full.mjs` (dépend d'un état privé `HERMES_CORRECTIF/ETATS_TEST/E08-avant-concours-pole.json`, `contest-full.mjs:1-3`) | — | `out/contest-full/01…10` | état de départ versionné |
| 12 Sons | aucune | — | — | journal des appels `audio.*` horodatés |

Captures web déjà présentes : `tests/e2e/out/cso/1-presentation.png` à `7-barre-au-sol.png`. Aucune capture
côte à côte web/Unreal n'existe dans `unreal/docs/parite/<système>/`.

---

## 14. Correspondance Unreal (constat du 18/11/2026, arbre de travail)

Preuve exécutée : `unreal/core` compilé et testé dans le scratchpad (CMake/Ninja, AppleClang), `test_core`
**4 944 vérifications, 0 échec** (arbre de travail avec `JumpModel.h` modifié non commité par une autre tâche).
Aucune vérification à l'écran du parcours : `validation-mac-2026-11-17.md:58` le liste en « prochaine reprise ».

| Fonction | État | Niveau | Preuve / écart |
|---|---|---|---|
| Tracé, positions, longueur, hauteurs, temps accordé, pénalités de temps, classement des résultats | identique_prouve | teste | `test_core.cpp:79-110` + `cso_course.json` |
| Modèle de saut (planJump, zones, causes, qualité) | identique_prouve (fonction cœur) | teste | `test_core.cpp:31-62` + `jump.json` (576 cas) |
| Conduite (steerRate, cadenceDelta, minRadius, maxTurnRate) | identique_prouve (fonctions) | teste | `test_core.cpp:64-77` + `cso_ride.json` (72 cas) |
| Intégration conduite dans le cheval | partiel | compile | réponse de lacet linéaire, airTurn appliqué à la consigne, perte à la réception tout ou rien (`StridesHorse.cpp:233-241`, `273-274`) |
| Juge (barres, refus, double, élimination) | partiel | teste | scénarios écrits à la main sans oracle (`test_core.cpp:113-168`) |
| Lignes de départ / arrivée | partiel | compile | demi-largeur 6 m au lieu de 3,8 ; cap exigé aussi à l'arrivée (`StridesCourse.cpp:30-39`) |
| Jugement des barres en vol | partiel | compile | jugé à la réception sur la marge du plan, pas à la trajectoire (`StridesCourse.cpp:76-86`) |
| Chute de barre | partiel | compile | déplacement instantané de 40 cm (`StridesFence.cpp:76-81`) |
| Présentation, plan, entrée annoncée, cloche, 45 s | absent | aucun | aucune occurrence dans `Source/` |
| Aide à l'appel (bouton coloré, zone au sol, tracé, repère) | absent | aucun | seul « Dernier appel : … » texte (`StridesHUD.cpp:39`) |
| HUD d'épreuve (tableau, mot d'appel, toasts, grands messages) | partiel | compile | lignes de texte de débogage (`StridesHUD.cpp:30-41`, `StridesCourse.cpp:103-112`) |
| Caméra de concours | partiel | compile | bras à ressort 650 cm, retard de caméra 6, FOV 55° horizontal (`StridesHorse.cpp:53-63`) ≠ §10 |
| Bilan, classement simulé, Recommencer / S’entraîner | absent | aucun | — |
| Sons | absent | aucun | aucune occurrence de son dans `Source/` |
