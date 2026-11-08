// Jambes du cavalier et flancs du cheval WildMesh : mêmes situations, mêmes instants, mêmes vues et mêmes mesures, pour
// comparer plusieurs versions (rendu logiciel SwiftShader de Chromium, émulation tactile 844 × 390 : pas un iPhone réel).
// Situations : repos, pas, trot, galop à droite et à gauche, grand galop, virages à gauche et à droite, saut (appel,
// sommet, réception), montée (4 instants), descente (3 instants). Vues : côté gauche, côté droit, face, arrière.
// Mesures (axe des os : cuisse, jambe, pied ; maillage skinné du cheval en pose courante) :
//  - pénétration : plus grande profondeur d'un point dans le corps (six rayons qui rencontrent tous le maillage) ;
//  - écart : distance latérale entre le tibia (genou → cheville) et le flanc, côté gauche et côté droit (plus petite
//    valeur sur l'instant ; « collée sans traverser » : quelques centimètres, jamais négative).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/pjl/legs.mjs <dossier> [vues=gauche,droite,face,arriere]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/pjl-legs';
const VIEWS = (process.argv[3] || 'gauche,droite,face,arriere').split(',');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
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
  const bodyOf = () => {
    const P = g.mainHorse.pjl;
    if (!P) return null;
    let body = null;
    P.view.model.traverse((o) => o.isSkinnedMesh && o.material?.name === 'horse_body' && (body = o));
    body.computeBoundingSphere();
    return body;
  };
  const depth = (q, body) => {
    let d = 9;
    for (const dir of DIRS) {
      ray.set(q, dir);
      ray.far = 1.5;
      const hit = ray.intersectObject(body, false)[0];
      if (!hit) return 0;
      d = Math.min(d, hit.distance);
    }
    return d;
  };
  // Pénétration (m) et écart jambe–flanc (m) de chaque côté.
  K.measure = () => {
    const h = g.mainHorse, P = h.pjl, hu = g.player.human, body = bodyOf();
    if (!body || !hu.mounted && !g.player.horseMount?.active) return null;
    hu.mesh.updateWorldMatrix(true, true);
    P.holder.updateMatrixWorld(true);
    const lat = new T.Vector3(1, 0, 0).transformDirection(P.holder.matrixWorld);
    let pen = 0;
    const gap = { l: 9, r: 9 };
    for (const s of ['l', 'r']) {
      const ch = ['Thigh', 'Shin', 'Foot', 'Toe'].map((n) => hu.bones[s + n].getWorldPosition(new T.Vector3()));
      for (let k = 0; k < 3; k++) for (const t of [0.25, 0.5, 0.75, 1]) pen = Math.max(pen, depth(ch[k].clone().lerp(ch[k + 1], t), body));
      // Tibia : distance au flanc, vers l'axe du cheval (horizontale).
      const sg = s === 'l' ? 1 : -1;
      for (const t of [0.2, 0.4, 0.6, 0.8]) {
        const q = ch[1].clone().lerp(ch[2], t);
        ray.set(q, lat.clone().multiplyScalar(-sg));
        ray.far = 0.6;
        const hit = ray.intersectObject(body, false)[0];
        if (hit) gap[s] = Math.min(gap[s], hit.distance);
      }
    }
    return { pen: +pen.toFixed(3), gapL: gap.l < 9 ? +gap.l.toFixed(3) : null, gapR: gap.r < 9 ? +gap.r.toFixed(3) : null };
  };
  // Caméra dans le repère du cheval : [côté (+ gauche), hauteur, avant] → visée.
  K.cam = (eye, tgt, fov = 34) => {
    const h = g.mainHorse, c = Math.cos(h.heading), s = Math.sin(h.heading), y = h.pos.y; // hauteur du saut comprise
    const W = (p) => [h.pos.x + c * p[0] + s * p[2], y + p[1], h.pos.z - s * p[0] + c * p[2]];
    g.camera.position.set(...W(eye));
    g.camera.fov = fov;
    g.camera.updateProjectionMatrix();
    g.camera.lookAt(...W(tgt));
    g.camera.updateMatrixWorld();
    g.sky.follow(g.camera);
    g.world.update(1 / 30, g.camera, g.sky, g.player.focus.pos);
    g.renderer.render(g.scene, g.camera);
  };
  K.VIEW = { gauche: [[4.2, 1.6, 0.4], [0, 1.25, 0]], droite: [[-4.2, 1.6, 0.4], [0, 1.25, 0]], face: [[0, 1.7, 4.4], [0, 1.3, 0]], arriere: [[0, 1.7, -4.4], [0, 1.3, 0]] };
  const h = g.mainHorse;
  A.foot();
  h.setPosition(160, g.terrain.waterlineZ(160) + 8, -Math.PI / 2);
  h.inBox = false;
  h.ai = null;
  window.__zAt = (x) => g.terrain.waterlineZ(x) + 8;
  const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
  g.player.human.setPosition(h.pos.x + lx * 1.4, h.pos.z + lz * 1.4, h.heading + Math.PI);
  K.step(10);
});
const res = [];
const shoot = async (name) => {
  const m = await E(() => window.__K.measure());
  for (const v of VIEWS) {
    await E((v) => window.__K.cam(...window.__K.VIEW[v]), v);
    await page.screenshot({ path: join(OUT, `${name}-${v}.jpg`), type: 'jpeg', quality: 84, timeout: 240000 });
  }
  res.push({ name, ...m });
  console.log(name, JSON.stringify(m));
};
const pressE = () => E(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  window.__K.step(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
});
// Séquence (montée, descente) : images aux instants voulus ; pénétration maximale sur toute la séquence.
const seq = async (name, marks) => {
  let k = 0, worst = 0;
  for (let f = 0; f < 150; f++) {
    const r = await E(() => {
      const g = window.__game, K = window.__K, M = g.player.horseMount;
      K.step(1);
      return { t: M.t, active: !!M.active, m: K.measure() };
    });
    worst = Math.max(worst, r.m?.pen || 0);
    if (k < marks.length && r.t >= marks[k]) await shoot(`${name}-${marks[k++].toFixed(1)}s`);
    if (!r.active && f > 3) break;
  }
  res.push({ name: `${name}-sequence`, pen: +worst.toFixed(3) });
  console.log(`${name} (séquence entière) pénétration max ${worst.toFixed(3)}`);
};
await pressE();
await seq('montee', [1.0, 1.4, 1.8, 2.2]);
await E(() => window.__K.step(30));
// Allures : cap le long du rivage, ou cercle (virage), mesure sur les 30 dernières images, vues à la fin.
const ride = async (name, mag, ticks, { gallop = false, turn = 0 } = {}) => {
  const m = await E(([mag, ticks, gallop, turn]) => {
    const g = window.__game, A = window.__auto, K = window.__K, h = g.mainHorse;
    let pen = 0, gapL = 9, gapR = 9;
    K.step(ticks, (i) => {
      if (turn) A.steer(Math.sin(h.heading + turn * 0.9), Math.cos(h.heading + turn * 0.9), mag);
      else { const tx = h.pos.x - 12; A.steer(tx - h.pos.x, window.__zAt(tx) - h.pos.z, mag); }
      if (gallop) g.input.held.add('gallop'); else g.input.held.delete('gallop');
      h.stamina = h.maxStamina;
      if (i >= ticks - 30) {
        const r = K.measure();
        if (r) { pen = Math.max(pen, r.pen); if (r.gapL != null) gapL = Math.min(gapL, r.gapL); if (r.gapR != null) gapR = Math.min(gapR, r.gapR); }
      }
    });
    return { gait: h.anim._a?.gait, lead: h.anim._a?.lead, pen: +pen.toFixed(3), gapMinL: gapL < 9 ? +gapL.toFixed(3) : null, gapMinR: gapR < 9 ? +gapR.toFixed(3) : null };
  }, [mag, ticks, gallop, turn]);
  res.push({ name: `${name}-30img`, ...m });
  console.log(`${name} (30 images)`, JSON.stringify(m));
  await shoot(name);
};
await ride('repos', 0, 40);
await ride('pas', 0.3, 60);
await ride('trot', 0.5, 60);
await ride('galop-gauche', 0.8, 70, { turn: 0.35 });
await ride('galop-droite', 0.8, 70, { turn: -0.35 });
await ride('grand-galop', 1, 70, { gallop: true });
await ride('virage-gauche', 0.8, 50, { turn: 1 });
await ride('virage-droite', 0.8, 50, { turn: -1 });
// Saut (terrain libre) : appel, sommet, réception.
await E(() => {
  const g = window.__game, A = window.__auto, K = window.__K, h = g.mainHorse;
  K.step(50, () => { const tx = h.pos.x - 12; A.steer(tx - h.pos.x, window.__zAt(tx) - h.pos.z, 0.8); h.stamina = h.maxStamina; });
  h.control.jump = true;
  K.step(1);
});
for (const [name, until] of [['saut-appel', 0.08], ['saut-sommet', 0.5], ['saut-reception', 0.97]]) {
  await E((until) => { const g = window.__game, K = window.__K, h = g.mainHorse; for (let i = 0; i < 60 && h.jumpT >= 0 && h.jumpT < until; i++) K.step(1); }, until);
  await shoot(name);
}
// Descente (arrêt d'abord).
await E(() => { const g = window.__game, K = window.__K, h = g.mainHorse; g.input.setVirtualMove(0, 0); g.input.held.delete('gallop'); K.step(60, () => (h.speed *= 0.85)); });
await pressE();
await seq('descente', [0.4, 0.8, 1.2]);
writeFileSync(join(OUT, 'mesures.json'), JSON.stringify({ base: BASE, res, errors }, null, 1));
console.log('erreurs', errors.slice(0, 3));
await browser.close();
