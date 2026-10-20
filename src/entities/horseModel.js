// Cheval procédural low-poly, squelette rigide et animation des allures (pas, trot, galop, grand galop), saut, broute, cabre.
import * as THREE from 'three';
import { buildRig, makeSkinned } from './rig.js';
import { box, cyl, cone, sphere, limb, prep } from '../world/shapes.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

export const COATS = {
  bay: { body: '#7a4a2b', mane: '#1d1714', legs: '#211a16', muzzle: '#2c2420', hoof: '#2b2622' },
  chestnut: { body: '#9a5a32', mane: '#7a3f22', legs: '#8a4f2c', muzzle: '#5c3a2a', hoof: '#3b3029' },
  grey: { body: '#c9c6c0', mane: '#e8e6e1', legs: '#9e9b96', muzzle: '#5e5b58', hoof: '#3a3633' },
  black: { body: '#24221f', mane: '#121110', legs: '#171615', muzzle: '#1c1a19', hoof: '#1b1a19' },
  palomino: { body: '#d2a965', mane: '#f1e6cc', legs: '#c39a58', muzzle: '#6b5440', hoof: '#4a3f35' },
  darkbay: { body: '#4a2e1f', mane: '#151110', legs: '#17120f', muzzle: '#221b18', hoof: '#221d1a' },
  white: { body: '#ecebe6', mane: '#f6f5f1', legs: '#e2e0da', muzzle: '#8a8580', hoof: '#5a5550' },
};

const BONES = [
  { name: 'root', pos: [0, 0, 0] },
  { name: 'body', parent: 'root', pos: [0, 1.3, 0] },
  { name: 'neck', parent: 'body', pos: [0, 0.2, 0.72] },
  { name: 'head', parent: 'neck', pos: [0, 0.64, 0.46] },
  { name: 'tail', parent: 'body', pos: [0, 0.14, -0.95] },
  { name: 'tail2', parent: 'tail', pos: [0, -0.22, -0.16] },
  { name: 'flU', parent: 'body', pos: [0.19, -0.2, 0.58] },
  { name: 'flL', parent: 'flU', pos: [0, -0.5, 0] },
  { name: 'frU', parent: 'body', pos: [-0.19, -0.2, 0.58] },
  { name: 'frL', parent: 'frU', pos: [0, -0.5, 0] },
  { name: 'hlU', parent: 'body', pos: [0.2, -0.1, -0.66] },
  { name: 'hlL', parent: 'hlU', pos: [0, -0.58, -0.12] },
  { name: 'hrU', parent: 'body', pos: [-0.2, -0.1, -0.66] },
  { name: 'hrL', parent: 'hrU', pos: [0, -0.58, -0.12] },
];

/**
 * opts: { coat: key|object, blaze, socks: [fl, fr, hl, hr], saddle, pad, padTrim }
 */
