// Jalon J4 : épreuves des missions verrouillées en J3b (choix n° 25) — cross de Saint-Gatien (courseSteps kind « xc »,
// src/gameplay/courses.js:66-540, mission « cross » de story.js:560), course de l'hippodrome de la Touques (raceSteps,
// courses.js:684-821, mission « derby » de story.js:672) et Grand Prix de Paris Indoor (parisGP.js : concurrents simulés,
// Sprint barème C, Grand Prix barème A, barrage, dotation).
//
// Le jeu web est la spécification : ce script n'en modifie rien. Il importe les VRAIS modules du web dans Node (chargeur
// scripts/unreal/node-web), construit les vraies étapes de mission (STORY[…].steps avec makeSteps du web) et les fait
// tourner par la vraie MissionManager (Run.update, complete, fail) dans une partie factice : positions du cheval et
// événements d'obstacle scriptés, image par image (1/30 s). Ce que les étapes produisent (texte de l'objectif, état de
// l'épreuve, appels hud.* et audio.*, échec et raison, paiement) est relevé à chaque image.
//
// Mouvement des chevaux adverses de la course : le web les fait avancer par PathAI (relue ici, vraie classe du web) puis
// Horse.update (cap et vitesse). Horse.update construit des maillages ; l'oracle applique donc, après le vrai
// PathAI.update, le sous-ensemble cinématique de Horse.update recopié ci-dessous (cap borné, vitesse bornée en
// accélération, avance sur le cap, sol plat) : ce sous-ensemble est le même dans StridesCore/Epreuves (choix n° 29).
//
// Sorties (déterministes ; --check compare sans écrire, code 1 si différent) :
//  - unreal/StridesGrandTour/Content/Data/mission_events.json : données lues par le jeu (obstacles du cross, lignes,
//    règles, hippodrome, concurrents, réglages du Grand Prix de Paris, textes) ;
//  - unreal/core/tests/oracles/epreuves.json : scénarios rejoués par le ctest « epreuves ».
// Usage : node --import ./scripts/unreal/node-web/register.mjs scripts/unreal/export-epreuves.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = process.argv.includes('--check');
const web = (p) => import(pathToFileURL(join(ROOT, p)).href);
const git = (...a) => execFileSync('git', a, { cwd: ROOT }).toString().trim();

// Hasard du web remplacé par un générateur à graine (mulberry32 du web) : exécutions reproductibles.
const { mulberry32 } = await web('src/core/math.js');
let rnd = mulberry32(1234);
Math.random = () => rnd();

const { STORY } = await web('src/gameplay/story.js');
const { MissionManager, makeSteps } = await web('src/gameplay/missions.js');
const C = await web('src/gameplay/courses.js');
const { PARIS_GP, parisRivals, sprintField, rankSprint, gpField, barrageField } = await web('src/gameplay/parisGP.js');
const { PARIS_COURSES } = await web('src/gameplay/parisCourse.js');
const { HIPPO, XC_PATH, POND } = await web('src/world/layout.js');
const { GATIEN } = await web('src/world/sites.js');
const { HORSE } = await web('src/config.js');
const { PathAI } = await web('src/entities/horse.js');
const { pointAlong, polylineLength, clamp, lerp, smoothstep, angleDiff, wrapAngle } = await web('src/core/math.js');

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------- Obstacles du cross (obstacles.js xcLayout, :49-66 et add :186-188) ----------
function xcLayout() {
  const L = polylineLength(XC_PATH);
  let waterS = L * 0.42;
  for (let s = 0; s < L; s += 1) {
    const p = pointAlong(XC_PATH, s);
    if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 4) {
      waterS = s - 3;
      break;
    }
  }
  const fr = [0.07, 0.15, 0.24, 0.32, -1, 0.55, 0.64, 0.73, 0.82, 0.91];
  const kinds = ['log', 'brush', 'log', 'brush', 'water', 'log', 'brush', 'log', 'brush', 'log'];
  return fr.map((f, i) => {
    const p = pointAlong(XC_PATH, f < 0 ? waterS : L * f);
    return { x: p.x, z: p.z, rot: p.dir, kind: kinds[i], s: f < 0 ? waterS : L * f };
  });
}
// (relu ici depuis obstacles.js : la fonction n'est pas exportée ; contrôle : la liste est comparée à celle du vrai
// Obstacles du web plus bas, construite par la classe elle-même)
const XC = xcLayout().map((p, i) => ({ num: i + 1, label: String(i + 1), kind: p.kind, x: p.x, z: p.z, rot: p.rot, h: p.kind === 'log' ? 0.95 : 1.05, w: 4.2, s: p.s }));
// Obstacles tels que les étapes du web les lisent (ob.ofCourse : normale n, tangente t, parcours).
const XC_OBS = XC.map((o) => ({ ...o, course: 'xc', solid: true, n: { x: Math.sin(o.rot), z: Math.cos(o.rot) }, t: { x: Math.cos(o.rot), z: -Math.sin(o.rot) } }));
const crossDef = STORY.find((d) => d.id === 'cross');
const derbyDef = STORY.find((d) => d.id === 'derby');

