// Defender 110 : comparaison des deux variantes du modèle (Defender110_STRIDES.glb / _MOBILE.glb) dans le jeu, une
// seule chargée par session. Mesures : temps de chargement, triangles, maillages, appels de dessin du véhicule (vue
// rapprochée, ombres comprises), mémoire GPU estimée (géométrie + textures), temps d'image moyen.
// Émulation iPhone 13 (viewport, tactile, DPR 2) avec rendu logiciel SwiftShader : les temps sont des valeurs relatives
// entre variantes, pas une mesure sur un vrai iPhone.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/defender-variants.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/defender';
mkdirSync(OUT, { recursive: true });
const rows = [];
for (const variant of ['full', 'mobile']) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/?autostart&defender=${variant}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  const r = await page.evaluate(() => {
    const g = window.__game, A = window.__auto, v = g.defender;
    A.stopLoop();
    A.closeCards();
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
    A.tick(3);
    // Vue rapprochée trois quarts avant.
    let pos = v.localToWorld(4.5, 1.8, 5.5), at = v.localToWorld(0, 0.9, 0);
    g.cam.override = { pos, look: at };
    const R = g.renderer, info = R.info;
    const frame = () => {
      g.camera.position.copy(pos);
      g.camera.lookAt(at);
      R.render(g.scene, g.camera);
    };
    info.autoReset = false;
    const calls = (vis) => {
      v.mesh.visible = vis;
      frame();
      info.reset();
      frame();
      return { calls: info.render.calls, tris: info.render.triangles };
    };
    const on = calls(true), off = calls(false);
    v.mesh.visible = true;
    info.autoReset = true;
    // Temps d'image moyen (rendu seul, même vue).
    for (let i = 0; i < 5; i++) frame();
    const t0 = performance.now();
    const N = 30;
    for (let i = 0; i < N; i++) frame();
    R.getContext().finish?.();
    const ms = (performance.now() - t0) / N;
    // Vue lointaine (~55 m) : intérieur et petits éléments masqués.
    pos = v.localToWorld(20, 6, 55);
    g.cam.override = { pos, look: at };
    g.camera.position.copy(pos);
    A.tick(2);
    info.autoReset = false;
    const farOn = calls(true), farOff = calls(false);
    v.mesh.visible = true;
    info.autoReset = true;
    // Mémoire GPU estimée : tampons de géométrie et textures (RGBA 8 bits, mipmaps +33 %).
    let geo = 0;
    const tex = new Set(), seenGeo = new Set();
    v.mesh.traverse((o) => {
      if (!o.isMesh) return;
      if (!seenGeo.has(o.geometry)) {
        seenGeo.add(o.geometry);
        for (const a of Object.values(o.geometry.attributes)) geo += a.array.byteLength;
        if (o.geometry.index) geo += o.geometry.index.array.byteLength;
      }
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (o.material[k]) tex.add(o.material[k]);
    });
    let texB = 0;
    for (const t of tex) texB += (t.image?.width || 0) * (t.image?.height || 0) * 4 * 1.33;
    const info2 = g.defenderModelInfo;
    return {
      variant: info2.variant, file: info2.file, details: v.M.details, loadMs: info2.loadMs, triangles: info2.triangles, meshes: info2.meshes, materials: info2.materials,
      drawCalls: on.calls - off.calls, drawCallsFar: farOn.calls - farOff.calls, sceneTrisDelta: on.tris - off.tris, textures: tex.size,
      geoMB: +(geo / 1048576).toFixed(1), texMB: +(texB / 1048576).toFixed(1), frameMs: +ms.toFixed(1),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null,
    };
  });
  r.errors = errors.length;
  rows.push(r);
  console.log(JSON.stringify(r));
  await browser.close();
}
writeFileSync(`${OUT}/variantes.json`, JSON.stringify(rows, null, 2));
const [f, m] = rows;
console.log(`\nVariante        | chargement | triangles | maillages | appels (près / 55 m) | géométrie | textures | image (SwiftShader)`);
for (const r of rows) console.log(`${r.variant.padEnd(15)} | ${String(r.loadMs).padStart(7)} ms | ${String(r.triangles).padStart(9)} | ${String(r.meshes).padStart(9)} | ${String(r.drawCalls).padStart(10)} / ${String(r.drawCallsFar).padStart(4)} | ${String(r.geoMB).padStart(6)} Mo | ${String(r.texMB).padStart(5)} Mo | ${r.frameMs} ms`);
console.log(`mobile / détaillée : triangles ×${(m.triangles / f.triangles).toFixed(2)}, géométrie ×${(m.geoMB / f.geoMB).toFixed(2)}, image ×${(m.frameMs / f.frameMs).toFixed(2)}`);
process.exit(rows.some((r) => r.errors) ? 1 : 0);
