// Lint de tracé des parcours de CSO (spécification « CSO v2 », règles de tracé) : vérifie un tracé (traceCourse,
// csoCourse.js) contre des règles de dessin, dans un lieu (piste, tribunes, entrée de piste). Module pur, sans rendu :
// les tests unitaires (tests/unit/courses-lint.test.js) le passent sur chaque parcours, et il sert à les dessiner.
//
// Règles vérifiées :
// - approche droite avant chaque obstacle isolé ou premier élément de combinaison ; réception droite avant tout
//   virage ; rayon de courbe ; arc d'un même virage (≤ 200°) ; pas de S (lignes droites entre deux virages de sens
//   opposé) ;
// - combinaisons (centre à centre) : 1 foulée 7,6 – 8,0 m, 2 foulées 11,2 – 11,6 m ; lignes sur une même droite :
//   4,2 + n × 3,56 m (± 0,4 ; n = 3 à 7), pas de distance « demi-foulée » ;
// - ligne du cavalier à distance des lices ; emprise des obstacles (barres et ailes : ± (w/2 + 1,9) en travers,
//   ± (écart/2 + 0,5) en long) à distance des lices ; ligne à 5 m au moins de l'emprise des autres obstacles et jamais
//   dans leur zone d'abord (8 m devant chaque face, dans les deux sens) ; obstacles pas trop proches entre eux ;
// - caméra de concours (6,6 m derrière la ligne) jamais dans les tribunes ni à plus de 1,5 m au-delà des lices d'un
//   côté qui a des tribunes ;
// - départ 8 – 15 m avant le 1, dans son axe ; arrivée 8 – 15 m après le dernier, dans l'axe de réception, avec de quoi
//   ralentir devant ; abord naturel depuis l'entrée de piste (court, pas le long de la lice), et entrée en piste sans
//   franchir la ligne de départ ; fanions des lignes chronométrées hors du passage des chevaux ;
// - temps : longueur / 6,2 m/s ≤ temps accordé (350 m/min) − 4 s.
// Les obstacles sont repérés par leur numéro : une combinaison = éléments consécutifs 5A, 5B (5C).
// Repère local : centre de la piste, x vers l'est, z vers le sud ; cap h : direction (sin h, cos h).
import { POLE, PARIS, PARIS_STANDS } from '../world/sites.js';

// Foulée de galop à la cadence de référence (6,2 m/s) ; réception + appel autour d'un obstacle (≈ 2,1 m chacun).
export const STRIDE = 3.56;
export const LINE_BASE = 4.2;
// Combinaisons : distances centre à centre admises (1 et 2 foulées).
export const COMBI = { 1: [7.6, 8.0], 2: [11.2, 11.6] };
// Largeur des barres des obstacles de concours, ailes et jardinières de chaque côté.
export const FENCE_W = 3.8;
export const WING = 2.05; // jardinières comprises : w/2 + 1,6 + 0,45

const BASE = {
  arc: 200, sBend: 10, fenceBoards: 1.8, fenceClear: 5, fenceGap: 4, zone: 8, start: [8, 15], finish: [8, 15],
  camBack: 6.6, camOut: 1.5, speed: 350, refSpeed: 6.2, timeMargin: 4, lineTol: 0.4, lineStrides: [3, 7],
  gateExempt: 3, entryClear: 5, hug: 20, timingW: 7, postClear: 2, postLead: 1.2,
};
// Pôle International (120 × 76 m) et arène de Paris (86 × 46 m).
export const POLE_RULES = { ...BASE, approach: 18, landing: 12, radius: 13, boards: 7, runout: 15, leadInMax: 60 };
export const PARIS_RULES = { ...BASE, approach: 14.5, landing: 10, radius: 10.5, boards: 5.5, runout: 12, leadInMax: 50 };

// Temps accordé : même formule que timeAllowedFor (courses.js), sans en importer le rendu.
const taFor = (length, speed) => Math.ceil((length / speed) * 60);

