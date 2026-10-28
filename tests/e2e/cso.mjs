// Épreuve de CSO complète (Prix STRIDES, parcours du Pôle) jouée avec les commandes tactiles (joystick virtuel et
// bouton SAUT) : présentation et plan, annonce, cloche, chrono à la ligne de départ, tour sans faute, bilan et
// classement, Recommencer ; appels bons et mauvais, oxer, double, erreurs de parcours, passage à côté ou dans le
// mauvais sens, refus sans pénalités répétées, pause, élimination, entraînement, sauvegarde intacte.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails++;
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 667, height: 308 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop();
  A.closeCards();
  while (g.hud.dialogActive) g.hud.advanceDialog();
  g.missions.abandon?.();
  A.closeCards();
  window.__O = await import('/src/gameplay/obstacles.js');
  // Ligne d'approche (0,5 m entre points) : de l'entrée de piste à la ligne de départ, puis le tracé.
  window.__dense = (pts) => {
    const out = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, c] = [pts[i], pts[i + 1]];
      const n = Math.max(1, Math.round(Math.hypot(c.x - a.x, c.z - a.z) / 0.5));
      for (let k = 0; k < n; k++) out.push({ x: a.x + ((c.x - a.x) * k) / n, z: a.z + ((c.z - a.z) * k) / n });
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const { CSO_START: S, CSO_LINE } = window.__O;
  const A0 = { x: S.x + 33, z: S.z - 12 }; // centre de la carrière
  window.__toStart = window.__dense([
    { x: A0.x, z: A0.z + 21 }, { x: A0.x - 18, z: A0.z + 21 }, { x: A0.x - 27, z: A0.z + 20.5 }, { x: A0.x - 32, z: A0.z + 18 }, { x: S.x, z: S.z + 4 }, { x: S.x, z: S.z },
  ]).concat(CSO_LINE);
  window.__course = () => g.missions.active?.data.course;
  window.__card = () => document.querySelector('.overlay .card')?.textContent || '';
  window.__tapId = (id) => A.tap(document.querySelector(`.overlay [data-id="${id}"]`));
  window.__save0 = JSON.stringify({ completed: g.save.data.completed, challenges: g.save.data.challenges, horses: g.save.data.horses?.length, money: g.save.data.money });
});

// ---------- 1. Présentation, plan, annonce, cloche ----------
let r = await page.evaluate(() => {
  const g = window.__game, A = window.__auto, O = window.__O;
  A.mount();
  const h = g.player.horse;
  h.setPosition(O.CSO_GATE.x, O.CSO_GATE.z + 4, Math.PI);
  h.stamina = h.maxStamina;
  g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
  A.tick(6);
  const pres = window.__card();
  window.__tapId('plan');
  const svg = document.querySelector('.overlay .course-plan');
  const labels = svg ? [...svg.querySelectorAll('text')].map((t) => t.textContent) : [];
  const legend = document.querySelector('.overlay .plan-legend')?.textContent || '';
  window.__tapId('plan-back');
  const back = !!document.querySelector('.overlay [data-id="enter"]');
  window.__tapId('enter');
  A.tick(30);
  const big = document.querySelector('.big-msg .t')?.textContent;
  A.tick(60);
  const bell = document.querySelector('.big-msg .t')?.textContent;
  const board = document.querySelector('.cso-board')?.textContent;
  return { pres, labels, legend, back, big, bell, board, st: { ...window.__course() }, cam: !!g.course?.camera };
});
check('présentation : épreuve, hauteur, cheval engagé, temps accordé', /Prix STRIDES/.test(r.pres) && /1,10 m/.test(r.pres) && /Cheval engagé/.test(r.pres) && /43 s/.test(r.pres), r.pres.slice(0, 160));
check('plan consultable, généré des données (10 obstacles, double 7A–7B, départ, arrivée)', ['1', '2', '3', '4', '5', '6', '7A', '7B', '8', '9', '10', 'Départ', 'Arrivée'].every((l) => r.labels.includes(l)) && /7A vertical · 7B oxer/.test(r.legend), r.legend);
check('retour du plan à la présentation', r.back);
check('annonce du couple à l’entrée en piste', /N° \d+/.test(r.big || ''), r.big);
check('cloche puis 45 s pour franchir la ligne de départ', r.bell === 'CLOCHE' && /Départ 4\d s/.test(r.board || ''), `${r.bell} | ${r.board}`);
check('chrono à l’arrêt tant que la ligne n’est pas franchie, caméra de parcours', !r.st.started && r.st.t === 0 && r.cam);

