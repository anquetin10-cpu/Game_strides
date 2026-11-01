// Captures de la tenue du joueur (personnages féminin et masculin) : à pied (tenue de référence, culotte beige,
// tête nue), à cheval (casque), mission de concours acceptée loin du Pôle (tenue de concours, à pied puis à cheval).
// Rendu logiciel SwiftShader (image du jeu) : pas une capture d'iPhone.
// Sortie : tests/e2e/out/outfit-captures/{f,m}-{1-a-pied,2-a-cheval,3-concours-a-pied,4-concours-a-cheval}.jpg
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/outfit-captures.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/outfit-captures';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const E = (f, a) => page.evaluate(f, a);
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 10.5 * 3600;
  for (const el of document.querySelectorAll('#hud, .hud, #minimap, #touch')) el.style.visibility = 'hidden';
});
// Place le joueur (à pied ou en selle) près du cheval et cadre de trois quarts avant.
const shot = async (name, mounted) => {
  const info = await E(async (mounted) => {
    const A = window.__auto, g = window.__game, P = g.player, h = g.mainHorse;
    if (!mounted && P.mode === 'ride') P.dismount(true);
    if (P.mode !== 'ride') A.foot();
    h.setPosition(-104, 190, Math.PI / 2); h.ai = null; h.speed = 0;
    if (mounted) { if (P.mode !== 'ride') P.mount(); }
    else P.human.setPosition(-102.6, 188.2, -0.5);
    for (let i = 0; i < 20; i++) { A.tick(1); g.realism?.update(); }
    // Modèle réaliste du joueur chargé (attente bornée).
    for (let i = 0; i < 120 && !(g.realism?.body?.root?.visible); i++) { await new Promise((r) => setTimeout(r, 100)); g.realism?.update(); }
    const V = g.camera.position.constructor, hu = P.human;
    const t = mounted ? h.pos : hu.pos, hd = mounted ? h.heading : hu.heading;
    const fx = Math.sin(hd), fz = Math.cos(hd), lx = Math.cos(hd), lz = -Math.sin(hd);
    const d = mounted ? 4.6 : 2.6, y = mounted ? 2.1 : 1.15;
    g.cam.override = { pos: new V(t.x + fx * d * 0.75 + lx * d * 0.66, t.y + y + 0.25, t.z + fz * d * 0.75 + lz * d * 0.66), look: new V(t.x, t.y + y, t.z) };
    for (let i = 0; i < 4; i++) { A.tick(1); g.realism?.update(); }
    g.hud.notifEl?.classList.add('hidden');
    g.renderer.render(g.scene, g.camera);
    const o = hu.outfit;
    return { mode: P.mode, sex: hu.sex, comp: P.competitionOutfit(), helmet: !!o.helmet, pants: o.pants, top: o.top, style: o.style, real: !!g.realism?.body, realHelmet: !!g.realism?.body?.helmet };
  }, mounted);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 88 });
  console.log(name, JSON.stringify(info));
};
for (const av of ['f', 'm']) {
  await E((av) => { const g = window.__game; g.missions.abandon?.(); window.__auto.closeCards(); g.player.setAvatar(av); }, av);
  await shot(`${av}-1-a-pied`, false);
  await shot(`${av}-2-a-cheval`, true);
  await E(async () => {
    const g = window.__game, M = g.missions;
    const { competitionDef } = await import('/src/gameplay/trip.js');
    g.save.data.money = Math.max(g.save.data.money, 200);
    if (!g.save.data.completed.includes('tuto')) g.save.data.completed.push('tuto');
    M.offers = [M._offerFromDef(competitionDef(1, 15), { id: 'event:concours' })];
    M.accept('event:concours');
    window.__auto.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.phone.notify = () => {};
  });
  await shot(`${av}-3-concours-a-pied`, false);
  await shot(`${av}-4-concours-a-cheval`, true);
}
await E(() => { window.__game.missions.abandon?.(); window.__auto.closeCards(); });
await shot('f-5-apres-concours-a-pied', false);
console.log(errors.length ? `erreurs : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
await browser.close();
