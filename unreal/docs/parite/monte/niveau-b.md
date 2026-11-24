# Niveau B : la cavalière Unreal posée par la règle sur le cheval Unreal (essai de monte, voie A, étape M3)

Page générée par `node scripts/unreal/rider-rules-niveau-b.mjs` (ne pas modifier à la main), à partir de l’export du test
moteur `Strides.Parite.RiderOnHorse`. Les scénarios d’O1 sont rejoués sur le **cheval Unreal** (clips et temps du
mélangeur du web, clips miroir cuits dans Unreal, échelle du jeu, 3,7 % plus petit que le web) ; siège, profils,
postérieurs et phase de foulée sont calculés par Unreal ; la cavalière est posée par la chaîne du jeu (option
`-StridesRider=regles`) et ses articulations sont relues sur le maillage. Grandeurs : `rider-rules-metrics.mjs`, le même
code que pour O1 et O2. Tolérances : `plan-essai.md` §5, niveau B.

Deux références image par image : **O1** (règle du web, cheval du web, cavalier classique : la référence du plan) et
**O2 rider_f** (règle du web, cheval du web, proportions de la cavalière Unreal) : l’écart à O2 isole l’effet du cheval
Unreal. Assis : levée de la règle sous 2 cm et hors du vol ; obstacle : vol ou accompagnement (jumpK ≥ 0,1) ; pas :
poids de l’allure du pas de la règle au moins 0,5. Non mesurés dans Unreal : M4 (le cheval Unreal n’affiche pas
d’étrier : pas de selle ni d’étrivières), M5 (étrivière), M8 (pénétration mesurée par rayons dans la page web),
M18 (rênes absentes), M19 (montée et descente : E4 et E5 hors de l’essai, aucun oracle).

## Seuils absolus de la règle (valeur Unreal ; O1 et O2 sur les mêmes images, pour mémoire)

