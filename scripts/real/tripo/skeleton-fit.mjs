// Cheval Tripo (essai) : redressement de la tête et squelette du jeu placé dans l'anatomie du modèle.
//
// Le squelette est celui du cheval du jeu (src/entities/horse/skeleton.js) : mêmes 50 os, mêmes noms, même ordre,
// même hiérarchie, rotations de repos nulles. Seules les positions de repos changent : elles suivent l'anatomie du
// modèle Tripo calé en mètres (frame.mjs). Les animations du jeu (rotations locales) s'y appliquent donc telles quelles.
//
// Positions :
//   - membres : articulations mesurées sur des coupes horizontales de chaque membre (intersection triangle/plan) :
//     sabot (y = 0,075), boulet (largeur maximale entre 0,15 et 0,28 m), genou (largeur maximale entre 0,42 et
//     0,62 m), coude (axe de l'avant-bras prolongé jusqu'au tronc), jarret (sous la pointe du jarret, aux 2/5 de la
//     profondeur depuis l'avant), grasset (axe de la jambe prolongé, en avant de la cuisse) ;
//   - tronc, encolure, queue : positions du cheval du jeu recalées sur la silhouette du modèle (lignes du dos et du
//     ventre mesurées sur les deux) ;
//   - tête (après redressement) : nuque, base des oreilles, mâchoire et yeux mesurés sur la géométrie.
import { BONES } from '../../../src/entities/horse/skeleton.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- Coupes horizontales ----------
// Points d'intersection des triangles avec le plan y = h : [[x, z], ...].
export function contour(P, I, h) {
  const out = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ya = P[a * 3 + 1], yb = P[b * 3 + 1], yc = P[c * 3 + 1];
    if (Math.min(ya, yb, yc) > h || Math.max(ya, yb, yc) < h) continue;
    for (const [u, v, yu, yv] of [[a, b, ya, yb], [b, c, yb, yc], [c, a, yc, ya]]) {
      if ((yu - h) * (yv - h) > 0 || yu === yv) continue;
      const s = (h - yu) / (yv - yu);
      out.push([P[u * 3] + s * (P[v * 3] - P[u * 3]), P[u * 3 + 2] + s * (P[v * 3 + 2] - P[u * 3 + 2])]);
    }
  }
  return out;
}

