// Transport des chevaux : mener en main (longe), pont du camion, chargement / déchargement scénarisés,
// cheval attaché à bord (suit le camion, se balance, confort / stress), sauvegarde et reprise.
import * as THREE from 'three';
import { TRUCK_DIM } from '../entities/truckModel.js';
import { HOME } from '../world/sites.js';
import { angleDiff, clamp, damp, lerp, wrapAngle } from '../core/math.js';
import { CompetitionOffers } from './trip.js';
// Espace de noms : setHorseTack n'existe que dans les modèles de cheval qui savent changer d'équipement.
import * as HorseModel from '../entities/horseModel.js';

const D = TRUCK_DIM;
const ease = (t) => t * t * (3 - 2 * t);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const fem = (h) => (/comete|saphir|tornade/.test(h?.id || '') ? 'e' : '');

// ---------- Longe : tube souple entre la main et le licol ----------
class Rope {
  constructor(scene, color = '#22304a') {
    this.N = 18;
    this.R = 6;
    const nv = (this.N + 1) * this.R;
    this.pos = new Float32Array(nv * 3);
    this.nor = new Float32Array(nv * 3);
    const idx = [];
    for (let i = 0; i < this.N; i++) {
      for (let k = 0; k < this.R; k++) {
        const a = i * this.R + k, b = i * this.R + ((k + 1) % this.R);
        const c = a + this.R, d = b + this.R;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.pts = Array.from({ length: this.N + 1 }, () => new THREE.Vector3());
    this._t = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }
  hide() {
    this.mesh.visible = false;
  }
  // a → b avec flèche (mou) ; tail : longueur pendante sous la main (excédent de longe).
  set(a, b, slack = 0.25, tail = 0) {
    const N = this.N;
    const nt = tail > 0 ? 5 : 0;
    const d = a.distanceTo(b);
    const sag = Math.max(0.03, slack - d * 0.08);
    for (let i = 0; i <= N; i++) {
      const p = this.pts[i];
      if (i < nt) {
        // Boucle pendante sous la main.
        const k = 1 - i / nt;
        p.set(a.x + Math.sin(k * 2.2) * 0.06, a.y - tail * Math.sin(k * Math.PI * 0.5), a.z + Math.cos(k * 2.2) * 0.04);
      } else {
        const t = (i - nt) / (N - nt);
        p.lerpVectors(a, b, t);
        p.y -= sag * 4 * t * (1 - t);
      }
    }
    const r = 0.009;
    for (let i = 0; i <= N; i++) {
      const p = this.pts[i];
      const t = this._t.subVectors(this.pts[Math.min(N, i + 1)], this.pts[Math.max(0, i - 1)]).normalize();
      const n = this._n.set(0, 1, 0).cross(t);
      if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
      n.normalize();
      const bb = this._b.crossVectors(t, n);
      for (let k = 0; k < this.R; k++) {
        const ang = (k / this.R) * Math.PI * 2;
        const cx = Math.cos(ang), sx = Math.sin(ang);
        const j = (i * this.R + k) * 3;
        const nx = n.x * cx + bb.x * sx, ny = n.y * cx + bb.y * sx, nz = n.z * cx + bb.z * sx;
        this.nor[j] = nx;
        this.nor[j + 1] = ny;
        this.nor[j + 2] = nz;
        this.pos[j] = p.x + nx * r;
        this.pos[j + 1] = p.y + ny * r;
        this.pos[j + 2] = p.z + nz * r;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    this.mesh.visible = true;
  }
}

// ---------- Mener en main : le cheval marche à droite du meneur, à son pas ----------
export class LeadAI {
  constructor(getHandler) {
    this.getHandler = getHandler;
    this.lead = true;
  }
  update(h, dt) {
    const p = this.getHandler();
    if (!p) return;
    h.anim.graze = damp(h.anim.graze, 0, 5, dt);
    const hd = p.heading;
    const fx = Math.sin(hd), fz = Math.cos(hd);
    // Épaule gauche du cheval à hauteur du meneur : le centre du cheval est à sa droite, un peu en arrière.
    const tx = p.pos.x - Math.cos(hd) * 0.95 - fx * 0.55;
    const tz = p.pos.z + Math.sin(hd) * 0.95 - fz * 0.55;
    const dx = tx - h.pos.x, dz = tz - h.pos.z;
    const d = Math.hypot(dx, dz);
    const c = h.control;
    c.gallop = false;
    if (d < 0.4 && p.speed < 0.3) {
      // À l'arrêt : se ranger parallèlement au meneur.
      const diff = angleDiff(h.heading, hd);
      if (Math.abs(diff) > 0.35) {
        c.x = Math.sin(h.heading + Math.sign(diff) * 0.6);
        c.z = Math.cos(h.heading + Math.sign(diff) * 0.6);
        c.mag = 0.2;
        c.speedOverride = 0;
      } else c.mag = 0;
      return;
    }
    const sp = clamp(p.speed + d * 1.4, 0, 4.4);
    let ux = dx / (d || 1), uz = dz / (d || 1);
    if (d < 1.4 && p.speed > 0.4) {
      const k = d / 1.4;
      ux = lerp(fx, ux, k);
      uz = lerp(fz, uz, k);
    }
    c.x = ux;
    c.z = uz;
    c.mag = sp > 2.8 ? 0.6 : 0.3;
    c.speedOverride = sp;
  }
}

// Acteur scénarisé (repère local du camion : x à gauche, z vers l'avant, h = cap local).
class Actor {
  constructor() {
    this.x = 0;
    this.z = 0;
    this.h = 0;
    this.v = 0;
    this.hidden = false;
    this.back = false; // recule (cheval)
    this.graze = 0;
  }
}

export class Transport {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.led = null; // { horse, ai }
    this.aboard = []; // [{ horse, stall, sway, tie }]
    this.seq = null;
    this.comfort = 100;
    this.preferUnload = false;
    this.ropes = [new Rope(game.scene), new Rope(game.scene, '#3b2f22'), new Rope(game.scene, '#3b2f22')];
    this.cands = [];
    this._sec = null;
    this._main = null;
    this._hand = new THREE.Vector3();
    this._head = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._camOverride = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this._savedRef = null;
    this._stressT = 0;
    this._lastMood = 0;
    this._closeT = 0; // temps écoulé depuis la demande de fermeture du pont (zone à dégager)
    this._closeToast = false; // « prêt à partir » à afficher quand le pont est effectivement relevé
    this._setupInteractions();
    this.offers = new CompetitionOffers(game);
    game.bus.on('truck:bump', ({ speed }) => this._onBump(speed));
    game.bus.on('horse:step', ({ horse, n }) => this._onStep(horse, n));
  }

  get truck() {
    return this.player.truck;
  }
  get leading() {
    return !!this.led;
  }
  get controlsHuman() {
    return !!this.seq;
  }
  get busy() {
    return !!this.seq;
  }
  isAboard(h) {
    return this.aboard.some((a) => a.horse === h);
  }
  aboardOf(h) {
    return this.aboard.find((a) => a.horse === h);
  }
  freeStall() {
    for (let i = 0; i < D.stalls.length; i++) if (!this.aboard.some((a) => a.stall === i)) return i;
    return -1;
  }

  // ---------- Interactions (bouton ACTION + bouton secondaire) ----------
  _setupInteractions() {
    const g = this.game;
    g.interact.add('transport', {
      label: '',
      icon: 'hand',
      r: 1e9,
      priority: 0,
      modes: ['foot'],
      getPos: () => this.player.human.pos,
      when: () => !!this._main,
      action: () => this._main && this._run(this._main),
    });
    this._it = g.interact.list.get('transport');
  }

  _leadables() {
    const out = [];
    const ph = this.player.horse;
    if (ph) out.push(ph);
    for (const h of this.game.horses) if (h.leadable && h !== ph) out.push(h);
    return out;
  }

  // Candidats d'action selon le contexte (triés par priorité).
  _candidates() {
    const out = this.cands;
    out.length = 0;
    const p = this.player;
    const t = this.truck;
    if (p.mode !== 'foot' || this.seq || p.locked || p.human.carrying) return out;
    const hp = p.human.pos;
    const atRear = t && t.stopped && !t.driver && this._distRear(hp) < 2.9;
    if (this.led) {
      const h = this.led.horse;
      if (atRear && t.rampOpen && this.freeStall() >= 0 && this._distRear(h.pos) < 7) out.push({ id: 'load', label: 'Faire monter le cheval', icon: 'horse', prio: 3.2 });
      if (atRear && t.rampClosed) out.push({ id: 'open', label: 'Ouvrir la rampe', icon: 'down', prio: 2.9 });
      out.push({ id: 'release', label: 'Lâcher', icon: 'hand', prio: 1.0 });
    } else {
      if (atRear) {
        if (t.rampClosed) out.push({ id: 'open', label: 'Ouvrir la rampe', icon: 'down', prio: 2.9 });
        else if (t.rampOpen) {
          const loaded = this.aboard.length > 0;
          if (loaded && this.preferUnload) {
            out.push({ id: 'unload', label: 'Faire descendre le cheval', icon: 'horse', prio: 3.2 });
            out.push({ id: 'close', label: 'Fermer la rampe', icon: 'truck', prio: 3.0 });
          } else {
            out.push({ id: 'close', label: 'Fermer la rampe', icon: 'truck', prio: 3.2 });
            if (loaded) out.push({ id: 'unload', label: 'Faire descendre le cheval', icon: 'horse', prio: 3.0 });
          }
        }
      }
      const lh = this._nearLeadable(hp);
      if (lh) out.push({ id: 'lead', label: 'Mener en main', icon: 'horse', prio: 1.9, horse: lh });
    }
    out.sort((a, b) => b.prio - a.prio);
    return out;
  }

  _nearLeadable(hp) {
    let best = null, bd = 2.7;
    for (const h of this._leadables()) {
      // Pas de test de visibilité : elle dépend de la distance à la caméra (plans cinématiques, ouverture).
      if (h.rider || h.hiddenInTruck || this.isAboard(h) || (h.frozen && !h.leadable) || !h.mesh.parent) continue;
      const hx = h.pos.x + Math.sin(h.heading) * 1.1, hz = h.pos.z + Math.cos(h.heading) * 1.1;
      const d = Math.min(Math.hypot(hp.x - h.pos.x, hp.z - h.pos.z) + 0.4, Math.hypot(hp.x - hx, hp.z - hz));
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  _distRear(p) {
    const t = this.truck;
    const l = t.toLocal(p.x, p.z);
    const back = t.ramp.target === 1 ? D.hingeZ - 2.4 : D.hingeZ - 0.9;
    return Math.hypot(l.x * 0.7, l.z - back);
  }

  // Place derrière le camion (pont, recul du cheval, meneur) : aucun obstacle fixe sur ~4,5 m derrière la charnière.
  // Les points testés sont tous hors de la boîte de collision du camion lui-même.
  _rearClear() {
    const t = this.truck;
    const c = this.game.colliders;
    const y = t.pos.y + 1;
    for (let z = D.hingeZ - 0.35; z > D.hingeZ - 4.8; z -= 0.6) {
      for (let k = -1; k <= 1; k++) {
        t.groundPoint(k * 1.25, z, _u);
        if (c.blocked(_u.x, _u.z, y)) {
          this.game.hud.toast('Pas assez de place derrière le camion : avance de quelques mètres.');
          return false;
        }
      }
    }
    return true;
  }

  // Action secondaire pour le HUD (la principale passe par le système d'interactions).
  secondary() {
    const c = this.cands;
    if (!c.length) return null;
    const cur = this.game.interact.current;
    return cur && cur.id === 'transport' ? c[1] || null : c[0];
  }
  triggerSecondary() {
    const s = this._sec;
    if (s) this._run(s);
  }

  _run(c) {
    const g = this.game;
    const t = this.truck;
    switch (c.id) {
      case 'lead':
        this.lead(c.horse);
        break;
      case 'release':
        this.release();
        break;
      case 'open':
        if (!this._rearClear()) break;
        if (t.openRamp()) {
          t.hazard = true;
          this.preferUnload = this.aboard.length > 0;
          this._closeToast = false;
          this._persist();
        }
        break;
      case 'close':
        if (t.closeRamp()) {
          this._persist();
          // Le message attend que le pont soit relevé (fermeture ~3,5 s) : voir update().
          this._closeToast = this.aboard.length > 0;
        }
        break;
      case 'load':
        if (this.led && this._rearClear()) this.load(this.led.horse);
        break;
      case 'unload': {
        const a = this.aboard.find((x) => x.horse === this.player.horse) || this.aboard[this.aboard.length - 1];
        if (a && this._rearClear()) this.unload(a.horse);
        break;
      }
    }
  }

  // ---------- Mener en main ----------
  lead(h) {
    if (!h || this.isAboard(h) || this.seq) return false;
    if (this.led) this.release(true);
    const p = this.player;
    if (p.mode !== 'foot') return false;
    h.frozen = false;
    h.anim.graze = 0;
    const ai = new LeadAI(() => ({ pos: p.human.pos, heading: p.human.heading, speed: p.human.speed }));
    h.ai = ai;
    this.led = { horse: h, ai };
    this._wrap(h, 'led');
    this.game.audio.snort?.();
    this.game.bus.emit('transport:lead', h);
    return true;
  }

  release(silent = false) {
    const l = this.led;
    if (!l) return;
    this.led = null;
    const h = l.horse;
    if (h.ai === l.ai) {
      h.ai = null;
      h.control.mag = 0;
      h.control.speedOverride = undefined;
    }
    if (!this.isAboard(h) && !(this.seq && this.seq.horse === h)) this._unwrap(h);
    this.ropes[0].hide();
    if (!silent) this.game.bus.emit('transport:release', h);
  }

  // ---------- Remplacement de la mise à jour du cheval (mené, en séquence, à bord) ----------
  _wrap(h, mode) {
    h._tpMode = mode;
    if (h._tpProto) return;
    const proto = Object.getPrototypeOf(h).update;
    h._tpProto = proto;
    h.update = (dt, camPos) => this._horseUpdate(h, dt, camPos);
  }
  _unwrap(h) {
    if (!h._tpProto) return;
    delete h.update;
    delete h._tpProto;
    h._tpMode = null;
  }

  _horseUpdate(h, dt, camPos) {
    const mode = h._tpMode;
    if (mode === 'aboard') return this._aboardUpdate(h, dt, camPos);
    if (mode === 'seq') return this._seqHorseUpdate(h, dt, camPos);
    h._tpProto.call(h, dt, camPos);
    // Mené : contourne le camion, longe tendue entre la main et le licol.
    const t = this.truck;
    if (t && !this.seq) {
      t.pushOut(h.pos, 0.75);
      // La tête aussi (1,35 m devant le centre) : le museau ne traverse pas la porte arrière fermée.
      const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
      _u.set(h.pos.x + fx * 1.35, 0, h.pos.z + fz * 1.35);
      if (t.pushOut(_u, 0.3)) {
        h.pos.x = _u.x - fx * 1.35;
        h.pos.z = _u.z - fz * 1.35;
      }
    }
    if (this.led && this.led.horse === h) this._drawLead(h);
  }

  // Point du licol (anneau sous la ganache) : os dédié s'il existe, sinon tête avec décalage.
  _halter(h, out) {
    const b = h.bones || {};
    if (b.leadAnchor) {
      b.leadAnchor.updateWorldMatrix(true, false);
      return b.leadAnchor.getWorldPosition(out);
    }
    if (b.head) {
      h.mesh.updateMatrixWorld(true);
      return b.head.localToWorld(out.set(0, -0.3, 0.2));
    }
    return out.set(h.pos.x + Math.sin(h.heading) * 1.35, h.pos.y + 1.45, h.pos.z + Math.cos(h.heading) * 1.35);
  }
  _handPos(out) {
    const hu = this.player.human;
    const b = hu.bones || {};
    const bone = b.rHand || b.rFore;
    if (bone) {
      hu.mesh.updateMatrixWorld(true);
      return bone.localToWorld(out.set(0, b.rHand ? 0 : -0.3, 0.02));
    }
    return out.set(hu.pos.x - Math.cos(hu.heading) * 0.25, hu.pos.y + 0.95, hu.pos.z + Math.sin(hu.heading) * 0.25);
  }
  _drawLead(h) {
    this._handPos(this._hand);
    this._halter(h, this._head);
    if (this._hand.distanceTo(this._head) > 6) {
      this.release();
      this.game.hud.toast(`${h.name || 'Le cheval'} s’est détaché${fem(h)}.`);
      return;
    }
    this.ropes[0].set(this._hand, this._head, 0.35, 0.42);
  }

  // Bras du meneur : main droite tenant la longe (appelé après l'animation du personnage).
  afterHuman() {
    const hu = this.player.human;
    const s = this.seq;
    if (s) {
      const a = s.handler;
      this._place(a, _v, false);
      hu.pos.copy(_v);
      hu.mesh.position.copy(_v);
      hu.mesh.visible = !a.hidden && hu.mesh.visible;
    }
    const holding = (this.led && !s) || (s && s.holding);
    const b = hu.bones;
    // Squelettes récents (clavicules, poses par quaternions) : on laisse leur animation, la longe suit la main.
    if (holding && b && b.rArm && b.rFore && !b.rClav) {
      b.rArm.rotation.x = -0.45;
      b.rArm.rotation.z = -0.22;
      b.rFore.rotation.x = -0.75;
    }
  }

  // ---------- Chargement / déchargement : séquences scénarisées ----------
  canLoad(h) {
    const t = this.truck;
    return !!h && t && t.rampOpen && t.stopped && !t.driver && this.freeStall() >= 0 && !this.seq && !this.isAboard(h);
  }

  load(h, { fast = false } = {}) {
    if (!this.canLoad(h)) return false;
    const stall = this.freeStall();
    const it = this._loadScript(h, stall);
    this._beginSeq('load', h, stall, it);
    if (fast) this.finishSequence();
    return true;
  }

  unload(h, { fast = false } = {}) {
    const a = this.aboardOf(h);
    const t = this.truck;
    if (!a || !t.rampOpen || this.seq || this.player.mode !== 'foot') return false;
    if (this.led) this.release(true);
    const it = this._unloadScript(h, a.stall);
    this._beginSeq('unload', h, a.stall, it);
    if (fast) this.finishSequence();
    return true;
  }

  _beginSeq(kind, h, stall, it) {
    const g = this.game;
    const p = this.player;
    const t = this.truck;
    const handler = new Actor();
    const hl = t.toLocal(p.human.pos.x, p.human.pos.z);
    handler.x = hl.x;
    handler.z = hl.z;
    handler.h = wrapAngle(p.human.heading - t.heading);
    const horse = new Actor();
    const xl = t.toLocal(h.pos.x, h.pos.z);
    horse.x = xl.x;
    horse.z = xl.z;
    horse.h = wrapAngle(h.heading - t.heading);
    this.seq = { kind, horse: h, stall, it, handler, actor: horse, holding: kind === 'load', t: 0, wasPlayerHorse: h.isPlayerHorse };
    if (kind === 'unload') {
      const a = this.aboardOf(h);
      horse.x = D.stalls[stall].x;
      horse.z = D.stalls[stall].z;
      horse.h = 0;
      this.seq.tied = true;
      void a;
    }
    if (this.led && this.led.horse === h) {
      this.led = null;
      this.ropes[0].hide();
    }
    h.ai = null;
    h.frozen = false;
    h.isPlayerHorse = false;
    if (kind === 'load') this.travelTack(h, true);
    // Appuis des sabots reposés sous le cheval (à bord, ils datent d'avant le trajet : jambes tendues ~0,5 s).
    if (h.anim._a) h.anim._a.init = false;
    this._wrap(h, 'seq');
    p.locked = true;
    t.passThrough.add(h);
    t.collisionOff = true;
    t.interiorLight = true;
    // Caméra : plan arrière trois-quarts, côté porte de service.
    this._camPos.copy(g.camera.position);
    this._camLook.copy(t.localToWorld(0, 1.5, -3.5, _v));
    g.cam.override = this._camOverride;
    this._camOverride.pos.copy(g.camera.position);
    this._camOverride.look.copy(this._camLook);
    it.next();
    g.bus.emit('transport:seqStart', { kind, horse: h });
  }

  // Avance la séquence en cours jusqu'à la fin (tests, chargement de partie).
  finishSequence() {
    let n = 0;
    while (this.seq && n++ < 6000) this._stepSeq(1 / 30);
  }

  _stepSeq(dt) {
    const s = this.seq;
    if (!s) return;
    s.t += dt;
    const r = s.it.next(dt);
    if (r.done) this._endSeq();
  }

  _endSeq(aborted = false) {
    const s = this.seq;
    if (!s) return;
    const g = this.game;
    const p = this.player;
    const t = this.truck;
    const h = s.horse;
    this.seq = null;
    h.anim.back = false;
    t.collisionOff = false;
    t.passThrough.delete(h);
    t.setDoor(false);
    p.locked = false;
    p.human.hidden = false;
    // Joueur posé là où le script l'a laissé.
    const a = s.handler;
    this._place(a, _v, false);
    p.human.setPosition(_v.x, _v.z, t.heading + a.h);
    g.colliders.resolve(p.human.pos, 0.4, -Infinity);
    // Caméra : reprise derrière le joueur depuis le point de vue cinématique.
    g.cam.override = null;
    const cp = g.camera.position;
    const tx = p.human.pos.x, tz = p.human.pos.z, ty = p.human.pos.y + 1.55;
    const dd = Math.hypot(cp.x - tx, cp.z - tz);
    g.cam.yaw = Math.atan2(cp.x - tx, cp.z - tz);
    g.cam.pitch = clamp(Math.atan2(cp.y - ty, dd), -0.1, 1.1);
    g.cam.smoothTarget.copy(p.human.pos);
    g.cam.dist = Math.min(dd, 6);
    g.cam.lastManual = g.time;
    if (!g.horses.includes(h)) {
      this._unwrap(h);
      return;
    }
    h.isPlayerHorse = s.wasPlayerHorse;
    if (aborted) {
      this._unwrap(h);
      return;
    }
    if (s.kind === 'load') {
      this._setAboard(h, s.stall);
      this.preferUnload = false;
      g.hud.toast(`${h.name || 'Le cheval'} est attaché${fem(h)} dans le camion. Ferme la rampe.`);
      g.audio.snort?.();
      g.bus.emit('transport:loaded', h);
    } else {
      // Descendu : le cheval reste en main, là où le script l'a amené.
      this._unwrap(h);
      h.hiddenInTruck = false;
      this._place(s.actor, _w, true);
      h.setPosition(_w.x, _w.z, t.heading + s.actor.h);
      // Jamais dans un mur (camion garé près d'un bâtiment) : repoussé comme à l'embarquement immédiat.
      g.colliders.resolve(h.pos, 1, -Infinity);
      h.snapToGround();
      this.lead(h);
      g.hud.toast(`${h.name || 'Le cheval'} est descendu${fem(h)} du camion.`);
      g.bus.emit('transport:unloaded', h);
    }
    this._persist();
  }

  abortSequence() {
    if (this.seq) this._endSeq(true);
  }

  // Place un acteur (repère du camion) dans le monde : surface de marche (sol, pont, plancher).
  _place(a, out, horse) {
    const t = this.truck;
    if (horse) {
      const fx = Math.sin(a.h) * 0.75, fz = Math.cos(a.h) * 0.75;
      const yf = this._surfaceY(a.x + fx, a.z + fz);
      const yh = this._surfaceY(a.x - fx, a.z - fz);
      const y = (yf + yh) / 2;
      a.pitch = Math.atan2(yf - yh, 1.5);
      t.groundPoint(a.x, a.z, out);
      out.y = y;
      return out;
    }
    t.groundPoint(a.x, a.z, out);
    out.y = this._surfaceY(a.x, a.z);
    return out;
  }

  // Hauteur monde de la surface de marche au point local (x, z).
  _surfaceY(xl, zl) {
    const t = this.truck;
    const r = t.ramp;
    // Seuil de la porte de service : du plancher au sol en continu, par le marchepied (x ≈ -1,36), sans saut de 0,9 m.
    if (xl < -1.1 && xl > -2.0 && Math.abs(zl - (D.doorZ[0] + D.doorZ[1]) / 2) < 0.5) {
      const fy = t.localToWorld(xl, D.floor + 0.02, zl, _u).y;
      t.groundPoint(xl, zl, _u);
      return lerp(fy, this.game.terrain.getHeight(_u.x, _u.z), ease(clamp((-xl - 1.15) / 0.65, 0, 1)));
    }
    if (zl > D.hingeZ - 0.02 && Math.abs(xl) < 1.22) return t.localToWorld(xl, D.floor + 0.02, zl, _u).y;
    const ang = r.angle * ease(r.t);
    const reach = D.rampLen * Math.sin(ang);
    const dz = D.hingeZ - zl;
    if (r.t > 0.98 && dz >= 0 && dz <= reach && Math.abs(xl) < D.rampW / 2 + 0.35) {
      const k = dz / reach;
      const ry = t.localToWorld(xl, D.floor - 0.01 + Math.cos(ang) * D.rampLen * k + 0.03, zl, _u).y;
      // Bord latéral du pont : on l'enjambe en quelques pas plutôt que de tomber d'un coup.
      const e = (Math.abs(xl) - D.rampW / 2) / 0.35;
      if (e <= 0) return ry;
      t.groundPoint(xl, zl, _u);
      return lerp(ry, this.game.terrain.getHeight(_u.x, _u.z), ease(e));
    }
    t.groundPoint(xl, zl, _u);
    return this.game.terrain.getHeight(_u.x, _u.z);
  }

  // Cheval en séquence : animation de marche par la mise à jour d'origine, transformation imposée ensuite.
  _seqHorseUpdate(h, dt, camPos) {
    const s = this.seq;
    if (!s || s.horse !== h) {
      h._tpProto.call(h, dt, camPos);
      return;
    }
    const a = s.actor;
    const t = this.truck;
    const wh = t.heading + a.h;
    const c = h.control;
    const moving = a.v > 0.05;
    c.x = Math.sin(wh);
    c.z = Math.cos(wh);
    c.mag = moving ? 0.3 : 0;
    c.speedOverride = moving ? a.v : 0;
    c.gallop = false;
    h.heading = wh;
    h.speed = clamp(h.speed, 0, a.v + 0.3);
    h.anim.graze = damp(h.anim.graze, a.graze, 3, dt);
    // Reculer : le soutien ramène le sabot vers l'arrière (anim.js) ; inverser la phase le faisait avancer.
    h.anim.back = !!(a.back && moving);
    h._tpProto.call(h, dt, camPos);
    this._place(a, _w, true);
    h.pos.copy(_w);
    h.groundY = _w.y;
    h.heading = wh;
    h.mesh.position.copy(_w);
    h.mesh.rotation.set(-a.pitch, wh, 0);
    // Longe : main → licol (ou anneau d'attache).
    if (s.holding) {
      this._handPos(this._hand);
      this._halter(h, this._head);
      this.ropes[0].set(this._hand, this._head, 0.3, 0.35);
    } else if (s.tied) {
      this._halter(h, this._head);
      this.ropes[0].set(this._tieRing(s.stall, _v), this._head, 0.12, 0);
    } else this.ropes[0].hide();
  }

  _tieRing(stall, out) {
    return this.truck.localToWorld(D.stalls[stall].x, D.floor + 1.45, D.bulkZ - 0.08, out);
  }

  // Mise à jour du joueur pendant une séquence (appelée par Player avant l'animation).
  driveHuman(dt) {
    const s = this.seq;
    if (!s) return;
    this._stepSeq(dt);
    if (!this.seq) return;
    const a = s.handler;
    const hu = this.player.human;
    const t = this.truck;
    this._place(a, _v, false);
    hu.pos.copy(_v);
    hu.heading = t.heading + a.h;
    hu.speed = a.v;
    hu.hidden = a.hidden;
    // Caméra cinématique.
    const g = this.game;
    const cam = s.cam || { pos: [-3.4, 2.5, -10.8], look: [-0.3, 1.6, -3.4] };
    t.localToWorld(cam.pos[0], cam.pos[1], cam.pos[2], _w);
    // Bâtiment derrière le camion : le plan reste de ce côté-ci des murs (même principe que la caméra de suivi).
    const cs = g.colliders;
    t.localToWorld(0, cam.pos[1], D.hingeZ - 0.4, _u);
    for (let q = 0.1; q <= 1.001; q += 0.1) {
      _v.lerpVectors(_u, _w, q);
      if (cs.blocked(_v.x, _v.z, _v.y - 0.5)) {
        _w.lerpVectors(_u, _w, Math.max(0, q - 0.12));
        break;
      }
    }
    const k = 1 - Math.exp(-2.2 * dt);
    this._camOverride.pos.lerp(_w, k);
    t.localToWorld(cam.look[0], cam.look[1], cam.look[2], _w);
    this._camLook.lerp(_w, k);
    this._camOverride.look.copy(this._camLook);
    void g;
  }

  // ---- Générateurs de mouvement (un pas par image) ----
  // Marche vers (x, z) à la vitesse v ; stop = freine pour s'arrêter sur le point, sinon enchaîne.
  *_walk(a, x, z, v, { turn = 3, back = false, accel = 2.2, stop = true } = {}) {
    a.back = back;
    for (;;) {
      const dt = yield;
      const dx = x - a.x, dz = z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < (stop ? 0.04 : 0.22)) break;
      const want = back ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
      const diff = angleDiff(a.h, want);
      a.h = wrapAngle(a.h + clamp(diff, -turn * dt, turn * dt));
      const align = Math.max(0.15, Math.cos(diff));
      const target = (stop ? Math.min(v, Math.sqrt(2 * 2.4 * d) + 0.05) : v) * align;
      a.v += clamp(target - a.v, -accel * 2 * dt, accel * dt);
      const step = Math.min(d, Math.max(0, a.v) * dt);
      a.x += (dx / d) * step;
      a.z += (dz / d) * step;
    }
    if (stop) a.v = Math.min(a.v, 0.2);
    a.back = false;
  }
  *_stop(a, time = 0.4) {
    let t = 0;
    while (t < time) {
      const dt = yield;
      t += dt;
      a.v = Math.max(0, a.v - 3 * dt);
    }
    a.v = 0;
  }
  *_turn(a, h, rate = 1.6, pivot = null) {
    for (;;) {
      const dt = yield;
      const diff = angleDiff(a.h, h);
      if (Math.abs(diff) < 0.02) break;
      const step = clamp(diff, -rate * dt, rate * dt);
      if (pivot) {
        // Pivot autour d'un point (demi-tour sur les hanches).
        const px = a.x - pivot.x, pz = a.z - pivot.z;
        const c = Math.cos(step), sn = Math.sin(step);
        a.x = pivot.x + px * c + pz * sn;
        a.z = pivot.z - px * sn + pz * c;
      }
      a.h = wrapAngle(a.h + step);
      a.v = 0.55;
    }
    a.v = 0;
  }
  *_wait(time) {
    let t = 0;
    while (t < time) t += yield;
  }
  *_all(...gens) {
    let live = gens;
    for (;;) {
      const dt = yield;
      live = live.filter((gn) => !gn.next(dt).done);
      if (!live.length) break;
    }
  }
  _cam(pos, look) {
    if (this.seq) this.seq.cam = { pos, look };
  }

  // Chargement : approche, hésitation éventuelle, montée du pont, entrée dans la stalle, attache dans le couloir
  // de service, sortie du meneur par la porte de passage puis la porte de service (flanc droit).
  *_loadScript(h, stall) {
    const g = this.game;
    const t = this.truck;
    const s = this.seq;
    yield;
    const st = D.stalls[stall];
    const side = st.x < 0 ? 1 : -1; // meneur du côté du bat-flanc
    const lane = st.x * 1.12;
    const mx = lane + side * 0.55;
    const footZ = D.hingeZ - D.rampLen * Math.sin(t.ramp.angle);
    const doorZ = (D.doorZ[0] + D.doorZ[1]) / 2;
    const pdx = (D.passDoor[0] + D.passDoor[1]) / 2;
    const A = s.actor, M = s.handler;
    this._cam([-3.6, 2.6, -11.5], [-0.2, 1.4, -5.2]);
    // Approche : cheval dans l'axe de sa stalle, meneur à hauteur de l'épaule.
    yield* this._all(this._walk(A, lane, footZ - 2.3, 1.45, { turn: 2.4 }), this._walk(M, mx, footZ - 1.15, 1.5));
    yield* this._all(this._turn(A, 0, 1.8), this._turn(M, 0, 3.5));
    // Hésitation au pied du pont : le cheval flaire, baisse la tête, puis se décide.
    if (Math.random() < 0.65 || s.forceHesitate) {
      yield* this._all(this._walk(A, lane, footZ - 1.55, 1.0), this._walk(M, mx, footZ - 0.4, 1.0));
      A.v = 0;
      A.graze = 0.4;
      g.audio.snort?.();
      M.h = Math.PI * 0.85 * -side;
      yield* this._wait(0.7 + Math.random() * 0.9);
      A.graze = 0;
      M.h = 0;
      yield* this._wait(0.2);
    }
    // Montée au pas, le meneur devant l'épaule.
    this._cam([-3.2, 2.7, -9.8], [-0.2, 1.6, -3.8]);
    yield* this._all(this._walk(A, lane, D.hingeZ + 0.8, 1.0, { stop: false }), this._walk(M, mx, D.hingeZ + 1.9, 1.0, { stop: false }));
    // Entrée dans la stalle ; le meneur remonte à la tête puis passe dans le couloir de service.
    yield* this._all(this._walk(A, st.x, st.z, 0.85, { turn: 1.4 }), this._walk(M, st.x + side * 0.55, D.corridor - 0.25, 0.95, { stop: false }));
    yield* this._all(this._turn(A, 0, 1.4), this._walk(M, st.x + side * 0.25, D.bulkZ - 0.33, 0.8));
    yield* this._turn(M, 0, 5);
    // Attache à l'anneau.
    yield* this._wait(1.1);
    s.holding = false;
    s.tied = true;
    g.audio.latch?.();
    yield* this._wait(0.4);
    // Sortie : porte de passage, espace de vie, porte de service.
    this._cam([-6.6, 2.4, -5.0], [-0.9, 1.5, -1.4]);
    yield* this._walk(M, pdx, D.bulkZ - 0.25, 1.2, { stop: false });
    yield* this._walk(M, pdx, D.bulkZ + 0.3, 1.2, { stop: false });
    M.hidden = true;
    yield* this._walk(M, -0.75, doorZ, 1.3);
    t.setDoor(true);
    yield* this._wait(0.45);
    M.hidden = false;
    yield* this._walk(M, -1.05, doorZ, 1.0, { stop: false });
    yield* this._walk(M, -1.9, doorZ - 0.15, 1.1);
    t.setDoor(false);
    yield* this._turn(M, -Math.PI * 0.75, 4);
    yield* this._wait(0.2);
  }

  // Déchargement : le meneur entre par la porte de service, rejoint la tête par le couloir, détache,
  // puis fait reculer le cheval hors de sa stalle et le long du pont, en restant à sa tête.
  *_unloadScript(h, stall) {
    const g = this.game;
    const t = this.truck;
    const s = this.seq;
    yield;
    const A = s.actor, M = s.handler;
    const st = D.stalls[stall];
    const side = st.x < 0 ? 1 : -1;
    const doorZ = (D.doorZ[0] + D.doorZ[1]) / 2;
    const pdx = (D.passDoor[0] + D.passDoor[1]) / 2;
    const footZ = D.hingeZ - D.rampLen * Math.sin(t.ramp.angle);
    this._cam([-6.4, 2.6, -6.0], [-0.9, 1.5, -1.8]);
    // Vers la porte de service (en contournant l'arrière si besoin).
    if (M.x > -1.4) yield* this._walk(M, -1.95, Math.min(M.z, D.hingeZ - 0.5), 1.6, { stop: false });
    yield* this._walk(M, -1.95, doorZ, 1.6);
    t.setDoor(true);
    yield* this._wait(0.45);
    yield* this._walk(M, -0.75, doorZ, 1.0, { stop: false });
    M.hidden = true;
    t.setDoor(false);
    yield* this._walk(M, pdx, D.bulkZ + 0.3, 1.3, { stop: false });
    yield* this._walk(M, pdx, D.bulkZ - 0.3, 1.2, { stop: false });
    M.hidden = false;
    this._cam([-3.4, 2.6, -10.5], [-0.2, 1.5, -3.2]);
    yield* this._walk(M, st.x + side * 0.25, D.bulkZ - 0.33, 0.9);
    yield* this._turn(M, 0, 5);
    // Détacher.
    yield* this._wait(1.0);
    g.audio.latch?.();
    s.tied = false;
    s.holding = true;
    this._removeAboard(h);
    // Le meneur se place à la tête, côté bat-flanc, et fait reculer le cheval.
    yield* this._walk(M, st.x + side * 0.55, D.corridor - 0.25, 0.8);
    yield* this._turn(M, Math.PI, 5);
    const lane = st.x * 1.06;
    this._cam([-4.4, 2.4, -11.8], [0, 1.2, -5.0]);
    yield* this._all(this._walk(A, lane, D.hingeZ + 1.0, 0.62, { back: true, turn: 0.4 }), this._walk(M, lane + side * 0.6, D.hingeZ + 2.15, 0.62, { turn: 0.5 }));
    // Les postérieurs cherchent le pont : courte pause.
    A.v = 0;
    yield* this._wait(0.35 + Math.random() * 0.45);
    this._cam([-4.6, 2.2, -12], [0, 1.0, -6.2]);
    yield* this._all(this._walk(A, lane, footZ - 1.4, 0.68, { back: true, turn: 0.4 }), this._walk(M, lane + side * 0.6, footZ - 0.25, 0.68, { turn: 0.5 }));
    yield* this._all(this._stop(A, 0.4), this._stop(M, 0.3));
    // Le meneur se range à gauche de l'épaule pour repartir en main.
    yield* this._walk(M, lane + 0.95, footZ - 1.0, 0.8);
    yield* this._turn(M, Math.PI, 3);
  }

  // ---------- Tenue de voyage ----------
  // Licol seul pendant le transport ; la sellerie d'origine revient quand on remonte à cheval.
  // Sans effet si le modèle de cheval n'expose pas setHorseTack(mesh, { saddle, mounted, boots }).
  travelTack(h, on) {
    const set = HorseModel.setHorseTack;
    const part = h?.mesh?.userData?.tack;
    if (typeof set !== 'function' || !part) return;
    if (on) {
      if (!h._tpTack) {
        const c = part.userData?.cfg || {};
        h._tpTack = { saddle: c.saddle ?? true, boots: c.boots };
      }
      set(h.mesh, { saddle: false, mounted: false });
    } else if (h._tpTack) {
      set(h.mesh, { saddle: h._tpTack.saddle, boots: h._tpTack.boots });
      h._tpTack = null;
    }
  }

  // ---------- Cheval à bord ----------
  _setAboard(h, stall) {
    this.aboard.push({ horse: h, stall, sway: { x: 0, vx: 0, z: 0, vz: 0 }, eatT: 2 + Math.random() * 5, look: 0, lookT: 3 });
    h.hiddenInTruck = true;
    this.travelTack(h, true);
    h.ai = null;
    h.control.mag = 0;
    h.control.speedOverride = undefined;
    if (this.led && this.led.horse === h) {
      this.led = null;
      this.ropes[0].hide();
    }
    this._wrap(h, 'aboard');
    this.truck.setHorses(this.aboard.length);
    this._setStallTie(h, stall);
  }
  _removeAboard(h) {
    const i = this.aboard.findIndex((a) => a.horse === h);
    if (i >= 0) {
      this._clearStallTie(this.aboard[i].stall);
      this.aboard.splice(i, 1);
    }
    this.truck.setHorses(this.aboard.length);
  }
  _setStallTie(h, stall) {
    this._ties = this._ties || [];
    this._ties[stall] = h;
  }
  _clearStallTie(stall) {
    if (this._ties) this._ties[stall] = null;
    this.ropes[1 + stall]?.hide();
  }

  _aboardUpdate(h, dt, camPos) {
    const a = this.aboardOf(h);
    if (!a) {
      this._unwrap(h);
      return h.update(dt, camPos);
    }
    const t = this.truck;
    const s = t.sim;
    // Balancement : le corps s'oppose aux accélérations (repère du camion).
    const sw = a.sway;
    const kx = 38, cx = 7.5;
    sw.vx += (-kx * sw.x - cx * sw.vx + s.ay * 0.009 * 38) * dt;
    sw.x += sw.vx * dt;
    sw.vz += (-kx * sw.z - cx * sw.vz - s.ax * 0.007 * 38) * dt;
    sw.z += sw.vz * dt;
    sw.x = clamp(sw.x, -0.08, 0.08);
    sw.z = clamp(sw.z, -0.07, 0.07);
    // Vie à bord : mange au filet, tourne la tête vers la fenêtre.
    a.eatT -= dt;
    if (a.eatT < 0) {
      a.eatT = a.eating ? 4 + Math.random() * 8 : 2 + Math.random() * 3;
      a.eating = !a.eating;
    }
    a.lookT -= dt;
    if (a.lookT < 0) {
      a.lookT = 2 + Math.random() * 4;
      a.look = (Math.random() - 0.5) * 0.9;
    }
    h.anim.graze = damp(h.anim.graze, a.eating && t.stopped ? 0.32 : 0, 1.5, dt);
    h.anim.headYaw = damp(h.anim.headYaw || 0, a.look, 2, dt);
    h.ai = null;
    h.control.mag = 0;
    h.control.speedOverride = undefined;
    const st = D.stalls[a.stall];
    t.localToWorld(st.x + sw.x, D.floor + 0.02, st.z + sw.z, h.pos);
    h._tpProto.call(h, dt, camPos);
    // Pose imposée : position et orientation de la caisse, avec roulis/tangage d'équilibre.
    t.localToWorld(st.x + sw.x, D.floor + 0.02, st.z + sw.z, h.pos);
    h.groundY = h.pos.y;
    h.heading = t.heading;
    h.speed = 0;
    h.mesh.position.copy(h.pos);
    t.body.getWorldQuaternion(_q);
    _q2.setFromEuler(_e.set(sw.z * 0.25, 0, -sw.x * 0.35));
    h.mesh.quaternion.copy(_q).multiply(_q2);
    // Longe d'attache.
    this._halter(h, this._head);
    this.ropes[1 + a.stall].set(this._tieRing(a.stall, _v), this._head, 0.1, 0);
  }

  // Embarquement / débarquement immédiats (chargement de partie, cas de secours).
  loadInstant(h, stall = this.freeStall()) {
    if (!h || stall < 0 || this.isAboard(h)) return false;
    if (this.seq && this.seq.horse === h) this.abortSequence();
    this._setAboard(h, stall);
    this._persist();
    return true;
  }
  unloadInstant(h) {
    const a = this.aboardOf(h);
    if (!a) return false;
    this._removeAboard(h);
    this._unwrap(h);
    h.hiddenInTruck = false;
    const t = this.truck;
    const p = t.groundPoint(D.stalls[a.stall].x, D.hingeZ - 5.5, _v);
    h.setPosition(p.x, p.z, t.heading + Math.PI);
    this.game.colliders.resolve(h.pos, 1, -Infinity);
    h.snapToGround?.();
    this._persist();
    return true;
  }

  // ---------- Confort / stress du cheval pendant le trajet ----------
  _onBump(speed) {
    if (!this.aboard.length) return;
    this.comfort = Math.max(0, this.comfort - Math.min(30, 6 + speed * 1.5));
    for (const a of this.aboard) {
      a.sway.vx += (Math.random() - 0.5) * 1.2;
      a.sway.vz -= 0.8;
    }
    this.game.audio.neigh?.();
    this.game.cam.shake = 0.15;
    this.game.hud.toast(`Choc ! ${this.aboard[0].horse.name || 'Le cheval'} est secoué${fem(this.aboard[0].horse)}.`);
  }

  _updateComfort(dt) {
    const t = this.truck;
    const s = t.sim;
    if (!this.aboard.length) {
      this.comfort = Math.min(100, this.comfort + dt * 5);
      this.stress = 0;
      return;
    }
    const v = Math.abs(s.vx);
    const ax = Math.abs(s.ax), ay = Math.abs(s.ay), j = Math.abs(s.jerk);
    // Seuils : accélérations douces tolérées, à-coups et virages serrés stressants.
    let rate = 0;
    if (v > 0.3 || ax > 0.5) {
      // Repères du transport équin : rester sous ~0,2 g en accélération, freinage et virage.
      rate += 2.2 * Math.max(0, ax - 2.0) ** 2;
      rate += 2.8 * Math.max(0, ay - 2.0) ** 2;
      rate += 0.18 * Math.max(0, Math.min(j, 30) - 8);
      rate += s.soft * Math.max(0, v - 7) * 0.12;
    }
    this.stress = damp(this.stress || 0, rate, 4, dt);
    if (rate > 0) this.comfort = Math.max(0, this.comfort - rate * dt);
    else if (t.stopped) this.comfort = Math.min(100, this.comfort + dt * 0.5);
    // Réactions : le cheval s'agite.
    this._stressT -= dt;
    if (this.stress > 3 && this._stressT <= 0) {
      this._stressT = 6;
      this.game.audio.neigh?.();
      for (const a of this.aboard) a.sway.vx += (Math.random() - 0.5) * 0.8;
      if (this.game.time - this._lastMood > 25) {
        this._lastMood = this.game.time;
        const h = this.aboard[0].horse;
        this.game.hud.toast(`${h.name || 'Le cheval'} s’agite dans le camion — conduis plus en douceur.`);
      }
    }
  }

  // Sabots sur le pont et le plancher (sons dédiés pendant les séquences).
  _onStep(horse, n) {
    const s = this.seq;
    if (!s || s.horse !== horse) return;
    const a = this.game.audio;
    if (!a?.ctx) return;
    const zl = s.actor.z;
    const onRamp = zl < D.hingeZ && zl > D.hingeZ - D.rampLen - 0.3;
    const inside = zl >= D.hingeZ;
    const surf = onRamp ? 'ramp' : inside ? 'truck' : this.game.surfaceAt(horse.pos.x, horse.pos.z);
    for (let i = 0; i < n; i++) setTimeout(() => a.hoof(surf, 0.7), i * 40);
  }

  // Pont ou portillons en mouvement : les acteurs libres (joueur à pied, chevaux) sont repoussés vers l'arrière, hors
  // de la course de la pièce, comme poussés par elle — personne n'est traversé par le pont ni par un portillon.
  _sweep(dt) {
    const t = this.truck;
    const r = t.ramp, gs = t.gates;
    if (!r.moving && gs.t === gs.target) {
      this._closeT = 0;
      return;
    }
    const reach = D.rampLen * Math.sin(r.angle * ease(r.t));
    let eRamp = -Infinity, eGate = -Infinity;
    if (r.target === 1) {
      this._closeT = 0;
      if (r.moving) eRamp = D.hingeZ - reach * 1.2; // ombre du pont au sol, avec marge devant son bout
      else eGate = D.hingeZ - 1.35; // course des portillons, une fois le pont posé
    } else {
      // Fermeture : les portillons se replient d'abord ; pendant ce temps la zone s'étend vers l'arrière pour dégager
      // le pont avant qu'il ne se relève, puis elle suit son ombre.
      this._closeT += dt;
      eRamp = D.hingeZ - Math.min(reach * 1.2, this._closeT * 2);
      if (gs.t > 0) eGate = D.hingeZ - 1.35;
    }
    const p = this.player;
    if (p.mode === 'foot' && !this.seq) {
      const hu = p.human;
      if (this._sweepPush(hu.pos, 0, 0, hu.radius, eRamp, eGate)) hu.mesh.position.copy(hu.pos);
    }
    for (const h of this.game.horses) {
      if (h.hiddenInTruck || !h.mesh.parent || (this.seq && this.seq.horse === h)) continue;
      this._sweepPush(h.pos, h.heading, 0.45, h.radius, eRamp, eGate);
    }
  }
  // Cercle de collision (centre à `ahead` devant pos, rayon r) ramené derrière le bord (z local) de la zone du pont
  // (pleine largeur) ou de celle des portillons (de part et d'autre de l'axe). Renvoie vrai s'il a bougé.
  _sweepPush(pos, heading, ahead, r, eRamp, eGate) {
    const t = this.truck;
    const h = t.sim.heading;
    const dx = pos.x + Math.sin(heading) * ahead - t.pos.x, dz = pos.z + Math.cos(heading) * ahead - t.pos.z;
    const lz = dx * Math.sin(h) + dz * Math.cos(h);
    if (lz > D.hingeZ + 0.5) return false;
    const ax = Math.abs(dx * Math.cos(h) - dz * Math.sin(h));
    let want = Infinity;
    if (eRamp > -Infinity && ax < D.rampW / 2 + r) want = eRamp - r;
    if (eGate > -Infinity && ax > 0.3 && ax < 2.45 + r) want = Math.min(want, eGate - r);
    if (lz <= want) return false;
    const back = lz - want;
    pos.x -= Math.sin(h) * back;
    pos.z -= Math.cos(h) * back;
    return true;
  }

  // ---------- Sauvegarde ----------
  _persist() {
    const d = this.game.save.data;
    const main = this.game.mainHorse;
    const a = main ? this.aboardOf(main) : null;
    d.transport = { ramp: this.truck.ramp.target, aboard: a ? [{ id: main.def.id || main.id, stall: a.stall }] : [] };
    this._savedRef = d;
    this.game.saveSoon?.();
  }

  _sync() {
    const g = this.game;
    const d = g.save.data;
    if (this._savedRef === d) return;
    this._savedRef = d;
    const tr = d.transport;
    const main = g.mainHorse;
    // Nouvelle partie / chargement : état du camion repris de la sauvegarde.
    if (this.seq) this.abortSequence();
    if (this.led) this.release(true);
    for (const a of [...this.aboard]) {
      const h = a.horse;
      this._removeAboard(h);
      this._unwrap(h);
      h.hiddenInTruck = false;
      this.travelTack(h, false);
      if (h === main && !(tr && tr.aboard?.length)) {
        const p = d.pos?.horse || { x: HOME.horse.x, z: HOME.horse.z, heading: HOME.horse.rot };
        h.setPosition(p.x, p.z, p.heading ?? 0);
      }
    }
    const t = this.truck;
    if (!d.started || !d.pos) {
      t.setPosition(HOME.truck.x, HOME.truck.z, HOME.truck.rot);
      t.setRampInstant(false);
      t.hazard = false;
      this.comfort = 100;
      return;
    }
    t.setRampInstant(!!tr?.ramp);
    t.hazard = !!tr?.ramp;
    this._closeToast = false;
    if (tr && main && tr.aboard?.some((x) => x.id === (main.def.id || main.id))) {
      this._setAboard(main, tr.aboard[0].stall || 0);
      this.preferUnload = true;
    }
  }

  // ---------- Mise à jour (appelée par Player à chaque image) ----------
  update(dt) {
    const g = this.game;
    const t = this.truck;
    if (!t) return;
    if (g.state === 'play') this._sync();
    // Chevaux disparus (fin de mission, changement de cheval).
    for (const a of [...this.aboard]) {
      if (!g.horses.includes(a.horse)) {
        const wasMain = a.horse.isPlayerHorse || a.horse === this._lastMain;
        this._removeAboard(a.horse);
        if (wasMain && g.mainHorse && g.horses.includes(g.mainHorse) && !this.isAboard(g.mainHorse)) this._setAboard(g.mainHorse, a.stall);
        this._persist();
      }
    }
    this._lastMain = g.mainHorse;
    if (this.seq && !g.horses.includes(this.seq.horse)) this.abortSequence();
    if (this.led) {
      const h = this.led.horse;
      const p = this.player;
      if (!g.horses.includes(h) || h.ai !== this.led.ai || h.rider || p.mode !== 'foot') this.release(true);
    }
    // Longes d'attache visibles seulement à bord.
    for (let i = 0; i < 2; i++) if (!this.aboard.some((a) => a.stall === i) && !(this.seq && this.seq.stall === i && this.seq.tied)) this.ropes[1 + i].hide();
    if (!this.seq && !this.led) this.ropes[0].hide();
    // Éclairage et feux de détresse.
    t.interiorLight = !!this.seq || t.ramp.t > 0 || t.door.t > 0;
    if (t.rampClosed && !this.seq) {
      t.hazard = false;
      if (t.partition.target === 1) t.setPartition(false);
      if (this._closeToast) {
        this._closeToast = false;
        g.hud.toast('Rampe fermée — prêt à partir. Conduis en souplesse.');
      }
    }
    this._sweep(dt);
    this._updateComfort(dt);
    this.offers.update(dt);
    // Action principale et secondaire.
    const c = this._candidates();
    const it = this._it;
    this._main = c[0] || null;
    if (it) {
      it.label = this._main ? this._main.label : '';
      it.icon = this._main ? this._main.icon : 'hand';
      it.priority = this._main ? this._main.prio : 0;
    }
    this._sec = this.secondary();
  }
}