// ---------- Lieux (données de sites.js, en coordonnées locales de la piste) ----------
const rectLocal = (A, r) => ({ x0: r.x - r.w / 2 - A.x, x1: r.x + r.w / 2 - A.x, z0: r.z - r.d / 2 - A.z, z1: r.z + r.d / 2 - A.z });
// Côtés de la piste bordés de tribunes.
function standSides(rects, hw, hd) {
  const s = { n: false, s: false, e: false, w: false };
  for (const r of rects) {
    if (r.z1 <= -hd + 1e-6) s.n = true;
    if (r.z0 >= hd - 1e-6) s.s = true;
    if (r.x0 >= hw - 1e-6) s.e = true;
    if (r.x1 <= -hw + 1e-6) s.w = true;
  }
  return s;
}
// Chemin d'entrée en piste : de l'accès extérieur au point d'accueil, puis tout droit encore `beyond` mètres.
function entryPath(from, gate, beyond = 14, step = 0.5) {
  const to = { x: gate.x + Math.sin(gate.h) * beyond, z: gate.z + Math.cos(gate.h) * beyond };
  const out = [];
  for (const [a, b] of [[from, gate], [gate, to]]) {
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  out.push(to);
  return out;
}
function makeVenue(name, A, stands, gate, from) {
  const hw = A.w / 2, hd = A.d / 2;
  return { name, hw, hd, stands, sides: standSides(stands, hw, hd), gate, entry: entryPath(from, gate) };
}
// Pôle : tribunes au nord ; entrée au milieu du grand côté sud, accueil 5 m à l'intérieur, cap au nord (CSO_GATE).
export const POLE_VENUE = makeVenue('Pôle International', POLE.arena, [rectLocal(POLE.arena, POLE.stands)],
  { x: POLE.entrance.x - POLE.arena.x, z: POLE.arena.d / 2 - 5, h: Math.PI },
  { x: POLE.entrance.x - POLE.arena.x, z: POLE.entrance.z - POLE.arena.z });
// Paris : tribunes au nord, au sud et à l'est ; porte des cavaliers à l'ouest (PARIS.door), accueil PARIS.gate.
export const PARIS_VENUE = makeVenue('Grand Prix de Paris Indoor', PARIS.arena, PARIS_STANDS.map((r) => rectLocal(PARIS.arena, r)),
  { x: PARIS.gate.x - PARIS.arena.x, z: PARIS.gate.z - PARIS.arena.z, h: PARIS.gate.rot },
  { x: PARIS.door.x - PARIS.arena.x, z: PARIS.door.z - PARIS.arena.z });

// ---------- Géométrie ----------
const fwd = (h) => ({ x: Math.sin(h), z: Math.cos(h) });
const lat = (h) => ({ x: Math.cos(h), z: -Math.sin(h) });
// Emprise d'un obstacle : demi-longueur (sens du saut) et demi-largeur (barres, ailes, jardinières).
const footprint = (f) => ({ a: (f.spread || 0) / 2 + 0.5, b: FENCE_W / 2 + WING });
// Position d'un point dans le repère de l'obstacle : u le long du saut, v en travers.
function local(f, p) {
  const n = fwd(f.rot), t = lat(f.rot);
  const dx = p.x - f.x, dz = p.z - f.z;
  return { u: dx * n.x + dz * n.z, v: dx * t.x + dz * t.z };
}
function footDist(f, p) {
  const { a, b } = footprint(f);
  const q = local(f, p);
  const du = Math.abs(q.u) - a, dv = Math.abs(q.v) - b;
  if (du <= 0 && dv <= 0) return Math.max(du, dv);
  return Math.hypot(Math.max(0, du), Math.max(0, dv));
}
// Zone d'abord : bande de la largeur de l'emprise, de la face jusqu'à `zone` m devant, d'un côté comme de l'autre.
function inZone(f, p, zone) {
  const q = local(f, p);
  const face = (f.spread || 0) / 2;
  return Math.abs(q.v) <= FENCE_W / 2 + WING && Math.abs(q.u) >= face && Math.abs(q.u) <= face + zone;
}
function corners(f) {
  const { a, b } = footprint(f);
  const n = fwd(f.rot), t = lat(f.rot);
  const out = [];
  for (const su of [-1, 1]) for (const sv of [-1, 1]) out.push({ x: f.x + n.x * a * su + t.x * b * sv, z: f.z + n.z * a * su + t.z * b * sv });
  // Milieux des côtés (distance entre deux emprises qui se croisent par les côtés).
  for (const su of [-1, 1]) out.push({ x: f.x + n.x * a * su, z: f.z + n.z * a * su });
  for (const sv of [-1, 1]) out.push({ x: f.x + t.x * b * sv, z: f.z + t.z * b * sv });
  return out;
}
const footGap = (f, g) => Math.max(0, Math.min(...corners(f).map((c) => footDist(g, c)), ...corners(g).map((c) => footDist(f, c))));
const boardDist = (V, p) => Math.min(V.hw - Math.abs(p.x), V.hd - Math.abs(p.z));
// Distance, droit devant, jusqu'à la lice.
function aheadToBoards(V, p, h) {
  const d = fwd(h);
  let best = Infinity;
  if (Math.abs(d.x) > 1e-9) best = Math.min(best, ((d.x > 0 ? V.hw : -V.hw) - p.x) / d.x);
  if (Math.abs(d.z) > 1e-9) best = Math.min(best, ((d.z > 0 ? V.hd : -V.hd) - p.z) / d.z);
  return best;
}
// Ligne chronométrée franchie dans son sens entre deux positions (même test que courses.js, demi-largeur `half`).
function crosses(L, p0, p1, half) {
  const n = fwd(L.rot);
  const s0 = (p0.x - L.x) * n.x + (p0.z - L.z) * n.z;
  const s1 = (p1.x - L.x) * n.x + (p1.z - L.z) * n.z;
  const u = Math.abs((p1.x - L.x) * n.z - (p1.z - L.z) * n.x);
  return s0 < 0 && s1 >= 0 && u < half;
}
function segPointDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - a.x - dx * k, p.z - a.z - dz * k);
}
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// Combinaisons : éléments consécutifs de même numéro (5A, 5B, 5C).
function unitsOf(fences) {
  const units = [];
  fences.forEach((f, i) => {
    const m = /^(\d+)([A-C])$/.exec(f.label);
    const last = units[units.length - 1];
    if (m && m[2] !== 'A' && last && last.num === m[1]) last.els.push(i);
    else units.push({ num: m ? m[1] : f.label, els: [i] });
  });
  return units;
}

