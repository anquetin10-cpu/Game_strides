import { describe, it, expect, vi } from 'vitest';
import { HorseCondition, installCare } from '../../src/gameplay/condition.js';

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

describe('gestes de soin', () => {
  const setup = () => {
    const defs = {};
    const mk = (id) => {
      const h = { id, speed: 0, def: { stamina: 1 }, _slope: 0, pos: { x: 0, z: 0 } };
      h.cond = new HorseCondition(h, { clean: 20, satiety: 40 });
      return h;
    };
    const a = mk('comete'), b = mk('autre');
    const g = {
      player: { locked: false, horse: a, human: { carrying: null } },
      mainHorse: a,
      hud: { toast() {} },
      interact: { add: (id, d) => (defs[id] = d) },
      save: { data: { horseCare: { comete: a.cond.toJSON(), autre: b.cond.toJSON() } } },
      saveSoon() {},
    };
    installCare(g);
    return { defs, a, b, g };
  };
  it('soigne le cheval du départ et ne libère pas un verrou pris entre-temps', () => {
    vi.useFakeTimers();
    const { defs, a, b, g } = setup();
    defs['care-groom'].action();
    expect(g.player.locked).toBeTruthy();
    // Changement de cheval puis dialogue pendant le pansage.
    g.player.horse = g.mainHorse = b;
    g.player.locked = true;
    vi.advanceTimersByTime(4100);
    expect(a.cond.clean).toBe(100);
    expect(b.cond.clean).toBe(20);
    expect(g.save.data.horseCare.comete.clean).toBe(100);
    expect(g.player.locked).toBe(true);
    vi.useRealTimers();
  });
  it('une nouvelle brassée de foin relance la minute de repos', () => {
    vi.useFakeTimers();
    const { defs, a, g } = setup();
    defs['care-hay'].action();
    vi.advanceTimersByTime(3100);
    expect(g.player.locked).toBe(false);
    expect(a.cond.resting).toBe(true);
    vi.advanceTimersByTime(47000);
    defs['care-hay'].action();
    vi.advanceTimersByTime(3100 + 15000);
    expect(a.cond.resting).toBe(true);
    vi.advanceTimersByTime(45000);
    expect(a.cond.resting).toBe(false);
    vi.useRealTimers();
  });
});
