# Voie A : ce qu'elle donne, ce qui manque, ce qu'il faut décider

Page pour Julien, 24/11/2026 (étape M3), bilan final du plan S1 à S5 le 25/11/2026 (en fin de page). Détails : `README.md` (journal), `niveau-a.md`, `niveau-b.md`, `cout.md`.

## En une phrase

La cavalière actuelle, montée par les règles du web, se tient comme dans le web quand on lui donne le cheval du web ;
sur le cheval Unreal, elle reste assise et correcte, mais le cheval Unreal n'est pas encore celui du web (plus petit,
ne s'incline pas), et c'est lui qui fait l'essentiel des écarts. Depuis l'étape S2 b (25/11/2026), cavalière de la règle,
main du web et sellerie sont le comportement par défaut du jeu (`-StridesMonte=ancien` pour revenir à l'ancien).

## Ce que la voie A donne (mesuré)

- **Les règles du web sont portées sans perte.** Même cavalière, mêmes entrées : écart de 0,0001 cm sur 689 images
  (arrêt, galop à droite et à gauche, deux sauts). C'est le niveau A.
- **Le cheval Unreal parle maintenant la langue du web.** Galop à gauche et sauts à main gauche (clips miroir, étape M2) ;
  phase de foulée donnée à la cavalière comme dans le web (étape M3) : égale au web à 5e-10 près quand le cheval galope ou
  trotte.
- **Sur le cheval Unreal (niveau B)**, sur 215 critères du plan :
  - tenus : pied sur le point d’étrier (M1) et cheville jamais au-delà de sa place naturelle (M2) partout, coude et allonge du bras partout,
    appel, sommet et poser des antérieurs du saut à l'image près ;
  - non tenus : 61. Mais 20 des 23 seuils manqués le sont aussi par le web lui-même (jambe un peu tendue, genou qui
    touche le flanc, poignet un peu bas) : ce sont des limites de la règle du web, pas du portage ;
  - les écarts propres à Unreal viennent du cheval : hanche jusqu'à 14° et ouverture du genou jusqu'à 21° d'écart au galop
    en cercle (le cheval du web se penche dans le virage, pas celui d'Unreal) ; assise au pas jusqu'à 2,3 cm ; au saut E3,
    postérieurs vus posés 12 images trop tôt (cheval plus petit, corps non remonté).
  - Preuve que ce n'est pas le portage : le même cheval Unreal, posé comme celui du web, redonne la cavalière du web à
    0,64 cm près avant le premier saut.
- **Coût (Mac mini, rendu réel, étape 7)** : la règle ajoute 0,03 ms à l'arrêt et 0,05 ms au galop par image ; la sellerie
  du cheval 0,011 ms ; les clips miroir se cuisent en 0,4 à 0,8 s au chargement. Le coût du mélangeur à couches du cheval
  en partie jouée n'est pas mesuré (à confirmer). Rien n'est mesuré sur iPhone ou iPad.

Captures appariées (même image, même caméra ; décors différents) dans `captures/niveau-b/` : `monte-<arret | galop |
galop-gauche | saut-sommet>-web.png` contre `-unreal-b.png`.

## Ce qui manque

1. ~~**Selle, tapis, bride, rênes, étrivières, étriers** : absents du cheval Unreal.~~ **Fait à l'étape S1 (25/11/2026)**,
   derrière `-StridesRider=regles` (ou `-StridesTack=web`) : pièces du web importées (mêmes os, mêmes poids ; à 0,44 cm du
   web hors saut), étriers, étrivières et rênes identiques au bit au web (ctest), étrier sous le pied de la cavalière
   (M4 ≤ 1,00 cm, seuil 2 cm). Captures avant / après : `captures/sellerie/`. Visible dans le jeu par défaut depuis
   l'étape S2 b ; au saut, les pièces suivent le cheval Unreal, qui ne bascule pas comme celui du web (S4).
2. **Taille du cheval** : 3,7 % plus petit que celui du web. Le changer touche le concours déjà prouvé. **Étape S3 a
   (25/11/2026)** : cause mesurée (constante 0,01 de l'acteur ; import et clips hors de cause), taille du web derrière
   `-StridesHorseScale=web` (garrot à 1,48 m des sabots comme le web) ; relevés du concours identiques, niveau B 61 → 58
   critères non tenus ; captures `captures/s3/`. **Par défaut depuis l'étape S3 b** (`-StridesHorseScale=jeu` ou
   `-StridesMonte=ancien` : 0,01), captures du CSO refaites.
3. ~~**Inclinaison dans les virages** et **corps au saut** (bascule face aux barres, hauteur du corps) : non portés.~~
   **Fait aux étapes S4 a et S4 b (25/11/2026)**, par défaut (`-StridesHorseView=jeu` pour l'ancienne vue) : inclinaison
   en virage (12,9° au plus en cercle, comme le web), bascule face aux barres, hauteur du corps, repli des membres.
4. ~~**Horloge du saut et cadence**~~ : **fait à l'étape S4** : cadence des clips réglée sur la vitesse, horloge du saut
   calée sur les appuis du clip, phase de foulée qui avance pendant le saut ; oracle des appuis : 622 posers et levers sur
   659 à l'image exacte du web (17 avant), 632 après S5 (contrôle du 26/11/2026).
5. ~~**Trot et saut au grand galop** importés à 30 images/s au lieu de 24 : jusqu'à 0,64 cm sur la cavalière au trot.~~
   **Fait à l'étape S5 (25/11/2026)** : réimportés à 24 images/s ; cavalière du contrôle à 0,037 cm d'O2 avant le premier
   saut, sabots au grand saut à 2,46 cm du web (19,81 cm avant).
6. **Montée et descente** : non mesurées (pas d'oracle).

## Choix à faire pour en faire le comportement par défaut

| Choix | Effet | Coût de la décision |
|---|---|---|
| A. Cavalière par la règle (`-StridesRider=regles`) par défaut | posture du web, à toutes les allures | **fait (étape S2 b)** : captures du concours refaites |
| B. Main du web (`-StridesHorseLead=web`) par défaut | galop à gauche, sauts en miroir, seuil du grand saut à 8 m/s comme le web | **fait (étape S2 b)** : le jeu part au galop à gauche ; preuves du concours refaites |
| C. Cheval à la taille du web (+3,7 %) | rênes, poignets et portée de la jambe plus proches du web (niveau B 61 → 58) | **fait (étape S3 b)**, par défaut ; captures du concours refaites |
| D. Sellerie du web sur le cheval Unreal | selle, bride, rênes et étriers visibles, étriers qui suivent les pieds | **fait (étape S1)**, par défaut avec A et B (étape S2 b) |
| E. Inclinaison en virage, corps et horloge du saut | galop en cercle et saut comme le web | **fait (étapes S4 a et S4 b)**, par défaut ; captures du concours refaites |
| F. Clips du trot et du grand saut réimportés à 24 images/s | trot au millimètre | **fait (étape S5)** ; captures du concours refaites et comparées : inchangées hors bruit, gardées |

Ordre proposé par Tom (à décider par Julien) : D d'abord (le plus visible), puis A avec B ensemble, puis C ; E et F
ensuite. Chacun passe par une option tant que Julien n'a pas vu les captures.

## Bilan final du plan S1 à S5 (25/11/2026)

Décision de Julien du 24/11/2026 exécutée dans l'ordre, chaque étape derrière une option puis par défaut quand ses
contrôles étaient conformes. Tout est le jeu par défaut ; `-StridesMonte=ancien` rend l'ancien comportement (sauf la
cadence des clips de S5, qui est une donnée : l'ancienne reste dans l'historique git, `35e5532f`).

| Étape | Prouvé | Partiel | Non vérifié |
|---|---|---|---|
| S1 sellerie complète | étriers, étrivières et rênes identiques au bit au web (ctest) ; pièces à 0,44 cm du web hors saut ; étrier sous le pied (M4 ≤ 1,00 cm) | au saut, pièces liées au corps du cheval Unreal (corrigé par S4) | rendu sur iPhone ou iPad |
| S2 cavalière réglée comme le web, main du web | niveau A à 0,0001 cm ; relevés du concours identiques ; démonstration « 0 pt Arrivée ✓ » | niveau B : critères manqués venant du cheval (réduits par S3 à S5) et de la règle du web elle-même | paquet iOS, coût sur appareil |
| S3 taille du web (+3,88 %) | garrot à 1,48 m comme le web ; relevés du concours identiques | niveau B 61 → 58 | idem |
| S4 inclinaison, corps et horloge du saut | logique égale au web dans le moteur (2,8e-16) ; 632 appuis sur 659 à l'image du web après S5 (622 à S4) ; plus aucun sabot sous une barre (marge minimale +11,8 à +14,4 cm selon la partie) | `SecondaryMotion` et `_limbContacts` non portés (hors décision) ; coût en jeu avec rendu non mesuré | idem |
| S5 trot et grand saut à 24 images/s | 17 clips à 24 images/s (épinglé : `HorseView` pour les 17, `HorseMirror` pour les 11 sources des miroirs) ; clips miroir à 0,05 cm du web ; cavalière du contrôle à 0,037 cm d'O2 avant le saut ; sabots du grand saut à 2,46 cm | — | coût non remesuré (moins de clés) |

Sur le cheval Unreal (niveau B), **50 critères sur 233 restent non tenus** (61 sur 215 au départ, avant l'ajout des
critères de sellerie) : la plupart sont aussi manqués par le web lui-même (limites de la règle du web : jambe tendue,
genou contre le flanc) ; contre O2 (mêmes proportions de cavalière), 3 écarts. Le contrôle (cheval Unreal posé comme celui
du web) redonne la cavalière du web à 0,037 cm avant le premier saut : le portage n'ajoute rien de mesurable.

Restent, hors de la décision du 24/11 (à proposer, rien n'est engagé) : mouvements secondaires du cheval (queue, crinière,
encolure, oreilles), contacts des membres avec les barres, coût en jeu avec rendu de la vue du cheval, et toute mesure sur
iPhone ou iPad (aucun paquet construit, comme demandé).
