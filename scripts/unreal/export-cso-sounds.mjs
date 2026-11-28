// Sons de l'épreuve du Pôle (tranche T12, unreal/docs/parite/cso-ecarts.md §4) : rendu HORS LIGNE des sons de
// src/core/audio.js par la vraie classe `Audio` du jeu web, chargée dans une page de test (rien n'est modifié dans src/).
// Le jeu web est la spécification : chaque son est joué par sa méthode, avec les arguments relevés dans l'oracle
// unreal/core/tests/oracles/cso_runs/ (variantes réellement appelées pendant l'épreuve), dans un OfflineAudioContext que
// `unlock()` reçoit à la place du AudioContext du navigateur (même graphe : bus maître 0,8, compresseur, boucles
// d'ambiance, tampon de bruit de 2 s). Hasard : Math.random remplacé par mulberry32 (src/core/math.js), graine fixe pour
// le tampon de bruit, graine par son pour l'appel ; deux exports successifs donnent les mêmes octets parce que le WAV
// existant est gardé quand l'écart reste dans la tolérance (voir plus bas) : un export dans un dossier vide peut changer
// la SHA-1 de quelques sons (3 sur 19 au contrôle adverse de T12 : applause_1p3_4, bell_2, bell).
//
// Sorties :
//  - .tmp/unreal-import/cso-sounds/<clé>.wav : PCM 16 bits mono 48 kHz, signal pris APRÈS le gain maître (0,8) et AVANT
//    le compresseur du jeu (DynamicsCompressor partagé par tous les sons : non linéaire, il dépend du mélange ; non
//    porté, mesuré par son dans `gameChain`) ; bus du public (crowd) débranché pendant le rendu (applause appelle
//    cheer(), qui n'est qu'une automation du gain du bus : rejouée par le cœur, voir crowd ci-dessous) ; silence final
//    coupé (après le dernier échantillon non nul une fois quantifié).
//  - .tmp/unreal-import/cso-sounds/crowd_loop.wav : bus du public seul, gain 1 (bruit en boucle → passe-bande 900 Hz,
//    Q 0,7 → gain maître 0,8), régime établi : seconde période de 2 s du tampon de bruit bouclé (raccord sans saut).
//  - unreal/StridesGrandTour/Content/Data/cso_sounds.json : manifeste lu par le jeu et par les tests (nom = clé, appel,
//    fichier, actif Unreal, nombre d'échantillons, crête, RMS, SHA-1 du PCM, SHA-256 du fichier, mesure de la chaîne du
//    jeu), constantes du bus du public extraites du source (audio.js, game.js) et recoupées dans le jeu en cours
//    d'exécution (rayon et niveau relevés aux appels d'ambience, sauf --no-game).
//  - unreal/core/tests/oracles/cso_crowd.json : gain du bus du public rendu échantillon par échantillon (source
//    constante 1 branchée sur le gain du bus) pendant des séquences d'images au pas de 1/30 s (ambience appelée à
//    chaque image, cheer / applause aux images choisies, avant ambience comme dans game.update) ; rejoué par le cœur
//    (testCsoCrowd : sémantique des AudioParam setValueAtTime / setTargetAtTime / cancelScheduledValues).
//
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5173 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-sounds.mjs [--no-game]
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const RUNS = join(ROOT, 'unreal/core/tests/oracles/cso_runs');
const WAV_DIR = join(ROOT, '.tmp/unreal-import/cso-sounds');
const MANIFEST = join(ROOT, 'unreal/StridesGrandTour/Content/Data/cso_sounds.json');
const CROWD_OUT = join(ROOT, 'unreal/core/tests/oracles/cso_crowd.json');
const HARNESS = `${BASE}/__strides_cso_sounds__.html`;
const RATE = 48000;
const SEED_NOISE = 20261120;  // tampon de bruit (unlock → _noise(2))
const RENDER_S = 6;           // durée rendue avant la coupe du silence final
const ASSET_DIR = '/Game/Audio/Cso';
const NO_GAME = process.argv.includes('--no-game');

// Sons non rendus en WAV : breath (au galop, à chaque foulée de l'animation : phase horse.anim.phase de l'animation PJL,
// non portée), cheer (automation du gain du bus du public : rejouée par le cœur).
const NOT_RENDERED = { breath: 'foulées de l’animation du cheval (horse:step, horse.anim.phase) non portées', cheer: 'automation du gain du bus du public (crowd), rejouée par le cœur (cso_crowd.json)' };

