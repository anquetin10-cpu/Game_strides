// Descente du camion (cap est/ouest, caisse inclinée) : le personnage doit rester debout. Usage : node tests/e2e/truck-exit.mjs [url]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const url = process.argv[2] || `${process.env.BASE || 'http://127.0.0.1:5173'}/?autostart`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 667, height: 308 } });
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const res = await page.evaluate(() => {
  const A = window.__auto, g = window.__game, p = g.player, t = g.truck;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  const out = [];
  for (const hd of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    t.setPosition(t.pos.x, t.pos.z, hd);
    A.tick(5);
    const door = t.doorPoint(1, { x: 0, y: 0, z: 0 });
    p.human.setPosition(door.x, door.z, hd);
    A.tick(3);
    p.enterTruck();
    for (let i = 0; i < 40; i++) { g.input.setVirtualMove(0, i < 20 ? 0.4 : -0.6); A.tick(1); }
    A.releaseInput(); A.tick(20);
    // Caisse légèrement inclinée (pente, suspension qui se stabilise) au moment de descendre.
    const prev = t.update.bind(t);
    t.update = (...a) => { const r = prev(...a); t.body.rotation.x += 0.012; t.body.rotation.z += 0.006; return r; };
    A.tick(1);
    t.update = prev;
    p.exitTruck();
    for (let i = 0; i < 30; i++) { A.steer(1, 0.3, 0.6); A.tick(1); }
    const hu = p.human;
    const q = hu.mesh.getWorldQuaternion(new (hu.mesh.quaternion.constructor)());
    const up = new (hu.mesh.position.constructor)(0, 1, 0).applyQuaternion(q);
    out.push(`cap ${(hd * 57.3).toFixed(0)}° → inclinaison ${(Math.acos(Math.min(1, up.y)) * 57.3).toFixed(1)}°`);
  }
  return out;
});
console.log(res.join("\n"));
const bad = res.filter((l) => parseFloat(l.split("→ inclinaison ")[1]) > 5);
console.log(bad.length ? "PERSONNAGE INCLINÉ" : "DESCENTE OK");
process.exitCode = bad.length ? 1 : 0;
await b.close();
