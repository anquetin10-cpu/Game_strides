# Socle Equestrian Tour : bilan par lot

Branche `claude/et-socle`, partie de la version publiée `e4b0673`, sans publication : GitHub Pages ne publie que depuis main, master et claude/strides-grand-tour.

**Conditions des mesures.** Toutes les mesures viennent de Chromium en rendu logiciel (SwiftShader), avec une émulation tactile en paysage 844 × 390 (et 667 × 300). **Ce n'est pas un iPhone réel : Safari iPhone n'est pas validé.** Voir `PROTOCOLE_IPHONE.md`.

## Lot 1 : réconcilier les versions, corriger le cavalier

**Problèmes corrigés**
- **Versions réconciliées.** Fusion de `0ea05f8` (recentrage du siège, `mountKneeOut`, test Tripo) sur les réglages de Julien (`e4b0673`). Sont conservés :
  - étriers bas et en arrière ;
  - `kneeOut` 0,45 ;
  - talon ;
  - abaissement du bassin ;
  - `LEG_CLEAR`.
- **Jambe « collée sans traverser ».** Elle suit le flanc du cheval WildMesh, mesuré à chaque image et de chaque côté :
  - le genou s'ouvre d'abord, sans jamais dépasser la cheville ;
  - puis le pied s'écarte, au plus de 4 cm au-delà de sa place naturelle, sans jambes en « A ».
- **Défauts corrigés en cours de route.**
  - Une boucle de calcul tournait à vide : le tibia de la jambe extérieure entrait dans le flanc au galop.
  - Un lissage retardait la pose des jambes par rapport au calcul (davantage à 60 images/s).
- **Accès de test retirés de la version publiée.** Sont retirés : `window.__game`, `__metrics`, `?autostart`, `?debug`, `?real`, `?classic`, `?truck`, `?defender`, `?metrics`.
  - Ils restent disponibles en développement et dans `vite build --mode e2e`.
  - `?secours` et `?lang` restent ouverts aux joueurs.

**Preuves**
- Planche avant/après : `captures/jambes-publiee-vs-socle.jpg`.
- Mesures : `mesures/jambes-e4b0673-publiee.json` et `mesures/jambes-socle.json`.

| Situation | Pénétration max, publiée | Pénétration max, socle |
|---|---|---|
| Montée | 16,4 cm | 0 |
| Pas | 3,9 cm | 0 |
| Trot | 6,0 cm | 0 |
| Galop | 14,0 cm | 0 |
| Virage | 15,8 cm | 0 |
| Saut (appel) | 7,4 cm | 0 |
| Descente | 9,3 cm | 0 |

- Parcours cheval et cavalier : 13/13 en 844 × 390 et 13/13 en 667 × 300 (`mesures/test-ride844.txt`, `mesures/test-ride667.txt`).
- Dans le build publié : `window.__game` est absent, `?autostart` ouvre l'écran titre et `?secours` fonctionne.

**Limites**
- Au galop, à une phase de la foulée, la jambe extérieure frôle le flanc : moins de 1 cm entre l'axe du tibia et la peau. Mieux vaut cela que des jambes écartées.
- Le naturel de la posture se juge à l'œil : **la validation finale revient à Julien**.

## Lot 2 : alléger le démarrage

**Problèmes corrigés**
- **Van STX Renault Master et Defender 110.** Ils se chargent après la prise en main, l'un après l'autre :
  - 6 s après la prise en main, jamais pendant que le téléphone, un dialogue ou une carte est ouvert ;
  - sous le journal de plantage ; jamais en mode sûr minimal ;
  - avec leurs emplacements sauvegardés conservés.
- **Voitures réalistes.** Elles se chargent après le van et le Defender.
- **Cheval WildMesh compressé sans perte** (meshopt). Le contrôle octet par octet est fait par `scripts/real/compress.mjs`.
- **Camion STX inchangé** : la rampe et le chargement des chevaux en dépendent.
- **Protections Safari conservées** (journal de plantage, mode sûr, `?secours`).

