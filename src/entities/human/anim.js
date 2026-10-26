// Animation procédurale réaliste : locomotion à pieds posés (attaque talon, déroulé, poussée orteils, bassin et buste
// en contre-rotation, balancier des bras), repos (transferts d'appui, respiration, regard), gestes (salut, acclamation,
// applaudissements, port d'objet, assis) et équitation (assiette, trot enlevé synchronisé sur le diagonal, suspension au
// galop, position d'obstacle avec main qui accompagne). IK à deux segments pour jambes et bras.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;

const NAMES = ['hips', 'spine', 'chest', 'neck', 'head', 'hairTail', 'lClav', 'lArm', 'lFore', 'lHand', 'lFing', 'rClav', 'rArm', 'rFore', 'rHand', 'rFing', 'lThigh', 'lShin', 'lFoot', 'lToe', 'rThigh', 'rShin', 'rFoot', 'rToe'];
const SIDES = ['l', 'r'];
const ONLY_R = ['r'];
// Noms d'os par côté (pas de concaténation de chaînes à chaque image).
const BN = {};
for (const s of SIDES) {
  BN[s] = {};
  for (const n of ['Clav', 'Arm', 'Fore', 'Hand', 'Fing', 'Thigh', 'Shin', 'Foot', 'Toe']) BN[s][n] = s + n;
}

// ---------- Temporaires (aucune allocation par image) ----------
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Zv = new THREE.Vector3(0, 0, 1);

// Pose cible par personnage (allouée une fois).
function poseState(st) {
  if (st._P) return st._P;
  const q = {};
  for (const n of NAMES) q[n] = new THREE.Quaternion();
  st._P = {
    q, hips: new THREE.Vector3(),
    // repères modèle calculés (cinématique directe partielle)
    mq: { hips: new THREE.Quaternion(), spine: new THREE.Quaternion(), chest: new THREE.Quaternion(), lClav: new THREE.Quaternion(), rClav: new THREE.Quaternion(), lShin: new THREE.Quaternion(), rShin: new THREE.Quaternion(), lFore: new THREE.Quaternion(), rFore: new THREE.Quaternion(), lThigh: new THREE.Quaternion(), rThigh: new THREE.Quaternion(), lArm: new THREE.Quaternion(), rArm: new THREE.Quaternion(), lFoot: new THREE.Quaternion(), rFoot: new THREE.Quaternion(), neck: new THREE.Quaternion() },
    mp: { spine: new THREE.Vector3(), chest: new THREE.Vector3(), lClav: new THREE.Vector3(), rClav: new THREE.Vector3(), lArm: new THREE.Vector3(), rArm: new THREE.Vector3(), lThigh: new THREE.Vector3(), rThigh: new THREE.Vector3(), lHand: new THREE.Vector3(), rHand: new THREE.Vector3() },
    feet: { l: { pos: new THREE.Vector3(), q: new THREE.Quaternion(), toe: 0 }, r: { pos: new THREE.Vector3(), q: new THREE.Quaternion(), toe: 0 } },
    hands: { l: new THREE.Vector3(), r: new THREE.Vector3() },
    handQ: { l: new THREE.Quaternion(), r: new THREE.Quaternion() },
    lastPose: '', blendT: 9,
  };
  return st._P;
}

const qAxis = (out, axis, a) => out.setFromAxisAngle(axis, a);
// Rotation locale à partir d'angles (ordre YXZ : lacet, tangage, roulis).
const qEuler = (out, x, y, z) => out.setFromEuler(_e.set(x, y, z, 'YXZ'));