| Scénario | Grandeur | Unreal | Image | Seuil | Tenu | O1 | O2 |
|---|---|---|---|---|---|---|---|
| E1 | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,12 cm | 0 | ≤ 2,00 cm | oui | 0,04 | 0,12 |
| E1 | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 0 | ≤ 2,00 cm | oui | 0,43 | 0,77 |
| E1 | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,73 cm | 58 | ≤ 1,00 cm | oui | −3,26 | −1,25 |
| E1 | M6 portée de la jambe ρ assis (gauche) | 0,9252 | 8 | ≤ 0,9350 | oui | 0,9121 | 0,9252 |
| E1 | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 0 images ; sous −2 cm : 0) | 0,39 cm | 1 | ≥ −1,00 cm | oui | 0,20 | 0,63 |
| E1 | M9 poignet au-dessus de l’encolure (gauche) | 17,77 cm | 1 | ≥ 9,00 cm | oui | 16,37 | 18,44 |
| E1 | M10 coude (gauche) | 151,84° | 7 | ≤ 155,00° | oui | 130,25 | 151,84 |
| E1 | M1 plante – point d’étrier visé, |y| assis (droit) | 0,18 cm | 0 | ≤ 2,00 cm | oui | 0,13 | 0,20 |
| E1 | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,86 |
| E1 | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,63 cm | 14 | ≤ 1,00 cm | oui | −1,79 | −0,83 |
| E1 | M6 portée de la jambe ρ assis (droit) | 0,9240 | 64 | ≤ 0,9350 | oui | 0,9183 | 0,9253 |
| E1 | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 0 images ; sous −2 cm : 0) | 0,10 cm | 1 | ≥ −1,00 cm | oui | 0,51 | 0,61 |
| E1 | M9 poignet au-dessus de l’encolure (droit) | 17,20 cm | 62 | ≥ 9,00 cm | oui | 16,38 | 17,88 |
| E1 | M10 coude (droit) | 151,84° | 42 | ≤ 155,00° | oui | 128,15 | 151,84 |
| E1b | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,12 cm | 0 | ≤ 2,00 cm | oui | 0,10 | 0,12 |
| E1b | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,84 cm | 2 | ≤ 2,00 cm | oui | 0,46 | 0,77 |
| E1b | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 1,11 cm | 26 | ≤ 3,00 cm | oui | 0,21 | 0,21 |
| E1b | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,61 cm | 46 | ≤ 5,00 cm | oui | 0,53 | 0,52 |
| E1b | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,78 cm | 126 | ≤ 1,00 cm | oui | −0,75 | 0,02 |
| E1b | M6 portée de la jambe ρ assis (gauche) | 0,9563 | 75 | ≤ 0,9350 | **non** | 0,9438 | 0,9524 |
| E1b | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9491 | 45 | ≤ 0,9550 | oui | 0,9459 | 0,9460 |
| E1b | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 8 images ; sous −2 cm : 24) | −8,20 cm | 60 | ≥ −1,00 cm | **non** | −6,29 | −6,03 |
| E1b | M9 poignet au-dessus de l’encolure (gauche) | 9,16 cm | 60 | ≥ 9,00 cm | oui | 9,08 | 9,46 |
| E1b | M10 coude (gauche) | 151,84° | 46 | ≤ 155,00° | oui | 148,89 | 151,84 |
| E1b | M1 plante – point d’étrier visé, |y| assis (droit) | 0,18 cm | 6 | ≤ 2,00 cm | oui | 0,12 | 0,19 |
| E1b | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E1b | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 0,68 cm | 74 | ≤ 3,00 cm | oui | 1,12 | 2,13 |
| E1b | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,56 cm | 40 | ≤ 5,00 cm | oui | 0,48 | 0,50 |
| E1b | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,68 cm | 7 | ≤ 1,00 cm | oui | 0,16 | 1,00 |
| E1b | M6 portée de la jambe ρ assis (droit) | 0,9459 | 75 | ≤ 0,9350 | **non** | 0,9403 | 0,9459 |
| E1b | M6 portée de la jambe ρ hors de la selle (droit) | 0,9459 | 40 | ≤ 0,9550 | oui | 0,9459 | 0,9459 |
| E1b | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 7 images ; sous −2 cm : 22) | −6,31 cm | 22 | ≥ −1,00 cm | **non** | −15,17 | −8,21 |
| E1b | M9 poignet au-dessus de l’encolure (droit) | 9,15 cm | 60 | ≥ 9,00 cm | oui | 9,08 | 9,46 |
| E1b | M10 coude (droit) | 151,84° | 96 | ≤ 155,00° | oui | 150,06 | 151,84 |
| E2g | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,12 cm | 0 | ≤ 2,00 cm | oui | 0,11 | 0,28 |
| E2g | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 0 | ≤ 2,00 cm | oui | 0,60 | 0,77 |
| E2g | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 0,61 cm | 45 | ≤ 3,00 cm | oui | 0,15 | 0,14 |
| E2g | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,48 cm | 138 | ≤ 5,00 cm | oui | 0,62 | 0,66 |
| E2g | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,34 cm | 5 | ≤ 1,00 cm | oui | 0,99 | 1,18 |
| E2g | M6 portée de la jambe ρ assis (gauche) | 0,9273 | 31 | ≤ 0,9350 | oui | 0,9219 | 0,9252 |
| E2g | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9459 | 54 | ≤ 0,9550 | oui | 0,9129 | 0,9228 |
| E2g | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 118 images ; sous −2 cm : 132) | −14,25 cm | 80 | ≥ −1,00 cm | **non** | −7,47 | −8,46 |
| E2g | M9 poignet au-dessus de l’encolure (gauche) | 8,64 cm | 84 | ≥ 9,00 cm | **non** | 8,94 | 9,06 |
| E2g | M10 coude (gauche) | 151,84° | 45 | ≤ 155,00° | oui | 137,14 | 151,84 |
| E2g | M1 plante – point d’étrier visé, |y| assis (droit) | 0,18 cm | 0 | ≤ 2,00 cm | oui | 8,44 | 9,16 |
| E2g | M1 plante – point d’étrier visé, |z| assis (droit) | 0,88 cm | 2 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E2g | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 1,20 cm | 44 | ≤ 3,00 cm | oui | 5,16 | 6,02 |
| E2g | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,57 cm | 60 | ≤ 5,00 cm | oui | 0,51 | 0,53 |
| E2g | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,66 cm | 8 | ≤ 1,00 cm | oui | −0,81 | −0,75 |
| E2g | M6 portée de la jambe ρ assis (droit) | 0,9459 | 40 | ≤ 0,9350 | **non** | 0,9454 | 0,9459 |
| E2g | M6 portée de la jambe ρ hors de la selle (droit) | 0,9605 | 46 | ≤ 0,9550 | **non** | 0,9459 | 0,9459 |
| E2g | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 6 images ; sous −2 cm : 5) | −4,19 cm | 39 | ≥ −1,00 cm | **non** | −24,79 | −23,07 |
| E2g | M9 poignet au-dessus de l’encolure (droit) | 8,61 cm | 84 | ≥ 9,00 cm | **non** | 8,93 | 9,03 |
| E2g | M10 coude (droit) | 151,84° | 40 | ≤ 155,00° | oui | 140,92 | 151,84 |
| E2d | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,12 cm | 0 | ≤ 2,00 cm | oui | 2,19 | 3,44 |
| E2d | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,84 cm | 2 | ≤ 2,00 cm | oui | 0,48 | 0,77 |
| E2d | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 0,39 cm | 98 | ≤ 3,00 cm | oui | 6,48 | 6,98 |
| E2d | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,62 cm | 121 | ≤ 5,00 cm | oui | 0,52 | 0,53 |
| E2d | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,84 cm | 121 | ≤ 1,00 cm | oui | −0,81 | −0,55 |
| E2d | M6 portée de la jambe ρ assis (gauche) | 0,9459 | 36 | ≤ 0,9350 | **non** | 0,9430 | 0,9432 |
| E2d | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9571 | 115 | ≤ 0,9550 | **non** | 0,9459 | 0,9459 |
| E2d | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 6 images ; sous −2 cm : 12) | −6,04 cm | 2 | ≥ −1,00 cm | **non** | −13,54 | −11,09 |
| E2d | M9 poignet au-dessus de l’encolure (gauche) | 8,99 cm | 84 | ≥ 9,00 cm | **non** | 9,01 | 9,16 |
| E2d | M10 coude (gauche) | 151,84° | 45 | ≤ 155,00° | oui | 139,63 | 151,84 |
| E2d | M1 plante – point d’étrier visé, |y| assis (droit) | 0,18 cm | 6 | ≤ 2,00 cm | oui | 0,13 | 0,19 |
| E2d | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E2d | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 0,49 cm | 99 | ≤ 3,00 cm | oui | 0,22 | 0,22 |
| E2d | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,50 cm | 22 | ≤ 5,00 cm | oui | 0,64 | 0,72 |
| E2d | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,68 cm | 7 | ≤ 1,00 cm | oui | −1,00 | −0,72 |
| E2d | M6 portée de la jambe ρ assis (droit) | 0,9252 | 16 | ≤ 0,9350 | oui | 0,9181 | 0,9225 |
| E2d | M6 portée de la jambe ρ hors de la selle (droit) | 0,9459 | 26 | ≤ 0,9550 | oui | 0,9089 | 0,9104 |
| E2d | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 22 images ; sous −2 cm : 79) | −14,21 cm | 23 | ≥ −1,00 cm | **non** | −1,51 | −2,24 |
| E2d | M9 poignet au-dessus de l’encolure (droit) | 9,01 cm | 84 | ≥ 9,00 cm | oui | 9,02 | 9,17 |
| E2d | M10 coude (droit) | 151,84° | 0 | ≤ 155,00° | oui | 134,30 | 151,84 |
| E3 | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,29 cm | 2 | ≤ 2,00 cm | oui | 0,23 | 0,27 |
| E3 | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 0 | ≤ 2,00 cm | oui | 0,43 | 0,77 |
| E3 | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 0,77 cm | 54 | ≤ 3,00 cm | oui | 1,00 | 1,40 |
| E3 | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,54 cm | 61 | ≤ 5,00 cm | oui | 0,50 | 0,55 |
| E3 | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,88 cm | 61 | ≤ 1,00 cm | oui | −0,84 | −0,88 |
| E3 | M6 portée de la jambe ρ assis (gauche) | 0,9308 | 1 | ≤ 0,9350 | oui | 0,9224 | 0,9307 |
| E3 | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9514 | 52 | ≤ 0,9550 | oui | 0,9463 | 0,9459 |
| E3 | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 14 images ; sous −2 cm : 32) | −9,09 cm | 42 | ≥ −1,00 cm | **non** | −11,50 | −10,18 |
| E3 | M9 poignet au-dessus de l’encolure (gauche) | 8,88 cm | 49 | ≥ 9,00 cm | **non** | 6,75 | 7,09 |
| E3 | M10 coude (gauche) | 151,84° | 62 | ≤ 155,00° | oui | 151,70 | 151,84 |
| E3 | M1 plante – point d’étrier visé, |y| assis (droit) | 0,18 cm | 2 | ≤ 2,00 cm | oui | 0,31 | 0,20 |
| E3 | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E3 | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 0,18 cm | 97 | ≤ 3,00 cm | oui | 1,00 | 0,04 |
| E3 | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,85 cm | 6 | ≤ 5,00 cm | oui | 0,56 | 0,64 |
| E3 | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,86 cm | 82 | ≤ 1,00 cm | oui | −0,81 | −0,82 |
| E3 | M6 portée de la jambe ρ assis (droit) | 0,9335 | 2 | ≤ 0,9350 | oui | 0,9289 | 0,9320 |
| E3 | M6 portée de la jambe ρ hors de la selle (droit) | 0,9473 | 97 | ≤ 0,9550 | oui | 0,9466 | 0,9460 |
| E3 | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 5 images ; sous −2 cm : 6) | −4,81 cm | 50 | ≥ −1,00 cm | **non** | −7,96 | −3,02 |
| E3 | M9 poignet au-dessus de l’encolure (droit) | 8,88 cm | 49 | ≥ 9,00 cm | **non** | 6,75 | 7,09 |
| E3 | M10 coude (droit) | 151,84° | 0 | ≤ 155,00° | oui | 151,70 | 151,84 |
| E3b | M1 plante – point d’étrier visé, |y| assis (gauche) | 0,29 cm | 2 | ≤ 2,00 cm | oui | 0,26 | 0,27 |
| E3b | M1 plante – point d’étrier visé, |z| assis (gauche) | 0,77 cm | 0 | ≤ 2,00 cm | oui | 0,43 | 0,77 |
| E3b | M1 plante – point d’étrier visé, Δy hors de la selle (gauche) | 0,80 cm | 42 | ≤ 3,00 cm | oui | 1,24 | 0,26 |
| E3b | M1 plante – point d’étrier visé, |Δz| hors de la selle (gauche) | 0,50 cm | 65 | ≤ 5,00 cm | oui | 0,47 | 0,51 |
| E3b | M2 cheville au-delà de sa place naturelle xMax (gauche) | −0,91 cm | 60 | ≤ 1,00 cm | oui | −0,86 | 0,74 |
| E3b | M6 portée de la jambe ρ assis (gauche) | 0,9309 | 1 | ≤ 0,9350 | oui | 0,9242 | 0,9307 |
| E3b | M6 portée de la jambe ρ hors de la selle (gauche) | 0,9460 | 38 | ≤ 0,9550 | oui | 0,9459 | 0,9556 |
| E3b | M7 écart au flanc, minimum (gauche) (plus longue suite sous −1 cm : 13 images ; sous −2 cm : 50) | −9,47 cm | 41 | ≥ −1,00 cm | **non** | −13,20 | −10,36 |
| E3b | M9 poignet au-dessus de l’encolure (gauche) | 8,89 cm | 13 | ≥ 9,00 cm | **non** | 8,57 | 9,22 |
| E3b | M10 coude (gauche) | 151,84° | 65 | ≤ 155,00° | oui | 151,70 | 151,84 |
| E3b | M1 plante – point d’étrier visé, |y| assis (droit) | 0,18 cm | 2 | ≤ 2,00 cm | oui | 0,31 | 0,20 |
| E3b | M1 plante – point d’étrier visé, |z| assis (droit) | 0,85 cm | 0 | ≤ 2,00 cm | oui | 0,69 | 0,85 |
| E3b | M1 plante – point d’étrier visé, Δy hors de la selle (droit) | 0,80 cm | 42 | ≤ 3,00 cm | oui | 0,35 | −0,01 |
| E3b | M1 plante – point d’étrier visé, |Δz| hors de la selle (droit) | 0,83 cm | 5 | ≤ 5,00 cm | oui | 0,57 | 0,60 |
| E3b | M2 cheville au-delà de sa place naturelle xMax (droit) | −0,73 cm | 88 | ≤ 1,00 cm | oui | −0,80 | −0,85 |
| E3b | M6 portée de la jambe ρ assis (droit) | 0,9336 | 2 | ≤ 0,9350 | oui | 0,9289 | 0,9320 |
| E3b | M6 portée de la jambe ρ hors de la selle (droit) | 0,9473 | 104 | ≤ 0,9550 | oui | 0,9459 | 0,9467 |
| E3b | M7 écart au flanc, minimum (droit) (plus longue suite sous −1 cm : 2 images ; sous −2 cm : 1) | −3,26 cm | 4 | ≥ −1,00 cm | **non** | −5,10 | −3,74 |
| E3b | M9 poignet au-dessus de l’encolure (droit) | 8,88 cm | 13 | ≥ 9,00 cm | **non** | 8,57 | 9,22 |
| E3b | M10 coude (droit) | 151,84° | 0 | ≤ 155,00° | oui | 151,70 | 151,84 |

