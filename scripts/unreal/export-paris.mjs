// Jalon J4 (correction après contrôle adverse) : Grand Prix de Paris Indoor (src/gameplay/parisGP.js, PARIS_MISSION),
// arène de Paris (src/world/sites.js PARIS, src/gameplay/parisCourse.js), autoroute A13 (src/gameplay/travel.js).
//
// Le jeu web est la spécification : ce script n'en modifie rien. Il importe les VRAIS modules du web dans Node (chargeur
// scripts/unreal/node-web), construit les vraies étapes de PARIS_MISSION (makeSteps du web, courseSteps du web pour le
// Sprint, le Grand Prix et le barrage) et les fait tourner par la vraie MissionManager dans une partie factice : positions
// du cheval, camion, région, boutons des cartes, action « Accréditation » et événements d'obstacle scriptés, image par
// image (1/30 s). Relevé à chaque image : texte de l'objectif, état de la manche, appels hud.*, cartes (kicker, titre,
// lignes, classement), issue et paiement ; et les entrées de chaque image, rejouées par le ctest « paris ».
//
// Sorties (déterministes ; --check compare sans écrire, code 1 si différent) :
//  - unreal/StridesGrandTour/Content/Data/paris_gp.json : données lues par le jeu (site, tracés et lignes des deux
//    parcours, paddock, A13, textes des dialogues) ;
//  - unreal/core/tests/oracles/paris_gp.json : scénarios.
// Usage : node --import ./scripts/unreal/node-web/register.mjs scripts/unreal/export-paris.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = process.argv.includes('--check');
const web = (p) => import(pathToFileURL(join(ROOT, p)).href);
const git = (...a) => execFileSync('git', a, { cwd: ROOT }).toString().trim();

const { mulberry32 } = await web('src/core/math.js');
let rnd = mulberry32(1234);
Math.random = () => rnd();

const { MissionManager } = await web('src/gameplay/missions.js');
const { PARIS_MISSION, PARIS_GP, parisRivals } = await web('src/gameplay/parisGP.js');
const { PARIS_COURSES, PARIS_WARM } = await web('src/gameplay/parisCourse.js');
const { PARIS, PARIS_STANDS, PARIS_FLOOR } = await web('src/world/sites.js');
const { A13, TRIP, AIRE } = await web('src/gameplay/travel.js');
const C = await web('src/gameplay/courses.js');

const r4 = (v) => Math.round(v * 1e4) / 1e4;

// ---------- Obstacles de Paris tels qu'obstacles.js les pose (add, :204-220) ----------
const withAxes = (o) => ({ ...o, solid: true, n: { x: Math.sin(o.rot), z: Math.cos(o.rot) }, t: { x: Math.cos(o.rot), z: -Math.sin(o.rot) } });
const PARIS_OBS = {};
for (const c of Object.values(PARIS_COURSES)) {
  const hs = c.heights(1.45);
  PARIS_OBS[c.id] = c.layout.map((f, i) => withAxes({ x: f.x, z: f.z, rot: f.rot, kind: f.kind, spread: f.spread || 0, h: hs[i], w: 3.8, num: i + 1, label: f.label, lineS: f.s, course: c.id }));
}
const PW = PARIS.warmup;
const WARM = [
  withAxes({ x: PW.x - 3, z: PW.z + 8, rot: -Math.PI / 2, kind: 'v', h: 1.3, w: 3.4, course: PARIS_WARM, num: 0, label: '' }),
  withAxes({ x: PW.x + 3, z: PW.z - 8, rot: Math.PI / 2, kind: 'o', h: 1.25, w: 3.4, course: PARIS_WARM, num: 0, label: '', spread: 0 }),
];

