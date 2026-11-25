# Niveau B : la cavalière Unreal posée par la règle sur le cheval Unreal (essai de monte, voie A, étape M3)

Page générée par `node scripts/unreal/rider-rules-niveau-b.mjs` (ne pas modifier à la main), à partir de l’export du test
moteur `Strides.Parite.RiderOnHorse`. Les scénarios d’O1 sont rejoués sur le **cheval Unreal** (clips et temps du
mélangeur du web, clips miroir cuits dans Unreal, cheval à la taille du web (échelle du maillage 0,0103882601, étape S3)) ; siège, profils,
postérieurs et phase de foulée sont calculés par Unreal ; la cavalière est posée par la chaîne du jeu (option
`-StridesRider=regles`) et ses articulations sont relues sur le maillage. Grandeurs : `rider-rules-metrics.mjs`, le même
code que pour O1 et O2. Tolérances : `plan-essai.md` §5, niveau B.

Deux références image par image : **O1** (règle du web, cheval du web, cavalier classique : la référence du plan) et
**O2 rider_f** (règle du web, cheval du web, proportions de la cavalière Unreal) : l’écart à O2 isole l’effet du cheval
Unreal. Assis : levée de la règle sous 2 cm et hors du vol ; obstacle : vol ou accompagnement (jumpK ≥ 0,1) ; pas :
poids de l’allure du pas de la règle au moins 0,5. Depuis l’étape S1 (sellerie complète), l’export donne les étriers
affichés par Unreal (`UStridesHorseTackMesh`) : M4 est jugé sur son seuil, M5 (étrivière) et M18 (rênes) sont relevés
plus bas (colonne O2 de M4 sans objet : O2 n’a pas d’étrier propre) ; M8 (pénétration) est mesuré dans le test moteur par
la méthode des 6 rayons du web contre le maillage du cheval Unreal skinné. Non mesuré : M19 (montée et descente : E4 et
E5 hors de l’essai, aucun oracle).

## Seuils absolus de la règle (valeur Unreal ; O1 et O2 sur les mêmes images, pour mémoire)

