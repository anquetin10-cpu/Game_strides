# Cheval Tripo : version optimisée et animable (ESSAI, rien n'est remplacé)

Demande : inspecter le GLB fourni et préparer une version optimisée et animable pour Equestrian Tour.

- Préserver la morphologie et la robe, et réduire les polygones.
- Créer un squelette compatible avec les animations existantes.
- Tester le cheval au pas, au trot, au galop et sur un parcours d'obstacles.
- Ne pas remplacer le cheval actuel avant validation.

À lire avant tout :

- **Le cheval actuel n'est pas remplacé.** Le cheval Tripo ne s'affiche qu'en mode développement
  (`npm run dev`), avec l'option `?tripohorse`, par exemple `http://127.0.0.1:5173/?tripohorse`.
  - L'essai ne dure que la session : rien n'est écrit dans la sauvegarde.
  - Seuls le cheval principal et celui que l'on monte prennent le modèle ; les autres chevaux gardent leur robe.
  - Sans l'option, et dans toute version construite, le jeu est inchangé. C'est vérifié au § 10.
- **Aucun essai sur un iPhone réel.** Tous les tests ont été joués dans Chromium en rendu logiciel (SwiftShader),
  avec l'émulation d'un iPhone 13 en paysage (844 × 390, tactile). Captures et vidéos sont l'image du jeu dans ce
  navigateur. Les performances mesurées ne valent pas mesure sur iPhone (§ 11).
- **La version publique n'a pas changé.** Elle reste sur la version auditée b4796e7. Rien n'est publié sans votre
  accord et le circuit de validation du projet.
- **Branche.** Le travail est sur `claude/strides-grand-tour`. Aucune partie existante n'est effacée, et les
  sauvegardes et les parties en cours ne sont pas touchées.
- **Décisions qui vous reviennent** (§ 13) :
  - remplacer ou non le cheval actuel ;
  - choisir la robe : texture d'origine, plus claire, ou variante assombrie comme l'aperçu ;
  - refaire la sellerie de tête ;
  - faire l'essai sur iPhone ;
  - confirmer les droits d'utilisation du modèle.

## 1. Résultat en bref

| | Source « Qualité » | Cheval Tripo optimisé |
|---|---|---|
| Triangles | 100 000 | 29 982 de près, 7 993 au-delà de 25 m |
| Sommets | 79 904 | 21 316 et 6 852 |
| Squelette | aucun (maillage statique) | 50 os, ceux du cheval du jeu, mêmes noms |
| Animation | aucune | celles du cheval du jeu : pas, trot, galop, grand galop, saut, cabrer, brouter, repos |
| Textures | JPEG : couleur 2048, normales 1024, rugosité/métal 2048 | WebP nettoyées : couleur 2048, normales 1024, rugosité 1024 |
| Défauts de robe | tapis et quartiers peints et modelés, points sombres, métal parasite | retirés (§ 4 et § 5) |
| Fichier | 4,8 Mo | 0,96 Mo |

Le cheval du jeu reste chargé et animé, mais masqué. Le cheval Tripo recopie sa pose à chaque image : les règles,
les collisions, le saut et les commandes tactiles ne changent pas.

Captures du jeu (§ 9) :

- `captures/01-vues-tripo-classique-realiste.jpg` : profil, face et trois-quarts, rendus par le jeu ;
- `captures/vues/` : toutes les vues, modèle par modèle.

## 2. Choix de la source : Qualité plutôt que HD ou Mobile

| Fichier | Triangles | Sommets | Textures |
|---|---|---|---|
| HD | 300 000 | 179 905 | 2048 / 1024 / 2048 |
| Qualité | 100 000 | 79 904 | 2048 / 1024 / 2048, identiques à HD octet pour octet |
| Mobile | 74 390 | 67 099 | 1024 / 1024 / 1024 |

- **Mêmes textures.** HD et Qualité portent exactement les mêmes trois images : comparaison par empreinte sha256.
- **Même forme.** Mêmes dimensions, à 0,3 mm près. Chaque sommet HD est à 4,2 mm au plus en médiane d'un sommet
  Qualité, 11,9 mm pour 95 % d'entre eux, à l'échelle du jeu. C'est un majorant : la distance à la surface est
  plus faible.
- **Pourquoi Qualité.** La version finale descend à 30 000 et 8 000 triangles. Partir de 300 000 n'apporte rien de
  visible à cette densité et triple le temps de calcul.
