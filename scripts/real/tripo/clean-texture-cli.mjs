// Interface en ligne de commande du nettoyage des textures Tripo.
// Usage : node scripts/real/tripo/clean-texture-cli.mjs [source.glb] [dossier trial]
// Écrit <trial>/textures/{basecolor,normal,mr}.png, les masques, report.json et <trial>/tripo_clean_preview.glb
// (maillage source + textures nettoyées, metallicFactor 0, sans KHR_materials_volume).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { cleanTripoTextures } from './clean-texture.mjs';

const src = process.argv[2] || 'assets-src/horse-tripo/Cheval_Tripo_Optimise_Qualite.glb';
const trial = process.argv[3] || 'trial';
const out = join(trial, 'textures');
mkdirSync(out, { recursive: true });

const t0 = Date.now();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
const prim = root.listMeshes()[0].listPrimitives()[0];
const mat = prim.getMaterial();
const tex = { bc: mat.getBaseColorTexture(), nm: mat.getNormalTexture(), mr: mat.getMetallicRoughnessTexture() };

const origBc = tex.bc.getImage(), origNm = tex.nm.getImage(), origMr = tex.mr.getImage();
const res = await cleanTripoTextures({
  positions: prim.getAttribute('POSITION').getArray(),
  normals: prim.getAttribute('NORMAL').getArray(),
  uvs: prim.getAttribute('TEXCOORD_0').getArray(),
  indices: prim.getIndices().getArray(),
  baseColor: tex.bc.getImage(), normal: tex.nm.getImage(), metallicRoughness: tex.mr.getImage(),
});

writeFileSync(join(out, 'basecolor.png'), res.baseColor);
writeFileSync(join(out, 'normal.png'), res.normal);
writeFileSync(join(out, 'mr.png'), res.metallicRoughness);
writeFileSync(join(out, 'mask_pad.png'), res.masks.pad);
writeFileSync(join(out, 'mask_flap.png'), res.masks.flap);
writeFileSync(join(out, 'mask_dots.png'), res.masks.dots);

// GLB de revue : mêmes maillage et UV, textures remplacées (PNG), matériau non métallique.
const remplace = (t, buf, nom) => { t.setImage(buf); t.setMimeType('image/png'); t.setURI(`${nom}.png`); t.setName(nom); };
remplace(tex.bc, res.baseColor, 'horse_basecolor_clean');
remplace(tex.nm, res.normal, 'horse_normal_clean');
remplace(tex.mr, res.metallicRoughness, 'horse_mr_clean');
mat.setMetallicFactor(0);
for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_materials_volume') e.dispose();
await io.write(join(trial, 'tripo_clean_preview.glb'), doc);

// Vérification : aucun texel modifié hors des masques (albédo : plaques + points ; normales : plaques ; MR : rugosité).
const brut = async (b) => (await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
const [b0, b1, n0, n1, m0, m1] = await Promise.all([tex.bc, null, tex.nm, null, tex.mr, null].map((t, k) => brut([origBc, res.baseColor, origNm, res.normal, origMr, res.metallicRoughness][k])));
const gris = async (b, W, H) => (await sharp(b).extractChannel(0).resize(W, H, { kernel: 'nearest' }).raw().toBuffer());
const mp = await gris(res.masks.pad, b0.info.width, b0.info.height), mf = await gris(res.masks.flap, b0.info.width, b0.info.height), md = await gris(res.masks.dots, b0.info.width, b0.info.height);
const verif = { albedo: { horsMasque: 0, dansMasque: 0 }, normales: { horsMasque: 0, dansMasque: 0 }, rugosite: { horsMasque: 0, dansMasque: 0 }, metalMaxApres: 0 };
for (let i = 0; i < b0.info.width * b0.info.height; i++) {
  const C = b0.info.channels, d = Math.abs(b0.data[i * C] - b1.data[i * C]) + Math.abs(b0.data[i * C + 1] - b1.data[i * C + 1]) + Math.abs(b0.data[i * C + 2] - b1.data[i * C + 2]);
  if (d) verif.albedo[mp[i] || mf[i] || md[i] ? 'dansMasque' : 'horsMasque']++;
  const Cn = n0.info.channels, dn = Math.abs(n0.data[i * Cn] - n1.data[i * Cn]) + Math.abs(n0.data[i * Cn + 1] - n1.data[i * Cn + 1]) + Math.abs(n0.data[i * Cn + 2] - n1.data[i * Cn + 2]);
  if (dn) verif.normales[mp[i] || mf[i] ? 'dansMasque' : 'horsMasque']++;
}
const Wm = m0.info.width, Hm = m0.info.height;
// Masques à la résolution MR : maximum sur le bloc de texels correspondant (évite les pertes du sous-échantillonnage).
const unionMasques = Buffer.alloc(b0.info.width * b0.info.height);
for (let i = 0; i < unionMasques.length; i++) unionMasques[i] = Math.max(mp[i], mf[i], md[i]);
const fx = b0.info.width / Wm;
for (let i = 0; i < Wm * Hm; i++) {
  const C = m0.info.channels;
  verif.metalMaxApres = Math.max(verif.metalMaxApres, m1.data[i * C + 2]);
  if (m0.data[i * C + 1] === m1.data[i * C + 1]) continue;
  let m = 0;
  const x = i % Wm, y = (i / Wm) | 0;
  for (let a = -1; a <= fx && !m; a++) for (let b = -1; b <= fx && !m; b++) { const yy = y * fx + a, xx = x * fx + b; if (yy >= 0 && xx >= 0 && yy < b0.info.height && xx < b0.info.width) m = unionMasques[yy * b0.info.width + xx]; }
  verif.rugosite[m ? 'dansMasque' : 'horsMasque']++;
}
res.report.verification = verif;
res.report.source = src;
res.report.sorties = { textures: out, apercu: join(trial, 'tripo_clean_preview.glb') };
res.report.tempsMs.cliTotal = Date.now() - t0;
writeFileSync(join(out, 'report.json'), JSON.stringify(res.report, null, 1));
const r = res.report;
console.log(JSON.stringify({
  boites: Object.fromEntries(Object.entries(r.plaques).map(([k, v]) => [k, [v.boite.min, v.boite.max, v.zMesure]])),
  plaques: Object.fromEntries(Object.entries(r.plaques).map(([k, v]) => [k, { texels: v.texelsAlbedo, grain: v.grain, relief: v.reliefCarteNormales }])),
  points: { albedo: r.points.albedo.nombre, rugosite: r.points.rugosite.nombre },
  geometrie: { relief: Object.fromEntries(Object.entries(r.geometrie.reliefPlaques).map(([k, v]) => [k, { lisere: v.lisereEnRelief, ratioBosse: v.ratioBosse, ratioCassure: v.ratioCassure, n: v.sommetsLisereMarques, gauche: v.zoneGauche, droite: v.zoneDroite }])), microReplis: r.geometrie.microReplis.parZone, trous: r.geometrie.trous },
  verification: r.verification,
  temps: r.tempsMs,
}));
