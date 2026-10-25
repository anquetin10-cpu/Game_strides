// Champ de distance signée (approché) : primitives, mélange lisse, propriétaire (os) de chaque point.
// Toutes les primitives exposent d(x, y, z) et une boîte englobante ; les distances sont en mètres.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- Petits outils vectoriels ----------
export const v3 = (x, y, z) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => mul(a, 1 / (len(a) || 1));
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Repère orthonormé : w = axe principal, u ≈ direction « side » orthogonalisée, v = w × u.
export function frame(w, side = [1, 0, 0]) {
  w = norm(w);
  let u = sub(side, mul(w, dot(side, w)));
  if (len(u) < 1e-6) u = sub([0, 1, 0], mul(w, w[1]));
  u = norm(u);
  const v = cross(w, u);
  return { u, v, w };
}

// Rotation autour d'un axe (Rodrigues) appliquée à un vecteur.
export function rotAxis(vec, axis, ang) {
  const k = norm(axis);
  const c = Math.cos(ang), s = Math.sin(ang);
  const kv = cross(k, vec);
  const kd = dot(k, vec) * (1 - c);
  return [vec[0] * c + kv[0] * s + k[0] * kd, vec[1] * c + kv[1] * s + k[1] * kd, vec[2] * c + kv[2] * s + k[2] * kd];
}

// ---------- Courbes de profil (Catmull-Rom monotone échantillonnée) ----------
export function profile(keys, n = 256) {
  // keys : [[t, v], ...] triés ; renvoie f(t) par table.
  const t0 = keys[0][0], t1 = keys[keys.length - 1][0];
  const tab = new Float64Array(n + 1);
  const evalAt = (t) => {
    if (t <= t0) return keys[0][1];
    if (t >= t1) return keys[keys.length - 1][1];
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(keys.length - 1, i + 2)];
    const h = p2[0] - p1[0];
    const s = (t - p1[0]) / h;
    // Tangentes de Catmull-Rom non uniformes, limitées (pas de dépassement).
    const d1 = p2[1] - p1[1];
    let m1 = i > 0 ? ((p2[1] - p0[1]) / (p2[0] - p0[0])) * h : d1;
    let m2 = i + 2 < keys.length ? ((p3[1] - p1[1]) / (p3[0] - p1[0])) * h : d1;
    if (d1 === 0) m1 = m2 = 0;
    else {
      if (m1 / d1 < 0) m1 = 0;
      if (m2 / d1 < 0) m2 = 0;
      const a = m1 / d1, b = m2 / d1;
      if (a * a + b * b > 9) {
        const k = 3 / Math.hypot(a, b);
        m1 *= k;
        m2 *= k;
      }
    }
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p1[1] + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2[1] + (s3 - s2) * m2;
  };
  for (let i = 0; i <= n; i++) tab[i] = evalAt(t0 + ((t1 - t0) * i) / n);
  const sc = n / (t1 - t0);
  const f = (t) => {
    let x = (t - t0) * sc;
    if (x <= 0) return tab[0];
    if (x >= n) return tab[n];
    const i = x | 0;
    x -= i;
    return tab[i] + (tab[i + 1] - tab[i]) * x;
  };
  f.t0 = t0;
  f.t1 = t1;
  f.exact = evalAt;
  return f;
}

// ---------- Primitives ----------
// Ellipsoïde (borne de distance d'Inigo Quilez), repère optionnel (u, v, w) = axes des rayons r[0], r[1], r[2].
export function ellipsoid(c, r, fr = null) {
  const [rx, ry, rz] = r;
  const ax = fr ? fr.u : [1, 0, 0], ay = fr ? fr.v : [0, 1, 0], az = fr ? fr.w : [0, 0, 1];
  const ext = [0, 1, 2].map((i) => Math.sqrt((ax[i] * rx) ** 2 + (ay[i] * ry) ** 2 + (az[i] * rz) ** 2));
  return {
    bbox: [c[0] - ext[0], c[1] - ext[1], c[2] - ext[2], c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]],
    d(x, y, z) {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const lx = px * ax[0] + py * ax[1] + pz * ax[2];
      const ly = px * ay[0] + py * ay[1] + pz * ay[2];
      const lz = px * az[0] + py * az[1] + pz * az[2];
      const a = lx / rx, b = ly / ry, e = lz / rz;
      const k0 = Math.sqrt(a * a + b * b + e * e);
      const k1 = Math.sqrt((a / rx) ** 2 + (b / ry) ** 2 + (e / rz) ** 2);
      if (k1 < 1e-9) return -Math.min(rx, ry, rz);
      return (k0 * (k0 - 1)) / k1;
    },
  };
}

