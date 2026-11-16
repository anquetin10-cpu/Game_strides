# Revue Grand Tour selon les skills — 16 novembre 2026

Branche de travail `claude/gt-revue-skills`, partie de `2e577f1` (version en production). Rien n'est déployé : aucune
fusion ni aucun push vers `claude/strides-grand-tour`.

**Conditions des mesures.** Chromium en rendu logiciel (SwiftShader), pas de 1/30 s, serveur de développement. **Ce
n'est pas Safari sur iPhone.** Les chiffres de simulation sont des hypothèses de gameplay, pas des mesures
biomécaniques. Un build vert ne valide pas le rendu, et un compteur absent vaut « non évalué », jamais « budget OK ».

## 1. Inventaire des skills

Les skills synchronisés sont dans `~/.claude/skills/synced/82769a21-…_f6b0bec1-…/`, noté `<synced>` ci-dessous.

| Skill | Présent | Chemin | Pertinence pour Grand Tour |
|---|---|---|---|
| equine-jump-gameplay | oui (voir note) | `.claude/skills/equine-jump-gameplay/` dans le dépôt, puis aussi `<synced>/equine-jump-gameplay/` | **appliqué** : saut, appel, bascule, réception, cavalier |
| camera-systems | oui | `<synced>/camera-systems/` | appliqué : caméra de suivi pendant le saut |
| web-input-touch | oui | `<synced>/web-input-touch/` | appliqué : revue de `src/core/input.js` |
| threejs-game-ui-designer | oui | `<synced>/threejs-game-ui-designer/` | revue seulement (HUD non modifié dans ce lot) |
| threejs-debug-profiler | oui | `<synced>/threejs-debug-profiler/` | appliqué : remonter du symptôme jusqu'au module responsable |
| threejs-visual-validation | oui | `<synced>/threejs-visual-validation/` | appliqué : vues fixes, cas limite, séquence temporelle |
| threejs-qa-release | oui | `<synced>/threejs-qa-release/` | appliqué : vidéo du mouvement, accès de test absents du build publié, réserves |
| threejs-animation, threejs-performance | oui | `<synced>/threejs-animation/`, `<synced>/threejs-performance/` | animation : appliqué (clips, root motion) ; performance : non évalué dans ce lot |
| threejs-fundamentals, -loaders, -materials, -lighting, -textures, -geometry, -interaction, -shaders, -postprocessing, -asset-pipeline | oui | `<synced>/threejs-*/` | pertinents selon le sujet ; non utilisés dans ce lot |
| threejs-react-three-fiber | oui | `<synced>/threejs-react-three-fiber/` | **non pertinent** : le jeu n'utilise pas React |
| gsap-core, -timeline, -utils, -performance, -plugins, -frameworks, -react, -scrolltrigger | oui | `<synced>/gsap-*/` | **non pertinents** : GSAP n'est pas une dépendance du jeu, dont les animations sont maison |

**Note sur equine-jump-gameplay.**
- Au début de la session, il était absent du manifeste synchronisé (dernière mise à jour 08:30 UTC) et du disque.
- Il a été installé à partir du paquet transmis par l'utilisateur, dans le dépôt, sous `.claude/skills/equine-jump-gameplay/`. Les empreintes SHA-256 sont conformes pour les trois fichiers :
  - `SKILL.md` : `cf784322…`
  - `references/sources.md` : `c9a8a476…`
  - `references/verification.md` : `b95bb92d…`
- Il est ensuite apparu aussi dans `<synced>`, avec un contenu identique. Seule différence : la ligne `description` du `SKILL.md` synchronisé est entre guillemets (empreinte `65bbf0c8…`).

**Écartés.**
- VetClaw, VÉLØ, Sportily et Punting Buddy ne sont pas installés.
- horse-skill et horse-report restent des inspirations documentaires (voir `references/sources.md` du skill), pas des dépendances.
- Aucun service payant ni aucune nouvelle dépendance npm.

## 2. Revue par couche

Gravité : **G1** bloquant ou très visible, **G2** visible, **G3** mineur. L'effort est indicatif.

### 2.1 Saut : trajectoire, posture et membres

Le saut repose sur trois couches.

- **Trajectoire (repère physique).** Parabole `jumpY = 4·peak·τ·(1−τ)`, avec `τ = jumpT` de 0 à 1 (`src/entities/horse.js:171`). Durée `jumpDur = len / v`. Les collisions et le jugement des barres utilisent cette trajectoire.
- **Posture.** Clips de saut du cheval WildMesh (`jump_canter`, `jump_gallop`), joués par `src/entities/pjl/view.js` à un temps donné par `pjlHorse._jumpTime` (`src/entities/pjlHorse.js:430`).
- **Membres et contacts.** Ils viennent du clip. Pour éviter un double déplacement, la vue annule la montée du corps propre au clip (`rootY = −rise`), et la trajectoire du jeu porte seule l'élévation.

