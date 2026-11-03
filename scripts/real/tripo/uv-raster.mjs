// Rastérisation d'un maillage dans l'espace UV : pour chaque texel, triangle, position 3D et normale
// interpolées (barycentriques), puis propagation vers le plus proche texel couvert (marges des îlots UV).
// Convention glTF : u vers la droite, v vers le bas de l'image (pas d'inversion).

export function rasterizeUV({ positions, normals, uvs, indices }, W, H) {
  const N = W * H;
  const tri = new Int32Array(N).fill(-1);
  const pos = new Float32Array(N * 3);
  const nrm = new Float32Array(N * 3);
  const nt = indices.length / 3;
  for (let t = 0; t < nt; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    const ax = uvs[a * 2] * W, ay = uvs[a * 2 + 1] * H;
    const bx = uvs[b * 2] * W, by = uvs[b * 2 + 1] * H;
    const cx = uvs[c * 2] * W, cy = uvs[c * 2 + 1] * H;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const inv = 1 / area;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx) - 0.5));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 0.5));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy) - 0.5));
    const eps = -1e-7;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < eps || w1 < eps || w2 < eps) continue;
        const i = y * W + x;
        tri[i] = t;
        for (let d = 0; d < 3; d++) {
          pos[i * 3 + d] = w0 * positions[a * 3 + d] + w1 * positions[b * 3 + d] + w2 * positions[c * 3 + d];
          nrm[i * 3 + d] = w0 * normals[a * 3 + d] + w1 * normals[b * 3 + d] + w2 * normals[c * 3 + d];
        }
        const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
        nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
      }
    }
  }
  // Marges : parcours en largeur multi-sources (4-voisinage) → texel couvert le plus proche et distance.
  const src = new Int32Array(N).fill(-1);
  const dist = new Uint16Array(N).fill(65535);
  let queue = new Int32Array(N), qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (tri[i] >= 0) { src[i] = i; dist[i] = 0; queue[qt++] = i; }
  while (qh < qt) {
    const i = queue[qh++], x = i % W, d = dist[i] + 1;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i + W < N ? i + W : -1];
    for (const j of nb) if (j >= 0 && src[j] < 0) { src[j] = src[i]; dist[j] = d; queue[qt++] = j; }
  }
  queue = null;
  return { W, H, tri, pos, nrm, src, dist };
}

// Îlots UV (charts) : composantes connexes des texels couverts (8-voisinage). Retourne un label par texel
// couvert (-1 sinon) et, pour les texels de marge, le label de leur source.
export function labelCharts(R) {
  const { W, H, tri, src } = R, N = W * H;
  const lab = new Int32Array(N).fill(-1);
  const st = new Int32Array(N);
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (tri[i] < 0 || lab[i] >= 0) continue;
    let sp = 0; st[sp++] = i; lab[i] = n;
    while (sp) {
      const p = st[--sp], x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (tri[q] >= 0 && lab[q] < 0) { lab[q] = n; st[sp++] = q; }
      }
    }
    n++;
  }
  const full = new Int32Array(N);
  for (let i = 0; i < N; i++) full[i] = src[i] >= 0 ? lab[src[i]] : -1;
  return { chart: lab, chartFull: full, count: n };
}
