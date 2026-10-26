// Marée et estran de la plage de Deauvelle : à pleine et basse mer de vives-eaux et de mortes-eaux, mesure le rivage,
// l'excursion de la mer, la marge sous les Planches, la flottaison des bateaux, le galop sur l'estran découvert, la
// sortie de l'eau à marée montante, et joue la mission « Galop sur la plage » à basse et à pleine mer.
// Usage : node tests/e2e/coast.mjs [base]   (par défaut BASE ou http://localhost:5173/)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.argv[2] || process.env.BASE || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`${base.replace(/\/$/, '')}/?autostart`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(async () => {
  window.__auto.stopLoop();
  window.__auto.closeCards();
  const g = window.__game;
  while (g.hud.dialogActive) g.hud.advanceDialog();
  window.__W = await import('/src/world/weather.js');
  window.__S = await import('/src/world/sites.js');
  window.__C = await import('/src/gameplay/courses.js');
});

let fails = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

// Pleines et basses mers de vives-eaux (coefficient maximal) et de mortes-eaux (minimal), de jour.
const tides = await page.evaluate(() => {
  const W = window.__W;
  let ve = null, me = null;
  for (let d = 0; d < 15; d++) {
    const ev = W.tideEvents(d * 24, 24).filter((e) => e.t - d * 24 > 7 && e.t - d * 24 < 19.5);
    for (const e of ev) {
      if (!ve || e.coef > ve.coef) ve = { day: d, coef: e.coef };
      if (!me || e.coef < me.coef) me = { day: d, coef: e.coef };
    }
  }
  const pick = (day, type) => {
    const ev = W.tideEvents(day * 24 - 6, 36).filter((e) => e.type === type);
    // Événement le plus proche de midi (vives-eaux et mortes-eaux reviennent chaque jour vers la même heure).
    ev.sort((a, b) => Math.abs(a.t - day * 24 - 13) - Math.abs(b.t - day * 24 - 13));
    return { t: ev[0].t, level: ev[0].level, coef: ev[0].coef };
  };
  return { vePM: pick(ve.day, 'PM'), veBM: pick(ve.day, 'BM'), mePM: pick(me.day, 'PM'), meBM: pick(me.day, 'BM') };
});

const setTime = (t) => page.evaluate((t) => {
  const g = window.__game;
  g.save.data.gameTime = t * 3600;
  g._tideT = 0;
  g.update(1 / 30);
  return g.tide.level;
}, t);

const XS = [];
for (let x = -380; x <= 580; x += 20) XS.push(x);
const measure = () => page.evaluate((xs) => {
  const g = window.__game;
  const W = window.__W;
  const P = window.__S.TOWN.planches;
  const level = W.TIDE_UNIFORMS.tdLevel.value;
  const line = xs.map((x) => g.terrain.waterlineZ(x));
  let deck = Infinity;
  for (let x = P.x0; x <= P.x1; x += 2) deck = Math.min(deck, g.world.walkHeight(x, P.z));
  let planchesGap = Infinity;
  for (let x = P.x0; x <= P.x1; x += 10) planchesGap = Math.min(planchesGap, P.z - 2 - g.terrain.waterlineZ(x));
  const m = new g.boats._m.constructor();
  const boats = g.boats.boats.map((b, i) => {
    g.boats.mesh.getMatrixAt(i, m);
    const y = m.elements[13];
    const inWorld = Math.abs(b.x) < 600 && b.z > -600;
    return { x: b.x, z: b.z, y, ground: inWorld ? g.terrain.getHeight(b.x, b.z) : -16 };
  });
  return { level, real: W.realTideHeight(level), line, deck, planchesGap, sea: g.world.water.sea.position.y, boats };
}, XS);

