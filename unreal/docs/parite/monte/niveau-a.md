# Niveau A : la cavalière Unreal posée par la règle, contre O2 rider_f (essai de monte, voie A, étape 6)

Page générée par `node scripts/unreal/rider-rules-niveau-a.mjs` (ne pas modifier à la main), à partir de l’export du test
moteur `Strides.Parite.RiderRules` (articulations relues sur le maillage `rider_f_animated` posé dans Unreal). Grandeurs
calculées par `rider-rules-metrics.mjs`, le même code que pour O1 et O2. Écart maximal |Unreal − O2| sur TOUTES les
images de chaque scénario (M16 : excès d’Unreal sur O2). Tolérances : `plan-essai.md` §5, niveau A.

| Scénario | Images | Grandeur | Écart max | Image | Tolérance | Tenu |
|---|---|---|---|---|---|---|
| E1 | 65 | M1 plante – point d’étrier, y et z | 1,1 × 10^−5 cm | 14 | 1,000 cm | oui |
| E1 | 65 | M2 écart latéral du pied | 5,8 × 10^−6 cm | 32 | 1,000 cm | oui |
| E1 | 65 | M6 portée de la jambe ρ | 4,1 × 10^−8 | 8 | 0,00500 | oui |
| E1 | 65 | M7 écarts au flanc (genou, tibia 35 et 65 %, cuisse 50 et 75 %) | 1,3 × 10^−5 cm | 52 | 1,000 cm | oui |
| E1 | 65 | M9 poignet au-dessus de l’encolure | 1,4 × 10^−7 cm | 49 | 1,000 cm | oui |
| E1 | 65 | M10 bras : allonge | 3,0 × 10^−7 | 33 | 1,0 × 10^−4 | oui |
| E1 | 65 | M10 bras : coude | 6,3 × 10^−4° | 37 | 2,000° | oui |
| E1 | 65 | M11 genou, hanche, cheville | 5,8 × 10^−5° | 52 | 2,000° | oui |
| E1 | 65 | M12 ouverture du genou | 4,1 × 10^−6° | 44 | 3,000° | oui |
| E1 | 65 | M13 buste | 3,3 × 10^−6° | 33 | 1,000° | oui |
| E1 | 65 | M14 assise | 5,0 × 10^−8 cm | 3 | 0,500 cm | oui |
| E1 | 65 | M15 talon bas, pointe ouverte | 1,4 × 10^−6° | 11 | 2,000° | oui |
| E1 | 65 | M16 continuité : rotation des segments par image (Unreal ≤ O2 + 2°) | 2,7 × 10^−7° | 8 | 2,000° | oui |
| E1 | 65 | M16 continuité : à-coup (Unreal ≤ O2 + 2°) | 2,0 × 10^−7° | 45 | 2,000° | oui |
| E1b | 130 | M1 plante – point d’étrier, y et z | 1,1 × 10^−5 cm | 98 | 1,000 cm | oui |
| E1b | 130 | M2 écart latéral du pied | 5,8 × 10^−6 cm | 104 | 1,000 cm | oui |
| E1b | 130 | M6 portée de la jambe ρ | 4,4 × 10^−8 | 28 | 0,00500 | oui |
| E1b | 130 | M7 écarts au flanc (genou, tibia 35 et 65 %, cuisse 50 et 75 %) | 5,8 × 10^−5 cm | 54 | 1,000 cm | oui |
| E1b | 130 | M9 poignet au-dessus de l’encolure | 6,2 × 10^−7 cm | 95 | 1,000 cm | oui |
| E1b | 130 | M10 bras : allonge | 3,3 × 10^−7 | 20 | 1,0 × 10^−4 | oui |
| E1b | 130 | M10 bras : coude | 6,5 × 10^−4° | 20 | 2,000° | oui |
| E1b | 130 | M11 genou, hanche, cheville | 7,1 × 10^−5° | 59 | 2,000° | oui |
| E1b | 130 | M12 ouverture du genou | 4,0 × 10^−6° | 1 | 3,000° | oui |
| E1b | 130 | M13 buste | 3,4 × 10^−6° | 8 | 1,000° | oui |
| E1b | 130 | M14 assise | 4,9 × 10^−8 cm | 116 | 0,500 cm | oui |
| E1b | 130 | M15 talon bas, pointe ouverte | 1,5 × 10^−6° | 111 | 2,000° | oui |
| E1b | 130 | M16 continuité : rotation des segments par image (Unreal ≤ O2 + 2°) | 5,6 × 10^−5° | 59 | 2,000° | oui |
| E1b | 130 | M16 continuité : à-coup (Unreal ≤ O2 + 2°) | 6,3 × 10^−5° | 28 | 2,000° | oui |
| E2g | 140 | M1 plante – point d’étrier, y et z | 1,1 × 10^−5 cm | 27 | 1,000 cm | oui |
| E2g | 140 | M2 écart latéral du pied | 5,8 × 10^−6 cm | 14 | 1,000 cm | oui |
| E2g | 140 | M6 portée de la jambe ρ | 4,5 × 10^−8 | 110 | 0,00500 | oui |
| E2g | 140 | M7 écarts au flanc (genou, tibia 35 et 65 %, cuisse 50 et 75 %) | 5,9 × 10^−5 cm | 40 | 1,000 cm | oui |
| E2g | 140 | M9 poignet au-dessus de l’encolure | 1,4 × 10^−7 cm | 72 | 1,000 cm | oui |
| E2g | 140 | M10 bras : allonge | 3,0 × 10^−7 | 40 | 1,0 × 10^−4 | oui |
| E2g | 140 | M10 bras : coude | 6,3 × 10^−4° | 40 | 2,000° | oui |
| E2g | 140 | M11 genou, hanche, cheville | 7,1 × 10^−5° | 40 | 2,000° | oui |
| E2g | 140 | M12 ouverture du genou | 4,0 × 10^−6° | 0 | 3,000° | oui |
| E2g | 140 | M13 buste | 3,3 × 10^−6° | 7 | 1,000° | oui |
| E2g | 140 | M14 assise | 4,9 × 10^−8 cm | 71 | 0,500 cm | oui |
| E2g | 140 | M15 talon bas, pointe ouverte | 1,6 × 10^−6° | 37 | 2,000° | oui |
| E2g | 140 | M16 continuité : rotation des segments par image (Unreal ≤ O2 + 2°) | 7,6 × 10^−5° | 13 | 2,000° | oui |
| E2g | 140 | M16 continuité : à-coup (Unreal ≤ O2 + 2°) | 6,4 × 10^−5° | 73 | 2,000° | oui |
| E2d | 140 | M1 plante – point d’étrier, y et z | 1,1 × 10^−5 cm | 7 | 1,000 cm | oui |
| E2d | 140 | M2 écart latéral du pied | 5,8 × 10^−6 cm | 26 | 1,000 cm | oui |
| E2d | 140 | M6 portée de la jambe ρ | 4,7 × 10^−8 | 61 | 0,00500 | oui |
| E2d | 140 | M7 écarts au flanc (genou, tibia 35 et 65 %, cuisse 50 et 75 %) | 4,2 × 10^−5 cm | 25 | 1,000 cm | oui |
| E2d | 140 | M9 poignet au-dessus de l’encolure | 1,4 × 10^−7 cm | 23 | 1,000 cm | oui |
| E2d | 140 | M10 bras : allonge | 3,1 × 10^−7 | 20 | 1,0 × 10^−4 | oui |
| E2d | 140 | M10 bras : coude | 6,3 × 10^−4° | 21 | 2,000° | oui |
| E2d | 140 | M11 genou, hanche, cheville | 5,7 × 10^−5° | 0 | 2,000° | oui |
| E2d | 140 | M12 ouverture du genou | 4,8 × 10^−6° | 45 | 3,000° | oui |
| E2d | 140 | M13 buste | 3,5 × 10^−6° | 20 | 1,000° | oui |
| E2d | 140 | M14 assise | 5,0 × 10^−8 cm | 113 | 0,500 cm | oui |
| E2d | 140 | M15 talon bas, pointe ouverte | 1,5 × 10^−6° | 39 | 2,000° | oui |
| E2d | 140 | M16 continuité : rotation des segments par image (Unreal ≤ O2 + 2°) | 7,9 × 10^−5° | 23 | 2,000° | oui |
| E2d | 140 | M16 continuité : à-coup (Unreal ≤ O2 + 2°) | 6,9 × 10^−5° | 79 | 2,000° | oui |
| E3 | 105 | M1 plante – point d’étrier, y et z | 1,1 × 10^−5 cm | 6 | 1,000 cm | oui |
| E3 | 105 | M2 écart latéral du pied | 5,8 × 10^−6 cm | 6 | 1,000 cm | oui |
| E3 | 105 | M6 portée de la jambe ρ | 5,2 × 10^−8 | 50 | 0,00500 | oui |
| E3 | 105 | M7 écarts au flanc (genou, tibia 35 et 65 %, cuisse 50 et 75 %) | 5,6 × 10^−5 cm | 64 | 1,000 cm | oui |
| E3 | 105 | M9 poignet au-dessus de l’encolure | 1,2 × 10^−7 cm | 67 | 1,000 cm | oui |
| E3 | 105 | M10 bras : allonge | 5,1 × 10^−7 | 52 | 1,0 × 10^−4 | oui |
| E3 | 105 | M10 bras : coude | 6,3 × 10^−4° | 0 | 2,000° | oui |
| E3 | 105 | M11 genou, hanche, cheville | 7,2 × 10^−5° | 50 | 2,000° | oui |
| E3 | 105 | M12 ouverture du genou | 4,4 × 10^−6° | 44 | 3,000° | oui |
| E3 | 105 | M13 buste | 3,2 × 10^−6° | 3 | 1,000° | oui |
| E3 | 105 | M14 assise | 4,9 × 10^−8 cm | 61 | 0,500 cm | oui |
| E3 | 105 | M15 talon bas, pointe ouverte | 1,5 × 10^−6° | 31 | 2,000° | oui |
| E3 | 105 | M16 continuité : rotation des segments par image (Unreal ≤ O2 + 2°) | 1,4 × 10^−4° | 41 | 2,000° | oui |
| E3 | 105 | M16 continuité : à-coup (Unreal ≤ O2 + 2°) | 6,4 × 10^−5° | 33 | 2,000° | oui |
| E3b | 109 | M1 plante – point d’étrier, y et z | 1,1 × 10^−5 cm | 27 | 1,000 cm | oui |
| E3b | 109 | M2 écart latéral du pied | 5,9 × 10^−6 cm | 5 | 1,000 cm | oui |
| E3b | 109 | M6 portée de la jambe ρ | 5,2 × 10^−8 | 50 | 0,00500 | oui |
| E3b | 109 | M7 écarts au flanc (genou, tibia 35 et 65 %, cuisse 50 et 75 %) | 5,1 × 10^−5 cm | 80 | 1,000 cm | oui |
| E3b | 109 | M9 poignet au-dessus de l’encolure | 3,8 × 10^−7 cm | 66 | 1,000 cm | oui |
| E3b | 109 | M10 bras : allonge | 5,8 × 10^−7 | 54 | 1,0 × 10^−4 | oui |
| E3b | 109 | M10 bras : coude | 6,3 × 10^−4° | 0 | 2,000° | oui |
| E3b | 109 | M11 genou, hanche, cheville | 7,2 × 10^−5° | 47 | 2,000° | oui |
| E3b | 109 | M12 ouverture du genou | 4,3 × 10^−6° | 13 | 3,000° | oui |
| E3b | 109 | M13 buste | 3,2 × 10^−6° | 1 | 1,000° | oui |
| E3b | 109 | M14 assise | 4,9 × 10^−8 cm | 93 | 0,500 cm | oui |
| E3b | 109 | M15 talon bas, pointe ouverte | 1,5 × 10^−6° | 12 | 2,000° | oui |
| E3b | 109 | M16 continuité : rotation des segments par image (Unreal ≤ O2 + 2°) | 7,5 × 10^−5° | 94 | 2,000° | oui |
| E3b | 109 | M16 continuité : à-coup (Unreal ≤ O2 + 2°) | 5,6 × 10^−5° | 73 | 2,000° | oui |

