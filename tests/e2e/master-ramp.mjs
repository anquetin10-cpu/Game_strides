// AUD-02 — Van Master, pont latéral : cycle complet joué avec les commandes normales (iPhone 13 paysage émulé, tactile,
// rendu logiciel SwiftShader — pas un iPhone réel). Catégorie B du dossier : scénario isolé, mise en place technique
// (joueur et Comète à quelques mètres du van garé, journée), puis uniquement : joystick virtuel (marche, conduite),
// toucher réel sur les boutons ACTION / action secondaire du HUD, touche Échap (pause).
// COR-M01 cycle ouvrir → charger → fermer → monter → rouler → s'arrêter → descendre → ouvrir → décharger (2 fois)
// COR-M02 fermer le pont à vide (cheval en main, puis sans cheval) · COR-M03 double appui (chargement, fermeture)
// COR-M04 pause pendant le chargement et la fermeture · COR-M05 reprise d'une sauvegarde cheval à bord (pont fermé /
// ouvert) · pas de doublon Master / Scania · départ impossible pont ouvert.
// Captures dans tests/e2e/out/master-ramp/. Usage : BASE=http://127.0.0.1:5173 node tests/e2e/master-ramp.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/master-ramp';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok, extra });
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
    g.phone.notify = () => {};
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
    // Utilitaires du test (dans la page) : marche au joystick vers un point (repère du van), état des boutons.
    const T = (window.__t = {});
    T.v = g.van;
    T.loc = (xl, zl) => g.van.groundPoint(xl, zl, { x: 0, y: 0, z: 0 });
    T.walk = (pts, mag = 0.55) => {
      const p = g.player;
      for (const [xl, zl, tol = 0.35] of pts) {
        let n = 0, best = 1e9, stuck = 0;
        for (;;) {
          const w = T.loc(xl, zl);
          const d = Math.hypot(w.x - p.human.pos.x, w.z - p.human.pos.z);
          if (d < tol) break;
          if (d < best - 0.02) (best = d), (stuck = 0);
          else if (++stuck > 90) return { ok: false, at: [xl, zl], d };
          if (n++ > 30 * 40) return { ok: false, at: [xl, zl], d };
          window.__auto.steer(w.x - p.human.pos.x, w.z - p.human.pos.z, d < 1.2 ? 0.3 : mag);
          window.__auto.tick(1);
        }
      }
      window.__auto.releaseInput();
      window.__auto.tick(3);
      return { ok: true };
    };
    T.btn = () => {
      const a = document.querySelector('.btn-action:not(.hide) span')?.textContent || '';
      const b = document.querySelector('.btn-action2:not(.hide) span')?.textContent || '';
      return { a, b };
    };
    T.comete = () => g.horses.filter((h) => (h.def?.id || h.id) === (g.mainHorse.def?.id || g.mainHorse.id)).length;
    T.state = () => {
      const v = g.van, L = g.vanLoading, h = g.mainHorse;
      return { side: v.sideDoor.target, t: +v.sideDoor.t.toFixed(2), aboard: L.isAboard(h), busy: L.busy, led: g.player.transport.led?.horse === h, scania: g.player.transport.isAboard(h), mode: g.player.mode, copies: T.comete() };
    };
  });
};
// Toucher réel sur un bouton du HUD, puis une image de jeu (l'appui est lu par la boucle).
const tap = async (sel) => {
  const r = await E((sel) => {
    const el = document.querySelector(`${sel}:not(.hide)`);
    if (!el) return null;
    const R = el.getBoundingClientRect();
    return { x: R.left + R.width / 2, y: R.top + R.height / 2 };
  }, sel);
  if (!r) return false;
  await page.touchscreen.tap(r.x, r.y);
  await E(() => window.__auto.tick(1));
  return true;
};
// Touche le bouton (principal ou secondaire) qui porte ce libellé.
const tapLabel = async (re) => {
  const b = await E(() => window.__t.btn());
  if (re.test(b.a)) return (await tap('.btn-action')) && b.a;
  if (re.test(b.b)) return (await tap('.btn-action2')) && b.b;
  return null;
};
const tapAction = () => tap('.btn-action');
const tapAction2 = () => tap('.btn-action2');
const ticks = (n) => E((n) => window.__auto.tick(n), n);
// Images de la vraie boucle du jeu (game.frame : rien n'avance en pause), rendu compris.
const frames = (n) => E((n) => {
  const g = window.__game;
  let now = g.last || performance.now();
  for (let i = 0; i < n; i++) g.frame((now += 1000 / 30));
}, n);
const until = (fn, max = 30 * 40) => E(([fn, max]) => {
  const f = new Function(`return (${fn})`)();
  let n = 0;
  while (!f() && n++ < max) window.__auto.tick(1);
  return n <= max;
}, [fn.toString(), max]);
const btn = () => E(() => window.__t.btn());
const st = () => E(() => window.__t.state());
const shot = async (name) => {
  await E(() => {
    const g = window.__game;
    g.renderer.render(g.scene, g.camera);
  });
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80, timeout: 120000 }).catch((e) => console.log('capture', name, e.message.split('\n')[0]));
};

