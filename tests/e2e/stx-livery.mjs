// Habillage STX des carrosseries (src/partners/liveries.js, src/entities/livery.js) — rendu logiciel SwiftShader dans
// Chromium (Playwright), viewport iPhone 13 paysage émulé : ce n'est pas un iPhone réel.
// 1. configuration : STX en attente → habillage neutre sur les quatre emplacements (Scania et Master, deux flancs),
//    un seul maillage de décor par véhicule, accroché à la caisse, hors des pièces mobiles, matériau et texture partagés ;
// 2. placement : sommets du décor sur la face extérieure du panneau (plane), dans la zone utile configurée, sans
//    recouvrir aucune ouverture, vitre, charnière, feu ou pièce mobile (triangle par triangle, repère du véhicule) ;
// 3. accroché au véhicule : déplacement, conduite (le décor suit, immobile dans le repère de la caisse) ;
// 4. interactions intactes : rampe arrière et porte d'habitation du camion, pont latéral et porte arrière du van,
//    chargement / déchargement d'un cheval dans chacun (séquences accélérées) ;
// 5. mire de TEST (damier « TEST 1:1 » dessiné ici, jamais livrée dans le jeu) : même chemin que le logo officiel,
//    proportions conservées (1:1), lisible (non inversée) sur les deux flancs, puis retour à l'habillage neutre ;
// 6. coût : triangles et appels de dessin ajoutés, aucune reconstruction pendant le jeu.
// Captures dans tests/e2e/out/stx/ (livree-neutre-*, TEST-mire-*). Usage : BASE=http://127.0.0.1:5177 node tests/e2e/stx-livery.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'tests/e2e/out/stx';
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
// Rendu logiciel lent : une capture attend la fin des images déjà demandées au processeur graphique émulé.
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const E = (f, a) => page.evaluate(f, a);

await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  while (g.hud.dialogActive) g.hud.advanceDialog();
  g.missions.abandon?.();
  A.closeCards();
  g.missions.timer = 1e6;
  if (g.phone) g.phone.notify = () => {};
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 11 * 3600;
  if (g.weather) g.weather.force?.('clear');
  A.foot();
});

