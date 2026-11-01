// Maison de l'Écurie du Val (navigateur, iPhone 13 émulé en paysage 844 × 390, écran tactile) :
// - intérieur non construit au loin, construit à l'approche (par étapes), jamais dessiné tant que le joueur est dehors ;
// - arrivée à cheval, pied à terre, entrée par la porte (action « Entrer ») : le cheval reste dehors, immobile, et
//   rien de ce qui est dehors n'est proposé à travers les murs (monter, longe) ;
// - caméra intérieure : dans la maison, sous le plafond, jamais dans une cloison, sur un parcours de toutes les pièces
//   (passages praticables) ; collisions des cloisons, du mobilier et des murs ;
// - lit : « Se coucher » proposé au bord du lit, jamais depuis la salle de bain voisine ; menu du sommeil (g.rest.openBed)
//   s'il existe, sinon un message ; personnage allongé (lieDown) ;
// - gestes du quotidien (évier, lavabo) ; captures de chaque pièce le jour et la nuit ;
// - sortie devant la porte, sauvegarde faite dans la maison puis rechargement : reprise à l'intérieur ; ancienne
//   sauvegarde sans indoorHome : reprise dehors, normalement.
// Captures dans tests/e2e/out/home/ (rendu logiciel SwiftShader). BASE=http://127.0.0.1:5174 pour un autre serveur.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/home';
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
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const ev = (fn, arg) => page.evaluate(fn, arg);
const tick = (n = 1) => ev((k) => window.__auto.tick(k), n);
// Notifications et fiches fermées avant chaque capture (demandes de missions qui arrivent pendant le test).
const quiet = () => ev(() => {
  const g = window.__game;
  g.hud.notifQueue.length = 0;
  g.hud._closeNotif?.();
  window.__auto.closeCards();
});
const shot = async (name) => {
  await quiet();
  await ev(() => { const g = window.__game; g.interact.update(); g.hud.update?.(0); g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky, g.player.focus.pos); g.realism?.update(); g.renderer.render(g.scene, g.camera); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 });
};
const setHour = (hr) => ev((h) => { const g = window.__game; g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + h * 3600; }, hr);
// Point du repère de la maison → monde.
const W = (lx, lz) => ev(([lx, lz]) => { const H = window.__H.HOME.house; return { x: H.x + lx, z: H.z + lz }; }, [lx, lz]);
// Va (à pied) jusqu'au point (x, z) en ligne droite, sans traverser les collisions.
const walkTo = (x, z, max = 400) => ev(([x, z, max]) => {
  const g = window.__game, A = window.__auto;
  const p = g.player.human.pos;
  for (let i = 0; i < max; i++) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 0.3) return true;
    A.steer((x - p.x) / d, (z - p.z) / d, d > 2 ? 0.7 : 0.35);
    A.tick(1);
  }
  A.steer(0, 1, 0);
  return Math.hypot(x - p.x, z - p.z) < 0.6;
}, [x, z, max]);
const walkL = async (lx, lz, max) => walkTo(...Object.values(await W(lx, lz)), max);
// Suite de points locaux (par les passages).
const go = async (pts) => {
  let ok = true;
  for (const [lx, lz] of pts) ok = (await walkL(lx, lz, 500)) && ok;
  return ok;
};
const BED_TO_DOOR = [[-2.6, 1.2], [-1.5, -1.05], [0.5, -1.05], [0.6, 0.6], [1.3, 2.4], [1.3, 3.1]];
// Pousse le joueur dans une direction (monde) pendant n images ; renvoie sa position locale finale.
const push = (dx, dz, n = 60) => ev(([dx, dz, n]) => {
  const g = window.__game, A = window.__auto, H = window.__H.HOME.house;
  for (let i = 0; i < n; i++) {
    A.steer(dx, dz, 0.8);
    A.tick(1);
  }
  A.steer(0, 1, 0);
  A.tick(2);
  const p = g.player.human.pos;
  return { x: +(p.x - H.x).toFixed(2), z: +(p.z - H.z).toFixed(2) };
}, [dx, dz, n]);
const act = () => ev(() => { const g = window.__game; g.interact.update(); const c = g.interact.current; if (c) g.interact.trigger(); return c?.label || null; });
const current = () => ev(() => { const g = window.__game; g.interact.update(); return g.interact.current ? { id: g.interact.current.id, label: g.interact.current.label, icon: g.interact.current.icon } : null; });
const waitIdle = () => page.waitForFunction(() => !window.__game.home.busy, null, { timeout: 5000 });
// Place le joueur au point local (lx, lz), tourné vers (tx, tz), caméra recalée derrière lui.
const pose = (lx, lz, tx, tz) => ev(([lx, lz, tx, tz]) => {
  const g = window.__game, H = window.__H.HOME.house;
  const p = g.player.human;
  p.setPosition(H.x + lx, H.z + lz, Math.atan2(tx - lx, tz - lz));
  g.cam.snap(p.pos, p.heading);
  window.__auto.tick(8);
}, [lx, lz, tx, tz]);
// État de la caméra : dans la maison, sous le plafond, hors des murs et des cloisons.
const camState = () => ev(() => {
  const g = window.__game, H = window.__H.HOME.house;
  const c = g.camera.position, p = g.player.human.pos;
  return {
    inside: g.home.contains(c.x, c.z, -0.1),
    blocked: g.colliders.cameraBlocked(c.x, c.z, c.y, 0.05),
    y: +(c.y - g.world.house.y).toFixed(2),
    room: g.home.room(c.x, c.z), proom: g.home.room(p.x, p.z),
    dist: +Math.hypot(c.x - p.x, c.z - p.z).toFixed(2),
    lx: +(c.x - H.x).toFixed(2), lz: +(c.z - H.z).toFixed(2),
  };
});

