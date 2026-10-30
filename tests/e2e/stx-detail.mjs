// Camion STX détaillé (src/assets/vehicles/STX_Scania_DETAILLE.glb) dans le jeu : modèle réellement chargé (et pas le
// camion de secours), un seul camion, roues au sol, roulement et braquage pendant la conduite, départ refusé rampe
// ouverte, rampe ouverte jusqu'au sol, captures (trois quarts avant, profil, arrière, rampe ouverte, nuit, braquage).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/stx-detail.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/stx';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
const glb = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => /\.glb/.test(r.url()) && glb.push({ url: r.url().replace(base, ''), status: r.status(), bytes: Number(r.headers()['content-length'] || 0) }));
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
await page.goto(`${base}/?autostart`);
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const E = (f, a) => page.evaluate(f, a);
const shot = async (name, [lx, lz, h, yaw], hour = 11) => {
  await E(([lx, lz, h, yaw, hour]) => {
    const A = window.__auto, g = window.__game, t = g.truck;
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + hour * 3600;
    if (g.player.mode !== 'foot') A.foot();
    // Captures sans notification ni toast par-dessus le camion.
    g.missions.timer = 1e6;
    g.hud.notifQueue.length = 0;
    g.hud.notifEl?.classList.add('hidden');
    for (const el of document.querySelectorAll('.toast')) el.remove();
    const p = t.groundPoint(lx, lz);
    g.player.human.setPosition(p.x, p.z, t.heading + h);
    g.cam.snap(g.player.human.pos, t.heading + h);
    if (yaw !== undefined) g.cam.yaw = t.heading + yaw;
    A.tick(25);
    if (yaw !== undefined) g.cam.yaw = t.heading + yaw;
    A.tick(1);
    g.renderer.render(g.scene, g.camera);
  }, [lx, lz, h, yaw, hour]);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

const info = await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards(); A.foot();
  const t = g.truck, M = t.model;
  // Un seul camion dans la scène : un seul groupe de modèle STX, aucun reste du porteur procédural.
  let stx = 0, procedural = 0, boxes = 0;
  g.scene.traverse((o) => {
    if (o.name === 'STX_Scania_DETAILLE') stx++;
    if (o.isMesh && o.material?.name === 'truckBody') procedural++;
  });
  // Pneus au sol : bas des pneus (monde) comparé au terrain sous chaque roue.
  t.group.updateMatrixWorld(true);
  const wheelGap = [];
  const tyres = [];
  t.group.traverse((o) => { if (o.isMesh && /^wheel_[123]_[LR]__Tyre$/.test(o.name)) tyres.push(o); });
  for (const o of tyres) {
    o.geometry.computeBoundingBox();
    const c = o.geometry.boundingBox.getCenter(o.position.clone()).applyMatrix4(o.matrixWorld);
    const r = (o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y) / 2;
    wheelGap.push(+(c.y - r - g.terrain.getHeight(c.x, c.z)).toFixed(3));
  }
  const mats = new Set();
  let tex = 0;
  // Doublure intérieure ajoutée avec la portière cabine (boarding / doorCut.js) : pas un matériau du fichier.
  M.model.traverse((o) => { if (o.isMesh && o.material.name !== 'Cab_lining') { mats.add(o.material.name); if (o.material.map) tex++; } });
  return { info: g.truckModelInfo, stx, procedural, wheelGap, mats: mats.size, texMeshes: tex, L: t.L };
});
check('modèle détaillé chargé (pas de camion de secours)', info.info.loaded && !info.info.error, info.info.file);
check('fichier servi : STX_Scania_DETAILLE.glb, 4 350 624 octets', glb.some((r) => /STX_Scania_DETAILLE/.test(r.url) && r.status === 200 && (!r.bytes || r.bytes === 4350624)), JSON.stringify(glb));
check('un seul camion (aucune carrosserie procédurale restante)', info.stx === 1 && info.procedural === 0, `STX ${info.stx}, procédural ${info.procedural}`);
check('matériaux du fichier conservés (25, dont textures)', info.mats === 25 && info.texMeshes >= 6, `${info.mats} matériaux, ${info.texMeshes} maillages texturés`);
check('six pneus posés au sol (±4 cm)', info.wheelGap.length === 6 && info.wheelGap.every((d) => Math.abs(d) < 0.04), JSON.stringify(info.wheelGap));

