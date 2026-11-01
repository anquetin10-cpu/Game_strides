import { describe, it, expect } from 'vitest';
import { houseLayout, houseAnchor, roomAt, houseExterior, buildHouseInterior, houseInteriorSteps, ROOMS, PARTS, HOUSE_T, CEIL } from '../../src/world/homeGeo.js';
import { HOME } from '../../src/world/sites.js';
import { SaveSystem, SAVE_VERSION } from '../../src/core/save.js';

const S = HOME.house;
const L = houseLayout();
const R = 0.35; // rayon du personnage
// Distance d'un point (local) à une boîte de collision [x, z, hw, hd].
const boxDist = ([x, z, hw, hd], px, pz) => Math.hypot(Math.max(0, Math.abs(px - x) - hw), Math.max(0, Math.abs(pz - z) - hd));
const local = (name) => {
  const a = houseAnchor(name);
  return [a.x - S.x, a.z - S.z];
};

describe('maison de l’Écurie du Val : plan', () => {
  it('quatre pièces disjointes dans l’emprise intérieure', () => {
    expect(Object.keys(ROOMS).sort()).toEqual(['chambre', 'cuisine', 'salon', 'sdb']);
    const ix = S.w / 2 - HOUSE_T, iz = S.d / 2 - HOUSE_T;
    for (const r of Object.values(ROOMS)) {
      expect(r.x0).toBeGreaterThanOrEqual(-ix - 1e-6);
      expect(r.x1).toBeLessThanOrEqual(ix + 1e-6);
      expect(r.z0).toBeGreaterThanOrEqual(-iz - 1e-6);
      expect(r.z1).toBeLessThanOrEqual(iz + 1e-6);
      // Assez grandes pour la caméra intérieure (perche de 3,1 m, marge de 0,45 m aux murs).
      expect(Math.max(r.x1 - r.x0, r.z1 - r.z0)).toBeGreaterThan(4.5);
      expect(Math.min(r.x1 - r.x0, r.z1 - r.z0)).toBeGreaterThan(3.0);
    }
    const rs = Object.values(ROOMS);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(rs[i].x1 <= rs[j].x0 || rs[j].x1 <= rs[i].x0).toBe(true);
  });
  it('passages d’au moins 1,1 m entre pièces voisines, praticables (aucun meuble devant)', () => {
    for (const p of PARTS) {
      const [a, b] = p.door;
      expect(b - a).toBeGreaterThanOrEqual(1.1);
      expect(roomAt(p.x - 0.3, (a + b) / 2)).toBe(p.a);
      expect(roomAt(p.x + 0.3, (a + b) / 2)).toBe(p.b);
      for (const dx of [-0.6, 0, 0.6]) for (const c of L.colliders) expect(boxDist(c, p.x + dx, (a + b) / 2)).toBeGreaterThan(R - 1e-6);
    }
  });
  it('repères dans la bonne pièce et hors du mobilier', () => {
    const want = { spawn: 'salon', exit: 'salon', bed: 'chambre', sink: 'cuisine', basin: 'sdb', salon: 'salon' };
    for (const [name, room] of Object.entries(want)) {
      const [x, z] = local(name);
      expect(roomAt(x, z)).toBe(room);
      if (name !== 'basin' && name !== 'sink') for (const c of L.colliders) expect(boxDist(c, x, z)).toBeGreaterThan(R - 0.01);
    }
  });
  it('le côté du lit est au bord du lit (collision du lit à moins de 0,6 m), le joueur tourné vers lui', () => {
    const [x, z] = local('bed');
    const bed = L.colliders.reduce((best, c) => (boxDist(c, x, z) < boxDist(best, x, z) ? c : best));
    expect(boxDist(bed, x, z)).toBeLessThan(0.6);
    expect(bed[2] * bed[3]).toBeGreaterThan(0.8); // le lit (demi-dimensions), pas un chevet
    const h = houseAnchor('bed').heading;
    expect(Math.sign(Math.cos(h))).toBe(Math.sign(bed[1] - z));
  });
  it('porte : dehors, côté cour (+z), dégagée des pots et du banc', () => {
    const [x, z] = local('door');
    expect(z).toBeGreaterThan(S.d / 2);
    expect(roomAt(x, z)).toBeNull();
    for (const c of houseExterior().colliders) expect(boxDist(c, x, z)).toBeGreaterThan(R);
  });
  it('au plus six points lumineux (shader des commerces), sous le plafond', () => {
    expect(L.lights.length).toBeLessThanOrEqual(6);
    for (const [, y] of L.lights) expect(y).toBeLessThan(CEIL);
  });
});

describe('maison de l’Écurie du Val : géométrie', () => {
  it('extérieur et intérieur construits (six matériaux au plus, intérieur léger)', () => {
    const ext = houseExterior();
    expect(ext.body.index.count).toBeGreaterThan(0);
    expect(ext.glass.attributes.win).toBeTruthy();
    const geo = buildHouseInterior();
    let tris = 0;
    for (const key of ['A', 'L', 'F', 'M', 'G', 'E']) {
      expect(geo[key]).toBeTruthy();
      tris += geo[key].index.count / 3;
    }
    expect(tris).toBeLessThan(40000);
  });
  it('construction par étapes : la même géométrie, en plusieurs fois', () => {
    const it = houseInteriorSteps();
    let n = 0;
    let r = it.next();
    while (!r.done) {
      n++;
      r = it.next();
    }
    expect(n).toBeGreaterThan(10);
    expect(Object.keys(r.value).sort()).toEqual(['A', 'E', 'F', 'G', 'L', 'M']);
  });
});

describe('maison de l’Écurie du Val : sauvegarde', () => {
  it('ancienne sauvegarde sans indoorHome : chargée telle quelle, reprise dehors', () => {
    const s = new SaveSystem('t');
    const m = new Map();
    s.store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    m.set('t', JSON.stringify({ version: SAVE_VERSION, started: true, playerName: 'Julie', money: 300, indoorShop: null, pos: { x: -104, z: 168, heading: 0 } }));
    const d = s.load();
    expect(s.loadIssue).toBeNull();
    expect(d.indoorHome).toBe(false);
    expect(d.money).toBe(300);
  });
});
