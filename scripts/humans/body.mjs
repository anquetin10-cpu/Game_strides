// Corps humain (anatomie + vêtements modelés dans la forme) décrit en primitives SDF par os.
// Variantes : 'rider' (veste de concours, culotte, bottes hautes), 'casual' (haut ajusté, pantalon, chaussures),
// 'dress' (robe). Chaque variante fournit aussi la fonction de zones (régions de matière).
import { skeletonXf, prim, union, sub, offset, mask, loft, ellipsoid, sphere, roundCone, capsule, roundBox, smoothstep, clamp } from './sdf.mjs';
import { buildHead, hairlineY } from './head.mjs';
import { Z } from '../../src/entities/human/zones.js';

// Sections du tronc [y, demi-largeur, demi-profondeur, décalage x, décalage z].
const TORSO = {
  f: [
    [0.76, 0.13, 0.1, 0, -0.02], [0.8, 0.152, 0.11, 0, -0.022], [0.845, 0.166, 0.114, 0, -0.02], [0.9, 0.163, 0.105, 0, -0.01],
    [0.95, 0.152, 0.096, 0, 0], [1.0, 0.137, 0.089, 0, 0.006], [1.045, 0.127, 0.086, 0, 0.006], [1.1, 0.13, 0.089, 0, 0.004],
    [1.16, 0.136, 0.094, 0, 0], [1.22, 0.141, 0.096, 0, -0.004], [1.28, 0.145, 0.093, 0, -0.008], [1.33, 0.14, 0.086, 0, -0.012],
    [1.375, 0.112, 0.073, 0, -0.018], [1.42, 0.066, 0.056, 0, -0.022],
  ],
  m: [
    [0.82, 0.14, 0.105, 0, -0.025], [0.875, 0.166, 0.116, 0, -0.022], [0.94, 0.162, 0.11, 0, -0.008], [1.0, 0.154, 0.108, 0, 0.006],
    [1.06, 0.151, 0.11, 0, 0.012], [1.12, 0.155, 0.113, 0, 0.01], [1.19, 0.163, 0.116, 0, 0.004], [1.26, 0.169, 0.118, 0, -0.004],
    [1.33, 0.171, 0.116, 0, -0.01], [1.4, 0.164, 0.104, 0, -0.016], [1.46, 0.13, 0.085, 0, -0.022], [1.52, 0.074, 0.062, 0, -0.026],
  ],
};
// Bras [s depuis l'épaule, r latéral, r avant, décalage latéral, décalage avant].
const ARM = {
  f: [[-0.02, 0.04, 0.044, 0, 0], [0.05, 0.04, 0.043, -0.002, 0], [0.12, 0.039, 0.041, -0.002, 0.003], [0.2, 0.036, 0.038, -0.002, 0.003], [0.26, 0.033, 0.033, -0.002, 0], [0.29, 0.032, 0.032, -0.002, -0.004], [0.33, 0.033, 0.037, 0, 0], [0.39, 0.031, 0.037, 0, 0.002], [0.45, 0.026, 0.032, 0, 0.002], [0.51, 0.021, 0.028, 0, 0.001], [0.528, 0.02, 0.027, 0, 0]],
  m: [[-0.02, 0.048, 0.052, 0, 0], [0.06, 0.047, 0.05, -0.002, 0], [0.13, 0.047, 0.05, -0.002, 0.004], [0.21, 0.043, 0.045, -0.002, 0.004], [0.28, 0.038, 0.038, -0.002, 0], [0.31, 0.036, 0.037, -0.002, -0.004], [0.35, 0.04, 0.044, 0, 0], [0.41, 0.037, 0.043, 0, 0.002], [0.48, 0.03, 0.036, 0, 0.002], [0.55, 0.023, 0.031, 0, 0.001], [0.568, 0.022, 0.03, 0, 0]],
};
// Jambe [s depuis la hanche, r latéral, r avant, décalage latéral (− = médial), décalage avant].
const LEG = {
  f: [[-0.05, 0.08, 0.075, -0.01, 0], [0.02, 0.088, 0.086, -0.004, 0.004], [0.08, 0.088, 0.088, -0.004, 0.008], [0.16, 0.081, 0.083, -0.006, 0.012], [0.24, 0.073, 0.075, -0.008, 0.014], [0.31, 0.063, 0.065, -0.01, 0.014], [0.36, 0.056, 0.058, -0.01, 0.012], [0.405, 0.054, 0.056, -0.01, 0.01], [0.45, 0.049, 0.051, -0.01, 0], [0.52, 0.053, 0.058, -0.01, -0.014], [0.58, 0.05, 0.055, -0.009, -0.016], [0.65, 0.042, 0.045, -0.007, -0.01], [0.72, 0.032, 0.034, -0.004, -0.004], [0.77, 0.029, 0.031, -0.002, 0], [0.795, 0.031, 0.034, 0, 0]],
  m: [[-0.05, 0.085, 0.08, -0.01, 0], [0.02, 0.092, 0.09, -0.004, 0.004], [0.09, 0.091, 0.092, -0.004, 0.008], [0.18, 0.083, 0.086, -0.006, 0.012], [0.26, 0.075, 0.078, -0.008, 0.014], [0.33, 0.065, 0.067, -0.01, 0.014], [0.39, 0.058, 0.058, -0.01, 0.012], [0.435, 0.057, 0.06, -0.01, 0.01], [0.48, 0.052, 0.053, -0.01, 0], [0.56, 0.057, 0.062, -0.01, -0.015], [0.62, 0.054, 0.058, -0.009, -0.016], [0.7, 0.044, 0.047, -0.007, -0.01], [0.78, 0.033, 0.036, -0.004, -0.004], [0.825, 0.031, 0.034, -0.002, 0], [0.85, 0.034, 0.037, 0, 0]],
};

