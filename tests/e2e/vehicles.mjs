// Véhicules conduisibles (iPhone paysage 667×308) : le personnage monte dans chaque type de véhicule par le bouton
// ACTION (« Conduire »), roule, freine, sort ; prend aussi le volant d'une voiture de la circulation arrêtée.
// Les missions du camion exigent toujours le camion Strides. Usage : BASE=… node tests/e2e/vehicles.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 667, height: 308 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
});

// Plus longue ligne droite du réseau routier (essais d'accélération et de freinage).
await page.evaluate(async () => {
  const { ROADS } = await import('/src/world/layout.js');
  let best = null;
  for (const r of ROADS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (!best || L > best.L) best = { L, ax, az, h: Math.atan2(bx - ax, bz - az) };
  }
  window.__straight = best;
});

const drive = (kind) => page.evaluate((kind) => {
  const A = window.__auto, g = window.__game, p = g.player;
  const v = g.drivables.find((d) => d.kind === kind && !d.driver);
  if (!v) return { error: `pas de ${kind}` };
  const start = { x: v.pos.x, z: v.pos.z };
  const door = v.doorPoint(1);
  p.human.setPosition(door.x, door.z, v.heading - Math.PI / 2);
  A.tick(2);
  g.interact.update();
  const offered = g.interact.current?.id;
  g.interact.trigger();
  A.tick(2);
  const inside = p.mode === 'drive' && p.vehicle === v && v.engineOn;
  const hudGear = document.querySelector('.telemetry')?.textContent || '';
  // Marche arrière pour sortir de la place, puis en avant : accélérations, vitesse, rapports.
  for (let i = 0; i < 60; i++) { g.input.setVirtualMove(0, -0.8); A.tick(1); }
  const rev = { gear: v.gearLabel, speed: v.speed };
  for (let i = 0; i < 40; i++) { g.input.setVirtualMove(0, 0.6); A.tick(1); }
  const moved = Math.hypot(v.pos.x - start.x, v.pos.z - start.z);
  // Essai sur la ligne droite, voie de droite.
  const S = window.__straight;
  v.setPosition(S.ax + Math.sin(S.h) * 8 - Math.cos(S.h) * 2, S.az + Math.cos(S.h) * 8 + Math.sin(S.h) * 2, S.h);
  g.cam.yaw = S.h + Math.PI;
  let vmax = 0, maxGear = 0;
  for (let i = 0; i < 150; i++) {
    g.input.setVirtualMove(0, 1);
    A.tick(1);
    vmax = Math.max(vmax, v.speed);
    maxGear = Math.max(maxGear, v.sim.gear);
  }
  // Freinage jusqu'à l'arrêt.
  let t = 0;
  while (Math.abs(v.speed) > 0.05 && t < 300) { g.input.setVirtualMove(0, -1); A.tick(1); t++; }
  g.input.setVirtualMove(0, 0);
  A.tick(10);
  const wheelsTurn = Math.abs(v.spin) > 1;
  g.interact.update();
  const exitOffered = g.interact.current?.id;
  g.interact.trigger();
  A.tick(3);
  const out = p.mode === 'foot' && !v.driver && !v.engineOn;
  const humanNear = Math.hypot(p.human.pos.x - v.pos.x, p.human.pos.z - v.pos.z);
  // Retour à sa place : la ligne droite reste libre pour l'essai suivant.
  if (v.home) { v.setPosition(v.home.x, v.home.z, v.home.heading); v.atSpot = true; }
  return { kind, offered, inside, hudGear, rev, vmax, maxGear, stopTicks: t, moved, wheelsTurn, exitOffered, out, humanNear, label: v.label };
}, kind);

for (const kind of ['duster', 'tractor', 'p508', 'clio', 'golf', 'p3008']) {
  const r = await drive(kind);
  if (r.error) { check(`${kind} : trouvé`, false, r.error); continue; }
  check(`${r.label} : bouton « Conduire » proposé à la portière`, r.offered === 'vehicle-in', r.offered);
  check(`${r.label} : au volant, moteur démarré`, r.inside, r.hudGear.slice(0, 40));
  check(`${r.label} : marche arrière`, r.rev.gear === 'R' && r.rev.speed < -0.3, JSON.stringify(r.rev));
  const vmin = kind === 'tractor' ? 5 : 12;
  check(`${r.label} : accélère et passe les rapports`, r.vmax > vmin && r.maxGear >= (kind === 'tractor' ? 3 : 2), `${(r.vmax * 3.6).toFixed(0)} km/h, rapport ${r.maxGear}`);
  check(`${r.label} : freine jusqu'à l'arrêt`, r.stopTicks < 200, `${(r.stopTicks / 30).toFixed(1)} s`);
  check(`${r.label} : roues qui tournent, sorti de sa place`, r.wheelsTurn && r.moved > 1.5, `${r.moved.toFixed(0)} m`);
  check(`${r.label} : sortie du véhicule`, r.exitOffered === 'truck-out' && r.out && r.humanNear < 4, `${r.humanNear.toFixed(1)} m`);
}

