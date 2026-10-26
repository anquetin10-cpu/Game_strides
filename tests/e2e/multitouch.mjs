// Recette R03 : touchers simultanés en lecteur iPhone paysage (667×308, vrais touchers CDP à plusieurs doigts).
// Doigt 1 sur le joystick, doigt 2 maintenu sur GALOP, doigt 3 qui fait glisser la caméra, en même temps ; puis
// relâchement dans le désordre : aucune commande ne doit rester bloquée. Usage : BASE=… node tests/e2e/multitouch.mjs
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 667, height: 308 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.evaluate(() => {
  const g = window.__game;
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  g.missions.timer = 999;
  const h = g.mainHorse;
  g.player.human.setPosition(h.pos.x + 1, h.pos.z + 1);
  g.player.mount();
});
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
const fingers = new Map();
const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers.entries()].map(([id, p]) => ({ id, x: p[0], y: p[1] })) });
const gal = await page.evaluate(() => { const r = window.__game.hud.btnGallop?.getBoundingClientRect() || document.querySelector('.btn-gallop').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const state = () => page.evaluate(() => { const i = window.__game.input, p = window.__game.player; return { mag: +i.move.mag.toFixed(2), gallop: i.held.has('gallop'), joy: i.joy.id !== null, look: i.lookPtr.id !== null, yaw: +window.__game.cam.yaw.toFixed(3), gait: p.horse.gait, speed: +p.horse.speed.toFixed(1) }; });

// Doigt 1 : joystick poussé vers l'avant.
fingers.set(1, [110, 230]);
await send('touchStart');
fingers.set(1, [110, 175]);
await send('touchMove');
// Doigt 2 : GALOP maintenu.
fingers.set(2, gal);
await send('touchStart');
// Doigt 3 : glisser la caméra (moitié droite, hors boutons).
fingers.set(3, [420, 90]);
await send('touchStart');
const yaw0 = (await state()).yaw;
for (let k = 1; k <= 6; k++) {
  fingers.set(3, [420 + k * 14, 90]);
  await send('touchMove');
  await page.waitForTimeout(60);
}
await page.waitForTimeout(1200);
const s1 = await state();
check('R03 trois doigts : joystick, galop et caméra pris en compte ensemble', s1.mag > 0.8 && s1.gallop && s1.joy && s1.look && s1.yaw !== yaw0, JSON.stringify(s1));
check('R03 le cheval avance au galop pendant que la caméra tourne', s1.speed > 4, `vitesse ${s1.speed} m/s, allure ${s1.gait}`);
// Relâchement dans le désordre : galop d'abord, puis joystick, puis caméra.
// Le protocole CDP ne sait lever qu'ensemble tous les doigts : le doigt du galop est levé par l'événement de pointeur
// que reçoit le bouton (le jeu suit chaque doigt par son identifiant de pointeur).
await page.evaluate(() => { const el = window.__game.hud.btnGallop; el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 999, pointerType: 'touch' })); });
await page.waitForTimeout(200);
let s2 = await state();
check('R03 galop relâché seul : joystick et caméra toujours actifs', !s2.gallop && s2.joy && s2.look && s2.mag > 0.8, JSON.stringify(s2));
fingers.clear();
await send('touchEnd');
await page.waitForTimeout(1500);
s2 = await state();
check('R03 tous les doigts levés : aucune commande bloquée, le cheval ralentit', s2.mag === 0 && !s2.gallop && !s2.joy && !s2.look && s2.speed < s1.speed, JSON.stringify(s2));
console.log(errors.length ? `ERRORS ${errors.slice(0, 3).join(' | ')}` : 'ERRORS none');
console.log(fails ? `MULTITOUCH ${fails} échec(s)` : 'MULTITOUCH OK');
process.exitCode = fails || errors.length ? 1 : 0;
await b.close();
