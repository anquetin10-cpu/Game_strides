// Defender 110 STRIDES (type stable « defender110_hero ») : véhicule personnel principal du personnage, distinct du
// camion Strides (Scania) et du van Master. Même dynamique que les autres véhicules (vehicle.js, caractéristiques
// « defender110_hero » de truckPhysics.js), modèle fourni (defenderModel.js) : roues et pivots de braquage du fichier,
// volant, quatre portes et coffre à ouverture latérale pilotés par le jeu (rotations des clips Open_*, une seule
// écriture par pièce), feux. Pas de cheval à bord : déplacements, rencontres et objets légers rangés dans le coffre.
// Pas de départ tant qu'une porte ou le coffre est ouvert ; le coffre ne s'ouvre pas en roulant.
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { DEFENDER_DIM, DEFENDER_ID, ACCESSES } from './defenderModel.js';
import { itemGeo } from './human.js';
import { SKIN_MAT } from './rig.js';
import { clamp } from '../core/math.js';
import { t } from '../core/i18n.js';

const ease = (k) => k * k * (3 - 2 * k);
const D = DEFENDER_DIM;
// Encombrement (même interface que CARS pour les collisions et les points d'accès) et caméra d'un 4x4.
const GEO = { L: D.L, W: D.W, H: D.H, zc: D.zc, seat: D.seat, camDist: 7.6, camHeight: 2.7 };
// Démultiplication de la direction (angle des roues → angle du volant).
const STEER_RATIO = 15;
const SIDE_DOORS = ['door_FL', 'door_FR', 'door_RL', 'door_RR'];
const _p = new THREE.Vector3();

export class Defender extends Vehicle {
  constructor(game, model, { x, z, heading = 0 } = {}) {
    super(game, { kind: DEFENDER_ID, x, z, heading, model, geo: GEO });
    this.M = model;
    this.ownModel = true; // roues et feux propres (pas ceux des effets de la circulation)
    this.instanceId = `${DEFENDER_ID}-1`;
    // Accès : avancement 0 (fermé) … 1 (ouvert), à la vitesse des clips du fichier ; auto : refermé tout seul.
    this.access = {};
    for (const a of ACCESSES) {
      this.access[a] = { t: 0, target: 0, rate: 1 / model.access[a].dur, auto: false };
      model.setAccess(a, 0);
    }
    this.paint = null;
    this.boot = null; // objet léger rangé dans le coffre (botte de foin, sac, selle…)
    this.sim.fuelL = this.sim.spec.tank * 0.85;
    this._lightsKey = '';
    this.wheelRoll = 0; // angle de roulement des roues (rad)
  }

  get label() {
    return t('Defender 110');
  }
  get camHeight() {
    return GEO.camHeight;
  }
  isOpen(a) {
    const s = this.access[a];
    return s.target === 1 || s.t > 0;
  }
  // Tout fermé : condition pour rouler.
  get closed() {
    return ACCESSES.every((a) => !this.isOpen(a));
  }

  // Ouverture / fermeture d'une porte ou du coffre ; renvoie vrai si l'ordre est pris en compte. Rien ne s'ouvre en
  // roulant. auto : la porte se referme d'elle-même une fois ouverte (montée, descente du conducteur).
  setAccess(a, open, { auto = false } = {}) {
    const s = this.access[a];
    if (!s) return false;
    if (open && !this.stopped) return false;
    if (s.target === (open ? 1 : 0)) return false;
    s.target = open ? 1 : 0;
    s.auto = !!(auto && open);
    this.game.audio?.truckDoor?.(open);
    return true;
  }
  // État posé immédiatement (chargement de partie, tests).
  setAccessInstant(state = {}) {
    for (const a of ACCESSES) {
      const s = this.access[a];
      s.t = s.target = state[a] ? 1 : 0;
      s.auto = false;
      this.M.setAccess(a, s.t);
    }
  }
  accessState() {
    const o = {};
    for (const a of ACCESSES) if (this.access[a].target) o[a] = 1;
    return o;
  }

