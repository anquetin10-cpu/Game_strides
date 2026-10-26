// Locomotion procédurale du cheval : allures réelles (pas 4 temps latéral, trot diagonal avec projection,
// galop 3 temps à main gauche/droite, grand galop 4 temps transversal), sabots verrouillés au sol pendant l'appui,
// cinématique inverse plane à plusieurs articulations (épaule/coude/genou/boulet ; hanche/grasset-jarret couplés
// par l'appareil réciproque), tangage et pompage du tronc issus de la charge des membres, encolure, queue, oreilles,
// respiration, repos d'un postérieur, saut (appel, planer en bascule, réception), cabrer, brouter.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../../core/math.js';
import { MODEL_SCALE } from './skeleton.js';

const TAU = Math.PI * 2;
const ang = (dz, dy) => Math.atan2(dz, -dy); // 0 = vers le bas, + = vers l'avant
const wrap01 = (u) => u - Math.floor(u);
const sstep = (a, b, x) => smoothstep(a, b, x);
const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

// ---------- Allures : fréquence de foulée, facteur de service, instants de poser dans la foulée [AG, AD, PG, PD] ----------
// Pas : PG, AG, PD, AD (séquence latérale) ; trot : diagonales PG+AD / PD+AG ; galop à gauche : PD, (PG+AD), AG ;
// grand galop à gauche (transversal) : PD, PG, AD, AG.
const GAIT = {
  walk: { off: [0.25, 0.75, 0.0, 0.5], f: (v) => clamp(0.62 + 0.18 * v, 0.72, 1.12), duty: (v) => clamp(0.66 - 0.035 * v, 0.56, 0.68), lift: [0.11, 0.08], knee: 1.05, fet: 1.0 },
  trot: { off: [0.515, 0.015, 0.0, 0.5], f: (v) => clamp(1.04 + 0.09 * v, 1.22, 1.7), duty: (v) => clamp(0.48 - 0.025 * (v - 3.5), 0.36, 0.5), lift: [0.2, 0.15], knee: 1.65, fet: 1.4 },
  canterL: { off: [0.5, 0.29, 0.27, 0.0], f: (v) => clamp(1.32 + 0.068 * v, 1.62, 2.12), duty: (v) => clamp(0.55 - 0.022 * v, 0.3, 0.46), lift: [0.22, 0.17], knee: 1.7, fet: 1.5 },
  canterR: { off: [0.29, 0.5, 0.0, 0.27], f: null, duty: null, lift: null },
  gallopL: { off: [0.5, 0.38, 0.11, 0.0], f: (v) => clamp(1.4 + 0.056 * v, 1.95, 2.55), duty: (v) => clamp(0.36 - 0.0095 * v, 0.17, 0.3), lift: [0.26, 0.22], knee: 1.85, fet: 1.6 },
  gallopR: { off: [0.38, 0.5, 0.0, 0.11], f: null, duty: null, lift: null },
};
GAIT.canterR.f = GAIT.canterL.f;
GAIT.canterR.duty = GAIT.canterL.duty;
GAIT.canterR.lift = GAIT.canterL.lift;
GAIT.canterR.knee = GAIT.canterL.knee;
GAIT.canterR.fet = GAIT.canterL.fet;
GAIT.gallopR.f = GAIT.gallopL.f;
GAIT.gallopR.duty = GAIT.gallopL.duty;
GAIT.gallopR.lift = GAIT.gallopL.lift;
GAIT.gallopR.knee = GAIT.gallopL.knee;
GAIT.gallopR.fet = GAIT.gallopL.fet;

// Seuils entre les allures réelles (pas 1,9 m/s, trot 4,6, galop de travail 6,5, grand galop 14) : le galop
// commence dès 5,6 m/s, le grand galop au-delà de 10,5 m/s (galop allongé).
export const GAIT_EDGES = { walk: 3.2, trot: 5.6, canter: 10.5 };
export function gaitIndex(speed) {
  if (speed < 0.3) return 0;
  if (speed < GAIT_EDGES.walk) return 1;
  if (speed < GAIT_EDGES.trot) return 2;
  if (speed < GAIT_EDGES.canter) return 3;
  return 4;
}

// ---------- Préparation des chaînes de membres (une fois par squelette) ----------
const FORE = (s) => ['Sc', 'Hu', 'U', 'L', 'P', 'H'].map((k) => `f${s}${k}`);
const HIND = (s) => ['U', 'L', 'C', 'P', 'H'].map((k) => `h${s}${k}`);

function worldRest(bones, name) {
  // Position de repos dans l'espace racine (somme des positions locales de repos).
  const v = new THREE.Vector3();
  let b = bones[name];
  while (b && b.name !== 'root') {
    v.add(b.userData.rest);
    b = b.parent;
  }
  return v;
}

function setupLegs(bones) {
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const s = i % 2 === 0 ? 'l' : 'r';
    const names = front ? FORE(s) : HIND(s);
    const parentName = front ? 'body' : 'pelvis';
    const P0 = worldRest(bones, parentName);
    const J = names.map((n) => worldRest(bones, n).sub(P0)); // articulations dans le repère du parent (repos)
    const hoofC = J[J.length - 1];
    // Point d'appui (centre de la sole) et pince, sous l'articulation du pied.
    const K = MODEL_SCALE; // unités du modèle par mètre réel
    const sole = new THREE.Vector3(hoofC.x, hoofC.y - 0.06 * K, hoofC.z + 0.01 * K);
    const toe = new THREE.Vector3(hoofC.x, sole.y, hoofC.z + 0.075 * K);
    // Segments plans (z, y) depuis l'articulation proximale de la chaîne.
    const start = front ? 1 : 0; // l'omoplate est gérée à part
    const pts = J.slice(start).concat([sole]);
    const seg = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const dz = pts[k + 1].z - pts[k].z, dy = pts[k + 1].y - pts[k].y;
      seg.push({ L: Math.hypot(dz, dy), a0: ang(dz, dy) });
    }
    legs.push({
      i,
      front,
      side: s === 'l' ? 1 : -1,
      names,
      bones: names.map((n) => bones[n]),
      parent: bones[parentName],
      J,
      sole,
      toe,
      seg,
      scap: front ? J[0] : null,
      // Position neutre du sabot dans l'espace racine (au sol).
      neutral: new THREE.Vector3(sole.x + P0.x, 0, sole.z + P0.z),
      soleHeight: sole.y + P0.y,
      K,
    });
  }
  return legs;
}

