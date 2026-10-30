// Contrôle d'intégrité des deux variantes du Defender 110 fournies (src/assets/vehicles/Defender110_STRIDES*.glb) :
// empreintes SHA-256 (SHA256SUMS.txt du dossier livré), glTF 2.0 valide, nœuds, pivots et repères attendus, clips
// Open_* / Close_* des portes et du coffre, matériaux et textures intégrés, mêmes pivots dans les deux variantes.
// Complète verifier_modele.py (livré avec le modèle, contrôle passé sur les deux fichiers avant import).
// Usage : node scripts/verify-defender.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const DIR = new URL('../src/assets/vehicles/', import.meta.url).pathname;
const FILES = {
  'Defender110_STRIDES.glb': '3004637125be5522ab2138f573278ed5b1f56132f886db94ae99ee0b6caf339b',
  'Defender110_STRIDES_MOBILE.glb': '10b74a3c251f587f1d4112723f07549ba9538c53b0305455e196f242395a0c04',
};
const NODES = ['steer_FL', 'steer_FR', 'steer_RL', 'steer_RR', 'wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'steering_wheel', 'door_FL', 'door_FR', 'door_RL', 'door_RR', 'tailgate', 'spare_wheel', 'interior', 'anchor_driver', 'anchor_exit_driver', 'anchor_passenger', 'anchor_exit_passenger', 'anchor_cockpit', 'anchor_boot', 'anchor_tow'];
const ACCESS = ['door_FL', 'door_FR', 'door_RL', 'door_RR', 'tailgate'];
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const pivots = {};
for (const [name, sha] of Object.entries(FILES)) {
  console.log(`\n${name}`);
  const buf = readFileSync(DIR + name);
  check('empreinte SHA-256 (fichier fourni, non modifié)', createHash('sha256').update(buf).digest('hex') === sha, `${buf.length} octets`);
  check('en-tête GLB (glTF 2)', buf.toString('ascii', 0, 4) === 'glTF' && buf.readUInt32LE(4) === 2);
  const root = (await io.readBinary(new Uint8Array(buf))).getRoot();
  const nodes = root.listNodes();
  const node = (n) => nodes.find((x) => x.getName() === n);
  const missing = NODES.filter((n) => !node(n));
  check('nœuds, pivots et repères attendus', !missing.length, missing.length ? `absents : ${missing.join(', ')}` : `${NODES.length} présents`);
  check('roues sous leurs pivots steer_*', ['FL', 'FR', 'RL', 'RR'].every((k) => node(`steer_${k}`).listChildren().some((c) => c.getName() === `wheel_${k}`)));
  check('roue de secours solidaire du coffre', node('tailgate').listChildren().some((c) => c.getName() === 'spare_wheel'));
  const anims = root.listAnimations();
  const clips = ACCESS.flatMap((a) => [`Open_${a}`, `Close_${a}`]);
  check('clips Open_* / Close_* des quatre portes et du coffre', clips.every((c) => anims.some((a) => a.getName() === c)), `${anims.length} clips`);
  check('chaque clip n’anime que son accès', ACCESS.every((a) => anims.filter((x) => x.getName().endsWith(a)).every((x) => x.listChannels().every((c) => c.getTargetNode().getName() === a))));
  const mats = root.listMaterials(), tex = root.listTextures();
  check('matériaux et textures intégrés', mats.length === 35 && tex.length > 0 && tex.every((t) => t.getImage()?.length > 0), `${mats.length} matériaux · ${tex.length} textures`);
  check('peinture et feux lumineux (Body_Paint, DRL, Rear_LED)', ['Body_Paint', 'DRL', 'Rear_LED'].every((m) => mats.some((x) => x.getName() === m)));
  pivots[name] = NODES.map((n) => node(n).getTranslation().map((x) => x.toFixed(3)).join(',')).join(';');
}
console.log('');
check('mêmes pivots et repères dans les deux variantes', pivots['Defender110_STRIDES.glb'] === pivots['Defender110_STRIDES_MOBILE.glb']);
console.log(fails ? `ÉCHECS : ${fails}` : 'DEFENDER (fichiers) OK');
process.exit(fails ? 1 : 0);
