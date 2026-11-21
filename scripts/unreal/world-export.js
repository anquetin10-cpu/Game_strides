// Export du monde du jeu web vers Unreal (référence : le jeu web est la spécification du monde).
// Construit le World du jeu tel quel (mêmes graines, mêmes règles de placement) et en extrait :
//  - terrain.bin : hauteurs analytiques du relief (float32, grille régulière), terrain.json : description ;
//  - ground_color.png (couleurs peintes du sol : champs, routes, carrières) et ground_splat.png (matériaux : R herbe,
//    G terre, B sable, A sol dur), les mêmes cartes que le shader de sol web ;
//  - architecture.glb : bâtiments, clôtures, mobilier (lots statiques), triangles répartis par matériau ;
//  - trees.glb + trees.json : variantes d'arbres (bois, feuillage) et instances ; hedges.glb : haies ;
//  - leaf_atlas.png, bark_*.png, hedge_*.png : textures de végétation du jeu web.
// Les fichiers sont envoyés au récepteur local (world-export-receiver.py). Lancer : npx vite, puis ouvrir
// /scripts/unreal/world-export.html.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Les lots statiques libèrent leurs tableaux après l'envoi au GPU : on les garde pour pouvoir les exporter.
THREE.BufferAttribute.prototype.onUpload = function () {
  return this;
};

const logEl = document.getElementById('log');
const log = (...a) => {
  logEl.textContent += a.join(' ') + '\n';
  console.log(...a);
};
const RECEIVER = 'http://127.0.0.1:8765/';
async function send(name, data) {
  const body = data instanceof Blob ? data : new Blob([data]);
  const r = await fetch(RECEIVER + name, { method: 'POST', body });
  if (!r.ok) throw new Error(`envoi ${name} : ${r.status}`);
  log('envoyé', name, (body.size / 1e6).toFixed(2), 'Mo');
}
const canvasPng = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));
function imagePng(img) {
  if (img instanceof HTMLCanvasElement) return canvasPng(img);
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d');
  if (img.data) {
    const id = ctx.createImageData(img.width, img.height);
    id.data.set(img.data);
    ctx.putImageData(id, 0, 0);
  } else ctx.drawImage(img, 0, 0);
  return canvasPng(cv);
}

const { World } = await import('/src/world/world.js');
const { Colliders } = await import('/src/world/colliders.js');
const { analyticHeight } = await import('/src/world/terrain.js');
const { WORLD } = await import('/src/world/layout.js');

const scene = new THREE.Scene();
const world = new World(scene, new Colliders());
world.textureSize = 2048;
const t0 = performance.now();
await world.build((p, m) => log('construction', Math.round(p * 100) + ' %', m));
log('monde construit en', Math.round(performance.now() - t0), 'ms');
window.__exportWorld = world;

// ---------- Relief ----------
// Hauteurs analytiques (la fonction du jeu web, pas son maillage à 6 m) sur une grille de 2 m couvrant le carré du monde.
const STEP = 2;
const N = WORLD.size / STEP + 1;
const heights = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = analyticHeight(-WORLD.half + i * STEP, -WORLD.half + j * STEP);
await send('terrain.bin', heights.buffer);
let hmin = Infinity, hmax = -Infinity;
for (const h of heights) (hmin = Math.min(hmin, h)), (hmax = Math.max(hmax, h));

// Cartes du sol : couleurs peintes et classes de matériaux (les mêmes que le shader de sol web).
await send('ground_color.png', await canvasPng(world.terrainCanvas));
{
  const { data, size } = world.groundSplat;
  // Octets bruts RGBA (une image de canvas prémultiplierait l'alpha et effacerait les autres canaux là où A = 0).
  await send('ground_splat.rgba', data.slice().buffer);
  log('carte des matériaux', size, 'px');
}

