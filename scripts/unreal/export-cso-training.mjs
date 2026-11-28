// Oracle de l'entraînement à l'abord (jalon J2c, lot J2-D) : activité cso_warmup du jeu web (src/gameplay/activities.js
// startTraining, trainingSteps ; missions.js start, goto, Run.next, complete) exécutée dans le jeu réel, en lecture
// seule. Le script monte le joueur, lance l'entraînement comme le bouton « S'entraîner » du bilan
// (game.activities.startTraining), relève l'objectif (Run.text) loin du paddock, à pied, puis dans le paddock, et
// transmet aux écouteurs de l'entraînement des événements d'obstacle (bus obstacle:clear / fault / refusal) sur le
// vertical et l'oxer du paddock et sur un obstacle du parcours (ignoré). Chaque pas relève les appels de l'interface
// (hud.big / toast / hint / clearHint / setObjective), le son notify, l'objectif, game.course (mode de concours) et
// l'action « Terminer » ; « Terminer » touché, il relève la carte de fin de mission (screens.missionResult).
// Écrit unreal/core/tests/oracles/cso_training.json, lu par le ctest « training » (unreal/core/tests/test_core.cpp).
// Usage : BASE=http://127.0.0.1:5178 node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-training.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = join(ROOT, 'unreal/core/tests/oracles/cso_training.json');