// ---------- Cinématique directe du tronc et des racines de membres ----------
function forwardTrunk(B, P) {
  const mq = P.mq, mp = P.mp, q = P.q;
  mq.hips.copy(q.hips);
  mq.spine.copy(mq.hips).multiply(q.spine);
  mq.chest.copy(mq.spine).multiply(q.chest);
  mq.neck.copy(mq.chest).multiply(q.neck);
  mp.spine.copy(B.spine.userData.rest).applyQuaternion(mq.hips).add(P.hips);
  mp.chest.copy(B.chest.userData.rest).applyQuaternion(mq.spine).add(mp.spine);
  for (const s of SIDES) {
    mq[BN[s].Clav].copy(mq.chest).multiply(q[BN[s].Clav]);
    mp[BN[s].Clav].copy(B[BN[s].Clav].userData.rest).applyQuaternion(mq.chest).add(mp.chest);
    mp[BN[s].Arm].copy(B[BN[s].Arm].userData.rest).applyQuaternion(mq[BN[s].Clav]).add(mp[BN[s].Clav]);
    mp[BN[s].Thigh].copy(B[BN[s].Thigh].userData.rest).applyQuaternion(mq.hips).add(P.hips);
  }
}

// IK deux segments. root : position modèle de l'articulation racine ; parentQ : rotation modèle du parent ;
// upper/lower : os ; target : position visée ; pole : direction du coude/genou ; bendSign : +1 genou (tibia vers
// l'arrière), −1 coude (avant-bras vers l'avant). Écrit les rotations locales et renvoie la rotation modèle du segment bas.
function ik2(root, parentQ, upperRest, lowerRest, target, pole, poleLocalZ, bendSign, outUpper, outLower, outLowerModel) {
  const a = upperRest.length(), b = lowerRest.length();
  const D = _v1.copy(target).sub(root);
  let d = D.length();
  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);
  const u = d > 1e-6 ? D.divideScalar(d) : D.set(0, -1, 0);
  // perpendiculaire vers le pôle
  const v = _v2.copy(pole).addScaledVector(u, -pole.dot(u));
  if (v.lengthSq() < 1e-8) v.set(0, 0, poleLocalZ).addScaledVector(u, -u.z * poleLocalZ);
  v.normalize();
  const cosA = clamp((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // direction du segment haut (modèle) et direction du pôle (perpendiculaire)
  const dir = _v3.copy(u).multiplyScalar(cosA).addScaledVector(v, sinA);
  const pdir = _v4.copy(u).multiplyScalar(-sinA).addScaledVector(v, cosA);
  // repère local : -Y le long du segment, ±Z vers le pôle
  const ly = _v5.copy(dir).negate();
  const lz = pdir.multiplyScalar(poleLocalZ);
  const lx = _v2.crossVectors(ly, lz);
  _m1.makeBasis(lx, ly, lz);
  _q1.setFromRotationMatrix(_m1);
  outUpper.copy(parentQ).invert().multiply(_q1);
  const cosK = clamp((a * a + b * b - dc * dc) / (2 * a * b), -1, 1);
  const bend = Math.PI - Math.acos(cosK);
  qAxis(outLower, X, bend * bendSign);
  if (outLowerModel) outLowerModel.copy(_q1).multiply(outLower);
  return _q1;
}

// Rotation modèle à partir de deux axes (avant = +Z local, haut = +Y local).
function lookQ(out, fwd, up) {
  const z = _v3.copy(fwd).normalize();
  const x = _v4.crossVectors(up, z).normalize();
  const y = _v5.crossVectors(z, x);
  _m2.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m2);
}

// ---------- Jambes : cible cheville + orientation du pied ----------
function solveLeg(B, P, side, footPos, footQ, toeAngle, pole) {
  const s = side;
  const T = B[BN[s].Thigh], S = B[BN[s].Shin], F = B[BN[s].Foot];
  // cible cheville = position du pied (cheville)
  ik2(P.mp[BN[s].Thigh], P.mq.hips, S.userData.rest, F.userData.rest, footPos, pole, 1, 1, P.q[BN[s].Thigh], P.q[BN[s].Shin], P.mq[BN[s].Shin]);
  P.q[BN[s].Foot].copy(P.mq[BN[s].Shin]).invert().multiply(footQ);
  qAxis(P.q[BN[s].Toe], X, -toeAngle);
}

function solveArm(B, P, side, handPos, pole, handQ) {
  const s = side;
  const A = B[BN[s].Arm], Fo = B[BN[s].Fore], H = B[BN[s].Hand];
  ik2(P.mp[BN[s].Arm], P.mq[BN[s].Clav], Fo.userData.rest, H.userData.rest, handPos, pole, -1, -1, P.q[BN[s].Arm], P.q[BN[s].Fore], P.mq[BN[s].Fore]);
  if (handQ) P.q[BN[s].Hand].copy(P.mq[BN[s].Fore]).invert().multiply(handQ);
}

