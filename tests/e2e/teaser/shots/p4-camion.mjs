// Plan 4 du teaser : le camion STX Scania (g.truck), conduit par la cavalière, Comète à bord, roule sur la route de
// campagne bordée de peupliers (route est-ouest, vers l'ouest et le Haras de la Pommeraie) un après-midi ensoleillé.
// Caméra de poursuite basse, trois-quarts avant côté soleil (posée sur la voie d'en face, dégagée), qui accompagne le
// camion en glissant doucement vers le profil. 84 images (3,5 s, 24 images/s). Usage : node tests/e2e/teaser/shots/p4-camion.mjs (PREVIEW=1 : aperçu).
// Réglages (essais) : HOUR, NAME, N, ROAD (route du réseau), S0 (abscisse curviligne du camion au début du plan, m),
// DIR (+1 / -1 : sens de parcours de la route), V (vitesse, m/s), P (cadrage, JSON, voir plus bas).
import { open, OUT, PREVIEW } from '../lib.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Prise de vues tolérante à la charge de la machine (d'autres plans se rendent en parallèle) : même sortie que
// s.shoot de lib.mjs (dossier OUT/<nom>, 00000.jpg…, qualité 92, aperçu une image sur 6).
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
const HOUR = Number(E.HOUR || 17.8);
const NAME = E.NAME || 'p4-camion';
const N = Number(E.N || 84);
const ROAD = E.ROAD || 'ew';
const S0 = Number(E.S0 || 805);
const DIR = Number(E.DIR || -1);
const V = Number(E.V || 12.5);
// Cadrage dans le repère du camion (côté : + à gauche / - à droite ; avant : + devant le centre du camion) :
// [côté0, avant0, côté1, avant1, hauteur œil 0, hauteur œil 1, visée avant 0, visée avant 1, visée hauteur, champ 0,
// champ 1] (champ vertical en degrés).
const P = JSON.parse(E.P || '[2.8, 20, 8.5, 7.5, 1.2, 1.45, 2.5, 0.3, 2.3, 38, 44]');

const s = await open({ hour: HOUR });
// Teaser : marques non autorisées masquées (inscriptions SCANIA et STX du camion, DEFENDER et badges 110 du 4×4).
await s.ev(() => window.__game.scene.traverse((o) => { if (/Scania_lettering|STX_capucine|DEFENDER_|Badge_110/.test(o.name)) o.visible = false; }));
const info = await s.ev(async ([HOUR, ROAD, S0, DIR, V, P]) => {
  const g = window.__game, A = window.__auto, C = window.__cine;
  const { ROADS } = await import('/src/world/layout.js');
  C.lockHour = HOUR;
  const t = g.truck, tp = g.player.transport;
  // Comète voyage à bord (pont fermé), la cavalière prend le volant.
  if (!tp.isAboard(g.mainHorse)) {
    A.foot();
    t.setRampInstant(true);
    tp.loadInstant(g.mainHorse);
    t.setRampInstant(false);
  }
  A.drive();
  // Voie de droite (1,3 m à droite de l'axe de la chaussée), parcourue dans le sens DIR.
  let pts = ROADS.find((r) => r.id === ROAD).pts.map((p) => p.slice());
  if (DIR < 0) pts = pts.reverse();
  const R = pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / l) * 1.3, p[1] + (dx / l) * 1.3];
  });
  const seg = [], cum = [0];
  for (let k = 0; k < R.length - 1; k++) {
    seg.push(Math.hypot(R[k + 1][0] - R[k][0], R[k + 1][1] - R[k][1]));
    cum.push(cum[k] + seg[k]);
  }
  const at = (sv) => {
    let k = 0;
    while (k < seg.length - 1 && cum[k + 1] < sv) k++;
    const u = (sv - cum[k]) / seg[k];
    return [R[k][0] + (R[k + 1][0] - R[k][0]) * u, R[k][1] + (R[k + 1][1] - R[k][1]) * u, Math.atan2(R[k + 1][0] - R[k][0], R[k + 1][1] - R[k][1])];
  };
  const proj = (x, z) => {
    let best = 0, bd = Infinity;
    for (let k = 0; k < seg.length; k++) {
      const ax = R[k][0], az = R[k][1], dx = R[k + 1][0] - ax, dz = R[k + 1][1] - az;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
      if (d < bd) { bd = d; best = cum[k] + seg[k] * u; }
    }
    return { s: best, d: bd };
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // Conducteur : poursuite pure sur la voie, vitesse de croisière V (joystick virtuel, comme le joueur).
  const drive = (dt) => {
    const sp = Math.max(0, t.speed);
    const s0 = proj(t.pos.x, t.pos.z).s;
    const Ld = Math.max(8, Math.min(22, 6 + sp * 0.9));
    const look = at(s0 + Ld);
    const alpha = wrap(Math.atan2(look[0] - t.pos.x, look[1] - t.pos.z) - t.heading);
    const dl = Math.max(3, Math.hypot(look[0] - t.pos.x, look[1] - t.pos.z));
    const WB = t.sim.spec.zFront - t.sim.spec.zRear;
    const delta = Math.atan((2 * WB * Math.sin(alpha)) / dl);
    const steerIn = Math.max(-1, Math.min(1, -delta / t.sim.steerLimit(Math.abs(t.speed))));
    const aDes = Math.max(-2, Math.min(1.3, (V - t.speed) * 1.2));
    const thr = aDes > 0 ? Math.min(0.9, 0.12 + aDes / 1.6) : Math.max(-0.5, aDes / 6.8 - 0.02);
    g.input.setVirtualMove(steerIn / 1.2, thr / 1.25);
    g.update(dt);
  };
  // Circulation : aucune voiture sur la portion parcourue (élan compris) ni dans le champ.
  const clear = () => {
    for (const c of g.ambient.cars) {
      const q = proj(c.pos.x, c.pos.z);
      if (q.d < 14 && q.s > S0 - V * 6 - 40 && q.s < S0 + 160) {
        c.s = (c.s + c.len * 0.5) % c.len;
        c._place?.();
      }
    }
  };
  clear();
  clear();
  // Départ lancé : camion posé sur sa voie, élan de 6 s (vitesse de croisière installée, rapport engagé).
  const lead = S0 - V * 6;
  const p0 = at(lead);
  t.setPosition(p0[0], p0[1], p0[2]);
  t.speed = V * 0.8;
  for (let k = 0; k < 6 * 30; k++) drive(1 / 30);
  clear();
  window.__G = { drive, at, proj, P, hd: t.heading, log: [] };
  C.focus = { x: t.pos.x, y: t.pos.y, z: t.pos.z };
  g.sky.update(g.hour(), C.focus, 0);
  g.sky.updateEnvironment?.(g.renderer, performance.now() / 1000, true);
  return { mode: g.player.mode, inTruck: g.player.inTruck, aboard: tp.aboard.length, x: +t.pos.x.toFixed(1), z: +t.pos.z.toFixed(1), s: +proj(t.pos.x, t.pos.z).s.toFixed(1), speed: +t.speed.toFixed(2), gear: t.gearLabel, cars: g.ambient.cars.map((c) => [c.road.id, Math.round(c.pos.x), Math.round(c.pos.z)]) };
}, [HOUR, ROAD, S0, DIR, V, P]);
console.log(JSON.stringify(info));

