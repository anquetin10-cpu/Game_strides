// Cheval Tripo (ESSAI, ne remplace pas le cheval du jeu) : version optimisée et animable du maillage Tripo fourni.
//
// Étapes :
//   1. lecture de assets-src/horse-tripo/Cheval_Tripo_Optimise_Qualite.glb, calage en mètres dans le repère du jeu
//      (tripo/frame.mjs), redressement de la tête (tournée de ~19° vers la gauche dans la source) ;
//   2. squelette du jeu (50 os, mêmes noms, rotations de repos nulles) placé dans l'anatomie du modèle
//      (tripo/skeleton-fit.mjs) ;
//   3. poids de peau automatiques (tripo/skin-weights.mjs), calculés sur le maillage complet ;
//   4. réduction des polygones (meshoptimizer, sommets d'origine conservés : UV et poids intacts) : LOD0 et LOD1 ;
//   5. textures nettoyées par tripo/clean-texture.mjs (tapis et quartiers peints, points sombres ; métal 0), calculées
//      à chaque construction (--brut : textures d'origine) ; WebP (couleur 2048, normales et rugosité 1024) ;
//   6. filet (bridon à muserolle française, mors à anneaux) et rênes en main ajustés à la tête du modèle
//      (tripo/bridle.mjs : repères mesurés sur le maillage complet, lanières posées sur la peau) ;
//   7. GLB : un maillage skinné par niveau de détail, même squelette ; filet (TripoBridle : cuir et acier) et rênes
//      (TripoReins : caoutchouc) en maillages skinnés à part sur la même peau (affichés par le jeu quand le cheval est
//      monté) ; compression meshopt et quantification.
//
// Sortie : public/real/horse_tripo.glb (modèle du cheval « Tripo », deuxième cheval de l'écurie) et
// trial/horse_tripo.json (rapport : mesures, os, poids, statistiques ; hors de public/, non publié).
// Variante de robe (--robe apercu) : robe assombrie (facteur 0,52 en sRGB) pour se rapprocher de l'aperçu du fournisseur
// (Apercu_Cheval_HD.png, rendu plus sombre que la texture), balzanes, liste et autres marques blanches conservées. Par
// défaut : texture d'origine (nettoyée), sans changement de teinte. La variante remplace public/real/horse_tripo.glb (le
// fichier versionné est la robe d'origine) ; horse_tripo.json indique la variante construite.
// Usage : node scripts/real/build-tripo-horse.mjs [--lod0 30000] [--lod1 8000] [--brut] [--robe apercu]
import { writeFileSync, mkdirSync } from 'node:fs';
import { Document } from '@gltf-transform/core';
import { prune, dedup, meshopt, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { SRC, makeIO, calibrated, SCALE, OFFSET } from './tripo/frame.mjs';
import { straightenHead, fitSkeleton } from './tripo/skeleton-fit.mjs';
import { computeWeights, checkTailWeights } from './tripo/skin-weights.mjs';
import { fixWinding, repairNormals, dropFoldedMicroFaces } from './tripo/mesh-clean.mjs';
import { effacerReliefPlaques } from './tripo/relief-plaques.mjs';
import { cleanTripoTextures } from './tripo/clean-texture.mjs';
import { buildBridle, BRIDLE_MATS } from './tripo/bridle.mjs';
import { BONES } from '../../src/entities/horse/skeleton.js';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const LOD0 = arg('--lod0', 30000);
const LOD1 = arg('--lod1', 8000);
const RAW = process.argv.includes('--brut');
const ROBE = process.argv.includes('--robe') ? process.argv[process.argv.indexOf('--robe') + 1] : 'origine';
const ROBE_FACTOR = 0.52;
const OUT = 'trial';
mkdirSync(OUT, { recursive: true });

const io = await makeIO();
const src = await io.read(SRC);
const sprim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const smat = sprim.getMaterial();
// Nettoyage des textures sur le maillage source (unités natives, avant calage et redressement).
const img = (t) => t.getImage();
const clean = RAW
  ? null
  : await cleanTripoTextures({
      positions: sprim.getAttribute('POSITION').getArray(),
      normals: sprim.getAttribute('NORMAL').getArray(),
      uvs: sprim.getAttribute('TEXCOORD_0').getArray(),
      indices: sprim.getIndices().getArray(),
      baseColor: img(smat.getBaseColorTexture()),
      normal: img(smat.getNormalTexture()),
      metallicRoughness: img(smat.getMetallicRoughnessTexture()),
    });
// Variante « aperçu » : robe assombrie, marques blanches (claires et peu saturées) conservées.
async function darkenCoat(png, f) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ss = (a, b, v) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < data.length; i += 4) {
    const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
    const w = ss(0.55, 0.8, mx / 255) * (1 - ss(0.12, 0.25, mx ? (mx - mn) / mx : 0));
    const k = f + (1 - f) * w;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * k);
  }
  return sharp(data, { raw: info }).removeAlpha().png().toBuffer();
}
if (clean && ROBE === 'apercu') clean.baseColor = await darkenCoat(clean.baseColor, ROBE_FACTOR);
const m = calibrated(sprim);
const straight = straightenHead(m.positions, m.normals);
const P = m.positions;
// Faces retournées de la source réorientées (avant la réduction).
const winding = { ...fixWinding(P, m.indices), ...repairNormals(P, m.normals, m.indices) };
// Relief du tapis et des quartiers modelés dans le maillage : sommets de la zone fournie par le nettoyage des textures
// (même indexation que la source) replacés par tripo/relief-plaques.mjs (coordonnées laplaciennes, courbure du pelage
// voisin). Zone absente ou de mauvaise taille : arrêt (pas de repli silencieux sur un autre lissage).
let relief = null;
if (clean) {
  const zone = clean.geometry?.zoneRelief;
  if (!zone || zone.length !== P.length / 3) throw new Error('Zone de relief des plaques absente ou incohérente : construction arrêtée.');
  const r = effacerReliefPlaques(P, m.normals, m.indices, zone);
  let zoneVertices = 0;
  for (let v = 0; v < zone.length; v++) zoneVertices += zone[v] ? 1 : 0;
  relief = {
    methode: 'relief-plaques (laplacien, courbure du pelage voisin)',
    zoneVertices,
    weldedFree: r.sommetsLibres,
    maxMoveMm: +(r.deplacement.max * 1000).toFixed(1),
    meanMoveMm: +(r.deplacement.moyen * 1000).toFixed(2),
    tangentialMeanMm: +(r.deplacement.tangentielMoyen * 1000).toFixed(2),
    foldedFaces: r.facesPliees,
  };
}