// ---------- Partie factice ----------
// Proxy qui absorbe tout appel non prévu (comme le DOM factice du chargeur).
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub()),
  apply: () => stub(), construct: () => stub(), set: () => true,
});
function makeGame() {
  const calls = [];
  const rec = (ns) => new Proxy({}, {
    get: (t, k) => (k === 'notifActive' ? false : (...a) => {
      // (objectif de la mission, posé à chaque image par missions.update : relevé par le texte de l'étape)
      if (ns === 'hud' && (k === 'setObjective' || k === 'setPhoneBadge' || k === 'notify')) return;
      if (ns === 'hud' && k === 'dialog') {
        calls.push(['hud.dialog', ...a[0].map((l) => `${l.who}|${l.initials}|${l.text}`)]);
        game._dialog = a[1];
        return;
      }
      calls.push([`${ns}.${String(k)}`, ...a.filter((x) => typeof x === 'string' || typeof x === 'number').map((x) => (typeof x === 'number' ? r4(x) : x))]);
    }),
  });
  const listeners = {};
  const bus = {
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; },
    emit(ev, p) { for (const f of [...(listeners[ev] || [])]) f(p); },
  };
  const mkHorse = (x, z, heading) => ({
    pos: { x, z }, heading, speed: 0, frozen: false, stamina: 100, maxStamina: 100, control: {}, mods: {}, anim: {}, jumpPower: 1.35, name: 'Comète',
    setPosition(nx, nz, h) { this.pos.x = nx; this.pos.z = nz; if (h !== undefined) this.heading = h; },
  });
  const player = { mode: 'ride', horse: mkHorse(0, 0, 0), locked: false, isPlayer: true };
  Object.defineProperty(player, 'focus', { get: () => player.horse });
  const spawned = [];
  const game = {
    calls, bus, player, spawned,
    hud: rec('hud'), audio: rec('audio'),
    save: { data: { playerName: 'Alex', money: 1000, reputation: 2000, completed: [], checkpoint: null, stats: { jobs: 3, earned: 0 }, ratings: [], settings: { jumpAid: 'full', courseLine: true }, flags: {}, gameTime: 8 * 3600 }, grantOnce: () => true },
    saveNow() {}, saveSoon() {}, updateWallet() {}, time: 100, region: 'deauville',
    obstacles: { ofCourse: (id) => (id === 'xc' ? XC_OBS : []), highlight() {}, setHeights() {}, resetRails() {}, timing: () => 'none' },
    cam: { lastManual: 0, snap() {} },
    gps: { set() {}, clear() {}, target: null },
    screens: {
      missionFailed: (reason) => { game.outcome = { kind: 'fail', reason }; },
      missionResult: (res) => { game.outcome = { kind: 'complete', pay: res.pay, xp: res.xp, stars: res.stars, title: res.title, body: res.body || '' }; },
      card() {},
    },
    scene: stub(), world: stub(), terrain: { getHeight: () => 0, waterDepth: () => 0 }, colliders: stub(), interact: { add() {}, remove() {} },
    metrics: { track() {} }, ambient: null, mainHorse: null, course: null,
    spawnHuman: () => ({ pos: { x: 0, z: 0 }, mount() {} }),
    spawnHorse(def, x, z, h) { const e = mkHorse(x, z, h); e.def = def; e.name = def.name; spawned.push(e); return e; },
    despawn() {}, fade(fn) { fn(); }, restoreAfterMission() {}, message() {}, celebrate() {}, addSkill() {},
  };
  return game;
}

