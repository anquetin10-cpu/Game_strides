// Boutique d'équitation de Deauville City (commerce « boutique ») — navigateur, iPhone 13 émulé en paysage 844 × 390,
// écran tactile, rendu logiciel SwiftShader (pas un iPhone réel) :
// - habillage neutre tant que la marque partenaire n'est pas autorisée (nom, sous-titre, aucun « Kingsland » affiché) ;
// - façade de jour et de nuit ; entrée par la porte ; circulation dans les allées (collisions du mobilier, caméra
//   dans la pièce, sous le plafond) ; chaque rayon ouvert (articles de ses catégories) ;
// - essayage d'une veste de concours puis d'un pantalon (tenue du personnage et modèle réaliste) ;
// - achat avec double appui (un seul débit) et équipement : veste, pantalon, gants ;
// - sortie : la tenue est portée dehors ; tenue de concours (veste équipée, pantalon admis ou blanc réglementaire) ;
// - équipement du cheval (tapis, guêtres, bonnet) visible sur le cheval ;
// - articles de l'ancienne Maison Lucette (anciennes sauvegardes) : possédés, équipables, portés ;
// - sauvegarde dans la boutique puis rechargement (en anglais) : retour dans la boutique, achats et équipement
//   conservés, aucun texte sans traduction.
// Captures dans tests/e2e/out/apparel/.
// Usage : BASE=http://127.0.0.1:5176 node tests/e2e/apparel-store.mjs
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/apparel';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  if (!sessionStorage.getItem('apparel-lang')) {
    localStorage.setItem('strides-lang', 'fr');
    sessionStorage.setItem('apparel-lang', '1');
  }
});
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 240000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const ev = (fn, arg) => page.evaluate(fn, arg);
const tick = (n = 1) => ev((k) => window.__auto.tick(k), n);
const render = () => ev(() => { const g = window.__game; g.realism?.update(); g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky); g.renderer.render(g.scene, g.camera); });
const shot = async (name) => {
  await render();
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 });
};
// Va (à pied) jusqu'au point (x, z) en ligne droite, sans traverser les collisions.
const walkTo = (x, z, max = 500) => ev(([x, z, max]) => {
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
const toW = (lx, lz) => ev(([lx, lz]) => window.__game.shops.toW('boutique', lx, lz), [lx, lz]);
const walkLocal = async (lx, lz, max) => { const p = await toW(lx, lz); return walkTo(p.x, p.z, max); };
// Trajet dans la boutique par les allées : centre avant (H1), centre arrière (H2), allée de gauche (H3).
const H1 = [0.2, 0.5], H2 = [0.2, -1.6], H3 = [-2.6, 0.45];
const localPos = () => ev(() => {
  const g = window.__game, s = g.shops.spec('boutique'), p = g.player.human.pos;
  const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = p.x - s.x, dz = p.z - s.z;
  return [dx * c - dz * sn, dx * sn + dz * c];
});
const goLocal = async (lx, lz) => {
  const [cx, cz] = await localPos();
  if (cz < -0.5) await walkLocal(...H2);
  else if (cx < -2 && cz > 0.6) await walkLocal(...H3);
  await walkLocal(...H1);
  if (lz < -0.5) await walkLocal(...H2);
  else if (lx < -2 && lz > 0.6) await walkLocal(...H3);
  return walkLocal(lx, lz);
};
const act = () => ev(() => { const g = window.__game; g.interact.update(); const c = g.interact.current; if (c) g.interact.trigger(); return c?.label || null; });
const waitIdle = () => page.waitForFunction(() => !window.__game.shops.busy, null, { timeout: 15000 });
// Double appui sur un bouton de fiche (deux appuis rapprochés sur le même bouton).
const doubleTap = (sel) => ev((sel) => {
  const b = document.querySelector(sel);
  if (!b) return false;
  for (let i = 0; i < 2; i++) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); b.click?.(); }
  return true;
}, sel);
const tapBtn = (sel) => ev((sel) => {
  const b = document.querySelector(sel);
  if (!b) return false;
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); b.click?.();
  return true;
}, sel);
// Caméra devant le personnage (essayage, tenue dehors) : vue de face, à hauteur de buste.
const faceCam = (dist = 2.6, h = 1.25) => ev(([dist, h]) => {
  const g = window.__game, p = g.player.human;
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const cam = g.camera;
  g.realism?.update();
  cam.position.set(p.pos.x + fx * dist, p.pos.y + h + 0.25, p.pos.z + fz * dist);
  cam.lookAt(p.pos.x, p.pos.y + 1.0, p.pos.z);
  g.renderer.render(g.scene, cam);
}, [dist, h]);
// Capture de la scène sans la fiche ouverte (essayage : le personnage devant le miroir).
const shotNoCard = async (name) => {
  await ev(() => document.querySelectorAll('.overlay').forEach((o) => (o.style.visibility = 'hidden')));
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 });
  await ev(() => document.querySelectorAll('.overlay').forEach((o) => (o.style.visibility = '')));
};
const realReady = () => ev(async () => {
  const g = window.__game, A = window.__auto;
  for (let i = 0; i < 40; i++) {
    g.realism?.update();
    A.tick(1);
    if (!g.realism?.playerEnabled || g.realism.failed || (g.realism.body && !g.realism.loading.size)) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return !!g.realism?.body;
});
// Tenue visible : personnage classique (tenue) et modèle réaliste (veste, pantalon, gants).
const look = () => ev(() => {
  const g = window.__game;
  // Le modèle réaliste suit la tenue à l'image suivante (boucle d'affichage) : quelques images.
  for (let i = 0; i < 3; i++) { g.realism?.update(); window.__auto.tick(1); }
  g.realism?.update();
  const o = g.player.human.outfit, r = g.realism?.body;
  let jacketMesh = null, jeans = null;
  r?.root.traverse((m) => {
    if (!m.isMesh) return;
    if (m.material.name === 'Cloth_jacket') jacketMesh = m.visible;
    if (m.material.name === 'Cloth_jeans') jeans = `#${m.material.color.getHexString()}`;
  });
  return { top: o.top, jacket: !!o.jacket, style: o.style, pants: o.pants, gloves: o.gloves || null, cap: o.cap || null, real: !!r, realJacket: jacketMesh, realGloves: r?.gloveU ? r.gloveU.uGloveOn.value : null, jeans };
});

await ev(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600;
  g.save.data.money = 3000;
  g.updateWallet();
  A.foot?.();
  window.__S = await import('/src/world/sites.js');
  window.__P = await import('/src/partners/partners.js');
  window.__D = await import('/src/gameplay/data.js');
  window.__K = await import('/src/world/storeSkin.js');
});