| Scénario | Grandeur | Unreal | Image | Seuil | Tenu | O1 | O2 |
|---|---|---|---|---|---|---|---|
| E1 | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,12 cm | 49 | ≤ 2,00 cm | oui | 0,04 | 0,12 |
| E1 | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,78 cm | 16 | ≤ 2,00 cm | oui | 0,43 | 0,77 |
| E1 | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,70 cm | 14 | ≤ 1,00 cm | oui | −3,26 | −1,25 |
| E1 | M6 portée de la jambe ρ assis (gauche) | 0,9252 | 14 | ≤ 0,9350 | oui | 0,9121 | 0,9252 |
| E1 | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 0 images ; sous −2 cm : 0) | 0,43 cm | 1 | ≥ −1,00 cm | oui | 0,20 | 0,63 |
| E1 | M9 poignet au-dessus de l’encolure (gauche) | 18,41 cm | 18 | ≥ 9,00 cm | oui | 16,37 | 18,44 |
| E1 | M10 coude (gauche) | 151,84° | 61 | ≤ 155,00° | oui | 130,25 | 151,84 |
| E1 | M4 plante – étrier affiché (gauche) | 0,64 cm | 37 | ≤ 2,00 cm | oui | 0,34 | 2,11 |
| E1 | M1 plante – point d’étrier visé, |y| assis (droit) | 0,20 cm | 14 | ≤ 2,00 cm | oui | 0,13 | 0,20 |
| E1 | M1 plante – point d’étrier visé, |z| assis (droit) | 0,86 cm | 64 | ≤ 2,00 cm | oui | 0,69 | 0,86 |
| E1 | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,99 cm | 0 | ≤ 1,00 cm | oui | −1,79 | −0,83 |
| E1 | M6 portée de la jambe ρ assis (droit) | 0,9225 | 0 | ≤ 0,9350 | oui | 0,9183 | 0,9253 |
| E1 | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 0 images ; sous −2 cm : 0) | 0,62 cm | 0 | ≥ −1,00 cm | oui | 0,51 | 0,61 |
| E1 | M9 poignet au-dessus de l’encolure (droit) | 17,77 cm | 62 | ≥ 9,00 cm | oui | 16,38 | 17,88 |
| E1 | M10 coude (droit) | 151,84° | 35 | ≤ 155,00° | oui | 128,15 | 151,84 |
| E1 | M4 plante – étrier affiché (droit) | 0,64 cm | 37 | ≤ 2,00 cm | oui | 0,34 | 1,07 |
| E1 | M8 pénétration de l’axe des os (seuil max(1 cm ; O1 + 0,5 cm)) | 0,00 cm | 20 | ≤ 1,00 cm | oui | 0,00 | — |
| E1b | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,12 cm | 0 | ≤ 2,00 cm | oui | 0,10 | 0,12 |
| E1b | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 0 | ≤ 2,00 cm | oui | 0,46 | 0,77 |
| E1b | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 0,38 cm | 71 | ≤ 3,00 cm | oui | 0,21 | 0,21 |
| E1b | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,52 cm | 70 | ≤ 5,00 cm | oui | 0,53 | 0,52 |
| E1b | M2 cheville au-delà de sa place naturelle xMax (gauche) | 0,02 cm | 79 | ≤ 1,00 cm | oui | −0,75 | 0,02 |
| E1b | M6 portée de la jambe ρ assis (gauche) | 0,9493 | 77 | ≤ 0,9350 | **non** | 0,9438 | 0,9524 |
| E1b | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9459 | 26 | ≤ 0,9550 | oui | 0,9459 | 0,9460 |
| E1b | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 17 images ; sous −2 cm : 25) | −6,73 cm | 3 | ≥ −1,00 cm | **non** | −6,29 | −6,03 |
| E1b | M9 poignet au-dessus de l’encolure (gauche) | 9,39 cm | 59 | ≥ 9,00 cm | oui | 9,08 | 9,46 |
| E1b | M10 coude (gauche) | 151,84° | 45 | ≤ 155,00° | oui | 148,89 | 151,84 |
| E1b | M4 plante – étrier affiché (gauche) | 0,72 cm | 67 | ≤ 2,00 cm | oui | 0,55 | 3,84 |
| E1b | M1 plante – point d’étrier visé, |y| assis (droit) | 0,18 cm | 2 | ≤ 2,00 cm | oui | 0,12 | 0,19 |
| E1b | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E1b | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 2,09 cm | 52 | ≤ 3,00 cm | oui | 1,12 | 2,13 |
| E1b | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,50 cm | 52 | ≤ 5,00 cm | oui | 0,48 | 0,50 |
| E1b | M2 cheville au-delà de sa place naturelle xMax (droit) | 0,86 cm | 89 | ≤ 1,00 cm | oui | 0,16 | 1,00 |
| E1b | M6 portée de la jambe ρ assis (droit) | 0,9410 | 77 | ≤ 0,9350 | **non** | 0,9403 | 0,9459 |
| E1b | M6 portée de la jambe ρ hors de la selle (droit) | 0,9459 | 22 | ≤ 0,9550 | oui | 0,9459 | 0,9459 |
| E1b | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 38 images ; sous −2 cm : 43) | −7,91 cm | 55 | ≥ −1,00 cm | **non** | −15,17 | −8,21 |
| E1b | M9 poignet au-dessus de l’encolure (droit) | 9,37 cm | 59 | ≥ 9,00 cm | oui | 9,08 | 9,46 |
| E1b | M10 coude (droit) | 151,84° | 97 | ≤ 155,00° | oui | 150,06 | 151,84 |
| E1b | M4 plante – étrier affiché (droit) | 0,73 cm | 67 | ≤ 2,00 cm | oui | 0,54 | 3,79 |
| E1b | M8 pénétration de l’axe des os (seuil max(1 cm ; O1 + 0,5 cm)) | 0,00 cm | 60 | ≤ 1,00 cm | oui | 0,00 | — |
| E2g | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,34 cm | 3 | ≤ 2,00 cm | oui | 0,11 | 0,28 |
| E2g | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 1 | ≤ 2,00 cm | oui | 0,60 | 0,77 |
| E2g | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 0,14 cm | 93 | ≤ 3,00 cm | oui | 0,15 | 0,14 |
| E2g | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,66 cm | 43 | ≤ 5,00 cm | oui | 0,62 | 0,66 |
| E2g | M2 cheville au-delà de sa place naturelle xMax (gauche) | 1,38 cm | 8 | ≤ 1,00 cm | **non** | 0,99 | 1,18 |
| E2g | M6 portée de la jambe ρ assis (gauche) | 0,9252 | 0 | ≤ 0,9350 | oui | 0,9219 | 0,9252 |
| E2g | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9235 | 22 | ≤ 0,9550 | oui | 0,9129 | 0,9228 |
| E2g | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 6 images ; sous −2 cm : 11) | −8,77 cm | 2 | ≥ −1,00 cm | **non** | −7,47 | −8,46 |
| E2g | M9 poignet au-dessus de l’encolure (gauche) | 8,95 cm | 72 | ≥ 9,00 cm | **non** | 8,94 | 9,06 |
| E2g | M10 coude (gauche) | 151,84° | 45 | ≤ 155,00° | oui | 137,14 | 151,84 |
| E2g | M4 plante – étrier affiché (gauche) | 0,81 cm | 53 | ≤ 2,00 cm | oui | 0,64 | 3,10 |
| E2g | M1 plante – point d’étrier visé, |y| assis (droit) | 8,96 cm | 16 | ≤ 2,00 cm | **non** | 8,44 | 9,16 |
| E2g | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E2g | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 5,81 cm | 41 | ≤ 3,00 cm | **non** | 5,16 | 6,02 |
| E2g | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,53 cm | 22 | ≤ 5,00 cm | oui | 0,51 | 0,53 |
| E2g | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,86 cm | 39 | ≤ 1,00 cm | oui | −0,81 | −0,75 |
| E2g | M6 portée de la jambe ρ assis (droit) | 0,9459 | 40 | ≤ 0,9350 | **non** | 0,9454 | 0,9459 |
| E2g | M6 portée de la jambe ρ hors de la selle (droit) | 0,9459 | 137 | ≤ 0,9550 | oui | 0,9459 | 0,9459 |
| E2g | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 84 images ; sous −2 cm : 121) | −22,70 cm | 15 | ≥ −1,00 cm | **non** | −24,79 | −23,07 |
| E2g | M9 poignet au-dessus de l’encolure (droit) | 8,94 cm | 72 | ≥ 9,00 cm | **non** | 8,93 | 9,03 |
| E2g | M10 coude (droit) | 151,84° | 7 | ≤ 155,00° | oui | 140,92 | 151,84 |
| E2g | M4 plante – étrier affiché (droit) | 0,82 cm | 53 | ≤ 2,00 cm | oui | 0,67 | 3,18 |
| E2g | M8 pénétration de l’axe des os (seuil max(1 cm ; O1 + 0,5 cm)) | 0,00 cm | 60 | ≤ 1,00 cm | oui | 0,00 | — |
| E2d | M1 plante – point d’étrier visé, |y| assis (gauche) | 3,52 cm | 38 | ≤ 2,00 cm | **non** | 2,19 | 3,44 |
| E2d | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 0 | ≤ 2,00 cm | oui | 0,48 | 0,77 |
| E2d | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 7,13 cm | 39 | ≤ 3,00 cm | **non** | 6,48 | 6,98 |
| E2d | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,53 cm | 39 | ≤ 5,00 cm | oui | 0,52 | 0,53 |
| E2d | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,47 cm | 4 | ≤ 1,00 cm | oui | −0,81 | −0,55 |
| E2d | M6 portée de la jambe ρ assis (gauche) | 0,9432 | 36 | ≤ 0,9350 | **non** | 0,9430 | 0,9432 |
| E2d | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9459 | 23 | ≤ 0,9550 | oui | 0,9459 | 0,9459 |
| E2d | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 138 images ; sous −2 cm : 137) | −11,62 cm | 29 | ≥ −1,00 cm | **non** | −13,54 | −11,09 |
| E2d | M9 poignet au-dessus de l’encolure (gauche) | 9,23 cm | 130 | ≥ 9,00 cm | oui | 9,01 | 9,16 |
| E2d | M10 coude (gauche) | 151,84° | 13 | ≤ 155,00° | oui | 139,63 | 151,84 |
| E2d | M4 plante – étrier affiché (gauche) | 0,80 cm | 20 | ≤ 2,00 cm | oui | 0,63 | 2,15 |
| E2d | M1 plante – point d’étrier visé, |y| assis (droit) | 0,18 cm | 2 | ≤ 2,00 cm | oui | 0,13 | 0,19 |
| E2d | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E2d | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 0,22 cm | 93 | ≤ 3,00 cm | oui | 0,22 | 0,22 |
| E2d | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,73 cm | 59 | ≤ 5,00 cm | oui | 0,64 | 0,72 |
| E2d | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,74 cm | 5 | ≤ 1,00 cm | oui | −1,00 | −0,72 |
| E2d | M6 portée de la jambe ρ assis (droit) | 0,9225 | 0 | ≤ 0,9350 | oui | 0,9181 | 0,9225 |
| E2d | M6 portée de la jambe ρ hors de la selle (droit) | 0,9103 | 22 | ≤ 0,9550 | oui | 0,9089 | 0,9104 |
| E2d | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 1 images ; sous −2 cm : 0) | −1,79 cm | 2 | ≥ −1,00 cm | oui | −1,51 | −2,24 |
| E2d | M9 poignet au-dessus de l’encolure (droit) | 9,22 cm | 93 | ≥ 9,00 cm | oui | 9,02 | 9,17 |
| E2d | M10 coude (droit) | 151,84° | 0 | ≤ 155,00° | oui | 134,30 | 151,84 |
| E2d | M4 plante – étrier affiché (droit) | 0,78 cm | 20 | ≤ 2,00 cm | oui | 0,61 | 1,04 |
| E2d | M8 pénétration de l’axe des os (seuil max(1 cm ; O1 + 0,5 cm)) | 0,00 cm | 60 | ≤ 1,00 cm | oui | 0,07 | — |
| E3 | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,29 cm | 2 | ≤ 2,00 cm | oui | 0,23 | 0,27 |
| E3 | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 0 | ≤ 2,00 cm | oui | 0,43 | 0,77 |
| E3 | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 1,61 cm | 42 | ≤ 3,00 cm | oui | 1,00 | 1,40 |
| E3 | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,51 cm | 74 | ≤ 5,00 cm | oui | 0,50 | 0,55 |
| E3 | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,90 cm | 74 | ≤ 1,00 cm | oui | −0,84 | −0,88 |
| E3 | M6 portée de la jambe ρ assis (gauche) | 0,9321 | 2 | ≤ 0,9350 | oui | 0,9224 | 0,9307 |
| E3 | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9459 | 26 | ≤ 0,9550 | oui | 0,9463 | 0,9459 |
| E3 | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 17 images ; sous −2 cm : 38) | −9,99 cm | 41 | ≥ −1,00 cm | **non** | −11,50 | −10,18 |
| E3 | M9 poignet au-dessus de l’encolure (gauche) | 7,15 cm | 42 | ≥ 9,00 cm | **non** | 6,75 | 7,09 |
| E3 | M10 coude (gauche) | 151,84° | 58 | ≤ 155,00° | oui | 151,70 | 151,84 |
| E3 | M4 plante – étrier affiché (gauche) | 0,99 cm | 61 | ≤ 2,00 cm | oui | 0,80 | 2,12 |
| E3 | M1 plante – point d’étrier visé, |y| assis (droit) | 0,20 cm | 2 | ≤ 2,00 cm | oui | 0,31 | 0,20 |
| E3 | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E3 | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 0,04 cm | 42 | ≤ 3,00 cm | oui | 1,00 | 0,04 |
| E3 | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,64 cm | 60 | ≤ 5,00 cm | oui | 0,56 | 0,64 |
| E3 | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,82 cm | 60 | ≤ 1,00 cm | oui | −0,81 | −0,82 |
| E3 | M6 portée de la jambe ρ assis (droit) | 0,9321 | 2 | ≤ 0,9350 | oui | 0,9289 | 0,9320 |
| E3 | M6 portée de la jambe ρ hors de la selle (droit) | 0,9459 | 13 | ≤ 0,9550 | oui | 0,9466 | 0,9460 |
| E3 | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 3 images ; sous −2 cm : 4) | −2,82 cm | 64 | ≥ −1,00 cm | **non** | −7,96 | −3,02 |
| E3 | M9 poignet au-dessus de l’encolure (droit) | 7,15 cm | 42 | ≥ 9,00 cm | **non** | 6,75 | 7,09 |
| E3 | M10 coude (droit) | 151,84° | 0 | ≤ 155,00° | oui | 151,70 | 151,84 |
| E3 | M4 plante – étrier affiché (droit) | 0,99 cm | 61 | ≤ 2,00 cm | oui | 0,80 | 3,89 |
| E3 | M8 pénétration de l’axe des os (seuil max(1 cm ; O1 + 0,5 cm)) | 0,00 cm | 20 | ≤ 1,00 cm | oui | 0,00 | — |
| E3b | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,31 cm | 2 | ≤ 2,00 cm | oui | 0,26 | 0,27 |
| E3b | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 0 | ≤ 2,00 cm | oui | 0,43 | 0,77 |
| E3b | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 0,02 cm | 74 | ≤ 3,00 cm | oui | 1,24 | 0,26 |
| E3b | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,50 cm | 64 | ≤ 5,00 cm | oui | 0,47 | 0,51 |
| E3b | M2 cheville au-delà de sa place naturelle xMax (gauche) | 0,72 cm | 20 | ≤ 1,00 cm | oui | −0,86 | 0,74 |
| E3b | M6 portée de la jambe ρ assis (gauche) | 0,9336 | 2 | ≤ 0,9350 | oui | 0,9242 | 0,9307 |
| E3b | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9556 | 20 | ≤ 0,9550 | **non** | 0,9459 | 0,9556 |
| E3b | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 22 images ; sous −2 cm : 55) | −10,10 cm | 41 | ≥ −1,00 cm | **non** | −13,20 | −10,36 |
| E3b | M9 poignet au-dessus de l’encolure (gauche) | 9,22 cm | 88 | ≥ 9,00 cm | oui | 8,57 | 9,22 |
| E3b | M10 coude (gauche) | 151,84° | 64 | ≤ 155,00° | oui | 151,70 | 151,84 |
| E3b | M4 plante – étrier affiché (gauche) | 1,01 cm | 64 | ≤ 2,00 cm | oui | 0,82 | 2,30 |
| E3b | M1 plante – point d’étrier visé, |y| assis (droit) | 0,20 cm | 2 | ≤ 2,00 cm | oui | 0,31 | 0,20 |
| E3b | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E3b | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | −0,01 cm | 78 | ≤ 3,00 cm | oui | 0,35 | −0,01 |
| E3b | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,64 cm | 90 | ≤ 5,00 cm | oui | 0,57 | 0,60 |
| E3b | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,82 cm | 90 | ≤ 1,00 cm | oui | −0,80 | −0,85 |
| E3b | M6 portée de la jambe ρ assis (droit) | 0,9322 | 2 | ≤ 0,9350 | oui | 0,9289 | 0,9320 |
| E3b | M6 portée de la jambe ρ hors de la selle (droit) | 0,9459 | 23 | ≤ 0,9550 | oui | 0,9459 | 0,9467 |
| E3b | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 4 images ; sous −2 cm : 3) | −3,16 cm | 4 | ≥ −1,00 cm | **non** | −5,10 | −3,74 |
| E3b | M9 poignet au-dessus de l’encolure (droit) | 9,22 cm | 88 | ≥ 9,00 cm | oui | 8,57 | 9,22 |
| E3b | M10 coude (droit) | 151,84° | 0 | ≤ 155,00° | oui | 151,70 | 151,84 |
| E3b | M4 plante – étrier affiché (droit) | 1,01 cm | 64 | ≤ 2,00 cm | oui | 0,82 | 3,89 |
| E3b | M8 pénétration de l’axe des os (seuil max(1 cm ; O1 + 0,5 cm)) | 0,00 cm | 20 | ≤ 1,00 cm | oui | 0,00 | — |

