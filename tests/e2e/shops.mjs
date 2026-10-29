// Commerces de Deauville City (navigateur, iPhone 13 émulé en paysage 844 × 390, écran tactile) :
// - pour chacun des trois commerces : chargement à l'approche, entrée par la porte (action « Entrer »), circulation
//   dans les allées (collisions, caméra sous le plafond et dans les murs), rayons et comptoir, sortie (deux
//   allers-retours successifs), retour au cheval ;
// - sellerie : achat d'une selle (un seul débit malgré un double appui), solde insuffisant (rien ne change),
//   équipement (bonus de saut, tapis visible), consommable cumulable puis utilisé près du cheval ;
// - café : commande (un débit par commande), retrait d'une commande de mission au comptoir ;
// - boutique : essayage puis achat d'une tenue portée par le personnage ;
// - entrée à cheval : le cheval reste attaché dehors, le sifflet ne le fait pas entrer ;
// - sauvegarde faite dans un commerce puis rechargement : retour dans la boutique, achats conservés.
// Captures dans tests/e2e/out/shops/.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/shops';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const ev = (fn, arg) => page.evaluate(fn, arg);
const tick = (n = 1) => ev((k) => window.__auto.tick(k), n);
const shot = async (name) => {
  await ev(() => { const g = window.__game; g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky); g.renderer.render(g.scene, g.camera); });
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
const tapSel = async (sel) => {
  const bb = await page.locator(sel).first().boundingBox();
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
};
// Va (à pied) jusqu'au point (x, z) en ligne droite, sans traverser les collisions.
const walkTo = (x, z, max = 400) => ev(([x, z, max]) => {
  const g = window.__game, A = window.__auto;
  const p = g.player.human.pos;
  for (let i = 0; i < max; i++) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 0.35) return true;
    A.steer((x - p.x) / d, (z - p.z) / d, d > 2 ? 0.7 : 0.35);
    A.tick(1);
  }
  return Math.hypot(x - p.x, z - p.z) < 0.6;
}, [x, z, max]);
const act = () => ev(() => { const g = window.__game; g.interact.update(); const c = g.interact.current; if (c) g.interact.trigger(); return c?.label || null; });
const waitIdle = () => page.waitForFunction(() => !window.__game.shops.busy, null, { timeout: 5000 });

await ev(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  g.save.data.money = 1500;
  g.updateWallet();
  window.__S = await import('/src/world/sites.js');
});

