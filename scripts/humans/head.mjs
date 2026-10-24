// Tête et visage (crâne, front, arcades, yeux et paupières, nez, lèvres, mâchoire, oreilles) en primitives SDF.
// Repère : os « head » (articulation atlas) ; y haut, z avant, x gauche. Repères anthropométriques en mètres (femme),
// mis à l'échelle pour l'homme avec traits plus marqués.
import { prim, union, sub, mask, ellipsoid, sphere, roundCone, capsule } from './sdf.mjs';

export const FACE = {
  f: { s: 1, jawW: 0.041, jawR: 0.0122, ramusR: 0.0125, chin: [0.0172, 0.0152, 0.0142], brow: [0.021, 0.0055, 0.0095], browZ: 0.0885, nose: 1, lipU: 0.0046, lipL: 0.0055, lipW: 1.02, cheek: 1, ear: 1, cranium: [0.0715, 0.075, 0.095] },
  m: { s: 1.055, jawW: 0.0465, jawR: 0.0152, ramusR: 0.0145, chin: [0.0205, 0.0172, 0.0162], brow: [0.024, 0.0075, 0.0125], browZ: 0.0895, nose: 1.1, lipU: 0.0038, lipL: 0.005, lipW: 1.04, cheek: 0.85, ear: 1.06, cranium: [0.0725, 0.0745, 0.0965] },
};

// Centre des globes oculaires (local, avant mise à l'échelle).
export const EYE = { x: 0.0315, y: 0.046, z: 0.0768, r: 0.0118 };

