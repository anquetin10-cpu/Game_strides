// Plan 6 du teaser : saut d'obstacles au Pôle International. La cavalière réaliste sur Comète, au galop de concours,
// aborde l'oxer n° 2 du parcours (ligne des tribunes, sauté vers l'est) et le franchit proprement (appel au cœur de la
// bonne zone, comme l'aide du jeu : aucune barre touchée). Caméra latérale basse côté piste, regard vers les tribunes
// garnies : travelling lent pendant l'abord (la cavalière arrive de la gauche, à découvert), puis la caméra accompagne
// le couple à l'envol et à la réception. Ralenti progressif autour de l'envol (temps de jeu × 0,35 pendant 2 s),
// temps réel avant et après. Soirée (17 h 54), 168 images (7 s).
// Réglages (essais) : HOUR, N, NAME, OBS (obstacle), MAG (joystick : cadence du galop), S0 (abscisse du cheval sur l'axe
// de l'obstacle au début du plan, m, négatif = avant), STRIG (abscisse où le ralenti commence), KS (facteur du ralenti),
// R1/HOLD/R2 (images de descente, de tenue et de remontée du ralenti), EAS/EA0 (position de la caméra le long de l'axe :
// début, puis à l'envol, atteinte à l'image DOLLYN), EOFF/SW (ensuite : EOFF m devant le cheval, raccord lissé sur SW m),
// ES0/ES1 (écart latéral, m : négatif = côté sud), EH (hauteur de l'œil), AIMY/AIMJ (visée : hauteur, part du saut
// suivie), LEAD (visée devant le cheval), MIXO (part de l'obstacle dans la visée à l'approche), FOV0/FOV1.
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
const HOUR = Number(E.HOUR || 17.9);
const N = Number(E.N || 168);
const NAME = E.NAME || 'p6-cso';
const num = (k, d) => (E[k] == null ? d : Number(E[k]));
const P = {
  obs: E.OBS || '2', mag: num('MAG', 0.66), s0: num('S0', -22), strig: num('STRIG', -6.2), ks: num('KS', 0.35),
  r1: num('R1', 10), hold: num('HOLD', 48), r2: num('R2', 16),
  eas: num('EAS', -5.5), ea0: num('EA0', -2), dollyn: num('DOLLYN', 68), eoff: num('EOFF', 1.5), sw: num('SW', 1.5), es0: num('ES0', -9), es1: num('ES1', -7.8),
  eh: num('EH', 0.95), aimY: num('AIMY', 1.4), aimJ: num('AIMJ', 0.5), lead: num('LEAD', 1.0), mixo: num('MIXO', 0.3), fov0: num('FOV0', 31), fov1: num('FOV1', 31),
};

