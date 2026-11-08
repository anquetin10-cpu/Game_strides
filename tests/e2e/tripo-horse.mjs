// Essai du cheval Tripo (public/real/horse_tripo.glb) dans le jeu, SANS remplacer le cheval actuel (mode développement,
// `?tripohorse` : essai pour la session seulement, réglages et sauvegarde inchangés ; seuls le cheval principal et celui
// du joueur prennent le modèle d'essai). Rendu logiciel SwiftShader, écran d'iPhone 13 en paysage émulé : pas un essai
// sur iPhone réel.
//  A. vues au repos réellement rendues par le jeu (profil gauche/droit, face, trois-quarts avant/arrière, tête), cheval
//     principal dessellé, dans la même pose pour les deux modèles : Tripo et procédural (classique, avec son licol) ;
//     état d'affichage de chacun (calques, sellerie) ; sabots au repos ;
//  B. allures montées (pas, trot, galop, grand galop) : allure ; sabots du Tripo sur ceux du cheval du jeu (près du sol :
//     point le plus bas au-dessus du sol sous chaque sabot ; en l'air : centre de la sole, repère du cheval) ; en appui
//     posé (sabot du jeu verrouillé, sans bascule en pince selon l'animation du jeu, à ±2 cm du sol), sabot du Tripo posé
//     comme lui et sans glisser ; sabots sous le sol ;
//  C. sauts sur la carrière d'échauffement du Pôle : Tripo vérifié à chaque image (appel, suspension, réception) ;
//  D. épreuve de CSO complète (Pôle International) jouée avec les commandes normales (cavalier automatique de
//     cso-rider.js, sans téléportation pendant la manche) ;
//  E. mesures : niveaux de détail (près, loin) et triangles rendus, appels de dessin, coût de la recopie de pose, taille
//     du fichier ; erreurs JavaScript.
// Filet du Tripo (TripoBridle, TripoReins) : masqué cheval non monté (A), affiché monté à toutes les allures avec le bout
// des rênes à 3 cm au plus des poings du cavalier (B), masqué au-delà du niveau de détail réduit (E).
// Sabots : point le plus bas de chaque sabot = sommets du bas du sabot (os du sabot, pose courante) au-dessus du sol de
// marche (h.groundAt, sols des carrières compris), pour le Tripo comme pour le cheval du jeu. Le Tripo est jugé sur ce
// qui dépend de lui, à la même image : pas enfoncé dans le sol au-delà du sabot du cheval du jeu (un enfoncement que
// celui-ci n'a pas en est un cas), posé comme lui quand celui-ci est posé ; les creux de l'animation du cheval du jeu
// elle-même sont relevés à part (information, pas un échec).
// Vidéos (15 images/s, image par image) : allures, sauts, épreuve. Sorties : tests/e2e/out/tripo-horse/.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/tripo-horse.mjs [--only=A,B,C,E] [--no-cso]
//   --only : sections jouées (toutes par défaut) ; --no-cso : sans D. Avec une partie des sections, seules leurs sorties
//   sont remplacées et rapport.json garde le dernier passage des autres.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/tripo-horse';
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const RUN = new Set((onlyArg ? onlyArg.slice(7) : 'A,B,C,D,E').toUpperCase().split(',').map((s) => s.trim()).filter((s) => s && 'ABCDE'.includes(s)));
if (process.argv.includes('--no-cso')) RUN.delete('D');
// --cso-sans-images : manche de CSO (D) jouée et mesurée sans les captures (environ 0,8 capture/s en rendu logiciel).
const CSO_SHOTS = !process.argv.includes('--cso-sans-images');
const SECS = [...RUN].sort().join('');
const FULL = SECS === 'ABCDE';
// Sabot du cheval du jeu « posé » : en appui sans bascule en pince selon l'animation du jeu, point le plus bas à ±2 cm
// du sol. Ces sabots-images sont jugés par l'appui (TOL.appuiHaut, appuiBas, glissements), les autres par le suivi en
// hauteur (TOL.contact, fondu, air) : chaque sabot-image relève d'une seule de ces parts.
const POSE = 0.02;
// Appui « en ligne droite » : cap du cheval tourné d'au plus 0,005 rad depuis le début de l'appui (0,05 cm de glissement
// au plus pour un sabot écarté de 10 cm).
const VIRAGE = 0.005;
// Seuils (mètres). Chacun vaut 1,5 à 2 fois environ le plus grand écart mesuré dans le jeu avec le TripoHorse actuel
// (passages du 3 novembre 2026, quatre ou cinq par section : repos et allures sur la piste en dévers de 21,5 %, sauts,
// manche de CSO ; maxima entre parenthèses ; « réplique » : mêmes mesures rejouées en Node sur la géométrie réelle, sur
// le plat, en dévers de 21,5 % et en virage à 0,3 et 0,6 rad/s). Chacun fait échouer au moins un des défauts simulés
// dans cette réplique (valeurs entre parenthèses) : seconde passe de l'IK retirée, contour du sabot du Tripo ou du jeu
// réduit au centre de la sole ou au seul point le plus bas, portée de l'épaule et de la hanche coupée, centres de sole
// recalés même près du sol (points les plus bas non recalés). Un dépassement dû au Tripo reste un échec.
const TOL = {
  // Enfoncement du Tripo au-delà de celui du sabot du jeu, à toute image (0,7 cm ; réplique 0,8 cm ; défauts simulés
  // 1,7 à 11 cm). Pas de borne absolue à part : là où le sabot du jeu est posé (à −POSE au plus), elle découlerait de
  // celle-ci ; ailleurs, les creux de l'animation du jeu (jusqu'à −16 cm à la réception) ne dépendent pas du Tripo.
  sousJeu: 0.012,
  // Suivi en hauteur hors appui posé : grandeur que la seconde passe de TripoHorse annule sur ses contours réduits des
  // deux sabots. Près du sol (w = 1), point le plus bas Tripo − jeu, mesuré ici sur tous les sommets du bas des sabots
  // (1,0 cm ; réplique 1,1 cm) : erreur des contours réduits, du sol pris sous le centre de chaque sole et de l'IK ;
  // défauts simulés 4,1 à 12 cm.
  contact: 0.015,
  // Fondu sol/air (1,2 cm ; réplique 1,3 cm ; défauts simulés 4,1 à 12 cm).
  fondu: 0.02,
  // En l'air (w = 0), centre de la sole, repère du cheval (1,7 cm, postérieur en soutien pendant la manche ; réplique
  // 1,1 cm ; portée coupée 3,1 cm, seconde passe retirée 7,8 cm).
  air: 0.025,
  // Avant/arrière du centre de la sole, à toute image (2,6 cm, manche ; réplique 1,15 cm ; seconde passe retirée
  // 8,2 cm).
  avant: 0.04,
  // Borne indépendante de la règle sol/air et des contours de TripoHorse : écart de hauteur des centres de sole à toute
  // image (4,5 cm : sabots de longueurs différentes en bascule ; réplique 4,9 cm ; seconde passe retirée 7,8 cm, point
  // le plus bas seul 8,1 cm, contour du sabot du Tripo ou du jeu réduit au centre de la sole 7,2 et 8,3 cm).
  centreSole: 0.068,
  // Appui posé : point le plus bas du Tripo − celui du sabot du jeu, au-dessus (+0,9 cm ; réplique +0,9 cm ; défauts
  // simulés +1,5 à +4,0 cm) et en dessous (−0,4 cm ; réplique −0,7 cm en virage serré au pas ; défauts simulés −1,1 à
  // −1,8 cm). Ces sabots-images ne relèvent pas du suivi en hauteur : seuils propres, indépendants de NEAR_GROUND.
  appuiHaut: 0.014,
  appuiBas: 0.008,
  // Glissement de la sole du Tripo pendant un appui posé, net de celui du sabot du jeu. En ligne droite (0,08 cm ;
  // réplique 0,08 cm ; seconde passe retirée 0,64 cm, portée coupée 1,6 cm). En virage (0,87 cm, manche) : l'écart
  // latéral propre au Tripo, ±10 cm, tourne avec le cheval autour du sabot du jeu verrouillé (réplique au galop de
  // concours 0,45 cm ; portée coupée 1,5 cm au galop de concours, 1,6 cm au galop ; au pas et au trot en virage serré,
  // 1,3 à 3,0 cm dès le TripoHorse actuel, cas que ce test ne joue pas). Une fois la rotation du cap déduite, tous
  // appuis (0,28 cm, manche ; réplique 0,40 cm au galop en virage ; seconde passe retirée 0,64 cm, portée coupée 1,2 à
  // 2,3 cm à toutes les allures en virage).
  glisse: 0.0015,
  glisseVirage: 0.013,
  glisseCap: 0.0055,
  // Bout des rênes du Tripo (os reinL / reinR recopiés de ceux du cheval du jeu, placés dans les poings) : écart au poing.
  reneMain: 0.03,
};
// Sorties propres à chaque section.
const OWN = { A: ['vues'], B: ['allures', 'allures.mp4'], C: ['sauts', 'sauts.mp4'], D: ['cso', 'cso.mp4'], E: [] };
let old = null;
if (!FULL && existsSync(`${OUT}/rapport.json`)) {
  try {
    old = JSON.parse(readFileSync(`${OUT}/rapport.json`, 'utf8'));
  } catch {
    old = null;
  }
}
if (FULL) rmSync(OUT, { recursive: true, force: true });
else for (const s of RUN) for (const d of OWN[s]) rmSync(`${OUT}/${d}`, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const s of RUN) for (const d of OWN[s]) if (!d.endsWith('.mp4')) mkdirSync(`${OUT}/${d}`, { recursive: true });
let fails = 0;
const results = [];
const infos = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok: !!ok, extra });
  if (!ok) fails++;
};
// Information (pas un échec) : relevée pour le rapport de livraison.
const info = (id, label, data) => {
  console.log(`ℹ ${id} ${label} — ${JSON.stringify(data)}`);
  infos.push({ id, label, data });
};
const cm = (x) => `${(x * 100).toFixed(1)} cm`;
const cm2 = (x) => `${(x * 100).toFixed(2)} cm`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${base}/?autostart&tripohorse`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 480000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await page.addScriptTag({ content: readFileSync('tests/e2e/cso-rider.js', 'utf8') });
await page.addStyleTag({ content: '.hud, #touch { visibility: hidden !important; }' });

// ---------- Mise en place ----------
const boot = await E(async ([TOL, POSE, VIRAGE]) => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 13 * 3600;
  g.sky.rain = 0; g.sky.wet = 0;
  g.realism.set('real');
  // Compteur d'images de simulation ; appels et réceptions du cheval du joueur (phase d'une image : images depuis la
  // dernière réception).
  const t = A.tick;
  window.__n = 0; window.__landN = -1e9; window.__jumpN = -1e9;
  A.tick = (n = 1) => { for (let i = 0; i < n; i++) { window.__n++; t(1); g.realism.update(); } };
  g.bus.on('horse:land', (hh) => { if (hh === g.player.horse) window.__landN = window.__n; });
  g.bus.on('horse:jump', (hh) => { if (hh === g.player.horse) window.__jumpN = window.__n; });
  // Rendu d'une image (sync : pose recopiée sur le modèle affiché avant le rendu).
  window.__render = (sync = true) => { g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky); if (sync) g.realism.update(); g.renderer.render(g.scene, g.camera); };
  const V = g.camera.position.constructor, M4 = g.camera.matrixWorld.constructor;
  window.__hoofW = (await import('/src/entities/horse/anim.js')).hoofWorldPosition;
  const { horseAssets } = await import('/src/entities/horse/assets.js');
  const { MODEL_SCALE } = await import('/src/entities/horse/skeleton.js');
  window.__horseMesh = await import('/src/entities/horse/mesh.js');
  // Bornes du fondu sol/air de la seconde passe de TripoHorse (lues dans le module du jeu, pas recopiées).
  const NG = (window.__NG = [...(await import('/src/entities/tripoHorse.js')).NEAR_GROUND]);
  const HN = ['flH', 'frH', 'hlH', 'hrH'];
  const comp = (a, k, c) => (c === 0 ? a.getX(k) : c === 1 ? a.getY(k) : c === 2 ? a.getZ(k) : a.getW(k));
  // Sommets du bas de chaque sabot (pose de liaison) : liés à l'os du sabot (poids ≥ 0,5), à moins de `band` du dessous
  // (unités du maillage) ; range : plage d'indices du niveau de détail mesuré.
  const soleSet = (mesh, band, range) => {
    const geo = mesh.geometry, P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    let ids;
    if (range) {
      const s = new Set();
      for (let k = range[0]; k < range[0] + range[1]; k++) s.add(geo.index.getX(k));
      ids = [...s];
    } else ids = [...Array(P.count).keys()];
    return HN.map((n) => {
      const bi = mesh.skeleton.bones.findIndex((b) => b.name === n);
      const vs = [];
      for (const k of ids) {
        let w = 0;
        for (let c = 0; c < 4; c++) if (comp(SI, k, c) === bi) w += comp(SW, k, c);
        if (w >= 0.5) vs.push({ p: new V().fromBufferAttribute(P, k).applyMatrix4(mesh.bindMatrix), b: [0, 1, 2, 3].map((c) => comp(SI, k, c)), w: [0, 1, 2, 3].map((c) => comp(SW, k, c)) });
      }
      const y0 = Math.min(...vs.map((v) => v.p.y));
      return vs.filter((v) => v.p.y < y0 + band);
    });
  };
  const _p = new V(), _q = new V(), _mats = new Map(), _pool = [];
  // Point le plus bas d'un ensemble de sommets (pose courante, peau du maillage), au-dessus du sol de marche du cheval.
  const lowest = (h, mesh, set) => {
    const B = mesh.skeleton.bones, I = mesh.skeleton.boneInverses;
    _mats.clear();
    let best = 1e9, used = 0;
    for (const v of set) {
      _p.set(0, 0, 0);
      for (let c = 0; c < 4; c++) {
        const w = v.w[c];
        if (!w) continue;
        let m = _mats.get(v.b[c]);
        if (!m) _mats.set(v.b[c], (m = (_pool[used++] ||= new M4()).multiplyMatrices(B[v.b[c]].matrixWorld, I[v.b[c]])));
        _p.addScaledVector(_q.copy(v.p).applyMatrix4(m), w);
      }
      const y = _p.y - h.groundAt(_p.x, _p.z);
      if (y < best) best = y;
    }
    return best;
  };
  // Sabots du Tripo et du cheval du jeu, à cette image :
  //  t / p : point le plus bas du sabot (Tripo / cheval du jeu) au-dessus du sol de marche ;
  //  ps : centre de la sole du cheval du jeu (point d'appui de l'animation) au-dessus du sol ;
  //  w : part « près du sol » (1 quand le sabot du jeu est à moins de NEAR_GROUND[0] du sol, 0 au-delà de
  //  NEAR_GROUND[1], fondu entre les deux : règle de la seconde passe de TripoHorse) ;
  //  dh : suivi en hauteur, la grandeur que la seconde passe de TripoHorse annule. Près du sol (w = 1), t − p : hauteur
  //  du sabot du Tripo au-dessus du sol sous lui − celle du sabot du jeu au-dessus du sol sous lui (points les plus bas :
  //  les sabots n'ont ni la même longueur ni les mêmes aplombs, le sol sous eux diffère en dévers) ; TripoHorse annule
  //  cet écart sur des contours réduits des deux sabots, le test le mesure sur tous les sommets du bas des sabots en
  //  pose courante (erreur des contours, du sol pris sous le centre de chaque sole et de l'IK). En l'air (w = 0), dy :
  //  écart des centres de sole en hauteur (portée de l'IK, sans contour) ;
  //  dy / dz : centre de la sole du Tripo − centre de la sole du cheval du jeu, repère du cheval (hauteur,
  //  avant/arrière) ; dy à toute image est la borne indépendante de la règle sol/air ; dx : écart latéral (aplombs
  //  propres au modèle, non recalés) ; gx : sol sous la sole du Tripo − sol sous celle du jeu ;
  //  st : en appui selon l'animation du jeu (hors saut : sabot verrouillé au sol, pas de pas de recentrage, sans bascule
  //  en pince : |pitch| de l'animation < 0,05) ;
  //  bascule : sabot verrouillé de même, talons levés, tournant autour de la pince (pitch ≤ −0,05 : fin d'appui,
  //  postérieur au repos) ;
  //  pose : en appui et sabot du cheval du jeu réellement posé (point le plus bas à ±POSE du sol ; au début de l'appui,
  //  l'animation amortit encore le membre et le sabot verrouillé peut être plus haut). Ces sabots-images sont jugés par
  //  l'appui (Tripo − jeu, glissement), les autres par les parts du suivi en hauteur.
  window.__soles = (h) => {
    const R = g.realism.horses.get(h);
    if (!R?.soleWorld || !R.lods?.[0]) return null;
    h.mesh.updateMatrixWorld(true);
    const ts = (R.__sole ||= soleSet(R.lods[0], 0.05));
    const ps = (h.__sole ||= soleSet(h.mesh, 0.05 * MODEL_SCALE, horseAssets().body.lod[0]));
    const up = new V(0, 1, 0).transformDirection(h.mesh.matrixWorld), fw = new V(0, 0, 1).transformDirection(h.mesh.matrixWorld), sd = new V(1, 0, 0).transformDirection(h.mesh.matrixWorld);
    const legs = h.anim._a?.legs;
    return HN.map((n, i) => {
      const a = R.soleWorld(i, new V()), b = window.__hoofW(h.bones, i, new V());
      const d = a.clone().sub(b), S = legs?.[i];
      const p = lowest(h, h.mesh, ps[i]);
      const lock = !!S && h.jumpT < 0 && S.locked && S.swingT < 0, st = lock && Math.abs(S.pitch) < 0.05, bas = lock && S.pitch <= -0.05;
      const t = lowest(h, R.lods[0], ts[i]);
      // Près du sol : hauteurs au-dessus du sol ; plus haut : centre de la sole (repère du cheval) ; fondu (smoothstep).
      const k = Math.min(1, Math.max(0, (p - NG[0]) / (NG[1] - NG[0]))), w = 1 - k * k * (3 - 2 * k);
      return {
        t,
        p,
        w,
        dh: w * (t - p) + (1 - w) * d.dot(up),
        ps: b.y - h.groundAt(b.x, b.z),
        dy: d.dot(up),
        dz: d.dot(fw),
        dx: d.dot(sd),
        gx: h.groundAt(a.x, a.z) - h.groundAt(b.x, b.z),
        x: a.x, z: a.z, px: b.x, pz: b.z, yaw: h.heading,
        st,
        pose: st && Math.abs(p) <= POSE,
        bascule: bas,
      };
    });
  };
  // Phase d'une image (cheval du joueur).
  window.__ctx = (h) => {
    const since = window.__n - window.__landN, up = window.__n - window.__jumpN;
    return { n: window.__n, jt: +h.jumpT.toFixed(2), sp: +h.speed.toFixed(1), allure: h.anim._a?.gait, depuisReception: since < 1e6 ? since : null, depuisAppel: up < 1e6 ? up : null };
  };
  // Bilan des sabots sur une suite d'images.
  window.__stats = () => {
    // Arrondis : au millimètre pour les relevés d'une image, au dixième de millimètre pour les valeurs comparées aux seuils.
    const f3 = (x) => +x.toFixed(3), f4 = (x) => +x.toFixed(4);
    const r = {
      images: 0,
      // Suivi en hauteur par part, hors appui posé (près du sol, fondu, en l'air : sabots-images et écart le plus grand),
      // avant/arrière et borne indépendante (centres de sole en hauteur), à toute image.
      suivi: { sol: 0, fondu: 0, air: 0, dz: 0, centreSole: 0, images: { sol: 0, fondu: 0, air: 0 }, ouSol: null, ouFondu: null, ouAir: null, ouZ: null, ouCentre: null },
      appui: { n: 0, poses: 0, haut: -9, bas: 9, ouHaut: null, ouBas: null, solMin: 9, solMax: -9, jeuMax: -9, jeuOu: null },
      // Bascule sur la pince (fin d'appui, talons levés) : suivi en hauteur relevé à part (déjà soumis à la règle de sa
      // part : le sabot du jeu y est le plus souvent déjà levé de 4 à 17 cm).
      bascule: { n: 0, sol: 0, dh: 0, ou: null },
      // Glissement net : en ligne droite (cap du cheval tourné de moins de VIRAGE depuis le début de l'appui) et en
      // virage (relevé à part : voir TOL.glisseVirage).
      glisse: { max: 0, virage: 0, cap: 0, lacet: 0, tripo: 0, jeu: 0, appuis: 0, ou: null, ouVirage: null, ouCap: null },
      sousJeu: { min: 9, ou: null },
      jeuMin: { min: 9, ou: null, sous3cm: 0, pires: [], depuisReception: {} },
      tripoMin: 9,
    };
    const run = [null, null, null, null];
    return {
      r,
      cut() { run.fill(null); },
      add(s, c) {
        if (!s) return;
        r.images++;
        s.forEach((q, i) => {
          const at = (x = {}) => ({ ...c, sabot: i, tripo: f3(q.t), jeu: f3(q.p), appui: q.st, w: f3(q.w), dh: f3(q.dh), dy: f3(q.dy), dz: f3(q.dz), lateral: f3(q.dx), solTripoMoinsJeu: f3(q.gx), ...x });
          // Part du suivi en hauteur (aucune pour un sabot posé : jugé par l'appui ci-dessous).
          const U = r.suivi, part = q.pose ? null : q.w === 1 ? 'sol' : q.w === 0 ? 'air' : 'fondu';
          if (part) {
            const ou = { sol: 'ouSol', fondu: 'ouFondu', air: 'ouAir' }[part];
            U.images[part]++;
            if (Math.abs(q.dh) > U[part]) { U[part] = Math.abs(q.dh); U[ou] = at(); }
          }
          if (Math.abs(q.dy) > U.centreSole) { U.centreSole = Math.abs(q.dy); U.ouCentre = at(); }
          if (Math.abs(q.dz) > U.dz) { U.dz = Math.abs(q.dz); U.ouZ = at(); }
          if (q.bascule) {
            const B = r.bascule;
            B.n++;
            if (q.w === 1) B.sol++;
            if (Math.abs(q.dh) > B.dh) { B.dh = Math.abs(q.dh); B.ou = at(); }
          }
          if (q.st) {
            r.appui.n++;
            // Sabot du cheval du jeu posé : celui du Tripo doit l'être aussi (ni au-dessus, ni dans le sol).
            if (q.pose) {
              const e = q.t - q.p;
              r.appui.poses++;
              if (e > r.appui.haut) { r.appui.haut = e; r.appui.ouHaut = at(); }
              if (e < r.appui.bas) { r.appui.bas = e; r.appui.ouBas = at(); }
              r.appui.solMin = Math.min(r.appui.solMin, q.t);
              r.appui.solMax = Math.max(r.appui.solMax, q.t);
            }
            // Cheval du jeu lui-même au-dessus du sol pendant l'appui (information).
            if (q.p > r.appui.jeuMax) { r.appui.jeuMax = q.p; r.appui.jeuOu = at({ centreSole: f3(q.ps) }); }
            // Glissement pendant l'appui, sabot du cheval du jeu posé : déplacement horizontal de la sole du Tripo depuis
            // le début de l'appui, net de celui de la sole du cheval du jeu (ce qui dépend du Tripo : la sole du jeu bouge
            // elle-même un peu pendant l'appui) ; glissements propres de chacune relevés aussi. En ligne droite et en
            // virage séparément : quand le cheval tourne pendant l'appui, l'écart latéral propre au Tripo (aplombs,
            // ±10 cm) tourne avec lui autour du sabot du jeu verrouillé ; le glissement net est aussi mesuré une fois la
            // rotation du cap déduite (tous appuis, virages compris).
            const o = run[i], G = r.glisse;
            if (!q.pose) run[i] = null;
            else if (!o) {
              run[i] = { x: q.x, z: q.z, px: q.px, pz: q.pz, yaw: q.yaw };
              G.appuis++;
            } else {
              // Écart horizontal sole du Tripo − sole du jeu au début de l'appui (a) et à cette image (b) ; glissement net
              // d = |b − a| (repère monde) ; dc : le même, a tourné du cap pris depuis le début de l'appui (repère du
              // cheval : ôte la rotation de l'écart latéral propre au Tripo autour du sabot du jeu).
              const ax = o.x - o.px, az = o.z - o.pz, bx = q.x - q.px, bz = q.z - q.pz;
              const d = Math.hypot(bx - ax, bz - az);
              const dl = Math.atan2(Math.sin(q.yaw - o.yaw), Math.cos(q.yaw - o.yaw)), co = Math.cos(dl), si = Math.sin(dl);
              const dc = Math.hypot(bx - (ax * co + az * si), bz - (az * co - ax * si));
              const dt = Math.hypot(q.x - o.x, q.z - o.z), dp = Math.hypot(q.px - o.px, q.pz - o.pz);
              const lacet = Math.abs(dl);
              G.lacet = Math.max(G.lacet, lacet);
              const x = at({ glisseNet: f3(d), glisseCap: f3(dc), glisseTripo: f3(dt), glisseJeu: f3(dp), lacet: f3(lacet) });
              if (lacet <= VIRAGE) { if (d > G.max) { G.max = d; G.ou = x; } }
              else if (d > G.virage) { G.virage = d; G.ouVirage = x; }
              if (dc > G.cap) { G.cap = dc; G.ouCap = x; }
              G.tripo = Math.max(G.tripo, dt);
              G.jeu = Math.max(G.jeu, dp);
            }
          } else run[i] = null;
          // Enfoncement du Tripo au-delà de celui du cheval du jeu (au-dessus du sol, les deux sabots n'ont pas la même
          // forme : sans objet ; un enfoncement que le sabot du jeu n'a pas en est un cas).
          const ex = Math.min(0, q.t) - Math.min(0, q.p);
          if (ex < r.sousJeu.min) { r.sousJeu.min = ex; r.sousJeu.ou = at(); }
          if (q.p < r.jeuMin.min) { r.jeuMin.min = q.p; r.jeuMin.ou = at({ centreSole: f3(q.ps) }); }
          if (q.p < -0.03) {
            const J = r.jeuMin;
            J.sous3cm++;
            const k = c.depuisReception == null ? 'aucune' : c.depuisReception <= 5 ? '0-5' : c.depuisReception <= 15 ? '6-15' : c.depuisReception <= 30 ? '16-30' : '>30';
            J.depuisReception[k] = (J.depuisReception[k] || 0) + 1;
            J.pires.push(at({ centreSole: f3(q.ps) }));
            J.pires.sort((a, b) => a.jeu - b.jeu);
            if (J.pires.length > 10) J.pires.length = 10;
          }
          r.tripoMin = Math.min(r.tripoMin, q.t);
        });
      },
      result() {
        const o = JSON.parse(JSON.stringify(r));
        for (const k of ['sol', 'fondu', 'air', 'dz', 'centreSole']) o.suivi[k] = f4(o.suivi[k]);
        for (const k of ['haut', 'bas', 'solMin', 'solMax', 'jeuMax']) o.appui[k] = f4(o.appui[k]);
        o.bascule.dh = f4(o.bascule.dh);
        for (const k of ['max', 'virage', 'cap', 'tripo', 'jeu']) o.glisse[k] = +o.glisse[k].toFixed(5);
        o.glisse.lacet = f4(o.glisse.lacet);
        o.sousJeu.min = f4(o.sousJeu.min);
        o.jeuMin.min = f4(o.jeuMin.min);
        o.tripoMin = f4(o.tripoMin);
        return o;
      },
    };
  };
  // Filet et rênes du Tripo : maillages (TripoBridle, TripoReins) affichés ou non ; bout de chaque rêne = centre des
  // sommets liés à 100 % à l'os reinL / reinR (pose courante, peau du maillage) ; écart aux poings du cavalier (positions
  // du jeu, celles que game.js donne aux rênes).
  window.__filet = (h) => {
    const R = g.realism.horses.get(h), M = R?.bridle || [];
    const ends = {};
    for (const m of M) {
      if (!m.visible) continue;
      const G = m.geometry, P = G.attributes.position, SI = G.attributes.skinIndex, SW = G.attributes.skinWeight, B = m.skeleton.bones;
      m.updateMatrixWorld(true);
      for (const n of ['reinL', 'reinR']) {
        const bi = B.findIndex((b) => b.name === n);
        const ids = ((m.__bouts ||= {})[n] ||= [...Array(P.count).keys()].filter((k) => [0, 1, 2, 3].reduce((w, c) => w + (comp(SI, k, c) === bi ? comp(SW, k, c) : 0), 0) >= 0.999));
        if (!ids.length) continue;
        const a = new V();
        for (const k of ids) a.add(m.applyBoneTransform(k, new V().fromBufferAttribute(P, k)).applyMatrix4(m.matrixWorld));
        ends[n] = a.divideScalar(ids.length);
      }
    }
    const rider = h.rider;
    let dL = null, dR = null;
    if (rider?.getHandWorldPositions && ends.reinL && ends.reinR) {
      const [hl, hr] = rider.getHandWorldPositions(new V(), new V());
      dL = ends.reinL.distanceTo(hl);
      dR = ends.reinR.distanceTo(hr);
    }
    // Nom du nœud du GLB (une primitive par matériau : maillages « TripoBridle_1 », « TripoBridle_2 » sous « TripoBridle »).
    const node = (m) => (/^Tripo(Bridle|Reins)/.exec(m.name) || /^Tripo(Bridle|Reins)/.exec(m.parent?.name || '') || [m.name])[0];
    return { n: M.length, noms: [...new Set(M.map(node))], shown: M.map((m) => m.visible), monte: !!rider, dL, dR };
  };
  // Caméra placée dans le repère du cheval (côté, hauteur, avant), visée (hauteur, avant) ; hauteurs comptées depuis la
  // hauteur réelle du cheval (sol de marche, saut compris).
  window.__cam = (h, s, u, f, ly, lf = 0) => {
    const L = { x: Math.cos(h.heading), z: -Math.sin(h.heading) }, F = h.forward;
    const y = h.pos.y;
    g.camera.position.set(h.pos.x + L.x * s + F.x * f, y + u, h.pos.z + L.z * s + F.z * f);
    g.camera.lookAt(h.pos.x + F.x * lf, y + ly, h.pos.z + F.z * lf);
    g.camera.fov = window.__fov || g.camera.fov;
    g.camera.updateProjectionMatrix();
    g.camera.updateMatrixWorld();
  };
  // État d'affichage d'un cheval : modèle, calques, sellerie du cheval du jeu, licol et selle du modèle réaliste.
  window.__display = (h) => {
    const R = g.realism.horses.get(h), ud = h.mesh.userData, tack = ud.tack;
    const own = new Set([h.mesh, ...(ud.parts || [])]);
    const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
    let autres = 0;
    h.mesh.traverse((o) => { if (o.isMesh && !own.has(o) && shown(o)) autres++; });
    return {
      cls: R?.constructor?.name || 'classique',
      actif: R ? !!R.active : null,
      racine: R ? R.root.visible && R.root.parent === h.mesh : null,
      calque: h.mesh.layers.mask,
      calquesParties: [...new Set((ud.parts || []).filter((p) => p !== tack).map((p) => p.layers.mask))],
      sellerie: tack ? { calque: tack.layers.mask, visible: tack.visible, n: tack.geometry.index?.count || 0, licol: horseAssets().tack.ranges.halter[1], selle: !!tack.userData.cfg.saddle } : null,
      licolReel: R?.halter ? R.halter.visible : null,
      selleReelle: R?.parts ? Object.entries(R.parts).some(([k, p]) => /Saddle1|Bridle/.test(k) && p.visible) : null,
      lods: R?.lods ? R.lods.map((l) => l.visible) : null,
      hoofAt: !!h.hoofAt,
      autres,
      // Cheval WildMesh (pjlHorse.js) qui remplace l'affichage du cheval du jeu quand il n'a pas de modèle propre.
      pjl: h.pjl ? { actif: !!h.pjl.active, racine: h.pjl.holder.visible && h.pjl.holder.parent === h.mesh, selle: h.pjl.view.tackMeshes.some((m) => /saddle|pad|girth/.test(m.name) && m.visible), filet: h.pjl.view.tackMeshes.some((m) => /bridle|bit/.test(m.name) && m.visible) } : null,
    };
  };
  const h = g.mainHorse;
  A.mount();
  h.setPosition(140, 200, 0); h.ai = null;
  for (let i = 0; i < 300 && !g.realism.horses.get(h)?.lods; i++) { A.tick(1); await new Promise((r) => setTimeout(r, 40)); }
  const R = g.realism.horses.get(h);
  const tris = (o) => { let n = 0; o?.traverse((m) => { if (m.isMesh && m.visible) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
  // Modèle d'essai : seulement sur le cheval principal et celui du joueur.
  const others = [...g.realism.horses].filter(([hh, r]) => r.constructor === g.realism.trial?.cls && hh !== g.mainHorse && hh !== g.player.horse).length;
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) window.__soles(h);
  const solesMs = (performance.now() - t0) / 20;
  return {
    cls: R?.constructor?.name, trial: g.realism.trial ? { id: g.realism.trial.id, cls: !!g.realism.trial.cls, failed: g.realism.trial.failed } : null,
    lods: R?.lods?.map((m) => m.geometry.index.count / 3), bones: Object.keys(R?.bones || {}).length, layer: h.mesh.layers.mask, tris0: tris(R?.lods?.[0]),
    others,
    soleVerts: { tripo: R.__sole?.map((s) => s.length), jeu: h.__sole?.map((s) => s.length) }, solesMs: +solesMs.toFixed(2),
    nearGround: NG,
  };
}, [TOL, POSE, VIRAGE]);
check('A0', 'cheval Tripo chargé (essai de session) et piloté par le cheval du jeu (TripoHorse, 50 os, 2 niveaux de détail)', boot.cls === 'TripoHorse' && boot.trial?.id === 'horse_tripo' && boot.trial.cls && !boot.trial.failed && boot.bones === 50 && boot.lods?.length === 2, JSON.stringify(boot));
check('A1', 'rien n’est remplacé : cheval du jeu masqué mais animé, aucun autre cheval en Tripo', boot.layer === 2 ** 31 && boot.others === 0, `calque ${boot.layer}, autres ${boot.others}`);

// Bilan d'une suite d'images de sabots : checks communs aux sections A (repos), B, C et D.
const NG = boot.nearGround;
// Suivi en hauteur, hors appui posé : près du sol et en l'air, grandeur que la seconde passe de TripoHorse annule (sa
// propre cible ; près du sol, le test la mesure sur tous les sommets du bas des sabots) ; l'écart des centres de sole en
// hauteur à toute image n'utilise ni ses contours ni sa règle sol/air (borne indépendante).
const suiviOk = (s) => s.suivi.sol <= TOL.contact && s.suivi.fondu <= TOL.fondu && s.suivi.air <= TOL.air && s.suivi.dz <= TOL.avant && s.suivi.centreSole <= TOL.centreSole;
const suiviLbl = () => `sabot du Tripo sur celui du cheval du jeu : en hauteur, hors appui posé, grandeur que la seconde passe de TripoHorse annule (près du sol, sabot du jeu à moins de ${cm(NG[0])} : point le plus bas de tous les sommets du bas de chaque sabot au-dessus du sol sous lui, Tripo − jeu, ≤ ${cm(TOL.contact)} ; en l'air, au-delà de ${cm(NG[1])} : centre de la sole, repère du cheval, ≤ ${cm(TOL.air)} ; fondu entre les deux ≤ ${cm(TOL.fondu)}) ; à toute image, centre de la sole en avant/arrière ≤ ${cm(TOL.avant)} et, borne indépendante de cette règle, écart de hauteur des centres de sole ≤ ${cm(TOL.centreSole)}`;
const suiviTxt = (s) => `hors appui posé : près du sol ${cm2(s.suivi.sol)} (${s.suivi.images.sol} sabots-images), fondu ${cm2(s.suivi.fondu)} (${s.suivi.images.fondu}), en l'air ${cm2(s.suivi.air)} (${s.suivi.images.air}) ; bascule sur la pince (information, toutes parts) ${cm2(s.bascule.dh)} (${s.bascule.n} sabots-images, dont ${s.bascule.sol} près du sol) ; à toute image : avant/arrière ${cm2(s.suivi.dz)}, écart de hauteur des centres de sole ${cm2(s.suivi.centreSole)}`;
// Appui posé (sabots-images que le suivi en hauteur ne juge pas) : sabot du Tripo posé comme celui du jeu ; glissement
// net en ligne droite, en virage et une fois la rotation du cap déduite.
const appuiOk = (s) => s.appui.poses > 0 && s.appui.haut <= TOL.appuiHaut && s.appui.bas >= -TOL.appuiBas && s.glisse.max <= TOL.glisse && s.glisse.virage <= TOL.glisseVirage && s.glisse.cap <= TOL.glisseCap;
const appuiLbl = () => `en appui posé (sabot du jeu verrouillé, sans bascule en pince selon l'animation du jeu, point le plus bas à ±${cm(POSE)} du sol), sabot du Tripo posé comme lui (point le plus bas au-dessus du sol, Tripo − jeu, entre −${cm(TOL.appuiBas)} et +${cm(TOL.appuiHaut)}) et sans glisser par rapport à lui (glissement net ≤ ${cm2(TOL.glisse)} en ligne droite, ≤ ${cm(TOL.glisseVirage)} en virage, ≤ ${cm2(TOL.glisseCap)} une fois la rotation du cap déduite)`;
const appuiTxt = (s) => `${s.appui.n} appuis-images sans bascule en pince, dont ${s.appui.poses} posés : Tripo − jeu ${s.appui.poses ? `${cm2(s.appui.bas)} … ${cm2(s.appui.haut)}` : '—'} (information : point le plus bas du Tripo à ${s.appui.poses ? `${cm2(s.appui.solMin)} … ${cm2(s.appui.solMax)}` : '—'} du sol) ; glissement net ${cm2(s.glisse.max)} en ligne droite, ${cm2(s.glisse.virage)} en virage (cap tourné jusqu'à ${s.glisse.lacet.toFixed(3)} rad pendant un appui), ${cm2(s.glisse.cap)} une fois la rotation du cap déduite, sur ${s.glisse.appuis} appuis (glissements propres : Tripo ${cm2(s.glisse.tripo)}, cheval du jeu ${cm2(s.glisse.jeu)})`;
const solLbl = () => `sabot du Tripo jamais enfoncé dans le sol de plus de ${cm(TOL.sousJeu)} au-delà de celui du cheval du jeu`;
const sousJeuOk = (s) => s.sousJeu.min >= -TOL.sousJeu;
const sousJeuTxt = (s) => `enfoncé au plus ${cm2(-s.sousJeu.min)} au-delà du sabot du jeu (information : point le plus bas jusqu'à ${cm(s.tripoMin)} du sol pour le Tripo, ${cm(s.jeuMin.min)} pour le cheval du jeu)`;
const jeuInfo = (s) => ({ min: s.jeuMin.min, ou: s.jeuMin.ou, imagesSous3cm: s.jeuMin.sous3cm, depuisReception: s.jeuMin.depuisReception, pires: s.jeuMin.pires.slice(0, 5), auDessusEnAppui: s.appui.jeuMax, auDessusOu: s.appui.jeuOu });

let vf = 0;
// Image de vidéo : caméra de profil (allures) ou cadrage du saut.
const frame = async (dir, view = [4.2, 1.5, 0.2, 1.15, 0.2]) => {
  await E((v) => { const h = window.__game.player.horse; window.__cam(h, ...v); window.__render(); }, view);
  await page.screenshot({ path: `${OUT}/${dir}/${String(vf++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 84 });
};
const video = (dir, crf = 22) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${OUT}/${dir}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(crf), '-movflags', '+faststart', `${OUT}/${dir}.mp4`]);
const shot = async (dir, name) => page.screenshot({ path: `${OUT}/${dir}/${name}.jpg`, type: 'jpeg', quality: 88 });

// ---------- A. Vues au repos (cheval principal dessellé), Tripo et cheval du jeu dans la même pose ----------
let vueRes = null, rest = null;
if (RUN.has('A')) {
  const VUES = { 'profil-gauche': [4.6, 1.5, 0.2, 1.15, 0.2], 'profil-droit': [-4.6, 1.5, 0.2, 1.15, 0.2], face: [0.0, 1.55, 4.8, 1.2, 0.3], 'trois-quarts-avant': [3.4, 1.7, 3.2, 1.15, 0.3], 'trois-quarts-arriere': [3.0, 1.8, -3.6, 1.1, -0.2], tete: [1.3, 1.85, 2.1, 1.75, 1.3] };
  // Modèle affiché sur le cheval principal : essai Tripo (session) ou procédural (cheval du jeu) ; renvoie l'état
  // d'affichage. (Le cheval réaliste, troisième modèle comparé auparavant, a été retiré du jeu.)
  const setModel = (m) => E(async (m) => {
    const g = window.__game, h = g.mainHorse, Rz = g.realism;
    if (m === 'tripo') { if (!Rz.trial) Rz.startTrial('horse_tripo'); }
    else Rz.stopTrial();
    const want = { tripo: 'TripoHorse', classique: 'classique' }[m];
    for (let i = 0; i < 300; i++) {
      window.__auto.tick(1);
      if ((Rz.horses.get(h)?.constructor?.name || 'classique') === want) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    window.__auto.tick(4);
    return window.__display(h);
  }, m);
  await E(() => {
    const g = window.__game, A = window.__auto, h = g.mainHorse;
    A.foot();
    h.setPosition(140, 215, 0); h.ai = null; h.speed = 0;
    // Cheval dessellé (licol seul), comme au transport : équipement d'origine remis après la section.
    window.__tackCfg = { ...h.mesh.userData.tack.userData.cfg };
    window.__horseMesh.setHorseTack(h.mesh, { saddle: false, mounted: false, boots: false });
    g.player.human.setPosition(132, 205, 0);
    A.tick(30);
  });
  await E(() => { window.__fov0 = window.__game.camera.fov; window.__fov = 30; });
  vueRes = {};
  for (const m of ['tripo', 'classique']) {
    const d = await setModel(m);
    // Même pose pour les deux modèles : pose du cheval du jeu relevée au premier modèle, remise avant chaque vue.
    const pose = await E((first) => {
      const g = window.__game, h = g.mainHorse;
      if (first) window.__pose = Object.values(h.bones).map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
      for (const [b, p, q, s] of window.__pose) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(s); }
      h.mesh.updateMatrixWorld(true);
      const V = g.camera.position.constructor;
      return [0, 1, 2, 3].map((i) => window.__hoofW(h.bones, i, new V()).toArray().map((x) => +x.toFixed(4))).concat([h.bones.head.getWorldPosition(new V()).toArray().map((x) => +x.toFixed(4))]);
    }, m === 'tripo');
    vueRes[m] = { ...d, pose };
    for (const [k, v] of Object.entries(VUES)) {
      await E(([v]) => {
        const h = window.__game.mainHorse;
        for (const [b, p, q, s] of window.__pose) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(s); }
        window.__cam(h, ...v);
        window.__render();
      }, [v]);
      await shot('vues', `${m}-${k}`);
    }
  }
  await E(() => { window.__fov = window.__fov0; });
  const D = vueRes, top = 2 ** 31;
  // Hors modèle propre, le cheval du jeu est affiché avec le cheval WildMesh (pjlHorse.js) s'il est chargé : cheval du
  // jeu masqué (corps, parties, sellerie), WildMesh seul affiché, attaché au cheval, sans selle ni filet (dessellé),
  // sabots du WildMesh. Sans WildMesh (repli) : cheval du jeu affiché avec son licol, comme avant.
  const okD = {
    tripo: (d) => d.cls === 'TripoHorse' && d.actif && d.racine && d.calque === top && d.calquesParties.every((x) => x === top) && d.sellerie.calque === 1 && !d.sellerie.visible && d.lods[0] && !d.lods[1] && d.hoofAt && d.autres > 0 && !d.pjl,
    classique: (d) =>
      d.cls === 'classique' &&
      (d.pjl
        ? d.pjl.actif && d.pjl.racine && !d.pjl.selle && !d.pjl.filet && d.calque === top && d.calquesParties.every((x) => x === top) && d.sellerie.calque === top && !d.sellerie.selle && d.hoofAt && d.autres > 0
        : d.calque === 1 && d.calquesParties.every((x) => x === 1) && d.sellerie.calque === 1 && d.sellerie.visible && !d.sellerie.selle && d.sellerie.n === d.sellerie.licol && !d.hoofAt && d.autres === 0),
  };
  const samePose = JSON.stringify(D.tripo.pose) === JSON.stringify(D.classique.pose);
  check('A2', 'vues au repos rendues dans la même pose pour le Tripo et le cheval du jeu (licol visible, ou cheval WildMesh seul affiché, dessellé) ; calques, sellerie et exclusivité de chaque modèle', okD.tripo(D.tripo) && okD.classique(D.classique) && samePose, JSON.stringify({ tripo: okD.tripo(D.tripo), classique: okD.classique(D.classique), memePose: samePose, etats: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, { ...v, pose: undefined }])) }));
  await setModel('tripo');
  // Repos : sabots du Tripo sur ceux du cheval du jeu (mêmes règles qu'aux allures, sur 30 images) ; sabots en appui posés
  // comme ceux du cheval du jeu.
  rest = await E(() => {
    const g = window.__game, h = g.mainHorse;
    window.__auto.tick(150);
    const S = window.__stats();
    for (let i = 0; i < 30; i++) { window.__auto.tick(1); S.add(window.__soles(h), window.__ctx(h)); }
    // Pente du sol sous le cheval (en travers, en long) : explique l'écart des sabots dont l'aplomb diffère.
    const L = { x: Math.cos(h.heading), z: -Math.sin(h.heading) }, F = h.forward, x = h.pos.x, z = h.pos.z;
    const pente = { travers: +((h.groundAt(x + L.x * 0.5, z + L.z * 0.5) - h.groundAt(x - L.x * 0.5, z - L.z * 0.5)) / 1).toFixed(3), long: +((h.groundAt(x + F.x, z + F.z) - h.groundAt(x - F.x, z - F.z)) / 2).toFixed(3) };
    const sabots = window.__soles(h).map((s) => ({ tripo: +s.t.toFixed(3), jeu: +s.p.toFixed(3), centreSole: +s.ps.toFixed(3), w: +s.w.toFixed(3), dh: +s.dh.toFixed(3), dy: +s.dy.toFixed(3), dz: +s.dz.toFixed(3), dx: +s.dx.toFixed(3), appui: s.pose, bascule: s.bascule }));
    return { pente, sabots, bilan: S.result() };
  });
  check('A3', `au repos, ${suiviLbl()} ; ${appuiLbl()}`, suiviOk(rest.bilan) && appuiOk(rest.bilan), `${suiviTxt(rest.bilan)} ; ${appuiTxt(rest.bilan)} ; pente ${JSON.stringify(rest.pente)} ; ${JSON.stringify(rest.sabots)}`);
  // Cheval non monté : filet et rênes du Tripo présents dans le modèle mais masqués.
  rest.filet = await E(() => window.__filet(window.__game.mainHorse));
  const F0 = rest.filet;
  check('A4', 'cheval non monté : filet et rênes du Tripo (TripoBridle, TripoReins) masqués', !F0.monte && F0.n >= 2 && F0.noms.includes('TripoBridle') && F0.noms.includes('TripoReins') && F0.shown.every((v) => !v), JSON.stringify(F0));
  // Équipement d'origine.
  await E(() => {
    const h = window.__game.mainHorse;
    window.__horseMesh.setHorseTack(h.mesh, window.__tackCfg);
    window.__auto.tick(2);
  });
}

// ---------- B. Allures montées ----------
const gaitRes = {};
if (RUN.has('B')) {
  vf = 0;
  await E(() => { const g = window.__game, A = window.__auto; A.mount(); const h = g.mainHorse; h.ai = null; h.setPosition(140, 200, 0); g.cam.yaw = Math.PI; A.tick(10); });
  const GAITS = [['pas', 0.3, false, 1], ['trot', 0.5, false, 2], ['galop', 0.95, false, 3], ['grand-galop', 1, true, 4]];
  for (const [name, mag, gallop, want] of GAITS) {
    const r = await E(([mag, gallop]) => {
      const g = window.__game, A = window.__auto, h = g.mainHorse;
      if (h.pos.z > 250) h.setPosition(140, 200, 0);
      // Endurance pleine (le grand galop est refusé à un cheval épuisé par les allures précédentes).
      h.stamina = h.maxStamina; h.exhausted = false;
      // Montée en vitesse : le grand galop n'est atteint qu'au-delà de ~10 m/s (≈ 80 pas de simulation depuis l'arrêt).
      for (let i = 0; i < (gallop ? 130 : 70); i++) { A.steer(0, 1, mag); if (gallop) g.input.held.add('gallop'); else g.input.held.delete('gallop'); A.tick(1); }
      window.__st = window.__stats();
      window.__fil = { images: 0, affiche: 0, max: 0, ou: null };
      window.__skip = 0;
      return { gait: h.gait, sp: +h.speed.toFixed(2), duty: +h.anim._a.duty.toFixed(2) };
    }, [mag, gallop]);
    // Mesure à chaque image de simulation, une image de vidéo toutes les deux.
    for (let k = 0; k < 45; k++) {
      await E(([mag, gallop]) => {
        const g = window.__game, A = window.__auto, h = g.mainHorse, S = window.__st;
        for (let i = 0; i < 2; i++) {
          // Bout de la piste : retour au départ (images suivantes écartées le temps que l'animation repose les sabots).
          if (h.pos.z > 290) { const sp = h.speed; h.setPosition(140, 200, 0); h.speed = sp; window.__skip = 4; }
          h.stamina = Math.max(h.stamina, h.maxStamina * 0.5);
          A.steer(0, 1, mag); if (gallop) g.input.held.add('gallop');
          A.tick(1);
          if (window.__skip > 0) { window.__skip--; S.cut(); continue; }
          S.add(window.__soles(h), window.__ctx(h));
          // Filet affiché, bouts des rênes dans les poings du cavalier.
          const f = window.__filet(h), Fi = window.__fil;
          Fi.images++;
          if (f.monte && f.n >= 2 && f.shown.every(Boolean)) Fi.affiche++;
          const d = Math.max(f.dL ?? 9, f.dR ?? 9);
          if (d > Fi.max) { Fi.max = d; Fi.ou = { ...window.__ctx(h), dL: f.dL == null ? null : +f.dL.toFixed(4), dR: f.dR == null ? null : +f.dR.toFixed(4) }; }
        }
      }, [mag, gallop]);
      await frame('allures');
    }
    const st = await E(() => { window.__game.input.held.delete('gallop'); return window.__st.result(); });
    const fil = await E(() => ({ ...window.__fil, max: +window.__fil.max.toFixed(4) }));
    gaitRes[name] = { ...r, ...st, filet: fil, partAppui: st.images ? +(st.appui.n / (4 * st.images)).toFixed(2) : 0 };
    check(`B-${name}`, `${name} : allure ${want}`, r.gait === want, `allure ${r.gait}, ${r.sp} m/s`);
    check(`B-${name}-suivi`, `${name} : ${suiviLbl()}`, suiviOk(st), suiviTxt(st));
    check(`B-${name}-appui`, `${name} : ${appuiLbl()}`, appuiOk(st), `${appuiTxt(st)} ; part d'appui ${gaitRes[name].partAppui} (service ${r.duty})`);
    check(`B-${name}-sol`, `${name} : ${solLbl()}`, sousJeuOk(st), sousJeuTxt(st));
    check(`B-${name}-filet`, `${name} : cheval monté, filet et rênes du Tripo affichés à chaque image ; bout de chaque rêne à ${cm(TOL.reneMain)} au plus du poing du cavalier`, fil.images > 0 && fil.affiche === fil.images && fil.max <= TOL.reneMain, `${fil.affiche}/${fil.images} images affichées ; écart rêne–poing max ${cm2(fil.max)} ${JSON.stringify(fil.ou)}`);
    info(`B-${name}-jeu`, `${name} : point le plus bas des sabots du cheval du jeu (animation procédurale)`, jeuInfo(st));
  }
  video('allures');
}

// ---------- C. Sauts (carrière d'échauffement du Pôle) ----------
let jev = null, jumpRes = null;
if (RUN.has('C')) {
  vf = 0;
  const jumps = await E(async () => {
    const g = window.__game, A = window.__auto;
    A.mount();
    const os = (g.obstacles.ofCourse?.('warmup') || g.obstacles.list.filter((o) => /warm|ech/i.test(o.course || ''))).slice(0, 3);
    const ev = [];
    g.bus.on('obstacle:clear', (e) => ev.push(`clear:${e.obstacle.label}`));
    g.bus.on('obstacle:fault', (e) => ev.push(`fault:${e.obstacle.label}`));
    g.bus.on('horse:jump', (hh) => { if (hh === g.player.horse) ev.push('jump'); });
    window.__jumpEv = ev;
    // Bilan par phase du saut ; modèle vérifié à chaque image.
    window.__jc = { images: 0, mauvaises: 0, premiere: null, phases: { appel: window.__stats(), suspension: window.__stats(), reception: window.__stats() }, tout: window.__stats() };
    return { n: os.length, labels: os.map((o) => o.label) };
  });
  for (let i = 0; i < jumps.n; i++) {
    // Approche de l'obstacle i (le pilote place le cheval 11 m avant, galop de concours), image par image.
    const ok = await E(async (i) => {
      const g = window.__game;
      const os = (g.obstacles.ofCourse?.('warmup') || []).slice(0, 3);
      const o = os[i];
      if (!o) return false;
      const h = g.player.horse;
      h.setPosition(o.x - o.n.x * 11, o.z - o.n.z * 11, o.rot);
      g.cam.yaw = o.rot + Math.PI;
      h.speed = 6.5 * h.speedMul;
      h.stamina = h.maxStamina;
      window.__jo = o;
      window.__jumped = false;
      window.__landN = -1e9;
      return true;
    }, i);
    if (!ok) continue;
    // Même appel que le pilote (autopilot.jumpObstacle) : au cœur de la bonne zone. Fin : 15 images après la réception.
    for (let k = 0; k < 140; k++) {
      const st = await E(() => {
        const g = window.__game, A = window.__auto, h = g.player.horse, o = window.__jo, C = window.__jc;
        h.ai = null;
        A.steer(o.n.x, o.n.z, 0.95);
        const tg = g.obstacles.target(h);
        if (!window.__jumped && tg && tg.o === o && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) {
          g.input.pressed.add('jump');
          window.__jumped = true;
        }
        A.tick(1);
        const jt = h.jumpT, since = window.__n - window.__landN;
        if (jt >= 0 || since <= 15) {
          // Tripo vérifié à chaque image du saut : toujours le modèle d'essai, actif, affiché, un seul niveau de détail.
          const R = g.realism.horses.get(h);
          C.images++;
          const good = R?.constructor?.name === 'TripoHorse' && R.active && R.root.visible && R.root.parent === h.mesh && h.mesh.layers.mask === 2 ** 31 && R.lods[0].visible !== R.lods[1].visible;
          if (!good) { C.mauvaises++; C.premiere ||= { ...window.__ctx(h), cls: R?.constructor?.name || null, actif: !!R?.active, visible: !!R?.root.visible }; }
          const s = window.__soles(h), c = window.__ctx(h);
          const ph = jt >= 0 ? (jt < 0.15 ? 'appel' : jt < 0.85 ? 'suspension' : 'reception') : 'reception';
          C.phases[ph].add(s, c);
          C.tout.add(s, c);
        }
        return { done: window.__jumped && jt < 0 && since >= 15 && since < 1e6 };
      });
      // Caméra de côté, visée à la hauteur réelle du cheval (saut compris), un peu plus loin pour garder le cavalier.
      if (k % 2 === 0) await frame('sauts', [5.2, 1.5, 0.6, 1.2, 0.4]);
      if (st.done) break;
    }
    await E(() => window.__auto.releaseInput());
  }
  const jc = await E(() => { const C = window.__jc; return { images: C.images, mauvaises: C.mauvaises, premiere: C.premiere, phases: Object.fromEntries(Object.entries(C.phases).map(([k, s]) => [k, s.result()])), tout: C.tout.result(), ev: window.__jumpEv }; });
  jev = jc.ev;
  jumpRes = { images: jc.images, mauvaises: jc.mauvaises, premiere: jc.premiere, phases: jc.phases, tout: jc.tout };
  const jumped = jev.filter((e) => e === 'jump').length, cleared = jev.filter((e) => e.startsWith('clear:')).length;
  check('C1', 'sauts du Tripo sur la carrière d’échauffement : au moins 2 sauts franchis ; à chaque image du saut (appel, suspension, réception), modèle Tripo actif et affiché', jumped >= 2 && cleared >= 2 && jc.mauvaises === 0 && jc.images >= jumped * 30, `${jumped} sauts, ${cleared} franchis, ${jc.images} images vérifiées, ${jc.mauvaises} en défaut${jc.premiere ? ` (${JSON.stringify(jc.premiere)})` : ''} ; ${JSON.stringify(jev)}`);
  const P = jc.phases;
  check('C2', `pendant les sauts (appel, suspension, réception), ${suiviLbl()}`, Object.values(P).every((s) => s.images > 0 && suiviOk(s)), Object.entries(P).map(([k, s]) => `${k} ${s.images} img : ${suiviTxt(s)}`).join(' | '));
  check('C3', `pendant les sauts, ${solLbl()}`, sousJeuOk(jc.tout), Object.entries(P).map(([k, s]) => `${k} : ${sousJeuTxt(s)}`).join(' ; '));
  info('C-jeu', 'sauts : point le plus bas des sabots du cheval du jeu (animation procédurale)', jeuInfo(jc.tout));
  video('sauts');
}

// ---------- D. Épreuve de CSO complète ----------
let cso = null;
if (RUN.has('D')) {
  vf = 0;
  await E(async () => {
    const g = window.__game, A = window.__auto;
    const O = await import('/src/gameplay/obstacles.js');
    const Cc = await import('/src/gameplay/csoCourse.js');
    const Si = await import('/src/world/sites.js');
    // Constantes de conduite de concours lues par le cavalier de test (comme tests/e2e/cso-athens.mjs).
    window.__CSO_RIDE = (await import('/src/gameplay/csoRide.js')).CSO_RIDE;
    A.mount();
    const h = g.player.horse;
    h.setPosition(O.CSO_GATE.x, O.CSO_GATE.z + 4, Math.PI);
    g.activities.start(g.activities.defs.find((a) => a.id === 'cso_train'));
    window.__setup = { line: O.CSO_LINE, start: O.CSO_START, lead: (Cc.CSO_TRACE.leadIn || []).map((p) => ({ x: Si.POLE.arena.x + p.x, z: Si.POLE.arena.z + p.z })) };
    A.tick(6);
    return true;
  });
  await E(() => window.__auto.tap(document.querySelector('.overlay [data-id="enter"]')));
  for (let i = 0; i < 400; i++) {
    const ready = await E(() => !!window.__game.course && window.__game.player.mode === 'ride' && !document.querySelector('.overlay'));
    if (ready) break;
    await E(() => window.__auto.tap(document.querySelector('.overlay [data-id="enter"], .overlay .btn.primary')));
    await E(() => window.__auto.tick(3));
  }
  await E(() => {
    const g = window.__game, h = g.player.horse;
    const M = (window.__m = { teleports: 0, jumps: 0, presses: 0, ev: [], tripo: 0, frames: 0, stats: window.__stats() });
    window.__landN = -1e9;
    const sp = h.setPosition.bind(h);
    h.setPosition = (...a) => { M.teleports++; return sp(...a); };
    const add = g.input.pressed.add.bind(g.input.pressed);
    g.input.pressed.add = (k) => { if (k === 'jump') M.presses++; return add(k); };
    for (const k of ['obstacle:clear', 'obstacle:fault', 'obstacle:refusal']) g.bus.on(k, (e) => M.ev.push(`${k.split(':')[1]}:${e.obstacle.label}`));
    g.bus.on('horse:jump', (hh) => { if (hh.isPlayerHorse) M.jumps++; });
    const S = window.__setup, hp = h.pos;
    let j0 = 0, bd = 1e9;
    S.lead.forEach((p, i) => { const d = (p.x - hp.x) ** 2 + (p.z - hp.z) ** 2; if (d < bd) { bd = d; j0 = i; } });
    window.__rider.init({ line: S.line, start: S.start, pre: 9, via: S.lead.slice(j0) });
  });
  for (let n = 0; n < 5200; n++) {
    const dec = await E(() => window.__rider.decide());
    if (dec.done) break;
    await E(([x, y, j]) => {
      const g = window.__game, M = window.__m, h = g.player.horse;
      g.input.setVirtualMove(x, y); if (j) g.input.pressed.add('jump');
      window.__auto.tick(1);
      const st = g.missions.active?.data?.course;
      if (st) window.__lastCourse = st;
      const R = g.realism.horses.get(h);
      if (R?.constructor?.name === 'TripoHorse' && R.active && R.root.visible) M.tripo++;
      M.frames++;
      // Toutes les images de la manche, sauts compris.
      M.stats.add(window.__soles(h), window.__ctx(h));
    }, [dec.x, dec.y, dec.jump]);
    if (n % 2 === 1 && CSO_SHOTS) {
      await E(() => window.__render());
      await page.screenshot({ path: `${OUT}/cso/${String(vf++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 82 });
    }
  }
  for (let i = 0; i < 30; i++) { await E(() => window.__auto.tick(2)); if (!CSO_SHOTS) continue; await E(() => window.__render()); await page.screenshot({ path: `${OUT}/cso/${String(vf++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 82 }); }
  cso = await E(() => { const M = window.__m, st = window.__lastCourse; return { st: st ? { t: st.t, faults: st.faults, refusals: st.refusals, finished: st.finished, eliminated: st.eliminated } : null, teleports: M.teleports, jumps: M.jumps, presses: M.presses, ev: M.ev, tripoFrames: M.tripo, frames: M.frames, sabots: M.stats.result() }; });
  const S = cso.sabots;
  check('D1', 'épreuve de CSO terminée avec le Tripo, sans élimination', cso.st?.finished && !cso.st?.eliminated, JSON.stringify(cso.st));
  check('D2', 'manche jouée avec le Tripo actif et affiché de bout en bout, sans téléportation', cso.tripoFrames === cso.frames && cso.frames > 0 && cso.teleports === 0, `${cso.tripoFrames}/${cso.frames} images, ${cso.teleports} téléportation`);
  check('D3', `pendant la manche (sauts compris), ${solLbl()}`, sousJeuOk(S), `${sousJeuTxt(S)} ; pire : ${JSON.stringify(S.sousJeu.ou)}`);
  check('D4', `pendant la manche (sauts compris), ${suiviLbl()} ; ${appuiLbl()}`, suiviOk(S) && appuiOk(S), `${suiviTxt(S)} ; ${appuiTxt(S)}`);
  info('D-jeu', 'manche : point le plus bas des sabots du cheval du jeu (animation procédurale ; images depuis la dernière réception)', jeuInfo(S));
  if (CSO_SHOTS) video('cso', 23);
}

// ---------- E. Mesures ----------
let perf = null, glbBytes = null;
if (RUN.has('E')) {
  perf = await E(async () => {
    const g = window.__game, h = g.player.horse;
    for (let i = 0; i < 300 && g.realism.horses.get(h)?.constructor?.name !== 'TripoHorse'; i++) { window.__auto.tick(1); await new Promise((r) => setTimeout(r, 40)); }
    const R = g.realism.horses.get(h);
    g.renderer.info.autoReset = false;
    // Rendu à une distance de côté donnée : niveau choisi par le jeu (auto), niveau forcé (0, 1) ou cheval du jeu seul.
    const meas = (d, mode) => {
      R.setActive(mode !== 'off');
      window.__cam(h, d, 1.5, 0.2, 1.15, 0.2);
      g.realism.update();
      if (mode === 0 || mode === 1) { R.lods[0].visible = mode === 0; R.lods[1].visible = mode === 1; }
      const lod = R.lods.map((l) => l.visible);
      // Triangles du cheval à l'écran d'après la scène (maillages affichés et vus par la caméra, plage dessinée).
      let geo = 0;
      const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
      h.mesh.traverse((m) => {
        if (!m.isMesh || !shown(m) || !m.layers.test(g.camera.layers)) return;
        const G = m.geometry, n = G.index ? G.index.count : G.attributes.position.count, dr = G.drawRange;
        geo += Math.max(0, Math.min(n, dr.start + dr.count) - dr.start) / 3;
      });
      g.renderer.info.reset();
      window.__render(false);
      return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, lod, geo, filet: (R.bridle || []).map((m) => m.visible) };
    };
    const D = { pres: 4.2, avant: 22, apres: 28, loin: 40 };
    const lod = {};
    for (const [k, d] of Object.entries(D)) lod[k] = meas(d, 'auto');
    const tris = {};
    for (const k of ['pres', 'loin']) tris[k] = { auto: meas(D[k], 'auto'), lod0: meas(D[k], 0), lod1: meas(D[k], 1), jeu: meas(D[k], 'off') };
    R.setActive(true);
    window.__cam(h, D.pres, 1.5, 0.2, 1.15, 0.2);
    g.realism.update();
    g.renderer.info.autoReset = true;
    // Coût de la recopie de pose (moyenne sur 300 appels).
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) R.update();
    const updMs = (performance.now() - t0) / 300;
    const tex = [];
    R.root.traverse((o) => { if (o.isMesh) for (const k of ['map', 'normalMap', 'roughnessMap']) { const t = o.material[k]; if (t?.image && !tex.some((x) => x.k === k)) tex.push({ k, w: t.image.width, h: t.image.height }); } });
    const texMB = tex.reduce((a, t) => a + (t.w * t.h * 4 * 4) / 3 / 1048576, 0);
    return { monte: !!h.rider, withTripo: tris.pres.auto, classicOnly: tris.pres.jeu, lod, tris, lodTris: R.lods.map((m) => m.geometry.index.count / 3), updMs: +updMs.toFixed(3), far: { lod0: lod.loin.lod[0], lod1: lod.loin.lod[1] }, tex, texMB: +texMB.toFixed(1), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null };
  });
  glbBytes = statSync('public/real/horse_tripo.glb').size;
  const L = perf.lod, T = perf.tris;
  const lodOk = L.pres.lod[0] && !L.pres.lod[1] && L.avant.lod[0] && !L.avant.lod[1] && !L.apres.lod[0] && L.apres.lod[1] && !L.loin.lod[0] && L.loin.lod[1];
  // Triangles rendus : niveau choisi par le jeu = niveau complet de près, niveau réduit au loin ; écart entre les deux
  // niveaux = multiple entier (passes de rendu) de l'écart de leurs maillages.
  const dLod = perf.lodTris[0] - perf.lodTris[1];
  const passes = (T.pres.lod0.tris - T.pres.lod1.tris) / dLod, passesLoin = (T.loin.lod0.tris - T.loin.lod1.tris) / dLod;
  const trisOk = T.pres.auto.tris === T.pres.lod0.tris && T.loin.auto.tris === T.loin.lod1.tris && passes >= 1 && Math.abs(passes - Math.round(passes)) < 0.02 && passesLoin >= 1 && Math.abs(passesLoin - Math.round(passesLoin)) < 0.02;
  // Écart Tripo − cheval du jeu seul, rendu vs attendu (écart des maillages du cheval × passes de rendu).
  const P = Math.round(passes);
  perf.ecarts = { pres: T.pres.auto.tris - T.pres.jeu.tris, presAttendu: P * (T.pres.auto.geo - T.pres.jeu.geo), loin: T.loin.auto.tris - T.loin.jeu.tris, loinAttendu: P * (T.loin.auto.geo - T.loin.jeu.geo), passes: +passes.toFixed(3), passesLoin: +passesLoin.toFixed(3) };
  const ecartOk = perf.ecarts.pres === perf.ecarts.presAttendu && perf.ecarts.loin === perf.ecarts.loinAttendu && perf.ecarts.pres > perf.ecarts.loin;
  check('E1', 'niveau de détail : complet de près (4,2 m et 22 m), réduit au-delà de 25 m (28 m et 40 m) ; triangles rendus conformes au niveau affiché, écart au cheval du jeu seul conforme aux maillages (près, loin)', lodOk && trisOk && ecartOk, JSON.stringify({ lod: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.lod])), tris: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([m, x]) => [m, x.tris]))])), ecarts: perf.ecarts }));
  check('E2', 'recopie de pose bon marché (< 1 ms par image en rendu logiciel)', perf.updMs < 1, `${perf.updMs} ms`);
  // Filet et rênes (cheval monté) : affichés avec le niveau complet (4,2 m et 22 m), masqués au-delà de 25 m (28 m, 40 m).
  const fl = (k) => L[k].filet;
  const filetOk = perf.monte && ['pres', 'avant'].every((k) => fl(k).length >= 2 && fl(k).every(Boolean)) && ['apres', 'loin'].every((k) => fl(k).length >= 2 && fl(k).every((v) => !v));
  check('E4', 'cheval monté : filet et rênes du Tripo affichés de près (4,2 m et 22 m), masqués au-delà de 25 m (28 m et 40 m)', filetOk, JSON.stringify({ monte: perf.monte, filet: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.filet])) }));
}
// Erreurs JavaScript de ce passage (toutes sections jouées).
const e3 = FULL ? 'E3' : `E3-${SECS}`;
check(e3, `aucune erreur JavaScript${FULL ? '' : ` (sections ${SECS})`}`, errors.length === 0, errors.slice(0, 3).join(' | '));

