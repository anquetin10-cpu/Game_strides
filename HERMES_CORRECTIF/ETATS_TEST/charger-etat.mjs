// Charge un état de test privé dans un navigateur Chromium (Playwright) ouvert à l'écran, puis attend que le testeur
// joue : écran titre → « Continuer ». Rien n'est ajouté au jeu : la sauvegarde est écrite dans le stockage local
// (clé strides-grand-tour-v1), exactement comme le jeu l'écrit lui-même.
// Usage : node HERMES_CORRECTIF/ETATS_TEST/charger-etat.mjs E05 [URL du jeu, défaut http://127.0.0.1:5173/]
//   Option IPHONE=1 : émulation iPhone 13 paysage (tactile).
import { chromium, devices } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const url = process.argv[3] || 'http://127.0.0.1:5173/';
const file = readdirSync(dir).find((f) => f.endsWith('.json') && id && f.startsWith(id));
if (!file) {
  console.log('États disponibles :');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) console.log(`  ${f.replace('.json', '')} — ${JSON.parse(readFileSync(join(dir, f), 'utf8')).titre}`);
  process.exit(1);
}
const st = JSON.parse(readFileSync(join(dir, file), 'utf8'));
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext(process.env.IPHONE ? { ...devices['iPhone 13 landscape'] } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.goto(url);
await page.evaluate(([k, v]) => {
  localStorage.setItem('strides-lang', 'fr');
  localStorage.setItem(k, v);
}, [st.cle, st.sauvegarde]);
await page.reload();
console.log(`État ${st.id} chargé (build ${st.build.commit}) : ${st.titre}\nÀ l'écran titre, touchez « Continuer ».\nUsage : ${st.usage}`);
// La fenêtre reste ouverte jusqu'à sa fermeture par le testeur.
await new Promise((r) => browser.on('disconnected', r));
