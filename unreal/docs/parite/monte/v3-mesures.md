# Mesures v3 des règles de monte (oracle O1)

Écrit par `scripts/unreal/rider-rules-metrics.mjs` à partir de `unreal/core/tests/oracles/monte/o1` (export `scripts/unreal/export-rider-rules.mjs`, schéma `strides.oracle.rider_rules/1`, arbre `src` fe5c551c756f07510b7bf36522738e5aa7fd72f1). Ne pas modifier à la main : relancer les deux scripts.

Première mesure de la v3 (constat 1 d’`oracle-monte.md`). Les règles sont mesurées sur le squelette classique de 25 os, où elles sont appliquées ; le modèle réaliste `rider_f.glb` n’est que le rendu visible (constat 2). Grandeurs : `oracle-monte.md` §2.5. Statistiques sur la fenêtre de mesure de chaque scénario (après le fondu de mise en selle), côtés gauche et droit confondus sauf mention. Repère du siège S : x vers la gauche, y vers le haut, z vers l’avant.

Cavalière : échelle 0,985, jambe (cuisse + jambe) 78,3 cm, bras 51,7 cm. Cheval : Comète (`comete`), WildMesh.

## Scénarios

| Id | Scénario | Images | Fenêtre | Fin du fondu | Acceptation de l’essai |
|---|---|---|---|---|---|
| E1 | arrêt, en selle : 20 images de stabilisation puis le plan « repos » (45 images) | 65 | 20 à 64 | 13 | oui |
| E1b | arrêt depuis le galop : plan « arret » (préparation de 60 images au galop, puis 70 images à l’arrêt) | 130 | 60 à 129 | 13 | oui |
| E2g | galop à gauche : 60 images de mise en train sur le même cercle depuis l’arrêt, puis le plan « galop-gauche » (80 images) | 140 | 60 à 139 | 13 | oui |
| E2d | galop à droite : 60 images de mise en train sur le même cercle depuis l’arrêt, puis le plan « galop-droite » (80 images) | 140 | 60 à 139 | 13 | oui |
| E3 | vertical de 1,10 m abordé à 6,5 m/s, appel « normal » (cas CSO de rider-audit.mjs) ; événements : sans faute | 105 | 20 à 104 | 13 | oui |
| E3b | vertical de 1,40 m abordé à 9 m/s, appel « normal » (cas CSO de rider-audit.mjs) ; événements : sans faute | 109 | 20 à 108 | 13 | oui |
| E6t | trot enlevé : 45 images de mise en train en ligne droite, puis le plan « trot » (75 images) ; hors acceptation de l’essai | 120 | 45 à 119 | 13 | non (exporté pour plus tard) |
| E6v | virage à droite au galop : 60 images au galop en ligne droite, puis le plan « virage-droite » (60 images) ; hors acceptation de l’essai | 120 | 60 à 119 | 13 | non (exporté pour plus tard) |

## Contrôle de lecture (critère de l’étape 2)

L’étrier affiché est posé sur l’os de l’avant-pied moins `0,015 · scale` en y du monde (`horse.js:209-210`) : la distance avant-pied – étrier vaut donc 0,014775 m (0,015 × 0,985), et non 0,015 m comme l’écrit le plan. Écart maximal à cette valeur, à toutes les images exportées de tous les scénarios : **5,58e-14 m** (critère : 1e-6 m). L’export lit donc les bons os aux bonnes images.

## Contacts (cm)

M1 : plante – point d’étrier visé (y, z). M2 : écart latéral de la plante au réglage stirrupX. M3 : dérive de la plante depuis la première image de la fenêtre. M4 : plante – étrier affiché. M5 : étrivière. M7 : écart au flanc vu par la règle, minimum sur genou, tibia (35 et 65 %), cuisse (50 et 75 %, moins 2 cm) ; < 0 : dans le profil. M8 : pénétration des axes d’os dans le maillage du cheval. M9 : poignet au-dessus de l’encolure (cible de la règle : 10 cm).

