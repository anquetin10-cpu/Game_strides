// Banc de parité CSO, tranche T11 : bilan d'une manche (carte de résultat, classement simulé, boutons), exporté du jeu
// web EN COURS D'EXÉCUTION. Le jeu web est la spécification ; ce script ne modifie rien dans src/ ni tests/.
//
// Dans la page : étapes de l'activité « Parcours du Pôle » construites par le jeu lui-même
// (g.activities.defs cso_train, build(game, run, makeSteps(game)) : courseSteps avec les vraies options, dont
// opts.result), état de la manche posé dans run.data.course (l'objet `state` que lit l'étape de bilan), étape de bilan
// démarrée (courses.js:375-424 : screens.card) puis carte relevée dans le DOM (kicker, titre, grille .cso-pres, tableau
// .cso-rank, boutons). Pour une partie des cas, chaque bouton est touché sur une carte neuve : Recommencer (r.flags.res,
// update : étapes insérées, état neuf), Quitter l'épreuve (resultCustom, fermeture), S'entraîner (r.data.afterTrain,
// entraînement demandé par setTimeout(…, 300) : délai relevé, startTraining relevé sans être exécuté).
//
// Sortie : unreal/core/tests/oracles/cso_result.json (rejoué par testCsoResult de unreal/core/tests/test_core.cpp).
// --screens : unreal/StridesGrandTour/Content/Data/cso_result_style.json, relevé de base de la carte de bilan par langue
// (fr, en) à 844 × 390 et 667 × 308 : styles calculés, boîtes (px CSS) et largeur de chaque texte (voile, carte, corps
// défilable, kicker, titre, grille .cso-pres, tableau .cso-rank : lignes et cellules, barre d'actions, boutons), pour
// l'état de la manche du bilan de l'exécution t9-parcours de l'oracle cso_runs/ (chrono, journal des fautes : ceux de la
// partie rejouée par les captures bilan-*) ; et unreal/core/tests/oracles/cso_result_layout.json, mise en page de la
// carte pour chaque état de CASES dans les mêmes vues (contrôle adverse de T11 : testCsoResultLayout,
// Strides.Cso.ResultLayout).
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5173 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-result.mjs [--screens]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const ORA = join(ROOT, 'unreal/core/tests/oracles');
const AUTOPILOT = readFileSync(join(ROOT, 'tests/e2e/autopilot.js'), 'utf8');
const SCREENS = process.argv.includes('--screens');
const DATA = join(ROOT, 'unreal/StridesGrandTour/Content/Data');
const VIEWS = [{ width: 844, height: 390 }, { width: 667, height: 308 }];
// État de la manche au bilan d'une exécution de l'oracle (dernier état relevé de run.course, journal complet ep.lg).
function bilanState(file) {
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const k = r.frames.findIndex((f) => f.bl);
  if (k < 0) throw new Error(`${file} : bilan absent (canal bl)`);
  const c = r.frames[k].run.course;
  let lg = [];
  for (const f of r.frames.slice(0, k + 1)) if (f.ep?.lg) lg = f.ep.lg;
  return { id: `${r.id}.${r.lang}`, frame: k, t: c.t, faults: c.faults, timeFaults: c.timeFaults, attempt: c.attempt, eliminated: c.eliminated, logFull: lg, bl: r.frames[k].bl };
}

