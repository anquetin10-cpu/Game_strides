# CHANGEMENTS — correctif du dossier Hermès du 31 octobre 2026

- **Version auditée** : commit `b4796e7`, repère git `audit-hermes-b4796e7`. C'est aussi la version publiée sur l'artefact le 30/10 à 18 h 43 (même horodatage).
- **Branche** : `claude/strides-grand-tour`.
- **Code modifié** : 12 fichiers sous `src/` et `vite.config.js`, +134 / −23 lignes (`git diff audit-hermes-b4796e7 -- src vite.config.js`).
- **Non modifié** : ville, modèles 3D, collisions, règles et difficulté des concours, bonus de selles, hauteurs, missions (contenu), commandes tactiles, conduite.

## AUD-02 (P1) — pont latéral du Master

**Cause constatée**, reproduite sur la version auditée :
- Comète à bord, pont ouvert : « Faire descendre Comète » (priorité 2,9) masquait « Fermer le pont latéral » (priorité 1,6) dans toute sa zone (rayon 3,4 m).
- Le système d'interactions ne retient qu'une action, la mieux notée.
- Mesure : sur 804 positions au sol accessibles autour du van, « Fermer le pont » n'était proposé **nulle part** (`PREUVES/AUD-02/balayage-avant.json`).

La géométrie n'était pas en cause : la zone de fermeture est accessible au sol, hors de l'emprise du pont.

**Correctif** (`src/gameplay/vanLoading.js`, `src/ui/hud.js`, `src/gameplay/player.js`), sur le modèle du camion Scania :

1. **Deux actions distinctes au pied du pont**, au même endroit au sol : l'une sur le bouton ACTION, l'autre sur le bouton d'action secondaire (touche L au clavier).
   - Juste après un chargement : ACTION « Fermer le pont latéral », secondaire « Faire descendre Comète ».
   - Pont ouvert à l'arrivée avec un cheval à bord : ACTION « Faire descendre », secondaire « Fermer le pont ».
   - Cheval tenu en main, pont ouvert : ACTION « Faire monter », secondaire « Fermer le pont latéral » (fermeture à vide).
   - Après correctif, sur les mêmes 804 positions, les deux actions sont proposées ensemble à 408 positions (`balayage-apres.json`).
2. **Cheval mené au pied du pont fermé** : « Ouvrir le pont latéral » passe devant « Monter » (à cheval). Avant, on ne pouvait pas ouvrir le pont sans lâcher le cheval ou s'en éloigner (constaté pendant la recette).
3. **Pont ouvert, van vide, mains libres** : « Fermer le pont latéral » passe devant « Monter » sur un cheval laissé à côté.
4. **Pendant une séquence de chargement ou de déchargement** : aucune interaction proposée (`src/gameplay/interact.js`). Constaté pendant la recette : un double appui pendant la montée de Comète mettait le joueur en selle sur elle.
5. **Libellé « Ouvrir / Fermer la porte arrière »** rétabli : il était vide après une première version de ce correctif. Régression détectée par le balayage, corrigée avant livraison.

**Inchangé** :
- le départ reste impossible tant que le pont ou la porte arrière n'est pas fermé (message affiché) ;
- les collisions du van et du pont baissé ;
- les séquences du cheval, la sauvegarde du van ;
- aucune fermeture automatique, aucune téléportation, aucun libellé seulement renommé.

**Scania** : son résolveur d'actions et ses collisions ne sont pas partagés avec le Master. Seul l'ordre de l'action secondaire au HUD est commun (Master d'abord, puis transport Scania, puis Defender). Le parcours de transport Scania est rejoué en non-régression (`transport-flow.mjs`).

## AUD-01 (P2) — mission acceptée perdue au rechargement

**Cause vérifiée** :
- `missions.start()` ne gardait la mission qu'en mémoire (`this.active`).
- Seules M1 à M3 écrivaient un point de reprise (`checkpoint`), et seulement à leurs étapes clés.
- « Premiers pas » et les autres missions d'histoire n'écrivaient rien : la mission était perdue au rechargement, et l'offre revenait plus tard comme une nouvelle demande.

**Correctif** (`src/gameplay/missions.js`, `src/gameplay/story.js`) :

1. **Acceptation enregistrée** : toute mission d'histoire acceptée écrit tout de suite un point de reprise `{ mission, step: 'start', data: {} }` et sauvegarde.
   - Au rechargement, la carte existante « Mission en cours » propose « Reprendre ».
   - Un point déjà posé pour la mission (choix, paiement) n'est jamais écrasé.
