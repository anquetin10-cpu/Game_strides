// Robe du cheval engagé (C1) : export, depuis le jeu web en cours d'exécution, de tout ce qui sert à reproduire la robe
// du cheval WildMesh (src/entities/pjl/coat.js, coatOf de src/entities/pjlHorse.js, HORSES / ownedHorses /
// activeHorseId de src/gameplay/data.js) sur le cheval PJL d'Unreal. Le jeu web est la spécification : rien n'est modifié
// dans src/ ; les modules sont importés tels que Vite les sert, dans une page de test sans le jeu (comme
// export-cso-input.mjs), et aucune valeur n'est recopiée à la main.
//
// Sorties :
//  - unreal/StridesGrandTour/Content/Data/horse_coats.json (données lues par le jeu Unreal) : robes connues (COATS),
//    palette de chaque robe (coatColours), tableau des listes (BLAZE, lu dans les uniformes de makeCoatMaterial), chevaux
//    du jeu (robe, liste, balzanes, modèle, essai, tels qu'écrits dans data.js), empreinte du code GLSL des deux matériaux
//    (le port HLSL du matériau Unreal en garde la trace) ;
//  - unreal/core/tests/oracles/horse_coat.json : coatOf, uniformes de makeCoatMaterial / makeHairMaterial (couleurs en
//    espace linéaire, comme three.js les passe au shader), ownedHorses / activeHorseId sur des sauvegardes, cheval engagé ;
//    rejoué par testHorseCoat (unreal/core/tests/test_core.cpp) ;
//  - .tmp/unreal-import/horse-coat/body_coat.json (intermédiaire, non versionné) : pour chaque sommet du corps du GLB
//    public/real/horse_pjl.glb, masques de robe calculés par asset.js (coatMask, coatRegion : buildCoatMasks, appelé
//    par loadHorseAsset), UV, position de liaison (vBindPos du shader) et, évaluées sur le GPU par le code GLSL extrait
//    du shader de makeCoatMaterial (WebGL2, transform feedback), les deux expressions de bruit qui dépendent de vBindPos :
//    largeur du bord de balzane (`edge`) et facteur de largeur de la liste (`halfW = uBlaze.w * (…)`). Lu par
//    scripts/unreal/coat-horse-glb.py.
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5173 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-horse-coat.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const DATA = join(ROOT, 'unreal/StridesGrandTour/Content/Data/horse_coats.json');
const ORACLE = join(ROOT, 'unreal/core/tests/oracles/horse_coat.json');
const BODY = join(ROOT, '.tmp/unreal-import/horse-coat/body_coat.json');
const HARNESS = `${BASE}/__strides_horse_coat__.html`;
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

// Définitions de cheval synthétiques (bords de coatOf) en plus des chevaux du jeu.
const DEFS = [
  {},
  { coat: 'palomino' },
  { coat: 'dapplegrey', blaze: 'star', socks: [0.2, true, false, 0.9] },
  { coat: 'pink', blaze: 'stripe' },
  { coat: { body: '#ffffff' }, blaze: 'bald', socks: [true, true] },
  { coat: 42, blaze: 1, socks: [1, 'x', null, true, true] },
  { coat: 'liverchestnut', blaze: 0, socks: null },
  { coat: 'darkbay', blaze: 'none', socks: [] },
  { coat: 'brown', blaze: 'blaze', socks: [false, false, false, false] },
  { coat: 'Bay', blaze: true },
  { coat: 'black', blaze: 'unknown-mark' },
  { coat: 'grey', socks: 'abc' },
  { coat: 'chestnut', socks: 3 },
];
// Sauvegardes (save.data) pour ownedHorses / activeHorseId.
const SAVES = [
  {},
  { horses: ['comete'], activeHorse: 'comete' },
  { horses: ['comete', 'ulysse'], activeHorse: 'ulysse' },
  { horses: ['comete', 'ulysse'], activeHorse: 'saphir' },
  { horses: ['comete'], activeHorse: 'tripo' },
  { horses: ['saphir', 'onyx', 'saphir', 'licorne'], activeHorse: 'onyx' },
  { horses: ['licorne'], activeHorse: 'licorne' },
  { horses: [], activeHorse: 'comete' },
  { horses: 'comete', activeHorse: 'ulysse' },
  { horses: ['tripo', 'ulysse'], activeHorse: null },
  { activeHorse: 'onyx' },
  { horses: ['onyx'] },
];

