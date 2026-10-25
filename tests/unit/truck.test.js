import { describe, it, expect } from 'vitest';
import { TruckSim, TRUCK_SPEC, torqueAt } from '../../src/entities/truckPhysics.js';

const DT = 1 / 30;
const run = (sim, sec, input) => {
  for (let t = 0; t < sec; t += DT) sim.step(DT, input);
};
const started = (horses = 0) => {
  const s = new TruckSim();
  s.horses = horses;
  s.engineOn = true;
  s.rpm = TRUCK_SPEC.idle;
  return s;
};
const finite = (s) => [s.vx, s.vy, s.r, s.rpm, s.pos.x, s.pos.z, s.heading, s.ax, s.ay].every(Number.isFinite);

describe('moteur', () => {
  it('suit une courbe de couple diesel réaliste', () => {
    expect(torqueAt(TRUCK_SPEC, 1400)).toBe(750);
    expect(torqueAt(TRUCK_SPEC, 650)).toBeLessThan(500);
    expect(torqueAt(TRUCK_SPEC, 2300)).toBeLessThan(700);
    expect(torqueAt(TRUCK_SPEC, 2800)).toBe(0);
  });
});

describe('camion 7,5 t', () => {
  it('accélère de façon réaliste et monte les rapports', () => {
    const s = started();
    let t50 = null;
    for (let t = 0; t < 40; t += DT) {
      s.step(DT, { throttle: 1, steer: 0 });
      if (t50 === null && s.vx >= 50 / 3.6) t50 = t;
      expect(s.rpm).toBeLessThanOrEqual(TRUCK_SPEC.cutRpm + 1);
    }
    expect(t50).toBeGreaterThan(5);
    expect(t50).toBeLessThan(13);
    expect(s.gear).toBeGreaterThanOrEqual(5);
    // Limiteur légal à 90 km/h.
    expect(s.vx * 3.6).toBeGreaterThan(84);
    expect(s.vx * 3.6).toBeLessThan(92);
    expect(finite(s)).toBe(true);
  });

  it('est plus lent chargé de deux chevaux', () => {
    const a = started(0), b = started(2);
    run(a, 8, { throttle: 1, steer: 0 });
    run(b, 8, { throttle: 1, steer: 0 });
    expect(b.vx).toBeLessThan(a.vx);
    expect(b.mass).toBe(TRUCK_SPEC.massEmpty + 2 * TRUCK_SPEC.massHorse);
  });

  it('freine de 50 km/h sur une distance plausible', () => {
    const s = started();
    s.vx = 50 / 3.6;
    s.gear = 4;
    const z0 = s.pos.z;
    let t = 0;
    while (s.vx > 0 && t < 10) {
      s.step(DT, { throttle: -1, steer: 0 });
      t += DT;
    }
    const d = s.pos.z - z0;
    expect(s.braking || s.vx === 0).toBe(true);
    expect(t).toBeGreaterThan(1.8);
    expect(t).toBeLessThan(3.2);
    expect(d).toBeGreaterThan(12);
    expect(d).toBeLessThan(24);
    // Joystick maintenu vers le bas : la marche arrière s'engage après un court arrêt.
    run(s, 0.3, { throttle: -1, steer: 0 });
    expect(s.gear).toBeGreaterThan(0);
    run(s, 1, { throttle: -1, steer: 0 });
    expect(s.gear).toBe(-1);
  });

  it('ralentit au frein moteur sans gaz', () => {
    const s = started();
    s.vx = 20;
    s.gear = 5;
    run(s, 4, { throttle: 0, steer: 0 });
    expect(s.vx).toBeLessThan(18.5);
    expect(s.vx).toBeGreaterThan(12);
  });

  it('passe en marche arrière à l’arrêt et recule lentement', () => {
    const s = started();
    run(s, 6, { throttle: -1, steer: 0 });
    expect(s.gear).toBe(-1);
    expect(s.gearLabel).toBe('R');
    expect(s.vx).toBeLessThan(-1);
    expect(s.vx).toBeGreaterThan(-4.5);
    // Retour en marche avant : freine puis repart.
    run(s, 6, { throttle: 1, steer: 0 });
    expect(s.gear).toBeGreaterThan(0);
    expect(s.vx).toBeGreaterThan(1);
  });

  it('a un rayon de braquage de porteur (empattement 4,2 m)', () => {
    const s = started();
    // Au pas, braquage à fond à droite : cercle complet.
    const xs = [], zs = [];
    for (let t = 0; t < 40; t += DT) {
      s.step(DT, { throttle: s.vx < 1.6 ? 0.35 : 0, steer: 1 });
      xs.push(s.pos.x);
      zs.push(s.pos.z);
    }
    const w = Math.max(...xs) - Math.min(...xs);
    const hgt = Math.max(...zs) - Math.min(...zs);
    const diam = (w + hgt) / 2; // diamètre décrit par le centre du camion
    expect(diam).toBeGreaterThan(9);
    expect(diam).toBeLessThan(16);
    // Virage à droite : le cap diminue.
    expect(s.r).toBeLessThan(0);
  });

  it('limite l’accélération latérale à haute vitesse (direction asservie)', () => {
    const s = started();
    s.vx = 20;
    s.gear = 6;
    let maxAy = 0;
    for (let t = 0; t < 5; t += DT) {
      s.step(DT, { throttle: 0.35, steer: 1 });
      maxAy = Math.max(maxAy, Math.abs(s.ay));
    }
    expect(maxAy).toBeGreaterThan(1.5);
    expect(maxAy).toBeLessThan(5.5);
    expect(finite(s)).toBe(true);
  });

  it('reste à l’arrêt moteur coupé et sans commande', () => {
    const s = new TruckSim();
    s.slope = 0.06;
    run(s, 3, null);
    expect(s.vx).toBe(0);
    const e = started();
    e.slope = -0.05;
    run(e, 3, { throttle: 0, steer: 0 });
    expect(Math.abs(e.vx)).toBeLessThan(0.05);
  });

  it('calcule une épure d’Ackermann cohérente', () => {
    const s = started();
    s.steer = 0.4;
    const [l, r] = s.ackermann();
    expect(l).toBeGreaterThan(r); // roue intérieure (gauche) plus braquée
    s.steer = -0.4;
    const [l2, r2] = s.ackermann();
    expect(Math.abs(r2)).toBeGreaterThan(Math.abs(l2));
  });
});
