// Export vers Unreal des obstacles du parcours CSO du Pôle, de ses lignes de départ et d'arrivée et du poteau « Chrono »
// (tranche T5 de unreal/docs/parite/cso-ecarts.md). Module chargé DANS le jeu web en cours d'exécution par
// scripts/unreal/export-cso-runs.mjs --fences (mêmes polices, même relief, mêmes textures que les captures jumelles).
//
// Principe : les pièces sont construites par le code du jeu web lui-même (classe Obstacles de src/gameplay/obstacles.js,
// fonctions showJumpGeo / railGeo de src/world/builders.js, poteau de src/gameplay/activities.js), sur un jeu « témoin »
// (scène vide, relief du jeu, collisions ignorées). Pendant la construction, chaque primitive (box, cyl, ico, cylindre
// des barres…) est relevée à sa création (fichier:ligne de l'appel, pile d'exécution) puis à sa peinture (couleur,
// nombre de sommets, dans l'ordre de la fusion). Les sommets d'un maillage fusionné se découpent donc exactement en
// pièces : chaque pièce prend une catégorie (table SITES) et les primitives d'une même catégorie qui se touchent forment
// une pièce (un chandelier = montant, bandes et pieds ; une jardinière = bac, buis et fleurs…). Aucune valeur n'est
// recopiée : positions, couleurs, hauteurs, matériaux et textures sont lus dans les objets construits.
//
// Vérification : la construction témoin est comparée au jeu réel (mêmes sommets, au bit près) hors épreuve (avant le
// lancement de l'activité, hauteurs csoHeights(1.15)) et en épreuve (après l'entrée en piste, hauteurs de l'activité).
//
// Sorties (renvoyées au script Node, base64) : cso_fences.glb (un nœud par maillage unique, centré sur sa pièce, couleurs
// de sommet encodées sRGB comme world-export.js), sign_*.png (textures des panneaux), et le manifeste
// cso_fences.json (pièces, positions locales et monde, hauteurs par état, couleurs de surlignage, matériaux).
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Catégorie de chaque site de création de primitive (fichier:ligne du jeu web). Un site absent de la table arrête
// l'export (le jeu web a changé : relire le code, puis mettre la table à jour).
const SITES = [
  ['world/builders.js', 602, 606, 'chandelier'], // montant intérieur, bandes de couleur, pieds en croix (showJumpGeo)
  ['world/builders.js', 609, 615, 'aile'], // montant extérieur, lisse inclinée, lattes
  ['world/builders.js', 627, 627, 'taquet'], // coupelles sous les barres
  ['world/builders.js', 632, 643, 'remplissage'], // planche peinte (vertical) ou bac de fleurs (oxer)
  ['world/builders.js', 649, 650, 'fanion'], // fanions des chandeliers
  ['world/builders.js', 660, 665, 'barre'], // railGeo : bandes et embouts (barre du haut ou barre basse selon le maillage)
  ['gameplay/obstacles.js', 120, 120, 'mur'], // bloc de briques
  ['gameplay/obstacles.js', 121, 121, 'couvertine'],
  ['gameplay/obstacles.js', 122, 125, 'pilier'], // piliers et leurs chapeaux
  ['gameplay/obstacles.js', 227, 227, 'poteau'], // poteaux des lignes de départ et d'arrivée
  ['gameplay/obstacles.js', 228, 228, 'fanion'],
  ['gameplay/obstacles.js', 233, 233, 'trepied'], // pieds du trépied des cellules
  ['gameplay/obstacles.js', 235, 236, 'cellule'], // cellule photoélectrique et son œil
  ['gameplay/obstacles.js', 239, 239, 'ligne'], // ligne de sciure au sol
  ['gameplay/obstacles.js', 685, 687, 'fanion'], // flagsGeo (fanions réglementaires)
  ['gameplay/obstacles.js', 697, 701, 'jardiniere'], // planterGeo
  ['gameplay/activities.js', 71, 71, 'mat'], // poteau « Chrono » : mât
  ['gameplay/activities.js', 72, 73, 'panneau_chrono'], // poteau « Chrono » : panneau noir et blanc
];
const R6 = (v) => Math.round(v * 1e6) / 1e6;
const v3 = (v) => [R6(v.x), R6(v.y), R6(v.z)];

