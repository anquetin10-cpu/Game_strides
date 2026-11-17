// Vidéo du personnage du joueur à pied : départ, marche, course, arrêt, demi-tour, attente (une image par pas de 1/30 s,
// caméra qui suit le personnage de profil et de trois-quarts). Rendu SwiftShader de Chromium : pas un iPhone.
// Mesure par image : glissement des pieds (déplacement horizontal d'un pied posé, cm/image) et balancement des bras.
// Les vidéos (vitesse réelle et ralenti) sont assemblées par tests/e2e/frames-to-video.mjs.
// Usage : BASE=http://127.0.0.1:5176 [CLASSIC=1] node tests/e2e/human-walk-video.mjs <dossier> [f|m]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/human-walk';
const AVATAR = process.argv[3] || 'f';
const BASE = process.env.BASE || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${BASE}/?autostart${process.env.CLASSIC ? '&classic' : ''}`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await E((AVATAR) => {
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
  const z = g.terrain.waterlineZ(160) + 9;
  hu.setPosition(160, z, -Math.PI / 2);
  const K = (window.__K = {});
  K.step = () => { g.update(1 / 30); g.realism?.update(); };
  // Caméra qui suit le personnage : décalage dans le repère du monde (x vers le rivage, côté mer).
  K.cam = (off, fov) => {
    const p = hu.pos;
    g.camera.position.set(p.x + off[0], p.y + off[1], p.z + off[2]); g.camera.fov = fov; g.camera.updateProjectionMatrix();
    g.camera.lookAt(p.x, p.y + 0.95, p.z); g.camera.updateMatrixWorld();
    g.sky.follow(g.camera);
    g.world.update(1 / 30, g.camera, g.sky, p);
    g.renderer.render(g.scene, g.camera);
  };
  for (let i = 0; i < 20; i++) K.step();
  // Pieds : os des orteils (squelette du jeu) pour mesurer le glissement d'un pied posé.
  K.feet = () => {
    const out = [];
    hu.mesh.updateMatrixWorld(true);
    hu.mesh.skeleton.bones.forEach((b) => { if (/toe/i.test(b.name)) { const e = b.matrixWorld.elements; out.push([e[12], e[13] - g.terrain.getHeight(e[12], e[14]), e[14]]); } });
    return out;
  };
}, AVATAR);
// Plan : [nombre d'images, consigne (cap en x, intensité)] — départ, marche, course, ralentissement, arrêt, demi-tour, attente.
// Dernière étape : demi-tour sur place (cap imposé à 2,6 rad/s, sans avancer), comme un PNJ qui se tourne vers le joueur.
const PLAN = [[20, 0, 0], [70, -1, 0.4], [60, -1, 1], [20, -1, 0.4], [30, 0, 0], [45, 1, 0.4], [30, 0, 0], [40, 0, -1], [30, 0, 0]];
const VIEWS = { profil: [[0, 1.1, 4.2], 32], troisquarts: [[-2.6, 1.5, 3.2], 34] };
for (const v of Object.keys(VIEWS)) mkdirSync(join(OUT, v), { recursive: true });
const rows = [];
let k = 0;
for (const [n, dx, mag] of PLAN) {
  for (let i = 0; i < n; i++, k++) {
    const r = await E(([dx, mag]) => {
      const g = window.__game, A = window.__auto;
      if (mag > 0) A.steer(dx, 0, mag); else g.input.setVirtualMove(0, 0);
      // Rotation sur place : le cap tourne, la position reste (le joueur ne bouge pas : vitesse nulle).
      if (mag < 0) { const hu = g.player.human; hu.heading += 2.6 / 30; if (g.player.setHeading) g.player.setHeading(hu.heading); }
      window.__K.step();
      const hu = g.player.human;
      return { x: hu.pos.x, speed: hu.speed ?? null, feet: window.__K.feet() };
    }, [dx, mag]);
    rows.push({ k, mag, ...r });
    if (!process.env.NOSHOT) for (const [v, [off, fov]] of Object.entries(VIEWS)) {
      await E(([off, fov]) => window.__K.cam(off, fov), [off, fov]);
      await page.screenshot({ path: join(OUT, v, `${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 82, timeout: 240000 });
    }
  }
}
// Glissement : un pied posé (os des orteils, qui reste au sol quand le talon se lève, à moins de 2 cm au-dessus de sa hauteur la plus basse au-dessus du terrain, sur deux
// trois images de suite : un pied qui se pose ou se lève ne compte pas) ne devrait pas avancer ; on mesure son déplacement horizontal d'une image à l'autre.
const nf = rows[0].feet.length;
const minY = Array.from({ length: nf }, (_, j) => { const a = rows.map((r) => r.feet[j][1]).sort((x, y) => x - y); return a[Math.floor(a.length * 0.05)]; }); // 5e centile : une image aberrante ne fausse pas la référence
const slips = [];
for (let i = 1; i < rows.length - 1; i++) for (let j = 0; j < nf; j++) {
  const a = rows[i - 1].feet[j], b = rows[i].feet[j];
  const n = rows[i + 1].feet[j];
  if (a[1] - minY[j] < 0.02 && b[1] - minY[j] < 0.02 && n[1] - minY[j] < 0.02) slips.push({ k: i, mag: rows[i].mag, s: Math.hypot(b[0] - a[0], b[2] - a[2]) });
}
const byMag = {};
for (const s of slips) (byMag[s.mag] ||= []).push(s.s);
const stats = Object.fromEntries(Object.entries(byMag).map(([m, a]) => [m, { n: a.length, median_cm: +(a.sort((x, y) => x - y)[a.length >> 1] * 100).toFixed(2), max_cm: +(Math.max(...a) * 100).toFixed(2) }]));
writeFileSync(join(OUT, 'mesures.json'), JSON.stringify({ base: BASE, frames: k, slip: stats, errors, rows: rows.map((r) => ({ k: r.k, mag: r.mag, x: +r.x.toFixed(3), feet: r.feet.map((f) => f.map((v) => +v.toFixed(3))) })) }));
console.log('images', k, 'glissement du pied posé (cm/image) par intensité', JSON.stringify(stats), 'erreurs', errors.slice(0, 3));
await browser.close();