// Sous-ensemble cinématique de Horse.update (horse.js:219-300) pour un cheval mené par son IA (choix n° 29) :
// cap tourné vers la commande (taux lerp(2,8 ; 1,45 ; v/16)), vitesse visée speedOverride réduite dans un virage serré,
// accélération 4,5 / 3,6 m/s² (9 au freinage), avance sur le cap. Sol plat, sans pente, eau ni collision.
function aiHorseStep(h, dt) {
  const c = h.control;
  let desired = 0;
  if (!h.frozen && c.mag > 0.12) {
    const desiredHeading = Math.atan2(c.x, c.z);
    const diff = angleDiff(h.heading, desiredHeading);
    desired = c.speedOverride ?? 0;
    const sp01 = clamp(h.speed / 16, 0, 1);
    const rate = lerp(2.8, 1.45, sp01);
    if (Math.abs(diff) > 2.3 && h.speed < 3) desired = Math.min(desired, 1.2);
    const step = clamp(diff, -rate * dt, rate * dt);
    h.heading = wrapAngle(h.heading + step);
    desired *= 1 - smoothstep(1.3, 2.7, Math.abs(diff)) * 0.75;
  }
  const acc = desired > h.speed ? (h.speed < 5 ? 4.5 : 3.6) : 9;
  h.speed = h.speed + clamp(desired - h.speed, -acc * dt, acc * dt);
  h.pos.x += Math.sin(h.heading) * h.speed * dt;
  h.pos.z += Math.cos(h.heading) * h.speed * dt;
}