// ---------- Habillage neutre (marque non autorisée) ----------
const skin = await ev(() => {
  const S = window.__S.SHOPS3D.boutique, B = window.__P.BRANDS.kingsland, K = window.__K.storeSkin();
  const L = window.__S.SHOPS3D.boutique;
  return { name: S.name, sub: S.sub, brand: S.brand, status: B.status, neutral: B.neutral.name, official: K.official, logo: K.logo, storefront: K.storefront, poi: null, id: L.id };
});
check('habillage neutre : marque « pending », nom et sous-titre neutres, ni logo ni visuel', skin.status === 'pending' && skin.name === skin.neutral && !skin.official && !skin.logo && !skin.storefront && !/kingsland/i.test(skin.name + skin.sub) && skin.id === 'boutique', JSON.stringify(skin));

// ---------- Façade de jour et de nuit ----------
await ev(() => {
  const g = window.__game, A = window.__auto;
  const d = g.shops.doorOut('boutique');
  g.player.human.setPosition(d.x + 10, d.z + 3.5, -Math.PI / 2 - 0.32);
  g.cam.snap(g.player.human.pos, -Math.PI / 2 - 0.32);
  A.tick(12);
});
await realReady();
await shot('01-facade-jour');
await ev(() => {
  const g = window.__game, d = g.shops.doorOut('boutique'), s = g.shops.spec('boutique');
  const fx = Math.sin(s.rot), fz = Math.cos(s.rot);
  const cam = g.camera;
  cam.position.set(d.x + fx * 6.5 + fz * 2.5, g.player.human.pos.y + 2.4, d.z + fz * 6.5 - fx * 2.5);
  cam.lookAt(d.x - fx * 0.5, g.player.human.pos.y + 2.9, d.z - fz * 0.5);
  g.renderer.render(g.scene, cam);
});
await page.screenshot({ path: `${OUT}/01b-facade-enseigne.png`, timeout: 180000 });
await ev(() => { const g = window.__game; g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 22 * 3600; window.__auto.tick(6); });
await shot('02-facade-nuit');
await ev(() => { const g = window.__game; g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 15 * 3600; window.__auto.tick(6); });

