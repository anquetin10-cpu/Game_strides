// Parcours de CSO du Pôle International, dessiné comme un vrai tracé : on trace d'abord la ligne du cavalier (longues
// lignes droites et grandes courbes de 13 m de rayon au moins, que le cheval suit au galop de concours sans ralentir),
// puis on pose chaque obstacle dans l'axe de cette ligne. Obstacle isolé ou premier élément d'une combinaison : 18 m
// au moins d'approche en ligne droite, 12 m au moins de réception dégagée avant le tournant suivant. Combinaisons :
// une foulée 7,8 m, deux foulées 11,4 m ; lignes sur une même droite en n foulées : 4,2 + n × 3,56 m (centre à centre,
// à la cadence de référence de 6,2 m/s). Les règles sont vérifiées par courseLint.js (tests unitaires). Les obstacles,
// le plan, l'aide de tracé, la longueur du parcours (temps accordé) et le pilote des tests viennent tous de ces données.
//
// Repère : centre de la carrière (120 × 76 m), x vers l’est, z vers le sud ; cap h : direction (sin h, cos h).
// Entrée de piste au milieu du grand côté sud (+z), tribunes au nord (-z, côté mer). 8 obstacles numérotés, 10 sauts
// (un double à deux foulées, un double à une foulée) :
//   Entrée → légère courbe à gauche → départ → 1 (vertical, en diagonale vers le nord-ouest) → grande courbe à main
//   droite → ligne des tribunes vers l'est : 2 (oxer) – 3 (vertical, 5 foulées) → demi-volte à main droite à l'est →
//   ligne du milieu vers l'ouest : double 4A (vertical) – 4B (oxer, deux foulées), 5 (mur, 4 foulées) → changement de
//   main par une grande demi-volte à gauche à l'ouest → ligne du sud vers l'est, devant l'entrée : double 6A (vertical)
//   – 6B (oxer, une foulée), 7 (vertical, 6 foulées), 8 (oxer large, 5 foulées) → arrivée, place pour ralentir.
import { POLE } from '../world/sites.js';

export const CSO_DESIGN = {
  // Point d'accueil de l'entrée de piste (CSO_GATE, obstacles.js), cap au nord : l'abord jusqu'à la ligne de départ
  // part de là (commandes avant ['M', 'start'], hors du tracé chronométré).
  start: { x: POLE.entrance.x - POLE.arena.x, z: POLE.arena.d / 2 - 5, h: Math.PI },
  // F d : ligne droite ; L/R r a : courbe à gauche/droite (pour le cavalier) de rayon r sur a degrés ; J : obstacle ;
  // M : ligne de départ ou d'arrivée.
  cmds: [
    ['L', 13, 45], ['F', 7], ['M', 'start'], ['F', 11], ['J', '1', 'v'], ['F', 14],
    ['R', 17.7, 135],
    ['F', 18], ['J', '2', 'o', 1.3], ['F', 22.0], ['J', '3', 'v'], ['F', 12],
    ['R', 14.5, 180],
    ['F', 18], ['J', '4A', 'v'], ['F', 11.4], ['J', '4B', 'o', 1.3], ['F', 18.4], ['J', '5', 'w'], ['F', 29],
    ['L', 14, 180],
    ['F', 18], ['J', '6A', 'v'], ['F', 7.8], ['J', '6B', 'o', 1.2], ['F', 25.6], ['J', '7', 'v'], ['F', 22.0], ['J', '8', 'o', 1.5],
    ['F', 10], ['M', 'finish'],
  ],
  // Profil des hauteurs autour de la hauteur de l'épreuve (m) : abords de début plus faciles, fin plus exigeante.
  profile: { 1: -0.05, '4A': -0.05, 8: 0.05 },
};

// Trace la ligne du cavalier : points tous les ~0,5 m { x, z, h, s }, obstacles et lignes posés dessus, tronçons
// (segs : lignes droites F et courbes L/R, avec rayon et angle). Les commandes placées avant la ligne de départ
// (['M', 'start']) décrivent l'abord depuis l'entrée de piste : elles forment `leadIn` (abscisses négatives), hors du
// tracé chronométré `pts`, qui commence à la ligne de départ (s = 0). length : du départ à l'arrivée.
export function traceCourse(design = CSO_DESIGN, step = 0.5) {
  let { x, z, h } = design.start;
  let s = 0;
  const pts = [{ x, z, h, s }];
  const fences = [];
  const marks = {};
  const segs = [];
  for (const c of design.cmds) {
    if (c[0] === 'F') {
      const n = Math.max(1, Math.round(c[1] / step));
      segs.push({ kind: 'F', s0: s, s1: s + c[1], h });
      for (let i = 0; i < n; i++) {
        x += (Math.sin(h) * c[1]) / n;
        z += (Math.cos(h) * c[1]) / n;
        s += c[1] / n;
        pts.push({ x, z, h, s });
      }
    } else if (c[0] === 'L' || c[0] === 'R') {
      const a = (c[2] * Math.PI) / 180;
      const len = c[1] * a;
      const n = Math.max(2, Math.round(len / step));
      segs.push({ kind: c[0], r: c[1], a: c[2], s0: s, s1: s + len, h0: h });
      // Repère x est, z sud (vu du dessus, nord en haut) : un virage à droite du cavalier fait décroître le cap.
      const sgn = c[0] === 'L' ? 1 : -1;
      for (let i = 0; i < n; i++) {
        h += (sgn * a) / n;
        x += (Math.sin(h) * len) / n;
        z += (Math.cos(h) * len) / n;
        s += len / n;
        pts.push({ x, z, h, s });
      }
    } else if (c[0] === 'J') fences.push({ label: c[1], kind: c[2], spread: c[3] || 0, x, z, rot: h, s });
    else if (c[0] === 'M') marks[c[1]] = { x, z, rot: h, s };
  }
  const s0 = marks.start ? marks.start.s : 0;
  const at = (o) => ({ ...o, s: o.s - s0 });
  const eps = 1e-6;
  for (const k of Object.keys(marks)) marks[k] = at(marks[k]);
  return {
    pts: pts.filter((p) => p.s >= s0 - eps).map(at),
    leadIn: pts.filter((p) => p.s <= s0 + eps).map(at),
    fences: fences.map(at),
    marks,
    segs: segs.map((g) => ({ ...g, s0: g.s0 - s0, s1: g.s1 - s0 })),
    length: marks.finish ? marks.finish.s : s - s0,
  };
}

export const CSO_TRACE = traceCourse();
// Numéros des obstacles d'un tracé, dans l'ordre (une combinaison 4A – 4B compte pour un) : textes de présentation.
export const courseNumbers = (trace = CSO_TRACE) => [...new Set(trace.fences.map((f) => f.label.replace(/[A-C]$/, '')))];

// Hauteurs des éléments pour une épreuve de hauteur `h` (m), dans l'ordre du parcours.
export const csoHeights = (h) => CSO_TRACE.fences.map((f) => Math.round((h + (CSO_DESIGN.profile[f.label] || 0)) * 100) / 100);
