import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createHumanMesh, animateHuman, OUTFITS, randomOutfit } from '../../src/entities/humanModel.js';
import { resolveOutfit, inferSex } from '../../src/entities/human/outfits.js';
import { humanGeometry } from '../../src/entities/human/assets.js';

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
    const game = { scene, camera: new THREE.PerspectiveCamera(), terrain: { getHeight: () => 0, waterDepth: () => -1 }, colliders: { resolve() {} } };
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
