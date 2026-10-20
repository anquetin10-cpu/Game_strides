// Reproduit la carte de fin de mission sur un écran court (lecteur intégré), vérifie que « Continuer » est atteignable.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [W, H] = (process.argv[2] || '667x308').split('x').map(Number);
const embedded = process.argv[3] !== 'direct';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(embedded ? 'http://localhost:5173/tests/e2e/viewer-harness.html?autostart' : 'http://localhost:5173/?autostart');
const frame = embedded ? await (await page.waitForSelector('iframe')).contentFrame() : page.mainFrame();
await frame.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
await frame.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await frame.evaluate(() => { const A = window.__auto; A.stopLoop(); A.closeCards(); const o = A.closeCards; A.closeCards = () => 0; A.runStory('tuto'); A.closeCards = o; window.__game.renderer.render(window.__game.scene, window.__game.camera); });
await page.waitForTimeout(500);
const tag = `${W}x${H}-${embedded ? 'emb' : 'direct'}`;
await page.screenshot({ path: `tests/e2e/out/card-${tag}.png` });
const btn = await frame.evaluate(() => { const b = document.querySelector('.overlay [data-id="continue"]'); const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
// Tenter un vrai toucher sur le bouton (après défilement éventuel).
let reachable = btn.bottom <= btn.vh && btn.top >= 0;
console.log(tag, JSON.stringify(btn), reachable ? 'BOUTON VISIBLE' : 'BOUTON HORS ÉCRAN');
await browser.close();