- **Pourquoi pas Mobile.** Elle perd la résolution de la couleur, 1024 au lieu de 2048.

Comparaison : `captures/02-comparaison-hd-qualite-niveaux-de-detail.jpg`. Lignes de haut en bas : HD, Qualité,
version optimisée de près, de loin. Colonnes : profil, tête, maillage en fil de fer.

## 3. Calage dans le repère du jeu

Unités natives de la source : environ 0,246 × 0,738 × 0,980, sans unité définie. Le calage se fait sur le squelette du
cheval du jeu, en mètres.

- **Échelle 2,72.**
  - Écart entre les sabots avant et arrière : 1,36 m, contre 1,35 m pour le cheval du jeu.
  - Hauteur au garrot : environ 1,72 m, contre 1,65 m au garrot osseux du cheval du jeu.
  - Ligne du dos : à ±3 % de celle du cheval du jeu.
- **Décalage.** +0,253 m vers l'avant, pour que le milieu des sabots soit à l'aplomb de celui du cheval du jeu.
  Semelles à y = 0.
- **Tête redressée.** Dans la source, la tête est tournée de 19,3° vers la gauche du cheval. Elle est remise dans
  l'axe par une rotation limitée à la tête ; l'écart restant est de 0,4°. Les normales de la zone de transition sont
  recalculées exactement : erreur maximale ramenée de 33,5° à 0.

## 4. Réparation du maillage et relief des plaques

- **Faces.** 10 faces étaient retournées par rapport à leurs voisines ; elles sont réorientées.
- **Normales.**
  - 221 normales étaient opposées à leurs faces ; elles sont corrigées.
  - 1 061 normales de couture divergeaient de 30 à 54° de leur jumelle et faisaient de fines traces sur l'encolure ;
    elles sont corrigées aussi.
- **Tapis et quartiers modelés dans le maillage.** La génération Tripo avait sculpté le tapis de selle et les deux
  quartiers : dalle, bords roulés, marche, coutures.
  - Les 9 068 sommets de la zone sont replacés par résolution sur coordonnées laplaciennes, en prolongeant la courbure
    du pelage voisin (`scripts/real/tripo/relief-plaques.mjs`).
  - Déplacement moyen : 6,9 mm, dont 2,5 mm le long de la surface, ce qui évite de faire glisser la texture.
  - Les UV restent intactes.
  - Contours : `captures/07-relief-du-tapis-forme-seule.jpg` et `08-relief-du-quartier-forme-seule.jpg`, en
    rendu de forme seule, source à gauche, version construite à droite.
- **Micro-replis.** Ce sont de minuscules triangles repliés qui s'affichent comme des points sombres. 18 sont retirés
  de près et 5 de loin ; le trou laissé fait moins de 2 mm².
- **Trou.** Une seule ouverture subsiste, au bout de la queue dans les crins : 6 arêtes, sous un millimètre. Elle
  est laissée telle quelle.

## 5. Nettoyage de la robe (textures)

Chaque texel de l'atlas reçoit sa position 3D. Les défauts sont repérés en 3D, puis remplis par un champ
lisse diffusé sur la surface et par le grain du poil emprunté à la robe saine voisine
(`scripts/real/tripo/clean-texture.mjs`).

| Défaut de la source | Traitement |
|---|---|
| Tapis rosé sur le dos (106 508 texels) | Robe environnante, grain du poil couvert à 99,8 % |
| Quartiers bruns (31 075 et 28 490 texels) | Idem (grain couvert à 94,5 et 95,3 %) ; relief de la carte de normales au bord ramené de 8,7 / 6,9 au niveau du poil voisin (1,7) |
| Mèche de crinière couchée sur le garrot | Conservée (6 707 texels), fondue sur 4 mm vers la robe |
| 11 taches sombres, 75 points brillants de rugosité | Remplis |
| Points venus d'UV dégénérées (6 257 triangles sans texel) | 149 texels de couleur et 215 de rugosité corrigés |
| Métal jusqu'à 104/255 avec un facteur de métal de 1 | Mis à 0 partout |

- **Contrôle.** Aucun texel de couleur, de normales ou de rugosité n'a changé hors des zones traitées.
- **Planches.** `captures/04` à `06` et `09` (source à gauche, version construite de près puis de loin).
- **Contrôle indépendant.** Trois passes ont été jugées par un contrôleur distinct ; la troisième est validée.
  Restes mineurs, visibles seulement en gros plan :
  - une légère couture d'UV dans le remplissage d'un quartier ;
  - la pointe adoucie de la mèche du garrot ;
  - quelques traits sombres dans le pli du ventre, déjà en partie dans la source ;
  - une bande claire en diagonale sur le flanc droit, qui vient de la source.

