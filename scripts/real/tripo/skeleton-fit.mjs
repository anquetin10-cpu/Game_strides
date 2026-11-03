// Cheval Tripo (essai) : redressement de la tête et squelette du jeu placé dans l'anatomie du modèle.
//
// Le squelette est celui du cheval du jeu (src/entities/horse/skeleton.js) : mêmes 50 os, mêmes noms, même ordre,
// même hiérarchie, rotations de repos nulles. Seules les positions de repos changent : elles suivent l'anatomie du
// modèle Tripo calé en mètres (frame.mjs). Les animations du jeu (rotations locales) s'y appliquent donc telles quelles.
//
// Positions :
//   - membres : articulations mesurées sur des coupes horizontales de chaque membre (intersection triangle/plan,
//     points chaînés par les triangles) : sabot (y = 0,075), boulet (largeur maximale entre 0,15 et 0,28 m), genou
//     (largeur maximale entre 0,42 et 0,62 m), coude (axe de l'avant-bras prolongé jusqu'au tronc), jarret (sous la
//     pointe du jarret, aux 2/5 de la profondeur depuis l'avant), grasset (axe de la jambe prolongé, en avant de la
//     cuisse) ; extremums pris au centre de leur plateau ; chaque côté ajusté seul puis symétrisé (y et z moyennés,
//     x propre à chaque côté ; erreur au-delà de 1,5 cm d'écart gauche/droite) ;
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

// Coupes chaînées : les points d'intersection sont reliés par les triangles qu'ils traversent (arêtes des sommets
// soudés par position : les coutures UV ne coupent pas une coupe). Une grappe = une courbe fermée de la surface ; deux
// surfaces proches (jarret et crins de la queue) restent séparées quelle que soit la finesse du maillage.
export function sections(P, I, h, weld) {
  const idOf = new Map(), pts = [], parent = [];
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ya = P[a * 3 + 1], yb = P[b * 3 + 1], yc = P[c * 3 + 1];
    if (Math.min(ya, yb, yc) > h || Math.max(ya, yb, yc) < h) continue;
    const ids = [];
    for (const [u, v, yu, yv] of [[a, b, ya, yb], [b, c, yb, yc], [c, a, yc, ya]]) {
      if ((yu - h) * (yv - h) > 0 || yu === yv) continue;
      const wu = weld[u], wv = weld[v], key = wu < wv ? wu * 1e7 + wv : wv * 1e7 + wu;
      let id = idOf.get(key);
      if (id === undefined) {
        const s = (h - yu) / (yv - yu);
        id = pts.length;
        idOf.set(key, id);
        parent.push(id);
        pts.push([P[u * 3] + s * (P[v * 3] - P[u * 3]), P[u * 3 + 2] + s * (P[v * 3 + 2] - P[u * 3 + 2])]);
      }
      ids.push(id);
    }
    for (let k = 1; k < ids.length; k++) {
      const r1 = find(ids[0]), r2 = find(ids[k]);
      if (r1 !== r2) parent[r1] = r2;
    }
  }
  const g = new Map();
  pts.forEach((p, i) => {
    const r = find(i);
    if (!g.has(r)) g.set(r, []);
    g.get(r).push(p);
  });
  return [...g.values()];
}

// Soudure des sommets par position (1e-5 m).
function weldIndex(P) {
  const map = new Map(), weld = new Int32Array(P.length / 3);
  for (let i = 0; i < weld.length; i++) {
    const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
    if (!map.has(k)) map.set(k, map.size);
    weld[i] = map.get(k);
  }
  return weld;
}

