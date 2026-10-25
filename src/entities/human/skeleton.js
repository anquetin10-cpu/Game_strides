// Squelette humain adulte (proportions anthropométriques réelles, ~7,5 têtes), partagé par le générateur
// hors ligne (scripts/humans) et le jeu. Repère : y vers le haut, +z vers l'avant (visage), +x = gauche du personnage.
// Pose de repos = rotations nulles, bras le long du corps, jambes droites.
// Pose de liaison (bind) = bras en A, jambes légèrement écartées : c'est la pose du maillage généré.

export const BONES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head', 'hairTail',
  'lClav', 'lArm', 'lFore', 'lHand', 'lFing',
  'rClav', 'rArm', 'rFore', 'rHand', 'rFing',
  'lThigh', 'lShin', 'lFoot', 'lToe',
  'rThigh', 'rShin', 'rFoot', 'rToe',
];

const PARENT = {
  hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', hairTail: 'head',
  lClav: 'chest', lArm: 'lClav', lFore: 'lArm', lHand: 'lFore', lFing: 'lHand',
  lThigh: 'hips', lShin: 'lThigh', lFoot: 'lShin', lToe: 'lFoot',
};

// Décalages (m) par rapport au parent, côté gauche ; le côté droit est le miroir en x.
// Femme 1,68 m, homme 1,80 m (hanches, genoux, chevilles, épaules, coudes, poignets aux hauteurs standard).
const OFFSETS = {
  f: {
    root: [0, 0, 0], hips: [0, 0.94, 0], spine: [0, 0.105, -0.012], chest: [0, 0.195, 0.004],
    neck: [0, 0.2, -0.024], head: [0, 0.098, 0.02], hairTail: [0, 0.075, -0.096],
    lClav: [0.02, 0.155, 0.03], lArm: [0.148, -0.055, -0.04], lFore: [0, -0.29, 0], lHand: [0, -0.235, 0], lFing: [0, -0.086, 0.004],
    lThigh: [0.084, -0.065, 0.005], lShin: [0, -0.405, 0], lFoot: [0, -0.39, -0.01], lToe: [0, -0.055, 0.135],
  },
  m: {
    root: [0, 0, 0], hips: [0, 1.005, 0], spine: [0, 0.112, -0.012], chest: [0, 0.212, 0.004],
    neck: [0, 0.218, -0.026], head: [0, 0.103, 0.022], hairTail: [0, 0.08, -0.1],
    lClav: [0.022, 0.168, 0.032], lArm: [0.17, -0.055, -0.042], lFore: [0, -0.31, 0], lHand: [0, -0.255, 0], lFing: [0, -0.094, 0.004],
    lThigh: [0.09, -0.068, 0.005], lShin: [0, -0.435, 0], lFoot: [0, -0.415, -0.01], lToe: [0, -0.06, 0.146],
  },
};

// Rotations (x, y, z) de la pose de liaison.
export const BIND_POSE = {
  lArm: [0, 0, 0.78], rArm: [0, 0, -0.78],
  lThigh: [0, 0, 0.085], rThigh: [0, 0, -0.085],
};

const mirror = (n) => (n[0] === 'r' && n[1] === n[1].toUpperCase() ? 'l' + n.slice(1) : n);

export function parentOf(name) {
  const p = PARENT[mirror(name)];
  if (!p) return null;
  return name[0] === 'r' && mirror(name) !== name && p[0] === 'l' ? 'r' + p.slice(1) : p;
}

export function boneOffset(sex, name) {
  const o = OFFSETS[sex][mirror(name)];
  return mirror(name) !== name ? [-o[0], o[1], o[2]] : o.slice();
}

// Liste ordonnée { name, parent, pos } (le parent précède toujours l'enfant).
export function boneDefs(sex = 'f') {
  return BONES.map((name) => ({ name, parent: parentOf(name), pos: boneOffset(sex, name) }));
}

// Mesures utiles à l'animation (repos, mètres).
export function rigInfo(sex = 'f') {
  const o = (n) => boneOffset(sex, n);
  const len = (v) => Math.hypot(v[0], v[1], v[2]);
  const hips = o('hips');
  const thigh = o('lThigh');
  return {
    sex,
    hipsY: hips[1],
    hipJointY: hips[1] + thigh[1],
    hipHalf: Math.abs(thigh[0]),
    thighLen: len(o('lShin')),
    shinLen: len(o('lFoot')),
    upperArmLen: len(o('lFore')),
    foreArmLen: len(o('lHand')),
    ankleY: hips[1] + thigh[1] + o('lShin')[1] + o('lFoot')[1],
    toe: o('lToe'),
    heelBack: sex === 'f' ? 0.055 : 0.06,
    // Distance verticale ischions (contact selle) → os « hips » en position assise.
    seatToHips: sex === 'f' ? 0.115 : 0.12,
    height: sex === 'f' ? 1.68 : 1.8,
  };
}
