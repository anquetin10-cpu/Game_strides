// Cheval Tripo : effacement du relief des plaques imprimées dans le maillage (tapis de selle, quartiers).
//
// La génération Tripo a modelé le tapis et les quartiers dans la géométrie : dalle légèrement surélevée, bords
// roulés, marches, coutures en creux et micro-replis. Les sommets de la zone (fournie par cleanTripoTextures,
// result.geometry.zoneRelief) sont replacés par moindres carrés sur les coordonnées laplaciennes :
// minimum de Σ|Δx - δ|², laplacien à poids de valeur moyenne (calculés sur la géométrie d'origine), sommets hors
// zone fixes. Dans la zone, la cible δ est la courbure d'origine lissée sur quelques centimètres : la courbure du
// dos et du ventre est gardée (pas d'aplatissement), les bords, marches et coutures (courbures opposées très
// rapprochées) s'annulent. Raccord C1 avec le pelage ; dalle, bords, coutures et replis disparaissent.
// Résolution directe : une composante connexe de la zone à la fois, renumérotation de Cuthill-McKee inverse puis
// Cholesky en bande. Indépendant de l'échelle et de l'origine (positions natives ou calées en mètres).
// UV et index inchangés ; normales recalculées dans la zone, fondues sur quelques anneaux autour.

const cleSommet = (P, i) => `${Math.round(P[i * 3] * 1e6)},${Math.round(P[i * 3 + 1] * 1e6)},${Math.round(P[i * 3 + 2] * 1e6)}`;

// Sommets soudés par position (doublons des coutures UV) et adjacence CSR sans doublon.
function souder(P, I) {
  const nv = P.length / 3, map = new Map(), weld = new Int32Array(nv);
  for (let v = 0; v < nv; v++) {
    const k = cleSommet(P, v);
    let g = map.get(k);
    if (g === undefined) map.set(k, (g = map.size));
    weld[v] = g;
  }
  const ng = map.size;
  const paires = new Float64Array(I.length * 2);
  let np = 0;
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = weld[I[t + e]], b = weld[I[t + ((e + 1) % 3)]];
      if (a === b) continue;
      paires[np++] = a * ng + b;
      paires[np++] = b * ng + a;
    }
  }
  const tri = paires.subarray(0, np).sort();
  const deb = new Int32Array(ng + 1), vois = [];
  let prec = -1;
  for (let k = 0; k < np; k++) {
    if (tri[k] === prec) continue;
    prec = tri[k];
    const a = Math.floor(tri[k] / ng);
    vois.push(tri[k] - a * ng);
    deb[a + 1]++;
  }
  for (let g = 0; g < ng; g++) deb[g + 1] += deb[g];
  return { weld, ng, deb, vois: Int32Array.from(vois) };
}

// Poids des coordonnées de valeur moyenne (Floater) calculés sur la géométrie d'origine : toujours positifs,
// précision linéaire dans le plan tangent. Le laplacien qui en découle ne fait presque pas glisser les sommets le
// long de la surface (le laplacien uniforme les redistribue de plusieurs millimètres, et la texture avec eux).
function poidsVCM(P, I, weld, deb, vois, rep) {
  const w = new Float64Array(vois.length);
  const pos = (k, a, b) => { for (let q = deb[a]; q < deb[a + 1]; q++) if (vois[q] === b) return q; return -1; };
  for (let t = 0; t < I.length; t += 3) {
    const g = [weld[I[t]], weld[I[t + 1]], weld[I[t + 2]]];
    if (g[0] === g[1] || g[1] === g[2] || g[0] === g[2]) continue;
    for (let e = 0; e < 3; e++) {
      const i = g[e], j = g[(e + 1) % 3], k = g[(e + 2) % 3];
      const vi = rep[i] * 3, vj = rep[j] * 3, vk = rep[k] * 3;
      const ux = P[vj] - P[vi], uy = P[vj + 1] - P[vi + 1], uz = P[vj + 2] - P[vi + 2];
      const vx = P[vk] - P[vi], vy = P[vk + 1] - P[vi + 1], vz = P[vk + 2] - P[vi + 2];
      const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
      if (lu < 1e-12 || lv < 1e-12) continue;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const tanDemi = Math.hypot(cx, cy, cz) / (lu * lv + ux * vx + uy * vy + uz * vz + 1e-300);
      const qj = pos(0, i, j), qk = pos(0, i, k);
      if (qj >= 0) w[qj] += tanDemi / lu;
      if (qk >= 0) w[qk] += tanDemi / lv;
    }
  }
  return w;
}

