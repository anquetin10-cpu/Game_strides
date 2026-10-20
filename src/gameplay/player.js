// Joueur : à pied, à cheval ou au volant ; relie les entrées aux entités.
import { Human } from '../entities/human.js';
import { OUTFITS } from '../entities/humanModel.js';
import { FollowAI } from '../entities/horse.js';
import { clamp } from '../core/math.js';

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
    if (this.mode === 'drive') {
      this.human.hidden = true;
      this.human.mesh.visible = false;
    }
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
      when: () => this.horse && !this.horse.frozen && !this.human.carrying && !this.horse.hiddenInTruck,
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
    g.interact.add('truck-in', {
      label: 'Conduire',
      icon: 'truck',
      r: 4.5,
      priority: 1.5,
      modes: ['foot'],
      getPos: () => this.truck?.pos || { x: 1e9, z: 1e9 },
      when: () => !!this.truck && !this.human.carrying,
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
    if (!this.truck) return;
    this.mode = 'drive';
    this.truck.driver = this;
    this.human.hidden = true;
    this.human.mesh.visible = false;
    this.focusPos = this.truck.pos;
    this.game.bus.emit('player:drive', this.truck);
  }

  exitTruck() {
    const t = this.truck;
    this.mode = 'foot';
    t.driver = null;
    this.human.hidden = false;
    const lx = Math.cos(t.heading), lz = -Math.sin(t.heading);
    this.human.setPosition(t.pos.x + lx * 2.2 + Math.sin(t.heading) * 2, t.pos.z + lz * 2.2 + Math.cos(t.heading) * 2, t.heading);
    this.game.colliders.resolve(this.human.pos, 0.4, -Infinity);
    this.human.snap();
    this.focusPos = this.human.pos;
    this.game.bus.emit('player:exitTruck', t);
  }

  whistle() {
    const h = this.horse;
    if (!h || this.mode !== 'foot' || h.hiddenInTruck || h.frozen) return false;
    const d = Math.hypot(h.pos.x - this.human.pos.x, h.pos.z - this.human.pos.z);
    if (d > 700) return false;
    // Trop loin : le cheval « arrive » près du joueur (comme un appel GTA).
    if (d > 160) {
      const a = Math.random() * Math.PI * 2;
      h.setPosition(this.human.pos.x + Math.cos(a) * 60, this.human.pos.z + Math.sin(a) * 60);
      this.game.colliders.resolve(h.pos, 1, -Infinity);
    }
    h.ai = new FollowAI(() => this.human.pos, { stopDist: 2.6 });
    this.game.bus.emit('player:whistle', h);
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
    if (this.mode === 'foot') {
      let sp = 0;
      if (!locked && mv.mag > 0.1) {
        sp = mv.mag < 0.55 ? 2.4 * (mv.mag / 0.55 + 0.25) : 5.4;
        if (input.isHeld('gallop')) sp = 7.2;
        if (this.human.carrying) sp = Math.min(sp, 3.6);
      }
      this.human.move(dl ? dir.x / dl : 0, dl ? dir.z / dl : 1, sp, dt);
      this.human.pose = 'walk';
      this.human.update(dt, g.camera.position);
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
    } else if (this.mode === 'drive') {
      const throttle = locked ? 0 : clamp(mv.y * 1.25, -1, 1);
      const steer = locked ? 0 : clamp(mv.x * 1.2, -1, 1);
      this.truck.update(dt, { throttle, steer }, g.sky.nightFactor);
    }
  }
}
