// Sellerie générée contre le corps (champ de distance) : tapis STRIDES, selle mixte d'obstacle (siège, quartiers
// avec taquets, troussequin), sangle, étrivières et étriers, filet (têtière, frontal, montants, muserolle,
// sous-gorge, mors à anneaux), rênes (en main ou posées sur l'encolure), licol avec anneaux, guêtres et protège-boulets.
import { add, mul, sub, norm, cross, dot, clamp, lerp, smooth } from './sdf.mjs';
import { hp, HEAD_F, HEAD_U } from './anatomy.mjs';
import { bonePos, BONE_INDEX } from '../../src/entities/horse/skeleton.js';
import { encodePositions, encodeNormals, encodeIndicesZigzag } from './pack.mjs';

// Matériaux (indices utilisés par le jeu pour la couleur et la brillance).
export const TACK_MAT = { pad: 0, saddle: 1, leather: 2, metal: 3, brass: 4, boots: 5, halter: 6, girth: 7, seat: 8, rubber: 9 };

export function buildTack(S, log = () => {}) {
  const V = []; // { p, n, uv, m, w }
  const parts = {}; // nom → triangles
  let cur = null;
  const part = (name) => (cur = parts[name] || (parts[name] = []));
  const vert = (p, n, uv, m, w) => {
    V.push({ p, n, uv, m, w });
    return V.length - 1;
  };
  const tri = (a, b, c) => cur.push(a, b, c);
  const quad = (a, b, c, d) => {
    cur.push(a, b, c, a, c, d);
  };

  // ---------- Outils de surface ----------
  // Lancer de rayon jusqu'à la peau (depuis l'intérieur ou l'extérieur).
  const castIn = (o, d, maxT = 1) => {
    let t = 0;
    for (let i = 0; i < 120 && t < maxT; i++) {
      const q = add(o, mul(d, t));
      const dd = S.fast(...q);
      if (Math.abs(dd) < 0.0003) return q;
      t -= dd; // depuis l'intérieur : la distance croît vers l'extérieur
      if (t < 0) t = 0.0005;
    }
    return add(o, mul(d, t));
  };
  const project = (p, gap) => {
    let q = p;
    for (let i = 0; i < 12; i++) {
      const dd = S.fast(...q) - gap;
      if (Math.abs(dd) < 0.0002) break;
      q = sub(q, mul(S.grad(...q), dd));
    }
    return q;
  };
  const W1 = (b) => ({ [b]: 1 });

  // Coque mince : grille P(i, j) (sur la peau, normale vers l'extérieur), épaisseur e, bords fermés.
  function shell(grid, e, mat, wfn, uvfn, opts = {}) {
    const nu = grid.length, nv = grid[0].length;
    const top = [], bot = [];
    for (let i = 0; i < nu; i++) {
      top.push([]);
      bot.push([]);
      for (let j = 0; j < nv; j++) {
        const { p, n } = grid[i][j];
        const ex = opts.thick ? opts.thick(i / (nu - 1), j / (nv - 1)) : e;
        const uv = uvfn(i / (nu - 1), j / (nv - 1));
        const w = wfn(p);
        top[i].push(vert(add(p, mul(n, ex)), n, uv, mat, w));
        bot[i].push(vert(p, mul(n, -1), uv, mat, w));
      }
    }
    for (let i = 0; i < nu - 1; i++) {
      for (let j = 0; j < nv - 1; j++) {
        if (opts.flip) quad(top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]);
        else quad(top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]);
        if (!opts.noBottom) {
          if (opts.flip) quad(bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1]);
          else quad(bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]);
        }
      }
    }
    // Tranches (bords) : normales vers l'extérieur du contour.
    const edge = (list) => {
      for (let k = 0; k < list.length - 1; k++) {
        const [i0, j0] = list[k], [i1, j1] = list[k + 1];
        const a = V[top[i0][j0]], b = V[top[i1][j1]], c = V[bot[i0][j0]];
        const t = norm(sub(b.p, a.p));
        let out = norm(cross(t, a.n));
        if (opts.flip) out = mul(out, -1);
        // Sommets dédiés (normale de tranche).
        const A = vert(a.p, out, a.uv, mat, a.w), B = vert(b.p, out, b.uv, mat, b.w), C = vert(c.p, out, c.uv, mat, c.w), D = vert(V[bot[i1][j1]].p, out, b.uv, mat, b.w);
        if (opts.flip) quad(A, B, D, C);
        else quad(A, C, D, B);
      }
    };
    if (!opts.noEdges) {
      const L = [];
      for (let i = 0; i < nu; i++) L.push([i, 0]);
      for (let j = 1; j < nv; j++) L.push([nu - 1, j]);
      for (let i = nu - 2; i >= 0; i--) L.push([i, nv - 1]);
      for (let j = nv - 2; j >= 0; j--) L.push([0, j]);
      edge(L);
    }
    return { top, bot };
  }


  // Lanière le long d'une courbe posée sur la peau : largeur w, épaisseur e ; quatre sommets par section
  // (normales arrondies), face cachée contre la peau omise sauf pour les lanières libres (rênes).
  function strap(points, w, e, gap, mat, wfn, opts = {}) {
    const pts = smoothCurve(points, opts.closed, opts.step || 0.016);
    const n = pts.length;
    const P = [], N = [];
    for (let i = 0; i < n; i++) {
      const q = opts.free ? pts[i] : project(pts[i], gap);
      P.push(q);
      N.push(opts.free ? opts.normal(q, i / (n - 1)) : S.grad(...q));
    }
    const R = [];
    for (let i = 0; i < n; i++) {
      let t = opts.closed ? norm(sub(P[(i + 1) % n], P[(i - 1 + n) % n])) : norm(sub(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]));
      const nn = norm(sub(N[i], mul(t, dot(N[i], t))));
      const b = cross(t, nn);
      const c = P[i];
      const ww = (typeof w === 'function' ? w(i / (n - 1)) : w) / 2;
      const uv = [i / (n - 1), 0.5];
      const wt = wfn(c, i / (n - 1));
      R.push([
        vert(add(add(c, mul(b, ww)), mul(nn, e)), norm(add(nn, mul(b, 0.5))), uv, mat, wt), // haut gauche
        vert(add(add(c, mul(b, -ww)), mul(nn, e)), norm(add(nn, mul(b, -0.5))), uv, mat, wt), // haut droit
        vert(add(c, mul(b, -ww)), norm(add(mul(nn, -0.4), mul(b, -1))), uv, mat, wt), // bas droit
        vert(add(c, mul(b, ww)), norm(add(mul(nn, -0.4), b)), uv, mat, wt), // bas gauche
      ]);
    }
    const last = opts.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const [TL, TR, BR, BL] = R[i], [TL1, TR1, BR1, BL1] = R[(i + 1) % n];
      quad(TL, TL1, TR1, TR); // dessus
      quad(BL, BL1, TL1, TL); // côté gauche
      quad(BR, TR, TR1, BR1); // côté droit
      if (opts.free) quad(BL, BR, BR1, BL1); // dessous
    }
    return P;
  }


  // Anneau (tore) : centre, axe, grand rayon R, petit rayon r.
  function ring(c, axis, R, r, mat, wt, seg = 14, sides = 6) {
    const a = norm(axis);
    const u = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(a, u);
    const base = V.length;
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const d = add(mul(u, Math.cos(th)), mul(v, Math.sin(th)));
      const cc = add(c, mul(d, R));
      for (let j = 0; j < sides; j++) {
        const ph = (j / sides) * Math.PI * 2;
        const nn = add(mul(d, Math.cos(ph)), mul(a, Math.sin(ph)));
        vert(add(cc, mul(nn, r)), nn, [0, 0], mat, wt);
      }
    }
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < sides; j++) {
        const i1 = (i + 1) % seg, j1 = (j + 1) % sides;
        quad(base + i * sides + j, base + i1 * sides + j, base + i1 * sides + j1, base + i * sides + j1);
      }
    }
  }

  // Tube le long d'une polyligne (étriers, mors).
  function tube(pts, r, mat, wt, sides = 6, closed = false) {
    const n = pts.length;
    const base = V.length;
    for (let i = 0; i < n; i++) {
      const t = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      const u = norm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(t, u);
      for (let j = 0; j < sides; j++) {
        const ph = (j / sides) * Math.PI * 2;
        const nn = add(mul(u, Math.cos(ph)), mul(v, Math.sin(ph)));
        vert(add(pts[i], mul(nn, r)), nn, [0, 0], mat, typeof wt === 'function' ? wt(pts[i], i / (n - 1)) : wt);
      }
    }
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      for (let j = 0; j < sides; j++) {
        const i1 = (i + 1) % n, j1 = (j + 1) % sides;
        quad(base + i * sides + j, base + i * sides + j1, base + i1 * sides + j1, base + i1 * sides + j);
      }
    }
  }

  // Boîte orientée (boucles, taquets).
  function box(c, ax, ay, az, mat, wt) {
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(add(add(add(c, mul(ax, sx)), mul(ay, sy)), mul(az, sz)));
    const faces = [
      [[0, 1, 3, 2], mul(norm(ax), -1)], [[4, 6, 7, 5], norm(ax)], [[0, 4, 5, 1], mul(norm(ay), -1)], [[2, 3, 7, 6], norm(ay)], [[0, 2, 6, 4], mul(norm(az), -1)], [[1, 5, 7, 3], norm(az)],
    ];
    for (const [f, nn] of faces) {
      const ids = f.map((k) => vert(corners[k], nn, [0, 0], mat, wt));
      quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }

  // ======================= TAPIS DE SELLE =======================
  // Sections transversales du dos : rayons depuis l'intérieur, abscisse curviligne depuis la ligne du dos.
  const yPadBot = 1.19;
  const section = (z) => {
    const pts = [];
    for (let a = 0; a <= 112; a += 2) {
      const phi = (a * Math.PI) / 180;
      pts.push(castIn([0, 1.12, z], [Math.sin(phi), Math.cos(phi), 0], 0.8));
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
    let Lb = cum[cum.length - 1];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][1] < yPadBot) {
        const f = (pts[i - 1][1] - yPadBot) / (pts[i - 1][1] - pts[i][1]);
        Lb = lerp(cum[i - 1], cum[i], f);
        break;
      }
    }
    return { pts, cum, Lb };
  };
  const secCache = new Map();
  const sec = (z) => {
    const k = Math.round(z * 200);
    if (!secCache.has(k)) secCache.set(k, section(k / 200));
    return secCache.get(k);
  };
  // Point de peau à la cote z, fraction q de la hauteur du tapis (0 = ligne du dos, 1 = bas), côté s.
  const backPt = (z, q, s, arcMax) => {
    const S0 = sec(z);
    const L = (arcMax ?? S0.Lb) * q;
    let i = 1;
    while (i < S0.cum.length - 1 && S0.cum[i] < L) i++;
    const f = clamp((L - S0.cum[i - 1]) / (S0.cum[i] - S0.cum[i - 1] || 1), 0, 1);
    const p = lerp3(S0.pts[i - 1], S0.pts[i], f);
    return [p[0] * s, p[1], p[2]];
  };
  const pBody = () => ({ body: 1 });
  part('pad');
  {
    const NZ = 18, NQ = 12;
    for (const s of [1, -1]) {
      const grid = [];
      for (let i = 0; i < NZ; i++) {
        const u = i / (NZ - 1);
        grid.push([]);
        for (let j = 0; j < NQ; j++) {
          const q = j / (NQ - 1);
          // Contour : avant incliné (suit l'épaule), arrière arrondi, coins arrondis en bas.
          const zF = 0.445 - 0.03 * q - 0.05 * Math.pow(q, 6);
          const zB = -0.31 + 0.05 * q * q + 0.06 * Math.pow(q, 6);
          const z = lerp(zB, zF, u);
          const p = backPt(z, q * 0.995 + 0.002, s);
          const pp = project(p, 0.004);
          grid[i].push({ p: pp, n: S.grad(...pp) });
        }
      }
      // Texture : côté gauche lu de l'avant vers l'arrière à l'écran (u inversé), côté droit dans le sens de z.
      shell(grid, 0.016, TACK_MAT.pad, pBody, (u, v) => [s > 0 ? 1 - u : u, v * 0.5 + (s > 0 ? 0 : 0.5)], { thick: (u, v) => 0.014 + 0.004 * Math.sin(Math.PI * v), flip: s < 0, noBottom: true });
    }
  }
  log(`tapis : ${V.length} sommets`);

  // ======================= SELLE =======================
  part('saddle');
  // Siège : de troussequin (arrière) au pommeau (avant), creusé, au-dessus du tapis.
  const seatH = (z) => {
    // Hauteur du siège au-dessus du tapis selon z (pommeau et troussequin relevés).
    const k = (z - -0.14) / (0.33 - -0.14);
    return 0.035 + 0.075 * Math.pow(1 - smooth(0, 0.28, k), 2) * 1.0 + 0.06 * Math.pow(smooth(0.72, 1, k), 1.5) + 0.012 * Math.sin(Math.PI * k);
  };
  const seatQ = (z) => lerp(0.36, 0.2, smooth(-0.1, 0.32, z)); // demi-largeur du siège (fraction du tapis)
  let seatLow = null;
  {
    const NZ = 20, NQ = 12;
    const grid = [];
    for (let i = 0; i < NZ; i++) {
      const u = i / (NZ - 1);
      const z = lerp(-0.14, 0.33, u);
      grid.push([]);
      for (let j = 0; j < NQ; j++) {
        const t = (j / (NQ - 1)) * 2 - 1; // -1 droite → +1 gauche
        const s = t >= 0 ? 1 : -1;
        const q = Math.abs(t) * seatQ(z);
        const base = project(backPt(z, q, s), 0.02);
        const n = S.grad(...base);
        const lift = seatH(z) * (1 - Math.pow(Math.abs(t), 2.6) * 0.75);
        const p = add(base, [0, lift, 0]);
        grid[i].push({ p, n: norm(add(n, [0, 0.6, 0])) });
        if (j === Math.floor(NQ / 2) && (!seatLow || p[1] < seatLow[1]) && z > -0.06 && z < 0.22) seatLow = p;
      }
    }
    shell(grid, 0.012, TACK_MAT.seat, pBody, (u, v) => [0.9, 0.9], { noBottom: true });
  }
  // Quartiers (avancés, d'obstacle) avec taquets, et faux-quartiers sous le siège.
  for (const s of [1, -1]) {
    const NZ = 14, NQ = 12;
    const grid = [];
    for (let i = 0; i < NZ; i++) {
      const u = i / (NZ - 1);
      grid.push([]);
      for (let j = 0; j < NQ; j++) {
        const v = j / (NQ - 1);
        const q = lerp(0.24, 0.93, v);
        const zF = lerp(0.3, 0.405, v) - 0.04 * Math.pow(v, 5);
        const zB = lerp(-0.03, 0.06, v) + 0.05 * Math.pow(v, 5);
        const z = lerp(zB, zF, u);
        const p = project(backPt(z, q, s), 0.03);
        grid[i].push({ p, n: S.grad(...p) });
      }
    }
    // Taquet : bourrelet le long du bord avant (épaisseur accrue).
    shell(grid, 0.006, TACK_MAT.saddle, pBody, () => [0.9, 0.9], { thick: (u, v) => 0.006 + 0.022 * smooth(0.72, 0.95, u) * smooth(0.25, 0.5, v) * (1 - smooth(0.85, 1, v)), flip: s < 0, noBottom: true });
    // Petit quartier (sur la porte-étrivière).
    const g2 = [];
    for (let i = 0; i < 6; i++) {
      g2.push([]);
      for (let j = 0; j < 5; j++) {
        const z = lerp(0.2, 0.33, i / 5);
        const q = lerp(0.18, 0.4, j / 4);
        const p = project(backPt(z, q, s), 0.04);
        g2[i].push({ p, n: S.grad(...p) });
      }
    }
    shell(g2, 0.005, TACK_MAT.saddle, pBody, () => [0.9, 0.9], { flip: s < 0, noBottom: true });
    // Troussequin et pommeau : rebords du siège.
  }
  {
    // Bord du troussequin.
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const t = (k / 10) * 2 - 1;
      const s = t >= 0 ? 1 : -1;
      const z = -0.135;
      const base = project(backPt(z, Math.abs(t) * seatQ(z), s), 0.02);
      pts.push(add(base, [0, seatH(z) * (1 - Math.pow(Math.abs(t), 2.6) * 0.75) + 0.012, -0.004]));
    }
    tube(pts, 0.011, TACK_MAT.saddle, pBody, 6);
  }
  log(`selle : ${V.length} sommets`);

  // ======================= SANGLE =======================
  part('girth');
  {
    const z0 = 0.37;
    const pts = [];
    for (let a = 70; a <= 290; a += 4) {
      const phi = (a * Math.PI) / 180;
      const p = castIn([0, 1.2, z0], [Math.sin(phi), Math.cos(phi), 0], 0.8);
      pts.push(p);
    }
    const girthW = (p) => ({ body: 0.7, breath: 0.3 });
    strap(pts, (t) => 0.075 + 0.025 * Math.sin(Math.PI * t), 0.012, 0.005, TACK_MAT.girth, girthW);
    // Boucles sous les quartiers.
    for (const s of [1, -1]) {
      const p = project([0.29 * s, 1.24, z0], 0.03);
      const n = S.grad(...p);
      const t = norm(cross(n, [0, 0, 1]));
      box(p, mul(n, 0.004), mul(t, 0.03), [0, 0, 0.032], TACK_MAT.metal, { body: 1 });
    }
  }

  // ======================= ÉTRIVIÈRES ET ÉTRIERS =======================
  part('stirrups');
  const stirW = (s) => (p, t) => {
    const k = clamp(t, 0, 1);
    const bn = s > 0 ? 'stirL' : 'stirR';
    return k < 0.02 ? { body: 1 } : { body: 1 - k, [bn]: k };
  };
  for (const s of [1, -1]) {
    const bar = project([0.17 * s, 1.5, 0.27], 0.03);
    const iron = bonePos(s > 0 ? 'stirL' : 'stirR');
    const top = [iron[0], iron[1] + 0.13, iron[2]];
    // Étrivière : bande posée sur le quartier, de la porte-étrivière à l'œil de l'étrier.
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const p = lerp3(bar, top, t);
      pts.push(t < 0.85 ? project([p[0], p[1], p[2]], 0.042 + 0.01 * t) : p);
    }
    strap(pts, 0.026, 0.004, 0.034, TACK_MAT.leather, (p, t) => stirW(s)(p, t), { free: true, normal: () => [s, 0, 0] });
    // Étrier : arceau, plancher, œil.
    const ib = s > 0 ? 'stirL' : 'stirR';
    const arch = [];
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI * (k / 16);
      arch.push(add(iron, [Math.cos(a) * 0.058 * s * 0 + 0, Math.sin(a) * 0.11, Math.cos(a) * 0.06]));
    }
    tube(arch, 0.0075, TACK_MAT.metal, { [ib]: 1 }, 6);
    box(add(iron, [0, 0.004, 0]), [0.028, 0, 0], [0, 0.007, 0], [0, 0, 0.062], TACK_MAT.rubber, { [ib]: 1 });
    box(add(iron, [0, 0.118, 0]), [0.012, 0, 0], [0, 0.012, 0], [0, 0, 0.018], TACK_MAT.metal, { [ib]: 1 });
  }

  // ======================= FILET =======================
  const headW = () => ({ head: 1 });
  const H = hp;
  part('bridle');
  // Têtière + montants : de l'anneau du mors gauche, derrière les oreilles, à l'anneau droit.
  const bitL = H(0.054, 0.492, -0.086), bitR = H(-0.054, 0.492, -0.086);
  strap([bitL, H(0.072, 0.4, -0.075), H(0.083, 0.27, -0.072), H(0.088, 0.13, -0.05), H(0.072, 0.0, 0.0), H(0.03, -0.035, 0.06), H(0, -0.04, 0.072), H(-0.03, -0.035, 0.06), H(-0.072, 0.0, 0.0), H(-0.088, 0.13, -0.05), H(-0.083, 0.27, -0.072), H(-0.072, 0.4, -0.075), bitR], 0.02, 0.004, 0.002, TACK_MAT.leather, headW);
  // Frontal.
  strap([H(0.08, 0.02, 0.01), H(0.06, 0.045, 0.06), H(0, 0.05, 0.08), H(-0.06, 0.045, 0.06), H(-0.08, 0.02, 0.01)], 0.016, 0.004, 0.004, TACK_MAT.leather, headW);
  // Muserolle (caveçon) : tour de nez sous les crêtes zygomatiques.
  {
    const pts = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      pts.push(H(Math.sin(a) * 0.1, 0.38 - Math.cos(a) * 0.02, -0.05 + Math.cos(a) * 0.14));
    }
    strap(pts, 0.026, 0.005, 0.002, TACK_MAT.leather, headW, { closed: true });
  }
  // Sous-gorge : boucle lâche sous la ganache.
  strap([H(0.072, 0.0, 0.0), H(0.07, 0.05, -0.12), H(0.035, 0.07, -0.21), H(0, 0.07, -0.235), H(-0.035, 0.07, -0.21), H(-0.07, 0.05, -0.12), H(-0.072, 0.0, 0.0)], 0.013, 0.003, 0.006, TACK_MAT.leather, headW);
  // Mors : anneaux et canon.
  ring(bitL, [1, 0, 0], 0.033, 0.0045, TACK_MAT.metal, { head: 1 }, 14, 5);
  ring(bitR, [1, 0, 0], 0.033, 0.0045, TACK_MAT.metal, { head: 1 }, 14, 5);
  tube([add(bitL, [-0.006, 0, 0]), add(bitR, [0.006, 0, 0])], 0.006, TACK_MAT.metal, { head: 1 }, 6);
  log(`filet : ${V.length} sommets`);

  // ======================= RÊNES =======================
  // En main : du mors aux mains du cavalier (os reinL/reinR), légère courbe.
  part('reinsRidden');
  for (const s of [1, -1]) {
    const bit = s > 0 ? bitL : bitR;
    const hand = bonePos(s > 0 ? 'reinL' : 'reinR');
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const p = lerp3(bit, hand, t);
      p[1] -= Math.sin(Math.PI * t) * 0.07;
      p[0] += s * Math.sin(Math.PI * t) * 0.05;
      pts.push(p);
    }
    const hb = s > 0 ? 'reinL' : 'reinR';
    strap(pts, 0.017, 0.005, 0, TACK_MAT.rubber, (p, t) => (t < 0.03 ? { head: 1 } : { head: 1 - t, [hb]: t }), { free: true, normal: (q, t) => norm([s * 0.3, 1, 0]) });
  }
  // Sur l'encolure : du mors le long de l'encolure jusqu'au garrot.
  part('reinsNeck');
  {
    const NP = ['neck', 'neck2', 'neck3', 'head'].map(bonePos);
    const neckChain = [...NP, add(NP[3], [0, 0.01, 0.06])];
    const nw = (p) => {
      const o = chainW(neckChain, ['neck', 'neck2', 'neck3', 'head'], p, 0.08);
      return o;
    };
    const pts = [bitL, H(0.075, 0.45, -0.1), [0.115, 1.63, 1.22], [0.135, 1.62, 1.02], [0.13, 1.66, 0.84], [0.09, 1.76, 0.7], [0, 1.8, 0.66], [-0.09, 1.76, 0.7], [-0.13, 1.66, 0.84], [-0.135, 1.62, 1.02], [-0.115, 1.63, 1.22], H(-0.075, 0.45, -0.1), bitR];
    strap(pts, 0.017, 0.005, 0.004, TACK_MAT.rubber, nw);
  }

  // ======================= LICOL =======================
  part('halter');
  {
    const ringL = H(0.083, 0.37, -0.075), ringR = H(-0.083, 0.37, -0.075);
    // Têtière + montants.
    strap([ringL, H(0.088, 0.25, -0.07), H(0.088, 0.12, -0.04), H(0.07, 0.0, 0.0), H(0.03, -0.03, 0.062), H(0, -0.035, 0.074), H(-0.03, -0.03, 0.062), H(-0.07, 0.0, 0.0), H(-0.088, 0.12, -0.04), H(-0.088, 0.25, -0.07), ringR], 0.028, 0.005, 0.003, TACK_MAT.halter, headW);
    // Muserolle.
    const pts = [];
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2;
      pts.push(H(Math.sin(a) * 0.1, 0.4 - Math.cos(a) * 0.015, -0.055 + Math.cos(a) * 0.135));
    }
    strap(pts, 0.03, 0.005, 0.003, TACK_MAT.halter, headW, { closed: true });
    // Sous-gorge : des anneaux des joues sous la gorge.
    strap([ringL, H(0.07, 0.2, -0.17), H(0.04, 0.12, -0.225), H(0, 0.1, -0.24), H(-0.04, 0.12, -0.225), H(-0.07, 0.2, -0.17), ringR], 0.024, 0.005, 0.004, TACK_MAT.halter, headW);
    // Anneaux (laiton) et anneau de longe sous la ganache.
    ring(ringL, [1, 0, 0], 0.018, 0.0035, TACK_MAT.brass, { head: 1 }, 12, 5);
    ring(ringR, [1, 0, 0], 0.018, 0.0035, TACK_MAT.brass, { head: 1 }, 12, 5);
    const lead = project(H(0, 0.38, -0.19), 0.012);
    ring(lead, [0, 0, 1], 0.022, 0.004, TACK_MAT.brass, { head: 1 }, 12, 5);
  }

  // ======================= GUÊTRES ET PROTÈGE-BOULETS =======================
  const legRing = (cx, cz, y, phiA, phiB, gap, n = 14) => {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const a = lerp(phiA, phiB, k / n);
      const d = [Math.sin(a), 0, -Math.cos(a)]; // 0 = arrière
      pts.push(project(castIn([cx, y, cz], d, 0.2), gap));
    }
    return pts;
  };
  part('bootsF');
  for (const s of [1, -1]) {
    const L = bonePos(s > 0 ? 'flL' : 'frL'), F = bonePos(s > 0 ? 'flP' : 'frP');
    const grid = [];
    const NY = 8;
    for (let i = 0; i < NY; i++) {
      const y = lerp(0.165, 0.43, i / (NY - 1));
      const t = (y - F[1]) / (L[1] - F[1]);
      const cx = lerp(F[0], L[0], clamp(t, 0, 1)), cz = lerp(F[2], L[2], clamp(t, 0, 1)) - 0.012;
      const row = legRing(cx, cz, y, -2.1, 2.1, 0.004).map((p) => ({ p, n: S.grad(...p) }));
      grid.push(row);
    }
    const bw = (p) => (p[1] > 0.205 ? { [s > 0 ? 'flL' : 'frL']: 1 } : { [s > 0 ? 'flL' : 'frL']: 0.5, [s > 0 ? 'flP' : 'frP']: 0.5 });
    shell(grid, 0.007, TACK_MAT.boots, bw, () => [0.9, 0.9], { noBottom: true });
  }
  part('bootsH');
  for (const s of [1, -1]) {
    const C = bonePos(s > 0 ? 'hlC' : 'hrC'), F = bonePos(s > 0 ? 'hlP' : 'hrP');
    const grid = [];
    const NY = 5;
    for (let i = 0; i < NY; i++) {
      const y = lerp(0.15, 0.27, i / (NY - 1));
      const t = (y - F[1]) / (C[1] - F[1]);
      const cx = lerp(F[0], C[0], clamp(t, 0, 1)), cz = lerp(F[2], C[2], clamp(t, 0, 1)) - 0.01;
      const row = legRing(cx, cz, y, -2.4, 2.4, 0.004).map((p) => ({ p, n: S.grad(...p) }));
      grid.push(row);
    }
    const bw = (p) => (p[1] > 0.2 ? { [s > 0 ? 'hlC' : 'hrC']: 0.6, [s > 0 ? 'hlP' : 'hrP']: 0.4 } : { [s > 0 ? 'hlP' : 'hrP']: 1 });
    shell(grid, 0.007, TACK_MAT.boots, bw, () => [0.9, 0.9], { noBottom: true });
  }
  log(`sellerie : ${V.length} sommets`);

  // ---------- Empaquetage ----------
  const n = V.length;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const uv = new Uint16Array(n * 2), mat = new Uint8Array(n);
  const skinI = new Uint8Array(n * 4), skinW = new Uint8Array(n * 4);
  V.forEach((v, i) => {
    pos.set(v.p, i * 3);
    nor.set(norm(v.n), i * 3);
    uv[i * 2] = Math.round(clamp(v.uv[0], 0, 1) * 65535);
    uv[i * 2 + 1] = Math.round(clamp(v.uv[1], 0, 1) * 65535);
    mat[i] = v.m;
    const top = Object.entries(v.w).filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((s, e) => s + e[1], 0) || 1;
    const q = top.map(([, w]) => Math.floor((w / tot) * 255));
    q[0] += 255 - q.reduce((s, x) => s + x, 0);
    top.forEach(([b], k) => {
      if (BONE_INDEX[b] === undefined) throw new Error(`os inconnu ${b}`);
      skinI[i * 4 + k] = BONE_INDEX[b];
      skinW[i * 4 + k] = q[k];
    });
  });
  const order = ['pad', 'saddle', 'girth', 'stirrups', 'bridle', 'reinsRidden', 'reinsNeck', 'halter', 'bootsF', 'bootsH'];
  const idx = [];
  const ranges = {};
  for (const k of order) {
    const t = parts[k] || [];
    ranges[k] = [idx.length, t.length];
    for (const i of t) idx.push(i);
  }
  const seat = seatLow || [0, 1.64, 0.08];
  log(`assise la plus basse : ${seat.map((v) => v.toFixed(3)).join(', ')}`);
  return {
    meta: { nv: n, ranges, seat },
    arrays: { tackPos: encodePositions(pos, 0.00025), tackNor: encodeNormals(nor), tackUv: uv, tackMat: mat, tackSkinI: skinI, tackSkinW: skinW, tackIdx: encodeIndicesZigzag(idx) },
  };
}