// Voiture de la circulation arrêtée devant le joueur : on prend le volant.
const tk = await page.evaluate(() => {
  const A = window.__auto, g = window.__game, p = g.player;
  const c = g.ambient.cars.find((x) => !x.uturn);
  const n0 = g.ambient.cars.length, d0 = g.drivables.length;
  c.speed = 0;
  c.cruise = 0;
  c.mesh.visible = true;
  const h = c.heading, xl = c.spec.W / 2 + 0.75, zl = -0.3;
  p.human.setPosition(c.pos.x + Math.sin(h) * zl + Math.cos(h) * xl, c.pos.z + Math.cos(h) * zl - Math.sin(h) * xl, h);
  g.interact.update();
  const offered = g.interact.current?.id;
  g.interact.trigger();
  A.tick(2);
  const v = p.vehicle;
  const ok = p.mode === 'drive' && v && v !== g.truck && g.ambient.cars.length === n0 - 1 && g.drivables.length === d0 + 1 && v.kind === c.kind && v.color === c.color;
  for (let i = 0; i < 90; i++) { g.input.setVirtualMove(0, 1); A.tick(1); }
  const speed = v?.speed || 0;
  for (let i = 0; i < 120 && Math.abs(v.speed) > 0.05; i++) { g.input.setVirtualMove(0, -1); A.tick(1); }
  g.input.setVirtualMove(0, 0);
  A.tick(5);
  // Une mission du camion ne se valide pas au volant d'une voiture.
  const inTruck = p.inTruck;
  p.exitVehicle();
  return { offered, ok, speed, inTruck, mode: p.mode };
});
check('voiture de la circulation : bouton « Conduire »', tk.offered === 'vehicle-in', tk.offered);
check('voiture de la circulation : reprise au volant (même modèle, même couleur)', tk.ok);
check('voiture de la circulation : roule', tk.speed > 8, `${(tk.speed * 3.6).toFixed(0)} km/h`);
check('au volant d’une voiture, on n’est pas « dans le camion »', tk.inTruck === false && tk.mode === 'foot');

// Le camion Strides reste conduisible.
const tr = await page.evaluate(() => {
  const A = window.__auto, g = window.__game, p = g.player, t = g.truck;
  const door = t.doorPoint(1);
  p.human.setPosition(door.x, door.z, t.heading);
  A.tick(2);
  g.interact.update();
  const offered = g.interact.current?.id;
  g.interact.trigger();
  A.tick(2);
  const ok = p.inTruck;
  for (let i = 0; i < 60; i++) { g.input.setVirtualMove(0, 1); A.tick(1); }
  const speed = t.speed;
  for (let i = 0; i < 150 && Math.abs(t.speed) > 0.05; i++) { g.input.setVirtualMove(0, -1); A.tick(1); }
  g.input.setVirtualMove(0, 0);
  A.tick(5);
  p.exitTruck();
  return { offered, ok, speed };
});
check('camion Strides : toujours conduisible', tr.offered === 'truck-in' && tr.ok && tr.speed > 2, `${(tr.speed * 3.6).toFixed(0)} km/h`);

// Captures : voiture avec conducteur visible, tracteur.
for (const kind of ['p3008', 'tractor']) {
  await page.evaluate((kind) => {
    const A = window.__auto, g = window.__game, p = g.player;
    const v = g.drivables.find((d) => d.kind === kind);
    p.enterVehicle(v);
    for (let i = 0; i < 40; i++) { g.input.setVirtualMove(0.3, 0.7); A.tick(1); }
    g.input.setVirtualMove(0, 0);
    A.tick(3);
    g.cam.yaw = v.heading + Math.PI - 0.7;
    A.tick(2);
    g.renderer.render(g.scene, g.camera);
  }, kind);
  await page.screenshot({ path: `tests/e2e/out/drive-${kind}.png` });
  await page.evaluate(() => window.__game.player.exitVehicle());
}
check('aucune erreur', !errors.length, errors.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? `ÉCHECS : ${fails}` : 'VÉHICULES OK');
process.exit(fails ? 1 : 0);