// ---------- Entrée ----------
await walkTo(...Object.values(await ev(() => window.__game.shops.doorOut('boutique'))));
const lblIn = await act();
await waitIdle();
await tick(10);
const inS = await ev(() => {
  const g = window.__game, p = g.player.human.pos, cp = g.camera.position;
  return { indoor: g.indoor?.id, inside: g.shops.inside('boutique', p.x, p.z), camIn: g.shops.inside('boutique', cp.x, cp.z), camY: cp.y - p.y, people: g.shops.loaded.get('boutique')?.npcs.length };
});
check('entrée par la porte (« Entrer ») : dans la boutique, vendeuse et deux clientes', lblIn === 'Entrer' && inS.indoor === 'boutique' && inS.inside && inS.people === 3, `${lblIn} ${JSON.stringify(inS)}`);
check('caméra intérieure : dans la pièce, sous le plafond', inS.camIn && inS.camY < 3.6, JSON.stringify(inS));
await shot('03-entree');

// ---------- Allées : points atteints, caméra jamais dans un mur ----------
const route = [[0, 2.6], [0.2, 0.5], [-1.0, 0.45], [-2.6, 0.45], [-3.25, -1.4], [-2.05, -3.0], [0.6, -2.6], [2.4, -1.6], [3.05, -1.75], [2.4, 1.4], [3.4, 2.4], [1.75, 1.45], [0.2, 0.5], [-2.6, 0.45], [-3.35, 2.35], [0, 3.6]];
let reached = 0, camBad = 0;
for (const [lx, lz] of route) {
  if (await walkLocal(lx, lz)) reached++;
  const c = await ev(() => { const g = window.__game; const cp = g.camera.position; return { blocked: g.colliders.cameraBlocked(cp.x, cp.z, cp.y, 0.05), y: cp.y - g.player.human.pos.y, inside: g.shops.inside('boutique', cp.x, cp.z) }; });
  if (c.blocked || !c.inside || c.y > 3.7) camBad++;
}
check(`allées praticables : ${route.length} points du magasin atteints à pied`, reached === route.length, `${reached}/${route.length}`);
check('caméra jamais dans un mur ni hors de la pièce', camBad === 0, String(camBad));
// Mobilier : on ne traverse ni la table des pantalons, ni le podium, ni le comptoir.
const blocked = [];
for (const [from, into, box] of [[[-1.0, 0.45], [-1.0, -0.6], [-1.0, -0.6, 0.92, 0.52]], [[1.75, 1.45], [1.75, 0.2], [1.75, 0.2, 0.62, 0.62]], [[0.6, -2.6], [0.6, -3.6], [0.6, -3.6, 1.32, 0.34]], [[-3.25, -1.4], [-4.4, -1.4], [-4.33, -1.4, 0.34, 2.3]]]) {
  await goLocal(...from);
  const r = await ev(([into, box]) => {
    const g = window.__game, A = window.__auto, sh = g.shops, p = g.player.human.pos;
    const t = sh.toW('boutique', into[0], into[1]);
    let deepest = 9;
    for (let i = 0; i < 90; i++) {
      const d = Math.hypot(t.x - p.x, t.z - p.z) || 1;
      A.steer((t.x - p.x) / d, (t.z - p.z) / d, 0.6);
      A.tick(1);
      // Position locale du joueur : distance au bord de la boîte (négatif : à l'intérieur).
      const s = sh.spec('boutique'), c = Math.cos(s.rot), sn = Math.sin(s.rot);
      const dx = p.x - s.x, dz = p.z - s.z;
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      deepest = Math.min(deepest, Math.max(Math.abs(lx - box[0]) - box[2], Math.abs(lz - box[1]) - box[3]));
    }
    return deepest;
  }, [into, box]);
  blocked.push(Number(r.toFixed(2)));
}
check('mobilier en collision : le personnage ne traverse ni table, ni podium, ni comptoir, ni portant', blocked.every((d) => d > -0.05), JSON.stringify(blocked));

