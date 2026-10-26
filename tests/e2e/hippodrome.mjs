// Hippodrome : le « Tour de l'hippodrome » se joue entièrement sur la piste (anneaux entre les lices, hors des stalles
// de départ, arrivée au poteau) et le Derby se termine. Usage : node tests/e2e/hippodrome.mjs [base]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.argv[2] || process.env.BASE || 'http://127.0.0.1:5173/';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })).newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const r = await page.evaluate(async () => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards();
  const { HIPPO } = await import('/src/world/layout.js');
  const radial = (x, z) => { const lx = x - HIPPO.x, lz = z - HIPPO.z; const cx = Math.max(-HIPPO.half, Math.min(HIPPO.half, lx)); return Math.hypot(lx - cx, lz); };
  const inner = HIPPO.radius - HIPPO.width / 2, outer = HIPPO.radius + HIPPO.width / 2;
  const a = g.activities.list().find((x) => x.id === 'hippo_lap');
  A.mount();
  g.player.horse.setPosition(a.start.x, a.start.z, Math.PI / 2);
  g.save.data.completed.includes('tuto') || g.save.data.completed.push('tuto');
  g.activities.start(a);
  A.tick(5);
  const run = g.missions.active;
  const step = run.steps.find((s) => s.kind === 'rings');
  const pts = step.points;
  const onTrack = pts.every(([x, z]) => radial(x, z) - 3.2 > inner && radial(x, z) + 3.2 < outer);
  const stalls = { x: HIPPO.x - 40, z: HIPPO.z - HIPPO.radius };
  const awayFromStalls = pts.every(([x, z]) => Math.hypot(x - stalls.x, z - stalls.z) > 12);
  const startOnTrack = radial(a.start.x, a.start.z) > inner && radial(a.start.x, a.start.z) < outer && Math.hypot(a.start.x - stalls.x, a.start.z - stalls.z) > 10;
  // Galop réel le long de l'ovale : chaque anneau franchi en restant sur la piste.
  let off = 0, done = false;
  const offDone = g.bus.on('mission:complete', () => (done = true));
  for (let i = 0; i < pts.length && !done; i++) {
    for (let k = 0; k < 900 && step.ringState.i <= i && !done; k++) {
      const h = g.player.horse, p = pts[step.ringState.i] || pts.at(-1);
      A.steer(p[0] - h.pos.x, p[1] - h.pos.z, 0.95);
      g.input.held.add('gallop');
      A.tick(1);
      const rr = radial(h.pos.x, h.pos.z);
      if (rr < inner - 0.5 || rr > outer + 0.5) off++;
    }
  }
  A.tick(6); // le dernier anneau valide l'étape ; la fin de l'activité suit à l'image suivante
  offDone();
  A.releaseInput();
  A.closeCards();
  return { n: pts.length, onTrack, awayFromStalls, startOnTrack, passed: step.ringState.i, done, off, last: pts.at(-1) };
});
check('anneaux du tour entre les deux lices', r.onTrack);
check('aucun anneau dans les stalles de départ', r.awayFromStalls);
check('départ sur la piste, après les stalles', r.startOnTrack);
check('dernier anneau au poteau d’arrivée', Math.abs(r.last[0] - 330) < 1, JSON.stringify(r.last));
check('tour complet au galop, 12 anneaux franchis sans quitter la piste', r.done && r.passed === r.n && r.off === 0, JSON.stringify({ passed: r.passed, off: r.off, done: r.done }));
const d = await page.evaluate(() => window.__auto.runStory('derby'));
check('Derby de la Touques terminé', d.ok, d.error || d.failed || '');
console.log(errors.length ? `ERRORS ${errors.slice(0, 3).join(' | ')}` : 'ERRORS none');
console.log(fails ? `HIPPODROME ${fails} échec(s)` : 'HIPPODROME OK');
process.exitCode = fails || errors.length ? 1 : 0;
await b.close();