// ---------- Lint ----------
// trace : résultat de traceCourse ; rules : POLE_RULES / PARIS_RULES ; venue : POLE_VENUE / PARIS_VENUE.
// Renvoie { violations: [texte], metrics }.
export function lintCourse(trace, rules = POLE_RULES, venue = POLE_VENUE) {
  const R = rules, V = venue;
  const out = [];
  const bad = (msg) => out.push(msg);
  const { fences, marks } = trace;
  const segs = trace.segs || [];
  const lead = trace.leadIn || [];
  const all = [...lead.slice(0, -1), ...trace.pts];
  const sEnd = trace.pts[trace.pts.length - 1].s;
  const sLead = lead.length ? lead[0].s : 0;

  // Lignes droites (tronçons F consécutifs) et virages (courbes consécutives de même sens).
  const straights = [], turns = [];
  for (const g of segs) {
    const prev = straights[straights.length - 1];
    if (g.kind === 'F') {
      if (prev && Math.abs(prev.s1 - g.s0) < 1e-6) prev.s1 = g.s1;
      else straights.push({ s0: g.s0, s1: g.s1, h: g.h });
    } else {
      const t = turns[turns.length - 1];
      if (t && t.dir === g.kind && Math.abs(t.s1 - g.s0) < 1e-6) {
        t.s1 = g.s1;
        t.arc += g.a;
        t.r = Math.min(t.r, g.r);
      } else turns.push({ dir: g.kind, s0: g.s0, s1: g.s1, arc: g.a, r: g.r });
      if (g.r < R.radius - 1e-9) bad(`courbe ${g.kind} à s = ${r1(g.s0)} m : rayon ${g.r} m < ${R.radius} m`);
    }
  }
  const straightOf = (s) => straights.find((st) => s >= st.s0 - 1e-6 && s <= st.s1 + 1e-6) || null;
  const lastStraight = straights.find((st) => Math.abs(st.s1 - sEnd) < 1e-6) || null;
  turns.forEach((t, i) => {
    if (t.arc > R.arc + 1e-9) bad(`virage ${t.dir} à s = ${r1(t.s0)} m : ${t.arc}° > ${R.arc}°`);
    const n = turns[i + 1];
    if (n && n.dir !== t.dir && n.s0 - t.s1 < R.sBend - 1e-6) bad(`S entre les virages de s = ${r1(t.s0)} et ${r1(n.s0)} m : ${r1(n.s0 - t.s1)} m droits < ${R.sBend} m`);
  });

  // Obstacles : ligne droite de chacun, combinaisons, lignes.
  const fst = fences.map((f) => straightOf(f.s));
  fences.forEach((f, i) => {
    if (!fst[i]) bad(`obstacle ${f.label} hors d'une ligne droite`);
    if (f.kind === 'o' && (f.spread < 1.2 - 1e-9 || f.spread > 1.5 + 1e-9)) bad(`oxer ${f.label} : écart ${f.spread} m hors de 1,2 – 1,5 m`);
  });
  const units = unitsOf(fences);
  const fm = fences.map((f) => ({ label: f.label, kind: f.kind, spread: f.spread, approach: null, landing: null }));
  const combos = [], lines = [];
  units.forEach((u, k) => {
    const first = u.els[0], last = u.els[u.els.length - 1];
    // Éléments d'une combinaison : même ligne droite, distance d'une ou deux foulées.
    for (let j = 1; j < u.els.length; j++) {
      const a = fences[u.els[j - 1]], b = fences[u.els[j]];
      const d = b.s - a.s;
      const strides = Object.keys(COMBI).find((n) => d >= COMBI[n][0] - 1e-9 && d <= COMBI[n][1] + 1e-9);
      combos.push({ labels: `${a.label}–${b.label}`, d: r2(d), strides: strides ? Number(strides) : null });
      if (fst[u.els[j]] !== fst[u.els[j - 1]]) bad(`combinaison ${a.label} – ${b.label} : éléments pas sur la même ligne droite`);
      if (!strides) bad(`combinaison ${a.label} – ${b.label} : ${r2(d)} m (ni 7,6 – 8,0 m ni 11,2 – 11,6 m)`);
    }
    const f = fences[first], st = fst[first];
    const prevU = units[k - 1], nextU = units[k + 1];
    const prev = prevU ? prevU.els[prevU.els.length - 1] : -1;
    const next = nextU ? nextU.els[0] : -1;
    if (st) {
      // Approche : depuis la fin du dernier virage, ou depuis l'obstacle précédent s'il est sur la même ligne droite.
      const from = prev >= 0 && fst[prev] === st ? fences[prev].s : st.s0;
      fm[first].approach = r1(f.s - from);
      if (f.s - from < R.approach - 1e-6) bad(`abord du ${f.label} : ${r1(f.s - from)} m droits < ${R.approach} m`);
      // Ligne : deux obstacles (ou combinaisons) sur la même ligne droite, à un nombre entier de foulées.
      if (prev >= 0 && fst[prev] === st) {
        const d = f.s - fences[prev].s;
        const n = (d - LINE_BASE) / STRIDE;
        const k2 = Math.round(n);
        const ok = k2 >= R.lineStrides[0] && k2 <= R.lineStrides[1] && Math.abs(d - (LINE_BASE + k2 * STRIDE)) <= R.lineTol + 1e-9;
        const free = d > LINE_BASE + (R.lineStrides[1] + 0.5) * STRIDE;
        lines.push({ from: fences[prev].label, to: f.label, d: r2(d), strides: ok ? k2 : free ? null : r1(n) });
        if (!ok && !free) bad(`ligne ${fences[prev].label} – ${f.label} : ${r2(d)} m = ${r1(n)} foulées (attendu 4,2 + n × 3,56 ± ${R.lineTol} m, n = ${R.lineStrides[0]} à ${R.lineStrides[1]})`);
      }
    }
    const fl = fences[last], stl = fst[last];
    if (stl) {
      // Réception : jusqu'au virage suivant (ou jusqu'à l'obstacle suivant de la même ligne) ; après le dernier, la
      // ligne d'arrivée puis la place qui reste devant.
      let to = next >= 0 && fst[next] === stl ? fences[next].s : stl.s1;
      if (stl === lastStraight && next < 0) to += Math.max(0, aheadToBoards(V, trace.pts[trace.pts.length - 1], trace.pts[trace.pts.length - 1].h) - R.boards);
      fm[last].landing = r1(to - fl.s);
      if (to - fl.s < R.landing - 1e-6) bad(`réception du ${fl.label} : ${r1(to - fl.s)} m droits < ${R.landing} m`);
    }
  });

  // Groupes de points fautifs consécutifs : un message par passage (pire valeur).
  const runs = (test, label) => {
    let cur = null;
    const flush = () => {
      if (cur) bad(`${label} : ${r2(cur.worst)} m de s = ${r1(cur.s0)} à ${r1(cur.s1)} m`);
      cur = null;
    };
    for (const p of all) {
      const v = test(p);
      if (v === null) {
        flush();
        continue;
      }
      if (!cur) cur = { s0: p.s, s1: p.s, worst: v };
      cur.s1 = p.s;
      cur.worst = Math.min(cur.worst, v);
    }
    flush();
  };

  // Lices.
  let minBoards = Infinity;
  for (const p of all) if (p.s - sLead >= R.gateExempt) minBoards = Math.min(minBoards, boardDist(V, p));
  runs((p) => (p.s - sLead >= R.gateExempt && boardDist(V, p) < R.boards - 1e-6 ? boardDist(V, p) : null), `ligne à moins de ${R.boards} m des lices`);
  let minFenceBoards = Infinity;
  for (const f of fences) {
    const d = Math.min(...corners(f).map((c) => boardDist(V, c)));
    minFenceBoards = Math.min(minFenceBoards, d);
    if (d < R.fenceBoards - 1e-6) bad(`emprise du ${f.label} à ${r2(d)} m des lices (< ${R.fenceBoards} m)`);
  }

  // Autres obstacles : emprise et zone d'abord (hors de la ligne droite de l'obstacle lui-même).
  let minClear = Infinity;
  fences.forEach((f, i) => {
    const st = fst[i];
    const own = (p) => st && p.s >= st.s0 - 1e-6 && p.s <= st.s1 + 1e-6;
    for (const p of all) if (!own(p)) minClear = Math.min(minClear, footDist(f, p));
    runs((p) => (!own(p) && footDist(f, p) < R.fenceClear - 1e-6 ? footDist(f, p) : null), `ligne à moins de ${R.fenceClear} m de l'emprise du ${f.label}`);
    runs((p) => (!own(p) && inZone(f, p, R.zone) ? footDist(f, p) : null), `ligne dans la zone d'abord du ${f.label}`);
    for (const p of V.entry) {
      const d = footDist(f, p);
      if (d < R.fenceClear - 1e-6) {
        bad(`entrée en piste à ${r2(d)} m de l'emprise du ${f.label}`);
        break;
      }
    }
  });
  let minGap = Infinity;
  for (let i = 0; i < fences.length; i++) {
    for (let j = i + 1; j < fences.length; j++) {
      if (fst[i] && fst[i] === fst[j]) continue;
      const d = footGap(fences[i], fences[j]);
      minGap = Math.min(minGap, d);
      if (d < R.fenceGap - 1e-6) bad(`obstacles ${fences[i].label} et ${fences[j].label} trop proches : ${r2(d)} m entre emprises`);
    }
  }

  // Caméra de concours : derrière le cheval, jamais dans les tribunes ni loin derrière la lice d'un côté à tribunes.
  const cam = (p) => {
    const f = fwd(p.h);
    return { x: p.x - f.x * R.camBack, z: p.z - f.z * R.camBack };
  };
  const camOut = (c) => {
    let worst = null;
    const add = (v) => (worst = worst === null ? v : Math.min(worst, v));
    for (const r of V.stands) if (c.x > r.x0 && c.x < r.x1 && c.z > r.z0 && c.z < r.z1) add(0);
    const S = V.sides, o = R.camOut;
    if (S.n && c.z < -V.hd - o) add(c.z + V.hd + o);
    if (S.s && c.z > V.hd + o) add(V.hd + o - c.z);
    if (S.e && c.x > V.hw + o) add(V.hw + o - c.x);
    if (S.w && c.x < -V.hw - o) add(c.x + V.hw + o);
    return worst;
  };
  runs((p) => camOut(cam(p)), 'caméra dans les tribunes ou au-delà de la lice');

  // Départ, arrivée.
  const f1 = fences[0], fl = fences[fences.length - 1];
  let dStart = null, dFinish = null, runout = null;
  if (!marks.start) bad('pas de ligne de départ');
  else {
    dStart = f1.s - marks.start.s;
    if (straightOf(marks.start.s) !== fst[0]) bad('ligne de départ hors de l’axe du 1');
    if (dStart < R.start[0] - 1e-6 || dStart > R.start[1] + 1e-6) bad(`départ à ${r1(dStart)} m du 1 (attendu ${R.start[0]} – ${R.start[1]} m)`);
  }
  if (!marks.finish) bad("pas de ligne d'arrivée");
  else {
    dFinish = marks.finish.s - fl.s;
    if (straightOf(marks.finish.s) !== fst[fences.length - 1]) bad(`ligne d'arrivée hors de l'axe de réception du ${fl.label}`);
    if (dFinish < R.finish[0] - 1e-6 || dFinish > R.finish[1] + 1e-6) bad(`arrivée à ${r1(dFinish)} m du ${fl.label} (attendu ${R.finish[0]} – ${R.finish[1]} m)`);
    runout = aheadToBoards(V, marks.finish, marks.finish.rot);
    if (runout < R.runout - 1e-6) bad(`arrivée : ${r1(runout)} m devant jusqu'à la lice (< ${R.runout} m pour ralentir)`);
  }
  // Fanions et cellules des lignes chronométrées (à w/2 et w/2 + 0,6 m de l'axe) : à l'écart du chemin d'entrée, du
  // reste de la ligne (hors de leur propre ligne droite) et des obstacles. L'abord depuis l'entrée peut passer entre les
  // fanions d'une ligne (avant la cloche, rien n'est chronométré) mais pas les frôler.
  let minPosts = Infinity, minPostsLead = Infinity;
  for (const [name, L] of [['départ', marks.start], ['arrivée', marks.finish]]) {
    if (!L) continue;
    const st = straightOf(L.s), t = lat(L.rot);
    const own = (p) => st && p.s >= st.s0 - 1e-6 && p.s <= st.s1 + 1e-6;
    const posts = [];
    for (const u of [R.timingW / 2, R.timingW / 2 + 0.6]) for (const sg of [-1, 1]) posts.push({ x: L.x + t.x * u * sg, z: L.z + t.z * u * sg });
    let near = Infinity, nearLead = Infinity;
    for (const q of posts) {
      const d = (p) => Math.hypot(p.x - q.x, p.z - q.z);
      for (const p of V.entry) near = Math.min(near, d(p));
      for (const p of trace.pts) if (!own(p)) near = Math.min(near, d(p));
      for (const p of lead) if (!own(p)) nearLead = Math.min(nearLead, d(p));
      for (const f of fences) near = Math.min(near, Math.max(0, footDist(f, q)));
    }
    minPosts = Math.min(minPosts, near);
    minPostsLead = Math.min(minPostsLead, nearLead);
    const label = name === 'départ' ? 'de départ' : "d'arrivée";
    if (near < R.postClear - 1e-6) bad(`fanions de la ligne ${label} à ${r2(near)} m du passage des chevaux ou d'un obstacle (< ${R.postClear} m)`);
    if (nearLead < R.postLead - 1e-6) bad(`fanions de la ligne ${label} à ${r2(nearLead)} m de l'abord depuis l'entrée (< ${R.postLead} m)`);
  }

  // Abord depuis l'entrée de piste : il part de l'accueil, reste court et ne longe pas la lice ; l'entrée en piste ne
  // franchit pas la ligne de départ.
  const leadLen = -sLead;
  let hug = 0;
  if (V.gate) {
    if (!lead.length || lead.length < 2) bad("pas d'abord tracé depuis l'entrée de piste");
    else {
      const g = V.gate, p0 = lead[0];
      const dh = Math.abs(Math.atan2(Math.sin(p0.h - g.h), Math.cos(p0.h - g.h)));
      if (Math.hypot(p0.x - g.x, p0.z - g.z) > 1 || dh > (10 * Math.PI) / 180) bad("l'abord ne part pas de l'entrée de piste");
      if (leadLen > R.leadInMax + 1e-6) bad(`abord de ${r1(leadLen)} m depuis l'entrée (> ${R.leadInMax} m)`);
      for (let i = 1; i < lead.length; i++) if (lead[i].s - sLead >= R.gateExempt && boardDist(V, lead[i]) < R.boards + 3) hug += lead[i].s - lead[i - 1].s;
      if (hug > R.hug + 1e-6) bad(`abord le long de la lice sur ${r1(hug)} m (> ${R.hug} m)`);
    }
    if (marks.start) {
      const L = marks.start, t = lat(L.rot), w = R.timingW / 2;
      const a = { x: L.x - t.x * w, z: L.z - t.z * w }, b = { x: L.x + t.x * w, z: L.z + t.z * w };
      let near = Infinity;
      for (let i = 0; i < V.entry.length; i++) {
        near = Math.min(near, segPointDist(V.entry[i], a, b));
        if (i && crosses(L, V.entry[i - 1], V.entry[i], w + 2)) {
          bad("l'entrée en piste franchit la ligne de départ");
          break;
        }
      }
      if (near < R.entryClear - 1e-6) bad(`ligne de départ à ${r2(near)} m du chemin d'entrée (< ${R.entryClear} m)`);
    }
  }

  // Temps accordé (vitesse nationale, sur la longueur arrondie au mètre comme en jeu) et temps au galop de référence.
  const length = trace.length;
  const ta = taFor(Math.round(length), R.speed);
  const time = length / R.refSpeed;
  if (time > ta - R.timeMargin + 1e-9) bad(`temps : ${r1(time)} s à ${R.refSpeed} m/s > temps accordé ${ta} s − ${R.timeMargin} s`);

  return {
    violations: out,
    metrics: {
      length: r1(length), ta, time: r1(time), leadIn: r1(leadLen), leadInAlongBoards: r1(hug),
      fences: fm, turns: turns.map((t) => ({ dir: t.dir, r: t.r, arc: t.arc })), combos, lines,
      start: dStart === null ? null : r1(dStart), finish: dFinish === null ? null : r1(dFinish), runout: runout === null ? null : r1(runout),
      minBoards: r2(minBoards), minFenceBoards: r2(minFenceBoards), minFenceClear: r2(minClear), minFenceGap: r2(minGap),
      minApproach: Math.min(...fm.filter((f) => f.approach !== null).map((f) => f.approach)),
      minLanding: Math.min(...fm.filter((f) => f.landing !== null).map((f) => f.landing)),
      minRadius: Math.min(...turns.map((t) => t.r)), minPosts: r2(minPosts), minPostsLead: r2(minPostsLead),
    },
  };
}

