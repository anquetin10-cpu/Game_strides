import { describe, it, expect } from 'vitest';
import { createHorseMesh, animateHorse, gaitIndex, setHorseTack, setHorseWetness, setHorseLod, hoofWorldPosition } from '../../src/entities/horseModel.js';
import { createHumanMesh, animateHuman, OUTFITS } from '../../src/entities/humanModel.js';

describe('cheval procédural', () => {
  it('s’anime sans valeurs invalides à toutes les allures et en saut', () => {
    const { bones } = createHorseMesh({ coat: 'bay', blaze: true });
    for (const speed of [0, 1.9, 4.6, 9.5, 16, 20]) {
      const st = { speed, phase: 0, jump: -1, t: 0 };
      for (let i = 0; i < 60; i++) animateHorse(bones, st, 1 / 30);
      for (const b of Object.values(bones)) {
        expect(Number.isFinite(b.rotation.x)).toBe(true);
        expect(Number.isFinite(b.position.y)).toBe(true);
      }
    }
    const st = { speed: 9, phase: 0, jump: 0, t: 0, rear: 0.5, graze: 0.3 };
    for (let j = 0; j <= 1; j += 0.1) {
      st.jump = j;
      animateHorse(bones, st, 1 / 30);
      expect(Number.isFinite(bones.body.rotation.x)).toBe(true);
    }
  });
  it('pose les sabots dans l’ordre réel de chaque allure', () => {
    // Indices : 0 AG, 1 AD, 2 PG, 3 PD.
    const seq = (speed, frames = 400) => {
      const { bones } = createHorseMesh({ coat: 'bay' });
      const st = { speed, vel: speed, phase: 0, jump: -1, t: 0, lead: 1 };
      const out = [];
      for (let i = 0; i < frames; i++) {
        const r = animateHorse(bones, st, 1 / 60);
        if (r.footfalls) out.push([...r.landed].sort().join(''));
      }
      return out.slice(4, 16).join(' ');
    };
    // Pas : séquence latérale PG, AG, PD, AD.
    expect(seq(1.9)).toMatch(/2 0 3 1|0 3 1 2|3 1 2 0|1 2 0 3/);
    // Trot : diagonales posées ensemble (AG + PD, AD + PG), à une ou deux images près.
    expect(seq(4.6)).toMatch(/(03|0 3|3 0) (12|1 2|2 1) (03|0 3|3 0)/);
    // Galop à gauche : PD, puis PG + AD, puis AG.
    expect(seq(9.5)).toMatch(/3 12 0/);
    // Grand galop à gauche (transversal) : PD, PG, AD, AG.
    expect(seq(16)).toMatch(/3 2 1 0/);
  });
  it('expose les ancres et les réglages (selle, longe, équipement, mouillé, niveau de détail)', () => {
    const { mesh, bones } = createHorseMesh({ coat: 'grey', saddle: false });
    for (const k of ['body', 'neck', 'head', 'tail', 'tail2', 'saddle', 'leadAnchor', 'reinL', 'reinR', 'flU', 'flL', 'hlU', 'hlL']) expect(bones[k]).toBeTruthy();
    setHorseTack(mesh, { saddle: true, mounted: true });
    setHorseWetness(mesh, { sweat: 0.8, rain: 0.3, water: 0.2 });
    setHorseLod(mesh, 1);
    expect(mesh.userData.lod).toBe(1);
    const p = hoofWorldPosition(bones, 0);
    expect(Number.isFinite(p.x) && Math.abs(p.y) < 0.2).toBe(true);
  });
  it('classe les allures selon la vitesse', () => {
    expect(gaitIndex(0)).toBe(0);
    expect(gaitIndex(1.9)).toBe(1);
    expect(gaitIndex(4.6)).toBe(2);
    expect(gaitIndex(9.5)).toBe(3);
    expect(gaitIndex(16)).toBe(4);
  });
  it('anime le cavalier dans toutes les poses', () => {
    const { bones } = createHumanMesh(OUTFITS.rider);
    for (const pose of ['stand', 'walk', 'carry', 'ride', 'sit', 'wave', 'cheer']) {
      animateHuman(bones, pose, { phase: 0, speed: 3, t: 1, horseSpeed: 10, jump: 0.5 }, 1 / 30);
      expect(Number.isFinite(bones.hips.position.y)).toBe(true);
    }
  });
});
