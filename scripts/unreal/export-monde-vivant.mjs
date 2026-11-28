// Jalon J3 (monde vivant de Deauville) : circulation, passants, spectateurs et mini-carte relevés dans le jeu web en
// cours d'exécution (page scripts/unreal/monde-vivant-export.html, module monde-vivant-export.js). Le jeu web est la
// spécification ; ce script ne modifie rien dans src/, public/ ni tests/.
//
// Sorties (écriture déterministe ; un fichier inchangé n'est pas réécrit ; --check compare sans écrire, code 1 si différent) :
//  - unreal/StridesGrandTour/Content/Data/world_ambient.json : données lues par le jeu (routes complètes du web, îlots de
//    la ville, voitures de la circulation avec route, abscisse, sens, allure, modèle et teinte ; passants avec boucle,
//    vitesse et tenue ; spectateurs du Pôle ; gabarits des modèles de voiture) ;
//  - unreal/core/tests/oracles/monde_vivant.json : trajectoires du web (circulation libre, cheval sur la chaussée,
//    piéton sur la chaussée, passant abordé) et images de la mini-carte, lues par le ctest « monde-vivant ».
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5178 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-monde-vivant.mjs [--check]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5178';
const CHECK = process.argv.includes('--check');
const git = (...a) => execFileSync('git', a, { cwd: ROOT }).toString().trim();

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let R;
try {
  const page = await browser.newPage();
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page] erreur', e.message));
  await page.goto(`${BASE}/scripts/unreal/monde-vivant-export.html`, { timeout: 180000 });
  await page.waitForFunction(() => window.__mondeReady === true, null, { timeout: 180000 });
  R = await page.evaluate(() => window.__monde.run());
} finally {
  await browser.close();
}

const srcTree = git('rev-parse', 'HEAD:src');
const data = {
  schema: 'strides.world_ambient/1',
  generator: 'scripts/unreal/export-monde-vivant.mjs (page scripts/unreal/monde-vivant-export.html)',
  source: ['src/gameplay/npcs.js', 'src/world/layout.js', 'src/world/sites.js', 'src/world/props.js', 'src/entities/human/outfits.js'],
  doc:
    'vie ambiante du web (Ambient.spawn, graine Math.random écrite) : roads = ROADS de layout.js (w : largeur, m) ; townBlocks = TOWN_BLOCKS de sites.js [x0, x1, z0, z1] (agglomération à 50 km/h, marge 30 m) ; cars : voitures de la circulation (route, s abscisse en m, dir sens de parcours, cruise facteur d’allure, kind modèle, color teinte) ; carModels : gabarits (L longueur, W largeur, wb empattement, r rayon de roue, m) ; walkers : passants (boucle de points, vitesse m/s, tenue randomOutfit) ; spectators : spectateurs du bord de la carrière du Pôle.',
  srcTree,
  seed: R.seed,
  world: R.world,
  roads: R.roads,
  townBlocks: R.townBlocks,
  poleArena: R.poleArena,
  carModels: R.cars,
  carColors: R.carColors,
  cars: R.spawn.cars,
  walkers: R.spawn.walkers,
  spectators: R.spawn.spectators,
};
const oracle = {
  schema: 'strides.oracle.monde_vivant/1',
  generator: data.generator,
  srcTree,
  doc:
    'traces du web au pas de 1/30 s : passants (WalkAI.update, ordre d’apparition), puis Ambient.update (Car.update, séparation des passants une image sur deux) ; Math.random = mulberry32(simSeed) après l’apparition ; terrain plat, collisions du monde des passants (colliders.resolve) sans effet ; séparation des passants comprise. free : joueur à cheval à l’Écurie du Val ; horse : cheval arrêté sur la route principale (x −32,2, z 100) ; foot : joueur à pied au même endroit ; near : joueur à 1,6 m du premier passant. minimap : images de Minimap.draw (toile 132 px) : mapRotate (lacet), image (décalage et taille), route (points), blips (x, y, échelle), arrowRotate, north (centre du rond N), range.',
  simSeeds: { free: 2026, horse: 11, foot: 12, near: 13 },
  traces: R.traces,
  minimap: R.minimap,
};

let diff = false;
for (const [file, doc] of [
  [join(ROOT, 'unreal/StridesGrandTour/Content/Data/world_ambient.json'), data],
  [join(ROOT, 'unreal/core/tests/oracles/monde_vivant.json'), oracle],
]) {
  const text = JSON.stringify(doc) + '\n';
  JSON.parse(text);
  const same = existsSync(file) && readFileSync(file, 'utf8') === text;
  if (CHECK) {
    console.log(`${file} : ${same ? 'identique' : 'DIFFÉRENT'} de l’export du jeu`);
    diff ||= !same;
    continue;
  }
  if (!same) writeFileSync(file, text);
  console.log(`${file} : ${same ? 'inchangé' : 'écrit'} (${text.length} octets)`);
}
console.log(`voitures ${data.cars.length}, passants ${data.walkers.length}, spectateurs ${data.spectators.length}, routes ${data.roads.length}, images de carte ${oracle.minimap.frames.length}`);
if (CHECK) process.exit(diff ? 1 : 0);
