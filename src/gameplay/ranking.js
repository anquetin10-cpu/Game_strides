// Classement d'une épreuve de CSO (barème A au chrono) : concurrents simulés du jeu et tri officiel.
import { FIRST_NAMES, LAST_NAMES } from './data.js';
import { mulberry32 } from '../core/math.js';

export const HORSE_NAMES = ['Quartz du Val', 'Ubris de Mai', 'Vendôme', 'Tiara du Ter', 'Diamant Rouge', 'Saphir des Bois', 'Oural', 'Ninja Z', 'Belle d’Auge', 'Utopie', 'Kalimba', 'Rubis Blanc', 'Galaxie', 'Hermès du Lac'];

// Classement simulé des autres engagés (barème A au chrono).
export function simulateField(cls, seed, n = 14) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rnd();
    let faults = r < 0.34 ? 0 : r < 0.68 ? 4 : r < 0.86 ? 8 : r < 0.95 ? 12 : 16;
    if (cls.id === 'am2' && faults > 0 && rnd() < 0.25) faults -= 4;
    const t = cls.ta - 4 + (rnd() + rnd() + rnd() - 1.5) * 4.2 + faults * 0.15;
    const timeFaults = Math.max(0, Math.ceil(t - cls.ta - 1e-9));
    const rider = `${FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)][0]}. ${LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]}`;
    out.push({ rider, horse: HORSE_NAMES[(i + Math.floor(seed)) % HORSE_NAMES.length], faults: faults + timeFaults, time: Math.round(t * 100) / 100 });
  }
  return out;
}

export function rankResults(list) {
  return [...list].sort((a, b) => a.faults - b.faults || a.time - b.time);
}