// Cône arrondi entre a (rayon ra) et b (rayon rb), section elliptique (échelles su selon « side », sv selon l'autre axe).
export function rcone(a, b, ra, rb, opt = {}) {
  const su = opt.su || 1, sv = opt.sv || 1;
  const L = len(sub(b, a));
  const fr = frame(sub(b, a), opt.side || [1, 0, 0]);
  const l2 = L * L;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const smin = Math.min(su, sv);
  const R = Math.max(ra, rb) * Math.max(su, sv);
  const lo = [0, 1, 2].map((i) => Math.min(a[i], b[i]) - R), hi = [0, 1, 2].map((i) => Math.max(a[i], b[i]) + R);
  const { u, v, w } = fr;
  return {
    bbox: [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]],
    frame: fr,
    d(x, y, z) {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const lu = (px * u[0] + py * u[1] + pz * u[2]) / su;
      const lv = (px * v[0] + py * v[1] + pz * v[2]) / sv;
      const lw = px * w[0] + py * w[1] + pz * w[2];
      // Repère local : axe le long de w, longueur L.
      const yy = lw * L;
      const zz = yy - l2;
      const x2 = (lu * lu + lv * lv) * l2 * l2;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      let d;
      if (Math.sign(zz) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - rb;
      else if (Math.sign(yy) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - ra;
      else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
      return d * smin;
    },
  };
}

// Section « surellipse » balayée le long d'un axe droit : profils fonctions de t (distance le long de l'axe).
// o : origine, dir : axe, up : direction du haut de la section (orthogonalisée), profils :
//   c(t) décalage du centre selon up, top(t), bot(t) demi-hauteurs, wid(t) demi-largeur, nt(t), nb(t) exposants.
//   lat(t) : décalage latéral (optionnel), sk(t) : inclinaison du haut (skew) selon la hauteur (optionnel).
export function loft(o, dir, up, P) {
  const fr = frame(dir, up); // w = axe, u = haut
  const W = fr.w, U = fr.u, X = fr.v; // X = w × u (latéral)
  const t0 = P.t0, t1 = P.t1;
  const ev = (t, out) => {
    const tc = t < t0 ? t0 : t > t1 ? t1 : t;
    out[0] = P.c ? P.c(tc) : 0;
    out[1] = P.top(tc);
    out[2] = P.bot(tc);
    out[3] = P.wid(tc);
    out[4] = P.nt ? P.nt(tc) : 2;
    out[5] = P.nb ? P.nb(tc) : 2;
    out[6] = P.wb ? P.wb(tc) : 0; // élargissement relatif vers le bas (forme en poire)
    out[7] = P.lat ? P.lat(tc) : 0; // décalage latéral du centre
  };
  const s0 = new Float64Array(8), s1 = new Float64Array(8), s2 = new Float64Array(8);
  // ρ (rayon normalisé de surellipse) pour une section s, coordonnées (lx, ly).
  const rho = (s, lx, ly) => {
    const yy = ly - s[0];
    const up = yy > 0;
    const ext = up ? s[1] : s[2];
    const vv = yy / ext;
    const wf = 1 + s[6] * clamp(-vv, -1, 1);
    const uu = (lx - s[7]) / (s[3] * wf);
    const n = up ? s[4] : s[5];
    const au = Math.abs(uu), av = Math.abs(vv);
    if (au < 1e-12 && av < 1e-12) return 0;
    return Math.pow(Math.pow(au, n) + Math.pow(av, n), 1 / n);
  };
  // Distance radiale signée au bord de la section (le long de la droite centre → point).
  const Fr = (s, lx, ly) => {
    const xx = lx - s[7], yy = ly - s[0];
    const r = Math.sqrt(xx * xx + yy * yy);
    const q = rho(s, lx, ly);
    if (q < 1e-9) return -Math.min(s[1], s[2], s[3]);
    return r * (1 - 1 / q);
  };
  // Boîte englobante : échantillonner les profils.
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i <= 64; i++) {
    const t = t0 + ((t1 - t0) * i) / 64;
    ev(t, s0);
    const wmax = s0[3] * (1 + Math.abs(s0[6]));
    for (const [a, b] of [[s0[7] + wmax, s0[0] + s0[1]], [s0[7] - wmax, s0[0] + s0[1]], [s0[7] + wmax, s0[0] - s0[2]], [s0[7] - wmax, s0[0] - s0[2]]]) {
      const p = [o[0] + W[0] * t + U[0] * b + X[0] * a, o[1] + W[1] * t + U[1] * b + X[1] * a, o[2] + W[2] * t + U[2] * b + X[2] * a];
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[k]);
        hi[k] = Math.max(hi[k], p[k]);
      }
    }
  }
  const h = 0.004;
  return {
    bbox: [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]],
    frame: fr,
    local(x, y, z) {
      const px = x - o[0], py = y - o[1], pz = z - o[2];
      return [px * W[0] + py * W[1] + pz * W[2], px * U[0] + py * U[1] + pz * U[2], px * X[0] + py * X[1] + pz * X[2]];
    },
    d(x, y, z) {
      const px = x - o[0], py = y - o[1], pz = z - o[2];
      const t = px * W[0] + py * W[1] + pz * W[2];
      const ly = px * U[0] + py * U[1] + pz * U[2];
      const lx = px * X[0] + py * X[1] + pz * X[2];
      ev(t, s0);
      // Distance radiale F = r (1 - 1/ρ) (exacte le long du rayon), normalisée par son gradient numérique :
      // précise près de la surface et sans « fantôme » loin des bouts effilés.
      const F0 = Fr(s0, lx, ly);
      const e = 0.002;
      const gx = (Fr(s0, lx + e, ly) - Fr(s0, lx - e, ly)) / (2 * e);
      const gy = (Fr(s0, lx, ly + e) - Fr(s0, lx, ly - e)) / (2 * e);
      // Dérivée selon l'axe : fenêtre glissante restant dans [t0, t1] (continue aux extrémités).
      const ta = Math.min(Math.max(t - h, t0), t1 - 2 * h);
      ev(ta + 2 * h, s1);
      ev(ta, s2);
      const gt = (Fr(s1, lx, ly) - Fr(s2, lx, ly)) / (2 * h);
      const g = Math.max(Math.sqrt(gx * gx + gy * gy + gt * gt), 0.35);
      let d = F0 / g;
      // Bouts : bouchons arrondis (intersection lisse avec les plans des extrémités).
      const kc = P.cap ?? 0.03;
      d = -smin(-d, t0 - t > t - t1 ? -(t0 - t) : -(t - t1), kc);
      return d;
    },
  };
}

