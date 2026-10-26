import { describe, it, expect } from 'vitest';
import { wrapAngle, angleDiff, segDist, polyDist, pointAlong, rectDist, polylineLength, formatTime, formatMoney, clamp } from '../../src/core/math.js';
import { levelFor, defaultSave, SaveSystem } from '../../src/core/save.js';
import { Colliders } from '../../src/world/colliders.js';
import { Bus } from '../../src/core/bus.js';
import { createNoise2D } from '../../src/core/noise.js';

describe('math', () => {
  it('wraps angles into [-π, π)', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
  it('measures distances to segments and polylines', () => {
    expect(segDist(0, 5, -10, 0, 10, 0).d).toBeCloseTo(5);
    expect(segDist(20, 0, -10, 0, 10, 0).t).toBe(1);
    const p = polyDist(5, 5, [[0, 0], [10, 0], [10, 10]]);
    expect(p.d).toBeCloseTo(5);
  });
  it('walks along polylines', () => {
    const pts = [[0, 0], [10, 0], [10, 10]];
    expect(polylineLength(pts)).toBe(20);
    const a = pointAlong(pts, 15);
    expect(a.x).toBeCloseTo(10);
    expect(a.z).toBeCloseTo(5);
    expect(a.dir).toBeCloseTo(0);
  });
  it('computes rounded-rect distances (negative inside)', () => {
    expect(rectDist(0, 0, 0, 0, 10, 5)).toBeLessThan(0);
    expect(rectDist(15, 0, 0, 0, 10, 5)).toBeCloseTo(5);
    expect(rectDist(0, 8, 0, 0, 10, 5, Math.PI / 2)).toBeLessThan(0);
  });
  it('formats time and money in French', () => {
    expect(formatTime(75.4)).toBe('1:15.4');
    expect(formatMoney(1250).replace(/\s/g, ' ')).toMatch(/1.250 €/);
    expect(clamp(5, 0, 3)).toBe(3);
  });
  it('produces deterministic bounded noise', () => {
    const n1 = createNoise2D(3), n2 = createNoise2D(3);
    for (let i = 0; i < 50; i++) {
      const v = n1(i * 0.37, i * 0.11);
      expect(v).toBe(n2(i * 0.37, i * 0.11));
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
});

describe('progression & sauvegarde', () => {
  it('maps reputation points to tiers', () => {
    expect(levelFor(0).title).toBe('Premiers contrats');
    expect(levelFor(299).level).toBe(1);
    expect(levelFor(300).title).toBe('Professionnel apprécié');
    expect(levelFor(950).title).toBe('Référence locale');
    expect(levelFor(5000).title).toBe('Réputation internationale');
    expect(levelFor(5000).progress).toBe(1);
    expect(levelFor(600).progress).toBeCloseTo(0.5);
  });
  it('has a sane default save', () => {
    const d = defaultSave();
    expect(d.money).toBe(0);
    expect(d.horses).toEqual(['comete']);
    expect(d.settings.sound).toBe(true);
  });
  it('works without localStorage (private mode)', () => {
    const s = new SaveSystem('test');
    expect(s.hasSave()).toBe(false);
    s.load();
    s.data.money = 10;
    expect(() => s.saveNow()).not.toThrow();
  });
});

describe('collisions', () => {
  it('pushes a circle out of another circle', () => {
    const c = new Colliders();
    c.addCircle(0, 0, 1);
    const p = { x: 0.5, z: 0 };
    expect(c.resolve(p, 0.5)).toBeTruthy();
    expect(p.x).toBeCloseTo(1.5);
  });
  it('pushes out of rotated boxes', () => {
    const c = new Colliders();
    c.addBox(10, 10, 4, 1, Math.PI / 2); // 8 m le long de X après rotation ? non : hw le long de l'axe local X → monde -Z
    const p = { x: 10, z: 10 + 3 };
    c.resolve(p, 0.5);
    // Le long de Z se trouve la grande dimension (hw=4) : pousser vers ±X.
    expect(Math.abs(p.x - 10)).toBeGreaterThanOrEqual(1.49);
  });
  it('ignores low obstacles when jumping above them', () => {
    const c = new Colliders();
    c.addSegment(-5, 0, 5, 0, 0.4, 1.2);
    const p = { x: 0, z: 0.1 };
    expect(c.resolve(p, 0.8, 1.5)).toBeNull();
    expect(c.resolve(p, 0.8, 0)).toBeTruthy();
  });
  it('detects points blocked by tall buildings', () => {
    const c = new Colliders();
    c.addBox(0, 0, 5, 5, 0.3);
    expect(c.blocked(1, 1, 2)).toBe(true);
    expect(c.blocked(20, 20, 2)).toBe(false);
  });
});

describe('bus', () => {
  it('subscribes and unsubscribes', () => {
    const b = new Bus();
    let n = 0;
    const off = b.on('x', (v) => (n += v));
    b.emit('x', 2);
    off();
    b.emit('x', 5);
    expect(n).toBe(2);
  });
});
