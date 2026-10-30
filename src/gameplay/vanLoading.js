// Van porte-chevaux (STX Renault Master) : ouverture du pont latéral droit (et de ses volets) et de la porte arrière,
// chargement / déchargement des chevaux par le pont latéral, chevaux attachés dans leurs stalles pendant le trajet,
// sauvegarde et reprise. Le camion Strides (Scania) garde son propre transport (transport.js).
// Chargement : cheval mené en main au pied du pont ouvert → il monte (perpendiculaire au van), se range dans la stalle
// libre (gauche d'abord, puis droite côté pont) face à la route. Déchargement : l'inverse, puis il revient en main.
import * as THREE from 'three';
import { MASTER_DIM as MD } from '../entities/masterModel.js';
import { clamp, damp, lerp, wrapAngle } from '../core/math.js';
import { t, T } from '../core/i18n.js';

const S = MD.side;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const fem = (h) => /comete|saphir|tornade/.test(h?.id || '');
const WALK = 1.05; // m/s, au pas, en main
const TURN = 1.4; // rad/s, demi-tour sur place
// Pied du pont (au sol, perpendiculaire au van) et dessus du pont.
const FOOT = { x: S.hingeX - S.len * 0.9 - 2.2, z: S.z };
const TOP = { x: MD.sideLoad.x + 0.2, z: S.z };

export class VanLoading {
  constructor(game, van) {
    this.game = game;
    this.van = van;
    this.aboard = []; // [{ horse, stall }]
    this.seq = null; // { kind, horse, stall, path, i, a: { x, z, h }, wait }
    this._savedRef = null;
    this._setupInteractions();
  }

  get player() {
    return this.game.player;
  }
  get transport() {
    return this.game.player.transport;
  }
  get busy() {
    return !!this.seq;
  }
  isAboard(h) {
    return this.aboard.some((a) => a.horse === h);
  }
  freeStall() {
    for (let i = 0; i < MD.stalls.length; i++) if (!this.aboard.some((a) => a.stall === i)) return i;
    return -1;
  }

  // ---------- Interactions (bouton ACTION, à pied) ----------
  _setupInteractions() {
    const g = this.game;
    const v = this.van;
    const p = () => this.player;
    const idle = () => v.stopped && !v.driver && !this.seq && !p().human.carrying;
    const led = () => this.transport?.led?.horse || null;
    const side = new THREE.Vector3(), rear = new THREE.Vector3();
    // Chargement : cheval mené au pied du pont ouvert.
    g.interact.add('van-load', {
      label: '', icon: 'truck', r: 3.4, priority: 3, modes: ['foot'],
      getPos: () => v.sidePoint(side, 0.9),
      when: () => idle() && v.sideOpen && !!led() && !this.isAboard(led()) && this.freeStall() >= 0,
      action: () => this.load(led()),
    });
    // Déchargement : un cheval à bord, pont ouvert, mains libres.
    g.interact.add('van-unload', {
      label: '', icon: 'truck', r: 3.4, priority: 2.9, modes: ['foot'],
      getPos: () => v.sidePoint(side, 0.9),
      when: () => idle() && v.sideOpen && !led() && this.aboard.length > 0,
      action: () => this.unload(this.aboard[this.aboard.length - 1].horse),
    });
    // Pont latéral et volets.
    g.interact.add('van-side', {
      label: '', icon: 'truck', r: 2.8, priority: 1.6, modes: ['foot'],
      getPos: () => v.sidePoint(side, 0.2),
      when: () => idle() && (v.sideDoor.target === 1 ? v.sideDoor.t >= 1 : v.sideDoor.t <= 0) && !(v.sideDoor.target === 1 && led() && this.freeStall() >= 0),
      action: () => this.toggleSide(),
    });
    // Porte arrière (sellerie).
    g.interact.add('van-rear', {
      label: '', icon: 'truck', r: 2.4, priority: 1.5, modes: ['foot'],
      getPos: () => v.rearPoint(rear, 0.9),
      when: () => idle() && (v.rearDoor.target === 1 ? v.rearDoor.t >= 1 : v.rearDoor.t <= 0),
      action: () => {
        v.setRear(v.rearDoor.target !== 1);
        this._persist();
      },
    });
    this._its = ['van-load', 'van-unload', 'van-side', 'van-rear'].map((id) => g.interact.list.get(id));
  }