await boot();
// Mise en place : Comète au pied de la zone, joueur à côté ; pont fermé ; van garé à l'arrêt.
let r = await E(() => {
  const g = window.__game, A = window.__auto, v = g.van, p = g.player, h = g.mainHorse, T = window.__t;
  A.foot();
  if (g.vanLoading.isAboard(h)) g.vanLoading.unloadInstant(h);
  if (p.transport.isAboard(h)) p.transport.unloadInstant?.(h);
  v.setPartsInstant(false, false);
  const a = T.loc(-6.5, 1.2), b = T.loc(-6.5, 2.4);
  h.setPosition(b.x, b.z, v.heading);
  h.ai = null;
  p.human.setPosition(a.x, a.z, v.heading + Math.PI / 2);
  g.cam.yaw = v.heading - Math.PI / 2;
  A.tick(10);
  return { ...T.state(), btn: T.btn() };
});
// Prendre Comète en main (action normale : bouton « Mener en main »).
const leadLabel = await tapLabel(/^Mener en main/);
r = await st();
check('COR-M00', 'mise en place : Comète prise en main par le bouton ACTION', r.led && r.copies === 1, `« ${leadLabel} » → ${JSON.stringify(r)}`);

const cycle = async (k) => {
  const id = `COR-M01.${k}`;
  // 1. Au pied du pont (joystick), ouvrir.
  let w = await E(() => window.__t.walk([[-3.4, 0.6]]));
  let b = await btn();
  // (cycle suivant : le pont est resté ouvert après le déchargement ; on le ferme puis on le rouvre, cheval en main)
  if (b.b === 'Fermer le pont latéral') {
    await tapAction2();
    await until(() => window.__game.van.closed, 150);
    b = await btn();
  }
  check(`${id}a`, 'marche au pied du pont (cheval en main), ACTION « Ouvrir le pont latéral »', w.ok && b.a === 'Ouvrir le pont latéral', `${JSON.stringify(w)} ${JSON.stringify(b)}`);
  await tapAction();
  await until(() => window.__game.van.sideOpen, 120);
  // 2. Faire monter (et double appui pendant la séquence).
  b = await btn();
  const loadLabel = b;
  await tapAction();
  const s1 = await st();
  await tapAction();
  await tapAction2();
  const s2 = await st();
  if (k === 1) {
    // COR-M04 : pause pendant le chargement (Échap), la séquence ne progresse pas, puis reprise.
    await ticks(40);
    await page.keyboard.press('Escape');
    await frames(1);
    const paused = await E(() => window.__game.state);
    const before = await E(() => ({ i: window.__game.vanLoading.seq?.i, x: window.__game.mainHorse.pos.x, z: window.__game.mainHorse.pos.z }));
    await frames(60);
    const during = await E(() => ({ i: window.__game.vanLoading.seq?.i, x: window.__game.mainHorse.pos.x, z: window.__game.mainHorse.pos.z }));
    const resumed = await E(() => {
      const b = [...document.querySelectorAll('.overlay button')].find((x) => /Reprendre/.test(x.textContent));
      if (!b) return false;
      window.__auto.tap(b);
      window.__auto.tick(1);
      return window.__game.state === 'play';
    });
    const moved = Math.hypot(during.x - before.x, during.z - before.z);
    check('COR-M04a', 'pause pendant le chargement : séquence figée, reprise au même point', paused === 'paused' && moved < 0.01 && during.i === before.i && resumed, JSON.stringify({ paused, moved: +moved.toFixed(3), i: [before.i, during.i], resumed }));
  }
  await until(() => !window.__game.vanLoading.busy, 30 * 40);
  await ticks(20);
  const s3 = await st();
  b = await btn();
  check(`${id}b`, 'chargement par « Faire monter Comète » (un seul cheval, pas de doublon)', /^Faire monter/.test(loadLabel.a) && s1.busy && s2.busy && s3.aboard && !s3.scania && s3.copies === 1, JSON.stringify({ loadLabel, s3 }));
  check(`${id}c`, 'cheval à bord, pont ouvert : ACTION « Fermer le pont latéral » et action secondaire « Faire descendre Comète »', b.a === 'Fermer le pont latéral' && /^Faire descendre/.test(b.b), JSON.stringify(b));
  if (k === 1) await shot('1-cheval-a-bord-deux-actions');
  // Départ pont ouvert : impossible (monter côté conducteur avant de fermer).
  if (k === 1) {
    w = await E(() => window.__t.walk([[-3.4, 4.6], [3.2, 4.6], [1.9, 1.6, 0.3]]));
    b = await btn();
    await tapAction();
    await until(() => window.__game.player.mode === 'drive', 30 * 12);
    const blocked = await E(() => {
      const g = window.__game, v = g.van, A = window.__auto;
      const x0 = v.pos.x, z0 = v.pos.z;
      for (let i = 0; i < 75; i++) {
        g.input.setVirtualMove(0, 0.8);
        A.tick(1);
      }
      A.releaseInput();
      return { d: Math.hypot(v.pos.x - x0, v.pos.z - z0), hint: document.querySelector('.hint')?.textContent || '' };
    });
    check('COR-M01.0', 'pont ouvert, cheval à bord : le van ne part pas (message)', blocked.d < 0.2 && /Pont latéral/.test(blocked.hint), `« ${b.a} » ${JSON.stringify(blocked)}`);
    b = await btn();
    await tapAction();
    await until(() => window.__game.player.mode === 'foot', 30 * 12);
    w = await E(() => window.__t.walk([[3.2, 4.6], [-3.4, 4.6], [-3.4, 0.6]]));
  }
  // 3. Fermer le pont (sans faire descendre) ; double appui pendant la fermeture.
  await tapAction();
  const c1 = await st();
  await tapAction();
  await tapAction2();
  const c2 = await st();
  if (k === 1) {
    await ticks(10);
    await page.keyboard.press('Escape');
    await frames(1);
    const t0 = (await st()).t;
    await frames(40);
    const t1 = (await st()).t;
    const resumed = await E(() => {
      const b = [...document.querySelectorAll('.overlay button')].find((x) => /Reprendre/.test(x.textContent));
      b && window.__auto.tap(b);
      window.__auto.tick(1);
      return window.__game.state === 'play';
    });
    check('COR-M04b', 'pause pendant la fermeture : pont figé, reprise', t0 > 0 && t0 < 1 && t1 === t0 && resumed, JSON.stringify({ t0, t1, resumed }));
  }
  await until(() => window.__game.van.closed, 150);
  const c3 = await st();
  check(`${id}d`, 'fermeture du pont, Comète reste à bord ; double appui sans effet (ni réouverture, ni déchargement)', c1.side === 0 && c2.side === 0 && c2.aboard && c3.aboard && c3.side === 0 && c3.t === 0 && !c3.busy && c3.copies === 1, JSON.stringify({ c1, c2, c3 }));
  // 4. Monter côté conducteur (contour par l'avant), rouler, s'arrêter, descendre.
  w = await E(() => window.__t.walk([[-3.4, 4.6], [3.2, 4.6], [1.9, 1.6, 0.3]]));
  b = await btn();
  await tapAction();
  const drove = await until(() => window.__game.player.mode === 'drive', 30 * 12);
  const run = await E(() => {
    const g = window.__game, v = g.van, A = window.__auto;
    const x0 = v.pos.x, z0 = v.pos.z;
    for (let i = 0; i < 120; i++) {
      g.input.setVirtualMove(0, 0.7);
      A.tick(1);
    }
    let n = 0;
    while (Math.abs(v.speed) > 0.05 && n++ < 200) {
      g.input.setVirtualMove(0, -0.6);
      A.tick(1);
    }
    A.releaseInput();
    A.tick(15);
    return { d: Math.hypot(v.pos.x - x0, v.pos.z - z0), stopped: v.stopped };
  });
  const sDrive = await st();
  check(`${id}e`, 'monter (« Monter »), rouler, s\'arrêter : Comète voyage dans le van', w.ok && /^Monter/.test(b.a) && drove && run.d > 5 && run.stopped && sDrive.aboard && sDrive.copies === 1, JSON.stringify({ w, b: b.a, run, sDrive }));
  if (k === 1) await shot('2-trajet-cheval-a-bord');
  b = await btn();
  await tapAction();
  await until(() => window.__game.player.mode === 'foot' && !window.__game.player.boarding.active, 30 * 12);
  // 5. Retour au pont, ouvrir : à l'arrivée, ACTION « Faire descendre », secondaire « Fermer le pont ».
  w = await E(() => window.__t.walk([[3.2, 4.6], [-3.4, 4.6], [-3.4, 0.6]]));
  const ob = await btn();
  await tapAction();
  await until(() => window.__game.van.sideOpen, 120);
  b = await btn();
  check(`${id}f`, 'descendre (« Descendre »), retour au pont, ouverture : ACTION « Faire descendre », secondaire « Fermer le pont »', w.ok && ob.a === 'Ouvrir le pont latéral' && /^Faire descendre/.test(b.a) && b.b === 'Fermer le pont latéral', JSON.stringify({ w, ob, b }));
  // 6. Faire descendre (cycle 1 : ACTION ; cycle 2 : par l'action secondaire après un aller-retour fermer / ouvrir).
  if (k === 2) {
    await tapAction2(); // fermer depuis la secondaire
    await until(() => window.__game.van.closed, 150);
    const sc = await st();
    await tapAction();
    await until(() => window.__game.van.sideOpen, 120);
    check('COR-M02a', 'action secondaire « Fermer le pont » à l\'arrivée : fermé sans décharger, rouvert', sc.side === 0 && sc.aboard, JSON.stringify(sc));
  }
  await tapAction();
  await until(() => !window.__game.vanLoading.busy, 30 * 40);
  await ticks(10);
  const u = await st();
  check(`${id}g`, 'déchargement : Comète descend et revient en main (un seul exemplaire)', !u.aboard && u.led && !u.scania && u.copies === 1, JSON.stringify(u));
};
await cycle(1);
await cycle(2);