const res = {};
for (const [k, ev] of Object.entries(tides)) {
  await setTime(ev.t);
  // Quelques secondes de jeu : bateaux et mer mis à jour.
  await page.evaluate(() => window.__auto.tick(30));
  res[k] = await measure();
  const r = res[k];
  const zs = r.line;
  console.log(`${k} (coef ${ev.coef}) : niveau ${r.level.toFixed(2)} m (hauteur affichée ${r.real.toFixed(2)} m), rivage z de ${Math.min(...zs).toFixed(0)} à ${Math.max(...zs).toFixed(0)} (x = 40 : ${zs[XS.indexOf(40)].toFixed(0)})`);
  check(Math.abs(r.sea - r.level) < 1e-6, `${k} : la mer est au niveau de la marée`);
  check(r.deck - r.level > 0.5, `${k} : Planches hors d'eau`, `platelage à ${(r.deck - r.level).toFixed(2)} m au-dessus de l'eau`);
  check(r.planchesGap > 12, `${k} : au moins 12 m de sable entre les Planches et l'eau`, `${r.planchesGap.toFixed(0)} m`);
  check(Math.min(...zs) > -585, `${k} : rivage dans le monde`, `${Math.min(...zs).toFixed(0)}`);
  const sunk = r.boats.filter((b) => Math.abs(b.y - (r.level - 0.2)) > 0.4 || b.ground > r.level - 2);
  check(!sunk.length, `${k} : ${r.boats.length} bateaux à flot (au mouillage au-delà de la basse mer)`, sunk.length ? JSON.stringify(sunk[0]) : `fond ≤ ${Math.max(...r.boats.map((b) => b.ground)).toFixed(1)} m`);
}
const exc = (a, b) => XS.map((_, i) => res[b].line[i] - res[a].line[i]);
const exVE = exc('veBM', 'vePM'), exME = exc('meBM', 'mePM');
console.log(`marnage vives-eaux ${(res.vePM.level - res.veBM.level).toFixed(2)} m, mortes-eaux ${(res.mePM.level - res.meBM.level).toFixed(2)} m`);
check(res.vePM.level - res.veBM.level > 6.3 && res.vePM.level - res.veBM.level < 8.5, 'marnage de vives-eaux 6,3 – 8,5 m');
check(res.mePM.level - res.meBM.level > 2.5 && res.mePM.level - res.meBM.level < 4.5, 'marnage de mortes-eaux 2,5 – 4,5 m');
check(Math.min(...exVE) >= 75, 'excursion de la mer ≥ 75 m en vives-eaux (plage raccourcie de moitié)', `${Math.min(...exVE).toFixed(0)} – ${Math.max(...exVE).toFixed(0)} m`);
check(Math.min(...exME) > 0.35 * Math.min(...exVE) && Math.max(...exME) < 0.65 * Math.max(...exVE), 'excursion de mortes-eaux ≈ moitié', `${Math.min(...exME).toFixed(0)} – ${Math.max(...exME).toFixed(0)} m`);

// Galop sur l'estran découvert à basse mer de vives-eaux : entre l'eau et le haut de plage, vers l'est.
await setTime(tides.veBM.t);
const gallop = await page.evaluate(() => {
  const g = window.__game, A = window.__auto;
  A.mount();
  const h = g.player.horse;
  const z = g.terrain.waterlineZ(0) + 60;
  h.setPosition(0, z, Math.PI / 2);
  h.speed = 6;
  const x0 = h.pos.x;
  g.input.held.add('gallop');
  let maxDepth = -9, minSpeed = 99;
  for (let i = 0; i < 150; i++) {
    A.steer(1, 0, 1);
    A.tick(1);
    if (i > 60) minSpeed = Math.min(minSpeed, h.speed);
    maxDepth = Math.max(maxDepth, g.terrain.waterDepth(h.pos.x, h.pos.z));
  }
  g.input.held.delete('gallop');
  A.releaseInput();
  return { dist: h.pos.x - x0, minSpeed, maxDepth, z: h.pos.z, ground: g.surfaceAt(h.pos.x, h.pos.z) };
});
check(gallop.dist > 40 && gallop.minSpeed > 6 && gallop.maxDepth < 0, 'galop sur l’estran découvert à basse mer', `${gallop.dist.toFixed(0)} m en 5 s, ≥ ${gallop.minSpeed.toFixed(1)} m/s, sol « ${gallop.ground} » à z = ${gallop.z.toFixed(0)}`);

