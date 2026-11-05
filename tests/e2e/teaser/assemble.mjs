// Montage du teaser : plans du jeu (images 1280 × 720, 24 images/s) agrandis en 1920 × 1080, légère étalonnage,
// sous-titres en fondu, cartons (Strides présente, titre final), fondus enchaînés, musique synthétisée calée sur les
// plans (music.mjs), niveau sonore normalisé. Sortie : H.264 + AAC.
// Usage : node tests/e2e/teaser/assemble.mjs [plan.json]   (plan par défaut : tests/e2e/teaser/plan.json)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTD = join(HERE, '../out/teaser');
const G = join(OUTD, 'graphics');
const plan = JSON.parse(readFileSync(process.argv[2] || join(HERE, 'plan.json'), 'utf8'));
const FPS = 24, X = plan.crossfade ?? 0.4; // durée des fondus enchaînés (s)

// Segments : { kind: 'card', png, dur } | { kind: 'shot', id, cap, from?, to? (images), speed? }.
const segs = plan.segments.map((s) => {
  if (s.kind === 'card') return { ...s, dur: s.dur };
  const dir = join(OUTD, s.id);
  const n = readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
  const from = s.from ?? 0, to = Math.min(s.to ?? n, n);
  return { ...s, dir, n, from, to, dur: (to - from) / FPS };
});
// Début de chaque segment sur la frise (les fondus se chevauchent).
let t = 0;
segs.forEach((s, i) => {
  s.start = t;
  t += s.dur - (i < segs.length - 1 ? X : 0);
});
const total = t;
const at = (id, off = 0) => {
  const s = segs.find((x) => x.id === id);
  return s ? +(s.start + off).toFixed(2) : null;
};

// Musique calée sur les plans.
const cues = {
  dur: +total.toFixed(2),
  calm: at('p1-aerien') ?? 3,
  gallop: at('p3-galop-plage') ?? 12,
  drive: at('p4-camion') ?? 17,
  jump: at('p6-cso', plan.jumpAt ?? 3) ?? 27,
  paris: at('p6b-paris') ?? 30,
  phone: at('p7-telephone') ?? 34,
  night: at('p8-nuit') ?? 37.5,
  end: segs[segs.length - 1].start,
};
cues.rise = +(cues.jump - 2).toFixed(2);
const wav = join(OUTD, 'music.wav');
execFileSync('node', [join(HERE, 'music.mjs'), wav, JSON.stringify(cues)], { stdio: 'inherit' });

// Graphe ffmpeg.
const args = ['-y', '-loglevel', 'error'];
const chains = [];
segs.forEach((s, i) => {
  if (s.kind === 'card') {
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.dur), '-i', join(G, s.png));
    // Carton : léger zoom avant, fondu depuis le noir pour le premier.
    const z = s.zoom ?? 0.03;
    chains.push(`[${i}:v]scale=2112:1188,zoompan=z='1+${z}*on/${Math.round(s.dur * FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS},format=yuv420p,setsar=1${i === 0 ? `,fade=t=in:st=0:d=0.8` : ''}[v${i}]`);
  } else {
    args.push('-framerate', String(FPS), '-start_number', String(s.from), '-i', join(s.dir, '%05d.jpg'));
    const capIdx = s.cap ? null : -1;
    chains.push(`[${i}:v]trim=end_frame=${s.to - s.from},setpts=PTS-STARTPTS,scale=1920:1080:flags=lanczos,eq=contrast=1.04:saturation=1.08:gamma=0.98,unsharp=5:5:0.35,format=yuv420p,setsar=1[b${i}]`);
    s.capIdx = capIdx;
  }
});
// Sous-titres : une entrée PNG par plan sous-titré, superposée en fondu (apparition 0,5 s après le début, disparition
// 0,5 s avant la fin).
let k = segs.length;
segs.forEach((s, i) => {
  if (s.kind !== 'shot') return;
  if (!s.cap) {
    chains.push(`[b${i}]null[v${i}]`);
    return;
  }
  args.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.dur), '-i', join(G, `${s.cap}.png`));
  const a = 0.5, b = Math.max(a + 0.8, s.dur - 0.6);
  chains.push(`[${k}:v]format=rgba,fade=t=in:st=${a}:d=0.45:alpha=1,fade=t=out:st=${b}:d=0.45:alpha=1[c${i}]`);
  chains.push(`[b${i}][c${i}]overlay=0:0:shortest=1,format=yuv420p[v${i}]`);
  k++;
});
// Fondus enchaînés.
let prev = 'v0', acc = segs[0].dur;
for (let i = 1; i < segs.length; i++) {
  const off = (acc - X).toFixed(3);
  const outL = i === segs.length - 1 ? 'vx' : `x${i}`;
  const tr = segs[i].transition || (segs[i].kind === 'card' || segs[i - 1].kind === 'card' ? 'fadeblack' : 'fade');
  chains.push(`[${prev}][v${i}]xfade=transition=${tr}:duration=${X}:offset=${off}[${outL}]`);
  prev = outL;
  acc += segs[i].dur - X;
}
chains.push(`[vx]fade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[vout]`);
args.push('-i', wav);
const aIdx = k;
chains.push(`[${aIdx}:a]loudnorm=I=-15:TP=-1.5:LRA=9,atrim=end=${total.toFixed(3)},afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[aout]`);
const out = join(OUTD, plan.output || 'teaser-equestrian-tour.mp4');
args.push('-filter_complex', chains.join(';'), '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', total.toFixed(3), out);
console.log(`segments : ${segs.map((s) => `${s.id || s.png}@${s.start.toFixed(1)}s(${s.dur.toFixed(1)})`).join(' ')}`);
console.log(`durée : ${total.toFixed(1)} s ; repères musique : ${JSON.stringify(cues)}`);
if (!existsSync(G)) throw new Error('graphismes absents : node tests/e2e/teaser/graphics.mjs');
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log(`teaser → ${out}`);