// ---------- Outils dans la page : repère de la caisse, sommets du décor, contrôle des ouvertures ----------
await page.addScriptTag({
  content: `(() => {
  const g = window.__game;
  const V3 = g.camera.position.constructor, M4 = g.camera.matrixWorld.constructor;
  const L = (window.__liv = {});
  L.keys = ['scania', 'master'];
  // Module du jeu tel qu'il est chargé (le serveur de développement peut suffixer l'adresse d'un module modifié) :
  // même instance que celle du jeu.
  L.mod = (path) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => new URL(n).pathname === path) || path;
    return import(url);
  };
  L.veh = (k) => (k === 'scania' ? g.truck : g.van);
  L.M = (k) => (k === 'scania' ? g.truck.model : g.van.M);
  L.livery = (k) => L.M(k).livery;
  L.body = (k) => L.M(k).body;
  L.group = (k) => L.M(k).root;
  L.area = (c) => ({ z0: c.panel.z[0] + c.margin, z1: c.panel.z[1] - c.margin, y0: c.panel.y[0] + c.margin, y1: c.panel.y[1] - c.margin });
  // Matrice objet → repère de la caisse.
  L.rel = (k, o) => {
    const b = L.body(k);
    L.group(k).updateMatrixWorld(true);
    return new M4().copy(b.matrixWorld).invert().multiply(o.matrixWorld);
  };
  L.decal = (k) => {
    const m = L.livery(k).mesh, M = L.rel(k, m), v = new V3();
    const P = m.geometry.attributes.position, U = m.geometry.attributes.uv, out = [];
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(M);
      out.push([v.x, v.y, v.z, U.getX(i), U.getY(i)]);
    }
    return out;
  };
  // Maillages d'un nom de la liste keepOut (maillage, nœud et descendants, pivot de portière découpée).
  L.meshesOf = (k, key) => {
    const res = [];
    L.group(k).traverse((o) => {
      if (!o.isMesh) return;
      for (let a = o; a; a = a.parent) {
        if (a.name === key || a.name === key + '_pivot' || (a === o && a.name.startsWith(key + '__'))) return res.push(o);
      }
    });
    return res;
  };
  const sat = (t, r) => {
    for (const [i, lo, hi] of [[0, r.z0, r.z1], [1, r.y0, r.y1]]) {
      if (Math.max(t[0][i], t[1][i], t[2][i]) <= lo || Math.min(t[0][i], t[1][i], t[2][i]) >= hi) return false;
    }
    const C = [[r.z0, r.y0], [r.z1, r.y0], [r.z0, r.y1], [r.z1, r.y1]];
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3], nz = a[1] - b[1], ny = b[0] - a[0];
      if (!nz && !ny) continue;
      const p = t.map((q) => q[0] * nz + q[1] * ny), c = C.map((q) => q[0] * nz + q[1] * ny);
      if (Math.max(...p) <= Math.min(...c) || Math.max(...c) <= Math.min(...p)) return false;
    }
    return true;
  };
  // Audit d'un véhicule : par emplacement, sommets du décor (repère de la caisse) et ouvertures voisines.
  L.audit = (k, clear = 0.03) => {
    const lv = L.livery(k), verts = L.decal(k), out = [];
    let stray = verts.length;
    for (const s of lv.slots) {
      const c = s.cfg, sx = c.side === 'left' ? 1 : -1, A = L.area(c);
      const vs = verts.filter((v) => Math.sign(v[0]) === sx);
      stray -= vs.length;
      let off0 = 1e9, off1 = -1e9, outside = 0;
      const r = { z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9 };
      let su = 0, sz = 0, szz = 0, suz = 0, sv = 0, sy = 0, syy = 0, svy = 0;
      for (const v of vs) {
        const off = sx * v[0] - c.plane;
        off0 = Math.min(off0, off);
        off1 = Math.max(off1, off);
        if (v[2] < A.z0 - 1e-3 || v[2] > A.z1 + 1e-3 || v[1] < A.y0 - 1e-3 || v[1] > A.y1 + 1e-3) outside++;
        r.z0 = Math.min(r.z0, v[2]); r.z1 = Math.max(r.z1, v[2]); r.y0 = Math.min(r.y0, v[1]); r.y1 = Math.max(r.y1, v[1]);
        su += v[3]; sz += v[2]; szz += v[2] * v[2]; suz += v[3] * v[2];
        sv += v[4]; sy += v[1]; syy += v[1] * v[1]; svy += v[4] * v[1];
      }
      const n = vs.length || 1;
      // Pentes du = f(z), dv = f(y) : sens de lecture et échelle (m par unité de texture).
      const dudz = (suz - (su * sz) / n) / (szz - (sz * sz) / n || 1);
      const dvdy = (svy - (sv * sy) / n) / (syy - (sy * sy) / n || 1);
      // Ouvertures et équipements à ne pas recouvrir (y compris une garde de \`clear\` m).
      const R = { z0: r.z0 - clear, z1: r.z1 + clear, y0: r.y0 - clear, y1: r.y1 + clear };
      const hits = [], near = {};
      const p = new V3();
      for (const key of c.keepOut) {
        for (const m of L.meshesOf(k, key)) {
          const M = L.rel(k, m), P = m.geometry.attributes.position, I = m.geometry.index;
          const cnt = I ? I.count : P.count;
          for (let t = 0; t < cnt; t += 3) {
            const tri = [];
            let outer = -1e9;
            for (let j = 0; j < 3; j++) {
              p.fromBufferAttribute(P, I ? I.getX(t + j) : t + j).applyMatrix4(M);
              outer = Math.max(outer, sx * p.x);
              tri.push([p.z, p.y]);
            }
            if (outer < c.plane - 0.02) continue; // à l'intérieur de la caisse
            const dz = Math.max(r.z0 - Math.max(tri[0][0], tri[1][0], tri[2][0]), Math.min(tri[0][0], tri[1][0], tri[2][0]) - r.z1, 0);
            const dy = Math.max(r.y0 - Math.max(tri[0][1], tri[1][1], tri[2][1]), Math.min(tri[0][1], tri[1][1], tri[2][1]) - r.y1, 0);
            const d = Math.hypot(dz, dy);
            if (near[key] === undefined || d < near[key]) near[key] = +d.toFixed(3);
            if (sat(tri, R)) hits.push(m.name);
          }
        }
      }
      out.push({ id: c.id, side: c.side, verts: vs.length, off: [+off0.toFixed(4), +off1.toFixed(4)], outside, rect: { z: [+r.z0.toFixed(3), +r.z1.toFixed(3)], y: [+r.y0.toFixed(3), +r.y1.toFixed(3)] }, w: r.z1 - r.z0, h: r.y1 - r.y0, dudz, dvdy, hits: [...new Set(hits)], near });
    }
    return { slots: out, stray };
  };
  // Mobile : le décor n'est sous aucune pièce mobile.
  L.ancestors = (k) => {
    const names = [];
    for (let o = L.livery(k).mesh.parent; o; o = o.parent) names.push(o.name || o.type);
    return names;
  };
  // Mire de TEST (jamais livrée dans le jeu) : damier 2:1 à cases carrées, cercle, « TEST 1:1 ».
  L.testPattern = () => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 512;
    const x = cv.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) {
      x.fillStyle = (i + j) % 2 ? '#e8e8e8' : '#d0168c';
      x.fillRect(i * 64, j * 64, 64, 64);
    }
    x.lineWidth = 14;
    x.strokeStyle = '#111';
    x.strokeRect(7, 7, 1010, 498);
    x.beginPath();
    x.arc(512, 256, 200, 0, Math.PI * 2);
    x.lineWidth = 10;
    x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.fillRect(250, 186, 524, 140);
    x.fillStyle = '#111';
    x.font = 'bold 112px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('TEST 1:1', 512, 260);
    x.font = 'bold 40px sans-serif';
    x.fillText('▲ HAUT', 130, 40);
    x.fillText('HAUT ▲', 894, 40);
    return cv;
  };
  // Vue (repère du véhicule), heure de jeu, bandeau d'identification de la capture.
  L.view = (k, cam, look, hour, label) => {
    const v = L.veh(k);
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + hour * 3600;
    g.hud.notifQueue.length = 0;
    g.hud.notifEl?.classList.add('hidden');
    for (const el of document.querySelectorAll('.toast')) el.remove();
    const pos = v.localToWorld(cam[0], cam[1], cam[2]), at = v.localToWorld(look[0], look[1], look[2]);
    g.cam.override = { pos, look: at };
    window.__auto.tick(3);
    g.camera.position.copy(pos);
    g.camera.lookAt(at);
    g.camera.updateMatrixWorld();
    let tag = document.getElementById('liv-tag');
    if (!tag) {
      tag = document.createElement('div');
      tag.id = 'liv-tag';
      tag.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;padding:4px 8px;font:600 11px/1.3 system-ui,sans-serif;color:#fff;pointer-events:none';
      document.body.appendChild(tag);
    }
    tag.textContent = label;
    // Interface du jeu masquée : la capture montre la carrosserie.
    for (const id of ['ui', 'touch']) document.getElementById(id)?.style.setProperty('visibility', 'hidden');
    tag.style.background = /TEST/.test(label) ? 'rgba(200,0,110,0.92)' : 'rgba(0,0,0,0.6)';
    g.renderer.render(g.scene, g.camera);
  };
  L.untag = () => {
    document.getElementById('liv-tag')?.remove();
    for (const id of ['ui', 'touch']) document.getElementById(id)?.style.removeProperty('visibility');
  };
})();`,
});

