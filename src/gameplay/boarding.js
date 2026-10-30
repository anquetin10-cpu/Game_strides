// Montée et descente des véhicules : un seul appui (« Monter » / « Descendre ») lance une séquence animée continue —
// le personnage rejoint la portière conducteur, saisit la poignée, ouvre, monte (seuil, marchepieds, prises de main),
// s'assied, rentre les jambes, referme et prend le volant ; en sens inverse pour descendre. Système commun, réglé par
// un profil par véhicule (portière et pivot, poignées, seuil, marchepieds, prises de main, siège, pédalier, volant,
// points d'approche et de sortie, caméra) ; durée selon le nombre de gestes (cabine de poids lourd plus longue).
//
// Animation : pose squelettique pilotée (anim.js, pose « board ») — bassin, colonne et tête placés, pieds et mains
// posés par cinématique inverse sur les repères du véhicule (poignées qui suivent la portière, marches, volant) ;
// fondus entre les étapes, tout dépend du temps écoulé. Le personnage est rattaché au repère de la caisse (aucun saut
// au passage monde → véhicule) ; la caméra glisse progressivement du profil à pied au profil de conduite.
//
// États : approche (marche), séquence (étapes successives), assis (conduite), retour à pied. Pas de second
// déclenchement pendant une séquence, siège réservé dès le départ, véhicule tenu à l'arrêt ; interruption (téléport,
// chargement, changement de région, véhicule déplacé) : personnage remis à pied en lieu sûr ou assis, portière fermée.
import * as THREE from 'three';
import { footTarget } from '../entities/human/anim.js';
import { t } from '../core/i18n.js';
import { DEFENDER_DIM } from '../entities/defenderModel.js';
import { MASTER_DIM } from '../entities/masterModel.js';
import { TRUCK_DIM } from '../entities/truck.js';
import { carPillars } from '../world/props.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const HALF_PI = Math.PI / 2;

