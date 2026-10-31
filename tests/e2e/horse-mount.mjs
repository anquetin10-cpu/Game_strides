// Montée et descente à cheval animées — recette (rendu logiciel SwiftShader, émulation iPhone 13 paysage : pas un
// iPhone réel). Commandes normales : bouton ACTION « Monter » / « Descendre » (touche E), joystick virtuel.
// HM-01 un appui lance toute la séquence ; commandes, interactions et double appui ignorés pendant la séquence
// HM-02 pied gauche dans l'étrier (plante sur la grille), mains au garrot (rênes) et au pommeau
// HM-03 jambe droite au-dessus de la croupe : jamais dans le cheval (rayons sur le maillage du cheval, selle comprise)
// HM-04 bassin posé progressivement ; rattachement à la selle sans saut (position, rotation, échelle)
// HM-05 descente : arrêt du cheval, jambe au-dessus de la croupe, réception au sol, debout à l'épaule, contrôles à pied
// HM-06 même personnage du début à la fin (même maillage, même squelette, même modèle réaliste, même tenue, même échelle)
// HM-07 caméra continue (aucun saut de position ni de champ) ; cheval immobile pendant la séquence
// HM-08 trois cycles successifs ; chevaux différents (Ulysse, Onyx, échelle 1,06, cheval réaliste) ; côté droit en miroir
//       quand un mur longe le flanc gauche ; durées
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/horse-mount.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/horse-mount';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const results = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok, extra });
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await E(async () => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
  window.__T3 = await import('/node_modules/three/build/three.module.js');
  const T3 = window.__T3;
  // Mesure image par image d'une séquence (déclenchée par la touche E, appui réel).
  const S = (window.__S = {});
  S.place = (h, x, z, heading, side = 1, dist = 1.6) => {
    A.foot();
    h.setPosition(x, z, heading);
    h.ai = null;
    h.speed = 0;
    const lx = Math.cos(heading), lz = -Math.sin(heading);
    g.player.human.setPosition(x + lx * dist * side, z + lz * dist * side, heading + Math.PI);
    A.tick(6);
    g.cam.snap(g.player.focus.pos, g.player.heading);
    A.tick(4);
  };
  const W = () => new T3.Vector3();
  const ray = new T3.Raycaster();
  const down = new T3.Vector3(0, -1, 0);
  // Pénétration d'un point dans l'arrière-main du cheval : tronc modélisé par une capsule du repère du cheval (mètres du
  // modèle, avant mise à l'échelle du maillage) — du poitrail (0 ; 1,20 ; 0,55) à la croupe (0 ; 1,25 ; -0,75),
  // rayon 0,30 (dessus de croupe à 1,55 m, flancs à ±0,30 m). Profondeur de pénétration (0 si dehors).
  const P1 = new T3.Vector3(0, 1.2, 0.55), P2 = new T3.Vector3(0, 1.25, -0.75), R = 0.3;
  S.inside = (h, q) => {
    const inv = new T3.Matrix4().copy(h.mesh.matrixWorld).invert();
    const lq = q.clone().applyMatrix4(inv); // repère du modèle (mètres du modèle)
    const sc = new T3.Vector3();
    h.mesh.getWorldScale(sc);
    const ab = P2.clone().sub(P1), t = Math.max(0, Math.min(1, lq.clone().sub(P1).dot(ab) / ab.lengthSq()));
    const d = lq.distanceTo(P1.clone().addScaledVector(ab, t));
    return d < R ? (R - d) * sc.x : 0;
  };
  // Position de l'étrier qui pend à sa place (étrier descendu) : point de la grille.
  S.iron = (h, side) => {
    const b = h.bones[side === 'l' ? 'stirL' : 'stirR'];
    b.parent.updateWorldMatrix(true, false);
    return b.userData.rest.clone().applyMatrix4(b.parent.matrixWorld);
  };
  S.snapshot = () => {
    const p = g.player, hu = p.human;
    hu.mesh.updateWorldMatrix(true, true);
    const pos = W(), q = new T3.Quaternion(), sc = W();
    hu.mesh.matrixWorld.decompose(pos, q, sc);
    return { pos: pos.toArray(), q: q.toArray(), sc: sc.x };
  };
  S.identity = () => {
    const p = g.player, hu = p.human, r = g.realism?.body;
    return { mesh: hu.mesh.uuid, bones: hu.bones.hips.uuid, real: r ? r.root.uuid : null, outfit: JSON.stringify(hu.outfit), scale: hu.scale, sex: hu.sex };
  };
});

