# Equestrian Tour : identité du jeu, marques partenaires, publicités de nuit

À lire avant tout :

- **Aucun essai sur un iPhone réel.** Tout a été joué dans Chromium en rendu logiciel (SwiftShader), avec
  l'émulation d'un iPhone 13 en paysage (844 × 390, tactile), et sur un petit écran 667 × 308. Les captures et la
  vidéo sont l'image du jeu dans ce navigateur.
- **La version publique n'a pas changé.** Elle reste sur la version auditée b4796e7. Rien n'est publié sans votre
  accord et le circuit de validation du projet.
- **Aucune publicité tierce n'est diffusée.** Kingsland et STX restent en habillage neutre : aucune autorisation ni
  aucun fichier officiel n'a été fourni pour ces marques. Seul Strides apparaît, avec son fichier officiel, selon
  l'autorisation formulée dans votre demande.
- **Le travail est sur la branche `claude/strides-grand-tour`.** Aucune partie n'est effacée. Les anciennes
  sauvegardes se chargent telles quelles : la clé de sauvegarde et les identifiants techniques n'ont pas changé.
- **Réseau.** Depuis cet environnement, le proxy refuse (403) get.strides-app.com, strides-app.com,
  kingslandequestrian.com, apps.apple.com et les sites STX. Je ne l'ai pas contourné. Conséquence : le fichier
  `https://get.strides-app.com/assets/strides-logo.png` n'a pas pu être téléchargé pour comparaison (voir § 2).

## 1. Le nom du jeu : EQUESTRIAN TOUR

- **Titre.** Le titre affiché est « EQUESTRIAN TOUR ». Dans le texte courant, le jeu s'appelle « Equestrian Tour »
  (`CONFIG.name` et `CONFIG.title` dans `src/config.js`).
- **Écrans concernés.**
  - choix de la langue, chargement, écran titre, consigne de rotation, pause ;
  - écran de fin (« Légende de l'Equestrian Tour »), mode photo ;
  - défis : règles, résultat, carte de résultat et texte de partage ;
  - partage du jeu, réglages et « à propos » ;
  - page HTML (titre, description, og:title, titre iOS), manifeste, icônes ;
  - README, en-tête des épreuves (« EQUESTRIAN TOUR · Pôle International ») ;
  - traductions anglaises.
- **Icônes.** Les icônes de l'application (écran d'accueil, PWA) portent un monogramme typographique « ET » aux
  couleurs du jeu, généré par `scripts/make-icons.mjs`. L'ancien pictogramme, une marque redessinée, est retiré.
- **Strides.** Le nom Strides désigne uniquement la vraie plateforme et son application dans le téléphone du
  personnage. La ville reste **Deauville City**.
- **Ce qui ne change pas.** La clé de sauvegarde `strides-grand-tour-v1`, le nom du paquet et les identifiants des
  épreuves en ligne restent les mêmes. Les sauvegardes et les classements existants se chargent donc normalement.

Vérifié par `tests/e2e/identity.mjs`. Il contrôle :

- qu'aucun « Grand Tour » n'est affiché, ni en français ni en anglais ;
- que le titre est EQUESTRIAN TOUR sur chaque écran ;
- que chaque logo Strides de l'interface est le fichier officiel, à ses proportions ;
- que chaque logo des textures du monde correspond pixel à pixel au fichier officiel.

## 2. Le logo officiel Strides

**Fichier utilisé :** `src/assets/partners/strides/strides-logo-full.png`.

- 1247 × 355 px, noir sur fond transparent ;
- sha256 `11df571dc60709ca9cc6328f1277cb083b6e748747276eef716b4c315a69d92e` ;
- récupéré le 21 octobre 2026 à l'adresse
  `https://strides-app.com/assets/assets/images/logo-full.7c83b30d34ccfa4c8b8bc0939fc32ffc.png`, sur le site officiel ;
- il contient le monogramme (le S stylisé à tête de cheval) et le mot STRIDES.

**Monogramme seul :** `strides-mark.png` (248 × 355). C'est une découpe exacte du même fichier, à la première
colonne vide (x = 248), sans rééchantillonnage ni retouche.

**À vérifier de votre côté.** Le fichier de référence cité dans la demande,
`https://get.strides-app.com/assets/strides-logo.png`, est bloqué ici. Je n'ai donc pas pu le comparer au fichier
utilisé. S'il diffère, déposez-le à la place de `strides-logo-full.png`, ou de `strides-mark.png` s'il s'agit du
monogramme seul. Tous les emplacements suivent automatiquement, avec leurs proportions.