// Renumérotation de Cuthill-McKee inverse (graphe donné par listes de voisins).
function rcm(n, adj) {
  const deg = adj.map((l) => l.length);
  const bfs = (s) => {
    const niv = new Int32Array(n).fill(-1), ordre = [s];
    niv[s] = 0;
    for (let t = 0; t < ordre.length; t++) for (const q of adj[ordre[t]]) if (niv[q] < 0) { niv[q] = niv[ordre[t]] + 1; ordre.push(q); }
    return { niv, ordre };
  };
  // Nœud pseudo-périphérique : deux balayages depuis le nœud de degré minimal.
  let s = 0;
  for (let k = 1; k < n; k++) if (deg[k] < deg[s]) s = k;
  for (let r = 0; r < 2; r++) { const { ordre } = bfs(s); s = ordre[ordre.length - 1]; }
  const vu = new Uint8Array(n), ordre = [];
  const depart = [s, ...Array.from({ length: n }, (_, k) => k)];
  for (const s0 of depart) {
    if (vu[s0]) continue;
    vu[s0] = 1;
    ordre.push(s0);
    for (let t = ordre.length - 1; t < ordre.length; t++) {
      const l = adj[ordre[t]].filter((q) => !vu[q]).sort((a, b) => deg[a] - deg[b]);
      for (const q of l) { vu[q] = 1; ordre.push(q); }
    }
  }
  ordre.reverse();
  const perm = new Int32Array(n);
  ordre.forEach((k, i) => (perm[k] = i));
  return perm;
}

// Cholesky en bande (stockage ligne i : colonnes i-bw..i) puis résolution pour plusieurs seconds membres.
function choleskyBande(n, bw, A) {
  const L = bw + 1;
  for (let i = 0; i < n; i++) {
    const j0 = Math.max(0, i - bw);
    for (let j = j0; j <= i; j++) {
      let s = A[i * L + (i - j)];
      const k0 = Math.max(j0, j - bw);
      for (let k = k0; k < j; k++) s -= A[i * L + (i - k)] * A[j * L + (j - k)];
      if (j === i) A[i * L] = Math.sqrt(Math.max(s, 1e-300));
      else A[i * L + (i - j)] = s / A[j * L];
    }
  }
}
function resoudreBande(n, bw, A, b) {
  const L = bw + 1, y = Float64Array.from(b);
  for (let i = 0; i < n; i++) {
    let s = y[i];
    for (let k = Math.max(0, i - bw); k < i; k++) s -= A[i * L + (i - k)] * y[k];
    y[i] = s / A[i * L];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k <= Math.min(n - 1, i + bw); k++) s -= A[k * L + (k - i)] * y[k];
    y[i] = s / A[i * L];
  }
  return y;
}

/**
 * Replace les sommets de la zone sur la surface bi-harmonique prolongeant le pelage voisin.
 * @param {Float32Array} positions positions (modifiées en place)
 * @param {Float32Array} normals normales (modifiées en place)
 * @param {Uint32Array|Uint16Array} indices triangles
 * @param {Uint8Array} zone 1 = sommet libre (doublons de couture : un seul suffit)
 * @param {object} [o] { anneaux = 3, rayon } anneaux de fondu des normales ; rayon du lissage de la courbure cible
 *   (unités des positions ; par défaut 4 × la longueur médiane des arêtes de la zone)
 */
