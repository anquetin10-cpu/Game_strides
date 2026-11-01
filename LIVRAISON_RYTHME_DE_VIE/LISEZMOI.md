# Rythme de vie : fatigue, jour et nuit, maison, café

Objectif : travailler la journée, se fatiguer, rentrer se reposer, puis repartir le lendemain.

À lire avant tout :

- **Aucun essai sur un iPhone réel.** Tout a été joué dans Chromium en rendu logiciel (SwiftShader), avec
  l'émulation d'un iPhone 13 en paysage (844 × 390, tactile). La vidéo est l'image du jeu, à 15 images par seconde.
- **La version publique n'a pas changé.** Elle reste sur la version auditée b4796e7. Rien ne sera publié sans votre
  accord et le circuit de validation du projet.
- **Le travail est sur la branche `claude/strides-grand-tour`.** Aucune partie existante n'est effacée. Les
  anciennes sauvegardes se chargent normalement : l'énergie part à 100 %.

## 1. Ce que voit le joueur

| Où | Quoi |
|---|---|
| HUD, portefeuille en haut à droite | La période (Matin, Après-midi, Soir, Nuit) avec son pictogramme, l'heure, et une jauge d'énergie en pourcentage. La jauge est verte, puis dorée, orange et rouge. Toucher la jauge ouvre la fiche Énergie. |
| Fiche Énergie | Le niveau, les effets du moment, et ce que rapportent une nuit, une sieste et un café. Elle compte les cafés et les siestes du jour, et propose un bouton « Itinéraire vers la maison ». |
| Messages | Ils arrivent une seule fois par palier et par journée : un léger à 60 %, un plus net à 35 %, et une notification « Épuisement » sous 15 %, avec « Itinéraire vers la maison ». Le soir, un rappel discret signale que le lit attend. |
| Téléphone, app Strides | Chaque demande affiche ses horaires et son effort (léger, normal ou important, avec le coût en énergie). Une demande indisponible porte la mention « HORS HORAIRES » ou « TROP FATIGANT » et la raison en clair, et n'a pas de bouton Accepter. La nuit, une note indique que les clients rappelleront demain matin. |
| Maison de l'Écurie du Val | On y entre par « Entrer » à la porte sur la cour. Elle comprend un salon, une cuisine, une chambre et une salle de bain. Dans la chambre, « Se coucher » ouvre le menu du lit. |
| Café-boulangerie Le Galop | « Prendre un café » coûte 1,80 €. Le gain d'énergie s'affiche avant de commander. |

Captures : `captures/01` à `18` (voir § 9).

## 2. Heure et périodes

- L'heure avance comme avant : une journée dure 20 minutes en mode « Jeu », ou 24 heures en mode « Réel » (Réglages).
- Les périodes sont : matin de 6 h à 12 h, après-midi de 12 h à 18 h, soir de 18 h à 22 h, nuit de 22 h à 6 h.
- Rien ne s'écoule quand le jeu est suspendu : téléphone, carte, menu ou dialogue ouverts, ou pause.

## 3. Énergie (de 0 à 100 %)

### Dépense

La dépense se calcule par heure de jeu, d'après l'heure qui passe vraiment.

| Activité | Points par heure de jeu (de jour) |
|---|---|
| Éveillé, immobile | 2,0 |
| Marche | 2,1 |
| Course à pied | 2,8 |
| Sprint | 3,5 |
| À cheval, pas ou trot | 2,4 |
| À cheval, galop | 2,8 |
| À cheval, grand galop | 3,5 |
| Au volant | 2,4 |

