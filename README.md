# STRIDES — Grand Tour

Jeu en monde ouvert 3D inspiré de GTA, transposé dans l'univers du cheval, au service de la marque **STRIDES**.
On y incarne un jeune talent du monde équestre qui arrive sur la Côte Fleurie avec sa jument, Comète, et zéro euro en poche.
Les missions arrivent sur le téléphone du personnage, dans l'application Strides : on les **accepte** ou on les **refuse**,
on les réalise, on est payé et noté… jusqu'à remporter le Grand Prix CSI 5★ de Deauville City.

Jouable dans le navigateur, **pensé d'abord pour l'iPhone** (commandes tactiles, paysage), et aussi au clavier sur ordinateur.

## Jouer

En ligne, sans compte : **https://anquetin10-cpu.github.io/Game_strides/** (GitHub Pages, mis à jour à chaque push).

| Tactile (iPhone) | Clavier |
| --- | --- |
| Joystick : poser le pouce n'importe où dans la moitié gauche et glisser — poussé : **galop** de 23 km/h à 35 km/h à fond | ZQSD / WASD ou flèches (galop ; Ctrl : trot, Alt : pas) |
| Caméra : glisser dans la moitié droite | Glisser à la souris |
| **SAUT** (à cheval) — l'anneau devient vert au bon moment | Espace |
| **BOOST** (maintenir) : grand galop, anneau d'endurance autour du bouton / **COURIR** à pied | Maj |
| **ACTION** contextuelle : monter, descendre, parler, prendre, livrer, **conduire** (camion, voitures, tracteur) / sortir du véhicule… | E |
| Au volant : joystick vers le haut = accélérer, vers le bas = freiner puis marche arrière, gauche/droite = braquer | ZQSD / WASD |
| Sifflet : rappeler son cheval | Q |
| Téléphone (en haut à droite) — app Strides, carte, messages… | P |
| Minimap : toucher pour ouvrir la carte et poser un repère GPS | M |
| Pause | Échap |

Astuce iPhone : dans Safari, **Partager → Sur l'écran d'accueil** pour jouer en plein écran comme une app.

## Ce qu'il y a dedans

- **Un monde ouvert de 1,2 km²** : Deauville City (ville normande, place, Grand Hôtel, Strides HQ), la plage et ses Planches,
  le Haras de la Pommeraie, le Pôle International (carrière de CSO, tribunes), l'hippodrome de la Touques, la forêt de
  Saint-Gatien et son cross, les falaises et le phare, le bocage, la colline « STRIDES ». Cycle jour/nuit, mer animée,
  herbe au vent, circulation, passants, chevaux au paddock, cavaliers à l'entraînement.
- **Un cheval procédural** articulé (pas, trot, galop, grand galop, saut, refus, broute), endurance à gérer, quatre chevaux
  à acquérir (Comète, Ulysse, Onyx, Saphir) et des équipements à la Sellerie du Port.
- **Le téléphone et l'app Strides** : notifications de missions (Refuser / Voir / Accepter), onglets Missions, Écuries,
  Transport, Événements, Annuaire, Profil (note moyenne, statut, revenus), carte GPS, messages, trophées, mode photo.
