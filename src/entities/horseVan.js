// Van porte-chevaux « STX Renault Master » : véhicule conduisible distinct du camion Strides (Scania), même dynamique
// que les autres véhicules (vehicle.js, caractéristiques « master » de truckPhysics.js), avec son modèle fourni
// (masterModel.js) : roues et braquage du fichier, pont latéral droit et ses volets, porte arrière, feux. Les chevaux
// montent par le pont latéral (gameplay/vanLoading.js). Pas de départ tant que le pont ou la porte arrière est ouvert.
import { Vehicle } from './vehicle.js';
import { MASTER_DIM } from './masterModel.js';
import { clamp } from '../core/math.js';
import { t } from '../core/i18n.js';

const ease = (k) => k * k * (3 - 2 * k);
// Encombrement (même interface que CARS pour les collisions et les points d'accès).
const GEO = { L: MASTER_DIM.L, W: MASTER_DIM.W, H: MASTER_DIM.H, zc: MASTER_DIM.zc, seat: MASTER_DIM.seat, camDist: 10, camHeight: 3.4 };
// Durée d'ouverture des animations du fichier : 1,7 s.
const OPEN_RATE = 1 / 1.7;

export class HorseVan extends Vehicle {
  constructor(game, model, { x, z, heading = 0 } = {}) {
    super(game, { kind: 'master', x, z, heading, model, geo: GEO });
    this.M = model;
    this.ownModel = true; // roues et feux propres (pas ceux des effets de la circulation)
    this.sideDoor = { t: 0, target: 0 }; // pont latéral et volets
    this.rearDoor = { t: 0, target: 0 };
    this.partition = { t: 0, target: 0 }; // bas-flanc central (ouvert pour charger la stalle du fond)
    this.interiorLight = false;
    this.horses = 0;
    this.sim.fuelL = this.sim.spec.tank * 0.8;
    this._blink = 0;
    this._lightsKey = '';
    model.setSide(0);
    model.setRear(0);
    model.setPartition(0);
  }

  // Portière cabine pilotée par la séquence de montée / descente (gameplay/boarding.js).
  setCabDoor(k) {
    this.M.setCabDoor(k);
  }

  setPartition(open) {
    if (this.partition.target === (open ? 1 : 0)) return;
    this.partition.target = open ? 1 : 0;
    this.game.audio?.latch?.();
  }
  // Bas-flanc posé immédiatement (séquence accélérée, chargement de partie).
  setPartitionInstant(open) {
    this.partition.t = this.partition.target = open ? 1 : 0;
    this.M.setPartition(this.partition.t);
  }
  get partitionOpen() {
    return this.partition.target === 1 && this.partition.t >= 1;
  }
  get partitionClosed() {
    return this.partition.target === 0 && this.partition.t <= 0;
  }

  get label() {
    return t('Van Master STX');
  }
  get camHeight() {
    return GEO.camHeight;
  }
  get sideOpen() {
    return this.sideDoor.target === 1 && this.sideDoor.t >= 1;
  }
  get rearOpen() {
    return this.rearDoor.target === 1 && this.rearDoor.t >= 1;
  }
  // Fermé et verrouillé : condition pour rouler.
  get closed() {
    return this.sideDoor.target === 0 && this.sideDoor.t <= 0 && this.rearDoor.target === 0 && this.rearDoor.t <= 0;
  }

  setHorses(n) {
    this.horses = n;
    this.sim.horses = n;
  }

  // Ouverture / fermeture (à l'arrêt, personne au volant) ; renvoie vrai si l'ordre est pris en compte.
  setSide(open) {
    if (open && (!this.stopped || this.driver)) return false;
    if (this.sideDoor.target === (open ? 1 : 0)) return false;
    this.sideDoor.target = open ? 1 : 0;
    this.game.audio?.rampStart?.();
    this._rampCollider(open);
    return true;
  }

  // Pont latéral baissé : obstacle bas pour les piétons (on le contourne, le cheval y monte par sa séquence).
  _rampCollider(on) {
    const g = this.game, cs = g.colliders;
    const S = MASTER_DIM.side;
    const reach = S.len * 0.9;
    if (!this.rampCol) this.rampCol = cs.addBox(1e6, 1e6, reach / 2, S.w / 2, 0, -Infinity, `${this.id}-ramp`);
    const c = this.rampCol;
    const cells = (fn) => cs._cells(c.x - c.bound, c.z - c.bound, c.x + c.bound, c.z + c.bound, fn);
    cells((k) => {
      const l = cs.grid.get(k);
      const i = l ? l.indexOf(c) : -1;
      if (i >= 0) l.splice(i, 1);
    });
    const p = this.groundPoint(S.hingeX - reach / 2, S.z, { x: 0, y: 0, z: 0 });
    const h = this.sim.heading;
    c.x = on ? p.x : 1e6;
    c.z = on ? p.z : 1e6;
    c.rot = h;
    c.c = Math.cos(h);
    c.s = Math.sin(h);
    c.top = this.pos.y + 0.45;
    c.enabled = on;
    cells((k) => {
      if (!cs.grid.has(k)) cs.grid.set(k, []);
      cs.grid.get(k).push(c);
    });
  }
  setRear(open) {
    if (open && (!this.stopped || this.driver)) return false;
    if (this.rearDoor.target === (open ? 1 : 0)) return false;
    this.rearDoor.target = open ? 1 : 0;
    this.game.audio?.truckDoor?.(open);
    return true;
  }
  // Ouverture immédiate (chargement de partie, tests).
  setPartsInstant(side, rear) {
    this.partition.t = this.partition.target = 0;
    this.M.setPartition(0);
    if (!!side !== (this.sideDoor.target === 1)) this._rampCollider(!!side);
    this.sideDoor.t = this.sideDoor.target = side ? 1 : 0;
    this.rearDoor.t = this.rearDoor.target = rear ? 1 : 0;
    this.M.setSide(this.sideDoor.t);
    this.M.setRear(this.rearDoor.t);
  }

