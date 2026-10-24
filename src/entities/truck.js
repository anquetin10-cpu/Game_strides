// Camion de transport de chevaux Strides (conduite arcade).
import * as THREE from 'three';
import { box, cyl, partsToGeo } from '../world/builders.js';
import { prep } from '../world/shapes.js';
import { truckTexture } from '../world/textures.js';
import { clamp, damp, wrapAngle } from '../core/math.js';
import { WORLD } from '../world/layout.js';

export class Truck {
  constructor(game, { x, z, heading = 0, livery = 'strides' } = {}) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    const W = 2.5, L = 8.6;
    const cabColor = livery === 'strides' ? '#16171a' : '#f2f1ec';
    const parts = [
      [box(W, 0.5, L - 0.4), '#1b1c1f', { y: 0.55 }],
      [box(W, 2.2, 2.3), cabColor, { y: 1.0, z: L / 2 - 1.35 }],
      [box(W - 0.1, 0.9, 1.2), '#2b3947', { y: 2.0, z: L / 2 - 0.62, rx: 0.16 }],
      [box(W, 2.9, L - 2.7), '#f2f1ec', { y: 1.0, z: -1.15 }],
      [box(W + 0.04, 0.2, L - 2.68), '#16171a', { y: 1.0, z: -1.15 }],
      [box(W - 0.4, 0.4, 0.3), '#d9d9d6', { y: 0.65, z: L / 2 - 0.2 }],
      [box(0.5, 0.25, 0.1), '#fff6d8', { x: -0.85, y: 1.2, z: L / 2 - 0.18 }],
      [box(0.5, 0.25, 0.1), '#fff6d8', { x: 0.85, y: 1.2, z: L / 2 - 0.18 }],
      [box(0.4, 0.2, 0.08), '#c8302a', { x: -0.95, y: 1.1, z: -L / 2 + 0.25 }],
      [box(0.4, 0.2, 0.08), '#c8302a', { x: 0.95, y: 1.1, z: -L / 2 + 0.25 }],
      [box(W - 0.2, 2.5, 0.1), '#e2e1dc', { y: 1.2, z: -L / 2 + 0.2 }],
    ];
    for (const zz of [L / 2 - 1.6, -1.6, -3.0]) {
      for (const xx of [-1.1, 1.1]) {
        const g = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10);
        g.rotateZ(Math.PI / 2);
        parts.push([prep(g), '#151517', { x: xx, y: 0.5, z: zz }]);
        parts.push([cyl(0.22, 0.22, 0.42, 8, false), '#9a9a9a', { x: xx, y: 0.5, z: zz, rz: Math.PI / 2 }]);
      }
    }
    const body = new THREE.Mesh(partsToGeo(parts), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);
    const tex = truckTexture();
    const sideMat = new THREE.MeshStandardMaterial({ map: tex });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L - 2.8, 2.8), sideMat);
      p.position.set(s * (W / 2 + 0.03), 2.45, -1.15);
      p.rotation.y = s * Math.PI / 2;
      this.group.add(p);
    }
    this.headMat = new THREE.MeshBasicMaterial({ color: '#fff3c8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.5, 12, 12, 1, true), this.headMat);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 1.2, L / 2 + 6);
    this.group.add(beam);
    game.scene.add(this.group);
    this.L = L;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.lateral = 0;
    this.loaded = null;
    this.driver = null;
    this.lastBump = 0;
    this.snap();
  }

  snap() {
    const t = this.game.terrain;
    const f = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
    const r = { x: Math.cos(this.heading), z: -Math.sin(this.heading) };
    const hf = t.getHeight(this.pos.x + f.x * 3, this.pos.z + f.z * 3);
    const hb = t.getHeight(this.pos.x - f.x * 3, this.pos.z - f.z * 3);
    const hl = t.getHeight(this.pos.x - r.x * 1.1, this.pos.z - r.z * 1.1);
    const hr = t.getHeight(this.pos.x + r.x * 1.1, this.pos.z + r.z * 1.1);
    this.pos.y = (hf + hb + hl + hr) / 4;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.group.rotation.x = -Math.atan2(hf - hb, 6);
    this.group.rotation.z = Math.atan2(hr - hl, 2.2) * 0.8;
  }

  setPosition(x, z, heading) {
    this.pos.x = x;
    this.pos.z = z;
    this.heading = heading;
    this.speed = 0;
    this.snap();
  }

  // ctrl : { throttle -1..1, steer -1..1 }
  update(dt, ctrl, night = 0) {
    const g = this.game;
    this.headMat.opacity = this.driver ? night * 0.25 : 0;
    if (!ctrl) ctrl = { throttle: 0, steer: 0 };
    const maxV = 23;
    if (ctrl.throttle > 0.05) {
      if (this.speed < -0.3) this.speed += 16 * dt;
      else this.speed += 6.5 * ctrl.throttle * (1 - this.speed / maxV) * dt;
    } else if (ctrl.throttle < -0.05) {
      if (this.speed > 0.3) this.speed -= 16 * dt * -ctrl.throttle;
      else this.speed = Math.max(-6, this.speed - 4 * dt);
    } else {
      this.speed *= 1 - Math.min(1, 0.7 * dt);
      if (Math.abs(this.speed) < 0.15) this.speed = 0;
    }
    const steerMax = 0.6 * (1 - 0.55 * clamp(Math.abs(this.speed) / maxV, 0, 1));
    this.steer = damp(this.steer, ctrl.steer * steerMax, 6, dt);
    this.yawRate = (this.speed * Math.tan(this.steer)) / 4.8;
    this.heading = wrapAngle(this.heading - this.yawRate * dt);
    this.lateral = Math.abs(this.speed * this.yawRate);
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const lim = WORLD.half - 8;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    // Deux cercles de collision (avant/arrière).
    let bump = 0;
    for (const off of [2.6, -2.6, 0]) {
      const cx = this.pos.x + Math.sin(this.heading) * off;
      const cz = this.pos.z + Math.cos(this.heading) * off;
      const p = { x: cx, z: cz };
      const hit = g.colliders.resolve(p, 1.45, this.pos.y + 0.4);
      if (hit) {
        this.pos.x += p.x - cx;
        this.pos.z += p.z - cz;
        bump = Math.max(bump, Math.abs(this.speed));
      }
    }
    for (const v of g.vehicles || []) {
      if (v === this) continue;
      const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z);
      if (d < 4.2) {
        const nx = (this.pos.x - v.pos.x) / (d || 1), nz = (this.pos.z - v.pos.z) / (d || 1);
        this.pos.x += nx * (4.2 - d);
        this.pos.z += nz * (4.2 - d);
        bump = Math.max(bump, Math.abs(this.speed));
      }
    }
    if (g.terrain.waterDepth(this.pos.x, this.pos.z) > 0.6) {
      this.pos.x = prevX;
      this.pos.z = prevZ;
      bump = Math.max(bump, Math.abs(this.speed));
    }
    if (bump > 2.5 && g.time - this.lastBump > 0.5) {
      this.lastBump = g.time;
      g.bus.emit('truck:bump', { truck: this, speed: bump });
      this.speed *= -0.25;
    } else if (bump > 0) this.speed *= 0.9;
    this.snap();
  }
}
