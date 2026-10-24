import { describe, it, expect } from 'vitest';
import { HorseCondition } from '../../src/gameplay/condition.js';

const horse = (speed = 0) => ({ speed, def: { stamina: 1 }, _slope: 0 });
const run = (c, h, speed, secs) => {
  h.speed = speed;
  for (let t = 0; t < secs; t += 0.1) c.update(0.1);
};

describe('physiologie du cheval', () => {
  it('fréquence cardiaque de repos puis d’effort réaliste', () => {
    const h = horse();
    const c = new HorseCondition(h);
    run(c, h, 0, 30);
    expect(c.hr).toBeGreaterThan(30);
    expect(c.hr).toBeLessThan(45);
    run(c, h, 4, 60); // trot
    expect(c.hr).toBeGreaterThan(105);
    expect(c.hr).toBeLessThan(135);
    run(c, h, 14, 60); // galop
    expect(c.hr).toBeGreaterThan(190);
  });
  it('récupère au pas puis à l’arrêt, plus lentement qu’à la montée', () => {
    const h = horse();
    const c = new HorseCondition(h);
    run(c, h, 14, 90);
    run(c, h, 0, 30);
    expect(c.hr).toBeGreaterThan(110);
    run(c, h, 0, 120);
    expect(c.hr).toBeLessThan(105);
    run(c, h, 0, 480);
    expect(c.hr).toBeLessThan(64);
  });
  it('fatigue, chaleur et soif après un long galop ; malus de performance', () => {
    const h = horse();
    const c = new HorseCondition(h);
    run(c, h, 14, 300);
    expect(c.energy).toBeLessThan(60);
    expect(c.temp).toBeGreaterThan(39);
    expect(c.sweat).toBeGreaterThan(0.3);
    expect(c.hydration).toBeLessThan(97);
    run(c, h, 14, 400);
    expect(c.speedMul).toBeLessThan(1);
    expect(c.status).not.toBe('En pleine forme');
  });
  it('se sauvegarde et se recharge', () => {
    const c = new HorseCondition(horse(), { energy: 42, clean: 10 });
    const j = c.toJSON();
    expect(j.energy).toBe(42);
    const c2 = new HorseCondition(horse(), j);
    expect(c2.clean).toBe(10);
  });
});
