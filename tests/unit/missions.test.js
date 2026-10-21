import { describe, it, expect, beforeEach } from 'vitest';
import { MissionManager } from '../../src/gameplay/missions.js';
import { STORY } from '../../src/gameplay/story.js';
import { generateJob } from '../../src/gameplay/jobs.js';
import { defaultSave } from '../../src/core/save.js';
import { Bus } from '../../src/core/bus.js';
import { HORSES, SHOP, PROS, STABLES } from '../../src/gameplay/data.js';

function mockGame() {
  const g = {
    state: 'play',
    time: 0,
    bus: new Bus(),
    save: { data: defaultSave() },
    notifs: [],
    toasts: [],
    hud: {
      notify: (n) => g.notifs.push(n), toast: (t) => g.toasts.push(t), setPhoneBadge() {}, big() {}, setObjective() {}, clearHint() {}, hint() {},
      dialog: (lines, cb) => (g.dialogCb = cb), advanceDialog() {},
    },
    phone: { refresh() {}, _offerTab: () => 'missions', close() {} },
    audio: { notify() {}, tone() {}, cheer() {}, fault() {}, snort() {}, neigh() {}, success() {}, fail() {}, levelUp() {} },
    gps: { set() {}, clear() {}, target: null },
    interact: { add() {}, remove() {}, list: new Map() },
    distanceTo: () => 250,
    spawnHuman: (o, x, z) => ({ pos: { x, z }, pose: 'stand' }),
    spawnHorse: (d, x, z) => ({ id: d.id, pos: { x, z }, anim: {}, setPosition() {}, frozen: false }),
    despawn() {},
    player: { locked: false, mode: 'foot', focus: { pos: { x: 0, z: 0 } }, horse: { pos: { x: 0, z: 0 }, gait: 0 }, human: { carry() {}, drop() {} }, truck: { pos: { x: 0, z: 0 } } },
    screens: { missionResult: (r, cb) => (g.result = r) && cb, missionFailed: (reason) => (g.failReason = reason) },
    updateWallet() {},
    saveNow() {},
    saveSoon() {},
    restoreAfterMission() {},
    message() {},
  };
  return g;
}

describe('données', () => {
  it('a des chevaux, équipements, pros et écuries cohérents', () => {
    expect(HORSES.comete.price).toBe(0);
    for (const h of Object.values(HORSES)) expect(h.speed).toBeGreaterThan(0.8);
    for (const s of SHOP) expect(s.price).toBeGreaterThanOrEqual(0);
    expect(PROS.some((p) => p.id === 'lemaire')).toBe(true);
    expect(STABLES.find((s) => s.id === 'dunes').price).toBeLessThan(500);
  });
});

describe('histoire', () => {
  it('chaîne les 12 missions avec des prérequis valides', () => {
    const ids = STORY.map((s) => s.id);
    expect(ids.length).toBe(12);
    for (const s of STORY) for (const r of s.requires || []) expect(ids.indexOf(r)).toBeLessThan(ids.indexOf(s.id));
    expect(STORY.every((s) => ['JOBS', 'TRANSPORT', 'EVENEMENTS', 'ANNUAIRE', 'ECURIES'].includes(s.vertical))).toBe(true);
    // Chaque univers Strides est illustré.
    for (const v of ['JOBS', 'TRANSPORT', 'EVENEMENTS', 'ANNUAIRE', 'ECURIES']) expect(STORY.some((s) => s.vertical === v)).toBe(true);
  });
  it('atteint le statut Légende en terminant l’histoire', () => {
    const xp = STORY.reduce((a, s) => a + s.xp, 0);
    expect(xp).toBeGreaterThanOrEqual(3200);
  });
});

describe('MissionManager', () => {
  let g, m;
  beforeEach(() => {
    g = mockGame();
    m = new MissionManager(g);
    g.missions = m;
  });
  it('propose d’abord le tutoriel, avec notification', () => {
    m.refreshOffers(true);
    expect(m.offers.map((o) => o.id)).toContain('story:tuto');
    expect(g.notifs.length).toBe(1);
    // Comme dans l'app : on répond depuis l'écran de la demande (pas d'acceptation directe).
    expect(g.notifs[0].actions.map((a) => a.label)).toEqual(['Plus tard', 'Répondre à la demande']);
  });
  it('le client accepte une contre-proposition raisonnable et décline une hausse excessive', () => {
    m.refreshOffers(false);
    const o = m.offers.find((x) => x.id === 'story:tuto');
    const pay = o.pay;
    o.counter = { amount: Math.round(pay * 1.1), at: g.time };
    g.time += 8;
    m.update(1 / 30);
    expect(o.counter).toBeNull();
    expect(o.pay).toBe(Math.round(pay * 1.1));
    expect(o.counterAccepted).toBe(true);
    expect(g.notifs.at(-1).title).toBe('Contre-proposition acceptée');
    o.counter = { amount: o.pay * 2, at: g.time };
    g.time += 8;
    m.update(1 / 30);
    expect(o.pay).toBe(Math.round(pay * 1.1));
    expect(g.notifs.at(-1).title).toBe('Contre-proposition déclinée');
  });
  it('permet de refuser puis re-propose la mission plus tard', () => {
    m.refreshOffers(false);
    m.refuse('story:tuto');
    expect(m.offers.find((o) => o.id === 'story:tuto')).toBeUndefined();
    m.refreshOffers(false);
    expect(m.offers.find((o) => o.id === 'story:tuto')).toBeUndefined();
    g.time = 60;
    m.refreshOffers(false);
    expect(m.offers.find((o) => o.id === 'story:tuto')).toBeDefined();
  });
  it('démarre la mission acceptée et refuse un second cumul', () => {
    m.refreshOffers(false);
    expect(m.accept('story:tuto')).toBe(true);
    expect(m.active.offer.title).toBe('Premiers pas');
    g.save.data.completed.push('tuto');
    m.refreshOffers(false);
    const other = m.offers.find((o) => !o.locked);
    expect(m.accept(other.id)).toBe(false);
  });
  it('verrouille les missions au-dessus du statut', () => {
    g.save.data.completed.push('tuto', 'groom', 'livraison', 'fugueur');
    m.refreshOffers(false);
    const locked = m.offers.filter((o) => o.locked);
    expect(locked.length).toBeGreaterThan(0);
    expect(m.accept(locked[0].id)).toBe(false);
  });
  it('paie, note et fait progresser à la fin d’une mission', () => {
    m.refreshOffers(false);
    m.accept('story:tuto');
    const run = m.active;
    run.finished = false;
    m.complete(run);
    expect(g.save.data.money).toBeGreaterThanOrEqual(50);
    expect(g.save.data.completed).toContain('tuto');
    expect(g.save.data.ratings.length).toBe(1);
    expect(g.result.irl).toMatch(/vraie vie/);
  });
});

describe('jobs générés', () => {
  it('produit des offres valides à tous les niveaux', () => {
    const g = mockGame();
    for (let lvl = 1; lvl <= 5; lvl++) {
      for (let i = 0; i < 25; i++) {
        const j = generateJob(g, i, lvl);
        expect(j.title).toBeTruthy();
        expect(j.pay).toBeGreaterThan(0);
        expect(['JOBS', 'TRANSPORT']).toContain(j.vertical);
        if (lvl < 2) expect(j.vertical).toBe('JOBS');
        expect(typeof j.steps).toBe('function');
      }
    }
  });
});
