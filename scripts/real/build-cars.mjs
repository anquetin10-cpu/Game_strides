// Prototype « rendu réaliste » : prépare les voitures réalistes (public/real/car_<id>.glb) à partir des modèles
// redistribués par TonPlaygramWebApp (commit figé), licences CC BY 4.0 (voir public/real/LICENSES.md).
//
// Étapes : décodage Draco ; logos et plaques retirés (le jeu n'affiche aucune marque) ; transformations appliquées ;
// modèle orienté comme les voitures du jeu (avant +z, gauche +x, sol à 0, origine au milieu de l'empattement) ;
// quatre roues découpées en objets séparés (pivot au moyeu) pour tourner et braquer ; maillages simplifiés au budget
// iPhone ; peinture marquée pour la teinte du jeu ; textures WebP 1K ; compression meshopt.
//
// Usage : node scripts/real/build-cars.mjs
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplifyPrimitive, meshopt, reorder, textureCompress, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { mat4, vec3 } from './mat.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = join(ROOT, 'node_modules/.cache/real-src');
const OUT = join(ROOT, 'public/real');
const SRC = 'https://raw.githubusercontent.com/TonPlaygramBot/TonPlaygramWebApp/ee96cdbe3b1faae07cb58d7ecf42c4e9407d8039/webapp/public/assets/tirana-streets/vehicle-collection';

// remove : matériaux retirés (logos, plaques) ; paint : matériaux de carrosserie teintés par le jeu ; tires : matériau
// des pneus (repère des roues) ; front : axe de l'avant dans le fichier ; tris : budget de triangles.
const CARS = {
  defender: { file: 'landrover.glb', remove: /^(logo|wire_087224198|mascara_negra_2|Pintura_\.001)/, paint: /^Pintura$/, tires: /^Borracha/, tris: 48000, front: 1 },
  punto: { file: 'fiat.glb', remove: /^gt_license/, paint: /^gt_body/, tires: /^gt_tire/, tris: 36000, tex: 512 },
};

async function fetchSrc(name) {
  const p = join(CACHE, `car_${name}`);
  if (existsSync(p)) return p;
  mkdirSync(CACHE, { recursive: true });
  const r = await fetch(`${SRC}/${name}`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  return p;
}

const tris = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() || 0) / 3, 0), 0);

// Applique une matrice aux positions et normales d'une primitive (copie propre à cette primitive).
function bake(prim, m) {
  const P = prim.getAttribute('POSITION');
  const pa = P.getArray().slice();
  for (let i = 0; i < pa.length; i += 3) pa.set(vec3.transformMat4([pa[i], pa[i + 1], pa[i + 2]], m), i);
  prim.setAttribute('POSITION', P.clone().setArray(pa));
  const N = prim.getAttribute('NORMAL');
  if (N) {
    const r = m.slice(0, 12).concat([0, 0, 0, 1]);
    r[12] = r[13] = r[14] = 0;
    const na = N.getArray().slice();
    for (let i = 0; i < na.length; i += 3) {
      const v = vec3.transformMat4([na[i], na[i + 1], na[i + 2]], r);
      const l = Math.hypot(...v) || 1;
      na.set([v[0] / l, v[1] / l, v[2] / l], i);
    }
    prim.setAttribute('NORMAL', N.clone().setArray(na));
  }
}

