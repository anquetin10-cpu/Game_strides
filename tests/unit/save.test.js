import { describe, it, expect } from 'vitest';
import { SaveSystem, SAVE_VERSION, defaultSave, validateSave, migrate, reputationTier, levelFor } from '../../src/core/save.js';
import { REPUTATION } from '../../src/config.js';
import { Metrics, EVENTS } from '../../src/core/metrics.js';

// Stockage factice (API localStorage).
function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}
function system(raw) {
  const s = new SaveSystem('t');
  s.store = fakeStore();
  if (raw !== undefined) s.store.setItem('t', raw);
  return s;
}
const v1 = () => ({ version: 1, started: true, playerName: 'Julie', money: 1200, xp: 950, completed: ['tuto', 'groom'], horses: ['comete', 'onyx'], upgrades: ['fers'], stats: { jobs: 7 }, settings: { sound: false }, gameTime: 40000 });

describe('sauvegarde v2', () => {
  it('migre une sauvegarde v1 en conservant une copie de secours', () => {
    const s = system(JSON.stringify(v1()));
    const d = s.load();
    expect(s.loadIssue).toBeNull();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.reputation).toBe(950);
    expect(d.xp).toBeUndefined();
    expect(d.completed).toEqual(['tuto', 'groom']);
    expect(d.horses).toEqual(['comete', 'onyx']);
    expect(d.upgrades).toEqual(['fers']);
    expect(d.stats.jobs).toBe(7);
    expect(d.stats.earned).toBe(0);
    expect(d.settings.sound).toBe(false);
    expect(d.skills.preparation).toBe(0);
    expect(d.rewards).toEqual({});
    // Copie de secours intacte et sauvegarde réécrite au nouveau format.
    expect(JSON.parse(s.store.getItem('t.backup.v1')).xp).toBe(950);
    expect(JSON.parse(s.store.getItem('t')).version).toBe(SAVE_VERSION);
    expect(s.hasSave()).toBe(true);
  });
  it('migre une sauvegarde v1 de débutant (R09) sans rien perdre', () => {
    const s = system(JSON.stringify({ version: 1, started: true, playerName: 'Tom', money: 55, xp: 60, completed: ['tuto'], horses: ['comete'], gameTime: 33000 }));
    const d = s.load();
    expect(s.loadIssue).toBeNull();
    expect(d.reputation).toBe(60);
    expect(d.completed).toEqual(['tuto']);
    expect(d.money).toBe(55);
    expect(reputationTier(d.reputation).title).toBe('Premiers contrats');
    expect(d.checkpoint).toBeNull();
    expect(JSON.parse(s.store.getItem('t.backup.v1')).xp).toBe(60);
  });
  it('ne remplace pas en silence une sauvegarde illisible', () => {
    const s = system('{"version":1,"started":true,"money":');
    const d = s.load();
    expect(d.money).toBe(0);
    expect(s.loadIssue.kind).toBe('corrupt');
    expect(s.hasSave()).toBe(false);
    expect(s.store.getItem('t.invalid')).toContain('"money":');
    // Verrou : aucune écriture tant qu'une décision explicite n'est pas prise.
    s.data.money = 99;
    s.saveNow();
    expect(s.store.getItem('t')).toBe('{"version":1,"started":true,"money":');
    expect(s.backups().some((b) => b.key === 't.invalid')).toBe(true);
    // Nouvelle partie explicite : le verrou est levé.
    s.reset();
    expect(s.loadIssue).toBeNull();
    expect(JSON.parse(s.store.getItem('t')).money).toBe(0);
  });
  it('signale une sauvegarde invalide et permet une restauration', () => {
    const bad = { ...v1(), money: 'beaucoup' };
    const s = system(JSON.stringify(bad));
    s.load();
    expect(s.loadIssue.kind).toBe('invalid');
    expect(s.loadIssue.detail).toContain('money');
    expect(s.restore('t.invalid')).toBe(false);
    const good = system(JSON.stringify(v1()));
    good.load();
    expect(s.importSave(good.exportSave())).toBe(true);
    expect(s.loadIssue).toBeNull();
    expect(s.data.reputation).toBe(950);
    expect(JSON.parse(s.store.getItem('t')).reputation).toBe(950);
  });
  it('refuse une sauvegarde plus récente que le jeu', () => {
    const s = system(JSON.stringify({ ...v1(), version: SAVE_VERSION + 1 }));
    s.load();
    expect(s.loadIssue.kind).toBe('version');
  });
  it('valide la sauvegarde par défaut et détecte les champs cassés', () => {
    expect(validateSave(defaultSave())).toEqual([]);
    expect(validateSave({ ...defaultSave(), horses: [] })).toContain('horses');
    expect(validateSave({ ...defaultSave(), completed: 'tuto' })).toContain('completed');
    expect(() => migrate({ version: 1, xp: 10 })).not.toThrow();
  });
  it('verse une récompense une seule fois', () => {
    const s = system();
    s.load();
    let paid = 0;
    expect(s.grantOnce('story:m1', () => paid++)).toBe(true);
    expect(s.grantOnce('story:m1', () => paid++)).toBe(false);
    expect(paid).toBe(1);
  });
  it('remplace les statuts par des paliers de réputation sans « Pro vérifié »', () => {
    expect(REPUTATION.map((r) => r.title).join(' ')).not.toMatch(/vérifié/i);
    expect(reputationTier(0).title).toBe('Premiers contrats');
    expect(reputationTier(950).level).toBe(3);
    expect(reputationTier(950).title).toBe('Référence locale');
    expect(levelFor(600).progress).toBeCloseTo(0.5);
  });
});

describe('mesure locale', () => {
  it('dédoublonne les événements uniques et par tentative, filtre les paramètres', () => {
    const s = system();
    s.load();
    const m = new Metrics(s, { endpoint: '' });
    expect(m.external).toBe(false);
    expect(m.track('game_started')).toBe(true);
    expect(m.track('game_started')).toBe(false);
    expect(m.track('first_mission_completed', { mission: 'tuto', name: 'Julie' })).toBe(true);
    expect(m.track('first_mission_completed', { mission: 'tuto' })).toBe(false);
    expect(m.log[1].params).toEqual({ mission: 'tuto', game_version: expect.any(String) });
    expect(m.track('challenge_completed', { attempt: 'a1', challenge_version: 'defi-pole-v1' })).toBe(true);
    expect(m.track('challenge_completed', { attempt: 'a1' })).toBe(false);
    expect(m.track('challenge_completed', { attempt: 'a2' })).toBe(true);
    expect(m.track('challenge_completed', {})).toBe(false);
    expect(m.track('strides_cta_shown', { placement: 'bilan' })).toBe(true);
    expect(m.track('strides_cta_shown', { placement: 'bilan' })).toBe(true);
    expect(m.track('inconnu')).toBe(false);
    expect(s.data.metrics.unique.first_mission_completed).toBe(true);
    expect(Object.keys(EVENTS).length).toBe(9);
  });
});