const s = await open({ hour: HOUR });
// Teaser : sable projeté allégé (une projection sur trois, une particule) ; les bouffées du jeu ressemblent à de la fumée.
await s.ev(() => { const g = window.__game, em = g.particles.emit.bind(g.particles); let n = 0; g.particles.emit = (k, x, y, z, c, vx, vz) => (k === 'sand' ? (n++ % 3 === 0 ? em(k, x, y, z, 1, vx, vz) : undefined) : em(k, x, y, z, c, vx, vz)); });
const info = await s.ev(([h0, P]) => {
  const C = window.__cine, g = window.__game, A = window.__auto;
  C.lockHour = h0;
  A.tick(2);
  A.mount();
  const h = g.player.horse;
  const o = g.obstacles.ofCourse('cso').find((q) => q.label === P.obs);
  g.obstacles.resetRails('cso');
  // Fers d'or à collectionner (objets du jeu qui flottent, dont un dans la carrière) : retirés du plan.
  for (const it of g.collectibles.items) g.scene.remove(it.g);
  g.collectibles.items.length = 0;
  // Panneau du numéro de l'obstacle : vu de dos (en miroir) quand la caméra passe derrière son plan pendant le saut.
  if (o.sign) o.sign.visible = false;
  const along = () => (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
  // Élan : départ 16 m avant l'abscisse du début du plan, dans l'axe de l'obstacle, au galop de concours.
  const sStart = P.s0 - 16;
  h.setPosition(o.x + o.n.x * sStart, o.z + o.n.z * sStart, o.rot);
  h.speed = 6.8 * h.speedMul;
  h.stamina = h.maxStamina;
  const ev = [];
  g.bus.on('obstacle:clear', (e) => ev.push({ k: 'clear', l: e.obstacle.label, m: +e.margin.toFixed(3) }));
  g.bus.on('obstacle:fault', (e) => ev.push({ k: 'fault', l: e.obstacle.label, c: e.cause }));
  g.bus.on('obstacle:refusal', (e) => ev.push({ k: 'refusal', l: e.obstacle.label }));
  const G = (window.__G = { P, o, along, ev, done: new Set(), trig: -1, log: [], aim: null, eye: null });
  // Pilotage de la cavalière : joystick dans l'axe de l'obstacle (galop de concours), appel au cœur de la bonne zone
  // (mêmes calculs que l'aide du jeu : sommet du saut au-dessus de l'obstacle, comme A.jumpObstacle).
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
  return { s: +along().toFixed(2), speed: +h.speed.toFixed(2), horse: h.name, main: h === g.mainHorse, mode: g.player.mode, o: { x: o.x, z: o.z, h: o.h, kind: o.kind, ground: +o.ground.toFixed(2) } };
}, [HOUR, P]);
console.log(info);

await shoot(s, NAME, N, (i, n) => {
  const C = window.__cine, g = window.__game, h = g.player.horse, G = window.__G, P = G.P, o = G.o;
  // Échelle de temps : temps réel, puis ralenti progressif dès que le cheval atteint STRIG (quelques foulées avant
  // l'appel), tenue pendant le saut, retour progressif au temps réel à la réception.
  if (G.trig < 0 && G.along() >= P.strig) G.trig = i;
  let k = 1;
  if (G.trig >= 0) {
    const j = i - G.trig;
    if (j < P.r1) k = C.lerp(1, P.ks, C.ease((j + 1) / P.r1));
    else if (j < P.r1 + P.hold) k = P.ks;
    else if (j < P.r1 + P.hold + P.r2) k = C.lerp(P.ks, 1, C.ease((j - P.r1 - P.hold + 1) / P.r2));
  }
  G.ride();
  const jt0 = h.jumpT;
  g.update(k / 24);
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + C.lockHour * 3600;
  if (jt0 < 0 && h.jumpT >= 0 && G.takeoff == null) G.takeoff = i;
  if (jt0 >= 0 && h.jumpT < 0 && G.land == null) G.land = i;
  C.focus = { x: o.x, y: o.ground, z: o.z };
  // Caméra basse de trois quarts face, côté piste, devant l'obstacle (le chandelier proche ne masque jamais le cheval) :
  // immobile pendant l'abord et le saut, puis elle accompagne le couple à la réception (travelling qui démarre en
  // douceur, sans à-coup : position = max lissé entre le point fixe et `EOFF` m devant le cheval). Visée sur le couple,
  // tirée vers l'obstacle tant que le cheval est loin (les deux dans le cadre), lissée.
  const u = C.ease(i / (n - 1));
  const s2 = G.along();
  const f = s2 + P.eoff;
  const base = C.lerp(P.eas, P.ea0, C.ease(Math.min(1, i / P.dollyn)));
  const ea = base + P.sw * Math.log(1 + Math.exp((f - base) / P.sw));
  const es = C.lerp(P.es0, P.es1, C.ease(Math.min(1, i / P.dollyn)));
  const gy = o.ground;
  const eye = [o.x + o.n.x * ea + o.t.x * es, gy + P.eh, o.z + o.n.z * ea + o.t.z * es];
  const w = s2 < -2 ? P.mixo * C.ease(Math.min(1, Math.max(0, (-s2 - 2) / 14))) : 0;
  const hx = h.pos.x + h.forward.x * P.lead, hz = h.pos.z + h.forward.z * P.lead;
  const tx = C.lerp(hx, o.x, w), tz = C.lerp(hz, o.z, w);
  const ty = gy + P.aimY + (h.jumpY || 0) * P.aimJ;
  const a = 1 - Math.pow(1 - 0.3, k);
  if (!G.aim) G.aim = [tx, ty, tz];
  else G.aim = G.aim.map((v, q) => v + ([tx, ty, tz][q] - v) * a);
  C.cam(eye, G.aim, C.lerp(P.fov0, P.fov1, u));
  const v = new C.V(h.pos.x, h.pos.y + 1.2, h.pos.z).project(g.camera);
  G.log.push([i, +k.toFixed(2), +s2.toFixed(2), +h.jumpT.toFixed(2), +(h.jumpY || 0).toFixed(2), +v.x.toFixed(2), +v.y.toFixed(2), +h.speed.toFixed(2)]);
});
const r = await s.ev(() => {
  const G = window.__G;
  return { ev: G.ev, trig: G.trig, takeoff: G.takeoff, land: G.land, log: G.log };
});
console.log({ ev: r.ev, trig: r.trig, takeoff: r.takeoff, land: r.land });
if (E.DEBUG) for (const row of r.log) console.log(row.join('\t'));
else for (const row of r.log.filter((x, q) => q % 6 === 0)) console.log(row.join('\t'));
await s.close();
