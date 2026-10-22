// Parcours « demande de mission » comme sur iPhone, au vrai toucher (CDP) : notification → Demande reçue →
// Accepter la mission (deux touchers) → mission démarrée ; puis refus (feuille) et contre-proposition.
// Usage : node tests/e2e/request-flow.mjs 844x390 [emb]   (BASE=http://localhost:5174 pour un autre serveur)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [W, H] = (process.argv[2] || '844x390').split('x').map(Number);
const embedded = process.argv[3] === 'emb';
const base = process.env.BASE || 'http://localhost:5173';
const tag = `${W}x${H}${embedded ? '-emb' : ''}`;
const out = (n) => `tests/e2e/out/req-${tag}-${n}.png`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(embedded ? `${base}/tests/e2e/viewer-harness.html?autostart` : `${base}/?autostart`);
const f = embedded ? await (await page.waitForSelector('iframe')).contentFrame() : page.mainFrame();
await f.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 240000 });
await f.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const cdp = await ctx.newCDPSession(page);
const wait = (ms) => page.waitForTimeout(ms);
const E = (fn, a) => f.evaluate(fn, a);
const render = () => E(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
let ok = true;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) ok = false;
};
// Toucher réel au centre d'un élément (après vérification qu'il est bien la cible).
async function tapSel(sel) {
  const r = await E((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    // Comme un joueur : on fait défiler jusqu'à l'élément s'il est hors champ, puis on touche sa partie visible.
    el.scrollIntoView({ block: 'nearest' });
    const b = el.getBoundingClientRect();
    let top = b.top, bottom = b.bottom;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(cs.overflowY)) {
        const q = p.getBoundingClientRect();
        top = Math.max(top, q.top);
        bottom = Math.min(bottom, q.bottom);
      }
    }
    const x = b.left + b.width / 2, y = (top + Math.max(top, bottom)) / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: !!hit && (hit === el || el.contains(hit)) };
  }, sel);
  if (!r) return { found: false };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  await wait(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(350);
  return { found: true, hit: r.hit };
}
// Boucle de jeu à pas fixe (sans rendu continu), écran figé pour les captures.
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  g.missions.offers = [];
  g.missions.refreshOffers(false);
  g.missions.pushNotif(g.missions.offers.find((o) => o.id === 'story:tuto'));
  // Les captures SwiftShader sont lentes : la notification ne doit pas se refermer seule pendant le test.
  clearTimeout(g.hud._notifT);
});
const tick = (n = 4) => E((k) => window.__auto.tick(k), n);
await wait(700);
await render();
await page.screenshot({ path: out('1-notif') });
check('notification « Répondre à la demande »', await E(() => [...document.querySelectorAll('.notif.show .n-actions button')].map((b) => b.textContent).join('|') === 'Plus tard|Répondre à la demande'));
let t = await tapSel('.notif.show .n-actions button.primary');
check('toucher Répondre à la demande', t.hit);
await tick();
await wait(500);
await page.screenshot({ path: out('2-request') });
check('écran Demande reçue ouvert', await E(() => window.__game.phone.app === 'request' && !!document.querySelector('.st-request')));
t = await tapSel('[data-id="accept-request"]');
check('1er toucher Accepter visible et touchable', t.hit);
await page.screenshot({ path: out('3-confirm') });
check('libellé de confirmation', await E(() => document.querySelector('[data-id="accept-request"]').textContent === 'Confirmer l’acceptation ?' && !document.querySelector('.confirm-hint').classList.contains('hidden')));
t = await tapSel('[data-id="accept-request"]');
check('2e toucher', t.hit);
await page.screenshot({ path: out('4-accepted') });
check('toast Demande acceptée', await E(() => document.querySelector('.app-toast .t')?.textContent === 'Demande acceptée'));
await wait(1600);
await tick(2);
check('mission démarrée, téléphone rangé', await E(() => window.__game.missions.active?.offer.id === 'story:tuto' && !window.__game.phone.isOpen));
// Refus d'une demande (après abandon de la mission pour libérer la place).
await E(() => {
  const g = window.__game;
  while (g.hud.dialogActive) g.hud.advanceDialog();
  g.missions.abandon();
  window.__auto.closeCards();
  // Tutoriel validé : les demandes suivantes (histoire + jobs) arrivent.
  if (!g.save.data.completed.includes('tuto')) g.save.data.completed.push('tuto');
  g.missions.offers = [];
  g.missions.refreshOffers(false);
  g.phone.open('strides', { tab: 'missions' });
});
await wait(500);
await page.screenshot({ path: out('5-home') });
check('accueil pro « Demandes entrantes »', await E(() => !!document.querySelector('.st-home .req-card')));
t = await tapSel('.req-card');
check('toucher une carte de demande', t.hit);
t = await tapSel('[data-id="refuse-request"]');
check('toucher Refuser', t.hit);
await wait(350);
await page.screenshot({ path: out('6-refuse-sheet') });
t = await tapSel('.sheet .tag-st');
check('pastille de motif', t.hit && (await E(() => !!document.querySelector('.sheet .tag-st.on'))));
const refusedId = await E(() => window.__game.phone.requestId);
t = await tapSel('[data-id="confirm-refuse"]');
check('Refuser la demande', t.hit);
await wait(300);
await page.screenshot({ path: out('7-refused') });
check('demande retirée + toast', await E((id) => !window.__game.missions.offers.some((o) => o.id === id) && document.querySelector('.app-toast .t')?.textContent === 'Demande refusée', refusedId));
// Contre-proposition.
await E(() => {
  const g = window.__game;
  g.missions.refreshOffers(false);
  // Contre-proposition possible seulement sur une demande chiffrée.
  g.phone.show('request', { id: g.missions.offers.find((o) => !o.locked && o.pay).id });
});
await wait(400);
t = await tapSel('[data-id="counter-request"]');
check('toucher contre-proposition', t.hit);
await wait(350);
await page.screenshot({ path: out('8-counter-sheet') });
t = await tapSel('.sheet .stepper button[aria-label="Plus"]');
check('toucher + (montant)', t.hit);
t = await tapSel('.sheet [data-id="send-counter"]');
check('envoyer la contre-proposition', t.hit);
await wait(300);
await page.screenshot({ path: out('9-negotiating') });
check('statut EN NÉGOCIATION', await E(() => document.querySelector('.req-head .badge-st')?.textContent === 'EN NÉGOCIATION'));
console.log(tag, ok ? 'PARCOURS OK' : 'ÉCHECS', errors.length ? `ERREURS: ${errors.join(' | ')}` : '');
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
