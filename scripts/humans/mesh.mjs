// Traitements du maillage : découpe exacte le long des frontières de zones, coutures, simplification (meshoptimizer),
// attributs (normales du champ, poids de peau, occlusion ambiante).
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

export async function ready() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
}

// Projection d'un point sur la surface du champ (Newton).
export function project(ev, p, it = 2) {
  let [x, y, z] = p;
  for (let i = 0; i < it; i++) {
    const d = ev.eval(x, y, z);
    if (Math.abs(d) < 1e-6) break;
    const g = ev.grad(x, y, z, 0.0004);
    x -= d * g[0];
    y -= d * g[1];
    z -= d * g[2];
  }
  return [x, y, z];
}

export function simplifyPositions(pos, idx, targetTris, err = 0.0006) {
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, Math.min(targetTris * 3, idx.length), err, ['ErrorAbsolute']);
  return compact(pos, out, 3);
}

// Garde uniquement les sommets référencés.
export function compact(pos, idx, stride, extra = []) {
  const map = new Int32Array(pos.length / stride).fill(-1);
  let n = 0;
  const ni = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let v = map[idx[i]];
    if (v < 0) v = map[idx[i]] = n++;
    ni[i] = v;
  }
  const np = new Float32Array(n * stride);
  const ne = extra.map((a) => new a.constructor((a.length / (pos.length / stride)) * n));
  for (let v = 0; v < map.length; v++) {
    const m = map[v];
    if (m < 0) continue;
    for (let k = 0; k < stride; k++) np[m * stride + k] = pos[v * stride + k];
    extra.forEach((a, j) => {
      const s = a.length / (pos.length / stride);
      for (let k = 0; k < s; k++) ne[j][m * s + k] = a[v * s + k];
    });
  }
  return { pos: np, idx: ni, extra: ne, remap: map };
}

// Découpe le long des frontières de zones (bissection sur les arêtes) ; renvoie triangles + zone par triangle.
export function cutZones(pos, idx, ev, zoneAt, log = () => {}) {
  const P = Array.from(pos);
  const nv0 = P.length / 3;
  const vz = new Int32Array(nv0);
  for (let v = 0; v < nv0; v++) vz[v] = zoneAt(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
  const VZ = Array.from(vz);
  const edges = new Map();
  const addV = (p, zone) => {
    const q = project(ev, p, 2);
    P.push(q[0], q[1], q[2]);
    VZ.push(zone);
    return P.length / 3 - 1;
  };
  const split = (a, b) => {
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    let v = edges.get(key);
    if (v !== undefined) return v;
    const za = VZ[a];
    let lo = 0, hi = 1;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const dx = P[b * 3] - ax, dy = P[b * 3 + 1] - ay, dz = P[b * 3 + 2] - az;
    for (let i = 0; i < 9; i++) {
      const m = (lo + hi) / 2;
      if (zoneAt(ax + dx * m, ay + dy * m, az + dz * m) === za) lo = m;
      else hi = m;
    }
    const t = (lo + hi) / 2;
    v = addV([ax + dx * t, ay + dy * t, az + dz * t], -1);
    edges.set(key, v);
    return v;
  };
  const T = [];
  const TZ = [];
  let nsplit = 0;
  for (let i = 0; i < idx.length; i += 3) {
    let a = idx[i], b = idx[i + 1], c = idx[i + 2];
    let za = VZ[a], zb = VZ[b], zc = VZ[c];
    if (za === zb && zb === zc) {
      T.push(a, b, c);
      TZ.push(za);
      continue;
    }
    nsplit++;
    if (za !== zb && zb !== zc && za !== zc) {
      const r = split(a, b), p = split(b, c), q = split(c, a);
      const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
      const m = addV([cx, cy, cz], -1);
      T.push(a, r, m, a, m, q, r, b, m, b, p, m, p, c, m, c, q, m);
      TZ.push(za, za, zb, zb, zc, zc);
      continue;
    }
    // faire en sorte que c soit le sommet isolé
    if (za === zc) [a, b, c, za, zb, zc] = [c, a, b, zc, za, zb];
    else if (zb === zc) [a, b, c, za, zb, zc] = [b, c, a, zb, zc, za];
    const p = split(b, c), q = split(c, a);
    T.push(a, b, p, a, p, q, q, p, c);
    TZ.push(za, za, zc);
  }
  log(`découpe : ${nsplit} triangles coupés, ${P.length / 3 - nv0} sommets ajoutés`);
  return { pos: new Float32Array(P), idx: new Uint32Array(T), tz: new Int32Array(TZ) };
}

// Duplique les sommets sur les frontières de zones (coutures) → zone par sommet.
export function splitSeams(pos, idx, tz, mergeMap = null) {
  const nv = pos.length / 3;
  const tzz = mergeMap ? tz.map((z) => (mergeMap[z] ?? z)) : tz;
  const first = new Int32Array(nv).fill(-1);
  const dup = new Map();
  const P = Array.from(pos);
  const VZ = new Array(nv).fill(-1);
  const src = [];
  for (let v = 0; v < nv; v++) src.push(v);
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    const z = tzz[(i / 3) | 0];
    if (first[v] < 0) {
      first[v] = z;
      VZ[v] = z;
      out[i] = v;
    } else if (first[v] === z) out[i] = v;
    else {
      const key = v * 64 + z;
      let d = dup.get(key);
      if (d === undefined) {
        d = P.length / 3;
        P.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        VZ.push(z);
        src.push(v);
        dup.set(key, d);
      }
      out[i] = d;
    }
  }
  return { pos: new Float32Array(P), idx: out, vz: Int32Array.from(VZ), src: Int32Array.from(src) };
}