// ---------- Architecture ----------
// Les lots statiques sont peints par sommet (couleurs linéaires). Chaque triangle est rangé dans une classe de matériau
// d'après sa couleur et son orientation ; ses coordonnées de texture sont projetées sur le plan dominant (en mètres).
const _c = new THREE.Color();
// Unreal (Interchange) range les couleurs de sommet glTF telles quelles dans des octets lus comme sRGB : on les encode
// donc en sRGB (sinon elles seraient linéarisées deux fois : façades saturées, feuillages trop sombres).
const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function srgbColors(g) {
  const a = g.attributes.color;
  if (!a) return g;
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = k < 3 ? toSRGB(a.array[i * a.itemSize + k]) : a.array[i * a.itemSize + k];
  g.setAttribute('color', new THREE.Float32BufferAttribute(out, a.itemSize));
  return g;
}
// Même suite de tests que le shader des surfaces du jeu web (surfaces.js, SURFACE_MAIN), sur la couleur encodée
// (c = couleur^(1/2.2)) et l'orientation de la face ; chaque branche devient un matériau Unreal.
function classify(r, g, b, ny) {
  const c = [r, g, b].map((v) => Math.pow(Math.max(v, 0), 1 / 2.2));
  const mx = Math.max(...c), mn = Math.min(...c);
  const sat = (mx - mn) / (mx + 1e-4);
  const up = Math.abs(ny);
  const sloped = up > 0.25 && up < 0.97, vertical = up < 0.25;
  const warm = c[0] > c[2] * 1.12;
  if (c[1] < 0.04 && c[0] > 0.25 && c[2] > 0.7) return 'colombage';
  if (warm && c[1] > c[0] * 1.15) return 'foliage';
  if (sloped && mx < 0.5 && !warm) return 'roof_slate';
  if (sloped && warm && sat > 0.2) return 'roof_tile';
  if (vertical && warm && sat > 0.3 && mx > 0.5 && mx < 0.85 && c[1] < c[0] * 0.75) return 'brick';
  if (warm && sat > 0.3 && mx >= 0.72 && c[1] > c[0] * 0.78 && c[2] < c[1] * 0.75) return 'straw';
  if (warm && sat > 0.25 && mx < 0.72) return 'wood';
  if (vertical && mx < 0.28 && sat < 0.2) return 'wood_dark';
  if (mx > 0.8 && sat < 0.2) return 'plaster';
  if (sat < 0.15 && mx > 0.45 && mx <= 0.8) return 'stone';
  if (mx < 0.2 && sat < 0.2) return 'metal';
  return 'paint';
}

function splitByClass(geo, fixed) {
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal?.array;
  const col = geo.attributes.color?.array;
  const idx = geo.index ? geo.index.array : null;
  const triCount = idx ? idx.length / 3 : pos.length / 9;
  const buckets = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromArray(pos, i0 * 3);
    b.fromArray(pos, i1 * 3);
    c.fromArray(pos, i2 * 3);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    let cr = 1, cg = 1, cb = 1;
    if (col) {
      cr = (col[i0 * 3] + col[i1 * 3] + col[i2 * 3]) / 3;
      cg = (col[i0 * 3 + 1] + col[i1 * 3 + 1] + col[i2 * 3 + 1]) / 3;
      cb = (col[i0 * 3 + 2] + col[i1 * 3 + 2] + col[i2 * 3 + 2]) / 3;
    }
    const cls = fixed || classify(cr, cg, cb, n.y);
    let B = buckets.get(cls);
    if (!B) buckets.set(cls, (B = { p: [], n: [], c: [], uv: [] }));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    // Vitres et lampes : décollées de 2,5 cm de leur mur (sinon elles se battent en profondeur avec lui).
    const lift = cls === 'glass' || cls === 'lamp' ? 0.025 : 0;
    for (const i of [i0, i1, i2]) {
      const x = pos[i * 3] + n.x * lift, y = pos[i * 3 + 1] + n.y * lift, z = pos[i * 3 + 2] + n.z * lift;
      B.p.push(x, y, z);
      if (nor) B.n.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
      else B.n.push(n.x, n.y, n.z);
      if (col) B.c.push(toSRGB(col[i * 3]), toSRGB(col[i * 3 + 1]), toSRGB(col[i * 3 + 2]), 1);
      else B.c.push(1, 1, 1, 1);
      // Projection planaire (m) : murs selon leur plan vertical, sols et toits vus de dessus.
      if (ay >= ax && ay >= az) B.uv.push(x, z);
      else if (ax >= az) B.uv.push(z * Math.sign(n.x || 1), -y);
      else B.uv.push(-x * Math.sign(n.z || 1), -y);
    }
  }
  const parts = [];
  for (const [cls, B] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    parts.push([cls, g]);
  }
  return parts;
}

