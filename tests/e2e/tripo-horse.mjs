// Essai du cheval Tripo (trial/horse_tripo.glb) dans le jeu, SANS remplacer le cheval actuel (mode développement,
// `?tripohorse`). Rendu logiciel SwiftShader, écran d'iPhone 13 en paysage émulé : pas un essai sur iPhone réel.
//  A. vues au repos réellement rendues par le jeu (profil gauche/droit, face, trois-quarts avant/arrière), cheval non
//     sellé, comparées au cheval procédural (classique) et au cheval réaliste actuel ;
//  B. allures montées (pas, trot, galop, grand galop) : allure et vitesse, contact des sabots du modèle avec le sol ;
//  C. sauts sur la carrière d'échauffement du Pôle ;
//  D. épreuve de CSO complète (Pôle International) jouée avec les commandes normales (cavalier automatique de
//     cso-rider.js, sans téléportation pendant la manche) ;
//  E. mesures : triangles, appels de dessin, coût de la recopie de pose, taille du fichier ;
// Vidéos (15 images/s, image par image) : allures, sauts, épreuve. Sorties : tests/e2e/out/tripo-horse/.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/tripo-horse.mjs [--no-cso]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/tripo-horse';
const NO_CSO = process.argv.includes('--no-cso');
rmSync(OUT, { recursive: true, force: true });
for (const d of ['vues', 'allures', 'sauts', 'cso']) mkdirSync(`${OUT}/${d}`, { recursive: true });
let fails = 0;
const results = [];
const check = (id, label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${id} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  results.push({ id, label, ok: !!ok, extra });
  if (!ok) fails++;
};
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
const boot = await E(async () => {
  const g = window.__game, A = window.__auto;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 13 * 3600;
  g.sky.rain = 0; g.sky.wet = 0;
  g.realism.set('real');
  const t = A.tick;
  A.tick = (n = 1) => { for (let i = 0; i < n; i++) { t(1); g.realism.update(); } };
  window.__render = () => { g.sky.update(g.hour(), g.player.focus.pos, 0); g.sky.follow(g.camera); g.world.update(0, g.camera, g.sky); g.realism.update(); g.renderer.render(g.scene, g.camera); };
  const V = g.camera.position.constructor;
  window.__hoofW = (await import('/src/entities/horse/anim.js')).hoofWorldPosition;
  // Semelles du modèle Tripo (au-dessus du sol) et état d'appui des membres du cheval procédural.
  window.__soles = (h) => {
    const R = g.realism.horses.get(h);
    if (!R?.bones) return null;
    return ['flH', 'frH', 'hlH', 'hrH'].map((n, i) => {
      const b = R.bones[n];
      b.updateWorldMatrix(true, false);
      const v = new V(0, -0.075, 0.02).applyMatrix4(b.matrixWorld);
      // Semelle procédurale correspondante (référence de l'animation du jeu).
      const pr = window.__hoofW(h.bones, i, new V());
      // En appui : semelle procédurale au sol (le drapeau « locked » du membre reste vrai pendant un pas de recentrage).
      const ground = pr.y - g.terrain.getHeight(pr.x, pr.z);
      return { abs: v.y - g.terrain.getHeight(v.x, v.z), rel: v.y - pr.y, ground, locked: ground < 0.015 };
    });
  };
  // Caméra placée dans le repère du cheval (côté, hauteur, avant), visée (hauteur, avant).
  window.__cam = (h, s, u, f, ly, lf = 0) => {
    const L = { x: Math.cos(h.heading), z: -Math.sin(h.heading) }, F = h.forward;
    const gy = g.terrain.getHeight(h.pos.x, h.pos.z);
    g.camera.position.set(h.pos.x + L.x * s + F.x * f, gy + u, h.pos.z + L.z * s + F.z * f);
    g.camera.lookAt(h.pos.x + F.x * lf, gy + ly, h.pos.z + F.z * lf);
    g.camera.fov = window.__fov || g.camera.fov;
    g.camera.updateProjectionMatrix();
    g.camera.updateMatrixWorld();
  };
  const h = g.mainHorse;
  A.mount();
  h.setPosition(140, 200, 0); h.ai = null;
  for (let i = 0; i < 300 && !g.realism.horses.get(h)?.lods; i++) { A.tick(1); await new Promise((r) => setTimeout(r, 40)); }
  const R = g.realism.horses.get(h);
  const tris = (o) => { let n = 0; o?.traverse((m) => { if (m.isMesh && m.visible) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
  return { cls: R?.constructor?.name, model: g.realism.horseModel, lods: R?.lods?.map((m) => m.geometry.index.count / 3), bones: Object.keys(R?.bones || {}).length, layer: h.mesh.layers.mask, tris0: tris(R?.lods?.[0]) };
});
check('A0', 'cheval Tripo chargé et piloté par le cheval du jeu (TripoHorse, 50 os, 2 niveaux de détail)', boot.cls === 'TripoHorse' && boot.bones === 50 && boot.lods?.length === 2, JSON.stringify(boot));
check('A1', 'cheval du jeu conservé (masqué, toujours animé) : rien n’est remplacé', boot.layer === 2 ** 31, `calque ${boot.layer}`);

// ---------- A. Vues au repos (cheval non sellé), trois modèles ----------
const VUES = { 'profil-gauche': [4.6, 1.5, 0.2, 1.15, 0.2], 'profil-droit': [-4.6, 1.5, 0.2, 1.15, 0.2], face: [0.0, 1.55, 4.8, 1.2, 0.3], 'trois-quarts-avant': [3.4, 1.7, 3.2, 1.15, 0.3], 'trois-quarts-arriere': [3.0, 1.8, -3.6, 1.1, -0.2], tete: [1.3, 1.85, 2.1, 1.75, 1.3] };
const shot = async (dir, name) => page.screenshot({ path: `${OUT}/${dir}/${name}.jpg`, type: 'jpeg', quality: 88 });
const setModel = (m) => E(async (m) => {
  const g = window.__game, h = window.__test;
  for (const [hh, r] of g.realism.horses) { r.dispose(); g.realism.horses.delete(hh); }
  g.save.data.settings.horses = m === 'classique' ? 'classic' : 'real';
  g.realism.horseModel = m === 'tripo' ? 'horse_tripo' : 'horse';
  for (let i = 0; i < 300; i++) {
    window.__auto.tick(1);
    const r = g.realism.horses.get(h);
    if (m === 'classique' ? !r : r && r.constructor.name === (m === 'tripo' ? 'TripoHorse' : 'RealHorse')) break;
    await new Promise((r) => setTimeout(r, 40));
  }
  return g.realism.horses.get(h)?.constructor?.name || 'classique';
}, m);
await E(() => {
  const g = window.__game, A = window.__auto;
  A.foot();
  g.mainHorse.setPosition(150, 160, 0);
  const h = (window.__test = g.spawnHorse({ id: 'essai_tripo', name: 'Essai', coat: 'chestnut' }, 140, 215, 0, { saddle: false }));
  h.ai = null; h.speed = 0;
  g.player.human.setPosition(132, 205, 0);
  A.tick(30);
});
await E(() => { window.__fov0 = window.__game.camera.fov; window.__fov = 30; });
const vueRes = {};
for (const m of ['tripo', 'classique', 'realiste']) {
  vueRes[m] = await setModel(m);
  await E(() => window.__auto.tick(4));
  for (const [k, v] of Object.entries(VUES)) {
    await E(([v]) => { window.__cam(window.__test, ...v); window.__render(); }, [v]);
    await shot('vues', `${m}-${k}`);
  }
}
await E(() => { window.__fov = window.__fov0; });
check('A2', 'vues au repos rendues pour le Tripo, le cheval du jeu et le cheval réaliste actuel', vueRes.tripo === 'TripoHorse' && vueRes.classique === 'classique' && vueRes.realiste === 'RealHorse', JSON.stringify(vueRes));
await setModel('tripo');
// Repos : les quatre semelles du modèle au sol (± 4 cm).
const rest = await E(() => { window.__auto.tick(150); return window.__soles(window.__test).map((s) => ({ sol: +s.abs.toFixed(3), ecart: +s.rel.toFixed(3), proc: +s.ground.toFixed(3), appui: s.locked })); });
check('A3', 'au repos, chaque sabot du Tripo suit le sabot du cheval du jeu (±3 cm) ; sabots en appui au sol (±4 cm)', rest.every((s) => Math.abs(s.ecart) < 0.03 && (!s.appui || Math.abs(s.sol) < 0.04)), JSON.stringify(rest));
await E(() => { const g = window.__game; g.despawn(window.__test); window.__test = null; });

// ---------- B. Allures montées ----------
let vf = 0;
const frame = async (dir) => {
  await E(() => { const h = window.__game.mainHorse; window.__cam(h, 4.2, 1.5, 0.2, 1.15, 0.2); window.__render(); });
  await page.screenshot({ path: `${OUT}/${dir}/${String(vf++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 84 });
};
await E(() => { const g = window.__game, A = window.__auto; A.mount(); const h = g.mainHorse; h.setPosition(140, 200, 0); g.cam.yaw = Math.PI; A.tick(10); });
const GAITS = [['pas', 0.3, false, 1], ['trot', 0.5, false, 2], ['galop', 0.95, false, 3], ['grand-galop', 1, true, 4]];
const gaitRes = {};
for (const [name, mag, gallop, want] of GAITS) {
  const r = await E(([mag, gallop]) => {
    const g = window.__game, A = window.__auto, h = g.mainHorse;
    if (h.pos.z > 250) h.setPosition(140, 200, 0);
    // Endurance pleine (le grand galop est refusé à un cheval épuisé par les allures précédentes).
    h.stamina = h.maxStamina; h.exhausted = false;
    for (let i = 0; i < 70; i++) { A.steer(0, 1, mag); if (gallop) g.input.held.add('gallop'); else g.input.held.delete('gallop'); A.tick(1); }
    return { gait: h.gait, sp: +h.speed.toFixed(2) };
  }, [mag, gallop]);
  let minY = 9, stanceErr = 0, n = 0, relErr = 0;
  for (let k = 0; k < 45; k++) {
    const s = await E(([mag, gallop]) => {
      const g = window.__game, A = window.__auto, h = g.mainHorse;
      if (h.pos.z > 290) { const sp = h.speed; h.setPosition(140, 200, 0); h.speed = sp; }
      h.stamina = Math.max(h.stamina, h.maxStamina * 0.5);
      for (let i = 0; i < 2; i++) { A.steer(0, 1, mag); if (gallop) g.input.held.add('gallop'); A.tick(1); }
      return window.__soles(h);
    }, [mag, gallop]);
    for (const x of s) { minY = Math.min(minY, x.abs); relErr = Math.max(relErr, Math.abs(x.rel)); if (x.locked) { stanceErr = Math.max(stanceErr, Math.abs(x.abs)); n++; } }
    await frame('allures');
  }
  await E(() => window.__game.input.held.delete('gallop'));
  gaitRes[name] = { ...r, minSole: +minY.toFixed(3), stanceErr: +stanceErr.toFixed(3), stanceSamples: n, maxEcartSabotJeu: +relErr.toFixed(3) };
  check(`B-${name}`, `${name} : allure ${want}, aucun sabot sous le sol (≥ −3 cm), chaque sabot suit celui du cheval du jeu (≤ 4 cm)`, r.gait === want && minY > -0.03 && relErr < 0.04, JSON.stringify(gaitRes[name]));
}
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${OUT}/allures/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', `${OUT}/allures.mp4`]);

// ---------- C. Sauts (carrière d'échauffement du Pôle) ----------
vf = 0;
const jumps = await E(async () => {
  const g = window.__game, A = window.__auto;
  const os = (g.obstacles.ofCourse?.('warmup') || g.obstacles.list.filter((o) => /warm|ech/i.test(o.course || ''))).slice(0, 3);
  const ev = [];
  const off = [g.bus.on('obstacle:clear', (e) => ev.push(`clear:${e.obstacle.label}`)), g.bus.on('obstacle:fault', (e) => ev.push(`fault:${e.obstacle.label}`)), g.bus.on('horse:jump', () => ev.push('jump'))];
  window.__jumpEv = ev;
  return { n: os.length, labels: os.map((o) => o.label) };
});
let jumped = 0;
for (let i = 0; i < jumps.n; i++) {
  // Approche de l'obstacle i (le pilote place le cheval 11 m avant, galop de concours), image par image.
  const ok = await E(async (i) => {
    const g = window.__game, A = window.__auto;
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
    return true;
  }, i);
  if (!ok) continue;
  // Même appel que le pilote (autopilot.jumpObstacle) : au cœur de la bonne zone.
  for (let k = 0; k < 90; k++) {
    const st = await E(() => {
      const g = window.__game, A = window.__auto, h = g.player.horse, o = window.__jo;
      h.ai = null;
      A.steer(o.n.x, o.n.z, 0.95);
      const tg = g.obstacles.target(h);
      if (!window.__jumped && tg && tg.o === o && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) {
        g.input.pressed.add('jump');
        window.__jumped = true;
      }
      A.tick(1);
      const s2 = (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
      return { done: window.__jumped && h.jumpT < 0 && s2 > 4 };
    });
    if (k % 2 === 0) await frame('sauts');
    if (st.done) break;
  }
  await E(() => window.__auto.releaseInput());
}
const jev = await E(() => window.__jumpEv);
jumped = jev.filter((e) => e === 'jump').length;
check('C1', 'sauts du Tripo sur la carrière d’échauffement (appel, suspension, réception)', jumped >= 2, JSON.stringify(jev));
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${OUT}/sauts/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', `${OUT}/sauts.mp4`]);

// ---------- D. Épreuve de CSO complète ----------
let cso = null;
if (!NO_CSO) {
  vf = 0;
  const setup = await E(async () => {
    const g = window.__game, A = window.__auto;
    const O = await import('/src/gameplay/obstacles.js');
    const Cc = await import('/src/gameplay/csoCourse.js');
    const Si = await import('/src/world/sites.js');
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
    const M = (window.__m = { teleports: 0, jumps: 0, presses: 0, ev: [], minSole: 9, tripo: 0, frames: 0 });
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
      if (R?.constructor?.name === 'TripoHorse') M.tripo++;
      M.frames++;
      const s = window.__soles(h);
      if (s && h.jumpT < 0) for (const q of s) M.minSole = Math.min(M.minSole, q.abs);
    }, [dec.x, dec.y, dec.jump]);
    if (n % 2 === 1) {
      await E(() => window.__render());
      await page.screenshot({ path: `${OUT}/cso/${String(vf++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 82 });
    }
  }
  for (let i = 0; i < 30; i++) { await E(() => window.__auto.tick(2)); await E(() => window.__render()); await page.screenshot({ path: `${OUT}/cso/${String(vf++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 82 }); }
  cso = await E(() => { const M = window.__m, st = window.__lastCourse; return { st: st ? { t: st.t, faults: st.faults, refusals: st.refusals, finished: st.finished, eliminated: st.eliminated } : null, teleports: M.teleports, jumps: M.jumps, presses: M.presses, ev: M.ev, minSole: +M.minSole.toFixed(3), tripoFrames: M.tripo, frames: M.frames }; });
  check('D1', 'épreuve de CSO terminée avec le Tripo, sans élimination', cso.st?.finished && !cso.st?.eliminated, JSON.stringify(cso.st));
  check('D2', 'manche jouée avec le Tripo de bout en bout, sans téléportation', cso.tripoFrames === cso.frames && cso.teleports === 0, `${cso.tripoFrames}/${cso.frames} images, ${cso.teleports} téléportation`);
  check('D3', 'sabots du Tripo jamais sous le sol pendant la manche (hors sauts, ≥ −3 cm)', cso.minSole > -0.03, String(cso.minSole));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '15', '-i', `${OUT}/cso/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', `${OUT}/cso.mp4`]);
}

// ---------- E. Mesures ----------
const perf = await E(async () => {
  const g = window.__game, h = g.player.horse, R = g.realism.horses.get(h);
  g.renderer.info.autoReset = false;
  const meas = (on) => {
    R.setActive(on);
    g.renderer.info.reset();
    window.__cam(h, 4.2, 1.5, 0.2, 1.15, 0.2);
    window.__render();
    const r = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
    return r;
  };
  const withT = meas(true), without = meas(false);
  R.setActive(true);
  g.renderer.info.autoReset = true;
  // Coût de la recopie de pose (moyenne sur 300 appels).
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) R.update();
  const updMs = (performance.now() - t0) / 300;
  // Niveau de détail : au-delà de 25 m.
  const L = { x: Math.cos(h.heading), z: -Math.sin(h.heading) };
  g.camera.position.set(h.pos.x + L.x * 40, h.pos.y + 3, h.pos.z + L.z * 40);
  R.update();
  const far = { lod0: R.lods[0].visible, lod1: R.lods[1].visible };
  const tex = [];
  R.root.traverse((o) => { if (o.isMesh) for (const k of ['map', 'normalMap', 'roughnessMap']) { const t = o.material[k]; if (t?.image && !tex.some((x) => x.k === k)) tex.push({ k, w: t.image.width, h: t.image.height }); } });
  const texMB = tex.reduce((a, t) => a + (t.w * t.h * 4 * 4) / 3 / 1048576, 0);
  return { withTripo: withT, classicOnly: without, updMs: +updMs.toFixed(3), far, tex, texMB: +texMB.toFixed(1), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null };
});
const glbBytes = statSync('trial/horse_tripo.glb').size;
check('E1', 'niveau de détail réduit au-delà de 25 m', perf.far.lod1 && !perf.far.lod0, JSON.stringify(perf.far));
check('E2', 'recopie de pose bon marché (< 1 ms par image en rendu logiciel)', perf.updMs < 1, `${perf.updMs} ms`);
check('E3', 'aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
const rapport = { boot, gaits: gaitRes, rest, jumps: jev, cso, perf, glbBytes, results, errors };
writeFileSync(`${OUT}/rapport.json`, JSON.stringify(rapport, null, 1));
console.log(JSON.stringify({ perf, glbBytes }));
console.log(fails ? `ÉCHECS : ${fails}` : 'CHEVAL TRIPO : ESSAI OK');
await browser.close();
process.exit(fails ? 1 : 0);