// ---------- Squelette ----------
const fit = fitSkeleton(P, m.indices);
const pos = Object.fromEntries(fit.bones.map((b) => [b.name, b.pos]));
// Extrémités : bout du nez, pointes des oreilles, bout de la queue.
let muzzle = null, tailEnd = null;
for (let i = 0; i < P.length; i += 3) {
  if (!muzzle || P[i + 2] > muzzle[2]) muzzle = [P[i], P[i + 1], P[i + 2]];
  if (P[i + 2] < -0.85 && Math.abs(P[i]) < 0.12 && P[i + 1] < 0.9 && (!tailEnd || P[i + 1] < tailEnd[1])) tailEnd = [P[i], P[i + 1], P[i + 2]];
}
const ext = { muzzle, tailEnd, earTipL: fit.ears[1].tip, earTipR: fit.ears[-1].tip };

// ---------- Poids ----------
const t0 = Date.now();
const skin = computeWeights(P, m.indices, pos, ext);
const tWeights = (Date.now() - t0) / 1000;
// Crins de la queue sans poids des postérieurs (et réciproquement) : erreur sinon.
const tailCheck = checkTailWeights(P, skin);

// ---------- Réduction ----------
await MeshoptSimplifier.ready;
const nv = P.length / 3;
// Attributs pris en compte : normale (poids 0,5) et UV (poids 1) ; positions en mètres.
const attr = new Float32Array(nv * 5);
for (let v = 0; v < nv; v++) {
  attr.set([m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2], m.uvs[v * 2], m.uvs[v * 2 + 1]], v * 5);
}
const simplify = (target) => {
  const [ind0, err] = MeshoptSimplifier.simplifyWithAttributes(m.indices, P, 3, attr, 5, [0.5, 0.5, 0.5, 1, 1], null, target * 3, 0.05, []);
  // Micro-replis retirés après la réduction (ceux de la source et ceux qu'elle crée).
  const { indices: ind, dropped, keptAgainst } = dropFoldedMicroFaces(P, m.normals, ind0);
  return { ind, err, tris: ind.length / 3, foldsDropped: dropped, foldsKept: keptAgainst };
};
const lods = [simplify(LOD0), simplify(LOD1)];

