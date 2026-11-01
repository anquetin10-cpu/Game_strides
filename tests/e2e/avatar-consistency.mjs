// Apparence du personnage du joueur : la même dans toutes les situations (rendu logiciel SwiftShader, émulation
// iPhone 13 paysage — pas un iPhone réel). Signature relevée après chaque situation : tenue complète, sexe, échelle,
// niveau de détail, modèle réaliste présent et à jour, nombre de reconstructions du personnage.
// Situations : marche, course, arrêt ; soir et pluie ; montée, pas, trot, galop, saut, descente ; Defender, Master,
// Scania (montée / descente) ; boutique (entrée / sortie) ; concours au Pôle (mission d'événement) ; caméra (tour
// complet, conduite au loin) ; baisse de cadence (mode « Auto ») ; région Paris ; sauvegarde et rechargement ;
// changement volontaire (polo acheté et équipé) conservé à cheval et au rechargement.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/avatar-consistency.mjs [étiquette]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const tag = process.argv[2] || 'apres';
const OUT = 'tests/e2e/out/avatar-consistency';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok, extra });
  if (!ok) fails++;
};
const AUTO = readFileSync('tests/e2e/autopilot.js', 'utf8');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
const boot = async (url) => {
  await page.goto(url, { timeout: 180000 });
  if (url.includes('autostart')) await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  else {
    await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 240000 });
    await page.tap('[data-id="continue"]');
    await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 120000 });
  }
  await page.addScriptTag({ content: AUTO });
  await E(() => {
    const A = window.__auto, g = window.__game;
    A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
    g.phone.notify = () => {};
    const p = g.player;
    // Compteur de reconstructions du personnage (changement de maillage).
    if (!p.__rb) {
      p.__rb = 0;
      const orig = p._rebuild.bind(p);
      p._rebuild = () => { p.__rb++; orig(); };
    }
    const S = (window.__S = {});
    // Signature visuelle du personnage : ce que le joueur voit (tenue, corps, modèle).
    S.sig = () => {
      const hu = g.player.human, r = g.realism?.body;
      // Le rendu réaliste n'est créé que par la boucle d'affichage : une mise à jour ici, comme avant chaque image.
      g.realism?.update();
      const r2 = g.realism?.body;
      const o = { ...hu.outfit };
      // Vêtements (sans le couvre-chef) ; casque porté (personnage classique et modèle réaliste).
      const clothes = { ...o };
      delete clothes.helmet;
      delete clothes.cap;
      return {
        outfit: JSON.stringify(o), clothes: JSON.stringify(clothes), helmet: !!o.helmet, realHelmet: r2 ? !!r2.helmet : null,
        mode: g.player.mode, comp: !!g.player.competitionOutfit?.(), hair: hu.model?.desc?.hair, mesh: hu.mesh.uuid,
        sex: hu.sex, scale: +hu.scale.toFixed(4), lod: hu.model?.lod ?? 0, real: !!r2, realOutfit: r2 ? r2.outfit === hu.outfit : null, rebuilds: g.player.__rb,
      };
    };
    S.ticks = (n, fn) => { for (let i = 0; i < n; i++) { fn?.(i); A.tick(1); g.realism?.update(); } };
    // Montée / descente à cheval par le bouton ACTION (séquence animée si elle existe, sinon montée immédiate).
    S.mountHorse = () => {
      const h = g.mainHorse, P = g.player;
      A.foot();
      h.setPosition(-104, 190, Math.PI / 2); h.ai = null; h.speed = 0;
      P.human.setPosition(-104, 188.4, 0);
      A.tick(4);
      g.interact.update();
      if (g.interact.current?.id === 'mount') g.interact.trigger(); else P.mount();
      S.ticks(30 * 8, () => {});
      return P.mode;
    };
    S.dismountHorse = () => {
      const P = g.player;
      g.interact.update();
      if (g.interact.current?.id === 'dismount') g.interact.trigger(); else P.dismount();
      S.ticks(30 * 8, () => {});
      return P.mode;
    };
    S.vehicle = (v) => {
      const P = g.player;
      A.foot();
      const dp = v.doorPoint ? v.doorPoint(1) : v.pos;
      P.human.setPosition(dp.x + 1.5, dp.z + 1.5, 0);
      A.tick(3);
      P.boarding.begin(v) || (v === g.truck ? P.enterTruck?.() : P.enterVehicle?.(v));
      S.ticks(30 * 14, () => {});
      const inside = P.mode;
      S.ticks(30 * 2, (i) => g.input.setVirtualMove(0, 0.5));
      g.input.setVirtualMove(0, 0);
      S.ticks(30 * 3, () => g.input.setVirtualMove(0, -0.6));
      g.input.setVirtualMove(0, 0);
      S.ticks(20);
      const far = S.sig();
      P.boarding.beginExit() || (v === g.truck ? P.exitTruck?.() : P.exitVehicle?.());
      S.ticks(30 * 14, () => {});
      return { inside, out: P.mode, far };
    };
  });
};

