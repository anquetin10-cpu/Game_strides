import { describe, it, expect } from 'vitest';
import {
  LIFE, periodOf, tierOf, drainPerHour, coffeeGain, napGain, sleepEnergy, nextWake, isBedtime,
  missionDemand, missionHours, inHours, missionAvailability, Energy, defaultLife,
} from '../../src/gameplay/energy.js';
import { STORY } from '../../src/gameplay/story.js';
import { competitionDef } from '../../src/gameplay/trip.js';
import { defaultSave } from '../../src/core/save.js';
import { Bus } from '../../src/core/bus.js';

const H = 3600;

describe('périodes de la journée', () => {
  it('matin 6–12, après-midi 12–18, soir 18–22, nuit 22–6', () => {
    expect(periodOf(6)).toBe('matin');
    expect(periodOf(11.99)).toBe('matin');
    expect(periodOf(12)).toBe('apresmidi');
    expect(periodOf(17.5)).toBe('apresmidi');
    expect(periodOf(18)).toBe('soir');
    expect(periodOf(21.9)).toBe('soir');
    expect(periodOf(22)).toBe('nuit');
    expect(periodOf(3)).toBe('nuit');
    expect(periodOf(5.99)).toBe('nuit');
    expect(periodOf(30)).toBe('matin');
  });
});

describe('paliers de fatigue', () => {
  it('en forme ≥ 60, légère fatigue 35–60, fatigue 15–35, épuisement < 15', () => {
    expect(tierOf(100)).toBe('high');
    expect(tierOf(60)).toBe('high');
    expect(tierOf(59.9)).toBe('medium');
    expect(tierOf(35)).toBe('medium');
    expect(tierOf(34)).toBe('low');
    expect(tierOf(15)).toBe('low');
    expect(tierOf(14.9)).toBe('critical');
    expect(tierOf(0)).toBe('critical');
  });
  it('effets légers : aucun en forme, course un peu ralentie fatigué, plus nette épuisé (jamais bloquante)', () => {
    expect(LIFE.malus.high).toEqual({ run: 1, sprint: 1, horse: 1 });
    expect(LIFE.malus.medium).toEqual({ run: 1, sprint: 1, horse: 1 });
    expect(LIFE.malus.low.run).toBeGreaterThanOrEqual(0.9);
    expect(LIFE.malus.critical.run).toBeGreaterThanOrEqual(0.85);
    expect(LIFE.malus.critical.horse).toBeGreaterThanOrEqual(0.9);
  });
});

describe('baisse progressive (équilibrage)', () => {
  it('une journée éveillée sans rien faire coûte ~30 points ; la nuit fatigue 1,5 fois plus', () => {
    let e = 100;
    for (let h = 7; h < 23; h++) e -= drainPerHour('idle', h);
    expect(100 - e).toBeGreaterThan(25);
    expect(100 - e).toBeLessThan(40);
    expect(drainPerHour('idle', 2)).toBeCloseTo(drainPerHour('idle', 14) * LIFE.nightMul);
  });
  it('une journée de travail (galop, missions) laisse de l’énergie le soir, mais une nuit blanche mène à la fatigue', () => {
    let e = 100;
    for (let h = 7; h < 22; h++) e -= drainPerHour(h % 3 ? 'canter' : 'walk', h);
    e -= 3 * LIFE.mission.normal;
    expect(e).toBeGreaterThan(35); // pas besoin de dormir toutes les 5 minutes
    for (let h = 22; h < 31; h++) e -= drainPerHour('idle', h);
    expect(tierOf(e)).not.toBe('high');
    expect(e).toBeLessThan(35);
  });
  it('même au galop toute la journée, on reste en forme de 7 h à 18 h (plus de 9 min réelles à 20 min la journée)', () => {
    let e = 100;
    for (let h = 7; h < 18; h++) e -= drainPerHour('canter', h);
    expect(e).toBeGreaterThanOrEqual(60);
    // 1 h de jeu = 50 s réelles.
    expect((40 / drainPerHour('canter', 12)) * 50).toBeGreaterThan(9 * 60);
  });
});

