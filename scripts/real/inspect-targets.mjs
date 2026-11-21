// Inspection d'un GLB de personnage : formes (morph targets) par maillage avec leur amplitude max, échelle des nœuds.
// Usage : node scripts/real/inspect-targets.mjs public/real/rider_f.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
for (const me of doc.getRoot().listMeshes()) {
  const names = me.getExtras()?.targetNames || [];
  for (const [pi, p] of me.listPrimitives().entries()) {
    const pos = p.getAttribute('POSITION');
    const info = p.listTargets().map((t, i) => { const a = t.getAttribute('POSITION'); if (!a) return names[i] + ':-'; const arr = a.getArray(); let m = 0; for (const v of arr) m = Math.max(m, Math.abs(v)); const q = a.getNormalized() ? (a.getComponentType() === 5122 ? 1 / 32767 : 1 / 127) : 1; return names[i] + ':' + (m * q).toFixed(3); });
    console.log(me.getName(), pi, 'verts', pos.getCount(), 'norm', pos.getNormalized(), pos.getComponentType(), info.join(' '));
  }
}
for (const n of doc.getRoot().listNodes()) if (n.getMesh()) console.log('node', n.getName(), n.getScale().map(v=>v.toFixed(4)), n.getTranslation().map(v=>v.toFixed(3)));
