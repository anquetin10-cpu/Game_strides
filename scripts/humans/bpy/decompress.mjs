// Décompresse un GLB meshopt (format des modèles du jeu) en GLB standard lisible par bpy (le module pip de Blender n'a pas
// le décodeur meshopt). Usage : node scripts/humans/bpy/decompress.mjs <entrée.glb> <sortie.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
await doc.transform(dequantize());
for (const e of doc.getRoot().listExtensionsUsed()) if (e instanceof EXTMeshoptCompression || e instanceof KHRMeshQuantization) e.dispose();
await io.write(process.argv[3], doc);
console.log('écrit', process.argv[3]);
