// Tour complet de l'épreuve de CSO en émulation iPhone 13 (paysage 844 × 390, écran tactile) : vrais événements
// tactiles — doigt gauche sur le joystick flottant (gauche/droite pour tourner), doigt droit sur le gros bouton SAUT
// pendant que le gauche dirige ; présentation et bilan touchés au doigt. Captures dans tests/e2e/out/cso/touch-*.png.
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
  // Ligne suivie par le « cavalier » : de l'entrée à la ligne de départ, puis le tracé.
  const { CSO_START: S, CSO_LINE, CSO_GATE: G } = O;
  const pts = [{ x: G.x, z: G.z }, { x: G.x - 30, z: G.z }, { x: S.x + 8, z: G.z }, { x: S.x + 2, z: G.z - 3 }, { x: S.x, z: S.z + 4 }, { x: S.x, z: S.z }];
  const dense = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const n = Math.max(1, Math.round(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) / 0.5));
    for (let k = 0; k < n; k++) dense.push({ x: pts[i].x + ((pts[i + 1].x - pts[i].x) * k) / n, z: pts[i].z + ((pts[i + 1].z - pts[i].z) * k) / n });
  }
  window.__line = dense.concat(CSO_LINE);
  window.__k = 0;
  window.__pressed = new Set();
  // Ce que ferait le cavalier à cet instant : direction (joystick x) et appel (au cœur de la bonne zone, une fois).
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
    return { x: Math.max(-1, Math.min(1, -d * 2.2)), jump, done: !!st?.finished || !g.missions.active || st?.eliminated, R: g.input.R, label: tg?.o.label, btn: document.querySelector('.btn-jump span')?.textContent };
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
  await finger('pointermove', 9001, JX + dcs.x * dcs.R * 0.9, JY);
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
  if (shots === 1 && dcs.label === '5B') { await shot('double'); shots++; }
  if (process.env.DBG && i % 25 === 0) console.log(i, JSON.stringify(await page.evaluate(() => { const h = window.__game.player.horse, A = window.__game.obstacles; return { k: window.__k, n: window.__line.length, x: +(h.pos.x - 330).toFixed(1), z: +(h.pos.z + 224).toFixed(1), hd: +h.heading.toFixed(2), sp: +h.speed.toFixed(1), mv: +window.__game.input.move.x.toFixed(2), cad: window.__game.player.csoCadence, next: window.__game.missions.active?.data.course?.next }; })));
}
await finger('pointerup', 9001, JX, JY);
await tick(30);
await shot('arrivee');
const res = await page.evaluate(() => ({ ev: window.__ev, st: { ...window.__game.missions.active?.data.course, log: undefined, wrong: undefined }, card: document.querySelector('.overlay .card')?.textContent || '' }));
check('tour complet au doigt : 9 éléments franchis sans faute, dans l’ordre', JSON.stringify(res.ev) === JSON.stringify(['1', '2', '3', '4', '5A', '5B', '6', '7', '8'].map((l) => `clear:${l}`)), JSON.stringify(res.ev));
check('chrono dans le temps accordé', res.st.finished && res.st.t < 65 && res.st.faults === 0, `${res.st.t?.toFixed(2)} s`);
check('SAUT touché quand le bouton affichait « Saute ! »', labels.length === 9 && labels.every((l) => l.endsWith('Saute !')), labels.join(' '));
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
