// Parcours de CSO du Pôle International, dessiné comme un vrai tracé : on trace d'abord la ligne du cavalier (lignes
// droites et grandes courbes de 10 à 12 m de rayon, que le cheval suit au galop sans pivoter), puis on pose chaque
// obstacle dans l'axe de cette ligne. Obstacle isolé : 17 m au moins d'approche en ligne droite (5 foulées de 3,5 m
// au galop de concours), 8 m au moins de réception dégagée avant le tournant suivant. Double : deux éléments alignés à
// 11,5 m (réception, deux foulées, nouvel appel). Les obstacles, le plan, l'aide de tracé, la longueur du parcours
// (temps accordé) et le pilote des tests viennent tous de ces mêmes données.
//
// Repère : centre de la carrière (120 × 76 m), x vers l’est, z vers le sud ; cap h : direction (sin h, cos h).
// Entrée de piste au milieu du grand côté sud (+z), tribunes au nord (-z, côté mer).
//   S → 1 (vertical, piste ouest, vers le nord) → à main droite : ligne 2 (oxer) – 3 (vertical, 4 foulées) le long des
//   tribunes → 4 (mur, en diagonale) → changement de main, à main gauche : double 5A (vertical) – 5B (oxer, deux
//   foulées) le long du côté sud → 6 (oxer, piste est, vers le nord) → 7 (vertical) → 8 (oxer large) → arrivée.

export const CSO_DESIGN = {
  start: { x: -50, z: 26, h: Math.PI },
  // F d : ligne droite ; L/R r a : courbe à gauche/droite (pour le cavalier) de rayon r sur a degrés ; J : obstacle ;
  // M : ligne de départ ou d'arrivée.
  cmds: [
    ['M', 'start'], ['F', 17], ['J', '1', 'v'], ['F', 27], ['R', 12, 90],
    ['F', 17], ['J', '2', 'o', 1.25], ['F', 18.8], ['J', '3', 'v'], ['F', 8], ['R', 12, 135],
    ['F', 17], ['J', '4', 'w'], ['F', 13], ['L', 10, 135],
    ['F', 17], ['J', '5A', 'v'], ['F', 11.5], ['J', '5B', 'o', 1.25], ['F', 8], ['L', 10, 90],
    ['F', 17], ['J', '6', 'o', 1.3], ['F', 8], ['L', 11, 90],
    ['F', 24], ['J', '7', 'v'], ['F', 23], ['L', 12, 90],
    ['F', 17], ['J', '8', 'o', 1.4], ['F', 9], ['M', 'finish'],
  ],
  // Profil des hauteurs autour de la hauteur de l'épreuve (m) : abords de début plus faciles, fin plus exigeante.
  profile: { 1: -0.05, 2: 0, 3: -0.05, 4: 0, '5A': -0.05, '5B': 0, 6: 0, 7: 0, 8: 0.05 },
};

// Trace la ligne du cavalier : points tous les ~0,5 m { x, z, h, s }, obstacles et lignes posés dessus.
export function traceCourse(design = CSO_DESIGN, step = 0.5) {
  let { x, z, h } = design.start;
  let s = 0;
  const pts = [{ x, z, h, s }];
  const fences = [];
  const marks = {};
  for (const c of design.cmds) {
    if (c[0] === 'F') {
      const n = Math.max(1, Math.round(c[1] / step));
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
  return { pts, fences, marks, length: s };
}

export const CSO_TRACE = traceCourse();

// Hauteurs des éléments pour une épreuve de hauteur `h` (m), dans l'ordre du parcours.
export const csoHeights = (h) => CSO_TRACE.fences.map((f) => Math.round((h + (CSO_DESIGN.profile[f.label] || 0)) * 100) / 100);
