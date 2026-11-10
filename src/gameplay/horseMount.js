// Montée et descente à cheval animées (un appui sur « Monter » / « Descendre ») : séquence de cavalier réelle, du
// côté gauche (côté droit en miroir si un obstacle longe le flanc gauche).
// Montée : approche à hauteur de la selle, rênes et appui près du pommeau, pied gauche à l'étrier, poussée de la
// jambe droite, élévation dans l'étrier, jambe droite au-dessus de la croupe (haute, sans la toucher), descente douce
// dans la selle, pied droit à l'étrier, position de cavalier.
// Descente : arrêt du cheval, pied droit libéré, appui sur l'étrier gauche, jambe droite au-dessus de la croupe,
// transfert du poids à gauche, pied gauche libéré, réception au sol genoux fléchis, debout à l'épaule, rênes en main.
//
// Repère : toutes les clés sont exprimées dans le « repère du siège » (mètres ; x vers la gauche du cheval, y vers le
// haut, z vers l'avant ; origine au point d'assise du cavalier — celui de Human.mount). Ce repère passe de la
// verticale (cap du cheval) au repère exact de l'os de selle pendant que le cavalier s'assoit : la dernière clé de la
// montée est la pose de cavalier, le rattachement à la selle (Human.mount) ne déplace ni ne tourne ni ne met à
// l'échelle quoi que ce soit. La descente part du même repère.
// Le personnage reste le même objet (même maillage, même squelette, même modèle réaliste) du début à la fin.
import { clearCsoControls } from './csoRide.js';
import * as THREE from 'three';
import { animateHuman } from '../entities/human/anim.js';
import { footTarget } from '../entities/human/anim.js';
import { RIDER_FIT, RIDER_SEAT } from '../entities/human.js';
import { clamp, lerp, wrapAngle } from '../core/math.js';

const HALF_PI = Math.PI / 2;
const ease = (u) => u * u * (3 - 2 * u);
const TR0 = { hx: 0, hy: 0, hz: 0, sx: 0, sy: 0, cx: 0, nx: 0, ny: 0, hdx: 0, hdy: 0 };
// Buste du cavalier en selle (voir anim.js riding : bassin légèrement basculé, buste d'aplomb, regard devant).
const TR_RIDE = { hx: 0.08, hy: 0, hz: 0, sx: 0.014, sy: 0, cx: 0.012, nx: -0.05, ny: 0, hdx: -0.04, hdy: 0 };
// Pied à l'étrier : talon bas, pointe légèrement ouverte.
const STIRRUP_Q = new THREE.Euler(0.32, 0.18, 0.06);

const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qf = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

// ---------- Clés ----------
// root [x, z, yaw] : point au sol sous le personnage (repère du siège) et cap (0 = vers l'avant du cheval) ;
// ry : hauteur de la racine (sol = -H, assis = 0) ; tilt : 0 repère vertical … 1 repère de la selle ;
// hips [x, y, z] ; tr : angles du tronc ; near / far : pied côté montoir / pied opposé, { g: [x, z, lacet] } au sol,
// { s: 1 } dans l'étrier, { a: [x, y, z] } en l'air (lift : hauteur d'enjambée vers cette clé) ;
// hn / hf : main côté montoir / opposée (point [x, y, z] ou null), gn / gf : fermeture des doigts.
class Seq {
  constructor() {
    this.keys = [];
    this.t = 0;
  }
  at(dt, ch) {
    this.t += dt;
    const last = this.keys[this.keys.length - 1];
    const k = last ? { ...last, tr: { ...last.tr }, lift: null } : { tr: { ...TR0 } };
    Object.assign(k, ch, { t: this.t });
    if (ch.tr) k.tr = { ...(last ? last.tr : TR0), ...ch.tr };
    this.keys.push(k);
    return this;
  }
}

// Mesures du cavalier et du cheval utiles aux clés (mètres).
function dimsOf(hu, horse, H) {
  const info = hu.bones.__rig.info, s = hu.scale;
  const fit = { ...RIDER_FIT, ...(horse.riderFit || {}) };
  return { s, info, H, Hs: info.hipsY * s - 0.015, seat: info.seatToHips * s, fit };
}

// Debout au sol du côté montoir, à (x, z), cap yaw (repère du siège, côté gauche ; le miroir est appliqué après).
function standKey(D, x, z, yaw, extra = {}) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = -Math.cos(yaw), rz = Math.sin(yaw); // droite du personnage
  const w = 0.11;
  return {
    root: [x, z, yaw], ry: -D.H, tilt: 0,
    hips: [x - fx * 0.02, -D.H + D.Hs, z - fz * 0.02],
    near: { g: [x - rx * w + fx * 0.03, z - rz * w + fz * 0.03, yaw + 0.12] },
    far: { g: [x + rx * w - fx * 0.02, z + rz * w - fz * 0.02, yaw - 0.12] },
    ...extra,
  };
}

