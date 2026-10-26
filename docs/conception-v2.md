# STRIDES Grand Tour — conception de la version 2 (dossier du 25 octobre 2026)

Référence partagée pour la réalisation des lots A, B et C du dossier de développement. Les décisions ci-dessous
sont des engagements d'interface entre les chantiers menés en parallèle ; les valeurs chiffrées sont des
paramètres à équilibrer (voir la fin du document).

## 1. Constat d'audit (état au commit 374cf34)

| Sujet | Existant | Écart avec le dossier |
| --- | --- | --- |
| Entrée / outils | `index.html` → `src/main.js` ; Vite 6, three r170 ; `npm run dev`, `build`, `build:single`, `test` (vitest, 74 tests), e2e Playwright dans `tests/e2e/` | — |
| Sauvegarde | `src/core/save.js`, `localStorage` clé `strides-grand-tour-v1`, `version: 1`, fusion naïve avec les valeurs par défaut, erreur silencieuse → partie vide | versionner, sauvegarde de secours, validation, échec explicite, reprise de mission |
| Progression | `LEVELS` (Groom, Cavalier, **Pro vérifié**, International, Légende 5★) sur `xp` ; `level` des missions = index | réputation commune, retirer « Pro vérifié », compétences |
| Missions | 12 missions d'histoire (`story.js`), jobs récurrents (`jobs.js`), offres acceptées/refusées via l'app Strides (`requests.js`), contre-proposition ; pas de reprise après rechargement | M1–M3 à choix, états explicites, reprise sûre, paiement unique |
| Téléphone | Strides (Demandes, Écuries, Transport, Événements, Annuaire, Profil), Carte, Messages, Chevaux, Trophées, Météo, Photo, Réglages ; boutique accessible à la Sellerie du Port | ajouter Mon écurie, Activités ; mention fictive ; libellés d'accès à la vraie app |
| Vraie app | `CONFIG.siteUrl = https://strides-app.com` (bouton « Découvrir l'app Strides » au titre, badge App Store dans le monde, `openDownload`) | accès permanent discret + une invitation automatique au plus, drapeau sauvegardé, libellés du dossier, sauvegarde avant sortie |
| Temps | `gameTime` avance seulement pendant le jeu ; sauvegarde quand l'onglet passe en arrière-plan ; la simulation continue pendant les dialogues et le téléphone | pause complète en arrière-plan et pendant dialogues / écrans de choix |
| Mesure | aucune | adaptateur local désactivé pour l'extérieur |
| Défi | 4 défis chronométrés (`activities.js`), record dans `bestTimes` | défi à conditions fixes versionnées, carte de résultat, partage |

## 2. Modèle de données (sauvegarde v2)

`src/core/save.js` — `SAVE_VERSION = 2`.

- `reputation` (nombre) remplace `xp` (migration 1 → 2 : `reputation = xp`). Les paliers (`REPUTATION` dans
  `config.js`) gardent les seuils de l'économie actuelle : 0 « Premiers contrats », 300 « Professionnel
  apprécié », 900 « Référence locale », 1 800 « Équipe reconnue », 3 200 « Réputation internationale ».
  `reputationTier(points)` renvoie `{ index, level (1..5), title, short, next, progress }` ; `levelFor` reste un alias.
  Les `level` des missions (1..5) correspondent aux paliers : aucun accès perdu.
- `skills` : `{ preparation, equitation, transport, organisation }` de 0 à 100. `game.addSkill(nom, delta)` ;
  gains : soins et préparation → preparation ; distance, sauts, parcours → equitation ; trajets en camion
  (pondérés par le confort) → transport ; missions terminées, tournée, recrutement → organisation.
- `rewards` : registre `{ clé: true }` des récompenses déjà versées (`game.grantOnce(clé, fn)`), clé = identifiant
  d'offre ou de tentative. Un double appui ou un rechargement ne verse jamais deux fois.
- `flags` : `stridesNotice` (mention fictive vue), `ctaShown`, `ctaClicked`, `ctaDismissed` (invitation
  automatique), `chapter1Done`.
- `choices` : `m1` (`val` | `haras` | `tournee`), `m2` (`lea` | `ines` | `solo`), `m3` (`{ approach, help }`).
- `relations` : contacts et souvenirs des personnages (`lea`, `maxime`, `camille`), compteur de missions réussies par personnage.
- `checkpoint` : `{ mission, step, data }` de la mission en cours (M1–M3, transport) pour une reprise sûre ;
  `null` sinon. Les autres missions sont re-proposées au démarrage, comme aujourd'hui.
- `hired` : prestations fictives réalisées (`{ m2: 'lea' }`), distinctes des missions terminées.
- `metrics` : `{ unique: {} }` pour le dédoublonnage des événements uniques.
- `meta` : `{ savedAt, build }`.

Protection : `load()` conserve une copie de secours `clé.backup.v<version>` avant toute migration ; une
sauvegarde illisible ou invalide est copiée sous `clé.invalid` et signalée (`save.loadIssue`) — l'écran titre
l'explique et propose « Nouvelle partie » ou « Restaurer la copie de secours » ; rien n'est écrasé en silence.
`exportSave()` / `importSave(json)` servent de procédure de récupération (Réglages).

## 3. Temps et pause

- `game.simPaused` est vrai quand un dialogue, une carte de choix, le téléphone ou un écran de résultat est
  ouvert, ou quand l'onglet est en arrière-plan (`visibilitychange`). Alors `dt` de simulation = 0 : heure du
  monde, besoins du cheval, météo et marées, minuteurs de missions et expiration des offres s'arrêtent ensemble.
  Les animations d'ambiance (nuages, oiseaux) continuent.
- Un défi suspend son chrono et sa simulation avec le reste.
- Absence : `gameTime` n'avance qu'en jeu ; aucun rattrapage des besoins au retour.

## 4. Personnages récurrents du premier chapitre

| Fonction | Personnage | Caractère | Rôle |
| --- | --- | --- | --- |
| Responsable du Val | **Camille Martin** (existante) | exigeante, précise, drôle | M1 (préparation), retours, bilan et accès à l'amélioration |
| Groom expérimentée | **Léa Morel** (nouvelle) | compétente, directe, connectée | renfort recruté en M2, présente dans l'équipe en M3 |
| Cavalier rival | **Maxime Vidal** (nouveau), monte pour le Haras de la Pommeraie | ambitieux, sportif, trop sûr de lui | pique en M1 (sortie du Haras), concurrent en M3, réaction au résultat |

Ils se souviennent d'un choix : `choices.m1` change une réplique de Camille en M2 ; `hired.m2` change l'accueil de
Léa en M3 ; le classement de M3 change la réaction de Maxime et le bilan de Camille.

## 5. Missions M1–M3 (ordre : Premiers pas → M1 → M2 → M3 → missions existantes)

Les missions existantes gardent leur identifiant ; « Groom du matin » requiert désormais M3. Un joueur qui les a
déjà terminées ne perd rien ; M1–M3 lui sont proposées comme nouvelles missions d'histoire.

### M1 « Deux écuries, une matinée » (`m1`)
Deux propositions arrivent ensemble dans Strides : Camille (Val) — préparation regroupée de deux chevaux au box
(~2 min, 90 €) ; Antoine (Haras) — sortie en main d'un cheval du Haras jusqu'au pont de la Touques et retour
(~4 min, 140 €, créneau compatible mais moins de temps libre pour Comète). Écran de choix : « Préparation (Val) »,
« Sortie (Haras) », « Les deux : tournée » avec estimation de durée et gains ; « Refuser » l'une ou l'autre sans
sanction. Tournée = les deux dans l'ordre cohérent (Val puis Haras), bonus 40 € ; mission unique = à la fin,
proposition d'une activité personnelle (galop sur la plage avec Comète). Conséquences : réputation +, contact Léa
(via Antoine), `choices.m1`. Recette R04.

### M2 « Un renfort avant le concours » (`m2`)
Camille : il faut reconnaître le parcours du Pôle et préparer Comète ; l'aide prévue a un empêchement ; un cheval
arrive à l'écurie (une tâche de plus). Parcours client dans Strides (« Je cherche un professionnel ») : besoin
scénarisé, deux profils fictifs — **Léa Morel** (groom : préparation de Comète, 120 €, dispo maintenant) et
**Inès Ferrand** (groom freelance : préparation + accueil du cheval arrivant, 200 €) — plus la solution autonome
« Je m'organise seul » (préparation rapide, reconnaissance partielle, aucun débit). Règle de confirmation : le
débit se fait à la confirmation, une seule fois ; quitter l'écran avant ne débite rien ; en cas d'échec technique,
état restauré et remboursement. Solde insuffisant → branche autonome accessible. Actions : confirmer, aller
reconnaître le parcours (marcher près de quatre obstacles du Pôle), revenir : Comète est préparée (robe propre,
état « prête ») et/ou le cheval arrivant est au box ; message court de confirmation. Conséquences : argent
fictif débité, `hired.m2`, Léa réapparaît. Recettes R05, R06.

### M3 « Le premier concours en équipe » (`m3`)
Le Val participe au concours local du Pôle (Amateur 1,10 m). Choix d'organisation : préparation raisonnable
(regroupée) et aide éventuelle selon le budget (Léa sur place, 80 €) ; approche « prudente » (temps accordé
normal) ou « ambitieuse » (temps accordé réduit de 10 s, dotation +50 %). Étapes avec reprise sûre (`checkpoint`) :
préparer → embarquer → conduire → débarquer → dossard → épreuve → retrouver l'équipe. Réutilise les étapes de
`trip.js` (loadStep, driveStep, unloadStep) et `courseSteps` (règles FEI actuelles : barème A au chrono).
Conséquences : terminer la séquence débloque la suite quelle que soit la performance ; récompense de participation
(150 €) ; le résultat n'apporte que bonus et réactions ; après élimination ou abandon, « retrouver l'équipe » ou
« nouvelle tentative ». Bilan du chapitre : Camille débloque l'aire de pansage (amélioration visible) et la mission
suivante ; invitation automatique unique vers la vraie app. Recette R07.

## 6. Téléphone : applications et séparation avec le service réel

| App | Contenu |
| --- | --- |
| Strides | Demandes reçues (prestataire : accepter, refuser, contre-proposer), Recruter (client : « Je cherche un professionnel », profils comparables, confirmation à débit unique ; chauffeur pour un trajet avec son cheval), Profil (réputation, avis, compétences). Accès « Découvrir la vraie application Strides ». Rien d'autre : la vraie application ne propose ni pensions, ni annuaire de santé, ni boutique, ni concours (page officielle relue le 26/10/2026). |
| Mes chevaux | état, soins, santé, chevaux à vendre (élevage local fictif). |
| Carte | inchangée. |
| Mon écurie | Aménagements (aire de pansage couverte, 350 €), Équipe (Camille, Léa, Inès selon les prestations), Compétences, Matériel (Sellerie du Port, boutique fictive). |
| Activités | Défi du Pôle (conditions fixes, record, carte de résultat), concours et courses (offres « Événements »), entraînements libres chronométrés. |
| Guide local | Pensions et santé (vétérinaire, maréchal…), fictifs et hors Strides ; missions « Fer perdu » et « La pension parfaite ». |
| Messages, Trophées, Météo, Photo, Réglages | inchangés ; Réglages : export / import de sauvegarde. |

Au premier lancement de l'app Strides : bandeau « Missions, profils et sommes fictifs — rien n'est envoyé à la vraie
plateforme » (`flags.stridesNotice`). Les accès au service réel portent le libellé « Découvrir la vraie
application Strides », puis deux intentions « Je cherche des missions » / « Je cherche un professionnel » ; les
deux ouvrent la même destination officielle (`CONFIG.siteUrl`), sans lien profond inventé. Sauvegarde avant
l'ouverture. Une invitation automatique au plus par chapitre, après le bilan de M3 (jamais pendant une conduite,
un saut ou une action) ; son affichage est mémorisé.

