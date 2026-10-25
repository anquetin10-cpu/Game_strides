// Crins en cartes (mèches) drapées contre le corps : crinière tirée couchée à droite, toupet, queue (couverture du
// tronçon et crins longs jusqu'aux jarrets, coupés droit), cils. Chaque mèche suit la gravité et reste posée sur la
// peau grâce au champ de distance. Poids de peau : chaîne du cou (+ ressorts de crinière), tête, chaîne de la queue.
import { add, mul, sub, norm, cross, dot, clamp, smooth, lerp } from './sdf.mjs';
import { hp, HEAD_F } from './anatomy.mjs';
import { bonePos, BONE_INDEX } from '../../src/entities/horse/skeleton.js';
import { encodePositions, encodeNormals, encodeIndicesZigzag } from './pack.mjs';

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Chaîne d'os le long d'une polyligne → poids (projection, mélange gaussien).
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
  names.forEach((n, i) => {
    const a = cum[i], b = cum[Math.min(i + 1, cum.length - 1)];
    const dd = s < a ? a - s : s > b ? s - b : 0;
    const w = Math.exp(-((dd / width) ** 2));
    if (w > 0.02) {
      o[n] = (o[n] || 0) + w;
      tot += w;
    }
  });
  for (const k in o) o[k] /= tot;
  return o;
}

