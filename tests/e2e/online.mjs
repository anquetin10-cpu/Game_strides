// Jeu en ligne (iPhone paysage 667×308) avec une base claude.ai simulée (window.claude.use('db' | 'user') en mémoire,
// conservée dans le stockage local pour survivre aux rechargements) :
// - un vrai chrono (Sprint de la plage) entre au classement, rang annoncé, ligne du joueur écrite ;
// - l'app Classements liste les autres joueurs, met le joueur à son rang ;
// - la sauvegarde est copiée en ligne automatiquement, dans l'espace privé du joueur ;
// - une sauvegarde en ligne plus récente est proposée au lancement et reprise.
// Usage : BASE=… node tests/e2e/online.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };

// Base simulée (même contrat que claude.ai pour ce que le jeu utilise).
const FAKE = `(() => {
  const KEY = '__fakedb';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const store = load();
  const persist = () => localStorage.setItem(KEY, JSON.stringify(store));
  const subs = [];
  const snap = (path, data) => ({ id: path.split('/').pop(), exists: !!data, data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined), metadata: { fromCache: false, hasPendingWrites: false } });
  const inColl = (coll) => Object.keys(store).filter((p) => p.startsWith(coll + '/') && p.split('/').length === coll.split('/').length + 1).sort();
  const qsnap = (coll) => { const docs = inColl(coll).map((p) => snap(p, store[p])); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
  const notify = () => subs.forEach((s) => s.next(qsnap(s.coll)));
  window.__fakeWrites = [];
  const doc = (path) => ({ id: path.split('/').pop(), path,
    get: async () => snap(path, store[path]),
    set: async (d) => { store[path] = JSON.parse(JSON.stringify(d)); window.__fakeWrites.push(path); persist(); setTimeout(notify, 0); },
    update: async (d) => { if (!store[path]) throw { code: 'invalid_argument' }; Object.assign(store[path], d); persist(); setTimeout(notify, 0); },
    delete: async () => { delete store[path]; persist(); setTimeout(notify, 0); },
    onSnapshot: (next) => { next(snap(path, store[path])); return () => {}; } });
  const coll = (path) => { const q = { path, limit: () => q, where: () => q, orderBy: () => q, get: async () => qsnap(path), doc: (id) => doc(path + '/' + id),
    onSnapshot: (next) => { const s = { coll: path, next }; subs.push(s); setTimeout(() => next(qsnap(path)), 0); return () => subs.splice(subs.indexOf(s), 1); } }; return q; };
  const DB = Object.freeze({ doc, collection: coll });
  const USER = Object.freeze({ id: async () => 'u_me', can: async () => true, isOwner: async () => true, canEdit: async () => true, me: async () => ({ id: 'u_me', name: '' }) });
  window.claude = { use: async (n) => (n === 'db' ? DB : n === 'user' ? USER : null) };
})();`;

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 667, height: 308 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(FAKE);
const page = await ctx.newPage();
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Autres joueurs déjà classés.
await page.goto(`${base}/?autostart`);
await page.evaluate(() => {
  const sc = (pen, time, at) => ({ pen, time, score: pen * 100000 + time, horse: 'Ubris', at });
  localStorage.setItem('__fakedb', JSON.stringify({
    'scores/u_lea': { pseudo: 'Léa', boards: { beach_sprint: sc(0, 48.2, 1), 'defi-pole-v3': sc(0, 39.5, 1) }, updatedAt: 1 },
    'scores/u_max': { pseudo: 'Maxime', boards: { beach_sprint: sc(0, 75.0, 2) }, updatedAt: 2 },
    'scores/u_tom': { pseudo: 'Tom', boards: { beach_sprint: sc(0, 90.5, 3) }, updatedAt: 3 },
  }));
});
await page.reload();
await page.waitForFunction(() => window.__game && window.__game.state === 'play' && window.__game.online.state === 'online', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });

// Vrai chrono : Sprint de la plage, joué par le pilote automatique.
const sprint = await page.evaluate(async () => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); g.missions.abandon?.(); A.closeCards();
  const a = g.activities.list().find((x) => x.id === 'beach_sprint');
  if (g.player.mode !== 'ride') A.mount();
  g.player.horse.setPosition(a.start.x, a.start.z, 0);
  const toasts = [];
  const orig = g.hud.toast.bind(g.hud);
  g.hud.toast = (t, k) => { toasts.push(t); return orig(t, k); };
  let done = null;
  const off = g.bus.on('mission:complete', ({ result }) => (done = result));
  g.activities.start(a);
  const run = g.missions.active;
  for (let i = 0; i < 4000 && !done && g.missions.active === run; i++) {
    A.solveStep(run);
    A.tick(2);
  }
  off();
  A.closeCards();
  await new Promise((r) => setTimeout(r, 300));
  const mine = JSON.parse(localStorage.getItem('__fakedb'))['scores/u_me'];
  return { done: !!done, time: done?.time, toasts, mine, best: g.save.data.bestTimes.beach_sprint };
});
check('sprint de la plage terminé', sprint.done, `${sprint.time?.toFixed?.(1)} s`);
// Le pilote automatique se téléporte d'anneau en anneau : chrono impossible, refusé par le classement.
check('chrono impossible (pilote automatique téléporté) refusé par le classement', sprint.time < 38 && !sprint.mine, `${sprint.time?.toFixed?.(1)} s`);