await ev(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  window.__H = { ...(await import('/src/world/homeGeo.js')), HOME: (await import('/src/world/sites.js')).HOME };
});
await setHour(15);

// ---------- Au loin : rien de construit ----------
const far = await ev(() => {
  const g = window.__game, A = window.__auto, H = window.__H.HOME.house;
  g.player.human.setPosition(H.x - 30, H.z + 70, 0);
  A.tick(5);
  return { interior: !!g.world.house.interior, steps: !!g.world.house.steps, saved: g.save.data.indoorHome, d: Math.round(Math.hypot(g.player.human.pos.x - H.x, g.player.human.pos.z - H.z)) };
});
check('au loin (plus de 60 m) : intérieur non construit, aucune construction en cours', !far.interior && !far.steps, JSON.stringify(far));
check('sauvegarde par défaut : indoorHome = false', far.saved === false, String(far.saved));

// ---------- Arrivée à cheval dans la cour, devant la maison ----------
const ride = await ev(() => {
  const g = window.__game, A = window.__auto, H = window.__H.HOME.house;
  A.mount();
  const d = g.home.anchor('door');
  g.player.horse.setPosition(d.x + 4, d.z + 26, Math.PI);
  A.tick(3);
  const h = g.player.horse;
  const tgt = { x: d.x + 1.6, z: d.z + 2.5 };
  let steps = 0;
  for (let i = 0; i < 900 && Math.hypot(h.pos.x - tgt.x, h.pos.z - tgt.z) > 1.2; i++) {
    const dx = tgt.x - h.pos.x, dz = tgt.z - h.pos.z, l = Math.hypot(dx, dz);
    A.steer(dx / l, dz / l, l > 6 ? 0.55 : 0.3);
    A.tick(1);
    steps++;
  }
  A.steer(0, 1, 0);
  A.tick(20);
  return { mode: g.player.mode, steps, interior: !!g.world.house.interior, visible: !!g.world.house.interior?.group.visible };
});
check('à l’approche : intérieur construit par étapes, jamais dessiné joueur dehors', ride.interior && !ride.visible, JSON.stringify(ride));
await ev(() => {
  const g = window.__game, d = g.home.anchor('door'), y = g.world.house.y;
  g.cam.override = { pos: g.camera.position.clone().set(d.x + 9, y + 3.4, d.z + 12), look: g.camera.position.clone().set(d.x - 2.5, y + 2.6, d.z - 4) };
  g.cam.update(0.016, g.player.focus, { dx: 0, dy: 0 }, true);
});
await shot('1-exterieur-jour');
await ev(() => { window.__game.cam.override = null; });
// Coût de la construction, étape par étape (une par image à l'approche).
const cost = await ev(() => {
  const w = window.__game.world, ts = [];
  w.unloadHomeInterior();
  for (let done = false; !done;) {
    const t0 = performance.now();
    done = w.homeInteriorStep();
    ts.push(performance.now() - t0);
  }
  const g = w.house.interior.group;
  let tris = 0;
  g.traverse((o) => { if (o.isMesh) tris += o.geometry.index.count / 3; });
  return { steps: ts.length, max: +Math.max(...ts).toFixed(1), total: +ts.reduce((a, b) => a + b, 0).toFixed(1), meshes: g.children.length, tris: Math.round(tris) };
});
console.log(`  (construction de l'intérieur : ${cost.steps} étapes, ${cost.total} ms en tout, ${cost.max} ms au plus par image ; ${cost.meshes} maillages, ${cost.tris} triangles)`);
check('intérieur léger : 6 maillages au plus (matériaux partagés des commerces)', cost.meshes <= 6 && cost.tris < 40000, JSON.stringify(cost));
// « Entrer » est réservé au piéton : à cheval, on met pied à terre.
const onHorse = await current();
check('à cheval devant la porte : pas d’« Entrer » (à pied seulement)', onHorse?.id !== 'home:door', JSON.stringify(onHorse));
await ev(() => { const g = window.__game, A = window.__auto; A.foot(); A.tick(30); });
const door = await ev(() => window.__game.home.anchor('door'));
await walkTo(door.x, door.z, 300);
const horse0 = await ev(() => { const h = window.__game.mainHorse; return { x: h.pos.x, z: h.pos.z }; });
const enterAct = await current();
check('devant la porte, à pied : action « Entrer » (icône maison)', enterAct?.id === 'home:door' && enterAct.label === 'Entrer' && enterAct.icon === 'home', JSON.stringify(enterAct));
await act();
await waitIdle();
await tick(10);
const inS = await ev(() => {
  const g = window.__game, H = window.__H.HOME.house, h = g.mainHorse, p = g.player.human.pos;
  return {
    inside: g.home.inside, indoor: g.indoor?.id, home: !!g.indoor?.home, mode: g.player.mode, inHouse: g.home.contains(p.x, p.z), room: g.home.room(),
    horseOut: !g.home.contains(h.pos.x, h.pos.z, 0.3), saved: g.save.data.indoorHome, visible: g.world.house.interior.group.visible, fov: Math.round(g.camera.fov),
  };
});
check('entrée : dans le salon, g.indoor = maison, sauvegarde indoorHome', inS.inside && inS.indoor === 'maison' && inS.home && inS.mode === 'foot' && inS.inHouse && inS.room === 'salon' && inS.saved === true, JSON.stringify(inS));
check('intérieur dessiné une fois dedans, cheval resté dehors', inS.visible && inS.horseOut, JSON.stringify(inS));
const cam0 = await camState();
check('caméra intérieure : dans la maison, sous le plafond, hors des murs', cam0.inside && !cam0.blocked && cam0.y < 2.3, JSON.stringify(cam0));
await shot('2-entree-salon');
// Sifflet sans effet, cheval immobile dehors.
const wh = await ev(([x0, z0]) => { const g = window.__game; g.input.pressed.add('whistle'); window.__auto.tick(30); const h = g.mainHorse; return Math.hypot(h.pos.x - x0, h.pos.z - z0); }, [horse0.x, horse0.z]);
check('sifflet sans effet à l’intérieur (cheval immobile dehors)', wh < 0.6, wh.toFixed(2));
// Rien à travers les murs : cheval collé à la façade, joueur juste derrière le mur.
const thru = await ev(() => {
  const g = window.__game, A = window.__auto, H = window.__H.HOME.house, h = g.mainHorse;
  h.setPosition(H.x + 3.6, H.z + H.d / 2 + 0.9, 0);
  g.player.human.setPosition(H.x + 3.6, H.z + H.d / 2 - 0.75, 0);
  A.tick(3);
  g.interact.update();
  const it = g.interact.current;
  return { cur: it ? `${it.id}:${it.label}` : null, cands: g.player.transport.cands?.length || 0, d: +Math.hypot(h.pos.x - g.player.human.pos.x, h.pos.z - g.player.human.pos.z).toFixed(2) };
});
check('aucune action du dehors à travers le mur (ni « Monter », ni longe)', (!thru.cur || thru.cur.startsWith('home:')) && thru.cands === 0, JSON.stringify(thru));
await ev(([x0, z0]) => { const g = window.__game; g.mainHorse.setPosition(x0, z0, g.mainHorse.heading); window.__auto.tick(2); }, [horse0.x, horse0.z]);

