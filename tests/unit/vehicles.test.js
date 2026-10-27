import { describe, it, expect } from 'vitest';
import { TruckSim, VEHICLE_SPECS } from '../../src/entities/truckPhysics.js';
import { CARS, CAR_MODELS } from '../../src/world/props.js';

// Performances des véhicules conduisibles confrontées aux fiches techniques de séries réelles.
const DT = 1 / 30;
const started = (kind) => {
  const s = new TruckSim(VEHICLE_SPECS[kind]);
  s.engineOn = true;
  s.rpm = s.spec.idle;
  return s;
};
const timeTo = (kind, kmh, max = 60) => {
  const s = started(kind);
  for (let t = 0; t < max; t += DT) {
    s.step(DT, { throttle: 1, steer: 0 });
    if (s.vx * 3.6 >= kmh) return t;
    expect(s.rpm).toBeLessThanOrEqual(s.spec.cutRpm + 1);
  }
  return Infinity;
};
const topSpeed = (kind, sec = 120) => {
  const s = started(kind);
  for (let t = 0; t < sec; t += DT) s.step(DT, { throttle: 1, steer: 0 });
  return s.vx * 3.6;
};
const brakeDist = (kind, kmh) => {
  const s = started(kind);
  s.vx = kmh / 3.6;
  s.gear = 3;
  const z0 = s.pos.z;
  for (let t = 0; t < 20 && s.vx > 0; t += DT) s.step(DT, { throttle: -1, steer: 0 });
  return s.pos.z - z0;
};

describe('véhicules : accélération et vitesse maxi des modèles de série copiés', () => {
  // [modèle, 0-100 km/h mini, maxi (s), vitesse maxi mini, maxi (km/h)] d'après les fiches techniques constructeurs.
  const SHEETS = [
    ['clio', 10.8, 13.8, 168, 182], // 12,2 s, 178 km/h
    ['golf', 8.2, 10.4, 200, 218], // 9,2 s, 214 km/h
    ['p508', 9.0, 11.4, 198, 212], // 10,0 s, ~208 km/h
    ['p3008', 10.2, 12.8, 182, 196], // ~11,5 s, 192 km/h
    ['duster', 10.2, 13.2, 160, 182], // ~11,5 s, ~170 km/h
  ];
  for (const [kind, t0, t1, v0, v1] of SHEETS) {
    it(`${VEHICLE_SPECS[kind].name} (${kind}) : 0-100 km/h en ${t0} – ${t1} s, ${v0} – ${v1} km/h`, () => {
      const t = timeTo(kind, 100);
      expect(t).toBeGreaterThan(t0);
      expect(t).toBeLessThan(t1);
      const v = topSpeed(kind);
      expect(v).toBeGreaterThan(v0);
      expect(v).toBeLessThan(v1);
    });
  }
  it('tracteur 110 ch : 40 km/h maxi, lent à prendre de la vitesse', () => {
    expect(topSpeed('tractor', 60)).toBeGreaterThan(37);
    expect(topSpeed('tractor', 60)).toBeLessThan(41);
    expect(timeTo('tractor', 30)).toBeGreaterThan(6);
  });
  it('monte tous les rapports sans dépasser la coupure', () => {
    for (const kind of ['clio', 'golf', 'p508', 'p3008', 'duster', 'tractor']) {
      const s = started(kind);
      for (let t = 0; t < 60; t += DT) s.step(DT, { throttle: 1, steer: 0 });
      expect(s.gear).toBeGreaterThanOrEqual(s.spec.gears.length - 2);
    }
  });
  it('empattement physique = empattement du modèle 3D', () => {
    for (const kind of CAR_MODELS) expect(VEHICLE_SPECS[kind].zFront - VEHICLE_SPECS[kind].zRear).toBeCloseTo(CARS[kind].wb, 3);
  });
});

describe('véhicules : freinage et direction', () => {
  it('voiture : freinage de 100 km/h en 38 à 46 m (ABS, enrobé sec)', () => {
    for (const kind of ['clio', 'golf', 'p508', 'p3008', 'duster']) {
      const d = brakeDist(kind, 100);
      expect(d).toBeGreaterThan(37);
      expect(d).toBeLessThan(47);
    }
  });
  it('tracteur : freinage de 40 km/h en moins de 14 m', () => {
    expect(brakeDist('tractor', 40)).toBeLessThan(14);
  });
  it('rayon de braquage de voiture : 4,5 à 6 m (au pas)', () => {
    for (const kind of ['clio', 'golf', 'p508', 'p3008', 'duster']) {
      const s = started(kind);
      const L = s.spec.zFront - s.spec.zRear;
      const R = L / Math.tan(s.steerLimit(2));
      expect(R).toBeGreaterThan(4.5);
      expect(R).toBeLessThan(6);
    }
  });
  it('marche arrière à l’arrêt', () => {
    const s = started('clio');
    for (let t = 0; t < 4; t += DT) s.step(DT, { throttle: -1, steer: 0 });
    expect(s.gear).toBe(-1);
    expect(s.vx).toBeLessThan(-0.5);
  });
});
