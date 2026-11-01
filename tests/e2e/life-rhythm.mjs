// Rythme de vie (navigateur, iPhone 13 émulé en paysage 844 × 390, écran tactile ; rendu logiciel SwiftShader : ce
// n'est pas un test sur iPhone réel) :
//  1. lisibilité du HUD : période et heure (matin, après-midi, soir, nuit), jauge d'énergie aux quatre paliers ;
//  2. baisse progressive de l'énergie (temps qui passe, course plus coûteuse que l'attente, nuit plus coûteuse),
//     avertissements progressifs, effets légers (course ralentie) ;
//  3. horaires des missions (aucune nouvelle demande la nuit) et refus expliqué (hors horaires, épuisement) au
//     téléphone et à l'acceptation, mission légère toujours possible ;
//  4. maison et lit : entrée, lit, menu (sieste, journée suivante, nuit), refus pendant une mission ;
//  5. sieste (+25, 1 h 30), café (gain dégressif, plafonné, payant), nuit (réveil 7 h, 100 %, sauvegarde, carte
//     « nouvelle journée »), nuit courte (récupération partielle) ;
//  6. persistance après sauvegarde et rechargement.
// Captures dans tests/e2e/out/life/.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/life';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  results.push({ label, ok: !!cond, extra });
  if (!cond) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ev = (fn, arg) => page.evaluate(fn, arg);
const tick = (n = 1) => ev((k) => window.__auto.tick(k), n);
const boot = async () => {
  await page.goto(`${base}/?autostart`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
};
const shot = async (name, clip = null) => {
  await ev(() => { const g = window.__game; g.hud._lifeT = 0; g.hud.update(0); g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky); g.renderer.render(g.scene, g.camera); });
  await page.waitForTimeout(700); // transitions CSS de la jauge
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
};
const tapSel = async (sel) => {
  const bb = await page.locator(sel).first().boundingBox();
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
};
const setHour = (h) => ev((h) => { const g = window.__game, d = g.save.data; d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + h * 3600; g.energy.sync(); g.hud._lifeT = 0; g.hud.update(0); }, h);
const walkTo = (x, z, max = 500) => ev(([x, z, max]) => {
  const g = window.__game, A = window.__auto;
  const p = g.player.human.pos;
  for (let i = 0; i < max; i++) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 0.35) return true;
    A.steer((x - p.x) / d, (z - p.z) / d, d > 2 ? 0.7 : 0.35);
    A.tick(1);
  }
  window.__auto.steer(0, 0, 0);
  return Math.hypot(x - p.x, z - p.z) < 0.7;
}, [x, z, max]);
const act = () => ev(() => { const g = window.__game; g.interact.update(); const c = g.interact.current; if (c) g.interact.trigger(); return c?.label || null; });
const life = () => ev(() => { const g = window.__game, d = g.save.data; g.hud._lifeT = 0; g.hud._updateLife(0); return { e: +g.energy.value.toFixed(2), tier: g.energy.tier, hour: +g.hour().toFixed(3), day: Math.floor(d.gameTime / 86400), coffees: d.life.coffees, naps: d.life.naps, money: d.money, chip: document.querySelector('.life-line')?.textContent, period: document.querySelector('.life-line')?.dataset.period, chipTier: document.querySelector('.life-line')?.dataset.tier }; });
const HUD_CLIP = { x: 500, y: 0, width: 344, height: 80 };

await boot();
await ev(() => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.missions.timer = 1e6;
  g.syncFade = true;
  g.save.data.money = 200;
  g.save.data.flags.stridesNotice = true; // (présentation de l'app déjà vue)
  g.updateWallet();
});

