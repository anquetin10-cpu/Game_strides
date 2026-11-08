// Série courte de tests de bout en bout (CI, toutes les branches) : rendu logiciel SwiftShader de Chromium, émulation
// tactile en paysage. Ce n'est pas un iPhone réel : Safari iPhone se valide à part (LIVRAISON_SOCLE/PROTOCOLE_IPHONE.md).
// Chaque test tourne dans son propre processus contre BASE (serveur de développement ou « vite preview » d'un build
// « vite build --mode e2e ») ; captures et journaux dans tests/e2e/out/smoke/.
// Usage : BASE=http://127.0.0.1:4173 node tests/e2e/smoke.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'tests/e2e/out/smoke';
mkdirSync(OUT, { recursive: true });
const TESTS = [
  ['premieres-minutes', ['tests/e2e/first-minutes.mjs', `${OUT}/premieres-minutes`, '844x390']],
  ['sauvegardes', ['tests/e2e/save-guard.mjs', `${OUT}/sauvegardes`]],
  ['montee-descente', ['tests/e2e/horse-mount.mjs']],
  ['reprise-mission', ['tests/e2e/mission-resume.mjs']],
  ['cheval-cavalier', ['tests/e2e/pjl/ride.mjs', `${OUT}/cheval-cavalier`, '844x390'], { SHOTS: '0' }],
];
const only = process.argv[2]?.split(',');
const results = [];
for (const [name, args, env = {}] of TESTS) {
  if (only && !only.includes(name)) continue;
  const t0 = Date.now();
  const code = await new Promise((res) => {
    const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const keep = (d) => { log += d; process.stdout.write(d); };
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    const kill = setTimeout(() => p.kill('SIGKILL'), 20 * 60 * 1000);
    p.on('close', (c) => { clearTimeout(kill); writeFileSync(`${OUT}/${name}.log`, log); res(c ?? 1); });
  });
  results.push({ name, ok: code === 0, code, s: Math.round((Date.now() - t0) / 1000) });
  console.log(`\n### ${name} : ${code === 0 ? 'OK' : `ÉCHEC (code ${code})`} en ${results.at(-1).s} s\n`);
}
writeFileSync(`${OUT}/resume.json`, JSON.stringify(results, null, 1));
console.table(results);
process.exit(results.every((r) => r.ok) ? 0 : 1);
