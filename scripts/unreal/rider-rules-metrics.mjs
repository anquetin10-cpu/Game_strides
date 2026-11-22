// Essai de monte, voie A : grandeurs M1 à M18 des règles de monte (unreal/docs/parite/monte/oracle-monte.md §2.5), calculées
// par ce seul script à partir de n'importe quel dossier au format strides.oracle.rider_rules/1 (oracle O1 exporté du web par
// scripts/unreal/export-rider-rules.mjs ; plus tard O2 et les sorties Unreal au même format) : les métriques ne peuvent
// donc pas diverger entre le web et Unreal.
//
// Les profils de flanc et d'encolure s'interpolent avec les fonctions de la règle elle-même (flankAt, crestAt et
// THIGH_MARGIN relus dans src/entities/human/anim.js, jamais recopiés). Unités : mètres et radians dans les calculs ;
// centimètres et degrés dans le compte rendu.
//
// Usage : node scripts/unreal/rider-rules-metrics.mjs [--in=unreal/core/tests/oracles/monte/o1] [--out=unreal/docs/parite/monte/v3-mesures]
//   écrit <out>.json (synthèses par scénario, sur la fenêtre de mesure de chaque scénario) et <out>.md (compte rendu).
//   Sortie déterministe : mêmes fichiers d'entrée, mêmes octets.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

// ---- Fonctions de profil de la règle, relues dans son source ----
const ANIM_SRC = readFileSync(join(ROOT, 'src/entities/human/anim.js'), 'utf8');
function ruleFn(name) {
  const m = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(ANIM_SRC);
  if (!m) throw new Error(`anim.js : fonction ${name} introuvable`);
  return m[0];
}
const ruleConst = (name) => {
  const m = new RegExp(`const ${name} = ([0-9.]+);`).exec(ANIM_SRC);
  if (!m) throw new Error(`anim.js : constante ${name} introuvable`);
  return Number(m[1]);
};
const { flankAt, crestAt } = new Function(`${ruleFn('flankAt')}\n${ruleFn('crestAt')}\nreturn { flankAt, crestAt };`)();
const THIGH_MARGIN = ruleConst('THIGH_MARGIN');

