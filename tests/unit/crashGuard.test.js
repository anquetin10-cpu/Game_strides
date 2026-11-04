// Relance après un arrêt brutal (page arrêtée par le système, voir src/core/crashGuard.js).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startCrashGuard } from '../../src/core/crashGuard.js';

const KEY = 'strides-run-guard';
let store, docL, winL;
beforeEach(() => {
  vi.useFakeTimers();
  store = new Map();
  docL = {};
  winL = {};
  vi.stubGlobal('localStorage', { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: (t, f) => (docL[t] = f) });
  vi.stubGlobal('addEventListener', (t, f) => (winL[t] = f));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mark = () => JSON.parse(store.get(KEY) || 'null');

describe('Relance après un arrêt brutal', () => {
  it('premier lancement : aucun arrêt, marque posée tant que la page est affichée', () => {
    const g = startCrashGuard();
    expect(g.crashes).toBe(0);
    expect(mark().n).toBe(0);
  });

  it('marque restée (page arrêtée pendant qu’elle était affichée) : arrêts consécutifs comptés', () => {
    startCrashGuard();
    expect(startCrashGuard().crashes).toBe(1); // la page précédente n'a pas été quittée proprement
    expect(startCrashGuard().crashes).toBe(2);
  });

  it('page quittée ou masquée : marque retirée, lancement suivant normal', () => {
    startCrashGuard();
    document.visibilityState = 'hidden';
    docL.visibilitychange();
    expect(store.has(KEY)).toBe(false);
    document.visibilityState = 'visible';
    docL.visibilitychange();
    expect(store.has(KEY)).toBe(true); // de nouveau affichée : protégée
    winL.pagehide();
    expect(startCrashGuard().crashes).toBe(0);
  });

  it('partie restée affichée 3 min : les arrêts précédents ne comptent plus', () => {
    startCrashGuard();
    const g = startCrashGuard();
    expect(g.crashes).toBe(1);
    vi.advanceTimersByTime(3 * 60e3);
    expect(mark().n).toBe(0);
    expect(startCrashGuard().crashes).toBe(1); // un nouvel arrêt compte comme le premier
  });

  it('marque ancienne (plus de 6 h) ignorée ; stockage indisponible sans erreur', () => {
    store.set(KEY, JSON.stringify({ t: Date.now() - 7 * 3600e3, n: 3 }));
    expect(startCrashGuard().crashes).toBe(0);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); }, removeItem: () => {} });
    expect(startCrashGuard().crashes).toBe(0);
  });
});