// Exécute une mission jusqu'à son issue. script(frame, game, run) : entrées de l'image (position du cheval, événements
// d'obstacle émis sur le bus avant missions.update, comme Obstacles.updateHorse avant missions.update dans game.js).
function runMission(def, script, { maxFrames = 9000, rivalsMove = false } = {}) {
  rnd = mulberry32(4321);
  const game = makeGame();
  const mm = new MissionManager(game);
  game.missions = mm;
  mm.pushNotif = () => {};
  const offer = { id: `story:${def.id}`, def, title: def.title, category: def.category, vertical: def.vertical, pay: def.pay, story: true };
  mm.start(offer);
  const run = mm.active;
  const frames = [];
  const dt = 1 / 30;
  let lastKey = '';
  const inputs = [];
  let lastIn = '';
  for (let f = 0; f < maxFrames && !game.outcome; f++) {
    game.calls.length = 0;
    game._closed = false;
    const input = script(f, game, run) || {};
    {
      const h = game.player.horse;
      const cur = [r4(h.pos.x), r4(h.pos.z), r4(h.heading), r4(h.speed), game.player.mode];
      const k = JSON.stringify(cur);
      if (k !== lastIn || input.ev || game._closed) {
        inputs.push({ f, p: cur, ...(input.ev ? { ev: input.ev } : {}), ...(game._closed ? { dlg: 1 } : {}) });
        lastIn = k;
      }
    }
    if (rivalsMove) for (const h of game.spawned) { if (h.ai) h.ai.update(h, dt); aiHorseStep(h, dt); }
    mm.update(dt);
    const st = run.data.course;
    const race = run.data.race;
    const row = {
      f, i: run.i, k: run.step?.kind || (run.finished ? 'end' : ''), txt: run.finished ? '' : run.text(),
      ...(input.ev ? { ev: input.ev } : {}),
      x: r4(game.player.horse.pos.x), z: r4(game.player.horse.pos.z), m: game.player.mode,
    };
    if (st) Object.assign(row, { cs: [st.faults, st.refusals, st.fenceRefusals, st.next, r4(st.t), st.started ? 1 : 0, st.finished ? 1 : 0, st.eliminated || '', st.timeFaults] });
    if (race) {
      row.rc = [r4(race.t), r4(race.player.prog), race.started ? 1 : 0, race.order.join(','), race.player.offTrack ? 1 : 0];
      row.rv = race.rivals.map((r) => [r4(r.horse.pos.x), r4(r.horse.pos.z), r4(r.horse.heading), r4(r.horse.speed), r4(r.prog)]);
    }
    if (game.calls.length) row.calls = game.calls.map((c) => [...c]);
    if (game.outcome) row.out = game.outcome;
    // Images sans changement (même étape, rien d'appelé, pas d'événement) : gardées une sur quinze pour l'oracle léger.
    const key = `${row.i}|${row.txt}|${JSON.stringify(row.cs ? row.cs.filter((_, j) => j !== 4) : null)}|${row.rc ? row.rc[3] : ''}`;
    if (key !== lastKey || row.calls || row.ev || row.out || f % (race && race.started ? 5 : 15) === 0) frames.push(row);
    lastKey = key;
  }
  return { frames, inputs, outcome: game.outcome || null, rivalsBase: run.data.race ? run.data.race.rivals.map((r) => r.base) : null };
}

// ---------- Scénarios du cross ----------
const START = { x: GATIEN.start.x + 4, z: GATIEN.start.z };
const FIN = { x: GATIEN.start.x, z: GATIEN.start.z };
// Script générique : arrivée au départ (téléportée à 6 m puis 1 m), dialogue fermé à l'image 20 de l'étape, puis
// déroulé des événements (num, kind, frame relative au départ du chrono), puis arrivée.
function crossScript(events, { finishAt = null, dismountAt = null } = {}) {
  let courseFrame = -1;
  return (f, game, run) => {
    const h = game.player.horse;
    if (f < 5) h.setPosition(START.x + 30, START.z, 0);
    else if (f < 10) h.setPosition(START.x + 6.5, START.z, 0);
    else if (courseFrame < 0) h.setPosition(START.x + 1, START.z, 0);
    // Pendant le parcours, à 20 m de l'arrivée (hors de son rayon de 7 m) jusqu'à l'image d'arrivée.
    else if (finishAt === null || f - courseFrame < finishAt) h.setPosition(FIN.x + 20, FIN.z, 0);
    if (run.step?.kind === 'dialog' && game._dialog && run.stepT > 0.6) { const cb = game._dialog; game._dialog = null; game._closed = true; cb(); }
    if (run.step?.kind === 'course' && courseFrame < 0) courseFrame = f;
    if (courseFrame < 0) return {};
    const k = f - courseFrame;
    if (dismountAt !== null && k === dismountAt) game.player.mode = 'foot';
    const out = {};
    for (const e of events) {
      if (e[2] !== k) continue;
            const ev = e[1] === 'clear' ? 'obstacle:clear' : e[1] === 'fault' ? 'obstacle:fault' : 'obstacle:refusal';
      game.bus.emit(ev, { obstacle: XC_OBS[e[0] - 1], dir: e[3] ?? 1, cause: e[1] === 'fault' ? 'short' : undefined, causeText: e[1] === 'fault' ? 'Appel trop loin' : undefined });
      (out.ev ||= []).push([e[0], e[1], e[3] ?? 1]);
    }
    if (finishAt !== null && k >= finishAt) h.setPosition(FIN.x + 2, FIN.z + 1, 0);
    return out;
  };
}
const every = (n0, gap) => Array.from({ length: 10 }, (_, i) => [i + 1, 'clear', n0 + i * gap]);
const crossRuns = {
  // Sans faute en 95 s (sous le temps accordé de 110 s) : mission payée.
  'xc-sans-faute': crossScript(every(150, 270), { finishAt: 2850 }),
  // Touché au 3 (+4), dépassement de 12,5 s (round(12,5 × 0,4) = 5) : 9 points, mission payée.
  'xc-touche-temps': crossScript([...every(150, 300).map((e) => (e[0] === 3 ? [3, 'fault', e[2]] : e))], { finishAt: 3675 }),
  // Trois refus au 4 : éliminé (« 3e refus sur le même obstacle »), mission échouée.
  'xc-trois-refus': crossScript([[1, 'clear', 100], [2, 'clear', 300], [3, 'clear', 500], [4, 'refusal', 600], [4, 'refusal', 700], [4, 'refusal', 800]]),
  // Quatre refus sur des obstacles différents : 4e refus, éliminé.
  'xc-quatre-refus': crossScript([[1, 'refusal', 80], [1, 'clear', 160], [2, 'refusal', 260], [2, 'clear', 330], [3, 'refusal', 430], [3, 'clear', 500], [4, 'refusal', 600]]),
  // Erreur de parcours (le 5 avant le 2), passage à contresens ignoré, puis cavalier descendu : éliminé.
  'xc-erreur-descendu': crossScript([[1, 'clear', 100], [5, 'clear', 200], [2, 'clear', 300, -1], [2, 'clear', 360]], { dismountAt: 500 }),
  // Aucun obstacle franchi : temps limite (2 × 110 s) dépassé, éliminé.
  'xc-temps-limite': crossScript([]),
};
const crossOut = {};
for (const [id, s] of Object.entries(crossRuns)) crossOut[id] = runMission(crossDef, s);

