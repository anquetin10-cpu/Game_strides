// Banc de parité CSO : oracles de scénario et captures jumelles, exportés du jeu web EN COURS D'EXÉCUTION (ce qui
// n'existe qu'au runtime : classes Obstacles, FollowCamera, HUD, audio, bus). Le jeu web est la spécification ; ce
// script ne modifie rien dans src/ ni tests/ : il pilote la page par l'API du jeu et le pilote injecté
// tests/e2e/autopilot.js (lu, jamais modifié), au pas fixe de 1/30 s.
//
// Sorties :
//  - unreal/core/tests/oracles/cso_runs/ : scénarios rejoués image par image, un fichier par scénario et par langue
//    (<id>.<lang>.json) et un index (index.json : en-tête descriptif des canaux, liste des exécutions ; format et
//    écriture dans scripts/unreal/cso-runs-io.mjs). Pour chaque scénario et chaque langue (fr puis en) : entrées appliquées à chaque image (joystick virtuel move x / y, touches clavier, actions maintenues,
//    appui SAUT, bouton d'interface touché), puis l'état après l'image : cheval, épreuve, tableau de chrono, événements
//    du bus, appels hud.* et audio.* (nom, arguments), caméra (œil, cible, direction, FOV vertical), barres déplacées.
//    Déterministe : hasard du navigateur remplacé par un générateur à graine, horloges virtuelles (performance.now,
//    Date.now avancent de 1/30 s par image), temps de jeu fixés. Deux exécutions donnent des fichiers identiques octet
//    pour octet (critère T1 de unreal/docs/parite/cso-ecarts.md) ; un fichier inchangé n'est pas réécrit.
//    Canal « ch » (tranche T2, cheval de concours) : état complet du cheval en pleine précision, rejoué par
//    unreal/core/tests/test_core.cpp (testHorseRuns). Canal « ep » (tranche T4, déroulé d'épreuve) : entrées de la
//    mission (Run.update) rejouées par testCsoRuns ; scénarios t4-* en français et en anglais, images « légères ».
//    Canal « cc » (tranche T6, caméra de concours) : appels de FollowCamera._updateComp en pleine précision (cheval vu
//    par la caméra, obstacle suivant, réponses de la sonde de la perche et du sol, œil, point visé, FOV), rejoué par
//    testCamRuns ; scénario « cadrage » = tests/e2e/cso-framing.mjs au pas fixe, mesures du cadrage (fr) à ses instants.
//  - unreal/core/tests/oracles/cso_target.json : grille de visée (obstacles.target / timing du jeu) pour 11 220 poses,
//    appuis SAUT (Horse.startJump) et refus décidés (Obstacles.refuse) sur des poses du cheval.
//  - unreal/core/tests/oracles/cso_goto.json : étape « rejoindre l'entrée » (grille de points suivis, fr et en).
//    --only=id1,id2 : seulement ces scénarios (et « target » / « goto » pour les grilles) ; les autres exécutions de
//    l'index sont gardées telles quelles. --out=<dossier> : dossier des exécutions (défaut ci-dessus) ; les grilles
//    vont dans son dossier parent (--goto-out=<fichier> pour l'étape goto).
//  - avec --shots : unreal/docs/parite/cso/poses.json (pose du cheval, œil, cible, FOV vertical, soleil, viewport) et la
//    capture web de chaque pose (unreal/docs/parite/cso/<pose>-web.png, 844 × 390, deviceScaleFactor 1) ; la capture
//    Unreal jumelle est faite par -StridesShots=cso, le montage par scripts/unreal/parite-montage.py.
//    --shots=carriere : seulement les poses de la carrière (vue aérienne, lignes de départ et d'arrivée, poteau
//    « Chrono », tranche T5) ; --shots=chute : seulement la chute de barre (T3) ; --shots=cadrage : seulement la caméra
//    de concours aux 6 instants de tests/e2e/cso-framing.mjs (T6) ; les autres poses sont gardées.
//    --shots=robe (C1, robe du cheval engagé) : poses robe-* (cheval du joueur à l'arrêt au départ après la cloche, profil,
//    trois quarts arrière et avant ; robe du cheval WildMesh relevée dans coatLive) ; les autres poses sont gardées.
//    --shots=aides (tranche T9) : poses aide-* (exécutions t9-* arrêtées à l'image choisie, 844 × 390 et 667 × 308 ;
//    captures 4 et 5 de la recette : PNG de tests/e2e/out/cso/ et exécution t9-recette) ; --poses=nom1,nom2 : ces poses
//    seulement, les autres poses aide-* gardées.
//    --shots=bilan (tranche T11) : poses bilan-* (exécution t9-parcours arrêtée au grand message « SANS FAUTE ! » et à
//    la carte de bilan ; contrôle adverse : t11-trois-barres arrêtée à la carte, corps en haut puis défilé jusqu'en bas ;
//    mise en page de la carte relevée ; 844 × 390 et 667 × 308) ;
//    --shots=entree (tranche T10) : poses entree-* (exécution t9-recette arrêtée aux captures 1-presentation, 2-plan,
//    3-cloche de la recette et à l'annonce du dossard, 844 × 390 et 667 × 308 ; carte ouverte relevée dans le DOM) ;
//    --poses= comme ci-dessus.
//  - avec --fences (tranche T5) : géométrie des obstacles du parcours, des lignes et du poteau « Chrono » construite par
//    le jeu web (scripts/unreal/cso-export.js, chargé dans la page), comparée au jeu réel hors épreuve et en épreuve :
//    .tmp/unreal-import/cso/ (cso_fences.glb, sign_*.png, importés par scripts/unreal/import-cso-fences.py) et le
//    manifeste unreal/StridesGrandTour/Content/World/Cso/cso_fences.json (relu par le jeu et le test Strides.Parite.CsoScenery).
//  - avec --freeze (tranche T8) : unreal/core/tests/oracles/cso_freeze.json, gel du cheval et du chrono en pause et au
//    téléphone image par image (boucle de game.js:1406), rejoué par le test moteur Strides.Cso.Controls.
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5173 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs [--shots[=carriere|robe|chute|cadrage|aides] [--poses=…]] [--fences] [--freeze] [--aids] [--only=…] [--out=dossier]
// Mode d'emploi du banc (oracles, captures, montages, PARITE.md) : unreal/docs/parite/README.md.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { RUNS_SCHEMA, RUNS_LAYOUT, runFile, writeRuns } from './cso-runs-io.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
// --shots : toutes les poses de capture ; --shots=chute : seulement la chute de barre (tranche T3), ajoutée à poses.json.
const SHOTS_ARG = process.argv.find((a) => a === '--shots' || a.startsWith('--shots='));
const SHOTS = !!SHOTS_ARG;
const SHOTS_ONLY = SHOTS_ARG && SHOTS_ARG.includes('=') ? SHOTS_ARG.slice(8) : null;
// --fences : export de la géométrie des obstacles (tranche T5) ; seul, ou avec --shots, il ne rejoue aucun scénario.
const FENCES = process.argv.includes('--fences');
// --freeze (tranche T8, contrôle adverse) : gel en pause et au téléphone, image par image (oracle cso_freeze.json) ; seul,
// il ne rejoue aucun scénario.
const FREEZE = process.argv.includes('--freeze');
// --aids (tranche T9) : oracle cso_takeoff_zone.json (takeoffZone sur une grille, tirets du tracé) et données du jeu
// Content/Data/cso_aids.json (LINE_MARK, matériaux et géométries des aides, relus dans la scène) ; seul, il ne rejoue
// aucun scénario.
const AIDS_DATA = process.argv.includes('--aids');
const NO_RUNS = !!SHOTS_ONLY || FENCES || FREEZE || AIDS_DATA;
const FENCES_OUT = join(ROOT, '.tmp/unreal-import/cso');
const FENCES_MANIFEST = join(ROOT, 'unreal/StridesGrandTour/Content/World/Cso/cso_fences.json');
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || join(ROOT, 'unreal/core/tests/oracles/cso_runs');
const ORA = dirname(OUT); // grilles cso_target.json et cso_goto.json, à côté du dossier des exécutions
const PARITE = join(ROOT, 'unreal/docs/parite/cso');
const VIEW = { width: 844, height: 390 };
const AUTOPILOT = readFileSync(join(ROOT, 'tests/e2e/autopilot.js'), 'utf8');

// Sons continus ou d'ambiance, appelés à chaque image ou au hasard (hors épreuve) : non relevés.
const AUDIO_IGNORED = ['ambience', 'setRain', 'setMusic', 'musicTick', 'birdsong', 'gull', 'truckEngine', 'vehicleEngine', 'unlock', 'setEnabled'];
const HUD_METHODS = ['big', 'toast', 'hint', 'clearHint', 'notify', 'jumpFeedback', 'jumpEarly', 'setObjective', 'dialog', 'closeDialog'];
const HUD_DEDUPE = ['setObjective']; // appelé à chaque image par les missions : relevé seulement quand il change