## 6. Réduction des polygones

meshoptimizer, en tenant compte des normales et des UV. Les sommets gardés sont ceux de la source, donc les UV et
les poids de peau restent exacts.

| Niveau | Triangles | Sommets | Écart géométrique |
|---|---|---|---|
| De près | 29 982 | 21 316 | 0,12 % de la taille du cheval, environ 3 mm |
| Au-delà de 25 m | 7 993 | 6 852 | 0,52 %, environ 14 mm |

Les deux niveaux partagent le même squelette, les mêmes textures et le même matériau. La construction vérifie le
fichier : une peau de 50 os, utilisée par les deux maillages, sans accesseur orphelin.

## 7. Squelette, poids de peau et pilotage

- **Squelette.** Les 50 os du cheval du jeu, mêmes noms, même hiérarchie, rotations de repos nulles
  (`scripts/real/tripo/skeleton-fit.mjs`).
  - Les articulations des membres sont mesurées sur le maillage, au centre du plateau de largeur de chaque
    section, puis symétrisées. Écart gauche/droite brut : 1 cm au plus ; la construction s'arrête au-delà de 1,5 cm.
  - La nuque, la gorge et les oreilles sont mesurées sur la tête redressée.
  - Le tronc, l'encolure, la queue et les ancrages (selle, rênes, étriers, longe) sont recalés sur la silhouette.
- **Poids de peau.** Ils sont automatiques, 4 influences au plus par sommet (`skin-weights.mjs`).
  - Les crins de la queue sont reconnus par la géométrie (17 708 sommets) et ne suivent que la queue : aucun poids de
    postérieur, contre 5 206 sommets avant correction. La construction s'arrête si cela se reproduit.
  - Aucun membre ne suit la queue, ni le membre du côté opposé.
- **Pilotage** (`src/entities/tripoHorse.js`). Le cheval du jeu, masqué, reste animé comme avant. À chaque image,
  le Tripo recopie la rotation de chaque os et le mouvement du thorax, puis :
  - **membres** : une IK à deux segments pose le boulet du Tripo sur celui du cheval du jeu ;
  - **portée** : le membre du Tripo, presque tendu au repos, est un peu plus court. Quand la cible est hors de
    portée, l'épaule (5 cm au plus) ou la hanche (4 cm au plus) se rapproche d'elle, comme le thorax qui s'abaisse
    entre les antérieurs à l'appui ;
  - **contact** : près du sol, le point le plus bas du sabot du Tripo est posé à la même hauteur que celui du sabot
    du jeu, chacun au-dessus du sol sous sa propre sole. Les deux contours sont mesurés sur les maillages. Le sabot
    du Tripo, plus long et plus écarté, ne s'enfonce donc ni au basculement sur la pince, ni en dévers, ni au bord
    d'un trottoir. En l'air, c'est le centre de la sole qui suit ;
  - **queue** : longue, avec des crins jusqu'à 15 cm du sol, elle reçoit des rotations atténuées de la base au bout ;
  - **longe et empreintes** : la longe s'attache au licol du Tripo ; empreintes et éclaboussures suivent ses sabots ;
  - **coût** : 0,2 à 0,4 ms par image en rendu logiciel.
- **Sellerie.** Le tapis, la selle, la sangle et les étriers du jeu sont conservés : ils tombent sur le dos du Tripo
  à 1 cm près. Le filet, les rênes, le licol, les guêtres et le bonnet sont masqués : ils sont faits pour la tête et
  les membres du cheval du jeu (§ 12).

## 8. Robe : texture d'origine ou variante « aperçu »

Dans le jeu, la robe du Tripo paraît **alezan très clair, presque crème**. L'aperçu du fournisseur
(`Apercu_Cheval_HD.png`) montre un cheval **brun**. J'ai mesuré l'écart :

- **Texture.** Corps (163, 130, 108), rapport rouge/vert 1,25.
- **Aperçu.** Épaule (95, 78, 68), rapport rouge/vert 1,22 à 1,28. C'est la même teinte, environ 40 % plus sombre :
  l'aperçu a été rendu sous un éclairage plus faible.
