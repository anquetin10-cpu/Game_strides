// Transport du cheval en camion Strides + sortie en concours, de bout en bout.
// 1) API : mener en main, ouvrir la rampe, faire monter, fermer, rouler, ouvrir, faire descendre, monter à cheval,
//    sauvegarde / rechargement avec le cheval à bord ;
// 2) « Aller en concours » (offre de l'app, chargement, trajet, déchargement, dossard, échauffement, parcours FEI,
//    classement et dotation), accéléré par l'API ;
// 3) Vrais touchers (CDP) en lecteur intégré 667 × 308 et en 844 × 390 : boutons ACTION / secondaire, joystick ;
// 4) Vrais trajets sur les routes (Val → Pôle, retour, Haras → Pôle) au joystick virtuel, cheval à bord.
// Usage : BASE=http://localhost:5173 node tests/e2e/transport-flow.mjs [api,concours,touch,route]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const base = process.env.BASE || 'http://localhost:5173';
const parts = (process.argv[2] || 'api,concours,touch,route').split(',');
const OUT = 'tests/e2e/out/transport';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];

async function openGame({ W = 844, H = 390, embedded = false, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().startsWith('BUMP')) console.log(m.text()); });
  await page.goto(embedded ? `${base}/tests/e2e/viewer-harness.html?autostart` : `${base}/?autostart`);
  const f = embedded ? await (await page.waitForSelector('iframe')).contentFrame() : page.mainFrame();
  await f.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 240000 });
  await f.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    A.stopLoop();
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.timer = 1e9;
    // Caméra recalée sur le joueur (le plan d'ouverture peut encore être loin quand la boucle s'arrête).
    const fo = g.player.focus;
    g.cam.snap(fo.pos, fo.heading || 0);
    A.tick(2);
  });
  return { ctx, page, f };
}
const render = (f) => f.evaluate(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
const tickUntil = (f, cond, max = 3000) =>
  f.evaluate(([src, max]) => {
    const fn = new Function('g', `return (${src})`);
    const g = window.__game;
    let n = 0;
    while (!fn(g) && n < max) {
      window.__auto.tick(1);
      n++;
    }
    return n;
  }, [cond, max]);

// ---------- 1. Parcours complet par l'API ----------
if (parts.includes('api')) {
  const { ctx, page, f } = await openGame();
  const r = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    const p = g.player, t = g.truck, tp = p.transport, h = g.mainHorse;
    const out = {};
    // Près de la tête du cheval : « Monter » en action principale, « Mener en main » en secondaire.
    h.setPosition(t.pos.x - 6, t.pos.z + 6, t.heading);
    p.human.setPosition(h.pos.x + Math.sin(h.heading) * 1.7 + 0.3, h.pos.z + Math.cos(h.heading) * 1.7, h.heading + Math.PI);
    A.tick(3);
    out.mainNearHorse = g.interact.current?.label;
    out.secNearHorse = tp.secondary()?.label;
    tp.triggerSecondary();
    A.tick(2);
    out.leading = tp.leading && tp.led.horse === h;
    // Marcher jusqu'à l'arrière du camion : le cheval suit au pas.
    const goal = t.rearPoint({ x: 0, y: 0, z: 0 }, 1.0);
    let maxGap = 0;
    for (let i = 0; i < 30 * 25; i++) {
      const dx = goal.x - p.human.pos.x, dz = goal.z - p.human.pos.z;
      if (Math.hypot(dx, dz) < 0.8) break;
      A.steer(dx, dz, 0.5);
      A.tick(1);
      if (i > 30) maxGap = Math.max(maxGap, Math.hypot(h.pos.x - p.human.pos.x, h.pos.z - p.human.pos.z));
    }
    A.releaseInput();
    A.tick(30);
    out.followGap = maxGap;
    out.ropeVisible = tp.ropes[0].mesh.visible;
    out.mainAtRear = g.interact.current?.label;
    g.interact.trigger();
    A.tick(30 * 4);
    out.rampOpen = t.rampOpen && t.gates.t === 1;
    // Rapprocher le cheval du pied du pont.
    const foot = t.rearPoint({ x: 0, y: 0, z: 0 }, 2.6);
    p.human.setPosition(foot.x, foot.z, t.heading + Math.PI);
    A.tick(30 * 2);
    out.mainLoad = g.interact.current?.label;
    out.secLoad = tp.secondary()?.label;
    g.interact.trigger();
    out.seqStarted = !!tp.seq && p.locked;
    return out;
  });
  check('« Monter » en action principale près du cheval', r.mainNearHorse === 'Monter', r.mainNearHorse);
  check('« Mener en main » en action secondaire', r.secNearHorse === 'Mener en main', r.secNearHorse);
  check('cheval mené en main', r.leading);
  check('le cheval suit à côté du meneur', r.followGap < 3.2, `écart max ${r.followGap.toFixed(2)} m`);
  check('longe affichée', r.ropeVisible);
  check('« Ouvrir la rampe » à l’arrière du camion', r.mainAtRear === 'Ouvrir la rampe', r.mainAtRear);
  check('rampe et portillons ouverts', r.rampOpen);
  check('« Faire monter le cheval » (et « Lâcher » en secondaire)', r.mainLoad === 'Faire monter le cheval' && r.secLoad === 'Lâcher', `${r.mainLoad} / ${r.secLoad}`);
  check('séquence de chargement lancée, joueur guidé', r.seqStarted);
  await render(f);
  await page.screenshot({ path: `${OUT}/api-1-loading.png` });
  const n = await tickUntil(f, '!g.player.transport.seq', 30 * 60);
  const r2 = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    const p = g.player, t = g.truck, tp = p.transport, h = g.mainHorse;
    A.tick(3);
    const l = t.toLocal(h.pos.x, h.pos.z);
    const out = {
      aboard: tp.isAboard(h), hidden: h.hiddenInTruck, visible: h.mesh.visible, inside: Math.abs(l.x) < 1.2 && l.z < 0 && l.z > -4.2,
      floor: h.pos.y - t.pos.y, whistle: p.whistle(), blip: g.getBlips().some((b) => b.kind === 'horse'), locked: p.locked, mode: p.mode,
    };
    // Fermer la rampe.
    const rear = t.rearPoint({ x: 0, y: 0, z: 0 }, 2.6);
    p.human.setPosition(rear.x, rear.z, t.heading);
    A.tick(3);
    out.mainClose = g.interact.current?.label;
    g.interact.trigger();
    A.tick(30 * 4);
    out.closed = t.rampClosed;
    // Au volant : rouler un peu, le cheval voyage avec le camion.
    const door = t.doorPoint(1, { x: 0, y: 0, z: 0 });
    p.human.setPosition(door.x, door.z, t.heading);
    A.tick(3);
    out.mainDrive = g.interact.current?.label;
    g.interact.trigger();
    out.drive = p.mode === 'drive' && t.engineOn;
    let maxV = 0;
    const start = { x: t.pos.x, z: t.pos.z };
    for (let i = 0; i < 30 * 7; i++) {
      g.input.setVirtualMove(0, 0.55);
      A.tick(1);
      maxV = Math.max(maxV, t.speed);
    }
    out.maxKmh = maxV * 3.6;
    out.gear = t.gearLabel;
    out.dist = Math.hypot(t.pos.x - start.x, t.pos.z - start.z);
    const lh = t.toLocal(h.pos.x, h.pos.z);
    out.horseRides = Math.abs(lh.x) < 1.2 && lh.z < 0 && lh.z > -4.2;
    out.comfortGauge = !document.querySelector('.comfort').classList.contains('hidden') && /CONFORT/.test(document.querySelector('.comfort').textContent);
    for (let i = 0; i < 30 * 8 && Math.abs(t.speed) > 0.05; i++) {
      g.input.setVirtualMove(0, -0.3);
      A.tick(1);
    }
    A.releaseInput();
    A.tick(10);
    out.stopped = t.stopped;
    out.comfort = tp.comfort;
    out.mainExit = g.interact.current?.label;
    g.interact.trigger();
    out.foot = p.mode === 'foot';
    return out;
  });
  check('cheval à bord, attaché dans sa stalle', r2.aboard && r2.hidden && r2.visible && r2.inside, JSON.stringify({ inside: r2.inside, visible: r2.visible }));
  check('debout sur le plancher du box', r2.floor > 0.75 && r2.floor < 1.1, r2.floor.toFixed(2));
  check('sifflet désactivé, pas de repère cheval sur la carte', !r2.whistle && !r2.blip);
  check('fin de séquence : joueur libre à pied', !r2.locked && r2.mode === 'foot', `${n} images`);
  check('« Fermer la rampe » puis rampe fermée', r2.mainClose === 'Fermer la rampe' && r2.closed, r2.mainClose);
  check('« Conduire » à la portière, moteur démarré', r2.mainDrive === 'Conduire' && r2.drive, r2.mainDrive);
  check('le camion roule (boîte auto)', r2.maxKmh > 12 && r2.dist > 10 && /^D[2-6]$/.test(r2.gear), `${r2.maxKmh.toFixed(0)} km/h, ${r2.gear}`);
  check('le cheval voyage dans le camion', r2.horseRides);
  check('jauge de confort affichée au volant', r2.comfortGauge);
  check('arrêt, confort préservé en conduite souple', r2.stopped && r2.comfort > 85, `${r2.comfort.toFixed(0)} %`);
  check('« Sortir » du camion', r2.mainExit === 'Sortir' && r2.foot, r2.mainExit);
  await render(f);
  await page.screenshot({ path: `${OUT}/api-2-arrived.png` });
  const r3 = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    const p = g.player, t = g.truck, tp = p.transport;
    const rear = t.rearPoint({ x: 0, y: 0, z: 0 }, 1.0);
    p.human.setPosition(rear.x, rear.z, t.heading);
    A.tick(3);
    const out = { mainOpen: g.interact.current?.label };
    g.interact.trigger();
    A.tick(30 * 4);
    const foot = t.rearPoint({ x: 0, y: 0, z: 0 }, 2.6);
    p.human.setPosition(foot.x, foot.z, t.heading);
    A.tick(3);
    out.mainUnload = g.interact.current?.label;
    out.secUnload = tp.secondary()?.label;
    g.interact.trigger();
    out.seq = !!tp.seq;
    return out;
  });
  check('« Ouvrir la rampe » à l’arrivée', r3.mainOpen === 'Ouvrir la rampe', r3.mainOpen);
  check('« Faire descendre le cheval » proposé (« Fermer la rampe » en secondaire)', r3.mainUnload === 'Faire descendre le cheval' && r3.secUnload === 'Fermer la rampe', `${r3.mainUnload} / ${r3.secUnload}`);
  check('séquence de déchargement lancée', r3.seq);
  await f.evaluate(() => { for (let i = 0; i < 30 * 6; i++) window.__auto.tick(1); });
  await render(f);
  await page.screenshot({ path: `${OUT}/api-3-unloading.png` });
  await tickUntil(f, '!g.player.transport.seq', 30 * 60);
  const r4 = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    const p = g.player, t = g.truck, tp = p.transport, h = g.mainHorse;
    A.tick(5);
    const l = t.toLocal(h.pos.x, h.pos.z);
    const out = { aboard: tp.isAboard(h), hidden: h.hiddenInTruck, led: tp.leading && tp.led.horse === h, behind: l.z < -4.6, blip: g.getBlips().some((b) => b.kind === 'horse') };
    // Monter à cheval depuis la main.
    p.human.setPosition(h.pos.x + Math.cos(h.heading) * 1.4, h.pos.z - Math.sin(h.heading) * 1.4, h.heading);
    A.tick(3);
    out.mainMount = g.interact.current?.label;
    if (out.mainMount === 'Monter') g.interact.trigger();
    else p.mount();
    A.tick(3);
    out.ride = p.mode === 'ride' && !tp.leading;
    return out;
  });
  check('cheval descendu, en main derrière le camion', !r4.aboard && !r4.hidden && r4.led && r4.behind, JSON.stringify(r4));
  check('repère du cheval de retour sur la carte', r4.blip);
  check('monter à cheval après le déchargement', r4.ride, r4.mainMount);
  // Sauvegarde / rechargement avec le cheval à bord.
  const r5 = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    const p = g.player, t = g.truck, tp = p.transport, h = g.mainHorse;
    p.dismount();
    A.tick(2);
    t.setRampInstant(true);
    tp.loadInstant(h);
    t.setRampInstant(false);
    tp._persist();
    A.tick(2);
    g.saveNow();
    return { saved: JSON.parse(localStorage.getItem('strides-grand-tour-v1')).transport };
  });
  check('état du camion sauvegardé', r5.saved && r5.saved.aboard?.length === 1 && r5.saved.ramp === 0, JSON.stringify(r5.saved));
  await f.evaluate(() => location.reload());
  await f.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 240000 });
  await f.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
  const r6 = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    A.stopLoop();
    A.closeCards();
    A.tick(5);
    const h = g.mainHorse, t = g.truck, tp = g.player.transport;
    const l = t.toLocal(h.pos.x, h.pos.z);
    return { aboard: tp.isAboard(h), hidden: h.hiddenInTruck, inside: Math.abs(l.x) < 1.2 && l.z < 0 && l.z > -4.2, closed: t.rampClosed };
  });
  check('rechargement : le cheval est toujours dans le camion', r6.aboard && r6.hidden && r6.inside && r6.closed, JSON.stringify(r6));
  // Robustesse : abandon de mission pendant un chargement, cheval de mission supprimé.
  const r7 = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    const p = g.player, t = g.truck, tp = p.transport;
    t.setRampInstant(true);
    const q = g.spawnHorse({ id: 'testq', name: 'Testeur', coat: 'grey' }, t.pos.x, t.pos.z, 0, { saddle: false });
    q.leadable = true;
    const rear = t.rearPoint({ x: 0, y: 0, z: 0 }, 2.6);
    p.human.setPosition(rear.x, rear.z, t.heading);
    q.setPosition(rear.x - 1, rear.z - 1, t.heading);
    tp.lead(q);
    tp.load(q);
    for (let i = 0; i < 30 * 3; i++) A.tick(1);
    const mid = !!tp.seq;
    g.despawn(q);
    A.tick(3);
    return { mid, seq: !!tp.seq, locked: p.locked, override: !!g.cam.override, aboard: tp.aboard.length };
  });
  check('cheval supprimé en pleine séquence : rien ne reste bloqué', r7.mid && !r7.seq && !r7.locked && !r7.override && r7.aboard === 1, JSON.stringify(r7));
  await ctx.close();
}

