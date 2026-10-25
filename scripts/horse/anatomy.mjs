// Anatomie du cheval de sport en champ de distance : tronc, encolure, tête, avant-main et arrière-main
// « sculptés » par profils (sections de surellipse balayées), membres osseux et tendineux, détails de la tête.
// Coordonnées en mètres réels (voir src/entities/horse/skeleton.js).
import { SDFScene, ellipsoid, rcone, loft, hoof, profile, frame, norm, sub, add, mul, cross, dot, clamp, smooth } from './sdf.mjs';
import { bonePos } from '../../src/entities/horse/skeleton.js';

const P = (keys) => profile(keys);

// ---------- Repère de la tête ----------
export const HEAD_ANGLE = (38 * Math.PI) / 180; // chanfrein : 38° en avant de la verticale
export const HEAD_O = bonePos('head');
export const HEAD_F = [0, -Math.cos(HEAD_ANGLE), Math.sin(HEAD_ANGLE)]; // vers le bout du nez
export const HEAD_U = [0, Math.sin(HEAD_ANGLE), Math.cos(HEAD_ANGLE)]; // vers le front (face dorsale)
// (a latéral, b le long du chanfrein, c vers le front) → monde
export const hp = (a, b, c) => [a, HEAD_O[1] + b * HEAD_F[1] + c * HEAD_U[1], HEAD_O[2] + b * HEAD_F[2] + c * HEAD_U[2]];
export const hv = (a, b, c) => [a, b * HEAD_F[1] + c * HEAD_U[1], b * HEAD_F[2] + c * HEAD_U[2]];
const headFrame = (u = [1, 0, 0]) => ({ u, v: HEAD_F, w: HEAD_U });
// Repère d'ellipsoïde : rayons [latéral, le long de l'axe, troisième axe].
const AX = (axis, side = [1, 0, 0]) => {
  const f = frame(axis, side);
  return { u: f.u, v: f.w, w: f.v };
};

// Yeux (centre du globe).
export const EYE_R = 0.0235;
export const EYE = (s) => hp(0.079 * s, 0.215, 0.006);

