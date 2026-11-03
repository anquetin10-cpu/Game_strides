// Cheval Tripo (essai) : poids de peau automatiques sur le squelette du jeu.
//
// Principe (variante robuste de la « chaleur des os ») :
//   1. chaque os pondéré a un segment (de son articulation à celle de son enfant, ou à une extrémité mesurée) ;
//   2. distance de chaque sommet à chaque segment, rapportée à l'épaisseur typique de l'os (rayon médian des sommets
//      qui lui reviennent : 2 itérations) ; l'os le plus proche en distance rapportée est l'os principal ;
//   3. mélange seulement entre l'os principal et ses voisins dans la hiérarchie (parent, enfants, frères), poids
//      ∝ (1/d)⁴ : pas de fuite entre membres ni de la queue vers les postérieurs ;
//   4. lissage sur le maillage (3 passes, voisins par arêtes, sommets soudés par position : pas de coutures UV), puis
//      4 influences au plus, normalisées.
// Os non pondérés (comme pour le cheval du jeu) : root, breath, maneA/B, ancres (selle, rênes, étriers, licol),
// paupières (pas de paupière dans le maillage) ; mâchoire : non pondérée dans cet essai (bouche fermée).
import { BONES, BONE_INDEX } from '../../../src/entities/horse/skeleton.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Segments des os pondérés : [os, A, B] (positions de repos en mètres).
export function boneSegments(pos, ext) {
  const p = (n) => pos[n];
  const S = [
    ['pelvis', p('pelvis'), [0, 1.4, -0.85]],
    ['loin', p('loin'), p('pelvis')],
    ['body', [0, p('body')[1], -0.25], [0, p('body')[1] - 0.03, 0.55]],
    ['neck', p('neck'), p('neck2')],
    ['neck2', p('neck2'), p('neck3')],
    ['neck3', p('neck3'), p('head')],
    ['head', p('head'), ext.muzzle],
    ['earL', p('earL'), ext.earTipL],
    ['earR', p('earR'), ext.earTipR],
    ['tail', p('tail'), p('tail2')],
    ['tail2', p('tail2'), p('tail3')],
    ['tail3', p('tail3'), p('tail4')],
    ['tail4', p('tail4'), p('tail5')],
    ['tail5', p('tail5'), p('tail6')],
    ['tail6', p('tail6'), ext.tailEnd],
  ];
  for (const s of ['l', 'r']) {
    S.push([`f${s}Sc`, p(`f${s}Sc`), p(`f${s}Hu`)], [`f${s}Hu`, p(`f${s}Hu`), p(`f${s}U`)], [`f${s}U`, p(`f${s}U`), p(`f${s}L`)]);
    S.push([`f${s}L`, p(`f${s}L`), p(`f${s}P`)], [`f${s}P`, p(`f${s}P`), p(`f${s}H`)], [`f${s}H`, p(`f${s}H`), [p(`f${s}H`)[0], 0, p(`f${s}H`)[2] + 0.02]]);
    S.push([`h${s}U`, p(`h${s}U`), p(`h${s}L`)], [`h${s}L`, p(`h${s}L`), p(`h${s}C`)], [`h${s}C`, p(`h${s}C`), p(`h${s}P`)]);
    S.push([`h${s}P`, p(`h${s}P`), p(`h${s}H`)], [`h${s}H`, p(`h${s}H`), [p(`h${s}H`)[0], 0, p(`h${s}H`)[2] + 0.02]]);
  }
  return S.map(([name, A, B]) => ({ name, A, B, i: BONE_INDEX[name] }));
}

function segDist(v, A, B) {
  const ab = sub(B, A), av = sub(v, A);
  const t = Math.max(0, Math.min(1, dot(av, ab) / dot(ab, ab)));
  const q = add(A, [ab[0] * t, ab[1] * t, ab[2] * t]);
  return Math.hypot(v[0] - q[0], v[1] - q[1], v[2] - q[2]);
}