  // Portière conducteur pilotée par la séquence de montée / descente (gameplay/boarding.js) : 0 fermée … 1 ouverte.
  cabDoorK() {
    return this.access.door_FL.t;
  }
  setCabDoor(k) {
    const s = this.access.door_FL;
    s.t = s.target = k;
    s.auto = false;
    this.M.setAccess('door_FL', k);
  }

  setPaint(css) {
    this.paint = css || null;
    this.M.setPaint(this.paint);
  }

  // Coffre : un objet léger posé sur le plancher (repère anchor_boot du fichier), solidaire de la caisse.
  storeInBoot(kind) {
    this.takeFromBoot();
    if (!kind) return;
    const m = new THREE.Mesh(itemGeo(kind), SKIN_MAT);
    m.name = `boot_${kind}`;
    m.castShadow = true;
    m.position.set(D.boot.x, 0.55 + 0.2, -D.boot.z + 0.1); // repère du fichier (arrière vers +Z)
    this.M.model.add(m);
    this.boot = kind;
    this._bootMesh = m;
  }
  takeFromBoot() {
    const k = this.boot;
    this._bootMesh?.parent?.remove(this._bootMesh);
    this._bootMesh = null;
    this.boot = null;
    return k;
  }

  // Point du repère de la caisse (x à gauche, z vers l'avant) → monde, au sol.
  groundPoint(xl, zl, out = { x: 0, y: 0, z: 0 }) {
    const h = this.sim.heading;
    out.x = this.pos.x + Math.sin(h) * zl + Math.cos(h) * xl;
    out.y = this.pos.y;
    out.z = this.pos.z + Math.cos(h) * zl - Math.sin(h) * xl;
    return out;
  }
  // Accès conducteur (gauche, side 1) ou passager : repères anchor_exit_* du fichier.
  doorPoint(side = 1, out = new THREE.Vector3()) {
    const e = side > 0 ? D.exitDriver : D.exitPassenger;
    return this.groundPoint(e.x, e.z, out);
  }
  // Devant une porte (milieu du battant, à 0,8 m du flanc) ou derrière le coffre.
  accessPoint(a, out = new THREE.Vector3()) {
    if (a === 'tailgate') return this.groundPoint(0, -D.L / 2 + D.zc - 0.9, out);
    const d = D.doors[a.slice(5)];
    return this.groundPoint(Math.sign(d.x) * (D.W / 2 + 0.8), d.z - 0.45, out);
  }

  // Descente du conducteur : repère de sortie conducteur s'il est libre, sinon côté passager, puis devant ou derrière
  // (obstacles du décor, autres véhicules, eau profonde) ; le véhicule lui-même n'est pas compté.
  exitPoint(out = new THREE.Vector3()) {
    const g = this.game;
    const fr = D.L / 2 + D.zc, rr = -D.L / 2 + D.zc;
    const cands = [
      [D.exitDriver.x, D.exitDriver.z], [D.exitDriver.x + 0.5, D.exitDriver.z], [D.exitDriver.x, D.exitDriver.z - 1.2],
      [D.exitPassenger.x, D.exitPassenger.z], [D.exitPassenger.x - 0.5, D.exitPassenger.z],
      [0.6, fr + 0.9], [0.6, rr - 0.9], [D.exitDriver.x + 1.4, D.exitDriver.z], [D.exitPassenger.x - 1.4, D.exitPassenger.z],
    ];
    const own = this.collider.enabled;
    this.collider.enabled = false;
    let found = null;
    for (const [xl, zl] of cands) {
      this.groundPoint(xl, zl, _p);
      const y = g.terrain.getHeight(_p.x, _p.z);
      let ok = Math.abs(y - this.pos.y) < 0.9 && g.terrain.waterDepth(_p.x, _p.z) < 0.15;
      for (let k = 0; ok && k < 5; k++) {
        const a = (k / 4) * Math.PI * 2;
        const r = k === 4 ? 0 : 0.32;
        if (g.colliders.blocked(_p.x + Math.cos(a) * r, _p.z + Math.sin(a) * r, y + 0.6)) ok = false;
      }
      for (const v of g.vehicles) {
        if (!ok) break;
        if (v === this || !v.pos || v.proxy) continue;
        if (Math.hypot(v.pos.x - _p.x, v.pos.z - _p.z) < 1.2) ok = false;
      }
      if (ok) {
        found = out.set(_p.x, y, _p.z);
        found.side = xl > 0 ? 1 : -1;
        break;
      }
    }
    this.collider.enabled = own;
    if (!found) {
      this.doorPoint(1, out);
      out.side = 1;
    }
    return out;
  }

