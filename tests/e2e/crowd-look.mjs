// Public assis des tribunes (Pôle international) : vues fixes de près, à mi-distance et depuis la piste (rendu
// SwiftShader de Chromium, pas un iPhone). Usage : BASE=http://127.0.0.1:5176 node tests/e2e/crowd-look.mjs <dossier>
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/crowd-look';
const BASE = process.env.BASE || 'http://127.0.0.1:5176';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const S = await page.evaluate(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog();
  g.sky.rain = 0; g.sky.wet = 0;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  const st = document.createElement('style');
  st.textContent = 'body > *:not(canvas) { visibility: hidden !important; } .notif, .phone-notif, [class*="notif"] { display: none !important; }';
  g.phone.notify = () => {};
  document.head.appendChild(st);
  const { POLE } = await import('/src/world/sites.js');
  return POLE.stands;
});
console.log('tribune', JSON.stringify(S));
const metrics = {};
// Vues (repère de la tribune : +z vers la piste) : [œil], [visée], fov.
const V = { pres: [[1.5, 3.2, 2.2], [0, 2.4, 0], 40], mi: [[3, 4, 12], [0, 2.4, 0], 45], piste: [[-6, 2, 30], [0, 3, 0], 40] };
for (const [k, [eye, tgt, fov]] of Object.entries(V)) {
  metrics[k] = await page.evaluate(([S, eye, tgt, fov]) => {
    const g = window.__game;
    const cx = S.x, cz = S.z, sz = S.z + S.d / 2, gy = g.terrain.getHeight(cx, cz);
    g.camera.position.set(cx + eye[0], gy + eye[1], sz + eye[2]); g.camera.fov = fov; g.camera.updateProjectionMatrix();
    g.camera.lookAt(cx + tgt[0], gy + tgt[1], sz + tgt[2] - S.d / 2); g.camera.updateMatrixWorld();
    g.player.focus.pos.set(cx, 0, sz + 10);
    g.sky.follow(g.camera); g.world.update(1 / 30, g.camera, g.sky, g.camera.position);
    g.renderer.info.reset?.(); g.renderer.render(g.scene, g.camera);
    return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  }, [S, eye, tgt, fov]);
  await page.screenshot({ path: join(OUT, `${k}.jpg`), type: 'jpeg', quality: 88 });
}
writeFileSync(join(OUT, 'mesures.json'), JSON.stringify({ base: BASE, stands: S, metrics, errors }, null, 1));
console.log(JSON.stringify(metrics), 'erreurs', errors.slice(0, 3));
await browser.close();