| Id | M1 y | M1 z | M2 | M3 y | M3 z | M4 | M5 | M7 min | M8 max | M9 min |
|---|---|---|---|---|---|---|---|---|---|---|
| E1 | 0,0 à 0,1 | -0,7 à -0,4 | 0,6 à 2,2 | 0,0 à 0,0 | 0,0 à 0,0 | 0,3 à 0,3 | 47,9 à 53,0 | 0,2 | 0,0 | 16,4 |
| E1b | -0,1 à 0,2 | -0,6 à -0,4 | -0,9 à 8,9 | -1,1 à 0,8 | -0,1 à 1,1 | 0,3 à 0,5 | 48,0 à 55,2 | -10,8 | 0,0 | 9,3 |
| E2g | -0,1 à 2,9 | -0,5 à -0,4 | -0,9 à 13,1 | -1,1 à 2,0 | 0,0 à 0,0 | 0,4 à 0,7 | 46,8 à 57,7 | -8,7 | 0,0 | 8,9 |
| E2d | -0,1 à 2,4 | -0,6 à -0,5 | -0,8 à 12,5 | -1,2 à 1,4 | -0,1 à 0,1 | 0,3 à 0,6 | 51,6 à 54,3 | -10,9 | 0,1 (ljambe) | 9,0 |
| E3 | -0,2 à 1,0 | -0,6 à -0,4 | -0,9 à 9,8 | -0,1 à 1,2 | -0,8 à 0,0 | 0,1 à 0,8 | 46,4 à 59,4 | -11,5 | 0,0 | 6,8 |
| E3b | -0,1 à 1,2 | -0,6 à -0,4 | -0,9 à 6,1 | 0,0 à 1,6 | -0,8 à 0,0 | 0,1 à 0,8 | 43,7 à 61,2 | -13,2 | 0,0 | 8,9 |
| E6t | -0,1 à 0,1 | -0,5 à -0,4 | -0,9 à 4,6 | 0,0 à 1,3 | 0,0 à 0,0 | 0,4 à 0,4 | 50,2 à 54,3 | -3,4 | 0,0 | 12,1 |
| E6v | -0,1 à 3,7 | -0,6 à -0,4 | -0,9 à 14,3 | -0,2 à 3,6 | -0,1 à 0,0 | 0,4 à 0,6 | 51,5 à 57,0 | -11,0 | 0,2 (ljambe) | 8,9 |

Écart cible – résultat des solveurs (cm) : cheville contre la cheville visée, poignet contre le poignet visé, bassin contre le bassin visé (squelette classique, après l’image).

| Id | cheville | poignet | bassin | M2b (cheville au-delà de sa place naturelle, ≤ 0 attendu) | M5 gauche | M5 droite |
|---|---|---|---|---|---|---|
| E1 | 1,0 à 1,0 | 0,0 à 0,0 | 0,0 à 0,0 | -3,4 à -1,8 | 47,9 à 48,0 | 52,9 à 53,0 |
| E1b | 1,0 à 1,0 | 0,0 à 0,9 | 0,0 à 0,0 | -4,9 à 0,2 | 48,0 à 55,2 | 50,4 à 54,0 |
| E2g | 1,0 à 1,0 | 0,3 à 1,5 | 0,0 à 0,0 | -4,9 à -0,8 | 46,8 à 48,8 | 55,3 à 57,7 |
| E2d | 1,0 à 1,0 | 0,3 à 1,2 | 0,0 à 0,0 | -4,8 à -0,8 | 52,2 à 54,3 | 51,6 à 54,3 |
| E3 | 1,0 à 1,0 | 0,1 à 2,9 | 0,0 à 0,0 | -4,9 à -0,8 | 46,4 à 52,0 | 49,4 à 59,4 |
| E3b | 1,0 à 1,0 | 0,1 à 1,7 | 0,0 à 0,0 | -4,9 à -0,8 | 43,7 à 49,9 | 54,0 à 61,2 |
| E6t | 1,0 à 1,0 | 0,0 à 0,5 | 0,0 à 0,0 | -4,9 à -0,9 | 50,5 à 54,3 | 50,2 à 52,5 |
| E6v | 1,0 à 1,0 | 0,4 à 1,2 | 0,0 à 0,0 | -4,9 à -0,8 | 51,5 à 55,1 | 51,6 à 57,0 |

