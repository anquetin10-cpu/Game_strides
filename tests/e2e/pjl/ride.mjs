// Cheval WildMesh dans le parcours jouable (rendu logiciel SwiftShader de Chromium, émulation tactile iPhone en
// paysage : pas un iPhone réel). Mêmes vues avant (jeu sans le cheval WildMesh) et après, caméra posée par le script.
//  PJ-01 démarrage : cheval WildMesh affiché pour Comète (cheval du jeu masqué, toujours simulé), aucune erreur
//  PJ-02 montée animée (séquence du jeu) : bassin du cavalier posé sur la selle WildMesh à la fin
//  PJ-03 repos, pas, trot, galop à droite et à gauche (main suivie), virages à gauche et à droite
//  PJ-04 saut en terrain libre : clip de saut joué, réception, retour au galop
//  PJ-05 terrain en pente : sabots près du sol
//  PJ-06 descente animée ; rênes, étriers, longe
//  PJ-07 reprise (rechargement + « Continuer ») : cheval WildMesh de nouveau affiché
//  PJ-08 mesures : préparation, mémoire JS, géométries/textures, appels de dessin, temps CPU d'une image (avec / sans)
// Usage : node tests/e2e/pjl/ride.mjs <dossier> [844x390|667x300] [--base]   (BASE : serveur, défaut :5173)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/pjl-ride';
const [W, H] = (process.argv[3] || '844x390').split('x').map(Number);
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const SHOTS = process.env.SHOTS !== '0';
mkdirSync(OUT, { recursive: true });
const results = [];
let fails = 0;
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok, extra });
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [], logs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (/\[horse\]|WildMesh/.test(m.text())) logs.push(m.text());
});
const E = (f, a) => page.evaluate(f, a);
const shot = async (name) => SHOTS && page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82, timeout: 240000 });
const t0 = Date.now();
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
const bootS = (Date.now() - t0) / 1000;
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  g.sky.rain = 0;
  g.sky.wet = 0;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
  const V = g.camera.position.constructor;
  // Une image : simulation (1/30 s), modèles, puis rendu avec la caméra du jeu ou une caméra posée.
  const K = (window.__K = {});
  K.step = (n = 1, each) => {
    for (let i = 0; i < n; i++) {
      each?.(i);
      g.update(1 / 30);
      g.realism?.update();
    }
  };
  K.cam = (eye, target, fov = 42) => {
    g.camera.position.set(eye[0], eye[1], eye[2]);
    g.camera.fov = fov;
    g.camera.updateProjectionMatrix();
    g.camera.lookAt(target[0], target[1], target[2]);
    g.camera.updateMatrixWorld();
  };
  // Vue de côté (side > 0 : à gauche du cheval), à hauteur `up`, `back` m en arrière.
  K.side = (h, side = 5.5, up = 1.3, back = 0, fov = 40) => {
    const lx = Math.cos(h.heading), lz = -Math.sin(h.heading), fx = Math.sin(h.heading), fz = Math.cos(h.heading);
    const y = h.groundY ?? h.pos.y;
    K.cam([h.pos.x + lx * side - fx * back, y + up, h.pos.z + lz * side - fz * back], [h.pos.x + fx * 0.2, y + 1.0, h.pos.z + fz * 0.2], fov);
  };
  K.render = () => {
    g.sky.follow(g.camera);
    g.world.update(1 / 30, g.camera, g.sky, g.player.focus.pos);
    g.renderer.render(g.scene, g.camera);
  };
  K.state = () => {
    const h = g.player.horse, P = h?.pjl, a = h?.anim?._a;
    return { mode: g.player.mode, pjl: !!P, hidden: h ? h.mesh.layers.mask === 1 << 31 : null, gait: a?.gait, lead: a?.lead, speed: +(h?.speed || 0).toFixed(2), jumpT: +(h?.jumpT ?? -1).toFixed(2), clipJump: P ? +(P.view.jumpWeight || 0).toFixed(2) : null };
  };
  // Poids des clips en cours (vue WildMesh).
  K.clips = () => {
    const P = g.player.horse?.pjl;
    if (!P) return null;
    const out = {};
    for (const [n, w] of P.view.weights) if (w > 0.05) out[n] = +w.toFixed(2);
    return out;
  };
  // Hauteur des sabots WildMesh au-dessus du sol (m), AG AD PG PD.
  K.hooves = () => {
    const h = g.player.horse, P = h?.pjl;
    if (!P) return null;
    return ['fingers_02_l', 'fingers_02_r', 'toes_02_l', 'toes_02_r'].map((n) => {
      const p = P.view.boneWorld(n, new V());
      return +(p.y - h.groundAt(p.x, p.z)).toFixed(3);
    });
  };
  // Jambes du cavalier dans le corps WildMesh : points le long des cuisses, jambes et pieds ; un point est dans le corps
  // si un rayon vertical vers le haut coupe le maillage skinné (pose courante) un nombre impair de fois ; profondeur =
  // distance à la première surface au-dessus. Rend la plus grande profondeur (m, 0 si aucun point dedans).
  let ray = null;
  import('/node_modules/three/build/three.module.js').then((T3) => (ray = new T3.Raycaster()));
  const bodyOf = () => {
    const P = g.mainHorse?.pjl;
    if (!P) return null;
    let body = null;
    P.view.model.traverse((o) => o.isSkinnedMesh && o.material?.name === 'horse_body' && (body = o));
    body?.computeBoundingSphere();
    return body;
  };
  const DIRS = [new V(0, 1, 0), new V(0, -1, 0), new V(1, 0, 0), new V(-1, 0, 0), new V(0, 0, 1), new V(0, 0, -1)];
  // Point dans le corps WildMesh (maillage skinné, pose courante) : les six rayons (haut, bas, gauche, droite, avant,
  // arrière) rencontrent tous le corps (un maillage pas tout à fait fermé fausse le comptage des intersections) ;
  // profondeur = distance à la surface la plus proche (0 : dehors).
  K.depthIn = (q, body = bodyOf()) => {
    if (!ray || !body) return null;
    let d = Infinity;
    for (const dir of DIRS) {
      ray.set(q, dir);
      ray.far = 1.5;
      const h2 = ray.intersectObject(body, false);
      if (!h2.length) return 0;
      d = Math.min(d, h2[0].distance);
    }
    return d;
  };
  // Jambes du cavalier dans le corps WildMesh : plus grande profondeur des points des cuisses, jambes et pieds (m).
  K.legInside = () => {
    const body = bodyOf(), hu = g.player.human;
    if (!ray || !body) return null;
    hu.mesh.updateWorldMatrix(true, true);
    const B = hu.bones;
    let worst = 0;
    for (const s of ['l', 'r']) {
      const chain = [B[`${s}Thigh`], B[`${s}Shin`], B[`${s}Foot`], B[`${s}Toe`]].filter(Boolean).map((b) => b.getWorldPosition(new V()));
      for (let k = 0; k < chain.length - 1; k++) {
        for (const t of [0.25, 0.5, 0.75, 1]) {
          const q = chain[k].clone().lerp(chain[k + 1], t);
          const d = K.depthIn(q, body);
          if (d > worst) {
            worst = d;
            K.lastPen = { side: s, seg: k, t, d: +d.toFixed(3), p: q.toArray().map((x) => +x.toFixed(2)) };
          }
        }
      }
    }
    return +worst.toFixed(3);
  };
  // Contrôle du détecteur : bassin du cheval (dedans) et 40 cm au-dessus du garrot (dehors).
  K.detectorCheck = () => {
    const P = g.mainHorse?.pjl;
    if (!P) return null;
    const pel = P.view.boneWorld('pelvis', new V()), wit = P.view.boneWorld('spine_04', new V());
    return { dedans: +(K.depthIn(pel) || 0).toFixed(3), dessus: +(K.depthIn(wit.clone().add(new V(0, 0.6, 0))) || 0).toFixed(3) };
  };
  // Bassin du cavalier par rapport au siège WildMesh (m).
  K.seatGap = () => {
    const h = g.player.horse, P = h?.pjl, hu = g.player.human;
    if (!P || !hu.mounted) return null;
    const s = P.view.anchorWorld('seat', new V());
    const r = hu.getSeatWorldPosition(new V());
    return +s.distanceTo(r).toFixed(3);
  };
});
const st = () => E(() => window.__K.state());
// ---------- PJ-01 démarrage
const s0 = await E(() => {
  const g = window.__game, K = window.__K;
  K.step(4);
  const R = g.realism, h = g.mainHorse;
  return { pjl: !!R?.pjl, has: !!h.pjl, failed: R?.pjlState?.failed, stats: R?.pjlState?.asset?.stats || null, horse: h.name, n: R?.pjl ? [...R.pjl.keys()].map((x) => x.name) : [] };
});
const PJL = s0.pjl;
console.log(`démarrage ${bootS.toFixed(0)} s ; ${PJL ? `WildMesh : ${s0.n.join(', ')} ; préparation ${JSON.stringify(s0.stats)}` : 'jeu sans cheval WildMesh (version de référence)'}`);
if (PJL) check('PJ-01', 'cheval WildMesh pour Comète au démarrage, sans erreur', s0.has && !s0.failed && errors.length === 0, `préparation ${s0.stats?.prepareMs} ms, fichier ${s0.stats?.loadMs} ms`);
// Comète au box : vue de la porte.
await E(() => {
  const g = window.__game, K = window.__K, h = g.mainHorse;
  K.step(2);
  const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
  K.cam([h.pos.x + fx * 2.6 + Math.cos(h.heading) * 1.4, h.pos.y + 1.7, h.pos.z + fz * 2.6 - Math.sin(h.heading) * 1.4], [h.pos.x, h.pos.y + 1.2, h.pos.z]);
  K.render();
});
await shot('01-box');
// ---------- Plage : cheval sorti, monté
const beach = await E(() => {
  const g = window.__game, A = window.__auto, K = window.__K;
  const h = g.mainHorse;
  // Ligne parallèle au rivage, 6 m au sec (même méthode que le teaser).
  const x0 = 120, zAt = (x) => g.terrain.waterlineZ(x) + 6;
  A.foot();
  h.setPosition(x0 + 40, zAt(x0 + 40), -Math.PI / 2);
  h.ai = null;
  h.inBox = false;
  g.player.horse = h;
  window.__zAt = zAt;
  const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
  g.player.human.setPosition(h.pos.x + lx * 1.4, h.pos.z + lz * 1.4, h.heading + Math.PI);
  K.step(10);
  return { x: h.pos.x, z: h.pos.z };
});
// ---------- PJ-02 montée animée (séquence du jeu)
// Appui réel sur ACTION (touche E) lu par la boucle du jeu, comme tests/e2e/horse-mount.mjs.
const pressE = () => E(() => {
  const g = window.__game, K = window.__K;
  g.interact.update();
  const lab = g.interact.current?.label || '';
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  K.step(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
  return { lab, active: !!g.player.horseMount?.active };
});
const seqShots = async (prefix) => {
  const frames = [];
  for (let i = 0; i < 16; i++) {
    const r = await E(() => {
      const g = window.__game, K = window.__K, h = g.mainHorse, M = g.player.horseMount;
      let pen = 0;
      for (let k = 0; k < 6; k++) {
        K.step(1);
        pen = Math.max(pen, K.legInside() || 0);
      }
      K.side(h, 4.2, 1.5, -0.6, 44);
      K.render();
      return { ...K.state(), active: !!M?.active, gap: K.seatGap(), pen, where: pen > 0.02 ? K.lastPen : null, seqT: +(M?.t ?? 0).toFixed(2) };
    });
    frames.push(r);
    if (i % 3 === 0 || !r.active) await shot(`${prefix}-${String(i).padStart(2, '0')}`);
    if (!r.active) break;
  }
  return frames;
};
const mountPress = await pressE();
const mountFrames = await seqShots('02-montee');
console.log('montée :', JSON.stringify(mountPress), `${mountFrames.length} pas de 0,2 s`);
const m2 = await E(() => {
  const K = window.__K;
  K.step(30);
  return { ...K.state(), gap: K.seatGap() };
});
if (PJL) {
  const dc = await E(() => window.__K.detectorCheck());
  check('PJ-00b', 'contrôle du détecteur de pénétration (bassin du cheval dedans, point au-dessus du garrot dehors)', dc && dc.dedans > 0.05 && dc.dessus === 0, JSON.stringify(dc));
}
const penUp = Math.max(...mountFrames.map((f) => f.pen || 0));
if (PJL) console.log('montée, pénétration par pas :', mountFrames.map((f) => `${f.pen}${f.where ? `@${f.where.side}${f.where.seg}` : ''}`).join(' '));
check('PJ-02', 'montée animée (bouton ACTION) jusqu’en selle' + (PJL ? ', jambes jamais dans le corps WildMesh (< 1 cm)' : ''), mountPress.active && m2.mode === 'ride' && (!PJL || penUp < 0.01), `${mountPress.lab}${PJL ? ` ; pénétration max ${(penUp * 100).toFixed(1)} cm` : ''}`);
// ---------- PJ-03 allures
const ride = async (name, mag, ticks, { gallop = false, turn = 0, cam = [5.5, 1.3, 0], n = 3 } = {}) => {
  const rows = [];
  for (let k = 0; k < n; k++) {
    const r = await E(([mag, ticks, gallop, turn, cam]) => {
      const g = window.__game, A = window.__auto, K = window.__K, h = g.player.horse;
      const hooves = [];
      K.step(ticks, (i) => {
        // Cap : le long du rivage (turn = 0), ou virage continu (turn ±1 : à gauche / à droite).
        const want = turn ? h.heading + turn * 0.9 : -Math.PI / 2;
        const ax = Math.sin(want), az = Math.cos(want);
        if (!turn) {
          const tx = h.pos.x - 12, tz = window.__zAt(h.pos.x - 12);
          A.steer(tx - h.pos.x, tz - h.pos.z, mag);
        } else A.steer(ax, az, mag);
        if (gallop) g.input.held.add('gallop');
        else g.input.held.delete('gallop');
        h.stamina = h.maxStamina;
        if (i > ticks - 12) hooves.push(K.hooves());
      });
      K.side(h, cam[0], cam[1], cam[2]);
      K.render();
      return { ...K.state(), clips: K.clips(), hooves, pen: K.legInside(), where: K.lastPen };
    }, [mag, ticks, gallop, turn, cam]);
    rows.push(r);
    await shot(`${name}-${k}`);
  }
  return rows;
};
const idle = await ride('03-repos', 0, 20, { n: 1 });
const walk = await ride('04-pas', 0.3, 40);
const trot = await ride('05-trot', 0.5, 40);
const canter = await ride('06-galop', 0.8, 45);
const gallop = await ride('07-grand-galop', 1, 45, { gallop: true });
const turnL = await ride('08-virage-gauche', 0.8, 40, { turn: 1, cam: [0.5, 2.2, 7] });
const turnR = await ride('09-virage-droite', 0.8, 40, { turn: -1, cam: [0.5, 2.2, 7] });
const last = (rows) => rows[rows.length - 1];
if (PJL) {
  const seated = [...idle, ...walk, ...trot, ...canter, ...gallop, ...turnL, ...turnR];
  const pm = Math.max(...seated.map((r) => r.pen || 0));
  console.log('en selle, pénétration par prise :', seated.map((r) => `${r.pen}${r.pen > 0.02 && r.where ? `@${r.where.side}${r.where.seg}:${r.where.t}` : ''}`).join(' '));
  check('PJ-03c', 'en selle (repos, allures, virages) : jambes hors du corps WildMesh (< 1 cm)', pm < 0.01, `max ${(pm * 100).toFixed(1)} cm`);
}
const gaitOk = idle[0].gait === 'idle' && last(walk).gait === 'walk' && last(trot).gait === 'trot' && ['canter', 'gallop'].includes(last(canter).gait);
check('PJ-03', 'allures repos → pas → trot → galop → grand galop', gaitOk, `${idle[0].gait}/${last(walk).gait}/${last(trot).gait}/${last(canter).gait}/${last(gallop).gait} ; clips ${PJL ? JSON.stringify(last(canter).clips) : '—'}`);
if (PJL) {
  const leadL = last(turnL).lead, leadR = last(turnR).lead;
  const clipsL = Object.keys(last(turnL).clips || {}).join(','), clipsR = Object.keys(last(turnR).clips || {}).join(',');
  check('PJ-03b', 'virage à gauche : galop à gauche (clips en miroir), à droite : galop à droite (clips d’origine)', leadL > 0 && leadR < 0 && /_M/.test(clipsL) && !/canter_M|gallop_M/.test(clipsR), `gauche : ${clipsL} ; droite : ${clipsR}`);
  const all = [...walk, ...trot, ...canter, ...turnL, ...turnR].flatMap((r) => r.hooves);
  const minPer = [0, 1, 2, 3].map((k) => Math.min(...all.map((h) => h[k])));
  check('PJ-05a', 'sabots au sol à l’appui (articulation du sabot entre -6 et +16 cm du sol)', minPer.every((v) => v > -0.06 && v < 0.16), minPer.join(' / '));
}
// ---------- PJ-04 saut en terrain libre
const jump = [];
await E(() => {
  const g = window.__game, A = window.__auto, K = window.__K, h = g.player.horse;
  K.step(40, () => {
    const tx = h.pos.x - 12;
    A.steer(tx - h.pos.x, window.__zAt(tx) - h.pos.z, 0.8);
    h.stamina = h.maxStamina;
  });
  h.control.jump = true;
});
for (let i = 0; i < 14; i++) {
  const r = await E(() => {
    const g = window.__game, A = window.__auto, K = window.__K, h = g.player.horse;
    K.step(2, () => {
      const tx = h.pos.x - 12;
      A.steer(tx - h.pos.x, window.__zAt(tx) - h.pos.z, 0.8);
    });
    K.side(h, 6, 1.4, 0.5, 44);
    K.render();
    return { ...K.state(), clips: K.clips(), y: +(h.jumpY || 0).toFixed(2) };
  });
  jump.push(r);
  await shot(`10-saut-${String(i).padStart(2, '0')}`);
}
const flew = jump.some((r) => r.jumpT >= 0), landed = last(jump).jumpT < 0;
check('PJ-04', 'saut : envol, réception, retour aux allures', flew && landed, PJL ? `clip de saut ${Math.max(...jump.map((r) => r.clipJump))} au plus ; clips en fin : ${JSON.stringify(last(jump).clips)}` : '');
// ---------- PJ-05 terrain en pente (dune / herbe) : point de pente 8–20 % cherché autour de la plage
const slope = await E(() => {
  const g = window.__game, A = window.__auto, K = window.__K, h = g.player.horse;
  let best = null;
  for (let x = -60; x <= 200 && !best; x += 6) {
    for (let dz = 10; dz <= 120 && !best; dz += 6) {
      const z = g.terrain.waterlineZ(x) + dz;
      const s = Math.abs(g.terrain.getHeight(x, z + 2) - g.terrain.getHeight(x, z - 2)) / 4;
      if (s > 0.08 && s < 0.2 && !g.colliders.blocked(x, z, g.terrain.getHeight(x, z) + 0.3) && g.terrain.waterDepth(x, z) <= 0) best = { x, z, s };
    }
  }
  if (!best) return null;
  h.setPosition(best.x, best.z, 0);
  const hooves = [];
  K.step(30, (i) => {
    A.steer(0, 1, 0.3);
    if (i > 10) hooves.push(K.hooves());
  });
  K.side(h, 5, 1.2, 0);
  K.render();
  return { ...best, hooves, st: K.state() };
});
if (slope) await shot('11-pente');
if (PJL && slope) {
  const minPer = [0, 1, 2, 3].map((k) => Math.min(...slope.hooves.map((h) => h[k])));
  check('PJ-05b', `pente ${(slope.s * 100).toFixed(0)} % au pas : sabots près du sol`, minPer.every((v) => v > -0.12 && v < 0.2), minPer.join(' / '));
}
// ---------- PJ-06 descente animée
await E(() => {
  const g = window.__game, K = window.__K, h = g.player.horse;
  g.input.setVirtualMove(0, 0);
  K.step(40, () => (h.speed *= 0.8));
});
const dismountPress = await pressE();
const dismountFrames = await seqShots('12-descente');
const m6 = await st();
const penDown = Math.max(...dismountFrames.map((f) => f.pen || 0));
if (PJL) console.log('descente, pénétration par pas :', dismountFrames.map((f) => `${f.pen}${f.where ? `@${f.where.side}${f.where.seg}` : ''}`).join(' '));
check('PJ-06', 'descente animée (bouton ACTION) : à pied à côté du cheval' + (PJL ? ', jambes hors du corps WildMesh' : ''), dismountPress.active && m6.mode === 'foot' && (!PJL || penDown < 0.01), `${dismountPress.lab} ; ${dismountFrames.length} pas de 0,2 s${PJL ? ` ; pénétration max ${(penDown * 100).toFixed(1)} cm` : ''}`);
// ---------- PJ-08 mesures (avec / sans cheval WildMesh, même vue)
const perf = await E(async () => {
  const g = window.__game, K = window.__K, A = window.__auto;
  A.mount();
  K.step(40);
  const h = g.player.horse;
  const measure = () => {
    const ts = [];
    for (let i = 0; i < 40; i++) {
      const t = performance.now();
      K.step(1, () => { A.steer(-1, 0, 0.8); h.stamina = h.maxStamina; });
      K.side(h, 5.5, 1.3, 0);
      K.render();
      g.renderer.getContext().finish();
      ts.push(performance.now() - t);
    }
    ts.sort((a, b) => a - b);
    const info = g.renderer.info;
    return { msMedian: +ts[20].toFixed(1), msP90: +ts[36].toFixed(1), calls: info.render.calls, tris: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(0) : null };
  };
  const on = measure();
  const set = g.save.data.settings, prev = set.characters;
  set.characters = 'classic';
  g.realism.set('classic');
  K.step(3);
  const off = measure();
  g.realism.set(prev);
  K.step(3);
  return { on, off, pjlNow: g.realism.pjl?.size };
});
console.log('mesures (SwiftShader, CPU de la machine de test : ordre de grandeur, pas une cadence iPhone)', JSON.stringify(perf));
// ---------- PJ-06b côté droit (mur le long du flanc gauche, comme horse-mount.mjs HM-08d)
const mirror = await E(() => {
  const g = window.__game, K = window.__K, h = g.mainHorse, p = g.player;
  window.__auto.foot();
  K.step(20);
  h.setPosition(-120, 157.1, Math.PI / 2);
  h.ai = null;
  const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
  p.human.setPosition(h.pos.x - lx * 1.6, h.pos.z - lz * 1.6, h.heading + Math.PI);
  K.step(10);
  g.cam.snap?.(p.focus.pos, p.heading);
  return { side: p.horseMount._pickSide(h) };
});
const mPress = await pressE();
const mFrames = await seqShots('14-montee-droite');
await E(() => window.__K.step(30));
const dPress = await pressE();
const dFrames = await seqShots('15-descente-droite');
const penMirror = Math.max(...[...mFrames, ...dFrames].map((f) => f.pen || 0));
const m6b = await st();
check('PJ-06b', 'montée et descente par la droite (mur à gauche)' + (PJL ? ', jambes hors du corps WildMesh' : ''), mirror.side === -1 && mPress.active && dPress.active && m6b.mode === 'foot' && (!PJL || penMirror < 0.01), PJL ? `pénétration max ${(penMirror * 100).toFixed(1)} cm` : '');
// ---------- PJ-07 reprise
await E(() => window.__game.save.save?.());
await page.reload({ timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'title' || window.__game?.state === 'play', null, { timeout: 400000 });
const resumed = await E(async () => {
  const g = window.__game;
  if (g.state !== 'play') {
    const b = document.querySelector('[data-id="continue"]');
    b?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }
  for (let i = 0; i < 400 && g.state !== 'play'; i++) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 1500));
  return { state: g.state, pjl: g.realism?.pjl ? [...g.realism.pjl.keys()].map((h) => h.name) : null };
});
if (PJL) check('PJ-07', 'reprise : cheval WildMesh de nouveau affiché', resumed.state === 'play' && resumed.pjl?.includes('Comète'), JSON.stringify(resumed));
await page.waitForTimeout(1500);
await shot('13-reprise');
check('PJ-00', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ viewport: `${W}x${H}`, pjl: PJL, bootS, results, perf, logs, errors, mountFrames, gaits: { idle, walk, trot, canter, gallop, turnL, turnR }, jump, slope }, null, 1));
console.log(`${results.length - fails}/${results.length} ; journal :`, logs.join(' | ').slice(0, 900));
await browser.close();
process.exit(fails ? 1 : 0);