// ---------- Parcours de toutes les pièces (passages, caméra) ----------
const route = [
  ['salon', 2.3, 1.0], ['cuisine', 5.7, 0.9], ['cuisine', 7.4, -2.4], ['cuisine', 6.4, 1.2], ['salon', 1.5, 0.6], ['salon', 0.5, 0.3],
  ['salon', 0.5, -1.05], ['chambre', -1.5, -1.05], ['chambre', -2.6, 1.2], ['chambre', -4.45, 0.35], ['chambre', -4.6, 2.15],
  ['sdb', -6.4, 2.15], ['sdb', -7.2, 0.0], ['sdb', -7.6, -1.25], ['sdb', -7.3, -2.3], ['sdb', -7.3, -3.4], ['sdb', -6.4, 2.15], ['chambre', -4.6, 2.15], ['chambre', -2.6, 1.2],
];
let reached = 0, camBad = [], roomBad = [];
for (const [room, lx, lz] of route) {
  if (await walkL(lx, lz, 500)) reached++;
  const c = await camState();
  if (c.proom !== room) roomBad.push(`${room}:${c.proom}@${lx},${lz}`);
  if (c.blocked || !c.inside || c.y > 2.3) camBad.push(JSON.stringify(c));
}
check(`toutes les pièces praticables à pied : ${route.length} points atteints par les passages`, reached === route.length && !roomBad.length, `${reached}/${route.length} ${roomBad.join(' ')}`);
check('caméra jamais dans un mur ou une cloison, toujours dans la maison et sous le plafond', !camBad.length, camBad.slice(0, 2).join(' | '));
// Caméra : tour complet dans chaque pièce (orbite au doigt), jamais au travers d'une cloison.
const orbit = await ev(async () => {
  const g = window.__game, A = window.__auto, H = window.__H.HOME.house, bad = [];
  const pts = { salon: [2.3, 1.2], cuisine: [6.8, -0.5], chambre: [-2.3, 0.9], sdb: [-7.0, 0.8] };
  for (const [room, [lx, lz]] of Object.entries(pts)) {
    g.player.human.setPosition(H.x + lx, H.z + lz, 0);
    for (let k = 0; k < 12; k++) {
      g.cam.snap(g.player.human.pos, (k / 12) * Math.PI * 2);
      A.tick(6);
      const c = g.camera.position;
      const cr = g.home.room(c.x, c.z);
      if (cr !== room || g.colliders.cameraBlocked(c.x, c.z, c.y, 0.05)) bad.push(`${room}→${cr}@${k}`);
    }
  }
  return bad;
});
check('caméra : tour complet dans chaque pièce, toujours dans la pièce du joueur', !orbit.length, orbit.slice(0, 6).join(' '));