// Marée montante de vives-eaux : le cheval surpris dans l'eau regagne la plage ; il ne s'enfonce pas au large.
const mid = (tides.veBM.t + tides.vePM.t) / 2;
await setTime(tides.veBM.t < tides.vePM.t ? mid : mid - 6.2);
const escape = await page.evaluate(() => {
  const g = window.__game, A = window.__auto;
  A.mount();
  const h = g.player.horse;
  // Vers le large : refusé au-delà de 1,35 m d'eau.
  h.setPosition(40, g.terrain.waterlineZ(40) - 10, Math.PI);
  h.speed = 4;
  let deepest = 0;
  for (let i = 0; i < 240; i++) {
    A.steer(0, -1, 1);
    A.tick(1);
    deepest = Math.max(deepest, g.terrain.waterDepth(h.pos.x, h.pos.z));
  }
  const stuckZ = h.pos.z;
  // Demi-tour vers la plage (la marée continue de monter pendant ce temps).
  for (let i = 0; i < 300; i++) {
    A.steer(0, 1, 1);
    A.tick(1);
  }
  A.releaseInput();
  return { deepest, stuckZ, depthEnd: g.terrain.waterDepth(h.pos.x, h.pos.z), z: h.pos.z, rising: g.tide.rising };
});
// Limite à 1,35 m d'eau ; le cheval arrêté là voit encore la mer monter de quelques dizaines de centimètres pendant l'essai.
check(escape.deepest < 1.8, 'le cheval ne part pas au large (eau trop profonde refusée)', `profondeur max ${escape.deepest.toFixed(2)} m`);
check(escape.depthEnd < 0.15 && escape.rising, 'marée montante : le cheval regagne le sable sec', `profondeur finale ${escape.depthEnd.toFixed(2)} m à z = ${escape.z.toFixed(0)}`);

// Mission « Galop sur la plage » à basse mer puis à pleine mer de vives-eaux : anneaux sur le sable, près de l'eau.
await page.evaluate(() => {
  const A = window.__auto;
  const orig = A.solveStep;
  A.solveStep = (run) => {
    const s = run.step;
    if (s?.kind === 'rings' && !window.__rings) {
      const g = window.__game;
      // Rivage au passage prévu du cavalier (au galop : ~25 s jusqu'au premier anneau, ~7 s entre deux).
      window.__rings = s.points.map((p, i) => ({ x: p[0], z: p[1], ground: g.terrain.getHeight(p[0], p[1]), level: g.tide.level, water: g.terrain.waterlineZ(p[0]), passing: g.terrain.waterlineZ(p[0], window.__C.beachRingLevel(g, 25 + i * 7)) }));
    }
    return orig(run);
  };
});
for (const k of ['veBM', 'vePM', 'meBM']) {
  await setTime(tides[k].t - 0.3);
  const r = await page.evaluate(() => {
    window.__rings = null;
    const g = window.__game;
    g.save.data.completed = g.save.data.completed.filter((id) => id !== 'plage');
    const res = window.__auto.runStory('plage');
    window.__auto.closeCards();
    return { ok: res.ok, error: res.error || res.failed, rings: window.__rings, completed: res.completed };
  });
  const rings = r.rings || [];
  const dry = rings.every((p) => p.ground > p.level + 0.05);
  // Près de l'eau : à moins de 20 m du rivage au passage prévu, et de 50 m du rivage au départ du galop.
  const near = rings.every((p) => p.z - p.passing < 20 && p.z - p.water < 50);
  console.log(`  anneaux (${k}) : z ${rings.map((p) => p.z.toFixed(0)).join(', ')} ; rivage au départ ${rings.map((p) => p.water.toFixed(0)).join(', ')} ; au passage ${rings.map((p) => p.passing.toFixed(0)).join(', ')}`);
  check(r.ok && rings.length === 7 && dry && near, `mission plage terminée (${k})`, r.ok ? `anneaux sur le sable ${dry ? 'découvert' : 'MOUILLÉ'}, ${near ? 'au bord de l’eau' : 'LOIN de l’eau'}` : `${r.error}`);
}

check(!errors.length, 'aucune erreur dans la console', errors.slice(0, 3).join(' | '));
console.log(fails ? `${fails} échec(s)` : 'coast : tout est bon');
await browser.close();
process.exit(fails ? 1 : 0);
