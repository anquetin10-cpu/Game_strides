import { describe, it, expect } from 'vitest';
import { TruckSim, VEHICLE_SPECS } from '../../src/entities/truckPhysics.js';

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

describe('véhicules : accélération et vitesse maxi réalistes', () => {
  it('citadine essence 90 ch : 0-100 km/h en 11 à 14 s, ~175 km/h', () => {
    const t = timeTo('hatch', 100);
    expect(t).toBeGreaterThan(10.5);
    expect(t).toBeLessThan(14.5);
    const v = topSpeed('hatch');
    expect(v).toBeGreaterThan(165);
    expect(v).toBeLessThan(182);
  });
  it('berline diesel 130 ch : 0-100 km/h en 9 à 12 s, 195 à 212 km/h', () => {
    const t = timeTo('sedan', 100);
    expect(t).toBeGreaterThan(8.5);
    expect(t).toBeLessThan(12);
    const v = topSpeed('sedan');
    expect(v).toBeGreaterThan(195);
    expect(v).toBeLessThan(212);
  });
  it('SUV diesel 150 ch : 0-100 km/h en 9,5 à 12,5 s', () => {
    const t = timeTo('suv', 100);
    expect(t).toBeGreaterThan(9.5);
    expect(t).toBeLessThan(12.5);
    expect(topSpeed('suv')).toBeLessThan(192);
  });
  it('tracteur 110 ch : 40 km/h maxi, lent à prendre de la vitesse', () => {
    expect(topSpeed('tractor', 60)).toBeGreaterThan(37);
    expect(topSpeed('tractor', 60)).toBeLessThan(41);
    expect(timeTo('tractor', 30)).toBeGreaterThan(6);
  });
  it('monte tous les rapports sans dépasser la coupure', () => {
    for (const kind of ['hatch', 'sedan', 'suv', 'tractor']) {
      const s = started(kind);
      for (let t = 0; t < 60; t += DT) s.step(DT, { throttle: 1, steer: 0 });
      expect(s.gear).toBeGreaterThanOrEqual(s.spec.gears.length - 1);
    }
  });
});

describe('véhicules : freinage et direction', () => {
  it('voiture : freinage de 100 km/h en 38 à 46 m (ABS, enrobé sec)', () => {
    for (const kind of ['hatch', 'sedan', 'suv']) {
      const d = brakeDist(kind, 100);
      expect(d).toBeGreaterThan(37);
      expect(d).toBeLessThan(47);
    }
  });
  it('tracteur : freinage de 40 km/h en moins de 14 m', () => {
    expect(brakeDist('tractor', 40)).toBeLessThan(14);
  });
  it('rayon de braquage de voiture : 4,5 à 6 m (au pas)', () => {
    for (const kind of ['hatch', 'sedan', 'suv']) {
      const s = started(kind);
      const L = s.spec.zFront - s.spec.zRear;
      const R = L / Math.tan(s.steerLimit(2));
      expect(R).toBeGreaterThan(4.5);
      expect(R).toBeLessThan(6);
    }
  });
  it('marche arrière à l’arrêt', () => {
    const s = started('hatch');
    for (let t = 0; t < 4; t += DT) s.step(DT, { throttle: -1, steer: 0 });
    expect(s.gear).toBe(-1);
    expect(s.vx).toBeLessThan(-0.5);
  });
});
