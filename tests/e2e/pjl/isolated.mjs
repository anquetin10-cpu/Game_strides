// Test isolé du cheval WildMesh (page tests/e2e/pjl/horse.html, sans le jeu) : préparation, longueurs d'os des clips
// en miroir, appuis et main des clips, saut, puis images des allures (main droite / gauche), virage et saut.
// Usage : node tests/e2e/pjl/isolated.mjs <dossier de sortie>    (serveur de développement sur BASE, défaut :5173)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = process.argv[2] || 'tests/e2e/out/pjl';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(`${BASE}/tests/e2e/pjl/horse.html`);
await p.waitForFunction(() => window.__pjl, null, { timeout: 240000 });
const sum = await p.evaluate(() => window.__pjl.summary());
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(sum, null, 1));
console.log('préparation', sum.prepMs, 'ms', JSON.stringify(sum.stats), 'échelle', sum.scale.toFixed(4));
console.log('longueurs (pire rapport os/repos par clip)', JSON.stringify(sum.lengths));
console.log('appuis', JSON.stringify(Object.fromEntries(Object.entries(sum.gaitContacts).map(([k, v]) => [k, v.touch.map((x) => x.toFixed(2)).join('/')]))));
console.log('sauts', JSON.stringify(sum.jumps));
// Séquences : n images à 30 i/s, caméra fixe de profil.
const seq = async (name, set, n, cam, every = 3) => {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = await p.evaluate(([set, i, cam, keep]) => {
      const P = window.__pjl, s = P.state;
      Object.assign(s, typeof set === 'function' ? {} : set);
      if (s._phaseRate) s.phase = (s.phase + s._phaseRate / 30) % 1;
      if (s._jump) { s.jt += 1 / 30; s.mode = s.jt < s.jT ? 'air' : 'ride'; }
      P.step(1 / 30);
      if (keep) P.frame(cam, [0, 0.95, 0]);
      return { h: P.hoofHeights(), L: P.limbLengths() };
    }, [set, i, cam, i % every === 0]);
    rows.push(r);
    if (i % every === 0) await p.screenshot({ path: join(OUT, `${name}-${String(i).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 80, timeout: 120000 });
  }
  return rows;
};
const side = [4.6, 1.3, 0.2];
const out = {};
out.idle = await seq('repos', { gait: 'halt', speed: 0, _phaseRate: 0 }, 6, side);
out.walk = await seq('pas', { gait: 'walk', speed: 1.9, _phaseRate: 1.0 }, 30, side);
out.trot = await seq('trot', { gait: 'trot', speed: 4.0, strideLen: 2.49, _phaseRate: 1.6 }, 24, side);
out.canterR = await seq('galopD', { gait: 'canter', lead: 'R', speed: 6.5, strideLen: 3.42, _phaseRate: 1.85 }, 24, side);
out.canterL = await seq('galopG', { gait: 'canter', lead: 'L', speed: 6.5, strideLen: 3.42, _phaseRate: 1.85 }, 36, side);
out.turnL = await seq('virageG', { gait: 'canter', lead: 'L', speed: 6.5, turnRate: 0.8, roll: -0.35, _phaseRate: 1.85 }, 18, [0.4, 1.4, 5.2]);
// Saut : 0,8 s de vol, départ 0,12 s avant le décollage.
out.jump = await seq('saut', { gait: 'canter', lead: 'R', speed: 7, turnRate: 0, roll: 0, mode: 'air', jt: -0.12, jT: 0.8, _jump: true, _phaseRate: 0 }, 42, side);
// Contrôles : hauteur minimale des sabots au galop (posés au sol), longueurs des postérieurs gauche vs droite.
const minH = (rows, k) => Math.min(...rows.map((r) => r.h[k]));
const maxRatio = (rows) => {
  let w = 1;
  for (const r of rows) for (const [l, rr] of [['upperleg_l', 'upperleg_r'], ['lowerleg_l', 'lowerleg_r'], ['foot_l', 'foot_r'], ['toes_01_l', 'toes_01_r'], ['upperarm_l', 'upperarm_r'], ['lowerarm_l', 'lowerarm_r'], ['hand_l', 'hand_r']]) if (r.L[l] && r.L[rr]) w = Math.max(w, r.L[l] / r.L[rr], r.L[rr] / r.L[l]);
  return +w.toFixed(3);
};
const checks = {};
for (const k of ['walk', 'trot', 'canterR', 'canterL']) checks[k] = { solMin: ['AG', 'AD', 'PG', 'PD'].map((h) => minH(out[k], h)), gaucheDroite: maxRatio(out[k]) };
checks.jump = { gaucheDroite: maxRatio(out.jump), sabotsMaxEnVol: Math.max(...out.jump.slice(5, 25).map((r) => Math.min(r.h.AG, r.h.AD))) };
writeFileSync(join(OUT, 'checks.json'), JSON.stringify(checks, null, 1));
console.log('contrôles', JSON.stringify(checks));
console.log('erreurs', errors.slice(0, 5));
await b.close();
