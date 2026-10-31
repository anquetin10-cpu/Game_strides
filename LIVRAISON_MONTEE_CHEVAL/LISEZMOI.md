# Montée et descente à cheval réalistes, apparence constante du personnage

Tous les tests ont tourné dans Chromium, en rendu logiciel (SwiftShader), avec l'émulation iPhone 13 paysage (tactile). **Aucun n'a tourné sur un iPhone réel.** Les vidéos sont l'image du jeu, rendue image par image, avec une cadence reconstituée à 15 images/s.

## 1. Changements d'apparence : causes identifiées

Toutes les causes sont reproduites sur la version précédente (commit `60da01d`) par le même script, `tests/e2e/avatar-consistency.mjs`. Résultat : `mesures/avatar-avant.json`.

| # | Situation | Cause exacte (code) | Ce que voyait le joueur |
|---|---|---|---|
| A | **Monter à cheval**, **arriver sur un terrain de concours** | `Player.desiredOutfit()` recalculait la tenue 4 fois par seconde selon l'activité : « work » à pied, « ride » à cheval, « competition » au Pôle, à l'hippodrome ou à Saint-Gatien pendant un événement. Chaque changement reconstruisait le personnage (`_rebuild`). | Casque qui apparaît et disparaît à chaque montée ou descente. Tenue de concours complète (veste, chemise blanche, culotte blanche, bottes noires) en arrivant sur le terrain. |
| B | **Soir, matin, pluie** | `_outfit()` choisissait le haut selon l'heure et la météo (blouson sombre avant 9 h 30, après 20 h ou sous la pluie, sinon polo bleu). La couleur ne changeait qu'à la reconstruction suivante. | Le haut changeait de couleur au moment de monter ou de descendre de cheval (le soir, sous la pluie), donc *pendant* une autre action. |
| C | **Cadence basse** (mode « Auto », iPhone chargé) | `Realism.autoFallback()` supprimait tous les modèles réalistes, y compris celui du joueur, dès que la cadence passait sous 30 images/s. | Le personnage réaliste était remplacé par le personnage classique (autre visage, autres proportions) en pleine partie, une fois par partie. |
| D | **Début de partie, rechargement** | Le modèle réaliste du joueur se chargeait en tâche de fond après l'écran de chargement. | Personnage classique pendant les premières secondes, puis remplacé par le réaliste. |
| E | **Au volant (caméra de conduite éloignée)** | `Human._lod()` passait le joueur au maillage simplifié (LOD 1) au-delà de 11 m de la caméra (mesuré au volant du Scania). | Personnage simplifié dans la cabine (rendu classique). |

Les modèles 3D, squelettes, matériaux et proportions ne changeaient jamais par ailleurs. Les véhicules, magasins, missions et la région de Paris ne remplacent pas le personnage : ils ne faisaient que déclencher les causes A à E.

## 2. Corrections, à la source

| # | Correction | Fichier |
|---|---|---|
| A, B | **Une seule tenue, la même partout**, qui ne dépend que des choix du joueur : articles achetés et équipés, essai en boutique, veste de concours achetée. Elle ne dépend plus de l'heure, de la météo, de la monte ni du lieu. Le personnage n'est reconstruit que si ces choix changent, et jamais pendant une montée, une descente ou une séquence de véhicule. | `src/gameplay/player.js` |
| A | **Tête** : le couvre-chef équipé (casquette) s'il y en a un, sinon le casque (équipé ou d'origine), à pied comme à cheval. **Veste de concours achetée** : portée en permanence. Descriptions des articles mises à jour en FR et EN (« porté en permanence »). | `player.js`, `data.js`, `i18n/en/data.js` |
| C | **Le joueur garde son modèle quand la cadence baisse.** Seuls les passants, les chevaux et les voitures repassent en classique. Seul un réglage choisi par le joueur (« Modèles 3D », qualité « Économie ») change le joueur. | `src/entities/realistic.js` |
| D | **Préchargement du modèle réaliste du joueur** pendant l'écran de chargement (12 s au plus) : la première image montre le bon personnage. | `realistic.js`, `src/game.js` |
| E | **Le joueur reste toujours en modèle complet**, quelle que soit la distance de la caméra. | `src/entities/human.js` |

