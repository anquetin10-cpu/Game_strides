// Extraction de surface « surface nets » sur bande étroite (grille fine évaluée seulement près de la surface),
// sommets projetés sur la surface exacte du champ.

export function meshSDF(ev, bb, h, { coarse = 4, project = 2, log = () => {} } = {}) {
  const pad = 3 * h;
  const ox = bb[0] - pad, oy = bb[1] - pad, oz = bb[2] - pad;
  const nx = Math.ceil((bb[3] - bb[0] + 2 * pad) / h / coarse) * coarse + 1;
  const ny = Math.ceil((bb[4] - bb[1] + 2 * pad) / h / coarse) * coarse + 1;
  const nz = Math.ceil((bb[5] - bb[2] + 2 * pad) / h / coarse) * coarse + 1;
  const C = coarse;
  const cx = (nx - 1) / C + 1, cy = (ny - 1) / C + 1, cz = (nz - 1) / C + 1;
  const H = h * C;
  // 1) grille grossière
  const cv = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) cv[i + cx * (j + cy * k)] = ev.eval(ox + i * H, oy + j * H, oz + k * H);
  // 2) cellules grossières actives (la surface peut les traverser)
  const thr = 1.8 * H * Math.sqrt(3);
  const active = [];
  for (let k = 0; k < cz - 1; k++) for (let j = 0; j < cy - 1; j++) for (let i = 0; i < cx - 1; i++) {
    let mn = Infinity;
    for (let c = 0; c < 8; c++) mn = Math.min(mn, Math.abs(cv[i + (c & 1) + cx * (j + ((c >> 1) & 1) + cy * (k + (c >> 2)))]));
    if (mn < thr) active.push(i, j, k);
  }
  log(`grille ${nx}x${ny}x${nz}, cellules actives ${active.length / 3}`);
  // 3) grille fine dans les cellules actives
  const N = nx * ny * nz;
  const fv = new Float32Array(N).fill(NaN);
  const at = (i, j, k) => i + nx * (j + ny * k);
  let evals = 0;
  for (let a = 0; a < active.length; a += 3) {
    const i0 = active[a] * C, j0 = active[a + 1] * C, k0 = active[a + 2] * C;
    for (let k = k0; k <= k0 + C; k++) for (let j = j0; j <= j0 + C; j++) for (let i = i0; i <= i0 + C; i++) {
      const id = at(i, j, k);
      if (Number.isNaN(fv[id])) {
        fv[id] = ev.eval(ox + i * h, oy + j * h, oz + k * h);
        evals++;
      }
    }
  }
  log(`évaluations fines ${evals}`);
  // 4) un sommet par cellule fine traversée
  const vmap = new Map();
  const P = [];
  const cellVert = (i, j, k) => {
    const id = at(i, j, k);
    let v = vmap.get(id);
    if (v !== undefined) return v;
    // moyenne des intersections d'arêtes
    let sx = 0, sy = 0, sz = 0, n = 0;
    const val = (c) => fv[at(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of E) {
      const va = val(a), vb = val(b);
      if (Number.isNaN(va) || Number.isNaN(vb)) continue;
      if ((va < 0) !== (vb < 0)) {
        const t = va / (va - vb);
        const ax = (a & 1), ay = (a >> 1) & 1, az = a >> 2;
        const bx = (b & 1), by = (b >> 1) & 1, bz = b >> 2;
        sx += ax + (bx - ax) * t;
        sy += ay + (by - ay) * t;
        sz += az + (bz - az) * t;
        n++;
      }
    }
    if (!n) {
      sx = sy = sz = 0.5;
      n = 1;
    }
    let px = ox + (i + sx / n) * h, py = oy + (j + sy / n) * h, pz = oz + (k + sz / n) * h;
    const bx = px, by = py, bz = pz;
    for (let it = 0; it < project; it++) {
      const d = ev.eval(px, py, pz);
      const g = ev.grad(px, py, pz, h * 0.25);
      px -= d * g[0];
      py -= d * g[1];
      pz -= d * g[2];
    }
    // limiter le déplacement (évite les replis près des arêtes vives)
    const mx = px - bx, my = py - by, mz = pz - bz;
    const ml = Math.hypot(mx, my, mz);
    if (ml > h * 1.2) {
      const s = (h * 1.2) / ml;
      px = bx + mx * s;
      py = by + my * s;
      pz = bz + mz * s;
    }
    v = P.length / 3;
    P.push(px, py, pz);
    vmap.set(id, v);
    return v;
  };
  // 5) quads pour chaque arête fine traversée
  const T = [];
  const quad = (a, b, c, d) => {
    // diagonale la plus courte
    const dist = (u, w) => Math.hypot(P[u * 3] - P[w * 3], P[u * 3 + 1] - P[w * 3 + 1], P[u * 3 + 2] - P[w * 3 + 2]);
    if (dist(a, c) < dist(b, d)) T.push(a, b, c, a, c, d);
    else T.push(a, b, d, b, c, d);
  };
  for (let a = 0; a < active.length; a += 3) {
    const i0 = active[a] * C, j0 = active[a + 1] * C, k0 = active[a + 2] * C;
    for (let k = k0; k < k0 + C; k++) for (let j = j0; j < j0 + C; j++) for (let i = i0; i < i0 + C; i++) {
      const v0 = fv[at(i, j, k)];
      if (Number.isNaN(v0)) continue;
      const in0 = v0 < 0;
      // arête x
      const vx = fv[at(i + 1, j, k)];
      if (!Number.isNaN(vx) && in0 !== vx < 0 && j > 0 && k > 0) {
        const c00 = cellVert(i, j - 1, k - 1), c10 = cellVert(i, j, k - 1), c11 = cellVert(i, j, k), c01 = cellVert(i, j - 1, k);
        if (in0) quad(c00, c10, c11, c01);
        else quad(c00, c01, c11, c10);
      }
      const vy = fv[at(i, j + 1, k)];
      if (!Number.isNaN(vy) && in0 !== vy < 0 && i > 0 && k > 0) {
        const c00 = cellVert(i - 1, j, k - 1), c10 = cellVert(i, j, k - 1), c11 = cellVert(i, j, k), c01 = cellVert(i - 1, j, k);
        if (in0) quad(c00, c01, c11, c10);
        else quad(c00, c10, c11, c01);
      }
      const vz = fv[at(i, j, k + 1)];
      if (!Number.isNaN(vz) && in0 !== vz < 0 && i > 0 && j > 0) {
        const c00 = cellVert(i - 1, j - 1, k), c10 = cellVert(i, j - 1, k), c11 = cellVert(i, j, k), c01 = cellVert(i - 1, j, k);
        if (in0) quad(c00, c10, c11, c01);
        else quad(c00, c01, c11, c10);
      }
    }
  }
  log(`surface : ${P.length / 3} sommets, ${T.length / 3} triangles`);
  return { pos: new Float32Array(P), idx: new Uint32Array(T) };
}
