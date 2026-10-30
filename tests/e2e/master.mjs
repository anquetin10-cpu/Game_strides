// Van porte-chevaux STX Renault Master (iPhone 13 émulé, rendu logiciel) :
// 1. modèle fourni chargé tel quel (nœuds, animations, matériaux d'origine), garé à l'Écurie du Val, distinct du camion ;
// 2. captures dans le jeu : avant, profil, arrière, pont latéral ouvert ;
// 3. conduite : roues qui tournent, braquage sur les pivots du fichier ; départ bloqué pont ou porte arrière ouvert ;
// 4. chargement par le pont latéral (cheval mené, séquence, stalle), trajet cheval à bord, déchargement ;
// 5. collisions (piéton, cheval mené) ; sauvegarde et reprise (position, pont, cheval à bord) ; camion Strides intact.
// Captures dans tests/e2e/out/master/. Usage : BASE=http://127.0.0.1:5173 node tests/e2e/master.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/master';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const E = (f, a) => page.evaluate(f, a);
const boot = async () => {
  await page.goto(`${base}/?autostart`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  await E(() => {
    const A = window.__auto, g = window.__game;
    A.stopLoop();
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    A.closeCards();
    g.missions.timer = 1e6;
    // Plein jour, beau temps (captures lisibles).
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
    if (g.weather) g.weather.force?.('clear');
  });
};
// Capture d'un point de vue (repère du van : x à gauche, z vers l'avant).
const shot = async (name, cam, look) => {
  await E(([c, l]) => {
    const g = window.__game, v = g.van;
    g.hud.notifQueue.length = 0;
    g.hud.notifEl?.classList.add('hidden');
    const pos = v.localToWorld(c[0], c[1], c[2]), at = v.localToWorld(l[0], l[1], l[2]);
    g.cam.override = { pos, look: at };
    g.camera.position.copy(pos);
    g.camera.lookAt(at);
    window.__auto.tick(2);
    g.renderer.render(g.scene, g.camera);
  }, [cam, look]);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
await boot();

// ---------- 1. Modèle ----------
let r = await E(() => {
  const g = window.__game, v = g.van;
  if (!v) return { loaded: false, info: g.vanModelInfo };
  const names = [];
  v.M.model.traverse((o) => names.push(o.name));
  const mats = new Set();
  v.M.model.traverse((o) => o.isMesh && mats.add(o.material.name));
  for (const w of [...v.M.wheels.front.map((f) => f.steer), ...v.M.wheels.rears]) w.traverse((o) => o.isMesh && mats.add(o.material.name));
  return {
    loaded: g.vanModelInfo.loaded, file: g.vanModelInfo.file,
    distinct: v !== g.truck && g.drivables.includes(v) && g.truck.model.stx === true,
    nodes: ['side_ramp', 'upper_flap_front', 'upper_flap_rear', 'rear_door', 'stall_partition', 'interior_horses'].every((n) => names.includes(n)),
    wheels: v.M.wheels.front.length === 2 && v.M.wheels.rears.length === 2 && v.M.wheels.front.every((f) => /^steer_/.test(f.steer.name) && /^wheel_front_/.test(f.spin.name)),
    mats: [...mats].sort(), tris: Math.round(v.M.triangles()),
    home: { x: Math.round(v.pos.x), z: Math.round(v.pos.z) },
    gap: Math.hypot(v.pos.x - g.truck.pos.x, v.pos.z - g.truck.pos.z),
  };
});
check('modèle fourni chargé (src/assets/vehicles/STX_Renault_Master_STALLE5.glb)', r.loaded, JSON.stringify(r.info || r.file));
check('véhicule distinct du camion Strides (Scania STX conservé)', r.distinct);
check('pièces mobiles du fichier présentes (pont latéral, volets, porte arrière, stalles)', r.nodes);
check('quatre roues du fichier, roues avant sur leurs pivots de braquage', r.wheels);
check('matériaux d’origine du fichier (non remplacés)', r.mats.includes('Body_Paint') && r.mats.includes('Tyre') && r.mats.includes('Glass') && r.mats.includes('STX_side_1'), r.mats.join(', '));
console.log(`  triangles : ${r.tris} · garé à (${r.home.x}, ${r.home.z}), ${r.gap.toFixed(1)} m du camion`);

// ---------- 2. Captures ----------
await shot('1-avant', [-3.2, 1.8, 8.5], [0, 1.2, 0]);
await shot('2-profil', [-9.5, 1.7, 0.2], [0, 1.3, 0.2]);
await shot('3-arriere', [2.6, 1.9, -8.6], [0, 1.3, 0]);
r = await E(() => {
  const g = window.__game, v = g.van;
  g.cam.override = null;
  const ok = v.setSide(true) && v.setRear(true);
  window.__auto.tick(75);
  return { ok, side: v.sideOpen, rear: v.rearOpen, rampQ: v.M.parts.ramp.node.quaternion.toArray().map((x) => +x.toFixed(3)), target: v.M.parts.ramp.open.toArray().map((x) => +x.toFixed(3)) };
});
check('pont latéral, volets et porte arrière s’ouvrent (amplitudes des animations du fichier)', r.ok && r.side && r.rear && r.rampQ.every((x, i) => Math.abs(x - r.target[i]) < 0.01), JSON.stringify(r));
await shot('4-pont-ouvert', [-7.5, 2.4, 3.6], [-0.6, 1.0, -0.6]);
await shot('5-porte-arriere-ouverte', [-2.8, 2.2, -8.2], [0, 1.2, -2.6]);

// ---------- 3. Conduite ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.van, p = g.player;
  A.foot();
  p.enterVehicle(v);
  const x0 = v.pos.x, z0 = v.pos.z;
  for (let i = 0; i < 90; i++) {
    g.input.setVirtualMove(0, 0.8);
    A.tick(1);
  }
  A.releaseInput();
  const blockedMove = Math.hypot(v.pos.x - x0, v.pos.z - z0);
  const hint = document.querySelector('.hint')?.textContent || '';
  p.exitVehicle();
  v.setSide(false);
  v.setRear(false);
  A.tick(75);
  const closed = v.closed;
  p.enterVehicle(v);
  const spin0 = v.M.wheels.rears[0].rotation.x;
  for (let i = 0; i < 150; i++) {
    g.input.setVirtualMove(i > 60 ? -0.6 : 0, 0.75);
    A.tick(1);
  }
  const steerY = v.M.wheels.front.map((f) => +f.steer.rotation.y.toFixed(3));
  const spin = Math.abs(v.M.wheels.rears[0].rotation.x - spin0);
  for (let i = 0; i < 120 && Math.abs(v.speed) > 0.05; i++) {
    g.input.setVirtualMove(0, -0.5);
    A.tick(1);
  }
  A.releaseInput();
  A.tick(10);
  const moved = Math.hypot(v.pos.x - x0, v.pos.z - z0);
  return { blockedMove, hint, closed, moved, spin, steerY, kmh: 0, mode: p.mode };
});
check('départ bloqué pont latéral et porte arrière ouverts (message affiché)', r.blockedMove < 0.2 && /Pont latéral|porte arrière/.test(r.hint), `${r.blockedMove.toFixed(2)} m · « ${r.hint.slice(0, 80)} »`);
check('conduite une fois tout fermé : le van roule', r.closed && r.moved > 8, `${r.moved.toFixed(1)} m`);
check('roues : roulement et braquage sur les pivots steer_L / steer_R', r.spin > 3 && r.steerY.every((a) => Math.abs(a) > 0.05), JSON.stringify({ spin: +r.spin.toFixed(1), steer: r.steerY }));
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.van, p = g.player;
  p.exitVehicle();
  // Porte arrière seule ouverte : bloqué aussi.
  v.setRear(true);
  A.tick(75);
  p.enterVehicle(v);
  const x0 = v.pos.x, z0 = v.pos.z;
  for (let i = 0; i < 60; i++) {
    g.input.setVirtualMove(0, 0.8);
    A.tick(1);
  }
  A.releaseInput();
  const d = Math.hypot(v.pos.x - x0, v.pos.z - z0);
  p.exitVehicle();
  v.setRear(false);
  A.tick(75);
  return { d, closed: v.closed };
});
check('départ bloqué porte arrière seule ouverte', r.d < 0.2 && r.closed, `${r.d.toFixed(2)} m`);

