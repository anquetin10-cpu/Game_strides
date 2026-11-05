// Plan 1 du teaser : vue aérienne de drone qui glisse lentement depuis la mer vers la plage et Deauville City
// (immeuble STRIDES visible), lumière dorée de fin de journée. 120 images (5 s).
// Réglages (essais) : HOUR (heure figée), DAY (jour de jeu = météo), N (nombre d'images), NAME (dossier de sortie),
// PATH_JSON ([œil départ, œil arrivée, cible départ, cible arrivée]), FOV.
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

const HOUR = Number(process.env.HOUR || 18);
const DAY = process.env.DAY == null ? null : Number(process.env.DAY);
const N = Number(process.env.N || 120);
const NAME = process.env.NAME || 'p1-aerien';
const FOV = Number(process.env.FOV || 46);
// Œil : du large (nord-est, au-dessus de la mer) vers la plage, en descendant légèrement ; cible : du front de mer
// vers le cœur de Deauville City (immeuble STRIDES en (108, -330)).
const PATH = JSON.parse(process.env.PATH_JSON || '[[360,85,-660],[230,42,-500],[60,0,-370],[60,8,-320]]');

const s = await open({ hour: HOUR });
const info = await s.ev(([h, day, path, fov]) => {
  const C = window.__cine, g = window.__game;
  // Jour de jeu (météo déterministe : couverture nuageuse du jour).
  if (day != null) g.save.data.gameTime = day * 86400 + h * 3600;
  C.lockHour = h;
  // Ombres centrées sur le front de mer et l'immeuble STRIDES.
  C.focus = { x: 80, y: 4, z: -340 };
  window.__P = { path, fov };
  // Quelques secondes de jeu : mer, bateaux, ciel et carte d'environnement à jour.
  C.advance(2);
  return { day: Math.floor(g.save.data.gameTime / 86400), cover: g.sky.cover };
}, [HOUR, DAY, PATH, FOV]);
console.log('jour', info);
await shoot(s, NAME, N, (i, n) => {
  const C = window.__cine, t = C.ease(i / (n - 1));
  const [E0, E1, T0, T1] = window.__P.path;
  C.advance();
  C.cam(C.mix3(E0, E1, t), C.mix3(T0, T1, t), window.__P.fov);
});
await s.close();
