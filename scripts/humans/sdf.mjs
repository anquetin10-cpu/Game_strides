// Champs de distance signée (SDF) : primitives anatomiques, opérateurs lisses et évaluateur avec élagage par boîtes.
// Les primitives sont décrites dans l'espace « repos » de leur os ; l'évaluateur travaille dans l'espace de liaison (pose A).
import * as THREE from 'three';
import { boneDefs, BIND_POSE, BONES } from '../../src/entities/human/skeleton.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);

// ---------- Squelette : transformations liaison ↔ repos ----------
export function skeletonXf(sex) {
  const defs = boneDefs(sex);
  const world = {};
  const rest = {};
  for (const d of defs) {
    const local = new THREE.Matrix4();
    const e = BIND_POSE[d.name] || [0, 0, 0];
    local.compose(new THREE.Vector3(...d.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2])), new THREE.Vector3(1, 1, 1));
    world[d.name] = d.parent ? world[d.parent].clone().multiply(local) : local;
    const rp = d.parent ? rest[d.parent] : [0, 0, 0];
    rest[d.name] = [rp[0] + d.pos[0], rp[1] + d.pos[1], rp[2] + d.pos[2]];
  }
  // Par os : R (liaison, 3x3 ligne par ligne), J liaison, J repos.
  const xf = BONES.map((name) => {
    const m = world[name].elements; // colonne majeure
    const R = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
    return { name, R, Jb: [m[12], m[13], m[14]], Jr: rest[name] };
  });
  return { xf, world, rest, index: Object.fromEntries(BONES.map((n, i) => [n, i])) };
}

// Repos → liaison pour un point.
export function restToBind(x, y, z, t) {
  const R = t.R;
  const qx = x - t.Jr[0], qy = y - t.Jr[1], qz = z - t.Jr[2];
  return [R[0] * qx + R[1] * qy + R[2] * qz + t.Jb[0], R[3] * qx + R[4] * qy + R[5] * qz + t.Jb[1], R[6] * qx + R[7] * qy + R[8] * qz + t.Jb[2]];
}

// ---------- Primitives (espace repos) ----------
// Chaque primitive : { op:'prim', fn(x,y,z), rb:[minx,miny,minz,maxx,maxy,maxz] (boîte repos), bone, tag, axis?, w? }

export function sphere(c, r) {
  return { fn: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, rb: [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r] };
}

// Matrice de rotation (lignes) depuis des angles Euler XYZ (radians) — repère local de la primitive.
function rotRows(rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).elements;
  // Inverse (transposée) : monde → local.
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
}

function boxOfRotated(c, ext) {
  return [c[0] - ext, c[1] - ext, c[2] - ext, c[0] + ext, c[1] + ext, c[2] + ext];
}

// Ellipsoïde (approximation d'IQ, bonne près de la surface). rot = [rx, ry, rz].
export function ellipsoid(c, r, rot) {
  const M = rot ? rotRows(rot[0], rot[1], rot[2]) : null;
  const [a, b, d] = r;
  const fn = (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    if (M) {
      const lx = M[0] * px + M[1] * py + M[2] * pz;
      const ly = M[3] * px + M[4] * py + M[5] * pz;
      const lz = M[6] * px + M[7] * py + M[8] * pz;
      px = lx; py = ly; pz = lz;
    }
    const k0 = Math.hypot(px / a, py / b, pz / d);
    if (k0 < 1e-9) return -Math.min(a, b, d);
    const k1 = Math.hypot(px / (a * a), py / (b * b), pz / (d * d));
    return (k0 * (k0 - 1)) / k1;
  };
  const e = Math.max(a, b, d);
  return { fn, rb: M ? boxOfRotated(c, e) : [c[0] - a, c[1] - b, c[2] - d, c[0] + a, c[1] + b, c[2] + d] };
}

