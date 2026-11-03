// Cheval Tripo (essai) : corrections du maillage source (faces, normales, relief des plaques, micro-replis).
import { effacerReliefPlaques } from './relief-plaques.mjs';
import { zoneReliefDesMasques } from './clean-texture.mjs';

// Cheval Tripo (essai) : réorientation des faces retournées de la source.
//
// La source contient quelques triangles d'orientation opposée à leurs voisins (17 arêtes parcourues dans le même
// sens par leurs deux faces). On propage l'orientation de proche en proche (parcours en largeur sur les arêtes
// manifold, sommets soudés par position) depuis la face la plus haute, orientée vers le haut, et l'on retourne les
// triangles incohérents. Renvoie le nombre de triangles retournés et le contrôle après correction.
export function fixWinding(P, I) {
  const nv = P.length / 3, nt = I.length / 3;
  const key = (i) => `${Math.round(P[i * 3] * 1e6)},${Math.round(P[i * 3 + 1] * 1e6)},${Math.round(P[i * 3 + 2] * 1e6)}`;
  const map = new Map(), weld = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, map.size);
    weld[i] = map.get(k);
  }
  const W = (t, k) => weld[I[t * 3 + k]];
  // Arêtes non orientées → triangles adjacents.
  const edges = new Map();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
    const a = W(t, k), b = W(t, (k + 1) % 3);
    if (a === b) continue;
    const e = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (!edges.has(e)) edges.set(e, []);
    edges.get(e).push(t);
  }
  // Sens d'une arête dans un triangle : +1 si (a→b) apparaît dans l'ordre du triangle.
  const dir = (t, a, b) => {
    for (let k = 0; k < 3; k++) if (W(t, k) === a && W(t, (k + 1) % 3) === b) return 1;
    return -1;
  };
  // Graine : triangle dont le centre est le plus haut, normale géométrique vers le haut.
  let seed = 0, best = -1e9;
  for (let t = 0; t < nt; t++) {
    const y = (P[I[t * 3] * 3 + 1] + P[I[t * 3 + 1] * 3 + 1] + P[I[t * 3 + 2] * 3 + 1]) / 3;
    if (y > best) {
      best = y;
      seed = t;
    }
  }
  const normY = (t) => {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const ux = P[b * 3] - P[a * 3], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vz = P[c * 3 + 2] - P[a * 3 + 2];
    return uz * vx - ux * vz;
  };
  const flip = new Uint8Array(nt);
  const seen = new Uint8Array(nt);
  if (normY(seed) < 0) flip[seed] = 1;
  // Parcours de toutes les composantes (une seule ici).
  let flipped = 0;
  for (let s0 = 0; s0 < nt; s0++) {
    const start = s0 === 0 ? seed : s0;
    if (seen[start]) continue;
    seen[start] = 1;
    const q = [start];
    while (q.length) {
      const t = q.shift();
      for (let k = 0; k < 3; k++) {
        const a = W(t, k), b = W(t, (k + 1) % 3);
        if (a === b) continue;
        const adj = edges.get(a < b ? `${a}_${b}` : `${b}_${a}`);
        if (!adj || adj.length !== 2) continue; // arête de bord ou non-manifold : pas de propagation
        const u = adj[0] === t ? adj[1] : adj[0];
        if (seen[u]) continue;
        seen[u] = 1;
        // Cohérent si l'arête est parcourue en sens opposés (en tenant compte des retournements décidés).
        const dt = dir(t, a, b) * (flip[t] ? -1 : 1);
        const du = dir(u, a, b);
        flip[u] = du === dt ? 1 : 0;
        q.push(u);
      }
    }
  }
  // Graine mal orientée (cas extrême) : la majorité fait foi.
  let nf = 0;
  for (let t = 0; t < nt; t++) nf += flip[t];
  if (nf > nt / 2) for (let t = 0; t < nt; t++) flip[t] ^= 1;
  for (let t = 0; t < nt; t++) if (flip[t]) {
    const b = I[t * 3 + 1];
    I[t * 3 + 1] = I[t * 3 + 2];
    I[t * 3 + 2] = b;
    flipped++;
  }
  // Contrôle : arêtes manifold parcourues dans le même sens.
  let incoherent = 0;
  for (const [e, adj] of edges) {
    if (adj.length !== 2) continue;
    const [a, b] = e.split('_').map(Number);
    if (dir(adj[0], a, b) === dir(adj[1], a, b)) incoherent++;
  }
  return { flipped, incoherent };
}

