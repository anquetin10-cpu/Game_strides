// Écurie à couloir central (iPhone paysage 667×308) : on entre par la porte de l'allée transversale, on longe l'allée
// entre les boxes, les façades de box arrêtent le joueur, on entre dans la sellerie, la caméra reste sous la charpente.
// Usage : BASE=… node tests/e2e/barn.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 667, height: 308 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
});
// Marche dans une direction du monde (cap de la caméra fixé), renvoie la position et la caméra.
const walk = (x, z, yaw, secs, stop = null) => page.evaluate(([x, z, yaw, secs, stop]) => {
  const A = window.__auto, g = window.__game, p = g.player;
  if (x !== null) { p.human.setPosition(x, z, yaw + Math.PI); p.human.snap(); g.cam.snap(p.focus.pos, yaw + Math.PI); }
  let maxCam = -1e9, ceilOk = true;
  for (let i = 0; i < secs * 30; i++) {
    g.cam.yaw = yaw;
    g.cam.lastManual = g.time;
    g.input.setVirtualMove(0, 1);
    A.tick(1);
    if (stop && (stop[0] === 'z<' ? p.human.pos.z < stop[1] : p.human.pos.x < stop[1])) break;
    const cp = g.camera.position, cs = g.colliders;
    const cl = cs.ceilingAt(p.human.pos.x, p.human.pos.z);
    if (cl) {
      const cy = cs.ceilingY(cl, cp.x, cp.z, 0);
      if (cy !== null && cp.y > cy + 0.05) ceilOk = false;
      maxCam = Math.max(maxCam, cp.y - p.human.pos.y);
    }
  }
  g.input.setVirtualMove(0, 0);
  A.tick(2);
  return { x: p.human.pos.x, z: p.human.pos.z, ceilOk, maxCam };
}, [x, z, yaw, secs, stop]);

// 1. Depuis la cour, par la porte de l'allée transversale (x ≈ -114) : vers -z.
const r1 = await walk(-113.9, 162, 0, 8, ['z<', 150.2]);
check('entrée par la porte de l’allée transversale', r1.z < 150.6 && r1.z > 149, `x ${r1.x.toFixed(1)} z ${r1.z.toFixed(1)}`);
// 2. Dans l'allée centrale vers l'ouest, entre les boxes.
const r2 = await walk(null, null, Math.PI / 2, 12, ['x<', -140]);
const r2b = await page.evaluate(() => window.__game.colliders.ceilingAt(window.__game.player.human.pos.x, window.__game.player.human.pos.z) !== null);
check('le joueur est bien sous le toit de l’écurie', r2b);
check('l’allée centrale se parcourt jusqu’au fond', r2.x < -136 && Math.abs(r2.z - 150) < 1.8, `x ${r2.x.toFixed(1)} z ${r2.z.toFixed(1)}`);
check('caméra sous la charpente dans l’allée', r2.ceilOk, `hauteur caméra ${r2.maxCam.toFixed(2)} m`);
// 3. Contre une façade de box : on ne traverse pas.
const r3 = await walk(-128, 150, Math.PI, 3);
check('les façades de box arrêtent le joueur', r3.z < 151.8, `z ${r3.z.toFixed(2)}`);
// 4. Sellerie (porte au centre du module, côté cour).
const r4 = await walk(-101.15, 150, Math.PI, 4);
check('on entre dans la sellerie par sa porte', r4.z > 152.3 && r4.z < 155.8, `z ${r4.z.toFixed(2)}`);
check('caméra sous le plafond de la sellerie', r4.ceilOk, `hauteur caméra ${r4.maxCam.toFixed(2)} m`);
// 5. Par le pignon est, à cheval.
const r5 = await page.evaluate(() => {
  const A = window.__auto, g = window.__game, p = g.player, h = g.mainHorse;
  h.setPosition(-90, 150, -Math.PI / 2);
  p.human.setPosition(-90, 151.5, 0);
  A.tick(2);
  p.mount();
  for (let i = 0; i < 240; i++) { g.cam.yaw = Math.PI / 2; g.cam.lastManual = g.time; g.input.setVirtualMove(0, 0.35); A.tick(1); }
  g.input.setVirtualMove(0, 0);
  A.tick(2);
  return { x: h.pos.x, z: h.pos.z, mode: p.mode };
});
check('à cheval par la porte du pignon est, dans l’allée', r5.mode === 'ride' && r5.x < -100 && Math.abs(r5.z - 150) < 1.8, `x ${r5.x.toFixed(1)} z ${r5.z.toFixed(1)}`);
await page.evaluate(() => { window.__auto.closeCards(); window.__game.hud.notifEl?.classList.remove('show'); window.__game.cam.yaw = -Math.PI / 2; window.__auto.startLoop(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/e2e/out/barn-ride.png' });
check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? `ÉCURIE : ${fails} échec(s)` : 'ÉCURIE OK');
process.exit(fails ? 1 : 0);