// ---------- Rayons ----------
const fixtures = await ev(() => {
  const L = window.__game.shops.layout('boutique');
  return L.fixtures.map((f) => ({ id: f.id, label: f.label, cats: f.cats, at: f.at, tryOn: !!f.tryOn, counter: !!f.counter }));
});
const expectCount = (cats) => ev((cats) => window.__D.SHOP.filter((it) => it.shop === 'boutique' && cats.includes(it.cat)).length, cats);
let racksOk = 0;
const rackLog = [];
for (const fx of fixtures.filter((f) => !f.counter)) {
  await goLocal(...fx.at);
  const lbl = await act();
  await tick(2);
  const rows = await ev(() => document.querySelectorAll('.overlay .shop-row').length);
  const want = await expectCount(fx.cats);
  const ok = lbl === (fx.tryOn ? 'Essayer' : fx.label) && rows === want && want > 0;
  if (ok) racksOk++;
  rackLog.push(`${fx.id}:${lbl}:${rows}/${want}`);
  if (fx.id === 'vestes') await shot('12-fiche-vestes');
  await ev(() => window.__auto.closeCards());
  await tick(1);
}
check('chaque rayon s’ouvre avec les articles de ses catégories (7 rayons dont la cabine d’essayage)', racksOk === fixtures.filter((f) => !f.counter).length, rackLog.join(' · '));

// ---------- Vues de l'intérieur ----------
for (const [name, [x, z], [lx, lz]] of [['04-vestes', [-1.6, 0.6], [-4.6, -2.0]], ['05-pantalons', [0.6, 2.4], [-1.2, -0.4]], ['06-coin-cheval', [1.2, -0.4], [4.6, -3.2]], ['07-comptoir', [0.4, -0.8], [0.6, -5]], ['08-accessoires', [1.4, 2.0], [4.6, 2.2]], ['09-vitrines', [0.0, -1.0], [0, 5]]]) {
  await goLocal(x, z);
  await ev(([lx, lz]) => { const g = window.__game, sh = g.shops; const t = sh.toW('boutique', lx, lz); const p = g.player.human.pos; g.player.human.heading = Math.atan2(t.x - p.x, t.z - p.z); g.cam.snap(p, g.player.human.heading); window.__auto.tick(8); }, [lx, lz]);
  await shot(name);
}

