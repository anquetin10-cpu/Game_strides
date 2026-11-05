// Vérifications de l'interface (iPhone émulé, paysage) : objectif sans mission + toucher → Strides ; boutons visibles
// sans chevauchement ni sortie d'écran ; tailles tactiles ; à pied, à cheval, après reprise.
// Usage : node tests/e2e/ui-pass/check.mjs [se|i14|emb]   (emb : 844 × 330, hauteur du lecteur intégré)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const which = process.argv[2] || 'se';
const [W, H] = { se: [667, 375], i14: [844, 390], emb: [844, 330] }[which];
const base = process.env.BASE || 'http://127.0.0.1:5173';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const check = (l, ok, x = '') => { console.log(`${ok ? '✔' : '✘'} [${which}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const layout = () => p.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && !e.closest('.hidden,.off,.hide'); };
  const els = [...document.querySelectorAll('.hud button, .hud .btn-round, .hud .objective, .hud .wallet, .hud .minimap-wrap, .hud .telemetry, #touch .stick, #touch [class*="joy"]')].filter(vis);
  const R = els.map((e) => ({ n: (e.dataset.id || e.className.toString().split(' ').slice(0, 2).join('.')), r: e.getBoundingClientRect(), e }));
  const over = [], out = [], small = [];
  for (let i = 0; i < R.length; i++) {
    const a = R[i].r;
    if (a.left < -1 || a.top < -1 || a.right > innerWidth + 1 || a.bottom > innerHeight + 1) out.push(R[i].n);
    if (R[i].e.matches('button, .btn-round') && Math.min(a.width, a.height) < 40) small.push(`${R[i].n} ${Math.round(a.width)}px`);
    for (let j = i + 1; j < R.length; j++) {
      if (R[i].e.contains(R[j].e) || R[j].e.contains(R[i].e)) continue;
      const c = R[j].r, w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (w > 3 && h > 3) over.push(`${R[i].n} × ${R[j].n}`);
    }
  }
  const lab = [...document.querySelectorAll('.btn-action span, .btn-action2 span')].filter(vis).map((s) => +parseFloat(getComputedStyle(s).fontSize).toFixed(1) * (s.closest('.actions') ? +(getComputedStyle(s.closest('.actions')).transform.match(/matrix\(([^,]+)/)?.[1] || 1) : 1));
  return { n: R.length, over, out, small, lab: lab.map((x) => +x.toFixed(1)) };
});
await p.goto(base + '/?autostart');
await p.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 300000 });
await p.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await p.evaluate(async () => { const A = window.__auto, g = window.__game; A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards(); g.missions.refreshOffers?.(true); for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 50)); });
await p.waitForTimeout(800);
const obj = await p.evaluate(() => { const e = document.querySelector('.objective'); return { shown: !e.classList.contains('off'), idle: e.classList.contains('idle'), text: e.textContent.slice(0, 80), offers: window.__game.missions.offers.filter((o) => !o.locked).length }; });
check('sans mission : prochaine étape affichée quand une mission attend', !obj.offers || (obj.shown && obj.idle), JSON.stringify(obj));
if (obj.shown) {
  const box = await p.locator('.objective').boundingBox();
  await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await p.waitForTimeout(700);
  const ph = await p.evaluate(() => ({ open: !!document.querySelector('.phone-layer.open'), app: window.__game.phone.app || window.__game.phone.current || null, strides: !!document.querySelector('.phone-layer.open .app-rail, .phone-layer.open [data-app-view="strides"], .phone-layer.open .strides-app') }));
  check('toucher l’objectif ouvre le téléphone sur Strides', ph.open, JSON.stringify(ph));
  await p.evaluate(() => window.__game.phone.close());
  await p.waitForTimeout(400);
}
let L = await layout();
check('à pied : aucun chevauchement, rien hors écran', !L.over.length && !L.out.length, JSON.stringify(L));
await p.evaluate(async () => { const A = window.__auto; A.mount(); for (let i = 0; i < 40; i++) { A.steer(0, 1, 0.5); A.tick(1); await new Promise((r) => setTimeout(r, 15)); } A.releaseInput(); });
await p.waitForTimeout(700);
L = await layout();
check('à cheval : aucun chevauchement, rien hors écran', !L.over.length && !L.out.length, JSON.stringify(L));
check('libellés d’actions ≥ 8 px à l’écran', L.lab.every((x) => x >= 8), JSON.stringify(L.lab));
const tele = await p.evaluate(() => { const e = document.querySelector('.telemetry'); const r = e.getBoundingClientRect(); return { ride: e.classList.contains('ride'), h: Math.round(r.height), w: Math.round(r.width) }; });
check('à cheval : télémétrie compacte', tele.ride, JSON.stringify(tele));
// Reprise.
await p.reload();
await p.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 300000 });
await p.waitForTimeout(800);
L = await layout();
check('reprise : partie relancée, interface sans chevauchement', !L.over.length && !L.out.length, JSON.stringify(L));
check('aucune erreur JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
await b.close();
process.exit(fails ? 1 : 0);
