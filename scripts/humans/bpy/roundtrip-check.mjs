// Compare un GLB de personnage exporté par Blender (scripts/humans/bpy/roundtrip.py) à l'original du jeu : os (noms et
// matrices de liaison inverses), maillages, sommets, triangles, formes (noms), matières, et position des sommets en pose
// de liaison (après les matrices de liaison : ce que le jeu affiche à l'arrêt, en mètres). Sortie 1 si un écart dépasse
// les tolérances. Usage : node scripts/humans/bpy/roundtrip-check.mjs <original.glb> <exporté.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [A, B] = await Promise.all(process.argv.slice(2, 4).map((p) => io.read(p)));

function summary(doc, every = 97) {
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints().map((j) => j.getName());
  const jointIndex = new Map(joints.map((n, i) => [n, i]));
  // Matrice monde de chaque articulation au repos (hiérarchie des nœuds) : avec la liaison inverse, place les sommets
  // comme le jeu les affiche à l'arrêt (la mise à l'échelle de la quantification est repliée dans la liaison inverse).
  const bind = skin.listJoints().map((j) => new THREE.Matrix4().fromArray(j.getWorldMatrix()));
  const meshes = {};
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial()?.getName() || '?';
      const pos = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      const idx = prim.getIndices();
      const sk = node.getSkin();
      const sj = sk ? sk.listJoints().map((j) => jointIndex.get(j.getName())) : null;
      const sibm = sk ? sk.getInverseBindMatrices() : null;
      // Pose de liaison : somme des poids × (monde de l'os × liaison inverse de ce skin) × position.
      const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
      const p = [], j = [], w = [], v = new THREE.Vector3(), acc = new THREE.Vector3(), m = new THREE.Matrix4();
      const pts = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, p);
        if (sk && J) {
          J.getElement(i, j); W.getElement(i, w);
          acc.set(0, 0, 0);
          for (let k = 0; k < 4; k++) {
            if (!w[k]) continue;
            m.fromArray(sibm.getElement(j[k], [])).premultiply(bind[sj[j[k]]]);
            acc.addScaledVector(v.fromArray(p).applyMatrix4(m), w[k]);
          }
          v.copy(acc);
        } else v.fromArray(p);
        lo.min(v); hi.max(v);
        if (i % every === 0) pts.push(v.clone());
      }
      const key = mat;
      (meshes[key] ||= { verts: 0, tris: 0, targets: new Set(), lo: lo.clone(), hi: hi.clone(), pts: [] });
      const e = meshes[key];
      e.verts += pos.getCount(); e.tris += (idx ? idx.getCount() : pos.getCount()) / 3;
      for (const n of mesh.getExtras()?.targetNames || prim.listTargets().map((_, i) => 't' + i)) e.targets.add(n);
      e.lo.min(lo); e.hi.max(hi); e.pts.push(...pts);
    }
  }
  // Extras des matières (teintes du jeu : realistic.js lit material.userData.tint).
  const extras = Object.fromEntries(root.listMaterials().map((m) => [m.getName(), JSON.stringify(m.getExtras()?.tint || null)]));
  return { joints, bind, meshes, extras, materials: root.listMaterials().map((m) => m.getName()).sort() };
}

const a = summary(A), b = summary(B, 1);
const problems = [];
const report = { joints: [a.joints.length, b.joints.length], materials: [a.materials.length, b.materials.length], meshes: {} };
if (a.joints.join() !== b.joints.join()) {
  const miss = a.joints.filter((n) => !b.joints.includes(n));
  if (miss.length || a.joints.length !== b.joints.length) problems.push('os différents : ' + miss.join(', '));
}
let maxBone = 0;
for (let i = 0; i < a.joints.length; i++) {
  const k = b.joints.indexOf(a.joints[i]);
  if (k < 0) continue;
  const pa = new THREE.Vector3().setFromMatrixPosition(a.bind[i]), pb = new THREE.Vector3().setFromMatrixPosition(b.bind[k]);
  maxBone = Math.max(maxBone, pa.distanceTo(pb));
}
report.maxBonePosDiff_mm = +(maxBone * 1000).toFixed(2);
if (maxBone > 0.001) problems.push(`os déplacés de ${(maxBone * 1000).toFixed(1)} mm`);
for (const [k, ea] of Object.entries(a.meshes)) {
  const eb = b.meshes[k];
  if (!eb) { problems.push('matière/maillage absent : ' + k); continue; }
  const missT = [...ea.targets].filter((n) => !eb.targets.has(n));
  // Distance d'un sommet sur 97 de l'original au sommet le plus proche de l'export (l'ordre des sommets n'est pas conservé).
  let maxD = 0;
  for (const p of ea.pts) { let d = 1e9; for (const q of eb.pts) d = Math.min(d, p.distanceTo(q)); maxD = Math.max(maxD, d); }
  const r = { verts: [ea.verts, eb.verts], tris: [ea.tris, eb.tris], targets: [ea.targets.size, eb.targets.size], missingTargets: missT,
    height: [+(ea.hi.y - ea.lo.y).toFixed(4), +(eb.hi.y - eb.lo.y).toFixed(4)], sampleMaxDist_mm: +(maxD * 1000).toFixed(1) };
  report.meshes[k] = r;
  if (ea.tris !== eb.tris) problems.push(`${k} : triangles ${ea.tris} → ${eb.tris}`);
  if (missT.length) problems.push(`${k} : formes perdues ${missT.join(', ')}`);
  if (Math.abs(r.height[0] - r.height[1]) > 0.002) problems.push(`${k} : hauteur ${r.height[0]} → ${r.height[1]} m`);
}
for (const [k, v] of Object.entries(a.extras)) if (b.extras[k] !== v) problems.push(`${k} : teinte ${v} → ${b.extras[k]}`);
report.problems = problems;
console.log(JSON.stringify(report, null, 1));
process.exit(problems.length ? 1 : 0);
