// Tour complet de l'épreuve de CSO en émulation iPhone 13 (paysage 844 × 390, écran tactile) : vrais événements
// tactiles — doigt gauche sur le joystick flottant (gauche/droite pour tourner, vers l'avant pour prendre la cadence :
// le cheval part de l'arrêt à l'entrée de piste), doigt droit sur le gros bouton SAUT (un appui par obstacle) pendant
// que le gauche dirige ; présentation et bilan touchés au doigt. Captures dans tests/e2e/out/cso/touch-*.png.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const cdp = await ctx.newCDPSession(page);
const touches = new Map();
const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.entries()].map(([id, p]) => ({ id, x: p[0], y: p[1] })) });
const tapAt = async (x, y) => {
  touches.set(9, [x, y]);
  await send('touchStart');
  touches.delete(9);
  await send('touchEnd');
};
const tapSel = async (sel) => {
  const bb = await page.locator(sel).boundingBox();
  await tapAt(bb.x + bb.width / 2, bb.y + bb.height / 2);
};
const tick = (n = 1) => page.evaluate((k) => window.__auto.tick(k), n);
const shot = async (name) => {
  await page.evaluate(() => { const g = window.__game; g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky); g.renderer.render(g.scene, g.camera); });
  await page.screenshot({ path: `tests/e2e/out/cso/touch-${name}.png` });
};

