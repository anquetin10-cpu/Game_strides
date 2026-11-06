// Jambes du cavalier et flancs du cheval WildMesh : mêmes vues, mêmes instants, même mesure, pour comparer deux versions
// (rendu logiciel SwiftShader de Chromium, émulation tactile 844 × 390 : pas un iPhone réel).
//  - montée au bouton ACTION, côté gauche : images à 1,0 / 1,2 / 1,4 / 1,8 s (pied à l'étrier, poussée, jambe opposée),
//    vue de trois quarts avant et vue de dessus ; descente côté gauche ;
//  - grand galop vu de derrière (les deux chevilles et les flancs) ;
//  - mesure : plus grande profondeur d'un point des cuisses, jambes et pieds dans le corps WildMesh (six rayons qui
//    rencontrent tous le maillage skinné, distance à la surface la plus proche), par phase.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/pjl/legs.mjs <dossier>
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/pjl-legs';
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
const shot = (n) => page.screenshot({ path: join(OUT, `${n}.jpg`), type: 'jpeg', quality: 85, timeout: 240000 });
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await E(async () => {
  const T = await import('/node_modules/three/build/three.module.js');
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  g.sky.rain = 0;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
  document.querySelectorAll('#ui, #touch, .hud, .toast, .toasts').forEach((e) => (e.style.visibility = 'hidden'));
  const ray = new T.Raycaster();
  const DIRS = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((a) => new T.Vector3(...a));
  const K = (window.__K = {});
  K.step = (n, each) => { for (let i = 0; i < n; i++) { each?.(i); g.update(1 / 30); g.realism.update(); } };
  K.depth = () => {
    const h = g.mainHorse, P = h.pjl, hu = g.player.human;
    if (!P) return null;
    let body = null;
    P.view.model.traverse((o) => o.isSkinnedMesh && o.material?.name === 'horse_body' && (body = o));
    body.computeBoundingSphere();
    hu.mesh.updateWorldMatrix(true, true);
    let worst = 0;
    for (const s of ['l', 'r']) {
      const ch = ['Thigh', 'Shin', 'Foot', 'Toe'].map((n) => hu.bones[s + n].getWorldPosition(new T.Vector3()));
      for (let k = 0; k < 3; k++) for (const t of [0.25, 0.5, 0.75, 1]) {
        const q = ch[k].clone().lerp(ch[k + 1], t);
        let d = 9;
        for (const dir of DIRS) {
          ray.set(q, dir);
          ray.far = 1.5;
          const hit = ray.intersectObject(body, false)[0];
          if (!hit) { d = 0; break; }
          d = Math.min(d, hit.distance);
        }
        worst = Math.max(worst, d);
      }
    }
    return worst;
  };
  // Caméra dans le repère du cheval : [côté (+ gauche), hauteur, avant], visée [côté, hauteur, avant].
  K.cam = (eye, tgt, fov = 34) => {
    const h = g.mainHorse, c = Math.cos(h.heading), s = Math.sin(h.heading), y = h.groundY ?? h.pos.y;
    const W = (p) => [h.pos.x + c * p[0] + s * p[2], y + p[1], h.pos.z - s * p[0] + c * p[2]];
    const e = W(eye), t = W(tgt);
    g.camera.position.set(...e);
    g.camera.fov = fov;
    g.camera.updateProjectionMatrix();
    g.camera.lookAt(...t);
    g.camera.updateMatrixWorld();
    g.sky.follow(g.camera);
    g.world.update(1 / 30, g.camera, g.sky, g.player.focus.pos);
    g.renderer.render(g.scene, g.camera);
  };
  const h = g.mainHorse;
  A.foot();
  h.setPosition(160, g.terrain.waterlineZ(160) + 6, -Math.PI / 2);
  h.inBox = false; h.ai = null;
  const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
  g.player.human.setPosition(h.pos.x + lx * 1.4, h.pos.z + lz * 1.4, h.heading + Math.PI);
  K.step(10);
});
const pressE = () => E(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  window.__K.step(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
  return !!window.__game.player.horseMount?.active;
});
const res = { montee: [], descente: [], galop: [] };
// Montée : images aux instants voulus (t de la séquence), mesure à chaque image.
const seq = async (name, marks, rows) => {
  let k = 0;
  for (let f = 0; f < 150; f++) {
    const r = await E(() => {
      const g = window.__game, K = window.__K, M = g.player.horseMount;
      K.step(1);
      return { t: M.t, active: !!M.active, d: K.depth() };
    });
    rows.push(+(r.d || 0).toFixed(3));
    if (k < marks.length && r.t >= marks[k]) {
      await E(() => window.__K.cam([2.2, 1.9, 2.3], [0.1, 1.25, 0]));
      await shot(`${name}-${marks[k].toFixed(1)}s-avant`);
      await E(() => window.__K.cam([0.35, 4.2, 0.25], [0.05, 1.3, 0], 40));
      await shot(`${name}-${marks[k].toFixed(1)}s-dessus`);
      k++;
    }
    if (!r.active && f > 3) break;
  }
};
await pressE();
await seq('montee', [1.0, 1.2, 1.4, 1.8], res.montee);
await E(() => window.__K.step(30));
await pressE();
await seq('descente', [0.4, 0.7, 1.0], res.descente);
// Grand galop vu de derrière.
await E(() => { const A = window.__auto; A.mount(); window.__K.step(20); });
for (let i = 0; i < 4; i++) {
  const d = await E(([i]) => {
    const g = window.__game, A = window.__auto, K = window.__K, h = g.mainHorse;
    let w = 0;
    K.step(i ? 7 : 90, () => {
      const tx = h.pos.x - 12;
      A.steer(tx - h.pos.x, g.terrain.waterlineZ(tx) + 6 - h.pos.z, 1);
      g.input.held.add('gallop');
      h.stamina = h.maxStamina;
    });
    for (let k = 0; k < 6; k++) { K.step(1, () => { g.input.held.add('gallop'); h.stamina = h.maxStamina; }); w = Math.max(w, K.depth() || 0); }
    K.cam([0, 1.45, -3.6], [0, 1.2, 0.4], 30);
    return w;
  }, [i]);
  res.galop.push(+d.toFixed(3));
  await shot(`galop-arriere-${i}`);
}
const max = (a) => Math.max(0, ...a);
const sum = { base: BASE, monteeMax: max(res.montee), descenteMax: max(res.descente), galopMax: max(res.galop), erreurs: errors };
writeFileSync(join(OUT, 'mesures.json'), JSON.stringify({ ...sum, res }, null, 1));
console.log(JSON.stringify(sum));
await browser.close();