// Scénarios. `setup` : état posé avant l'image 0 (rien d'autre n'est forcé ensuite) ; `drive` : règle des entrées de
// chaque image, évaluée dans la page (les entrées réellement appliquées sont écrites dans l'oracle, le rejeu n'a pas
// besoin de la règle).
const SCENARIOS = [
  {
    id: 'droit',
    desc: 'Parcours du Pôle (cso_train) : présentation, Entrer en piste, annonce, cloche ; cheval posé à l’arrêt 16 m avant la ligne de départ, dans son axe ; joystick vers l’avant jusqu’au galop de concours (6,2 m/s) puis relâché, aucune direction ; SAUT quand l’aide affiche la bonne zone et que le sommet du saut tombe sur l’obstacle (règle de tests/e2e/autopilot.js) ; ligne droite jusqu’à 10 m après le 1.',
    before: 16, // m avant la ligne de départ
    after: 10, // m après l'obstacle 1
    cadence: 6.2,
    maxFrames: 900,
  },
  // Scénarios du cheval de concours (tranche T2) : même entrée en piste que « droit » (présentation, Entrer en piste,
  // cloche), non enregistrée ; puis cheval posé (carrière : x, z locaux, cap h, vitesse v) et images enregistrées.
  // Langue sans effet sur la simulation (vérifié par « droit ») : français seulement.
  { id: 'bonne-zone', type: 'pose', langs: ['fr'], pose: { x: -19.67, z: -28.78, h: Math.PI / 2, v: 6.23 }, maxFrames: 300,
    desc: 'Abord droit de l’oxer 2 à 6,23 m/s (cadence initiale arrondie à 6,2), joystick relâché ; SAUT à la première image où l’aide affiche la bonne zone ; jusqu’à 10 m après l’oxer.' },
  { id: 'virage-serre', type: 'pose', langs: ['fr'], pose: { x: 36, z: -10, h: Math.PI / 2, v: 6.2 }, maxFrames: 260,
    desc: 'Galop de concours (6,2 m/s) dans l’espace libre de la carrière : 1 s tout droit, 2,5 s joystick à fond à gauche, 1,5 s à fond à droite, 1 s à mi-course à droite, 0,5 s relâché.' },
  { id: 'rampe-clavier', type: 'pose', langs: ['fr'], pose: { x: 36, z: 12, h: Math.PI, v: 4.6 }, maxFrames: 200,
    desc: 'Clavier au trot (4,6 m/s) : ↑ 1 s, ↑→ 0,6 s, ↑← 0,6 s (inversion), ↑ 0,4 s (retour), ↓ 0,6 s, D 0,4 s, rien 0,2 s, A+W 0,4 s.' },
  { id: 'ctrl-alt', type: 'pose', langs: ['fr'], pose: { x: 46, z: 20, h: Math.PI, v: 6.2 }, maxFrames: 200,
    desc: 'Clavier au galop (6,2 m/s) avec Ctrl gauche (amplitude 0,5) et Alt gauche (0,25) : ↑+Ctrl 1 s, ↓+Ctrl 1 s, ↑+Alt 1 s, →+Ctrl 0,8 s, ←+Alt 0,8 s, rien 0,4 s.' },
  { id: 'appui-10m', type: 'pose', langs: ['fr'], pose: { x: 8, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 300,
    desc: 'Abord droit du vertical 3 à 6,2 m/s : SAUT quand la première barre est à 10 m des épaules (sans effet : bien trop tôt), puis SAUT selon la règle de tests/e2e/autopilot.js ; jusqu’à 10 m après le 3.' },
  { id: 'appui-3ms', type: 'pose', langs: ['fr'], pose: { x: 31.83, z: 0.22, h: -Math.PI / 2, v: 3.0 }, maxFrames: 200,
    desc: 'Abord droit du vertical 4A à 3 m/s (sous la vitesse minimale de saut) : SAUT quand la barre est à 4 m des épaules ; arrêt de l’enregistrement à 3 m.' },
  { id: 'abord-70', type: 'pose', langs: ['fr'], pose: { x: 19.83 + 10 * Math.cos((70 * Math.PI) / 180), z: 0.22 - 10 * Math.sin((70 * Math.PI) / 180), h: -Math.PI / 2 + (70 * Math.PI) / 180, v: 6.2 }, cross: { x: 19.83, z: 0.22 }, maxFrames: 200,
    desc: 'Abord du vertical 4A à 70° de son axe, 6,2 m/s, ligne de marche passant par son centre : SAUT à 7 m du point de passage (aucun obstacle visé : bien trop tôt) ; arrêt de l’enregistrement à 4 m (avant le chandelier).' },
  { id: 'refus', type: 'pose', langs: ['fr'], pose: { x: -36, z: 28.21, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'Abord droit du vertical 6A à 6,2 m/s sans appui : refus décidé par Obstacles.updateHorse (tranche T3, recalé), freinage, cabré ; joystick avant pendant le freinage, avant-droite pendant le cabré (cadence figée, direction coupée), puis arrière-gauche 20 images après.' },
  // Compléments du contrôle de T2 : branches du pas du cheval qu'aucun scénario précédent n'exerçait.
  { id: 'virage-en-lair', type: 'pose', langs: ['fr'], pose: { x: -19.67, z: -28.78, h: Math.PI / 2, v: 6.23 }, maxFrames: 300,
    desc: 'Abord droit de l’oxer 2 comme « bonne-zone » ; SAUT à la première image où l’aide affiche la bonne zone ; joystick à fond à droite pendant tout le vol (lacet pris en l’air, rotation réduite à airTurn), relâché à la réception ; jusqu’à 1 s après la réception.' },
  { id: 'survitesse', type: 'pose', langs: ['fr'], pose: { x: 36, z: 12, h: Math.PI, v: 9.6 }, maxFrames: 60,
    desc: 'Cheval posé à 9,6 m/s (grand galop), au-dessus de la cadence maximale de concours (8 m/s) : cadence de départ bornée à 8, vitesse ramenée à 8 m/s sous le plafond de ralentissement de 9 m/s² (horse.js:289) ; joystick relâché, 1 s.' },
  { id: 'cadence-depart', type: 'pose', langs: ['fr'], pose: { x: 36, z: 12, h: Math.PI, v: 5.47 }, maxFrames: 60,
    desc: 'Contrôle des remarques (hygiène) : cheval posé à 5,47 m/s, vitesse qui n’est pas un multiple de 0,1 : cadence de départ = vitesse arrondie au dixième (Math.round, csoRide.js) = 5,5 m/s, et non 5,4 (arrondi par défaut) ; joystick relâché, 1 s.' },
  { id: 'abord-61', type: 'pose', langs: ['fr'], pose: { x: 19.83 + 10 * Math.cos((61 * Math.PI) / 180), z: 2.22 - 10 * Math.sin((61 * Math.PI) / 180), h: -Math.PI / 2 + (61 * Math.PI) / 180, v: 4.6 }, cross: { x: 19.83, z: 2.22 }, maxFrames: 200,
    desc: 'Abord du vertical 4A à 61° de son axe (hors de l’angle de saut), 4,6 m/s, ligne de marche coupant le plan de l’obstacle à 2 m de son centre, côté opposé à l’arrivée : les épaules entrent dans la largeur loin de la barre ; refus décidé par Obstacles.updateHorse quand l’écart passe sous v²/16 + 0,3 (tranche T3), freinage, cabré ; joystick relâché ; jusqu’à la fin du cabré.' },
  { id: 'appel-pres', type: 'pose', langs: ['fr'], pose: { x: 8, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 300,
    desc: 'Abord droit du vertical 3 à 6,2 m/s : SAUT à la première image où l’obstacle visé est en zone « près » (saut raccourci au plus, perte d’élan à la réception plafonnée à 4 %) ; jusqu’à 10 m après le 3.' },
  // Scénarios des obstacles (tranche T3 : jugement au passage, refus, chute des barres). Cheval affiché en modèle
  // classique (?classic : pas de cheval WildMesh, donc aucun contact des membres et Obstacles._limbJudged faux) : le
  // jugement ne dépend que de la trajectoire, comme dans le portage. Fin de l'enregistrement : barres au repos (chute
  // terminée, vibration éteinte, aucune barre en attente) et cheval éloigné ou cabré terminé.
  { id: 't3-sans-faute', type: 'pose', classic: true, langs: ['fr'], pose: { x: 8, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 300,
    desc: 'Abord droit du vertical 3 à 6,2 m/s : SAUT selon la règle de tests/e2e/autopilot.js (bonne zone, sommet sur l’obstacle) ; franchi, résultat annoncé à la sortie des épaules (membres non jugés) ; jusqu’à 8 m après le 3.' },
  { id: 't3-oxer-loin', type: 'pose', classic: true, langs: ['fr'], pose: { x: -19.67, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'Abord droit de l’oxer 2 à 6,2 m/s : SAUT à la première image où l’oxer est en zone « loin » avec la barre avant à moins de 5 m des épaules ; appel bien trop loin, les deux barres tombent, une seule faute ; jusqu’à la fin des chutes.' },
  { id: 't3-pres-montee', type: 'pose', classic: true, langs: ['fr'], pose: { x: 8.1, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'Abord droit du vertical 3 à 6,2 m/s : SAUT à la première image où le 3 est en zone « près » avec une marge prévue sous −0,06 m ; barre touchée en montée (antérieurs), elle tombe tout de suite ; jusqu’à la fin de la chute.' },
  { id: 't3-posterieurs', type: 'pose', classic: true, langs: ['fr'], pose: { x: 8, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'Abord droit du vertical 3 à 6,2 m/s : SAUT à la première image où le 3 est en zone « loin » avec une marge prévue sous −0,06 m ; barre touchée en descente (postérieurs) : sa chute attend 1,1 m parcourus par le cheval ; jusqu’à la fin de la chute.' },
  { id: 't3-effleurement', type: 'pose', classic: true, langs: ['fr'], pose: { x: 8, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'Abord droit du vertical 3 à 6,2 m/s : SAUT à la première image où la marge prévue est entre −0,06 et 0,04 m (barre effleurée : elle tinte et vibre, reste en place, franchi) ; jusqu’à la fin de la vibration.' },
  // Seuils du jugement (contrôle par mutations) : marge juste sous −0,06 (faute) et juste sous +0,04 (effleurement) ;
  // poses choisies au centimètre pour que la marge prévue à l'appui tombe dans ces fenêtres.
  { id: 't3-faute-limite', type: 'pose', classic: true, langs: ['fr'], pose: { x: 8.16, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'Abord droit du vertical 3 à 6,2 m/s : SAUT à la première image où la marge prévue est entre −0,08 et −0,06 m (barre touchée de justesse en descente : faute, chute après 1,1 m) ; jusqu’à la fin de la chute.' },
  { id: 't3-effleurement-haut', type: 'pose', classic: true, langs: ['fr'], pose: { x: 8.13, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'Abord droit du vertical 3 à 6,2 m/s : SAUT à la première image où la marge prévue est entre +0,02 et +0,04 m (barre effleurée de justesse : vibration, franchi) ; jusqu’à la fin de la vibration.' },
  { id: 't3-refus-62', type: 'pose', classic: true, langs: ['fr'], pose: { x: -36, z: 28.21, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'Abord droit du vertical 6A à 6,2 m/s sans appui : refus décidé à l’abord, freinage jusqu’à l’arrêt, nez dans l’obstacle (barre avant emportée dans le sens de la marche, garde-fou du nez), cabré 1,1 s, refus compté à l’arrêt ; jusqu’à la fin du cabré et de la chute.' },
  { id: 't3-tout-contre-remonte', type: 'pose', classic: true, langs: ['fr'], pose: { x: -5, z: 28.21, h: Math.PI / 2, v: 6.2 }, maxFrames: 500,
    desc: 'Abord droit du vertical 7 à 6,2 m/s sans appui : refus tout contre, barre emportée ; après le cabré, joystick à fond à gauche jusqu’à 100° de l’axe (dos tourné : refus « détourné ») puis relâché ; les refus repris pendant la volte ne sont pas recomptés ; le cheval s’éloigne, le jury remonte la barre plus de 3 s après le refus, une fois le cheval à plus de 5 m ; jusqu’à 10 images après la remise.' },
  { id: 't3-refus-lent', type: 'pose', classic: true, langs: ['fr'], pose: { x: 16, z: -28.78, h: Math.PI / 2, v: 2.6 }, maxFrames: 300,
    desc: 'Abord droit du vertical 3 au trot lent (2,6 m/s, sous la vitesse minimale de saut) sans appui : refus quand le nez est à moins de 1,5 m, freinage, cabré ; jusqu’à 10 images après le cabré.' },
  { id: 't3-refus-oblique', type: 'pose', classic: true, langs: ['fr'], pose: { x: 19.83 + 12 * Math.cos((66 * Math.PI) / 180), z: 0.22 - 12 * Math.sin((66 * Math.PI) / 180), h: -Math.PI / 2 + (66 * Math.PI) / 180, v: 6.2 }, cross: { x: 19.83, z: 0.22 }, maxFrames: 300,
    desc: 'Abord du vertical 4A à 66° de son axe (hors de l’angle de saut), 6,2 m/s, ligne de marche passant par son centre, sans appui : refus quand l’écart du nez passe sous v²/16 + 0,3 m, freinage, cabré ; jusqu’à 10 images après le cabré.' },
  { id: 't3-refus-5s', type: 'pose', classic: true, langs: ['fr'], pose: { x: 21, z: -28.78, h: Math.PI / 2, v: 1.6 }, maxFrames: 1000,
    desc: 'Abord droit du vertical 3 à 1,6 m/s : refus lent compté ; joystick en arrière jusqu’à l’arrêt (cadence 0) : les refus repris entre-temps, face au même obstacle sans détour, ne sont pas recomptés et repoussent chacun l’échéance de 5 s ; joystick vers l’avant 4 s après le dernier refus : refus non recompté ; retour à l’arrêt ; joystick vers l’avant 5,5 s après le dernier refus : refus compté ; jusqu’à 45 images après.' },
  { id: 't3-glissade', type: 'pose', classic: true, langs: ['fr'], pose: { x: 22, z: -28.78, h: Math.PI / 2, v: 0.4 }, maxFrames: 500,
    desc: 'Abord droit du vertical 3 au pas de fourmi (0,4 m/s : pas de décision de refus sous 0,5 m/s) : les épaules entrent dans l’obstacle, refus sur place (cheval ramené devant la face, cabré), compté une fois ; il repart et recommence (non recompté avant 5 s) ; jusqu’à 10 images après le deuxième cabré.' },
  // Jalon J2 : mêmes abords que la tranche T3, cheval WildMesh du joueur (pas de ?classic) : membres visibles jugés
  // (Obstacles._limbJudged vrai), résultat différé jusqu'au passage des postérieurs, contacts réels des membres avec les
  // barres (PjlHorse._limbContacts → Obstacles.limbContact, canal lc) et pose des membres (canal lb). Le résultat (franchi,
  // faute, barre qui tombe, effleurement) est celui que le jeu web donne avec ses membres visibles : oracle des règles de
  // faute et de contact du portage.
  { id: 'j2-sans-faute', type: 'pose', langs: ['fr'], pose: { x: 8, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'J2, cheval WildMesh : abord droit du vertical 3 à 6,2 m/s, SAUT en bonne zone (règle de t3-sans-faute) ; membres jugés, résultat après les postérieurs ; jusqu’à 8 m après le 3, barres au repos.' },
  { id: 'j2-posterieurs', type: 'pose', langs: ['fr'], pose: { x: 8, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'J2, cheval WildMesh : SAUT en zone « loin » avec une marge prévue sous −0,06 m (règle de t3-posterieurs) : barre touchée en descente.' },
  { id: 'j2-pres-montee', type: 'pose', langs: ['fr'], pose: { x: 8.1, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'J2, cheval WildMesh : SAUT en zone « près » avec une marge prévue sous −0,06 m (règle de t3-pres-montee) : barre touchée en montée (antérieurs).' },
  { id: 'j2-pres-juste', type: 'pose', langs: ['fr'], pose: { x: 8.1, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'J2, cheval WildMesh : SAUT à la première image où le 3 est en zone « près » avec une marge prévue entre −0,06 et +0,04 m : trajectoire jugée franchie ou effleurée, antérieurs au plus près de la barre.' },
  { id: 'j2-oxer-loin', type: 'pose', langs: ['fr'], pose: { x: -19.67, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'J2, cheval WildMesh : abord droit de l’oxer 2, SAUT en zone « loin » barre avant à moins de 5 m (règle de t3-oxer-loin) : barres qui tombent, une seule faute.' },
  { id: 'j2-effleurement', type: 'pose', langs: ['fr'], pose: { x: 8, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'J2, cheval WildMesh : SAUT avec une marge prévue entre −0,06 et +0,04 m (règle de t3-effleurement) : effleurement par la trajectoire ; membres jugés.' },
  { id: 'j2-effleurement-haut', type: 'pose', langs: ['fr'], pose: { x: 8.13, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'J2, cheval WildMesh : SAUT avec une marge prévue entre +0,02 et +0,04 m (règle de t3-effleurement-haut) : effleurement sans chute attendu.' },
  { id: 'j2-faute-limite', type: 'pose', langs: ['fr'], pose: { x: 8.16, z: -28.78, h: Math.PI / 2, v: 6.2 }, maxFrames: 400,
    desc: 'J2, cheval WildMesh : SAUT avec une marge prévue entre −0,08 et −0,06 m en zone « loin » (règle de t3-faute-limite).' },
  { id: 'j2-refus-lent', type: 'pose', langs: ['fr'], pose: { x: 16, z: -28.78, h: Math.PI / 2, v: 2.6 }, maxFrames: 300,
    desc: 'J2, cheval WildMesh : abord du 3 au trot lent sans appui (règle de t3-refus-lent) : refus, freinage, cabré ; jusqu’à 10 images après le cabré.' },
  { id: 'j2-virage', type: 'pose', langs: ['fr'], pose: { x: -19.67, z: -28.78, h: Math.PI / 2, v: 6.23 }, maxFrames: 300,
    desc: 'J2, cheval WildMesh : abord de l’oxer 2 en tournant (joystick à 0,3 vers la droite dès que la barre avant est à moins de 9 m, tenu en l’air) ; SAUT à la première image en bonne zone ; jusqu’à 30 images après la réception.' },
  // Scénarios du déroulé d'épreuve (tranche T4) : enregistrés depuis le lancement de l'activité (présentation, Entrer
  // en piste, annonce, cloche), en français et en anglais, en images « légères » (sans caméra ni canal « ch » ; canal
  // « ep » = entrées de la mission). Personnages classiques. Actions : voir ACTS dans la page.
  { id: 't4-sans-faute', type: 't4', classic: true, maxFrames: 3200, acts: [{ do: 'line', until: 'finished' }, { do: 'card', extra: 5 }],
    desc: 'Parcours complet : du poteau d’attente (16 m avant la ligne de départ) le long de l’abord dessiné puis du tracé, cadence montée au joystick jusqu’à 6,2 m/s, SAUT selon la règle de A.rideLine ; ligne de départ, 10 éléments, arrivée, sortie de piste 2,6 s, bilan.' },
  { id: 't4-depart-lance', type: 't4', classic: true, maxFrames: 400, pose: { s: 4, u: 0, v: 6.2 }, acts: [{ do: 'line', until: { next: 2 } }, { do: 'wait', frames: 15 }],
    desc: 'Départ lancé : à la cloche, cheval posé 4 m au-delà de la ligne de départ, dans son axe, à 6,2 m/s ; le chrono part au début du parcours ; tracé suivi jusqu’au 1 franchi, puis 15 images.' },
  { id: 't4-cloche', type: 't4', classic: true, maxFrames: 1600, acts: [{ do: 'still', until: 'started' }, { do: 'wait', frames: 30 }],
    desc: 'Cloche écoulée : cheval arrêté 16 m avant la ligne de départ ; au bout de 45 s le chrono part de lui-même ; 30 images après.' },
  { id: 't4-erreur-parcours', type: 't4', classic: true, maxFrames: 1200,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '3', rule: 'good' }, { do: 'jump', label: '3', rule: 'good' }, { do: 'jump', label: '1', rule: 'good' }, { do: 'wait', frames: 10 }],
    desc: 'Erreur de parcours : ligne de départ franchie, puis le 3 sauté alors que le 1 est attendu (erreur annoncée), le 3 sauté de nouveau (erreur déjà signalée : rien), puis le 1 (franchi) ; 10 images après.' },
  { id: 't4-deux-refus', type: 't4', classic: true, maxFrames: 1600,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'good' }, { do: 'jump', label: '2', rule: 'good' }, { do: 'jump', label: '3', rule: 'good' }, { do: 'jump', label: '4A', rule: 'good' },
      { do: 'jump', label: '4B', rule: 'none' }, { do: 'jump', label: '4A', rule: 'good' }, { do: 'jump', label: '4B', rule: 'none' }, { do: 'card', extra: 5 }],
    desc: 'Deux refus : départ, 1, 2, 3 et 4A sautés ; refus au 4B (reprise du double au 4A), 4A sauté de nouveau, deuxième refus au 4B : éliminé ; bilan.' },
  { id: 't4-temps-limite', type: 't4', classic: true, maxFrames: 4400, acts: [{ do: 'cross', line: 'start', back: 3, v: 1.5, until: 'started' }, { do: 'still', until: 'eliminated' }, { do: 'card', extra: 5 }],
    desc: 'Temps limite : cheval posé 3 m avant la ligne de départ, dans son axe, au pas (1,5 m/s), ligne franchie, puis arrêté au joystick ; points de temps en direct au-delà de 64 s ; éliminé au-delà de 128 s ; bilan.' },
  { id: 't4-descente', type: 't4', classic: true, maxFrames: 700, acts: [{ do: 'wait', frames: 15 }, { do: 'dismount' }, { do: 'card', extra: 5 }],
    desc: 'Descente avant le départ : après la cloche, cheval arrêté 16 m avant la ligne de départ, ACTION (Descendre) ; éliminé à la fin de la descente ; bilan.' },
  { id: 't4-saute-avant-depart', type: 't4', classic: true, maxFrames: 800,
    acts: [{ do: 'jump', label: '4A', rule: 'good' }, { do: 'cross', line: 'start', back: 6, v: 4.6, until: 'started' }, { do: 'wait', frames: 15 }],
    desc: 'Obstacle sauté avant le départ : après la cloche, le 4A sauté (ignoré, astuce « chrono pas lancé ») ; puis cheval posé 6 m avant la ligne de départ, dans son axe, à 4,6 m/s, ligne franchie ; 15 images après.' },
  { id: 't4-arrivee-barre', type: 't4', classic: true, maxFrames: 1600,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'far', far: 4.2 },
      ...['2', '3', '4A', '4B', '5', '6A', '6B', '7', '8'].map((label) => ({ do: 'jump', label, rule: 'good' })),
      { do: 'cross', line: 'finish', back: 8, ang: -70, v: 3, until: 'finished' }, { do: 'card', extra: 5 }],
    desc: 'Arrivée avec une barre : départ, appel trop loin au 1 (à 4,2 m de la barre : barre tombée), puis les 9 autres éléments sautés (cheval posé devant chacun) ; cheval posé 8 m avant le milieu de la ligne d’arrivée, marchant à 70° de son axe (l’arrivée n’exige pas de cap), à 3 m/s, arrivée, sortie de piste (cadence ramenée à 1,9 m/s), bilan.' },
  { id: 't4-lignes', type: 't4', classic: true, maxFrames: 900,
    acts: [{ do: 'cross', line: 'start', back: 5, ang: 70, v: 4.6, until: { past: 'start', s: 3 } }, { do: 'cross', line: 'start', back: 5, u: 3.95, v: 4.6, until: { past: 'start', s: 3 } },
      { do: 'cross', line: 'start', back: 5, u: 3.65, v: 4.6, until: 'started' }, { do: 'wait', frames: 10 }],
    desc: 'Ligne de départ : franchie au milieu à 70° de son axe (cap au-delà de 60° : chrono pas lancé), puis dans l’axe à 3,95 m du milieu (hors des 3,5 + 0,3 m : pas lancé), puis dans l’axe à 3,65 m du milieu (au-delà du fanion mais dans la marge de 0,3 m : chrono lancé) ; cheval posé 5 m avant chaque passage, à 4,6 m/s ; 10 images après.' },
  // Contrôle adverse de T4 : gardes des écouteurs d'obstacle (courses.js:219-268) qu'aucun scénario n'exerçait, arrivée
  // à 1 point suivie d'un saut pendant la sortie de piste, étape « rejoindre l'entrée de la carrière ».
  { id: 't4-gardes', type: 't4', classic: true, maxFrames: 1400,
    acts: [{ do: 'wait', frames: 5 }, { do: 'jump', label: '1', rule: 'none', ang: 66, back: 12 }, { do: 'cross', line: 'start', back: 5, v: 4.6, until: 'started' },
      { do: 'jump', label: '3', rule: 'none' }, { do: 'jump', label: '1', rule: 'none', rev: true }, { do: 'jump', label: '1', rule: 'good', rev: true },
      { do: 'jump', label: '3', rule: 'good', rev: true }, { do: 'jump', label: '1', rule: 'good' }, { do: 'wait', frames: 10 }],
    desc: 'Gardes des écouteurs d’obstacle : avant le départ, refus au 1 (obstacle attendu, dans son sens ; abord à 66° de son axe, cheval posé à 12 m, au-delà de la ligne de départ et hors de sa largeur) : rien ; ligne de départ franchie ; refus au 3 alors que le 1 est attendu : rien ; refus au 1 abordé par l’arrière : rien ; le 1 sauté à rebours : rien (ni compté, ni erreur de parcours) ; le 3 sauté à rebours : rien ; le 1 sauté dans son sens : compté ; 10 images après.' },
  { id: 't4-un-point', type: 't4', classic: true, maxFrames: 4000,
    acts: [{ do: 'line', until: 'started' }, ...['1', '2', '3', '4A', '4B', '5', '6A', '6B', '7', '8'].map((label) => ({ do: 'jump', label, rule: 'good' })),
      { do: 'place', dx: 0, dz: -20, frames: 1 }, { do: 'still', until: { t: 63.2 } }, { do: 'cross', line: 'finish', back: 4, v: 3, until: 'finished' }, { do: 'jump', label: '8', rule: 'far', far: 3.2, back: 6 }, { do: 'card', extra: 5 }],
    desc: 'Arrivée à 1 point, puis saut pendant la sortie de piste : départ, les 10 éléments sautés (cheval posé devant chacun), cheval posé à l’arrêt au milieu de la carrière (20 m au nord de l’entrée, loin de la ligne d’arrivée) jusqu’à 63,2 s de chrono, cheval posé 4 m avant le milieu de la ligne d’arrivée à 3 m/s : arrivée au-delà du temps accordé de 64 s, de moins d’une seconde (« 1 POINT ») ; pendant la sortie de piste (cadence ramenée vers 1,9 m/s), le 8 sauté de nouveau dans son sens (cheval posé à 6 m à 6,2 m/s, SAUT à 3,2 m de la première barre) : rien ; bilan.' },
  { id: 't4-entree', type: 't4', classic: true, maxFrames: 700, at: { dx: 0, dz: 127 },
    pre: [{ do: 'wait', frames: 3 }, { do: 'place', dx: 0, dz: 64 }, { do: 'place', dx: 0, dz: 46 }, { do: 'place', dx: 0, dz: 30 }, { do: 'mode', to: 'foot', frames: 5 },
      { do: 'place', dx: 0, dz: 4 }, { do: 'mode', to: 'drive' }, { do: 'place', dx: 6, dz: 20 }, { do: 'place', dx: 0, dz: 5 }, { do: 'mode', to: 'ride' }, { do: 'place', dx: 0, dz: 5, frames: 1 }],
    acts: [{ do: 'wait', frames: 5 }],
    desc: 'Rejoindre l’entrée de la carrière : cheval monté posé à 127 m au sud de l’entrée, puis à 64, 46 et 30 m (objectif avec la distance au-delà de 45 m, sans au-dessous) ; à 30 m, pied à terre (« Monte sur ton cheval ») ; cavalier posé à 4 m de l’entrée, à pied : étape non validée ; au volant du camion (A.drive), camion posé à 21 m puis à 5 m de l’entrée (« Sors du camion puis monte à cheval », non validée) ; en selle (A.mount) ; cheval posé à 5 m : étape validée ; présentation, Entrer en piste, annonce, cloche ; 5 images après.' },
  // Second contrôle adverse de T4 : conditions du départ lancé (courses.js:274 : 0 ≤ s < 12 m, |u| < w/2 + 0,3 m,
  // cap à moins de 60° de l'axe) de part et d'autre de chaque limite — cheval posé à l'arrêt à la cloche, donc lu tel
  // quel à l'ouverture du parcours (ligne de départ : w = 7 m, marge latérale 3,8 m).
  ...[
    ['t4-lance-limites', { s: 11.8, u: 3.7, ang: 55, v: 0 }, 'à 11,8 m au-delà de la ligne de départ, 3,7 m à droite de son milieu, cap à 55° de son axe : les trois limites hautes en deçà, chrono lancé à l’ouverture du parcours'],
    ['t4-lance-limites-gauche', { s: 0.2, u: -3.7, ang: -55, v: 0 }, 'à 0,2 m au-delà de la ligne de départ, 3,7 m à gauche de son milieu, cap à 55° de son axe de l’autre côté : chrono lancé'],
    ['t4-lance-loin', { s: 12.2, u: 0, v: 0 }, 'à 12,2 m au-delà de la ligne de départ, dans son axe : au-delà des 12 m, chrono pas lancé'],
    ['t4-lance-large', { s: 4, u: -3.9, v: 0 }, 'à 4 m au-delà de la ligne de départ, 3,9 m à gauche de son milieu (hors des 3,5 + 0,3 m), dans son axe : chrono pas lancé'],
    ['t4-lance-cap', { s: 4, u: 0, ang: 62, v: 0 }, 'à 4 m au-delà de la ligne de départ, sur son milieu, cap à 62° de son axe (cos < 0,5) : chrono pas lancé'],
    ['t4-lance-derriere', { s: -0.2, u: 0, v: 0 }, 'à 0,2 m en deçà de la ligne de départ, dans son axe : chrono pas lancé'],
  ].map(([id, pose, what]) => ({ id, type: 't4', classic: true, maxFrames: 300, pose, acts: [{ do: 'wait', frames: 10 }], desc: `Départ lancé, limites : à la cloche, cheval posé à l’arrêt ${what} ; 10 images après.` })),
  { id: 't4-hors-parcours', type: 't4', classic: true, maxFrames: 1600, ent: [{ do: 'jump', label: '3', rule: 'good', back: 6 }],
    acts: [{ do: 'wait', frames: 5 }, { do: 'jump', label: '2', rule: 'far', far: 4.2 }, { do: 'cross', line: 'finish', back: 4, v: 4.6, until: { past: 'finish', s: 3 } },
      { do: 'cross', line: 'start', back: 5, v: 4.6, until: 'started' }, { do: 'cross', line: 'finish', back: 4, v: 4.6, until: { past: 'finish', s: 3 } },
      { do: 'jump', label: '3', rule: 'far', far: 4.2, rev: true }, { do: 'jump', label: '1', rule: 'far', far: 4.2, rev: true }, { do: 'wait', frames: 10 }],
    desc: 'Hors du parcours : présentation, Entrer en piste ; pendant l’entrée en piste (2,4 s), le 3 sauté (cheval posé à 6 m, 6,2 m/s) : écouteurs du parcours pas encore posés, rien ; annonce, cloche ; avant le départ, le 2 sauté avec un appel à 4,2 m de la barre (faute avant le départ : astuce « chrono pas lancé ») et la ligne d’arrivée franchie dans son sens (rien) ; ligne de départ franchie ; ligne d’arrivée franchie de nouveau, le 1 étant attendu (rien : arrivée seulement après le dernier obstacle) ; le 3 puis le 1 sautés à rebours avec un appel à 4,2 m de la barre (fautes à rebours : rien) ; 10 images après.' },
  { id: 't4-sortie-descente', type: 't4', classic: true, maxFrames: 2400,
    acts: [{ do: 'line', until: 'started' }, ...['1', '2', '3', '4A', '4B', '5', '6A', '6B', '7', '8'].map((label) => ({ do: 'jump', label, rule: 'good' })),
      { do: 'cross', line: 'finish', back: 4, v: 3, until: 'finished' }, { do: 'wait', frames: 10 }, { do: 'mode', to: 'foot', frames: 3 }, { do: 'card', extra: 5 }],
    desc: 'Sortie de piste écourtée : départ, les 10 éléments sautés (cheval posé devant chacun), cheval posé 4 m avant le milieu de la ligne d’arrivée à 3 m/s, arrivée ; 10 images plus tard, pied à terre (A.foot) : la sortie de piste s’arrête là, sans élimination, bilan.' },
  // Tranche T7 (HUD d'épreuve) : mot « Appel parfait » et toast « Barre au 2 » d'une vraie exécution (critère de T7).
  { id: 't7-parfait-barre-2', type: 't4', classic: true, maxFrames: 1000,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'perfect' }, { do: 'jump', label: '2', rule: 'far', far: 4.2 }, { do: 'wait', frames: 40 }],
    desc: 'Appel parfait puis barre au 2 : départ ; le 1 sauté (cheval posé devant, 6,2 m/s, SAUT à la première image en bonne zone avec un écart de longueur sous 3 % : « Appel parfait ») ; le 2 sauté avec un appel trop loin (à 4,2 m de la première barre : barre tombée, toast « Barre au 2 · +4 · … ») ; 40 images après.' },
  // Tranche T11 (bilan, classement simulé, Recommencer, meilleur temps) : bilan d'une manche avec un refus, puis
  // « Quitter l'épreuve » (enregistrement du meilleur temps, fin de la mission) ; deux manches (barre, « Recommencer »,
  // entrée en piste, cloche, manche 2 sans faute, bilan « manche 2 », « Quitter l'épreuve »).
  { id: 't11-refus', type: 't4', classic: true, maxFrames: 2400,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'good' }, { do: 'jump', label: '2', rule: 'good' }, { do: 'jump', label: '3', rule: 'none' },
      ...['3', '4A', '4B', '5', '6A', '6B', '7', '8'].map((label) => ({ do: 'jump', label, rule: 'good' })),
      { do: 'cross', line: 'finish', back: 4, v: 3, until: 'finished' }, { do: 'card', extra: 5 }, { do: 'tap', id: 'cso-done' }, { do: 'wait', frames: 10 }],
    desc: 'Bilan avec un refus, puis Quitter l’épreuve : départ, le 1 et le 2 sautés (cheval posé devant chacun), refus au 3 sans appui, le 3 repris puis les 7 autres éléments sautés, cheval posé 4 m avant le milieu de la ligne d’arrivée à 3 m/s, arrivée, sortie de piste, bilan (« 4 pts : refus au 3 ») ; « Quitter l’épreuve » touché : meilleur temps de l’activité enregistré (chrono + pénalités), fin de la mission ; 10 images après.' },
  { id: 't11-manche-2', type: 't4', classic: true, maxFrames: 3200,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'good' }, { do: 'jump', label: '2', rule: 'far', far: 4.2 },
      ...['3', '4A', '4B', '5', '6A', '6B', '7', '8'].map((label) => ({ do: 'jump', label, rule: 'good' })),
      { do: 'cross', line: 'finish', back: 4, v: 3, until: 'finished' }, { do: 'card', extra: 5 }, { do: 'tap', id: 'cso-retry' },
      { do: 'still', until: { step: 9 } }, { do: 'cross', line: 'start', back: 5, v: 4.6, until: 'started' },
      ...['1', '2', '3', '4A', '4B', '5', '6A', '6B', '7', '8'].map((label) => ({ do: 'jump', label, rule: 'good' })),
      { do: 'cross', line: 'finish', back: 4, v: 3, until: 'finished' }, { do: 'card', extra: 5 }, { do: 'tap', id: 'cso-done' }, { do: 'wait', frames: 10 }],
    desc: 'Recommencer : manche 1 avec une barre au 2 (appel à 4,2 m de la première barre ; autres éléments sautés, cheval posé devant chacun), arrivée, bilan ; « Recommencer » touché : nouvelle manche (barres remises, entrée en piste, cloche) ; cheval arrêté au joystick jusqu’au début du parcours, posé 5 m avant la ligne de départ à 4,6 m/s, ligne franchie, les 10 éléments sautés, arrivée, bilan « manche 2 » ; « Quitter l’épreuve » touché : meilleur temps enregistré (dernière manche), fin de la mission ; 10 images après.' },
  // Contrôle adverse de T11 : bilan dont la mise en page diffère du relevé (fautes sur deux lignes, joueur au-delà du 8e :
  // 9 lignes au tableau, corps plus haut), en partie réelle.
  { id: 't11-trois-barres', type: 't4', classic: true, maxFrames: 2400,
    acts: [{ do: 'line', until: 'started' }, ...['1', '2', '3'].map((label) => ({ do: 'jump', label, rule: 'far', far: 4.2 })),
      ...['4A', '4B', '5', '6A', '6B', '7', '8'].map((label) => ({ do: 'jump', label, rule: 'good' })),
      { do: 'cross', line: 'finish', back: 4, v: 3, until: 'finished' }, { do: 'card', extra: 5 }, { do: 'tap', id: 'cso-done' }, { do: 'wait', frames: 10 }],
    desc: 'Bilan de trois barres : départ, appels trop loin au 1, au 2 et au 3 (à 4,2 m de la première barre : barres tombées), les 7 autres éléments sautés (cheval posé devant chacun), cheval posé 4 m avant le milieu de la ligne d’arrivée à 3 m/s, arrivée (« 12 POINTS »), sortie de piste, bilan (fautes sur deux lignes, joueur au-delà du 8e : 9 lignes au tableau) ; « Quitter l’épreuve » touché : meilleur temps enregistré, fin de la mission ; 10 images après.' },
  // Scénarios de la tranche T6 (caméra de concours) contre le décor (repère : entrée de piste CSO_GATE ; le parcours ne
  // fait jamais toucher la perche) : la sonde bloque la perche, le recul se raccourcit (amorti 10 /s) puis s'allonge
  // (amorti 2,5 /s). Tribunes : boîte « stands » au nord de la carrière ; mât : mât « mast » de la lice nord.
  { id: 't6-tribunes', type: 'pose', langs: ['fr'], pose: { from: 'gate', x: -20, z: -69, h: Math.PI / 2, v: 0 }, maxFrames: 200,
    desc: 'Caméra de concours contre les tribunes : cheval arrêté à l’entrée de piste + (−20 ; −69), 4 m au sud de la lice nord, tourné vers l’est (perche libre), caméra recalée ; joystick à droite et un peu en avant 1,5 s (le cheval tourne vers le sud, la perche passe sur les tribunes et se raccourcit), relâché 1 s, puis à gauche et un peu en avant 1,5 s (la perche se dégage et s’allonge), relâché 1 s.' },
  { id: 't6-mat', type: 'pose', langs: ['fr'], pose: { from: 'gate', x: 12, z: -71.3, h: 0, v: 0 }, maxFrames: 200,
    desc: 'Caméra de concours contre un mât de la lice nord : cheval arrêté à l’entrée de piste + (12 ; −71,3), cap 0 (vers le sud), le mât 1,9 m derrière lui (perche bloquée dès 1,4 m : recul minimal 1,6 m), caméra recalée ; joystick en avant 2,5 s (le cheval s’éloigne, la perche se dégage), relâché 1 s.' },
  // Entrée en piste depuis une caméra du monde ouvert décalée du cap du cheval (cap initial de la caméra de concours).
  { id: 't6-entree', type: 'entry', langs: ['fr'], turn: 0.9, after: 75, maxFrames: 400,
    desc: 'Entrée de la caméra de concours depuis une caméra décalée : Parcours du Pôle lancé, cheval à l’arrêt 16 m avant la ligne de départ, tourné sur place de 0,9 rad (la caméra du monde ouvert reste derrière l’ancien cap) ; présentation, Entrer en piste, 75 images (fondu d’entrée de 1,2 s, cap initial vers le cheval).' },
  // Branches de hauteur que la carrière n'atteint pas (cheval posé hors de la carrière, épreuve en cours ; obstacles à
  // moins de 60 m relevés) : relief sous la caméra plus haut que le cheval de plus de 2,6 m ; obstacle de cross survolé
  // dont le sommet + 1,45 m dépasse la caméra (pied de l'obstacle plus haut que le cheval).
  { id: 't6-relief', type: 'pose', langs: ['fr'], obsNear: true, pose: { from: 'abs', x: 528, z: -240, h: Math.PI, v: 0 }, maxFrames: 60,
    desc: 'Caméra de concours au pied d’un talus : épreuve en cours (après la cloche), cheval posé à l’arrêt en (528 ; −240), cap π, relief 6,6 m derrière lui plus haut de 3,2 m (repéré dans le jeu) ; caméra recalée, 30 images sans entrée.' },
  { id: 't6-survol', type: 'pose', langs: ['fr'], obsNear: true, pose: { from: 'obstacle', label: '4', course: 'xc', s: -1, d: 6.6, v: 0 }, maxFrames: 60,
    desc: 'Caméra de concours au-dessus d’un obstacle de cross plus haut que le cheval : épreuve en cours (après la cloche), cheval posé à l’arrêt 6,6 m devant la haie 4 du cross (côté −n, dos à l’obstacle, pied de la haie plus haut de 1,26 m, repéré dans le jeu) ; caméra recalée, 30 images sans entrée.' },
  // Scénario de la tranche T6 (caméra de concours) : tests/e2e/cso-framing.mjs rejoué au pas fixe (réglages relus dans
  // le test, voir readFraming), cheval WildMesh comme dans le test ; canaux « ch » et « cc », mesures du cadrage (fr)
  // aux instants du test.
  { id: 'cadrage', type: 'framing', langs: ['fr'], at: { dx: 0, dz: 4, h: Math.PI }, maxFrames: 600,
    desc: 'Cadrage de la caméra de concours (tests/e2e/cso-framing.mjs) : cheval monté posé 4 m au sud de l’entrée de piste, cap π ; Parcours du Pôle lancé, 6 images, Entrer en piste, 80 images ; cheval posé 3 m avant la ligne de départ dans son axe, caméra recalée (snap) ; 460 images : pilote des tests le long de la ligne du tracé (point 12 échantillons devant, cadence de concours 6,2 m/s), SAUT dans la bonne zone quand le sommet du saut tombe sur l’obstacle ; mesures du cadrage (part de la hauteur de l’écran occupée par le couple) aux images 40, 120, 200, 280, 360, 440 et à deux instants en l’air.' },
  // Scénarios de la tranche T9 (aides à l'appel) : épreuve légère (canal « ep ») avec le canal « ai » (aides du parcours
  // et bouton SAUT, voir P.installAids) ; cheval WildMesh (captures web de la recette) ; réglages jumpAid / courseLine
  // posés dans la sauvegarde avant le lancement.
  { id: 't9-parcours', type: 't4', aides: true, maxFrames: 3200, acts: [{ do: 'line', until: 'finished' }, { do: 'card', extra: 5 }],
    desc: 'Aides à l’appel sur le parcours complet (réglages par défaut : aide complète, tracé affiché) : du poteau d’attente (16 m avant la ligne de départ) le long de l’abord dessiné puis du tracé, cadence montée au joystick jusqu’à 6,2 m/s, SAUT selon la règle de A.rideLine ; entrée en piste (aide coupée), départ, 10 éléments (zone d’appel, tracé, repère, bouton coloré), arrivée (plus d’obstacle suivant), sortie de piste, bilan.' },
  { id: 't9-appel', type: 't4', aides: true, langs: ['fr'], maxFrames: 1600,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'good', early: 10 }, { do: 'jump', label: '2', rule: 'good', back: 16 }, { do: 'jump', label: '3', rule: 'near' },
      { do: 'jump', label: '4A', rule: 'none' }, { do: 'wait', frames: 20 }],
    desc: 'États du bouton SAUT : départ ; le 1 (cheval posé 11 m devant, 6,2 m/s) avec un appui à 10 m de la barre (bien trop tôt : « Trop tôt » 600 ms) puis SAUT en bonne zone ; le 2 abordé depuis 16 m (trop loin, puis bonne zone) ; le 3 sauté à la première image en zone « près » (« Trop près ») ; refus au 4A sans appui (aide coupée pendant le refus et sous 3,2 m/s) ; 20 images après.' },
  // (personnages classiques, comme les scénarios t4-* : la descente du modèle réaliste déplace le point suivi de
  // quelques 1e-9 m d'un export à l'autre ; aucune capture n'est prise dans cette exécution)
  { id: 't9-retour', type: 't4', classic: true, aides: true, langs: ['fr'], maxFrames: 1200,
    ent: [{ do: 'at', label: '1', d: 9, v: 6.2, frames: 6 }, { do: 'place', dx: 0, dz: 0, frames: 3 }],
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'good' }, { do: 'at', label: '1', d: 1, v: 0, frames: 6 },
      { do: 'at', label: '2', d: 12, v: 6.2, frames: 25, press: [0, 10] }, { do: 'at', label: '2', d: 14, v: 0, frames: 12 }, { do: 'dismount' }, { do: 'card', extra: 5 }],
    desc: 'Branches des aides que le parcours n’exerce pas : pendant l’entrée en piste, cheval posé 9 m devant le 1 à 6,2 m/s (aide à l’appel coupée, game.course.pre) puis ramené à l’entrée ; départ ; le 1 sauté ; cheval posé à l’arrêt 1 m devant le 1 (sur le tracé, avant l’obstacle précédent : points cherchés depuis prevS − 2, début borné par prevS) ; posé 12 m devant le 2 à 6,2 m/s, SAUT deux fois à 10 images d’écart (bien trop tôt : « Trop tôt » relancé, temporisation annulée) ; posé à l’arrêt 14 m devant le 2 (zone affichée), pied à terre (zone coupée à pied, élimination) ; bilan.' },
  { id: 't9-aide-bouton', type: 't4', aides: true, langs: ['fr'], aid: 'button', maxFrames: 1000,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'good' }, { do: 'jump', label: '2', rule: 'good', back: 16 }, { do: 'wait', frames: 10 }],
    desc: 'Aide « bouton seul » (jumpAid button) : départ, le 1 puis le 2 (abordé depuis 16 m) sautés en bonne zone ; bouton coloré, pas de zone au sol ; 10 images après.' },
  { id: 't9-aide-off', type: 't4', aides: true, langs: ['fr'], aid: 'off', maxFrames: 1000,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'good' }, { do: 'jump', label: '2', rule: 'good', back: 16 }, { do: 'wait', frames: 10 }],
    desc: 'Aide coupée (jumpAid off) : départ, le 1 puis le 2 (abordé depuis 16 m) sautés en bonne zone (règle du pilote, sans l’aide) ; bouton « Saut » sans couleur, pas de zone au sol, tracé et repère gardés ; 10 images après.' },
  { id: 't9-sans-trace', type: 't4', aides: true, langs: ['fr'], courseLine: false, maxFrames: 1000,
    acts: [{ do: 'line', until: 'started' }, { do: 'jump', label: '1', rule: 'good' }, { do: 'jump', label: '2', rule: 'good', back: 16 }, { do: 'wait', frames: 10 }],
    desc: 'Tracé au sol masqué (courseLine false) : départ, le 1 puis le 2 (abordé depuis 16 m) sautés en bonne zone ; zone d’appel, repère et bouton gardés ; 10 images après.' },
  // Contrôle adverse de T9 : zone d'appel sans bande verte (takeoffZone rend pass, pas good : place(this.good, null),
  // courseAids.js:155), atteinte dans une partie normale à l'abord lent du 8 (oxer, le plus haut du parcours).
  { id: 't9-ambre', type: 't4', aides: true, langs: ['fr'], maxFrames: 1400,
    acts: [{ do: 'line', until: 'started' }, ...['1', '2', '3', '4A', '4B', '5', '6A', '6B', '7'].map((label) => ({ do: 'jump', label, rule: 'good' })),
      { do: 'at', label: '8', d: 16, v: 4.6, frames: 40 }, { do: 'wait', frames: 3 }],
    desc: 'Zone d’appel ambre seule : départ, les éléments 1 à 7 sautés en bonne zone (cheval posé devant chacun) ; cheval posé 16 m devant le 8 (oxer) à 4,6 m/s (trot de concours : takeoffZone le calcule à 5,5 m/s), joystick vers l’axe, 40 images sans appui (bande ambre sans bande verte), puis 3 images.' },
  // Contrôle adverse de T9 : jumeau de t9-parcours tracé masqué (mêmes gestes jusqu'au 2 franchi) : montages
  // aide-trace / aide-sans-trace pris à la même image, dans la volte entre le 1 et le 2 (tirets en courbe, hors de l'axe
  // de la caméra).
  { id: 't9-courbe', type: 't4', aides: true, langs: ['fr'], courseLine: false, maxFrames: 1000, acts: [{ do: 'line', until: { next: 3 } }],
    desc: 'Tracé au sol masqué (courseLine false), mêmes gestes que t9-parcours jusqu’au 2 franchi : du poteau d’attente le long de l’abord dessiné puis du tracé, cadence montée au joystick jusqu’à 6,2 m/s, SAUT selon la règle de A.rideLine ; départ, le 1, la volte vers le 2, le 2.' },
  // Contrôle adverse de T9 : tests/e2e/cso-shots.mjs rejoué au pas fixe jusqu'aux captures 4-abord-trop-loin et
  // 5-abord-bonne-zone de la recette (réglages relus dans le test, voir readShots ; état forcé par le test entre deux
  // images relevé dans le champ fs, cheval posé dans tp). Rejoué par testCsoAids (canal « ai ») et par les poses
  // aide-4-* / aide-5-* ; pas par testCsoRuns (état de l'épreuve écrit par le test, hors de la logique du jeu).
  { id: 't9-recette', type: 'recette', aides: true, langs: ['fr'], maxFrames: 400,
    desc: 'Recette des captures de l’épreuve (tests/e2e/cso-shots.mjs) : cheval monté posé 4 m au sud de l’entrée de piste, cap π ; Parcours du Pôle lancé, 6 images ; plan ouvert puis refermé, Entrer en piste, 80 images ; puis, pour chaque capture d’abord du 2 (trop loin, bonne zone), l’état forcé par le test (chrono lancé, obstacle attendu 2, chrono à 7,42 s, 2 surligné, cheval posé 16 m devant le 2 dans son axe à 6,6 m/s, caméra recalée) et sa boucle (joystick vers l’axe, cadence 6,2 m/s, une image, arrêt quand la première barre passe sous 7,5 + 0,6 m puis 1,7 + 0,6 m). Temporisations du HUD : voir setup.recette.pause.' },
];

// Réglages du scénario « cadrage » relus dans tests/e2e/cso-framing.mjs (le test fait foi, aucune valeur recopiée).
function readFraming() {
  const t = readFileSync(join(ROOT, 'tests/e2e/cso-framing.mjs'), 'utf8');
  const m = (re, what) => {
    const r = re.exec(t);
    if (!r) throw new Error(`cso-framing.mjs : ${what} introuvable`);
    return r;
  };
  const num = (re, what) => Number(m(re, what)[1]);
  const jt = m(/h\.jumpT > ([\d.]+) && h\.jumpT < ([\d.]+) && out\.filter\(\(o\) => o\.jump\)\.length < (\d+)/, 'mesures en l’air');
  return {
    source: 'tests/e2e/cso-framing.mjs',
    pre: num(/A\.tick\((\d+)\);\s*\n\s*A\.tap\(document\.querySelector\('\.overlay \[data-id="enter"\]'\)\);/, 'images avant Entrer en piste'),
    post: num(/data-id="enter"\]'\)\);\s*\n\s*A\.tick\((\d+)\);/, 'images après Entrer en piste'),
    back: num(/S\.x - Math\.sin\(S\.rot\) \* ([\d.]+)/, 'recul avant la ligne de départ'),
    mag: num(/A\.steer\(t\.x - h\.pos\.x, t\.z - h\.pos\.z, ([\d.]+)\)/, 'amplitude du pilote'),
    win: num(/j < Math\.min\(line\.length, k \+ (\d+)\)/, 'fenêtre de recherche sur la ligne'),
    ahead: num(/line\[Math\.min\(line\.length - 1, k \+ (\d+)\)\]/, 'avance sur la ligne'),
    n: num(/for \(let i = 0; i < (\d+); i\+\+\)/, 'nombre d’images'),
    marks: JSON.parse(m(/const marks = new Set\((\[[\d,\s]+\])\)/, 'instants mesurés')[1]),
    jT0: Number(jt[1]),
    jT1: Number(jt[2]),
    jumps: Number(jt[3]),
    pts: JSON.parse(m(/const pts = (\[\[.*?\]\])\.map/, 'silhouette du couple')[1]),
  };
}
const FRAMING = readFraming();
for (const sc of SCENARIOS) if (sc.type === 'framing') sc.framing = FRAMING;