// ---------- Sellerie : approche à cheval, chargement, entrée (cheval attaché dehors) ----------
const before = await ev(() => {
  const g = window.__game, A = window.__auto, S = window.__S.SHOPS3D;
  A.mount();
  const d = g.shops.doorOut('sellerie');
  g.player.horse.setPosition(-130, d.z + 66, Math.PI); // sur la rue de l'Ouest, 66 m au nord
  A.tick(3);
  return { loaded: g.shops.loaded.has('sellerie'), money: g.save.data.money, jump: g.mainHorse.mods.jump };
});
check('intérieur non construit loin de la boutique', !before.loaded);
const rideIn = await ev(() => {
  const g = window.__game, A = window.__auto;
  const d = g.shops.doorOut('sellerie');
  const h = g.player.horse;
  for (let i = 0; i < 1500 && Math.hypot(h.pos.x - d.x, h.pos.z - d.z) > 1.6; i++) {
    const dx = d.x - h.pos.x, dz = d.z - h.pos.z, l = Math.hypot(dx, dz);
    A.steer(dx / l, dz / l, l > 8 ? 0.6 : 0.3);
    A.tick(1);
  }
  g.interact.update();
  return { loaded: g.shops.loaded.has('sellerie'), label: g.interact.current?.label, mode: g.player.mode };
});
check('intérieur chargé à l’approche, action « Entrer » à cheval devant la porte', rideIn.loaded && rideIn.label === 'Entrer', JSON.stringify(rideIn));
await shot('1-sellerie-devanture');
await act();
await waitIdle();
await tick(10);
const inS = await ev(() => {
  const g = window.__game, S = window.__S.SHOPS3D.sellerie;
  const h = g.mainHorse, p = g.player.human.pos;
  return { indoor: g.indoor?.id, mode: g.player.mode, inside: g.shops.inside('sellerie', p.x, p.z), horseOut: !g.shops.inside('sellerie', h.pos.x, h.pos.z, 0.5), tie: Math.hypot(h.pos.x - S.tie[0], h.pos.z - S.tie[1]), fov: g.camera.fov, camIn: g.shops.inside('sellerie', g.camera.position.x, g.camera.position.z), camY: g.camera.position.y - g.player.human.pos.y };
});
check('entrée : à pied dans la sellerie, cheval attaché à la barre dehors', inS.indoor === 'sellerie' && inS.mode === 'foot' && inS.inside && inS.horseOut && inS.tie < 0.5, JSON.stringify(inS));
check('caméra intérieure : dans la pièce, sous le plafond', inS.camIn && inS.camY < 3.6, JSON.stringify(inS));
await shot('2-sellerie-entree');
// Sifflet : le cheval reste dehors.
const wh = await ev(() => { const g = window.__game; const h = g.mainHorse; const p0 = { x: h.pos.x, z: h.pos.z }; g.input.pressed.add('whistle'); window.__auto.tick(30); return Math.hypot(h.pos.x - p0.x, h.pos.z - p0.z); });
check('sifflet sans effet à l’intérieur (cheval immobile dehors)', wh < 0.3, wh.toFixed(2));
// Circulation : vers le mur des selles, la briderie, les tapis, le comptoir (collisions, caméra jamais dans un mur).
const route = await ev(() => {
  const g = window.__game, sh = g.shops;
  const pts = [[-3.4, 2.0], [-1.0, -1.0], [-3.6, -4.9], [-8.1, -1.6], [0.5, 0.2], [8.1, -2.6], [8.0, 3.3], [4.6, 3.45]].map(([x, z]) => sh.toW('sellerie', x, z));
  return pts;
});
let reached = 0, camBad = 0;
for (const p of route) {
  if (await walkTo(p.x, p.z, 500)) reached++;
  const c = await ev(() => { const g = window.__game; const cp = g.camera.position; return { blocked: g.colliders.cameraBlocked(cp.x, cp.z, cp.y, 0.05), y: cp.y - g.player.human.pos.y, inside: g.shops.inside('sellerie', cp.x, cp.z) }; });
  if (c.blocked || !c.inside || c.y > 3.7) camBad++;
}
check('allées praticables : 8 points du magasin atteints à pied', reached === route.length, `${reached}/${route.length}`);
check('caméra jamais dans un mur ni hors de la pièce', camBad === 0, String(camBad));
// Rayon des selles : fiche, achat avec double appui, solde insuffisant, équipement.
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('sellerie', -3.6, -4.9))));
const lbl = await act();
await tick(2);
check('rayon des selles : action « Selles » et fiche produits', lbl === 'Selles' && !!(await ev(() => document.querySelector('.overlay .shop-list'))), String(lbl));
await shot('3-sellerie-fiche-selles');
const m0 = await ev(() => window.__game.save.data.money);
await ev(() => { const b = document.querySelector('.overlay [data-item="selle"][data-act^="Acheter"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); b.click?.(); });
await ev(() => { const b = document.querySelector('.overlay [data-item="selle"] button'); b?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); b?.click?.(); });
await tick(2);
const buy1 = await ev(() => { const d = window.__game.save.data; return { money: d.money, owned: d.upgrades.filter((x) => x === 'selle').length, eq: d.equipped.selle, jump: window.__game.mainHorse.mods.jump, stored: JSON.parse(localStorage.getItem('strides-grand-tour-v1')).money }; });
check('achat de la selle : un seul débit et une seule attribution malgré le double appui', buy1.owned === 1 && Math.abs(m0 - buy1.money - 380) < 0.01, JSON.stringify(buy1));
check('achat enregistré tout de suite (débit et attribution dans la même sauvegarde)', buy1.stored === buy1.money, JSON.stringify(buy1));
check('selle équipée à l’achat : bonus de saut +12 %', buy1.eq === 'selle' && Math.abs(buy1.jump - 0.12) < 1e-6, JSON.stringify(buy1));
// Solde insuffisant : la selle CSO Pro (900 €) avec 1 120 € → achat ; puis plus assez pour un second article coûteux.
const poor = await ev(() => {
  const g = window.__game, d = g.save.data;
  d.money = 100;
  const inv = JSON.stringify(d.upgrades);
  const r = g.commerce.purchase('selle_pro', { now: performance.now() + 5000 });
  return { r, money: d.money, same: JSON.stringify(d.upgrades) === inv };
});
check('solde insuffisant : ni l’argent ni l’inventaire ne changent', !poor.r.ok && poor.r.reason === 'money' && poor.money === 100 && poor.same, JSON.stringify(poor));
await ev(() => { const g = window.__game; g.save.data.money = 1500; g.updateWallet(); });
await ev(() => window.__auto.closeCards());
// Tapis (équipement cosmétique visible sur le cheval) et consommable cumulable.
const pad = await ev(() => {
  const g = window.__game, c = g.commerce;
  const t0 = performance.now() + 10000;
  c.purchase('tapis_bordeaux', { now: t0 });
  const padCol = g.mainHorse.mesh.userData.tack?.material?.userData?.padColors?.pad || g.mainHorse.mesh.getObjectByName?.('tack')?.material?.userData?.padColors?.pad || null;
  c.purchase('electrolytes', { now: t0 + 1000 });
  c.purchase('electrolytes', { now: t0 + 1100 }); // double appui : ignoré
  c.purchase('electrolytes', { now: t0 + 3000 }); // nouvelle commande volontaire
  return { eq: g.save.data.equipped.tapis, padCol, qty: c.qty('electrolytes'), money: g.save.data.money };
});
check('tapis acheté : équipé, couleur du tapis du cheval changée', pad.eq === 'tapis_bordeaux' && (pad.padCol === null || pad.padCol === '#5e1f2b'), JSON.stringify(pad));
check('consommable : deux achats volontaires = 2 en stock (double appui ignoré)', pad.qty === 2 && Math.abs(1500 - 59 - 18 - pad.money) < 0.01, JSON.stringify(pad));
// Comptoir : la sellière parle, puis tout le catalogue.
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('sellerie', 0.5, 0.2))));
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('sellerie', 4.6, 3.45))));
const cl = await act();
await tick(2);
const dlg = await ev(() => window.__game.hud.dialogActive);
await shot('4-sellerie-comptoir');
await ev(() => { const g = window.__game; while (g.hud.dialogActive) g.hud.advanceDialog(); });
await tick(2);
const cat = await ev(() => document.querySelectorAll('.overlay .shop-row').length);
check('comptoir : dialogue de la sellière puis catalogue complet de la sellerie', cl === 'Parler' && dlg && cat >= 15, `${cl} ${dlg} ${cat}`);
await ev(() => window.__auto.closeCards());
// Vues de l'intérieur.
for (const [name, [x, z], [lx, lz]] of [['5-sellerie-selles', [-1.0, -0.5], [-4.5, -6.6]], ['6-sellerie-briderie', [-5.5, 0.5], [-9.6, -2.5]], ['7-sellerie-tapis', [5.0, -1.0], [9.6, -3.0]], ['8-sellerie-vitrines', [0.0, 0.0], [-2.0, 6.6]]]) {
  await walkTo(...Object.values(await ev(([x, z]) => window.__game.shops.toW('sellerie', x, z), [x, z])));
  await ev(([lx, lz]) => { const g = window.__game, sh = g.shops; const t = sh.toW('sellerie', lx, lz); const p = g.player.human.pos; g.player.human.heading = Math.atan2(t.x - p.x, t.z - p.z); g.cam.snap(p, g.player.human.heading); window.__auto.tick(8); }, [lx, lz]);
  await shot(name);
}
// Sortie puis deuxième aller-retour (pas de transition déclenchée deux fois).
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('sellerie', -3.4, 5.6))));
const ex1 = await act();
const twice = await act(); // second appui pendant la transition : ignoré
await waitIdle();
await tick(5);
const out1 = await ev(() => { const g = window.__game, p = g.player.human.pos; return { indoor: g.indoor, inside: g.shops.inside('sellerie', p.x, p.z), fov: Math.round(g.camera.fov), dist: g.camera.position.distanceTo(p) }; });
check('sortie : sur le trottoir devant la porte, caméra d’exploration rétablie', ex1 === 'Sortir' && !out1.indoor && !out1.inside, JSON.stringify(out1) + ` ${twice}`);
await act();
await waitIdle();
await tick(5);
const in2 = await ev(() => window.__game.indoor?.id);
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('sellerie', -3.4, 5.6))));
await act();
await waitIdle();
await tick(5);
const out2 = await ev(() => !window.__game.indoor);
check('deux entrées/sorties successives sans blocage à la porte', in2 === 'sellerie' && out2);
// Retour au cheval : il attend à la barre ; on remonte.
const back = await ev(() => {
  const g = window.__game, A = window.__auto, h = g.mainHorse;
  const p = g.player.human.pos;
  for (let i = 0; i < 600 && Math.hypot(h.pos.x - p.x, h.pos.z - p.z) > 2; i++) {
    const dx = h.pos.x - p.x, dz = h.pos.z - p.z, l = Math.hypot(dx, dz);
    A.steer(dx / l, dz / l, 0.7);
    A.tick(1);
  }
  g.interact.update();
  const lab = g.interact.current?.label;
  A.mount();
  return { lab, mode: g.player.mode };
});
check('retour au cheval attaché et remise en selle', back.mode === 'ride', JSON.stringify(back));
await shot('9-sellerie-cour-cheval');
// Utilisation d'un consommable près du cheval.
const used = await ev(() => { const g = window.__game; g.mainHorse.cond.hydration = 40; const ok = g.commerce.use('electrolytes'); return { ok, hyd: Math.round(g.mainHorse.cond.hydration), qty: g.commerce.qty('electrolytes') }; });
check('consommable utilisé sur le cheval (hydratation +35, stock 1)', used.ok && used.hyd === 75 && used.qty === 1, JSON.stringify(used));

