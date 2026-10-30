// Defender 110 STRIDES, véhicule personnel du personnage (iPhone 13 émulé, rendu logiciel SwiftShader ; ce n'est pas un
// essai sur un vrai iPhone) :
// 1. modèle fourni chargé tel quel (variante et chemin, nœuds, matériaux, textures, vitres), un seul exemplaire, garé
//    à l'Écurie du Val, distinct du camion Strides et du van Master ; pneus au sol ;
// 2. captures dans le jeu : avant, profil, arrière, accès ouverts, personnage au volant ;
// 3. portes et coffre (amplitudes des clips du fichier), conduite bloquée accès ouverts, coffre fermé en roulant ;
// 4. conduite : roulement lié à la distance (marche arrière comprise), braquage d'Ackermann par pivot, volant ;
// 5. collisions (mur, piéton) ; montée par ACTION à la portière, descente sûre (repli côté passager si bloqué) ;
// 6. caméras à pied / à cheval / au volant ; coffre (objet porté rangé, repris), teinte ;
// 7. sauvegarde et reprise (position, teinte, coffre, portière ouverte), ancienne sauvegarde : ajouté une seule fois.
// Captures dans tests/e2e/out/defender/. Usage : BASE=http://127.0.0.1:5173 [DEFENDER=full|mobile] node tests/e2e/defender.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const variant = process.env.DEFENDER || 'full';
const OUT = `tests/e2e/out/defender/${variant}`;
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
const ready = async () => {
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
    A.tick(3);
  });
};
// Capture d'un point de vue (repère du véhicule : x à gauche, z vers l'avant).
const shot = async (name, cam, look) => {
  await E(([c, l]) => {
    const g = window.__game, v = g.defender;
    g.hud.notifQueue.length = 0;
    g.hud.notifEl?.classList.add('hidden');
    g.hud.clearHint();
    const pos = v.localToWorld(c[0], c[1], c[2]), at = v.localToWorld(l[0], l[1], l[2]);
    g.cam.override = { pos, look: at };
    g.camera.position.copy(pos);
    g.camera.lookAt(at);
    window.__auto.tick(2);
    g.camera.position.copy(pos);
    g.camera.lookAt(at);
    g.renderer.render(g.scene, g.camera);
  }, [cam, look]);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await E(() => (window.__game.cam.override = null));
};

await page.goto(`${base}/?autostart&defender=${variant}`, { timeout: 180000 });
await ready();

// ---------- 1. Modèle ----------
let r = await E(() => {
  const g = window.__game, v = g.defender;
  if (!v) return { loaded: false, info: g.defenderModelInfo };
  const names = new Set(), mats = new Map();
  let maps = 0, instances = 0;
  g.scene.traverse((o) => o.name === 'STRIDES_Defender110' && instances++);
  v.mesh.traverse((o) => {
    names.add(o.name);
    if (o.isMesh && o.material.name) {
      mats.set(o.material.name, o.material);
      if (o.material.map) maps++;
    }
  });
  const glass = [...mats.values()].filter((m) => /Glass/.test(m.name));
  // Pneus au sol : bas des roues (centre − rayon) contre le terrain.
  const ground = v.M.wheels.front.concat(v.M.wheels.rears).map((w) => {
    const p = w.spin.getWorldPosition(w.spin.position.clone());
    return +(p.y - 0.407 - g.terrain.getHeight(p.x, p.z)).toFixed(3);
  });
  return {
    loaded: g.defenderModelInfo.loaded, info: g.defenderModelInfo, kind: v.kind, instances,
    count: g.drivables.filter((d) => d.kind === 'defender110_hero').length,
    distinct: v !== g.truck && v !== g.van && g.truck.model.stx === true && !!g.van,
    nodes: ['door_FL', 'door_FR', 'door_RL', 'door_RR', 'tailgate', 'spare_wheel', 'steering_wheel', 'anchor_driver', 'anchor_exit_driver', 'anchor_passenger', 'anchor_exit_passenger', 'anchor_cockpit', 'interior'].filter((n) => !names.has(n)),
    mats: mats.size, maps, glass: glass.map((m) => `${m.name}:${m.transparent ? 'alpha' : 'opaque'}:${m.opacity}`),
    paint: mats.get('Body_Paint')?.color.getHexString(), roof: mats.get('Roof_Black')?.color.getHexString(),
    ground, home: [Math.round(v.pos.x), Math.round(v.pos.z)],
    clear: Math.min(Math.hypot(v.pos.x - g.truck.pos.x, v.pos.z - g.truck.pos.z), Math.hypot(v.pos.x - g.van.pos.x, v.pos.z - g.van.pos.z)),
  };
});
check(`modèle fourni chargé (${variant})`, r.loaded && r.info.file.endsWith(variant === 'full' ? 'Defender110_STRIDES.glb' : 'Defender110_STRIDES_MOBILE.glb'), JSON.stringify(r.info));
check('un seul Defender (type defender110_hero) dans la scène et parmi les véhicules', r.instances === 1 && r.count === 1 && r.kind === 'defender110_hero', `${r.instances} / ${r.count}`);
check('distinct du camion Strides (Scania) et du van Master, tous deux présents', r.distinct);
check('nœuds du fichier : portes, coffre, roue de secours, volant, repères', r.nodes.length === 0, r.nodes.join(', '));
check('matériaux et textures d’origine (35 matériaux, textures, vitres transparentes)', r.mats === 35 && r.maps > 0 && r.glass.some((s) => /alpha/.test(s)), `${r.mats} matériaux · ${r.maps} maillages texturés · ${r.glass.join(' ')}`);
check('pneus au sol (écart bas de roue / terrain < 3 cm)', r.ground.every((d) => Math.abs(d) < 0.03), JSON.stringify(r.ground));
check('garé à l’Écurie du Val, à l’écart du camion et du van', Math.hypot(r.home[0] + 97, r.home[1] - 181) < 1 && r.clear > 8, `${r.home} · ${r.clear.toFixed(1)} m`);
await shot('1-avant', [0.9, 1.5, 7.2], [0, 0.9, 0]);
await shot('2-profil', [7.4, 1.4, -0.1], [0, 0.95, -0.1]);
await shot('3-arriere', [-1.2, 1.6, -7.6], [0, 0.95, -1]);