// ---- Vecteurs ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => len(sub(a, b));
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const norm = (a) => mul(a, 1 / (len(a) || 1));
const DEG = 180 / Math.PI;
const angle = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(norm(u), norm(v)))));
const ang3 = (o, a, b) => angle(sub(a, o), sub(b, o)) * DEG;
// Rotation d'un vecteur par un quaternion [x, y, z, w] ; conj : rotation inverse.
function qrot(q, v) {
  const [x, y, z, w] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const qAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * DEG;

// Os de la continuité par quaternions locaux (mêmes os que tests/e2e/pjl/rider-audit.mjs:95, pour la continuité avec la v2).
const Q_NAMES = ['hips', 'spine', 'chest', 'neck', 'head', 'lClav', 'lArm', 'lFore', 'lHand', 'rClav', 'rArm', 'rFore', 'rHand', 'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot'];
const SIDES = [['l', 'L', 1], ['r', 'R', -1]];

// ---- Grandeurs d'une image ----
// run : { setup, frames } ; i : indice de l'image ; ctx : { ref (plante de référence de M3) }.
export function frameMetrics(run, i, ctx = {}) {
  const S = run.setup, fr = run.frames[i], prev = i > 0 ? run.frames[i - 1] : null, prev2 = i > 1 ? run.frames[i - 2] : null;
  const s = S.scale, rig = S.rig;
  const B = (n) => S.bones.indexOf(n);
  const P = (f, n) => f.cl[B(n)];
  const pt = (f, n) => f.cl[S.bones.length + S.points.indexOf(n)];
  const fit = fr.in?.fit;
  const R = fr.dg || {};
  const m = { f: fr.f };
  const L = (rig.thighLen + rig.shinLen) * s;
  const neck = P(fr, 'neck'), hips = P(fr, 'hips'), head = P(fr, 'head');
  const upS = qrot(conj(fr.hz.S.slice(3)), [0, 1, 0]);
  for (const [sd, SD, sg] of SIDES) {
    const hip = P(fr, sd + 'Thigh'), knee = P(fr, sd + 'Shin'), ankle = P(fr, sd + 'Foot'), toe = P(fr, sd + 'Toe');
    const pl = pt(fr, 'plante' + SD), sh = P(fr, sd + 'Arm'), el = P(fr, sd + 'Fore'), wr = P(fr, sd + 'Hand');
    const iron = fr.hz.ir[sd === 'l' ? 0 : 1];
    if (fit) {
      // M1 : plante – point d'étrier visé (anim.js:772).
      m['M1y' + SD] = pl[1] - s * (fit.stirrupY + (R.post || 0) * 0.012 + (R.two || 0) * 0.02);
      m['M1z' + SD] = pl[2] - s * (fit.stirrupZ - (R.two || 0) * 0.02);
      // M2 : écart latéral de la plante au réglage stirrupX ; M2b : cheville au-delà de sa place naturelle (≤ 0 attendu).
      m['M2' + SD] = sg * pl[0] - s * fit.stirrupX;
      const xm = fr.tg[sd === 'l' ? 'xL' : 'xR'];
      m['M2b' + SD] = xm === null ? null : sg * ankle[0] - xm;
    }
    // M3 : dérive de la plante depuis la référence (première image de la fenêtre).
    if (ctx.ref) {
      const r = ctx.ref[sd];
      m['M3y' + SD] = pl[1] - r[1];
      m['M3z' + SD] = pl[2] - r[2];
    }
    // M4 : plante – étrier affiché ; M4a : avant-pied – étrier affiché, moins 0,015·scale (horse.js:209-210, par construction).
    m['M4' + SD] = dist(pl, iron);
    m['M4a' + SD] = dist(toe, iron) - 0.015 * s;
    // Écart cible – résultat des solveurs (oracle-monte.md §2.3) : cheville contre _P.feet[s].pos, poignet contre _P.hands[s].
    m['ciblePied' + SD] = dist(ankle, fr.tg['f' + SD]);
    m['ciblePoignet' + SD] = dist(wr, fr.tg['h' + SD]);
    // M5 : étrivière, porte-étrivière → œil de l'étrier, 0,115 m au-dessus de l'étrier, verticale du monde (rider-audit.mjs:155).
    m['M5' + SD] = dist(fr.hz.an['bar' + SD], add(iron, mul(upS, 0.115)));
    // M6 : portée de la jambe.
    m['M6' + SD] = dist(hip, ankle) / L;
    // M7 : écarts au flanc vu par la règle (anim.js:560-569 et :650-652), unités du modèle puis mètres.
    const fl = fit ? (sg > 0 ? fit.flankL : fit.flankR) : null;
    if (fl) {
      const clr = fit.legClear || 0;
      const gap = (p) => (sg * (p[0] / s) - (flankAt(fl, p[1] / s) + clr)) * s;
      const g = {
        genou: gap(knee), tibia35: gap(lerp(knee, ankle, 0.35)), tibia65: gap(lerp(knee, ankle, 0.65)),
        cuisse50: gap(lerp(hip, knee, 0.5)) - THIGH_MARGIN * s, cuisse75: gap(lerp(hip, knee, 0.75)) - THIGH_MARGIN * s,
      };
      for (const [k, v] of Object.entries(g)) m['M7' + k + SD] = v;
      m['M7min' + SD] = Math.min(...Object.values(g));
    }
    // M9 : poignet au-dessus de l'encolure (anim.js:852).
    if (fit?.crest) {
      const c = crestAt(fit.crest, wr[2] / s + 0.06);
      m['M9' + SD] = Number.isFinite(c) ? (wr[1] / s - c) * s : null;
    }
    // M10 : allonge du bras et coude.
    m['M10' + SD] = dist(wr, sh) / ((rig.upperArmLen + rig.foreArmLen) * s);
    m['coude' + SD] = ang3(el, sh, wr);
    // M11 : hanche (cou – hanche – genou), genou, cheville (genou – cheville – avant-pied), comme rider-audit.mjs:112-114.
    m['hanche' + SD] = ang3(hip, neck, knee);
    m['genou' + SD] = ang3(knee, hip, ankle);
    m['cheville' + SD] = ang3(ankle, knee, toe);
    // M12 : ouverture du genou autour de l'axe hanche – cheville, dans S (0 = avant, > 0 = dehors).
    const ax = norm(sub(ankle, hip));
    let kd = sub(knee, hip);
    kd = sub(kd, mul(ax, dot(kd, ax)));
    m['ouvGenou' + SD] = Math.atan2(sg * kd[0], kd[2]) * DEG;
    // M15 : talon bas et pointe ouverte (cheville → avant-pied), moins la direction de repos du rig (os lToe/rToe).
    const d = sub(toe, ankle), rest = S.rest[sd + 'Toe'];
    m['talon' + SD] = (Math.atan2(d[1], Math.hypot(d[0], d[2])) - Math.atan2(rest[1], Math.hypot(rest[0], rest[2]))) * DEG;
    m['pointe' + SD] = (Math.atan2(sg * d[0], d[2]) - Math.atan2(sg * rest[0], rest[2])) * DEG;
    // M18 : longueur des rênes (mors → poing).
    m['rene' + SD] = dist(fr.hz.an['bit' + SD], pt(fr, 'poing' + SD));
    // Rendu réaliste (information) : botte contre plante, poignet contre poignet, poignet réaliste au-dessus de l'encolure.
    if (fr.rz && S.real) {
      const nb = S.real.bones.length, k = sd === 'l' ? 0 : 1;
      const rpl = fr.rz[nb + 2 + k], rwr = fr.rz[S.real.bones.indexOf('hand_' + sd)];
      m['botte' + SD] = dist(rpl, pl);
      m['botteDy' + SD] = rpl[1] - pl[1];
      m['botteDz' + SD] = rpl[2] - pl[2];
      m['botteEtrier' + SD] = dist(rpl, iron);
      m['poignet' + SD] = dist(rwr, wr);
      if (fit?.crest) {
        const c = crestAt(fit.crest, rwr[2] / s + 0.06);
        m['M9real' + SD] = Number.isFinite(c) ? (rwr[1] / s - c) * s : null;
      }
    }
  }
  m.talonCible = (0.14 + (R.two || 0) * 0.06 + (R.jumpK || 0) * 0.04) * DEG; // anim.js:767
  m.ecartPoignets = dist(P(fr, 'lHand'), P(fr, 'rHand'));
  m.cibleBassin = dist(hips, fr.tg.hp);
  // M8 : pénétration (mesurée dans la page, méthode des 6 rayons).
  m.M8 = fr.pe ? fr.pe[0] : null;
  m.M8at = fr.pe ? fr.pe[1] : null;
  // M13 : buste et tête, verticale vraie, plan avant du cheval (H) ; rider-audit.mjs:123-126.
  const qS = fr.hz.S.slice(3), fwH = qrot(fr.hz.H.slice(3), [0, 0, 1]);
  const tw = qrot(qS, sub(neck, hips)), hw = qrot(qS, sub(head, neck));
  m.buste = Math.atan2(dot(tw, fwH), tw[1]) * DEG;
  m.tete = Math.atan2(dot(hw, fwH), hw[1]) * DEG;
  // M14 : assise (bassin au-dessus de sa hauteur assise) et avance du bassin.
  m.assise = hips[1] - rig.seatToHips * s;
  m.bassinAv = hips[2];
  // M16 : continuité (directions de segments dans S ; quaternions locaux comme rider-audit) ; à-coup = différence seconde.
  if (prev) {
    const seg = (f) => {
      const o = {};
      for (const [sd] of SIDES) {
        o[sd + 'cuisse'] = sub(P(f, sd + 'Shin'), P(f, sd + 'Thigh'));
        o[sd + 'tibia'] = sub(P(f, sd + 'Foot'), P(f, sd + 'Shin'));
        o[sd + 'pied'] = sub(P(f, sd + 'Toe'), P(f, sd + 'Foot'));
        o[sd + 'bras'] = sub(P(f, sd + 'Fore'), P(f, sd + 'Arm'));
        o[sd + 'avantBras'] = sub(P(f, sd + 'Hand'), P(f, sd + 'Fore'));
      }
      return o;
    };
    const a = seg(fr), b = seg(prev), c = prev2 ? seg(prev2) : null;
    let wMax = -1, wAt = null, jerk = 0;
    for (const k of Object.keys(a)) {
      const w = angle(a[k], b[k]) * DEG;
      if (w > wMax) (wMax = w), (wAt = k);
      if (c) jerk = Math.max(jerk, Math.abs(w - angle(b[k], c[k]) * DEG));
    }
    m.rotSeg = wMax;
    m.rotSegAt = wAt;
    m.acoupSeg = c ? jerk : null;
    const qi = (n) => S.cq.indexOf(n);
    let qMax = -1, qAt = null, qJerk = 0;
    for (const n of Q_NAMES) {
      const w = qAngle(fr.cq[qi(n)], prev.cq[qi(n)]);
      if (w > qMax) (qMax = w), (qAt = n);
      if (prev2) qJerk = Math.max(qJerk, Math.abs(w - qAngle(prev.cq[qi(n)], prev2.cq[qi(n)])));
    }
    m.rotQ = qMax;
    m.rotQAt = qAt;
    m.acoupQ = prev2 ? qJerk : null;
    m.bassinV = dist(hips, P(prev, 'hips'));
  }
  return m;
}

// ---- Synthèse d'un scénario sur sa fenêtre ----
const KEEP_LR = ['M1y', 'M1z', 'M2', 'M2b', 'M3y', 'M3z', 'M4', 'M4a', 'ciblePied', 'ciblePoignet', 'M5', 'M6', 'M7genou', 'M7tibia35', 'M7tibia65', 'M7cuisse50', 'M7cuisse75', 'M7min', 'M9', 'M10', 'coude', 'hanche', 'genou', 'cheville', 'ouvGenou', 'talon', 'pointe', 'rene', 'botte', 'botteDy', 'botteDz', 'botteEtrier', 'poignet', 'M9real'];
const KEEP = ['M8', 'cibleBassin', 'buste', 'tete', 'assise', 'bassinAv', 'rotSeg', 'acoupSeg', 'rotQ', 'acoupQ', 'bassinV', 'ecartPoignets', 'talonCible'];
const r6 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1e6) / 1e6);

