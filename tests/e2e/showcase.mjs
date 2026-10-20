// Mises en scène pour revue visuelle (rendu ponctuel, boucle arrêtée).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const W = +(process.argv[2] || 844), H = +(process.argv[3] || 390);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/?autostart');
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(() => { window.__auto.stopLoop(); window.__auto.closeCards(); });
const scene = async (name, fn, arg) => {
  await page.evaluate(fn, arg);
  await page.evaluate(() => { const g = window.__game; g.hud.minimap._acc = 1; g.hud.update(0.05); g.renderer.render(g.scene, g.camera); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `tests/e2e/out/show-${name}.png` });
};
// 1. Galop sur la plage.
await scene('beach', () => {
  const A = window.__auto, g = window.__game;
  A.mount();
  g.save.data.gameTime = 17.8 * 3600;
  g.player.horse.setPosition(200, -412, -Math.PI / 2);
  g.cam.yaw = -Math.PI / 2 + Math.PI + 0.5;
  g.cam.pitch = 0.22;
  for (let i = 0; i < 60; i++) { A.steer(-1, 0, 1); g.input.held.add('gallop'); A.tick(1); }
});
// 2. Saut en carrière.
await scene('jump', () => {
  const A = window.__auto, g = window.__game;
  const o = g.obstacles.ofCourse('cso')[2];
  const h = g.player.horse;
  h.setPosition(o.x - o.n.x * 11, o.z - o.n.z * 11, o.rot);
  A.mount();
  g.cam.yaw = o.rot + Math.PI - 0.9;
  g.cam.lastManual = g.time + 100;
  h.speed = 9;
  let j = false;
  for (let i = 0; i < 60; i++) {
    A.steer(o.n.x, o.n.z, 0.95);
    if (!j && g.obstacles.timing(h) === 'good') { const f = h.forward; const s = (h.pos.x + f.x * 0.4 - o.x) * o.n.x + (h.pos.z + f.z * 0.4 - o.z) * o.n.z; if (-s <= 4) { g.input.pressed.add('jump'); j = true; } }
    A.tick(1);
    if (h.jumpT > 0.42) break;
  }
  g.renderer.render(g.scene, g.camera);
  const bs = h.mesh.boundingSphere;
  window.__dbg = { h: [h.pos.x, h.pos.y, h.pos.z, h.jumpT], vis: h.mesh.visible, parent: !!h.mesh.parent, mp: h.mesh.position.toArray(), bs: bs && [bs.center.toArray(), bs.radius], cam: g.camera.position.toArray(), mode: g.player.mode, inScene: g.scene.children.includes(h.mesh), id: h.id, main: g.mainHorse === h, nh: g.horses.length };
});
console.log(JSON.stringify(await page.evaluate(() => window.__dbg)));
// 3. Ville (à pied).
await scene('town', () => {
  const A = window.__auto, g = window.__game;
  A.releaseInput();
  A.foot();
  g.save.data.gameTime = 11 * 3600;
  g.player.human.setPosition(-20, -250, Math.PI);
  g.cam.yaw = 0.4;
  g.cam.pitch = 0.18;
  g.cam.lastManual = g.time + 100;
  A.tick(30);
});
// 4. Pôle de nuit.
await scene('night', () => {
  const A = window.__auto, g = window.__game;
  A.mount();
  g.save.data.gameTime = 22.5 * 3600;
  g.player.horse.setPosition(320, -190, Math.PI);
  g.cam.yaw = 0.2;
  A.tick(20);
});
// 5. Camion.
await scene('truck', () => {
  const A = window.__auto, g = window.__game;
  g.save.data.gameTime = 15 * 3600;
  A.drive();
  g.player.truck.setPosition(-30, 0, Math.PI);
  g.cam.yaw = 0.6;
  for (let i = 0; i < 40; i++) { g.input.setVirtualMove(0, 1); A.tick(1); }
  A.releaseInput();
});
// 6. Haras et chevaux au paddock.
await scene('haras', () => {
  const A = window.__auto, g = window.__game;
  A.mount();
  g.save.data.gameTime = 9.5 * 3600;
  g.player.horse.setPosition(-380, -20, Math.PI);
  g.cam.yaw = -0.3;
  g.cam.pitch = 0.35;
  A.tick(20);
});
console.log('ERRORS', errors.join('\n') || 'none');
await browser.close();