- **12 missions d'histoire**, chacune illustrant un service réel de Strides :

  | Mission | Univers Strides |
  | --- | --- |
  | Premiers pas · Groom du matin · Selle sur-mesure · Le fugueur · Galop sur la plage | Jobs & services |
  | Transport express (camion Strides, confort du cheval) | Transport |
  | Fer perdu (trouver un maréchal vérifié dans l'annuaire) | Annuaire |
  | La pension parfaite (comparer les pensions) | Écuries |
  | Cross de Saint-Gatien · Derby de la Touques · Qualificative CSI 3★ · Grand Prix CSI 5★ | Événements |

- **Des jobs générés à l'infini** (coursier, transport, reconnaissance de parcours, soins), des **chronos libres**
  (plage, CSO, cross, hippodrome) et **20 fers d'or** cachés.
- **Progression** : Groom → Cavalier → Pro vérifié → International → Légende 5★, avis clients étoilés, pourboires.
- **Écuries à couloir central** : on entre dans les écuries (à pied ou à cheval) par les portes coulissantes ; boxes
  des deux côtés de l'allée, aire de pansage, douche, sellerie, salle d'aliments, charpente apparente ; club-house
  avec terrasse sur la carrière à l'Écurie du Val ; écuries de concours sous tente au Pôle International.
- **Tenues selon l'activité** : tenue de travail à l'écurie (culotte beige, boots et mini-chaps), casque pour monter,
  tenue de concours (veste, chemise et culotte blanches) seulement sur le terrain d'un concours.
- **Box du cheval** : à l'Écurie du Val, on rentre son cheval au box pour qu'il récupère (eau, foin, repos) et on
  va l'y chercher.
- **Épreuves de saut d'obstacles** (Pôle International), pensées pour l'iPhone à deux pouces :
  - **parcours dessiné** dans une carrière de 120 × 76 m : la ligne du cavalier (grandes courbes de 10 à 12 m, lignes
    droites) est tracée d'abord, puis les obstacles posés dans son axe ; 8 obstacles numérotés (verticaux, oxers,
    mur) et un **double 5A – 5B** à deux foulées ; au moins 5 foulées d'approche (17 m) et 8 m de réception dégagée,
    changement de main, départ et arrivée matérialisés (fanions blancs à gauche, rouges à droite) ; obstacles,
    plan, tracé conseillé au sol, longueur (375 m) et temps accordé (65 s) viennent des mêmes données
    (`src/gameplay/csoCourse.js`) ;
  - **commandes de concours** (comme le saut d'obstacles d'Athènes 2004) : joystick gauche/droite pour tourner
    progressivement (jamais de pivot), avant/arrière pour la cadence, gardée au relâchement (galop de concours stable
    par défaut, 6,2 m/s) ; gros bouton SAUT à droite, utilisable en tournant ; clavier : flèches ou ZQSD + Espace ;
    BOOST remplacé par la cadence ; réglages dans `CSO_RIDE` (`src/gameplay/player.js`) ;
  - **caméra de concours** : proche derrière le cheval, juste au-dessus du cavalier, peu plongeante, regard porté
    devant le cheval, saut amorti, champ fixe ; rétablie à la sortie (fin, abandon, élimination) ; réglages dans
    `CAM_CSO` (`src/entities/camera.js`) ; **HUD allégé** (chrono, temps accordé, pénalités, obstacle suivant) ;
  - **déroulé de concours** : présentation (épreuve, hauteur, cheval, temps accordé) et plan consultable, annonce à
    l'entrée en piste, cloche (45 s pour prendre le départ), chrono au centième lancé à la ligne de départ, arrivée
    applaudie, bilan (chrono, fautes et leur cause, pénalités de temps, classement des concurrents, récompense une
    seule fois), puis **Recommencer**, **S'entraîner** ou quitter ; barème A au chrono (4 points par barre ou premier
    refus, élimination au second, 1 point par seconde entamée), erreurs de parcours signalées ;
  - **saut qui dépend de la distance d'appel** (`src/gameplay/jumpModel.js`) : un appui = un saut, depuis la position,
    la vitesse et le cap du moment ; la trajectoire (parabole, longueur ajustée par le cheval de −24 % à +12 %) est
    jugée barre par barre (largeur de l'oxer comprise) : bon appel = saut propre, un peu long ou un peu près = ça
    passe encore (barre effleurée qui tinte), bien trop loin ou trop près = barre, ou refus tout contre ; vitesse et
    angle réduisent la marge ; même geste, même résultat ;
  - **aide à l'appel** (Réglages → Aide au saut : complète, bouton seul, aucune) : bouton SAUT « Trop loin » (ambre
    »), « Saute ! » (vert ✓), « Trop près » (rouge !), zone d'appel au sol calculée par le même modèle, repère du
    prochain obstacle ; tracé au sol désactivable ; entraînement rapide vertical + oxer au paddock d'échauffement.
