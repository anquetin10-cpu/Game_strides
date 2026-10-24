// Cheval de sport réaliste (Selle Français, 1,65 m au garrot) : maillage lisse généré hors ligne à partir d'une
// anatomie en champ de distance (scripts/horse), robe physique (reflet satiné, marques), crins, sellerie complète,
// et locomotion procédurale fidèle aux allures réelles (voir ./horse/anim.js).
import { buildHorseMesh, setHorseLod } from './horse/mesh.js';

export { COATS } from './horse/coat.js';
export { animateHorse, gaitIndex, hoofWorldPosition } from './horse/anim.js';
export { setHorseLod };

/**
 * opts : { coat: clé de COATS ou objet { body, mane, legs, muzzle, hoof }, blaze, socks: [AG, AD, PG, PD],
 *          saddle (false → licol sans selle), pad, padTrim, boots, seed }
 * Renvoie { mesh, bones } : os principaux body, neck, head, tail, tail2, flU/flL… ; ancres saddle (assise),
 * leadAnchor (anneau du licol), reinL/reinR (mains du cavalier).
 */
export function createHorseMesh(opts = {}) {
  const { mesh, bones } = buildHorseMesh(opts);
  return { mesh, bones };
}
