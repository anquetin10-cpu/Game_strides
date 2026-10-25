// Personnage : déplacement au sol, collisions, objets portés, animation, niveaux de détail, monte.
import * as THREE from 'three';
import { createHumanMesh, animateHuman, LOD_DIST } from './humanModel.js';
import { randomFirstName } from './human/outfits.js';
import { clamp, dampAngle, wrapAngle } from '../core/math.js';
import { box, partsToGeo } from '../world/builders.js';
import { paint } from '../world/shapes.js';
import { SKIN_MAT } from './rig.js';
import { WORLD } from '../world/layout.js';

const ITEM_GEOS = {};
function itemGeo(kind) {
  if (ITEM_GEOS[kind]) return ITEM_GEOS[kind];
  let g;
  if (kind === 'hay') g = partsToGeo([[box(0.6, 0.38, 0.42, false), '#d6bf74'], [box(0.62, 0.03, 0.44, false), '#a8843f', { y: 0.08 }], [box(0.62, 0.03, 0.44, false), '#a8843f', { y: -0.08 }]]);
  else if (kind === 'saddle') g = partsToGeo([[box(0.42, 0.14, 0.55, false), '#5b3b25'], [box(0.36, 0.12, 0.08, false), '#5b3b25', { y: 0.1, z: -0.22 }], [box(0.6, 0.3, 0.03, false), '#3a2618', { y: -0.1 }]]);
  else if (kind === 'bag') g = partsToGeo([[box(0.36, 0.5, 0.28, false), '#2f5f8a'], [box(0.37, 0.06, 0.29, false), '#f2f1ec', { y: 0.1 }]]);
  else if (kind === 'box') g = partsToGeo([[box(0.46, 0.34, 0.36, false), '#b9a17a'], [box(0.47, 0.02, 0.1, false), '#1b1c1f', { y: 0.17 }]]);
  else g = paint(box(0.3, 0.3, 0.3, false), '#888888');
  ITEM_GEOS[kind] = g;
  return g;
}
// Objet tenu devant le ventre (repère de l'os « chest ») et prise des mains.
const CARRY = {
  hay: { pos: [0, -0.26, 0.32], w: 0.56, y: -0.2, z: 0.3 },
  saddle: { pos: [0, -0.24, 0.3], w: 0.38, y: -0.2, z: 0.28 },
  bag: { pos: [0, -0.24, 0.27], w: 0.34, y: -0.14, z: 0.25 },
  box: { pos: [0, -0.24, 0.3], w: 0.44, y: -0.18, z: 0.28 },
};

// Point d'assise (contact des ischions) dans le repère de l'os d'attache du cheval.
// saddle : os « saddle » du nouveau cheval (placé au creux du siège) ; body : cheval actuel (sur la selle).
export const RIDER_SEAT = { saddle: new THREE.Vector3(0, 0, 0), body: new THREE.Vector3(0, 0.575, 0.0) };
// Ajustement de la position à cheval (mètres, repère de la selle, relatif au point d'assise) ; surchargeable par
// horse.riderFit ou mount(horse, { fit }).
export const RIDER_FIT = { stirrupX: 0.38, stirrupY: -0.69, stirrupZ: 0.06, kneeOut: 1.3, handX: 0.065, handY: 0.2, handZ: 0.36 };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _s = new THREE.Vector3();
const FIST = new THREE.Vector3(0, -0.068, 0.012);

export class Human {
  constructor(game, outfit, opts = {}) {
    this.game = game;
    const { mesh, bones } = createHumanMesh(outfit, { name: opts.name });
    this.mesh = mesh;
    this.bones = bones;
    this.outfit = outfit;
    this.model = mesh.userData.human;
    this.sex = this.model.desc.sex;
    this.scale = this.model.desc.scale;
    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.pose = 'stand';
    this.anim = { phase: Math.random(), speed: 0, t: Math.random() * 10, hair: this.model.desc.hair === 'ponytail', turnRate: 0 };
    this.radius = 0.35;
    this.carrying = null;
    this.ai = opts.ai || null;
    this.isPlayer = !!opts.player;
    this._name = opts.name || '';
    this.visibleDist = 170;
    this.mounted = null;
    this._acc = 0;
    this._tick = Math.floor(Math.random() * 4);
    this.handL = new THREE.Vector3();
    this.handR = new THREE.Vector3();
    game.scene.add(this.mesh);
    this.snap();
  }

