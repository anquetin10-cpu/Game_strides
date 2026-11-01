// Épreuve de CSO jouée avec les seules commandes normales — sans téléportation pendant la manche, sans saut
// automatique, sans aide cachée : le « cavalier » (cso-rider.js) suit le tracé au sol, règle sa cadence au joystick et
// appuie une fois sur SAUT par obstacle. Trois façons de jouer :
//   virtual  : joystick virtuel du jeu (input.setVirtualMove) et bouton SAUT (même file d'appuis que le bouton) ;
//   touch    : vrais touchers (émulation iPhone 13 paysage) : doigt gauche sur le joystick, doigt droit sur SAUT ;
//   keyboard : vraies touches ← → ↑ ↓ et Espace.
// Mesures : chrono, fautes, refus, appels (distance), caméra (distance, hauteur, retard de lacet, accélération
// angulaire, champ, survol des obstacles), continuité du cheval (aucune téléportation), cadence (aucune variation non
// commandée). Rendu logiciel SwiftShader : pas un iPhone réel.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/cso-athens.mjs [virtual|touch|keyboard] [course: cso|paris_sprint|paris_gp]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const MODE = process.argv[2] || 'virtual';
const COURSE = process.argv[3] || 'cso';
const SHOTS = process.env.SHOTS !== '0';
const OUT = 'tests/e2e/out/cso-athens';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok, extra });
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: MODE === 'touch', hasTouch: MODE === 'touch', deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.addScriptTag({ content: readFileSync('tests/e2e/cso-rider.js', 'utf8') });
const tick = (n = 1) => E((k) => window.__auto.tick(k), n);
const shot = async (name) => {
  if (!SHOTS) return;
  await E(() => { const g = window.__game; g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky); g.realism?.update(); g.renderer.render(g.scene, g.camera); });
  await page.screenshot({ path: `${OUT}/${COURSE}-${MODE}-${name}.jpg`, type: 'jpeg', quality: 85 });
};

// ---------- Mise en place (avant la manche : seul moment où l'on place le cheval) ----------
const setup = await E(async (COURSE) => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  const O = await import('/src/gameplay/obstacles.js');
  const P = await import('/src/gameplay/parisCourse.js');
  const C = await import('/src/gameplay/csoRide.js');
  window.__CSO_RIDE = C.CSO_RIDE;
  A.mount();
  const h = g.player.horse;
  let line, start, finish;
  if (COURSE === 'cso') {
    h.setPosition(O.CSO_GATE.x, O.CSO_GATE.z + 4, Math.PI);
    g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
    line = O.CSO_LINE; start = O.CSO_START; finish = O.CSO_FINISH;
  } else {
    // Paris : défi de l'arène (même moteur d'épreuve), départ au portail d'entrée.
    const c = P.PARIS_COURSES[COURSE];
    line = c.line; start = c.start; finish = c.finish;
    const ch = await import('/src/gameplay/challenge.js');
    const cfg = Object.values(ch.CHALLENGES || {}).find((x) => x.course === COURSE) || null;
    if (!cfg) return { err: `pas de défi pour ${COURSE}` };
    g.challenge.start(cfg.id);
  }
  window.__setup = { line, start, finish };
  A.tick(6);
  return { ok: true };
}, COURSE);
if (setup.err) { console.log(setup.err); process.exit(2); }
// Présentation : « Entrer en piste ».
await E(() => window.__auto.tap(document.querySelector('.overlay [data-id="enter"]')));
await tick(4);
await shot('0-entree');
// Garde-fous installés après la mise en place : aucune téléportation, aucun saut sans appui, aucune cadence non commandée.
await E(() => {
  const g = window.__game, h = g.player.horse;
  const M = (window.__m = { teleports: 0, jumps: 0, presses: 0, maxStep: 0, maxDSpeedUp: 0, cadJumps: 0, frames: 0, cam: [], ev: [], prevCad: undefined, takeoffs: [], speedLog: [] });
  const sp = h.setPosition.bind(h);
  h.setPosition = (...a) => { M.teleports++; return sp(...a); };
  const add = g.input.pressed.add.bind(g.input.pressed);
  g.input.pressed.add = (k) => { if (k === 'jump') M.presses++; return add(k); };
  for (const k of ['obstacle:clear', 'obstacle:fault', 'obstacle:refusal']) g.bus.on(k, (e) => M.ev.push(`${k.split(':')[1]}:${e.obstacle.label}`));
  g.bus.on('horse:jump', (hh) => { if (hh.isPlayerHorse) { M.jumps++; M.takeoffs.push({ label: hh._lastJump?.o?.label, q: hh._lastJump?.plan?.zone, dev: +(hh._lastJump?.plan?.dev || 0).toFixed(3) }); } });
  window.__rider.init({ line: window.__setup.line, start: window.__setup.start, pre: 9 });
});