// ---------- 1. Configuration et habillage neutre ----------
let r = await E(async () => {
  const L = window.__liv, g = window.__game;
  const { BRANDS } = await L.mod('/src/partners/partners.js');
  const { STX_LIVERY } = await L.mod('/src/partners/liveries.js');
  const out = { status: BRANDS.stx.status, sideLogo: BRANDS.stx.assets.sideLogo, cfg: Object.fromEntries(Object.entries(STX_LIVERY.vehicles).map(([k, s]) => [k, s.map((x) => x.id)])) };
  for (const k of L.keys) {
    const lv = L.livery(k);
    let meshes = 0;
    L.group(k).traverse((o) => o.isMesh && o.name === 'stx_livery' && meshes++);
    let sceneMeshes = 0;
    g.scene.traverse((o) => o.isMesh && o.name === 'stx_livery' && sceneMeshes++);
    out[k] = {
      ok: !!lv, state: lv?.state(), meshes, sceneMeshes, visible: lv?.mesh.visible, model: lv?.key,
      inBody: (() => {
        for (let o = lv.mesh; o; o = o.parent) if (o === L.body(k)) return true;
        return false;
      })(),
      ancestors: L.ancestors(k),
      shadow: { cast: lv.mesh.castShadow, receive: lv.mesh.receiveShadow }, frustumCulled: lv.mesh.frustumCulled,
      mat: { name: lv.mesh.material.name, transparent: lv.mesh.material.transparent, alphaTest: lv.mesh.material.alphaTest, polygonOffset: lv.mesh.material.polygonOffset, colorSpace: lv.mesh.material.map?.colorSpace, map: lv.mesh.material.map?.image?.width + '×' + lv.mesh.material.map?.image?.height },
      tris: lv.mesh.geometry.attributes.position.count / 3,
    };
  }
  out.sharedMaterial = L.livery('scania').mesh.material === L.livery('master').mesh.material;
  // Lettrages « STX » d'origine des modèles fournis : présents, visibles, matériaux et textures du fichier.
  out.letters = [['scania', 'exterior__STX_capucine'], ['scania', 'exterior__Scania_lettering'], ['master', 'exterior__STX_cap'], ['master', 'exterior__STX_side_1'], ['master', 'exterior__STX_side_-1']].map(([k, n]) => {
    const o = L.M(k).model.getObjectByName(n);
    const im = o?.material?.map?.image;
    return { n, ok: !!o && o.visible && o.material.name === n.replace('exterior__', '') && !!im, size: im ? `${im.width}×${im.height}` : null };
  });
  return out;
});
check('STX en attente (statut « pending », pas de fichier officiel)', r.status === 'pending' && r.sideLogo === null, JSON.stringify({ status: r.status, sideLogo: r.sideLogo }));
check('emplacements configurés : Scania et Master, flanc gauche et flanc droit', JSON.stringify(r.cfg) === JSON.stringify({ STX_Scania_DETAILLE: ['scania-gauche', 'scania-droite'], STX_Renault_Master_STALLE5: ['master-gauche', 'master-droite'] }), JSON.stringify(r.cfg));
for (const k of ['scania', 'master']) {
  const v = r[k];
  check(`${k} : habillage neutre affiché (aucun logo)`, v.ok && v.state.content === 'neutral' && v.visible, JSON.stringify(v.state?.slots.map((s) => [s.id, s.rect.w.toFixed(2), s.rect.h.toFixed(3)])));
  check(`${k} : un seul maillage de décor, dans la caisse du véhicule (hors pièces mobiles)`, v.meshes === 1 && v.inBody && !v.ancestors.some((n) => /ramp|door|flap|partition/i.test(n)), v.ancestors.join(' < '));
  check(`${k} : face plane vérifiée sur la géométrie (écart < 0,5 mm)`, v.state.slots.length === 2 && v.state.slots.every((s) => s.deviation < 5e-4 && s.triangles > 0), v.state.slots.map((s) => `${s.id} ${(s.deviation * 1000).toFixed(4)} mm, ${s.triangles} tri.`).join(' · '));
  check(`${k} : ombres reçues, découpe alpha (pas de tri de transparence), décalage de profondeur, sRGB`, v.shadow.receive && !v.shadow.cast && !v.mat.transparent && v.mat.alphaTest > 0 && v.mat.polygonOffset && v.mat.colorSpace === 'srgb' && v.frustumCulled, JSON.stringify(v.mat));
}
check('décors : 2 maillages en tout dans la scène, matériau partagé', r.scania.sceneMeshes === 2 && r.sharedMaterial);
check('lettrages « STX » d’origine des modèles fournis intacts (capucine, calandre, flancs du Master)', r.letters.every((x) => x.ok), r.letters.map((x) => `${x.n.replace('exterior__', '')} ${x.size}`).join(' · '));
const trisNeutral = r.scania.tris + r.master.tris;