// ---------- Poids des os ----------
// Rachis : thorax / lombes / bassin selon z (transitions douces).
function spine(x, y, z) {
  const tl = smooth(-0.05, -0.3, z);
  const tp = smooth(-0.32, -0.56, z);
  const o = {};
  const body = 1 - tl;
  const loin = tl * (1 - tp);
  const pelvis = tp;
  if (body > 0) o.body = body;
  if (loin > 0) o.loin = loin;
  if (pelvis > 0) o.pelvis = pelvis;
  // Respiration : bas du thorax.
  const br = smooth(1.36, 1.0, y) * smooth(-0.4, -0.1, z) * smooth(0.55, 0.3, z) * 0.6;
  if (br > 0) {
    for (const k in o) o[k] *= 1 - br;
    o.breath = br;
  }
  return o;
}
// Chaîne d'os le long d'une polyligne : poids gaussiens selon l'abscisse curviligne du point projeté.
function chain(pts, names, x, y, z, width = 0.12) {
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ab = sub(b, a);
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = clamp(((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / l2, 0, 1);
    const q = add(a, mul(ab, t));
    const d = Math.hypot(x - q[0], y - q[1], z - q[2]);
    if (d < best) {
      best = d;
      bi = i;
      bt = t;
    }
  }
  const cum = [0];
  for (let i = 0; i < pts.length - 1; i++) cum.push(cum[i] + Math.hypot(...sub(pts[i + 1], pts[i])));
  const s = cum[bi] + bt * (cum[bi + 1] - cum[bi]);
  const o = {};
  let tot = 0;
  for (let i = 0; i < names.length; i++) {
    const a = cum[i], b = cum[Math.min(i + 1, cum.length - 1)];
    const dist = s < a ? a - s : s > b ? s - b : 0;
    const w = Math.exp(-((dist / width) ** 2));
    if (w > 0.01) {
      o[names[i]] = w;
      tot += w;
    }
  }
  for (const k in o) o[k] /= tot;
  return o;
}
const NA = bonePos('neck'), NB = bonePos('neck2'), NC = bonePos('neck3'), ND = bonePos('head');
const neckW = (x, y, z) => chain([NA, NB, NC, ND, [0, ND[1] + 0.01, ND[2] + 0.06]], ['neck', 'neck2', 'neck3', 'head'], x, y, z, 0.07);
const TAILP = ['tail', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'].map(bonePos);
const tailW = (x, y, z) => chain(TAILP, ['tail', 'tail2', 'tail3', 'tail4', 'tail5'], x, y, z, 0.04);
// Séparation verticale entre deux os autour de y0 (largeur w).
const splitY = (above, below, y0, w = 0.02) => (x, y) => {
  const t = smooth(y0 - w, y0 + w, y);
  const o = {};
  if (t > 0) o[above] = t;
  if (t < 1) o[below] = 1 - t;
  return o;
};
const asW = (w, x, y, z) => (typeof w === 'function' ? w(x, y, z) : { [w]: 1 });
const mixW = (wa, ka, wb) => (x, y, z) => {
  const o = {};
  const A = asW(wa, x, y, z), B = asW(wb, x, y, z);
  const k = typeof ka === 'function' ? ka(x, y, z) : ka;
  for (const n in A) o[n] = (o[n] || 0) + A[n] * k;
  for (const n in B) o[n] = (o[n] || 0) + B[n] * (1 - k);
  return o;
};

// Miroir gauche → droite (x → -x, os l → r).
const mx = (p) => [-p[0], p[1], p[2]];
const mBone = (n) => (/^[fh]l[A-Z]/.test(n) ? n[0] + 'r' + n.slice(2) : n === 'earL' ? 'earR' : n);
function mOwner(o) {
  if (typeof o === 'string') return mBone(o);
  if (typeof o === 'function') {
    return (x, y, z) => {
      const r = o(-x, y, z);
      const out = {};
      for (const k in r) out[mBone(k)] = r[k];
      return out;
    };
  }
  return o;
}

// Volume « vertical » (sections horizontales) défini par ses contours : avant zF(y), arrière zB(y), extérieur xO(y), intérieur xI(y).
function columnLoft(side, y0, y1, zF, zB, xO, xI, nBack = 2.2, nFront = 2.2) {
  // Repère : axe y, « haut » de section = arrière (-z), latéral X = (-1, 0, 0).
  return loft([0, 0, 0], [0, 1, 0], [0, 0, -1], {
    t0: y0,
    t1: y1,
    c: (y) => -(zF(y) + zB(y)) / 2,
    top: (y) => Math.max(0.004, (zF(y) - zB(y)) / 2),
    bot: (y) => Math.max(0.004, (zF(y) - zB(y)) / 2),
    wid: (y) => Math.max(0.004, (xO(y) - xI(y)) / 2),
    lat: (y) => (-side * (xO(y) + xI(y))) / 2,
    nt: typeof nBack === 'function' ? nBack : () => nBack,
    nb: typeof nFront === 'function' ? nFront : () => nFront,
  });
}

export function buildHorse() {
  const S = new SDFScene();
  const both = (f) => {
    f(1, (p) => p, (o) => o);
    f(-1, mx, mOwner);
  };

  // ======================= TRONC =======================
  // Ligne du dessus (garrot, dos, rein, croupe), ligne du dessous (passage de sangle, ventre, flanc), largeurs.
  const TOP = P([[-0.96, 1.4], [-0.92, 1.48], [-0.86, 1.545], [-0.76, 1.6], [-0.63, 1.64], [-0.52, 1.652], [-0.41, 1.628], [-0.28, 1.59], [-0.15, 1.567], [-0.02, 1.556], [0.12, 1.566], [0.25, 1.596], [0.36, 1.634], [0.45, 1.652], [0.54, 1.638], [0.64, 1.57], [0.74, 1.42], [0.8, 1.3]]);
  const BOT = P([[-0.96, 1.36], [-0.92, 1.3], [-0.84, 1.24], [-0.72, 1.17], [-0.58, 1.07], [-0.44, 0.995], [-0.27, 0.93], [-0.06, 0.888], [0.15, 0.886], [0.32, 0.9], [0.46, 0.925], [0.6, 0.97], [0.7, 1.03], [0.8, 1.12]]);
  const CEN = P([[-0.96, 1.38], [-0.9, 1.37], [-0.75, 1.36], [-0.5, 1.31], [-0.3, 1.27], [0, 1.245], [0.35, 1.245], [0.55, 1.26], [0.7, 1.24], [0.8, 1.21]]);
  const torso = loft([0, 0, 0], [0, 0, 1], [0, 1, 0], {
    t0: -0.96,
    t1: 0.8,
    c: CEN,
    top: (t) => TOP(t) - CEN(t),
    bot: (t) => CEN(t) - BOT(t),
    wid: P([[-0.96, 0.04], [-0.92, 0.1], [-0.86, 0.15], [-0.76, 0.2], [-0.62, 0.24], [-0.46, 0.27], [-0.3, 0.295], [-0.12, 0.312], [0.02, 0.316], [0.18, 0.308], [0.32, 0.29], [0.46, 0.262], [0.6, 0.225], [0.72, 0.17], [0.8, 0.08]]),
    nt: P([[-0.96, 2.0], [-0.8, 2.4], [-0.5, 2.6], [-0.2, 2.5], [0.1, 2.3], [0.3, 1.9], [0.45, 1.6], [0.6, 1.8], [0.8, 2.0]]),
    nb: P([[-0.96, 2.0], [-0.6, 2.2], [0, 2.3], [0.5, 2.1], [0.8, 2.0]]),
    wb: P([[-0.96, 0], [-0.4, 0.0], [0, 0.05], [0.4, 0.03], [0.8, 0]]),
  });
  S.add(torso, 0, spine, 'tronc');

  // ======================= ARRIÈRE-MAIN =======================
  // Cuisse et fesse : contours de profil (grasset devant, pointe de la fesse derrière) et de face (largeur aux grassets).
  both((s, m, mo) => {
    const thigh = columnLoft(
      s,
      0.74,
      1.6,
      P([[0.74, -0.56], [0.82, -0.52], [0.9, -0.478], [0.98, -0.462], [1.06, -0.466], [1.16, -0.49], [1.28, -0.49], [1.42, -0.45], [1.52, -0.46], [1.6, -0.52]]),
      P([[0.74, -0.71], [0.84, -0.775], [0.94, -0.84], [1.04, -0.895], [1.14, -0.93], [1.24, -0.95], [1.34, -0.955], [1.44, -0.935], [1.53, -0.89], [1.6, -0.8]]),
      P([[0.74, 0.255], [0.84, 0.272], [0.95, 0.285], [1.08, 0.293], [1.2, 0.289], [1.34, 0.274], [1.46, 0.248], [1.54, 0.21], [1.6, 0.15]]),
      P([[0.74, 0.12], [0.84, 0.085], [0.94, 0.045], [1.04, 0.015], [1.14, 0.0], [1.6, 0.0]]),
      P([[0.74, 2.0], [1.0, 2.3], [1.3, 2.5], [1.6, 2.2]]),
      P([[0.74, 2.0], [1.6, 2.2]]),
    );
    const own = (x, y, z) => {
      // Cuisse : fémur en bas, bassin en haut ; jambe (tibia) sous le grasset.
      const kb = clamp((1.42 - y) / 0.32, 0, 1);
      const o = mixW('hlU', kb, 'pelvis')(x, y, z);
      const kl = smooth(0.9, 0.78, y);
      if (kl > 0) {
        for (const n in o) o[n] *= 1 - kl;
        o.hlL = (o.hlL || 0) + kl;
      }
      return o;
    };
    S.add(thigh, 0.07, mo(own), 'cuisse');
    // Pointe de la hanche.
    S.add(ellipsoid(m([0.232, 1.5, -0.41]), [0.042, 0.038, 0.05]), 0.1, mo('pelvis'), 'hanche');
  });
  // Raie des fesses (sous la queue).
  S.sub(ellipsoid([0, 1.16, -0.985], [0.02, 0.27, 0.06]), 0.05, 'raie');

  // ======================= AVANT-MAIN =======================
  // Épaule, bras, poitrail et haut de l'avant-bras : un volume par côté, contours de profil et de face.
  both((s, m, mo) => {
    const sh = columnLoft(
      s,
      0.72,
      1.56,
      P([[0.72, 0.628], [0.82, 0.634], [0.92, 0.65], [1.0, 0.69], [1.08, 0.745], [1.15, 0.778], [1.22, 0.772], [1.3, 0.725], [1.4, 0.65], [1.48, 0.575], [1.56, 0.5]]),
      P([[0.72, 0.512], [0.82, 0.498], [0.92, 0.472], [1.0, 0.452], [1.08, 0.43], [1.18, 0.405], [1.3, 0.39], [1.42, 0.385], [1.5, 0.385], [1.56, 0.4]]),
      P([[0.72, 0.232], [0.82, 0.24], [0.92, 0.25], [1.02, 0.262], [1.12, 0.27], [1.22, 0.268], [1.32, 0.255], [1.42, 0.232], [1.5, 0.2], [1.56, 0.14]]),
      P([[0.72, 0.122], [0.82, 0.112], [0.92, 0.1], [1.0, 0.085], [1.1, 0.065], [1.2, 0.06], [1.32, 0.07], [1.45, 0.08], [1.56, 0.07]]),
      2.2,
      P([[0.72, 2.0], [1.0, 2.0], [1.15, 2.3], [1.4, 2.0], [1.56, 2.0]]),
    );
    const own = (x, y, z) => {
      // Omoplate en haut (avec le tronc), humérus au milieu, avant-bras en bas.
      const ksc = smooth(1.12, 1.3, y);
      const kfu = smooth(0.98, 0.86, y);
      const o = {};
      const base = { flSc: ksc * 0.75, body: ksc * 0.25, flHu: (1 - ksc) * (1 - kfu), flU: kfu };
      for (const n in base) if (base[n] > 0) o[n] = base[n];
      return o;
    };
    S.add(sh, 0.08, mo(own), 'epaule');
    // Pectoraux : deux masses rondes de part et d'autre du sillon médian.
    S.add(ellipsoid(m([0.072, 1.09, 0.752]), [0.074, 0.1, 0.06]), 0.06, mo(mixW('flHu', 0.4, 'body')), 'pectoral');
    // Pointe de l'épaule (tubercule de l'humérus) et coude (olécrane).
    S.add(ellipsoid(m([0.2, 1.18, 0.765]), [0.04, 0.05, 0.04]), 0.07, mo('flHu'), 'pointe-epaule');
    S.add(ellipsoid(m([0.19, 0.96, 0.485]), [0.034, 0.04, 0.034]), 0.06, mo('flU'), 'coude');
    // Épine de l'omoplate : léger relief.
    S.add(rcone(m([0.2, 1.47, 0.47]), m([0.245, 1.26, 0.665]), 0.012, 0.016, {}), 0.08, mo(mixW('flSc', 0.8, 'body')), 'epine');
  });
  // Sillon médian du poitrail.
  S.sub(ellipsoid([0, 1.06, 0.865], [0.014, 0.12, 0.05]), 0.035, 'poitrail');

  // ======================= MEMBRES =======================
  both((s, m, mo) => {
    const p = (x, y, z) => m([x, y, z]);
    // --- Antérieur ---
    S.add(rcone(p(0.188, 0.9, 0.567), p(0.168, 0.53, 0.572), 0.08, 0.043, { side: [1, 0, 0], su: 0.8, sv: 1.0 }), 0.05, mo('flU'), 'avant-bras');
    S.add(ellipsoid(p(0.2, 0.76, 0.603), [0.04, 0.12, 0.038]), 0.035, mo('flU'), 'extenseur');
    // Châtaigne (face interne de l'avant-bras).
    S.add(ellipsoid(p(0.13, 0.6, 0.565), [0.012, 0.02, 0.016]), 0.006, mo('flU'), 'chataigne');
    // Genou (carpe) : bloc aplati, os accessoire derrière.
    S.add(ellipsoid(p(0.165, 0.487, 0.574), [0.046, 0.054, 0.043]), 0.028, mo(splitY('flU', 'flL', 0.485, 0.025)), 'genou');
    S.add(ellipsoid(p(0.165, 0.507, 0.532), [0.019, 0.026, 0.018]), 0.02, mo('flU'), 'os-accessoire');
    // Canon : os devant, tendons fléchisseurs derrière.
    S.add(rcone(p(0.165, 0.455, 0.582), p(0.152, 0.215, 0.588), 0.0245, 0.0215, {}), 0.014, mo('flL'), 'canon');
    S.add(rcone(p(0.164, 0.448, 0.549), p(0.151, 0.225, 0.551), 0.0155, 0.0175, { side: [1, 0, 0], su: 0.85, sv: 1.0 }), 0.011, mo('flL'), 'tendons');
    // Boulet, ergot, paturon, glomes, sabot.
    S.add(ellipsoid(p(0.15, 0.19, 0.568), [0.036, 0.041, 0.046]), 0.024, mo(splitY('flL', 'flP', 0.185, 0.02)), 'boulet');
    S.add(ellipsoid(p(0.15, 0.163, 0.527), [0.013, 0.013, 0.013]), 0.012, mo('flP'), 'ergot');
    S.add(rcone(p(0.15, 0.18, 0.578), p(0.146, 0.07, 0.636), 0.029, 0.031, { side: [1, 0, 0], su: 1.08, sv: 0.92 }), 0.02, mo('flP'), 'paturon');
    for (const g of [-1, 1]) S.add(ellipsoid(p(0.146 + g * 0.021, 0.047, 0.61), [0.017, 0.019, 0.017]), 0.014, mo('flP'), 'glome');
    S.add(hoof(p(0.145, 0, 0.664), { w: 0.06, l: 0.064, h: 0.076, hh: 0.036, slope: (52 * Math.PI) / 180 }), 0.008, mo('flH'), 'sabot');

    // --- Postérieur ---
    S.add(ellipsoid(p(0.22, 0.89, -0.5), [0.024, 0.03, 0.024]), 0.07, mo(splitY('hlU', 'hlL', 0.86, 0.04)), 'grasset');
    S.add(rcone(p(0.208, 0.8, -0.62), p(0.176, 0.565, -0.748), 0.076, 0.04, { side: [1, 0, 0], su: 0.8, sv: 1.0 }), 0.05, mo('hlL'), 'jambe');
    S.add(ellipsoid(p(0.19, 0.74, -0.668), [0.044, 0.1, 0.052], AX([0, 1, 0.55])), 0.045, mo('hlL'), 'gastrocnemien');
    S.add(rcone(p(0.183, 0.72, -0.722), p(0.172, 0.585, -0.828), 0.022, 0.019, {}), 0.025, mo('hlL'), 'corde');
    S.add(ellipsoid(p(0.172, 0.5, -0.762), [0.043, 0.062, 0.054]), 0.028, mo(splitY('hlL', 'hlC', 0.49, 0.03)), 'jarret');
    S.add(ellipsoid(p(0.17, 0.568, -0.826), [0.023, 0.037, 0.027]), 0.02, mo('hlL'), 'pointe-jarret');
    S.add(ellipsoid(p(0.135, 0.52, -0.76), [0.01, 0.016, 0.014]), 0.006, mo('hlC'), 'chataigne');
    S.add(rcone(p(0.166, 0.45, -0.75), p(0.156, 0.215, -0.748), 0.0265, 0.0225, {}), 0.014, mo('hlC'), 'canon');
    S.add(rcone(p(0.164, 0.44, -0.786), p(0.155, 0.225, -0.786), 0.016, 0.018, { side: [1, 0, 0], su: 0.85, sv: 1.0 }), 0.011, mo('hlC'), 'tendons');
    S.add(ellipsoid(p(0.155, 0.19, -0.764), [0.036, 0.041, 0.046]), 0.024, mo(splitY('hlC', 'hlP', 0.185, 0.02)), 'boulet');
    S.add(ellipsoid(p(0.155, 0.163, -0.804), [0.013, 0.013, 0.013]), 0.012, mo('hlP'), 'ergot');
    S.add(rcone(p(0.155, 0.18, -0.757), p(0.151, 0.07, -0.709), 0.029, 0.031, { side: [1, 0, 0], su: 1.06, sv: 0.92 }), 0.02, mo('hlP'), 'paturon');
    for (const g of [-1, 1]) S.add(ellipsoid(p(0.151 + g * 0.02, 0.047, -0.73), [0.016, 0.019, 0.017]), 0.014, mo('hlP'), 'glome');
    S.add(hoof(p(0.15, 0, -0.685), { w: 0.057, l: 0.063, h: 0.078, hh: 0.038, slope: (56 * Math.PI) / 180 }), 0.008, mo('hlH'), 'sabot');
  });

  // ======================= ENCOLURE =======================
  // Axe base (enfouie dans le poitrail) → nuque, section aplatie, bord supérieur convexe.
  const nA = [0, 1.22, 0.55], nB = [0, 1.99, 1.16];
  const nDir = norm(sub(nB, nA));
  const nUp = norm(cross(nDir, [1, 0, 0])); // vers le haut-arrière (crinière)
  const nLen = Math.hypot(...sub(nB, nA));
  const neck = loft(nA, nDir, nUp, {
    t0: 0.0,
    t1: nLen,
    cap: 0.06,
    top: P([[0, 0.24], [0.12, 0.33], [0.22, 0.345], [0.36, 0.32], [0.5, 0.285], [0.64, 0.24], [0.76, 0.19], [0.86, 0.145], [nLen, 0.1]]),
    bot: P([[0, 0.2], [0.12, 0.27], [0.24, 0.245], [0.4, 0.2], [0.56, 0.17], [0.7, 0.15], [0.82, 0.14], [nLen, 0.12]]),
    wid: P([[0, 0.2], [0.14, 0.24], [0.28, 0.2], [0.44, 0.162], [0.6, 0.138], [0.76, 0.115], [0.88, 0.1], [nLen, 0.09]]),
    nt: P([[0, 2.0], [0.4, 2.3], [nLen, 2.3]]),
    nb: P([[0, 2.0], [nLen, 2.1]]),
  });
  S.add(neck, 0.1, neckW, 'encolure');

  // ======================= TÊTE =======================
  // Volume principal balayé le long du chanfrein : profil dorsal (nuque, front, chanfrein, bout du nez),
  // profil ventral (gorge, ganache ronde, mâchoire, menton), sections larges en bas aux ganaches.
  const cT = P([[-0.06, 0.03], [-0.02, 0.05], [0.03, 0.066], [0.09, 0.076], [0.16, 0.079], [0.24, 0.078], [0.32, 0.073], [0.4, 0.067], [0.47, 0.062], [0.53, 0.057], [0.575, 0.048], [0.61, 0.03], [0.632, 0.006], [0.645, -0.025]]);
  const cB = P([[-0.06, -0.075], [-0.02, -0.11], [0.03, -0.165], [0.08, -0.215], [0.13, -0.236], [0.19, -0.23], [0.25, -0.208], [0.32, -0.177], [0.4, -0.153], [0.47, -0.138], [0.52, -0.133], [0.56, -0.132], [0.6, -0.118], [0.63, -0.092], [0.645, -0.06]]);
  const head = loft(HEAD_O, HEAD_F, HEAD_U, {
    t0: -0.06,
    t1: 0.645,
    cap: 0.02,
    c: (b) => (cT(b) + cB(b)) / 2,
    top: (b) => (cT(b) - cB(b)) / 2,
    bot: (b) => (cT(b) - cB(b)) / 2,
    wid: P([[-0.06, 0.056], [-0.02, 0.062], [0.04, 0.078], [0.1, 0.09], [0.17, 0.094], [0.24, 0.09], [0.31, 0.083], [0.38, 0.075], [0.45, 0.067], [0.51, 0.061], [0.56, 0.064], [0.6, 0.061], [0.645, 0.045]]),
    nt: P([[-0.06, 2.0], [0.05, 2.1], [0.18, 2.6], [0.28, 2.2], [0.42, 1.9], [0.55, 2.0], [0.645, 2.0]]),
    nb: P([[-0.06, 2.0], [0.12, 2.4], [0.3, 2.0], [0.645, 2.1]]),
    wb: P([[-0.06, 0.05], [0.04, 0.2], [0.12, 0.26], [0.2, 0.18], [0.3, 0.02], [0.42, -0.12], [0.52, -0.08], [0.6, 0.0], [0.645, 0]]),
  });
  const jawK = (x, y, z) => {
    // Lèvre inférieure et menton : os « jaw ».
    const q = sub([x, y, z], HEAD_O);
    const b = q[1] * HEAD_F[1] + q[2] * HEAD_F[2], c = q[1] * HEAD_U[1] + q[2] * HEAD_U[2];
    return 1 - smooth(-0.085, -0.11, c) * smooth(0.42, 0.52, b) * 0.85;
  };
  S.add(head, 0.08, mixW('head', jawK, 'jaw'), 'tete');
  const H = (a, b, c) => hp(a, b, c);
  const hf = headFrame();
  // Auge : creux entre les branches de la mandibule (vue de dessous).
  S.sub(rcone(H(0, 0.05, -0.27), H(0, 0.4, -0.185), 0.05, 0.026, {}), 0.05, 'auge');
  // Arcades (os orbitaire), salières, crêtes zygomatiques : reliefs osseux discrets sous la peau.
  both((s) => {
    S.add(ellipsoid(H(0.07 * s, 0.205, 0.05), [0.02, 0.045, 0.016], hf), 0.04, 'head', 'arcade');
    S.sub(ellipsoid(H(0.066 * s, 0.125, 0.06), [0.016, 0.026, 0.012], hf), 0.03, 'saliere');
    S.add(ellipsoid(H(0.079 * s, 0.315, -0.05), [0.012, 0.07, 0.012], AX(add(HEAD_F, mul(HEAD_U, -0.2)))), 0.04, 'head', 'zygoma');
  });
  // Œil : orbite saillante, coque des paupières, fente en amande (le globe est un maillage à part).
  both((s) => {
    const e = EYE(s);
    S.add(ellipsoid(add(e, [-0.01 * s, 0, 0]), [0.028, 0.042, 0.034], hf), 0.03, 'head', 'orbite');
    S.add(ellipsoid(e, [EYE_R + 0.004, EYE_R + 0.0045, EYE_R + 0.004], hf), 0.006, 'head', 'paupieres');
    const ax = norm(add(HEAD_F, mul(HEAD_U, 0.15)));
    const up = norm(cross([s, 0, 0], ax));
    S.sub(ellipsoid(add(e, [0.026 * s, 0, 0]), [0.026, 0.019, 0.0105], { u: [s, 0, 0], v: ax, w: mul(up, s) }), 0.003, 'fente');
  });
  // Naseaux : aile externe charnue, grande ouverture en virgule (haut rond, queue vers la lèvre).
  both((s) => {
    S.add(rcone(H(0.051 * s, 0.548, 0.026), H(0.058 * s, 0.598, -0.014), 0.009, 0.008, {}), 0.016, 'head', 'aile-naseau');
    S.sub(rcone(H(0.038 * s, 0.556, 0.02), H(0.044 * s, 0.598, -0.022), 0.0125, 0.006, {}), 0.005, 'naseau');
  });
  // Lèvres et menton.
  S.add(ellipsoid(H(0, 0.606, -0.06), [0.046, 0.04, 0.034], hf), 0.022, 'head', 'levre');
  S.add(ellipsoid(H(0, 0.556, -0.118), [0.035, 0.055, 0.03], hf), 0.022, 'jaw', 'menton');
  both((s) => S.sub(rcone(H(0.043 * s, 0.5, -0.088), H(0.03 * s, 0.612, -0.091), 0.0028, 0.0022, {}), 0.004, 'bouche'));
  // Oreilles : base en cornet, feuille large, pointe fine ; pavillon creusé vers l'avant-extérieur.
  both((s) => {
    const base = H(0.048 * s, 0.01, 0.05);
    const dir = norm([0.28 * s, 0.94, 0.2]);
    const f0 = [0.42 * s, -0.12, 0.9];
    const front = norm(sub(f0, mul(dir, dot(f0, dir))));
    const side = norm(cross(dir, front));
    const ear = s > 0 ? 'earL' : 'earR';
    const at = (d) => add(base, mul(dir, d));
    S.add(rcone(at(-0.01), at(0.05), 0.028, 0.033, { side, su: 1.0, sv: 0.75 }), 0.02, ear, 'oreille');
    S.add(rcone(at(0.05), at(0.145), 0.033, 0.006, { side, su: 1.0, sv: 0.5 }), 0.03, ear, 'oreille');
    S.add(ellipsoid(at(0.146), [0.008, 0.013, 0.006], { u: side, v: dir, w: front }), 0.012, ear, 'pointe-oreille');
    S.sub(ellipsoid(add(at(0.062), mul(front, 0.015)), [0.018, 0.048, 0.009], { u: side, v: dir, w: front }), 0.006, 'pavillon');
  });

  // ======================= QUEUE (tronçon osseux) =======================
  S.add(rcone([0, 1.505, -0.9], [0, 1.12, -1.0], 0.045, 0.024, {}), 0.04, tailW, 'queue');

  // ======================= RELIEFS =======================
  both((s, m) => {
    S.sub(ellipsoid(m([0.318, 1.36, -0.33]), [0.035, 0.07, 0.09]), 0.08, 'flanc');
  });
  return S;
}
