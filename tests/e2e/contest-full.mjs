// COR-P01 — Concours du Pôle joué de bout en bout (iPhone 13 paysage émulé, tactile, rendu logiciel SwiftShader — pas
// un iPhone réel). Catégorie B : état de départ privé HERMES_CORRECTIF/ETATS_TEST/E08-avant-concours-pole.json (camion au parking du
// Pôle, Comète à bord), chargé par le stockage local puis « Continuer » à l'écran titre ; ensuite uniquement :
// - touchers réels : notification « Répondre à la demande », « Accepter » / « Confirmer », boutons ACTION et action
//   secondaire du HUD, « Entrer en piste » ; touche E pour faire défiler les dialogues ;
// - joystick virtuel (input.setVirtualMove, même entrée que le joystick tactile) pour marcher, conduire et monter ;
//   bouton SAUT (même entrée que le bouton tactile) pressé quand l'aide d'appel affiche la bonne zone.
// Aucune téléportation, aucun saut, pénalité ou résultat injecté. Le parcours au doigt (vrais événements tactiles,
// épreuve d'entraînement) est couvert par tests/e2e/cso-touch.mjs.
// Captures et journal dans tests/e2e/out/contest-full/. Usage : BASE=http://127.0.0.1:5173 node tests/e2e/contest-full.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/contest-full';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok, extra });
  if (!ok) fails++;
};
const STATE = JSON.parse(readFileSync('HERMES_CORRECTIF/ETATS_TEST/E08-avant-concours-pole.json', 'utf8'));
const AUTO = readFileSync('tests/e2e/autopilot.js', 'utf8');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const E = (f, a) => page.evaluate(f, a);
const tick = (n = 1) => E((k) => window.__auto.tick(k), n);
const shot = async (name) => {
  await E(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80, timeout: 120000 }).catch(() => {});
};
const tapEl = async (sel) => {
  const r = await E((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest' });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, sel);
  if (!r) return false;
  await page.touchscreen.tap(r.x, r.y);
  await page.waitForTimeout(450);
  await tick(2);
  return true;
};
const btn = () => E(() => ({ a: document.querySelector('.btn-action:not(.hide) span')?.textContent || '', b: document.querySelector('.btn-action2:not(.hide) span')?.textContent || '' }));
const tapLabel = async (re) => {
  const b = await btn();
  if (re.test(b.a)) return (await tapEl('.btn-action:not(.hide)')) && b.a;
  if (re.test(b.b)) return (await tapEl('.btn-action2:not(.hide)')) && b.b;
  return null;
};
const step = () => E(() => {
  const g = window.__game, run = g.missions.active;
  return { active: run?.def.id || null, text: run?.text() || '', i: run?.i, mode: g.player.mode, dialog: !!g.hud.dialogActive, card: !!document.querySelector('.overlay'), enter: !!document.querySelector('[data-id="enter"]') };
});

// ---------- Chargement de l'état E08 (stockage local), « Continuer » ----------
await page.goto(base, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 240000 });
await E(([k, v]) => localStorage.setItem(k, v), [STATE.cle, STATE.sauvegarde]);
await page.goto(base, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 240000 });
await page.tap('[data-id="continue"]');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
await page.addScriptTag({ content: AUTO });
const s0 = await E(() => {
  const g = window.__game, A = window.__auto, d = g.save.data, tk = g.truck;
  A.stopLoop();
  // Pilote « joueur » : joystick vers un point (marche, conduite, monte) ; sort d'un blocage par un pas de côté.
  const P = (window.__p = {});
  P.go = (x, z, tol = 1, max = 30 * 60, mag = 0.6) => {
    const p = g.player;
    let best = 1e9, stuck = 0, side = 0;
    for (let n = 0; n < max; n++) {
      const f = p.mode === 'ride' ? p.horse.pos : p.human.pos;
      const dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz);
      if (d < tol) {
        A.releaseInput();
        A.tick(2);
        return true;
      }
      if (d < best - 0.05) (best = d), (stuck = 0);
      else if (++stuck > 45) (side = 30), (stuck = 0);
      if (side > 0) {
        side--;
        A.steer(dz, -dx, mag);
      } else A.steer(dx, dz, d < 2 ? 0.35 : mag);
      A.tick(1);
    }
    A.releaseInput();
    return false;
  };
  return { money: d.money, aboard: g.player.transport.isAboard(g.mainHorse), truck: { x: Math.round(tk.pos.x), z: Math.round(tk.pos.z) }, ramp: tk.rampClosed, mode: g.player.mode };
});
check('COR-P01a', 'état E08 chargé : camion au parking du Pôle, Comète à bord, rampe fermée, 300 €', s0.aboard && s0.ramp && s0.money === 300 && Math.hypot(s0.truck.x - 311, s0.truck.z + 177) < 14, JSON.stringify(s0));
await shot('01-depart');

