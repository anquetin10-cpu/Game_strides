// Joue toutes les missions de l'histoire avec le pilote automatique et vérifie qu'elles se terminent.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:5173/';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`${base}?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(() => { window.__auto.stopLoop(); window.__auto.closeCards(); });
const ids = only || ['tuto', 'groom', 'livraison', 'fugueur', 'plage', 'transport', 'fer', 'cross', 'pension', 'derby', 'csi3', 'gp'];
let failures = 0;
for (const id of ids) {
  const t0 = Date.now();
  const res = await page.evaluate((mid) => window.__auto.runStory(mid), id);
  const ms = Date.now() - t0;
  if (res.ok) console.log(`✔ ${id} (${ms} ms) ${JSON.stringify(res.completed)}`);
  else {
    failures++;
    console.log(`✘ ${id} (${ms} ms) ${res.error || res.failed}`);
    console.log('   ' + (res.log || []).join('\n   '));
  }
  await page.evaluate(() => { window.__game.renderer.render(window.__game.scene, window.__game.camera); });
  await page.screenshot({ path: `tests/e2e/out/mission-${id}.png` });
}
const state = await page.evaluate(() => { const d = window.__game.save.data; return { money: d.money, reputation: d.reputation, completed: d.completed, ratings: d.ratings }; });
console.log('STATE', JSON.stringify(state));
console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