// Normales des sommets des faces qui les contredisent (faces réorientées, structures fines) : moyenne pondérée par
// l'aire des normales géométriques des faces voisines (sommets soudés). Le lissage d'origine est gardé ailleurs.
// Puis normales de couture incohérentes (voir repairSeamNormals).
export function repairNormals(P, N, I) {
  const nv = P.length / 3, nt = I.length / 3;
  const fn = new Float32Array(nt * 3);
  const bad = new Uint8Array(nv);
  let against = 0;
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    fn.set([fx, fy, fz], t * 3);
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) {
      against++;
      bad[a] = bad[b] = bad[c] = 1;
    }
  }
  const key = (i) => `${Math.round(P[i * 3] * 1e6)},${Math.round(P[i * 3 + 1] * 1e6)},${Math.round(P[i * 3 + 2] * 1e6)}`;
  const acc = new Map();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
    const v = I[t * 3 + k];
    if (!bad[v]) continue;
    const kk = key(v);
    const a = acc.get(kk) || [0, 0, 0];
    a[0] += fn[t * 3];
    a[1] += fn[t * 3 + 1];
    a[2] += fn[t * 3 + 2];
    acc.set(kk, a);
  }
  let fixed = 0;
  for (let v = 0; v < nv; v++) {
    if (!bad[v]) continue;
    const a = acc.get(key(v));
    const L = Math.hypot(a[0], a[1], a[2]);
    if (L < 1e-12) continue;
    N[v * 3] = a[0] / L;
    N[v * 3 + 1] = a[1] / L;
    N[v * 3 + 2] = a[2] / L;
    fixed++;
  }
  let after = 0;
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fn[t * 3] * nx + fn[t * 3 + 1] * ny + fn[t * 3 + 2] * nz < 0) after++;
  }
  return { facesAgainst: against, normalsFixed: fixed, facesAgainstAfter: after, ...repairSeamNormals(P, N, I) };
}

// Normales de couture : sur une surface lisse (faces voisines peu dispersées, moins de 25° en moyenne pondérée par
// l'aire), un doublon UV d'une position dont la normale s'écarte de plus de 30° de la surface alors qu'un doublon
// jumeau est cohérent (moins de 15°) prend la normale moyenne des jumeaux cohérents. Un sommet sans jumeau cohérent
// écarté de plus de 45° prend la normale des faces. La source en compte un millier (fines lignes sombres ou claires le
// long des coutures, par ex. sur l'encolure). Les arêtes vives (oreilles, crins, sabots) ne sont pas lisses : gardées.
export function repairSeamNormals(P, N, I) {
  const nv = P.length / 3;
  const key = (i) => `${Math.round(P[i * 3] * 1e6)},${Math.round(P[i * 3 + 1] * 1e6)},${Math.round(P[i * 3 + 2] * 1e6)}`;
  const map = new Map(), weld = new Int32Array(nv), grp = [];
  for (let v = 0; v < nv; v++) {
    const k = key(v);
    if (!map.has(k)) { map.set(k, map.size); grp.push([]); }
    weld[v] = map.get(k);
    grp[weld[v]].push(v);
  }
  const ng = map.size, acc = new Float64Array(ng * 3), fn = new Float64Array(I.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    fn[t] = uy * vz - uz * vy; fn[t + 1] = uz * vx - ux * vz; fn[t + 2] = ux * vy - uy * vx;
    for (const q of [a, b, c]) { const g = weld[q]; acc[g * 3] += fn[t]; acc[g * 3 + 1] += fn[t + 1]; acc[g * 3 + 2] += fn[t + 2]; }
  }
  // Dispersion des faces autour de chaque position : Σ A (1 - cos) / Σ A.
  const sA = new Float64Array(ng), sD = new Float64Array(ng);
  for (let t = 0; t < I.length; t += 3) {
    const A = Math.hypot(fn[t], fn[t + 1], fn[t + 2]);
    if (!(A > 0)) continue;
    for (let k = 0; k < 3; k++) {
      const g = weld[I[t + k]], l = Math.hypot(acc[g * 3], acc[g * 3 + 1], acc[g * 3 + 2]) || 1;
      sA[g] += A; sD[g] += A - (fn[t] * acc[g * 3] + fn[t + 1] * acc[g * 3 + 1] + fn[t + 2] * acc[g * 3 + 2]) / l;
    }
  }
  const cos = (d) => Math.cos((d * Math.PI) / 180), lisseMax = 1 - cos(25);
  let jumeaux = 0, isoles = 0;
  for (let g = 0; g < ng; g++) {
    if (!(sA[g] > 0) || sD[g] / sA[g] > lisseMax) continue;
    const l = Math.hypot(acc[g * 3], acc[g * 3 + 1], acc[g * 3 + 2]) || 1, fx = acc[g * 3] / l, fy = acc[g * 3 + 1] / l, fz = acc[g * 3 + 2] / l;
    const c = grp[g].map((v) => (N[v * 3] * fx + N[v * 3 + 1] * fy + N[v * 3 + 2] * fz) / (Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1));
    let bx = 0, by = 0, bz = 0, nb = 0;
    grp[g].forEach((v, k) => { if (c[k] > cos(15)) { bx += N[v * 3]; by += N[v * 3 + 1]; bz += N[v * 3 + 2]; nb++; } });
    const bl = Math.hypot(bx, by, bz);
    grp[g].forEach((v, k) => {
      if (nb && bl > 0 && c[k] < cos(30)) { N[v * 3] = bx / bl; N[v * 3 + 1] = by / bl; N[v * 3 + 2] = bz / bl; jumeaux++; }
      else if (!nb && c[k] < cos(45)) { N[v * 3] = fx; N[v * 3 + 1] = fy; N[v * 3 + 2] = fz; isoles++; }
    });
  }
  return { seamNormalsFixed: jumeaux, isolatedNormalsFixed: isoles };
}

