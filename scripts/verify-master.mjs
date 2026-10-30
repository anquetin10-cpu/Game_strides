// Contrôle d'intégrité du van STX Renault Master fourni (src/assets/vehicles/STX_Renault_Master_STALLE5.glb) : taille et
// empreinte SHA-256 du fichier, glTF 2.0 valide, nœuds et pivots attendus, animations d'ouverture, matériaux et
// textures intégrés, dimensions. Usage : node scripts/verify-master.mjs [fichier.glb]
// (Le script verifier_modele.py annoncé avec le modèle n'a pas été transmis : ce contrôle en tient lieu.)
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const file = process.argv[2] || new URL('../src/assets/vehicles/STX_Renault_Master_STALLE5.glb', import.meta.url).pathname;
const EXPECT = { size: 2664228, sha256: 'ea74a8035ddab047b4f192dd2dfc72b780e75f78be58345af9ce0547cf6d47fc' };
let fails = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra !== '' ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

const buf = readFileSync(file);
const sha = createHash('sha256').update(buf).digest('hex');
check('taille du fichier', buf.length === EXPECT.size, `${buf.length} octets`);
check('empreinte SHA-256 (fichier fourni, non modifié)', sha === EXPECT.sha256, sha);
check('en-tête GLB (magic glTF, version 2)', buf.toString('ascii', 0, 4) === 'glTF' && buf.readUInt32LE(4) === 2);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.readBinary(new Uint8Array(buf));
const root = doc.getRoot();
const names = new Set(root.listNodes().map((n) => n.getName()));
const need = ['exterior', 'interior_cab', 'interior_horses', 'interior_tack', 'steer_L', 'steer_R', 'wheel_front_L', 'wheel_front_R', 'wheel_rear_L', 'wheel_rear_R', 'side_ramp', 'upper_flap_front', 'upper_flap_rear', 'rear_door', 'stall_partition', 'stall_gate_L', 'stall_gate_R', 'anchor_driver', 'anchor_exit_driver', 'anchor_horse_L', 'anchor_horse_R', 'anchor_side_load', 'anchor_rear_entry'];
const missing = need.filter((n) => !names.has(n));
check('nœuds et ancres attendus', !missing.length, missing.length ? `absents : ${missing.join(', ')}` : `${need.length} présents`);
const node = (n) => root.listNodes().find((x) => x.getName() === n);
check('roues avant sous leurs pivots de braquage', node('steer_L').listChildren().some((c) => c.getName() === 'wheel_front_L') && node('steer_R').listChildren().some((c) => c.getName() === 'wheel_front_R'));
const anims = root.listAnimations().map((a) => a.getName());
check('animations d’ouverture et de fermeture', ['OpenSideLoading', 'CloseSideLoading', 'OpenRearDoor', 'CloseRearDoor'].every((a) => anims.includes(a)), anims.join(', '));
const open = root.listAnimations().find((a) => a.getName() === 'OpenSideLoading');
const targets = open.listChannels().map((c) => c.getTargetNode().getName()).sort();
check('ouverture latérale : pont et deux volets', JSON.stringify(targets) === JSON.stringify(['side_ramp', 'upper_flap_front', 'upper_flap_rear']), targets.join(', '));
const mats = root.listMaterials();
check('matériaux intégrés', mats.length >= 20, `${mats.length} matériaux`);
const tex = root.listTextures();
check('textures intégrées (aucune dépendance externe)', tex.length > 0 && tex.every((t) => t.getImage() && !t.getURI()), `${tex.length} textures`);
let tris = 0, bad = 0;
for (const m of root.listMeshes()) {
  for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    const idx = p.getIndices();
    tris += (idx ? idx.getCount() : pos.getCount()) / 3;
    if (!p.getAttribute('NORMAL')) bad++;
    const a = pos.getArray();
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { bad++; break; }
  }
}
check('géométrie : normales présentes, coordonnées finies', bad === 0, `${tris} triangles`);
const b = getBounds(root.listScenes()[0]);
const L = b.max[2] - b.min[2], W = b.max[0] - b.min[0], H = b.max[1] - b.min[1];
check('dimensions d’un van 3,5 t (L ≈ 7,1 m, l ≈ 2,8 m, h ≈ 3,1 m), posé au sol', Math.abs(L - 7.14) < 0.1 && Math.abs(W - 2.77) < 0.1 && Math.abs(H - 3.06) < 0.1 && Math.abs(b.min[1]) < 0.02, `${L.toFixed(2)} × ${W.toFixed(2)} × ${H.toFixed(2)} m`);
console.log(fails ? `ÉCHECS : ${fails}` : 'MODÈLE INTÈGRE');
process.exit(fails ? 1 : 0);