// ---------- 2. Sortie en concours ----------
if (parts.includes('concours')) {
  const { ctx, page, f } = await openGame();
  const r = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    const d = g.save.data;
    d.completed.push('tuto');
    d.reputation = 950;
    d.money = 300;
    const tp = g.player.transport;
    tp.offers.t = 0;
    tp.offers.update(0.1);
    const o = g.missions.offers.find((x) => x.id === 'event:concours');
    g.phone.open('activities');
    const card = !!document.querySelector(`.req-card[data-offer="event:concours"]`);
    g.phone.close();
    return { offer: !!o, title: o?.title, vertical: o?.vertical, card };
  });
  check('offre de concours dans l’app Activités', r.offer && r.vertical === 'EVENEMENTS' && r.card, r.title);
  const res = await f.evaluate(() => {
    const A = window.__auto, g = window.__game;
    const p = g.player, t = g.truck, tp = p.transport, h = g.mainHorse;
    const before = g.save.data.money;
    g.missions.accept('event:concours');
    const run = g.missions.active;
    const log = [];
    let result = null;
    const off = g.bus.on('mission:complete', ({ result: rr }) => (result = rr));
    let failed = null;
    const off2 = g.bus.on('mission:fail', () => (failed ||= 'fail'));
    // Motif d'échec exact (la carte d'échec s'affiche après l'événement).
    const origFail = g.screens.missionFailed;
    g.screens.missionFailed = function (reason, ...rest) { failed = reason; return origFail.call(this, reason, ...rest); };
    let last = -1, same = 0;
    for (let i = 0; i < 4000 && g.missions.active === run && !result && !failed; i++) {
      if (run.i !== last) {
        last = run.i;
        same = 0;
        log.push(`${run.i}: ${run.step?.kind || 'custom'} — ${run.text()}`);
      } else if (++same > 300) break;
      const s = run.step;
      const txt = run.text();
      if (g.hud.dialogActive) g.hud.advanceDialog();
      else if (document.querySelector('.overlay .btn.primary')) A.closeCards();
      else if (/Échauffe/.test(txt)) {
        A.ensureMode('ride');
        for (const o of g.obstacles.ofCourse('warmup')) A.jumpObstacle(o);
      } else if (/Selle et monte/.test(txt)) A.mount();
      else A.solveStep(run);
      A.tick(2);
    }
    off();
    off2();
    A.closeCards();
    return { ok: !!result, failed, title: result?.title, body: result?.body, pay: result?.pay, stars: result?.stars, rank: run.data.rank, moneyDelta: g.save.data.money - before, log, active: !!g.missions.active };
  });
  check('concours terminé (classement, dotation)', res.ok && res.rank >= 1, `${res.title} · ${res.body} · ${res.pay} € · ★${res.stars}`);
  if (!res.ok) console.log(`   ${res.failed || ''}\n   ${res.log.join('\n   ')}`);
  check('étapes : chargement, trajet, déchargement, dossard, échauffement, parcours', ['tload', 'tdrive', 'tunload', 'interact', 'course'].every((k) => res.log.some((l) => l.includes(k))), res.log.length + ' étapes');
  await render(f);
  await page.screenshot({ path: `${OUT}/concours-end.png` });
  // Règles FEI : temps dépassé = 1 point par seconde entamée, 2e refus = élimination.
  const fei = await f.evaluate(async () => {
    const m = await import('/src/gameplay/trip.js');
    const def = m.competitionDef(3, 15);
    const field = m.simulateField(def.cls, 123);
    const ranked = m.rankResults(field);
    const sorted = ranked.every((x, i) => i === 0 || ranked[i - 1].faults < x.faults || (ranked[i - 1].faults === x.faults && ranked[i - 1].time <= x.time));
    return { sorted, n: field.length, allMult: field.every((x) => Number.isInteger(x.faults)) };
  });
  check('classement barème A (points puis chrono)', fei.sorted && fei.n >= 10 && fei.allMult);
  await ctx.close();
}

