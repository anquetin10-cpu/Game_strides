// Plan 3 du teaser : la cavalière montée sur Comète au galop le long de la plage, près de l'eau, lumière dorée.
// Travelling bas sur le côté (côté terre, regard vers la mer), qui suit le cheval ; mer et ciel derrière.
// 120 images (5 s). Réglages (essais) : HOUR, DAY, N, NAME, X0 (abscisse du cheval au début du plan), OFF (distance
// au rivage, m), DIR (-1 : galop vers l'ouest, +1 : vers l'est), LEAD0/LEAD1 (avance de la caméra sur le cheval,
// début/fin), SIDE (écart latéral, m), CAMH (hauteur de l'œil, m), AIMX/AIMY (visée devant / au-dessus du cheval), FOV.
import { open, OUT, PREVIEW } from '../lib.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Prise de vues tolérante à la charge de la machine (rendus d'autres plans en parallèle) : même sortie que s.shoot de
// lib.mjs (dossier OUT/<nom>, 00000.jpg…, qualité 92, aperçu une image sur 6), mais capture d'écran sans délai court
// et nouvel essai en cas d'échec ponctuel.
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
const HOUR = Number(E.HOUR || 19);
// Défaut : 3,5 m du rivage (sable ferme mouillé, au bord de l'eau).
const DAY = E.DAY == null ? null : Number(E.DAY);
const N = Number(E.N || 120);
const NAME = E.NAME || 'p3-galop-plage';
const P = {
  x0: Number(E.X0 || 120), off: Number(E.OFF || 3.5), dir: Number(E.DIR || -1),
  lead0: Number(E.LEAD0 || 3.2), lead1: Number(E.LEAD1 || 1.8), side: Number(E.SIDE || 5.2), camh: Number(E.CAMH || 1.25),
  fov: Number(E.FOV || 44), aimY: Number(E.AIMY || 1.35), aimX: Number(E.AIMX || 1.6),
};

const s = await open({ hour: HOUR });
const info = await s.ev(([h, day, P]) => {
  const C = window.__cine, g = window.__game, A = window.__auto;
  // Sable projeté allégé : l'effet du jeu forme de grosses bouffées blanchâtres à l'image (on garde une projection
  // sur trois, une particule à la fois) ; empreintes et écume inchangées.
  const em = g.particles.emit.bind(g.particles);
  let nSand = 0;
  g.particles.emit = (k, x, y, z, n, vx, vz) => (k === 'sand' ? (nSand++ % 3 === 0 ? em(k, x, y, z, 1, vx, vz) : undefined) : em(k, x, y, z, n, vx, vz));
  if (day != null) g.save.data.gameTime = day * 86400 + h * 3600;
  C.lockHour = h;
  A.tick(2);
  A.mount();
  const p = g.player, hz = p.horse;
  // Ligne de galop parallèle au rivage, sur le sable mouillé à `off` m de l'eau (marée du moment) : droite ajustée
  // sur le rivage de toute la zone du plan (pas d'ondulation du trait d'eau, donc ni lacet du cheval ni à-coup de caméra).
  const xa = P.x0 - P.dir * 80, xb = P.x0 + P.dir * 110;
  const pts = [];
  for (let k = 0; k <= 19; k++) {
    const x = xa + ((xb - xa) * k) / 19;
    pts.push([x, g.terrain.waterlineZ(x)]);
  }
  const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, mz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  const slope = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - mz), 0) / pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0);
  const zAt = (x) => mz + slope * (x - mx) + P.off;
  // Écart maximal entre la ligne et le rivage réel (contrôle : le cheval reste au sec, près de l'eau).
  const dev = Math.max(...pts.map((q) => Math.abs(zAt(q[0]) - P.off - q[1])));
  // Élan : 150 pas de 1/30 s au galop (≈ 5 s, ≈ 60 m) avant le début du plan.
  const xs = P.x0 - P.dir * 62;
  hz.setPosition(xs, zAt(xs), P.dir * Math.PI / 2);
  hz.speed = 9;
  hz.stamina = hz.maxStamina;
  const steer = () => {
    // Poursuite d'un point de la ligne 12 m devant, joystick à fond et galop (endurance gardée pleine : plan court).
    const ax = hz.pos.x + P.dir * 12;
    A.steer(ax - hz.pos.x, zAt(ax) - hz.pos.z, 1);
    g.input.held.add('gallop');
    hz.stamina = hz.maxStamina;
  };
  window.__G = { P, zAt, steer, camX: 0 };
  for (let i = 0; i < 150; i++) {
    steer();
    A.tick(1);
  }
  // Suivi lissé (filtre du premier ordre, coefficient 0,35 par image) amorcé à son retard d'équilibre : pas de
  // rattrapage visible aux premières images.
  window.__G.camX = hz.pos.x - P.dir * (hz.speed / 24) * (0.65 / 0.35);
  window.__G.camY = null;
  window.__G.aimY = null;
  return {
    dev: +dev.toFixed(2), slope: +slope.toFixed(4),
    horse: hz.name, main: hz === g.mainHorse, mode: p.mode, speed: +hz.speed.toFixed(2), x: +hz.pos.x.toFixed(1), z: +hz.pos.z.toFixed(1),
    water: +g.terrain.waterlineZ(hz.pos.x).toFixed(1), depth: +g.terrain.waterDepth(hz.pos.x, hz.pos.z).toFixed(2), tide: +g.tide.level.toFixed(2), day: Math.floor(g.save.data.gameTime / 86400),
  };
}, [HOUR, DAY, P]);
console.log(info);

