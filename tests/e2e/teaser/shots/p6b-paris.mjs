// Plan 6 b du teaser : Grand Prix de Paris Indoor, le soir (20 h 30). Plan large de l'arène couverte éclairée : tribunes
// garnies sur trois côtés, écran géant suspendu, faisceaux des projecteurs. La caméra part haut au-dessus de l'entrée de
// piste (ouest), dans l'axe de l'arène, et descend lentement vers la piste en s'approchant (grue, arrivée amortie) ; la
// cavalière réaliste sur Comète, au galop sur la ligne du milieu, saute l'oxer n° 7 du Grand Prix vers la caméra
// (sans faute), puis franchit la ligne d'arrivée. 96 images (4 s).
// Arrivée à Paris comme dans le jeu (tests/e2e/paris.mjs) : cheval chargé dans le camion, autoroute A13 (g.travel.go),
// déchargé au parking, monté.
// Réglages (essais) : HOUR, N, NAME, OBS (obstacle du Grand Prix), MAG, S0 (abscisse du cheval sur l'axe de l'obstacle
// au début du plan), SHOW (ambiance de spectacle 0..1 : faisceaux), MJ/MC (bonus de saut et de tolérance du
// harnachement), E0/E1 (œil, début/fin, coordonnées relatives au centre de la piste, [x, hauteur au-dessus du sable,
// z]), EASEOUT (1 : départ en mouvement, arrivée amortie), A0 (point visé fixe, même repère), AW/AW1 (part du cheval
// dans la visée, début/fin), FOV0/FOV1, EXPO (exposition du rendu ; jeu : 0,42).
import { open, OUT, PREVIEW } from '../lib.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Prise de vues tolérante à la charge de la machine (même sortie que s.shoot de lib.mjs, nouvel essai en cas d'échec
// ponctuel de la capture d'écran).
async function shoot(s, name, n, step, { quality = 92 } = {}) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const src = `(${step.toString()})`;
  const t0 = Date.now();
  let k = 0;
  for (let i = 0; i < n; i++) {
    const keep = !PREVIEW || i % 6 === 0;
    await s.page.evaluate(([src, i, n, keep]) => {
      // eslint-disable-next-line no-eval
      (0, eval)(src)(i, n);
      if (keep) window.__cine.render();
    }, [src, i, n, keep]);
    if (!keep) continue;
    const path = join(dir, `${String(k++).padStart(5, '0')}.jpg`);
    for (let a = 0; ; a++) {
      try {
        await s.page.screenshot({ path, type: 'jpeg', quality, timeout: 240000 });
        break;
      } catch (e) {
        if (a >= 3) throw e;
        console.log(`capture ${k - 1} : nouvel essai (${e.message.split('\n')[0]})`);
        await s.page.evaluate(() => window.__cine.render());
      }
    }
    if (k % 24 === 0) console.log(`${name} : ${k} images (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  console.log(`${name} : ${k} images en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${dir}`);
  return { dir, frames: k };
}

const E = process.env;
const HOUR = Number(E.HOUR || 20.5);
const N = Number(E.N || 96);
const NAME = E.NAME || 'p6b-paris';
const num = (k, d) => (E[k] == null ? d : Number(E[k]));
const arr = (k, d) => (E[k] == null ? d : JSON.parse(E[k]));
const P = {
  obs: E.OBS || '7', mag: num('MAG', 0.66), s0: num('S0', -17.5), show: num('SHOW', 0.6), mj: num('MJ', 0.12), mc: num('MC', 0.08),
  e0: arr('E0', [-50, 11, 13]), e1: arr('E1', [-33, 4.4, 9.8]), a0: arr('A0', [0, 4, 0]), aw: num('AW', 0.35), aw1: num('AW1', 0.75),
  fov0: num('FOV0', 48), fov1: num('FOV1', 42), expo: num('EXPO', 0.58), easeOut: num('EASEOUT', 1) === 1,
};

const s = await open({ hour: 15 });
const info = await s.ev(([h0, P]) => {
  const C = window.__cine, g = window.__game, A = window.__auto;
  // Voyage Deauville → Paris comme dans le jeu : Comète chargée dans le camion, bretelle de l'A13, arrivée au parking.
  g.syncFade = true;
  const t = g.truck, tp = g.player.transport;
  t.setRampInstant(true);
  tp.loadInstant(g.mainHorse);
  t.setRampInstant(false);
  A.drive();
  t.setPosition(545, -118, Math.PI / 2);
  A.tick(6);
  A.closeCards();
  g.travel.go('paris');
  A.tick(4);
  A.closeCards();
  A.foot();
  t.setRampInstant(true);
  tp.unloadInstant(g.mainHorse);
  t.setRampInstant(false);
  A.mount();
  A.closeCards();
  for (const it of g.collectibles.items) g.scene.remove(it.g);
  g.collectibles.items.length = 0;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + h0 * 3600;
  C.lockHour = h0;
  // Exposition du rendu (réglage du jeu : 0,42 ; plus haut = arène plus claire).
  g.renderer.toneMappingExposure = P.expo;
  const paris = g.world.paris;
  paris.showTarget = P.show;
  paris.show = P.show;
  g.obstacles.showParisCourse('paris_gp');
  g.obstacles.resetRails('paris_gp');
  // Panneaux imprimés (numéros des obstacles, DÉPART / ARRIVÉE) : vus de dos depuis la caméra, ils s'afficheraient en
  // miroir ; retirés du plan.
  for (const q of g.obstacles.ofCourse('paris_gp')) if (q.sign) q.sign.visible = false;
  // (panneaux DÉPART / ARRIVÉE : affichage réglé chaque image selon la distance, donc retirés de la scène)
  for (const m of g.obstacles.parisLines.paris_gp) if (m.geometry?.type === 'PlaneGeometry') m.parent?.remove(m);
  const h = g.player.horse;
  // Harnachement de concours du jeu (sellerie) : selle mixte carbone (puissance +12 %) et guêtres (tolérance +8 %),
  // comme un couple qui court le Grand Prix ; hors épreuve, le modèle de saut libre ne passerait pas 1,45 m nettement.
  h.mods = { ...h.mods, jump: P.mj, clearance: P.mc };
  const o = g.obstacles.ofCourse('paris_gp').find((q) => q.label === P.obs);
  const along = () => (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
  const sStart = P.s0 - 14;
  h.setPosition(o.x + o.n.x * sStart, o.z + o.n.z * sStart, o.rot);
  h.speed = 6.8 * h.speedMul;
  h.stamina = h.maxStamina;
  const ev = [];
  g.bus.on('obstacle:clear', (e) => ev.push({ k: 'clear', l: e.obstacle.label, m: +e.margin.toFixed(3) }));
  g.bus.on('obstacle:fault', (e) => ev.push({ k: 'fault', l: e.obstacle.label, c: e.cause }));
  g.bus.on('obstacle:refusal', (e) => ev.push({ k: 'refusal', l: e.obstacle.label }));
  const G = (window.__G = { P, o, along, ev, done: new Set(), log: [], aim: null });
  // Centre de la piste (repère des réglages de caméra) et hauteur du sable.
  G.c = { x: 4000, z: 0, y: g.terrain.getHeight(4000, 0) };
  G.ride = () => {
    h.ai = null;
    A.steer(o.n.x, o.n.z, P.mag);
    g.input.held.delete('gallop');
    h.stamina = h.maxStamina;
    const tg = g.obstacles.target(h);
    if (h.jumpT < 0 && tg && !G.done.has(tg.o) && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) {
      g.input.pressed.add('jump');
      G.done.add(tg.o);
    }
  };
  for (let i = 0; i < 400 && along() < P.s0; i++) {
    G.ride();
    g.update(1 / 24);
  }
  return { region: g.region, s: +along().toFixed(2), speed: +h.speed.toFixed(2), horse: h.name, main: h === g.mainHorse, mode: g.player.mode, o: { x: +(o.x - 4000).toFixed(1), z: +o.z.toFixed(1), h: o.h, kind: o.kind }, sand: +G.c.y.toFixed(2) };
}, [HOUR, P]);
console.log(info);

await shoot(s, NAME, N, (i, n) => {
  const C = window.__cine, g = window.__game, h = g.player.horse, G = window.__G, P = G.P, c = G.c;
  G.ride();
  const jt0 = h.jumpT;
  g.update(1 / 24);
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + C.lockHour * 3600;
  if (jt0 < 0 && h.jumpT >= 0 && G.takeoff == null) G.takeoff = i;
  if (jt0 >= 0 && h.jumpT < 0 && G.land == null) G.land = i;
  C.focus = { x: c.x, y: c.y, z: c.z };
  // Grue lente : l'œil glisse d'E0 à E1 (adouci), visée entre un point fixe de la piste et le cheval (panoramique doux).
  const u = C.ease(i / (n - 1));
  // Œil : départ déjà en mouvement (raccord), arrivée amortie (sinus : vitesse nulle à la fin) ou adoucie aux deux bouts.
  const ue = P.easeOut ? Math.sin(((i / (n - 1)) * Math.PI) / 2) : u;
  const e = C.mix3(P.e0, P.e1, ue);
  const eye = [c.x + e[0], c.y + e[1], c.z + e[2]];
  const aw = C.lerp(P.aw, P.aw1, u);
  const tgt = [C.lerp(c.x + P.a0[0], h.pos.x, aw), c.y + C.lerp(P.a0[1], 1.4, aw), C.lerp(c.z + P.a0[2], h.pos.z, aw)];
  if (!G.aim) G.aim = tgt;
  else G.aim = G.aim.map((v, q) => v + (tgt[q] - v) * 0.2);
  C.cam(eye, G.aim, C.lerp(P.fov0, P.fov1, u));
  const v = new C.V(h.pos.x, h.pos.y + 1.2, h.pos.z).project(g.camera);
  G.log.push([i, +G.along().toFixed(2), +h.jumpT.toFixed(2), +(h.jumpY || 0).toFixed(2), +v.x.toFixed(2), +v.y.toFixed(2), +h.speed.toFixed(2)]);
});
const r = await s.ev(() => {
  const G = window.__G;
  return { ev: G.ev, takeoff: G.takeoff, land: G.land, log: G.log };
});
console.log({ ev: r.ev, takeoff: r.takeoff, land: r.land });
for (const row of r.log.filter((x, q) => q % 6 === 0 || E.DEBUG)) console.log(row.join('\t'));
await s.close();