2. **« Premiers pas »** :
   - point « briefed » après les consignes de Camille : non répétées à la reprise ;
   - point « out » quand Comète est sortie du box : elle n'est pas remise au box à la reprise.
3. **« Fer perdu »** : la ferrure réglée (60 €) est enregistrée (« shod »). À la reprise, il ne reste que le mot du maréchal : aucun second débit, aucune seconde ferrure.
4. **Échec** : le point de reprise est effacé s'il ne contient rien à conserver (ni choix ni paiement). Sinon il est gardé pour « Réessayer », comme avant.
5. **Doublons** :
   - les récompenses d'histoire restent versées une seule fois (`grantOnce`) ;
   - une mission terminée efface son point de reprise avant la sauvegarde.
6. **Concours du Pôle (hors histoire, engagement payant)** : volontairement non repris.
   - L'engagement en attente (`pendingFee`) reste remboursé une seule fois au rechargement (BUG-08).
   - Comme le concours ne survit pas au rechargement, il n'y a ni double remboursement ni remboursement d'un concours restauré.
7. **Anciennes sauvegardes** : aucune migration ni changement de format.
   - Le champ `checkpoint` existait déjà, seul son usage est élargi.
   - Une sauvegarde de la version auditée faite pendant une mission sans point de reprise se charge normalement, sans mission en cours : son état n'avait jamais été enregistré, il ne peut pas être inventé.

## OBS-01 — caméra masquée par une cloison dans l'écurie

**Reproduit** sur la version auditée : allée de l'Écurie du Val, « Va chercher Comète dans son box ».
- Résultat : 52 images sur 548 avec la caméra dans une paroi, 53 avec une vue coupée.
- Les cas se concentrent contre les façades des boxes, près de la porte du pignon ouest (points P4, P5, P7).
- Captures : `PREUVES/OBS-01/avant/`.

**Cause démontrée** :
- La perche de la caméra n'était sondée qu'à partir de 1,2 m du personnage, et raccourcie au mieux à 1,2 m.
- À moins de 1,2 m d'une paroi, la caméra se plaçait donc dans la cloison ou derrière (grilles et bois des boxes en plein écran).

**Correctif local** (`src/entities/camera.js`, `src/entities/realistic.js`) :
- **Où** : à pied et sous un toit seulement (allée d'écurie, club-house : zones à plafond).
- **Quoi** : la perche est sondée dès 0,3 m et raccourcie progressivement jusqu'à 0,3 m.
- **Personnage masqué** quand la caméra touche sa tête (perche de moins de 0,8 m), pour cette image seulement. Il reste animé. Le modèle réaliste suit cette visibilité : jusqu'ici il restait affiché, figé, quand le personnage était masqué.
- **Dehors : inchangé.** Les murs ne deviennent jamais transparents.
- **Après correctif** : 0 image sur 622 (caméra dans une paroi ou vue coupée), y compris aux angles fautifs de la mesure « avant » (`PREUVES/OBS-01/apres/`).

## Version de test identifiable

`vite.config.js` injecte au build le commit court, un indicateur « +modifs » si le code n'est pas commité, et la date UTC. Le menu pause l'affiche :

> Version 2.0.0 · `<commit>` · `<date>` UTC

La constante `BUILD` (2.0.0), utilisée par les sauvegardes et les classements, est inchangée.

## Tests ajoutés

| Fichier | Contenu |
|---|---|
| `tests/e2e/master-ramp.mjs` | COR-M00 à M06 : cycle complet du Master ×2, au toucher et au joystick |
| `tests/e2e/mission-resume.mjs` | COR-S01 à S04 : vrais rechargements (écran titre, « Continuer ») |
| `tests/e2e/camera-barn.mjs` | COR-C01 : mesure avant / après, captures |
| `tests/e2e/contest-full.mjs` | COR-P01 : concours du Pôle joué de bout en bout depuis l'état E08 |
| `tests/e2e/make-test-states.mjs` | Production des états de test E01 à E09 |

**Test existant adapté** : `tests/e2e/master.mjs`. Il fermait le pont par un appel direct, faute d'action disponible (contournement d'AUD-02). Il le ferme maintenant par l'action normale et vérifie les deux libellés.
