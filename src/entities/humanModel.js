// Personnage low-poly (cavalier, groom, passants) et ses animations.
import { buildRig, makeSkinned } from './rig.js';
import { box, cyl, sphere, limb } from '../world/shapes.js';
import { clamp, lerp } from '../core/math.js';

const BONES = [
  { name: 'root', pos: [0, 0, 0] },
  { name: 'hips', parent: 'root', pos: [0, 0.98, 0] },
  { name: 'spine', parent: 'hips', pos: [0, 0.1, 0] },
  { name: 'chest', parent: 'spine', pos: [0, 0.24, 0] },
  { name: 'neck', parent: 'chest', pos: [0, 0.26, 0] },
  { name: 'head', parent: 'neck', pos: [0, 0.08, 0] },
  { name: 'lArm', parent: 'chest', pos: [0.21, 0.2, 0] },
  { name: 'lFore', parent: 'lArm', pos: [0, -0.29, 0] },
  { name: 'rArm', parent: 'chest', pos: [-0.21, 0.2, 0] },
  { name: 'rFore', parent: 'rArm', pos: [0, -0.29, 0] },
  { name: 'lThigh', parent: 'hips', pos: [0.1, -0.06, 0] },
  { name: 'lShin', parent: 'lThigh', pos: [0, -0.44, 0] },
  { name: 'rThigh', parent: 'hips', pos: [-0.1, -0.06, 0] },
  { name: 'rShin', parent: 'rThigh', pos: [0, -0.44, 0] },
];

