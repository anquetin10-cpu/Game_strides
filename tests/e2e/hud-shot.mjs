// Capture du HUD en mission (objectif + chrono + astuce + notification) sur écran court, intégré ou direct.
// Usage : node tests/e2e/hud-shot.mjs 844x330 [direct]   (BASE=http://localhost:5174 pour un autre serveur)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [W, H] = (process.argv[2] || '844x330').split('x').map(Number);
const embedded = process.argv[3] !== 'direct';
const base = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(embedded ? `${base}/tests/e2e/viewer-harness.html?autostart` : `${base}/?autostart`);
const frame = embedded ? await (await page.waitForSelector('iframe')).contentFrame() : page.mainFrame();
await frame.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
await frame.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const tag = `${W}x${H}-${embedded ? 'emb' : 'direct'}`;
const render = () => frame.evaluate(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
await frame.evaluate(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  A.mount();
  A.tick(20);
  g.hud.update(1 / 30);
  g.hud.setObjective({ tag: 'Galop sur la plage', text: 'Passe les portes de la plage avant la marée', sub: 'Porte 3 / 8', timer: 42.3 });
  g.hud.hint('Maintiens <b>GALOP</b> pour accélérer', 0);
});
await render();
await page.waitForTimeout(450);
await page.screenshot({ path: `tests/e2e/out/hud-${tag}.png` });
// Rectangles occupés : vérifie que rien ne chevauche les boutons et que le centre reste dégagé.
const rects = await frame.evaluate(() => {
  const r = (s) => {
    const el = document.querySelector(s);
    if (!el || getComputedStyle(el).display === 'none') return null;
    const b = el.getBoundingClientRect();
    return b.width ? { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) } : null;
  };
  return { vw: innerWidth, vh: innerHeight, objective: r('.objective'), hint: r('.hint'), minimap: r('.minimap-wrap'), topRight: r('.top-right'), telemetry: r('.telemetry'), actions: r('.btn-action'), whistle: r('.btn-whistle'), notif: r('.notif') };
});
await frame.evaluate(() => {
  const g = window.__game;
  g.hud.notify({ title: 'Nouvelle mission disponible', body: 'Écurie des Dunes · 180 € · Transport de matériel', actions: [{ label: 'Plus tard' }, { label: 'Voir', primary: true }] });
});
await page.waitForTimeout(700);
await render();
await page.screenshot({ path: `tests/e2e/out/hud-${tag}-notif.png` });
rects.notifShown = await frame.evaluate(() => {
  const b = document.querySelector('.notif').getBoundingClientRect();
  return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) };
});
// Dialogue long, puis fenêtre de profil (prénom + personnage visibles sans défiler ?).
await frame.evaluate(() => {
  const g = window.__game;
  g.hud._closeNotif();
  g.hud.setObjective(null);
  g.hud.clearHint();
  g.hud.dialog([{ who: 'Margaux · Écurie du Val', initials: 'MV', text: 'Tu acceptes, tu réalises, tu es payé. Et avis après avis, ta réputation grandit. Garde ton téléphone à l’œil !' }, { who: 'Margaux', text: 'Suite' }]);
});
await page.waitForTimeout(500);
await render();
await page.screenshot({ path: `tests/e2e/out/hud-${tag}-dialog.png` });
rects.dialogOverlap = await frame.evaluate(() => {
  const a = document.querySelector('.dialog .next').getBoundingClientRect(), b = document.querySelector('.dialog .line').getBoundingClientRect();
  return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
});
await frame.evaluate(() => {
  const g = window.__game;
  while (g.hud.dialogActive) g.hud.advanceDialog();
  g.screens.showSetup(() => {});
});
await page.waitForTimeout(400);
await page.screenshot({ path: `tests/e2e/out/hud-${tag}-setup.png` });
rects.setup = await frame.evaluate(() => {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return hit === el || el.contains(hit);
  };
  return { input: vis(document.querySelector('.setup input')), seg: vis(document.querySelector('.setup .seg button')), start: vis(document.querySelector('.setup [data-id="start"]')) };
});
console.log(tag, JSON.stringify(rects), errors.length ? `ERREURS: ${errors.join(' | ')}` : '');
await browser.close();
