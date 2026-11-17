// Prépare un GLB du jeu web pour l'import Unreal : décompresse meshopt,
// déquantifie les attributs et convertit les textures WebP en PNG.
// Usage : node scripts/unreal/prepare-import.mjs <entrée.glb> <sortie.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
await doc.transform(
  dequantize(),
  textureCompress({ encoder: sharp, targetFormat: 'png' }),
);
for (const extension of doc.getRoot().listExtensionsUsed()) {
  if (/meshopt_compression|mesh_quantization|texture_webp/i.test(extension.extensionName)) {
    extension.dispose();
  }
}
await io.write(process.argv[3], doc);
console.log('écrit', process.argv[3]);