// ---------- Filet et rênes ----------
// Ajustés au maillage complet (et vérifiés contre le niveau de détail proche, affiché de près).
const tb0 = Date.now();
const bridle = buildBridle({ P, N: m.normals, I: m.indices, lod0: lods[0].ind, joints: skin.joints, weights: skin.weights, bones: fit.bones, ears: fit.ears });
const tBridle = (Date.now() - tb0) / 1000;

// ---------- Document de sortie ----------
const doc = new Document();
const buf = doc.createBuffer();
const tex = (name, image, mime) => doc.createTexture(name).setImage(image).setMimeType(mime);
const T = clean
  ? {
      base: tex('tripo_coat', clean.baseColor, 'image/png'),
      normal: tex('tripo_normal', clean.normal, 'image/png'),
      mr: tex('tripo_rough', clean.metallicRoughness, 'image/png'),
      cleaned: true,
    }
  : {
      base: tex('tripo_coat', smat.getBaseColorTexture().getImage(), 'image/jpeg'),
      normal: tex('tripo_normal', smat.getNormalTexture().getImage(), 'image/jpeg'),
      mr: tex('tripo_rough', await sharp(Buffer.from(smat.getMetallicRoughnessTexture().getImage())).png().toBuffer(), 'image/png'),
      cleaned: false,
    };
// Matériau : pas nommé « Horse » (la recoloration de robe du cheval réaliste ne s'y applique pas : robe d'origine).
const mat = doc.createMaterial('TripoCoat').setBaseColorTexture(T.base).setNormalTexture(T.normal).setMetallicRoughnessTexture(T.mr).setMetallicFactor(0).setRoughnessFactor(1);

// Os : nœuds nommés comme le squelette du jeu, positions locales (repos sans rotation).
const nodes = {};
for (const b of fit.bones) nodes[b.name] = doc.createNode(b.name);
for (const b of fit.bones) {
  const p = b.pos, pp = b.parent ? pos[b.parent] : [0, 0, 0];
  nodes[b.name].setTranslation([p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]]);
  if (b.parent) nodes[b.parent].addChild(nodes[b.name]);
}
const ibm = new Float32Array(BONES.length * 16);
fit.bones.forEach((b, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.pos[0], -b.pos[1], -b.pos[2], 1], i * 16));
const skinDef = doc.createSkin('TripoSkin').setSkeleton(nodes.root).setInverseBindMatrices(doc.createAccessor('ibm').setType('MAT4').setArray(ibm).setBuffer(buf));
for (const b of fit.bones) skinDef.addJoint(nodes[b.name]);

const scene = doc.createScene('TripoHorse');
const top = doc.createNode('TripoHorse');
scene.addChild(top);
top.addChild(nodes.root);
lods.forEach((L, k) => {
  // Sommets utilisés par ce niveau, renumérotés.
  const remap = new Int32Array(nv).fill(-1);
  const used = [];
  for (const i of L.ind) if (remap[i] < 0) {
    remap[i] = used.length;
    used.push(i);
  }
  const n = used.length;
  const pick = (A, c, T = Float32Array) => {
    const o = new T(n * c);
    used.forEach((v, j) => {
      for (let q = 0; q < c; q++) o[j * c + q] = A[v * c + q];
    });
    return o;
  };
  const ind = Uint32Array.from(L.ind, (i) => remap[i]);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pick(P, 3)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(pick(m.normals, 3)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(pick(m.uvs, 2)).setBuffer(buf))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(pick(skin.joints, 4, Uint8Array)).setBuffer(buf))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(pick(skin.weights, 4)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(n < 65535 ? Uint16Array.from(ind) : ind).setBuffer(buf))
    .setMaterial(mat);
  const mesh = doc.createMesh(`TripoHorse_LOD${k}`).addPrimitive(prim);
  top.addChild(doc.createNode(`TripoHorse_LOD${k}`).setMesh(mesh).setSkin(skinDef));
  L.verts = n;
});

// Filet (cuir, acier) et rênes (caoutchouc) : maillages skinnés sur la même peau, une primitive par matériau.
// Couleurs sRGB de la sellerie du jeu converties en facteurs linéaires (glTF).
const linear = (hex) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const tackMats = Object.fromEntries(Object.entries(BRIDLE_MATS).map(([k, d]) => [k, doc.createMaterial(`Tripo_${k}`).setBaseColorFactor([...linear(d.color), 1]).setRoughnessFactor(d.roughness).setMetallicFactor(d.metalness)]));
for (const [name, B] of [['TripoBridle', bridle.bridle], ['TripoReins', bridle.reins]]) {
  const mesh = doc.createMesh(name);
  for (const [mat, q] of Object.entries(B.prims)) {
    mesh.addPrimitive(doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(q.pos).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(q.nor).setBuffer(buf))
      .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(q.joints).setBuffer(buf))
      .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(q.weights).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(q.indices)).setBuffer(buf))
      .setMaterial(tackMats[mat]));
  }
  top.addChild(doc.createNode(name).setMesh(mesh).setSkin(skinDef));
}

