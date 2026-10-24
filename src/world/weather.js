// Météo et marées de la côte normande, calculées (déterministes) à partir du jour et de l'heure de jeu :
// couverture nuageuse, averses, température, vent, hauteur d'eau, pleines et basses mers, coefficients.
import { smoothstep, clamp } from '../core/math.js';

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

// Intensité de pluie visée (0 à 1) : averses intermittentes les jours couverts.
export function rainTarget(day, hour) {
  if (dayCover(day) < 0.72) return 0;
  return smoothstep(0.35, 0.7, Math.sin(hour * 1.3 + day * 2.1) * 0.5 + 0.5);
}

// Température de l'air (°C) : minimum vers 6 h, maximum vers 15 h ; nuages = journée plus fraîche, nuit plus douce.
export function temperature(day, hour) {
  const c = dayCover(day);
  const tmax = 22.5 - c * 6.5 + (hash(day) - 0.5) * 3;
  const tmin = 12 + c * 2.5 + (hash(day + 50) - 0.5) * 2;
  const x = mod(hour - 6, 24);
  const k = x < 9 ? 0.5 - 0.5 * Math.cos((Math.PI * x) / 9) : 0.5 + 0.5 * Math.cos((Math.PI * (x - 9)) / 15);
  return tmin + (tmax - tmin) * k - rainTarget(day, hour) * 2.5;
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
  const c = dayCover(day), r = rainTarget(day, hour);
  if (r > 0.5) return 'Averses';
  if (r > 0.08) return 'Pluie faible';
  if (night) return c < 0.5 ? 'Nuit claire' : 'Nuit couverte';
  if (c < 0.35) return 'Ensoleillé';
  if (c < 0.55) return 'Éclaircies';
  if (c < 0.7) return 'Nuageux';
  return 'Couvert';
}

// ---------- Marée ----------
// Onde semi-diurne lunaire (M2) et solaire (S2) : vives-eaux quand elles sont en phase (tous les 14,8 jours),
// mortes-eaux sinon. L'harmonique M4 allonge la pleine mer et raccourcit la basse mer (« tenue du plein »
// de la baie de Seine). Hauteurs ramenées à l'échelle de la plage du jeu (mètres autour du niveau moyen).
const M2 = 12.4206012, S2 = 12;
const W2 = (2 * Math.PI) / M2, WS = (2 * Math.PI) / S2;
const PHASE = 4.2; // heure de la pleine mer du jour 0
const A2 = 0.45, AS = 0.14, A4 = 0.07;

// t : heures de jeu écoulées depuis le début (jour × 24 + heure).
export function tideLevel(t) {
  const a = W2 * (t - PHASE);
  return A2 * Math.cos(a) + AS * Math.cos(WS * (t - PHASE)) - A4 * Math.cos(2 * a) + A4 * 0.5;
}

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