// COR-M02 : fermer le pont à vide, cheval en main (action secondaire) puis sans cheval (ACTION).
let b = await btn();
const ledClose = b;
await tapAction2();
await until(() => window.__game.van.closed, 150);
let s = await st();
check('COR-M02b', 'cheval en main au pied du pont ouvert : secondaire « Fermer le pont latéral » (van vide)', ledClose.b === 'Fermer le pont latéral' && s.side === 0 && s.led && !s.aboard, JSON.stringify({ ledClose, s }));
await tapAction(); // rouvrir (« Ouvrir le pont latéral » : ACTION principale avec le cheval en main)
await until(() => window.__game.van.sideOpen, 120);
await E(() => {
  // Lâcher Comète (action secondaire du transport, loin du pont), revenir les mains libres.
  window.__t.walk([[-6.5, 1.2]]);
});
const rel = await tapLabel(/^Lâcher/);
await E(() => window.__t.walk([[-3.4, 0.6]]));
b = await btn();
await tapAction();
await until(() => window.__game.van.closed, 150);
s = await st();
check('COR-M02c', 'sans cheval, pont ouvert vide : ACTION « Fermer le pont latéral »', !!rel && b.a === 'Fermer le pont latéral' && s.side === 0 && !s.led && !s.aboard, JSON.stringify({ rel, b, s }));

