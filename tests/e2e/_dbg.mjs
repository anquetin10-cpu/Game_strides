import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 667, height: 308 }, isMobile: true, hasTouch: true })).newPage();
await page.goto('http://127.0.0.1:5173/?autostart=1');
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.waitForTimeout(2000);
console.log(await page.evaluate(() => { const g = window.__game; return { phone: g.phone.isOpen, ov: [...document.querySelectorAll('.overlay')].map(e => e.className + ' :: ' + e.textContent.slice(0, 120)), dlg: g.hud.dialogActive?.lines?.[0]?.text?.slice(0, 80) }; }));
await b.close();