// Clé d'un appel (nom de fichier et d'actif Unreal) : nom, puis arguments (nombres écrits comme String(n) de JS), « . »
// remplacé par « p » (interdit dans un nom d'actif) ; même règle que strides::csoSoundKey (CsoAudio.cpp).
const soundKey = (fn, args) => [fn, ...args.map((a) => String(a))].join('_').replace(/\./g, 'p').replace(/[^A-Za-z0-9_-]/g, '_');
// Graine de l'appel : FNV-1a 32 bits de la clé.
const seedOf = (key) => {
  let h = 0x811c9dc5;
  for (const c of Buffer.from(key, 'utf8')) h = Math.imul(h ^ c, 0x01000193) >>> 0;
  return h;
};

// Variantes appelées pendant l'épreuve : relevées dans les exécutions de l'oracle (images et appels du lancement).
function variantsFromOracle() {
  const idx = JSON.parse(readFileSync(join(RUNS, 'index.json'), 'utf8'));
  const seen = new Map();
  const add = (c) => {
    const key = soundKey(c.fn, c.args);
    if (!seen.has(key)) seen.set(key, { fn: c.fn, args: c.args, n: 0, src: new Set() });
    const v = seen.get(key);
    v.n++;
    v.src.add(c.src);
  };
  for (const r of idx.runs) {
    const d = JSON.parse(readFileSync(join(RUNS, r.file), 'utf8'));
    for (const c of d.setup?.calls?.audio || []) add(c);
    for (const f of d.frames) for (const c of f.audio || []) add(c);
  }
  return [...seen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, v]) => ({ key, fn: v.fn, args: v.args, calls: v.n, src: [...v.src].sort() }));
}

// Constantes du bus du public lues dans le source (jamais recopiées) ; l'expression doit être unique.
function crowdConstants() {
  const audio = readFileSync(join(ROOT, 'src/core/audio.js'), 'utf8');
  const game = readFileSync(join(ROOT, 'src/game.js'), 'utf8');
  const one = (src, re, what) => {
    const m = [...src.matchAll(re)];
    if (m.length !== 1) throw new Error(`${what} : ${m.length} occurrences de ${re}`);
    return m[0];
  };
  const amb = one(audio, /this\.crowd\.g\.gain\.setTargetAtTime\(crowd \* ([\d.]+), t, ([\d.]+)\)/g, 'ambience (audio.js)');
  const cheer = one(audio, /cheer\(\) \{[^}]*?setValueAtTime\(([\d.]+), t\);\s*this\.crowd\.g\.gain\.setTargetAtTime\(([\d.]+), t \+ ([\d.]+), ([\d.]+)\);/g, 'cheer (audio.js)');
  const bus = one(audio, /this\.crowd = mk\((\d+), ([\d.]+), '(\w+)'\);/g, 'bus du public (audio.js)');
  const master = one(audio, /this\.master\.gain\.value = this\.enabled \? ([\d.]+) : 0;/g, 'gain maître (audio.js)');
  const lvl = one(game, /crowd: this\.indoor \? this\.shops\.murmur\(\) : Math\.hypot\(f\.x - POLE\.arena\.x, f\.z - POLE\.arena\.z\) < (\d+) \|\| this\.course\?\.kind === 'cso' \? ([\d.]+) : 0,/g, 'niveau du public (game.js)');
  return {
    master: +master[1],
    bus: { freq: +bus[1], q: +bus[2], type: bus[3], noiseSeconds: 2 },
    ambience: { scale: +amb[1], tau: +amb[2] },
    cheer: { peak: +cheer[1], target: +cheer[2], hold: +cheer[3], tau: +cheer[4] },
    level: { radius: +lvl[1], value: +lvl[2], inCourse: "game.course?.kind === 'cso'", indoor: 'shops.murmur() (intérieur des commerces, hors épreuve : non porté)' },
    sources: ['src/core/audio.js', 'src/game.js'],
  };
}

const HTML = '<!doctype html><html><head><meta charset="utf-8"><title>sons</title></head><body></body></html>';