// ---------- 2. Tour sans faute au joystick et au bouton SAUT ----------
r = await page.evaluate(() => {
  const g = window.__game, A = window.__auto;
  const ev = A.rideLine(window.__toStart, { maxTicks: 3200 });
  for (let i = 0; i < 40 && !document.querySelector('.overlay [data-id="cso-retry"]'); i++) A.tick(1);
  const st = window.__course();
  return { ev: ev.map((e) => `${e.k.split(':')[1]}:${e.label}`), st: { t: st.t, faults: st.faults, timeFaults: st.timeFaults, finished: st.finished, log: st.log.length, attempt: st.attempt }, card: window.__card(), board: document.querySelector('.cso-board')?.className };
});
const order = ['1', '2', '3', '4', '5', '6', '7A', '7B', '8', '9', '10'];
check('tour sans faute : 11 éléments franchis dans l’ordre', JSON.stringify(r.ev) === JSON.stringify(order.map((l) => `clear:${l}`)), JSON.stringify(r.ev));
check('chrono de la ligne de départ à l’arrivée, dans le temps accordé', r.st.finished && r.st.t > 30 && r.st.t < 43 && r.st.faults === 0 && r.st.timeFaults === 0, `${r.st.t.toFixed(2)} s`);
check('bilan : chrono, fautes, pénalités de temps, total, classement, récompense', /Chrono/.test(r.card) && /Fautes aux obstacles/.test(r.card) && /Pénalités de temps/.test(r.card) && /Total/.test(r.card) && /Classement/.test(r.card) && /Récompense/.test(r.card) && /\d+(re|e) sur \d+/.test(r.card), r.card.slice(0, 200));
check('Recommencer, S’entraîner et Quitter proposés', /Recommencer/.test(r.card) && /S’entraîner/.test(r.card) && /Quitter/.test(r.card));

// ---------- 3. Nouvelle tentative : appels mauvais, oxer, double, erreurs de parcours, pause ----------
r = await page.evaluate(() => {
  const g = window.__game, A = window.__auto, O = window.__O;
  window.__tapId('cso-retry');
  A.tick(100);
  const st = window.__course();
  const list = g.obstacles.ofCourse('cso');
  const fresh = st.attempt === 2 && st.faults === 0 && st.next === 1 && !st.started && list.every((o) => !o.knocked);
  // Le cavalier revient à l'entrée de piste avant de repartir vers la ligne de départ.
  g.player.horse.setPosition(O.CSO_GATE.x, O.CSO_GATE.z, Math.PI);
  g.cam.yaw = 0;
  // Départ, puis appel bien trop loin au 1 (vertical) et au 2 (oxer : les deux barres peuvent tomber, une seule faute).
  const ev = A.rideLine(window.__toStart, {
    maxTicks: 1600,
    policy: (tg) => tg && (tg.o.label === '1' || tg.o.label === '2' ? tg.geo.rails[0].x <= 5.4 : tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3),
    until: () => window.__course().next >= 3,
  });
  const o2 = list[1];
  const after2 = { faults: st.faults, log: st.log.map((l) => `${l.kind}:${l.label}:${l.cause || ''}`), oxerRails: o2.rails.filter((m) => m.userData.fall).length };
  // Pause (téléphone ouvert) : chrono et cheval arrêtés ensemble.
  const h = g.player.horse;
  const t0 = st.t, p0 = [h.pos.x, h.pos.z];
  g.phone.open();
  A.tick(45);
  const paused = { dt: st.t - t0, moved: Math.hypot(h.pos.x - p0[0], h.pos.z - p0[1]) };
  g.phone.close();
  A.tick(2);
  // Hors ordre : le 5 sauté alors que le 3 est attendu.
  const next0 = st.next, faults0 = st.faults;
  A.jumpObstacle(list[4]);
  const wrong = { next: st.next, faults: st.faults, toast: document.querySelector('.toasts')?.textContent || '' };
  // Passer à côté du 3 (hors des chandeliers) en appuyant sur SAUT.
  const o3 = list[2];
  h.setPosition(o3.x - o3.n.x * 12 + o3.t.x * (o3.w / 2 + 2.6), o3.z - o3.n.z * 12 + o3.t.z * (o3.w / 2 + 2.6), o3.rot);
  h.speed = 6.5;
  g.cam.yaw = o3.rot + Math.PI;
  for (let i = 0; i < 70; i++) {
    A.steer(o3.n.x, o3.n.z, 0.62);
    if (i % 10 === 5) g.input.pressed.add('jump');
    A.tick(1);
  }
  A.releaseInput();
  const beside = st.next;
  // Le 3 sauté pour de vrai, mais dans le mauvais sens.
  g.obstacles.resetRails('cso');
  h.setPosition(o3.x + o3.n.x * 14, o3.z + o3.n.z * 14, o3.rot + Math.PI);
  h.speed = 6.5;
  g.cam.yaw = o3.rot;
  let jumpedBack = false;
  for (let i = 0; i < 120; i++) {
    A.steer(-o3.n.x, -o3.n.z, 0.62);
    const tg = g.obstacles.target(h);
    if (!jumpedBack && tg && tg.o === o3 && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) {
      g.input.pressed.add('jump');
      jumpedBack = true;
    }
    A.tick(1);
  }
  A.releaseInput();
  const reverse = st.next;
  const faultsNow = st.faults;
  return { fresh, ev: ev.map((e) => `${e.k.split(':')[1]}:${e.label}:${e.cause || ''}`), after2, paused, next0, faults0, wrong, beside, reverse, faultsNow, jumpedBack };
});
check('nouvelle tentative : état neuf, barres remontées', r.fresh);
check('appel bien trop loin : barre au 1 et au 2, cause expliquée', r.ev[0] === 'fault:1:far' && /^fault:2:(far|short)$/.test(r.ev[1]), JSON.stringify(r.ev));
check('oxer : une seule faute même si deux barres tombent', r.after2.faults === 8 && r.after2.log.filter((l) => l.startsWith('rail:2')).length === 1, `${r.after2.faults} pts, ${r.after2.oxerRails} barre(s) au sol au 2`);
check('pause : chrono et cheval arrêtés ensemble', r.paused.dt === 0 && r.paused.moved < 0.01, JSON.stringify(r.paused));
check('hors ordre : non validé, sans pénalité, erreur de parcours signalée', r.wrong.next === r.next0 && r.wrong.faults === r.faults0 && /Erreur de parcours/.test(r.wrong.toast), r.wrong.toast);
check('passage à côté avec SAUT : non validé', r.beside === r.next0);
check('saut dans le mauvais sens : non validé, sans pénalité', r.jumpedBack && r.reverse === r.next0 && r.faultsNow === r.faults0);

