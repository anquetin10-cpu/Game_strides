import { describe, it, expect } from 'vitest';
import { planJump, railsAhead, arcY, JUMP } from '../../src/gameplay/jumpModel.js';

// Obstacle centré à l'origine, sauté vers +z.
const fence = (rails) => ({ x: 0, z: 0, n: { x: 0, z: 1 }, t: { x: 1, z: 0 }, rails });
const VERT = fence([{ s: 0, h: 1.15 }]);
const OXER = fence([{ s: -0.6, h: 1.1 }, { s: 0.6, h: 1.15 }]);
const horse = { v: 6.5, power: 1.35, clearance: 0 };
// Appel à d mètres du centre de l'obstacle, abord d'angle `deg` (degrés), décalé latéralement de `u`.
const at = (f, d, { deg = 0, u = 0, h = horse } = {}) => {
  const a = (deg * Math.PI) / 180;
  return planJump(h, railsAhead(f, -Math.sin(a) * d + u, -Math.cos(a) * d, Math.sin(a), Math.cos(a)));
};
const passRange = (f, opts) => {
  const ok = [];
  for (let d = 0; d <= 9; d += 0.05) if (at(f, d, opts).margin >= 0) ok.push(d);
  return ok.length ? [Math.min(...ok), Math.max(...ok)] : null;
};

describe('saut : la distance d’appel décide du franchissement', () => {
  it('bon appel : franchissement propre, zone « bonne »', () => {
    const p = at(VERT, 2.7);
    expect(p.zone).toBe('good');
    expect(p.margin).toBeGreaterThan(JUMP.good);
  });
  it('appel un peu long ou un peu près : encore franchi, avec moins de marge', () => {
    const [near, far] = passRange(VERT);
    const best = at(VERT, 2.7).margin;
    expect(at(VERT, far - 0.1).margin).toBeGreaterThanOrEqual(0);
    expect(at(VERT, far - 0.1).margin).toBeLessThan(best);
    expect(at(VERT, near + 0.1).margin).toBeGreaterThanOrEqual(0);
    expect(at(VERT, near + 0.1).margin).toBeLessThan(best);
  });
  it('appel beaucoup trop loin : barre, cause « Appel trop loin »', () => {
    const p = at(VERT, 6);
    expect(p.margin).toBeLessThan(0);
    expect(p.zone).toBe('far');
    expect(p.cause).toBe('far');
  });
  it('appel beaucoup trop près : barre (ou refus tout contre)', () => {
    const p = at(VERT, 0.9);
    expect(p.margin).toBeLessThan(0);
    expect(p.cause).toBe('near');
    expect(at(VERT, 0.3).zone).toBe('refuse');
  });
  it('la zone dépend de la hauteur : plus haut, fenêtre plus étroite', () => {
    const low = passRange(fence([{ s: 0, h: 1.0 }]));
    const high = passRange(fence([{ s: 0, h: 1.3 }]));
    expect(high[1] - high[0]).toBeLessThan(low[1] - low[0]);
  });
  it('l’oxer tient compte de sa largeur : fenêtre plus étroite et plus proche du centre', () => {
    const v = passRange(VERT), o = passRange(OXER);
    expect(o[1] - o[0]).toBeLessThan(v[1] - v[0]);
    const wide = passRange(fence([{ s: -0.8, h: 1.1 }, { s: 0.8, h: 1.15 }]));
    expect(wide[1] - wide[0]).toBeLessThan(o[1] - o[0]);
    // Un appel juste pour un vertical peut faire tomber la barre arrière d'un oxer.
    const p = at(OXER, v[1] - 0.15);
    expect(p.margins[1]).toBeLessThan(0);
  });
  it('la vitesse compte : au trot, pas d’oxer de 1,15 m ; plus vite, appel plus loin', () => {
    const trot = passRange(OXER, { h: { ...horse, v: 4.6 } }), canter = passRange(OXER);
    expect(trot === null || trot[1] - trot[0] < (canter[1] - canter[0]) / 2).toBe(true);
    expect(passRange(fence([{ s: -0.6, h: 1.2 }, { s: 0.6, h: 1.25 }]), { h: { ...horse, v: 4.6 } })).toBeNull();
    const slow = passRange(VERT), fast = passRange(VERT, { h: { ...horse, v: 9 } });
    expect((fast[0] + fast[1]) / 2).toBeGreaterThan((slow[0] + slow[1]) / 2);
  });
  it('un abord désaxé réduit la marge et peut expliquer la faute', () => {
    const straight = at(OXER, 2.7).margin;
    const angled = at(OXER, 2.7, { deg: 35 });
    expect(angled.margin).toBeLessThan(straight);
    expect(at(OXER, 2.7, { deg: 70 }).zone).toBe('none');
    const bad = [];
    for (let d = 1.5; d < 4; d += 0.05) {
      const p = at(OXER, d, { deg: 42 });
      if (p.margin < 0 && at(OXER, d).margin >= 0) bad.push(p.cause);
    }
    expect(bad).toContain('angle');
  });
  it('déterministe : même geste, même résultat', () => {
    expect(at(OXER, 3.1, { deg: 12 })).toEqual(at(OXER, 3.1, { deg: 12 }));
  });
  it('la trajectoire est continue et retombe au sol', () => {
    expect(arcY(1.3, 5, 0)).toBe(0);
    expect(arcY(1.3, 5, 5)).toBe(0);
    expect(arcY(1.3, 5, 2.5)).toBeCloseTo(1.3);
    expect(arcY(1.3, 5, 6)).toBe(0);
  });
});