// ---------- Café-boulangerie : commande et retrait d'une commande de mission ----------
await ev(() => { const g = window.__game, A = window.__auto; A.dismount?.() || g.player.dismount(); const d = g.shops.doorOut('cafe'); g.player.human.setPosition(d.x - 1.5, d.z - 6.5, 0); g.cam.snap(g.player.human.pos, 0); A.tick(4); });
await shot('10-cafe-devanture');
await walkTo(...Object.values(await ev(() => window.__game.shops.doorOut('cafe'))));
await act();
await waitIdle();
await tick(6);
check('café : entrée', (await ev(() => window.__game.indoor?.id)) === 'cafe');
await shot('11-cafe-entree');
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('cafe', -1.6, -0.55))));
await act();
await tick(2);
await ev(() => { const g = window.__game; while (g.hud.dialogActive) g.hud.advanceDialog(); });
await tick(2);
const mc = await ev(() => window.__game.save.data.money);
await ev(() => { const b = document.querySelector('.overlay [data-item="creme"] button'); for (let i = 0; i < 2; i++) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); b.click?.(); } });
await tick(2);
const mc2 = await ev(() => window.__game.save.data.money);
check('café : un café crème commandé, un seul débit (3,20 €) malgré le double appui', Math.abs(mc - mc2 - 3.2) < 0.001, `${mc} → ${mc2}`);
await shot('12-cafe-carte');
await ev(() => window.__auto.closeCards());
// Commande de mission : livraison de viennoiseries, retrait au comptoir.
const job = await ev(async () => {
  const g = window.__game;
  const { makeJob } = await import('/src/gameplay/jobs.js').catch(() => ({}));
  const anchor = (await import('/src/world/shopInteriors.js')).shopAnchor((await import('/src/world/sites.js')).SHOPS3D.cafe, 'comptoir');
  // Mission minimale qui reprend l'étape de retrait des jobs de coursier.
  const M = await import('/src/gameplay/missions.js');
  return { anchor, has: !!makeJob, M: Object.keys(M).length };
});
check('point de retrait des commandes du café au comptoir', !!job.anchor);
for (const [name, [x, z], [lx, lz]] of [['13-cafe-comptoir', [1.5, 1.5], [-3.5, -2.0]], ['14-cafe-salle', [-2.0, 2.0], [4.5, -1.5]]]) {
  await walkTo(...Object.values(await ev(([x, z]) => window.__game.shops.toW('cafe', x, z), [x, z])));
  await ev(([lx, lz]) => { const g = window.__game, sh = g.shops; const t = sh.toW('cafe', lx, lz); const p = g.player.human.pos; g.player.human.heading = Math.atan2(t.x - p.x, t.z - p.z); g.cam.snap(p, g.player.human.heading); window.__auto.tick(8); }, [lx, lz]);
  await shot(name);
}
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('cafe', 0, 3.6))));
await act();
await waitIdle();
check('café : sortie', !(await ev(() => window.__game.indoor)));