function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Courbe de Catmull-Rom rééchantillonnée à pas constant.
function smoothCurve(points, closed, step) {
  const P = points;
  const n = P.length;
  const get = (i) => (closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)]);
  const dense = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < 10; k++) {
      const t = k / 10, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  if (!closed) dense.push(P[n - 1]);
  // Rééchantillonnage.
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    acc += Math.hypot(...sub(dense[i], dense[i - 1]));
    if (acc >= step) {
      out.push(dense[i]);
      acc = 0;
    }
  }
  if (!closed && out[out.length - 1] !== dense[dense.length - 1]) out.push(dense[dense.length - 1]);
  return out;
}

// Poids le long d'une chaîne d'os (projection, mélange gaussien).
function chainW(pts, names, p, width) {
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ab = sub(pts[i + 1], pts[i]);
    const l2 = dot(ab, ab);
    const t = clamp(dot(sub(p, pts[i]), ab) / l2, 0, 1);
    const q = add(pts[i], mul(ab, t));
    const d = Math.hypot(...sub(p, q));
    if (d < best) {
      best = d;
      bi = i;
      bt = t;
    }
  }
  const cum = [0];
  for (let i = 0; i < pts.length - 1; i++) cum.push(cum[i] + Math.hypot(...sub(pts[i + 1], pts[i])));
  const s = cum[bi] + bt * (cum[bi + 1] - cum[bi]);
  const o = {};
  let tot = 0;
  names.forEach((nm, i) => {
    const a = cum[i], b = cum[Math.min(i + 1, cum.length - 1)];
    const dd = s < a ? a - s : s > b ? s - b : 0;
    const w = Math.exp(-((dd / width) ** 2));
    if (w > 0.02) {
      o[nm] = (o[nm] || 0) + w;
      tot += w;
    }
  });
  for (const k in o) o[k] /= tot;
  return o;
}
void HEAD_F;
void HEAD_U;