## Écarts aux références (grandeurs qui ne dépendent pas de l’échelle du cheval)

Colonnes de décomposition (information) : **O2 − O1**, ce que changent les seules proportions de la cavalière (cheval du
web dans les deux) ; **contrôle − O2**, ce que le rejeu ajoute quand le cheval Unreal est posé comme celui du web (phase
tenue au saut, clips à 30 images/s rééchantillonnés à l’import) ; le reste de **Unreal − O2** vient du cheval du jeu
(taille, pas d’inclinaison en virage ni de pente, corps non remonté au saut).

| Scénario | Grandeur | Images | Tolérance | Unreal − O1 (max) | Image | Tenu | Unreal − O2 (max) | Image | Tenu | O2 − O1 | contrôle − O2 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | M11 hanche gauche | 65 | 6,00° | 3,76° | 64 | oui | 0,19° | 54 | oui | 3,88° | 0,00° |
| E1 | M11 cheville gauche | 65 | 6,00° | 4,03° | 13 | oui | 0,28° | 38 | oui | 3,78° | 0,00° |
| E1 | M12 ouverture du genou gauche | 65 | 8,00° | 25,01° | 16 | **non** | 1,34° | 49 | oui | 23,83° | 0,01° |
| E1 | M15 talon gauche | 65 | 4,00° | 0,00° | 5 | oui | 0,00° | 5 | oui | 0,00° | 0,00° |
| E1 | M15 pointe gauche | 65 | 4,00° | 0,00° | 4 | oui | 0,00° | 4 | oui | 0,00° | 0,00° |
| E1 | M11 hanche droite | 65 | 6,00° | 2,07° | 0 | oui | 0,39° | 52 | oui | 2,32° | 0,00° |
| E1 | M11 cheville droite | 65 | 6,00° | 0,61° | 14 | oui | 0,89° | 42 | oui | 0,58° | 0,00° |
| E1 | M12 ouverture du genou droit | 65 | 8,00° | 12,40° | 15 | **non** | 1,15° | 41 | oui | 11,28° | 0,00° |
| E1 | M15 talon droit | 65 | 4,00° | 0,00° | 5 | oui | 0,00° | 5 | oui | 0,00° | 0,00° |
| E1 | M15 pointe droite | 65 | 4,00° | 0,00° | 5 | oui | 0,00° | 5 | oui | 0,00° | 0,00° |
| E1 | M13 buste, assis | 65 | 3,00° | 2,07° | 0 | oui | 0,04° | 37 | oui | 2,10° | 0,00° |
| E1 | M14 levée maximale de l’assise ≤ référence + 1 cm | 65 | 1,00 cm | −1,24 cm | — | oui | −0,13 cm | — | oui | — | — |
| E1 | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 64 | 0,00° | −14,85° | 1 | oui | −14,85° | 1 | oui | — | — |
| E1b | M11 hanche gauche | 130 | 6,00° | 3,70° | 0 | oui | 1,65° | 15 | oui | 3,70° | 0,49° |
| E1b | M11 cheville gauche | 130 | 6,00° | 5,67° | 70 | oui | 0,79° | 48 | oui | 5,25° | 0,09° |
| E1b | M12 ouverture du genou gauche | 130 | 8,00° | 24,00° | 1 | **non** | 0,82° | 70 | oui | 23,91° | 0,27° |
| E1b | M15 talon gauche | 130 | 4,00° | 0,12° | 3 | oui | 0,00° | 5 | oui | 0,12° | 0,00° |
| E1b | M15 pointe gauche | 130 | 4,00° | 0,07° | 4 | oui | 0,01° | 6 | oui | 0,08° | 0,00° |
| E1b | M11 hanche droite | 130 | 6,00° | 2,07° | 0 | oui | 1,68° | 15 | oui | 2,57° | 0,64° |
| E1b | M11 cheville droite | 130 | 6,00° | 2,66° | 88 | oui | 1,73° | 15 | oui | 2,73° | 0,34° |
| E1b | M12 ouverture du genou droit | 130 | 8,00° | 11,59° | 1 | **non** | 3,82° | 15 | oui | 11,58° | 0,06° |
| E1b | M15 talon droit | 130 | 4,00° | 0,03° | 4 | oui | 0,00° | 4 | oui | 0,03° | 0,00° |
| E1b | M15 pointe droite | 130 | 4,00° | 0,02° | 3 | oui | 0,01° | 4 | oui | 0,03° | 0,00° |
| E1b | M13 buste, assis | 130 | 3,00° | 4,31° | 26 | **non** | 2,20° | 13 | oui | 3,37° | 0,02° |
| E1b | M14 assise au pas | 24 | 0,40 cm | 2,00 cm | 15 | **non** | 0,53 cm | 15 | **non** | 1,55 cm | 0,06 cm |
| E1b | M14 levée maximale de l’assise ≤ référence + 1 cm | 130 | 1,00 cm | −1,23 cm | — | oui | −0,27 cm | — | oui | — | — |
| E1b | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 129 | 0,00° | −8,44° | 52 | oui | −8,44° | 52 | oui | — | — |
| E2g | M11 hanche gauche | 140 | 6,00° | 3,78° | 1 | oui | 1,77° | 107 | oui | 3,70° | 0,03° |
| E2g | M11 cheville gauche | 140 | 6,00° | 7,03° | 44 | **non** | 3,89° | 44 | oui | 5,76° | 0,04° |
| E2g | M12 ouverture du genou gauche | 140 | 8,00° | 23,93° | 1 | **non** | 16,78° | 44 | **non** | 23,90° | 0,10° |
| E2g | M15 talon gauche | 140 | 4,00° | 0,14° | 4 | oui | 0,01° | 3 | oui | 0,14° | 0,00° |
| E2g | M15 pointe gauche | 140 | 4,00° | 0,12° | 3 | oui | 0,01° | 5 | oui | 0,13° | 0,00° |
| E2g | M11 hanche droite | 140 | 6,00° | 3,40° | 19 | oui | 2,14° | 138 | oui | 2,51° | 0,17° |
| E2g | M11 cheville droite | 140 | 6,00° | 2,77° | 39 | oui | 1,31° | 114 | oui | 2,71° | 0,02° |
| E2g | M12 ouverture du genou droit | 140 | 8,00° | 11,32° | 4 | **non** | 1,10° | 114 | oui | 11,25° | 0,12° |
| E2g | M15 talon droit | 140 | 4,00° | 0,06° | 7 | oui | 0,02° | 7 | oui | 0,08° | 0,00° |
| E2g | M15 pointe droite | 140 | 4,00° | 0,06° | 6 | oui | 0,01° | 12 | oui | 0,06° | 0,00° |
| E2g | M13 buste, assis | 140 | 3,00° | 5,54° | 53 | **non** | 3,20° | 18 | **non** | 3,37° | 0,03° |
| E2g | M14 assise au pas | 16 | 0,40 cm | 1,00 cm | 6 | **non** | 0,03 cm | 6 | oui | 1,03 cm | 0,00 cm |
| E2g | M14 levée maximale de l’assise ≤ référence + 1 cm | 140 | 1,00 cm | −1,09 cm | — | oui | −0,00 cm | — | oui | — | — |
| E2g | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 139 | 0,00° | −4,22° | 89 | oui | −4,22° | 89 | oui | — | — |
| E2d | M11 hanche gauche | 140 | 6,00° | 3,70° | 0 | oui | 2,06° | 101 | oui | 3,70° | 0,16° |
| E2d | M11 cheville gauche | 140 | 6,00° | 3,88° | 1 | oui | 0,66° | 57 | oui | 3,87° | 0,01° |
| E2d | M12 ouverture du genou gauche | 140 | 8,00° | 24,00° | 1 | **non** | 0,46° | 36 | oui | 23,91° | 0,11° |
| E2d | M15 talon gauche | 140 | 4,00° | 0,12° | 3 | oui | 0,00° | 5 | oui | 0,12° | 0,00° |
| E2d | M15 pointe gauche | 140 | 4,00° | 0,07° | 4 | oui | 0,01° | 6 | oui | 0,08° | 0,00° |
| E2d | M11 hanche droite | 140 | 6,00° | 6,11° | 20 | **non** | 2,17° | 105 | oui | 6,71° | 0,04° |
| E2d | M11 cheville droite | 140 | 6,00° | 4,64° | 18 | oui | 1,62° | 57 | oui | 3,85° | 0,04° |
| E2d | M12 ouverture du genou droit | 140 | 8,00° | 21,48° | 18 | **non** | 3,43° | 23 | oui | 18,49° | 0,07° |
| E2d | M15 talon droit | 140 | 4,00° | 0,03° | 4 | oui | 0,00° | 4 | oui | 0,03° | 0,00° |
| E2d | M15 pointe droite | 140 | 4,00° | 0,02° | 3 | oui | 0,01° | 4 | oui | 0,03° | 0,00° |
| E2d | M13 buste, assis | 140 | 3,00° | 5,86° | 99 | **non** | 2,75° | 15 | oui | 3,44° | 0,01° |
| E2d | M14 assise au pas | 16 | 0,40 cm | 1,55 cm | 6 | **non** | 0,06 cm | 9 | oui | 1,51 cm | 0,00 cm |
| E2d | M14 levée maximale de l’assise ≤ référence + 1 cm | 140 | 1,00 cm | −1,07 cm | — | oui | 0,01 cm | — | oui | — | — |
| E2d | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 139 | 0,00° | −6,44° | 23 | oui | −6,44° | 23 | oui | — | — |
| E3 | M11 hanche gauche | 105 | 6,00° | 5,59° | 50 | oui | 1,41° | 65 | oui | 5,57° | 2,87° |
| E3 | M11 cheville gauche | 105 | 6,00° | 3,78° | 0 | oui | 1,81° | 64 | oui | 3,78° | 1,09° |
| E3 | M12 ouverture du genou gauche | 105 | 8,00° | 23,83° | 0 | **non** | 6,13° | 62 | oui | 23,83° | 7,13° |
| E3 | M15 talon gauche | 105 | 4,00° | 0,18° | 4 | oui | 0,02° | 2 | oui | 0,18° | 0,00° |
| E3 | M15 pointe gauche | 105 | 4,00° | 0,22° | 4 | oui | 0,01° | 2 | oui | 0,21° | 0,00° |
| E3 | M11 hanche droite | 105 | 6,00° | 6,09° | 49 | **non** | 2,26° | 36 | oui | 5,97° | 3,65° |
| E3 | M11 cheville droite | 105 | 6,00° | 3,35° | 102 | oui | 1,17° | 61 | oui | 3,43° | 2,19° |
| E3 | M12 ouverture du genou droit | 105 | 8,00° | 13,79° | 3 | **non** | 4,50° | 61 | oui | 13,24° | 0,39° |
| E3 | M15 talon droit | 105 | 4,00° | 0,07° | 4 | oui | 0,05° | 7 | oui | 0,07° | 0,00° |
| E3 | M15 pointe droite | 105 | 4,00° | 0,06° | 3 | oui | 0,05° | 4 | oui | 0,05° | 0,00° |
| E3 | M13 buste, assis | 61 | 3,00° | 3,52° | 85 | **non** | 0,02° | 40 | oui | 3,52° | 0,00° |
| E3 | M13 buste, à l’obstacle | 44 | 5,00° | 7,14° | 50 | **non** | 0,06° | 42 | oui | 7,15° | 2,91° |
| E3 | M14 levée maximale de l’assise ≤ référence + 1 cm | 105 | 1,00 cm | −2,12 cm | — | oui | 0,00 cm | — | oui | — | — |
| E3 | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 104 | 0,00° | 0,12° | 41 | **non** | −4,57° | 47 | oui | — | — |
| E3b | M11 hanche gauche | 109 | 6,00° | 5,70° | 51 | oui | 0,44° | 93 | oui | 5,71° | 1,15° |
| E3b | M11 cheville gauche | 109 | 6,00° | 3,78° | 0 | oui | 0,43° | 56 | oui | 3,78° | 0,57° |
| E3b | M12 ouverture du genou gauche | 109 | 8,00° | 23,83° | 0 | **non** | 0,95° | 63 | oui | 23,83° | 0,34° |
| E3b | M15 talon gauche | 109 | 4,00° | 0,20° | 4 | oui | 0,06° | 2 | oui | 0,18° | 0,00° |
| E3b | M15 pointe gauche | 109 | 4,00° | 0,23° | 3 | oui | 0,05° | 2 | oui | 0,20° | 0,00° |
| E3b | M11 hanche droite | 109 | 6,00° | 6,30° | 51 | **non** | 1,08° | 77 | oui | 6,32° | 1,26° |
| E3b | M11 cheville droite | 109 | 6,00° | 3,54° | 19 | oui | 1,39° | 77 | oui | 3,60° | 0,68° |
| E3b | M12 ouverture du genou droit | 109 | 8,00° | 14,00° | 3 | **non** | 4,47° | 72 | oui | 13,20° | 2,50° |
| E3b | M15 talon droit | 109 | 4,00° | 0,10° | 3 | oui | 0,01° | 3 | oui | 0,09° | 0,00° |
| E3b | M15 pointe droite | 109 | 4,00° | 0,09° | 3 | oui | 0,02° | 3 | oui | 0,07° | 0,00° |
| E3b | M13 buste, assis | 62 | 3,00° | 3,57° | 88 | **non** | 0,04° | 40 | oui | 3,57° | 0,00° |
| E3b | M13 buste, à l’obstacle | 47 | 5,00° | 7,33° | 51 | **non** | 0,17° | 62 | oui | 7,26° | 1,50° |
| E3b | M14 levée maximale de l’assise ≤ référence + 1 cm | 109 | 1,00 cm | −1,61 cm | — | oui | 0,00 cm | — | oui | — | — |
| E3b | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 108 | 0,00° | −5,70° | 42 | oui | −5,70° | 42 | oui | — | — |