// Bras en cinématique directe : balancier (x), écart (z), coude, poignet.
function armFK(P, side, swing, abd, elbow, twist = 0) {
  const sg = side === 'l' ? 1 : -1;
  qEuler(P.q[BN[side].Arm], -swing, twist * sg, abd * sg);
  qAxis(P.q[BN[side].Fore], X, -elbow);
}

// Pied posé : position de la cheville selon le point d'appui (talon / plante) et le tangage.
const _hc = new THREE.Vector3(), _bc = new THREE.Vector3();
function plantFoot(out, outQ, info, x, z, ground, pitch, yaw) {
  // pitch > 0 : pointe relevée (pivot talon) ; < 0 : talon levé (pivot plante)
  qEuler(outQ, -pitch, yaw, 0);
  const ay = info.ankleY;
  if (pitch >= 0) {
    // pivot au talon : talon = (0, -ay, -heelBack) depuis la cheville
    _hc.set(0, -ay, -info.heelBack).applyQuaternion(outQ);
    out.set(x, ground, z - info.heelBack).sub(_hc);
  } else {
    _bc.set(0, -ay, info.toe[2]).applyQuaternion(outQ);
    out.set(x, ground, z + info.toe[2]).sub(_bc);
  }
  return out;
}

// ---------- Locomotion ----------
function locomotion(B, P, st, dt, info, opts) {
  const v = Math.max(0, st.speed || 0);
  const t = st.t || 0;
  const run = sstep(2.2, 3.1, v);
  // pas sur place quand on pivote à l'arrêt (évite les pieds qui glissent)
  const pivot = sstep(0.9, 2.6, Math.abs(st.turnRate || 0)) * (1 - sstep(0.2, 0.5, v));
  const moving = Math.max(sstep(0.05, 0.35, v), pivot * 0.75);
  // cadence (foulées/s) et facteur de service d'après les données de marche et de course
  const fw = 0.6 + 0.2 * Math.min(v, 2.6);
  const fr = 1.15 + 0.075 * Math.min(v, 8);
  const f = lerp(fw, fr, run);
  st.phase = frac((st.phase || 0) + f * dt * moving);
  const ph = st.phase;
  const L = moving > 0 ? v / f : 0;
  const duty = lerp(0.62 - 0.02 * Math.min(v, 2.5), 0.36 - 0.024 * Math.min(v, 7.5), run);
  const legLen = info.thighLen + info.shinLen;
  const hipH = info.hipJointY;
  // Repos : transfert d'appui lent (contrapposto) et respiration.
  const idle = 1 - moving;
  const ws = st._ws || (st._ws = { p: Math.random() * 10, f: 0.09 + Math.random() * 0.05, look: 0, lookT: 0, lookTo: 0 });
  ws.p += dt * ws.f * TAU;
  const shift = Math.sin(ws.p) * idle; // −1 appui droit … +1 appui gauche
  const breath = Math.sin(t * 1.55 + ws.f * 30);
  // regard qui se promène
  ws.lookT -= dt;
  if (ws.lookT <= 0) {
    ws.lookT = 2 + Math.random() * 4;
    ws.lookTo = (Math.random() - 0.5) * (opts.lookRange ?? 0.9);
  }
  ws.look = lerp(ws.look, ws.lookTo, 1 - Math.exp(-2.2 * dt));

  // Bassin
  const bobW = (0.012 + 0.006 * Math.min(v, 2.5)) * moving * (1 - run);
  const bobR = 0.028 * run * moving;
  const walkBob = bobW * Math.cos(TAU * 2 * (ph - duty * 0.5));
  const runBob = -bobR * Math.cos(TAU * 2 * (ph - duty * 0.5));
  const crouch = 0.01 * moving + 0.035 * run + Math.max(0, Math.abs(shift) - 0.3) * 0.01;
  const latShift = 0.022 * (1 - run) * moving * Math.cos(TAU * (ph - duty * 0.5)) + shift * 0.028;
  const yaw = -(0.07 + 0.02 * Math.min(v, 2)) * (1 - run * 0.4) * moving * Math.cos(TAU * ph);
  const roll = (0.06 * (1 - run) + 0.05 * run) * moving * Math.cos(TAU * (ph - duty * 0.5)) + shift * 0.045;
  const lean = 0.03 * moving + run * (0.1 + 0.012 * Math.min(v, 7)) + (opts.carry ? -0.04 : 0);
  let hy = info.hipsY - crouch + walkBob + runBob;
  P.hips.set(latShift, hy, 0.0);

  // Pieds
  const stepW = lerp(info.hipHalf * 1.05, info.hipHalf * 0.72, run) + idle * 0.018;
  const lift = lerp(0.05 + 0.025 * Math.min(v, 2.5), 0.11 + 0.025 * Math.min(v, 7), run) * moving;
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    const u = frac(ph + (side === 'l' ? 0 : 0.5));
    let z, y = 0, pitch = 0, toe = 0;
    const zOff = lerp(-0.07, -0.11, run) * moving;
    const heelStrike = lerp(0.3, 0.06, run);
    const toeOff = lerp(0.75, 0.9, run);
    if (u < duty) {
      const s = u / duty;
      z = L * duty * (0.5 - s) + zOff;
      // attaque talon → pied à plat → décollement du talon
      const ho = lerp(0.58, 0.32, run);
      if (s < 0.14) pitch = heelStrike * (1 - sstep(0, 0.14, s));
      else if (s > ho) pitch = -toeOff * sstep(ho, 1, s) ** 1.4;
      toe = pitch < 0 ? -pitch * 0.9 : 0;
    } else {
      const s = (u - duty) / (1 - duty);
      const e = s * s * (3 - 2 * s);
      z = lerp(-L * duty * 0.5 + zOff, L * duty * 0.5 + zOff, e);
      y = lift * Math.sin(Math.PI * Math.pow(s, lerp(0.85, 0.6, run)));
      // course : talon remonte vers la fesse en début de suspension
      if (run > 0) z -= run * 0.1 * Math.sin(Math.PI * Math.min(1, s * 1.6)) * Math.min(1, v / 5);
      pitch = lerp(-toeOff * 0.85, heelStrike * 0.8, sstep(0.1, 0.85, s));
      toe = Math.max(0, -pitch) * 0.4 * (1 - s);
    }
    // repos : appui sur une jambe, l'autre légèrement fléchie, pied décalé
    const zIdle = side === 'l' ? 0.035 : -0.025;
    z = lerp(zIdle, z, moving);
    const x = sg * stepW;
    const yawF = sg * (0.1 + 0.04 * idle);
    const foot = P.feet[side];
    plantFoot(foot.pos, foot.q, info, x, z, y * moving, pitch * moving, yawF);
    foot.toe = toe * moving;
  }
  // Abaisser le bassin si une cheville est hors de portée.
  const hipsQ = qEuler(P.q.hips, lean * 0.4, yaw, roll);
  P.mq.hips.copy(hipsQ);
  for (const side of SIDES) {
    const hj = _v1.copy(B[BN[side].Thigh].userData.rest).applyQuaternion(hipsQ).add(P.hips);
    const fp = P.feet[side].pos;
    const dx = hj.x - fp.x, dz = hj.z - fp.z;
    const reach = legLen * 0.992;
    const h2 = reach * reach - dx * dx - dz * dz;
    const maxY = fp.y + Math.sqrt(Math.max(h2, 0.01)) - (hj.y - P.hips.y);
    if (P.hips.y > maxY) P.hips.y = lerp(P.hips.y, maxY, 0.85);
  }
  // Tronc : contre-rotation, inclinaison, respiration.
  qEuler(P.q.spine, lean * 0.35 + breath * 0.008, -yaw * 0.55, -roll * 0.5);
  qEuler(P.q.chest, lean * 0.25 - breath * 0.012, -yaw * 0.6, -roll * 0.35);
  qEuler(P.q.neck, -lean * 0.3, ws.look * 0.35 * idle + yaw * 0.25, roll * 0.2);
  qEuler(P.q.head, -lean * 0.25 + 0.02, ws.look * 0.6 * idle + yaw * 0.3, roll * 0.25);
  forwardTrunk(B, P);
  const pole = _v4.set(0, 0, 1);
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    const f = P.feet[side];
    solveLeg(B, P, side, f.pos, f.q, f.toe, _v5.set(sg * 0.12, 0, 1).normalize());
  }
  void pole;
  // Bras : balancier opposé aux jambes ; course : coudes à 90°, poings.
  const swingA = (lerp(0.2 + 0.09 * Math.min(v, 2.5), 0.5 + 0.03 * Math.min(v, 7), run)) * moving;
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    const c = Math.cos(TAU * (ph + (side === 'l' ? 0 : 0.5)));
    const sw = -swingA * c + 0.04 * moving;
    const elbow = lerp(0.22 + Math.max(0, sw) * 0.5, 1.45 + Math.max(0, sw) * 0.25, run) + idle * 0.08;
    const abd = 0.07 + run * 0.05 + idle * (side === 'l' ? shift : -shift) * 0.02 + breath * 0.004;
    armFK(P, side, sw + idle * 0.02, abd, elbow, run * 0.25);
    qEuler(P.q[BN[side].Hand], 0.05, 0, -sg * 0.08);
    qAxis(P.q[BN[side].Fing], Zv, -sg * (0.15 + run * 0.9));
    qEuler(P.q[BN[side].Clav], 0, -sg * sw * 0.08, breath * 0.012 * sg);
  }
  return { ph, run, moving };
}

