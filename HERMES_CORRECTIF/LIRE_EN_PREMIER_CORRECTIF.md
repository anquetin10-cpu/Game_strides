# LIRE EN PREMIER — correctif du dossier Hermès (31 octobre 2026)

## Versions

| | Version auditée | Version de test corrigée |
|---|---|---|
| Commit | `b4796e7` (repère git `audit-hermes-b4796e7`) | dernier commit de la branche `claude/strides-grand-tour` (identifiant affiché dans le menu pause) |
| Publication | artefact claude.ai du 30/10, 18 h 43 (même horodatage que `b4796e7`) | **non publiée** (voir plus bas) |
| Format de sauvegarde | v2, clé `strides-grand-tour-v1` | identique, sans migration |

**Écart avec la version auditée** : uniquement les correctifs décrits dans `CHANGEMENTS.md` (12 fichiers sous `src/`, `vite.config.js`). Pas d'autre changement de comportement.

**Identification du build** : menu pause (Échap ou bouton ‖), ligne du bas « Version 2.0.0 · `<commit>` · `<date>` UTC ».

**Lancer la version de test** :
- localement : `npm install && npx vite --host 127.0.0.1 --port 5173` ;
- en un seul fichier : `npm run build:artifact`, qui produit `dist-single/artifact.html`.

**Publication** : le dossier interdit de publier une nouvelle version publique sans le circuit de validation du projet. L'artefact public n'a donc pas été mis à jour ; il reste sur la version auditée. La publication est à décider par le projet après contre-recette.

## Résultat par point du dossier

| Point | Statut | En une phrase | Preuve |
|---|---|---|---|
| AUD-02 (P1) pont du Master | **Reproduit, corrigé** | « Fermer le pont » et « Faire descendre » sont deux actions distinctes au pied du pont ; le cycle complet passe deux fois au toucher | `PREUVES/AUD-02/` |
| AUD-01 (P2) mission perdue au rechargement | **Reproduit, corrigé** | L'acceptation d'une mission d'histoire est enregistrée tout de suite ; la reprise se fait sans double débit ni double paiement | `PREUVES/AUD-01/` |
| OBS-01 caméra dans une cloison | **Reproduit, corrigé** | 52 / 548 images dans une paroi avant correctif, 0 / 622 après ; murs restés opaques | `PREUVES/OBS-01/` |
| FIN-13 concours | **Joué de bout en bout (catégorie B)** | Depuis l'état E08 : offre acceptée au téléphone, déchargement, dossard, échauffement, parcours 1 → 8 sans faute (60,30 s pour 65 s), carte de résultats et dotation | `PREUVES/COR-P01/` |
| Recrutement | Portée documentée | Réservation de chauffeur : un débit (E09) ; rien d'autre généralisé | `TESTS_RESTANTS.md` |
| Safari iPhone | **Non testé** | Aucun appareil | `TESTS_RESTANTS.md` |

## Non-régression (à froid, sur la version corrigée)

Serveur redémarré, aucune modification pendant la série (`PREUVES/NON-REGRESSION/synthese.txt`). Tout est vert :

| Domaine | Suite | Résultat |
|---|---|---|
| Tests unitaires | — | 175 / 175 |
| Correctif | master-ramp | 26 / 26 |
| | mission-resume | 13 / 13 |
| | camera-barn | 0 cas |
| | contest-full | 6 / 6 |
| 11 non-régressions historiques (BUG-01 à BUG-11) | qa-fixes | 19 / 19 |
| Véhicules | master | 26 / 26 |
| | transport-flow (Scania) | 65 / 65 |
| | boarding | 72 / 72 |
| | defender | 33 / 33 |
| | vehicles | 48 / 48 |
| | truck-exit | OK |
| Missions et sauvegardes | chapter1 (M1–M3, reprises payantes) | 27 / 27 |
| | save-guard | 11 / 11 |
| | chaîne des 16 missions | 16 / 16 |
| Interface | i18n | 19 / 19 |
| | features | 20 / 20 |
| | cso-touch (parcours au doigt) | 8 / 8 |

## Défauts trouvés et corrigés pendant la recette du correctif

Ces défauts sont hors du dossier, mais ils sont sur le chemin du cycle Master :

1. **Cheval mené au pied du pont fermé** : « Monter » (à cheval) masquait « Ouvrir le pont latéral ». Corrigé comme pour le Scania.
2. **Double appui pendant la montée du cheval dans le van** : le joueur se mettait en selle sur le cheval en cours de chargement. Les interactions sont maintenant suspendues pendant la séquence.
3. **Modèle réaliste du personnage** : il ne suivait pas le masquage du personnage et restait affiché, figé. Il suit désormais la visibilité.

## Catégories de résultats (rappel du dossier)

| Catégorie | Définition | Ce qui en relève ici |
|---|---|---|
| A | Partie naturelle complète | Aucun résultat dans cette livraison |
| B | Scénario isolé, commandes normales | Mise en place technique déclarée, puis touchers réels sur les boutons, joystick virtuel, touches Échap / E / P. Tous les COR-M, COR-S01/S02, COR-C01, COR-P01 |
| C | Contrôle technique | Suites de non-régression existantes, pilote automatique avec placements, COR-S04 |

Tout a tourné sous Chromium sans écran, avec rendu logiciel, en émulation iPhone 13 paysage. Rien n'a tourné sur un appareil réel.

## Contenu du dossier

| Fichier | Contenu |
|---|---|
| `CHANGEMENTS.md` | Causes constatées et correctifs, fichier par fichier |
| `MATRICE_RETEST.csv` | Une ligne par test : catégorie, état de départ, procédure, attendu, résultat corrigé / audité, preuve, limite. Séparateur `;` |
| `ETATS_TEST/` | 9 sauvegardes privées (E01 à E09), notice `LISEZMOI.md`, chargeur `charger-etat.mjs` |
| `PREUVES/` | Captures, mesures JSON, journaux de tests, pour la version auditée et la version corrigée |
| `TESTS_RESTANTS.md` | Ce qui n'a pas été exécuté et pourquoi |

## Rejouer les preuves

Serveur sur `http://127.0.0.1:5173`.

```bash
BASE=http://127.0.0.1:5173 node tests/e2e/master-ramp.mjs        # COR-M00 à M06
BASE=http://127.0.0.1:5173 node tests/e2e/aud02-sweep.mjs sortie.json
BASE=http://127.0.0.1:5173 node tests/e2e/mission-resume.mjs     # COR-S01 à S04
BASE=http://127.0.0.1:5173 node tests/e2e/camera-barn.mjs apres  # COR-C01
BASE=http://127.0.0.1:5173 node tests/e2e/contest-full.mjs       # COR-P01
```

**Mesures « avant »** : on sert la version auditée sur un second port, puis on lance les mêmes scripts avec `BASE=http://127.0.0.1:5174` :

```bash
git worktree add /tmp/audit audit-hermes-b4796e7
cd /tmp/audit && npm install && npx vite --port 5174
```
