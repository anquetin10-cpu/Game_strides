// Dernière étape de construction des personnages réalistes (lot v3) : reprend l'export Blender de
// scripts/humans/bpy/face_enhance.py (formes d'expression, occlusion, cuir chevelu), renomme l'attribut de couleur
// COLOR_0 en _FACE (attribut propre au jeu : le matériau ne le multiplie pas à la couleur de base) et compresse comme
// build-humans.mjs (meshopt, quantification), vers public/real/<id>.glb.
// Chaîne complète :
//   STAGE=raw node scripts/real/build-humans.mjs
//   <venv>/bin/python scripts/humans/bpy/face_enhance.py node_modules/.cache/real-build/rider_f.raw.glb \
//       node_modules/.cache/real-build/rider_f.face.glb node_modules/.cache/real-build/rider_f.face.json   (idem rider_m)
//   node scripts/real/finalize-humans.mjs rider_f rider_m
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, unpartition, meshopt, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = join(ROOT, 'node_modules/.cache/real-build');
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
for (const id of process.argv.slice(2)) {
  const doc = await io.read(join(BUILD, `${id}.face.glb`));
  const root = doc.getRoot();
  let faceAttr = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const c = prim.getAttribute('COLOR_0');
      if (!c) continue;
      prim.setAttribute('COLOR_0', null);
      prim.setAttribute('_FACE', c);
      faceAttr++;
    }
  }
  if (!faceAttr) throw new Error(`${id} : pas d'attribut de couleur (export Blender)`);
  await doc.transform(unpartition(), prune(), dedup(), reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }));
  const file = join(ROOT, 'public/real', `${id}.glb`);
  await io.write(file, doc);
  let tris = 0;
  const targets = {};
  for (const m of root.listMeshes()) {
    for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
    targets[m.getName()] = (m.getExtras()?.targetNames || []).length;
  }
  console.log(`${id}: ${(readFileSync(file).length / 1e6).toFixed(2)} Mo, ${tris} triangles, formes par maillage ${JSON.stringify(targets)}`);
}
