// Scénario de jeu automatisé (émulation iPhone 14 paysage) avec captures.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5173/';
const out = 'tests/e2e/out/sc';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
const shot = async (n) => page.screenshot({ path: `${out}-${n}.png` });
const G = (fn, arg) => page.evaluate(fn, arg);
const step = (msg) => console.log(`— ${msg}`);
await page.goto(`${base}?debug`);
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 180000 });
await page.waitForTimeout(800);
await shot('01-title');
step('title ok');
await page.tap('[data-id="play"]');
await page.waitForSelector('.setup input');
await shot('02-setup');
await page.fill('.setup input', 'Julie');
await page.tap('[data-id="start"]');
await page.waitForSelector('[data-id="go"]');
await page.tap('[data-id="go"]');
step('intro closed');
await page.waitForTimeout(800);
await shot('03-game');
// Attendre la notification de la première mission.
await page.waitForSelector('.notif.show', { timeout: 90000 });
await page.waitForTimeout(600);
await shot('04-notif');
step('notification received');
await page.tap('.notif.show .n-actions button.primary');
await page.waitForTimeout(800);
const m = await G(() => ({ active: window.__game.missions.active?.offer.title, dialog: !!window.__game.hud.dialogActive }));
console.log('mission', JSON.stringify(m));
await shot('05-dialog');
// Avancer les dialogues.
for (let i = 0; i < 6; i++) { if (await page.locator('.dialog:not(.hidden)').count()) { await page.tap('.dialog'); await page.waitForTimeout(250); } }
await shot('06-objective');
// Marcher vers le cheval avec le joystick tactile (glisser vers le haut à gauche).
const st = await G(() => { const g = window.__game; return { p: g.player.human.pos, h: g.mainHorse.pos, yaw: g.cam.yaw }; });
console.log('positions', JSON.stringify(st));
// Joystick : appui à (150, 300) puis glisser.
const cdp = await ctx.newCDPSession(page);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
await touch('touchStart', 150, 300);
for (let k = 0; k < 6; k++) { await touch('touchMove', 150, 300 - k * 10); await page.waitForTimeout(30); }
await page.waitForTimeout(1200);
const moved = await G(() => window.__game.player.human.pos);
await shot('07-walking');
await touch('touchEnd', 0, 0);
console.log('moved to', JSON.stringify(moved));
// Monter : téléporter près du cheval et appuyer sur ACTION.
await G(() => { const g = window.__game; const h = g.mainHorse; g.player.human.setPosition(h.pos.x + 1.5, h.pos.z + 1.5, 0); });
await page.waitForTimeout(400);
const label = await G(() => window.__game.interact.current?.label);
console.log('action label', label);
await page.tap('.btn-action');
await page.waitForTimeout(600);
console.log('mode', await G(() => window.__game.player.mode));
await shot('08-mounted');
// Galoper : joystick à fond + bouton galop.
await touch('touchStart', 150, 300);
await touch('touchMove', 150, 230);
await page.waitForTimeout(2500);
await shot('09-riding');
await touch('touchEnd', 0, 0);
console.log('speed', await G(() => window.__game.player.speed));
// Téléphone.
await page.tap('.phone-btn');
await page.waitForTimeout(700);
await shot('10-phone-home');
await page.tap('[data-app="strides"]');
await page.waitForTimeout(600);
await shot('11-strides');
for (const tab of ['ecuries', 'transport', 'evenements', 'annuaire', 'profil']) {
  await page.tap(`[data-tab="${tab}"]`);
  await page.waitForTimeout(400);
  await shot(`12-tab-${tab}`);
}
await page.tap('.home-btn');
await page.waitForTimeout(300);
await page.tap('[data-app="map"]');
await page.waitForTimeout(800);
await shot('13-map');
await page.tap('.phone-close');
await page.waitForTimeout(400);
console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();
