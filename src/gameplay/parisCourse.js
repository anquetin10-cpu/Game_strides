// Parcours du Grand Prix de Paris Indoor, dans l'arène couverte (piste de 86 × 46 m, voir sites.js : PARIS), tracés
// comme celui du Pôle (csoCourse.js) : ligne du cavalier d'abord, obstacles posés dans son axe. 14 m au moins d'approche
// droite (4 foulées), 7 m au moins de réception avant de tourner ; doubles à une foulée (8 m) ou deux foulées (11 m).
// Entrée de piste au sud du petit côté ouest ; tribunes au nord, au sud et à l'est.
//   Sprint (épreuve de vitesse, 1,50 m, tournants serrés de 7 m) : ligne sud vers l'est 1 oxer – 2 vertical, à main
//   gauche 3 vertical sur le petit côté est, ligne nord vers l'ouest 4 oxer – 5 mur, demi-tour à gauche et diagonale
//   finale vers l'arrivée : double 6A – 6B (une foulée).
//   Grand Prix (1,60 m, tournants de 9 m) : 1 vertical en diagonale depuis l'entrée, à main droite ligne nord 2 oxer –
//   3 vertical, demi-volte à droite et ligne du milieu vers l'ouest : double 4A – 4B (une foulée) puis 5 vertical,
//   changement de main (demi-volte à gauche) et ligne sud vers l'est : 6 mur, double 7A – 7B (deux foulées), arrivée.
// Repère local : centre de la piste, x vers l'est, z vers le sud ; cap h : direction (sin h, cos h).
import { traceCourse } from './csoCourse.js';
import { PARIS } from '../world/sites.js';

const E = Math.PI / 2, DEG = Math.PI / 180;
export const PARIS_SPRINT_DESIGN = {
  start: { x: -30, z: 18, h: E },
  cmds: [
    ['M', 'start'], ['F', 14], ['J', '1', 'o', 1.3], ['F', 19], ['J', '2', 'v'], ['F', 23], ['L', 7, 90],
    ['F', 14], ['J', '3', 'v'], ['F', 7.2], ['L', 7, 90],
    ['F', 14], ['J', '4', 'o', 1.4], ['F', 18], ['J', '5', 'w'], ['F', 8], ['L', 7, 150],
    ['F', 14], ['J', '6A', 'v'], ['F', 8], ['J', '6B', 'o', 1.3], ['F', 10], ['M', 'finish'],
  ],
  profile: { 1: -0.05 },
};
export const PARIS_GP_DESIGN = {
  start: { x: -37, z: 11, h: 160 * DEG },
  cmds: [
    ['M', 'start'], ['F', 14], ['J', '1', 'v'], ['F', 10.6], ['R', 9, 70],
    ['F', 16], ['J', '2', 'o', 1.3], ['F', 19.5], ['J', '3', 'v'], ['F', 14.5], ['R', 9, 180],
    ['F', 14], ['J', '4A', 'v'], ['F', 8], ['J', '4B', 'o', 1.3], ['F', 15], ['J', '5', 'v'], ['F', 8], ['L', 9, 180],
    ['F', 14], ['J', '6', 'w'], ['F', 15], ['J', '7A', 'o', 1.3], ['F', 11], ['J', '7B', 'v'], ['F', 9], ['M', 'finish'],
  ],
  profile: { 1: -0.05, '4A': -0.05 },
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