await boot(`${base}/?autostart`);
const sigs = [];
const snap = async (label) => {
  const s = await E(() => window.__S.sig());
  sigs.push({ label, ...s });
  return s;
};
const ref = await snap('départ (11 h, à pied)');
await E(() => {
  const g = window.__game, S = window.__S;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
  S.ticks(60, () => g.input.setVirtualMove(0, 0.5));
  S.ticks(60, () => { g.input.setVirtualMove(0, 1); g.input.held.add('gallop'); });
  g.input.held.delete('gallop');
  g.input.setVirtualMove(0, 0);
  S.ticks(20);
});
await snap('marche, course, arrêt');
// Soir et pluie (avant : le haut changeait de couleur à la reconstruction suivante, le casque apparaissait à cheval).
await E(() => {
  const g = window.__game;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 21.5 * 3600;
  if (g.weather) { g.weather.rain = 1; g.weather.force?.('rain'); }
  window.__S.ticks(10);
});
await snap('21 h 30, pluie');
const m1 = await E(() => window.__S.mountHorse());
await snap(`à cheval (${m1})`);
await E(() => {
  const g = window.__game, S = window.__S, A = window.__auto;
  for (const [mag, gal] of [[0.3, false], [0.55, false], [1, true]]) S.ticks(45, () => { g.input.setVirtualMove(0, mag); gal ? g.input.held.add('gallop') : g.input.held.delete('gallop'); });
  g.input.held.delete('gallop');
  const o = g.obstacles.ofCourse('home')?.[0] || g.obstacles.ofCourse('cso')?.[0];
  if (o) A.jumpObstacle(o);
  S.ticks(30, () => g.input.setVirtualMove(0, -1));
  g.input.setVirtualMove(0, 0);
  S.ticks(60);
});
await snap('pas, trot, galop, saut');
const d1 = await E(() => window.__S.dismountHorse());
await snap(`descente (${d1})`);
for (const [k, label] of [['defender', 'Defender'], ['van', 'Master'], ['truck', 'Scania']]) {
  const r = await E((k) => window.__S.vehicle(window.__game[k]), k);
  sigs.push({ label: `${label} : au volant, caméra de conduite`, ...r.far });
  await snap(`${label} : montée, conduite, descente (${r.inside} → ${r.out})`);
}
await E(async () => {
  const g = window.__game, S = window.__S;
  await g.shops.enter('boutique', { instant: true });
  S.ticks(30);
});
await snap('dans la boutique');
await E(async () => {
  const g = window.__game, S = window.__S;
  await g.shops.exit({ instant: true });
  S.ticks(30);
});
await snap('sortie de la boutique');
// Concours au Pôle (mission d'événement en cours, sur le terrain) : avant, la tenue de concours remplaçait la tenue.
await E(async () => {
  const g = window.__game, S = window.__S, M = g.missions;
  const { competitionDef } = await import('/src/gameplay/trip.js');
  g.save.data.money = Math.max(g.save.data.money, 200);
  if (!g.save.data.completed.includes('tuto')) g.save.data.completed.push('tuto');
  M.offers = [M._offerFromDef(competitionDef(1, 15), { id: 'event:concours' })];
  M.accept('event:concours');
  window.__auto.closeCards();
  while (g.hud.dialogActive) g.hud.advanceDialog();
  S.ticks(10);
});
await snap('concours accepté (encore loin du Pôle)');
await E(() => {
  const g = window.__game, S = window.__S;
  g.player.teleport(300, -205, 0, false);
  S.ticks(40);
});
await snap('concours du Pôle en cours, sur le terrain');
await E(() => {
  const g = window.__game, S = window.__S;
  g.missions.abandon?.();
  window.__auto.closeCards();
  S.ticks(30, () => (g.input.look.dx = 30));
  g.input.look.dx = 0;
  // Baisse de cadence en mode « Auto » (avant : le joueur passait au personnage classique en pleine partie).
  g.realism?.autoFallback?.();
  S.ticks(10);
});
await snap('tour de caméra, baisse de cadence (Auto)');
await E(async () => {
  const g = window.__game, S = window.__S;
  const { PARIS } = await import('/src/world/sites.js');
  const c = PARIS.arena || PARIS.hall || PARIS;
  g.setRegion('paris');
  g.player.teleport((c.x ?? 4000) + 30, (c.z ?? 0) + 40, 0, false);
  S.ticks(30);
  g.setRegion('deauville');
  g.player.teleport(-104, 186, 0, false);
  S.ticks(30);
});
await snap('région Paris, puis retour');
await E(() => window.__game.saveNow());
const preReload = await E(() => window.__S.sig());
await boot(base);
const afterReload = await snap('sauvegarde et rechargement');

