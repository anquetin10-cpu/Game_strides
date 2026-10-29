// « Premiers pas » joué comme un joueur, sans téléportation : nouvelle partie, demande acceptée, marche jusqu'au box de
// Comète (par le pignon ouest de l'écurie), « Sortir du box », sortie en main, ACTION pour monter, joystick au trot
// jusqu'à la carrière, tour dans les anneaux, retour à Camille.
// Vérifie que chaque étape se termine sans blocage (cheval coincé contre une lice, anneau inaccessible) et mesure la
// durée de jeu. Captures dans tests/e2e/out/tuto/.
// Usage : node tests/e2e/tuto-play.mjs [http://127.0.0.1:5173/]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:5173/';
const out = 'tests/e2e/out/tuto';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?autostart`);
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const E = (f, a) => page.evaluate(f, a);
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const shot = async (name) => {
  await E(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
  await page.screenshot({ path: `${out}/${name}.png` });
};

// Nouvelle partie, carte d'accueil, puis la demande « Premiers pas » arrive sur le téléphone et est acceptée.
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  g.startGame(true, { name: 'Alex', avatar: 'f' });
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 10 * 3600;
  A.closeCards();
  for (let i = 0; i < 200 && !g.missions.offers.some((o) => o.id === 'story:tuto'); i++) A.tick(1);
  g.missions.accept('story:tuto');
  A.tick(2);
});
check('mission « Premiers pas » démarrée', await E(() => window.__game.missions.active?.offer.title === 'Premiers pas'));
check('Comète attend dans son box', await E(() => !!window.__game.mainHorse.inBox));
await shot('01-dialogue');

// Boucle de jeu : dialogue → toucher pour avancer ; cible → joystick vers la cible (au trot à cheval) ; bouton ACTION
// quand il propose l'action attendue. Une étape trop longue ou un joueur immobile = échec.
const log = await E(async () => {
  const A = window.__auto, g = window.__game, m = g.missions;
  const steps = [];
  let simT = 0, idx = -1, t0 = 0, still = 0, last = null;
  for (let i = 0; i < 60 * 600 && m.active; i++) {
    const run = m.active, s = run.step;
    if (run.i !== idx) {
      if (idx >= 0) steps[steps.length - 1].s = +(simT - t0).toFixed(1);
      idx = run.i;
      t0 = simT;
      steps.push({ i: idx, kind: s?.kind || 'custom', text: run.text(), s: 0 });
      still = 0;
    }
    if (g.hud.dialogActive) {
      A.releaseInput();
      g.hud.advanceDialog();
    } else if (s?.target) {
      let t = typeof s.target === 'function' ? s.target() : s.target;
      const f = g.player.focus.pos;
      // Écurie du Val : on y entre et on en sort par le pignon ouest (x ≈ -145), le long de l'allée (z = 150).
      const inBarn = (p) => p.x > -145 && p.x < -95 && p.z > 144 && p.z < 156;
      if (inBarn(f) && !inBarn(t)) t = { x: -152, z: 150 };
      else if (!inBarn(f) && inBarn(t) && Math.abs(f.z - 150) > 1.2) t = { x: -149, z: 150 };
      else if (inBarn(t) && inBarn(f) && Math.abs(f.z - 150) > 1.5 && Math.abs(f.x - t.x) > 2) t = { x: t.x, z: 150 };
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      const it = g.interact.current;
      if (it && ['Monter', 'Parler', 'Sortir du box'].includes(it.label) && d < 6) {
        A.releaseInput();
        g.input.pressed.add('action');
      } else A.steer(t.x - f.x, t.z - f.z, g.player.mode === 'ride' ? (d > 25 ? 0.6 : 0.5) : 0.75);
    }
    g.update(1 / 60);
    simT += 1 / 60;
    const f = g.player.focus.pos;
    if (last && Math.hypot(f.x - last.x, f.z - last.z) < 0.004 && !g.hud.dialogActive) still++;
    else still = 0;
    last = { x: f.x, z: f.z };
    if (still > 180 && !g.player.transport?.led) return { steps, stuck: { at: { x: +f.x.toFixed(1), z: +f.z.toFixed(1) }, step: run.text() }, simT };
    if (still > 400) return { steps, stuck: { at: { x: +f.x.toFixed(1), z: +f.z.toFixed(1) }, step: run.text() }, simT };
    if (steps.length === 6 && !window.__ringShot && m.active?.step?.kind === 'rings' && m.active.step.ringState.i === 1) {
      window.__ringShot = true;
      return { steps, pause: 'rings', simT };
    }
  }
  if (steps.length) steps[steps.length - 1].s = +(simT - t0).toFixed(1);
  return { steps, simT, done: !m.active };
});
if (log.pause) {
  await shot('03-anneaux');
}
// Reprise après la capture des anneaux (même boucle).
const log2 = log.pause ? await E(async () => {
  const A = window.__auto, g = window.__game, m = g.missions;
  let simT = 0, still = 0, last = null;
  for (let i = 0; i < 60 * 600 && m.active; i++) {
    const run = m.active, s = run.step;
    if (g.hud.dialogActive) {
      A.releaseInput();
      g.hud.advanceDialog();
    } else if (s?.target) {
      const t = typeof s.target === 'function' ? s.target() : s.target;
      const f = g.player.focus.pos;
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      const it = g.interact.current;
      if (it && it.label === 'Parler' && d < 6) {
        A.releaseInput();
        g.input.pressed.add('action');
      } else A.steer(t.x - f.x, t.z - f.z, 0.5);
    }
    if (run.i >= 7 && !window.__endShot && g.hud.dialogActive) {
      window.__endShot = true;
      return { simT, endDialog: true };
    }
    g.update(1 / 60);
    simT += 1 / 60;
    const f = g.player.focus.pos;
    if (last && Math.hypot(f.x - last.x, f.z - last.z) < 0.004 && !g.hud.dialogActive) still++;
    else still = 0;
    last = { x: f.x, z: f.z };
    if (still > 180) return { stuck: { at: { x: +f.x.toFixed(1), z: +f.z.toFixed(1) }, step: run.text() }, simT };
  }
  return { simT, done: !m.active };
}) : null;
if (log2?.endDialog) {
  await shot('04-camille');
  await E(() => {
    const A = window.__auto, g = window.__game;
    for (let i = 0; i < 600 && g.missions.active; i++) {
      if (g.hud.dialogActive) g.hud.advanceDialog();
      A.tick(1);
    }
  });
}
for (const s of log.steps) console.log(`  étape ${s.i} (${s.kind}) « ${s.text} » : ${s.s} s`);
if (log.stuck || log2?.stuck) console.log('  BLOQUÉ', JSON.stringify(log.stuck || log2.stuck));
check('aucun blocage', !log.stuck && !log2?.stuck);
const total = log.simT + (log2?.simT || 0);
check('durée de jeu courte (< 3 min)', total < 180, `${total.toFixed(0)} s de jeu`);
await page.waitForTimeout(300);
const res = await E(() => ({ active: !!window.__game.missions.active, done: window.__game.save.data.completed.includes('tuto'), money: window.__game.save.data.money, card: document.querySelector('.overlay')?.innerText.slice(0, 160) }));
check('mission terminée, payée', !res.active && res.done && res.money > 0, `${res.money} €`);
await shot('05-resultat');
// Après la fin : la demande suivante (M1) arrive sur le téléphone.
const next = await E(() => {
  const A = window.__auto, g = window.__game;
  A.closeCards();
  for (let i = 0; i < 600 && !g.missions.offers.some((o) => o.id === 'story:m1'); i++) A.tick(1);
  return g.missions.offers.some((o) => o.id === 'story:m1');
});
check('mission suivante proposée (M1)', next);
check('aucune erreur console', !errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `ÉCHECS : ${fails}` : 'TUTO OK');
process.exit(fails ? 1 : 0);
