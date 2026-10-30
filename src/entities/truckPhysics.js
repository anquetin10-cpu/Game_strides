// Dynamique du camion porte-chevaux 7,5 t (sans three.js, testable) : moteur diesel et courbe de couple,
// boîte automatique 6 rapports, résistances, freins, frein moteur, direction asservie à la vitesse,
// modèle cinématique à basse vitesse fondu dans un modèle bicyclette avec adhérence limitée des pneus.
// Repère : cap h (avant = (sin h, cos h)), gauche = (cos h, -sin h). Lacet r > 0 : virage à gauche.
import { t } from '../core/i18n.js';

export const TRUCK_SPEC = {
  massEmpty: 5500, // kg, porteur 7,5 t carrossé, à vide
  massHorse: 600, // kg par cheval embarqué
  zFront: 2.75, // essieu avant (repère du camion, origine au centre)
  zRear: -1.45, // essieu arrière → empattement 4,2 m
  track: 1.95,
  cgEmpty: 0.62, // centre de gravité à vide (z)
  cgHeight: 1.25,
  wheelR: 0.385, // 225/75 R17.5
  idle: 650,
  maxRpm: 2550, // régulateur
  cutRpm: 2700,
  // Diesel 4 cylindres 5,1 l, 210 ch : couple max 750 N·m de 1 200 à 1 700 tr/min.
  torque: [[400, 250], [650, 380], [800, 520], [1000, 650], [1200, 750], [1700, 750], [2000, 705], [2300, 645], [2550, 520], [2700, 0]],
  maxTorque: 750,
  // Carburant : réservoir de 150 l, gazole ; consommation = frottements internes (proportionnels au régime, 1 l/h au
  // ralenti) + puissance fournie × consommation spécifique (195 g/kWh) : ~25 l/100 km à 90 km/h chargé.
  fuel: 'diesel', tank: 150, idleLph: 1.0, bsfc: 195, refL100: 24,
  gears: [6.58, 3.81, 2.29, 1.48, 1.0, 0.73],
  gearTorque: [0.42, 0.5, 0.8, 1, 1, 1], // part du couple maxi autorisée par rapport
  reverse: 6.04,
  final: 4.1,
  eff: 0.9,
  shiftTime: 0.42,
  // Boîte automatique : régimes de passage (montée et descente selon la charge, descente au freinage), démarrage en
  // 2e (1re en forte côte), régime de patinage de l'embrayage au démarrage, frein moteur (N·m).
  shiftUp: [1450, 2250],
  shiftDown: [900, 1320],
  shiftDownBrake: 1150,
  startGear: 2,
  launch: [800, 1250],
  engineBrake: [40, 0.06],
  holdRpm: 300, // montée de régime au point mort sous l'accélérateur
  beep: true, // bip de recul (poids lourd)
  crr: 0.0085, // pneus poids lourd sur enrobé
  crrSoft: 0.035, // herbe, terre
  cdA: 6.6, // Cx ≈ 0,8 × 8,3 m²
  rho: 1.2,
  brakeDecel: 6.8, // m/s² à fond (freinage d'urgence)
  mu: 0.85,
  muSoft: 0.55,
  maxSteer: 0.66, // 38° aux roues
  steerRate: 0.62, // rad/s (assistance hydraulique)
  aLatSteer: 3.6, // braquage maxi du joystick limité par l'accélération latérale visée
  limiter: 25, // 90 km/h (limiteur légal > 3,5 t)
  cornerF: 7.0, // rigidité de dérive par newton de charge (1/rad), avant
  cornerR: 9.5, // jumelage arrière, plus rigide
};

