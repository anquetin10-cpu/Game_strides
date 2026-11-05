// Plan 1 du teaser : vue aérienne de drone qui glisse lentement depuis la mer vers la plage et Deauville City
// (immeuble STRIDES visible), lumière dorée de fin de journée. 120 images (5 s).
// Réglages (essais) : HOUR (heure figée), N (nombre d'images), NAME (dossier de sortie).
import { open } from '../lib.mjs';

const HOUR = Number(process.env.HOUR || 18.5);
const N = Number(process.env.N || 120);
const NAME = process.env.NAME || 'p1-aerien';
const DAY = process.env.DAY == null ? null : Number(process.env.DAY);

const s = await open({ hour: HOUR });
await s.ev(([h, day]) => {
  const C = window.__cine, g = window.__game;
  // Jour de jeu (météo déterministe : couverture nuageuse du jour).
  if (day != null) g.save.data.gameTime = day * 86400 + h * 3600;
  C.lockHour = h;
  // Ombres centrées sur le front de mer et l'immeuble STRIDES.
  C.focus = { x: 80, y: 4, z: -340 };
  // Quelques secondes de jeu : mer, bateaux, ciel et carte d'environnement à jour.
  C.advance(2);
  return { day: Math.floor(g.save.data.gameTime / 86400), cover: g.sky.cover };
}, [HOUR, DAY]).then((r) => console.log('jour', r));
await s.shoot(NAME, N, (i, n) => {
  const C = window.__cine, t = C.ease(i / (n - 1));
  C.advance();
  // Œil : du large (nord-est, au-dessus de la mer) vers la plage, en descendant légèrement.
  const eye = C.mix3([215, 74, -640], [150, 46, -478], t);
  // Cible : glisse doucement du bord de mer vers le cœur de Deauville City (immeuble STRIDES en (108, -330)).
  const tgt = C.mix3([70, 2, -350], [60, 6, -300], t);
  C.cam(eye, tgt, 46);
});
await s.close();