**Règles appliquées partout** (point d'entrée unique : `src/ui/logo.js`) :

- le fichier est affiché tel quel, jamais redessiné, recomposé ni déformé ;
- la largeur se déduit toujours de la hauteur ;
- sur fond sombre ou sur une surface 3D, il est recoloré d'une seule teinte : seule la couleur change, la forme reste
  celle du fichier (masque CSS ou alpha d'origine) ;
- si le fichier ne peut pas être lu, l'emplacement reste neutre et un avertissement est noté. Aucun logo de
  substitution n'est affiché.

**Logos incorrects corrigés** (remplacés par le fichier officiel) :

| Où | Avant | Maintenant |
|---|---|---|
| Interface (téléphone, titre, écrans, carte) | Tracé vectoriel redessiné | Fichier officiel (`<img>` ou masque du même fichier) |
| Toit de Strides HQ | Logotype 3D redessiné en relief | Enseigne double face au logo officiel |
| Colline au-dessus de la ville | Lettres « STRIDES » en police 3D générique | Logo officiel découpé (une teinte, proportions du fichier) sur une ossature d'acier, visible depuis la ville |
| Tapis de selle | « S T R I D E S » espacé | Logo officiel de 17 cm au coin arrière-bas, entièrement visible cavalier en selle, proportions compensées pour chaque modèle de cheval (classique : 1,77 mesuré sur la géométrie ; réaliste : 1,43) |
| Rampe du camion de secours, présentoir des commerces | Monogramme et lettrage redessinés | Fichier officiel |
| Panneaux de la lice de Paris, écran de bord du Defender | Lettrage « STRIDES » en police générique | Logo officiel, compensé pour la surface |
| Bandeaux du Pôle, panneau d'entrée | Proportions approximatives | Tuiles 8:1 et 4:1 aux proportions du fichier |
| Panneau du jury | « Chronométrage · STRIDES » | « Chronométrage » (Strides n'est pas chronométreur) |
| Carte de résultat des défis | Logo Strides | Sans logo Strides (c'est une carte du jeu) |

## 3. L'application Strides dans le téléphone

L'application Strides du téléphone garde toutes ses fonctions :

- missions et demandes des clients ;
- accepter, puis réaliser ;
- rémunération fictive et réputation ;
- recrutement d'un professionnel.

Plusieurs mentions séparent clairement le jeu de la plateforme :

| Où | Mention |
|---|---|
| En-tête de l'application | Logo officiel et mention « Version jeu » |
| Première ouverture de l'application | « Strides · version jeu. Missions, profils et sommes fictifs. Rien n'est envoyé, aucun paiement réel. » |
| Écran titre | « Application intégrée » (logo officiel) : « Avec l'application Strides intégrée au téléphone du personnage — missions et paiements fictifs dans le jeu. » |
| Création du personnage | « Ton profil Strides · version jeu » |
| Publicité Strides de la nuit | « Publicité pour la plateforme réelle Strides. Dans Equestrian Tour, missions, profils et paiements sont fictifs. » |

**Textes du jeu corrigés.** Strides désigne désormais uniquement la plateforme réelle :

- **Le camion du jeu** (le Scania STX de l'Écurie du Val) s'appelait « camion Strides ». Il s'appelle maintenant
  « le camion » dans les consignes, et « Camion de l'écurie » sur la carte. Rien ne laisse croire que Strides possède
  ou exploite des camions.
- **Quatre répliques de passants et une astuce de chargement** prêtaient à Strides des services qu'elle ne propose
  pas : un « Strides Transport », la recherche de pension, les inscriptions aux concours, un « suivi en direct ».
  Elles sont remplacées par des usages réels, tirés du site officiel : trouver un chauffeur pour partir en concours,
  un renfort au profil vérifié. Les autres textes sur Strides étaient déjà conformes au site et n'ont pas changé.

## 4. Marques partenaires : configuration

**Les marques** sont décrites dans un seul fichier, `src/partners/partners.js`. Chacune y a :

- un statut : `authorized`, `pending` ou `disabled` ;
- la trace de l'autorisation (qui, quand, pour quels usages) ;
- ses ressources officielles et ses liens ;
- son habillage neutre.

**Règle du code.** Une marque tierce n'apparaît (nom, logo, visuel) que si son statut vaut `authorized` et que le
fichier officiel correspondant est fourni. Sinon, c'est l'habillage neutre de l'emplacement qui s'affiche, jamais un
logo inventé.

| Marque | Statut | Ce que voit le joueur |
|---|---|---|
| Strides | `authorized` (votre demande du 2 novembre 2026) | Logo officiel, capture réelle de l'application, publicité de nuit |
| Kingsland | `pending` | Boutique « Sellerie & Mode Équestre » et emplacement de nuit en habillage neutre |
| STX | `pending` | Véhicules STX intacts (lettrages « STX » d'origine des modèles fournis) ; grands emplacements latéraux en habillage neutre |

### 4.1 Boutique d'équitation de Deauville City, prête pour Kingsland

C'est l'ancienne boutique de vêtements de la ville, dans le même bâtiment, avec la même porte et le même identifiant
de sauvegarde.

- **Intérieur 3D reconstruit.** On y trouve :
  - vestes de concours, softshells, polos, pantalons d'équitation ;
  - podium des bottes et casques, mur des accessoires ;
  - coin du cheval : tapis, bonnets, guêtres, tête de présentation ;
  - cabine d'essayage et miroir, comptoir et vendeuse, clientes, vitrines.
- **Achats.** On entre, on parcourt, on essaie en cabine et on achète avec l'argent fictif du jeu.
- **Tenue visible.** Veste, pantalon, gants, casquette et bottes sont portés par l'avatar partout, y compris en
  concours, où le pantalon blanc réglementaire est imposé. Tapis, guêtres et bonnet se voient sur le cheval.
- **Les articles de l'ancienne boutique** restent en vente.
- **Habillage neutre** (`storeSkin.js` et `storeBrand.js`) :
  - nom : « Sellerie & Mode Équestre » ;
  - sous-titre : « Tenues d'équitation · Équipement du cheval » ;
  - pictogramme générique (un fer à cheval) ;
  - aucun nom, logo, visuel ni slogan Kingsland.
- **Pour activer Kingsland**, une fois les droits obtenus :
  1. déposer le logo et le visuel de vitrine officiels dans `src/assets/partners/kingsland/` ;
  2. les importer dans `BRANDS.kingsland.assets` (`logo`, `storefront`) ;
  3. passer le statut à `authorized` et renseigner `authorization`.

  Le nom officiel, le logo et le visuel s'affichent alors tels quels, à leurs proportions : bandeau, enseigne
  drapeau, vitrines, porte, panneau du comptoir et caisson lumineux.

### 4.2 Véhicules STX

- **Ce qui est conservé.** Le camion Scania et le van Master STX sont intacts : modèles, interactions, rampes,
  portes, chargement et lettrages « STX » d'origine.
- **Quatre emplacements** sont prêts pour le grand logo latéral, un sur chaque flanc des deux véhicules
  (`src/partners/liveries.js`).
- **Pose.** Le décor est projeté sur la tôle réelle (DecalGeometry). Il épouse la carrosserie, sans élément flottant.
  Il reste hors des ouvertures, charnières, feux, vitrages et poignées, ce qui est vérifié triangle par triangle.
- **Habillage neutre.** En attendant le logo officiel, chaque emplacement porte un double filet graphite, sans texte
  ni forme de marque.
- **Pour activer le logo STX :**
  1. déposer le fichier officiel dans `src/assets/partners/stx/` : un PNG transparent d'au moins 2 048 px de large,
     ou un SVG ;
  2. l'importer dans `BRANDS.stx.assets.sideLogo` ;
  3. passer le statut à `authorized` et renseigner `authorization`.

  Le logo est alors posé sur les quatre emplacements, à ses proportions. Une mire de test (« TEST ») a validé le
  placement : voir `captures/stx/`.

## 5. Les publicités de la nuit

**Déclenchement.** Elles passent seulement avec « Dormir jusqu'au matin », au lit de la maison de l'Écurie du Val.

| Étape | Durée par défaut | Ce qui se passe |
|---|---|---|
| Coucher | 0,8 s | Le personnage s'allonge, l'écran s'assombrit. Commandes suspendues, simulation à l'arrêt. |
| Nuit | 0,8 s | Ciel de nuit, lune et étoiles. À l'écran noir, la nuit est appliquée : 7:00, énergie, cheval reposé, sauvegarde. |
| Publicité 1 | 4,5 s | Emplacement Kingsland, en habillage neutre aujourd'hui, mention « Partenaire ». |
| Publicité 2 | 4,5 s | Strides, mention « Publicité ». |
| Lever du jour | 1,8 s | Dégradé d'aube. Réveil dans le lit, le personnage se relève, carte « Bonjour ! » de la nouvelle journée. |

**Commandes de la séquence**

- Chaque publicité porte une mention discrète (« Publicité », ou « Partenaire » pour l'habillage neutre), un
  compteur (1/2, 2/2) et une barre de progression.
- **« Passer »** apparaît après 1 s, en bas à droite. Sa place est réservée dès le début, pour que rien ne bouge sous
  le doigt. Il passe à la publicité suivante ; sur la dernière, il mène au lever du jour.
- **La destination externe** (« Découvrir Strides », vers https://strides-app.com/) est en bas à gauche, jamais sous
  le doigt de « Passer ».
  - Elle ne s'ouvre que si le joueur la touche, dans un nouvel onglet, pendant que la séquence continue.
  - Un toucher dans la première demi-seconde est ignoré.
  - Elle ne s'ouvre jamais automatiquement. L'App Store n'est jamais ouvert.

**Garanties**

- **Sommeil.** Le sommeil, la récupération et la progression ne dépendent jamais d'une publicité. La nuit est
  appliquée et sauvegardée à l'écran noir, avant la première publicité.
- **Une séquence par nuit de jeu au plus**, enregistrée dans la sauvegarde (`save.data.ads.lastNight`). Elle n'est
  jamais rejouée, ni après un rechargement, ni si l'on se recouche.
- **Jamais de publicité :**
  - pendant une mission, un concours engagé, une épreuve ou un défi ;
  - au volant ou à cheval ;
  - pendant une sieste ou avec « Passer à la journée suivante » ;
  - en restant debout la nuit, ou à la reprise d'une sauvegarde.
- **Simulation suspendue** pendant toute la séquence : heure du jeu, besoins du cheval, missions et commandes. Les
  relevés du test (toutes les 100 ms) le confirment.
- **Économie de batterie.** Pendant les publicités, l'écran est entièrement couvert. La scène 3D, le HUD et la carte
  ne sont plus mis à jour ni redessinés ; seules les commandes sont lues. La mesure de cadence qui règle la qualité
  automatique est suspendue aussi.
- **Médias.**
  - Ils sont préchargés à l'entrée dans la maison, puis au lit.
  - À l'écran noir, chaque média est attendu au plus 1,2 s.
  - Un média lent ou absent ne retire que sa propre publicité : l'habillage neutre la remplace, ou elle est sautée.
  - Il n'y a jamais d'écran noir prolongé, et le sommeil continue normalement.
- **Robustesse.**
  - Onglet en arrière-plan ou téléphone tenu en portrait : la séquence se met en pause, puis reprend sans rattrapage.
    En portrait, l'invitation à tourner le téléphone passe devant.
  - Le temps de la séquence est borné à 0,5 s par image : un appareil lent ne la saute pas.
- **Toujours une seule transition à la fois.** Le lit est verrouillé pendant toute la séquence.

**Kingsland (emplacement 1)**

- **Aujourd'hui.** Une maquette neutre est affichée : « Deauville City · Sellerie & Mode Équestre · Tenues
  d'équitation · Équipement du cheval · Boutique du jeu, en ville : essayer, acheter, s'équiper ». Elle n'a ni logo
  ni visuel Kingsland, et ne présente ni promotion ni partenariat.
- **La campagne prévue** est `kingsland-aw26-nuit` (statut `pending`, du 1er septembre 2026 au 31 mars 2027). Ses
  références sont les pages des collections automne-hiver 2026 et printemps-été 2026, que je n'ai pas consultées
  (sites bloqués, et usage non autorisé).
- **Une fois autorisée**, il suffit de fournir la photographie de campagne, le logo et un texte validé par la marque.

**Strides (emplacement 2)** : une création originale animée en trois temps.

1. **Le besoin.** Deux questions reprises mot pour mot du site officiel :
   - « Votre groom annule à la dernière minute ? »
   - « Besoin d'un chauffeur pour partir en concours ? »
2. **L'application.** Une capture authentique de l'application, dans un téléphone.
3. **La promesse.** L'accroche « Ton prochain job dans le monde du cheval commence ici. », puis les trois promesses
   du site (« Profils vérifiés · Paiement sécurisé · Sans abonnement »), le logo officiel et strides-app.com.

Une mention en petits caractères distingue la plateforme réelle du jeu. Rien ne laisse croire que l'argent ou les
missions du jeu sont réels.

## 6. Système de campagnes (modulaire)

`src/partners/campaigns.js` décrit l'emplacement et les campagnes. Le moteur du jeu n'a pas à changer.

| Champ demandé | Champ du code |
|---|---|
| Identifiant | `id` |
| Annonceur | `advertiser` (marque de `partners.js`) |
| Image ou vidéo | `creative.type` (`image`, `video` ou `strides-story`), `creative.src`, `creative.poster`, `creative.focus` (cadrage) |
| Durée | `duration` (secondes) |
| Logo | `creative.logo` (fichier officiel autorisé) |
| Message | `creative.headline`, `creative.line` |
| Destination | `url` (ouverte uniquement au toucher du joueur) |
| Dates | `start`, `end` |
| Statut d'autorisation | `status` de la campagne et statut de la marque (les deux doivent valoir `authorized`) |
| Emplacement et ordre | `slot` (`night`), `order` (1, 2) |
| Fréquence | `frequency.perNight` et `NIGHT_SLOT.perNight` (une séquence par nuit de jeu) |

**Réglages de l'emplacement** (`NIGHT_SLOT`) : activé ou non, durée de la tombée de la nuit (1,6 s), du lever du jour
(1,8 s), délai avant « Passer » (1 s), nombre de places (2).

**Repli neutre.** Une campagne non autorisée, expirée ou sans média laisse place à l'habillage neutre de la marque.
Il n'y a pas de repli pour Strides : sans ses médias, la publicité est sautée.

**Journal.** Les dix dernières diffusions sont enregistrées dans la sauvegarde (`save.data.ads.log`) : nuit,
campagne, neutre ou non, secondes affichées, passée ou non.

## 7. Ressources : source et statut d'autorisation

| Ressource | Fichier | Source | Date | Autorisation | Utilisation |
|---|---|---|---|---|---|
| Logo Strides complet | `src/assets/partners/strides/strides-logo-full.png` | strides-app.com, fichier officiel `logo-full.7c83b30d….png` | 21/10/2026 | Votre demande du 2/11/2026 (logo officiel et publicité Strides). À confirmer par le titulaire de la marque avant toute publication publique. | Partout (interface, monde, publicité) |
| Monogramme Strides | `src/assets/partners/strides/strides-mark.png` | Découpe exacte du fichier ci-dessus | 21/10/2026 | Idem | Carte, pastilles, icône de l'app dans le téléphone |
| Capture de l'application Strides | `src/assets/partners/strides/app-accueil-capture.png` (390 × 1080) | Capture authentique de strides-app.com (accueil, largeur 390 px) | 21/10/2026 | Idem | Publicité Strides (téléphone) |
| Textes Strides | `src/partners/campaigns.js` (provenance notée) | get.strides-app.com, cités mot pour mot | 21/10/2026 | Idem | Publicité Strides |
| Accroche Strides | idem | Votre demande | 2/11/2026 | Idem | Publicité Strides |
| Fichier `get.strides-app.com/assets/strides-logo.png` | — | Non téléchargeable ici (proxy 403) | — | — | Non utilisé (voir § 2) |
| Fiche App Store id6793963102 | — | Lien enregistré dans `partners.js`, non consulté (bloqué) | — | — | Jamais ouverte par le jeu |
| Kingsland : logo, visuels, campagnes AW26 et SS26 | — | Aucune ressource récupérée | — | **En attente** | Habillage neutre |
| STX : logo officiel | — | Non fourni | — | **En attente** | Habillage neutre (double filet) |
| STX : lettrages d'origine | Modèles GLB fournis (`src/assets/vehicles/`) | Fournis avec les véhicules | — | Comme les modèles | Conservés tels quels |
| Icônes du jeu « ET » | `public/icon-*.png`, `apple-touch-icon.png`, `icon.svg` | Générées (`scripts/make-icons.mjs`, police Geist du projet) | 2/11/2026 | Création du projet | Écran d'accueil, PWA |

## 8. Revue adverse : défauts trouvés puis corrigés

Une relecture indépendante du lot a relevé les points 1 à 13. Les points 14 à 17 sont apparus pendant les essais. Tous sont corrigés et couverts par les tests.

1. **Écran de nuit posé trop tard.** Il apparaissait après le chargement des médias, ce qui laissait une ou deux
   images où la simulation tournait. Il est désormais posé tout de suite, et la simulation est suspendue dès la
   première image.
2. **Un média lent retirait toute la séquence.** Chaque média est maintenant attendu séparément, au plus 1,2 s, et
   seule la publicité concernée est remplacée ou sautée.
3. **Nuit marquée « diffusée » avant d'être appliquée.** La marque est désormais enregistrée dans la même sauvegarde
   que la nuit appliquée, à l'écran noir.
4. **Destination touchée par erreur.** Le bouton était placé sous le doigt de « Passer ». Il est maintenant à gauche,
   et la place de « Passer » est réservée à droite.
5. **Pas de pause en portrait.** La séquence se met en pause, et l'invitation à tourner le téléphone passe devant.
6. **Scène 3D dessinée inutilement sous les publicités.** Le rendu est suspendu pendant les publicités, ainsi que la
   mesure de cadence de la qualité automatique.
7. **Durée de campagne invalide.** Elle provoquait une publicité sans fin ; elle retombe maintenant à 4,5 s.
8. **Chemin des tests pas à pas différent du jeu.** Il est désormais identique, sans affichage.
9. **Logo trop étroit sur le tapis du cheval classique.** Le facteur de compensation est mesuré sur la géométrie
   (1,77 au lieu de 1,43).
10. **Lettres « STRIDES » en police générique sur la colline.** Elles sont remplacées par le logo officiel découpé.
11. **Mémoire du logo.** Le cache gardait toutes les réductions de toutes les teintes (environ 19 Mo). Il ne garde
    plus que les niveaux dessinés (moins de 2 Mo).
12. **Démarrage bloqué si le logo ne répond pas.** L'attente était de 15 s ; elle est ramenée à 6 s, puis
    l'emplacement reste neutre.
13. **Attribution « Chronométrage · STRIDES » inventée.** Elle est retirée.
14. **Travail inutile sous l'écran couvert.** Le jeu mettait encore à jour le HUD, la carte et la scène pendant les
    publicités, alors que rien n'en était visible. Désormais, seules les commandes sont lues, ce qui économise la
    batterie.

    Note sur les mesures en rendu logiciel : au début de la première publicité, le processeur graphique émulé finit
    encore les images 3D de la tombée de la nuit. La publicité 1 dure alors environ 32 s à l'horloge murale, mais
    4,5 s sur l'horloge de la séquence, qui ne saute jamais une publicité. Sur un vrai processeur graphique, ces
    images prennent 16 ms.
15. **Journal des publicités.** « Passée » n'était pas toujours exact. Il n'est enregistré que si « Passer » a
    vraiment écourté la publicité.
16. **Monogramme masqué sur le tapis.** Cavalier en selle, la jambe masquait le « S » du logo. Le logo est réduit à
    17 cm et placé au coin arrière, comme une broderie de tapis réelle.
17. **Nom de la boutique non traduit en anglais.** Le nom neutre est maintenant traduit, comme son sous-titre et la
    publicité de nuit. Un nom officiel autorisé resterait tel quel.

## 9. Modifications techniques

**Nouveaux fichiers**

- `src/partners/partners.js` : marques, statuts, autorisations, ressources.
- `src/partners/campaigns.js` : emplacement de nuit et campagnes.
- `src/partners/liveries.js` : emplacements STX.
- `src/assets/partners/strides/` : fichiers officiels.
- `src/ui/nightAds.js` : séquence et créations.
- `src/entities/livery.js` : décor projeté.
- `src/world/storeSkin.js`, `storeBrand.js`, `storeInterior.js` : boutique.
- `src/entities/horse/bonnet.js`.
- `src/i18n/en/partners.js`, `src/i18n/en/store.js` : traductions.
- `scripts/make-icons.mjs`.

**Fichiers modifiés (principaux)**

- `src/gameplay/rest.js` : nuit à publicités, une par nuit, jamais en mission.
- `src/game.js` : mise à jour et rendu suspendus pendant les publicités (commandes seules), logo chargé avant le
  monde, libellé de la carte.
- Textes : `src/gameplay/data.js` (répliques des passants), `src/ui/screens.js` (astuce de chargement), consignes du
  camion (`missions.js`, `trip.js`, `travel.js`, `story.js`, `jobs.js`, `parisGP.js`), traductions anglaises.
- `src/core/save.js` : `ads` avec ses valeurs par défaut, compatible avec les anciennes sauvegardes.
- `src/ui/logo.js` : fichier officiel, masque, dessin sur canvas, cache réduit.
- Identité : `src/config.js`, `index.html`, `public/manifest.webmanifest`, `src/ui/screens.js`, `phone.js`,
  `challenge*.js`.
- Monde et objets : `src/world/world.js` (enseignes, colline, panneaux), `src/world/textures.js`, `paris.js`,
  `src/entities/horse/tack.js`, `defenderModel.js`, `stxModel.js`, `masterModel.js`.
- Commerce et tenue : `src/gameplay/data.js` (catalogue), `commerce.js`, `player.js`.
- `src/styles.css` : séquence de nuit, publicités, mentions.

## 10. Vérifications

**Environnement.** Toutes les vérifications ont été faites dans Chromium en rendu logiciel (SwiftShader), sur un
iPhone 13 émulé en paysage, en séquentiel. Aucune n'a eu lieu sur un iPhone réel. Le détail est dans
`mesures/non-regression.txt`, avec les journaux de la nuit et de l'identité.

**Tests unitaires et traductions**

- 263 / 263 tests unitaires, dont les marques, les campagnes (image, vidéo, dates, autorisations), la boutique et
  les emplacements STX.
- Vérification des traductions : 1 926 traductions, aucune clé manquante.

**Tests de ce lot**

| Test | Résultat | Ce qu'il vérifie |
|---|---|---|
| `night-ads` | 27 / 27 | Voir le détail ci-dessous. |
| `identity` | 66 / 66 | Aucun « Grand Tour » en français ni en anglais ; EQUESTRIAN TOUR sur chaque écran ; chaque logo de l'interface est le fichier officiel ; chaque texture comparée pixel à pixel au fichier officiel (tapis des deux chevaux, colline, toit de Strides HQ, Pôle, Paris, Defender, carte). |
| `apparel-store` | 23 / 23 | Entrer, parcourir, essayer, acheter ; tenue portée dehors et en concours ; cheval équipé ; sauvegarde et reprise ; anglais ; aucune marque Kingsland affichée. |
| `stx-livery` | 55 / 55 | Emplacements sur les deux flancs du Scania et du Master ; décor sur la tôle, hors des ouvertures ; suit le véhicule ; rampes, portes et chargement intacts ; coût de rendu. |
| `strides-links` | 13 / 13 | Liens vers la vraie application ouverts seulement à la demande, retour au jeu. |

Le détail de `night-ads` :

- coucher et réveil ;
- les deux emplacements, avec leurs mentions ;
- habillage neutre sans marque Kingsland ;
- « Passer » (apparition après 1 s, effet immédiat) ;
- simulation suspendue (relevés toutes les 100 ms) et scène non redessinée pendant les publicités ;
- énergie à 100 % et 7:00 au réveil ;
- nouvelle journée sauvegardée ;
- pas de publicité :
  - la même nuit relancée ;
  - pendant une sieste ;
  - avec « journée suivante » ;
  - avec un concours engagé ;
- rechargement pendant les publicités : reprise au matin, rien n'est rejoué ;
- publicité indisponible : sautée, sommeil normal ;
- petit écran (667 × 308) ;
- destination ouverte au toucher seulement ;
- fluidité.

**Non-régression : toutes les suites existantes passent.**

- **Rythme de vie et lieux :** `life-rhythm` 31/31, `home-interior` 37/37, `shops` 31/31.
- **Missions :** `missions` 16/16, `chapter1` 27/27, `contest-full` 6/6, `challenge` 37/37, `request-flow` 20/20,
  `mission-resume` 13/13, `jobs` 16/16.
- **Paris et transport :** `paris` 20/20, `transport-flow` 65/65, `boarding` 72/72.
- **Véhicules :** `master` 26/26, `defender` 33/33, `vehicles` 48/48, `fuel` 12/12.
- **Sauvegarde et jeu :** `save-guard` 11/11, `i18n` 19/19, `pause` 7/7, `care` 8/8, `avatar-consistency` 9/9.
- **Concours et cheval :** `cso` 38/38, `cso-touch` 9/9, CSO Athens (Pôle 9/9, Paris 9/9), `horse-mount` 18/18.
- **Divers :** `qa-fixes` 19/19, `features` 20/20.

**Échecs de la première passe.** Six suites ont échoué lors de la première passe. Aucune cause ne venait du jeu
après analyse, sauf une (le nom de la boutique en anglais, corrigé). Toutes passent à la relance. Le détail est dans
`mesures/non-regression.txt`.

## 11. Captures et vidéo

Toutes les images viennent de Chromium en rendu logiciel, sur un iPhone 13 émulé en paysage (844 × 390). Ce ne
sont pas des captures d'iPhone réel.

### Vidéo `videos/nuit-coucher-publicites-reveil.mp4` (25 s, 15 images/s)

| Moment | Durée | Contenu |
|---|---|---|
| Le soir | 7,4 s | 22 h 15, énergie 31 % : retour à la maison, la chambre, « Se coucher », le menu du lit, « Dormir jusqu'au matin ». |
| La nuit | 15,1 s | Le personnage couché, tombée de la nuit, publicité 1 (emplacement Kingsland, habillage neutre, « Partenaire »), publicité 2 (Strides, « Publicité », laissée jusqu'au bout), lever du jour, réveil au lit à 7:00, carte « Bonjour ! ». |
| Le matin | 2,5 s | « Commencer la journée », 7:00, énergie 100 %. |

- **Horloge virtuelle.** La partie centrale est calculée image par image sur une horloge virtuelle : l'horloge de la
  page et les animations avancent exactement d'1/15 s par image. Elle montre donc les vraies durées de la séquence.
  Un enregistrement en temps réel du rendu logiciel les étirait (50 s au lieu de 12).
- **Journal.** `nuit-coucher-publicites-reveil.json` reprend le journal des publicités de cette nuit : 4,53 s chacune.
- **Planche.** `planche-video.jpg` montre une image par seconde.

### Captures

| Dossier | Contenu |
|---|---|
| `captures/nuit/` | Séquence et écrans (voir le détail ci-dessous) |
| `captures/identite/` | Écrans du jeu et logo officiel (voir le détail ci-dessous) |
| `captures/boutique/` | Façade de jour et de nuit (habillage neutre), intérieur, essayages, avatar équipé, cheval avec bonnet et guêtres |
| `captures/stx/` | Scania et Master : vues générales, habillage neutre de chaque flanc (jour, nuit, gros plan, rampe ouverte), mire « TEST » de placement |

**Dans `captures/nuit/` :**

- `0` : menu du lit ;
- `1` : le coucher ;
- `2` : **publicité 1, emplacement Kingsland en habillage neutre** ;
- `3a`, `3b`, `3c` : **publicité 2, Strides**, à ses trois temps (le besoin, l'application, le logo) ;
- `4` : lever du jour ;
- `5` : réveil ;
- `6` : les deux publicités sur un petit écran (667 × 308).

**Dans `captures/identite/` :**

- choix de la langue, chargement, titre EQUESTRIAN TOUR, création du personnage ;
- rotation, pause ;
- téléphone et application Strides (« Version jeu ») ;
- défis et carte de résultat, mode photo, écran de fin ;
- dans le monde :
  - Strides HQ et son toit ;
  - Pôle (entrée, bandeaux, écran géant), affiches ;
  - panneaux de Paris ;
  - colline (de loin et de près) ;
  - tapis de selle des deux côtés ;
  - écran du Defender ;
  - mini-carte.

## 12. Points à décider

1. **Autorisation Strides.** Confirmez que l'autorisation de votre demande couvre une diffusion publique : logo,
   capture de l'application, textes du site, lien vers strides-app.com. Elle doit venir du titulaire de la marque.
   Confirmez aussi que le fichier de get.strides-app.com est bien le même logo (§ 2).
2. **Kingsland.** Il faut les fichiers officiels (logo, visuel de vitrine, photographie de campagne, texte validé)
   et une autorisation écrite. Sans cela, l'habillage neutre reste en place.
3. **STX.** Il faut le logo officiel et une autorisation.
   - Les lettrages « STX » des modèles fournis sont conservés tels quels.
   - Le mot « STX » apparaît aussi dans les noms des véhicules (« Camion STX », « Master STX »). Faut-il les garder ?
4. **Mentions « STRIDES » restantes dans le monde**, en texte et non en logo :
   - panneau « PRIX STRIDES » à l'entrée de piste du Pôle ;
   - sous-titre « STRIDES » des tribunes ;
   - nom de lieu « Colline Strides », pour la colline qui porte l'enseigne.

   Ce sont des noms de jeu. Faut-il les garder, remplacer « STRIDES » par le logo officiel, ou les renommer (par
   exemple « Prix de Deauville City ») ?
5. **Publication.** Rien n'est publié tant que vous ne l'avez pas validé.

## 13. Limites

- Rien n'a été essayé sur un iPhone réel. Il faut encore vérifier sur un appareil la fluidité de la séquence, la
  lisibilité en paysage et l'ouverture de strides-app.com depuis Safari.
- Les durées réelles des captures et de la vidéo sont plus longues que celles du jeu : le rendu logiciel est lent.
  La séquence, elle, mesure son propre temps.