// ---------- 4. Double : 7A puis 7B suivis séparément ; refus au 7B → on reprend au 7A ----------
r = await page.evaluate(() => {
  const g = window.__game, A = window.__auto;
  const st = window.__course();
  const list = g.obstacles.ofCourse('cso');
  // Le jury remonte les barres ; on reprend la tentative au 3 jusqu'au 6.
  for (const n of [3, 4, 5, 6]) A.jumpObstacle(list[n - 1]);
  const before = st.next;
  // 7A sauté proprement, puis on approche 7B au pas sans appeler : refus.
  A.jumpObstacle(list[6]);
  const afterA = st.next;
  const h = g.player.horse;
  const o = list[7];
  h.setPosition(o.x - o.n.x * 6, o.z - o.n.z * 6, o.rot);
  g.cam.yaw = o.rot + Math.PI;
  h.speed = 1.9;
  for (let i = 0; i < 150; i++) {
    A.steer(o.n.x, o.n.z, 0.3);
    A.tick(1);
  }
  const refusals = st.refusals, faults = st.faults;
  // Cheval toujours poussé vers l'obstacle : pas de nouvelle pénalité.
  for (let i = 0; i < 90; i++) {
    A.steer(o.n.x, o.n.z, 0.3);
    A.tick(1);
  }
  A.releaseInput();
  return { before, afterA, refusals, faults, refusals2: st.refusals, faults2: st.faults, nextAfterRefusal: st.next, labelNext: list[st.next - 1]?.label, log: st.log.map((l) => `${l.kind}:${l.label}`) };
});
check('double : 7A validé, 7B attendu ensuite', r.afterA === r.before + 1, `${r.before} → ${r.afterA}`);
check('refus au 7B : 4 points, on reprend le double au 7A', r.refusals === 1 && r.labelNext === '7A', JSON.stringify(r.log));
check('cheval arrêté face à l’obstacle : aucune pénalité répétée', r.refusals2 === r.refusals && r.faults2 === r.faults, `${r.refusals2} refus, ${r.faults2} pts`);