// Autres véhicules conduisibles (même modèle physique, caractéristiques de séries réelles) : citadine essence, berline
// et SUV diesel à boîte automatique, tracteur agricole à inverseur sous charge. Essieux aux positions des modèles 3D.
const CAR_BASE = {
  brakeRise: 9, // freins hydrauliques (≈ 0,1 s) ; air comprimé sur le camion
  massHorse: 0, gearTorque: [1, 1, 1, 1, 1, 1], eff: 0.92, rho: 1.2, beep: false, startGear: 1,
};
export const VEHICLE_SPECS = {
  // Citadine type Clio V 1.0 TCe 90 (3 cylindres essence), 160 N·m, boîte 5 : 0-100 km/h 12,2 s, 178 km/h.
  clio: {
    ...CAR_BASE, name: t('Citadine'), massEmpty: 1240, zFront: 1.2915, zRear: -1.2915, track: 1.51, cgEmpty: 0.25, cgHeight: 0.55, wheelR: 0.31,
    idle: 800, maxRpm: 6200, cutRpm: 6500, fuel: 'petrol', tank: 42, idleLph: 0.45, bsfc: 240, refL100: 5.5, cyl: 3, drive: 'front',
    torque: [[700, 90], [1500, 140], [2250, 160], [3500, 160], [4500, 150], [5500, 128], [6200, 105], [6500, 0]], maxTorque: 160,
    gears: [3.73, 2.05, 1.39, 1.03, 0.82], reverse: 3.55, final: 4.21, shiftTime: 0.45,
    crr: 0.011, crrSoft: 0.045, cdA: 0.68, brakeDecel: 9.5, mu: 1.0, muSoft: 0.6,
    maxSteer: 0.49, steerRate: 1.8, aLatSteer: 7, limiter: 50, cornerF: 9.5, cornerR: 11,
    shiftUp: [2200, 5800], shiftDown: [1300, 2800], shiftDownBrake: 1700, launch: [1100, 1900], engineBrake: [12, 0.006], holdRpm: 1500,
  },
  // Compacte type Golf 8 1.5 TSI 130 (4 cylindres essence), 200 N·m de 1 400 à 4 000 tr/min, boîte 6 :
  // 0-100 km/h 9,2 s, 214 km/h.
  golf: {
    ...CAR_BASE, name: t('Compacte'), massEmpty: 1355, zFront: 1.318, zRear: -1.318, track: 1.55, cgEmpty: 0.25, cgHeight: 0.55, wheelR: 0.316,
    idle: 750, maxRpm: 6000, cutRpm: 6300, fuel: 'petrol', tank: 50, idleLph: 0.5, bsfc: 235, refL100: 5.6, cyl: 4, drive: 'front',
    torque: [[700, 110], [1400, 200], [4000, 200], [5000, 182], [6000, 150], [6300, 0]], maxTorque: 200,
    gears: [3.77, 2.09, 1.47, 1.1, 0.88, 0.71], reverse: 3.6, final: 3.94, shiftTime: 0.35,
    crr: 0.01, crrSoft: 0.045, cdA: 0.61, brakeDecel: 9.8, mu: 1.0, muSoft: 0.6,
    maxSteer: 0.5, steerRate: 1.8, aLatSteer: 7.5, limiter: 60, cornerF: 10, cornerR: 12,
    shiftUp: [2100, 5600], shiftDown: [1200, 2600], shiftDownBrake: 1600, launch: [1100, 2000], engineBrake: [12, 0.007], holdRpm: 1500,
  },
  // Berline type 508 II 1.5 BlueHDi 130 (diesel), 300 N·m, automatique 8 rapports : 0-100 km/h 10 s, ~208 km/h.
  p508: {
    ...CAR_BASE, name: t('Berline'), massEmpty: 1505, zFront: 1.3965, zRear: -1.3965, track: 1.6, cgEmpty: 0.25, cgHeight: 0.52, wheelR: 0.335,
    idle: 800, maxRpm: 4500, cutRpm: 4800, fuel: 'diesel', tank: 55, idleLph: 0.5, bsfc: 210, refL100: 4.6, cyl: 4, drive: 'front', gearTorque: [1, 1, 1, 1, 1, 1, 1, 1],
    torque: [[700, 150], [1000, 210], [1500, 280], [1750, 300], [2750, 300], [3750, 260], [4500, 200], [4800, 0]], maxTorque: 300,
    gears: [5.25, 3.03, 1.95, 1.46, 1.22, 1.0, 0.81, 0.67], reverse: 4.4, final: 2.9, shiftTime: 0.2,
    crr: 0.01, crrSoft: 0.045, cdA: 0.6, brakeDecel: 9.8, mu: 1.0, muSoft: 0.6,
    maxSteer: 0.5, steerRate: 1.7, aLatSteer: 7.5, limiter: 57.8, cornerF: 10, cornerR: 12,
    shiftUp: [1500, 3900], shiftDown: [1050, 2000], shiftDownBrake: 1300, launch: [1000, 1800], engineBrake: [15, 0.008], holdRpm: 1200,
  },
  // SUV type 3008 II 1.5 BlueHDi 130 (diesel), 300 N·m, automatique 8 rapports : 0-100 km/h ~11,5 s, 192 km/h.
  p3008: {
    ...CAR_BASE, name: t('SUV'), massEmpty: 1570, zFront: 1.3375, zRear: -1.3375, track: 1.6, cgEmpty: 0.25, cgHeight: 0.62, wheelR: 0.352,
    idle: 800, maxRpm: 4500, cutRpm: 4800, fuel: 'diesel', tank: 53, idleLph: 0.5, bsfc: 210, refL100: 5.2, cyl: 4, drive: 'front', gearTorque: [1, 1, 1, 1, 1, 1, 1, 1],
    torque: [[700, 150], [1000, 210], [1500, 280], [1750, 300], [2750, 300], [3750, 260], [4500, 200], [4800, 0]], maxTorque: 300,
    gears: [5.25, 3.03, 1.95, 1.46, 1.22, 1.0, 0.81, 0.67], reverse: 4.4, final: 2.8, shiftTime: 0.25,
    crr: 0.011, crrSoft: 0.045, cdA: 0.84, brakeDecel: 9.3, mu: 0.97, muSoft: 0.62,
    maxSteer: 0.5, steerRate: 1.6, aLatSteer: 6.8, limiter: 53.3, cornerF: 9.5, cornerR: 11,
    shiftUp: [1500, 3900], shiftDown: [1050, 2000], shiftDownBrake: 1300, launch: [1000, 1800], engineBrake: [16, 0.009], holdRpm: 1200,
  },
  // SUV 4x4 type Duster II 1.5 Blue dCi 115 (diesel), 260 N·m à 1 750 tr/min, boîte 6 à première courte, 4 roues
  // motrices : 0-100 km/h ~11,5 s, ~170 km/h ; bonne motricité hors route.
  duster: {
    ...CAR_BASE, name: t('SUV 4x4'), massEmpty: 1485, zFront: 1.338, zRear: -1.338, track: 1.56, cgEmpty: 0.2, cgHeight: 0.68, wheelR: 0.345,
    idle: 780, maxRpm: 4300, cutRpm: 4600, fuel: 'diesel', tank: 50, idleLph: 0.5, bsfc: 215, refL100: 5.8, cyl: 4, awd: true,
    torque: [[700, 130], [1000, 190], [1500, 245], [1750, 260], [2500, 260], [3500, 225], [4300, 170], [4600, 0]], maxTorque: 260,
    gears: [4.45, 2.59, 1.66, 1.17, 0.9, 0.73], reverse: 4.2, final: 3.6, shiftTime: 0.35,
    crr: 0.012, crrSoft: 0.04, cdA: 1.0, brakeDecel: 9.0, mu: 0.95, muSoft: 0.72,
    maxSteer: 0.5, steerRate: 1.6, aLatSteer: 6.5, limiter: 50, cornerF: 9, cornerR: 10.5,
    shiftUp: [1500, 3800], shiftDown: [1050, 2000], shiftDownBrake: 1350, launch: [950, 1700], engineBrake: [18, 0.01], holdRpm: 1100,
  },
  // Tracteur 110 ch (4 cylindres diesel 4,5 l), 480 N·m, inverseur et 6 rapports sous charge, 40 km/h, 4 roues motrices.
  tractor: {
    ...CAR_BASE, name: t('Tracteur'), massEmpty: 5600, zFront: 1.55, zRear: -0.95, track: 1.9, cgEmpty: 0.15, cgHeight: 1.1, wheelR: 0.82, wheelRFront: 0.52,
    idle: 850, maxRpm: 2200, cutRpm: 2350, fuel: 'diesel', tank: 160, idleLph: 1.1, bsfc: 220, refL100: 22, cyl: 4, awd: true,
    torque: [[700, 250], [1000, 400], [1400, 480], [1600, 480], [2000, 410], [2200, 350], [2350, 0]], maxTorque: 480,
    gears: [5.2, 3.6, 2.5, 1.7, 1.25, 1.0], reverse: 4.5, final: 17, shiftTime: 0.35,
    crr: 0.025, crrSoft: 0.05, cdA: 4.0, brakeDecel: 5.5, mu: 0.8, muSoft: 0.75,
    maxSteer: 0.75, steerRate: 0.9, aLatSteer: 3.2, limiter: 11.2, cornerF: 6, cornerR: 8,
    shiftUp: [1500, 2050], shiftDown: [1000, 1400], shiftDownBrake: 1200, launch: [950, 1300], engineBrake: [30, 0.05], holdRpm: 600,
  },
};

