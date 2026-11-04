// Cheval Tripo : filet (bridon à muserolle française) et rênes ajustés à la tête du modèle, générés à la construction
// (scripts/real/build-tripo-horse.mjs) sur le maillage complet calé et redressé (mètres, repère du jeu).
//
// Construction reprise de la sellerie du cheval du jeu (scripts/horse/tack.mjs) : lanières à quatre sommets par section
// (largeur 13 à 24 mm, épaisseur 3 à 5 mm, à 2,5 mm de la peau, 2 mm au moins), anneaux du mors (tores), canon (tube),
// courbes de Catmull-Rom rééchantillonnées à pas constant. La peau n'est pas un champ de distance mais le maillage Tripo : points
// les plus proches sur ses triangles (grille régulière), lancers de rayons pour les points de passage, distance signée
// (normale interpolée) pour vérifier chaque lanière contre le maillage complet ET le niveau de détail proche (LOD0, celui
// qui est affiché de près : ses grands triangles passent parfois au-dessus de la surface complète). Les lanières tendues
// d'un côté à l'autre (dessus de la nuque, frontal, muserolle) suivent l'enveloppe convexe de la coupe de la tête : elles
// passent par-dessus les creux et les mèches (toupet, crinière) au lieu d'en suivre le relief.
//
// Repères mesurés sur le maillage (rapportés par la construction) : nuque (dessus du crâne derrière les oreilles, rayon
// vertical dans le plan médian), bases des oreilles (sommets liés surtout aux os des oreilles : bords avant et arrière de
// leur racine), yeux (centre des paupières de skeleton-fit, posé sur la peau par un rayon latéral), crêtes faciales
// (arête latérale saillante sous l'œil, tranche par tranche le long du chanfrein ; extrémité = tranche la plus basse où elle se
// mesure encore), commissures des lèvres (relevées sur les vues de contrôle texturées, posées sur la peau par un rayon
// latéral), barbe (creux du contour inférieur du plan médian derrière le menton), gorge (creux entre ganache et encolure,
// même contour) et peau entraînée par les oreilles (bord arrière et bas : la têtière passe derrière, le frontal dessous).
//
// Pièces : têtière et montants (de l'anneau gauche du mors, derrière l'œil et l'oreille, par-dessus la nuque, à l'anneau
// droit), frontal (devant les oreilles), muserolle française (caveçon : tour de nez centré 4 cm sous l'extrémité des
// crêtes faciales, avec sa têtière le long des joues, glissée sous la têtière du filet ; montants passés par-dessus),
// sous-gorge (lâche sous la gorge), mors à anneaux (anneaux aux commissures, canon brisé dans la bouche), rênes en main (de
// l'arrière des anneaux à la position de repos des os reinL/reinR).
// Rênes : fil tendu entre l'anneau et la main, écarté de la peau (tête, encolure) d'au moins 2,5 mm : la tête basse du
// modèle (bout du nez à 1,33 m, mains à 1,78 m au-dessus du garrot) les couche sur les côtés de l'encolure, comme un
// cheval rassemblé.
// Poids : mors 100 % tête ; lanières du filet : poids de la peau sous elles, os des oreilles exclus (100 % tête sur la
// face ; à la nuque et sous la ganache, la peau mêle tête et encolure : la lanière la suit au lieu de s'y enfoncer
// quand la tête bouge). Rênes : tête près du mors → os reinL/reinR à la main (comme reinsRidden de tack.mjs) ;
// là où la rêne touche l'encolure (moins de 1,5 cm), poids de la peau sous elle (elle suit l'encolure qui bouge), fondu
// le long de la lanière entre ces appuis et les deux bouts.
import { add, sub, mul, dot, cross, len, norm, clamp, lerp, smooth } from '../../horse/sdf.mjs';
import { BONE_INDEX } from '../../../src/entities/horse/skeleton.js';

// Matériaux (rendu : couleurs de la sellerie du cheval du jeu, src/entities/horse/tack.js).
export const BRIDLE_MATS = {
  leather: { color: '#24170f', roughness: 0.45, metalness: 0 },
  steel: { color: '#c9c9cc', roughness: 0.22, metalness: 1 },
  rubber: { color: '#0f0f0f', roughness: 0.8, metalness: 0 },
};
// Commissures des lèvres (y, z), relevées sur les vues de contrôle texturées (lèvres jointes : la fente n'a pas de
// relief mesurable de façon sûre) ; x : posées sur la peau par un rayon latéral.
const MOUTH_CORNER = { 1: [1.332, 1.468], [-1]: [1.331, 1.474] };
// Écart à la peau (bas de la lanière) et distance minimale vérifiée (mètres).
const GAP = 0.0025;
const MIN_CLEAR = 0.002;
// Muserolle : centre à 4 cm sous l'extrémité des crêtes faciales (bord haut à deux doigts de la crête).
const NOSE_BELOW = 0.04;
// Pente maximale des rehaussements locaux (une bosse soulève la lanière en douceur de part et d'autre).
const PUSH_SLOPE = 0.2;

