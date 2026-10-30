// Grand Prix de Paris Indoor (iPhone 13 émulé, rendu logiciel) :
// 1. voyage en camion Deauville → Paris par l'autoroute A13 (proposition à l'arrêt sur la bretelle, cheval à bord,
//    heure et gazole), région « Paris » (mini-carte, nom de zone, Deauville masqué) ;
// 2. défi à conditions fixes depuis l'app Activités, monté pour de vrai (joystick et bouton SAUT le long du tracé du
//    Grand Prix) : sans faute dans l'ordre, caméra jamais dans un mur ou une tribune, résultat, retour à Deauville ;
// 3. mission « Grand Prix de Paris Indoor » de bout en bout (pilote) : Sprint, grille, présentation, Grand Prix,
//    barrage éventuel, podium, dotation ;
// 4. sauvegarde faite à Paris : on y reprend au rechargement ; retour en Normandie refusé sans le cheval à bord.
// Captures dans tests/e2e/out/paris/. Usage : BASE=http://127.0.0.1:5173 node tests/e2e/paris.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/paris';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
let page = await ctx.newPage();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(page);
const boot = async () => {
  await page.goto(`${base}/?autostart`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  await page.evaluate(() => {
    const A = window.__auto, g = window.__game;
    A.stopLoop();
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    A.closeCards();
    g.missions.timer = 1e6;
  });
};
const E = (f, a) => page.evaluate(f, a);
const shot = async (name) => {
  await E(() => {
    const g = window.__game;
    g.hud.notifQueue.length = 0;
    g.hud.notifEl?.classList.add('hidden');
    g.renderer.render(g.scene, g.camera);
  });
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
await boot();

// ---------- 1. Voyage Deauville → Paris ----------
let r = await E(() => {
  const A = window.__auto, g = window.__game;
  g.syncFade = true;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  const t = g.truck, tp = g.player.transport;
  t.setRampInstant(true);
  tp.loadInstant(g.mainHorse);
  t.setRampInstant(false);
  A.drive();
  t.setPosition(545, -118, Math.PI / 2);
  A.tick(6);
  const card = document.querySelector('.overlay h2')?.textContent;
  const hour0 = g.hour(), fuel0 = t.sim.fuelL;
  A.tap(document.querySelector('.overlay [data-id="travel-go"]'));
  A.tick(10);
  const h = g.mainHorse;
  return {
    card, region: g.region, zone: g.zoneName(t.pos.x, t.pos.z), aboard: tp.isAboard(h), inPark: Math.hypot(t.pos.x - (4000 - 156), t.pos.z - 6) < 6,
    dh: Math.round((g.hour() - hour0) * 60), fuel: Math.round(fuel0 - t.sim.fuelL), terrain: g.world.terrainMesh.visible, sea: g.world.water.sea.visible, paris: g.world.paris.group.visible,
  };
});
check('bretelle A13 à l’arrêt : proposition « Direction Paris »', r.card === 'Direction Paris', r.card);
check('arrivée au parking de Paris, cheval à bord', r.region === 'paris' && r.inPark && r.aboard, JSON.stringify(r));
check('trajet : 2 h 10 de route, 46 l de gazole', r.dh === 130 && r.fuel === 46, `${r.dh} min · ${r.fuel} l`);
check('région Paris : Deauville (terrain, mer) masquée, zone « Paris »', !r.terrain && !r.sea && r.paris && r.zone === 'Paris', JSON.stringify(r));
await shot('1-arrivee-parking');
r = await E(() => {
  const g = window.__game, A = window.__auto;
  A.foot();
  // Retour refusé : le cheval n'est plus dans le camion (déchargé et attaché au parking).
  const tp = g.player.transport;
  g.truck.setRampInstant(true);
  tp.unloadInstant(g.mainHorse);
  g.truck.setRampInstant(false);
  A.drive();
  return g.travel.blocker('paris');
});
check('retour vers Deauville refusé tant que le cheval n’est pas à bord', /Charge d’abord/.test(r || ''), r);

// ---------- 2. Arène et paddock ----------
await E(() => {
  const g = window.__game, A = window.__auto;
  A.mount();
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 20.5 * 3600;
  g.player.horse.setPosition(4000 - 30, 9, 1.9);
  g.cam.snap(g.player.focus.pos, 1.9);
  A.tick(30);
});
await shot('2-arene-nuit');
await E(() => {
  const g = window.__game, A = window.__auto;
  g.player.horse.setPosition(4000 - 112, 4, Math.PI / 2);
  g.cam.snap(g.player.focus.pos, Math.PI / 2);
  A.tick(30);
});
await shot('3-paddock');

// ---------- 3. Défi à conditions fixes (app Activités), monté au joystick ----------
r = await E(async () => {
  const g = window.__game, A = window.__auto;
  A.foot();
  g.phone.open('activities');
  await new Promise((res) => setTimeout(res, 300));
  const cards = [...document.querySelectorAll('[data-challenge]')].map((c) => c.dataset.challenge);
  const card = document.querySelector('[data-challenge="defi-paris-v2"]');
  A.tap(card.querySelector('[data-id="challenge-open"]'));
  await new Promise((res) => setTimeout(res, 200));
  const intro = document.querySelector('.overlay .card')?.textContent || '';
  A.tap(document.querySelector('.overlay [data-id="challenge-go"]'));
  A.tick(10);
  const run = g.missions.active;
  for (let i = 0; i < 200 && run.step?.kind !== 'course'; i++) {
    if (g.hud.dialogActive) g.hud.advanceDialog();
    A.tick(2);
  }
  return { cards, intro: intro.slice(0, 700), horse: g.player.horse.name, region: g.region, hour: g.hour(), kind: run.step?.kind };
});
check('Activités : le défi de Paris parmi les défis à conditions fixes', r.cards.includes('defi-paris-v2') && r.cards.includes('defi-pole-v5'), JSON.stringify(r.cards));
check('règles du défi : cheval fourni, 1,50 m, soirée en salle, 41 s', /Lumière de Paris/.test(r.intro) && /1,50 m/.test(r.intro) && /20 h 30/.test(r.intro) && /41 s/.test(r.intro), r.intro);
check('départ directement dans l’arène de Paris, cheval fourni, 20 h 30', r.region === 'paris' && r.horse === 'Lumière de Paris' && r.hour === 20.5 && r.kind === 'course', JSON.stringify(r));
r = await E(async () => {
  const g = window.__game, A = window.__auto;
  const { PARIS_COURSES } = await import('/src/gameplay/parisCourse.js');
  const C = PARIS_COURSES.paris_gp;
  const S = C.start;
  const line = [];
  for (let k = 0; k < 16; k++) line.push({ x: S.x - Math.sin(S.rot) * (8 - k * 0.5), z: S.z - Math.cos(S.rot) * (8 - k * 0.5) });
  const h = g.player.horse;
  const { PARIS, PARIS_FLOOR } = await import('/src/world/sites.js');
  window.__parisSand = PARIS.y + PARIS_FLOOR.sand;
  h.setPosition(line[0].x, line[0].z, S.rot);
  g.cam.yaw = S.rot + Math.PI;
  let camHits = 0, n = 0, zoneSeen = 0, lineSeen = 0, aidLow = 0;
  const ev = A.rideLine(line.concat(C.line), {
    maxTicks: 3600,
    until: () => {
      const cp = g.camera.position;
      n++;
      // Aides au saut : tracé et zone d'appel affichés, posés au-dessus du sable de l'arène (pas cachés dessous).
      const aids = g.course?.aids;
      if (aids) {
        const sand = g.terrain.getHeight(h.pos.x, h.pos.z);
        if (aids.line.mesh.visible && aids.line.geo.drawRange.count > 0) lineSeen++;
        if (aids.good.visible) {
          zoneSeen++;
          if (aids.good.position.y < sand + 0.02) aidLow++;
        }
        const ys = aids.line.geo.attributes.position.array;
        if (n === 1) for (let i = 1; i < ys.length; i += 3) if (ys[i] < window.__parisSand + 0.02) { aidLow++; break; }
      }
      if (g.colliders.cameraBlocked(cp.x, cp.z, cp.y) || cp.y < g.terrain.getHeight(cp.x, cp.z) + 0.5) camHits++;
      if (n === 520) window.__mid = true;
      return false;
    },
  });
  for (let i = 0; i < 60 && g.missions.active?.step?.kind === 'course'; i++) A.tick(1);
  const st = g.missions.active?.data.course || null;
  return { ev: ev.map((e) => `${e.k.split(':')[1]}:${e.label}`), camHits, t: st?.t, faults: st?.faults, zoneSeen, lineSeen, aidLow, n };
});
const order = ['1', '2', '3', '4A', '4B', '5', '6', '7A', '7B'];
check('défi monté au joystick : 9 efforts franchis dans l’ordre, sans faute', JSON.stringify(r.ev) === JSON.stringify(order.map((l) => `clear:${l}`)), JSON.stringify(r.ev));
check('défi : dans le temps accordé (41 s)', r.t > 25 && r.t <= 41, `${r.t?.toFixed(2)} s`);
check('aides au saut visibles sur le sable : tracé au sol et zone d’appel, au-dessus du sable', r.lineSeen > r.n * 0.5 && r.zoneSeen > 60 && r.aidLow === 0, `tracé ${r.lineSeen}/${r.n} images, zone ${r.zoneSeen}, sous le sable ${r.aidLow}`);
check('caméra de concours jamais dans un mur, une tribune ou le sol', r.camHits === 0, `${r.camHits} image(s)`);
await shot('4-defi-arrivee');
r = await E(() => {
  const g = window.__game, A = window.__auto;
  for (let i = 0; i < 40 && !document.querySelector('.overlay [data-id="challenge-quit"]'); i++) A.tick(2);
  const title = document.querySelector('.overlay h2')?.textContent;
  A.tap(document.querySelector('.overlay [data-id="challenge-quit"]'));
  A.tick(10);
  const rec = g.save.data.challenges.records['defi-paris-v2'];
  return { title, best: rec?.best && { pen: rec.best.penalties, t: rec.best.time }, region: g.region, horse: g.player.horse?.name };
});
check('défi : résultat et record enregistrés', r.best && r.best.pen === 0, JSON.stringify(r));
check('fin du défi : retour à la situation d’avant (Paris, Comète)', r.region === 'paris' && r.horse === 'Comète', JSON.stringify(r));

// ---------- 4. Mission « Grand Prix de Paris Indoor » (pilote) ----------
r = await E(() => {
  const g = window.__game, A = window.__auto;
  // Retour en Normandie d'abord (la mission part de Deauville).
  g.syncFade = true;
  A.foot();
  const t = g.truck, tp = g.player.transport;
  t.setRampInstant(true);
  if (!tp.isAboard(g.mainHorse)) tp.loadInstant(g.mainHorse);
  t.setRampInstant(false);
  A.drive();
  t.setPosition(4000 - 198, 6, -Math.PI / 2);
  A.tick(6);
  A.tap(document.querySelector('.overlay [data-id="travel-go"]'));
  A.tick(6);
  const back = g.region;
  const bigs = [];
  const big = g.hud.big.bind(g.hud);
  g.hud.big = (a, b, c) => (bigs.push(`${a} | ${b}`), big(a, b, c));
  const money0 = g.save.data.money;
  const res = A.runStory('gpparis', 3000);
  return { back, res: { ok: res.ok, error: res.error, c: res.completed }, bigs, money: g.save.data.money - money0, done: g.save.data.completed.includes('gpparis') };
});
check('retour vers Deauville avec le cheval à bord', r.back === 'deauville');
check('mission terminée de bout en bout (camion, A13, accréditation, échauffement, Sprint, Grand Prix)', r.res.ok && r.done, JSON.stringify(r.res).slice(0, 300));
check('présentation des cavaliers et annonce du Grand Prix', r.bigs.some((b) => /Présentation des 40 cavaliers/.test(b)), r.bigs.slice(0, 8).join(' / '));
check('classement et dotation versée', /du Grand Prix de Paris Indoor/.test(r.res.c?.title || '') && r.money > 0, `${r.res.c?.title} · +${r.money} €`);

// ---------- 5. Sauvegarde à Paris et reprise ----------
r = await E(() => {
  const g = window.__game, A = window.__auto;
  A.foot();
  g.player.human.setPosition(4000 - 140, 10, 0);
  A.tick(3);
  g.saveNow();
  return g.region;
});
await page.reload();
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
r = await E(() => ({ region: window.__game.region, x: Math.round(window.__game.player.focus.pos.x) }));
check('rechargement : reprise à Paris (région restaurée)', r.region === 'paris' && r.x > 3800, JSON.stringify(r));
check('aucune erreur console', !errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `ÉCHECS : ${fails}` : 'PARIS OK');
process.exit(fails ? 1 : 0);