// ---------- Gestes (sur la pose de repos) ----------
function gestures(B, P, st, pose, info) {
  const t = st.t || 0;
  forwardTrunk(B, P);
  if (pose === 'wave' || pose === 'cheer') {
    for (const side of pose === 'cheer' ? SIDES : ONLY_R) {
      const sg = side === 'l' ? 1 : -1;
      const w = Math.sin(t * (pose === 'cheer' ? 7 : 8.5) + (side === 'l' ? 1 : 0));
      // bras levé (abduction ~150°), avant-bras qui balaie
      qEuler(P.q[BN[side].Arm], -0.35, 0, sg * (2.55 + (pose === 'cheer' ? 0.15 * w : 0)));
      qEuler(P.q[BN[side].Fore], -0.25, 0, -sg * (pose === 'wave' ? 0.35 + 0.35 * w : 0.1));
      qEuler(P.q[BN[side].Clav], 0, 0, sg * 0.18);
      qAxis(P.q[BN[side].Fing], Zv, pose === 'cheer' ? -sg * 1.2 : sg * 0.25);
    }
    if (pose === 'cheer') {
      // petits sauts : bassin qui rebondit, pieds au sol (IK)
      const j = Math.abs(Math.sin(t * 5.5));
      P.hips.y -= 0.04 * (1 - j);
      P.hips.y += 0.035 * j;
      forwardTrunk(B, P);
      for (const side of SIDES) {
        const sg = side === 'l' ? 1 : -1;
        const f = P.feet[side];
        f.pos.y += Math.max(0, j - 0.55) * 0.12;
        solveLeg(B, P, side, f.pos, f.q, 0, _v5.set(sg * 0.12, 0, 1).normalize());
      }
    }
  } else if (pose === 'clap') {
    const c = Math.sin(t * 15);
    const sep = 0.035 + 0.075 * (c * 0.5 + 0.5);
    const cy = P.mp.chest.y + 0.02;
    for (const side of SIDES) {
      const sg = side === 'l' ? 1 : -1;
      P.hands[side].set(sg * sep, cy - 0.06, 0.3);
      solveArm(B, P, side, P.hands[side], _v4.set(sg * 0.8, -0.6, -0.2).normalize(), null);
      qEuler(P.q[BN[side].Hand], 0, sg * 0.4, sg * 0.2);
      qAxis(P.q[BN[side].Fing], Zv, sg * 0.2);
    }
  } else if (pose === 'sit') {
    P.hips.set(0, 0.48, -0.05);
    qEuler(P.q.hips, -0.1, 0, 0);
    qEuler(P.q.spine, 0.12, 0, 0);
    qEuler(P.q.chest, 0.06, 0, 0);
    forwardTrunk(B, P);
    for (const side of SIDES) {
      const sg = side === 'l' ? 1 : -1;
      const f = P.feet[side];
      plantFoot(f.pos, f.q, info, sg * 0.12, 0.38, 0, 0, sg * 0.12);
      solveLeg(B, P, side, f.pos, f.q, 0, _v5.set(sg * 0.1, 0, 1).normalize());
      P.hands[side].set(sg * 0.13, 0.5, 0.25);
      solveArm(B, P, side, P.hands[side], _v4.set(sg * 0.6, -0.3, -0.7).normalize(), null);
    }
  }
}