// Simplification d'un niveau de détail : coutures préservées, importance par sommet (visage, mains).
export function simplifyLOD(pos, idx, vz, imp, targetTris, opts = {}) {
  // Étape préalable : réduire tout sauf la région protégée (visage) pour lui garder un budget.
  if (opts.protect && opts.protectBudget) {
    const nv0 = pos.length / 3;
    const lock = new Uint8Array(nv0);
    let nl = 0;
    for (let v = 0; v < nv0; v++) if (opts.protect[v]) {
      lock[v] = 1;
      nl++;
    }
    let protTris = 0;
    for (let i = 0; i < idx.length; i += 3) if (lock[idx[i]] && lock[idx[i + 1]] && lock[idx[i + 2]]) protTris++;
    const stageTarget = protTris + Math.max(0, targetTris - opts.protectBudget);
    if (stageTarget * 3 < idx.length) {
      const P0 = new Float32Array(pos);
      const I0 = new Uint32Array(idx);
      const A0 = new Float32Array(nv0 * 3);
      for (let v = 0; v < nv0; v++) for (let k = 0; k < 3; k++) A0[v * 3 + k] = pos[v * 3 + k] * imp[v];
      const [cnt] = MeshoptSimplifier.simplifyWithUpdate(I0, P0, 3, A0, 3, [opts.attrWeight ?? 1, opts.attrWeight ?? 1, opts.attrWeight ?? 1], lock, stageTarget * 3, opts.maxErr ?? 0.05, ['ErrorAbsolute', ...(opts.flags || [])]);
      const c = compact(P0, I0.subarray(0, cnt), 3, [Int32Array.from(vz), Float32Array.from(imp)]);
      pos = c.pos;
      idx = c.idx;
      vz = c.extra[0];
      imp = c.extra[1];
    }
  }
  const nv = pos.length / 3;
  const P = new Float32Array(pos);
  const I = new Uint32Array(idx);
  // Attribut : position pondérée par l'importance (pénalise les effondrements dans les zones importantes).
  const A = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) A[v * 3 + k] = pos[v * 3 + k] * imp[v];
  const w = opts.attrWeight ?? 1;
  const flags = ['ErrorAbsolute', ...(opts.flags || [])];
  const [count, error] = MeshoptSimplifier.simplifyWithUpdate(I, P, 3, A, 3, [w, w, w], opts.lock || null, targetTris * 3, opts.maxErr ?? 0.05, flags);
  const used = I.subarray(0, count);
  const c = compact(P, used, 3, [Int32Array.from(vz)]);
  return { pos: c.pos, idx: c.idx, vz: c.extra[0], error, remap: c.remap };
}