function PAGE(arg) {
  const { DEFS, SAVES } = arg;
  return (async () => {
    const D = await import('/src/gameplay/data.js');
    const PH = await import('/src/entities/pjlHorse.js');
    const C = await import('/src/entities/pjl/coat.js');
    const R = await import('/src/entities/realistic.js');
    const A = await import('/src/entities/pjl/asset.js');
    const rawPH = (await import('/src/entities/pjlHorse.js?raw')).default;
    const rawC = (await import('/src/entities/pjl/coat.js?raw')).default;
    const asset = await A.loadHorseAsset(() => R.loadRealGltf('horse_pjl'));
    let body = null, hair = null;
    asset.scene.traverse((o) => {
      if (o.isSkinnedMesh && o.material.name === 'horse_body') body = o;
      if (o.isSkinnedMesh && o.material.name === 'horse_hair') hair = o;
    });
    if (!body || !hair) throw new Error('maillages horse_body / horse_hair absents');
    // Clés des tables du source (robes, palette, listes), vérifiées par les fonctions elles-mêmes.
    const block = (src, re) => {
      const m = src.match(re);
      if (!m) throw new Error(`bloc introuvable : ${re}`);
      return m[1];
    };
    const coats = [...block(rawPH, /const COATS = new Set\(\[([^\]]*)\]\)/).matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    const paletteKeys = [...block(rawC, /const PALETTE = \{([\s\S]*?)\n\};/).matchAll(/^\s*([a-z]+): \{/gm)].map((m) => m[1]);
    const blazeKeys = [...block(rawC, /const BLAZE = \{([\s\S]*?)\n\};/).matchAll(/^\s*([a-z]+): \[/gm)].map((m) => m[1]);
    const checks = [];
    for (const c of coats) if (PH.coatOf({ coat: c }).colour !== c) throw new Error(`COATS : ${c} refusée par coatOf`);
    if (PH.coatOf({ coat: '__absente__' }).colour !== 'bay') throw new Error('coatOf : repli attendu « bay »');
    checks.push(`COATS (${coats.length}) acceptées par coatOf ; robe inconnue → bay`);
    const fallbackPal = C.coatColours('__absente__');
    if (fallbackPal !== C.coatColours('bay')) throw new Error('coatColours : repli attendu « bay »');
    for (const k of paletteKeys) if (k !== 'bay' && C.coatColours(k) === fallbackPal) throw new Error(`PALETTE : ${k} non trouvée`);
    checks.push(`PALETTE (${paletteKeys.length}) lue par coatColours ; robe inconnue → bay`);
    const palette = {};
    for (const k of paletteKeys) palette[k] = { ...C.coatColours(k) };
    const base = body.material, hairBase = hair.material;
    const lin = (c) => [c.r, c.g, c.b];
    const blaze = {};
    for (const k of blazeKeys) {
      const u = C.makeCoatMaterial(base, { colour: 'bay', blaze: k }).userData.coatUniforms.uBlaze.value;
      blaze[k] = [u.x, u.y, u.z, u.w];
    }
    checks.push(`BLAZE (${blazeKeys.length}) lu dans uBlaze de makeCoatMaterial`);
    // Uniformes et réglages des matériaux du web pour une robe (exception relevée telle quelle).
    const uniforms = (coat) => {
      try {
        const m = C.makeCoatMaterial(base, coat), U = m.userData.coatUniforms;
        const h = C.makeHairMaterial(hairBase, coat);
        const v4 = (v) => [v.x, v.y, v.z, v.w];
        return {
          coat: lin(U.uCoat.value), points: lin(U.uPoints.value), pointsAmt: U.uPointsAmt.value, detail: U.uDetail.value,
          socks: v4(U.uSocks.value), blaze: v4(U.uBlaze.value), dapples: U.uDapples.value, wet: U.uWet.value,
          roughness: m.roughness, metalness: m.metalness, side: m.side,
          hair: lin(h.userData.hairUniform.value), hairRoughness: h.roughness, alphaTest: h.alphaTest, hairSide: h.side, hairTransparent: h.transparent,
        };
      } catch (e) {
        return { throws: String(e.message || e) };
      }
    };
    // Code GLSL injecté par les deux matériaux (onBeforeCompile sur un shader témoin).
    const shaderOf = (m) => {
      const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <opaque_fragment>' };
      m.onBeforeCompile(sh);
      return sh;
    };
    const bodySh = shaderOf(C.makeCoatMaterial(base, { colour: 'bay' }));
    const hairSh = shaderOf(C.makeHairMaterial(hairBase, { colour: 'bay' }));
    const frag = bodySh.fragmentShader;
    const noiseSrc = block(frag, /(float hash3[\s\S]*?f\.z\); \})/);
    const edgeExpr = block(frag, /float edge = (.*);/);
    const widthExpr = block(frag, /float halfW = uBlaze\.w \* \((.*)\);/);
    if (!/vBindPos/.test(edgeExpr) || !/vBindPos/.test(widthExpr)) throw new Error('expressions de bruit sans vBindPos');

    // Chevaux du jeu (champs de la robe tels qu'écrits dans data.js).
    const horses = Object.values(D.HORSES).map((h) => ({ id: h.id, name: h.name, coat: h.coat, blaze: h.blaze ?? null, socks: h.socks ?? null, model: h.model ?? null, trial: !!h.trial }));
    const coatOfCases = [...Object.values(D.HORSES).map((h) => ({ id: h.id, def: { coat: h.coat, blaze: h.blaze, socks: h.socks } })), ...DEFS.map((d) => ({ def: d }))].map((c) => {
      let out;
      try {
        out = PH.coatOf(c.def);
      } catch (e) {
        out = { throws: String(e.message || e) };
      }
      return { ...c, def: JSON.parse(JSON.stringify(c.def ?? {})), out };
    });
    const uniformCases = [];
    for (const c of coatOfCases) if (!c.out.throws) uniformCases.push({ coat: c.out, out: uniforms(c.out) });
    // Robes passées directement (sans dapples ni socks : valeurs par défaut de makeCoatMaterial), et chaque robe connue.
    for (const k of [...paletteKeys, 'zzz']) uniformCases.push({ coat: { colour: k }, out: uniforms({ colour: k }) });
    uniformCases.push({ coat: { colour: 'dapplegrey', blaze: 'star', socks: [0.1, 0.2] }, out: uniforms({ colour: 'dapplegrey', blaze: 'star', socks: [0.1, 0.2] }) });
    const active = SAVES.map((s) => ({ save: s, owned: D.ownedHorses(s), active: D.activeHorseId(s) }));
    // Cheval engagé : game.js spawnMainHorse(activeHorseId(d)) → HORSES[id] || HORSES.comete → coatOf(def) (PjlHorse).
    const engaged = SAVES.map((s) => {
      const id = D.activeHorseId(s);
      const def = D.HORSES[id] || D.HORSES.comete;
      return { save: s, id: def.id, model: def.model ?? null, coat: PH.coatOf(def) };
    });

    // ---- Sommets du corps : masques (asset.js), UV, position de liaison, bruits évalués sur le GPU ----
    const g = body.geometry, at = g.attributes;
    const n = at.position.count;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), mask = new Float32Array(n * 4), region = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = at.position.getComponent(i, k);
      for (let k = 0; k < 2; k++) uv[i * 2 + k] = at.uv.getComponent(i, k);
      for (let k = 0; k < 4; k++) mask[i * 4 + k] = at.coatMask.getComponent(i, k);
      region[i] = at.coatRegion.getX(i);
    }
    const index = Array.from(g.index.array);
    // Évaluation GPU (WebGL2, transform feedback) des deux expressions du shader, aux sommets et, pour mesurer l'écart dû
    // à l'interpolation par sommet, au centre de chaque triangle et au milieu de chaque arête.
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 absent');
    const vs = `#version 300 es
precision highp float;
in vec3 vBindPos;
out vec2 o;
${noiseSrc}
void main() { o = vec2(${edgeExpr}, ${widthExpr}); gl_Position = vec4(0.0); gl_PointSize = 1.0; }`;
    const fs = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){ c = vec4(0.0); }';
    const sh = (t, s) => {
      const x = gl.createShader(t);
      gl.shaderSource(x, s);
      gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
      return x;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.transformFeedbackVaryings(prog, ['o'], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const evalAt = (P) => {
      const m = P.length / 3;
      gl.useProgram(prog);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, P, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'vBindPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      const tb = gl.createBuffer();
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, tb);
      gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, m * 8, gl.STREAM_READ);
      const tf = gl.createTransformFeedback();
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, tb);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, m);
      gl.endTransformFeedback();
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      const out = new Float32Array(m * 2);
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);
      return out;
    };
    const noise = evalAt(pos);
    // Écart d'interpolation : valeur au centre et aux milieux d'arêtes contre l'interpolation linéaire des sommets.
    const T = index.length / 3, mid = new Float32Array(T * 4 * 3);
    for (let t = 0; t < T; t++) {
      const [a, b, c] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
      for (let k = 0; k < 3; k++) {
        mid[(t * 4) * 3 + k] = (pos[a * 3 + k] + pos[b * 3 + k] + pos[c * 3 + k]) / 3;
        mid[(t * 4 + 1) * 3 + k] = (pos[a * 3 + k] + pos[b * 3 + k]) / 2;
        mid[(t * 4 + 2) * 3 + k] = (pos[b * 3 + k] + pos[c * 3 + k]) / 2;
        mid[(t * 4 + 3) * 3 + k] = (pos[c * 3 + k] + pos[a * 3 + k]) / 2;
      }
    }
    const nm = evalAt(mid);
    const interp = [0, 0];
    for (let t = 0; t < T; t++) {
      const [a, b, c] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
      for (let q = 0; q < 2; q++) {
        const va = noise[a * 2 + q], vb = noise[b * 2 + q], vc = noise[c * 2 + q];
        const lerp = [(va + vb + vc) / 3, (va + vb) / 2, (vb + vc) / 2, (vc + va) / 2];
        for (let s = 0; s < 4; s++) interp[q] = Math.max(interp[q], Math.abs(nm[(t * 4 + s) * 2 + q] - lerp[s]));
      }
    }
    // Sommet qui fixe la valeur « flat » d'un triangle (vRegion) : relevé sur ce navigateur (triangle dont seul le
    // premier, seul le dernier sommet porte 1).
    const pv = (() => {
      const p2 = gl.createProgram();
      gl.attachShader(p2, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; in float r; flat out float vr; void main(){ vr = r; gl_Position = vec4(p, 0.0, 1.0); }'));
      gl.attachShader(p2, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; flat in float vr; out vec4 c; void main(){ c = vec4(vr, 0.0, 0.0, 1.0); }'));
      gl.linkProgram(p2);
      gl.useProgram(p2);
      cv.width = 4;
      cv.height = 4;
      gl.viewport(0, 0, 4, 4);
      const run = (r) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, r[0], 3, -1, r[1], -1, 3, r[2]]), gl.STATIC_DRAW);
        const lp = gl.getAttribLocation(p2, 'p'), lr = gl.getAttribLocation(p2, 'r');
        gl.enableVertexAttribArray(lp);
        gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(lr);
        gl.vertexAttribPointer(lr, 1, gl.FLOAT, false, 12, 8);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const px = new Uint8Array(4);
        gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px[0] > 127;
      };
      const first = run([1, 0, 0]), last = run([0, 0, 1]);
      return first && !last ? 'first' : last && !first ? 'last' : 'indéterminé';
    })();
    const verts = { count: n, triangles: T, pos: Array.from(pos), uv: Array.from(uv), mask: Array.from(mask), region: Array.from(region), edge: [], width: [], index };
    for (let i = 0; i < n; i++) {
      verts.edge.push(noise[i * 2]);
      verts.width.push(noise[i * 2 + 1]);
    }
    const regionCount = [0, 0, 0, 0, 0, 0];
    for (const r of region) regionCount[r]++;
    return {
      coats, palette, blaze, horses, checks, coatOfCases, uniformCases, active, engaged, verts, regionCount,
      shader: { body: bodySh.fragmentShader, bodyVertex: bodySh.vertexShader, hair: hairSh.fragmentShader, noiseSrc, edgeExpr, widthExpr },
      interp, provoking: pv, userAgent: navigator.userAgent,
    };
  })();
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(HARNESS, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }));
await page.goto(HARNESS);
const r = await page.evaluate(PAGE, { DEFS, SAVES });
await browser.close();
if (errors.length) throw new Error(`erreurs de la page : ${errors.join(' | ')}`);