// Cône arrondi exact (IQ). sx/sz : aplatissement de la section (approx.).
export function roundCone(a, b, r1, r2, flat) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  // Repère local pour l'aplatissement : u = axe, v/w perpendiculaires.
  let F = null;
  if (flat) {
    const L = Math.sqrt(l2);
    const u = [bax / L, bay / L, baz / L];
    let ref = flat.ref || [0, 0, 1];
    let v = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
    let vl = Math.hypot(...v);
    if (vl < 1e-6) {
      ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      v = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
      vl = Math.hypot(...v);
    }
    v = v.map((q) => q / vl);
    const w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    F = { u, v, w, sv: flat.sv || 1, sw: flat.sw || 1 };
  }
  const core = (px, py, pz) => {
    const y = px * bax + py * bay + pz * baz;
    const z = y - l2;
    const cx = px * l2 - bax * y, cy = py * l2 - bay * y, cz = pz * l2 - baz * y;
    const x2 = cx * cx + cy * cy + cz * cz;
    const y2 = y * y * l2;
    const z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt((x2 * a2) * il2) + y * rr) * il2 - r1;
  };
  const fn = F
    ? (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const du = px * F.u[0] + py * F.u[1] + pz * F.u[2];
      const dv = (px * F.v[0] + py * F.v[1] + pz * F.v[2]) / F.sv;
      const dw = (px * F.w[0] + py * F.w[1] + pz * F.w[2]) / F.sw;
      const qx = F.u[0] * du + F.v[0] * dv + F.w[0] * dw;
      const qy = F.u[1] * du + F.v[1] * dv + F.w[1] * dw;
      const qz = F.u[2] * du + F.v[2] * dv + F.w[2] * dw;
      return core(qx, qy, qz) * Math.min(F.sv, F.sw, 1);
    }
    : (x, y, z) => core(x - a[0], y - a[1], z - a[2]);
  const R = Math.max(r1, r2) * (flat ? Math.max(flat.sv || 1, flat.sw || 1, 1) : 1);
  return {
    fn,
    rb: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R],
    seg: [a, b],
  };
}
export const capsule = (a, b, r, flat) => roundCone(a, b, r, r, flat);

// Boîte arrondie. h = demi-tailles, r = rayon d'arrondi, rot = Euler.
export function roundBox(c, h, r, rot) {
  const M = rot ? rotRows(rot[0], rot[1], rot[2]) : null;
  const fn = (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    if (M) {
      const lx = M[0] * px + M[1] * py + M[2] * pz;
      const ly = M[3] * px + M[4] * py + M[5] * pz;
      const lz = M[6] * px + M[7] * py + M[8] * pz;
      px = lx; py = ly; pz = lz;
    }
    const qx = Math.abs(px) - h[0] + r, qy = Math.abs(py) - h[1] + r, qz = Math.abs(pz) - h[2] + r;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
  const e = Math.hypot(h[0], h[1], h[2]);
  return { fn, rb: M ? boxOfRotated(c, e) : [c[0] - h[0], c[1] - h[1], c[2] - h[2], c[0] + h[0], c[1] + h[1], c[2] + h[2]] };
}

// Tore (anneau) d'axe y local.
export function torus(c, R, r, rot) {
  const M = rot ? rotRows(rot[0], rot[1], rot[2]) : null;
  const fn = (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    if (M) {
      const lx = M[0] * px + M[1] * py + M[2] * pz;
      const ly = M[3] * px + M[4] * py + M[5] * pz;
      const lz = M[6] * px + M[7] * py + M[8] * pz;
      px = lx; py = ly; pz = lz;
    }
    return Math.hypot(Math.hypot(px, pz) - R, py) - r;
  };
  return { fn, rb: boxOfRotated(c, R + r) };
}

// Tube « lofté » : sections elliptiques le long d'un axe (membres, tronc, cou).
// o : origine ; axis/side/front : repère orthonormé ; secs : [s, rx, rz, ox, oz] (s en m le long de l'axe).
export function loft(o, axis, side, front, secs, opts = {}) {
  const n = secs.length;
  const S = secs.map((s) => s[0]);
  const val = (j, s) => {
    // Interpolation de Catmull-Rom monotone (Hermite) sur les sections.
    if (s <= S[0]) return secs[0][j];
    if (s >= S[n - 1]) return secs[n - 1][j];
    let i = 0;
    while (i < n - 2 && s > S[i + 1]) i++;
    const s0 = S[i], s1 = S[i + 1];
    const t = (s - s0) / (s1 - s0);
    const p0 = secs[i][j], p1 = secs[i + 1][j];
    const m = (k) => {
      if (k <= 0) return (secs[1][j] - secs[0][j]) / (S[1] - S[0]);
      if (k >= n - 1) return (secs[n - 1][j] - secs[n - 2][j]) / (S[n - 1] - S[n - 2]);
      const d0 = (secs[k][j] - secs[k - 1][j]) / (S[k] - S[k - 1]);
      const d1 = (secs[k + 1][j] - secs[k][j]) / (S[k + 1] - S[k]);
      return d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1);
    };
    const h = s1 - s0;
    const m0 = m(i) * h, m1 = m(i + 1) * h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
  };
  const capR = opts.cap ?? 0;
  const fn = (x, y, z) => {
    const px = x - o[0], py = y - o[1], pz = z - o[2];
    const s = px * axis[0] + py * axis[1] + pz * axis[2];
    const lx = px * side[0] + py * side[1] + pz * side[2];
    const lz = px * front[0] + py * front[1] + pz * front[2];
    const sc = clamp(s, S[0], S[n - 1]);
    const rx = val(1, sc), rz = val(2, sc);
    const ex = lx - val(3, sc), ez = lz - val(4, sc);
    const k0 = Math.hypot(ex / rx, ez / rz);
    let d2;
    if (k0 < 1e-9) d2 = -Math.min(rx, rz);
    else d2 = (k0 * (k0 - 1)) / Math.hypot(ex / (rx * rx), ez / (rz * rz));
    // Correction de pente (rayon variable le long de l'axe).
    const e = 0.004;
    const dr = (val(1, sc + e) + val(2, sc + e) - val(1, sc - e) - val(2, sc - e)) / (4 * e);
    d2 /= Math.sqrt(1 + dr * dr);
    const da = s < S[0] ? S[0] - s : s > S[n - 1] ? s - S[n - 1] : 0;
    if (da <= 0) return d2;
    // Embouts arrondis (rayon capR) ou plats.
    if (capR > 0) {
      const dd = d2 + capR;
      return (dd > 0 ? Math.hypot(dd, da) : Math.max(da, dd)) - capR;
    }
    return d2 > 0 ? Math.hypot(d2, da) : da;
  };
  let R = 0;
  for (const s of secs) R = Math.max(R, Math.max(s[1], s[2]) + Math.hypot(s[3], s[4]));
  const pa = [o[0] + axis[0] * S[0], o[1] + axis[1] * S[0], o[2] + axis[2] * S[0]];
  const pb = [o[0] + axis[0] * S[n - 1], o[1] + axis[1] * S[n - 1], o[2] + axis[2] * S[n - 1]];
  return {
    fn,
    rb: [Math.min(pa[0], pb[0]) - R, Math.min(pa[1], pb[1]) - R, Math.min(pa[2], pb[2]) - R, Math.max(pa[0], pb[0]) + R, Math.max(pa[1], pb[1]) + R, Math.max(pa[2], pb[2]) + R],
    axisOf: (x, y, z) => (x - o[0]) * axis[0] + (y - o[1]) * axis[1] + (z - o[2]) * axis[2],
    secs,
  };
}