// ---------- Profils (repère de la caisse : x à gauche, y au-dessus du sol sous le véhicule, z vers l'avant) ----------
// door : charnière (zh, à l'avant) et bord arrière (zr), bas et haut de l'ouverture, angle d'ouverture (rad) ;
// xs : peau du flanc conducteur ; hOut / hIn : poignées extérieure et intérieure (portière fermée) ; sill : seuil ;
// floor : plancher ; steps : marchepieds (du bas vers le haut) ; grabs : prises de main ; hips : bassin assis ;
// pedals : pieds au pédalier ; wheel : volant (centre, rayon, inclinaison vers le conducteur) ; pace : facteur de durée.
function profileOf(game, v) {
  if (v._boardProfile) return v._boardProfile;
  let p;
  if (v === game.truck && TRUCK_DIM.layout === 'herringbone') {
    // Camion STX Scania (cabine avancée) : portière de 1,22 m sur la roue avant, marchepieds derrière la roue.
    p = {
      type: 'truck', xs: 1.24, door: { zh: 5.445, zr: 4.23, y0: 1.31, y1: 2.97, open: 1.12 },
      hOut: { x: 1.29, y: 1.72, z: 4.37 }, hIn: { x: 1.13, y: 1.86, z: 4.62 },
      sill: { x: 1.26, y: 1.31, z: 4.46 }, floor: 1.37,
      steps: [{ x: 1.47, y: 0.52, z: 4.1 }, { x: 1.43, y: 0.93, z: 4.13 }],
      grabs: { rear: { x: 1.33, y: 1.98, z: 4.12 }, front: { x: 1.2, y: 2.12, z: 4.85 } },
      hips: { x: 0.62, y: 1.59, z: 4.6 }, pedals: { y: 1.39, z: 5.25, w: 0.13 },
      wheel: { x: 0.64, y: 2.06, z: 5.1, r: 0.21, tilt: 0.25 }, roof: 3.25,
      stand: { x: 1.66, z: 4.05 }, base: { x: 1.92, z: 4.12 }, pace: 1, closeBeforeSit: true,
      cam: { dist: 9.5, height: 3.1 },
    };
  } else if (v === game.truck) {
    // Camion de secours (modèle procédural) : mêmes gestes, cotes de son modèle.
    const D = TRUCK_DIM, s = D.seat, xs = D.W / 2;
    p = {
      type: 'truck', xs, door: { zh: s.z + 0.75, zr: s.z - 0.45, y0: s.y - 0.1, y1: s.y + 1.45, open: 1.12 },
      hOut: { x: xs + 0.04, y: s.y + 0.55, z: s.z - 0.33 }, hIn: { x: xs - 0.1, y: s.y + 0.6, z: s.z - 0.1 },
      sill: { x: xs, y: s.y - 0.1, z: s.z - 0.2 }, floor: s.y - 0.05,
      steps: [{ x: xs + 0.18, y: (s.y - 0.1) * 0.36, z: s.z - 0.5 }, { x: xs + 0.14, y: (s.y - 0.1) * 0.7, z: s.z - 0.47 }],
      grabs: { rear: { x: xs + 0.08, y: s.y + 0.65, z: s.z - 0.52 }, front: { x: xs - 0.02, y: s.y + 0.8, z: s.z + 0.15 } },
      hips: { x: s.x, y: s.y + 0.48, z: s.z }, pedals: { y: s.y + 0.05, z: s.z + 0.65, w: 0.13 },
      wheel: { x: s.x, y: s.y + 0.95, z: s.z + 0.48, r: 0.21, tilt: 0.3 }, roof: s.y + 1.9,
      stand: { x: xs + 0.8, z: s.z - 0.85 }, base: { x: xs + 0.68, z: s.z - 0.5 }, pace: 1, closeBeforeSit: true,
      cam: { dist: 9.5, height: 3.1 },
    };
  } else if (v.kind === 'defender110_hero') {
    // Defender 110 : montée de 4x4 (seuil à 0,52 m, plancher 0,55 m), portière avant gauche du fichier.
    const d = DEFENDER_DIM.doors.FL;
    p = {
      type: 'suv', xs: 0.985, door: { zh: d.z, zr: -0.03, y0: 0.52, y1: 1.84, open: 1.05 },
      hOut: { x: 1.03, y: 1.2, z: 0.12 }, hIn: { x: 0.86, y: 1.16, z: 0.36 },
      sill: { x: 0.96, y: 0.55, z: 0.25 }, floor: 0.56, steps: [],
      grabs: { front: { x: 0.9, y: 1.62, z: 0.95 } },
      hips: { x: 0.465, y: 0.87, z: 0.24 }, pedals: { y: 0.57, z: 0.98, w: 0.12 },
      wheel: { x: 0.455, y: 1.18, z: 0.585, r: 0.18, tilt: 0.38 }, roof: 1.84,
      stand: { x: 1.41, z: -0.21 }, base: { x: 1.36, z: 0.2 }, pace: 1,
      cam: { dist: 7.0, height: 2.4 },
    };
  } else if (v.kind === 'master') {
    // Van Master : cabine utilitaire, seuil à 0,53 m, siège haut (assise à 1,10 m).
    p = {
      type: 'van', xs: 1.07, door: { zh: 2.18, zr: 1.47, y0: 0.53, y1: 2.42, open: 1.2 },
      hOut: { x: 1.1, y: 1.39, z: 1.63 }, hIn: { x: 0.95, y: 1.38, z: 1.75 },
      sill: { x: 1.05, y: 0.55, z: 1.75 }, floor: 0.62, steps: [],
      grabs: { front: { x: 1.0, y: 1.75, z: 2.2 } },
      hips: { x: 0.54, y: 1.22, z: 1.78 }, pedals: { y: 0.66, z: 2.38, w: 0.12 },
      wheel: { x: 0.54, y: 1.46, z: 2.08, r: 0.18, tilt: 0.45 }, roof: 2.42,
      stand: { x: 1.49, z: 1.29 }, base: { x: 1.45, z: 1.72 }, pace: 1.08,
      cam: { dist: 8.5, height: 2.9 },
    };
  } else if (v.isTractor) {
    // Tracteur : cabine vitrée quatre montants (props.js), portière gauche à charnière arrière (poignée près du
    // montant avant), trois marches et main courante sous le bord avant de la portière, siège central.
    p = {
      type: 'truck', xs: 0.72, door: { zh: -1.6, zr: -0.15, y0: 1.28, y1: 2.8, open: 1.3 },
      hOut: { x: 0.77, y: 1.58, z: -0.3 }, hIn: { x: 0.64, y: 1.9, z: -0.36 },
      sill: { x: 0.72, y: 1.28, z: -0.42 }, floor: 1.29,
      steps: [{ x: 0.88, y: 0.39, z: -0.25 }, { x: 0.88, y: 0.67, z: -0.25 }, { x: 0.88, y: 0.95, z: -0.25 }],
      grabs: { rear: { x: 0.74, y: 1.15, z: -0.25 }, front: { x: 0.7, y: 1.95, z: -0.13 } },
      hips: { x: 0, y: 1.8, z: -1.08 }, pedals: { y: 1.3, z: -0.52, w: 0.13 },
      wheel: { x: 0, y: 2.05, z: -0.42, r: 0.2, tilt: 0.9 }, roof: 2.82,
      stand: { x: 1.16, z: 0.08 }, base: { x: 1.22, z: -0.25 }, pace: 0.95, closeBeforeSit: true,
      cam: { dist: 8.5, height: 3.0 },
    };
  } else {
    // Voitures : assise basse, passage sous le pavillon.
    const C = v.spec, s = v.seat, xs = C.W / 2 - 0.02;
    const { zA, zB } = carPillars(C);
    const hipY = s.y + 0.46;
    p = {
      type: 'car', xs, door: { zh: zA - 0.05, zr: zB + 0.05, y0: 0.32, y1: hipY + 0.55, open: 1.1 },
      hOut: { x: xs + 0.03, y: hipY + 0.1, z: zB + 0.15 }, hIn: { x: xs - 0.12, y: hipY + 0.12, z: zB + 0.4 },
      sill: { x: xs - 0.02, y: 0.35, z: s.z + 0.1 }, floor: 0.3, steps: [],
      grabs: { front: { x: xs - 0.08, y: hipY + 0.45, z: zA - 0.2 } },
      hips: { x: s.x, y: hipY, z: s.z }, pedals: { y: 0.3, z: s.z + 0.85, w: 0.12 },
      wheel: { x: s.x, y: hipY + 0.33, z: s.z + 0.45, r: 0.18, tilt: 0.45 }, roof: Math.max(...C.roof.map((r) => r[1])) - 0.05,
      stand: { x: xs + 0.42, z: zB - 0.13 }, base: { x: xs + 0.38, z: s.z - 0.05 }, pace: 0.95,
      cam: { dist: 6.6, height: 2.2 },
    };
  }
  // Demi-largeur de l'obstacle du véhicule (collisions des piétons) : la descente se termine au-delà.
  p.colX = v === game.truck ? TRUCK_DIM.W / 2 : v.spec.W / 2 + 0.12;
  v._boardProfile = p;
  return p;
}

// ---------- Portière : angle courant et points qui la suivent ----------
// Rotation autour de l'axe des charnières (repère de la caisse) : le bord arrière s'écarte vers l'extérieur (+x).
// Charnière à l'avant (zh > zr) ou à l'arrière (portière de tracteur) : le bord libre s'écarte toujours vers +x.
function doorPoint(p, k, pt, out) {
  const a = -k * p.door.open * Math.sign(p.door.zh - p.door.zr);
  const hx = p.xs, hz = p.door.zh;
  const dx = pt.x - hx, dz = pt.z - hz;
  const c = Math.cos(a), s = Math.sin(a);
  out.x = hx + dx * c + dz * s;
  out.y = pt.y;
  out.z = hz - dx * s + dz * c;
  return out;
}

// ---------- Séquences (images clés) ----------
// Une image clé : t (s), root [x, z, yaw] (yaw relatif au cap du véhicule ; 0 = face à l'avant), ry (sol sous le
// personnage), hips [x, y, z], tr (angles du tronc), fl / fr [x, y, z, tangage, lacet] (point d'appui de chaque pied),
// lift { l, r } (hauteur d'enjambée vers cette clé), hl / hr (cible de main ou null), gl / gr (fermeture des doigts),
// door (0 … 1), ev (son au passage de la clé).
const TR0 = { hx: 0, hy: 0, hz: 0, sx: 0, sy: 0, cx: 0, nx: 0, ny: 0, hdx: 0, hdy: 0 };
const TR_SIT = { hx: -0.12, hy: 0, hz: 0, sx: 0.14, sy: 0, cx: 0.08, nx: 0.02, ny: 0, hdx: 0.04, hdy: 0 };

