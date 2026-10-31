// Vidéos continues de montée puis de descente à cheval, enregistrées dans le jeu (une image tous les deux pas de 1/30 s :
// 15 images/s, vitesse réelle). Rendu logiciel SwiftShader (image du jeu, cadence reconstituée : pas une capture
// d'iPhone). Deux prises : caméra du jeu (celle du joueur) et caméra fixe de profil (flanc gauche).
// Sorties : tests/e2e/out/videos/montee-descente-cheval-{jeu,profil}.mp4 et captures avant / pendant / après.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/horse-mount-video.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/videos';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const take of ['jeu', 'profil']) {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${base}/?autostart`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  await page.evaluate((take) => {
    const A = window.__auto, g = window.__game;
    A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
    g.phone.notify = () => {};
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 10.5 * 3600;
    A.foot();
    const h = g.mainHorse, p = g.player;
    h.setPosition(-104, 190, Math.PI / 2); h.ai = null;
    p.human.setPosition(-104.4, 187.6, 0.2);
    A.tick(10);
    g.cam.snap(p.focus.pos, p.heading);
    g.cam.yaw = h.heading + Math.PI / 2 + 0.6;
    g.cam.pitch = 0.2;
    if (take === 'profil') {
      const lx = Math.cos(h.heading), lz = -Math.sin(h.heading), fx = Math.sin(h.heading), fz = Math.cos(h.heading);
      const V = g.camera.position.constructor;
      g.cam.override = { pos: new V(h.pos.x + lx * 4.4 - fx * 0.8, h.pos.y + 1.8, h.pos.z + lz * 4.4 - fz * 0.8), look: new V(h.pos.x, h.pos.y + 1.4, h.pos.z) };
    }
    A.tick(6);
    g.hud.notifEl?.classList.add('hidden');
  }, take);
  const dir = `${OUT}/cheval-${take}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const frame = async () => {
    await page.evaluate(() => {
      const g = window.__game, A = window.__auto;
      for (let i = 0; i < 2; i++) {
        A.tick(1);
        g.realism?.update();
      }
      g.hud.notifEl?.classList.add('hidden');
      g.renderer.render(g.scene, g.camera);
    });
    await page.screenshot({ path: `${dir}/${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 86 });
  };
  for (let i = 0; i < 10; i++) await frame();
  // « Monter » : un appui.
  await page.keyboard.press('KeyE');
  await frame(); // l'appui est lu par l'image suivante
  let guard = 0;
  while ((await page.evaluate(() => window.__game.player.horseMount.active)) && guard++ < 400) await frame();
  for (let i = 0; i < 12; i++) await frame();
  // Quelques pas au pas, arrêt, puis « Descendre » : un appui.
  // (prise de profil : le cheval reste sur place, la descente se voit de profil)
  for (let i = 0; i < (take === 'jeu' ? 20 : 0); i++) {
    await page.evaluate(() => window.__game.input.setVirtualMove(0, 0.28));
    await frame();
  }
  await page.evaluate(() => window.__auto.releaseInput());
  for (let i = 0; i < 14; i++) await frame();
  await page.keyboard.press('KeyE');
  await frame();
  guard = 0;
  while ((await page.evaluate(() => window.__game.player.horseMount.active)) && guard++ < 400) await frame();
  for (let i = 0; i < 14; i++) await frame();
  const mp4 = `${OUT}/montee-descente-cheval-${take}.mp4`;
  const title = take === 'jeu' ? 'Montée et descente à cheval — caméra du jeu' : 'Montée et descente à cheval — profil';
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${dir}/%04d.jpg`, '-vf', `drawtext=text='${title} (STRIDES, capture du jeu)':x=16:y=h-34:fontsize=17:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=6`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', mp4]);
  console.log(`${take} : ${n} images → ${mp4}`);
  await page.context().close();
}
await browser.close();
