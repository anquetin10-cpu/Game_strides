// Plan 7 du teaser (AVEC interface) : le téléphone du jeu s'ouvre sur l'application Strides (« Demandes reçues » :
// missions proposées par les écuries et cavaliers) devant la cour de l'Écurie du Val, en matinée : la cavalière panse
// Comète en licol, des chevaux passent la tête aux fenêtres des boxes. Le téléphone monte du bas de l'écran (même
// mouvement que dans le jeu), puis la liste des demandes défile doucement ; la caméra avance lentement.
// 84 images (3,5 s, 24 images/s). Usage : node tests/e2e/teaser/shots/p7-telephone.mjs (PREVIEW=1 : aperçu).
// Réglages (essais) : HOUR, NAME, N, P (cadrage, JSON), SCROLL (défilement final de la liste, px à 1280 × 720),
// DIM (voile sombre derrière le téléphone, 0 à 1 ; le jeu utilise 0,38).
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
  // ONLY=0,40,83 : seules ces images sont rendues (pleine résolution), pour vérifier l'interface.
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
  for (let i = 0; i < n; i++) {
    const keep = only ? only.has(i) : !PREVIEW || i % 6 === 0;
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
const HOUR = Number(E.HOUR || 9.8);
const NAME = E.NAME || 'p7-telephone';
const N = Number(E.N || 84);
// Cadrage (repère : Comète en S = (-121, 165.5), hauteurs au-dessus du sol) :
// [œil0 x, y, z, œil1 x, y, z, visée0 x, y, z, visée1 x, y, z, champ vertical].
const P = JSON.parse(E.P || '[6.6, 1.5, 5.7, 5.5, 1.45, 4.7, 1.75, 1.15, -1.0, 1.45, 1.15, -0.85, 40]');
const SCROLL = Number(E.SCROLL || 260);
const DIM = Number(E.DIM ?? 0.3);

const s = await open({ hour: HOUR, keepUI: true });
// Interface : le téléphone et la mini-carte (lieu : « Écurie du Val ») ; boutons d'action contextuels, porte-monnaie et
// boutons du haut à droite masqués (ils passeraient sous le téléphone).
await s.page.addStyleTag({ content: '.hud .top-right, .hud .actions, #touch, .toast, .toasts { visibility: hidden !important; }' });
const info = await s.ev(([HOUR]) => {
  const g = window.__game, A = window.__auto, C = window.__cine, h = g.mainHorse, p = g.player;
  C.lockHour = HOUR;
  // Chevaux au box côté cour, tête passée par la fenêtre (comme la mission « Foin du matin »).
  const B = { x: -120, w: 50 }, boxX = (i) => B.x - B.w / 2 + 0.25 + 3.6 * (i + 0.5);
  for (const [i, coat] of [[2, 'grey'], [4, 'black'], [7, 'chestnut']]) {
    const hh = g.spawnHorse({ id: `teaser-box${i}`, coat, blaze: i % 2 === 0 }, boxX(i), 156.5 - 1.4, 0, { saddle: false });
    hh.frozen = true;
    hh.ai = null;
    hh.ambient = true;
  }
  // Comète en licol dans la cour, la cavalière la panse côté caméra.
  A.foot();
  h.ai = null;
  h.speed = 0;
  p.transport.travelTack(h, true);
  h.setPosition(-121, 165.5, Math.PI / 2);
  p.human.setPosition(-120.6, 167.2);
  A.tick(3);
  p.startGroom(h, 'brush', 60);
  A.tick(45);
  C.focus = { x: -120, y: 3, z: 166 };
  g.sky.update(g.hour(), C.focus, 0);
  g.sky.updateEnvironment?.(g.renderer, performance.now() / 1000, true);
  // Application Strides : prénom de la cavalière, tutoriel fait (les demandes ponctuelles des clients arrivent),
  // quelques missions déjà réalisées (montants fictifs du jeu).
  const d = g.save.data;
  d.playerName = 'Margaux';
  if (!d.completed.includes('tuto')) d.completed.push('tuto');
  d.stats.jobs = Math.max(d.stats.jobs, 12);
  d.stats.earned = Math.max(d.stats.earned, 1340);
  // Trois demandes ponctuelles d'intitulés différents (tirage du jeu ; un doublon est retiré et remplacé).
  for (let k = 0; k < 30; k++) {
    g.missions.refreshOffers(false);
    const seen = new Set();
    for (const o of [...g.missions.offers]) {
      if (seen.has(o.title)) g.missions.offers.splice(g.missions.offers.indexOf(o), 1);
      seen.add(o.title);
    }
    if (g.missions.offers.filter((o) => o.id.startsWith('job:')).length >= 3) break;
  }
  g.missions.timer = 1e6;
  // Téléphone : application Strides, onglet des demandes (mention « version jeu » déjà validée : pas de feuille).
  d.flags.stridesNotice = true;
  g.hud.notifQueue && (g.hud.notifQueue.length = 0);
  g.hud.notifEl?.classList.add('hidden');
  g.hud.clearHint?.();
  g.phone.open('strides', { tab: 'missions' });
  const L = g.phone.layer, ph = g.phone.phone;
  L.style.transition = 'none';
  ph.style.transition = 'none';
  const body = g.phone.screen.querySelector('.app-body');
  const offers = g.missions.offers.map((o) => `${o.vertical}${o.locked ? '(verrou)' : ''} · ${o.title}`);
  return { offers, scrollMax: body ? body.scrollHeight - body.clientHeight : null, groom: !!p.groom, mode: p.mode };
}, [HOUR]);
console.log(JSON.stringify(info));
await s.ev(([P, SCROLL, DIM]) => { window.__P = { P, SCROLL, DIM }; }, [P, SCROLL, DIM]);

await shoot(s, NAME, N, (i, n) => {
  const C = window.__cine, g = window.__game, { P, SCROLL, DIM } = window.__P;
  // Simulation vivante derrière le téléphone (le jeu la suspend quand le téléphone est ouvert) : pansage, crins, oreilles.
  const was = g.phone.isOpen;
  g.phone.isOpen = false;
  C.advance();
  g.phone.isOpen = was;
  const gy = (x, z) => g.world.groundAt(x, z);
  const u = i / (n - 1), t = 0.55 * u + 0.45 * C.ease(u);
  const S = { x: -121, z: 165.5 };
  const e = C.mix3([S.x + P[0], P[1], S.z + P[2]], [S.x + P[3], P[4], S.z + P[5]], t);
  const tg = C.mix3([S.x + P[6], P[7], S.z + P[8]], [S.x + P[9], P[10], S.z + P[11]], t);
  e[1] += gy(e[0], e[2]);
  tg[1] += gy(tg[0], tg[2]);
  C.cam(e, tg, P[12]);
  // Téléphone : après un court temps sur la cour, il monte du bas de l'écran (0,6 s, freiné comme la transition du
  // jeu), opaque ; le voile sombre derrière lui apparaît en même temps.
  const k = Math.max(0, Math.min(1, (i - 3) / 14)), up = 1 - Math.pow(1 - k, 3);
  const L = g.phone.layer, ph = g.phone.phone;
  ph.style.transform = up >= 1 ? 'none' : `translateY(${((1 - up) * 105).toFixed(2)}%)`;
  L.style.opacity = '1';
  L.style.background = `rgba(10,10,9,${(DIM * C.ease(Math.min(1, k * 1.5))).toFixed(3)})`;
  // Défilement doux de la liste des demandes (de 1,2 s à 3,3 s).
  const b = g.phone.screen.querySelector('.app-body');
  if (b) {
    const v = Math.max(0, Math.min(1, (i - 28) / 50));
    b.scrollTop = Math.round(SCROLL * C.ease(v));
  }
  // Horloge du téléphone à l'heure du jeu.
  g.phone.updateClock?.(g.clockText());
});
await s.close();