// Sabot : cylindre elliptique cisaillé (paroi parallèle en pince et aux talons), coupé par le sol et la couronne.
// c : centre de la sole au sol, opt : { w, l, h (pince), hh (talons), slope (pente de la paroi en rad), taper }.
export function hoof(c, opt) {
  const w = opt.w, l = opt.l, h = opt.h, hh = opt.hh;
  const cot = 1 / Math.tan(opt.slope);
  const taper = opt.taper ?? 0.12;
  const R = Math.max(w, l) + 0.02;
  return {
    bbox: [c[0] - R, c[1] - 0.01, c[2] - R - h * cot, c[0] + R, c[1] + h + 0.02, c[2] + R],
    d(x, y, z) {
      const ly = y - c[1];
      const lyc = clamp(ly, 0, h);
      // Centre de la section : recule en montant (paroi inclinée).
      const cz = c[2] - lyc * cot * 0.75;
      const k = 1 - taper * (lyc / h);
      const ex = (x - c[0]) / (w * k);
      let ez = (z - cz) / (l * k);
      // Talons un peu plus larges et plats.
      if (ez < 0) ez *= 1.08;
      const r = Math.sqrt(ex * ex + ez * ez);
      const dsec = (r - 1) * Math.min(w, l) * k;
      // Couronne : plan incliné (haut en pince, bas aux talons).
      const zr = clamp((z - cz) / l, -1, 1);
      const top = lerp(hh, h, (zr + 1) / 2);
      const d = Math.max(dsec, -ly, ly - top);
      return d;
    },
  };
}