function siteOf(stack) {
  for (const line of stack.split('\n').slice(1)) {
    if (line.includes('cso-export.js')) continue;
    const m = line.match(/\/src\/([\w/]+\.js)(?:\?[^:)]*)?:(\d+):\d+/);
    if (!m || m[1] === 'world/shapes.js') continue;
    return `${m[1]}:${m[2]}`;
  }
  return '?';
}
function categoryOf(site) {
  const [f, l] = site.split(':');
  const n = +l;
  const s = SITES.find(([file, a, b]) => file === f && n >= a && n <= b);
  return s ? s[3] : null;
}
// Empreinte FNV-1a 32 bits d'une chaîne (identifiants de maillages, comparaisons au jeu réel).
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
const geoHash = (g) => fnv(Array.from(g.attributes.position.array, (v) => v.toFixed(6)).join(',') + '|' + (g.attributes.color ? Array.from(g.attributes.color.array, (v) => v.toFixed(5)).join(',') : ''));
const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hexOf = (r, g, b) => '#' + new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace).getHexString();
// Barycentre des sommets d'un maillage exporté (repère du maillage) : point non symétrique en général, qui fixe
// l'orientation d'une pièce (le centre de sa boîte englobante, son pivot, ne la fixe pas).
function centroid(geo) {
  const a = geo.attributes.position.array, c = new THREE.Vector3();
  for (let i = 0; i < a.length; i += 3) c.x += a[i], c.y += a[i + 1], c.z += a[i + 2];
  return c.multiplyScalar(3 / a.length);
}

