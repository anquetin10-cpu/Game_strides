import { describe, it, expect } from 'vitest';
import { BRANDS } from '../../src/partners/partners.js';
import { STX_LIVERY, slotArea, fitContent, neutralRect, stxSideContent } from '../../src/partners/liveries.js';

const slots = Object.values(STX_LIVERY.vehicles).flat();

describe('habillage STX des carrosseries', () => {
  it('quatre emplacements : Scania et Master, flanc gauche et flanc droit, sur des maillages fixes', () => {
    expect(Object.keys(STX_LIVERY.vehicles)).toEqual(['STX_Scania_DETAILLE', 'STX_Renault_Master_STALLE5']);
    for (const s of Object.values(STX_LIVERY.vehicles)) expect(s.map((x) => x.side).sort()).toEqual(['left', 'right']);
    for (const s of slots) {
      expect(s.mesh.every((m) => m.startsWith('exterior__'))).toBe(true);
      expect(s.keepOut.length).toBeGreaterThan(3);
      const a = slotArea(s);
      expect(a.w).toBeGreaterThan(1);
      expect(a.h).toBeGreaterThan(0.7);
    }
  });
  it('STX en attente : habillage neutre, jamais de logo', () => {
    expect(BRANDS.stx.status).toBe('pending');
    expect(stxSideContent()).toEqual({ kind: 'neutral' });
    // Autorisée sans fichier officiel, ou fichier sans autorisation : toujours neutre.
    expect(stxSideContent({ stx: { status: 'authorized', assets: { sideLogo: null } } }).kind).toBe('neutral');
    expect(stxSideContent({ stx: { status: 'pending', assets: { sideLogo: 'logo.png' } } }).kind).toBe('neutral');
    expect(stxSideContent({ stx: { status: 'disabled', assets: { sideLogo: 'logo.png' } } }).kind).toBe('neutral');
    expect(stxSideContent({ stx: { status: 'authorized', assets: { sideLogo: 'logo.png' } } })).toEqual({ kind: 'official', src: 'logo.png' });
  });
  it('logo inscrit dans l’emplacement à ses proportions (jamais déformé), dans la zone utile', () => {
    for (const s of slots) {
      const a = slotArea(s);
      for (const aspect of [0.5, 1, 2, 3.5, 6, 12]) {
        const r = fitContent(s, aspect);
        expect(r.w / r.h).toBeCloseTo(aspect, 9);
        expect(r.h).toBeLessThanOrEqual(s.height + 1e-9);
        expect(r.w).toBeLessThanOrEqual(s.maxWidth + 1e-9);
        expect(r.zc - r.w / 2).toBeGreaterThanOrEqual(a.z0 - 1e-9);
        expect(r.zc + r.w / 2).toBeLessThanOrEqual(a.z1 + 1e-9);
        expect(r.yc - r.h / 2).toBeGreaterThanOrEqual(a.y0 - 1e-9);
        expect(r.yc + r.h / 2).toBeLessThanOrEqual(a.y1 + 1e-9);
        // Une des bornes est atteinte (le logo est aussi grand que possible).
        expect(Math.min(s.height - r.h, s.maxWidth - r.w, a.w - r.w, a.h - r.h)).toBeLessThan(1e-9);
      }
    }
    expect(fitContent(slots[0], 0)).toBeNull();
    expect(fitContent(slots[0], NaN)).toBeNull();
  });
  it('habillage neutre : filet sur la largeur utile, dans la zone ; vide si configuré « none »', () => {
    for (const s of slots) {
      const a = slotArea(s), r = neutralRect(s);
      expect(r.w).toBeCloseTo(a.w, 9);
      expect(r.h).toBeLessThan(0.15);
      expect(r.yc - r.h / 2).toBeGreaterThanOrEqual(a.y0);
      expect(r.yc + r.h / 2).toBeLessThanOrEqual(a.y1);
      expect(neutralRect(s, { kind: 'none' })).toBeNull();
    }
  });
});
