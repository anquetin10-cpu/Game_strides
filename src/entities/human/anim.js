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
  } else if (pose === 'brush') {
    // Pansage, face au flanc du cheval (≈ 0,45 m devant) : la main droite passe la brosse en longs coups dans le sens
    // du poil (d'avant en arrière, appuyée), retour décollé ; la main gauche à plat sur le cheval. Le buste accompagne.
    const w = t * 4.6;
    const s = Math.sin(w), c = Math.cos(w);
    qEuler(P.q.spine, 0.1, -0.06 * c, 0);
    qEuler(P.q.chest, 0.06, -0.1 * c, 0.03 * c);
    qEuler(P.q.neck, 0.12, -0.15 * c, 0);
    forwardTrunk(B, P);
    const cy = P.mp.chest.y;
    P.hands.r.set(-0.08 + 0.22 * c, cy - 0.14 + 0.06 * s, 0.44 - 0.05 * Math.max(0, s));
    solveArm(B, P, 'r', P.hands.r, _v4.set(-0.8, -0.5, -0.25).normalize(), null);
    qEuler(P.q.rHand, 0.3, 0, -0.5 - 0.2 * s);
    qAxis(P.q.rFing, Zv, 1.1);
    P.hands.l.set(0.3, cy - 0.08, 0.46);
    solveArm(B, P, 'l', P.hands.l, _v4.set(0.8, -0.5, -0.25).normalize(), null);
    qEuler(P.q.lHand, 0.2, 0, 0.6);
    qAxis(P.q.lFing, Zv, 0.1);
  } else if (pose === 'hoof' || pose === 'boots') {
    // Accroupi contre un membre du cheval, dos penché, tête baissée vers le pied.
    // hoof : la main gauche tient le sabot levé, la droite gratte la sole au cure-pied (petits coups vers la pince) ;
    // boots : les deux mains enroulent la protection autour du canon et serrent les attaches.
    P.hips.set(0.04, 0.6, -0.16);
    qEuler(P.q.hips, 0.3, 0, 0);
    qEuler(P.q.spine, 0.32, 0, 0);
    qEuler(P.q.chest, 0.18, 0, 0);
    qEuler(P.q.neck, 0.35, 0, 0);
    forwardTrunk(B, P);
    for (const side of SIDES) {
      const sg = side === 'l' ? 1 : -1;
      const f = P.feet[side];
      plantFoot(f.pos, f.q, info, sg * 0.2, side === 'l' ? 0.08 : -0.12, 0, side === 'l' ? 0 : -0.25, sg * 0.25);
      solveLeg(B, P, side, f.pos, f.q, 0, _v5.set(sg * 0.35, 0.2, 1).normalize());
    }
    if (pose === 'hoof') {
      const k = Math.sin(t * 9), k2 = Math.cos(t * 9);
      P.hands.l.set(0.1, 0.42, 0.42);
      P.hands.r.set(-0.04 + 0.05 * k, 0.4 + 0.035 * k2, 0.38);
      qEuler(P.q.rHand, 0.6 + 0.3 * k, 0, -0.4);
      qAxis(P.q.rFing, Zv, 1.2);
      qAxis(P.q.lFing, Zv, 0.9);
    } else {
      const w = t * 5.5;
      P.hands.l.set(0.07 + 0.05 * Math.cos(w), 0.36 + 0.06 * Math.sin(w), 0.4);
      P.hands.r.set(-0.07 + 0.05 * Math.cos(w + Math.PI), 0.36 + 0.06 * Math.sin(w + Math.PI), 0.4);
      qAxis(P.q.rFing, Zv, 0.6);
      qAxis(P.q.lFing, Zv, -0.6);
    }
    solveArm(B, P, 'l', P.hands.l, _v4.set(0.7, -0.6, -0.3).normalize(), null);
    solveArm(B, P, 'r', P.hands.r, _v4.set(-0.7, -0.6, -0.3).normalize(), null);
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
const DEFAULT_FIT = { stirrupX: 0.33, stirrupY: -0.64, stirrupZ: 0.06, kneeOut: 0.45, handX: 0.06, handY: 0.3, handZ: 0.36 };
// Paramètres de la posture montée (hypothèses d'animation du jeu, pas des mesures biomécaniques ; unités du personnage,
// fractions et secondes). Les réglages de position (étriers, genou, mains : fit / RIDER_FIT) restent ceux de Julien.
export const RIDE = {
  // Hauteur du bassin au-dessus de l'assise : trot enlevé, suspension (galop), obstacle (valeurs d'avant ce chantier).
  postLift: 0.085, twoLift: 0.1, jumpLift: 0.05,
  // Allongement de la jambe (hanche → cheville) en part de sa longueur : assis (réserve de flexion des genoux, valeur
  // d'avant ce chantier) ; hors de la selle, debout dans les étriers (nouveau : genou ouvert à 142° environ, réserve de
  // flexion gardée : test « jambe verrouillée » de tests/unit/human.test.js).
  seatReach: 0.93, riseReach: 0.95,
  // Obstacle, sur les événements du cheval : flexion pendant l'appel (part du vol du jeu), main rendue pendant le vol,
  // ouverture commencée à la descente et poursuivie jusqu'au poser des postérieurs (attendu holdMax s au plus après
  // celui des antérieurs), puis redressement progressif (recover s) ; main ramenée après le poser des antérieurs
  // (handBack s).
  foldIn: 0.18, releaseIn: [0.12, 0.35], holdMax: 0.45, recover: 0.5, handBack: 0.4,
  // Part de la position d'obstacle gardée au poser des antérieurs (fin du vol) et à celui des postérieurs.
  landFold: 0.6, hindFold: 0.4,
  // Attente vivante : fréquence de respiration (Hz), amplitudes (rad) du buste et des épaules, transfert de poids.
  breathRate: 0.25, breathChest: 0.012, breathShoulder: 0.012, idleShift: 0.018,
  // Bras : allongement maximal (bras + avant-bras ; 0,97 ≈ coude à 150°, jamais verrouillé) ; poignet au-dessus du
  // dessus de l'encolure (m), quand le cheval fournit ce profil (fit.crest).
  handReach: 0.97, handClear: 0.1,
};
// Dessus de l'encolure (repère du siège) : fit.crest = [z0, pas, h0, h1, …], hauteurs du dessus du corps par tranche
// d'avance ; -9 : pas de mesure.
function crestAt(crest, z) {
  const n = crest.length - 2;
  const u = (z - crest[0]) / crest[1];
  if (u < 0 || u > n - 1) return -Infinity;
  const i = Math.min(n - 2, Math.floor(u));
  const a = crest[2 + i], b = crest[3 + i];
  if (a < -8 || b < -8) return Math.max(a, b) < -8 ? -Infinity : Math.max(a, b);
  return a + (b - a) * (u - i);
}
// ---------- Jambe le long du flanc (cheval qui fournit son profil, voir pjlHorse.js) ----------
// fit.flank = [y0, pas, d0, d1, …] : demi-largeur du tronc (axe du siège → flanc) par tranche de hauteur sous le siège,
// unités du personnage ; fit.legClear : demi-épaisseur du mollet et de la botte. Interpolation linéaire, bornée.
function flankAt(flank, y) {
  const n = flank.length - 2;
  const u = Math.min(n - 1, Math.max(0, (y - flank[0]) / flank[1]));
  const i = Math.min(n - 2, Math.floor(u));
  return flank[2 + i] + (flank[3 + i] - flank[2 + i]) * (u - i);
}
const _hk = new THREE.Vector3(), _hd = new THREE.Vector3(), _hu = new THREE.Vector3(), _hv = new THREE.Vector3(), _hp = new THREE.Vector3();
// Genou que donnera ik2 (même géométrie) pour la hanche, la cheville et le pôle donnés.
function kneeOf(hip, foot, pole, a, b, out) {
  _hd.copy(foot).sub(hip);
  const d = _hd.length() || 1e-6;
  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);
  _hu.copy(_hd).divideScalar(d);
  _hv.copy(pole).addScaledVector(_hu, -pole.dot(_hu));
  if (_hv.lengthSq() < 1e-8) _hv.set(0, 0, 1);
  _hv.normalize();
  const cosA = clamp((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1);
  return out.copy(_hu).multiplyScalar(cosA * a).addScaledVector(_hv, Math.sqrt(1 - cosA * cosA) * a).add(hip);
}
// Profil du côté de la jambe : flankL / flankR (profil par côté, mis à jour à chaque image par le cheval), sinon flank.
const flankOf = (fit, sg) => (sg > 0 ? fit.flankL : fit.flankR) || fit.flank || null;
// Jambe « collée sans traverser » : le genou et le tibia restent hors du profil du flanc, à l'épaisseur de la jambe,
// comme un cavalier dont le genou appuie sur le quartier et le mollet longe le tronc : genou trop près → il s'ouvre (pôle),
// jamais au-delà de la cheville (pas de genoux « en ailes ») ; tibia trop près → le pied s'écarte du strict nécessaire.
// Hauteur et avance de l'étrier, talon : inchangés.
// Recherche continue (dichotomie) de la plus petite ouverture du genou, puis du plus petit écart du pied : la solution
// varie continûment avec le profil du flanc. (Auparavant, ouverture et écart avançaient par crans de 0,15 et de 0,4 à
// 3 cm, en nombre variable d'une image à l'autre : le genou pivotait de 15 à 35° en une image au galop.)
const POLE_OPEN = 0.9; // composante latérale du pôle au-delà de laquelle ouvrir le genou ne le déplace plus
function hugFlank(P, side, sg, foot, pole, flank, clr, info, xMax = Infinity) {
  const hip = P.mp[BN[side].Thigh];
  const a = info.thighLen, b = info.shinLen;
  // < 0 : dans le flanc (1 cm de marge : le genou réel diffère de quelques millimètres de son estimation après le
  // réajustement du bassin)
  const gap = (p) => p.x * sg - (flankAt(flank, p.y) + clr + 0.01);
  const gaps = () => {
    kneeOf(hip, foot, pole, a, b, _hk);
    let gs = 0;
    for (const t of [0.35, 0.65]) gs = Math.min(gs, gap(_hp.copy(_hk).lerp(foot, t)));
    return { gk: gap(_hk), gs };
  };
  let g = gaps();
  if (g.gs >= -1e-4 && g.gk >= -1e-4) return;
  // 1. Genou : pôle tourné vers l'extérieur (même hauteur, composante latérale px), sans que le genou dépasse la cheville
  //    (pas de genoux « en ailes ») ni au-delà de POLE_OPEN.
  const py = pole.y;
  const setPole = (px) => pole.set(sg * px, py, Math.sqrt(Math.max(0.0001, 1 - px * px - py * py)));
  const px0 = Math.min(pole.x * sg, POLE_OPEN);
  const room = (px) => (setPole(px), kneeOf(hip, foot, pole, a, b, _hk).x * sg < foot.x * sg + 0.01);
  let pxMax = POLE_OPEN;
  if (!room(pxMax)) {
    let lo = px0, hi = POLE_OPEN;
    if (!room(lo)) hi = lo;
    else for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (room(m)) lo = m; else hi = m; }
    pxMax = lo;
  }
  const ok = (r, atMax) => r.gs >= -1e-4 && (r.gk >= -1e-4 || atMax);
  setPole(px0);
  if (g.gk < -1e-4 && pxMax > px0 + 1e-4) {
    setPole(pxMax);
    if (gaps().gk >= -1e-4) {
      let lo = px0, hi = pxMax;
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; setPole(m); if (gaps().gk >= -1e-4) hi = m; else lo = m; }
      setPole(hi);
    }
  }
  g = gaps();
  const atMax = pole.x * sg >= POLE_OPEN - 1e-3;
  if (ok(g, atMax)) return;
  // 2. Tibia (et genou sans place pour s'ouvrir) : le pied s'écarte du strict nécessaire, de 4 cm au plus au-delà de sa
  //    place naturelle (xMax) : jamais de jambes en « A ». Le genou reste alors appuyé contre le quartier.
  const x0 = foot.x * sg, room2 = Math.max(0, Math.min(xMax, x0 + 0.12) - x0);
  if (room2 > 1e-5) {
    foot.x = sg * (x0 + room2);
    if (ok(gaps(), atMax)) {
      let lo = 0, hi = room2;
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; foot.x = sg * (x0 + m); if (ok(gaps(), atMax)) hi = m; else lo = m; }
      foot.x = sg * (x0 + hi);
      return;
    }
  }
  // 3. Pied à sa limite et tibia encore dans le flanc : le genou s'ouvre davantage, du strict nécessaire, dans les mêmes
  //    limites (pas au-delà de la cheville, ni de POLE_OPEN).
  const pxNow = pole.x * sg;
  let lim = POLE_OPEN;
  if (!room(lim)) {
    let lo = pxNow, hi = POLE_OPEN;
    for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (room(m)) lo = m; else hi = m; }
    lim = lo;
  }
  if (lim <= pxNow + 1e-4) return setPole(pxNow);
  setPole(lim);
  if (gaps().gs < -1e-4) return;
  let lo = pxNow, hi = lim;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; setPole(m); if (gaps().gs >= -1e-4) hi = m; else lo = m; }
  setPole(hi);
}