// Chaînes préparées, par squelette (sans propriété ajoutée à l’objet des os).
const LEGS_CACHE = new WeakMap();
function legsOf(bones) {
  let l = LEGS_CACHE.get(bones);
  if (!l) LEGS_CACHE.set(bones, (l = setupLegs(bones)));
  return l;
}

// ---------- Solveur plan : chaîne de segments, inconnues = flexion θ (couplée) et rotation d'ensemble ----------
// abs[k] = a0_k + rot + Σ_{j≤k} (c_j θ + p_j)  (a0_k : angle absolu de repos du segment k)
const _abs = new Float64Array(8);
function chainEnd(seg, n, cpl, off, theta, out) {
  let z = 0, y = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    acc += cpl[k] * theta + off[k];
    const a = seg[k].a0 + acc;
    _abs[k] = a;
    z += Math.sin(a) * seg[k].L;
    y -= Math.cos(a) * seg[k].L;
  }
  out[0] = z;
  out[1] = y;
}
const _e = [0, 0];
function solveChain(seg, n, cpl, off, tz, ty, lo, hi, res) {
  const D = Math.hypot(tz, ty);
  chainEnd(seg, n, cpl, off, lo, _e);
  const dLo = Math.hypot(_e[0], _e[1]);
  chainEnd(seg, n, cpl, off, hi, _e);
  const dHi = Math.hypot(_e[0], _e[1]);
  let th;
  if (D >= dLo) th = lo;
  else if (D <= dHi) th = hi;
  else {
    let a = lo, b = hi;
    for (let it = 0; it < 18; it++) {
      const m = (a + b) * 0.5;
      chainEnd(seg, n, cpl, off, m, _e);
      if (Math.hypot(_e[0], _e[1]) > D) a = m;
      else b = m;
    }
    th = (a + b) * 0.5;
  }
  chainEnd(seg, n, cpl, off, th, _e);
  const rot = Math.atan2(tz, -ty) - Math.atan2(_e[0], -_e[1]);
  for (let k = 0; k < n; k++) res[k] = _abs[k] + rot;
  return th;
}

// ---------- État persistant ----------
function createState(bones, st) {
  const legs = legsOf(bones);
  const A = {
    legs: legs.map((L) => ({
      stance: true,
      lock: new THREE.Vector3(), // point d'appui verrouillé (monde)
      locked: false,
      liftP: new THREE.Vector3(), // départ du soulever (racine)
      cur: new THREE.Vector3().copy(L.neutral), // sabot courant (racine)
      pitch: 0, // inclinaison du sabot (bascule en pince)
      u: 0,
      swingT: -1, // pas au repos (0..1), -1 = aucun
      swingFrom: new THREE.Vector3(),
      swingTo: new THREE.Vector3(),
      absPrev: new Float64Array(6),
      blend: new Float64Array(6), // décalages d'inertie (raccords appui/soutien)
      blendK: 0,
      wasStance: true,
      scap: 0,
      extPrev: 0,
    })),
    gait: 'idle',
    off: [0.25, 0.75, 0.0, 0.5],
    duty: 0.65,
    freq: 0.9,
    lift: [0.1, 0.08],
    knee: 1.0,
    fet: 1.0,
    move: 0, // 0 = arrêt, 1 = locomotion (lissé)
    lead: 1,
    leadHold: 0,
    tail: new Float64Array(12), // angles x,z de 6 segments
    tailV: new Float64Array(12),
    maneV: 0,
    mane: 0,
    neckPitch: 0,
    headPitch: 0,
    neckYaw: 0,
    bodyY: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    prevY: 0,
    prevVY: 0,
    earL: 0,
    earR: 0,
    earT: 0,
    earTargetL: 0,
    earTargetR: 0,
    idleT: 0,
    restLeg: -1,
    restK: 0,
    restSwitch: 8 + Math.random() * 10,
    breath: Math.random() * 10,
    exert: 0,
    land: 0,
    jumpPrev: -1,
    swish: 0,
    blink: 0,
    blinkT: 1 + Math.random() * 4,
    swishT: 3 + Math.random() * 6,
    events: [],
    hooves: legs.map(() => new THREE.Vector3()),
    init: false,
  };
  st._a = A;

  return A;
}

// ---------- Matrices racine (monde) et parent (racine) ----------
const _M = new THREE.Matrix4();
const _Mi = new THREE.Matrix4();
const _P = new THREE.Matrix4();
const _P2 = new THREE.Matrix4();
const _BM = new THREE.Matrix4();
const _PM = new THREE.Matrix4();
const _Pi = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _t = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _res = new Float64Array(8);
const _cpl = new Float64Array(8);
const _off = new Float64Array(8);

function rootMatrix(bones) {
  const mesh = bones.root.parent;
  if (!mesh) return _M.identity();
  mesh.updateMatrix();
  if (mesh.parent) _M.multiplyMatrices(mesh.parent.matrixWorld, mesh.matrix);
  else _M.copy(mesh.matrix);
  return _M;
}

