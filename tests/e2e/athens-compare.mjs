// Vues comparatives STRIDES ↔ vidéo de référence (Athens 2004, PS2) à des moments équivalents : abord, appel,
// suspension, réception, courbe. Les moments STRIDES viennent de l'enregistrement de cso-athens.mjs (VIDEO=1,
// fichier .events.json) ; ceux de la référence sont donnés en secondes.
// Usage :
//   node tests/e2e/athens-compare.mjs <vidéo STRIDES.mp4> [référence.mp4 abord=12.3,appel=13.1,suspension=13.4,reception=13.9,courbe=16]
// Sans vidéo de référence : planche STRIDES seule, avec un emplacement « référence à fournir ».
// Sorties : tests/e2e/out/compare/<moment>.jpg (côte à côte) et planche.jpg.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';

const [ours, ref, refTimes] = process.argv.slice(2);
if (!ours) {
  console.log('usage : node tests/e2e/athens-compare.mjs <strides.mp4> [reference.mp4 abord=…,appel=…]');
  process.exit(2);
}
const OUT = 'tests/e2e/out/compare';
mkdirSync(OUT, { recursive: true });
const ev = JSON.parse(readFileSync(ours.replace(/\.mp4$/, '.events.json'), 'utf8'));
const names = ['abord', 'appel', 'suspension', 'reception', 'courbe'];
const rt = Object.fromEntries((refTimes || '').split(',').filter(Boolean).map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)]));
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const H = 360;
const tiles = [];
for (const n of names) {
  const e = ev.events.find((x) => x.name === n);
  if (!e) continue;
  const t = e.frame / ev.fps;
  const a = `${OUT}/${n}-strides.jpg`;
  ff(['-ss', String(t), '-i', ours, '-frames:v', '1', '-vf', `scale=-2:${H},drawtext=text='STRIDES · ${n}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=5`, a]);
  const b = `${OUT}/${n}-reference.jpg`;
  if (ref && existsSync(ref) && rt[n] !== undefined) {
    ff(['-ss', String(rt[n]), '-i', ref, '-frames:v', '1', '-vf', `scale=-2:${H},drawtext=text='Référence Athens 2004 · ${n}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=5`, b]);
  } else {
    ff(['-f', 'lavfi', '-i', `color=c=0x1b1c1f:s=780x${H}`, '-frames:v', '1', '-vf', `drawtext=text='Référence Athens 2004 · ${n}\\: vidéo à fournir':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=20:fontcolor=white`, b]);
  }
  const pair = `${OUT}/${n}.jpg`;
  ff(['-i', a, '-i', b, '-filter_complex', `[0]scale=780:${H}[x];[1]scale=780:${H}[y];[x][y]hstack`, pair]);
  tiles.push(pair);
}
if (tiles.length) {
  const inputs = tiles.flatMap((p) => ['-i', p]);
  ff([...inputs, '-filter_complex', `${tiles.map((_, i) => `[${i}]`).join('')}vstack=inputs=${tiles.length}`, `${OUT}/planche.jpg`]);
}
console.log(`${tiles.length} vues comparatives → ${OUT}/ (planche.jpg)`);
