// Posture montée (chantier cavalier) : contacts et continuité. Ces tests vérifient la géométrie du squelette du jeu
// (pieds dans les étriers, genou continu, poignets hors de l'encolure, phases du saut prises sur le cheval) ; ils ne
// prouvent pas le réalisme équestre, laissé au jugement visuel.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createHumanMesh, animateHuman, OUTFITS } from '../../src/entities/humanModel.js';
import { RIDE } from '../../src/entities/human/anim.js';
import { RIDER_FIT } from '../../src/entities/human.js';

// Profil de flanc synthétique (cheval large, type WildMesh), comme tests/unit/human.test.js.
const flankOf = (half) => {
  const f = [-1.0, 0.05];
  for (let y = -1.0; y <= -0.049; y += 0.05) f.push(y > -0.25 ? 0.22 : y > -0.4 ? 0.3 : y > -0.75 ? half : 0.3);
  return f;
};
const FIT = { ...RIDER_FIT, stirrupX: 0.386, stirrupY: -0.64, stirrupZ: 0.101, flank: flankOf(0.38), legClear: 0.05 };
const W = (bones, n) => bones[n].getWorldPosition(new THREE.Vector3());
const ride = (bones, mesh, st, n = 1, dt = 1 / 30) => {
  for (let i = 0; i < n; i++) animateHuman(bones, 'ride', st, dt);
  mesh.updateMatrixWorld(true);
};

describe('posture montée', () => {
  it('pieds à leur place dans les étriers quand le bassin se soulève (étrivières de longueur fixe)', () => {
    for (const outfit of [OUTFITS.rider, OUTFITS.riderF]) {
      const { bones, mesh } = createHumanMesh(outfit);
      const st = { t: 0, horseSpeed: 0, horseGaitPhase: 0, jump: -1, bob: 0, pitch: 0, turn: 0, fit: FIT };
      ride(bones, mesh, st, 40);
      const seated = ['l', 'r'].map((s) => W(bones, s + 'Toe'));
      const hips0 = bones.hips.position.y;
      // Grand galop (suspension) puis vol d'obstacle : le bassin monte, les pieds ne remontent pas avec lui.
      for (const [speed, jump] of [[12, -1], [7, 0.45]]) {
        Object.assign(st, { horseSpeed: speed, jump });
        ride(bones, mesh, st, 60);
        expect(bones.hips.position.y).toBeGreaterThan(hips0 + 0.005);
        ['l', 'r'].forEach((s, k) => {
          const toe = W(bones, s + 'Toe');
          // Talon plus bas et pied un peu reculé en suspension (2 cm au plus), jamais remonté vers le bassin.
          expect(toe.y - seated[k].y).toBeLessThan(0.03);
          expect(Math.abs(toe.z - seated[k].z)).toBeLessThan(0.05);
        });
      }
    }
  });

  it('assis, le bassin suit la selle : ni enfoncé quand le dos monte, ni soulevé quand il descend', () => {
    const { bones, mesh } = createHumanMesh(OUTFITS.riderF);
    const st = { t: 0, horseSpeed: 1.6, horseGaitPhase: 0, jump: -1, bob: 0, pitch: 0, turn: 0, fit: FIT };
    ride(bones, mesh, st, 30);
    const base = bones.hips.position.y;
    for (let i = 0; i < 60; i++) {
      st.horseGaitPhase = (i / 30) % 1;
      st.bob = 0.03 * Math.sin(i * 0.7);
      ride(bones, mesh, st, 1);
      expect(Math.abs(bones.hips.position.y - base)).toBeLessThan(0.004);
    }
  });

  it('poignets au-dessus du dessus de l’encolure fourni par le cheval, bras jamais verrouillé', () => {
    const { bones, mesh } = createHumanMesh(OUTFITS.riderF);
    // Encolure haute devant le siège : 0,25 m au-dessus du siège dès 0,3 m devant.
    const crest = [0.15, 0.05, ...Array.from({ length: 18 }, (_, k) => (k >= 3 ? 0.25 : 0.1))];
    const st = { t: 0, horseSpeed: 7, horseGaitPhase: 0, jump: -1, bob: 0, pitch: 0, turn: 0, fit: { ...FIT, crest } };
    for (const j of [0.2, 0.4, 0.6, 0.8]) {
      st.jump = j;
      ride(bones, mesh, st, 20);
      const inv = mesh.matrixWorld.clone().invert();
      for (const s of ['l', 'r']) {
        const wr = W(bones, s + 'Hand').applyMatrix4(inv);
        if (wr.z + 0.06 >= 0.3) expect(wr.y).toBeGreaterThan(0.25 + RIDE.handClear - 0.01);
        const sh = W(bones, s + 'Arm'), el = W(bones, s + 'Fore'), h = W(bones, s + 'Hand');
        const elbow = (sh.clone().sub(el).angleTo(h.clone().sub(el)) * 180) / Math.PI;
        expect(elbow).toBeLessThan(160);
      }
    }
  });

  it('saut : position gardée en partie jusqu’au poser des postérieurs, redressement ensuite, sans à-coup', () => {
    const { bones, mesh } = createHumanMesh(OUTFITS.riderF);
    const st = { t: 0, horseSpeed: 7, horseGaitPhase: 0, jump: -1, bob: 0, pitch: 0, turn: 0, fit: FIT };
    ride(bones, mesh, st, 30);
    const K = () => st._ride.jumpK;
    for (let i = 0; i <= 24; i++) (st.jump = i / 24), ride(bones, mesh, st, 1);
    expect(K()).toBeGreaterThan(RIDE.landFold - 0.1);
    // Après le poser des antérieurs, postérieurs encore en l'air : le cavalier ne se redresse pas d'un coup.
    st.jump = -1;
    st.landT = 0;
    st.hindDown = false;
    let prevK = K(), maxStep = 0;
    for (let i = 0; i < 8; i++) {
      ride(bones, mesh, st, 1);
      st.landT += 1 / 30;
      maxStep = Math.max(maxStep, Math.abs(K() - prevK));
      prevK = K();
    }
    expect(K()).toBeGreaterThan(RIDE.hindFold - 0.05);
    // Postérieurs reposés : redressement progressif, terminé en RIDE.recover s environ.
    st.hindDown = true;
    for (let i = 0; i < Math.ceil((RIDE.recover + 0.3) * 30); i++) {
      ride(bones, mesh, st, 1);
      st.landT += 1 / 30;
      maxStep = Math.max(maxStep, Math.abs(K() - prevK));
      prevK = K();
    }
    expect(K()).toBeLessThan(0.05);
    expect(maxStep).toBeLessThan(0.12);
  });
});