export function summarize(run) {
  const S = run.setup, [w0, w1] = S.window;
  const pl = (i, sd) => run.frames[i].cl[S.bones.length + S.points.indexOf('plante' + (sd === 'l' ? 'L' : 'R'))];
  const ref = { l: pl(w0, 'l'), r: pl(w0, 'r') };
  const rows = [];
  for (let i = w0; i < w1; i++) rows.push(frameMetrics(run, i, { ref }));
  const stat = (k) => {
    const v = rows.map((r) => r[k]).filter((x) => typeof x === 'number' && Number.isFinite(x));
    if (!v.length) return null;
    const at = (x) => rows.find((r) => r[k] === x).f;
    const mn = Math.min(...v), mx = Math.max(...v);
    return { min: r6(mn), minAt: at(mn), max: r6(mx), maxAt: at(mx), mean: r6(v.reduce((a, b) => a + b, 0) / v.length), n: v.length };
  };
  const out = { id: run.id, frames: run.frames.length, window: S.window, fade: S.fade, stats: {} };
  for (const k of KEEP_LR) for (const SD of ['L', 'R']) {
    const st = stat(k + SD);
    if (st) out.stats[k + SD] = st;
  }
  for (const k of KEEP) {
    const st = stat(k);
    if (st) out.stats[k] = st;
  }
  // Lieux des extrêmes (os ou point).
  const maxRow = (k) => rows.reduce((a, r) => ((r[k] ?? -1) > (a[k] ?? -1) ? r : a), rows[0]);
  out.where = { M8: maxRow('M8').M8at ?? null, rotSeg: maxRow('rotSeg').rotSegAt ?? null, rotQ: maxRow('rotQ').rotQAt ?? null };
  // Contrôle M4a sur TOUTES les images en selle (pas seulement la fenêtre).
  let m4a = 0;
  for (let i = 0; i < run.frames.length; i++) {
    const m = frameMetrics(run, i);
    m4a = Math.max(m4a, Math.abs(m.M4aL), Math.abs(m.M4aR));
  }
  out.M4aMaxAll = m4a;
  out.phases = jumpPhases(run);
  return { summary: out, rows };
}

