// Parcours du Grand Prix de Paris Indoor, dans l'arène couverte (piste de 80 × 40 m, voir sites.js : PARIS), tracés
// comme celui du Pôle (csoCourse.js) : ligne du cavalier d'abord, obstacles posés dans son axe. En salle, trois lignes
// droites (piste sud, milieu, piste nord) reliées par des demi-voltes de 7 m de rayon aux extrémités ; 14 m au moins
// d'approche (4 foulées), 7 à 8 m de réception avant de tourner ; doubles à une foulée (8 m) ou deux foulées (11 m).
// Départ et arrivée communs : départ sur la piste sud vers l'est, arrivée sur la piste nord vers l'est.
//   Sprint (épreuve de vitesse, 1,50 m) : 1 oxer – 2 vertical, 3 oxer – 4 mur, 5 vertical – double 6A – 6B (1 foulée).
//   Grand Prix (1,60 m) : 1 vertical – 2 oxer – 3 vertical, 4 mur – double 5A – 5B (2 foulées), 6 oxer – 7 vertical –
//   8 oxer large.
// Repère local : centre de la piste, x vers l'est, z vers le sud ; cap h : direction (sin h, cos h).
import { traceCourse } from './csoCourse.js';
import { PARIS } from '../world/sites.js';

const E = Math.PI / 2;
export const PARIS_SPRINT_DESIGN = {
  start: { x: -28, z: 14.5, h: E },
  cmds: [
    ['M', 'start'], ['F', 16], ['J', '1', 'o', 1.3], ['F', 17], ['J', '2', 'v'], ['F', 8], ['F', 9], ['L', 7, 180],
    ['F', 16], ['J', '3', 'o', 1.4], ['F', 16], ['J', '4', 'w'], ['F', 8], ['F', 4], ['R', 7, 180],
    ['F', 16], ['J', '5', 'v'], ['F', 17], ['J', '6A', 'v'], ['F', 8], ['J', '6B', 'o', 1.3], ['F', 11], ['M', 'finish'],
  ],
  profile: { 1: -0.05, 2: 0, 3: 0, 4: 0, 5: 0, '6A': 0, '6B': 0 },
};
export const PARIS_GP_DESIGN = {
  start: { x: -28, z: 14.5, h: E },
  cmds: [
    ['M', 'start'], ['F', 14], ['J', '1', 'v'], ['F', 15], ['J', '2', 'o', 1.3], ['F', 15], ['J', '3', 'v'], ['F', 8], ['L', 7, 180],
    ['F', 14], ['J', '4', 'w'], ['F', 14], ['J', '5A', 'v'], ['F', 11], ['J', '5B', 'o', 1.3], ['F', 8], ['R', 7, 180],
    ['F', 14], ['J', '6', 'o', 1.4], ['F', 15], ['J', '7', 'v'], ['F', 15], ['J', '8', 'o', 1.4], ['F', 9], ['M', 'finish'],
  ],
  profile: { 1: -0.05, 2: 0, 3: 0, 4: -0.05, '5A': 0, '5B': 0, 6: 0, 7: 0, 8: 0 },
};

const toWorld = (p) => ({ ...p, x: PARIS.arena.x + p.x, z: PARIS.arena.z + p.z });
function course(id, design) {
  const T = traceCourse(design);
  return {
    id,
    design,
    trace: T,
    layout: T.fences.map(toWorld),
    line: T.pts.map(toWorld),
    start: { ...toWorld(T.marks.start), w: 7 },
    finish: { ...toWorld(T.marks.finish), w: 7 },
    length: Math.round(T.length),
    heights: (h) => T.fences.map((f) => Math.round((h + (design.profile[f.label] || 0)) * 100) / 100),
  };
}
export const PARIS_COURSES = {
  paris_sprint: course('paris_sprint', PARIS_SPRINT_DESIGN),
  paris_gp: course('paris_gp', PARIS_GP_DESIGN),
};
// Paddock d'échauffement de Paris : un vertical et un oxer.
export const PARIS_WARM = 'paris_warm';