await shoot(s, NAME, N, (i, n) => {
  const C = window.__cine, g = window.__game, t = g.truck, G = window.__G, P = G.P;
  // Une image = 1/24 s de simulation exactement (pas de saccade 30 Hz / 24 images/s).
  G.drive(1 / 24);
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + C.lockHour * 3600;
  C.focus = { x: t.pos.x, y: t.pos.y, z: t.pos.z };
  // Cap lissé (la caméra ne reprend pas les petites corrections de volant).
  G.hd += Math.atan2(Math.sin(t.heading - G.hd), Math.cos(t.heading - G.hd)) * 0.12;
  const u = i / (n - 1), e = 0.5 * u + 0.5 * C.ease(u);
  const side = C.lerp(P[0], P[2], e), fwd = C.lerp(P[1], P[3], e);
  const o = { pos: t.pos, heading: G.hd };
  const eye = C.around(o, side, 0, fwd);
  // Hauteur de l'œil au-dessus du sol (chaussée puis accotement), lissée : aucun à-coup dû au relief.
  const gy = g.world.groundAt(eye[0], eye[2]);
  G.gy = G.gy == null ? gy : G.gy + (gy - G.gy) * 0.2;
  eye[1] = G.gy + C.lerp(P[4], P[5], e);
  const tg = C.around(o, 0, 0, C.lerp(P[6], P[7], e));
  tg[1] = t.pos.y + P[8];
  C.cam(eye, tg, C.lerp(P[9], P[10], e));
  const v = new C.V(t.pos.x, t.pos.y + 1.6, t.pos.z).project(g.camera);
  G.log.push([+v.x.toFixed(3), +v.y.toFixed(3), +t.speed.toFixed(1), +G.proj(t.pos.x, t.pos.z).d.toFixed(2), eye.map((q) => +q.toFixed(1)), [+t.pos.x.toFixed(1), +t.pos.z.toFixed(1), +G.hd.toFixed(3)]]);
});
const log = await s.ev(() => window.__G.log);
if (E.DEBUG) for (const r of log.filter((_, k) => k % 12 === 0)) console.log(JSON.stringify(r));
console.log('écran x', Math.min(...log.map((r) => r[0])).toFixed(2), Math.max(...log.map((r) => r[0])).toFixed(2), 'vitesse', Math.min(...log.map((r) => r[2])), Math.max(...log.map((r) => r[2])), 'écart voie max', Math.max(...log.map((r) => r[3])));
console.log(await s.ev(() => { const t = window.__game.truck; return { x: +t.pos.x.toFixed(1), z: +t.pos.z.toFixed(1), speed: +t.speed.toFixed(2), bumps: window.__game.player.transport.comfort }; }));
await s.close();
