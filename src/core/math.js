export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const angleDiff = (from, to) => wrapAngle(to - from);
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
export const dist2 = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Distance from point P to segment AB. Returns distance, parameter t, and closest point.
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + dx * t;
  const z = az + dz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}

export function polyDist(px, pz, pts) {
  let best = { d: Infinity, t: 0, x: 0, z: 0, seg: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (r.d < best.d) {
      best = r;
      best.seg = i;
    }
  }
  return best;
}

// Signed-ish distance to a rounded rectangle centred at (cx,cz) with half sizes hw,hd and rotation rot.
export function rectDist(px, pz, cx, cz, hw, hd, rot = 0, radius = 0) {
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const lx = (px - cx) * c - (pz - cz) * s;
  const lz = (px - cx) * s + (pz - cz) * c;
  const qx = Math.abs(lx) - hw + radius;
  const qz = Math.abs(lz) - hd + radius;
  const ox = Math.max(qx, 0);
  const oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0) - radius;
}

export function polylineLength(pts) {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return l;
}

// Point at distance s along polyline (clamped). Returns {x,z,dir}.
export function pointAlong(pts, s) {
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const l = Math.hypot(bx - ax, bz - az);
    if (s <= l || i === pts.length - 2) {
      const t = l > 0 ? clamp(s / l, 0, 1) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dir: Math.atan2(bx - ax, bz - az) };
    }
    s -= l;
  }
  return { x: pts[0][0], z: pts[0][1], dir: 0 };
}

// Nombre à virgule (français) : 4.9 → « 4,9 ».
export const dec = (n, k = 1) => n.toFixed(k).replace('.', ',');
export const formatMoney = (v) => `${Math.round(v).toLocaleString('fr-FR')} €`;
export const formatTime = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const c = Math.floor((s * 10) % 10);
  return `${m}:${String(r).padStart(2, '0')}.${c}`;
};
export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