export function buildHead(sex, J, bone) {
  const F = FACE[sex];
  const s = F.s;
  const P = (x, y, z) => [J[0] + x * s, J[1] + y * s, J[2] + z * s];
  const R = (r) => (Array.isArray(r) ? r.map((v) => v * s) : r * s);
  const H = (shape, tag) => prim(shape, bone, { tag, part: 'head' });
  const both = (fn) => [fn(1), fn(-1)];

  // Crâne ; visage en deux grands volumes lisses (étage moyen, mâchoire) ; détails doux par-dessus.
  const cranium = H(ellipsoid(P(0, 0.068, -0.003), R(F.cranium)), 'skull');
  const occiput = H(ellipsoid(P(0, 0.03, -0.05), R([0.056, 0.05, 0.046])), 'skull');
  const mid = H(ellipsoid(P(0, 0.02, 0.046), R([0.0585, 0.05, 0.051])), 'face');
  const jawV = H(ellipsoid(P(0, -0.028, 0.034), R([F.jawW + 0.009, 0.049, 0.056])), 'face');
  const muzzle = H(ellipsoid(P(0, -0.021, 0.072), R([0.031, 0.022, 0.026])), 'face');
  const chin = H(ellipsoid(P(0, -0.0565, 0.08), R(F.chin)), 'face');
  const angles = both((sd) => H(ellipsoid(P((F.jawW + 0.004) * sd, -0.04, 0.002), R([0.011, F.jawR + 0.002, 0.016])), 'face'));
  const floor = H(ellipsoid(P(0, -0.048, 0.024), R([0.04, 0.028, 0.046])), 'face');
  const cheeks = both((sd) => H(ellipsoid(P(0.036 * sd, 0.012, 0.064), R([0.022 * F.cheek, 0.023, 0.021])), 'face'));
  const zyg = both((sd) => H(ellipsoid(P(0.051 * sd, 0.034, 0.053), R([0.018, 0.0105, 0.024]), [0, 0.6 * sd, 0]), 'face'));
  const base = union(0.018, [
    union(0.024, [cranium, occiput]),
    union(0.03, [mid, jawV, floor, ...angles]),
    union(0.016, [muzzle, chin]),
    union(0.024, [...cheeks, ...zyg]),
  ]);
  // Arcades sourcilières.
  const brows = union(0.005, both((sd) => H(ellipsoid(P(0.026 * sd, 0.0625, F.browZ), R(F.brow), [0, 0.32 * sd, -0.1 * sd]), 'brow')));
  // Orbites (creusées peu profondes).
  const sockets = union(0.004, both((sd) => H(ellipsoid(P(EYE.x * sd, EYE.y + 0.001, 0.0895), R([0.0162, 0.0098, 0.0096])), 'socket')));

  // Globes oculaires avec cornée.
  const ec = (sd) => P(EYE.x * sd, EYE.y, EYE.z);
  const eyes = union(0.0005, both((sd) => {
    const c = ec(sd);
    const tag = sd > 0 ? 'eyeL' : 'eyeR';
    return union(0.0012, [H(sphere(c, R(EYE.r)), tag), H(sphere(P(EYE.x * sd + 0.0006 * sd, EYE.y, EYE.z + 0.0056), R(0.0079)), tag)]);
  }));
  // Paupières : coques un peu plus grandes que le globe, coupées par la ligne d'ouverture.
  const lids = union(0.0012, both((sd) => {
    const c = ec(sd);
    const upper = mask(0.0011, H(sphere(c, R(0.0129)), 'lid'), (x, y, z) => {
      const lx = ((x - c[0]) / s) * sd, ly = (y - c[1]) / s, lz = (z - c[2]) / s;
      return 0.0036 - ly + lz * 0.1 + lx * 0.04 + lx * lx * 4.2 - Math.max(0, lz - 0.008) * 0.6;
    });
    const lower = mask(0.0011, H(sphere(c, R(0.0124)), 'lid'), (x, y, z) => {
      const lx = ((x - c[0]) / s) * sd, ly = (y - c[1]) / s;
      return ly + 0.0052 - lx * 0.05 + lx * lx * 2.6;
    });
    return union(0.0009, [upper, lower]);
  }));

  // Nez : arête, pointe, ailes, columelle ; narines creusées.
  const n = F.nose;
  const nose = union(0.0042, [
    H(roundCone(P(0, 0.05, 0.0875), P(0, 0.014, 0.1055 + 0.003 * (n - 1)), R(0.0052 * n), R(0.0064 * n), { sv: 1.32, sw: 0.95, ref: [0, 0, 1] }), 'nose'),
    H(ellipsoid(P(0, 0.0072, 0.1078 + 0.004 * (n - 1)), R([0.0088 * n, 0.0082 * n, 0.0084 * n])), 'nose'),
    ...both((sd) => H(ellipsoid(P(0.0112 * sd * n, 0.0008, 0.0965), R([0.0062 * n, 0.0058, 0.0072])), 'nose')),
    H(ellipsoid(P(0, -0.0018, 0.1018), R([0.0052, 0.0042, 0.0064])), 'nose'),
  ]);
  const nostrils = union(0.001, both((sd) => H(ellipsoid(P(0.0064 * sd * n, -0.0041, 0.1003), R([0.0031, 0.0017, 0.0039]), [-0.35, 0, 0]), 'nostril')));

  // Lèvres (arc de Cupidon), fente buccale.
  const lw = F.lipW;
  const lips = union(0.0024, [
    H(ellipsoid(P(0, -0.0188, 0.0948), R([0.0198 * lw, F.lipU, 0.0054]), [-0.25, 0, 0]), 'lips'),
    ...both((sd) => H(ellipsoid(P(0.0056 * sd, -0.0182, 0.0951), R([0.0074, F.lipU * 0.75, 0.0047]), [-0.22, 0, 0]), 'lips')),
    H(ellipsoid(P(0, -0.0303, 0.0929), R([0.017 * lw, F.lipL, 0.0058]), [0.25, 0, 0]), 'lips'),
  ]);
  const slit = H(ellipsoid(P(0, -0.0246, 0.0985), R([0.0218 * lw, 0.0007, 0.0085])), 'slit');
  const philtrum = H(capsule(P(0, -0.006, 0.1018), P(0, -0.0135, 0.1006), R(0.0014)), 'slit');

  // Oreilles : disque, hélix (bord), conque creusée, lobe.
  const ears = union(0.003, both((sd) => {
    const e = F.ear;
    const rot = [-0.17, 0.14 * sd, 0];
    const plate = H(ellipsoid(P(0.0682 * sd, 0.037, -0.0135), R([0.0056, 0.0285 * e, 0.0168 * e]), rot), 'ear');
    const helix = H(ellipsoid(P(0.0698 * sd, 0.0405, -0.0158), R([0.0042, 0.0262 * e, 0.0152 * e]), rot), 'ear');
    const lobe = H(ellipsoid(P(0.0686 * sd, 0.0085, -0.0078), R([0.0048, 0.0072 * e, 0.0064 * e]), [0, 0.14 * sd, 0]), 'ear');
    const concha = H(ellipsoid(P(0.0738 * sd, 0.0305, -0.0095), R([0.0046, 0.0112 * e, 0.0082 * e]), rot), 'concha');
    return sub(0.0022, union(0.005, [plate, helix, lobe]), concha);
  }));

  let head = union(0.006, [base, brows]);
  head = sub(0.006, head, sockets);
  head = union(0.001, [head, eyes]);
  head = union(0.0016, [head, lids]);
  head = union(0.0042, [head, nose]);
  head = sub(0.0011, head, nostrils);
  head = union(0.0028, [head, lips]);
  head = sub(0.0012, head, slit);
  head = sub(0.0016, head, philtrum);
  head = union(0.0045, [head, ears]);
  return { head, eyeCenters: { l: ec(1), r: ec(-1) }, P, scale: s };
}

// Hauteur de la lisière des cheveux selon l'azimut autour de la tête (local, non mis à l'échelle).
export function hairlineY(x, z, sex) {
  const th = Math.abs(Math.atan2(x, z));
  const K = sex === 'm'
    ? [[0, 0.108], [0.45, 0.101], [0.75, 0.088], [1.05, 0.06], [1.3, 0.038], [1.75, 0.07], [2.1, 0.03], [2.6, -0.005], [Math.PI, -0.02]]
    : [[0, 0.112], [0.45, 0.104], [0.75, 0.092], [1.05, 0.066], [1.3, 0.044], [1.75, 0.072], [2.1, 0.032], [2.6, -0.006], [Math.PI, -0.022]];
  for (let i = 1; i < K.length; i++) {
    if (th <= K[i][0]) {
      const t = (th - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
      const u = t * t * (3 - 2 * t);
      return K[i - 1][1] + (K[i][1] - K[i - 1][1]) * u;
    }
  }
  return K[K.length - 1][1];
}
