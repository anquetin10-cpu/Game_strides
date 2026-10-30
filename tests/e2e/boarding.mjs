// Montée / descente animées (gameplay/boarding.js), pour chaque véhicule conduisible : Defender 110, van Master,
// camion Scania, voiture (SUV 4x4) et tracteur. Émulation iPhone 13 en rendu logiciel (pas un vrai iPhone).
// Pour chacun : « Monter » proposé à la portière conducteur, un seul appui ; approche depuis plusieurs positions (dont
// le côté opposé : contournement, jamais au travers de la caisse) ; portière immobile pendant l'approche, puis main
// sur la poignée quand elle commence à s'ouvrir ; ouverture complète ; tête sous le pavillon et pieds au-dessus du
// plancher une fois dans l'habitacle ; assis (bassin sur le siège, mains au volant) ; double appui sans effet ;
// conduite, arrêt, « Descendre » : à pied, hors de l'enveloppe du véhicule, portière refermée ; deux cycles ;
// portière bloquée (indication, joueur libre) ; descente refusée en roulant ou côté bloqué ; pause et téléphone
// (séquence suspendue) ; sauvegarde pendant une séquence puis reprise (état stable).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/boarding.mjs [defender,van,truck,car,tractor]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const only = process.argv[2] ? process.argv[2].split(',') : ['defender', 'van', 'truck', 'car', 'tractor'];
mkdirSync('tests/e2e/out/boarding', { recursive: true });
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
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
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
    A.tick(3);
    // Outils communs (dans la page).
    window.__veh = (k) => (k === 'truck' ? g.truck : k === 'van' ? g.van : k === 'defender' ? g.defender : k === 'tractor' ? g.drivables.find((d) => d.isTractor) : g.drivables.find((d) => d.kind === 'duster'));
    window.__local = (v, o) => {
      const l = v.toLocal(o.x, o.z);
      return { x: l.x, y: o.y - v.pos.y, z: l.z };
    };
    window.__bone = (n) => {
      const hu = g.player.human;
      hu.mesh.updateMatrixWorld(true);
      return hu.bones[n].getWorldPosition(hu.mesh.position.clone());
    };
  });
};
await page.goto(`${base}/?autostart&defender=mobile`, { timeout: 180000 });
await ready();