// ---------- 1. Lisibilité : périodes et paliers ----------
const per = {};
for (const [h, name] of [[8.25, 'matin'], [14.5, 'apresmidi'], [19.75, 'soir'], [23.5, 'nuit']]) {
  await setHour(h);
  await tick(2);
  per[name] = await life();
  await shot(`1-hud-${name}`, HUD_CLIP);
}
check('HUD : période et heure lisibles (Matin 8:15, Après-midi 14:30, Soir 19:45, Nuit 23:30)',
  per.matin.chip.startsWith('Matin 8:15') && per.apresmidi.chip.startsWith('Après-midi 14:30') && per.soir.chip.startsWith('Soir 19:45') && per.nuit.chip.startsWith('Nuit 23:30') && per.nuit.period === 'nuit',
  Object.values(per).map((x) => x.chip).join(' | '));
await setHour(10);
const tiers = {};
for (const e of [85, 50, 25, 8]) {
  await ev((e) => window.__game.energy.set(e), e);
  await tick(2);
  tiers[e] = await life();
  await shot(`1-jauge-${e}`, HUD_CLIP);
}
check('jauge : 4 paliers (en forme, légère fatigue, fatigue, épuisement) signalés par la couleur', tiers[85].chipTier === 'high' && tiers[50].chipTier === 'medium' && tiers[25].chipTier === 'low' && tiers[8].chipTier === 'critical', Object.entries(tiers).map(([k, v]) => `${k}:${v.chipTier}`).join(' '));
// Fiche Énergie (toucher la jauge).
// (la notification « Épuisement », en haut de l'écran, se referme d'elle-même ; on la ferme ici)
await ev(() => { const g = window.__game; window.__auto.closeCards(); g.hud.notifQueue = []; if (g.hud.notifActive) g.hud._closeNotif(); });
await page.waitForTimeout(500);
await tapSel('.life-line');
await page.waitForTimeout(500);
const card = await ev(() => document.querySelector('.overlay h2')?.textContent);
await shot('1-fiche-energie');
check('toucher la jauge : fiche Énergie (niveau, effets, nuit, sieste, café)', /Énergie 8 %/.test(card || ''), card);
await ev(() => window.__auto.closeCards());