// ---------- Scénarios de la course ----------
// Le joueur galope dans son couloir (rayon de stalle n° 3) à la vitesse donnée ; sortie de piste éventuelle.
const stallR = (k) => HIPPO.radius + HIPPO.width / 2 - (HIPPO.width / 8) * (k + 0.5);
function raceScript(speed, { offTrackAt = null, dismountAt = null, stopAt = null } = {}) {
  let s0 = null, raceFrame = -1, sAlong = 0;
  return (f, game, run) => {
    const h = game.player.horse;
    if (f < 5) h.setPosition(HIPPO.x - 40, HIPPO.z - HIPPO.radius, Math.PI / 2);
    else if (run.step?.kind === 'goto') h.setPosition(HIPPO.x - 70, HIPPO.z - HIPPO.radius, Math.PI / 2);
    if (run.step?.kind === 'dialog' && game._dialog && run.stepT > 0.6) { const cb = game._dialog; game._dialog = null; game._closed = true; cb(); }
    if (run.step?.kind === 'race' && raceFrame < 0) { raceFrame = f; s0 = 60; sAlong = 0; }
    if (raceFrame < 0 || run.step?.kind !== 'race') return {};
    const k = f - raceFrame;
    if (dismountAt !== null && k === dismountAt) game.player.mode = 'foot';
    const v = stopAt !== null && k >= stopAt ? 0 : typeof speed === 'function' ? speed(k) : speed;
    sAlong += v / 30;
    const R = HIPPO.radius + HIPPO.width / 2 - (HIPPO.width / 8) * 3.5;
    let p = C.ovalPoint(s0 + sAlong * (HIPPO.radius / R), R);
    if (offTrackAt !== null && k >= offTrackAt && k < offTrackAt + 120) p = [p[0], p[1] - 30];
    h.setPosition(p[0], p[1], h.heading);
    h.speed = v;
    return {};
  };
}
const raceRuns = {
  // Grand galop tenu (14 m/s) : devant les adversaires (67 à 76 % de 14 m/s), victoire.
  'derby-victoire': raceScript(14),
  // 10,3 m/s : entre les adversaires, place relevée (podium ou non selon le peloton).
  'derby-milieu': raceScript(10.3),
  // 11,2 m/s : sur le podium derrière le ou les plus rapides (dotation au prorata).
  'derby-podium': raceScript(10.65),
  // Galop de travail (6,5 m/s) : derniers, « Course terminée sans toi » à 160 s ou 6e (échec).
  'derby-lent': raceScript(6.5),
  // Sortie de piste pendant 4 s (« Reste sur la piste ! ») puis grand galop.
  'derby-hors-piste': raceScript(14, { offTrackAt: 200 }),
  // Cavalier descendu : échec.
  'derby-descendu': raceScript(12, { dismountAt: 150 }),
};
const raceOut = {};
for (const [id, s] of Object.entries(raceRuns)) raceOut[id] = runMission(derbyDef, s, { rivalsMove: true, maxFrames: 7000 });