// ---------- 2. Placement : surface, zone utile, ouvertures ----------
const audit = async (label) => {
  const a = await E(() => ({ scania: window.__liv.audit('scania'), master: window.__liv.audit('master') }));
  for (const k of ['scania', 'master']) {
    check(`${label} ${k} : aucun sommet hors des emplacements configurés`, a[k].stray === 0 && a[k].slots.every((s) => s.verts > 0 && s.outside === 0), a[k].slots.map((s) => `${s.id} ${s.verts} sommets, z ${s.rect.z.join('…')} y ${s.rect.y.join('…')}`).join(' · '));
    check(`${label} ${k} : décor sur la face extérieure (0,5 à 3 mm au-dessus de la tôle)`, a[k].slots.every((s) => s.off[0] > 0.0005 && s.off[1] < 0.003), a[k].slots.map((s) => `${s.id} ${s.off.map((x) => (x * 1000).toFixed(2)).join('…')} mm`).join(' · '));
    check(`${label} ${k} : aucune ouverture, vitre, charnière, feu ou pièce mobile recouverte (garde 3 cm)`, a[k].slots.every((s) => !s.hits.length), a[k].slots.map((s) => `${s.id} ${s.hits.join(',') || 'libre'} · plus proches ${Object.entries(s.near).sort((p, q) => p[1] - q[1]).slice(0, 3).map(([n, d]) => `${n} ${d} m`).join(', ')}`).join(' | '));
  }
  return a;
};
await audit('neutre');