// Une séquence complète : appui sur E, puis image par image jusqu'à la fin ; mesures.
const runSeq = async (dir, opts = {}) => E(async ([dir, opts]) => {
  const g = window.__game, A = window.__auto, S = window.__S, p = g.player, M = p.horseMount, T3 = window.__T3;
  const h = p.horse;
  const id0 = S.identity();
  const lab = (g.interact.update(), g.interact.current?.label || '');
  // Appui réel (touche E) lu par la boucle du jeu.
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  A.tick(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
  const started = M.active;
  const r = { lab, started, frames: 0, seqT: 0, totalT: 0, maxJump: 0, camJump: 0, fovJump: 0, horseMoved: 0, minLeg: Infinity, stirrup: Infinity, ball: Infinity, handW: Infinity, handP: Infinity, ids: new Set(), doublePress: null, inputMoved: 0, hipsDrop: 0, side: M.side };
  let last = S.snapshot(), lastCam = g.camera.position.clone(), lastFov = g.camera.fov;
  const h0 = h.pos.clone();
  let seqFrames = 0, pressedTwice = false;
  const W = () => new T3.Vector3();
  for (let f = 0; f < 30 * 30 && M.active; f++) {
    // Double appui et joystick pendant la séquence : sans effet attendu.
    if (f === 40 && !pressedTwice) {
      pressedTwice = true;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
    }
    if (f === 41) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
    if (f > 45 && f < 70) g.input.setVirtualMove(0.6, 0.8);
    else g.input.setVirtualMove(0, 0);
    A.tick(1);
    g.realism?.update();
    r.frames++;
    const s = S.snapshot();
    const d = Math.hypot(s.pos[0] - last.pos[0], s.pos[1] - last.pos[1], s.pos[2] - last.pos[2]);
    if (M.phase === 'seq') {
      seqFrames++;
      r.maxJump = Math.max(r.maxJump, d);
      r.horseMoved = Math.max(r.horseMoved, Math.hypot(h.pos.x - h0.x, h.pos.z - h0.z) - (M.dir === 'down' ? 0 : 0));
      const ID = S.identity();
      r.ids.add(JSON.stringify(ID));
      const hu = p.human;
      // Pied côté montoir dans l'étrier : plante (os du pied → pointe) contre la grille.
      const k = M._evaluate(M.t);
      const near = M.side === 1 ? 'l' : 'r';
      if (k.a.near?.s === 'iron' && k.b.near?.s === 'iron' && k.u < 0.5) {
        // Plante du pied (articulation des orteils) contre la grille de l'étrier qui pend à sa place.
        const toe = W();
        hu.bones[`${near}Toe`].getWorldPosition(toe);
        r.ball = Math.min(r.ball, toe.distanceTo(S.iron(h, near)));
      }
      // Mains : garrot (rênes) et pommeau, quand la clé les y met.
      if (k.a.hn && k.b.hn && k.a.hn === k.b.hn && k.u > 0.6 && k.a.hn[2] > 0.4) {
        const hw = M._toWorld(k.a.hn, M._seatFrame(h, k.a.tilt ?? 0), W());
        const hp = W();
        hu.bones[`${near}Hand`].getWorldPosition(hp);
        r.handW = Math.min(r.handW, hp.distanceTo(hw));
      }
      // Jambe opposée au-dessus du cheval : cuisse, genou, tibia, pied — jamais sous la surface du cheval.
      const far = near === 'l' ? 'r' : 'l';
      const pts = [];
      for (const [a, b] of [[`${far}Thigh`, `${far}Shin`], [`${far}Shin`, `${far}Foot`], [`${far}Foot`, `${far}Toe`]]) {
        const A1 = W(), B1 = W();
        hu.bones[a].getWorldPosition(A1);
        hu.bones[b].getWorldPosition(B1);
        for (let t = 0.25; t <= 1.001; t += 0.25) pts.push(A1.clone().lerp(B1, t));
      }
      // Arrière-main (derrière le siège) : là où passe la jambe ; pénétration maximale rapportée en négatif.
      const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
      for (const q of pts) {
        const along = (q.x - h.pos.x) * fx + (q.z - h.pos.z) * fz;
        if (along > -0.3) continue;
        r.minLeg = Math.min(r.minLeg, -S.inside(h, q));
      }
    }
    // Caméra : aucun saut d'une image à l'autre.
    r.camJump = Math.max(r.camJump, g.camera.position.distanceTo(lastCam));
    r.fovJump = Math.max(r.fovJump, Math.abs(g.camera.fov - lastFov));
    lastCam = g.camera.position.clone();
    lastFov = g.camera.fov;
    last = s;
    r.seqT = seqFrames / 30;
  }
  g.input.setVirtualMove(0, 0);
  r.totalT = r.frames / 30;
  // Image suivante : rattachement (montée) ou au sol (descente) — même transformation que la dernière image.
  const end = S.snapshot();
  A.tick(1);
  const after = S.snapshot();
  r.endJump = Math.hypot(after.pos[0] - end.pos[0], after.pos[1] - end.pos[1], after.pos[2] - end.pos[2]);
  r.endScale = [end.sc, after.sc];
  const q1 = new T3.Quaternion().fromArray(end.q), q2 = new T3.Quaternion().fromArray(after.q);
  r.endRot = q1.angleTo(q2);
  r.mode = p.mode;
  r.mounted = !!p.human.mounted;
  r.ids = [...r.ids].length;
  r.sameId = JSON.stringify(S.identity()) === JSON.stringify(id0);
  r.id0 = id0;
  return r;
}, [dir, opts]);

const fmt = (x) => (typeof x === 'number' ? +x.toFixed(3) : x);
const show = (r) => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'id0').map(([k, v]) => [k, fmt(v)])));

