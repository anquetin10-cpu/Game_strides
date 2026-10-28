// Captures de l'épreuve de CSO (format iPhone 13 paysage) : présentation, plan, cloche, abord avec l'aide (trop loin,
// bonne zone), saut, barre au sol, bilan. Sortie : tests/e2e/out/cso/.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart&quality=high`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const shot = async (name) => {
  await page.waitForTimeout(450);
  await page.evaluate(() => { const g = window.__game; g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky); g.renderer.render(g.scene, g.camera); });
  await page.screenshot({ path: `tests/e2e/out/cso/${name}.png` });
};
await page.evaluate(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  const O = await import('/src/gameplay/obstacles.js');
  window.__O = O;
  A.mount();
  const h = g.player.horse;
  h.setPosition(O.CSO_GATE.x, O.CSO_GATE.z + 4, Math.PI);
  g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
  A.tick(6);
});
await shot('1-presentation');
await page.evaluate(() => window.__auto.tap(document.querySelector('.overlay [data-id="plan"]')));
await shot('2-plan');
await page.evaluate(() => { const A = window.__auto; A.tap(document.querySelector('.overlay [data-id="plan-back"]')); A.tap(document.querySelector('.overlay [data-id="enter"]')); A.tick(80); });
await shot('3-cloche');
// Abord du 2 (oxer) : trop loin, puis bonne zone.
for (const [name, x] of [['4-abord-trop-loin', 7.5], ['5-abord-bonne-zone', 1.7]]) {
  await page.evaluate((x) => {
    const g = window.__game, A = window.__auto;
    const st = g.missions.active.data.course;
    st.started = true;
    const list = g.obstacles.ofCourse('cso');
    st.next = 2;
    st.t = 7.42;
    g.obstacles.highlight('cso', 2);
    const o = list[1];
    const h = g.player.horse;
    h.setPosition(o.x - o.n.x * 16, o.z - o.n.z * 16, o.rot);
    h.speed = 6.6;
    g.cam.snap(h.pos, o.rot);
    for (let i = 0; i < 200; i++) {
      A.steer(o.n.x, o.n.z, 0.62);
      A.tick(1);
      const tg = g.obstacles.target(h);
      if (tg && tg.o === o && tg.geo.rails[0].x <= x + 0.6) break;
    }
  }, x);
  await shot(name);
}
await page.evaluate(() => { const g = window.__game, A = window.__auto; g.input.pressed.add('jump'); A.tick(10); });
await shot('6-saut');
// Barre au sol : appel bien trop loin au 3.
await page.evaluate(() => {
  const g = window.__game, A = window.__auto;
  A.tick(30);
  const o = g.obstacles.ofCourse('cso')[2];
  const h = g.player.horse;
  h.setPosition(o.x - o.n.x * 16, o.z - o.n.z * 16, o.rot);
  h.speed = 6.6;
  g.cam.snap(h.pos, o.rot);
  let pressed = false;
  for (let i = 0; i < 120; i++) {
    A.steer(o.n.x, o.n.z, 0.62);
    const tg = g.obstacles.target(h);
    if (!pressed && tg && tg.o === o && tg.geo.rails[0].x <= 5.8) { g.input.pressed.add('jump'); pressed = true; }
    A.tick(1);
    if (pressed && h.jumpT < 0 && i > 60) break;
  }
  A.releaseInput();
  A.tick(25);
  g.cam.yaw += 2.3;
  A.tick(1);
});
await shot('7-barre-au-sol');
console.log('errors', errors.slice(0, 3));
await b.close();