// ---------- Cartes (screens.card) : html du web lu en lignes et classement ----------
const strip = (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
function parseCard(def) {
  const html = def.html || '';
  const rows = [];
  for (const m of html.matchAll(/<div class="k">([\s\S]*?)<\/div><div class="v">([\s\S]*?)<\/div>/g)) rows.push([strip(m[1]), strip(m[2])]);
  const table = [];
  for (const m of html.matchAll(/<tr( class="me")?>([\s\S]*?)<\/tr>/g)) table.push([m[1] ? 1 : 0, ...[...m[2].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((x) => strip(x[1]))]);
  return { kicker: def.kicker || '', title: def.title || '', rows, table, buttons: (def.buttons || []).map((b) => b.id || '') };
}

// ---------- Partie factice ----------
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub()),
  apply: () => stub(), construct: () => stub(), set: () => true,
});
function makeGame(region) {
  const calls = [];
  const rec = (ns) => new Proxy({}, {
    get: (t, k) => (k === 'notifActive' ? false : (...a) => {
      if (ns === 'hud' && (k === 'setObjective' || k === 'setPhoneBadge' || k === 'notify' || k === 'jumpFeedback')) return;
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
  const horse = {
    pos: { x: 0, z: 0 }, heading: 0, speed: 0, frozen: false, stamina: 100, maxStamina: 100, control: {}, mods: {}, anim: {}, jumpPower: 1.75, name: 'Comète',
    setPosition(nx, nz, h) { this.pos.x = nx; this.pos.z = nz; if (h !== undefined) this.heading = h; },
  };
  const aboard = new Set();
  const transport = { seq: null, led: null, comfort: 100, get aboard() { return [...aboard].map((h) => ({ horse: h })); }, isAboard: (h) => aboard.has(h) };
  const player = { mode: 'ride', horse, locked: false, isPlayer: true, inTruck: false, vehicle: null, transport };
  const truck = { pos: { x: 0, z: 0 }, speed: 0, heading: 0, rampClosed: true, ramp: { target: 0 }, rearPoint: (v) => v, sim: { fuelL: 80 } };
  player.truck = truck;
  Object.defineProperty(player, 'focus', { get: () => (player.mode === 'ride' ? player.horse : player.inTruck ? game.truck : player.foot) });
  player.foot = { pos: { x: 0, z: 0 } };
  const interacts = {};
  const game = {
    calls, bus, player, truck, interacts, aboard, cards: [],
    hud: rec('hud'), audio: rec('audio'),
    save: { data: { playerName: 'Alex', money: 1000, reputation: 30000, completed: [], checkpoint: null, stats: { jobs: 3, earned: 0 }, ratings: [], settings: { jumpAid: 'off', courseLine: false }, flags: {}, gameTime: 14 * 3600 }, grantOnce: () => true },
    saveNow() {}, saveSoon() {}, updateWallet() {}, time: 100, region,
    obstacles: { ofCourse: (id) => (id === PARIS_WARM ? WARM : PARIS_OBS[id] || []), highlight() {}, setHeights() {}, resetRails() {}, timing: () => 'none', showParisCourse() {} },
    cam: { lastManual: 0, snap() {} },
    gps: { set() {}, clear() {}, target: null },
    screens: {
      missionFailed: (reason) => { game.outcome = { kind: 'fail', reason }; },
      missionResult: (res) => { game.outcome = { kind: 'complete', pay: res.pay, xp: res.xp, stars: res.stars, title: res.title, body: res.body || '' }; },
      card(def) { game.cards.push(def); calls.push(['card', JSON.stringify(parseCard(def))]); },
    },
    scene: stub(), world: { paris: {} }, terrain: { getHeight: () => 0, waterDepth: () => 0 }, colliders: stub(),
    interact: { add(id, d) { interacts[id] = d; }, remove(id) { delete interacts[id]; } },
    metrics: { track() {} }, ambient: null, course: null,
    hour: () => (game.save.data.gameTime % 86400) / 3600,
    spawnHuman: (look, x, z) => ({ pos: { x, z }, mount() {} }),
    spawnHorse: () => stub(),
    despawn() {}, fade(fn) { fn(); }, restoreAfterMission() {}, message() {}, celebrate() {}, addSkill() {}, reportScore() {},
  };
  Object.defineProperty(game, 'mainHorse', { get: () => horse });
  return game;
}

// ---------- Scénario ----------
// plan : { region, sprint, gp, barrage } ; chaque manche : liste d'événements [num, 'clear'|'fault'|'refusal'] espacés
// de `gap` images après le départ, puis l'arrivée `fin` images après le dernier ; elim : manche arrêtée après les
// événements (deux refus).
function parisScript(plan) {
  let phase = plan.region === 'paris' ? 'accred' : 'load';
  let roundFrame = -1, roundId = '', roundN = 0, cardFrame = -1, waitF = 0, roundStep = null;
  const rounds = [plan.sprint, plan.gp, plan.barrage].filter(Boolean);
  const evs = [];
  return (f, game, run) => {
    const p = game.player, h = p.horse, tk = game.truck;
    const out = {};
    const kind = run.step?.kind || '';
    // Dialogues : fermés 0,7 s après leur ouverture.
    if (kind === 'dialog' && game._dialog && run.stepT > 0.7) { const cb = game._dialog; game._dialog = null; out.dlg = 1; cb(); }
    // Cartes : bouton principal touché 1 s après l'ouverture.
    const card = game.cards[game.cards.length - 1];
    if (card && !card._done) {
      if (cardFrame < 0) cardFrame = f;
      if (f - cardFrame >= 30) {
        card._done = true; cardFrame = -1;
        const b = card.buttons.find((x) => x.primary) || card.buttons[0];
        out.btn = b.id;
        b.run?.();
      }
    }
    // Trajet (région de Deauville au départ).
    if (phase === 'load') {
      if (f < 20) { h.setPosition(400, -150, 0); tk.pos = { x: 420, z: -150 }; p.mode = 'ride'; }
      else if (f < 40) { h.setPosition(418, -150, 0); }
      else if (f < 60) { p.mode = 'foot'; p.foot.pos = { x: 419, z: -150 }; }
      else { game.aboard.add(h); p.mode = 'drive'; p.inTruck = true; phase = 'drive'; waitF = f; }
    } else if (phase === 'drive') {
      // Camion à 500 m, puis à la bretelle (arrêté après 20 images).
      if (f - waitF < 30) { tk.pos = { x: 500, z: -130 }; tk.speed = 12; }
      else if (f - waitF < 50) { tk.pos = { x: A13.deauville.x - 2, z: A13.deauville.z }; tk.speed = 2; }
      else { tk.speed = 0; if (f - waitF > 90) { phase = 'travel'; waitF = f; } }
    } else if (phase === 'travel') {
      // Travel.go (travel.js:121-133) : camion posé au parking de Paris, +130 min, région « paris ».
      if (f - waitF === 20) {
        tk.pos = { x: A13.paris.arrive.x, z: A13.paris.arrive.z }; tk.speed = 0;
        game.save.data.gameTime += TRIP.minutes * 60; game.region = 'paris'; out.travel = 1;
      }
      if (f - waitF > 40) { p.mode = 'foot'; p.inTruck = false; p.foot.pos = { x: A13.paris.arrive.x - 6, z: A13.paris.arrive.z }; }
      if (f - waitF > 50) { game.aboard.delete(h); h.setPosition(A13.paris.arrive.x - 9, A13.paris.arrive.z, 0); phase = 'accred'; }
    } else if (phase === 'accred') {
      // À pied devant les accréditations (l'action n'est proposée qu'à moins de 3,6 m, à pied ou à cheval).
      p.mode = 'foot';
      if (kind === 'interact') {
        const it = Object.values(game.interacts)[0];
        p.foot.pos = { x: PARIS.secretariat.x + 2, z: PARIS.secretariat.z };
        if (run.stepT > 0.5 && it) { out.act = 1; it.action(); }
      } else if (kind !== 'dialog' && run.i > 6) phase = 'mount';
      else p.foot.pos = { x: PARIS.secretariat.x + 2, z: PARIS.secretariat.z };
    } else if (phase === 'mount') {
      if (run.stepT > 0.5) { p.mode = 'ride'; h.setPosition(PW.x, PW.z, 0); phase = 'warm'; waitF = f; }
    } else if (phase === 'warm') {
      h.setPosition(PW.x, PW.z, 0);
      if (f - waitF === 20) { game.bus.emit('obstacle:clear', { obstacle: WARM[0], dir: 1 }); evs.push([f, 'w']); out.ev = [['w', 0, 'clear']]; }
      if (f - waitF === 50) { game.bus.emit('obstacle:fault', { obstacle: WARM[1], dir: 1, cause: 'short', causeText: 'Appel trop loin' }); out.ev = [['w', 1, 'fault']]; }
      if (f - waitF > 52) phase = 'round';
    } else if (phase === 'round') {
      const st = run.data.course;
      const rd = rounds[roundN];
      if (!rd) return out;
      const cid = rd.course;
      const c = PARIS_COURSES[cid];
      const S = c.start, F = c.finish;
      const sx = Math.sin(S.rot), sz = Math.cos(S.rot);
      if (kind === 'goto') {
        // Porte des cavaliers (manche suivante : celle de cette étape).
        if (roundId === 'done' || roundId === 'run') { roundN++; roundId = ''; }
        h.setPosition(PARIS.gate.x, PARIS.gate.z, PARIS.gate.rot);
      } else if (kind === 'course') {
        if (roundStep !== run.step) { roundStep = run.step; roundFrame = f; roundId = 'run'; }
        const k = f - roundFrame;
        if (k < 10) h.setPosition(S.x - sx * 6, S.z - sz * 6, S.rot);
        else if (k === 10) h.setPosition(S.x + sx * 1, S.z + sz * 1, S.rot);
        const list = rd.events;
        list.forEach((e, j) => {
          if (k !== 20 + j * rd.gap) return;
          const ob = PARIS_OBS[cid][e[0] - 1];
          const ev = e[1] === 'clear' ? 'obstacle:clear' : e[1] === 'fault' ? 'obstacle:fault' : 'obstacle:refusal';
          // Position près de l'obstacle (hors des lignes) au moment de l'événement.
          h.setPosition(ob.x, ob.z, ob.rot);
          game.bus.emit(ev, { obstacle: ob, dir: 1, cause: e[1] === 'fault' ? 'short' : undefined, causeText: e[1] === 'fault' ? 'Appel trop loin' : undefined });
          (out.ev ||= []).push([e[0], e[1], cid]);
        });
        const kf = 20 + (list.length - 1) * rd.gap + rd.fin;
        const fx = Math.sin(F.rot), fz = Math.cos(F.rot);
        if (!rd.elim && k === kf - 1) h.setPosition(F.x - fx * 1, F.z - fz * 1, F.rot);
        if (!rd.elim && k === kf) h.setPosition(F.x + fx * 1, F.z + fz * 1, F.rot);
        if (!rd.elim && k > kf) h.setPosition(F.x + fx * (1 + (k - kf) * 0.2), F.z + fz * (1 + (k - kf) * 0.2), F.rot);
      }
      if (kind === 'course' && st && (st.finished || st.eliminated)) roundId = 'done';
    }
    return out;
  };
}

function runMission(plan, { maxFrames = 40000 } = {}) {
  // Hasard de la partie (graine du Grand Prix, dossard) : propre à chaque scénario.
  rnd = mulberry32(plan.rng);
  const game = makeGame(plan.region);
  const mm = new MissionManager(game);
  game.missions = mm;
  mm.pushNotif = () => {};
  const def = PARIS_MISSION;
  const offer = { id: `story:${def.id}`, def, title: def.title, category: def.category, vertical: def.vertical, pay: def.pay, story: true };
  const script = parisScript(plan);
  mm.start(offer);
  const run = mm.active;
  // Appels du lancement (missions.start puis première étape : dialogue d'invitation), avant la première image.
  const begin = game.calls.filter((c) => c[0] === 'card' || c[0] === 'hud.dialog' || c[0] === 'hud.big' || c[0] === 'hud.toast').map((c) => [...c]);
  const frames = [], inputs = [];
  const dt = 1 / 30;
  let lastIn = '', lastKey = '';
  for (let f = 0; f < maxFrames && !game.outcome; f++) {
    game.calls.length = 0;
    const input = script(f, game, run) || {};
    const p = game.player;
    const fo = p.focus.pos;
    const cur = [r4(p.horse.pos.x), r4(p.horse.pos.z), r4(p.horse.heading), r4(fo.x), r4(fo.z), p.mode, p.inTruck ? 1 : 0, game.aboard.size, r4(game.truck.pos.x), r4(game.truck.pos.z), r4(game.truck.speed), game.region === 'paris' ? 1 : 0, Math.round(game.save.data.gameTime)];
    const k = JSON.stringify(cur);
    const hasIn = input.ev || input.btn || input.act || input.dlg || input.travel;
    if (k !== lastIn || hasIn) {
      inputs.push({ f, p: cur, ...input });
      lastIn = k;
    }
    mm.update(dt);
    const st = run.data.course;
    const row = { f, k: run.step?.kind || (run.finished ? 'end' : ''), txt: run.finished ? '' : run.text() };
    if (st) row.cs = [st.faults, st.refusals, st.next, r4(st.t), st.started ? 1 : 0, st.finished ? 1 : 0, st.eliminated ? 1 : 0, st.timeFaults, st.log.filter((l) => l.kind === 'rail').length];
    const keep = game.calls.filter((c) => c[0] === 'card' || c[0] === 'hud.dialog' || c[0] === 'hud.big' || c[0] === 'hud.toast');
    if (keep.length) row.calls = keep;
    if (game.outcome) row.out = game.outcome;
    const key = `${row.k}|${row.txt}|${row.cs ? [row.cs[0], row.cs[1], row.cs[2], row.cs[4], row.cs[5], row.cs[6]].join(',') : ''}`;
    if (key !== lastKey || row.calls || row.out || hasIn || f % 30 === 0) frames.push(row);
    lastKey = key;
  }
  return { seed: run.data.seed, bib: run.data.bib ?? null, region: plan.region, begin, frames, inputs, outcome: game.outcome || null, data: { sprintRank: run.data.sprintRank, order: run.data.order, barrage: !!run.data.barrage, final: run.data.final, pay: run.payOverride ?? null }, finished: !!game.save.data.flags.gameFinished };
}

// Manches : gap = images entre deux obstacles (1/30 s), fin = images du dernier obstacle à l'arrivée.
const clear = (cid) => PARIS_OBS[cid].map((o) => [o.num, 'clear']);
const plans = {
  // Trajet complet depuis Deauville ; Sprint gagné (sans faute, rapide), Grand Prix sans faute, barrage gagné.
  'paris-victoire': { region: 'deauville', rng: 4321,
    sprint: { course: 'paris_sprint', events: clear('paris_sprint'), gap: 140, fin: 120 },
    gp: { course: 'paris_gp', events: clear('paris_gp'), gap: 120, fin: 120 },
    barrage: { course: 'paris_gp', events: clear('paris_gp'), gap: 105, fin: 100 } },
  // Déjà à Paris : deux barres au Sprint, une barre au Grand Prix (pas de barrage), place au classement.
  'paris-barres': { region: 'paris', rng: 6203,
    sprint: { course: 'paris_sprint', events: clear('paris_sprint').map((e, j) => (j === 1 || j === 4 ? [e[0], 'fault'] : e)), gap: 150, fin: 150 },
    gp: { course: 'paris_gp', events: clear('paris_gp').map((e, j) => (j === 3 ? [e[0], 'fault'] : e)), gap: 130, fin: 130 } },
  // Deux refus au Sprint puis au Grand Prix : éliminé deux fois, dernier, rien payé.
  'paris-elimine': { region: 'paris', rng: 4000,
    sprint: { course: 'paris_sprint', events: [[1, 'clear'], [2, 'refusal'], [2, 'refusal']], gap: 200, fin: 0, elim: true },
    gp: { course: 'paris_gp', events: [[1, 'refusal'], [1, 'refusal']], gap: 200, fin: 0, elim: true } },
  // Grand Prix sans faute mais lent (temps dépassé : pénalités), puis classement.
  'paris-temps': { region: 'paris', rng: 8999,
    sprint: { course: 'paris_sprint', events: clear('paris_sprint'), gap: 160, fin: 150 },
    gp: { course: 'paris_gp', events: clear('paris_gp'), gap: 190, fin: 150 } },
  // Grand Prix sans faute, barrage avec une barre.
  'paris-barrage-faute': { region: 'paris', rng: 4321,
    sprint: { course: 'paris_sprint', events: clear('paris_sprint'), gap: 150, fin: 150 },
    gp: { course: 'paris_gp', events: clear('paris_gp'), gap: 120, fin: 120 },
    barrage: { course: 'paris_gp', events: clear('paris_gp').map((e, j) => (j === 2 ? [e[0], 'fault'] : e)), gap: 105, fin: 100 } },
};
const runs = {};
for (const [id, p] of Object.entries(plans)) runs[id] = runMission(p);

// ---------- Données du jeu ----------
const courseData = (c) => ({
  id: c.id, design: c.design, length: c.length, start: c.start, finish: c.finish,
  fences: PARIS_OBS[c.id].map((o) => ({ num: o.num, label: o.label, kind: o.kind, spread: o.spread, x: o.x, z: o.z, rot: o.rot, h: o.h, lineS: o.lineS })),
  line: c.line.map((p) => [r4(p.x), r4(p.z)]),
});
const dialogOf = (r, n) => {
  let k = 0;
  for (const f of r.frames) for (const c of f.calls || []) if (c[0] === 'hud.dialog' && k++ === n) return c.slice(1).map((l) => { const [who, initials, text] = l.split('|'); return { who, initials, text }; });
  return [];
};
const data = {
  schema: 'strides.paris_gp.v1',
  site: { ...PARIS, stands: PARIS_STANDS, floor: PARIS_FLOOR },
  a13: { deauville: A13.deauville, paris: A13.paris, trip: TRIP, aire: AIRE },
  gp: { riders: PARIS_GP.riders, prizes: PARIS_GP.prizes, sprintPrize: PARIS_GP.sprintPrize, gpHour: PARIS_GP.gpHour, sprint: PARIS_GP.sprint, gp: PARIS_GP.gp, joTa: Math.ceil(PARIS_GP.gp.ta * 0.86), xp: PARIS_MISSION.xp, bellDelay: 45, gateR: 9 },
  courses: { paris_sprint: courseData(PARIS_COURSES.paris_sprint), paris_gp: courseData(PARIS_COURSES.paris_gp) },
  warm: WARM.map((o) => ({ kind: o.kind, x: o.x, z: o.z, rot: o.rot, h: o.h, w: o.w })),
  // Dialogues relevés dans le vrai déroulé (graine et prénom de la partie factice : modèles, le jeu les recompose).
  invitation: dialogOf(runs['paris-victoire'], 0),
};
// Contrôle : tracés et obstacles identiques à ceux du vrai Obstacles du web (classe construite sur une scène factice).
{
  const { Obstacles } = await web('src/gameplay/obstacles.js');
  const g = { scene: stub(), terrain: { getHeight: () => 0 }, colliders: { addBox: () => ({}) }, world: { culled: [], detailTex: null }, bus: { on() {}, emit() {} } };
  let real = null;
  try {
    const ob = new Obstacles(g);
    real = ob.list.filter((o) => o.course === 'paris_sprint' || o.course === 'paris_gp' || o.course === PARIS_WARM).map((o) => [o.course, o.num, o.kind, r4(o.x), r4(o.z), r4(o.rot), o.h, o.w]);
  } catch (e) {
    console.log('Obstacles du web non construits hors navigateur :', e.message.slice(0, 120));
  }
  if (real) {
    const mine = [...PARIS_OBS.paris_sprint, ...PARIS_OBS.paris_gp, ...WARM].map((o) => [o.course, o.num || undefined, o.kind, r4(o.x), r4(o.z), r4(o.rot), o.h, o.w]);
    const norm = (a) => JSON.stringify(a.map((x) => x.map((v) => (v === 0 ? undefined : v))));
    if (norm(real) !== norm(mine)) { console.error('ÉCART obstacles de Paris', JSON.stringify(real).slice(0, 400), JSON.stringify(mine).slice(0, 400)); process.exit(2); }
    data.checkedAgainstObstacles = true;
    console.log('obstacles de Paris : identiques à Obstacles du web', real.length);
  }
}

const source = { webCommit: git('rev-parse', '--short', 'HEAD'), files: ['src/gameplay/parisGP.js', 'src/gameplay/parisCourse.js', 'src/gameplay/courses.js', 'src/gameplay/missions.js', 'src/gameplay/trip.js', 'src/gameplay/travel.js', 'src/world/sites.js', 'src/gameplay/obstacles.js'] };
const oracle = { schema: 'strides.paris_gp.oracle.v1', source, dt: 1 / 30, runs };
const out = [
  [join(ROOT, 'unreal/StridesGrandTour/Content/Data/paris_gp.json'), { ...data, source }],
  [join(ROOT, 'unreal/core/tests/oracles/paris_gp.json'), oracle],
];
let diff = 0;
for (const [path, obj] of out) {
  const text = JSON.stringify(obj) + '\n';
  const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const stripC = (s) => s.replace(/"webCommit":"[^"]*"/, '');
  if (stripC(old) === stripC(text)) { console.log('inchangé', path); continue; }
  diff++;
  if (CHECK) console.log('DIFFÉRENT', path);
  else { writeFileSync(path, text); console.log('écrit', path, `${(text.length / 1024).toFixed(0)} Ko`); }
}
for (const [id, r] of Object.entries(runs)) console.log(id, r.frames.length, 'images', r.inputs.length, 'entrées', JSON.stringify(r.data), JSON.stringify(r.outcome));
if (CHECK && diff) process.exit(1);