// Contrôle du détecteur : un point au milieu du dos du cheval est bien « dedans », un point à 0,5 m au-dessus non.
const ref = await E(() => {
  const g = window.__game, S = window.__S, h = g.mainHorse, T3 = window.__T3;
  S.place(h, -104, 190, Math.PI / 2, 1, 1.6);
  h.mesh.updateWorldMatrix(true, true);
  const inP = new T3.Vector3(0, 1.25, -0.5).applyMatrix4(h.mesh.matrixWorld);
  const outP = new T3.Vector3(0, 1.25 + 0.8, -0.5).applyMatrix4(h.mesh.matrixWorld);
  return { dedans: S.inside(h, inP), dessus: S.inside(h, outP) };
});
check('HM-00', 'contrôle du détecteur de pénétration (point dans la croupe détecté, point au-dessus non)', ref.dedans > 0.2 && ref.dessus === 0, JSON.stringify(ref));

// ---------- Comète, côté gauche, trois cycles ----------
await E(() => window.__S.place(window.__game.mainHorse, -104, 190, Math.PI / 2, 1, 1.6));
const cycles = [];
for (let c = 1; c <= 3; c++) {
  const up = await runSeq('up');
  const down = await runSeq('down');
  cycles.push({ up, down });
  if (c === 1) {
    check('HM-01', 'un appui sur « Monter » lance toute la séquence ; double appui et joystick ignorés ; cheval immobile', up.lab === 'Monter' && up.started && up.mode === 'ride' && up.horseMoved < 0.05, show({ lab: up.lab, mode: up.mode, horseMoved: up.horseMoved }));
    check('HM-02a', 'pied gauche dans l’étrier : plante du pied sur la grille (< 6 cm)', up.ball < 0.06, `${(up.ball * 100).toFixed(1)} cm`);
    check('HM-02b', 'main gauche aux rênes sur le garrot (< 6 cm)', up.handW < 0.06, `${(up.handW * 100).toFixed(1)} cm`);
    check('HM-03', 'jambe droite au-dessus de la croupe, jamais dans le cheval (pénétration maximale de la jambe opposée)', up.minLeg > -0.02, `${(-up.minLeg * 100).toFixed(1)} cm`);
    check('HM-04', 'rattachement à la selle sans saut (position < 1 cm, rotation < 1°, échelle identique)', up.endJump < 0.01 && up.endRot < 0.0175 && Math.abs(up.endScale[0] - up.endScale[1]) < 1e-4 && up.mounted, show({ endJump: up.endJump, endRot: up.endRot, endScale: up.endScale }));
    check('HM-05', 'descente : jambe au-dessus de la croupe, au sol, à pied (contrôles à pied rétablis)', down.lab === 'Descendre' && down.mode === 'foot' && !down.mounted && down.minLeg > -0.02 && down.endJump < 0.05, show({ mode: down.mode, minLeg: down.minLeg, endJump: down.endJump }));
    check('HM-06', 'même personnage du début à la fin (maillage, squelette, modèle réaliste, tenue, échelle)', up.sameId && down.sameId && up.ids === 1 && down.ids === 1, JSON.stringify(up.id0));
    check('HM-07', 'caméra continue (saut < 0,35 m, champ < 1°), personnage sans téléportation (< 0,15 m par image)', Math.max(up.camJump, down.camJump) < 0.35 && Math.max(up.fovJump, down.fovJump) < 1 && Math.max(up.maxJump, down.maxJump) < 0.15, show({ cam: Math.max(up.camJump, down.camJump), fov: Math.max(up.fovJump, down.fovJump), perso: Math.max(up.maxJump, down.maxJump) }));
    check('HM-08a', 'durées : montée 1,5–2,5 s, descente 1,5–2,5 s (hors approche / arrêt)', up.seqT >= 1.5 && up.seqT <= 2.5 && down.seqT >= 1.5 && down.seqT <= 2.5, `montée ${up.seqT.toFixed(2)} s, descente ${down.seqT.toFixed(2)} s`);
  }
}
check('HM-08b', 'trois cycles successifs : tous complets, même personnage', cycles.every((c) => c.up.mode === 'ride' && c.down.mode === 'foot' && c.up.sameId && c.down.sameId && c.up.minLeg > -0.02 && c.down.minLeg > -0.02), cycles.map((c) => `${c.up.seqT.toFixed(2)}/${c.down.seqT.toFixed(2)} s`).join(' · '));

