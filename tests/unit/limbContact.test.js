import { describe, it, expect } from 'vitest';
import { RAIL_R, toLocal, segAxis, capsuleRail, sweepRail } from '../../src/gameplay/limbContact.js';

// Obstacle d'axe de saut +z (n = (0, 1)), barres le long de x (t = (1, 0)), sol à 0.
const O = { x: 0, z: 0, ground: 0, n: { x: 0, z: 1 }, t: { x: 1, z: 0 }, w: 3.6 };
const bar = { s: 0, h: 1.2 };
const P = (s, y, u = 0) => ({ s, y, u });

describe('contact membre / barre', () => {
  it('repère local de l’obstacle', () => {
    const l = toLocal({ ...O, ground: 0.5 }, { x: 0.3, y: 1.7, z: -2 });
    expect(l.s).toBeCloseTo(-2);
    expect(l.u).toBeCloseTo(0.3);
    expect(l.y).toBeCloseTo(1.2);
  });

  it('distance segment – axe de la barre', () => {
    // Segment vertical passant 10 cm devant la barre.
    expect(segAxis(P(-0.1, 0.8), P(-0.1, 1.6), bar).dist).toBeCloseTo(0.1);
    // Segment horizontal 30 cm au-dessus.
    expect(segAxis(P(-1, 1.5), P(1, 1.5), bar).dist).toBeCloseTo(0.3);
    // Bout de segment le plus proche.
    expect(segAxis(P(-1, 1.5), P(-0.5, 1.5), bar).dist).toBeCloseTo(Math.hypot(0.5, 0.3));
  });

  it('sabot qui passe juste au-dessus : pas de contact ; qui frôle : contact', () => {
    const r = 0.05;
    // Dessous de la capsule 1 cm au-dessus du dessus de la barre.
    const above = capsuleRail(P(-0.2, 1.2 + RAIL_R + r + 0.01), P(0.2, 1.2 + RAIL_R + r + 0.01), r, bar, 1.8);
    expect(above.depth).toBeLessThan(0);
    // 1 cm dans la barre.
    const touch = capsuleRail(P(-0.2, 1.2 + RAIL_R + r - 0.01), P(0.2, 1.2 + RAIL_R + r - 0.01), r, bar, 1.8);
    expect(touch.depth).toBeCloseTo(0.01);
  });

  it('hors de la largeur des barres : ignoré', () => {
    expect(capsuleRail(P(0, 1.2, 2.0), P(0, 1.25, 2.0), 0.05, bar, 1.8)).toBeNull();
  });

  it('sabot sous la hauteur de la barre mais loin d’elle : pas une intersection', () => {
    const c = capsuleRail(P(1.0, 0.3), P(1.0, 0.6), 0.05, bar, 1.8);
    expect(c.depth).toBeLessThan(0);
  });

  it('balayage : traversée rapide entre deux images détectée', () => {
    // Image précédente devant la barre, image suivante derrière, à la hauteur de la barre : aucune des deux poses ne
    // touche la barre, le passage entre elles oui.
    const r = 0.05;
    const a0 = P(-0.4, 1.1), b0 = P(-0.4, 1.3), a1 = P(0.4, 1.1), b1 = P(0.4, 1.3);
    expect(capsuleRail(a0, b0, r, bar, 1.8).depth).toBeLessThan(0);
    expect(capsuleRail(a1, b1, r, bar, 1.8).depth).toBeLessThan(0);
    const c = sweepRail(a0, b0, a1, b1, r, bar, 1.8, 8);
    expect(c).not.toBeNull();
    expect(c.depth).toBeGreaterThan(0.05);
  });

  it('balayage au-dessus de la barre : rien', () => {
    expect(sweepRail(P(-0.4, 1.4), P(-0.4, 1.6), P(0.4, 1.4), P(0.4, 1.6), 0.05, bar, 1.8, 8)).toBeNull();
  });
});