// ---------- 2. Portes et coffre ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.defender;
  const out = {};
  for (const a of ['door_FL', 'door_FR', 'door_RL', 'door_RR', 'tailgate']) out[a] = v.setAccess(a, true);
  A.tick(90);
  const reached = {};
  for (const a of Object.keys(out)) {
    const m = v.M.access[a];
    reached[a] = +m.node.quaternion.angleTo(m.open).toFixed(3) + '/' + +m.closed.angleTo(m.open).toFixed(2);
  }
  return { out, reached, open: Object.keys(out).every((a) => v.access[a].t === 1) };
});
check('quatre portes et coffre ouverts jusqu’à la pose finale des clips Open_*', r.open && Object.values(r.reached).every((s) => +s.split('/')[0] < 0.01 && +s.split('/')[1] > 0.5), JSON.stringify(r.reached));
await shot('4-acces-ouverts', [5.6, 2.4, -6.2], [0, 1.0, -0.6]);
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.defender, p = g.player;
  // Conduite bloquée : coffre ouvert (message), portes ouvertes.
  for (const a of ['door_FR', 'door_RL', 'door_RR']) v.setAccess(a, false);
  A.tick(80);
  p.human.setPosition(v.doorPoint(1).x, v.doorPoint(1).z);
  p.enterVehicle(v);
  const x0 = v.pos.x, z0 = v.pos.z;
  for (let i = 0; i < 100; i++) {
    g.input.setVirtualMove(0, 0.8);
    A.tick(1);
  }
  A.releaseInput();
  const blocked = Math.hypot(v.pos.x - x0, v.pos.z - z0);
  const hint = document.querySelector('.hint')?.textContent || '';
  const bootOpen = v.isOpen('tailgate');
  p.exitVehicle();
  A.tick(60);
  v.setAccess('tailgate', false);
  A.tick(80);
  return { blocked, hint, bootOpen, closed: v.closed };
});
check('départ bloqué coffre ouvert (message affiché)', r.blocked < 0.2 && r.bootOpen && /Coffre ouvert|Boot open/.test(r.hint), `${r.blocked.toFixed(2)} m · « ${r.hint.slice(0, 70)} »`);
check('tout refermé ensuite', r.closed);
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.defender, p = g.player;
  // Portière arrière ouverte : fermée d'elle-même à la demande d'accélérer, puis départ.
  v.setAccess('door_RR', true);
  A.tick(70);
  p.enterVehicle(v);
  A.tick(70); // portière conducteur : ouverture et fermeture automatiques à la montée
  const x0 = v.pos.x, z0 = v.pos.z;
  let blockedT = 0;
  for (let i = 0; i < 180; i++) {
    g.input.setVirtualMove(0, 0.8);
    A.tick(1);
    if (!v.closed) blockedT++;
  }
  A.releaseInput();
  const moved = Math.hypot(v.pos.x - x0, v.pos.z - z0);
  // Coffre : refus d'ouverture en roulant.
  const speed = Math.abs(v.speed);
  const bootMoving = v.setAccess('tailgate', true);
  const doorMoving = v.setAccess('door_RL', true);
  for (let i = 0; i < 160 && Math.abs(v.speed) > 0.05; i++) {
    g.input.setVirtualMove(0, -0.6);
    A.tick(1);
  }
  A.releaseInput();
  A.tick(10);
  return { moved, blockedT, speed, bootMoving, doorMoving, closed: v.closed };
});
check('portière ouverte : refermée automatiquement avant le départ, puis le Defender roule', r.moved > 6 && r.blockedT > 10 && r.blockedT < 120, `${r.moved.toFixed(1)} m · ${r.blockedT} images bloquées`);
check('coffre et portières ne s’ouvrent pas en roulant', r.speed > 2 && !r.bootMoving && !r.doorMoving && r.closed, `${(r.speed * 3.6).toFixed(0)} km/h`);

