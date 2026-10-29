// Cadrage de la caméra de concours en iPhone 13 émulé (844 × 390) : part de la hauteur de l'écran occupée par le
// couple cheval-cavalier et position verticale, mesurées sur 6 instants d'un vrai parcours (ligne droite, courbe,
// abord, saut, réception). Projection des boîtes englobantes du cheval et du cavalier.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const res = await page.evaluate(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  const O = await import('/src/gameplay/obstacles.js');
  const V = g.camera.position.constructor; // THREE.Vector3
  A.mount();
  g.player.horse.setPosition(O.CSO_GATE.x, O.CSO_GATE.z + 4, Math.PI);
  g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
  A.tick(6);
  A.tap(document.querySelector('.overlay [data-id="enter"]'));
  A.tick(80);
  const line = O.CSO_LINE;
  const S = O.CSO_START;
  const h = g.player.horse;
  h.setPosition(S.x, S.z + 3, line[0].h);
  g.cam.snap(h.pos, line[0].h);
  const frame = () => {
    // Silhouette du couple : sabots, croupe, tête du cheval (encolure tendue), casque du cavalier (2,55 m).
    const f = { x: Math.sin(h.heading), z: Math.cos(h.heading) };
    const y0 = h.groundY + (h.jumpY || 0);
    const pts = [[0, 0, 0], [-1.25, 1.55, 0], [1.35, 2.05, 0], [0, 2.55, 0], [0.9, 0, 0], [-1.0, 0, 0]].map(([a, y, c]) => new V(h.pos.x + f.x * a, y0 + y, h.pos.z + f.z * a).project(g.camera));
    const ys = pts.map((p) => (1 - p.y) / 2); // 0 = haut de l'écran, 1 = bas
    const top = Math.max(0, Math.min(...ys)), bot = Math.min(1, Math.max(...ys));
    return { part: +(bot - top).toFixed(2), top: +top.toFixed(2), bottom: +bot.toFixed(2), jump: h.jumpT >= 0 };
  };
  const out = [];
  let k = 0;
  const marks = new Set([40, 120, 200, 280, 360, 440]);
  for (let i = 0; i < 460; i++) {
    // Suivi de la ligne du tracé (pilotage du test), appel automatique dans la bonne zone.
    let best = k, bd = 1e9;
    for (let j = k; j < Math.min(line.length, k + 60); j++) { const d = Math.hypot(line[j].x - h.pos.x, line[j].z - h.pos.z); if (d < bd) { bd = d; best = j; } }
    k = best;
    const t = line[Math.min(line.length - 1, k + 12)];
    A.steer(t.x - h.pos.x, t.z - h.pos.z, 0.62);
    const tg = g.obstacles.target(h);
    if (h.jumpT < 0 && tg && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) g.input.pressed.add('jump');
    A.tick(1);
    if (marks.has(i) || (h.jumpT > 0.4 && h.jumpT < 0.45 && out.filter((o) => o.jump).length < 2)) out.push({ i, ...frame() });
  }
  return out;
});
for (const r of res) console.log(`image ${String(r.i).padStart(3)}${r.jump ? ' (saut)' : '       '} : couple sur ${Math.round(r.part * 100)} % de la hauteur, de ${Math.round(r.top * 100)} % à ${Math.round(r.bottom * 100)} % (0 = haut)`);
const parts = res.map((r) => r.part);
const avg = parts.reduce((a, v) => a + v, 0) / parts.length;
// Au galop : couple dans la moitié basse ; pendant le saut (caméra amortie, elle ne suit que 30 % de la hauteur), il
// monte un peu mais reste entièrement à l'écran.
const low = res.filter((r) => !r.jump).every((r) => (r.top + r.bottom) / 2 > 0.55);
const inFrame = res.every((r) => r.top > 0.05 && r.bottom < 0.95);
console.log(`moyenne ${Math.round(avg * 100)} % de la hauteur ; au galop dans le bas de l'écran : ${low ? 'oui' : 'non'} ; toujours entier à l'écran : ${inFrame ? 'oui' : 'non'}`);
console.log(avg > 0.25 && avg < 0.42 && low && inFrame ? 'CADRAGE OK' : 'CADRAGE À REVOIR');
await b.close();
