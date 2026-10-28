// Joueur : à pied, à cheval ou au volant ; relie les entrées aux entités.
import { Human } from '../entities/human.js';
import { OUTFITS } from '../entities/humanModel.js';
import { FollowAI } from '../entities/horse.js';
import { clamp } from '../core/math.js';
import { nearestRoad, zoneById, zoneDist } from '../world/layout.js';
import { Transport } from './transport.js';
import { TRUCK_DIM } from '../entities/truckModel.js';
import * as THREE from 'three';

const _seatQ = new THREE.Quaternion();
const _door = new THREE.Vector3();
const _tdoor = { x: 0, z: 0 };
// Portière d'une voiture de la circulation (conducteur à gauche, x > 0).
function trafficDoor(c, side) {
  const h = c.heading, xl = side * (c.spec.W / 2 + 0.75), zl = -0.3;
  _tdoor.x = c.pos.x + Math.sin(h) * zl + Math.cos(h) * xl;
  _tdoor.z = c.pos.z + Math.cos(h) * zl - Math.sin(h) * xl;
  return _tdoor;
}


// Commandes à cheval en concours (réglages ajustables) : cadence et virages progressifs.
export const CSO_RIDE = {
  cadence: 6.2, // galop de concours par défaut (m/s ≈ 370 m/min, foulée ≈ 3,5 m)
  maxSpeed: 8.0, // galop allongé au plus (m/s)
  cadenceRate: 1.4, // variation de cadence joystick poussé à fond (m/s par seconde)
  deadZone: 0.3, // part du joystick avant/arrière ignorée (on tourne sans changer de cadence)
  minRadius: 6, // rayon de virage le plus court au galop, joystick à fond (m)
  maxTurnRate: 1.2, // rad/s
  minTurnRate: 0.7, // rad/s au pas ou à l'arrêt (volte, demi-tour)
};
export class Player {
  constructor(game, avatar = 'f') {
    this.game = game;
    this.avatar = avatar;
    this.outfitKind = 'work';
    this.human = new Human(game, this._outfit(avatar), { player: true });
    this.human.isPlayer = true;
    this.mode = 'foot';
    this.horse = null;
    this.truck = null;
    this.vehicle = null; // véhicule conduit (camion compris)
    this.focusPos = this.human.pos;
    this.locked = false;
    this._setupInteractions();
    // Mener en main, pont du camion, chargement des chevaux.
    this.transport = new Transport(game, this);
  }

  // Tenues selon l'activité (comme une vraie cavalière) :
  // - « work » : à pied à l'écurie, au volant, en ville — culotte d'équitation de travail beige (grise pour un
  //   cavalier), boots marron, polo bleu ou, le matin et sous la pluie, blouson softshell sombre ; pas de casque ;
  // - « ride » : la même tenue, casque mis pour monter ;
  // - « competition » : sur le terrain d'un concours (on se change en arrivant) — veste de concours (bleu marine si
  //   la veste de la Sellerie est achetée, noire sinon), chemise blanche, culotte blanche, bottes noires, casque.
  _outfit(avatar, kind = this.outfitKind) {
    const base = avatar === 'm' ? OUTFITS.rider : OUTFITS.riderF;
    const o = { ...base, style: 'rider' }; // coupe de concours par défaut
    if (kind === 'competition') {
      const jacket = this.game.save?.data?.upgrades?.includes('veste') ? '#1f2b45' : '#1b1c1f';
      return Object.assign(o, { top: jacket, sleeve: jacket, pants: '#f2f1ec', boots: '#121214', helmet: '#16171a', logo: false, jacket: true });
    }
    const h = this.game.hour?.() ?? 12;
    const wet = (this.game.weather?.rain ?? 0) > 0.15;
    const top = wet || h < 9.5 || h > 20 ? '#2b3442' : '#2f5f8a';
    // Coupe décontractée (polo ou blouson, pas de revers ni de chemise), culotte d'équitation, boots et mini-chaps.
    Object.assign(o, { style: 'casual', top, sleeve: top, pants: avatar === 'm' ? '#9aa0a6' : '#c2b49a', boots: '#3b2a1e', tallBoots: true, breeches: true, logo: true });
    o.helmet = kind === 'ride' ? '#16171a' : null;
    return o;
  }

  // Tenue voulue : concours (sur le terrain d'un concours ou d'un défi en cours), à cheval, ou travail.
  desiredOutfit() {
    const g = this.game;
    const run = g.missions?.active;
    const event = (run && run.offer?.vertical === 'EVENEMENTS') || !!g.challenge?.active;
    if (event) {
      const f = this.focusPos;
      for (const id of ['pole', 'hippo', 'gatien']) {
        const zn = zoneById[id];
        if (zn && zoneDist(f.x, f.z, zn) < 12) return 'competition';
      }
    }
    return this.mode === 'ride' ? 'ride' : 'work';
  }