// ---------- 3. Roues, braquage, volant, marche arrière ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.defender;
  // Cour dégagée, cap à l'ouest. Ligne droite : roulement = distance / rayon.
  v.setPosition(-110, 183, -Math.PI / 2);
  const W = v.M.wheels;
  A.tick(2);
  const spin0 = W.rears[0].spin.rotation.x, x0 = v.pos.x, z0 = v.pos.z;
  let dist = 0, px = x0, pz = z0;
  for (let i = 0; i < 90; i++) {
    g.input.setVirtualMove(0, 0.7);
    A.tick(1);
    dist += Math.hypot(v.pos.x - px, v.pos.z - pz);
    px = v.pos.x;
    pz = v.pos.z;
  }
  const fwdSpin = -(W.rears[0].spin.rotation.x - spin0);
  // Virage à gauche : pivots avant braqués séparément (roue intérieure plus braquée), volant tourné.
  for (let i = 0; i < 40; i++) {
    g.input.setVirtualMove(-0.9, 0.5);
    A.tick(1);
  }
  const steer = W.front.map((f) => ({ side: f.side, y: +f.steer.rotation.y.toFixed(3) }));
  const wheelAng = v.sim.steer;
  const sw = v.M.steeringWheel.quaternion.angleTo(v.M.steeringWheel.userData.q0 || v.M.steeringWheel.quaternion);
  // Arrêt puis marche arrière : roulement inversé.
  for (let i = 0; i < 160 && Math.abs(v.speed) > 0.05; i++) {
    g.input.setVirtualMove(0, -0.6);
    A.tick(1);
  }
  const s1 = W.rears[0].spin.rotation.x;
  let back = 0;
  for (let i = 0; i < 120; i++) {
    g.input.setVirtualMove(0, -0.7);
    A.tick(1);
    back = Math.min(back, v.speed);
  }
  const revSpin = -(W.rears[0].spin.rotation.x - s1);
  A.releaseInput();
  for (let i = 0; i < 120 && Math.abs(v.speed) > 0.05; i++) {
    g.input.setVirtualMove(0, 0.5);
    A.tick(1);
  }
  A.releaseInput();
  A.tick(5);
  return { dist, fwdSpin, ratio: fwdSpin / (dist / 0.407), steer, wheelAng, sw, back, revSpin };
});
check('roulement relié à la distance parcourue (rayon 0,407 m)', r.dist > 3 && Math.abs(r.ratio - 1) < 0.15, `${r.dist.toFixed(1)} m · ${r.fwdSpin.toFixed(1)} rad · rapport ${r.ratio.toFixed(2)}`);
const inner = r.steer.find((s) => s.side > 0), outer = r.steer.find((s) => s.side < 0);
check('braquage d’Ackermann sur steer_FL / steer_FR (roue intérieure plus braquée)', inner.y > outer.y && outer.y > 0.03 && r.wheelAng > 0.03, JSON.stringify(r.steer));
check('marche arrière : le véhicule recule, roues en sens inverse', r.back < -0.5 && r.revSpin < -0.5, `${(r.back * 3.6).toFixed(1)} km/h · ${r.revSpin.toFixed(1)} rad`);

