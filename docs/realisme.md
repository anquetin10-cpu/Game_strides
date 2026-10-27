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
| Galop allongé (joystick à fond) | jusqu'à 9,7 m/s (35 km/h, 583 m/min) ; la poussée du joystick règle la cadence entre 23 et 35 km/h, sans consommer l'endurance (récupération réduite de moitié) | galop de cross : 520 – 570 m/min | conforme | `realism.test.js`, `boost.mjs` |
| Grand galop | 14 m/s (50 km/h) | cheval de sport : 45 – 55 km/h | conforme | `realism.test.js` |
| Seuils d'allure (affichage et animation) | pas < 3,2 m/s ≤ trot < 5,6 ≤ galop < 10,5 ≤ grand galop : chaque vitesse d'allure est montrée comme cette allure (joystick poussé = galop de 23 à 35 km/h, BOOST = grand galop) | transitions réelles trot → galop vers 5 – 6 m/s | conforme | `realism.test.js` |
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

## 2 bis. Autres véhicules (tous conduisibles)

Copies de modèles de série courants (sans logo ni nom de marque dans le jeu), dans leurs teintes d'origine : voitures
garées en ville, SUV 4x4 et tracteur de l'Écurie du Val, voitures de la circulation arrêtées (on en prend le volant) : même modèle physique que le camion (moteur et courbe de couple, boîte automatique, embrayage au démarrage,
frein moteur, pneus à adhérence limitée, direction asservie à la vitesse, épure d'Ackermann), roues motrices et
directrices animées, suspension (plongée au freinage, roulis en virage), feux stop et de recul, phares la nuit, vitrage
teinté laissant voir le conducteur et l'habitacle, son moteur propre (3 cylindres essence, diesel, tracteur).