  // Reconstruit le personnage (choix cavalière/cavalier, tenue).
  _rebuild() {
    const old = this.human;
    const mounted = old.mounted;
    const pos = old.pos.clone();
    const heading = old.heading;
    if (mounted) old.dismount();
    old.dispose();
    this.human = new Human(this.game, this._outfit(this.avatar), { player: true, x: pos.x, z: pos.z, heading });
    this.human.isPlayer = true;
    if (mounted) this.human.mount(mounted);
    this.focusPos = this.mode === 'ride' ? this.horse.pos : this.mode === 'drive' ? this.vehicle.pos : this.human.pos;
  }

  setAvatar(avatar) {
    if (avatar === this.avatar) return;
    this.avatar = avatar;
    this._rebuild();
  }

  setOutfit(kind) {
    if (kind === this.outfitKind) return;
    this.outfitKind = kind;
    this._rebuild();
  }

  setHorse(horse) {
    if (this.horse && this.horse !== horse && this.mode === 'ride') this.dismount(true);
    this.horse = horse;
    horse.isPlayerHorse = true;
  }

  get speed() {
    if (this.mode === 'ride') return this.horse.speed;
    if (this.mode === 'drive') return this.vehicle.speed;
    return this.human.speed;
  }
  get heading() {
    if (this.mode === 'ride') return this.horse.heading;
    if (this.mode === 'drive') return this.vehicle.heading;
    return this.human.heading;
  }
  // Au volant du camion Strides (les missions de transport l'exigent).
  get inTruck() {
    return this.mode === 'drive' && this.vehicle === this.truck;
  }

  get focus() {
    const pos = this.mode === 'ride' ? this.horse.pos : this.mode === 'drive' ? this.vehicle.pos : this.human.pos;
    return { pos, heading: this.heading, speed: this.speed, mode: this.mode, camDist: this.mode === 'drive' ? this.vehicle.camDist : undefined };
  }

  _setupInteractions() {
    const g = this.game;
    g.interact.add('mount', {
      label: 'Monter',
      icon: 'horse',
      r: 3.2,
      priority: 2,
      modes: ['foot'],
      getPos: () => this.horse?.pos || { x: 1e9, z: 1e9 },
      when: () => this.horse && !this.horse.frozen && !this.human.carrying && !this.horse.hiddenInTruck && !this.transport?.busy,
      action: () => this.mount(),
    });
    g.interact.add('dismount', {
      label: 'Descendre',
      icon: 'down',
      r: 1e9,
      priority: 0,
      modes: ['ride'],
      getPos: () => this.focusPos,
      when: () => this.horse && this.horse.speed < 2.5 && this.horse.jumpT < 0 && !this.noDismount,
      action: () => this.dismount(),
    });
    // Monter au volant : près d'une portière de la cabine.
    const doorL = { x: 0, y: 0, z: 0 }, doorR = { x: 0, y: 0, z: 0 };
    g.interact.add('truck-in', {
      label: 'Conduire',
      icon: 'truck',
      r: 3.0,
      priority: 1.5,
      modes: ['foot'],
      getPos: () => {
        const t = this.truck;
        if (!t) return { x: 1e9, z: 1e9 };
        const p = this.human.pos;
        t.doorPoint(1, doorL);
        t.doorPoint(-1, doorR);
        return Math.hypot(p.x - doorL.x, p.z - doorL.z) < Math.hypot(p.x - doorR.x, p.z - doorR.z) ? doorL : doorR;
      },
      when: () => !!this.truck && !this.human.carrying && !this.transport?.leading && !this.transport?.busy,
      action: () => this.enterTruck(),
    });
    // Toutes les autres voitures et le tracteur : garés, ou voitures de la circulation arrêtées devant le joueur.
    const door = { x: 0, y: 0, z: 0 };
    let near = null;
    g.interact.add('vehicle-in', {
      label: 'Conduire',
      icon: 'car',
      r: 2.6,
      priority: 1.4,
      modes: ['foot'],
      getPos: () => {
        near = null;
        const p = this.human.pos;
        let best = 2.6;
        const consider = (v, traffic) => {
          if (Math.abs(v.pos.x - p.x) > 8 || Math.abs(v.pos.z - p.z) > 8) return;
          if (traffic && Math.abs(v.speed) > 0.6) return;
          for (const side of [1, -1]) {
            const dp = traffic ? trafficDoor(v, side) : v.doorPoint(side, _door);
            const d = Math.hypot(p.x - dp.x, p.z - dp.z);
            if (d < best) {
              best = d;
              near = { v, traffic };
              door.x = dp.x;
              door.z = dp.z;
            }
          }
        };
        for (const v of g.drivables) if (!v.driver) consider(v, false);
        for (const c of g.ambient?.cars || []) if (c.mesh.visible && !c.uturn) consider(c, true);
        return near ? door : { x: 1e9, z: 1e9 };
      },
      when: () => !!near && !this.human.carrying && !this.transport?.leading && !this.transport?.busy,
      action: () => {
        if (!near) return;
        const v = near.traffic ? g.ambient.takeOver(near.v) : near.v;
        if (v) this.enterVehicle(v);
      },
    });
    g.interact.add('truck-out', {
      label: 'Sortir',
      icon: 'down',
      r: 1e9,
      priority: 0,
      modes: ['drive'],
      getPos: () => this.focusPos,
      when: () => this.vehicle && Math.abs(this.vehicle.speed) < 1.5 && !(this.noExitTruck && this.vehicle === this.truck),
      action: () => (this.vehicle === this.truck ? this.exitTruck() : this.exitVehicle()),
    });
  }

