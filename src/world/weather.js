// Météo et marées de la côte normande, calculées (déterministes) à partir du jour et de l'heure de jeu :
// couverture nuageuse, averses, température, vent, hauteur d'eau, pleines et basses mers, coefficients.
import { smoothstep, clamp } from '../core/math.js';
import { t } from '../core/i18n.js';

// Niveaux de marée partagés avec les shaders (terrain) et la physique (profondeur d'eau).
export const TIDE_UNIFORMS = { tdLevel: { value: 0 }, tdWet: { value: 0 }, tdMark: { value: 0.3 } };

// Couverture nuageuse moyenne de chaque jour (cycle de 9 jours) ; au-delà de 0,72, journées à averses.
const COVERS = [0.38, 0.55, 0.28, 0.72, 0.46, 0.62, 0.33, 0.8, 0.5];
const mod = (a, n) => ((a % n) + n) % n;
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function dayCover(day) {
  return COVERS[mod(day, COVERS.length)];
}

// Couverture du moment : le ciel se charge (ou se dégage) vers le temps du lendemain entre 21 h et minuit.
export function coverAt(day, hour) {
  return dayCover(day) + (dayCover(day + 1) - dayCover(day)) * smoothstep(21, 24, hour);
}

// Intensité de pluie visée (0 à 1) : averses intermittentes les jours couverts, qui commencent après minuit et
// cessent avant (pas de saut au changement de jour).
export function rainTarget(day, hour) {
  if (dayCover(day) < 0.72) return 0;
  return smoothstep(0.35, 0.7, Math.sin(hour * 1.3 + day * 2.1) * 0.5 + 0.5) * smoothstep(0, 2, hour) * smoothstep(24, 22, hour);
}

// Température de l'air (°C) : minimum vers 6 h, maximum vers 15 h ; nuages = journée plus fraîche, nuit plus douce.
// Le soir refroidit vers le minimum du lendemain : la courbe est continue à minuit.
const tMax = (day) => 22.5 - dayCover(day) * 6.5 + (hash(day) - 0.5) * 3;
const tMin = (day) => 12 + dayCover(day) * 2.5 + (hash(day + 50) - 0.5) * 2;
export function temperature(day, hour) {
  const x = mod(hour - 6, 24);
  let t;
  if (x < 9) t = tMin(day) + (tMax(day) - tMin(day)) * (0.5 - 0.5 * Math.cos((Math.PI * x) / 9));
  else {
    const d = hour < 6 ? day - 1 : day; // après le maximum de 15 h (veille avant 6 h)
    t = tMin(d + 1) + (tMax(d) - tMin(d + 1)) * (0.5 + 0.5 * Math.cos((Math.PI * (x - 9)) / 15));
  }
  return t - rainTarget(day, hour) * 2.5;
}

// Vent du jour : secteur ouest dominant (brise de mer), plus fort les jours de grisaille.
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export function wind(day, hour = 12) {
  const c = dayCover(day);
  const kmh = Math.round(8 + c * 22 + hash(day + 7) * 8 + 4 * Math.sin((hour - 9) * 0.26));
  const deg = mod(250 + (hash(day + 13) - 0.5) * 90 + c * 20, 360);
  return { kmh: Math.max(3, kmh), deg, dir: DIRS[Math.round(deg / 45) % 8] };
}

export function conditionText(day, hour, night = hour < 6 || hour > 21.5) {
  const c = coverAt(day, hour), r = rainTarget(day, hour);
  if (r > 0.5) return t('Averses');
  if (r > 0.08) return t('Pluie faible');
  if (night) return c < 0.5 ? t('Nuit claire') : t('Nuit couverte');
  if (c < 0.35) return t('Ensoleillé');
  if (c < 0.55) return t('Éclaircies');
  if (c < 0.7) return t('Nuageux');
  return t('Couvert');
}

// ---------- Marée ----------
// Onde semi-diurne lunaire (M2) et solaire (S2) : vives-eaux quand elles sont en phase (tous les 14,8 jours),
// mortes-eaux sinon. L'harmonique M4 allonge la pleine mer et raccourcit la basse mer (« tenue du plein »
// de la baie de Seine). Hauteurs à l'échelle réelle (mètres autour du niveau moyen, qui est le zéro du jeu) : c'est la
// seule source de vérité, pour l'eau du jeu (mer, estran, profondeur) comme pour l'annuaire de l'app Météo.
const M2 = 12.4206012, S2 = 12;
const W2 = (2 * Math.PI) / M2, WS = (2 * Math.PI) / S2;
const PHASE = 4.2; // heure de la pleine mer du jour 0
const A2 = 2.7, AS = 0.84, A4 = 0.42;
// Niveaux extrêmes (pleine et basse mer des plus fortes vives-eaux) : bornes pour le décor de la plage et les tests.
export const TIDE_EXTREMES = { high: A2 + AS - A4 * 0.5, low: -(A2 + AS + A4 * 0.5) };

// t : heures de jeu écoulées depuis le début (jour × 24 + heure).
export function tideLevel(t) {
  const a = W2 * (t - PHASE);
  return A2 * Math.cos(a) + AS * Math.cos(WS * (t - PHASE)) - A4 * Math.cos(2 * a) + A4 * 0.5;
}

// Hauteur d'eau affichée (m au-dessus du zéro des cartes), comme dans un annuaire des marées de Trouville-Deauville :
// niveau moyen 4,6 m au-dessus du zéro des cartes ; marnage ~7 m en vives-eaux (pleine mer ~7,9 m, basse mer ~0,9 m),
// ~3,7 m en mortes-eaux. Simple changement d'origine du niveau du jeu (tideLevel) : mêmes mètres, même marée.
export const TIDE_REAL = { mean: 4.6 };
export const realTideHeight = (level) => TIDE_REAL.mean + level;

// Coefficient de marée (20 à 120, 95 = vives-eaux moyennes) selon l'accord des ondes M2 et S2.
export function tideCoef(t) {
  const amp = Math.hypot(A2 + AS * Math.cos((WS - W2) * (t - PHASE)), AS * Math.sin((WS - W2) * (t - PHASE)));
  return Math.round(clamp(30 + (85 * (amp - (A2 - AS))) / (2 * AS), 20, 120));
}

// Pleines (PM) et basses mers (BM) entre t0 et t0 + span heures.
export function tideEvents(t0, span = 24) {
  const out = [];
  const step = 0.05;
  let prev = tideLevel(t0 - step), cur = tideLevel(t0);
  for (let t = t0; t <= t0 + span; t += step) {
    const next = tideLevel(t + step);
    if (cur > prev && cur >= next) out.push({ type: 'PM', t, level: cur, coef: tideCoef(t) });
    else if (cur < prev && cur <= next) out.push({ type: 'BM', t, level: cur, coef: tideCoef(t) });
    prev = cur;
    cur = next;
  }
  return out;
}

// État courant pour le rendu : niveau, haut de la zone encore mouillée, laisse de mer (plus haute mer du dernier jour).
export function tideState(t) {
  const level = tideLevel(t);
  let wet = level;
  for (let k = 0.5; k <= 6; k += 0.5) wet = Math.max(wet, tideLevel(t - k));
  let mark = level;
  for (let k = 0; k <= 26; k += 0.5) mark = Math.max(mark, tideLevel(t - k));
  return { level, wet, mark, rising: tideLevel(t + 0.1) > level };
}

export const hhmm = (t) => {
  const h = mod(t, 24);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
};