## M17 : phases du saut (images depuis le début du scénario), tolérance ± 2 images

| Scénario | Phase | Unreal | O1 | O2 | Écart à O1 | Écart à O2 |
|---|---|---|---|---|---|---|
| E3 | appel | 41 | 41 | 41 | 0 | 0 |
| E3 | sommet | 50 | 50 | 50 | 0 | 0 |
| E3 | poserAnterieurs | 59 | 59 | 59 | 0 | 0 |
| E3 | poserPosterieursDetecte | 82 | 82 | 82 | 0 | 0 |
| E3 | poserPosterieursRegle | 73 | 73 | 73 | 0 | 0 |
| E3 | jumpK50Montee | 43 | 43 | 43 | 0 | 0 |
| E3 | jumpKMax | 50 | 50 | 50 | 0 | 0 |
| E3 | jumpK50Descente | 68 | 68 | 68 | 0 | 0 |
| E3 | jumpK10Descente | 85 | 85 | 85 | 0 | 0 |
| E3b | appel | 41 | 41 | 41 | 0 | 0 |
| E3b | sommet | 52 | 52 | 52 | 0 | 0 |
| E3b | poserAnterieurs | 63 | 63 | 63 | 0 | 0 |
| E3b | poserPosterieursDetecte | 76 | 76 | 76 | 0 | 0 |
| E3b | poserPosterieursRegle | 76 | 76 | 76 | 0 | 0 |
| E3b | jumpK50Montee | 44 | 44 | 44 | 0 | 0 |
| E3b | jumpKMax | 52 | 52 | 52 | 0 | 0 |
| E3b | jumpK50Descente | 72 | 72 | 72 | 0 | 0 |
| E3b | jumpK10Descente | 88 | 88 | 88 | 0 | 0 |

