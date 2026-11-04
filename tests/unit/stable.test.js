import { describe, it, expect } from 'vitest';
import { HORSES, ownedHorses, activeHorseId } from '../../src/gameplay/data.js';
import { SaveSystem, defaultSave } from '../../src/core/save.js';

// Écurie du joueur : cheval à l'essai (Tripo) disponible dans toutes les parties sans modifier la sauvegarde.
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
// Ancienne sauvegarde : Comète seule, montée.
const oldSave = () => ({ version: 2, started: true, playerName: 'Julie', avatar: 'f', money: 1840, reputation: 420, completed: ['tuto', 'groom'], horses: ['comete'], activeHorse: 'comete', upgrades: ['selle'], horseCare: { comete: { energy: 70 } }, horseshoes: [3], stats: { jobs: 4, earned: 900, distance: 1200, jumps: 9, faults: 1 }, settings: { characters: 'classic', horses: 'classic' }, gameTime: 40000 });

describe('écurie : cheval à l’essai Tripo', () => {
  it('Tripo : modèle propre, aptitudes de Comète, ni loué ni vendu, à l’essai', () => {
    const tp = HORSES.tripo;
    expect(tp.id).toBe('tripo');
    expect(tp.name).toBe('Tripo');
    expect(tp.model).toBe('horse_tripo');
    expect(tp.trial).toBe(true);
    expect(tp.price).toBe(0);
    expect(tp.value).toBeUndefined();
    for (const k of ['speed', 'jump', 'stamina']) expect(tp[k]).toBe(HORSES.comete[k]);
    expect(tp.socks).toEqual([true, true, true, true]);
    expect(tp.blaze).toBe(true);
    expect(typeof tp.coat.body).toBe('string');
    // Comète et les chevaux en location : inchangés, sans modèle propre.
    expect(HORSES.comete.model).toBeUndefined();
    expect(Object.values(HORSES).filter((h) => h.model).map((h) => h.id)).toEqual(['tripo']);
    expect(Object.values(HORSES).filter((h) => h.price).map((h) => h.id)).toEqual(['ulysse', 'onyx', 'saphir']);
  });

  it('nouvelle partie : Comète puis Tripo, Comète montée', () => {
    const d = defaultSave();
    expect(d.horses).toEqual(['comete']);
    expect(ownedHorses(d)).toEqual(['comete', 'tripo']);
    expect(activeHorseId(d)).toBe('comete');
  });

  it('ancienne sauvegarde : chargée sans changement, Tripo disponible en deuxième position', () => {
    const raw = JSON.stringify(oldSave());
    const s = system(raw);
    const d = s.load();
    expect(s.loadIssue).toBeNull();
    // Rien n'est réécrit au chargement (même version) : la sauvegarde stockée est intacte.
    expect(s.store.getItem('t')).toBe(raw);
    expect(d.horses).toEqual(['comete']);
    expect(d.activeHorse).toBe('comete');
    expect(d.money).toBe(1840);
    expect(d.horseCare).toEqual({ comete: { energy: 70 } });
    expect(ownedHorses(d)).toEqual(['comete', 'tripo']);
    expect(activeHorseId(d)).toBe('comete');
    // Chevaux loués : conservés, Tripo juste après Comète.
    expect(ownedHorses({ ...d, horses: ['comete', 'onyx', 'ulysse'] })).toEqual(['comete', 'tripo', 'onyx', 'ulysse']);
  });

  it('Tripo sellé : choix enregistré dans activeHorse seulement, relu au chargement', () => {
    const s = system(JSON.stringify(oldSave()));
    s.load();
    s.data.activeHorse = 'tripo';
    s.saveNow();
    const again = system(s.store.getItem('t'));
    const d = again.load();
    expect(again.loadIssue).toBeNull();
    expect(d.activeHorse).toBe('tripo');
    expect(d.horses).toEqual(['comete']);
    expect(activeHorseId(d)).toBe('tripo');
  });

  it('identifiants inconnus (cheval retiré du jeu) : ignorés, retour à Comète, sauvegarde non modifiée', () => {
    const d = { ...defaultSave(), horses: ['comete', 'pegase', 'comete'], activeHorse: 'pegase' };
    expect(ownedHorses(d)).toEqual(['comete', 'tripo']);
    expect(activeHorseId(d)).toBe('comete');
    expect(d.horses).toEqual(['comete', 'pegase', 'comete']);
    expect(d.activeHorse).toBe('pegase');
    // Écurie sans aucun cheval connu : Comète reste.
    expect(ownedHorses({ horses: ['pegase'] })).toEqual(['comete', 'tripo']);
    expect(activeHorseId({ horses: ['pegase'], activeHorse: 'tripo' })).toBe('tripo');
    // Tripo écrit dans la liste par une autre version : pas de doublon.
    expect(ownedHorses({ horses: ['comete', 'tripo', 'onyx'] })).toEqual(['comete', 'tripo', 'onyx']);
  });

  it('Tripo retiré plus tard du jeu : une sauvegarde où il est sellé revient à Comète', () => {
    const saved = HORSES.tripo;
    try {
      delete HORSES.tripo;
      const d = { ...defaultSave(), activeHorse: 'tripo' };
      expect(ownedHorses(d)).toEqual(['comete']);
      expect(activeHorseId(d)).toBe('comete');
    } finally {
      HORSES.tripo = saved;
    }
  });
});
