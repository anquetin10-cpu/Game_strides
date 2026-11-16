// Contact entre un membre visible du cheval et une barre de CSO (géométrie seule, sans dépendance au rendu).
// Une barre est un cylindre de rayon RAIL_R (world/builders.js railGeo) d'axe horizontal le long de l'obstacle (axe t),
// centré à (s = bar.s, y = sol + bar.h), sur la largeur o.w. Un segment de membre est une capsule [a, b] de rayon r
// (canon, paturon et sabot). Comme l'axe de la barre est parallèle à t, la distance entre la capsule et l'axe se lit
// dans le plan (s, y) de l'obstacle, au point du segment le plus proche ; ce point doit être dans la largeur de la barre.
// Balayage : entre deux images, la capsule est interpolée en `steps` positions, pour ne pas manquer un sabot rapide
// qui traverse la barre d'une image à l'autre.

export const RAIL_R = 0.05;

// Coordonnées d'un point monde dans le repère de l'obstacle : s (le long de l'axe de saut n), u (le long des barres t),
// y (au-dessus du sol de l'obstacle).
export function toLocal(o, p) {
  const dx = p.x - o.x, dz = p.z - o.z;
  return { s: dx * o.n.x + dz * o.n.z, u: dx * o.t.x + dz * o.t.z, y: p.y - o.ground };
}

// Distance (m) entre l'axe de la barre et le segment local [a, b], avec la position u du point le plus proche.
export function segAxis(a, b, bar) {
  const ds = b.s - a.s, dy = b.y - a.y;
  const L2 = ds * ds + dy * dy;
  let k = L2 > 1e-12 ? ((bar.s - a.s) * ds + (bar.h - a.y) * dy) / L2 : 0;
  k = Math.max(0, Math.min(1, k));
  const s = a.s + ds * k, y = a.y + dy * k, u = a.u + (b.u - a.u) * k;
  return { dist: Math.hypot(s - bar.s, y - bar.h), u, k };
}

// Contact d'une capsule de rayon r avec la barre : pénétration (m, > 0 si contact) ou null hors de la largeur.
export function capsuleRail(a, b, r, bar, halfW) {
  const q = segAxis(a, b, bar);
  if (Math.abs(q.u) > halfW + r) return null;
  return { depth: r + RAIL_R - q.dist, dist: q.dist, u: q.u };
}

// Balayage entre la capsule de l'image précédente [a0, b0] et celle de cette image [a1, b1] (points locaux).
// Renvoie le contact le plus profond (depth > 0) ou null.
export function sweepRail(a0, b0, a1, b1, r, bar, halfW, steps = 6) {
  let best = null;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = { s: a0.s + (a1.s - a0.s) * t, u: a0.u + (a1.u - a0.u) * t, y: a0.y + (a1.y - a0.y) * t };
    const b = { s: b0.s + (b1.s - b0.s) * t, u: b0.u + (b1.u - b0.u) * t, y: b0.y + (b1.y - b0.y) * t };
    const c = capsuleRail(a, b, r, bar, halfW);
    if (c && c.depth > 0 && (!best || c.depth > best.depth)) best = { ...c, t };
  }
  return best;
}