// ---------- 2. Baisse progressive ----------
const drop = await ev(() => {
  const g = window.__game, d = g.save.data, A = window.__auto;
  g.energy.set(100);
  d.life.notified = '';
  g.energy._tier = 'high';
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 7 * 3600;
  g.energy.sync();
  // Une journée qui passe (pas de 1 min de jeu), à pied et immobile.
  const curve = [];
  for (let m = 0; m < 16 * 60; m++) {
    d.gameTime += 60;
    g.energy.update();
    if (m % 60 === 59) curve.push(+g.energy.value.toFixed(1));
  }
  // Course (vraies images de jeu) contre attente, même durée.
  const run = (sprint) => {
    g.energy.set(80);
    g.energy.sync();
    const e0 = g.energy.value, t0 = d.gameTime;
    for (let i = 0; i < 240; i++) {
      if (sprint) { A.steer(1, 0, 1); g.input.held?.add?.('gallop'); } else A.steer(0, 0, 0);
      A.tick(1);
    }
    g.input.held?.delete?.('gallop');
    A.steer(0, 0, 0);
    return { lost: e0 - g.energy.value, hours: (d.gameTime - t0) / 3600 };
  };
  const idle = run(false), sprint = run(true);
  // La nuit fatigue plus : une heure à 3 h contre une heure à 15 h.
  const hourAt = (h) => { g.energy.set(60); d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + h * 3600; g.energy.sync(); const e0 = g.energy.value; for (let m = 0; m < 60; m++) { d.gameTime += 60; g.energy.update(); } return e0 - g.energy.value; };
  return { curve, idle, sprint, day: hourAt(15), night: hourAt(3) };
});
writeFileSync(`${OUT}/courbe-energie.json`, JSON.stringify(drop, null, 1));
const c = drop.curve;
check('baisse progressive sur une journée (7 h → 23 h, sans activité) : de 100 % à ~68 %, régulière, jamais brutale', c.every((v, i) => i === 0 || v < c[i - 1]) && c[c.length - 1] > 60 && c[c.length - 1] < 75 && c.every((v, i) => i === 0 || c[i - 1] - v < 3.5), c.join(' '));
check('courir coûte plus que rester immobile (même durée)', drop.sprint.lost / drop.sprint.hours > drop.idle.lost / drop.idle.hours * 1.3, JSON.stringify({ idle: drop.idle, sprint: drop.sprint }));
check('la nuit fatigue 1,5 fois plus que le jour', Math.abs(drop.night / drop.day - 1.5) < 0.05, `${drop.day.toFixed(2)} / ${drop.night.toFixed(2)}`);
// Avertissements progressifs.
const warn = await ev(() => {
  const g = window.__game, d = g.save.data;
  d.life.notified = '';
  g.energy._tier = 'high';
  const notifs = [];
  const n0 = g.hud.notify;
  g.hud.notify = (n) => { notifs.push(n.title); };
  const toasts = [];
  const t0 = g.hud.toast.bind(g.hud);
  g.hud.toast = (t, i) => { toasts.push(t); return t0(t, i); };
  let hint = '';
  const h0 = g.hud.hint.bind(g.hud);
  g.hud.hint = (t, ms) => { hint = t; return h0(t, ms); };
  g.energy.set(58); g.energy.set(57);
  g.energy.set(33);
  g.energy.set(12);
  g.hud.notify = n0;
  g.hud.toast = t0;
  g.hud.hint = h0;
  return { toasts, hint, notifs };
});
check('avertissements progressifs : léger (58 %), net (33 %), incitation à rentrer (12 %)', warn.toasts.some((t) => /Un peu de fatigue/.test(t)) && /Fatigue/.test(warn.hint) && warn.notifs.includes('Épuisement'), JSON.stringify(warn));
// Effets légers : course plus lente (pas de blocage).
const speeds = await ev(() => {
  const g = window.__game, A = window.__auto;
  const top = (e) => {
    g.energy.set(e);
    g.input.held.delete('gallop');
    A.steer(0, 0, 0);
    for (let i = 0; i < 40; i++) A.tick(1);
    let v = 0;
    for (let i = 0; i < 90; i++) { A.steer(0, 1, 1); A.tick(1); v = Math.max(v, g.player.human.speed); }
    A.steer(0, 0, 0);
    for (let i = 0; i < 30; i++) A.tick(1);
    return +v.toFixed(2);
  };
  return { high: top(90), low: top(25), critical: top(8) };
});
check('effets légers : course −5 % fatigué, −10 % épuisé (jamais bloquée)', Math.abs(speeds.low / speeds.high - 0.95) < 0.01 && Math.abs(speeds.critical / speeds.high - 0.9) < 0.01, JSON.stringify(speeds));

