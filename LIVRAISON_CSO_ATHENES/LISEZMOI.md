# Concours de saut d'obstacles : refonte du gameplay

Objectif : retrouver la philosophie de jeu de l'épreuve de saut d'obstacles d'Athens 2004 (PS2), en gardant le rendu de
STRIDES Grand Tour.

À lire avant tout :

- **La vidéo de référence n'a pas été reçue.** Aucun fichier n'accompagnait la demande. Les trois vidéos présentes
  dans la session sont des enregistrements de STRIDES.
  - Ce qui touche à Athens 2004 s'appuie donc sur une recherche documentaire (§ 1).
  - L'outil de comparaison image par image est prêt (§ 6) : il produira les vues côte à côte dès que la vidéo sera
    fournie.
- **Aucun essai sur un iPhone réel.** Tout a été joué dans Chromium, en rendu logiciel (SwiftShader), avec
  l'émulation iPhone 13 paysage pour le tactile. Les vidéos sont l'image du jeu, à 15 images/s en temps réel.

## 1. Athens 2004 : ce qui est établi

Sources : manuel, fiches de jeu et critiques, trouvés par recherche web. Aucune vidéo n'a été consultée.

| Point | Établi (sources concordantes) | Non documenté |
|---|---|---|
| Commandes | Direction au stick gauche ; vitesse au stick droit (haut/bas) avec une allure par défaut ; un seul bouton de saut (L1) | Si la vitesse est gardée quand on relâche (probable) |
| Saut | Il faut appuyer au bon moment ; trop tôt ou trop tard, refus | Repère de timing à l'écran : aucun. C'était le principal reproche des critiques (« aucun moyen de juger l'appel ») |
| Règles | 4 points par barre ; élimination au 2ᵉ refus | Temps accordé |
| Caméra, repères au sol, interface | — | Rien de fiable : à vérifier sur votre vidéo |

Conséquence pour la conception :

- On garde la simplicité des trois gestes (diriger, régler la vitesse, sauter) et un timing qui compte.
- On corrige le défaut reproché à Athens 2004 : le joueur doit comprendre ses appels. Il a donc un retour après chaque
  saut, et un repère au bouton ou au sol qu'il peut désactiver.

## 2. Diagnostic de la version précédente (mesuré dans le code)

| Domaine | Défaut |
|---|---|
| Caméra | 27 à 31° de retard dans les courbes. L'obstacle suivant est caché derrière le buste du cavalier entre 10 et 35 m. On peut la faire tourner au doigt. |
| Conduite | Rayon de virage fixe de 6 m entre 4,2 et 7,2 m/s : la vitesse n'influait pas. Réponse linéaire, pivot sur place à l'arrêt. Cadence imposée à 6,2 m/s à la cloche : le cheval partait tout seul. |
| Saut | Le cheval recalait seul sa longueur de saut (+12 % / −24 %). Résultat : un vertical de 1,10 m passait sur 582 ms et un oxer sur 365 ms, une incohérence. Un appui très tôt était gaspillé et répétable. Seules les épaules étaient jugées. La chute des barres était aléatoire. |
| Parcours | Virages de 90 à 135° commencés 8 m après une réception, un S au milieu de la carrière. Départ dans un coin après 50 m le long des lices. Courbes de 7 m de rayon au Sprint de Paris. |
| Guidage | Couloir de 1,9 m à bords en tirets avec chevrons verts. |
| Interface | Les conseils étaient invisibles pendant le parcours (masqués avec l'objectif). Tachymètre affiché. Bascule brutale de la caméra et des commandes à la cloche et à l'arrivée. |

## 3. Ce qui a changé

Tout est limité aux épreuves de saut d'obstacles (`game.course.controls === 'cso'`) :

- **Inchangés :** la monte en monde ouvert, le cross, l'hippodrome, la marche et la conduite.
- **Sauts libres hors épreuve :** ils gardent le modèle d'origine, à l'identique.

### 3.1 Caméra de concours (`src/entities/camera.js`, `CAM_COMP`)

C'est une branche séparée, le reste de la caméra n'est pas modifié.

**Cadrage :**
- Centrée derrière le cavalier, à 6,6 m.
- Légèrement surélevée : 3,4 m au-dessus du sol.
- Elle vise 9 m devant le cheval, à 1,1 m de hauteur.
- Champ vertical fixe de 58°.
- Le couple occupe environ 30 % de la hauteur, en bas de l'écran, et l'obstacle suivant est visible au-dessus.

**Mouvement :**
- Elle tourne avec le cheval, avec une légère anticipation dans les courbes.
- Sa vitesse angulaire est bornée : pas de rattrapage brutal.
- Elle est verrouillée derrière le cavalier (pas d'orbite au doigt) ; le mode photo reste libre.
- Aucun zoom ni tremblement pendant les sauts.

**Obstacles :**
- Elle survole les obstacles au lieu de les traverser.
- Elle se rapproche devant une tribune ou un mât.
- Le mât d'éclairage planté dans l'axe de l'entrée de piste a été décalé de 12 m.

**Transitions :**
- Fondu d'entrée de 1,2 s dès l'entrée en piste.
- Sortie sans saut d'image : l'état de la caméra commune est tenu à jour.

### 3.2 Conduite : diriger, régler la vitesse, sauter (`src/gameplay/csoRide.js`, `CSO_RIDE`)

**Diriger :**
- Joystick gauche/droite, ou ←/→ au clavier.
- Courbe progressive : précise au centre, pleine au bord.
- Le rayon le plus court grandit avec la vitesse : 6,3 m au trot, 7,6 m au galop de concours, 9 m au galop allongé.
- Une courbe de 12 m au galop demande environ deux tiers du joystick.
- Pas de pivot instantané : temps de réponse de 0,2 s, accélération angulaire bornée.
- Au clavier, la direction monte en 0,3 s : une touche maintenue décrit une courbe, pas un coup de volant.

**Régler la vitesse :**
- Joystick avant/arrière, ou ↑/↓.
- 1,2 m/s² au galop, 2,2 m/s² en dessous du trot pour repartir.
- La cadence est gardée au relâchement.
- Elle part de la vitesse réelle du cheval : il ne prend jamais d'élan tout seul.
- La cadence ne change pas quand on tourne : il faut pousser franchement vers l'avant ou l'arrière.

**Sauter :**
- Grand bouton SAUT, ou Espace.

**Également :**
- Pas de BOOST en épreuve.
- Réception : au plus 4 % d'élan perdu, et seulement si le saut a dû être recadré. Une réception parfaite garde toute la
  cadence.
- Après un refus, le cheval reste arrêté (cadence bloquée pendant qu'il se cabre). On fait demi-tour sur place, puis on
  reprend sa cadence.

### 3.3 Parcours (`src/gameplay/csoCourse.js`, `src/gameplay/parisCourse.js`, règles dans `src/gameplay/courseLint.js`)

Plans : `captures/plans-des-parcours.png`.

**Pôle International** (368 m, 10 sauts, temps accordé de 64 s) :
1. Abord dessiné depuis l'entrée, puis départ.
2. Le 1 en diagonale.
3. Grande courbe à droite (rayon 17,7 m), puis ligne 2–3 le long des tribunes (5 foulées).
4. Demi-volte à droite, puis ligne du milieu : double 4A–4B (2 foulées, 11,4 m), puis le mur 5 (4 foulées).
5. Demi-volte à gauche, puis ligne sud : double 6A–6B (1 foulée, 7,8 m), 7 (6 foulées), 8 (oxer large, 5 foulées).
6. Arrivée, avec 15 m pour ralentir.

**Paris :**
- Grand Prix : 310 m, 9 sauts, deux doubles.
- Sprint : 310 m, 7 sauts.
- Courbes de 10,5 à 13 m de rayon.

**Règles vérifiées automatiquement** (`tests/unit/courses-lint.test.js`, et vérification indépendante par simulation d'un
cavalier) :
- Approches droites d'au moins 18 m (Paris : 14,5 m).
- Réceptions dégagées d'au moins 12 m (Paris : 10 m) avant tout virage.
- Rayons d'au moins 13 m (Paris : 10,5 m), aucun S, aucun virage serré après une réception.
- Combinaisons à 7,8 m (1 foulée) ou 11,4 m (2 foulées).
- Lignes en nombre entier de foulées (4,2 + n × 3,56 m), à la cadence et à la foulée réellement simulées (3,56 m à
  6,2 m/s).
- Départ 8 à 15 m avant le 1, dans son axe ; arrivée 8 à 15 m après le dernier.
- Caméra jamais dans les tribunes.
- Ligne à au moins 7 m des lices (Paris : 5,5 m).

**Autres changements :**
- Défis rejouables : nouvelles versions `defi-pole-v6` et `defi-paris-v3`. Les anciennes sont gelées.
- Temps accordés recalculés d'après la longueur.
- Rythme des concurrents simulés de Paris ramené à ce que permet le galop du jeu.

### 3.4 Guidage au sol (`src/gameplay/courseAids.js`, `LINE_MARK`)

- Une ligne discrète de petits repères (tirets de 0,7 × 0,26 m tous les 1,5 m), vert profond. Le blanc cassé testé d'abord se perdait sur le sable clair, vu de loin et de biais.
- Elle relie les obstacles dans l'ordre, courbes comprises, du cheval jusqu'à l'obstacle suivant.
- La suite, au-delà de l'obstacle (12 m), est plus pâle : la courbe suivante se prépare dès la réception.
- C'est une aide visuelle, pas un rail : le cheval n'est jamais dirigé.
- Désactivable dans Réglages → Tracé au sol, ou en épreuve, depuis le menu pause.

### 3.5 Saut et timing (`src/gameplay/jumpModel.js`, `JUMP`)

**Principe :**
- Le saut part de la position réelle du cheval, avec sa vitesse et son cap.
- Le cheval saute ce que demande l'obstacle : sommet des pieds 32 cm au-dessus de la barre, plus pour un oxer large,
  dans la limite de sa puissance.
- La durée du vol suit la hauteur (environ 0,68 s sur 1,10–1,20 m) ; appel et réception à environ 2,1 m.
- Le recadrage est limité : +6 % / −12 %. Il n'y a pas de correction automatique du point d'appel.

**Fenêtres d'appel** (Comète, galop de concours 6,2 m/s, abord droit) :

| Obstacle | Appel « bon » | Franchi |
|---|---|---|
| Vertical 1,15 m | 1,24–3,06 m (≈ 0,29 s) | 0,88–3,48 m (≈ 0,42 s) |
| Oxer 1,15 m | 1,68–2,60 m (≈ 0,15 s) | 1,39–2,96 m (≈ 0,25 s) |
| Oxer 1,25 m | 2,01–2,37 m | 1,52–2,81 m (≈ 0,21 s) |
| Oxer 1,15 m au petit galop (5 m/s) | — | 1,36–2,02 m (manque d'impulsion) |

**Conséquences mesurées en jeu** (même cavalier, appui décalé, parcours de l'ancien tracé) :

| Appui | Résultat |
|---|---|
| 0,7 m trop tôt | Tout passe (« un peu loin ») |
| 1,3 m trop tôt | Les oxers tombent (« appel trop loin »), les verticaux passent |
| 2 m trop tôt | Toutes les barres tombent |
| 0,9 m trop tard | Le vertical passe, refus à l'oxer |
| 1,3 m trop tard | Barre sur le vertical (« trop près »), puis refus |

**Fautes cohérentes avec l'animation :**
- Appel trop près : les antérieurs emportent la barre en montée.
- Appel trop loin : la barre tombe au passage des postérieurs, en fin de trajectoire.
- La chute est déterministe : le bout touché part le premier, avec un élan qui dépend du contact.

**Abord en biais :** moins de hauteur et une largeur effective plus grande, donc plus de risque de faute.

**Appui sans effet :** en épreuve, un appui loin de tout obstacle (plus de deux longueurs de saut avant la barre) est
sans effet, et le bouton affiche « Trop tôt ».

**Retour après chaque saut**, sous le chrono : « Appel parfait », « Bon appel », « Un peu loin », « Un peu près »,
« Appel trop loin », « Abord en biais »…

### 3.6 Fluidité entre les obstacles

- Aucun blocage des commandes après la réception ; un nouvel appel est possible tout de suite.
- La cadence est conservée.
- L'obstacle suivant est mis en évidence dès la sortie du précédent (numéro en vert, repère discret au-dessus, ligne au
  sol).
- La caméra reste stable : seulement 12 % de la hauteur du saut est suivie, et amortie.

### 3.7 Ambiance et interface

**Déroulé de l'épreuve :**
- Entrée en piste, cloche, chrono.
- Départ lancé, si le cavalier a déjà passé la ligne au moment de la cloche.
- Fautes et refus en temps réel.
- Applaudissements, et le public se lève sur un sans-faute.
- Courte sortie de piste avant le classement.

**Décor et son :**
- Fanions réglementaires sur les obstacles : rouge à droite, blanc à gauche.
- Bruit de l'appel.
- Ambiance de public aussi à Paris.

**Interface sobre :**
- Chrono, fautes et prochain obstacle, avec le gros bouton SAUT.
- La cadence n'apparaît que lorsqu'on la règle.
- Les conseils sont de nouveau visibles.

**Menu pause en épreuve :** il rappelle les trois gestes et permet de régler « Tracé au sol » et « Aide au saut ». Dans
les défis, l'aide est imposée par l'épreuve.

### 3.8 Rendu de STRIDES

- Modèles, chevaux, cavaliers, éclairage et décors sont inchangés.
- Le cheval saute désormais à la hauteur que demande l'obstacle, comme un vrai cheval, au lieu de sauter 1,55 m sur un
  obstacle de 1,05 m.

## 4. Validation

Toutes les manches ont été jouées aux commandes normales : `tests/e2e/cso-athens.mjs` et `tests/e2e/cso-rider.js`.

Règles du cavalier de test :
- Il suit des yeux la ligne au sol et règle sa cadence au joystick.
- Il appuie une seule fois sur SAUT par obstacle, à la distance qu'il juge bonne.
- Il ne lit jamais le planificateur de saut du jeu et ne déplace jamais le cheval.

Garde-fous vérifiés à chaque image :
- Aucune téléportation.
- Autant de sauts que d'appuis.
- Caméra jamais dans un obstacle ni dans le décor.

| Épreuve, commandes | Résultat | Caméra |
|---|---|---|
| Pôle, joystick | Sans faute, 59,9 s / 64 s, 10 appuis = 10 sauts | 7,11 m derrière, 3,4–3,5 m de haut, retard p95 4,9°, accélération max 1,3 rad/s², 58° fixe |
| Pôle, tactile (iPhone 13 émulé, vrais touchers) | Sans faute, 60,1 s / 64 s, 10 = 10 | Retard p95 4,9°, accélération max 3,8 rad/s² |
| Pôle, clavier (vraies touches) | Sans faute, 62,2 s / 64 s, 10 = 10 | Retard p95 4,8°, accélération max 3,8 rad/s² |
| Paris Grand Prix (défi 1,50 m), joystick | Sans faute, 50,3 s / 54 s, 9 = 9 | Retard p95 6,5°, accélération max 1,8 rad/s² |

Autres vérifications :
- **Refus :** demi-tour sur place, nouvelle présentation, puis parcours terminé (refus compté, +4).
- **Tests unitaires :** 208, dont conduite, saut v2 et règles de tracé.
- **Non-régression complète :** 28 scénarios de jeu et les tests unitaires, au vert (`mesures/non-regression.txt`).
  - Concours mis à jour : `cso` 38/38, `cso-touch` 9/9, `contest-full` 6/6, `challenge` 37/37, `paris` 20/20.
  - Monde ouvert inchangé : `boost` (allures, galop à 35 km/h, BOOST), montée à cheval, véhicules, missions.
  - Trois relances, toutes expliquées et au vert. Deux venaient d'un délai trop juste pour « Continuer » en rendu
    logiciel, mesuré identique avant et après la refonte ; une venait du serveur de développement.
- **Revue critique :** 17 relecteurs et vérificateurs. 13 défauts moyens ou graves ont été confirmés, puis tous
  corrigés (§ 7).

## 5. Comparaison avec la référence (les 10 points demandés)

La colonne « Athens 2004 » se remplira avec votre vidéo (§ 6). Les colonnes STRIDES sont mesurées.

| # | Point | Avant | Maintenant |
|---|---|---|---|
| 1 | Position et stabilité de la caméra | Lag 27–31° en courbe, orbite au doigt | Derrière le cavalier, retard ≤ 6,5° (p95), accélération angulaire ≤ 1,8 rad/s², verrouillée |
| 2 | Taille du cheval dans le cadre | ~33 %, fond caché par le buste | ~30 %, en bas ; obstacle suivant au-dessus du cavalier |
| 3 | Réponse de la direction | Rayon fixe 6 m, linéaire | Progressive, rayon 6,3 → 9 m selon la vitesse, réponse 0,2 s |
| 4 | Progressivité de la vitesse | Cadence forcée à 6,2 m/s à la cloche | Part de la vitesse réelle, ±1,2 m/s², gardée |
| 5 | Fluidité des courbes | Virages serrés après réception | Courbes de 13 à 17,7 m (Pôle), 46–64 % du joystick |
| 6 | Espacement et lisibilité | 17 m d'approche, 8 m de réception | 18–25,6 m d'approche, 12–29 m de réception |
| 7 | Guidage au sol | Couloir à chevrons | Repères discrets, désactivables |
| 8 | Précision et tolérance des sauts | Vertical 0,58 s / oxer 0,37 s, recalage +12/−24 % | Vertical ≈ 0,42 s, oxer ≈ 0,25 s, recalage +6/−12 %, conséquences graduées |
| 9 | Continuité après réception | Perte de 6–14 % d'élan | 0–4 %, commandes immédiates |
| 10 | Prise en main | BOOST, télémétrie, conseils invisibles | Trois gestes, interface sobre, conseils visibles, retour après chaque saut |

## 6. Vidéos et vues comparatives

**Vidéos :**
- `videos/cso-cso-tactile.mp4` : parcours complet du Pôle joué aux vrais touchers, de l'entrée en piste à la sortie.
  Joystick et bouton SAUT sont visibles ; sans faute en 60,1 s.
- Moments clés : `videos/cso-cso-tactile.events.json`.
- Planche de la vidéo : `captures/planche-video.jpg`.

**Vues comparatives** (abord, appel, suspension, réception, courbe) :
- `comparaison/avant-apres/` : nouveau gameplay face à l'ancienne version (votre enregistrement du 28/10), à des moments
  équivalents.
- `comparaison/athens-2004/` : nouveau gameplay face à la référence, avec l'emplacement « vidéo à fournir ».

Dès réception de votre vidéo d'Athens 2004, une commande produit les vues côte à côte. On lui donne les secondes
correspondant à chaque moment dans la référence :

```
OUT=LIVRAISON_CSO_ATHENES/comparaison/athens-2004 node tests/e2e/athens-compare.mjs \
  LIVRAISON_CSO_ATHENES/videos/cso-cso-tactile.mp4 reference.mp4 abord=12.3,appel=13.1,suspension=13.4,reception=13.9,courbe=16
```

## 7. Paramètres ajustables

| Fichier | Constante | Rôle |
|---|---|---|
| `src/entities/camera.js` | `CAM_COMP` | Distance, hauteur, point visé, champ, amortissements, anticipation, marge au-dessus des obstacles |
| `src/gameplay/csoRide.js` | `CSO_RIDE` | Cadence, vitesse max, rythme de la cadence, zones mortes, courbe de direction, rayon (radius0, radiusK), réponse, rampe clavier, perte à la réception |
| `src/gameplay/jumpModel.js` | `JUMP` | Marge au-dessus des barres (clear, spreadK), durée du vol (T0, Tk), recadrage (adapt, shorten), seuils |
| `src/gameplay/courseAids.js` | `LINE_MARK` | Taille, pas et longueur des repères au sol |
| `src/gameplay/courseLint.js` | `POLE_RULES`, `PARIS_RULES` | Règles de tracé vérifiées par les tests |
| `src/gameplay/csoCourse.js`, `parisCourse.js` | `*_DESIGN` | Tracés (lignes, courbes, obstacles) |

**Défauts relevés par la revue et corrigés :**
- Modèle de saut v2 limité aux épreuves.
- Causes de faute du cross, protections, barres des postérieurs.
- Pause pendant l'entrée et la sortie de piste.
- Décalage de l'interface, crans de cadence.
- Cohérence du retour d'appel, avertissement de capacité.
- Mode photo, textes, aide imposée dans les défis.

## 8. Limites et points à décider

- **Référence :** sans la vidéo, la caméra est réglée d'après votre description. Une fois la vidéo reçue, le réglage fin
  se fait dans `CAM_COMP` (hauteur, distance, point visé, champ).
- **Ligne au sol :**
  - Constat : dans les lignes droites, la silhouette du cheval et du cavalier cache la ligne sur une vingtaine de
    mètres. C'est inévitable avec une caméra centrée ; la ligne est visible dans les courbes et au-delà de l'obstacle
    suivant.
  - Option : deux rangées de repères écartées d'environ 1,9 m resteraient visibles, mais ce serait un couloir.
  - À trancher sur votre vidéo.
- **Paris :** le Sprint et le Grand Prix partagent le même canevas de 310 m. Le Sprint pourrait être redessiné plus
  court.
- **Barrage :** il se court sur le parcours complet du Grand Prix, comme avant.
- **Aide au saut :** le réglage par défaut reste « Complète » (zone au sol et bouton). Pour l'expérience la plus proche
  d'Athens 2004, choisissez « Aucune » (menu pause) : il ne reste que le retour après chaque saut.
- **Publication :** la version publique n'a pas été modifiée. Elle ne sera mise à jour qu'avec votre accord, en
  passant par le circuit de validation.
