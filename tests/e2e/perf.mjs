// Mesure le coût CPU de la logique (update) et du rendu à différents endroits.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
await page.goto('http://localhost:5173/?autostart');
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const res = await page.evaluate(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); A.mount();
  const spots = { home: [-110, 190, 0], town: [-30, -250, 0], pole: [330, -200, Math.PI], beach: [100, -410, -1.5], forest: [-380, 380, 2] };
  const out = {};
  for (const [k, [x, z, r]] of Object.entries(spots)) {
    g.player.horse.setPosition(x, z, r);
    g.cam.snap(g.player.focus.pos, r);
    A.tick(20);
    let t0 = performance.now();
    for (let i = 0; i < 120; i++) { A.steer(Math.sin(r), Math.cos(r), 0.9); A.tick(1); }
    const upd = (performance.now() - t0) / 120;
    t0 = performance.now();
    g.renderer.render(g.scene, g.camera);
    const info = { ...g.renderer.info.render };
    out[k] = { updateMs: upd.toFixed(2), calls: info.calls, tris: info.triangles };
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
