// Véhicules conduisibles autres que le camion (voitures garées, voiture et tracteur de l'écurie, voitures de la
// circulation reprises au volant) : même dynamique que le camion (moteur, boîte auto, pneus, freins) avec les
// caractéristiques de chaque véhicule, roues braquées (épure d'Ackermann) et motrices, suspension visuelle, feux,
// collisions et son moteur. Les roues et optiques des voitures sont dessinées par les effets de la circulation.
import * as THREE from 'three';
import { TruckSim, VEHICLE_SPECS } from './truckPhysics.js';
import { carGeo, carMaterial, glassMaterial, CARS, tractorGeo, tractorWheelGeo, TRACTOR_WHEELS } from '../world/props.js';
import { clamp } from '../core/math.js';
import { WORLD, nearestRoad } from '../world/layout.js';

// Encombrement du tracteur (même interface que CARS pour les collisions et les points d'accès).
const TRACTOR = { L: 5.6, W: 2.4, wb: 2.5, r: 0.82, zc: 0.6 };
let _uid = 0;

export class Vehicle {
  constructor(game, { kind = 'sedan', color = '#7a7d84', x = 0, z = 0, heading = 0 } = {}) {
    this.game = game;
    this.id = `veh${++_uid}`;
    this.kind = kind;
    this.color = color;
    this.isTractor = kind === 'tractor';
    this.spec = this.isTractor ? TRACTOR : CARS[kind] || CARS.sedan;
    this.sim = new TruckSim(VEHICLE_SPECS[kind] || VEHICLE_SPECS.sedan);
    this.pos = new THREE.Vector3(x, 0, z);
    this.sim.pos = this.pos;
    this.sim.heading = heading;
    this.driver = null;
    this.atSpot = true; // à sa place de stationnement d'origine (la circulation l'ignore : il est garé hors voie)
    this.lastBump = 0;
    this.slope = 0;
    this.groundRoll = 0;
    this.pitch = 0;
    this.roll = 0;
    this.spin = 0;
    this.spinFront = 0;
    this.steerL = this.steerR = 0;
    this.braking = false;
    this.reversing = false;
    this.lightK = 0;
    this.susp = { p: 0, pv: 0, r: 0, rv: 0 };
    // Maillages : caisse (peinture vernie) et vitrage teinté ; le tracteur porte aussi ses quatre roues.
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const geo = this.isTractor ? tractorGeo(color, { split: true }) : carGeo(color, kind, { wheels: false, split: true });
    const bm = new THREE.Mesh(geo.body, carMaterial());
    bm.castShadow = true;
    bm.receiveShadow = true;
    const gm = new THREE.Mesh(geo.glass, glassMaterial());
    gm.renderOrder = 3;
    body.add(bm, gm);
    this.wheelMeshes = [];
    if (this.isTractor) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
      const W = TRACTOR_WHEELS;
      for (const front of [true, false]) {
        for (const s of [-1, 1]) {
          const w = W[front ? 'front' : 'rear'];
          const steer = new THREE.Group();
          steer.position.set(s * w.x, w.r, w.z);
          const m = new THREE.Mesh(tractorWheelGeo(!front, s), mat);
          m.castShadow = true;
          steer.add(m);
          root.add(steer);
          this.wheelMeshes.push({ steer, spin: m, front, side: s });
        }
      }
    }
    this.mesh = root;
    this.body = body;
    root.rotation.order = 'YXZ';
    game.scene.add(root);
    // Obstacle statique (piétons, chevaux, caméra, autres véhicules), désactivé au volant.
    const S = this.spec;
    this.collider = game.colliders.addBox(x, z, S.W / 2 + 0.12, S.L / 2 + 0.1, heading, Infinity, this.id);
    this.snap();
    this._syncCollider(true);
  }

  // ---------- Interface commune avec le camion ----------
  get speed() {
    return this.sim.vx;
  }
  set speed(v) {
    this.sim.vx = v;
    if (!v) this.sim.vy = this.sim.r = 0;
  }
  get heading() {
    return this.sim.heading;
  }
  set heading(v) {
    this.sim.heading = v;
  }
  get steer() {
    return this.sim.steer;
  }
  get rpm() {
    return this.sim.rpm;
  }
  get gearLabel() {
    return this.sim.gearLabel;
  }
  get engineOn() {
    return this.sim.engineOn;
  }
  get stopped() {
    return Math.abs(this.sim.vx) < 0.08;
  }
  get parked() {
    return !this.driver && this.atSpot;
  }
  get label() {
    return VEHICLE_SPECS[this.kind]?.name || 'Voiture';
  }
  // Compte-tours : zone rouge au régime maxi.
  get redline() {
    return this.sim.spec.maxRpm;
  }
  // Recul de la caméra derrière le véhicule.
  get camDist() {
    return this.isTractor ? 8 : 6.8;
  }
  // Poste de conduite (repère de la caisse : x > 0 à gauche) : origine du personnage assis.
  get seat() {
    if (this.isTractor) return { x: 0, y: 1.25, z: -1.05 };
    const C = this.spec;
    const y0 = C.body[C.body.length - 1][1];
    const zA = C.glass[3][0] - 0.06;
    return { x: 0.36, y: y0 + 0.08 + 0.32 - 0.48, z: zA - 1.25 };
  }

  setPosition(x, z, heading) {
    this.pos.x = x;
    this.pos.z = z;
    if (heading !== undefined) this.sim.heading = heading;
    const s = this.sim;
    s.vx = s.vy = s.r = s.ax = s.ay = s.jerk = s.steer = 0;
    this.susp.p = this.susp.pv = this.susp.r = this.susp.rv = 0;
    this.snap();
    this._syncCollider(true);
  }

  // Assiette sur le terrain (hauteur aux quatre roues).
  snap() {
    const t = this.game.terrain;
    const h = this.sim.heading;
    const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const ph = this.sim.spec;
    const tw = ph.track / 2;
    const at = (zl, xl) => t.getHeight(this.pos.x + fx * zl + lx * xl, this.pos.z + fz * zl + lz * xl);
    const fl = at(ph.zFront, tw), fr = at(ph.zFront, -tw), rl = at(ph.zRear, tw), rr = at(ph.zRear, -tw);
    const front = (fl + fr) / 2, rear = (rl + rr) / 2;
    const wb = ph.zFront - ph.zRear;
    this.pos.y = rear + (front - rear) * (-ph.zRear / wb);
    const pitch = Math.atan2(front - rear, wb);
    this.slope = -pitch;
    this.groundRoll = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, ph.track);
    this.sim.slope = Math.sin(pitch);
    const m = this.mesh;
    m.position.copy(this.pos);
    m.rotation.set(this.slope, h, this.groundRoll * 0.9);
  }

  // Points d'accès : portière conducteur (gauche) ou passager.
  doorPoint(side = 1, out = new THREE.Vector3()) {
    const h = this.sim.heading;
    const S = this.spec;
    const zl = this.isTractor ? -0.8 : this.seat.z + 0.35;
    const xl = side * (S.W / 2 + 0.75);
    out.x = this.pos.x + Math.sin(h) * zl + Math.cos(h) * xl;
    out.y = this.pos.y;
    out.z = this.pos.z + Math.cos(h) * zl - Math.sin(h) * xl;
    return out;
  }
  localToWorld(x, y, z, out = new THREE.Vector3()) {
    this.body.updateWorldMatrix(true, false);
    return this.body.localToWorld(out.set(x, y, z));
  }
  toLocal(px, pz) {
    const h = this.sim.heading;
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    return { x: dx * Math.cos(h) - dz * Math.sin(h), z: dx * Math.sin(h) + dz * Math.cos(h) };
  }

  startEngine() {
    if (this.sim.engineOn) return;
    this.sim.engineOn = true;
    this.sim.rpm = this.sim.spec.idle * 0.6;
    this.sim.gear = this.sim.spec.startGear;
    this.game.audio?.engineStart?.(this.isTractor ? 'diesel' : this.sim.spec.fuel);
  }
  stopEngine() {
    this.sim.engineOn = false;
  }

  _syncCollider(force = false) {
    const c = this.collider;
    const cs = this.game.colliders;
    c.enabled = !this.driver;
    c.top = this.pos.y + (this.isTractor ? 3 : 1.6);
    const h = this.sim.heading;
    const zc0 = this.spec.zc || 0;
    if (!force && Math.abs(c.x - this.pos.x - Math.sin(h) * zc0) < 0.05 && Math.abs(c.z - this.pos.z - Math.cos(h) * zc0) < 0.05 && Math.abs(c.rot - h) < 0.005) return;
    const cells = (fn) => cs._cells(c.x - c.bound, c.z - c.bound, c.x + c.bound, c.z + c.bound, fn);
    cells((k) => {
      const l = cs.grid.get(k);
      const i = l ? l.indexOf(c) : -1;
      if (i >= 0) l.splice(i, 1);
    });
    const zc = this.spec.zc || 0; // centre de l'encombrement (le godet du tracteur dépasse à l'avant)
    c.x = this.pos.x + Math.sin(h) * zc;
    c.z = this.pos.z + Math.cos(h) * zc;
    c.rot = h;
    c.c = Math.cos(h);
    c.s = Math.sin(h);
    cells((k) => {
      if (!cs.grid.has(k)) cs.grid.set(k, []);
      cs.grid.get(k).push(c);
    });
  }

  // ctrl : { throttle -1..1, steer -1..1 } au volant ; null = personne au volant.
  update(dt, ctrl, night = 0, camPos = null) {
    const g = this.game;
    const s = this.sim;
    const driving = !!this.driver && !!ctrl;
    const far = camPos ? Math.hypot(camPos.x - this.pos.x, camPos.z - this.pos.z) : 0;
    this.mesh.visible = far < (this.isTractor ? 320 : 260);
    const moving = Math.abs(s.vx) > 0.05 || driving;
    if (!moving && !this._wasMoving) {
      // À l'arrêt, sans conducteur : rien à simuler (régime qui retombe, feux éteints).
      if (s.engineOn || s.rpm > 0) {
        s.rpm = s.engineOn ? s.idle : Math.max(0, s.rpm - dt * 1500);
        this._engineSound(far);
      }
      this.lightK = 0;
      this.braking = this.reversing = false;
      return;
    }
    if (driving) this.atSpot = false;
    // Adhérence selon le revêtement (route / herbe, terre), échantillonnée à 4 Hz.
    this._surfT = (this._surfT || 0) - dt;
    if (this._surfT <= 0) {
      this._surfT = 0.25;
      this._soft = nearestRoad(this.pos.x, this.pos.z).d < 0.5 ? 0 : 1;
    }
    s.soft += ((this._soft || 0) - s.soft) * Math.min(1, dt * 3);
    const prevX = this.pos.x, prevZ = this.pos.z, prevH = s.heading;
    s.step(dt, driving ? ctrl : { throttle: 0, steer: 0, park: !this.driver });
    this._wasMoving = moving;
    if (driving && s.shifted && g.audio?.gearShift) g.audio.gearShift(s.shifted === 2 ? 2 : 0);
    const lim = WORLD.half - 8;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    // Collisions : cercles le long de l'axe contre le décor, boîtes des autres véhicules.
    const S = this.spec;
    let bump = 0;
    if (Math.abs(s.vx) > 0.01) {
      const h = s.heading;
      const fx = Math.sin(h), fz = Math.cos(h);
      const zc = S.zc || 0;
      const half = S.L / 2 - S.W / 2;
      const p = { x: 0, z: 0 };
      for (const off of [-half, 0, half]) {
        const cx = this.pos.x + fx * (off + zc), cz = this.pos.z + fz * (off + zc);
        p.x = cx;
        p.z = cz;
        const hit = g.colliders.resolve(p, S.W / 2, this.pos.y + 0.4, this.id);
        if (hit) {
          this.pos.x += p.x - cx;
          this.pos.z += p.z - cz;
          const into = -(fx * hit.nx + fz * hit.nz) * Math.sign(s.vx);
          bump = Math.max(bump, Math.abs(s.vx) * clamp(into, 0.2, 1));
        }
      }
      for (const v of g.vehicles) {
        if (v === this || v.proxy || !v.pos) continue;
        const l = this.toLocal(v.pos.x, v.pos.z);
        if (Math.abs(l.x) < S.W / 2 + 0.85 && Math.abs(l.z) < S.L / 2 + 1.6) {
          const pushX = (S.W / 2 + 0.85 - Math.abs(l.x)) * Math.sign(l.x || 1);
          const pushZ = (S.L / 2 + 1.6 - Math.abs(l.z)) * Math.sign(l.z || 1);
          const lx = Math.cos(h), lz = -Math.sin(h);
          if (Math.abs(pushX) < Math.abs(pushZ)) {
            this.pos.x -= lx * pushX;
            this.pos.z -= lz * pushX;
          } else {
            this.pos.x -= fx * pushZ;
            this.pos.z -= fz * pushZ;
          }
          bump = Math.max(bump, Math.abs(s.vx));
        }
      }
      // Eau trop profonde : refusée (le tracteur passe un peu plus d'eau).
      const deep = g.terrain.waterDepth(this.pos.x, this.pos.z);
      if (deep > (this.isTractor ? 0.8 : 0.35) && deep > g.terrain.waterDepth(prevX, prevZ)) {
        this.pos.x = prevX;
        this.pos.z = prevZ;
        s.heading = prevH;
        bump = Math.max(bump, Math.abs(s.vx));
      }
    }
    if (bump > 2.5 && g.time - this.lastBump > 0.5) {
      this.lastBump = g.time;
      g.bus.emit('vehicle:bump', { vehicle: this, speed: bump });
      s.impact(-0.25);
      g.audio?.thud?.();
    } else if (bump > 0) s.vx *= 0.9;
    this.snap();
    // Suspension : tangage au freinage et à l'accélération, roulis en virage (voiture plus souple que le camion).
    const sp = this.susp;
    const w2 = this.isTractor ? 60 : 110, c = 2 * 0.35 * Math.sqrt(w2);
    const k = this.isTractor ? 0.006 : 0.0075;
    sp.pv += (-w2 * (sp.p - clamp(s.ax, -10, 5) * k) - c * sp.pv) * dt;
    sp.p += sp.pv * dt;
    sp.rv += (-w2 * (sp.r - clamp(s.ay, -9, 9) * k * 1.4) - c * sp.rv) * dt;
    sp.r += sp.rv * dt;
    const vib = Math.min(1, Math.abs(s.vx) / 15) * (0.0006 + s.soft * (this.isTractor ? 0.004 : 0.0025));
    const t = g.time;
    this.pitch = -sp.p + Math.sin(t * 19.1) * vib;
    this.roll = sp.r + Math.sin(t * 15.3 + 1.1) * vib;
    this.body.rotation.set(this.pitch, 0, this.roll, 'YXZ');
    // Roues : rotation (le train avant du tracteur, plus petit, tourne plus vite) et braquage.
    this.spin = s.wheelSpin;
    const [al, ar] = s.ackermann();
    this.steerL = al;
    this.steerR = ar;
    if (this.isTractor) {
      this.spinFront += (s.vx / TRACTOR_WHEELS.front.r) * dt;
      for (const w of this.wheelMeshes) {
        w.spin.rotation.x = w.front ? this.spinFront : this.spin;
        if (w.front) w.steer.rotation.y = w.side > 0 ? al : ar;
      }
    }
    this.braking = s.brake > 0.05 && !!this.driver && s.engineOn;
    this.reversing = s.engineOn && s.gear < 0;
    this.lightK = s.engineOn && night > 0.25 ? 1 : 0;
    this._syncCollider();
    this._engineSound(far);
  }

  _engineSound(far) {
    const g = this.game;
    if (!g.audio?.vehicleEngine) return;
    // Un seul moteur de voiture synthétisé : celui qu'on conduit (ou le plus proche moteur tournant).
    if (!this.driver && g.player?.vehicle && g.player.vehicle !== this && g.player.mode === 'drive') return;
    const s = this.sim;
    g.audio.vehicleEngine('car', {
      on: s.engineOn, rpm: s.rpm, load: s.load, speed: Math.abs(s.vx), dist: far, inside: !!this.driver, reverse: false, brake: s.braking,
      fuel: s.spec.fuel, cyl: s.spec.cyl, idle: s.spec.idle, tractor: this.isTractor,
    });
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    this.collider.enabled = false;
  }
}