## Posture (degrés, sauf ρ et allonge du bras)

M6 : portée de la jambe ρ = hanche–cheville / jambe (règle : 0,93 assis, 0,95 hors de la selle). M10 : allonge du bras (règle : 0,97 au plus). M11 : angles articulaires (180 = tendu). M12 : ouverture du genou (> 0 : dehors). M13 : buste (> 0 : en avant de la verticale). M14 : assise, bassin au-dessus de sa hauteur assise (cm). M15 : talon bas et pointe ouverte, par rapport au pied au repos (cible de talon de la règle : 8,0° à 13,8°).

| Id | ρ | genou | hanche | cheville | ouv. genou | coude | allonge bras | buste | assise (cm) | talon | pointe |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | 0,911 à 0,918 | 131,1 à 133,3 | 140,7 à 143,3 | 83,3 à 89,6 | 35,9 à 57,7 | 126,3 à 130,2 | 0,893 à 0,908 | 1,9 à 1,9 | 0,0 à 0,0 | 8,0 à 8,0 | 5,7 à 5,7 |
| E1b | 0,881 à 0,946 | 123,4 à 142,1 | 128,2 à 143,6 | 81,8 à 92,0 | 42,4 à 58,1 | 108,4 à 147,9 | 0,813 à 0,961 | 0,8 à 20,6 | -1,1 à 2,3 | 8,0 à 9,9 | 5,7 à 5,7 |
| E2g | 0,855 à 0,946 | 117,5 à 142,1 | 122,4 à 140,9 | 84,2 à 92,1 | 51,3 à 58,3 | 101,3 à 133,2 | 0,776 à 0,919 | 18,0 à 23,8 | -3,0 à -0,5 | 9,9 à 9,9 | 5,7 à 5,7 |
| E2d | 0,855 à 0,946 | 117,5 à 142,1 | 122,0 à 141,5 | 77,6 à 92,1 | 38,5 à 54,9 | 98,5 à 135,2 | 0,761 à 0,925 | 16,6 à 23,0 | -3,0 à -1,1 | 9,9 à 9,9 | 5,7 à 5,7 |
| E3 | 0,883 à 0,947 | 124,0 à 142,4 | 116,4 à 141,2 | 86,1 à 92,3 | 49,9 à 59,2 | 80,2 à 151,7 | 0,649 à 0,970 | 13,0 à 56,5 | -3,0 à 3,2 | 9,8 à 13,1 | 5,7 à 5,7 |
| E3b | 0,903 à 0,946 | 129,1 à 142,1 | 116,7 à 141,0 | 88,0 à 92,6 | 49,0 à 59,3 | 84,7 à 151,7 | 0,678 à 0,970 | 16,8 à 57,8 | 0,0 à 2,7 | 9,8 à 13,3 | 5,7 à 5,7 |
| E6t | 0,912 à 0,946 | 131,5 à 142,1 | 139,4 à 145,9 | 84,8 à 91,1 | 52,9 à 58,0 | 113,8 à 131,6 | 0,840 à 0,913 | 2,5 à 5,8 | -0,3 à 2,2 | 8,0 à 8,0 | 5,7 à 5,7 |
| E6v | 0,856 à 0,946 | 117,6 à 142,1 | 122,2 à 141,9 | 80,5 à 92,1 | 45,4 à 58,2 | 100,9 à 132,5 | 0,774 à 0,916 | 17,7 à 22,5 | -3,0 à 1,1 | 9,9 à 9,9 | 5,7 à 5,7 |