// ---------- 3. Missions : horaires et fatigue ----------
const offersAt = (h) => ev((h) => {
  const g = window.__game, d = g.save.data;
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + h * 3600;
  g.energy.sync();
  if (!d.completed.includes('tuto')) d.completed.push('tuto');
  g.missions.offers = [];
  for (let i = 0; i < 8; i++) g.missions.refreshOffers(false);
  return g.missions.offers.filter((o) => o.id.startsWith('job:')).map((o) => `${o.def.category}:${o.title}`);
}, h);
const jobsDay = await offersAt(10), jobsNight = await offersAt(2), jobsEve = await offersAt(21.5);
check('demandes ordinaires : en journée, quelques-unes le soir, aucune la nuit', jobsDay.length >= 3 && jobsNight.length === 0 && jobsEve.every((j) => /Soins du soir/.test(j)), JSON.stringify({ jobsDay, jobsEve, jobsNight }));
// Mission exigeante (concours de cross) : refusée épuisé, avec l'explication, au téléphone et à l'acceptation.
const setup = await ev(() => {
  const g = window.__game, d = g.save.data;
  for (const id of ['tuto', 'm1', 'm2', 'm3', 'groom', 'livraison', 'fugueur', 'plage', 'transport', 'fer']) if (!d.completed.includes(id)) d.completed.push(id);
  d.reputation = Math.max(d.reputation, 900);
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 10 * 3600;
  g.energy.sync();
  g.energy.set(9);
  g.missions.offers = [];
  g.missions.refreshOffers(false);
  const o = g.missions.offers.find((x) => x.id === 'story:cross');
  return { found: !!o, av: o && g.missions.availability(o) };
});
await ev(() => window.__game.phone.open('request', { id: 'story:cross' }));
await page.waitForTimeout(500);
const reqTired = await ev(() => ({ badge: document.querySelector('.st-request .badge-st')?.textContent, reason: document.querySelector('.unavail-card')?.textContent, bar: document.querySelector('[data-id="unavailable-request"]')?.textContent, accept: !!document.querySelector('[data-id="accept-request"]'), home: !!document.querySelector('[data-id="route-home"]') }));
await shot('3-demande-trop-fatigant');
check('téléphone : mission exigeante épuisé → « TROP FATIGANT », raison claire, pas de bouton Accepter, itinéraire vers la maison', setup.found && reqTired.badge === 'TROP FATIGANT' && /Énergie trop basse \(9 %\)/.test(reqTired.reason || '') && !reqTired.accept && reqTired.home, JSON.stringify(reqTired));
await ev(() => { const s = document.querySelector('.st-request .app-body'); if (s) s.scrollTop = 1e4; });
await shot('3-demande-details-effort');
const refused = await ev(() => {
  const g = window.__game;
  g.phone.close();
  let toast = '';
  const t0 = g.hud.toast.bind(g.hud);
  g.hud.toast = (t, i) => { toast = t; return t0(t, i); };
  const ok = g.missions.accept('story:cross');
  g.hud.toast = t0;
  return { ok, toast, active: !!g.missions.active };
});
check('acceptation refusée épuisé, avec l’explication', refused.ok === false && !refused.active && /Énergie trop basse/.test(refused.toast), refused.toast);
// Hors horaires (23 h, en forme).
const late = await ev(() => {
  const g = window.__game, d = g.save.data;
  g.energy.set(90);
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 23 * 3600;
  g.energy.sync();
  const o = g.missions.offers.find((x) => x.id === 'story:cross');
  return g.missions.availability(o);
});
await ev(() => window.__game.phone.open('request', { id: 'story:cross' }));
await page.waitForTimeout(500);
const reqLate = await ev(() => ({ badge: document.querySelector('.st-request .badge-st')?.textContent, reason: document.querySelector('.unavail-card')?.textContent }));
await shot('3-demande-hors-horaires');
check('hors horaires (23 h) : « HORS HORAIRES » et créneau du client', late.kind === 'hours' && reqLate.badge === 'HORS HORAIRES' && /Disponible de 7 h à 21 h/.test(reqLate.reason || ''), JSON.stringify(reqLate));
await ev(() => window.__game.phone.close());
// Accueil Strides la nuit : note claire.
await ev(() => window.__game.phone.open('strides', { tab: 'missions' }));
await page.waitForTimeout(400);
const note = await ev(() => document.querySelector('[data-id="life-note"]')?.textContent);
await shot('3-strides-nuit');
check('app Strides la nuit : « les clients te recontacteront demain matin »', /C’est la nuit/.test(note || ''), note);
await ev(() => window.__game.phone.close());
// Mission légère toujours possible même fatigué (liberté) : groom du matin à 8 h, énergie 9 %.
const light = await ev(() => {
  const g = window.__game, d = g.save.data;
  d.completed = d.completed.filter((x) => x !== 'groom');
  d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 8 * 3600;
  g.energy.sync();
  g.energy.set(9);
  g.missions.offers = [];
  g.missions.refreshOffers(false);
  const ok = g.missions.accept('story:groom');
  const active = g.missions.active?.def.id;
  return { ok, active };
});
check('mission légère acceptée même épuisé (liberté du joueur)', light.ok && light.active === 'groom', JSON.stringify(light));