// ---------- Opérateurs ----------
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ---------- Scène : suite d'opérations (union, soustraction, intersection lisses) ----------
export class SDFScene {
  constructor() {
    this.ops = [];
  }
  // owner : nom d'os, ou fonction (x, y, z) → { os: poids }.
  add(prim, k = 0, owner = null, tag = '') {
    this._grown = false;
    this.ops.push({ type: 0, prim, k, owner, tag, bbox: grow(prim.bbox, k) });
    return this;
  }
  sub(prim, k = 0, tag = '') {
    this._grown = false;
    this.ops.push({ type: 1, prim, k, tag, bbox: grow(prim.bbox, k) });
    return this;
  }
  inter(prim, k = 0, tag = '') {
    this.ops.push({ type: 2, prim, k, tag, bbox: [-1e9, -1e9, -1e9, 1e9, 1e9, 1e9] });
    return this;
  }
  bbox() {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const o of this.ops) {
      if (o.type !== 0) continue;
      for (let i = 0; i < 3; i++) {
        b[i] = Math.min(b[i], o.prim.bbox[i]);
        b[i + 3] = Math.max(b[i + 3], o.prim.bbox[i + 3]);
      }
    }
    return b;
  }
  // Sous-liste des opérations utiles dans une boîte (marge m). Une primitive écartée ne doit pas modifier
  // les raccords lisses suivants : marge = son rayon de mélange + deux fois le plus grand rayon qui suit.
  cull(box, m = 0) {
    if (!this._grown) {
      let kmax = 0;
      for (let i = this.ops.length - 1; i >= 0; i--) {
        const o = this.ops[i];
        o.gbox = o.type === 2 ? o.bbox : grow(o.prim.bbox, o.k + 2 * kmax + 0.02);
        kmax = Math.max(kmax, o.k);
      }
      this._grown = true;
    }
    const r = [];
    for (const o of this.ops) {
      const b = o.gbox;
      if (b[0] - m > box[3] || b[3] + m < box[0] || b[1] - m > box[4] || b[4] + m < box[1] || b[2] - m > box[5] || b[5] + m < box[2]) {
        // Hors de la boîte : une union lointaine est sans effet, une intersection ou soustraction aussi.
        continue;
      }
      r.push(o);
    }
    return r;
  }
  dist(x, y, z, ops = this.ops) {
    let d = 1e3;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      const p = o.prim.d(x, y, z);
      if (o.type === 0) d = smin(d, p, o.k);
      else if (o.type === 1) d = -smin(-d, p, o.k);
      else d = -smin(-d, -p, o.k);
    }
    return d;
  }
  // Distance + poids par primitive (facteurs de mélange des unions lisses, largeur minimale 4 mm).
  own(x, y, z) {
    let d = 1e3;
    let w = new Map();
    for (const o of this.opsAt(x, y, z)) {
      const p = o.prim.d(x, y, z);
      if (o.type === 0) {
        const k = Math.max(o.k, 0.004);
        const h = clamp(0.5 + (0.5 * (d - p)) / k, 0, 1); // part de la nouvelle primitive
        if (h > 0) {
          const nw = new Map();
          for (const [key, val] of w) if (h < 1) nw.set(key, val * (1 - h));
          nw.set(o, (nw.get(o) || 0) + h);
          w = nw;
        }
        d = smin(d, p, o.k);
      } else if (o.type === 1) d = -smin(-d, p, o.k);
      else d = -smin(-d, -p, o.k);
    }
    return { d, w };
  }
  grad(x, y, z, e = 0.0007) {
    const ops = this.opsAt(x, y, z);
    const gx = this.dist(x + e, y, z, ops) - this.dist(x - e, y, z, ops);
    const gy = this.dist(x, y + e, z, ops) - this.dist(x, y - e, z, ops);
    const gz = this.dist(x, y, z + e, ops) - this.dist(x, y, z - e, ops);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  }
  // Liste élaguée pour la cellule de 4 cm contenant le point (mise en cache).
  opsAt(x, y, z) {
    const C = 0.04;
    const i = Math.floor(x / C), j = Math.floor(y / C), k = Math.floor(z / C);
    const key = i * 1e6 + j * 1e3 + k;
    this._cells ||= new Map();
    let ops = this._cells.get(key);
    if (!ops) {
      // Marge : la cellule plus 2 cm (gradients et petits décalages).
      ops = this.cull([i * C - 0.02, j * C - 0.02, k * C - 0.02, (i + 1) * C + 0.02, (j + 1) * C + 0.02, (k + 1) * C + 0.02], 0.005);
      this._cells.set(key, ops);
    }
    return ops;
  }
  fast(x, y, z) {
    return this.dist(x, y, z, this.opsAt(x, y, z));
  }
}

function grow(b, k) {
  const m = k + 0.01;
  return [b[0] - m, b[1] - m, b[2] - m, b[3] + m, b[4] + m, b[5] + m];
}