const G = 9.81;
// Masse volumique des carburants (kg/l).
export const FUEL_DENSITY = { diesel: 0.835, petrol: 0.745 };
const RPM_K = 60 / (2 * Math.PI);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function torqueAt(spec, rpm) {
  const c = spec.torque;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const [r0, t0] = c[i - 1];
      const [r1, t1] = c[i];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return 0;
}

export class TruckSim {
  constructor(spec = TRUCK_SPEC) {
    this.spec = spec;
    this.pos = { x: 0, y: 0, z: 0 }; // centre du camion (remplacé par un Vector3 par l'entité)
    this.heading = 0;
    this.horses = 0;
    this.reset();
  }

  reset() {
    this.vx = 0; // vitesse longitudinale (m/s), < 0 en marche arrière
    this.vy = 0; // vitesse latérale au centre de gravité (gauche +)
    this.r = 0; // lacet (rad/s)
    this.steer = 0; // angle des roues avant (gauche +)
    this.rpm = 0;
    this.gear = this.spec.startGear; // 1..n, -1 marche arrière
    this.shiftT = 0;
    this.shiftTo = this.gear;
    this.clutch = 0;
    this.sinceShift = 10;
    this.throttle = 0;
    this.brake = 0;
    this.ax = 0;
    this.ay = 0;
    this.jerk = 0;
    this.engineOn = false;
    this.slope = 0; // pente (sinus), > 0 en montée
    this.soft = 0; // 0 = route, 1 = terrain meuble
    this.revT = 0;
    this.shifted = 0; // +1 / -1 : changement de rapport survenu ce pas (pour le son)
    this.load = 0; // charge moteur 0..1
    this.wheelSpin = 0;
    this.braking = false;
    // Carburant (litres), débit instantané (l/h), compteur partiel (m) et carburant consommé depuis le départ (l).
    this.fuelL = this.spec.tank || 60;
    this.fuelLph = 0;
    this.tripM = 0;
    this.tripL = 0;
    this.dry = false; // panne sèche : le moteur cale et ne redémarre plus
  }

