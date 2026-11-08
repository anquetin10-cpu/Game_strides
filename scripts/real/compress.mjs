// Compression meshopt SANS PERTE d'un GLB (EXT_meshopt_compression, méthode QUANTIZE sans quantification préalable :
// chaque accesseur est encodé tel quel, filtre NONE). Ni requantification, ni réordonnancement, ni décimation :
// sommets, normales, UV, poids, indices et pistes d'animation sont relus à l'identique (contrôle octet par octet
// ci-dessous) ; textures inchangées.
// Usage : node scripts/real/compress.mjs <entrée.glb> <sortie.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) throw new Error('Usage : node scripts/real/compress.mjs <entrée.glb> <sortie.glb>');
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);

// Contrôle : mêmes accesseurs (ordre, type, normalisation, contenu octet par octet) et mêmes images.
const a = await io.read(input);
const b = await io.read(output);
const accA = a.getRoot().listAccessors(), accB = b.getRoot().listAccessors();
if (accA.length !== accB.length) throw new Error(`Nombre d'accesseurs différent : ${accA.length} → ${accB.length}`);
for (let i = 0; i < accA.length; i++) {
  const x = accA[i], y = accB[i];
  if (x.getType() !== y.getType() || x.getComponentType() !== y.getComponentType() || x.getNormalized() !== y.getNormalized() || x.getCount() !== y.getCount()) throw new Error(`Accesseur ${i} : format différent`);
  const ba = Buffer.from(x.getArray().buffer, x.getArray().byteOffset, x.getArray().byteLength);
  const bb = Buffer.from(y.getArray().buffer, y.getArray().byteOffset, y.getArray().byteLength);
  if (!ba.equals(bb)) throw new Error(`Accesseur ${i} (${x.getName() || 'sans nom'}) : contenu différent`);
}
const texA = a.getRoot().listTextures(), texB = b.getRoot().listTextures();
if (texA.length !== texB.length || texA.some((t, i) => !Buffer.from(t.getImage()).equals(Buffer.from(texB[i].getImage())))) throw new Error('Textures différentes');
const anA = a.getRoot().listAnimations().map((x) => `${x.getName()}:${x.listChannels().length}`).join(','), anB = b.getRoot().listAnimations().map((x) => `${x.getName()}:${x.listChannels().length}`).join(',');
if (anA !== anB) throw new Error('Animations différentes');
const ko = (f) => Math.round(statSync(f).size / 1024);
console.log(`${input} : ${ko(input)} Ko → ${output} : ${ko(output)} Ko ; ${accA.length} accesseurs, ${texA.length} textures, ${a.getRoot().listAnimations().length} animations identiques`);
