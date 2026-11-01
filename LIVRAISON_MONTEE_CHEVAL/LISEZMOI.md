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
| F | **Tout changement de vêtement** | `resolveOutfit()` tirait au hasard la taille, la couleur des yeux, la coiffure et la barbe à partir d'une graine calculée sur *toute* la tenue. Changer un vêtement changeait donc la graine. | Taille, visage ou coiffure qui changeaient en même temps que la tenue (casque mis, concours, article acheté). |

Les modèles 3D, squelettes, matériaux et proportions ne changeaient jamais par ailleurs. Les véhicules, magasins, missions et la région de Paris ne remplacent pas le personnage : ils ne faisaient que déclencher les causes A à F.

## 2. Corrections, à la source

| # | Correction | Fichier |
|---|---|---|
| A, B | **Une tenue de référence, la même partout** : polo bleu STRIDES, **culotte beige**, bottes hautes marron, pour le personnage féminin comme masculin. Elle ne dépend plus de l'heure, de la météo ni du lieu. Les vêtements achetés et équipés (haut, col, bottes, casquette) la remplacent, à pied comme à cheval. | `src/gameplay/player.js` |
| A | **Casque uniquement à cheval.** Il est mis par un geste pendant la montée (main droite à la tête, au début de la séquence) et retiré par le même geste après la réception au sol. À pied, tête nue (ou la casquette achetée, si elle est équipée). Couleur : le casque acheté et équipé, sinon noir. | `player.js`, `src/gameplay/horseMount.js` |
| A | **Tenue de concours automatique, uniquement pendant une mission de concours**, où que soit le joueur (dès l'engagement, même loin du terrain) : veste noire (bleu marine si la veste de concours est achetée), chemise blanche, culotte blanche, bottes noires. Missions concernées : concours du Pôle, Cross de Saint-Gatien, Derby de la Touques, Qualificative CSI 3★, Grand Prix CSI 5★, Grand Prix de Paris Indoor, M3 « Le premier concours en équipe ». Elle est retirée à la fin ou à l'abandon de la mission. Les entraînements (sprint de la plage, tour de l'hippodrome, abord au paddock, parcours du Pôle) et les défis rejouables gardent la tenue de référence. Descriptions des articles revenues au texte d'origine (FR et EN). | `player.js`, `data.js`, `i18n/en/data.js` |
| A | **Changement de tenue sur place** : un changement de vêtements (casque, concours, achat) recolore le même maillage et met à jour le modèle réaliste. Le personnage n'est plus jamais reconstruit pendant la partie. | `src/entities/humanModel.js`, `src/entities/human.js` |
| F | **Identité figée** : graine propre au joueur, taille, yeux, coiffure et barbe fixés. Ils ne dépendent plus des vêtements. | `player.js`, `src/entities/human/outfits.js` |
| C | **Le joueur garde son modèle quand la cadence baisse.** Seuls les passants, les chevaux et les voitures repassent en classique. Seul un réglage choisi par le joueur (« Modèles 3D », qualité « Économie ») change le joueur. | `src/entities/realistic.js` |
| D | **Préchargement du modèle réaliste du joueur** pendant l'écran de chargement (12 s au plus) : la première image montre le bon personnage. | `realistic.js`, `src/game.js` |
| E | **Le joueur reste toujours en modèle complet**, quelle que soit la distance de la caméra. | `src/entities/human.js` |

**Résultat** (mesure de la version précédente sur 18 situations ; la version corrigée est mesurée sur 20 : marche, course, soir et pluie, montée, pas, trot, galop, saut, descente, Defender, Master, Scania, boutique, concours accepté loin du Pôle, concours sur le terrain, entraînement, tour de caméra, baisse de cadence, région Paris, rechargement) :

| Version | Situations où l'apparence change | Reconstructions involontaires |
|---|---|---|
| Précédente | 13 | 4 |
| Corrigée | 0 (même corps, visage, coiffure et taille partout ; vêtements = tenue de référence, ou tenue de concours dans les 2 situations de concours ; casque seulement à cheval) | 0 |

Un changement volontaire (polo blanc acheté et équipé) s'applique une fois, sur place, puis reste le même à cheval, à pied et au rechargement.

**Captures de la tenue** (`captures/tenue/`, personnages féminin `f-` et masculin `m-`) : à pied (tenue de référence, tête nue), à cheval (casque), mission de concours acceptée à pied puis à cheval, et à pied après l'abandon du concours (retour à la tenue de référence). Vue d'ensemble : `captures/tenue/planche.jpg`.

## 3. Montée et descente à cheval

**Fichier** : `src/gameplay/horseMount.js` (nouveau). Le joueur l'utilise via `player.js`.

### Commandes

- **Un appui** sur « Monter » lance toute la séquence.
- **Un appui** sur « Descendre » arrête le cheval puis lance toute la descente.
- **Pendant la séquence**, aucune interaction n'est proposée et le joystick, le double appui et l'action secondaire sont ignorés. Le cheval reste à l'arrêt, avec ses petits mouvements (respiration, oreilles, queue).
- **Les contrôles à cheval** ne s'activent qu'une fois le cavalier installé. Les contrôles à pied reviennent après la réception au sol.
- **Côté de montée** : le côté gauche, comme un cavalier. Si un mur ou une clôture longe le flanc gauche, la montée se fait par la droite, en miroir exact.
- **Approche** : si le joueur arrive du mauvais côté, il contourne le cheval par l'avant, jamais par l'arrière-main.

### Montée (2,50 s, plus l'approche)

1. Approche à l'épaule, à hauteur de selle.
2. Main gauche aux rênes sur le garrot ; **main droite à la tête : le casque est mis**.
3. Main droite près du pommeau.
4. Pied gauche dans l'étrier : la plante est posée sur la grille de l'étrier qui pend (écart mesuré : 1,2 cm).
5. Flexion de la jambe d'appel, puis poussée.
6. Élévation contre le flanc, debout dans l'étrier, buste penché au-dessus de la selle.
7. Jambe droite lancée en arc : dehors, haut au-dessus de la croupe, puis dehors du flanc droit. Elle ne pénètre jamais le cheval (0 cm mesuré).
8. Descente douce du bassin dans la selle.
9. Pied droit à l'étrier, mains aux rênes, position de cavalier.

### Descente (2,43 s, une fois le cheval arrêté, retrait du casque compris)

1. Pied droit libéré, rênes dans la main gauche sur le garrot, main droite au pommeau.
2. Appui sur l'étrier gauche.
3. Jambe droite en arc au-dessus de la croupe.
4. Transfert du poids à gauche.
5. Pied gauche libéré, glissade contrôlée.
6. Réception genoux fléchis.
7. Debout à l'épaule, rênes dans la main gauche ; **main droite à la tête : le casque est retiré**, puis la main redescend.

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
| Vidéos continues | `videos/montee-descente-cheval-jeu.mp4` (caméra du joueur, avec quelques pas au pas entre la montée et la descente), `videos/montee-descente-cheval-profil.mp4` (profil fixe). Le geste du casque est visible au début de la montée et à la fin de la descente. |
| Captures avant / pendant / après | `captures/01` à `14` : approche, casque mis, rênes et pommeau, pied à l'étrier, élévation, jambe au-dessus de la croupe, assise, position de cavalier, puis la descente jusqu'au casque retiré et « debout à l'épaule ». Tenue : `captures/tenue/` |
| Mesures | `mesures/horse-mount.json`, `mesures/avatar-avant.json`, `mesures/avatar-apres.json` |

### Recette `tests/e2e/horse-mount.mjs` (tout vert)

| Id | Contrôle | Résultat |
|---|---|---|
| HM-00 | Le détecteur de pénétration fonctionne | Point dans la croupe détecté, point au-dessus non |
| HM-01 | Un appui lance la séquence ; double appui et joystick ignorés | Cheval immobile (0 m) |
| HM-02 | Plante du pied sur la grille de l'étrier | 1,2 cm |
| HM-02 | Main gauche aux rênes sur le garrot | 2,8 cm |
| HM-03 | Jambe au-dessus de la croupe, sans entrer dans le cheval | 0 cm de pénétration |
| HM-04 | Rattachement à la selle | 0 cm, 0°, même échelle |
| HM-05 | Descente | Réception au sol, contrôles à pied rétablis |
| HM-06 | Même personnage du début à la fin | Maillage, squelette, modèle réaliste, vêtements, taille et coiffure identiques |
| HM-06b | Casque mis pendant la montée, retiré après la descente | À cheval : casque (classique et réaliste) ; à pied : tête nue |
| HM-07 | Caméra et personnage | Caméra continue, aucune téléportation du personnage |
| HM-08 | Durées | Montée 2,50 s, descente 2,43 s |
| HM-08 | Trois cycles successifs | Tous complets |
| HM-08 | Autres chevaux | Ulysse, Onyx, échelle 1,06, cheval réaliste |
| HM-08 | Côté droit en miroir (mur à gauche) | Montée et descente complètes |

### Autres preuves

- **Apparence** : `tests/e2e/avatar-consistency.mjs`, résultats AV-01 à AV-04 (dont AV-01b vêtements, AV-01c casque, AV-01e tenue de concours).
- **Captures de la tenue** : `tests/e2e/outfit-captures.mjs`.
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
- **Tête** : casque à cheval uniquement, mis et retiré par un geste pendant la montée et la descente. Les montées instantanées (missions, défis, téléportation) mettent le casque sans geste.
- **Tenue de concours** : automatique pendant une mission de concours, où que soit le joueur. **Point à valider** : les entraînements et les défis rejouables (rangés eux aussi dans « Événements ») gardent la tenue de référence, car ce ne sont pas des concours. Si vous voulez la tenue de concours aussi pour les défis, c'est une ligne à changer (`Player.competitionOutfit`).
