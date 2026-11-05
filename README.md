# Equestrian Tour

Jeu en monde ouvert 3D inspiré de GTA, transposé dans l'univers du cheval. Le jeu s'appelle **Equestrian Tour** ;
**Strides** est la vraie plateforme (application de missions et de recrutement des professionnels du cheval), utilisée
dans le jeu par le téléphone du personnage — dans le jeu, profils, missions et paiements sont fictifs.
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
- **Bilingue français / anglais** : choix de la langue au premier lancement, puis à tout moment sur l'écran titre
  (FR | EN) ou dans les Réglages du téléphone (la partie est enregistrée, le jeu se recharge dans l'autre langue). Tout
  le texte du jeu passe par `src/core/i18n.js` (`t('…')`, gabarits `` T`…${x}…` ``) ; traductions anglaises dans
  `src/i18n/en/*.js` (clé = texte français exact), conventions et glossaire équestre dans `src/i18n/GLOSSARY.md`,
  vérification par `node scripts/i18n-check.mjs` (clés manquantes, gabarits, variables qui masqueraient `t`).
- **Deux véhicules porte-chevaux** à l'Écurie du Val : le camion Strides (STX Scania, rampe arrière, stalles en épi)
  et le **van STX Renault Master** (modèle fourni `src/assets/vehicles/STX_Renault_Master_STALLE5.glb`, importé tel
  quel) : deux stalles, **pont latéral droit** et ses volets, porte arrière (amplitudes des animations du fichier),
  roues et braquage sur les pivots du fichier, chargement / déchargement des chevaux par le pont, départ impossible
  pont ou porte ouverts ; contrôle du modèle : `node scripts/verify-master.mjs`.
- **Le Defender 110 du personnage** (type `defender110_hero`), garé à l'Écurie du Val : modèle fourni importé tel quel
  (`src/assets/vehicles/Defender110_STRIDES.glb`, ou la variante allégée `Defender110_STRIDES_MOBILE.glb` — une seule
  chargée : la version en un seul fichier n'embarque que la variante mobile ; `?defender=full|mobile` en
  développement). Roues et braquage d'Ackermann sur les pivots du fichier, volant, quatre portes et coffre latéral
  (amplitudes des clips `Open_*`), montée par la portière conducteur, descente sûre, départ impossible coffre ouvert
  (portières refermées d'elles-mêmes), coffre pour un objet porté (botte de foin…), teinte modifiable ; pas de cheval
  à bord ; position, teinte, coffre et portières enregistrés (ajouté une seule fois aux sauvegardes existantes).
- **Montée et descente animées dans tous les véhicules** (`src/gameplay/boarding.js`) : un seul appui sur « Monter »
  enchaîne l'approche (contournement de la caisse si besoin), la main sur la poignée, l'ouverture, la montée (seuil,
  marchepieds et prises de main pour les cabines hautes), l'assise, les jambes rentrées, la fermeture depuis
  l'intérieur et les mains au volant ; « Descendre » fait l'inverse (descente à reculons, face à la cabine, pour le
  camion et le tracteur). Pose squelettique pilotée (`anim.js`, pose `board`) : pieds et mains posés par cinématique
  inverse sur les repères du véhicule, fondus, tout dépend du temps écoulé. Un profil par véhicule règle portière
  (charnière, sens, angle), poignées, seuil, marches, prises, siège, pédalier, volant, points d'approche et caméra.
  Les portières cabine du Master, du Scania, des voitures et du tracteur, d'une seule pièce avec la caisse dans leurs
  modèles, en sont détachées au chargement selon leur contour réel (`src/entities/doorCut.js` : découpe exacte des
  triangles, pivot aux charnières, doublure intérieure), sans modifier les fichiers fournis ; le Scania reçoit deux
  marchepieds et une poignée de maintien sous sa portière (ses marches d'origine sont devant la charnière). Accès ou
  sortie bloqués : indication, aucune animation au travers d'un obstacle ; sauvegarde pendant une séquence : reprise
  à pied en lieu sûr. Tests : `node tests/e2e/boarding.mjs`, vidéos : `node tests/e2e/boarding-video.mjs`.
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
  | Finale : Grand Prix de Paris Indoor (Sprint puis Grand Prix, en salle à Paris) | Événements |

- **Grand Prix de Paris Indoor** (finale, hommage fictif aux grands concours en salle au format « Formule 1 » : aucun
  nom, logo ni identité visuelle réels) :
  - **zone « Paris »** hors de la carte de Deauville : arène couverte de 86 × 46 m, tribunes pleines sur trois côtés,
    cube d'écrans géants (couple en piste, chrono, résultats), faisceaux de spectacle ; paddock d'échauffement sous
    projecteurs, écuries provisoires, accréditations, parking des camions, silhouettes de Paris au loin ;
  - **voyage en camion** : à l'arrêt sur la bretelle de l'**autoroute A13** (bout est de la route Est-Ouest), le
    trajet est proposé (200 km, 2 h 10, 46 l de gazole), chevaux à bord ; retour par la voie d'accès du parking de
    Paris (refusé si le cheval resterait seul à Paris) ;
  - **format** : un **Sprint à 1,50 m** (barème C : chrono, +4 s par barre) fixe la **grille de départ** du soir — le
    plus rapide part en dernier —, présentation des 40 cavaliers sur les écrans, puis le **Grand Prix à 1,60 m**
    (barème A au chrono, **barrage** des sans-faute), podium et dotation ; 39 concurrents simulés ;
  - **tracés** (même outil que le Pôle : ligne du cavalier d'abord, règles vérifiées par `courseLint.js` : abords de
    14,5 m, réceptions de 10 m, courbes de 10,5 m de rayon au moins, ligne à 5,5 m des lices) : spirale à main droite
    sur quatre lignes droites (≈ 310 m), départ loin de l'entrée ; Sprint en 7 sauts (double 2A – 2B à une foulée) ;
    Grand Prix en 9 sauts (double 3A – 3B à une foulée, double 5A – 5B à deux foulées) ; marquage du tracé et zone
    d'appel posés sur le sable de l'arène ;
  - **défi à conditions fixes** « Défi du Grand Prix de Paris » dans l'app Activités : cheval fourni, 1,50 m,
    20 h 30 en salle, temps accordé 54 s (v3), départ directement dans l'arène, record par version.
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
  - **parcours dessiné** dans une carrière de 120 × 76 m : la ligne du cavalier (grandes courbes de 13 m de rayon au
    moins, longues lignes droites) est tracée d'abord, puis les obstacles posés dans son axe ; 8 obstacles numérotés,
    10 sauts (verticaux, oxers, mur) dont un **double 4A – 4B** à deux foulées et un **double 6A – 6B** à une foulée,
    lignes en nombre entier de foulées ; 18 m au moins d'approche droite et 12 m de réception dégagée, changement de
    main par une grande demi-volte, départ et arrivée matérialisés (fanions blancs à gauche, rouges à droite), abord
    conseillé depuis l'entrée de piste ; obstacles, plan, tracé conseillé au sol, longueur (368 m) et temps accordé
    (64 s) viennent des mêmes données (`src/gameplay/csoCourse.js`), et chaque tracé passe le lint de tracé
    (`src/gameplay/courseLint.js`, tests `courses-lint.test.js`) ;
  - **commandes de concours** (philosophie du saut d'obstacles d'Athens 2004 : diriger, régler la vitesse, sauter) :
    joystick gauche/droite pour diriger (courbe progressive, rayon qui grandit avec la vitesse : 6,3 m au trot, 7,6 m
    au galop de concours, 9 m au galop allongé), avant/arrière pour la cadence, gardée au relâchement et partant de la
    vitesse réelle du cheval ; gros bouton SAUT, dont le moment compte ; clavier : flèches ou ZQSD + Espace (direction
    amenée progressivement) ; pas de BOOST ; réglages dans `CSO_RIDE` (`src/gameplay/csoRide.js`) ;
  - **saut** (`src/gameplay/jumpModel.js`, en épreuve et à l'entraînement seulement) : le saut part de là où l'on
    appuie, le cheval saute la hauteur que demande l'obstacle, recadrage limité (+6 % / −12 %) ; appel un peu tôt ou un
    peu tard : franchi ; nettement trop tôt : barre en fin de trajectoire (postérieurs) ; trop tard : barre en montée ou
    refus ; retour après chaque saut (« Appel parfait », « Un peu loin »…) ;
  - **caméra de concours** (branche séparée, `CAM_COMP`, `src/entities/camera.js`) : centrée derrière le cavalier,
    6,6 m derrière et 3,4 m de haut, champ fixe de 58°, verrouillée, rotation progressive avec une légère
    anticipation, sans zoom ni secousse aux sauts, passe au-dessus des obstacles ; active de l'entrée en piste à la
    sortie ; **HUD sobre** (chrono, fautes, obstacle suivant ; cadence affichée quand on la règle) ; **tracé au sol** :
    ligne discrète de petits repères jusqu'à l'obstacle suivant, désactivable (Réglages ou menu pause) ;
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
- **Maison de l'Écurie du Val** (longère enduite, porte sur la cour, action « Entrer » à pied) : salon avec cheminée,
  bibliothèque, canapé, fauteuil club et vitrine à trophées ; cuisine (plan de travail, évier, plaque, réfrigérateur,
  machine à café, table et deux chaises) ; chambre (lit double, chevets et lampes, armoire, commode, flots et photo de
  cheval) où « Se coucher » ouvre le menu du sommeil ; salle de bain (douche à l'italienne, vasque et miroir, WC,
  sèche-serviettes). Le cheval reste dehors ; rien du dehors n'est proposé à travers les murs ; intérieur construit à
  l'approche (une étape par image), dessiné seulement joueur dedans ; reprise dans la maison après rechargement
  (`src/gameplay/home.js`, `src/world/homeGeo.js`).
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

## Identité : Equestrian Tour et Strides

- **Nom du jeu** : `CONFIG.name` (« Equestrian Tour », texte courant) et `CONFIG.title` (« EQUESTRIAN TOUR », titres)
  dans [`src/config.js`](src/config.js). Les identifiants techniques historiques restent inchangés (clé de sauvegarde
  `strides-grand-tour-v1`, nom du paquet, épreuves en ligne) : les sauvegardes et classements existants se chargent tels quels.
- **Logo Strides** : toujours le fichier officiel (`src/assets/partners/strides/`, référencé par
  `src/partners/partners.js`), affiché par [`src/ui/logo.js`](src/ui/logo.js) — `<img>` ou masque CSS dans
  l'interface, `drawLogo()` (préchargé au démarrage) dans les textures du monde ; proportions du fichier, jamais redessiné.
- **Icônes de l'application** (PWA, écran d'accueil) : monogramme typographique « ET » d'Equestrian Tour, généré par
  `node scripts/make-icons.mjs`.

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
node tests/e2e/cso-athens.mjs [virtual|touch|keyboard] [cso|paris_gp]  # manche jouée aux seules commandes normales (VIDEO=1 : vidéo)
node tests/e2e/i18n.mjs       # bilingue : choix au premier lancement, bascule écran titre / réglages, missions en anglais
node tests/e2e/master.mjs     # van STX Renault Master : modèle, conduite, pont latéral, chargement, sauvegarde, captures
DEFENDER=full node tests/e2e/defender.mjs   # Defender 110 : modèle, portes, coffre, conduite, collisions, sauvegarde, captures
node tests/e2e/qa-fixes.mjs                 # rejeu des 11 bugs du rapport QA du 30 octobre 2026 (comportement corrigé)
node tests/e2e/defender-variants.mjs        # Defender 110 : variantes détaillée / mobile (chargement, triangles, appels de dessin)
node tests/e2e/cso-shots.mjs  # captures de l'épreuve (iPhone 13 paysage) dans tests/e2e/out/cso/
node tests/e2e/cso-touch.mjs  # tour complet au doigt en émulation iPhone 13 (joystick + SAUT en multitouch)
node tests/e2e/cso-framing.mjs # cadrage de la caméra de concours : part de la hauteur et position du couple à l’écran
node tests/e2e/identity.mjs   # identité : nom Equestrian Tour partout, logo Strides officiel (fichier d'origine) seulement
node tests/e2e/shops.mjs      # commerces (iPhone 13 émulé) : entrer, circuler, acheter, équiper, sortir, reprise
node tests/e2e/home-interior.mjs # maison de l'Écurie du Val : entrer, pièces, caméra, collisions, lit, jour/nuit, reprise
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
- **les chevaux** sont toujours les chevaux du jeu (le cheval réaliste et le réglage « Chevaux 3D » ont été retirés),
  sauf le cheval à l'essai Tripo, qui a son propre modèle (voir `trial/README.md`) ;
- **les personnes proches** (8 à moins de 30 m, les plus proches de la caméra) passent aussi en réaliste, chacune avec
  sa tenue ; au-delà, modèles classiques ;
- **bottes d'équitation** hautes moulées sur la jambe (pantalon rentré dedans), à la couleur de la tenue ; **veste de
  concours** (chemise blanche dessous) dans la tenue de concours ;
- chevaux non sellés : **licol** (muserolle, montants, têtière) ; robe grise **pommelée**, tête plus claire.

- **voitures** : la voiture de l'écurie, les voitures garées et celles de la circulation deviennent des voitures
  réalistes (6 au plus à moins de 60 m), sans logo ni plaque, à la couleur du véhicule ; roues qui tournent et
  braquent, suspension, physique et collisions inchangées. Le camion STRIDES et le tracteur gardent leurs modèles.

Les modèles classiques restent en place, cachés : « Classiques » rétablit l'affichage d'origine.

Les modèles (`public/real/*.glb`, compression meshopt, textures WebP ; personnages ≈ 2,5 Mo chacun, voitures 1 à 2 Mo,
cheval Tripo 1 Mo)
sont chargés à part, seulement quand les modèles réalistes sont affichés. Ils se régénèrent avec
`node scripts/real/build-humans.mjs`, `node scripts/real/build-cars.mjs` et `node scripts/real/build-tripo-horse.mjs` ;
licences dans [`public/real/LICENSES.md`](public/real/LICENSES.md) (personnages CC0 ; voitures CC BY 4.0, crédits
affichés dans les réglages). Le fichier unique (`build:single`) charge à la place une copie glTF JSON
(`real/*.gltf.json`, produite par `node scripts/real/to-json.mjs <dossier>`), pour les hébergements qui ne servent pas
les `.glb`.

## Mise en ligne

Le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) lance les tests, construit le jeu et le publie
sur **GitHub Pages** à chaque push. À activer une fois : *Settings → Pages → Build and deployment → Source : GitHub Actions*.
Le dossier `dist/` (ou le fichier unique `dist-single/index.html`) peut aussi être déposé sur n'importe quel hébergement statique.

---

Jeu de démonstration : Deauville City, ses lieux et ses personnages sont fictifs.