- La nuit (22 h à 6 h), tout est multiplié par 1,5.
- Un saut de temps sans sommeil (trajet de 2 h 10 vers Paris, attente d'une épreuve) compte au tarif de base, sur
  6 h au plus.
- Une mission terminée coûte 3 points si l'effort est léger, 5 s'il est normal, 8 s'il est important. Une mission
  échouée ou abandonnée en coûte la moitié.
- Les défis rejouables et les entraînements ne coûtent rien : ce sont des modes de jeu à part.

### Paliers et effets

Les effets sont légers et ne s'appliquent jamais pendant une épreuve de concours.

| Palier | Effets |
|---|---|
| En forme (60 % et plus) | Aucun. |
| Légère fatigue (35 à 60 %) | Avertissement léger seulement. |
| Fatigue (15 à 35 %) | Course à pied −5 %, sprint −10 %. |
| Épuisement (moins de 15 %) | Course −10 %, sprint −20 %, cheval monté −7 % en monde ouvert. Les missions exigeantes (concours, transports, longues missions) ne peuvent plus être acceptées. Les missions légères et normales restent possibles. |

### Équilibrage

Ces chiffres sont mesurés dans le jeu, avec le test `life-rhythm`.

- Une journée de 7 h à 23 h sans activité fait passer l'énergie de 100 % à 67 %. La baisse est régulière, de 2 points
  par heure : jamais de chute brutale.
- Au galop toute la journée, de 7 h à 18 h, on reste « en forme ». Il faut plus de 9 minutes réelles de galop
  continu pour perdre 40 points.
- Une journée de travail normale (galop et trois missions) laisse environ 40 à 50 % le soir.
- Une nuit blanche fait tomber à « Fatigue ». Deux journées sans dormir mènent à l'épuisement.
- On n'a donc pas besoin de dormir souvent : une nuit par journée de jeu suffit, soit environ toutes les 20 minutes
  réelles.

## 4. Repos

| Action | Où et quand | Effet |
|---|---|---|
| **Dormir jusqu'au matin** | Au lit, de 19 h à 7 h | Réveil à 7 h. L'énergie remonte à 100 % après 6 h de sommeil ou plus. Avec moins de 6 h, elle remonte de 14 points par heure dormie : un coucher à 3 h donne 20 % → 76 %. |
| **Passer à la journée suivante** | Au lit, de 7 h à 19 h | Fin de la journée et réveil le lendemain à 7 h, avec 100 %. |
| **Faire une sieste** | Au lit, à toute heure | 1 h 30 plus tard. Gain de +25, puis +15, puis +8 depuis la dernière nuit, sans jamais dépasser 80 %. Une sieste ne vaut pas une nuit. |
| **Prendre un café** | Le Galop, en ville, 1,80 € | Gain de +12, puis +7, puis +3, puis plus rien avant la nuit suivante, sans jamais dépasser 70 %. Le café crème a le même effet. Trois cafés ne remplacent pas une nuit : partant de 10 %, on plafonne à 32 %. |

Après une nuit, ou une fin de journée :

- une carte « Bonjour ! » indique la durée dormie et l'énergie avant et après ;
- le cheval a récupéré aussi ;
- les cafés et les siestes retrouvent leur effet ;
- la partie est enregistrée tout de suite ;
- la météo et la lumière sont recalées sur la nouvelle heure.

Garde-fous :

- On ne peut pas se coucher pendant une mission. Exception : un concours du Pôle engagé, en attendant l'heure de
  passage.
- On ne peut pas non plus dormir si le sommeil ferait manquer ce passage. L'heure de passage est maintenant
  enregistrée en absolu, ce qui corrige aussi le « en retard ! » ambigu après 12 h.

## 5. La maison de l'Écurie du Val

- **Bâtiment** : une longère enduite de 18,4 × 8,6 m (l'ancienne maison mesurait 13 × 9 m et n'avait pas
  d'intérieur).
  - Façade : vraies ouvertures, volets, lucarnes, cheminée et lanterne.
  - Le soir, les fenêtres sont éclairées.
  - Porte côté cour.
- **Pièces** :
  - Salon (entrée) : cheminée, bibliothèque, canapé, flots, vitrine à trophées.
  - Cuisine : plan en L, évier sous la fenêtre, frigo, machine à café, table.
  - Chambre : lit double, chevets et lampes, armoire, bottes, photo de cheval, rideaux.
  - Salle de bain : douche vitrée, vasque et miroir, WC, sèche-serviettes.
  - Tous les passages font au moins 1,1 m de large. La caméra intérieure reste dans la pièce du joueur.
- **Actions** :
  - « Entrer » et « Sortir ». À cheval, on met pied à terre ; un cheval mené en main est lâché et attend dehors.
  - « Se coucher » dans la chambre : jamais à travers une cloison.
  - Deux gestes sans effet sur la partie : « Boire un verre d'eau » et « Se rafraîchir ».
- **À l'intérieur** :
  - pas de pluie ni de sifflet, y compris le sifflet du téléphone ;
  - aucune action du dehors à travers les murs.
- **Sauvegarde** : elle retient qu'on est dans la maison. Au rechargement, on reprend à l'intérieur.
- **Performances** :
  - L'intérieur se construit à l'approche, à moins de 30 m. Il n'est dessiné que lorsque le joueur est dedans.
  - Il est libéré au-delà de 140 m.
  - Il compte environ 27 000 triangles.
  - Il réutilise les matériaux des commerces : aucune compilation de shader à l'entrée.

## 6. Missions et horaires

| Missions | Horaires d'acceptation |
|---|---|
| Premiers pas, engagement au concours du Pôle (passage le lendemain matin s'il est pris le soir), entraînements, « Le fugueur » (urgence) | À toute heure |
| Coursier (livraisons en ville) | 8 h – 19 h |
| Sorties à cheval (reconnaissance, plage) | 7 h – 20 h |
| Transports | 6 h – 21 h |
| Compétitions (cross, derby, CSI, Grand Prix, Paris) | 7 h – 21 h |
| « Soins du soir » (corvée du soir) | 16 h – 23 h |
| « Groom du matin » | 6 h – 18 h |
| « Deux écuries, une matinée » | 6 h – 20 h |
| Autres missions de l'histoire | 6 h – 23 h |

- **Nouvelles demandes** : elles n'arrivent qu'aux horaires du client. La nuit, il n'y a aucune nouvelle demande
  ordinaire.
- **Notifications** : la notification « Nouvelle demande » n'est envoyée que pour une demande qu'on peut accepter.
  Une demande arrivée hors de son créneau est notifiée à son ouverture.
- **Refus expliqué** : il apparaît au téléphone et à l'acceptation. Exemples : « Disponible de 7 h à 21 h : le
  client te recontactera demain. À la maison de l'Écurie du Val, le lit permet de passer à la journée suivante. »,
  ou « Énergie trop basse (9 %) pour une mission aussi exigeante. Repose-toi d'abord… ».
- **Jamais bloqués** : les premiers pas et une mission à reprendre (point de reprise enregistré).

## 7. Revue adverse : défauts trouvés puis corrigés

Deux revues ont été menées : le rythme de vie, puis la maison et son raccord. Chaque défaut a été vérifié par un
second agent chargé de le réfuter. Tous sont corrigés et couverts par un test.

| Défaut | Correction |
|---|---|
| Chaque tentative de défi rejouable coûtait environ 20 points d'énergie (coût de mission, plus le retour à l'heure du joueur compté comme un saut de temps). | Le défi ne coûte rien, ni pendant, ni à la sortie. |
| Concours engagé pour le lendemain matin : lit, sieste et journée suivante étaient bloqués le soir, avec un faux « tu as manqué ton passage ». | L'heure de passage est enregistrée en absolu. Le repos est permis s'il laisse le temps d'y aller, et refusé s'il ferait manquer le passage. |
| Première partie : « Deux écuries, une matinée » fermait à 14 h, ce qui pouvait bloquer l'histoire après un long tutoriel. | Les créneaux de l'histoire sont élargis. Hors créneau, la raison indique le lit et l'itinéraire. |
| La notification « Nouvelle demande » partait pour des demandes qu'on ne pouvait pas accepter. | Seules les demandes acceptables sont notifiées ; les autres le sont à leur ouverture. |
| Entre 6 h et 7 h, « Passer à la journée suivante » annonçait 100 % mais réveillait 30 min plus tard. | On peut se coucher jusqu'à 7 h, et les libellés sont calculés. |
| Un défi lancé depuis la maison ramenait le joueur dans les pièces sans l'état « dedans » : intérieur invisible, pas de « Sortir », état sauvegardé tel quel. | Un joueur dans les pièces retrouve l'état « dedans ». |
| « Sortir » avec un véhicule garé contre la porte renvoyait le joueur dans le salon, en boucle. | La sortie se fait au premier point libre devant la façade. |
| Une ancienne sauvegarde prise près d'un pignon pouvait placer le joueur, le cheval ou un véhicule dans l'emprise agrandie. | Le joueur se retrouve dedans normalement, et le cheval ou le véhicule est remis à sa place. |
| Rebords de fenêtre qui scintillaient (faces confondues). | Les faces sont décalées de quelques centimètres. |
| Points mineurs : double appui sur « Entrer » pendant le fondu, sifflet du téléphone à l'intérieur, intérieur reconstruit à chaque retour dans la cour, une étape de construction trop lourde, caméra traversant un mur de 32 cm. | Tous corrigés. |

## 8. Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `src/gameplay/energy.js` (nouveau) | Le cœur du système : périodes, énergie, paliers, dépense par activité, coût des missions, effets, café, sieste, nuit, horaires et effort des missions, refus expliqués, fiche Énergie, note du téléphone. |
| `src/gameplay/rest.js` (réécrit) | Le menu du lit (nuit, journée suivante, sieste, rester debout), la carte « nouvelle journée », la sauvegarde, la règle du passage de concours et le recalage de la météo. Sans maison, le repos reste possible à la porte. |
| `src/gameplay/home.js` (nouveau) | La maison : entrer et sortir, état « dedans », lit, gestes, reprise, sécurités. |
| `src/world/homeGeo.js` (nouveau) | Le plan de la maison (pièces, cloisons, collisions, repères), l'extérieur et l'intérieur construit par étapes. |
| `src/world/world.js` | Le bâtiment de la maison, le chargement et la libération de l'intérieur, l'éclairage des personnages la nuit dans la maison. |
| `src/world/sites.js` | La nouvelle emprise de la maison. |
| `src/game.js` | Installation de l'énergie et de la maison, mise à jour à chaque image, reprise dans la maison, cheval et véhicules hors de l'emprise au chargement. |
| `src/core/save.js` | `life` (énergie, cafés, siestes) et `indoorHome`, avec valeurs par défaut pour les anciennes sauvegardes. |
| `src/gameplay/missions.js` | Disponibilité (horaires et énergie) à l'acceptation, demandes générées aux heures du client, notifications seulement pour ce qui est acceptable. |
| `src/gameplay/jobs.js`, `story.js`, `story2.js` | Horaires de « Soins du soir », « Groom du matin » et « Deux écuries, une matinée ». |
| `src/gameplay/trip.js` | Heure de passage du concours en absolu (retard et repos). |
| `src/gameplay/challengeRun.js` | Le défi rejouable ne coûte pas d'énergie. |
| `src/gameplay/player.js`, `src/entities/horse.js` | Effets légers de la fatigue (course, cheval monté hors concours) ; sifflet sans effet à l'intérieur. |
| `src/gameplay/shops.js` | Café du Galop : « Prendre un café », gain affiché, effet sur l'énergie. |
| `src/gameplay/interact.js`, `transport.js` | Rien du dehors n'est proposé à travers les murs de la maison. |
| `src/ui/hud.js`, `src/styles.css`, `src/ui/icons.js` | Période, heure et jauge dans le HUD ; fiche Énergie ; styles des demandes indisponibles ; icône du lit. |
| `src/ui/requests.js`, `src/ui/phone.js` | Statuts « HORS HORAIRES » et « TROP FATIGANT », raison, horaires, effort, itinéraire vers la maison, note de nuit ; compteur des missions disponibles. |
| `src/i18n/en/life.js` (nouveau), `systems.js`, `src/core/i18n.js` | Traductions anglaises. 0 clé manquante. |
| `tests/unit/energy.test.js`, `tests/unit/home.test.js` | Tests unitaires. |
| `tests/e2e/life-rhythm.mjs`, `home-interior.mjs`, `life-video.mjs` | Tests de bout en bout et vidéo. |
| `tests/e2e/autopilot.js` | Le pilote des tests revient à une heure ouvrable, ou dort, quand une mission le demande, comme un joueur. |

## 9. Captures et vidéo

Toutes les captures sont des rendus logiciels SwiftShader en émulation d'iPhone 13 paysage.

| Fichier | Contenu |
|---|---|
| `01-hud-periodes-de-la-journee` | Matin, après-midi, soir, nuit : pictogramme, période, heure et jauge. |
| `02-hud-jauge-energie-4-paliers` | 85 %, 50 %, 25 %, 8 % (vert, doré, orange, rouge). |
| `04-fiche-energie` | Fiche ouverte en touchant la jauge. |
| `05`, `06`, `07` | Téléphone : mission trop fatigante, mission hors horaires, note de nuit. |
| `08`, `09`, `10`, `10b`, `11` | Maison : extérieur de jour et de nuit, entrée, pièces de jour et de nuit, chambre avec « Se coucher ». |
| `12`, `13`, `14` | Menu du lit en journée et le soir, après une sieste. |
| `15`, `16` | Café : « Prendre un café » (+12), puis plus d'effet. |
| `17`, `18` | Carte « Bonjour ! », HUD au réveil (Matin 7:00, 100 %). |
| `videos/rythme-de-vie.mp4` | La vidéo (voir ci-dessous). |

La vidéo montre, dans l'ordre :

1. fin d'après-midi à cheval, avec l'heure accélérée : l'énergie baisse et l'avertissement « Fatigue » apparaît ;
2. café au Galop ;
3. retour à la maison le soir, chambre, menu du lit, « Dormir jusqu'au matin » ;
4. nouvelle journée et départ au petit matin.

Le journal des événements de la vidéo est dans `videos/rythme-de-vie.events.json`.

## 10. Vérifications

Voir `mesures/non-regression.txt` : tests unitaires et 35 scripts de bout en bout, avec les relances et leurs causes.

## 11. Limites

- Pas d'essai sur iPhone réel : la fluidité de la maison et la lisibilité de la jauge sont à confirmer sur l'appareil.
- La notification « Épuisement » couvre la jauge pendant quelques secondes (capture `02`, 8 %).
- Les lucarnes et vitres hautes de la maison s'allument au hasard la nuit, comme en ville. Les fenêtres de la
  façade, elles, sont toujours éclairées le soir.
- Les heures de l'écran du téléphone suivent la date réelle de l'appareil, comme avant.
