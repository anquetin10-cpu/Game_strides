// Montée et descente à cheval (cheval WildMesh) : mesures image par image et vues aux instants clés, pour comparer
// deux versions (rendu logiciel SwiftShader de Chromium : pas un iPhone réel).
// Mesures (repère du cheval) :
//  - cuisse : angle avec la verticale descendante (90° = cuisse à l'horizontale), jambe hors selle et en selle ;
//  - genou dehors : écart latéral genou – hanche vers l'extérieur (« jambes en grenouille ») ;
//  - buste : angle bassin → cou avec la verticale (90° = plié en deux) ;
//  - saut du pied : plus grand déplacement d'un pied d'une image à la suivante (1/30 s) ;
//  - pénétration de la jambe dans le corps du cheval.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/pjl/mount-pose.mjs <dossier> [pas des vues en s, défaut 0.2]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/pjl-mount';
const EVERY = +(process.argv[3] || 0.2);
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
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
  K.step = (n) => { for (let i = 0; i < n; i++) { g.update(1 / 30); g.realism.update(); } };
  const bodyOf = () => {
    let body = null;
    g.mainHorse.pjl.view.model.traverse((o) => o.isSkinnedMesh && o.material?.name === 'horse_body' && (body = o));
    return body;
  };
  const depth = (q, body) => {
    let d = 9;
    for (const dir of DIRS) {
      ray.set(q, dir); ray.far = 1.5;
      const hit = ray.intersectObject(body, false)[0];
      if (!hit) return 0;
      d = Math.min(d, hit.distance);
    }
    return d;
  };
  const W = (n) => g.player.human.bones[n].getWorldPosition(new T.Vector3());
  const prev = {};
  K.measure = () => {
    const h = g.mainHorse, hu = g.player.human, body = bodyOf();
    hu.mesh.updateWorldMatrix(true, true);
    h.pjl.holder.updateMatrixWorld(true);
    const lat = new T.Vector3(1, 0, 0).transformDirection(h.pjl.holder.matrixWorld); // gauche du cheval
    const r = { pen: 0 };
    for (const s of ['l', 'r']) {
      const hip = W(s + 'Thigh'), knee = W(s + 'Shin'), ank = W(s + 'Foot'), toe = W(s + 'Toe');
      const th = knee.clone().sub(hip).normalize();
      r[s + 'Thigh'] = Math.round((Math.acos(Math.max(-1, Math.min(1, -th.y))) * 180) / Math.PI);
      // Extérieur = côté du pied par rapport à l'axe du cheval.
      const side = Math.sign(ank.clone().sub(h.pjl.holder.getWorldPosition(new T.Vector3())).dot(lat)) || 1;
      r[s + 'KneeOut'] = +((knee.clone().sub(hip).dot(lat)) * side).toFixed(3);
      r[s + 'Jump'] = prev[s] ? +ank.distanceTo(prev[s]).toFixed(3) : 0;
      prev[s] = ank.clone();
      const ch = [hip, knee, ank, toe];
      for (let k = 0; k < 3; k++) for (const t of [0.25, 0.5, 0.75, 1]) {
        const d = depth(ch[k].clone().lerp(ch[k + 1], t), body);
        if (d > r.pen) { r.pen = d; r.penAt = s + ['cuisse', 'jambe', 'pied'][k]; }
      }
    }
    const sp = W('neck').sub(W('hips')).normalize();
    r.trunk = Math.round((Math.acos(Math.max(-1, Math.min(1, sp.y))) * 180) / Math.PI);
    r.pen = +r.pen.toFixed(3);
    return r;
  };
  K.cam = (eye, tgt, fov = 40) => {
    const h = g.mainHorse, c = Math.cos(h.heading), s = Math.sin(h.heading), y = h.pos.y;
    const Wp = (p) => [h.pos.x + c * p[0] + s * p[2], y + p[1], h.pos.z - s * p[0] + c * p[2]];
    g.camera.position.set(...Wp(eye)); g.camera.fov = fov; g.camera.updateProjectionMatrix();
    g.camera.lookAt(...Wp(tgt)); g.camera.updateMatrixWorld();
    g.sky.follow(g.camera);
    g.renderer.render(g.scene, g.camera);
  };
  // Vues : trois-quarts arrière gauche (comme la vidéo du joueur) et arrière (jambe droite visible).
  K.VIEW = { 'troisquarts': [[3.4, 1.9, -2.6], [0, 1.2, 0]], arriere: [[0.4, 1.9, -4.6], [0, 1.25, 0]] };
  const h = g.mainHorse;
  A.foot();
  h.setPosition(160, g.terrain.waterlineZ(160) + 8, -Math.PI / 2);
  h.inBox = false; h.ai = null;
  const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
  g.player.human.setPosition(h.pos.x + lx * 1.4, h.pos.z + lz * 1.4, h.heading + Math.PI);
  K.step(10);
});
const pressE = () => E(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  window.__K.step(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
});
const out = {};
const seq = async (name) => {
  const rows = [];
  let next = 0;
  for (let f = 0; f < 200; f++) {
    const r = await E(() => {
      const g = window.__game, K = window.__K, M = g.player.horseMount;
      K.step(1);
      return { t: +(M.t || 0).toFixed(3), active: !!M.active, ...K.measure() };
    });
    rows.push(r);
    if (r.active && r.t >= next) {
      for (const v of Object.keys(await E(() => window.__K.VIEW))) {
        await E((v) => window.__K.cam(...window.__K.VIEW[v]), v);
        await page.screenshot({ path: join(OUT, `${name}-${v}-${next.toFixed(1).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 82, timeout: 240000 });
      }
      next += EVERY;
    }
    if (!r.active && f > 3) break;
  }
  const act = rows.filter((r) => r.active);
  const mx = (k) => Math.max(...act.map((r) => r[k]));
  const sum = {
    images: act.length,
    cuisseMaxG: mx('lThigh'), cuisseMaxD: mx('rThigh'),
    genouDehorsMaxG: mx('lKneeOut'), genouDehorsMaxD: mx('rKneeOut'),
    busteMax: mx('trunk'), sautPiedMax: Math.max(...act.slice(1).map((r) => Math.max(r.lJump, r.rJump))),
    penetrationMax: mx('pen'),
  };
  out[name] = { sum, rows };
  console.log(name, JSON.stringify(sum));
};
await pressE();
await seq('montee');
await E(() => window.__K.step(40));
await pressE();
await seq('descente');
writeFileSync(join(OUT, 'mesures.json'), JSON.stringify({ base: BASE, ...out, errors }, null, 1));
console.log('erreurs', errors.slice(0, 3));
await browser.close();