// Rapport : ce passage, plus le dernier passage des sections non jouées (passage partiel).
// Vérification d'erreurs d'un passage partiel (E3-XYZ) : gardée tant que ses sections ne sont pas toutes rejouées.
const newIds = new Set(results.map((r) => r.id));
const keep = (id) => !newIds.has(id) && (id.startsWith('E3-') ? ![...id.slice(3)].every((s) => RUN.has(s)) : !RUN.has(id[0]));
const KEYS = { A: ['vues', 'rest'], B: ['gaits'], C: ['jumps', 'sauts'], D: ['cso'], E: ['perf', 'glbBytes'] };
const rapport = { boot, seuils: { ...TOL, pose: POSE, virage: VIRAGE } };
if (old) for (const [s, ks] of Object.entries(KEYS)) if (!RUN.has(s)) for (const k of ks) if (old[k] !== undefined) rapport[k] = old[k];
const mine = { vues: vueRes, rest, gaits: RUN.has('B') ? gaitRes : undefined, jumps: jev, sauts: jumpRes, cso, perf, glbBytes };
for (const [s, ks] of Object.entries(KEYS)) if (RUN.has(s)) for (const k of ks) rapport[k] = mine[k];
const prevResults = (old?.results || []).filter((r) => keep(r.id));
rapport.results = [...prevResults, ...results];
rapport.infos = [...(old?.infos || []).filter((x) => keep(x.id)), ...infos];
const runs = Object.fromEntries(Object.entries(old?.passages || {}).filter(([k]) => ![...k].every((s) => RUN.has(s))));
runs[SECS] = { date: new Date().toISOString(), echecs: fails, errors };
rapport.passages = runs;
rapport.errors = Object.values(runs).flatMap((r) => r.errors);
writeFileSync(`${OUT}/rapport.json`, JSON.stringify(rapport, null, 1));
if (perf) console.log(JSON.stringify({ perf: { ...perf, tris: undefined }, glbBytes }));
const totalFails = rapport.results.filter((r) => !r.ok).length;
if (!FULL) console.log(`Sections jouées : ${SECS} ; rapport (toutes sections connues) : ${rapport.results.length} vérifications, ${totalFails} en échec.`);
console.log(fails ? `ÉCHECS : ${fails}` : 'CHEVAL TRIPO : ESSAI OK');
await browser.close();
process.exit(fails ? 1 : 0);