// Échantillons par membre : { AG|AD|PG|PD: [{ y, cx, cz, w, d, zf, zb }] } (un par hauteur).
const LEG_GUESS = { AG: [0.15, 0.64], AD: [-0.15, 0.64], PG: [0.25, -0.72], PD: [-0.25, -0.72] };
export function legSamples(P, I, y0 = 0.02, y1 = 0.96, dy = 0.01) {
  const res = { AG: [], AD: [], PG: [], PD: [] };
  const weld = weldIndex(P);
  for (let y = y0; y <= y1 + 1e-9; y += dy) {
    const best = {};
    for (const g of sections(P, I, y, weld)) {
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

// Lissage (moyenne glissante sur 3 échantillons) d'une grandeur.
const sm = (S, i, key) => {
  let s = 0, n = 0;
  for (let k = Math.max(0, i - 1); k <= Math.min(S.length - 1, i + 1); k++) {
    s += S[k][key];
    n++;
  }
  return s / n;
};
// Échantillon interpolé à la hauteur y (entre les deux coupes voisines) ; erreur s'il manque une coupe à moins de
// 2 cm de part et d'autre (membre mal découpé) au lieu d'un résultat faux ou NaN.
function sampleAt(S, y, what) {
  let lo = null, hi = null;
  for (const s of S) {
    if (s.y <= y + 1e-9 && (!lo || s.y > lo.y)) lo = s;
    if (s.y >= y - 1e-9 && (!hi || s.y < hi.y)) hi = s;
  }
  if (!lo || !hi || y - lo.y > 0.02 || hi.y - y > 0.02) {
    throw new Error(`squelette : ${what} : pas de coupe du membre à moins de 2 cm de y = ${y.toFixed(3)} m`);
  }
  const t = hi.y > lo.y ? (y - lo.y) / (hi.y - lo.y) : 0;
  const o = { y };
  for (const k of ['cx', 'cz', 'w', 'd', 'zf', 'zb']) o[k] = lo[k] + t * (hi[k] - lo[k]);
  return o;
}
// Hauteur de l'extremum d'une grandeur lissée entre ya et yb (sign 1 : maximum, −1 : minimum) : barycentre du plateau
// (coupes contiguës à moins de tol de l'extremum, pondérées par leur marge) et non un argmax seul, mal conditionné
// sur un profil plat (boulet : largeur à ±1 mm sur 4 cm). Erreur s'il y a trop peu de coupes ou si le plateau touche
// un bord de la fenêtre (extremum hors de la fenêtre).
function plateauCentre(S, ya, yb, key, sign, what, tol = 0.002) {
  const R = [];
  S.forEach((s, i) => {
    if (s.y >= ya && s.y <= yb) R.push({ y: s.y, v: sign * sm(S, i, key) });
  });
  if (R.length < 5) throw new Error(`squelette : ${what} : ${R.length} coupe(s) entre ${ya} et ${yb} m (5 au moins)`);
  let im = 0;
  R.forEach((r, i) => {
    if (r.v > R[im].v) im = i;
  });
  const thr = R[im].v - tol;
  let a = im, b = im;
  while (a > 0 && R[a - 1].v >= thr) a--;
  while (b < R.length - 1 && R[b + 1].v >= thr) b++;
  if (a === 0 || b === R.length - 1) throw new Error(`squelette : ${what} : extremum au bord de la fenêtre ${ya}–${yb} m`);
  let sw = 0, sy = 0;
  for (let i = a; i <= b; i++) {
    sw += R[i].v - thr;
    sy += (R[i].v - thr) * R[i].y;
  }
  return sy / sw;
}
// Droite des moindres carrés x(y), z(y) des centres entre ya et yb, évaluée en y (3 coupes au moins, sinon erreur).
function axisAt(S, ya, yb, y, what) {
  const pts = S.filter((s) => s.y >= ya && s.y <= yb);
  if (pts.length < 3) throw new Error(`squelette : ${what} : ${pts.length} coupe(s) entre ${ya} et ${yb} m (3 au moins)`);
  const n = pts.length, my = pts.reduce((a, s) => a + s.y, 0) / n;
  const fit = (k) => {
    const m = pts.reduce((a, s) => a + s[k], 0) / n;
    const num = pts.reduce((a, s) => a + (s.y - my) * (s[k] - m), 0), den = pts.reduce((a, s) => a + (s.y - my) ** 2, 0);
    return m + (num / den) * (y - my);
  };
  return [fit('cx'), y, fit('cz')];
}

// Articulations d'un membre (positions de repos en mètres).
export function fitLeg(S, front, name = 'membre') {
  const hoof = sampleAt(S, 0.075, `${name}, sabot`);
  const fy = plateauCentre(S, 0.15, 0.28, 'w', 1, `${name}, boulet`);
  const fet = sampleAt(S, fy, `${name}, boulet`);
  const out = { H: [hoof.cx, 0.075, hoof.cz], P: [fet.cx, fy, fet.cz] };
  if (front) {
    const ky = plateauCentre(S, 0.42, 0.62, 'w', 1, `${name}, genou`);
    const knee = sampleAt(S, ky, `${name}, genou`);
    out.L = [knee.cx, ky, knee.cz];
    // Coude : axe de l'avant-bras (0,62–0,82 m) prolongé jusqu'à 0,92 m.
    out.U = axisAt(S, 0.62, 0.82, 0.92, `${name}, coude`);
  } else {
    // Pointe du jarret : point le plus en arrière entre 0,48 et 0,72 m (centre du plateau) ; articulation 3 cm plus
    // bas, aux 2/5 de la profondeur depuis l'avant.
    const py = plateauCentre(S, 0.48, 0.72, 'zb', -1, `${name}, pointe du jarret`);
    const hk = sampleAt(S, py - 0.03, `${name}, jarret`);
    out.C = [hk.cx, hk.y, hk.zf + 0.4 * (hk.zb - hk.zf)];
    // Grasset : axe de la jambe (0,68–0,88 m) prolongé jusqu'à 0,37 m au-dessus du jarret, avancé de 6 cm (le grasset
    // est à l'avant de la cuisse).
    const ys = out.C[1] + 0.37;
    const a = axisAt(S, 0.68, 0.88, ys, `${name}, grasset`);
    out.L = [a[0], ys, a[2] + 0.06];
  }
  return out;
}

// Membres symétrisés : chaque côté est ajusté seul, puis la hauteur (y) et l'avant/arrière (z) de chaque articulation
// sont moyennés entre gauche et droite (modèle symétrique : un écart vient de la mesure, et des segments de longueurs
// différentes poseraient les sabots à des hauteurs différentes sous les mêmes rotations) ; le x (aplombs) reste propre à
// chaque côté. Erreur si l'écart gauche/droite (y, z) d'une articulation dépasse 1,5 cm avant symétrisation.
const SYM_MAX = 0.015;
const JOINT = { H: 'sabot', P: 'boulet', L: 'genou/grasset', U: 'coude', C: 'jarret' };
export function symmetriseLegs(raw) {
  const legs = {}, gaps = {};
  for (const [l, r] of [['AG', 'AD'], ['PG', 'PD']]) {
    legs[l] = {};
    legs[r] = {};
    for (const j of Object.keys(raw[l])) {
      const a = raw[l][j], b = raw[r][j];
      const gap = Math.hypot(a[1] - b[1], a[2] - b[2]);
      gaps[`${l}/${r} ${j}`] = +(gap * 100).toFixed(2);
      if (gap > SYM_MAX) {
        throw new Error(
          `squelette : ${JOINT[j]} des membres ${l}/${r} asymétrique avant symétrisation (écart gauche/droite ` +
            `${(gap * 100).toFixed(1)} cm en hauteur et avant/arrière, 1,5 cm au plus) : coupes ou fenêtres de recherche à vérifier`,
        );
      }
      const y = (a[1] + b[1]) / 2, z = (a[2] + b[2]) / 2;
      legs[l][j] = [a[0], y, z];
      legs[r][j] = [b[0], y, z];
    }
  }
  return { legs, gaps };
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
// Distance signée au plan nuque–gorge (positive en avant, côté tête), dans le plan sagittal. SIDE_N : normale du plan
// orientée vers l'avant (gradient de la distance en y et z).
const SIDE_N = (() => {
  const dz = THROAT[2] - POLL[2], dy = THROAT[1] - POLL[1];
  const L = Math.hypot(dz, dy);
  return { y: dz / L, z: -dy / L };
})();
export function headSide(y, z) {
  return (z - POLL[2]) * SIDE_N.z + (y - POLL[1]) * SIDE_N.y;
}
// Rotation d'angle θ(p) = −ang·w(s(p)) autour de l'axe vertical de la nuque. Normales : transposée inverse de la
// jacobienne, J = R + (dR/dθ · q) ∇θᵀ (q = p − nuque) ; dans la bande de transition l'angle varie avec la position
// (cisaillement) et la seule rotation locale des normales les fausse (jusqu'à 33°). Pour une rotation autour de y :
// J⁻ᵀ n = R (n − ∇θ (q_z n_x − q_x n_z) / (1 − ∂θ/∂z · q_x)), puis normalisation ; hors de la bande, ∇θ = 0.
export function straightenHead(P, N) {
  const ang = headYaw(P);
  const a = -0.06, b = 0.04;
  for (let i = 0; i < P.length; i += 3) {
    const s = headSide(P[i + 1], P[i + 2]);
    const w = smooth(a, b, s);
    if (w <= 0) continue;
    const cw = Math.cos(-ang * w), sw = Math.sin(-ang * w);
    const x = P[i] - POLL[0], z = P[i + 2] - POLL[2];
    P[i] = POLL[0] + x * cw + z * sw;
    P[i + 2] = POLL[2] - x * sw + z * cw;
    // ∇θ = −ang · w'(s) · (0, SIDE_N.y, SIDE_N.z).
    const t = (s - a) / (b - a);
    const dw = t > 0 && t < 1 ? (6 * t * (1 - t)) / (b - a) : 0;
    const gy = -ang * dw * SIDE_N.y, gz = -ang * dw * SIDE_N.z;
    const k = (z * N[i] - x * N[i + 2]) / (1 - gz * x);
    const mx = N[i], my = N[i + 1] - gy * k, mz = N[i + 2] - gz * k;
    const nx = mx * cw + mz * sw, nz = -mx * sw + mz * cw;
    const L = Math.hypot(nx, my, nz) || 1;
    N[i] = nx / L;
    N[i + 1] = my / L;
    N[i + 2] = nz / L;
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
  const raw = {
    AG: fitLeg(S.AG, true, 'antérieur gauche'),
    AD: fitLeg(S.AD, true, 'antérieur droit'),
    PG: fitLeg(S.PG, false, 'postérieur gauche'),
    PD: fitLeg(S.PD, false, 'postérieur droit'),
  };
  const { legs, gaps } = symmetriseLegs(raw);
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
  return { bones, legs, legsRaw: raw, legGaps: gaps, ears, samples: S };
}
