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

describe('véhicules : consommation de carburant', () => {
  // Stabilise à une vitesse (régulateur proportionnel), puis mesure la consommation moyenne sur 60 s (l/100 km).
  const cruise = (kind, kmh, spec) => {
    const s = spec ? new TruckSim(spec) : started(kind);
    if (spec) {
      s.engineOn = true;
      s.rpm = s.spec.idle;
    }
    const v = kmh / 3.6;
    const ctl = () => ({ throttle: clamp01((v - s.vx) * 0.6 + 0.25), steer: 0 });
    for (let t = 0; t < 90; t += DT) s.step(DT, ctl());
    s.resetTrip();
    for (let t = 0; t < 60; t += DT) s.step(DT, ctl());
    return { l100: s.avgL100, kmh: s.vx * 3.6 };
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  // [modèle, vitesse, l/100 km mini, maxi] : consommations stabilisées relevées sur ces motorisations.
  const REF = [
    ['clio', 90, 4.3, 6.2],
    ['golf', 90, 4.3, 6.2],
    ['p508', 90, 3.4, 5.0],
    ['p3008', 90, 3.8, 5.6],
    ['duster', 90, 4.0, 6.0],
  ];
  for (const [kind, kmh, lo, hi] of REF) {
    it(`${kind} : ${lo} – ${hi} l/100 km à ${kmh} km/h stabilisés`, () => {
      const r = cruise(kind, kmh);
      expect(Math.abs(r.kmh - kmh)).toBeLessThan(4);
      expect(r.l100).toBeGreaterThan(lo);
      expect(r.l100).toBeLessThan(hi);
    });
  }
  it('camion 7,5 t chargé de deux chevaux : 18 – 30 l/100 km à 90 km/h', async () => {
    const { TRUCK_SPEC } = await import('../../src/entities/truckPhysics.js');
    const s = new TruckSim(TRUCK_SPEC);
    s.horses = 2;
    s.engineOn = true;
    s.rpm = 650;
    const v = 25;
    const ctl = () => ({ throttle: Math.max(0, Math.min(1, (v - s.vx) * 0.6 + 0.4)), steer: 0 });
    for (let t = 0; t < 120; t += DT) s.step(DT, ctl());
    s.resetTrip();
    for (let t = 0; t < 60; t += DT) s.step(DT, ctl());
    expect(s.vx * 3.6).toBeGreaterThan(84);
    expect(s.avgL100).toBeGreaterThan(18);
    expect(s.avgL100).toBeLessThan(30);
  });
  it('ralenti : moins de 1,5 l/h ; frein moteur : injection coupée', () => {
    const s = started('golf');
    for (let t = 0; t < 3; t += DT) s.step(DT, { throttle: 0, steer: 0 });
    expect(s.fuelLph).toBeLessThan(1.5);
    s.vx = 20;
    s.gear = 4;
    for (let t = 0; t < 1; t += DT) s.step(DT, { throttle: 0, steer: 0 });
    expect(s.fuelLph).toBe(0);
  });
  it('panne sèche : le moteur cale, le plein le fait repartir', () => {
    const s = started('clio');
    s.fuelL = 0.002;
    for (let t = 0; t < 5 && s.engineOn; t += DT) s.step(DT, { throttle: 1, steer: 0 });
    expect(s.engineOn).toBe(false);
    expect(s.dry).toBe(true);
    expect(s.refuel()).toBeCloseTo(42, 1);
    expect(s.dry).toBe(false);
  });
});