await shot('1-trois-quarts-avant', [-4.2, 9.0, 2.55]);
await shot('2-profil', [-9.5, 0.3, 1.5708]);
await shot('3-arriere', [-2.2, -11.0, 0.2]);
// Rampe ouverte jusqu'au sol, surface praticable.
const ramp = await E(() => {
  const A = window.__auto, g = window.__game, t = g.truck;
  t.setRampInstant(true);
  A.tick(5);
  const tip = t.rampPoint(1, 0);
  const mid = t.rampPoint(0.5, 0);
  return { tipGap: +(tip.y - g.terrain.getHeight(tip.x, tip.z)).toFixed(2), walk: +(t.walkHeightAt(mid.x, mid.z) - mid.y).toFixed(3), angle: +t.model.ramp.rotation.x.toFixed(2) };
});
check('rampe ouverte : bout au sol, surface praticable alignée sur la rampe visible', Math.abs(ramp.tipGap) < 0.12 && Math.abs(ramp.walk) < 0.06, JSON.stringify(ramp));
await shot('4-rampe-ouverte', [-3.4, -11.6, 0.38]);
// Départ refusé rampe ouverte.
const blocked = await E(() => {
  const A = window.__auto, g = window.__game, t = g.truck;
  A.drive();
  const p0 = { x: t.pos.x, z: t.pos.z };
  for (let i = 0; i < 90; i++) { g.input.setVirtualMove(0, 1); A.tick(1); }
  A.releaseInput();
  const moved = Math.hypot(t.pos.x - p0.x, t.pos.z - p0.z);
  A.foot();
  t.setRampInstant(false);
  A.tick(3);
  return moved;
});
check('rampe ouverte : le camion ne part pas', blocked < 0.05, `${blocked.toFixed(2)} m`);
// Conduite : roulement des roues selon le déplacement, braquage des roues avant sans déplacer leur centre.
const drive = await E(() => {
  const A = window.__auto, g = window.__game, t = g.truck, W = t.model.wheels;
  A.drive();
  const p0 = { x: t.pos.x, z: t.pos.z };
  const c0 = W.front[0].steer.position.clone();
  const r0 = W.rears[0].rotation.x;
  for (let i = 0; i < 120; i++) { g.input.setVirtualMove(0, 0.7); A.tick(1); }
  const dist = Math.hypot(t.pos.x - p0.x, t.pos.z - p0.z);
  const spin = W.rears[0].rotation.x - r0;
  for (let i = 0; i < 30; i++) { g.input.setVirtualMove(0.9, 0.3); A.tick(1); }
  const steer = W.front.map((f) => +f.steer.rotation.y.toFixed(2));
  const c1 = W.front[0].steer.position;
  const speed = t.speed;
  return { dist: +dist.toFixed(1), spin: +spin.toFixed(2), expected: +(-dist / 0.535).toFixed(2), steer, centre: +c0.distanceTo(c1).toFixed(4), speed: +speed.toFixed(1) };
});
check('le camion roule', drive.dist > 3, `${drive.dist} m`);
check('roues : rotation = distance / rayon (0,535 m)', Math.abs(drive.spin - drive.expected) < Math.abs(drive.expected) * 0.15 + 0.3, `${drive.spin} rad (attendu ≈ ${drive.expected})`);
check('braquage des roues avant, centre de roue fixe', Math.abs(drive.steer[0]) > 0.05 && Math.abs(drive.steer[1]) > 0.05 && drive.centre < 1e-6, `braquage ${drive.steer.join(' / ')} rad, centre ${drive.centre} m`);
await E(() => { const g = window.__game; g.renderer.render(g.scene, g.camera); });
await page.screenshot({ path: `${OUT}/5-conduite.png` });
await E(() => { const A = window.__auto, g = window.__game, t = g.truck; A.releaseInput(); t.speed = 0; A.tick(10); });
await shot('6-braquage', [3.6, 8.6, -2.6]);
await E(() => { const A = window.__auto, g = window.__game, t = g.truck; t.startEngine(); A.tick(2); });
await shot('7-nuit', [-4.6, 10.5, 2.6], 22.5);
check('aucune erreur console', !errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `ÉCHECS : ${fails}` : 'STX DÉTAILLÉ OK');
process.exit(fails ? 1 : 0);