// ---------- Collisions ----------
await pose(0.6, 1.2, -3, 1.2);
const wallP = await push(-1, 0, 70);
check('cloison salon/chambre infranchissable hors du passage', wallP.x > -0.2, JSON.stringify(wallP));
await pose(-4.45, 0.35, -4.45, -1);
const bedP = await push(0, -1, 60);
check('lit : on ne marche pas dessus (collision du mobilier)', bedP.z > -0.05, JSON.stringify(bedP));
await pose(6.8, -1.0, 6.8, -4);
const wtP = await push(0, -1, 60);
check('plan de travail de la cuisine : collision', wtP.z > -3.1, JSON.stringify(wtP));
await pose(3.6, 2.6, 3.6, 5);
const outP = await push(0, 1, 60);
check('mur de façade infranchissable de l’intérieur', outP.z < 3.98 - 0.25, JSON.stringify(outP));

// ---------- Lit, évier, lavabo ----------
await pose(-4.45, 0.35, -4.45, -1);
const bedAct = await current();
check('au bord du lit : « Se coucher » (icône lit)', bedAct?.id === 'home:bed' && bedAct.label === 'Se coucher' && bedAct.icon === 'bed', JSON.stringify(bedAct));
const bedAnchor = await ev(() => { const g = window.__game, a = g.home.anchor('bed'), p = g.player.human.pos; return { a, d: +Math.hypot(a.x - p.x, a.z - p.z).toFixed(2), room: g.home.room(a.x, a.z) }; });
check('anchor(\'bed\') : à côté du lit, dans la chambre', bedAnchor.d < 0.2 && bedAnchor.room === 'chambre', JSON.stringify(bedAnchor));
await pose(-6.0, 0.3, -8, 0.3);
const sdbAct = await current();
check('depuis la salle de bain, derrière la cloison : pas de « Se coucher »', sdbAct?.id !== 'home:bed', JSON.stringify(sdbAct));
await pose(-4.45, 0.35, -4.45, -1);
await act();
await tick(2);
// Lit du jeu complet (rest.js) : menu du lit (nuit ou journée suivante, sieste, rester debout), refermé ensuite.
const bedMenu = await ev(() => [...document.querySelectorAll('.overlay [data-choice]')].map((b) => b.dataset.choice));
check('« Se coucher » ouvre le menu du lit (nuit ou journée suivante, sieste, rester debout)', bedMenu.includes('nap') && bedMenu.includes('cancel') && (bedMenu.includes('night') || bedMenu.includes('nextday')), bedMenu.join(','));
await ev(() => window.__auto.tap(document.querySelector('.overlay [data-choice="cancel"]')));
await tick(2);
const opened = await ev(() => {
  const g = window.__game;
  const prev = g.rest;
  let n = 0;
  g.rest = { ...(prev || {}), openBed: () => n++ };
  g.interact.update();
  if (g.interact.current?.id === 'home:bed') g.interact.trigger();
  g.rest = prev;
  return n;
});
check('avec le système de repos : le lit ouvre g.rest.openBed()', opened === 1, String(opened));
await pose(7.9, -2.45, 9, -2.45);
const sink = await current();
check('cuisine : « Boire un verre d’eau » à l’évier', sink?.id === 'home:sink' && sink.label === 'Boire un verre d’eau', JSON.stringify(sink));
await pose(-8.05, -1.25, -9, -1.25);
const basin = await current();
check('salle de bain : « Se rafraîchir » au lavabo', basin?.id === 'home:basin' && basin.label === 'Se rafraîchir', JSON.stringify(basin));