// ---------- Grand Prix de Paris : concurrents simulés ----------
const paris = [];
for (const seed of [4000, 4517, 6203, 8999]) {
  const rivals = parisRivals(seed);
  const sprint = sprintField(rivals, seed);
  const gp = gpField(rivals, seed);
  const clear = gp.filter((x) => x.faults === 0);
  const jo = barrageField(clear, seed, Math.ceil(PARIS_GP.gp.ta * 0.86));
  paris.push({
    seed,
    rivals: rivals.map((r) => [r.rider, r.horse, r4(r.form)]),
    sprint: sprint.map((r) => [r.rails, r.time, r.score]),
    sprintRank: rankSprint(sprint).map((r) => sprint.indexOf(r)),
    gp: gp.map((r) => [r.faults, r.time]),
    jo: jo.map((r) => [r.joFaults, r.joTime]),
  });
}
const { FIRST_NAMES, LAST_NAMES } = await web('src/gameplay/data.js');
const { HORSE_NAMES } = await web('src/gameplay/ranking.js');

// ---------- Données du jeu ----------
const data = {
  schema: 'strides.mission_events.v1',
  cross: {
    mission: 'cross', courseId: 'xc', length: C.COURSE_LENGTH.xc, timeAllowed: 110, maxRefusals: 4, pen: 20,
    start: { x: START.x, z: START.z, r: 7 }, finish: { x: FIN.x, z: FIN.z, w: 7 },
    fences: XC.map((o) => ({ ...o, x: r4(o.x), z: r4(o.z), rot: r4(o.rot), s: r2(o.s) })),
    path: XC_PATH, pond: POND,
    official: { x: GATIEN.start.x + 6, z: GATIEN.start.z - 7, heading: r4(-Math.PI / 2), name: 'Paul' },
    pay: crossDef.pay, xp: crossDef.xp,
  },
  race: {
    mission: 'derby', hippo: HIPPO, startS: 60, total: r4(C.ovalLength(HIPPO.radius)), finishS: r4(C.ovalLength(HIPPO.radius) + 100),
    meet: { x: HIPPO.x - 70, z: HIPPO.z - HIPPO.radius, r: 8 },
    rivals: ['Éclair de Lune', 'Quick Star', 'Diamant Noir', 'Belle Écume', 'Tempête'],
    silks: ['#b8322a', '#2f5f8a', '#e3b23c', '#2f6e4a', '#7a5a8a'], coats: ['chestnut', 'black', 'grey', 'darkbay', 'bay'],
    stalls: [5, 4, 2, 1, 0], playerStall: 3, base: [0.76, 0.74, 0.72, 0.7, 0.67], gallop: HORSE.gaits[4].speed, timeLimit: 160,
    payPos: [derbyDef.pay, Math.round((derbyDef.pay * 250) / 420), Math.round((derbyDef.pay * 150) / 420)], xp: derbyDef.xp,
  },
  paris: {
    mission: 'gpparis', riders: PARIS_GP.riders, prizes: PARIS_GP.prizes, sprintPrize: PARIS_GP.sprintPrize, gpHour: PARIS_GP.gpHour,
    sprint: PARIS_GP.sprint, gp: PARIS_GP.gp, joTa: Math.ceil(PARIS_GP.gp.ta * 0.86),
    sprintLength: PARIS_COURSES.paris_sprint.length, gpLength: PARIS_COURSES.paris_gp.length,
    firstNames: FIRST_NAMES.map((n) => n[0]), lastNames: LAST_NAMES, horseNames: HORSE_NAMES,
  },
};