**Résultat**, sur 18 situations (marche, course, soir et pluie, montée, pas, trot, galop, saut, descente, Defender, Master, Scania, boutique, concours au Pôle, tour de caméra, baisse de cadence, région Paris, rechargement) :

| Version | Situations où l'apparence change | Reconstructions involontaires |
|---|---|---|
| Précédente | 13 | 4 |
| Corrigée | 0 | 0 |

Un changement volontaire (polo blanc acheté et équipé) s'applique une fois, puis reste le même à cheval, à pied et au rechargement.

## 3. Montée et descente à cheval

**Fichier** : `src/gameplay/horseMount.js` (nouveau). Le joueur l'utilise via `player.js`.

### Commandes

- **Un appui** sur « Monter » lance toute la séquence.
- **Un appui** sur « Descendre » arrête le cheval puis lance toute la descente.
- **Pendant la séquence**, aucune interaction n'est proposée et le joystick, le double appui et l'action secondaire sont ignorés. Le cheval reste à l'arrêt, avec ses petits mouvements (respiration, oreilles, queue).
- **Les contrôles à cheval** ne s'activent qu'une fois le cavalier installé. Les contrôles à pied reviennent après la réception au sol.
- **Côté de montée** : le côté gauche, comme un cavalier. Si un mur ou une clôture longe le flanc gauche, la montée se fait par la droite, en miroir exact.
- **Approche** : si le joueur arrive du mauvais côté, il contourne le cheval par l'avant, jamais par l'arrière-main.

### Montée (2,47 s, plus l'approche)

1. Approche à l'épaule, à hauteur de selle.
2. Main gauche aux rênes sur le garrot.
3. Main droite près du pommeau.
4. Pied gauche dans l'étrier : la plante est posée sur la grille de l'étrier qui pend (écart mesuré : 1,2 cm).
5. Flexion de la jambe d'appel, puis poussée.
6. Élévation contre le flanc, debout dans l'étrier, buste penché au-dessus de la selle.
7. Jambe droite lancée en arc : dehors, haut au-dessus de la croupe, puis dehors du flanc droit. Elle ne pénètre jamais le cheval (0 cm mesuré).
8. Descente douce du bassin dans la selle.
9. Pied droit à l'étrier, mains aux rênes, position de cavalier.

### Descente (1,87 s, une fois le cheval arrêté)

1. Pied droit libéré, rênes dans la main gauche sur le garrot, main droite au pommeau.
2. Appui sur l'étrier gauche.
3. Jambe droite en arc au-dessus de la croupe.
4. Transfert du poids à gauche.
5. Pied gauche libéré, glissade contrôlée.
6. Réception genoux fléchis.
7. Debout à l'épaule, rênes en main.

### Technique

- **Même objet tout du long** : le personnage reste le même maillage, le même squelette et le même modèle réaliste. Aucune version simplifiée ni de remplacement.
- **Images clés** : elles sont exprimées dans le repère du siège (celui de `Human.mount`). Ce repère passe de la verticale à l'os de selle pendant que le cavalier s'assoit.
- **Rattachement à la selle** : il se fait sans saut (0 cm, 0°, même échelle). La pose de cavalier prend le relais par un fondu court.
- **Poses** : bassin, tronc, pieds et mains sont placés par cinématique inverse (pose « board » existante).
- **Étriers** :
  - ils descendent dès l'approche ;
  - quand le pied est dedans, l'étrier le suit (`Horse._stirrupsFollow`), en selle comme pendant les séquences ;
  - ils remontent sur l'étrivière une fois le cavalier descendu.
- **Caméra** : elle glisse du profil « à pied » au profil « à cheval » (point suivi, recul, hauteur), sans à-coup. Saut maximal entre deux images : 0,11 m, champ de vision constant.
- **Interruptions** : téléportation, cheval retiré ou chargement de partie ramènent à un état stable (à pied, ou de nouveau en selle). Une sauvegarde faite pendant la montée enregistre le personnage au sol.
- **Montées programmées** : celles des missions, défis et téléportations restent instantanées, comme avant.

### Compatibilité

- **Chevaux du jeu** : Comète, Ulysse et Onyx passent. Ils ont tous le même squelette ; le test ajoute un cheval à l'échelle 1,06 comme contrôle technique.
- **Chevaux réalistes** (réglage « Chevaux 3D ») : la séquence fonctionne aussi.
- **Réglage par cheval** : `horse.riderFit` et `riderSeat` sont respectés.