// ---------- 4. Personnage au volant, caméra de conduite ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.defender, p = g.player;
  A.tick(20);
  const seat = v.toLocal(p.human.pos.x, p.human.pos.z);
  const f = p.focus;
  return { mode: p.mode, driver: v.driver === p, pose: p.human.pose, seat: [+seat.x.toFixed(2), +seat.z.toFixed(2)], camDist: f.camDist, camHeight: f.camHeight, collider: v.collider.enabled };
});
check('personnage assis au volant (repère anchor_driver, pose de conduite pilotée), caméra 4x4', r.mode === 'drive' && r.driver && r.pose === 'board' && Math.abs(r.seat[0] - 0.465) < 0.05 && r.camDist === 7.6 && !r.collider, JSON.stringify(r));
await shot('5-au-volant', [3.4, 1.75, 1.7], [0.45, 1.15, 0.1]);
await shot('6-au-volant-route', [0, 2.9, -7.6], [0, 1.3, 2]);

// ---------- 5. Collisions, descente sûre, montée par ACTION ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.defender, p = g.player;
  // Mur (obstacle du décor) placé devant : le Defender s'arrête contre lui.
  v.setPosition(-112, 183, -Math.PI / 2);
  A.tick(2);
  const ahead = v.groundPoint(0, 8, { x: 0, y: 0, z: 0 });
  const wall = g.colliders.addBox(ahead.x, ahead.z, 4, 0.4, v.heading, Infinity, 'test-wall');
  let bumps = 0;
  const off = g.bus.on('vehicle:bump', () => bumps++);
  for (let i = 0; i < 240; i++) {
    g.input.setVirtualMove(0, 0.9);
    A.tick(1);
  }
  A.releaseInput();
  off?.();
  const l = v.toLocal(ahead.x, ahead.z);
  const gap = l.z - (v.spec.L / 2 + v.spec.zc);
  for (let i = 0; i < 160 && Math.abs(v.speed) > 0.05; i++) {
    g.input.setVirtualMove(0, -0.5);
    A.tick(1);
  }
  A.releaseInput();
  A.tick(5);
  wall.enabled = false;
  // Sortie conducteur bloquée (obstacle contre la portière) : descente côté passager.
  const ex = v.doorPoint(1);
  const block = g.colliders.addBox(ex.x, ex.z, 1.2, 1.2, v.heading, Infinity, 'test-block');
  p.exitVehicle();
  const side = v.toLocal(p.human.pos.x, p.human.pos.z);
  const freeSpot = !g.colliders.blocked(p.human.pos.x, p.human.pos.z, p.human.pos.y + 0.6);
  block.enabled = false;
  A.tick(70);
  // Piéton contre la caisse : repoussé hors de l'enveloppe.
  const c = v.groundPoint(0.3, 0, { x: 0, y: 0, z: 0 });
  const q = { x: c.x, z: c.z };
  g.colliders.resolve(q, 0.4, v.pos.y + 0.5);
  const lq = v.toLocal(q.x, q.z);
  // Montée par le bouton ACTION, depuis la portière conducteur.
  const dp = v.doorPoint(1);
  p.human.setPosition(dp.x, dp.z, v.heading - Math.PI / 2);
  A.tick(2);
  const label = g.interact.current?.label, id = g.interact.current?.id;
  g.interact.trigger();
  // Séquence de montée : portière ouverte puis refermée, au volant à la fin.
  let doorMax = 0;
  for (let i = 0; i < 900 && p.mode !== 'drive'; i++) {
    A.tick(1);
    doorMax = Math.max(doorMax, v.access.door_FL.t);
  }
  const entered = p.mode === 'drive' && p.vehicle === v;
  const doorAnim = doorMax > 0.95;
  A.tick(5);
  const doorShut = v.access.door_FL.t === 0;
  // Descente normale : côté conducteur, au repère anchor_exit_driver.
  p.exitVehicle();
  const ld = v.toLocal(p.human.pos.x, p.human.pos.z);
  A.tick(80);
  return { bumps, gap, side: [+side.x.toFixed(2), +side.z.toFixed(2)], freeSpot, pushed: Math.abs(lq.x) >= v.spec.W / 2 + 0.1, id, label, entered, doorAnim, doorShut, exitD: [+ld.x.toFixed(2), +ld.z.toFixed(2)], mode: p.mode, cam: g.player.focus.camDist };
});
check('collision : arrêt contre un obstacle (enveloppe invisible, pas de traversée)', r.gap > -0.05 && r.gap < 1.2, `jeu avant ${r.gap.toFixed(2)} m · ${r.bumps} choc(s)`);
check('descente sûre : sortie conducteur bloquée → côté passager, sur un point libre', r.side[0] < -1 && r.freeSpot, JSON.stringify(r.side));
check('piéton repoussé hors de la caisse', r.pushed);
check('ACTION à la portière conducteur : « Monter », séquence de montée, portière ouverte puis refermée', r.id === 'vehicle-in' && /Monter|Get in/.test(r.label) && r.entered && r.doorAnim && r.doorShut, `${r.id} « ${r.label} »`);
check('descente au repère anchor_exit_driver (hors de l’enveloppe), caméra à pied rétablie', r.exitD[0] >= 1.3 && r.exitD[0] < 1.6 && Math.abs(r.exitD[1] - 0.42) < 0.15 && r.mode === 'foot' && r.cam === undefined, JSON.stringify(r.exitD));