// Matrice locale d'un os (position + rotation courantes).
function localMatrix(b, out) {
  _q.setFromEuler(b.rotation);
  return out.compose(b.position, _q, _one);
}

/**
 * Anime le cheval. state : { speed, phase, jump (-1 ou 0..1), turn, graze, rear, t, headYaw,
 *   vel (vitesse réelle m/s), lead (±1), ground(x, z) → hauteur monde, mounted, lod, back (recule au pas) }
 * Renvoie { footfalls, landed: [indices des sabots posés], hooves: positions racine }.
 */
export function animateHorse(bones, st, dt) {
  const A = st._a || createState(bones, st);
  const legs = legsOf(bones);
  dt = Math.min(dt, 0.1);
  const t = st.t || 0;
  const mesh = bones.root.parent;
  const scale = mesh ? mesh.scale.x : 1;
  const vn = st.speed || 0; // vitesse normalisée (choix de l'allure)
  const v = (st.vel ?? vn) / scale; // vitesse réelle en unités du modèle
  const jumping = st.jump >= 0;
  const rear = st.rear || 0;
  const graze = st.graze || 0;
  A.events.length = 0;

  // ----- Choix de l'allure et main au galop -----
  const E = GAIT_EDGES;
  let target = vn < 0.25 ? 'idle' : vn < E.walk ? 'walk' : vn < E.trot ? 'trot' : vn < E.canter ? 'canter' : 'gallop';
  if (A.gait === 'walk' && target === 'idle' && vn > 0.12) target = 'walk';
  if (A.gait === 'trot' && target === 'walk' && vn > E.walk - 0.3) target = 'trot';
  if (A.gait === 'canter' && target === 'trot' && vn > E.trot - 0.4) target = 'canter';
  if (A.gait === 'gallop' && target === 'canter' && vn > E.canter - 0.7) target = 'gallop';
  const turn = st.turn || 0;
  if (st.lead) A.lead = st.lead;
  else if (Math.abs(turn) > 0.25 && Math.sign(turn) !== A.lead) {
    A.leadHold += dt;
    if (A.leadHold > 0.5) {
      A.lead = Math.sign(turn);
      A.leadHold = 0;
    }
  } else A.leadHold = 0;
  const key = target === 'canter' || target === 'gallop' ? target + (A.lead > 0 ? 'L' : 'R') : target;
  A.gait = target;
  const G = GAIT[key];
  const moving = target !== 'idle' && !jumping && rear < 0.05;
  A.move = lerp(A.move, moving ? 1 : 0, 1 - Math.exp(-dt * (moving ? 6 : 4)));
  if (G) {
    // Paramètres lissés (transitions d'allure en une demi-foulée environ).
    const k = 1 - Math.exp(-dt * 7);
    const vw = Math.max(v * scale, 0.6);
    A.freq = lerp(A.freq, G.f(vw), k);
    A.duty = lerp(A.duty, G.duty(vw), k);
    A.lift[0] = lerp(A.lift[0], G.lift[0], k);
    A.lift[1] = lerp(A.lift[1], G.lift[1], k);
    A.knee = lerp(A.knee, G.knee, k);
    A.fet = lerp(A.fet, G.fet, k);
    for (let i = 0; i < 4; i++) {
      let d = G.off[i] - A.off[i];
      d -= Math.round(d);
      A.off[i] = wrap01(A.off[i] + d * Math.min(1, dt * 5));
    }
    // Foulée bornée par l'amplitude des membres : la fréquence monte si l'appui serait trop long.
    const Lmax = 1.35 / scale;
    const fmin = (v * A.duty) / Lmax;
    if (A.freq < fmin) A.freq = fmin;
  }
  if (moving || A.move > 0.05) st.phase = wrap01((st.phase || 0) + dt * A.freq * Math.max(A.move, 0.25));

  // ----- Repères monde ↔ racine -----
  const M = rootMatrix(bones);
  _Mi.copy(M).invert();
  const ground = st.ground;
  const groundY = (lx, lz) => {
    // Hauteur du sol sous un point de l'espace racine (en coordonnées racine).
    if (!ground || !mesh) return 0;
    _v.set(lx, 0, lz).applyMatrix4(M);
    const gy = ground(_v.x, _v.z);
    _v.y = gy;
    _v.applyMatrix4(_Mi);
    return _v.y;
  };
  if (!A.init) {
    A.init = true;
    for (const L of legs) {
      const S = A.legs[L.i];
      S.cur.copy(L.neutral);
      S.cur.y = groundY(S.cur.x, S.cur.z);
      _w.copy(S.cur).applyMatrix4(M);
      S.lock.copy(_w);
      S.locked = true;
    }
  }

  // ----- Tronc : charge des membres → pompage et tangage ; virages → inclinaison -----
  const duty = A.duty;
  let loadF = 0, loadH = 0;
  for (const L of legs) {
    const u = wrap01(st.phase - A.off[L.i]);
    const ld = u < duty ? bump(u / duty) : 0;
    if (L.front) loadF += ld;
    else loadH += ld;
  }
  loadF = Math.min(loadF, 1.3);
  loadH = Math.min(loadH, 1.3);
  const gaitAmp = target === 'walk' ? -0.012 : target === 'trot' ? 0.05 : target === 'canter' ? 0.06 : target === 'gallop' ? 0.05 : 0;
  // Allures « à ressort » : le tronc s'abaisse au milieu de l'appui ; pas : voûte (léger soulèvement).
  const hF = -gaitAmp * loadF * A.move + (target === 'walk' ? 0 : gaitAmp * 0.6 * A.move);
  const hH = -gaitAmp * loadH * A.move + (target === 'walk' ? 0 : gaitAmp * 0.6 * A.move);
  const bodyLen = 1.45 * legs[0].K;
  let bodyY = (hF + hH) * 0.5;
  let bodyPitch = clamp((hF - hH) / bodyLen, -0.12, 0.12); // + = avant plus haut
  // Galop : bascule plus marquée (avant-main relevée pendant l'appui des postérieurs).
  if (target === 'canter' || target === 'gallop') {
    const cyc = Math.sin(TAU * (st.phase - 0.12));
    bodyPitch += 0.045 * cyc * A.move;
  }
  // Inclinaison dans les virages (ν ω / g, atténuée).
  const lean = clamp(-Math.atan((v * scale * turn) / 9.81) * 0.55, -0.26, 0.26);
  A.bodyRoll = lerp(A.bodyRoll, lean, 1 - Math.exp(-dt * 5));
  // Roulis du pas (transfert latéral).
  let roll = A.bodyRoll + (target === 'walk' ? Math.sin(TAU * st.phase) * 0.012 * A.move : 0);
  // Repos d'un postérieur : la hanche correspondante descend.
  const idle = !moving && A.move < 0.2 && !jumping && rear < 0.05;
  A.idleT = idle ? A.idleT + dt : 0;
  A.restSwitch -= dt;
  if (idle && A.idleT > 4 && A.restSwitch < 0) {
    A.restSwitch = 12 + Math.random() * 25;
    A.restLeg = A.restLeg < 0 ? (Math.random() < 0.5 ? 2 : 3) : Math.random() < 0.35 ? -1 : 5 - A.restLeg;
  }
  if (!idle) A.restLeg = -1;
  A.restK = lerp(A.restK, A.restLeg >= 0 ? 1 : 0, 1 - Math.exp(-dt * 2.2));
  if (A.restLeg >= 0) roll += (A.restLeg === 2 ? 0.035 : -0.035) * A.restK;

  // ----- Saut : poses clés -----
  let J = 0, jt = 0;
  if (jumping) {
    jt = st.jump;
    J = 1;
  }
  if (A.jumpPrev >= 0 && !jumping) A.land = 1;
  A.jumpPrev = jumping ? st.jump : -1;
  A.land = Math.max(0, A.land - dt * 2.6);
  if (jumping) {
    // Tangage : cabré à l'appel, bascule au-dessus, piqué à la réception.
    const p = jt < 0.15 ? lerp(0.32, 0.36, jt / 0.15) : jt < 0.5 ? lerp(0.36, -0.02, sstep(0.15, 0.5, jt)) : lerp(-0.02, -0.3, sstep(0.5, 0.9, jt)) * (1 - sstep(0.93, 1, jt) * 0.5);
    bodyPitch = lerp(bodyPitch, p, sstep(0, 0.05, jt));
    bodyY = lerp(bodyY, 0.05, sstep(0, 0.1, jt));
  } else if (A.land > 0) {
    bodyPitch += -0.12 * Math.sin(A.land * Math.PI) * A.land;
    bodyY -= 0.05 * Math.sin(A.land * Math.PI);
  }
  // Cabrer : rotation autour des hanches.
  let rearPivot = 0;
  if (rear > 0) {
    bodyPitch = lerp(bodyPitch, 0.82, rear);
    rearPivot = rear;
  }
  // Brouter : avant-main légèrement plus basse.
  bodyPitch -= 0.03 * graze;
  bodyY -= 0.015 * graze;

  // Lissage du tronc.
  const kb = 1 - Math.exp(-dt * (jumping || rear > 0 ? 14 : 10));
  A.bodyY = lerp(A.bodyY, bodyY, kb);
  A.bodyPitch = lerp(A.bodyPitch, bodyPitch, kb);
  const B = bones;
  const K = legs[0].K;
  const bRest = B.body.userData.rest;
  B.body.rotation.set(-A.bodyPitch, 0, roll);
  if (rearPivot > 0) {
    // Pivot près des articulations des hanches.
    const pz = -0.62 * K, py = 1.05 * K;
    const ry = bRest.y - py, rz = bRest.z - pz;
    const c = Math.cos(-A.bodyPitch), s = Math.sin(-A.bodyPitch);
    const ny = ry * c - rz * s, nz = ry * s + rz * c;
    B.body.position.set(0, lerp(bRest.y + A.bodyY * K, py + ny, rearPivot), lerp(bRest.z, pz + nz, rearPivot));
  } else B.body.position.set(0, bRest.y + A.bodyY * K, bRest.z);
  // Rein et bassin : flexion lombo-sacrée (galop : rassembler / détendre).
  const lumb = target === 'canter' || target === 'gallop' ? Math.sin(TAU * (st.phase + 0.15)) * 0.06 * A.move : 0;
  B.loin.rotation.x = -lumb * 0.4 + (J ? -0.04 * Math.sin(Math.PI * jt) : 0);
  B.pelvis.rotation.x = -lumb * 0.8 + (J ? 0.12 * sstep(0.2, 0.6, jt) * (1 - sstep(0.8, 1, jt)) : 0) + rear * 0.15;
  B.pelvis.rotation.z = A.restLeg >= 0 ? (A.restLeg === 2 ? 0.03 : -0.03) * A.restK : 0;

  // Matrices du tronc et du bassin dans l'espace racine.
  const bodyM = localMatrix(B.body, _BM);
  const pelvisM = _PM.copy(bodyM).multiply(localMatrix(B.loin, _P)).multiply(localMatrix(B.pelvis, _P2));

  // ----- Membres -----
  const vModel = v;
  const Ls = (vModel * A.duty) / Math.max(A.freq, 0.3);
  for (const L of legs) {
    const S = A.legs[L.i];
    const u = wrap01(st.phase - A.off[L.i]);
    const inStance = A.move < 0.05 ? true : u < A.duty;
    // Avance de la foulée (posé en avant de la position neutre, quitté en arrière).
    const fwd = (L.front ? 0.04 : -0.02) * K * A.move;
    const nz = L.neutral.z + fwd + (graze > 0 && L.i === 0 ? 0.22 * K * graze : 0) + (graze > 0 && L.i === 1 ? -0.05 * K * graze : 0);
    const nx = L.neutral.x * (1 - 0.25 * A.move * (target === 'gallop' || target === 'canter' ? 1 : 0.4));
    let pz, px, py, pitch = 0;
    if (jumping) {
      // ---- Saut : poussée vers les anciens appuis au début, puis recherche du sol à la réception ----
      if (jt < 0.12 && S.locked) {
        _w.copy(S.lock).applyMatrix4(_Mi);
        S.cur.copy(_w);
      } else {
        S.locked = false;
        S.cur.set(nx, groundY(nx, nz), nz);
      }
      S.wasStance = true;
      S.swingT = -1;
      px = S.cur.x;
      py = S.cur.y;
      pz = S.cur.z;
    } else if (moving && !inStance && A.move > 0.05) {
      // ---- Soutien : arc de vol du sabot ----
      if (S.wasStance) {
        S.liftP.copy(S.cur);
        S.wasStance = false;
        S.locked = false;
      }
      const s = (u - A.duty) / (1 - A.duty);
      // Recul (st.back) : le sabot se pose derrière la position neutre au lieu de devant.
      const landZ = nz + (st.back ? -0.5 : 0.5) * Ls;
      const prog = s * s * (3 - 2 * s);
      const reach = L.front ? 0.06 * K * Math.sin(Math.PI * Math.min(1, s * 1.15)) * (A.knee > 1.3 ? 1 : 0.5) : 0;
      pz = lerp(S.liftP.z, landZ, prog) + reach;
      px = lerp(S.liftP.x, nx, prog);
      const gEnd = groundY(px, landZ);
      const base = lerp(S.liftP.y, gEnd, prog);
      const h = (L.front ? A.lift[0] : A.lift[1]) * K;
      const sh = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 1.3);
      py = base + h * sh;
      pitch = 0;
      S.cur.set(px, py, pz);
    } else {
      // ---- Appui : sabot verrouillé au sol (monde) ----
      if (!S.wasStance) {
        S.wasStance = true;
        S.locked = false;
        if (moving) A.events.push(L.i);
        else if (S.cur.y - groundY(S.cur.x, S.cur.z) > 0.02 * K) {
          // Arrêt pendant le soutien : finir le pas jusqu'à la position neutre.
          S.swingT = 0;
          S.swingFrom.copy(S.cur);
        }
      }
      if (!S.locked) {
        // Poser : point d'appui = sabot courant projeté au sol.
        S.cur.y = groundY(S.cur.x, S.cur.z);
        S.lock.copy(S.cur).applyMatrix4(M);
        S.locked = true;
      }
      _w.copy(S.lock).applyMatrix4(_Mi);
      // Téléportation ou glissement excessif : reposer le pied.
      const err = Math.hypot(_w.x - nx, _w.z - nz);
      if (err > 1.6 * K || Math.abs(_w.y) > 1.5 * K) {
        _w.set(nx, groundY(nx, nz), nz);
        S.lock.copy(_w).applyMatrix4(M);
      }
      S.cur.copy(_w);
      // Au repos : petit pas de recentrage si le pied s'est trop écarté (demi-tour, arrêt).
      if (!moving && S.swingT < 0) {
        const need = Math.hypot(S.cur.x - nx, S.cur.z - nz) > 0.16 * K;
        const busy = A.legs.some((o) => o.swingT >= 0);
        if (need && !busy && !jumping && rear < 0.05) {
          S.swingT = 0;
          S.swingFrom.copy(S.cur);
        }
      }
      if (S.swingT >= 0) {
        S.swingT += dt / 0.42;
        const s = Math.min(1, S.swingT);
        const prog = s * s * (3 - 2 * s);
        S.cur.x = lerp(S.swingFrom.x, nx, prog);
        S.cur.z = lerp(S.swingFrom.z, nz, prog);
        S.cur.y = lerp(S.swingFrom.y, groundY(nx, nz), prog) + Math.sin(Math.PI * s) * 0.07 * K;
        if (s >= 1) {
          S.swingT = -1;
          S.cur.y = groundY(S.cur.x, S.cur.z);
          S.lock.copy(S.cur).applyMatrix4(M);
          A.events.push(L.i);
        }
      }
      // Bascule en pince en fin d'appui.
      if (moving) pitch = -0.7 * sstep(0.8, 1.0, u / A.duty);
      px = S.cur.x;
      py = S.cur.y;
      pz = S.cur.z;
    }
    // Postérieur au repos : en pince, jarret fléchi.
    let restTip = 0;
    if (!L.front && A.restLeg === L.i) {
      restTip = A.restK;
      pz += 0.08 * K * restTip;
      py += 0.035 * K * restTip;
      pitch = -0.55 * restTip;
    }
    S.pitch = lerp(S.pitch, pitch, 1 - Math.exp(-dt * 20));
    S.u = u;
    solveLeg(L, S, A, B, bodyM, pelvisM, px, py, pz, inStance && !jumping, u, J ? jt : -1, rear, dt);
    A.hooves[L.i].set(px, py, pz);
  }

  // ----- Encolure et tête -----
  const gaitNeck = target === 'walk' ? 0.1 : target === 'trot' ? -0.06 : target === 'canter' ? 0.02 : target === 'gallop' ? 0.18 : 0.06;
  let nod = 0;
  if (target === 'walk') nod = Math.sin(TAU * (st.phase * 2 + 0.1)) * 0.035;
  else if (target === 'canter') nod = Math.sin(TAU * (st.phase - 0.05)) * 0.11;
  else if (target === 'gallop') nod = Math.sin(TAU * (st.phase - 0.05)) * 0.13;
  let neckP = gaitNeck * A.move + nod * A.move + (1 - A.move) * (0.08 + Math.sin(t * 0.37) * 0.04);
  let headP = -0.02 * A.move;
  if (jumping) {
    const up = 1 - sstep(0.1, 0.3, jt);
    const stretch = sstep(0.15, 0.4, jt) * (1 - sstep(0.7, 0.95, jt));
    neckP = lerp(neckP, -0.12, up) + 0.38 * stretch - 0.12 * sstep(0.8, 1, jt);
    headP += 0.12 * stretch;
  }
  if (A.land > 0) neckP -= 0.12 * Math.sin(A.land * Math.PI);
  if (rear > 0) {
    neckP = lerp(neckP, -0.55, rear);
    headP = lerp(headP, 0.3, rear);
  }
  if (graze > 0) {
    neckP = lerp(neckP, 1.12, graze);
    headP = lerp(headP, 0.32 + Math.sin(t * 2.3) * 0.04, graze);
  }
  const kn = 1 - Math.exp(-dt * 6);
  A.neckPitch = lerp(A.neckPitch, neckP, kn);
  A.headPitch = lerp(A.headPitch, headP, kn);
  const yaw = clamp((st.headYaw || 0) + turn * 0.12, -1.0, 1.0);
  A.neckYaw = lerp(A.neckYaw, yaw, 1 - Math.exp(-dt * 4));
  B.neck.rotation.set(A.neckPitch * 0.45, A.neckYaw * 0.3, 0);
  B.neck2.rotation.set(A.neckPitch * 0.35, A.neckYaw * 0.35, 0);
  B.neck3.rotation.set(A.neckPitch * 0.2, A.neckYaw * 0.25, 0);
  B.head.rotation.set(A.headPitch - A.neckPitch * 0.25, A.neckYaw * 0.15, 0);
  // Mâchoire : mastication en broutant.
  B.jaw.rotation.x = graze > 0.5 ? Math.max(0, Math.sin(t * 9)) * 0.06 * graze : 0;

  // Crinière : rebond selon l'accélération verticale du garrot.
  const wy = B.body.position.y;
  const vy = (wy - A.prevY) / Math.max(dt, 1e-3);
  const ay = (vy - A.prevVY) / Math.max(dt, 1e-3);
  A.prevY = wy;
  A.prevVY = vy;
  A.maneV += (-A.mane * 120 - A.maneV * 9 - clamp(ay, -60, 60) * 0.02) * dt;
  A.mane += A.maneV * dt;
  A.mane = clamp(A.mane, -0.25, 0.25);
  B.maneA.rotation.z = A.mane;
  B.maneB.rotation.z = A.mane * 1.3;

  // ----- Queue : port selon l'allure, balancement amorti, chasse-mouches au repos -----
  const carry = target === 'walk' ? 0.12 : target === 'trot' ? 0.32 : target === 'canter' ? 0.42 : target === 'gallop' ? 0.55 : 0.05;
  let lift = carry * A.move + (jumping ? 0.5 * sstep(0, 0.2, jt) : 0) + rear * 0.3;
  A.swishT -= dt;
  if (idle && A.swishT < 0) {
    A.swishT = 2.5 + Math.random() * 7;
    A.swish = 1;
  }
  A.swish = Math.max(0, A.swish - dt * 1.6);
  const swing = target === 'walk' ? Math.sin(TAU * st.phase) * 0.12 : 0;
  const sw = A.swish > 0 ? Math.sin((1 - A.swish) * Math.PI * 3) * 0.5 * A.swish : 0;
  const tailB = [B.tail, B.tail2, B.tail3, B.tail4, B.tail5, B.tail6];
  for (let k = 0; k < 6; k++) {
    const tx = (k === 0 ? lift * 0.9 : k === 1 ? lift * 0.5 : lift * 0.12) + (k > 2 ? -0.02 * k * A.move : 0) - clamp(vy, -2, 2) * 0.04 * (k > 1 ? 1 : 0);
    const tz = (swing + sw) * (k < 2 ? 0.5 : 1) * (k === 0 ? 0.6 : 1) - turn * 0.1 * A.move * (k > 1 ? 1 : 0.3);
    const stiff = k < 2 ? 60 : 30;
    const damp = k < 2 ? 12 : 6;
    const ix = k * 2, iz = k * 2 + 1;
    A.tailV[ix] += ((tx - A.tail[ix]) * stiff - A.tailV[ix] * damp) * dt;
    A.tailV[iz] += ((tz - A.tail[iz]) * stiff - A.tailV[iz] * damp) * dt;
    A.tail[ix] += A.tailV[ix] * dt;
    A.tail[iz] += A.tailV[iz] * dt;
    tailB[k].rotation.set(A.tail[ix], 0, A.tail[iz]);
  }


  // ----- Oreilles : vers l'avant en mouvement, une oreille vers le cavalier, pivotent au repos -----
  A.earT -= dt;
  if (A.earT < 0) {
    A.earT = 0.8 + Math.random() * 2.5;
    if (moving) {
      A.earTargetL = st.mounted && Math.random() < 0.3 ? -0.9 : 0.15;
      A.earTargetR = st.mounted && Math.random() < 0.3 ? -0.9 : 0.15;
    } else {
      A.earTargetL = -0.6 + Math.random() * 1.0;
      A.earTargetR = Math.random() < 0.6 ? A.earTargetL + (Math.random() - 0.5) * 0.4 : -0.6 + Math.random() * 1.0;
    }
    if (jumping || rear > 0) A.earTargetL = A.earTargetR = rear > 0 ? -1.1 : 0.25;
  }
  A.earL = lerp(A.earL, A.earTargetL, 1 - Math.exp(-dt * 9));
  A.earR = lerp(A.earR, A.earTargetR, 1 - Math.exp(-dt * 9));
  // rotation.y : pavillon vers l'avant (+) ou l'arrière (−) ; rotation.x : oreille couchée en arrière.
  B.earL.rotation.set(Math.min(0, A.earL) * 0.45, A.earL * 0.9, 0);
  B.earR.rotation.set(Math.min(0, A.earR) * 0.45, -A.earR * 0.9, 0);

  // ----- Clignements (paupières) ; paupières mi-closes quand le cheval somnole -----
  A.blinkT -= dt;
  if (A.blinkT < 0) {
    A.blinkT = 1.8 + Math.random() * 5.5;
    A.blink = 1e-4;
  }
  if (A.blink > 0) {
    A.blink += dt / 0.17;
    if (A.blink >= 1) A.blink = 0;
  }
  const doze = A.restLeg >= 0 && A.idleT > 14 ? 0.45 * A.restK : 0;
  const lid = Math.max(A.blink > 0 ? Math.sin(Math.PI * A.blink) : 0, doze);
  if (B.lidL && B.lidL.userData.axis) {
    B.lidL.quaternion.setFromAxisAngle(B.lidL.userData.axis, -1.02 * lid);
    B.lidR.quaternion.setFromAxisAngle(B.lidR.userData.axis, -1.02 * lid);
  }

  // ----- Respiration -----
  A.exert = clamp(A.exert + (target === 'gallop' ? 0.08 : target === 'canter' ? 0.03 : -0.02) * dt, 0, 1);
  A.breath += dt * TAU * (0.2 + A.exert * 0.9);
  const br = 1 + Math.sin(A.breath) * (0.008 + A.exert * 0.012);
  B.breath.scale.set(br, 1 + (br - 1) * 0.6, 1);

  // ----- Étriers et rênes (ancres) -----
  if (B.stirL) {
    const sy = st.mounted ? 0 : 0.28 * K;
    B.stirL.position.y = B.stirL.userData.rest.y + sy;
    B.stirR.position.y = B.stirR.userData.rest.y + sy;
  }

  return { footfalls: A.events.length, landed: A.events, hooves: A.hooves };
}

