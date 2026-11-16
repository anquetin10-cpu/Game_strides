// Régression bloquante : sabots et membres du cheval WildMesh face aux barres de CSO, cohérence avec le jugement.
// Rendu logiciel SwiftShader de Chromium (pas un iPhone). Déterministe : même obstacle, même point de départ, vitesse
// tenue jusqu'à l'appel, appel déclenché à une image précise, à une distance de la barre choisie avec le modèle de saut
// du jeu (tôt = bout de la bonne zone, normal = sommet au milieu, trop près = zone « near », trop loin = zone « far »).
// Mesure indépendante du jeu, après toutes les transformations de rendu (os en coordonnées monde, image par image) :
// canon et paturon–sabot de chaque membre en capsules (rayons 4,5 et 5,5 cm), barre du haut en cylindre de 5 cm sur la
// largeur de l'obstacle, passage entre deux images balayé (8 positions). On distingue :
//  - intersection : une capsule pénètre la barre de plus de TOL ;
//  - « sous la barre » : le bout du sabot franchit le plan de la barre plus bas que son dessus (moins TOL_TIP), sans
//    forcément la toucher (il passe alors dans l'obstacle).
// Assertions, pour chaque saut :
//  B1 le saut a eu lieu et l'obstacle a été jugé une fois, ou le cheval a refusé (compté, sans saut) — un cas non
//     mesuré est un échec ;
//  B2 saut jugé sans faute ⇒ aucune intersection et aucun sabot sous une barre restée en place ;
//  B3 intersection avec une barre ⇒ cette barre tombe et la faute est comptée (une seule fois) ;
//  B4 barre tombée ⇒ un membre l'a réellement touchée (pas de chute sans contact visible) ;
//  B5 appel normal au galop de travail sur un obstacle à la portée du cheval ⇒ sans faute (pas de pénalité injuste) ;
//  B6 appel jugé fautif par le modèle (marge < −JUMP.rub) ⇒ faute (un mauvais appel ne devient pas sans faute) ;
//  B7 mesure complète : chaque sabot a franchi le plan de chaque barre (un cas non mesuré est un échec).
// TOL = 1 cm (approximation du volume des membres et de la barre) ; TOL_TIP = 2 cm (bout de l'os du sabot ≈ sole).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/pjl/bars-check.mjs [dossier] [filtre de cas]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/bars-check';
const FILTER = process.argv[3] ? new RegExp(process.argv[3]) : null;
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const TOL = 0.01, TOL_TIP = 0.02;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const setup = await E(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  A.mount();
  g.activities.start(g.activities.defs.find((a) => a.id === 'cso_warmup'));
  A.tick(6); A.closeCards(); A.tick(20); A.closeCards();
  const JM = await import('/src/gameplay/jumpModel.js');
  const W = (await import('/src/world/sites.js')).POLE.warmup;
  const h = g.player.horse;
  // Au paddock : l'entraînement passe en commandes de concours (modèle de saut v2 de CSO).
  h.setPosition(W.x + 6, W.z, Math.PI / 2);
  for (let k = 0; k < 120 && g.course?.controls !== 'cso'; k++) { A.tick(1); A.closeCards(); }
  // Cheval de concours (test) : puissance suffisante pour 1,60 m, comme un cheval de Grand Prix du jeu ; état figé.
  h.mods.jump = 0.45;
  const specs = [
    { id: 'v110', kind: 'v', h: 1.1 }, { id: 'o100', kind: 'o', h: 1.0, spread: 1.2 },
    { id: 'v140', kind: 'v', h: 1.4 }, { id: 'o145', kind: 'o', h: 1.45, spread: 1.4 },
    { id: 'v160', kind: 'v', h: 1.6 }, { id: 'o160', kind: 'o', h: 1.6, spread: 1.6 },
  ];
  // Couloir d'essai dégagé : chaque obstacle est placé sur une ligne où rien d'autre (clôture, haie, lice…) ne bloque le
  // cheval de 16 m avant à 10 m après, sur 3 m de large (vérifié avec les collisions du jeu, à 0,3 m du sol) ; sinon le
  // test échoue (environnement de test invalide plutôt que résultat faussé).
  const lane = (x, z) => {
    for (let s = -16; s <= 10; s += 0.5) for (const u of [-1.5, 0, 1.5]) {
      const px = x + s, pz = z + u;
      if (g.colliders.blocked(px, pz, g.terrain.getHeight(px, pz) + 0.3)) return false;
    }
    return true;
  };
  const spots = [];
  for (let x = W.x + 60; x < W.x + 160 && spots.length < specs.length; x += 26) {
    for (let z = W.z - 60; z < W.z + 80 && spots.length < specs.length; z += 14) if (lane(x, z)) spots.push({ x, z });
  }
  if (spots.length < specs.length) return { error: 'couloirs d’essai dégagés introuvables' };
  const obs = specs.map((sp, i) => g.obstacles.add({ x: spots[i].x, z: spots[i].z, rot: Math.PI / 2, kind: sp.kind, h: sp.h, spread: sp.spread, w: 3.6, course: 'warmup', id: 'test_' + sp.id }));
  window.__T = { JM, obs, specs };
  return { power: h.jumpPower, mods: h.mods.jump, controls: g.course?.controls || null, spots: obs.map((o) => [Math.round(o.x), Math.round(o.z)]) };
});
console.log('cheval', JSON.stringify(setup));
if (setup.error) {
  console.log(`✘ ${setup.error}`);
  process.exit(1);
}
if (setup.controls !== 'cso') {
  console.log('✘ commandes de concours non actives : modèle de saut de CSO non testé');
  process.exit(1);
}

