# STRIDES Grand Tour — livraison de la version 2 (lots A, B, C)

Réponse au dossier de développement du 25 octobre 2026 (commanditaire : Julien Anquetin). Ce document suit la
section 18 du dossier : version exécutable, modifications intégrées, résumé par lot, décisions et paramètres,
résultats de recette (environnement et limites), procédure de migration et de récupération des sauvegardes,
destinations officielles et état réel de la mesure, extensions du lot D séparées. Conception détaillée :
[`conception-v2.md`](conception-v2.md).

## 1. Version exécutable et lancement

- Branche `claude/strides-grand-tour` (dépôt `anquetin10-cpu/game_strides`), version du jeu `BUILD = 2.0.0`
  (`src/config.js`), sauvegarde au format v2.
- Prérequis : Node 20 ou plus récent.
- Développement : `npm install` puis `npm run dev` (Vite, `http://localhost:5173`).
- Version de production : `npm run build` (dossier `dist/`) ; version en un seul fichier HTML :
  `npm run build:single` (dossier `dist-single/`).
- Tests unitaires : `npm test` (Vitest). Tests de bout en bout (Playwright + Chromium) : démarrer le serveur, puis
  par exemple `node tests/e2e/chapter1.mjs http://127.0.0.1:5173/`, `BASE=http://127.0.0.1:5173 node
  tests/e2e/save-guard.mjs` (voir l'en-tête de chaque fichier de `tests/e2e/`).
- Vérification locale de la mesure : ajouter `?metrics=1` à l'adresse (événements dans la console) ou lire
  `window.__metrics.log`.

## 2. Résumé par lot

### Lot A — fiabilité, sauvegardes, première session, pause

- **Sauvegarde v2** (`src/core/save.js`) : format versionné, chaîne de migrations, copie de secours avant toute
  migration, validation champ par champ, échec explicite. Une sauvegarde illisible n'est jamais remplacée en silence :
  elle est mise de côté, l'écran titre explique le problème et propose « Nouvelle partie » ou la restauration d'une
  copie. Registre des récompenses versées (`grantOnce`) : un double appui ou un rechargement ne paie jamais deux fois.
  Export / import de la sauvegarde dans Réglages.
- **Reprise sûre** : les missions à étapes (M1 à M3) enregistrent un point de reprise ; au lancement, une carte
  propose de reprendre au dernier point enregistré, sans refaire ni choix ni paiement. L'état du camion (rampe,
  cheval à bord) est déjà persistant.
- **Pause de la simulation** : pendant un dialogue, le téléphone, un écran de choix ou un résultat, l'heure du monde,
  la météo et les marées (calculées depuis l'heure), les besoins du cheval, les délais des offres et les chronos
  s'arrêtent ensemble. En arrière-plan, la boucle de rendu s'arrête, les commandes sont relâchées et le pas de temps
  est borné : aucun rattrapage punitif au retour.
- **Commandes et caméra** : 53 défauts recensés lors d'une campagne de recherche de glitchs (transport, monte, monde,
  PNJ, interface), tous corrigés et vérifiés par des mesures en jeu (personnage couché à la sortie du camion, rampe
  qui traversait le meneur, cheval qui reculait jambes en l'air, refus brutal, ailes d'obstacles traversées, caméra
  dans les toits, bouton ACTION vide au départ, notifications sous le téléphone, etc.).
- **Première session plus claire** : bouton d'action masqué tant qu'il n'y a rien à faire, mention fictive à la
  première ouverture de Strides, objectifs lisibles en 568×260.

### Lot B — chapitre 1 « Le Val en équipe »

