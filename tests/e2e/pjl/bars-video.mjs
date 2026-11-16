// Vidéos comparables d'un saut de CSO (mêmes conditions que tests/e2e/pjl/bars-check.mjs : même obstacle, même élan,
// appel à la même image, à la même distance de la barre), image par image (pas de 1/30 s), en deux vues : profil fixe
// (perpendiculaire à l'axe de saut) et caméra du jeu. Mesures horodatées incrustées : temps depuis l'appel, progression
// du saut, hauteur de chaque sabot au-dessus de la barre la plus proche (dessus de la barre), barres tombées, jugement.
// Rendu logiciel SwiftShader de Chromium : pas un iPhone.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/pjl/bars-video.mjs <dossier> <cas,…> (ex. o160:6.5:normal)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/bars-video';
const CASES = (process.argv[3] || 'o160:6.5:normal,o145:6.5:tot,v110:6.5:pres').split(',');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const setup = await E(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  g.sky.rain = 0;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
  A.mount();
  g.activities.start(g.activities.defs.find((a) => a.id === 'cso_warmup'));
  A.tick(6); A.closeCards(); A.tick(20); A.closeCards();
  const JM = await import('/src/gameplay/jumpModel.js');
  const W = (await import('/src/world/sites.js')).POLE.warmup;
  const h = g.player.horse;
  h.setPosition(W.x + 6, W.z, Math.PI / 2);
  for (let k = 0; k < 120 && g.course?.controls !== 'cso'; k++) { A.tick(1); A.closeCards(); }
  h.mods.jump = 0.45;
  const specs = [
    { id: 'v110', kind: 'v', h: 1.1 }, { id: 'o100', kind: 'o', h: 1.0, spread: 1.2 },
    { id: 'v140', kind: 'v', h: 1.4 }, { id: 'o145', kind: 'o', h: 1.45, spread: 1.4 },
    { id: 'v160', kind: 'v', h: 1.6 }, { id: 'o160', kind: 'o', h: 1.6, spread: 1.6 },
  ];
  const lane = (x, z) => {
    for (let s = -16; s <= 10; s += 0.5) for (const u of [-1.5, 0, 1.5]) {
      const px = x + s, pz = z + u;
      if (g.colliders.blocked(px, pz, g.terrain.getHeight(px, pz) + 0.3)) return false;
    }
    return true;
  };
  const spots = [];
  for (let x = W.x + 60; x < W.x + 160 && spots.length < specs.length; x += 26) {
    for (let z = W.z - 60; z < W.z + 80 && spots.length < specs.length; z += 14) if (lane(x, z)) spots.push({ x, z });
  }
  const obs = specs.map((sp, i) => g.obstacles.add({ x: spots[i].x, z: spots[i].z, rot: Math.PI / 2, kind: sp.kind, h: sp.h, spread: sp.spread, w: 3.6, course: 'warmup', id: 'test_' + sp.id }));
  document.querySelectorAll('#ui, #touch, .hud, .toast, .toasts').forEach((e) => (e.style.visibility = 'hidden'));
  const ov = document.createElement('div');
  ov.id = '__ov';
  ov.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;font:12px/1.35 monospace;color:#fff;background:rgba(0,0,0,.55);padding:4px 6px;white-space:pre;pointer-events:none';
  document.body.appendChild(ov);
  window.__T = { JM, obs, specs };
  return { controls: g.course?.controls };
});
console.log('setup', JSON.stringify(setup));