- **Métal.** Il n'y est pour rien : il vaut presque 0 sur le corps.
- **Visionneuse neutre.** Le modèle d'origine, sans aucun changement, y paraît aussi clair que dans le jeu.

**Par défaut, la robe est celle de la texture,** sans changement de teinte, pour respecter « préserver la robe ».

**Variante « aperçu ».** La robe est assombrie d'un facteur 0,52, mais les balzanes, la liste et les autres marques
blanches sont conservées. C'est la plus proche de l'aperçu.

- Pour l'obtenir : `node scripts/real/build-tripo-horse.mjs --robe apercu`, puis recharger `?tripohorse`.
- Pour revenir à la robe d'origine : relancer la construction sans `--robe`.
- Comparaison : `captures/03-robe-origine-variantes-apercu.jpg`. On y voit la texture d'origine, les variantes
  0,62 et 0,52, puis l'aperçu.

## 9. Tests en jeu

Test `tests/e2e/tripo-horse.mjs`, joué en rendu logiciel avec les commandes normales :

- direction et vitesse au joystick, galop et saut aux boutons ;
- la manche de CSO est pilotée par le cavalier de test habituel, qui ne déplace jamais le cheval.

**Passage final, version finale du code et du modèle : 30 contrôles sur 30 réussis**, manche de CSO comprise,
« CHEVAL TRIPO : ESSAI OK ». Une vérification indépendante a refait les sections A, B et C : 24 sur 24.
Détail : `mesures/test-en-jeu-controles.txt` et `mesures/test-en-jeu-rapport.json`.

### Ce que mesure le test

- **Sabots.** Le point le plus bas des sommets réels du bas de chaque sabot, pour le Tripo et pour le cheval du jeu,
  au-dessus du sol sur lequel le cheval marche.
- **Appui.** Il est lu dans l'animation du jeu : sabot verrouillé, sans bascule sur la pince.
- **Seuils.** Chacun est tiré des mesures en jeu, à environ 1,5 à 2 fois le maximum mesuré.
- **Contrôle du test lui-même.** Une copie du calcul, sur la vraie géométrie, montre que chaque contrôle durci
  échoue si l'on retire une partie du pilotage (seconde passe, portée, contour des sabots).
- **Animation du jeu.** Ses propres écarts sont rapportés à part, pour information. Par exemple, ses sabots
  s'enfoncent jusqu'à 10,7 cm sur l'image de réception d'un saut ; le Tripo les suit fidèlement.

### Résultats (cm)

| | Pas | Trot | Galop | Grand galop | Sauts | Manche de CSO | Seuil |
|---|---|---|---|---|---|---|---|
| Allure obtenue | 1 (1,9 m/s) | 2 (4,6 m/s) | 3 (9,7 m/s) | 4 (14 m/s) | – | – | – |
| Sabot posé : Tripo − jeu | −0,3 … +0,9 | 0 … +0,9 | −0,2 … +0,6 | −0,3 … +0,3 | – | −0,2 … +0,2 (901 images) | −0,8 / +1,4 |
| Glissement pendant l'appui (ligne droite) | 0,02 | 0,02 | 0,04 | 0,03 | – | 0,07 | 0,15 |
| Suivi près du sol | 0,8 | 1,0 | 0,7 | 0,8 | 0,2 (réception) | 0,7 | 1,5 |
| Suivi en l'air (centre de la sole) | 0,7 | 0,7 | 1,0 | 0,1 | 1,5 | 1,6 | 2,5 |
| Avant/arrière | 0,7 | 0,8 | 1,0 | 0,4 | 2,2 | 2,3 | 4,0 |
| Enfoncé au-delà du sabot du jeu | 0,5 | 0 | 0,7 | 0,6 | 0,1 | 0,3 | 1,2 |

### Contrôles

- **A0.** Le cheval Tripo est chargé en essai de session et piloté par le cheval du jeu : 50 os, 29 982 et 7 993
  triangles.
- **A1.** Rien n'est remplacé :
  - le cheval du jeu est masqué mais toujours animé ;
  - le réglage « Chevaux 3D » est inchangé (classique → classique) ;
  - aucun autre cheval n'a pris le Tripo.
- **A2.** Vues au repos du Tripo, du cheval du jeu (licol visible) et du cheval réaliste actuel, dans la même pose,
  chacun avec son état d'affichage. Voir `captures/01-vues-tripo-classique-realiste.jpg` et `captures/vues/`.