  mount() {
    const h = this.horse;
    if (!h) return;
    const tp = this.transport;
    if (tp) {
      if (tp.seq && tp.seq.horse === h) tp.abortSequence();
      if (tp.isAboard(h)) tp.unloadInstant(h);
      if (tp.led && tp.led.horse === h) tp.release(true);
      tp.travelTack(h, false);
    }
    h.ai = null;
    h.control.mag = 0;
    h.control.speedOverride = undefined;
    h.anim.graze = 0;
    this.human.mount(h);
    this.mode = 'ride';
    this.focusPos = h.pos;
    this.game.bus.emit('player:mount', h);
  }

  dismount(silent = false) {
    if (this.mode !== 'ride') return;
    const h = this.horse;
    h.control.mag = 0;
    h.control.gallop = false;
    this.human.dismount();
    this.mode = 'foot';
    this.focusPos = this.human.pos;
    if (!silent) this.game.bus.emit('player:dismount', h);
  }

  enterTruck() {
    const t = this.truck;
    if (!t) return;
    this.transport?.release(true);
    if (this.mode === 'ride') this.dismount(true);
    this.mode = 'drive';
    this.vehicle = t;
    t.driver = this;
    // Le personnage reste visible, assis au volant (voir _seatDriver).
    this.human.hidden = false;
    this.focusPos = t.pos;
    t.startEngine();
    this.game.bus.emit('player:drive', t);
  }

  // Voiture ou tracteur : on s'installe au volant et on démarre.
  enterVehicle(v) {
    if (v === this.truck) return this.enterTruck();
    this.transport?.release(true);
    if (this.mode === 'ride') this.dismount(true);
    this.mode = 'drive';
    this.vehicle = v;
    v.driver = this;
    v._syncCollider(true);
    this.human.hidden = false;
    this.focusPos = v.pos;
    v.startEngine();
    this.game.cam.yaw = v.heading + Math.PI;
    this.game.bus.emit('player:drive', v);
  }

  exitVehicle() {
    const v = this.vehicle;
    if (this.mode !== 'drive' || !v || v === this.truck) return;
    this.mode = 'foot';
    v.driver = null;
    v.speed = 0;
    v.stopEngine();
    v._syncCollider(true);
    this.vehicle = null;
    const p = v.doorPoint(1);
    this.human.setPosition(p.x, p.z, v.heading + Math.PI / 2);
    this.game.colliders.resolve(this.human.pos, 0.4, -Infinity);
    this.human.snap();
    this.focusPos = this.human.pos;
    this.game.cam.yaw = v.heading + Math.PI / 2 + 0.6;
    this.game.bus.emit('player:exitVehicle', v);
  }

  exitTruck() {
    const t = this.truck;
    if (this.mode !== 'drive') return;
    this.mode = 'foot';
    this.vehicle = null;
    t.driver = null;
    t.speed = 0;
    t.stopEngine();
    this.human.hidden = false;
    // Descente côté conducteur (gauche), devant la roue avant.
    const p = t.doorPoint(1);
    this.human.setPosition(p.x, p.z, t.heading + Math.PI / 2);
    this.game.colliders.resolve(this.human.pos, 0.4, -Infinity);
    this.human.snap();
    this.focusPos = this.human.pos;
    // Caméra devant la portière, un peu vers l'arrière : elle ne garde pas le lacet de conduite (derrière le camion),
    // dont la perche passe par la cabine dès qu'on marche.
    this.game.cam.yaw = t.heading + Math.PI / 2 + 0.6;
    this.game.bus.emit('player:exitTruck', t);
  }