// Distances d'appel (point de référence du cheval → première barre, m) d'après le modèle de saut du jeu.
const appels = (i, v) => E(([i, v]) => {
  const g = window.__game, T = window.__T, h = g.player.horse, o = T.obs[i];
  const st = { v, power: h.jumpPower, clearance: h.mods.clearance, cso: true };
  const rows = [];
  for (let x = 0.4; x <= 8; x += 0.02) {
    // Point de référence placé à x m de la première barre, cap dans l'axe de saut.
    const first = Math.min(...o.bars.map((b) => b.s));
    const s = first - x;
    const geo = T.JM.railsAhead(o, o.x + o.n.x * s, o.z + o.n.z * s, o.n.x, o.n.z);
    const p = T.JM.planJump(st, geo);
    rows.push({ x: +x.toFixed(2), zone: p.zone, margin: p.margin, gap: Math.abs(p.ideal - p.L) });
  }
  const good = rows.filter((r) => r.zone === 'good');
  const near = rows.filter((r) => r.zone === 'near');
  const far = rows.filter((r) => r.zone === 'far');
  const normal = good.length ? good.reduce((a, b) => (b.gap < a.gap ? b : a)) : null;
  return {
    normal: normal?.x ?? null,
    tot: good.length ? Math.max(...good.map((r) => r.x)) : null,
    pres: near.length ? near[Math.floor(near.length / 2)].x : null,
    // Trop loin : premier point de la zone « far » où le modèle prévoit une barre (marge < −JUMP.rub − 4 cm).
    loin: far.find((r) => r.margin < -0.1)?.x ?? null,
  };
}, [i, v]);