describe('récupération : café, sieste, nuit', () => {
  it('café : +12, +7, +3 puis plus rien, jamais au-delà de 70 %', () => {
    expect(coffeeGain(30, 0)).toBe(12);
    expect(coffeeGain(30, 1)).toBe(7);
    expect(coffeeGain(30, 2)).toBe(3);
    expect(coffeeGain(30, 3)).toBe(0);
    expect(coffeeGain(65, 0)).toBe(5);
    expect(coffeeGain(80, 0)).toBe(0);
  });
  it('trois cafés ne remplacent pas une nuit : de 10 % on reste sous 40 %', () => {
    let e = 10;
    for (let i = 0; i < 6; i++) e += coffeeGain(e, i);
    expect(e).toBe(32);
  });
  it('sieste : +25 (dégressif), plafonnée à 80 %, moins qu’une nuit', () => {
    expect(napGain(30, 0)).toBe(25);
    expect(napGain(30, 1)).toBe(15);
    expect(napGain(70, 0)).toBe(10);
    expect(napGain(85, 0)).toBe(0);
    expect(30 + napGain(30, 0)).toBeLessThan(sleepEnergy(30, 8));
  });
  it('nuit : pleine après 6 h, partielle sinon (14 points par heure)', () => {
    expect(sleepEnergy(20, 8)).toBe(100);
    expect(sleepEnergy(20, 6)).toBe(100);
    expect(sleepEnergy(20, 3)).toBe(62);
  });
  it('réveil à 7 h : le lendemain, ou le matin même avant 7 h ; coucher de 19 h à 6 h', () => {
    expect(nextWake(2 * 86400 + 22 * H)).toBe(3 * 86400 + 7 * H);
    expect(nextWake(2 * 86400 + 2 * H)).toBe(2 * 86400 + 7 * H);
    expect(nextWake(2 * 86400 + 14 * H)).toBe(3 * 86400 + 7 * H);
    expect(isBedtime(19)).toBe(true);
    expect(isBedtime(2)).toBe(true);
    expect(isBedtime(6.5)).toBe(true); // avant le réveil : une vraie (courte) nuit, pas « journée suivante »
    expect(isBedtime(7)).toBe(false);
    expect(isBedtime(15)).toBe(false);
  });
});

describe('missions : effort et horaires', () => {
  const byId = (id) => STORY.find((s) => s.id === id);
  it('concours, transports et longues missions sont exigeants ; les petites corvées sont légères', () => {
    expect(missionDemand(byId('cross'))).toBe('heavy');
    expect(missionDemand(byId('transport'))).toBe('heavy');
    expect(missionDemand(byId('m3'))).toBe('heavy');
    expect(missionDemand(competitionDef(1, 10))).toBe('heavy');
    expect(missionDemand(byId('groom'))).toBe('light');
    expect(missionDemand(byId('livraison'))).toBe('normal');
    expect(missionDemand({ category: 'Entraînement', vertical: 'EVENEMENTS' })).toBe('light');
  });
  it('la plupart en journée, quelques-unes le soir, très peu la nuit', () => {
    let night = 0, day = 0, evening = 0;
    for (const def of STORY) {
      const hr = missionHours(def);
      if (inHours(hr, 10)) day++;
      if (inHours(hr, 21.5)) evening++;
      if (inHours(hr, 2)) night++;
    }
    expect(day).toBe(STORY.length);
    expect(evening).toBeGreaterThan(0);
    expect(evening).toBeLessThan(day);
    expect(night).toBeLessThanOrEqual(2); // premiers pas, fugueur (urgence)
    expect(inHours(missionHours(byId('groom')), 15)).toBe(true);
    expect(inHours(missionHours(byId('groom')), 19)).toBe(false);
    // Première partie (9 h) : M1 reste proposée tout l'après-midi, même après un long tutoriel.
    expect(inHours(missionHours(byId('m1')), 17)).toBe(true);
    expect(inHours([16, 23], 22)).toBe(true);
    expect(inHours([22, 30], 3)).toBe(true);
  });
  it('refus expliqué : hors horaires, ou mission exigeante en épuisement ; jamais pour une mission à reprendre', () => {
    const offer = (def, extra = {}) => ({ def, ...extra });
    const cross = byId('cross');
    expect(missionAvailability(offer(cross), { hour: 10, energy: 80 }).ok).toBe(true);
    const late = missionAvailability(offer(cross), { hour: 23, energy: 80 });
    expect(late.ok).toBe(false);
    expect(late.kind).toBe('hours');
    expect(late.reason).toMatch(/Disponible de 7 h à 21 h/);
    const tired = missionAvailability(offer(cross), { hour: 10, energy: 10 });
    expect(tired.ok).toBe(false);
    expect(tired.kind).toBe('fatigue');
    expect(tired.reason).toMatch(/10 %/);
    // Mission légère acceptée même épuisé (liberté du joueur), mission exigeante acceptée dès 15 %.
    expect(missionAvailability(offer(byId('groom')), { hour: 8, energy: 5 }).ok).toBe(true);
    expect(missionAvailability(offer(cross), { hour: 10, energy: 15 }).ok).toBe(true);
    // Point de reprise enregistré, premiers pas : jamais bloqués.
    expect(missionAvailability(offer(cross, { resume: true }), { hour: 3, energy: 0 }).ok).toBe(true);
    expect(missionAvailability(offer(byId('tuto')), { hour: 3, energy: 0 }).ok).toBe(true);
  });
});