// Dialogues des épreuves (Paul au cross, Victor à la course) : lignes relevées dans l'appel hud.dialog du vrai déroulé.
const dialogOf = (r) => {
  for (const f of r.frames) for (const c of f.calls || []) if (c[0] === 'hud.dialog') return c.slice(1).map((l) => { const [who, initials, text] = l.split('|'); return { who, initials, text }; });
  return [];
};
data.cross.intro = dialogOf(crossOut['xc-sans-faute']);
data.race.intro = dialogOf(raceOut['derby-victoire']);

// Contrôle : obstacles du cross identiques à ceux du vrai Obstacles du web (classe construite sur une scène factice).
{
  const { Obstacles } = await web('src/gameplay/obstacles.js');
  const g = { scene: stub(), terrain: { getHeight: () => 0 }, colliders: { addBox: () => ({}) }, world: { culled: [], detailTex: null }, bus: { on() {}, emit() {} } };
  let real = null;
  try {
    const ob = new Obstacles(g);
    real = ob.list.filter((o) => o.course === 'xc').map((o) => ({ num: o.num, kind: o.kind, x: r4(o.x), z: r4(o.z), rot: r4(o.rot), h: o.h, w: o.w, solid: o.solid }));
  } catch (e) {
    console.log('Obstacles du web non construits hors navigateur :', e.message.slice(0, 120));
  }
  if (real) {
    const mine = data.cross.fences.map((o) => ({ num: o.num, kind: o.kind, x: o.x, z: o.z, rot: o.rot, h: o.h, w: o.w, solid: true }));
    if (JSON.stringify(real) !== JSON.stringify(mine)) { console.error('ÉCART obstacles du cross', JSON.stringify(real).slice(0, 300)); process.exit(2); }
    data.cross.checkedAgainstObstacles = true;
    console.log('obstacles du cross : identiques à Obstacles du web (10)');
  }
}

const source = { webCommit: git('rev-parse', '--short', 'HEAD'), files: ['src/gameplay/courses.js', 'src/gameplay/story.js', 'src/gameplay/missions.js', 'src/gameplay/obstacles.js', 'src/gameplay/parisGP.js', 'src/entities/horse.js'] };
const oracle = { schema: 'strides.epreuves.oracle.v1', source, dt: 1 / 30, cross: crossOut, race: raceOut, paris };
const out = [
  [join(ROOT, 'unreal/StridesGrandTour/Content/Data/mission_events.json'), { ...data, source }],
  [join(ROOT, 'unreal/core/tests/oracles/epreuves.json'), oracle],
];
let diff = 0;
for (const [path, obj] of out) {
  const text = JSON.stringify(obj) + '\n';
  const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const strip = (s) => s.replace(/"webCommit":"[^"]*"/, '');
  if (strip(old) === strip(text)) { console.log('inchangé', path); continue; }
  diff++;
  if (CHECK) console.log('DIFFÉRENT', path);
  else { writeFileSync(path, text); console.log('écrit', path, `${(text.length / 1024).toFixed(0)} Ko`); }
}
for (const [id, r] of Object.entries(crossOut)) console.log(id, r.frames.length, 'images', JSON.stringify(r.outcome));
for (const [id, r] of Object.entries(raceOut)) console.log(id, r.frames.length, 'images', JSON.stringify(r.outcome), r.rivalsBase);
if (CHECK && diff) process.exit(1);