  toggleSide() {
    const v = this.van;
    const open = v.sideDoor.target !== 1;
    if (!v.setSide(open)) return false;
    if (open) this.game.hud.toast(t('Pont latéral baissé : amène ton cheval en main au pied du pont.'));
    this._persist();
    return true;
  }

  _labels() {
    const [load, unload, side, rear] = this._its;
    const v = this.van;
    const h = this.transport?.led?.horse;
    load.label = h ? T`Faire monter ${h.name || t('le cheval')}` : '';
    const last = this.aboard[this.aboard.length - 1]?.horse;
    unload.label = last ? T`Faire descendre ${last.name || t('le cheval')}` : '';
    side.label = v.sideDoor.target === 1 ? t('Fermer le pont latéral') : t('Ouvrir le pont latéral');
    rear.label = v.rearDoor.target === 1 ? t('Fermer la porte arrière') : t('Ouvrir la porte arrière');
  }

  // ---------- Séquences ----------
  canLoad(h) {
    const v = this.van;
    return !!h && v.sideOpen && v.stopped && !v.driver && !this.seq && !this.isAboard(h) && this.freeStall() >= 0;
  }

  load(h, { fast = false } = {}) {
    if (!this.canLoad(h)) return false;
    const stall = this.freeStall();
    const st = MD.stalls[stall];
    const v = this.van;
    this.transport?.release(true);
    // Départ : là où se trouve le cheval (ramené dans l'axe du pont s'il est de travers).
    const l = v.toLocal(h.pos.x, h.pos.z);
    const a = { x: Math.min(l.x, FOOT.x), z: l.z, h: wrapAngle(h.heading - v.heading) };
    const path = [
      { x: FOOT.x, z: FOOT.z },
      { x: TOP.x, z: TOP.z },
      { x: st.x, z: S.z }, // dans le box, encore de travers
      { x: st.x, z: st.z, h: 0, turn: true }, // pivote face à la route et recule dans la stalle
    ];
    this._begin('load', h, stall, a, path);
    if (fast) this.finishSequence();
    return true;
  }

  unload(h, { fast = false } = {}) {
    const ab = this.aboard.find((x) => x.horse === h);
    const v = this.van;
    if (!ab || !v.sideOpen || this.seq || this.player.mode !== 'foot') return false;
    if (this.transport?.led) this.transport.release(true);
    const st = MD.stalls[ab.stall];
    this._removeAboard(h);
    const path = [
      { x: st.x, z: S.z, h: -Math.PI / 2, turn: true }, // pivote vers le pont
      { x: TOP.x, z: TOP.z },
      { x: FOOT.x - 0.6, z: FOOT.z },
    ];
    this._begin('unload', h, ab.stall, { x: st.x, z: st.z, h: 0 }, path);
    if (fast) this.finishSequence();
    return true;
  }

  _begin(kind, h, stall, a, path) {
    const v = this.van;
    const p = this.player;
    this.seq = { kind, horse: h, stall, a, path, i: 0, wasPlayerHorse: h.isPlayerHorse };
    h.ai = null;
    h.frozen = false;
    h.isPlayerHorse = false;
    this._wrap(h);
    p.locked = true;
    v.interiorLight = true;
    this.game.bus.emit('van:seqStart', { kind, horse: h });
  }

  // Avance la séquence en cours jusqu'à la fin (tests, chargement de partie).
  finishSequence() {
    let n = 0;
    while (this.seq && n++ < 6000) this._stepSeq(1 / 30);
  }

  // Le cheval suit le chemin (repère du van) : marche vers chaque point, pivote sur place si demandé.
  _stepSeq(dt) {
    const s = this.seq;
    if (!s) return;
    const a = s.a;
    const pt = s.path[s.i];
    if (!pt) return this._end();
    const dx = pt.x - a.x, dz = pt.z - a.z;
    const d = Math.hypot(dx, dz);
    if (pt.turn) {
      // Pivot : cap d'abord, puis glissement court vers la stalle (au pas).
      const dh = wrapAngle(pt.h - a.h);
      if (Math.abs(dh) > 0.02) {
        a.h += Math.sign(dh) * Math.min(Math.abs(dh), TURN * dt);
        a.v = 0.4;
        return;
      }
      a.h = pt.h;
    } else if (d > 0.05) {
      // Cap vers le point (le cheval marche droit devant lui).
      const want = Math.atan2(dx, dz);
      a.h += clamp(wrapAngle(want - a.h), -TURN * 2 * dt, TURN * 2 * dt);
    }
    if (d <= 0.05) {
      s.i++;
      a.v = 0;
      if (s.i >= s.path.length) this._end();
      return;
    }
    const step = Math.min(d, WALK * dt);
    a.x += (dx / d) * step;
    a.z += (dz / d) * step;
    a.v = WALK;
  }