## Continuité (M16) et mains (M18)

Rotation maximale d’un segment (cuisse, tibia, pied, bras, avant-bras) d’une image à l’autre, dans S, et à-coup (différence seconde) ; même mesure sur les quaternions locaux des 19 os de `rider-audit.mjs` (continuité avec la v2 ; cible v3 : moins de 15° par image en régime établi) ; déplacement du bassin dans S.

| Id | segment max (°/image) | à-coup segment | quaternion max (°/image) | à-coup quaternion | bassin max (cm/image) | écart des poignets (cm) | rênes (cm) |
|---|---|---|---|---|---|---|---|
| E1 | 0,2 (rtibia) | 0,1 | 0,3 (rFoot) | 0,3 | 0,0 | 16,9 à 16,9 | 101,5 à 104,6 |
| E1b | 10,3 (ltibia) | 8,4 | 13,6 (lFoot) | 12,0 | 2,7 | 16,9 à 16,9 | 94,8 à 118,1 |
| E2g | 8,0 (ravantBras) | 6,3 | 8,4 (rFore) | 8,3 | 1,9 | 16,9 à 16,9 | 81,1 à 106,4 |
| E2d | 6,2 (lavantBras) | 4,2 | 8,6 (lFore) | 7,5 | 1,8 | 16,9 à 16,9 | 87,8 à 111,8 |
| E3 | 20,1 (lavantBras) | 18,4 | 24,8 (lFore) | 18,7 | 4,3 | 16,4 à 19,9 | 93,9 à 136,1 |
| E3b | 7,4 (rbras) | 7,2 | 11,6 (lFore) | 9,7 | 1,8 | 16,9 à 18,7 | 82,2 à 120,9 |
| E6t | 7,3 (ltibia) | 6,6 | 8,5 (lShin) | 8,1 | 2,4 | 16,9 à 16,9 | 109,6 à 113,8 |
| E6v | 5,6 (lavantBras) | 4,9 | 10,1 (rShin) | 10,1 | 2,2 | 16,9 à 16,9 | 87,1 à 111,7 |

## Phases du saut (M17), en images depuis la mise en selle (1 image = 1/30 s)

| Instant | E3 | E3b |
|---|---|---|
| appel (vol du jeu commencé) | 41 | 41 |
| sommet (vol à 0,5) | 50 | 52 |
| poser des antérieurs (landT = 0) | 59 | 63 |
| postérieurs reposés détectés (hindDown) | 82 | 76 |
| postérieurs reposés pour la règle (détectés ou holdMax) | 73 | 76 |
| position d’obstacle à 50 % (montée) | 43 | 44 |
| position d’obstacle maximale | 50 | 52 |
| retour à 50 % | 68 | 72 |
| retour à 10 % | 85 | 88 |
| cheval : postérieurs décollent (> 5 cm) | 40 | 40 |
| cheval : antérieurs posent (< 6 cm) | 57 | 62 |
| cheval : postérieurs posent (< 10 cm) | 81 | 75 |
| position d’obstacle maximale (jumpK) | 0,978 | 0,990 |
| postérieurs : plus bas après la réception (cm ; seuil HIND_DOWN 10 cm) | 6,5 | 6,5 |

Posture aux instants clés (genou : plus ouvert des deux, en degrés ; ρ : plus grande ; hanche : plus fermée ; assise et M1 y : cm ; M9, M7 : minimum, cm) :

