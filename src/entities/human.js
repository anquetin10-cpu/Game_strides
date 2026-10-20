// Personnage : déplacement au sol, collisions, objets portés, animation.
import * as THREE from 'three';
import { createHumanMesh, animateHuman } from './humanModel.js';
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

export class Human {
  constructor(game, outfit, opts = {}) {
    this.game = game;
    const { mesh, bones } = createHumanMesh(outfit);
    this.mesh = mesh;
    this.bones = bones;
    this.outfit = outfit;
    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.pose = 'stand';
    this.anim = { phase: Math.random(), speed: 0, t: Math.random() * 10 };
    this.radius = 0.35;
    this.carrying = null;
    this.ai = opts.ai || null;
    this.isPlayer = !!opts.player;
    this.name = opts.name || '';
    this.visibleDist = 170;
    this.mounted = null;
    game.scene.add(this.mesh);
    this.snap();
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
    // L'objet suit le buste.
    this.bones.chest.add(m);
    m.position.set(0, -0.05, 0.42);
    this.carrying = { kind, mesh: m };
  }

  drop() {
    if (this.carrying) {
      this.carrying.mesh.parent?.remove(this.carrying.mesh);
      this.carrying = null;
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
    if (g.terrain.waterDepth(this.pos.x, this.pos.z) > 1.0) {
      this.pos.x = prevX;
      this.pos.z = prevZ;
    }
    this.heading = wrapAngle(this.heading);
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
    this.anim.speed = this.speed;
    const pose = this.carrying ? 'carry' : this.pose === 'stand' || this.pose === 'walk' ? 'walk' : this.pose;
    animateHuman(this.bones, pose, this.anim, dt);
  }

  // Monter sur un cheval : le maillage devient enfant de l'os « body » du cheval.
  mount(horse) {
    this.mounted = horse;
    horse.rider = this;
    this.drop();
    horse.bones.body.add(this.mesh);
    this.mesh.position.set(0, 0.43, 0.02);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
  }

  dismount() {
    const horse = this.mounted;
    if (!horse) return;
    horse.bones.body.remove(this.mesh);
    horse.rider = null;
    this.mounted = null;
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
    animateHuman(this.bones, 'ride', { t: this.anim.t, horseSpeed: h.anim.speed, horseGaitPhase: h.anim.phase, jump: h.jumpT, wave: this.wave }, dt);
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
  }
}