// Main sur le casque (sommet du front) d'un cavalier debout en (x, z), cap yaw.
function headPoint(D, x, z, yaw) {
  return [x + Math.sin(yaw) * 0.07, -D.H + D.s * 1.6, z + Math.cos(yaw) * 0.07];
}

// Points de contact (repère du siège, côté gauche).
function points(D) {
  const f = D.fit;
  return {
    withers: [0.06, 0.16, 0.5], // rênes et crins, devant le pommeau
    pommel: [0.1, 0.1, 0.22],
    cantle: [-0.02, 0.1, -0.24],
    stirrupN: [f.stirrupX, f.stirrupY, f.stirrupZ],
    stirrupF: [-f.stirrupX, f.stirrupY, f.stirrupZ],
    handN: [f.handX, f.handY, f.handZ],
    handF: [-f.handX, f.handY, f.handZ],
    croupTop: [0.0, 0.62, -0.78], // au-dessus de la croupe (jambe tendue, sans la toucher)
  };
}

// Trajet du pied droit par-dessus la croupe (repère du siège, côté gauche) : en arrière le long du flanc gauche, juste
// au-dessus de la croupe (dos à y ≈ −0,05 à z −0,5…−0,7), puis en descendant le long du flanc droit (demi-largeur
// ≈ 0,27 m à y −0,2) ; jamais tendu à l'horizontale sur le côté.
const ARC = [
  [0.48, -0.1, -0.52],
  [0.0, 0.18, -0.76],
  [-0.46, -0.1, -0.42],
];

// Montée (durée ~2,3 s à l'arrêt, plus l'approche). Debout dans l'étrier, le cavalier reste sur le flanc, le bassin à
// hauteur de la selle et le buste penché par-dessus (jamais debout sur le dos du cheval).
function mountKeys(D) {
  const P = points(D), S = new Seq();
  const sx = 0.62, sz = 0.12, yaw0 = -HALF_PI - 0.42; // face au flanc, tourné vers l'arrière du cheval
  const ride = D.seat, g = -D.H + D.Hs;
  const k = 0.84; // cadence
  // 0. Debout près de l'épaule, à hauteur de la selle.
  S.at(0, { ...standKey(D, sx, sz, yaw0), hn: null, hf: null, gn: 0, gf: 0 });
  // 1-3. Main gauche aux rênes sur le garrot ; main droite au casque (il est mis), puis près du pommeau.
  S.at(0.4 * k, { hn: P.withers, gn: 0.9, hf: headPoint(D, sx, sz, yaw0), gf: 0.6, tr: { sx: 0.06, hy: 0.05, nx: -0.08 }, ev: 'helmetOn' });
  S.at(0.26 * k, { hf: P.pommel, gf: 0.85, tr: { sx: 0.14, hy: 0.1 }, hips: [sx - 0.04, g - 0.02, sz - 0.01] });
  // 4. Pied gauche dans l'étrier (genou levé, appui sur la jambe droite).
  S.at(0.36 * k, { near: { s: 'iron' }, lift: { near: 0.12 }, hips: [sx - 0.08, g - 0.06, sz - 0.03], tr: { sx: 0.22 } });
  // 5. Flexion de la jambe d'appel, puis poussée : le poids passe sur l'étrier, le cavalier s'élève contre le flanc,
  //    buste penché au-dessus de la selle, jambe droite tendue derrière la gauche.
  S.at(0.14 * k, { hips: [sx - 0.09, g - 0.13, sz - 0.03], tr: { sx: 0.26 } });
  S.at(0.42 * k, {
    root: [0.42, sz - 0.02, yaw0 + 0.1], ry: -D.H * 0.5,
    hips: [0.42, ride + 0.06, 0.04],
    far: { a: [0.5, D.fit.stirrupY + 0.1, -0.16] }, lift: { far: 0.05 },
    tr: { sx: 0.42, cx: 0.12 },
  });
  // 6. Jambe droite lancée en arc autour de la croupe : dehors et en arrière du flanc gauche, haut au-dessus de la
  //    croupe, puis dehors du flanc droit (jamais à travers la hanche) ; le corps pivote face à l'avant.
  S.at(0.18 * k, {
    root: [0.28, -0.03, -1.35], ry: -D.H * 0.35, tilt: 0.15,
    hips: [0.26, ride + 0.1, 0],
    far: { a: ARC[0] }, tr: { sx: 0.48, cx: 0.14, hy: 0.06 },
  });
  S.at(0.22 * k, {
    root: [0.2, -0.05, -1.0], ry: -D.H * 0.25, tilt: 0.3,
    hips: [0.2, ride + 0.12, -0.02],
    far: { a: ARC[1] }, lift: { far: 0.08 }, tr: { sx: 0.5, cx: 0.15, hy: 0.1 },
  });
  S.at(0.18 * k, {
    root: [0.1, -0.02, -0.5], ry: -0.1, tilt: 0.55,
    hips: [0.1, ride + 0.1, -0.01],
    far: { a: ARC[2] }, tr: { sx: 0.38, cx: 0.1, hy: 0.06 },
  });
  S.at(0.22 * k, {
    root: [0.05, 0, -0.2], ry: -0.05, tilt: 0.7,
    hips: [0.06, ride + 0.08, 0],
    far: { a: [-D.fit.stirrupX - 0.03, D.fit.stirrupY + 0.08, D.fit.stirrupZ - 0.05] },
    tr: { sx: 0.3, cx: 0.08, hy: 0.04 },
  });
  // 7. Descente douce dans la selle.
  S.at(0.3 * k, { root: [0, 0, 0], ry: 0, tilt: 1, hips: [0, ride + 0.01, 0], near: { s: 1 }, tr: { ...TR_RIDE, sx: 0.08 }, hf: P.handF, gf: 0.9 });
  // 8-9. Pied droit à l'étrier, mains aux rênes, position de cavalier.
  S.at(0.26 * k, { far: { s: 1 }, lift: { far: 0.04 }, hips: [0, ride, 0], hn: P.handN, hf: P.handF, gn: 0.9, gf: 0.9, tr: { ...TR_RIDE } });
  return S.keys;
}

