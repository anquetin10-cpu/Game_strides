// Commandes d'allure en lecteur iPhone (667×308) : joystick seul à fond = galop (3) ; bouton BOOST maintenu = grand
// galop (4), bouton doré avec anneau d'endurance ; relâché, le cheval revient au galop. Usage : node tests/e2e/boost.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 667, height: 308 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(() => { const g = window.__game; document.querySelectorAll('.overlay').forEach((o) => o.remove()); g.missions.timer = 999; const h = g.mainHorse; g.player.human.setPosition(h.pos.x + 1, h.pos.z + 1); g.player.mount(); g.mainHorse.setPosition(140, 200, 0); g.cam.yaw = Math.PI; window.__auto.stopLoop(); });
const run = (sec, gallop) => page.evaluate(([sec, gallop]) => {
  const g = window.__game, A = window.__auto, h = g.mainHorse;
  for (let i = 0; i < sec * 30; i++) { A.steer(0, 1, 1); if (gallop) g.input.held.add('gallop'); else g.input.held.delete('gallop'); A.tick(1); }
  g.hud.update?.(1 / 30);
  return { gait: h.gait, anim: h.anim.gait, sp: h.speed.toFixed(1), st: Math.round(h.stamina), ex: h.exhausted, pos: [Math.round(h.pos.x), Math.round(h.pos.z)], cls: document.querySelector('.btn-gallop').className, ring: document.querySelector('.btn-gallop').style.getPropertyValue('--st') };
}, [sec, gallop]);
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const a = await run(5, false);
await page.evaluate(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
await page.screenshot({ path: 'tests/e2e/out/boost-canter.png' });
check('joystick seul à fond : galop', a.gait === 3 && Math.abs(+a.sp - 6.5) < 0.3, JSON.stringify(a));
check('bouton BOOST visible en selle, anneau plein', a.cls.includes('boost') && !a.cls.includes('boosting') && a.ring === '100%');
const b2 = await run(4, true);
await page.evaluate(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
await page.screenshot({ path: 'tests/e2e/out/boost-gallop.png' });
check('BOOST maintenu : grand galop, bouton allumé, endurance qui baisse', b2.gait === 4 && b2.cls.includes('boosting') && parseInt(b2.ring) < 100, JSON.stringify(b2));
const c = await run(3, false);
check('BOOST relâché : retour au galop', c.gait === 3 && !c.cls.includes('boosting'), JSON.stringify(c));
check('aucune erreur', !errors.length, errors.join(' | '));
await b.close();
console.log(fails ? `ÉCHECS : ${fails}` : 'BOOST OK');
process.exit(fails ? 1 : 0);
