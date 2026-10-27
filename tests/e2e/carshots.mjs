// Galerie des modèles copiés (captures 3/4 avant et 3/4 arrière, alignés dans un pré). Usage : node tests/e2e/carshots.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: Number(process.env.W) ? { width: Number(process.env.W), height: Number(process.env.H) } : { width: 1280, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart&quality=high`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(async () => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  document.querySelector('.hud')?.style.setProperty('display', 'none');
  const { CAR_MODELS } = await import('/src/world/props.js');
  g.save.data.gameTime = 15 * 3600;
  window.__models = CAR_MODELS;
  window.__pick = (k) => g.drivables.find((d) => d.kind === k);
  const { ROADS } = await import('/src/world/layout.js');
  let best = null;
  for (const r of ROADS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (!best || L > best.L) best = { L, ax, az, h: Math.atan2(bx - ax, bz - az) };
  }
  window.__straight = best;
  A.tick(2);
});
const models = await page.evaluate(() => window.__models);
for (const k of models) {
  for (const [name, ang] of [['front', 0.75], ['rear', Math.PI + 0.75]]) {
    await page.evaluate(([k, ang]) => {
      const g = window.__game, v = window.__pick(k), cam = g.camera;
      v.mesh.visible = true;
      g.ambient.fx.update([v], 0);
      // Sur la plus longue ligne droite du réseau routier, voiture seule.
      const S = window.__straight;
      const x = S.ax + Math.sin(S.h) * 30, z = S.az + Math.cos(S.h) * 30, h = S.h;
      v.setPosition(x, z, h);
      window.__auto.tick(1);
      v.mesh.visible = true;
      g.ambient.fx.update([v], 0);
      const a = h + ang, d = 6.4;
      cam.position.set(x + Math.sin(a) * d, v.pos.y + 1.35, z + Math.cos(a) * d);
      cam.lookAt(x, v.pos.y + 0.75, z);
      cam.fov = 45;
      cam.updateProjectionMatrix();
      g.renderer.render(g.scene, cam);
    }, [k, ang]);
    await page.screenshot({ path: `tests/e2e/out/model-${k}-${name}-${process.env.TAG || 'x'}.png` });
  }
  await page.evaluate((k) => { const v = window.__pick(k); v.setPosition(v.home.x, v.home.z, v.home.heading); }, k);
}
console.log(errors.length ? errors.join(' | ') : 'ok');
await b.close();
