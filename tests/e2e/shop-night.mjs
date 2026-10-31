// Personnages éclairés la nuit dans un commerce (boutique de vêtements, 23 h) : capture et luminosité moyenne du
// personnage à l'écran, personnages classiques puis réalistes. Émulation iPhone 13 paysage, rendu logiciel.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/shop-night.mjs [étiquette]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
const tag = process.argv[2] || 'run';
const OUT = 'tests/e2e/out/shop-night';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = {};
for (const mode of ['classic', 'real']) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
  const page = await ctx.newPage();
  await page.goto(`${base}/?autostart&${mode}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  await page.evaluate(async (hour) => {
    const A = window.__auto, g = window.__game;
    A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
    g.phone.notify = () => {};
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + hour * 3600;
    A.foot();
    await g.shops.enter('boutique', { instant: true });
    for (let i = 0; i < 60; i++) A.tick(1);
    // Personnages réalistes : créés par la boucle d'affichage (realism.update) une fois les modèles chargés.
    for (let i = 0; i < 60; i++) {
      g.realism?.update();
      A.tick(1);
      if (!g.realism?.enabled || (g.realism.body && !g.realism.loading.size)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    for (let i = 0; i < 20; i++) { A.tick(1); g.realism?.update(); }
    // Joueur placé au milieu de la boutique, vu de dos comme en jeu.
    g.cam.snap(g.player.focus.pos, g.player.heading);
    for (let i = 0; i < 20; i++) { A.tick(1); g.realism?.update(); }
    g.hud.notifEl?.classList.add('hidden');
    g.renderer.render(g.scene, g.camera);
  }, Number(process.env.HOUR) || 23);
  const box = await page.evaluate(() => {
    const g = window.__game, cam = g.camera;
    const real = g.realism?.body;
    const obj = real ? real.root : g.player.human.mesh;
    obj.updateMatrixWorld(true);
    // Boîte englobante projetée à l'écran ; bande centrale (torse, jambes) pour la luminosité.
    const B = new obj.position.constructor();
    const pts = [];
    const bb = { min: { x: 1e9, y: 1e9 }, max: { x: -1e9, y: -1e9 } };
    obj.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.getWorldPosition(B);
    });
    const p = g.player.human.pos;
    for (const y of [0.3, 0.7, 1.1, 1.5]) {
      const v = p.clone();
      v.y += y;
      v.project(cam);
      pts.push({ x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight });
    }
    for (const q of pts) {
      bb.min.x = Math.min(bb.min.x, q.x); bb.max.x = Math.max(bb.max.x, q.x);
      bb.min.y = Math.min(bb.min.y, q.y); bb.max.y = Math.max(bb.max.y, q.y);
    }
    return { x: bb.min.x - 6, y: bb.min.y, w: 12, h: Math.max(10, bb.max.y - bb.min.y), real: !!real, pts };
  });
  const file = `${OUT}/${tag}-${mode}.png`;
  const buf = await page.screenshot({ path: file });
  // Luminosité moyenne de la silhouette (bande verticale au centre du personnage).
  const lum = await page.evaluate(async ([b64, b]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(Math.round(b.x), Math.round(b.y), b.w, Math.round(b.h)).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / (d.length / 4);
  }, [buf.toString('base64'), box]);
  res[mode] = { lum: +lum.toFixed(1), realActive: box.real, file };
  await ctx.close();
}
console.log(JSON.stringify({ tag, ...res }));
await browser.close();