// ---------- 5. Deuxième refus : élimination, bilan, entraînement ----------
r = await page.evaluate(async () => {
  const g = window.__game, A = window.__auto;
  const st = window.__course();
  const o = g.obstacles.ofCourse('cso')[st.next - 1];
  const h = g.player.horse;
  h.setPosition(o.x - o.n.x * 6, o.z - o.n.z * 6, o.rot);
  g.cam.yaw = o.rot + Math.PI;
  h.speed = 1.9;
  for (let i = 0; i < 160 && !document.querySelector('.overlay [data-id="cso-train"]'); i++) {
    A.steer(o.n.x, o.n.z, 0.3);
    A.tick(1);
  }
  A.releaseInput();
  const card = window.__card();
  const out = st.eliminated;
  window.__tapId('cso-train');
  A.tick(3);
  await new Promise((res) => setTimeout(res, 500));
  A.tick(3);
  A.closeCards();
  A.tick(30);
  const train = g.missions.active?.def.id;
  const W = (await import('/src/world/sites.js')).POLE.warmup;
  g.player.horse.setPosition(W.x + 6, W.z, Math.PI / 2);
  A.tick(5);
  // Entraînement : un vertical, un oxer ; explication du saut.
  const toasts = [];
  const said = [];
  const orig = g.hud.toast.bind(g.hud);
  g.hud.toast = (t, k) => (said.push(t), orig(t, k));
  const off = g.bus.on('obstacle:clear', () => toasts.push('clear'));
  for (const o2 of g.obstacles.ofCourse('warmup')) A.jumpObstacle(o2);
  off();
  g.hud.toast = orig;
  const lastToast = said.filter((t) => /marge|Barre|Refus/.test(t)).join(' / ');
  g.interact.trigger?.();
  const it = g.interact.current?.label;
  return { card, out, train, toasts, lastToast, it, mission: g.missions.active?.def.id + ':' + g.missions.active?.i + ':' + g.player.mode };
});
check('2e refus : élimination, bilan « Éliminé » avec Recommencer / S’entraîner / Quitter', !!r.out && /Éliminé/.test(r.card) && /Recommencer/.test(r.card), r.out);
check('S’entraîner : entraînement vertical + oxer lancé', r.train === 'cso_warmup', r.train);
check('entraînement : vertical et oxer sautés, chaque saut expliqué (marge ou cause)', r.toasts.length === 2 && (r.lastToast.match(/marge|Barre/g) || []).length >= 2, `${JSON.stringify(r.toasts)} ${r.lastToast} ${r.mission}`);

// ---------- 6. Indépendance à la cadence d'image ----------
r = await page.evaluate(() => {
  const g = window.__game, A = window.__auto;
  g.missions.abandon?.();
  A.closeCards();
  const o = g.obstacles.ofCourse('cso')[0];
  const h = g.player.horse;
  const run = (dt) => {
    g.obstacles.resetRails('cso');
    h._refusal = null;
    h.setPosition(o.x - o.n.x * 14, o.z - o.n.z * 14, o.rot);
    h.speed = 6.5;
    g.cam.yaw = o.rot + Math.PI;
    let m = null;
    const off = g.bus.on('obstacle:clear', (e) => (m = e.margin));
    const off2 = g.bus.on('obstacle:fault', (e) => (m = e.margin));
    let pressed = false;
    for (let i = 0; i < 4 / dt && m === null; i++) {
      A.steer(o.n.x, o.n.z, 0.62);
      const tg = g.obstacles.target(h);
      if (!pressed && tg && tg.geo.rails[0].x <= 3.0) {
        g.input.pressed.add('jump');
        pressed = true;
      }
      g.update(dt);
    }
    off();
    off2();
    A.releaseInput();
    return m;
  };
  return { m30: run(1 / 30), m60: run(1 / 60) };
});
check('franchissement indépendant de la cadence (30 / 60 i/s)', r.m30 !== null && Math.abs(r.m30 - r.m60) < 0.06, `${r.m30?.toFixed(3)} / ${r.m60?.toFixed(3)} m`);

// ---------- 7. Sauvegarde ----------
r = await page.evaluate(() => {
  const g = window.__game;
  g.saveNow();
  const now = JSON.stringify({ completed: g.save.data.completed, challenges: g.save.data.challenges, horses: g.save.data.horses?.length, money: g.save.data.money });
  return { same: now === window.__save0, best: g.save.data.bestTimes.cso_train, settings: g.save.data.settings };
});
check('progression conservée (missions, défis, chevaux, argent)', r.same);
check('réglages d’aide présents (aide au saut, tracé au sol)', r.settings.jumpAid === 'full' && r.settings.courseLine === true, JSON.stringify({ jumpAid: r.settings.jumpAid, courseLine: r.settings.courseLine }));
check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'CSO OK');
await b.close();
process.exit(fails ? 1 : 0);