export function createHorseMesh(opts = {}) {
  const c = typeof opts.coat === 'object' ? opts.coat : COATS[opts.coat || 'bay'];
  const socks = opts.socks || [false, false, false, false];
  const P = [];
  const add = (bone, geo, color, tf) => P.push([bone, geo, color, tf]);

  // Corps.
  const barrel = new THREE.CapsuleGeometry(0.4, 1.05, 3, 8);
  barrel.rotateX(Math.PI / 2);
  add('body', prep(barrel), c.body, { sx: 0.92, sy: 1.1, z: -0.02 });
  add('body', sphere(0.4, 8, 6), c.body, { y: 0.04, z: 0.55, sx: 0.9, sy: 1.05, sz: 0.9 });
  add('body', sphere(0.43, 8, 6), c.body, { y: 0.07, z: -0.58, sx: 0.95, sz: 1.0 });
  add('body', sphere(0.22, 6, 5), c.body, { y: 0.33, z: 0.42, sx: 0.7, sy: 0.7, sz: 1.4 });

  // Encolure, crinière.
  add('neck', limb([0, -0.12, -0.1], [0, 0.64, 0.46], 0.27, 0.15, 6, 0.72), c.body);
  add('neck', limb([0, 0.02, -0.29], [0, 0.72, 0.36], 0.07, 0.05, 4, 0.45), c.mane);

  // Tête.
  add('head', limb([0, 0.06, -0.04], [0, -0.36, 0.4], 0.13, 0.085, 6, 0.72), c.body);
  add('head', sphere(0.15, 6, 5), c.body, { y: -0.06, z: 0.04, sx: 0.62, sy: 0.95 });
  add('head', sphere(0.1, 6, 5), c.muzzle, { y: -0.37, z: 0.39, sx: 0.8, sy: 0.85 });
  for (const s of [-1, 1]) {
    add('head', cone(0.04, 0.17, 4), c.body, { x: 0.06 * s, y: 0.1, z: -0.03, rz: -0.25 * s, rx: -0.2 });
    add('head', box(0.03, 0.045, 0.05, false), '#111111', { x: 0.098 * s, y: -0.03, z: 0.12 });
    add('head', box(0.025, 0.03, 0.02, false), '#111111', { x: 0.04 * s, y: -0.41, z: 0.47 });
  }
  add('head', box(0.08, 0.1, 0.1, false), c.mane, { y: 0.1, z: 0.06, rx: 0.5 });
  if (opts.blaze) add('head', limb([0, 0.155, 0.051], [0, -0.298, 0.459], 0.035, 0.03, 4, 1), '#f3f1ec');
  // Filet (muserolle, frontal).
  add('head', limb([0, -0.25, 0.25], [0, -0.21, 0.29], 0.112, 0.112, 6, 0.74), '#1d1a18');
  add('head', limb([0, 0.0, -0.01], [0, 0.04, 0.03], 0.14, 0.14, 6, 0.72), '#1d1a18');

  // Queue.
  add('tail', limb([0, 0, 0], [0, -0.22, -0.16], 0.07, 0.06, 5), c.mane);
  add('tail2', limb([0, 0, 0], [0, -0.62, -0.08], 0.08, 0.13, 5, 0.55), c.mane);

  // Membres antérieurs.
  const front = (side, sock) => {
    const U = side > 0 ? 'flU' : 'frU';
    const L = side > 0 ? 'flL' : 'frL';
    add(U, limb([0, 0.12, 0], [0, -0.5, 0], 0.12, 0.07, 6, 0.85), c.body);
    add(L, sphere(0.075, 5, 4), c.legs);
    add(L, limb([0, 0, 0], [0, -0.44, 0], 0.06, 0.05, 5), sock ? '#f2f0ea' : c.legs);
    add(L, limb([0, -0.44, 0], [0, -0.54, 0.04], 0.055, 0.06, 5), sock ? '#f2f0ea' : c.legs);
    add(L, cyl(0.07, 0.085, 0.09, 6, false), c.hoof, { y: -0.575, z: 0.05 });
  };
  const hind = (side, sock) => {
    const U = side > 0 ? 'hlU' : 'hrU';
    const L = side > 0 ? 'hlL' : 'hrL';
    add(U, limb([0, 0.1, 0.05], [0, -0.58, -0.12], 0.16, 0.075, 6, 0.75), c.body);
    add(L, sphere(0.07, 5, 4), c.legs);
    add(L, limb([0, 0, 0], [0, -0.48, 0.04], 0.06, 0.05, 5), sock ? '#f2f0ea' : c.legs);
    add(L, limb([0, -0.48, 0.04], [0, -0.56, 0.07], 0.055, 0.06, 5), sock ? '#f2f0ea' : c.legs);
    add(L, cyl(0.07, 0.085, 0.09, 6, false), c.hoof, { y: -0.6, z: 0.08 });
  };
  front(1, socks[0]);
  front(-1, socks[1]);
  hind(1, socks[2]);
  hind(-1, socks[3]);

  // Sellerie : tapis Strides (noir, liseré blanc), selle, étriers.
  if (opts.saddle !== false) {
    const pad = opts.pad || '#15161a';
    const trim = opts.padTrim || '#f2f1ec';
    add('body', box(0.86, 0.05, 0.66, false), pad, { y: 0.44, z: 0.02 });
    add('body', box(0.88, 0.012, 0.68, false), trim, { y: 0.415, z: 0.02 });
    for (const s of [-1, 1]) {
      add('body', box(0.03, 0.3, 0.6, false), pad, { x: 0.345 * s, y: 0.29, z: 0.02, rz: -0.28 * s });
      add('body', box(0.035, 0.025, 0.62, false), trim, { x: 0.385 * s, y: 0.145, z: 0.02, rz: -0.28 * s });
      add('body', box(0.03, 0.3, 0.32, false), '#2a211b', { x: 0.31 * s, y: 0.31, z: 0.08, rz: -0.4 * s });
      add('body', box(0.02, 0.5, 0.03, false), '#1d1814', { x: 0.37 * s, y: 0.08, z: 0.06 });
      add('body', box(0.12, 0.05, 0.07, false), '#c9c9c9', { x: 0.37 * s, y: -0.18, z: 0.06 });
    }
    add('body', box(0.4, 0.09, 0.5, false), '#2a211b', { y: 0.49, z: 0.0 });
    add('body', box(0.34, 0.13, 0.08, false), '#2a211b', { y: 0.56, z: -0.22 });
    add('body', box(0.28, 0.1, 0.08, false), '#2a211b', { y: 0.55, z: 0.22 });
    // Rênes (attachées à l'encolure).
    for (const s of [-1, 1]) add('neck', limb([0.12 * s, 0.05, -0.02], [0.13 * s, 0.6, 0.6], 0.012, 0.012, 3), '#1d1814');
  }

  const rig = buildRig(BONES, P);
  const mesh = makeSkinned(rig);
  mesh.userData.bones = rig.bones;
  return { mesh, bones: rig.bones };
}