// ---------- 3. Accroché au véhicule : déplacement et conduite ----------
r = await E(() => {
  const L = window.__liv, g = window.__game, A = window.__auto;
  const center = (k) => {
    const m = L.livery(k).mesh;
    m.geometry.computeBoundingBox();
    const c = m.geometry.boundingBox.getCenter(g.camera.position.clone());
    L.group(k).updateMatrixWorld(true);
    return { world: c.clone().applyMatrix4(m.matrixWorld), local: c.applyMatrix4(L.rel(k, m)) };
  };
  const out = {};
  // Camion : déplacé (position, cap), puis conduit quelques mètres.
  const t = g.truck;
  const c0 = center('scania');
  const p0 = { x: t.pos.x, z: t.pos.z, h: t.heading };
  t.setPosition(p0.x + 3, p0.z - 2, p0.h + 0.4);
  A.tick(2);
  const c1 = center('scania');
  t.setPosition(p0.x, p0.z, p0.h);
  A.tick(2);
  A.drive();
  for (let i = 0; i < 110; i++) {
    g.input.setVirtualMove(0.15, 0.7);
    A.tick(1);
  }
  const c2 = center('scania');
  const roll = { pitch: +t.body.rotation.x.toFixed(4), roll: +t.body.rotation.z.toFixed(4) };
  const moved = Math.hypot(t.pos.x - p0.x, t.pos.z - p0.z);
  for (let i = 0; i < 90 && Math.abs(t.speed) > 0.05; i++) {
    g.input.setVirtualMove(0, -0.6);
    A.tick(1);
  }
  A.releaseInput();
  A.foot();
  const w = (a, b) => +a.world.distanceTo(b.world).toFixed(3);
  out.scania = { teleport: w(c0, c1), drive: w(c0, c2), moved: +moved.toFixed(2), localDrift: Math.max(c0.local.distanceTo(c1.local), c0.local.distanceTo(c2.local)), expected: +Math.hypot(3, 2).toFixed(3), roll, geo: L.livery('scania').mesh.geometry.uuid };
  // Van : conduit quelques mètres.
  const v = g.van, p = g.player;
  const d0 = center('master');
  const q0 = { x: v.pos.x, z: v.pos.z };
  p.enterVehicle(v);
  for (let i = 0; i < 110; i++) {
    g.input.setVirtualMove(-0.15, 0.7);
    A.tick(1);
  }
  const d1 = center('master');
  const vm = Math.hypot(v.pos.x - q0.x, v.pos.z - q0.z);
  for (let i = 0; i < 90 && Math.abs(v.speed) > 0.05; i++) {
    g.input.setVirtualMove(0, -0.6);
    A.tick(1);
  }
  A.releaseInput();
  p.exitVehicle();
  A.tick(3);
  out.master = { drive: +d0.world.distanceTo(d1.world).toFixed(3), moved: +vm.toFixed(2), localDrift: d0.local.distanceTo(d1.local) };
  return out;
});
check('camion déplacé : le décor suit (même déplacement, immobile sur la caisse)', r.scania.teleport > 1 && r.scania.localDrift < 1e-4, JSON.stringify(r.scania));
check('camion conduit : le décor suit la caisse (roulis, tangage compris)', r.scania.moved > 3 && r.scania.drive > 3 && r.scania.localDrift < 1e-4, `${r.scania.moved} m parcourus, décor déplacé de ${r.scania.drive} m`);
check('van conduit : le décor suit la caisse', r.master.moved > 3 && r.master.drive > 3 && r.master.localDrift < 1e-4, JSON.stringify(r.master));
const geoUuid = r.scania.geo;

