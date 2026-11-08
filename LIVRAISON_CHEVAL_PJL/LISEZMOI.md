# Cheval de Jumping League Sim dans Equestrian Tour

Branche `claude/et-horse-pjl`, partie de `claude/strides-ui-iphone` (7695dcf, dernière passe d'interface). La branche ne
déclenche aucun déploiement : `.github/workflows/deploy.yml` ne se lance que sur `main`, `master` et
`claude/strides-grand-tour`, ou sur une pull request (aucune n'a été ouverte).

## Source réellement lue (lecture seule, non modifiée)

- Dépôt `anquetin10-cpu/PGL_Game-`, branche `claude/pjl-jumping-game`.
- Commit `afa56f9c84ab0cfbac47e77b8f0b38f17c7e5999`, du 5 novembre 2026 à 21:31 UTC.

## Fichiers importés et adaptés

| Source (PGL_Game-) | Equestrian Tour | Traitement |
| --- | --- | --- |
| `public/assets/models/horse.glb` | `public/real/horse_pjl.glb` | Copie à l'octet près (SHA-256 `06d8cb42…6e714`) : 419 os, 17 clips, 58 768 triangles, 6,4 Mo |
| `src/render/horse/HorseAsset.ts` | `src/entities/pjl/asset.js` | Converti en JS, logique gardée (racine retirée, **miroir à main gauche qui conserve les longueurs d'os**, sauts, robes, sellerie). Ajouts : chargeur du jeu, mesure des appuis des clips, pose de repos rétablie |
| `src/render/horse/HorseView.ts` | `src/entities/pjl/view.js` | Converti en JS. Ajouts : seuil du clip de saut aux vitesses du jeu, visibilité de la sellerie, robe mouillée |
| `SecondaryMotion.ts`, `coat.ts`, `surface.ts`, `tack.ts` | `src/entities/pjl/secondary.js`, `coat.js`, `surface.js`, `tack.js` | Convertis en JS, logique inchangée |
| `src/core/sim/jumpModel.ts`, `ride.ts` | — | Lus pour comprendre la synchronisation ; seule la constante `COM_CANTER_HEIGHT` (1,3 m) est reprise |

Code propre à Equestrian Tour :
- `src/entities/pjlHorse.js` : raccord à la simulation du jeu ;
- `src/entities/realistic.js` : chargement, choix des chevaux, repli ;
- quelques lignes dans `horse.js` (mise à jour, libération), `horse/anim.js` (instants de poser exportés), `game.js` (sellerie changée) et `phone.js` (crédit, état du chargement) ;
- `public/real/LICENSES.md` (attribution CC BY 4.0).

Three.js reste en 0.170, sans aucune mise à jour de dépendance.

## Raccord à la simulation (ce que fait `pjlHorse.js`)

Le cheval procédural du jeu reste la simulation. Il continue d'avancer, de sauter et d'émettre les pas, mais il est masqué (calque 31). Le cheval WildMesh est attaché à son maillage : position, cap, pente et hauteur du saut.

**Allures et mains**
- L'allure et la main au galop sont celles choisies par la locomotion du jeu. Les clips d'origine sont à main droite ; ce calage a été vérifié sur les appuis mesurés.
- La phase de foulée avance de la vitesse divisée par la longueur de foulée du clip, avec une cadence bornée. Elle est réécrite dans le cheval du jeu, de sorte que sons, empreintes et trot enlevé tombent sur les posers des clips. Écarts résiduels mesurés : 3 à 6 % de foulée, et 14 % sur le galop à gauche, dont les clips en miroir ont leur propre cadence.

**Saut**
- Le vol du jeu est réparti sur le clip, du départ des postérieurs (0,12 s avant leur décollage) à la réception des antérieurs.
- Le sommet du clip (bassin le plus haut) est calé sur le sommet de la parabole du jeu.
- Après la réception, le clip continue sur la foulée de réception, comme dans la source.

**Autres situations**
- Refus : clip d'arrêt glissé.
- Virages : clips à 90° avec inclinaison.
- Terrain : le cheval suit la pente du jeu ; les sabots sont mesurés près du sol.

**Cavalier (apparence d'Equestrian Tour inchangée)**
- L'os `saddle` du cheval du jeu est placé chaque image au point d'assise WildMesh, avec le tangage du dos et l'inclinaison. Il est recentré, image par image, sur l'axe du tronc : le milieu des deux ancres d'étrier skinnées. Le dos se balance jusqu'à 6 cm dans les clips de galop, le tronc beaucoup moins. Le cavalier, la montée et la descente sont exprimés dans ce repère.
- Étriers : écartés à la demi-largeur du tronc WildMesh mesurée sur les poses jouées (36 cm), plus 10 cm (demi-épaisseur de la jambe et de la botte, et mouvement du tronc). Pendant la montée et la descente, les étriers « qui pendent » sont ceux de la selle WildMesh.
- Montée et descente (`gameplay/horseMount.js`) : sur un cheval qui le demande (`riderFit.mountKneeOut`, donné seulement par le WildMesh), chaque genou hors de la selle est tourné vers l'extérieur du flanc du côté où se trouve son pied. Sans ce réglage, le pôle du genou pointait vers le cheval, que la cavalière regarde en montant. Le cheval procédural garde exactement le comportement d'avant.
- Étrivières et étriers sont dessinés depuis les portes-étrivières WildMesh. Les rênes vont du mors WildMesh aux poings ; la longe est attachée au mors.

**Chargement**
- Un seul fichier est chargé (le même pour tous les chevaux), pendant l'écran de chargement.
- Affiché pour le cheval du joueur, le cheval principal et les plus proches de la caméra, dans un rayon de 32 m : 3 chevaux au plus, 2 sur appareil tactile.
- Pas de cheval WildMesh en qualité Économie, en modèles « Classiques » ni en mode sûr.
- En cas d'échec : cheval du jeu affiché, avec un message.
- Les chevaux Tripo (modèle propre, essai compris) ne sont jamais remplacés.

## Vérifications

Toutes les vérifications ont été faites dans Chromium avec rendu logiciel SwiftShader et émulation tactile iPhone en paysage. **Ce n'est pas un vrai iPhone.**

### Test isolé du modèle (`tests/e2e/pjl/horse.html`, `isolated.mjs`)

- Préparation en 1,1 à 2,0 s, sans erreur.
- Longueurs des os des membres identiques à gauche et à droite sur les clips en miroir : rapport de 1,000.
- Main droite des clips d'origine confirmée par l'ordre des appuis.
- Contacts des sauts : départ des postérieurs à 0,31–0,35 s, réception des antérieurs à 0,83–0,92 s.

### Parcours jouable (`tests/e2e/pjl/ride.mjs`), en 844×390 et en 667×300

| Contrôle | Résultat |
| --- | --- |
| Démarrage, WildMesh pour Comète | ✔ |
| Repos, pas, trot, galop, grand galop | ✔ |
| Virage à gauche (galop à gauche, clips en miroir) et à droite (clips d'origine) | ✔ |
| Saut : envol, réception, retour au galop | ✔ |
| Sabots au sol à l'appui, sur plat et sur une pente de 11 % | ✔ |
| Reprise après rechargement | ✔ |
| Erreurs JavaScript | aucune |
| Montée et descente au bouton ACTION, séquence du jeu, côté gauche et côté droit (mur à gauche) | ✔ |
| Jambes hors du corps WildMesh pendant la montée et la descente (< 1 cm), des deux côtés | ✔ 0,0 cm (commit 3d2b003 : 16,5 cm à la montée, 8,8 cm à la descente, 12,9 cm côté droit) |
| Jambes hors du corps WildMesh en selle (< 1 cm) : repos, allures, grand galop, virages | ✔ 0,0 cm (3d2b003 : 4 à 4,8 cm au grand galop et en virage) |

Détecteur de pénétration : un point (cuisse, jambe, pied, sur l'os) est dans le corps si six rayons le rencontrent tous (maillage skinné en pose courante). Profondeur = surface la plus proche. Son propre contrôle passe : bassin du cheval dedans (9 cm), point au-dessus du garrot dehors.

Comparaison ciblée (`tests/e2e/pjl/legs.mjs`, mêmes instants et mêmes vues, captures dans `captures/jambes-avant-apres.jpg`) : montée 16,5 → 0 cm, descente 8,2 → 0 cm, grand galop en ligne droite 1,0 → 0 cm.

### Non-régression (tests existants)

- Soins : ✔
- Montée/descente (`horse-mount.mjs`, HM-08d compris) : ✔
- Transport en camion : ✔
- CSO : ✔
- Sauvegardes : ✔
- Reprise de mission : ✔
- Cheval Tripo (`tripo-horse.mjs`, parties A à E, manche D sans captures : `--cso-sans-images`) : ✔, toutes les vérifications passent. A2 a été adapté : la vue « classique » de Comète est attendue en WildMesh. Le test exige alors le cheval du jeu masqué (corps, parties, sellerie), le WildMesh actif, attaché, seul affiché et dessellé, et des sabots WildMesh. La vue Tripo exige l'absence de WildMesh. Sans WildMesh, les anciens contrôles s'appliquent. La version de référence 7695dcf échoue sur B-trot-appui (glissement de 0,16 cm pour un seuil de 0,15) : c'est un défaut préexistant, pas une régression.
- Partie D (manche de CSO) : elle n'était pas bloquée mais lente, à cause de ses captures (environ 0,8 par seconde en rendu logiciel, près de 1 000 captures). Elle dépassait les limites de temps. Sans captures : 30 s, et D1 à D4 passent sur la référence comme sur la nouvelle version (manche terminée sans élimination, Tripo affiché sur toutes les images, aucune téléportation).
- Tests unitaires : 283 sur 283.

### Mesures

Même vue au galop, CPU de la machine de test : ordres de grandeur, ni une cadence ni une promesse d'images par seconde sur iPhone.

| | Avant (7695dcf) | Après |
| --- | --- | --- |
| Temps CPU d'une image, médiane | 3,9 ms | 5,2 ms |
| Appels de dessin | 37 | 50 |
| Triangles | 369 000 | 414 000 |
| Tas JavaScript | ≈ 205 Mo | ≈ 255 Mo |

Le fichier pèse 6,4 Mo. Préparation au chargement : 1,1 s environ (miroirs, sellerie, appuis).

## Limites

- Pas de vrai iPhone : mémoire et cadence restent à vérifier sur l'appareil.
- Les tests ne prouvent pas la naturalité du geste : ils mesurent positions, contacts et calages.
- Le cheval n'a ni licol ni empreinte dédiée au box. La longe s'attache au mors. Le filet n'est affiché que si le cheval est sellé.
- Robes : les chevaux du jeu à robe personnalisée (couleurs libres) prennent la robe baie de la source.
- Clips à main gauche (miroir corrigé de la source) : sabots 3 à 4 cm plus bas à l'appui et cadence un peu différente de la main droite. C'est le comportement de la source, conservé.
- La mesure de pénétration porte sur l'axe des os de la jambe (seuil 1 cm, mesuré : 0 cm partout), pas sur la surface des bottes : un léger contact de la botte avec le flanc ou le quartier reste possible, comme en réalité.
- Pendant la montée, le genou côté montoir est nettement ouvert vers l'extérieur : c'est la condition pour ne pas traverser ce cheval large.
- Licence : la copie du cheval a été reçue sous CC BY 4.0, avec l'attribution affichée dans le jeu. L'auteur présente désormais la version gratuite comme « personal use only » : une licence commerciale reste à décider par le propriétaire. Rien n'a été acheté.