## 4. Preuves

| Contenu | Fichiers |
|---|---|
| Vidéos continues | `videos/montee-descente-cheval-jeu.mp4` (caméra du joueur, avec quelques pas au pas entre la montée et la descente), `videos/montee-descente-cheval-profil.mp4` (profil fixe) |
| Captures avant / pendant / après | `captures/01` à `12` : approche, rênes et pommeau, pied à l'étrier, élévation, jambe au-dessus de la croupe, assise, position de cavalier, puis la descente jusqu'à « debout à l'épaule » |
| Mesures | `mesures/horse-mount.json`, `mesures/avatar-avant.json`, `mesures/avatar-apres.json` |

### Recette `tests/e2e/horse-mount.mjs` (tout vert)

| Id | Contrôle | Résultat |
|---|---|---|
| HM-00 | Le détecteur de pénétration fonctionne | Point dans la croupe détecté, point au-dessus non |
| HM-01 | Un appui lance la séquence ; double appui et joystick ignorés | Cheval immobile (0 m) |
| HM-02 | Plante du pied sur la grille de l'étrier | 1,2 cm |
| HM-02 | Main gauche aux rênes sur le garrot | 3,3 cm |
| HM-03 | Jambe au-dessus de la croupe, sans entrer dans le cheval | 0 cm de pénétration |
| HM-04 | Rattachement à la selle | 0 cm, 0°, même échelle |
| HM-05 | Descente | Réception au sol, contrôles à pied rétablis |
| HM-06 | Même personnage du début à la fin | Maillage, squelette, modèle réaliste et tenue identiques |
| HM-07 | Caméra et personnage | Caméra continue, aucune téléportation du personnage |
| HM-08 | Durées | Montée 2,47 s, descente 1,87 s |
| HM-08 | Trois cycles successifs | Tous complets |
| HM-08 | Autres chevaux | Ulysse, Onyx, échelle 1,06, cheval réaliste |
| HM-08 | Côté droit en miroir (mur à gauche) | Montée et descente complètes |

### Autres preuves

- **Apparence** : `tests/e2e/avatar-consistency.mjs`, résultats AV-01 à AV-04.
- **Non-régression** : `mesures/non-regression.txt`.

## 5. À-coup au démarrage trouvé et corrigé pendant la recette

La non-régression a révélé un blocage de plus de 30 s (rendu logiciel) au premier rendu après « Continuer », dans le scénario de reprise de mission (`mission-resume.mjs`).

**Bissection** : le test passe sur `0265639` et sur `60da01d`, et échoue sur la version de travail.

**Causes** :
- le personnage était reconstruit une fois au démarrage, avec une apparence identique (signature de tenue enregistrée pour la première fois) ;
- son modèle réaliste était alors jeté, ses shaders libérés puis recompilés ;
- ses matériaux n'étaient pas compilés pendant l'écran de chargement.

Sur iPhone, cela aurait donné un à-coup au démarrage.

**Corrections** :
- pas de reconstruction si la tenue calculée est identique à celle portée ;
- modèle réaliste du joueur créé avant la précompilation des shaders.

**Résultat** : `mission-resume.mjs` passe à 13/13.

## 6. Limites et points à décider

- **Pas d'iPhone réel.** La séquence ajoute au plus une pose par cinématique inverse par image et quelques transformations : c'est négligeable à côté du rendu, mais non mesuré sur appareil.
- **Pas de clip d'animation enregistré** : le geste est entièrement procédural (images clés et cinématique inverse), comme la montée dans les véhicules. Un vrai clip de capture de mouvement donnerait un rendu encore plus naturel ; le projet n'en contient pas.
- **Tête : choix fait.** Le casque est porté en permanence, sauf si le joueur équipe une casquette, alors portée partout, y compris à cheval. Si vous préférez le casque mis à cheval, c'est un changement visible, à faire de préférence pendant la montée (geste du casque).
- **Tenue de concours : choix fait.** La tenue de concours automatique est supprimée. La veste de concours achetée est portée en permanence. Si vous voulez une tenue de concours, il faudrait un choix explicite du joueur (« Se changer » au paddock, par exemple).