// Port d'objet : mains de chaque côté de l'objet tenu devant (repère du buste).
function carryArms(B, P, st) {
  forwardTrunk(B, P);
  const c = st.carry || { w: 0.34, y: -0.2, z: 0.3 };
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    const h = P.hands[side].set(sg * c.w * 0.5, c.y, c.z).applyQuaternion(P.mq.chest).add(P.mp.chest);
    solveArm(B, P, side, h, _v4.set(sg * 0.7, -0.5, -0.4).normalize(), null);
    qEuler(P.q[BN[side].Hand], -0.2, 0, sg * 0.5);
    qAxis(P.q[BN[side].Fing], Zv, -sg * 0.9);
  }
}

// ---------- Équitation ----------
// st : horseSpeed (allure normalisée), horseGaitPhase, jump (-1 ou 0..1), wave, turn, bob (m), pitch (rad), fit
const DEFAULT_FIT = { stirrupX: 0.33, stirrupY: -0.64, stirrupZ: 0.06, kneeOut: 0.55, handX: 0.06, handY: 0.3, handZ: 0.36 };
function riding(B, P, st, dt, info) {
  const fit = st.fit || DEFAULT_FIT;
  const hs = st.horseSpeed || 0;
  const ph = st.horseGaitPhase || 0;
  const t = st.t || 0;
  // bobAvg amorcé sur la première hauteur de selle (sinon le filtre part de 0 et enfonce le cavalier dans le cheval pendant ~2 s).
  const R = st._ride || (st._ride = { post: 0, diag: 0, wantDiag: 0, diagT: 0, two: 0, jumpK: 0, rel: 0, bobAvg: st.bob || 0 });
  const walk = sstep(0.4, 1.2, hs) * (1 - sstep(2.8, 3.6, hs));
  const trot = sstep(2.8, 3.6, hs) * (1 - sstep(6.6, 7.6, hs));
  const canter = sstep(6.6, 7.6, hs) * (1 - sstep(11.5, 13.5, hs));
  const gallop = sstep(11.5, 13.5, hs);
  // Changement de diagonal : s'asseoir un temps supplémentaire quand le cheval tourne de l'autre côté.
  const turn = st.turn || 0;
  if (Math.abs(turn) > 0.25) R.wantDiag = turn > 0 ? 0 : 0.5;
  if (R.wantDiag !== R.diag) {
    R.diagT += dt;
    if (R.diagT > 1.2) {
      R.diag = R.wantDiag;
      R.diagT = 0;
    }
  } else R.diagT = 0;
  // Trot enlevé : une montée par foulée (lever sur un diagonal, s'asseoir sur l'autre).
  const u = frac(ph + R.diag);
  const rise = sstep(0.02, 0.2, u) * (1 - sstep(0.34, 0.5, u));
  R.post = lerp(R.post, rise * trot, 1 - Math.exp(-30 * dt));
  // Suspension (galop) et position d'obstacle.
  const jump = st.jump >= 0 ? st.jump : -1;
  const jk = jump >= 0 ? sstep(0, 0.18, jump) * (1 - sstep(0.75, 1, jump)) : 0;
  R.jumpK = lerp(R.jumpK, jk, 1 - Math.exp(-14 * dt));
  const twoTarget = Math.max(canter * 0.55, gallop * 1.0, R.jumpK);
  R.two = lerp(R.two, twoTarget, 1 - Math.exp(-5 * dt));
  const two = R.two;
  const release = jump >= 0 ? sstep(0.12, 0.35, jump) * (1 - sstep(0.62, 0.92, jump)) : 0;
  R.rel = lerp(R.rel, release, 1 - Math.exp(-10 * dt));
  // Amortir le mouvement vertical du dos du cheval (genoux et chevilles).
  const bob = st.bob || 0;
  R.bobAvg = lerp(R.bobAvg, bob, 1 - Math.exp(-2 * dt));
  const bobHP = bob - R.bobAvg;
  // Bassin : assis, enlevé (monte et avance), en suspension (au-dessus de la selle, en arrière).
  const canterRock = canter * (1 - two) * Math.sin(TAU * ph + 0.6);
  const walkRock = walk * Math.sin(TAU * 2 * ph);
  let hy = info.seatToHips + R.post * 0.085 + two * 0.1 + R.jumpK * 0.05 - bobHP * (0.4 + two * 0.5);
  let hz = R.post * 0.06 - two * 0.035 - R.jumpK * 0.02;
  P.hips.set(0, hy, hz);
  // Inclinaison du buste (par rapport à la verticale), compensée du tangage de la selle.
  const pitchW = st.pitch || 0;
  const torso = 0.04 + trot * 0.06 + R.post * 0.14 + two * 0.52 + R.jumpK * 0.62 + canterRock * 0.03;
  // compenser le tangage du dos (rester d'aplomb), sauf à l'obstacle où l'on suit le cheval
  const comp = -pitchW * 0.85 * (1 - 0.75 * R.jumpK);
  qEuler(P.q.hips, 0.08 + two * 0.35 + R.jumpK * 0.15 + comp * 0.5 + walkRock * 0.04 + canterRock * 0.07, 0, -turn * 0.06);
  qEuler(P.q.spine, torso * 0.35 + comp * 0.25 - canterRock * 0.04, 0, -turn * 0.04);
  qEuler(P.q.chest, torso * 0.3 + comp * 0.25, 0, 0);
  // Regard devant, entre les oreilles (plus haut à l'obstacle).
  const totalPitch = 0.08 + two * 0.35 + R.jumpK * 0.15 + torso * 0.65 + comp;
  qEuler(P.q.neck, -totalPitch * 0.45, 0, 0);
  qEuler(P.q.head, -totalPitch * 0.42 + 0.06 - R.jumpK * 0.08, 0, turn * 0.08);
  forwardTrunk(B, P);
  // Jambes : pied dans l'étrier (plante), talon bas, genou contre la selle, jambe à la sangle.
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    const f = P.feet[side];
    const heel = 0.32 + two * 0.12 + R.jumpK * 0.1;
    qEuler(f.q, heel, sg * 0.18, sg * 0.06);
    // la plante sur la grille de l'étrier → cheville
    _v1.set(0, -info.ankleY + 0.012, info.toe[2] - 0.005).applyQuaternion(f.q);
    f.pos.set(sg * fit.stirrupX, fit.stirrupY + R.post * 0.012 + two * 0.02, fit.stirrupZ - two * 0.02).sub(_v1);
    solveLeg(B, P, side, f.pos, f.q, 0, _v5.set(sg * fit.kneeOut, -0.05, 1).normalize());
  }
  // Bras : mains au-dessus du garrot, rênes ajustées, main qui accompagne l'encolure ; rendre la main à l'obstacle.
  const nod = (walk * 0.025 + canter * 0.035 + gallop * 0.03) * Math.sin(TAU * (walk > 0.5 ? 2 : 1) * ph + 1.2);
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    let hx = sg * fit.handX, hY = fit.handY - two * 0.07 - R.rel * 0.12, hZ = fit.handZ + two * 0.13 + R.rel * 0.22 + nod + R.post * 0.02;
    if (st.wave && side === 'l') hx = 0.01;
    const hp = P.hands[side].set(hx, hY - bobHP * 0.3, hZ);
    if (st.wave && side === 'r') {
      const w = Math.sin(t * 8.5);
      qEuler(P.q.rArm, -0.35, 0, -(2.5));
      qEuler(P.q.rFore, -0.25, 0, 0.35 + 0.35 * w);
      qAxis(P.q.rFing, Zv, -0.2);
      continue;
    }
    // poing fermé, pouce dessus, ongles vers l'intérieur
    lookQ(P.handQ[side], _v1.set(-sg * 0.25, -0.6, 1), _v2.set(-sg * 0.15, 1, 0.35));
    _q2.copy(P.handQ[side]);
    // l'axe de la main (doigts = −Y local) doit pointer vers l'avant : repère main = rotation de lookQ
    qAxis(_q3, X, -Math.PI / 2);
    _q2.multiply(_q3);
    solveArm(B, P, side, hp, _v4.set(sg * 0.45, -0.75, -0.5).normalize(), _q2);
    qAxis(P.q[BN[side].Fing], Zv, -sg * 1.25);
  }
}