// ---------- Résolution d'un membre ----------
const _inv = new THREE.Matrix4();
function solveLeg(L, S, A, B, bodyM, pelvisM, px, py, pz, stance, u, jt, rear, dt) {
  const K = L.K;
  // Cible dans le repère du parent (tronc pour l'antérieur, bassin pour le postérieur).
  _inv.copy(L.front ? bodyM : pelvisM).invert();
  _t.set(px, py, pz).applyMatrix4(_inv);
  const seg = L.seg;
  const n = seg.length; // avant : humérus, avant-bras, canon, paturon, sabot ; arrière : fémur, tibia, canon, paturon, sabot
  // Origine de la chaîne : articulation de l'épaule (déplacée par la rotation de l'omoplate) ou de la hanche.
  let oz, oy;
  if (L.front) {
    const sc = S.scap;
    const P = L.scap, J1 = L.J[1];
    const dz = J1.z - P.z, dy = J1.y - P.y;
    const c = Math.cos(sc), s = Math.sin(sc);
    oz = P.z + dz * c - dy * s;
    oy = P.y + dz * s + dy * c;
  } else {
    oz = L.J[0].z;
    oy = L.J[0].y;
  }
  // Profils articulaires du soutien : genou (carpe), boulet et pied se fléchissent puis se tendent avant le poser.
  const swingS = stance ? -1 : (u - A.duty) / (1 - A.duty);
  let knee = 0, fet = 0, cof = 0;
  if (swingS >= 0) {
    knee = A.knee * Math.pow(bump(clamp(swingS * 1.25, 0, 1)), 0.9);
    fet = -A.fet * bump(clamp(swingS * 1.1 + 0.05, 0, 1));
    cof = -0.35 * bump(clamp(swingS * 1.2, 0, 1));
  }
  // Saut et cabrer : antérieurs repliés.
  if (jt >= 0) {
    if (L.front) {
      const jw = sstep(0, 0.12, jt) * (1 - sstep(0.62, 0.86, jt));
      knee = lerp(knee, 2.1, jw);
      fet = lerp(fet, -1.2, jw);
      cof = lerp(cof, -0.4, jw);
    } else {
      const jw = sstep(0.12, 0.35, jt) * (1 - sstep(0.72, 0.95, jt));
      fet = lerp(fet, -1.0, jw);
      cof = lerp(cof, -0.3, jw);
    }
  }
  if (rear > 0 && L.front) {
    knee = lerp(knee, 2.0, rear);
    fet = lerp(fet, -1.1, rear);
  }
  // Inconnue θ : flexion du coude (avant) ou couple grasset-jarret (arrière, appareil réciproque).
  _cpl.fill(0);
  _off.fill(0);
  if (L.front) {
    _cpl[1] = 1; // coude : l'avant-bras pivote vers l'avant
    _off[2] = -knee; // genou : le canon se replie vers l'arrière
  } else {
    _cpl[1] = -1; // grasset : le tibia recule
    _cpl[2] = 0.95; // jarret : le canon avance (couplage)
  }
  const lo = L.front ? -0.45 : -0.35, hi = L.front ? 2.2 : 1.7;
  const res = _res;
  let tz = _t.z - oz, ty = _t.y - oy;
  if (stance) {
    // Appui : sabot à plat (ou basculé sur la pince), paturon qui s'abaisse sous la charge ;
    // on vise le boulet avec les trois segments supérieurs.
    const d = L.toe.z - L.sole.z;
    const pitch = S.pitch; // ≤ 0 : talons levés, rotation autour de la pince
    tz += d * (1 - Math.cos(pitch));
    ty += -d * Math.sin(pitch);
    // Le boulet s'abaisse sous la charge, d'autant plus que l'allure est rapide (presque au sol au grand galop).
    const sink = A.gait === 'walk' ? 0.14 : A.gait === 'trot' ? 0.3 : A.gait === 'canter' ? 0.38 : A.gait === 'gallop' ? 0.5 : 0;
    const ext = A.move > 0.05 ? sink * bump(u / A.duty) * A.move : 0;
    const aH = seg[4].a0 + pitch;
    const aP = seg[3].a0 + ext - pitch * 0.4;
    const cz = tz - Math.sin(aH) * seg[4].L, cy = ty + Math.cos(aH) * seg[4].L;
    const fz = cz - Math.sin(aP) * seg[3].L, fy = cy + Math.cos(aP) * seg[3].L;
    solveChain(seg, 3, _cpl, _off, fz, fy, lo, hi, res);
    res[3] = aP;
    res[4] = aH;
  } else {
    _off[3] = fet;
    _off[4] = cof - fet * 0.15;
    solveChain(seg, n, _cpl, _off, tz, ty, lo, hi, res);
  }
  // Saut : poses imposées pour la bascule (mélange avec la solution au sol).
  if (jt >= 0) {
    const pose = L.front ? jumpFore(jt) : jumpHind(jt);
    const w = L.front ? sstep(0, 0.1, jt) * (1 - sstep(0.82, 0.97, jt)) : sstep(0.06, 0.25, jt) * (1 - sstep(0.85, 1, jt));
    for (let k = 0; k < n; k++) res[k] = lerp(res[k], seg[k].a0 + pose[k], w);
  }
  if (rear > 0 && L.front) {
    const pose = jumpFore(0.4);
    for (let k = 0; k < n; k++) res[k] = lerp(res[k], seg[k].a0 + pose[k] - 0.6, rear);
  }
  // Raccords d'inertie (passage appui ↔ soutien) : l'écart d'angle décroît rapidement.
  const decay = Math.exp(-dt * 16);
  if (S.prevStance !== undefined && S.prevStance !== stance) {
    for (let k = 0; k < n; k++) S.blend[k] += S.absPrev[k] - res[k] - S.blend[k];
  }
  S.prevStance = stance;
  for (let k = 0; k < n; k++) {
    S.blend[k] *= decay;
    res[k] += S.blend[k];
    S.absPrev[k] = res[k];
  }
  // Os : rotation.x = -(Δangle du segment - Δangle du segment parent).
  const bs = L.bones;
  let prev = 0;
  if (L.front) {
    // Omoplate : suit en partie la rotation de l'humérus (elle glisse sur le thorax).
    const dh = res[0] - seg[0].a0;
    const sc = clamp(dh * 0.32, -0.22, 0.3);
    S.scap = lerp(S.scap, sc, 1 - Math.exp(-dt * 25));
    bs[0].rotation.x = -S.scap;
    prev = S.scap;
    for (let k = 0; k < n; k++) {
      const d = res[k] - seg[k].a0;
      bs[k + 1].rotation.x = -(d - prev);
      prev = d;
    }
  } else {
    for (let k = 0; k < n; k++) {
      const d = res[k] - seg[k].a0;
      bs[k].rotation.x = -(d - prev);
      prev = d;
    }
  }
  // Abduction : ramener le sabot sous la cible latérale.
  const top = L.front ? bs[1] : bs[0];
  const h = Math.max(0.5 * K, (L.front ? oy : L.J[0].y) - _t.y);
  top.rotation.z = clamp(Math.atan2(_t.x - L.sole.x, h), -0.25, 0.25);
}