**Preuves** (même serveur reproduisant la compression de GitHub Pages, deux passages chacun ; `mesures/demarrage-*.json`)

| | Publiée e4b0673 | Socle |
|---|---|---|
| Transféré avant de jouer | 11,44 Mo (10,55 Mo mesurés sur GitHub Pages) | **8,42 Mo** |
| Transféré pendant les 20 premières secondes de jeu | 0 | 2,41 Mo |
| Écran titre | 12,2 – 13,8 s | 12,8 – 13,0 s |
| Prise en main | 24,8 – 29,7 s | 23,6 – 25,4 s |

**Limites**
- **Correction de l'audit** : les « 27 Mo » additionnaient des tailles non compressées. Le transfert réel publié est d'environ 10,6 Mo.
- L'objectif « moins de 10 Mo avant de jouer » est atteint **en émulation**. Il reste à confirmer sur iPhone.
- Les délais sont limités par le processeur en rendu logiciel, donc peu parlants.
- La préparation du van et du Defender provoque un à-coup pendant le jeu (plusieurs secondes en rendu logiciel). Il est à surveiller sur iPhone : étape 9 du protocole.

## Lot 3 : premières minutes jouables

**Problèmes corrigés**
- **Téléphone vide au départ.** L'offre « Premiers pas » est générée dès « En selle ». Avant, le téléphone restait à « 0 mission dispo », parce que le compte à rebours des offres est suspendu tant que le téléphone est ouvert.
- **Téléphone ouvert sans offre.** Les offres du moment sont générées à l'ouverture.
- **Accueil du téléphone resserré** jusqu'à 430 px de haut : les 12 applications sont visibles.

**Preuves**
- `tests/e2e/first-minutes.mjs` passe entièrement, avec de vrais touchers, en 844 × 390 et en 667 × 300 :
  - nouvelle partie, puis « En selle » ;
  - téléphone : 1 mission disponible ;
  - acceptation, puis « Premiers pas » terminée ;
  - +55 € et +60 de réputation versés une seule fois ;
  - rechargement, puis « Continuer » : tout est conservé.
- Grille du téléphone vérifiée en 667 × 300, 667 × 375, 844 × 390 et 932 × 430.
- Captures : `captures/premieres-minutes/`.
- Reprise d'une sauvegarde existante : `mission-resume` 13/13 et `save-guard` 11/11.

**Limites**
- Dans le test, « Premiers pas » est jouée par le pilote de test (déplacements simulés). Le parcours au doigt est couvert par `tuto-play.mjs` et par le protocole iPhone.

## Lot 4 : prouver les corrections

**Mis en place**
- **CI.** Tests sur toutes les branches (`.github/workflows/deploy.yml`) :
  - build et tests unitaires ;
  - contrôle qu'aucun accès de test n'est publié ;
  - série courte de bout en bout, `npm run e2e` → `tests/e2e/smoke.mjs` : premières minutes, sauvegardes, montée et descente, reprise de mission, cheval et cavalier ;
  - publication seulement depuis les branches publiées, après les tests.
- **Protocole iPhone réel** d'environ 10 minutes, avec sa fiche de résultats : `PROTOCOLE_IPHONE.md`.

**Non-régression (état final)**

| Test | Résultat |
|---|---|
| Montée et descente | 17/17 |
| Soins | 8/8 |
| CSO | 38/38 |
| Van Master | conforme |
| Defender | conforme |
| Transport | conforme ; un choc au trajet retour, absent à la relance |
| Tripo | 35/36 ; glissement de sabot 0,16 cm pour un seuil de 0,15, puis conforme à la relance |
| Tests unitaires | 286/286 |

**Limites**
- La CI n'émule pas Safari.
- Les tests de rendu logiciel restent lents (environ 1 image par seconde au Val sur cette machine).
