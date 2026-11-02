// Vidéo du cycle coucher → publicités → réveil (rendu logiciel SwiftShader, écran d'iPhone 13 en paysage émulé :
// pas une capture d'iPhone réel).
//  A. image par image (15 images/s, une image tous les deux pas de 1/30 s) : retour à la maison le soir, chambre,
//     « Se coucher », menu du lit, « Dormir jusqu'au matin » ;
//  B. en temps réel (enregistrement vidéo du navigateur, boucle du jeu active) : personnage couché, nuit, publicité 1 (emplacement
//     Kingsland, habillage neutre), publicité 2 (Strides, laissée jusqu'au bout), lever du jour, carte « Bonjour ! » ;
//  C. image par image : « Commencer la journée », le matin (7:00, énergie 100 %).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/night-video.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/videos';
const DIR = `${OUT}/night`;
rmSync(DIR, { recursive: true, force: true });
mkdirSync(`${DIR}/a`, { recursive: true });
mkdirSync(`${DIR}/c`, { recursive: true });
mkdirSync(`${DIR}/rec`, { recursive: true });
const W = 844, H = 390;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${DIR}/rec`, size: { width: W, height: H } } });
const recStart = Date.now();
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 480000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.missions.timer = 1e6;
  g.save.data.flags.stridesNotice = true;
  g.syncFade = false;
  const cap = document.createElement('div');
  cap.id = 'vcap';
  cap.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:99999;max-width:72%;padding:5px 11px;border-radius:9px;background:rgba(15,15,14,.72);color:#fbfaf5;font:600 12px/1.3 Geist,-apple-system,Arial,sans-serif;text-align:center;pointer-events:none';
  document.body.appendChild(cap);
});
const caption = (text) => ev((t) => { document.getElementById('vcap').textContent = t; document.getElementById('vcap').style.display = t ? '' : 'none'; }, text);
let na = 0, nc = 0;
const frame = async (dir = 'a', k = 2) => {
  await ev((k) => { const g = window.__game, A = window.__auto; for (let i = 0; i < k; i++) A.tick(1); g.renderer.render(g.scene, g.camera); }, k);
  const n = dir === 'a' ? na++ : nc++;
  await page.screenshot({ path: `${DIR}/${dir}/${String(n).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88, timeout: 120000 });
};
const hold = async (dir, frames) => { for (let i = 0; i < frames; i++) await frame(dir, 1); };

// ---------- A. Le soir : la maison, la chambre, le lit ----------
await ev(async () => {
  const g = window.__game, A = window.__auto, d = g.save.data;
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 22.25 * 3600;
  g.energy.sync();
  g.energy.set(31);
  const door = g.home.anchor('door');
  g.player.human.setPosition(door.x, door.z + 3.2, Math.PI);
  g.cam.snap(g.player.human.pos, Math.PI);
  A.tick(8);
});
await caption('22 h 15 · énergie 31 % : retour à la maison de l’Écurie du Val');
for (let i = 0; i < 22; i++) {
  await ev(() => { const g = window.__game, A = window.__auto, p = g.player.human.pos, t = g.home.anchor('door'); const dd = Math.hypot(t.x - p.x, t.z - p.z); if (dd > 0.3) A.steer((t.x - p.x) / dd, (t.z - p.z) / dd, 0.55); else A.steer(0, 0, 0); });
  await frame('a');
}
await ev(async () => { const g = window.__game; window.__auto.steer(0, 0, 0); await g.home.enter({ instant: true }); window.__auto.tick(4); });
await caption('La chambre');
const route = [[0.5, 0.3], [0.5, -1.05], [-1.5, -1.05], [-2.6, 1.2], [-4.45, 0.35]];
for (const [lx, lz] of route) {
  for (let i = 0; i < 90; i++) {
    const done = await ev(([lx, lz]) => {
      const g = window.__game, A = window.__auto, p = g.player.human.pos, b = g.home.anchor('bed');
      const t = { x: b.x + 4.45 + lx, z: b.z - 0.35 + lz };
      const dd = Math.hypot(t.x - p.x, t.z - p.z);
      if (dd > 0.3) { A.steer((t.x - p.x) / dd, (t.z - p.z) / dd, 0.5); return false; }
      A.steer(0, 0, 0);
      return true;
    }, [lx, lz]);
    await frame('a');
    if (done) break;
  }
}
await ev(() => { const g = window.__game, b = g.home.anchor('bed'); g.player.human.heading = b.heading; window.__auto.steer(0, 0, 0); window.__auto.tick(4); g.interact.update(); });
await hold('a', 8);
await caption('« Se coucher » → « Dormir jusqu’au matin »');
await ev(() => { const g = window.__game; g.interact.update(); g.interact.trigger(); });
await hold('a', 26);

// ---------- B. La nuit, en temps réel ----------
await caption('');
// La vraie boucle du jeu tourne pendant toute la nuit (comme en jeu : scène non redessinée pendant les publicités).
await ev(() => window.__auto.startLoop());
const tB0 = Date.now();
await ev(() => window.__auto.tap(document.querySelector('.overlay [data-choice="night"]')));
await page.waitForFunction(() => !document.querySelector('.night-seq') && document.querySelector('.overlay [data-id="newday-ok"]'), null, { timeout: 120000 });
await page.waitForTimeout(2500);
const tB1 = Date.now();
await ev(() => window.__auto.stopLoop());
const log = await ev(() => window.__game.save.data.ads.log);

// ---------- C. Le matin ----------
await ev(() => window.__auto.tap(document.querySelector('.overlay [data-id="newday-ok"]')));
await caption('7:00 · énergie 100 % : une nouvelle journée commence');
await hold('c', 6);
for (let i = 0; i < 20; i++) {
  await ev(() => { const g = window.__game, A = window.__auto, p = g.player.human.pos, b = g.home.anchor('bed'); const t = { x: b.x + 2.0, z: b.z + 0.85 }; const dd = Math.hypot(t.x - p.x, t.z - p.z); if (dd > 0.3) A.steer((t.x - p.x) / dd, (t.z - p.z) / dd, 0.5); else A.steer(0, 0, 0); });
  await frame('c');
}
await ev(() => window.__auto.steer(0, 0, 0));
await hold('c', 12);

await page.close();
await ctx.close();
const webm = readdirSync(`${DIR}/rec`).find((f) => f.endsWith('.webm'));
const ss = Math.max(0, (tB0 - recStart) / 1000 - 0.3), dur = (tB1 - tB0) / 1000 + 0.3;
const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-r', '30', '-vf', `scale=${W}:${H}:flags=lanczos,setsar=1`];
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${DIR}/a/%04d.jpg`, ...enc, `${DIR}/a.mp4`]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', ss.toFixed(2), '-i', `${DIR}/rec/${webm}`, '-t', dur.toFixed(2), ...enc, `${DIR}/b.mp4`]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${DIR}/c/%04d.jpg`, ...enc, `${DIR}/c.mp4`]);
writeFileSync(`${DIR}/list.txt`, ['a', 'b', 'c'].map((x) => `file '${x}.mp4'`).join('\n'));
const mp4 = `${OUT}/nuit-coucher-publicites-reveil.mp4`;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${DIR}/list.txt`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', mp4]);
const info = { parts: { a: { frames: na, seconds: +(na / 15).toFixed(1) }, b: { seconds: +dur.toFixed(1), recordedRealTime: true }, c: { frames: nc, seconds: +(nc / 15).toFixed(1) } }, ads: log, errors };
writeFileSync(`${OUT}/nuit-coucher-publicites-reveil.json`, JSON.stringify(info, null, 1));
console.log(JSON.stringify(info));
await browser.close();