// Réglages du scénario « t9-recette » relus dans tests/e2e/cso-shots.mjs (le test fait foi, aucune valeur recopiée).
// Temporisations du HUD (hud.js : setTimeout, horloge réelle) : dans la recette, la page n'exécute ses temporisations
// qu'entre deux page.evaluate, c'est-à-dire pendant chaque capture (shot : attente de `wait` ms, rendu, capture d'écran),
// les boucles de A.tick étant bien plus rapides que le temps de jeu. Leur état sur les PNG dépend donc de la durée réelle
// des captures, qui n'est pas reproductible (mesurée sur ce Mac par une copie chronométrée du test : rendu et capture de
// 0,27 à 3,9 s selon la capture ; l'astuce y est éteinte à la capture 5, allumée sur le PNG de la recette). Modèle de
// l'oracle : horloge du HUD = temps de jeu (100 ticks par image, comme toutes les exécutions) + une pause par capture
// (champ hw de l'image capturée) = attente du test (`wait`, relue) + CAPTURE_MS. CAPTURE_MS n'est pas une mesure : c'est
// une valeur retenue dans l'intervalle où l'état du HUD des deux PNG de la recette est obtenu (grand message « CLOCHE »
// éteint et astuce affichée à la capture 4, astuce affichée à la capture 5 ; bornes calculées par l'export, voir
// setup.recette.pause). Sans effet sur le jeu, les aides et le bouton SAUT (temps de jeu seul).
const CAPTURE_MS = 250;
function readShots() {
  const t = readFileSync(join(ROOT, 'tests/e2e/cso-shots.mjs'), 'utf8');
  const m = (re, what) => {
    const r = re.exec(t);
    if (!r) throw new Error(`cso-shots.mjs : ${what} introuvable`);
    return r;
  };
  const num = (re, what) => Number(m(re, what)[1]);
  const loop = m(/for \(const \[name, x\] of (\[\[.*?\]\])\) \{/, 'captures d’abord')[1];
  // Boutons de carte touchés avant la cloche, dans l'ordre (plan, retour, Entrer en piste), sans image entre eux.
  const taps = [...t.slice(0, t.indexOf("await shot('3-")).matchAll(/\[data-id="([^"]+)"\]/g)].map((x) => x[1]);
  if (taps[taps.length - 1] !== 'enter') throw new Error('cso-shots.mjs : Entrer en piste introuvable');
  return {
    source: 'tests/e2e/cso-shots.mjs',
    at: { dx: 0, dz: num(/h\.setPosition\(O\.CSO_GATE\.x, O\.CSO_GATE\.z \+ ([\d.]+), Math\.PI\)/, 'pose devant l’entrée'), h: Math.PI },
    pre: num(/g\.activities\.start\([^\n]*\n\s*A\.tick\((\d+)\);/, 'images avant la présentation'),
    taps,
    post: num(/data-id="enter"\]'\)\); A\.tick\((\d+)\);/, 'images après Entrer en piste'),
    shots: JSON.parse(loop.replace(/'/g, '"')),
    next: num(/st\.next = (\d+);/, 'obstacle attendu forcé'),
    t: num(/st\.t = ([\d.]+);/, 'chrono forcé'),
    hl: num(/g\.obstacles\.highlight\('cso', (\d+)\);/, 'obstacle surligné'),
    idx: num(/const o = list\[(\d+)\];/, 'obstacle abordé'),
    back: num(/h\.setPosition\(o\.x - o\.n\.x \* ([\d.]+), o\.z - o\.n\.z \* [\d.]+, o\.rot\);/, 'recul'),
    v: num(/h\.speed = ([\d.]+);\n\s*g\.cam\.snap\(h\.pos, o\.rot\);\n\s*for \(let i = 0; i < \d+; i\+\+\) \{\n\s*A\.steer\(o\.n\.x/, 'vitesse posée'),
    n: num(/for \(let i = 0; i < (\d+); i\+\+\) \{\n\s*A\.steer\(o\.n\.x, o\.n\.z, [\d.]+\);\n\s*A\.tick\(1\);/, 'images au plus'),
    mag: num(/A\.steer\(o\.n\.x, o\.n\.z, ([\d.]+)\);\n\s*A\.tick\(1\);\n\s*const tg/, 'amplitude du pilote'),
    margin: num(/tg\.geo\.rails\[0\]\.x <= x \+ ([\d.]+)\) break;/, 'marge d’arrêt'),
    wait: num(/const shot = async \(name\) => \{\n\s*await page\.waitForTimeout\((\d+)\);/, 'attente avant capture'),
    captureMs: CAPTURE_MS,
  };
}
const SHOTS_RECETTE = readShots();
// Écart entre deux PNG de même taille (décodés par ffmpeg en RVB 8 bits) : moyenne sur les pixels de l'écart absolu
// moyen des trois canaux, part des pixels dont cet écart dépasse 16, boîte de ces pixels.
function pngDiff(a, b, v) {
  const raw = (p) => execFileSync('ffmpeg', ['-v', 'error', '-i', p, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
  const A = raw(a), B = raw(b);
  if (A.length !== B.length || A.length !== v.width * v.height * 3) throw new Error(`pngDiff : tailles différentes (${a}, ${b})`);
  let sum = 0, over = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let i = 0, n = A.length / 3; i < n; i++) {
    const d = (Math.abs(A[3 * i] - B[3 * i]) + Math.abs(A[3 * i + 1] - B[3 * i + 1]) + Math.abs(A[3 * i + 2] - B[3 * i + 2])) / 3;
    sum += d;
    if (d > 16) {
      over++;
      const x = i % v.width, y = Math.floor(i / v.width);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const n = A.length / 3;
  return { mean: Math.round((sum / n) * 100) / 100, over16: Math.round((over / n) * 10000) / 100, box: over ? [x0, y0, x1, y1] : null };
}
// Intervalle de la durée de capture C (ms) où le modèle de readShots donne l'état du HUD visible sur les PNG de la
// recette aux captures d'abord (4-abord-trop-loin, 5-abord-bonne-zone : grand message éteint, classe big-on retirée,
// astuce affichée). Horloge virtuelle (ticks de 1/3 ms) : un appel de l'image f a lieu à (f + 1) × 100 + pauses des
// images < f ; la capture de l'image k est vue à (k + 1) × 100 + pauses des images ≤ k ; une pause = 3 × (attente + C).
// hud.js : big(…, ms) éteint le message à ms puis retire big-on 400 ms plus tard (hud.js:462-465) ; hint(…, ms) éteint
// l'astuce à ms (hud.js:474).
function recetteBounds(frames, shots, R) {
  const pausesUpTo = (k) => frames.slice(0, k + 1).reduce((n, f) => n + (f.hw ? Math.round(f.hw / Math.round((R.wait + R.captureMs) * 3)) : 0), 0);
  let min = -Infinity, max = Infinity;
  for (const s of shots) {
    let big = null, hint = null;
    for (let f = 0; f <= s.frame; f++)
      for (const c of frames[f].hud) {
        if (c.fn === 'big') big = { f, ms: c.args[2] ?? 2200 };
        if (c.fn === 'hint') hint = { f, ms: c.args[1] ?? 4500 };
        if (c.fn === 'clearHint') hint = null;
      }
    if (!big || !hint) throw new Error(`t9-recette : grand message ou astuce absents avant ${s.name}`);
    // big-on retiré : (k − fb) × 100 + 3 (W + C) ΔP ≥ 3 (ms + 400)
    const dPb = pausesUpTo(s.frame) - pausesUpTo(big.f - 1);
    if (dPb > 0) min = Math.max(min, (3 * (big.ms + 400) - (s.frame - big.f) * 100) / (3 * dPb) - R.wait);
    else if ((s.frame - big.f) * 100 < 3 * (big.ms + 400)) throw new Error(`t9-recette : big-on gardé à ${s.name}`);
    // astuce affichée : (k − fh) × 100 + 3 (W + C) ΔP < 3 ms
    const dPh = pausesUpTo(s.frame) - pausesUpTo(hint.f - 1);
    if (dPh > 0) max = Math.min(max, (3 * hint.ms - (s.frame - hint.f) * 100) / (3 * dPh) - R.wait);
  }
  return { min: Math.ceil(min), max: Math.floor(max) };
}
for (const sc of SCENARIOS) if (sc.type === 'recette') Object.assign(sc, { recette: SHOTS_RECETTE, at: SHOTS_RECETTE.at });

// ---------------------------------------------------------------------------------------------------------------
// Code injecté dans la page : banc d'enregistrement (window.__parite).
function PAGE() {
  const g = window.__game, A = window.__auto;
  const DT = 1 / 30;
  const R6 = (v) => Math.round(v * 1e6) / 1e6;
  const v3 = (v) => [R6(v.x), R6(v.y), R6(v.z)];
  // Hasard et horloges déterministes.
  const seedRandom = (seed) => {
    let a = seed >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  let clock = 0;
  const EPOCH = Date.UTC(2026, 0, 1);
  performance.now = () => clock;
  Date.now = () => EPOCH + clock;
  // Résumé sérialisable d'une valeur (arguments, événements, état) : primitives arrondies au millionième, objets
  // Three.js ignorés, obstacles et chevaux réduits à leur identité.
  const summ = (v, depth = 0) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? R6(v) : null;
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v !== 'object') return undefined;
    if (v.isVector3) return v3(v);
    if (v.isObject3D || v.isMaterial || v.isTexture || v.isBufferGeometry || v instanceof Node) return undefined;
    if (Array.isArray(v)) return depth > 2 ? undefined : v.slice(0, 24).map((x) => summ(x, depth + 1) ?? null);
    if ('num' in v && 'label' in v && 'course' in v) return { course: v.course, num: v.num, label: v.label };
    if (v.pos?.isVector3 && 'heading' in v) return { horse: v.id ?? null };
    if (depth > 1) return undefined;
    const o = {};
    for (const k of Object.keys(v).sort()) {
      if (k.startsWith('_')) continue;
      const x = summ(v[k], depth + 1);
      if (x !== undefined) o[k] = x;
    }
    return o;
  };
  let cur = null;
  // Tranche T4 : fichier du jeu qui a fait l'appel hud.* / audio.* (appelant immédiat, chemin sous src/), pour
  // distinguer les appels de courses.js (épreuve) de ceux du cheval, de la caméra ou des missions.
  const callerSrc = () => {
    const lines = (new Error().stack || '').split('\n');
    // [0] « Error », [1] callerSrc, [2] enveloppe, [3] appelant
    const m = /\/src\/([^?:)\s]+\.js)/.exec(lines[3] || '');
    return m ? m[1] : null;
  };
  const wrap = (obj, names, sink, dedupe) => {
    let depth = 0;
    const last = {};
    for (const n of names) {
      const f = obj[n];
      if (typeof f !== 'function') continue;
      obj[n] = function (...args) {
        if (depth === 0 && cur) {
          const a = args.map((x) => summ(x, 1) ?? null);
          const key = JSON.stringify(a);
          if (!dedupe.includes(n) || last[n] !== key) cur[sink].push({ fn: n, args: a, src: callerSrc() });
          last[n] = key;
        }
        depth++;
        try {
          return f.apply(this, args);
        } finally {
          depth--;
        }
      };
    }
  };
  const P = (window.__parite = {});
  P.install = ({ audioIgnored, hudMethods, hudDedupe }) => {
    const proto = Object.getPrototypeOf(g.audio);
    const audioNames = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && !n.startsWith('_') && typeof proto[n] === 'function' && !audioIgnored.includes(n));
    wrap(g.audio, audioNames, 'audio', []);
    wrap(g.hud, hudMethods, 'hud', hudDedupe);
    const emit = g.bus.emit.bind(g.bus);
    // Scénarios légers (tranche T4) : événements des chevaux des cavaliers du décor non relevés (foulées et fatigue,
    // sans lien avec l'épreuve ; leurs foulées varient d'une exécution à l'autre au-delà de 47 s de parcours, constaté
    // sur t4-sans-faute).
    const otherHorse = (d) => {
      const h = d && d.pos?.isVector3 && 'heading' in d ? d : d?.horse?.pos?.isVector3 ? d.horse : null;
      return !!h && h !== g.player.horse;
    };
    g.bus.emit = (evt, data) => {
      if (cur && !(P.lite && otherHorse(data))) cur.ev.push({ e: evt, d: summ(data, 1) });
      // Canal « ch » (tranche T3) : événements d'obstacle en pleine précision (marge non arrondie).
      if (cur?.ch && evt.startsWith('obstacle:')) (cur.ch.oe ||= []).push({ e: evt, o: idx(data.obstacle), dir: data.dir, m: data.margin === undefined ? undefined : nul(data.margin), c: data.cause ?? undefined });
      // Événements du cheval émis pendant horse.update (le pas porté par csoHorseStep), hors foulées ; ceux émis ensuite
      // par Obstacles.updateHorse (horse:refuse d'une glissade) n'y sont pas.
      if (cur?.ch && inHorse && evt.startsWith('horse:') && evt !== 'horse:step') (cur.ch.he ||= []).push(evt);
      return emit(evt, data);
    };
    P.installHorse();
    P.installCam();
    return audioNames;
  };
  const railState = () => {
    const out = {};
    for (const o of g.obstacles.ofCourse('cso')) o.rails.forEach((r, i) => (out[`${o.label}/${i}`] = [...v3(r.position), ...v3(r.rotation)]));
    return out;
  };
  let rails0 = null;
  const railDelta = () => {
    const now = railState();
    const d = [];
    for (const k of Object.keys(now)) if (JSON.stringify(now[k]) !== JSON.stringify(rails0[k])) d.push({ r: k, t: now[k] });
    rails0 = now;
    return d;
  };
  const tmp = new (g.camera.position.constructor)();
  // Carte de bilan (tranche T11) : kicker, titre, grille .cso-pres [clé, valeur], tableau .cso-rank (lignes : classe me,
  // textes des cellules), boutons [data-id, texte, classe].
  P.bilanDom = (ov) => {
    const q = (s) => ov.querySelector(s);
    const vs = [...ov.querySelectorAll('.cso-pres .v')];
    return {
      kicker: q('.kicker')?.textContent ?? null, title: q('h2')?.textContent ?? null,
      rows: [...ov.querySelectorAll('.cso-pres .k')].map((k, i) => [k.textContent, vs[i]?.textContent ?? null]),
      table: [...ov.querySelectorAll('table.cso-rank tr')].map((tr) => ({ me: tr.classList.contains('me'), td: [...tr.children].map((td) => td.textContent) })),
      buttons: [...ov.querySelectorAll('.card-actions button')].map((b) => [b.dataset.id, b.textContent, b.className]),
    };
  };
  // Mise en page de la carte de bilan (contrôle adverse de T11, poses bilan-*) : boîtes (px CSS du viewport, au dixième)
  // du kicker, du titre, des cases de la grille, du tableau, des lignes et des cellules, corps en haut ; scrollHeight et
  // clientHeight du corps ; classe more de la barre d'actions.
  P.bilanLayout = (ov) => {
    const q = (s) => ov.querySelector(s);
    const r1 = (v) => Math.round(v * 10) / 10;
    const rect = (el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(r1); };
    const body = q('.card-body');
    return {
      body: { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop },
      kicker: rect(q('.kicker')), title: rect(q('h2')),
      keys: [...ov.querySelectorAll('.cso-pres .k')].map(rect), values: [...ov.querySelectorAll('.cso-pres .v')].map(rect),
      table: rect(q('table.cso-rank')),
      rows: [...ov.querySelectorAll('table.cso-rank tr')].map((tr) => ({ rect: rect(tr), me: tr.classList.contains('me'), cells: [...tr.children].map(rect) })),
      more: q('.card-actions').classList.contains('more'),
    };
  };
  const capture = (rec) => {
    const p = g.player, h = p.horse;
    rec.horse = { x: R6(h.pos.x), y: R6(h.pos.y), z: R6(h.pos.z), h: R6(h.heading), v: R6(h.speed), jumpT: R6(h.jumpT), jumpY: R6(h.jumpY), cad: p.csoCadence === undefined ? null : R6(p.csoCadence), mode: p.mode };
    const run = g.missions.active;
    rec.run = run ? { i: run.i, stepT: R6(run.stepT), text: run.text() ?? null, course: summ(run.data.course, 1) ?? null } : null;
    rec.course = g.course ? summ(g.course, 1) : null;
    const ci = g.course?.hud?.();
    rec.board = ci ? { ...summ(ci, 1), shown: !g.hud.csoEl.classList.contains('hidden'), txt: [g.hud.csoT.textContent, g.hud.csoTa.textContent, g.hud.csoPen.textContent, g.hud.csoNext.textContent] } : null;
    // Scénarios « légers » (tranche T4, déroulé d'épreuve) : ni caméra ni canal « ch » (images nombreuses, rejouées par
    // le canal « ep »).
    if (!P.lite) rec.cam = { eye: v3(g.camera.position), target: v3(g.cam.target), dir: v3(g.camera.getWorldDirection(tmp)), fov: R6(g.camera.fov), aspect: R6(g.camera.aspect) };
    rec.rails = railDelta();
    if (!P.lite) rec.sim = { paused: !!g.simPaused, overlay: !!document.querySelector('.overlay') };
    // Tranche T11 : carte de bilan (screens.card de courses.js:414, reconnue à son bouton « cso-retry ») relevée dans le DOM
    // à l'image où elle s'ouvre (nouvel élément .overlay).
    const bov = document.querySelector('.overlay [data-id="cso-retry"]')?.closest('.overlay') || null;
    if (bov !== (P.blEl ?? null)) {
      P.blEl = bov;
      if (bov) rec.bl = P.bilanDom(bov);
    }
    return rec;
  };
  const apply = (inp) => {
    const I = g.input;
    // Scénario t9-recette : boutons de carte touchés avant `ui`, sans image entre eux (plan, retour).
    for (const id of inp.taps || []) {
      const el = document.querySelector(`.overlay [data-id="${id}"]`);
      if (!el) throw new Error(`bouton introuvable : ${id}`);
      A.tap(el);
    }
    if (inp.ui) {
      const el = document.querySelector(`.overlay [data-id="${inp.ui}"]`);
      if (!el) throw new Error(`bouton introuvable : ${inp.ui}`);
      A.tap(el);
    }
    I.setVirtualMove(inp.move[0], inp.move[1]);
    I.keys = new Set(inp.keys);
    I.held = new Set(inp.held);
    if (inp.jump) I.pressed.add('jump');
    for (const n of inp.press || []) I.pressed.add(n); // tranche T4 : action pressée (ex. « action » = descendre)
  };
  const frames = [];
  const step = (inp) => {
    cur = { f: frames.length, in: inp, ev: [], hud: [], audio: [] };
    if (ccPending.length) cur.ccp = ccPending.splice(0); // tranche T6 : appels de la caméra entre deux images (snap)
    apply(inp);
    clock += DT * 1000;
    if (AIDS) AIDS.tick(100); // tranche T9 : temporisation virtuelle de « Trop tôt » (100 ticks de 1/3 ms par image)
    g.update(DT);
    // Ce que fait le rendu de chaque image du jeu (renderer.render → scene.updateMatrixWorld) sans dessiner : l'image
    // suivante lit des matrices monde à jour (pieds du cheval, caméra), comme en jeu.
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    const rec = capture(cur);
    finishCh(rec);
    finishAi(rec);
    if (AIDS && g.course?.aids && !(g.course.aids instanceof AIDS.CA.CourseAids)) throw new Error('aides : classe CourseAids différente de celle du jeu');
    cur = null;
    frames.push(rec);
    if (P.stopAfter !== undefined && frames.length > P.stopAfter) throw new Error('STOP'); // captures de la tranche T9
    return rec;
  };
  const input = (o = {}) => ({ move: o.move || [0, 0], keys: o.keys || [], held: o.held || [], jump: !!o.jump, ui: o.ui || null, ...(o.press?.length ? { press: o.press } : {}), ...(o.taps?.length ? { taps: o.taps } : {}) });

  // ---- Canal « ch » (cheval de concours, tranche T2) : état complet du cheval du joueur en pleine précision ----
  // Relevé autour des appels du jeu : entrées vues par player.update (input.move après input.poll, keyMove, appui SAUT,
  // commandes de concours, verrouillage), entrées du cheval vues par horse.update (pas, figé, puissance, bonus, pente,
  // heure de jeu), état après horse.update (b, seulement s'il diffère de la fin de l'image : correction extérieure au
  // pas du cheval, collisions ou Obstacles.updateHorse), état en fin d'image (s), état à l'entrée de player.update (a,
  // seulement s'il diffère de la fin de l'image précédente), collision (col), aide à l'appel (tm = timing, tg = cible).
  // Les obstacles sont repérés par leur rang dans `obs` (obstacles à moins de 80 / 60 m du centre de la carrière),
  // liste relevée en entier à chaque image où l'un d'eux change (hauteur, présence).
  let ARENA = null, JM = null, GATE = null; // GATE : entrée de piste (CSO_GATE), repère des poses `from: 'gate'` (tranche T6)
  let obsList = [], lastSig = null, lastS = null, inHorse = false, col = false;
  const obsSig = () => JSON.stringify(obsList.map((o) => [o.x, o.z, o.rot, o.w, o.h, o.spread, o.kind, !!o.off]));
  const obsDump = () => obsList.map((o) => ({ label: o.label, course: o.course, num: o.num, kind: o.kind, x: o.x, z: o.z, rot: o.rot, w: o.w, h: o.h, spread: o.spread, front: o.front, back: o.back, solid: !!o.solid, off: !!o.off, bars: o.bars.map((b) => [b.s, b.h]) }));
  const idx = (o) => (o ? obsList.indexOf(o) : null);
  const nul = (v) => (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v)) ? null : v);
  const hstate = () => {
    const p = g.player, h = p.horse;
    return {
      x: h.pos.x, z: h.pos.z, h: h.heading, v: h.speed, yr: nul(h._yawRate), lt: h.lastTurn, jT: h.jumpT, jY: h.jumpY,
      jP: nul(h.jumpPeak), jL: nul(h.jumpLen), jD: nul(h.jumpDur), j0: nul(h._jt0), j1: nul(h._jt1), rT: nul(h._rearT), ra: h.anim.rear,
      bk: h._brake, rf: idx(h._refusing), lj: h._lastJump ? idx(h._lastJump.o) : null, cad: nul(p.csoCadence), ks: nul(p._kbdSteer), ca: !!p._cadAdjust,
    };
  };
  const targetSumm = (t) => (t ? { o: idx(t.o), x0: t.geo.rails[0].x, cosA: t.geo.cosA, zone: t.plan.zone, L0: t.plan.L0, L: t.plan.L, H: t.plan.H, m: nul(t.plan.margin), ideal: nul(t.plan.ideal), dev: nul(t.plan.dev), cause: t.plan.cause ?? null } : null);
  // Tranche T3 : état des obstacles en fin d'image, pleine précision. Pour chaque obstacle de `obs` hors de son état de
  // repos : renversé (kn), remise prévue (rb, heure de jeu), barres en attente (pd : [rang de la barre, sens, côté,
  // profondeur, distance restante]), barres déplacées (r : [rang, position.y, position.z, rotation.x, rotation.z,
  // vibration, chute { t, dir, side, hit, e = bouts [y, vy, t0] ou null, z, vz, roll, ck = premier choc, dn = finie }]).
  const fenceState = () => {
    const out = [];
    obsList.forEach((o, i) => {
      const r = [];
      o.rails.forEach((m, k) => {
        const ud = m.userData, f = ud.fall;
        if (!f && !(ud.rattle > 0) && m.position.y === ud.rest.y && m.position.z === ud.rest.z && m.rotation.x === ud.rest.rx && m.rotation.z === 0) return;
        r.push([k, m.position.y, m.position.z, m.rotation.x, m.rotation.z, ud.rattle || 0, f ? { t: f.t, dir: f.dir, side: f.side, hit: f.hit, e: f.ends ? f.ends.map((e) => [e.y, e.vy, e.t0]) : null, z: nul(f.z), vz: nul(f.vz), roll: nul(f.roll), ck: !!f.clonk, dn: !!f.done } : null]);
      });
      const pd = (o._pending || []).map((p) => [o.bars.indexOf(p.bar), p.dir, p.side, p.hit, p.left]);
      if (o.knocked || o.rebuild || pd.length || r.length) out.push({ i, kn: !!o.knocked, rb: o.rebuild || 0, pd, r });
    });
    return out;
  };
  // Passage en cours (horse._pass) et dernier refus compté (horse._refusal), pleine précision.
  const passState = (h) => {
    const P = h._pass, R = h._refusal;
    return {
      ps: P ? { o: idx(P.o), dir: P.dir, f: P.fault, c: P.cause ?? null, m: nul(P.margin), x: P.exitT ?? null, d: P.done } : null,
      rl: R ? { o: idx(R.o), t: R.t, a: R.away } : null,
    };
  };
  const finishCh = (rec) => {
    const ch = rec.ch;
    if (!ch) return;
    const h = g.player.horse;
    const s = hstate();
    const sj = JSON.stringify(s);
    ch.s = s;
    if (ch.b && JSON.stringify(ch.b) === sj) delete ch.b;
    lastS = sj;
    const sig = obsSig();
    if (sig !== lastSig) {
      ch.obs = obsDump();
      lastSig = sig;
    }
    ch.tm = g.obstacles.timing(h);
    ch.tg = targetSumm(g.obstacles.target(h));
    ch.ob = { ...passState(h), fs: fenceState() };
  };
  const chStart = () => {
    // Tranche T6 (scénarios obsNear, cheval posé hors de la carrière) : aussi les obstacles à moins de 60 m du cheval.
    const hp = g.player.horse.pos;
    obsList = g.obstacles.list.filter((o) => (Math.abs(o.x - ARENA.x) < 80 && Math.abs(o.z - ARENA.z) < 60) || (P.obsNear && Math.hypot(o.x - hp.x, o.z - hp.z) < 60));
    lastSig = obsSig();
    const s = hstate();
    lastS = JSON.stringify(s);
    return { s, obs: obsDump(), ob: { ...passState(g.player.horse), fs: fenceState() } };
  };

  // ---- Canal « cc » (caméra de concours, tranche T6) : appels de FollowCamera._updateComp en pleine précision ----
  // Par appel (un par image en épreuve) : hz = cheval vu par la caméra [pos.x, pos.z, heading, _yawRate (null :
  // indéfini), jumpT, jumpY, groundY] ; dt s'il diffère du pas ; i = instant (snap) ; e0 = camera.position et f0 =
  // [this.fov, camera.fov] avant l'appel quand l'état de concours est (re)créé ; nx = rang dans cc0.obs de
  // game.course.next (null : aucun) ; sonde de la perche (colliders.cameraBlocked) : pn = points sondés, pb = rang du
  // premier point bloqué (−1 : aucun), pq = points [x, y, z] sondés (premier appel de l'exécution et appels bloqués) ;
  // th = [x, z, hauteur] rendus par terrain.getHeight (sol sous la caméra) ; sorties : eye = camera.position, look =
  // arguments de camera.lookAt, fov = camera.fov (appliqué), fs = this.fov (lissé), bk = _comp.back (recul retenu, amorti).
  // obs = obstacles relus [x, z, n.x, n.z, t.x, t.z, w, depth (null : absent), ground, h, off] quand l'un d'eux change.
  // Appels hors image (snap entre deux images) : ccp de l'image suivante, dans l'ordre. État de départ : setup.cc0.
  let inComp = false, ccProbe = [], ccTerrain = [], ccLook = null, ccPending = [], ccObsSig = null, ccFirst = true, ccOn = false;
  const ccObsDump = () => obsList.map((o) => [o.x, o.z, o.n.x, o.n.z, o.t.x, o.t.z, o.w, o.depth ?? null, o.ground, o.h, !!o.off]);
  const ccState = () => {
    const s = g.cam._comp;
    return s ? { cH: s.cH, w: s.w, t: s.t, ax: s.ax, az: s.az, ay: s.ay, back: s.back, from: [s.from.x, s.from.y, s.from.z], fromLook: [s.fromLook.x, s.fromLook.y, s.fromLook.z], aim: s.aim ? [s.aim.x, s.aim.y, s.aim.z] : null } : null;
  };
  const ccStart = () => {
    const cam = g.camera;
    const o = ccObsDump();
    ccObsSig = JSON.stringify(o);
    ccPending = [];
    ccFirst = true;
    ccOn = true;
    return { st: ccState(), eye: [cam.position.x, cam.position.y, cam.position.z], fov: g.cam.fov, camFov: cam.fov, obs: o };
  };
  P.installCam = () => {
    const C = g.cam, cam = g.camera;
    const uc = C._updateComp.bind(C);
    C._updateComp = (dt, h, instant) => {
      if (P.lite || !ccOn) return uc(dt, h, instant);
      const rec = { hz: [h.pos.x, h.pos.z, h.heading, nul(h._yawRate), h.jumpT, h.jumpY, h.groundY] };
      if (dt !== DT) rec.dt = dt;
      if (instant) rec.i = true;
      if (!C._comp || instant) {
        rec.e0 = [cam.position.x, cam.position.y, cam.position.z];
        rec.f0 = [C.fov, cam.fov];
      }
      const o = ccObsDump(), sig = JSON.stringify(o);
      if (sig !== ccObsSig) {
        rec.obs = o;
        ccObsSig = sig;
      }
      const nx = g.course?.next;
      rec.nx = nx ? obsList.indexOf(nx) : null;
      if (rec.nx === -1) throw new Error('caméra : obstacle suivant hors de la liste relevée');
      // Obstacles hors de la liste relevée : aucun ne doit pouvoir être survolé (boîte de 4 m autour de la caméra, à
      // moins de 6,6 m du cheval).
      for (const b of g.obstacles.list) if (!b.off && !obsList.includes(b) && Math.abs(b.x - h.pos.x) < 16 && Math.abs(b.z - h.pos.z) < 16) throw new Error(`caméra : obstacle ${b.label} hors de la liste relevée près du cheval`);
      ccProbe = [];
      ccTerrain = [];
      ccLook = null;
      inComp = true;
      try {
        uc(dt, h, instant);
      } finally {
        inComp = false;
      }
      rec.pn = ccProbe.length;
      rec.pb = ccProbe.findIndex((p) => p[3]);
      if (rec.pb >= 0 && rec.pb !== ccProbe.length - 1) throw new Error('caméra : sonde poursuivie après un point bloqué');
      if (ccFirst || rec.pb >= 0) rec.pq = ccProbe.map((p) => [p[0], p[2], p[1]]);
      ccFirst = false;
      if (ccTerrain.length !== 1 || !ccLook) throw new Error(`caméra : ${ccTerrain.length} lectures du sol, lookAt ${ccLook ? 'appelé' : 'absent'}`);
      rec.th = ccTerrain[0];
      rec.eye = [cam.position.x, cam.position.y, cam.position.z];
      rec.look = ccLook;
      rec.fov = cam.fov;
      rec.fs = C.fov;
      rec.bk = C._comp.back;
      if (cur) {
        if (cur.cc) throw new Error('caméra : deux appels dans la même image');
        cur.cc = rec;
      } else ccPending.push(rec);
    };
    const cb = g.colliders.cameraBlocked.bind(g.colliders);
    g.colliders.cameraBlocked = (x, z, y, pad) => {
      const r = cb(x, z, y, pad);
      if (inComp) ccProbe.push([x, z, y, r]);
      return r;
    };
    const gh = g.terrain.getHeight.bind(g.terrain);
    g.terrain.getHeight = (x, z) => {
      const v = gh(x, z);
      if (inComp) ccTerrain.push([x, z, v]);
      return v;
    };
    const la = cam.lookAt.bind(cam);
    cam.lookAt = (...a) => {
      if (inComp) ccLook = a.length === 1 ? [a[0].x, a[0].y, a[0].z] : [a[0], a[1], a[2]];
      return la(...a);
    };
  };
  P.installHorse = () => {
    const p = g.player;
    const pu = p.update.bind(p);
    p.update = (dt, inp) => {
      if (cur && p.mode === 'ride' && !P.lite) {
        const st = hstate();
        cur.ch = { in: { dt, mx: inp.move.x, my: inp.move.y, key: !!inp.keyMove, jp: inp.wasPressed('jump'), cso: g.course?.controls === 'cso', lk: !!p.locked } };
        if (JSON.stringify(st) !== lastS) cur.ch.a = st;
      }
      return pu(dt, inp);
    };
    const h = p.horse;
    const hu = h.update.bind(h);
    h.update = (dt, camPos) => {
      const ch = cur?.ch;
      if (!ch || g.player.horse !== h) return hu(dt, camPos);
      const fw = h.forward;
      const wd = g.terrain.waterDepth(h.pos.x, h.pos.z), wa = g.terrain.waterDepth(h.pos.x + fw.x * 0.8, h.pos.z + fw.z * 0.8);
      Object.assign(ch.in, { fz: !!h.frozen, pl: !!h.isPlayerHorse, pow: h.jumpPower, clr: h.mods.clearance, t: g.time });
      if (dt !== ch.in.dt) ch.in.hdt = dt;
      if (wd > 0 || wa > 0) Object.assign(ch.in, { wd, wa });
      inHorse = true;
      col = false;
      wrapPjl();
      try {
        return hu(dt, camPos);
      } finally {
        inHorse = false;
        ch.in.sl = h._slope;
        if (col) ch.col = true;
        ch.b = hstate();
      }
    };
    const cr = g.colliders.resolve.bind(g.colliders);
    g.colliders.resolve = (...a) => {
      const r = cr(...a);
      if (inHorse && r) col = true;
      return r;
    };
    // Tranche T3 : entrées de Obstacles.updateHorse (lj = membres visibles jugés, ut = heure de jeu si elle diffère de
    // in.t), de Obstacles.update (ma = mission en cours, odt = pas s'il diffère de in.dt) et contacts des membres
    // signalés par le cheval WildMesh pendant horse.update (lc : obstacle, rang de la barre, profondeur, u, postérieur).
    const O = g.obstacles;
    const uh = O.updateHorse.bind(O);
    O.updateHorse = (horse, px, pz) => {
      const ch = cur?.ch;
      if (ch && horse === g.player.horse) {
        ch.in.lj = O._limbJudged(horse);
        if (g.time !== ch.in.t) ch.in.ut = g.time;
      }
      return uh(horse, px, pz);
    };
    const ou = O.update.bind(O);
    O.update = (dt) => {
      const ch = cur?.ch;
      if (ch) {
        ch.in.ma = !!g.missions.active;
        if (dt !== ch.in.dt) ch.in.odt = dt;
        if (g.time !== ch.in.t) ch.in.ot = g.time;
      }
      return ou(dt);
    };
    const lc = O.limbContact.bind(O);
    O.limbContact = (horse, o, bar, hit) => {
      const ch = cur?.ch;
      if (ch && horse === g.player.horse) (ch.lc ||= []).push({ o: idx(o), bar: o.bars.indexOf(bar), d: hit.depth, u: hit.u, hind: !!hit.hind });
      return lc(horse, o, bar, hit);
    };
    // Jalon J2 (canal « lb ») : pose des membres relevée par le cheval WildMesh (PjlHorse._limbContacts) à chaque image où
    // il garde une pose (obstacle jugé, ou visé à moins de 4 m) : o = obstacle, j = jugé (contacts cherchés), t = heure de
    // jeu, p = [membre AG, AD, PG, PD][os canon, paturon, bout du sabot] = [s, u, y] dans le repère de l'obstacle.
    // Rejoué par unreal/core/tests/test_core.cpp (testFenceRuns : contacts recalculés par strides::limb, comparés à lc).
    // Enveloppe posée à la première image du cheval (le cheval WildMesh est créé après le chargement de son modèle).
    function wrapPjl() {
      const pj = h.pjl;
      if (!pj || pj.__lbWrapped || typeof pj._limbContacts !== 'function') return;
      pj.__lbWrapped = true;
      const lcs = pj._limbContacts.bind(pj);
      pj._limbContacts = () => {
        const ch = cur?.ch;
        const lj = h._lastJump;
        const judging = !!(h.isPlayerHorse && O && lj?.o && !lj.o.off && (h.jumpT >= 0 || (lj.land !== null && g.time - lj.land < 0.8)));
        const r = lcs();
        const pv = pj._limbPrev;
        if (ch && pv) ch.lb = { o: idx(pv.o), j: judging, t: pv.t, p: pv.cur.map((c) => c.p.map((q) => [q.s, q.u, q.y])) };
        return r;
      };
    }
    // Tranche T4 (canal « ep ») : demandes de l'épreuve aux obstacles du parcours « cso » — numéro surligné
    // (Obstacles.highlight, dernier numéro demandé) et barres remises (Obstacles.resetRails, appels comptés).
    const hl = O.highlight.bind(O), rr = O.resetRails.bind(O);
    O.highlight = (courseId, num) => {
      if (courseId === 'cso') P.hl = num;
      return hl(courseId, num);
    };
    O.resetRails = (courseId) => {
      if (courseId === 'cso') P.rr = (P.rr || 0) + 1;
      return rr(courseId);
    };
  };

  // ---- Canal « ep » (tranche T4, déroulé de l'épreuve) : entrées de la mission vues par Run.update (missions.js) ----
  // dt = pas de la mission (nul quand la simulation est en pause) ; gt = game.time ; x, z, h = cheval du joueur
  // (game.player.horse, lu par l'étape de parcours) ; fx, fz = point suivi (player.focus, lu par l'étape « goto ») ;
  // mode = player.mode ; cad = cadence de concours à l'entrée (null si indéfinie), cad1 = après ; i, i1 = étape avant /
  // après ; e0 = nombre d'événements du bus émis dans l'image avant Run.update (ceux de Obstacles.updateHorse).
  // Sorties relevées seulement quand elles changent (correction du contrôle de T4) : hl = dernier numéro surligné
  // (Obstacles.highlight) s'il a changé depuis le dernier relevé, rr = appels de Obstacles.resetRails depuis le dernier
  // relevé, cheer = game.cheerT s'il a été réécrit pendant Run.update ; au volant : tk = player.inTruck, vh = véhicule.
  const hookRun = () => {
    const run = g.missions.active;
    if (!run) return;
    const proto = Object.getPrototypeOf(run);
    if (proto.__pariteRun) return;
    proto.__pariteRun = true;
    const up = proto.update;
    proto.update = function (dt) {
      if (!cur || this !== g.missions.active) return up.call(this, dt);
      const p = g.player, h = p.horse, fp = p.focus?.pos;
      const ep = { e0: cur.ev.length, i: this.i, dt, gt: g.time, x: h.pos.x, z: h.pos.z, h: h.heading, fx: fp ? fp.x : null, fz: fp ? fp.z : null, mode: p.mode, cad: nul(p.csoCadence) };
      if (p.mode === 'drive') Object.assign(ep, { tk: !!p.inTruck, vh: !!p.vehicle });
      const cheer0 = g.cheerT;
      cur.ep = ep;
      try {
        return up.call(this, dt);
      } finally {
        ep.i1 = this.i;
        ep.cad1 = nul(p.csoCadence);
        if (P.hl !== P.hlRec) ep.hl = P.hlRec = P.hl;
        if (P.rr) {
          ep.rr = P.rr;
          P.rr = 0;
        }
        if (g.cheerT !== cheer0) ep.cheer = g.cheerT;
        // Second contrôle de T4 : journal des fautes de l'épreuve (state.log, lu par le bilan) relevé en entier quand il
        // change, entrées [label, kind, cause, causeText] (null si absent). Les écouteurs d'obstacle l'écrivent avant
        // Run.update : relevé à la fin de l'image.
        const lg = this.data?.course?.log;
        const lj = JSON.stringify(lg ? lg.map((e) => [e.label ?? null, e.kind ?? null, e.cause ?? null, e.causeText ?? null]) : []);
        if (lj !== (P.lgRec ?? '[]')) ep.lg = JSON.parse((P.lgRec = lj));
        // Tranche T7 : dernier saut du cheval du joueur (horse._lastJump), lu par le mot d'appel des écouteurs d'obstacle
        // (courses.js:203-211, feedback) : [numéro de l'obstacle sauté s'il est du parcours « cso » (null sinon), qualité
        // de l'appel takeoffQuality(plan) (jumpModel.js:135-140, null si aucune)], relevé quand il change. Les écouteurs
        // le lisent avant Run.update dans la même image (game.js:1491, 1507) : aucun saut ne commence entre les deux.
        const lJ = h._lastJump;
        const ljs = JSON.stringify(lJ ? [lJ.o?.course === 'cso' ? lJ.o.num : null, P.takeoffQuality(lJ.plan) ?? null] : null);
        if (ljs !== (P.ljRec ?? 'null')) ep.lj = JSON.parse((P.ljRec = ljs));
        // Tranche T11 : meilleur temps de l'activité (save.data.bestTimes.cso_train, écrit par l'étape d'enregistrement
        // d'activities.js:120), relevé quand il change (null : absent).
        const bt = JSON.stringify(g.save.data.bestTimes?.cso_train ?? null);
        if (bt !== (P.btRec ?? 'null')) ep.bt = JSON.parse((P.btRec = bt));
      }
    };
  };

  // Entrée en piste commune (mêmes images que « droit », non enregistrées) : présentation, Entrer en piste, cloche.
  const enterRing = () => {
    let k = 0;
    while (!document.querySelector('.overlay [data-id="enter"]')) {
      step(input());
      if (++k > 120) throw new Error('présentation absente');
    }
    step(input({ ui: 'enter' }));
    for (k = 0; ; k++) {
      const r = step(input());
      if (r.audio.some((c) => c.fn === 'bell')) break;
      if (k > 300) throw new Error('cloche absente');
    }
  };
  const F = (label) => g.obstacles.ofCourse('cso').find((o) => o.label === label);
  const sAlong = (o, h) => (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
  const T = (st) => st.k / 30;
  // Tranche T3. Barres d'un obstacle au repos : aucune chute en cours, aucune vibration, aucune barre en attente.
  const idleRails = (o) => !o._pending?.length && o.rails.every((r) => (!r.userData.fall || r.userData.fall.done) && !(r.userData.rattle > 0));
  // Nombre d'événements `name` émis à la dernière image enregistrée.
  const lastEv = (name) => (frames.length ? frames[frames.length - 1].ev.filter((e) => e.e === name).length : 0);
  // Vrai `extra` images après la fin du premier cabré.
  const afterRear = (st, extra) => {
    const h = st.h;
    if (st.rear === undefined && h._rearT > 0) st.rear = st.k;
    if (st.rear === undefined || h._rearT > 0) return false;
    st.after ??= st.k;
    return st.k - st.after >= extra;
  };
  // Abord droit sans direction, SAUT à la première image où l'obstacle visé est `label` et `rule(cible)` est vrai ;
  // fin quand le cheval est retombé, à plus de 8 m au-delà de l'obstacle, barres au repos. Un refus avant l'appui est
  // une erreur de réglage du scénario.
  const jumpDrive = (label, rule) => (st) => {
    const o = F(label), h = st.h;
    const tg = g.obstacles.target(h);
    const press = !st.jumped && h.jumpT < 0 && !h._refusing && !!tg && tg.o === o && rule(tg);
    if (press) st.jumped = true;
    if (!st.jumped && (h._refusing || h._rearT > 0)) throw new Error(`${st.sc.id} : refus avant l’appui`);
    if (st.jumped && h.jumpT < 0 && sAlong(o, h) > 8 && idleRails(o)) return null;
    return { jump: press };
  };
  // Jalon J2 : comme jumpDrive, fin quand les chutes sont terminées et qu'aucune barre n'attend les postérieurs ; la
  // vibration d'une barre tombée n'est pas attendue (le jeu web ne l'éteint pas sur une barre à terre).
  const settled = (o) => !o._pending?.length && o.rails.every((r) => (r.userData.fall ? r.userData.fall.done : !(r.userData.rattle > 0)));
  const jumpDriveJ2 = (label, rule) => (st) => {
    const o = F(label), h = st.h;
    const tg = g.obstacles.target(h);
    const press = !st.jumped && h.jumpT < 0 && !h._refusing && !!tg && tg.o === o && rule(tg);
    if (press) st.jumped = true;
    if (!st.jumped && (h._refusing || h._rearT > 0)) throw new Error(`${st.sc.id} : refus avant l’appui`);
    if (st.jumped && h.jumpT < 0 && sAlong(o, h) > 8 && settled(o)) return null;
    return { jump: press };
  };
  // Règle des entrées de chaque scénario « pose » : évaluée avant l'image k (état de fin de l'image k − 1) ; null = fin.
  const DRIVES = {
    'bonne-zone': (st) => {
      const o = F('2'), h = st.h;
      const press = !st.jumped && h.jumpT < 0 && g.obstacles.timing(h) === 'good';
      if (press) st.jumped = true;
      if (st.jumped && h.jumpT < 0 && sAlong(o, h) > 10) return null;
      return { jump: press };
    },
    'virage-serre': (st) => {
      const t = T(st);
      if (t >= 6.5) return null;
      return { move: t < 1 ? [0, 0] : t < 3.5 ? [-1, 0] : t < 5 ? [1, 0] : t < 6 ? [0.5, 0] : [0, 0] };
    },
    'rampe-clavier': (st) => {
      const t = T(st);
      if (t >= 4.2) return null;
      return { keys: t < 1 ? ['ArrowUp'] : t < 1.6 ? ['ArrowUp', 'ArrowRight'] : t < 2.2 ? ['ArrowUp', 'ArrowLeft'] : t < 2.6 ? ['ArrowUp'] : t < 3.2 ? ['ArrowDown'] : t < 3.6 ? ['KeyD'] : t < 3.8 ? [] : ['KeyA', 'KeyW'] };
    },
    'ctrl-alt': (st) => {
      const t = T(st);
      if (t >= 5) return null;
      return { keys: t < 1 ? ['ArrowUp', 'ControlLeft'] : t < 2 ? ['ArrowDown', 'ControlLeft'] : t < 3 ? ['ArrowUp', 'AltLeft'] : t < 3.8 ? ['ArrowRight', 'ControlLeft'] : t < 4.6 ? ['ArrowLeft', 'AltLeft'] : [] };
    },
    'appui-10m': (st) => {
      const o = F('3'), h = st.h;
      const tg = g.obstacles.target(h);
      let press = false;
      if (!st.early && tg && tg.o === o && tg.geo.rails[0].x <= 10) press = st.early = true;
      else if (st.early && !st.jumped && h.jumpT < 0 && tg && tg.o === o && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) press = st.jumped = true;
      if (st.jumped && h.jumpT < 0 && sAlong(o, h) > 10) return null;
      return { jump: press };
    },
    'appui-3ms': (st) => {
      const o = F('4A'), h = st.h;
      const tg = g.obstacles.target(h);
      const x0 = tg && tg.o === o ? tg.geo.rails[0].x : Infinity;
      if (st.pressed && x0 <= 3) return null;
      const press = !st.pressed && x0 <= 4;
      if (press) st.pressed = true;
      return { jump: press };
    },
    'abord-70': (st) => {
      const h = st.h, f = h.forward, c = st.sc.cross;
      const D = (ARENA.x + c.x - h.pos.x) * f.x + (ARENA.z + c.z - h.pos.z) * f.z;
      if (st.pressed && D <= 4) return null;
      const press = !st.pressed && D <= 7;
      if (press) st.pressed = true;
      return { jump: press };
    },
    refus: (st) => {
      const h = st.h;
      if (st.ref === undefined && h._refusing) st.ref = st.k;
      if (st.rear === undefined && h._rearT > 0) st.rear = st.k;
      if (st.rear !== undefined && !(h._rearT > 0)) {
        if (st.after === undefined) st.after = st.k;
        if (st.k - st.after >= 20) return null;
        return { move: [-1, -1] };
      }
      if (st.rear !== undefined) return { move: [0.8, 1] };
      if (st.ref !== undefined) return { move: [0, 1] };
      return {};
    },
    'virage-en-lair': (st) => {
      const h = st.h;
      const press = !st.jumped && h.jumpT < 0 && g.obstacles.timing(h) === 'good';
      if (press) st.jumped = true;
      if (st.jumped && h.jumpT >= 0) st.air = true;
      if (st.air && h.jumpT < 0 && st.land === undefined) st.land = st.k;
      if (st.land !== undefined && st.k - st.land >= 30) return null;
      return { jump: press, move: [st.air && st.land === undefined ? 1 : 0, 0] };
    },
    survitesse: (st) => (st.k >= 30 ? null : {}),
    'cadence-depart': (st) => (st.k >= 30 ? null : {}),
    'abord-61': (st) => {
      const h = st.h;
      if (st.rear === undefined && h._rearT > 0) st.rear = st.k;
      if (st.rear !== undefined && !(h._rearT > 0)) return null;
      if (st.k >= 150) return null;
      return {};
    },
    'appel-pres': (st) => {
      const o = F('3'), h = st.h;
      const tg = g.obstacles.target(h);
      const press = !st.jumped && h.jumpT < 0 && !h._refusing && tg && tg.o === o && tg.plan.zone === 'near';
      if (press) st.jumped = true;
      if (st.jumped && h.jumpT < 0 && sAlong(o, h) > 10) return null;
      return { jump: press };
    },
    // ---- Tranche T3 ----
    't3-sans-faute': jumpDrive('3', (tg) => tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3),
    't3-oxer-loin': jumpDrive('2', (tg) => tg.plan.zone === 'far' && tg.geo.rails[0].x <= 5),
    't3-pres-montee': jumpDrive('3', (tg) => tg.plan.zone === 'near' && tg.plan.margin < -0.06),
    't3-posterieurs': jumpDrive('3', (tg) => tg.plan.zone === 'far' && tg.plan.margin < -0.06 && tg.geo.rails[0].x < tg.plan.L),
    't3-effleurement': jumpDrive('3', (tg) => tg.plan.zone !== 'refuse' && tg.plan.zone !== 'none' && tg.plan.margin >= -0.06 && tg.plan.margin < 0.04 && tg.geo.rails[0].x > 2),
    't3-faute-limite': jumpDrive('3', (tg) => tg.plan.zone === 'far' && tg.plan.margin < -0.06 && tg.plan.margin >= -0.08 && tg.geo.rails[0].x > 2),
    't3-effleurement-haut': jumpDrive('3', (tg) => tg.plan.zone !== 'refuse' && tg.plan.zone !== 'none' && tg.plan.margin >= 0.02 && tg.plan.margin < 0.04 && tg.geo.rails[0].x > 2),
    // ---- Jalon J2 (cheval WildMesh, membres jugés) ----
    'j2-sans-faute': jumpDriveJ2('3', (tg) => tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3),
    'j2-posterieurs': jumpDriveJ2('3', (tg) => tg.plan.zone === 'far' && tg.plan.margin < -0.06 && tg.geo.rails[0].x < tg.plan.L),
    'j2-pres-montee': jumpDriveJ2('3', (tg) => tg.plan.zone === 'near' && tg.plan.margin < -0.06),
    'j2-pres-juste': jumpDriveJ2('3', (tg) => tg.plan.zone === 'near' && tg.plan.margin >= -0.06 && tg.plan.margin < 0.04),
    'j2-oxer-loin': jumpDriveJ2('2', (tg) => tg.plan.zone === 'far' && tg.geo.rails[0].x <= 5),
    'j2-effleurement': jumpDriveJ2('3', (tg) => tg.plan.zone !== 'refuse' && tg.plan.zone !== 'none' && tg.plan.margin >= -0.06 && tg.plan.margin < 0.04 && tg.geo.rails[0].x > 2),
    'j2-effleurement-haut': jumpDriveJ2('3', (tg) => tg.plan.zone !== 'refuse' && tg.plan.zone !== 'none' && tg.plan.margin >= 0.02 && tg.plan.margin < 0.04 && tg.geo.rails[0].x > 2),
    'j2-faute-limite': jumpDriveJ2('3', (tg) => tg.plan.zone === 'far' && tg.plan.margin < -0.06 && tg.plan.margin >= -0.08 && tg.geo.rails[0].x > 2),
    'j2-refus-lent': (st) => (afterRear(st, 10) && idleRails(F('3')) ? null : st.k >= 280 ? null : {}),
    'j2-virage': (st) => {
      const h = st.h;
      const press = !st.jumped && h.jumpT < 0 && g.obstacles.timing(h) === 'good';
      if (press) st.jumped = true;
      if (st.jumped && h.jumpT >= 0) st.air = true;
      if (st.air && h.jumpT < 0 && st.land === undefined) st.land = st.k;
      if (st.land !== undefined && st.k - st.land >= 30) return null;
      const tg = g.obstacles.target(h);
      if (!st.turn && tg && tg.o === F('2') && tg.geo.rails[0].x < 9) st.turn = true;
      return { jump: press, move: [st.turn && st.land === undefined ? 0.3 : 0, 0] };
    },
    't3-refus-62': (st) => (afterRear(st, 10) && idleRails(F('6A')) ? null : st.k >= 380 ? null : {}),
    't3-refus-lent': (st) => (afterRear(st, 10) && idleRails(F('3')) ? null : st.k >= 280 ? null : {}),
    't3-refus-oblique': (st) => (afterRear(st, 10) || st.k >= 200 ? null : {}),
    't3-tout-contre-remonte': (st) => {
      const o = F('7'), h = st.h;
      if (o.knocked) st.kn = true;
      if (st.kn && st.rest === undefined && !o.knocked && idleRails(o)) st.rest = st.k; // barre remise par le jury
      if (st.rest !== undefined && st.k - st.rest >= 10) return null;
      if (st.k >= 480) return null;
      if (st.rear === undefined && h._rearT > 0) st.rear = st.k;
      if (st.rear === undefined || h._rearT > 0) return {};
      // Après le cabré : à fond à gauche jusqu'à 100° de l'axe de l'obstacle (dos tourné), puis tout droit.
      const fn = h.forward.x * o.n.x + h.forward.z * o.n.z;
      if (!st.turned && fn > Math.cos((100 * Math.PI) / 180)) return { move: [-1, 0] };
      st.turned = true;
      return {};
    },
    // Refus lent compté ; joystick en arrière jusqu'à l'arrêt complet (cadence 0) : les refus repris entre-temps ne sont
    // pas recomptés et repoussent chacun l'échéance de 5 s. Puis joystick vers l'avant 4 s après le dernier refus : refus
    // non recompté (moins de 5 s) ; retour à l'arrêt ; joystick vers l'avant 5,5 s après le dernier refus : refus compté.
    // Fin 45 images (cabré de 1,1 s compris) après ce deuxième refus compté.
    't3-refus-5s': (st) => {
      const h = st.h, p = g.player;
      if (lastEv('horse:refuse')) st.lastRef = st.k - 1;
      st.n = (st.n || 0) + lastEv('obstacle:refusal');
      if (st.n >= 2) {
        st.t2 ??= st.k;
        return st.k - st.t2 > 45 ? null : {};
      }
      if (st.k >= 980) return null;
      if (st.n === 0) return {};
      const busy = h._rearT > 0 || !!h._refusing;
      if (st.pushing) {
        if (!busy) return { move: [0, 1] };
        st.pushing = false;
      }
      if (p.csoCadence > 0 || h.speed > 0 || busy) return { move: [0, -1] };
      if (st.k - st.lastRef >= (st.stage ? 165 : 120)) {
        st.pushing = true;
        st.stage = (st.stage || 0) + 1;
        return { move: [0, 1] };
      }
      return {};
    },
    // Glissades répétées : fin 45 images après le deuxième cabré (ou 450 images).
    // Tranche T6 : cheval arrêté, 40 images (caméra de concours contre le décor, tests/e2e/cso.mjs:337-345).
    't6-tribunes': (st) => (st.k >= 150 ? null : st.k < 45 ? { move: [1, 0.3] } : st.k < 75 ? {} : st.k < 120 ? { move: [-1, 0.3] } : {}),
    't6-mat': (st) => (st.k >= 105 ? null : st.k < 75 ? { move: [0, 1] } : {}),
    't6-relief': (st) => (st.k >= 30 ? null : {}),
    't6-survol': (st) => (st.k >= 30 ? null : {}),
    't3-glissade': (st) => {
      st.n = (st.n || 0) + lastEv('horse:refuse');
      if (st.n >= 2) {
        st.t2 ??= st.k;
        if (st.k - st.t2 > 45) return null;
      }
      return st.k >= 450 ? null : {};
    },
  };
  // Mise en place d'un scénario « pose » (entrée en piste, cheval posé), partagée par runPose et par les captures prises
  // pendant un scénario (posesDuring).
  // Pose du cheval d'un scénario « pose » : repère de la carrière (défaut), de l'entrée de piste (from: 'gate'), absolu
  // (from: 'abs'), ou à d m d'un obstacle le long de son axe de saut, côté s, dos à l'obstacle (from: 'obstacle', label,
  // course : tranche T6, caméra au-dessus de l'obstacle).
  const posePlace = (ps) => {
    if (ps.from === 'abs') return { x: ps.x, z: ps.z, h: ps.h };
    if (ps.from === 'obstacle') {
      const o = g.obstacles.list.find((b) => b.label === ps.label && b.course === ps.course);
      if (!o) throw new Error(`obstacle ${ps.course}/${ps.label} introuvable`);
      return { x: o.x + o.n.x * ps.s * ps.d, z: o.z + o.n.z * ps.s * ps.d, h: Math.atan2(o.n.x * ps.s, o.n.z * ps.s) };
    }
    const B = ps.from === 'gate' ? GATE : ARENA;
    return { x: B.x + ps.x, z: B.z + ps.z, h: ps.h };
  };
  const poseStart = (sc) => {
    const h = g.player.horse, p = g.player;
    enterRing();
    const q = posePlace(sc.pose);
    h.setPosition(q.x, q.z, q.h);
    h.speed = sc.pose.v;
    P.obsNear = !!sc.obsNear;
    p.csoCadence = undefined; // cadence de départ reprise de la vitesse réelle (csoRide.js:65)
    frames.length = 0;
    rails0 = railState();
    // État initial des barres (rails0 est ensuite remplacé à chaque image par railDelta : avant T3, setup.rails des
    // scénarios « pose » donnait par erreur l'état final).
    const railsInit = rails0;
    const ch0 = chStart();
    // Tranche T6 : le snap de la caméra est relevé (ccp de la première image) et rejoué, au lieu d'être fondu dans cc0.
    const cc0 = ccStart();
    g.cam.snap(h.pos, h.heading);
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    return { railsInit, ch0, cc0, st: { k: 0, h, sc } };
  };
  // Une image du scénario ; faux quand la règle des entrées l'arrête.
  const poseStep = (st) => {
    const o = DRIVES[st.sc.id](st);
    if (!o) return false;
    step(input(o));
    st.k++;
    return true;
  };
  P.runPose = (sc) => {
    const h = g.player.horse;
    const { railsInit, ch0, cc0, st } = poseStart(sc);
    while (poseStep(st)) {
      if (frames.length > sc.maxFrames) {
        if (sc.lenient) break; // --lenient : mise au point d'un scénario (images enregistrées malgré tout)
        throw new Error(`scénario ${sc.id} trop long`);
      }
    }
    const q = posePlace(sc.pose);
    return { pose: { x: h.pos.x, z: h.pos.z }, horse: { x: R6(q.x), z: R6(q.z), h: R6(q.h), v: R6(sc.pose.v) }, rails: railsInit, ch0, cc0, frames };
  };

  // ---- Scénario « cadrage » (tranche T6, caméra de concours) : tests/e2e/cso-framing.mjs au pas fixe de 1/30 s ----
  // Réglages relus dans le test par le script (sc.framing, voir readFraming) : images avant « Entrer en piste » (pre)
  // et jusqu'à la pose (post, appui compris), recul avant la ligne de départ (back), amplitude du pilote (mag), fenêtre
  // et avance sur la ligne du tracé (win, ahead), nombre d'images (n), instants mesurés (marks), sauts mesurés
  // (jT0 < jumpT < jT1, au plus `jumps` mesures en l'air), silhouette du couple (pts). Le cheval part de l'entrée de piste
  // + 4 m (setup, sc.at) comme dans le test ; la direction vient du pilote des tests (A.steer de tests/e2e/autopilot.js :
  // cadence de concours posée, joystick x), l'appui SAUT de la règle du test.
  const framingMeasure = (pts) => {
    // cso-framing.mjs:31-39 : points de la silhouette projetés par la caméra du jeu (0 = haut de l'écran, 1 = bas).
    const h = g.player.horse, V = g.camera.position.constructor;
    const f = { x: Math.sin(h.heading), z: Math.cos(h.heading) };
    const y0 = h.groundY + (h.jumpY || 0);
    const ys = pts.map(([a, y]) => (1 - new V(h.pos.x + f.x * a, y0 + y, h.pos.z + f.z * a).project(g.camera).y) / 2);
    const top = Math.max(0, Math.min(...ys)), bottom = Math.min(1, Math.max(...ys));
    return { part: bottom - top, top, bottom, jump: h.jumpT >= 0, ys, asp: g.camera.aspect, pose: [h.pos.x, h.pos.z, h.heading, h.groundY, h.jumpY, h.jumpT] };
  };
  const framingStep = (st) => {
    const F = st.sc.framing, h = st.h, line = st.line;
    if (st.i >= F.n) return false;
    let best = st.k, bd = 1e9;
    for (let j = st.k; j < Math.min(line.length, st.k + F.win); j++) {
      const d = Math.hypot(line[j].x - h.pos.x, line[j].z - h.pos.z);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    st.k = best;
    const t = line[Math.min(line.length - 1, st.k + F.ahead)];
    A.steer(t.x - h.pos.x, t.z - h.pos.z, F.mag);
    const move = [g.input.move.x, g.input.move.y];
    const tg = g.obstacles.target(h);
    const jump = !!(h.jumpT < 0 && tg && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3);
    const rec = step(input({ move, jump }));
    if (F.marks.includes(st.i) || (h.jumpT > F.jT0 && h.jumpT < F.jT1 && st.jumps < F.jumps)) {
      rec.fr = framingMeasure(F.pts);
      if (rec.fr.jump) st.jumps++;
    }
    st.i++;
    return true;
  };
  const framingStart = async (sc) => {
    const F = sc.framing;
    const O = await import('/src/gameplay/obstacles.js');
    const h = g.player.horse;
    for (let k = 0; k < F.pre; k++) step(input());
    if (!document.querySelector('.overlay [data-id="enter"]')) throw new Error('cadrage : présentation absente');
    step(input({ ui: 'enter' }));
    for (let k = 1; k < F.post; k++) step(input());
    const S = O.CSO_START;
    h.setPosition(S.x - Math.sin(S.rot) * F.back, S.z - Math.cos(S.rot) * F.back, S.rot);
    frames.length = 0;
    rails0 = railState();
    const railsInit = rails0;
    const ch0 = chStart();
    // Le snap de la caméra est relevé (ccp de la première image : pas, entrées, caméra précédente) au lieu d'être fondu
    // dans l'état de départ cc0 : le rejeu le refait.
    const cc0 = ccStart();
    g.cam.snap(h.pos, S.rot);
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    const start = { x: h.pos.x, z: h.pos.z, h: h.heading, course: !!g.course?.camera, step: g.missions.active?.i ?? null };
    return { railsInit, ch0, cc0, start, st: { i: 0, k: 0, h, sc, line: O.CSO_LINE, jumps: 0 }, step: framingStep };
  };
  P.runFraming = async (sc) => {
    const d = await framingStart(sc);
    while (framingStep(d.st)) if (frames.length > sc.maxFrames) throw new Error(`scénario ${sc.id} trop long`);
    return { rails: d.railsInit, ch0: d.ch0, cc0: d.cc0, start: d.start, frames };
  };

  // ---- Scénarios de la tranche T4 (déroulé d'épreuve) ----
  // Enregistrés depuis le lancement de l'activité comme « droit » (présentation, Entrer en piste, annonce, cloche), puis
  // une suite d'actions évaluée avant chaque image. Les déplacements posés (téléportations, ce que fait
  // A.jumpObstacle de tests/e2e/autopilot.js) sont relevés dans le champ tp de l'image : le rejeu C++ réinjecte la
  // trajectoire et les événements d'obstacles, il ne simule pas le cheval.
  const wrapPi = (d) => (((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const course = () => g.missions.active?.data.course;
  const cardShown = () => !!document.querySelector('.overlay [data-id="cso-retry"]');
  const poseHorse = (st, x, z, hd, v) => {
    const h = st.h;
    h.setPosition(x, z, hd);
    h.speed = v;
    g.player.csoCadence = undefined; // cadence reprise de la vitesse posée (csoRide.js:65)
    g.cam.snap(h.pos, h.heading);
    st.tp = { x: h.pos.x, z: h.pos.z, h: h.heading, v };
  };
  // Conditions d'arrêt des actions (état de l'épreuve, courses.js).
  const cond = (c, st) => {
    const s = course();
    if (!c) return false;
    if (c === 'started') return !!s?.started;
    if (c === 'finished') return !!s?.finished;
    if (c === 'eliminated') return !!s?.eliminated;
    if (c === 'card') return cardShown();
    if (c.next !== undefined) return (s?.next ?? 0) >= c.next;
    if (c.frames !== undefined) return st.a.k >= c.frames;
    if (c.t !== undefined) return (s?.t ?? 0) >= c.t; // chrono de l'épreuve atteint
    if (c.step !== undefined) return (g.missions.active?.i ?? -1) >= c.step; // étape de la mission atteinte
    // Ligne dépassée de `s` m (abscisse le long de son axe), sans condition de largeur ni de cap.
    if (c.past !== undefined) {
      const Ln = c.past === 'finish' ? st.O.CSO_FINISH : st.O.CSO_START, h = st.h;
      return (h.pos.x - Ln.x) * Math.sin(Ln.rot) + (h.pos.z - Ln.z) * Math.cos(Ln.rot) > c.s;
    }
    throw new Error(`condition inconnue ${JSON.stringify(c)}`);
  };
  // Direction vers un cap (joystick x, règle de A.steer en commandes de concours).
  const steerTo = (h, wx, wz) => Math.max(-1, Math.min(1, -wrapPi(Math.atan2(wx, wz) - h.heading) * 2.2));
  const ACTS = {
    // Galop le long du tracé (abord dessiné depuis l'entrée puis tracé chronométré, comme tests/e2e/cso.mjs) : poursuite
    // d'un point 12 échantillons devant (règle de A.rideLine), joystick x pour diriger, joystick y vers l'avant tant
    // que la cadence est sous 6,2 m/s ; SAUT quand l'aide affiche la bonne zone et que le sommet tombe sur l'obstacle
    // (règle de A.rideLine), ou à `farAt[label]` m de la première barre (appel trop loin, un seul appui).
    line: (a, st) => {
      const h = st.h, L = st.line;
      if (cond(a.until, st)) return null;
      if (a.j === undefined) {
        // Point le plus proche au départ de l'action, cherché sur l'abord et les 60 premiers mètres du tracé (le cheval
        // n'est pas forcément à l'entrée ; la fin du tracé repasse près de l'abord).
        let bd = 1e9;
        for (let j = 0; j < Math.min(L.length, st.leadLen + 120); j++) {
          const d = Math.hypot(L[j].x - h.pos.x, L[j].z - h.pos.z);
          if (d < bd) { bd = d; a.j = j; }
        }
      }
      let best = a.j, bd = 1e9;
      for (let j = a.j; j < Math.min(L.length, a.j + 60); j++) {
        const d = Math.hypot(L[j].x - h.pos.x, L[j].z - h.pos.z);
        if (d < bd) { bd = d; best = j; }
      }
      a.j = best;
      const tgt = L[Math.min(L.length - 1, a.j + 12)];
      const mx = steerTo(h, tgt.x - h.pos.x, tgt.z - h.pos.z);
      const my = (g.player.csoCadence ?? 0) < 6.2 ? 1 : 0;
      const tg = g.obstacles.target(h);
      let jump = false;
      if (h.jumpT < 0 && tg) {
        const far = a.farAt?.[tg.o.label];
        a.once ||= {};
        if (far !== undefined) {
          if (!a.once[tg.o.label] && tg.geo.rails[0].x <= far) jump = a.once[tg.o.label] = true;
        } else jump = tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3;
      }
      return { move: [mx, my], jump };
    },
    // Obstacle sauté comme A.jumpObstacle : cheval posé dans l'axe (11 m avant, ou 3,4 m après l'élément précédent d'un
    // double), à 6,2 m/s ; joystick vers l'axe de l'obstacle ; SAUT selon `rule` : 'good' (bonne zone, sommet sur
    // l'obstacle), 'far' (à `far` m de la première barre), 'perfect' (bonne zone et écart de longueur sous 3 % : « Appel
    // parfait » de takeoffQuality, tranche T7), 'none' (aucun appui : refus). Contrôle de T4 : `rev` = abord
    // par l'arrière (sens inverse du saut, 11 m après l'obstacle) ; `ang` = abord à `ang` degrés de l'axe (ligne de marche
    // passant par le centre de l'obstacle, cap tenu) ; `back` = distance du point de pose au centre.
    jump: (a, st) => {
      const h = st.h, o = F(a.label);
      const alt = !!(a.rev || a.ang), sg = a.rev ? -1 : 1;
      const hd = o.rot + (a.rev ? Math.PI : 0) + ((a.ang || 0) * Math.PI) / 180;
      if (!a.placed) {
        if (h.jumpT >= 0 || h._rearT > 0 || h._refusing) return {};
        const prev = g.obstacles.ofCourse('cso').find((q) => q.num === o.num - 1);
        const gap = prev ? (o.x - prev.x) * o.n.x + (o.z - prev.z) * o.n.z : 99;
        const back = a.back ?? (!alt && prev && gap > 0 && gap < 12 && Math.abs((o.x - prev.x) * o.n.z - (o.z - prev.z) * o.n.x) < 1 ? gap - 3.4 : 11);
        if (alt) poseHorse(st, o.x - Math.sin(hd) * back, o.z - Math.cos(hd) * back, hd, a.v ?? 6.2);
        else poseHorse(st, o.x - o.n.x * back, o.z - o.n.z * back, o.rot, a.v ?? 6.2);
        a.placed = true;
      }
      const s2 = sAlong(o, h);
      if (a.rule === 'none') {
        if (h._refusing === o || h._rearT > 0) a.ref = true;
        if (a.ref && !(h._rearT > 0) && !h._refusing) {
          a.after = (a.after || 0) + 1;
          if (a.after > (a.extra ?? 10)) return null;
        }
      } else if (a.jumped && h.jumpT < 0 && sg * s2 > 2 && (!h._pass || h._pass.o !== o || h._pass.done)) return null;
      if (a.k > 300) throw new Error(`${st.sc.id} : saut du ${a.label} sans fin`);
      const tg = g.obstacles.target(h);
      let jump = false;
      // Tranche T9 : `early` = un appui SAUT quand la première barre de l'obstacle visé passe sous `early` m (bien trop
      // tôt : « Trop tôt » sur le bouton) ; règle 'near' = SAUT à la première image où l'obstacle est en zone « près ».
      if (a.early !== undefined && !a.earlyDone && h.jumpT < 0 && tg && tg.o === o && tg.geo.rails[0].x <= a.early) jump = a.earlyDone = true;
      else if (a.rule !== 'none' && !a.jumped && h.jumpT < 0 && tg && tg.o === o) {
        const go = a.rule === 'far' ? tg.geo.rails[0].x <= (a.far ?? 4.2)
          : a.rule === 'perfect' ? tg.plan.zone === 'good' && Math.abs(tg.plan.dev || 0) < 0.03
            : a.rule === 'near' ? tg.plan.zone === 'near'
              : tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3;
        if (go) jump = a.jumped = true;
      }
      return { move: [alt ? steerTo(h, Math.sin(hd), Math.cos(hd)) : steerTo(h, o.n.x, o.n.z), 0], jump };
    },
    // Tranche T9 : cheval posé `d` m devant l'obstacle `label` dans son axe (côté abord), à `v` m/s, joystick vers l'axe,
    // pendant `frames` images ; SAUT aux images de la liste `press` (rang de l'image dans l'action).
    at: (a, st) => {
      const h = st.h, o = F(a.label);
      if (!a.placed) {
        poseHorse(st, o.x - o.n.x * a.d, o.z - o.n.z * a.d, o.rot, a.v ?? 0);
        a.placed = true;
      }
      if (a.k >= (a.frames ?? 3)) return null;
      return { move: [steerTo(h, o.n.x, o.n.z), 0], jump: (a.press || []).includes(a.k) };
    },
    // Arrêt : joystick en arrière jusqu'à la cadence nulle et au cheval arrêté, puis rien, jusqu'à `until`.
    still: (a, st) => {
      if (cond(a.until, st)) return null;
      const h = st.h;
      return { move: [0, (g.player.csoCadence ?? 0) > 0 || h.speed > 0 ? -1 : 0] };
    },
    wait: (a, st) => (a.k >= a.frames ? null : {}),
    // Descente : ACTION pressée une fois (interaction « Descendre », à l'arrêt), puis rien jusqu'à la fin de la descente.
    dismount: (a, st) => {
      if (g.player.mode !== 'ride') return null;
      if (a.k > 300) throw new Error(`${st.sc.id} : descente sans fin`);
      if (!a.pressed) {
        a.pressed = true;
        return { press: ['action'] };
      }
      return {};
    },
    // Ligne de départ ou d'arrivée : cheval posé `back` m avant le point de la ligne décalé de `u` m (à droite, repère
    // de courses.js), marchant à `ang` degrés de l'axe de la ligne, à `v` m/s, puis droit devant jusqu'à `until`.
    cross: (a, st) => {
      const h = st.h, Ln = a.line === 'finish' ? st.O.CSO_FINISH : st.O.CSO_START;
      const nx = Math.sin(Ln.rot), nz = Math.cos(Ln.rot), hd = Ln.rot + ((a.ang || 0) * Math.PI) / 180;
      const cx = Ln.x + nz * (a.u || 0), cz = Ln.z - nx * (a.u || 0);
      if (!a.placed) {
        poseHorse(st, cx - Math.sin(hd) * a.back, cz - Math.cos(hd) * a.back, hd, a.v ?? 6.2);
        a.placed = true;
      }
      if (cond(a.until, st)) return null;
      if (a.k > 300) throw new Error(`${st.sc.id} : ligne ${a.line} jamais franchie`);
      return { move: [steerTo(h, Math.sin(hd), Math.cos(hd)), 0] };
    },
    // Étape « rejoindre l'entrée de la carrière » (contrôle de T4) : ce que le joueur déplace — cheval monté, cavalier à
    // pied, camion — posé à (dx, dz) m de l'entrée de piste (CSO_GATE), à l'arrêt, puis `frames` images.
    place: (a, st) => {
      const p = g.player, GA = st.O.CSO_GATE, x = GA.x + a.dx, z = GA.z + a.dz;
      if (!a.placed) {
        const hd = Math.atan2(GA.x - x, GA.z - z); // tourné vers l'entrée
        if (p.mode === 'ride') poseHorse(st, x, z, hd, 0);
        else if (p.mode === 'drive') p.vehicle.setPosition(x, z, hd);
        else p.human.setPosition(x, z);
        a.placed = true;
      }
      return a.k >= (a.frames ?? 3) ? null : {};
    },
    // Changement de mode par les gestes de tests/e2e/autopilot.js : 'foot' (A.foot : arrêt et descente), 'drive'
    // (A.drive : à pied près du camion, puis au volant), 'ride' (A.mount : sortie du camion, à pied près du cheval, en
    // selle) ; puis `frames` images.
    mode: (a, st) => {
      if (!a.done) {
        if (a.to === 'foot') A.foot();
        else if (a.to === 'drive') A.drive();
        else A.mount();
        a.done = true;
        if (g.player.mode !== a.to) throw new Error(`${st.sc.id} : mode ${g.player.mode} au lieu de ${a.to}`);
      }
      return a.k >= (a.frames ?? 3) ? null : {};
    },
    // Tranche T11 : bouton de carte touché avant l'image (in.ui : cso-retry, cso-done…), une image.
    tap: (a, st) => {
      if (a.k >= 1) return null;
      if (!document.querySelector(`.overlay [data-id="${a.id}"]`)) throw new Error(`${st.sc.id} : bouton ${a.id} absent`);
      return { ui: a.id };
    },
    // Attente du bilan (carte « Recommencer »), puis `extra` images.
    card: (a, st) => {
      if (cardShown()) a.seen = (a.seen ?? 0) + 1;
      if (a.seen > (a.extra ?? 5)) return null;
      if (a.k > 600) throw new Error(`${st.sc.id} : bilan absent`);
      return {};
    },
  };
  P.runT4 = async (sc) => {
    const h = g.player.horse;
    const O = await import('/src/gameplay/obstacles.js');
    const { CSO_TRACE } = await import('/src/gameplay/csoCourse.js');
    const lead = CSO_TRACE.leadIn.map((p) => ({ x: ARENA.x + p.x, z: ARENA.z + p.z }));
    const st = { k: 0, h, sc, O, line: lead.slice(0, -1).concat(O.CSO_LINE), leadLen: lead.length - 1, tp: null };
    // Suite d'actions : chacune évaluée avant chaque image jusqu'à ce qu'elle rende null, puis la suivante.
    const runActs = (list) => {
      const acts = list.map((a) => ({ ...a, k: 0 }));
      let ai = 0;
      for (;;) {
        let inp = null;
        while (ai < acts.length) {
          st.a = acts[ai];
          inp = ACTS[st.a.do](st.a, st);
          if (inp) break;
          ai++;
        }
        if (!inp) break;
        st.a.k++;
        const tp = st.tp;
        st.tp = null;
        const r = step(input(inp));
        if (tp) r.tp = tp;
        st.k++;
        if (frames.length > sc.maxFrames) {
          if (sc.lenient) break; // --lenient : mise au point d'un scénario
          throw new Error(`scénario ${sc.id} trop long (action ${ai} ${st.a.do})`);
        }
      }
    };
    P.lite = true;
    try {
      // Contrôle de T4 : actions de l'étape « rejoindre l'entrée de la carrière » (setup.pre), avant la présentation.
      if (sc.pre) runActs(sc.pre);
      // Présentation, « Entrer en piste », annonce, cloche (images enregistrées).
      let k = 0;
      while (!document.querySelector('.overlay [data-id="enter"]')) {
        step(input());
        if (++k > 120) throw new Error('présentation absente');
      }
      step(input({ ui: 'enter' }));
      // Second contrôle de T4 : actions de l'étape « Entrée en piste » (setup.ent), achevées avant la cloche.
      if (sc.ent) {
        const i0 = g.missions.active?.i;
        runActs(sc.ent);
        if (g.missions.active?.i !== i0) throw new Error(`${sc.id} : actions de l’entrée en piste au-delà de l’étape`);
      }
      for (k = 0; ; k++) {
        const r = step(input());
        if (r.audio.some((c) => c.fn === 'bell')) break;
        if (k > 300) throw new Error('cloche absente');
      }
      // Pose à la cloche (avant l'image où l'étape de parcours démarre) : `pose` = { s, u } dans le repère de la ligne
      // de départ (s le long de son axe, u à droite), cap de la ligne tourné de `ang` degrés (contrôle de T4), vitesse v.
      if (sc.pose) {
        const S = O.CSO_START, nx = Math.sin(S.rot), nz = Math.cos(S.rot);
        poseHorse(st, S.x + nx * sc.pose.s + nz * (sc.pose.u || 0), S.z + nz * sc.pose.s - nx * (sc.pose.u || 0), S.rot + ((sc.pose.ang || 0) * Math.PI) / 180, sc.pose.v);
      }
      runActs(sc.acts);
    } finally {
      P.lite = false;
    }
    return frames;
  };

  // ---- Scénario t9-recette (contrôle adverse de T9) : tests/e2e/cso-shots.mjs au pas fixe ----
  // Gestes du test (réglages relus, sc.recette) : `pre` images ; boutons touchés (plan, retour) puis Entrer en piste
  // avant l'image suivante ; `post` images en tout ; pour chaque capture d'abord, l'état écrit par le test entre deux
  // images (relevé dans le champ fs de l'image suivante, cheval posé dans tp) puis sa boucle : A.steer vers l'axe de
  // l'obstacle (cadence et joystick, tests/e2e/autopilot.js), une image, arrêt quand la première barre de l'obstacle visé
  // passe sous x + marge. Captures du test : champ hw de l'image capturée (pause de l'horloge virtuelle du HUD, voir
  // readShots) ; shots = images capturées.
  P.runRecette = async (sc) => {
    const R = sc.recette, h = g.player.horse;
    const pauseTicks = Math.round((R.wait + R.captureMs) * 3);
    const pause = (rec, n) => {
      rec.hw = (rec.hw || 0) + n * pauseTicks;
      if (AIDS) AIDS.tick(n * pauseTicks);
    };
    const shots = [];
    P.lite = true;
    try {
      for (let k = 0; k < R.pre; k++) step(input());
      pause(frames[frames.length - 1], 2); // captures 1-presentation et 2-plan (le plan, touché entre les deux, l'est ici avec l'image suivante)
      step(input({ taps: R.taps.slice(0, -1), ui: R.taps[R.taps.length - 1] }));
      for (let k = 1; k < R.post; k++) step(input());
      pause(frames[frames.length - 1], 1); // capture 3-cloche
      for (const [name, x] of R.shots) {
        const s = course(), o = g.obstacles.ofCourse('cso')[R.idx];
        s.started = true;
        s.next = R.next;
        s.t = R.t;
        g.obstacles.highlight('cso', R.hl);
        h.setPosition(o.x - o.n.x * R.back, o.z - o.n.z * R.back, o.rot);
        h.speed = R.v;
        g.cam.snap(h.pos, o.rot);
        const fs = { started: true, next: R.next, t: R.t, hl: R.hl, o: R.idx, snap: true };
        const tp = { x: h.pos.x, z: h.pos.z, h: h.heading, v: R.v };
        let rec = null;
        for (let i = 0; i < R.n; i++) {
          A.steer(o.n.x, o.n.z, R.mag);
          rec = step(input({ move: [g.input.move.x, g.input.move.y] }));
          if (i === 0) Object.assign(rec, { fs, tp });
          const tg = g.obstacles.target(h);
          if (tg && tg.o === o && tg.geo.rails[0].x <= x + R.margin) break;
        }
        if (frames.length > sc.maxFrames) throw new Error(`scénario ${sc.id} trop long`);
        shots.push({ name, frame: rec.f, x });
        pause(rec, 1); // capture `name`
      }
    } finally {
      P.lite = false;
    }
    return { frames, shots };
  };

  // Oracle cso_goto.json (contrôle de T4) : étape « rejoindre l'entrée de la carrière » de l'activité lancée
  // (g.missions.active.steps[0], fabriquée par courses.js:496 avec makeSteps de missions.js), évaluée telle quelle — text()
  // et update() — sur une grille de points suivis autour de l'entrée et de modes du joueur. Le joueur lu par l'étape
  // (game.player) est remplacé le temps de chaque appel par un relevé { focus, mode, vehicle, inTruck } puis rétabli.
  P.gotoGrid = (cases) => {
    const run = g.missions.active;
    const s = run?.steps[0];
    if (!s || s.kind !== 'goto' || run.i !== 0) throw new Error('étape goto absente');
    const GA = { x: s.target.x, z: s.target.z }, truck = { truck: true }, car = { car: true };
    const real = g.player;
    const out = [];
    try {
      for (const c of cases) {
        const fx = GA.x + c.dx, fz = GA.z + c.dz;
        const vehicle = c.mode === 'drive' ? (c.car ? car : truck) : null;
        g.player = { focus: { pos: { x: fx, z: fz } }, mode: c.mode, vehicle, inTruck: c.mode === 'drive' && vehicle === truck };
        out.push({ fx, fz, mode: c.mode, ...(c.mode === 'drive' ? { tk: !c.car, vh: true } : {}), text: s.text(run), done: !!s.update(run, DT) });
      }
    } finally {
      g.player = real;
    }
    return { gate: GA, r: s.radius, mode: s.mode, cases: out };
  };

  // Grille de visée (oracle cso_target.json) : cheval posé devant chaque obstacle du parcours (deux sens, angles,
  // décalages latéraux, distances du point de passage aux épaules, vitesses) ; target() et timing() du jeu.
  P.targetGrid = () => {
    const h = g.player.horse, O = g.obstacles;
    enterRing();
    const ch0 = chStart();
    const cases = [];
    const rec = (ref, x, z, hd, v, extra = {}) => {
      h.setPosition(x, z, hd);
      h.speed = v;
      if (extra.jumpT !== undefined) h.jumpT = extra.jumpT;
      if (extra.refusing) h._refusing = extra.refusing;
      const t = O.target(h);
      cases.push({ ref, x, z, h: hd, v, jT: h.jumpT, rf: idx(h._refusing), tm: O.timing(h), tg: targetSumm(t) });
      h._refusing = null;
    };
    const REFD = 0.4; // ne sert qu'à placer les épaules du cheval sur la grille ; l'oracle relève la pose exacte.
    const list = O.ofCourse('cso');
    for (const o of list) {
      for (const dir of [1, -1])
        for (const a of [0, 35, -55, 61, 75])
          for (const u0 of [0, 1.6, -2.4])
            for (const d of [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 13, 14])
              for (const v of a === 0 && u0 === 0 ? [3.1, 4.6, 6.2, 7.6] : [6.2, 7.6]) {
                // Point de passage : axe de l'obstacle décalé de u0 ; marche à a degrés de l'axe de saut, sens dir.
                const ar = (a * Math.PI) / 180;
                const nx = o.n.x * dir, nz = o.n.z * dir;
                const fx = nx * Math.cos(ar) + o.t.x * Math.sin(ar), fz = nz * Math.cos(ar) + o.t.z * Math.sin(ar);
                const cx = o.x + o.t.x * u0, cz = o.z + o.t.z * u0;
                const hd = Math.atan2(fx, fz);
                rec([idx(o), dir, a, u0, d], cx - fx * (d + REFD), cz - fz * (d + REFD), hd, v);
              }
      const hd = Math.atan2(o.n.x, o.n.z);
      rec([idx(o), 1, 0, 0, 3, 'en l’air'], o.x - o.n.x * 3.4, o.z - o.n.z * 3.4, hd, 6.2, { jumpT: 0.5 });
      rec([idx(o), 1, 0, 0, 3, 'refus'], o.x - o.n.x * 3.4, o.z - o.n.z * 3.4, hd, 6.2, { refusing: o });
    }
    // Pose du cheval : épaules à d du point de passage (axe décalé de u0), marche à a degrés de l'axe de saut, sens dir.
    const poseAt = (o, dir, a, u0, d) => {
      const ar = (a * Math.PI) / 180;
      const nx = o.n.x * dir, nz = o.n.z * dir;
      const fx = nx * Math.cos(ar) + o.t.x * Math.sin(ar), fz = nz * Math.cos(ar) + o.t.z * Math.sin(ar);
      const cx = o.x + o.t.x * u0, cz = o.z + o.t.z * u0;
      return [cx - fx * (d + REFD), cz - fz * (d + REFD), Math.atan2(fx, fz)];
    };
    // Contrôle de T2 : décalages latéraux de part et d'autre de la tolérance « milieu des barres dans la largeur ± 0,35 m »
    // (demi-largeur 1,9 m), ajoutés après la grille d'origine (inchangée).
    for (const o of list)
      for (const dir of [1, -1])
        for (const a of [0, 35])
          for (const u0 of [2.1, -2.2])
            for (const d of [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 13, 14])
              for (const v of [6.2, 7.6]) rec([idx(o), dir, a, u0, d], ...poseAt(o, dir, a, u0, d), v);
    // Appui SAUT (Horse.startJump appelé seul, cheval du joueur, commandes de concours) : valeur rendue, événements du
    // bus, état du saut et du refus juste après. L'état de forme du cheval (cond.onJump) est remis après chaque appui
    // pour que la puissance reste celle du jeu ; la puissance et le bonus de franchissement sont relevés à chaque cas.
    const press = [];
    const cond = h.cond;
    const cond0 = cond ? { energy: cond.energy, jumpBoost: cond.jumpBoost } : null;
    const pressAt = (ref, x, z, hd, v, extra = {}) => {
      h.setPosition(x, z, hd);
      h.speed = v;
      if (extra.jumpT !== undefined) h.jumpT = extra.jumpT;
      if (extra.refusing) h._refusing = extra.refusing;
      const pow = h.jumpPower, clr = h.mods.clearance, t = g.time;
      cur = { ev: [], hud: [], audio: [] };
      const ok = h.startJump();
      const ev = cur.ev.map((e) => e.e);
      cur = null;
      press.push({ ref, x, z, h: hd, v, pow, clr, t, jT0: extra.jumpT ?? -1, rf0: idx(extra.refusing ?? null), ok, ev, jT: h.jumpT, jP: ok ? h.jumpPeak : null, jL: ok ? h.jumpLen : null, jD: ok ? h.jumpDur : null, bk: h._brake, rf: idx(h._refusing), lj: h._lastJump ? idx(h._lastJump.o) : null });
      h.setPosition(x, z, hd);
      if (cond0) Object.assign(cond, cond0);
    };
    for (const o of list) {
      for (const dir of [1, -1])
        for (const a of [0, 35])
          for (const d of [-1.2, -0.6, -0.3, 0, 0.3, 0.6, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 14])
            for (const v of [3.0, 4.6, 6.2, 7.6]) pressAt([idx(o), dir, a, 0, d], ...poseAt(o, dir, a, 0, d), v);
      pressAt([idx(o), 1, 0, 0, 3, 'en l’air'], ...poseAt(o, 1, 0, 0, 3), 6.2, { jumpT: 0.5 });
      pressAt([idx(o), 1, 0, 0, 3, 'refus'], ...poseAt(o, 1, 0, 0, 3), 6.2, { refusing: o });
    }
    // Refus décidé (Obstacles.refuse appelé seul) : freinage et obstacle refusé, des deux côtés de l'obstacle, de face
    // et en biais, de presque arrêté à 7,6 m/s.
    const refuse = [];
    for (const o of list)
      for (const a of [0, 40, 61, 80])
        for (const d of [-1, -0.3, 0.3, 1, 2, 4])
          for (const v of [0.6, 3.1, 6.2, 7.6]) {
            const [x, z, hd] = poseAt(o, 1, a, 0, d);
            h.setPosition(x, z, hd);
            h.speed = v;
            O.refuse(h, o);
            refuse.push({ ref: [idx(o), 1, a, 0, d], x, z, h: hd, v, o: idx(o), bk: h._brake, rf: idx(h._refusing) });
            h.setPosition(x, z, hd);
          }
    return { ch0, power: h.jumpPower, clearance: h.mods.clearance, cso: g.course?.controls === 'cso', cases, press, refuse };
  };

  // Mise en place commune : boucle de rendu arrêtée, fiches et dialogues fermés, hasard à graine, temps de jeu fixés,
  // cheval monté posé en (x, z, cap) à l'arrêt, caméra recalée, activité cso_train lancée.
  // Valeurs initiales du cheval WildMesh (constructeur de PjlHorse, pjlHorse.js:215-219) : affectations littérales
  // « this.<champ> = <valeur JSON>; » relevées dans le source de la classe du jeu ; erreur si l'une manque.
  const pjlInitial = (pjl) => {
    const src = pjl.constructor.toString();
    const out = {};
    for (const k of ['stride', 'roll', 'landT', 'wasJump']) {
      const m = new RegExp(`this\\.${k}\\s*=\\s*([^;\\n]+);`).exec(src);
      if (!m) throw new Error(`PjlHorse : valeur initiale de ${k} introuvable dans le constructeur`);
      out[k] = JSON.parse(m[1].trim());
    }
    return out;
  };
  // ---- Canal « ai » (aides à l'appel, tranche T9), scénarios marqués `aides` seulement ----
  // Appels de CourseAids.update (courseAids.js:104-167) relevés en pleine précision : entrées (in : dt, rang n de
  // l'obstacle suivant dans la liste du parcours ou null, prevS, showLine, showZone, cheval présent, x, z, vitesse,
  // jumpPower, mods.clearance, mode « ride », game.time), hauteurs du sol lues par l'appel (gq : [x, z, y] de
  // terrain.getHeight, dans l'ordre), état des maillages après l'appel (out) ; bouton SAUT (b) : valeur lue par hud.update
  // (jt = g.course?.jumpTiming?.() || 'none', relevée dans hud.update), obstacles.timing du cheval à ce moment (tm), mode
  // de concours (c : game.course non nul, pre : entrée en piste), réglage jumpAid (aid), cible (to : rang, tx : première
  // barre), puis état du DOM après l'image (st = hud._jt, cl = classes far / good / near / early, sg = signe, lb =
  // libellé). Temporisation de « Trop tôt » (hud.js:438, setTimeout de 600 ms) sur une horloge virtuelle : ticks de 1/3
  // ms, 100 par image, échéances déclenchées avant l'image suivante (règle de export-hud-style.mjs) ; les autres
  // temporisations du jeu restent celles du navigateur.
  let AIDS = null;
  const aidObs = () => g.obstacles.ofCourse('cso');
  const aidObsDump = () => aidObs().map((o) => ({ label: o.label, num: o.num, kind: o.kind, x: o.x, z: o.z, rot: o.rot, h: o.h, w: o.w, spread: o.spread, ground: o.ground, lineS: o.lineS ?? null, n: [o.n.x, o.n.z], bars: o.bars.map((b) => [b.s, b.h]), off: !!o.off }));
  P.installAids = async (sc) => {
    const CA = await import('/src/gameplay/courseAids.js');
    const H = g.hud;
    const stg = g.save.data.settings;
    if (sc.aid !== undefined) stg.jumpAid = sc.aid;
    if (sc.courseLine !== undefined) stg.courseLine = sc.courseLine;
    const VT = { now: 0, seq: 0, list: new Map() };
    const st0 = window.setTimeout, ct0 = window.clearTimeout;
    window.setTimeout = function (fn, ms, ...a) {
      const lines = (new Error().stack || '').split('\n');
      const stack = lines.slice(1, 5).join('\n');
      // Captures (--shots=aides) : toutes les temporisations de hud.js sur l'horloge virtuelle (état du HUD = rejeu du jeu
      // Unreal, règle de export-hud-style.mjs) ; exécutions de l'oracle : celle de « Trop tôt » seulement.
      if ((/jumpEarly/.test(stack) && /\/src\/ui\/hud\.js/.test(stack)) || (P.virtualHud && /\/src\/ui\/hud\.js/.test(lines[2] || ''))) {
        const id = ++VT.seq;
        VT.list.set(id, { due: VT.now + Math.round(Math.max(0, Number(ms) || 0) * 3), seq: id, fn, a });
        AIDS.virtual++;
        return -id;
      }
      return st0.call(window, fn, ms, ...a);
    };
    window.clearTimeout = function (id) {
      if (typeof id === 'number' && id < 0) VT.list.delete(-id);
      else ct0.call(window, id);
    };
    const tick = (ticks) => {
      const target = VT.now + ticks;
      for (;;) {
        let best = null;
        for (const t of VT.list.values()) if (t.due <= target && (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq))) best = t;
        if (!best) break;
        VT.list.delete(best.seq);
        VT.now = Math.max(VT.now, best.due);
        best.fn(...best.a);
      }
      VT.now = target;
    };
    const up0 = CA.CourseAids.prototype.update;
    CA.CourseAids.prototype.update = function (dt, o) {
      const h = g.player.horse, list = aidObs();
      const n = o.next ? list.indexOf(o.next) : null;
      if (n === -1) throw new Error('aides : obstacle suivant hors du parcours');
      const inp = { dt, n, ps: o.prevS ?? 0, sl: o.showLine ?? true, sz: o.showZone ?? true, hh: !!h, x: h ? h.pos.x : null, z: h ? h.pos.z : null, v: h ? h.speed : null, pw: h ? h.jumpPower : null, cl: h ? h.mods.clearance : null, md: g.player.mode === 'ride', t: g.time };
      const ter = g.terrain, own = Object.prototype.hasOwnProperty.call(ter, 'getHeight'), gh0 = ter.getHeight;
      const gq = [];
      ter.getHeight = function (x, z) {
        const y = gh0.call(this, x, z);
        gq.push([x, z, y]);
        return y;
      };
      let r;
      try {
        r = up0.call(this, dt, o);
      } finally {
        if (own) ter.getHeight = gh0;
        else delete ter.getHeight;
      }
      const m = (x) => [x.visible, x.position.x, x.position.y, x.position.z, x.rotation.y, x.scale.x, x.scale.z];
      const dr = (x) => (x ? [x.mesh.visible, x.geo.drawRange.start / 6, Number.isFinite(x.geo.drawRange.count) ? x.geo.drawRange.count / 6 : null] : null);
      const out = {
        ln: dr(this.line), af: dr(this.after), mk: [this.mark.visible, this.mark.position.x, this.mark.position.y, this.mark.position.z, this.mark.rotation.y],
        ok: m(this.ok), gd: m(this.good), zt: this._zoneT, zf: this._zoneFor ? list.indexOf(this._zoneFor) : null,
        zo: this._zone ? { p: this._zone.pass, g: this._zone.good } : null,
      };
      if (cur) {
        const ai = (cur.ai ||= {});
        if (ai.c) throw new Error('aides : deux appels de CourseAids.update dans une image');
        ai.c = { in: inp, gq, out };
      }
      return r;
    };
    const hu0 = H.update;
    H.update = function (dt) {
      if (cur) {
        const h = g.player.horse;
        const tg = h ? g.obstacles.target(h) : null;
        // (cad / ca : cadence de concours et réglage au joystick lus par la même hud.update, crans du HUD des captures)
        (cur.ai ||= {}).b = { jt: g.course?.jumpTiming?.() || 'none', tm: h ? g.obstacles.timing(h) : 'none', c: !!g.course, pre: !!g.course?.pre, aid: stg.jumpAid || 'full', line: stg.courseLine !== false, to: tg ? aidObs().indexOf(tg.o) : null, tx: tg ? tg.geo.rails[0].x : null, cad: g.player.csoCadence ?? null, ca: !!g.player._cadAdjust };
      }
      return hu0.call(this, dt);
    };
    AIDS = { CA, tick, virtual: 0, sig: null };
  };
  P.aidsVirtual = () => (AIDS ? AIDS.virtual : null);
  // Captures de la tranche T9 (--shots=aides) : la partie s'arrête après l'image k (P.stopAfter) ; vue de la caméra du
  // jeu à cette image, HUD affiché (animations et transitions coupées : état d'arrivée), état du HUD relevé dans le DOM
  // (mêmes parties que export-hud-style.mjs, bouton SAUT compris) et canal « ai » de l'image (comparé à l'oracle).
  P.aideView = (k, hw = 0) => {
    const f = frames[k];
    if (!f) throw new Error(`capture : image ${k} absente`);
    // t9-recette : pause de la capture du test (ticks de l'horloge virtuelle, hw de l'image dans l'oracle) avant le relevé.
    if (hw && AIDS) AIDS.tick(hw);
    const H = g.hud, h = g.player.horse, cam = g.camera;
    if (!document.getElementById('aide-css')) {
      const st = document.createElement('style');
      st.id = 'aide-css';
      st.textContent = '.hud, .hud * { animation: none !important; transition: none !important; }';
      document.head.appendChild(st);
    }
    g.sky.update(g.hour(), g.player.focus.pos, 0);
    g.sky.follow(cam);
    g.world.update(0, cam, g.sky);
    g.scene.updateMatrixWorld();
    g.renderer.render(g.scene, cam);
    const dir = cam.getWorldDirection(tmp).clone();
    const state = {
      to: [...H.toastsEl.children].map((c) => [c.textContent, [...c.classList].filter((x) => x !== 'toast').join(' ')]),
      hi: [H.hintEl.classList.contains('off'), H.hintEl.innerHTML, H.hintEl.classList.contains('inline')],
      bg: [H.bigEl.classList.contains('hidden'), H.bigEl.querySelector('.t').textContent, H.bigEl.querySelector('.s').textContent, H.el.classList.contains('big-on')],
      fb: [H.jumpFbEl.textContent, H.jumpFbEl.className],
      cad: [H.csoCad.querySelectorAll('i.on').length, H.csoCad.classList.contains('show')],
      bd: [H.csoEl.classList.contains('hidden'), H.csoEl.classList.contains('over'), H.csoEl.classList.contains('faults')],
      cl: [H.el.classList.contains('cso-on'), H.el.classList.contains('cso-ctl'), H.el.classList.contains('cso-sober')],
      ob: H.objEl.classList.contains('off'),
      board: [H.csoT.textContent, H.csoTa.textContent, H.csoPen.textContent, H.csoNext.textContent],
      jump: { st: H._jt ?? null, cl: ['far', 'good', 'near', 'early'].filter((x) => H.btnJump.classList.contains(x)), sg: H.jumpSign.textContent, lb: H.jumpLabel.textContent, hide: H.btnJump.classList.contains('hide') },
    };
    return {
      f: f.f, ai: JSON.stringify(f.ai), state,
      eye: [cam.position.x, cam.position.y, cam.position.z], target: [cam.position.x + dir.x * 10, cam.position.y + dir.y * 10, cam.position.z + dir.z * 10], fovV: cam.fov, aspect: cam.aspect,
      horse: { x: h.pos.x, z: h.pos.z, h: h.heading, jumpY: h.jumpY, jumpT: h.jumpT },
      sunDir: v3(g.sky.sunDir), hour: R6(g.hour()), day: Math.floor(g.save.data.gameTime / 86400),
      canvas: [g.renderer.domElement.width, g.renderer.domElement.height], virtual: AIDS ? AIDS.virtual : null,
    };
  };
  // Captures de la tranche T10 (--shots=entree) : gestes du test après l'image k (pauses des captures sur l'horloge
  // virtuelle du HUD, boutons de carte touchés), puis vue de aideView et carte ouverte relevée dans le DOM.
  P.entreeView = (k, steps = []) => {
    for (const s of steps) {
      if (s.tick && AIDS) AIDS.tick(s.tick);
      if (s.tap) {
        const el = document.querySelector(`.overlay [data-id="${s.tap}"]`);
        if (!el) throw new Error(`bouton introuvable : ${s.tap}`);
        A.tap(el);
      }
    }
    const r = P.aideView(k, 0);
    const ov = document.querySelector('.overlay .card');
    const tx = (sel) => ov?.querySelector(sel)?.textContent ?? null;
    r.card = ov ? {
      screen: ov.querySelector('[data-id="plan-back"]') ? 'plan' : ov.querySelector('[data-id="enter"]') ? 'presentation' : 'autre',
      kicker: tx('.kicker'), title: tx('h2'),
      rows: [...ov.querySelectorAll('.cso-pres .k')].map((kel) => [kel.textContent, kel.nextElementSibling?.textContent ?? null]),
      jury: tx('.cso-jury'), rules: tx('.cso-rules'), legend: tx('.plan-legend'),
      svg: ov.querySelector('svg.course-plan') ? { viewBox: ov.querySelector('svg.course-plan').getAttribute('viewBox'), texts: [...ov.querySelectorAll('svg.course-plan text')].map((t) => t.textContent), counts: Object.fromEntries(['rect', 'line', 'polyline', 'path', 'circle', 'text'].map((n) => [n, ov.querySelectorAll(`svg.course-plan ${n}`).length])) } : null,
      buttons: [...ov.querySelectorAll('.card-actions [data-id]')].map((b) => [b.dataset.id, b.textContent, b.className]),
    } : null;
    const d = g.hud.dialogActive ? g.hud.dialogEl : null;
    r.dialog = d ? { who: d.querySelector('.who span')?.textContent ?? null, av: d.querySelector('.av')?.textContent ?? null, next: d.querySelector('.next')?.textContent ?? null, line: d.querySelector('.line')?.textContent ?? null } : null;
    return r;
  };
  P.render = P.render || (() => g.renderer.render(g.scene, g.camera));
  // Tranche T9 (--aids) : takeoffZone (courseAids.js:25-34) appelée telle quelle sur une grille (obstacles du parcours aux
  // hauteurs hors épreuve puis csoHeights(base) posées par Obstacles.setHeights × vitesses × puissances × bonus de
  // franchissement), puis un CourseAids construit par la page sur le jeu réel (tirets du tracé, matériaux, géométries
  // du repère et des bandes), supprimé ensuite ; hauteurs d'origine remises.
  P.aidsData = async () => {
    const CA = await import('/src/gameplay/courseAids.js');
    const { csoHeights } = await import('/src/gameplay/csoCourse.js');
    const O = await import('/src/gameplay/obstacles.js');
    const list = aidObs();
    const h0 = list.map((o) => o.h);
    const speeds = [0, 2, 3.2, 4.6, 5.49, 5.5, 5.51, 5.8, 6.2, 6.6, 7, 7.5, 8, 9, 9.6];
    const powers = [1.1, 1.35, 1.5, 1.8];
    const clears = [0, 0.03, 0.08];
    const sets = [];
    for (const base of [null, 0.6, 0.8, 1.05, 1.1, 1.25, 1.4, 1.55]) {
      if (base !== null) g.obstacles.setHeights('cso', csoHeights(base));
      const cases = [];
      list.forEach((o, i) => {
        for (const v of speeds)
          for (const pw of powers)
            for (const cl of clears) {
              const z = CA.takeoffZone(o, { speed: v, jumpPower: pw, mods: { clearance: cl } });
              cases.push([i, v, pw, cl, z.pass, z.good]);
            }
      });
      sets.push({ base, obs: aidObsDump(), cases });
    }
    g.obstacles.setHeights('cso', h0);
    if (aidObs().some((o, i) => o.h !== h0[i])) throw new Error('aides : hauteurs non remises');
    // Sol lu par _strip pour chaque coin (terrain.getHeight(x, z), avant l'ajout de 0,04 et l'arrondi float32), dans
    // l'ordre : les coins du tracé d'abord (this.line), puis ceux de sa suite.
    const ter = g.terrain, own = Object.prototype.hasOwnProperty.call(ter, 'getHeight'), gh0 = ter.getHeight;
    const gq = [];
    ter.getHeight = function (x, z) {
      const y = gh0.call(this, x, z);
      gq.push([x, z, y]);
      return y;
    };
    let aids;
    try {
      aids = new CA.CourseAids(g, 'cso');
    } finally {
      if (own) ter.getHeight = gh0;
      else delete ter.getHeight;
    }
    const pos = aids.line.geo.attributes.position.array;
    if (gq.length !== aids.line.stepS.length * 8) throw new Error(`aides : ${gq.length} lectures du sol pour ${aids.line.stepS.length} tirets`);
    const marks = aids.line.stepS.map((s, k) => ({ s, c: [0, 1, 2, 3].map((j) => [pos[(k * 4 + j) * 3], pos[(k * 4 + j) * 3 + 1], pos[(k * 4 + j) * 3 + 2]]), g: [0, 1, 2, 3].map((j) => gq[k * 4 + j]) }));
    const idxOk = [...aids.line.geo.index.array].every((v, i) => v === Math.floor(i / 6) * 4 + [0, 1, 2, 0, 2, 3][i % 6]);
    const mat = (m) => ({ type: m.type, color: `#${m.color.getHexString()}`, colorLinear: [m.color.r, m.color.g, m.color.b], opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, depthTest: m.depthTest, side: m.side, toneMapped: m.toneMapped });
    const geo = (gg) => ({ position: [...gg.attributes.position.array], normal: gg.attributes.normal ? [...gg.attributes.normal.array] : null, index: gg.index ? [...gg.index.array] : null, params: gg.parameters ?? null });
    const out = {
      sets,
      speeds, powers, clears,
      marks, markIndexOk: idxOk, line: { n: O.CSO_LINE.length, first: O.CSO_LINE[0], last: O.CSO_LINE[O.CSO_LINE.length - 1] },
      data: {
        lineMark: CA.LINE_MARK,
        materials: { line: mat(aids.line.mesh.material), after: mat(aids.after.mesh.material), ok: mat(aids.ok.material), good: mat(aids.good.material), mark: mat(aids.mark.material) },
        renderOrder: { line: aids.line.mesh.renderOrder, after: aids.after.mesh.renderOrder, ok: aids.ok.renderOrder, good: aids.good.renderOrder, mark: aids.mark.renderOrder },
        frustumCulled: { line: aids.line.mesh.frustumCulled, mark: aids.mark.frustumCulled },
        mark: geo(aids.mark.geometry),
        band: geo(aids.good.geometry),
        toneMapping: g.renderer.toneMapping, toneMappingExposure: g.renderer.toneMappingExposure, outputColorSpace: g.renderer.outputColorSpace,
      },
    };
    aids.dispose();
    return out;
  };
  // Fin d'image (scénarios `aides`) : état du bouton dans le DOM, liste des obstacles du parcours quand elle change.
  const finishAi = (rec) => {
    if (!AIDS) return;
    const H = g.hud, ai = (rec.ai ||= {});
    if (!ai.b) throw new Error('aides : hud.update non appelé dans l’image');
    Object.assign(ai.b, { st: H._jt ?? null, cl: ['far', 'good', 'near', 'early'].filter((k) => H.btnJump.classList.contains(k)), sg: H.jumpSign.textContent, lb: H.jumpLabel.textContent });
    const ob = aidObsDump();
    const sig = JSON.stringify(ob);
    if (sig !== AIDS.sig) {
      ai.ob = ob;
      AIDS.sig = sig;
    }
  };

  P.setup = async (sc, seed) => {
    A.stopLoop();
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    A.closeCards();
    A.releaseInput();
    seedRandom(seed);
    clock = 0;
    const O = await import('/src/gameplay/obstacles.js');
    P.takeoffQuality = (await import('/src/gameplay/jumpModel.js')).takeoffQuality;
    const day = Math.floor(g.save.data.gameTime / 86400);
    g.save.data.gameTime = day * 86400 + 15 * 3600;
    g.time = 1000; // dossard = 40 + floor(time) % 50 (courses.js:459)
    g.simClock = 1000;
    A.mount();
    const h = g.player.horse;
    const S = O.CSO_START;
    const before = sc.before ?? 16; // scénarios « pose » : même entrée en piste que « droit »
    // `at` (contrôle de T4, étape « rejoindre l'entrée ») : cheval monté posé à (dx, dz) m de l'entrée de piste, tourné
    // vers elle.
    const GA0 = O.CSO_GATE;
    const pose = sc.at
      ? { x: GA0.x + sc.at.dx, z: GA0.z + sc.at.dz, h: sc.at.h ?? Math.atan2(-sc.at.dx, -sc.at.dz) }
      : { x: S.x - Math.sin(S.rot) * before, z: S.z - Math.cos(S.rot) * before, h: S.rot };
    h.setPosition(pose.x, pose.z, pose.h);
    h.speed = 0;
    h.stamina = h.maxStamina;
    // Animation du cheval remise à neuf (phase, membres, allure) : sinon les foulées (horse:step) dépendent de ce que le
    // cheval a fait pendant le chargement, dont la durée varie.
    if (h.anim) {
      Object.assign(h.anim, { phase: 0, t: 0, jump: -1, turn: 0, graze: 0, rear: 0, headYaw: 0, vel: 0, speed: 0 });
      delete h.anim._a;
    }
    h.lastTurn = 0;
    // Cheval WildMesh (pjlHorse.js) : sa phase de foulée réécrit celle du cheval du jeu (pjlHorse.js:431) ; remise aux
    // valeurs de son constructeur (pjlHorse.js:215-219), lues dans le source de la classe chargée par la page (aucune
    // valeur recopiée) ; la phase vaut horse.anim.phase, remise à 0 ci-dessus. Lissages effacés.
    if (h.pjl) {
      Object.assign(h.pjl, pjlInitial(h.pjl), { ph: h.anim?.phase || 0 });
      for (const k of ['_clrA', '_clrY', '_clrF', 'dPitch']) delete h.pjl[k];
    }
    // Cavaliers du décor (Ambient.rider de npcs.js : cheval à PathAI) remis à leur état d'apparition. Sinon ils gardent
    // l'état atteint pendant les images jouées en temps réel avant stopLoop (vitesse, position au centimètre), qui varie
    // d'un chargement à l'autre : l'épuisement du cheval du cavalier de l'hippodrome (horse:exhausted, rider230, scénario
    // t3-refus-5s) tombait à l'image 428, 429 ou 430 selon l'export.
    for (const o of g.horses) {
      if (o === h || !o.ambient || !o.ai?.points?.length) continue;
      o.setPosition(o.ai.points[0][0], o.ai.points[0][1], 0);
      Object.assign(o, { stamina: o.maxStamina, exhausted: false, _yawRate: 0, lastTurn: 0 });
      Object.assign(o.ai, { i: 0, laps: 0, finished: false });
      if (o.anim) {
        Object.assign(o.anim, { phase: 0, t: 0, jump: -1, turn: 0, graze: 0, rear: 0, headYaw: 0, vel: 0, speed: 0 });
        delete o.anim._a;
      }
    }
    g.player.csoCadence = undefined;
    g.cam.snap(h.pos, h.heading);
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    P.virtualHud = !!sc.virtualHud; // captures de la tranche T9 : temporisations de hud.js virtuelles
    if (sc.aides) await P.installAids(sc); // tranche T9 : réglages de l'épreuve et canal « ai » (avant le lancement)
    const startCalls = { f: -1, ev: [], hud: [], audio: [] };
    cur = startCalls;
    g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
    cur = null;
    hookRun();
    frames.length = 0;
    rails0 = railState();
    ARENA = (await import('/src/world/sites.js')).POLE.arena;
    GATE = O.CSO_GATE;
    const ch0 = chStart();
    const cc0 = ccStart();
    const FI = O.CSO_FINISH, GA = O.CSO_GATE;
    return {
      seed, dt: DT, day, gameTime: g.save.data.gameTime, time: g.time, playerName: g.save.data.playerName, horseName: h.name, horseId: h.id,
      horse: { x: R6(pose.x), z: R6(pose.z), h: R6(pose.h), v: 0 },
      start: { x: R6(S.x), z: R6(S.z), rot: R6(S.rot), w: S.w },
      // Tranche T4 : ligne d'arrivée et entrée de piste (pleine précision), étape de la mission après le lancement.
      finish: { x: FI.x, z: FI.z, rot: FI.rot, w: FI.w },
      gate: { x: GA.x, z: GA.z, rot: GA.rot },
      run0: { i: g.missions.active?.i ?? null, steps: g.missions.active?.steps.length ?? null },
      arena: { x: ARENA.x, z: ARENA.z },
      calls: { ev: startCalls.ev, hud: startCalls.hud, audio: startCalls.audio },
      rails: rails0,
      ch0,
      cc0,
    };
  };

  // Scénario « entrée » (tranche T6) : cheval tourné sur place de sc.turn rad après le lancement (la caméra du monde
  // ouvert, à l'arrêt, ne recentre pas : elle reste derrière l'ancien cap), puis présentation, Entrer en piste et
  // sc.after images : la caméra de concours part de cette caméra décalée (cap initial vers le cheval, fondu de 1,2 s).
  P.runEntry = (sc) => {
    const h = g.player.horse;
    h.setPosition(h.pos.x, h.pos.z, h.heading + sc.turn);
    let k = 0;
    while (!document.querySelector('.overlay [data-id="enter"]')) {
      step(input());
      if (++k > 120) throw new Error('présentation absente');
    }
    step(input({ ui: 'enter' }));
    for (k = 0; k < sc.after; k++) step(input());
    return frames;
  };

  // Scénario « droit » (voir SCENARIOS dans le script).
  P.runDroit = (sc) => {
    const h = g.player.horse, p = g.player;
    const O = g.obstacles;
    const S = { x: h.pos.x, z: h.pos.z, rot: h.heading };
    const one = O.ofCourse('cso')[0];
    const dirx = Math.sin(S.rot), dirz = Math.cos(S.rot);
    const s1 = (one.x - S.x) * dirx + (one.z - S.z) * dirz - sc.before; // abscisse du 1 depuis la ligne de départ
    // 1) Images sans entrée jusqu'à la carte de présentation.
    let k = 0;
    while (!document.querySelector('.overlay [data-id="enter"]')) {
      step(input());
      if (++k > 120) throw new Error('présentation absente');
    }
    // 2) « Entrer en piste », puis attente de la cloche.
    step(input({ ui: 'enter' }));
    let bell = false;
    for (k = 0; !bell; k++) {
      const r = step(input());
      bell = r.audio.some((c) => c.fn === 'bell');
      if (k > 300) throw new Error('cloche absente');
    }
    // 3) Galop droit : cadence montée au joystick, puis relâchée ; SAUT selon l'aide.
    let jumped = false;
    for (k = 0; ; k++) {
      const cad = p.csoCadence ?? 0;
      const tg = O.target(h);
      const press = !jumped && h.jumpT < 0 && tg && tg.o === one && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3;
      if (press) jumped = true;
      step(input({ move: [0, cad < sc.cadence ? 1 : 0], jump: press }));
      const s = (h.pos.x - S.x) * dirx + (h.pos.z - S.z) * dirz - sc.before;
      if (s > s1 + sc.after) break;
      if (frames.length > sc.maxFrames) throw new Error(`scénario trop long (s = ${s.toFixed(2)} m)`);
    }
    return frames;
  };

  // ---- Gel en pause et au téléphone (tranche T8, contrôle adverse) : boucle de game.js:1406 au pas fixe ----
  // Entrée en piste et cloche comme « droit », galop droit (cadence montée au joystick puis relâchée) jusqu'au départ du
  // chrono + 10 images ; puis la séquence `seq` est jouée image par image comme la boucle du jeu : update(dt) seulement à
  // l'état « play » (ou « photo »), rien en pause. Action d'une image, versée avant elle : « pause » (Échap), « phone »
  // (P), « map » (M) = appui (input.pressed, input.js:171) ; « resume » = clic de Reprendre sur la carte Pause.
  P.runFreeze = (sc, seq) => {
    const h = g.player.horse, p = g.player;
    let k = 0;
    while (!document.querySelector('.overlay [data-id="enter"]')) {
      step(input());
      if (++k > 120) throw new Error('présentation absente');
    }
    step(input({ ui: 'enter' }));
    let bell = false;
    for (k = 0; !bell; k++) {
      bell = step(input()).audio.some((c) => c.fn === 'bell');
      if (k > 300) throw new Error('cloche absente');
    }
    for (k = 0; !g.course?.hud?.().started; k++) {
      step(input({ move: [0, (p.csoCadence ?? 0) < sc.cadence ? 1 : 0] }));
      if (k > 900) throw new Error('chrono non lancé');
    }
    for (k = 0; k < 10; k++) step(input());
    const out = [];
    for (const a of seq) {
      if (a === 'resume') {
        const el = document.querySelector('.overlay [data-id="resume"]');
        if (!el) throw new Error('carte Pause absente');
        A.tap(el);
      }
      const upd = g.state === 'play' || g.state === 'photo';
      if (upd) step(input(a && a !== 'resume' ? { press: [a] } : {}));
      else clock += DT * 1000;
      const ci = g.course?.hud?.();
      out.push({ a, upd, st: g.state, sp: !!g.simPaused, ph: !!g.phone.isOpen, app: g.phone.isOpen ? g.phone.app : null, t: ci ? R6(ci.t) : null, x: R6(h.pos.x), z: R6(h.pos.z) });
    }
    return out;
  };

  // Pose de capture : caméra posée (œil, cible, FOV vertical), soleil à l'heure de la pose, HUD masqué, rendu.
  P.pose = (ps) => {
    const h = g.player.horse;
    h.setPosition(ps.horse.x, ps.horse.z, ps.horse.h);
    h.speed = 0;
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + ps.hour * 3600;
    const cam = g.camera;
    cam.position.set(...ps.eye);
    cam.fov = ps.fovV;
    cam.aspect = ps.viewport.w / ps.viewport.h;
    cam.updateProjectionMatrix();
    cam.lookAt(...ps.target);
    g.sky.setDay(Math.floor(g.save.data.gameTime / 86400));
    g.sky.update(g.hour(), h.pos, 0);
    g.sky.follow(cam);
    g.world.update(0, cam, g.sky, h.pos);
    g.renderer.domElement.classList.add('parite-scene');
    if (!document.getElementById('parite-css')) {
      const st = document.createElement('style');
      st.id = 'parite-css';
      st.textContent = '* { visibility: hidden !important; } canvas.parite-scene { visibility: visible !important; }';
      document.head.appendChild(st);
    }
    g.renderer.render(g.scene, cam);
    return {
      sunDir: v3(g.sky.sunDir), hour: R6(g.hour()), day: Math.floor(g.save.data.gameTime / 86400),
      groundEye: R6(h.groundAt(ps.eye[0], ps.eye[2])), groundTarget: R6(h.groundAt(ps.target[0], ps.target[2])), groundHorse: R6(h.groundAt(ps.horse.x, ps.horse.z)),
      camDir: v3(cam.getWorldDirection(tmp)), canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
    };
  };
  P.render = () => g.renderer.render(g.scene, g.camera);
  // Captures prises pendant un scénario (tranche T3, chute des barres) : le scénario avance image par image (mêmes appels
  // que runPose) ; aux images voulues, caméra de pose, rendu, puis caméra de jeu rétablie avant l'image suivante.
  let during = null;
  P.duringStart = async (sc) => {
    during = sc.type === 'framing' ? await framingStart(sc) : { ...poseStart(sc), step: poseStep };
    return true;
  };
  // Avance jusqu'à la fin de l'image k ; renvoie l'état utile à la pose (cheval, barres de l'obstacle `label`).
  P.duringTo = (k, label) => {
    while (frames.length <= k) if (!during.step(during.st)) throw new Error(`scénario terminé avant l’image ${k}`);
    const h = g.player.horse, o = F(label);
    return {
      f: frames[k].f, ch: frames[k].ch.s, horse: { x: h.pos.x, z: h.pos.z, h: h.heading, jumpY: h.jumpY, jumpT: h.jumpT },
      rails: o.rails.map((r) => ({ y: r.position.y, z: r.position.z, rx: r.rotation.x, rz: r.rotation.z, fall: r.userData.fall ? { t: r.userData.fall.t, dir: r.userData.fall.dir, side: r.userData.fall.side, hit: r.userData.fall.hit } : null })),
      fence: { x: o.x, z: o.z, ground: o.ground, n: o.n },
    };
  };
  let camSaved = null;
  P.duringView = (ps) => {
    const cam = g.camera, h = g.player.horse;
    camSaved = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect };
    cam.position.set(...ps.eye);
    cam.fov = ps.fovV;
    cam.aspect = ps.viewport.w / ps.viewport.h;
    cam.updateProjectionMatrix();
    cam.lookAt(...ps.target);
    g.sky.update(g.hour(), h.pos, 0);
    g.sky.follow(cam);
    g.world.update(0, cam, g.sky, h.pos);
    g.renderer.domElement.classList.add('parite-scene');
    if (!document.getElementById('parite-css')) {
      const st = document.createElement('style');
      st.id = 'parite-css';
      st.textContent = '* { visibility: hidden !important; } canvas.parite-scene { visibility: visible !important; }';
      document.head.appendChild(st);
    }
    g.scene.updateMatrixWorld();
    g.renderer.render(g.scene, cam);
    return { sunDir: v3(g.sky.sunDir), hour: R6(g.hour()), day: Math.floor(g.save.data.gameTime / 86400), camDir: v3(cam.getWorldDirection(tmp)), canvas: [g.renderer.domElement.width, g.renderer.domElement.height] };
  };
  P.duringRestore = () => {
    const cam = g.camera;
    cam.position.copy(camSaved.p);
    cam.quaternion.copy(camSaved.q);
    cam.fov = camSaved.fov;
    cam.aspect = camSaved.aspect;
    cam.updateProjectionMatrix();
    g.scene.updateMatrixWorld();
    if (!cam.parent) cam.updateMatrixWorld();
  };
  // Images enregistrées pendant les captures (comparées à l'oracle par le script : la capture ne change pas la partie).
  P.duringFrames = () => frames.map((f) => JSON.stringify(f.ch.s));
  // Tranche T6 : avance jusqu'à la fin de l'image k du scénario « cadrage » ; caméra du jeu (œil, point visé, FOV
  // appliqué) et mesure du cadrage à cette image.
  P.duringCam = (k) => {
    while (frames.length <= k) if (!during.step(during.st)) throw new Error(`scénario terminé avant l’image ${k}`);
    const f = frames[k], h = g.player.horse;
    if (!f.cc || !f.fr) throw new Error(`cadrage : image ${k} sans caméra de concours ou sans mesure`);
    return { horse: { x: h.pos.x, z: h.pos.z, h: h.heading, jumpY: h.jumpY, jumpT: h.jumpT }, eye: f.cc.eye, look: f.cc.look, fov: f.cc.fov, fr: f.fr };
  };
  P.duringCamFrames = () => frames.map((f) => JSON.stringify([f.ch.s, f.cc ?? null, f.ccp ?? null]));
}

// ---------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
// `classic` : personnages classiques (?classic, crochet de game.js) : pas de cheval WildMesh, donc pas de contacts des
// membres (scénarios de la tranche T3).
async function openGame(lang, classic = false) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await page.goto(`${BASE}/?autostart&quality=high&lang=${lang}${classic ? '&classic' : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
  await page.addScriptTag({ content: AUTOPILOT });
  await page.addScriptTag({ content: `(${PAGE.toString()})();` });
  const audioNames = await page.evaluate((o) => window.__parite.install(o), { audioIgnored: AUDIO_IGNORED, hudMethods: HUD_METHODS, hudDedupe: HUD_DEDUPE });
  return { ctx, page, audioNames };
}

const runs = [];
let audioRecorded = null;
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
for (const sc of SCENARIOS) {
  if (NO_RUNS) break;
  if (ONLY.length && !ONLY.includes(sc.id)) continue;
  for (const lang of sc.langs || ['fr', 'en']) {
    const t0 = Date.now();
    const { ctx, page, audioNames } = await openGame(lang, !!sc.classic);
    audioRecorded = audioNames;
    if (process.argv.includes('--lenient')) sc.lenient = true;
    const setup = await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [sc, 20261118]);
    let frames;
    if (sc.type === 'pose') {
      const r = await page.evaluate((s) => window.__parite.runPose(s), sc);
      frames = r.frames;
      Object.assign(setup, { horse: r.horse, rails: r.rails, ch0: r.ch0, cc0: r.cc0, pose: { ...sc.pose, cross: sc.cross ?? null } });
    } else if (sc.type === 'entry') {
      frames = await page.evaluate((s) => window.__parite.runEntry(s), sc);
      setup.turn = sc.turn;
    } else if (sc.type === 'framing') {
      const r = await page.evaluate((s) => window.__parite.runFraming(s), sc);
      frames = r.frames;
      Object.assign(setup, { rails: r.rails, ch0: r.ch0, cc0: r.cc0, posed: r.start, framing: sc.framing });
    } else if (sc.type === 't4') {
      frames = await page.evaluate((s) => window.__parite.runT4(s), sc);
      delete setup.cc0; // images légères : pas de canal caméra
      Object.assign(setup, { lite: true, acts: sc.acts, pose: sc.pose ?? null, ...(sc.pre ? { pre: sc.pre, at: sc.at ?? null } : {}), ...(sc.ent ? { ent: sc.ent } : {}) });
    } else if (sc.type === 'recette') {
      const r = await page.evaluate((s) => window.__parite.runRecette(s), sc);
      frames = r.frames;
      delete setup.cc0;
      const pause = { wait: sc.recette.wait, captureMs: sc.recette.captureMs, ticks: Math.round((sc.recette.wait + sc.recette.captureMs) * 3), bounds: recetteBounds(frames, r.shots, sc.recette) };
      Object.assign(setup, { lite: true, at: sc.at, recette: { ...sc.recette, shots: r.shots, pause } });
      console.log(`t9-recette : captures ${r.shots.map((s) => `${s.name} image ${s.frame}`).join(', ')} ; pause par capture ${pause.wait} + ${pause.captureMs} ms, état du HUD des PNG obtenu pour une durée de capture de ${pause.bounds.min} à ${pause.bounds.max} ms`);
      if (sc.recette.captureMs < pause.bounds.min || sc.recette.captureMs > pause.bounds.max) throw new Error('t9-recette : durée de capture hors de l’intervalle de l’état des PNG');
    } else frames = await page.evaluate((s) => window.__parite.runDroit(s), sc);
    if (sc.classic) setup.classic = true;
    if (sc.aides) Object.assign(setup, { aides: true, aid: sc.aid ?? 'full', courseLine: sc.courseLine ?? true, virtualEarly: await page.evaluate(() => window.__parite.aidsVirtual()) });
    runs.push({ id: sc.id, lang, desc: sc.desc, setup, frames });
    const evs = frames.flatMap((f) => f.ev.map((e) => e.e)).filter((e) => e.startsWith('obstacle:') || e.startsWith('horse:j') || e === 'horse:land');
    console.log(`${sc.id} ${lang} : ${frames.length} images, ${((Date.now() - t0) / 1000).toFixed(0)} s, événements ${evs.join(' ')}`);
    await ctx.close();
  }
}

// Écriture : index (en-tête lisible, une ligne par exécution) et un fichier par exécution, une image par ligne (diffs
// lisibles, fichiers stables ; scripts/unreal/cso-runs-io.mjs).
const head = {
  schema: RUNS_SCHEMA,
  generator: 'scripts/unreal/export-cso-runs.mjs',
  layout: RUNS_LAYOUT,
  source: ['src/game.js', 'src/gameplay/courses.js', 'src/gameplay/activities.js', 'src/gameplay/csoRide.js', 'src/gameplay/obstacles.js', 'src/entities/horse.js', 'src/entities/camera.js', 'src/ui/hud.js', 'src/core/audio.js', 'tests/e2e/autopilot.js'],
  frame: 'repère web : x est, z sud, y haut ; cap h -> direction (sin h, cos h) ; m, s, rad ; fov = FOV vertical (degrés)',
  dt: 1 / 30,
  precision: 1e-6,
  inputs: 'in.move = joystick virtuel [x, y] (input.setVirtualMove) ; in.keys = touches clavier tenues (input.keys) ; in.held = actions tenues (input.held, ex. gallop) ; in.jump = SAUT pressé à cette image ; in.ui = bouton de carte touché (data-id) avant l’image',
  state: 'après g.update(dt) : horse (pos, cap, vitesse, jumpT, jumpY, cadence de concours, mode), run (étape i, stepT, texte, état du parcours), course (game.course), board (tableau de chrono : données et textes), cam (œil, cible, direction, FOV, aspect), rails (barres dont la transformée locale [x, y, z, rx, ry, rz] a changé depuis l’image précédente ; état initial dans setup.rails), ev (bus), hud / audio (appels de premier niveau), ch (cheval de concours, pleine précision, voir ch) ; valeurs résumées (run.course, course, board, ev.d, arguments) : au-delà de deux niveaux d’imbrication, objets et tableaux remplacés par null (ex. run.course.log, steps de mission:start) : journal des fautes complet dans ep.lg, recul de la caméra dans cc.bk',
  ep: 'canal du déroulé d’épreuve (tranche T4), pleine précision : entrées de Run.update (missions.js) à chaque image où une mission est en cours : e0 = nombre d’événements du bus émis dans l’image avant Run.update, i / i1 = étape avant / après, dt = pas de la mission (nul en pause), gt = game.time, x, z, h = cheval du joueur, fx, fz = player.focus, mode = player.mode, tk / vh = player.inTruck / véhicule présent (au volant seulement), cad / cad1 = cadence de concours avant / après (null si indéfinie) ; relevés seulement quand ils changent : hl = dernier numéro surligné (Obstacles.highlight du parcours cso), rr = appels de Obstacles.resetRails(cso) depuis le relevé précédent, cheer = game.cheerT réécrit pendant Run.update, lg = journal des fautes de l’épreuve (state.log) en fin d’image, entrées [label, kind, cause, causeText] (null si absent) ; lj = dernier saut du cheval du joueur (horse._lastJump, lu par le mot d’appel de courses.js:203-211) : [numéro de l’obstacle sauté s’il est du parcours cso, sinon null ; takeoffQuality(plan), null si aucune], null si aucun saut ; bt = meilleur temps de l’activité (save.data.bestTimes.cso_train, tranche T11), null si absent',
  bl: 'carte de bilan (tranche T11, courses.js:414 : screens.card reconnue à son bouton cso-retry), relevée dans le DOM à l’image où elle s’ouvre : kicker, title, rows = grille .cso-pres [clé, valeur], table = lignes de .cso-rank { me = classe me, td = textes des cellules }, buttons = [data-id, texte, classe]',
  calls: 'hud / audio : { fn, args, src } ; src = fichier de l’appelant immédiat sous src/ (ex. gameplay/courses.js), null sinon',
  lite: 'setup.lite (scénarios t4-*) : images sans cam, sim ni ch ; tp = cheval posé avant l’image (x, z, h, v) ; setup.acts = suite d’actions du scénario ; setup.pre = actions avant la présentation (étape « rejoindre l’entrée »), setup.at = cheval posé à (dx, dz) m de l’entrée au lancement ; setup.ent = actions pendant l’étape « Entrée en piste », achevées avant la cloche ; in.press = actions pressées (ex. action) ; scénario t9-recette (tests/e2e/cso-shots.mjs, setup.recette = réglages relus dans le test, shots = images capturées, pause = modèle des temporisations du HUD) : in.taps = boutons de carte touchés avant in.ui, fs = état de l’épreuve écrit par le test avant l’image (started, next, t, hl = obstacle surligné, o = rang de l’obstacle abordé, snap = caméra recalée), hw = ticks de l’horloge virtuelle du HUD écoulés après l’image (captures du test, sans image de jeu)',
  ch: 'canal du cheval (tranche T2), nombres en pleine précision : in = entrées vues par player.update (dt, mx / my = input.move après poll, key = input.keyMove, jp = SAUT pressé, cso = commandes de concours, lk = player.locked) et par horse.update (fz = figé, pl = cheval du joueur, pow = jumpPower, clr = bonus de franchissement, t = game.time, sl = pente, wd / wa = profondeur d’eau si > 0, hdt = pas du cheval s’il diffère) ; s = état en fin d’image (x, z, h, v, yr = _yawRate, lt = lastTurn, jT / jY / jP / jL / jD = saut, j0 / j1 = _jt0 / _jt1, rT = _rearT, ra = anim.rear, bk = _brake, rf = obstacle refusé, lj = obstacle du dernier saut, cad = cadence, ks = _kbdSteer, ca = _cadAdjust) ; b = état après horse.update s’il diffère de s (correction extérieure : collisions, Obstacles.updateHorse) ; a = état à l’entrée de player.update s’il diffère du s précédent ; col = collision du cheval ; tm = obstacles.timing ; tg = obstacles.target résumé ; obs = liste des obstacles (rang = indice des champs rf, lj, tg.o), relevée quand elle change ; état initial : setup.ch0 { s, obs, ob }. he = événements horse:* émis pendant horse.update (hors foulées) ; tranche T3 : in.lj = membres visibles jugés (Obstacles._limbJudged), in.ma = mission en cours, in.ut / in.ot / in.odt = heure de jeu vue par updateHorse / update et pas de update s’ils diffèrent ; lc = contacts des membres signalés pendant horse.update (o, bar = rang de la barre, d = profondeur, u, hind) ; oe = événements obstacle:* en pleine précision (o, dir, m = marge, c = cause) ; ob = fin d’image : ps = passage en cours (horse._pass : o, dir, f = faute, c = cause, m = marge, x = heure de sortie, d = annoncé), rl = dernier refus compté (horse._refusal : o, t, a = détourné), fs = obstacles hors repos (i = rang, kn = renversé, rb = remise, pd = barres en attente [barre, sens, côté, profondeur, reste], r = barres déplacées [barre, y, z, rx, rz, vibration, chute]) ; setup.classic = personnages classiques (?classic) ; jalon J2 : lb = pose des membres relevée par PjlHorse._limbContacts (o = obstacle, j = jugé, t = heure de jeu, p = [AG, AD, PG, PD][canon, paturon, bout du sabot] = [s, u, y] dans le repère de l’obstacle), absente quand le cheval ne garde aucune pose',
  cc: 'canal de la caméra de concours (tranche T6), nombres en pleine précision, un appel de FollowCamera._updateComp par image en épreuve : hz = cheval vu par la caméra [pos.x, pos.z, heading, _yawRate (null : indéfini), jumpT, jumpY, groundY] ; dt s’il diffère du pas ; i = instant (snap) ; e0 = camera.position et f0 = [this.fov, camera.fov] avant l’appel quand l’état de concours est (re)créé ; nx = rang dans cc0.obs de game.course.next (null : aucun) ; sonde de la perche (colliders.cameraBlocked) : pn = points sondés, pb = rang du premier point bloqué (−1 : aucun), pq = points [x, y, z] sondés (premier appel de l’exécution et appels bloqués) ; th = [x, z, hauteur] rendus par terrain.getHeight (sol sous la caméra) ; eye = camera.position, look = arguments de camera.lookAt, fov = camera.fov (vertical, appliqué), fs = this.fov (lissé), bk = _comp.back (recul retenu, amorti) ; obs = obstacles [x, z, n.x, n.z, t.x, t.z, w, depth (null : absent), ground, h, off] quand l’un d’eux change ; ccp = appels hors image (snap) avant l’image ; setup.cc0 = état de départ { st = _comp (cH, w, t, ax, az, ay, back, from, fromLook, aim) ou null, eye, fov = this.fov, camFov = camera.fov, obs }',
  ai: 'canal des aides à l’appel (tranche T9, scénarios t9-*, setup.aides ; setup.aid / setup.courseLine = réglages jumpAid / courseLine posés avant le lancement ; setup.virtualEarly = temporisations de « Trop tôt » passées sur l’horloge virtuelle), pleine précision : c = appel de CourseAids.update (courseAids.js:104-167) de l’image, absent sans appel : in = entrées (dt ; n = rang de l’obstacle suivant dans ob, null : aucun ; ps = prevS ; sl / sz = showLine / showZone ; hh = cheval présent ; x, z, v, pw, cl = cheval : position, vitesse, jumpPower, mods.clearance ; md = mode « ride » ; t = game.time), gq = appels de terrain.getHeight pendant l’appel [x, z, y] dans l’ordre, out = maillages après l’appel (ln / af = tracé jusqu’à l’obstacle suivant / après lui [visible, premier tiret, nombre de tirets (null : drawRange infini, jamais réglé)] ; mk = repère [visible, x, y, z, rotation.y] ; ok / gd = bandes ambre / verte [visible, x, y, z, rotation.y, scale.x, scale.z] ; zt = _zoneT ; zf = rang de _zoneFor ; zo = _zone { p = pass, g = good }) ; b = bouton SAUT : jt = valeur lue par hud.update (g.course?.jumpTiming?.() || ’none’, relevée à l’appel), tm = obstacles.timing du cheval au même moment, c = game.course non nul, pre = game.course.pre (entrée en piste), aid = réglage jumpAid || ’full’, line = courseLine !== false, to / tx = cible (rang dans ob, première barre en m) ou null, cad / ca = player.csoCadence (null : indéfinie) et player._cadAdjust lus par la même hud.update ; puis, en fin d’image : st = hud._jt (null : non défini ou remis à null), cl = classes far / good / near / early de .btn-jump, sg = signe, lb = libellé ; ob = obstacles du parcours dans l’ordre (label, num, kind, x, z, rot, h, w, spread, ground, lineS, n, bars [s, h], off) quand la liste change ; temporisation de « Trop tôt » (hud.js:438) sur une horloge virtuelle de 100 ticks de 1/3 ms par image, échéances déclenchées avant l’image suivante',
  fr: 'scénario « cadrage » (tranche T6) : mesure de tests/e2e/cso-framing.mjs:31-39 après l’image (silhouette setup.framing.pts projetée par la caméra du jeu, matrices à jour comme au rendu) : part, top, bottom (0 = haut de l’écran), jump (en l’air), ys (ordonnées des points), asp = camera.aspect, pose = [pos.x, pos.z, heading, groundY, jumpY, jumpT] ; setup.framing = réglages relus dans le test, setup.posed = cheval posé avant la première image (x, z, h, course = caméra de concours active, step = étape de la mission)',
  audioRecorded,
  audioIgnored: AUDIO_IGNORED,
  hudMethods: HUD_METHODS,
  hudDedupe: HUD_DEDUPE,
};
if (!NO_RUNS && runs.length) {
  const order = SCENARIOS.flatMap((sc) => (sc.langs || ['fr', 'en']).map((lang) => [sc.id, lang]));
  const res = writeRuns(OUT, head, runs, order);
  console.log('oracle :', OUT, `${runs.length} exécutions exportées, ${res.written.length} fichiers réécrits (${res.written.join(' ') || 'aucun'}), ${res.kept.length} inchangés`);
  if (res.orphans.length) console.log('fichiers absents de l’index (non supprimés) :', res.orphans.join(' '));
}

// ---------------------------------------------------------------------------------------------------------------
// Grille de visée (oracle cso_target.json) : obstacles.target(h) et timing(h) du jeu en cours d'exécution.
if (!NO_RUNS && (!ONLY.length || ONLY.includes('target'))) {
  const { ctx, page } = await openGame('fr');
  await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [SCENARIOS[0], 20261118]);
  const grid = await page.evaluate(() => window.__parite.targetGrid());
  const TOUT = join(ORA, 'cso_target.json');
  const th = {
    schema: 'strides.oracle.cso_target/1',
    generator: 'scripts/unreal/export-cso-runs.mjs',
    source: ['src/gameplay/obstacles.js', 'src/gameplay/jumpModel.js', 'src/entities/horse.js'],
    frame: 'repère web : x est, z sud ; cap h -> (sin h, cos h) ; m, rad, m/s',
    cases: 'ref = [rang de l’obstacle posé, sens (1 : selon n), angle de marche (degrés), décalage latéral du point de passage (m), distance épaules → point de passage (m, approchée)] ; x, z, h, v = pose exacte du cheval (origine) ; jT, rf = saut en cours, obstacle refusé ; tm = timing() ; tg = target() résumé (o rang, x0 première barre, cosA, zone, L0, L, H, m marge, ideal, dev, cause) ou null',
    press: 'appui SAUT : Horse.startJump() appelé seul sur la pose (cheval du joueur, commandes de concours) ; ref, x, z, h, v comme cases ; pow, clr, t = jumpPower, bonus de franchissement, heure de jeu ; jT0, rf0 = saut en cours, obstacle refusé avant l’appui ; ok = valeur rendue ; ev = événements du bus ; jT, jP, jL, jD = saut après l’appui (jP, jL, jD seulement si ok) ; bk = _brake ; rf = obstacle refusé ; lj = obstacle du dernier saut',
    refuse: 'refus décidé : Obstacles.refuse(cheval, obstacle o) appelé seul sur la pose ; ref, x, z, h, v comme cases ; bk = _brake (freinage) ; rf = obstacle refusé',
    power: grid.power, clearance: grid.clearance, cso: grid.cso,
    obs: grid.ch0.obs,
  };
  let tout = JSON.stringify(th, null, 1).replace(/\n}$/, ',\n "list": [\n');
  tout += grid.cases.map((c) => JSON.stringify(c)).join(',\n') + '\n],\n "press": [\n';
  tout += grid.press.map((c) => JSON.stringify(c)).join(',\n') + '\n],\n "refuse": [\n';
  tout += grid.refuse.map((c) => JSON.stringify(c)).join(',\n') + '\n]}\n';
  JSON.parse(tout);
  writeFileSync(TOUT, tout);
  console.log('oracle :', TOUT, `${grid.cases.length} cas, ${grid.press.length} appuis, ${grid.refuse.length} refus, ${(tout.length / 1024).toFixed(0)} Kio`);
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------------------------
// Étape « rejoindre l'entrée de la carrière » (oracle cso_goto.json, contrôle de T4) : objectif et validation de l'étape
// goto du jeu, en français et en anglais, sur une grille de points suivis (distances autour des seuils r = 9 m,
// max(45, r + 30) m, arrondi à la dizaine, passage au kilomètre ; dans l'axe nord-sud de l'entrée et à 37°) et de modes
// du joueur (à pied, à cheval, au volant du camion, au volant d'un autre véhicule).
if (!NO_RUNS && (!ONLY.length || ONLY.includes('goto'))) {
  const D = [0, 5, 8.99, 9, 9.01, 20, 38.99, 39, 39.01, 44.99, 45, 45.01, 54.99, 55, 55.01, 64.99, 65, 120, 994.99, 995, 999.99, 1000, 1049.99, 1050, 1234.5, 15000];
  const MODES = [{ mode: 'foot' }, { mode: 'ride' }, { mode: 'drive' }, { mode: 'drive', car: true }];
  const cases = [];
  for (const d of D)
    for (const deg of [0, 37]) {
      const a = (deg * Math.PI) / 180;
      for (const m of MODES) cases.push({ dx: deg ? d * Math.sin(a) : 0, dz: deg ? d * Math.cos(a) : d, ...m });
    }
  const langs = [];
  let gateInfo = null;
  for (const lang of ['fr', 'en']) {
    const { ctx, page } = await openGame(lang, true);
    await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [{ id: 'goto', type: 't4' }, 20261118]);
    const grid = await page.evaluate((c) => window.__parite.gotoGrid(c), cases);
    gateInfo = { gate: grid.gate, r: grid.r, mode: grid.mode };
    langs.push({ lang, cases: grid.cases });
    await ctx.close();
  }
  const GOUT = (process.argv.find((a) => a.startsWith('--goto-out=')) || '').slice(11) || join(ORA, 'cso_goto.json');
  const gh = {
    schema: 'strides.oracle.cso_goto/1',
    generator: 'scripts/unreal/export-cso-runs.mjs',
    source: ['src/gameplay/missions.js', 'src/gameplay/courses.js', 'src/gameplay/obstacles.js'],
    frame: 'repère web : x est, z sud ; m',
    step: 'g.missions.active.steps[0] de l’activité cso_train (goto de courses.js:496, makeSteps de missions.js) : text() et update() appelés avec game.player remplacé par { focus.pos = (fx, fz), mode, vehicle, inTruck } ; tk = inTruck, vh = véhicule présent (au volant seulement)',
    ...gateInfo,
  };
  let gout = JSON.stringify(gh, null, 1).replace(/\n}$/, ',\n "langs": [\n');
  gout += langs.map((l) => `{"lang":${JSON.stringify(l.lang)},"cases":[\n${l.cases.map((c) => JSON.stringify(c)).join(',\n')}\n]}`).join(',\n') + '\n]}\n';
  JSON.parse(gout);
  writeFileSync(GOUT, gout);
  console.log('oracle :', GOUT, `${langs.map((l) => `${l.lang} ${l.cases.length} cas`).join(', ')}, ${(gout.length / 1024).toFixed(0)} Kio`);
}

// ---------------------------------------------------------------------------------------------------------------
// Aides à l'appel (tranche T9, --aids) : oracle cso_takeoff_zone.json et données Content/Data/cso_aids.json.
if (AIDS_DATA) {
  const { ctx, page } = await openGame('fr');
  await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [SCENARIOS[0], 20261118]);
  const r = await page.evaluate(() => window.__parite.aidsData());
  if (!r.markIndexOk) throw new Error('aides : index des tirets inattendu');
  const ZOUT = join(ORA, 'cso_takeoff_zone.json');
  const zh = {
    schema: 'strides.oracle.cso_takeoff_zone/1',
    generator: 'scripts/unreal/export-cso-runs.mjs --aids',
    source: ['src/gameplay/courseAids.js', 'src/gameplay/jumpModel.js', 'src/gameplay/obstacles.js', 'src/gameplay/csoCourse.js'],
    frame: 'repère web : x est, z sud, y haut ; m, m/s',
    sets: 'takeoffZone(o, { speed: v, jumpPower: pw, mods: { clearance: cl } }) de courseAids.js:25-34, appelée dans la page sur les obstacles du parcours cso (Obstacles.ofCourse) : base null = hauteurs hors épreuve, sinon Obstacles.setHeights(csoHeights(base)) ; obs = obstacles (label, num, kind, x, z, rot, h, w, spread, ground, lineS, n, bars [s, h], off) ; cases = [rang de l’obstacle, v, pw, cl, pass [près, loin] ou null, good [près, loin] ou null]',
    marks: 'tirets du tracé construits par new CourseAids(game, ’cso’) (_marks de courseAids.js:80-92 sur CSO_LINE, LINE_MARK) : s = indice de tracé (stepS), c = quatre coins [x, y, z] du tampon de positions (float32, y = terrain.getHeight + 0,04), g = appels de terrain.getHeight de _strip pour ces coins [x, z, y] (pleine précision, avant l’ajout et l’arrondi) ; line = CSO_LINE (nombre de points, premier, dernier)',
    speeds: r.speeds, powers: r.powers, clears: r.clears, line: r.line,
  };
  let zout = JSON.stringify(zh, null, 1).replace(/\n}$/, ',\n "sets": [\n');
  zout += r.sets.map((st) => `{"base":${JSON.stringify(st.base)},"obs":${JSON.stringify(st.obs)},"cases":[\n${st.cases.map((c) => JSON.stringify(c)).join(',\n')}\n]}`).join(',\n') + '\n],\n "marks": [\n';
  zout += r.marks.map((m) => JSON.stringify(m)).join(',\n') + '\n]}\n';
  JSON.parse(zout);
  writeFileSync(ZOUT, zout);
  const DOUT = join(ROOT, 'unreal/StridesGrandTour/Content/Data/cso_aids.json');
  const dd = {
    schema: 'strides.cso_aids/1',
    generator: 'scripts/unreal/export-cso-runs.mjs --aids',
    source: ['src/gameplay/courseAids.js', 'src/game.js'],
    doc: 'aides visuelles du parcours relues dans la scène du jeu web (new CourseAids(game, ’cso’)) : LINE_MARK ; matériaux (MeshBasicMaterial : couleur sRGB et linéaire, opacité, transparence, écriture de profondeur, face : 0 avant, 2 deux faces, tone mapping) du tracé (line), de sa suite (after), des bandes (ok ambre, good verte) et du repère (mark) ; renderOrder ; géométries du repère (ConeGeometry(0,16 ; 0,3 ; 3) retournée) et des bandes (PlaneGeometry(1, 1) couchée) : positions, normales, index ; tone mapping du rendu (toneMapping 4 = ACESFilmic, exposition, espace de sortie)',
    ...r.data,
  };
  const dtext = JSON.stringify(dd, null, 1) + '\n';
  if (!existsSync(DOUT) || readFileSync(DOUT, 'utf8') !== dtext) writeFileSync(DOUT, dtext);
  console.log('oracle :', ZOUT, `${r.sets.reduce((n, st) => n + st.cases.length, 0)} cas, ${r.marks.length} tirets, ${(zout.length / 1024).toFixed(0)} Kio ; données :`, DOUT);
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------------------------
// Géométrie des obstacles, des lignes et du poteau « Chrono » (tranche T5) : construite par le jeu web dans la page
// (scripts/unreal/cso-export.js), comparée au jeu réel hors épreuve (avant le lancement de l'activité) et en épreuve
// (après l'entrée en piste et la cloche, comme les poses de la carrière).
// Entrée en piste et cloche (mêmes images que le scénario « droit », sans le galop) : présentation → Entrer en piste.
const enterCourse = (page) => page.evaluate(() => {
  const A = window.__auto;
  for (let i = 0; i < 120 && !document.querySelector('.overlay [data-id="enter"]'); i++) A.tick(1);
  A.tap(document.querySelector('.overlay [data-id="enter"]'));
  A.tick(80);
});
const liveCso = (page) => page.evaluate(async () => (await import('/scripts/unreal/cso-export.js')).live(window.__game));
if (FENCES) {
  const { ctx, page } = await openGame('fr');
  const off = await liveCso(page);
  await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [SCENARIOS[0], 20261118]);
  await enterCourse(page);
  const inn = await liveCso(page);
  console.log('hauteurs hors épreuve', off.heights.join(' '), '; en épreuve', inn.heights.join(' '), '; surligné', inn.highlight.join(' '));
  const r = await page.evaluate(
    async (o) => (await import('/scripts/unreal/cso-export.js')).exportCso(window.__game, o),
    { inHeights: inn.heights, liveOff: off.sig, liveIn: inn.sig, liveLines: inn.lines, liveMarker: inn.marker },
  );
  await ctx.close();
  mkdirSync(FENCES_OUT, { recursive: true });
  for (const [name, b64] of Object.entries(r.files)) writeFileSync(join(FENCES_OUT, name), Buffer.from(b64, 'base64'));
  mkdirSync(dirname(FENCES_MANIFEST), { recursive: true });
  const text = JSON.stringify(r.manifest, null, 1) + '\n';
  let prev = null;
  try {
    prev = readFileSync(FENCES_MANIFEST, 'utf8');
  } catch {}
  if (prev !== text) writeFileSync(FENCES_MANIFEST, text);
  const M = r.manifest;
  console.log(`obstacles : ${M.fences.length} obstacles, ${Object.keys(M.meshes).length} maillages uniques, ${Object.keys(M.textures).length} textures, triangles ${JSON.stringify(M.triangles)} ; manifeste ${prev === text ? 'inchangé' : 'écrit'} (${FENCES_MANIFEST}), fichiers dans ${FENCES_OUT}`);
  for (const f of M.fences) console.log(`  ${f.label} ${f.kind} : ${Object.entries(f.states).map(([k, st]) => `${k} h ${st.h} ${JSON.stringify(st.counts)}`).join(' | ')}`);
  for (const l of M.lines) console.log(`  ligne ${l.id} : ${JSON.stringify(l.counts)}`);
  console.log(`  poteau ${M.marker.activity} : ${JSON.stringify(M.marker.counts)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Gel en pause et au téléphone (tranche T8, contrôle adverse) : unreal/core/tests/oracles/cso_freeze.json, rejoué par le
// test moteur Strides.Cso.Controls. Après le départ du chrono du parcours du Pôle (entrée en piste comme « droit »), la
// séquence ci-dessous est jouée par la boucle du jeu (game.js:1406 : update seulement à l'état « play ») ; chaque image
// relève l'appel d'update, l'état du jeu, simPaused, le téléphone, le chrono et la position du cheval.
if (FREEZE) {
  const rep = (n) => Array(n).fill(null);
  const seq = [...rep(3), 'pause', ...rep(150), 'resume', ...rep(5), 'phone', ...rep(150), 'phone', ...rep(3), 'phone', ...rep(3), 'pause', ...rep(3), 'map', ...rep(2), 'map', ...rep(3), 'pause', ...rep(3), 'resume', ...rep(3)];
  const { ctx, page } = await openGame('fr');
  await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [SCENARIOS[0], 20261118]);
  const frames = await page.evaluate(([s, q]) => window.__parite.runFreeze(s, q), [SCENARIOS[0], seq]);
  await ctx.close();
  const FOUT = join(ORA, 'cso_freeze.json');
  const head = {
    schema: 'strides.oracle.cso_freeze/1',
    source: ['src/game.js', 'src/core/input.js', 'src/ui/phone.js', 'src/ui/screens.js', 'src/gameplay/courses.js'],
    generator: 'scripts/unreal/export-cso-runs.mjs --freeze',
    doc: 'Parcours du Pôle (fr), entrée en piste et cloche comme le scénario « droit », galop droit jusqu’au départ du chrono + 10 images ; puis une image par entrée, au pas fixe dt, par la boucle du jeu (game.js:1406 : update(dt) seulement à l’état « play ») : a = action versée avant l’image (pause = Échap, phone = P, map = M : appui ; resume = clic de Reprendre sur la carte Pause ; null : rien) ; upd = update appelée ; st = game.state après l’image ; sp = game.simPaused (calculé en tête d’update, non recalculé en pause) ; ph, app = téléphone ouvert et application ; t = chrono de l’épreuve (course.hud().t, arrondi au millionième) ; x, z = position du cheval (arrondie au millionième).',
    dt: 1 / 30,
  };
  const text = JSON.stringify(head, null, 1).replace(/\n}$/, ',\n "frames": [\n') + frames.map((f) => '  ' + JSON.stringify(f)).join(',\n') + '\n ]\n}\n';
  JSON.parse(text);
  let prev = null;
  try {
    prev = readFileSync(FOUT, 'utf8');
  } catch {}
  if (prev !== text) writeFileSync(FOUT, text);
  const adv = frames.filter((f, i) => i && f.t !== frames[i - 1].t).length;
  console.log(`gel : ${frames.length} images, chrono avancé à ${adv} images, ${frames.filter((f) => !f.upd).length} sans update ; ${prev === text ? 'inchangé' : 'écrit'} (${FOUT})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Poses de capture. Groupe « carriere » (tranches T1 et T5) : vue aérienne de la carrière, lignes de départ et
// d'arrivée, poteau « Chrono », dans l'état d'épreuve après la cloche (comme le scénario), puis caméra posée ; chaque
// pose relève l'état des obstacles du jeu (hauteurs, numéro surligné). Groupe « chute » (tranche T3).
// Groupe « hud » (tranche T7) : poses écrites par scripts/unreal/export-hud-style.mjs --shots, toujours gardées ici.
// Groupes « cmd » (tranche T8, écrits par export-hud-style.mjs --controls) et « aides » (tranche T9, --shots=aides) :
// gardés par les autres groupes.
// Groupe « entree » (tranche T10, --shots=entree) : présentation, plan, annonce du dossard et cloche de la recette.
// Groupe « bilan » (tranche T11, --shots=bilan) : grand message « SANS FAUTE ! » à l'arrivée et carte de bilan.
const poseGroup = (name) => (name.startsWith('robe-') ? 'robe' : name.startsWith('chute-') ? 'chute' : name.startsWith('cadrage-') ? 'cadrage' : name.startsWith('hud-') ? 'hud' : name.startsWith('cmd-') ? 'cmd' : name.startsWith('aide-') ? 'aides' : name.startsWith('entree-') ? 'entree' : name.startsWith('bilan-') ? 'bilan' : 'carriere');
if (SHOTS) {
  mkdirSync(PARITE, { recursive: true });
  const doc = { schema: 'strides.parite_poses/1', generator: 'scripts/unreal/export-cso-runs.mjs --shots', frame: 'repère web : x est, z sud, y haut (altitude absolue) ; cap h -> (sin h, cos h) ; fovV = FOV vertical (degrés) ; sunDir = direction vers le soleil ; fence (poses de chute) = barre renversée (rang, sens, côté, profondeur) et nombre d’images de Obstacles.update depuis le contact ; course (poses de la carrière) = hauteurs des obstacles du parcours dans l’ordre et numéro surligné (Obstacles.highlight, -1 : aucun) relevés dans le jeu au moment de la capture', viewport: { w: VIEW.width, h: VIEW.height }, poses: [] };
  // --shots=<groupe> : les poses existantes des autres groupes sont gardées, celles du groupe remplacées ; les poses du
  // HUD (groupe « hud », écrites par export-hud-style.mjs) sont toujours gardées.
  let priorPoses = [];
  try {
    priorPoses = JSON.parse(readFileSync(join(PARITE, 'poses.json'), 'utf8')).poses;
    doc.poses = priorPoses.filter((p) => (SHOTS_ONLY ? poseGroup(p.name) !== SHOTS_ONLY : ['hud', 'cmd', 'aides', 'entree', 'bilan'].includes(poseGroup(p.name))));
  } catch {
    doc.poses = [];
  }
  if (!SHOTS_ONLY || SHOTS_ONLY === 'carriere') {
    const { ctx, page } = await openGame('fr');
    const setup = await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [SCENARIOS[0], 20261118]);
    await enterCourse(page);
    // Repères des poses de la tranche T5, lus dans le jeu : lignes (CSO_START, CSO_FINISH), poteau de l'activité.
    const mk = await page.evaluate(async () => {
      const O = await import('/src/gameplay/obstacles.js');
      const g = window.__game;
      const def = g.activities.defs.find((a) => a.id === 'cso_train');
      const m = def.marker || { x: def.start.x + 3, z: def.start.z };
      const G = (x, z) => g.terrain.getHeight(x, z);
      const L = (l) => ({ x: l.x, z: l.z, rot: l.rot, w: l.w, y: G(l.x, l.z) });
      return { start: L(O.CSO_START), finish: L(O.CSO_FINISH), marker: { x: m.x, z: m.z, y: G(m.x, m.z) } };
    });
    // Vue d'une ligne depuis l'abord (8 m avant, 2,2 m au-dessus du sol), visée au milieu de la ligne à 0,9 m.
    const lineView = (l) => ({
      eye: [l.x - Math.sin(l.rot) * 8, l.y + 2.2, l.z - Math.cos(l.rot) * 8],
      target: [l.x, l.y + 0.9, l.z],
    });
    const POSES = [
      {
        name: 'carriere-aerienne',
        desc: 'Vue aérienne fixe de la carrière du Pôle depuis le sud, au-dessus de l’entrée, après la cloche (obstacles à 1,10 m, barres en place), 15 h, HUD masqué.',
        hour: 15,
        eye: [330, 58, -158],
        target: [330, 3, -232],
        fovV: 58,
        viewport: { w: VIEW.width, h: VIEW.height },
      },
      {
        name: 'ligne-depart',
        desc: 'Ligne de départ (CSO_START) vue depuis l’abord, 8 m avant la ligne dans son axe, œil à 2,2 m du sol, visée au milieu de la ligne à 0,9 m : poteaux, fanions, cellules sur trépied, ligne de sciure, panneau DÉPART ; après la cloche, 15 h, HUD masqué.',
        hour: 15,
        ...lineView(mk.start),
        fovV: 45,
        viewport: { w: VIEW.width, h: VIEW.height },
      },
      {
        name: 'ligne-arrivee',
        desc: 'Ligne d’arrivée (CSO_FINISH) vue depuis l’abord, 8 m avant la ligne dans son axe, œil à 2,2 m du sol, visée au milieu de la ligne à 0,9 m : poteaux, fanions, cellules sur trépied, ligne de sciure, panneau ARRIVÉE ; après la cloche, 15 h, HUD masqué.',
        hour: 15,
        ...lineView(mk.finish),
        fovV: 45,
        viewport: { w: VIEW.width, h: VIEW.height },
      },
      {
        name: 'poteau-chrono',
        desc: 'Poteau « Chrono » de l’activité Parcours du Pôle (cso_train), vu de l’entrée de la carrière (5,5 m à l’ouest, 3,5 m au sud du mât, œil à 1,7 m du sol), visée à 1,8 m au milieu du mât et du panneau, carrière en arrière-plan ; après la cloche, 15 h, HUD masqué.',
        hour: 15,
        eye: [mk.marker.x - 5.5, mk.marker.y + 1.7, mk.marker.z + 3.5],
        target: [mk.marker.x, mk.marker.y + 1.8, mk.marker.z + 0.35],
        fovV: 50,
        viewport: { w: VIEW.width, h: VIEW.height },
      },
    ];
    for (const ps of POSES) {
      const horse = setup.horse;
      const full = { ...ps, horse };
      const info = await page.evaluate((p) => window.__parite.pose(p), full);
      // Textures et tuiles chargées en asynchrone : laisser venir, puis rendre de nouveau.
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.__parite.render());
      await page.waitForTimeout(500);
      const file = join(PARITE, `${ps.name}-web.png`);
      await page.screenshot({ path: file });
      const st = await liveCso(page);
      const course = { heights: st.heights, highlight: st.highlight.length ? st.highlight[0] : -1 };
      doc.poses.push({ ...full, ...info, course, web: `unreal/docs/parite/cso/${ps.name}-web.png`, unreal: `unreal/docs/parite/cso/${ps.name}-unreal.png` });
      console.log('pose', ps.name, JSON.stringify(info), JSON.stringify(course));
    }
    await ctx.close();
  }
  // C1 (robe du cheval engagé) : cheval du joueur à l'arrêt au départ du parcours, après la cloche (comme les poses de la
  // carrière), vu de profil (côté gauche : balzane postérieure gauche de Comète), de trois quarts arrière et de trois quarts
  // avant (liste), 15 h. Chaque pose relève la robe du cheval WildMesh affiché (`coatLive` : cheval, uniformes du matériau
  // de robe et des crins, dont la robe mouillée uWet).
  if (!SHOTS_ONLY || SHOTS_ONLY === 'robe') {
    const { ctx, page } = await openGame('fr');
    const setup = await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [SCENARIOS[0], 20261118]);
    await enterCourse(page);
    const H = setup.horse;
    // Avant du cheval (sin h, cos h) ; gauche du cheval (cos h, −sin h) : x est, z sud, y haut.
    const fw = [Math.sin(H.h), Math.cos(H.h)], lt = [Math.cos(H.h), -Math.sin(H.h)];
    const gy = await page.evaluate(([x, z]) => window.__game.player.horse.groundAt(x, z), [H.x, H.z]);
    const at = (a, b, up) => [H.x + fw[0] * a + lt[0] * b, gy + up, H.z + fw[1] * a + lt[1] * b];
    const POSES = [
      { name: 'robe-profil', desc: 'Cheval du joueur (Comète) à l’arrêt au départ du parcours du Pôle après la cloche, vu de profil côté gauche (œil 6,5 m à gauche, 1,5 m au-dessus du sol), visée au centre du cheval à 1,2 m ; 15 h, HUD masqué.', eye: at(0, 6.5, 1.5), target: at(0, 0, 1.2), fovV: 40 },
      { name: 'robe-trois-quarts-arriere', desc: 'Même cheval vu de trois quarts arrière gauche (5 m derrière, 3,5 m à gauche, œil à 1,8 m), visée au centre du cheval à 1,1 m : croupe, queue, postérieurs ; 15 h, HUD masqué.', eye: at(-5, 3.5, 1.8), target: at(0, 0, 1.1), fovV: 45 },
      { name: 'robe-trois-quarts-avant', desc: 'Même cheval vu de trois quarts avant gauche (4,2 m devant, 2,6 m à gauche, œil à 1,7 m), visée 1 m devant le centre à 1,4 m : tête (liste), encolure, antérieurs ; 15 h, HUD masqué.', eye: at(4.2, 2.6, 1.7), target: at(1, 0, 1.4), fovV: 40 },
    ];
    for (const ps of POSES) {
      const full = { ...ps, hour: 15, viewport: { w: VIEW.width, h: VIEW.height }, horse: H };
      const info = await page.evaluate((p) => window.__parite.pose(p), full);
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.__parite.render());
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(PARITE, `${ps.name}-web.png`) });
      const st = await liveCso(page);
      const course = { heights: st.heights, highlight: st.highlight.length ? st.highlight[0] : -1 };
      const coatLive = await page.evaluate(() => {
        const h = window.__game.player.horse, v = h.pjl?.view;
        const U = v?.materials?.coat.userData.coatUniforms, Hc = v?.materials?.hair.userData.hairUniform;
        if (!U || !Hc) return { pjl: false, id: h.def?.id ?? null };
        const c = (x) => [x.r, x.g, x.b], q = (x) => [x.x, x.y, x.z, x.w];
        return { pjl: true, id: h.def.id, coat: c(U.uCoat.value), points: c(U.uPoints.value), pointsAmt: U.uPointsAmt.value, detail: U.uDetail.value, socks: q(U.uSocks.value), blaze: q(U.uBlaze.value), dapples: U.uDapples.value, wet: U.uWet.value, hair: c(Hc.value) };
      });
      doc.poses.push({ ...full, ...info, course, coatLive, web: `unreal/docs/parite/cso/${ps.name}-web.png`, unreal: `unreal/docs/parite/cso/${ps.name}-unreal.png` });
      console.log('pose', ps.name, JSON.stringify(info), 'robe', JSON.stringify(coatLive));
    }
    await ctx.close();
  }
  // Tranche T3 : chute de la barre du 3 touchée en montée (scénario t3-pres-montee), 0,1 / 0,3 / 0,6 / 1,5 s après le
  // contact (temps de chute f.t de obstacles.js), caméra fixe de trois quarts arrière. Le scénario tourne image par image
  // avec les mêmes appels que pour l'oracle ; les états relevés sont comparés ensuite à cso_runs/t3-pres-montee.fr.json.
  if (!SHOTS_ONLY || SHOTS_ONLY === 'chute') {
    const sc = SCENARIOS.find((x) => x.id === 't3-pres-montee');
    const { ctx, page } = await openGame('fr', true);
    await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [sc, 20261118]);
    await page.evaluate((s) => window.__parite.duringStart(s), sc);
    let knock = null;
    for (let k = 0; k < sc.maxFrames && !knock; k++) {
      const r = await page.evaluate(([kk]) => window.__parite.duringTo(kk, '3'), [k]);
      const bar = r.rails.findIndex((x) => x.fall);
      if (bar >= 0) knock = { k, bar, ...r.rails[bar].fall, fence: r.fence };
    }
    if (!knock) throw new Error('chute : aucune barre du 3 renversée');
    const F = knock.fence;
    let last = knock.k;
    for (const t of [0.1, 0.3, 0.6, 1.5]) {
      const n = Math.round(t * 30); // appels de Obstacles.update depuis le contact (le premier dans l'image du contact)
      const k = knock.k + n - 1;
      last = k;
      const r = await page.evaluate(([kk]) => window.__parite.duringTo(kk, '3'), [k]);
      const name = `chute-barre-${String(t).replace('.', '_')}s`;
      const ps = {
        name,
        desc: `Chute de la barre du vertical 3 touchée en montée (appel trop près, scénario t3-pres-montee), ${String(t).replace('.', ',')} s après le contact (image ${k}), caméra fixe de trois quarts arrière, au sud-ouest de l’obstacle, 15 h, HUD masqué.`,
        hour: 15,
        // Trois-quarts arrière gauche du cheval (le 3 est sauté vers l'est, ses barres vont du nord au sud).
        eye: [F.x - 4.5, F.ground + 1.8, F.z + 6.5],
        target: [F.x + 0.6, F.ground + 0.6, F.z],
        fovV: 45,
        viewport: { w: VIEW.width, h: VIEW.height },
        horse: { x: r.horse.x, z: r.horse.z, h: r.horse.h, jumpY: r.horse.jumpY, jumpT: r.horse.jumpT },
        fence: { label: '3', bar: knock.bar, dir: knock.dir, side: knock.side, hit: knock.hit, frames: n },
        rails: r.rails,
        frame: k,
      };
      if (Math.abs(r.rails[knock.bar].fall.t - t) > 1e-9) throw new Error(`chute : temps ${r.rails[knock.bar].fall.t} au lieu de ${t}`);
      const info = await page.evaluate((p) => window.__parite.duringView(p), ps);
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.__parite.render());
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(PARITE, `${name}-web.png`) });
      await page.evaluate(() => window.__parite.duringRestore());
      // État des obstacles à la capture (tranche T5 : hauteurs de l'épreuve, numéro surligné), relu par -StridesShots=cso.
      const st = await liveCso(page);
      const course = { heights: st.heights, highlight: st.highlight.length ? st.highlight[0] : -1 };
      doc.poses.push({ ...ps, ...info, course, web: `unreal/docs/parite/cso/${name}-web.png`, unreal: `unreal/docs/parite/cso/${name}-unreal.png` });
      console.log('pose', name, 'image', k, 'barre', JSON.stringify(r.rails[knock.bar]));
    }
    // La partie jouée pendant les captures est celle de l'oracle (états du cheval identiques image par image).
    const played = await page.evaluate(() => window.__parite.duringFrames());
    try {
      const ora = JSON.parse(readFileSync(join(OUT, runFile(sc.id, 'fr')), 'utf8'));
      const diff = played.filter((sj, i) => i <= last && (!ora.frames[i] || JSON.stringify(ora.frames[i].ch.s) !== sj)).length;
      console.log(`chute : ${played.length} images jouées, ${diff} différentes de l’oracle ${sc.id}`);
      if (diff) throw new Error('chute : partie différente de l’oracle');
    } catch (e) {
      if (e.message.startsWith('chute')) throw e;
      console.log('chute : oracle illisible, comparaison non faite', e.message);
    }
    await ctx.close();
  }
  // Tranche T6 : caméra de concours aux instants de tests/e2e/cso-framing.mjs (scénario « cadrage », marks), vue de la
  // caméra du jeu à la fin de l'image (œil, point visé, FOV vertical appliqué), HUD masqué. Côté Unreal (camRun), la
  // caméra n'est pas posée : le jeu la recalcule en rejouant l'exécution de l'oracle jusqu'à cette image.
  if (!SHOTS_ONLY || SHOTS_ONLY === 'cadrage') {
    const sc = SCENARIOS.find((x) => x.id === 'cadrage');
    const { ctx, page } = await openGame('fr', !!sc.classic);
    await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [sc, 20261118]);
    await page.evaluate((s) => window.__parite.duringStart(s), sc);
    let last = 0;
    for (const k of sc.framing.marks) {
      const r = await page.evaluate(([kk]) => window.__parite.duringCam(kk), [k]);
      last = k;
      const name = `cadrage-${String(k).padStart(3, '0')}`;
      const ps = {
        name,
        desc: `Caméra de concours à l’image ${k} du scénario « cadrage » (tests/e2e/cso-framing.mjs : parcours suivi au pilote des tests depuis 3 m avant la ligne de départ${r.fr.jump ? ', cheval en l’air' : ''}), vue de la caméra du jeu (œil, point visé, FOV vertical appliqué), 15 h, HUD masqué ; couple sur ${(r.fr.part * 100).toFixed(1).replace('.', ',')} % de la hauteur de l’écran.`,
        hour: 15,
        eye: r.eye,
        target: r.look,
        fovV: r.fov,
        viewport: { w: VIEW.width, h: VIEW.height },
        horse: r.horse,
        frame: k,
        camRun: { file: `unreal/core/tests/oracles/cso_runs/${runFile(sc.id, 'fr')}`, frame: k },
        framing: { source: sc.framing.source, pts: sc.framing.pts, part: r.fr.part, top: r.fr.top, bottom: r.fr.bottom, jump: r.fr.jump, ys: r.fr.ys },
      };
      const info = await page.evaluate((p) => window.__parite.duringView(p), ps);
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.__parite.render());
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(PARITE, `${name}-web.png`) });
      await page.evaluate(() => window.__parite.duringRestore());
      const st = await liveCso(page);
      const course = { heights: st.heights, highlight: st.highlight.length ? st.highlight[0] : -1 };
      doc.poses.push({ ...ps, ...info, course, web: `unreal/docs/parite/cso/${name}-web.png`, unreal: `unreal/docs/parite/cso/${name}-unreal.png` });
      console.log('pose', name, 'image', k, `couple ${(r.fr.part * 100).toFixed(1)} % (haut ${r.fr.top.toFixed(3)}, bas ${r.fr.bottom.toFixed(3)})${r.fr.jump ? ' en l’air' : ''}`);
    }
    // La partie jouée pendant les captures est celle de l'oracle (cheval, caméra, snap identiques image par image).
    const played = await page.evaluate(() => window.__parite.duringCamFrames());
    try {
      const ora = JSON.parse(readFileSync(join(OUT, runFile(sc.id, 'fr')), 'utf8'));
      const diff = played.filter((sj, i) => i <= last && (!ora.frames[i] || JSON.stringify([ora.frames[i].ch.s, ora.frames[i].cc ?? null, ora.frames[i].ccp ?? null]) !== sj)).length;
      console.log(`cadrage : ${played.length} images jouées, ${diff} différentes de l’oracle ${sc.id}`);
      if (diff) throw new Error('cadrage : partie différente de l’oracle');
    } catch (e) {
      if (e.message.startsWith('cadrage')) throw e;
      console.log('cadrage : oracle illisible, comparaison non faite', e.message);
    }
    await ctx.close();
  }
  // Tranche T9 : aides à l'appel, en partie réelle (exécutions t9-* de l'oracle arrêtées à l'image choisie), HUD affiché,
  // 844 × 390 et 667 × 308. Une page par capture (partie rejouée depuis le début, temporisations de hud.js virtuelles) ;
  // le canal « ai » de l'image est comparé à l'oracle.
  if (SHOTS_ONLY === 'aides') {
    // Volte entre le 1 et le 2 (tracé en courbe, hors de l'axe de la caméra) : première image au sol, obstacle suivant le
    // 2, où le cap du cheval s'écarte de 60° au plus de la direction du 2 (l'écart passe de 75 à 90° après la réception
    // du 1, puis se referme).
    const inTurn = (b, k, frames) => {
      const f = frames[k], c = f.ai?.c;
      if (!c || c.in.n !== 1 || f.horse.jumpT >= 0) return false;
      let ob = null;
      for (let i = k; i >= 0 && !ob; i--) ob = frames[i].ai?.ob ?? null;
      const o = ob[1], h = f.horse;
      const a = Math.atan2(o.x - h.x, o.z - h.z) - h.h;
      return Math.abs((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) <= Math.PI / 3;
    };
    const AIDE = [
      // Contrôle adverse de T9 : captures de la recette (tests/e2e/out/cso/*.png, faites par tests/e2e/cso-shots.mjs) en
      // 844 × 390, rejouées par l'exécution t9-recette de l'oracle ; en 667 × 308, capture de l'exécution de l'oracle.
      { name: 'aide-4-trop-loin', run: 't9-recette', recette: '4-abord-trop-loin', desc: 'capture 4-abord-trop-loin de la recette (tests/e2e/cso-shots.mjs:36-58 : état forcé, 2 abordé depuis 16 m à 6,6 m/s, arrêt quand la première barre passe sous 7,5 + 0,6 m) : bouton « Trop loin », zone d’appel au sol, tracé, repère' },
      { name: 'aide-5-bonne-zone', run: 't9-recette', recette: '5-abord-bonne-zone', desc: 'capture 5-abord-bonne-zone de la recette (même état forcé, arrêt quand la première barre passe sous 1,7 + 0,6 m) : bouton « Trop loin » (le jeu web n’y affiche pas « Saute ! »), zone d’appel au sol sous le cheval, repère' },
      { name: 'aide-saute', run: 't9-appel', desc: 'abord du 2 : première image où le bouton affiche « Saute ! » (bonne zone)', pick: (b) => b.to === 1 && b.st === 'good' },
      { name: 'aide-trop-pres', run: 't9-appel', desc: 'abord du 3 : première image où le bouton affiche « Trop près »', pick: (b) => b.to === 2 && b.st === 'near' },
      { name: 'aide-trop-tot', run: 't9-appel', desc: 'abord du 1 : sixième image après l’appui SAUT à 10 m (bien trop tôt) : bouton « Trop tôt »', pick: (b, k, frames) => b.cl.includes('early') && frames[k - 5]?.ai?.b?.cl.includes('early') && !frames[k - 6]?.ai?.b?.cl.includes('early') },
      { name: 'aide-bouton', run: 't9-aide-bouton', desc: 'aide « bouton seul » : abord du 2, première image en bonne zone (bouton « Saute ! », pas de zone au sol)', pick: (b) => b.to === 1 && b.st === 'good' },
      { name: 'aide-off', run: 't9-aide-off', desc: 'aide coupée : abord du 2, première barre à 5 m ou moins (bouton « Saut » sans couleur, pas de zone au sol, tracé et repère gardés)', pick: (b) => b.to === 1 && b.tx !== null && b.tx <= 5 },
      { name: 'aide-trace', run: 't9-parcours', desc: 'tracé au sol affiché : volte entre le 1 et le 2, première image où le cap s’écarte de 60° au plus de la direction du 2 ; tirets du tracé en courbe devant le cheval jusqu’au 2, repère au-dessus du 2 (zone d’appel au-delà de 26 m)', pick: inTurn },
      { name: 'aide-sans-trace', run: 't9-courbe', pair: 'aide-trace', desc: 'tracé au sol masqué (courseLine false) : même image que aide-trace (mêmes gestes jusque-là, cheval au même endroit), repère et bouton gardés, aucun tiret', pick: inTurn },
      { name: 'aide-ambre', run: 't9-ambre', desc: 'abord lent du 8 (4,6 m/s, zone calculée à 5,5 m/s) : bande ambre sans bande verte, première barre à 11 m ou moins', pick: (b, k, frames) => b.to === 9 && b.tx !== null && b.tx <= 11 && frames[k].ai?.c?.out?.ok[0] && !frames[k].ai.c.out.gd[0] },
    ];
    // --poses=nom1,nom2 : seulement ces poses (les autres poses aide-* de poses.json sont gardées).
    const AIDE_ONLY = (process.argv.find((a) => a.startsWith('--poses=')) || '').slice(8).split(',').filter(Boolean);
    const VIEWS = [{ width: 844, height: 390 }, { width: 667, height: 308 }];
    const shots = [];
    const picked = {};
    for (const A of AIDE) {
      const sc = { ...SCENARIOS.find((x) => x.id === A.run), virtualHud: true };
      const ora = JSON.parse(readFileSync(join(OUT, runFile(sc.id, 'fr')), 'utf8'));
      const k = A.recette ? ora.setup.recette.shots.find((s) => s.name === A.recette).frame : ora.frames.findIndex((f, i) => f.ai?.b && A.pick(f.ai.b, i, ora.frames));
      if (k < 0) throw new Error(`${A.name} : image introuvable dans ${sc.id}`);
      picked[A.name] = { k, ora };
      // Paire tracé affiché / masqué : même image, mêmes entrées des aides (cheval, obstacle suivant), tracé seul changé.
      if (A.pair) {
        const P0 = picked[A.pair];
        const strip = (f) => JSON.stringify({ ...f.ai.c.in, sl: null });
        if (!P0 || P0.k !== k || strip(P0.ora.frames[k]) !== strip(ora.frames[k]) || ora.frames.slice(0, k + 1).some((f, i) => JSON.stringify(f.in) !== JSON.stringify(P0.ora.frames[i].in)))
          throw new Error(`${A.name} : image ou état différent de ${A.pair}`);
        console.log(`${A.name} : image ${k}, mêmes entrées que ${A.pair} sur les ${k + 1} premières images, tracé seul changé`);
      }
      if (AIDE_ONLY.length && !AIDE_ONLY.includes(A.name)) continue;
      for (const v of VIEWS) {
        const vk = `${v.width}x${v.height}`;
        const ctx = await browser.newContext({ viewport: v, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(`fr: ${e.message}`));
        await page.goto(`${BASE}/?autostart&quality=high&lang=fr`, { timeout: 180000 });
        await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
        await page.addScriptTag({ content: AUTOPILOT });
        await page.addScriptTag({ content: `(${PAGE.toString()})();` });
        await page.evaluate((o) => window.__parite.install(o), { audioIgnored: AUDIO_IGNORED, hudMethods: HUD_METHODS, hudDedupe: HUD_DEDUPE });
        await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [sc, 20261118]);
        await page.evaluate((kk) => (window.__parite.stopAfter = kk), k);
        try {
          if (sc.type === 'recette') await page.evaluate((s) => window.__parite.runRecette(s), sc);
          else await page.evaluate((s) => window.__parite.runT4(s), sc);
          throw new Error(`${A.name} : partie terminée avant l’image ${k}`);
        } catch (e) {
          if (!String(e.message).includes('STOP')) throw e;
        }
        // (t9-recette : pause de la capture du test, hw de l'image, avant le relevé du HUD)
        const r = await page.evaluate(([kk, hw]) => window.__parite.aideView(kk, hw), [k, ora.frames[k].hw ?? 0]);
        if (r.ai !== JSON.stringify(ora.frames[k].ai)) throw new Error(`${A.name} ${vk} : canal « ai » de l’image ${k} différent de l’oracle`);
        await page.waitForTimeout(3000);
        await page.evaluate(() => window.__parite.render());
        await page.waitForTimeout(500);
        const name = `${A.name}-${vk}`;
        // Recette en 844 × 390 : la capture de l'exécution de l'oracle est gardée à côté (-oracle.png) et comparée au PNG
        // de la recette, qui devient la capture web du montage (copie octet pour octet, empreinte notée).
        const RECETTE_PNG = A.recette && v.width === 844 && v.height === 390 ? join(ROOT, `tests/e2e/out/cso/${A.recette}.png`) : null;
        await page.screenshot({ path: join(PARITE, RECETTE_PNG ? `${name}-oracle.png` : `${name}-web.png`) });
        let recette = null;
        if (RECETTE_PNG) {
          const png = readFileSync(RECETTE_PNG);
          writeFileSync(join(PARITE, `${name}-web.png`), png);
          recette = { png: `tests/e2e/out/cso/${A.recette}.png`, sha256: createHash('sha256').update(png).digest('hex'), oracle: `unreal/docs/parite/cso/${name}-oracle.png`, ecart: pngDiff(join(PARITE, `${name}-oracle.png`), RECETTE_PNG, v) };
          console.log(`${name} : capture de l’oracle / PNG de la recette : écart moyen ${recette.ecart.mean} (sur 255), ${recette.ecart.over16} % des pixels au-delà de 16`);
        }
        const st = await liveCso(page);
        const file = `unreal/core/tests/oracles/cso_runs/${runFile(sc.id, 'fr')}`;
        shots.push({
          name, desc: recette
            ? `Aides à l’appel (tranche T9), ${A.desc} ; capture web = PNG de la recette (${recette.png}) ; état rejoué par l’exécution ${sc.id} de l’oracle arrêtée à l’image ${k} (capture de cette exécution : ${name}-oracle.png) ; caméra de concours du jeu à cette image, HUD affiché ; ${v.width} × ${v.height}.`
            : `Aides à l’appel (tranche T9), partie réelle ${sc.id} arrêtée à l’image ${k} : ${A.desc} ; caméra de concours du jeu à cette image, HUD affiché ; ${v.width} × ${v.height}.`,
          hour: r.hour, eye: r.eye, target: r.target, fovV: r.fovV, viewport: { w: v.width, h: v.height }, horse: r.horse, sunDir: r.sunDir, day: r.day, canvas: r.canvas,
          course: { heights: st.heights, highlight: st.highlight.length ? st.highlight[0] : -1 },
          hud: { run: file, frame: k }, aids: { run: file, frame: k }, state: r.state, frame: k,
          ...(recette ? { recette } : {}),
          web: `unreal/docs/parite/cso/${name}-web.png`, unreal: `unreal/docs/parite/cso/${name}-unreal.png`,
        });
        console.log('pose', name, 'image', k, 'bouton', JSON.stringify(r.state.jump), 'astuce', JSON.stringify(r.state.hi[0]), 'grand message', JSON.stringify(r.state.bg[0]), 'big-on', JSON.stringify(r.state.bg[3]), 'temporisations virtuelles', r.virtual);
        await ctx.close();
      }
    }
    // Poses des autres groupes gardées à leur place ; aides à la fin, dans l'ordre de AIDE (poses non refaites gardées).
    const oldAide = new Map(priorPoses.filter((p) => poseGroup(p.name) === 'aides').map((p) => [p.name, p]));
    const fresh = new Map(shots.map((p) => [p.name, p]));
    const ordered = AIDE.flatMap((A) => VIEWS.map((v) => `${A.name}-${v.width}x${v.height}`)).map((n) => fresh.get(n) || oldAide.get(n));
    if (ordered.some((p) => !p)) throw new Error(`poses d’aides absentes : ${AIDE.flatMap((A) => VIEWS.map((v) => `${A.name}-${v.width}x${v.height}`)).filter((n) => !fresh.get(n) && !oldAide.get(n)).join(' ')}`);
    doc.poses = doc.poses.filter((p) => poseGroup(p.name) !== 'aides').concat(ordered);
    writeFileSync(join(PARITE, 'poses.json'), JSON.stringify(doc, null, 1) + '\n');
    console.log('poses :', join(PARITE, 'poses.json'), shots.length, 'poses d’aides refaites,', ordered.length, 'en tout');
  }
  // Tranche T10 : entrée dans l'épreuve, en partie réelle (exécution t9-recette = tests/e2e/cso-shots.mjs au pas fixe,
  // arrêtée à l'image de chaque capture), HUD et cartes affichés, 844 × 390 et 667 × 308. Captures de la recette
  // 1-presentation, 2-plan, 3-cloche (PNG de tests/e2e/out/cso/ en 844 × 390, comme T9) ; annonce « N° {dossard} » à la
  // 28e image après « Entrer en piste » (tick(28) de tests/e2e/cso.mjs:62, sans capture de la recette : capture de
  // l'exécution). Une page par capture ; gestes du test entre deux images (plan touché, pauses des captures sur
  // l'horloge virtuelle du HUD) ; carte relevée dans le DOM (kicker, titre, grille, règles, légende, textes du plan,
  // boutons) ; canal « ai » de l'image comparé à l'oracle.
  else if (SHOTS_ONLY === 'entree') {
    const sc = { ...SCENARIOS.find((x) => x.id === 't9-recette'), virtualHud: true };
    const ora = JSON.parse(readFileSync(join(OUT, runFile(sc.id, 'fr')), 'utf8'));
    const R = ora.setup.recette;
    const pauseTicks = Math.round((R.wait + R.captureMs) * 3);
    // Images relues dans l'oracle : dernière image avant les boutons (pauses des captures 1 et 2), image d'« Entrer en
    // piste », image de la capture 3 (post images après l'entrée).
    const kEnter = ora.frames.findIndex((f) => f.in.ui === 'enter');
    const kPres = kEnter - 1, kBell = kEnter + R.post - 1, kBib = kEnter + 27;
    if (kEnter !== R.pre || ora.frames[kPres].hw !== 2 * pauseTicks || ora.frames[kBell].hw !== pauseTicks || JSON.stringify(ora.frames[kEnter].in.taps) !== JSON.stringify(R.taps.slice(0, -1)))
      throw new Error(`entree : gestes de la recette différents de l’oracle (entrée ${kEnter}, pauses ${ora.frames[kPres].hw} / ${ora.frames[kBell]?.hw})`);
    const ENTREE = [
      { name: 'entree-1-presentation', k: kPres, recette: '1-presentation', steps: [{ tick: pauseTicks }], hw: pauseTicks, desc: `capture 1-presentation de la recette (tests/e2e/cso-shots.mjs:18-30 : cheval monté posé 4 m au sud de l’entrée, cap π, Parcours du Pôle lancé au poteau, 6 images) : carte de présentation` },
      { name: 'entree-2-plan', k: kPres, recette: '2-plan', steps: [{ tick: pauseTicks }, { tap: 'plan' }, { tick: pauseTicks }], hw: 2 * pauseTicks, desc: `capture 2-plan de la recette (cso-shots.mjs:31-32 : « Voir le plan » touché après la capture 1) : carte du plan` },
      { name: 'entree-3-annonce', k: kBib, steps: [], hw: 0, desc: `annonce du couple « N° {dossard} · {joueur} » : 28e image après « Entrer en piste » (tick(28) de tests/e2e/cso.mjs:58-63 ; la recette n’en fait pas de capture)` },
      { name: 'entree-4-cloche', k: kBell, recette: '3-cloche', steps: [{ tick: pauseTicks }], hw: pauseTicks, desc: `capture 3-cloche de la recette (cso-shots.mjs:33-34 : « Retour », « Entrer en piste », 80 images)` },
    ];
    const ONLY = (process.argv.find((a) => a.startsWith('--poses=')) || '').slice(8).split(',').filter(Boolean);
    const VIEWS = [{ width: 844, height: 390 }, { width: 667, height: 308 }];
    const shots = [];
    for (const E of ENTREE) {
      if (ONLY.length && !ONLY.includes(E.name)) continue;
      for (const v of VIEWS) {
        const vk = `${v.width}x${v.height}`;
        const ctx = await browser.newContext({ viewport: v, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(`fr: ${e.message}`));
        await page.goto(`${BASE}/?autostart&quality=high&lang=fr`, { timeout: 180000 });
        await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
        await page.addScriptTag({ content: AUTOPILOT });
        await page.addScriptTag({ content: `(${PAGE.toString()})();` });
        await page.evaluate((o) => window.__parite.install(o), { audioIgnored: AUDIO_IGNORED, hudMethods: HUD_METHODS, hudDedupe: HUD_DEDUPE });
        await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [sc, 20261118]);
        await page.evaluate((kk) => (window.__parite.stopAfter = kk), E.k);
        try {
          await page.evaluate((s) => window.__parite.runRecette(s), sc);
          throw new Error(`${E.name} : partie terminée avant l’image ${E.k}`);
        } catch (e) {
          if (!String(e.message).includes('STOP')) throw e;
        }
        const r = await page.evaluate(([kk, st]) => window.__parite.entreeView(kk, st), [E.k, E.steps]);
        if (r.ai !== JSON.stringify(ora.frames[E.k].ai)) throw new Error(`${E.name} ${vk} : canal « ai » de l’image ${E.k} différent de l’oracle`);
        await page.waitForTimeout(3000);
        await page.evaluate(() => window.__parite.render());
        await page.waitForTimeout(500);
        const name = `${E.name}-${vk}`;
        const RECETTE_PNG = E.recette && v.width === 844 && v.height === 390 ? join(ROOT, `tests/e2e/out/cso/${E.recette}.png`) : null;
        await page.screenshot({ path: join(PARITE, RECETTE_PNG ? `${name}-oracle.png` : `${name}-web.png`) });
        let recette = null;
        if (RECETTE_PNG) {
          const png = readFileSync(RECETTE_PNG);
          writeFileSync(join(PARITE, `${name}-web.png`), png);
          recette = { png: `tests/e2e/out/cso/${E.recette}.png`, sha256: createHash('sha256').update(png).digest('hex'), oracle: `unreal/docs/parite/cso/${name}-oracle.png`, ecart: pngDiff(join(PARITE, `${name}-oracle.png`), RECETTE_PNG, v) };
          console.log(`${name} : capture de l’oracle / PNG de la recette : écart moyen ${recette.ecart.mean} (sur 255), ${recette.ecart.over16} % des pixels au-delà de 16`);
        }
        const st = await liveCso(page);
        const file = `unreal/core/tests/oracles/cso_runs/${runFile(sc.id, 'fr')}`;
        shots.push({
          name, desc: recette
            ? `Entrée dans l’épreuve (tranche T10), ${E.desc} ; capture web = PNG de la recette (${recette.png}) ; état rejoué par l’exécution ${sc.id} de l’oracle arrêtée à l’image ${E.k} (capture de cette exécution : ${name}-oracle.png) ; vue de la caméra du jeu, HUD et carte affichés ; ${v.width} × ${v.height}.`
            : `Entrée dans l’épreuve (tranche T10), partie réelle ${sc.id} arrêtée à l’image ${E.k} : ${E.desc} ; vue de la caméra du jeu, HUD et carte affichés ; ${v.width} × ${v.height}.`,
          hour: r.hour, eye: r.eye, target: r.target, fovV: r.fovV, viewport: { w: v.width, h: v.height }, horse: r.horse, sunDir: r.sunDir, day: r.day, canvas: r.canvas,
          course: { heights: st.heights, highlight: st.highlight.length ? st.highlight[0] : -1 },
          hud: { run: file, frame: E.k, hw: E.hw }, aids: { run: file, frame: E.k }, state: r.state, frame: E.k,
          entree: { screen: r.card ? r.card.screen : null, steps: E.steps, card: r.card, dialog: r.dialog, setup: { playerName: ora.setup.playerName, horseName: ora.setup.horseName, horseId: ora.setup.horseId, lang: 'fr' } },
          ...(recette ? { recette } : {}),
          web: `unreal/docs/parite/cso/${name}-web.png`, unreal: `unreal/docs/parite/cso/${name}-unreal.png`,
        });
        console.log('pose', name, 'image', E.k, 'carte', JSON.stringify(r.card && [r.card.screen, r.card.kicker, r.card.buttons]), 'grand message', JSON.stringify(r.state.bg), 'temporisations virtuelles', r.virtual);
        await ctx.close();
      }
    }
    const oldE = new Map(priorPoses.filter((p) => poseGroup(p.name) === 'entree').map((p) => [p.name, p]));
    const fresh = new Map(shots.map((p) => [p.name, p]));
    const names = ENTREE.flatMap((E) => VIEWS.map((v) => `${E.name}-${v.width}x${v.height}`));
    const ordered = names.map((n) => fresh.get(n) || oldE.get(n));
    if (ordered.some((p) => !p)) throw new Error(`poses de l’entrée absentes : ${names.filter((n) => !fresh.get(n) && !oldE.get(n)).join(' ')}`);
    doc.poses = doc.poses.filter((p) => poseGroup(p.name) !== 'entree').concat(ordered);
    writeFileSync(join(PARITE, 'poses.json'), JSON.stringify(doc, null, 1) + '\n');
    console.log('poses :', join(PARITE, 'poses.json'), shots.length, 'poses de l’entrée refaites,', ordered.length, 'en tout');
  }
  // Ordre stable : poses de la carrière, de la chute, du cadrage, puis du HUD.
  // Tranche T11 : arrivée et bilan en partie réelle (exécution t9-parcours de l'oracle : parcours complet sans faute, au
  // pas fixe), arrêtée à l'image choisie ; HUD (grand message « SANS FAUTE ! ») et carte de bilan affichés, 844 × 390 et
  // 667 × 308. Carte relevée dans le DOM (kicker, titre, grille, tableau, boutons) ; canal « ai » de l'image comparé.
  else if (SHOTS_ONLY === 'bilan') {
    const t9 = { ...SCENARIOS.find((x) => x.id === 't9-parcours'), virtualHud: true };
    const ora = JSON.parse(readFileSync(join(OUT, runFile(t9.id, 'fr')), 'utf8'));
    const kBig = ora.frames.findIndex((f) => f.hud.some((c) => c.fn === 'big' && c.args[0] === 'SANS FAUTE !'));
    const kCard = ora.frames.findIndex((f) => f.bl);
    if (kBig < 0 || kCard < 0) throw new Error('bilan : arrivée « SANS FAUTE ! » ou bilan absent de t9-parcours');
    // Contrôle adverse de T11 : bilan de t11-trois-barres (fautes sur deux lignes, joueur 14e : 9 lignes au tableau),
    // corps en haut puis défilé jusqu'en bas (ligne du joueur, ombre de la barre d'actions retirée).
    const tb = { ...SCENARIOS.find((x) => x.id === 't11-trois-barres'), virtualHud: true };
    const oraTb = JSON.parse(readFileSync(join(OUT, runFile(tb.id, 'fr')), 'utf8'));
    const kCardTb = oraTb.frames.findIndex((f) => f.bl);
    if (kCardTb < 0) throw new Error('bilan absent de t11-trois-barres');
    const BILAN = [
      { name: 'bilan-1-sans-faute', sc: t9, ora, k: kBig + 15, card: false, desc: `arrivée sans faute : 15e image après le grand message « SANS FAUTE ! » (courses.js:344, image ${kBig}), sous-titre du chrono, tableau` },
      { name: 'bilan-2-carte', sc: t9, ora, k: kCard + 3, card: true, kc: kCard, desc: `carte de bilan (courses.js:414-423, ouverte à l’image ${kCard} après la sortie de piste) : kicker, titre « ${ora.frames[kCard].bl.title} », grille, classement simulé (8 premiers et le joueur), boutons Recommencer, S’entraîner, Quitter l’épreuve` },
      { name: 'bilan-3-trois-barres', sc: tb, ora: oraTb, k: kCardTb + 3, card: true, kc: kCardTb, desc: `carte de bilan d’une manche à trois barres (ouverte à l’image ${kCardTb}) : titre « ${oraTb.frames[kCardTb].bl.title} », fautes sur deux lignes (lignes suivantes décalées), corps en haut` },
      { name: 'bilan-4-trois-barres-bas', sc: tb, ora: oraTb, k: kCardTb + 3, card: true, kc: kCardTb, scroll: 'end', desc: `même carte, corps défilé jusqu’en bas : 9e ligne du tableau (le joueur, « ${oraTb.frames[kCardTb].bl.title} », sous les 8 premiers), ombre de la barre d’actions retirée (classe more)` },
    ];
    const VIEWS = [{ width: 844, height: 390 }, { width: 667, height: 308 }];
    const shots = [];
    for (const B of BILAN) {
      const sc = B.sc;
      const file = `unreal/core/tests/oracles/cso_runs/${runFile(sc.id, 'fr')}`;
      for (const v of VIEWS) {
        const vk = `${v.width}x${v.height}`;
        const ctx = await browser.newContext({ viewport: v, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(`fr: ${e.message}`));
        await page.goto(`${BASE}/?autostart&quality=high&lang=fr${sc.classic ? '&classic' : ''}`, { timeout: 180000 });
        await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
        await page.addScriptTag({ content: AUTOPILOT });
        await page.addScriptTag({ content: `(${PAGE.toString()})();` });
        await page.evaluate((o) => window.__parite.install(o), { audioIgnored: AUDIO_IGNORED, hudMethods: HUD_METHODS, hudDedupe: HUD_DEDUPE });
        await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [sc, 20261118]);
        await page.evaluate((kk) => (window.__parite.stopAfter = kk), B.k);
        try {
          await page.evaluate((s) => window.__parite.runT4(s), sc);
          throw new Error(`${B.name} : partie terminée avant l’image ${B.k}`);
        } catch (e) {
          if (!String(e.message).includes('STOP')) throw e;
        }
        const r = await page.evaluate((kk) => {
          const o = window.__parite.aideView(kk, 0);
          const ov = document.querySelector('.overlay [data-id="cso-retry"]')?.closest('.overlay');
          o.card = ov ? window.__parite.bilanDom(ov) : null;
          return o;
        }, B.k);
        if (r.ai !== JSON.stringify(B.ora.frames[B.k].ai)) throw new Error(`${B.name} ${vk} : canal « ai » de l’image ${B.k} différent de l’oracle`);
        if (!!r.card !== B.card || (B.card && JSON.stringify(r.card) !== JSON.stringify(B.ora.frames[B.kc].bl))) throw new Error(`${B.name} ${vk} : carte de bilan absente ou différente du canal « bl » de l’oracle : ${JSON.stringify(r.card).slice(0, 400)} / ${JSON.stringify(B.ora.frames[B.kc].bl).slice(0, 400)}`);
        await page.waitForTimeout(3000);
        // Mise en page relevée après l'animation d'ouverture de la carte (échelle et translation de l'overlay finies),
        // corps en haut ; puis corps défilé jusqu'en bas (pose « bas ») : scrollTop maximal, classe more relevée après
        // l'événement scroll.
        if (B.card) {
          r.layout = await page.evaluate(async (end) => {
            const ov = document.querySelector('.overlay [data-id="cso-retry"]')?.closest('.overlay');
            const lay = window.__parite.bilanLayout(ov);
            const body = ov.querySelector('.card-body');
            if (end) body.scrollTop = body.scrollHeight;
            await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
            return { ...lay, scrollTop: body.scrollTop, moreAfter: ov.querySelector('.card-actions').classList.contains('more') };
          }, B.scroll === 'end');
        }
        await page.evaluate(() => window.__parite.render());
        await page.waitForTimeout(500);
        const name = `${B.name}-${vk}`;
        await page.screenshot({ path: join(PARITE, `${name}-web.png`) });
        const st = await liveCso(page);
        shots.push({
          name, desc: `Arrivée et bilan (tranche T11), partie réelle ${sc.id} arrêtée à l’image ${B.k} : ${B.desc} ; vue de la caméra du jeu, HUD${B.card ? ' et carte' : ''} affichés ; ${v.width} × ${v.height}.`,
          hour: r.hour, eye: r.eye, target: r.target, fovV: r.fovV, viewport: { w: v.width, h: v.height }, horse: r.horse, sunDir: r.sunDir, day: r.day, canvas: r.canvas,
          course: { heights: st.heights, highlight: st.highlight.length ? st.highlight[0] : -1 },
          hud: { run: file, frame: B.k }, ...(B.card ? { bilan: { run: file, frame: B.k, card: r.card, layout: r.layout, ...(B.scroll ? { scroll: B.scroll } : {}) } } : { aids: { run: file, frame: B.k } }), state: r.state, frame: B.k,
          web: `unreal/docs/parite/cso/${name}-web.png`, unreal: `unreal/docs/parite/cso/${name}-unreal.png`,
        });
        console.log('pose', name, 'image', B.k, 'grand message', JSON.stringify(r.state.bg), 'carte', JSON.stringify(r.card && [r.card.kicker, r.card.title]), r.layout ? `corps ${r.layout.body.scrollHeight} px, défilé ${r.layout.scrollTop}, more ${r.layout.more} → ${r.layout.moreAfter}` : '');
        await ctx.close();
      }
    }
    doc.poses = doc.poses.filter((p) => poseGroup(p.name) !== 'bilan').concat(shots);
    writeFileSync(join(PARITE, 'poses.json'), JSON.stringify(doc, null, 1) + '\n');
    console.log('poses :', join(PARITE, 'poses.json'), shots.length, 'poses du bilan');
  }
  else doc.poses = ['carriere', 'robe', 'chute', 'cadrage', 'hud', 'cmd', 'aides', 'entree', 'bilan'].flatMap((gr) => doc.poses.filter((p) => poseGroup(p.name) === gr));
  if (SHOTS_ONLY !== 'aides' && SHOTS_ONLY !== 'entree' && SHOTS_ONLY !== 'bilan') {
    writeFileSync(join(PARITE, 'poses.json'), JSON.stringify(doc, null, 1) + '\n');
    console.log('poses :', join(PARITE, 'poses.json'));
  }
}
if (errors.length) console.log('erreurs de page :', errors.slice(0, 5));
await browser.close();
