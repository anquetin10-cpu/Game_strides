// Plan 2 — « Ton écurie » : Écurie du Val au petit matin. Lent travelling vers l'écurie à couloir central : la
// cavalière panse Comète (en licol) dans la cour, devant les boxes où d'autres chevaux passent la tête par la fenêtre.
// 96 images (4 s, 24 images/s). Usage : node tests/e2e/teaser/shots/p2-ecurie.mjs (PREVIEW=1 pour l'aperçu).
// Retouches (relecture) : brouette de la cour masquée (sa roue noire semblait flotter près du poitrail), soleil du matin
// plus doré, départ un peu plus serré (moins de cour vide en bas de l'image).
import { open } from '../lib.mjs';

const HOUR = +(process.env.HOUR || 8.5);
const NAME = process.env.NAME || 'p2-ecurie';
const N = 96;
const s = await open({ hour: HOUR });
await s.ev((HOUR) => {
  const g = window.__game, A = window.__auto, C = window.__cine, h = g.mainHorse, p = g.player;
  C.lockHour = HOUR;
  // Chevaux au box côté cour, tête passée par la fenêtre (comme la mission « Foin du matin »).
  const B = { x: -120, w: 50 }, boxX = (i) => B.x - B.w / 2 + 0.25 + 3.6 * (i + 0.5);
  const heads = [[2, 'grey'], [4, 'black'], [7, 'chestnut']];
  for (const [i, coat] of heads) {
    const hh = g.spawnHorse({ id: `teaser-box${i}`, coat, blaze: i % 2 === 0 }, boxX(i), 156.5 - 1.4, 0, { saddle: false });
    hh.frozen = true;
    hh.ai = null;
    hh.ambient = true;
  }
  // Comète en licol (selle retirée comme pour le transport), dans la cour ; la cavalière la panse côté caméra.
  A.foot();
  h.ai = null;
  h.speed = 0;
  p.transport.travelTack(h, true);
  h.setPosition(-121, 165.5, Math.PI / 2);
  p.human.setPosition(-120.6, 167.2);
  A.tick(3);
  p.startGroom(h, 'brush', 30);
  A.tick(45);
  C.focus = { x: -120, y: 3, z: 166 };
  window.__gy = (x, z) => g.world.groundAt(x, z);
}, HOUR);
// Brouette de la cour (-129, 161) : derrière Comète, seule sa roue noire dépassait (« boule noire » qui semblait
// flotter près du poitrail). Elle fait partie d'un lot statique fusionné (tableaux libérés après envoi au GPU) : on la
// masque pour ce plan seulement, dans la page, en écartant les fragments de ce lot dans un cylindre de 1,1 m autour
// d'elle (rendu et ombre portée). Aucun fichier du jeu n'est modifié.
await s.page.evaluate(async () => {
  const g = window.__game;
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/\.vite\/deps\/three\.js/.test(n));
  const T = await import(url);
  const st = g.scene.getObjectByName('static:-1,1');
  const W = { x: -129, z: 161, r: 1.1, top: g.world.groundAt(-129, 161) + 1.4 };
  const cut = `if ( length( vNbPos.xz - vec2( ${W.x.toFixed(2)}, ${W.z.toFixed(2)} ) ) < ${W.r.toFixed(2)} && vNbPos.y < ${W.top.toFixed(2)} ) discard;`;
  const base = st.material, prev = base.onBeforeCompile;
  const m = base.clone();
  m.onBeforeCompile = (sh, r) => {
    prev.call(base, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNbPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNbPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNbPos;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${cut}`);
  };
  m.customProgramCacheKey = () => 'st-surfaces-teaser-nobarrow';
  st.material = m;
  const d = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
  d.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNbPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNbPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNbPos;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${cut}`);
  };
  d.customProgramCacheKey = () => 'depth-teaser-nobarrow';
  st.customDepthMaterial = d;
});
await s.ev((W) => {
  const g = window.__game, C = window.__cine;
  // Soleil du matin un peu plus doré (le soleil du jeu reste blanchâtre à 8 h 30) : teinte appliquée à la lumière
  // directe après chaque mise à jour du ciel, dans la page uniquement. Ombres et volumes restent ceux du jeu.
  const W3 = JSON.parse(W);
  const up = g.sky.update;
  g.sky.update = function (...a) {
    const r = up.apply(this, a);
    if (this.sun.intensity > 0.5) {
      this.sun.color.r *= W3[0];
      this.sun.color.g *= W3[1];
      this.sun.color.b *= W3[2];
      this.sun.intensity *= W3[3];
    }
    return r;
  };
  // Éclairage d'ambiance recalculé pour l'heure du plan avant la première image.
  g.sky.update(g.hour(), C.focus, 0);
  g.sky.updateEnvironment(g.renderer, performance.now() / 1000, true);
}, process.env.WARM || JSON.stringify([1, 0.86, 0.68, 1.08]));
await s.ev((P) => { window.__P = P; }, process.env.P || JSON.stringify([9.4, 1.8, 4.8, 5.9, 1.45, 3.05, -4.3, 1.8, -2.1, -1.0, 1.68, -0.6, 38]));

await s.shoot(NAME, N, (i, n) => {
  // Mouvement déjà engagé au début et à la fin du plan (montage) : moitié linéaire, moitié adoucie.
  const C = window.__cine, gy = window.__gy, u = i / (n - 1), t = 0.55 * u + 0.45 * C.ease(u);
  // Un pas de simulation de 1/24 s exactement par image : gestes de pansage réguliers d'une image à l'autre.
  window.__game.update(1 / 24);
  C.advance(0);
  const S = { x: -121, z: 165.5 };
  const P = JSON.parse(window.__P);
  const e0 = [S.x + P[0], P[1], S.z + P[2]], e1 = [S.x + P[3], P[4], S.z + P[5]];
  const t0 = [S.x + P[6], P[7], S.z + P[8]], t1 = [S.x + P[9], P[10], S.z + P[11]];
  const e = C.mix3(e0, e1, t), tg = C.mix3(t0, t1, t);
  e[1] += gy(e[0], e[2]);
  tg[1] += gy(tg[0], tg[2]);
  C.cam(e, tg, P[12] || 40);
});
await s.close();