  _end(aborted = false) {
    const s = this.seq;
    if (!s) return;
    const g = this.game;
    const v = this.van;
    const h = s.horse;
    this.seq = null;
    this.player.locked = false;
    h.isPlayerHorse = s.wasPlayerHorse;
    h.anim.back = false;
    if (!g.horses.includes(h) || aborted) {
      this._unwrap(h);
      return;
    }
    const n = h.name || t('Le cheval');
    if (s.kind === 'load') {
      this._setAboard(h, s.stall);
      g.hud.toast(fem(h) ? T`${n} est attachée dans le van. Ferme le pont latéral avant de partir.` : T`${n} est attaché dans le van. Ferme le pont latéral avant de partir.`);
      g.audio.snort?.();
      g.bus.emit('van:loaded', h);
    } else {
      this._unwrap(h);
      h.hiddenInTruck = false;
      this.transport?.travelTack(h, false);
      v.groundPoint(s.a.x, s.a.z, _v);
      h.setPosition(_v.x, _v.z, v.heading + s.a.h);
      g.colliders.resolve(h.pos, 1, -Infinity);
      h.snapToGround?.();
      this.transport?.lead(h);
      g.hud.toast(fem(h) ? T`${n} est descendue du van.` : T`${n} est descendu du van.`);
      g.bus.emit('van:unloaded', h);
    }
    v.interiorLight = false;
    this._persist();
  }

  abortSequence() {
    if (this.seq) this._end(true);
  }

  // Hauteur de marche au point local : plancher du box, pont (de la charnière au sol), sinon le terrain.
  _surfaceY(xl, zl) {
    const v = this.van;
    const inBox = Math.abs(xl) < 1.12 && zl < 0.25 && zl > -3.1;
    if (inBox) return v.localToWorld(xl, MD.floor, zl, _v).y;
    v.groundPoint(xl, zl, _v);
    const gy = this.game.terrain.getHeight(_v.x, _v.z);
    const reach = S.len * 0.9;
    if (v.sideDoor.t >= 0.98 && xl <= S.hingeX && xl >= S.hingeX - reach - 0.1 && Math.abs(zl - S.z) < S.w / 2 + 0.3) {
      const k = clamp((S.hingeX - xl) / reach, 0, 1);
      return lerp(v.localToWorld(S.hingeX, MD.floor, S.z, _v).y, gy, k);
    }
    return gy;
  }

  // ---------- Mise à jour du cheval (en séquence, à bord) ----------
  _wrap(h) {
    if (h._vanProto) return;
    h._vanProto = Object.getPrototypeOf(h).update;
    h.update = (dt, camPos) => this._horseUpdate(h, dt, camPos);
  }
  _unwrap(h) {
    if (!h._vanProto) return;
    delete h.update;
    delete h._vanProto;
  }

  _horseUpdate(h, dt, camPos) {
    const v = this.van;
    const s = this.seq;
    if (s && s.horse === h) {
      const a = s.a;
      const wh = v.heading + a.h;
      const c = h.control;
      const moving = a.v > 0.05;
      c.x = Math.sin(wh);
      c.z = Math.cos(wh);
      c.mag = moving ? 0.3 : 0;
      c.speedOverride = moving ? a.v : 0;
      c.gallop = false;
      h.heading = wh;
      h.speed = clamp(h.speed, 0, a.v + 0.3);
      h._vanProto.call(h, dt, camPos);
      // Avant et arrière du cheval sur leur surface (pont incliné, plancher).
      const fx = Math.sin(a.h) * 0.75, fz = Math.cos(a.h) * 0.75;
      const yf = this._surfaceY(a.x + fx, a.z + fz), yh = this._surfaceY(a.x - fx, a.z - fz);
      v.groundPoint(a.x, a.z, h.pos);
      h.pos.y = (yf + yh) / 2;
      h.groundY = h.pos.y;
      h.heading = wh;
      h.mesh.position.copy(h.pos);
      h.mesh.rotation.set(-Math.atan2(yf - yh, 1.5), wh, 0);
      return;
    }
    const ab = this.aboard.find((x) => x.horse === h);
    if (!ab) {
      this._unwrap(h);
      return h.update(dt, camPos);
    }
    // À bord : posé dans sa stalle, suit la caisse ; mange au filet à l'arrêt.
    const st = MD.stalls[ab.stall];
    ab.eatT = (ab.eatT ?? 3) - dt;
    if (ab.eatT < 0) {
      ab.eating = !ab.eating;
      ab.eatT = ab.eating ? 4 + Math.random() * 6 : 2 + Math.random() * 3;
    }
    h.anim.graze = damp(h.anim.graze, ab.eating && v.stopped ? 0.3 : 0, 1.5, dt);
    h.ai = null;
    h.control.mag = 0;
    h.control.speedOverride = undefined;
    h.speed = 0;
    v.localToWorld(st.x, MD.floor, st.z, h.pos);
    h._vanProto.call(h, dt, camPos);
    v.localToWorld(st.x, MD.floor, st.z, h.pos);
    h.groundY = h.pos.y;
    h.heading = v.heading;
    h.mesh.position.copy(h.pos);
    v.body.getWorldQuaternion(_q);
    h.mesh.quaternion.copy(_q);
  }

