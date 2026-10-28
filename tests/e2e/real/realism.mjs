// Prototype « personnages réalistes » : par défaut le personnage classique est affiché ; en mode réaliste, le modèle
// réaliste est chargé à part (public/real/), suit le personnage à pied, à cheval et au volant, change de tenue ; le
// retour au mode classique rétablit l'affichage d'origine. Usage : BASE=… node tests/e2e/real/realism.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = process.env.BASE || 'http://127.0.0.1:5173';
let fails = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`); if (!cond) fails++; };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 667, height: 308 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?autostart`, { timeout: 180000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 });
await page.addScriptTag({ content: readFileSync('tests/e2e/autopilot.js', 'utf8') });
const step = (fn) => page.evaluate(fn);
await step(() => {
  const A = window.__auto, g = window.__game;
  A.stopLoop(); A.closeCards(); while (g.hud.dialogActive) g.hud.advanceDialog(); A.closeCards();
  // Boucle d'affichage coupée : le modèle réaliste est mis à jour avec chaque pas de jeu, comme dans frame().
  const tick = A.tick;
  A.tick = (n = 1) => { for (let i = 0; i < n; i++) { tick(1); g.realism.update(); } };
});
// État d'affichage : couche du personnage classique, modèle réaliste rattaché et suivi.
const state = () => step(() => {
  const g = window.__game, p = g.player, body = g.realism.body;
  const head = body?.bones?.head || g.player.human.mesh;
  const hp = head ? head.getWorldPosition(new head.position.constructor()) : null;
  return {
    mode: g.save.data.settings.characters,
    classicLayer: p.human.mesh.layers.mask,
    real: !!body && body.human === p.human,
    attached: !!body && body.root.parent === p.human.mesh,
    headAbove: hp ? hp.y - p.human.mesh.getWorldPosition(hp.clone()).y : null,
    kind: p.outfitKind,
    helmet: !!body?.helmet,
    horse: horseState(),
  };
  // Cheval réaliste : rattaché au cheval du joueur, cheval procédural masqué, sabots au sol (articulation du sabot
  // à ~9 cm au-dessus du sol) quand le cheval est à l'arrêt.
  function horseState() {
    const h = g.mainHorse, r = g.realism.horses?.get(h);
    if (!r) return { real: false, layer: h.mesh.layers.mask };
    const ys = ['BN_L_Toe_042', 'BN_R_Toe_047', 'BN_L_Toe_2_055', 'BN_R_Toe_2_059'].map((n) => r.bones[n].getWorldPosition(new head.position.constructor()).y - h.pos.y);
    return { real: r.root.parent === h.mesh && r.root.visible, layer: h.mesh.layers.mask, hooves: ys.map((y) => +y.toFixed(3)) };
  }
});
const tick = (n) => step(`window.__auto.tick(${n})`);

await tick(4);
let s = await state();
check('par défaut : personnage classique', s.mode === 'classic' && s.classicLayer === 1 && !s.real, JSON.stringify(s));

await step(() => window.__game.realism.set('real'));
await page.waitForFunction(() => { window.__auto.tick(1); return !!window.__game.realism.body || window.__game.realism.failed; }, null, { timeout: 60000, polling: 200 });
await tick(4);
s = await state();
check('mode réaliste : modèle chargé et rattaché', s.real && s.attached, JSON.stringify(s));
check('mode réaliste : personnage classique masqué', s.classicLayer === 2 ** 31, String(s.classicLayer));
check('tête à hauteur d’adulte', s.headAbove > 1.4 && s.headAbove < 1.9, String(s.headAbove?.toFixed(2)));
await page.waitForFunction(() => { window.__auto.tick(1); return window.__game.realism.horses.size > 0 || window.__game.realism.horseFailed; }, null, { timeout: 60000, polling: 200 });
await tick(30);
s = await state();
check('cheval réaliste rattaché, cheval procédural masqué', s.horse.real && s.horse.layer === 2 ** 31, JSON.stringify(s.horse));
check('cheval à l’arrêt : quatre sabots au sol', s.horse.hooves?.every((y) => y > 0.05 && y < 0.14), JSON.stringify(s.horse.hooves));

// À cheval : nouveau personnage (tenue avec casque), modèle réaliste reconstruit sans attente.
await step(() => { const g = window.__game, p = g.player; g.mainHorse.setPosition(p.human.pos.x + 1.5, p.human.pos.z, 0); window.__auto.tick(2); p.mount(); });
await tick(10);
s = await state();
check('à cheval : modèle réaliste suivi, casque', s.real && s.kind === 'ride' && s.helmet, JSON.stringify(s));
const gal = await step(() => {
  const g = window.__game, h = g.mainHorse, r = g.realism.horses.get(h);
  let low = 9, n = 0;
  for (let i = 0; i < 120; i++) {
    g.input.setVirtualMove(0, 1);
    window.__auto.tick(1);
    if (i < 60) continue;
    // Au galop : le sabot le plus bas de chaque image touche le sol (ni enfoncé ni flottant).
    const ys = ['BN_L_Toe_042', 'BN_R_Toe_047', 'BN_L_Toe_2_055', 'BN_R_Toe_2_059'].map((b) => r.bones[b].getWorldPosition(h.pos.clone()).y - h.groundY);
    low = Math.min(low, Math.min(...ys));
    n++;
  }
  g.input.setVirtualMove(0, 0);
  for (let i = 0; i < 90; i++) window.__auto.tick(1);
  return { speed: h.speed, low: +low.toFixed(3), n };
});
s = await state();
check('à cheval : toujours réaliste après les allures', s.real && s.classicLayer === 2 ** 31 && s.horse.real);
check('au galop : sabots jamais enfoncés dans le sol', gal.low > 0.03, JSON.stringify(gal));
await step(() => window.__game.player.dismount());
await tick(10);
s = await state();
check('pied à terre : réaliste, tenue de travail', s.real && s.kind === 'work', JSON.stringify(s));

// Au volant : le personnage entre dans le véhicule et en ressort sans erreur.
const drove = await step(() => {
  const g = window.__game, p = g.player;
  const v = g.drivables[0];
  if (!v) return 'aucun véhicule';
  p.enterVehicle(v);
  window.__auto.tick(20);
  if (p.mode !== 'drive') return 'pas au volant';
  p.exitVehicle();
  window.__auto.tick(10);
  return 'ok';
});
s = await state();
check('volant puis sortie : réaliste conservé', s.real && drove === 'ok', `${drove} ${JSON.stringify(s)}`);

// Retour au classique : affichage d'origine.
await step(() => window.__game.realism.set('classic'));
await tick(4);
s = await state();
check('retour au classique : modèle retiré, classique affiché', !s.real && s.classicLayer === 1, JSON.stringify(s));
check('retour au classique : cheval procédural affiché', !s.horse.real && s.horse.layer === 1, JSON.stringify(s.horse));

check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? `RÉALISTE : ${fails} échec(s)` : 'RÉALISTE OK');
process.exit(fails ? 1 : 0);