  // Prénom : celui donné au PNJ, sinon un prénom cohérent avec la morphologie (tiré au premier besoin).
  get name() {
    return this._name || (this._name = randomFirstName(this.sex));
  }
  set name(v) {
    this._name = v || '';
  }

  // Hauteur (m) entre le point d'assise et l'articulation de la hanche quand le personnage est à cheval.
  get seatHeight() {
    return (this.model.rig.seatToHips - (this.model.rig.hipsY - this.model.rig.hipJointY)) * this.scale;
  }

  snap() {
    this.pos.y = this.game.terrain.getHeight(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  setPosition(x, z, heading = this.heading) {
    this.pos.x = x;
    this.pos.z = z;
    this.heading = heading;
    this.speed = 0;
    this.snap();
  }

  carry(kind) {
    this.drop();
    if (!kind) return;
    const m = new THREE.Mesh(itemGeo(kind), SKIN_MAT);
    m.castShadow = true;
    // L'objet suit le buste ; les mains le tiennent de chaque côté.
    const c = CARRY[kind] || CARRY.box;
    this.bones.chest.add(m);
    m.position.set(c.pos[0], c.pos[1], c.pos[2]);
    this.anim.carry = c;
    this.carrying = { kind, mesh: m };
  }

  drop() {
    if (this.carrying) {
      this.carrying.mesh.parent?.remove(this.carrying.mesh);
      this.carrying = null;
      this.anim.carry = null;
    }
  }

  // Déplacement dans une direction monde (dx, dz) normalisée, à la vitesse demandée.
  move(dx, dz, targetSpeed, dt) {
    const g = this.game;
    if (targetSpeed > 0.05) {
      const h = Math.atan2(dx, dz);
      this.heading = dampAngle(this.heading, h, 12, dt);
    }
    const acc = targetSpeed > this.speed ? 14 : 18;
    this.speed += clamp(targetSpeed - this.speed, -acc * dt, acc * dt);
    const mx = Math.sin(this.heading) * this.speed * dt;
    const mz = Math.cos(this.heading) * this.speed * dt;
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += mx;
    this.pos.z += mz;
    const lim = WORLD.half - 6;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    g.colliders.resolve(this.pos, this.radius, g.terrain.getHeight(this.pos.x, this.pos.z));
    // Eau trop profonde : seul un pas qui l'approfondit est refusé (marée montante : on peut toujours regagner la plage).
    const deep = g.terrain.waterDepth(this.pos.x, this.pos.z);
    if (deep > 1.0 && deep > g.terrain.waterDepth(prevX, prevZ)) {
      this.pos.x = prevX;
      this.pos.z = prevZ;
    }
    this.heading = wrapAngle(this.heading);
  }

  // Niveau de détail selon la distance à la caméra (avec hystérésis).
  _lod(d) {
    const cur = this.model.lod;
    let l = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2;
    if (l > cur && d < LOD_DIST[l - 1] + 1.5) l = cur;
    this.model.setLOD(l);
  }

  // Cadence d'animation : chaque image près de la caméra, une sur deux / quatre au loin.
  _animStep(d, dt) {
    this._acc += dt;
    const every = d < 22 ? 1 : d < 55 ? 2 : 4;
    if (++this._tick % every) return 0;
    const step = Math.min(this._acc, 0.2);
    this._acc = 0;
    return step;
  }

  update(dt, camPos) {
    this.anim.t += dt;
    if (this.mounted) return;
    if (this.ai) this.ai.update(this, dt);
    this.pos.y = this.game.terrain.getHeight(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const far = camPos ? Math.hypot(camPos.x - this.pos.x, camPos.z - this.pos.z) : 0;
    this.mesh.visible = far < this.visibleDist && !this.hidden;
    if (!this.mesh.visible) return;
    this._lod(far);
    const step = this.isPlayer ? dt : this._animStep(far, dt);
    if (!step) return;
    this.anim.speed = this.speed;
    const dh = wrapAngle(this.heading - (this._lastHeading ?? this.heading));
    this._lastHeading = this.heading;
    this.anim.turnRate = this.anim.turnRate * 0.6 + (dh / step) * 0.4;
    const pose = this.carrying ? 'carry' : this.pose === 'stand' || this.pose === 'walk' ? 'walk' : this.pose;
    animateHuman(this.bones, pose, this.anim, step);
  }

  // Monter : le maillage devient enfant de l'os « saddle » du cheval s'il existe (sinon « body »), au point d'assise.
  // opts.offset (Vector3, repère de l'os) et opts.fit (voir RIDER_FIT) permettent d'ajuster selon le cheval.
  mount(horse, opts = {}) {
    this.mounted = horse;
    horse.rider = this;
    this.drop();
    const saddle = horse.bones.saddle;
    const bone = saddle || horse.bones.body;
    this._attach = bone;
    this._fit = { ...RIDER_FIT, ...(horse.riderFit || {}), ...(opts.fit || {}) };
    const off = opts.offset || horse.riderSeat || (saddle ? RIDER_SEAT.saddle : RIDER_SEAT.body);
    bone.add(this.mesh);
    this.mesh.position.copy(off);
    this.mesh.rotation.set(0, 0, 0);
    // Compenser l'échelle du cheval : le cavalier garde sa taille réelle.
    bone.updateWorldMatrix(true, false);
    bone.getWorldScale(_s);
    this._parentScale = _s.x || 1;
    this.mesh.scale.setScalar(this.scale / this._parentScale);
    this.mesh.visible = true;
    this._rideFit = null;
  }

  dismount() {
    const horse = this.mounted;
    if (!horse) return;
    this.mesh.parent?.remove(this.mesh);
    horse.rider = null;
    this.mounted = null;
    this._attach = null;
    this.mesh.scale.setScalar(this.scale);
    this.game.scene.add(this.mesh);
    // Descendre à gauche du cheval.
    const lx = Math.cos(horse.heading), lz = -Math.sin(horse.heading);
    this.pos.set(horse.pos.x + lx * 1.3, 0, horse.pos.z + lz * 1.3);
    this.game.colliders.resolve(this.pos, this.radius, -Infinity);
    this.heading = horse.heading;
    this.speed = 0;
    this.snap();
  }

  animateRiding(dt) {
    const h = this.mounted;
    if (!h) return;
    this.anim.t += dt;
    const a = this.anim;
    const cam = this.game.camera?.position;
    const far = cam ? Math.hypot(cam.x - h.pos.x, cam.z - h.pos.z) : 0;
    this._lod(far);
    const step = this.isPlayer ? dt : this._animStep(far, dt);
    if (!step) return;
    // Mouvement du dos du cheval au niveau de la selle : rebond vertical et tangage.
    const bone = this._attach || h.bones.body;
    bone.updateWorldMatrix(true, false);
    const e = bone.matrixWorld.elements;
    const fl = Math.hypot(e[8], e[9], e[10]) || 1;
    a.bob = e[13] - h.pos.y;
    a.pitch = -Math.asin(clamp(e[9] / fl, -1, 1));
    a.horseSpeed = h.anim.speed;
    // Phase de foulée : 0 = poser du diagonal antérieur gauche / postérieur droit au trot (horseModel actuel) ;
    // un autre cheval peut décaler sa convention avec horse.riderPostOffset.
    a.horseGaitPhase = (h.anim.phase + (h.riderPostOffset || 0) + 1) % 1;
    a.jump = h.jumpT;
    a.turn = clamp((h.lastTurn || 0) * 1.4, -1, 1);
    a.wave = this.wave;
    // Ajustement exprimé en mètres → unités du modèle (taille du cavalier).
    const f = this._fit || RIDER_FIT;
    const k = 1 / this.scale;
    const rf = this._rideFit || (this._rideFit = {});
    for (const key in f) rf[key] = key === 'kneeOut' ? f[key] : f[key] * k;
    a.fit = rf;
    animateHuman(this.bones, 'ride', a, step);
  }

  // Positions monde des poings (prise des rênes). Met à jour les matrices du squelette.
  getHandWorldPositions(outL = this.handL, outR = this.handR) {
    this.mesh.updateWorldMatrix(true, true);
    outL.copy(FIST).applyMatrix4(this.bones.lHand.matrixWorld);
    outR.copy(FIST).applyMatrix4(this.bones.rHand.matrixWorld);
    return [outL, outR];
  }

  // Point d'assise (contact avec la selle) en coordonnées monde.
  getSeatWorldPosition(out = _w) {
    this.mesh.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.mesh.matrixWorld);
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
  }
}

void _v;
