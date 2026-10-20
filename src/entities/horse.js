// Cheval : physique (allures, endurance, saut, collisions) + comportements IA.
import * as THREE from 'three';
import { createHorseMesh, animateHorse, gaitIndex } from './horseModel.js';
import { HORSE } from '../config.js';
import { angleDiff, clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import { WORLD } from '../world/layout.js';

const SPEEDS = HORSE.gaits.map((g) => g.speed);

export class Horse {
  constructor(game, def, opts = {}) {
    this.game = game;
    this.def = def;
    this.id = def.id || opts.id || 'horse';
    this.name = def.name || 'Cheval';
    const { mesh, bones } = createHorseMesh({ coat: def.coat, blaze: def.blaze, socks: def.socks, saddle: opts.saddle !== false, pad: opts.pad, padTrim: opts.padTrim });
    this.mesh = mesh;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.scale.setScalar(0.94);
    this.bones = bones;
    this.anim = { speed: 0, phase: Math.random(), jump: -1, turn: 0, graze: 0, rear: 0, t: Math.random() * 10, headYaw: 0 };
    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.stamina = 100;
    this.exhausted = false;
    this.jumpT = -1;
    this.jumpY = 0;
    this.jumpPeak = 0;
    this.groundY = 0;
    this.control = { x: 0, z: 0, mag: 0, gallop: false, jump: false };
    this.rider = null;
    this.ai = opts.ai || null;
    this.radius = 0.85;
    this.lame = false; // fer perdu
    this.frozen = false;
    this.isPlayerHorse = !!opts.player;
    this.mods = { speed: 0, jump: 0, stamina: 0, clearance: 0 };
    this.lastBump = 0;
    this.lastTurn = 0;
    this.visibleDist = 260;
    game.scene.add(this.mesh);
    this.snapToGround();
  }

  get maxStamina() {
    return HORSE.stamina * (this.def.stamina || 1) * (1 + this.mods.stamina);
  }
  get speedMul() {
    return (this.def.speed || 1) * (1 + this.mods.speed) * (this.lame ? 0.45 : 1);
  }
  get jumpPower() {
    return HORSE.jumpPeak * (this.def.jump || 1) * (1 + this.mods.jump);
  }
  get gait() {
    return gaitIndex(this.speed / Math.max(0.5, this.speedMul));
  }
  get feetY() {
    return this.groundY + this.jumpY + (this.jumpT >= 0 ? 0.2 + this.mods.clearance : 0);
  }
  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  setPosition(x, z, heading = this.heading) {
    this.pos.x = x;
    this.pos.z = z;
    this.heading = heading;
    this.speed = 0;
    this.jumpT = -1;
    this.jumpY = 0;
    this.snapToGround();
  }

  snapToGround() {
    this.groundY = this.game.terrain.getHeight(this.pos.x, this.pos.z);
    this.pos.y = this.groundY;
    this.mesh.position.set(this.pos.x, this.groundY, this.pos.z);
    this.mesh.rotation.y = this.heading;
  }

  startJump() {
    if (this.jumpT >= 0 || this.speed < HORSE.minJumpSpeed) return false;
    const k = 0.72 + 0.28 * smoothstep(4, 8.5, this.speed);
    this.jumpPeak = this.jumpPower * k;
    this.jumpT = 0;
    this.game.bus.emit('horse:jump', this);
    return true;
  }

  // Hauteur du saut à l'instant τ (0..1).
  static jumpHeightAt(peak, tau) {
    return 4 * peak * tau * (1 - tau);
  }

  refuse() {
    this.speed = 0;
    this.anim.rear = 1;
    this._rearT = 1.1;
    this.jumpT = -1;
    this.jumpY = 0;
    this.game.bus.emit('horse:refuse', this);
  }

  update(dt, camPos) {
    const g = this.game;
    this.anim.t += dt;
    if (this.ai && !(this.rider && this.rider.isPlayer)) this.ai.update(this, dt);
    const c = this.control;
    const prevX = this.pos.x, prevZ = this.pos.z;

    if (this._rearT > 0) {
      this._rearT -= dt;
      this.anim.rear = Math.max(0, Math.sin(Math.min(1, this._rearT / 1.1) * Math.PI));
    } else this.anim.rear = 0;

    let desired = 0;
    let turnInput = 0;
    if (!this.frozen && c.mag > 0.12 && !(this._rearT > 0)) {
      const desiredHeading = Math.atan2(c.x, c.z);
      const diff = angleDiff(this.heading, desiredHeading);
      let gi = c.mag < 0.42 ? 1 : c.mag < 0.82 ? 2 : 3;
      if (c.gaitOverride) gi = c.gaitOverride;
      if (c.gallop && gi >= 2 && !this.exhausted) gi = 4;
      desired = SPEEDS[gi] * this.speedMul;
      if (c.speedOverride !== undefined) desired = c.speedOverride;
      const sp01 = clamp(this.speed / 16, 0, 1);
      const rate = lerp(2.8, 1.45, sp01) * (this.jumpT >= 0 ? 0.25 : 1);
      if (Math.abs(diff) > 2.3 && this.speed < 3) {
        // Demi-tour sur les hanches.
        desired = Math.min(desired, 1.2);
      }
      const step = clamp(diff, -rate * dt, rate * dt);
      this.heading = wrapAngle(this.heading + step);
      turnInput = step / Math.max(dt, 1e-4);
      desired *= 1 - smoothstep(1.3, 2.7, Math.abs(diff)) * 0.75;
    }
    this.lastTurn = damp(this.lastTurn, turnInput, 8, dt);

    // Eau : ralentit, et bloque au-delà d'une certaine profondeur.
    const depth = g.terrain.waterDepth(this.pos.x, this.pos.z);
    if (depth > 0.15) desired = Math.min(desired, lerp(9, 3.5, clamp(depth / 1.1, 0, 1)));

    // Pente.
    const fw = this.forward;
    const hf = g.terrain.getHeight(this.pos.x + fw.x * 1.1, this.pos.z + fw.z * 1.1);
    const hb = g.terrain.getHeight(this.pos.x - fw.x * 1.1, this.pos.z - fw.z * 1.1);
    const slope = (hf - hb) / 2.2;
    if (slope > 0.25) desired *= clamp(1 - (slope - 0.25) * 1.2, 0.35, 1);

    if (this.jumpT < 0) {
      const acc = desired > this.speed ? (this.speed < 5 ? 4.5 : 3.6) : 9;
      this.speed = this.speed + clamp(desired - this.speed, -acc * dt, acc * dt);
    }

    // Endurance (grand galop).
    const galloping = this.speed > SPEEDS[3] * this.speedMul + 0.6;
    if (galloping) {
      this.stamina -= HORSE.gallopDrain * dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        g.bus.emit('horse:exhausted', this);
      }
    } else {
      const regen = HORSE.staminaRegen * (this.speed < 5 ? 1.5 : 1.0);
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
      if (this.exhausted && this.stamina > this.maxStamina * 0.35) this.exhausted = false;
    }

    // Saut.
    if (c.jump) {
      c.jump = false;
      if (this.jumpT < 0 && !this.frozen) {
        if (!this.startJump() && this.isPlayerHorse && this.speed < HORSE.minJumpSpeed) g.bus.emit('horse:tooSlow', this);
      }
    }
    if (this.jumpT >= 0) {
      this.jumpT += dt / HORSE.jumpDuration;
      if (this.jumpT >= 1) {
        this.jumpT = -1;
        this.jumpY = 0;
        this.speed *= 0.94;
        g.bus.emit('horse:land', this);
      } else this.jumpY = Horse.jumpHeightAt(this.jumpPeak, this.jumpT);
    }

    // Déplacement.
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const lim = WORLD.half - 6;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    // Collision : centre un peu vers l'avant (le cheval est long).
    const cx = this.pos.x + fw.x * 0.45, cz = this.pos.z + fw.z * 0.45;
    const probe = { x: cx, z: cz };
    const groundNow = g.terrain.getHeight(this.pos.x, this.pos.z);
    const hit = g.colliders.resolve(probe, this.radius, groundNow + this.jumpY + (this.jumpT >= 0 ? 0.2 + this.mods.clearance : 0));
    if (hit) {
      this.pos.x += probe.x - cx;
      this.pos.z += probe.z - cz;
      const into = -(fw.x * hit.nx + fw.z * hit.nz);
      if (into > 0.5 && this.speed > 5 && g.time - this.lastBump > 0.6) {
        this.lastBump = g.time;
        g.bus.emit('horse:bump', { horse: this, speed: this.speed, col: hit.col });
      }
      this.speed *= 1 - clamp(into, 0, 1) * Math.min(1, dt * 12);
    }
    if (g.course) g.course.constrain?.(this, prevX, prevZ);
    if (g.terrain.waterDepth(this.pos.x, this.pos.z) > 1.35) {
      this.pos.x = prevX;
      this.pos.z = prevZ;
      this.speed *= 0.5;
    }

    this.groundY = g.terrain.getHeight(this.pos.x, this.pos.z);
    this.pos.y = this.groundY + this.jumpY;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.x = -Math.atan(slope) * 0.85;

    // Animation (désactivée au loin pour économiser).
    const far = camPos ? Math.hypot(camPos.x - this.pos.x, camPos.z - this.pos.z) : 0;
    this.mesh.visible = far < this.visibleDist;
    const animSpeed = this.speed / Math.max(0.6, this.speedMul);
    this.anim.speed = animSpeed;
    this.anim.jump = this.jumpT;
    this.anim.turn = this.lastTurn;
    if (this.mesh.visible && (far < 120 || ((this._skip = (this._skip || 0) + 1) & 1))) {
      const r = animateHorse(this.bones, this.anim, far < 120 ? dt : dt * 2);
      if (r.footfalls && (this.isPlayerHorse || far < 45)) g.bus.emit('horse:step', { horse: this, n: r.footfalls, depth });
    }
    this.speedNow = this.speed;
    this.distance = (this.distance || 0) + Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}

// ---------- Comportements IA ----------
const steer = (horse, tx, tz, mag, gallop = false) => {
  const dx = tx - horse.pos.x;
  const dz = tz - horse.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  horse.control.x = dx / d;
  horse.control.z = dz / d;
  horse.control.mag = mag;
  horse.control.gallop = gallop;
  horse.control.speedOverride = undefined;
  return d;
};

// Broute et se promène dans un enclos rectangulaire.
export class GrazeAI {
  constructor(area) {
    this.area = area;
    this.timer = Math.random() * 6;
    this.target = null;
  }
  update(h, dt) {
    this.timer -= dt;
    if (this.target) {
      const d = steer(h, this.target.x, this.target.z, 0.3);
      h.anim.graze = damp(h.anim.graze, 0, 4, dt);
      if (d < 1.5 || this.timer < 0) {
        this.target = null;
        this.timer = 5 + Math.random() * 10;
      }
    } else {
      h.control.mag = 0;
      h.anim.graze = damp(h.anim.graze, 1, 1.5, dt);
      if (this.timer < 0) {
        const a = this.area;
        this.target = { x: a.x + (Math.random() - 0.5) * (a.w - 6), z: a.z + (Math.random() - 0.5) * (a.d - 6) };
        this.timer = 12;
      }
    }
  }
}

// Suit un point / une entité (sifflet, longe), avec contournement simple des obstacles.
export class FollowAI {
  constructor(getTarget, { stopDist = 3, run = true } = {}) {
    this.getTarget = getTarget;
    this.stopDist = stopDist;
    this.run = run;
    this.done = false;
    this.best = Infinity;
    this.stuckT = 0;
    this.detour = 0;
    this.detourDir = 1;
  }
  update(h, dt) {
    h.anim.graze = damp(h.anim.graze, 0, 5, dt);
    const t = this.getTarget();
    if (!t) return;
    const d = Math.hypot(t.x - h.pos.x, t.z - h.pos.z);
    if (d < this.stopDist) {
      h.control.mag = 0;
      this.done = true;
      this.best = d;
      return;
    }
    this.done = false;
    // Pas de progrès depuis un moment : contourner par le côté.
    if (d < this.best - 0.5) {
      this.best = d;
      this.stuckT = 0;
    } else this.stuckT += dt;
    if (this.stuckT > 1.2 && this.detour <= 0) {
      this.detour = 1.6;
      this.detourDir = Math.random() < 0.5 ? -1 : 1;
      this.stuckT = 0;
      this.best = d;
    }
    const mag = d > 25 && this.run ? 0.95 : d > 8 ? 0.7 : 0.35;
    if (this.detour > 0) {
      this.detour -= dt;
      const dx = (t.x - h.pos.x) / d, dz = (t.z - h.pos.z) / d;
      const px = -dz * this.detourDir, pz = dx * this.detourDir;
      steer(h, h.pos.x + (px * 0.9 + dx * 0.3) * 10, h.pos.z + (pz * 0.9 + dz * 0.3) * 10, Math.max(mag, 0.6));
      return;
    }
    steer(h, t.x, t.z, mag, d > 60 && this.run);
  }
}

// Fuit le joueur (cheval échappé).
export class FleeAI {
  constructor(getThreat, bounds) {
    this.getThreat = getThreat;
    this.bounds = bounds;
    this.wander = Math.random() * 6;
    this.tired = 0;
    this.caught = false;
  }
  update(h, dt) {
    h.anim.graze = damp(h.anim.graze, 0, 5, dt);
    const t = this.getThreat();
    if (!t || this.caught) {
      h.control.mag = 0;
      return;
    }
    const dx = h.pos.x - t.x, dz = h.pos.z - t.z;
    const d = Math.hypot(dx, dz) || 1;
    this.wander += dt * 0.8;
    let ax = dx / d + Math.sin(this.wander) * 0.6;
    let az = dz / d + Math.cos(this.wander * 0.7) * 0.6;
    // Rester dans la zone : ramener vers le centre près des bords.
    const b = this.bounds;
    const ex = (h.pos.x - b.x) / (b.w / 2), ez = (h.pos.z - b.z) / (b.d / 2);
    if (Math.abs(ex) > 0.7) ax -= Math.sign(ex) * (Math.abs(ex) - 0.7) * 6;
    if (Math.abs(ez) > 0.7) az -= Math.sign(ez) * (Math.abs(ez) - 0.7) * 6;
    // Éviter la mer.
    if (h.game.terrain.waterDepth(h.pos.x + ax * 8, h.pos.z + az * 8) > 0.2) az += 3;
    const l = Math.hypot(ax, az) || 1;
    if (d < 45) {
      this.tired += dt;
      const sp = this.tired > 25 ? 7.5 : this.tired > 14 ? 10 : 12.5;
      h.control.x = ax / l;
      h.control.z = az / l;
      h.control.mag = 1;
      h.control.speedOverride = sp;
    } else {
      h.control.speedOverride = 1.8;
      h.control.mag = d < 70 ? 0.3 : 0;
      this.tired = Math.max(0, this.tired - dt * 2);
    }
  }
}

// Suit un tracé (balade, course, échauffement).
export class PathAI {
  constructor(points, { loop = true, speed = 9, jitter = 0, lookahead = 6, onLap = null } = {}) {
    this.points = points;
    this.i = 0;
    this.loop = loop;
    this.speed = speed;
    this.jitter = jitter;
    this.lookahead = lookahead;
    this.onLap = onLap;
    this.laps = 0;
    this.finished = false;
    this.offset = (Math.random() - 0.5) * jitter;
  }
  update(h, dt) {
    if (this.finished) {
      h.control.mag = 0;
      h.control.speedOverride = 0;
      return;
    }
    let p = this.points[this.i];
    const d = Math.hypot(p[0] - h.pos.x, p[1] - h.pos.z);
    if (d < this.lookahead) {
      this.i++;
      if (this.i >= this.points.length) {
        if (this.loop) {
          this.i = 0;
          this.laps++;
          this.onLap?.(this.laps, h);
        } else {
          this.finished = true;
          this.i = this.points.length - 1;
        }
      }
      p = this.points[this.i];
    }
    steer(h, p[0], p[1], 1);
    h.control.speedOverride = typeof this.speed === 'function' ? this.speed(h, this) : this.speed;
    h.anim.graze = 0;
  }
}