// Comparaison : tout ce qui précède doit être identique à la signature de départ (hors compteur de reconstructions).
// Identité (corps, visage, coiffure, taille, modèle) : partout la même.
const ident = (a, b) => a.sex === b.sex && a.scale === b.scale && a.hair === b.hair && a.lod === b.lod && a.real === b.real && a.realOutfit !== false;
const diffs = sigs.filter((s) => !ident(s, ref)).map((s) => s.label);
check('AV-01', 'même personnage dans toutes les situations (corps, visage, coiffure, taille, niveau de détail, modèle réaliste)', diffs.length === 0, diffs.length ? `différent : ${diffs.join(' · ')}` : `${sigs.length} situations`);
// Vêtements : la tenue de référence partout, sauf pendant une mission de concours (tenue de concours, où que l'on soit).
const refClothes = ref.clothes;
const clothesBad = sigs.filter((s) => (s.comp ? !/"jacket":true/.test(s.clothes) || !/f2f1ec/.test(s.clothes) : s.clothes !== refClothes)).map((s) => s.label);
check('AV-01b', 'vêtements : tenue de référence (culotte beige) partout ; tenue de concours seulement en mission de concours', clothesBad.length === 0 && /c2b49a/.test(refClothes) && sigs.some((s) => s.comp), clothesBad.length ? clothesBad.join(' · ') : `${sigs.filter((s) => s.comp).length} situation(s) en concours`);
// Casque : uniquement à cheval (personnage classique et modèle réaliste).
const helmetBad = sigs.filter((s) => s.helmet !== (s.mode === 'ride') || (s.realHelmet !== null && s.realHelmet !== s.helmet)).map((s) => `${s.label} (${s.mode}, casque ${s.helmet})`);
check('AV-01c', 'casque uniquement à cheval', helmetBad.length === 0, helmetBad.length ? helmetBad.join(' · ') : 'ok');
check('AV-01d', 'même maillage du début à la fin de la partie (rhabillé sur place, jamais recréé)', new Set(sigs.filter((s) => s.label !== 'sauvegarde et rechargement').map((s) => s.mesh)).size === 1, String(new Set(sigs.map((s) => s.mesh)).size));
const rebuilds = sigs.filter((s) => s.label !== 'sauvegarde et rechargement').reduce((m, s) => Math.max(m, s.rebuilds), 0);
check('AV-02', 'aucune reconstruction du personnage pendant la partie', rebuilds === 0, `${rebuilds} reconstruction(s)`);
check('AV-03', 'rechargement : même apparence', ident(afterReload, preReload) && afterReload.outfit === preReload.outfit, JSON.stringify({ avant: preReload.outfit === afterReload.outfit, real: [preReload.real, afterReload.real] }));

// Changement volontaire : polo blanc acheté et équipé → la tenue change une fois, puis reste la même partout.
const vol = await E(() => {
  const g = window.__game, S = window.__S, d = g.save.data;
  const s0 = S.sig();
  d.money = Math.max(d.money, 500);
  (d.owned ||= []);
  g.commerce.purchase('polo_blanc');
  g.commerce.equip('polo_blanc');
  S.ticks(20);
  const s1 = S.sig();
  S.mountHorse();
  const s2 = S.sig();
  S.dismountHorse();
  const s3 = S.sig();
  g.saveNow();
  return { s0, s1, s2, s3 };
});
await boot(base);
const s4 = await E(() => window.__S.sig());
check('AV-04', 'changement volontaire (polo blanc équipé) : appliqué une fois, conservé à cheval, à pied et au rechargement', vol.s1.clothes !== vol.s0.clothes && /f2f1ec/.test(vol.s1.clothes) && vol.s2.clothes === vol.s1.clothes && vol.s2.helmet && vol.s3.clothes === vol.s1.clothes && !vol.s3.helmet && s4.clothes === vol.s1.clothes, JSON.stringify({ change: vol.s1.clothes !== vol.s0.clothes, cheval: vol.s2.clothes === vol.s1.clothes, casqueACheval: vol.s2.helmet, recharge: s4.clothes === vol.s1.clothes }));
check('erreurs', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/${tag}.json`, JSON.stringify({ tag, base, sigs, results }, null, 1));
console.log(fails ? `${fails} échec(s)` : 'tout est vert');
await browser.close();
process.exit(fails ? 1 : 0);