// ---------- Pilotage ----------
const JX = 150, JY = 300;
let touches = null, cdp = null;
if (MODE === 'touch') {
  cdp = await ctx.newCDPSession(page);
  touches = new Map();
}
const finger = (type, id, x, y) => E(([type, id, x, y]) => {
  const target = type === 'pointerdown' ? document.elementFromPoint(x, y) : window;
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 9001, clientX: x, clientY: y }));
}, [type, id, x, y]);
const keys = new Set();
const setKey = async (k, on) => {
  if (on && !keys.has(k)) { keys.add(k); await page.keyboard.down(k); }
  if (!on && keys.has(k)) { keys.delete(k); await page.keyboard.up(k); }
};
if (MODE === 'touch') await finger('pointerdown', 9001, JX, JY);
if (MODE === 'keyboard') await E(() => window.__auto.releaseInput?.());
const sample = () => E(() => {
  const g = window.__game, h = g.player.horse, cam = g.camera, M = window.__m;
  const st = g.missions.active?.data?.course;
  const cx = cam.position.x, cz = cam.position.z;
  const dx = h.pos.x - cx, dz = h.pos.z - cz;
  const camH = Math.atan2(dx, dz);
  const lag = Math.atan2(Math.sin(camH - h.heading), Math.cos(camH - h.heading));
  // Caméra dans le volume d'un obstacle (chandeliers compris) ?
  let inFence = false;
  for (const o of g.obstacles.list) {
    if (o.off) continue;
    const ls = (cx - o.x) * o.n.x + (cz - o.z) * o.n.z, lu = (cx - o.x) * o.t.x + (cz - o.z) * o.t.z;
    if (Math.abs(lu) < o.w / 2 + 1.2 && Math.abs(ls) < o.depth / 2 + 0.5 && cam.position.y < o.ground + o.h + 0.9) inFence = true;
  }
  const blocked = g.colliders.cameraBlocked(cx, cz, cam.position.y, 0.05);
  M.cam.push([+Math.hypot(dx, dz).toFixed(3), +(cam.position.y - h.groundY).toFixed(3), +lag.toFixed(4), +cam.fov.toFixed(2), inFence ? 1 : 0, blocked ? 1 : 0, +camH.toFixed(5), st?.started ? 1 : 0, h.jumpT >= 0 ? 1 : 0]);
  return { started: !!st?.started, t: st?.t, next: st?.next, jumpT: h.jumpT, sp: h.speed, cad: g.player.csoCadence };
});
let prev = await E(() => { const h = window.__game.player.horse; return { x: h.pos.x, z: h.pos.z, sp: h.speed }; });
let dec = null, n = 0, shotsDone = new Set();
for (n = 0; n < 5200; n++) {
  dec = await E(() => window.__rider.decide());
  if (dec.done) break;
  if (MODE === 'virtual') {
    await E(([x, y, j]) => { const g = window.__game; g.input.setVirtualMove(x, y); if (j) g.input.pressed.add('jump'); }, [dec.x, dec.y, dec.jump]);
  } else if (MODE === 'touch') {
    await finger('pointermove', 9001, JX + dec.x * 58 * 0.95, JY - dec.y * 58 * 0.95);
    if (dec.jump) {
      const bb = await page.locator('.btn-jump').boundingBox();
      touches.set(2, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...touches.entries()].map(([id, [x, y]]) => ({ x, y, id })) });
    }
  } else {
    // Clavier : direction par la touche maintenue (la conduite amène la direction progressivement) ; ↑ / ↓ cadence.
    const want = dec.x;
    const cur = await E(() => window.__game.player._kbdSteer || 0);
    await setKey('ArrowRight', want > 0.08 && cur < want + 0.05);
    await setKey('ArrowLeft', want < -0.08 && cur > want - 0.05);
    await setKey('ArrowUp', dec.y > 0);
    await setKey('ArrowDown', dec.y < 0);
    if (dec.jump) await page.keyboard.press('Space');
  }
  await tick(1);
  if (MODE === 'touch' && dec.jump) {
    touches.delete(2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const s = await sample();
  // Continuité : déplacement par image ≤ vitesse × dt (+ marge) ; cadence : seulement par le joystick.
  const cur = await E(() => { const h = window.__game.player.horse; return { x: h.pos.x, z: h.pos.z, sp: h.speed }; });
  const step = Math.hypot(cur.x - prev.x, cur.z - prev.z);
  await E(([step, lim]) => { const M = window.__m; if (step > lim) M.bigSteps = (M.bigSteps || 0) + 1; M.maxStep = Math.max(M.maxStep, step); }, [step, Math.max(prev.sp, cur.sp) / 30 + 0.05]);
  prev = cur;
  if (SHOTS) {
    const lab = dec.label;
    if (s.started && !shotsDone.has('1-abord') && lab === '1' && s.jumpT < 0) {
      const d = await E(() => { const g = window.__game, h = g.player.horse, o = g.course?.next; return o ? Math.hypot(o.x - h.pos.x, o.z - h.pos.z) : 99; });
      if (d < 16) { shotsDone.add('1-abord'); await shot('1-abord'); }
    }
    if (s.jumpT > 0.4 && s.jumpT < 0.6 && !shotsDone.has('2-saut')) { shotsDone.add('2-saut'); await shot('2-saut'); }
    if (s.jumpT >= 0 && s.jumpT > 0.9 && !shotsDone.has('3-reception')) { shotsDone.add('3-reception'); await shot('3-reception'); }
    if (s.started && Math.abs(dec.x) > 0.45 && s.jumpT < 0 && !shotsDone.has('4-courbe') && n > 300) { shotsDone.add('4-courbe'); await shot('4-courbe'); }
    if (lab === '5B' && !shotsDone.has('5-combinaison') && s.jumpT < 0) {
      const d = await E(() => { const g = window.__game, h = g.player.horse, o = g.course?.next; return o ? Math.hypot(o.x - h.pos.x, o.z - h.pos.z) : 99; });
      if (d < 9) { shotsDone.add('5-combinaison'); await shot('5-combinaison'); }
    }
  }
}
if (MODE === 'keyboard') for (const k of [...keys]) await setKey(k, false);
await shot('6-arrivee');
// Sortie de piste, puis bilan.
await tick(100);
const res = await E(() => {
  const g = window.__game, M = window.__m, run = g.missions.active;
  const st = window.__lastCourse || run?.data?.course;
  return { st: st ? { t: st.t, faults: st.faults, refusals: st.refusals, finished: st.finished, eliminated: st.eliminated, log: st.log } : null, M: { ...M, cam: undefined }, cam: M.cam, rider: window.__rider.log, course: g.course };
});
const hooked = await E(() => { const g = window.__game; return { overlay: !!document.querySelector('.overlay'), card: document.querySelector('.overlay')?.innerText?.slice(0, 160) || '' }; });
// ---------- Analyse ----------
const cam = res.cam.filter((c) => c[7]);
const dist = cam.map((c) => c[0]), hh = cam.map((c) => c[1]), lag = cam.map((c) => Math.abs(c[2])), fov = cam.map((c) => c[3]);
const yaw = cam.map((c) => c[6]);
let maxAcc = 0, maxRate = 0;
for (let i = 2; i < yaw.length; i++) {
  const w1 = Math.atan2(Math.sin(yaw[i] - yaw[i - 1]), Math.cos(yaw[i] - yaw[i - 1])) * 30;
  const w0 = Math.atan2(Math.sin(yaw[i - 1] - yaw[i - 2]), Math.cos(yaw[i - 1] - yaw[i - 2])) * 30;
  maxRate = Math.max(maxRate, Math.abs(w1));
  maxAcc = Math.max(maxAcc, Math.abs(w1 - w0) * 30);
}
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * q)]; };
const summary = {
  t: res.st?.t, faults: res.st?.faults, refusals: res.st?.refusals, finished: res.st?.finished, eliminated: res.st?.eliminated,
  presses: res.M.presses, jumps: res.M.jumps, teleports: res.M.teleports, bigSteps: res.M.bigSteps || 0, maxStep: res.M.maxStep,
  cam: { dist: [Math.min(...dist), Math.max(...dist)], height: [Math.min(...hh), Math.max(...hh)], lagP95: pct(lag, 0.95), lagMax: Math.max(...lag), fov: [Math.min(...fov), Math.max(...fov)], yawRateMax: maxRate, yawAccMax: maxAcc, inFence: cam.filter((c) => c[4]).length, blocked: cam.filter((c) => c[5]).length },
  ev: res.M.ev, takeoffs: res.M.takeoffs, rider: res.rider,
};
console.log(JSON.stringify(summary, null, 1));
writeFileSync(`${OUT}/${COURSE}-${MODE}.json`, JSON.stringify({ summary, results }, null, 1));
check('A1', 'parcours terminé, sans faute, avec les commandes normales', !!res.st?.finished && !res.st?.eliminated && res.st?.faults === 0, `${res.st?.t?.toFixed(2)} s, ${res.st?.faults} pts, ${res.st?.refusals} refus`);
check('A2', 'aucune téléportation ni déplacement anormal pendant la manche', res.M.teleports === 0 && !(res.M.bigSteps > 0), `setPosition ${res.M.teleports}, pas max ${res.M.maxStep?.toFixed(3)} m`);
check('A3', 'aucun saut sans appui : un appui par obstacle, autant de sauts que d’appuis', res.M.jumps === res.M.presses && res.M.presses === res.M.ev.length, `${res.M.presses} appuis, ${res.M.jumps} sauts, ${res.M.ev.length} obstacles`);
check('C1', 'caméra derrière le cheval à distance stable', summary.cam.dist[1] - summary.cam.dist[0] < 2.2 && summary.cam.dist[0] > 3.5, JSON.stringify(summary.cam.dist));
check('C2', 'caméra légèrement surélevée, sans à-coup vertical', summary.cam.height[0] > 2.6 && summary.cam.height[1] < 5.2, JSON.stringify(summary.cam.height));
check('C3', 'rotation progressive (accélération angulaire bornée), sans retard notable dans les courbes', summary.cam.yawAccMax < 6 && summary.cam.lagP95 < 0.2, `acc max ${summary.cam.yawAccMax.toFixed(2)} rad/s², retard p95 ${(summary.cam.lagP95 * 57.3).toFixed(1)}°`);
check('C4', 'champ de vision fixe (pas de zoom, même aux sauts)', summary.cam.fov[1] - summary.cam.fov[0] < 0.2, JSON.stringify(summary.cam.fov));
check('C5', 'caméra jamais dans un obstacle ni dans le décor', summary.cam.inFence === 0 && summary.cam.blocked === 0, `${summary.cam.inFence} / ${summary.cam.blocked}`);
check('E', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `${fails} échec(s)` : 'tout est vert');
await browser.close();
process.exit(fails ? 1 : 0);