class Script {
  constructor(prof, dims) {
    this.p = prof;
    this.d = dims;
    this.keys = [];
    this.t = 0;
  }
  // Nouvelle clé : reprend la précédente et applique les changements.
  at(dt, ch) {
    this.t += dt * (this.p.pace || 1);
    const last = this.keys[this.keys.length - 1];
    const k = last ? { ...last, tr: { ...last.tr }, lift: null, ev: null } : { tr: { ...TR0 } };
    Object.assign(k, ch, { t: this.t });
    if (ch.tr) k.tr = { ...(last ? last.tr : TR0), ...ch.tr };
    this.keys.push(k);
    return this;
  }
  // Debout en (x, z), face au cap yaw, sur le sol y.
  stand(x, z, yaw, y = 0, extra = {}) {
    const rx = -Math.cos(yaw), rz = Math.sin(yaw); // droite du personnage
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const w = 0.11;
    return {
      root: [x, z, yaw], ry: y,
      hips: [x - fx * 0.02, y + this.d.Hs, z - fz * 0.02],
      fl: [x - rx * w + fx * 0.03, y, z - rz * w + fz * 0.03, 0, yaw + 0.12],
      fr: [x + rx * w - fx * 0.02, y, z + rz * w - fz * 0.02, 0, yaw - 0.12],
      ...extra,
    };
  }
  seated(extra = {}) {
    const p = this.p, h = p.hips;
    return {
      root: [h.x, h.z - 0.05, 0], ry: p.floor,
      hips: [h.x, h.y, h.z],
      tr: { ...TR_SIT },
      fl: [h.x + p.pedals.w, p.pedals.y, p.pedals.z, 0.25, 0.1],
      fr: [h.x - p.pedals.w, p.pedals.y, p.pedals.z, 0.25, -0.1],
      ...extra,
    };
  }
}

// Montée. Gestes communs, adaptés au profil : poignée, ouverture, (marchepieds), passage du seuil, assise, jambes,
// fermeture, mains au volant.
function entryScript(prof, dims, d0 = 0) {
  const p = prof, S = new Script(p, dims);
  const st = p.stand, h = p.hips;
  const yawS = Math.atan2(p.hOut.x - st.x, p.hOut.z - st.z);
  // d0 : portière déjà entrouverte (ouverte à pied) : elle part de là.
  S.at(0, { ...S.stand(st.x, st.z, yawS), tr: { ...TR0 }, hl: null, hr: null, gl: 0, gr: 0, door: d0 });
  // Main droite sur la poignée extérieure (buste qui accompagne).
  S.at(0.42, { hr: 'hOut', gr: 0.7, tr: { sx: 0.1, cx: 0.06, hy: -0.08 }, hips: [st.x + (p.hOut.x - st.x) * 0.12, dims.Hs - 0.02, st.z + (p.hOut.z - st.z) * 0.12], ev: 'latch' });
  // Ouverture : la main suit la poignée, le personnage recule d'un demi-pas.
  const back = S.stand(st.x + 0.1, st.z - 0.12, yawS);
  S.at(0.6, { door: Math.max(0.5, d0), hips: back.hips, fr: back.fr, lift: { r: 0.06 }, tr: { sx: -0.02, cx: 0, hy: 0.1 }, ev: 'open' });
  S.at(0.32, { door: 1, hr: null, gr: 0, tr: { sx: 0, hy: 0 } });
  // Vers l'ouverture : demi-tour vers l'avant du véhicule (dos tourné au siège pour une voiture, face à la cabine
  // pour une cabine haute).
  const tall = p.type === 'truck';
  const yawB = tall ? -HALF_PI : -0.35;
  const B = S.stand(p.base.x, p.base.z, yawB);
  S.at(0.38, { root: [lerp(back.root[0], B.root[0], 0.5), lerp(back.root[1], B.root[1], 0.5), lerp(yawS, yawB, 0.5)], hips: [lerp(back.hips[0], B.hips[0], 0.5), dims.Hs - 0.01, lerp(back.hips[2], B.hips[2], 0.5)], fl: B.fl, lift: { l: 0.12 } });
  S.at(0.36, { ...B, lift: { r: 0.12 } });
  if (tall) {
    // Cabine haute : mains aux prises, pied droit, pied gauche, de marche en marche, puis le seuil.
    const g = p.grabs;
    S.at(0.4, { hr: g.rear ? [g.rear.x, g.rear.y, g.rear.z] : 'hIn', gr: 0.9, hl: g.front ? [g.front.x, g.front.y - 0.25, g.front.z - 0.1] : null, gl: 0.8, tr: { sx: 0.12 } });
    let y = 0;
    p.steps.forEach((s, i) => {
      const r = i % 2 === 0;
      const foot = [s.x, s.y, s.z + (r ? -0.07 : 0.07), 0, -HALF_PI + (r ? -0.1 : 0.1)];
      y = s.y;
      S.at(0.45, { [r ? 'fr' : 'fl']: foot, lift: { [r ? 'r' : 'l']: 0.18 }, hips: [s.x + 0.32, (i ? p.steps[i - 1].y : 0) * 0.5 + y * 0.5 + dims.Hs * 0.92, s.z], root: [s.x + 0.3, s.z, -HALF_PI], ry: y * 0.5, tr: { sx: 0.18 } });
      S.at(0.4, { [r ? 'fl' : 'fr']: [s.x + 0.04, s.y, s.z + (r ? 0.1 : -0.1), 0, -HALF_PI + (r ? 0.1 : -0.1)], lift: { [r ? 'l' : 'r']: 0.16 }, hips: [s.x + 0.24, y + dims.Hs * 0.96, s.z], root: [s.x + 0.22, s.z, -HALF_PI], ry: y, hl: g.front ? [g.front.x, g.front.y, g.front.z] : null, tr: { sx: 0.14 } });
    });
    // Seuil puis plancher de la cabine.
    S.at(0.45, { fr: [p.sill.x - 0.1, p.sill.y, p.sill.z, 0, -HALF_PI], lift: { r: 0.2 }, hips: [p.sill.x + 0.12, (y + p.sill.y) / 2 + dims.Hs * 0.9, p.sill.z], root: [p.sill.x + 0.1, p.sill.z, -HALF_PI], ry: p.sill.y, tr: { sx: 0.24, nx: 0.1 } });
    const fx = p.xs - 0.32;
    S.at(0.5, { fl: [fx, p.floor, p.sill.z + 0.14, 0, -0.6], lift: { l: 0.22 }, hips: [fx + 0.08, p.floor + dims.Hs * 0.94, p.sill.z + 0.05], root: [fx + 0.08, p.sill.z + 0.05, -1.0], ry: p.floor, hr: 'hIn', gr: 0.8, tr: { sx: 0.12, nx: 0.12 } });
    S.at(0.35, { fr: [fx - 0.06, p.floor, p.sill.z - 0.1, 0, -0.9], lift: { r: 0.08 }, root: [fx, p.sill.z, -1.0] });
    if (p.closeBeforeSit) {
      // Debout dans la cabine : on tire la portière par sa poignée intérieure, elle claque contre le cadre.
      S.at(0.35, { hl: 'hIn', gl: 0.8, hr: g.rear ? [g.rear.x - 0.12, g.rear.y, g.rear.z + 0.05] : null, tr: { sy: 0.35, sx: 0.22, hz: -0.06 } });
      S.at(0.55, { door: 0.32, tr: { sy: 0.1, sx: 0.12 } });
      S.at(0.22, { door: 0, hl: null, ev: 'slam' });
    }
    // Pivot vers l'avant et assise.
    S.at(0.55, { hips: [h.x + 0.08, h.y + 0.12, h.z], root: [h.x + 0.05, h.z, -0.4], tr: { sx: 0.28, nx: 0.12, hy: 0.15 }, fl: [h.x + p.pedals.w + 0.05, p.floor, h.z + 0.3, 0, -0.3], lift: { l: 0.08 }, hl: 'wheelL', gl: 0.85, hr: null });
    S.at(0.45, { ...S.seated(), hl: 'wheelL', hr: 'wheelR', gr: 0.85 });
  } else {
    // Voiture, 4x4, utilitaire : pied intérieur dans l'habitacle, bassin qui passe le seuil, buste incliné et tête
    // rentrée sous l'encadrement, main gauche au volant, droite au dossier.
    const inFoot = [h.x - 0.02, p.floor, h.z + 0.42, 0, -0.2];
    const dip = p.type === 'car' ? 0.32 : p.type === 'van' ? 0.02 : 0.16;
    const lean = p.type === 'car' ? 0.55 : p.type === 'van' ? 0.25 : 0.38;
    S.at(0.42, { fr: inFoot, lift: { r: Math.max(0.12, p.sill.y + 0.14 - p.floor) }, hips: [p.xs + 0.16, dims.Hs - dip * 0.6 + (p.type === 'van' ? 0.1 : 0), h.z - 0.02], root: [p.xs + 0.2, h.z - 0.02, -0.25], tr: { sx: lean * 0.7, nx: 0.14, hy: -0.25 }, hl: p.grabs.front ? [p.grabs.front.x, p.grabs.front.y, p.grabs.front.z] : 'wheelL', gl: 0.85, ev: 'step' });
    // Le bassin rejoint l'assise (rotation vers l'avant), la jambe gauche reste dehors.
    S.at(0.6, { hips: [h.x + 0.12, h.y + 0.04, h.z], root: [h.x + 0.1, h.z - 0.05, -0.15], ry: p.floor, tr: { ...TR_SIT, sx: lean * 0.5, nx: 0.12, hy: 0.35 }, fl: [p.xs + 0.3, 0, h.z + 0.12, 0, 0.6], hl: 'wheelL', hr: [h.x - 0.32, h.y + 0.12, h.z - 0.05], gr: 0.4 });
    // Jambe gauche rentrée par-dessus le seuil, pieds au pédalier.
    S.at(0.5, { ...S.seated({ hips: [h.x + 0.04, h.y + 0.01, h.z] }), fl: S.seated().fl, lift: { l: Math.max(0.12, p.sill.y + 0.16 - p.floor) }, tr: { ...TR_SIT, hy: 0.1 }, hl: 'wheelL', hr: null });
    S.at(0.3, { ...S.seated(), tr: { ...TR_SIT } });
    // Main gauche sur la poignée intérieure (portière ouverte), on tire, elle claque contre le cadre.
    S.at(0.4, { hl: 'hIn', gl: 0.85, tr: { ...TR_SIT, sy: 0.32, hz: -0.06, sx: 0.2 }, hips: [h.x + 0.05, h.y, h.z] });
    S.at(0.5, { door: 0.3, tr: { ...TR_SIT, sy: 0.12 } });
    S.at(0.2, { door: 0, hl: 'wheelL', ev: 'slam' });
  }
  // Mains au volant.
  S.at(0.35, { ...S.seated(), hl: 'wheelL', hr: 'wheelR', gl: 0.9, gr: 0.9 });
  return S.keys;
}