// États de la manche (run.data.course) : t = somme de pas de 1/30 s (chrono réel du jeu) ; log = journal des fautes
// [label, kind, cause] (texte de la cause : CAUSES de jumpModel.js, traduit au chargement de la page) ; eliminated = motif (texte
// libre) ; horse null : aucun cheval (t('Cheval')).
const steps = (n) => { let t = 0; for (let i = 0; i < n; i++) t += 1 / 30; return t; };
const CASES = [
  { id: 'vainqueur', t: steps(1500), faults: 0, timeFaults: 0, log: [], attempt: 1, buttons: true },
  { id: 'sans-faute-2e', t: steps(1725), faults: 0, timeFaults: 0, log: [['1', 'clear'], ['2', 'clear']], attempt: 1 },
  { id: 'sans-faute-tard', t: steps(1919), faults: 0, timeFaults: 0, log: [], attempt: 1 },
  { id: 'barres', t: steps(1845), faults: 8, timeFaults: 0, log: [['1', 'clear'], ['2', 'rail', 'far'], ['6B', 'rail', null]], attempt: 1, buttons: true },
  { id: 'refus-barre-temps', t: steps(1986), faults: 8, timeFaults: 3, log: [['4B', 'refusal'], ['5', 'rail', 'hindRail']], attempt: 1 },
  { id: 'refus', t: steps(1700), faults: 4, timeFaults: 0, log: [['3', 'refusal']], attempt: 1 },
  { id: 'un-point', t: steps(1937), faults: 0, timeFaults: 1, log: [], attempt: 1 },
  { id: 'elimine', t: steps(429), faults: 8, timeFaults: 0, log: [['4B', 'refusal'], ['4B', 'refusal']], attempt: 1, eliminated: '2e refus : éliminé du parcours.', buttons: true },
  { id: 'elimine-descente', t: 0, faults: 0, timeFaults: 0, log: [], attempt: 1, eliminated: 'Tu es descendu de cheval : éliminé.' },
  { id: 'manche-2', t: steps(1740), faults: 4, timeFaults: 0, log: [['1', 'rail', 'near']], attempt: 2 },
  { id: 'manche-3', t: steps(1800), faults: 0, timeFaults: 0, log: [], attempt: 3 },
  { id: 'manche-10', t: steps(1650), faults: 12, timeFaults: 0, log: [['2', 'rail', 'tooClose'], ['5', 'rail', 'angle'], ['7', 'refusal']], attempt: 10 },
  { id: 'sans-cheval', t: steps(1750), faults: 0, timeFaults: 0, log: [], attempt: 1, horse: null },
  // Contrôle adverse de T11 : joueur exactement 9e (4 pts en 60,00 s : derrière les 4 pts en 59,53 s, devant ceux en
  // 60,43 s de la manche 1) ; vainqueur avec des fautes (« Victoire ! » : manche 268, aucun engagé sans faute, le
  // meilleur à 4 pts en 61,49 s).
  { id: 'neuvieme', t: steps(1800), faults: 4, timeFaults: 0, log: [['5', 'rail', 'far']], attempt: 1 },
  { id: 'victoire-fautes', t: steps(1800), faults: 4, timeFaults: 0, log: [['3', 'refusal']], attempt: 268 },
];