// Ordre optimisé pour le cache de sommets et la compression.
export function optimize(pos, idx, extras) {
  // reorderMesh modifie les indices en place et renvoie la table de remappage.
  const I = new Uint32Array(idx);
  const [remap, unique] = MeshoptEncoder.reorderMesh(I, true, true);
  const nv = pos.length / 3;
  const np = new Float32Array(unique * 3);
  const ne = extras.map((a) => new a.constructor((a.length / nv) * unique));
  for (let v = 0; v < nv; v++) {
    const m = remap[v];
    if (m === 0xffffffff || m >= unique) continue;
    for (let k = 0; k < 3; k++) np[m * 3 + k] = pos[v * 3 + k];
    extras.forEach((a, j) => {
      const s = a.length / nv;
      for (let k = 0; k < s; k++) ne[j][m * s + k] = a[v * s + k];
    });
  }
  return { pos: np, idx: I, extras: ne };
}

// Occlusion ambiante par échantillonnage du champ le long de la normale + quelques directions.
export function bakeAO(ev, p, n) {
  let occ = 0;
  let sc = 1;
  const H = [0.008, 0.018, 0.035, 0.06, 0.09];
  for (const h of H) {
    const d = ev.eval(p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h);
    occ += (h - Math.max(d, 0)) * sc;
    sc *= 0.62;
  }
  return Math.max(0.35, Math.min(1, 1 - 3.3 * occ));
}

// Poids de peau : propriété douce des primitives (softmin des distances), répartie sur leurs os.
export function skinWeights(ev, p, sigma = 0.018) {
  const D = ev.primDistances(p[0], p[1], p[2], ev._wd || (ev._wd = new Float64Array(ev.prims.length)));
  let m = Infinity;
  const side = p[0] > 0.012 ? 1 : p[0] < -0.012 ? -1 : 0;
  const ok = (pr) => {
    if (pr.noSkin) return false;
    const t = pr.tag;
    if (t === 'socket' || t === 'nostril' || t === 'concha' || t === 'slit') return false;
    const part = pr.part || '';
    if (side > 0 && part[0] === 'r' && part !== 'torso') return false;
    if (side < 0 && part[0] === 'l' && part !== 'torso') return false;
    return true;
  };
  for (let i = 0; i < D.length; i++) if (ok(ev.prims[i]) && D[i] < m) m = D[i];
  const acc = new Map();
  for (let i = 0; i < D.length; i++) {
    const pr = ev.prims[i];
    if (!ok(pr) || D[i] > m + 5 * sigma) continue;
    const a = Math.exp(-(D[i] - m) / sigma);
    let bw;
    if (pr.w) {
      const q = ev.localOf(pr.bone, p[0], p[1], p[2]);
      bw = pr.w(q);
    } else bw = [[pr.bone, 1]];
    for (const [b, w] of bw) acc.set(b, (acc.get(b) || 0) + a * w);
  }
  const arr = [...acc.entries()].filter((e) => Number.isFinite(e[1]) && e[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 4);
  if (!arr.length) {
    let bi = 0;
    for (let i = 1; i < D.length; i++) if (D[i] < D[bi]) bi = i;
    return [[ev.prims[bi].bone, 1]];
  }
  const s = arr.reduce((t, e) => t + e[1], 0) || 1;
  return arr.map(([b, w]) => [b, w / s]);
}