// Un vrai chrono (52,3 s) : inscrit, rang annoncé.
const real = await page.evaluate(async () => {
  const g = window.__game;
  const toasts = [];
  const orig = g.hud.toast.bind(g.hud);
  g.hud.toast = (t, k) => { toasts.push(t); return orig(t, k); };
  g.reportScore('beach_sprint', { pen: 0, time: 52.3, horse: g.mainHorse.name });
  await new Promise((r) => setTimeout(r, 400));
  return { toasts, mine: JSON.parse(localStorage.getItem('__fakedb'))['scores/u_me'] };
});
check('ligne de classement écrite (pseudonyme, chrono, cheval)', !!real.mine && real.mine.boards?.beach_sprint?.time === 52.3 && !!real.mine.pseudo && !!real.mine.boards.beach_sprint.horse, JSON.stringify(real.mine?.boards?.beach_sprint || null));
check('rang annoncé au joueur : 2e sur 4', real.toasts.some((t) => /Classement en ligne · Sprint de la plage : 2e sur 4/.test(t)), real.toasts.join(' | '));

// Un moins bon chrono n'écrase pas le record.
const worse = await page.evaluate(async () => {
  const g = window.__game;
  const before = JSON.parse(localStorage.getItem('__fakedb'))['scores/u_me'].boards.beach_sprint.time;
  window.__fakeWrites.length = 0;
  await g.online.submit('beach_sprint', { pen: 0, time: before + 30 });
  return { before, writes: window.__fakeWrites.filter((p) => p.startsWith('scores/')).length, after: JSON.parse(localStorage.getItem('__fakedb'))['scores/u_me'].boards.beach_sprint.time };
});
check('un chrono moins bon ne remplace pas le record', worse.writes === 0 && worse.after === worse.before, JSON.stringify(worse));

// App Classements.
await page.evaluate(() => { window.__auto.startLoop(); window.__game.phone.open('ranking'); window.__game.phone.show('ranking', { board: 'beach_sprint' }); });
await page.waitForTimeout(800);
await page.evaluate(() => { document.querySelectorAll('.overlay').forEach((o) => o.remove()); window.__game.hud.notifEl?.classList.remove('show'); if (!window.__game.phone.isOpen) window.__game.phone.open('ranking'); window.__game.phone.show('ranking', { board: 'beach_sprint' }); });
await page.waitForTimeout(300);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tests/e2e/out/online-ranking.png' });
const app = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('.rank-row')].map((r) => r.textContent),
  me: document.querySelector('.rank-row.me')?.textContent || '',
  head: document.querySelector('.app-head .sub')?.textContent || '',
}));
check('app Classements : 4 joueurs classés, en ligne', app.rows.length === 4 && /En ligne/.test(app.head), app.rows.join(' / '));
check('app Classements : le joueur à son rang (toi)', /\(toi\)/.test(app.me), app.me);
check('app Classements : ordre des chronos (Léa 48,2 s devant)', app.rows[0].includes('Léa') && app.rows[1].includes('(toi)'), app.rows.slice(0, 2).join(' / '));

// Sauvegarde en ligne automatique.
const cloud = await page.evaluate(async () => {
  const g = window.__game;
  g.phone.close();
  g.save.data.money += 1;
  g.saveNow();
  g.online.scheduleSave(true);
  await new Promise((r) => setTimeout(r, 600));
  const db = JSON.parse(localStorage.getItem('__fakedb'));
  const s = db['data/users/u_me/save'];
  const parsed = s ? JSON.parse(s.json) : null;
  return { exists: !!s, money: parsed?.money, local: g.save.data.money, savedAt: s?.savedAt };
});
check('sauvegarde copiée en ligne automatiquement (espace privé du joueur)', cloud.exists && cloud.money === cloud.local, JSON.stringify(cloud));

// Une sauvegarde en ligne plus récente (autre appareil) est proposée au lancement et reprise.
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('__fakedb'));
  const s = db['data/users/u_me/save'];
  const data = JSON.parse(s.json);
  data.money = 777777;
  data.meta.savedAt = Date.now() + 3600e3;
  db['data/users/u_me/save'] = { ...s, json: JSON.stringify(data), savedAt: data.meta.savedAt };
  localStorage.setItem('__fakedb', JSON.stringify(db));
});
await page.goto(`${base}/`);
await page.waitForFunction(() => !!document.querySelector('[data-id="cloud-adopt"]'), null, { timeout: 300000 });
await page.screenshot({ path: 'tests/e2e/out/online-cloud-prompt.png' });
await page.click('[data-id="cloud-adopt"]');
await page.waitForFunction(() => window.__game && window.__game.save && window.__game.save.data.money === 777777, null, { timeout: 300000 }).catch(() => {});
const adopted = await page.evaluate(() => ({ money: window.__game.save.data.money, backup: !!localStorage.getItem(`${window.__game.save.key}.backup.local`) }));
check('sauvegarde en ligne plus récente reprise (copie de secours de l’appareil gardée)', adopted.money === 777777 && adopted.backup, JSON.stringify(adopted));

// Sans claude.ai : tout reste local, sans erreur.
const ctx2 = await b.newContext({ viewport: { width: 667, height: 308 } });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push(e.message));
await p2.goto(`${base}/?autostart`);
await p2.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
const off = await p2.evaluate(async () => {
  const g = window.__game;
  const r = await g.online.submit('beach_sprint', { pen: 0, time: 50 });
  g.phone.open('ranking');
  return { state: g.online.state, r, note: document.querySelector('.rank-note')?.textContent || '' };
});
check('hors claude.ai : mode local, records de l’appareil, explication', off.state === 'local' && off.r.rank === null && /claude\.ai/.test(off.note), off.note.slice(0, 80));
check('aucune erreur', !errors.length, errors.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? `ÉCHECS : ${fails}` : 'EN LIGNE OK');
process.exit(fails ? 1 : 0);
