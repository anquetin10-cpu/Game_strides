import { describe, it, expect } from 'vitest';
import { BRANDS, brandAuthorized, brandName } from '../../src/partners/partners.js';
import { CAMPAIGNS, NIGHT_SLOT, campaignLive, slotProgram } from '../../src/partners/campaigns.js';

describe('marques et campagnes', () => {
  it('Strides autorisée avec son logo officiel ; Kingsland et STX en attente (habillage neutre)', () => {
    expect(brandAuthorized('strides', 'logoFull')).toBe(true);
    expect(brandAuthorized('kingsland')).toBe(false);
    expect(brandAuthorized('stx', 'sideLogo')).toBe(false);
    expect(brandName('kingsland')).toBe(BRANDS.kingsland.neutral.name);
    expect(brandName('strides')).toBe('Strides');
  });
  it('emplacement de nuit : place 1 Kingsland (neutre tant que non autorisée), place 2 Strides', () => {
    const p = slotProgram('night', Date.parse('2026-11-02T00:00:00Z'));
    expect(p.length).toBe(NIGHT_SLOT.places);
    expect(p[0]).toMatchObject({ place: 1, advertiser: 'kingsland', neutral: true });
    expect(p[1]).toMatchObject({ place: 2, advertiser: 'strides', neutral: false });
    expect(p[1].campaign.id).toBe('strides-nuit-v1');
  });
  it('une campagne hors dates, non autorisée ou sans média n’est pas diffusée', () => {
    const s = CAMPAIGNS.find((c) => c.advertiser === 'strides');
    expect(campaignLive(s, Date.parse('2026-10-15T00:00:00Z'))).toBe(false);
    expect(campaignLive({ ...s, status: 'pending' })).toBe(false);
    expect(campaignLive({ ...s, end: '2026-11-01' }, Date.parse('2026-11-05T00:00:00Z'))).toBe(false);
    const k = CAMPAIGNS.find((c) => c.advertiser === 'kingsland');
    expect(campaignLive({ ...k, status: 'authorized' })).toBe(false); // marque non autorisée, pas de visuel
  });
  it('campagne vidéo : diffusée seulement avec son film, marque et campagne autorisées', () => {
    const v = { id: 'v', advertiser: 'strides', slot: 'night', order: 2, duration: 4.5, start: '2026-11-01', end: null, status: 'authorized', creative: { type: 'video', src: null } };
    const now = Date.parse('2026-11-02T00:00:00Z');
    expect(campaignLive(v, now)).toBe(false);
    expect(campaignLive({ ...v, creative: { type: 'video', src: '/film.mp4' } }, now)).toBe(true);
    expect(campaignLive({ ...v, advertiser: 'kingsland', creative: { type: 'video', src: '/film.mp4' } }, now)).toBe(false);
  });
  it('durées configurables, « Passer » possible', () => {
    for (const c of CAMPAIGNS) expect(c.duration).toBeGreaterThanOrEqual(4);
    expect(NIGHT_SLOT.skipAfter).toBeLessThanOrEqual(1.5);
  });
});