  get mass() {
    return this.spec.massEmpty + this.horses * this.spec.massHorse;
  }

  // Position longitudinale du centre de gravité (les chevaux voyagent au droit de l'essieu arrière).
  get cgZ() {
    const s = this.spec;
    const me = s.massEmpty, mh = this.horses * s.massHorse;
    return (me * s.cgEmpty + mh * (s.zRear + 0.35)) / (me + mh);
  }

  // Ordinateur de bord : consommation moyenne depuis le départ et instantanée (l/100 km), autonomie (km, d'après la
  // moyenne, ou la consommation de référence du véhicule avant les premiers kilomètres).
  get avgL100() {
    return this.tripM > 300 ? (this.tripL / this.tripM) * 1e5 : null;
  }
  get instL100() {
    const kmh = Math.abs(this.vx) * 3.6;
    return kmh > 8 ? (this.fuelLph / kmh) * 100 : null;
  }
  get rangeKm() {
    const avg = this.avgL100 || this.spec.refL100 || 8;
    return (this.fuelL / avg) * 100;
  }
  // Plein (ou appoint) : renvoie les litres réellement versés.
  refuel(litres = Infinity) {
    const room = Math.max(0, (this.spec.tank || 60) - this.fuelL);
    const add = Math.min(room, litres);
    this.fuelL += add;
    if (this.fuelL > 0.5) this.dry = false;
    return add;
  }
  resetTrip() {
    this.tripM = 0;
    this.tripL = 0;
  }

  get gearLabel() {
    if (!this.engineOn) return 'P';
    if (this.gear < 0) return 'R';
    if (Math.abs(this.vx) < 0.15 && this.throttle < 0.02) return 'N';
    return `D${this.gear}`;
  }