// ---------- 4. Interactions : rampes, portes, chargement ----------
r = await E(() => {
  const L = window.__liv, g = window.__game, A = window.__auto, t = g.truck, p = g.player, h = g.mainHorse, tp = p.transport;
  const sig = (k) => L.decal(k).reduce((s, v) => s + v[0] * 1.3 + v[1] * 0.7 + v[2] * 0.11, 0);
  const s0 = sig('scania');
  A.foot();
  const out = {};
  out.open = t.openRamp();
  for (let i = 0; i < 30 * 6 && !t.rampOpen; i++) A.tick(1);
  out.rampOpen = t.rampOpen;
  t.setDoor(true);
  A.tick(60);
  out.doorOpen = t.door.t;
  out.sigOpen = Math.abs(sig('scania') - s0);
  // Cheval chargé puis déchargé (séquences accélérées du jeu).
  if (p.transport.led) p.transport.release(true);
  out.load = tp.load(h, { fast: true });
  A.tick(10);
  out.aboard = tp.isAboard(h);
  out.unload = tp.unload(h, { fast: true });
  A.tick(10);
  out.after = !tp.isAboard(h) && !h.hiddenInTruck;
  if (p.transport.led) p.transport.release(true);
  t.setDoor(false);
  t.closeRamp();
  for (let i = 0; i < 30 * 8 && !(t.rampClosed && t.door.t === 0); i++) A.tick(1);
  out.closed = t.rampClosed && t.door.t === 0;
  out.sigClosed = Math.abs(sig('scania') - s0);
  return out;
});
check('camion : rampe arrière ouverte jusqu’au bout, porte d’habitation ouverte', r.open && r.rampOpen && r.doorOpen === 1, JSON.stringify(r));
check('camion : cheval chargé puis déchargé', r.load && r.aboard && r.unload && r.after);
check('camion : rampe et porte refermées, décor inchangé pendant tout le cycle', r.closed && r.sigOpen < 1e-6 && r.sigClosed < 1e-6, `écarts ${r.sigOpen} / ${r.sigClosed}`);
await E(() => {
  const g = window.__game, t = g.truck;
  t.setRampInstant(true);
  t.setDoor(true);
  window.__auto.tick(40);
});
await E(() => window.__liv.view('scania', [-9.5, 2.6, -1.2], [0, 1.8, -1.2], 11, 'Habillage neutre (STX en attente) — camion : rampe arrière et porte d’habitation ouvertes · rendu SwiftShader'));
await page.screenshot({ path: `${OUT}/livree-neutre-scania-rampe-porte-ouvertes.png` });
await E(() => {
  const g = window.__game, t = g.truck;
  g.cam.override = null;
  t.setDoor(false);
  t.setRampInstant(false);
  window.__auto.tick(40);
});
r = await E(() => {
  const L = window.__liv, g = window.__game, A = window.__auto, v = g.van, p = g.player, h = g.mainHorse, VL = g.vanLoading;
  const sig = (k) => L.decal(k).reduce((s, q) => s + q[0] * 1.3 + q[1] * 0.7 + q[2] * 0.11, 0);
  const s0 = sig('master');
  A.foot();
  const out = { side: v.setSide(true), rear: v.setRear(true) };
  A.tick(75);
  out.sideOpen = v.sideOpen;
  out.rearOpen = v.rearOpen;
  out.sigOpen = Math.abs(sig('master') - s0);
  if (p.transport.led) p.transport.release(true);
  out.load = VL.load(h, { fast: true });
  A.tick(45);
  out.aboard = VL.isAboard(h);
  out.unload = VL.unload(h, { fast: true });
  A.tick(45);
  out.after = !VL.isAboard(h) && !h.hiddenInTruck;
  if (p.transport.led) p.transport.release(true);
  // Cheval et cavalier écartés du champ des captures.
  const far = v.groundPoint(9, -14, { x: 0, y: 0, z: 0 });
  h.setPosition(far.x, far.z, v.heading);
  const me = v.groundPoint(11, -12, { x: 0, y: 0, z: 0 });
  p.human.setPosition(me.x, me.z, v.heading);
  A.tick(2);
  return out;
});
check('van : pont latéral (et volets) et porte arrière ouverts', r.side && r.rear && r.sideOpen && r.rearOpen, JSON.stringify(r));
check('van : cheval chargé par le pont puis déchargé', r.load && r.aboard && r.unload && r.after);
await E(() => window.__liv.view('master', [-6.2, 2.0, -1.0], [0, 1.1, -0.9], 11, 'Habillage neutre (STX en attente) — van : pont latéral et porte arrière ouverts · rendu SwiftShader'));
await page.screenshot({ path: `${OUT}/livree-neutre-master-pont-ouvert.png` });
r = await E(() => {
  const L = window.__liv, g = window.__game, A = window.__auto, v = g.van;
  g.cam.override = null;
  v.setSide(false);
  v.setRear(false);
  A.tick(75);
  return { closed: v.closed };
});
check('van : pont et porte refermés, départ possible', r.closed);
await audit('après interactions');

