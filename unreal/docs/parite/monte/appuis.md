# Appuis du cheval : web, cheval Unreal avant (vue du jeu) et après (vue du web portée)

Écrit par `scripts/unreal/horse-view-appuis.py` (jamais à la main) à partir de l’oracle `unreal/core/tests/oracles/monte/vue/` (jeu web) et de l’export de `Strides.Parite.HorseView` (cheval Unreal à la taille du web, mêmes entrées du cheval du jeu, même repère du cheval, même sol). sabot au sol à moins de 0.035 m de son point le plus bas du scénario ; appariement à 8 images au plus. Écarts d’instant en images (1/30 s), de position en cm (repère du cheval, x et z).

## Ensemble

| Source | Événements du web | Appariés | Instant exact | Écart moyen (images) | Écart max (images) | Position moyenne (cm) | Position max (cm) |
|---|---|---|---|---|---|---|---|
| avant (vue du jeu) | 659 | 298 | 17 | 3,84 | 8 | 25,1 | 101,4 |
| avant (vue du jeu) posers | 323 | 141 | 9 | 3,79 | 8 | 24,3 | 82,1 |
| avant (vue du jeu) levers | 336 | 157 | 8 | 3,88 | 8 | 25,7 | 101,4 |
| après (vue du web) | 659 | 649 | 632 | 0,03 | 2 | 1,2 | 35,2 |
| après (vue du web) posers | 323 | 318 | 313 | 0,02 | 1 | 1,0 | 28,2 |
| après (vue du web) levers | 336 | 331 | 319 | 0,04 | 2 | 1,4 | 35,2 |

## Par scénario

| Scénario | Images | Avant : appariés / web, écart moyen (images), position moyenne (cm) | Après : idem | Corps après : Δ hauteur max (cm), Δ bascule max (°), Δ inclinaison max (°) | Web : inclinaison max (°), bascule max (°) |
|---|---|---|---|---|---|
| E1 | 65 | 0 / 0, —, — | 0 / 0, —, — | 0,00, 0,00, 0,000 | 0,00, 0,00 |
| E1b | 130 | 23 / 32, 4,35, 29,8 | 32 / 32, 0,03, 0,8 | 0,00, 0,00, 0,000 | 6,56, 0,00 |
| E2g | 140 | 16 / 64, 4,19, 26,0 | 58 / 64, 0,00, 0,8 | 0,00, 0,00, 0,000 | 12,89, 0,00 |
| E2d | 140 | 26 / 60, 4,58, 25,1 | 60 / 60, 0,03, 1,2 | 0,00, 0,00, 0,000 | 12,89, 0,00 |
| E3 | 105 | 20 / 29, 3,25, 15,9 | 29 / 29, 0,00, 0,9 | 0,31, 0,14, 0,000 | 0,00, 8,93 |
| E3b | 109 | 8 / 31, 2,12, 27,7 | 31 / 31, 0,00, 1,0 | 0,35, 0,03, 0,000 | 0,00, 0,47 |
| E6t | 120 | 24 / 40, 3,88, 12,3 | 40 / 40, 0,03, 1,1 | 0,00, 0,00, 0,000 | 6,43, 0,00 |
| E6v | 120 | 30 / 54, 3,63, 22,6 | 54 / 54, 0,09, 2,1 | 0,00, 0,00, 0,000 | 12,89, 0,00 |
| V2g-trot | 140 | 26 / 47, 4,96, 23,0 | 47 / 47, 0,04, 1,2 | 0,00, 0,00, 0,000 | 12,89, 0,00 |
| V2d-trot | 140 | 21 / 56, 3,67, 29,4 | 54 / 56, 0,06, 1,4 | 0,00, 0,00, 0,000 | 12,89, 0,00 |
| V2g-gg | 170 | 21 / 52, 4,05, 31,1 | 52 / 52, 0,04, 1,8 | 0,00, 0,00, 0,000 | 12,89, 0,00 |
| V2d-gg | 170 | 32 / 50, 4,16, 27,6 | 50 / 50, 0,00, 0,7 | 0,00, 0,00, 0,000 | 12,89, 0,00 |
| V3d | 105 | 16 / 23, 3,56, 31,5 | 23 / 23, 0,00, 1,1 | 0,43, 0,17, 0,000 | 0,00, 6,86 |
| V3bd | 109 | 8 / 31, 2,62, 39,6 | 31 / 31, 0,00, 1,1 | 0,47, 0,07, 0,000 | 0,00, 0,43 |
| V3c | 108 | 6 / 29, 2,50, 25,3 | 27 / 29, 0,07, 1,9 | 0,66, 0,16, 0,000 | 0,00, 3,09 |
| V3cd | 108 | 6 / 20, 2,00, 25,8 | 20 / 20, 0,00, 1,0 | 0,79, 0,04, 0,000 | 0,00, 1,78 |
| V3e | 108 | 15 / 41, 3,00, 21,3 | 41 / 41, 0,00, 0,9 | 0,43, 0,14, 0,000 | 0,00, 1,29 |

## Sauts : posers des postérieurs après la réception

