// Bocage normand : parcelles de champs et haies générées de façon déterministe.
import { mulberry32, polyDist } from '../core/math.js';
import { WORLD, PATHS, isReserved, forestDensity } from './layout.js';

const CELL = 82;

export const FIELD_TYPES = {
  grass: ['#6f9e4f', '#77a653', '#679849', '#80ad5b'],
  lightgrass: ['#8db863', '#93bd68'],
  wheat: ['#d3bf78', '#cdb56a'],
  plowed: ['#8f7253', '#84694b'],
  colza: ['#dcc843', '#e2d052'],
  orchard: ['#73a252'],
};

let cache = null;

export function getFields() {
  if (cache) return cache;
  const rnd = mulberry32(4242);
  const n = Math.ceil(WORLD.size / CELL) + 1;
  const corners = [];
  for (let j = 0; j <= n; j++) {
    corners[j] = [];
    for (let i = 0; i <= n; i++) {
      const edge = i === 0 || j === 0 || i === n || j === n;
      const jx = edge ? 0 : (rnd() - 0.5) * 36;
      const jz = edge ? 0 : (rnd() - 0.5) * 36;
      corners[j][i] = [-WORLD.half + i * CELL + jx, -WORLD.half + j * CELL + jz];
    }
  }
  const fields = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const poly = [corners[j][i], corners[j][i + 1], corners[j + 1][i + 1], corners[j + 1][i]];
      const cx = (poly[0][0] + poly[1][0] + poly[2][0] + poly[3][0]) / 4;
      const cz = (poly[0][1] + poly[1][1] + poly[2][1] + poly[3][1]) / 4;
      const r = rnd();
      let type = 'grass';
      if (r > 0.5) type = 'lightgrass';
      if (r > 0.64) type = 'wheat';
      if (r > 0.78) type = 'plowed';
      if (r > 0.86) type = 'colza';
      if (r > 0.92) type = 'orchard';
      const palette = FIELD_TYPES[type];
      fields.push({ poly, cx, cz, type, color: palette[Math.floor(rnd() * palette.length)], reserved: isReserved(cx, cz, 0) || forestDensity(cx, cz) > 0.4 });
    }
  }
  // Haies le long des bords de parcelles.
  const hedges = [];
  const seen = new Set();
  const addEdge = (a, b, key) => {
    if (seen.has(key)) return;
    seen.add(key);
    if (rnd() > 0.62) return;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(2, Math.floor(len / 4));
    const gapAt = rnd() < 0.7 ? 0.2 + rnd() * 0.6 : -1;
    let run = null;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      const inGap = gapAt >= 0 && Math.abs(t - gapAt) * len < 4.5;
      const ok = !inGap && !isReserved(x, z, 3) && forestDensity(x, z) < 0.3;
      if (ok) {
        if (!run) run = { a: [x, z], b: [x, z] };
        else run.b = [x, z];
      } else if (run) {
        if (Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]) > 8) hedges.push(run);
        run = null;
      }
    }
    if (run && Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]) > 8) hedges.push(run);
  };
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      if (i < n) addEdge(corners[j][i], corners[j][i + 1], `h${i},${j}`);
      if (j < n) addEdge(corners[j][i], corners[j + 1][i], `v${i},${j}`);
    }
  }
  cache = { fields, hedges };
  return cache;
}

// Chemins de terre (PATHS) : vrai à moins de r mètres de l'axe d'un chemin.
export function nearPath(x, z, r = 5) {
  for (const p of PATHS) if (polyDist(x, z, p).d < r) return true;
  return false;
}

// Tronçons [x0, z0, x1, z1] de la haie a→b hors des trouées ouvertes par les chemins de terre qui la traversent
// (cheval et cavalier passent) : échantillonnage au mètre, tronçons de moins de 3 m ignorés.
export function hedgeRuns(a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(len));
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const runs = [];
  let start = -1;
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const [x, z] = at(t);
    const ok = !nearPath(x, z);
    if (ok && start < 0) start = t;
    if (start >= 0 && (!ok || s === n)) {
      const end = ok ? t : (s - 1) / n;
      if ((end - start) * len >= 3) runs.push([...at(start), ...at(end)]);
      start = -1;
    }
  }
  return runs;
}
