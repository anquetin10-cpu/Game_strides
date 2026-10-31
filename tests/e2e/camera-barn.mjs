// OBS-01 — caméra dans l'écurie du Val pendant « Premiers pas » (« Va chercher Comète dans son box »), iPhone 13
// paysage émulé, rendu logiciel SwiftShader (pas un iPhone réel). Commandes normales : joystick virtuel (marche) et
// glisser sur la droite de l'écran (rotation de la caméra, input.look comme le doigt).
// Parcours : entrée par la porte du pignon ouest, allée, porte du box de Comète, demi-tours, retour dehors ; tours de
// caméra complets (24 pas) en 7 points (seuil intérieur / extérieur, allée, devant le box, contre les cloisons).
// À chaque image : caméra dans une paroi (point dans une boîte de collision du bâtiment) ; vue coupée (un point du
// segment visée → caméra dans une paroi). Captures des premiers cas dans tests/e2e/out/camera-barn/.
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/camera-barn.mjs [avant|apres]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const tag = process.argv[2] || 'run';
const OUT = `tests/e2e/out/camera-barn/${tag}`;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const E = (f, a) => page.evaluate(f, a);
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
await E(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop();
  A.closeCards();
  g.phone.notify = () => {};
  g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 10.5 * 3600;
  // « Premiers pas » à l'étape « Va chercher Comète » : Comète au box, consignes lues.
  g.stabling.putIn(g.mainHorse, true);
  g.missions.offers = [];
  g.missions.refreshOffers(false);
  g.missions.accept('story:tuto');
  A.closeCards();
  for (let i = 0; i < 20 && g.hud.dialogActive; i++) g.hud.advanceDialog(), A.tick(1);
  A.foot();
  g.player.human.setPosition(-150.5, 150, Math.PI / 2);
  g.cam.yaw = -Math.PI / 2; // derrière le joueur, qui regarde vers l'est (l'allée)
  A.tick(3);
  g.cam.snap(g.player.focus.pos, g.player.heading);
  A.tick(20);
  const S = (window.__s = { samples: 0, inside: [], cut: [], log: [] });
  const cs = g.colliders;
  // Mesure de l'image courante.
  S.measure = (where) => {
    const c = g.camera.position, t = g.cam.target;
    S.samples++;
    const inside = cs.blocked(c.x, c.z, c.y);
    let cut = false;
    for (let k = 1; k <= 20 && !cut; k++) {
      const f = k / 20;
      if (cs.blocked(t.x + (c.x - t.x) * f, t.z + (c.z - t.z) * f, t.y + (c.y - t.y) * f)) cut = true;
    }
    const rec = { where, cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], player: [+g.player.human.pos.x.toFixed(2), +g.player.human.pos.z.toFixed(2)], yaw: +g.cam.yaw.toFixed(2), dist: +g.cam.dist.toFixed(2) };
    if (inside) S.inside.push(rec);
    if (cut) S.cut.push(rec);
    return inside || cut;
  };
  S.walk = (pts, label) => {
    const p = g.player;
    for (const [x, z] of pts) {
      for (let n = 0; n < 30 * 20; n++) {
        const d = Math.hypot(x - p.human.pos.x, z - p.human.pos.z);
        if (d < 0.3) break;
        A.steer(x - p.human.pos.x, z - p.human.pos.z, 0.5);
        A.tick(1);
        S.measure(label);
      }
    }
    A.releaseInput();
    A.tick(2);
  };
  // Tour de caméra complet au doigt (glisser horizontal), en 24 pas, mesure après stabilisation.
  S.spin = (label) => {
    const step = (2 * Math.PI) / 24 / (0.0062 * g.cam.sens);
    let bad = 0;
    for (let i = 0; i < 24; i++) {
      for (let k = 0; k < 4; k++) {
        g.input.look.dx = step / 4;
        A.tick(1);
        g.input.look.dx = 0;
      }
      A.tick(8);
      if (S.measure(`${label} · tour ${i + 1}/24`)) bad++;
    }
    return bad;
  };
});