// Poids le long d'une chaîne d'os : transitions lissées autour des articulations (s croissant).
function chain(bones, joints, widths) {
  return (s) => {
    const out = [];
    let rest = 1;
    let prev = bones[0];
    let wPrev = 1;
    for (let i = 0; i < joints.length; i++) {
      const t = smoothstep(joints[i] - widths[i], joints[i] + widths[i], s);
      out.push([prev, wPrev * (1 - t)]);
      rest = wPrev * t;
      prev = bones[i + 1];
      wPrev = rest;
    }
    out.push([prev, wPrev]);
    return out.filter((e) => e[1] > 1e-4);
  };
}

export function buildHuman(sex, variant, opts = {}) {
  const skel = skeletonXf(sex);
  const I = skel.index;
  const J = (n) => skel.rest[n];
  const isF = sex === 'f';
  const k = (f, m) => (isF ? f : m);
  const hipJ = J('lThigh'), shJ = J('lArm');
  const legLen = hipJ[1] - J('lFoot')[1];
  const kneeS = hipJ[1] - J('lShin')[1];
  const elbowS = shJ[1] - J('lFore')[1];
  const wristS = shJ[1] - J('lHand')[1];
  const spineY = J('spine')[1], chestY = J('chest')[1], neckY = J('neck')[1];
  const P = (bone, shape, o = {}) => prim(shape, I[bone], o);
  const sides = [1, -1];
  const nm = (sd, n) => (sd > 0 ? 'l' : 'r') + n;

  // ---------- Tronc ----------
  const T = TORSO[sex];
  const torsoW = (() => {
    const c = chain([I.hips, I.spine, I.chest], [spineY, chestY], [0.07, 0.08]);
    return (q) => {
      const w = c(q[1]);
      // haut des épaules (trapèzes) → clavicules
      const cl = smoothstep(0.05, 0.12, Math.abs(q[0])) * smoothstep(chestY + 0.06, chestY + 0.13, q[1]);
      if (cl > 0) {
        const ci = q[0] > 0 ? I.lClav : I.rClav;
        for (const e of w) e[1] *= 1 - cl;
        w.push([ci, cl]);
      }
      return w;
    };
  })();
  const torsoLoft = P('hips', loft([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], T, { cap: 0.03 }), { tag: 'torso', part: 'torso', w: torsoW });
  const torsoParts = [torsoLoft];
  const yb = T[0][0];
  // Fesses, ventre, poitrine/pectoraux, omoplates, trapèzes, clavicules.
  for (const sd of sides) {
    torsoParts.push(P('hips', ellipsoid(k([0.068 * sd, 0.832, -0.055], [0.07 * sd, 0.864, -0.058]), k([0.085, 0.09, 0.075], [0.082, 0.086, 0.07])), { tag: 'glute', part: 'torso' }));
    if (isF) torsoParts.push(P('chest', ellipsoid([0.085 * sd, 1.222, 0.062], [0.062, 0.058, 0.05], [0.2, 0.3 * sd, 0]), { tag: 'bust', part: 'torso' }));
    else {
      torsoParts.push(P('chest', ellipsoid([0.072 * sd, 1.352, 0.068], [0.08, 0.052, 0.034], [0, 0.3 * sd, 0]), { tag: 'pec', part: 'torso' }));
      torsoParts.push(P('chest', ellipsoid([0.128 * sd, 1.29, -0.035], [0.05, 0.11, 0.066]), { tag: 'lat', part: 'torso' }));
    }
    torsoParts.push(P('chest', ellipsoid(k([0.072 * sd, 1.29, -0.07], [0.08 * sd, 1.38, -0.075]), k([0.06, 0.08, 0.032], [0.07, 0.09, 0.035])), { tag: 'scap', part: 'torso' }));
    torsoParts.push(P(nm(sd, 'Clav'), capsule(k([0.04 * sd, 1.425, -0.03], [0.05 * sd, 1.53, -0.035]), k([0.155 * sd, 1.365, -0.03], [0.172 * sd, 1.462, -0.035]), k(0.034, 0.041)), { tag: 'trap', part: 'torso' }));
    torsoParts.push(P(nm(sd, 'Clav'), capsule(k([0.025 * sd, 1.39, 0.03], [0.028 * sd, 1.49, 0.035]), k([0.15 * sd, 1.385, -0.005], [0.17 * sd, 1.482, -0.005]), k(0.018, 0.02)), { tag: 'clav', part: 'torso' }));
    torsoParts.push(P(nm(sd, 'Clav'), ellipsoid(k([0.165 * sd, 1.362, -0.018], [0.186 * sd, 1.46, -0.02]), k([0.03, 0.025, 0.035], [0.034, 0.028, 0.038])), { tag: 'acro', part: 'torso' }));
  }
  torsoParts.push(P('hips', ellipsoid(k([0, 0.985, 0.045], [0, 1.03, 0.06]), k([0.11, 0.07, 0.05], [0.13, 0.09, 0.06])), { tag: 'belly', part: 'torso' }));
  const torso = union(k(0.035, 0.04), torsoParts);

  // ---------- Cou ----------
  const nb = [0, neckY - k(0.045, 0.05), k(-0.006, -0.008)];
  const nt = [0, J('head')[1] + 0.025, J('head')[2] + 0.012];
  const nax = [nt[0] - nb[0], nt[1] - nb[1], nt[2] - nb[2]];
  const nlen = Math.hypot(...nax);
  const nu = nax.map((v) => v / nlen);
  const nfront = [0, -nu[2], nu[1]];
  const neckSecs = k(
    [[0, 0.062, 0.058, 0, 0], [0.04, 0.053, 0.05, 0, 0.002], [0.09, 0.05, 0.049, 0, 0.004], [0.14, 0.05, 0.051, 0, 0], [nlen, 0.05, 0.052, 0, -0.004]],
    [[0, 0.07, 0.066, 0, 0], [0.045, 0.062, 0.06, 0, 0.003], [0.1, 0.059, 0.059, 0, 0.005], [0.15, 0.058, 0.06, 0, 0], [nlen, 0.058, 0.06, 0, -0.004]],
  );
  const neckW = (() => {
    const c = chain([I.chest, I.neck, I.head], [neckY - nb[1] - 0.01, J('head')[1] - nb[1]], [0.03, 0.02]);
    return (q) => c((q[1] - nb[1]) * nu[1] + (q[2] - nb[2]) * nu[2]);
  })();
  const neckLoft = P('neck', loft(nb, nu, [1, 0, 0], nfront, neckSecs, { cap: 0.02 }), { tag: 'neck', part: 'neck', w: neckW });
  const neckParts = [neckLoft];
  if (!isF) neckParts.push(P('neck', ellipsoid([0, neckY + 0.045, 0.05], [0.012, 0.016, 0.01]), { tag: 'neck', part: 'neck' }));
  const neck = union(0.015, neckParts);

  // ---------- Tête ----------
  const { head, eyeCenters } = buildHead(sex, J('head'), I.head);

  // ---------- Bras et mains ----------
  const arms = {}, hands = {};
  for (const sd of sides) {
    const A = nm(sd, 'Arm');
    const sj = J(A);
    const armW = chain([I[A], I[nm(sd, 'Fore')], I[nm(sd, 'Hand')]], [elbowS, wristS - 0.006], [0.035, 0.016]);
    const armLoft = P(A, loft(sj, [0, -1, 0], [sd, 0, 0], [0, 0, 1], ARM[sex], { cap: 0.015 }), { tag: 'arm', part: nm(sd, 'arm'), w: (q) => armW(sj[1] - q[1]) });
    const delt = P(A, ellipsoid([sj[0] + k(0.006, 0.008) * sd, sj[1] - k(0.035, 0.04), sj[2] + 0.002], k([0.036, 0.075, 0.048], [0.043, 0.088, 0.056])), { tag: 'delt', part: nm(sd, 'arm') });
    arms[sd] = union(k(0.022, 0.026), [armLoft, delt]);
    // Main détendue (paume vers la cuisse, doigts légèrement fléchis), pouce vers l'avant.
    const H = nm(sd, 'Hand');
    const wj = J(H);
    const hs = k(1, 1.09);
    const hp = (x, y, z) => [wj[0] + x * sd * hs, wj[1] + y * hs, wj[2] + z * hs];
    const palm = [
      P(H, roundBox(hp(-0.001, -0.047, 0.003), [0.0125 * hs, 0.042 * hs, 0.034 * hs], 0.011 * hs), { tag: 'hand', part: nm(sd, 'hand') }),
      P(H, ellipsoid(hp(-0.009, -0.032, 0.019), [0.012 * hs, 0.022 * hs, 0.014 * hs]), { tag: 'hand', part: nm(sd, 'hand') }),
      P(H, ellipsoid(hp(-0.008, -0.05, -0.02), [0.01 * hs, 0.026 * hs, 0.012 * hs]), { tag: 'hand', part: nm(sd, 'hand') }),
    ];
    // Pouce : métacarpe + deux phalanges.
    const th = [hp(-0.004, -0.018, 0.021)];
    const tdir = [[-0.3, -0.78, 0.55], [-0.32, -0.9, 0.3], [-0.36, -0.93, 0.06]];
    const tlen = [0.035, 0.027, 0.022];
    for (let i = 0; i < 3; i++) {
      const d = tdir[i];
      const l = Math.hypot(...d);
      const p = th[i];
      th.push([p[0] + (d[0] / l) * sd * tlen[i] * hs, p[1] + (d[1] / l) * tlen[i] * hs, p[2] + (d[2] / l) * tlen[i] * hs]);
    }
    const thumb = [
      P(H, roundCone(th[0], th[1], 0.0125 * hs, 0.0105 * hs), { tag: 'hand', part: nm(sd, 'hand') }),
      P(H, roundCone(th[1], th[2], 0.0098 * hs, 0.0088 * hs), { tag: 'hand', part: nm(sd, 'hand') }),
      P(H, roundCone(th[2], th[3], 0.0086 * hs, 0.0074 * hs), { tag: 'hand', part: nm(sd, 'hand') }),
    ];
    // Doigts (os « Fing ») : index, majeur, annulaire, auriculaire.
    const G = nm(sd, 'Fing');
    const fj = J(G);
    const fp = (x, y, z) => [fj[0] + x * sd * hs, fj[1] + y * hs, fj[2] + z * hs];
    const fingers = [];
    const FD = [[0.024, 0.003, 0.95, 1.02], [0.008, 0, 1, 1.0], [-0.008, 0.003, 0.95, 0.96], [-0.023, 0.011, 0.78, 0.88]];
    for (const [fz, fy, fl, fr] of FD) {
      let a = 0.32;
      let p = fp(0, -fy, fz);
      const L = [0.044, 0.026, 0.019];
      const R = [0.0088, 0.0078, 0.0068, 0.006];
      for (let i = 0; i < 3; i++) {
        const dx = -Math.sin(a), dy = -Math.cos(a);
        const len = L[i] * fl * hs;
        const q = [p[0] + dx * sd * len, p[1] + dy * len, p[2] - fz * 0.06 * i * hs];
        fingers.push(P(G, roundCone(p, q, R[i] * fr * hs, R[i + 1] * fr * hs, { sv: 0.9, sw: 1.05, ref: [0, 0, 1] }), { tag: 'finger', part: nm(sd, 'hand') }));
        p = q;
        a += [0.55, 0.38, 0][i];
      }
    }
    hands[sd] = union(0.007, [union(0.009, palm), union(0.005, thumb), union(0.0022, fingers)]);
  }

  // ---------- Jambes et pieds ----------
  const legs = {}, feet = {};
  const footScale = k(0.93, 1.02);
  const ankleH = J('lFoot')[1];
  for (const sd of sides) {
    const Th = nm(sd, 'Thigh');
    const hj = J(Th);
    const legW = chain([I.hips, I[Th], I[nm(sd, 'Shin')], I[nm(sd, 'Foot')]], [0.0, kneeS, legLen - 0.004], [0.06, 0.042, 0.018]);
    const legLoft = P(Th, loft(hj, [0, -1, 0], [sd, 0, 0], [0, 0, 1], LEG[sex], { cap: 0.02 }), { tag: 'leg', part: nm(sd, 'leg'), w: (q) => legW(hj[1] - q[1]) });
    const patella = P(Th, ellipsoid([hj[0] - 0.006 * sd, hj[1] - kneeS + 0.012, hj[2] + 0.046], k([0.022, 0.026, 0.012], [0.024, 0.028, 0.013])), { tag: 'leg', part: nm(sd, 'leg'), w: () => [[I[Th], 0.6], [I[nm(sd, 'Shin')], 0.4]] });
    const vmed = P(Th, ellipsoid([hj[0] - 0.035 * sd, hj[1] - kneeS + 0.075, hj[2] + 0.025], [0.03, 0.05, 0.035]), { tag: 'leg', part: nm(sd, 'leg') });
    legs[sd] = union(0.02, [legLoft, patella, vmed]);
  }
  // Pied chaussé : talon, cou-de-pied, avant-pied (os orteil), semelle.
  const footShape = (sd, style) => {
    const F = nm(sd, 'Foot'), To = nm(sd, 'Toe');
    const aj = J(F), tj = J(To);
    const fs = footScale;
    const ap = (x, y, z) => [aj[0] + x * sd * fs, aj[1] + y, aj[2] + z * fs];
    const tp = (x, y, z) => [tj[0] + x * sd * fs, tj[1] + y, tj[2] + z * fs];
    const slim = style === 'boot' ? 0.9 : style === 'sneaker' ? 1.08 : 1;
    const soleT = style === 'sneaker' ? 0.022 : style === 'boot' ? 0.012 : 0.014;
    const upper = [
      P(F, ellipsoid(ap(0, -0.046, -0.026), [0.03 * slim, 0.034, 0.036]), { tag: 'foot', part: nm(sd, 'foot') }),
      P(F, ellipsoid(ap(0, -0.038, 0.056), [0.035 * slim, 0.033, 0.078], [-0.12, 0, 0]), { tag: 'foot', part: nm(sd, 'foot') }),
      P(F, ellipsoid(ap(0, -0.005, -0.002), [0.031, 0.036, 0.034]), { tag: 'foot', part: nm(sd, 'foot') }),
      // empeigne : relie le cou-de-pied à l'avant-pied sans creux
      P(F, ellipsoid(ap(0, -0.051, 0.112), [0.0365 * slim, 0.023, 0.074], [-0.04, 0, 0]), { tag: 'foot', part: nm(sd, 'foot') }),
      P(To, ellipsoid(tp(0, -0.007, style === 'boot' ? 0.027 : 0.023), [0.038 * slim, 0.0185, style === 'boot' ? 0.047 : 0.043]), { tag: 'foot', part: nm(sd, 'foot') }),
    ];
    const sy = -ankleH + soleT / 2;
    const sole = [
      P(F, roundBox(ap(0, sy, 0.05), [0.0335 * slim, soleT / 2, 0.098], Math.min(0.009, soleT / 2)), { tag: 'sole', part: nm(sd, 'foot') }),
      P(To, roundBox([tj[0], tj[1] - (tj[1] - (aj[1] + sy)), tj[2] + 0.028 * fs], [0.036 * slim * fs, soleT / 2, 0.044 * fs], Math.min(0.009, soleT / 2)), { tag: 'sole', part: nm(sd, 'foot') }),
    ];
    if (style === 'boot') sole.push(P(F, roundBox(ap(0, -ankleH + 0.016, -0.03), [0.028, 0.016, 0.026], 0.004), { tag: 'sole', part: nm(sd, 'foot') }));
    return union(0.005, [union(0.02, upper), union(0.004, sole)]);
  };

  // ---------- Assemblage du corps nu (peau) ----------
  const footStyle = variant === 'rider' ? 'boot' : variant === 'dress' ? 'flat' : opts.shoe || 'shoe';
  for (const sd of sides) feet[sd] = footShape(sd, footStyle);
  const legGroup = (sd) => union(0.014, [legs[sd], feet[sd]]);
  const armGroup = (sd) => union(0.012, [arms[sd], hands[sd]]);
  const core = union(0.03, [torso, neck]);
  const withArms = union(0.02, [core, armGroup(1), armGroup(-1)]);
  const withLegs = union(0.028, [withArms, legGroup(1), legGroup(-1)]);
  const skin = union(0.012, [withLegs, head]);

  // ---------- Vêtements ----------
  const layers = { skin };
  const L = (ev, bone, x, y, z) => ev.loc(I[bone], x, y, z);
  const armS = (ev, sd, x, y, z) => {
    const q = L(ev, nm(sd, 'Arm'), x, y, z);
    return shJ[1] - q[1];
  };
  const legS = (ev, sd, x, y, z) => {
    const q = L(ev, nm(sd, 'Thigh'), x, y, z);
    return hipJ[1] - q[1];
  };
  const legLat = (ev, sd, x, y, z) => {
    const q = L(ev, nm(sd, 'Thigh'), x, y, z);
    return (q[0] - J(nm(sd, 'Thigh'))[0]) * sd;
  };
  const torsoCloth = (extra = []) => union(k(0.05, 0.055), [torso, ...extra]);
  const neckBase = k(1.4, 1.505);
  // Encolure : trou autour de l'axe du cou (rayon r), plus profond devant (drop) ; > 0 = découvert.
  const neckHole = (x, y, z, r, drop) => {
    const zc = k(-0.012, -0.016);
    const rad = Math.hypot(x, (z - zc) * 1.08);
    const front = Math.max(0, (z - zc) / (rad + 1e-6));
    const yLow = neckBase - 0.05 - drop * front * front;
    return Math.min(r + front * 0.012 - rad, y - yLow);
  };
  const cuffS = wristS - 0.012;
  let bootTop = kneeS + k(0.04, 0.043);
  const waistY = k(1.0, 1.06);
  const hemRider = k(0.81, 0.85);

  if (variant === 'rider') {
    // Chemise blanche + plastron (visible au col et dans l'ouverture en V).
    const shirt = mask(0.002, offset(0.0035, union(0.03, [torsoCloth(), neck])), (x, y) => Math.max(k(1.17, 1.25) - y, y - (neckBase + k(0.05, 0.055))));
    // Veste ajustée, basques sur les hanches, ouverture en V, revers, poignets.
    const vBottom = k(1.205, 1.285);
    const jacketTorso = mask(0.0025, offset(0.0065, torsoCloth()), (x, y, z) => {
      // basques : coupées en arrondi devant (sous le dernier bouton), plus longues derrière
      const fr = Math.max(0, z - 0.01) / (Math.hypot(x, z - 0.01) + 1e-6);
      const hem = hemRider - 0.012 * Math.max(0, -z) / 0.12 + k(0.165, 0.17) * smoothstep(0.42, 0.97, fr) - y;
      const top = y - (neckBase + 0.028 + Math.max(0, -z) * 0.25);
      const vOpen = Math.min((y - vBottom) * 0.3 - Math.abs(x) + 0.004, z - 0.01);
      return Math.max(hem, top, vOpen);
    });
    const jacketArm = (sd) => mask(0.002, offset(0.0065, arms[sd]), (x, y, z, ev) => armS(ev, sd, x, y, z) - cuffS);
    const jacket = union(0.018, [jacketTorso, jacketArm(1), jacketArm(-1)]);
    // Culotte d'équitation (très ajustée) puis bottes hautes cirées.
    const breechesG = union(0.028, [torso, legs[1], legs[-1]]);
    const breeches = mask(0.002, offset(0.0018, breechesG), (x, y, z, ev) => y - waistY);
    const shaft = (sd) => {
      const Th = nm(sd, 'Thigh');
      const hj = J(Th);
      const s0 = bootTop - 0.01;
      const secs = k(
        [[s0, 0.051, 0.054, -0.01, -0.004], [0.52, 0.054, 0.059, -0.01, -0.013], [0.6, 0.05, 0.055, -0.009, -0.014], [0.68, 0.042, 0.047, -0.006, -0.008], [0.75, 0.036, 0.042, -0.003, 0], [0.8, 0.036, 0.046, 0, 0.006]],
        [[s0, 0.054, 0.058, -0.01, -0.004], [0.56, 0.058, 0.063, -0.01, -0.014], [0.64, 0.054, 0.059, -0.009, -0.015], [0.72, 0.045, 0.05, -0.006, -0.008], [0.8, 0.039, 0.045, -0.003, 0], [0.855, 0.039, 0.049, 0, 0.006]],
      );
      const lw = chain([I[Th], I[nm(sd, 'Shin')], I[nm(sd, 'Foot')]], [kneeS, legLen - 0.004], [0.042, 0.018]);
      return P(Th, loft(hj, [0, -1, 0], [sd, 0, 0], [0, 0, 1], secs, { cap: 0.01 }), { tag: 'boot', part: nm(sd, 'leg'), w: (q) => lw(hj[1] - q[1]) });
    };
    const boot = (sd) => mask(0.0015, offset(0.0035, union(0.02, [legs[sd], shaft(sd), feet[sd]])), (x, y, z, ev) => bootTop - 0.016 * clamp(legLat(ev, sd, x, y, z) / 0.05, -1, 1) - legS(ev, sd, x, y, z));
    const boots = union(0.004, [boot(1), boot(-1)]);
    Object.assign(layers, { shirt, jacket, breeches, boots });
  } else if (variant === 'casual') {
    // Haut ajusté rentré (polo / t-shirt / pull), pantalon droit, ceinture, chaussures.
    const top = mask(0.002, offset(0.004, union(0.016, [torsoCloth(), arms[1], arms[-1]])), (x, y, z, ev) => {
      const hem = waistY - 0.012 - y;
      const neckL = neckHole(x, y, z, k(0.072, 0.082), 0.03);
      const cuff = Math.abs(x) > 0.25 ? armS(ev, x > 0 ? 1 : -1, x, y, z) - (wristS - 0.004) : -1;
      return Math.max(hem, neckL, cuff);
    });
    const tube = (sd) => {
      const Th = nm(sd, 'Thigh');
      const hj = J(Th);
      const secs = k(
        [[kneeS - 0.06, 0.06, 0.062, -0.01, 0.006], [kneeS + 0.1, 0.058, 0.062, -0.01, -0.004], [legLen - 0.06, 0.05, 0.056, -0.004, 0.004], [legLen - 0.015, 0.05, 0.058, 0, 0.012]],
        [[kneeS - 0.06, 0.064, 0.066, -0.01, 0.006], [kneeS + 0.1, 0.062, 0.066, -0.01, -0.004], [legLen - 0.06, 0.054, 0.06, -0.004, 0.004], [legLen - 0.015, 0.054, 0.062, 0, 0.012]],
      );
      const lw = chain([I[Th], I[nm(sd, 'Shin')], I[nm(sd, 'Foot')]], [kneeS, legLen - 0.004], [0.06, 0.02]);
      return P(Th, loft(hj, [0, -1, 0], [sd, 0, 0], [0, 0, 1], secs, { cap: 0.01 }), { tag: 'trouser', part: nm(sd, 'leg'), w: (q) => lw(hj[1] - q[1]) });
    };
    const pantsG = union(0.035, [torso, union(0.03, [legs[1], tube(1)]), union(0.03, [legs[-1], tube(-1)])]);
    const pants = mask(0.002, offset(0.005, pantsG), (x, y, z, ev) => {
      const s = x > 0 ? legS(ev, 1, x, y, z) : legS(ev, -1, x, y, z);
      return Math.max(y - waistY, s - (legLen - 0.03));
    });
    const belt = mask(0.0015, offset(0.0085, torso), (x, y) => Math.max(y - waistY + 0.002, waistY - 0.034 - y));
    const shoes = union(0.004, [offset(0.0035, feet[1]), offset(0.0035, feet[-1])]);
    Object.assign(layers, { top, pants, belt, shoes });
  } else if (variant === 'dress') {
    // Robe : buste ajusté, mancherons, jupe trapèze au-dessus du genou ; jambes nues, ballerines.
    const bodice = mask(0.002, offset(0.004, union(0.016, [torsoCloth(), arms[1], arms[-1]])), (x, y, z, ev) => {
      const neckL = neckHole(x, y, z, 0.105, 0.085);
      const sl = Math.abs(x) > 0.14 ? Math.max(Math.min(armS(ev, 1, x, y, z), 2), Math.min(armS(ev, -1, x, y, z), 2)) - 0.1 : -1;
      return Math.max(neckL, sl, k(0.98, 1.04) - y);
    });
    const hemY = J('lShin')[1] + 0.07;
    const skirtW = (q) => {
      // Jupe : bassin en haut, cuisses vers l'ourlet (répartition gauche/droite selon x).
      const t = smoothstep(1.0, hemY, q[1]);
      const side = smoothstep(-0.07, 0.07, q[0]);
      const wl = t * 0.75;
      return [[I.hips, 1 - wl], [I.lThigh, wl * side], [I.rThigh, wl * (1 - side)]].filter((e) => e[1] > 1e-4);
    };
    const skirt = P('hips', loft([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], [[hemY, 0.215, 0.178, 0, 0.0], [0.62, 0.21, 0.17, 0, -0.004], [0.76, 0.198, 0.152, 0, -0.012], [0.86, 0.186, 0.134, 0, -0.016], [0.95, 0.164, 0.11, 0, -0.004], [1.03, 0.136, 0.094, 0, 0.004]], { cap: 0.004 }), { tag: 'skirt', part: 'torso', w: skirtW });
    const dressL = union(0.02, [bodice, offset(0.003, skirt)]);
    const shoes = union(0.004, [offset(0.0025, feet[1]), offset(0.0025, feet[-1])]);
    Object.assign(layers, { dress: dressL, shoes });
  }

  const garments = Object.entries(layers).filter(([n]) => n !== 'skin').map(([, v]) => v);
  const root = union(0.0028, [skin, ...garments]);

  // ---------- Zones ----------
  const headJ = J('head');
  const hs = sex === 'f' ? 1 : 1.055;
  const zoneHead = (ev, x, y, z, tagD) => {
    const hx = (x - headJ[0]) / hs, hy = (y - headJ[1]) / hs, hz = (z - headJ[2]) / hs;
    const ax = Math.abs(hx);
    // yeux : globe visible (entre les paupières) → sclérotique, iris, pupille
    for (const [tag, c] of [['eyeL', eyeCenters.l], ['eyeR', eyeCenters.r]]) {
      if (tagD[tag] < 0.0005) {
        const dx = x - c[0], dy = y - c[1], dz = z - c[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        const sd = tag === 'eyeL' ? 1 : -1;
        const fx = 0.04 * sd, fz = Math.sqrt(1 - fx * fx);
        const cos = (dx * fx + dz * fz) / l;
        return cos > 0.9905 ? Z.PUPIL : cos > 0.874 ? Z.IRIS : Z.SCLERA;
      }
    }
    if (tagD.lips < 0.0009 && hz > 0.084) return Z.LIPS;
    // sourcils : arc fin au-dessus de l'œil
    if (hz > 0.07 && ax > 0.009 && ax < 0.05) {
      const u = (ax - 0.009) / 0.041;
      const yc = 0.0575 + 0.0085 * Math.sin(Math.PI * Math.min(1, u * 1.1)) - 0.005 * u * u;
      const th = (sex === 'f' ? 0.0027 : 0.0039) * (1 - 0.6 * u) + 0.0009 + (u < 0.15 ? 0.0012 * (1 - u / 0.15) : 0);
      if (Math.abs(hy - yc) < th) return Z.BROW;
    }
    const earZone = tagD.ear < 0.0035 && ax > 0.058;
    // barbe (homme) : favoris, joues basses, moustache, menton
    if (sex === 'm' && !earZone && hz > -0.012 && hy > -0.092) {
      const th = Math.abs(Math.atan2(hx, hz));
      const cheek = th > 1.1 ? 0.048 : th > 0.55 ? 0.012 + (th - 0.55) * 0.065 : 0.0 + th * 0.022;
      const mouth = Math.hypot(hx / 0.0225, (hy + 0.0245) / 0.0098) < 1 && hz > 0.086;
      const nose = hy > -0.0075 && ax < 0.021;
      const under = hy < -0.06 && hz < 0.035 + (hy + 0.06) * 2;
      if (hy < cheek && !mouth && !nose && !(under && hy < -0.088)) return Z.BEARD;
    }
    if (!earZone && hy > hairlineY(hx, hz, sex) && hy > -0.04) return Z.SCALP;
    return Z.SKIN;
  };

  const tagSet = ['eyeL', 'eyeR', 'lips', 'ear'];
  const zoneOf = (ev, x, y, z) => {
    // calque dominant (le plus extérieur)
    let best = 'skin', bd = Infinity;
    for (const [n, node] of Object.entries(layers)) {
      const d = ev.node(node, x, y, z);
      if (d < bd - 1e-5) {
        bd = d;
        best = n;
      }
    }
    // Pieds : semelle.
    const footZ = (zFoot) => {
      for (const sd of sides) {
        const q = L(ev, nm(sd, 'Foot'), x, y, z);
        const aj = J(nm(sd, 'Foot'));
        if (Math.abs(q[0] - aj[0]) < 0.08 && q[1] < 0.13 && q[2] > aj[2] - 0.1 && q[2] < aj[2] + 0.3) {
          const sole = q[1] < (footStyle === 'sneaker' ? 0.024 : footStyle === 'boot' ? 0.013 : 0.012);
          const heel = footStyle === 'boot' && q[1] < 0.034 && q[2] < aj[2] - 0.005 && q[1] < 0.032 - Math.max(0, q[2] - aj[2] + 0.005);
          return sole || heel ? Z.SOLE : zFoot;
        }
      }
      return zFoot;
    };
    const armZone = (sd, base) => {
      const s = armS(ev, sd, x, y, z);
      if (s > wristS - 0.004) return Z.HAND;
      if (s > cuffS - 0.02 && variant === 'rider') return Z.CUFF;
      if (s > k(0.14, 0.15)) return Z.SLEEVE_LOW;
      return base;
    };
    const onArm = (sd) => {
      if (x * sd < 0.1) return false;
      const A = nm(sd, 'Arm');
      const q = L(ev, A, x, y, z);
      const j = J(A);
      const s = j[1] - q[1];
      return s > 0.03 && s < wristS + 0.25 && Math.hypot(q[0] - j[0], q[2] - j[2]) < 0.085;
    };
    const legZone = (sd) => {
      const s = legS(ev, sd, x, y, z);
      if (s < kneeS - 0.085) return Z.THIGH;
      if (s < bootTop - 0.016) return Z.KNEE;
      return Z.CALF;
    };
    // Haut (veste, polo, robe) : bandes verticales ; bas (pantalon, culotte) : ceinture puis bassin.
    const topZone = () => {
      if (y < waistY - 0.034) return Z.HIPS;
      if (y < k(1.16, 1.22)) return Z.TOP_LOW;
      // logo brodé côté cœur (gauche du personnage)
      if (z > 0.03 && x > 0.06 && x < 0.105 && y > k(1.262, 1.342) && y < k(1.279, 1.36)) return Z.LOGO;
      return Z.TOP;
    };
    const bottomZone = () => (y > waistY - 0.034 ? Z.BELT : Z.SEAT);
    if (best === 'skin') {
      if (y > neckBase + k(0.11, 0.12) - 0.02 || (y > neckBase + 0.02 && Math.abs(x) < 0.08)) {
        const tagD = {};
        if (y > neckBase + 0.06) {
          const D = ev.primDistances(x, y, z, ev._pd || (ev._pd = new Float64Array(ev.prims.length)));
          for (const t of tagSet) tagD[t] = Infinity;
          for (let i = 0; i < D.length; i++) {
            const tg = ev.prims[i].tag;
            if (tg === 'eyeL' || tg === 'eyeR' || tg === 'lips' || tg === 'ear') tagD[tg] = Math.min(tagD[tg], D[i]);
          }
          return zoneHead(ev, x, y, z, tagD);
        }
        return Z.NECK;
      }
      for (const sd of sides) if (onArm(sd)) return armZone(sd, Z.SLEEVE_UP) === Z.HAND ? Z.HAND : Z.SKIN;
      if (variant === 'dress' && y < k(0.95, 1)) {
        if (y < 0.16) return footZ(Z.LEG_BARE);
        return Z.LEG_BARE;
      }
      if (y < 0.2) return footZ(Z.FOOT);
      return Z.SKIN;
    }
    if (best === 'shirt') return y > k(1.36, 1.44) ? Z.COLLAR : Z.SHIRT;
    if (best === 'jacket') {
      for (const sd of sides) if (onArm(sd)) return armZone(sd, Z.SLEEVE_UP);
      // revers : bord de l'ouverture en V
      const vBottom = k(1.205, 1.285);
      const vEdge = (y - vBottom) * 0.3 - Math.abs(x) + 0.004;
      if (z > 0.02 && y > vBottom - 0.03 && vEdge > -0.024) return Z.LAPEL;
      return topZone();
    }
    if (best === 'top' || best === 'dress') {
      for (const sd of sides) if (onArm(sd)) return armZone(sd, Z.SLEEVE_UP);
      if (best === 'dress' && y < k(1.0, 1.05)) return Z.SKIRT;
      if (best === 'top' && y > neckBase - 0.1 && neckHole(x, y, z, k(0.072, 0.082) + 0.016, 0.03) > -0.004) return Z.COLLAR;
      return topZone();
    }
    if (best === 'breeches' || best === 'pants') {
      if (y > k(0.74, 0.79)) return bottomZone();
      return legZone(x > 0 ? 1 : -1);
    }
    if (best === 'belt') return Z.BELT;
    if (best === 'boots') return y < 0.13 ? footZ(Z.FOOT) : Z.CALF;
    if (best === 'shoes') return footZ(Z.FOOT);
    return Z.SKIN;
  };

  return { skel, root, layers, zoneOf, eyeCenters, sex, variant };
}