await MeshoptEncoder.ready;
await doc.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, quality: 90, resize: [2048, 2048] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(normal|metallicRoughness)/, quality: 88, resize: [1024, 1024] }),
  reorder({ encoder: MeshoptEncoder }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
  // La quantification clone la peau (et ses matrices inverses) pour chaque maillage, puis fusionne les peaux : sans
  // ce second élagage, l'accesseur « ibm » de la peau écartée resterait dans le fichier.
  prune(),
);
const glb = await io.writeBinary(doc);
// Contrôle du fichier écrit : une seule peau de 50 os, partagée par les deux niveaux de détail, le filet et les rênes ;
// un seul accesseur « ibm », aucun accesseur orphelin ; maillages listés (primitives, matériaux, triangles).
const out = (await io.readBinary(glb)).getRoot();
const skinned = (re) => out.listNodes().filter((n) => re.test(n.getName()) && n.getMesh() && n.getSkin() === out.listSkins()[0]);
const glbCheck = {
  skins: out.listSkins().length,
  joints: out.listSkins()[0]?.listJoints().length ?? 0,
  lodMeshesSkinned: skinned(/^TripoHorse_LOD/).length,
  tackMeshesSkinned: skinned(/^Tripo(Bridle|Reins)$/).length,
  ibmAccessors: out.listAccessors().filter((a) => a.getName() === 'ibm').length,
  orphanAccessors: out.listAccessors().filter((a) => a.listParents().every((p) => p === out)).length,
  meshes: Object.fromEntries(out.listNodes().filter((n) => n.getMesh()).map((n) => [n.getName(), n.getMesh().listPrimitives().map((pr) => ({ material: pr.getMaterial()?.getName(), tris: pr.getIndices().getCount() / 3 }))])),
};
if (glbCheck.skins !== 1 || glbCheck.joints !== BONES.length || glbCheck.lodMeshesSkinned !== 2 || glbCheck.tackMeshesSkinned !== 2 || glbCheck.ibmAccessors !== 1 || glbCheck.orphanAccessors) {
  throw new Error(`GLB : peau ou accesseurs inattendus (${JSON.stringify(glbCheck)})`);
}
writeFileSync('public/real/horse_tripo.glb', glb);
const report = {
  source: SRC,
  calibration: { scale: SCALE, offset: OFFSET },
  straightenHead: straight,
  winding,
  relief,
  bones: fit.bones,
  legs: fit.legs,
  legsBeforeSymmetry: fit.legsRaw,
  legGapsCm: fit.legGaps,
  ext,
  weights: { seconds: tWeights, radii: skin.radii, tail: tailCheck },
  glbCheck,
  bridle: { seconds: tBridle, ...bridle.report },
  lods: lods.map((L) => ({ tris: L.tris, verts: L.verts, error: +L.err.toFixed(5), foldsDropped: L.foldsDropped, foldsKept: L.foldsKept })),
  texturesCleaned: T.cleaned,
  robe: ROBE === 'apercu' ? { variante: 'apercu', facteur: ROBE_FACTOR } : { variante: 'origine' },
  textureCleaning: clean
    ? {
        diagnostic: clean.report.diagnostic,
        texelsAlbedo: Object.fromEntries(Object.entries(clean.report.plaques).map(([k, v]) => [k, v.texelsAlbedo])),
        points: Object.fromEntries(Object.entries(clean.report.points).map(([k, v]) => [k, v.nombre])),
        metal: clean.report.metal,
      }
    : null,
  bytes: glb.byteLength,
};
writeFileSync(`${OUT}/horse_tripo.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ lods: report.lods, bytes: report.bytes, straighten: straight, winding, relief, weightsSec: tWeights, cleaned: T.cleaned, radii: skin.radii, tail: tailCheck, legGapsCm: fit.legGaps, glbCheck, bridle: { seconds: tBridle, triangles: bridle.report.triangles, pieces: bridle.report.pieces } }));
