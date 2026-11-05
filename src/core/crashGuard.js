// Relance après un arrêt brutal. Sur iPhone, Safari arrête une page qui dépasse la mémoire permise (« Un problème
// récurrent est survenu sur … ») ; la page relancée retrouvait la même sauvegarde, donc les mêmes modèles, et
// s'arrêtait de nouveau. Une marque est posée tant que la page est affichée et retirée quand elle est quittée ou
// masquée (onglet fermé, autre application, verrouillage) : si elle est encore là au lancement suivant, la partie
// précédente s'est arrêtée brutalement, et le jeu démarre en mode sûr (voir Game.boot). La marque retient aussi
// l'étape atteinte (chargement, écran titre, partie et sa durée), affichée après un arrêt pour en trouver la cause.
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

// À appeler une fois, au lancement. crashes : nombre d'arrêts brutaux consécutifs juste avant ce lancement ;
// last : étape atteinte par le lancement arrêté (null s'il n'y en a pas eu).
export function startCrashGuard(now = Date.now()) {
  const prev = read();
  const crashed = !!prev && now - prev.t < WINDOW_MS;
  const crashes = crashed ? (prev.n || 0) + 1 : 0;
  let n = crashes;
  let stage = 'démarrage';
  let shown = true;
  const mark = () => write({ t: Date.now(), n, stage });
  const clear = () => write(null);
  mark();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      shown = document.visibilityState !== 'hidden';
      if (shown) mark();
      else clear();
    });
    addEventListener('pagehide', () => {
      shown = false;
      clear();
    });
    addEventListener('pageshow', () => {
      shown = true;
      mark();
    });
  }
  const stable = setTimeout(() => {
    n = 0;
    if (shown) mark();
  }, STABLE_MS);
  return {
    crashes,
    last: crashed ? prev.stage || null : null,
    // Étape en cours (écrite aussitôt : elle reste lisible si la page est arrêtée juste après).
    stage(s) {
      stage = s;
      if (shown) mark();
    },
    stop: () => (clearTimeout(stable), clear()),
  };
}