- **Deauville City et ses commerces** (`src/world/shopGeo.js`, `src/world/shopInteriors.js`, `src/gameplay/shops.js`) :
  - **ville** : maisons à pans de bois, façades de brique à encadrements et linteaux de pierre, enduits clairs ;
    garde-corps de fer forgé, jardinières de géraniums, portes à encadrement et marquise ; une partie des maisons a
    une devanture peinte (enseigne, vitrines garnies, éclairées la nuit) ; plaques de rue émaillées, bancs, corbeilles,
    bornes de la place Morny ;
  - **trois commerces où l'on entre** (action « Entrer » devant la porte) : la **Sellerie du Port** (selles au mur et sur
    chevalets, briderie, tapis par couleur, protections et fers, pansage et soins, équipement du cavalier, comptoir et
    vendeuse, trois vitrines), le café-boulangerie **Le Galop** (comptoir en zinc, vitrine à pâtisseries, pains,
    machine à café, salle et terrasses) et **Maison Lucette** (portant, étagères, mannequins, miroir, cabine) ;
    devanture en bois peint, vitrines en verre clair, porte en retrait, enseigne drapeau ; intérieur à la taille de la
    façade, chargé à l'approche et libéré au loin ; caméra intérieure ; ambiance sonore propre à chaque commerce ;
  - **achats** : un seul catalogue (boutiques et application du téléphone, `SHOP` dans `src/gameplay/data.js`) ;
    fiche produit (prix, description, effet réellement appliqué, possession, restriction) ; articles uniques,
    consommables cumulables (utilisés près du cheval) et équipement par emplacement (selle, bridon, tapis visible sur
    le cheval, guêtres, cloches, casque, bottes, haut, couvre-chef) ; essayage au miroir ; un double appui ne débite
    qu'une fois, un solde insuffisant ne change rien, débit et attribution sont enregistrés ensemble (`commerce.js`) ;
  - **cheval et véhicules dehors** : à cheval, on met pied à terre et le cheval est attaché à la barre du commerce ;
    le sifflet ne le fait pas entrer ; on entre à pied (véhicule garé dehors) ;
  - **missions** : la selle de « Selle sur-mesure » se retire au comptoir de la sellerie ; les livraisons de matériel
    et les commandes du café se retirent ou se déposent au comptoir ;
  - **reprise** : une sauvegarde faite dans un commerce y ramène le joueur (ou devant sa porte si l'intérieur ne peut
    pas être reconstruit), achats, cheval et progression intacts.
- **Concours de jour (ou le soir sous les projecteurs)** : épreuves de 8 h 30 à 21 h ; engagé en soirée, on passe le
  lendemain matin et on peut dormir à la maison de l'Écurie du Val jusqu'à 7 h.
- **Carburant** : chaque véhicule consomme selon son moteur et sa conduite (jauge, autonomie et consommation moyenne au
  volant) ; plein à la station-service de l'entrée nord de Deauville City, payé au litre ; panne sèche et dépannage.
- **Sauvegarde automatique** : la partie s'enregistre seule sur l'appareil (toutes les 12 s, à chaque mission, quand
  on quitte la page). Dans le jeu publié sur claude.ai, une copie part aussi dans l'espace privé du joueur (au plus
  toutes les 30 s) ; si elle est plus récente que celle de l'appareil, le jeu propose de la reprendre (la partie de
  l'appareil est gardée en copie de secours).
