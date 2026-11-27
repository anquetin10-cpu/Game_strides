// Jalon J3-D (monde vivant de Deauville) : fers d'or Strides à collectionner du jeu web (src/gameplay/collectibles.js :
// HORSESHOES, ramassage à 2,6 m, +25 € chacun, +500 € à la collection complète, visibles à moins de 220 m ; repères de
// la mini-carte à moins de 70 m, game.js getBlips). Les positions sont relevées dans le texte source (le module importe
// three) ; les règles sont vérifiées dans le texte : l'export échoue si le web les change. Rien n'est modifié dans src/.
// Sortie : unreal/StridesGrandTour/Content/Data/world_horseshoes.json (--check : compare sans écrire, code 1 si différent).
// Usage : node scripts/unreal/export-fers.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = process.argv.includes('--check');
const col = readFileSync(join(ROOT, 'src/gameplay/collectibles.js'), 'utf8');
const game = readFileSync(join(ROOT, 'src/game.js'), 'utf8');
const m = col.match(/export const HORSESHOES = (\[[\s\S]*?\]);/);
if (!m) throw new Error('HORSESHOES introuvable');
const shoes = Function(`return (${m[1]});`)();
const need = [
  [col, /if \(d < 2\.6\)/, 'ramassage à 2,6 m'],
  [col, /d2\.money \+= 25;/, '+25 €'],
  [col, /d2\.money \+= 500;/, '+500 € à la collection complète'],
  [col, /it\.g\.visible = d < 220;/, 'visibles à moins de 220 m'],
  [game, /this\.collectibles\.blips\(\)\) if \(Math\.hypot\(b\.x - f\.x, b\.z - f\.z\) < 70\)/, 'repères à moins de 70 m'],
];
for (const [text, re, what] of need) if (!re.test(text)) throw new Error(`règle du web changée : ${what}`);
const out = {
  schema: 'strides.horseshoes.v1', generator: 'scripts/unreal/export-fers.mjs', source: ['src/gameplay/collectibles.js', 'src/game.js'],
  pickupRadius: 2.6, reward: 25, completeBonus: 500, visibleDist: 220, blipDist: 70, height: 1.3,
  shoes: shoes.map(([x, z]) => ({ x, z })),
};
const path = join(ROOT, 'unreal/StridesGrandTour/Content/Data/world_horseshoes.json');
const text = JSON.stringify(out, null, 1) + '\n';
if (CHECK) {
  const same = existsSync(path) && readFileSync(path, 'utf8') === text;
  console.log(same ? 'inchangé' : 'DIFFÉRENT', path);
  process.exit(same ? 0 : 1);
}
writeFileSync(path, text);
console.log('écrit', path, `${shoes.length} fers d'or`);