// Mise en place : à cheval à l'entrée de piste, épreuve « Parcours du Pôle » lancée.
await page.evaluate(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  const O = await import('/src/gameplay/obstacles.js');
  window.__O = O;
  A.mount();
  g.player.horse.setPosition(O.CSO_GATE.x, O.CSO_GATE.z + 4, Math.PI);
  g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
  A.tick(6);
  // Ligne suivie par le « cavalier » : l'abord dessiné de l'entrée à la ligne de départ (CSO_TRACE.leadIn), puis le tracé.
  const { CSO_TRACE } = await import('/src/gameplay/csoCourse.js');
  const { POLE } = await import('/src/world/sites.js');
  const lead = CSO_TRACE.leadIn.map((p) => ({ x: POLE.arena.x + p.x, z: POLE.arena.z + p.z }));
  window.__line = lead.slice(0, -1).concat(O.CSO_LINE);
  window.__k = 0;
  window.__pressed = new Set();
  window.__cad = { first: undefined, max: 0 };
  // Ce que ferait le cavalier à cet instant : direction (joystick x), cadence (joystick y : vers l'avant tant qu'elle
  // est sous le galop de concours, vers l'arrière au-dessus, relâché entre les deux) et appel (au cœur de la bonne
  // zone, une fois par obstacle).
  window.__decide = () => {
    const h = g.player.horse, line = window.__line;
    let best = window.__k, bd = 1e9;
    for (let j = window.__k; j < Math.min(line.length, window.__k + 60); j++) {
      const d = Math.hypot(line[j].x - h.pos.x, line[j].z - h.pos.z);
      if (d < bd) { bd = d; best = j; }
    }
    window.__k = best;
    const t = line[Math.min(line.length - 1, best + 12)];
    let d = Math.atan2(t.x - h.pos.x, t.z - h.pos.z) - h.heading;
    d = (((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const tg = g.obstacles.target(h);
    let jump = false;
    if (h.jumpT < 0 && tg && !window.__pressed.has(tg.o.label) && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) {
      window.__pressed.add(tg.o.label);
      jump = true;
    }
    const st = g.missions.active?.data.course;
    const cad = g.player.csoCadence ?? 0;
    const C = window.__cad;
    if (C.first === undefined) C.first = { cad, v: +h.speed.toFixed(2) };
    C.max = Math.max(C.max, cad);
    const y = cad < 6.12 ? 1 : cad > 6.45 ? -1 : 0;
    return { x: Math.max(-1, Math.min(1, -d * 2.2)), y, jump, done: !!st?.finished || !g.missions.active || st?.eliminated, R: g.input.R, label: tg?.o.label, btn: document.querySelector('.btn-jump span')?.textContent };
  };
  window.__ev = [];
  for (const k of ['obstacle:clear', 'obstacle:fault', 'obstacle:refusal']) g.bus.on(k, (e) => window.__ev.push(`${k.split(':')[1]}:${e.obstacle.label}`));
});

// Présentation : « Voir le plan », « Retour », « Entrer en piste » au doigt.
await tapSel('.overlay [data-id="plan"]');
const plan = await page.evaluate(() => !!document.querySelector('.overlay .course-plan'));
await tapSel('.overlay [data-id="plan-back"]');
await tapSel('.overlay [data-id="enter"]');
await tick(90);
check('présentation et plan au doigt', plan);

// Parcours : doigt gauche sur le joystick, doigt droit sur SAUT au bon moment. Chaque doigt a son identifiant de
// pointeur tactile (comme sur l'iPhone) : lever le doigt de SAUT ne lâche pas le joystick. (L'émulation tactile du
// navigateur relâche tous les doigts à la fois : le doigt du joystick passe donc par ses propres événements de pointeur
// tactile, le doigt de SAUT par l'émulation.)
const JX = 150, JY = 300;
const finger = (type, id, x, y) => page.evaluate(([type, id, x, y]) => {
  const target = type === 'pointerdown' ? document.elementFromPoint(x, y) : window;
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 9001, clientX: x, clientY: y }));
}, [type, id, x, y]);
await finger('pointerdown', 9001, JX, JY);
let shots = 0, pressedWhileTurning = 0, labels = [];
for (let i = 0; i < 2600; i++) {
  const dcs = await page.evaluate(() => window.__decide());
  if (dcs.done) break;
  // Doigt gauche : gauche/droite pour diriger, vers le haut pour la cadence ; jamais au-delà du bord du joystick (sa
  // base flottante suivrait le doigt).
  let jx = dcs.x * 0.9, jy = dcs.y * 0.9;
  const jm = Math.hypot(jx, jy);
  if (jm > 0.95) (jx *= 0.95 / jm), (jy *= 0.95 / jm);
  await finger('pointermove', 9001, JX + jx * dcs.R, JY - jy * dcs.R);
  if (dcs.jump) {
    if (Math.abs(dcs.x) > 0.05) pressedWhileTurning++;
    labels.push(`${dcs.label}:${dcs.btn}`);
    const bb = await page.locator('.btn-jump').boundingBox();
    const bx = bb.x + bb.width / 2, by = bb.y + bb.height / 2;
    // Doigt droit : vrai toucher (émulation tactile du navigateur), le doigt gauche reste posé sur le joystick.
    touches.set(2, [bx, by]);
    await send('touchStart');
    await tick(1);
    touches.delete(2);
    await send('touchEnd');
  }
  await tick(2);
  if (shots === 0 && dcs.label === '2' && dcs.btn === 'Saute !') { await shot('abord'); shots++; }
  if (shots === 1 && dcs.label === '4B') { await shot('double'); shots++; }
  if (process.env.DBG && i % 25 === 0) console.log(i, JSON.stringify(await page.evaluate(() => { const h = window.__game.player.horse, A = window.__game.obstacles; return { k: window.__k, n: window.__line.length, x: +(h.pos.x - 330).toFixed(1), z: +(h.pos.z + 224).toFixed(1), hd: +h.heading.toFixed(2), sp: +h.speed.toFixed(1), mv: +window.__game.input.move.x.toFixed(2), cad: window.__game.player.csoCadence, next: window.__game.missions.active?.data.course?.next }; })));
}
await finger('pointerup', 9001, JX, JY);
await tick(30);
await shot('arrivee');
// (sortie de piste en mode concours, ~2,6 s après l'arrivée, puis le bilan)
for (let i = 0; i < 120 && !(await page.evaluate(() => !!document.querySelector('.overlay [data-id="cso-done"]'))); i++) await tick(1);
const res = await page.evaluate(() => ({ ev: window.__ev, cad: window.__cad, st: { ...window.__game.missions.active?.data.course, log: undefined, wrong: undefined }, card: document.querySelector('.overlay .card')?.textContent || '' }));
const order = ['1', '2', '3', '4A', '4B', '5', '6A', '6B', '7', '8'];
check('cadence prise au doigt (joystick vers l’avant) depuis l’arrêt à l’entrée de piste', res.cad.first && res.cad.first.cad < 1 && res.cad.max >= 6.1 && res.cad.max < 6.8, JSON.stringify(res.cad));
check('tour complet au doigt : 10 éléments franchis sans faute, dans l’ordre', JSON.stringify(res.ev) === JSON.stringify(order.map((l) => `clear:${l}`)), JSON.stringify(res.ev));
check('chrono dans le temps accordé', res.st.finished && res.st.t < 64 && res.st.faults === 0, `${res.st.t?.toFixed(2)} s`);
check('SAUT touché une fois par obstacle, quand le bouton affichait « Saute ! »', labels.length === order.length && labels.every((l) => l.endsWith('Saute !')) && JSON.stringify(labels.map((l) => l.split(':')[0])) === JSON.stringify(order), labels.join(' '));
check('le doigt gauche dirigeait encore pendant certains appuis sur SAUT (multitouch)', pressedWhileTurning > 0, String(pressedWhileTurning));
check('bilan affiché à l’arrivée', /Classement/.test(res.card));
await page.screenshot({ path: 'tests/e2e/out/cso/touch-bilan.png' });
// Quitter l'épreuve au doigt : caméra et commandes du monde ouvert.
await tapSel('.overlay [data-id="cso-done"]');
await tick(5);
await page.evaluate(() => window.__auto.closeCards());
await tick(60);
const back = await page.evaluate(() => ({ course: window.__game.course, fov: window.__game.camera.fov, light: document.querySelector('.hud').classList.contains('cso-ctl') }));
check('retour à la caméra et au HUD d’exploration', back.course === null && back.fov > 58 && !back.light, JSON.stringify(back));
check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'CSO TACTILE OK');
await browser.close();
process.exit(fails ? 1 : 0);