- **Trois missions à choix** entre « Premiers pas » et les missions existantes (« Groom du matin » requiert désormais
  M3) :
  - **M1 « Deux écuries, une matinée »** : préparation au Val (Camille, 90 €), sortie en main au Haras (Antoine,
    140 €), les deux en tournée (bonus 40 €) ou refus des deux sans pénalité (reproposées plus tard).
  - **M2 « Un renfort avant le concours »** : parcours client dans **Strides › Recruter** (« Je cherche un
    professionnel ») ; besoin décrit, deux profils fictifs comparables (Léa Morel, 120 € ; Inès Ferrand, 200 €) ou
    « Je m'organise seul·e » (0 €). Débit à la confirmation (deux touchers), une seule fois ; quitter avant ne débite
    rien ; un échec technique restaure l'état et ne débite rien ; solde insuffisant → branche autonome.
  - **M3 « Le premier concours en équipe »** : approche prudente ou ambitieuse, aide de Léa sur place (80 €, débit
    unique), préparer → embarquer → conduire → débarquer → dossard → échauffement → épreuve → retrouver l'équipe.
    Points de reprise ; la participation (150 €) est acquise quel que soit le résultat ; après une élimination :
    « Nouvelle tentative » ou « Retrouver l'équipe ». Bilan : Camille débloque l'aire de pansage et la suite.
- **Trois personnages récurrents** : Camille Martin (responsable du Val : exigeante, précise, drôle), Léa Morel
  (groom expérimentée : compétente, directe, connectée), Maxime Vidal (cavalier rival du Haras : ambitieux,
  sportif). Ils se souviennent des choix (réplique de Camille selon M1, accueil de Léa selon M2, réaction de Maxime
  selon le classement de M3).
- **Deux usages de Strides** : prestataire (Demandes reçues, accepter / refuser / contre-proposer) et client
  (Recruter). L'app Strides du jeu ne contient plus que ces deux usages et le profil.
