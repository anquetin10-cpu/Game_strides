import { describe, it, expect } from 'vitest';
import { CSO_RIDE, minRadius, maxTurnRate, steerRate, cadenceDelta, csoRideStep } from '../../src/gameplay/csoRide.js';

// Conduite des épreuves de CSO : diriger, régler la vitesse, sauter.
describe('conduite de concours', () => {
  it('le rayon de virage grandit avec la vitesse (la vitesse influence la trajectoire)', () => {
    expect(minRadius(4.6)).toBeLessThan(minRadius(6.2));
    expect(minRadius(6.2)).toBeLessThan(minRadius(8));
    expect(minRadius(6.2)).toBeGreaterThan(7);
    expect(minRadius(6.2)).toBeLessThan(8.5);
  });
  it('direction progressive : précise près du centre, pleine au bord, nulle dans la zone morte', () => {
    expect(steerRate(0.04, 6.2)).toBe(0);
    const half = Math.abs(steerRate(0.5, 6.2)), full = Math.abs(steerRate(1, 6.2));
    expect(full).toBeCloseTo(maxTurnRate(6.2), 6);
    expect(half).toBeLessThan(full * 0.5);
    expect(steerRate(1, 6.2)).toBeLessThan(0); // à droite : le cap diminue
    expect(steerRate(-1, 6.2)).toBeGreaterThan(0);
  });
  it('une courbe de 12 m au galop de concours demande environ deux tiers du joystick', () => {
    const w = 6.2 / 12;
    let x = 0;
    while (Math.abs(steerRate(x, 6.2)) < w) x += 0.01;
    expect(x).toBeGreaterThan(0.55);
    expect(x).toBeLessThan(0.85);
  });
  it('à l’arrêt : demi-tour sur les hanches possible (après un refus)', () => {
    expect(maxTurnRate(0)).toBeCloseTo(CSO_RIDE.pivot, 6);
  });
  it('cadence : change seulement joystick franchement avant/arrière, gardée au relâchement', () => {
    expect(cadenceDelta(0, 0, 6.2)).toBe(0);
    expect(cadenceDelta(0.3, 0, 6.2)).toBe(0); // zone morte
    expect(cadenceDelta(0.6, 1, 6.2)).toBe(0); // on tourne : la cadence ne bouge pas
    expect(cadenceDelta(1, 0, 6.2)).toBeCloseTo(CSO_RIDE.cadenceRate, 6);
    expect(cadenceDelta(-1, 0, 6.2)).toBeCloseTo(-CSO_RIDE.cadenceRate, 6);
  });
  const rig = (speed = 0) => {
    const control = {};
    const horse = { speed, control, _rearT: 0 };
    const player = { horse };
    const input = { move: { x: 0, y: 0 }, keyMove: false, wasPressed: () => false };
    return { player, input, horse, control };
  };
  it('la cadence part de la vitesse réelle (pas d’élan pris tout seul) et reste la même quand on relâche', () => {
    const { player, input, control } = rig(1.9);
    csoRideStep(player, input, 1 / 30);
    expect(player.csoCadence).toBeCloseTo(1.9, 6);
    input.move.y = 1;
    for (let i = 0; i < 60; i++) csoRideStep(player, input, 1 / 30);
    const c1 = player.csoCadence;
    expect(c1).toBeGreaterThan(4);
    input.move.y = 0;
    for (let i = 0; i < 90; i++) csoRideStep(player, input, 1 / 30);
    expect(player.csoCadence).toBe(c1);
    expect(control.speedOverride).toBe(c1);
    expect(control.gallop).toBe(false); // pas de BOOST en épreuve
  });
  it('clavier : la direction monte progressivement (pas de coup de volant)', () => {
    const { player, input, control } = rig(6.2);
    input.keyMove = true;
    input.move.x = 1;
    csoRideStep(player, input, 1 / 30);
    const first = Math.abs(control.turnRate);
    for (let i = 0; i < 15; i++) csoRideStep(player, input, 1 / 30);
    expect(first).toBeLessThan(Math.abs(control.turnRate) * 0.35);
    expect(Math.abs(control.turnRate)).toBeCloseTo(maxTurnRate(6.2), 2);
  });
  it('pendant un refus (cheval qui se cabre), la cadence ne se règle pas', () => {
    const { player, input, horse } = rig(0);
    horse._rearT = 0.5;
    input.move.y = 1;
    for (let i = 0; i < 30; i++) csoRideStep(player, input, 1 / 30);
    expect(player.csoCadence).toBe(0);
  });
});