  ratio(gear = this.gear) {
    const s = this.spec;
    return (gear < 0 ? s.reverse : s.gears[gear - 1]) * s.final;
  }

  // Braquage maximal à la vitesse v (accélération latérale visée au joystick à fond).
  steerLimit(v) {
    const s = this.spec;
    const L = s.zFront - s.zRear;
    const v2 = Math.max(v * v, 1e-3);
    return Math.min(s.maxSteer, Math.atan((L * s.aLatSteer) / v2));
  }

  // input : { throttle -1..1 (bas = frein puis marche arrière), steer -1..1 (droite +), park bool }
  step(dt, input) {
    const s = this.spec;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    this.shifted = 0;
    const ax0 = this.ax;
    for (let i = 0; i < sub; i++) this._sub(h, input);
    this.jerk = (this.ax - ax0) / Math.max(dt, 1e-4);
    this.tripM += Math.abs(this.vx) * dt;
    // Roues : rotation (affichage).
    this.wheelSpin += (this.vx / s.wheelR) * dt;
    if (this.wheelSpin > 1e4 || this.wheelSpin < -1e4) this.wheelSpin %= Math.PI * 2;
  }

  _sub(dt, input) {
    const s = this.spec;
    const m = this.mass;
    const L = s.zFront - s.zRear;
    const t = input ? clamp(input.throttle || 0, -1, 1) : 0;
    const park = !input || input.park;
    const v = this.vx;
    const av = Math.abs(v);

    // --- Sélecteur : avant / frein / marche arrière (inversion seulement à l'arrêt). ---
    let throttle = 0, brake = 0;
    if (park || !this.engineOn) {
      brake = 1;
    } else if (this.gear > 0) {
      if (t > 0.05) throttle = t;
      else if (t < -0.05) {
        if (v > 0.35) brake = -t;
        else {
          brake = 1;
          this.revT += dt;
          if (this.revT > 0.45 && av < 0.2) this._engage(-1);
        }
      }
    } else {
      if (t < -0.05) throttle = -t;
      else if (t > 0.05) {
        if (v < -0.35) brake = t;
        else {
          brake = 1;
          this.revT += dt;
          if (this.revT > 0.2 && av < 0.2) this._engage(1);
        }
      }
    }
    if (Math.abs(t) <= 0.05 || (this.gear > 0 ? t > 0.05 : t < -0.05)) this.revT = 0;
    // Maintien à l'arrêt (assistance au démarrage en côte) sans commande.
    if (Math.abs(t) <= 0.05 && av < 0.25) brake = Math.max(brake, 1);
    // Montée en charge progressive de l'injection.
    this.throttle += clamp(throttle - this.throttle, -4 * dt, 2.2 * dt);
    if (!this.engineOn) this.throttle = 0;
    // Freins à air : montée en pression progressive (~0,4 s), relâchement plus rapide ; maintien à l'arrêt immédiat.
    if (av < 0.25 && brake >= 1) this.brake = 1;
    else this.brake += clamp(brake - this.brake, -5 * dt, (s.brakeRise || 2.6) * dt);
    brake = this.brake;
    this.braking = brake > 0.05 && av > 0.3;

    // --- Moteur et transmission. ---
    let Tw = 0; // couple aux roues (N·m, signe = sens de marche voulu)
    if (this.engineOn) {
      const ratio = this.ratio();
      const wheelRpm = (av / s.wheelR) * ratio * RPM_K;
      // Boîte automatique (rapports avant) : démarrage en 2e, en 1re seulement en forte côte.
      const startGear = this.slope > 0.07 ? 1 : s.startGear;
      this.sinceShift += dt;
      if (this.shiftT > 0) {
        this.shiftT -= dt;
        if (this.shiftT <= 0) this.gear = this.shiftTo;
      } else if (this.gear > 0) {
        if (av < 0.6 && this.gear !== startGear) this.gear = this.shiftTo = startGear;
        else if (this.sinceShift > 1.0) {
          const thr = this.throttle;
          const up = lerp(s.shiftUp[0], s.shiftUp[1], thr);
          const down = this.brake > 0.2 ? s.shiftDownBrake : lerp(s.shiftDown[0], s.shiftDown[1], thr);
          if (wheelRpm > up && this.gear < s.gears.length) this._shift(this.gear + 1);
          else if (wheelRpm < down && this.gear > startGear) this._shift(this.gear - 1);
        }
      }
      // Embrayage piloté : patinage progressif au démarrage, débrayé à l'arrêt et sous le ralenti.
      const launch = lerp(s.launch[0], s.launch[1], this.throttle);
      let rpmTarget, transmit;
      if (this.throttle <= 0.02 && av < 0.3) this.clutch = 0;
      if (this.shiftT > 0) {
        // Rupture de couple : le régime rejoint celui du rapport visé.
        const r2 = this.ratio(this.shiftTo);
        rpmTarget = Math.max(s.idle, (av / s.wheelR) * r2 * RPM_K);
        transmit = 0;
      } else if (wheelRpm < launch && this.throttle > 0.02) {
        this.clutch = Math.min(1, this.clutch + dt * 1.3);
        rpmTarget = launch;
        transmit = this.clutch * this.clutch; // patinage : couple transmis progressivement
      } else if (wheelRpm < s.idle) {
        rpmTarget = s.idle + this.throttle * s.holdRpm;
        transmit = this.throttle > 0.02 ? this.clutch : 0;
      } else {
        rpmTarget = wheelRpm;
        transmit = 1;
        this.clutch = 1;
      }
      this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * (this.shiftT > 0 ? 9 : 14));
      this.rpm = clamp(this.rpm, s.idle * 0.92, s.cutRpm);
      // Limiteur de vitesse et régulateur de régime.
      let thr = this.throttle;
      if (av > s.limiter - 0.6) thr *= clamp((s.limiter + 0.2 - av) / 0.8, 0, 1);
      const gov = clamp((s.cutRpm - this.rpm) / (s.cutRpm - s.maxRpm), 0, 1);
      // Limitation de couple de la boîte robotisée sur les rapports courts (protection de la transmission).
      const cap = this.gear < 0 ? 0.5 : s.gearTorque[this.gear - 1];
      let Te = Math.min(torqueAt(s, this.rpm), s.maxTorque * cap) * thr * gov;
      // Frein moteur (et frein sur échappement) sans gaz, rapport engagé, au-dessus du ralenti.
      if (thr < 0.02 && wheelRpm > s.idle + 80 && this.shiftT <= 0) Te = -(s.engineBrake[0] + s.engineBrake[1] * (this.rpm - s.idle));
      this.load = clamp(thr * gov, 0, 1);
      Tw = Te * transmit * ratio * s.eff * (this.gear < 0 ? -1 : 1);
      // Consommation : coupure d'injection au frein moteur, sinon frottements internes + puissance × consommation
      // spécifique (g/kWh) ÷ masse volumique.
      const P = Math.max(0, Te) * (this.rpm / RPM_K) / 1000;
      this.fuelLph = Te < 0 ? 0 : (s.idleLph || 0.8) * (this.rpm / s.idle) + (P * (s.bsfc || 210)) / (FUEL_DENSITY[s.fuel || 'diesel'] * 1000);
      this.fuelL -= (this.fuelLph * dt) / 3600;
      this.tripL += (this.fuelLph * dt) / 3600;
      if (this.fuelL <= 0) {
        this.fuelL = 0;
        this.dry = true;
        this.engineOn = false;
      }
    } else {
      this.rpm = Math.max(0, this.rpm - dt * 900);
      this.load = 0;
      this.fuelLph = 0;
    }