// ---------- Captures de jour ----------
const views = [
  ['3-salon', 3.8, 2.4, 0.5, -2.6], ['4-salon-cheminee', 3.3, 0.9, 1.9, -3.9], ['5-cuisine', 5.6, 1.6, 8.3, -3.2], ['6-cuisine-table', 6.0, -1.9, 7.3, 2.8],
  ['7-chambre-lit', -1.3, 1.5, -4.6, -1.0], ['8-chambre-armoire', -4.2, 1.8, -2.0, -3.9], ['9-sdb', -6.2, 2.7, -8.4, -2.6], ['10-sdb-douche', -6.3, 0.2, -8.3, -3.7],
];
for (const [name, lx, lz, tx, tz] of views) {
  await pose(lx, lz, tx, tz);
  await shot(`${name}-jour`);
}

// ---------- La nuit ----------
await setHour(22.5);
for (const [name, lx, lz, tx, tz] of [views[0], views[2], views[4], views[6]]) {
  await pose(lx, lz, tx, tz);
  await shot(`${name}-nuit`);
}
// Couché sur le lit (aide visuelle du fondu du sommeil), puis relevé au bord du lit.
await pose(-4.45, 0.35, -4.45, -1);
const lie = await ev(() => {
  const g = window.__game, hu = g.player.human;
  const ok = g.home.lieDown(true);
  window.__auto.tick(3);
  g.cam.snap(hu.pos, Math.PI * 0.8);
  window.__auto.tick(2);
  return { ok, rx: +hu.mesh.rotation.x.toFixed(2), y: +(hu.mesh.position.y - g.world.house.y).toFixed(2), room: g.home.room(hu.mesh.position.x, hu.mesh.position.z) };
});
check('lieDown(true) : personnage allongé sur le lit', lie.ok && Math.abs(lie.rx + Math.PI / 2) < 0.05 && lie.y > 0.4 && lie.room === 'chambre', JSON.stringify(lie));
await ev(() => {
  const g = window.__game, b = g.home.anchor('bed'), y = g.world.house.y;
  g.cam.override = { pos: g.camera.position.clone().set(b.x + 1.1, y + 2.0, b.z + 1.4), look: g.camera.position.clone().set(b.x - 0.4, y + 0.55, b.z - 1.4) };
  g.cam.update(0.016, g.player.focus, { dx: 0, dy: 0 }, true);
});
await shot('15-nuit-couche');
await ev(() => { window.__game.cam.override = null; });
const up = await ev(() => {
  const g = window.__game, hu = g.player.human;
  const ok = g.home.lieDown(false);
  window.__auto.tick(3);
  const a = g.home.anchor('bed');
  return { ok, rx: +hu.mesh.rotation.x.toFixed(2), d: +Math.hypot(hu.pos.x - a.x, hu.pos.z - a.z).toFixed(2) };
});
check('lieDown(false) : relevé, debout au bord du lit', up.ok && Math.abs(up.rx) < 0.01 && up.d < 0.3, JSON.stringify(up));