## Écarts aux références (grandeurs qui ne dépendent pas de l’échelle du cheval)

Colonnes de décomposition (information) : **O2 − O1**, ce que changent les seules proportions de la cavalière (cheval du
web dans les deux) ; **contrôle − O2**, ce que le rejeu ajoute quand le cheval Unreal est posé comme celui du web (phase
tenue au saut, clips à 30 images/s rééchantillonnés à l’import) ; le reste de **Unreal − O2** vient du cheval du jeu
(taille, pas d’inclinaison en virage ni de pente, corps non remonté au saut).

| Scénario | Grandeur | Images | Tolérance | Unreal − O1 (max) | Image | Tenu | Unreal − O2 (max) | Image | Tenu | O2 − O1 | contrôle − O2 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | M11 hanche gauche | 65 | 6,00° | 3,70° | 0 | oui | 0,80° | 53 | oui | 3,88° | 0,00° |
| E1 | M11 cheville gauche | 65 | 6,00° | 3,78° | 0 | oui | 0,86° | 64 | oui | 3,78° | 0,00° |
| E1 | M12 ouverture du genou gauche | 65 | 8,00° | 23,83° | 0 | **non** | 3,20° | 13 | oui | 23,83° | 0,01° |
| E1 | M15 talon gauche | 65 | 4,00° | 0,00° | 4 | oui | 0,00° | 5 | oui | 0,00° | 0,00° |
| E1 | M15 pointe gauche | 65 | 4,00° | 0,00° | 4 | oui | 0,00° | 4 | oui | 0,00° | 0,00° |
| E1 | M11 hanche droite | 65 | 6,00° | 2,07° | 0 | oui | 1,26° | 52 | oui | 2,32° | 0,00° |
| E1 | M11 cheville droite | 65 | 6,00° | 1,44° | 64 | oui | 0,90° | 64 | oui | 0,58° | 0,00° |
| E1 | M12 ouverture du genou droit | 65 | 8,00° | 11,25° | 0 | **non** | 5,05° | 64 | oui | 11,28° | 0,00° |
| E1 | M15 talon droit | 65 | 4,00° | 0,00° | 2 | oui | 0,00° | 2 | oui | 0,00° | 0,00° |
| E1 | M15 pointe droite | 65 | 4,00° | 0,00° | 2 | oui | 0,00° | 2 | oui | 0,00° | 0,00° |
| E1 | M13 buste, assis | 65 | 3,00° | 2,07° | 0 | oui | 0,04° | 37 | oui | 2,10° | 0,00° |
| E1 | M14 levée maximale de l’assise ≤ référence + 1 cm | 65 | 1,00 cm | −1,24 cm | — | oui | −0,13 cm | — | oui | — | — |
| E1 | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 64 | 0,00° | −14,39° | 1 | oui | −14,39° | 1 | oui | — | — |
| E1b | M11 hanche gauche | 130 | 6,00° | 5,60° | 54 | oui | 4,77° | 45 | oui | 3,70° | 0,49° |
| E1b | M11 cheville gauche | 130 | 6,00° | 7,38° | 65 | **non** | 3,34° | 57 | oui | 5,25° | 0,09° |
| E1b | M12 ouverture du genou gauche | 130 | 8,00° | 23,83° | 0 | **non** | 6,75° | 21 | oui | 23,91° | 0,27° |
| E1b | M15 talon gauche | 130 | 4,00° | 0,13° | 3 | oui | 0,02° | 1 | oui | 0,12° | 0,00° |
| E1b | M15 pointe gauche | 130 | 4,00° | 0,07° | 3 | oui | 0,01° | 1 | oui | 0,08° | 0,00° |
| E1b | M11 hanche droite | 130 | 6,00° | 5,42° | 52 | oui | 4,98° | 52 | oui | 2,57° | 0,64° |
| E1b | M11 cheville droite | 130 | 6,00° | 7,45° | 13 | **non** | 7,52° | 13 | **non** | 2,73° | 0,34° |
| E1b | M12 ouverture du genou droit | 130 | 8,00° | 14,64° | 4 | **non** | 18,78° | 13 | **non** | 11,58° | 0,06° |
| E1b | M15 talon droit | 130 | 4,00° | 0,05° | 12 | oui | 0,05° | 12 | oui | 0,03° | 0,00° |
| E1b | M15 pointe droite | 130 | 4,00° | 0,07° | 12 | oui | 0,08° | 12 | oui | 0,03° | 0,00° |
| E1b | M13 buste, assis | 130 | 3,00° | 4,33° | 25 | **non** | 2,07° | 16 | oui | 3,37° | 0,02° |
| E1b | M14 assise au pas | 24 | 0,40 cm | 1,44 cm | 7 | **non** | 1,34 cm | 13 | **non** | 1,55 cm | 0,06 cm |
| E1b | M14 levée maximale de l’assise ≤ référence + 1 cm | 130 | 1,00 cm | 0,07 cm | — | oui | 1,03 cm | — | **non** | — | — |
| E1b | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 129 | 0,00° | −6,95° | 60 | oui | −6,95° | 60 | oui | — | — |
| E2g | M11 hanche gauche | 140 | 6,00° | 9,15° | 103 | **non** | 8,09° | 108 | **non** | 3,70° | 0,03° |
| E2g | M11 cheville gauche | 140 | 6,00° | 10,78° | 44 | **non** | 7,65° | 44 | **non** | 5,76° | 0,04° |
| E2g | M12 ouverture du genou gauche | 140 | 8,00° | 23,83° | 0 | **non** | 16,78° | 43 | **non** | 23,90° | 0,10° |
| E2g | M15 talon gauche | 140 | 4,00° | 0,15° | 4 | oui | 0,03° | 5 | oui | 0,14° | 0,00° |
| E2g | M15 pointe gauche | 140 | 4,00° | 0,12° | 3 | oui | 0,03° | 5 | oui | 0,13° | 0,00° |
| E2g | M11 hanche droite | 140 | 6,00° | 15,62° | 16 | **non** | 14,04° | 16 | **non** | 2,51° | 0,17° |
| E2g | M11 cheville droite | 140 | 6,00° | 3,72° | 39 | oui | 3,99° | 9 | oui | 2,71° | 0,02° |
| E2g | M12 ouverture du genou droit | 140 | 8,00° | 16,58° | 7 | **non** | 14,17° | 8 | **non** | 11,25° | 0,12° |
| E2g | M15 talon droit | 140 | 4,00° | 0,11° | 8 | oui | 0,06° | 11 | oui | 0,08° | 0,00° |
| E2g | M15 pointe droite | 140 | 4,00° | 0,08° | 8 | oui | 0,04° | 12 | oui | 0,06° | 0,00° |
| E2g | M13 buste, assis | 140 | 3,00° | 5,52° | 53 | **non** | 3,05° | 21 | **non** | 3,37° | 0,03° |
| E2g | M14 assise au pas | 16 | 0,40 cm | 1,17 cm | 21 | **non** | 1,25 cm | 21 | **non** | 1,03 cm | 0,00 cm |
| E2g | M14 levée maximale de l’assise ≤ référence + 1 cm | 140 | 1,00 cm | 2,08 cm | — | **non** | 3,16 cm | — | **non** | — | — |
| E2g | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 139 | 0,00° | −4,20° | 84 | oui | −4,20° | 84 | oui | — | — |
| E2d | M11 hanche gauche | 140 | 6,00° | 12,31° | 40 | **non** | 10,51° | 40 | **non** | 3,70° | 0,16° |
| E2d | M11 cheville gauche | 140 | 6,00° | 3,78° | 0 | oui | 2,96° | 23 | oui | 3,87° | 0,01° |
| E2d | M12 ouverture du genou gauche | 140 | 8,00° | 23,83° | 0 | **non** | 7,19° | 40 | oui | 23,91° | 0,11° |
| E2d | M15 talon gauche | 140 | 4,00° | 0,13° | 3 | oui | 0,02° | 1 | oui | 0,12° | 0,00° |
| E2d | M15 pointe gauche | 140 | 4,00° | 0,07° | 3 | oui | 0,02° | 12 | oui | 0,08° | 0,00° |
| E2d | M11 hanche droite | 140 | 6,00° | 9,27° | 67 | **non** | 9,26° | 63 | **non** | 6,71° | 0,04° |
| E2d | M11 cheville droite | 140 | 6,00° | 14,67° | 79 | **non** | 11,84° | 92 | **non** | 3,85° | 0,04° |
| E2d | M12 ouverture du genou droit | 140 | 8,00° | 19,99° | 82 | **non** | 21,24° | 21 | **non** | 18,49° | 0,07° |
| E2d | M15 talon droit | 140 | 4,00° | 0,05° | 12 | oui | 0,05° | 12 | oui | 0,03° | 0,00° |
| E2d | M15 pointe droite | 140 | 4,00° | 0,07° | 12 | oui | 0,08° | 12 | oui | 0,03° | 0,00° |
| E2d | M13 buste, assis | 140 | 3,00° | 5,97° | 106 | **non** | 2,89° | 105 | oui | 3,44° | 0,01° |
| E2d | M14 assise au pas | 16 | 0,40 cm | 2,24 cm | 20 | **non** | 2,32 cm | 21 | **non** | 1,51 cm | 0,00 cm |
| E2d | M14 levée maximale de l’assise ≤ référence + 1 cm | 140 | 1,00 cm | 2,23 cm | — | **non** | 3,31 cm | — | **non** | — | — |
| E2d | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 139 | 0,00° | −6,48° | 84 | oui | −6,48° | 84 | oui | — | — |
| E3 | M11 hanche gauche | 105 | 6,00° | 8,06° | 42 | **non** | 9,15° | 42 | **non** | 5,57° | 2,87° |
| E3 | M11 cheville gauche | 105 | 6,00° | 3,78° | 0 | oui | 1,84° | 42 | oui | 3,78° | 1,09° |
| E3 | M12 ouverture du genou gauche | 105 | 8,00° | 23,83° | 0 | **non** | 6,63° | 63 | oui | 23,83° | 7,13° |
| E3 | M15 talon gauche | 105 | 4,00° | 0,24° | 81 | oui | 0,24° | 81 | oui | 0,18° | 0,00° |
| E3 | M15 pointe gauche | 105 | 4,00° | 0,18° | 4 | oui | 0,05° | 2 | oui | 0,21° | 0,00° |
| E3 | M11 hanche droite | 105 | 6,00° | 9,15° | 42 | **non** | 8,98° | 42 | **non** | 5,97° | 3,65° |
| E3 | M11 cheville droite | 105 | 6,00° | 5,88° | 42 | oui | 3,67° | 42 | oui | 3,43° | 2,19° |
| E3 | M12 ouverture du genou droit | 105 | 8,00° | 18,85° | 4 | **non** | 10,99° | 55 | **non** | 13,24° | 0,39° |
| E3 | M15 talon droit | 105 | 4,00° | 0,28° | 6 | oui | 0,28° | 6 | oui | 0,07° | 0,00° |
| E3 | M15 pointe droite | 105 | 4,00° | 0,24° | 6 | oui | 0,27° | 6 | oui | 0,05° | 0,00° |
| E3 | M13 buste, assis | 63 | 3,00° | 5,51° | 40 | **non** | 2,51° | 40 | oui | 3,79° | 0,00° |
| E3 | M13 buste, à l’obstacle | 42 | 5,00° | 7,74° | 42 | **non** | 3,94° | 41 | oui | 7,15° | 2,91° |
| E3 | M14 levée maximale de l’assise ≤ référence + 1 cm | 105 | 1,00 cm | −1,57 cm | — | oui | 0,55 cm | — | oui | — | — |
| E3 | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 104 | 0,00° | −2,70° | 48 | oui | −2,70° | 48 | oui | — | — |
| E3b | M11 hanche gauche | 109 | 6,00° | 6,94° | 51 | **non** | 2,11° | 17 | oui | 5,71° | 1,15° |
| E3b | M11 cheville gauche | 109 | 6,00° | 3,78° | 0 | oui | 1,16° | 75 | oui | 3,78° | 0,57° |
| E3b | M12 ouverture du genou gauche | 109 | 8,00° | 23,83° | 0 | **non** | 1,77° | 62 | oui | 23,83° | 0,34° |
| E3b | M15 talon gauche | 109 | 4,00° | 0,15° | 85 | oui | 0,15° | 85 | oui | 0,18° | 0,00° |
| E3b | M15 pointe gauche | 109 | 4,00° | 0,18° | 4 | oui | 0,05° | 2 | oui | 0,20° | 0,00° |
| E3b | M11 hanche droite | 109 | 6,00° | 6,91° | 50 | **non** | 3,49° | 17 | oui | 6,32° | 1,26° |
| E3b | M11 cheville droite | 109 | 6,00° | 5,03° | 17 | oui | 3,81° | 72 | oui | 3,60° | 0,68° |
| E3b | M12 ouverture du genou droit | 109 | 8,00° | 16,46° | 3 | **non** | 14,93° | 72 | **non** | 13,20° | 2,50° |
| E3b | M15 talon droit | 109 | 4,00° | 0,30° | 5 | oui | 0,29° | 6 | oui | 0,09° | 0,00° |
| E3b | M15 pointe droite | 109 | 4,00° | 0,25° | 5 | oui | 0,26° | 5 | oui | 0,07° | 0,00° |
| E3b | M13 buste, assis | 63 | 3,00° | 3,25° | 40 | **non** | 1,58° | 87 | oui | 3,64° | 0,00° |
| E3b | M13 buste, à l’obstacle | 46 | 5,00° | 8,04° | 48 | **non** | 1,79° | 85 | oui | 7,26° | 1,50° |
| E3b | M14 levée maximale de l’assise ≤ référence + 1 cm | 109 | 1,00 cm | −0,99 cm | — | oui | 0,62 cm | — | oui | — | — |
| E3b | M16 continuité : ≤ 15° par image en régime établi, ≤ référence + 5° en transition (excès) | 108 | 0,00° | −6,55° | 48 | oui | −6,55° | 48 | oui | — | — |