function riding(B, P, st, dt, info) {
  const fit = st.fit || DEFAULT_FIT;
  const hs = st.horseSpeed || 0;
  const ph = st.horseGaitPhase || 0;
  const t = st.t || 0;
  // bobAvg amorcé sur la première hauteur de selle (sinon le filtre part de 0 et enfonce le cavalier dans le cheval pendant ~2 s).
  const R = st._ride || (st._ride = { post: 0, diag: 0, wantDiag: 0, diagT: 0, two: 0, jumpK: 0, rel: 0, bobAvg: st.bob || 0, hd: -1, wasJump: false });
  const walk = sstep(0.4, 1.2, hs) * (1 - sstep(2.8, 3.6, hs));
  const trot = sstep(2.8, 3.6, hs) * (1 - sstep(5.2, 5.9, hs));
  const canter = sstep(5.2, 5.9, hs) * (1 - sstep(9.8, 11.8, hs));
  const gallop = sstep(9.8, 11.8, hs);
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
  // Obstacle : phases données par le cheval (pas de second chronomètre). Vol du jeu st.jump (0 → 1 : de l'appui des
  // postérieurs au poser des antérieurs), puis st.landT (s depuis ce poser) et st.hindDown (postérieurs reposés).
  // Auparavant, le cavalier se redressait dès les trois quarts du vol et avait repris sa position de galop à la
  // réception des antérieurs, un demi-temps avant le poser des postérieurs.
  const jump = st.jump >= 0 ? st.jump : -1;
  const landT = st.landT ?? -1;
  if (jump >= 0) R.hd = -1;
  else if (landT >= 0 && R.hd < 0 && (st.hindDown || landT >= RIDE.holdMax)) R.hd = landT;
  let jk = 0, release = 0;
  if (jump >= 0) {
    // pliée jusqu'au sommet, puis ouverture progressive pendant la descente (landFold au poser des antérieurs)
    jk = sstep(0, RIDE.foldIn, jump) * (1 - (1 - RIDE.landFold) * sstep(0.5, 1, jump));
    release = sstep(RIDE.releaseIn[0], RIDE.releaseIn[1], jump);
  } else if (landT >= 0 && R.wasJump) {
    // entre les deux posers : de landFold vers hindFold ; après le poser des postérieurs : redressement en recover s
    const atHd = R.hd < 0 ? landT : R.hd;
    const jHd = RIDE.landFold - (RIDE.landFold - RIDE.hindFold) * sstep(0, RIDE.holdMax, atHd);
    jk = R.hd < 0 ? jHd : jHd * (1 - sstep(0, RIDE.recover, landT - R.hd));
    release = 1 - sstep(0, RIDE.handBack, landT);
    if (jk <= 0 && release <= 0) R.wasJump = false;
  }
  if (jump >= 0) R.wasJump = true;
  R.jumpK = lerp(R.jumpK, jk, 1 - Math.exp(-14 * dt));
  const twoTarget = Math.max(canter * 0.55, gallop * 1.0, R.jumpK);
  R.two = lerp(R.two, twoTarget, 1 - Math.exp(-5 * dt));
  const two = R.two;
  R.rel = lerp(R.rel, release, 1 - Math.exp(-10 * dt));
  // Amortir le mouvement vertical du dos du cheval (genoux et chevilles).
  const bob = st.bob || 0;
  R.bobAvg = lerp(R.bobAvg, bob, 1 - Math.exp(-2 * dt));
  const bobHP = bob - R.bobAvg;
  // Bassin : assis, enlevé (monte et avance), en suspension (au-dessus de la selle, en arrière).
  const canterRock = canter * (1 - two) * Math.sin(TAU * ph + 0.6);
  const walkRock = walk * Math.sin(TAU * 2 * ph);
  // Hauteur voulue au-dessus de l'assise ; amorti du dos du cheval seulement hors de la selle (assis, le bassin suit la
  // selle : il ne s'y enfonce pas quand le dos monte et ne flotte pas au-dessus quand il descend).
  const lift = R.post * RIDE.postLift + two * RIDE.twoLift + R.jumpK * RIDE.jumpLift;
  const offSeat = clamp(lift / 0.04, 0, 1);
  const dy = Math.max(0, lift - bobHP * (0.4 + two * 0.5) * offSeat);
  let hz = R.post * 0.06 - two * 0.035 - R.jumpK * 0.02;
  P.hips.set(0, info.seatToHips, hz);
  // Inclinaison du buste (par rapport à la verticale), compensée du tangage de la selle.
  const pitchW = st.pitch || 0;
  const torso = 0.04 + trot * 0.06 + R.post * 0.14 + two * 0.52 + R.jumpK * 0.62 + canterRock * 0.03;
  // compenser le tangage du dos (rester d'aplomb), sauf à l'obstacle où l'on suit le cheval
  // (à la montée, cheval cabré : le buste le suit ; à la descente et à la réception, nez en bas : le buste reste
  // d'aplomb au lieu de se coucher sur l'encolure)
  const comp = -pitchW * 0.85 * (1 - (pitchW < 0 ? 0.75 : 0.25) * R.jumpK);
  // Attente vivante (skills tiers blender-animation / animation : jamais de personnage figé ; respiration, transfert de
  // poids, regard) : à l'arrêt et au pas, respiration du buste et des épaules, appui qui glisse lentement d'un ischion à
  // l'autre, regard qui se promène ; atténués aux allures rapides et à l'obstacle. (Auparavant : rotation nulle à l'arrêt.)
  const still = (1 - sstep(0.3, 1.6, hs)) * (1 - R.jumpK);
  const idle = still + 0.35 * walk;
  const breath = Math.sin(t * RIDE.breathRate * TAU);
  const shiftW = Math.sin(t * 0.11 * TAU + 1.3) * still;
  if (!R.look) R.look = { a: 0, to: 0, t: 0 };
  R.look.t -= dt;
  if (R.look.t <= 0) (R.look.t = 2.5 + 3.5 * frac(Math.sin(t * 12.9898) * 43758.5)), (R.look.to = (frac(Math.sin(t * 78.233) * 12345.6) - 0.5) * 0.6);
  R.look.a = lerp(R.look.a, R.look.to * still, 1 - Math.exp(-1.8 * dt));
  qEuler(P.q.hips, 0.08 + two * 0.35 + R.jumpK * 0.15 + comp * 0.5 + walkRock * 0.04 + canterRock * 0.07, 0, -turn * 0.06 + shiftW * RIDE.idleShift);
  qEuler(P.q.spine, torso * 0.35 + comp * 0.25 - canterRock * 0.04 + breath * 0.006 * idle, 0, -turn * 0.04 - shiftW * RIDE.idleShift * 0.8);
  qEuler(P.q.chest, torso * 0.3 + comp * 0.25 - breath * RIDE.breathChest * idle, R.look.a * 0.15, 0);
  for (const side of SIDES) qEuler(P.q[BN[side].Clav], 0, 0, (side === 'l' ? 1 : -1) * breath * RIDE.breathShoulder * idle);
  // Regard devant, entre les oreilles (plus haut à l'obstacle).
  const totalPitch = 0.08 + two * 0.35 + R.jumpK * 0.15 + torso * 0.65 + comp;
  qEuler(P.q.neck, -totalPitch * 0.45, R.look.a * 0.35, 0);
  qEuler(P.q.head, -totalPitch * 0.42 + 0.06 - R.jumpK * 0.08, R.look.a * 0.5, turn * 0.08);
  forwardTrunk(B, P);
  // Jambes : pied dans l'étrier (plante), talon bas, genou contre la selle, jambe à la sangle. Les étriers sont posés
  // d'après le cavalier assis (étrivières de longueur fixe) : quand le bassin se soulève (trot enlevé, suspension,
  // obstacle), ce sont les genoux et les hanches qui s'ouvrent, les pieds restent dans les étriers. Assis, réserve de
  // flexion des genoux (RIDE.seatReach) ; hors de la selle, la jambe peut s'allonger jusqu'à RIDE.riseReach, et le
  // bassin ne monte pas plus haut que ce que permettent les jambes (auparavant les pieds remontaient avec lui et les
  // étrivières raccourcissaient de 8 à 14 cm à chaque foulée de trot ou de galop et à l'obstacle).
  const legLen = info.thighLen + info.shinLen;
  const maxReach = legLen * RIDE.seatReach;
  let lowerSeat = 0;
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    const f = P.feet[side];
    const heel = 0.14 + two * 0.06 + R.jumpK * 0.04;
    // +Z pointe vers l’avant : tangage négatif = pointe relevée, talon descendu.
    qEuler(f.q, -heel, sg * 0.10, 0);
    // la plante sur la grille de l'étrier → cheville
    _v1.set(0, -info.ankleY + 0.012, info.toe[2] - 0.005).applyQuaternion(f.q);
    f.pos.set(sg * fit.stirrupX, fit.stirrupY + R.post * 0.012 + two * 0.02, fit.stirrupZ - two * 0.02).sub(_v1);
    // Cheval qui fournit le profil de son flanc (fit.flank) : cheville hors du flanc, à l'épaisseur de la botte.
    const fl = flankOf(fit, sg);
    if (fl) {
      f.pos.x = sg * Math.max(Math.abs(f.pos.x), flankAt(fl, f.pos.y) + (fit.legClear || 0));
      // Place naturelle du pied (étrier, cheville hors du flanc) : le tibia ne l'écarte que de 4 cm au plus.
      f.xMax = Math.abs(f.pos.x) + 0.04 * (fit.legClear ? fit.legClear / 0.05 : 1);
      // Écart du pied décidé avant l'abaissement du bassin ci-dessous, qui garde ainsi la réserve de flexion du genou.
      hugFlank(P, side, sg, f.pos, _v4.set(sg * fit.kneeOut, -0.05, 1).normalize(), fl, fit.legClear || 0, info, f.xMax);
    }
    const hip = P.mp[BN[side].Thigh];
    const lateral2 = (hip.x - f.pos.x) ** 2 + (hip.z - f.pos.z) ** 2;
    const maxDrop = Math.sqrt(Math.max(0, maxReach * maxReach - lateral2));
    lowerSeat = Math.max(lowerSeat, hip.y - f.pos.y - maxDrop);
  }
  // Cheval large (profil de flanc fourni) : le bassin ne descend que de quelques centimètres, sinon les cuisses
  // entreraient dans le dos du cheval ; au-delà, c'est le pied qui remonte dans l'étrier (étrier un peu plus court).
  const wide = !!(flankOf(fit, 1) || flankOf(fit, -1));
  if (wide) lowerSeat = Math.min(lowerSeat, 0.035 * legLen / 0.9);
  if (lowerSeat > 0) {
    // Adapter la hauteur de suspension au cavalier, sans déplacer ses pieds hors des étriers.
    P.hips.y -= lowerSeat;
    forwardTrunk(B, P);
  }
  if (wide) {
    for (const side of SIDES) {
      const f = P.feet[side], hip = P.mp[BN[side].Thigh];
      const lateral2 = (hip.x - f.pos.x) ** 2 + (hip.z - f.pos.z) ** 2;
      const minY = hip.y - Math.sqrt(Math.max(0, maxReach * maxReach - lateral2));
      if (f.pos.y < minY) f.pos.y = minY;
    }
  }
  // Bassin soulevé de dy au plus, dans la limite de la portée des jambes (pieds à leur place dans les étriers).
  if (dy > 0) {
    const seated = P.hips.y;
    const riseReach = legLen * RIDE.riseReach;
    let top = seated + dy;
    for (const side of SIDES) {
      const f = P.feet[side], hip = P.mp[BN[side].Thigh];
      const lateral2 = (hip.x - f.pos.x) ** 2 + (hip.z - f.pos.z) ** 2;
      top = Math.min(top, f.pos.y + Math.sqrt(Math.max(0, riseReach * riseReach - lateral2)) - (hip.y - P.hips.y));
    }
    P.hips.y = Math.max(seated, top);
    forwardTrunk(B, P);
  }
  const reachNow = legLen * (dy > 0 ? RIDE.riseReach : RIDE.seatReach);
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    const f = P.feet[side];
    const pole = _v5.set(sg * fit.kneeOut, -0.05, 1).normalize();
    const fl = flankOf(fit, sg);
    if (fl) {
      // Pied hors d'atteinte après l'écart du tibia : il remonte, sans se rapprocher du flanc. En remontant, le genou et
      // le tibia changent de place et peuvent arriver à une hauteur où le flanc est plus large : genou, tibia et cheville
      // recontrôlés à chaque passe (pas seulement la cheville).
      const hip = P.mp[BN[side].Thigh];
      for (let pass = 0; pass < 3; pass++) {
        hugFlank(P, side, sg, f.pos, pole, fl, fit.legClear || 0, info, f.xMax ?? Infinity);
        let raised = false;
        for (let k = 0; k < 4; k++) {
          const lateral2 = (hip.x - f.pos.x) ** 2 + (hip.z - f.pos.z) ** 2;
          const minY = hip.y - Math.sqrt(Math.max(0, reachNow * reachNow - lateral2));
          if (f.pos.y < minY - 1e-4) (f.pos.y = minY), (raised = true);
          f.pos.x = sg * Math.max(Math.abs(f.pos.x), flankAt(fl, f.pos.y) + (fit.legClear || 0) + 0.005);
        }
        if (!raised) break;
      }
    }
    solveLeg(B, P, side, f.pos, f.q, 0, pole);
  }
  // Bras : mains au-dessus du garrot, rênes ajustées, main qui accompagne l'encolure ; rendre la main à l'obstacle.
  const nod = (walk * 0.025 + canter * 0.035 + gallop * 0.03) * Math.sin(TAU * (walk > 0.5 ? 2 : 1) * ph + 1.2);
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    let hx = sg * fit.handX, hY = fit.handY - two * 0.07 - R.rel * 0.12, hZ = fit.handZ + two * 0.13 + R.rel * 0.22 + nod + R.post * 0.02;
    if (st.wave && side === 'l') hx = 0.01;
    const hp = P.hands[side].set(hx, hY - bobHP * 0.3, hZ);
    // Poignet au-dessus de l'encolure (main rendue à l'obstacle, buste penché) : auparavant les poings entraient
    // jusqu'à 6 cm dans l'encolure pendant le vol.
    if (fit.crest) hp.y = Math.max(hp.y, crestAt(fit.crest, hp.z + 0.06) + RIDE.handClear);
    // Bras jamais verrouillé : main ramenée vers l'épaule au-delà de RIDE.handReach (coude tendu à 176° auparavant
    // au galop et pendant tout le saut).
    const sh = P.mp[BN[side].Arm], armMax = (info.upperArmLen + info.foreArmLen) * RIDE.handReach;
    const dh = hp.distanceTo(sh);
    if (dh > armMax) hp.sub(sh).multiplyScalar(armMax / dh).add(sh);
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