- **Classements en ligne** (app « Classements » du téléphone) : 8 épreuves (défi du Pôle, concours Amateur 2,
  Amateur 1, Pro 2, parcours du Pôle, cross, sprint de la plage, tour de l'hippodrome), meilleur résultat de chaque
  joueur (pénalités puis chrono), rang affiché à l'arrivée, mise à jour en direct, pseudonyme choisi. Un chrono
  physiquement impossible n'est pas inscrit. Hors de claude.ai, l'app montre les records de l'appareil.
- **Marque** : panneaux publicitaires, camion et tapis de selle Strides, ligne « Dans la vraie vie » après chaque mission,
  écran de fin et boutons « Découvrir l'app » / « Partager le jeu ».

## Configuration marketing

Le lien vers la vraie application se règle dans [`src/config.js`](src/config.js) :

```js
downloadUrl: 'https://…', // App Store, site Strides, lien dynamique…
```

Laissé vide, les boutons « Découvrir » affichent un message « Bientôt sur votre téléphone ».
Les clics sur les appels à l'action émettent aussi un évènement `strides_cta` dans `window.dataLayer` (Google Tag Manager) si présent.

## Développement

```bash
npm install
npm run dev          # serveur local (accessible depuis l'iPhone sur le même réseau)
npm test             # tests unitaires (Vitest)
npm run build        # build statique dans dist/
npm run build:single # un seul fichier HTML autonome dans dist-single/
```

Tests de bout en bout (Chromium, émulation iPhone, serveur de dev lancé sur le port 5173) :

```bash
node tests/e2e/scenario.mjs   # partie réelle au doigt : titre, notification, joystick, téléphone
node tests/e2e/missions.mjs   # pilote automatique : les 12 missions de l'histoire jusqu'au Grand Prix
node tests/e2e/jobs.mjs       # 16 jobs générés
node tests/e2e/features.mjs   # porte de la sellerie, achat, sifflet, transport, achat de cheval, fers d'or, chronos, photo
node tests/e2e/ui.mjs se      # captures d'interface (se | i14 | max)
node tests/e2e/outfit.mjs     # tenues : travail, à cheval (casque), concours sur le terrain
node tests/e2e/barn.mjs       # écurie : entrer, allée, boxes, sellerie, caméra sous la charpente
node tests/e2e/fuel.mjs       # carburant : consommation, plein à la station, panne sèche
node tests/e2e/online.mjs     # sauvegarde en ligne et classements (base claude.ai simulée)
node tests/e2e/real/realism.mjs # modèles réalistes : personnage et cheval, sabots au sol, volant, retour au classique
node tests/e2e/cso.mjs        # épreuve de CSO complète au joystick : sans faute, mauvais appels, double, refus, élimination
node tests/e2e/cso-shots.mjs  # captures de l'épreuve (iPhone 13 paysage) dans tests/e2e/out/cso/
node tests/e2e/cso-touch.mjs  # tour complet au doigt en émulation iPhone 13 (joystick + SAUT en multitouch)
node tests/e2e/shops.mjs      # commerces (iPhone 13 émulé) : entrer, circuler, acheter, équiper, sortir, reprise
node tests/e2e/town-shots.mjs apres   # vues fixes de Deauville City dans tests/e2e/out/town/apres/
node tests/e2e/perf-town.mjs apres    # mesures dans les rues et les commerces (rendu logiciel : valeurs relatives)
```

Réglages de Deauville City : `LOAD_R` / `UNLOAD_R` (distances de chargement des intérieurs, `src/gameplay/shops.js`),
`CAM_INDOOR` (caméra des commerces, `src/entities/camera.js`), `shopLightUniforms` (couleur et puissance de
l'éclairage intérieur, `src/world/surfaces.js`), `SHOPS3D` (emplacement, taille, couleurs, enseignes, étages des
commerces, `src/world/sites.js`), `SHOP` et `CAFE_MENU` (catalogue et carte, `src/gameplay/data.js`), `streetShop`
(devantures et enseignes des maisons, `src/world/world.js`).

Par défaut, pas d'assets externes : géométrie, textures et sons sont générés par le code (Three.js + WebAudio).
Le build pèse environ 250 Ko gzip.

### Modèles 3D réalistes

Réglages du téléphone → **Modèles 3D : Auto / Classiques / Réalistes**. Par défaut (**Auto**), les modèles réalistes
sont affichés, sauf en qualité « Économie » ; si l'appareil ne suit pas (moins de 30 images/s alors que la résolution
est déjà au minimum), le jeu repasse de lui-même aux modèles classiques pour le reste de la partie. `?real` ou
`?classic` dans l'adresse imposent l'un ou l'autre. Avec les modèles réalistes :

