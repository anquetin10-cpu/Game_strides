# Voie A : ce qu'elle donne, ce qui manque, ce qu'il faut décider

Page pour Julien, 24/11/2026 (étape M3). Détails : `README.md` (journal), `niveau-a.md`, `niveau-b.md`, `cout.md`.

## En une phrase

La cavalière actuelle, montée par les règles du web, se tient comme dans le web quand on lui donne le cheval du web ;
sur le cheval Unreal, elle reste assise et correcte, mais le cheval Unreal n'est pas encore celui du web (plus petit,
sans selle ni bride, ne s'incline pas), et c'est lui qui fait l'essentiel des écarts.

## Ce que la voie A donne (mesuré)

- **Les règles du web sont portées sans perte.** Même cavalière, mêmes entrées : écart de 0,0001 cm sur 689 images
  (arrêt, galop à droite et à gauche, deux sauts). C'est le niveau A.
- **Le cheval Unreal parle maintenant la langue du web.** Galop à gauche et sauts à main gauche (clips miroir, étape M2) ;
  phase de foulée donnée à la cavalière comme dans le web (étape M3) : égale au web à 5e-10 près quand le cheval galope ou
  trotte.
- **Sur le cheval Unreal (niveau B)**, sur 215 critères du plan :
  - tenus : pied sur le point d'étrier (M1) et écart latéral du pied (M2) partout, coude et allonge du bras partout,
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

1. **Selle, tapis, bride, rênes, étrivières, étriers** : absents du cheval Unreal. La cavalière tient des rênes
   invisibles et a les pieds sur des étriers invisibles. C'est le manque le plus visible.
2. **Taille du cheval** : 3,7 % plus petit que celui du web. Le changer touche le concours déjà prouvé.
3. **Inclinaison dans les virages** et **corps au saut** (bascule face aux barres, hauteur du corps) : non portés.
4. **Horloge du saut et cadence** : en partie jouée, le cheval Unreal joue ses clips à vitesse 1 ; le web règle la
   cadence sur la vitesse et cale le saut sur les appuis du clip. Pendant le saut, la phase de foulée est tenue (le web la
   fait avancer) : jusqu'à 4,1 cm sur les mains après la réception.
5. **Trot et saut au grand galop** importés à 30 images/s au lieu de 24 : jusqu'à 0,64 cm sur la cavalière au trot.
6. **Montée et descente** : non mesurées (pas d'oracle).

## Choix à faire pour en faire le comportement par défaut

| Choix | Effet | Coût de la décision |
|---|---|---|
| A. Cavalière par la règle (`-StridesRider=regles`) par défaut | posture du web, à toutes les allures | refaire les captures du concours où la cavalière est visible |
| B. Main du web (`-StridesHorseLead=web`) par défaut | galop à gauche, sauts en miroir, seuil du grand saut à 8 m/s comme le web | le jeu part au galop à gauche ; preuves du concours à refaire |
| C. Cheval à la taille du web (+3,7 %) | supprime la plus grande part des écarts du niveau B | preuves du concours à refaire (sauts, caméra) |
| D. Sellerie du web sur le cheval Unreal | selle, bride, rênes et étriers visibles, étriers qui suivent les pieds | une étape dédiée (export de la sellerie du web, test, captures) |
| E. Inclinaison en virage, corps et horloge du saut | galop en cercle et saut comme le web | une étape dédiée au saut animé, avec un oracle des appuis |
| F. Clips du trot et du grand saut réimportés à 24 images/s | trot au millimètre | clips du concours touchés, preuves à refaire |

Ordre proposé par Tom (à décider par Julien) : D d'abord (le plus visible), puis A avec B ensemble, puis C ; E et F
ensuite. Chacun passe par une option tant que Julien n'a pas vu les captures.