| Id | Instant | genou | ρ | hanche | buste | assise | M1 y | M9 | M7 min |
|---|---|---|---|---|---|---|---|---|---|
| E3 | appel | 139,6 | 0,939 | 136,0 | 13,0 | 1,3 | 0,0 | 7,7 | -11,5 |
| E3 | sommet | 142,1 | 0,946 | 116,4 | 53,2 | 1,6 | -0,1 | 9,2 | -2,9 |
| E3 | poserAnterieurs | 142,1 | 0,946 | 132,2 | 50,7 | 2,4 | 0,1 | 18,1 | 1,0 |
| E3 | poserPosterieursRegle | 142,1 | 0,946 | 132,6 | 30,1 | 3,1 | 0,9 | 10,1 | 0,3 |
| E3 | jumpKMax | 142,1 | 0,946 | 116,4 | 53,2 | 1,6 | -0,1 | 9,2 | -2,9 |
| E3b | appel | 142,1 | 0,946 | 134,9 | 16,8 | 1,2 | 0,0 | 9,7 | -8,7 |
| E3b | sommet | 142,1 | 0,946 | 116,7 | 54,4 | 1,7 | -0,1 | 9,4 | -6,7 |
| E3b | poserAnterieurs | 142,1 | 0,946 | 131,1 | 52,8 | 2,2 | 0,0 | 14,2 | -0,6 |
| E3b | poserPosterieursRegle | 142,1 | 0,946 | 127,7 | 27,9 | 1,9 | -0,1 | 10,0 | -4,2 |
| E3b | jumpKMax | 142,1 | 0,946 | 116,7 | 54,4 | 1,7 | -0,1 | 9,4 | -6,7 |

## Écart entre le rendu réaliste et les règles (information, constat 2)

Ce que Julien voit dans le web est le modèle réaliste `rider_f.glb`, qui recopie les rotations du squelette classique avec ses propres longueurs. Botte : plante calée du modèle réaliste (sous l’os `ball`, 1,2 cm au-dessus de la semelle des bottes, 5 mm en arrière, calée sur la pose de repos ; `setup.real`) contre la plante des règles ; Δy > 0 : botte au-dessus. Poignet : `hand_l/r` contre `lHand/rHand`.

| Id | botte – plante | Δy | Δz | botte – étrier affiché | poignet réaliste – règles | poignet réaliste au-dessus de l’encolure (min) | poignet des règles (min) |
|---|---|---|---|---|---|---|---|
| E1 | 2,5 à 2,9 | 2,2 à 2,3 | -0,6 à -0,3 | 2,7 à 3,1 | 4,9 à 4,9 | 22,0 | 16,4 |
| E1b | 2,5 à 3,0 | 2,1 à 2,3 | -0,6 à 0,9 | 2,7 à 2,9 | 4,1 à 4,9 | 13,6 | 9,3 |
| E2g | 2,6 à 3,0 | 2,1 à 2,5 | 0,1 à 1,2 | 2,6 à 2,9 | 3,9 à 4,6 | 13,0 | 8,9 |
| E2d | 2,7 à 3,0 | 2,2 à 2,5 | 0,0 à 1,2 | 2,6 à 3,1 | 3,9 à 4,6 | 13,0 | 9,0 |
| E3 | 2,5 à 3,3 | 1,8 à 2,3 | 0,3 à 2,4 | 2,4 à 3,3 | 0,3 à 4,4 | 9,3 | 6,8 |
| E3b | 2,5 à 3,3 | 1,8 à 2,2 | 0,3 à 2,4 | 2,4 à 3,2 | 0,7 à 4,4 | 8,9 | 8,9 |
| E6t | 2,5 à 2,8 | 2,1 à 2,2 | -0,8 à -0,4 | 2,7 à 2,9 | 4,7 à 4,8 | 16,8 | 12,1 |
| E6v | 2,6 à 3,0 | 2,1 à 2,4 | 0,1 à 1,2 | 2,7 à 3,0 | 3,9 à 4,6 | 13,1 | 8,9 |

## Longueur d’étriers v3 : chiffres pour la décision de Julien (J3)