- **A3.** Au repos, sur un terrain en dévers de 21,5 %, chaque sabot du Tripo est posé comme celui du jeu, de +0,2 à
  +0,7 cm.
- **B.** Pas, trot, galop et grand galop : allure, suivi, appui et sol (tableau ci-dessus). Vidéo `videos/allures.mp4`.
- **C.** Deux sauts sur la carrière d'échauffement, tous deux franchis.
  - Le Tripo est vérifié à chaque image : 84 images à l'appel, en suspension et à la réception.
  - Le suivi passe à chaque phase, et le Tripo ne s'enfonce pas plus que le jeu.
  - Vidéo `videos/sauts.mp4`.
- **D.** Épreuve de CSO complète au Pôle International : 10 efforts, de 1 à 8 (avec 4A/4B et 6A/6B).
  - Manche terminée en 59,9 s, **sans faute ni refus**, aucune téléportation.
  - Le Tripo est actif et affiché sur 1 943 images sur 1 943 ; suivi, appui et sol passent sur toute la manche.
  - Vidéo `videos/cso.mp4`, planche `videos/planche-cso.jpg`.
- **E.**
  - Niveau de détail : le complet de près (4,2 m et 22 m), le réduit au loin (28 m et 40 m). Les triangles rendus
    correspondent exactement aux maillages.
  - Recopie de pose : 0,37 ms par image.
  - Aucune erreur JavaScript.

Les sections se lancent séparément : `--only=A,B,C,D,E`, ou `--no-cso` pour tout sauf la manche de CSO.

## 10. Ce qui garantit que rien n'est remplacé ni publié

- **Mode développement.** Tout le code d'essai est sous `import.meta.env.DEV` : chargement du modèle, module
  `tripoHorse.js`, option `?tripohorse`.
- **Version construite.** Une version construite le contrôle (`vite build` dans un dossier temporaire) :
  - aucun fichier `trial/` ni module Tripo ;
  - aucune chaîne « tripo », « trial/ » ou « horse_tripo » ;
  - il ne reste que deux méthodes vides et un crochet générique des sabots, sans effet sans essai.
- **Rangement.** Le modèle est dans `trial/`, hors de `public/`, et n'est jamais copié dans une version construite.
- **Sauvegarde.** L'option n'écrit rien dans la sauvegarde, en local comme en ligne. C'est vérifié en jeu : le
  réglage « Chevaux 3D » reste « classique ».
- **Non-régression.**
  - Les 263 tests unitaires du projet passent.
  - Sans l'option, l'affichage des chevaux suit exactement le même chemin qu'avant.
  - Le seul ajout commun est un crochet facultatif `horse.hoofAt` pour les empreintes et les éclaboussures,
    absent sans essai.

## 11. Performances et mémoire (rendu logiciel, pas sur iPhone)

| Mesure | Avec le Tripo | Cheval du jeu seul |
|---|---|---|
| Appels de dessin de la scène | 157 | 159 |
| Triangles de la scène, cheval de près | 650 387 | 646 747 |
| Écart de triangles, cheval de près / loin | +3 640 / −40 338 | – |
| Recopie de pose et IK | 0,37 ms par image | – |

- **Textures.** Couleur 2048 et deux cartes 1024 : environ 32 Mo en mémoire graphique, mipmaps comprises.
  - Le cheval réaliste actuel en charge huit, dont une de 2048.
  - Fichier : 0,96 Mo, contre 3,4 Mo pour le cheval réaliste actuel.
- **Mémoire.** Tas JavaScript : 181 Mo, partie entière du jeu en rendu logiciel.

Ces chiffres viennent du navigateur de test. Sur iPhone, la cadence et la mémoire restent à mesurer (§ 13).

## 12. Limites connues

- **Sellerie de tête et protections.** Le filet, les rênes, le licol, les guêtres et le bonnet du jeu sont masqués
  sur le Tripo, et la longe s'attache sans licol dessiné. Il faudra les refaire pour sa tête et ses membres avant un
  remplacement.
- **Une seule robe.** Le Tripo garde sa robe propre. La recoloration par cheval du modèle réaliste ne s'y applique
  pas ; l'essai est donc limité au cheval principal et à celui que l'on monte.
- **Mâchoire, paupières et crinière.** La mâchoire et les paupières ne sont pas articulées. La crinière suit
  l'encolure, sans mouvement propre.
