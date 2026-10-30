// Langue du jeu (français ou anglais). Le texte source est le français : chaque texte affiché passe par t('…') (texte
// fixe) ou T`…${x}…` (gabarit), et la version anglaise est cherchée dans les dictionnaires src/i18n/en/*.js, dont les
// clés sont le texte français exact (gabarits : ${…} remplacés par {0}, {1}… dans l'ordre). Texte sans traduction :
// le français, et la clé est notée dans window.__i18nMissing (vérifié par les tests).
// La langue est choisie au premier lancement (main.js), puis dans l'écran titre ou les réglages : le changement
// recharge le jeu (sauvegarde faite), pour que tout — y compris les textes calculés au chargement, panneaux et
// enseignes du monde 3D — soit dans la nouvelle langue.
import common from '../i18n/en/common.js';
import story from '../i18n/en/story.js';
import story2 from '../i18n/en/story2.js';
import data from '../i18n/en/data.js';
import phone from '../i18n/en/phone.js';
import ui from '../i18n/en/ui.js';
import gameplay from '../i18n/en/gameplay.js';
import world from '../i18n/en/world.js';
import systems from '../i18n/en/systems.js';

export const LANGS = ['fr', 'en'];
const KEY = 'strides-lang';
const EN = Object.assign({}, common, story, story2, data, phone, ui, gameplay, world, systems);

function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function fromUrl() {
  try {
    return new URLSearchParams(location.search).get('lang');
  } catch {
    return null;
  }
}
const pick = (l) => (LANGS.includes(l) ? l : null);

// Langue courante (lecture en direct : `LANG` est une liaison vivante pour les modules qui l'importent).
export let LANG = pick(fromUrl()) || pick(stored()) || 'fr';
// Vrai si le joueur n'a encore jamais choisi (premier lancement, sans ?lang=).
export const langChosen = () => !!(pick(fromUrl()) || pick(stored()));

const missing = new Set();
// Texte anglais affiché → texte français d'origine (pour le pilote automatique des tests, qui lit les consignes en
// français) ; borné.
const frOf = new Map();
if (typeof window !== 'undefined') {
  window.__i18nMissing = missing;
  window.__i18nFr = (s) => frOf.get(s) ?? s;
}
const remember = (en, fr) => {
  if (LANG === 'fr' || en === fr) return en;
  if (frOf.size > 20000) frOf.clear();
  frOf.set(en, fr);
  return en;
};

const fill = (s, vals) => (vals && vals.length ? s.replace(/\{(\d+)\}/g, (m, i) => (i < vals.length ? String(vals[i]) : m)) : s);

function lookup(key) {
  if (LANG === 'fr') return key;
  const e = EN[key];
  if (e === undefined) {
    missing.add(key);
    return key;
  }
  return e;
}

// Texte fixe ; `vals` remplace {0}, {1}… (même rôle que les ${…} de T).
export function t(s, ...vals) {
  if (s == null || s === '') return s;
  return remember(fill(lookup(String(s)), vals), fill(String(s), vals));
}

// Gabarit : T`Obstacle n°${n} sur ${total}` → clé « Obstacle n°{0} sur {1} ».
export function T(strings, ...vals) {
  let key = strings[0];
  for (let i = 1; i < strings.length; i++) key += `{${i - 1}}${strings[i]}`;
  return remember(fill(lookup(key), vals), fill(key, vals));
}

// Choix de la langue avant le chargement du jeu (premier lancement) : sans rechargement.
export function chooseLang(l) {
  if (!pick(l)) return;
  LANG = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* stockage indisponible : choix valable pour cette session */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

// Changement en cours de partie : enregistre, puis recharge (la sauvegarde est faite par l'appelant).
export function switchLang(l) {
  if (!pick(l) || l === LANG) return;
  chooseLang(l);
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('lang')) {
      u.searchParams.set('lang', l);
      location.replace(u.toString());
      return;
    }
  } catch {
    /* adresse non modifiable */
  }
  location.reload();
}

// Nombres : virgule décimale en français, point en anglais.
export const num = (n, k = 1) => {
  const s = n.toFixed(k);
  return LANG === 'fr' ? s.replace('.', ',') : s;
};
// Entiers avec séparateur de milliers (« 14 850 » / « 14,850 »).
export const int = (n) => {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, LANG === 'fr' ? ' ' : ',');
  return n < 0 ? `-${s}` : s;
};
// Montant en euros (« 14 850 € » / « €14,850 »).
export const euros = (n) => (LANG === 'fr' ? `${int(n)} €` : `${n < 0 ? '-' : ''}€${int(Math.abs(n))}`);
// Heure (h décimale) : « 20 h 30 » / « 8:30 pm ».
export const hourText = (h) => {
  const H = Math.floor(h) % 24, m = Math.round((h % 1) * 60);
  if (LANG === 'fr') return `${H} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
  const h12 = H % 12 || 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${H < 12 ? 'am' : 'pm'}`;
};
