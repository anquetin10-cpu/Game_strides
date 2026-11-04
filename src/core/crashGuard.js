// Relance après un arrêt brutal. Sur iPhone, Safari arrête une page qui dépasse la mémoire permise (« Un problème
// récurrent est survenu sur … ») ; la page relancée retrouvait la même sauvegarde, donc les mêmes modèles, et
// s'arrêtait de nouveau. Une marque est posée tant que la page est affichée et retirée quand elle est quittée ou
// masquée (onglet fermé, autre application, verrouillage) : si elle est encore là au lancement suivant, la partie
// précédente s'est arrêtée brutalement, et le jeu démarre en mode sûr (voir Game.boot).
const KEY = 'strides-run-guard';
const WINDOW_MS = 6 * 3600e3; // marque plus ancienne : ignorée (appareil éteint pendant une partie, etc.)
const STABLE_MS = 3 * 60e3; // partie restée affichée aussi longtemps : les arrêts précédents ne comptent plus

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v.t === 'number' ? v : null;
  } catch {
    return null;
  }
}
function write(v) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible : pas de protection, rien d'autre ne change */
  }
}

// À appeler une fois, au lancement. crashes : nombre d'arrêts brutaux consécutifs juste avant ce lancement.
export function startCrashGuard(now = Date.now()) {
  const prev = read();
  const crashes = prev && now - prev.t < WINDOW_MS ? (prev.n || 0) + 1 : 0;
  let n = crashes;
  const mark = () => write({ t: Date.now(), n });
  const clear = () => write(null);
  mark();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? clear() : mark()));
    addEventListener('pagehide', clear);
    addEventListener('pageshow', mark);
  }
  const stable = setTimeout(() => {
    n = 0;
    if (read()) mark();
  }, STABLE_MS);
  return { crashes, stop: () => (clearTimeout(stable), clear()) };
}