### Destinations officielles vérifiées (26 octobre 2026)

| Usage dans le jeu | Destination | Vérification |
| --- | --- | --- |
| « Découvrir la vraie application Strides » | `https://get.strides-app.com/` (page de présentation : parcours prestataire et client) | HTTP 200, titre « STRIDES — La plateforme des professionnels du cheval » |
| « Je cherche des missions » / « Je cherche un professionnel » | `https://strides-app.com` (application web ; la page officielle y envoie « Créer mon profil » et « Je cherche un pro ») | HTTP 200 |
| Badge App Store / Google Play | `https://apps.apple.com/fr/app/strides/id6793963102` · `https://play.google.com/store/apps/details?id=com.stridesapp` | liens relevés sur la page officielle |

Les deux intentions ouvrent la même application web : aucun lien profond n'est inventé ; l'intention n'est
transmise qu'à la mesure (`placement`).

## 7. Défi rejouable (lot C)

`defi-pole-v1` : parcours du Pôle (huit obstacles, hauteur fixe 1,10 m), cheval fourni (« Onyx », statistiques
fixes, indépendantes des équipements), météo fixe (jour dégagé, 11 h, sol sec), aide au saut activée (anneau),
temps accordé 75 s. Classement expliqué : pénalités d'abord (4 par barre, 4 au premier refus, élimination au
second, 1 par seconde entamée au-delà du temps accordé), puis chrono. Record personnel local par version.
Relance immédiate ; accessible depuis Activités et depuis le panneau d'entrée du Pôle. Carte de résultat
(`canvas` 1080×1350) : nom du défi, résultat, cheval, pseudonyme facultatif, signature STRIDES Grand Tour,
version ; partage natif si disponible, sinon téléchargement de l'image, sinon copie d'un texte avec l'adresse
publique vérifiée de la partie (`location.href` sans paramètres).

