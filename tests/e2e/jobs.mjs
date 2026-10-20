// Joue une série de jobs générés (coursier, transport, reconnaissance, groom).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto('http://localhost:5173/?autostart');
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
await page.addScriptTag({ type: 'module', content: "import { generateJob } from '/src/gameplay/jobs.js'; window.__jobs = { generateJob };" });
await page.waitForFunction(() => !!window.__jobs);
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(() => { window.__auto.stopLoop(); window.__auto.closeCards(); });
let fails = 0;
for (let i = 0; i < 16; i++) {
  const r = await page.evaluate(([seq, lvl]) => window.__auto.runJob(seq, lvl), [i + 100, 2 + (i % 3)]);
  console.log(`${r.ok ? '✔' : '✘'} ${r.title} ${r.ok ? `★${r.stars}` : r.failed || 'stuck'}`);
  if (!r.ok) { fails++; console.log('   ' + r.log.join('\n   ')); }
}
console.log('ERRORS', errors.join('\n') || 'none');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
