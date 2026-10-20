import { describe, it, expect } from 'vitest';
import { createHorseMesh, animateHorse, gaitIndex } from '../../src/entities/horseModel.js';
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
