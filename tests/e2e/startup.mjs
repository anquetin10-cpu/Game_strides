// Démarrage mesuré sur un build servi (production ou e2e), sans les accès de test : octets transférés, délais, fluidité.
// Conditions : Chromium (rendu logiciel SwiftShader), émulation tactile 844 × 390, cache vide, réseau non bridé, même
// machine pour « avant » et « après » ; ce n'est pas un iPhone réel (délais et fluidité dépendent du processeur).
// Jalons :
//  - titre : bouton « Jouer » affiché (tout ce qui est téléchargé jusque-là l'est « avant de jouer ») ;
//  - prise en main : « Jouer » → « C'est parti » → carte d'accueil fermée, HUD et commandes tactiles affichés ;
//  - après : 20 s de jeu (téléchargements en tâche de fond comptés à part), temps entre images (médiane, p90, max).
// Usage : node tests/e2e/startup.mjs <url> <fichier.json>
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const URL = process.argv[2] || 'http://127.0.0.1:4401/';
const OUT = process.argv[3] || 'tests/e2e/out/startup.json';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const reqs = new Map();
let phase = 'titre';
cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, phase, type: e.type, bytes: 0, t0: e.timestamp }));
cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.mime = e.response.mimeType; });
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.t1 = e.timestamp; } });
const t0 = Date.now();
await page.goto(URL, { timeout: 180000 });
const btn = page.locator('[data-id="play"], [data-id="continue"]').first();
await btn.waitFor({ state: 'visible', timeout: 600000 });
const tTitle = Date.now() - t0;
const sum = (p) => [...reqs.values()].filter((r) => !p || r.phase === p).reduce((s, r) => s + r.bytes, 0);
const bytesTitle = sum();
phase = 'prise-en-main';
const tClick = Date.now();
await page.locator('[data-id="play"]').first().tap();
await page.locator('[data-id="start"]').tap({ timeout: 60000 });
// Carte d'accueil : bouton principal de la carte, puis HUD et commandes visibles, sans carte ouverte.
for (let i = 0; i < 6; i++) {
  const card = page.locator('.card .card-actions button.primary').first();
  if (await card.isVisible().catch(() => false)) await card.tap().catch(() => {});
  if (await page.evaluate(() => !document.querySelector('.hud.hidden') && !document.getElementById('touch')?.classList.contains('hidden') && !document.querySelector('.card, .title-screen'))) break;
  await page.waitForTimeout(500);
}
const tControl = Date.now() - tClick;
const bytesControl = sum('prise-en-main');
phase = 'en-jeu';
const frames = await page.evaluate(() => new Promise((res) => {
  const dt = [];
  let last = performance.now();
  const end = last + 20000;
  const f = (t) => { dt.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(dt); };
  requestAnimationFrame(f);
}));
await page.waitForTimeout(1000);
frames.sort((a, b) => a - b);
const q = (p) => +frames[Math.min(frames.length - 1, Math.floor(p * frames.length))].toFixed(1);
const list = [...reqs.values()].filter((r) => r.bytes > 0).sort((a, b) => b.bytes - a.bytes).map((r) => ({ phase: r.phase, mo: +(r.bytes / 1e6).toFixed(3), url: r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 120), mime: r.mime }));
const byKind = {};
for (const r of list) { const k = `${r.phase} · ${/\.glb|gltf/.test(r.url) ? 'glb' : /\.js/.test(r.url) ? 'js' : /image|\.png|\.jpe?g|\.webp|\.ktx2/.test(r.mime + r.url) ? 'image' : /audio|\.mp3|\.ogg|\.m4a/.test(r.mime + r.url) ? 'audio' : 'autre'}`; byKind[k] = +((byKind[k] || 0) + r.mo).toFixed(3); }
const res = {
  url: URL,
  conditions: 'Chromium SwiftShader, émulation tactile 844×390 (pas un iPhone réel), cache vide, réseau local non bridé',
  avantDeJouerMo: +(bytesTitle / 1e6).toFixed(2),
  priseEnMainMo: +(bytesControl / 1e6).toFixed(2),
  enJeu20sMo: +(sum('en-jeu') / 1e6).toFixed(2),
  titreS: +(tTitle / 1000).toFixed(1),
  priseEnMainS: +(tControl / 1000).toFixed(1),
  imagesMs: { mediane: q(0.5), p90: q(0.9), max: q(1), n: frames.length },
  parType: byKind,
  requetes: list,
  erreurs: errors.slice(0, 5),
};
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, requetes: list.slice(0, 15) }, null, 1));
await browser.close();