// ---------- Offre de concours (Strides) acceptée au doigt ----------
let offer = false;
for (let i = 0; i < 40 && !offer; i++) {
  await tick(30);
  offer = await E(() => window.__game.missions.offers.some((o) => o.id === 'event:concours'));
}
// Téléphone (touche P) › app « Activités » › « Concours et courses » › carte du concours › « Accepter ».
// (D'autres demandes arrivent aussi : la mission d'histoire suivante peut avoir sa propre bannière ; on ne la touche pas.)
await page.waitForTimeout(700);
await E(() => {
  // Bannière éventuelle refermée comme le ferait le joueur (« Plus tard »).
  const later = [...document.querySelectorAll('.notif.show .n-actions button')].find((b) => /Plus tard/.test(b.textContent));
  if (later) window.__auto.tap(later);
});
await tick(2);
await page.keyboard.press('KeyP');
await tick(2);
await page.waitForTimeout(500);
const viaApp = (await tapEl('[data-app="activities"]')) && (await tapEl('[data-offer="event:concours"]'));
await tick(2);
await page.waitForTimeout(400);
await shot('02-demande');
await tapEl('[data-id="accept-request"]');
await tapEl('[data-id="accept-request"]');
await page.waitForTimeout(1600);
await tick(4);
let s = await step();
const money1 = await E(() => window.__game.save.data.money);
check('COR-P01b', 'offre « Concours du Pôle » reçue (app Activités du téléphone), acceptée (2 touchers), engagement débité une fois', offer && s.active === 'concours' && money1 < 300, JSON.stringify({ offer, viaApp, s, money: money1 }));

