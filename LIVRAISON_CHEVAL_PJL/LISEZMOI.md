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
- L'os `saddle` du cheval du jeu est placé chaque image au point d'assise WildMesh, recentré de 2,4 cm sur l'axe du tronc, avec le tangage du dos et l'inclinaison. Le cavalier, la montée et la descente sont exprimés dans ce repère.
- Étriers : écartés à la demi-largeur du tronc WildMesh mesurée sur les poses jouées (36 cm), plus 8 cm.
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
| Montée et descente au bouton ACTION, séquence du jeu | ✔ |
| Jambes hors du corps WildMesh pendant la montée et la descente | ✘ 8,8 à 16,5 cm, pendant environ 0,4 s : debout dans l'étrier et passage de la jambe |
| Jambes hors du corps WildMesh en selle | ✘ 0 cm au repos, au pas, au trot et au galop de travail ; 4 à 4,8 cm à la cheville au grand galop et en virage |

### Non-régression (tests existants)

- Soins : ✔
- Montée/descente (`horse-mount.mjs`, HM-08d compris) : ✔
- Transport en camion : ✔
- CSO : ✔
- Sauvegardes : ✔
- Reprise de mission : ✔
- Cheval Tripo :
  - A0 à C3 passent ;
  - A2 échoue comme prévu : sa vue « classique » de Comète suppose le cheval procédural, et Comète est maintenant affichée en WildMesh ;
  - la partie D (manche de CSO) a dépassé la limite de 25 min du test (voir `mesures/`).
- Tests unitaires : 283 sur 283.

### Mesures

Même vue au galop, CPU de la machine de test : ordres de grandeur, ni une cadence ni une promesse d'images par seconde sur iPhone.

| | Avant (7695dcf) | Après |
| --- | --- | --- |
| Temps CPU d'une image, médiane | 3,9 ms | 4,9 à 5,2 ms |
| Appels de dessin | 37 | 50 |
| Triangles | 369 000 | 414 000 |
| Tas JavaScript | ≈ 205 Mo | ≈ 240 à 265 Mo |

Le fichier pèse 6,4 Mo. Préparation au chargement : 1,1 s environ (miroirs, sellerie, appuis).

## Limites

- Pas de vrai iPhone : mémoire et cadence restent à vérifier sur l'appareil.
- Les tests ne prouvent pas la naturalité du geste : ils mesurent positions, contacts et calages.
- Le cheval n'a ni licol ni empreinte dédiée au box. La longe s'attache au mors. Le filet n'est affiché que si le cheval est sellé.
- Robes : les chevaux du jeu à robe personnalisée (couleurs libres) prennent la robe baie de la source.
- Clips à main gauche (miroir corrigé de la source) : sabots 3 à 4 cm plus bas à l'appui et cadence un peu différente de la main droite. C'est le comportement de la source, conservé.
- La séquence de montée et de descente est réglée pour le cheval du jeu, plus étroit : la jambe traverse le flanc WildMesh pendant environ 0,4 s.
- Licence : la copie du cheval a été reçue sous CC BY 4.0, avec l'attribution affichée dans le jeu. L'auteur présente désormais la version gratuite comme « personal use only » : une licence commerciale reste à décider par le propriétaire. Rien n'a été acheté.
