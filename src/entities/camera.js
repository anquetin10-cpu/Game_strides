// Caméra 3e personne : orbite au doigt, recentrage automatique derrière le cheval, anti-collision.
import * as THREE from 'three';
import { angleDiff, clamp, damp, lerp } from '../core/math.js';
import { TIDE_UNIFORMS } from '../world/weather.js';

export class FollowCamera {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 6;
    this.targetDist = 6;
    this.height = 1.6;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.sens = 1;
    this.fov = 60;
    this.shake = 0;
    this.override = null; // { pos, look, t } pour les plans cinématiques
    this.lastManual = -10;
    this.swing = 0; // sens (±1) d'un grand recentrage en cours, 0 sinon
  }

  snap(pos, heading) {
    this.smoothTarget.copy(pos);
    this.yaw = heading + Math.PI;
    this.update(0.016, { pos, heading, speed: 0, mode: 'foot' }, { dx: 0, dy: 0 }, true);
  }

  update(dt, focus, look, instant = false) {
    const cam = this.camera;
    if (this.override) {
      const o = this.override;
      cam.position.lerp(o.pos, instant ? 1 : 1 - Math.exp(-3 * dt));
      cam.lookAt(o.look);
      return;
    }
    const mode = focus.mode;
    const now = this.game.time;
    if (look.dx || look.dy) {
      this.yaw -= look.dx * 0.0062 * this.sens;
      this.pitch = clamp(this.pitch + look.dy * 0.0045 * this.sens, -0.12, 1.15);
      this.lastManual = now;
    }
    // Recentrage derrière le sujet quand il avance.
    const idle = now - this.lastManual;
    if (focus.speed > 1.2 && idle > 1.4) {
      const k = mode === 'drive' ? 2.4 : 1.4 + Math.min(focus.speed / 10, 1.6);
      // Grand recentrage (> ~70°, demi-tour au pied du camion…) : on tourne du côté où la perche est dégagée plutôt
      // que par le plus court chemin, qui peut balayer la caisse (perche écrasée, vue plongeante sur le toit), et on
      // garde ce sens jusqu'au bout.
      let d = angleDiff(this.yaw, focus.heading + Math.PI);
      if (Math.abs(d) > 1.2) {
        const s = Math.sign(d);
        if (!this.swing) this.swing = this._boomFree(s) || !this._boomFree(-s) ? s : -s;
        if (s !== this.swing) d -= s * 2 * Math.PI;
      } else this.swing = 0;
      this.yaw += d * (1 - Math.exp(-k * dt));
      this.pitch = damp(this.pitch, mode === 'drive' ? 0.24 : 0.28, 1.2, dt);
    } else this.swing = 0;
    const base = mode === 'drive' ? 11 : mode === 'ride' ? 6.6 : 4.6;
    this.targetDist = base + (mode === 'ride' ? Math.min(focus.speed, 16) * 0.09 : 0) + (mode === 'drive' ? Math.abs(focus.speed) * 0.08 : 0);
    this.height = mode === 'drive' ? 2.8 : mode === 'ride' ? 2.35 : 1.55;
    this.smoothTarget.x = instant ? focus.pos.x : damp(this.smoothTarget.x, focus.pos.x, 18, dt);
    this.smoothTarget.z = instant ? focus.pos.z : damp(this.smoothTarget.z, focus.pos.z, 18, dt);
    this.smoothTarget.y = instant ? focus.pos.y : damp(this.smoothTarget.y, focus.pos.y, 10, dt);
    const tx = this.smoothTarget.x, ty = this.smoothTarget.y + this.height, tz = this.smoothTarget.z;
    this.target.set(tx, ty, tz);

    // Anti-collision bâtiments : rapprocher la caméra si elle passe dans un mur. La perche est sondée tous les 0,4 m
    // (bout compris) à la hauteur réelle de la caméra (relevée au-dessus d'un véhicule), contre les obstacles gonflés
    // d'une marge et les débords de toit : elle s'arrête juste devant, jamais dans un auvent ni dans un tronc.
    let dist = this.targetDist;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirx = Math.sin(this.yaw) * cp, diry = sp, dirz = Math.cos(this.yaw) * cp;
    const cs = this.game.colliders;
    for (let d = 1.2, last = false; !last; d += 0.4) {
      if (d >= this.targetDist) {
        d = this.targetDist;
        last = true;
      }
      const x = tx + dirx * d, z = tz + dirz * d;
      let y = ty + diry * d;
      const vt = cs.volumeTopAt(x, z, y - 0.3);
      if (vt > -Infinity) y = Math.max(y, vt + 0.7);
      if (cs.cameraBlocked(x, z, y)) {
        dist = Math.max(1.2, d - 0.45);
        break;
      }
    }
    this.dist = instant ? dist : dist < this.dist ? damp(this.dist, dist, 14, dt) : damp(this.dist, dist, 3, dt);
    let cx = tx + dirx * this.dist;
    let cy = ty + diry * this.dist;
    let cz = tz + dirz * this.dist;
    const ground = this.game.terrain.getHeight(cx, cz) + 0.6;
    if (cy < ground) cy = ground;
    // Collé à un véhicule (camion à la rampe…) : la caméra s'élève au-dessus de la caisse au lieu de la traverser.
    const vt = this.game.colliders.volumeTopAt(cx, cz, cy - 0.3);
    const lift = vt > -Infinity ? Math.max(0, vt + 0.7 - cy) : 0;
    this.lift = instant ? lift : damp(this.lift || 0, lift, lift > (this.lift || 0) ? 12 : 3, dt);
    cy += this.lift;
    // Au-dessus de la mer : marge fixe au-dessus du niveau de la marée (crêtes des vagues comprises).
    if (this.game.terrain.waterDepth(cx, cz) > 0) cy = Math.max(cy, TIDE_UNIFORMS.tdLevel.value + 0.8);
    // Tremblement au grand galop.
    const shake = this.shake + (mode === 'ride' && focus.speed > 12 ? (focus.speed - 12) * 0.006 : 0);
    if (shake > 0) {
      cy += Math.sin(now * 31) * shake;
      cx += Math.sin(now * 23) * shake * 0.5;
    }
    this.shake = Math.max(0, this.shake - dt * 2);
    cam.position.set(cx, cy, cz);
    cam.lookAt(tx, ty + (mode === 'ride' ? 0.1 : 0), tz);
    const fovTarget = 60 + (mode === 'ride' ? clamp((focus.speed - 8) * 0.9, 0, 9) : mode === 'drive' ? clamp(Math.abs(focus.speed) * 0.3, 0, 7) : 0);
    this.fov = damp(this.fov, fovTarget, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  // Perche dégagée si l'on tourne du côté s : points à 25-100 % de la distance cible, à 0,6 et 1,2 rad du lacet
  // actuel, ni dans un obstacle haut ni sous le gabarit d'un véhicule.
  _boomFree(s) {
    const c = this.game.colliders;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const tx = this.smoothTarget.x, ty = this.smoothTarget.y + this.height, tz = this.smoothTarget.z;
    for (let j = 1; j <= 2; j++) {
      const a = this.yaw + s * 0.6 * j;
      const ax = Math.sin(a) * cp, az = Math.cos(a) * cp;
      for (let i = 1; i <= 4; i++) {
        const d = (this.targetDist * i) / 4;
        const x = tx + ax * d, y = ty + sp * d, z = tz + az * d;
        if (c.blocked(x, z, y - 0.5) || c.volumeTopAt(x, z, y - 0.3) > -Infinity) return false;
      }
    }
    return true;
  }

  // Direction monde correspondant au joystick (y = vers l'avant de la caméra).
  worldDir(mx, my) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    return { x: fx * my + rx * mx, z: fz * my + rz * mx };
  }
}

export { lerp };