// ---------- Nœuds ----------
// prim(shape, bone, opts) : opts.tag (zone/partie), opts.w (poids d'os : fonction (x,y,z repos) → [[os, w]...]).
export function prim(shape, bone, opts = {}) {
  return { op: 'prim', fn: shape.fn, rb: shape.rb, bone, tag: opts.tag || null, part: opts.part || null, w: opts.w || null, axisOf: shape.axisOf || null, shape, noSkin: !!opts.noSkin };
}
export const union = (k, children, opts = {}) => ({ op: 'union', k, children: children.filter(Boolean), tag: opts.tag || null });
export const sub = (k, a, b) => ({ op: 'sub', k, a, b });
export const inter = (k, a, b) => ({ op: 'inter', k, a, b });
export const offset = (t, child) => ({ op: 'offset', t, child });
// Masque : garde la partie où field(x,y,z liaison) < 0 (intersection lisse).
export const mask = (k, child, field) => ({ op: 'mask', k, child, field });
// Déformation libre du champ (ex. relief de mèches) : d + f(x,y,z).
export const displace = (child, f, amp) => ({ op: 'disp', child, f, amp });

// ---------- Évaluateur ----------
export class Evaluator {
  constructor(root, skel) {
    this.root = root;
    this.skel = skel;
    this.xf = skel.xf;
    const nb = this.xf.length;
    this.q = new Float64Array(nb * 3);
    this.qs = new Int32Array(nb);
    this.stamp = 1;
    this.prims = [];
    this._prep(root);
  }