## M17 : phases du saut (images depuis le début du scénario), tolérance ± 2 images

| Scénario | Phase | Unreal | O1 | O2 | Écart à O1 | Écart à O2 |
|---|---|---|---|---|---|---|
| E3 | appel | 41 | 41 | 41 | 0 | 0 |
| E3 | sommet | 50 | 50 | 50 | 0 | 0 |
| E3 | poserAnterieurs | 59 | 59 | 59 | 0 | 0 |
| E3 | poserPosterieursDetecte | 70 | 82 | 82 | 12 **(> 2)** | 12 **(> 2)** |
| E3 | poserPosterieursRegle | 70 | 73 | 73 | 3 **(> 2)** | 3 **(> 2)** |
| E3 | jumpK50Montee | 43 | 43 | 43 | 0 | 0 |
| E3 | jumpKMax | 50 | 50 | 50 | 0 | 0 |
| E3 | jumpK50Descente | 68 | 68 | 68 | 0 | 0 |
| E3 | jumpK10Descente | 83 | 85 | 85 | 2 | 2 |
| E3b | appel | 41 | 41 | 41 | 0 | 0 |
| E3b | sommet | 52 | 52 | 52 | 0 | 0 |
| E3b | poserAnterieurs | 63 | 63 | 63 | 0 | 0 |
| E3b | poserPosterieursDetecte | 74 | 76 | 76 | 2 | 2 |
| E3b | poserPosterieursRegle | 74 | 76 | 76 | 2 | 2 |
| E3b | jumpK50Montee | 44 | 44 | 44 | 0 | 0 |
| E3b | jumpKMax | 52 | 52 | 52 | 0 | 0 |
| E3b | jumpK50Descente | 72 | 72 | 72 | 0 | 0 |
| E3b | jumpK10Descente | 87 | 88 | 88 | 1 | 1 |