// ---------- Captures : habillage neutre, deux flancs, jour et nuit ----------
const VIEWS = {
  'scania-gauche': ['scania', [11.5, 2.3, -1.4], [0, 1.95, -1.6]],
  'scania-droite': ['scania', [-9.5, 2.3, 1.6], [0, 1.95, 2.0]],
  'master-gauche': ['master', [6.8, 1.6, -0.6], [0, 1.3, -0.9]],
  'master-droite': ['master', [-6.4, 1.6, -1.2], [0, 1.25, -1.4]],
};
// Gros plans (jour) : surface suivie, bords nets, pas de scintillement avec la tôle.
const CLOSE = {
  'scania-gauche-gros-plan': ['scania', [3.6, 1.9, -0.2], [1.28, 1.9, -1.6]],
  'master-gauche-gros-plan': ['master', [3.0, 1.3, 0.6], [1.16, 1.25, -0.6]],
};
const shots = async (prefix, label) => {
  for (const [name, [k, cam, look]] of Object.entries(CLOSE)) {
    await E(([k, cam, look, lab]) => window.__liv.view(k, cam, look, 11, lab), [k, cam, look, `${label} — ${name.replace(/-/g, ' ')} — jour · rendu SwiftShader (Chromium), pas un iPhone réel`]);
    await page.screenshot({ path: `${OUT}/${prefix}-${name}.png` });
  }
  for (const [hour, when] of [[11, 'jour'], [22.5, 'nuit']]) {
    for (const [name, [k, cam, look]] of Object.entries(VIEWS)) {
      await E(([k, cam, look, hour, lab]) => {
        const g = window.__game;
        // Feux et plafonniers comme à l'arrêt moteur tournant (nuit).
        if (hour > 20 && k === 'scania') g.truck.startEngine();
        window.__liv.view(k, cam, look, hour, lab);
      }, [k, cam, look, hour, `${label} — ${name.replace('-', ' ')} — ${when} · rendu SwiftShader (Chromium), pas un iPhone réel`]);
      await page.screenshot({ path: `${OUT}/${prefix}-${name}-${when}.png` });
    }
  }
  await E(() => {
    const g = window.__game;
    g.cam.override = null;
    g.truck.stopEngine();
    window.__liv.untag();
  });
};
await shots('livree-neutre', 'Habillage neutre des emplacements STX (marque en attente d’autorisation : aucun logo)');

// ---------- 6. Coût : appels de dessin et triangles ajoutés ----------
r = await E(() => {
  const L = window.__liv, g = window.__game, A = window.__auto;
  // Vue d'ensemble où les deux véhicules sont dans le champ.
  const t = g.truck, v = g.van;
  const mid = { x: (t.pos.x + v.pos.x) / 2, z: (t.pos.z + v.pos.z) / 2 };
  const d = Math.hypot(t.pos.x - v.pos.x, t.pos.z - v.pos.z);
  g.cam.override = { pos: g.camera.position.clone().set(mid.x + d * 0.7, 12 + d * 0.3, mid.z + d * 0.7), look: g.camera.position.clone().set(mid.x, 1.5, mid.z) };
  A.tick(3);
  const measure = () => {
    g.renderer.render(g.scene, g.camera);
    return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  };
  const on = measure();
  for (const k of L.keys) L.livery(k).mesh.visible = false;
  const off = measure();
  for (const k of L.keys) L.livery(k).mesh.visible = true;
  // Rien n'est reconstruit pendant le jeu : même géométrie après 120 pas de simulation et 2 images.
  const uuid = L.livery('scania').mesh.geometry.uuid;
  A.tick(120);
  for (let i = 0; i < 2; i++) g.renderer.render(g.scene, g.camera);
  g.cam.override = null;
  const stable = uuid === L.livery('scania').mesh.geometry.uuid;
  // Coût de construction (une fois au chargement) : préparation des surfaces visées et projection des 4 décors.
  const t0 = performance.now();
  for (const k of L.keys) {
    const lv = L.livery(k);
    for (const sl of lv.slots) lv._prepare(sl.cfg).proxy.geometry.dispose();
  }
  const t1 = performance.now();
  L.livery('scania').resetContent();
  const t2 = performance.now();
  return { prepMs: +(t1 - t0).toFixed(1), buildMs: +(t2 - t1).toFixed(1), on, off, stable, uuid, mapBytes: (() => { const im = L.livery('scania').mesh.material.map.image; return im.width * im.height * 4; })() };
});
check('coût : un appel de dessin par véhicule au plus, quelques centaines de triangles', r.on.calls - r.off.calls <= 2 && r.on.tris - r.off.tris <= 1000, `+${r.on.calls - r.off.calls} appels (${r.off.calls} → ${r.on.calls}), +${r.on.tris - r.off.tris} triangles · ${trisNeutral} triangles de décor (habillage neutre) · texture neutre ${r.mapBytes} octets`);
check('aucune reconstruction pendant le jeu (géométrie inchangée depuis le chargement)', r.stable && r.uuid === geoUuid);
console.log(`  construction (une fois, au chargement) : préparation ${r.prepMs} ms, projection des 4 décors ${r.buildMs} ms`);