// Relief des plaques imprimées par la génération (tapis de selle et quartiers : bords modelés dans le maillage).
// masks : [{ data, width, height }] en niveaux de gris (0..255), masques tapis et quartiers de cleanTripoTextures.
// Si ces masques sont ceux d'un nettoyage de ce processus (empreinte identique) et que le maillage a le même nombre de
// sommets que la source, la zone de relief calculée par le nettoyage (sommets à replacer, mèche et toupet exclus) est
// effacée par relief-plaques.mjs (moindres carrés laplaciens, courbure du pelage voisin) : c'est le chemin de la
// construction, identique à l'aperçu trial/tripo_clean_relief_preview.glb. Sinon (masques d'une autre origine,
// ou { taubin: true }) : ancien lissage de Taubin (λ/μ) limité aux masques lus aux UV des sommets et à une marge de
// quelques anneaux. Normales recalculées dans la zone dans les deux cas.
export function smoothMaskedRelief(P, N, I, UV, masks, { rings = 4, iterations = 30, lambda = 0.55, mu = -0.58, taubin = false } = {}) {
  const nv = P.length / 3;
  const zone = taubin ? null : zoneReliefDesMasques(masks, nv);
  if (zone) {
    const r = effacerReliefPlaques(P, N, I, zone);
    let moved = 0;
    for (let v = 0; v < nv; v++) moved += zone[v];
    return {
      methode: 'relief-plaques (laplacien, courbure du pelage voisin)', zoneVertices: r.sommetsLibres, movedVertices: moved,
      maxMoveMm: +(r.deplacement.max * 1000).toFixed(1), meanMoveMm: +(r.deplacement.moyen * 1000).toFixed(2),
      tangentialMeanMm: +(r.deplacement.tangentielMoyen * 1000).toFixed(2), foldedFaces: r.facesPliees, ms: r.tempsMs,
    };
  }
  const key = (i) => `${Math.round(P[i * 3] * 1e6)},${Math.round(P[i * 3 + 1] * 1e6)},${Math.round(P[i * 3 + 2] * 1e6)}`;
  const map = new Map(), weld = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, map.size);
    weld[i] = map.get(k);
  }
  const ng = map.size;
  const adj = Array.from({ length: ng }, () => new Set());
  for (let t = 0; t < I.length; t += 3) {
    const a = weld[I[t]], b = weld[I[t + 1]], c = weld[I[t + 2]];
    adj[a].add(b).add(c);
    adj[b].add(a).add(c);
    adj[c].add(a).add(b);
  }
  const A = adj.map((s) => [...s]);
  // Valeur de masque par sommet soudé (maximum sur les doublons de couture).
  const m = new Float32Array(ng);
  for (let v = 0; v < nv; v++) {
    for (const M of masks) {
      const x = Math.min(M.width - 1, Math.max(0, Math.round(UV[v * 2] * M.width - 0.5)));
      const y = Math.min(M.height - 1, Math.max(0, Math.round(UV[v * 2 + 1] * M.height - 0.5)));
      m[weld[v]] = Math.max(m[weld[v]], M.data[y * M.width + x] / 255);
    }
  }
  // Poids : 1 dans la zone, décroissant sur `rings` anneaux.
  const w = new Float32Array(ng);
  let front = [];
  for (let g = 0; g < ng; g++) if (m[g] > 0.1) {
    w[g] = 1;
    front.push(g);
  }
  const inZone = front.length;
  for (let r = 1; r <= rings; r++) {
    const nx = [];
    for (const g of front) for (const h of A[g]) if (w[h] === 0) {
      w[h] = 1 - r / (rings + 1);
      nx.push(h);
    }
    front = nx;
  }
  // Positions par sommet soudé.
  const Q = new Float64Array(ng * 3);
  const rep = new Int32Array(ng).fill(-1);
  for (let v = 0; v < nv; v++) if (rep[weld[v]] < 0) {
    rep[weld[v]] = v;
    Q.set([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], weld[v] * 3);
  }
  const moved = [];
  for (let g = 0; g < ng; g++) if (w[g] > 0) moved.push(g);
  const step = (f) => {
    const D = new Float64Array(moved.length * 3);
    moved.forEach((g, j) => {
      const a = A[g];
      if (!a.length) return;
      let sx = 0, sy = 0, sz = 0;
      for (const h of a) {
        sx += Q[h * 3];
        sy += Q[h * 3 + 1];
        sz += Q[h * 3 + 2];
      }
      D[j * 3] = (sx / a.length - Q[g * 3]) * f * w[g];
      D[j * 3 + 1] = (sy / a.length - Q[g * 3 + 1]) * f * w[g];
      D[j * 3 + 2] = (sz / a.length - Q[g * 3 + 2]) * f * w[g];
    });
    moved.forEach((g, j) => {
      Q[g * 3] += D[j * 3];
      Q[g * 3 + 1] += D[j * 3 + 1];
      Q[g * 3 + 2] += D[j * 3 + 2];
    });
  };
  let maxMove = 0;
  const Q0 = Float64Array.from(Q);
  for (let it = 0; it < iterations; it++) {
    step(lambda);
    step(mu);
  }
  for (const g of moved) maxMove = Math.max(maxMove, Math.hypot(Q[g * 3] - Q0[g * 3], Q[g * 3 + 1] - Q0[g * 3 + 1], Q[g * 3 + 2] - Q0[g * 3 + 2]));
  for (let v = 0; v < nv; v++) {
    const g = weld[v];
    if (w[g] > 0) P.set([Q[g * 3], Q[g * 3 + 1], Q[g * 3 + 2]], v * 3);
  }
  // Normales de la zone : faces voisines (aire), fondues avec l'origine selon le poids.
  const acc = new Float64Array(ng * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!(w[weld[a]] > 0 || w[weld[b]] > 0 || w[weld[c]] > 0)) continue;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      const g = weld[v];
      acc[g * 3] += fx;
      acc[g * 3 + 1] += fy;
      acc[g * 3 + 2] += fz;
    }
  }
  for (let v = 0; v < nv; v++) {
    const g = weld[v];
    if (!(w[g] > 0)) continue;
    const L = Math.hypot(acc[g * 3], acc[g * 3 + 1], acc[g * 3 + 2]) || 1;
    const k = w[g];
    const nx = N[v * 3] * (1 - k) + (acc[g * 3] / L) * k, ny = N[v * 3 + 1] * (1 - k) + (acc[g * 3 + 1] / L) * k, nz = N[v * 3 + 2] * (1 - k) + (acc[g * 3 + 2] / L) * k;
    const l2 = Math.hypot(nx, ny, nz) || 1;
    N.set([nx / l2, ny / l2, nz / l2], v * 3);
  }
  return { methode: 'taubin', zoneVertices: inZone, movedVertices: moved.length, maxMoveMm: +(maxMove * 1000).toFixed(1) };
}

// Micro-replis : triangles minuscules (aire < maxArea, m²) dont la normale géométrique s'oppose à leurs normales de
// sommet (repli du maillage source sur lui-même) ; ils s'affichent en petits points sombres selon l'éclairage. Ils sont
// retirés de l'index (le trou laissé est inférieur au millimètre carré et recouvert par le repli voisin). Les replis
// plus grands sont seulement comptés.
export function dropFoldedMicroFaces(P, N, I, maxArea = 2e-6) {
  const out = [];
  let dropped = 0, keptAgainst = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) {
      if (Math.hypot(fx, fy, fz) / 2 < maxArea) {
        dropped++;
        continue;
      }
      keptAgainst++;
    }
    out.push(a, b, c);
  }
  return { indices: Uint32Array.from(out), dropped, keptAgainst };
}
