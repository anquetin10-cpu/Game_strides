// Commandes d'épreuve (tranche T8) : oracle de la classe Input du jeu web (src/core/input.js) soumise à de VRAIS
// événements tactiles, souris et clavier synthétiques (protocole DevTools : Input.dispatchTouchEvent,
// Input.dispatchMouseEvent, Input.dispatchKeyEvent), dans le navigateur. Le jeu web est la spécification ; ce script ne
// modifie rien dans src/ ni tests/ : il importe le module tel que Vite le sert et l'instancie sur une surface de test.
//
// Page de test : servie par Playwright (page.route) à l'origine du serveur Vite, sans le jeu ; une surface plein écran
// (comme le canvas #game : touch-action none) reçoit les gestes, un calque reçoit le joystick, deux boutons sont reliés
// par input.bindButton (« jump » et « pause », comme le HUD). Chaque scénario part d'une instance neuve.
//
// Relevé : chaque appel reçu par l'instance (méthodes _down, _moveEvt, _up, _key, poll, endFrame, setEnabled,
// releaseAll, setVirtualMove enveloppées sur l'instance ; boutons : écouteurs ajoutés après bindButton, donc après les
// siens) avec ses arguments tels que le code les lit (identifiant et type du pointeur, clientX / clientY, taille de la
// fenêtre pour la zone du joystick ; code physique, enfoncée, répétition), puis l'état complet de l'instance juste après
// (move, look, held, pressed, keys, enabled, keyMove, _virtual, joy, lookPtr, élément du joystick : active, left, top,
// translation du bouton). Rejoué par unreal/core/tests/test_core.cpp (testCsoInput) avec strides::CsoInput.
//
// Sortie : unreal/core/tests/oracles/cso_input.json (un scénario par ligne ; réécrit seulement s'il change).
// Usage (serveur Vite sur BASE, défaut http://127.0.0.1:5173 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-input.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = join(ROOT, 'unreal/core/tests/oracles/cso_input.json');
const HARNESS = `${BASE}/__strides_cso_input__.html`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden;touch-action:none}
#surface{position:fixed;inset:0;touch-action:none;background:#333}
#touch{position:fixed;inset:0;pointer-events:none}
.joy-base{position:fixed;width:124px;height:124px;margin:-62px 0 0 -62px}
.btn{position:fixed;width:80px;height:80px;pointer-events:auto;touch-action:manipulation}
#bJump{right:20px;bottom:20px}#bPause{right:20px;top:10px;width:44px;height:48px}</style></head>
<body><div id="surface"></div><div id="touch"></div><button class="btn" id="bJump">SAUT</button><button class="btn" id="bPause">II</button></body></html>`;

// ---------------------------------------------------------------------------------------------------------------
// Code de la page : instance neuve, enveloppes de relevé.
function PAGE_SETUP() {
  window.__setup = async () => {
    const { Input } = await import('/src/core/input.js');
    const old = window.__inp;
    if (old) {
      // Instance précédente détachée : ses écouteurs de fenêtre restent (le module n'en retire jamais) ; neutralisés.
      old._down = old._moveEvt = old._up = old._key = old.releaseAll = () => {};
      old.joyEl.remove();
    }
    const surface = document.getElementById('surface');
    const fresh = surface.cloneNode(false); // nouvelle surface : les écouteurs de l'instance précédente n'y sont plus
    surface.replaceWith(fresh);
    for (const id of ['bJump', 'bPause']) {
      const b = document.getElementById(id);
      const c = b.cloneNode(true);
      b.replaceWith(c);
    }
    const inp = new Input(fresh, document.getElementById('touch'));
    window.__inp = inp;
    const log = [];
    window.__log = log;
    const num = (s) => (s === '' ? null : parseFloat(s));
    const knob = () => {
      // Sérialisation du navigateur : « calc(-50% + 12.5px) », « calc(-50% - 12.5px) » ; au repos « translate(-50%, -50%) ».
      const tr = inp.knobEl.style.transform;
      if (tr === 'translate(-50%, -50%)') return [0, 0];
      const m = /^translate\(calc\(-50% ([+-]) ([\d.e+-]+)px\), calc\(-50% ([+-]) ([\d.e+-]+)px\)\)$/.exec(tr);
      if (!m) throw new Error(`translation du bouton illisible : ${tr}`);
      return [(m[1] === '-' ? -1 : 1) * parseFloat(m[2]), (m[3] === '-' ? -1 : 1) * parseFloat(m[4])];
    };
    const state = () => ({
      mv: [inp.move.x, inp.move.y, inp.move.mag],
      km: !!inp.keyMove,
      vi: !!inp._virtual,
      lk: [inp.look.dx, inp.look.dy],
      held: [...inp.held].sort(),
      pr: [...inp.pressed].sort(),
      keys: [...inp.keys].sort(),
      en: inp.enabled,
      joy: [inp.joy.id, inp.joy.ox, inp.joy.oy, inp.joy.x, inp.joy.y],
      lp: [inp.lookPtr.id, inp.lookPtr.x, inp.lookPtr.y],
      el: [inp.joyEl.classList.contains('active'), num(inp.joyEl.style.left), num(inp.joyEl.style.top), ...knob()],
    });
    const rec = (call) => log.push({ c: call, s: state() });
    // Appels imbriqués (setEnabled appelle releaseAll) : seul l'appel extérieur est relevé, il est rejoué tel quel.
    let depth = 0;
    const wrap = (name, toCall) => {
      const orig = inp[name].bind(inp);
      inp[name] = (...a) => {
        depth++;
        let r;
        try {
          r = orig(...a);
        } finally {
          depth--;
        }
        if (!depth) rec(toCall(...a));
        return r;
      };
    };
    const ptr = (e) => ({ id: e.pointerId, pt: e.pointerType, x: e.clientX, y: e.clientY });
    wrap('_down', (e) => ({ fn: 'down', ...ptr(e), vw: window.innerWidth, vh: window.innerHeight }));
    wrap('_moveEvt', (e) => ({ fn: 'move', ...ptr(e) }));
    wrap('_up', (e) => ({ fn: 'up', id: e.pointerId, ev: e.type }));
    wrap('_key', (e, down) => ({ fn: 'key', code: e.code, key: e.key, down, rep: e.repeat }));
    wrap('poll', () => ({ fn: 'poll' }));
    wrap('endFrame', () => ({ fn: 'endFrame' }));
    wrap('setEnabled', (v) => ({ fn: 'setEnabled', v }));
    wrap('releaseAll', () => ({ fn: 'releaseAll' }));
    wrap('setVirtualMove', (x, y) => ({ fn: 'setVirtualMove', x, y }));
    for (const [id, name] of [['bJump', 'jump'], ['bPause', 'pause']]) {
      const b = document.getElementById(id);
      inp.bindButton(b, name);
      // Après les écouteurs de bindButton (même élément, ajoutés ensuite) : état relevé après leur effet.
      b.addEventListener('pointerdown', (e) => rec({ fn: 'btnDown', name, id: e.pointerId, pt: e.pointerType }));
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, (e) => rec({ fn: 'btnUp', name, id: e.pointerId, ev: t }));
    }
    rec({ fn: 'init', vw: window.innerWidth, vh: window.innerHeight, R: inp.R });
    return true;
  };
}

// ---------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(HARNESS, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }));
await page.goto(HARNESS);
await page.addScriptTag({ content: `(${PAGE_SETUP.toString()})();` });
const cdp = await ctx.newCDPSession(page);

// Une image du navigateur entre deux gestes : les pointermove alignés sur l'image sont livrés un par un.
const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
const touches = new Map();
const touch = async (type) => {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.entries()].map(([id, [x, y]]) => ({ id, x, y })) });
  await frame();
};
const T = {
  start: async (id, x, y) => { touches.set(id, [x, y]); await touch('touchStart'); },
  move: async (id, x, y) => { touches.set(id, [x, y]); await touch('touchMove'); },
  end: async (id) => {
    // DevTools (Chrome du Mac, constaté sur le relevé) : touchEnd lève les points listés (liste vide : tous) ; un
    // touchMove sans un point ne le lève pas.
    const p = touches.get(id);
    touches.delete(id);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: touches.size ? [{ id, x: p[0], y: p[1] }] : [] });
    await frame();
  },
  cancel: async () => { touches.clear(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await frame(); },
};
const M = {
  down: async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await frame(); },
  move: async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }); await frame(); },
  up: async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); await frame(); },
};
// Touches : code physique et caractère produit séparés (une disposition AZERTY donne « z » sur le code KeyW).
const KEYS = {
  KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyQ: ['q', 81], KeyZ: ['z', 90], KeyE: ['e', 69], KeyP: ['p', 80], KeyM: ['m', 77], KeyR: ['r', 82],
  KeyF: ['f', 70], KeyC: ['c', 67], KeyH: ['h', 72], KeyL: ['l', 76], Space: [' ', 32], Tab: ['Tab', 9], Escape: ['Escape', 27], Enter: ['Enter', 13],
  ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
  ControlLeft: ['Control', 17], ControlRight: ['Control', 17], AltLeft: ['Alt', 18], AltRight: ['Alt', 18], ShiftLeft: ['Shift', 16], ShiftRight: ['Shift', 16],
};
const key = async (code, down, { key: k, repeat = false } = {}) => {
  const [defKey, vk] = KEYS[code];
  const keyName = k ?? defKey;
  const text = keyName.length === 1 && down ? keyName : undefined;
  await cdp.send('Input.dispatchKeyEvent', {
    type: down ? (text ? 'keyDown' : 'rawKeyDown') : 'keyUp', code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, autoRepeat: repeat, ...(text ? { text, unmodifiedText: text } : {}),
  });
  await frame();
};
const K = { down: (c, o) => key(c, true, o), up: (c, o) => key(c, false, o), tap: async (c, o) => { await key(c, true, o); await key(c, false, o); } };
const call = (fn, ...a) => page.evaluate(([f, args]) => window.__inp[f](...args), [fn, a]);
const poll = () => call('poll');
const endFrame = () => call('endFrame');
// Une image du jeu (game.update) : input.poll() au début, input.endFrame() à la fin.
const tick = async () => { await poll(); await endFrame(); };
const btn = async (id, fid = 40) => {
  const bb = await page.locator(`#${id}`).boundingBox();
  await T.start(fid, bb.x + bb.width / 2, bb.y + bb.height / 2);
  return async () => T.end(fid);
};