const shots = [];
const capture = async (name) => {
  await E(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82, timeout: 120000 }).catch(() => {});
  shots.push(name);
};
// 1. Entrée par la porte du pignon ouest, jusqu'à la porte du box de Comète (joystick), capture à chaque étape.
await E(() => window.__s.walk([[-147, 150]], 'approche de la porte'));
await capture('01-devant-la-porte');
await E(() => window.__s.walk([[-144.6, 150]], 'seuil (entrée)'));
await capture('02-seuil');
await E(() => window.__s.walk([[-143, 149.4]], 'allée vers le box'));
await capture('03-devant-le-box');
// 2. Tours de caméra complets en 7 points.
const spots = [
  ['P1 seuil intérieur', -144.6, 150],
  ['P2 seuil extérieur', -145.8, 150],
  ['P3 allée, milieu', -143, 150],
  ['P4 contre la porte du box de Comète', -143, 148.75],
  ['P5 contre les boxes d’en face', -143, 151.25],
  ['P6 allée, plus loin', -138, 150],
  ['P7 angle pignon / boxes', -144.35, 148.75],
];
const perSpot = {};
const firstBad = {};
for (const [label, x, z] of spots) {
  const r = await E(([label, x, z]) => {
    const S = window.__s, g = window.__game;
    S.walk([[x, z]], `vers ${label}`);
    const before = S.inside.length + S.cut.length;
    const bad = S.spin(label);
    return { bad, first: [...S.inside, ...S.cut].slice(before)[0] || null };
  }, [label, x, z]);
  perSpot[label] = r.bad;
  if (r.first) firstBad[label] = { x, z, yaw: r.first.yaw };
  // Capture d'un cas défavorable s'il y en a un : la caméra est ramenée sur l'angle fautif.
  if (r.first) {
    await E((yaw) => {
      const g = window.__game;
      g.cam.yaw = yaw;
      g.cam.lastManual = g.time;
      window.__auto.tick(10);
    }, r.first.yaw);
    await capture(`spot-${label.split(' ')[0]}-masque`);
  }
}
// Mêmes angles que les cas défavorables de la mesure « avant » (comparaison avant / après).
let ref = {};
try {
  ref = JSON.parse(readFileSync('tests/e2e/out/camera-barn/avant/mesures.json', 'utf8')).firstBad || {};
} catch {}
if (tag !== 'avant') {
  for (const [label, f] of Object.entries(ref)) {
    const m = await E(([f, label]) => {
      const S = window.__s, g = window.__game;
      S.walk([[f.x, f.z]], `vers ${label}`);
      g.cam.yaw = f.yaw;
      g.cam.lastManual = g.time;
      window.__auto.tick(12);
      const R = g.realism;
      return { bad: S.measure(`${label} · angle de la mesure avant`), dist: +g.cam.dist.toFixed(2), humanVisible: g.player.human.mesh.visible, layers: g.player.human.mesh.layers.mask, real: R ? Object.keys(R).slice(0, 8) : null };
    }, [f, label]);
    perSpot[`${label} · angle avant`] = m.bad ? 1 : 0;
    console.log('rejouée', label, JSON.stringify(m));
    await capture(`spot-${label.split(' ')[0]}-meme-angle-qu-avant`);
  }
}
// 3. Retour dehors (demi-tour, allée, porte).
await E(() => window.__s.walk([[-143, 150], [-144.8, 150], [-148, 150]], 'retour vers la sortie'));
await capture('04-sortie');
const res = await E(() => {
  const S = window.__s;
  return { samples: S.samples, inside: S.inside.length, cut: S.cut.length, insideEx: S.inside.slice(0, 6), cutEx: S.cut.slice(0, 6) };
});
const summary = { tag, ...res, perSpot, firstBad, shots, errors: errors.slice(0, 3) };
writeFileSync(`${OUT}/mesures.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ tag, samples: res.samples, inside: res.inside, cut: res.cut, perSpot }, null, 1));
console.log('exemples caméra dans une paroi', JSON.stringify(res.insideEx.slice(0, 3)));
console.log('exemples vue coupée', JSON.stringify(res.cutEx.slice(0, 3)));
await browser.close();