const MATS = new Map();
const matFor = (name) => {
  if (!MATS.has(name)) {
    const m = new THREE.MeshStandardMaterial({ name, vertexColors: true });
    MATS.set(name, m);
  }
  return MATS.get(name);
};
const { mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js');
function chunkMesh(name, geo, fixed) {
  const parts = splitByClass(geo, fixed);
  if (!parts.length) return null;
  const geos = [], mats = [];
  for (const [cls, g] of parts) {
    geos.push(mergeVertices(g, 1e-4));
    mats.push(matFor(cls));
  }
  const merged = mergeGeometries(geos, true);
  const mesh = new THREE.Mesh(merged, mats);
  mesh.name = name;
  return mesh;
}

const arch = new THREE.Scene();
const classTris = {};
let archTris = 0;
const chunkLists = [
  ['static', world.chunks.filter((m) => m.name.startsWith('static:')), null],
  ['detail', world.detailChunks, null],
  ['glass', world.chunks.filter((m) => m.name.startsWith('glass:')), 'glass'],
  ['lights', world.chunks.filter((m) => m.name.startsWith('lights:')), 'lamp'],
];
for (const [kind, list, fixed] of chunkLists) {
  for (const m of list) {
    const key = m.name.split(':')[1].replace(',', '_').replace(/-/g, 'm');
    const mesh = chunkMesh(`${kind}_${key}`, m.geometry, fixed);
    if (!mesh) continue;
    for (const gr of mesh.geometry.groups) {
      const cls = mesh.material[gr.materialIndex].name;
      classTris[cls] = (classTris[cls] || 0) + gr.count / 3;
      archTris += gr.count / 3;
    }
    arch.add(mesh);
  }
}
log('architecture', Math.round(archTris), 'triangles', JSON.stringify(classTris));

// Routes : reconstruites dans Unreal à partir du tracé (world_architecture.json) et du relief exporté.

// Panneaux et enseignes texturés (textures dessinées du jeu web) : exportés avec leurs textures.
let signs = 0;
world.group.traverse((o) => {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!m?.map || o.name === 'terrain' || o.name.startsWith('tree') || o.name.startsWith('hedges')) return;
  if (!(m.map.image instanceof HTMLCanvasElement || m.map.image instanceof ImageBitmap || m.map.image?.width)) return;
  o.updateWorldMatrix(true, false);
  const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const mat = new THREE.MeshStandardMaterial({ name: `sign_${signs}`, map: m.map, transparent: m.transparent, alphaTest: m.alphaTest || 0 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = `sign_${signs++}`;
  arch.add(mesh);
});
log('panneaux', signs);

const exporter = new GLTFExporter();
const glb = (obj) => exporter.parseAsync(obj, { binary: true, onlyVisible: false, maxTextureSize: 2048 });
await send('architecture.glb', await glb(arch));

// ---------- Végétation ----------
const veg = world.veg;
const trees = new THREE.Scene();
const leafMat = new THREE.MeshStandardMaterial({ name: 'leaves', vertexColors: true });
const barkMat = {};
veg.variants.forEach((V, i) => {
  const d = V.data;
  const node = new THREE.Group();
  node.name = `tree_${d.kind}_${d.variant}`;
  barkMat[d.bark] ||= new THREE.MeshStandardMaterial({ name: `bark_${d.bark}`, vertexColors: true });
  const wood = new THREE.Mesh(d.wood, barkMat[d.bark]);
  wood.name = `${node.name}_wood`;
  const leaves = new THREE.Mesh(d.leaves, leafMat);
  leaves.name = `${node.name}_leaves`;
  const g = mergeGeometries([d.wood, d.leaves].map((x) => {
    const c = x.clone();
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) c.deleteAttribute(k);
    if (!c.attributes.color) {
      const n = c.attributes.position.count;
      c.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    return srgbColors(c);
  }), true);
  const mesh = new THREE.Mesh(g, [barkMat[d.bark], leafMat]);
  mesh.name = node.name;
  trees.add(mesh);
});
await send('trees.glb', await glb(trees));
const inst = veg.list.map((t, i) => {
  const d = veg.variants[veg.vidx[i]].data;
  return [veg.vidx[i], +t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3), +t.rot.toFixed(4), +t.s.toFixed(3), +t.sy.toFixed(3), +veg.tints[i * 3].toFixed(3), +veg.tints[i * 3 + 1].toFixed(3), +veg.tints[i * 3 + 2].toFixed(3), d.kind === 'bush' ? 0 : 1];
});
const variants = veg.variants.map((V) => ({ name: `tree_${V.data.kind}_${V.data.variant}`, kind: V.data.kind, H: +V.data.H.toFixed(2), R: +V.data.R.toFixed(2), bark: V.data.bark, n: V.n }));
await send('trees.json', JSON.stringify({ schema: 'strides.trees/1', frame: 'web: x est, y haut, z sud (m) ; rot autour de y (rad)', fields: ['variant', 'x', 'y', 'z', 'rot', 's', 'sy', 'tintR', 'tintG', 'tintB', 'collide'], variants, instances: inst }));

// Haies : maillages construits par le jeu web (volumes feuillus et cartes de feuilles).
const hedges = new THREE.Scene();
let hedgeN = 0;
world.group.traverse((o) => {
  if (!o.isMesh || !o.name.startsWith('hedges')) return;
  o.updateWorldMatrix(true, false);
  const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  srgbColors(g);
  const isLeaf = o.material === veg.leafMat || o.material?.alphaTest > 0;
  const mesh = new THREE.Mesh(g, isLeaf ? leafMat : new THREE.MeshStandardMaterial({ name: 'hedge_hull', vertexColors: !!g.attributes.color }));
  mesh.name = `hedge_${hedgeN++}`;
  hedges.add(mesh);
});
await send('hedges.glb', await glb(hedges));

// Textures de végétation du jeu web.
const { leafAtlas, barkTextures, hedgeTextures } = await import('/src/world/vegTextures.js');
await send('leaf_atlas.png', await imagePng(leafAtlas().texture.image));
for (const t of ['fissured', 'smooth', 'birch', 'pine']) {
  const b = barkTextures(t);
  await send(`bark_${t}.png`, await imagePng(b.map.image));
  await send(`bark_${t}_n.png`, await imagePng(b.normalMap.image));
}
{
  const h = hedgeTextures();
  await send('hedge.png', await imagePng(h.map.image));
  await send('hedge_n.png', await imagePng(h.normalMap.image));
}

// ---------- Description ----------
const H = world.features;
await send('world_scene.json', JSON.stringify({
  schema: 'strides.world_scene/1',
  source: 'src/world (World.build), exporté par scripts/unreal/world-export.js',
  frame: 'web : x est, y haut, z sud, mètres',
  terrain: { file: 'terrain.bin', format: 'float32 LE, ligne par ligne (z croissant), x croissant', origin: [-WORLD.half, -WORLD.half], step: STEP, n: N, min: hmin, max: hmax },
  groundMaps: { color: 'ground_color.png', splat: 'ground_splat.rgba', splatSize: world.groundSplat.size, covers: [-WORLD.half, -WORLD.half, WORLD.half, WORLD.half], splatChannels: 'R herbe, G terre, B sable, A sol dur' },
  architecture: { file: 'architecture.glb', triangles: Math.round(archTris), classes: classTris },
  trees: { count: inst.length, variants: variants.length },
  hedges: hedgeN,
  pond: { ...(await import('/src/world/layout.js')).POND },
  roads: (await import('/src/world/layout.js')).ROADS.map((r) => ({ id: r.id, w: r.w, pts: r.pts })),
  buildings: H.buildings,
}, null, 1));
log('EXPORT TERMINÉ');
window.__ready = true;
