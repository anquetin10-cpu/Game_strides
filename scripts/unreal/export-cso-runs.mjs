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
    cur = null;
    frames.push(rec);
    return rec;
  };
  const input = (o = {}) => ({ move: o.move || [0, 0], keys: o.keys || [], held: o.held || [], jump: !!o.jump, ui: o.ui || null });

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
    const pose = { x: S.x - Math.sin(S.rot) * sc.before, z: S.z - Math.cos(S.rot) * sc.before, h: S.rot };
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
    return {
      seed, dt: DT, day, gameTime: g.save.data.gameTime, time: g.time, playerName: g.save.data.playerName, horseName: h.name, horseId: h.id,
      horse: { x: R6(pose.x), z: R6(pose.z), h: R6(pose.h), v: 0 },
      start: { x: R6(S.x), z: R6(S.z), rot: R6(S.rot), w: S.w },
      calls: { ev: startCalls.ev, hud: startCalls.hud, audio: startCalls.audio },
      rails: rails0,
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
for (const sc of SCENARIOS) {
  for (const lang of ['fr', 'en']) {
    const t0 = Date.now();
    const { ctx, page, audioNames } = await openGame(lang);
    audioRecorded = audioNames;
    const setup = await page.evaluate(([s, seed]) => window.__parite.setup(s, seed), [sc, 20261118]);
    const frames = await page.evaluate((s) => window.__parite.runDroit(s), sc);
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
  state: 'après g.update(dt) : horse (pos, cap, vitesse, jumpT, jumpY, cadence de concours, mode), run (étape i, stepT, texte, état du parcours), course (game.course), board (tableau de chrono : données et textes), cam (œil, cible, direction, FOV, aspect), rails (barres dont la transformée locale [x, y, z, rx, ry, rz] a changé depuis l’image précédente ; état initial dans setup.rails), ev (bus), hud / audio (appels de premier niveau)',
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