// --- Animation ---
const GAITS = [
  // offsets: [fl, fr, hl, hr]
  { speed: 0, freq: 0, amp: 0, ff: 0, hf: 0, duty: 1, off: [0, 0, 0, 0], bob: 0, pitch: 0, nod: 0 },
  { speed: 1.9, freq: 0.95, amp: 0.3, ff: 0.85, hf: 0.55, duty: 0.62, off: [0.25, 0.75, 0, 0.5], bob: 0.02, pitch: 0.01, nod: 0.08 },
  { speed: 4.6, freq: 1.45, amp: 0.42, ff: 1.25, hf: 0.85, duty: 0.44, off: [0, 0.5, 0.5, 0], bob: 0.05, pitch: 0.015, nod: 0.03 },
  { speed: 9.5, freq: 1.75, amp: 0.55, ff: 1.4, hf: 0.95, duty: 0.4, off: [0.33, 0.6, 0, 0.33], bob: 0.06, pitch: 0.07, nod: 0.12 },
  { speed: 16, freq: 2.25, amp: 0.78, ff: 1.6, hf: 1.1, duty: 0.32, off: [0.5, 0.6, 0, 0.1], bob: 0.08, pitch: 0.09, nod: 0.14 },
];

function gaitWeights(speed) {
  // Indice flottant entre allures adjacentes.
  if (speed <= 0.05) return [0, 1, 0];
  for (let i = 1; i < GAITS.length; i++) {
    if (speed <= GAITS[i].speed) {
      const a = GAITS[i - 1].speed, b = GAITS[i].speed;
      const t = smoothstep(a + (b - a) * 0.35, b, speed);
      return [i - 1, 1 - t, t];
    }
  }
  return [GAITS.length - 1, 1, 0];
}

export function gaitIndex(speed) {
  if (speed < 0.3) return 0;
  if (speed < 3.2) return 1;
  if (speed < 7) return 2;
  if (speed < 12.5) return 3;
  return 4;
}

function legCycle(u, duty) {
  u = ((u % 1) + 1) % 1;
  if (u < duty) return [1 - 2 * (u / duty), 0];
  const t = (u - duty) / (1 - duty);
  return [-1 + 2 * (t * t * (3 - 2 * t)), Math.sin(Math.PI * t)];
}

const LEGS = [
  ['flU', 'flL', true],
  ['frU', 'frL', true],
  ['hlU', 'hlL', false],
  ['hrU', 'hrL', false],
];
const tmpPose = { U: [0, 0, 0, 0], L: [0, 0, 0, 0], bob: 0, pitch: 0, nod: 0 };

function poseFor(g, phase, out, w) {
  for (let i = 0; i < 4; i++) {
    const [pos, lift] = g.duty >= 1 ? [0, 0] : legCycle(phase + g.off[i], g.duty);
    const front = LEGS[i][2];
    out.U[i] += w * (-pos * g.amp + (front ? lift * 0.25 * g.amp : -lift * 0.15 * g.amp));
    out.L[i] += w * (front ? lift * g.ff : -lift * g.hf + (pos < 0 ? -pos * 0.12 : 0));
  }
  const p2 = phase * Math.PI * 2;
  const twoBeat = g === GAITS[2] || g === GAITS[1];
  out.bob += w * (twoBeat ? Math.abs(Math.sin(p2)) * g.bob : (Math.sin(p2) * 0.5 + 0.5) * g.bob);
  out.pitch += w * Math.sin(p2 + 0.6) * g.pitch;
  out.nod += w * Math.sin(p2 * (twoBeat ? 2 : 1) + 1.2) * g.nod;
}

/**
 * Anime le cheval. state : { speed, phase, jump (-1 ou 0..1), turn, graze, rear, t, headYaw }
 */
