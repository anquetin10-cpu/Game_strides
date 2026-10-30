import './styles.css';
import { LANG, langChosen, chooseLang } from './core/i18n.js';

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

// Premier lancement : choix de la langue (français / anglais) avant de charger le jeu ; modifiable ensuite dans
// l'écran titre et les réglages.
function askLang() {
  // Tests automatisés (?autostart) : langue par défaut ou ?lang=, sans écran de choix.
  if (langChosen() || /[?&]autostart\b/.test(location.search)) return Promise.resolve(LANG);
  return new Promise((done) => {
    const el = document.createElement('div');
    el.className = 'lang-picker';
    el.innerHTML = `<div class="lang-card"><div class="lang-brand">STRIDES <b>GRAND TOUR</b></div>
      <p>Choisis ta langue<br><span>Choose your language</span></p>
      <div class="lang-btns"><button data-id="lang-fr" data-lang="fr">Français</button><button data-id="lang-en" data-lang="en">English</button></div></div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-lang]');
      if (!b) return;
      chooseLang(b.dataset.lang);
      el.remove();
      done(b.dataset.lang);
    });
    document.body.appendChild(el);
  });
}

async function start() {
  markEmbedded();
  document.documentElement.lang = LANG;
  if (!webglAvailable()) {
    document.body.innerHTML = LANG === 'en'
      ? '<div style="color:#f4f3ef;font:500 16px Geist,Arial;padding:40px;text-align:center">Your browser does not support WebGL.<br>Try an up-to-date Safari or Chrome.</div>'
      : '<div style="color:#f4f3ef;font:500 16px Geist,Arial;padding:40px;text-align:center">Votre navigateur ne prend pas en charge WebGL.<br>Essayez Safari ou Chrome à jour.</div>';
    return;
  }
  await askLang();
  // Le jeu est chargé après le choix : ses textes calculés au chargement sont dans la bonne langue.
  const { Game } = await import('./game.js');
  // Attendre (brièvement) les polices pour les textures générées.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('600 40px Geist'), document.fonts.load('400 20px Geist'), document.fonts.load('500 20px "Geist Mono"')]),
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
  el.textContent = `${LANG === 'en' ? 'Startup error' : 'Erreur au démarrage'} : ${e.message}\n${e.stack || ''}`;
  document.body.appendChild(el);
});