| Véhicule | Jeu | Référence réelle | Statut | Vérification |
| --- | --- | --- | --- | --- |
| Citadine (copie d'une Clio V) | 4,05 m, empattement 2,583 m, 1,44 m, 1,798 m, 195/55 R16 ; 1.0 3 cylindres 90 ch, 160 N·m, 5 rapports : 0-100 km/h en 10,8 – 13,8 s, 168 – 182 km/h ; optiques en « C » | fiche Clio V TCe 90 : 12,2 s, 178 km/h | conforme | `vehicles.test.js` |
| Compacte (copie d'une Golf 8) | 4,284 m, empattement 2,636 m, 1,456 m, 1,789 m, 205/55 R16 ; 1.5 essence 130 ch, 200 N·m, 6 rapports : 0-100 km/h en 8,2 – 10,4 s, 200 – 218 km/h ; large montant arrière, bandeau lumineux | fiche constructeur : 9,2 s, 214 km/h | conforme | `vehicles.test.js` |
| Berline (copie d'une 508 II) | 4,75 m, empattement 2,793 m, 1,403 m, 1,859 m, 235/45 R18 ; 1.5 diesel 130 ch, 300 N·m, automatique 8 : 0-100 km/h en 9 – 11,4 s, 198 – 212 km/h ; feux de jour « crocs », bandeau arrière noir à 3 griffes | fiche BlueHDi 130 EAT8 : 10 s | conforme | `vehicles.test.js` |
| SUV (copie d'un 3008 II) | 4,447 m, empattement 2,675 m, porte-à-faux 0,923 / 0,849 m, 1,624 m, 1,841 m, 225/55 R18 ; 1.5 diesel 130 ch, automatique 8 : 0-100 km/h en 10,2 – 12,8 s, 182 – 196 km/h ; toit noir, calandre à damier, feux à griffes | fiche constructeur : 192 km/h | conforme | `vehicles.test.js` |
| SUV 4x4 (copie d'un Duster II) | 4,341 m, empattement 2,676 m, porte-à-faux 0,822 / 0,843 m, 1,682 m, 1,804 m, 215/60 R17 ; 1.5 diesel 115 ch, 260 N·m, 6 rapports, 4 roues motrices : 0-100 km/h en 10,2 – 13,2 s ; barres de toit, sabots, protections | fiche Blue dCi 115 | conforme | `vehicles.test.js` |
| Tracteur | 110 ch, 480 N·m, 5,6 t avec chargeur, inverseur et 6 rapports sous charge, 40 km/h | tracteur 110 ch : 40 km/h homologué | conforme | `vehicles.test.js` |
| Freinage des voitures | 100 → 0 km/h en 37 – 47 m (freins hydrauliques, ABS) | 35 – 45 m sur sec | conforme | `vehicles.test.js` |
| Braquage | rayon 4,5 – 6 m (empattement 2,5 – 2,75 m) | diamètre de braquage 10 – 11,5 m | conforme | `vehicles.test.js` |
| Monter / sortir | bouton ACTION « Conduire » à la portière, « Sortir » à l'arrêt ; missions du camion réservées au camion Strides | — | conforme | `vehicles.mjs` |

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
| Marnage | niveau de la mer du jeu = hauteur d'eau réelle (une seule source : `tideLevel`, affichée par l'app Météo au-dessus du zéro des cartes de Trouville-Deauville) : 7,1 m en vives-eaux (PM 7,9 m, BM 0,85 m), 3,7 m en mortes-eaux. Plage raccourcie de moitié à la demande du porteur du projet (26/10/2026) : haut de plage sec à 4 % du perré à la berme (z ≈ -388), devant les Planches et les parasols, estran concave de 12 % à 5,4 % ; la mer avance et recule de ~80 m en vives-eaux (rivage de z ≈ -390 à -470), ~40 m en mortes-eaux ; à la plus haute mer, il reste ~12 m de sable sec devant les Planches | ~7 m en vives-eaux ; estran de Deauville de 1 à 2 %, mer qui recule de plusieurs centaines de mètres | conforme pour les hauteurs d'eau ; **adapté** pour la pente de l'estran (~9 % en moyenne au lieu de 1 – 2 %) — choix du porteur du projet (plage moins large) | `realism.test.js`, `weather.test.js`, `coast.mjs` |
| Températures | fin d'été normand, de 12 à 25 °C, plus chaud l'après-midi, sans saut à minuit | normales de la Côte Fleurie | conforme | `weather.test.js` |
| Pluie, vent | averses les jours couverts, vent d'ouest dominant, nuages poussés par le vent | climat océanique | conforme | `weather.test.js` |
| Soleil | position astronomique réelle (algorithme de la NOAA : déclinaison, équation du temps) à Deauville (49,36° N, 0,07° E) le 23 août, heure légale d'été : lever 7 h 01 à l'est-nord-est, midi solaire 14 h 03 plein sud à 52°, coucher 21 h 04 à l'ouest-nord-ouest ; ombres, ciel et éclairage suivent cette course ; lever et coucher affichés dans l'app Météo | Deauville fin août : ~14 h de jour, culmination ~52° | conforme | `realism.test.js`, `sun.js` |
| Rendu | ciel physique, éclairage par l'environnement, ombres douces, matériaux physiques, terrain (herbe, terre, sable hersé, graviers, estran mouillé, flaques) | — | appréciation visuelle sur captures | `look.mjs` |
| Durée d'une journée | au choix dans Réglages : « Réel · 24 h » ou « Jeu · 1 jour = 20 min » (par défaut) | 24 h | conforme en mode réel | `game.js`, Réglages |
| Étendue du monde | 1,2 km × 1,2 km | Côte Fleurie : une vingtaine de kilomètres | **adapté** (compression des distances) — validé par le porteur du projet (26/10/2026 : monde conservé à 1,2 km pour la fluidité sur iPhone) | `layout.js` |

## 5. Écarts restants (contraintes physiques)

1. **Pente de l'estran** : la mer du jeu monte et descend de la hauteur réelle (7,1 m en vives-eaux, 3,7 m en
   mortes-eaux) et découvre ~80 m d'estran en vives-eaux (~40 m en mortes-eaux) ; à Deauville, la plage descend
   de 1 à 2 % et la mer recule de plusieurs centaines de mètres. À la demande du porteur du projet (26/10/2026), la
   plage a été raccourcie de moitié (toutes les distances au-delà du perré × 0,5) : l'estran du jeu est donc pentu
   (12 % en haut, 5,4 % en bas, ~9 % en moyenne). Le haut de plage reste sec à toutes les marées (parasols, poste de
   secours, au moins 0,3 m au-dessus de la plus haute mer) et la basse mer de vives-eaux reste dans le monde
   (z ≈ -475 au plus loin). Les anneaux du
   « Galop sur la plage » et du « Sprint de la plage » sont posés au départ sur le sable ferme, au bord de l'eau
   selon la marée prévue au passage (temps imparti allongé à marée basse) ; les bateaux mouillent au-delà des plus
   basses mers. Comme la journée de jeu dure 20 min par défaut, la mer se déplace vite (jusqu'à ~0,7 m/s) ; en mode
   « temps réel », à la vitesse réelle.
2. **Étendue du monde** de 1,2 km : la Côte Fleurie réelle s'étend sur une vingtaine de kilomètres ; un monde à cette
   échelle dépasserait la mémoire et l'autonomie d'un iPhone dans un navigateur.

**Non vérifié** : le rendu et la fluidité sur iPhone physique (les captures sont faites dans Chromium avec un rendu
logiciel).