  _prep(n) {
    if (n.bb) return n.bb;
    let bb;
    if (n.op === 'prim') {
      const t = this.xf[n.bone];
      const r = n.rb;
      bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < 8; i++) {
        const p = restToBind(i & 1 ? r[3] : r[0], i & 2 ? r[4] : r[1], i & 4 ? r[5] : r[2], t);
        for (let k = 0; k < 3; k++) {
          bb[k] = Math.min(bb[k], p[k]);
          bb[k + 3] = Math.max(bb[k + 3], p[k]);
        }
      }
      n.id = this.prims.length;
      this.prims.push(n);
    } else if (n.op === 'union') {
      bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const c of n.children) {
        const b = this._prep(c);
        for (let k = 0; k < 3; k++) {
          bb[k] = Math.min(bb[k], b[k]);
          bb[k + 3] = Math.max(bb[k + 3], b[k + 3]);
        }
      }
      n.lb = new Float64Array(n.children.length);
    } else if (n.op === 'sub' || n.op === 'inter') {
      bb = this._prep(n.a).slice();
      this._prep(n.b);
    } else if (n.op === 'offset') {
      const b = this._prep(n.child);
      bb = [b[0] - n.t, b[1] - n.t, b[2] - n.t, b[3] + n.t, b[4] + n.t, b[5] + n.t];
    } else if (n.op === 'mask' || n.op === 'disp') {
      const b = this._prep(n.child);
      const a = n.op === 'disp' ? n.amp : 0;
      bb = [b[0] - a, b[1] - a, b[2] - a, b[3] + a, b[4] + a, b[5] + a];
    }
    n.bb = bb;
    return bb;
  }

  static boxDist(b, x, y, z) {
    const dx = Math.max(b[0] - x, 0, x - b[3]);
    const dy = Math.max(b[1] - y, 0, y - b[4]);
    const dz = Math.max(b[2] - z, 0, z - b[5]);
    return Math.hypot(dx, dy, dz);
  }

  eval(x, y, z) {
    this.stamp++;
    return this._ev(this.root, x, y, z);
  }

  // Point dans le repère repos de l'os (mis en cache par évaluation).
  _local(bone, x, y, z) {
    const o = bone * 3;
    if (this.qs[bone] !== this.stamp) {
      const t = this.xf[bone];
      const R = t.R;
      const px = x - t.Jb[0], py = y - t.Jb[1], pz = z - t.Jb[2];
      this.q[o] = R[0] * px + R[3] * py + R[6] * pz + t.Jr[0];
      this.q[o + 1] = R[1] * px + R[4] * py + R[7] * pz + t.Jr[1];
      this.q[o + 2] = R[2] * px + R[5] * py + R[8] * pz + t.Jr[2];
      this.qs[bone] = this.stamp;
    }
    return o;
  }

  _ev(n, x, y, z) {
    switch (n.op) {
      case 'prim': {
        const o = this._local(n.bone, x, y, z);
        return n.fn(this.q[o], this.q[o + 1], this.q[o + 2]);
      }
      case 'union': {
        const ch = n.children;
        const lb = n.lb;
        let best = 0, bl = Infinity;
        for (let i = 0; i < ch.length; i++) {
          const v = Evaluator.boxDist(ch[i].bb, x, y, z);
          lb[i] = v;
          if (v < bl) {
            bl = v;
            best = i;
          }
        }
        let d = this._ev(ch[best], x, y, z);
        for (let i = 0; i < ch.length; i++) {
          if (i === best || lb[i] > d + n.k) continue;
          d = smin(d, this._ev(ch[i], x, y, z), n.k);
        }
        return d;
      }
      case 'sub': {
        const a = this._ev(n.a, x, y, z);
        if (Evaluator.boxDist(n.b.bb, x, y, z) > n.k + Math.max(0, -a)) return a;
        return smax(a, -this._ev(n.b, x, y, z), n.k);
      }
      case 'inter': {
        const a = this._ev(n.a, x, y, z);
        return smax(a, this._ev(n.b, x, y, z), n.k);
      }
      case 'offset':
        return this._ev(n.child, x, y, z) - n.t;
      case 'mask': {
        const a = this._ev(n.child, x, y, z);
        return smax(a, n.field(x, y, z, this), n.k);
      }
      case 'disp':
        return this._ev(n.child, x, y, z) + n.f(x, y, z);
    }
    throw new Error('op ' + n.op);
  }

  grad(x, y, z, e = 0.0004) {
    const dx = this.eval(x + e, y, z) - this.eval(x - e, y, z);
    const dy = this.eval(x, y + e, z) - this.eval(x, y - e, z);
    const dz = this.eval(x, y, z + e) - this.eval(x, y, z - e);
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  }

  // Distances exactes de toutes les primitives (pour la propriété des sommets : poids, zones).
  primDistances(x, y, z, out) {
    this.stamp++;
    for (let i = 0; i < this.prims.length; i++) {
      const p = this.prims[i];
      const o = this._local(p.bone, x, y, z);
      out[i] = p.fn(this.q[o], this.q[o + 1], this.q[o + 2]);
    }
    return out;
  }

  // Coordonnées repos d'un point (sans changer l'estampille : utilisable dans un champ de masque).
  loc(bone, x, y, z) {
    const o = this._local(bone, x, y, z);
    return [this.q[o], this.q[o + 1], this.q[o + 2]];
  }

  // Valeur d'un sous-nœud (calque nommé) en un point.
  node(n, x, y, z) {
    this.stamp++;
    return this._ev(n, x, y, z);
  }

  localOf(bone, x, y, z) {
    this.stamp++;
    const o = this._local(bone, x, y, z);
    return [this.q[o], this.q[o + 1], this.q[o + 2]];
  }
}