// ---- M17 : phases du saut (images) ----
export function jumpPhases(run) {
  const F = run.frames;
  const air = F.filter((f) => f.in && f.in.jump >= 0);
  if (!air.length) return null;
  const first = (pred, from = 0) => {
    for (let i = from; i < F.length; i++) if (pred(F[i], i)) return F[i].f;
    return null;
  };
  const iAir0 = F.indexOf(air[0]), iAir1 = F.indexOf(air[air.length - 1]);
  const kMaxI = F.reduce((a, f, i) => (f.dg && f.dg.jumpK > F[a].dg.jumpK ? i : a), 0);
  const up50 = first((f) => f.dg && f.dg.jumpK >= 0.5);
  const iUp50 = up50 === null ? -1 : F.findIndex((f) => f.f === up50);
  const P = {
    appel: F[iAir0].f,
    sommet: first((f) => f.in && f.in.jump >= 0.5),
    poserAnterieurs: first((f) => f.in && f.in.landT === 0),
    poserPosterieursDetecte: first((f, i) => i > iAir1 && f.in && f.in.hindDown),
    poserPosterieursRegle: first((f) => f.dg && f.dg.hd >= 0),
    jumpK50Montee: up50,
    jumpKMax: F[kMaxI].f,
    jumpKMaxValeur: r6(F[kMaxI].dg.jumpK),
    jumpK50Descente: iUp50 < 0 ? null : first((f) => f.dg.jumpK < 0.5, kMaxI),
    jumpK10Descente: iUp50 < 0 ? null : first((f) => f.dg.jumpK < 0.1, kMaxI),
    // Phases visibles du cheval (rider-audit.mjs:415-417) : hauteur des os des sabots au-dessus du sol.
    chevalPosterieursDecollent: first((f) => f.hz.jT >= 0 && f.hz.cT >= 0 && Math.min(f.hz.hv[2], f.hz.hv[3]) > 0.05),
    chevalAnterieursPosent: first((f, i) => i > iAir0 + 3 && Math.min(f.hz.hv[0], f.hz.hv[1]) < 0.06),
    chevalPosterieursPosent: first((f, i) => i > iAir1 && Math.min(f.hz.hv[2], f.hz.hv[3]) < 0.1),
    posterieursPlusBasApresReception: r6(Math.min(...F.slice(iAir1 + 1).map((f) => Math.min(f.hz.hv[2], f.hz.hv[3])))),
  };
  const ix = (f) => F.findIndex((x) => x.f === f);
  P.au = {};
  for (const k of ['appel', 'sommet', 'poserAnterieurs', 'poserPosterieursRegle', 'jumpKMax']) {
    if (P[k] === null) continue;
    const m = frameMetrics(run, ix(P[k]));
    P.au[k] = { genou: r6(Math.max(m.genouL, m.genouR)), genouMin: r6(Math.min(m.genouL, m.genouR)), rho: r6(Math.max(m.M6L, m.M6R)), hanche: r6(Math.min(m.hancheL, m.hancheR)), buste: r6(m.buste), assise: r6(m.assise), M1y: r6(Math.max(m.M1yL, m.M1yR)), M9: r6(Math.min(m.M9L ?? 9, m.M9R ?? 9)), M7min: r6(Math.min(m.M7minL ?? 9, m.M7minR ?? 9)) };
  }
  return P;
}

// ---- Compte rendu ----
// Nombres à la française (virgule décimale, jamais « -0,0 »).
const fr = (v, d) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const t = v.toFixed(d);
  return (Number(t) === 0 ? (0).toFixed(d) : t).replace('.', ',');
};
const cm = (v, d = 1) => (v === null || v === undefined ? '—' : fr(v * 100, d));
const dg = (v, d = 1) => fr(v, d);
const fx = (v, d = 3) => fr(v, d);
const both = (st, k, f, w = 'min') => {
  const a = st[k + 'L'], b = st[k + 'R'];
  if (!a && !b) return null;
  if (w === 'min') return Math.min(a?.min ?? Infinity, b?.min ?? Infinity);
  if (w === 'max') return Math.max(a?.max ?? -Infinity, b?.max ?? -Infinity);
  return ((a?.mean ?? 0) + (b?.mean ?? 0)) / ((a ? 1 : 0) + (b ? 1 : 0));
};
const range = (st, k, f) => `${f(both(st, k, f, 'min'))} à ${f(both(st, k, f, 'max'))}`;
const one = (st, k, f) => (st[k] ? `${f(st[k].min)} à ${f(st[k].max)}` : '—');