// Voisins hiérarchiques (parent, enfants, frères) parmi les os pondérés.
function neighbours(weighted) {
  const set = new Set(weighted);
  const parent = Object.fromEntries(BONES.map((b) => [b.name, b.parent]));
  // Remonte jusqu'au premier ancêtre pondéré.
  const wp = (n) => {
    let p = parent[n];
    while (p && !set.has(p)) p = parent[p];
    return p;
  };
  const out = Object.fromEntries(weighted.map((n) => [n, new Set([n])]));
  for (const n of weighted) {
    const p = wp(n);
    if (!p) continue;
    out[n].add(p);
    out[p].add(n);
    for (const m of weighted) if (m !== n && wp(m) === p) out[n].add(m);
  }
  // Raccords anatomiques : omoplate/épaule ↔ thorax, hanche ↔ bassin et lombes, encolure ↔ thorax.
  const link = (a, b) => {
    if (out[a] && out[b]) {
      out[a].add(b);
      out[b].add(a);
    }
  };
  for (const s of ['l', 'r']) {
    link(`f${s}Sc`, 'body');
    link(`f${s}Hu`, 'body');
    link(`f${s}U`, 'body');
    link(`h${s}U`, 'pelvis');
    link(`h${s}U`, 'loin');
    link(`h${s}L`, 'loin');
    link(`h${s}L`, 'body');
  }
  link('neck', 'body');
  link('tail', 'pelvis');
  return out;
}