// Descente (durée ~2,2 s une fois le cheval arrêté) : gestes inverses.
function dismountKeys(D) {
  const P = points(D), S = new Seq();
  const ride = D.seat;
  const k = 0.9;
  const end = standKey(D, 0.6, 0.18, -HALF_PI + 0.15);
  // 0. Position de cavalier.
  S.at(0, { root: [0, 0, 0], ry: 0, tilt: 1, hips: [0, ride, 0], tr: { ...TR_RIDE }, near: { s: 1 }, far: { s: 1 }, hn: P.handN, hf: P.handF, gn: 0.9, gf: 0.9 });
  // 1-2. Pied droit libéré, rênes dans la main gauche sur le garrot, main droite sur le pommeau.
  S.at(0.28 * k, { far: { a: [-D.fit.stirrupX - 0.05, D.fit.stirrupY + 0.03, D.fit.stirrupZ - 0.06] }, hn: P.withers, hf: P.pommel, tr: { ...TR_RIDE, sx: 0.16 } });
  // 3. Appui sur l'étrier gauche : le bassin se soulève, buste penché sur l'encolure.
  S.at(0.3 * k, { root: [0.05, 0, -0.2], ry: -0.05, tilt: 0.7, hips: [0.06, ride + 0.08, 0], near: { s: 'iron' }, tr: { sx: 0.35, cx: 0.08 } });
  // 4. Jambe droite lancée en arc : dehors du flanc droit, haut au-dessus de la croupe, dehors du flanc gauche ;
  //    le corps pivote vers le flanc gauche.
  S.at(0.18 * k, {
    root: [0.1, -0.02, -0.5], ry: -0.1, tilt: 0.55,
    hips: [0.1, ride + 0.1, -0.01],
    far: { a: ARC[2] }, tr: { sx: 0.38, cx: 0.1, hy: 0.06 },
  });
  S.at(0.22 * k, {
    root: [0.2, -0.05, -1.0], ry: -D.H * 0.25, tilt: 0.3,
    hips: [0.2, ride + 0.12, -0.02],
    far: { a: ARC[1] }, lift: { far: 0.08 }, tr: { sx: 0.5, cx: 0.15, hy: 0.1 },
  });
  S.at(0.18 * k, {
    root: [0.28, -0.03, -1.35], ry: -D.H * 0.35, tilt: 0.15,
    hips: [0.26, ride + 0.1, 0],
    far: { a: ARC[0] }, tr: { sx: 0.48, cx: 0.14, hy: 0.06 },
  });
  // 5. Transfert du poids à gauche : jambe droite le long de la gauche, buste penché sur la selle.
  S.at(0.26 * k, {
    root: [0.42, 0.04, -HALF_PI - 0.32], ry: -D.H * 0.5, tilt: 0,
    hips: [0.42, ride + 0.04, 0.04],
    far: { a: [0.46, D.fit.stirrupY - 0.05, -0.08] }, tr: { sx: 0.3, cx: 0.08 },
  });
  // 6. Pied gauche libéré, descente contrôlée, réception genoux fléchis.
  S.at(0.38 * k, {
    root: [0.57, 0.14, -HALF_PI + 0.05], ry: -D.H,
    hips: [0.57, -D.H + D.Hs - 0.06, 0.15],
    far: { g: [0.6, 0.04, -HALF_PI + 0.1] }, near: { g: [0.55, 0.26, -HALF_PI + 0.2] }, lift: { near: 0.05 },
    hf: null, gf: 0, tr: { sx: 0.08 },
  });
  // 7-8. Redressé, debout à l'épaule, rênes en main ; main droite au casque (il est retiré), puis le long du corps.
  S.at(0.34 * k, { ...end, hn: P.withers, gn: 0.9, hf: null, tr: { sx: 0.04 } });
  S.at(0.32 * k, { hf: headPoint(D, end.root[0], end.root[1], end.root[2]), gf: 0.6, tr: { sx: 0.02, nx: -0.06 }, ev: 'helmetOff' });
  S.at(0.3 * k, { hf: null, gf: 0, tr: { sx: 0.02 } });
  return S.keys;
}