// ---------- Essayage : veste de concours, puis pantalon ----------
await realReady();
await goLocal(-2.05, -3.55);
const lblTry = await act();
await tick(2);
const before = await look();
await tapBtn('.overlay [data-item="veste_concours_marine"] [data-act="Essayer"]');
await tick(3);
const tryJ = await look();
const tryJOwned = await ev(() => window.__game.save.data.upgrades.includes('veste_concours_marine'));
check('cabine : essayage de la veste de concours marine (portée sans être achetée, modèle réaliste compris)', lblTry === 'Essayer' && tryJ.jacket && tryJ.top === '#1f2b45' && tryJ.style === 'rider' && !tryJOwned && (!tryJ.real || tryJ.realJacket === true), `${JSON.stringify(before)} → ${JSON.stringify(tryJ)}`);
await ev(() => { const g = window.__game; g.player.human.heading = g.shops.spec('boutique').rot; g.player.human.snap(); window.__auto.tick(2); });
await faceCam();
await shotNoCard('10-essayage-veste');
await tapBtn('.overlay [data-item="pantalon_blanc"] [data-act="Essayer"]');
await tick(3);
const tryP = await look();
check('cabine : essayage du pantalon d’équitation blanc (la veste essayée est rendue)', tryP.pants === '#f4f3ef' && !tryP.jacket && (!tryP.real || tryP.realJacket === false), JSON.stringify(tryP));
await faceCam(2.4, 1.0);
await shotNoCard('11-essayage-pantalon');
await ev(() => window.__auto.closeCards());
await tick(2);
const after = await look();
check('fiche fermée : l’essai est retiré', !after.jacket && after.pants === before.pants && after.top === before.top, JSON.stringify(after));

// ---------- Achat (double appui) et équipement ----------
const buy = async (fixId, item, price) => {
  const at = await ev((id) => window.__game.shops.layout('boutique').fixtures.find((f) => f.id === id).at, fixId);
  await goLocal(...at);
  await act();
  await tick(2);
  const m0 = await ev(() => window.__game.save.data.money);
  // (un joueur met toujours plus de 250 ms entre deux achats : délai de la protection contre le double appui)
  await page.waitForTimeout(300);
  const found = await doubleTap(`.overlay [data-item="${item}"] [data-act^="Acheter"]`);
  await tick(2);
  const r = await ev((item) => { const d = window.__game.save.data; return { money: d.money, n: d.upgrades.filter((x) => x === item).length, eq: Object.values(d.equipped || {}).includes(item), stored: JSON.parse(localStorage.getItem('strides-grand-tour-v1')).money }; }, item);
  await ev(() => window.__auto.closeCards());
  await tick(1);
  return { ...r, found, debit: Math.round((m0 - r.money) * 100) / 100, price };
};
const bJ = await buy('vestes', 'veste_concours_marine', 189);
const bP = await buy('pantalons', 'pantalon_blanc', 129);
const bG = await buy('accessoires', 'gants_noirs', 35);
check('achats : un seul débit et une seule attribution malgré le double appui (veste 189 €, pantalon 129 €, gants 35 €)', [bJ, bP, bG].every((b) => b.n === 1 && Math.abs(b.debit - b.price) < 0.01 && b.stored === b.money), JSON.stringify([bJ, bP, bG]));
check('articles équipés à l’achat (emplacements veste, pantalon, gants)', [bJ, bP, bG].every((b) => b.eq), JSON.stringify([bJ.eq, bP.eq, bG.eq]));
const worn = await look();
check('tenue portée dans la boutique : veste marine, pantalon blanc, gants noirs', worn.jacket && worn.top === '#1f2b45' && worn.pants === '#f4f3ef' && worn.gloves === '#17181b' && (!worn.real || (worn.realJacket && worn.realGloves === 1)), JSON.stringify(worn));

// ---------- Sortie : tenue portée dehors ----------
await goLocal(0, 3.6);
await walkLocal(0, 4.6);
const lblOut = await act();
await waitIdle();
await tick(6);
const outside = await ev(() => { const g = window.__game, p = g.player.human.pos; return { indoor: g.indoor?.id || null, inside: g.shops.inside('boutique', p.x, p.z) }; });
const lookOut = await look();
check('sortie (« Sortir ») : sur le trottoir', lblOut === 'Sortir' && !outside.indoor && !outside.inside, `${lblOut} ${JSON.stringify(outside)}`);
check('dehors : la tenue achetée est portée (personnage classique et modèle réaliste)', lookOut.jacket && lookOut.top === '#1f2b45' && lookOut.pants === '#f4f3ef' && lookOut.gloves === '#17181b' && (!lookOut.real || (lookOut.realJacket && lookOut.realGloves === 1)), JSON.stringify(lookOut));
await ev(() => { const g = window.__game, A = window.__auto; const p = g.player.human; p.setPosition(p.pos.x + 2.2, p.pos.z + 1.0, g.shops.spec('boutique').rot + 0.4); A.tick(4); });
await faceCam(3.0, 1.1);
await page.screenshot({ path: `${OUT}/13-avatar-dehors.png`, timeout: 180000 });