## Entrées de la règle venues du cheval Unreal, contre celles du web (information)

| Scénario | Images | Avec clip miroir | Assises | Phase réécrite depuis le clip (images ; écart max) | Phase tenue (écart max) | bob (écart max) | tangage (écart max) |
|---|---|---|---|---|---|---|---|
| E1 | 65 | 0 | 65 | 0 ; 0.0e+0 | 0,000 | 7,50 cm | 0,06° |
| E1b | 130 | 15 | 86 | 85 ; 5.0e-10 | 0,268 | 7,71 cm | 3,87° |
| E2g | 140 | 119 | 34 | 138 ; 5.0e-10 | 0,000 | 7,74 cm | 5,59° |
| E2d | 140 | 14 | 32 | 138 ; 4.9e-10 | 0,000 | 7,57 cm | 5,11° |
| E3 | 105 | 105 | 3 | 75 ; 4.9e-10 | 0,480 | 14,66 cm | 6,45° |
| E3b | 109 | 109 | 3 | 75 ; 4.9e-10 | 0,499 | 10,42 cm | 0,23° |

Phase tenue : à l’arrêt et pendant le saut, le web fait avancer la phase par sa locomotion procédurale
(`horse/anim.js`), non portée ; Unreal la tient à sa dernière valeur. bob et tangage : le cheval Unreal est plus petit,
ne suit pas la pente du terrain, ne remonte ni n’abaisse son corps au saut (horloge du saut et `rootY` non portés),
et ne bascule pas face aux barres (`_barClear`).

Verdict : **61 critères sur 215 ne sont pas tenus** (seuils absolus, écarts à O1 et phases du saut contre O1) ; détail ci-dessus. Contre O2 (mêmes proportions) : 24 écarts non tenus.