// Poses de saut : décalages d'angle absolu par segment (rad).
const _jf = new Float64Array(5), _jh = new Float64Array(5);
function jumpFore(jt) {
  // Humérus vers l'avant-haut, avant-bras relevé à l'horizontale, canon replié sous l'avant-bras.
  const tuck = sstep(0, 0.15, jt) * (1 - sstep(0.6, 0.85, jt));
  const reach = sstep(0.6, 0.85, jt);
  _jf[0] = lerp(0, 0.55, tuck) + 0.25 * reach;
  _jf[1] = lerp(0, 1.55, tuck) + 0.5 * reach * (1 - sstep(0.9, 1, jt));
  _jf[2] = lerp(0, -0.6, tuck) + 0.35 * reach;
  _jf[3] = lerp(0, -1.5, tuck) + 0.2 * reach;
  _jf[4] = lerp(0, -1.7, tuck) + 0.1 * reach;
  return _jf;
}
function jumpHind(jt) {
  // Poussée (membre tendu en arrière) puis membres repliés sous le ventre, puis extension pour la réception.
  const push = 1 - sstep(0.05, 0.25, jt);
  const tuck = sstep(0.15, 0.4, jt) * (1 - sstep(0.7, 0.92, jt));
  _jh[0] = -0.45 * push + 0.55 * tuck;
  _jh[1] = -0.5 * push - 0.35 * tuck;
  _jh[2] = -0.5 * push + 0.75 * tuck;
  _jh[3] = -0.4 * push - 0.6 * tuck;
  _jh[4] = -0.5 * push - 0.7 * tuck;
  return _jh;
}

// Position monde d'un sabot (centre de la sole) ; out : Vector3.
export function hoofWorldPosition(bones, i, out = new THREE.Vector3()) {
  const legs = legsOf(bones);
  const L = legs[i];
  const b = L.bones[L.bones.length - 1];
  b.updateWorldMatrix(true, false);
  // Sole : sous l'articulation du sabot (repère de l'os).
  out.set(0, L.sole.y - L.J[L.J.length - 1].y, L.sole.z - L.J[L.J.length - 1].z).applyMatrix4(b.matrixWorld);
  return out;
}