const scenarios = [
  {
    id: 'joy-simple', desc: 'joystick dans sa zone : doigt posé, petits déplacements sous le rayon (58 px), images du jeu, doigt levé',
    run: async () => {
      await T.start(1, 150, 300); await tick();
      await T.move(1, 170, 300); await tick();
      await T.move(1, 150, 262); await tick();
      await T.move(1, 181.5, 271.25); await tick();
      await T.move(1, 150.25, 300.75); await tick();
      await T.end(1); await tick();
    },
  },
  {
    id: 'joy-flottant', desc: 'joystick flottant : au-delà du rayon la base suit le doigt (rebasage), retour, diagonales, sortie de la zone en cours de geste',
    run: async () => {
      await T.start(2, 120, 320); await tick();
      await T.move(2, 300, 320); await tick();
      await T.move(2, 330.5, 250.5); await tick();
      await T.move(2, 200, 330); await tick();
      await T.move(2, 610, 40); await tick(); // hors de la zone : le geste garde le joystick
      await T.move(2, 590, 60); await tick();
      await T.end(2); await tick();
    },
  },
  {
    id: 'hors-zone', desc: 'doigts hors de la zone du joystick (x ≥ 45 % ou y ≤ 30 %) : pointeur de regard (look × 1,25 au doigt)',
    run: async () => {
      await T.start(3, 500, 300); await T.move(3, 520, 290); await T.move(3, 530.5, 310.25); await tick();
      await T.end(3); await tick();
      await T.start(4, 100, 100); await T.move(4, 90, 110); await tick();
      await T.end(4); await tick();
    },
  },
  {
    id: 'limites-zone', desc: 'bords de la zone en 844 × 390 : x < 379,8 et y > 117 (inégalités strictes)',
    run: async () => {
      for (const [x, y] of [[379.7, 300], [379.8, 300], [379.9, 300], [100, 117], [100, 117.5], [100, 116.9], [0, 389], [0.5, 389.5]]) {
        await T.start(5, x, y); await tick();
        await T.end(5); await tick();
      }
    },
  },
  {
    id: 'deux-doigts', desc: 'deux doigts : joystick à gauche, regard à droite, gestes entrelacés ; un troisième doigt dans la zone pendant que le joystick est pris (regard s’il est libre), puis reprise du joystick',
    run: async () => {
      await T.start(6, 140, 300); await T.start(7, 600, 200); await tick();
      await T.move(6, 160, 280); await T.move(7, 640, 180); await tick();
      await T.start(8, 200, 330); await tick(); // zone, joystick déjà pris, regard déjà pris : ignoré
      await T.move(8, 210, 320); await tick();
      await T.end(7); await tick();
      await T.start(9, 220, 300); await T.move(9, 230, 310); await tick(); // zone, joystick pris, regard libre : regard
      await T.end(6); await tick();
      await T.end(8); await T.end(9); await tick();
      await T.start(10, 80, 250); await T.move(10, 60, 230); await tick();
      await T.end(10); await tick();
    },
  },
  {
    id: 'souris', desc: 'souris dans la zone : jamais le joystick (pointerType mouse), regard × 1',
    run: async () => {
      await M.down(150, 300); await M.move(170, 290); await M.move(171.5, 280.5); await tick();
      await M.up(171.5, 280.5); await tick();
      await M.down(600, 100); await M.move(610, 90); await tick();
      await M.up(610, 90); await tick();
    },
  },
  {
    id: 'clavier', desc: 'clavier : flèches et WASD (codes physiques), diagonale normalisée, Ctrl gauche 0,5, Alt gauche 0,25 (prioritaire), touches de droite sans effet, avant + arrière, actions (Espace, Échap, Tab, P, M, E, Maj), répétition automatique',
    run: async () => {
      await K.down('KeyW'); await tick();
      await K.down('KeyD'); await tick();
      await K.down('ControlLeft'); await tick();
      await K.down('AltLeft'); await tick();
      await K.up('ControlLeft'); await tick();
      await K.up('AltLeft'); await tick();
      await K.down('ControlRight'); await K.down('AltRight'); await tick();
      await K.up('ControlRight'); await K.up('AltRight'); await K.up('KeyD'); await tick();
      await K.down('KeyS'); await tick(); // avant + arrière : nul, move remis à zéro
      await K.up('KeyW'); await K.up('KeyS'); await tick();
      await K.down('ArrowUp'); await K.down('ArrowLeft'); await tick();
      await K.down('ArrowLeft', { repeat: true }); await tick();
      await K.up('ArrowUp'); await K.up('ArrowLeft'); await tick();
      await K.down('ArrowDown'); await K.down('ArrowRight'); await K.down('ControlLeft'); await tick();
      await K.up('ArrowDown'); await K.up('ArrowRight'); await K.up('ControlLeft'); await tick();
      await K.down('KeyA'); await tick(); await K.up('KeyA'); await tick();
      await K.down('Space'); await poll(); await K.down('Space', { repeat: true }); await endFrame(); await K.down('Space', { repeat: true }); await tick(); await K.up('Space'); await tick();
      for (const c of ['Escape', 'Tab', 'KeyP', 'KeyM', 'KeyE', 'KeyF', 'Enter', 'KeyQ', 'KeyR', 'KeyC', 'KeyH', 'KeyL']) { await K.down(c); await poll(); await K.up(c); await endFrame(); }
      await K.down('ShiftLeft'); await K.down('KeyW'); await tick(); await K.up('ShiftLeft'); await K.up('KeyW'); await tick();
    },
  },
  {
    id: 'azerty', desc: 'disposition AZERTY simulée : le code physique compte, pas le caractère (KeyW donne « z », KeyA donne « q », KeyQ donne « a », KeyZ donne « w »)',
    run: async () => {
      await K.down('KeyW', { key: 'z' }); await tick();
      await K.down('KeyA', { key: 'q' }); await tick();
      await K.up('KeyW', { key: 'z' }); await K.up('KeyA', { key: 'q' }); await tick();
      await K.down('KeyZ', { key: 'w' }); await tick(); await K.up('KeyZ', { key: 'w' }); await tick();
      await K.down('KeyQ', { key: 'a' }); await poll(); await K.up('KeyQ', { key: 'a' }); await endFrame();
    },
  },
  {
    id: 'joy-clavier', desc: 'joystick actif : le clavier ne change pas move (poll ne lit les touches que sans joystick) ; doigt levé, touches reprises',
    run: async () => {
      await K.down('KeyW'); await tick();
      await T.start(11, 150, 300); await T.move(11, 175, 300); await tick();
      await K.down('KeyA'); await tick();
      await T.end(11); await tick();
      await K.up('KeyW'); await K.up('KeyA'); await tick();
    },
  },
  {
    id: 'desactive', desc: 'commandes désactivées (téléphone, pause, dialogue) : tout relâché, gestes ignorés, touches non retenues (seules phone, pause, map comptent), bouton pause actif, bouton SAUT ignoré, répétition après réactivation ignorée, appui gardé dans pressed après réactivation',
    run: async () => {
      await T.start(12, 150, 300); await T.move(12, 180, 280); await K.down('KeyD'); await tick();
      await call('setEnabled', false); await tick();
      await T.move(12, 190, 270); await tick();
      await T.end(12); await tick();
      await T.start(13, 150, 300); await tick(); await T.end(13); await tick();
      await K.down('KeyW'); await poll();
      await K.down('Escape'); await K.down('Tab'); await K.down('KeyM'); await K.down('Space'); await K.down('KeyE'); await poll();
      const upJ = await btn('bJump', 41); await poll(); await upJ();
      const upP = await btn('bPause', 42); await poll(); await upP(); await poll();
      await call('setEnabled', false); // même valeur : rien n'est relâché
      await call('setEnabled', true); await poll();
      await K.down('KeyW', { repeat: true }); await poll();
      await K.up('KeyW'); await K.up('Escape'); await K.up('Tab'); await K.up('KeyM'); await K.up('Space'); await K.up('KeyE'); await K.up('KeyD'); await tick();
      await K.down('KeyW'); await K.down('KeyW', { repeat: true }); await tick(); await K.up('KeyW'); await tick();
    },
  },
  {
    id: 'boutons', desc: 'boutons SAUT et pause tenus au doigt pendant que l’autre doigt tient le joystick ; relâchement (capture du pointeur)',
    run: async () => {
      await T.start(14, 150, 300); await T.move(14, 150, 250); await tick();
      const up = await btn('bJump', 15); await poll(); await T.move(15, 790, 335); await poll(); await endFrame(); await tick();
      await up(); await tick();
      await T.move(14, 100, 300); await tick();
      const up2 = await btn('bPause', 16); await tick(); await up2(); await tick();
      await T.end(14); await tick();
    },
  },
  {
    id: 'releche', desc: 'releaseAll (carte ouverte, fenêtre quittée) pendant un geste et des touches ; geste continué sans effet',
    run: async () => {
      await T.start(17, 150, 300); await T.move(17, 120, 330); await K.down('KeyW'); await K.down('Space'); await poll();
      await call('releaseAll'); await poll();
      await T.move(17, 130, 320); await tick();
      await T.end(17); await K.up('KeyW'); await K.up('Space'); await tick();
    },
  },
  {
    id: 'virtuel', desc: 'déplacement virtuel des tests (setVirtualMove) : gardé par poll sans touche ni joystick ; remis à zéro par 0, 0',
    run: async () => {
      await call('setVirtualMove', 0.3, 0.8); await tick();
      await call('setVirtualMove', 1.2, -0.9); await tick();
      await call('setVirtualMove', 0, 0); await tick();
      await call('setVirtualMove', 0.5, 0.5); await K.down('KeyS'); await tick(); await K.up('KeyS'); await tick();
    },
  },
  {
    id: 'annule', desc: 'geste annulé par le système (touchCancel → pointercancel) en plein joystick',
    run: async () => {
      await T.start(18, 150, 300); await T.move(18, 160, 290); await tick();
      await T.cancel(); await tick();
    },
  },
  {
    id: 'joy-cercle', desc: 'joystick tiré en cercle au-delà du rayon (48 déplacements à coordonnées fractionnaires) : rebasages successifs, arrondis de Math.hypot',
    run: async () => {
      await T.start(21, 200.3, 260.7); await tick();
      for (let i = 1; i <= 48; i++) {
        const a = i * 0.37;
        await T.move(21, 200.3 + Math.round(93.7 * Math.cos(a) * 8) / 8 + i * 0.61, 260.7 + Math.round(71.3 * Math.sin(a) * 8) / 8);
        if (i % 4 === 0) await tick();
      }
      await T.end(21); await tick();
    },
  },
  {
    id: 'limites-zone-840', viewport: { width: 840, height: 390 }, desc: 'viewport 840 × 390 : 45 % de la largeur vaut exactement 378 (un doigt à x = 378 n’est pas dans la zone)',
    run: async () => {
      for (const [x, y] of [[378, 300], [377.875, 300], [378.125, 300]]) {
        await T.start(22, x, y); await tick();
        await T.end(22); await tick();
      }
    },
  },
  {
    id: 'desactive-suite', desc: 'commandes désactivées, suite : regard accumulé puis désactivation (poll l’efface), déplacement virtuel effacé par poll, bouton pause tenu pendant un second setEnabled(false) (rien relâché), setEnabled(true) répété avec une touche tenue (rien relâché)',
    run: async () => {
      await T.start(23, 600, 200); await T.move(23, 620, 190); await call('setEnabled', false); await poll(); await endFrame();
      await T.end(23); await call('setEnabled', true); await tick();
      await call('setEnabled', false); await call('setVirtualMove', 0.4, 0.6); await poll(); await endFrame();
      const upP = await btn('bPause', 24); await poll(); await call('setEnabled', false); await poll(); await endFrame(); await upP(); await tick();
      await call('setEnabled', true); await call('setVirtualMove', 0, 0); await K.down('KeyW'); await tick(); await call('setEnabled', true); await poll(); await endFrame(); await K.up('KeyW'); await tick();
    },
  },
  {
    id: 'petit-ecran', viewport: { width: 667, height: 308 }, desc: 'viewport 667 × 308 : zone x < 300,15 et y > 92,4, joystick au bord',
    run: async () => {
      for (const [x, y] of [[300.1, 200], [300.2, 200], [50, 92.4], [50, 92.5]]) {
        await T.start(19, x, y); await tick();
        await T.end(19); await tick();
      }
      await T.start(20, 10, 300); await T.move(20, 2, 307); await T.move(20, 140, 200); await tick();
      await T.end(20); await tick();
    },
  },
];

