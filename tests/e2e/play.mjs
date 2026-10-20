// Lance le jeu dans Chromium (émulation iPhone paysage), capture des écrans et rapporte les erreurs.
// Usage : node tests/e2e/play.mjs [url] [outPrefix]
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/?autostart&debug';
const out = process.argv[3] || 'tests/e2e/out/play';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
try {
  await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
} catch (e) {
  await page.screenshot({ path: `${out}-fail.png` });
  console.log('BOOT FAILED', e.message);
  console.log('ERRORS', errors.join('\n'));
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-1.png` });
// Fermer la carte d'intro.
await page.evaluate(() => document.querySelector('.overlay [data-id="go"]')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const g = window.__game;
  return { state: g.state, mode: g.player.mode, pos: g.player.focus.pos, offers: g.missions.offers.length, fps: g.fps };
});
console.log('INFO', JSON.stringify(info));
await page.screenshot({ path: `${out}-2.png` });
console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();
