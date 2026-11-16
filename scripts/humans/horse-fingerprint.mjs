// Empreintes SHA-256 des fichiers du cheval (gelé pendant le chantier humains) : modèles, textures, rig, animations,
// physique, sauts, obstacles, harnachement. Usage : node scripts/humans/horse-fingerprint.mjs [fichier.json de référence]
// Sans argument : affiche la liste ; avec une référence : compare et sort en erreur au moindre écart.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [
  'public/real/horse_pjl.glb', 'public/real/horse_tripo.glb', 'assets-src/horse-tripo',
  'src/entities/horse.js', 'src/entities/horseModel.js', 'src/entities/horseData.js', 'src/entities/horse',
  'src/entities/pjl', 'src/entities/pjlHorse.js', 'src/entities/tripoHorse.js',
  'src/gameplay/jumpModel.js', 'src/gameplay/obstacles.js', 'src/gameplay/limbContact.js', 'src/gameplay/csoRide.js', 'src/gameplay/csoCourse.js', 'src/gameplay/courseAids.js',
];
const files = [];
const walk = (p) => {
  if (!existsSync(p)) return;
  if (statSync(p).isDirectory()) for (const f of readdirSync(p).sort()) walk(join(p, f));
  else files.push(p);
};
ROOTS.forEach(walk);
const out = Object.fromEntries(files.map((f) => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));
const ref = process.argv[2];
if (!ref) {
  console.log(JSON.stringify(out, null, 1));
} else {
  const R = JSON.parse(readFileSync(ref, 'utf8'));
  const keys = new Set([...Object.keys(R), ...Object.keys(out)]);
  let bad = 0;
  for (const k of keys) if (R[k] !== out[k]) (bad++, console.log('DIFFÉRENT', k));
  console.log(bad ? `${bad} fichier(s) du cheval modifié(s)` : `cheval inchangé (${keys.size} fichiers)`);
  process.exit(bad ? 1 : 0);
}
