import { describe, it, expect } from 'vitest';
import { lintCourse, lintTable, POLE_RULES, PARIS_RULES, POLE_VENUE, PARIS_VENUE, STRIDE, LINE_BASE } from '../../src/gameplay/courseLint.js';
import { CSO_TRACE, CSO_DESIGN, traceCourse } from '../../src/gameplay/csoCourse.js';
import { PARIS_COURSES } from '../../src/gameplay/parisCourse.js';
import { POLE, PARIS, PARIS_STANDS } from '../../src/world/sites.js';
import { COURSE_SPEED, timeAllowedFor } from '../../src/gameplay/courses.js';

// Lint des tracés de CSO (spécification « CSO v2 », règles de tracé) : chaque parcours du jeu passe sans aucune
// violation ; les mesures (abords, réceptions, rayons, distances, longueur, temps accordé) sont imprimées.
const COURSES = [
  ['Pôle International', CSO_TRACE, POLE_RULES, POLE_VENUE],
  ['Paris · Sprint', PARIS_COURSES.paris_sprint.trace, PARIS_RULES, PARIS_VENUE],
  ['Paris · Grand Prix', PARIS_COURSES.paris_gp.trace, PARIS_RULES, PARIS_VENUE],
];

describe('lint des tracés de CSO : parcours du jeu', () => {
  for (const [name, trace, rules, venue] of COURSES) {
    it(`${name} : aucune violation des règles de tracé`, () => {
      const res = lintCourse(trace, rules, venue);
      console.log(lintTable(name, res));
      expect(res.violations).toEqual([]);
      const m = res.metrics;
      expect(m.minApproach).toBeGreaterThanOrEqual(rules.approach);
      expect(m.minLanding).toBeGreaterThanOrEqual(rules.landing);
      expect(m.minRadius).toBeGreaterThanOrEqual(rules.radius);
      expect(m.minBoards).toBeGreaterThanOrEqual(rules.boards);
      // Temps : au galop de référence (6,2 m/s), 4 s d'avance au moins sur le temps accordé national.
      expect(trace.length / 6.2).toBeLessThanOrEqual(timeAllowedFor(Math.round(trace.length), COURSE_SPEED.national) - 4);
    });
  }

  it('combinaisons à une ou deux foulées, lignes en nombre entier de foulées', () => {
    for (const [, trace, rules, venue] of COURSES) {
      const { combos, lines } = lintCourse(trace, rules, venue).metrics;
      for (const c of combos) expect([1, 2]).toContain(c.strides);
      for (const l of lines) if (l.strides !== null) expect(Math.abs(l.d - (LINE_BASE + l.strides * STRIDE))).toBeLessThanOrEqual(0.4);
    }
  });

  it('chaque parcours part de l’entrée de piste et ne la traverse pas avec la ligne de départ', () => {
    for (const [, trace, , venue] of COURSES) {
      const p0 = trace.leadIn[0];
      expect(Math.hypot(p0.x - venue.gate.x, p0.z - venue.gate.z)).toBeLessThan(0.01);
      expect(trace.pts[0].s).toBe(0);
      expect(trace.marks.start.s).toBe(0);
      expect(trace.marks.finish.s).toBeCloseTo(trace.length, 6);
    }
  });
});

describe('lint des tracés : données des lieux (sites.js)', () => {
  it('Pôle : piste 120 × 76 m, tribunes au nord, accueil au milieu du côté sud', () => {
    expect(POLE_VENUE.hw * 2).toBe(POLE.arena.w);
    expect(POLE_VENUE.hd * 2).toBe(POLE.arena.d);
    expect(POLE_VENUE.sides).toEqual({ n: true, s: false, e: false, w: false });
    expect(POLE_VENUE.gate).toEqual({ x: POLE.entrance.x - POLE.arena.x, z: POLE.arena.d / 2 - 5, h: Math.PI });
    expect(POLE_VENUE.stands[0].z1).toBeLessThan(-POLE_VENUE.hd);
  });
  it('Paris : piste 86 × 46 m, tribunes au nord, au sud et à l’est, porte des cavaliers à l’ouest', () => {
    expect(PARIS_VENUE.hw * 2).toBe(PARIS.arena.w);
    expect(PARIS_VENUE.hd * 2).toBe(PARIS.arena.d);
    expect(PARIS_VENUE.sides).toEqual({ n: true, s: true, e: true, w: false });
    expect(PARIS_STANDS).toHaveLength(3);
    expect(PARIS_VENUE.gate.x).toBe(PARIS.gate.x - PARIS.arena.x);
    expect(PARIS_VENUE.entry[0].x).toBe(PARIS.door.x - PARIS.arena.x);
  });
});

describe('lint des tracés : un mauvais tracé est refusé', () => {
  // Départ dans l'axe de l'entrée, abord trop court, ligne en demi-foulée, réception courte et virage serré, S,
  // combinaison à 9,5 m.
  const BAD = {
    start: POLE_VENUE.gate,
    cmds: [
      ['F', 4], ['M', 'start'], ['F', 5], ['J', '1', 'v'], ['F', 20.2], ['J', '2', 'o', 1.3], ['F', 6], ['R', 8, 90], ['L', 13, 90],
      ['F', 18], ['J', '3A', 'v'], ['F', 9.5], ['J', '3B', 'o', 1.3], ['F', 12], ['M', 'finish'],
    ],
  };
  const v = lintCourse(traceCourse(BAD), POLE_RULES, POLE_VENUE).violations.join('\n');
  it.each([
    ['abord trop court', /abord du 1 : 9 m droits < 18 m/],
    ['distance demi-foulée', /ligne 1 – 2 : 20\.2 m/],
    ['réception trop courte', /réception du 2 : 6 m/],
    ['rayon trop petit', /rayon 8 m < 13 m/],
    ['S sans ligne droite', /^S entre les virages/m],
    ['combinaison hors distance', /combinaison 3A – 3B : 9\.5 m/],
    ['départ trop près du 1', /départ à 5 m du 1/],
    ['entrée en piste par la ligne de départ', /l'entrée en piste franchit la ligne de départ/],
  ])('%s', (_, re) => expect(v).toMatch(re));

  it('le tracé du Pôle déplacé contre la lice est refusé', () => {
    const near = { ...CSO_DESIGN, start: { ...CSO_DESIGN.start, x: CSO_DESIGN.start.x - 9 } };
    const res = lintCourse(traceCourse(near), POLE_RULES, POLE_VENUE);
    expect(res.violations.some((m) => /lices/.test(m))).toBe(true);
  });
});