## Sellerie affichée (étape S1) : étrier, étrivière, rênes (information, min – max sur toutes les images)

M4 : plante – étrier affiché ; M4a : avant-pied – étrier, moins 0,015 · scale (0 par construction, dans le web comme dans
Unreal) ; M5 : étrivière, porte-étrivière → œil de l’étrier (0,115 m au-dessus) ; M18 : rêne, mors → poing de la règle ;
écartement des poignets. M5 et M18 dépendent de la taille du cheval (cheval à la taille du web (échelle du maillage 0,0103882601, étape S3)).

| Scénario | Grandeur | Unreal | O1 | O2 |
|---|---|---|---|---|
| E1 | M4 gauche | 0,64 – 0,64 cm | 0,34 – 0,34 cm | — |
| E1 | M4 droit | 0,64 – 0,64 cm | 0,34 – 0,34 cm | — |
| E1 | M4a gauche | −0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E1 | M4a droit | 0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E1 | M5 étrivière gauche | 48,50 – 48,83 cm | 47,93 – 48,00 cm | — |
| E1 | M5 étrivière droite | 52,74 – 52,97 cm | 52,92 – 53,02 cm | — |
| E1 | M18 rêne gauche | 102,49 – 104,57 cm | 102,65 – 104,59 cm | 102,50 – 104,67 cm |
| E1 | M18 rêne droite | 101,06 – 102,71 cm | 101,51 – 103,28 cm | 101,25 – 102,96 cm |
| E1 | M18 écartement des poignets | 17,45 – 17,51 cm | 16,94 – 16,94 cm | 17,51 – 17,56 cm |
| E1b | M4 gauche | 0,62 – 0,72 cm | 0,32 – 0,55 cm | — |
| E1b | M4 droit | 0,62 – 0,73 cm | 0,32 – 0,54 cm | — |
| E1b | M4a gauche | −0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E1b | M4a droit | −0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E1b | M5 étrivière gauche | 46,68 – 54,57 cm | 47,03 – 55,16 cm | — |
| E1b | M5 étrivière droite | 49,27 – 56,33 cm | 49,91 – 56,88 cm | — |
| E1b | M18 rêne gauche | 92,58 – 123,46 cm | 94,07 – 123,23 cm | 92,71 – 124,51 cm |
| E1b | M18 rêne droite | 93,87 – 116,76 cm | 95,84 – 118,11 cm | 94,05 – 117,02 cm |
| E1b | M18 écartement des poignets | 16,97 – 18,23 cm | 16,91 – 16,94 cm | 16,98 – 18,39 cm |
| E2g | M4 gauche | 0,64 – 0,81 cm | 0,28 – 0,64 cm | — |
| E2g | M4 droit | 0,64 – 0,82 cm | 0,33 – 0,67 cm | — |
| E2g | M4a gauche | 0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E2g | M4a droit | −0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E2g | M5 étrivière gauche | 46,33 – 62,64 cm | 46,66 – 63,23 cm | — |
| E2g | M5 étrivière droite | 47,79 – 56,21 cm | 48,93 – 57,66 cm | — |
| E2g | M18 rêne gauche | 80,14 – 104,79 cm | 81,13 – 105,04 cm | 80,38 – 104,85 cm |
| E2g | M18 rêne droite | 89,29 – 114,36 cm | 92,23 – 116,16 cm | 89,58 – 113,51 cm |
| E2g | M18 écartement des poignets | 16,94 – 17,95 cm | 16,88 – 16,94 cm | 16,95 – 18,12 cm |
| E2d | M4 gauche | 0,64 – 0,80 cm | 0,35 – 0,63 cm | — |
| E2d | M4 droit | 0,64 – 0,78 cm | 0,34 – 0,61 cm | — |
| E2d | M4a gauche | −0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E2d | M4a droit | 0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E2d | M5 étrivière gauche | 46,24 – 52,71 cm | 47,67 – 54,28 cm | — |
| E2d | M5 étrivière droite | 50,95 – 62,67 cm | 51,40 – 63,07 cm | — |
| E2d | M18 rêne gauche | 95,92 – 121,92 cm | 98,33 – 121,80 cm | 95,74 – 123,08 cm |
| E2d | M18 rêne droite | 86,97 – 112,36 cm | 87,78 – 111,81 cm | 86,84 – 113,33 cm |
| E2d | M18 écartement des poignets | 16,96 – 17,87 cm | 16,90 – 16,94 cm | 16,95 – 18,04 cm |
| E3 | M4 gauche | 0,61 – 0,99 cm | 0,11 – 0,80 cm | — |
| E3 | M4 droit | 0,61 – 0,99 cm | 0,11 – 0,80 cm | — |
| E3 | M4a gauche | 0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E3 | M4a droit | 0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E3 | M5 étrivière gauche | 46,07 – 51,54 cm | 46,43 – 52,05 cm | — |
| E3 | M5 étrivière droite | 48,88 – 58,92 cm | 49,42 – 59,43 cm | — |
| E3 | M18 rêne gauche | 92,64 – 129,06 cm | 93,94 – 133,58 cm | 92,69 – 131,71 cm |
| E3 | M18 rêne droite | 93,72 – 131,89 cm | 95,11 – 136,13 cm | 93,80 – 134,49 cm |
| E3 | M18 écartement des poignets | 16,58 – 20,61 cm | 16,44 – 19,89 cm | 16,57 – 20,60 cm |
| E3b | M4 gauche | 0,61 – 1,01 cm | 0,11 – 0,82 cm | — |
| E3b | M4 droit | 0,61 – 1,01 cm | 0,11 – 0,82 cm | — |
| E3b | M4a gauche | −0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E3b | M4a droit | 0,00 – 0,00 cm | −0,00 – 0,00 cm | — |
| E3b | M5 étrivière gauche | 42,99 – 49,53 cm | 43,72 – 49,87 cm | — |
| E3b | M5 étrivière droite | 53,05 – 61,01 cm | 53,01 – 61,16 cm | — |
| E3b | M18 rêne gauche | 83,52 – 118,55 cm | 82,19 – 120,50 cm | 83,83 – 118,59 cm |
| E3b | M18 rêne droite | 84,30 – 118,89 cm | 82,90 – 120,92 cm | 84,61 – 118,99 cm |
| E3b | M18 écartement des poignets | 16,90 – 19,67 cm | 16,81 – 18,74 cm | 16,90 – 19,66 cm |