async function build(id, cfg) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.read(await fetchSrc(cfg.file));
  const root = doc.getRoot();
  const before = tris(doc);
  // Toutes les primitives à plat dans le repère du fichier (transformations des nœuds appliquées).
  const scene = root.listScenes()[0];
  const flat = [];
  const visit = (n, pw) => {
    const w = mat4.multiply(pw, mat4.compose(n.getTranslation(), n.getRotation(), n.getScale()));
    const mesh = n.getMesh();
    if (mesh) for (const p of mesh.listPrimitives()) flat.push([p, w]);
    for (const c of n.listChildren()) visit(c, w);
  };
  for (const n of scene.listChildren()) visit(n, mat4.identity());
  const keep = [];
  for (const [p, w] of flat) {
    const name = p.getMaterial()?.getName() || '';
    if (cfg.remove.test(name)) continue;
    // Intérieur (sellerie ajoutée par le redistributeur) : invisible derrière les vitres teintées, retiré.
    if (/leather upholstery/i.test(name)) continue;
    bake(p, w);
    keep.push(p);
  }
  // Repère du jeu : longueur sur l'axe horizontal le plus long, avant = côté opposé aux feux arrière (sinon +z).
  const box = (prims, filter = () => true) => {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of prims) {
      if (!filter(p)) continue;
      const a = p.getAttribute('POSITION').getArray();
      for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a[i + k]); mx[k] = Math.max(mx[k], a[i + k]); }
    }
    return { mn, mx };
  };
  const all = box(keep);
  const ext = all.mx.map((v, k) => v - all.mn[k]);
  const up = ext[1] < ext[0] && ext[1] < ext[2] ? 1 : ext[2] < ext[0] ? 2 : 0;
  const lenAxis = [0, 1, 2].filter((k) => k !== up).sort((a, b) => ext[b] - ext[a])[0];
  const latAxis = [0, 1, 2].find((k) => k !== up && k !== lenAxis);
  const tireBox = box(keep, (p) => cfg.tires.test(p.getMaterial()?.getName() || ''));
  // Sens de l'avant : feux arrière (verre « Freio » / « Lanterna », rouges) du côté arrière, sinon option front.
  let fwdSign = cfg.front ?? 1;
  const tail = box(keep, (p) => /Freio|Lanterna|tail/i.test(p.getMaterial()?.getName() || ''));
  if (cfg.front === undefined && tail.mx[lenAxis] > -1e8) fwdSign = (tail.mn[lenAxis] + tail.mx[lenAxis]) / 2 > (all.mn[lenAxis] + all.mx[lenAxis]) / 2 ? -1 : 1;
  // Roues : pneus regroupés par quadrant (gauche/droite, avant/arrière).
  const cen = [0, 1, 2].map((k) => (tireBox.mn[k] + tireBox.mx[k]) / 2);
  const quad = [0, 1, 2, 3].map(() => ({ mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }));
  for (const p of keep) {
    if (!cfg.tires.test(p.getMaterial()?.getName() || '')) continue;
    const a = p.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i += 3) {
      const q = (a[i + lenAxis] - cen[lenAxis]) * fwdSign > 0 ? 0 : 2;
      const s = a[i + latAxis] > cen[latAxis] ? 0 : 1;
      const Q = quad[q + s];
      for (let k = 0; k < 3; k++) { Q.mn[k] = Math.min(Q.mn[k], a[i + k]); Q.mx[k] = Math.max(Q.mx[k], a[i + k]); }
    }
  }
  const wheels = quad.map((Q, k) => ({
    c: Q.mn.map((v, j) => (v + Q.mx[j]) / 2),
    r: (Q.mx[up] - Q.mn[up]) / 2,
    hw: (Q.mx[latAxis] - Q.mn[latAxis]) / 2,
    front: k < 2,
  }));
  // Changement de repère : x = latéral (gauche +), y = haut, z = avant ; origine au sol, au milieu de l'empattement.
  const wb = Math.abs(((wheels[0].c[lenAxis] + wheels[1].c[lenAxis]) - (wheels[2].c[lenAxis] + wheels[3].c[lenAxis])) / 2);
  const mid = [0, 1, 2].map((k) => wheels.reduce((s, w) => s + w.c[k], 0) / 4);
  const ground = Math.min(...wheels.map((w) => w.c[up] - w.r));
  // Gauche (+x) : à droite quand on regarde vers l'avant ; repère direct avec y haut et z avant.
  const toGame = (v) => {
    const z = (v[lenAxis] - mid[lenAxis]) * fwdSign;
    const y = v[up] - ground;
    const lat = v[latAxis] - mid[latAxis];
    // Signe latéral : base directe (x = y × z).
    return [lat * latSign, y, z];
  };
  // Base directe : e_x = e_y × e_z dans le repère du fichier.
  const eUp = [0, 0, 0], eF = [0, 0, 0], eL = [0, 0, 0];
  eUp[up] = 1; eF[lenAxis] = fwdSign; eL[latAxis] = 1;
  const cross = [eUp[1] * eF[2] - eUp[2] * eF[1], eUp[2] * eF[0] - eUp[0] * eF[2], eUp[0] * eF[1] - eUp[1] * eF[0]];
  const latSign = cross[latAxis];
  const M = mat4.identity().fill(0);
  M[latAxis * 4 + 0] = latSign; // colonne de l'axe latéral → x
  M[up * 4 + 1] = 1;
  M[lenAxis * 4 + 2] = fwdSign;
  M[12] = -mid[latAxis] * latSign;
  M[13] = -ground;
  M[14] = -mid[lenAxis] * fwdSign;
  M[15] = 1;
  for (const p of keep) bake(p, M);
  const W = wheels.map((w) => ({ ...w, c: toGame(w.c) }));
  // Découpe des roues : triangles dans le cylindre de chaque roue (axe x), vers une primitive propre à la roue.
  const inWheel = (x, y, z) => W.findIndex((w) => Math.abs(x - w.c[0]) < w.hw + 0.02 && Math.hypot(y - w.c[1], z - w.c[2]) < w.r * 1.02);
  const wheelPrims = W.map(() => []);
  const buf = root.listBuffers()[0];
  for (const p of keep) {
    const pa = p.getAttribute('POSITION').getArray();
    const idx = p.getIndices();
    if (!idx) continue;
    const ia = idx.getArray();
    const stay = [], go = W.map(() => []);
    for (let t = 0; t < ia.length; t += 3) {
      const ks = [ia[t], ia[t + 1], ia[t + 2]].map((v) => inWheel(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]));
      if (ks[0] >= 0 && ks[0] === ks[1] && ks[1] === ks[2]) go[ks[0]].push(ia[t], ia[t + 1], ia[t + 2]);
      else stay.push(ia[t], ia[t + 1], ia[t + 2]);
    }
    go.forEach((list, k) => {
      if (!list.length) return;
      const q = p.clone();
      q.setIndices(idx.clone().setArray(new Uint32Array(list)));
      wheelPrims[k].push(q);
    });
    idx.setArray(new Uint32Array(stay));
  }
  // Nouvelle scène : carrosserie + quatre roues (pivot au moyeu, sommets ramenés au moyeu).
  const out = doc.createScene(id);
  const bodyMesh = doc.createMesh('body');
  for (const p of keep) if (p.getIndices().getCount()) bodyMesh.addPrimitive(compactPrimitive(p));
  const carNode = doc.createNode(id);
  carNode.addChild(doc.createNode('body').setMesh(bodyMesh));
  W.forEach((w, k) => {
    const mesh = doc.createMesh(`wheel${k}`);
    const unc = mat4.identity();
    unc[12] = -w.c[0]; unc[13] = -w.c[1]; unc[14] = -w.c[2];
    for (const q of wheelPrims[k]) {
      compactPrimitive(q);
      bake(q, unc);
      mesh.addPrimitive(q);
    }
    carNode.addChild(doc.createNode(`wheel${k}`).setTranslation(w.c).setMesh(mesh).setExtras({ front: w.front, side: w.c[0] > 0 ? 1 : -1 }));
  });
  out.addChild(carNode);
  for (const s of root.listScenes()) if (s !== out) s.dispose();
  for (const n of root.listNodes()) if (!n.getMesh() && n !== carNode && !carNode.listChildren().includes(n)) n.dispose();
  for (const n of root.listNodes()) if (n.getMesh() && !carNode.listChildren().includes(n)) n.dispose();
  root.setDefaultScene(out);
  // Peinture : teinte du jeu (couleur de la voiture) ; extras lus par le jeu.
  // Peinture vernie (le fichier d'origine est en métal miroir) ; texture de peinture ramenée au gris (détail seul,
  // moyenne 0,85) pour que la couleur du jeu donne la teinte.
  for (const m of root.listMaterials()) {
    if (!cfg.paint.test(m.getName())) continue;
    m.setExtras({ paint: true }).setMetallicFactor(0.2).setRoughnessFactor(0.3).setBaseColorFactor([1, 1, 1, 1]);
    const t = m.getBaseColorTexture();
    if (!t) continue;
    const { data, info } = await sharp(t.getImage()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    const n = info.width * info.height;
    for (let i = 0; i < n; i++) sum += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    const k = (0.85 * 255) / Math.max(1, sum / n);
    for (let i = 0; i < n; i++) {
      const g = Math.min(255, ((data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3) * k);
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g;
    }
    t.setImage(await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()).setMimeType('image/png');
  }
  carNode.setExtras({ wb: Math.abs(W[0].c[2] - W[2].c[2]), r: W.reduce((s, w) => s + w.r, 0) / 4, track: Math.abs(W[0].c[0] - W[1].c[0]) });
  await doc.transform(prune(), dedup());
  // Simplification des seules pièces lourdes et peu visibles (pneus, soubassement, garnitures) : peinture, vitres,
  // optiques et chromes gardent leur maillage d'origine (normales nettes).
  await MeshoptSimplifier.ready;
  const fixed = /Pintura$|Vidro|Cromados|gt_body|gt_windows/;
  const heavy = [];
  let fixedTris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const t = p.getIndices().getCount() / 3;
    if (fixed.test(p.getMaterial()?.getName() || '') || t < 4000) fixedTris += t;
    else heavy.push([p, t]);
  }
  const heavyTris = heavy.reduce((s, [, t]) => s + t, 0);
  const ratio = !heavyTris ? 1 : Math.min(1, Math.max(0.05, (cfg.tris - fixedTris) / heavyTris));
  if (ratio < 1) {
    await doc.transform(weld());
    for (const [p] of heavy) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio, error: 0.02 });
  }
  await doc.transform(
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [cfg.tex || 1024, cfg.tex || 1024] }),
    reorder({ encoder: MeshoptEncoder }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `car_${id}.glb`);
  await io.write(file, doc);
  console.log(`car_${id}: ${(readFileSync(file).length / 1e6).toFixed(2)} Mo, ${before} → ${tris(doc)} triangles, empattement ${carNode.getExtras().wb.toFixed(2)} m, roues r ${carNode.getExtras().r.toFixed(3)} m`);
}

for (const [id, cfg] of Object.entries(CARS)) await build(id, cfg);