## M17 : phases du saut (images), Unreal contre O2

| Scénario | Phase | Unreal | O2 | Écart | Tenu (± 1) |
|---|---|---|---|---|---|
| E3 | appel | 41 | 41 | 0 | oui |
| E3 | sommet | 50 | 50 | 0 | oui |
| E3 | poserAnterieurs | 59 | 59 | 0 | oui |
| E3 | poserPosterieursRegle | 73 | 73 | 0 | oui |
| E3 | jumpK50Montee | 43 | 43 | 0 | oui |
| E3 | jumpKMax | 50 | 50 | 0 | oui |
| E3 | jumpK50Descente | 68 | 68 | 0 | oui |
| E3 | jumpK10Descente | 85 | 85 | 0 | oui |
| E3b | appel | 41 | 41 | 0 | oui |
| E3b | sommet | 52 | 52 | 0 | oui |
| E3b | poserAnterieurs | 63 | 63 | 0 | oui |
| E3b | poserPosterieursRegle | 76 | 76 | 0 | oui |
| E3b | jumpK50Montee | 44 | 44 | 0 | oui |
| E3b | jumpKMax | 52 | 52 | 0 | oui |
| E3b | jumpK50Descente | 72 | 72 | 0 | oui |
| E3b | jumpK10Descente | 88 | 88 | 0 | oui |

