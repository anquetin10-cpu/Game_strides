# STRIDES Grand Tour — audit de réalisme (26 octobre 2026)

Objectif fixé : « une version très réaliste, avec un niveau de détail proche du réel, proche d'une simulation pour
tout le jeu ; pouvoir mettre le cheval dans le camion Strides pour aller à une compétition ». Ce document confronte
les grandeurs du jeu aux valeurs réelles. Pour chaque ligne, il indique si la valeur est conforme, ou adaptée pour
le jeu (écart assumé, imposé par une contrainte physique), et quel test automatique la vérifie. Les grandeurs
chiffrées sont vérifiées par `tests/unit/realism.test.js`.

## 1. Cheval

| Grandeur | Jeu | Référence réelle | Statut | Vérification |
| --- | --- | --- | --- | --- |
| Pas | 1,9 m/s (6,8 km/h) | 1,5 – 1,9 m/s (5,5 – 7 km/h) | conforme | `config.js`, `horse.test.js` |
| Trot | 4,6 m/s (16,6 km/h) | 3,3 – 5 m/s (12 – 18 km/h) | conforme | idem |
| Galop de travail | 6,5 m/s (390 m/min, 23 km/h) | parcours de CSO : 350 – 400 m/min | conforme | `realism.test.js` |
| Grand galop | 14 m/s (50 km/h) | cheval de sport : 45 – 55 km/h | conforme | `realism.test.js` |
| Seuils d'allure (affichage et animation) | pas < 3,2 m/s ≤ trot < 5,6 ≤ galop < 10,5 ≤ grand galop : chaque vitesse d'allure est montrée comme cette allure (joystick à fond = galop, BOOST = grand galop) | transitions réelles trot → galop vers 5 – 6 m/s | conforme | `realism.test.js` |
| Ordre des posers | pas à 4 temps, trot diagonal, galop à 3 temps + suspension | idem | conforme | `horse.test.js` (« pose les sabots dans l'ordre réel de chaque allure ») |
| Fréquence cardiaque | 36 bpm au repos, ~185 bpm à 11 m/s, ~205 bpm à 14 m/s | repos 28 – 44 bpm ; effort maximal 200 – 240 bpm | conforme | `condition.test.js` |
| Récupération | chute rapide jusqu'à ~120 bpm, puis lente (< 64 bpm en une dizaine de minutes) | idem chez un cheval entraîné | conforme | `condition.test.js` |
| Besoins | énergie, température, sudation, hydratation, alimentation, propreté, pieds ; malus de performance | facteurs réels de la condition du cheval | conforme (modèle simplifié) | `condition.test.js`, `care.mjs` |

## 2. Camion Strides et transport

| Grandeur | Jeu | Référence réelle | Statut | Vérification |
| --- | --- | --- | --- | --- |
| Véhicule | porteur 7,5 t, 5,5 t à vide, 600 kg par cheval | camion 2 chevaux de 7,5 t | conforme | `truck.test.js` |
| Moteur | diesel 5,1 l, 210 ch, 750 N·m de 1 200 à 1 700 tr/min, 6 rapports | gamme 7,5 t courante | conforme | « courbe de couple diesel réaliste », « accélère et monte les rapports » |
| Vitesse maximale | limiteur 90 km/h | limiteur réglementaire des plus de 3,5 t | conforme | `truckPhysics.js` |
| Freinage | 6,8 m/s² au maximum | 6 – 8 m/s² pour un poids lourd | conforme | « freine de 50 km/h sur une distance plausible » |
| Braquage | empattement 4,2 m, 38° aux roues, épure d'Ackermann | porteur de 7,5 t | conforme | `truck.test.js` |
| Chargement | rampe, portillons, cheval mené en main, attache au box, confort du cheval pendant le trajet | gestes réels du transport | conforme | `transport-flow.mjs` (65 vérifications), `chapter1.mjs` |
| Aller en concours | charger, rouler, se garer, décharger, retirer le dossard, s'échauffer, concourir, rentrer | déroulé réel d'un concours | conforme | `transport-flow.mjs` (partie concours), `chapter1.mjs` (M3) |

## 3. Épreuves

| Grandeur | Jeu | Référence réelle | Statut | Vérification |
| --- | --- | --- | --- | --- |
| Barème A au chrono (CSO) | barre 4 pts, 1er refus 4 pts, 2e refus éliminatoire, 1 pt par seconde entamée au-delà du temps accordé, classement aux pénalités puis au temps | règlement de saut d'obstacles | conforme | `challenge.test.js`, `courses.js` |
| Hauteurs CSO | Amateur 1,00 – 1,20 m ; Pro 2 1,20 – 1,30 m ; qualificative CSI 1,35 – 1,45 m ; Grand Prix CSI 5* 1,50 – 1,60 m | mêmes paliers | conforme ; avertissement avant le départ si le couple cheval + équipement ne peut pas atteindre la hauteur | `realism.test.js`, `courses.js` |
| Temps accordé | longueur du parcours du Pôle (245 m, tracé à main gauche, tournants de 8,5 m de rayon au moins) ÷ vitesse imposée : 42 s en national (350 m/min), 40 s en CSI (375), 37 s en Grand Prix (400) ; défi du Pôle v3 à 42 s (v1 à 75 s et v2 à 47 s archivées avec leurs records) | règlement : vitesse imposée selon l'épreuve | conforme | `realism.test.js` |
| Cross | refus 20 pts, élimination au 3e refus sur un obstacle ou au 4e sur le parcours | règlement de concours complet : 20 / 40 pts, élimination au 3e refus | conforme (barème simplifié) | `courses.js` |

## 4. Monde, météo, marées, lumière

| Grandeur | Jeu | Référence réelle | Statut | Vérification |
| --- | --- | --- | --- | --- |
| Marée | onde semi-diurne (12 h 25), vives-eaux / mortes-eaux sur 14,8 jours, coefficients 20 – 120, tenue du plein (baie de Seine) | mêmes phénomènes | conforme (forme) | `weather.test.js` |
| Marnage | niveau de la mer du jeu = hauteur d'eau réelle (une seule source : `tideLevel`, affichée par l'app Météo au-dessus du zéro des cartes de Trouville-Deauville) : 7,1 m en vives-eaux (PM 7,9 m, BM 0,85 m), 3,7 m en mortes-eaux. Plage remodelée : haut de plage sec à 2 % au pied des Planches, estran concave de 6 % à 2,7 % ; la mer avance et recule de ~160 m en vives-eaux (rivage de z ≈ -415 à -575), ~77 m en mortes-eaux ; à la plus haute mer, l'eau reste à ~37 m des Planches | ~7 m en vives-eaux ; estran de Deauville de 1 à 2 %, mer qui recule de plusieurs centaines de mètres | conforme pour les hauteurs d'eau ; **adapté** pour la pente de l'estran (~4,5 % en moyenne au lieu de 1 – 2 % : le monde s'arrête 225 m au-delà des Planches) | `realism.test.js`, `weather.test.js`, `coast.mjs` |
| Températures | fin d'été normand, de 12 à 25 °C, plus chaud l'après-midi, sans saut à minuit | normales de la Côte Fleurie | conforme | `weather.test.js` |
| Pluie, vent | averses les jours couverts, vent d'ouest dominant, nuages poussés par le vent | climat océanique | conforme | `weather.test.js` |
| Soleil | culmine vers 52°, lever ~6 h 30, coucher ~20 h 30 | fin août à 49,4° N : ~50°, ~6 h 55 / ~20 h 45 | conforme (approché) | `sky.js` |
| Rendu | ciel physique, éclairage par l'environnement, ombres douces, matériaux physiques, terrain (herbe, terre, sable hersé, graviers, estran mouillé, flaques) | — | appréciation visuelle sur captures | `look.mjs` |
| Durée d'une journée | au choix dans Réglages : « Réel · 24 h » ou « Jeu · 1 jour = 20 min » (par défaut) | 24 h | conforme en mode réel | `game.js`, Réglages |
| Étendue du monde | 1,2 km × 1,2 km | Côte Fleurie : une vingtaine de kilomètres | **adapté** (compression des distances) | `layout.js` |