// ---------- 4. Chargement par le pont latéral ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.van, p = g.player, L = g.vanLoading, h = g.mainHorse;
  A.foot();
  // Joueur au pied du pont ; ouverture par le bouton ACTION.
  const sp = v.sidePoint({ x: 0, y: 0, z: 0 }, 0.2);
  p.human.setPosition(sp.x, sp.z, v.heading + Math.PI / 2);
  A.tick(2);
  const lab1 = g.interact.update()?.label;
  g.interact.trigger();
  A.tick(75);
  // Cheval mené en main au pied du pont.
  const foot = v.sidePoint({ x: 0, y: 0, z: 0 }, 2.4);
  h.setPosition(foot.x, foot.z, v.heading + Math.PI / 2);
  p.human.setPosition(foot.x + Math.sin(v.heading) * 1.2, foot.z + Math.cos(v.heading) * 1.2, v.heading + Math.PI / 2);
  p.transport.lead(h);
  A.tick(4);
  const lab2 = g.interact.update()?.label;
  g.interact.trigger();
  const started = L.busy;
  let n = 0, maxY = -1e9;
  const y0 = v.localToWorld(0, 0, 0).y;
  while (L.busy && n++ < 30 * 20) {
    A.tick(1);
    maxY = Math.max(maxY, h.pos.y - y0);
  }
  const l = v.toLocal(h.pos.x, h.pos.z);
  // Hauteur au-dessus du plancher de la stalle (van garé sur un terrain en pente : plancher incliné avec la caisse).
  const fl = v.localToWorld(l.x, 0.63, l.z).y;
  return { lab1, lab2, started, aboard: L.isAboard(h), hidden: h.hiddenInTruck, local: { x: +l.x.toFixed(2), z: +l.z.toFixed(2) }, aboveFloor: +(h.pos.y - fl).toFixed(3), pitch: +(v.slope * 57.3).toFixed(1), secs: n / 30, maxY: +maxY.toFixed(2) };
});
check('ACTION au pied du pont : « Ouvrir le pont latéral »', r.lab1 === 'Ouvrir le pont latéral', r.lab1);
check('cheval mené au pied du pont : « Faire monter … »', /^Faire monter/.test(r.lab2 || '') && r.started, r.lab2);
check('séquence : le cheval monte le pont et se range dans sa stalle', r.aboard && r.hidden && Math.abs(Math.abs(r.local.x) - 0.55) < 0.1 && Math.abs(r.local.z + 1.1) < 0.15 && Math.abs(r.aboveFloor) < 0.03, JSON.stringify(r));
await shot('6-cheval-charge', [-6.5, 2.3, 2.5], [-0.4, 1.2, -0.8]);
// Cheval dans sa stalle (côté gauche, derrière la cloison) : vu de l'arrière, porte ouverte.
await E(() => {
  const g = window.__game;
  g.cam.override = null;
  g.van.setRear(true);
  window.__auto.tick(75);
});
await shot('7-cheval-dans-sa-stalle', [-1.5, 2.5, -5.6], [0.5, 1.5, -1.8]);
await E(() => {
  const g = window.__game;
  g.cam.override = null;
  g.van.setRear(false);
  window.__auto.tick(75);
});
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.van, p = g.player, h = g.mainHorse;
  const sp = v.sidePoint({ x: 0, y: 0, z: 0 }, 0.2);
  p.human.setPosition(sp.x, sp.z, v.heading + Math.PI / 2);
  A.tick(2);
  const lab = g.interact.update()?.label;
  // Fermer : le pont latéral (le déchargement passe avant : on choisit l'action de fermeture).
  g.vanLoading.toggleSide();
  A.tick(75);
  p.enterVehicle(v);
  for (let i = 0; i < 120; i++) {
    g.input.setVirtualMove(0.25, 0.7);
    A.tick(1);
  }
  for (let i = 0; i < 120 && Math.abs(v.speed) > 0.05; i++) {
    g.input.setVirtualMove(0, -0.5);
    A.tick(1);
  }
  A.releaseInput();
  A.tick(5);
  const l = v.toLocal(h.pos.x, h.pos.z);
  p.exitVehicle();
  return { lab, mass: v.sim.horses, local: { x: +l.x.toFixed(2), z: +l.z.toFixed(2) }, moved: true };
});
check('à pied près du pont ouvert, cheval à bord : « Faire descendre … » proposé', /^Faire descendre/.test(r.lab || ''), r.lab);
check('trajet : le cheval reste dans sa stalle (suit le van), masse prise en compte', r.mass === 1 && Math.abs(Math.abs(r.local.x) - 0.55) < 0.1 && Math.abs(r.local.z + 1.1) < 0.15, JSON.stringify(r));
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.van, p = g.player, h = g.mainHorse, L = g.vanLoading;
  const sp = v.sidePoint({ x: 0, y: 0, z: 0 }, 0.2);
  p.human.setPosition(sp.x, sp.z, v.heading + Math.PI / 2);
  A.tick(2);
  g.interact.update();
  g.interact.trigger(); // ouvrir
  A.tick(75);
  p.human.setPosition(sp.x, sp.z, v.heading + Math.PI / 2);
  A.tick(2);
  const lab = g.interact.update()?.label;
  g.interact.trigger(); // faire descendre
  let n = 0;
  while (L.busy && n++ < 30 * 20) A.tick(1);
  const l = v.toLocal(h.pos.x, h.pos.z);
  return { lab, aboard: L.isAboard(h), hidden: h.hiddenInTruck, led: p.transport.led?.horse === h, local: { x: +l.x.toFixed(2), z: +l.z.toFixed(2) }, onGround: Math.abs(h.pos.y - g.terrain.getHeight(h.pos.x, h.pos.z)) < 0.1 };
});
check('déchargement par le pont : le cheval descend et revient en main', /^Faire descendre/.test(r.lab || '') && !r.aboard && !r.hidden && r.led && r.local.x < -3 && r.onGround, JSON.stringify(r));

