// Camion porte-chevaux STRIDES : modèle détaillé, dynamique de porteur 7,5 t (moteur, boîte auto, pneus),
// suspension visuelle, pont arrière et portillons animés, bat-flanc, porte de service, feux, sons et collisions.
import * as THREE from 'three';
import { buildTruckModel, TRUCK_DIM, LIGHT } from './truckModel.js';
import { TruckSim } from './truckPhysics.js';
import { clamp, smoothstep } from '../core/math.js';
import { WORLD, nearestRoad } from '../world/layout.js';

const IS_TOUCH = typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
const D = TRUCK_DIM;
const ease = (t) => t * t * (3 - 2 * t);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
// Cercles de collision le long de l'axe du camion (repère local).
const PROBES = [-3.4, -1.7, 0, 1.7, 3.4];

// Couleurs d'émission des feux (sRGB) et intensités relatives.
const LC = {
  head: [255, 248, 232], drl: [255, 255, 255], tail: [255, 24, 12], brake: [255, 18, 10], rev: [255, 255, 255],
  ind: [255, 132, 0], side: [255, 120, 0], interior: [255, 236, 205], plate: [255, 250, 240], clearF: [255, 252, 245], clearR: [255, 24, 12], dash: [120, 200, 255],
};

function gradientTexture(radial) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = radial ? x.createRadialGradient(64, 64, 2, 64, 64, 64) : x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(radial ? 0.35 : 0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Truck {
  constructor(game, { x, z, heading = 0, livery = 'strides' } = {}) {
    this.game = game;
    this.livery = livery;
    const M = buildTruckModel({ textureScale: IS_TOUCH ? 0.5 : 1 });
    this.model = M;
    this.group = M.root;
    this.body = M.body;
    game.scene.add(this.group);
    this.L = D.L;
    this.sim = new TruckSim();
    this.pos = new THREE.Vector3(x, 0, z);
    this.sim.pos = this.pos;
    this.sim.heading = heading;
    this.lateral = 0;
    this.yawRate = 0;
    this.loaded = null;
    this.driver = null;
    this.lastBump = 0;
    this.horsesAboard = 0;
    // Pièces animées : t (0..1) va vers target.
    this.ramp = { t: 0, target: 0, angle: Math.PI / 2 + 0.41, moving: false };
    this.gates = { t: 0, target: 0 };
    this.partition = { t: 0, target: 0 };
    this.door = { t: 0, target: 0 };
    this.hazard = false;
    this.interiorLight = false;
    this.lightsOn = false;
    this.susp = { p: 0, pv: 0, r: 0, rv: 0 };
    this.passThrough = new Set(); // entités ignorées par les collisions (montée du pont, chargement)
    this._light = new Uint8Array(64);
    this._wasMoving = false;
    this._blink = 0;
    this._buildBeams();
    // Obstacle statique pour piétons, chevaux et caméra (désactivé au volant).
    const c = game.colliders;
    this.collider = c.addBox(x, z, D.W / 2, D.L / 2, heading, Infinity, 'truck');
    // Repère d'encombrement pour la circulation : les voitures ne surveillent qu'un point par véhicule ;
    // ce second point (la cabine) les fait freiner quand le camion s'engage. Hors carte sans conducteur.
    this.nose = { pos: new THREE.Vector3(1e6, 0, 1e6), heading, speed: 0, proxy: true };
    game.vehicles?.push(this.nose);
    this.snap();
  }

  // ---------- API compatible (vitesse, cap) ----------
  get speed() {
    return this.sim.vx;
  }
  set speed(v) {
    this.sim.vx = v;
    if (!v) {
      this.sim.vy = 0;
      this.sim.r = 0;
    }
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
  get rampOpen() {
    return this.ramp.target === 1 && this.ramp.t >= 1;
  }
  get rampClosed() {
    return this.ramp.target === 0 && this.ramp.t <= 0;
  }

  setHorses(n) {
    this.horsesAboard = n;
    this.sim.horses = n;
  }

  // ---------- Placement ----------
  setPosition(x, z, heading) {
    this.pos.x = x;
    this.pos.z = z;
    if (heading !== undefined) this.sim.heading = heading;
    const s = this.sim;
    s.vx = s.vy = s.r = 0;
    s.ax = s.ay = s.jerk = 0;
    s.steer = 0;
    this.susp.p = this.susp.pv = this.susp.r = this.susp.rv = 0;
    this.snap();
    this._syncCollider(true);
  }

  // Assiette du châssis sur le terrain (4 roues), transformation du groupe.
  snap() {
    const t = this.game.terrain;
    const h = this.sim.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const lx = Math.cos(h), lz = -Math.sin(h);
    const px = this.pos.x, pz = this.pos.z;
    const at = (zl, xl) => t.getHeight(px + fx * zl + lx * xl, pz + fz * zl + lz * xl);
    const fl = at(D.zFront, 0.95), fr = at(D.zFront, -0.95), rl = at(D.zRear, 0.95), rr = at(D.zRear, -0.95);
    const front = (fl + fr) / 2, rear = (rl + rr) / 2;
    const wb = D.zFront - D.zRear;
    this.pos.y = rear + (front - rear) * (-D.zRear / wb);
    const pitch = Math.atan2(front - rear, wb);
    const roll = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, 1.9);
    this.sim.slope = Math.sin(pitch);
    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.set(-pitch, h, roll * 0.9);
    this.groundPitch = pitch;
  }

  // ---------- Pièces animées ----------
  openRamp() {
    if (!this.stopped || this.driver || this.ramp.target === 1) return false;
    this.ramp.target = 1;
    this._computeRampAngle();
    this.game.audio?.rampStart?.();
    return true;
  }
  closeRamp() {
    if (this.ramp.target === 0) return false;
    this.gates.target = 0;
    this.ramp.target = 0;
    this.game.audio?.rampStart?.();
    return true;
  }
  setPartition(open) {
    if (this.partition.target === (open ? 1 : 0)) return;
    this.partition.target = open ? 1 : 0;
    this.game.audio?.latch?.();
  }
  setDoor(open) {
    if (this.door.target === (open ? 1 : 0)) return;
    this.door.target = open ? 1 : 0;
    this.game.audio?.truckDoor?.(open);
  }
  // Ouverture/fermeture immédiate (chargement de partie, tests).
  setRampInstant(open) {
    this.ramp.target = this.ramp.t = open ? 1 : 0;
    this.gates.target = this.gates.t = open ? 1 : 0;
    if (open) this._computeRampAngle();
    this._applyParts();
  }

  // Angle d'ouverture pour que le bout du pont touche le sol (sol réel derrière le camion).
  _computeRampAngle() {
    this.group.updateMatrixWorld(true);
    const hingeY = D.floor - 0.01;
    let ang = Math.PI / 2 + Math.asin(hingeY / D.rampLen);
    for (let i = 0; i < 2; i++) {
      // Bout du pont dans le repère de la caisse.
      _v.set(0, hingeY + Math.cos(ang) * D.rampLen, D.hingeZ - Math.sin(ang) * D.rampLen);
      this.body.localToWorld(_w.copy(_v));
      const gy = this.game.terrain.getHeight(_w.x, _w.z);
      _w.y = gy;
      this.body.worldToLocal(_w);
      const drop = clamp((hingeY - _w.y + 0.02) / D.rampLen, 0.15, 0.62);
      ang = Math.PI / 2 + Math.asin(drop);
    }
    this.ramp.angle = ang;
  }

  _applyParts() {
    const M = this.model;
    M.ramp.rotation.x = -this.ramp.angle * ease(this.ramp.t);
    const gt = ease(this.gates.t);
    for (const gp of M.gates) gp.rotation.y = gp.userData.side * Math.PI * 0.97 * gt;
    M.partition.rotation.y = D.partitionOpen * ease(this.partition.t);
    M.door.rotation.y = 1.75 * ease(this.door.t);
  }

  _animParts(dt) {
    const a = this.game.audio;
    const r = this.ramp;
    const prevT = r.t;
    // Pont : ~2,8 s, ralenti en fin de course (vérins à ressort).
    if (r.t !== r.target) {
      const sp = r.target > r.t ? 0.36 : 0.4;
      r.t = clamp(r.t + Math.sign(r.target - r.t) * sp * dt, 0, 1);
      r.moving = true;
      if (r.t === r.target) {
        r.moving = false;
        if (r.target === 1) {
          a?.rampDown?.();
          this.gates.target = 1;
        } else a?.rampShut?.();
      }
    }
    // Les portillons attendent le pont (et se rangent avant qu'il remonte).
    const gs = this.gates;
    if (gs.t !== gs.target && (gs.target === 0 || r.t >= 1)) {
      gs.t = clamp(gs.t + Math.sign(gs.target - gs.t) * 1.1 * dt, 0, 1);
      if (gs.t === gs.target) a?.latch?.();
    }
    if (r.target === 0 && gs.t > 0) r.t = Math.max(r.t, prevT); // pont bloqué tant que les portillons sont ouverts
    for (const p of [this.partition, this.door]) {
      if (p.t !== p.target) p.t = clamp(p.t + Math.sign(p.target - p.t) * 1.4 * dt, 0, 1);
    }
    this._applyParts();
  }

  // ---------- Feux ----------
  _setLight(group, rgb, k) {
    const d = this._light;
    const i = group * 4;
    const r = Math.round(rgb[0] * k), g = Math.round(rgb[1] * k), b = Math.round(rgb[2] * k);
    if (d[i] !== r || d[i + 1] !== g || d[i + 2] !== b) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      this._lightDirty = true;
    }
  }

  _updateLights(dt, night) {
    const s = this.sim;
    const on = s.engineOn;
    this.lightsOn = on && night > 0.25;
    this._blink = (this._blink + dt) % 0.8;
    const blink = this._blink < 0.4;
    const head = this.lightsOn ? 1 : 0;
    const pos = this.lightsOn ? 1 : 0;
    this._setLight(LIGHT.head, LC.head, head);
    this._setLight(LIGHT.fog, LC.head, 0);
    this._setLight(LIGHT.drl, LC.drl, on ? 0.85 : 0);
    this._setLight(LIGHT.tail, LC.tail, pos * 0.42);
    this._setLight(LIGHT.clearR, LC.clearR, pos * 0.45);
    this._setLight(LIGHT.clearF, LC.clearF, pos * 0.6);
    this._setLight(LIGHT.plate, LC.plate, pos * 0.35);
    this._setLight(LIGHT.side, LC.side, pos * 0.5);
    const brake = on && this.driver && s.brake > 0.05 && !(s.gear > 0 && s.throttle > 0.1);
    this._setLight(LIGHT.brake, LC.brake, brake ? 1 : 0);
    this._setLight(LIGHT.rev, LC.rev, on && s.gear < 0 ? 1 : 0);
    const haz = this.hazard && blink;
    this._setLight(LIGHT.indL, LC.ind, haz ? 1 : 0);
    this._setLight(LIGHT.indR, LC.ind, haz ? 1 : 0);
    this._setLight(LIGHT.interior, LC.interior, this.interiorLight ? 1 : 0);
    this._setLight(LIGHT.dash, LC.dash, on ? 0.5 : 0);
    if (this._lightDirty) {
      this.model.lightData.set(this._light);
      this.model.lightTex.needsUpdate = true;
      this._lightDirty = false;
    }
    if (this.hazard && this._blink < dt && this.game.audio?.tick) this.game.audio.tick();
    // Plafonnier : éclairage d'appoint de l'intérieur (émission des matériaux du box).
    const mat = this.model.materials.body;
    const target = this.interiorLight ? 0.35 + night * 0.9 : 0;
    mat.emissiveIntensity += (target - mat.emissiveIntensity) * Math.min(1, dt * 6);
    // Faisceaux et halos de nuit.
    const k = this.lightsOn ? smoothstep(0.25, 0.6, night) : 0;
    this.beamMat.opacity = 0.06 * k;
    this.poolMat.opacity = 0.85 * k;
    this.beams.visible = k > 0.01;
    this.haloMat.opacity = 0.9 * k;
    this.tailHaloMat.opacity = (brake ? 0.85 : 0.4) * k;
  }

  _buildBeams() {
    const grad = gradientTexture(false);
    const radial = gradientTexture(true);
    this.beams = new THREE.Group();
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#fff1d6', map: grad, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const s of [-1, 1]) {
      const cone = new THREE.ConeGeometry(2.4, 16, 16, 1, true);
      cone.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(cone, this.beamMat);
      m.position.set(s * 0.86, 1.05, 4.25 + 8);
      m.rotation.x = 0.05;
      this.beams.add(m);
    }
    this.poolMat = new THREE.MeshBasicMaterial({ color: '#ffe9c4', map: radial, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    // Flaque de lumière sur la chaussée : plus intense près du camion, portée ~30 m.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 30), this.poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.06, 4.25 + 13);
    this.beams.add(pool);
    this.haloMat = new THREE.SpriteMaterial({ map: radial, color: '#fff3dc', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.tailHaloMat = new THREE.SpriteMaterial({ map: radial, color: '#ff2a12', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const s of [-1, 1]) {
      const h = new THREE.Sprite(this.haloMat);
      h.position.set(s * 0.86, 1.11, 4.3);
      h.scale.setScalar(0.9);
      this.beams.add(h);
      const t = new THREE.Sprite(this.tailHaloMat);
      t.position.set(s * 1.01, 0.64, -4.3);
      t.scale.setScalar(0.55);
      this.beams.add(t);
    }
    this.beams.visible = false;
    this.body.add(this.beams);
  }

  // ---------- Points utiles (monde) ----------
  // Point du repère de la caisse → monde.
  localToWorld(x, y, z, out = new THREE.Vector3()) {
    return this.body.localToWorld(out.set(x, y, z));
  }
  // Point sur le pont : u = 0 à la charnière, 1 au sol ; renvoie la position monde (surface de marche).
  rampPoint(u, x = 0, out = new THREE.Vector3()) {
    const ang = this.ramp.angle * ease(this.ramp.t);
    const L = D.rampLen * u;
    out.set(x, D.floor - 0.01 + Math.cos(ang) * L + Math.sin(ang) * 0.03, D.hingeZ - Math.sin(ang) * L + Math.cos(ang) * 0.03);
    return this.body.localToWorld(out);
  }
  // Pied du pont (au sol, un peu en arrière) : point d'interaction arrière.
  rearPoint(out = new THREE.Vector3(), back = 1.2) {
    const h = this.sim.heading;
    const d = D.L / 2 + back;
    out.x = this.pos.x - Math.sin(h) * d;
    out.y = this.pos.y;
    out.z = this.pos.z - Math.cos(h) * d;
    return out;
  }
  // Portière conducteur (gauche) ou passager.
  doorPoint(side = 1, out = new THREE.Vector3()) {
    const h = this.sim.heading;
    const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    out.x = this.pos.x + fx * 3.4 + lx * side * 1.9;
    out.y = this.pos.y;
    out.z = this.pos.z + fz * 3.4 + lz * side * 1.9;
    return out;
  }
  // Repère local (x, z) → monde, au sol.
  groundPoint(xl, zl, out = new THREE.Vector3()) {
    const h = this.sim.heading;
    out.x = this.pos.x + Math.sin(h) * zl + Math.cos(h) * xl;
    out.y = this.pos.y;
    out.z = this.pos.z + Math.cos(h) * zl - Math.sin(h) * xl;
    return out;
  }
  // Monde → repère local au sol { x, z }.
  toLocal(px, pz) {
    const h = this.sim.heading;
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    return { x: dx * Math.cos(h) - dz * Math.sin(h), z: dx * Math.sin(h) + dz * Math.cos(h) };
  }

  // Repousse un cercle hors de l'emprise du camion ; renvoie vrai en cas de contact.
  pushOut(p, r) {
    const l = this.toLocal(p.x, p.z);
    const hw = D.W / 2 + r, hd = D.L / 2 + r;
    if (Math.abs(l.x) >= hw || Math.abs(l.z) >= hd) return false;
    const ox = hw - Math.abs(l.x), oz = hd - Math.abs(l.z);
    if (ox < oz) l.x = Math.sign(l.x || 1) * hw;
    else l.z = Math.sign(l.z || 1) * hd;
    const h = this.sim.heading;
    p.x = this.pos.x + Math.sin(h) * l.z + Math.cos(h) * l.x;
    p.z = this.pos.z + Math.cos(h) * l.z - Math.sin(h) * l.x;
    return true;
  }

  // Met à jour l'obstacle statique (grille spatiale) quand le camion a bougé.
  _syncCollider(force = false) {
    const c = this.collider;
    const cs = this.game.colliders;
    const enabled = !this.driver;
    c.enabled = enabled;
    c.top = this.pos.y + D.H;
    const h = this.sim.heading;
    if (!force && Math.abs(c.x - this.pos.x) < 0.05 && Math.abs(c.z - this.pos.z) < 0.05 && Math.abs(c.rot - h) < 0.005) return;
    const cells = (fn) => cs._cells(c.x - c.bound, c.z - c.bound, c.x + c.bound, c.z + c.bound, fn);
    cells((k) => {
      const l = cs.grid.get(k);
      const i = l ? l.indexOf(c) : -1;
      if (i >= 0) l.splice(i, 1);
    });
    c.x = this.pos.x;
    c.z = this.pos.z;
    c.rot = h;
    c.c = Math.cos(h);
    c.s = Math.sin(h);
    cells((k) => {
      if (!cs.grid.has(k)) cs.grid.set(k, []);
      cs.grid.get(k).push(c);
    });
  }

  // Démarrage / arrêt du moteur.
  startEngine() {
    if (this.sim.engineOn) return;
    this.sim.engineOn = true;
    this.sim.rpm = 400;
    this.sim.gear = 2;
    this.game.audio?.engineStart?.();
  }
  stopEngine() {
    if (!this.sim.engineOn) return;
    this.sim.engineOn = false;
    this.game.audio?.airBrake?.(0.8);
  }

  // ctrl : { throttle -1..1 (bas = frein puis marche arrière), steer -1..1 } ; null = personne au volant.
  update(dt, ctrl, night = 0) {
    const g = this.game;
    const s = this.sim;
    const driving = !!this.driver && !!ctrl;
    // Pas de départ pont ouvert : frein de parc serré tant qu'il n'est pas relevé.
    const blocked = !this.rampClosed || this.door.t > 0;
    const input = driving && !blocked ? ctrl : { throttle: 0, steer: ctrl ? ctrl.steer : 0, park: true };
    if (driving && blocked && Math.abs(ctrl.throttle) > 0.3) this.blockedT = (this.blockedT || 0) + dt;
    else this.blockedT = 0;
    // Adhérence et résistance au roulement selon le revêtement (échantillonné à 4 Hz).
    this._surfT = (this._surfT || 0) - dt;
    if (this._surfT <= 0) {
      this._surfT = 0.25;
      const onRoad = nearestRoad(this.pos.x, this.pos.z).d < 0.5;
      this._soft = onRoad ? 0 : 1;
    }
    s.soft += ((this._soft || 0) - s.soft) * Math.min(1, dt * 3);
    const prevX = this.pos.x, prevZ = this.pos.z, prevH = s.heading;
    const moving = Math.abs(s.vx) > 0.05 || driving;
    if (moving || this._wasMoving) s.step(dt, input);
    else {
      s.rpm = s.engineOn ? s.rpm + (650 - s.rpm) * Math.min(1, dt * 4) : Math.max(0, s.rpm - dt * 900);
      s.ax = s.ay = s.jerk = 0;
    }
    this._wasMoving = moving;
    if (s.shifted && g.audio?.gearShift) g.audio.gearShift(s.shifted);
    this.lateral = Math.abs(s.ay);
    this.yawRate = -s.r;
    // Limites du monde.
    const lim = WORLD.half - 8;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    // Collisions avec le décor (cercles le long de l'axe) et les autres véhicules.
    let bump = 0;
    if (Math.abs(s.vx) > 0.01) {
      const h = s.heading;
      const fx = Math.sin(h), fz = Math.cos(h);
      const p = { x: 0, z: 0 };
      for (const off of PROBES) {
        const cx = this.pos.x + fx * off, cz = this.pos.z + fz * off;
        p.x = cx;
        p.z = cz;
        const hit = g.colliders.resolve(p, 1.22, this.pos.y + 0.5, 'truck');
        if (hit) {
          this.pos.x += p.x - cx;
          this.pos.z += p.z - cz;
          const into = -(fx * hit.nx + fz * hit.nz) * Math.sign(s.vx);
          bump = Math.max(bump, Math.abs(s.vx) * clamp(into, 0.2, 1));
        }
      }
      for (const v of g.vehicles || []) {
        if (v === this || v.proxy) continue;
        const l = this.toLocal(v.pos.x, v.pos.z);
        // Voiture ≈ cercle de 0,95 m autour de son centre.
        if (Math.abs(l.x) < D.W / 2 + 0.85 && Math.abs(l.z) < D.L / 2 + 1.6) {
          const pushX = (D.W / 2 + 0.85 - Math.abs(l.x)) * Math.sign(l.x || 1);
          const pushZ = (D.L / 2 + 1.6 - Math.abs(l.z)) * Math.sign(l.z || 1);
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
      // Eau trop profonde : seul un déplacement qui l'approfondit est refusé (garé sur l'estran, la marée ne l'emprisonne pas).
      const deep = g.terrain.waterDepth(this.pos.x, this.pos.z);
      if (deep > 0.6 && deep > g.terrain.waterDepth(prevX, prevZ)) {
        this.pos.x = prevX;
        this.pos.z = prevZ;
        s.heading = prevH;
        bump = Math.max(bump, Math.abs(s.vx));
      }
    }
    if (bump > 2.5 && g.time - this.lastBump > 0.5) {
      this.lastBump = g.time;
      g.bus.emit('truck:bump', { truck: this, speed: bump });
      s.impact(-0.25);
      g.audio?.thud?.();
    } else if (bump > 0) s.vx *= 0.9;
    // Arrêt complet : soupir des freins à air.
    const nowStopped = Math.abs(s.vx) < 0.05;
    if (driving && nowStopped && this._rolling && g.audio?.airBrake) g.audio.airBrake(0.45);
    this._rolling = Math.abs(s.vx) > 1.5 ? true : nowStopped ? false : this._rolling;

    this.snap();
    const nose = this.nose;
    if (driving) {
      nose.pos.set(this.pos.x + Math.sin(s.heading) * 3.4, this.pos.y, this.pos.z + Math.cos(s.heading) * 3.4);
      nose.heading = s.heading;
      nose.speed = s.vx;
    } else if (nose.pos.x !== 1e6) nose.pos.set(1e6, 0, 1e6);
    // Suspension (masse suspendue) : tangage au freinage/accélération, roulis en virage.
    const sp = this.susp;
    const w2 = 70, c = 2 * 0.38 * Math.sqrt(w2);
    const pT = clamp(s.ax, -7, 4) * 0.0058;
    const rT = clamp(s.ay, -6, 6) * 0.011;
    sp.pv += (-w2 * (sp.p - pT) - c * sp.pv) * dt;
    sp.p += sp.pv * dt;
    sp.rv += (-w2 * 0.8 * (sp.r - rT) - c * sp.rv) * dt;
    sp.r += sp.rv * dt;
    // Vibrations de la route (terre plus marquée).
    const vib = Math.min(1, Math.abs(s.vx) / 12) * (0.0012 + s.soft * 0.004);
    const t = g.time;
    this.body.rotation.set(-sp.p + Math.sin(t * 17.3) * vib * 0.6, 0, sp.r + Math.sin(t * 13.1 + 1.3) * vib);
    this.body.position.y = s.engineOn ? Math.sin(t * 2 * Math.PI * (s.rpm / 60) * 0.5) * 0.0012 : 0;
    // Roues : rotation et braquage (épure d'Ackermann).
    const W = this.model.wheels;
    const [al, ar] = s.ackermann();
    for (const fw of W.front) {
      fw.steer.rotation.y = fw.side > 0 ? al : ar;
      fw.spin.rotation.x = s.wheelSpin;
    }
    W.rear.rotation.x = s.wheelSpin;
    this._animParts(dt);
    this._updateLights(dt, night);
    this.group.updateMatrixWorld(true);
    this._syncCollider();
    // Son moteur (le camion le plus proche de la caméra).
    if (g.audio?.truckEngine) {
      const cam = g.camera.position;
      const dist = Math.hypot(cam.x - this.pos.x, cam.z - this.pos.z);
      g.audio.truckEngine({ on: s.engineOn, rpm: s.rpm, load: s.load, speed: Math.abs(s.vx), dist, inside: !!this.driver, reverse: s.engineOn && s.gear < 0, brake: s.braking });
    }
  }
}

export { TRUCK_DIM };