// ---------- Tenue de concours ----------
const comp = await ev(async () => {
  const g = window.__game, P = g.player, c = g.commerce;
  const orig = P.competitionOutfit;
  P.competitionOutfit = () => true;
  const a = P._outfit(P.avatar);
  // Pantalon foncé : porté tous les jours, remplacé en concours par le pantalon blanc réglementaire.
  c.purchase('pantalon_marine', { now: performance.now() + 60000 });
  c.equip('pantalon_marine');
  const b = P._outfit(P.avatar);
  P.competitionOutfit = orig;
  const daily = P._outfit(P.avatar);
  // Veste retirée : veste de concours d'origine (noire, ou marine avec la veste de la Sellerie).
  c.equip(null, 'veste');
  P.competitionOutfit = () => true;
  const d = P._outfit(P.avatar);
  P.competitionOutfit = orig;
  c.equip('veste_concours_marine');
  c.equip('pantalon_blanc');
  return { a: [a.top, a.pants, a.jacket, a.gloves], b: [b.top, b.pants], daily: daily.pants, d: [d.top, d.jacket] };
});
check('concours : veste équipée, pantalon blanc admis, gants ; pantalon marine remplacé par le blanc réglementaire ; sans veste équipée : veste d’origine', comp.a[0] === '#1f2b45' && comp.a[1] === '#f4f3ef' && comp.a[2] && comp.a[3] === '#17181b' && comp.b[1] === '#f2f1ec' && comp.daily === '#1f2b45' && comp.d[0] === '#1b1c1f' && comp.d[1], JSON.stringify(comp));

// ---------- Équipement du cheval ----------
const horse = await ev(async () => {
  const g = window.__game, c = g.commerce;
  let t0 = performance.now() + 90000;
  for (const id of ['tapis_vert', 'guetres_marine', 'bonnet_bordeaux']) c.purchase(id, { now: (t0 += 1000) });
  const h = g.mainHorse, u = h.mesh.userData;
  return { eq: ['tapis', 'guetres', 'bonnet'].map((s) => g.save.data.equipped[s]), pad: u.tack?.material?.userData?.padColors, boots: u.tack?.material?.userData?.bootsColor, bonnet: !!u.bonnet, bonnetVisible: u.bonnet?.visible, clearance: h.mods.clearance };
});
check('cheval : tapis vert, guêtres marine et bonnet bordeaux équipés et visibles (tolérance +8 %)', horse.eq.join() === 'tapis_vert,guetres_marine,bonnet_bordeaux' && horse.pad?.pad === '#2f4a3a' && horse.boots === '#1f2b45' && horse.bonnet && horse.bonnetVisible && Math.abs(horse.clearance - 0.08) < 1e-6, JSON.stringify(horse));
await ev(() => {
  const g = window.__game, A = window.__auto, h = g.mainHorse;
  const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
  g.player.human.setPosition(h.pos.x + fz * 2.2 + fx * 1.5, h.pos.z - fx * 2.2 + fz * 1.5, h.heading - Math.PI / 2);
  A.tick(6);
  g.realism?.update();
  const cam = g.camera;
  cam.position.set(h.pos.x + fx * 2.1 + fz * 1.7, h.pos.y + 2.35, h.pos.z + fz * 2.1 - fx * 1.7);
  cam.lookAt(h.pos.x + fx * 1.1, h.pos.y + 1.8, h.pos.z + fz * 1.1);
  g.renderer.render(g.scene, cam);
});
await page.screenshot({ path: `${OUT}/14-cheval-tete-bonnet.png`, timeout: 180000 });
await ev(() => {
  const g = window.__game, h = g.mainHorse;
  const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
  const cam = g.camera;
  cam.position.set(h.pos.x + fz * 4.6 + fx * 0.6, h.pos.y + 1.6, h.pos.z - fx * 4.6 + fz * 0.6);
  cam.lookAt(h.pos.x, h.pos.y + 1.0, h.pos.z);
  g.renderer.render(g.scene, cam);
});
await page.screenshot({ path: `${OUT}/15-cheval-profil.png`, timeout: 180000 });

