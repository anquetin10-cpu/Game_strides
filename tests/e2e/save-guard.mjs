// Protection des sauvegardes (lot A) : sauvegarde v1 migrée, sauvegarde illisible signalée sans écrasement,
// restauration de la copie de secours, export / import depuis Réglages. Usage : BASE=… node tests/e2e/save-guard.mjs [dossier captures]
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.argv[2] || 'tests/e2e/out';
const KEY = 'strides-grand-tour-v1';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 667, height: 308 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const v1 = { version: 1, started: true, playerName: 'Julie', avatar: 'f', money: 1200, xp: 950, completed: ['tuto', 'groom'], horses: ['comete'], activeHorse: 'comete', upgrades: ['fers'], horseshoes: [], bestTimes: {}, stats: { jobs: 7, earned: 900, distance: 0, jumps: 0, faults: 0 }, messages: [], settings: { sound: false, music: true, quality: 'auto', camSens: 1 }, gameTime: 9 * 3600, pos: null };
// 1) Sauvegarde v1 → migrée, copie de secours.
await page.goto(`${base}/`);
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
await page.waitForTimeout(800);
await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(v)); }, [KEY, v1]);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
let d = await page.evaluate(() => { const g = window.__game; return { rep: g.save.data.reputation, v: g.save.data.version, issue: g.save.loadIssue, backup: !!localStorage.getItem('strides-grand-tour-v1.backup.v1'), stored: JSON.parse(localStorage.getItem('strides-grand-tour-v1')).version, cont: !!document.querySelector('[data-id="continue"]') }; });
check('sauvegarde v1 migrée (réputation = xp)', d.rep === 950 && d.v === 2 && d.stored === 2, JSON.stringify(d));
check('copie de secours v1 conservée', d.backup);
check('bouton Continuer proposé', d.cont);
await page.tap('[data-id="continue"]');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
d = await page.evaluate(() => ({ money: window.__game.save.data.money, horses: window.__game.save.data.horses, up: window.__game.save.data.upgrades, label: document.querySelector('.level')?.textContent || document.querySelector('.top-bar')?.textContent }));
check('partie existante jouable, possessions conservées', d.money === 1200 && d.up.includes('fers'), JSON.stringify(d));
// 2) Sauvegarde illisible → signalée, rien n'est écrasé. La page en cours est figée d'abord (sinon sa propre
// sauvegarde à la fermeture réécrirait une partie valide : on simule une corruption survenue entre deux sessions).
await page.evaluate((k) => { window.__game.save.locked = true; localStorage.setItem(k, '{"version":2,"started":true,"money":'); }, KEY);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/save-guard-notice.png` });
d = await page.evaluate((k) => ({ issue: window.__game.save.loadIssue?.kind, raw: localStorage.getItem(k), notice: !!document.querySelector('.notice'), restore: !!document.querySelector('[data-id="restore-0"]'), cont: !!document.querySelector('[data-id="continue"]'), play: document.querySelector('[data-id="play"]')?.textContent }), KEY);
check('sauvegarde illisible signalée', d.issue === 'corrupt' && d.notice, JSON.stringify({ issue: d.issue, notice: d.notice }));
check('rien n’est écrasé', d.raw === '{"version":2,"started":true,"money":');
check('pas de « Continuer », « Nouvelle partie » explicite', !d.cont && /Nouvelle partie/.test(d.play || ''), d.play);
check('restauration de la copie de secours proposée', d.restore);
// 3) Restauration de la copie v1.
await page.tap('[data-id="restore-0"]');
await page.waitForFunction(() => window.__game && window.__game.state === 'title' && !window.__game.save.loadIssue, null, { timeout: 300000 });
d = await page.evaluate(() => ({ rep: window.__game.save.data.reputation, cont: !!document.querySelector('[data-id="continue"]') }));
check('copie restaurée et jouable', d.rep === 950 && d.cont, JSON.stringify(d));
// 4) Export / import depuis Réglages.
await page.tap('[data-id="continue"]');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
await page.evaluate(() => { window.__game.phone.open('settings'); });
await page.waitForTimeout(600);
await page.evaluate(() => { const b = document.querySelector('.app-body'); if (b) b.scrollTop = 9999; });
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/save-guard-settings.png` });
d = await page.evaluate(() => { const g = window.__game; const json = g.save.exportSave(); const area = document.querySelector('.save-area'); area.value = json.replace('"money":1200', '"money":777'); return { has: !!document.querySelector('[data-id="save-import"]'), len: json.length }; });
check('export disponible dans Réglages', d.has && d.len > 100);
await page.tap('[data-id="save-import"]');
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 300000 });
d = await page.evaluate(() => window.__game.save.data.money);
check('import appliqué après rechargement', d === 777, String(d));
console.log(errors.length ? `ERRORS ${errors.slice(0, 3).join(' | ')}` : 'ERRORS none');
console.log(fails ? `SAUVEGARDE ${fails} échec(s)` : 'SAUVEGARDE OK');
process.exitCode = fails || errors.length ? 1 : 0;
await b.close();