  // Conducteur assis dans la cabine : posture assise, mains au volant, suit la caisse (tangage, roulis).
  _seatDriver(dt) {
    const hu = this.human;
    const t = this.vehicle;
    const S = t === this.truck ? TRUCK_DIM.seat : t.seat;
    t.localToWorld(S.x, S.y, S.z, hu.pos);
    const y = hu.pos.y;
    hu.heading = t.heading;
    hu.speed = 0;
    hu.pose = 'sit';
    hu.update(dt, this.game.camera.position);
    hu.pos.y = y;
    hu.mesh.position.copy(hu.pos);
    t.body.getWorldQuaternion(_seatQ);
    hu.mesh.quaternion.copy(_seatQ);
    const b = hu.bones;
    if (b && b.lArm && b.rArm && b.lFore && b.rFore && !b.rClav) {
      const st = t.steer * 0.6;
      b.lArm.rotation.set(-1.05 - st * 0.3, 0, 0.12);
      b.rArm.rotation.set(-1.05 + st * 0.3, 0, -0.12);
      b.lFore.rotation.set(-0.55, 0, 0);
      b.rFore.rotation.set(-0.55, 0, 0);
      if (b.spine) b.spine.rotation.x = 0.08;
    }
  }

  whistle() {
    const h = this.horse;
    if (h && h.inBox && this.mode === 'foot') {
      this.game.hud.toast(`${h.name} est au box à l’Écurie du Val : va l’y chercher (« Sortir du box »).`);
      return false;
    }
    if (h && h.hiddenInTruck && this.mode === 'foot') {
      this.game.hud.toast(`${h.name} est dans le camion : ouvre la rampe pour la faire descendre.`);
      return false;
    }
    if (!h || this.mode !== 'foot' || h.hiddenInTruck || h.frozen || this.transport?.busy) return false;
    if (this.transport?.led?.horse === h) return false;
    const d = Math.hypot(h.pos.x - this.human.pos.x, h.pos.z - this.human.pos.z);
    if (d > 700) return false;
    // Trop loin : le cheval « arrive » près du joueur (comme un appel GTA).
    if (d > 160) {
      // Apparaître à ~60 m sur un point dégagé, de préférence sur une route.
      const g = this.game;
      const p = this.human.pos;
      let best = null;
      for (let k = 0; k < 24 && !best; k++) {
        const a = (k / 24) * Math.PI * 2 + Math.random() * 0.2;
        const r = 45 + (k % 3) * 12;
        let x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const nr = nearestRoad(x, z);
        if (nr.d < 25) {
          x = nr.x;
          z = nr.z;
        }
        if (!g.colliders.blocked(x, z, g.terrain.getHeight(x, z) + 1) && g.terrain.waterDepth(x, z) < 0 && this._clearPath(x, z, p.x, p.z)) best = { x, z };
      }
      // Sinon : tout près du joueur, sur un point libre.
      for (let k = 0; k < 16 && !best; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = p.x + Math.cos(a) * 7, z = p.z + Math.sin(a) * 7;
        if (!g.colliders.blocked(x, z, g.terrain.getHeight(x, z) + 1) && this._clearPath(x, z, p.x, p.z)) best = { x, z };
      }
      best ||= { x: p.x + 3, z: p.z + 3 };
      h.setPosition(best.x, best.z, Math.atan2(p.x - best.x, p.z - best.z));
      g.colliders.resolve(h.pos, 1, -Infinity);
    }
    h.ai = new FollowAI(() => this.human.pos, { stopDist: 2.6 });
    this.game.bus.emit('player:whistle', h);
    return true;
  }