- **le personnage du joueur** est remplacé à l'affichage par un modèle humain réaliste (peau photographique, yeux, cils,
  cheveux, vêtements texturés, squelette à 53 os avec doigts) qui reprend ses animations (marche, course, monte,
  conduite) et ses tenues (couleurs, casque) ;
- **les chevaux** restent par défaut les chevaux procéduraux du jeu (préférés à l'essai) ; le réglage
  **Chevaux 3D : Classiques / Réalistes** (ou `?realhorse` dans l'adresse) active le cheval réaliste :
  **le cheval du joueur** (et le cheval monté) est alors remplacé par un cheval réaliste (poil photographique, crins en
  mèches, sabots ferrés, selle et filet, squelette de 99 os) qui reprend toutes les allures du cheval du jeu (pas,
  trot, galop, saut, refus, broute), avec la robe de chaque cheval (bai, alezan, gris, noir, balzanes, liste) et des
  sabots posés au sol par cinématique inverse, et le tapis de selle STRIDES (aux couleurs du tapis du cheval) ;
- **les personnes et chevaux proches** (8 personnes à moins de 30 m, 5 chevaux à moins de 45 m si « Chevaux 3D » est
  sur Réalistes, les plus proches de la caméra) passent aussi en réaliste, chacun avec sa tenue ou sa robe ; au-delà, modèles classiques ;
- **bottes d'équitation** hautes moulées sur la jambe (pantalon rentré dedans), à la couleur de la tenue ; **veste de
  concours** (chemise blanche dessous) dans la tenue de concours ;
- chevaux non sellés : **licol** (muserolle, montants, têtière) ; robe grise **pommelée**, tête plus claire.

- **voitures** : la voiture de l'écurie, les voitures garées et celles de la circulation deviennent des voitures
  réalistes (6 au plus à moins de 60 m), sans logo ni plaque, à la couleur du véhicule ; roues qui tournent et
  braquent, suspension, physique et collisions inchangées. Le camion STRIDES et le tracteur gardent leurs modèles.

Les modèles classiques restent en place, cachés : « Classiques » rétablit l'affichage d'origine.

Les modèles (`public/real/*.glb`, compression meshopt, textures WebP ; personnages ≈ 2,5 Mo chacun, cheval 3,4 Mo,
voitures 1 à 2 Mo)
sont chargés à part, seulement quand les modèles réalistes sont affichés. Ils se régénèrent avec
`node scripts/real/build-humans.mjs`, `node scripts/real/build-horse.mjs` et `node scripts/real/build-cars.mjs` ; licences dans
[`public/real/LICENSES.md`](public/real/LICENSES.md) (personnages CC0 ; cheval et voitures CC BY 4.0, crédits
affichés dans les réglages). Le fichier unique (`build:single`) charge à la place une copie glTF JSON
(`real/*.gltf.json`, produite par `node scripts/real/to-json.mjs <dossier>`), pour les hébergements qui ne servent pas
les `.glb`.

## Mise en ligne

Le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) lance les tests, construit le jeu et le publie
sur **GitHub Pages** à chaque push. À activer une fois : *Settings → Pages → Build and deployment → Source : GitHub Actions*.
Le dossier `dist/` (ou le fichier unique `dist-single/index.html`) peut aussi être déposé sur n'importe quel hébergement statique.

---

Jeu de démonstration : Deauville City, ses lieux et ses personnages sont fictifs.
