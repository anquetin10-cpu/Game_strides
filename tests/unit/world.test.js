import { describe, it, expect } from 'vitest';
import { Terrain, analyticHeight } from '../../src/world/terrain.js';
import { ZONES, shoreZ, POND, isReserved, ROADS, nearestRoad } from '../../src/world/layout.js';
import { getFields, hedgeRuns, nearPath } from '../../src/world/fields.js';
import { ovalPoint, ovalProject, ovalLength } from '../../src/gameplay/courses.js';
import { HIPPO } from '../../src/world/layout.js';

const terrain = new Terrain(200);

describe('terrain', () => {
  it('matches the analytic height at grid vertices', () => {
    for (const [x, z] of [[-600, -600], [0, 0], [114, -246], [600, 600]]) {
      expect(terrain.getHeight(x, z)).toBeCloseTo(analyticHeight(x, z), 2);
    }
  });
  it('is continuous between vertices', () => {
    let prev = terrain.getHeight(-100, 0);
    for (let x = -100; x < 100; x += 0.5) {
      const h = terrain.getHeight(x, 0);
      expect(Math.abs(h - prev)).toBeLessThan(1.5);
      prev = h;
    }
  });
  it('has the sea to the north and land to the south', () => {
    expect(terrain.waterDepth(0, -592)).toBeGreaterThan(3);
    expect(terrain.waterDepth(0, 100)).toBeLessThan(0);
    expect(terrain.getHeight(0, shoreZ(0) + 30)).toBeGreaterThan(0);
  });
  it('flattens every site to its target height', () => {
    for (const z of ZONES) expect(terrain.getHeight(z.x, z.z)).toBeCloseTo(z.y, 0);
  });
  it('keeps the forest pond shallow enough to ride through', () => {
    const depth = terrain.waterDepth(POND.x, POND.z);
    expect(depth).toBeGreaterThan(0.2);
    expect(depth).toBeLessThan(1.3);
  });
  it('keeps roads gently sloped', () => {
    for (const r of ROADS) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
        for (let k = 0; k < n; k++) {
          const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n;
          const x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
          const slope = Math.abs(terrain.getHeight(x1, z1) - terrain.getHeight(x0, z0)) / Math.hypot(x1 - x0, z1 - z0);
          expect(slope).toBeLessThan(0.35);
        }
      }
    }
  });
});

describe('bocage', () => {
  it('generates deterministic fields and hedges outside reserved areas', () => {
    const { fields, hedges } = getFields();
    expect(fields.length).toBeGreaterThan(150);
    expect(hedges.length).toBeGreaterThan(40);
    for (const h of hedges) {
      const mx = (h.a[0] + h.b[0]) / 2, mz = (h.a[1] + h.b[1]) / 2;
      expect(nearestRoad(mx, mz).d).toBeGreaterThan(2);
    }
    expect(isReserved(-30, -250)).toBe(true);
  });

  it('opens a gap in the hedges where a dirt path crosses them', () => {
    const { hedges } = getFields();
    let gaps = 0;
    for (const h of hedges) {
      const runs = hedgeRuns(h.a, h.b);
      const len = Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1]);
      const covered = runs.reduce((s, r) => s + Math.hypot(r[2] - r[0], r[3] - r[1]), 0);
      if (covered < len - 1) gaps++;
      else {
        // Pas de chemin : la haie est rendue d'un seul tenant, d'un bout à l'autre.
        expect(runs.length).toBe(1);
        expect(covered).toBeCloseTo(len, 3);
      }
      for (const r of runs) for (let t = 0; t <= 1; t += 0.05) expect(nearPath(r[0] + (r[2] - r[0]) * t, r[1] + (r[3] - r[1]) * t, 4.4)).toBe(false);
    }
    // Six chemins de terre traversent une haie (dont PATHS[7] en (-184,117)).
    expect(gaps).toBeGreaterThanOrEqual(5);
    expect(nearPath(-184, 117, 5)).toBe(true);
  });
});

describe('hippodrome', () => {
  it('projects oval points back to their curvilinear abscissa', () => {
    const L = ovalLength(HIPPO.radius);
    for (let s = 1; s < L; s += 37) {
      const [x, z] = ovalPoint(s, HIPPO.radius);
      const p = ovalProject(x, z);
      expect(p.s).toBeCloseTo(s, 1);
      expect(Math.abs(p.off)).toBeLessThan(0.01);
    }
  });
});
