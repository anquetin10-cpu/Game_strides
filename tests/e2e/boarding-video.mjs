// Vidéos de montée et de descente, enregistrées dans le jeu image par image (caméra du jeu, 15 images/s, une image
// tous les deux pas de simulation de 1/30 s : vitesse réelle) : le joueur appuie sur « Monter », démarre, roule quelques mètres, s'arrête,
// appuie sur « Descendre ». Une vidéo MP4 par véhicule principal dans tests/e2e/out/videos/ (ffmpeg).
// Rendu logiciel (SwiftShader) : l'image est celle du jeu, la cadence est reconstituée (pas une capture d'iPhone).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/boarding-video.mjs [defender,van,truck,car,tractor]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const list = process.argv[2] ? process.argv[2].split(',') : ['defender', 'van', 'truck'];
const OUT = 'tests/e2e/out/videos';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart&defender=mobile`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  while (g.hud.dialogActive) g.hud.advanceDialog();
  g.missions.abandon?.();
  A.closeCards();
  g.missions.timer = 1e6;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 10.5 * 3600;
  g.phone.notify = () => {};
  A.tick(3);
});
const NAMES = { defender: 'Defender 110', van: 'Renault Master', truck: 'Scania', car: 'SUV 4x4', tractor: 'Tracteur' };
for (const key of list) {
  const dir = `${OUT}/${key}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // Mise en place : à quelques pas de la portière conducteur, caméra du jeu orientée sur ce côté du véhicule.
  await page.evaluate((key) => {
    const g = window.__game, A = window.__auto, p = g.player;
    const v = key === 'truck' ? g.truck : key === 'van' ? g.van : key === 'defender' ? g.defender : key === 'tractor' ? g.drivables.find((d) => d.isTractor) : g.drivables.find((d) => d.kind === 'duster');
    window.__v = v;
    if (p.mode === 'drive') p.vehicle === g.truck ? p.exitTruck() : p.exitVehicle();
    const P = p.boarding.profile(v);
    const s = v.groundPoint(P.colX + 2.4, P.hips.z - 1.4);
    p.human.setPosition(s.x, s.z, v.heading - Math.PI / 2);
    g.cam.yaw = v.heading + Math.PI / 2 + 0.75;
    g.cam.pitch = 0.22;
    A.tick(10);
    g.cam.snap(p.focus.pos, p.heading);
    g.cam.yaw = v.heading + Math.PI / 2 + 0.75;
    A.tick(5);
    g.hud.notifEl?.classList.add('hidden');
  }, key);
  let n = 0;
  const frame = async (k = 2) => {
    await page.evaluate((k) => {
      const g = window.__game, A = window.__auto;
      for (let i = 0; i < k; i++) {
        A.tick(1);
        // Caméra libre tenue sur le flanc (le joueur regarde la scène) : pas de recentrage automatique.
        g.cam.lastManual = g.time;
      }
      g.hud.notifEl?.classList.add('hidden');
      g.renderer.render(g.scene, g.camera);
    }, k);
    await page.screenshot({ path: `${dir}/${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88 });
  };
  for (let i = 0; i < 8; i++) await frame();
  // « Monter » (un appui) : le joueur marche jusqu'à la portière et s'installe.
  await page.evaluate(() => {
    const g = window.__game, p = g.player, v = window.__v;
    const dp = v.doorPoint(1);
    p.human.setPosition(dp.x, dp.z, p.human.heading);
    window.__auto.tick(1);
    g.interact.update();
    g.interact.trigger();
  });
  let guard = 0;
  while ((await page.evaluate(() => window.__game.player.mode)) !== 'drive' && guard++ < 300) await frame();
  for (let i = 0; i < 10; i++) await frame();
  // Quelques mètres, arrêt.
  for (let i = 0; i < 23; i++) {
    await page.evaluate(() => window.__game.input.setVirtualMove(0, 0.45));
    await frame();
  }
  guard = 0;
  while ((await page.evaluate(() => Math.abs(window.__v.speed))) > 0.05 && guard++ < 100) {
    await page.evaluate(() => window.__game.input.setVirtualMove(0, -0.5));
    await frame();
  }
  await page.evaluate(() => window.__auto.releaseInput());
  for (let i = 0; i < 8; i++) await frame();
  // « Descendre ».
  await page.evaluate(() => {
    const g = window.__game;
    g.cam.yaw = window.__v.heading + Math.PI / 2 + 0.75;
    g.interact.update();
    g.interact.trigger();
  });
  guard = 0;
  while ((await page.evaluate(() => window.__game.player.mode)) !== 'foot' && guard++ < 300) await frame();
  for (let i = 0; i < 12; i++) await frame();
  const mp4 = `${OUT}/montee-descente-${key}.mp4`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${dir}/%04d.jpg`, '-vf', `drawtext=text='${NAMES[key]} — STRIDES (capture du jeu)':x=16:y=h-34:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=6`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', mp4]);
  console.log(`${key} : ${n} images → ${mp4}`);
}
console.log('erreurs', errors.slice(0, 3));
await browser.close();