  _setAboard(h, stall) {
    this.aboard.push({ horse: h, stall });
    h.hiddenInTruck = true; // dans un véhicule : ni monté, ni mené, ni sifflé
    h.ai = null;
    this.transport?.travelTack(h, true);
    this._wrap(h);
    this.van.setHorses(this.aboard.length);
  }
  _removeAboard(h) {
    const i = this.aboard.findIndex((a) => a.horse === h);
    if (i >= 0) this.aboard.splice(i, 1);
    this.van.setHorses(this.aboard.length);
  }

  // Embarquement / débarquement immédiats (chargement de partie, tests).
  loadInstant(h, stall = this.freeStall()) {
    if (!h || stall < 0 || this.isAboard(h)) return false;
    this.transport?.release(true);
    this._setAboard(h, stall);
    this._persist();
    return true;
  }
  unloadInstant(h) {
    if (!this.isAboard(h)) return false;
    this._removeAboard(h);
    this._unwrap(h);
    h.hiddenInTruck = false;
    this.transport?.travelTack(h, false);
    this.van.groundPoint(FOOT.x - 1, FOOT.z, _v);
    h.setPosition(_v.x, _v.z, this.van.heading - Math.PI / 2);
    this.game.colliders.resolve(h.pos, 1, -Infinity);
    this._persist();
    return true;
  }

  // ---------- Sauvegarde ----------
  _persist() {
    const d = this.game.save.data;
    const main = this.game.mainHorse;
    const a = main ? this.aboard.find((x) => x.horse === main) : null;
    d.van = { side: this.van.sideDoor.target, rear: this.van.rearDoor.target, aboard: a ? [{ id: main.def?.id || main.id, stall: a.stall }] : [] };
    this._savedRef = d;
    this.game.saveSoon?.();
  }

  // Nouvelle partie / chargement : état du van repris de la sauvegarde (absent des anciennes sauvegardes : fermé, vide).
  _sync() {
    const g = this.game;
    const d = g.save.data;
    if (this._savedRef === d) return;
    this._savedRef = d;
    if (this.seq) this.abortSequence();
    for (const a of [...this.aboard]) {
      this._removeAboard(a.horse);
      this._unwrap(a.horse);
      a.horse.hiddenInTruck = false;
      this.transport?.travelTack(a.horse, false);
    }
    const s = d.van;
    this.van.setPartsInstant(!!s?.side, !!s?.rear);
    const main = g.mainHorse;
    if (s && main && s.aboard?.some((x) => x.id === (main.def?.id || main.id)) && !this.transport?.isAboard(main)) this._setAboard(main, s.aboard[0].stall || 0);
  }

  // ---------- Mise à jour (appelée par Player à chaque image) ----------
  update(dt) {
    const g = this.game;
    if (g.state === 'play') this._sync();
    for (const a of [...this.aboard]) if (!g.horses.includes(a.horse)) this._removeAboard(a.horse);
    if (this.seq) {
      if (!g.horses.includes(this.seq.horse)) this.abortSequence();
      else this._stepSeq(dt);
    }
    // Cheval mené près du van : contourne la caisse (comme autour du camion).
    const l = this.transport?.led?.horse;
    if (l && !this.seq) this.van.pushOut(l.pos, 0.75);
    this.van.interiorLight = !!this.seq || this.van.sideDoor.t > 0 || this.van.rearDoor.t > 0;
    this._labels();
  }
}