// ---------- Articles de l'ancienne Maison Lucette (ancienne sauvegarde) ----------
const legacy = await ev(() => {
  const g = window.__game, c = g.commerce, d = g.save.data;
  const old = ['polo_blanc', 'pull_marin', 'sweat_gris', 'doudoune', 'veste_huilee', 'casquette', 'casquette_beige'];
  for (const id of old) if (!d.upgrades.includes(id)) d.upgrades.push(id);
  const known = old.every((id) => c.item(id) && c.item(id).shop === 'boutique' && c.owned(id));
  c.equip(null, 'veste');
  c.equip('pull_marin');
  c.equip('casquette');
  const o = g.player._outfit(g.player.avatar);
  const r = { known, top: o.top, cap: o.cap, status: c.status('pull_marin') };
  c.equip('veste_concours_marine');
  return r;
});
check('articles de Maison Lucette : toujours au catalogue, possédés, équipables et portés (pull marin, casquette)', legacy.known && legacy.top === '#1f2b45' && legacy.cap === '#1f2b45' && legacy.status === 'equipped', JSON.stringify(legacy));

// ---------- Habillage autorisé (configuration de test, jamais affichée) ----------
// Une image de test neutre (aplat rouge, pas un logo) tient lieu de ressource officielle : chaque emplacement la
// dessine à ses proportions (bandeau, enseigne drapeau, vitrine, panneau, caisson lumineux).
const official = await ev(async () => {
  const B = await import('/src/world/storeBrand.js');
  const cv = document.createElement('canvas');
  cv.width = 200;
  cv.height = 100;
  const c = cv.getContext('2d');
  c.fillStyle = '#ff0000';
  c.fillRect(0, 0, 200, 100);
  const url = cv.toDataURL('image/png');
  const spec = window.__S.SHOPS3D.boutique;
  const skin = { official: true, name: 'Marque test', sub: spec.sub, logo: url, storefront: url };
  const texs = { fascia: B.storeFascia(spec, skin), blade: B.storeBlade(spec, skin), decal: B.storeDecal('win0', spec, skin), brand: B.storeSignTexture('brand', spec, skin), poster: B.storeSignTexture('poster', spec, skin) };
  await new Promise((r) => setTimeout(r, 600));
  const out = {};
  for (const [k, tx] of Object.entries(texs)) {
    const im = tx.image, ctx = im.getContext('2d');
    const [x, y] = k === 'decal' ? [im.width / 2, im.height * 0.34] : [im.width / 2, im.height / 2];
    const p = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    out[k] = p[0] > 200 && p[1] < 40 && p[2] < 40;
  }
  // Proportions : sur le bandeau (2048 × 256), l'image 2:1 occupe la hauteur utile, pas toute la largeur.
  const f = texs.fascia.image.getContext('2d');
  out.ratio = f.getImageData(200, 128, 1, 1).data[0] < 200;
  return out;
});
check('habillage autorisé (image de test) : logo dessiné sans déformation sur le bandeau, l’enseigne, la vitrine, le panneau, le caisson', Object.values(official).every(Boolean), JSON.stringify(official));