// ---------- Surface : point le plus proche, rayons ----------
function closestOnTri(p, a, b, c) {
  // Ericson, Real-Time Collision Detection, 5.1.5 ; renvoie [x, y, z, u, v, w] (coordonnées barycentriques de a, b, c).
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [...a, 1, 0, 0];
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [...b, 0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [...add(a, mul(ab, v)), 1 - v, v, 0];
  }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [...c, 0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [...add(a, mul(ac, w)), 1 - w, 0, w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [...add(b, mul(sub(c, b), w)), 0, 1 - w, w];
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [...add(a, add(mul(ab, v), mul(ac, w))), 1 - v - w, v, w];
}

export class Surface {
  // keep(t) : triangle t retenu ; cell : pas de la grille (mètres).
  constructor(P, N, I, keep, cell = 0.02) {
    this.P = P;
    this.N = N;
    this.I = I;
    this.cell = cell;
    const tris = [];
    for (let t = 0; t < I.length / 3; t++) if (keep(t)) tris.push(t);
    this.tris = tris;
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const t of tris) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) {
      const x = P[I[t * 3 + k] * 3 + c];
      lo[c] = Math.min(lo[c], x);
      hi[c] = Math.max(hi[c], x);
    }
    this.lo = lo;
    this.dim = [0, 1, 2].map((c) => Math.max(1, Math.ceil((hi[c] - lo[c]) / cell) + 1));
    this.grid = new Map();
    for (const t of tris) {
      const a = [0, 1, 2].map((c) => Math.min(...[0, 1, 2].map((k) => P[I[t * 3 + k] * 3 + c])));
      const b = [0, 1, 2].map((c) => Math.max(...[0, 1, 2].map((k) => P[I[t * 3 + k] * 3 + c])));
      const i0 = a.map((x, c) => Math.floor((x - lo[c]) / cell)), i1 = b.map((x, c) => Math.floor((x - lo[c]) / cell));
      for (let i = i0[0]; i <= i1[0]; i++) for (let j = i0[1]; j <= i1[1]; j++) for (let k = i0[2]; k <= i1[2]; k++) {
        const key = i + this.dim[0] * (j + this.dim[1] * k);
        let L = this.grid.get(key);
        if (!L) this.grid.set(key, (L = []));
        L.push(t);
      }
    }
  }

  v(i) {
    return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]];
  }

  // Point le plus proche : { q, n (normale interpolée), s (distance signée : > 0 à l'extérieur), t, bary }.
  closest(p) {
    const { cell, lo, dim, grid, I } = this;
    const ci = [0, 1, 2].map((c) => Math.floor((p[c] - lo[c]) / cell));
    let best = Infinity, bt = -1, bq = null;
    const maxR = Math.max(...dim) + Math.max(...ci.map((x, c) => Math.max(-x, x - dim[c])));
    for (let r = 0; r <= maxR; r++) {
      for (let i = ci[0] - r; i <= ci[0] + r; i++) {
        if (i < 0 || i >= dim[0]) continue;
        for (let j = ci[1] - r; j <= ci[1] + r; j++) {
          if (j < 0 || j >= dim[1]) continue;
          for (let k = ci[2] - r; k <= ci[2] + r; k++) {
            if (k < 0 || k >= dim[2]) continue;
            if (Math.max(Math.abs(i - ci[0]), Math.abs(j - ci[1]), Math.abs(k - ci[2])) !== r) continue;
            const L = grid.get(i + dim[0] * (j + dim[1] * k));
            if (!L) continue;
            for (const t of L) {
              const q = closestOnTri(p, this.v(I[t * 3]), this.v(I[t * 3 + 1]), this.v(I[t * 3 + 2]));
              const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
              if (d < best) {
                best = d;
                bt = t;
                bq = q;
              }
            }
          }
        }
      }
      if (best <= r * cell) break;
    }
    const n = this.normalAt(bt, bq[3], bq[4], bq[5]);
    const q = [bq[0], bq[1], bq[2]];
    return { q, n, s: Math.sign(dot(sub(p, q), n) || 1) * best, t: bt, bary: [bq[3], bq[4], bq[5]] };
  }

  normalAt(t, u, v, w) {
    const { N, I } = this;
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    return norm([0, 1, 2].map((k) => N[a * 3 + k] * u + N[b * 3 + k] * v + N[c * 3 + k] * w));
  }

  // Premier triangle touché par le rayon o + d·s (0 < s < maxT), deux faces : { q, n, s, t } ou null.
  ray(o, d, maxT = 1) {
    const { I } = this;
    let best = maxT, bt = -1, bb = null;
    for (const t of this.tris) {
      const a = this.v(I[t * 3]), b = this.v(I[t * 3 + 1]), c = this.v(I[t * 3 + 2]);
      const e1 = sub(b, a), e2 = sub(c, a), pv = cross(d, e2), det = dot(e1, pv);
      if (Math.abs(det) < 1e-12) continue;
      const tv = sub(o, a), u = dot(tv, pv) / det;
      if (u < 0 || u > 1) continue;
      const qv = cross(tv, e1), v = dot(d, qv) / det;
      if (v < 0 || u + v > 1) continue;
      const s = dot(e2, qv) / det;
      if (s > 1e-6 && s < best) {
        best = s;
        bt = t;
        bb = [1 - u - v, u, v];
      }
    }
    if (bt < 0) return null;
    return { q: add(o, mul(d, best)), n: this.normalAt(bt, ...bb), s: best, t: bt, bary: bb };
  }
}

// ---------- Courbes ----------
// Catmull-Rom rééchantillonnée à pas constant (adapté de scripts/horse/tack.mjs, smoothCurve).
function smoothCurve(points, closed, step) {
  const P = points, n = P.length;
  const get = (i) => (closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)]);
  const dense = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < 12; k++) {
      const t = k / 12, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  if (!closed) dense.push(P[n - 1]);
  return resample(dense, step, closed);
}
// Polyligne rééchantillonnée à pas constant (extrémités conservées si ouverte).
function resample(pts, step, closed = false) {
  const src = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + len(sub(src[i], src[i - 1])));
  const L = cum[cum.length - 1];
  const n = Math.max(closed ? 3 : 2, Math.round(L / step) + (closed ? 0 : 1));
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = closed ? (k / n) * L : (k / (n - 1)) * L;
    while (j < src.length - 1 && cum[j] < s) j++;
    const f = clamp((s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1), 0, 1);
    out.push(add(src[j - 1], mul(sub(src[j], src[j - 1]), f)));
  }
  return out;
}
const arcLengths = (pts, closed = false) => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  if (closed) cum.total = cum[cum.length - 1] + len(sub(pts[0], pts[pts.length - 1]));
  return cum;
};
// Lissage laplacien d'une polyligne (extrémités fixes si ouverte).
function relax(pts, iters, lambda = 0.5, closed = false) {
  let P = pts.map((p) => p.slice());
  const n = P.length;
  for (let it = 0; it < iters; it++) {
    const Q = P.map((p) => p.slice());
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
      Q[i] = add(P[i], mul(sub(mul(add(a, b), 0.5), P[i]), lambda));
    }
    P = Q;
  }
  return P;
}

