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
  const pos = new Float32Array(map.size * 3);
  for (let i = 0; i < weld.length; i++) pos.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], weld[i] * 3);
  const adj = Array.from({ length: map.size }, () => new Set());
  for (let t = 0; t < I.length; t += 3) {
    const a = weld[I[t]], b = weld[I[t + 1]], c = weld[I[t + 2]];
    adj[a].add(b).add(c);
    adj[b].add(a).add(c);
    adj[c].add(a).add(b);
  }
  return { weld, n: map.size, pos, adj: adj.map((s) => [...s]) };
}

// Crins pendants de la queue et postérieurs repérés sur la géométrie (graphe soudé), sans seuils fixes en x ou z.
// Sous la ligne des fesses, la queue pendante est une pièce de surface séparée des membres, et chaque postérieur une
// pièce séparée du reste. Remplissage depuis le bout de la queue (resp. chaque sabot postérieur) sous une hauteur
// limite : la plus haute (pas de 1 cm, à partir de 0,80 m) où la pièce n'atteint ni un autre sabot ni le bout de la
// queue et, pour la queue, reste dans son couloir (|x| < 0,16 m, z < −0,70 m) ; au-delà, elle rejoint le tronc.
// Renvoie un libellé par sommet soudé (1 : crins de la queue, 2 : postérieur, 0 : ailleurs) et les hauteurs limites.
const TAIL = 1, HIND = 2;
function tailLegLabels(G, seeds) {
  const flood = (s, cut) => {
    const lab = new Uint8Array(G.n);
    lab[s] = 1;
    const st = [s];
    let outside = false;
    while (st.length) {
      const v = st.pop();
      if (Math.abs(G.pos[v * 3]) > 0.16 || G.pos[v * 3 + 2] > -0.7) outside = true;
      for (const w of G.adj[v]) if (!lab[w] && G.pos[w * 3 + 1] < cut) {
        lab[w] = 1;
        st.push(w);
      }
    }
    return { lab, outside };
  };
  const highest = (s, others, lane) => {
    let best = null;
    for (let c = 80; c <= 130; c++) {
      const f = flood(s, c / 100);
      if (others.some((o) => f.lab[o]) || (lane && f.outside)) break;
      best = { cut: c / 100, lab: f.lab };
    }
    return best;
  };
  const { tail, hl, hr, fl, fr } = seeds;
  const T = highest(tail, [hl, hr, fl, fr], true);
  if (!T) throw new Error('poids : crins de la queue non séparés des membres sous 0,80 m (repérage géométrique impossible)');
  const L = highest(hl, [hr, fl, fr, tail], false), R = highest(hr, [hl, fl, fr, tail], false);
  if (!L || !R) throw new Error('poids : postérieurs non séparés du reste du maillage sous 0,80 m (repérage géométrique impossible)');
  const lab = new Uint8Array(G.n);
  for (let g = 0; g < G.n; g++) lab[g] = T.lab[g] ? TAIL : L.lab[g] || R.lab[g] ? HIND : 0;
  return { lab, tailCut: T.cut, legCuts: [L.cut, R.cut] };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Zone admise d'un os (facteur 0..1) : queue derrière la croupe et entre les cuisses seulement (les crins pendent
// près des jarrets : sans cette limite, l'arrière des jarrets suivrait la queue) ; membres de leur côté seulement
// (transition de quelques centimètres au milieu du poitrail et du périnée). Libellés géométriques (tailLegLabels) :
// crins pendants de la queue → os de la queue seulement ; postérieurs → jamais la queue.
function zone(name, x, y, z, lab = 0) {
  if (lab === TAIL) return /^tail/.test(name) ? 1 : 0;
  if (lab === HIND && /^tail/.test(name)) return 0;
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
  // Graphe soudé et libellés géométriques (crins de la queue, postérieurs) : graines au bout de la queue et aux sabots.
  const G = weldGraph(P, I);
  const nearest = (q) => {
    let b = 0, bd = 1e9;
    for (let g = 0; g < G.n; g++) {
      const d = Math.hypot(G.pos[g * 3] - q[0], G.pos[g * 3 + 1] - q[1], G.pos[g * 3 + 2] - q[2]);
      if (d < bd) {
        bd = d;
        b = g;
      }
    }
    return b;
  };
  const TL = tailLegLabels(G, { tail: nearest(ext.tailEnd), hl: nearest(pos.hlH), hr: nearest(pos.hrH), fl: nearest(pos.flH), fr: nearest(pos.frH) });
  const label = Uint8Array.from(G.weld, (g) => TL.lab[g]);
  // Distances avec les libellés (D) et sans (D0, pour les seuls rayons typiques).
  const D = new Float32Array(nv * segs.length), D0 = new Float32Array(nv * segs.length);
  for (let v = 0; v < nv; v++) {
    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    for (let k = 0; k < segs.length; k++) {
      const d = segDist(p, segs[k].A, segs[k].B) + 1e-4;
      // Hors zone : distance rendue prohibitive (jamais os principal).
      D[v * segs.length + k] = d / Math.max(zone(segs[k].name, p[0], p[1], p[2], label[v]), 1e-3);
      D0[v * segs.length + k] = d / Math.max(zone(segs[k].name, p[0], p[1], p[2]), 1e-3);
    }
  }
  // Rayons typiques : médiane des distances des sommets attribués (2 itérations), estimés sans les libellés : sans les
  // crins, la médiane de la jambe (tibia) tombe de 10 à 7 cm et le fémur prend le grasset et la jambe ; les rayons des
  // membres restent donc ceux de l'estimation d'origine. Os principal final : avec les libellés.
  let R = new Float32Array(segs.length).fill(1);
  const primary = new Int16Array(nv);
  for (let it = 0; it < 3; it++) {
    const buckets = segs.map(() => []);
    const DD = it < 2 ? D0 : D;
    for (let v = 0; v < nv; v++) {
      let bk = 0, bd = 1e9;
      for (let k = 0; k < segs.length; k++) {
        const d = DD[v * segs.length + k] / R[k];
        if (d < bd) {
          bd = d;
          bk = k;
        }
      }
      primary[v] = bk;
      buckets[bk].push(DD[v * segs.length + bk]);
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
      const w = Wg[g * nk + k] * zone(segs[k].name, P[v * 3], P[v * 3 + 1], P[v * 3 + 2], label[v]);
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
  return {
    joints,
    weights,
    primary,
    label,
    cuts: { tail: TL.tailCut, hindLegs: TL.legCuts },
    radii: Object.fromEntries(segs.map((s, k) => [s.name, +R[k].toFixed(3)])),
    segments: segs,
  };
}

// Contrôle à la construction : crins de la queue sans poids des postérieurs, postérieurs sans poids de la queue, pas
// de poids d'un membre du côté opposé (hors de la transition médiane, |x| > 5 cm). Volume des crins : sommets libellés
// crins et, indépendamment du libellé, le couloir |x| < 0,10 m, y < 0,80 m, z < −0,85 m. Lève une erreur au-delà de
// 0,05 de poids ; renvoie les comptes (rapport).
export function checkTailWeights(P, skin, limit = 0.05) {
  const nv = P.length / 3;
  const r = {
    tailCut: skin.cuts.tail,
    hindLegCuts: skin.cuts.hindLegs,
    tailVolumeVerts: 0,
    tailHairVerts: 0,
    tailVolumeHindOver: 0,
    maxHindInTail: 0,
    hindLegVerts: 0,
    hindLegTailOver: 0,
    maxTailInHindLegs: 0,
    crossSideOver: 0,
    limit,
  };
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let h = 0, t = 0, cross = 0;
    for (let j = 0; j < 4; j++) {
      const w = skin.weights[v * 4 + j];
      if (!w) continue;
      const n = BONES[skin.joints[v * 4 + j]].name;
      if (/^h[lr]/.test(n)) h += w;
      if (/^tail/.test(n)) t += w;
      if ((x > 0.05 && /^[fh]r/.test(n)) || (x < -0.05 && /^[fh]l/.test(n))) cross += w;
    }
    if (skin.label[v] === TAIL) r.tailHairVerts++;
    if (skin.label[v] === TAIL || (Math.abs(x) < 0.1 && y < 0.8 && z < -0.85)) {
      r.tailVolumeVerts++;
      r.maxHindInTail = Math.max(r.maxHindInTail, h);
      if (h > limit) r.tailVolumeHindOver++;
    }
    if (skin.label[v] === HIND) {
      r.hindLegVerts++;
      r.maxTailInHindLegs = Math.max(r.maxTailInHindLegs, t);
      if (t > limit) r.hindLegTailOver++;
    }
    if (cross > limit) r.crossSideOver++;
  }
  r.maxHindInTail = +r.maxHindInTail.toFixed(4);
  r.maxTailInHindLegs = +r.maxTailInHindLegs.toFixed(4);
  if (r.tailVolumeHindOver || r.hindLegTailOver || r.crossSideOver) {
    throw new Error(`poids : fuite entre queue et postérieurs (${JSON.stringify(r)})`);
  }
  return r;
}