| Scénario | Pied | Web (image) | Avant (écart) | Après (écart) |
|---|---|---|---|---|
| E3 | PG | 18 | 5 im., 6,0 cm | 0 im., 0,8 cm |
| E3 | PG | 33 | non apparié | 0 im., 0,7 cm |
| E3 | PG | 81 | 0 im., 1,4 cm | 0 im., 0,7 cm |
| E3 | PG | 96 | 6 im., 8,4 cm | 0 im., 0,8 cm |
| E3 | PD | 2 | 0 im., 12,0 cm | 0 im., 0,9 cm |
| E3 | PD | 18 | 5 im., 7,8 cm | 0 im., 1,2 cm |
| E3 | PD | 34 | non apparié | 0 im., 1,3 cm |
| E3 | PD | 81 | 0 im., 1,0 cm | 0 im., 1,1 cm |
| E3 | PD | 96 | 7 im., 5,1 cm | 0 im., 1,2 cm |
| E3b | PG | 13 | non apparié | 0 im., 0,6 cm |
| E3b | PG | 25 | non apparié | 0 im., 0,6 cm |
| E3b | PG | 38 | non apparié | 0 im., 0,9 cm |
| E3b | PG | 75 | non apparié | 0 im., 0,6 cm |
| E3b | PG | 88 | non apparié | 0 im., 0,7 cm |
| E3b | PG | 103 | non apparié | 0 im., 0,8 cm |
| E3b | PD | 2 | non apparié | 0 im., 1,1 cm |
| E3b | PD | 14 | non apparié | 0 im., 1,3 cm |
| E3b | PD | 26 | non apparié | 0 im., 1,3 cm |
| E3b | PD | 38 | non apparié | 0 im., 1,3 cm |
| E3b | PD | 88 | 2 im., 15,8 cm | 0 im., 1,1 cm |
| E3b | PD | 103 | non apparié | 0 im., 1,2 cm |
| V3d | PG | 15 | 8 im., 6,5 cm | 0 im., 0,7 cm |
| V3d | PG | 30 | -7 im., 13,7 cm | 0 im., 0,6 cm |
| V3d | PG | 78 | 3 im., 9,5 cm | 0 im., 0,6 cm |
| V3d | PG | 93 | non apparié | 0 im., 0,7 cm |
| V3d | PD | 2 | 0 im., 33,3 cm | 0 im., 0,6 cm |
| V3d | PD | 18 | 5 im., 52,2 cm | 0 im., 0,6 cm |
| V3d | PD | 34 | non apparié | 0 im., 1,0 cm |
| V3d | PD | 82 | -1 im., 37,5 cm | 0 im., 1,0 cm |
| V3d | PD | 96 | 7 im., 65,0 cm | 0 im., 0,6 cm |
| V3bd | PG | 11 | non apparié | 0 im., 0,6 cm |
| V3bd | PG | 23 | non apparié | 0 im., 0,6 cm |
| V3bd | PG | 35 | non apparié | 0 im., 0,6 cm |
| V3bd | PG | 73 | non apparié | 0 im., 0,8 cm |
| V3bd | PG | 85 | non apparié | 0 im., 0,6 cm |
| V3bd | PG | 100 | non apparié | 0 im., 0,7 cm |
| V3bd | PD | 2 | non apparié | 0 im., 0,9 cm |
| V3bd | PD | 14 | non apparié | 0 im., 0,9 cm |
| V3bd | PD | 26 | non apparié | 0 im., 0,9 cm |
| V3bd | PD | 38 | non apparié | 0 im., 0,9 cm |
| V3bd | PD | 76 | -7 im., 59,4 cm | 0 im., 0,7 cm |
| V3bd | PD | 89 | 1 im., 53,7 cm | 0 im., 1,0 cm |
| V3bd | PD | 104 | non apparié | 0 im., 0,8 cm |
| V3c | PG | 16 | non apparié | 0 im., 0,7 cm |
| V3c | PG | 31 | non apparié | 0 im., 0,8 cm |
| V3c | PG | 40 | non apparié | non apparié |
| V3c | PG | 80 | non apparié | 0 im., 0,7 cm |
| V3c | PG | 95 | non apparié | 0 im., 0,7 cm |
| V3c | PD | 3 | non apparié | -1 im., 20,7 cm |
| V3c | PD | 17 | non apparié | 0 im., 1,3 cm |
| V3c | PD | 31 | non apparié | 0 im., 1,3 cm |
| V3c | PD | 40 | non apparié | 0 im., 0,4 cm |
| V3c | PD | 81 | 4 im., 2,6 cm | 0 im., 1,3 cm |
| V3c | PD | 96 | non apparié | 0 im., 1,3 cm |
| V3cd | PG | 1 | non apparié | 0 im., 1,1 cm |
| V3cd | PG | 40 | non apparié | 0 im., 0,6 cm |
| V3cd | PG | 76 | non apparié | 0 im., 1,0 cm |
| V3cd | PD | 2 | non apparié | 0 im., 0,7 cm |
| V3cd | PD | 17 | non apparié | 0 im., 1,0 cm |
| V3cd | PD | 31 | non apparié | 0 im., 0,7 cm |
| V3cd | PD | 81 | 4 im., 61,4 cm | 0 im., 0,6 cm |
| V3cd | PD | 96 | non apparié | 0 im., 0,9 cm |
| V3e | PG | 14 | non apparié | 0 im., 0,7 cm |
| V3e | PG | 27 | non apparié | 0 im., 0,8 cm |
| V3e | PG | 39 | non apparié | 0 im., 0,7 cm |
| V3e | PG | 89 | non apparié | 0 im., 0,7 cm |
| V3e | PG | 104 | non apparié | 0 im., 0,7 cm |
| V3e | PD | 2 | non apparié | 0 im., 1,0 cm |
| V3e | PD | 14 | non apparié | 0 im., 1,1 cm |
| V3e | PD | 27 | non apparié | 0 im., 1,3 cm |
| V3e | PD | 39 | non apparié | 0 im., 1,1 cm |
| V3e | PD | 76 | non apparié | 0 im., 1,5 cm |
| V3e | PD | 90 | -2 im., 1,3 cm | 0 im., 1,3 cm |
| V3e | PD | 104 | non apparié | 0 im., 1,1 cm |