function markdown(index, results, srcRel) {
  const L = [];
  const R = Object.fromEntries(results.map((r) => [r.summary.id, r]));
  const any = results[0].run.setup;
  const s = any.scale;
  L.push('# Mesures v3 des règles de monte (oracle O1)');
  L.push('');
  L.push(`Écrit par \`scripts/unreal/rider-rules-metrics.mjs\` à partir de \`${srcRel}\` (export \`scripts/unreal/export-rider-rules.mjs\`, schéma \`${index.schema}\`, arbre \`src\` ${index.srcTree ?? 'non relevé'}). Ne pas modifier à la main : relancer les deux scripts.`);
  L.push('');
  L.push('Première mesure de la v3 (constat 1 d’`oracle-monte.md`). Les règles sont mesurées sur le squelette classique de 25 os, où elles sont appliquées ; le modèle réaliste `rider_f.glb` n’est que le rendu visible (constat 2). Grandeurs : `oracle-monte.md` §2.5. Statistiques sur la fenêtre de mesure de chaque scénario (après le fondu de mise en selle), côtés gauche et droit confondus sauf mention. Repère du siège S : x vers la gauche, y vers le haut, z vers l’avant.');
  L.push('');
  L.push(`Cavalière : échelle ${fr(any.scale, 3)}, jambe (cuisse + jambe) ${cm((any.rig.thighLen + any.rig.shinLen) * s)} cm, bras ${cm((any.rig.upperArmLen + any.rig.foreArmLen) * s)} cm. Cheval : ${any.horse.name ?? '—'} (\`${any.horse.id ?? '—'}\`), WildMesh.`);
  L.push('');
  L.push('## Scénarios');
  L.push('');
  L.push('| Id | Scénario | Images | Fenêtre | Fin du fondu | Acceptation de l’essai |');
  L.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const S = r.run.setup;
    L.push(`| ${r.summary.id} | ${r.run.desc}${S.events ? ` ; événements : ${S.events.join(', ') || 'aucun'}` : ''} | ${r.summary.frames} | ${S.window[0]} à ${S.window[1] - 1} | ${S.fade} | ${S.scenario.accept ? 'oui' : 'non (exporté pour plus tard)'} |`);
  }
  L.push('');
  L.push('## Contrôle de lecture (critère de l’étape 2)');
  L.push('');
  const m4 = Math.max(...results.map((r) => r.summary.M4aMaxAll));
  L.push(`L’étrier affiché est posé sur l’os de l’avant-pied moins \`0,015 · scale\` en y du monde (\`horse.js:209-210\`) : la distance avant-pied – étrier vaut donc ${fr(0.015 * s, 6)} m (0,015 × ${fr(s, 3)}), et non 0,015 m comme l’écrit le plan. Écart maximal à cette valeur, à toutes les images exportées de tous les scénarios : **${m4.toExponential(2).replace('.', ',')} m** (critère : 1e-6 m). L’export lit donc les bons os aux bonnes images.`);
  L.push('');
  L.push('## Contacts (cm)');
  L.push('');
  L.push('M1 : plante – point d’étrier visé (y, z). M2 : écart latéral de la plante au réglage stirrupX. M3 : dérive de la plante depuis la première image de la fenêtre. M4 : plante – étrier affiché. M5 : étrivière. M7 : écart au flanc vu par la règle, minimum sur genou, tibia (35 et 65 %), cuisse (50 et 75 %, moins 2 cm) ; < 0 : dans le profil. M8 : pénétration des axes d’os dans le maillage du cheval. M9 : poignet au-dessus de l’encolure (cible de la règle : 10 cm).');
  L.push('');
  L.push('| Id | M1 y | M1 z | M2 | M3 y | M3 z | M4 | M5 | M7 min | M8 max | M9 min |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const st = r.summary.stats;
    L.push(`| ${r.summary.id} | ${range(st, 'M1y', cm)} | ${range(st, 'M1z', cm)} | ${range(st, 'M2', cm)} | ${range(st, 'M3y', cm)} | ${range(st, 'M3z', cm)} | ${range(st, 'M4', cm)} | ${range(st, 'M5', cm)} | ${cm(both(st, 'M7min', cm, 'min'))} | ${st.M8 ? cm(st.M8.max) + (r.summary.where.M8 ? ` (${r.summary.where.M8})` : '') : '—'} | ${cm(both(st, 'M9', cm, 'min'))} |`);
  }
  L.push('');
  L.push('Écart cible – résultat des solveurs (cm) : cheville contre la cheville visée, poignet contre le poignet visé, bassin contre le bassin visé (squelette classique, après l’image).');
  L.push('');
  L.push('| Id | cheville | poignet | bassin | M2b (cheville au-delà de sa place naturelle, ≤ 0 attendu) | M5 gauche | M5 droite |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    const st = r.summary.stats;
    L.push(`| ${r.summary.id} | ${range(st, 'ciblePied', cm)} | ${range(st, 'ciblePoignet', cm)} | ${one(st, 'cibleBassin', cm)} | ${range(st, 'M2b', cm)} | ${one(st, 'M5L', cm)} | ${one(st, 'M5R', cm)} |`);
  }
  L.push('');
  L.push('## Posture (degrés, sauf ρ et allonge du bras)');
  L.push('');
  L.push('M6 : portée de la jambe ρ = hanche–cheville / jambe (règle : 0,93 assis, 0,95 hors de la selle). M10 : allonge du bras (règle : 0,97 au plus). M11 : angles articulaires (180 = tendu). M12 : ouverture du genou (> 0 : dehors). M13 : buste (> 0 : en avant de la verticale). M14 : assise, bassin au-dessus de sa hauteur assise (cm). M15 : talon bas et pointe ouverte, par rapport au pied au repos (cible de talon de la règle : 8,0° à 13,8°).');
  L.push('');
  L.push('| Id | ρ | genou | hanche | cheville | ouv. genou | coude | allonge bras | buste | assise (cm) | talon | pointe |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const st = r.summary.stats;
    L.push(`| ${r.summary.id} | ${range(st, 'M6', (v) => fx(v, 3))} | ${range(st, 'genou', dg)} | ${range(st, 'hanche', dg)} | ${range(st, 'cheville', dg)} | ${range(st, 'ouvGenou', dg)} | ${range(st, 'coude', dg)} | ${range(st, 'M10', (v) => fx(v, 3))} | ${one(st, 'buste', dg)} | ${one(st, 'assise', cm)} | ${range(st, 'talon', dg)} | ${range(st, 'pointe', dg)} |`);
  }
  L.push('');
  L.push('## Continuité (M16) et mains (M18)');
  L.push('');
  L.push('Rotation maximale d’un segment (cuisse, tibia, pied, bras, avant-bras) d’une image à l’autre, dans S, et à-coup (différence seconde) ; même mesure sur les quaternions locaux des 19 os de `rider-audit.mjs` (continuité avec la v2 ; cible v3 : moins de 15° par image en régime établi) ; déplacement du bassin dans S.');
  L.push('');
  L.push('| Id | segment max (°/image) | à-coup segment | quaternion max (°/image) | à-coup quaternion | bassin max (cm/image) | écart des poignets (cm) | rênes (cm) |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const st = r.summary.stats, w = r.summary.where;
    L.push(`| ${r.summary.id} | ${st.rotSeg ? dg(st.rotSeg.max) + ` (${w.rotSeg})` : '—'} | ${st.acoupSeg ? dg(st.acoupSeg.max) : '—'} | ${st.rotQ ? dg(st.rotQ.max) + ` (${w.rotQ})` : '—'} | ${st.acoupQ ? dg(st.acoupQ.max) : '—'} | ${st.bassinV ? cm(st.bassinV.max) : '—'} | ${one(st, 'ecartPoignets', cm)} | ${range(st, 'rene', cm)} |`);
  }
  L.push('');
  L.push('## Phases du saut (M17), en images depuis la mise en selle (1 image = 1/30 s)');
  L.push('');
  const jumps = results.filter((r) => r.summary.phases);
  if (jumps.length) {
    const keys = [
      ['appel', 'appel (vol du jeu commencé)'], ['sommet', 'sommet (vol à 0,5)'], ['poserAnterieurs', 'poser des antérieurs (landT = 0)'],
      ['poserPosterieursDetecte', 'postérieurs reposés détectés (hindDown)'], ['poserPosterieursRegle', 'postérieurs reposés pour la règle (détectés ou holdMax)'],
      ['jumpK50Montee', 'position d’obstacle à 50 % (montée)'], ['jumpKMax', 'position d’obstacle maximale'], ['jumpK50Descente', 'retour à 50 %'], ['jumpK10Descente', 'retour à 10 %'],
      ['chevalPosterieursDecollent', 'cheval : postérieurs décollent (> 5 cm)'], ['chevalAnterieursPosent', 'cheval : antérieurs posent (< 6 cm)'], ['chevalPosterieursPosent', 'cheval : postérieurs posent (< 10 cm)'],
    ];
    L.push(`| Instant | ${jumps.map((r) => r.summary.id).join(' | ')} |`);
    L.push(`|---|${jumps.map(() => '---').join('|')}|`);
    for (const [k, lab] of keys) L.push(`| ${lab} | ${jumps.map((r) => r.summary.phases[k] ?? '—').join(' | ')} |`);
    L.push(`| position d’obstacle maximale (jumpK) | ${jumps.map((r) => fx(r.summary.phases.jumpKMaxValeur, 3)).join(' | ')} |`);
    L.push(`| postérieurs : plus bas après la réception (cm ; seuil HIND_DOWN 10 cm) | ${jumps.map((r) => cm(r.summary.phases.posterieursPlusBasApresReception)).join(' | ')} |`);
    L.push('');
    L.push('Posture aux instants clés (genou : plus ouvert des deux, en degrés ; ρ : plus grande ; hanche : plus fermée ; assise et M1 y : cm ; M9, M7 : minimum, cm) :');
    L.push('');
    L.push('| Id | Instant | genou | ρ | hanche | buste | assise | M1 y | M9 | M7 min |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of jumps) for (const [k, v] of Object.entries(r.summary.phases.au)) {
      L.push(`| ${r.summary.id} | ${k} | ${dg(v.genou)} | ${fx(v.rho, 3)} | ${dg(v.hanche)} | ${dg(v.buste)} | ${cm(v.assise)} | ${cm(v.M1y)} | ${cm(v.M9)} | ${cm(v.M7min)} |`);
    }
  }
  L.push('');
  L.push('## Écart entre le rendu réaliste et les règles (information, constat 2)');
  L.push('');
  L.push('Ce que Julien voit dans le web est le modèle réaliste `rider_f.glb`, qui recopie les rotations du squelette classique avec ses propres longueurs. Botte : plante calée du modèle réaliste (sous l’os `ball`, 1,2 cm au-dessus de la semelle des bottes, 5 mm en arrière, calée sur la pose de repos ; `setup.real`) contre la plante des règles ; Δy > 0 : botte au-dessus. Poignet : `hand_l/r` contre `lHand/rHand`.');
  L.push('');
  L.push('| Id | botte – plante | Δy | Δz | botte – étrier affiché | poignet réaliste – règles | poignet réaliste au-dessus de l’encolure (min) | poignet des règles (min) |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const st = r.summary.stats;
    L.push(`| ${r.summary.id} | ${range(st, 'botte', cm)} | ${range(st, 'botteDy', cm)} | ${range(st, 'botteDz', cm)} | ${range(st, 'botteEtrier', cm)} | ${range(st, 'poignet', cm)} | ${cm(both(st, 'M9real', cm, 'min'))} | ${cm(both(st, 'M9', cm, 'min'))} |`);
  }
  L.push('');
  // ---- J3 ----
  L.push('## Longueur d’étriers v3 : chiffres pour la décision de Julien (J3)');
  L.push('');
  const pf = any.pjlFit, pr = any.pjlRest;
  // pjlHorse.js:259 : stirrupY = clamp(iron.y − seat.y − 0.06, −0.85, −0.64) ; stirrupZ = clamp(iron.z − seat.z − 0.09, −0.10, 0.16).
  const rawY = pr ? pr.ironL[1] - pr.seat[1] - 0.06 : null;
  const rawZ = pr ? pr.ironL[2] - pr.seat[2] - 0.09 : null;
  L.push(`- **Réglage du cheval** (\`pjlHorse.js:252-260\`) : stirrupY retenu **${cm(pf.stirrupY)} cm** sous le point d’assise ; valeur avant bornage (ancre d’étrier au repos − siège − 6 cm) ${cm(rawY)} cm, bornée entre −85 et −64 cm${rawY !== null && rawY > -0.64 ? ` : **la borne la plus courte (−64 cm) s’applique** ; l’ancre seule donnerait un étrier plus court de ${fr((rawY + 0.64) * 1000, 1)} mm` : ''}. stirrupZ ${cm(pf.stirrupZ)} cm (avant bornage ${cm(rawZ)} cm), stirrupX ${cm(pf.stirrupX)} cm.`);
  const e1 = R.E1?.summary.stats;
  if (e1) {
    L.push(`- **À l’arrêt (E1)** : genou ${dg(both(e1, 'genou', dg, 'mean'))}° en moyenne (${range(e1, 'genou', dg)}), ρ ${fx(both(e1, 'M6', fx, 'mean'), 3)} (${range(e1, 'M6', (v) => fx(v, 3))} ; plafond assis 0,93), hanche ${dg(both(e1, 'hanche', dg, 'mean'))}°, cheville ${dg(both(e1, 'cheville', dg, 'mean'))}°, talon ${dg(both(e1, 'talon', dg, 'mean'))}° ; étrivière gauche ${one(e1, 'M5L', cm)} cm, droite ${one(e1, 'M5R', cm)} cm ; plante au-dessus du point d’étrier visé : ${range(e1, 'M1y', cm)} cm (M1 y).`);
  }
  for (const id of ['E2g', 'E2d']) {
    const st = R[id]?.summary.stats;
    if (st) L.push(`- **Galop (${id})** : genou ${range(st, 'genou', dg)}°, ρ ${range(st, 'M6', (v) => fx(v, 3))}, hanche ${range(st, 'hanche', dg)}°, assise ${one(st, 'assise', cm)} cm, dérive de la plante M3 y ${range(st, 'M3y', cm)} cm et z ${range(st, 'M3z', cm)} cm, étrivière gauche ${one(st, 'M5L', cm)} cm, droite ${one(st, 'M5R', cm)} cm.`);
  }
  for (const id of ['E3', 'E3b']) {
    const r = R[id];
    if (!r?.summary.phases) continue;
    const a = r.summary.phases.au.sommet, st = r.summary.stats;
    L.push(`- **Saut (${id})** : au sommet (image ${r.summary.phases.sommet}) genou ${dg(a?.genou)}°, ρ ${fx(a?.rho, 3)} (plafond hors de la selle 0,95), hanche ${dg(a?.hanche)}°, assise ${cm(a?.assise)} cm ; sur la fenêtre : genou ${range(st, 'genou', dg)}°, ρ ${range(st, 'M6', (v) => fx(v, 3))}, assise ${one(st, 'assise', cm)} cm.`);
  }
  // Sensibilité géométrique : pose E1 moyenne, bassin fixe, cheville déplacée verticalement.
  if (R.E1) {
    const run = R.E1.run, S = run.setup, [w0, w1] = S.window;
    const B = (n) => S.bones.indexOf(n);
    const avg = (n) => {
      const a = [0, 0, 0];
      for (let i = w0; i < w1; i++) for (let k = 0; k < 3; k++) a[k] += run.frames[i].cl[B(n)][k] / (w1 - w0);
      return a;
    };
    const a = len(S.rest.lShin) * S.scale, b = len(S.rest.lFoot) * S.scale;
    const hip = avg('lThigh'), ank = avg('lFoot');
    const knee = (dy) => {
      const d = dist(hip, [ank[0], ank[1] + dy, ank[2]]);
      return Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b)))) * DEG;
    };
    const rho = (dy) => dist(hip, [ank[0], ank[1] + dy, ank[2]]) / ((S.rig.thighLen + S.rig.shinLen) * S.scale);
    L.push(`- **Sensibilité (estimation géométrique, pas une mesure)** : pose moyenne de E1, côté gauche, bassin fixe, cheville déplacée verticalement du raccourcissement donné. Au-delà de ρ 0,93 (assis), la règle ne laisse pas la jambe s’allonger : elle abaisse le bassin de quelques centimètres au plus puis remonte le pied ; un allongement n’est donc pas lisible ici, il sera rejoué par O2 (étape 3, option \`--fit stirrupY=…\`).`);
    L.push('');
    L.push('| Étrier raccourci de | 0 cm | 1 cm | 2 cm | 3 cm | 5 cm | 8 cm |');
    L.push('|---|---|---|---|---|---|---|');
    L.push(`| genou (°) | ${[0, 1, 2, 3, 5, 8].map((c) => dg(knee(c / 100))).join(' | ')} |`);
    L.push(`| ρ | ${[0, 1, 2, 3, 5, 8].map((c) => fx(rho(c / 100), 3)).join(' | ')} |`);
  }
  L.push('');
  L.push('## Limites de ces mesures');
  L.push('');
  L.push('- Jeu web servi par Vite dans Chrome sans tête (SwiftShader), pas fixe de 1/30 s, graine fixe : ce sont les règles du jeu, pas une mesure biomécanique (`riderPosture.test.js:1-3`).');
  L.push('- Chaque scénario part d’une mise en selle immédiate (`Human.mount`, sans la séquence animée) ; les scénarios de galop partent de l’arrêt avec 60 images de mise en train, ce qui diffère de l’audit v2 où ils s’enchaînaient.');
  L.push('- E4 et E5 (montée, descente) ne sont pas exportés à cette étape ; E6 (trot, virage à droite) l’est, hors acceptation.');
  L.push('- M8 est mesuré dans la page (rayons contre le maillage skinné du cheval), seulement dans la fenêtre de mesure.');
  L.push('');
  return L.join('\n');
}