describe('gestionnaire d’énergie (en jeu)', () => {
  function game(hour = 9) {
    const bus = new Bus();
    const g = {
      bus,
      state: 'play',
      save: { data: defaultSave() },
      player: { mode: 'foot', human: { speed: 0 } },
      hud: { toasts: [], toast(t) { this.toasts.push(t); }, hint() {}, notify() {} },
      hour() { return (this.save.data.gameTime / 3600) % 24; },
      clockText: () => '9:00',
      saveSoon() {},
    };
    g.save.data.gameTime = hour * H;
    g.energy = new Energy(g);
    return g;
  }
  it('ancienne sauvegarde sans « life » : 100 % par défaut', () => {
    const g = game();
    delete g.save.data.life;
    expect(g.energy.value).toBe(100);
    expect(g.save.data.life).toEqual(defaultLife());
  });
  it('dépense selon l’heure qui passe (rien quand l’heure ne bouge pas : jeu en pause)', () => {
    const g = game();
    g.energy.update();
    g.energy.update();
    expect(g.energy.value).toBe(100);
    for (let i = 0; i < 60; i++) {
      g.save.data.gameTime += H / 60;
      g.energy.update();
    }
    expect(g.energy.value).toBeCloseTo(100 - LIFE.base, 0);
    g.player.human.speed = 7;
    for (let i = 0; i < 60; i++) {
      g.save.data.gameTime += H / 60;
      g.energy.update();
    }
    expect(100 - LIFE.base * 2 - LIFE.act.sprint - g.energy.value).toBeLessThan(0.3);
  });
  it('saut de temps (trajet) compté au plus 6 h ; recul de l’heure (défi rejouable) ignoré', () => {
    const g = game();
    g.energy.update();
    g.save.data.gameTime += 20 * H;
    g.energy.update();
    expect(g.energy.value).toBeGreaterThan(100 - 6 * LIFE.base * LIFE.nightMul - 0.5);
    const e = g.energy.value;
    g.save.data.gameTime -= 30 * H;
    g.energy.update();
    expect(g.energy.value).toBe(e);
  });
  it('mission terminée : coût selon l’effort ; échouée : la moitié', () => {
    const g = game();
    g.bus.emit('mission:complete', { run: { def: STORY.find((s) => s.id === 'cross') } });
    expect(g.energy.value).toBe(100 - LIFE.mission.heavy);
    g.bus.emit('mission:fail', { def: STORY.find((s) => s.id === 'livraison') });
    expect(g.energy.value).toBe(100 - LIFE.mission.heavy - LIFE.mission.normal / 2);
  });
  it('café dégressif, sieste, nuit qui remet les compteurs à zéro ; tout est dans la sauvegarde', () => {
    const g = game();
    g.energy.set(20);
    expect(g.energy.coffee()).toBe(12);
    expect(g.energy.coffee()).toBe(7);
    expect(g.energy.nap()).toBe(25);
    expect(g.save.data.life).toMatchObject({ energy: 64, coffees: 2, naps: 1 });
    g.energy.sleep(8);
    expect(g.save.data.life).toMatchObject({ energy: 100, coffees: 0, naps: 0 });
    // Sauvegarde / rechargement : le JSON garde l'énergie.
    g.energy.set(41.5);
    const back = JSON.parse(JSON.stringify(g.save.data));
    expect(back.life.energy).toBe(41.5);
  });
  it('défi rejouable : ni coût de tentative, ni dépense au retour de l’heure du joueur', () => {
    const g = game(15);
    g.save.data.gameTime = 4 * 86400 + 15 * H;
    g.energy.update();
    // Pendant le défi : heure imposée (jour 2, 11 h).
    g.challenge = { active: { cfg: {} } };
    g.save.data.gameTime = 2 * 86400 + 11 * H;
    g.energy.update();
    // Fin de tentative : le défi est nettoyé (heure du joueur rétablie) avant l'événement de fin de mission.
    g.challenge.active = null;
    g.save.data.gameTime = 4 * 86400 + 15 * H;
    g.bus.emit('mission:complete', { run: { def: { id: 'cso-a', challenge: 'cso-a', vertical: 'EVENEMENTS', category: 'Défi' } } });
    g.energy.update();
    g.save.data.gameTime += 60;
    g.energy.update();
    expect(g.energy.value).toBeGreaterThan(99.9);
  });
  it('avertissements progressifs, une fois par palier', () => {
    const g = game();
    g.energy.set(100);
    g.energy.set(55);
    g.energy.set(58);
    g.energy.set(54);
    expect(g.hud.toasts.length).toBe(1);
  });
});