// Un saut, image par image : mesure des membres et des barres après chaque image.
const jump = (i, v, xPress, label) => E(([i, v, xPress, label, TOL]) => {
  const g = window.__game, A = window.__auto, T = window.__T, h = g.player.horse, o = T.obs[i];
  const V3 = g.camera.position.constructor;
  const DT = 1 / 30, REF = 0.4;
  // Barres remontées, état de l'obstacle remis à zéro.
  g.obstacles._rest(o);
  h._pass = null;
  const first = Math.min(...o.bars.map((b) => b.s));
  // Départ : 40 images d'élan à vitesse tenue, puis appel à l'image 40 (point de référence à xPress de la barre).
  const N = 40;
  const s0 = first - xPress - v * DT * N - REF;
  h.setPosition(o.x + o.n.x * s0, o.z + o.n.z * s0, o.rot);
  h.ai = null;
  h.stamina = h.maxStamina;
  h._refusing = null; h._refusal = null; h._brake = 0; h._rearT = 0;
  const loc = (p) => ({ s: (p.x - o.x) * o.n.x + (p.z - o.z) * o.n.z, u: (p.x - o.x) * o.t.x + (p.z - o.z) * o.t.z, y: p.y - o.ground });
  const LIMBS = [
    ['AG', 'hand_l', 'fingers_01_l', 'fingers_end_l'], ['AD', 'hand_r', 'fingers_01_r', 'fingers_end_r'],
    ['PG', 'foot_l', 'toes_01_l', 'toes_end_l'], ['PD', 'foot_r', 'toes_01_r', 'toes_end_r'],
  ];
  const R_CANON = 0.045, R_HOOF = 0.055, R_RAIL = 0.05, STEPS = 8;
  const pose = () => {
    const V = h.pjl.view;
    return LIMBS.map(([k, a, b, c]) => ({ k, pts: [a, b, c].map((n) => loc(V.boneWorld(n, new V3()))) }));
  };
  const segDist = (a, b, bar) => {
    const ds = b.s - a.s, dy = b.y - a.y, L2 = ds * ds + dy * dy;
    let t = L2 > 1e-12 ? ((bar.s - a.s) * ds + (bar.h - a.y) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(a.s + ds * t - bar.s, a.y + dy * t - bar.h), u: a.u + (b.u - a.u) * t };
  };
  const lerp = (p, q, t) => ({ s: p.s + (q.s - p.s) * t, u: p.u + (q.u - p.u) * t, y: p.y + (q.y - p.y) * t });
  const ev = [];
  const offC = g.bus.on('obstacle:clear', (e) => e.obstacle === o && ev.push({ type: 'clear', margin: e.margin, t: g.time }));
  const offF = g.bus.on('obstacle:fault', (e) => e.obstacle === o && ev.push({ type: 'fault', margin: e.margin, cause: e.cause, t: g.time }));
  const offR = g.bus.on('obstacle:refusal', (e) => e.obstacle === o && ev.push({ type: 'refusal', t: g.time }));
  const contacts = [], under = [], falls = [], trace = [], gameHits = [];
  // Contacts signalés par le jeu (espion, pour le diagnostic : les assertions portent sur la mesure du test).
  const lc0 = g.obstacles.limbContact;
  g.obstacles.limbContact = function (hh, oo, bar, hit) { if (oo === o) gameHits.push({ f, bar: bar.s, limb: hit.limb, depth: +hit.depth.toFixed(3), fallen: !!bar.mesh?.userData.fall }); return lc0.call(this, hh, oo, bar, hit); };
  let prev = null, jumped = false, plan = null, flew = false, landedAt = -1, f = 0;
  const fallen = new Set();
  for (; f < 200; f++) {
    if (f < N) h.speed = v; // élan tenu (vitesse fixée par le test jusqu'à l'appel)
    A.steer(o.n.x, o.n.z, 0.95);
    g.input.held.delete('gallop');
    if (f === N) {
      const tg = g.obstacles.target(h);
      plan = tg && tg.o === o ? { target: 'ok', x: +tg.geo.rails[0].x.toFixed(3), zone: tg.plan.zone, margin: +tg.plan.margin.toFixed(3), L: +tg.plan.L.toFixed(2), H: +tg.plan.H.toFixed(2) } : { target: tg ? tg.o.id || `${tg.o.kind}@${tg.o.x.toFixed(0)},${tg.o.z.toFixed(0)}` : null };
      g.input.pressed.add('jump');
      jumped = true;
    }
    A.tick(1);
    if (h.jumpT >= 0) flew = true;
    if (flew && landedAt < 0 && h.jumpT < 0) landedAt = f;
    const cur = pose();
    trace.push({ f, v: +h.speed.toFixed(2), brake: +(h._brake || 0).toFixed(2), refusing: !!h._refusing, jumpT: +h.jumpT.toFixed(3), a: +(h.pjl._clrA || 0).toFixed(3), fT: +(h.pjl._clrF || 0).toFixed(3), y: +(h.pjl._clrY || 0).toFixed(3), off: +(h.pjl.view.contactOff || 0).toFixed(3), PD: cur[3].pts[2], AD: cur[1].pts[2] });
    for (const bar of o.bars) {
      const isFallen = !!bar.mesh?.userData.fall;
      if (isFallen && !fallen.has(bar)) { fallen.add(bar); falls.push({ bar: bar.s, f, t: g.time }); }
    }
    if (prev) {
      for (let li = 0; li < cur.length; li++) {
        const c = cur[li], p = prev[li];
        for (const bar of o.bars) {
          const standing = !fallen.has(bar);
          // Intersection (balayage entre l'image précédente et celle-ci), canon puis paturon–sabot.
          for (const [ia, ib, r] of [[0, 1, R_CANON], [1, 2, R_HOOF]]) {
            for (let k = 1; k <= STEPS; k++) {
              const t = k / STEPS;
              const a = lerp(p.pts[ia], c.pts[ia], t), b = lerp(p.pts[ib], c.pts[ib], t);
              const q = segDist(a, b, bar);
              if (Math.abs(q.u) > o.w / 2 + r) continue;
              const depth = r + R_RAIL - q.d;
              if (depth > TOL) contacts.push({ limb: c.k, seg: ia === 0 ? 'canon' : 'sabot', bar: bar.s, depth: +depth.toFixed(3), f, standing, jumpT: +h.jumpT.toFixed(3) });
            }
          }
          // Bout du sabot qui franchit le plan de la barre : hauteur au passage.
          const tp = p.pts[2], tc = c.pts[2];
          if ((tp.s - bar.s) * (tc.s - bar.s) <= 0 && tp.s !== tc.s) {
            const t = (bar.s - tp.s) / (tc.s - tp.s);
            const y = tp.y + (tc.y - tp.y) * t, u = tp.u + (tc.u - tp.u) * t;
            if (Math.abs(u) < o.w / 2) {
              const clear = y - (bar.h + R_RAIL);
              under.push({ limb: c.k, bar: bar.s, clear: +clear.toFixed(3), f, standing, jumpT: +h.jumpT.toFixed(3) });
            }
          }
        }
      }
    }
    prev = cur;
    const sNow = (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
    if (flew && landedAt >= 0 && f > landedAt + 30 && sNow > 6) break;
  }
  offC(); offF(); offR();
  g.obstacles.limbContact = lc0;
  A.releaseInput();
  return { label, i, v, xPress, plan, flew, landedAt, frames: f, ev, contacts, under, falls, trace, gameHits, bars: o.bars.map((b) => ({ s: b.s, h: b.h })) };
}, [i, v, xPress, label, TOL]);

const results = [];
let fails = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const specs = await E(() => window.__T.specs);
for (let i = 0; i < specs.length; i++) {
  for (const v of [6.5, 9]) {
    const ap = await appels(i, v);
    const cases = v === 6.5 ? ['normal', 'tot', 'pres', 'loin'] : ['normal', 'tot', 'pres'];
    for (const kind of cases) {
      const label = `${specs[i].id} ${v} m/s ${kind}`;
      if (FILTER && !FILTER.test(label)) continue;
      const x = ap[kind];
      if (x === null || x === undefined) {
        check(false, `${label} : B1 distance d'appel introuvable`, JSON.stringify(ap));
        continue;
      }
      const r = await jump(i, v, x, label);
      results.push(r);
      const judged = r.ev.length ? r.ev[0] : null;
      const faultsEv = r.ev.filter((e) => e.type === 'fault').length;
      const inter = r.contacts.filter((c) => c.standing);
      const underStanding = r.under.filter((u) => u.standing && u.clear < -TOL_TIP);
      const minClear = r.under.length ? Math.min(...r.under.map((u) => u.clear)) : null;
      const maxDepth = r.contacts.length ? Math.max(...r.contacts.map((c) => c.depth)) : 0;
      const sum = `appel x=${r.plan?.x} (${r.plan?.zone}, marge modèle ${r.plan?.margin}) ; jugement ${judged ? judged.type : 'aucun'} ; barres tombées ${r.falls.length} ; intersection max ${maxDepth.toFixed(3)} m ; sabot le plus bas au passage ${minClear?.toFixed(3)} m`;
      console.log(`· ${label} : ${sum}`);
      // Refus (appel bien trop près : le jeu fait piler le cheval) : issue légitime, sans saut ; pas de jugement de barre.
      const refused = r.ev.some((e) => e.type === 'refusal');
      if (refused) {
        check(!r.flew && r.ev.filter((e) => e.type !== 'refusal').length === 0, `${label} : B1 refus compté, sans saut ni jugement de barre`, JSON.stringify(r.ev.map((e) => e.type)));
        continue;
      }
      check(r.plan?.target === 'ok' && r.flew && !!judged && r.ev.length === 1, `${label} : B1 obstacle visé, saut effectué et jugé une fois`, `cible ${r.plan?.target} ; ${r.ev.length} jugement(s)`);
      if (judged?.type === 'clear') check(!inter.length && !underStanding.length, `${label} : B2 sans faute ⇒ aucun membre dans ou sous une barre`, `${inter.length} intersection(s), ${underStanding.length} passage(s) sous la barre`);
      // B3 : chaque barre touchée (encore debout au moment du contact) tombe, faute comptée une fois.
      const touchedBars = [...new Set(inter.map((c) => c.bar))];
      const fellBars = new Set(r.falls.map((x) => x.bar));
      if (touchedBars.length) check(touchedBars.every((b) => fellBars.has(b)) && faultsEv === 1, `${label} : B3 barre touchée ⇒ tombée et faute comptée`, `touchées ${touchedBars.join(',')} ; tombées ${[...fellBars].join(',')} ; fautes ${faultsEv}`);
      // B4 : chaque barre tombée a été touchée par un membre.
      const anyTouched = new Set(r.contacts.map((c) => c.bar));
      if (r.falls.length) check([...fellBars].every((b) => anyTouched.has(b)), `${label} : B4 barre tombée ⇒ contact d'un membre`, `tombées ${[...fellBars].join(',')} ; touchées ${[...anyTouched].join(',')}`);
      // B7 : mesure complète — chaque sabot a franchi le plan de chaque barre dans la largeur de l'obstacle.
      const missing = [];
      for (const b of r.bars) for (const k of ['AG', 'AD', 'PG', 'PD']) if (!r.under.some((u) => u.bar === b.s && u.limb === k)) missing.push(`${k}@${b.s}`);
      check(!missing.length, `${label} : B7 passage de chaque sabot au-dessus de chaque barre mesuré`, missing.join(' '));
      if (kind === 'normal' && v === 6.5) check(judged?.type === 'clear', `${label} : B5 appel normal ⇒ sans faute`);
      if (r.plan && r.plan.margin < -0.06) check(judged?.type === 'fault', `${label} : B6 appel fautif selon le modèle ⇒ faute`);
    }
  }
}
writeFileSync(join(OUT, 'bars-check.json'), JSON.stringify({ base: BASE, setup, results, errors }, null, 1));
check(!errors.length, 'aucune erreur JavaScript', errors.slice(0, 2).join(' | '));
console.log(fails ? `\n${fails} échec(s)` : '\nTout est conforme');
await browser.close();
process.exit(fails ? 1 : 0);