// ---------- 5. Collisions, sauvegarde, camion ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.van, p = g.player, h = g.mainHorse;
  // Piéton contre le flanc gauche (fermé) : repoussé hors de la caisse.
  const gp = v.groundPoint(0.4, 0, { x: 0, y: 0, z: 0 });
  const pp = { x: gp.x, z: gp.z };
  g.colliders.resolve(pp, 0.4, v.pos.y + 0.5);
  const lp = v.toLocal(pp.x, pp.z);
  // Cheval mené poussé dans la caisse : contourné.
  const hp = v.groundPoint(-0.3, 1.5, { x: 0, y: 0, z: 0 });
  h.setPosition(hp.x, hp.z, v.heading);
  A.tick(2);
  const lh = v.toLocal(h.pos.x, h.pos.z);
  // Pont baissé : obstacle pour le piéton (contourné), retiré une fois relevé.
  v.setSide(true);
  A.tick(75);
  const rp = v.groundPoint(-2.15, -0.54, { x: 0, y: 0, z: 0 });
  const onRamp = { x: rp.x, z: rp.z };
  g.colliders.resolve(onRamp, 0.4, v.pos.y + 0.1);
  const pushedRamp = Math.hypot(onRamp.x - rp.x, onRamp.z - rp.z) > 0.3;
  v.setSide(false);
  A.tick(75);
  const free = { x: rp.x, z: rp.z };
  g.colliders.resolve(free, 0.4, v.pos.y + 0.1);
  const freeAfter = Math.hypot(free.x - rp.x, free.z - rp.z) < 0.01;
  // Cheval rechargé (pont rouvert), pont refermé : sauvegarde.
  v.setSide(true);
  A.tick(75);
  g.vanLoading.load(h, { fast: true });
  g.vanLoading.toggleSide();
  A.tick(75);
  g.saveNow();
  return { pushedRamp, freeAfter, foot: Math.abs(lp.x) >= v.spec.W / 2 - 0.01, horse: Math.abs(lh.x) >= v.spec.W / 2 || Math.abs(lh.z - v.spec.zc) >= v.spec.L / 2, saved: g.save.data.van, pos: { x: v.pos.x, z: v.pos.z }, truck: { x: g.truck.pos.x, z: g.truck.pos.z } };
});
check('collisions : piéton et cheval mené repoussés hors de la caisse', r.foot && r.horse, JSON.stringify(r).slice(0, 200));
check('collisions : pont baissé contourné par le piéton, passage libre une fois relevé', r.pushedRamp && r.freeAfter);
const saved = r;
await page.goto(`${base}/`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 240000 });
await page.tap('[data-id="continue"]');
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.van, h = g.mainHorse;
  A.stopLoop();
  A.closeCards();
  A.tick(5);
  return { pos: { x: v.pos.x, z: v.pos.z }, aboard: g.vanLoading.isAboard(h), side: v.sideDoor.target, truck: { x: g.truck.pos.x, z: g.truck.pos.z }, scaniaAboard: g.player.transport.isAboard(h) };
});
check('reprise : van à sa place, cheval toujours à bord, pont fermé', Math.hypot(r.pos.x - saved.pos.x, r.pos.z - saved.pos.z) < 0.5 && r.aboard && r.side === 0 && !r.scaniaAboard, JSON.stringify(r));
check('camion Strides inchangé à la reprise', Math.hypot(r.truck.x - saved.truck.x, r.truck.z - saved.truck.z) < 0.5, JSON.stringify(r.truck));
r = await E(() => {
  const g = window.__game, A = window.__auto, t = g.truck, tp = g.player.transport, h = g.mainHorse;
  g.vanLoading.unloadInstant(h);
  A.foot();
  t.setRampInstant(true);
  const ok = tp.loadInstant(h);
  const aboard = tp.isAboard(h);
  tp.unloadInstant(h);
  t.setRampInstant(false);
  return { ok, aboard };
});
check('chargement du camion Strides toujours fonctionnel', r.ok && r.aboard, JSON.stringify(r));
check('aucune erreur console', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'MASTER OK');
await browser.close();
process.exit(fails ? 1 : 0);
