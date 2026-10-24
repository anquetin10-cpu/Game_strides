import { describe, it, expect } from 'vitest';
import { tideLevel, tideEvents, tideCoef, tideState, temperature, rainTarget, dayCover, conditionText, wind } from '../../src/world/weather.js';

describe('marée', () => {
  it('alterne pleines et basses mers toutes les ~6 h 12', () => {
    const ev = tideEvents(0, 72);
    expect(ev.length).toBeGreaterThanOrEqual(11);
    for (let i = 1; i < ev.length; i++) {
      expect(ev[i].type).not.toBe(ev[i - 1].type);
      const dt = ev[i].t - ev[i - 1].t;
      expect(dt).toBeGreaterThan(5.4);
      expect(dt).toBeLessThan(7);
    }
    for (const e of ev) expect(e.type === 'PM' ? e.level > 0 : e.level < 0).toBe(true);
  });
  it('vives-eaux et mortes-eaux sur une lunaison', () => {
    const coefs = [];
    for (let d = 0; d < 15; d++) coefs.push(tideCoef(d * 24));
    expect(Math.max(...coefs)).toBeGreaterThan(100);
    expect(Math.min(...coefs)).toBeLessThan(45);
    for (const c of coefs) expect(c).toBeGreaterThanOrEqual(20);
  });
  it('le sable reste mouillé au-dessus du niveau quand la mer descend', () => {
    const ev = tideEvents(0, 24).find((e) => e.type === 'PM');
    const st = tideState(ev.t + 3);
    expect(st.rising).toBe(false);
    expect(st.wet).toBeGreaterThan(st.level + 0.2);
    expect(st.mark).toBeGreaterThanOrEqual(st.wet);
    expect(Math.abs(tideLevel(ev.t + 3) - st.level)).toBeLessThan(1e-9);
  });
});

describe('météo', () => {
  it('températures normandes plausibles, plus chaudes l’après-midi', () => {
    for (let d = 0; d < 9; d++) {
      expect(temperature(d, 15)).toBeGreaterThan(temperature(d, 6));
      for (let h = 0; h < 24; h += 3) {
        expect(temperature(d, h)).toBeGreaterThan(5);
        expect(temperature(d, h)).toBeLessThan(28);
      }
    }
  });
  it('pluie seulement les jours couverts, et décrite comme telle', () => {
    for (let d = 0; d < 9; d++) {
      for (let h = 0; h < 24; h += 0.5) {
        const r = rainTarget(d, h);
        if (dayCover(d) < 0.72) expect(r).toBe(0);
        if (r > 0.5) expect(conditionText(d, h)).toBe('Averses');
      }
    }
    const w = wind(3);
    expect(w.kmh).toBeGreaterThan(0);
    expect(['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']).toContain(w.dir);
  });
});
