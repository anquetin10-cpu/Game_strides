// Vidéo courte du rythme de vie, enregistrée dans le jeu image par image (caméra et HUD du jeu, 15 images/s ; une image
// tous les deux pas de simulation de 1/30 s ; l'heure du jeu est accélérée dans les passages indiqués) :
//   1. fin d'après-midi à cheval : l'heure avance, l'énergie baisse, l'avertissement « Fatigue » apparaît ;
//   2. café au Galop : « Prendre un café » (+12, puis +7) ;
//   3. retour à la maison le soir : entrée, chambre, lit, « Dormir jusqu'au matin » ;
//   4. nouvelle journée : carte « Bonjour ! », 7:00, énergie 100 %, sortie au petit matin.
// Rendu logiciel (SwiftShader), émulation d'écran d'iPhone 13 en paysage : ce n'est pas une capture d'iPhone réel.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/life-video.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/videos';
const DIR = `${OUT}/life`;
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  while (g.hud.dialogActive) g.hud.advanceDialog();
  g.missions.abandon?.();
  A.closeCards();
  g.missions.timer = 1e6;
  g.syncFade = true;
  g.save.data.money = 120;
  g.save.data.flags.stridesNotice = true;
  g.updateWallet();
  // Légende de la vidéo (bandeau en bas de l'écran).
  const cap = document.createElement('div');
  cap.id = 'vcap';
  cap.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:99999;max-width:70%;padding:6px 12px;border-radius:10px;background:rgba(15,15,14,.72);color:#fbfaf5;font:600 13px/1.3 Geist,-apple-system,Arial,sans-serif;text-align:center;pointer-events:none';
  document.body.appendChild(cap);
  const fade = document.createElement('div');
  fade.id = 'vfade';
  fade.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#000;opacity:0;pointer-events:none';
  document.body.appendChild(fade);
});
const caption = (text) => ev((t) => { document.getElementById('vcap').textContent = t; }, text);
let n = 0;
const events = [];
// Une image : k pas de simulation (1/30 s chacun), `fast` minutes de jeu en plus par image (heure accélérée).
const frame = async ({ k = 2, fast = 0, drive = null } = {}) => {
  await ev(([k, fast, drive]) => {
    const g = window.__game, A = window.__auto;
    for (let i = 0; i < k; i++) {
      if (drive) window.__drive(drive);
      if (fast) g.save.data.gameTime += (fast * 60) / k;
      A.tick(1);
    }
    g.hud.notifEl?.classList.add('hidden');
    g.renderer.render(g.scene, g.camera);
  }, [k, fast, drive]);
  await page.screenshot({ path: `${DIR}/${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 86 });
};
const hold = async (frames) => { for (let i = 0; i < frames; i++) await frame({ k: 1 }); };
const fadeTo = async (a, frames = 6) => {
  const a0 = await ev(() => +document.getElementById('vfade').style.opacity || 0);
  for (let i = 1; i <= frames; i++) {
    await ev((o) => { document.getElementById('vfade').style.opacity = String(o); }, a0 + ((a - a0) * i) / frames);
    await frame({ k: 1 });
  }
};
const mark = async (label) => events.push({ t: +(n / 15).toFixed(2), label, ...(await ev(() => ({ hour: window.__game.clockText(), energy: Math.round(window.__game.energy.value) }))) });
// Pilotage à cheval : galop autour de la carrière de l'Écurie du Val (cercle de 9 m).
await ev(() => {
  const g = window.__game;
  window.__drive = (mode) => {
    const A = window.__auto, h = g.player.horse;
    if (mode !== 'arena' || !h) return;
    const C = { x: -100, z: 212 };
    const a = Math.atan2(h.pos.x - C.x, h.pos.z - C.z) + 0.55;
    const t = { x: C.x + Math.sin(a) * 9, z: C.z + Math.cos(a) * 9 };
    const d = Math.hypot(t.x - h.pos.x, t.z - h.pos.z) || 1;
    A.steer((t.x - h.pos.x) / d, (t.z - h.pos.z) / d, 0.86);
  };
});

// ---------- 1. Fin d'après-midi à cheval : l'heure avance, l'énergie baisse ----------
await ev(() => {
  const g = window.__game, A = window.__auto, d = g.save.data;
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 15.5 * 3600;
  g.energy.sync();
  g.energy.set(43.5);
  d.life.notified = 'medium,';
  g.energy._tier = 'medium';
  A.mount();
  g.player.horse.setPosition(-100, 203, Math.PI / 2);
  g.cam.snap(g.player.focus.pos, Math.PI / 2);
  A.tick(10);
});
await caption('Fin d’après-midi après une journée de missions : l’heure avance (accéléré), l’énergie baisse');
await mark('à cheval, heure accélérée');
for (let i = 0; i < 105; i++) await frame({ fast: 2.2, drive: 'arena' });
await mark('après la baisse (avertissement Fatigue)');
await caption('Sous 35 % : « Fatigue » — on court un peu moins vite ; la jauge passe à l’orange');
for (let i = 0; i < 30; i++) await frame({ fast: 0.4, drive: 'arena' });
await ev(() => window.__auto.releaseInput());

// ---------- 2. Café au Galop ----------
await fadeTo(1);
await ev(() => {
  const g = window.__game, A = window.__auto, sh = g.shops;
  A.ensureMode('foot');
  const d = sh.doorOut('cafe');
  g.player.human.setPosition(d.x, d.z, 0);
  A.tick(4);
  sh.enter('cafe', { instant: true });
  const c = sh.toW('cafe', -1.6, 0.4);
  g.player.human.setPosition(c.x, c.z, sh.anchor ? 0 : 0);
  const t = sh.toW('cafe', -1.6, -0.55);
  g.player.human.heading = Math.atan2(t.x - c.x, t.z - c.z);
  g.cam.snap(g.player.human.pos, g.player.human.heading);
  A.tick(8);
});
await caption('Café-boulangerie Le Galop : « Prendre un café » — un peu d’énergie, moins à chaque tasse');
await fadeTo(0);
await hold(10);
await ev(() => { const g = window.__game; g.shops._greeted = 'cafe'; g.shops.openCafe(); });
await hold(18);
await mark('carte du café');
for (let i = 0; i < 2; i++) {
  await ev(() => window.__auto.tap(document.querySelector('.overlay [data-item="cafe"] button')));
  await ev(() => new Promise((r) => setTimeout(r, 700)));
  await hold(16);
  await mark(`café ${i + 1}`);
}
await caption('Un café ne remplace pas une nuit : jamais au-delà de 70 %, et plus d’effet après trois tasses');
await hold(16);
await ev(() => window.__auto.closeCards());

// ---------- 3. Retour à la maison le soir : lit ----------
await fadeTo(1);
const hasHome = await ev(() => !!window.__game.home);
await ev((hasHome) => {
  const g = window.__game, A = window.__auto, d = g.save.data;
  g.shops.exit({ instant: true });
  A.tick(2);
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 22.25 * 3600;
  g.energy.update();
  const door = hasHome ? g.home.anchor('door') : g.rest.homeDoor();
  g.player.human.setPosition(door.x, door.z + 2.5, Math.PI);
  g.cam.snap(g.player.human.pos, Math.PI);
  A.tick(10);
}, hasHome);
await caption('22 h 15 : retour à la maison de l’Écurie du Val');
await fadeTo(0);
await mark('devant la maison');
if (hasHome) {
  // Quelques pas jusqu'à la porte, « Entrer ».
  for (let i = 0; i < 24; i++) {
    await ev(() => { const g = window.__game, A = window.__auto, p = g.player.human.pos, t = g.home.anchor('door'); const dd = Math.hypot(t.x - p.x, t.z - p.z); if (dd > 0.3) A.steer((t.x - p.x) / dd, (t.z - p.z) / dd, 0.55); else A.steer(0, 0, 0); });
    await frame();
  }
  await ev(() => { const g = window.__game; window.__auto.steer(0, 0, 0); g.interact.update(); if (g.interact.current?.label === 'Entrer') g.interact.trigger(); });
  await ev(() => new Promise((r) => { const t0 = performance.now(); const w = () => (window.__game.home.inside || performance.now() - t0 > 4000 ? r() : setTimeout(w, 50)); w(); }));
  await hold(6);
  await caption('La maison : salon, cuisine, salle de bain… et la chambre');
  // Vers le lit, par le passage du salon à la chambre (repère local de la maison : origine au centre).
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
      await frame();
      if (done) break;
    }
  }
  await ev(() => { const g = window.__game, b = g.home.anchor('bed'); if (b.heading !== undefined) g.player.human.heading = b.heading; window.__auto.steer(0, 0, 0); });
  await hold(8);
  await mark('au lit');
}
await ev(() => { const g = window.__game; g.interact.update(); const c = g.interact.current; if (c && /Se coucher|Se reposer/.test(c.label)) g.interact.trigger(); else g.rest.openBed(); });
await caption('Le lit : dormir jusqu’au matin, faire une sieste (1 h 30), ou passer à la journée suivante en journée');
await hold(30);
await mark('menu du lit');
await ev(() => window.__auto.tap(document.querySelector('.overlay [data-choice="night"]')));
await fadeTo(1, 8);
await hold(6);
await fadeTo(0, 8);
await caption('Nouvelle journée : 7:00, énergie 100 %, cafés et siestes remis à zéro, partie sauvegardée');
await hold(40);
await mark('nouvelle journée');
await ev(() => window.__auto.tap(document.querySelector('.overlay [data-id="newday-ok"]')));
await hold(6);
// ---------- 4. Le matin : sortie ----------
if (hasHome) {
  await fadeTo(1, 5);
  await ev(() => { const g = window.__game; g.home.exit?.({ instant: true }); window.__auto.tick(4); g.cam.snap(g.player.human.pos, g.player.human.heading); });
  await fadeTo(0, 5);
}
await caption('On repart le lendemain matin, reposé');
for (let i = 0; i < 26; i++) {
  await ev(() => { const g = window.__game; const yaw = g.cam.yaw; window.__auto.steer(-Math.sin(yaw), -Math.cos(yaw), 0.6); });
  await frame();
}
await ev(() => window.__auto.releaseInput());
await hold(10);
await mark('le matin');
const mp4 = `${OUT}/rythme-de-vie.mp4`;
writeFileSync(`${OUT}/rythme-de-vie.events.json`, JSON.stringify({ frames: n, fps: 15, seconds: +(n / 15).toFixed(1), house: hasHome, events, errors }, null, 1));
// (dimensions paires exigées par l'encodeur H.264)
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${DIR}/%04d.jpg`, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', mp4]);
console.log(`${n} images (${(n / 15).toFixed(1)} s) → ${mp4}`);
console.log('événements', JSON.stringify(events));
console.log('erreurs', errors.slice(0, 3));
await browser.close();