describe('lit et concours engagé (heure de passage absolue)', async () => {
  const { Rest } = await import('../../src/gameplay/rest.js');
  const mk = (hour, startHour, startAt) => {
    const g = {
      save: { data: defaultSave() },
      interact: { add() {} },
      player: { locked: false },
      hour() { return (this.save.data.gameTime / 3600) % 24; },
      missions: { active: { def: { id: 'concours' }, data: { startHour, startAt } } },
    };
    g.save.data.gameTime = 3 * 86400 + hour * H;
    return new Rest(g);
  };
  it('engagé à 17 h pour 8 h 45 le lendemain : la nuit et la sieste sont permises le soir', () => {
    const r = mk(20, 8.75, 4 * 86400 + 8.75 * H);
    expect(r.passageConflict(11)).toBe(null); // coucher à 20 h, réveil 7 h, passage 8 h 45
    expect(r.passageConflict(1.5)).toBe(null);
  });
  it('passage ce soir à 19 h 30 : pas de nuit ni de sieste à 18 h 30 ; en retard : pas de repos', () => {
    const r = mk(18.5, 19.5, 3 * 86400 + 19.5 * H);
    expect(r.passageConflict(12.5)).toMatch(/pas le temps/);
    expect(r.passageConflict(1.5)).toMatch(/pas le temps/);
    const late = mk(20, 19.5, 3 * 86400 + 19.5 * H);
    expect(late.passageConflict(1.5)).toMatch(/était prévu/);
  });
});

describe('notifications : seulement pour une demande acceptable maintenant', async () => {
  const { MissionManager } = await import('../../src/gameplay/missions.js');
  it('« Groom du matin » arrivée à 23 h : pas de notification ; notifiée au matin', () => {
    const notifs = [];
    const g = {
      state: 'play', time: 0, simClock: 0,
      save: { data: defaultSave() },
      hud: { notify: (n) => notifs.push(n.title), toast() {}, setPhoneBadge() {} },
      phone: { refresh() {} },
      distanceTo: () => 100,
      hour() { return (this.save.data.gameTime / 3600) % 24; },
      levelInfo: () => ({ level: 1 }),
    };
    g.energy = new Energy({ ...g, bus: new Bus() });
    g.energy.game = g;
    const d = g.save.data;
    d.completed.push('tuto', 'm1', 'm2', 'm3');
    d.gameTime = 23 * H;
    const m = new MissionManager(g);
    m.refreshOffers(true);
    expect(m.offers.some((o) => o.id === 'story:groom')).toBe(true);
    expect(notifs.length).toBe(0);
    d.gameTime = 86400 + 7 * H;
    m.refreshOffers(true);
    expect(notifs.length).toBe(1);
    expect(notifs[0]).toMatch(/Camille/);
  });
});