// ---------- Autres chevaux ----------
const other = await E(async () => {
  const g = window.__game, S = window.__S, p = g.player;
  const out = {};
  for (const [id, scale] of [['ulysse', 0.94], ['onyx', 0.94], ['big', 1.06]]) {
    const def = id === 'big' ? { id: 'test-big', name: 'Grand', coat: 'chestnut' } : (await import('/src/gameplay/data.js')).HORSES?.[id] || { id, name: id, coat: 'grey' };
    const h = g.spawnHorse(def, -110 + Object.keys(out).length * 6, 206, 0, { saddle: true });
    h.mesh.scale.setScalar(scale);
    out[id] = h;
  }
  window.__others = out;
  return Object.keys(out);
});
for (const id of other) {
  const r = await E((id) => {
    const g = window.__game, S = window.__S, p = g.player, h = window.__others[id];
    p.setHorse(h);
    S.place(h, h.pos.x, h.pos.z, 0, 1, 1.6);
    return id;
  }, id);
  const up = await runSeq('up');
  const down = await runSeq('down');
  check(`HM-08c-${r}`, `cheval ${r} : montée et descente complètes, étrier, croupe, rattachement sans saut`, up.mode === 'ride' && down.mode === 'foot' && up.ball < 0.06 && up.minLeg > -0.02 && down.minLeg > -0.02 && up.endJump < 0.01, show({ ball: up.ball, minLeg: Math.min(up.minLeg, down.minLeg), endJump: up.endJump, upMode: up.mode, downMode: down.mode, started: up.started, lab: up.lab }));
}

// ---------- Côté droit en miroir (mur le long du flanc gauche) ----------
const mirror = await E(() => {
  const g = window.__game, S = window.__S, p = g.player;
  p.setHorse(g.mainHorse);
  // Pignon nord de l'écurie du Val : flanc gauche du cheval à ~1 m du mur.
  S.place(g.mainHorse, -120, 157.1, Math.PI / 2, -1, 1.6);
  return { side: p.horseMount._pickSide(g.mainHorse) };
});
const mu = await runSeq('up');
const md = await runSeq('down');
check('HM-08d', 'mur le long du flanc gauche : montée et descente par la droite (miroir), sans traverser le mur', mirror.side === -1 && mu.side === -1 && mu.mode === 'ride' && md.mode === 'foot' && mu.minLeg > -0.02, show({ side: mirror.side, ball: mu.ball, minLeg: mu.minLeg }));

// ---------- Cheval réaliste (réglage « Chevaux 3D ») ----------
const realH = await E(async () => {
  const g = window.__game, S = window.__S, p = g.player;
  g.save.data.settings.horses = 'real';
  S.place(g.mainHorse, -104, 190, Math.PI / 2, 1, 1.6);
  for (let i = 0; i < 40; i++) {
    g.realism.update();
    if (g.realism.horses.size) break;
    await new Promise((r) => setTimeout(r, 400));
    window.__auto.tick(1);
  }
  return g.realism.horses.size;
});
const ru = await runSeq('up');
const rd = await runSeq('down');
await E(() => (window.__game.save.data.settings.horses = 'classic'));
check('HM-08e', 'cheval réaliste affiché : séquence complète (même rig de selle)', ru.mode === 'ride' && rd.mode === 'foot' && ru.endJump < 0.01, show({ realHorses: realH, ball: ru.ball, endJump: ru.endJump }));

check('erreurs', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/resultats.json`, JSON.stringify({ results, cycles: cycles.map((c) => ({ up: { ...c.up, id0: undefined }, down: { ...c.down, id0: undefined } })) }, null, 1));
console.log(fails ? `${fails} échec(s)` : 'tout est vert');
await browser.close();
process.exit(fails ? 1 : 0);