export function loadRuns(dir) {
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  if (index.schema !== 'strides.oracle.rider_rules/1') throw new Error(`schéma inattendu : ${index.schema}`);
  const runs = index.runs.map((e) => JSON.parse(readFileSync(join(dir, e.file), 'utf8')));
  return { index, runs };
}

// ---- Programme ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
  const IN = arg('in', join(ROOT, 'unreal/core/tests/oracles/monte/o1'));
  const OUTP = arg('out', join(ROOT, 'unreal/docs/parite/monte/v3-mesures'));
  if (!existsSync(join(IN, 'index.json'))) throw new Error(`index absent : ${IN}`);
  const { index, runs } = loadRuns(IN);
  const results = runs.map((run) => ({ run, ...summarize(run) }));
  const srcRel = relative(ROOT, IN) || IN;
  const json = {
    schema: 'strides.monte.v3_mesures/1',
    generator: 'scripts/unreal/rider-rules-metrics.mjs',
    source: srcRel,
    srcTree: index.srcTree ?? null,
    doc: 'synthèses des grandeurs M1 à M18 (oracle-monte.md §2.5) sur la fenêtre de mesure de chaque scénario : min, max, moyenne, images des extrêmes ; mètres, degrés pour les angles (hanche, genou, cheville, coude, ouvGenou, buste, tete, talon, pointe, rot*, acoup*, talonCible), rapports sans unité (M6, M10) ; suffixes L et R : côtés gauche et droit ; phases du saut (M17) en images ; M4aMaxAll : écart maximal de la distance avant-pied – étrier affiché à 0,015 · scale, toutes images.',
    scenarios: results.map((r) => r.summary),
  };
  writeFileSync(OUTP + '.json', JSON.stringify(json, null, 1) + '\n');
  writeFileSync(OUTP + '.md', markdown(index, results, srcRel));
  console.log(`écrits : ${relative(ROOT, OUTP)}.json, ${relative(ROOT, OUTP)}.md (${results.length} scénarios)`);
}
