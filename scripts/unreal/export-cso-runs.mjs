// Banc de parité CSO : oracles de scénario et captures jumelles, exportés du jeu web EN COURS D'EXÉCUTION (ce qui
// n'existe qu'au runtime : classes Obstacles, FollowCamera, HUD, audio, bus). Le jeu web est la spécification ; ce
// script ne modifie rien dans src/ ni tests/ : il pilote la page par l'API du jeu et le pilote injecté
// tests/e2e/autopilot.js (lu, jamais modifié), au pas fixe de 1/30 s.
//
// Sorties :
//  - unreal/core/tests/oracles/cso_runs.json : scénarios rejoués image par image. Pour chaque scénario et chaque langue
//    (fr puis en) : entrées appliquées à chaque image (joystick virtuel move x / y, touches clavier, actions maintenues,
//    appui SAUT, bouton d'interface touché), puis l'état après l'image : cheval, épreuve, tableau de chrono, événements
//    du bus, appels hud.* et audio.* (nom, arguments), caméra (œil, cible, direction, FOV vertical), barres déplacées.
//    Déterministe : hasard du navigateur remplacé par un générateur à graine, horloges virtuelles (performance.now,
//    Date.now avancent de 1/30 s par image), temps de jeu fixés. Deux exécutions donnent un fichier identique octet pour
//    octet (critère T1 de unreal/docs/parite/cso-ecarts.md).
//    Canal « ch » (tranche T2, cheval de concours) : état complet du cheval en pleine précision, rejoué par
//    unreal/core/tests/test_core.cpp (testHorseRuns). Canal « ep » (tranche T4, déroulé d'épreuve) : entrées de la
//    mission (Run.update) rejouées par testCsoRuns ; scénarios t4-* en français et en anglais, images « légères ».
//  - unreal/core/tests/oracles/cso_target.json : grille de visée (obstacles.target / timing du jeu) pour 11 220 poses,
//    appuis SAUT (Horse.startJump) et refus décidés (Obstacles.refuse) sur des poses du cheval.
//    --only=id1,id2 : seulement ces scénarios (et « target » pour la grille), à écrire ailleurs avec --out.
//  - avec --shots : unreal/docs/parite/cso/poses.json (pose du cheval, œil, cible, FOV vertical, soleil, viewport) et la
//    capture web de chaque pose (unreal/docs/parite/cso/<pose>-web.png, 844 × 390, deviceScaleFactor 1) ; la capture
//    Unreal jumelle est faite par -StridesShots=cso, le montage par scripts/unreal/parite-montage.py.
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5173 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs [--shots] [--out=fichier.json]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
// --shots : toutes les poses de capture ; --shots=chute : seulement la chute de barre (tranche T3), ajoutée à poses.json.
const SHOTS_ARG = process.argv.find((a) => a === '--shots' || a.startsWith('--shots='));
const SHOTS = !!SHOTS_ARG;
const SHOTS_ONLY = SHOTS_ARG && SHOTS_ARG.includes('=') ? SHOTS_ARG.slice(8) : null;
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || join(ROOT, 'unreal/core/tests/oracles/cso_runs.json');
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
    desc: 'Abord droit du vertical 6A à 6,2 m/s sans appui : refus décidé à l’abord, freinage jusqu’à l’arrêt, nez dans l’obstacle (barre emportée vers le cheval, garde-fou du nez), cabré 1,1 s, refus compté à l’arrêt ; jusqu’à la fin du cabré et de la chute.' },
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
];

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
    return rec;
  };
  const apply = (inp) => {
    const I = g.input;
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
    apply(inp);
    clock += DT * 1000;
    g.update(DT);
    // Ce que fait le rendu de chaque image du jeu (renderer.render → scene.updateMatrixWorld) sans dessiner : l'image
    // suivante lit des matrices monde à jour (pieds du cheval, caméra), comme en jeu.
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    const rec = capture(cur);
    finishCh(rec);
    cur = null;
    frames.push(rec);
    return rec;
  };
  const input = (o = {}) => ({ move: o.move || [0, 0], keys: o.keys || [], held: o.held || [], jump: !!o.jump, ui: o.ui || null, ...(o.press?.length ? { press: o.press } : {}) });

  // ---- Canal « ch » (cheval de concours, tranche T2) : état complet du cheval du joueur en pleine précision ----
  // Relevé autour des appels du jeu : entrées vues par player.update (input.move après input.poll, keyMove, appui SAUT,
  // commandes de concours, verrouillage), entrées du cheval vues par horse.update (pas, figé, puissance, bonus, pente,
  // heure de jeu), état après horse.update (b, seulement s'il diffère de la fin de l'image : correction extérieure au
  // pas du cheval, collisions ou Obstacles.updateHorse), état en fin d'image (s), état à l'entrée de player.update (a,
  // seulement s'il diffère de la fin de l'image précédente), collision (col), aide à l'appel (tm = timing, tg = cible).
  // Les obstacles sont repérés par leur rang dans `obs` (obstacles à moins de 80 / 60 m du centre de la carrière),
  // liste relevée en entier à chaque image où l'un d'eux change (hauteur, présence).
  let ARENA = null, JM = null;
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
    obsList = g.obstacles.list.filter((o) => Math.abs(o.x - ARENA.x) < 80 && Math.abs(o.z - ARENA.z) < 60);
    lastSig = obsSig();
    const s = hstate();
    lastS = JSON.stringify(s);
    return { s, obs: obsDump(), ob: { ...passState(g.player.horse), fs: fenceState() } };
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
  const poseStart = (sc) => {
    const h = g.player.horse, p = g.player;
    enterRing();
    h.setPosition(ARENA.x + sc.pose.x, ARENA.z + sc.pose.z, sc.pose.h);
    h.speed = sc.pose.v;
    p.csoCadence = undefined; // cadence de départ reprise de la vitesse réelle (csoRide.js:65)
    g.cam.snap(h.pos, h.heading);
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    frames.length = 0;
    rails0 = railState();
    // État initial des barres (rails0 est ensuite remplacé à chaque image par railDelta : avant T3, setup.rails des
    // scénarios « pose » donnait par erreur l'état final).
    const railsInit = rails0;
    const ch0 = chStart();
    return { railsInit, ch0, st: { k: 0, h, sc } };
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
    const { railsInit, ch0, st } = poseStart(sc);
    while (poseStep(st)) {
      if (frames.length > sc.maxFrames) {
        if (sc.lenient) break; // --lenient : mise au point d'un scénario (images enregistrées malgré tout)
        throw new Error(`scénario ${sc.id} trop long`);
      }
    }
    return { pose: { x: h.pos.x, z: h.pos.z }, horse: { x: R6(ARENA.x + sc.pose.x), z: R6(ARENA.z + sc.pose.z), h: R6(sc.pose.h), v: R6(sc.pose.v) }, rails: railsInit, ch0, frames };
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
    // l'obstacle), 'far' (à `far` m de la première barre), 'none' (aucun appui : refus). Contrôle de T4 : `rev` = abord
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
      if (a.rule !== 'none' && !a.jumped && h.jumpT < 0 && tg && tg.o === o) {
        const go = a.rule === 'far' ? tg.geo.rails[0].x <= (a.far ?? 4.2) : tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3;
        if (go) jump = a.jumped = true;
      }
      return { move: [alt ? steerTo(h, Math.sin(hd), Math.cos(hd)) : steerTo(h, o.n.x, o.n.z), 0], jump };
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
      ? { x: GA0.x + sc.at.dx, z: GA0.z + sc.at.dz, h: Math.atan2(-sc.at.dx, -sc.at.dz) }
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
    // valeurs de son constructeur (pjlHorse.js:215-219) et lissages effacés.
    if (h.pjl) {
      Object.assign(h.pjl, { ph: 0, stride: 3.42, roll: 0, landT: 9, wasJump: false });
      for (const k of ['_clrA', '_clrY', '_clrF', 'dPitch']) delete h.pjl[k];
    }
    g.player.csoCadence = undefined;
    g.cam.snap(h.pos, h.heading);
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    const startCalls = { f: -1, ev: [], hud: [], audio: [] };
    cur = startCalls;
    g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
    cur = null;
    hookRun();
    frames.length = 0;
    rails0 = railState();
    ARENA = (await import('/src/world/sites.js')).POLE.arena;
    const ch0 = chStart();
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
    };
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
  P.duringStart = (sc) => {
    during = poseStart(sc);
    return true;
  };
  // Avance jusqu'à la fin de l'image k ; renvoie l'état utile à la pose (cheval, barres de l'obstacle `label`).
  P.duringTo = (k, label) => {
    while (frames.length <= k) if (!poseStep(during.st)) throw new Error(`scénario terminé avant l’image ${k}`);
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
  if (SHOTS_ONLY) break;
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
      Object.assign(setup, { horse: r.horse, rails: r.rails, ch0: r.ch0, pose: { ...sc.pose, cross: sc.cross ?? null } });
    } else if (sc.type === 't4') {
      frames = await page.evaluate((s) => window.__parite.runT4(s), sc);
      Object.assign(setup, { lite: true, acts: sc.acts, pose: sc.pose ?? null, ...(sc.pre ? { pre: sc.pre, at: sc.at ?? null } : {}), ...(sc.ent ? { ent: sc.ent } : {}) });
    } else frames = await page.evaluate((s) => window.__parite.runDroit(s), sc);
    if (sc.classic) setup.classic = true;
    runs.push({ id: sc.id, lang, desc: sc.desc, setup, frames });
    const evs = frames.flatMap((f) => f.ev.map((e) => e.e)).filter((e) => e.startsWith('obstacle:') || e.startsWith('horse:j') || e === 'horse:land');
    console.log(`${sc.id} ${lang} : ${frames.length} images, ${((Date.now() - t0) / 1000).toFixed(0)} s, événements ${evs.join(' ')}`);
    await ctx.close();
  }
}