// Descente : gestes inverses (poignée intérieure, ouverture, jambes dehors, appui au sol ou marchepieds face à la
// cabine, recul, fermeture par la poignée extérieure).
function exitScript(prof, dims) {
  const p = prof, S = new Script(p, dims);
  const h = p.hips, st = p.stand;
  S.at(0, { ...S.seated(), hl: 'wheelL', hr: 'wheelR', gl: 0.9, gr: 0.9, door: 0 });
  // Main gauche à la poignée intérieure ; déverrouillage ; on pousse la portière.
  S.at(0.38, { hl: 'hIn', gl: 0.8, hr: 'wheelR', tr: { ...TR_SIT, sy: 0.25, hz: -0.05 } });
  S.at(0.12, { ev: 'latch' });
  S.at(0.5, { door: 0.55, ev: 'open', tr: { ...TR_SIT, sy: 0.32, sx: 0.22 } });
  S.at(0.3, { door: 1, hl: null, gl: 0, tr: { ...TR_SIT } });
  const tall = p.type === 'truck';
  if (tall) {
    // Debout dans la cabine, tourné vers l'intérieur, puis descente à reculons, marche après marche, mains aux prises.
    const g = p.grabs, fx = p.xs - 0.32;
    S.at(0.5, { hips: [h.x + 0.1, h.y + 0.12, h.z], tr: { ...TR_SIT, sx: 0.3, hy: 0.4 }, fl: [h.x + 0.2, p.floor, h.z + 0.3, 0, 0.4], hr: null, hl: 'wheelL' });
    S.at(0.55, { root: [fx + 0.05, p.sill.z, -1.0], ry: p.floor, hips: [fx + 0.1, p.floor + dims.Hs * 0.93, p.sill.z], tr: { ...TR0, sx: 0.14, nx: 0.08 }, fl: [fx - 0.02, p.floor, p.sill.z + 0.15, 0, -1.0], fr: [fx - 0.06, p.floor, p.sill.z - 0.12, 0, -1.1], lift: { l: 0.1, r: 0.1 }, hl: g.front ? [g.front.x, g.front.y, g.front.z] : null, hr: g.rear ? [g.rear.x, g.rear.y, g.rear.z] : null, gl: 0.9, gr: 0.9 });
    S.at(0.35, { root: [p.sill.x + 0.06, p.sill.z, -HALF_PI], hips: [p.sill.x - 0.02, p.floor + dims.Hs * 0.9, p.sill.z], tr: { sx: 0.2 } });
    // Pied droit sur le seuil, puis les marches de haut en bas (face à la cabine, dos au vide).
    S.at(0.42, { fr: [p.sill.x - 0.05, p.sill.y, p.sill.z - 0.06, 0, -HALF_PI], lift: { r: 0.08 } });
    const steps = [...p.steps].reverse();
    steps.forEach((s, i) => {
      const r = i % 2 === 1;
      S.at(0.45, { [r ? 'fr' : 'fl']: [s.x, s.y, s.z + (r ? -0.07 : 0.07), 0, -HALF_PI], lift: { [r ? 'r' : 'l']: 0.1 }, hips: [s.x + 0.3, s.y + dims.Hs * 0.92, s.z], root: [s.x + 0.28, s.z, -HALF_PI], ry: s.y, tr: { sx: 0.18 } });
      S.at(0.35, { [r ? 'fl' : 'fr']: [s.x + 0.03, s.y, s.z + (r ? 0.08 : -0.08), 0, -HALF_PI], lift: { [r ? 'l' : 'r']: 0.08 }, hl: g.front ? [g.front.x, g.front.y - 0.3 * (i + 1), g.front.z - 0.05] : null, hr: g.rear ? [g.rear.x, g.rear.y - 0.25 * (i + 1), g.rear.z] : null });
    });
    const B = S.stand(p.base.x, p.base.z, -HALF_PI);
    S.at(0.45, { ...B, lift: { l: 0.1, r: 0.1 }, tr: { ...TR0, sx: 0.05 }, hl: null, gl: 0, hr: g.rear ? [g.rear.x, g.rear.y - 0.6, g.rear.z] : null });
  } else {
    // Jambe gauche dehors (bassin tourné vers la portière), appui au sol, on se relève en passant sous l'encadrement.
    const lean = p.type === 'car' ? 0.55 : p.type === 'van' ? 0.25 : 0.38;
    S.at(0.5, { hips: [h.x + 0.1, h.y + 0.02, h.z], tr: { ...TR_SIT, hy: 0.55, sx: 0.2 }, fl: [p.xs + 0.32, 0, h.z + 0.1, 0, 0.7], lift: { l: Math.max(0.12, p.sill.y + 0.16 - p.floor) }, hl: p.grabs.front ? [p.grabs.front.x, p.grabs.front.y, p.grabs.front.z] : 'wheelL', gl: 0.85, hr: [h.x - 0.3, h.y + 0.1, h.z - 0.05], gr: 0.4 });
    S.at(0.55, { hips: [p.xs + 0.14, dims.Hs - (p.type === 'car' ? 0.2 : 0.1), h.z - 0.02], root: [p.xs + 0.22, h.z - 0.02, 0.5], ry: 0, tr: { ...TR0, sx: lean * 0.8, nx: 0.14, hy: 0.15 }, fr: [h.x - 0.02, p.floor, h.z + 0.4, 0, 0.2], hr: 'wheelR', gr: 0.5 });
    const B = S.stand(p.base.x, p.base.z, 0.9);
    S.at(0.45, { ...B, lift: { r: Math.max(0.12, p.sill.y + 0.14 - p.floor) }, tr: { ...TR0, sx: 0.06 }, hl: null, hr: null, gl: 0, gr: 0, ev: 'step' });
  }
  // Recul hors de la course de la portière, demi-tour vers elle, poussée par la poignée extérieure, claquement.
  const open = { x: 0, y: 0, z: 0 };
  doorPoint(p, 1, p.hOut, open);
  const sx = st.x + 0.15, sz = st.z;
  const yawC = Math.atan2(open.x - sx, open.z - sz);
  const C = S.stand(sx, sz, yawC);
  S.at(0.4, { root: [lerp(p.base.x, sx, 0.5), lerp(p.base.z, sz, 0.5), lerp(tall ? -HALF_PI : 0.9, yawC, 0.5)], hips: [lerp(p.base.x, sx, 0.5), dims.Hs - 0.01, lerp(p.base.z, sz, 0.5)], fr: C.fr, lift: { r: 0.12 }, hl: null, hr: null });
  S.at(0.36, { ...C, lift: { l: 0.12 } });
  S.at(0.35, { hr: 'hOut', gr: 0.6, tr: { sx: 0.12, hy: 0.1 } });
  S.at(0.5, { door: 0.25, tr: { sx: 0.18, hy: -0.05 }, hips: [sx + (open.x - sx) * 0.15, dims.Hs - 0.03, sz + (open.z - sz) * 0.15] });
  S.at(0.18, { door: 0, hr: null, gr: 0, ev: 'slam' });
  S.at(0.35, { ...S.stand(sx, sz, yawC), tr: { ...TR0 } });
  // Encore dans l'enveloppe de collision (caisse plus large que la cabine) : un pas de côté pour s'en dégager.
  const out = p.colX + 0.4;
  if (sx < out) {
    const E = S.stand(out, sz - 0.1, yawC + 0.6);
    S.at(0.32, { root: [(sx + out) / 2, sz - 0.05, yawC + 0.3], hips: [(sx + out) / 2, dims.Hs - 0.01, sz - 0.05], fl: E.fl, lift: { l: 0.1 } });
    S.at(0.32, { ...E, lift: { r: 0.1 } });
  }
  return S.keys;
}