// Grappes 2D (cellules de 2 cm, voisinage 8).
function groups(pts) {
  const cell = (x) => Math.floor(x / 0.02);
  const grid = new Map();
  pts.forEach((p, i) => {
    const k = `${cell(p[0])},${cell(p[1])}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const lab = new Int32Array(pts.length).fill(-1);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (lab[i] >= 0) continue;
    const st = [i];
    lab[i] = out.length;
    const g = [];
    while (st.length) {
      const a = st.pop();
      g.push(pts[a]);
      const cx = cell(pts[a][0]), cz = cell(pts[a][1]);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(`${cx + dx},${cz + dz}`) || []) if (lab[j] < 0) {
        lab[j] = out.length;
        st.push(j);
      }
    }
    out.push(g);
  }
  return out;
}

// Échantillons par membre : { AG|AD|PG|PD: [{ y, cx, cz, w, d, zf, zb }] } (un par hauteur).
const LEG_GUESS = { AG: [0.15, 0.64], AD: [-0.15, 0.64], PG: [0.25, -0.72], PD: [-0.25, -0.72] };
export function legSamples(P, I, y0 = 0.02, y1 = 0.96, dy = 0.01) {
  const res = { AG: [], AD: [], PG: [], PD: [] };
  for (let y = y0; y <= y1 + 1e-9; y += dy) {
    const best = {};
    for (const g of groups(contour(P, I, y))) {
      if (g.length < 6) continue;
      const xs = g.map((p) => p[0]), zs = g.map((p) => p[1]);
      const xmin = Math.min(...xs), xmax = Math.max(...xs), zmin = Math.min(...zs), zmax = Math.max(...zs);
      const cx = (xmin + xmax) / 2, cz = (zmin + zmax) / 2;
      if (xmax - xmin > 0.4) continue; // tronc entier
      if (Math.abs(cx) < 0.08 && cz < -0.85) continue; // queue
      let k = null, bd = 1e9;
      for (const [n, [ex, ez]] of Object.entries(LEG_GUESS)) {
        if (Math.sign(cx) !== Math.sign(ex)) continue;
        const dd = Math.hypot(cz - ez, (cx - ex) * 0.5);
        if (dd < bd) {
          bd = dd;
          k = n;
        }
      }
      if (!k || bd > 0.45) continue;
      const s = { y: +y.toFixed(3), cx, cz, w: xmax - xmin, d: zmax - zmin, zf: zmax, zb: zmin };
      if (!best[k] || best[k].d < s.d) best[k] = s;
    }
    for (const [k, s] of Object.entries(best)) res[k].push(s);
  }
  return res;
}

const at = (S, y) => S.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
// Lissage (moyenne glissante sur 3 échantillons) d'une grandeur.
const sm = (S, i, key) => {
  let s = 0, n = 0;
  for (let k = Math.max(0, i - 1); k <= Math.min(S.length - 1, i + 1); k++) {
    s += S[k][key];
    n++;
  }
  return s / n;
};
const argmaxIn = (S, ya, yb, key) => {
  let bi = -1, bv = -1e9;
  S.forEach((s, i) => {
    if (s.y < ya || s.y > yb) return;
    const v = sm(S, i, key);
    if (v > bv) {
      bv = v;
      bi = i;
    }
  });
  return S[bi];
};
// Droite des moindres carrés x(y), z(y) des centres entre ya et yb, évaluée en y.
function axisAt(S, ya, yb, y) {
  const pts = S.filter((s) => s.y >= ya && s.y <= yb);
  const n = pts.length, my = pts.reduce((a, s) => a + s.y, 0) / n;
  const fit = (k) => {
    const m = pts.reduce((a, s) => a + s[k], 0) / n;
    const num = pts.reduce((a, s) => a + (s.y - my) * (s[k] - m), 0), den = pts.reduce((a, s) => a + (s.y - my) ** 2, 0);
    return m + (num / den) * (y - my);
  };
  return [fit('cx'), y, fit('cz')];
}

// Articulations d'un membre (positions de repos en mètres).
export function fitLeg(S, front) {
  const hoof = at(S, 0.075);
  const fet = argmaxIn(S, 0.15, 0.28, 'w');
  const out = { H: [hoof.cx, 0.075, hoof.cz], P: [fet.cx, fet.y, fet.cz] };
  if (front) {
    const knee = argmaxIn(S, 0.42, 0.62, 'w');
    out.L = [knee.cx, knee.y, knee.cz];
    // Coude : axe de l'avant-bras (0,62–0,82 m) prolongé jusqu'à 0,92 m.
    out.U = axisAt(S, 0.62, 0.82, 0.92);
  } else {
    // Pointe du jarret : point le plus en arrière entre 0,48 et 0,72 m ; articulation 3 cm plus bas, aux 2/5 de la
    // profondeur depuis l'avant.
    let ph = null;
    for (const s of S) if (s.y >= 0.48 && s.y <= 0.72 && (!ph || s.zb < ph.zb)) ph = s;
    const hk = at(S, ph.y - 0.03);
    out.C = [hk.cx, hk.y, hk.zf + 0.4 * (hk.zb - hk.zf)];
    // Grasset : axe de la jambe (0,68–0,88 m) prolongé jusqu'à 0,37 m au-dessus du jarret, avancé de 6 cm (le grasset
    // est à l'avant de la cuisse).
    const ys = out.C[1] + 0.37;
    const a = axisAt(S, 0.68, 0.88, ys);
    out.L = [a[0], ys, a[2] + 0.06];
  }
  return out;
}

// ---------- Redressement de la tête ----------
// Le modèle Tripo a la tête tournée d'environ 19° vers sa gauche à partir de la nuque (encolure droite). On la
// tourne autour d'un axe vertical passant par la nuque, pour les points en avant du plan nuque–gorge (transition sur
// 10 cm) : forme intacte, seule la pose change. Renvoie l'angle appliqué et l'angle restant mesuré.
export const POLL = [0, 1.86, 1.22];
const THROAT = [0, 1.45, 1.15]; // gorge (bas de l'attache de la tête)
export function headYaw(P) {
  // Milieu en x des tranches de la tête (z de 1,30 à 1,54, au-dessus de 1,2 m), droite des moindres carrés x(z).
  const xs = [];
  for (let z = 1.3; z <= 1.541; z += 0.04) {
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 2] - z) < 0.01 && P[i + 1] > 1.2) {
      mn = Math.min(mn, P[i]);
      mx = Math.max(mx, P[i]);
    }
    xs.push([z, (mn + mx) / 2]);
  }
  const n = xs.length, mz = xs.reduce((a, p) => a + p[0], 0) / n, mxv = xs.reduce((a, p) => a + p[1], 0) / n;
  const slope = xs.reduce((a, p) => a + (p[0] - mz) * (p[1] - mxv), 0) / xs.reduce((a, p) => a + (p[0] - mz) ** 2, 0);
  return Math.atan(slope); // > 0 : tête tournée vers +x (gauche du cheval)
}
// Distance signée au plan nuque–gorge (positive en avant, côté tête), dans le plan sagittal.
export function headSide(y, z) {
  const dz = THROAT[2] - POLL[2], dy = THROAT[1] - POLL[1];
  const L = Math.hypot(dz, dy);
  const nz = -dy / L, ny = dz / L; // normale orientée vers l'avant
  return (z - POLL[2]) * nz + (y - POLL[1]) * ny;
}
export function straightenHead(P, N) {
  const ang = headYaw(P);
  for (let i = 0; i < P.length; i += 3) {
    const w = smooth(-0.06, 0.04, headSide(P[i + 1], P[i + 2]));
    if (w <= 0) continue;
    const cw = Math.cos(-ang * w), sw = Math.sin(-ang * w);
    const x = P[i] - POLL[0], z = P[i + 2] - POLL[2];
    P[i] = POLL[0] + x * cw + z * sw;
    P[i + 2] = POLL[2] - x * sw + z * cw;
    const nx = N[i], nz = N[i + 2];
    N[i] = nx * cw + nz * sw;
    N[i + 2] = -nx * sw + nz * cw;
  }
  return { angleDeg: +((ang * 180) / Math.PI).toFixed(2), checkDeg: +((headYaw(P) * 180) / Math.PI).toFixed(2) };
}

// ---------- Tête : oreilles, yeux ----------
function headLandmarks(P) {
  const ears = {};
  for (const side of [1, -1]) {
    let tip = null;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i + 2] < 1.1 || Math.sign(P[i]) !== side) continue;
      if (!tip || P[i + 1] > tip[1]) tip = [P[i], P[i + 1], P[i + 2]];
    }
    // Base : centre des points de l'oreille entre 0,13 et 0,10 m sous la pointe.
    let n = 0;
    const b = [0, 0, 0];
    for (let i = 0; i < P.length; i += 3) {
      const dy = tip[1] - P[i + 1];
      if (dy < 0.1 || dy > 0.13 || Math.hypot(P[i] - tip[0], P[i + 2] - tip[2]) > 0.09) continue;
      b[0] += P[i];
      b[1] += P[i + 1];
      b[2] += P[i + 2];
      n++;
    }
    ears[side] = { tip, base: b.map((v) => v / n) };
  }
  return ears;
}

// ---------- Squelette complet ----------
// Renvoie [{ name, parent, pos }] dans l'ordre de BONES, et le détail des mesures.
export function fitSkeleton(P, I) {
  const S = legSamples(P, I);
  const legs = { AG: fitLeg(S.AG, true), AD: fitLeg(S.AD, true), PG: fitLeg(S.PG, false), PD: fitLeg(S.PD, false) };
  const ears = headLandmarks(P);
  const pos = {};
  // Tronc, encolure, queue (x = 0) : positions du jeu recalées sur la silhouette (voir l'en-tête).
  Object.assign(pos, {
    root: [0, 0, 0],
    body: [0, 1.33, 0],
    breath: [0, 1.155, 0.08],
    loin: [0, 1.42, -0.27],
    pelvis: [0, 1.445, -0.5],
    tail: [0, 1.45, -0.93],
    tail2: [0, 1.39, -1.0],
    tail3: [0, 1.27, -1.04],
    tail4: [0, 1.11, -1.03],
    tail5: [0, 0.91, -1.02],
    tail6: [0, 0.68, -1.0],
    neck: [0, 1.29, 0.64],
    neck2: [0, 1.49, 0.88],
    neck3: [0, 1.67, 1.06],
    head: POLL.slice(),
    jaw: [0, 1.69, 1.25], // articulation temporo-mandibulaire : au niveau de l'œil, 12 cm en arrière
    maneA: [0, 1.66, 0.78],
    maneB: [0, 1.8, 1.0],
    saddle: [0, 1.61, -0.015],
    leadAnchor: [0, 1.43, 1.3],
    reinL: [0.07, 1.78, 0.52],
    reinR: [-0.07, 1.78, 0.52],
    stirL: [0.27, 0.98, 0.25],
    stirR: [-0.27, 0.98, 0.25],
    earL: ears[1].base,
    earR: ears[-1].base,
    lidL: [0.095, 1.66, 1.37], // centre des yeux (mesuré sur les vues de contrôle)
    lidR: [-0.095, 1.66, 1.37],
  });
  // Membres : articulations mesurées ; épaule et omoplate, hanche : positions du jeu recalées (même côté).
  for (const [k, s, f] of [['AG', 'l', true], ['AD', 'r', true], ['PG', 'l', false], ['PD', 'r', false]]) {
    const L = legs[k];
    const sx = s === 'l' ? 1 : -1;
    if (f) {
      pos[`f${s}Sc`] = [0.17 * sx, 1.43, 0.5];
      pos[`f${s}Hu`] = [0.18 * sx, 1.14, 0.72];
      pos[`f${s}U`] = L.U;
      pos[`f${s}L`] = L.L;
      pos[`f${s}P`] = L.P;
      pos[`f${s}H`] = L.H;
    } else {
      pos[`h${s}U`] = [0.21 * sx, 1.2, -0.7];
      pos[`h${s}L`] = L.L;
      pos[`h${s}C`] = L.C;
      pos[`h${s}P`] = L.P;
      pos[`h${s}H`] = L.H;
    }
  }
  const bones = BONES.map((b) => {
    if (!pos[b.name]) throw new Error(`os non placé : ${b.name}`);
    return { name: b.name, parent: b.parent, pos: pos[b.name].map((v) => +v.toFixed(4)) };
  });
  return { bones, legs, ears, samples: S };
}
