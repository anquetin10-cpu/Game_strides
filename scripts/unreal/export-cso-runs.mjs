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
//    unreal/core/tests/test_core.cpp (testHorseRuns).
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
const SHOTS = process.argv.includes('--shots');
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
          if (!dedupe.includes(n) || last[n] !== key) cur[sink].push({ fn: n, args: a });
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
    g.bus.emit = (evt, data) => {
      if (cur) cur.ev.push({ e: evt, d: summ(data, 1) });
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
    rec.cam = { eye: v3(g.camera.position), target: v3(g.cam.target), dir: v3(g.camera.getWorldDirection(tmp)), fov: R6(g.camera.fov), aspect: R6(g.camera.aspect) };
    rec.rails = railDelta();
    rec.sim = { paused: !!g.simPaused, overlay: !!document.querySelector('.overlay') };
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
  const input = (o = {}) => ({ move: o.move || [0, 0], keys: o.keys || [], held: o.held || [], jump: !!o.jump, ui: o.ui || null });

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
  };
  const chStart = () => {
    obsList = g.obstacles.list.filter((o) => Math.abs(o.x - ARENA.x) < 80 && Math.abs(o.z - ARENA.z) < 60);
    lastSig = obsSig();
    const s = hstate();
    lastS = JSON.stringify(s);
    return { s, obs: obsDump() };
  };
  P.installHorse = () => {
    const p = g.player;
    const pu = p.update.bind(p);
    p.update = (dt, inp) => {
      if (cur && p.mode === 'ride') {
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
  };
  P.runPose = (sc) => {
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
    const ch0 = chStart();
    const st = { k: 0, h, sc };
    for (;;) {
      const o = DRIVES[sc.id](st);
      if (!o) break;
      step(input(o));
      st.k++;
      if (frames.length > sc.maxFrames) throw new Error(`scénario ${sc.id} trop long`);
    }
    return { pose: { x: h.pos.x, z: h.pos.z }, horse: { x: R6(ARENA.x + sc.pose.x), z: R6(ARENA.z + sc.pose.z), h: R6(sc.pose.h), v: R6(sc.pose.v) }, rails: rails0, ch0, frames };
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
    const pose = { x: S.x - Math.sin(S.rot) * before, z: S.z - Math.cos(S.rot) * before, h: S.rot };
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
    frames.length = 0;
    rails0 = railState();
    ARENA = (await import('/src/world/sites.js')).POLE.arena;
    const ch0 = chStart();
    return {
      seed, dt: DT, day, gameTime: g.save.data.gameTime, time: g.time, playerName: g.save.data.playerName, horseName: h.name, horseId: h.id,
      horse: { x: R6(pose.x), z: R6(pose.z), h: R6(pose.h), v: 0 },
      start: { x: R6(S.x), z: R6(S.z), rot: R6(S.rot), w: S.w },
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
}

// ---------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function openGame(lang) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await page.goto(`${BASE}/?autostart&quality=high&lang=${lang}`, { timeout: 180000 });
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
  if (ONLY.length && !ONLY.includes(sc.id)) continue;
  for (const lang of sc.langs || ['fr', 'en']) {
    const t0 = Date.now();
    const { ctx, page, audioNames } = await openGame(lang);
    audioRecorded = audioNames;
    const setup = await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [sc, 20261118]);
    let frames;
    if (sc.type === 'pose') {
      const r = await page.evaluate((s) => window.__parite.runPose(s), sc);
      frames = r.frames;
      Object.assign(setup, { horse: r.horse, rails: r.rails, ch0: r.ch0, pose: { ...sc.pose, cross: sc.cross ?? null } });
    } else frames = await page.evaluate((s) => window.__parite.runDroit(s), sc);
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
  ch: 'canal du cheval (tranche T2), nombres en pleine précision : in = entrées vues par player.update (dt, mx / my = input.move après poll, key = input.keyMove, jp = SAUT pressé, cso = commandes de concours, lk = player.locked) et par horse.update (fz = figé, pl = cheval du joueur, pow = jumpPower, clr = bonus de franchissement, t = game.time, sl = pente, wd / wa = profondeur d’eau si > 0, hdt = pas du cheval s’il diffère) ; s = état en fin d’image (x, z, h, v, yr = _yawRate, lt = lastTurn, jT / jY / jP / jL / jD = saut, j0 / j1 = _jt0 / _jt1, rT = _rearT, ra = anim.rear, bk = _brake, rf = obstacle refusé, lj = obstacle du dernier saut, cad = cadence, ks = _kbdSteer, ca = _cadAdjust) ; b = état après horse.update s’il diffère de s (correction extérieure : collisions, Obstacles.updateHorse) ; a = état à l’entrée de player.update s’il diffère du s précédent ; col = collision du cheval ; tm = obstacles.timing ; tg = obstacles.target résumé ; obs = liste des obstacles (rang = indice des champs rf, lj, tg.o), relevée quand elle change ; état initial : setup.ch0 { s, obs }',
  audioRecorded,
  audioIgnored: AUDIO_IGNORED,
  hudMethods: HUD_METHODS,
  hudDedupe: HUD_DEDUPE,
};
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

// ---------------------------------------------------------------------------------------------------------------
// Grille de visée (oracle cso_target.json) : obstacles.target(h) et timing(h) du jeu en cours d'exécution.
if (!ONLY.length || ONLY.includes('target')) {
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
// Poses de capture (vue aérienne de la carrière) : état d'épreuve après la cloche, comme le scénario, puis caméra posée.
if (SHOTS) {
  mkdirSync(PARITE, { recursive: true });
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
  const doc = { schema: 'strides.parite_poses/1', generator: 'scripts/unreal/export-cso-runs.mjs --shots', frame: 'repère web : x est, z sud, y haut (altitude absolue) ; cap h -> (sin h, cos h) ; fovV = FOV vertical (degrés) ; sunDir = direction vers le soleil', viewport: { w: VIEW.width, h: VIEW.height }, poses: [] };
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
  writeFileSync(join(PARITE, 'poses.json'), JSON.stringify(doc, null, 1) + '\n');
  console.log('poses :', join(PARITE, 'poses.json'));
  await ctx.close();
}
if (errors.length) console.log('erreurs de page :', errors.slice(0, 5));
await browser.close();