// ---------- 4. Maison et lit ----------
// Refus de se coucher pendant une mission.
const blocked = await ev(() => {
  const g = window.__game;
  const t0 = g.save.data.gameTime;
  let toast = '';
  const f = g.hud.toast.bind(g.hud);
  g.hud.toast = (t, i) => { toast = t; return f(t, i); };
  g.rest.openBed();
  g.hud.toast = f;
  return { toast, moved: g.save.data.gameTime !== t0, card: !!document.querySelector('.overlay') };
});
check('lit refusé pendant une mission (sans sauter le temps)', /Termine ou abandonne/.test(blocked.toast) && !blocked.moved && !blocked.card, blocked.toast);
await ev(() => { const g = window.__game; g.missions.abandon(); window.__auto.closeCards(); g.missions.timer = 1e6; });
const hasHome = await ev(() => !!window.__game.home);
let bedLabel = null;
if (hasHome) {
  // Entrée par la porte, chambre, lit.
  const door = await ev(() => window.__game.home.anchor('door'));
  await ev((p) => { const g = window.__game; g.player.human.setPosition(p.x, p.z + 3, Math.PI); g.cam.snap(g.player.human.pos, Math.PI); window.__auto.tick(6); }, door);
  await walkTo(door.x, door.z);
  const ent = await act();
  await page.waitForFunction(() => window.__game.home.inside, null, { timeout: 8000 }).catch(() => {});
  await tick(6);
  check('maison : « Entrer » à la porte, puis à l’intérieur', ent === 'Entrer' && (await ev(() => window.__game.home.inside)), ent);
  await shot('4-maison-entree');
  const bed = await ev(() => window.__game.home.anchor('bed'));
  // Par les passages (salon → chambre), comme un joueur : repère local de la maison (origine = centre).
  const O = { x: bed.x + 4.45, z: bed.z - 0.35 };
  let reached = true;
  for (const [lx, lz] of [[0.5, 0.3], [0.5, -1.05], [-1.5, -1.05], [-2.6, 1.2], [-4.45, 0.35]]) reached = (await walkTo(O.x + lx, O.z + lz, 600)) && reached;
  await ev(() => { const g = window.__game; g.interact.update(); });
  bedLabel = await ev(() => window.__game.interact.current?.label || null);
  await ev((b) => { const g = window.__game; if (b.heading !== undefined) g.player.human.heading = b.heading; g.cam.snap(g.player.human.pos, g.player.human.heading); window.__auto.tick(8); }, bed);
  await shot('4-chambre-lit');
  check('chambre : le lit est atteint à pied et propose « Se coucher »', reached && bedLabel === 'Se coucher', `${reached} ${bedLabel}`);
} else {
  const door = await ev(() => window.__game.rest.homeDoor());
  await ev((p) => { const g = window.__game; g.player.human.setPosition(p.x, p.z + 3, Math.PI); g.cam.snap(g.player.human.pos, Math.PI); window.__auto.tick(6); }, door);
  await walkTo(door.x, door.z);
  await ev(() => window.__game.interact.update());
  bedLabel = await ev(() => window.__game.interact.current?.label || null);
  check('maison (sans intérieur) : « Se reposer » à la porte', bedLabel === 'Se reposer', bedLabel);
}