// ---------- Contrôleur ----------
export class HorseMount {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.active = false;
    this.dir = null; // 'up' | 'down'
    this.phase = null; // approach | stop | seq
    this.horse = null;
    this.keys = null;
    this.t = 0;
    this.side = 1; // 1 = côté gauche (montoir), -1 = côté droit
    this.camK = 0;
    this.board = {
      hips: new THREE.Vector3(), trunk: { ...TR0 },
      feet: { l: { pos: new THREE.Vector3(), q: new THREE.Quaternion(), pole: new THREE.Vector3(), toe: 0 }, r: { pos: new THREE.Vector3(), q: new THREE.Quaternion(), pole: new THREE.Vector3(), toe: 0 } },
      hands: { l: { pos: new THREE.Vector3(), pole: new THREE.Vector3(), w: 0, grip: 0 }, r: { pos: new THREE.Vector3(), pole: new THREE.Vector3(), w: 0, grip: 0 } },
    };
    this._root = new THREE.Vector3();
    this._rootQ = new THREE.Quaternion();
    this._seat = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
  }
  get human() {
    return this.player.human;
  }

  // Repère du siège au temps présent : point d'assise (monde), orientation (cap vertical → os de selle selon tilt).
  _seatFrame(h, tilt) {
    const bone = h.bones.saddle || h.bones.body;
    const off = h.riderSeat || (h.bones.saddle ? RIDER_SEAT.saddle : RIDER_SEAT.body);
    bone.updateWorldMatrix(true, false);
    this._seat.copy(off).applyMatrix4(bone.matrixWorld);
    bone.getWorldQuaternion(_qb);
    _qy.setFromAxisAngle(_Y, h.heading);
    return _qf.copy(_qy).slerp(_qb, clamp(tilt, 0, 1));
  }
  // Point du repère du siège (côté appliqué) → monde.
  _toWorld(p, Qf, out) {
    return out.set(p[0] * this.side, p[1], p[2]).applyQuaternion(Qf).add(this._seat);
  }

  // Côté du montoir : gauche, sauf obstacle sur ce flanc (alors droite).
  _pickSide(h) {
    const hu = this.human;
    const lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
    const blocked = (s) => hu._sideBlocked(h.pos, lx * 1.3 * s, lz * 1.3 * s);
    if (!blocked(1)) return 1;
    if (!blocked(-1)) return -1;
    return 0;
  }

  _ground(h) {
    const g = this.game;
    return g.world ? g.world.walkHeight(h.pos.x, h.pos.z) : g.terrain.getHeight(h.pos.x, h.pos.z);
  }

  // ---------- Montée ----------
  beginMount(h) {
    const pl = this.player, hu = this.human;
    if (this.active || !h || pl.mode !== 'foot' || hu.carrying) return false;
    const side = this._pickSide(h);
    if (!side) {
      this.game.hud?.hint('Pas la place de monter ici : éloigne le cheval de la clôture.', 2600);
      return false;
    }
    this._stopHorse(h);
    this.side = side;
    this.horse = h;
    this.active = true;
    this.dir = 'up';
    this.phase = 'approach';
    this.t = 0;
    this.camK = 0;
    this._seatFrame(h, 0);
    this.D = dimsOf(hu, h, Math.max(0.9, this._seat.y - this._ground(h)));
    this.keys = mountKeys(this.D);
    this.path = this._path(h);
    // Étriers descendus dès l'approche (on les descend avant de se mettre en selle).
    h.mountingBy = hu;
    this.game.bus.emit('player:mountStart', h);
    return true;
  }

  // Contournement par l'avant du cheval (jamais au travers, jamais derrière les postérieurs).
  _path(h) {
    const hu = this.human;
    const fx = Math.sin(h.heading), fz = Math.cos(h.heading), lx = Math.cos(h.heading), lz = -Math.sin(h.heading);
    const dx = hu.pos.x - h.pos.x, dz = hu.pos.z - h.pos.z;
    const left = (dx * lx + dz * lz) * this.side, fwd = dx * fx + dz * fz;
    const P = (l, f) => ({ x: h.pos.x + lx * l * this.side + fx * f, z: h.pos.z + lz * l * this.side + fz * f });
    const pts = [];
    if (left < 0.45) {
      if (fwd < 1.6) pts.push(P(Math.min(-1.0, left), 2.3));
      pts.push(P(1.1, 2.3));
    }
    // Point de départ de la séquence (repère du siège → monde, au sol).
    const k0 = this.keys[0];
    this._toWorld([k0.root[0], 0, k0.root[1]], this._seatFrame(h, 0), _w);
    pts.push({ x: _w.x, z: _w.z, last: true });
    return pts;
  }

  _approach(dt) {
    const hu = this.human, h = this.horse;
    this._stopHorse(h);
    const tgt = this.path[0];
    const dx = tgt.x - hu.pos.x, dz = tgt.z - hu.pos.z, d = Math.hypot(dx, dz);
    if (d > (tgt.last ? 0.03 : 0.3)) {
      const sp = 1.4, step = Math.min(d, sp * dt);
      hu.pos.x += (dx / d) * step;
      hu.pos.z += (dz / d) * step;
      hu.heading = wrapAngle(hu.heading + clamp(wrapAngle(Math.atan2(dx, dz) - hu.heading), -9 * dt, 9 * dt));
      hu.speed = sp;
      hu.pose = 'walk';
      hu.update(dt, this.game.camera.position);
      return;
    }
    if (!tgt.last) {
      this.path.shift();
      return;
    }
    // Arrivé : on se tourne vers le flanc, puis la séquence commence.
    const want = h.heading + this.keys[0].root[2] * this.side;
    const err = wrapAngle(want - hu.heading);
    hu.speed = 0;
    if (Math.abs(err) > 0.04) {
      hu.heading = wrapAngle(hu.heading + clamp(err, -6 * dt, 6 * dt));
      hu.pose = 'walk';
      hu.update(dt, this.game.camera.position);
      return;
    }
    this.phase = 'seq';
    this.t = 0;
    this._evI = 0;
  }

  // ---------- Descente ----------
  beginDismount() {
    const pl = this.player, h = pl.horse, hu = this.human;
    if (this.active || pl.mode !== 'ride' || !h || hu.mounted !== h) return false;
    const side = this._pickSide(h);
    if (!side) {
      // Aucun flanc libre : descente immédiate (comportement d'origine, derrière le cheval si besoin).
      pl.dismount();
      return true;
    }
    this.side = side;
    this.horse = h;
    this.active = true;
    this.dir = 'down';
    this.phase = 'stop';
    this.t = 0;
    this.camK = 1;
    this.game.bus.emit('player:dismountStart', h);
    return true;
  }

  // Cheval à l'arrêt (il garde ses petits mouvements naturels : respiration, oreilles, queue).
  _stopHorse(h) {
    h.ai = null;
    h.control.mag = 0;
    h.control.gallop = false;
    clearCsoControls(h.control);
  }

  // ---------- Mise à jour ----------
  update(dt) {
    if (!this.active) return;
    const h = this.horse, g = this.game;
    if (!h || !g.horses.includes(h)) return this.cancel();
    if (this.phase === 'approach') {
      this._approach(dt);
      this.camK = 0;
      return;
    }
    if (this.phase === 'stop') {
      // Le cheval s'arrête ; le cavalier reste en selle jusqu'à l'arrêt.
      this._stopHorse(h);
      this.human.animateRiding(dt);
      if (h.speed > 0.15) return;
      this._detach();
      this.keys = dismountKeys(this.D);
      this.phase = 'seq';
      this.t = 0;
      this._evI = 0;
    }
    this._stopHorse(h);
    this.t += dt;
    const K = this.keys, end = K[K.length - 1].t;
    this._apply(Math.min(this.t, end), dt);
    // Gestes ponctuels au passage des clés : casque mis (montée) ou retiré (descente).
    while (this._evI < K.length && K[this._evI].t <= this.t) {
      const ev = K[this._evI++].ev;
      if (ev === 'helmetOn') this.player.setHelmet(true);
      else if (ev === 'helmetOff') this.player.setHelmet(false);
    }
    const u = clamp(this.t / end, 0, 1);
    this.camK = this.dir === 'up' ? ease(clamp((u - 0.35) / 0.65, 0, 1)) : 1 - ease(clamp(u / 0.75, 0, 1));
    if (this.t >= end) this.dir === 'up' ? this._finishMount() : this._finishDismount();
  }

  // Le cavalier quitte l'os de selle sans bouger : même transformation monde, enfant de la scène.
  _detach() {
    const hu = this.human, h = this.horse;
    this._seatFrame(h, 1);
    this.D = dimsOf(hu, h, Math.max(0.9, this._seat.y - this._ground(h)));
    hu.mesh.updateWorldMatrix(true, false);
    hu.mesh.matrixWorld.decompose(_a, _q, _s);
    hu.mesh.parent?.remove(hu.mesh);
    this.game.scene.add(hu.mesh);
    hu.mesh.position.copy(_a);
    hu.mesh.quaternion.copy(_q);
    hu.mesh.scale.setScalar(hu.scale);
    h.rider = null;
    h.mountingBy = hu;
    hu.mounted = null;
    hu._attach = null;
  }

  _evaluate(t) {
    const K = this.keys;
    let i = 0;
    while (i < K.length - 2 && K[i + 1].t < t) i++;
    const a = K[i], b = K[i + 1] || a;
    const span = b.t - a.t;
    const u = span > 1e-6 ? clamp((t - a.t) / span, 0, 1) : 1;
    return { a, b, u, e: ease(u) };
  }

  // Pied d'une clé → cheville et orientation (repère du modèle).
  _foot(spec, sideName, Qf, ryaw, outPos, outQ) {
    const D = this.D, info = D.info, s = this.side;
    if (spec.g) {
      // Au sol : point (x, z) du repère du siège, hauteur du sol, lacet.
      this._toWorld([spec.g[0], -D.H, spec.g[1]], Qf, _w).applyMatrix4(_inv);
      footTarget(info, outPos, outQ, _w.x, _w.z, _w.y, 0, s * spec.g[2] - s * ryaw);
      return;
    }
    if (spec.s) {
      // Dans l'étrier (plante sur la grille, talon bas) : étrier qui pend à sa place (« iron », pied qui y entre ou
      // en sort), ou position de cavalier en selle (1).
      const sg = sideName === 'l' ? 1 : -1;
      if (spec.s === 'iron') {
        const b = this.horse.bones[sideName === 'l' ? 'stirL' : 'stirR'];
        b.parent.updateWorldMatrix(true, false);
        _w.copy(b.userData.rest).applyMatrix4(b.parent.matrixWorld).applyMatrix4(_inv);
      } else {
        const P = points(D);
        const near = (sideName === 'l') === (s === 1);
        this._toWorld(near ? P.stirrupN : P.stirrupF, Qf, _w).applyMatrix4(_inv);
      }
      outQ.setFromEuler(_e.set(STIRRUP_Q.x, sg * STIRRUP_Q.y, sg * STIRRUP_Q.z));
      outQ.premultiply(_q.setFromAxisAngle(_Y, -s * ryaw));
      _v.set(0, -info.ankleY + 0.012, info.toe[2] - 0.005).applyQuaternion(outQ);
      outPos.copy(_w).sub(_v);
      return;
    }
    // En l'air : cheville au point donné, pied à plat dans l'axe du corps.
    this._toWorld(spec.a, Qf, _w).applyMatrix4(_inv);
    outPos.copy(_w);
    outQ.setFromEuler(_e.set(0.25, 0, 0));
  }

  _apply(t, dt) {
    const { a, b, u, e } = this._evaluate(t);
    const h = this.horse, hu = this.human, B = this.board, D = this.D, s = this.side;
    const tilt = lerp(a.tilt ?? 0, b.tilt ?? 0, e);
    const Qf = this._seatFrame(h, tilt).clone();
    // Racine : point au sol (ou en selle) et cap.
    const rx = lerp(a.root[0], b.root[0], e), rz = lerp(a.root[1], b.root[1], e);
    const ryaw = a.root[2] + wrapAngle(b.root[2] - a.root[2]) * e;
    const ry = lerp(a.ry, b.ry, e);
    this._toWorld([rx, ry, rz], Qf, this._root);
    this._rootQ.copy(Qf).multiply(_q.setFromAxisAngle(_Y, s * ryaw));
    _m.compose(this._root, this._rootQ, _s.setScalar(hu.scale));
    _inv.copy(_m).invert();
    // Bassin et tronc (repère du modèle ; angles latéraux en miroir côté droit).
    const hp = [lerp(a.hips[0], b.hips[0], e), lerp(a.hips[1], b.hips[1], e), lerp(a.hips[2], b.hips[2], e)];
    this._toWorld(hp, Qf, B.hips).applyMatrix4(_inv);
    for (const k in B.trunk) {
      const v = lerp(a.tr[k] || 0, b.tr[k] || 0, e);
      B.trunk[k] = k === 'hy' || k === 'hz' || k === 'sy' || k === 'ny' || k === 'hdy' ? v * s : v;
    }
    // Pieds : côté montoir = gauche (ou droit en miroir).
    for (const [role, sideName] of [['near', s === 1 ? 'l' : 'r'], ['far', s === 1 ? 'r' : 'l']]) {
      const F = B.feet[sideName];
      this._foot(a[role], sideName, Qf, ryaw, _a, F.q);
      const qa = F.q.clone();
      this._foot(b[role], sideName, Qf, ryaw, _b, F.q);
      F.q.copy(qa.slerp(F.q, e));
      F.pos.copy(_a).lerp(_b, e);
      // Enjambée : arc au-dessus de la trajectoire (pied levé, sans racler la selle ni le sol).
      const lift = b.lift?.[role] || 0;
      if (lift) F.pos.y += (Math.sin(Math.PI * u) * lift) / hu.scale;
      const sg = sideName === 'l' ? 1 : -1;
      // Orientation du genou (vers l'extérieur) : pied à l'étrier qui pend (« iron », debout contre le flanc) bien
      // dehors ; en selle, celle de la pose de cavalier (fit.kneeOut : pas de saut au passage à la pose « ride ») ;
      // en l'air ou au sol, à peine dehors. Interpolée d'une clé à l'autre : la jambe qui quitte l'étrier ou y entre
      // ne bascule pas d'un coup à l'horizontale.
      const latOf = (spec) => (spec.s === 'iron' ? 1.3 : spec.s ? D.fit.kneeOut ?? 0.45 : 0.25);
      const ironA = a[role].s === 'iron', ironB = b[role].s === 'iron';
      F.pole.set(sg * lerp(latOf(a[role]), latOf(b[role]), e), ironA || ironB ? -0.05 : 0.1, 1).normalize();
      // Cheval large (réglage du cheval riderFit.mountKneeOut, donné par le cheval WildMesh) : tant que le pied côté
      // montoir est dans l'étrier qui pend, son genou est orienté vers l'extérieur du flanc (sinon la composante
      // « avant » du pôle pousse le genou dans le cheval) ; l'autre jambe aussi tant qu'elle pend de ce côté pendant la
      // poussée. Jamais pendant l'enjambée ni à la réception (jambes « en ailes »).
      const kOut = Math.min(D.fit.mountKneeOut || 0, 1.5);
      const nearIron = (k) => k.near.s === 'iron';
      if (kOut > 0 && tilt < 0.95 && (role === 'near' ? ironA || ironB : nearIron(a) && nearIron(b))) {
        _w.set(1, 0, 0).applyAxisAngle(_Y, -s * ryaw); // gauche du cheval, repère du personnage
        const footX = s * rx + F.pos.dot(_w) * hu.scale; // pied, repère du siège (m ; clés écrites côté gauche)
        if (role === 'near' || Math.sign(footX) === s) {
          const w = role === 'near' ? (ironA && ironB ? 1 : ironA ? 1 - e : e) : 1;
          F.pole.addScaledVector(_w, Math.sign(footX || s) * kOut * (1 - tilt) * w).normalize();
        }
      }
      F.toe = 0;
    }
    // Pied dans l'étrier (arrivé dedans, pas encore sorti) : l'étrier le suit (Horse._stirrupsFollow).
    const ins = (role) => !!((a[role].s && b[role].s) || (b[role].s && e > 0.9) || (a[role].s && e < 0.1));
    hu.inStirrup = { [s === 1 ? 'l' : 'r']: ins('near'), [s === 1 ? 'r' : 'l']: ins('far') };
    // Mains.
    for (const [role, sideName] of [['n', s === 1 ? 'l' : 'r'], ['f', s === 1 ? 'r' : 'l']]) {
      const H = B.hands[sideName];
      const ha = a[`h${role}`], hb = b[`h${role}`];
      H.grip = lerp(a[`g${role}`] || 0, b[`g${role}`] || 0, e);
      const sg = sideName === 'l' ? 1 : -1;
      H.pole.set(sg * 0.6, -0.6, -0.4).normalize();
      if (!ha && !hb) {
        H.w = 0;
        continue;
      }
      if (ha && hb) {
        this._toWorld(ha, Qf, _a);
        this._toWorld(hb, Qf, _b);
        H.pos.copy(_a.lerp(_b, e)).applyMatrix4(_inv);
        H.w = 1;
      } else {
        this._toWorld(ha || hb, Qf, _a);
        H.pos.copy(_a).applyMatrix4(_inv);
        H.w = ha ? 1 - e : e;
      }
    }
    // Personnage : même maillage, posé par la séquence (pose « board »), position de la racine.
    hu.pos.copy(this._root);
    hu.heading = h.heading + s * ryaw;
    hu.speed = 0;
    hu.board = B;
    hu.anim.board = B;
    hu.pose = 'board';
    hu.anim.t += dt;
    hu._lod(0);
    if (dt > 0) animateHuman(hu.bones, 'board', hu.anim, dt);
    if (hu.mesh.parent !== this.game.scene) {
      hu.mesh.parent?.remove(hu.mesh);
      this.game.scene.add(hu.mesh);
    }
    hu.mesh.position.copy(this._root);
    hu.mesh.quaternion.copy(this._rootQ);
    hu.mesh.scale.setScalar(hu.scale);
    hu.mesh.visible = !hu.hidden;
  }

  _finishMount() {
    const pl = this.player, h = this.horse;
    this.active = false;
    this.phase = null;
    this.human.board = null;
    h.mountingBy = null;
    // Rattachement à la selle : même transformation monde que la dernière image (pose de cavalier, fondu court).
    pl.mount({ animated: true });
    this.horse = null;
    this.camK = 1;
    void h;
  }

  _finishDismount() {
    const pl = this.player, hu = this.human, h = this.horse;
    this.active = false;
    this.phase = null;
    hu.board = null;
    pl.mode = 'foot';
    pl.focusPos = hu.pos;
    hu.mounted = null;
    hu.pos.y = this.game.world ? this.game.world.walkHeight(hu.pos.x, hu.pos.z) : this.game.terrain.getHeight(hu.pos.x, hu.pos.z);
    hu.mesh.position.copy(hu.pos);
    hu.mesh.rotation.set(0, hu.heading, 0);
    hu.pose = 'walk';
    hu.inStirrup = null;
    h.mountingBy = null;
    h.control.mag = 0;
    this.horse = null;
    this.camK = 0;
    this.game.bus.emit('player:dismount', h);
  }

  // Interruption (téléportation, cheval retiré, chargement de partie) : état stable, jamais une demi-animation.
  cancel() {
    if (!this.active) return;
    const pl = this.player, hu = this.human, h = this.horse;
    this.active = false;
    this.phase = null;
    hu.board = null;
    hu.inStirrup = null;
    if (h) h.mountingBy = null;
    if (this.dir === 'up' || !h || !this.game.horses.includes(h)) {
      // À pied, à côté du cheval (ou là où l'on est).
      if (hu.mesh.parent !== this.game.scene) {
        hu.mesh.parent?.remove(hu.mesh);
        this.game.scene.add(hu.mesh);
      }
      hu.mounted = null;
      if (h) h.rider = null;
      pl.mode = 'foot';
      pl.focusPos = hu.pos;
      pl.setHelmet(false);
      hu.mesh.scale.setScalar(hu.scale);
      hu.setPosition(hu.pos.x, hu.pos.z, hu.heading);
      this.game.colliders.resolve(hu.pos, hu.radius || 0.35, -Infinity);
      hu.snap();
      hu.pose = 'walk';
    } else {
      // Descente interrompue : de nouveau en selle.
      hu.mount(h);
      pl.mode = 'ride';
      pl.focusPos = h.pos;
    }
    this.horse = null;
    this.camK = pl.mode === 'ride' ? 1 : 0;
  }

  // Caméra : profil glissant de la marche à la monte (point suivi, recul, hauteur), sans à-coup.
  focus(base) {
    if (!this.active || !this.horse) return base;
    const k = this.camK, hp = this.human.pos, h = this.horse;
    const pos = this._camPos.set(lerp(hp.x, h.pos.x, k), lerp(hp.y, h.pos.y, k), lerp(hp.z, h.pos.z, k));
    return { pos, heading: lerp(0, 1, 0) + (k > 0.5 ? h.heading : this.human.heading), speed: 0, mode: 'drive', camDist: lerp(4.6, 6.6, k), camHeight: lerp(1.55, 2.35, k) };
  }

  // Point sûr à enregistrer pendant une séquence : au sol à côté du cheval (montée) ; en selle (descente).
  safeFoot() {
    if (!this.active || this.dir !== 'up') return null;
    return this.human.pos.clone();
  }
}

const _e = new THREE.Euler();