## 5. Écarts restants (contraintes physiques)

1. **Pente de l'estran** : la mer du jeu monte et descend de la hauteur réelle (7,1 m en vives-eaux, 3,7 m en
   mortes-eaux) et découvre ~160 m d'estran en vives-eaux (~77 m en mortes-eaux) ; à Deauville, la plage descend
   de 1 à 2 % et la mer recule de plusieurs centaines de mètres. Il faudrait 400 à 500 m de plage, or le monde
   s'arrête 225 m au-delà des Planches : l'estran du jeu est donc plus pentu (6 % en haut, 2,7 % en bas, ~4,5 % en
   moyenne). Le haut de plage reste sec à toutes les marées (parasols, poste de secours, au moins 0,3 m au-dessus de
   la plus haute mer) et la basse mer de vives-eaux reste dans le monde (z ≈ -577 au plus loin). Les anneaux du
   « Galop sur la plage » et du « Sprint de la plage » sont posés au départ sur le sable ferme, au bord de l'eau
   selon la marée prévue au passage (temps imparti allongé à marée basse) ; les bateaux mouillent au-delà des plus
   basses mers. Comme la journée de jeu dure 20 min par défaut, la mer se déplace vite (jusqu'à ~0,7 m/s) ; en mode
   « temps réel », à la vitesse réelle.
2. **Étendue du monde** de 1,2 km : la Côte Fleurie réelle s'étend sur une vingtaine de kilomètres ; un monde à cette
   échelle dépasserait la mémoire et l'autonomie d'un iPhone dans un navigateur.

**Non vérifié** : le rendu et la fluidité sur iPhone physique (les captures sont faites dans Chromium avec un rendu
logiciel).