- **Réputation** à la place de la hiérarchie de statuts (« Pro vérifié » supprimé ; anciens niveaux convertis sans
  perte d'accès) et **compétences** simples : préparation, équitation, transport, organisation.
- **Amélioration visible** : aire de pansage couverte (350 €) dans « Mon écurie », construite au Val, persistante,
  achat unique ; préparation regroupée plus rapide (6 s → 4 s).
- **Téléphone** : Strides, Carte, Messages, Mes chevaux (santé, vente de chevaux d'un élevage fictif), Mon écurie
  (aménagements, équipe, compétences, matériel), Activités (lot C), Guide local (pensions et santé, fictif et hors
  Strides), Trophées, Météo, Photo, Réglages.

### Lot C — défi rejouable, carte de résultat, accès à la vraie application, mesure

- **Défi du Pôle** à conditions fixes et versionnées (`src/gameplay/challenge.js`) : parcours du Pôle (obstacles 1 à 8,
  1,10 m), cheval fourni Onyx à statistiques fixes, jour dégagé à 11 h, sol sec, aide au saut. Version courante
  `defi-pole-v3` : nouveau tracé du Pôle (≈ 245 m), temps accordé réglementaire de 42 s (245 m à 350 m/min), avec le
  galop de travail réaliste ; `defi-pole-v1` (75 s, ancien galop) et `defi-pole-v2` (47 s, ancien tracé) restent archivées avec leurs records. Règle de classement expliquée avant le départ (pénalités puis chrono). Record personnel local
  par version, relance immédiate, monde du joueur restauré après le défi. Accès depuis l'app Activités et depuis le
  panneau « Défi du Pôle » à l'entrée du Pôle.
- **Carte de résultat** (canvas 1080×1350) : nom du défi, résultat, cheval, pseudonyme facultatif, signature
  STRIDES Grand Tour, version. Partage volontaire : partage natif avec fichier s'il est disponible, sinon
  téléchargement de l'image, sinon copie d'un texte avec l'adresse de la page en cours.
- **Accès à la vraie application** : bouton permanent et discret « Découvrir la vraie application Strides » (écran
  titre, pause, téléphone) ; une seule invitation automatique, après le bilan de M3, avec « Je cherche des
  missions » et « Je cherche un professionnel » ; affichage mémorisé ; jamais pendant une conduite, un saut ou une
  mission ; la partie est sauvegardée avant toute sortie.
- **Mesure** : adaptateur local (`src/core/metrics.js`), envoi externe désactivé, dédoublonnage.

## 3. Décisions et paramètres

| Décision | Justification |
| --- | --- |
| Strides du jeu réduit à Demandes, Recruter, Profil | La page officielle (vérifiée le 26/10/2026) décrit une plateforme de mise en relation avec des professionnels du cheval (grooms, palefreniers, cavaliers, chauffeurs, enseignants, agents de concours et d'entretien), avec profils vérifiés, avis et paiement sécurisé. Pensions, santé, boutique, vente de chevaux et concours ne sont donc pas présentés comme des services Strides : ils sont rangés dans Guide local, Mon écurie, Mes chevaux et Activités, avec la mention « fictif ». |
| Textes « Dans la vraie vie » réécrits | Ils ne décrivent plus que ce qui figure sur la page officielle ; pour les compétitions : « les concours se gèrent hors de Strides ». |
| Règles de concours | Barème A au chrono pour le CSO ; le défi est présenté comme une « adaptation de jeu », sans prétention de conformité réglementaire ; les règles du CSO ne sont pas transposées au cross. |
| Deux intentions, une destination | « Je cherche des missions » et « Je cherche un professionnel » ouvrent la même application web officielle : aucun lien profond n'est inventé ; l'intention n'est transmise qu'à la mesure locale. |
| Homonymes renommés | La cavalière de « Selle sur-mesure » devient Clara Fournier, la groom de « Transport express » Manon, pour laisser le prénom Léa au personnage récurrent. |

Paramètres à équilibrer (valeurs actuelles) :

| Paramètre | Valeur | Fichier |
| --- | --- | --- |
| Paliers de réputation | 0 / 300 / 900 / 1 800 / 3 200 points | `src/config.js` |
| M1 | Val 90 €, Haras 140 €, tournée 270 € ; réputation 60 / 80 / 120 | `src/gameplay/story2.js` (`CHAPTER1`) |
| M2 | paiement 120 € ; Léa 120 €, Inès 200 €, autonome 0 € ; réputation 100 | `story2.js` |
| M3 | participation 150 €, dotation 220 / 160 / 120 / 90 / 70 €, temps accordé 42 s (ambitieuse : −2 s, +50 %), Léa 80 € ; réputation 200 | `story2.js` |
| Aire de pansage | 350 € ; préparation 6 s → 4 s, pansage 4 s → 3 s | `src/gameplay/data.js`, `story2.js`, `condition.js` |
| Compétences | +0,5 par saut, +1 par soin, +4 par préparation, +2 à +6 par mission | `game.js`, `missions.js`, `story2.js` |
| Défi | v3 : 8 obstacles, 1,10 m, temps accordé 42 s, temps limite 84 s | `src/gameplay/challenge.js` |
| Allures et épreuves | galop de travail 6,5 m/s (390 m/min), grand galop 14 m/s ; temps accordé = 245 m ÷ 350 / 375 / 400 m/min (42 / 40 / 37 s) ; Grand Prix 1,50 – 1,60 m | `src/config.js`, `courses.js`, `docs/realisme.md` |

## 4. Recette

Voir la section 8 (résultats détaillés, environnement et limites).

## 5. Sauvegardes : migration et récupération

- **Clé** `strides-grand-tour-v1` (localStorage). Format courant : `version: 2`.
- **Migration** : au chargement d'une sauvegarde d'ancien format, une copie intacte est d'abord écrite sous
  `strides-grand-tour-v1.backup.v1`, puis la chaîne de migrations est appliquée (v1 → v2 : `xp` devient `reputation`,
  nouveaux registres créés vides) et la sauvegarde migrée est réécrite. Aucun accès n'est perdu : les paliers de
  réputation reprennent les seuils des anciens niveaux.
- **Sauvegarde illisible, invalide ou plus récente que le jeu** : copie sous `strides-grand-tour-v1.invalid`,
  verrouillage (aucune écriture tant qu'une décision explicite n'est pas prise), message à l'écran titre avec deux
  choix : « Nouvelle partie » ou « Restaurer : … » (copie de secours ou dernière sauvegarde illisible).
- **Récupération manuelle** : Réglages › Sauvegarde › « Copier ma sauvegarde » (texte à conserver), puis coller dans
  le champ et « Restaurer cette sauvegarde » ; la copie est validée et migrée avant d'être appliquée, sinon rien
  n'est modifié.
- **Paiements et récompenses** : registre `rewards` (`story:<mission>`, `hire:<mission>`, `upgrade:<id>`) ; une clé
  déjà présente ne verse ni ne débite plus rien.

## 6. Destinations officielles et état réel de la mesure

| Libellé dans le jeu | Destination | Vérification |
| --- | --- | --- |
| « Découvrir la vraie application Strides » | `https://get.strides-app.com/` | page officielle relue le 26/10/2026 (titre « STRIDES — La plateforme des professionnels du cheval ») |
| « Je cherche des missions » / « Je cherche un professionnel » | `https://strides-app.com` | application web officielle (même destination pour les deux intentions) |
| Badges des stores | `https://apps.apple.com/fr/app/strides/id6793963102`, `https://play.google.com/store/apps/details?id=com.stridesapp` | liens relevés sur la page officielle |

**Mesure** : l'adaptateur enregistre localement `game_started`, `first_mission_completed`, `second_activity_started`,
`hiring_mission_completed`, `first_hire_completed`, `challenge_completed`, `strides_cta_shown`,
`strides_cta_clicked`, `result_share_requested`, avec des paramètres limités (mission, type de parcours,
emplacement du bouton, version du défi, tentative, mode, version du jeu) : jamais de nom, de message, de position ni
d'empreinte. **L'envoi externe est désactivé** (`METRICS.endpoint` vide) : aucune donnée ne quitte le navigateur.
L'envoi par `sendBeacon` est prêt mais n'a pas été branché ni testé sur un service réel.

## 7. Lot D — extensions (non réalisées)

Le détail du lot D du dossier n'a pas été repris ici mot pour mot ; les pistes ci-dessous sont celles identifiées
pendant la réalisation, à rapprocher de la liste du dossier.

- Chapitres suivants sur le modèle du chapitre 1 (personnages récurrents, choix mémorisés, points de reprise),
  y compris pour les missions existantes qui n'ont pas encore de point de reprise.
- Autres aménagements de l'écurie (boxes, couleurs) une fois leur intérêt de jeu défini.
- Classement partagé du défi (nécessite un service en ligne et une politique de données).
- Branchement réel de la mesure sur un service choisi par Strides, avec consentement si nécessaire.
- Liens profonds vers l'application si Strides en publie (aucun n'est inventé aujourd'hui).
- Recette sur iPhone physique (Safari, partage natif avec fichier), accessibilité et performances sur appareils
  anciens.

## 8. Résultats de recette

**Environnement réel utilisé** : conteneur Linux, Chromium sans interface piloté par Playwright 1.56, rendu WebGL
logiciel (SwiftShader), émulation mobile tactile (`isMobile`, `hasTouch`, densité 2) aux formats iPhone paysage
**667×308 et 568×260 dans le lecteur intégré** (page `tests/e2e/viewer-harness.html`) et **844×390** en plein écran ;
vrais touchers envoyés par le protocole du navigateur (CDP). **Aucun test n'a été fait sur un iPhone physique** :
l'émulation Chromium ne remplace pas Safari iOS (partage natif avec fichier, performances, mise en veille).
Tests unitaires : Vitest, 97 tests (12 fichiers), tous verts. Recette du 26 octobre 2026, sur le code de cette livraison.

| Réf. | Exigence | Test | Résultat |
| --- | --- | --- | --- |
| R01 | Lancement et première mission | `scenario.mjs` (partie complète au doigt), `missions.mjs` (« Premiers pas ») | OK |
| R02 | Déplacements à pied, à cheval, en camion | `features.mjs` (20 vérifications), `transport-flow.mjs` (65), `truck-exit.mjs` | OK |
| R03 | Touchers simultanés | `multitouch.mjs` : joystick + GALOP + caméra à trois doigts, relâchement sans commande bloquée | OK |
| R04 | M1 : refus et branches | `chapter1.mjs` (refus des deux sans pénalité et reproposition, branche Val, choix mémorisé) ; `missions.mjs` (tournée) | OK |
| R05 | M2 : débit unique | `chapter1.mjs` : quitter avant confirmation, échec technique simulé (remboursé), double appui rapide, rechargement → 120 € débités une seule fois | OK |
| R06 | M2 : budget insuffisant | `chapter1.mjs` : confirmation impossible, rien débité, branche autonome terminée | OK |
| R07 | M3 : résultat imparfait | `chapter1.mjs` : élimination (deux refus) → « Nouvelle tentative » ou « Retrouver l'équipe », participation versée, suite débloquée | OK |
| R08 | Double appui et rechargement sans double récompense | `chapter1.mjs` (seconde validation de M1, rechargement), unitaires `grantOnce` | OK |
| R09 | Anciennes sauvegardes débutant et avancée conservées | unitaires `save.test.js` (v1 débutant et v1 avancée) ; `save-guard.mjs` (v1 avancée migrée, possessions conservées, jouable) | OK |
| R10 | Sauvegarde incomplète ou migration en échec récupérable | `save-guard.mjs` (illisible : signalée, rien écrasé, restauration de la copie, export / import) ; unitaires (invalide, version plus récente) | OK |
| R11 | Absence prolongée sans rattrapage punitif | `pause.mjs` (10 min d'interruption → un pas borné ; besoins et horloge suspendus pendant téléphone et dialogues) | OK |
| R12 | Amélioration visible après rechargement | `chapter1.mjs` (aire de pansage achetée une fois, présente au Val après rechargement, achat répété sans effet) | OK |
| R13 | Défi rejoué à conditions identiques | `challenge.mjs` (37 vérifications : cheval, heure, météo, hauteur, temps accordé identiques ; monde restauré) | OK |
| R14 | Carte de résultat lisible, partage ou téléchargement | `challenge.mjs` (carte générée, téléchargement vérifié) | OK, partage natif non testable sous Chromium Linux |
| R15 | Liens Strides et retour au jeu | `strides-links.mjs` (titre, téléphone, invitation : destinations officielles, partie sauvegardée avant la sortie, jeu intact) | OK, `window.open` intercepté (pas de navigation réelle) |
| R16 | Mesure désactivée puis activée localement sans doublon | `strides-links.mjs`, `chapter1.mjs`, unitaires `metrics` | OK, aucun envoi externe |
| R17 | Build et parcours principal sans erreur bloquante ni fonction annoncée fictivement | `npm run build` et `build:single` ; `scenario.mjs`, `missions.mjs` (15 missions), `jobs.mjs`, `request-flow.mjs` (3 formats), `care.mjs` : aucune erreur JavaScript ; aucune fonction « bientôt disponible » dans l'interface | OK |

**Limites connues**

- Les tests jouent avec un pilote automatique (positions placées, sauts au bon moment) : ils vérifient les règles
  et les enchaînements, pas la difficulté ressentie par un joueur.
- Sous rendu logiciel, une image peut mettre plusieurs secondes : les durées mesurées ne représentent pas un iPhone.
- Le partage natif avec fichier et l'ouverture effective d'un nouvel onglet dans le lecteur intégré de claude.ai
  n'ont pas pu être vérifiés.