// ---------- 3. Vrais touchers ----------
async function touchFlow(W, H, embedded) {
  const tag = `${W}x${H}${embedded ? '-emb' : ''}`;
  const { ctx, page, f } = await openGame({ W, H, embedded, touch: true });
  const cdp = await ctx.newCDPSession(page);
  const wait = (ms) => page.waitForTimeout(ms);
  const offset = embedded ? await page.evaluate(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { x: r.left, y: r.top }; }) : { x: 0, y: 0 };
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x + offset.x, y: y + offset.y, id: 1 }] });
  async function tapSel(sel) {
    const rc = await f.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el || el.classList.contains('hide')) return null;
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hit: !!hit && (hit === el || el.contains(hit)) };
    }, sel);
    if (!rc) return { found: false };
    await touch('touchStart', rc.x, rc.y);
    await wait(70);
    await touch('touchEnd', 0, 0);
    await wait(60);
    await f.evaluate(() => window.__auto.tick(2));
    return { found: true, hit: rc.hit };
  }
  const label = (sel) => f.evaluate((s) => { const el = document.querySelector(s); return el && !el.classList.contains('hide') ? el.querySelector('span')?.textContent : null; }, sel);
  // Près de la tête du cheval, derrière le camion.
  await f.evaluate(() => {
    const g = window.__game, A = window.__auto;
    const p = g.player, t = g.truck, h = g.mainHorse;
    const rear = t.rearPoint({ x: 0, y: 0, z: 0 }, 1.0);
    h.setPosition(rear.x + Math.cos(t.heading) * 3.5, rear.z - Math.sin(t.heading) * 3.5, t.heading + Math.PI);
    p.human.setPosition(h.pos.x + Math.sin(h.heading) * 1.6, h.pos.z + Math.cos(h.heading) * 1.6, h.heading + Math.PI);
    g.cam.snap(p.human.pos, p.human.heading);
    A.tick(4);
  });
  check(`[${tag}] bouton secondaire « Mener en main »`, (await label('.btn-action2')) === 'Mener en main');
  let t = await tapSel('.btn-action2');
  check(`[${tag}] toucher « Mener en main »`, t.hit && (await f.evaluate(() => window.__game.player.transport.leading)));
  await render(f);
  await page.screenshot({ path: `${OUT}/touch-${tag}-1-lead.png` });
  // Joystick : quelques pas vers l'arrière du camion (le cheval suit).
  const p0 = await f.evaluate(() => ({ ...window.__game.player.human.pos }));
  await touch('touchStart', 110, H - 90);
  for (let k = 1; k <= 5; k++) {
    await touch('touchMove', 110, H - 90 - k * 8);
    await wait(20);
  }
  await f.evaluate(() => window.__auto.tick(45));
  await touch('touchEnd', 0, 0);
  const p1 = await f.evaluate(() => ({ ...window.__game.player.human.pos }));
  check(`[${tag}] joystick : le joueur marche avec son cheval`, Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.8);
  // À l'arrière : ouvrir, faire monter, fermer.
  await f.evaluate(() => {
    const g = window.__game, A = window.__auto;
    const p = g.player, t = g.truck;
    const rear = t.rearPoint({ x: 0, y: 0, z: 0 }, 1.0);
    p.human.setPosition(rear.x, rear.z, t.heading);
    A.tick(30);
  });
  check(`[${tag}] action « Ouvrir la rampe »`, (await label('.btn-action')) === 'Ouvrir la rampe');
  t = await tapSel('.btn-action');
  check(`[${tag}] toucher « Ouvrir la rampe »`, t.hit);
  await f.evaluate(() => window.__auto.tick(30 * 4));
  await f.evaluate(() => {
    const g = window.__game, A = window.__auto;
    const p = g.player, t = g.truck;
    const foot = t.rearPoint({ x: 0, y: 0, z: 0 }, 2.6);
    p.human.setPosition(foot.x, foot.z, t.heading);
    A.tick(30);
  });
  check(`[${tag}] action « Faire monter le cheval »`, (await label('.btn-action')) === 'Faire monter le cheval');
  t = await tapSel('.btn-action');
  check(`[${tag}] toucher « Faire monter le cheval »`, t.hit && (await f.evaluate(() => !!window.__game.player.transport.seq)));
  await f.evaluate(() => { for (let i = 0; i < 30 * 5; i++) window.__auto.tick(1); });
  await render(f);
  await page.screenshot({ path: `${OUT}/touch-${tag}-2-loading.png` });
  await tickUntil(f, '!g.player.transport.seq', 30 * 60);
  await f.evaluate(() => {
    const g = window.__game, A = window.__auto;
    const p = g.player, t = g.truck;
    const foot = t.rearPoint({ x: 0, y: 0, z: 0 }, 2.6);
    p.human.setPosition(foot.x, foot.z, t.heading);
    A.tick(10);
  });
  check(`[${tag}] action « Fermer la rampe »`, (await label('.btn-action')) === 'Fermer la rampe');
  t = await tapSel('.btn-action');
  await f.evaluate(() => window.__auto.tick(30 * 4));
  check(`[${tag}] rampe fermée, cheval à bord`, await f.evaluate(() => window.__game.truck.rampClosed && window.__game.player.transport.isAboard(window.__game.mainHorse)));
  // Au volant au doigt : joystick vers le haut puis vers le bas.
  await f.evaluate(() => {
    const g = window.__game, A = window.__auto;
    const p = g.player, t = g.truck;
    const d = t.doorPoint(1, { x: 0, y: 0, z: 0 });
    p.human.setPosition(d.x, d.z, t.heading);
    A.tick(4);
  });
  check(`[${tag}] action « Conduire »`, (await label('.btn-action')) === 'Conduire');
  t = await tapSel('.btn-action');
  check(`[${tag}] au volant`, await f.evaluate(() => window.__game.player.mode === 'drive'));
  await touch('touchStart', 110, H - 90);
  for (let k = 1; k <= 4; k++) {
    await touch('touchMove', 110, H - 90 - k * 9);
    await wait(20);
  }
  await f.evaluate(() => window.__auto.tick(30 * 5));
  const v = await f.evaluate(() => window.__game.truck.speed * 3.6);
  await render(f);
  await page.screenshot({ path: `${OUT}/touch-${tag}-3-driving.png` });
  const hud = await f.evaluate(() => ({ gear: document.querySelector('.gear').textContent, speed: document.querySelector('.speed').textContent, comfort: document.querySelector('.comfort').textContent }));
  for (let k = 0; k <= 9; k++) {
    await touch('touchMove', 110, H - 90 + k * 8);
    await wait(15);
  }
  // Freinage jusqu'à l'arrêt (maintenu plus longtemps, le joystick passerait en marche arrière).
  await f.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 30 * 8 && Math.abs(g.truck.speed) > 0.15; i++) window.__auto.tick(1);
  });
  await touch('touchEnd', 0, 0);
  await f.evaluate(() => window.__auto.tick(10));
  const stop = await f.evaluate(() => Math.abs(window.__game.truck.speed));
  check(`[${tag}] joystick : accélère puis freine`, v > 8 && stop < 0.5, `${v.toFixed(0)} km/h · HUD ${hud.gear} ${hud.speed} ${hud.comfort}`);
  check(`[${tag}] HUD : rapport, vitesse, confort`, /^D\d|^R|^N/.test(hud.gear) && /km\/h/.test(hud.speed) && /CONFORT/.test(hud.comfort));
  t = await tapSel('.btn-action');
  check(`[${tag}] toucher « Sortir »`, t.hit && (await f.evaluate(() => window.__game.player.mode === 'foot')));
  await ctx.close();
}
if (parts.includes('touch')) {
  await touchFlow(667, 308, true);
  await touchFlow(844, 390, false);
}

