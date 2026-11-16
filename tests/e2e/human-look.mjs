// Aspect des humains : mêmes cadrages d'une version à l'autre (rendu logiciel SwiftShader de Chromium, pas un iPhone).
// Vues fixes du personnage du joueur à pied (visage, face, profil, dos, trois-quarts) et en selle (profil, trois-quarts,
// buste), caméra du jeu à pied et à cheval, groupe de PNJ ; mesures de rendu (appels, triangles, géométries).
// Usage : BASE=http://127.0.0.1:5176 node tests/e2e/human-look.mjs <dossier> [f|m]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/human-look';
const AVATAR = process.argv[3] || 'f';
const BASE = process.env.BASE || 'http://127.0.0.1:5176';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const info = await E(async (AVATAR) => {
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
  const K = (window.__K = {});
  K.step = (n) => { for (let i = 0; i < n; i++) { g.update(1 / 30); g.realism?.update(); } };
  // Caméra posée dans le repère d'un objet (cap h, position p) : [côté (+ gauche), hauteur, avant] → visée.
  K.cam = (p, heading, eye, tgt, fov) => {
    const c = Math.cos(heading), s = Math.sin(heading);
    const W = (q) => [p.x + c * q[0] + s * q[2], p.y + q[1], p.z - s * q[0] + c * q[2]];
    g.camera.position.set(...W(eye)); g.camera.fov = fov; g.camera.updateProjectionMatrix();
    g.camera.lookAt(...W(tgt)); g.camera.updateMatrixWorld();
    g.sky.follow(g.camera);
    g.world.update(1 / 30, g.camera, g.sky, g.player.focus.pos);
    g.renderer.info.reset?.();
    g.renderer.render(g.scene, g.camera);
    return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  };
  K.game = () => { g.camera.updateMatrixWorld(); g.renderer.render(g.scene, g.camera); return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; };
  const h = g.mainHorse;
  A.foot();
  h.setPosition(160, g.terrain.waterlineZ(160) + 8, -Math.PI / 2);
  h.inBox = false; h.ai = null;
  const hu = g.player.human;
  hu.setPosition(h.pos.x + 4, h.pos.z + 3, 0.6);
  K.step(30);
  const H = hu.model;
  return { sex: hu.sex, scale: hu.scale, tris: [0, 1, 2].map((i) => H.triangles(i)), geomBytes: (() => { const gg = hu.mesh.geometry; let b = 0; for (const k in gg.attributes) b += gg.attributes[k].array.byteLength; return b + (gg.index?.array.byteLength || 0); })() };
}, AVATAR);
console.log('personnage', JSON.stringify(info));
const metrics = {};
const shot = async (name, fn, arg) => {
  metrics[name] = await E(fn, arg);
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 90, timeout: 240000 });
};
// À pied, debout (pose de repos), vues fixes autour du personnage (cap 0,6 rad).
const V = { visage: [[0, 1.6, 0.75], [0, 1.58, 0], 30], face: [[0, 1.15, 3.2], [0, 0.95, 0], 34], profil: [[3.2, 1.15, 0], [0, 0.95, 0], 34], dos: [[0, 1.15, -3.2], [0, 0.95, 0], 34], troisquarts: [[2.2, 1.4, 2.4], [0, 0.95, 0], 34], mains: [[0.5, 1.0, 0.8], [0.15, 0.85, 0], 32] };
for (const [k, v] of Object.entries(V)) await shot(`pied-${k}`, ([v]) => { const g = window.__game, hu = g.player.human; window.__K.step(1); return window.__K.cam(hu.pos, hu.heading, ...v); }, [v]);
// Marche : caméra du jeu derrière le personnage.
await shot('pied-jeu', () => { const g = window.__game, A = window.__auto, hu = g.player.human; for (let i = 0; i < 60; i++) { A.steer(Math.sin(hu.heading), Math.cos(hu.heading), 0.4); window.__K.step(1); } return window.__K.game(); });
await E(() => { window.__game.input.setVirtualMove(0, 0); window.__K.step(20); });
// En selle : montée, puis vues fixes autour du cheval à l'arrêt et caméra du jeu au pas.
await E(() => {
  const g = window.__game, h = g.mainHorse, hu = g.player.human;
  const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
  hu.setPosition(h.pos.x + lx * 1.4, h.pos.z + lz * 1.4, h.heading + Math.PI);
  window.__K.step(5);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  window.__K.step(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
  for (let i = 0; i < 200 && g.player.horseMount.active; i++) window.__K.step(1);
  window.__K.step(30);
});
const R = { mains: [[0.45, 2.25, 1.15], [0, 2.02, 0.42], 24], mainsCote: [[0.9, 2.15, 0.55], [0, 2.02, 0.42], 26], profil: [[3.0, 2.0, 0.1], [0, 1.95, 0.1], 36], troisquarts: [[2.2, 2.4, 2.4], [0, 1.95, 0.2], 36], buste: [[1.1, 2.45, 1.1], [0, 2.3, 0.05], 32], dos: [[0.6, 2.4, -2.6], [0, 2.0, 0], 36] };
for (const [k, v] of Object.entries(R)) await shot(`selle-${k}`, ([v]) => { const g = window.__game, h = g.mainHorse; window.__K.step(1); return window.__K.cam(h.pos, h.heading, ...v); }, [v]);
await shot('selle-jeu', () => { const g = window.__game, A = window.__auto, h = g.mainHorse; for (let i = 0; i < 70; i++) { const tx = h.pos.x - 12; A.steer(tx - h.pos.x, g.terrain.waterlineZ(tx) + 8 - h.pos.z, 0.3); window.__K.step(1); } return window.__K.game(); });
// PNJ : les plus proches du personnage dans le monde (vue trois-quarts du premier groupe trouvé).
await shot('pnj', () => {
  const g = window.__game;
  const npcs = g.humans.filter((p) => !p.mounted && p.mesh.visible !== false);
  const p = npcs.sort((a, b) => a.pos.distanceTo(g.player.focus.pos) - b.pos.distanceTo(g.player.focus.pos))[0];
  if (!p) return null;
  p.pose = 'stand';
  // Niveau de détail choisi pour la distance réelle de la caméra de la vue (comme le jeu le ferait à cette distance).
  p._lod(3);
  return { ...window.__K.cam(p.pos, p.heading, [1.6, 1.5, 2.6], [0, 1.0, 0], 34), outfit: p.model.desc.body, n: npcs.length };
});
// Galerie : quatre PNJ côte à côte devant la caméra (tenues tirées au hasard, graine fixe), affichés avec le modèle du
// réglage courant ; plans d'ensemble et visages.
await E(async () => {
  const g = window.__game, hu = g.player.human;
  const { randomOutfit } = await import('/src/entities/humanModel.js');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const c = Math.cos(hu.heading), s2 = Math.sin(hu.heading);
  window.__gal = [];
  for (let i = 0; i < 4; i++) {
    const o = randomOutfit(rnd);
    const lat = (i - 1.5) * 0.9;
    const p = g.spawnHuman(o, hu.pos.x + c * lat + s2 * 6, hu.pos.z - s2 * lat + c * 6, hu.heading + Math.PI, { name: ['Inès', 'Paul', 'Chloé', 'Marc'][i] });
    p.pose = 'stand';
    window.__gal.push(p);
  }
  for (let i = 0; i < 90; i++) { window.__K.step(1); await new Promise((r) => setTimeout(r, 30)); }
});
for (let i = 0; i < 4; i++) {
  await shot(`galerie-visage-${i}`, (i) => { const p = window.__gal[i]; window.__K.step(1); return window.__K.cam(p.pos, p.heading, [0, 1.6, 0.8], [0, 1.57, 0], 26); }, i);
}
await shot('galerie', () => { const g = window.__game, hu = g.player.human; window.__K.step(1); return window.__K.cam(hu.pos, hu.heading, [0, 1.3, 1.5], [0, 1.1, 6], 50); });
writeFileSync(join(OUT, 'mesures.json'), JSON.stringify({ base: BASE, info, metrics, errors }, null, 1));
console.log(JSON.stringify(metrics));
console.log('erreurs', errors.slice(0, 3));
await browser.close();