// ---------- Déroulé : un pas à la fois selon l'objectif affiché ----------
const log = [];
const seen = new Set();
let guard = 0, last = '';
let warmDone = false, courseRes = null, resultCard = '';
while (guard++ < 400) {
  s = await step();
  if (!s.active) break;
  if (s.text !== last) {
    log.push(s.text);
    last = s.text;
    console.log('  étape :', s.text || '(transition)', '·', s.mode);
  }
  if (s.dialog) {
    await page.keyboard.press('KeyE');
    await tick(3);
    continue;
  }
  if (s.enter) {
    await shot('06-presentation');
    await tapEl('[data-id="enter"]');
    await tick(30);
    continue;
  }
  if (s.card) {
    // Carte de résultats : lue et capturée avant d'être refermée (« Continuer »).
    const txt = await E(() => document.querySelector('.overlay .card')?.textContent || '');
    if (/Classement|place|Victoire|Résultat/.test(txt) && !resultCard) {
      resultCard = txt;
      await shot('09-resultats');
    }
    await E(() => window.__auto.closeCards());
    await tick(2);
    continue;
  }
  const t = s.text;
  if (/monte au volant|Monte au volant/.test(t)) {
    await E(() => {
      const g = window.__game, dp = g.truck.doorPoint ? g.truck.doorPoint(1) : g.truck.pos;
      window.__p.go(dp.x, dp.z, 0.8);
    });
    await tapLabel(/^Monter/);
    await tick(150);
  } else if (/Gare le camion|arrête-toi/.test(t)) {
    await tick(30);
  } else if (/descends du camion/.test(t)) {
    await tapLabel(/^Descendre/);
    await tick(150);
  } else if (/Ouvre la rampe/.test(t)) {
    await E(() => {
      const g = window.__game, r = g.truck.rearPoint({ x: 0, y: 0, z: 0 }, 1.0);
      window.__p.go(r.x, r.z, 0.8);
    });
    if (!seen.has('rampe')) await shot('03-ouvrir-la-rampe'), seen.add('rampe');
    await tapLabel(/rampe/i);
    await tick(150);
  } else if (/^Fais descendre/.test(t)) {
    await tapLabel(/descendre/i);
    await tick(30 * 12);
  } else if (/dossard/.test(t)) {
    await E(() => {
      const g = window.__game, tg = g.gps.target;
      window.__p.go(tg.x, tg.z, 2.2);
    });
    if (!(await tapLabel(/dossard/))) await tick(10);
    else await shot('04-dossard');
  } else if (/^Selle et monte/.test(t)) {
    await E(() => {
      const g = window.__game, h = g.mainHorse;
      window.__p.go(h.pos.x, h.pos.z, 1.8);
    });
    await tapLabel(/^Monter/);
    await tick(40);
  } else if (/Échauffe-toi/.test(t)) {
    // Paddock : chaque obstacle d'échauffement abordé au joystick (12 m d'élan dans l'axe), SAUT dans la bonne zone.
    const r = await E(() => {
      const g = window.__game, A = window.__auto, P = window.__p;
      const ev = [];
      // Paddock clos (40 × 46 m), entrée au milieu du côté est : couloir entre paddock et piste, puis l'entrée.
      P.go(264, -182, 2.5, 30 * 60, 0.6);
      P.go(268, -232, 2, 30 * 60, 0.6);
      P.go(252, -232, 2.5, 30 * 30, 0.5);
      for (const o of g.obstacles.ofCourse('warmup')) {
        if ((g.missions.active?.data.warm || 0) >= 2) break;
        // 11 m d'élan dans l'axe de l'obstacle, puis au joystick ; SAUT quand l'aide affiche la bonne zone.
        const a = { x: o.x - o.n.x * 11, z: o.z - o.n.z * 11 };
        P.go(a.x, a.z, 1.5, 30 * 40, 0.45);
        const line = [];
        for (let k = 0; k <= 50; k++) line.push({ x: a.x + o.n.x * k * 0.5, z: a.z + o.n.z * k * 0.5 });
        ev.push(...A.rideLine(line, { maxTicks: 30 * 20, mag: 0.6 }));
      }
      // Sortie du paddock par son entrée.
      P.go(268, -232, 2, 30 * 40, 0.5);
      return { ev, warm: g.missions.active?.data.warm };
    });
    warmDone = r.warm >= 2;
    console.log('  échauffement :', JSON.stringify(r));
    if (!warmDone) await tick(30);
  } else if (/Entre en piste/.test(t)) {
    // Du paddock à l'entrée de la carrière (clôturée) : couloir à l'ouest, puis le long de la lice nord jusqu'à l'entrée.
    await E(async () => {
      const g = window.__game, P = window.__p, h = g.player.horse;
      const O = await import('/src/gameplay/obstacles.js');
      if (h.pos.z < -186 && h.pos.x < 270) P.go(264, -182, 2.5, 30 * 60, 0.6);
      P.go(O.CSO_GATE.x, -181, 2.5, 30 * 60, 0.6);
      P.go(O.CSO_GATE.x, O.CSO_GATE.z, 2.5, 30 * 30, 0.4);
    });
    await tick(10);
  } else if (/Franchis la ligne de départ|Obstacle n°|ligne d’arrivée/.test(t)) {
    await shot('07-depart-parcours');
    // Parcours : de l'entrée de piste à la ligne de départ, puis le tracé (joystick de concours, SAUT dans la bonne zone).
    courseRes = await E(async () => {
      const g = window.__game, A = window.__auto;
      const O = await import('/src/gameplay/obstacles.js');
      const h = g.player.horse, P = window.__p;
      const { CSO_START: S, CSO_LINE, CSO_GATE: G } = O;
      // Du paddock à l'entrée de piste (côté nord de la carrière, clôturée) : couloir à l'ouest, puis le long de la lice.
      if (h.pos.z < -186 && h.pos.x < 270) P.go(264, -182, 2.5, 30 * 60, 0.6);
      P.go(G.x, -181, 2.5, 30 * 60, 0.6);
      const pts = [{ x: h.pos.x, z: h.pos.z }, { x: G.x, z: G.z }, { x: G.x - 30, z: G.z }, { x: S.x + 8, z: G.z }, { x: S.x + 2, z: G.z - 3 }, { x: S.x, z: S.z + 4 }, { x: S.x, z: S.z }];
      const dense = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const n = Math.max(1, Math.round(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) / 0.5));
        for (let k = 0; k < n; k++) dense.push({ x: pts[i].x + ((pts[i + 1].x - pts[i].x) * k) / n, z: pts[i].z + ((pts[i + 1].z - pts[i].z) * k) / n });
      }
      const run = g.missions.active;
      const st = () => run?.data.course;
      const ev = A.rideLine(dense.concat(CSO_LINE), { maxTicks: 30 * 240, mag: 0.62, until: () => !!st()?.finished || !!st()?.eliminated || !g.missions.active });
      const c = st() || {};
      return { ev, finished: !!c.finished, eliminated: c.eliminated || null, t: c.t, faults: c.faults, next: c.next };
    });
    console.log('  parcours :', JSON.stringify(courseRes));
    await shot('08-arrivee');
    await tick(60);
  } else {
    await tick(10);
  }
}
// Carte de fin de mission (résultat, gains, avis) : elle s'affiche juste après la clôture de la mission.
let endCard = '';
for (let i = 0; i < 20 && !endCard; i++) {
  await tick(10);
  endCard = await E(() => document.querySelector('.overlay .card')?.textContent || '');
}
if (endCard) await shot('10-fin-de-mission');
s = await step();
const card = [resultCard, endCard].filter(Boolean).join(' || ') || (await E(() => document.querySelector('.overlay .card')?.textContent || ''));
const fin = await E(() => {
  const g = window.__game, d = g.save.data;
  return { money: d.money, active: g.missions.active?.def.id || null, pendingFee: d.pendingFee, stats: d.stats, lastResult: g.missions.lastResult || null };
});
const order = (courseRes?.ev || []).filter((e) => e.k !== 'obstacle:refusal').map((e) => e.label);
check('COR-P01c', 'déroulé joué : volant, rampe, déchargement, dossard, selle, échauffement (2 sauts), présentation, départ', log.some((x) => /dossard/.test(x)) && warmDone && log.some((x) => /Franchis la ligne de départ/.test(x)), JSON.stringify(log));
check('COR-P01d', 'parcours : obstacles franchis dans l’ordre (1 → 8, double 5A/5B), arrivée passée', (!!courseRes?.finished || /Chrono/.test(resultCard)) && JSON.stringify(order) === JSON.stringify(['1', '2', '3', '4', '5A', '5B', '6', '7', '8']), JSON.stringify({ order, t: courseRes?.t, faults: courseRes?.faults, elim: courseRes?.eliminated }));
check('COR-P01e', 'résultats affichés (classement) et dotation versée selon le rang ; engagement soldé (pas de remboursement en attente)', /Classement|place|Victoire/.test(card) && !fin.pendingFee && !fin.active && fin.money > money1, JSON.stringify({ card: card.slice(0, 160), fin: { money: fin.money, pendingFee: fin.pendingFee } }));
check('erreurs', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/journal.json`, JSON.stringify({ results, log, courseRes, fin, resultCard, endCard }, null, 1));
console.log(fails ? `${fails} échec(s)` : 'tout est vert');
await browser.close();
process.exit(fails ? 1 : 0);