// COR-M05 : reprise de sauvegarde, cheval à bord (pont fermé), puis pont ouvert.
await E(() => {
  const g = window.__game, h = g.mainHorse, T = window.__t;
  g.player.transport.lead(h);
  T.walk([[-3.4, 0.6]]);
});
await tapAction();
await until(() => window.__game.van.sideOpen, 120);
await ticks(3);
await tapAction();
await until(() => !window.__game.vanLoading.busy, 30 * 40);
await ticks(5);
await tapAction();
await until(() => window.__game.van.closed, 150);
s = await st();
await E(() => window.__game.saveNow());
const saved = await E(() => JSON.parse(JSON.stringify(window.__game.save.data.van)));
await boot();
r = await st();
check('COR-M05a', 'reprise : Comète dans le van (pont fermé), ni dans le Scania ni en double', s.aboard && r.aboard && r.side === 0 && !r.scania && r.copies === 1, JSON.stringify({ saved, r }));
await E(() => window.__t.walk([[-6.5, 1.2], [-3.4, 0.6]]));
await ticks(3);
await tapAction();
await until(() => window.__game.van.sideOpen, 120);
await E(() => window.__game.saveNow());
await boot();
await E(() => window.__t.walk([[-6.5, 1.2], [-3.4, 0.6]]));
b = await btn();
r = await st();
check('COR-M05b', 'reprise pont ouvert, cheval à bord : les deux actions proposées (fermer / faire descendre)', r.aboard && r.side === 1 && r.copies === 1 && b.a === 'Fermer le pont latéral' && /^Faire descendre/.test(b.b), JSON.stringify({ r, b }));
await tapAction();
await until(() => window.__game.van.closed, 150);
r = await st();
check('COR-M05c', 'fermeture après reprise : van prêt à partir, Comète à bord', r.aboard && r.side === 0 && r.t === 0, JSON.stringify(r));
// Porte arrière (sellerie) : toujours proposée derrière le van.
await E(() => window.__t.walk([[-3.4, 4.6], [-2.6, -4.2], [0, -4.4]]));
b = await btn();
check('COR-M06', 'derrière le van : ACTION « Ouvrir la porte arrière »', b.a === 'Ouvrir la porte arrière', JSON.stringify(b));
// Remise en état : Comète hors du van (partie de test laissée propre).
await E(() => {
  const g = window.__game;
  g.vanLoading.unloadInstant(g.mainHorse);
  g.van.setPartsInstant(false, false);
  g.saveNow();
});
check('erreurs', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
import('node:fs').then((fs) => fs.writeFileSync(`${OUT}/resultats.json`, JSON.stringify(results, null, 1)));
console.log(fails ? `${fails} échec(s)` : 'tout est vert');
await browser.close();
process.exit(fails ? 1 : 0);
