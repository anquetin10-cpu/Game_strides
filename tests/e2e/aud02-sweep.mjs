// AUD-02 — balayage : pont latéral du Master ouvert (ouvert par ACTION), Comète chargée (« Faire monter », séquence
// complète) ; en chaque point au sol accessible autour du van (pas de 0,25 m, point gardé seulement si le joueur peut y
// tenir sans être repoussé par les collisions), actions proposées : bouton ACTION et action secondaire.
// Rendu logiciel, émulation bureau. Même script pour la version auditée et la version corrigée (BASE).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/aud02-sweep.mjs <sortie.json>
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
const out = process.argv[2] || 'tests/e2e/out/aud02-sweep.json';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const r = await page.evaluate(() => {
  const A = window.__auto, g = window.__game, v = g.van, p = g.player, L = g.vanLoading, h = g.mainHorse;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  A.foot();
  const sp = v.sidePoint({ x: 0, y: 0, z: 0 }, 0.2);
  p.human.setPosition(sp.x, sp.z, v.heading + Math.PI / 2); A.tick(2);
  const a1 = g.interact.update()?.label; g.interact.trigger(); A.tick(75);
  const foot = v.sidePoint({ x: 0, y: 0, z: 0 }, 2.4);
  h.setPosition(foot.x, foot.z, v.heading + Math.PI / 2);
  p.human.setPosition(foot.x + Math.sin(v.heading) * 1.2, foot.z + Math.cos(v.heading) * 1.2, v.heading + Math.PI / 2);
  p.transport.lead(h); A.tick(4);
  const a2 = g.interact.update()?.label; g.interact.trigger();
  let n = 0; while (L.busy && n++ < 30 * 30) A.tick(1);
  A.tick(30);
  const labels = {}; let reachable = 0, closeSeen = 0;
  for (let xl = -7; xl <= 1; xl += 0.25) for (let zl = -5; zl <= 4; zl += 0.25) {
    const w = v.groundPoint(xl, zl, { x: 0, y: 0, z: 0 });
    const pos = { x: w.x, y: v.pos.y, z: w.z };
    g.colliders.resolve(pos, 0.35, -Infinity);
    if (Math.hypot(pos.x - w.x, pos.z - w.z) > 0.01) continue; // point non accessible (dans une caisse, sous le pont)
    p.human.setPosition(w.x, w.z, p.human.heading); A.tick(1);
    const real = Math.hypot(p.human.pos.x - w.x, p.human.pos.z - w.z);
    if (real > 0.05) continue;
    reachable++;
    const c = g.interact.update();
    const sec = g.vanLoading?.secondary?.() || p.transport?.secondary() || g.defenderAccess?.secondary() || null;
    const k = `${c?.label || '-'} | 2e: ${sec?.label || '-'}`;
    labels[k] = (labels[k] || 0) + 1;
    if (/Fermer le pont/.test(c?.label || '') || /Fermer le pont/.test(sec?.label || '')) closeSeen++;
  }
  // Conduite pont ouvert : bloquée ?
  return { a1, a2, aboard: L.isAboard(h), side: v.sideDoor.target, reachable, closeSeen, labels };
});
r.base = base;
writeFileSync(out, JSON.stringify(r, null, 1));
console.log(JSON.stringify(r, null, 1));
await browser.close();