// ---------------------------------------------------------------- Relevé des primitives pendant la construction
const REC = new WeakMap();
let LOG = null;
function install() {
  const proto = THREE.BufferGeometry.prototype;
  const setAttr = proto.setAttribute, clone = proto.clone;
  Error.stackTraceLimit = 40;
  proto.setAttribute = function (name, attr) {
    if (LOG) {
      if (name === 'position' && !REC.has(this)) REC.set(this, { site: siteOf(new Error().stack) });
      // Peinture d'une pièce (shapes.js paint) : seulement l'appel direct de paint, pas les copies d'attributs.
      if (name === 'color') {
        const caller = new Error().stack.split('\n').slice(1).find((l) => !l.includes('cso-export.js')) || '';
        if (/\bat paint \(.*\/src\/world\/shapes\.js/.test(caller)) {
          const a = attr.array;
          LOG.push({ site: REC.get(this)?.site || '?', n: attr.count, color: hexOf(a[0], a[1], a[2]) });
        }
      }
    }
    return setAttr.call(this, name, attr);
  };
  proto.clone = function () {
    const c = clone.call(this);
    if (REC.has(this)) REC.set(c, REC.get(this));
    return c;
  };
  return () => {
    proto.setAttribute = setAttr;
    proto.clone = clone;
  };
}
// Relevé propre à chaque appel d'une méthode (pièces peintes pendant l'appel), rangé par `store`.
function track(cls, method, store) {
  const orig = cls.prototype[method];
  cls.prototype[method] = function (...args) {
    const start = LOG.length;
    const r = orig.apply(this, args);
    store(this, args, r, LOG.slice(start));
    return r;
  };
  return () => (cls.prototype[method] = orig);
}

// ---------------------------------------------------------------- Pièces d'un maillage fusionné
// Découpe les sommets d'un maillage peint en pièces : primitives dans l'ordre de la fusion, catégorie du site, puis
// regroupement des primitives d'une même catégorie dont les boîtes englobantes se touchent (1 mm).
function piecesOf(mesh, parts, role) {
  const g = mesh.geometry, pos = g.attributes.position;
  let off = 0;
  const P = parts.map((p) => {
    const q = { ...p, v0: off, v1: off + p.n, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    off += p.n;
    for (let i = q.v0; i < q.v1; i++) for (let k = 0; k < 3; k++) {
      const v = pos.array[i * 3 + k];
      if (v < q.min[k]) q.min[k] = v;
      if (v > q.max[k]) q.max[k] = v;
    }
    let cat = categoryOf(p.site);
    if (!cat) throw new Error(`site de primitive inconnu ${p.site} (maillage ${role}) : mettre à jour SITES de cso-export.js`);
    if (cat === 'barre' && role !== 'rail') cat = 'barre_basse';
    q.cat = cat;
    return q;
  });
  if (off !== pos.count) throw new Error(`découpage ${role} : ${off} sommets relevés pour ${pos.count}`);
  const parent = P.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const E = 1e-3;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    if (P[i].cat !== P[j].cat) continue;
    if ([0, 1, 2].every((k) => P[i].min[k] <= P[j].max[k] + E && P[j].min[k] <= P[i].max[k] + E)) parent[find(i)] = find(j);
  }
  const groups = new Map();
  P.forEach((p, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(p);
  });
  // Ordre stable : ordre de construction de la première primitive de chaque pièce.
  return [...groups.values()].map((ps) => ({ cat: ps[0].cat, parts: ps, colors: [...new Set(ps.map((p) => p.color))] }));
}

// Géométrie d'une pièce (sommets de ses primitives), recentrée sur son pivot. Couleurs encodées sRGB pour Interchange.
function pieceGeometry(mesh, piece, pivot, flat) {
  const g = mesh.geometry;
  const pos = g.attributes.position.array, nor = g.attributes.normal?.array, col = g.attributes.color?.array, uv = g.attributes.uv?.array;
  const map = new Int32Array(g.attributes.position.count).fill(-1);
  const P = [], N = [], C = [], U = [];
  let k = 0;
  for (const p of piece.parts) for (let i = p.v0; i < p.v1; i++) {
    map[i] = k++;
    P.push(pos[i * 3] - pivot[0], pos[i * 3 + 1] - pivot[1], pos[i * 3 + 2] - pivot[2]);
    if (nor) N.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
    if (col) C.push(toSRGB(col[i * 3]), toSRGB(col[i * 3 + 1]), toSRGB(col[i * 3 + 2]));
    if (uv) U.push(uv[i * 2], 1 - uv[i * 2 + 1]); // convention glTF : v = 0 en haut de l'image
  }
  const idx = [];
  const I = g.index ? g.index.array : null;
  const tri = I ? I.length / 3 : pos.length / 9;
  for (let t = 0; t < tri; t++) {
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    if (map[a] < 0) continue;
    if (map[b] < 0 || map[c] < 0) throw new Error('triangle à cheval sur deux pièces');
    idx.push(map[a], map[b], map[c]);
  }
  let out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (N.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (C.length) out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  if (U.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  out.setIndex(idx);
  // Matériau à facettes du poteau (flatShading) : normales de face.
  if (flat) {
    out = out.toNonIndexed();
    out.deleteAttribute('normal');
    out.computeVertexNormals();
  }
  return out;
}

// ---------------------------------------------------------------- Export
export async function exportCso(g, opts) {
  const O = await import('/src/gameplay/obstacles.js');
  const { Activities } = await import('/src/gameplay/activities.js');
  const { csoHeights } = await import('/src/gameplay/csoCourse.js');
  const { signTexture } = await import('/src/world/textures.js');
  const EN = (await import('/src/i18n/en/systems.js')).default;
  const files = {};
  const meshes = new Map(); // id -> { geo, material, cat }
  const uninstall = [install()];
  LOG = [];
  const partsOfFence = new Map(), partsOfLine = new Map();
  let markerParts = null;
  uninstall.push(track(O.Obstacles, '_mesh', (self, [ob], r, parts) => partsOfFence.set(ob, { parts, group: ob.group })));
  uninstall.push(track(O.Obstacles, '_timingLine', (self, [L], r, parts) => partsOfLine.set(L, { parts, mesh: r[0], sign: r[1] })));
  uninstall.push(track(Activities, '_markers', (self, a, r, parts) => (markerParts = parts)));
  // Jeu témoin : scène vide, relief et textures du jeu, collisions et interactions ignorées.
  const stub = {
    scene: new THREE.Scene(),
    terrain: g.terrain,
    colliders: { addBox: () => ({}) },
    world: { culled: [], detailTex: g.world.detailTex },
    interact: { add: () => {} },
  };
  let W, A;
  const states = [];
  const fenceStates = new Map();
  const texOf = new Map();
  // Matériau de chaque maillage exporté (classe Unreal) : bois peint des obstacles, mur, poteau mat, panneaux.
  const materials = {};
  const addMesh = (cat, geo, material) => {
    const key = material + '|' + Array.from(geo.attributes.position.array, (v) => v.toFixed(4)).join(',') + '|' + Array.from(geo.attributes.normal?.array || [], (v) => v.toFixed(3)).join(',') + '|' + Array.from(geo.attributes.color?.array || [], (v) => v.toFixed(4)).join(',') + '|' + Array.from(geo.attributes.uv?.array || [], (v) => v.toFixed(4)).join(',') + '|' + Array.from(geo.index ? geo.index.array : []).join(',');
    const id = `${cat}_${fnv(key)}`;
    const prev = meshes.get(id);
    if (prev && prev.key !== key) throw new Error(`collision d'empreinte ${id}`);
    if (!prev) meshes.set(id, { key, geo, material, cat });
    return id;
  };
  const signTex = (mat, name) => {
    const img = mat.map.image;
    if (!texOf.has(img)) {
      files[`${name}.png`] = img.toDataURL('image/png').split(',')[1];
      texOf.set(img, { name, w: img.width, h: img.height });
    }
    return texOf.get(img).name;
  };
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  // Pièces d'un groupe (obstacle) : maillages peints découpés, barres du haut (une pièce par barre, pivot à l'axe de la
  // barre), panneau (plan texturé). Positions locales (repère du groupe) et monde.
  const groupPieces = (group, parts, ob, flat = false) => {
    group.updateMatrixWorld(true);
    const out = [];
    let i = 0;
    for (const m of group.children) {
      if (!m.isMesh) continue;
      const isRail = ob && ob.rails.includes(m), isSign = ob && m === ob.sign;
      if (isSign) {
        const sg = pieceGeometry(m, { parts: [{ v0: 0, v1: m.geometry.attributes.position.count }] }, [0, 0, 0]);
        const id = addMesh('panneau', sg, 'sign');
        const pw = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
        out.push({ cat: 'panneau', mesh: id, p: v3(m.position), yaw: R6(m.rotation.y), w: v3(pw), wc: v3(centroid(sg).applyMatrix4(m.matrixWorld)), tex: signTex(m.material, `sign_${slug(ob.label)}`) });
        continue;
      }
      const n = m.geometry.attributes.position.count;
      const take = [];
      let s = 0;
      while (s < n) {
        const p = parts[i++];
        if (!p) throw new Error('primitives épuisées');
        take.push(p);
        s += p.n;
      }
      if (s !== n) throw new Error(`maillage de ${n} sommets, primitives : ${s}`);
      const material = flat ? 'matte' : m.material === MAT_WALL ? 'wall' : 'paint';
      const pcs = piecesOf(m, take, isRail ? 'rail' : 'fixed');
      for (const pc of pcs) {
        let mat = material;
        if (material === 'wall') mat = pc.cat === 'mur' || pc.cat === 'pilier' ? 'wall_brick' : 'wall_cap';
        // Pivot : centre de la boîte englobante de la pièce ; barre du haut : origine de la barre (axe de rotation).
        const min = [0, 1, 2].map((k) => Math.min(...pc.parts.map((p) => p.min[k]))), max = [0, 1, 2].map((k) => Math.max(...pc.parts.map((p) => p.max[k])));
        const pivot = isRail ? [0, 0, 0] : [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
        const pg = pieceGeometry(m, pc, pivot, flat);
        const id = addMesh(pc.cat, pg, mat);
        const local = new THREE.Vector3(...pivot).applyMatrix4(m.matrix);
        const world = new THREE.Vector3(...pivot).applyMatrix4(m.matrixWorld);
        const wc = centroid(pg).add(new THREE.Vector3(...pivot)).applyMatrix4(m.matrixWorld);
        const e = { cat: pc.cat, mesh: id, p: v3(local), yaw: R6(m.rotation.y), w: v3(world), wc: v3(wc) };
        if (isRail) e.rail = ob.rails.indexOf(m);
        out.push(e);
        materials[mat] ||= { roughness: m.material.roughness, metalness: m.material.metalness, ...(flat ? { flatShading: !!m.material.flatShading } : {}) };
      }
    }
    if (i !== parts.length) throw new Error(`${parts.length - i} primitives non attribuées`);
    return out;
  };
  const counts = (pcs) => {
    const c = {};
    for (const p of pcs) c[p.cat] = (c[p.cat] || 0) + 1;
    return Object.fromEntries(Object.entries(c).sort());
  };
  let MAT_WALL = null;
  try {
    W = new O.Obstacles(stub);
    const list = W.ofCourse('cso');
    MAT_WALL = list.find((o) => o.kind === 'w')?.group.children[0].material;
    // État hors épreuve (construction du jeu : csoHeights de _build).
    const snap = (id) => {
      for (const o of list) {
        const { parts, group } = partsOfFence.get(o);
        if (group !== o.group) throw new Error('groupe inattendu');
        const pieces = groupPieces(o.group, parts, o);
        if (!fenceStates.has(o)) fenceStates.set(o, {});
        fenceStates.get(o)[id] = { h: R6(o.h), pieces, counts: counts(pieces) };
      }
      return list.map((o) => R6(o.h));
    };
    // Hauteurs de base relevées dans le source (obstacles.js _build, activities.js cso_train), puis recoupées par la
    // construction : csoHeights(base) doit redonner les hauteurs des obstacles construits.
    const src = async (p) => (await import(/* @vite-ignore */ `${p}?raw`)).default;
    const bOff = +(await src('/src/gameplay/obstacles.js')).match(/_build\(\) \{\s*const heights = csoHeights\(([\d.]+)\)/)[1];
    const actSrc = await src('/src/gameplay/activities.js');
    const bIn = +actSrc.slice(actSrc.indexOf("id: 'cso_train'")).match(/heights: csoHeights\(([\d.]+)\)/)[1];
    const hOff = snap('hors-epreuve');
    if (JSON.stringify(hOff) !== JSON.stringify(csoHeights(bOff).map(R6))) throw new Error(`hors épreuve : ${hOff} ≠ csoHeights(${bOff})`);
    states.push({ id: 'hors-epreuve', base: bOff, heights: hOff, desc: 'monde hors épreuve (obstacles.js _build : csoHeights(base))' });
    // Comparaison au jeu réel hors épreuve (signature relevée par le script avant le lancement de l'activité).
    const sigOff = signature(W, list);
    if (opts.liveOff && JSON.stringify(sigOff) !== JSON.stringify(opts.liveOff)) throw new Error('hors épreuve : construction témoin différente du jeu réel');
    // État de l'épreuve : hauteurs posées à l'entrée en piste, relevées dans le jeu réel (courses.js:453).
    W.setHeights('cso', opts.inHeights);
    const hIn = snap('epreuve');
    if (JSON.stringify(hIn) !== JSON.stringify(csoHeights(bIn).map(R6))) throw new Error(`épreuve : ${hIn} ≠ csoHeights(${bIn})`);
    states.push({ id: 'epreuve', base: bIn, heights: hIn, desc: 'épreuve, dès l’entrée en piste (courses.js:453 setHeights, heights de activities.js cso_train)' });
    const sigIn = signature(W, list);
    if (opts.liveIn && JSON.stringify(sigIn) !== JSON.stringify(opts.liveIn)) throw new Error('épreuve : construction témoin différente du jeu réel');
    // Surlignage du numéro attendu (Obstacles.highlight) : couleurs lues sur les panneaux.
    W.highlight('cso', list[0].num);
    const hl = { on: '#' + list[0].sign.material.color.getHexString(), off: '#' + list[1].sign.material.color.getHexString() };
    W.highlight('cso', -1);
    const fences = list.map((o) => ({
      num: o.num, label: o.label, kind: o.kind, spread: R6(o.spread), x: R6(o.x), z: R6(o.z), rot: R6(o.rot), ground: R6(o.ground), w: R6(o.w), colors: o.colors,
      states: fenceStates.get(o),
    }));
    // Jalon J2c (lot J2-D) : vertical et oxer du paddock d'échauffement du Pôle (obstacles.js:199-201, course « warmup »),
    // hauteurs fixes (1,10 et 1,00 m), sans panneau ; une seule pose (« paddock »).
    const warm = W.ofCourse('warmup');
    if (warm.length !== 2) throw new Error(`paddock : ${warm.length} obstacles`);
    const warmup = warm.map((o, i) => {
      const { parts, group } = partsOfFence.get(o);
      if (group !== o.group) throw new Error('groupe inattendu (paddock)');
      const pieces = groupPieces(o.group, parts, o);
      return { index: i, label: o.label, kind: o.kind, spread: R6(o.spread), x: R6(o.x), z: R6(o.z), rot: R6(o.rot), ground: R6(o.ground), w: R6(o.w), h: R6(o.h), colors: o.colors, pieces, counts: counts(pieces) };
    });
    // Lignes de départ et d'arrivée (Obstacles._timingLine).
    const lines = [['start', O.CSO_START, 'DÉPART'], ['finish', O.CSO_FINISH, 'ARRIVÉE']].map(([id, L, key]) => {
      const { parts, mesh, sign } = partsOfLine.get(L);
      // Ligne : un maillage posé au sol et tourné de L.rot (repère du groupe = repère de la ligne).
      const grp = new THREE.Group();
      grp.position.copy(mesh.position);
      grp.rotation.copy(mesh.rotation);
      grp.add(new THREE.Mesh(mesh.geometry, mesh.material));
      const pieces = groupPieces(grp, parts, null);
      // Panneau : hors du groupe de la ligne ; position et cap exprimés aussi dans le repère de la ligne.
      sign.updateMatrixWorld(true);
      const inv = grp.matrixWorld.clone().invert();
      const pl = new THREE.Vector3().setFromMatrixPosition(sign.matrixWorld).applyMatrix4(inv);
      const sgeo = pieceGeometry(sign, { parts: [{ v0: 0, v1: sign.geometry.attributes.position.count }] }, [0, 0, 0]);
      const sid = addMesh('panneau', sgeo, 'sign');
      const fr = signTex(sign.material, `sign_${slug(key)}`);
      const enLabel = EN[key];
      if (!enLabel) throw new Error(`traduction anglaise absente : ${key}`);
      const en = signTex({ map: signTexture(enLabel, '', { dark: true, w: sign.material.map.image.width, h: sign.material.map.image.height }) }, `sign_${slug(enLabel)}`);
      pieces.push({ cat: 'panneau', mesh: sid, p: v3(pl), yaw: R6(sign.rotation.y - mesh.rotation.y), w: v3(new THREE.Vector3().setFromMatrixPosition(sign.matrixWorld)), wc: v3(centroid(sgeo).applyMatrix4(sign.matrixWorld)), tex: fr, texEn: en });
      return { id, x: R6(L.x), z: R6(L.z), rot: R6(L.rot), w: R6(L.w), ground: R6(mesh.position.y), pieces, counts: counts(pieces), hash: geoHash(mesh.geometry) };
    });
    // Poteau « Chrono » de l'activité cso_train (Activities._markers : un maillage par activité, géométrie commune).
    A = new Activities(stub);
    const k = A.defs.findIndex((a) => a.id === 'cso_train');
    const mk = stub.scene.children.filter((c) => c.isMesh)[k];
    const def = A.defs[k];
    const mpos = def.marker || { x: def.start.x + 3, z: def.start.z };
    if (mk.position.x !== mpos.x || mk.position.z !== mpos.z) throw new Error('poteau introuvable');
    const mgrp = new THREE.Group();
    mgrp.position.copy(mk.position);
    mgrp.rotation.copy(mk.rotation);
    mgrp.add(new THREE.Mesh(mk.geometry, mk.material));
    // Poteau à facettes (flatShading) : normales de face, matériau mat.
    const matte = groupPieces(mgrp, markerParts, null, true);
    const marker = { activity: 'cso_train', x: R6(mk.position.x), z: R6(mk.position.z), ground: R6(mk.position.y), rot: R6(mk.rotation.y), pieces: matte, counts: counts(matte), hash: geoHash(mk.geometry) };
    // Comparaison des lignes et du poteau au jeu réel.
    if (opts.liveLines && JSON.stringify(lines.map((l) => l.hash)) !== JSON.stringify(opts.liveLines)) throw new Error('lignes différentes du jeu réel');
    if (opts.liveMarker && marker.hash !== opts.liveMarker) throw new Error('poteau différent du jeu réel');
    // Panneaux : matériau sans éclairage, double face (MeshBasicMaterial, side DoubleSide).
    const sm = list[0].sign.material;
    materials.sign = { unlit: sm.type === 'MeshBasicMaterial', doubleSided: sm.side === THREE.DoubleSide };
    // GLB : un nœud par maillage unique.
    const scene = new THREE.Scene();
    const MATS = {};
    const tris = {};
    for (const [id, m] of [...meshes].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      MATS[m.material] ||= new THREE.MeshStandardMaterial({ name: `cso_${m.material}`, vertexColors: m.material !== 'sign' });
      const mesh = new THREE.Mesh(m.geo, MATS[m.material]);
      mesh.name = id;
      scene.add(mesh);
      tris[id] = (m.geo.index ? m.geo.index.count : m.geo.attributes.position.count) / 3;
    }
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false });
    files['cso_fences.glb'] = btoa(Array.from(new Uint8Array(glb), (b) => String.fromCharCode(b)).join(''));
    const meshInfo = {};
    for (const [id, m] of [...meshes].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      m.geo.computeBoundingBox();
      const bb = m.geo.boundingBox;
      meshInfo[id] = { cat: m.cat, material: m.material, tris: tris[id], verts: m.geo.attributes.position.count, min: v3(bb.min), max: v3(bb.max), c: v3(centroid(m.geo)) };
    }
    const sumTris = (pcs) => pcs.reduce((s, p) => s + tris[p.mesh], 0);
    const triangles = Object.fromEntries(states.map((s) => [s.id, fences.reduce((t, f) => t + sumTris(f.states[s.id].pieces), 0) + lines.reduce((t, l) => t + sumTris(l.pieces), 0) + sumTris(marker.pieces)]));
    const textures = Object.fromEntries([...texOf.values()].sort((a, b) => (a.name < b.name ? -1 : 1)).map((t) => [t.name, { file: `${t.name}.png`, w: t.w, h: t.h }]));
    const manifest = {
      schema: 'strides.cso_fences/1',
      generator: 'scripts/unreal/export-cso-runs.mjs --fences (scripts/unreal/cso-export.js, dans le jeu web en cours d’exécution)',
      source: 'src/gameplay/obstacles.js (Obstacles._mesh, _timingLine, flagsGeo, planterGeo), src/world/builders.js (showJumpGeo, railGeo), src/gameplay/activities.js (_markers)',
      frame: 'repère web : x est, y haut (altitude absolue), z sud, mètres ; groupe posé en (x, ground, z) et tourné de rot autour de y (axe de saut n = (sin rot, cos rot), barres le long de t = (cos rot, −sin rot)) ; p = position locale du pivot de la pièce (x le long des barres, y haut, z axe de saut), yaw = rotation locale autour de y, w = position monde du pivot, wc = position monde du barycentre c des sommets du maillage (fixe l’orientation) ; maillages centrés sur leur pivot (barres du haut : axe de la barre)',
      glb: 'cso_fences.glb',
      categories: SITES.map(([f, a, b, c]) => ({ cat: c, src: `src/${f}:${a}${b !== a ? `-${b}` : ''}` })),
      materials,
      highlight: hl,
      states,
      meshes: meshInfo,
      textures,
      triangles,
      fences,
      warmup,
      lines: lines.map(({ hash, ...l }) => l),
      marker: (({ hash, ...m }) => m)(marker),
      live: { horsEpreuve: !!opts.liveOff, epreuve: !!opts.liveIn, lignes: !!opts.liveLines, poteau: !!opts.liveMarker },
    };
    return { files, manifest };
  } finally {
    LOG = null;
    for (const u of uninstall.reverse()) u();
    W?.group.parent?.remove(W.group);
  }
}

// Signature d'obstacles (hauteurs et sommets de chaque maillage) : comparaison témoin / jeu réel.
function signature(W, list) {
  return list.map((o) => [o.num, R6(o.h), R6(o.ground), ...o.group.children.filter((m) => m.isMesh).map((m) => `${geoHash(m.geometry)}@${v3(m.position)}/${R6(m.rotation.x)},${R6(m.rotation.y)}`)]);
}

// Relevés du jeu réel, appelés par le script avant le lancement de l'activité (hors épreuve) et après l'entrée en piste.
export async function live(g) {
  const M = await import('/src/gameplay/obstacles.js');
  const O = g.obstacles;
  const list = O.ofCourse('cso');
  const lineHashes = [];
  for (const L of [M.CSO_START, M.CSO_FINISH]) {
    const m = O.group.children.find((c) => c.isMesh && c.material?.vertexColors && c.position.x === L.x && c.position.z === L.z);
    lineHashes.push(m ? geoHash(m.geometry) : null);
  }
  const def = g.activities.defs.find((a) => a.id === 'cso_train');
  const mpos = def.marker || { x: def.start.x + 3, z: def.start.z };
  const mk = g.scene.children.find((c) => c.isMesh && c.position.x === mpos.x && c.position.z === mpos.z);
  return { sig: signature(O, list), heights: list.map((o) => R6(o.h)), lines: lineHashes, marker: mk ? geoHash(mk.geometry) : null, highlight: list.filter((o) => o.sign && o.sign.material.color.getHexString() !== 'ffffff').map((o) => o.num) };
}