await shoot(s, NAME, N, (i, n) => {
  const C = window.__cine, g = window.__game, hz = g.player.horse, G = window.__G, P = G.P;
  G.steer();
  // Simulation avancée d'exactement 1/24 s par image (pas de saccade 30 Hz / 24 images/s sur un travelling rapide).
  g.update(1 / 24);
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + C.lockHour * 3600;
  C.focus = { x: hz.pos.x, y: hz.pos.y, z: hz.pos.z };
  // Suivi lissé le long de la plage (abscisse seulement : pas de tremblement dû au balancement du cheval).
  G.camX += (hz.pos.x - G.camX) * 0.35;
  const cx = G.camX;
  const lead = C.lerp(P.lead0, P.lead1, C.ease(i / (n - 1)));
  const ex = cx + P.dir * lead;
  const ez = G.zAt(ex) + P.side;
  // Hauteur de l'œil : au-dessus du sable (côté terre, plus haut) et lissée (aucun tremblement dû au grain du sable).
  const gy = Math.max(g.terrain.getHeight(ex, ez), g.terrain.getHeight(cx, G.zAt(cx)));
  G.camY = G.camY == null ? gy : G.camY + (gy - G.camY) * 0.15;
  // Visée un peu devant le cheval (de l'espace devant lui dans le cadre), à hauteur du garrot, lissée elle aussi.
  const ax = cx + P.dir * P.aimX;
  const ay = g.terrain.getHeight(ax, G.zAt(ax)) + P.aimY;
  G.aimY = G.aimY == null ? ay : G.aimY + (ay - G.aimY) * 0.15;
  C.cam([ex, G.camY + P.camh, ez], [ax, G.aimY, G.zAt(ax) - 0.6], P.fov);
  // Contrôle : position du cheval à l'écran (régularité du suivi), sol et profondeur d'eau.
  const v = new C.V(hz.pos.x, hz.pos.y + 1.2, hz.pos.z).project(g.camera);
  (G.log ||= []).push([+v.x.toFixed(3), +v.y.toFixed(3), +hz.speed.toFixed(1), +g.terrain.waterDepth(hz.pos.x, hz.pos.z).toFixed(2), g.surfaceAt?.(hz.pos.x, hz.pos.z)]);
});
const log = await s.ev(() => window.__G.log);
const xs = log.map((r) => r[0]);
const d = xs.slice(1).map((x, i) => x - xs[i]);
if (E.DEBUG) console.log(xs.map((x) => x.toFixed(3)).join(' '));
console.log('écran x min/max', Math.min(...xs).toFixed(3), Math.max(...xs).toFixed(3), 'saut max image à image', Math.max(...d.map(Math.abs)).toFixed(4),
  'profondeur max', Math.max(...log.map((r) => r[3])).toFixed(2), 'sols', [...new Set(log.map((r) => r[4]))].join(','), 'vitesse min', Math.min(...log.map((r) => r[2])));
console.log(await s.ev(() => {
  const g = window.__game, h = g.player.horse;
  return { speed: +h.speed.toFixed(2), x: +h.pos.x.toFixed(1), z: +h.pos.z.toFixed(1), depth: +g.terrain.waterDepth(h.pos.x, h.pos.z).toFixed(2) };
}));
await s.close();
