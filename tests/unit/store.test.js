// Boutique d'équitation de Deauville City : habillage de marque (neutre tant que la marque n'est pas autorisée),
// aménagement (rayons accessibles, collisions, lumières), catalogue (emplacements rendus, anciens articles conservés).
import { describe, it, expect, afterEach } from 'vitest';
import { BRANDS } from '../../src/partners/partners.js';
import { storeSkin, STORE_BRAND } from '../../src/world/storeSkin.js';
import { SHOPS3D } from '../../src/world/sites.js';
import { STORE_LAYOUT } from '../../src/world/storeInterior.js';
import { WALL_T } from '../../src/world/shopGeo.js';
import { SHOP, SHOP_CATS, SLOTS, WEAR_SLOTS, HORSE_LOOK_SLOTS } from '../../src/gameplay/data.js';

const saved = JSON.parse(JSON.stringify({ status: BRANDS.kingsland.status, assets: BRANDS.kingsland.assets }));
afterEach(() => {
  BRANDS.kingsland.status = saved.status;
  BRANDS.kingsland.assets = { ...saved.assets };
});

describe('boutique d’équitation : habillage de marque', () => {
  it('marque en attente : nom et sous-titre neutres, aucun logo ni visuel', () => {
    expect(STORE_BRAND).toBe('kingsland');
    const s = storeSkin();
    expect(s.official).toBe(false);
    expect(s.name).toBe(BRANDS.kingsland.neutral.name);
    expect(s.logo).toBeNull();
    expect(s.storefront).toBeNull();
    expect(SHOPS3D.boutique.name).toBe(BRANDS.kingsland.neutral.name);
    expect(SHOPS3D.boutique.brand).toBe('kingsland');
    expect(`${SHOPS3D.boutique.name} ${SHOPS3D.boutique.sub}`).not.toMatch(/kingsland/i);
  });
  it('une ressource fournie sans autorisation reste masquée', () => {
    BRANDS.kingsland.assets = { ...saved.assets, logo: 'logo-officiel.png' };
    expect(storeSkin().logo).toBeNull();
    expect(storeSkin().name).toBe(BRANDS.kingsland.neutral.name);
  });
  it('marque autorisée : nom officiel ; logo et visuel de vitrine seulement s’ils sont fournis', () => {
    BRANDS.kingsland.status = 'authorized';
    let s = storeSkin();
    expect(s.official).toBe(true);
    expect(s.name).toBe(BRANDS.kingsland.name);
    expect(s.logo).toBeNull();
    BRANDS.kingsland.assets = { ...saved.assets, logo: 'logo-officiel.png', storefront: 'vitrine-officielle.jpg' };
    s = storeSkin();
    expect(s.logo).toBe('logo-officiel.png');
    expect(s.storefront).toBe('vitrine-officielle.jpg');
    BRANDS.kingsland.status = 'disabled';
    expect(storeSkin().logo).toBeNull();
    expect(storeSkin().name).toBe(BRANDS.kingsland.neutral.name);
  });
});

