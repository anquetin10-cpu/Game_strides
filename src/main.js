import './styles.css';
import { Game } from './game.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function markEmbedded() {
  let embedded = false;
  try {
    embedded = window.self !== window.top;
  } catch {
    embedded = true;
  }
  // Dans le lecteur mobile, des boutons flottent au-dessus du haut de la page : on décale le HUD.
  if (embedded && matchMedia('(pointer: coarse)').matches) document.body.classList.add('embedded');
}

async function start() {
  markEmbedded();
  if (!webglAvailable()) {
    document.body.innerHTML = '<div style="color:#f4f3ef;font:500 16px Inter,Arial;padding:40px;text-align:center">Votre navigateur ne prend pas en charge WebGL.<br>Essayez Safari ou Chrome à jour.</div>';
    return;
  }
  // Attendre (brièvement) les polices pour les textures générées.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 40px "Barlow Condensed"'), document.fonts.load('italic 800 40px "Barlow Condensed"'), document.fonts.load('600 20px Inter')]),
      new Promise((r) => setTimeout(r, 1800)),
    ]);
  } catch {
    /* polices indisponibles : repli système */
  }
  const game = new Game();
  await game.boot();
}

start().catch((e) => {
  console.error(e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:20px;color:#fff;background:#300;padding:16px;z-index:999;white-space:pre-wrap;font:12px monospace';
  el.textContent = `Erreur au démarrage : ${e.message}\n${e.stack || ''}`;
  document.body.appendChild(el);
});