export function buildHair(S, log = () => {}) {
  const rnd = mulberry(7);
  const V = []; // { p, n, uv, w: {os: poids}, c }
  const T = []; // triangles
  const groups = { lod1: [], lod0: [] };
  // Mèche drapée : racine, direction initiale, longueur, largeur, segments, écart à la peau, gravité.
  function strand(root, dir0, len, width, segs, gap, grav, sideHint, weightFn, col, atlas, lod1, opts = {}) {
    const pts = [root];
    const nrm = [];
    let d = norm(dir0);
    const step = len / segs;
    let p = root;
    for (let i = 0; i < segs; i++) {
      const g = grav * (0.4 + (i / segs) * 0.8);
      d = norm(add(d, [0, -g, 0]));
      let q = add(p, mul(d, step));
      // Rester à « gap » de la peau (collision douce).
      for (let it = 0; it < 3; it++) {
        const dist = S.fast(...q);
        const want = gap * (opts.lift ? 1 + (i / segs) * opts.lift : 1);
        if (dist < want) {
          const n = S.grad(...q);
          q = add(q, mul(n, want - dist));
        }
      }
      d = norm(sub(q, p));
      pts.push(q);
      p = q;
    }
    // Normales de carte : normale de peau au voisinage, largeur tangente.
    const base = V.length;
    for (let i = 0; i <= segs; i++) {
      const q = pts[i];
      const tng = i < segs ? norm(sub(pts[i + 1], q)) : norm(sub(q, pts[i - 1]));
      let n = S.grad(...q);
      if (opts.normal) n = opts.normal(q, n);
      let w = norm(cross(n, tng));
      if (!isFinite(w[0])) w = norm(sideHint);
      const nn = norm(cross(tng, w));
      nrm.push(nn);
      const tw = width * (1 - (i / segs) * (opts.taper ?? 0.35));
      const t = i / segs;
      for (const s of [-0.5, 0.5]) {
        const pos = add(q, mul(w, s * tw));
        V.push({ p: pos, n: nn, uv: [atlas + (s + 0.5) * 0.25, t], w: weightFn(pos, t), c: col });
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2;
      // Deux faces visibles (matériau double face) : un seul sens suffit.
      (lod1 ? groups.lod1 : groups.lod0).push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return pts;
  }

  // ---------- Crinière ----------
  // Ligne de crête : du garrot à la nuque, point le plus haut de la section de l'encolure.
  const nA = [0, 1.22, 0.55], nB = [0, 1.99, 1.16];
  const nDir = norm(sub(nB, nA));
  const nUp = norm(cross(nDir, [1, 0, 0]));
  const crest = [];
  const nLen = Math.hypot(...sub(nB, nA));
  for (let i = 0; i <= 60; i++) {
    const t = 0.16 + (i / 60) * (nLen - 0.2);
    const c = add(nA, mul(nDir, t));
    // Lancer vers le haut-arrière jusqu'à la surface.
    let s = 0.05, q = c;
    for (let it = 0; it < 80; it++) {
      q = add(c, mul(nUp, s));
      const dd = S.fast(...q);
      if (Math.abs(dd) < 0.0005) break;
      s -= dd; // la distance croît vers l'extérieur le long du rayon
    }
    crest.push(q);
  }
  const NP = ['neck', 'neck2', 'neck3', 'head'].map(bonePos);
  const neckChain = [...NP, add(NP[3], [0, 0.01, 0.06])];
  const maneW = (pos, t) => {
    const o = chainW(neckChain, ['neck', 'neck2', 'neck3', 'head'], pos, 0.07);
    // Pointes : ressorts de crinière (rebond).
    const k = smooth(0.3, 1, t) * 0.55;
    if (k > 0) {
      const mb = pos[2] < 0.86 ? 'maneA' : 'maneB';
      for (const n in o) o[n] *= 1 - k;
      o[mb] = (o[mb] || 0) + k;
    }
    return o;
  };
  const maneCol = [];
  for (let layer = 0; layer < 2; layer++) {
    const N = layer === 0 ? 34 : 40;
    for (let i = 0; i < N; i++) {
      const f = (i + 0.5 + (rnd() - 0.5) * 0.4) / N;
      const k = f * (crest.length - 1);
      const i0 = Math.floor(k), i1 = Math.min(crest.length - 1, i0 + 1);
      const root = add(lerp3(crest[i0], crest[i1], k - i0), [-0.006 - layer * 0.004, -0.004, 0]);
      // Longueur : crinière tirée (11-15 cm), plus courte au garrot et à la nuque.
      const len = (0.1 + 0.05 * Math.sin(Math.PI * clamp(f * 1.1, 0, 1))) * (0.85 + rnd() * 0.3) * (layer ? 1 : 0.85);
      const dir = [-1, 0.55 - layer * 0.25, (rnd() - 0.5) * 0.3];
      const col = 0.75 + rnd() * 0.5;
      maneCol.push(col);
      strand(root, dir, len, 0.045 + rnd() * 0.02, 4, 0.006 + layer * 0.006, 0.55, [0, 0, 1], maneW, col, Math.floor(rnd() * 4) * 0.25, layer === 1, { lift: 0.6, taper: 0.45 });
    }
  }
  log(`crinière : ${crest.length} points de crête`);

  // ---------- Toupet ----------
  const headW = () => ({ head: 1 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 0.06;
    const root = hp(a, 0.0 + rnd() * 0.02, 0.07);
    // Partir de la nuque vers le bout du nez, posé sur le front.
    let q = root;
    for (let it = 0; it < 20; it++) {
      const dd = S.fast(...q);
      if (Math.abs(dd) < 0.0005) break;
      q = sub(q, mul(S.grad(...q), dd));
    }
    const dir = add(mul(HEAD_F, 1), [a * 3, 0, 0]);
    const len = 0.15 + rnd() * 0.06;
    strand(q, dir, len, 0.035 + rnd() * 0.015, 4, 0.006, 0.12, [1, 0, 0], headW, 0.8 + rnd() * 0.4, Math.floor(rnd() * 4) * 0.25, i % 2 === 0, { taper: 0.5 });
  }

  // ---------- Queue ----------
  const TP = ['tail', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'].map(bonePos);
  const tailChain = [...TP, [0, 0.45, -0.99]];
  const tailNames = ['tail', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'];
  const tailW = (pos) => chainW(tailChain, tailNames, pos, 0.05);
  const dockA = [0, 1.5, -0.905], dockB = [0, 1.12, -1.0];
  const dAx = norm(sub(dockB, dockA));
  const dU = norm(cross([1, 0, 0], dAx)); // vers l'arrière-haut (dessus du tronçon, côté visible)
  const dX = [1, 0, 0];
  // Couverture du tronçon : crins courts couchés vers le bas.
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 7; i++) {
      const th = (i / 6 - 0.5) * Math.PI * 1.25;
      const t = 0.02 + r * 0.09;
      const c = add(dockA, mul(dAx, t * Math.hypot(...sub(dockB, dockA)) / 0.4));
      const rr = 0.05 - t * 0.04;
      const root = add(c, add(mul(dU, Math.cos(th) * rr), mul(dX, Math.sin(th) * rr)));
      const dir = add(dAx, add(mul(dU, Math.cos(th) * 0.35), mul(dX, Math.sin(th) * 0.35)));
      strand(root, dir, 0.16 + rnd() * 0.05, 0.045, 3, 0.012, 0.15, dX, tailW, 0.85 + rnd() * 0.3, Math.floor(rnd() * 4) * 0.25, r < 2, { taper: 0.3 });
    }
  }
  // Crins longs : racines le long du tronçon, tombent jusqu'à ~0,48 m du sol (coupés droit).
  const NT = 72;
  for (let i = 0; i < NT; i++) {
    const t = 0.05 + rnd() * 0.85;
    const th = (rnd() - 0.5) * Math.PI * (i % 3 === 0 ? 2 : 1.4);
    const c = add(dockA, mul(sub(dockB, dockA), t));
    const rr = 0.04 - t * 0.02;
    const radial = add(mul(dU, Math.cos(th)), mul(dX, Math.sin(th)));
    const root = add(c, mul(radial, rr));
    const endY = 0.46 + rnd() * 0.05;
    const len = root[1] - endY + 0.05;
    const dir = add(mul(dAx, 0.7), mul(radial, 0.18));
    // Largeur de carte orientée autour de l'axe (volume visible sous tous les angles).
    const side = norm(cross(radial, [0, 1, 0]));
    strand(root, dir, len, 0.035 + rnd() * 0.03, 8, 0.012 + rnd() * 0.012, 1.3, side, tailW, 0.7 + rnd() * 0.6, Math.floor(rnd() * 4) * 0.25, i % 2 === 0, {
      taper: 0.15,
      normal: (q, n) => norm(add(mul(radial, 0.7), mul(n, 0.3))),
    });
  }
  log(`crins : ${V.length} sommets`);

  // ---------- Empaquetage ----------
  const n = V.length;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const uv = new Uint16Array(n * 2), col = new Uint8Array(n);
  const skinI = new Uint8Array(n * 4), skinW = new Uint8Array(n * 4);
  V.forEach((v, i) => {
    pos.set(v.p, i * 3);
    nor.set(v.n, i * 3);
    uv[i * 2] = Math.round(clamp(v.uv[0], 0, 1) * 65535);
    uv[i * 2 + 1] = Math.round(clamp(v.uv[1], 0, 1) * 65535);
    col[i] = Math.round(clamp(v.c / 1.5, 0, 1) * 255);
    const top = Object.entries(v.w).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((s2, e) => s2 + e[1], 0) || 1;
    const q = top.map(([, w]) => Math.floor((w / tot) * 255));
    q[0] += 255 - q.reduce((s2, x) => s2 + x, 0);
    top.forEach(([b], k) => {
      if (BONE_INDEX[b] === undefined) throw new Error(`os inconnu ${b}`);
      skinI[i * 4 + k] = BONE_INDEX[b];
      skinW[i * 4 + k] = q[k];
    });
  });
  const idx = new Uint32Array([...groups.lod1, ...groups.lod0]);
  return {
    meta: { nv: n, lod1: groups.lod1.length, lod0: idx.length },
    arrays: { hairPos: encodePositions(pos, 0.00025), hairNor: encodeNormals(nor), hairUv: uv, hairCol: col, hairSkinI: skinI, hairSkinW: skinW, hairIdx: encodeIndicesZigzag(idx) },
  };
}

function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