// ---------- 5. Mire de TEST : même chemin que le logo officiel ----------
r = await E(() => {
  const L = window.__liv;
  L.livery('scania').showTestImage(L.testPattern());
  return { scania: L.livery('scania').state(), master: L.livery('master').state(), map: L.livery('master').mesh.material.map.image.width };
});
for (const k of ['scania', 'master']) {
  const s = r[k];
  check(`mire de TEST ${k} : posée sur les deux flancs, proportions conservées (2:1, jamais déformée)`, s.content === 'test' && s.aspect === 2 && s.slots.length === 2 && s.slots.every((x) => Math.abs(x.rect.w / x.rect.h - 2) < 1e-9 && x.triangles > 0), s.slots.map((x) => `${x.id} ${x.rect.w.toFixed(3)} × ${x.rect.h.toFixed(3)} m`).join(' · '));
}
const at = await audit('mire');
for (const k of ['scania', 'master']) {
  const s = at[k].slots;
  // Sur la tôle : largeur / hauteur réelles du décor = 2 (case de damier carrée), lecture non inversée :
  // texture de gauche à droite vers l'arrière sur le flanc gauche, vers l'avant sur le flanc droit, de bas en haut.
  check(`mire de TEST ${k} : 1:1 sur la carrosserie (cases carrées) et lisible des deux côtés`, s.every((x) => Math.abs(x.w / x.h - 2) < 0.01 && Math.abs(x.dudz * x.w) > 0.98 && Math.abs(x.dvdy * x.h - 1) < 0.02 && Math.sign(x.dudz) === (x.side === 'left' ? -1 : 1)), s.map((x) => `${x.id} ${(x.w / x.h).toFixed(4)} · du/dz ${x.dudz.toFixed(3)} dv/dy ${x.dvdy.toFixed(3)}`).join(' · '));
}
await shots('TEST-mire', 'TEST — mire de validation du placement (damier « TEST 1:1 »), PAS un logo, jamais affichée en jeu');
r = await E(() => {
  const L = window.__liv;
  L.livery('master').resetContent();
  const m = L.livery('scania').mesh.material.map.image;
  return { scania: L.livery('scania').content, master: L.livery('master').content, map: `${m.width}×${m.height}` };
});
check('retour à l’habillage neutre après la mire (aucune trace de la mire)', r.scania === 'neutral' && r.master === 'neutral' && r.map === '4×128', JSON.stringify(r));

// Activation (page de test seulement) : BRANDS.stx autorisée, fichier « officiel » = la mire de TEST en PNG (jamais un
// logo STX) : chargement, inscription aux proportions, puis retour à la configuration réelle (en attente).
r = await E(async () => {
  const L = window.__liv;
  const { BRANDS } = await L.mod('/src/partners/partners.js');
  const saved = { status: BRANDS.stx.status, sideLogo: BRANDS.stx.assets.sideLogo };
  const url = L.testPattern().toDataURL('image/png');
  BRANDS.stx.status = 'authorized';
  BRANDS.stx.assets.sideLogo = url;
  L.livery('scania').resetContent();
  const during = L.livery('scania').content;
  for (let i = 0; i < 100 && L.livery('master').content !== 'official'; i++) await new Promise((res) => setTimeout(res, 50));
  const on = { scania: L.livery('scania').state(), master: L.livery('master').state() };
  BRANDS.stx.status = saved.status;
  BRANDS.stx.assets.sideLogo = saved.sideLogo;
  L.livery('scania').resetContent();
  return { during, on, after: [L.livery('scania').content, L.livery('master').content], restored: BRANDS.stx.status === 'pending' && BRANDS.stx.assets.sideLogo === null };
});
check('activation simulée : neutre pendant le chargement, puis fichier officiel posé sur les 4 emplacements à ses proportions', r.during === 'neutral' && ['scania', 'master'].every((k) => r.on[k].content === 'official' && r.on[k].slots.length === 2 && r.on[k].slots.every((x) => Math.abs(x.rect.w / x.rect.h - 2) < 1e-9)), JSON.stringify(r.on.master.slots.map((x) => [x.id, x.rect.w.toFixed(3), x.rect.h.toFixed(3)])));
check('configuration réelle rétablie (STX en attente) : habillage neutre', r.restored && r.after.every((c) => c === 'neutral'), JSON.stringify(r.after));
await audit('neutre rétabli');
check('aucune erreur console', !errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `ÉCHECS : ${fails}` : 'HABILLAGE STX OK');
process.exit(fails ? 1 : 0);
