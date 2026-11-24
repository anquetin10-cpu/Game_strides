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

// Scénarios de synthèse (entrées seulement ; les sorties sont celles du code du jeu).
const DT = 1 / 30;
const rep = (n, v) => Array.from({ length: n }, () => v);
const LEAD = [
  { name: 'virage 0,27 tenu (seuil 0,25)', speed: 7, frames: rep(40, [-0.27, DT]) },
  { name: 'virage 0,26 tenu', speed: 7, frames: rep(30, [-0.26, DT]) },
  { name: 'virage 0,25 exact (inégalité stricte)', speed: 7, frames: rep(30, [-0.25, DT]) },
  { name: 'maintien interrompu (virage nul)', speed: 7, frames: [...rep(12, [-0.4, DT]), [0, DT], ...rep(12, [-0.4, DT]), ...rep(20, [-0.4, DT])] },
  { name: 'maintien interrompu (virage du côté de la main)', speed: 7, frames: [...rep(12, [-0.4, DT]), [0.4, DT], ...rep(12, [-0.4, DT])] },
  { name: 'maintien 0,5 s exact (pas 0,0625 s)', speed: 7, frames: rep(10, [-0.5, 0.0625]) },
  { name: 'pas de 0,15 s (borné à 0,1 s)', speed: 7, frames: rep(8, [-0.5, 0.15]) },
  { name: 'pas variables', speed: 7, frames: Array.from({ length: 60 }, (_, f) => [-0.3, 0.01 + 0.02 * (f % 5)]) },
  { name: 'aller-retour', speed: 7, frames: [...rep(30, [-0.6, DT]), ...rep(30, [0.6, DT]), ...rep(10, [-0.6, DT]), ...rep(30, [0, DT])] },
  { name: 'sinus', speed: 7, frames: Array.from({ length: 300 }, (_, f) => [0.8 * Math.sin((2 * Math.PI * f) / 90), DT]) },
];
const jumpCase = (lead, speed, mode = 'air') => ({ name: `saut ${mode}, main ${lead}, ${speed} m/s`, frames: [...rep(5, ['ride', lead, speed, DT]), ...rep(10, [mode, lead, speed, DT]), ...rep(3, ['landing', lead, speed, DT])] });
const VIEW = [
  ...[6.5, 7, 7.5, 7.999, 8, 8.000001, 8.5, 10].flatMap((v) => ['L', 'R'].map((l) => jumpCase(l, v))),
  jumpCase('L', 6.5, 'takeoff'),
  jumpCase('R', 9, 'takeoff'),
  {
    name: 'main changée en vol, puis second saut',
    frames: [...rep(5, ['ride', 'L', 7, DT]), ...rep(3, ['air', 'L', 7, DT]), ...rep(5, ['air', 'R', 7, DT]), ...rep(5, ['ride', 'R', 9, DT]), ...rep(3, ['air', 'R', 9, DT]), ...rep(3, ['air', 'L', 7, DT])],
  },
];
const DECISIONS = { lead: LEAD, view: VIEW };

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
  page.on('response', (r) => r.status() >= 400 && console.log('[page] ressource', r.status(), r.url()));
  page.on('requestfailed', (r) => console.log('[page] requête échouée', r.url(), r.failure()?.errorText));
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
  // Décisions de la main et du saut (decisions.json) : scénarios de synthèse joués par le code du jeu (page, decisions()).
  const D = await page.evaluate((p) => window.__mirror.decisions(p), DECISIONS);
  const dec = {
    schema: 'strides.oracle.horse_lead_decisions/1',
    generator: head.generator,
    doc:
      'décisions de la main au galop (src/entities/horse/anim.js animateHorse, cheval procédural du jeu, état neuf par scénario) et du clip de saut de la vue WildMesh (src/entities/pjl/view.js HorseView.update, cheval préparé par le jeu), jouées par le code du jeu sur des entrées de synthèse ; sert à départager ce que les parcours d’O1 ne départagent pas (seuil de virage, maintien interrompu, borne du pas, seuil de vitesse du saut, miroir selon la main).',
    srcTree: head.srcTree,
    fields: {
      lead: 'name ; speed ; frames : [virage (st.turn, rad/s, > 0 à gauche), pas dt (s)] ; out : après chaque image [A.lead, A.leadHold]',
      view: 'name ; frames : [s.mode, s.lead, s.speed (m/s), dt] ; out : après chaque image [jumpClip.name ou null, jumpMirror, leadBlend]',
    },
    lead: DECISIONS.lead.map((sc, i) => ({ ...sc, out: D.lead[i].out })),
    view: DECISIONS.view.map((sc, i) => ({ ...sc, out: D.view[i].out })),
  };
  const decText = JSON.stringify(dec) + '\n';
  JSON.parse(decText);
  written += writeIfChanged(join(OUT, 'decisions.json'), decText);
  const text = JSON.stringify(head) + '\n';
  JSON.parse(text);
  written += writeIfChanged(join(OUT, 'index.json'), text);
  console.log(`oracle miroir : ${R.src.length} clips source, ${R.mirrored.length} clips miroir, ${written} fichier(s) écrit(s) dans ${OUT} (préparation du jeu : ${JSON.stringify(R.stats)})`);
} finally {
  await browser.close();
}