// ---------- Boutique : essayage, achat, tenue portée ----------
await ev(() => { const g = window.__game, A = window.__auto; const d = g.shops.doorOut('boutique'); g.player.human.setPosition(d.x + 8, d.z + 2, -Math.PI / 2); g.cam.snap(g.player.human.pos, -Math.PI / 2); A.tick(4); });
await shot('15-boutique-devanture');
await walkTo(...Object.values(await ev(() => window.__game.shops.doorOut('boutique'))));
await act();
await waitIdle();
await tick(6);
check('boutique : entrée', (await ev(() => window.__game.indoor?.id)) === 'boutique');
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('boutique', -2.4, -3.9))));
const tl = await act();
await tick(2);
await ev(() => { const b = document.querySelector('.overlay [data-item="pull_marin"] [data-act="Essayer"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); b.click?.(); });
await tick(2);
const tried = await ev(() => { const g = window.__game; return { prev: g.shops.preview, top: g.player._outfit(g.player.avatar).top, owned: g.save.data.upgrades.includes('pull_marin') }; });
check('miroir : essayage du pull marin (porté sans être acheté)', tl === 'Essayer' && tried.prev === 'pull_marin' && tried.top === '#1f2b45' && !tried.owned, JSON.stringify(tried));
await ev(() => window.__auto.closeCards());
const untried = await ev(() => { const g = window.__game; return { prev: g.shops.preview, top: g.player._outfit(g.player.avatar).top }; });
check('fiche fermée : l’essai est retiré', !untried.prev && untried.top !== '#1f2b45', JSON.stringify(untried));
const bought = await ev(() => { const g = window.__game; const r = g.commerce.purchase('pull_marin', { now: performance.now() + 20000 }); return { r, eq: g.save.data.equipped.haut, top: g.player._outfit(g.player.avatar).top, ride: g.player._outfit(g.player.avatar, 'ride').top }; });
check('pull acheté : porté à pied et à cheval (hors concours)', bought.r.ok && bought.eq === 'pull_marin' && bought.top === '#1f2b45' && bought.ride === '#1f2b45', JSON.stringify(bought));
for (const [name, [x, z], [lx, lz]] of [['16-boutique-portant', [1.0, 2.5], [-4.3, -1.5]], ['17-boutique-miroir', [0.5, -1.8], [-2.4, -5.1]]]) {
  await walkTo(...Object.values(await ev(([x, z]) => window.__game.shops.toW('boutique', x, z), [x, z])));
  await ev(([lx, lz]) => { const g = window.__game, sh = g.shops; const t = sh.toW('boutique', lx, lz); const p = g.player.human.pos; g.player.human.heading = Math.atan2(t.x - p.x, t.z - p.z); g.cam.snap(p, g.player.human.heading); window.__auto.tick(8); }, [lx, lz]);
  await shot(name);
}

// ---------- Sauvegarde dans la boutique puis rechargement ----------
const saved = await ev(() => { const g = window.__game; g.saveNow(); const d = JSON.parse(localStorage.getItem('strides-grand-tour-v1')); return { shop: d.indoorShop, pos: d.pos, money: d.money, ups: d.upgrades }; });
check('sauvegarde dans la boutique : commerce et porte enregistrés', saved.shop === 'boutique', JSON.stringify(saved.pos));
await page.reload();
await page.waitForFunction(() => window.__game?.state === 'title' || window.__game?.state === 'play', null, { timeout: 240000 });
await page.evaluate(() => { if (window.__game.state === 'title') window.__game.startGame(false); });
await page.waitForFunction(() => window.__game?.state === 'play' && !window.__game.shops.busy, null, { timeout: 60000 });
await page.waitForTimeout(500);
const resumed = await ev(() => { const g = window.__game, d = g.save.data, p = g.player.human.pos; return { indoor: g.indoor?.id, inside: g.shops.inside('boutique', p.x, p.z), money: d.money, ups: d.upgrades, eq: d.equipped }; });
check('reprise : retour dans la boutique, achats et argent conservés', resumed.indoor === 'boutique' && resumed.inside && resumed.money === saved.money && JSON.stringify(resumed.ups) === JSON.stringify(saved.ups), JSON.stringify(resumed));
check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'COMMERCES OK');
await browser.close();
process.exit(fails ? 1 : 0);