// ---------- Contrôleur ----------
const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _s = new THREE.Vector3();
const _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = { x: 0, y: 0, z: 0 };

export class Boarding {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.active = false; // séquence en cours (montée ou descente)
    this.phase = 'foot'; // foot | approach | enter | drive | exit
    this.v = null;
    this.keys = null;
    this.t = 0;
    this.board = {
      hips: new THREE.Vector3(), trunk: { ...TR0 },
      feet: { l: { pos: new THREE.Vector3(), q: new THREE.Quaternion(), pole: new THREE.Vector3(), toe: 0 }, r: { pos: new THREE.Vector3(), q: new THREE.Quaternion(), pole: new THREE.Vector3(), toe: 0 } },
      hands: { l: { pos: new THREE.Vector3(), pole: new THREE.Vector3(), w: 0, grip: 0 }, r: { pos: new THREE.Vector3(), pole: new THREE.Vector3(), w: 0, grip: 0 } },
    };
    this.camK = 0; // 0 caméra à pied … 1 caméra de conduite
    this._evI = 0;
  }

  get human() {
    return this.player.human;
  }
  profile(v) {
    return profileOf(this.game, v);
  }
  _dims() {
    const hu = this.human, info = hu.bones.__rig.info, s = hu.scale;
    return { Hs: info.hipsY * s - 0.015, s, info };
  }

  // ---------- Vérifications ----------
  // Débattement de la portière et emplacements (au sol, hors obstacles ; le véhicule lui-même n'est pas compté).
  clearance(v) {
    const g = this.game, p = this.profile(v);
    const col = v.collider;
    const own = col?.enabled;
    if (col) col.enabled = false;
    let ok = true, why = '';
    const y0 = v.pos.y;
    for (let k = 0.25; k <= 1.001 && ok; k += 0.25) {
      for (const u of [0.5, 1]) {
        doorPoint(p, k, { x: p.xs, y: 0, z: p.door.zh - (p.door.zh - p.door.zr) * u }, _b);
        v.groundPoint(_b.x, _b.z, _w);
        if (g.colliders.blocked(_w.x, _w.z, y0 + (p.door.y0 + p.door.y1) / 2)) ok = false;
      }
    }
    if (!ok) why = 'door';
    for (const pt of [p.stand, p.base]) {
      if (!ok) break;
      v.groundPoint(pt.x, pt.z, _w);
      const gy = g.terrain.getHeight(_w.x, _w.z);
      if (Math.abs(gy - y0) > 0.6 || g.terrain.waterDepth(_w.x, _w.z) > 0.15) ok = false;
      for (let i = 0; i < 5 && ok; i++) {
        const a = (i / 4) * Math.PI * 2, r = i === 4 ? 0 : 0.3;
        if (g.colliders.blocked(_w.x + Math.cos(a) * r, _w.z + Math.sin(a) * r, gy + 0.9)) ok = false;
      }
      for (const o of g.vehicles) {
        if (!ok) break;
        if (o === v || !o.pos || o.proxy || !o.toLocal) continue;
        const l = o.toLocal(_w.x, _w.z);
        const S = o === g.truck ? TRUCK_DIM : o.spec || { W: 2.5, L: 8 };
        if (Math.abs(l.x) < S.W / 2 + 0.3 && Math.abs(l.z - (S.zc || 0)) < S.L / 2 + 0.3) ok = false;
      }
      if (!ok) why = 'spot';
    }
    if (col) col.enabled = own;
    return { ok, why };
  }

  canEnter(v) {
    const p = this.player;
    if (this.active || !v) return { ok: false, why: 'busy' };
    if (v.driver || v.boardingBy) return { ok: false, why: 'taken' };
    if (Math.abs(v.speed) > 0.15) return { ok: false, why: 'moving' };
    if (p.mode !== 'foot' || p.human.carrying) return { ok: false, why: 'state' };
    return this.clearance(v);
  }

  // ---------- Montée ----------
  begin(v) {
    const c = this.canEnter(v);
    if (!c.ok) {
      if (c.why === 'door' || c.why === 'spot') this.game.hud?.hint(t('Pas la place d’ouvrir la portière : dégage l’accès conducteur.'), 3000);
      return false;
    }
    const pl = this.player;
    pl.transport?.release(true);
    pl.stopGroom?.();
    v.prepareCabDoor?.();
    this.v = v;
    v.boardingBy = pl;
    if (v.collider) v.collider.camPass = true;
    this.active = true;
    this.dir = 'in';
    this.phase = 'approach';
    this.t = 0;
    this.camK = 0;
    const p = this.profile(v);
    this.keys = entryScript(p, this._dims(), v.cabDoorK?.() || 0);
    this._evI = 0;
    // Trajet : jusqu'au point d'approche, en contournant la caisse si besoin (jamais au travers du véhicule).
    this.path = this._path(v, p.stand);
    return true;
  }

  _path(v, target) {
    const hu = this.human;
    const L = v.toLocal(hu.pos.x, hu.pos.z);
    const hw = (v.spec?.W ?? TRUCK_DIM.W) / 2 + 0.55, zc = v.spec?.zc || 0, hl = (v.spec?.L ?? TRUCK_DIM.L) / 2 + 0.55;
    const pts = [];
    // Côté opposé ou devant / derrière : coins de la caisse côté conducteur.
    if (L.x < hw - 0.6) {
      const front = L.z > zc;
      const cz = zc + (front ? hl : -hl);
      if (L.x < -hw + 0.6) pts.push({ x: -hw, z: cz });
      pts.push({ x: hw, z: cz });
    }
    pts.push({ x: target.x, z: target.z });
    return pts;
  }

  // ---------- Descente ----------
  beginExit() {
    const pl = this.player, v = pl.vehicle;
    if (this.active || pl.mode !== 'drive' || !v) return false;
    if (Math.abs(v.speed) > 0.3) {
      this.game.hud?.hint(t('Arrête-toi pour descendre.'), 2000);
      return false;
    }
    const c = this.clearance(v);
    if (!c.ok) {
      this.game.hud?.hint(t('Pas la place d’ouvrir la portière ici : avance ou recule le véhicule.'), 3200);
      return false;
    }
    v.speed = 0;
    v.prepareCabDoor?.();
    this.v = v;
    if (v.collider) v.collider.camPass = true;
    this.active = true;
    this.dir = 'out';
    this.phase = 'exit';
    this.t = 0;
    this.camK = 1;
    this.keys = exitScript(this.profile(v), this._dims());
    this._evI = 0;
    v.boardingBy = pl;
    return true;
  }

  // ---------- Mise à jour ----------
  // Appelée par Player à chaque image (à pied pendant la montée, au volant pendant la descente).
  update(dt) {
    const v = this.v, hu = this.human;
    if (!this.active || !v) return;
    if (!this.game.vehicles.includes(v) && v !== this.game.truck) return this.cancel();
    this._steerCamera(dt);
    if (this.phase === 'approach') return this._approach(dt);
    this.t += dt;
    const end = this.keys[this.keys.length - 1].t;
    const f = this._evaluate(Math.min(this.t, end));
    // Événements sonores au passage des clés.
    while (this._evI < this.keys.length && this.keys[this._evI].t <= this.t) {
      const ev = this.keys[this._evI].ev;
      if (ev) this._sound(ev);
      this._evI++;
    }
    this._apply(f, dt);
    // Caméra : glisse vers le profil de conduite pendant la montée, vers la marche pendant la descente.
    this.camK = this.dir === 'in' ? ease(clamp((this.t - end * 0.45) / (end * 0.55), 0, 1)) : 1 - ease(clamp(this.t / (end * 0.7), 0, 1));
    if (this.t >= end) {
      if (this.dir === 'in') this._finishEnter();
      else this._finishExit();
    }
    void hu;
  }

  // Caméra : amenée en douceur sur le flanc conducteur, un peu en arrière (la perche ne traverse pas la caisse), sauf
  // si le joueur la tourne lui-même (on lui laisse la main un moment).
  _steerCamera(dt) {
    const cam = this.game.cam, v = this.v;
    if (!dt || this.game.time - cam.lastManual < 1.5) return;
    const target = v.heading + HALF_PI + 0.7;
    cam.yaw += wrap(target - cam.yaw) * (1 - Math.exp(-1.6 * dt));
    cam.pitch += (0.26 - cam.pitch) * (1 - Math.exp(-1.2 * dt));
  }

  _approach(dt) {
    const hu = this.human, v = this.v;
    const tgt = this.path[0];
    v.groundPoint(tgt.x, tgt.z, _w);
    const dx = _w.x - hu.pos.x, dz = _w.z - hu.pos.z, d = Math.hypot(dx, dz);
    const last = this.path.length === 1;
    const sp = 1.45;
    if (d > (last ? 0.03 : 0.35)) {
      const step = Math.min(d, sp * dt);
      hu.pos.x += (dx / d) * step;
      hu.pos.z += (dz / d) * step;
      hu.heading = wrapTo(hu.heading, Math.atan2(dx, dz), 9 * dt);
      hu.speed = sp;
      hu.pose = 'walk';
      hu.update(dt, this.game.camera.position);
      return;
    }
    if (!last) {
      this.path.shift();
      return;
    }
    // Arrivé : on s'oriente vers la poignée (pas sur place), puis la séquence commence.
    const k0 = this.keys[0];
    const want = v.heading + k0.root[2];
    hu.speed = 0;
    const err = wrap(want - hu.heading);
    if (Math.abs(err) > 0.05) {
      hu.heading = wrapTo(hu.heading, want, 6 * dt);
      hu.pose = 'walk';
      hu.update(dt, this.game.camera.position);
      return;
    }
    this.phase = 'enter';
    this.t = 0;
  }

  // Image clé interpolée au temps t.
  _evaluate(t) {
    const K = this.keys;
    let i = 0;
    while (i < K.length - 2 && K[i + 1].t < t) i++;
    const a = K[i], b = K[i + 1] || a;
    const span = b.t - a.t;
    const u = span > 1e-6 ? clamp((t - a.t) / span, 0, 1) : 1;
    const e = ease(u);
    return { a, b, u, e };
  }

  _target(name, k, out) {
    const p = this.profile(this.v);
    if (Array.isArray(name)) return out.set(name[0], name[1], name[2]);
    if (name === 'hOut') return doorPoint(p, k, p.hOut, out);
    if (name === 'hIn') return doorPoint(p, k, p.hIn, out);
    if (name === 'wheelL' || name === 'wheelR') return this._wheelGrip(p, name === 'wheelL' ? 1 : -1, out);
    return out.set(p.hips.x, p.hips.y, p.hips.z);
  }
  // Prise du volant à « 10 h 10 », qui tourne modérément avec la direction.
  _wheelGrip(p, side, out) {
    const W = p.wheel;
    const st = this.phase === 'drive' ? clamp((this.v.steer || 0) * 3.2, -0.6, 0.6) : 0;
    const a = side * 1.0 + st; // angle depuis le haut, sens trigonométrique vu du conducteur
    const lx = Math.sin(a) * W.r, ly = Math.cos(a) * W.r;
    // Plan du volant incliné vers le conducteur (tilt) : « haut » du volant = (0, cos, -sin).
    return out.set(W.x + lx, W.y + ly * Math.cos(W.tilt), W.z - ly * Math.sin(W.tilt) - 0.02);
  }

  // Pose et portière à partir de l'interpolation.
  _apply({ a, b, u, e }, dt) {
    const v = this.v, hu = this.human, B = this.board, d = this._dims();
    const L = (x, y) => (Array.isArray(x) ? x.map((xi, i) => lerp(xi, y[i], e)) : lerp(x, y, e));
    const door = lerp(a.door ?? 0, b.door ?? 0, e);
    v.setCabDoor?.(door);
    this._door = door;
    // Racine : position et cap (chemin le plus court).
    const rx = lerp(a.root[0], b.root[0], e), rz = lerp(a.root[1], b.root[1], e);
    const ryaw = a.root[2] + wrap(b.root[2] - a.root[2]) * e;
    const ry = lerp(a.ry ?? 0, b.ry ?? 0, e);
    this._pose(rx, ry, rz, ryaw);
    // Repère du personnage → modèle.
    const toModel = (x, y, z, out) => out.copy(v.localToWorld(x, y, z, _a)).applyMatrix4(_inv);
    const hp = L(a.hips, b.hips);
    toModel(hp[0], hp[1], hp[2], B.hips);
    for (const k in B.trunk) B.trunk[k] = lerp(a.tr[k] || 0, b.tr[k] || 0, e);
    for (const side of ['l', 'r']) {
      const fa = a[`f${side}`], fb = b[`f${side}`];
      const fp = L(fa, fb);
      // Enjambée : le pied passe à `lift` au-dessus du plus haut de ses deux appuis (seuil franchi sans le traverser).
      const lift = b.lift?.[side] || 0;
      const top = Math.max(fa[1], fb[1]) + lift;
      const y = lift ? fp[1] + Math.sin(Math.PI * u) * Math.max(0, top - lerp(fa[1], fb[1], 0.5)) : fp[1];
      toModel(fp[0], y, fp[2], _s);
      const F = B.feet[side];
      const toeUp = lift ? Math.sin(Math.PI * u) * 0.25 : 0;
      footTarget(d.info, F.pos, F.q, _s.x, _s.z, _s.y, fp[3] + toeUp, fp[4] - ryaw);
      const sg = side === 'l' ? 1 : -1;
      // Genoux : vers l'avant, un peu vers l'extérieur (vers le haut une fois assis).
      const seatedK = clamp((hp[1] - ry) / d.Hs, 0, 1) < 0.75 ? 1 : 0;
      F.pole.set(sg * 0.25, seatedK ? 0.6 : 0.1, 1).normalize();
      // Mains.
      const ha = a[`h${side}`], hb = b[`h${side}`];
      const H = B.hands[side];
      const g = lerp(a[`g${side}`] || 0, b[`g${side}`] || 0, e);
      H.grip = g;
      if (!ha && !hb) {
        H.w = 0;
        continue;
      }
      if (ha && hb) {
        this._target(ha, door, _a);
        const ax = _a.x, ay = _a.y, az = _a.z;
        this._target(hb, door, _a);
        toModel(lerp(ax, _a.x, e), lerp(ay, _a.y, e), lerp(az, _a.z, e), H.pos);
        H.w = 1;
      } else {
        this._target(ha || hb, door, _a);
        toModel(_a.x, _a.y, _a.z, H.pos);
        H.w = ha ? 1 - e : e;
      }
      H.pole.set(sg * 0.75, -0.55, -0.35).normalize();
    }
    hu.board = B;
    hu.anim.board = B;
    hu.pose = 'board';
    hu.speed = 0;
    this._animate(dt);
  }

  // Place la racine du personnage (repère de la caisse) et prépare la conversion monde → modèle.
  _pose(rx, ry, rz, ryaw) {
    const v = this.v, hu = this.human;
    v.localToWorld(rx, ry, rz, this._root || (this._root = new THREE.Vector3()));
    v.body.updateWorldMatrix(true, false);
    v.body.getWorldQuaternion(_q);
    _qy.setFromAxisAngle(_Y, ryaw);
    this._rootQ = (this._rootQ || new THREE.Quaternion()).copy(_q).multiply(_qy);
    _m.compose(this._root, this._rootQ, _s.setScalar(hu.scale));
    _inv.copy(_m).invert();
    hu.pos.copy(this._root);
    hu.heading = v.heading + ryaw;
  }

  _animate(dt) {
    const hu = this.human;
    hu.update(dt, this.game.camera.position);
    hu.mesh.position.copy(this._root);
    hu.mesh.quaternion.copy(this._rootQ);
  }

  _sound(ev) {
    const au = this.game.audio;
    if (!au) return;
    if (ev === 'latch') au.latch?.();
    else if (ev === 'open') au.doorOpen ? au.doorOpen() : au.truckDoor?.(true);
    else if (ev === 'slam') au.truckDoor?.(false);
    else if (ev === 'step') au.tick?.();
  }

  _finishEnter() {
    const v = this.v, pl = this.player;
    this.active = false;
    if (v.collider) v.collider.camPass = false;
    this.phase = 'drive';
    v.boardingBy = null;
    v.setCabDoor?.(0);
    pl._takeSeat(v);
    this.camK = 1;
  }

  _finishExit() {
    const v = this.v, pl = this.player, hu = this.human;
    this.active = false;
    if (v.collider) v.collider.camPass = false;
    this.phase = 'foot';
    v.boardingBy = null;
    v.setCabDoor?.(0);
    const pos = hu.pos.clone(), heading = hu.heading;
    pl._leaveSeat(v, { x: pos.x, z: pos.z, heading });
    this.v = null;
    this.camK = 0;
  }

  // ---------- Conduite : pose assise, mains au volant, pieds au pédalier ----------
  seated(dt, v) {
    if (this.v !== v) this.v = v;
    this.phase = 'drive';
    const p = this.profile(v);
    if (!this._seatKey || this._seatKey.p !== p) {
      const S = new Script(p, this._dims());
      const k = { ...S.seated(), hl: 'wheelL', hr: 'wheelR', gl: 0.9, gr: 0.9, door: 0, t: 0 };
      this._seatKey = { p, keys: [k, { ...k, t: 1 }] };
    }
    const keys = this._seatKey.keys;
    const k = keys[0];
    const f = { a: k, b: keys[1], u: 1, e: 1 };
    // La portière reste celle du véhicule (fermée) : on ne la pilote pas en roulant.
    const set = v.setCabDoor;
    v.setCabDoor = null;
    this._apply(f, dt);
    v.setCabDoor = set;
  }

  // Interruption (téléport, chargement de partie, véhicule retiré…) : état stable.
  cancel() {
    const v = this.v, pl = this.player;
    if (!this.active) return;
    this.active = false;
    if (v) {
      v.boardingBy = null;
      v.setCabDoor?.(0);
      if (v.collider) v.collider.camPass = false;
    }
    if (this.dir === 'in') {
      // Pas encore assis : à pied, au point d'approche s'il est libre.
      this.phase = 'foot';
      const hu = this.human;
      if (v) {
        const p = this.profile(v);
        v.groundPoint(p.stand.x, p.stand.z, _w);
        hu.setPosition(_w.x, _w.z, hu.heading);
        this.game.colliders.resolve(hu.pos, 0.4, -Infinity);
        hu.snap();
      }
      hu.pose = 'walk';
      hu.board = null;
      pl.focusPos = hu.pos;
    } else if (v && pl.mode === 'drive') {
      // En cours de descente : de nouveau assis (portière fermée).
      this.phase = 'drive';
    }
    this.v = this.dir === 'in' ? null : v;
    this.camK = pl.mode === 'drive' ? 1 : 0;
  }

  // Point sûr à enregistrer pendant une séquence (jamais une demi-animation).
  safeFoot() {
    if (!this.active || !this.v || this.dir !== 'in') return null;
    const p = this.profile(this.v);
    return this.v.groundPoint(p.stand.x, p.stand.z, new THREE.Vector3());
  }

  // Caméra : profil interpolé entre la marche et la conduite (position suivie, recul, hauteur).
  focus(base) {
    const v = this.v;
    if (!this.active || !v) return base;
    const k = this.camK, p = this.profile(v);
    const hp = this.human.pos;
    const pos = (this._camPos ||= new THREE.Vector3()).set(lerp(hp.x, v.pos.x, k), lerp(hp.y, v.pos.y, k), lerp(hp.z, v.pos.z, k));
    return { pos, heading: this.human.heading, speed: 0, mode: 'drive', camDist: lerp(4.8, v.camDist ?? p.cam.dist, k), camHeight: lerp(1.6, v.camHeight ?? p.cam.height, k) };
  }
}

// Cap amorti vers une cible (rad), pas maximal `step`.
function wrapTo(h, target, step) {
  const d = wrap(target - h);
  return h + clamp(d, -step, step);
}
