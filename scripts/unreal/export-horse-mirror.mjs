// Étape M2 de l'essai de monte (voie A) : oracle des clips miroir du cheval WildMesh (pjl/asset.js bakeMirror), relevé
// dans le jeu web en cours d'exécution par la page scripts/unreal/horse-mirror-export.html (module horse-mirror-export.js).
// Le jeu web est la spécification ; ce script ne modifie rien dans src/, public/ ni tests/.
//
// Relu dans src/entities/pjl/asset.js (une seule occurrence exigée, aucune valeur recopiée) : FPS de la cuisson, liste
// des 11 clips passés à bakeMirror.
//
// Sortie (défaut unreal/core/tests/oracles/monte/miroir/) :
//  - index.json : en-tête (schéma, description des champs), squelette (419 os : noms, parents, repos, matrice monde des
//    parents non-os), pose idle à 0,5 s, et pour chaque clip source et chaque clip miroir la description de son fichier ;
//  - src-<clip>.f64 : pose du clip source à chaque instant de la cuisson, valeurs des propriétés animées seulement
//    (doubles petit-boutistes ; ordre : instant, puis liste « animated » de l'index) ;
//  - <clip>_M.f32 : clip miroir cuit par le jeu, flottants 32 bits petit-boutistes (Float32Array des pistes du jeu) ; pour
//    chaque instant, pour chaque os de « bones » : position 3, quaternion 4.
// Écriture déterministe (deux exports : mêmes octets) ; un fichier inchangé n'est pas réécrit.
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5178 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-horse-mirror.mjs [--out=dossier]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5178';
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const OUT = arg('out') || join(ROOT, 'unreal/core/tests/oracles/monte/miroir');
const SCHEMA = 'strides.oracle.horse_mirror/1';

const ASSET = readFileSync(join(ROOT, 'src/entities/pjl/asset.js'), 'utf8');
function once(re, what) {
  const all = [...ASSET.matchAll(new RegExp(re.source, re.flags + 'g'))];
  if (all.length !== 1) throw new Error(`asset.js : ${what} trouvé ${all.length} fois (1 attendu)`);
  return all[0];
}
const FPS = Number(once(/^const FPS = (\d+);$/m, 'FPS')[1]);
const SOURCES = JSON.parse(
  once(/for \(const name of (\[[^\]]*\])\) \{\n\s*const src = clips\.get\(name\);\n\s*if \(!src\)\n\s*continue;\n\s*resetPose\(\);\n\s*const m = bakeMirror\(/, 'liste des clips miroir')[1].replace(/'/g, '"'),
);

function writeIfChanged(file, data) {
  if (existsSync(file) && Buffer.compare(readFileSync(file), Buffer.from(data)) === 0) return false;
  writeFileSync(file, data);
  return true;
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT }).toString().trim();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page] erreur', e.message));
  await page.goto(`${BASE}/scripts/unreal/horse-mirror-export.html`, { timeout: 180000 });
  await page.waitForFunction(() => window.__mirrorReady === true, null, { timeout: 180000 });
  const R = await page.evaluate((p) => window.__mirror.run(p), { sources: SOURCES, fps: FPS });
  mkdirSync(OUT, { recursive: true });
  const head = {
    schema: SCHEMA,
    generator: 'scripts/unreal/export-horse-mirror.mjs (page scripts/unreal/horse-mirror-export.html)',
    doc:
      'oracle des clips miroir du cheval WildMesh (src/entities/pjl/asset.js bakeMirror), relevé dans le jeu web en cours d’exécution : clips « _M » cuits par le jeu, et entrées de la cuisson (squelette, pose idle à 0,5 s, poses des clips source aux instants de la cuisson posées par le mélangeur three.js).',
    three: R.three,
    fps: FPS,
    sources: SOURCES,
    srcTree: git('rev-parse', 'HEAD:src'),
    glb: git('rev-parse', 'HEAD:public/real/horse_pjl.glb'),
    fields: {
      rig: 'names : noms complets des os (ordre de skeleton.bones) ; parent : indice de l’os parent, −1 si le parent n’est pas un os ; rest : pose de repos locale {p, q (x, y, z, w), s} ; parentWorld : matrice monde (16 valeurs, colonnes, three.js) du parent non-os, null sinon ; skinned : 1 si l’os porte au moins un sommet (poids > 0) d’un maillage skinné du cheval (corps, yeux, crins), 0 sinon',
      idle: 'pose locale de tous les os au clip idle à t = 0,5 s (doubles) ; upperarm : positions monde des bras calculées par three.js (information)',
      src: 'name, duration (s), times (instants demandés au mélangeur, min(duration, f / fps)), clipTime (AnimationAction.time après setTime : bouclage), animated ([os, « p », « q » ou « s »] : propriétés à piste, dans l’ordre des valeurs de chaque instant), file (doubles)',
      mirrored: 'name (nom du clip miroir dans le jeu), duration, times (temps des clés, Float32Array du jeu), bones (os à pistes, ordre des valeurs : position 3 puis quaternion 4), file (flottants 32 bits)',
    },
    boneCount: R.boneCount,
    rig: R.rig,
    idle: R.idle,
    src: [],
    mirrored: [],
  };
  let written = 0;
  for (const s of R.src) {
    const file = `src-${s.name}.f64`;
    written += writeIfChanged(join(OUT, file), Buffer.from(s.vals, 'base64'));
    head.src.push({ name: s.name, duration: s.duration, times: s.times, clipTime: s.clipTime, animated: s.animated, file });
  }
  for (const m of R.mirrored) {
    const file = `${m.name}.f32`;
    written += writeIfChanged(join(OUT, file), Buffer.from(m.vals, 'base64'));
    head.mirrored.push({ name: m.name, duration: m.duration, times: m.times, bones: m.bones, file });
  }
  const text = JSON.stringify(head) + '\n';
  JSON.parse(text);
  written += writeIfChanged(join(OUT, 'index.json'), text);
  console.log(`oracle miroir : ${R.src.length} clips source, ${R.mirrored.length} clips miroir, ${written} fichier(s) écrit(s) dans ${OUT} (préparation du jeu : ${JSON.stringify(R.stats)})`);
} finally {
  await browser.close();
}
