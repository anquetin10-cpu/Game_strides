import { describe, it, expect } from 'vitest';
import { passageHour } from '../../src/gameplay/trip.js';
import { nextMorning, WAKE_HOUR } from '../../src/gameplay/rest.js';

describe('concours : heures de passage de jour ou en soirée sous les projecteurs', () => {
  it('engagement en journée : passage ~5 h plus tard, jamais avant 8 h 30', () => {
    expect(passageHour(10)).toBe(15);
    expect(passageHour(4)).toBe(9);
    expect(passageHour(3.5)).toBe(8.5);
    expect(passageHour(16)).toBe(21);
  });
  it('engagement en soirée ou la nuit : passage le lendemain matin, entre 8 h 30 et 10 h', () => {
    for (const h of [16.5, 19, 21.4, 23.9, 0, 2, 3.4]) {
      const p = passageHour(h, () => 0.99);
      expect(p).toBeGreaterThanOrEqual(8.5);
      expect(p).toBeLessThanOrEqual(10);
    }
  });
  it('aucune épreuve entre 21 h et 8 h 30', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const p = passageHour(h, Math.random);
      expect(p >= 8.5 && p <= 21).toBe(true);
    }
  });
});

describe('repos : dormir jusqu’au matin', () => {
  it('réveil à 7 h le lendemain (ou le jour même avant 7 h)', () => {
    const day = 86400;
    expect(nextMorning(3 * day + 22 * 3600)).toBe(4 * day + WAKE_HOUR * 3600);
    expect(nextMorning(3 * day + 2 * 3600)).toBe(3 * day + WAKE_HOUR * 3600);
    expect(nextMorning(3 * day + 7 * 3600)).toBe(4 * day + WAKE_HOUR * 3600);
  });
});