- **Queue.** Au saut et au grand galop, elle se soulève avec moins de souplesse que de vrais crins.
- **Virages serrés au pas.** Pendant l'appui, le sabot du Tripo peut glisser de 1 à 3 cm dans un virage serré au
  pas ou au trot. Ses postérieurs sont plus écartés de 10 cm, et cet écart tourne avec le cheval autour du sabot
  verrouillé du jeu. En ligne droite et dans les courbes de la manche de CSO, le glissement reste sous 0,8 cm.
  Correction possible : verrouiller aussi le sabot du Tripo pendant l'appui.
- **Bords de trottoir.**
  - Quand le cheval du jeu pose un sabot juste devant une marche, la pince du Tripo, plus longue de 3 à 4 cm, peut
    entrer dans la face de la marche.
  - Un sabot en l'air peut sauter d'environ 4 cm sur une image en franchissant l'arête.
  - La version précédente faisait autant ou plus. Les tests d'allure et de concours se jouent sur sol plat ou en
    dévers, où ce cas n'existe pas.
- **Animation du cheval du jeu.** Ses propres sabots s'enfoncent brièvement à la réception d'un saut, jusqu'à 11 cm.
  Le Tripo le suit fidèlement : ce n'est pas un défaut du modèle, et l'animation existante n'a pas été modifiée.
- **iPhone.** Rien n'a été mesuré sur un appareil réel.

## 13. Décisions à prendre

1. **Remplacement.** Après votre validation visuelle (captures et vidéos), on peut faire du Tripo le modèle du mode
   réaliste. Il faudrait :
   - déplacer le GLB dans `public/real/` ;
   - activer le modèle hors du mode développement ;
   - refaire la sellerie de tête ;
   - décider de la robe.

   Rien de cela n'est fait.
2. **Robe.** Texture d'origine, plus claire, ou variante « aperçu », plus sombre (§ 8). Si plusieurs chevaux doivent
   avoir des robes différentes, il faut prévoir une recoloration par cheval.
3. **Sellerie.** Refaire le filet, les rênes, le licol et les guêtres pour le Tripo.
4. **iPhone.** Lancer `?tripohorse` sur un iPhone réel, par le serveur de développement, et mesurer les images par
   seconde au galop et en épreuve, la mémoire et le chargement.
5. **Droits d'utilisation.** Le modèle a été généré avec Tripo et fourni par le porteur du projet. Les conditions
   d'utilisation dépendent de l'offre Tripo utilisée ; elles sont à confirmer avant toute publication.
6. **Budget.** Si l'iPhone peine, on peut réduire le niveau de près (30 000 → 20 000 triangles, option `--lod0`) ou
   passer la couleur en 1024.

## 14. Revues indépendantes

Chaque étape a été relue par des agents distincts, chargés de réfuter les constats avant de les retenir.

| Revue | Constats confirmés | Suite |
|---|---|---|
| Code d'essai, intégration, construction, test (première revue) | 18 | tous corrigés et revérifiés |
| Nettoyage de la robe (trois passes jugées) | 2 majeurs, puis mineurs | corrigés ; passe 3 validée |
| Logique de contact des sabots et mesure du test | 8 | 4 du pilotage corrigés, 4 du test corrigés ; seuils resserrés et vérifiés (deux tours) |

## 15. Fichiers

| Fichier | Rôle |
|---|---|
| `assets-src/horse-tripo/` | Source utilisée (Qualité), note du fournisseur, aperçu. HD et Mobile ne sont pas versionnées. |
| `scripts/real/build-tripo-horse.mjs` | Construction complète et reproductible (même fichier, octet pour octet), avec ses contrôles |
| `scripts/real/tripo/` | Calage, squelette, poids, réparation du maillage, relief des plaques, nettoyage de la robe |
| `trial/horse_tripo.glb`, `trial/horse_tripo.json` | Modèle d'essai et rapport de construction (hors de `public/`) |
| `src/entities/tripoHorse.js` | Pilotage du Tripo par le cheval du jeu (mode développement seulement) |
| `src/entities/realistic.js`, `src/game.js` | Essai de session `?tripohorse` (mode développement seulement) |
| `src/entities/horse/mesh.js`, `src/world/hoofprints.js` | Sellerie recalculée à la fin de l'essai ; empreintes sous les sabots affichés |
| `tests/e2e/tripo-horse.mjs` | Test en jeu (§ 9), sections `--only=A,B,C,D,E` |
| `LIVRAISON_CHEVAL_TRIPO/` | Ce rapport, captures, vidéos, mesures |
