// Copie des modèles réalistes au format glTF JSON (tampons et images intégrés en data:), pour les hébergements qui
// ne servent pas les fichiers .glb (page claude.ai). Même contenu que les .glb, environ un tiers plus lourd.
// Usage : node scripts/real/to-json.mjs <dossier de sortie>   (écrit <dossier>/real/<id>.gltf.json)
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'public/real');
const out = join(process.argv[2] || 'dist-single', 'real');
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
for (const f of readdirSync(SRC).filter((n) => n.endsWith('.glb'))) {
  const doc = await io.read(join(SRC, f));
  const { json, resources } = await io.writeJSON(doc, { basename: f.replace('.glb', '') });
  const inline = (o, mime) => {
    if (!o.uri || !resources[o.uri]) return;
    o.uri = `data:${mime};base64,${Buffer.from(resources[o.uri]).toString('base64')}`;
  };
  for (const b of json.buffers || []) inline(b, 'application/octet-stream');
  for (const im of json.images || []) inline(im, MIME[im.uri?.split('.').pop()] || im.mimeType || 'image/png');
  const file = join(out, f.replace('.glb', '.gltf.json'));
  writeFileSync(file, JSON.stringify(json));
  console.log(`${file}: ${(readFileSync(file).length / 1e6).toFixed(2)} Mo`);
}