const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const writeIfChanged = (file, text) => {
  let prev = null;
  try {
    prev = readFileSync(file, 'utf8');
  } catch {}
  mkdirSync(dirname(file), { recursive: true });
  if (prev !== text) writeFileSync(file, text);
  return prev === text ? 'inchangé' : 'écrit';
};
const SOURCES = ['src/entities/pjl/coat.js', 'src/entities/pjlHorse.js', 'src/gameplay/data.js', 'src/entities/pjl/asset.js'];
const shader = {
  bodyFragmentSha1: sha1(r.shader.body),
  bodyVertexSha1: sha1(r.shader.bodyVertex),
  hairFragmentSha1: sha1(r.shader.hair),
  edgeExpr: r.shader.edgeExpr,
  widthExpr: r.shader.widthExpr,
  note: 'empreintes SHA-1 du code injecté par onBeforeCompile (shader témoin : #include <common>, <begin_vertex>, <map_fragment>, <roughnessmap_fragment>, <opaque_fragment>) ; le matériau Unreal (scripts/unreal/import-horse-coat.py) porte ce code en HLSL et rappelle ces empreintes',
};
const data = {
  schema: 'strides.horse_coats/1',
  generator: 'scripts/unreal/export-horse-coat.mjs',
  source: SOURCES,
  note: 'robes de pjlHorse.js (COATS, ordre du source), palette de coat.js (coatColours, hexadécimal sRGB tel qu’écrit), listes (BLAZE, uniformes uBlaze), chevaux de data.js (champs de la robe tels qu’écrits)',
  coats: r.coats,
  palette: r.palette,
  blaze: r.blaze,
  horses: r.horses,
  shader,
};
const oracle = {
  schema: 'strides.oracle.horse_coat/1',
  generator: 'scripts/unreal/export-horse-coat.mjs',
  source: SOURCES,
  note: 'coatOf(def) ; uniformes de makeCoatMaterial / makeHairMaterial (couleurs THREE.Color en espace linéaire, exception relevée dans « throws ») ; ownedHorses / activeHorseId (save.data) ; cheval engagé = HORSES[activeHorseId(d)] || HORSES.comete (game.js spawnMainHorse) puis coatOf',
  checks: r.checks,
  coatOf: r.coatOfCases,
  uniforms: r.uniformCases,
  active: r.active,
  engaged: r.engaged,
};
const st1 = writeIfChanged(DATA, JSON.stringify(data, null, 1) + '\n');
const st2 = writeIfChanged(ORACLE, JSON.stringify(oracle, null, 1) + '\n');
const body = {
  schema: 'strides.horse_coat_body/1',
  generator: 'scripts/unreal/export-horse-coat.mjs',
  glb: 'public/real/horse_pjl.glb',
  note: 'sommets du maillage horse_body dans l’ordre du GLB : pos = attribut position (vBindPos du shader, Int16 normalisé), uv, mask = coatMask (x points, y hauteur/long, z face, w latéral), region = coatRegion (0 corps, 1 AG, 2 AD, 3 PG, 4 PD, 5 tête), edge et width = expressions de bruit évaluées sur le GPU',
  shader,
  provoking: r.provoking,
  interpolationMaxError: { edge: r.interp[0], width: r.interp[1] },
  regionCount: r.regionCount,
  userAgent: r.userAgent,
  ...r.verts,
};
const st3 = writeIfChanged(BODY, JSON.stringify(body) + '\n');
console.log(`robes ${r.coats.length}, palette ${Object.keys(r.palette).length}, listes ${Object.keys(r.blaze).length}, chevaux ${r.horses.length} : ${DATA} ${st1}`);
console.log(`oracle : coatOf ${r.coatOfCases.length}, uniformes ${r.uniformCases.length}, sauvegardes ${r.active.length} : ${ORACLE} ${st2}`);
console.log(`corps : ${r.verts.count} sommets, ${r.verts.triangles} triangles, régions ${r.regionCount.join('/')}, sommet « flat » : ${r.provoking}, écart d’interpolation edge ${r.interp[0].toExponential(3)} width ${r.interp[1].toExponential(3)} : ${BODY} ${st3}`);
for (const c of r.checks) console.log('contrôle :', c);
