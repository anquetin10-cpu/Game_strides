// Parcours de CSO du Pôle International, dessiné comme un vrai tracé : la ligne idéale du cavalier est une suite de
// lignes droites et de courbes de rayon donné (8 à 9 m : le cheval tourne bien plus court, mais la courbe reste
// fluide au galop et laisse voir l'obstacle suivant). Chaque obstacle est posé sur cette ligne, dans l'axe du saut.
// Les obstacles, le plan, l'aide de tracé, la longueur du parcours (temps accordé) et le pilote des tests viennent
// tous de ces mêmes données.
//
// Repère : centre de la carrière (84 × 52 m), x vers l’est, z vers le sud ; cap h : direction (sin h, cos h).
// Entrée de piste au milieu du grand côté sud (+z), tribunes au nord (-z, côté mer).
//   S → 1 (vertical, piste ouest, vers le nord) → à main droite : ligne 2 (oxer) – 3 (vertical) le long des tribunes,
//   4 (oxer, piste est, vers le sud) → 5 (mur, en diagonale) → changement de main, à main gauche → 6 (vertical) →
//   double 7A (vertical) – 7B (oxer, une foulée) → 8 (oxer large) → ligne 9 (vertical) – 10 (oxer) → arrivée.

export const CSO_DESIGN = {
  start: { x: -33, z: 12, h: Math.PI },
  // F d : ligne droite ; L/R r a : courbe à gauche/droite (pour le cavalier) de rayon r sur a degrés ; J : obstacle ;
  // M : ligne de départ ou d'arrivée.
  cmds: [
    ['M', 'start'], ['F', 8], ['J', '1', 'v'], ['F', 14], ['R', 9, 90],
    ['F', 6], ['J', '2', 'o', 1.2], ['F', 20], ['J', '3', 'v'], ['F', 22], ['R', 9, 90],
    ['F', 6], ['J', '4', 'o', 1.3], ['F', 4], ['R', 9, 135],
    ['F', 4], ['J', '5', 'w'], ['F', 6], ['L', 8, 135],
    ['F', 1], ['J', '6', 'v'], ['F', 3], ['L', 7, 90],
    ['F', 2], ['J', '7A', 'v'], ['F', 9], ['J', '7B', 'o', 1.2], ['F', 4], ['L', 6, 90],
    ['F', 8], ['J', '8', 'o', 1.4], ['F', 4], ['L', 8, 90],
    ['F', 4], ['J', '9', 'v'], ['F', 14], ['J', '10', 'o', 1.3], ['F', 8], ['M', 'finish'],
  ],
  // Profil des hauteurs autour de la hauteur de l'épreuve (m) : abords de début plus faciles, fin plus exigeante.
  profile: { 1: -0.05, 2: 0, 3: -0.05, 4: 0, 5: 0, 6: 0, '7A': -0.05, '7B': 0, 8: 0.05, 9: 0, 10: 0.05 },
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