// Tableau lisible des mesures d'un tracé (tests, revue de tracé).
export function lintTable(name, res) {
  const m = res.metrics;
  const rows = [`${name} — ${m.length} m, temps accordé ${m.ta} s (350 m/min), ${m.time} s à 6,2 m/s ; abord depuis l'entrée ${m.leadIn} m`];
  rows.push('  obstacle  nature  écart  abord  réception');
  for (const f of m.fences) rows.push(`  ${f.label.padEnd(8)}  ${f.kind.padEnd(6)}  ${String(f.spread || '').padEnd(5)}  ${String(f.approach ?? '—').padEnd(5)}  ${f.landing ?? '—'}`);
  rows.push(`  virages : ${m.turns.map((t) => `${t.dir} ${t.r} m ${t.arc}°`).join(' · ')}`);
  rows.push(`  combinaisons : ${m.combos.map((c) => `${c.labels} ${c.d} m (${c.strides} f.)`).join(' · ') || '—'}`);
  rows.push(`  lignes : ${m.lines.map((l) => `${l.from}–${l.to} ${l.d} m (${l.strides ?? 'libre'} f.)`).join(' · ') || '—'}`);
  rows.push(`  départ ${m.start} m avant le 1 · arrivée ${m.finish} m après le dernier, ${m.runout} m devant · lices ≥ ${m.minBoards} m · emprises ≥ ${m.minFenceBoards} m des lices · autres obstacles ≥ ${m.minFenceClear} m · entre emprises ≥ ${m.minFenceGap} m`);
  return rows.join('\n');
}