const doc = { schema: 'strides.oracle.cso_input/1', source: ['src/core/input.js'], generator: 'scripts/unreal/export-cso-input.mjs',
  doc: 'Input du jeu web soumis à de vrais événements synthétiques (DevTools) sur une surface de test : par scénario, chaque appel reçu par l’instance (c : fn = init, down, move, up, key, btnDown, btnUp, poll, endFrame, setEnabled, releaseAll, setVirtualMove ; id = pointerId, pt = pointerType, x / y = clientX / clientY, vw / vh = fenêtre ; code = KeyboardEvent.code, key = caractère, down, rep = repeat) et l’état juste après (s : mv = move [x, y, mag], km = keyMove, vi = _virtual, lk = look [dx, dy], held, pressed, keys triés, en = enabled, joy = [id, ox, oy, x, y], lp = lookPtr [id, x, y], el = élément du joystick [active, left, top (px, null au repos), translation du bouton x, y (px)]). left, top et translation sont relus dans le style de l’élément (sérialisation CSS du navigateur, arrondie).',
  scenarios: [] };
for (const sc of scenarios) {
  await page.setViewportSize(sc.viewport || { width: 844, height: 390 });
  touches.clear();
  await page.evaluate(() => window.__setup());
  await sc.run();
  // Doigts restés posés (aucun ici) : relevé complet seulement si la page n'a pas d'erreur.
  const log = await page.evaluate(() => window.__log);
  doc.scenarios.push({ id: sc.id, desc: sc.desc, viewport: sc.viewport || { width: 844, height: 390 }, log });
  const calls = log.reduce((m, e) => ((m[e.c.fn] = (m[e.c.fn] || 0) + 1), m), {});
  console.log(`${sc.id} : ${log.length} appels ${JSON.stringify(calls)}`);
}
if (errors.length) {
  console.log('erreurs de page :', errors);
  process.exitCode = 1;
}
await ctx.close();
await browser.close();
if (!errors.length) {
  const { scenarios: list, ...head } = doc;
  const text = JSON.stringify(head).replace(/}$/, ',"scenarios":[\n') + list.map((x) => JSON.stringify(x)).join(',\n') + '\n]}\n';
  if (existsSync(OUT) && readFileSync(OUT, 'utf8') === text) console.log('cso_input.json inchangé');
  else {
    writeFileSync(OUT, text);
    console.log('écrit :', OUT, `(${list.length} scénarios, ${list.reduce((a, x) => a + x.log.length, 0)} appels)`);
  }
}