    // --- Efforts longitudinaux. ---
    const mu = lerp(s.mu, s.muSoft, this.soft);
    const zcg = this.cgZ;
    const a = s.zFront - zcg, b = zcg - s.zRear;
    const Fzr = (m * G * a) / L;
    const Fzf = (m * G * b) / L;
    let Fx = Tw / s.wheelR;
    // Motricité : essieu moteur (propulsion, traction) ou les quatre roues.
    const Fzd = s.awd ? Fzf + Fzr : s.drive === 'front' ? Fzf : Fzr;
    Fx = clamp(Fx, -mu * Fzd, mu * Fzd);
    const crr = lerp(s.crr, s.crrSoft, this.soft);
    const roll = crr * m * G * Math.tanh(v / 0.4);
    const aero = 0.5 * s.rho * s.cdA * v * av;
    const grade = -m * G * this.slope;
    const brakeF = brake * m * s.brakeDecel * Math.min(1, mu / 0.8);
    const meff = m * 1.06;
    let acc = (Fx - roll - aero + grade) / meff;
    let nv = v + acc * dt;
    // Freins : s'opposent au mouvement sans l'inverser ; à l'arrêt ils retiennent (pente).
    const bdv = (brakeF / meff) * dt;
    if (Math.abs(nv) <= bdv) nv = 0;
    else nv -= Math.sign(nv) * bdv;
    // Les résistances seules ne font pas repartir en sens inverse.
    if (Tw === 0 && v !== 0 && Math.sign(nv) !== Math.sign(v)) nv = 0;
    this.ax += ((nv - v) / dt - this.ax) * Math.min(1, dt * 30);
    this.vx = nv;

