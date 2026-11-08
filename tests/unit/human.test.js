import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createHumanMesh, animateHuman, OUTFITS, randomOutfit } from '../../src/entities/humanModel.js';
import { resolveOutfit, inferSex } from '../../src/entities/human/outfits.js';
import { humanGeometry } from '../../src/entities/human/assets.js';
import { RIDER_FIT } from '../../src/entities/human.js';

const finiteBones = (bones) => Object.values(bones).every((b) => Number.isFinite(b.quaternion.x) && Number.isFinite(b.quaternion.w) && Number.isFinite(b.position.y));

describe('personnages réalistes', () => {
  it('décode chaque variante avec des budgets de triangles par niveau de détail', () => {
    for (const body of ['f_rider', 'm_rider', 'f_casual', 'm_casual', 'f_dress']) {
      const tris = [0, 1, 2].map((l) => humanGeometry(body, [], l).userData.triangles);
      expect(tris[0]).toBeGreaterThan(6000);
      expect(tris[0]).toBeLessThanOrEqual(10000);
      expect(tris[1]).toBeGreaterThan(1500);
      expect(tris[1]).toBeLessThanOrEqual(2500);
      expect(tris[2]).toBeLessThan(tris[1]);
      const g = humanGeometry(body, [], 0);
      for (const a of ['position', 'normal', 'skinIndex', 'skinWeight', 'zone', 'ao']) expect(g.attributes[a]).toBeTruthy();
      const idx = g.index.array;
      const nv = g.attributes.position.count;
      for (let i = 0; i < idx.length; i++) if (idx[i] >= nv) throw new Error('indice hors limites');
    }
  });

  it('déduit la morphologie et la tenue', () => {
    expect(inferSex(OUTFITS.riderF)).toBe('f');
    expect(inferSex(OUTFITS.rider)).toBe('m');
    expect(inferSex({ top: '#fff' }, 'Julie')).toBe('f');
    expect(inferSex({ top: '#fff' }, 'Paul')).toBe('m');
    const r = resolveOutfit(OUTFITS.riderF);
    expect(r.body).toBe('f_rider');
    expect(r.parts).toContain('helmet');
    const c = resolveOutfit(randomOutfit(() => 0.3));
    expect(['f_casual', 'm_casual', 'f_dress']).toContain(c.body);
  });

  it('anime toutes les poses sans valeurs invalides, y compris à cheval', () => {
    const { bones, mesh } = createHumanMesh(OUTFITS.riderF);
    expect(mesh.userData.human.lod).toBe(0);
    for (const pose of ['stand', 'walk', 'run', 'carry', 'sit', 'wave', 'cheer', 'clap']) {
      const st = { phase: 0, speed: pose === 'run' ? 5.4 : 1.3, t: 1, carry: { w: 0.5, y: -0.2, z: 0.3 } };
      for (let i = 0; i < 30; i++) animateHuman(bones, pose, st, 1 / 30);
      expect(finiteBones(bones)).toBe(true);
    }
    const st = { t: 0, horseSpeed: 0, horseGaitPhase: 0, jump: -1, bob: 0, pitch: 0, turn: 0 };
    for (const hs of [0, 1.9, 4.6, 9.5, 16]) {
      st.horseSpeed = hs;
      for (let i = 0; i < 40; i++) {
        st.horseGaitPhase = (st.horseGaitPhase + 0.05) % 1;
        st.bob = Math.sin(i) * 0.03;
        animateHuman(bones, 'ride', st, 1 / 30);
      }
      expect(finiteBones(bones)).toBe(true);
    }
    for (let j = 0; j < 1; j += 0.05) {
      st.jump = j;
      st.pitch = -0.3 * Math.sin(Math.PI * j);
      animateHuman(bones, 'ride', st, 1 / 30);
      expect(finiteBones(bones)).toBe(true);
    }
  });

  it('garde les genoux près du cheval et les talons bas pour les deux morphologies', () => {
    for (const outfit of [OUTFITS.rider, OUTFITS.riderF]) {
      const { bones, mesh } = createHumanMesh(outfit);
      // Selle du cheval PJL : dimensions observées, en plus du réglage classique.
      for (const fit of [RIDER_FIT, { ...RIDER_FIT, stirrupX: 0.386, stirrupY: -0.64, stirrupZ: 0.101 }]) {
        const st = { t: 0, horseSpeed: 0, horseGaitPhase: 0, jump: -1, bob: 0, pitch: 0, turn: 0, fit };
        animateHuman(bones, 'ride', st, 1 / 60);
        mesh.updateMatrixWorld(true);
        for (const side of ['l', 'r']) {
          const hip = bones[side + 'Thigh'].getWorldPosition(new THREE.Vector3());
          const knee = bones[side + 'Shin'].getWorldPosition(new THREE.Vector3());
          const ankle = bones[side + 'Foot'].getWorldPosition(new THREE.Vector3());
          // Cuisses descendantes, pas de genoux en ailes au-delà des chevilles.
          expect(hip.y - knee.y).toBeGreaterThan(0.2);
          expect(Math.abs(knee.x)).toBeLessThan(Math.abs(ankle.x) + 0.015);
        }
        for (const [speed, jump] of [[0, -1], [1.9, -1], [4.6, -1], [7, -1], [12, -1], [7, 0.45]]) {
          Object.assign(st, { horseSpeed: speed, jump });
          for (let i = 0; i < 60; i++) {
            st.horseGaitPhase = i / 60;
            animateHuman(bones, 'ride', st, 1 / 60);
            mesh.updateMatrixWorld(true);
            for (const side of ['l', 'r']) {
              const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(bones[side + 'Foot'].getWorldQuaternion(new THREE.Quaternion()));
              expect(forward.y).toBeGreaterThan(0.05);
              // Réserve de flexion : pas de jambe verrouillée à l’obstacle / au grand galop.
              const shin = bones[side + 'Shin'].quaternion;
              expect(2 * Math.acos(Math.min(1, Math.abs(shin.w)))).toBeGreaterThan(0.6);
            }
            expect(finiteBones(bones)).toBe(true);
          }
        }
      }
    }
  });

  it('longe le flanc fourni par le cheval sans y entrer, sans genoux en ailes ni jambe verrouillée', () => {
    // Profil de flanc synthétique (cheval large, type WildMesh) : demi-largeur 0,22 m sous le siège, 0,38 m au ventre.
    const flank = [-1.0, 0.05];
    for (let y = -1.0; y <= -0.049; y += 0.05) flank.push(y > -0.25 ? 0.22 : y > -0.4 ? 0.3 : y > -0.75 ? 0.38 : 0.3);
    const fit = { ...RIDER_FIT, stirrupX: 0.386, stirrupY: -0.64, stirrupZ: 0.101, flank, legClear: 0.05 };
    const flankAt = (y) => {
      const u = Math.min(flank.length - 3, Math.max(0, (y - flank[0]) / flank[1]));
      const i = Math.min(flank.length - 4, Math.floor(u));
      return flank[2 + i] + (flank[3 + i] - flank[2 + i]) * (u - i);
    };
    for (const outfit of [OUTFITS.rider, OUTFITS.riderF]) {
      const { bones, mesh } = createHumanMesh(outfit);
      const st = { t: 0, horseSpeed: 0, horseGaitPhase: 0, jump: -1, bob: 0, pitch: 0, turn: 0, fit };
      for (const [speed, jump] of [[0, -1], [1.9, -1], [4.6, -1], [7, -1], [12, -1], [7, 0.45]]) {
        Object.assign(st, { horseSpeed: speed, jump });
        for (let i = 0; i < 40; i++) {
          st.horseGaitPhase = i / 40;
          animateHuman(bones, 'ride', st, 1 / 60);
          mesh.updateMatrixWorld(true);
          const inv = mesh.matrixWorld.clone().invert(); // repère du personnage (le profil y est exprimé)
          for (const side of ['l', 'r']) {
            const sg = side === 'l' ? 1 : -1;
            const knee = bones[side + 'Shin'].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
            const ankle = bones[side + 'Foot'].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
            // Genou, tibia et cheville hors du flanc, à l'épaisseur de la jambe (5 cm ; 5 mm de tolérance numérique).
            for (const t of [0, 0.35, 0.65, 1]) {
              const p = knee.clone().lerp(ankle, t);
              expect(p.x * sg).toBeGreaterThan(flankAt(p.y) + 0.05 - 0.005);
            }
            // Réglages de Julien conservés : pas de genoux en ailes, réserve de flexion, talon bas.
            expect(Math.abs(knee.x)).toBeLessThan(Math.abs(ankle.x) + 0.015);
            const shin = bones[side + 'Shin'].quaternion;
            expect(2 * Math.acos(Math.min(1, Math.abs(shin.w)))).toBeGreaterThan(0.6);
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(bones[side + 'Foot'].getWorldQuaternion(new THREE.Quaternion()));
            expect(forward.y).toBeGreaterThan(0.05);
          }
          expect(finiteBones(bones)).toBe(true);
        }
      }
    }
  });

  it('un flanc éloigné des jambes ne change ni l’écart ni l’avance des pieds', () => {
    const run = (fit) => {
      const { bones, mesh } = createHumanMesh(OUTFITS.riderF);
      const st = { t: 0, horseSpeed: 7, horseGaitPhase: 0.3, jump: -1, bob: 0, pitch: 0, turn: 0, fit };
      for (let i = 0; i < 20; i++) animateHuman(bones, 'ride', st, 1 / 60);
      mesh.updateMatrixWorld(true);
      return ['l', 'r'].flatMap((s) => bones[s + 'Foot'].getWorldPosition(new THREE.Vector3()).toArray());
    };
    // Flanc étroit (loin des jambes) : x et z des chevilles identiques ; seule la hauteur peut suivre la règle du cheval
    // large (bassin abaissé de quelques centimètres au plus, le pied remonte au-delà).
    const narrow = [-1.0, 0.05, ...new Array(20).fill(0.05)];
    const a = run({ ...RIDER_FIT }), b = run({ ...RIDER_FIT, flank: narrow, legClear: 0.05 });
    for (const i of [0, 2, 3, 5]) expect(b[i]).toBeCloseTo(a[i], 6);
    for (const i of [1, 4]) expect(Math.abs(b[i] - a[i])).toBeLessThan(0.05);
  });

  it('trot enlevé : le bassin monte puis redescend une fois par foulée', () => {
    const { bones } = createHumanMesh(OUTFITS.riderF);
    const st = { t: 0, horseSpeed: 4.6, horseGaitPhase: 0, jump: -1, bob: 0, pitch: 0, turn: 0 };
    const ys = [];
    for (let i = 0; i < 240; i++) {
      st.horseGaitPhase = (i / 40) % 1;
      animateHuman(bones, 'ride', st, 1 / 60);
      if (i >= 160) ys.push(bones.hips.position.y);
    }
    const max = Math.max(...ys), min = Math.min(...ys);
    expect(max - min).toBeGreaterThan(0.05);
    // une seule montée par foulée (40 images)
    let ups = 0;
    for (let i = 1; i < ys.length; i++) if (ys[i - 1] < (max + min) / 2 && ys[i] >= (max + min) / 2) ups++;
    expect(ups).toBe(2);
  });

  it('la cavalière garde sa taille réelle sur un cheval mis à l’échelle et expose ses mains', async () => {
    const { Human } = await import('../../src/entities/human.js');
    const scene = new THREE.Scene();
    const game = { scene, camera: new THREE.PerspectiveCamera(), terrain: { getHeight: () => 0, waterDepth: () => -1 }, colliders: { resolve() {}, blocked: () => false } };
    const root = new THREE.Object3D();
    root.scale.setScalar(0.94);
    const body = new THREE.Bone();
    body.position.y = 1.3;
    root.add(body);
    scene.add(root);
    const horse = { bones: { body }, anim: { speed: 4.6, phase: 0.2 }, jumpT: -1, pos: new THREE.Vector3(), heading: 0, lastTurn: 0 };
    const h = new Human(game, OUTFITS.riderF, {});
    h.mount(horse);
    expect(h.mesh.parent).toBe(body);
    const s = new THREE.Vector3();
    h.mesh.getWorldScale(s);
    expect(s.x).toBeCloseTo(h.scale, 3);
    h.animateRiding(1 / 30);
    const [l, r] = h.getHandWorldPositions();
    expect(Number.isFinite(l.x) && Number.isFinite(r.y)).toBe(true);
    expect(l.distanceTo(r)).toBeGreaterThan(0.04);
    expect(h.seatHeight).toBeGreaterThan(0);
    // nouvel os de selle prioritaire
    h.dismount();
    const saddle = new THREE.Bone();
    body.add(saddle);
    horse.bones.saddle = saddle;
    h.mount(horse, { offset: new THREE.Vector3(0, 0.02, 0) });
    expect(h.mesh.parent).toBe(saddle);
    expect(h.mesh.position.y).toBeCloseTo(0.02, 5);
  });
});