export function animateHorse(bones, st, dt) {
  const [gi, wa, wb] = gaitWeights(st.speed);
  const ga = GAITS[gi];
  const gb = GAITS[Math.min(gi + 1, GAITS.length - 1)];
  const freq = lerp(ga.freq, gb.freq, wb) || 0;
  // Fréquence calée sur la vitesse pour éviter que les sabots glissent.
  if (st.speed > 0.05) st.phase = (st.phase + dt * Math.max(freq, 0.6)) % 1;
  const P = tmpPose;
  P.U.fill(0);
  P.L.fill(0);
  P.bob = P.pitch = P.nod = 0;
  poseFor(ga, st.phase, P, wa);
  poseFor(gb, st.phase, P, wb);

  const B = bones;
  const t = st.t || 0;
  let bodyY = 1.3 + P.bob;
  let bodyPitch = P.pitch;
  let neckX = P.nod * 0.6 + st.speed * 0.012;
  let headX = -P.nod * 0.4 - st.speed * 0.008;

  // Saut : poses clés (appel, planer, réception).
  if (st.jump >= 0) {
    const j = st.jump;
    const k1 = smoothstep(0, 0.22, j) * (1 - smoothstep(0.55, 0.75, j));
    const k2 = smoothstep(0.55, 0.8, j) * (1 - smoothstep(0.92, 1, j));
    const tuckH = smoothstep(0.15, 0.4, j) * (1 - smoothstep(0.62, 0.85, j));
    for (let i = 0; i < 4; i++) {
      const front = LEGS[i][2];
      if (front) {
        P.U[i] = lerp(P.U[i], -1.15, k1) + -0.45 * k2;
        P.L[i] = lerp(P.L[i], 2.1, k1) * (1 - k2);
      } else {
        P.U[i] = lerp(P.U[i], 0.55, smoothstep(0, 0.15, j) * (1 - tuckH)) - 0.5 * tuckH + 0.6 * k2;
        P.L[i] = lerp(P.L[i], -1.3, tuckH) - 0.3 * k2;
      }
    }
    bodyPitch = lerp(bodyPitch, -0.32, k1) + 0.24 * k2;
    neckX += 0.35 * k1 - 0.1 * k2;
    headX -= 0.2 * k1;
  }

  // Cabre (refus).
  const rear = st.rear || 0;
  if (rear > 0) {
    bodyPitch -= 0.62 * rear;
    bodyY += 0.32 * rear;
    for (let i = 0; i < 4; i++) {
      if (LEGS[i][2]) {
        P.U[i] = lerp(P.U[i], -1.0, rear);
        P.L[i] = lerp(P.L[i], 1.8, rear);
      } else {
        P.U[i] = lerp(P.U[i], -0.6 + 0.62, rear);
        P.L[i] = lerp(P.L[i], -0.1, rear);
      }
    }
    neckX -= 0.4 * rear;
  }

  // Broute.
  const graze = st.graze || 0;
  if (graze > 0) {
    neckX = lerp(neckX, 1.25, graze);
    headX = lerp(headX, 0.55 + Math.sin(t * 2.3) * 0.05, graze);
  }

  B.body.position.y = bodyY;
  B.body.position.z = -0.18 * rear;
  B.body.rotation.x = bodyPitch;
  B.body.rotation.z = clamp(-(st.turn || 0) * st.speed * 0.025, -0.18, 0.18);
  B.neck.rotation.x = neckX + Math.sin(t * 0.7) * 0.02 * (st.speed < 0.3 ? 1 : 0);
  B.neck.rotation.y = (st.headYaw || 0) * 0.6;
  B.head.rotation.x = headX;
  B.head.rotation.y = (st.headYaw || 0) * 0.4;
  B.tail.rotation.x = 0.08 + clamp(st.speed / 16, 0, 1) * 0.35 + (st.jump >= 0 ? 0.3 : 0);
  B.tail2.rotation.x = clamp(st.speed / 16, 0, 1) * 0.2;
  B.tail2.rotation.z = Math.sin(t * 1.4) * (st.speed < 0.3 ? 0.25 : 0.08);
  for (let i = 0; i < 4; i++) {
    const [u, l] = LEGS[i];
    B[u].rotation.x = P.U[i];
    B[l].rotation.x = P.L[i];
  }
  // Compenser la hauteur quand les jambes sont repliées au pas.
  return { footfalls: st.speed > 0.05 ? footfallEvents(st, gi, wb) : null };
}

// Détection des posers de sabots (pour le son) : renvoie le nombre de posers depuis la dernière frame.
function footfallEvents(st, gi, wb) {
  const g = GAITS[wb > 0.5 ? Math.min(gi + 1, 4) : gi];
  if (!g || g.duty >= 1) return 0;
  const prev = st._lastPhase ?? st.phase;
  st._lastPhase = st.phase;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const o = g.off[i];
    const a = (((prev + o) % 1) + 1) % 1;
    const b = (((st.phase + o) % 1) + 1) % 1;
    if (b < a) n++;
  }
  return n;
}