// ---------- 4. Vrai trajet sur les routes, cheval à bord (joystick virtuel) ----------
// Conducteur appliqué : suit l'itinéraire GPS (poursuite pure), ralentit aux carrefours, laisse passer les voitures.
async function driveRoute(f, to, from = null) {
  return f.evaluate(async ([to, from]) => {
    const A = window.__auto, g = window.__game;
    const { PARKS } = await import('/src/gameplay/trip.js');
    const t = g.truck, tp = g.player.transport;
    if (from) t.setPosition(PARKS[from].x, PARKS[from].z, from === 'pole' ? 4.5 : 0.07);
    if (!tp.aboard.length) {
      t.setRampInstant(true);
      tp.loadInstant(g.mainHorse);
      t.setRampInstant(false);
    }
    if (g.player.mode !== 'drive') A.drive();
    const target = PARKS[to];
    g.gps.set(target, 'Parking', { radius: target.r });
    g.gps.updateRoute(true);
    const R0 = (g.gps.route || [[t.pos.x, t.pos.z], [target.x, target.z]]).slice(1);
    R0.unshift([t.pos.x, t.pos.z]);
    // Conduite à droite : l'itinéraire du GPS suit l'axe de la chaussée ; le camion roule sur sa voie (1,3 m à droite
    // de l'axe), sauf au départ et à l'arrivée (aires de stationnement).
    const R = R0.map((p, k) => {
      if (k === 0 || k === R0.length - 1) return p;
      const a = R0[k - 1], b = R0[k + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return [p[0] - (dz / l) * 1.3, p[1] + (dx / l) * 1.3];
    });
    const segLen = [], cum = [0];
    for (let k = 0; k < R.length - 1; k++) {
      segLen.push(Math.hypot(R[k + 1][0] - R[k][0], R[k + 1][1] - R[k][1]));
      cum.push(cum[k] + segLen[k]);
    }
    const total = cum[cum.length - 1];
    const at = (sv) => {
      sv = Math.max(0, Math.min(total, sv));
      let k = 0;
      while (k < segLen.length - 1 && cum[k + 1] < sv) k++;
      const u = segLen[k] > 0 ? (sv - cum[k]) / segLen[k] : 0;
      return [R[k][0] + (R[k + 1][0] - R[k][0]) * u, R[k][1] + (R[k + 1][1] - R[k][1]) * u];
    };
    const corners = [];
    for (let k = 1; k < R.length - 1; k++) {
      const a1 = Math.atan2(R[k][0] - R[k - 1][0], R[k][1] - R[k - 1][1]);
      const a2 = Math.atan2(R[k + 1][0] - R[k][0], R[k + 1][1] - R[k][1]);
      const da = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
      if (da > 0.12) corners.push({ s: cum[k], v: da > 1.2 ? 2.8 : da > 0.6 ? 4.5 : 9 });
    }
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    let sCur = 0, time = 0, bumps = 0, maxKmh = 0, stuck = 0, waitT = 0, goT = 0;
    const onBump = (e) => { bumps++; console.log('BUMP', JSON.stringify({ what: e.what, x: Math.round(e.x), z: Math.round(e.z), v: +e.speed.toFixed(1) })); };
    g.bus.on('truck:bump', onBump);
    tp.comfort = 100;
    for (let i = 0; i < 30 * 240; i++) {
      let bestS = sCur, bd = Infinity;
      for (let k = 0; k < segLen.length; k++) {
        if (cum[k + 1] < sCur - 1 || cum[k] > sCur + 40) continue;
        const ax = R[k][0], az = R[k][1], dx = R[k + 1][0] - ax, dz = R[k + 1][1] - az;
        const u = Math.max(0, Math.min(1, ((t.pos.x - ax) * dx + (t.pos.z - az) * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(ax + dx * u - t.pos.x, az + dz * u - t.pos.z);
        if (d < bd) { bd = d; bestS = cum[k] + segLen[k] * u; }
      }
      sCur = Math.max(sCur, bestS);
      const v = Math.max(0, t.speed);
      const Ld = Math.max(7, Math.min(20, 5 + v * 0.9));
      const look = at(sCur + Ld);
      const alpha = wrap(Math.atan2(look[0] - t.pos.x, look[1] - t.pos.z) - t.heading);
      const dl = Math.max(3, Math.hypot(look[0] - t.pos.x, look[1] - t.pos.z));
      const delta = Math.abs(alpha) > 1.3 ? Math.sign(alpha) * 0.66 : Math.atan((2 * 4.2 * Math.sin(alpha)) / dl);
      const steerIn = Math.max(-1, Math.min(1, -delta / t.sim.steerLimit(Math.abs(t.speed))));
      let vT = 16;
      for (const c of corners) {
        const ds = c.s - sCur;
        if (ds < -6 || ds > 160) continue;
        vT = Math.min(vT, Math.sqrt(c.v * c.v + 2 * 1.4 * Math.max(0, ds - 4)));
      }
      const left = total - sCur;
      vT = Math.min(vT, Math.sqrt(2 * 1.2 * Math.max(0, left - 3)));
      if (Math.abs(alpha) > 0.9) vT = Math.min(vT, 2.5);
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
      const nx = t.pos.x + fx * 4.5, nz = t.pos.z + fz * 4.5;
      for (const c of g.vehicles) {
        if (c === t || c.proxy) continue;
        if (c.parked) continue;
        // Véhicule dans le couloir du camion (qui attend au carrefour, ou traverse en ralentissant) : on freine pour
        // s'arrêter derrière. Recouvrement réel des gabarits (camion 2,5 m, voiture 1,8 m) : une voiture sur la voie
        // d'en face ne bloque pas.
        // Après 3 s d'attente réciproque, on repart (comme un conducteur à qui l'autre laisse le passage) ; un véhicule
        // juste devant (moins de 6 m) reste un obstacle.
        {
          const dx = c.pos.x - nx, dz = c.pos.z - nz;
          const ahead = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
          if (lat < 2.0 && ahead > -1 && ahead < 30 && (goT <= 0 || ahead < 6)) vT = Math.min(vT, Math.sqrt(2 * 2 * Math.max(0, ahead - 3.5)));
        }
        if (Math.abs(c.speed || 0) < 0.8) continue;
        const dx = c.pos.x - nx, dz = c.pos.z - nz;
        const closing = dx * Math.sin(c.heading) + dz * Math.cos(c.heading) < 0;
        // Tourner en coupant la voie d'en face : céder le passage aux véhicules qui arrivent (un camion de 8,5 m met ~4 s
        // à dégager la voie).
        const yieldR = Math.abs(alpha) > 0.25 ? 35 : 16;
        if (goT <= 0 && Math.hypot(dx, dz) < yieldR && dx * fx + dz * fz > -3 && closing) vT = 0;
      }
      if (t.speed < 0.4 && vT < 0.5 && left > 4) waitT += 1 / 30;
      else waitT = 0;
      if (waitT > 3) { goT = 2.5; waitT = 0; }
      if (goT > 0) goT -= 1 / 30;
      const aDes = Math.max(-2.2, Math.min(1.3, (vT - t.speed) * 1.1));
      const thr = vT < 0.3 && t.speed < 0.5 ? 0 : aDes > 0 ? Math.min(0.85, 0.15 + aDes / 1.6) : vT === 0 && t.speed < 0.5 ? -0.2 : Math.max(-0.6, aDes / 6.8 - 0.02);
      g.input.setVirtualMove(steerIn / 1.2, thr / 1.25);
      A.tick(1);
      time += 1 / 30;
      maxKmh = Math.max(maxKmh, t.speed * 3.6);
      const dEnd = Math.hypot(target.x - t.pos.x, target.z - t.pos.z);
      if (Math.abs(t.speed) < 0.3 && left > 4 && vT > 0.5) stuck++; else stuck = 0;
      if (stuck > 30 * 8) break;
      if (dEnd < target.r && Math.abs(t.speed) < 0.3) break;
    }
    g.input.setVirtualMove(0, 0);
    A.tick(10);
    g.bus.off?.('truck:bump', onBump);
    const dEnd = Math.hypot(target.x - t.pos.x, target.z - t.pos.z);
    const h = g.mainHorse;
    return { arrived: dEnd < target.r, dEnd: +dEnd.toFixed(1), time: +time.toFixed(0), km: +(total / 1000).toFixed(2), maxKmh: +maxKmh.toFixed(0), bumps, comfort: +tp.comfort.toFixed(0), aboard: tp.aboard.length, inside: h.hiddenInTruck === true, gear: t.gearLabel };
  }, [to, from]);
}
if (parts.includes('route')) {
  const { ctx, page, f } = await openGame({ W: 960, H: 540 });
  const go = await driveRoute(f, 'pole');
  check('vrai trajet Écurie du Val → parking du Pôle, cheval à bord', go.arrived && go.aboard === 1 && go.inside && go.maxKmh > 45, JSON.stringify(go));
  check('conduite appliquée : aucun choc, confort ≥ 80 %', go.bumps === 0 && go.comfort >= 80, `chocs ${go.bumps} · confort ${go.comfort} %`);
  await render(f);
  await page.screenshot({ path: `${OUT}/route-pole.png` });
  const back = await driveRoute(f, 'home');
  check('retour au Val (demi-tour sur le parking du Pôle)', back.arrived && back.aboard === 1 && back.bumps === 0, JSON.stringify(back));
  const hp = await driveRoute(f, 'pole', 'haras');
  check('Haras de la Pommeraie → Pôle (mission « Transport express »)', hp.arrived && hp.bumps === 0 && hp.time < 170, JSON.stringify(hp));
  await ctx.close();
}

console.log('ERRORS', errors.length ? errors.slice(0, 6).join('\n') : 'none');
console.log(fails ? `ÉCHECS : ${fails}` : 'TRANSPORT OK');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
