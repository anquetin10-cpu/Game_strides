// Parcours du Grand Prix de Paris Indoor, dans l'arène couverte (piste de 86 × 46 m, voir sites.js : PARIS), tracés
// comme celui du Pôle (csoCourse.js) : ligne du cavalier d'abord, obstacles posés dans son axe, règles vérifiées par
// courseLint.js (approche droite de 14,5 m au moins, réception de 10 m, courbes de 10,5 m de rayon au moins, ligne à
// 5,5 m des lices ; combinaisons à une foulée 7,8 m ou deux foulées 11,4 m ; lignes en n foulées 4,2 + n × 3,56 m).
// Entrée de piste à l'ouest (PARIS.gate, cap à l'est) ; tribunes au nord, au sud et à l'est. L'abord depuis l'entrée
// monte en diagonale vers le nord-est jusqu'à la ligne de départ, loin de l'entrée : y entrer ne lance pas le chrono.
// Les deux tracés suivent la même spirale à main droite sur quatre lignes droites (tout le long de la piste) :
//   ligne nord-centre vers l'est → demi-volte à l'est → ligne sud vers l'ouest → demi-volte à l'ouest (le long du petit
//   côté) → ligne nord vers l'est → demi-volte à l'est → ligne du milieu vers l'ouest, arrivée vers l'entrée.
//   Sprint (épreuve de vitesse, 7 efforts) : 1 oxer, double 2A (vertical) – 2B (oxer, une foulée) et 3 vertical sur la
//   ligne sud, 4 mur – 5 oxer (6 foulées) le long des tribunes nord, galop jusqu'au 6 (oxer large) et à l'arrivée.
//   Grand Prix (9 efforts) : 1 vertical, ligne sud 2 oxer – double 3A – 3B (une foulée), ligne nord 4 mur – double
//   5A – 5B (deux foulées), ligne du milieu 6 oxer – 7 oxer large (5 foulées).
// Repère local : centre de la piste, x vers l'est, z vers le sud ; cap h : direction (sin h, cos h).
import { traceCourse } from './csoCourse.js';
import { PARIS } from '../world/sites.js';

// Point d'accueil de l'entrée de piste (PARIS.gate), en coordonnées de la piste : l'abord part de là.
const GATE = { x: PARIS.gate.x - PARIS.arena.x, z: PARIS.gate.z - PARIS.arena.z, h: PARIS.gate.rot };
// Abord commun : légère courbe à gauche, diagonale vers le nord-est, courbe à droite jusqu'à la ligne de départ.
const LEAD = [['L', 10.5, 54.5], ['F', 10], ['R', 10.5, 54.5]];
export const PARIS_SPRINT_DESIGN = {
  start: GATE,
  cmds: [
    ...LEAD, ['F', 2], ['M', 'start'], ['F', 15], ['J', '1', 'o', 1.3], ['F', 24.9],
    ['R', 10.5, 90], ['F', 3.1], ['R', 10.5, 90],
    ['F', 14.5], ['J', '2A', 'v'], ['F', 7.8], ['J', '2B', 'o', 1.2], ['F', 14.9], ['J', '3', 'v'], ['F', 13.6],
    ['R', 13, 90], ['F', 8.3], ['R', 13, 90],
    ['F', 14.6], ['J', '4', 'w'], ['F', 25.6], ['J', '5', 'o', 1.4], ['F', 10.9],
    ['R', 10.5, 180],
    ['F', 38.6], ['J', '6', 'o', 1.5], ['F', 11.1], ['M', 'finish'],
  ],
  profile: { 1: -0.05 },
};
export const PARIS_GP_DESIGN = {
  start: GATE,
  cmds: [
    ...LEAD, ['M', 'start'], ['F', 15], ['J', '1', 'v'], ['F', 26.9],
    ['R', 10.5, 90], ['F', 3.1], ['R', 10.5, 90],
    ['F', 16.4], ['J', '2', 'o', 1.3], ['F', 14.9], ['J', '3A', 'v'], ['F', 7.8], ['J', '3B', 'o', 1.2], ['F', 11.8],
    ['R', 13, 90], ['F', 8.3], ['R', 13, 90],
    ['F', 14.5], ['J', '4', 'w'], ['F', 14.9], ['J', '5A', 'v'], ['F', 11.4], ['J', '5B', 'o', 1.3], ['F', 10.2],
    ['R', 10.5, 180],
    ['F', 17.8], ['J', '6', 'o', 1.4], ['F', 22.0], ['J', '7', 'o', 1.5], ['F', 8], ['M', 'finish'],
  ],
  profile: { 1: -0.05, '3A': -0.05 },
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