| # | Défaut | Couche / phase | Preuve | Gravité / impact joueur / effort | État |
|---|---|---|---|---|---|
| S1 | Le corps du cheval était recalé sur la hauteur du **bassin**, traitée comme centre de masse. Or dans le clip, le bassin est bas pendant la poussée et ne culmine qu'au poser des antérieurs (bascule). Conséquences : antérieurs **enfoncés de 10 cm** dans le sol à la réception ; postérieurs soulevés pendant l'appel (jusqu'à 60 cm) | posture ↔ trajectoire ; appel et réception | `view.js` `pelvisRise` → `rootY` ; mesures `docs/revue-2026-11-16/mesures-saut.json` (avant : `anterieursReceptionMin` −0,104 / −0,107 m) ; planches `saut-*-avant-apres.jpg` | G1 / sabots dans le sable à chaque saut / faible | **corrigé** |
| S2 | Le sommet du clip était calé sur le **bassin le plus haut**, atteint tard. Conséquence : 80 % du vol du clip joué pendant la montée du jeu, **pose quasi figée pendant toute la descente** (temps de clip 0,867 → 0,917 s pour τ de 0,5 à 1) | posture ; descente | `pjlHorse.js:433-439` (`_apex`) ; `mesures-saut.json` (`clipT`) | G1 / cheval « planté » en l'air, puis réception brusque / faible | **corrigé** |
| S3 | Pas de phase de préparation : la trajectoire monte dès l'appui sur « Saut » (pente maximale à τ = 0). Les postérieurs, qui poussent encore dans le clip, sont donc portés en l'air de **26 à 44 cm** pendant les 0,1 premières secondes | trajectoire ; appel | `horse.js:146` (`jumpT = 0`), `:338` ; `mesures-saut.json` (`posterieursAppelMax` après correction : 0,36 à 0,44 m) | G2 / appel « sans appui », visible au ralenti / **élevé** : toucher au temps du saut change le gameplay (jugement CSO, distance d'appel) | **non corrigé** : à concevoir (fiche de conception d'abord) |
| S4 | Hauteur d'élévation en terrain libre : `jumpY` atteint 1,38 m au galop et 1,16 m au grand galop | trajectoire | `mesures-saut.json` | G3 / valeur de gameplay, sans référence publiée équivalente / — | **non modifié** : préférence de gameplay, à arbitrer par Julien |
| S5 | Sabots face aux barres non vérifiés : le jugement des barres porte sur la trajectoire du jeu plus `clearance`, pas sur la position des sabots visibles | membres ; franchissement | `horse.js:74`, `obstacles.js` | G2 / possible barre « traversée » à l'image sans faute, ou l'inverse / moyen | **non vérifié** : prochain lot (mesure sabots contre barres en CSO) |
| S6 | Cavalier : buste plié jusqu'à 67-68° de la verticale au sommet, bassin du cavalier de 0,24 à 0,26 m au-dessus du siège (avant la correction : 0,33 à 0,35 m). Aucune jambe dans le cheval | cavalier | `anim.js:483-512` (`jumpK`, `release`) ; `mesures-saut.json` | G3 / plausibilité à juger à l'œil / — | **non modifié** : réglages de Julien conservés, jugement visuel attendu |

**Correction S1 et S2** (`src/entities/pjl/asset.js`, `src/entities/pjl/view.js`, `src/entities/pjlHorse.js`) :
- La montée du corps du clip est mesurée au **centre du tronc**, milieu entre le bassin et le garrot (`spine_04`), au lieu du bassin seul.
- Ce point est une **hypothèse de simulation** pour approcher le centre de masse ; ce n'est pas une mesure. Il sert :
  - à l'annulation de la montée du clip, pour qu'il n'y ait pas de double déplacement ;
  - au calage du sommet du clip sur le sommet de la parabole. Le sommet passe de 0,867 à 0,708 s pour `jump_gallop` (vol du clip de 0,3125 à 0,9167 s), et de 0,75 à 0,625 s pour `jump_canter`.
- Aucune valeur de gameplay n'est modifiée : durée, hauteur et longueur du saut, collisions, jugement CSO, pas d'assistance ajoutée.

| Mesure (`jump-pose.mjs`) | Galop 8,45 m/s, avant | Galop, après | Grand galop 14 m/s, avant | Grand galop, après |
|---|---|---|---|---|
| Antérieur le plus bas à la réception | −0,104 m | −0,001 m | −0,107 m | −0,004 m |
| Postérieurs, maximum pendant l'appel (τ < 0,12) | 0,602 m | 0,435 m | 0,529 m | 0,394 m |
| Temps de clip pendant la descente (τ de 0,5 à 1) | 0,867 → 0,917 s | 0,708 → 0,917 s | 0,867 → 0,917 s | 0,708 → 0,917 s |
| Bascule du dos, min / max | −31° / +4° | −31° / +6° | −30° / +8° | −30° / +9° |
| Jambes du cavalier dans le cheval | 0 | 0 | 0 | 0 |

Les chiffres « après » proviennent de la passe avec captures et vidéo (`jump-apres`). Une passe sans captures avait donné 0,413 m et 0,329 m pour les postérieurs pendant l'appel : cet écart montre la sensibilité de la mesure à l'élan de départ.

### 2.2 Caméra (camera-systems)

| # | Constat | Preuve | Gravité | État |
|---|---|---|---|---|
| C1 | Lissage indépendant de la cadence (`1 − exp(−k·dt)` et `damp`) ; la caméra raccourcit sa distance contre les obstacles | `src/entities/camera.js:67, 97, 109-111, 141, 212-216` | conforme | — |
| C2 | Pendant le saut, la caméra du jeu suit 12 % de la hauteur (`jumpFollow`). Le cheval reste entièrement cadré au sommet, mais sa silhouette rétrécit d'environ moitié pendant le vol : la caméra semble prendre du retard | `docs/revue-2026-11-16/saut-camera-jeu.jpg` | G3 | **à confirmer**, à vitesse réelle et sur iPhone |

### 2.3 Tactile et HUD (web-input-touch, game-ui-designer)

| # | Constat | Preuve | Gravité | État |
|---|---|---|---|---|
| T1 | Un seul chemin d'événements pointeur pour la souris et le tactile ; `pointercancel`, `lostpointercapture`, `blur` et `visibilitychange` relâchent les commandes ; `touch-action: none` sur la surface de jeu | `src/core/input.js:48-60, 149-152` ; `src/styles.css:75-81` | conforme | — |
| T2 | HUD et téléphone revus au lot 3 du socle (12 applications visibles, de 667 × 300 à 932 × 430) ; pas de nouvelle mesure ici | `LIVRAISON_SOCLE/LISEZMOI.md` | — | non réévalué dans ce lot |

### 2.4 Rendu et performance (debug-profiler, performance, visual-validation)

| # | Constat | Preuve | Gravité | État |
|---|---|---|---|---|
| P1 | Morceau principal du jeu de 2,68 Mo (non compressé) ; Vite signale un morceau de plus de 500 ko | `dist/assets/game-*.js` | G3 | connu (lot 2 du socle) ; non traité |
| P2 | Appels de dessin, triangles et mémoire GPU pendant le saut | — | — | **non évalué** : rendu logiciel, pas de compteurs GPU fiables ; à mesurer sur appareil réel |

### 2.5 QA (qa-release)

- Le mouvement est vérifié sur une séquence non figée, image par image :
  - vues profil et trois-quarts, plus la caméra du jeu ;
  - vidéo à vitesse réelle (30 i/s) et au ralenti (8 i/s), dans `docs/revue-2026-11-16/` ;
  - cas nominal (galop) et cas limite (grand galop à 14 m/s).
- Nouveau test de mesure : `tests/e2e/pjl/jump-pose.mjs`, avec mesures image par image et vues aux instants clés.
- Non couvert :
  - obstacles de CSO, vertical comme oxer (S5) ;
  - appel proche ou loin ;
  - pied gauche et pied droit séparés ;
  - Safari sur iPhone.

## 2.6 Résultats des tests sur `cdf75b4`

- Tests unitaires (`npx vitest run`) : 28 fichiers, 286/286.
- `npm run build` : vert.
- `tests/e2e/pjl/ride.mjs` 844 × 390 : 13/13, dont PJ-04 (saut, réception, retour aux allures) et PJ-05a (sabots au sol à l'appui).
- `tests/e2e/pjl/legs.mjs` : pénétration des jambes du cavalier de 0 cm en montée, pendant le saut (appel, sommet, réception) et en descente.
- `tests/e2e/cso.mjs` : 38/38.
- `tests/e2e/horse-mount.mjs` : 17/17.

## 3. Suite proposée

1. **S5** : mesurer les sabots contre les barres en CSO (vertical, oxer, appel proche et loin), sans changer le jugement.
2. **S3** : fiche de conception d'une préparation à l'appel, qui garde le contact des postérieurs sans modifier le temps de vol ni le jugement. Hypothèses explicites ; aucun protocole mesuré à 1 m transposé en constantes pour 1,60 m.
3. **C2** : confirmer le retard de la caméra pendant le vol, à vitesse réelle et sur iPhone.
4. **S6** : faire juger la posture du cavalier au sommet par Julien.

## 4. Lot 2 (même jour, validé par Julien) : appel, sabots et barres, caméra

Même branche `claude/gt-revue-skills`, rien n'est publié. Chromium émulé en rendu logiciel, pas Safari sur iPhone.

Couches du saut, conformément à equine-jump-gameplay :
- **trajectoire** : `jumpY`, jumpModel `arcY`, collisions et jugement. **Inchangée.**
- **posture** : corps du clip WildMesh et ses corrections. **Modifiée.**
- **membres et contacts** : sabots mesurés.

Les seuils ci-dessous sont des hypothèses de gameplay, pas des mesures biomécaniques. Aucune valeur de compétition n'est modifiée (hauteur, durée et longueur de saut, `JUMP.*`, jugement), et aucune assistance invisible n'est ajoutée.

### 4.1 Appel (S3) : corrigé dans la posture

- **Défaut.** La trajectoire monte dès l'appui ; or le clip montre encore les postérieurs en appui, jusqu'à leur décollage (`toeOff`). Ils flottaient de 0,49 à 0,53 m au-dessus du sol pendant la poussée.
- **Correction** (`src/entities/pjlHorse.js`, `_pushContact`). Tant que le clip montre les postérieurs en appui :
  - le corps est abaissé de ce qu'il faut pour que le postérieur le plus bas reste au sol ;
  - la mesure se fait sur la pose de l'image, sans enfoncer les antérieurs ;
  - après le décollage, l'abaissement se résorbe sur 0,25 du vol (`PUSH_RELEASE`), avant les barres.

  Lecture retenue (hypothèse) : la trajectoire du jeu décrit la hauteur des pieds, et les antérieurs quittent le sol en premier.
- **Hors correction.** L'abaissement n'est pas appliqué si les antérieurs sont à moins de 1,6 m d'une barre au décollage, avec un fondu jusqu'à 2,6 m : il les ferait passer plus bas.
- **Cavalier** (`src/entities/human.js`). L'abaissement est exclu du rebond de selle qu'il amortit. Sinon, il levait le bassin de 30 cm au lieu de suivre la selle.
- **Commande.** Aucun délai ajouté : le saut part à l'appui, comme avant.

| Saut libre, `jump-pose.mjs` | Lot 1 | Lot 2 |
|---|---|---|
| Postérieurs, maximum pendant la poussée, galop / grand galop | 0,525 / 0,486 m | 0 / 0 m |
| Antérieur le plus bas à la réception | −0,001 / −0,004 m | −0,001 / −0,004 m (correction du lot 1 conservée) |
| Vitesse verticale du corps, galop (images 0 à 6) | — | 0,4 → 5,9 → 6,8 → 7,0 → 6,5 → 5,3 m/s, continue |
| Écart bassin du cavalier – siège, maximum | 0,24 m | 0,24 à 0,25 m |
| Jambes du cavalier dans le cheval | 0 | 0 |

### 4.2 Sabots face aux barres en CSO (S5) : défaut confirmé, très réduit, pas éliminé

Test : `tests/e2e/pjl/bars.mjs`.
- Entraînement de CSO, donc commandes de concours et modèle de saut v2.
- Obstacles : vertical 1,10 m, oxer 1,00 m, plus des obstacles d'essai ajoutés pour le test (vertical 1,40 et 1,60 m, oxers 1,45 et 1,60 m). Pour ces hauteurs, la puissance de saut du cheval est montée par le test à un niveau Grand Prix.
- Vitesses : 6,5 et 8 m/s.
- Appels : idéal, tôt (début de la bonne zone) et tard (zone « trop près »).
- Mesure : bas du sabot visible (articulation moins son niveau d'appui) au passage de chaque barre, moins le dessus de la barre.

**Constat.** Le jeu juge chaque barre au passage des épaules. Les postérieurs passent 1 à 1,5 m plus loin, souvent après la réception des antérieurs. Au lot 1, ils traversaient la barre jusqu'à −0,80 m sur des sauts jugés sans faute.

**Correction** (`_hindClear`, `_barNeed`). Quand un postérieur approche une barre jugée franchie ou effleurée :
- le corps bascule autour des antérieurs, croupe vers le haut, de 12° au plus ;
- en vol seulement, un relevé de 0,25 m au plus complète, si nécessaire ;
- la marge visée est la marge jugée, plafonnée à 0,20 m ;
- la hauteur de passage est anticipée d'après la vitesse du sabot.

Barre jugée tombée : aucune correction. La caméra n'est pas utilisée pour masquer.

Une bascule ajoutée de 25° a été essayée puis rejetée : le cheval plongeait à la réception, comme une ruade.

| Cas (marge jugée) | Antérieurs, lot 1 → lot 2 | Postérieurs, lot 1 → lot 2 |
|---|---|---|
| Vertical 1,10 m, appel idéal (+0,31) | +0,24 → +0,24 | +0,03 → +0,21 |
| Vertical 1,10 m, tôt (+0,20) | +0,06 → +0,06 | −0,29 → +0,20 |
| Oxer 1,00 m, idéal (+0,45) | +0,32 → +0,32 | −0,16 → +0,28 |
| Vertical 1,40 m, tôt (+0,21) | +0,09 → +0,09 | −0,54 → +0,22 |
| Oxer 1,45 m, idéal (+0,41) | +0,29 → +0,29 | −0,59 → +0,19 |
| Oxer 1,45 m, tôt (+0,18) | +0,03 → +0,02 | −0,66 → −0,21 |
| Vertical 1,60 m, tôt (+0,15) | +0,03 → +0,03 | −0,75 → −0,02 |
| Oxer 1,60 m, idéal (+0,38) | +0,25 → +0,25 | −0,78 → −0,05 |
| Oxer 1,60 m, tôt (+0,25) | +0,11 → +0,11 | −0,80 → −0,30 |
| Oxer 1,60 m, 8 m/s, idéal (+0,41) | +0,29 → +0,29 | −0,76 → +0,03 |
| Appels tardifs (zone « trop près »), tous obstacles | de −0,39 à +0,25 → de −0,73 à +0,25, selon le point d'appel exact | de −0,78 à +0,38 → de −0,33 à +0,38 |

Tableau complet : `docs/revue-2026-11-16/lot2/barres-lot1-lot2.json`.

**Défauts restants.**
- **S5-a (G2).** Oxers de 1,45 et 1,60 m avec appel tôt : un postérieur passe encore de 21 à 30 cm sous le dessus de la barre arrière, après la réception. La bascule bornée ne suffit pas.
- **S5-b (G2, existait avant).** Appel dans la zone « trop près » : un antérieur est déjà au droit de la barre avant au décollage et la traverse, alors que le saut est jugé sans faute ou « effleuré ». Le résultat varie beaucoup d'un essai à l'autre selon le point d'appel exact (par exemple −0,73 puis −1,01 m sur le même cas) ; la comparaison avec le lot 1 n'est donc pas significative.
- **Origine commune.** La géométrie de jugement : barres jugées aux épaules (`REF`), distance minimale d'appel `JUMP.minFront` de 0,55 m. La lever exige une décision de gameplay, hors du mandat :
  - juger aussi les postérieurs et les antérieurs ;
  - ou reculer la distance minimale d'appel ;
  - ou transformer ces appels en faute ou en refus.

### 4.3 Caméra en vol (C2) : retard non confirmé, pas de modification

Saut libre, caméra du jeu :
- distance horizontale caméra-cheval constante pendant le vol : 7,37 à 7,41 m au galop, 8,06 à 8,13 m au grand galop ;
- hauteur relative : décalage d'environ ±0,4 m, dû au lissage voulu de la hauteur visée (`smoothTarget.y`, `damp` 10).

Le rétrécissement apparent de la silhouette vient du repli des membres et de la bascule, pas du cadrage. Données : `lot2/saut-libre-camera.json`.

En CSO, la caméra de concours ne suit volontairement que 12 % de la hauteur du saut (`jumpFollow`) ; ce choix n'est pas modifié.

### 4.4 Vidéos avant/après, lot 1 en haut, lot 2 en bas (`docs/revue-2026-11-16/lot2/`)

Chaque vidéo existe en vitesse réelle (`-reel`, 30 i/s) et au ralenti (`-ralenti`, ×3,75).
- **Saut libre** : `saut-libre-{galop,grand-galop}-{jeu,profil,troisquarts}`. Elles montrent l'appel, la montée, le sommet, la descente et la réception, avec le cheval, le cavalier et la caméra du jeu.
- **CSO, profil fixe** :
  - `cso-5-6.5-ideal` et `cso-5-6.5-tot` : oxer de 1,60 m ;
  - `cso-0-6.5-ideal` et `cso-0-6.5-tard` : vertical de 1,10 m.

## 5. Lot 3 (même jour, validé par Julien) : cohérence pose visible, trajectoire et jugement des barres

Branche `claude/gt-revue-skills`. Rien n'est publié ni fusionné. Chromium émulé en rendu logiciel, sans aucun essai sur iPhone réel.

### 5.1 Statut réel du lot 2 (`ceecd92`)

- **CI**, run 43855576624 :
  - build et tests unitaires : réussis ;
  - série courte de bout en bout : 5/5 ;
  - publication : sautée.
- **Tests locaux** : CSO 38/38, montée/descente 17/17, cheval et cavalier 13/13, jambes du cavalier : 0 cm.
- **Limite**, relevée par la revue indépendante : `tests/e2e/pjl/bars.mjs` mesurait sans rien affirmer et ne tournait pas en CI. Une CI verte ne couvrait donc pas la traversée des barres.
- **Mesure déterministe faite dans ce lot** (§ 5.4), sur le même code : 36 échecs de cohérence, dont 18 sauts jugés sans faute avec un membre réellement dans la barre (pénétration jusqu'à 0,10 m).

### 5.2 Cause

Le jeu jugeait chaque barre au seul point de référence, aux épaules, sur la trajectoire `arcY` + 0,20 m de repli. Les membres visibles passent la barre à d'autres instants :
- les antérieurs, avant les épaules, en montée ;
- les postérieurs, 1 à 1,5 m plus loin, en descente, souvent après la réception des antérieurs.

Rien ne reliait ce que voit le joueur à ce qui est jugé.

### 5.3 Correction (cause, puis posture)

1. **Les contacts réels jugent comme la trajectoire.**
   - `src/gameplay/limbContact.js` (géométrie seule, sous tests unitaires) :
     - chaque membre est fait de deux capsules, le canon (rayon 4,5 cm) et le paturon–sabot (5,5 cm) ;
     - la barre du haut est un cylindre de 5 cm sur la largeur de l'obstacle ;
     - le passage entre deux images est balayé en 6 positions.
   - `PjlHorse._limbContacts` mesure ces contacts sur la pose finale de l'image, après toutes les transformations de rendu.
   - Tout contact de plus de 1 cm est transmis à `Obstacles.limbContact` :
     - la barre tombe, du côté où le membre la pousse ;
     - la faute est comptée une fois par élément ;
     - la cause expliquée est celle de l'appel si le modèle la donne (trop loin, trop près…), sinon le membre qui a touché.
   - Le résultat est annoncé quand les postérieurs ont passé l'obstacle : point de référence 2,2 m après la sortie, ou 1,2 s au plus. Un résultat encore en attente est annoncé avant d'aborder l'obstacle suivant.
   - Le jugement par la trajectoire (`arcY`) est inchangé, de même que les valeurs `JUMP`, le temps de vol et le point d'appel.
2. **Posture coordonnée avec les barres jugées franchies**, hypothèse de gameplay bornée :
   - repli des postérieurs : rotation de la cuisse, 34° au plus ;
   - repli des antérieurs : pliure au genou, toujours vers l'arrière, jamais vers la barre ;
   - bascule de la croupe autour des antérieurs : 12° au plus ;
   - relevé de l'avant-main autour des postérieurs : 15° au plus ;
   - léger relevé du corps en vol : 0,25 m au plus.

   Ce que ces bornes ne dégagent pas reste visible, touche la barre et devient une faute. Rien n'est masqué par la caméra, et aucune tolérance n'a été élargie.
3. **Défauts trouvés en vérifiant, et corrigés :**
   - un pivot partagé entre les deux bascules faisait tourner la croupe autour des postérieurs, ce qui enfonçait un antérieur de 49 cm dans le sol ;
   - le premier repli des antérieurs, par rotation du bras, portait le sabot vers la barre ;
   - aucun contact n'était compté à la première image du vol.

### 5.4 Test de régression bloquant

Le test `tests/e2e/pjl/bars-check.mjs` se lance avec `npm run e2e:barres`. Il fait aussi partie de la série courte de la CI : étape `sabots-barres` de `tests/e2e/smoke.mjs`.

**Conditions du test**
- 6 obstacles : verticaux de 1,10, 1,40 et 1,60 m ; oxers de 1,00, 1,45 et 1,60 m.
- 2 vitesses : 6,5 et 9 m/s.
- 4 appels : tôt, normal, trop près, trop loin. La distance de chaque appel est tirée du modèle de saut du jeu.
- Au total, 42 sauts déterministes :
  - couloir dégagé vérifié avec les collisions du jeu ;
  - élan tenu 40 images ;
  - appel déclenché à une image précise.
- La mesure est indépendante du jeu : elle est réimplémentée dans le test, sur les os en coordonnées monde, avec un balayage en 8 positions.

**Assertions**

| Code | Vérifie |
|---|---|
| B1 | Saut effectué et jugé une fois, ou refus compté |
| B2 | Saut sans faute : aucun membre dans ou sous une barre |
| B3 | Barre touchée : elle tombe, la faute est comptée |
| B4 | Barre tombée : un membre l'a touchée |
| B5 | Appel normal à 6,5 m/s : sans faute |
| B6 | Appel fautif selon le modèle : faute |
| B7 | Passage de chaque sabot au-dessus de chaque barre mesuré |

**Tolérances**
- 1 cm de pénétration, qui correspond à l'approximation des volumes ;
- 2 cm pour le bout de l'os du sabot par rapport à la sole.

**Preuves**

| Version | Code de sortie | Résultat |
|---|---|---|
| `ceecd92` (avant) | 1 | 36 échecs : 18 B2, 18 B3 |
| Régression contrôlée (envoi des contacts au jeu coupé) | 1 | 10 échecs : 5 B2, 5 B3 |
| Lot 3 | 0 | 139/139 vérifications conformes |

### 5.5 Avant / après (mêmes conditions)

| Cas | Modèle à l’appel : zone, marge (m) | `ceecd92` : jugement · pénétration max (m) · sabot le plus bas (m) | Lot 3 : idem |
|---|---|---|---|
| v110 6.5 m/s normal | good +0.28 | sans faute · 0.00 · +0.23 | sans faute · 0.00 · +0.23 |
| v110 6.5 m/s tot | good +0.23 | sans faute · 0.02 · +0.04 | sans faute · 0.00 · +0.13 |
| v110 6.5 m/s pres | near -0.16 | faute · 0.08 · -0.50 | faute · 0.00 · -0.52 |
| v110 6.5 m/s loin | far +0.01 | sans faute · 0.10 · -0.14 | faute · 0.00 · -0.35 |
| v110 9 m/s normal | good +0.32 | sans faute · 0.00 · +0.31 | sans faute · 0.00 · +0.26 |
| v110 9 m/s tot | far -0.04 | faute · 0.00 · -0.32 | faute · 0.00 · -0.32 |
| v110 9 m/s pres | near +0.10 | sans faute · 0.10 · -0.10 | sans faute · 0.00 · +0.17 |
| o100 6.5 m/s normal | good +0.36 | sans faute · 0.00 · +0.28 | sans faute · 0.00 · +0.27 |
| o100 6.5 m/s tot | good +0.27 | sans faute · 0.00 · +0.11 | sans faute · 0.00 · +0.19 |
| o100 6.5 m/s pres | near -0.04 | sans faute · 0.09 · -0.77 | faute · 0.00 · -0.77 |
| o100 6.5 m/s loin | far +0.06 | sans faute · 0.10 · -0.08 | sans faute · 0.00 · +0.08 |
| o100 9 m/s normal | good +0.48 | sans faute · 0.00 · +0.35 | sans faute · 0.00 · +0.36 |
| o100 9 m/s tot | far -0.14 | faute · 0.08 · -0.32 | faute · 0.00 · -0.30 |
| o100 9 m/s pres | good +0.21 | sans faute · 0.06 · +0.01 | sans faute · 0.00 · +0.38 |
| v140 6.5 m/s normal | good +0.27 | sans faute · 0.00 · +0.20 | sans faute · 0.00 · +0.21 |
| v140 6.5 m/s tot | good +0.23 | sans faute · 0.00 · +0.05 | sans faute · 0.00 · +0.12 |
| v140 6.5 m/s pres | near -0.26 | faute · 0.09 · -0.62 | faute · 0.00 · -0.59 |
| v140 6.5 m/s loin | far +0.03 | sans faute · 0.10 · -0.12 | faute · 0.00 · -0.59 |
| v140 9 m/s normal | good +0.32 | sans faute · 0.00 · +0.29 | sans faute · 0.00 · +0.24 |
| v140 9 m/s tot | far -0.06 | faute · 0.00 · -0.55 | faute · 0.00 · -0.55 |
| v140 9 m/s pres | near +0.06 | sans faute · 0.10 · -0.17 | sans faute · 0.00 · +0.12 |
| o145 6.5 m/s normal | good +0.28 | sans faute · 0.08 · -0.02 | sans faute · 0.00 · +0.27 |
| o145 6.5 m/s tot | good +0.29 | sans faute · 0.09 · -0.04 | sans faute · 0.00 · +0.15 |
| o145 6.5 m/s pres | near -0.28 | faute · 0.02 · -1.21 | faute · 0.00 · -0.70 |
| o145 6.5 m/s loin | far +0.08 | sans faute · 0.09 · -0.24 | sans faute · 0.00 · +0.13 |
| o145 9 m/s normal | good +0.49 | sans faute · 0.00 · +0.28 | sans faute · 0.00 · +0.34 |
| o145 9 m/s tot | far -0.18 | faute · 0.05 · -0.72 | faute · 0.00 · -0.69 |
| o145 9 m/s pres | near +0.14 | sans faute · 0.07 · -0.01 | sans faute · 0.00 · +0.30 |
| v160 6.5 m/s normal | good +0.27 | sans faute · 0.00 · +0.24 | sans faute · 0.00 · +0.24 |
| v160 6.5 m/s tot | good +0.23 | sans faute · 0.00 · +0.06 | sans faute · 0.00 · +0.13 |
| v160 6.5 m/s pres | near -0.30 | faute · 0.07 · -1.12 | faute · 0.00 · -1.08 |
| v160 6.5 m/s loin | far +0.04 | sans faute · 0.10 · -0.19 | faute · 0.00 · -0.73 |
| v160 9 m/s normal | good +0.32 | sans faute · 0.00 · +0.27 | sans faute · 0.00 · +0.21 |
| v160 9 m/s tot | far -0.07 | faute · 0.00 · -0.70 | faute · 0.00 · -0.70 |
| v160 9 m/s pres | near +0.03 | sans faute · 0.10 · -0.12 | sans faute · 0.00 · +0.10 |
| o160 6.5 m/s normal | good +0.19 | sans faute · 0.08 · -0.97 | sans faute · 0.00 · +0.23 |
| o160 6.5 m/s tot | good +0.30 | sans faute · 0.10 · -0.17 | sans faute · 0.00 · +0.17 |
| o160 6.5 m/s pres | near -0.34 | refus · 0.00 · -1.61 | refus · 0.00 · -1.61 |
| o160 6.5 m/s loin | far +0.09 | sans faute · 0.09 · -0.36 | faute · 0.00 · +0.04 |
| o160 9 m/s normal | good +0.48 | sans faute · 0.00 · +0.31 | sans faute · 0.00 · +0.33 |
| o160 9 m/s tot | far -0.21 | faute · 0.05 · -0.87 | faute · 0.00 · -0.85 |
| o160 9 m/s pres | near +0.13 | sans faute · 0.09 · -0.05 | sans faute · 0.00 · +0.30 |

Données : `docs/revue-2026-11-16/lot3/barres-avant-apres.json`.

**Effets de jeu à connaître**
- Dans la zone « far » ou « near », un appel dont la marge du modèle est légèrement positive (+0,01 à +0,09) est maintenant une faute **si un membre touche visiblement la barre**. Avant, il était jugé sans faute alors que la jambe traversait la barre. Cas concernés :
  - verticaux appelés trop loin ;
  - oxer de 1,00 m appelé trop près (marge −0,04, dans la tolérance « effleurée » du modèle).
- Tous les appels de la zone « good » restent sans faute, avec le sabot le plus bas entre +0,11 et +0,36 m au-dessus de la barre.

**Compromis et limites**
- **Couplage rendu / jugement.** Le jugement dépend désormais de la pose affichée du cheval WildMesh du joueur. Une autre vue, ou un cheval non joueur, garde le seul jugement par la trajectoire.
- **Cadence.** La pose est mise à jour à chaque image et le contact est balayé entre deux images. Aucune autre cadence que le pas de 1/30 s n'a été mesurée.
- **Refus « tout contre »** (oxer de 1,60 m, appel très près) : la barre tombe par la règle existante du refus, le cheval pilant dans l'obstacle, et non par un contact de membre mesuré.
- **Volumes approchés.** Les membres sont des capsules et le sabot est estimé à partir de ses os ; ce n'est pas le maillage réel.

### 5.6 Vidéos avant / après (`docs/revue-2026-11-16/lot3/`)

- **Cas.** Avant (`ceecd92`) en haut, lot 3 en bas, mêmes conditions que le test :
  - `cso-o160-6.5-normal` : oxer de 1,60 m, appel normal ;
  - `cso-o145-6.5-tot` : oxer de 1,45 m, appel tôt ;
  - `cso-v110-6.5-pres` : vertical de 1,10 m, appel trop près, faute attendue.
- **Vues.** Profil fixe (`-profil`) et caméra du jeu (`-jeu`).
- **Vitesses.** Réelle, 30 i/s (`-reel`), et ralenti ×3,75 (`-ralenti`).
- **Mesures incrustées.** Temps depuis l'appel, progression du saut, distance et hauteur de chaque sabot par rapport à la barre la plus proche, barres tombées, jugement.
