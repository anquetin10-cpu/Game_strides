// Audit du cavalier monté sur le cheval WildMesh : mesures image par image (pas fixe de 1/30 s), mêmes scénarios et
// mêmes instants d'une version à l'autre, vidéos facultatives (profil et trois-quarts, une image par pas : vitesse
// réelle à 30 i/s, ralenti en réduisant la cadence). Rendu logiciel SwiftShader de Chromium : pas un iPhone.
// Les grandeurs sont des repères de développement (géométrie du squelette du jeu), pas des mesures biomécaniques.
//
// Mesures par image :
//  - articulations du cavalier (°, côté gauche / droit ; 180 = segment tendu) : hanche (buste – cuisse), genou
//    (cuisse – jambe), cheville (jambe – pied), coude (bras – avant-bras) ; buste : angle avec la verticale (> 0 en avant) ;
//  - assise : hauteur du bassin au-dessus de sa position assise dans la selle (m ; 0 = assis, > 0 = soulevé) ;
//  - contacts : pénétration des jambes, des mains et du buste dans le corps du cheval (m), longueur des étrivières
//    (porte-étrivière → étrier) et des rênes (mors → poing) ;
//  - continuité : plus grande rotation locale d'un os du cavalier en une image (°) et sa variation d'une image à
//    l'autre (à-coup, °) ; déplacement du bassin dans le repère de la selle (cm / image) ;
//  - cheval : temps du clip de saut, décollage des postérieurs (toeOff), réception des antérieurs (foreLand), sabots
//    les plus bas (antérieurs, postérieurs) au-dessus du sol ; cavalier : poids de la position d'obstacle (jumpK, rel).
//
// Usage : BASE=http://127.0.0.1:5174 [VIDEO=1] node tests/e2e/pjl/rider-audit.mjs <dossier> <allures|cso> [cas,…]
//   cso : cas « obstacle:vitesse:appel » (obstacles v110 o100 v140 o145 v160 o160 ; appel normal|tot|pres|loin).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'tests/e2e/out/rider-audit';
const MODE = process.argv[3] || 'allures';
const CASES = (process.argv[4] || (MODE === 'cso' ? 'v110:6.5:normal,o160:6.5:normal,o145:6.5:tot,v110:6.5:pres,v140:9:normal' : 'repos,pas,trot,galop-gauche,galop-droite,grand-galop,virage-gauche,virage-droite,arret,depart-galop,saut-galop,saut-grand-galop')).split(',');
const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const VIDEO = !!process.env.VIDEO;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${BASE}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const info = await E(async (MODE) => {
  const T = await import('/node_modules/three/build/three.module.js');
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  g.phone.notify = () => {};
  g.missions.timer = 1e6;
  g.sky.rain = 0;
  g.sky.wet = 0;
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
  document.querySelectorAll('#ui, #touch, .hud, .toast, .toasts').forEach((e) => (e.style.visibility = 'hidden'));
  // Toute l'interface masquée (cartes de mission comprises), sauf le rendu et les mesures incrustées.
  const st0 = document.createElement('style');
  st0.textContent = 'body > *:not(canvas):not(#__ov) { visibility: hidden !important; }';
  document.head.appendChild(st0);
  const ov = document.createElement('div');
  ov.id = '__ov';
  ov.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;font:11px/1.3 monospace;color:#fff;background:rgba(0,0,0,.55);padding:3px 5px;white-space:pre;pointer-events:none';
  document.body.appendChild(ov);
  const ray = new T.Raycaster();
  const DIRS = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((a) => new T.Vector3(...a));
  const K = (window.__K = { T });
  // Temps CPU de l'animation du cavalier (pose de monte) et de l'image entière, cumulés.
  const hu = g.player.human;
  const perf = (K.perf = { ride: 0, frame: 0, n: 0 });
  const orig = hu.animateRiding.bind(hu);
  hu.animateRiding = (dt) => { const t0 = performance.now(); orig(dt); perf.ride += performance.now() - t0; };
  K.step = (n, each) => {
    for (let i = 0; i < n; i++) {
      each?.(i);
      const t0 = performance.now();
      g.update(1 / 30);
      g.realism?.update();
      perf.frame += performance.now() - t0;
      perf.n++;
    }
  };
  const bodyOf = () => {
    let body = null;
    g.mainHorse.pjl.view.model.traverse((o) => o.isSkinnedMesh && o.material?.name === 'horse_body' && (body = o));
    return body;
  };
  const depth = (q, body) => {
    let d = 9;
    for (const dir of DIRS) {
      ray.set(q, dir); ray.far = 1.5;
      const hit = ray.intersectObject(body, false)[0];
      if (!hit) return 0;
      d = Math.min(d, hit.distance);
    }
    return d;
  };
  const W = (n) => hu.bones[n].getWorldPosition(new T.Vector3());
  const ang = (o, a, b) => {
    const u = a.clone().sub(o).normalize(), v = b.clone().sub(o).normalize();
    return (Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180) / Math.PI;
  };
  const NAMES = ['hips', 'spine', 'chest', 'neck', 'head', 'lClav', 'lArm', 'lFore', 'lHand', 'rClav', 'rArm', 'rFore', 'rHand', 'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot'];
  const prevQ = {};
  let prevW = null, prevHips = null;
  K.resetCont = () => { for (const n of NAMES) delete prevQ[n]; prevW = null; prevHips = null; };
  // pen : nombre de points de jambe mesurés (0 = pas de mesure de pénétration à cette image, coûteuse).
  K.measure = (withPen = true) => {
    const h = g.mainHorse, P = h.pjl, V = P.view, body = bodyOf(), info = hu.model.rig;
    hu.mesh.updateWorldMatrix(true, true);
    P.holder.updateMatrixWorld(true);
    const q = new T.Quaternion();
    P.holder.getWorldQuaternion(q);
    const fw = new T.Vector3(0, 0, 1).applyQuaternion(q), lat = new T.Vector3(1, 0, 0).applyQuaternion(q);
    const r = {};
    // Articulations.
    const neck = W('neck'), hips = W('hips');
    for (const s of ['l', 'r']) {
      const hp = W(s + 'Thigh'), kn = W(s + 'Shin'), an = W(s + 'Foot'), to = W(s + 'Toe');
      r['hanche' + s.toUpperCase()] = Math.round(ang(hp, neck, kn));
      r['genou' + s.toUpperCase()] = Math.round(ang(kn, hp, an));
      r['cheville' + s.toUpperCase()] = Math.round(ang(an, kn, to));
      // Ouverture du genou : direction du genou autour de l'axe hanche – cheville (° ; 0 = vers l'avant, > 0 vers
      // l'extérieur du côté de la jambe).
      const ax = an.clone().sub(hp).normalize(), kd = kn.clone().sub(hp);
      kd.addScaledVector(ax, -kd.dot(ax));
      r['ouvGenou' + s.toUpperCase()] = Math.round((Math.atan2(kd.dot(lat) * (s === 'l' ? 1 : -1), kd.dot(fw)) * 180) / Math.PI);
      const sh = W(s + 'Arm'), el = W(s + 'Fore'), wr = W(s + 'Hand');
      r['coude' + s.toUpperCase()] = Math.round(ang(el, sh, wr));
    }
    const tr = neck.clone().sub(hips);
    r.buste = Math.round((Math.atan2(tr.dot(fw), tr.y) * 180) / Math.PI);
    const hd = W('head').sub(neck);
    r.tete = Math.round((Math.atan2(hd.dot(fw), hd.y) * 180) / Math.PI);
    // Assise : bassin au-dessus de sa position assise (repère du personnage, à l'échelle).
    r.assise = +((hu.bones.hips.position.y - info.seatToHips) * hu.scale).toFixed(3);
    r.bassinAv = +(hu.bones.hips.position.z * hu.scale).toFixed(3);
    // Contacts.
    if (withPen && body) {
      let pen = 0, penAt = null;
      for (const s of ['l', 'r']) {
        const ch = ['Thigh', 'Shin', 'Foot', 'Toe'].map((n) => W(s + n));
        for (let k = 0; k < 3; k++) for (const t of [0.25, 0.5, 0.75, 1]) {
          const d = depth(ch[k].clone().lerp(ch[k + 1], t), body);
          if (d > pen) (pen = d), (penAt = s + ['cuisse', 'jambe', 'pied'][k]);
        }
        for (const [a, b, lab] of [['Fore', 'Hand', 'avant-bras'], ['Hand', 'Fing', 'main']]) {
          const pa = W(s + a), pb = W(s + b);
          for (const t of [0.5, 1]) { const d = depth(pa.clone().lerp(pb, t), body); if (d > pen) (pen = d), (penAt = s + lab); }
        }
      }
      for (const [a, b] of [['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck']]) {
        const pa = W(a), pb = W(b);
        for (const t of [0, 0.5, 1]) { const d = depth(pa.clone().lerp(pb, t), body); if (d > pen) (pen = d), (penAt = 'buste'); }
      }
      r.pen = +pen.toFixed(3);
      r.penAt = penAt;
    }
    const hands = hu.getHandWorldPositions(new T.Vector3(), new T.Vector3());
    ['L', 'R'].forEach((S, k) => {
      const bar = V.anchorWorld('bar' + S, new T.Vector3());
      const iron = P.irons?.[k]?.position;
      if (iron) r['etriviere' + S] = +bar.distanceTo(iron.clone().setY(iron.y + 0.115)).toFixed(3);
      // Pied – étrier : de la plante (os des orteils, comme Horse._stirrupsFollow) à l'étrier affiché (m).
      if (iron) r['piedEtrier' + S] = +W((k ? 'r' : 'l') + 'Toe').distanceTo(iron).toFixed(3);
      const bit = V.anchorWorld('bit' + S, new T.Vector3());
      r['rene' + S] = +bit.distanceTo(hands[k]).toFixed(3);
    });
    // Continuité : rotations locales des os du cavalier d'une image à l'autre.
    let wMax = 0, wAt = null, jerk = 0;
    const cur = {};
    for (const n of NAMES) {
      const b = hu.bones[n];
      if (!b) continue;
      const pq = prevQ[n];
      if (pq) {
        const w = (2 * Math.acos(Math.min(1, Math.abs(pq.dot(b.quaternion)))) * 180) / Math.PI;
        cur[n] = w;
        if (w > wMax) (wMax = w), (wAt = n);
        if (prevW && prevW[n] !== undefined) jerk = Math.max(jerk, Math.abs(w - prevW[n]));
      }
      prevQ[n] = (prevQ[n] || new T.Quaternion()).copy(b.quaternion);
    }
    prevW = cur;
    r.rotMax = +wMax.toFixed(1);
    r.rotOs = wAt;
    r.acoup = +jerk.toFixed(1);
    const hp = hu.bones.hips.position.clone().multiplyScalar(hu.scale);
    r.bassinV = prevHips ? +(hp.distanceTo(prevHips) * 100).toFixed(1) : 0;
    prevHips = hp;
    // Cheval.
    const jm = h.speed > 8 ? 'jump_gallop' : 'jump_canter';
    const J = P.asset.jumps.get(jm) || P.asset.jumps.get('jump_gallop');
    r.jumpT = +h.jumpT.toFixed(3);
    r.clipT = +(V.jumpTime || 0).toFixed(3);
    r.toeOff = J ? +J.toeOff.toFixed(3) : null;
    r.foreLand = J ? +J.foreLand.toFixed(3) : null;
    const hv = ['fingers_02_l', 'fingers_02_r', 'toes_02_l', 'toes_02_r'].map((n) => { const p = V.boneWorld(n, new T.Vector3()); return p.y - h.groundAt(p.x, p.z); });
    r.antBas = +Math.min(hv[0], hv[1]).toFixed(3);
    r.postBas = +Math.min(hv[2], hv[3]).toFixed(3);
    const Rr = hu.anim._ride || {};
    r.jumpK = +(Rr.jumpK || 0).toFixed(2);
    r.rel = +(Rr.rel || 0).toFixed(2);
    r.two = +(Rr.two || 0).toFixed(2);
    r.speed = +h.speed.toFixed(2);
    r.gait = h.anim._a?.gait;
    r.lead = h.anim._a?.lead;
    r.mode = P._s?.mode;
    return r;
  };
  K.overlay = (label, r, t) => {
    document.getElementById('__ov').textContent = `${label}   t = ${t >= 0 ? '+' : ''}${t.toFixed(2)} s   ${r.mode || ''} τ=${r.jumpT >= 0 ? r.jumpT.toFixed(2) : '—'}\n` +
      `buste ${r.buste}°  hanche ${r.hancheL}/${r.hancheR}°  genou ${r.genouL}/${r.genouR}°  cheville ${r.chevilleL}/${r.chevilleR}°  coude ${r.coudeL}/${r.coudeR}°\n` +
      `assise ${r.assise >= 0 ? '+' : ''}${r.assise.toFixed(3)} m  pénétration ${r.pen !== undefined ? r.pen.toFixed(3) : '—'} m  rot. max ${r.rotMax}° (${r.rotOs || '—'})\n` +
      `sabots les plus bas : ant. ${r.antBas.toFixed(2)} m  post. ${r.postBas.toFixed(2)} m   cavalier : obstacle ${r.jumpK}  main rendue ${r.rel}`;
  };
  K.cam = (eye, tgt, fov = 40) => {
    const h = g.mainHorse, c = Math.cos(h.heading), s = Math.sin(h.heading), y = h.pos.y;
    const Wp = (p) => [h.pos.x + c * p[0] + s * p[2], y + p[1], h.pos.z - s * p[0] + c * p[2]];
    g.camera.position.set(...Wp(eye)); g.camera.fov = fov; g.camera.updateProjectionMatrix();
    g.camera.lookAt(...Wp(tgt)); g.camera.updateMatrixWorld();
    g.sky.follow(g.camera);
    g.world.update(1 / 30, g.camera, g.sky, g.player.focus.pos);
    g.renderer.render(g.scene, g.camera);
  };
  // Profil (côté gauche) et trois-quarts avant gauche, centrés sur le cavalier.
  K.VIEW = { profil: [[5.2, 1.9, 0.2], [0, 1.85, 0.2]], troisquarts: [[3.6, 2.3, 3.8], [0, 1.8, 0.1]] };
  const h = g.mainHorse;
  A.foot();
  if (MODE === 'allures') {
    h.setPosition(160, g.terrain.waterlineZ(160) + 8, -Math.PI / 2);
    window.__zAt = (x) => g.terrain.waterlineZ(x) + 8;
  } else {
    const W0 = (await import('/src/world/sites.js')).POLE.warmup;
    h.setPosition(W0.x + 6, W0.z, Math.PI / 2);
  }
  h.inBox = false; h.ai = null;
  const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
  hu.setPosition(h.pos.x + lx * 1.4, h.pos.z + lz * 1.4, h.heading + Math.PI);
  K.step(10);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  K.step(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
  for (let i = 0; i < 200 && g.player.horseMount.active; i++) K.step(1);
  K.step(20);
  return { sex: hu.sex, scale: hu.scale, outfit: hu.model.desc.parts ? Object.keys(hu.model.desc.parts) : null, rig: hu.model.rig, fit: hu._fit && Object.fromEntries(Object.entries(hu._fit).filter(([, v]) => !Array.isArray(v))), mounted: !!hu.mounted, horseScale: h.pjl?.view?.model?.scale?.x };
}, MODE);
console.log('cavalier', JSON.stringify(info));

// ---------- Préparation CSO (mêmes obstacles et mêmes distances d'appel que bars-check.mjs) ----------
if (MODE === 'cso') {
  await E(async () => {
    const g = window.__game, A = window.__auto, h = g.player.horse;
    g.activities.start(g.activities.defs.find((a) => a.id === 'cso_warmup'));
    A.tick(6); A.closeCards(); A.tick(20); A.closeCards();
    for (let k = 0; k < 120 && g.course?.controls !== 'cso'; k++) { A.tick(1); A.closeCards(); }
    h.mods.jump = 0.45;
    const JM = await import('/src/gameplay/jumpModel.js');
    const W0 = (await import('/src/world/sites.js')).POLE.warmup;
    const specs = [
      { id: 'v110', kind: 'v', h: 1.1 }, { id: 'o100', kind: 'o', h: 1.0, spread: 1.2 },
      { id: 'v140', kind: 'v', h: 1.4 }, { id: 'o145', kind: 'o', h: 1.45, spread: 1.4 },
      { id: 'v160', kind: 'v', h: 1.6 }, { id: 'o160', kind: 'o', h: 1.6, spread: 1.6 },
    ];
    const lane = (x, z) => {
      for (let s = -16; s <= 10; s += 0.5) for (const u of [-1.5, 0, 1.5]) {
        const px = x + s, pz = z + u;
        if (g.colliders.blocked(px, pz, g.terrain.getHeight(px, pz) + 0.3)) return false;
      }
      return true;
    };
    const spots = [];
    for (let x = W0.x + 60; x < W0.x + 160 && spots.length < specs.length; x += 26) {
      for (let z = W0.z - 60; z < W0.z + 80 && spots.length < specs.length; z += 14) if (lane(x, z)) spots.push({ x, z });
    }
    const obs = specs.map((sp, i) => g.obstacles.add({ x: spots[i].x, z: spots[i].z, rot: Math.PI / 2, kind: sp.kind, h: sp.h, spread: sp.spread, w: 3.6, course: 'warmup', id: 'test_' + sp.id }));
    window.__T = { JM, obs, specs };
  });
}

const all = { base: BASE, mode: MODE, cavalier: info, cases: {} };
const film = async (dir, k) => {
  for (const v of ['profil', 'troisquarts']) {
    await E((v) => window.__K.cam(...window.__K.VIEW[v]), v);
    mkdirSync(join(OUT, `${dir}-${v}`), { recursive: true });
    await page.screenshot({ path: join(OUT, `${dir}-${v}`, `${String(k).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 84, timeout: 240000 });
  }
};

for (const name of CASES) {
  const rows = [];
  if (MODE === 'allures') {
    // Allures : cap le long du rivage ou cercle ; transitions ; saut en terrain libre.
    const plan = {
      repos: { mag: 0, n: 45 }, pas: { mag: 0.3, n: 75 }, trot: { mag: 0.5, n: 75 },
      'galop-gauche': { mag: 0.8, n: 80, turn: 0.35 }, 'galop-droite': { mag: 0.8, n: 80, turn: -0.35 },
      'grand-galop': { mag: 1, n: 80, gallop: true }, 'virage-gauche': { mag: 0.8, n: 60, turn: 1 }, 'virage-droite': { mag: 0.8, n: 60, turn: -1 },
      arret: { mag: 0.8, n: 70, pre: 60, stop: true }, 'depart-galop': { mag: 0.8, n: 70, pre: 40, preMag: 0, start: true },
      'saut-galop': { mag: 0.8, n: 75, pre: 70, jump: true }, 'saut-grand-galop': { mag: 1, n: 75, pre: 90, gallop: true, jump: true },
    }[name];
    await E(([p]) => {
      const g = window.__game, A = window.__auto, K = window.__K, h = g.mainHorse;
      if (h.pos.x < 40) { h.setPosition(160, window.__zAt(160), -Math.PI / 2); K.step(5); }
      if (p.pre) K.step(p.pre, () => { const tx = h.pos.x - 12; A.steer(tx - h.pos.x, window.__zAt(tx) - h.pos.z, p.preMag ?? p.mag); if (p.gallop) g.input.held.add('gallop'); else g.input.held.delete('gallop'); h.stamina = h.maxStamina; });
      if (p.jump) h.control.jump = true;
      K.resetCont();
      K.perf.ride = 0; K.perf.frame = 0; K.perf.n = 0;
    }, [plan]);
    for (let f = 0; f < plan.n; f++) {
      const r = await E(([p, f, video]) => {
        const g = window.__game, A = window.__auto, K = window.__K, h = g.mainHorse;
        K.step(1, () => {
          const mag = p.stop ? 0 : p.mag;
          if (p.turn) A.steer(Math.sin(h.heading + p.turn * 0.9), Math.cos(h.heading + p.turn * 0.9), mag);
          else if (mag) { const tx = h.pos.x - 12; A.steer(tx - h.pos.x, window.__zAt(tx) - h.pos.z, mag); } else g.input.setVirtualMove(0, 0);
          if (p.gallop) g.input.held.add('gallop'); else g.input.held.delete('gallop');
          h.stamina = h.maxStamina;
        });
        // Pénétration (coûteuse) : chaque image pendant un saut et les filmées, une sur trois sinon.
        const r = K.measure(video || h.jumpT >= 0 || p.jump || f % 3 === 0);
        r.f = f;
        K.overlay(p.label, r, f / 30);
        return r;
      }, [{ ...plan, label: name }, f, VIDEO]);
      rows.push(r);
      if (VIDEO) await film(name, f);
    }
  } else {
    const [id, vs, kind] = name.split(':');
    const v = +vs;
    const x = await E(([id, v, kind]) => {
      const g = window.__game, T = window.__T, h = g.player.horse;
      const o = T.obs[T.specs.findIndex((s) => s.id === id)];
      const st = { v, power: h.jumpPower, clearance: h.mods.clearance, cso: true };
      const rows = [];
      for (let x = 0.4; x <= 8; x += 0.02) {
        const first = Math.min(...o.bars.map((b) => b.s));
        const s = first - x;
        const p = T.JM.planJump(st, T.JM.railsAhead(o, o.x + o.n.x * s, o.z + o.n.z * s, o.n.x, o.n.z));
        rows.push({ x: +x.toFixed(2), zone: p.zone, margin: p.margin, gap: Math.abs(p.ideal - p.L) });
      }
      const good = rows.filter((r) => r.zone === 'good'), near = rows.filter((r) => r.zone === 'near'), far = rows.filter((r) => r.zone === 'far');
      return {
        normal: good.length ? good.reduce((a, b) => (b.gap < a.gap ? b : a)).x : null,
        tot: good.length ? Math.max(...good.map((r) => r.x)) : null,
        pres: near.length ? near[Math.floor(near.length / 2)].x : null,
        loin: far.find((r) => r.margin < -0.1)?.x ?? null,
      }[kind];
    }, [id, v, kind]);
    await E(([id, v, x]) => {
      const g = window.__game, T = window.__T, K = window.__K, h = g.player.horse;
      const o = T.obs[T.specs.findIndex((s) => s.id === id)];
      g.obstacles._rest(o);
      h._pass = null;
      const N = 40, first = Math.min(...o.bars.map((b) => b.s));
      const s0 = first - x - v * (1 / 30) * N - 0.4;
      h.setPosition(o.x + o.n.x * s0, o.z + o.n.z * s0, o.rot);
      h.ai = null; h.stamina = h.maxStamina; h._refusing = null; h._refusal = null; h._brake = 0; h._rearT = 0;
      window.__S = { f: 0, N, o, v, flew: false, landedAt: -1, ev: [] };
      const S = window.__S;
      const offs = [
        g.bus.on('obstacle:clear', (e) => e.obstacle === o && S.ev.push('sans faute')),
        g.bus.on('obstacle:fault', (e) => e.obstacle === o && S.ev.push('faute : ' + (e.causeText || e.cause))),
        g.bus.on('obstacle:refusal', (e) => e.obstacle === o && S.ev.push('refus')),
      ];
      S.off = () => offs.forEach((f) => f());
      K.resetCont();
      K.perf.ride = 0; K.perf.frame = 0; K.perf.n = 0;
    }, [id, v, x]);
    for (let k = 0; k < 200; k++) {
      const r = await E(([label, video]) => {
        const g = window.__game, A = window.__auto, K = window.__K, S = window.__S, h = g.player.horse, o = S.o;
        K.step(1, () => {
          if (S.f < S.N) h.speed = S.v;
          A.steer(o.n.x, o.n.z, 0.95);
          g.input.held.delete('gallop');
          if (S.f === S.N) g.input.pressed.add('jump');
        });
        S.f++;
        if (h.jumpT >= 0) S.flew = true;
        if (S.flew && S.landedAt < 0 && h.jumpT < 0) S.landedAt = S.f;
        const r = K.measure(video || S.f >= S.N - 12);
        r.f = S.f;
        r.tAppel = +((S.f - S.N) / 30).toFixed(3);
        const sNow = (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
        r.done = S.flew && S.landedAt >= 0 && S.f > S.landedAt + 30 && sNow > 5;
        r.film = S.f >= S.N - 20;
        r.ev = S.ev.join(', ');
        K.overlay(label + (r.ev ? '   ' + r.ev : ''), r, r.tAppel);
        return r;
      }, [`${name} (appel à ${x} m)`, VIDEO]);
      rows.push(r);
      if (VIDEO && r.film) await film(name.replace(/:/g, '-'), r.f);
      if (r.done) break;
    }
    await E(() => { window.__S.off(); window.__auto.releaseInput(); });
    rows.appel = x;
  }
  const p = await E(() => ({ ...window.__K.perf }));
  // Synthèse : extrêmes, continuité, contacts ; saut : alignement des phases du cavalier sur celles du cheval.
  // CSO : synthèse sur la fenêtre de l'appel (20 images avant), sans la mise en place téléportée du départ.
  const win = MODE === 'cso' ? rows.filter((r) => r.film) : rows;
  const num = (k) => win.map((r) => r[k]).filter((x) => typeof x === 'number');
  const mx = (k) => Math.max(...num(k)), mn = (k) => Math.min(...num(k));
  const sum = {
    images: rows.length, allure: rows[rows.length - 1].gait, pied: rows[rows.length - 1].lead,
    busteMin: mn('buste'), busteMax: mx('buste'), hancheMin: Math.min(mn('hancheL'), mn('hancheR')), genouMin: Math.min(mn('genouL'), mn('genouR')), genouMax: Math.max(mx('genouL'), mx('genouR')),
    chevilleMin: Math.min(mn('chevilleL'), mn('chevilleR')), chevilleMax: Math.max(mx('chevilleL'), mx('chevilleR')), coudeMin: Math.min(mn('coudeL'), mn('coudeR')), coudeMax: Math.max(mx('coudeL'), mx('coudeR')),
    assiseMin: mn('assise'), assiseMax: mx('assise'), penMax: num('pen').length ? mx('pen') : null, penAt: win.reduce((a, r) => ((r.pen || 0) > (a.pen || 0) ? r : a), {}).penAt || null,
    rotMax: mx('rotMax'), rotOs: win.reduce((a, r) => (r.rotMax > a.rotMax ? r : a), { rotMax: -1 }).rotOs, acoupMax: mx('acoup'), bassinVMax: mx('bassinV'),
    etriviereEcart: +(Math.max(mx('etriviereL') - mn('etriviereL'), mx('etriviereR') - mn('etriviereR'))).toFixed(3),
    piedEtrierMax: Math.max(mx('piedEtrierL'), mx('piedEtrierR')),
    reneMin: Math.min(mn('reneL'), mn('reneR')), reneMax: Math.max(mx('reneL'), mx('reneR')),
    cpuCavalierMs: p.n ? +(p.ride / p.n).toFixed(3) : null, cpuImageMs: p.n ? +(p.frame / p.n).toFixed(2) : null,
  };
  const air = rows.filter((r) => r.jumpT >= 0);
  if (air.length) {
    const i0 = rows.indexOf(air[0]), i1 = rows.indexOf(air[air.length - 1]);
    const at = (pred) => { const r = rows.find(pred); return r ? r.f : null; };
    sum.saut = {
      imageAppel: rows[i0].f, imageReceptionJeu: rows[i1 + 1]?.f ?? null,
      // Phases visibles du cheval (clip) et du cavalier, en images.
      postDecollent: at((r) => r.jumpT >= 0 && r.clipT >= 0 && r.postBas > 0.05),
      antPosent: at((r, i) => rows.indexOf(r) > i0 + 3 && r.antBas < 0.06),
      postPosent: at((r) => rows.indexOf(r) > i1 && r.postBas < 0.1),
      cavalierObstacle50: at((r) => r.jumpK >= 0.5), cavalierObstacleMax: rows.reduce((a, r) => (r.jumpK > a.jumpK ? r : a), rows[0]).f,
      cavalierRetour50: at((r) => rows.indexOf(r) > rows.findIndex((x) => x.jumpK >= 0.5) && r.jumpK < 0.5),
      cavalierRetour10: at((r) => rows.indexOf(r) > rows.findIndex((x) => x.jumpK >= 0.5) && r.jumpK < 0.1),
      busteSommet: rows[Math.round((i0 + i1) / 2)].buste, assiseSommet: rows[Math.round((i0 + i1) / 2)].assise,
      evenements: rows[rows.length - 1].ev || null,
    };
  }
  all.cases[name] = { sum, rows, appel: rows.appel };
  console.log(name, JSON.stringify(sum));
}
all.errors = errors;
writeFileSync(join(OUT, `audit-${MODE}.json`), JSON.stringify(all, null, 1));
console.log('erreurs', errors.slice(0, 3));
await browser.close();
