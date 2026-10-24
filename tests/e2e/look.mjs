// Captures « réalisme » : plusieurs heures et points de vue, rendu réel (SwiftShader).
// Usage : node tests/e2e/look.mjs [WxH] [heures séparées par des virgules] [vue]   (BASE=http://localhost:5173)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [W, H] = (process.argv[2] || '1280x720').split('x').map(Number);
const hours = (process.argv[3] || '9,13,19.5').split(',').map(Number);
const view = process.argv[4] || 'horse';
const base = process.env.BASE || 'http://localhost:5173';
const out = (n) => `tests/e2e/out/look/${view}-${n}.png`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/?autostart&quality=high`);
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.evaluate(([d, r]) => { window.__day = d; window.__rain = r; }, [Number(process.env.DAY || 0), !!process.env.RAIN]);
await page.evaluate(async () => { window.__roads = (await import('/src/world/layout.js')).ROADS; window.__sites = await import('/src/world/sites.js'); });
await page.evaluate(() => { window.__auto.stopLoop(); window.__auto.closeCards(); const g = window.__game; while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); window.__auto.closeCards(); });
const VIEWS = {
  // Cheval principal, vu de trois quarts.
  horse: (g) => { const h = g.mainHorse; return { at: [h.pos.x, h.pos.y + 1.2, h.pos.z], from: [h.pos.x + 4.2, h.pos.y + 2.0, h.pos.z + 3.6] }; },
  // Écurie du Val, vue large.
  home: (g) => { const p = g.player.focus.pos; return { at: [p.x, p.y + 2, p.z], from: [p.x + 22, p.y + 9, p.z + 26] }; },
  // Camion.
  truck: (g) => { const t = g.truck; return { at: [t.pos.x, t.pos.y + 1.6, t.pos.z], from: [t.pos.x + 7, t.pos.y + 3, t.pos.z + 8] }; },
  // Paysage depuis la colline.
  land: (g) => ({ at: [60, 6, -370], from: [250, 50, -260] }),
  // Carrière du Pôle International : obstacles de CSO.
  cso: (g) => { const A = window.__sites.POLE.arena; const y = g.terrain.getHeight(A.x, A.z); return { at: [A.x - 30, y + 0.9, A.z - 1], from: [A.x - 23.5, y + 1.8, A.z + 4.5] }; },
  // Cour de l'écurie : tracteur, voiture, matériel.
  yard: (g) => { const y = g.terrain.getHeight(-152, 170); return { at: [-158, y + 1.2, 166], from: [-150.5, y + 2.2, 173] }; },
  car: (g) => { const y = g.terrain.getHeight(-84, 146); return { at: [-84, y + 0.9, 146], from: [-79.5, y + 1.8, 150.5] }; },
  // Entrée de Deauvelle (panneau d'agglomération).
  entry: (g) => { const y = g.terrain.getHeight(-230, -353); return { at: [-216, y + 2.2, -346.2], from: [-232, y + 1.8, -350.5] }; },
  // Hippodrome de la Touques.
  hippo: (g) => { const y = g.terrain.getHeight(330, 168); return { at: [330, y + 2, 230], from: [300, y + 6, 160] }; },
  // Carrière de l'Écurie du Val (lettres de dressage).
  arena: (g) => { const y = g.terrain.getHeight(-100, 212); return { at: [-100, y + 0.5, 212], from: [-128, y + 3.5, 196] }; },
  // Carrefour du centre (passages piétons).
  cross: (g) => { const y = g.terrain.getHeight(-30, -300); return { at: [-30, y, -300], from: [-14, y + 3.2, -290] }; },
  // Plage et goélands.
  beach: (g) => { const b = g.birds.birds[3]; return { at: [b.cx, b.h * 0.7, b.cz], from: [b.cx + 30, 4, b.cz + 45] }; },
  // Estran à hauteur d'homme : bord de l'eau, sable mouillé, laisse de mer (marée).
  shore: (g) => { const sz = (x) => -430 + 12 * Math.sin(x / 95) + 6 * Math.sin(x / 37 + 1.3); const z = sz(100) + 26; return { at: [55, 0, sz(55) - 4], from: [100, g.terrain.getHeight(100, z) + 1.7, z] }; },
  // Circulation : une voiture vue de trois quarts avant (phares, faisceaux, roues).
  traffic: (g) => { const c = g.ambient.cars[1]; c.cruise = 0; c.speed = 0; const fx = Math.sin(c.heading), fz = Math.cos(c.heading); const v = { at: [c.pos.x + fx * 2, c.pos.y + 0.7, c.pos.z + fz * 2], from: [c.pos.x + fx * 14 + fz * 3.5, c.pos.y + 1.7, c.pos.z + fz * 14 - fx * 3.5] }; g.camera.position.set(...v.from); g.ambient.update(0.016, g.camera.position); return v; },
  // Falaises d'Aval depuis la plage.
  cliff: (g) => ({ at: [-520, 20, -330], from: [-380, 6, -345] }),
  // Lampadaire (la nuit).
  lamp: (g) => { const [x, y, z] = g.world._lampPools[6]; return { at: [x, y + 0.5, z], from: [x + 9, y + 2.2, z + 7] }; },
  // Rue de Deauvelle, à hauteur d'homme.
  town: (g) => { const P = window.__sites.TOWN.plaza; const y = g.terrain.getHeight(P.x, P.z); return { at: [P.x - 30, y + 4, P.z - 25], from: [P.x + 4, y + 1.7, P.z + 6] }; },
  // Route de campagne, à hauteur d'homme.
  road: (g) => { const r = window.__roads[1].pts; const [ax, az] = r[1], [bx, bz] = r[2]; const t = 0.5; const x = ax + (bx - ax) * t, z = az + (bz - az) * t; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); const y = g.terrain.getHeight(x, z); return { at: [x + (dx / l) * 25, y + 0.5, z + (dz / l) * 25], from: [x - (dz / l) * 1.2, y + 1.7, z + (dx / l) * 1.2] }; },
};
for (const hr of hours) {
  await page.evaluate(([hr, view]) => {
    const g = window.__game;
    g.save.data.gameTime = (window.__day || 0) * 86400 + hr * 3600;
    g.update(1 / 30);
    const v = ({ horse: 1, home: 1, truck: 1, land: 1 })[view] && window.__lookViews?.[view];
  }, [hr, view]);
  await page.evaluate(([viewSrc]) => {
    const g = window.__game;
    const v = new Function('g', `return (${viewSrc})(g)`)(g);
    g.camera.position.set(...v.from);
    g.camera.lookAt(...v.at);
    if (window.__rain) { g.sky.setDay(3); g.sky.rain = 1; g.sky.wet = 1; }
    g.sky.update(g.hour(), g.player.focus.pos, 0);
    g.rainFx?.update(0.5, g.camera, g.sky.rain, 1);
    g.sky.follow(g.camera);
    g.sky.updateEnvironment(g.renderer, performance.now() / 1000, true);
    g.world.update(0, g.camera, g.sky);
    g.renderer.render(g.scene, g.camera);
  }, [VIEWS[view].toString()]);
  const info = await page.evaluate(() => { const i = window.__game.renderer.info.render; return `${i.calls} appels, ${Math.round(i.triangles / 1000)}k triangles`; });
  console.log(view, hr, info);
  await page.screenshot({ path: out(`${String(hr).replace('.', 'h')}`) });
}
console.log(view, hours.join(','), errors.length ? `ERREURS: ${errors.slice(0, 5).join(' | ')}` : 'ok');
await b.close();