## 8. Mesure (lot C)

`src/core/metrics.js` : `metrics.track(nom, params)`. Événements : `game_started`, `first_mission_completed`,
`second_activity_started`, `hiring_mission_completed`, `first_hire_completed`, `challenge_completed`,
`strides_cta_shown`, `strides_cta_clicked`, `result_share_requested`. Paramètres admis : `mission`, `course`,
`placement`, `challenge_version`, `game_version`, `attempt`, `mode`. Envoi externe désactivé (`CONFIG.metrics.endpoint`
vide ; adaptateur `sendBeacon` prêt mais inactif). Dédoublonnage : `first_*` une fois par partie ;
`challenge_completed` par identifiant de tentative. Vérification locale : `window.__metrics.log` et
`?metrics=1` affiche les événements dans la console.

## 9. Paramètres à équilibrer

| Paramètre | Valeur v2 | Où |
| --- | --- | --- |
| Paliers de réputation | 0 / 300 / 900 / 1 800 / 3 200 | `config.js` REPUTATION |
| M1 | Val 90 €, Haras 140 €, tournée +40 €, réputation 60/80/120 | `story2.js` |
| M2 | Léa 120 €, Inès 200 €, autonome 0 € ; réputation 100 | `story2.js` |
| M3 | participation 150 €, dotation Amateur, ambitieux −10 s / +50 % | `story2.js`, `trip.js` |
| Aire de pansage | 350 € ; préparation regroupée 6 s → 4 s | `data.js`, `condition.js` |
| Gains de compétences | 2 à 8 points par action | `game.js` addSkill |
| Défi | temps accordé 75 s, hauteur 1,10 m | `challenge.js` |