// ---------- Sauvegarde dans la boutique, rechargement en anglais ----------
await ev(async () => {
  const g = window.__game, A = window.__auto;
  const d = g.shops.doorOut('boutique');
  g.player.human.setPosition(d.x, d.z, g.shops.spec('boutique').rot + Math.PI);
  A.tick(2);
  await g.shops.enter('boutique', { instant: true });
  A.tick(4);
  g.saveNow();
});
const saved = await ev(() => { const d = JSON.parse(localStorage.getItem('strides-grand-tour-v1')); return { shop: d.indoorShop, money: d.money, ups: d.upgrades, eq: d.equipped }; });
check('sauvegarde dans la boutique : identifiant « boutique » enregistré', saved.shop === 'boutique', JSON.stringify(saved.eq));
await ev(() => localStorage.setItem('strides-lang', 'en'));
await page.reload({ timeout: 240000 });
await page.waitForFunction(() => window.__game?.state === 'title' || window.__game?.state === 'play', null, { timeout: 300000 });
await page.evaluate(() => { if (window.__game.state === 'title') window.__game.startGame(false); });
await page.waitForFunction(() => window.__game?.state === 'play' && !window.__game.shops.busy, null, { timeout: 120000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await ev(() => { const g = window.__game, A = window.__auto; A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.phone.notify = () => {}; A.tick(6); });
const resumed = await ev(() => {
  const g = window.__game, d = g.save.data, p = g.player.human.pos, u = g.mainHorse?.mesh.userData;
  const o = g.player._outfit(g.player.avatar);
  return { indoor: g.indoor?.id, inside: g.shops.inside('boutique', p.x, p.z), money: d.money, ups: d.upgrades.length, eq: d.equipped, top: o.top, jacket: o.jacket, pants: o.pants, gloves: o.gloves, bonnet: !!u?.bonnet, boots: u?.tack?.material?.userData?.bootsColor };
});
check('reprise : retour dans la boutique, argent, achats et équipement conservés (tenue et cheval)', resumed.indoor === 'boutique' && resumed.inside && resumed.money === saved.money && resumed.ups === saved.ups.length && resumed.eq.veste === 'veste_concours_marine' && resumed.eq.bas === 'pantalon_blanc' && resumed.eq.gants === 'gants_noirs' && resumed.jacket && resumed.pants === '#f4f3ef' && resumed.bonnet && resumed.boots === '#1f2b45', JSON.stringify(resumed));
// Comptoir en anglais : tout le catalogue de la boutique, sans texte manquant.
const missing0 = await ev(() => [...(window.__i18nMissing || [])]);
await goLocal(0.6, -2.6);
await act();
await tick(2);
await ev(() => { const g = window.__game; while (g.hud.dialogActive) g.hud.advanceDialog(); });
await tick(2);
const en = await ev((m0) => {
  const rows = document.querySelectorAll('.overlay .shop-row').length;
  const txt = document.querySelector('.overlay')?.innerText || '';
  const all = [...(window.__i18nMissing || [])];
  // Clés sans traduction apparues avec la boutique (accueil, fiche), et sous-titre neutre de l'enseigne.
  const missing = all.filter((k) => !m0.includes(k) || /quitation|Tenues|Sellerie & Mode/.test(k));
  return { rows, missing, breeches: /riding breeches/i.test(txt), kings: /kingsland/i.test(txt) };
}, missing0);
const want = await ev(async () => (await import('/src/gameplay/data.js')).SHOP.filter((it) => it.shop === 'boutique').length);
check('comptoir (anglais) : tout le catalogue de la boutique, aucune clé sans traduction, aucune marque affichée', en.rows === want && en.breeches && !en.kings && en.missing.length === 0, JSON.stringify({ ...en, want }));
await shot('16-comptoir-anglais');
await ev(() => window.__auto.closeCards());
check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'BOUTIQUE D’ÉQUITATION OK');
await browser.close();
process.exit(fails ? 1 : 0);