// Pas joués dans la page : p = point où le cheval (monté) est posé, foot = pied à terre, ev = événement d'obstacle
// (course : warmup ou cso, rang dans ofCourse ; margin ; cause : clé de jumpModel.js CAUSES, traduite comme
// Obstacles._judge le fait), end = action « Terminer ». Chaque pas est suivi de `ticks` images de 1/30 s.
const STEPS = [
  { id: 'lance-loin', p: [330, -224], ticks: 2 },
  { id: 'a-pied-pres', p: [262, -232], foot: true, ticks: 2 },
  { id: 'approche', p: [300, -232], ticks: 2 },
  { id: 'approche-50', p: [290, -232], ticks: 1 },
  { id: 'approche-47', p: [287, -232], ticks: 1 },
  { id: 'bord-19', p: [259, -232], ticks: 1 },
  { id: 'paddock', p: [252, -232], ticks: 3 },
  { id: 'clear-juste', ev: { kind: 'clear', course: 'warmup', i: 0, margin: 0.085 }, ticks: 1 },
  { id: 'clear-large', ev: { kind: 'clear', course: 'warmup', i: 1, margin: 0.31 }, ticks: 1 },
  { id: 'clear-arrondi', ev: { kind: 'clear', course: 'warmup', i: 0, margin: 0.115 }, ticks: 1 },
  { id: 'faute-cause', ev: { kind: 'fault', course: 'warmup', i: 1, cause: 'far' }, ticks: 1 },
  { id: 'faute-sans-cause', ev: { kind: 'fault', course: 'warmup', i: 0, cause: null }, ticks: 1 },
  { id: 'refus', ev: { kind: 'refusal', course: 'warmup', i: 1 }, ticks: 1 },
  { id: 'parcours-ignore', ev: { kind: 'clear', course: 'cso', i: 0, margin: 0.2 }, ticks: 1 },
  { id: 'clear-zero', ev: { kind: 'clear', course: 'warmup', i: 1, margin: 0.004 }, ticks: 1 },
  { id: 'terminer', end: true, ticks: 2 },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = { schema: 'strides.oracle.cso_training/1', generator: 'scripts/unreal/export-cso-training.mjs', source: ['src/gameplay/activities.js (startTraining, trainingSteps, cso_warmup)', 'src/gameplay/missions.js (start, goto, Run.next, complete)', 'src/gameplay/obstacles.js (CAUSES via _judge)'], steps: STEPS, langs: {} };
for (const lang of ['fr', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?autostart&quality=low&lang=${lang}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
  const rec = await page.evaluate(async (steps) => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    const { CAUSES } = await import('/src/gameplay/jumpModel.js');
    const calls = [];
    for (const fn of ['big', 'toast', 'hint', 'clearHint', 'setObjective']) {
      const o = g.hud[fn].bind(g.hud);
      g.hud[fn] = (...a) => {
        calls.push([`hud.${fn}`, ...a.filter((x) => typeof x !== 'function').map((x) => (x === undefined ? null : x))]);
        return o(...a);
      };
    }
    const notify = g.audio.notify.bind(g.audio);
    g.audio.notify = (...a) => {
      calls.push(['audio.notify']);
      return notify(...a);
    };
    let result = null;
    const mr = g.screens.missionResult.bind(g.screens);
    g.screens.missionResult = (r, close) => {
      result = { title: r.title, kicker: r.kicker, body: r.body, pay: r.pay, xp: r.xp, stars: r.stars, timeLabel: r.timeLabel ?? null };
      calls.push(['screens.missionResult']);
      return mr(r, close);
    };
    const p = g.player;
    if (p.mode === 'drive') p.exitTruck();
    const h = p.horse;
    const place = (x, z) => {
      h.pos.x = x;
      h.pos.z = z;
      h.speed = 0;
      if (p.mode !== 'ride') p.human.setPosition(x + 1, z + 1);
    };
    place(330, -224);
    if (p.mode !== 'ride') {
      p.human.setPosition(h.pos.x + 1, h.pos.z + 1);
      p.mount();
    }
    for (let i = 0; i < 5; i++) g.update(1 / 30);
    if (p.mode !== 'ride') throw new Error('montée impossible');
    if (g.missions.active) throw new Error('mission déjà active');
    calls.length = 0;
    g.activities.startTraining();
    const run = g.missions.active;
    if (!run || run.def.id === undefined) throw new Error('entraînement non lancé');
    const snap = (id) => {
      const it = g.interact.list.get('train:end');
      g.interact.update();
      return {
        id,
        calls: calls.splice(0),
        text: g.missions.active ? g.missions.active.text() : null,
        step: g.missions.active ? g.missions.active.i : null,
        course: g.course ? { kind: g.course.kind, courseId: g.course.courseId, camera: !!g.course.camera, controls: g.course.controls, running: !!g.course.running } : null,
        end: it ? { label: it.label, r: it.r, priority: it.priority, modes: it.modes } : null,
        current: g.interact.current?.id ?? null,
        mode: p.mode,
        training: run.data.training ? { ...run.data.training } : null,
      };
    };
    const frames = [snap('lancement')];
    const ofc = (c) => g.obstacles.list.filter((o) => o.course === c);
    const warm = ofc('warmup').map((o) => ({ kind: o.kind, x: o.x, z: o.z, rot: o.rot, h: o.h, w: o.w, spread: o.spread, label: o.label, num: o.num }));
    for (const s of steps) {
      if (s.p) {
        if (p.mode !== 'ride') {
          p.human.setPosition(h.pos.x + 1, h.pos.z + 1);
          p.mount();
        }
        place(s.p[0], s.p[1]);
        if (s.foot) p.dismount();
      }
      if (s.ev) {
        const o = ofc(s.ev.course)[s.ev.i];
        const ev = { obstacle: o, dir: 1 };
        if (s.ev.kind === 'clear') ev.margin = s.ev.margin;
        if (s.ev.kind === 'fault') {
          ev.margin = -0.05;
          ev.cause = s.ev.cause;
          ev.causeText = s.ev.cause ? CAUSES[s.ev.cause] : '';
        }
        g.bus.emit(`obstacle:${s.ev.kind}`, ev);
      }
      if (s.end) {
        const it = g.interact.list.get('train:end');
        if (!it) throw new Error('action Terminer absente');
        it.action();
      }
      for (let i = 0; i < s.ticks; i++) g.update(1 / 30);
      frames.push(snap(s.id));
    }
    return { frames, result, warm, active: !!g.missions.active, course: !!g.course };
  }, STEPS);
  if (errors.length) throw new Error(`erreurs de la page (${lang}) : ${errors.join(' | ')}`);
  out.langs[lang] = rec;
  console.log(`${lang} : ${rec.frames.length} relevés, résultat ${JSON.stringify(rec.result)}, obstacles du paddock ${JSON.stringify(rec.warm)}`);
  await ctx.close();
}
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`écrit ${OUT}`);
