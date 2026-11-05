// Plan 8 — La nuit à l'Écurie du Val : carrière sous les projecteurs, la cavalière et Comète au galop sautent le
// vertical ; derrière, l'écurie éclairée et le ciel étoilé. Lent panoramique accompagné d'un léger travelling latéral
// depuis le bord de la carrière. 96 images (4 s, 24 images/s).
// Usage : node tests/e2e/teaser/shots/p8-nuit.mjs (PREVIEW=1 pour l'aperçu).
import { open } from '../lib.mjs';

const HOUR = +(process.env.HOUR || 22.2);
const NAME = process.env.NAME || 'p8-nuit';
const N = 96;
const s = await open({ hour: HOUR });
// Teaser : pas de poussière de nuit (elle forme des carrés sombres à l'image).
await s.ev(() => { const g = window.__game, em = g.particles.emit.bind(g.particles); g.particles.emit = (k, ...r) => (['sand', 'mud', 'spray'].includes(k) ? undefined : em(k, ...r)); });
const setup = await s.ev((HOUR) => {
  const g = window.__game, A = window.__auto, C = window.__cine;
  C.lockHour = HOUR;
  // Cavalier d'entraînement de la carrière (PNJ) : retiré, la piste est à la cavalière.
  const npc = g.horses.find((h) => h.id === 'rider-118');
  if (npc) g.despawn(npc);
  // Comète sellée, montée, au galop de travail sur la ligne du vertical (home1, 0,75 m, sauté vers +x).
  const o = g.obstacles.ofCourse('home').find((q) => q.id === 'home1');
  A.mount();
  const h = g.player.horse;
  const back = 11.7;
  h.setPosition(o.x - o.n.x * back, o.z - o.n.z * back, o.rot);
  h.speed = 6.2 * h.speedMul;
  h.stamina = h.maxStamina;
  g.cam.yaw = o.rot + Math.PI;
  window.__o = o;
  window.__jumped = false;
  // Pilotage à chaque pas de simulation (même logique que A.jumpObstacle : appel au cœur de la bonne zone).
  window.__ride = () => {
    const hh = g.player.horse, ob = window.__o;
    hh.ai = null;
    g.cam.yaw = ob.rot + Math.PI;
    // Après la réception, large courbe à gauche (vers l'écurie) : la piste reste libre, loin de l'oxer.
    const past = window.__jumped && hh.jumpT < 0 ? Math.max(0, (hh.pos.x - ob.x) * ob.n.x + (hh.pos.z - ob.z) * ob.n.z - 3) : 0;
    const th = ob.rot + Math.min(0.95, past * 0.1);
    A.steer(Math.sin(th), Math.cos(th), 0.63);
    g.input.held.delete('gallop');
    const tg = g.obstacles.target(hh);
    if (!window.__jumped && tg && tg.o === ob && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) {
      g.input.pressed.add('jump');
      window.__jumped = true;
    }
  };
  // Avance d'une image : un pas de simulation de 1/24 s exactement (mouvement régulier d'une image à l'autre, sans
  // l'alternance 1-1-1-2 des pas fixes de 1/30 s qui ferait saccader le galop).
  window.__step = () => {
    window.__ride();
    g.update(1 / 24);
    C.advance(0);
  };
  // Élan pris avant la première image (allure de galop installée).
  for (let k = 0; k < 8; k++) window.__step();
  C.focus = { x: -104, y: 3, z: 212 };
  g.sky.update(g.hour(), C.focus, 0);
  g.sky.updateEnvironment(g.renderer, performance.now() / 1000, true);
  window.__gy = (x, z) => g.world.groundAt(x, z);
  return { o: [o.x, o.z, o.rot, o.n.x, o.n.z], h: [h.pos.x, h.pos.z, h.speed] };
}, HOUR);
console.log(JSON.stringify(setup));
await s.ev((P) => { window.__P = P; }, process.env.P || JSON.stringify([-116, 2.5, 221.5, -100.5, 2.8, 216.5, -114, 1.4, 211, -96, 1.4, 206, 42, 34]));

await s.shoot(NAME, N, (i, n) => {
  const C = window.__cine, gy = window.__gy, u = i / (n - 1), t = 0.55 * u + 0.45 * C.ease(u);
  window.__step();
  const g = window.__game, h = g.player.horse;
  const P = JSON.parse(window.__P);
  const e = C.mix3(P.slice(0, 3), P.slice(3, 6), t);
  // Visée : trajectoire douce prévue, rapprochée du cheval (panoramique qui l'accompagne sans à-coups).
  const tp = C.mix3(P.slice(6, 9), P.slice(9, 12), t);
  const tg = [C.lerp(tp[0], h.pos.x, 0.5), tp[1], C.lerp(tp[2], h.pos.z, 0.5)];
  e[1] += gy(e[0], e[2]);
  tg[1] += gy(tg[0], tg[2]);
  // Léger resserrement du champ en fin de plan (le cheval s'éloigne vers l'écurie).
  C.cam(e, tg, C.lerp(P[12], P[13] ?? P[12], t));
  window.__log = (window.__log || []).concat([[i, +h.pos.x.toFixed(2), +h.pos.y.toFixed(2), +h.pos.z.toFixed(2), +(h.jumpT ?? -1).toFixed(2), +h.speed.toFixed(2)]]);
});
const log = await s.ev(() => window.__log);
console.log(JSON.stringify(log.filter((r, k) => k % 6 === 0)));
// Contrôle : le cheval ne doit jamais s'arrêter net (choc contre un obstacle) pendant le plan.
const stop = log.find((r) => r[5] < 2);
if (stop) console.log('ATTENTION : arrêt du cheval', JSON.stringify(stop));
await s.close();
