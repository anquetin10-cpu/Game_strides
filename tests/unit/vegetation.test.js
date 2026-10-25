import { describe, it, expect } from 'vitest';
import { SPECIES, treeVariant } from '../../src/world/treeGen.js';
import { leafCell, LEAF } from '../../src/world/vegTextures.js';

const tris = (g) => g.index.count / 3;

describe('arbres procéduraux', () => {
  it('génère chaque variante de chaque essence avec un budget de triangles tenu', () => {
    for (const [kind, sp] of Object.entries(SPECIES)) {
      for (let v = 0; v < sp.variants; v++) {
        const t = treeVariant(kind, v);
        expect(tris(t.wood)).toBeGreaterThan(20);
        expect(tris(t.leaves)).toBeGreaterThan(20);
        // Maillage proche : quelques milliers de triangles au plus (instancié, visible jusqu'à ~65 m).
        expect(tris(t.wood) + tris(t.leaves)).toBeLessThan(4200);
        // Ombre portée simplifiée : moins de cartes que le feuillage affiché.
        expect(tris(t.shadow)).toBeLessThan(tris(t.leaves));
        for (const name of ['position', 'normal', 'uv', 'color', 'aWind']) expect(t.leaves.attributes[name]).toBeDefined();
      }
    }
  });

  it('donne des silhouettes de taille plausible par essence', () => {
    const size = (kind) => {
      let H = 0, R = 0;
      for (let v = 0; v < SPECIES[kind].variants; v++) {
        const t = treeVariant(kind, v);
        H += t.H / SPECIES[kind].variants;
        R += t.R / SPECIES[kind].variants;
      }
      return { H, R };
    };
    const oak = size('oak'), poplar = size('poplar'), apple = size('apple'), bush = size('bush');
    expect(oak.H).toBeGreaterThan(11);
    expect(oak.H).toBeLessThan(22);
    // Peuplier d'Italie : colonne haute et étroite ; chêne : houppier large.
    expect(poplar.H).toBeGreaterThan(oak.H);
    expect(poplar.H / poplar.R).toBeGreaterThan(oak.H / oak.R * 2);
    // Pommier haute-tige et buissons bien plus bas que les arbres de futaie.
    expect(apple.H).toBeLessThan(9);
    expect(bush.H).toBeLessThan(4.5);
  });

  it('est déterministe (même graine, même arbre)', () => {
    const a = treeVariant('beech', 1);
    expect(treeVariant('beech', 1)).toBe(a);
    expect(a.wood.attributes.position.count).toBeGreaterThan(0);
  });

  it('place les cellules de feuillage dans l\'atlas', () => {
    for (const i of Object.values(LEAF)) {
      const [u0, v0, u1, v1] = leafCell(i);
      expect(u0).toBeGreaterThanOrEqual(0);
      expect(v1).toBeLessThanOrEqual(1);
      expect(u1 - u0).toBeCloseTo(0.25, 1);
      expect(v1 - v0).toBeCloseTo(0.25, 1);
    }
  });
});