export function effacerReliefPlaques(positions, normals, indices, zone, { anneaux = 3, rayon = 0 } = {}) {
  const t0 = Date.now();
  const P = positions, I = indices, nv = P.length / 3;
  const { weld, ng, deb, vois } = souder(P, I);
  const X = new Float64Array(ng * 3), X0 = new Float64Array(ng * 3), libre = new Uint8Array(ng), rep = new Int32Array(ng).fill(-1);
  for (let v = 0; v < nv; v++) {
    const g = weld[v];
    if (zone[v]) libre[g] = 1;
    if (rep[g] < 0) { rep[g] = v; X[g * 3] = P[v * 3]; X[g * 3 + 1] = P[v * 3 + 1]; X[g * 3 + 2] = P[v * 3 + 2]; }
  }
  X0.set(X);
  const W = poidsVCM(P, I, weld, deb, vois, rep);
  const somW = new Float64Array(ng);
  for (let g = 0; g < ng; g++) for (let k = deb[g]; k < deb[g + 1]; k++) somW[g] += W[k];
  // Coordonnées laplaciennes d'origine δ0 = x - Σ w x_j / Σ w.
  const delta0 = new Float64Array(ng * 3);
  for (let g = 0; g < ng; g++) {
    if (!(somW[g] > 0)) continue;
    let sx = 0, sy = 0, sz = 0;
    for (let k = deb[g]; k < deb[g + 1]; k++) { const q = vois[k]; sx += W[k] * X0[q * 3]; sy += W[k] * X0[q * 3 + 1]; sz += W[k] * X0[q * 3 + 2]; }
    delta0[g * 3] = X0[g * 3] - sx / somW[g]; delta0[g * 3 + 1] = X0[g * 3 + 1] - sy / somW[g]; delta0[g * 3 + 2] = X0[g * 3 + 2] - sz / somW[g];
  }
  // Rayon du lissage : 4 × longueur médiane des arêtes de la zone (indépendant de l'échelle).
  if (!(rayon > 0)) {
    const aretes = [];
    for (let g = 0; g < ng; g++) if (libre[g]) for (let k = deb[g]; k < deb[g + 1]; k++) { const q = vois[k]; aretes.push(Math.hypot(X0[q * 3] - X0[g * 3], X0[q * 3 + 1] - X0[g * 3 + 1], X0[q * 3 + 2] - X0[g * 3 + 2])); }
    aretes.sort((a, b) => a - b);
    rayon = 4 * (aretes[aretes.length >> 1] || 0);
  }
  // Normales soudées d'origine (contrôle d'orientation du lissage).
  const nG = new Float64Array(ng * 3);
  for (let v = 0; v < nv; v++) { const g = weld[v]; nG[g * 3] += normals[v * 3]; nG[g * 3 + 1] += normals[v * 3 + 1]; nG[g * 3 + 2] += normals[v * 3 + 2]; }
  // Cible δ dans la zone : moyenne gaussienne (σ = rayon / 2) des δ0 voisins de même orientation.
  const cs = rayon, cles = new Map(), cle = (a, b, c) => `${a},${b},${c}`;
  for (let g = 0; g < ng; g++) { const k = cle(Math.floor(X0[g * 3] / cs), Math.floor(X0[g * 3 + 1] / cs), Math.floor(X0[g * 3 + 2] / cs)); let l = cles.get(k); if (!l) cles.set(k, (l = [])); l.push(g); }
  const delta = Float64Array.from(delta0), s2 = 2 * (rayon / 2) ** 2;
  for (let g = 0; g < ng; g++) {
    if (!libre[g]) continue;
    const ix = Math.floor(X0[g * 3] / cs), iy = Math.floor(X0[g * 3 + 1] / cs), iz = Math.floor(X0[g * 3 + 2] / cs);
    let sw = 0, sx = 0, sy = 0, sz = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = cles.get(cle(ix + a, iy + b, iz + c));
      if (!l) continue;
      for (const q of l) {
        const d2 = (X0[q * 3] - X0[g * 3]) ** 2 + (X0[q * 3 + 1] - X0[g * 3 + 1]) ** 2 + (X0[q * 3 + 2] - X0[g * 3 + 2]) ** 2;
        if (d2 > rayon * rayon) continue;
        if (nG[q * 3] * nG[g * 3] + nG[q * 3 + 1] * nG[g * 3 + 1] + nG[q * 3 + 2] * nG[g * 3 + 2] < 0) continue;
        const w = Math.exp(-d2 / s2);
        sw += w; sx += w * delta0[q * 3]; sy += w * delta0[q * 3 + 1]; sz += w * delta0[q * 3 + 2];
      }
    }
    if (sw > 0) { delta[g * 3] = sx / sw; delta[g * 3 + 1] = sy / sw; delta[g * 3 + 2] = sz / sw; }
  }
  // Composantes connexes de la zone.
  const comp = new Int32Array(ng).fill(-1), comps = [];
  for (let g = 0; g < ng; g++) {
    if (!libre[g] || comp[g] >= 0) continue;
    const l = [g];
    comp[g] = comps.length;
    for (let t = 0; t < l.length; t++) for (let k = deb[l[t]]; k < deb[l[t] + 1]; k++) { const q = vois[k]; if (libre[q] && comp[q] < 0) { comp[q] = comps.length; l.push(q); } }
    comps.push(l);
  }
  const statsComp = [];
  for (let c = 0; c < comps.length; c++) {
    const F = comps[c], n = F.length;
    if (n < 4) continue;
    const loc = new Map();
    F.forEach((g, k) => loc.set(g, k));
    // Lignes de l'énergie : sommets libres et leur premier anneau. Ligne i : x_i - moyenne pondérée(voisins) - δ_i.
    const lignes = new Set(F);
    for (const g of F) for (let k = deb[g]; k < deb[g + 1]; k++) lignes.add(vois[k]);
    const entrees = [], fixes = [];
    for (const i of lignes) {
      const d = somW[i];
      if (!(d > 0)) continue;
      const e = [], f = [-delta[i * 3], -delta[i * 3 + 1], -delta[i * 3 + 2]];
      const ajoute = (g, a) => {
        const k = loc.get(g);
        if (k !== undefined) e.push(k, a);
        else { f[0] += a * X[g * 3]; f[1] += a * X[g * 3 + 1]; f[2] += a * X[g * 3 + 2]; }
      };
      ajoute(i, 1);
      for (let k = deb[i]; k < deb[i + 1]; k++) if (W[k] > 0) ajoute(vois[k], -W[k] / d);
      if (e.length) { entrees.push(e); fixes.push(f); }
    }
    // Graphe de M = AᵀA (sommets partageant une ligne) puis renumérotation.
    const adjS = Array.from({ length: n }, () => new Set());
    for (const e of entrees) for (let a = 0; a < e.length; a += 2) for (let b = 0; b < e.length; b += 2) if (a !== b) adjS[e[a]].add(e[b]);
    const perm = rcm(n, adjS.map((s) => [...s]));
    let bw = 0;
    for (let k = 0; k < n; k++) for (const q of adjS[k]) bw = Math.max(bw, Math.abs(perm[k] - perm[q]));
    const Lb = bw + 1, A = new Float64Array(n * Lb), B = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    entrees.forEach((e, r) => {
      const f = fixes[r];
      for (let a = 0; a < e.length; a += 2) {
        const pa = perm[e[a]], va = e[a + 1];
        for (let d = 0; d < 3; d++) B[d][pa] -= va * f[d];
        for (let b = 0; b < e.length; b += 2) {
          const pb = perm[e[b]];
          if (pb > pa) continue;
          A[pa * Lb + (pa - pb)] += va * e[b + 1];
        }
      }
    });
    let tr = 0;
    for (let k = 0; k < n; k++) tr += A[k * Lb];
    for (let k = 0; k < n; k++) A[k * Lb] += (tr / n) * 1e-10;
    choleskyBande(n, bw, A);
    const sol = B.map((b) => resoudreBande(n, bw, A, b));
    for (let k = 0; k < n; k++) for (let d = 0; d < 3; d++) X[F[k] * 3 + d] = sol[d][perm[k]];
    statsComp.push({ sommets: n, bande: bw });
  }
  // Positions : tous les doublons d'un sommet soudé libre.
  for (let v = 0; v < nv; v++) {
    const g = weld[v];
    if (libre[g]) { P[v * 3] = X[g * 3]; P[v * 3 + 1] = X[g * 3 + 1]; P[v * 3 + 2] = X[g * 3 + 2]; }
  }
  // Anneaux autour de la zone (fondu des normales).
  const anneau = new Int32Array(ng).fill(-1);
  let front = [];
  for (let g = 0; g < ng; g++) if (libre[g]) { anneau[g] = 0; front.push(g); }
  for (let r = 1; r <= anneaux; r++) {
    const nx = [];
    for (const g of front) for (let k = deb[g]; k < deb[g + 1]; k++) { const q = vois[k]; if (anneau[q] < 0) { anneau[q] = r; nx.push(q); } }
    front = nx;
  }
  // Normales : faces voisines pondérées par l'aire.
  const acc = new Float64Array(ng * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (anneau[weld[a]] < 0 && anneau[weld[b]] < 0 && anneau[weld[c]] < 0) continue;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { const g = weld[v]; acc[g * 3] += fx; acc[g * 3 + 1] += fy; acc[g * 3 + 2] += fz; }
  }
  for (let v = 0; v < nv; v++) {
    const g = weld[v], r = anneau[g];
    if (r < 0) continue;
    const l = Math.hypot(acc[g * 3], acc[g * 3 + 1], acc[g * 3 + 2]) || 1;
    const k = r === 0 ? 1 : 1 - r / (anneaux + 1);
    const nx = normals[v * 3] * (1 - k) + (acc[g * 3] / l) * k, ny = normals[v * 3 + 1] * (1 - k) + (acc[g * 3 + 1] / l) * k, nz = normals[v * 3 + 2] * (1 - k) + (acc[g * 3 + 2] / l) * k;
    const l2 = Math.hypot(nx, ny, nz) || 1;
    normals[v * 3] = nx / l2; normals[v * 3 + 1] = ny / l2; normals[v * 3 + 2] = nz / l2;
  }
  // Bilan : déplacement (total, selon la normale d'origine, tangentiel) des sommets libres.
  let nLib = 0, dMax = 0, dMoy = 0, nMax = 0, tMax = 0, tMoy = 0;
  for (let g = 0; g < ng; g++) {
    if (!libre[g]) continue;
    const v = rep[g], dx = X[g * 3] - X0[g * 3], dy = X[g * 3 + 1] - X0[g * 3 + 1], dz = X[g * 3 + 2] - X0[g * 3 + 2];
    const d = Math.hypot(dx, dy, dz);
    // Normale d'origine du sommet représentant (avant fondu : on relit la direction recalculée, suffisante ici).
    const nn = Math.abs(dx * normals[v * 3] + dy * normals[v * 3 + 1] + dz * normals[v * 3 + 2]);
    const tg = Math.sqrt(Math.max(0, d * d - nn * nn));
    nLib++; dMoy += d; tMoy += tg;
    dMax = Math.max(dMax, d); nMax = Math.max(nMax, nn); tMax = Math.max(tMax, tg);
  }
  // Faces de la zone contredisant leurs normales de sommet après coup.
  let contre = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!(libre[weld[a]] || libre[weld[b]] || libre[weld[c]])) continue;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = normals[a * 3] + normals[b * 3] + normals[c * 3], ny = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1], nz = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) contre++;
  }
  return {
    sommetsLibres: nLib, composantes: statsComp, rayonCourbure: rayon,
    deplacement: { moyen: dMoy / Math.max(1, nLib), max: dMax, normalMax: nMax, tangentielMoyen: tMoy / Math.max(1, nLib), tangentielMax: tMax },
    facesContreNormalesZone: contre, tempsMs: Date.now() - t0,
  };
}