// ---------- 5. Sieste, café, nuit ----------
// Sieste à 14 h, énergie 30 %.
await ev(() => { const g = window.__game, d = g.save.data; d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 14 * 3600; g.energy.sync(); g.energy.sleep(8); g.energy.set(30); g.save.data.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 14 * 3600; g.energy.sync(); });
await act();
await page.waitForTimeout(400);
const bedMenu = await ev(() => [...document.querySelectorAll('.overlay [data-choice]')].map((b) => `${b.dataset.choice}${b.classList.contains('off') ? '(off)' : ''}`));
await shot('5-lit-menu-journee');
check('lit en journée : passer à la journée suivante, sieste, nuit (grisée avant 19 h), rester debout', bedMenu.join(',') === 'nextday,nap,night(off),cancel', bedMenu.join(','));
const n0 = await life();
await tapSel('.overlay [data-choice="nap"]');
await page.waitForTimeout(300);
await tick(3);
const n1 = await life();
await shot('5-apres-sieste');
check('sieste : +25 (30 % → 55 %), 1 h 30 plus tard (14:00 → 15:30), partie sauvegardée', Math.abs(n1.e - 55) < 0.5 && Math.abs(n1.hour - 15.5) < 0.05 && n1.naps === 1, JSON.stringify({ n0, n1 }));
// Seconde sieste : moins efficace.
const nap2 = await ev(() => { const g = window.__game; const e0 = g.energy.value; g.rest.nap(); return g.energy.value - e0; });
check('seconde sieste moins efficace (+15), plafond 80 %', Math.abs(nap2 - 15) < 0.5, nap2.toFixed(1));
// Café au Galop.
await ev(() => { const g = window.__game, A = window.__auto; g.energy.set(30); const d = g.shops.doorOut('cafe'); g.player.human.setPosition(d.x, d.z - 0.2, 0); g.cam.snap(g.player.human.pos, 0); A.tick(6); });
await page.waitForFunction(() => window.__game.shops.loaded.has('cafe'), null, { timeout: 20000 }).catch(() => {});
await act();
await page.waitForFunction(() => window.__game.indoor?.id === 'cafe' && !window.__game.shops.busy, null, { timeout: 8000 }).catch(() => {});
await tick(6);
await walkTo(...Object.values(await ev(() => window.__game.shops.toW('cafe', -1.6, -0.55))));
await act();
await tick(2);
await ev(() => { const g = window.__game; while (g.hud.dialogActive) g.hud.advanceDialog(); });
await tick(2);
const cafe = [];
for (let i = 0; i < 4; i++) {
  const before = await life();
  await tapSel('.overlay [data-item="cafe"] button');
  await page.waitForTimeout(900);
  const after = await life();
  cafe.push({ gain: +(after.e - before.e).toFixed(1), paid: +(before.money - after.money).toFixed(2), label: await ev(() => document.querySelector('.overlay [data-item="cafe"] button')?.textContent) });
  if (i === 0) await shot('5-cafe-carte');
}
await shot('5-cafe-quatrieme');
check('café : « Prendre un café » 1,80 € chacun, +12, +7, +3 puis plus d’effet (ne remplace pas une nuit)', cafe.map((x) => x.gain).join(',') === '12,7,3,0' && cafe.every((x) => Math.abs(x.paid - 1.8) < 0.001) && /Prendre un café/.test(cafe[0].label), JSON.stringify(cafe));
const cap = await ev(() => { const g = window.__game; g.save.data.life.coffees = 0; g.energy.set(66); return g.energy.coffee(); });
check('café plafonné à 70 % (66 % → 70 %)', Math.abs(cap - 4) < 0.01, cap);
await ev(() => { window.__auto.closeCards(); window.__game.shops.exit({ instant: true }); });
await tick(2);
// Nuit : coucher à 22 h 30 avec 25 %.
await ev(() => { const g = window.__game, d = g.save.data; const p = g.rest.homeDoor(); g.player.human.setPosition(p.x, p.z, Math.PI); g.energy.set(25); d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 22.5 * 3600; g.energy.sync(); });
const dayBefore = (await life()).day;
await ev(() => window.__game.rest.openBed());
await page.waitForTimeout(300);
const nightMenu = await ev(() => [...document.querySelectorAll('.overlay [data-choice]')].map((b) => `${b.dataset.choice}${b.classList.contains('off') ? '(off)' : ''}`));
await shot('5-lit-menu-soir');
check('lit le soir : dormir jusqu’au matin, sieste, rester debout', nightMenu.join(',') === 'night,nap,cancel', nightMenu.join(','));
await tapSel('.overlay [data-choice="night"]');
await page.waitForTimeout(500);
const wake = await life();
const newDay = await ev(() => ({ title: document.querySelector('.overlay h2')?.textContent, body: document.querySelector('.overlay .card-body')?.textContent }));
const stored = await ev(() => { const g = window.__game; const raw = localStorage.getItem(g.save.key); const s = raw && JSON.parse(raw); return s ? { e: s.life?.energy, t: s.gameTime } : null; });
await shot('5-nouvelle-journee');
check('nuit : réveil le lendemain à 7:00, énergie 100 %, cafés et siestes remis à zéro', wake.day === dayBefore + 1 && Math.abs(wake.hour - 7) < 0.02 && wake.e === 100 && wake.coffees === 0 && wake.naps === 0, JSON.stringify(wake));
check('nouvelle journée : carte claire (durée, énergie avant → après, sauvegarde)', /Bonjour/.test(newDay.title || '') && /8 h 30/.test(newDay.body || '') && /25 % → 100 %/.test(newDay.body || '') && /sauvegardée/.test(newDay.body || ''), newDay.body);
check('sauvegarde automatique au réveil (énergie et heure enregistrées)', stored && stored.e === 100 && Math.abs(((stored.t / 3600) % 24) - 7) < 0.02, JSON.stringify(stored));
await tapSel('.overlay [data-id="newday-ok"]');
await tick(4);
await shot('5-matin-hud', HUD_CLIP);
check('HUD au réveil : « Matin 7:00 », 100 %', /^Matin 7:0\d/.test((await life()).chip || ''), (await life()).chip);
// Nuit trop courte : coucher à 3 h → 4 h de sommeil, récupération partielle.
const short = await ev(() => { const g = window.__game, d = g.save.data; g.energy.set(20); d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 3 * 3600; g.energy.sync(); g.rest.sleep('night'); return { e: g.energy.value, h: g.hour() }; });
await ev(() => window.__auto.closeCards());
check('nuit courte (3 h → 7 h) : récupération partielle (20 % → 76 %)', Math.abs(short.e - 76) < 0.5 && Math.abs(short.h - 7) < 0.02, JSON.stringify(short));
// Énergie du cheval au réveil.
check('le cheval aussi est reposé au réveil', (await ev(() => Math.round(window.__game.mainHorse.cond.energy))) === 100);

// ---------- 6. Persistance après rechargement ----------
await ev(() => { const g = window.__game, d = g.save.data; g.energy.set(42.5); d.life.coffees = 2; d.life.naps = 1; d.gameTime = Math.floor(d.gameTime / 86400) * 86400 + 16 * 3600; g.energy.sync(); g.saveNow(); });
await boot();
await ev(() => { const A = window.__auto; A.stopLoop(); A.closeCards(); });
const reload = await life();
check('rechargement : énergie, cafés et siestes du jour conservés', Math.abs(reload.e - 42.5) < 1 && reload.coffees === 2 && reload.naps === 1, JSON.stringify(reload));
// Ancienne sauvegarde (sans rythme de vie) : 100 % par défaut, rien ne casse.
const legacy = await ev(() => { const g = window.__game; const d = g.save.data; delete d.life; return { e: g.energy.value, life: JSON.stringify(d.life) }; });
check('ancienne sauvegarde sans énergie : 100 % par défaut', legacy.e === 100, JSON.stringify(legacy));

console.log('ERREURS', errors.length ? errors.join('\n') : 'aucune');
writeFileSync(`${OUT}/resultats.json`, JSON.stringify({ results, errors }, null, 1));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
