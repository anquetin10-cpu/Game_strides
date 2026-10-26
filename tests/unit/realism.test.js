import { describe, it, expect } from 'vitest';
import { HORSE } from '../../src/config.js';
import { COURSE_LENGTH, COURSE_SPEED, timeAllowedFor } from '../../src/gameplay/courses.js';
import { DEFI_POLE_V1, DEFI_POLE_V2, CURRENT_CHALLENGE } from '../../src/gameplay/challenge.js';
import { STORY } from '../../src/gameplay/story.js';
import { CHAPTER1 } from '../../src/gameplay/story2.js';
import { TRUCK_SPEC } from '../../src/entities/truckPhysics.js';

// Audit de réalisme (docs/realisme.md) : grandeurs du jeu confrontées aux valeurs réelles de référence.
const kmh = (ms) => ms * 3.6;
const gait = (name) => HORSE.gaits.find((g) => g.name === name).speed;

describe('réalisme : allures du cheval', () => {
  it('pas 5,5 – 7 km/h, trot 12 – 18 km/h', () => {
    expect(kmh(gait('PAS'))).toBeGreaterThanOrEqual(5.5);
    expect(kmh(gait('PAS'))).toBeLessThanOrEqual(7);
    expect(kmh(gait('TROT'))).toBeGreaterThanOrEqual(12);
    expect(kmh(gait('TROT'))).toBeLessThanOrEqual(18);
  });
  it('galop de travail d’un parcours de CSO : 350 – 400 m/min', () => {
    const mpm = gait('GALOP') * 60;
    expect(mpm).toBeGreaterThanOrEqual(350);
    expect(mpm).toBeLessThanOrEqual(400);
  });
  it('galop allongé d’un cheval de sport : 45 – 55 km/h', () => {
    expect(kmh(gait('GRAND GALOP'))).toBeGreaterThanOrEqual(45);
    expect(kmh(gait('GRAND GALOP'))).toBeLessThanOrEqual(55);
  });
});

describe('réalisme : épreuves', () => {
  it('temps accordé = longueur / vitesse imposée (350 m/min national, 375 CSI, 400 Grand Prix)', () => {
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national)).toBe(47);
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.csi)).toBe(44);
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.gp)).toBe(41);
    // Parcours faisable au galop de travail réel, virages compris (tracé ~25 % plus long que la corde).
    expect(COURSE_LENGTH.cso / gait('GALOP')).toBeLessThan(47);
  });
  it('Grand Prix CSI 5★ entre 1,50 et 1,60 m ; qualificative jusqu’à 1,45 m', () => {
    const gp = STORY.find((s) => s.id === 'gp');
    const csi3 = STORY.find((s) => s.id === 'csi3');
    expect(gp.desc).toMatch(/1,50 m à 1,60 m/);
    expect(csi3.desc).toMatch(/1,45 m/);
  });
  it('premier concours (M3) au temps réglementaire national', () => {
    expect(CHAPTER1.m3.ta).toBe(47);
    expect(CHAPTER1.m3.ta - CHAPTER1.m3.ambitiousCut).toBe(44);
  });
  it('défi du Pôle v2 au temps réglementaire, v1 conservée à part', () => {
    expect(CURRENT_CHALLENGE).toBe(DEFI_POLE_V2);
    expect(DEFI_POLE_V2.timeAllowed).toBe(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national));
    expect(DEFI_POLE_V1.timeAllowed).toBe(75);
    expect(Object.isFrozen(DEFI_POLE_V2)).toBe(true);
  });
});

describe('réalisme : camion Strides', () => {
  it('porteur 7,5 t, limiteur 90 km/h, freinage d’urgence 6 – 8 m/s²', () => {
    expect(TRUCK_SPEC.massEmpty + 2 * TRUCK_SPEC.massHorse).toBeLessThanOrEqual(7500);
    expect(kmh(TRUCK_SPEC.limiter)).toBe(90);
    expect(TRUCK_SPEC.brakeDecel).toBeGreaterThanOrEqual(6);
    expect(TRUCK_SPEC.brakeDecel).toBeLessThanOrEqual(8);
  });
});