// ---------- Sortie ----------
const toDoor = await go(BED_TO_DOOR);
check('du lit à la porte d’entrée par les passages', toDoor);
const ex = await act();
const twice = await act();
await waitIdle();
await tick(6);
const out = await ev(() => {
  const g = window.__game, p = g.player.human.pos, d = g.home.anchor('door');
  return { inside: g.home.inside, indoor: g.indoor, dDoor: +Math.hypot(p.x - d.x, p.z - d.z).toFixed(2), inHouse: g.home.contains(p.x, p.z), saved: g.save.data.indoorHome, visible: g.world.house.interior?.group.visible, fov: Math.round(g.camera.fov) };
});
check('sortie : dehors devant la porte, état intérieur levé', ex === 'Sortir' && !out.inside && !out.indoor && out.dDoor < 0.6 && !out.inHouse && out.saved === false && !out.visible, JSON.stringify(out) + ` ${twice}`);
await ev(() => { const g = window.__game, d = g.home.anchor('door'), p = g.player.human; p.setPosition(d.x + 1.5, d.z + 7, Math.PI); g.cam.snap(p.pos, Math.PI - 0.15); window.__auto.tick(20); });
await shot('16-nuit-exterieur');

// ---------- Sécurité : déplacé hors de la maison par le jeu ----------
await ev(() => { const g = window.__game, d = g.home.anchor('door'); g.player.human.setPosition(d.x, d.z, Math.PI); window.__auto.tick(3); });
await act();
await waitIdle();
const tele = await ev(() => {
  const g = window.__game, A = window.__auto;
  const before = g.home.inside;
  g.player.human.setPosition(-104, 168, 0);
  A.tick(3);
  return { before, after: g.home.inside, indoor: g.indoor, saved: g.save.data.indoorHome };
});
check('téléporté dehors par une mission : plus « dans la maison »', tele.before && !tele.after && !tele.indoor && tele.saved === false, JSON.stringify(tele));