function PAGE() {
  const g = window.__game, A = window.__auto;
  A.stopLoop();
  const st = document.createElement('style');
  st.textContent = '.overlay, .overlay *, .dialog, .dialog * { animation: none !important; transition: none !important; }';
  document.head.appendChild(st);
  const R = (window.__result = {});
  let M = null;
  R.load = async () => {
    M = { S: await import('/src/gameplay/missions.js'), I: await import('/src/core/i18n.js'), J: await import('/src/gameplay/jumpModel.js') };
    return M.I.LANG;
  };
  const overlay = () => [...document.querySelectorAll('.overlay')].pop() || null;
  const clear = () => {
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    for (const o of document.querySelectorAll('.overlay')) o.remove();
  };
  const dom = (ov) => {
    const q = (s) => ov.querySelector(s);
    const vs = [...ov.querySelectorAll('.cso-pres .v')];
    return {
      kicker: q('.kicker')?.textContent ?? null, title: q('h2')?.textContent ?? null,
      rows: [...ov.querySelectorAll('.cso-pres .k')].map((k, i) => [k.textContent, vs[i]?.textContent ?? null]),
      table: [...ov.querySelectorAll('table.cso-rank tr')].map((tr) => ({ me: tr.classList.contains('me'), td: [...tr.children].map((td) => td.textContent) })),
      buttons: [...ov.querySelectorAll('.card-actions button')].map((b) => [b.dataset.id, b.textContent, b.className]),
    };
  };
  // Étapes de l'activité construites par le jeu ; état posé ; bilan démarré (r = run de mission minimal).
  const open = (c) => {
    clear();
    const a = g.activities.defs.find((x) => x.id === 'cso_train');
    const run = { data: {}, flags: {} };
    const list = a.build(g, run, M.S.makeSteps(g));
    const i = list.findIndex((s) => s.start && String(s.start).includes('simulateField'));
    if (i < 0) throw new Error('étape de bilan introuvable');
    const causeText = (id) => (id ? M.J.CAUSES[id] : undefined);  // CAUSES : textes déjà traduits au chargement (t)
    Object.assign(run.data.course, {
      t: c.t, faults: c.faults, timeFaults: c.timeFaults, attempt: c.attempt, eliminated: c.eliminated ?? null, finished: !c.eliminated, started: c.t > 0,
      log: c.log.map(([label, kind, cause]) => (kind === 'rail' ? { label, kind, cause: cause ?? undefined, causeText: causeText(cause) } : { label, kind })),
    });
    const r = { data: run.data, flags: {}, steps: list.slice(), i };
    list[i].start(r);
    return { list, i, r, run, ov: overlay() };
  };
  // Styles de la carte de bilan (--screens).
  const PROPS = ['display', 'opacity', 'color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginLeft', 'marginRight', 'marginBottom', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
    'borderBottomWidth', 'borderBottomColor', 'borderLeftWidth', 'borderLeftColor', 'borderRightWidth', 'maxWidth', 'minWidth', 'width', 'height', 'gap', 'rowGap', 'columnGap', 'alignItems', 'textAlign',
    'whiteSpace', 'textShadow', 'boxShadow', 'transform', 'backdropFilter', 'backgroundImage', 'gridTemplateColumns', 'overflowY', 'justifyContent', 'fontStyle', 'maxHeight', 'verticalAlign', 'borderCollapse'];
  const r1 = (v) => Math.round(v * 10) / 10;
  const css = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = { rect: [r.x, r.y, r.width, r.height].map(r1) };
    for (const p of PROPS) o[p] = typeof s[p] === 'string' ? s[p].replace(/(-?\d+\.\d+)px/g, (_, n) => `${r1(Number(n))}px`) : s[p];
    return o;
  };
  // Largeur du texte (Range sur le contenu, sans padding), au centième de px : étalonnage de la police du moteur.
  const textW = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return Math.round(rg.getBoundingClientRect().width * 100) / 100; };
  const withText = (el) => (el ? { ...css(el), text: el.textContent, tw: textW(el) } : null);
  R.style = async (c) => {
    await document.fonts.ready;
    const realPlayer = g.player;
    try {
      const o = open(c);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ov = o.ov, q = (s) => ov.querySelector(s);
      const body = q('.card-body');
      return {
        dom: dom(ov),
        overlay: css(ov), card: css(q('.card')), body: { ...css(body), scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop },
        kicker: withText(q('.kicker')), title: withText(q('h2')),
        grid: css(q('.cso-pres')), keys: [...ov.querySelectorAll('.cso-pres .k')].map(withText), values: [...ov.querySelectorAll('.cso-pres .v')].map(withText),
        table: css(q('table.cso-rank')),
        rows: [...ov.querySelectorAll('table.cso-rank tr')].map((tr) => ({ ...css(tr), me: tr.classList.contains('me'), cells: [...tr.children].map(withText) })),
        actions: { ...css(q('.card-actions')), more: q('.card-actions').classList.contains('more') },
        buttons: [...q('.card-actions').querySelectorAll('button')].map((b) => ({ id: b.dataset.id, cls: b.className, ...withText(b) })),
      };
    } finally {
      g.player = realPlayer;
      clear();
    }
  };
  // Mise en page d'un état (--screens, contrôle adverse de T11) : boîtes du corps défilable, du kicker, du titre, des
  // cases de la grille, du tableau, de chaque ligne et de ses cellules (corps en haut) ; classe more de la barre
  // d'actions en haut puis le corps défilé jusqu'en bas (scrollTop maximal, événement scroll du navigateur).
  R.layout = async (c) => {
    await document.fonts.ready;
    const realPlayer = g.player;
    try {
      if (c.horse === null) g.player = { horse: null };
      const o = open(c);
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await frame();
      const ov = o.ov, q = (s) => ov.querySelector(s);
      const body = q('.card-body'), bar = q('.card-actions');
      const rect = (el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(r1); };
      const out = {
        dom: dom(ov),
        body: { rect: rect(body), scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop },
        kicker: rect(q('.kicker')), title: rect(q('h2')),
        keys: [...ov.querySelectorAll('.cso-pres .k')].map(rect), values: [...ov.querySelectorAll('.cso-pres .v')].map(rect),
        table: rect(q('table.cso-rank')),
        rows: [...ov.querySelectorAll('table.cso-rank tr')].map((tr) => ({ rect: rect(tr), me: tr.classList.contains('me'), cells: [...tr.children].map(rect), tw: [...tr.children].map(textW) })),
        more: bar.classList.contains('more'),
      };
      body.scrollTop = body.scrollHeight;
      await frame();
      out.bottom = { scrollTop: body.scrollTop, more: bar.classList.contains('more') };
      return out;
    } finally {
      g.player = realPlayer;
      clear();
    }
  };
  R.run = (c) => {
    const realPlayer = g.player;
    const out = { id: c.id };
    try {
      if (c.horse === null) g.player = { horse: null };
      out.playerName = g.save.data.playerName;
      out.horseName = g.player.horse ? g.player.horse.name : null;
      const o = open(c);
      out.state = { ...o.run.data.course, wrong: undefined };
      out.log = o.run.data.course.log.map((l) => [l.label, l.kind, l.cause ?? null, l.causeText ?? null]);
      out.dom = dom(o.ov);
      out.waiting = o.list[o.i].update(o.r) === false;  // sans choix, l'étape attend
      if (c.buttons) {
        // Recommencer : manche n + 1 (état neuf, étapes insérées après le bilan).
        let x = open(c);
        A.tap(x.ov.querySelector('[data-id="cso-retry"]'));
        const n0 = x.r.steps.length;
        const res = x.list[x.i].update(x.r);
        const s1 = x.run.data.course;
        out.retry = { closed: !document.body.contains(x.ov), flag: x.r.flags.res ?? null, next: res === true, inserted: x.r.steps.slice(x.i + 1, x.i + 1 + x.r.steps.length - n0).map((s) => (typeof s.text === 'function' ? null : s.text ?? null)),
          state: { attempt: s1.attempt, t: s1.t, faults: s1.faults, timeFaults: s1.timeFaults, eliminated: s1.eliminated, started: s1.started, finished: s1.finished, next: s1.next, bell: s1.bell, log: s1.log.length } };
        // Quitter l'épreuve : le bilan tient lieu d'écran de résultat (resultCustom : fermeture, aucun entraînement).
        x = open(c);
        A.tap(x.ov.querySelector('[data-id="cso-done"]'));
        let closed = 0;
        const done = x.list[x.i].update(x.r);
        x.r.resultCustom?.(() => closed++);
        out.done = { closed: !document.body.contains(x.ov), flag: x.r.flags.res ?? null, next: done === true, custom: typeof x.r.resultCustom === 'function', close: closed, afterTrain: !!x.r.data.afterTrain };
        // S'entraîner : même fin, puis entraînement demandé 300 ms plus tard (setTimeout relevé, startTraining relevé).
        x = open(c);
        A.tap(x.ov.querySelector('[data-id="cso-train"]'));
        closed = 0;
        const tr = x.list[x.i].update(x.r);
        const timers = [];
        const realTimeout = window.setTimeout, realTrain = g.activities.startTraining;
        let trained = 0;
        try {
          window.setTimeout = (fn, ms) => timers.push({ fn, ms });
          g.activities.startTraining = () => trained++;
          x.r.resultCustom?.(() => closed++);
          for (const tm of timers) tm.fn();
        } finally {
          window.setTimeout = realTimeout;
          g.activities.startTraining = realTrain;
        }
        out.train = { closed: !document.body.contains(x.ov), flag: x.r.flags.res ?? null, next: tr === true, close: closed, afterTrain: !!x.r.data.afterTrain, timers: timers.map((tm) => tm.ms), startTraining: trained };
      }
    } finally {
      g.player = realPlayer;
      clear();
    }
    return out;
  };
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const langs = {};
const writeIfChanged = (f, d) => {
  const tx = JSON.stringify(d, null, 1) + '\n';
  if (existsSync(f) && readFileSync(f, 'utf8') === tx) console.log('inchangé :', f);
  else { writeFileSync(f, tx); console.log('écrit :', f); }
};
if (SCREENS) {
  // Relevé de base, par langue (les libellés de la grille et du tableau fixent la largeur des colonnes) : bilan de
  // t9-parcours (fr, en), état relevé dans l'oracle ; journal [label, kind, cause] (texte de la cause : CAUSES).
  const doc = {
    schema: 'strides.cso_result_style/2', generator: 'scripts/unreal/export-cso-result.mjs --screens', source: ['src/ui/screens.js', 'src/gameplay/courses.js', 'src/styles.css'],
    doc: 'carte de bilan (courses.js:414) ouverte par l’étape de bilan du jeu sur l’état de la manche du bilan de t9-parcours (chrono, fautes, journal de l’image du canal bl de l’oracle cso_runs, run et frame de chaque vue) : par langue et par viewport, styles calculés (getComputedStyle) et boîtes (rect = [x, y, largeur, hauteur], px CSS du viewport) du voile (overlay), de la carte, du corps défilable (scrollHeight), du kicker, du titre, de la grille (.cso-pres, clés .k, valeurs .v), du tableau (.cso-rank) et de chaque ligne (classe me, cellules et leurs textes), de la barre d’actions (classe more) et des boutons ; text et tw = texte et largeur de ce texte (Range, sans padding, au centième de px) de chaque élément textuel ; dom = textes de la carte (identiques au canal bl de l’oracle, contrôlé à l’export) ; animations et transitions coupées. Le jeu en tire la mise en page de tout bilan par le flux CSS (strides::csoResultFlow, contrôlé sur unreal/core/tests/oracles/cso_result_layout.json)',
    views: [],
  };
  // Mise en page de chaque état posé (CASES), par langue et par viewport : oracle du flux de la carte.
  const lay = {
    schema: 'strides.oracle.cso_result_layout/1', generator: 'scripts/unreal/export-cso-result.mjs --screens', source: ['src/ui/screens.js', 'src/gameplay/courses.js', 'src/styles.css'],
    doc: 'carte de bilan ouverte par l’étape de bilan du jeu (comme cso_result.json) sur chaque état posé, à 844 × 390 et 667 × 308 : boîtes (rect = [x, y, largeur, hauteur], px CSS du viewport, au dixième) du corps défilable (scrollHeight, clientHeight), du kicker, du titre, des clés et valeurs de la grille, du tableau, de chaque ligne (classe me) et de ses cellules, corps en haut ; tw = largeur du texte de chaque cellule (Range sur son contenu, sans padding, au centième de px) ; more = classe more de la barre d’actions (screens.js:151 : scrollHeight − scrollTop − clientHeight > 4) en haut, bottom = corps défilé jusqu’en bas (scrollTop maximal, more) ; dom = textes de la carte (identiques à cso_result.json, contrôlé à l’export)',
    fr: [], en: [],
  };
  for (const lang of ['fr', 'en']) {
    const B = bilanState(join(ORA, `cso_runs/t9-parcours.${lang}.json`));
    const c = { id: B.id, t: B.t, faults: B.faults, timeFaults: B.timeFaults, attempt: B.attempt, eliminated: B.eliminated ?? undefined, log: B.logFull.map((e) => [e[0], e[1], e[2]]) };
    const ctx = await browser.newContext({ viewport: VIEWS[0], deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`screens ${lang}: ${e.message}`));
    await page.goto(`${BASE}/?autostart&quality=high&lang=${lang}`, { timeout: 180000 });
    await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
    await page.addScriptTag({ content: AUTOPILOT });
    await page.addScriptTag({ content: `(${PAGE.toString()})();` });
    const got = await page.evaluate(() => window.__result.load());
    if (got !== lang) throw new Error(`langue de la page ${got} au lieu de ${lang}`);
    for (const v of VIEWS) {
      await page.setViewportSize(v);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const st = await page.evaluate((x) => window.__result.style(x), c);
      if (JSON.stringify(st.dom) !== JSON.stringify(B.bl)) throw new Error(`carte de bilan différente du canal bl de ${B.id} : ${JSON.stringify(st.dom).slice(0, 300)}`);
      delete st.dom;
      doc.views.push({ lang, viewport: [v.width, v.height], run: B.id, frame: B.frame, result: st });
      console.log(`styles ${lang} ${v.width}x${v.height} : carte ${JSON.stringify(st.card.rect)}, ${st.rows.length} lignes, corps ${st.body.scrollHeight} px`);
      for (const cs of CASES) {
        const L = await page.evaluate((x) => window.__result.layout(x), cs);
        lay[lang].push({ id: cs.id, viewport: [v.width, v.height], ...L });
        const tall = L.values.map((r, i) => (r[3] > L.values[0][3] ? i : -1)).filter((i) => i >= 0);
        console.log(`  ${cs.id} : ${L.rows.length} lignes, corps ${L.body.scrollHeight} px, valeurs sur plusieurs lignes ${JSON.stringify(tall)}, more ${L.more} / bas ${L.bottom.more}`);
      }
    }
    await ctx.close();
  }
  writeIfChanged(join(DATA, 'cso_result_style.json'), doc);
  writeIfChanged(join(ORA, 'cso_result_layout.json'), lay);
}
for (const lang of ['fr', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await page.goto(`${BASE}/?autostart&quality=high&lang=${lang}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
  await page.addScriptTag({ content: AUTOPILOT });
  await page.addScriptTag({ content: `(${PAGE.toString()})();` });
  const got = await page.evaluate(() => window.__result.load());
  if (got !== lang) throw new Error(`langue de la page ${got} au lieu de ${lang}`);
  const cards = [];
  for (const c of CASES) cards.push(await page.evaluate((x) => window.__result.run(x), c));
  for (const c of cards) console.log(`${lang} ${c.id} : ${c.dom.kicker} | ${c.dom.title} | ${c.dom.rows.map((r) => r[1]).join(' | ')} | ${c.dom.table.length} lignes`);
  langs[lang] = cards;
  await ctx.close();
}
await browser.close();
if (errors.length) throw new Error(`erreurs de page : ${errors.slice(0, 3).join(' | ')}`);
const doc = {
  schema: 'strides.oracle.cso_result/1', generator: 'scripts/unreal/export-cso-result.mjs',
  source: ['src/gameplay/courses.js', 'src/gameplay/ranking.js', 'src/gameplay/activities.js', 'src/ui/screens.js'],
  doc: 'étape de bilan de l’activité cso_train construite par le jeu (build de g.activities.defs) : état posé dans run.data.course (t, faults, timeFaults, attempt, eliminated = motif ou null, log = [label, kind, cause, causeText]), bilan démarré ; playerName / horseName = joueur et cheval lus par l’étape (horseName null : aucun cheval) ; dom = carte relevée (kicker, title, rows = grille [clé, valeur], table = lignes { me, td }, buttons = [data-id, texte, classe]) ; waiting = update() sans choix ne valide pas l’étape ; retry / done / train (cas buttons) = bouton touché sur une carte neuve : closed = carte fermée, flag = r.flags.res, next = update() valide l’étape, inserted = textes des étapes insérées (null : texte calculé), state = état neuf ; custom = resultCustom posé, close = fermetures appelées ; afterTrain = r.data.afterTrain ; timers = délais des setTimeout de resultCustom (ms), startTraining = appels (relevés, non exécutés)',
  fr: langs.fr, en: langs.en,
};
const file = join(ORA, 'cso_result.json');
const text = JSON.stringify(doc, null, 1) + '\n';
if (existsSync(file) && readFileSync(file, 'utf8') === text) console.log('inchangé :', file);
else { writeFileSync(file, text); console.log('écrit :', file); }