  // Vrai si aucun obstacle haut ne coupe le segment (ligne de vue au sol).
  _clearPath(x0, z0, x1, z1) {
    const g = this.game;
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d / 1.5);
    for (let i = 1; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      if (g.colliders.blocked(x, z, g.terrain.getHeight(x, z) + 1.6)) return false;
    }
    return true;
  }

  // Téléportation (transport Strides, chargement de partie).
  teleport(x, z, heading = 0, withHorse = true) {
    if (this.mode === 'drive') {
      this.vehicle.setPosition(x, z, heading);
    } else if (this.mode === 'ride') {
      this.horse.setPosition(x, z, heading);
    } else {
      this.human.setPosition(x, z, heading);
      if (withHorse && this.horse) {
        const lx = Math.cos(heading) * -2.4, lz = -Math.sin(heading) * -2.4;
        this.horse.setPosition(x + lx, z + lz, heading);
        this.horse.ai = null;
      }
    }
    this.game.cam.snap(this.focus.pos, heading);
  }

  update(dt, input) {
    const g = this.game;
    // Tenue : réévaluée quatre fois par seconde, changée seulement quand l'activité change.
    if ((this._outfitT = (this._outfitT || 0) - dt) <= 0) {
      this._outfitT = 0.25;
      const want = this.desiredOutfit();
      if (want !== this.outfitKind) this.setOutfit(want);
    }
    const locked = this.locked;
    const mv = input.move;
    const dir = g.cam.worldDir(mv.x, mv.y);
    const dl = Math.hypot(dir.x, dir.z);
    const tp = this.transport;
    if (this.mode === 'foot') {
      if (tp.controlsHuman) {
        // Séquence de chargement : le personnage suit le script.
        tp.driveHuman(dt);
        this.human.pose = 'walk';
        this.human.update(dt, g.camera.position);
      } else {
        let sp = 0;
        if (!locked && mv.mag > 0.1) {
          sp = mv.mag < 0.55 ? 2.4 * (mv.mag / 0.55 + 0.25) : 5.4;
          if (input.isHeld('gallop')) sp = 7.2;
          if (this.human.carrying) sp = Math.min(sp, 3.6);
          // Cheval en main : pas de course, on reste au pas ou au petit trot.
          if (tp.leading) sp = Math.min(sp, 3.3);
        }
        this.human.move(dl ? dir.x / dl : 0, dl ? dir.z / dl : 1, sp, dt);
        this.human.pose = 'walk';
        this.human.update(dt, g.camera.position);
      }
      tp.afterHuman();
    } else if (this.mode === 'ride') {
      const c = this.horse.control;
      const cso = g.course?.controls === 'cso';
      c.speedOverride = undefined;
      c.turnRate = undefined;
      if (!cso) this.csoCadence = undefined;
      if (cso && !locked) {
        // Concours : galop de concours stable par défaut ; joystick gauche/droite = tourner progressivement,
        // avant/arrière = régler la cadence (gardée au relâchement) ; SAUT pendant que l'on tourne.
        const R = CSO_RIDE;
        if (this.csoCadence === undefined) this.csoCadence = R.cadence;
        const thr = Math.abs(mv.y) > R.deadZone ? (mv.y - Math.sign(mv.y) * R.deadZone) / (1 - R.deadZone) : 0;
        this.csoCadence = clamp(this.csoCadence + thr * R.cadenceRate * dt, 0, R.maxSpeed);
        const steer = Math.abs(mv.x) > 0.06 ? mv.x : 0;
        const v = this.horse.speed;
        c.turnRate = -steer * Math.max(R.minTurnRate, Math.min(R.maxTurnRate, v / R.minRadius));
        c.speedOverride = this.csoCadence;
        c.mag = 1;
        c.gallop = false;
        if (input.wasPressed('jump')) c.jump = true;
      } else if (!locked) {
        c.x = dl ? dir.x / dl : 0;
        c.z = dl ? dir.z / dl : 0;
        c.mag = mv.mag;
        c.gallop = input.isHeld('gallop');
        if (input.wasPressed('jump')) c.jump = true;
      } else {
        c.mag = 0;
        c.gallop = false;
      }
      this.human.animateRiding(dt);
    }
    // Le camion vit en permanence (pont, feux, moteur) ; commandes seulement au volant.
    if (this.truck) {
      let ctrl = null;
      if (this.mode === 'drive') {
        ctrl = this._driveCtrl || (this._driveCtrl = { throttle: 0, steer: 0 });
        ctrl.throttle = locked ? 0 : clamp(mv.y * 1.25, -1, 1);
        ctrl.steer = locked ? 0 : clamp(mv.x * 1.2, -1, 1);
      }
      this.truck.update(dt, this.vehicle === this.truck ? ctrl : null, g.sky.nightFactor);
      for (const v of g.drivables) v.update(dt, v === this.vehicle ? ctrl : null, g.sky.nightFactor, g.camera.position);
      if (this.mode === 'drive') this._seatDriver(dt);
    }
    tp.update(dt);
    // Action secondaire (bouton contextuel ou touche L).
    const keyL = input.keys.has('KeyL') && input.enabled;
    if ((input.wasPressed('action2') || (keyL && !this._keyL)) && !locked && !g.hud.dialogActive && !g.phone.isOpen) tp.triggerSecondary();
    this._keyL = keyL;
  }
}
