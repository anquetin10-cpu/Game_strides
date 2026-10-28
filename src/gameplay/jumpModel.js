// Modèle de saut d'obstacle (CSO) : déterministe, partagé par le saut du cheval, le jugement des barres et l'aide à
// l'appel. À l'appel, le cheval part de sa position réelle, avec sa vitesse et son cap : sa trajectoire est une
// parabole (hauteur des pieds au-dessus du sol) dont il ajuste un peu la longueur pour placer son sommet au-dessus du
// milieu de l'obstacle. Appel trop loin : le sommet reste avant l'obstacle et les pieds redescendent sur la barre
// (ou la seconde barre de l'oxer) ; trop près : la barre avant est franchie en montée, trop bas, ou le cheval n'a plus
// la place d'enlever (refus). Vitesse et angle réduisent la hauteur disponible.
import { clamp, smoothstep } from '../core/math.js';

export const JUMP = {
  T: 0.8, // durée naturelle du vol au galop (s) : longueur naturelle = vitesse × T
  lift: 0.2, // pieds repliés au-dessus du point de référence (m)
  adapt: 0.12, // le cheval allonge son saut de 12 % au plus pour se recaler…
  shorten: 0.24, // …et le raccourcit davantage (il se ramène, enlève plus droit) quand il arrive trop près
  minFront: 0.55, // en deçà (m, de la barre avant), le cheval ne peut plus enlever : refus
  good: 0.15, // marge (m) au-dessus de laquelle l'aide affiche la bonne zone
  rub: 0.06, // barre effleurée jusqu'à 6 cm sous les pieds : elle tinte dans ses taquets mais reste en place
  late: 0.3, // trop près sans appel : le cheval refuse quand un saut ferait toucher la barre de plus de 30 cm
  maxAngle: 0.5, // cos minimal entre le cap et l'axe de l'obstacle (60°) : au-delà, pas d'appel possible
  reach: 13, // distance (m) à partir de laquelle l'aide s'intéresse à l'obstacle suivant
};

// Puissance utile selon la vitesse : pleine au galop de concours, réduite au trot, saut « à plat » au grand galop.
export const speedFactor = (v) => (0.72 + 0.28 * smoothstep(3.5, 6.5, v)) * (1 - 0.16 * smoothstep(9, 12, v));
// Abord en biais : moins de hauteur disponible (le cheval se tord pour franchir).
export const angleFactor = (cosA) => 1 - 0.6 * (1 - cosA);

// Hauteur des pieds (au-dessus du sol, sans le repli) à x mètres de l'appel, pour un saut de longueur L et de
// hauteur H : la même formule anime le cheval (Horse.jumpHeightAt) et juge les barres.
export const arcY = (H, L, x) => (x <= 0 || x >= L ? 0 : (4 * H * x * (L - x)) / (L * L));

// Géométrie d'un obstacle vue d'un cavalier : position (x, z), axe de saut n, barres `bars` (ou `rails`) { s (m, le
// long de n), h }.
// Renvoie les barres dans l'ordre de franchissement avec leur distance au point d'appel, mesurée le long du cap.
export function railsAhead(fence, px, pz, fx, fz) {
  const cosN = fx * fence.n.x + fz * fence.n.z;
  const sign = cosN >= 0 ? 1 : -1;
  const cosA = Math.abs(cosN);
  const sP = (px - fence.x) * fence.n.x + (pz - fence.z) * fence.n.z;
  const uP = (px - fence.x) * fence.t.x + (pz - fence.z) * fence.t.z;
  const fu = fx * fence.t.x + fz * fence.t.z;
  const rails = (fence.bars || fence.rails)
    .map((r) => {
      const x = cosA > 1e-3 ? (sign * r.s - sign * sP) / cosA : Infinity;
      return { s: r.s, h: r.h, x, u: uP + fu * x };
    })
    .sort((a, b) => a.x - b.x);
  return { cosA, sign, rails };
}

// Plan du saut si le cavalier demande l'appel maintenant. `horse` : { v (m/s), power (hauteur de base du cheval),
// clearance (bonus d'équipement) } ; `geo` : résultat de railsAhead. Renvoie la longueur L et la hauteur H (pieds) du
// saut, la marge à chaque barre (m, négative = barre touchée), la marge la plus faible et la zone d'appel.
export function planJump(horse, geo) {
  const { v } = horse;
  const L0 = Math.max(1.5, v * JUMP.T);
  const cosA = geo ? geo.cosA : 1;
  const Hfull = horse.power * speedFactor(v) * angleFactor(cosA);
  if (!geo || !geo.rails.length || cosA < JUMP.maxAngle) return { L: L0, H: Hfull, margins: [], margin: Infinity, zone: 'none', L0 };
  const first = geo.rails[0].x, last = geo.rails[geo.rails.length - 1].x;
  // Sommet visé au-dessus du milieu de l'obstacle (entre les deux barres d'un oxer).
  const ideal = first + last;
  const L = clamp(ideal, L0 * (1 - JUMP.shorten), L0 * (1 + JUMP.adapt));
  const dev = L / L0 - 1;
  // Saut recadré : un peu moins de hauteur (le cheval se grandit ou se raccourcit).
  const H = Hfull * (1 - 1.5 * dev * dev);
  const lift = JUMP.lift + (horse.clearance || 0);
  const margins = geo.rails.map((r) => arcY(H, L, r.x) + lift - r.h);
  const margin = Math.min(...margins);
  let zone;
  if (first < JUMP.minFront) zone = 'refuse';
  else if (margin >= JUMP.good) zone = 'good';
  else zone = ideal > L ? 'far' : 'near';
  // Cause d'une faute prévisible : distance, ou abord (vitesse, angle) quand la distance était bonne.
  // La distance est-elle en cause ? Même appel, abord droit à bonne cadence : s'il passe, c'est l'abord.
  let cause = null;
  if (zone === 'refuse') cause = 'tooClose';
  else if (margin < -JUMP.rub) {
    const Hok = horse.power * speedFactor(clamp(v, 6.5, 9)) * (1 - 1.5 * dev * dev);
    const straight = Math.min(...geo.rails.map((r) => arcY(Hok, L, r.x) + lift - r.h));
    if (straight >= -JUMP.rub) cause = cosA < 0.92 ? 'angle' : v < 6.5 ? 'slow' : 'fast';
    else cause = ideal > L ? 'far' : 'near';
  }
  return { L, H, L0, margins, margin, zone, cause, ideal, cosA };
}

export const CAUSES = {
  far: 'Appel trop loin',
  near: 'Appel trop près',
  tooClose: 'Trop près : plus de place pour sauter',
  angle: 'Abord désaxé',
  slow: 'Pas assez d’impulsion',
  fast: 'Trop vite : saut à plat',
  short: 'Saut trop court : atterrissage dans l’obstacle',
};