for (const c of CASES) {
  const [id, vs, kind] = c.split(':');
  const v = +vs;
  // Distance d'appel : même règle que bars-check.mjs.
  const x = await E(([id, v, kind]) => {
    const g = window.__game, T = window.__T, h = g.player.horse;
    const o = T.obs[T.specs.findIndex((s) => s.id === id)];
    const st = { v, power: h.jumpPower, clearance: h.mods.clearance, cso: true };
    const rows = [];
    for (let x = 0.4; x <= 8; x += 0.02) {
      const first = Math.min(...o.bars.map((b) => b.s));
      const s = first - x;
      const p = T.JM.planJump(st, T.JM.railsAhead(o, o.x + o.n.x * s, o.z + o.n.z * s, o.n.x, o.n.z));
      rows.push({ x: +x.toFixed(2), zone: p.zone, margin: p.margin, gap: Math.abs(p.ideal - p.L) });
    }
    const good = rows.filter((r) => r.zone === 'good'), near = rows.filter((r) => r.zone === 'near'), far = rows.filter((r) => r.zone === 'far');
    return {
      normal: good.length ? good.reduce((a, b) => (b.gap < a.gap ? b : a)).x : null,
      tot: good.length ? Math.max(...good.map((r) => r.x)) : null,
      pres: near.length ? near[Math.floor(near.length / 2)].x : null,
      loin: far.find((r) => r.margin < -0.1)?.x ?? null,
    }[kind];
  }, [id, v, kind]);
  // Préparation du saut (élan, appel à l'image 40), puis images une à une depuis Node.
  await E(([id, v, x]) => {
    const g = window.__game, A = window.__auto, T = window.__T, h = g.player.horse;
    const o = T.obs[T.specs.findIndex((s) => s.id === id)];
    const DT = 1 / 30, REF = 0.4, N = 40;
    g.obstacles._rest(o);
    h._pass = null;
    const first = Math.min(...o.bars.map((b) => b.s));
    const s0 = first - x - v * DT * N - REF;
    h.setPosition(o.x + o.n.x * s0, o.z + o.n.z * s0, o.rot);
    h.ai = null; h.stamina = h.maxStamina; h._refusing = null; h._refusal = null; h._brake = 0; h._rearT = 0;
    const V3 = g.camera.position.constructor;
    const S = (window.__S = { f: 0, N, o, v, ev: [], tPress: null, falls: new Set(), done: false, landedAt: -1, flew: false });
    const offs = [
      g.bus.on('obstacle:clear', (e) => e.obstacle === o && S.ev.push('sans faute')),
      g.bus.on('obstacle:fault', (e) => e.obstacle === o && S.ev.push('faute : ' + (e.causeText || e.cause))),
      g.bus.on('obstacle:refusal', (e) => e.obstacle === o && S.ev.push('refus')),
    ];
    S.off = () => offs.forEach((f) => f());
    const loc = (p) => ({ s: (p.x - o.x) * o.n.x + (p.z - o.z) * o.n.z, y: p.y - o.ground });
    window.__step = () => {
      if (S.f >= 200) return false;
      if (S.f < N) h.speed = v;
      A.steer(o.n.x, o.n.z, 0.95);
      g.input.held.delete('gallop');
      if (S.f === N) { g.input.pressed.add('jump'); S.tPress = g.time; }
      A.tick(1);
      S.f++;
      if (h.jumpT >= 0) S.flew = true;
      if (S.flew && S.landedAt < 0 && h.jumpT < 0) S.landedAt = S.f;
      for (const b of o.bars) if (b.mesh?.userData.fall) S.falls.add(b.s);
      // Sabots : hauteur au-dessus du dessus de la barre la plus proche (le long de l'axe de saut).
      const V = h.pjl.view;
      const lines = [];
      for (const [k, n] of [['AG', 'fingers_end_l'], ['AD', 'fingers_end_r'], ['PG', 'toes_end_l'], ['PD', 'toes_end_r']]) {
        const p = loc(V.boneWorld(n, new V3()));
        const bar = o.bars.reduce((a, b) => (Math.abs(b.s - p.s) < Math.abs(a.s - p.s) ? b : a));
        const d = p.s - bar.s;
        lines.push(`${k} ${d >= 0 ? '+' : ''}${d.toFixed(2)} m  ${(p.y - bar.h - 0.05 >= 0 ? '+' : '') + (p.y - bar.h - 0.05).toFixed(2)} m`);
      }
      const t = S.tPress !== null ? g.time - S.tPress : (S.f - N) / 30;
      document.getElementById('__ov').textContent = `${window.__label}\nt = ${t >= 0 ? '+' : ''}${t.toFixed(3)} s depuis l'appel   saut τ = ${h.jumpT >= 0 ? h.jumpT.toFixed(2) : '—'}\nsabot : distance à la barre la plus proche / hauteur au-dessus de son dessus\n${lines.join('\n')}\nbarres tombées : ${S.falls.size}   ${S.ev.join(', ')}`;
      const sNow = (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
      return !(S.flew && S.landedAt >= 0 && S.f > S.landedAt + 22 && sNow > 5);
    };
    window.__side = () => {
      const C = g.camera;
      // Cadrage : du sol au sommet du saut (≈ 3,5 m), obstacle au centre.
      C.position.set(o.x + o.t.x * 9, o.ground + 2.0, o.z + o.t.z * 9);
      C.fov = 50; C.updateProjectionMatrix();
      C.lookAt(o.x, o.ground + 1.6, o.z);
      C.updateMatrixWorld();
      g.sky.follow(C);
      g.renderer.render(g.scene, C);
    };
    window.__game3 = () => { g.cam.update?.(0, true); };
  }, [id, v, x]);
  const label = `${id} ${v} m/s appel ${kind} (x = ${x} m)`;
  await E((l) => (window.__label = l), label);
  const dirS = join(OUT, `${id}-${v}-${kind}-profil`), dirG = join(OUT, `${id}-${v}-${kind}-jeu`);
  mkdirSync(dirS, { recursive: true });
  mkdirSync(dirG, { recursive: true });
  let k = 0;
  // Élan non filmé jusqu'à 1 s avant l'appel.
  while ((await E(() => window.__S.f)) < 10) await E(() => window.__step());
  while (await E(() => window.__step())) {
    // Caméra du jeu d'abord (la vue de profil la déplace ; le jeu la replace à l'image suivante).
    await E(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
    await page.screenshot({ path: join(dirG, `${String(k).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 84, timeout: 240000 });
    await E(() => window.__side());
    await page.screenshot({ path: join(dirS, `${String(k).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 84, timeout: 240000 });
    k++;
  }
  const res = await E(() => { const S = window.__S; S.off(); window.__auto.releaseInput(); return { ev: S.ev, falls: [...S.falls], frames: S.f }; });
  console.log(label, JSON.stringify(res), `${k} images`);
}
writeFileSync(join(OUT, 'videos.json'), JSON.stringify({ base: BASE, cases: CASES, errors }, null, 1));
console.log('erreurs', errors.slice(0, 3));
await browser.close();