// ---------- 6. Coffre (objet porté), portières à pied, teinte, cheval ----------
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.defender, p = g.player, da = g.defenderAccess;
  const at = (pt) => {
    p.human.setPosition(pt.x, pt.z, p.human.heading);
    A.tick(2);
  };
  const labels = [];
  const act = () => {
    labels.push(g.interact.current?.id === 'defender' ? g.interact.current.label : `(${g.interact.current?.id})`);
    g.interact.trigger();
    A.tick(80);
  };
  at(v.accessPoint('tailgate'));
  act(); // ouvrir le coffre
  const bootOpen = v.access.tailgate.t === 1;
  p.human.carry('hay');
  A.tick(1);
  act(); // ranger la botte de foin
  const stored = v.boot === 'hay' && !p.human.carrying && !!v.M.model.getObjectByName('boot_hay');
  act(); // reprendre
  const taken = !v.boot && p.human.carrying?.kind === 'hay';
  act(); // ranger de nouveau (gardé pour la sauvegarde)
  // Portière arrière gauche à pied.
  at(v.accessPoint('door_RL'));
  act();
  const rl = v.access.door_RL.t === 1;
  // Teinte : devant le capot.
  at(v.groundPoint(0, v.spec.L / 2 + v.spec.zc + 0.9, { x: 0, y: 0, z: 0 }));
  act();
  const paint = v.paint;
  // Action secondaire près de la portière conducteur ouverte : « Monter ».
  v.setAccess('door_FL', true);
  A.tick(80);
  at(v.accessPoint('door_FL'));
  const prim = g.interact.current?.label, sec = da.secondary()?.label;
  v.setAccess('door_FL', false);
  A.tick(80);
  return { labels, bootOpen, stored, taken, rl, paint, prim, sec, saved: g.save.data.defender };
});
check('coffre : ouverture à pied, objet porté rangé puis repris (système d’objets existant)', r.bootOpen && r.stored && r.taken, r.labels.join(' → '));
check('portière arrière ouverte à pied', r.rl);
check('teinte de carrosserie modifiable (Body_Paint seul)', !!r.paint, r.paint);
check('portière conducteur ouverte : « Fermer la portière » + action secondaire « Monter »', /Fermer la portière|Close door/.test(r.prim) && /Monter|Get in/.test(r.sec), `${r.prim} / ${r.sec}`);
check('état enregistré (teinte, coffre, portière ouverte)', r.saved.paint === r.paint && r.saved.boot === 'hay' && r.saved.access.door_RL === 1, JSON.stringify(r.saved));
r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.defender, p = g.player;
  // Cheval : monter, caméra cavalier ; puis à pied, au volant, retour à pied.
  const h = p.horse;
  h.setPosition(v.pos.x + 6, v.pos.z + 6, 0);
  A.tick(2);
  A.mount();
  A.tick(10);
  const ride = { mode: p.mode, cam: p.focus.camDist };
  A.foot();
  A.tick(5);
  p.human.setPosition(v.doorPoint(1).x, v.doorPoint(1).z);
  p.enterVehicle(v);
  A.tick(30);
  const drive = { mode: p.mode, cam: p.focus.camDist, h: p.focus.camHeight };
  p.exitVehicle();
  A.tick(30);
  const foot = { mode: p.mode, cam: p.focus.camDist, focus: p.focusPos === p.human.pos, hidden: p.human.hidden };
  const noHorseInside = !g.horses.some((x) => Math.abs(v.toLocal(x.pos.x, x.pos.z).x) < v.spec.W / 2 && Math.abs(v.toLocal(x.pos.x, x.pos.z).z - v.spec.zc) < v.spec.L / 2);
  return { ride, drive, foot, noHorseInside };
});
check('passages cheval → pied → Defender → pied, caméras rétablies', r.ride.mode === 'ride' && r.ride.cam === undefined && r.drive.mode === 'drive' && r.drive.cam === 7.6 && r.foot.mode === 'foot' && r.foot.cam === undefined && r.foot.focus, JSON.stringify(r));
check('aucun cheval dans le Defender', r.noHorseInside);

