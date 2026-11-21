// Assemble les images d'un dossier (une image par pas de 1/30 s du jeu, rendu SwiftShader) en deux vidéos : vitesse réelle
// (30 i/s) et ralenti × 3 (10 i/s), plus une planche contact (une image sur N) pour l'examen image par image.
// Usage : node tests/e2e/frames-to-video.mjs <dossier d'images> <sortie sans extension> "<titre>" [pas de la planche=6]
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [dir, out, title = '', every = '6'] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
if (!files.length) throw new Error('aucune image dans ' + dir);
const pattern = `${dir}/%0${files[0].length - 4}d.jpg`;
const start = String(parseInt(files[0], 10));
const label = (t) => `drawtext=text='${t.replace(/[':]/g, ' ')}':x=12:y=h-30:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=5`;
for (const [fps, tag, name] of [[30, 'vitesse réelle', ''], [10, 'ralenti x3', '-ralenti']]) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps), '-start_number', start, '-i', pattern,
    '-vf', label(`${title} - ${tag} (capture du jeu, SwiftShader)`), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', `${out}${name}.mp4`]);
}
const n = Math.ceil(files.length / Number(every));
const cols = 4, rows = Math.ceil(n / cols);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-start_number', start, '-i', pattern,
  '-vf', `select='not(mod(n\\,${every}))',scale=480:-1,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '4', `${out}-planche.jpg`]);
console.log(`${out}.mp4, ${out}-ralenti.mp4, ${out}-planche.jpg (${files.length} images)`);
