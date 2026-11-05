// Captures de l'interface sur iPhone émulé (Chromium, écran paysage) : titre, à pied, à cheval, téléphone, réglages.
// Usage : node tests/e2e/ui-pass/shots.mjs <dossier> [se|i14]   (BASE=http://127.0.0.1:5173)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const [out, which = 'i14'] = process.argv.slice(2);
const [W, H] = { se: [667, 375], i14: [844, 390] }[which];
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5173';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const shot = (n) => p.screenshot({ path: `${out}/${which}-${n}.jpg`, type: 'jpeg', quality: 80, timeout: 180000 });
// Écran titre (partie neuve), puis « Jouer » et création du personnage.
await p.goto(base + '/');
await p.waitForSelector('[data-id="play"], [data-id="continue"]', { timeout: 300000 });
await p.waitForTimeout(800);
await shot('1-titre');
await p.tap('[data-id="play"]');
await p.waitForSelector('[data-id="start"]', { timeout: 30000 });
await p.tap('[data-id="start"]');
await p.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 60000 });
await p.waitForTimeout(1500);
await shot('2-arrivee');
await p.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
// À pied près de Comète (mission en cours conservée).
await p.evaluate(async () => {
  const A = window.__auto, g = window.__game;
  A.closeCards();
  while (g.hud.dialogActive) g.hud.advanceDialog();
  A.closeCards();
  const h = g.mainHorse;
  if (g.stabling?.inBox?.(h)) g.stabling.takeOut?.(h);
  g.player.human.setPosition(h.pos.x + 1.6, h.pos.z + 0.8);
  for (let i = 0; i < 20; i++) { A.tick(1); await new Promise((r) => setTimeout(r, 30)); }
});
await p.waitForTimeout(1200);
await shot('3-a-pied');
// À cheval, au trot.
await p.evaluate(async () => {
  const A = window.__auto, g = window.__game;
  A.mount();
  for (let i = 0; i < 40; i++) { A.steer(0, 1, 0.5); A.tick(1); await new Promise((r) => setTimeout(r, 20)); }
  A.releaseInput();
});
await p.waitForTimeout(1200);
await shot('4-a-cheval');
// Téléphone : accueil puis réglages.
await p.evaluate(() => window.__game.phone.open());
await p.waitForTimeout(900);
await shot('5-telephone');
await p.evaluate(() => window.__game.phone.open('settings'));
await p.waitForTimeout(900);
await shot('6-reglages');
await p.evaluate(() => window.__game.phone.close());
// Reprise : rechargement → « Continuer ».
await p.reload();
await p.waitForSelector('[data-id="continue"]', { timeout: 300000 });
await p.waitForTimeout(600);
await shot('7-reprise');
await p.tap('[data-id="continue"]');
await p.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 60000 });
await p.waitForTimeout(1500);
await shot('8-reprise-jeu');
console.log('ERREURS', errs.slice(0, 3));
await b.close();
