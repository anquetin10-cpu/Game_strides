// Fonctions de calcul utilisées par le code repris de Jumping League Sim (mêmes définitions que son core/util/math).
export { clamp, lerp, smoothstep, damp } from '../../core/math.js';
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