export const OUTFITS = {
  rider: { top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#f2f1ec', boots: '#121214', skin: '#e2b894', hair: '#5a3a24', helmet: '#16171a', logo: true },
  riderF: { top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#f2f1ec', boots: '#121214', skin: '#eac2a0', hair: '#7a4a28', helmet: '#16171a', logo: true, ponytail: true },
};

const TOPS = ['#2f5f8a', '#b8322a', '#f2f1ec', '#2f6e4a', '#d9c9a6', '#1b1c1f', '#7a5a8a', '#c8a96e', '#5d7a8a'];
const PANTS = ['#2b3442', '#3a3d42', '#6b5d4c', '#1b1c1f', '#45536b', '#d9d2c2'];
const SKINS = ['#e2b894', '#c99a74', '#8d5e3c', '#f0cfb0', '#a8754e'];
const HAIRS = ['#2a1d14', '#5a3a24', '#c9a46a', '#1a1a1a', '#8a5a34', '#b0aaa0'];

export function randomOutfit(rnd = Math.random) {
  const p = (a) => a[Math.floor(rnd() * a.length)];
  const top = p(TOPS);
  return { top, sleeve: rnd() < 0.5 ? top : p(SKINS), pants: p(PANTS), boots: '#2a2622', skin: p(SKINS), hair: p(HAIRS), helmet: null, ponytail: rnd() < 0.45, cap: rnd() < 0.15 ? p(TOPS) : null };
}

export function createHumanMesh(outfit = OUTFITS.rider) {
  const o = outfit;
  const P = [];
  const add = (bone, geo, color, tf) => P.push([bone, geo, color, tf]);
  add('hips', box(0.34, 0.22, 0.22), o.pants, { y: -0.13 });
  add('spine', box(0.32, 0.26, 0.2), o.top, { y: -0.02 });
  add('chest', box(0.4, 0.3, 0.23), o.top, { y: -0.04 });
  add('chest', box(0.42, 0.1, 0.25), o.top, { y: 0.16 });
  if (o.logo) {
    add('chest', box(0.07, 0.035, 0.01), '#f2f1ec', { x: 0.09, y: 0.12, z: 0.12 });
    add('chest', box(0.14, 0.04, 0.012), '#f2f1ec', { y: 0.2, z: 0.125 });
  }
  add('neck', cyl(0.055, 0.06, 0.1, 6), o.skin);
  add('head', sphere(0.115, 8, 6), o.skin, { y: 0.12, sx: 0.92, sy: 1.08 });
  add('head', box(0.03, 0.045, 0.035, false), o.skin, { y: 0.1, z: 0.11 });
  for (const s of [-1, 1]) add('head', box(0.025, 0.025, 0.01, false), '#1b1b1b', { x: 0.04 * s, y: 0.135, z: 0.103 });
  if (o.helmet) {
    add('head', sphere(0.13, 8, 5), o.helmet, { y: 0.165, z: -0.005, sy: 0.82 });
    add('head', box(0.2, 0.02, 0.07, false), o.helmet, { y: 0.135, z: 0.12, rx: 0.2 });
  } else {
    add('head', sphere(0.122, 8, 5), o.hair, { y: 0.16, z: -0.012, sx: 0.97, sy: 0.85 });
    if (o.cap) add('head', box(0.2, 0.02, 0.1, false), o.cap, { y: 0.17, z: 0.1 });
  }
  if (o.ponytail) add('head', box(0.06, 0.18, 0.06, false), o.hair, { y: 0.02, z: -0.13, rx: 0.2 });
  for (const [U, F, s] of [['lArm', 'lFore', 1], ['rArm', 'rFore', -1]]) {
    add(U, limb([0, 0.02, 0], [0, -0.29, 0], 0.058, 0.05, 5), o.top);
    add(F, limb([0, 0, 0], [0, -0.25, 0], 0.046, 0.04, 5), o.sleeve);
    add(F, sphere(0.05, 5, 4), o.helmet ? '#16171a' : o.skin, { y: -0.29 });
    void s;
  }
  for (const [T, S] of [['lThigh', 'lShin'], ['rThigh', 'rShin']]) {
    add(T, limb([0, 0.02, 0], [0, -0.44, 0], 0.088, 0.066, 6), o.pants);
    add(S, limb([0, 0, 0], [0, -0.42, 0], 0.062, 0.05, 6), o.helmet ? o.boots : o.pants);
    add(S, box(0.1, 0.08, 0.25, false), o.boots, { y: -0.42, z: 0.05 });
  }
  const rig = buildRig(BONES, P);
  const mesh = makeSkinned(rig);
  return { mesh, bones: rig.bones };
}

/**
 * pose: 'stand' | 'walk' | 'ride' | 'carry' | 'sit' | 'wave' | 'cheer'
 * st : { phase, speed, t, horseSpeed, horseGaitPhase, jump, lean }
 */
export function animateHuman(B, pose, st, dt) {
  const t = st.t || 0;
  const reset = () => {
    for (const k of ['hips', 'spine', 'chest', 'neck', 'head', 'lArm', 'lFore', 'rArm', 'rFore', 'lThigh', 'lShin', 'rThigh', 'rShin']) {
      B[k].rotation.set(0, 0, 0);
    }
    B.hips.position.set(0, 0.98, 0);
  };
  reset();
  if (pose === 'walk' || pose === 'carry' || pose === 'stand') {
    const sp = st.speed || 0;
    const run = clamp((sp - 2.5) / 3.5, 0, 1);
    if (sp > 0.1) st.phase = (st.phase + dt * (sp < 2.6 ? 0.95 + sp * 0.18 : 1.05 + sp * 0.16)) % 1;
    const a = st.phase * Math.PI * 2;
    const amp = sp > 0.1 ? lerp(0.45, 0.85, run) : 0;
    const legL = Math.sin(a) * amp;
    const legR = -legL;
    B.lThigh.rotation.x = -legL;
    B.rThigh.rotation.x = -legR;
    B.lShin.rotation.x = Math.max(0, Math.sin(a - 1.4)) * (0.6 + run * 0.9) + 0.05;
    B.rShin.rotation.x = Math.max(0, Math.sin(a + Math.PI - 1.4)) * (0.6 + run * 0.9) + 0.05;
    B.hips.position.y = 0.98 - Math.abs(Math.cos(a)) * 0.04 * (sp > 0.1 ? 1 : 0) - run * 0.04;
    B.spine.rotation.x = run * 0.18;
    B.chest.rotation.y = Math.sin(a) * 0.12 * (sp > 0.1 ? 1 : 0);
    if (pose === 'carry') {
      B.lArm.rotation.x = -1.15;
      B.rArm.rotation.x = -1.15;
      B.lFore.rotation.x = -0.35;
      B.rFore.rotation.x = -0.35;
      B.lArm.rotation.z = 0.15;
      B.rArm.rotation.z = -0.15;
    } else {
      B.lArm.rotation.x = legL * 0.9;
      B.rArm.rotation.x = legR * 0.9;
      B.lFore.rotation.x = -0.15 - run * 1.1;
      B.rFore.rotation.x = -0.15 - run * 1.1;
      B.lArm.rotation.z = 0.08;
      B.rArm.rotation.z = -0.08;
    }
    if (sp <= 0.1) {
      B.chest.rotation.x = Math.sin(t * 1.6) * 0.015;
      B.head.rotation.y = Math.sin(t * 0.35) * 0.25;
    }
  } else if (pose === 'ride') {
    // Assis en selle, jambes de part et d'autre.
    B.hips.position.set(0, 0, 0);
    const hs = st.horseSpeed || 0;
    const gallop = clamp((hs - 7) / 6, 0, 1);
    const trot = hs > 3 && hs < 7 ? 1 : 0;
    const post = trot * Math.max(0, Math.sin((st.horseGaitPhase || 0) * Math.PI * 4)) * 0.07;
    const jump = st.jump >= 0 ? Math.sin(Math.PI * clamp(st.jump, 0, 1)) : 0;
    const twoPoint = Math.max(gallop * 0.8, jump);
    B.hips.position.y = post + twoPoint * 0.12;
    B.hips.position.z = twoPoint * 0.06;
    B.spine.rotation.x = 0.12 + twoPoint * 0.45;
    B.chest.rotation.x = 0.05 + twoPoint * 0.2;
    B.head.rotation.x = -0.1 - twoPoint * 0.45;
    for (const [T, S, s] of [['lThigh', 'lShin', 1], ['rThigh', 'rShin', -1]]) {
      B[T].rotation.x = -0.85 + twoPoint * 0.1;
      B[T].rotation.z = 0.72 * s;
      B[S].rotation.x = 0.95 - twoPoint * 0.1;
      B[S].rotation.z = -0.62 * s;
    }
    for (const [A, F, s] of [['lArm', 'lFore', 1], ['rArm', 'rFore', -1]]) {
      B[A].rotation.x = -0.55 - twoPoint * 0.35;
      B[A].rotation.z = 0.12 * s;
      B[F].rotation.x = -0.75 + twoPoint * 0.2;
      B[F].rotation.z = -0.2 * s;
    }
    if (st.wave) {
      B.rArm.rotation.x = -2.6;
      B.rArm.rotation.z = -0.3 + Math.sin(t * 9) * 0.25;
      B.rFore.rotation.x = -0.3;
    }
  } else if (pose === 'sit') {
    B.hips.position.y = 0.5;
    B.lThigh.rotation.x = B.rThigh.rotation.x = -1.5;
    B.lShin.rotation.x = B.rShin.rotation.x = 1.5;
    B.lArm.rotation.x = B.rArm.rotation.x = -0.3;
  } else if (pose === 'wave' || pose === 'cheer') {
    B.rArm.rotation.x = -2.7;
    B.rArm.rotation.z = -0.3 + Math.sin(t * 8) * 0.3;
    B.rFore.rotation.x = -0.3;
    if (pose === 'cheer') {
      B.lArm.rotation.x = -2.7;
      B.lArm.rotation.z = 0.3 - Math.sin(t * 8) * 0.3;
      B.hips.position.y = 0.98 + Math.abs(Math.sin(t * 6)) * 0.08;
    }
    B.head.rotation.x = -0.1;
  }
}
