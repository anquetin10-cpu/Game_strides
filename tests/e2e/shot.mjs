// Capture d'écran d'une URL du serveur de dev : node tests/e2e/shot.mjs "<query>" out.png [w h]
import { chromium } from 'playwright';
const [,, query = '', out = 'tests/e2e/out/shot.png', w = '1280', h = '720'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5173/${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.screenshot({ path: out });
await browser.close();
