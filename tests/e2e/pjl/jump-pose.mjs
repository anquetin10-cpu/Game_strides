// Saut en terrain libre, cheval WildMesh monté : mesures image par image (pas de 1/30 s) et vues aux instants clés,
// en profil et en trois-quarts, pour comparer deux versions. Rendu logiciel SwiftShader de Chromium : pas un iPhone.
// Mesures (hypothèses de gameplay, pas mesures biomécaniques) :
//  - sabots AG AD PG PD au-dessus du sol (m) : appel (postérieurs au sol tant qu'ils poussent), vol, réception ;
//  - bascule : angle du dos (bassin → spine_04) avec l'horizontale (° ; > 0 = avant-main plus haute) ;
//  - cavalier : écart bassin du cavalier – siège de la selle (m), angle du buste, pénétration des jambes.
// Cas : « galop » (galop de travail, cas nominal) et « grand-galop » (cas limite, vitesse haute).
// Usage : BASE=http://127.0.0.1:5173 [VIDEO=1] node tests/e2e/pjl/jump-pose.mjs <dossier> [cas=galop,grand-galop] [vues=1]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/pjl-jump';
const CASES = (process.argv[3] || 'galop,grand-galop').split(',');
const SHOTS = process.argv[4] !== '0';
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
  K.step = (n, each) => { for (let i = 0; i < n; i++) { each?.(i); g.update(1 / 30); g.realism.update(); } };
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
  K.measure = () => {
    const h = g.mainHorse, P = h.pjl, V = P.view, hu = g.player.human, body = bodyOf();
    hu.mesh.updateWorldMatrix(true, true);
    P.holder.updateMatrixWorld(true);
    const hooves = ['fingers_02_l', 'fingers_02_r', 'toes_02_l', 'toes_02_r'].map((n) => {
      const p = V.boneWorld(n, new T.Vector3());
      return +(p.y - h.groundAt(p.x, p.z)).toFixed(3);
    });
    const pel = V.boneWorld('pelvis', new T.Vector3()), sp = V.boneWorld('spine_04', new T.Vector3());
    const d = sp.clone().sub(pel);
    const pitch = Math.round((Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI);
    // Siège : point d'assise du cavalier sur la selle (repère de selle du jeu).
    const seat = new T.Vector3();
    if (V.anchorWorld) V.anchorWorld('seat', seat); else V.boneWorld('saddle', seat);
    const hips = W('hips');
    const fw = new T.Vector3(Math.sin(h.heading), 0, Math.cos(h.heading));
    const rel = hips.clone().sub(seat);
    let pen = 0, penAt = null;
    for (const s of ['l', 'r']) {
      const ch = ['Thigh', 'Shin', 'Foot', 'Toe'].map((n) => W(s + n));
      for (let k = 0; k < 3; k++) for (const t of [0.25, 0.5, 0.75, 1]) {
        const dd = depth(ch[k].clone().lerp(ch[k + 1], t), body);
        if (dd > pen) { pen = dd; penAt = s + ['cuisse', 'jambe', 'pied'][k]; }
      }
    }
    const tr = W('neck').sub(hips).normalize();
    return {
      jumpT: +h.jumpT.toFixed(3), jumpY: +(h.jumpY || 0).toFixed(3), speed: +h.speed.toFixed(2), hooves, pitch,
      seatUp: +rel.y.toFixed(3), seatFwd: +rel.dot(fw).toFixed(3),
      trunk: Math.round((Math.acos(Math.max(-1, Math.min(1, tr.y))) * 180) / Math.PI),
      pen: +pen.toFixed(3), penAt, jw: +(V.jumpWeight || 0).toFixed(2), clipT: +(V.jumpTime || 0).toFixed(3),
    };
  };
  // Vue « jeu » : caméra du joueur telle que la simulation l'a placée (aucune surcharge).
  K.gameView = () => {
    g.camera.updateMatrixWorld();
    g.renderer.render(g.scene, g.camera);
  };
  K.cam = (eye, tgt, fov = 38) => {
    const h = g.mainHorse, c = Math.cos(h.heading), s = Math.sin(h.heading), y = h.groundY;
    const Wp = (p) => [h.pos.x + c * p[0] + s * p[2], y + p[1], h.pos.z - s * p[0] + c * p[2]];
    g.camera.position.set(...Wp(eye)); g.camera.fov = fov; g.camera.updateProjectionMatrix();
    g.camera.lookAt(...Wp(tgt)); g.camera.updateMatrixWorld();
    g.sky.follow(g.camera);
    g.world.update(1 / 30, g.camera, g.sky, g.player.focus.pos);
    g.renderer.render(g.scene, g.camera);
  };
  K.VIEW = { profil: [[6.5, 1.5, 0.3], [0, 1.3, 0.3]], troisquarts: [[4.6, 2.0, 4.2], [0, 1.3, 0]] };
  const h = g.mainHorse;
  A.foot();
  h.setPosition(160, g.terrain.waterlineZ(160) + 8, -Math.PI / 2);
  h.inBox = false; h.ai = null;
  window.__zAt = (x) => g.terrain.waterlineZ(x) + 8;
  const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
  g.player.human.setPosition(h.pos.x + lx * 1.4, h.pos.z + lz * 1.4, h.heading + Math.PI);
  K.step(10);
});
// Montée (animation complète), puis quelques secondes en selle.
await E(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  window.__K.step(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
  const g = window.__game;
  for (let i = 0; i < 200 && g.player.horseMount.active; i++) window.__K.step(1);
  window.__K.step(20);
});
const out = { base: BASE, cases: {} };
for (const name of CASES) {
  const gallop = name === 'grand-galop';
  // Élan le long du rivage, cap fixe, puis appui sur « Saut ».
  await E((gallop) => {
    const g = window.__game, A = window.__auto, K = window.__K, h = g.mainHorse;
    // Repartir vers l'est du rivage si l'on approche du bout.
    if (h.pos.x < 40) { h.setPosition(160, window.__zAt(160), -Math.PI / 2); K.step(5); }
    K.step(gallop ? 90 : 70, () => {
      const tx = h.pos.x - 12; A.steer(tx - h.pos.x, window.__zAt(tx) - h.pos.z, gallop ? 1 : 0.8);
      if (gallop) g.input.held.add('gallop'); else g.input.held.delete('gallop');
      h.stamina = h.maxStamina;
    });
    h.control.jump = true;
  }, gallop);
  const rows = [];
  let shotK = 0;
  const marks = [0, 0.1, 0.25, 0.5, 0.75, 0.92, 'land', 'land+0.3'];
  let landF = -1;
  for (let f = 0; f < 70; f++) {
    const r = await E((gallop) => {
      const g = window.__game, A = window.__auto, K = window.__K, h = g.mainHorse;
      K.step(1, () => {
        const tx = h.pos.x - 12; A.steer(tx - h.pos.x, window.__zAt(tx) - h.pos.z, gallop ? 1 : 0.8);
        if (gallop) g.input.held.add('gallop'); else g.input.held.delete('gallop');
      });
      return K.measure();
    }, gallop);
    rows.push(r);
    if (landF < 0 && f > 1 && r.jumpT < 0 && rows[f - 1].jumpT >= 0) landF = f;
    const m = marks[shotK];
    const due = m === undefined ? false : typeof m === 'number' ? r.jumpT >= m : m === 'land' ? landF === f : landF >= 0 && f === landF + 9;
    // VIDEO=1 : une image à chaque pas (1/30 s), vues profil et trois-quarts, pour vidéo à vitesse réelle et au ralenti.
    if (process.env.VIDEO && (r.jumpT >= 0 || (landF >= 0 && f <= landF + 12) || f < 3)) {
      for (const v of ['profil', 'troisquarts']) {
        await E((v) => window.__K.cam(...window.__K.VIEW[v]), v);
        mkdirSync(join(OUT, `video-${name}-${v}`), { recursive: true });
        await page.screenshot({ path: join(OUT, `video-${name}-${v}`, `${String(f).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 82, timeout: 240000 });
      }
    }
    if (SHOTS && due) {
      const tag = typeof m === 'number' ? `t${String(Math.round(m * 100)).padStart(3, '0')}` : m.replace('+', '-');
      // Caméra du jeu d'abord (la vue fixe déplace la caméra ; la simulation la replace à l'image suivante).
      await E(() => window.__K.gameView());
      await page.screenshot({ path: join(OUT, `${name}-jeu-${String(shotK).padStart(2, '0')}-${tag}.jpg`), type: 'jpeg', quality: 82, timeout: 240000 });
      for (const v of ['profil', 'troisquarts']) {
        await E((v) => window.__K.cam(...window.__K.VIEW[v]), v);
        await page.screenshot({ path: join(OUT, `${name}-${v}-${String(shotK).padStart(2, '0')}-${tag}.jpg`), type: 'jpeg', quality: 82, timeout: 240000 });
      }
      shotK++;
    }
    if (landF >= 0 && f > landF + 12) break;
  }
  const air = rows.filter((r) => r.jumpT >= 0);
  const push = air.filter((r) => r.jumpT < 0.12);
  const sum = {
    vitesse: air[0]?.speed, images: air.length,
    // Appel : postérieurs au sol pendant les premières images du vol du jeu (poussée).
    posterieursAppelMax: push.length ? Math.max(...push.map((r) => Math.min(r.hooves[2], r.hooves[3]))) : null,
    anterieursReceptionMin: landF >= 0 ? Math.min(rows[landF - 1].hooves[0], rows[landF - 1].hooves[1]) : null,
    basculeMin: Math.min(...air.map((r) => r.pitch)), basculeMax: Math.max(...air.map((r) => r.pitch)),
    selleEcartMax: Math.max(...rows.map((r) => Math.abs(r.seatUp))), busteMax: Math.max(...rows.map((r) => r.trunk)),
    penetrationMax: Math.max(...rows.map((r) => r.pen)),
  };
  out.cases[name] = { sum, rows, landF };
  console.log(name, JSON.stringify(sum));
}
out.errors = errors;
writeFileSync(join(OUT, 'mesures.json'), JSON.stringify(out, null, 1));
console.log('erreurs', errors.slice(0, 3));
await browser.close();
