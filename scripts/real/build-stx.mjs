// Camion STRIDES « STX Scania V2 » (modèle glTF fourni) : copie compressée sans perte de géométrie (EXT_meshopt_compression,
// filtres sans quantification) intégrée au jeu, src/assets/truck_stx.glb (le fichier unique l'embarque en data:).
// Usage : node scripts/real/build-stx.mjs <STRIDES_STX_Scania_V2.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const src = process.argv[2];
const out = 'src/assets/truck_stx.glb';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptEncoder.ready;
const doc = await io.read(src);
await doc.transform(dedup(), prune({ keepLeaves: true }), reorder({ encoder: MeshoptEncoder }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);
console.log(`${out}: ${(statSync(out).size / 1024).toFixed(0)} Ko (source ${(statSync(src).size / 1024).toFixed(0)} Ko)`);
