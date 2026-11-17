// Gros plan du visage du personnage du joueur (modèle réaliste) pendant 8 s à l'arrêt : clignements et regard (vers la
// caméra proche, ou saccades). Une image par pas de 1/30 s ; poids des formes « blink » et « look » relevés à chaque image
// pour vérifier le rythme (nombre de clignements, durée) sans se fier à l'œil seul. Rendu SwiftShader : pas un iPhone.
// Les vidéos sont assemblées par tests/e2e/frames-to-video.mjs.
// Usage : BASE=http://127.0.0.1:5176 node tests/e2e/human-face-video.mjs <dossier> [f|m]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/human-face';
const AVATAR = process.argv[3] || 'f';
const BASE = process.env.BASE || 'http://127.0.0.1:5176';
const N = +(process.env.FRAMES || 300);
mkdirSync(join(OUT, 'visage'), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const ok = await E((AVATAR) => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  g.sky.rain = 0; g.sky.wet = 0;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
  const st = document.createElement('style');
  st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }';
  document.head.appendChild(st);
  if (g.player.avatar !== AVATAR && g.player.setAvatar) g.player.setAvatar(AVATAR);
  A.foot();
  const h = g.mainHorse;
  h.setPosition(120, g.terrain.waterlineZ(120) + 30, 0);
  h.inBox = false; h.ai = null;
  const hu = g.player.human;
  hu.setPosition(160, g.terrain.waterlineZ(160) + 9, 0.6);
  // Boucle d'affichage du jeu suspendue : seul ce script fait avancer le temps et place la caméra (sinon, entre deux
  // images, le jeu remet sa caméra derrière le personnage et le visage ne « voit » plus la caméra proche).
  g.renderer.setAnimationLoop(null);
  for (let i = 0; i < 40; i++) { g.update(1 / 30); g.realism?.update(); }
  return !!g.realism?.body;
}, AVATAR);
const rows = [];
for (let k = 0; k < N; k++) {
  rows.push(await E((k) => {
    const g = window.__game, hu = g.player.human;
    // Une seule mise à jour du modèle réaliste par image, après le placement de la caméra : sinon la première consomme
    // le pas de temps avec la caméra du jeu (loin, derrière) et le visage ne « voit » jamais la caméra proche.
    g.update(1 / 30);
    // Caméra à 0,75 m devant le visage ; elle glisse lentement de côté (le regard doit la suivre puis la perdre).
    const c = Math.cos(hu.heading), s = Math.sin(hu.heading), lat = 0.35 * Math.sin(k / 240 * Math.PI * 2);
    const p = hu.pos, W = (q) => [p.x + c * q[0] + s * q[2], p.y + q[1], p.z - s * q[0] + c * q[2]];
    g.camera.position.set(...W([lat, 1.6, 0.75])); g.camera.fov = 30; g.camera.updateProjectionMatrix();
    g.camera.lookAt(...W([0, 1.57, 0])); g.camera.updateMatrixWorld();
    g.sky.follow(g.camera);
    g.realism?.update();
    g.renderer.render(g.scene, g.camera);
    const m = g.realism?.body?.morphMeshes?.find((o) => o.morphTargetDictionary.blink_left != null);
    const w = (n) => (m && m.morphTargetDictionary[n] != null ? +m.morphTargetInfluences[m.morphTargetDictionary[n]].toFixed(3) : null);
    return { k, blink: w('blink_left'), lookL: w('look_left'), lookR: w('look_right'), lookU: w('look_up'), lookD: w('look_down'), smile: w('face_smile'), browUp: w('brow_up'), browFrown: w('brow_frown'), press: w('lips_press'), frown: w('face_frown') };
  }, k));
  await page.screenshot({ path: join(OUT, 'visage', `${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 85, timeout: 240000 });
}
// Clignements : passages du poids au-dessus de 0,5 ; durée moyenne (images au-dessus de 0,1 par clignement).
let blinks = 0, closed = 0, above = false;
for (const r of rows) {
  if (r.blink > 0.1) closed++;
  if (r.blink > 0.5 && !above) blinks++;
  above = r.blink > 0.5;
}
const res = { base: BASE, realistic: ok, frames: N, seconds: N / 30, blinks, meanBlinkFrames: blinks ? +(closed / blinks).toFixed(1) : null,
  lookRange: { left: Math.max(...rows.map((r) => r.lookL || 0)), right: Math.max(...rows.map((r) => r.lookR || 0)) },
  // Expressions (formes du lot v3 ; null : modèle sans ces formes) : plus grand poids atteint sur la séquence.
  expressions: Object.fromEntries(['smile', 'browUp', 'browFrown', 'press', 'frown'].map((k) => [k, rows[0][k] == null ? null : Math.max(...rows.map((r) => r[k] || 0))])), errors };
writeFileSync(join(OUT, 'mesures.json'), JSON.stringify({ ...res, rows }, null, 1));
console.log(JSON.stringify(res));
await browser.close();
