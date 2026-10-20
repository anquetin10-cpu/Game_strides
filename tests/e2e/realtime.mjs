// Partie en temps réel au doigt : joystick + galop + caméra, captures régulières.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/?autostart&debug');
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
await page.tap('[data-id="go"]');
await page.waitForTimeout(500);
// Lower the resolution for speed and mount.
await page.evaluate(() => { const g = window.__game; g.renderer.setPixelRatio(0.6); g.resize(); const h = g.mainHorse; g.player.human.setPosition(h.pos.x + 1, h.pos.z + 1); g.player.mount(); g.missions.timer = 999; g.hud.notifQueue = []; });
const cdp = await ctx.newCDPSession(page);
const touches = new Map();
const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.entries()].map(([id, p]) => ({ id, x: p[0], y: p[1] })) });
// Joystick vers le haut-gauche (tourner), puis tout droit, bouton galop maintenu.
touches.set(1, [150, 300]); await send('touchStart');
touches.set(1, [150, 220]); await send('touchMove');
const gallop = await page.locator('.btn-gallop').boundingBox();
touches.set(2, [gallop.x + gallop.width / 2, gallop.y + gallop.height / 2]); await send('touchStart');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1500);
  if (i === 2) { touches.set(1, [110, 230]); await send('touchMove'); }
  if (i === 4) { touches.set(1, [150, 220]); await send('touchMove'); }
  const info = await page.evaluate(() => { const g = window.__game; return { sp: g.player.speed.toFixed(1), gait: g.player.horse.gait, st: Math.round(g.player.horse.stamina), fps: g.fps, pos: [Math.round(g.player.horse.pos.x), Math.round(g.player.horse.pos.z)] }; });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `tests/e2e/out/rt-${i}.png` });
}
touches.clear(); await send('touchEnd');
// Glisser la caméra (côté droit).
touches.set(3, [600, 200]); await send('touchStart');
for (let k = 1; k <= 8; k++) { touches.set(3, [600 - k * 25, 200]); await send('touchMove'); await page.waitForTimeout(40); }
touches.clear(); await send('touchEnd');
await page.waitForTimeout(400);
await page.screenshot({ path: 'tests/e2e/out/rt-cam.png' });
console.log('ERRORS', errors.join('\n') || 'none');
await browser.close();