// ---------- Queue de cheval : ressort amorti ----------
function hairSpring(B, P, st, dt, drive) {
  const H = st._hair || (st._hair = { a: 0, v: 0, b: 0, w: 0 });
  const k = 60, c = 7;
  H.v += (-k * (H.a - drive.x) - c * H.v) * dt;
  H.a += H.v * dt;
  H.w += (-k * (H.b - drive.z) - c * H.w) * dt;
  H.b += H.w * dt;
  qEuler(P.q.hairTail, clamp(H.a, -0.6, 0.9), 0, clamp(H.b, -0.5, 0.5));
}

// ---------- Point d'entrée ----------
export function animateHuman(B, pose, st, dt) {
  const R = B.__rig;
  const info = R.info;
  const P = poseState(st);
  if (pose !== P.lastPose) {
    P.lastPose = pose;
    P.blendT = 0;
  }
  P.blendT += dt;
  for (const n of NAMES) P.q[n].identity();
  let drive = _v3.set(0.05, 0, 0);
  if (pose === 'ride') {
    riding(B, P, st, dt, info);
    const hsN = Math.min(1, (st.horseSpeed || 0) / 12);
    drive.set(0.15 + hsN * 0.55 + Math.sin(TAU * 2 * (st.horseGaitPhase || 0)) * 0.15 * hsN, 0, (st.turn || 0) * 0.2);
  } else {
    // Spectateurs : chacun acclame à sa façon (bras levés, applaudissements, salut).
    if (pose === 'cheer') {
      if (st._cheer === undefined) st._cheer = Math.floor(Math.random() * 3);
      pose = ['cheer', 'clap', 'wave'][st._cheer];
    }
    const base = pose === 'carry' || pose === 'walk' || pose === 'stand' || pose === 'run' || pose === 'idle' ? pose : 'stand';
    const sp = pose === 'wave' || pose === 'cheer' || pose === 'clap' || pose === 'sit' ? 0 : st.speed;
    const save = st.speed;
    st.speed = sp;
    const r = locomotion(B, P, st, dt, info, { carry: base === 'carry', lookRange: pose === 'stand' || pose === 'idle' || pose === 'walk' ? 0.9 : 0.4 });
    st.speed = save;
    if (base === 'carry') carryArms(B, P, st);
    if (pose !== base) gestures(B, P, st, pose, info);
    drive.set(0.08 + (st.speed || 0) * 0.06 + Math.sin(TAU * 2 * r.ph) * 0.06 * r.moving, 0, 0);
  }
  if (st.hair) hairSpring(B, P, st, dt, drive);
  // Application avec lissage (transitions entre poses).
  const rate = P.blendT < 0.45 ? 9 : 40;
  const k = st._init ? 1 - Math.exp(-rate * dt) : 1;
  st._init = true;
  for (const n of NAMES) {
    const b = B[n];
    if (!b) continue;
    if (k >= 1) b.quaternion.copy(P.q[n]);
    else b.quaternion.slerp(P.q[n], k);
  }
  if (k >= 1) B.hips.position.copy(P.hips);
  else B.hips.position.lerp(P.hips, k);
}

// Positions modèle des mains (dernière pose calculée) pour les rênes.
export function handTargets(st) {
  return st._P ? st._P.hands : null;
}