for (const key of only) {
  console.log(`\n— ${key}`);
  // ---------- Montée : un appui, depuis la portière ; contrôles pendant la séquence ----------
  const r = await E((key) => {
    const g = window.__game, A = window.__auto, p = g.player, v = window.__veh(key), b = p.boarding;
    A.foot?.();
    if (p.mode === 'drive') p.vehicle === g.truck ? p.exitTruck() : p.exitVehicle();
    const P = b.profile(v);
    const dp = v.doorPoint(1);
    p.human.setPosition(dp.x, dp.z, v.heading - Math.PI / 2);
    // Caméra posée (elle rattrape le déplacement instantané du test).
    g.cam.snap(p.focus.pos, p.heading);
    A.tick(30);
    g.interact.update();
    const offer = { id: g.interact.current?.id, label: g.interact.current?.label };
    g.interact.trigger();
    const started = b.active;
    // Double appui : sans effet (aucune action proposée, second départ refusé).
    A.tick(1);
    g.interact.update();
    const second = g.interact.current, again = b.begin(v);
    let doorApproach = 0, handGap = null, doorMax = 0, headOver = 0, footUnder = 0, ticks = 0, camJump = 0;
    let last = g.camera.position.clone();
    while (p.mode !== 'drive' && ticks < 1500) {
      A.tick(1);
      ticks++;
      const k = b._door || 0;
      if (b.phase === 'approach') doorApproach = Math.max(doorApproach, k);
      doorMax = Math.max(doorMax, k);
      // Contact : main droite sur la poignée extérieure quand la portière commence à s'ouvrir.
      if (handGap === null && k > 0.02) {
        const h = window.__local(v, window.__bone('rHand'));
        const t = b._target('hOut', k, { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
        handGap = Math.hypot(h.x - t.x, h.y - t.y, h.z - t.z);
      }
      // Dans l'habitacle (au-delà de la peau du flanc) : tête sous le pavillon, pieds au-dessus du plancher.
      const hd = window.__local(v, window.__bone('head'));
      if (hd.x < P.xs - 0.15) headOver = Math.max(headOver, hd.y + 0.1 - P.roof);
      for (const f of ['lFoot', 'rFoot']) {
        const fl = window.__local(v, window.__bone(f));
        if (fl.x < P.xs - 0.25 && Math.abs(fl.z - P.hips.z) < 1.2) footUnder = Math.max(footUnder, P.floor - 0.06 - fl.y);
      }
      const c = g.camera.position;
      camJump = Math.max(camJump, c.distanceTo(last));
      last = c.clone();
    }
    A.tick(3);
    const hips = window.__local(v, window.__bone('hips'));
    const lh = window.__local(v, window.__bone('lHand')), rh = window.__local(v, window.__bone('rHand'));
    const wl = b._wheelGrip(P, 1, { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
    return {
      offer, started, second: second?.id || null, again, ticks, doorApproach, handGap, doorMax, headOver, footUnder, camJump,
      mode: p.mode, driver: v.driver === p, door: b._door, hipsGap: Math.hypot(hips.x - P.hips.x, hips.z - P.hips.z), hipsY: hips.y - P.hips.y,
      wheelGap: Math.hypot(lh.x - wl.x, lh.y - wl.y, lh.z - wl.z), visible: p.human.mesh.visible && !p.human.hidden,
    };
  }, key);
  check(`${key} : « Monter » à la portière conducteur`, /^(vehicle|truck)-in$/.test(r.offer.id) && /^(Monter|Get in)/.test(r.offer.label), `${r.offer.id} « ${r.offer.label} »`);
  check(`${key} : un appui lance la séquence ; double appui sans effet`, r.started && !r.second && r.again === false);
  check(`${key} : portière immobile pendant l'approche, main sur la poignée à l'ouverture`, r.doorApproach === 0 && r.handGap !== null && r.handGap < 0.16, `écart main-poignée ${r.handGap?.toFixed(3)} m`);
  check(`${key} : ouverture complète, puis refermée`, r.doorMax > 0.97 && r.door === 0);
  check(`${key} : tête sous le pavillon, pieds au-dessus du plancher`, r.headOver < 0.02 && r.footUnder < 0.03, `tête ${r.headOver.toFixed(2)} · pieds ${r.footUnder.toFixed(2)}`);
  check(`${key} : assis au volant (bassin sur le siège, mains au volant), visible`, r.mode === 'drive' && r.driver && r.hipsGap < 0.1 && Math.abs(r.hipsY) < 0.08 && r.wheelGap < 0.12 && r.visible, `${(r.ticks / 30).toFixed(1)} s · bassin ${r.hipsGap.toFixed(2)} · main ${r.wheelGap.toFixed(2)}`);
  check(`${key} : caméra sans coupure`, r.camJump < 0.35, `${r.camJump.toFixed(2)} m/image au plus`);
  await E(() => {
    const g = window.__game;
    g.hud.notifEl?.classList.add('hidden');
    g.renderer.render(g.scene, g.camera);
  });
  await page.screenshot({ path: `tests/e2e/out/boarding/${key}-assis.png` });

  // ---------- Conduite, descente refusée en roulant, arrêt, « Descendre » ----------
  const d = await E((key) => {
    const g = window.__game, A = window.__auto, p = g.player, v = window.__veh(key), b = p.boarding;
    const x0 = v.pos.x, z0 = v.pos.z;
    for (let i = 0; i < 70; i++) {
      g.input.setVirtualMove(0, 0.6);
      A.tick(1);
    }
    const moving = Math.abs(v.speed);
    const refused = b.beginExit() === false && p.mode === 'drive';
    for (let i = 0; i < 300 && Math.abs(v.speed) > 0.05; i++) {
      g.input.setVirtualMove(0, -0.6);
      A.tick(1);
    }
    A.releaseInput();
    A.tick(20);
    const moved = Math.hypot(v.pos.x - x0, v.pos.z - z0);
    g.interact.update();
    const offer = g.interact.current?.label;
    g.interact.trigger();
    let doorMax = 0, ticks = 0, still = true;
    const vx = v.pos.x, vz = v.pos.z;
    while (p.mode !== 'foot' && ticks < 1500) {
      A.tick(1);
      ticks++;
      doorMax = Math.max(doorMax, b._door || 0);
      if (Math.hypot(v.pos.x - vx, v.pos.z - vz) > 0.03) still = false;
    }
    A.tick(10);
    const hu = p.human, L = v.toLocal(hu.pos.x, hu.pos.z), P = b.profile(v);
    const ground = Math.abs(hu.pos.y - g.terrain.getHeight(hu.pos.x, hu.pos.z));
    return { moving, refused, moved, offer, doorMax, ticks, still, mode: p.mode, driver: !!v.driver, door: b._door, outX: L.x, colX: P.colX, ground, free: !g.colliders.blocked(hu.pos.x, hu.pos.z, hu.pos.y + 0.9) };
  }, key);
  check(`${key} : conduite après la montée, descente refusée en roulant`, d.moved > 2 && d.moving > 0.4 && d.refused, `${d.moved.toFixed(1)} m · ${(d.moving * 3.6).toFixed(0)} km/h · refus ${d.refused}`);
  check(`${key} : « Descendre » : séquence complète, véhicule immobile`, /^(Descendre|Get out)/.test(d.offer) && d.doorMax > 0.97 && d.still && d.mode === 'foot' && !d.driver && d.door === 0, `${(d.ticks / 30).toFixed(1)} s`);
  check(`${key} : au sol, hors de l'enveloppe du véhicule et de la portière`, d.ground < 0.06 && d.outX > d.colX && d.free, `x local ${d.outX.toFixed(2)} (enveloppe ${d.colX.toFixed(2)})`);
  await E(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
  await page.screenshot({ path: `tests/e2e/out/boarding/${key}-descendu.png` });

  // ---------- Second cycle, depuis l'autre côté (contournement) ----------
  const c2 = await E((key) => {
    const g = window.__game, A = window.__auto, p = g.player, v = window.__veh(key), b = p.boarding;
    const P = b.profile(v);
    // Côté passager, au niveau du siège.
    const sp = v.groundPoint(-P.colX - 1.0, P.hips.z);
    p.human.setPosition(sp.x, sp.z, v.heading + Math.PI / 2);
    A.tick(2);
    const ok = b.begin(v);
    let inside = 0, ticks = 0;
    while (b.phase === 'approach' && ticks < 1500) {
      A.tick(1);
      ticks++;
      const l = v.toLocal(p.human.pos.x, p.human.pos.z);
      const S = v === g.truck ? { W: P.colX * 2, L: 12.4, zc: 0 } : v.spec;
      // Dernier mètre jusqu'au point d'approche exclu (contre la caisse, dans la boîte de collision grossière).
      const near = Math.hypot(l.x - P.stand.x, l.z - P.stand.z) < 1.0;
      if (!near && Math.abs(l.x) < S.W / 2 && Math.abs(l.z - (S.zc || 0)) < S.L / 2) inside++;
    }
    while (p.mode !== 'drive' && ticks < 3000) {
      A.tick(1);
      ticks++;
    }
    const seated = p.mode === 'drive';
    g.interact.update();
    g.interact.trigger();
    while (p.mode !== 'foot' && ticks < 4500) {
      A.tick(1);
      ticks++;
    }
    return { ok, inside, seated, foot: p.mode === 'foot', driver: !!v.driver };
  }, key);
  check(`${key} : second cycle depuis le côté passager (contournement, jamais au travers)`, c2.ok && c2.inside === 0 && c2.seated && c2.foot && !c2.driver, JSON.stringify(c2));

  // ---------- Portière bloquée ; sortie bloquée ----------
  const bl = await E((key) => {
    const g = window.__game, A = window.__auto, p = g.player, v = window.__veh(key), b = p.boarding;
    const P = b.profile(v);
    const z = P.door.zr + (P.door.zh - P.door.zr) * 0.2;
    const w = v.groundPoint(P.xs + 0.75, z);
    const box = g.colliders.addBox(w.x, w.z, 0.25, 0.25, v.heading, Infinity, 'test-block');
    const dp = v.doorPoint(1);
    p.human.setPosition(dp.x + 0.5 * Math.cos(v.heading), dp.z - 0.5 * Math.sin(v.heading), v.heading - Math.PI / 2);
    A.tick(2);
    const ok = b.begin(v);
    const hint = document.querySelector('.hint')?.textContent || '';
    A.tick(5);
    const free = !b.active && p.mode === 'foot';
    // Au volant, le même obstacle : descente refusée, toujours assis.
    p.enterVehicle(v);
    A.tick(5);
    const out = b.beginExit();
    const hint2 = document.querySelector('.hint')?.textContent || '';
    const seated = p.mode === 'drive' && !b.active;
    box.enabled = false;
    p.vehicle === g.truck ? p.exitTruck() : p.exitVehicle();
    A.tick(3);
    return { ok, hint, free, out, hint2, seated };
  }, key);
  check(`${key} : portière bloquée → indication, pas de séquence, joueur libre`, bl.ok === false && /place|room/i.test(bl.hint) && bl.free, bl.hint.slice(0, 60));
  check(`${key} : sortie bloquée → indication, reste assis (pas de téléportation)`, bl.out === false && /place|room/i.test(bl.hint2) && bl.seated);

  // ---------- Pause / téléphone : séquence suspendue ----------
  const pz = await E((key) => {
    const g = window.__game, A = window.__auto, p = g.player, v = window.__veh(key), b = p.boarding;
    const dp = v.doorPoint(1);
    p.human.setPosition(dp.x, dp.z, v.heading - Math.PI / 2);
    A.tick(2);
    b.begin(v);
    for (let i = 0; i < 400 && (b.phase === 'approach' || b.t < 1.0); i++) A.tick(1);
    const t0 = b.t;
    g.phone.open();
    A.tick(60);
    const t1 = b.t;
    g.phone.close();
    A.tick(30);
    const t2 = b.t;
    // Fin propre.
    for (let i = 0; i < 1500 && p.mode !== 'drive'; i++) A.tick(1);
    return { t0, t1, t2, seated: p.mode === 'drive' };
  }, key);
  check(`${key} : téléphone ouvert → séquence suspendue, reprise ensuite`, Math.abs(pz.t1 - pz.t0) < 0.02 && pz.t2 > pz.t1 + 0.3 && pz.seated, JSON.stringify(pz));
  await E(() => {
    const p = window.__game.player;
    p.vehicle === window.__game.truck ? p.exitTruck() : p.exitVehicle();
    window.__auto.tick(3);
  });
}

// ---------- Sauvegarde pendant une montée, puis reprise : état stable ----------
const sv = await E(() => {
  const g = window.__game, A = window.__auto, p = g.player, v = g.defender, b = p.boarding;
  const dp = v.doorPoint(1);
  p.human.setPosition(dp.x, dp.z, v.heading - Math.PI / 2);
  A.tick(2);
  b.begin(v);
  for (let i = 0; i < 600 && (b.phase === 'approach' || (b._door || 0) < 0.6); i++) A.tick(1);
  const mid = { door: b._door, phase: b.phase };
  g.saveNow();
  return { mid, pos: g.save.data.pos, safe: b.safeFoot() };
});
await page.goto(`${base}/?defender=mobile`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 240000 });
await page.tap('[data-id="continue"]');
await ready();
const rl = await E(() => {
  const g = window.__game, p = g.player, v = g.defender, hu = p.human;
  const L = v.toLocal(hu.pos.x, hu.pos.z);
  return { mode: p.mode, active: p.boarding.active, door: v.access.door_FL.t, driver: !!v.driver, outX: L.x, free: !g.colliders.blocked(hu.pos.x, hu.pos.z, hu.pos.y + 0.9), hidden: hu.hidden, visible: hu.mesh.visible };
});
check('sauvegarde en pleine montée → reprise à pied en lieu sûr, portière fermée, pas de conducteur', sv.mid.door > 0.5 && rl.mode === 'foot' && !rl.active && rl.door === 0 && !rl.driver && rl.outX > 1.1 && rl.free && !rl.hidden, JSON.stringify({ mid: sv.mid, rl }));
check('aucune erreur console', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'MONTÉE / DESCENTE OK');
await browser.close();
process.exit(fails ? 1 : 0);
