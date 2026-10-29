// Captures de Deauville City depuis des points de vue fixes (comparaison avant/après aux mêmes endroits).
// Usage : node tests/e2e/town-shots.mjs <dossier> [vues séparées par des virgules]   (BASE=http://127.0.0.1:5173)
// Sortie : tests/e2e/out/town/<dossier>/<vue>.png, avec le nombre d'appels de dessin et de triangles de chaque vue.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const tag = process.argv[2] || 'apres';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const base = process.env.BASE || 'http://127.0.0.1:5173';
mkdirSync(`tests/e2e/out/town/${tag}`, { recursive: true });
// [vue, heure, regard (x, hauteur au-dessus du sol, z), œil (x, hauteur, z)]
const VIEWS = [
  ['sellerie', 15, [-148, 3.2, -266], [-124, 1.7, -254]],
  ['sellerie-porte', 15, [-148, 1.6, -266], [-138, 1.7, -263]],
  ['cafe', 15, [52, 2, -282], [36, 1.7, -262]],
  ['boutique', 15, [-38, 3, -268], [-14, 1.7, -258]],
  ['place', 15, [-10, 4, -291], [24, 1.7, -260]],
  ['rue', 15, [-80, 3, -300], [-122, 1.7, -296]],
  ['hotel', 15, [-80, 6, -320], [-60, 1.7, -290]],
  ['facade', 15, [-62, 4, -238], [-60, 1.7, -228.8]],
  ['devanture', 15, [-56, 2.2, -294.5], [-47, 1.7, -298.5]],
  ['cafe-face', 15, [19, 3.2, -226], [13, 1.7, -244]],
  ['rue-nuit', 21.5, [-80, 3, -300], [-122, 1.7, -296]],
  ['devanture-nuit', 21.5, [-56, 2.2, -294.5], [-47, 1.7, -298.5]],
  ['sellerie-nuit', 21.5, [-148, 3.2, -266], [-124, 1.7, -254]],
].filter((v) => !only || only.includes(v[0]));

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart&quality=high`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.addStyleTag({ content: '.hud, #touch { visibility: hidden !important; }' });
await page.evaluate(() => { const g = window.__game; window.__auto.stopLoop(); window.__auto.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); window.__auto.closeCards(); });
for (const [name, hr, at, from] of VIEWS) {
  const info = await page.evaluate(([hr, at, from]) => {
    const g = window.__game;
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + hr * 3600;
    g.sky.setDay?.(0);
    g.sky.rain = 0; g.sky.wet = 0;
    // Joueur à côté du point de vue : chargement à la demande des intérieurs et des détails proches.
    g.player.human?.setPosition?.(from[0], from[2], 0);
    g.update(1 / 30);
    const y = (x, z) => g.terrain.getHeight(x, z);
    g.camera.position.set(from[0], y(from[0], from[2]) + from[1], from[2]);
    g.camera.lookAt(at[0], y(at[0], at[2]) + at[1], at[2]);
    g.sky.update(g.hour(), g.camera.position, 0);
    g.sky.follow(g.camera);
    g.sky.updateEnvironment(g.renderer, performance.now() / 1000, true);
    g.world.update(0, g.camera, g.sky, g.camera.position);
    g.renderer.render(g.scene, g.camera);
    const i = g.renderer.info.render;
    return `${i.calls} appels, ${Math.round(i.triangles / 1000)}k triangles`;
  }, [hr, at, from]);
  await page.screenshot({ path: `tests/e2e/out/town/${tag}/${name}.png` });
  console.log(name, info);
}
console.log(errors.length ? `ERREURS : ${errors.slice(0, 4).join(' | ')}` : 'aucune erreur');
await b.close();