- **Réglage du cheval** (`pjlHorse.js:252-260`) : stirrupY retenu **-64,0 cm** sous le point d’assise ; valeur avant bornage (ancre d’étrier au repos − siège − 6 cm) -63,8 cm, bornée entre −85 et −64 cm : **la borne la plus courte (−64 cm) s’applique** ; l’ancre seule donnerait un étrier plus court de 1,6 mm. stirrupZ 10,1 cm (avant bornage 10,1 cm), stirrupX 40,2 cm.
- **À l’arrêt (E1)** : genou 132,2° en moyenne (131,1 à 133,3), ρ 0,914 (0,911 à 0,918 ; plafond assis 0,93), hanche 141,9°, cheville 86,4°, talon 8,0° ; étrivière gauche 47,9 à 48,0 cm, droite 52,9 à 53,0 cm ; plante au-dessus du point d’étrier visé : 0,0 à 0,1 cm (M1 y).
- **Galop (E2g)** : genou 117,5 à 142,1°, ρ 0,855 à 0,946, hanche 122,4 à 140,9°, assise -3,0 à -0,5 cm, dérive de la plante M3 y -1,1 à 2,0 cm et z 0,0 à 0,0 cm, étrivière gauche 46,8 à 48,8 cm, droite 55,3 à 57,7 cm.
- **Galop (E2d)** : genou 117,5 à 142,1°, ρ 0,855 à 0,946, hanche 122,0 à 141,5°, assise -3,0 à -1,1 cm, dérive de la plante M3 y -1,2 à 1,4 cm et z -0,1 à 0,1 cm, étrivière gauche 52,2 à 54,3 cm, droite 51,6 à 54,3 cm.
- **Saut (E3)** : au sommet (image 50) genou 142,1°, ρ 0,946 (plafond hors de la selle 0,95), hanche 116,4°, assise 1,6 cm ; sur la fenêtre : genou 124,0 à 142,4°, ρ 0,883 à 0,947, assise -3,0 à 3,2 cm.
- **Saut (E3b)** : au sommet (image 52) genou 142,1°, ρ 0,946 (plafond hors de la selle 0,95), hanche 116,7°, assise 1,7 cm ; sur la fenêtre : genou 129,1 à 142,1°, ρ 0,903 à 0,946, assise 0,0 à 2,7 cm.
- **Sensibilité (estimation géométrique, pas une mesure)** : pose moyenne de E1, côté gauche, bassin fixe, cheville déplacée verticalement du raccourcissement donné. Au-delà de ρ 0,93 (assis), la règle ne laisse pas la jambe s’allonger : elle abaisse le bassin de quelques centimètres au plus puis remonte le pied ; un allongement n’est donc pas lisible ici, il sera rejoué par O2 (étape 3, option `--fit stirrupY=…`).

| Étrier raccourci de | 0 cm | 1 cm | 2 cm | 3 cm | 5 cm | 8 cm |
|---|---|---|---|---|---|---|
| genou (°) | 131,4 | 128,3 | 125,3 | 122,6 | 117,4 | 110,3 |
| ρ | 0,911 | 0,900 | 0,888 | 0,877 | 0,854 | 0,821 |

## Limites de ces mesures

- Jeu web servi par Vite dans Chrome sans tête (SwiftShader), pas fixe de 1/30 s, graine fixe : ce sont les règles du jeu, pas une mesure biomécanique (`riderPosture.test.js:1-3`).
- Chaque scénario part d’une mise en selle immédiate (`Human.mount`, sans la séquence animée) ; les scénarios de galop partent de l’arrêt avec 60 images de mise en train, ce qui diffère de l’audit v2 où ils s’enchaînaient.
- E4 et E5 (montée, descente) ne sont pas exportés à cette étape ; E6 (trot, virage à droite) l’est, hors acceptation.
- M8 est mesuré dans la page (rayons contre le maillage skinné du cheval), seulement dans la fenêtre de mesure.