function PAGE_SETUP() {
  const b64 = (f32) => {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  // Instance neuve de la classe Audio du jeu sur un OfflineAudioContext (unlock() le reçoit à la place d'AudioContext).
  const make = async (ctx, seedNoise) => {
    const { Audio } = await import('/src/core/audio.js');
    const { mulberry32 } = await import('/src/core/math.js');
    const AC = window.AudioContext, R0 = Math.random;
    window.AudioContext = function () { return ctx; };
    Math.random = mulberry32(seedNoise);
    const a = new Audio();
    try { a.unlock(); } finally { window.AudioContext = AC; Math.random = R0; }
    return { a, mulberry32 };
  };
  // Un son : mode « dry » (après le gain maître, sans compresseur) ou « game » (chaîne du jeu : maître → compresseur).
  window.__render = async ({ fn, args, seedNoise, seedCall, seconds, rate, mode }) => {
    const ctx = new OfflineAudioContext(1, Math.round(seconds * rate), rate);
    const { a, mulberry32 } = await make(ctx, seedNoise);
    if (mode === 'dry') { a.master.disconnect(); a.master.connect(ctx.destination); }
    a.crowd.g.disconnect();
    const R0 = Math.random;
    Math.random = mulberry32(seedCall);
    try { a[fn](...args); } finally { Math.random = R0; }
    const buf = await ctx.startRendering();
    return b64(buf.getChannelData(0));
  };
  // Bus du public seul, gain 1, régime établi (seconde période du tampon de bruit bouclé).
  window.__crowdLoop = async ({ seedNoise, rate }) => {
    const ctx = new OfflineAudioContext(1, rate * 4, rate);
    const { a } = await make(ctx, seedNoise);
    a.master.disconnect();
    a.master.connect(ctx.destination);
    a.crowd.g.gain.value = 1;
    const buf = await ctx.startRendering();
    return b64(buf.getChannelData(0).slice(rate * 2, rate * 4));
  };
  // Gain du bus du public au fil des images : source constante 1 → gain du bus → sortie (filtre et maître débranchés).
  window.__crowdGain = async ({ seedNoise, rate, frames, dt, at, actions, crowdAt }) => {
    const ctx = new OfflineAudioContext(1, Math.ceil((at[frames - 1] + 0.5) * rate), rate);
    const { a } = await make(ctx, seedNoise);
    a.master.disconnect();
    a.crowd.f.disconnect();
    a.crowd.g.disconnect();
    const one = ctx.createConstantSource();
    one.offset.value = 1;
    one.connect(a.crowd.g);
    a.crowd.g.connect(ctx.destination);
    one.start(0);
    const times = [];
    const frame = (k) => {
      times.push(ctx.currentTime);
      for (const [fn, args] of actions[k] || []) a[fn](...args);
      a.ambience({ speed: 0, seaDist: 999, crowd: crowdAt[k], engine: -1, night: 0, indoor: 0 }, dt);
    };
    frame(0);  // image 0 avant le rendu (currentTime = 0)
    for (let k = 1; k < frames; k++) ctx.suspend(at[k]).then(() => { frame(k); ctx.resume(); });
    const buf = await ctx.startRendering();
    return { times, samples: b64(buf.getChannelData(0)) };
  };
}

const f32 = (b64) => {
  const b = Buffer.from(b64, 'base64');
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};
const q16 = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
const stats = (x) => {
  let peak = 0, s = 0;
  for (const v of x) { peak = Math.max(peak, Math.abs(v)); s += v * v; }
  return { peak: +peak.toFixed(6), rms: +Math.sqrt(s / Math.max(1, x.length)).toFixed(6) };
};
function wav(pcm) {
  const data = Buffer.alloc(pcm.length * 2);
  pcm.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return { file: Buffer.concat([h, data]), data };
}
const sha = (alg, b) => createHash(alg).update(b).digest('hex');
const writeIfChanged = (path, buf) => {
  if (existsSync(path) && Buffer.compare(readFileSync(path), buf) === 0) return false;
  writeFileSync(path, buf);
  return true;
};

// Séquences du bus du public (oracle cso_crowd.json) : niveau d'ambience par image, appels avant ambience.
function crowdScenarios(C) {
  const L = C.level.value;
  const fill = (n, f) => Array.from({ length: n }, (_, k) => f(k));
  return [
    { id: 'approche', desc: 'hors de portée 30 images, dans les 90 m 150 images, puis sortie 90 images', frames: 270, crowd: fill(270, (k) => (k >= 30 && k < 180 ? L : 0)), actions: {} },
    { id: 'cheer', desc: 'dans les 90 m ; cheer() à l’image 60 (fin de mission sans faute, courses.js:343)', frames: 240, crowd: fill(240, () => L), actions: { 60: [['cheer', []]] } },
    { id: 'arrivee-sans-faute', desc: 'applause(1.3, 4) puis cheer() à l’image 45 (courses.js:342-343)', frames: 300, crowd: fill(300, () => L), actions: { 45: [['applause', [1.3, 4]], ['cheer', []]] } },
    { id: 'entree-en-piste', desc: 'applause(0.5, 2.2) à l’image 20 (entrée en piste, courses.js:451)', frames: 200, crowd: fill(200, () => L), actions: { 20: [['applause', [0.5, 2.2]]] } },
    { id: 'cheer-hors-portee', desc: 'hors de portée, cheer() à l’image 10 puis à l’image 40 (pendant le maintien de 1,6 s du premier : sa cible à +1,6 s est annulée)', frames: 200, crowd: fill(200, () => 0), actions: { 10: [['cheer', []]], 40: [['cheer', []]] } },
    { id: 'sortie-apres-cheer', desc: 'cheer() à l’image 30 dans les 90 m, sortie de portée à l’image 50', frames: 220, crowd: fill(220, (k) => (k < 50 ? L : 0)), actions: { 30: [['cheer', []]] } },
    // Images de durée variable (boucle du jeu sur requestAnimationFrame) : la cible de cheer à +1,6 s tombe entre deux
    // images ; second cheer pendant le maintien du premier (sa cible à +1,6 s annulée).
    { id: 'images-irregulieres', desc: 'dans les 90 m, durée d’image (1/30) × (1 + 0,45 sin 0,7k) ; cheer() aux images 20 et 45, applause(0.55, 2.6) à l’image 110', frames: 260, crowd: fill(260, () => L),
      dts: fill(260, (k) => (1 + 0.45 * Math.sin(0.7 * k)) / 30), actions: { 20: [['cheer', []]], 45: [['cheer', []]], 110: [['applause', [0.55, 2.6]]] } },
  ];
}

// Rayon et niveau relevés dans le jeu en cours d'exécution : appels d'ambience autour du bord des 90 m.
async function crowdInGame(browser, C) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/?autostart&quality=low&lang=fr`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000, polling: 500 });
  const out = await page.evaluate(async ({ radius }) => {
    const g = window.__game;
    const { POLE } = await import('/src/world/sites.js');
    const rec = [];
    const amb = g.audio.ambience.bind(g.audio);
    g.audio.ambience = (o, dt) => { rec.push({ crowd: o.crowd, indoor: o.indoor, fx: g.player.focus.pos.x, fz: g.player.focus.pos.z, course: g.course?.kind ?? null }); return amb(o, dt); };
    const wait = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const res = [];
    for (const d of [radius - 2, radius - 0.5, radius + 0.5, radius + 2, 40, 200]) {
      g.player.teleport(POLE.arena.x + d, POLE.arena.z, 0, true);
      rec.length = 0;
      await wait(6);
      const last = rec[rec.length - 1];
      res.push({ d, dist: last ? Math.hypot(last.fx - POLE.arena.x, last.fz - POLE.arena.z) : null, crowd: last ? last.crowd : null, indoor: last?.indoor ?? null, course: last?.course ?? null, calls: rec.length });
    }
    g.audio.ambience = amb;
    return res;
  }, { radius: C.level.radius });
  await ctx.close();
  if (errs.length) throw new Error('erreurs de page (jeu) : ' + errs.join(' | '));
  for (const r of out) {
    const want = r.dist < C.level.radius ? C.level.value : 0;
    if (r.calls < 1 || r.indoor !== 0 || r.course !== null || r.crowd !== want) throw new Error(`niveau du public dans le jeu : ${JSON.stringify(r)} (attendu ${want})`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
mkdirSync(WAV_DIR, { recursive: true });
const variants = variantsFromOracle();
const C = crowdConstants();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(HARNESS, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }));
await page.goto(HARNESS);
await page.addScriptTag({ content: `(${PAGE_SETUP.toString()})();` });

const sounds = [];
const jitter = [];
let wrote = 0;
for (const v of variants) {
  if (NOT_RENDERED[v.fn]) continue;
  const seedCall = seedOf(v.key);
  const dry = f32(await page.evaluate((o) => window.__render(o), { fn: v.fn, args: v.args, seedNoise: SEED_NOISE, seedCall, seconds: RENDER_S, rate: RATE, mode: 'dry' }));
  const game = f32(await page.evaluate((o) => window.__render(o), { fn: v.fn, args: v.args, seedNoise: SEED_NOISE, seedCall, seconds: RENDER_S, rate: RATE, mode: 'game' }));
  let last = -1;
  const all = Array.from(dry, q16);
  for (let i = 0; i < all.length; i++) if (all[i] !== 0) last = i;
  if (last < 0) throw new Error(`${v.key} : rendu silencieux`);
  if (last >= all.length - 1) throw new Error(`${v.key} : son plus long que ${RENDER_S} s`);
  let pcm = all.slice(0, last + 1);
  // Chrome somme les connexions d'une entrée dans un ordre qui varie d'une exécution à l'autre (bus maître : une
  // connexion par note) : quelques échantillons peuvent changer d'un pas de quantification (constaté sur applause_1p3_4,
  // bell_2 et bell). Un fichier existant qui reste à au plus 1 pas sur au plus 16 échantillons est gardé tel quel.
  const prev = join(WAV_DIR, `${v.key}.wav`);
  if (existsSync(prev)) {
    const b = readFileSync(prev).subarray(44);
    if (b.length === pcm.length * 2) {
      let n = 0, worst = 0;
      for (let i = 0; i < pcm.length; i++) { const d = Math.abs(b.readInt16LE(i * 2) - pcm[i]); if (d) { n++; worst = Math.max(worst, d); } }
      if (n && worst <= 1 && n <= 16) { pcm = Array.from({ length: pcm.length }, (_, i) => b.readInt16LE(i * 2)); jitter.push(`${v.key} (${n})`); }
    }
  }
  const clipped = pcm.filter((x) => x === 32767 || x === -32768).length;
  const { file, data } = wav(pcm);
  if (writeIfChanged(join(WAV_DIR, `${v.key}.wav`), file)) wrote++;
  const sd = stats(Float32Array.from(pcm, (x) => x / 32767)), sg = stats(game.subarray(0, last + 1 + Math.round(0.006 * RATE)));
  sounds.push({
    nom: v.key, fn: v.fn, args: v.args, src: v.src, calls: v.calls, file: `${v.key}.wav`, asset: `${ASSET_DIR}/${v.key}.${v.key}`,
    seed: seedCall, samples: pcm.length, seconds: +(pcm.length / RATE).toFixed(6), peak: sd.peak, rms: sd.rms, clipped,
    pcmSha1: sha('sha1', data), fileSha256: sha('sha256', file),
    gameChain: { peak: +sg.peak.toFixed(4), rms: +sg.rms.toFixed(4), rmsDb: +(20 * Math.log10(sg.rms / sd.rms)).toFixed(1) },
  });
}
// Boucle du bus du public.
{
  const loop = f32(await page.evaluate((o) => window.__crowdLoop(o), { seedNoise: SEED_NOISE, rate: RATE }));
  const pcm = Array.from(loop, q16);
  const { file, data } = wav(pcm);
  if (writeIfChanged(join(WAV_DIR, 'crowd_loop.wav'), file)) wrote++;
  const s = stats(loop);
  sounds.push({ nom: 'crowd_loop', fn: null, args: [], src: ['core/audio.js'], calls: 0, file: 'crowd_loop.wav', asset: `${ASSET_DIR}/crowd_loop.crowd_loop`, loop: true,
    seed: SEED_NOISE, samples: pcm.length, seconds: +(pcm.length / RATE).toFixed(6), peak: s.peak, rms: s.rms, clipped: pcm.filter((x) => x === 32767 || x === -32768).length,
    pcmSha1: sha('sha1', data), fileSha256: sha('sha256', file) });
}
// Oracle du bus du public.
const DT = 1 / 30;
const scen = [];
for (const sc of crowdScenarios(C)) {
  const actions = {};
  for (const [k, v] of Object.entries(sc.actions)) actions[k] = v;
  const at = [0];
  for (let k = 1; k < sc.frames; k++) at.push(at[k - 1] + (sc.dts ? sc.dts[k - 1] : DT));
  const r = await page.evaluate((o) => window.__crowdGain(o), { seedNoise: SEED_NOISE, rate: RATE, frames: sc.frames, dt: DT, at, actions, crowdAt: sc.crowd });
  const g = f32(r.samples);
  if (r.times.length !== sc.frames) throw new Error(`${sc.id} : ${r.times.length} images suspendues sur ${sc.frames}`);
  // Gain relevé : à chaque événement (instant suspendu) et au milieu de chaque image, échantillon le plus proche.
  const probe = [];
  for (let k = 0; k < sc.frames; k++) {
    const t0 = r.times[k], t1 = k + 1 < sc.frames ? r.times[k + 1] : t0 + DT;
    if (k && !(t0 > r.times[k - 1])) throw new Error(`${sc.id} : instants confondus à l’image ${k}`);
    for (const t of [t0, (t0 + t1) / 2]) {
      const n = Math.round(t * RATE);
      probe.push([n, +g[n].toPrecision(9)]);
    }
  }
  scen.push({ id: sc.id, desc: sc.desc, frames: sc.frames, crowd: sc.crowd, actions: sc.actions, times: r.times, probe });
}
await ctx.close();
let inGame = null;
if (!NO_GAME) inGame = await crowdInGame(browser, C);
await browser.close();
if (errors.length) {
  console.log('erreurs de page :', errors);
  process.exit(1);
}

const manifest = {
  schema: 'strides.cso_sounds/1',
  generator: 'scripts/unreal/export-cso-sounds.mjs',
  source: ['src/core/audio.js', 'src/core/math.js (mulberry32)', 'src/game.js', 'unreal/core/tests/oracles/cso_runs/'],
  render: `OfflineAudioContext mono ${RATE} Hz ; classe Audio du jeu (unlock() sur le contexte hors ligne) ; signal après le gain maître ${C.master}, avant le compresseur ; bus du public débranché ; PCM 16 bits (arrondi de x × 32767, borné) ; silence final coupé`,
  seeds: `Math.random = mulberry32(${SEED_NOISE}) pendant unlock (tampon de bruit de 2 s), puis mulberry32(FNV-1a 32 bits de la clé) pendant l'appel`,
  nommage: 'champ « nom » : nom puis arguments (String(n) de JS), joints par « _ », « . » → « p » (strides::csoSoundKey) ; pas « key » : faux positif de gitleaks (generic-api-key)',
  gameChain: 'mesure du même appel par la chaîne du jeu (gain maître → DynamicsCompressor par défaut : seuil −24 dB, genou 30, ratio 12, attaque 3 ms, relâchement 250 ms, anticipation 6 ms) : crête, RMS et écart de RMS au rendu sec (dB) ; le compresseur n’est pas porté',
  notRendered: NOT_RENDERED,
  rate: RATE,
  crowd: { ...C, oracle: 'unreal/core/tests/oracles/cso_crowd.json', asset: 'crowd_loop', inGame },
  sounds,
};
const mtext = JSON.stringify(manifest, null, 1) + '\n';
const ctext = JSON.stringify({ schema: 'strides.oracle.cso_crowd/1', generator: 'scripts/unreal/export-cso-sounds.mjs', source: ['src/core/audio.js'], rate: RATE, dt: DT,
  desc: 'gain du bus du public (audio.js : this.crowd.g.gain) rendu hors ligne ; ambience({crowd}) à chaque image (instants suspendus, times[k], arrondis au quantum de rendu de 128 échantillons) ; actions[k] = appels faits juste avant ambience à l’image k ; probe = [indice d’échantillon, gain] à chaque instant et au milieu de chaque image',
  constants: C, scenarios: scen }) + '\n';
const wm = writeIfChanged(MANIFEST, Buffer.from(mtext));
const wc = writeIfChanged(CROWD_OUT, Buffer.from(ctext));
const extra = readdirSync(WAV_DIR).filter((f) => f.endsWith('.wav') && !sounds.some((s) => s.file === f));
if (extra.length) console.log('fichiers WAV hors manifeste (gardés) :', extra.join(', '));
console.log(`${sounds.length} sons (${wrote} WAV réécrits) ; manifeste ${wm ? 'écrit' : 'inchangé'} ; oracle du public ${wc ? 'écrit' : 'inchangé'} (${scen.length} séquences)`);
for (const s of sounds) console.log(`  ${s.nom.padEnd(30)} ${String(s.samples).padStart(7)} éch. crête ${s.peak} RMS ${s.rms}${s.gameChain ? ` chaîne du jeu ${s.gameChain.rmsDb} dB` : ''}${s.clipped ? ` ÉCRÊTÉ ${s.clipped}` : ''}`);
if (jitter.length) console.log('rendus à 1 pas près du fichier existant (gardé) :', jitter.join(', '));
if (inGame) console.log('public dans le jeu :', inGame.map((r) => `${r.dist?.toFixed(2)} m → ${r.crowd}`).join(' ; '));