    // --- Direction : braquage visé selon la vitesse, vitesse de rotation limitée. ---
    const st = input ? clamp(input.steer || 0, -1, 1) : 0;
    const target = -st * this.steerLimit(Math.abs(this.vx));
    const rate = s.steerRate * (Math.abs(target) < Math.abs(this.steer) ? 1.25 : 1);
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);

    // --- Latéral : cinématique (lent) fondu dans le modèle bicyclette (rapide). ---
    const vxs = this.vx;
    const d = this.steer;
    const rKin = (vxs * Math.tan(d)) / L;
    const vyKin = rKin * b;
    const k = vxs > 0 ? smooth(3, 6.5, vxs) : 0;
    const vyPrev = this.vy;
    if (k > 0) {
      const Iz = 1.25 * m * a * b;
      const Cf = s.cornerF * Fzf, Cr = s.cornerR * Fzr;
      const af = Math.atan2(this.vy + a * this.r, vxs) - d;
      const ar = Math.atan2(this.vy - b * this.r, vxs);
      const Fyf = -mu * Fzf * Math.tanh((Cf * af) / (mu * Fzf));
      const Fyr = -mu * Fzr * Math.tanh((Cr * ar) / (mu * Fzr));
      const cd = Math.cos(d);
      const dvy = (Fyf * cd + Fyr) / m - vxs * this.r;
      const dr = (a * Fyf * cd - b * Fyr) / Iz;
      this.vy += dvy * dt;
      this.r += dr * dt;
    }
    this.vy = lerp(vyKin, this.vy, k);
    this.r = lerp(rKin, this.r, k);
    this.ay += ((this.vy - vyPrev) / dt + vxs * this.r - this.ay) * Math.min(1, dt * 20);

    // --- Intégration : centre de gravité puis centre du camion. ---
    const hd = this.heading;
    const fx = Math.sin(hd), fz = Math.cos(hd);
    const lx = Math.cos(hd), lz = -Math.sin(hd);
    const p = this.pos;
    const cx = p.x + fx * zcg + (vxs * fx + this.vy * lx) * dt;
    const cz = p.z + fz * zcg + (vxs * fz + this.vy * lz) * dt;
    this.heading = hd + this.r * dt;
    p.x = cx - Math.sin(this.heading) * zcg;
    p.z = cz - Math.cos(this.heading) * zcg;
  }

  _shift(g) {
    this.shiftTo = g;
    this.shiftT = this.spec.shiftTime;
    this.sinceShift = 0;
    this.shifted = g > this.gear ? 1 : -1;
  }

  _engage(g) {
    this.gear = this.shiftTo = g;
    this.shiftT = 0;
    this.sinceShift = 0;
    this.revT = 0;
    this.shifted = 2;
  }

  // Choc : vitesse ramenée (rebond amorti).
  impact(k = -0.25) {
    this.vx *= k;
    this.vy *= 0.3;
    this.r *= 0.3;
  }

  // Angles de braquage gauche/droite (épure d'Ackermann).
  ackermann() {
    const s = this.spec;
    const L = s.zFront - s.zRear;
    const d = this.steer;
    if (Math.abs(d) < 1e-4) return [d, d];
    const R = L / Math.tan(d); // > 0 : centre à gauche
    const left = Math.atan(L / (R - s.track / 2));
    const right = Math.atan(L / (R + s.track / 2));
    return [left, right];
  }
}