// ---------- Coupes ----------
// Points d'intersection des triangles de la surface avec le plan (o, n), à moins de `rad` de o.
function planeSection(S, o, n, rad, triKeep = null) {
  const { I } = S;
  const out = [];
  for (const t of S.tris) {
    if (triKeep && !triKeep(t)) continue;
    const V = [0, 1, 2].map((k) => S.v(I[t * 3 + k]));
    const d = V.map((p) => dot(sub(p, o), n));
    for (let k = 0; k < 3; k++) {
      const a = d[k], b = d[(k + 1) % 3];
      if ((a > 0) === (b > 0) || a === b) continue;
      const p = add(V[k], mul(sub(V[(k + 1) % 3], V[k]), a / (a - b)));
      if (len(sub(p, o)) < rad) out.push(p);
    }
  }
  return out;
}
// Enveloppe convexe 2D (chaîne monotone d'Andrew), sens trigonométrique.
function hull2(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of P) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ---------- Construction ----------
// P, N, I : maillage complet calé et redressé ; lod0 : indices du niveau de détail proche (mêmes sommets) ;
// joints / weights : poids de peau du maillage complet (4 par sommet) ; bones : [{ name, pos }] (squelette du modèle) ;
// ears : { 1: { tip, base }, -1: { tip, base } } (skeleton-fit).
export function buildBridle({ P, N, I, lod0, joints, weights, bones, ears }) {
  const bp = Object.fromEntries(bones.map((b) => [b.name, b.pos]));
  // Tête et encolure (rênes) : triangles en avant du garrot, au-dessus de 1,05 m.
  const keepFor = (Ix) => (t) => {
    for (let k = 0; k < 3; k++) {
      const v = Ix[t * 3 + k];
      if (P[v * 3 + 2] < 0.3 || P[v * 3 + 1] < 1.05) return false;
    }
    return true;
  };
  const S = new Surface(P, N, I, keepFor(I));
  const S0 = new Surface(P, N, lod0, keepFor(lod0));
  const headOnly = new Surface(P, N, I, (t) => {
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k];
      if (P[v * 3 + 2] < 1.0 || P[v * 3 + 1] < 1.15) return false;
    }
    return true;
  });
  const X = [1, 0, 0];
  const wOf = (v, name) => {
    let w = 0;
    for (let c = 0; c < 4; c++) if (joints[v * 4 + c] === BONE_INDEX[name]) w += weights[v * 4 + c];
    return w;
  };
  // Triangles des oreilles (un sommet lié à plus de 20 % à un os d'oreille) : hors des enveloppes des lanières.
  const notEar = (t) => {
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k];
      if (wOf(v, 'earL') + wOf(v, 'earR') > 0.2) return false;
    }
    return true;
  };
  // Poids de peau au point le plus proche (interpolés sur le triangle).
  const skinAt = (hit) => {
    const o = {};
    hit.bary.forEach((b, k) => {
      const v = I[hit.t * 3 + k];
      for (let c = 0; c < 4; c++) {
        const w = weights[v * 4 + c] * b;
        if (w <= 0) continue;
        const name = bones[joints[v * 4 + c]].name;
        o[name] = (o[name] || 0) + w;
      }
    });
    return o;
  };
  const lateral = (s, y, z, from = 0.4) => headOnly.ray([from * s, y, z], [-s, 0, 0], from + 0.05);

  // ======================= REPÈRES =======================
  const L = { oreilles: {}, yeux: {}, commissures: {}, cretesFaciales: {} };
  // Oreilles : racine = sommets liés surtout à l'os de l'oreille, dans les 1,5 cm du bas de cette zone.
  const nv = P.length / 3;
  for (const s of [1, -1]) {
    const bone = s > 0 ? 'earL' : 'earR';
    const tip = ears[s].tip, base = ears[s].base, axis = norm(sub(tip, base));
    const E = [];
    for (let v = 0; v < nv; v++) if (P[v * 3 + 2] > 1.05 && P[v * 3 + 1] > 1.7 && wOf(v, bone) >= 0.5) E.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
    const h = E.map((p) => dot(sub(p, base), axis));
    const h0 = Math.min(...h);
    const root = E.filter((p, i) => h[i] < h0 + 0.015);
    const back = root.reduce((a, b) => (b[2] < a[2] ? b : a)), front = root.reduce((a, b) => (b[2] > a[2] ? b : a));
    L.oreilles[s] = { pointe: tip, base, arriere: back, avant: front, sommets: E.length };
  }
  // Peau entraînée par les oreilles (poids d'un os d'oreille > 1 %, au-dessus de 1,75 m) : bord arrière et bas.
  {
    let zMin = Infinity, yMin = Infinity;
    for (let v = 0; v < nv; v++) {
      if (P[v * 3 + 1] < 1.75 || P[v * 3 + 2] < 1.05) continue;
      if (wOf(v, 'earL') + wOf(v, 'earR') <= 0.01) continue;
      zMin = Math.min(zMin, P[v * 3 + 2]);
      yMin = Math.min(yMin, P[v * 3 + 1]);
    }
    L.zoneOreilles = { arriere: zMin, bas: yMin };
  }
  const earBackZ = (L.oreilles[1].arriere[2] + L.oreilles[-1].arriere[2]) / 2;
  // Nuque : dessus du crâne derrière les oreilles (rayon vertical, plan médian).
  const pollHit = headOnly.ray([0, 2.3, earBackZ - 0.018], [0, -1, 0], 1);
  L.nuque = pollHit.q;
  // Yeux : centre des paupières (skeleton-fit) posé sur la peau.
  for (const s of [1, -1]) {
    const lid = bp[s > 0 ? 'lidL' : 'lidR'];
    L.yeux[s] = lateral(s, lid[1], lid[2]).q;
  }
  for (const s of [1, -1]) L.commissures[s] = lateral(s, ...MOUTH_CORNER[s]).q;
  const mouthMid = mul(add(L.commissures[1], L.commissures[-1]), 0.5);
  // Repère de la tête : F de la nuque vers les commissures (plan médian), U vers le chanfrein, X latéral.
  const F = norm([0, mouthMid[1] - L.nuque[1], mouthMid[2] - L.nuque[2]]);
  const U = [0, F[2], -F[1]];
  const O = L.nuque;
  const fb = (p) => dot(sub(p, O), F), fc = (p) => dot(sub(p, O), U);
  const at = (x, b, c) => add(add(O, mul(F, b)), add(mul(U, c), mul(X, x)));
  // Plan médian : contour inférieur (le plus en arrière selon U) par tranches de 1 cm le long de F.
  const mid = planeSection(headOnly, [0, 1.6, 1.3], X, 0.6);
  const lowAt = (b) => {
    let best = null;
    for (const p of mid) if (Math.abs(fb(p) - b) < 0.005 && (!best || fc(p) < fc(best))) best = p;
    return best;
  };
  const bCorner = fb(mouthMid);
  // Barbe : creux du contour inférieur entre le menton et la ganache (U le plus grand), de 2 à 10 cm avant les
  // commissures le long de F (le menton est au-delà).
  {
    let best = null;
    for (let b = bCorner - 0.02; b <= bCorner + 0.06; b += 0.005) {
      const p = lowAt(b);
      if (p && (!best || fc(p) > fc(best))) best = p;
    }
    L.barbe = best;
  }
  // Gorge : point du contour inférieur le plus proche de la nuque entre ganache et encolure (creux de la gorge).
  {
    let best = null;
    for (const p of mid) {
      if (p[2] < 0.95 || p[2] > 1.3 || p[1] < 1.3 || p[1] > 1.7 || fc(p) > -0.12) continue;
      if (!best || len(sub(p, O)) < len(sub(best, O))) best = p;
    }
    L.gorge = best;
  }
  // Crêtes faciales : arête latérale sous l'œil. Tranches de 1 cm le long de F (coupe exacte du maillage), enveloppe
  // latérale x(c) par pas de 1 cm selon U ; arête = maximum local entre 7 cm derrière l'œil et son niveau, plus saillant
  // de 4 mm au moins que le creux derrière lui (vers la ganache) et que la pente devant lui (vers le chanfrein), sur 3 cm
  // de chaque côté. Extrémité = tranche la plus basse (jusqu'à 22 cm sous l'œil) où l'arête se mesure encore.
  for (const s of [1, -1]) {
    const eye = L.yeux[s], bE = fb(eye), cE = fc(eye);
    const prof = [];
    for (let b = bE + 0.05; b <= bE + 0.22; b += 0.01) {
      const sec = planeSection(headOnly, at(0, b, cE), F, 0.3).filter((p) => p[0] * s > 0);
      const env = [];
      for (let k = 0; k <= 16; k++) {
        const c = cE - 0.12 + k * 0.01;
        let best = null;
        for (const p of sec) if (Math.abs(fc(p) - c) < 0.005 && (!best || p[0] * s > best[0] * s)) best = p;
        env.push(best);
      }
      const x = (k) => (env[k] ? env[k][0] * s : NaN);
      let top = null;
      for (let k = 5; k <= 12; k++) {
        if (!(x(k) >= (x(k - 1) || -1) && x(k) >= (x(k + 1) || -1))) continue;
        const back = Math.min(...[1, 2, 3].map((d) => x(k - d)).filter((v) => v === v));
        const front = Math.min(...[1, 2, 3].map((d) => x(k + d)).filter((v) => v === v));
        const prom = Math.min(x(k) - back, x(k) - front);
        if (!top || prom > top.prom) top = { b, prom, p: env[k] };
      }
      if (top) prof.push(top);
    }
    const ridge = prof.filter((q) => q.prom >= 0.004);
    if (!ridge.length) throw new Error('Crête faciale introuvable : construction du filet arrêtée.');
    const end = ridge.reduce((a, q) => (q.b > a.b ? q : a));
    const peak = ridge.reduce((a, q) => (q.p[0] * s > a.p[0] * s ? q : a));
    L.cretesFaciales[s] = { saillie: peak.p, extremite: end.p, saillieMm: +(end.prom * 1000).toFixed(1) };
  }

  // ======================= GÉOMÉTRIE =======================
  const V = []; // { p, n, w }
  const meshes = { bridle: { leather: [], steel: [] }, reins: { rubber: [] } };
  const parts = {};
  let target = null, part = null;
  const use = (m, mat, name) => {
    target = meshes[m][mat];
    part = parts[name] || (parts[name] = { mesh: m, tris: 0, clear: { min: Infinity, minLod0: Infinity, maxFloat: 0 } });
  };
  const vert = (p, n, w) => {
    V.push({ p, n: norm(n), w });
    return V.length - 1;
  };
  const quad = (a, b, c, d) => {
    target.push(a, b, c, a, c, d);
    part.tris += 2;
  };
  const HEAD = { head: 1 };
  // Poids des lanières du filet : ceux de la peau sous elles (point le plus proche, interpolés), sans les os des
  // oreilles (une oreille qui bouge n'entraîne pas la têtière), renormalisés. Sur la face, peau à 100 % tête : filet à
  // 100 % tête ; à la nuque (tête 72 %, encolure haute 28 %) et sous la ganache, la lanière suit la peau au lieu de s'y
  // enfoncer quand la tête bouge sur l'encolure (jusqu'à 14 mm mesurés en saut avec des lanières à 100 % tête).
  const skinHead = (c) => {
    const w = skinAt(S.closest(c));
    delete w.earL;
    delete w.earR;
    const tot = Object.values(w).reduce((a, x) => a + x, 0);
    if (!(tot > 0)) return HEAD;
    for (const k in w) w[k] /= tot;
    return w;
  };
  // Distance signée la plus faible (maillage complet et LOD0).
  const sd = (p) => {
    const a = S.closest(p).s, b = S0.closest(p).s;
    return [a, b];
  };

  // Lanière le long d'une ligne médiane (bas de la lanière) : largeur w, épaisseur e, normales extérieures nrm ; les
  // sections trop près de la peau (bords compris, maillage complet et LOD0) sont soulevées, en douceur (PUSH_SLOPE).
  function strap(pts, nrm, w, e, wfn, opts = {}) {
    const n = pts.length, closed = !!opts.closed;
    const C = pts.map((p) => p.slice());
    const cum = arcLengths(C, closed);
    const frames = () =>
      C.map((c, i) => {
        const t = closed ? norm(sub(C[(i + 1) % n], C[(i - 1 + n) % n])) : norm(sub(C[Math.min(n - 1, i + 1)], C[Math.max(0, i - 1)]));
        const nn = norm(sub(nrm[i], mul(t, dot(nrm[i], t))));
        return { t, nn, b: cross(t, nn), ww: (typeof w === 'function' ? w(i / (n - 1)) : w) / 2 };
      });
    let Fr = frames();
    const minClear = opts.minClear ?? MIN_CLEAR;
    for (let it = 0; it < 6; it++) {
      const need = C.map((c, i) => {
        const { b, ww } = Fr[i];
        let m = Infinity;
        for (const q of [c, add(c, mul(b, ww)), add(c, mul(b, -ww))]) m = Math.min(m, ...sd(q));
        return Math.max(0, minClear - m);
      });
      if (need.every((x) => x === 0)) break;
      const push = need.map((_, i) => {
        let best = 0;
        for (let j = 0; j < n; j++) {
          let d = Math.abs(cum[i] - cum[j]);
          if (closed) d = Math.min(d, cum.total - d);
          best = Math.max(best, need[j] - PUSH_SLOPE * d);
        }
        return best;
      });
      for (let i = 0; i < n; i++) C[i] = add(C[i], mul(Fr[i].nn, push[i] + (push[i] > 0 ? 0.0003 : 0)));
      Fr = frames();
    }
    // Contrôle : distance du bas de la lanière à la peau (centre et bords).
    for (let i = 0; i < n; i++) {
      const { b, ww } = Fr[i];
      for (const q of [C[i], add(C[i], mul(b, ww)), add(C[i], mul(b, -ww))]) {
        const [a, a0] = sd(q);
        if (a < part.clear.min) part.clear.at = { t: +(i / (n - 1)).toFixed(3), p: q.map((x) => +x.toFixed(4)) };
        part.clear.min = Math.min(part.clear.min, a);
        part.clear.minLod0 = Math.min(part.clear.minLod0, a0);
      }
      if (!opts.loose?.(i / (n - 1))) {
        const f = S.closest(C[i]).s;
        if (f > part.clear.maxFloat) {
          part.clear.maxFloat = f;
          part.clear.floatAt = { t: +(i / (n - 1)).toFixed(3), p: C[i].map((x) => +x.toFixed(4)) };
        }
      }
    }
    const R = C.map((c, i) => {
      const { nn, b, ww } = Fr[i];
      const wt = wfn(c, i / (n - 1));
      return [
        vert(add(add(c, mul(b, ww)), mul(nn, e)), add(nn, mul(b, 0.5)), wt),
        vert(add(add(c, mul(b, -ww)), mul(nn, e)), add(nn, mul(b, -0.5)), wt),
        vert(add(c, mul(b, -ww)), add(mul(nn, -0.4), mul(b, -1)), wt),
        vert(add(c, mul(b, ww)), add(mul(nn, -0.4), b), wt),
      ];
    });
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const [TL, TR, BR, BL] = R[i], [TL1, TR1, BR1, BL1] = R[(i + 1) % n];
      quad(TL, TL1, TR1, TR);
      quad(BL, BL1, TL1, TL);
      quad(BR, TR, TR1, BR1);
      if (opts.free) quad(BL, BR, BR1, BL1);
    }
    // Bouts : faces de fin (lanière coupée net, pas de trou visible).
    if (!closed) for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
      const [TL, TR, BR, BL] = R[i];
      const tn = mul(Fr[i].t, sg);
      const ids = [TL, TR, BR, BL].map((k) => vert(V[k].p, tn, V[k].w));
      if (sg > 0) quad(ids[0], ids[3], ids[2], ids[1]);
      else quad(ids[0], ids[1], ids[2], ids[3]);
    }
    return { C, Fr };
  }

  // Ligne posée sur la peau : points de passage → courbe → projection à `gap` → lissage → normales de la peau.
  function onSkin(ctrl, gap, { closed = false, step = 0.012, iters = 3 } = {}) {
    let pts = smoothCurve(ctrl, closed, step);
    for (let k = 0; k < 2; k++) {
      pts = pts.map((p) => {
        const h = S.closest(p);
        return add(h.q, mul(h.n, gap));
      });
      pts = relax(pts, iters, 0.5, closed);
    }
    const nrm = smoothNormals(pts.map((p) => S.closest(p).n), closed);
    return { pts, nrm };
  }
  function smoothNormals(Ns, closed, k = 2) {
    const n = Ns.length;
    return Ns.map((_, i) => {
      let a = [0, 0, 0];
      for (let d = -k; d <= k; d++) {
        const j = closed ? (i + d + n) % n : clamp(i + d, 0, n - 1);
        a = add(a, Ns[j]);
      }
      return norm(a);
    });
  }

  // Arc d'enveloppe convexe : coupe de la tête par le plan passant par A, B et `via`, enveloppe convexe des points de la
  // coupe retenus par keep (et de A, B), arc de A à B du côté de `via`, rééchantillonné et écarté de `gap` vers
  // l'extérieur. Une lanière tendue passe ainsi par-dessus les creux et les mèches (crinière, toupet) sans les suivre.
  // hug (0 à 1) : part de l'écart à la peau rattrapée (la lanière se rapproche des creux sans en suivre les bosses).
  function hullArc(A, B, via, gap, keep, step = 0.01, hug = 0) {
    const n = norm(cross(sub(B, A), sub(via, A)));
    const e1 = norm(sub(B, A)), e2 = cross(n, e1);
    const to2 = (p) => [dot(sub(p, A), e1), dot(sub(p, A), e2)];
    const from2 = ([u, v]) => add(A, add(mul(e1, u), mul(e2, v)));
    const sec = planeSection(headOnly, A, n, 0.3, notEar).filter(keep);
    const H = hull2([...sec.map(to2), to2(A), to2(B)]);
    const near = (q) => H.reduce((bi, h, i) => (Math.hypot(h[0] - q[0], h[1] - q[1]) < Math.hypot(H[bi][0] - q[0], H[bi][1] - q[1]) ? i : bi), 0);
    const ia = near(to2(A)), ib = near(to2(B)), nH = H.length;
    const walk = (dir) => {
      const o = [];
      for (let i = ia; ; i = (i + dir + nH) % nH) {
        o.push(H[i]);
        if (i === ib) break;
      }
      return o;
    };
    const v2 = to2(via);
    const dist = (arc) => Math.min(...arc.map((h) => Math.hypot(h[0] - v2[0], h[1] - v2[1])));
    const a1 = walk(1), a2 = walk(-1);
    const arc = dist(a1) < dist(a2) ? a1 : a2;
    const cen = mul(H.reduce((a, h) => [a[0] + h[0], a[1] + h[1]], [0, 0]), 1 / nH);
    // Sommets de l'enveloppe adoucis (lissage laplacien ; la vérification des lanières rétablit l'écart à la peau).
    const pts3 = relax(resample(arc.map(from2), step), 6, 0.5);
    // Normales extérieures dans le plan (rayon depuis le centre de l'enveloppe, lissées).
    const nrm = smoothNormals(pts3.map((p) => {
      const q = to2(p);
      return norm(add(mul(e1, q[0] - cen[0]), mul(e2, q[1] - cen[1])));
    }), false, 2);
    let pts = pts3.map((p, i) => add(p, mul(nrm[i], gap)));
    if (hug > 0) {
      pts = pts.map((p, i) => {
        if (i === 0 || i === pts.length - 1) return p;
        const h = S.closest(p);
        return h.s > gap ? add(p, mul(h.n, -(h.s - gap) * hug)) : p;
      });
      pts = relax(pts, 3, 0.5);
    }
    return { pts, nrm, plane: { n, A } };
  }

  // ---------- Mors ----------
  use('bridle', 'steel', 'mors');
  const RING_R = 0.03, RING_r = 0.0045;
  const ring = {};
  for (const s of [1, -1]) {
    const c0 = L.commissures[s];
    const h = S.closest(c0);
    let nn = norm(add(h.n, [0.6 * s, 0, 0]));
    // Plan de l'anneau : tangent à la joue ; haut de l'anneau vers le montant (vers l'œil), arrière vers la main.
    const up0 = norm(sub(L.yeux[s], c0));
    let up = norm(sub(up0, mul(nn, dot(up0, nn))));
    let c = add(c0, mul(nn, RING_r + 0.002));
    // Anneau entier hors de la peau : centre écarté le long de la normale si besoin.
    const pts = () => Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2, v = cross(nn, up);
      return add(c, add(mul(up, Math.cos(a) * RING_R), mul(v, Math.sin(a) * RING_R)));
    });
    for (let it = 0; it < 8; it++) {
      const m = Math.min(...pts().map((q) => Math.min(...sd(q)))) - RING_r;
      if (m >= MIN_CLEAR) break;
      c = add(c, mul(nn, MIN_CLEAR - m + 0.0005));
    }
    ring[s] = { c, nn, up, back: norm(cross(up, nn)) };
    ringGeom(c, nn, RING_R, RING_r, HEAD);
    const m = Math.min(...pts().map((q) => Math.min(...sd(q)))) - RING_r;
    part.clear.min = Math.min(part.clear.min, m);
    part.clear.minLod0 = Math.min(part.clear.minLod0, m);
  }
  // Canon brisé : deux canons de 6 mm de rayon, articulation au milieu (dans la bouche).
  {
    const a = ring[1].c, b = ring[-1].c, m = add(mul(add(a, b), 0.5), mul(F, 0.008));
    tubeGeom([add(a, mul(X, -0.004)), mul(add(a, m), 0.5), m, mul(add(m, b), 0.5), add(b, mul(X, 0.004))], 0.006, HEAD);
  }
  function ringGeom(c, axis, R, r, wt, seg = 16, sides = 6) {
    const a = norm(axis);
    const u = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(a, u);
    const base = V.length;
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const d = add(mul(u, Math.cos(th)), mul(v, Math.sin(th)));
      const cc = add(c, mul(d, R));
      for (let j = 0; j < sides; j++) {
        const ph = (j / sides) * Math.PI * 2;
        const nn = add(mul(d, Math.cos(ph)), mul(a, Math.sin(ph)));
        vert(add(cc, mul(nn, r)), nn, wt);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
      const i1 = (i + 1) % seg, j1 = (j + 1) % sides;
      quad(base + i * sides + j, base + i1 * sides + j, base + i1 * sides + j1, base + i * sides + j1);
    }
  }
  function tubeGeom(pts, r, wt, sides = 8) {
    const n = pts.length, base = V.length;
    for (let i = 0; i < n; i++) {
      const t = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      const u = norm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(t, u);
      for (let j = 0; j < sides; j++) {
        const ph = (j / sides) * Math.PI * 2;
        vert(add(pts[i], mul(add(mul(u, Math.cos(ph)), mul(v, Math.sin(ph))), r)), add(mul(u, Math.cos(ph)), mul(v, Math.sin(ph))), wt);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      quad(base + i * sides + j, base + i * sides + j1, base + (i + 1) * sides + j1, base + (i + 1) * sides + j);
    }
  }

  // ---------- Têtière et montants ----------
  const HP_W = 0.018, HP_E = 0.004;
  use('bridle', 'leather', 'tetiereMontants');
  const eyeB = (s) => fb(L.yeux[s]), eyeC = (s) => fc(L.yeux[s]);
  // Point latéral du côté s à (b, c) dans le repère de la tête.
  const sidePt = (s, b, c) => {
    const p = at(0, b, c);
    return lateral(s, p[1], p[2]).q;
  };
  // Passage derrière les oreilles : plan vertical (normale z) 1,4 cm derrière la peau que les oreilles entraînent
  // (sommets liés à plus de 1 % à un os d'oreille), têtière centrée dessus ; jonction avec les montants à 1 cm sous le
  // bas de cette zone.
  const zEar = L.zoneOreilles.arriere - HP_W / 2 - 0.005;
  const yJ = L.zoneOreilles.bas - 0.01;
  // Profondeur (z) du passage des montants derrière les yeux, pour la pente des montants.
  const zBehindEye = (L.yeux[1][2] + L.yeux[-1][2]) / 2 - 0.056 / U[2];
  const behindEar = (s) => lateral(s, yJ, zEar).q;
  const eL = behindEar(1), eR = behindEar(-1);
  const cheek = (s) => {
    const r = ring[s], top = add(r.c, mul(r.up, RING_R));
    const bT = fb(top), cT = fc(top);
    const e = s > 0 ? eL : eR;
    return [
      add(top, mul(r.up, -0.004)),
      sidePt(s, lerp(bT, eyeB(s), 0.33), lerp(cT, eyeC(s) - 0.05, 0.4)),
      sidePt(s, lerp(bT, eyeB(s), 0.7), eyeC(s) - 0.052),
      sidePt(s, eyeB(s), eyeC(s) - 0.056),
      sidePt(s, lerp(eyeB(s), fb(e), 0.5), lerp(eyeC(s) - 0.056, fc(e), 0.55)),
      e,
    ];
  };
  // Dessus de la nuque : arc d'enveloppe convexe de la coupe par ce plan, incliné vers l'arrière en haut de la moitié
  // de la pente des montants (pas de cassure à la jonction), d'une jonction à l'autre (sans les oreilles).
  const tilt = (0.5 * (zEar - zBehindEye)) / (yJ - L.yeux[1][1]);
  const top = hullArc(eL, eR, [0, yJ + 0.1, zEar + 0.1 * tilt], GAP, (p) => p[0] < eL[0] + 0.002 && p[0] > eR[0] - 0.002 && p[1] > yJ - 0.02);
  const cL = onSkin(cheek(1), GAP), cR = onSkin(cheek(-1), GAP);
  // Montants (de l'anneau vers l'oreille) + arc de la nuque + montant droit (de l'oreille vers l'anneau).
  const headpiece = { pts: [...cL.pts.slice(0, -1), ...top.pts, ...cR.pts.slice(0, -1).reverse()], nrm: [...cL.nrm.slice(0, -1), ...top.nrm, ...cR.nrm.slice(0, -1).reverse()] };
  {
    // Raccords lissés (les bouts restent sur les anneaux).
    const n = headpiece.pts.length;
    const sm = relax(headpiece.pts, 2, 0.5);
    headpiece.pts = headpiece.pts.map((p, i) => (i < 2 || i > n - 3 ? p : sm[i]));
    headpiece.nrm = smoothNormals(headpiece.nrm, false, 2);
  }
  // Le montant ne touche pas l'anneau sous la peau : premiers et derniers points sur le haut des anneaux.
  headpiece.pts[0] = add(ring[1].c, mul(ring[1].up, RING_R + RING_r * 0.3));
  headpiece.pts[headpiece.pts.length - 1] = add(ring[-1].c, mul(ring[-1].up, RING_R + RING_r * 0.3));
  headpiece.nrm[0] = ring[1].nn;
  headpiece.nrm[headpiece.nrm.length - 1] = ring[-1].nn;

  // ---------- Muserolle (caveçon) ----------
  const crestEndB = (fb(L.cretesFaciales[1].extremite) + fb(L.cretesFaciales[-1].extremite)) / 2;
  const bNose = crestEndB + NOSE_BELOW;
  let nose;
  {
    const o = at(0, bNose, fc(L.barbe) * 0.5);
    const sec = planeSection(headOnly, o, F, 0.2);
    const h2 = hull2(sec.map((p) => [p[0], fc(p)]));
    const poly = h2.map(([x, c]) => at(x, bNose, c));
    const ring2 = resample(poly, 0.004, true);
    // Normales dans le plan, vers l'extérieur de l'enveloppe ; points écartés de GAP.
    const cen = mul(ring2.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / ring2.length);
    let pts = ring2.map((p) => {
      const r = sub(p, cen);
      return add(p, mul(norm(sub(r, mul(F, dot(r, F)))), GAP));
    });
    pts = resample(relax(pts, 2, 0.5, true), 0.012, true);
    const nrm = pts.map((p) => {
      const r = sub(p, cen);
      return norm(sub(r, mul(F, dot(r, F))));
    });
    nose = { pts, nrm: smoothNormals(nrm, true), cen };
  }
  use('bridle', 'leather', 'muserolle');
  const NOSE_W = 0.024, NOSE_E = 0.005;
  const noseOut = strap(nose.pts, nose.nrm, NOSE_W, NOSE_E, skinHead, { closed: true, minClear: 0.003 });

  // Têtière de la muserolle : du côté de la muserolle (2,5 cm derrière le montant) le long de la joue, glissée sous la
  // têtière du filet sous l'oreille.
  use('bridle', 'leather', 'teteMuserolle');
  for (const s of [1, -1]) {
    // Point de la muserolle du côté s, au niveau du montant.
    const onCheek = headpiece.pts.filter((p) => p[0] * s > 0.02);
    const cross0 = onCheek.reduce((a, p) => (Math.abs(fb(p) - bNose) < Math.abs(fb(a) - bNose) ? p : a));
    const cS = fc(cross0) - 0.028;
    const e = s > 0 ? eL : eR;
    const start = noseOut.C.filter((p) => p[0] * s > 0.02).reduce((a, p) => (Math.abs(fc(p) - cS) < Math.abs(fc(a) - cS) ? p : a));
    const ctrl = [
      start,
      sidePt(s, lerp(bNose, eyeB(s), 0.5), lerp(cS, eyeC(s) - 0.082, 0.5)),
      sidePt(s, eyeB(s), eyeC(s) - 0.082),
      sidePt(s, lerp(eyeB(s), fb(e), 0.55), lerp(eyeC(s) - 0.082, fc(e) - 0.012, 0.6)),
      lateral(s, e[1] - 0.012, e[2] - 0.004).q,
    ];
    const sl = onSkin(ctrl, 0.0015);
    strap(sl.pts, sl.nrm, 0.013, 0.003, skinHead, {});
  }

  // Montants soulevés au croisement de la muserolle (ils passent par-dessus).
  {
    const nC = noseOut.C;
    headpiece.pts = headpiece.pts.map((p, i) => {
      if (i === 0 || i === headpiece.pts.length - 1) return p;
      let d = Infinity;
      for (const q of nC) d = Math.min(d, len(sub(p, q)));
      const k = 1 - smooth(NOSE_W / 2 + 0.004, NOSE_W / 2 + 0.03, d);
      return add(p, mul(headpiece.nrm[i], k * (NOSE_E + 0.0015)));
    });
  }
  use('bridle', 'leather', 'tetiereMontants');
  // Bouts accrochés au haut des anneaux du mors (écartés des lèvres) : hors du relevé de décollement.
  const hpOut = strap(headpiece.pts, headpiece.nrm, HP_W, HP_E, skinHead, { loose: (t) => t < 0.03 || t > 0.97 });

  // ---------- Frontal ----------
  use('bridle', 'leather', 'frontal');
  {
    // Jonctions : sur la têtière, à 2 cm sous le bas de la peau entraînée par les oreilles (côté avant de la têtière).
    const yB = L.zoneOreilles.bas - 0.02;
    const junc = (s) => {
      const k = hpOut.C.map((p, i) => [p, i]).filter(([p]) => p[0] * s > 0.03).reduce((a, q) => (Math.abs(q[0][1] - yB) < Math.abs(a[0][1] - yB) ? q : a));
      const [p, i] = k;
      const fr = hpOut.Fr[i];
      // Bord avant de la têtière (côté chanfrein), sur sa face extérieure.
      const towardFront = dot(fr.b, U) > 0 ? fr.b : mul(fr.b, -1);
      return { p: add(add(p, mul(towardFront, -HP_W * 0.25)), mul(fr.nn, HP_E + 0.001)), n: fr.nn };
    };
    const jL = junc(1), jR = junc(-1);
    // Milieu : sur le chanfrein, 2,5 cm sous le bas de la peau entraînée par les oreilles ; arc d'enveloppe convexe
    // (par-dessus le toupet et les creux) entre les deux jonctions.
    const front = headOnly.ray([0, yB - 0.005, 1.8], [0, 0, -1], 0.6).q;
    const fr = hullArc(jL.p, jR.p, front, GAP, (p) => p[0] < jL.p[0] && p[0] > jR.p[0] && fc(p) > Math.min(fc(jL.p), fc(jR.p)) - 0.01, 0.01, 0.6);
    // Bouts posés sur la têtière (la boucle du frontal l'entoure).
    const n = fr.pts.length;
    fr.pts[0] = jL.p;
    fr.nrm[0] = jL.n;
    fr.pts[n - 1] = jR.p;
    fr.nrm[n - 1] = jR.n;
    strap(fr.pts, fr.nrm, 0.016, 0.004, skinHead, {});
  }

  // ---------- Sous-gorge ----------
  use('bridle', 'leather', 'sousGorge');
  {
    // Départ sur la têtière (6 cm sous le bas de la peau entraînée par les oreilles), descente le long du bord arrière de
    // la ganache,
    // boucle lâche sous la gorge (2,5 cm sous la peau).
    const yS = L.zoneOreilles.bas - 0.06;
    const start = (s) => {
      const [p, i] = hpOut.C.map((q, k) => [q, k]).filter(([q]) => q[0] * s > 0.03).reduce((a, q) => (Math.abs(q[0][1] - yS) < Math.abs(a[0][1] - yS) ? q : a));
      return add(p, mul(hpOut.Fr[i].nn, HP_E + 0.0008));
    };
    const g = L.gorge;
    const sideT = (s, k) => {
      const p0 = start(s);
      const p = lerp3(p0, add(g, [0.05 * s, -0.02, 0.02]), k);
      const h = S.closest(p);
      return add(h.q, mul(h.n, 0.004 + 0.02 * k * k));
    };
    const bottom = add(g, add(mul(U, -0.022), [0, -0.004, 0]));
    const ctrl = [start(1), sideT(1, 0.35), sideT(1, 0.7), add(bottom, [0.035, 0.004, 0]), bottom, add(bottom, [-0.035, 0.004, 0]), sideT(-1, 0.7), sideT(-1, 0.35), start(-1)];
    const pts = smoothCurve(ctrl, false, 0.012);
    const nrm = smoothNormals(pts.map((p) => S.closest(p).n), false, 3);
    strap(pts, nrm, 0.013, 0.003, skinHead, { free: true, minClear: 0.003, loose: (t) => t > 0.2 && t < 0.8 });
  }

  // ---------- Rênes ----------
  use('reins', 'rubber', 'renes');
  const reinInfo = {};
  for (const s of [1, -1]) {
    const hb = s > 0 ? 'reinL' : 'reinR';
    const hand = bp[hb];
    const r = ring[s];
    // Attache : arrière-bas de l'anneau.
    const dir = norm(sub(hand, r.c));
    let a = norm(sub(dir, mul(r.nn, dot(dir, r.nn))));
    const A = add(r.c, mul(a, RING_R + RING_r * 0.4));
    // Fil tendu de l'anneau à la main, écarté de la peau (3 mm au moins pour le bas de la lanière).
    const CL = 0.003;
    const push = (p) => {
      const h = S.closest(p);
      let q = h.s < CL ? add(h.q, mul(h.n, CL)) : p;
      const g0 = S0.closest(q);
      if (g0.s < CL) q = add(g0.q, mul(g0.n, CL));
      return q;
    };
    // Départ arqué vers l'extérieur (hors de l'encolure), puis tension et écartement de la peau, du grossier au fin.
    let pts = Array.from({ length: 12 }, (_, k) => {
      const t = k / 11;
      return add(lerp3(A, hand, t), [s * 0.14 * Math.sin(Math.PI * t), 0.03 * Math.sin(Math.PI * t), 0]);
    });
    for (const nPts of [12, 24, 48]) {
      const total = arcLengths(pts).pop();
      pts = resample(pts, total / (nPts - 1));
      for (let it = 0; it < 120; it++) {
        pts = relax(pts, 1, 0.5);
        pts = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : push(p)));
      }
    }
    pts = resample(pts, 0.016);
    // Normales : celles de la peau là où la rêne s'y appuie, à plat (vers le haut, un peu vers l'extérieur) ailleurs.
    const hits = pts.map((p) => S.closest(p));
    const contact = hits.map((h) => h.s < 0.015);
    const flat = norm([s * 0.3, 1, 0]);
    let nrm = hits.map((h, i) => {
      const k = 1 - smooth(0.006, 0.015, h.s);
      return norm(add(mul(h.n, k), mul(flat, 1 - k)));
    });
    nrm = smoothNormals(nrm, false, 3);
    // Poids : tête près du mors, peau aux appuis sur l'encolure (hors tête), os de la main au bout ; fondu linéaire
    // (abscisse curviligne) entre ces ancres.
    const cum = arcLengths(pts), Ltot = cum[cum.length - 1];
    const anchors = [];
    pts.forEach((p, i) => {
      if (cum[i] < 0.05) anchors.push([cum[i], HEAD]);
      else if (contact[i] && cum[i] < Ltot - 0.12) {
        const w = skinAt(hits[i]);
        if (!(w.head > 0.5)) anchors.push([cum[i], w]);
      }
    });
    anchors.push([Ltot, { [hb]: 1 }]);
    const wAt = (sArc) => {
      let i = 0;
      while (i < anchors.length - 1 && anchors[i + 1][0] < sArc) i++;
      const [s0, w0] = anchors[i], [s1, w1] = anchors[Math.min(i + 1, anchors.length - 1)];
      const f = s1 > s0 ? clamp((sArc - s0) / (s1 - s0), 0, 1) : 0;
      const o = {};
      for (const [k, v] of Object.entries(w0)) o[k] = (o[k] || 0) + v * (1 - f);
      for (const [k, v] of Object.entries(w1)) o[k] = (o[k] || 0) + v * f;
      return o;
    };
    strap(pts, nrm, 0.017, 0.005, (c, t) => wAt(t * Ltot), { free: true, minClear: 0.0025, loose: () => true });
    reinInfo[s] = { longueur: +Ltot.toFixed(3), appuis: contact.filter(Boolean).length, echantillons: pts.length, attache: A.map((x) => +x.toFixed(4)), main: hand };
  }

  // ---------- Empaquetage ----------
  // Une primitive par matériau (sommets propres, renumérotés) dans chaque maillage (filet, rênes) ; 4 influences au
  // plus, normalisées.
  const packPrim = (idx) => {
    const remap = new Map(), used = [];
    for (const i of idx) if (!remap.has(i)) {
      remap.set(i, used.length);
      used.push(i);
    }
    const n = used.length;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), jo = new Uint8Array(n * 4), we = new Float32Array(n * 4);
    used.forEach((vi, k) => {
      const v = V[vi];
      pos.set(v.p, k * 3);
      nor.set(v.n, k * 3);
      const top = Object.entries(v.w).filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = top.reduce((a, e) => a + e[1], 0) || 1;
      top.forEach(([b, w], c) => {
        if (BONE_INDEX[b] === undefined) throw new Error(`os inconnu ${b}`);
        jo[k * 4 + c] = BONE_INDEX[b];
        we[k * 4 + c] = w / tot;
      });
    });
    return { pos, nor, joints: jo, weights: we, indices: Uint32Array.from(idx, (i) => remap.get(i)), verts: n, tris: idx.length / 3 };
  };
  const pack = (m) => {
    const prims = Object.fromEntries(Object.entries(meshes[m]).map(([mat, idx]) => [mat, packPrim(idx)]));
    return { prims, tris: Object.values(prims).reduce((a, x) => a + x.tris, 0), verts: Object.values(prims).reduce((a, x) => a + x.verts, 0) };
  };
  const out = { bridle: pack('bridle'), reins: pack('reins') };
  const r4 = (p) => p && p.map((x) => +x.toFixed(4));
  const report = {
    reperes: {
      nuque: r4(L.nuque),
      oreilles: Object.fromEntries(Object.entries(L.oreilles).map(([s, o]) => [s > 0 ? 'gauche' : 'droite', { base: r4(o.base), racineArriere: r4(o.arriere), racineAvant: r4(o.avant), sommets: o.sommets }])),
      yeux: { gauche: r4(L.yeux[1]), droit: r4(L.yeux[-1]) },
      cretesFaciales: { gauche: { saillie: r4(L.cretesFaciales[1].saillie), extremite: r4(L.cretesFaciales[1].extremite) }, droite: { saillie: r4(L.cretesFaciales[-1].saillie), extremite: r4(L.cretesFaciales[-1].extremite) } },
      commissures: { gauche: r4(L.commissures[1]), droite: r4(L.commissures[-1]) },
      peauDesOreilles: { arriereZ: +L.zoneOreilles.arriere.toFixed(4), basY: +L.zoneOreilles.bas.toFixed(4) },
      barbe: r4(L.barbe),
      gorge: r4(L.gorge),
      repereTete: { origine: r4(O), F: r4(F), U: r4(U) },
    },
    mors: { anneaux: { gauche: r4(ring[1].c), droit: r4(ring[-1].c) }, rayon: RING_R, fil: RING_r, ecartCommissures: +len(sub(L.commissures[1], L.commissures[-1])).toFixed(4) },
    muserolle: { sousCretes: NOSE_BELOW, perimetre: +arcLengths(noseOut.C, true).total.toFixed(3) },
    pieces: Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, { maillage: p.mesh, triangles: p.tris, ecartMinMm: +(p.clear.min * 1000).toFixed(1), ecartMinLod0Mm: +(p.clear.minLod0 * 1000).toFixed(1), decollementMaxMm: +(p.clear.maxFloat * 1000).toFixed(1), ouEcartMin: p.clear.at, ouDecollementMax: p.clear.floatAt }])),
    renes: { gauche: reinInfo[1], droite: reinInfo[-1] },
    triangles: { filet: out.bridle.tris, renes: out.reins.tris, total: out.bridle.tris + out.reins.tris },
  };
  return { ...out, report };
}

function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
