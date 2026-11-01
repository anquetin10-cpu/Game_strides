// Conduite des épreuves de saut d'obstacles (CSO) : trois gestes simples, comme dans un jeu de sport console.
//   DIRIGER : joystick gauche/droite (ou ←/→, Q/A et D au clavier) — rayon de virage qui grandit avec la vitesse, prise
//             de courbe progressive (pas de pivot instantané, pas de glissade) ;
//   RÉGLER LA VITESSE : joystick avant/arrière (↑/↓, Z/W et S) — la cadence change progressivement et reste la même quand
//             on relâche (le cheval ne ralentit ni n'accélère tout seul) ;
//   SAUTER : grand bouton SAUT (Espace).
// Utilisée seulement pendant une épreuve de CSO (game.course.controls === 'cso') ; la monte en monde ouvert est inchangée.
import { clamp } from '../core/math.js';

// Réglages (ajustables) de la conduite de concours.
export const CSO_RIDE = {
  cadence: 6.2, // galop de concours de référence (m/s ≈ 370 m/min, foulée ≈ 3,5 m)
  maxSpeed: 8.0, // galop allongé au plus (m/s ≈ 480 m/min)
  cadenceRate: 1.2, // variation de cadence au galop, joystick poussé à fond (m/s par seconde)
  lowRate: 2.2, // variation en dessous du trot (repartir après un arrêt sans attendre)
  deadZone: 0.35, // part du joystick avant/arrière ignorée
  slope: 0.65, // la cadence ne change que si le joystick est franchement vers l'avant/l'arrière (|y| > 0,65 |x|)
  steerDead: 0.06, // part du joystick gauche/droite ignorée
  expo: 1.35, // courbe de direction : précise autour du centre, pleine au bord
  radius0: 2.6, // rayon de virage le plus court (joystick à fond) : R(v) = radius0 + radiusK × v
  radiusK: 0.8, //   → 6,3 m au trot (4,6 m/s), 7,6 m au galop de concours, 9 m au galop allongé
  pivot: 0.8, // à l'arrêt : demi-tour sur les hanches (rad/s), pour repartir après un refus
  yawTau: 0.2, // temps de réponse de la direction (s) : la courbe s'installe en douceur
  yawAcc: 3.0, // accélération angulaire maximale (rad/s²) : aucun à-coup de direction
  airTurn: 0.3, // part de la direction conservée en l'air
  kbdRamp: 3.2, // clavier : la direction monte de 0 à fond en ~0,3 s (courbe progressive, pas de tout-ou-rien)
  landingLoss: 0.04, // perte d'élan à la réception (au plus 4 %, seulement si le saut a dû être recadré)
};

// Rayon de virage le plus court (m) et vitesse de rotation maximale (rad/s) à la vitesse v (m/s).
export const minRadius = (v) => CSO_RIDE.radius0 + CSO_RIDE.radiusK * Math.max(0, v);
export const maxTurnRate = (v) => {
  const R = CSO_RIDE;
  if (v >= 1) return v / minRadius(v);
  // Au pas lent et à l'arrêt : on rejoint le demi-tour sur les hanches.
  const w1 = 1 / minRadius(1);
  return R.pivot + (w1 - R.pivot) * Math.max(0, v);
};

// Commande de direction (−1..1) → vitesse de rotation visée (rad/s ; positive = vers la gauche du cavalier).
export function steerRate(x, v) {
  const R = CSO_RIDE;
  const a = Math.abs(x);
  if (a <= R.steerDead) return 0;
  const u = Math.min(1, (a - R.steerDead) / (1 - R.steerDead));
  return -Math.sign(x) * Math.pow(u, R.expo) * maxTurnRate(v);
}

// Commande de vitesse (−1..1, et direction x) → variation de cadence (m/s par seconde).
export function cadenceDelta(y, x, cadence) {
  const R = CSO_RIDE;
  const a = Math.abs(y);
  if (a <= R.deadZone || a <= R.slope * Math.abs(x)) return 0;
  const thr = Math.sign(y) * Math.min(1, (a - R.deadZone) / (1 - R.deadZone));
  return thr * (cadence < 4.6 ? R.lowRate : R.cadenceRate);
}

// Une image de conduite de concours : écrit les commandes du cheval du joueur.
export function csoRideStep(player, input, dt) {
  const R = CSO_RIDE;
  const h = player.horse;
  const c = h.control;
  const mv = input.move;
  // Cadence de départ : la vitesse réelle du cheval (jamais d'élan pris tout seul à l'entrée en piste).
  if (player.csoCadence === undefined) player.csoCadence = Math.round(clamp(h.speed, 0, R.maxSpeed) * 10) / 10;
  // Clavier : direction amenée progressivement (une touche maintenue décrit une courbe, pas un coup de volant).
  let sx = mv.x;
  if (input.keyMove) {
    const k = player._kbdSteer || 0;
    const step = R.kbdRamp * dt * (Math.abs(sx) < Math.abs(k) || Math.sign(sx) !== Math.sign(k) ? 2 : 1);
    player._kbdSteer = k + clamp(sx - k, -step, step);
    sx = player._kbdSteer;
  } else player._kbdSteer = 0;
  // Refus en cours (arrêt, cheval qui se cabre) : la cadence ne se règle pas — on repart une fois le cheval calmé.
  if (!(h._rearT > 0) && !h._refusing) player.csoCadence = clamp(player.csoCadence + cadenceDelta(mv.y, sx, player.csoCadence) * dt, 0, R.maxSpeed);
  c.turnRate = steerRate(sx, h.speed);
  c.speedOverride = player.csoCadence;
  c.yawTau = R.yawTau;
  c.yawAcc = R.yawAcc;
  c.airTurn = R.airTurn;
  c.landingLoss = R.landingLoss;
  c.mag = 1;
  c.gallop = false;
  if (input.wasPressed('jump')) c.jump = true;
}

// Commandes de concours retirées (sortie de l'épreuve, montée/descente) : retour aux réglages du monde ouvert.
export function clearCsoControls(c) {
  c.speedOverride = undefined;
  c.turnRate = undefined;
  c.yawTau = undefined;
  c.yawAcc = undefined;
  c.airTurn = undefined;
  c.landingLoss = undefined;
}
