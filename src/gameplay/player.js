// Joueur : à pied, à cheval ou au volant ; relie les entrées aux entités.
import { Human } from '../entities/human.js';
import { OUTFITS } from '../entities/humanModel.js';
import { FollowAI } from '../entities/horse.js';
import { clamp } from '../core/math.js';
import { nearestRoad } from '../world/layout.js';
import { Transport } from './transport.js';
import { TRUCK_DIM } from '../entities/truckModel.js';
import * as THREE from 'three';

const _seatQ = new THREE.Quaternion();

export class Player {
  constructor(game, avatar = 'f') {
    this.game = game;
    this.avatar = avatar;
    this.outfitKind = 'default';
    this.human = new Human(game, this._outfit(avatar), { player: true });
    this.human.isPlayer = true;
    this.mode = 'foot';
    this.horse = null;
    this.truck = null;
    this.focusPos = this.human.pos;
    this.locked = false;
    this._setupInteractions();
    // Mener en main, pont du camion, chargement des chevaux.
    this.transport = new Transport(game, this);
  }

  _outfit(avatar, kind = this.outfitKind) {
    const base = avatar === 'm' ? OUTFITS.rider : OUTFITS.riderF;
    const o = { ...base, helmet: '#16171a' };
    if (kind === 'competition') Object.assign(o, { top: '#1f2b45', sleeve: '#1f2b45' });
    return o;
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
    this.focusPos = this.mode === 'ride' ? this.horse.pos : this.mode === 'drive' ? this.truck.pos : this.human.pos;
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
    if (this.mode === 'drive') return this.truck.speed;
    return this.human.speed;
  }
  get heading() {
    if (this.mode === 'ride') return this.horse.heading;
    if (this.mode === 'drive') return this.truck.heading;
    return this.human.heading;
  }
  get focus() {
    const pos = this.mode === 'ride' ? this.horse.pos : this.mode === 'drive' ? this.truck.pos : this.human.pos;
    return { pos, heading: this.heading, speed: this.speed, mode: this.mode };
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
    g.interact.add('truck-out', {
      label: 'Sortir',
      icon: 'down',
      r: 1e9,
      priority: 0,
      modes: ['drive'],
      getPos: () => this.focusPos,
      when: () => Math.abs(this.truck.speed) < 1.5 && !this.noExitTruck,
      action: () => this.exitTruck(),
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
    t.driver = this;
    // Le personnage reste visible, assis au volant (voir _seatDriver).
    this.human.hidden = false;
    this.focusPos = t.pos;
    t.startEngine();
    this.game.bus.emit('player:drive', t);
  }

  exitTruck() {
    const t = this.truck;
    if (this.mode !== 'drive') return;
    this.mode = 'foot';
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
    const t = this.truck;
    const S = TRUCK_DIM.seat;
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
      this.truck.setPosition(x, z, heading);
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
      if (!locked) {
        c.x = dl ? dir.x / dl : 0;
        c.z = dl ? dir.z / dl : 0;
        c.mag = mv.mag;
        c.gallop = input.isHeld('gallop');
        if (input.wasPressed('jump')) c.jump = true;
      } else {
        c.mag = 0;
        c.gallop = false;
      }
      c.speedOverride = undefined;
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
      this.truck.update(dt, ctrl, g.sky.nightFactor);
      if (this.mode === 'drive') this._seatDriver(dt);
    }
    tp.update(dt);
    // Action secondaire (bouton contextuel ou touche L).
    const keyL = input.keys.has('KeyL') && input.enabled;
    if ((input.wasPressed('action2') || (keyL && !this._keyL)) && !locked && !g.hud.dialogActive && !g.phone.isOpen) tp.triggerSecondary();
    this._keyL = keyL;
  }
}
