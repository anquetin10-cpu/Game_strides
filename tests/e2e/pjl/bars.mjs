// Sabots du cheval WildMesh face aux barres de CSO : pour chaque saut, hauteur de chaque sabot au moment où il passe
// le plan de chaque barre du haut (géométrie visible), comparée à la marge du jugement du jeu (trajectoire + repli,
// jumpModel.arcY). Entraînement de CSO du Pôle (commandes de concours : modèle de saut v2), obstacles du paddock et
// obstacles d'essai ajoutés pour ce test (vertical et oxer, 1,10 à 1,60 m). Galop de travail et galop plus rapide,
// appel au cœur de la bonne zone, au début de celle-ci, ou trop près (zone « near » : faute attendue). Rendu logiciel SwiftShader : pas un iPhone.
// Marges visuelles : bas du sabot (articulation du sabot moins son niveau d'appui mesuré au galop) – dessus de la barre
// (centre + rayon 5 cm). Négatif : le sabot visible passe dans la barre.
// Usage : BASE=http://127.0.0.1:5173 [VIDEO=1 VIDEO_CASES=0:6.5:ideal,…] node tests/e2e/pjl/bars.mjs <dossier>
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/pjl-bars';
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
await E(async () => {
  const T = await import('/node_modules/three/build/three.module.js');
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  A.mount();
  // Entraînement de CSO : commandes de concours (modèle de saut v2).
  g.activities.start(g.activities.defs.find((a) => a.id === 'cso_warmup'));
  A.tick(6); A.closeCards(); A.tick(20); A.closeCards();
  const W = (await import('/src/world/sites.js')).POLE.warmup;
  const h = g.player.horse;
  const V = new T.Vector3();
  const HOOVES = { AG: 'fingers_02_l', AD: 'fingers_02_r', PG: 'toes_02_l', PD: 'toes_02_r' };
  // Niveau d'appui de chaque articulation de sabot (au galop, sol plat) : la plus basse sur deux foulées.
  const sole = {};
  h.setPosition(W.x + 8, W.z + 30, 0);
  h.speed = 6.5;
  for (let i = 0; i < 60; i++) {
    A.steer(0, 1, 0.9); A.tick(1);
    for (const [k, n] of Object.entries(HOOVES)) {
      h.pjl.view.boneWorld(n, V);
      const y = V.y - h.groundAt(V.x, V.z);
      sole[k] = Math.min(sole[k] ?? 9, y);
    }
  }
  A.releaseInput();
  // Obstacles d'essai (paddock, hors parcours notés) : vertical et oxer plus hauts.
  const extra = [
    { kind: 'v', h: 1.4, dz: 24 }, { kind: 'o', h: 1.45, spread: 1.4, dz: 40 },
    { kind: 'v', h: 1.6, dz: 56 }, { kind: 'o', h: 1.6, spread: 1.6, dz: 72 },
  ].map((e) => g.obstacles.add({ x: W.x + 30, z: W.z + e.dz, rot: Math.PI / 2, kind: e.kind, h: e.h, spread: e.spread, w: 3.6, course: 'warmup' }));
  // Cheval de concours (test) : puissance suffisante pour 1,45–1,60 m, comme un cheval de Grand Prix du jeu.
  h.mods.jump = Math.max(h.mods.jump, 0.45);
  window.__B = { sole, list: [...g.obstacles.ofCourse('warmup').filter((o) => !extra.includes(o)), ...extra], HOOVES };
});
const sole = await E(() => window.__B.sole);
console.log('niveau d’appui des articulations de sabot (m)', JSON.stringify(sole));
// Un saut : abord perpendiculaire à `speed`, appel selon `when` ('ideal' : cœur de la bonne zone, comme l'aide ;
// 'tot' : première image de la bonne zone). Sabots suivis à chaque image.
const jump = async (i, speed, when) => {
  const vid = VIDEO && VIDEO_CASES.has(`${i}:${speed}:${when}`);
  if (!vid) return jump1(i, speed, when, 0);
  // Vidéo : le saut est joué image par image depuis Node (capture entre deux images).
  const dir = join(OUT, `video-${i}-${speed}-${when}`);
  mkdirSync(dir, { recursive: true });
  await E(() => (window.__frames = []));
  const r = await jump1(i, speed, when, 1);
  let k = 0;
  while (true) {
    const st = await E(() => window.__step());
    if (!st) break;
    await E((i) => window.__side(window.__B.list[i]), i);
    await page.screenshot({ path: join(dir, `${String(k++).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 82, timeout: 240000 });
  }
  return E(() => window.__finish());
};
const jump1 = (i, speed, when, stepwise) => E(([i, speed, when, stepwise]) => {
  const g = window.__game, A = window.__auto, B = window.__B, h = g.player.horse;
  const o = B.list[i];
  const T = h.pjl.view;
  const V = { x: 0, y: 0, z: 0 };
  const vec = new (g.camera.position.constructor)();
  // Barres remontées (API du jeu) avant chaque saut.
  if (o.knocked || o.rebuild) g.obstacles._rest(o);
  o.knocked = false;
  h.setPosition(o.x - o.n.x * 13, o.z - o.n.z * 13, o.rot);
  h.speed = speed * h.speedMul;
  h.stamina = h.maxStamina;
  const loc = (p) => ({ s: (p.x - o.x) * o.n.x + (p.z - o.z) * o.n.z, u: (p.x - o.x) * o.t.x + (p.z - o.z) * o.t.z, y: p.y - o.ground });
  const prev = {};
  const cross = [];
  let judged = null, jumped = false, plan = null, tilt = 0, liftY = 0, pushK = null, pushOff = null;
  const offC = g.bus.on('obstacle:clear', (e) => e.obstacle === o && (judged = { fault: false, margin: e.margin }));
  const offF = g.bus.on('obstacle:fault', (e) => e.obstacle === o && (judged = { fault: true, margin: e.margin, cause: e.cause }));
  let f = 0;
  const step = () => {
    if (f >= 160) return false;
    f++;
    h.ai = null;
    A.steer(o.n.x, o.n.z, 0.95);
    g.input.held.delete('gallop');
    const tg = g.obstacles.target(h);
    if (!jumped && tg && tg.o === o && (when === 'tard' ? tg.plan.zone === 'near' : tg.plan.zone === 'good' && (when === 'tot' || tg.plan.ideal <= tg.plan.L + 0.3))) {
      g.input.pressed.add('jump');
      jumped = true;
      plan = { L: +tg.plan.L.toFixed(2), H: +tg.plan.H.toFixed(2), margin: +tg.plan.margin.toFixed(3), ideal: +tg.plan.ideal.toFixed(2) };
    }
    A.tick(1);
    tilt = Math.max(tilt, h.pjl?._clrA || 0);
    liftY = Math.max(liftY, h.pjl?._clrY || 0);
    if (h.jumpT >= 0 && pushK === null) pushK = h.pjl?._push?.k ?? null, pushOff = h.pjl?.view?.contactOff ?? null;
    for (const [k, n] of Object.entries(B.hooves || B.HOOVES)) {
      T.boneWorld(n, vec);
      const p = loc(vec);
      const q = prev[k];
      if (q) for (const bar of o.bars) {
        if ((q.s - bar.s) * (p.s - bar.s) <= 0 && q.s !== p.s && Math.abs(p.u) < o.w / 2) {
          const t = (bar.s - q.s) / (p.s - q.s);
          const y = q.y + (p.y - q.y) * t - B.sole[k];
          cross.push({ hoof: k, bar: +bar.s.toFixed(2), barH: bar.h, clear: +(y - (bar.h + 0.05)).toFixed(3), jumpT: +h.jumpT.toFixed(3) });
        }
      }
      prev[k] = p;
    }
    const s2 = (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
    // Vidéo : on commence à ~4 m avant l'obstacle.
    return !(jumped && h.jumpT < 0 && s2 > 4);
  };
  const finish = () => {
  offC(); offF();
  A.releaseInput();
  const min = cross.length ? Math.min(...cross.map((c) => c.clear)) : null;
  return { obstacle: `${o.kind === 'o' ? 'oxer' : 'vertical'} ${o.h.toFixed(2)} m`, speed, when, plan, judged, jumped, tiltDeg: Math.round((tilt * 180) / Math.PI), liftY: +liftY.toFixed(2), pushK, pushOff, power: +h.jumpPower.toFixed(2), minVisual: min, knocked: !!o.knocked, cross };
  };
  if (!stepwise) {
    while (step());
    return finish();
  }
  // Pas à pas : approche jusqu'à ~5 m de l'obstacle sans capture, puis une image par appel de __step().
  while (step() && (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z < -5);
  window.__step = step;
  window.__finish = finish;
  return null;
}, [i, speed, when, stepwise]);

// VIDEO=1 : vue de profil fixe (perpendiculaire à l'axe de saut), une image par pas, pour les cas listés dans VIDEO_CASES.
const VIDEO = !!process.env.VIDEO;
const VIDEO_CASES = new Set((process.env.VIDEO_CASES || '0:6.5:ideal,0:6.5:tard,5:6.5:ideal,5:6.5:tot').split(','));
await E(() => {
  const g = window.__game;
  window.__side = (o) => {
    const C = g.camera;
    C.position.set(o.x + o.t.x * 7.5, o.ground + 1.6, o.z + o.t.z * 7.5);
    C.fov = 42; C.updateProjectionMatrix();
    C.lookAt(o.x, o.ground + 1.15, o.z);
    C.updateMatrixWorld();
    g.sky.follow(C);
    g.renderer.render(g.scene, C);
  };
  document.querySelectorAll('#ui, #touch, .hud, .toast, .toasts').forEach((e) => (e.style.visibility = 'hidden'));
});
const n = await E(() => window.__B.list.length);
const res = [];
for (let i = 0; i < n; i++) {
  for (const [speed, when] of [[6.5, 'ideal'], [6.5, 'tot'], [6.5, 'tard'], [8, 'ideal']]) {
    const r = await jump(i, speed, when);
    res.push(r);
    const worst = r.cross.reduce((a, c) => (c.clear < (a?.clear ?? 9) ? c : a), null);
    console.log(`${r.obstacle} · ${speed} m/s · appel ${when}${r.jumped ? '' : ' (pas d’appel : refus)'} : jugement ${r.judged ? (r.judged.fault ? 'faute' : 'sans faute') + ` (marge ${r.judged.margin.toFixed(3)})` : 'aucun'} ; sabot le plus bas ${r.minVisual?.toFixed(3)} m (${worst?.hoof}, τ ${worst?.jumpT}) ; barre tombée ${r.knocked} ; bascule ajoutée max ${r.tiltDeg}° ; relevé max ${r.liftY} m ; appel k ${r.pushK?.toFixed?.(2)} off ${r.pushOff?.toFixed?.(2)}`);
  }
}
writeFileSync(join(OUT, 'barres.json'), JSON.stringify({ base: BASE, sole, res, errors }, null, 1));
console.log('erreurs', errors.slice(0, 3));
await browser.close();