// Écriture : en-tête lisible, une image par ligne (diffs lisibles, fichier stable).
const head = {
  schema: 'strides.oracle.cso_runs/1',
  generator: 'scripts/unreal/export-cso-runs.mjs',
  source: ['src/game.js', 'src/gameplay/courses.js', 'src/gameplay/activities.js', 'src/gameplay/csoRide.js', 'src/gameplay/obstacles.js', 'src/entities/horse.js', 'src/entities/camera.js', 'src/ui/hud.js', 'src/core/audio.js', 'tests/e2e/autopilot.js'],
  frame: 'repère web : x est, z sud, y haut ; cap h -> direction (sin h, cos h) ; m, s, rad ; fov = FOV vertical (degrés)',
  dt: 1 / 30,
  precision: 1e-6,
  inputs: 'in.move = joystick virtuel [x, y] (input.setVirtualMove) ; in.keys = touches clavier tenues (input.keys) ; in.held = actions tenues (input.held, ex. gallop) ; in.jump = SAUT pressé à cette image ; in.ui = bouton de carte touché (data-id) avant l’image',
  state: 'après g.update(dt) : horse (pos, cap, vitesse, jumpT, jumpY, cadence de concours, mode), run (étape i, stepT, texte, état du parcours), course (game.course), board (tableau de chrono : données et textes), cam (œil, cible, direction, FOV, aspect), rails (barres dont la transformée locale [x, y, z, rx, ry, rz] a changé depuis l’image précédente ; état initial dans setup.rails), ev (bus), hud / audio (appels de premier niveau), ch (cheval de concours, pleine précision, voir ch)',
  ep: 'canal du déroulé d’épreuve (tranche T4), pleine précision : entrées de Run.update (missions.js) à chaque image où une mission est en cours : e0 = nombre d’événements du bus émis dans l’image avant Run.update, i / i1 = étape avant / après, dt = pas de la mission (nul en pause), gt = game.time, x, z, h = cheval du joueur, fx, fz = player.focus, mode = player.mode, tk / vh = player.inTruck / véhicule présent (au volant seulement), cad / cad1 = cadence de concours avant / après (null si indéfinie) ; relevés seulement quand ils changent : hl = dernier numéro surligné (Obstacles.highlight du parcours cso), rr = appels de Obstacles.resetRails(cso) depuis le relevé précédent, cheer = game.cheerT réécrit pendant Run.update, lg = journal des fautes de l’épreuve (state.log) en fin d’image, entrées [label, kind, cause, causeText] (null si absent)',
  calls: 'hud / audio : { fn, args, src } ; src = fichier de l’appelant immédiat sous src/ (ex. gameplay/courses.js), null sinon',
  lite: 'setup.lite (scénarios t4-*) : images sans cam, sim ni ch ; tp = cheval posé avant l’image (x, z, h, v) ; setup.acts = suite d’actions du scénario ; setup.pre = actions avant la présentation (étape « rejoindre l’entrée »), setup.at = cheval posé à (dx, dz) m de l’entrée au lancement ; setup.ent = actions pendant l’étape « Entrée en piste », achevées avant la cloche ; in.press = actions pressées (ex. action)',
  ch: 'canal du cheval (tranche T2), nombres en pleine précision : in = entrées vues par player.update (dt, mx / my = input.move après poll, key = input.keyMove, jp = SAUT pressé, cso = commandes de concours, lk = player.locked) et par horse.update (fz = figé, pl = cheval du joueur, pow = jumpPower, clr = bonus de franchissement, t = game.time, sl = pente, wd / wa = profondeur d’eau si > 0, hdt = pas du cheval s’il diffère) ; s = état en fin d’image (x, z, h, v, yr = _yawRate, lt = lastTurn, jT / jY / jP / jL / jD = saut, j0 / j1 = _jt0 / _jt1, rT = _rearT, ra = anim.rear, bk = _brake, rf = obstacle refusé, lj = obstacle du dernier saut, cad = cadence, ks = _kbdSteer, ca = _cadAdjust) ; b = état après horse.update s’il diffère de s (correction extérieure : collisions, Obstacles.updateHorse) ; a = état à l’entrée de player.update s’il diffère du s précédent ; col = collision du cheval ; tm = obstacles.timing ; tg = obstacles.target résumé ; obs = liste des obstacles (rang = indice des champs rf, lj, tg.o), relevée quand elle change ; état initial : setup.ch0 { s, obs, ob }. he = événements horse:* émis pendant horse.update (hors foulées) ; tranche T3 : in.lj = membres visibles jugés (Obstacles._limbJudged), in.ma = mission en cours, in.ut / in.ot / in.odt = heure de jeu vue par updateHorse / update et pas de update s’ils diffèrent ; lc = contacts des membres signalés pendant horse.update (o, bar = rang de la barre, d = profondeur, u, hind) ; oe = événements obstacle:* en pleine précision (o, dir, m = marge, c = cause) ; ob = fin d’image : ps = passage en cours (horse._pass : o, dir, f = faute, c = cause, m = marge, x = heure de sortie, d = annoncé), rl = dernier refus compté (horse._refusal : o, t, a = détourné), fs = obstacles hors repos (i = rang, kn = renversé, rb = remise, pd = barres en attente [barre, sens, côté, profondeur, reste], r = barres déplacées [barre, y, z, rx, rz, vibration, chute]) ; setup.classic = personnages classiques (?classic)',
  audioRecorded,
  audioIgnored: AUDIO_IGNORED,
  hudMethods: HUD_METHODS,
  hudDedupe: HUD_DEDUPE,
};
if (!SHOTS_ONLY) {
  let out = JSON.stringify(head, null, 1).replace(/\n}$/, ',\n "runs": [\n');
  runs.forEach((r, i) => {
    const { frames, ...rest } = r;
    out += JSON.stringify(rest).replace(/}$/, ',"frames":[\n');
    out += frames.map((f) => JSON.stringify(f)).join(',\n');
    out += `\n]}${i < runs.length - 1 ? ',' : ''}\n`;
  });
  out += ']}\n';
  JSON.parse(out); // contrôle de forme
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out);
  console.log('oracle :', OUT, `${(out.length / 1024).toFixed(0)} Kio`);
}

