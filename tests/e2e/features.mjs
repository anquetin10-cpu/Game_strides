// Vérifie les fonctionnalités annexes : passants, boutique, sifflet, transport rapide, achat de cheval, fers d'or, chronos, photo.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${process.env.BASE || 'http://localhost:5173'}/?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 180000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const results = await page.evaluate(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards();
  const out = {};
  const check = (name, cond) => (out[name] = !!cond);
  // Passant : interaction « Parler ».
  A.foot();
  const walker = g.ambient.people.find((p) => p.chatter);
  g.player.human.setPosition(walker.pos.x + 1.2, walker.pos.z);
  A.tick(3);
  check('talk-available', g.interact.current?.label === 'Parler');
  g.interact.trigger();
  check('talk-dialog', !!g.hud.dialogActive);
  g.hud.advanceDialog();
  // Boutique.
  g.save.data.money = 2000;
  g.player.human.setPosition(-140, -266);
  A.tick(3);
  check('shop-available', g.interact.current?.label === 'Sellerie');
  check('buy-selle', g.buyUpgrade('selle'));
  check('mods-applied', g.mainHorse.mods.jump > 0.1);
  check('cannot-buy-twice', !g.buyUpgrade('selle'));
  // Sifflet : le cheval vient de loin.
  g.mainHorse.setPosition(300, 200, 0);
  check('whistle', g.player.whistle());
  A.tick(30 * 12);
  const d = Math.hypot(g.mainHorse.pos.x - g.player.human.pos.x, g.mainHorse.pos.z - g.player.human.pos.z);
  check('horse-arrived', d < 8);
  // Transport rapide.
  g.syncFade = true;
  g.save.data.money = 500;
  g.fastTravel({ x: 500, z: -318 }, 30, 'Écurie des Dunes');
  check('fast-travel', Math.hypot(g.player.focus.pos.x - 500, g.player.focus.pos.z + 318) < 15 && g.save.data.money === 470);
  // Achat et changement de cheval.
  g.save.data.money = 4000;
  check('buy-horse', g.buyHorse('onyx'));
  g.setActiveHorse('onyx');
  check('active-onyx', g.mainHorse.def.id === 'onyx' && g.player.horse === g.mainHorse);
  check('onyx-has-mods', g.mainHorse.mods.jump > 0.1);
  // Fer d'or.
  const it = g.collectibles.items[0];
  const before = g.save.data.horseshoes.length;
  g.player.human.setPosition(it.x, it.z);
  A.tick(3);
  check('horseshoe', g.save.data.horseshoes.length === before + 1);
  // Chrono (activité) : Sprint de la plage.
  A.mount();
  const act = g.activities.list()[0];
  g.activities.start(act);
  let ok = null;
  const off = g.bus.on('mission:complete', ({ result }) => (ok = result));
  for (let i = 0; i < 400 && !ok; i++) { A.solveStep(g.missions.active); A.tick(2); }
  off();
  check('activity-done', ok && /RECORD|CHRONO/.test(ok.title));
  check('best-time-saved', g.save.data.bestTimes.beach_sprint > 0);
  A.closeCards();
  // Mode photo.
  g.photoMode(true);
  A.tick(2);
  check('photo-on', g.state === 'photo' && document.querySelector('.photo-frame'));
  g.photoMode(false);
  check('photo-off', g.state === 'play' && !document.querySelector('.photo-frame'));
  // Contact pro hors mission : GPS placé.
  g.contactPro({ id: 'clinique', name: 'Dr Inès Vasseur', job: 'Vétérinaire', initials: 'IV', avail: 'Urgences 24/7', place: { x: 80, z: -199 } });
  check('contact-gps', g.gps.target && Math.abs(g.gps.target.x - 80) < 1);
  g.hud.advanceDialog();
  // Messages.
  g.message('Test', 'TT', 'Bonjour');
  check('message-saved', g.save.data.messages.some((m) => m.from === 'Test'));
  // Sauvegarde / rechargement des positions.
  g.saveNow();
  const raw = JSON.parse(localStorage.getItem('strides-grand-tour-v1'));
  check('save-written', raw && raw.horses.includes('onyx') && raw.pos);
  return out;
});
let fails = 0;
for (const [k, v] of Object.entries(results)) { console.log(`${v ? '✔' : '✘'} ${k}`); if (!v) fails++; }
console.log('ERRORS', errors.join('\n') || 'none');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