## Seuils absolus du niveau A : propriétés de la règle, mesurées sur Unreal et sur O2

Le plan demande aussi, au niveau A, M7 ≥ −1,0 cm, M9 ≥ 9,0 cm et M10 ≤ 0,97. Ces seuils portent sur la règle web
elle-même : O2 (anim.js inchangé, mêmes proportions) ne les tient pas toujours (transitions, réceptions). Le portage les
reproduit à l’identique ; ils sont donc rapportés ici, pas comptés comme écart du portage.

| Scénario | M7 min Unreal | M7 min O2 | M9 min Unreal | M9 min O2 | M10 max Unreal | M10 max O2 |
|---|---|---|---|---|---|---|
| E1 | 0,609 cm | 0,609 cm | 17,878 cm | 17,878 cm | 0,97000 | 0,97000 |
| E1b | -8,213 cm | -8,213 cm | 9,458 cm | 9,458 cm | 0,97000 | 0,97000 |
| E2g | -23,071 cm | -23,071 cm | 9,028 cm | 9,028 cm | 0,97000 | 0,97000 |
| E2d | -11,093 cm | -11,093 cm | 9,159 cm | 9,159 cm | 0,97000 | 0,97000 |
| E3 | -10,181 cm | -10,181 cm | 7,091 cm | 7,091 cm | 0,97000 | 0,97000 |
| E3b | -10,355 cm | -10,355 cm | 9,220 cm | 9,220 cm | 0,97000 | 0,97000 |

Verdict : toutes les tolérances du niveau A sur l’écart à O2 sont tenues.