// Graphe des sommets soudés par position (les coutures UV ne coupent pas le lissage).
function weldGraph(P, I) {
  const key = (i) => `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
  const map = new Map(), weld = new Int32Array(P.length / 3);
  for (let i = 0; i < weld.length; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, map.size);
    weld[i] = map.get(k);
  }
  const adj = Array.from({ length: map.size }, () => new Set());
  for (let t = 0; t < I.length; t += 3) {
    const a = weld[I[t]], b = weld[I[t + 1]], c = weld[I[t + 2]];
    adj[a].add(b).add(c);
    adj[b].add(a).add(c);
    adj[c].add(a).add(b);
  }
  return { weld, n: map.size, adj: adj.map((s) => [...s]) };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Zone admise d'un os (facteur 0..1) : queue derrière la croupe et entre les cuisses seulement (les crins pendent
// près des jarrets : sans cette limite, l'arrière des jarrets suivrait la queue) ; membres de leur côté seulement
// (transition de quelques centimètres au milieu du poitrail et du périnée).
function zone(name, x, y, z) {
  if (/^tail/.test(name)) return (1 - smooth(0.11, 0.14, Math.abs(x))) * (1 - smooth(-0.8, -0.72, z));
  // Postérieurs : jamais dans le couloir des crins de la queue (entre et derrière les fesses).
  const tailLane = /^h/.test(name) ? 1 - (1 - smooth(0.07, 0.1, Math.abs(x))) * smooth(-0.9, -0.94, z) : 1;
  if (/^[fh]l/.test(name)) return smooth(-0.05, 0.02, x) * tailLane;
  if (/^[fh]r/.test(name)) return smooth(-0.05, 0.02, -x) * tailLane;
  return 1;
}

// Poids : renvoie { joints: Uint8Array(nv*4), weights: Float32Array(nv*4), primary: Int16Array(nv), radii }.
export function computeWeights(P, I, pos, ext, { power = 4, smoothPasses = 3, mix = 1.6 } = {}) {
  const segs = boneSegments(pos, ext);
  const names = segs.map((s) => s.name);
  const nb = neighbours(names);
  const nv = P.length / 3;
  const D = new Float32Array(nv * segs.length);
  for (let v = 0; v < nv; v++) {
    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    for (let k = 0; k < segs.length; k++) {
      const zf = zone(segs[k].name, p[0], p[1], p[2]);
      // Hors zone : distance rendue prohibitive (jamais os principal).
      D[v * segs.length + k] = (segDist(p, segs[k].A, segs[k].B) + 1e-4) / Math.max(zf, 1e-3);
    }
  }
  // Rayons typiques : médiane des distances des sommets attribués (2 itérations).
  let R = new Float32Array(segs.length).fill(1);
  const primary = new Int16Array(nv);
  for (let it = 0; it < 3; it++) {
    const buckets = segs.map(() => []);
    for (let v = 0; v < nv; v++) {
      let bk = 0, bd = 1e9;
      for (let k = 0; k < segs.length; k++) {
        const d = D[v * segs.length + k] / R[k];
        if (d < bd) {
          bd = d;
          bk = k;
        }
      }
      primary[v] = bk;
      buckets[bk].push(D[v * segs.length + bk]);
    }
    if (it === 2) break;
    R = Float32Array.from(buckets, (b, k) => {
      if (b.length < 20) return R[k];
      b.sort((x, y) => x - y);
      // Queue : crins étalés, rayon pris au 1er tiers et plafonné (sinon il déborde sur les cuisses).
      if (/^tail/.test(segs[k].name)) return Math.min(0.08, Math.max(0.02, b[b.length >> 1]));
      return Math.max(0.02, b[b.length >> 1]);
    });
  }
  // Poids bruts : os principal et voisins dont la distance rapportée reste proche (facteur mix).
  const idx = Object.fromEntries(names.map((n, k) => [n, k]));
  const W = new Float32Array(nv * segs.length);
  for (let v = 0; v < nv; v++) {
    const pk = primary[v];
    const d0 = D[v * segs.length + pk] / R[pk];
    let sum = 0;
    for (const n of nb[names[pk]]) {
      const k = idx[n];
      const d = D[v * segs.length + k] / R[k];
      if (d > d0 * mix) continue;
      const w = 1 / Math.pow(d, power);
      W[v * segs.length + k] = w;
      sum += w;
    }
    for (let k = 0; k < segs.length; k++) W[v * segs.length + k] /= sum;
  }
  // Lissage sur le graphe des sommets soudés.
  const G = weldGraph(P, I);
  const nk = segs.length;
  let Wg = new Float32Array(G.n * nk);
  const cnt = new Float32Array(G.n);
  for (let v = 0; v < nv; v++) {
    cnt[G.weld[v]]++;
    for (let k = 0; k < nk; k++) Wg[G.weld[v] * nk + k] += W[v * nk + k];
  }
  for (let g = 0; g < G.n; g++) for (let k = 0; k < nk; k++) Wg[g * nk + k] /= cnt[g];
  for (let pass = 0; pass < smoothPasses; pass++) {
    const nx = new Float32Array(Wg.length);
    for (let g = 0; g < G.n; g++) {
      const a = G.adj[g];
      for (let k = 0; k < nk; k++) {
        let s = 0;
        for (const h of a) s += Wg[h * nk + k];
        nx[g * nk + k] = 0.5 * Wg[g * nk + k] + 0.5 * (a.length ? s / a.length : Wg[g * nk + k]);
      }
    }
    Wg = nx;
  }
  // 4 influences, normalisées (zones réappliquées après le lissage).
  const joints = new Uint8Array(nv * 4), weights = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const g = G.weld[v];
    const top = [];
    for (let k = 0; k < nk; k++) {
      const w = Wg[g * nk + k] * zone(segs[k].name, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      if (w > 0.01) top.push([w, k]);
    }
    top.sort((a, b) => b[0] - a[0]);
    const t4 = top.slice(0, 4);
    const s = t4.reduce((a, b) => a + b[0], 0);
    t4.forEach(([w, k], j) => {
      joints[v * 4 + j] = segs[k].i;
      weights[v * 4 + j] = w / s;
    });
  }
  return { joints, weights, primary, radii: Object.fromEntries(segs.map((s, k) => [s.name, +R[k].toFixed(3)])), segments: segs };
}