// ---------------------------------------------------------------------------------------------------------------
// Grille de visée (oracle cso_target.json) : obstacles.target(h) et timing(h) du jeu en cours d'exécution.
if (!SHOTS_ONLY && (!ONLY.length || ONLY.includes('target'))) {
  const { ctx, page } = await openGame('fr');
  await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [SCENARIOS[0], 20261118]);
  const grid = await page.evaluate(() => window.__parite.targetGrid());
  const TOUT = OUT.replace(/cso_runs\.json$/, 'cso_target.json');
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
if (!SHOTS_ONLY && (!ONLY.length || ONLY.includes('goto'))) {
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
  const GOUT = (process.argv.find((a) => a.startsWith('--goto-out=')) || '').slice(11) || OUT.replace(/cso_runs\.json$/, 'cso_goto.json');
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
// Poses de capture (vue aérienne de la carrière) : état d'épreuve après la cloche, comme le scénario, puis caméra posée.
if (SHOTS) {
  mkdirSync(PARITE, { recursive: true });
  const doc = { schema: 'strides.parite_poses/1', generator: 'scripts/unreal/export-cso-runs.mjs --shots', frame: 'repère web : x est, z sud, y haut (altitude absolue) ; cap h -> (sin h, cos h) ; fovV = FOV vertical (degrés) ; sunDir = direction vers le soleil ; fence (poses de chute) = barre renversée (rang, sens, côté, profondeur) et nombre d’images de Obstacles.update depuis le contact', viewport: { w: VIEW.width, h: VIEW.height }, poses: [] };
  // --shots=chute : les poses existantes de poses.json sont gardées, celles de la chute remplacées.
  if (SHOTS_ONLY) {
    try {
      doc.poses = JSON.parse(readFileSync(join(PARITE, 'poses.json'), 'utf8')).poses.filter((p) => !p.name.startsWith('chute-'));
    } catch {
      doc.poses = [];
    }
  }
  if (!SHOTS_ONLY) {
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
    ];
    const { ctx, page } = await openGame('fr');
    const setup = await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [SCENARIOS[0], 20261118]);
    // Présentation → Entrer en piste → cloche (mêmes images que le scénario « droit », sans le galop).
    await page.evaluate(() => {
      const A = window.__auto;
      for (let i = 0; i < 120 && !document.querySelector('.overlay [data-id="enter"]'); i++) A.tick(1);
      A.tap(document.querySelector('.overlay [data-id="enter"]'));
      A.tick(80);
    });
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
      doc.poses.push({ ...full, ...info, web: `unreal/docs/parite/cso/${ps.name}-web.png`, unreal: `unreal/docs/parite/cso/${ps.name}-unreal.png` });
      console.log('pose', ps.name, JSON.stringify(info));
    }
    await ctx.close();
  }
  // Tranche T3 : chute de la barre du 3 touchée en montée (scénario t3-pres-montee), 0,1 / 0,3 / 0,6 / 1,5 s après le
  // contact (temps de chute f.t de obstacles.js), caméra fixe de trois quarts arrière. Le scénario tourne image par image
  // avec les mêmes appels que pour l'oracle ; les états relevés sont comparés ensuite à cso_runs.json.
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
      doc.poses.push({ ...ps, ...info, web: `unreal/docs/parite/cso/${name}-web.png`, unreal: `unreal/docs/parite/cso/${name}-unreal.png` });
      console.log('pose', name, 'image', k, 'barre', JSON.stringify(r.rails[knock.bar]));
    }
    // La partie jouée pendant les captures est celle de l'oracle (états du cheval identiques image par image).
    const played = await page.evaluate(() => window.__parite.duringFrames());
    try {
      const ora = JSON.parse(readFileSync(OUT, 'utf8')).runs.find((x) => x.id === sc.id);
      const diff = played.filter((sj, i) => i <= last && (!ora.frames[i] || JSON.stringify(ora.frames[i].ch.s) !== sj)).length;
      console.log(`chute : ${played.length} images jouées, ${diff} différentes de l’oracle ${sc.id}`);
      if (diff) throw new Error('chute : partie différente de l’oracle');
    } catch (e) {
      if (e.message.startsWith('chute')) throw e;
      console.log('chute : oracle illisible, comparaison non faite', e.message);
    }
    await ctx.close();
  }
  writeFileSync(join(PARITE, 'poses.json'), JSON.stringify(doc, null, 1) + '\n');
  console.log('poses :', join(PARITE, 'poses.json'));
}
if (errors.length) console.log('erreurs de page :', errors.slice(0, 5));
await browser.close();
