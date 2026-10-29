// Mesures de Deauville City (avant / après) : à pied, sur un trajet fixe dans les rues, puis dans les trois commerces
// (s'ils existent dans la version mesurée). Pour chaque point : logique (update) et rendu (ms, moyenne ; rendu logiciel
// SwiftShader : ordre de grandeur relatif, pas un temps d'iPhone), appels de dessin, triangles, mémoire GPU suivie par
// three.js (géométries, textures).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/perf-town.mjs [étiquette]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const tag = process.argv[2] || 'apres';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync(`tests/e2e/autopilot.js`, 'utf8') });
const res = await page.evaluate(async () => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  const gl = g.renderer.getContext();
  // Image complète (logique + rendu) répétée : médiane et pire image (à-coups : chargement, compilation).
  const measure = (label) => {
    const fr = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      A.tick(1);
      g.renderer.render(g.scene, g.camera);
      gl.finish();
      fr.push(performance.now() - t);
    }
    fr.sort((a, b) => a - b);
    let t0 = performance.now();
    for (let i = 0; i < 60; i++) A.tick(1);
    const upd = (performance.now() - t0) / 60;
    g.renderer.render(g.scene, g.camera);
    gl.finish();
    t0 = performance.now();
    for (let i = 0; i < 3; i++) g.renderer.render(g.scene, g.camera);
    gl.finish();
    const ren = (performance.now() - t0) / 3;
    const r = g.renderer.info.render, m = g.renderer.info.memory;
    return { label, frameMed: +fr[10].toFixed(1), frameMax: +fr[19].toFixed(0), updateMs: +upd.toFixed(2), renderMs: +ren.toFixed(1), calls: r.calls, tris: Math.round(r.triangles / 1000), geometries: m.geometries, textures: m.textures };
  };
  const out = [];
  // Trajet à pied dans le centre : rue de l'Ouest (sellerie), rue Gontaut-Biron, place, rue Hoche (café).
  const route = [[-134, -240, Math.PI], [-134, -270, Math.PI], [-100, -296, Math.PI / 2], [-56, -297, Math.PI / 2], [-34, -262, 0], [10, -266, Math.PI / 2], [19, -230, Math.PI / 2], [60, -229, Math.PI / 2]];
  for (const [x, z, h] of route) {
    g.player.human.setPosition(x, z, h);
    g.cam.snap(g.player.human.pos, h);
    A.tick(5);
    out.push(measure(`rue (${x}, ${z})`));
  }
  if (g.shops) {
    for (const id of ['sellerie', 'cafe', 'boutique']) {
      const d = g.shops.doorOut(id);
      g.player.human.setPosition(d.x, d.z, 0);
      A.tick(3);
      await g.shops.enter(id, { instant: true });
      A.tick(10);
      out.push(measure(`dans : ${id}`));
      await g.shops.exit({ instant: true });
    }
  }
  return out;
});
mkdirSync('tests/e2e/out/town', { recursive: true });
writeFileSync(`tests/e2e/out/town/perf-${tag}.json`, JSON.stringify(res, null, 1));
for (const r of res) console.log(`${r.label.padEnd(24)} image méd. ${String(r.frameMed).padStart(5)} ms · pire ${String(r.frameMax).padStart(5)} ms · update ${String(r.updateMs).padStart(6)} ms · rendu ${String(r.renderMs).padStart(6)} ms · ${String(r.calls).padStart(4)} appels · ${String(r.tris).padStart(4)}k tri · géom. ${r.geometries} · tex. ${r.textures}`);
await browser.close();
