// Coût des humains (lot v3) : trois situations, mêmes conditions d'une version à l'autre (Chromium SwiftShader, rendu
// logiciel, viewport 844 × 390 comme un téléphone en paysage : PAS un iPhone ; les durées dépendent de la charge de la
// machine, comparer des passages alternés).
//  - tribune : public assis du Pôle à mi-distance (rendu seul) ;
//  - pnj : le joueur à pied et 8 passants proches (modèles réalistes) qui marchent (logique + rendu) ;
//  - selle : au galop sur la plage (logique + rendu).
// Mesures : temps médian et 90e centile par image (ms), appels de dessin, triangles, programmes, tas JS (Mo).
// Usage : BASE=http://127.0.0.1:5176 node tests/e2e/perf-humans.mjs [fichier.json]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const res = await page.evaluate(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.sky.rain = 0; g.sky.wet = 0;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { med: +s[s.length >> 1].toFixed(2), p90: +s[Math.floor(s.length * 0.9)].toFixed(2) }; };
  const info = () => ({ calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, programs: g.renderer.info.programs?.length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(0) : null });
  const out = {};
  // Tribune.
  {
    const { POLE } = await import('/src/world/sites.js');
    const S = POLE.stands, gy = g.terrain.getHeight(S.x, S.z);
    A.foot();
    g.player.human.setPosition(S.x, S.z + S.d / 2 + 14, Math.PI);
    for (let i = 0; i < 30; i++) { g.update(1 / 30); g.realism?.update(); }
    const t = [];
    for (let i = 0; i < 90; i++) {
      g.camera.position.set(S.x + 3, gy + 4, S.z + S.d / 2 + 12); g.camera.lookAt(S.x, gy + 2.4, S.z); g.camera.updateMatrixWorld();
      g.world.update(1 / 30, g.camera, g.sky, g.camera.position);
      const t0 = performance.now(); g.renderer.render(g.scene, g.camera); g.renderer.getContext().finish(); t.push(performance.now() - t0);
    }
    out.tribune = { ...stat(t), ...info() };
  }
  // Passants réalistes.
  {
    const hu = g.player.human;
    const h = g.mainHorse;
    h.setPosition(120, g.terrain.waterlineZ(120) + 30, 0);
    hu.setPosition(160, g.terrain.waterlineZ(160) + 9, -Math.PI / 2);
    const { randomOutfit } = await import('/src/entities/humanModel.js');
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ps = [];
    for (let i = 0; i < 8; i++) { const p = g.spawnHuman(randomOutfit(rnd), hu.pos.x - 2 - (i % 4) * 1.5, hu.pos.z + 2 + Math.floor(i / 4) * 1.5, -Math.PI / 2, { name: 'P' + i }); p.pose = 'walk'; ps.push(p); }
    for (let i = 0; i < 120; i++) { g.update(1 / 30); g.realism?.update(); await new Promise((r) => setTimeout(r, 10)); }
    const t = [];
    for (let i = 0; i < 120; i++) {
      for (const p of ps) { p.speed = 1.3; p.pos.x -= 1.3 / 30; }
      A.steer(-1, 0, 0.4);
      const t0 = performance.now(); g.update(1 / 30); g.realism?.update(); g.camera.updateMatrixWorld(); g.renderer.render(g.scene, g.camera); g.renderer.getContext().finish(); t.push(performance.now() - t0);
    }
    out.pnj = { ...stat(t), realistes: g.realism?.bodies?.size, ...info() };
    g.input.setVirtualMove(0, 0);
    for (const p of ps) p.dispose?.();
  }
  // En selle, au galop.
  {
    A.mount();
    const h = g.player.horse || g.mainHorse;
    h.setPosition(160, g.terrain.waterlineZ(160) + 8, -Math.PI / 2);
    for (let i = 0; i < 60; i++) { A.steer(-1, 0, 0.8); g.update(1 / 30); g.realism?.update(); }
    const t = [];
    for (let i = 0; i < 120; i++) {
      A.steer(-1, 0, 0.8);
      const t0 = performance.now(); g.update(1 / 30); g.realism?.update(); g.camera.updateMatrixWorld(); g.renderer.render(g.scene, g.camera); g.renderer.getContext().finish(); t.push(performance.now() - t0);
    }
    out.selle = { ...stat(t), ...info() };
  }
  return out;
});
console.log(JSON.stringify(res));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ base: BASE, ...res }, null, 1));
await browser.close();
