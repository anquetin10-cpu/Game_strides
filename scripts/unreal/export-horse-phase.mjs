// Étape M3 de l'essai de monte (voie A) : données du calage de la phase de foulée du cheval WildMesh, relevées dans le jeu
// web en cours d'exécution (page scripts/unreal/horse-phase-export.html, module horse-phase-export.js), pour que le cheval
// Unreal donne au cavalier la phase de foulée du web (horse.anim.phase) et non la phase brute de son clip.
// Le jeu web est la spécification ; ce script ne modifie rien dans src/, public/ ni tests/.
//
// Relu dans le source (une seule occurrence exigée, aucune valeur recopiée à la main) :
//  - pjlHorse.js _snapshot : clé du calage (galop au-delà d'un seuil de vitesse, main du jeu) et condition de la réécriture
//    de la phase (ni saut, vitesse au-delà d'un seuil) ;
//  - pjl/view.js : temps des clips d'allure = ((s.phase + gaitInfo[k].offset) % 1) · durée ;
//  - human.js : phase lue par le cavalier = h.anim.phase + h.riderPostOffset ; et dans tout src/ : aucune affectation de
//    riderPostOffset (compte écrit dans le fichier : le décalage vaut donc 0 pour tous les chevaux du jeu).
//
// Sortie : unreal/StridesGrandTour/Content/Data/pjl_horse_phase.json (entrées du calage, sortie du calage du jeu, règles
// relues). Écriture déterministe ; un fichier inchangé n'est pas réécrit. --check : compare sans écrire (code 1 si différent).
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5178 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-horse-phase.mjs [--out=fichier] [--check]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5178';
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const OUT = arg('out') || join(ROOT, 'unreal/StridesGrandTour/Content/Data/pjl_horse_phase.json');
const CHECK = process.argv.includes('--check');

const src = (p) => readFileSync(join(ROOT, 'src', p), 'utf8');
function once(text, re, what) {
  const all = [...text.matchAll(new RegExp(re.source, re.flags + 'g'))];
  if (all.length !== 1) throw new Error(`${what} : trouvé ${all.length} fois (1 attendu)`);
  return all[0];
}
const PJL = src('entities/pjlHorse.js');
const keyM = once(PJL, /const key = g === 'canter' \|\| g === 'gallop' \? \(speed > ([\d.]+) \? 'gallop' : 'canter'\) \+ leadDest : g;/, 'pjlHorse.js : clé du calage');
const condM = once(PJL, /if \(al && !jumping && speed > ([\d.]+)\) H\.anim\.phase = wrap01\(this\.ph - al\.off\);/, 'pjlHorse.js : réécriture de la phase');
once(PJL, /const leadDest = \(A\?\.lead \?\? 1\) > 0 \? 'L' : 'R';/, 'pjlHorse.js : main du jeu');
once(src('entities/pjl/view.js'), /const ph = \(s\.phase \+ info\.offset\) % 1;\n\s*act\.time = ph \* clip\.duration;/, 'pjl/view.js : temps des clips d’allure');
once(src('entities/human.js'), /a\.horseGaitPhase = \(h\.anim\.phase \+ \(h\.riderPostOffset \|\| 0\) \+ 1\) % 1;/, 'human.js : phase lue par le cavalier');
// Affectations de riderPostOffset dans tout src/ (lectures exclues).
function walk(d, out = []) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts)$/.test(e)) out.push(p);
  }
  return out;
}
let postAssign = 0, postRead = 0;
for (const f of walk(join(ROOT, 'src'))) {
  const t = readFileSync(f, 'utf8');
  postAssign += [...t.matchAll(/riderPostOffset\s*(=(?!=)|\+=|-=)/g)].length;
  postRead += [...t.matchAll(/riderPostOffset/g)].length;
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT }).toString().trim();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let R;
try {
  const page = await browser.newPage();
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[page]', m.text()));
  page.on('response', (r) => r.status() >= 400 && console.log('[page] ressource', r.status(), r.url()));
  page.on('requestfailed', (r) => console.log('[page] requête échouée', r.url(), r.failure()?.errorText));
  page.on('pageerror', (e) => console.log('[page] erreur', e.message));
  await page.goto(`${BASE}/scripts/unreal/horse-phase-export.html`, { timeout: 180000 });
  await page.waitForFunction(() => window.__phaseReady === true, null, { timeout: 180000 });
  R = await page.evaluate(() => window.__phase.run());
} finally {
  await browser.close();
}

const doc = {
  schema: 'strides.pjl_horse_phase/1',
  generator: 'scripts/unreal/export-horse-phase.mjs (page scripts/unreal/horse-phase-export.html)',
  source: ['src/entities/pjl/asset.js', 'src/entities/pjl/view.js', 'src/entities/pjlHorse.js', 'src/entities/horse/anim.js', 'src/entities/human.js'],
  doc:
    'calage de la phase de foulée du cheval WildMesh, relevé dans le jeu web en cours d’exécution. Phase des clips de la vue : ph (pjlHorse.js this.ph) ; temps d’un clip d’allure k = ((ph + gaitInfo[k].offset) % 1) · durée (pjl/view.js). Phase lue par le cavalier : horse.anim.phase = wrap01(ph − align[clé].off) quand align[clé] existe, sans saut et au-delà de rules.minSpeed m/s (pjlHorse.js _snapshot ; clé = allure du jeu, ou au galop (speed > rules.gallopAbove ? gallop : canter) + main du jeu), sinon la phase de la locomotion procédurale (horse/anim.js) ; plus riderPostOffset (human.js), jamais affecté dans src/. gaitContacts : appuis des clips mesurés par asset.js (touch : phase du poser AG, AD, PG, PD ; duty ; duration, s) ; gaitOffsets : GAIT_OFFSETS de horse/anim.js ; web.align, web.leadSwap : sortie de PjlHorse._calibrate dans la page (off, res).',
  srcTree: git('rev-parse', 'HEAD:src'),
  three: R.three,
  rules: { gallopAbove: Number(keyM[1]), minSpeed: Number(condM[1]) },
  riderPostOffset: { assignments: postAssign, occurrences: postRead },
  gaitInfo: R.gaitInfo,
  gaitOffsets: R.gaitOffsets,
  gaitContacts: R.gaitContacts,
  web: { align: R.align, leadSwap: R.leadSwap },
};
const text = JSON.stringify(doc, null, 1) + '\n';
JSON.parse(text);
if (CHECK) {
  const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
  console.log(`${OUT} : ${same ? 'identique' : 'DIFFÉRENT'} de l’export du jeu`);
  process.exit(same ? 0 : 1);
}
const changed = !existsSync(OUT) || readFileSync(OUT, 'utf8') !== text;
if (changed) writeFileSync(OUT, text);
console.log(`${OUT} : ${changed ? 'écrit' : 'inchangé'} (${text.length} octets) ; align ${JSON.stringify(Object.fromEntries(Object.entries(R.align).map(([k, v]) => [k, v && +v.off.toFixed(6)])))} ; leadSwap ${R.leadSwap} ; riderPostOffset : ${postAssign} affectation(s), ${postRead} occurrence(s)`);
