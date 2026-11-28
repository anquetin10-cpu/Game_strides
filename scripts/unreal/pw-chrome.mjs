// Préchargement pour les captures de référence du jeu web (preuves de parité) : Playwright utilise le Google Chrome déjà
// installé sur le Mac au lieu de télécharger son propre navigateur (disque compté, aucun téléchargement).
// Usage : node --import ./scripts/unreal/pw-chrome.mjs tests/e2e/cso-shots.mjs
// Autre exécutable : PW_CHROME=/chemin/vers/chrome. Les scripts de tests/e2e ne sont pas modifiés.
import { chromium } from 'playwright';

const exe = process.env.PW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const launch = chromium.launch.bind(chromium);
chromium.launch = (opts = {}) => launch({ executablePath: exe, ...opts });
