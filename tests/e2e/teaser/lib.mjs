// Bibliothèque de prise de vues du teaser : le jeu est rendu image par image (Chromium, rendu logiciel SwiftShader,
// 1280 × 720, 24 images/s), caméra posée par le script, interface masquée (sauf demande), images JPEG numérotées.
// Ce n'est pas une capture d'iPhone : c'est le rendu du jeu par Chromium.
//
// Usage dans un script de plan (tests/e2e/teaser/shots/<plan>.mjs) :
//   import { open } from '../lib.mjs';
//   const s = await open({ hour: 18.2 });                 // partie neuve (Comète, cavalière réaliste)
//   await s.ev(() => { /* mise en place dans la page : window.__game, window.__auto, window.__cine */ });
//   await s.shoot('plage', 120, (i, n) => { /* dans la page : avancer la simulation, poser la caméra */ });
//   await s.close();
// Variables d'environnement : BASE (serveur du jeu, défaut http://127.0.0.1:5173), PREVIEW=1 (aperçu : une image sur 6,
// 640 × 360, pour régler les cadrages vite), OUT (dossier des images, défaut tests/e2e/out/teaser).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FPS = 24;
export const PREVIEW = process.env.PREVIEW === '1';
export const OUT = process.env.OUT || join(HERE, '../out/teaser');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';

// Aides injectées dans la page (window.__cine).
const CINE = `(() => {
  const g = window.__game, A = window.__auto, V = g.camera.position.constructor;
  const C = window.__cine = {
    acc: 0,
    lockHour: null,
    // Avance la simulation de sec secondes de jeu (pas fixes de 1/30 s, reste reporté à l'image suivante).
    advance(sec = 1 / ${FPS}) {
      C.acc += sec * 30;
      const n = Math.floor(C.acc);
      C.acc -= n;
      if (n > 0) A.tick(n);
      if (C.lockHour != null) g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + C.lockHour * 3600;
    },
    // Caméra : œil, cible (tableaux [x, y, z] ou objets {x, y, z}), champ vertical en degrés.
    cam(eye, target, fov = 50) {
      const e = Array.isArray(eye) ? eye : [eye.x, eye.y, eye.z], t = Array.isArray(target) ? target : [target.x, target.y, target.z];
      g.camera.position.set(e[0], e[1], e[2]);
      g.camera.fov = fov;
      g.camera.updateProjectionMatrix();
      g.camera.lookAt(t[0], t[1], t[2]);
      g.camera.updateMatrixWorld();
    },
    // Rendu de l'image courante avec la caméra posée (modèles réalistes, ciel, eau, herbe suivent la caméra).
    render(dt = 1 / ${FPS}) {
      g.realism?.update();
      g.sky.update(g.hour(), C.focus || g.player.focus.pos, dt);
      g.sky.follow(g.camera);
      g.world.update(dt, g.camera, g.sky);
      g.renderer.render(g.scene, g.camera);
    },
    lerp: (a, b, t) => a + (b - a) * t,
    mix3: (a, b, t) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t),
    ease: (t) => t * t * (3 - 2 * t),
    // Point à côté d'un objet orienté (cheval, véhicule) : side à gauche (+) / droite (-), up, fwd vers l'avant.
    around(o, side, up, fwd) {
      const h = o.heading ?? 0, L = { x: Math.cos(h), z: -Math.sin(h) }, F = { x: Math.sin(h), z: Math.cos(h) };
      const p = o.pos || o.position;
      return [p.x + L.x * side + F.x * fwd, (p.y ?? 0) + up, p.z + L.z * side + F.z * fwd];
    },
    V,
  };
})();`;

export async function open({ hour = 17.5, keepUI = false, query = '', save = null, characters = 'real' } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const size = PREVIEW ? { width: 640, height: 360 } : { width: 1280, height: 720 };
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  await ctx.addInitScript((s) => {
    localStorage.setItem('strides-lang', 'fr');
    if (s && !sessionStorage.getItem('teaser-seeded')) {
      sessionStorage.setItem('teaser-seeded', '1');
      localStorage.setItem('strides-grand-tour-v1', s);
    }
  }, save);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?autostart${query}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000 });
  await page.addScriptTag({ content: readFileSync(join(HERE, '../autopilot.js'), 'utf8') });
  await page.evaluate(([hour, characters]) => {
    const g = window.__game, A = window.__auto;
    A.stopLoop();
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    A.closeCards();
    g.missions.timer = 1e6;
    g.phone.notify = () => {};
    g.save.data.settings.quality = 'high';
    g.applyQuality('high');
    if (characters) g.realism.set(characters);
    g.sky.rain = 0;
    g.sky.wet = 0;
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + hour * 3600;
  }, [hour, characters]);
  await page.addScriptTag({ content: CINE });
  if (!keepUI) await page.addStyleTag({ content: '#ui, #touch, .hud, .toast, .toasts { visibility: hidden !important; }' });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // Plan : n images (aperçu : une sur 6) ; step(i, n) est exécuté dans la page avant le rendu de l'image i.
  const shoot = async (name, n, step, { quality = 92 } = {}) => {
    const dir = join(OUT, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const src = `(${step.toString()})`;
    const t0 = Date.now();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const keep = !PREVIEW || i % 6 === 0;
      await page.evaluate(([src, i, n, keep]) => {
        // eslint-disable-next-line no-eval
        (0, eval)(src)(i, n);
        if (keep) window.__cine.render();
      }, [src, i, n, keep]);
      if (!keep) continue;
      await page.screenshot({ path: join(dir, `${String(k++).padStart(5, '0')}.jpg`), type: 'jpeg', quality });
    }
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`${name} : ${k} images en ${s} s → ${dir}`);
    return { dir, frames: k };
  };
  const close = async () => {
    if (errors.length) console.log('ERREURS', errors.slice(0, 5));
    await browser.close();
    return errors;
  };
  return { page, ev, shoot, close, errors };
}