describe('boutique d’équitation : aménagement', () => {
  const S = SHOPS3D.boutique;
  const hw = S.w / 2 - WALL_T, hd = S.d / 2 - WALL_T;
  const inBox = ([x, z], [bx, bz, w, d], m = 0) => Math.abs(x - bx) < w + m && Math.abs(z - bz) < d + m;
  it('même bâtiment, même porte, même identifiant que l’ancienne boutique', () => {
    expect(S.id).toBe('boutique');
    expect([S.x, S.z, S.w, S.d]).toEqual([-41.7, -262, 10, 11]);
    expect(S.openings.find((o) => o[2] === 'door')).toEqual([-0.7, 0.7, 'door']);
  });
  it('rayons, arrivée et sortie dans la pièce, hors du mobilier (marge d’un personnage)', () => {
    const pts = [...STORE_LAYOUT.fixtures.map((f) => f.at), STORE_LAYOUT.spawn, STORE_LAYOUT.exit];
    for (const p of pts) {
      expect(Math.abs(p[0])).toBeLessThan(hw - 0.3);
      expect(Math.abs(p[1])).toBeLessThan(hd - 0.2);
      for (const c of STORE_LAYOUT.colliders) expect(inBox(p, c, 0.3)).toBe(false);
    }
  });
  it('mobilier dans la pièce, six points lumineux au plus, personnel et deux clientes', () => {
    for (const [x, z, w, d] of STORE_LAYOUT.colliders) {
      expect(Math.abs(x) + w).toBeLessThanOrEqual(hw + 0.05);
      expect(Math.abs(z) + d).toBeLessThanOrEqual(hd + 0.05);
    }
    expect(STORE_LAYOUT.lights.length).toBeLessThanOrEqual(6);
    expect(STORE_LAYOUT.extras.length).toBe(2);
  });
  it('chaque article de la boutique est dans un rayon et dans la cabine d’essayage s’il se porte', () => {
    const fx = STORE_LAYOUT.fixtures.filter((f) => !f.counter);
    const tryOn = fx.find((f) => f.tryOn);
    for (const it of SHOP.filter((s) => s.shop === 'boutique')) {
      expect(fx.some((f) => f.cats.includes(it.cat))).toBe(true);
      if (it.wear) expect(tryOn.cats).toContain(it.cat);
    }
  });
});

describe('boutique d’équitation : catalogue', () => {
  const items = SHOP.filter((s) => s.shop === 'boutique');
  it('emplacements rendus : sur le personnage (tenue) ou sur le cheval (tapis, guêtres, bonnet)', () => {
    for (const it of items) {
      expect(SLOTS[it.slot]).toBeTruthy();
      expect(SHOP_CATS[it.cat]).toBeTruthy();
      if (WEAR_SLOTS.includes(it.slot)) expect(it.wear).toBeTruthy();
      else {
        expect(HORSE_LOOK_SLOTS).toContain(it.slot);
        if (it.slot === 'tapis') expect(it.pad && it.trim).toBeTruthy();
        if (it.slot === 'guetres') expect(it.boots).toMatch(/^#/);
        if (it.slot === 'bonnet') expect(it.bonnet.color && it.bonnet.trim).toBeTruthy();
      }
    }
  });
  it('vestes de concours, pantalons (beige, blanc, marine, noir), polos, softshells, gants, casquette, équipement du cheval', () => {
    const by = (slot) => items.filter((i) => i.slot === slot);
    expect(by('veste').length).toBeGreaterThanOrEqual(3);
    expect(by('bas').map((i) => i.wear.pants)).toEqual(['#d9c7a0', '#f4f3ef', '#1f2b45', '#1b1c1f']);
    expect(by('bas').filter((i) => i.concours).map((i) => i.id)).toEqual(['pantalon_beige', 'pantalon_blanc']);
    expect(by('gants').length).toBeGreaterThanOrEqual(2);
    expect(items.filter((i) => i.cat === 'cheval').map((i) => i.slot).sort()).toEqual(['bonnet', 'bonnet', 'bonnet', 'guetres', 'guetres', 'tapis', 'tapis', 'tapis']);
  });
  it('articles de l’ancienne Maison Lucette conservés (anciennes sauvegardes)', () => {
    for (const id of ['polo_blanc', 'pull_marin', 'sweat_gris', 'doudoune', 'veste_huilee', 'casquette', 'casquette_beige']) {
      const it = SHOP.find((s) => s.id === id);
      expect(it?.shop).toBe('boutique');
      expect(it.wear).toBeTruthy();
    }
  });
  it('noms génériques : aucune marque, aucun nom de collection', () => {
    for (const it of items) expect(`${it.name} ${it.about} ${it.desc}`).not.toMatch(/kingsland|collection/i);
  });
});