// ---------- 7. Sauvegarde et reprise ----------
r = await E(() => {
  const g = window.__game, v = g.defender;
  g.saveNow();
  return { pos: { x: v.pos.x, z: v.pos.z, h: v.heading }, money: g.save.data.money, truck: { x: g.truck.pos.x, z: g.truck.pos.z }, van: { x: g.van.pos.x, z: g.van.pos.z }, def: g.save.data.defender };
});
const saved = r;
await page.goto(`${base}/?defender=${variant}`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 240000 });
await page.tap('[data-id="continue"]');
await ready();
r = await E(() => {
  const g = window.__game, v = g.defender;
  let instances = 0;
  g.scene.traverse((o) => o.name === 'STRIDES_Defender110' && instances++);
  return {
    pos: { x: v.pos.x, z: v.pos.z, h: v.heading }, paint: v.paint, boot: v.boot, bootMesh: !!v.M.model.getObjectByName('boot_hay'), rl: v.access.door_RL.t, instances,
    truck: { x: g.truck.pos.x, z: g.truck.pos.z }, van: { x: g.van.pos.x, z: g.van.pos.z }, money: g.save.data.money,
  };
});
check('reprise : Defender à sa place, même orientation', Math.hypot(r.pos.x - saved.pos.x, r.pos.z - saved.pos.z) < 0.3 && Math.abs(r.pos.h - saved.pos.h) < 0.02, JSON.stringify(r.pos));
check('reprise : teinte, objet du coffre et portière ouverte retrouvés, un seul exemplaire', r.paint === saved.def.paint && r.boot === 'hay' && r.bootMesh && r.rl === 1 && r.instances === 1, JSON.stringify({ paint: r.paint, boot: r.boot, rl: r.rl, n: r.instances }));
check('reprise : camion Strides, van Master et solde inchangés', Math.hypot(r.truck.x - saved.truck.x, r.truck.z - saved.truck.z) < 0.3 && Math.hypot(r.van.x - saved.van.x, r.van.z - saved.van.z) < 0.3 && r.money === saved.money);
// Sauvegarde antérieure au Defender : ajouté une seule fois, à l'écurie, sans toucher au reste.
await E(() => {
  const g = window.__game;
  delete g.save.data.defender;
  if (g.save.data.pos) delete g.save.data.pos.defender;
  g.save.data.money = 1234;
  g.saveNow();
  // saveNow réécrit pos (Defender compris) : on retire de nouveau sa trace dans le stockage.
  const k = g.save.key;
  const d = JSON.parse(localStorage.getItem(k));
  delete d.defender;
  if (d.pos) delete d.pos.defender;
  localStorage.setItem(k, JSON.stringify(d));
  g.save.store = null; // plus d'écriture d'ici au rechargement (fermeture de page)
});
await page.goto(`${base}/?defender=${variant}`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 240000 });
await page.tap('[data-id="continue"]');
await ready();
r = await E(() => {
  const g = window.__game, v = g.defender;
  let instances = 0;
  g.scene.traverse((o) => o.name === 'STRIDES_Defender110' && instances++);
  return { pos: [Math.round(v.pos.x), Math.round(v.pos.z)], instances, money: g.save.data.money, def: g.save.data.defender, truck: { x: g.truck.pos.x, z: g.truck.pos.z } };
});
check('ancienne sauvegarde : Defender ajouté une fois à l’Écurie du Val, solde et camion conservés', r.instances === 1 && r.pos[0] === -97 && r.pos[1] === 181 && r.money === 1234 && r.def?.type === 'defender110_hero' && Math.hypot(r.truck.x - saved.truck.x, r.truck.z - saved.truck.z) < 0.3, JSON.stringify(r));
check('aucune erreur console', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'DEFENDER OK');
await browser.close();
process.exit(fails ? 1 : 0);