// ---------- Sauvegarde dans la maison puis rechargement ----------
await ev(() => { const g = window.__game, d = g.home.anchor('door'); g.player.human.setPosition(d.x, d.z, Math.PI); window.__auto.tick(3); });
await act();
await waitIdle();
await walkL(2.3, 1.0, 400);
const saved = await ev(() => { const g = window.__game; g.saveNow(); const d = JSON.parse(localStorage.getItem('strides-grand-tour-v1')); return { home: d.indoorHome, pos: d.pos, door: g.home.anchor('door') }; });
check('sauvegarde dans la maison : indoorHome et porte enregistrés', saved.home === true && Math.hypot(saved.pos.x - saved.door.x, saved.pos.z - saved.door.z) < 0.1, JSON.stringify(saved));
const reload = async () => {
  await page.reload();
  await page.waitForFunction(() => window.__game?.state === 'title' || window.__game?.state === 'play', null, { timeout: 240000 });
  await page.evaluate(() => { if (window.__game.state === 'title') window.__game.startGame(false); });
  await page.waitForFunction(() => window.__game?.state === 'play' && !window.__game.home.busy, null, { timeout: 120000 });
  await page.waitForTimeout(500);
};
await reload();
const resumed = await ev(() => { const g = window.__game, p = g.player.human.pos; return { inside: g.home.inside, indoor: g.indoor?.id, inHouse: g.home.contains(p.x, p.z), room: g.home.room(), visible: !!g.world.house.interior?.group.visible }; });
check('reprise : de retour dans la maison (entrée), intérieur dessiné', resumed.inside && resumed.indoor === 'maison' && resumed.inHouse && resumed.room === 'salon' && resumed.visible, JSON.stringify(resumed));
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await ev(async () => { const g = window.__game; window.__auto.stopLoop(); window.__H = { ...(await import('/src/world/homeGeo.js')), HOME: (await import('/src/world/sites.js')).HOME }; g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600; });
await tick(5);
await shot('17-reprise-salon');

// ---------- Ancienne sauvegarde (sans indoorHome) : reprise dehors ----------
await ev(() => {
  const g = window.__game;
  g.home.exit({ instant: true });
  window.__auto.tick(2);
  g.saveNow();
  const d = JSON.parse(localStorage.getItem('strides-grand-tour-v1'));
  delete d.indoorHome;
  d.pos = { ...d.pos, x: -104, z: 168, heading: 0.35 };
  localStorage.setItem('strides-grand-tour-v1', JSON.stringify(d));
  // La sauvegarde automatique à la fermeture de la page ne doit pas réécrire cette « ancienne » sauvegarde.
  Storage.prototype.setItem = () => {};
});
await reload();
const old = await ev(() => { const g = window.__game, p = g.player.human.pos; return { inside: g.home.inside, indoor: g.indoor, flag: g.save.data.indoorHome, x: +p.x.toFixed(1), z: +p.z.toFixed(1) }; });
check('ancienne sauvegarde sans indoorHome : partie reprise dehors, normalement', !old.inside && !old.indoor && old.flag === false && Math.hypot(old.x + 104, old.z - 168) < 3, JSON.stringify(old));

check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `ÉCHECS : ${fails}` : 'MAISON OK');
await browser.close();
process.exit(fails ? 1 : 0);