  // Montée / descente du conducteur : la porte du bon côté s'ouvre puis se referme d'elle-même.
  onEnter() {
    this.setAccess('door_FL', true, { auto: true });
  }
  onExit(side = 1) {
    this.setAccess(side > 0 ? 'door_FL' : 'door_FR', true, { auto: true });
  }

  update(dt, ctrl, night = 0, camPos = null) {
    let c = ctrl;
    // Porte ou coffre ouvert : frein de parc serré, pas de départ (le volant reste libre). Les portes latérales se
    // ferment d'elles-mêmes à la demande d'accélérer ; le coffre se ferme à pied.
    if (ctrl && this.driver && !this.closed) {
      const bootOpen = this.isOpen('tailgate');
      if (Math.abs(ctrl.throttle) > 0.3) {
        for (const a of SIDE_DOORS) if (this.access[a].target === 1 && this.access[a].t >= 1) this.setAccess(a, false);
        this._blockT = (this._blockT || 0) + dt;
        if (bootOpen && this._blockT > 0.6 && this.game.time - (this._blockHint || -99) > 5) {
          this._blockHint = this.game.time;
          this.game.hud?.hint(t('Coffre ouvert : descends le fermer avant de rouler.'), 3500);
        }
      } else this._blockT = 0;
      c = { throttle: 0, steer: ctrl.steer, park: true };
    } else this._blockT = 0;
    const px = this.pos.x, pz = this.pos.z;
    super.update(dt, c, night, camPos);
    // Roulement : distance réellement parcourue le long de l'axe (marche arrière comprise ; roues immobiles contre
    // un obstacle).
    const h = this.sim.heading;
    this.wheelRoll += ((this.pos.x - px) * Math.sin(h) + (this.pos.z - pz) * Math.cos(h)) / D.wheelR;
    // Portes et coffre (vitesse des clips du fichier).
    for (const a of ACCESSES) {
      const s = this.access[a];
      if (s.t === s.target) continue;
      s.t = clamp(s.t + Math.sign(s.target - s.t) * s.rate * dt, 0, 1);
      this.M.setAccess(a, ease(s.t));
      if (s.t === s.target) {
        if (!s.target) this.game.audio?.latch?.();
        else if (s.auto) {
          s.auto = false;
          s.target = 0;
        }
      }
    }
    // Roues : roulement et braquage d'Ackermann sur chaque pivot avant ; roulement en -X local (repère du fichier
    // retourné).
    const W = this.M.wheels;
    for (const fw of W.front) {
      fw.steer.rotation.y = fw.side > 0 ? this.steerL : this.steerR;
      fw.spin.rotation.x = -this.wheelRoll;
    }
    for (const r of W.rears) r.spin.rotation.x = -this.wheelRoll;
    this.M.setSteeringWheel(this.sim.steer * STEER_RATIO);
    // Feux (matériaux du modèle et halos de nuit) : mis à jour seulement quand leur état change.
    const head = this.lightK > 0;
    const key = `${head}${this.braking}${this.reversing}${Math.round(night * 20)}`;
    if (key !== this._lightsKey) {
      this._lightsKey = key;
      this.M.lights.set(head, this.braking, this.reversing && !!this.driver, night);
    }
    // Intérieur seulement de près (ou au volant).
    const cam = this.game.camera.position;
    const d2 = (cam.x - this.pos.x) ** 2 + (cam.z - this.pos.z) ** 2;
    this.M.showInteriors(!!this.driver || d2 < 24 * 24);
    // Petits éléments de carrosserie : masqués au-delà de 45 m.
    this.M.setDetail(d2 < 45 * 45);
  }
}