  // Point du repère de la caisse (x à gauche, z vers l'avant) → monde, au sol.
  groundPoint(xl, zl, out = { x: 0, y: 0, z: 0 }) {
    const h = this.sim.heading;
    out.x = this.pos.x + Math.sin(h) * zl + Math.cos(h) * xl;
    out.y = this.pos.y;
    out.z = this.pos.z + Math.cos(h) * zl - Math.sin(h) * xl;
    return out;
  }
  // Pied du pont latéral (au sol, `out` mètres plus loin que son bout).
  sidePoint(out, extra = 0.8) {
    const S = MASTER_DIM.side;
    return this.groundPoint(S.hingeX - S.len * 0.9 - extra, S.z, out);
  }
  // Devant la porte arrière.
  rearPoint(out, back = 1.3) {
    return this.groundPoint(0, -GEO.L / 2 + GEO.zc - back, out);
  }

  // Repousse un cercle hors de l'emprise du van (cheval mené, piéton) ; renvoie vrai en cas de contact.
  pushOut(p, r) {
    const l = this.toLocal(p.x, p.z);
    const hw = GEO.W / 2 + r, hd = GEO.L / 2 + r;
    const lz = l.z - GEO.zc;
    if (Math.abs(l.x) >= hw || Math.abs(lz) >= hd) return false;
    if (hw - Math.abs(l.x) < hd - Math.abs(lz)) l.x = Math.sign(l.x || 1) * hw;
    else l.z = GEO.zc + Math.sign(lz || 1) * hd;
    const h = this.sim.heading;
    p.x = this.pos.x + Math.sin(h) * l.z + Math.cos(h) * l.x;
    p.z = this.pos.z + Math.cos(h) * l.z - Math.sin(h) * l.x;
    return true;
  }

  update(dt, ctrl, night = 0, camPos = null) {
    let c = ctrl;
    // Pont ou porte ouvert : frein de parc serré, pas de départ (le volant reste libre).
    if (ctrl && this.driver && !this.closed) {
      if (Math.abs(ctrl.throttle) > 0.3) {
        this._blockT = (this._blockT || 0) + dt;
        if (this._blockT > 0.6 && this.game.time - (this._blockHint || -99) > 5) {
          this._blockHint = this.game.time;
          this.game.hud?.hint(t('Pont latéral ou porte arrière ouvert : descends et ferme-les avant de rouler.'), 3500);
        }
      } else this._blockT = 0;
      c = { throttle: 0, steer: ctrl.steer, park: true };
    } else this._blockT = 0;
    super.update(dt, c, night, camPos);
    // Pièces mobiles (vitesse des animations du fichier).
    for (const [p, apply] of [[this.sideDoor, (k) => this.M.setSide(k)], [this.rearDoor, (k) => this.M.setRear(k)]]) {
      if (p.t === p.target) continue;
      p.t = clamp(p.t + Math.sign(p.target - p.t) * OPEN_RATE * dt, 0, 1);
      apply(ease(p.t));
      if (p.t === p.target) this.game.audio?.[p.target ? 'rampDown' : 'rampShut']?.();
    }
    // Bas-flanc : pivote en ~1,2 s, loquet en fin de course.
    const pt = this.partition;
    if (pt.t !== pt.target) {
      pt.t = clamp(pt.t + Math.sign(pt.target - pt.t) * 0.85 * dt, 0, 1);
      this.M.setPartition(ease(pt.t));
      if (pt.t === pt.target) this.game.audio?.latch?.();
    }
    // Roues : roulement et braquage sur les pivots du fichier (roulement en -X local, avant du modèle vers -Z).
    const W = this.M.wheels;
    for (const fw of W.front) {
      fw.steer.rotation.y = fw.side > 0 ? this.steerL : this.steerR;
      fw.spin.rotation.x = -this.spin;
    }
    for (const r of W.rears) r.rotation.x = -this.spin;
    // Feux (matériaux du modèle) : mis à jour seulement quand leur état change.
    this._blink = (this._blink + dt) % 0.8;
    const head = this.lightK > 0, haz = !this.closed && this._blink < 0.4;
    const key = `${head}${this.braking}${haz}`;
    if (key !== this._lightsKey) {
      this._lightsKey = key;
      this.M.lights.set(head, head || this.sim.engineOn, this.braking, haz);
    }
    const im = this.M.interiorMat;
    const target = this.interiorLight ? 0.3 + night * 0.9 : 0;
    im.emissiveIntensity += (target - im.emissiveIntensity) * Math.min(1, dt * 6);
    // Intérieurs seulement de près (ou au volant).
    const cam = this.game.camera.position;
    this.M.showInteriors(!!this.driver || (cam.x - this.pos.x) ** 2 + (cam.z - this.pos.z) ** 2 < 26 * 26);
  }
}