## Entrées de la règle venues du cheval Unreal, contre celles du web (information)

| Scénario | Images | Avec clip miroir | Assises | Phase réécrite depuis le clip (images ; écart max) | Phase tenue (écart max) | bob (écart max) | tangage (écart max) |
|---|---|---|---|---|---|---|---|
| E1 | 65 | 0 | 65 | 0 ; 0.0e+0 | 0,000 | 0,79 cm | 0,06° |
| E1b | 130 | 15 | 86 | 0 ; 0.0e+0 | 0,000 | 1,32 cm | 3,32° |
| E2g | 140 | 119 | 34 | 0 ; 0.0e+0 | 0,000 | 1,06 cm | 4,67° |
| E2d | 140 | 14 | 32 | 0 ; 0.0e+0 | 0,000 | 1,41 cm | 4,70° |
| E3 | 105 | 105 | 3 | 0 ; 0.0e+0 | 0,000 | 0,82 cm | 0,09° |
| E3b | 109 | 109 | 3 | 0 ; 0.0e+0 | 0,000 | 1,04 cm | 0,21° |

Phase tenue : à l’arrêt et pendant le saut, le web fait avancer la phase par sa locomotion procédurale
(`horse/anim.js`), non portée ; Unreal la tient à sa dernière valeur. bob et tangage : le cheval Unreal est plus petit,
ne suit pas la pente du terrain, ne remonte ni n’abaisse son corps au saut (horloge du saut et `rootY` non portés),
et ne bascule pas face aux barres (`_barClear`).

Verdict : **50 critères sur 233 ne sont pas tenus** (seuils absolus, écarts à O1 et phases du saut contre O1) ; détail ci-dessus. Contre O2 (mêmes proportions) : 3 écarts non tenus.