// ---------- Montée / descente d'un véhicule et conduite (pose pilotée) ----------
// st.board (repère du modèle, unités du modèle), rempli par gameplay/boarding.js à chaque image :
//   hips (Vector3), trunk : { hx, hy, hz, sx, sy, cx, nx, ny, hdx, hdy } (angles bassin, colonne, buste, cou, tête),
//   feet : { l, r } = { pos (Vector3, cheville), q (Quaternion, orientation modèle du pied), pole (Vector3, genou) },
//   hands : { l, r } = { pos (Vector3) | null, pole (Vector3), grip (0 main ouverte … 1 poing) }.
// Une main sans cible pend le long du corps (bras relâchés).
function boardPose(B, P, st) {
  const b = st.board;
  if (!b) return;
  P.hips.copy(b.hips);
  const T = b.trunk;
  qEuler(P.q.hips, T.hx, T.hy, T.hz);
  qEuler(P.q.spine, T.sx, T.sy, 0);
  qEuler(P.q.chest, T.cx, 0, 0);
  qEuler(P.q.neck, T.nx, T.ny, 0);
  qEuler(P.q.head, T.hdx, T.hdy, 0);
  forwardTrunk(B, P);
  for (const side of SIDES) {
    const sg = side === 'l' ? 1 : -1;
    const f = b.feet[side];
    solveLeg(B, P, side, f.pos, f.q, f.toe || 0, f.pole);
    P.feet[side].pos.copy(f.pos);
    const h = b.hands[side];
    if (h.pos && h.w > 0.001) {
      // Poids < 1 : la main part du bras relâché (le long du corps) vers sa cible.
      const t = P.hands[side];
      if (h.w < 1) t.copy(P.mp[BN[side].Arm]).add(_v1.set(sg * 0.05, -0.56, 0.05)).lerp(h.pos, h.w);
      else t.copy(h.pos);
      solveArm(B, P, side, t, h.pole, null);
      qEuler(P.q[BN[side].Hand], h.wx || 0, 0, -sg * 0.25);
    } else armFK(P, side, 0.04, 0.08, 0.25);
    qAxis(P.q[BN[side].Fing], Zv, -sg * (0.15 + 1.1 * (h.grip || 0)));
    const up = h.pos && h.w > 0.001 && h.pos.y > P.mp.chest.y ? h.w : 0;
    qEuler(P.q[BN[side].Clav], 0, h.pos ? -sg * 0.06 * (h.w || 0) : 0, sg * 0.14 * up);
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
  } else if (pose === 'board') {
    boardPose(B, P, st);
  } else {
    // Spectateurs : chacun acclame à sa façon (bras levés, applaudissements, salut).
    if (pose === 'cheer') {
      if (st._cheer === undefined) st._cheer = Math.floor(Math.random() * 3);
      pose = ['cheer', 'clap', 'wave'][st._cheer];
    }
    const base = pose === 'carry' || pose === 'walk' || pose === 'stand' || pose === 'run' || pose === 'idle' ? pose : 'stand';
    const sp = pose === 'wave' || pose === 'cheer' || pose === 'clap' || pose === 'sit' || pose === 'brush' || pose === 'hoof' || pose === 'boots' ? 0 : st.speed;
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
  // En selle sur un cheval qui fournit le profil de son flanc (« collée sans traverser », voir hugFlank), transition
  // finie : bassin et jambes appliqués tels que résolus. Lissés, ils traîneraient derrière la solution (un quart du
  // mouvement de chaque image à 30 images/s, la moitié à 60) et le tibia rentrerait dans le flanc qui se gonfle au galop.
  const exact = pose === 'ride' && P.blendT >= 0.45 && !!(st.fit && (st.fit.flankL || st.fit.flankR || st.fit.flank));
  for (const n of NAMES) {
    const b = B[n];
    if (!b) continue;
    if (k >= 1 || (exact && LEG_CHAIN.has(n))) b.quaternion.copy(P.q[n]);
    else b.quaternion.slerp(P.q[n], k);
  }
  if (k >= 1 || exact) B.hips.position.copy(P.hips);
  else B.hips.position.lerp(P.hips, k);
}
const LEG_CHAIN = new Set(['hips', 'lThigh', 'lShin', 'lFoot', 'lToe', 'rThigh', 'rShin', 'rFoot', 'rToe']);

// Positions modèle des mains (dernière pose calculée) pour les rênes.
export function handTargets(st) {
  return st._P ? st._P.hands : null;
}

// Cheville et orientation d'un pied posé (repère du modèle) : point au sol (x, z), hauteur du sol, tangage, lacet.
export function footTarget(info, out, outQ, x, z, ground, pitch, yaw) {
  return plantFoot(out, outQ, info, x, z, ground, pitch, yaw);
}
