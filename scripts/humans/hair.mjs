// Cheveux et coiffes (casque d'équitation, casquette) : maillages séparés, rigides sur l'os de la tête (queue de cheval
// sur l'os « hairTail »). Générés autour de la tête féminine, en coordonnées locales de la tête ; l'homme les reçoit
// mis à l'échelle (même forme de crâne).
import { skeletonXf, prim, union, sub, mask, offset, displace, ellipsoid, sphere, roundCone, capsule, torus, roundBox, smoothstep, clamp } from './sdf.mjs';
import { buildHead, hairlineY, FACE } from './head.mjs';
import { Evaluator } from './sdf.mjs';
import { Z } from '../../src/entities/human/zones.js';

export function buildHairAssets() {
  const skel = skeletonXf('f');
  const I = skel.index;
  const J = skel.rest.head;
  const P = (x, y, z) => [J[0] + x, J[1] + y, J[2] + z];
  const L = (x, y, z) => [x - J[0], y - J[1], z - J[2]];
  const Hd = (shape, tag) => prim(shape, I.head, { tag, part: 'head' });
  const Tl = (shape, tag, w) => prim(shape, I.hairTail, { tag, part: 'head', w });
  const C = FACE.f.cranium;
  const scalp = () => union(0.02, [Hd(ellipsoid(P(0, 0.068, -0.003), C), 'skull'), Hd(ellipsoid(P(0, 0.03, -0.05), [0.056, 0.05, 0.046]), 'skull')]);
  // Tête complète (pour éliminer les faces cachées à l'intérieur).
  const headModel = buildHead('f', J, I.head);
  const headEv = new Evaluator(headModel.head, skel);
  const cull = (x, y, z) => headEv.eval(x, y, z);
  // Lisière : garder au-dessus de la ligne d'implantation (marge négative = descend plus bas).
  const hairMask = (margin) => (x, y, z) => {
    const [lx, ly, lz] = L(x, y, z);
    return hairlineY(lx, lz, 'f') - margin - ly;
  };
  // Mèches : sillons doux le long des lignes de coiffage (angle autour d'un axe).
  const strands = (c, n, amp) => (x, y, z) => {
    const [lx, ly, lz] = L(x, y, z);
    const a = Math.atan2(lx - c[0], ly - c[1]);
    const r = Math.hypot(lx - c[0], ly - c[1]);
    return amp * Math.sin(a * n) * smoothstep(0.02, 0.06, r);
  };
  const tieW = (q) => {
    const t = smoothstep(J[1] + 0.06, J[1] + 0.0, q[1]);
    return [[I.head, 1 - t], [I.hairTail, t]].filter((e) => e[1] > 1e-4);
  };

  // Bord inférieur du casque (local) : au ras des sourcils devant, au-dessus des oreilles, sur l'occiput derrière.
  const helmetEdge = (lx, lz) => {
    const th = Math.abs(Math.atan2(lx, lz));
    return th < 1.0 ? 0.079 - th * 0.012 : th < 1.9 ? 0.067 - (th - 1.0) * 0.05 : 0.022 - (th - 1.9) * 0.012;
  };
  const underHelmet = (margin) => (x, y, z) => {
    const [lx, ly, lz] = L(x, y, z);
    return ly - (helmetEdge(lx, lz) + margin);
  };
  const zoneHair = (tieTest) => (ev, x, y, z) => {
    const [lx, ly, lz] = L(x, y, z);
    if (tieTest && tieTest(lx, ly, lz)) return Z.HAIR_TIE;
    return Z.HAIR;
  };
  const A = [];
  const add = (name, root, zoneOf, lods, opts = {}) => A.push({ name, root, zoneOf, lods, skel, cull, h: 0.0016, local: J, ...opts });

  // Chignon bas (cavalières sous le casque, aussi en ville).
  {
    const cap = displace(mask(0.0025, offset(0.0058, scalp()), hairMask(0.001)), strands([0, 0.012], 34, 0.0006), 0.001);
    const bun = union(0.004, [
      Hd(ellipsoid(P(0, 0.014, -0.104), [0.032, 0.027, 0.024]), 'hair'),
      Hd(ellipsoid(P(-0.012, 0.02, -0.112), [0.02, 0.018, 0.016], [0.3, 0, 0.5]), 'hair'),
      Hd(ellipsoid(P(0.012, 0.008, -0.11), [0.02, 0.018, 0.016], [-0.3, 0, -0.4]), 'hair'),
    ]);
    const tie = Hd(torus(P(0, 0.015, -0.087), 0.019, 0.0032, [Math.PI / 2 - 0.2, 0, 0]), 'tie');
    add('hair_bun', union(0.003, [union(0.008, [cap, bun]), tie]), zoneHair((x, y, z) => z > -0.093 && z < -0.08 && Math.hypot(x, y - 0.015) > 0.013 && y < 0.04 && y > -0.01), [1100, 300, 90]);
  }
  // Sous le casque : chignon avec filet + cheveux visibles sous le bord (femme), nuque courte (homme).
  {
    const cap = mask(0.003, mask(0.0025, offset(0.0058, scalp()), hairMask(0.001)), underHelmet(0.012));
    const bun = union(0.004, [
      Hd(ellipsoid(P(0, 0.014, -0.104), [0.032, 0.027, 0.024]), 'hair'),
      Hd(ellipsoid(P(-0.012, 0.02, -0.112), [0.02, 0.018, 0.016], [0.3, 0, 0.5]), 'hair'),
      Hd(ellipsoid(P(0.012, 0.008, -0.11), [0.02, 0.018, 0.016], [-0.3, 0, -0.4]), 'hair'),
    ]);
    add('hair_net', union(0.006, [cap, bun]), zoneHair(null), [520, 160, 50]);
    const nape = mask(0.003, mask(0.002, offset(0.0042, scalp()), hairMask(0.0005)), underHelmet(0.012));
    add('hair_nape', nape, zoneHair(null), [300, 110, 40]);
  }
  // Queue de cheval (os hairTail).
  {
    const cap = displace(mask(0.0025, offset(0.0062, scalp()), hairMask(0.001)), strands([0, 0.066], 30, 0.0006), 0.001);
    const tail = union(0.006, [
      Tl(roundCone(P(0, 0.07, -0.1), P(0, 0.036, -0.121), 0.0145, 0.0185), 'hair', tieW),
      Tl(roundCone(P(0, 0.036, -0.121), P(0, -0.035, -0.118), 0.0185, 0.0145), 'hair', tieW),
      Tl(roundCone(P(0, -0.035, -0.118), P(0.004, -0.105, -0.104), 0.0145, 0.006), 'hair', tieW),
    ]);
    const tie = Hd(torus(P(0, 0.068, -0.1), 0.0115, 0.0034, [Math.PI / 2 - 0.55, 0, 0]), 'tie');
    add('hair_ponytail', union(0.003, [union(0.006, [cap, tail]), tie]), zoneHair((x, y, z) => z < -0.093 && z > -0.11 && y > 0.058 && y < 0.08 && Math.abs(x) < 0.016), [1100, 300, 90]);
  }
  // Carré (au niveau de la mâchoire, couvre les oreilles), raie sur le côté.
  for (const [name, bottom, back] of [['hair_bob', -0.045, -0.06], ['hair_long', -0.085, -0.135]]) {
    const vol = union(0.03, [
      offset(0.012, scalp()),
      Hd(ellipsoid(P(0, 0.0, -0.022), [0.083, 0.095, 0.095]), 'hair'),
      Hd(ellipsoid(P(0, back * 0.5, -0.06), [0.072, 0.07 - back * 0.5, 0.06]), 'hair'),
    ]);
    const shaped = mask(0.004, vol, (x, y, z) => {
      const [lx, ly, lz] = L(x, y, z);
      // bas : longueur (plus long derrière pour les cheveux longs)
      const len = bottom + (back - bottom) * smoothstep(0.0, -0.08, lz);
      const low = len - ly;
      // visage dégagé : devant la tête sous la lisière
      const face = Math.min(lz - 0.028 + Math.max(0, ly - 0.06) * 0.0, hairlineY(lx, lz, 'f') + 0.004 - ly + Math.max(0, 0.035 - Math.abs(lx)) * 0.0);
      return Math.max(low, face);
    });
    const res = displace(shaped, (x, y, z) => {
      const [lx, ly, lz] = L(x, y, z);
      const a = Math.atan2(lx, lz);
      return 0.0012 * Math.sin(a * 22 + ly * 30) * smoothstep(0.08, 0.02, ly);
    }, 0.0015);
    add(name, res, zoneHair(null), name === 'hair_long' ? [1300, 340, 100] : [1150, 300, 90]);
  }
  // Coupe courte « pixie » (femme) : volume sur le dessus, mèche sur le côté.
  {
    const vol = union(0.015, [
      mask(0.002, offset(0.0075, scalp()), hairMask(0.0)),
      mask(0.004, Hd(ellipsoid(P(-0.005, 0.1, 0.02), [0.068, 0.05, 0.085]), 'hair'), hairMask(-0.004)),
      Hd(ellipsoid(P(0.03, 0.098, 0.074), [0.03, 0.012, 0.022], [0.2, 0, -0.4]), 'hair'),
    ]);
    add('hair_pixie', displace(vol, strands([0.0, 0.03], 26, 0.0011), 0.0015), zoneHair(null), [1000, 280, 80]);
  }
  // Homme : court classique et raie de côté.
  for (const [name, top, part] of [['hair_short', 0.0075, false], ['hair_side', 0.012, true]]) {
    const sides = mask(0.002, offset(0.0042, scalp()), hairMask(0.0005));
    const crown = mask(0.006, offset(top, scalp()), (x, y, z) => {
      const [, ly] = L(x, y, z);
      return 0.07 - ly;
    });
    let vol = union(0.014, [sides, mask(0.002, crown, hairMask(0.0))]);
    if (part) vol = sub(0.002, vol, Hd(capsule(P(0.028, 0.115, 0.075), P(0.033, 0.13, -0.03), 0.0022), 'part'));
    add(name, displace(vol, strands([0, -0.05], 40, 0.0005), 0.0008), zoneHair(null), [900, 260, 80]);
  }
  // Casque d'équitation : coque mate, visière, harnais trois points.
  {
    const edge = helmetEdge;
    const shell = mask(0.003, offset(0.025, scalp()), (x, y, z) => {
      const [lx, ly, lz] = L(x, y, z);
      return edge(lx, lz) - ly;
    });
    const ridge = Hd(capsule(P(0, 0.162, 0.03), P(0, 0.152, -0.07), 0.006), 'shell');
    const peak = mask(0.002, Hd(ellipsoid(P(0, 0.078, 0.005), [0.084, 0.0032, 0.124], [0.16, 0, 0]), 'peak'), (x, y, z) => {
      const [, , lz] = L(x, y, z);
      return 0.07 - lz;
    });
    const strap = (a, b) => Hd(roundCone(a, b, 0.0032, 0.0032, { sv: 2.6, sw: 0.65, ref: [1, 0, 0] }), 'strap');
    const straps = [];
    for (const sd of [1, -1]) {
      const j = P(0.06 * sd, -0.022, 0.0);
      straps.push(strap(P(0.072 * sd, 0.064, 0.02), j), strap(P(0.068 * sd, 0.03, -0.048), j), strap(j, P(0.045 * sd, -0.07, 0.04)));
    }
    straps.push(strap(P(0.045, -0.07, 0.04), P(-0.045, -0.07, 0.04)));
    const helmet = union(0.002, [union(0.008, [shell, ridge]), peak, union(0.002, straps)]);
    const zoneOf = (ev, x, y, z) => {
      const [lx, ly, lz] = L(x, y, z);
      const D = ev.primDistances(x, y, z, ev._hd || (ev._hd = new Float64Array(ev.prims.length)));
      let ds = Infinity, dp = Infinity, dshell = Infinity;
      ev.prims.forEach((p, i) => {
        if (p.tag === 'strap') ds = Math.min(ds, D[i]);
        else if (p.tag === 'peak') dp = Math.min(dp, D[i]);
        else dshell = Math.min(dshell, D[i] - 0.025);
      });
      if (ds < 0.0012 && ds < dshell) return Z.HELMET_TRIM;
      if (dp < 0.0012 && lz > 0.075) return Z.HELMET_PEAK;
      // liseré le long du bord
      if (ly < edge(lx, lz) + 0.006) return Z.HELMET_TRIM;
      return Z.HELMET;
    };
    add('helmet', helmet, zoneOf, [1250, 380, 110], { h: 0.0018, cull });
  }
  // Casquette.
  {
    const crown = mask(0.003, offset(0.0085, scalp()), (x, y, z) => {
      const [lx, ly, lz] = L(x, y, z);
      return 0.072 + lz * 0.18 - ly;
    });
    const brim = mask(0.002, Hd(ellipsoid(P(0, 0.084, 0.05), [0.074, 0.0034, 0.09], [0.12, 0, 0]), 'brim'), (x, y, z) => {
      const [, , lz] = L(x, y, z);
      return 0.072 - lz;
    });
    const button = Hd(sphere(P(0, 0.153, -0.003), 0.0055), 'cap');
    const zoneOf = (ev, x, y, z) => {
      const [, , lz] = L(x, y, z);
      const D = ev.primDistances(x, y, z, ev._hd || (ev._hd = new Float64Array(ev.prims.length)));
      let db = Infinity;
      ev.prims.forEach((p, i) => {
        if (p.tag === 'brim') db = Math.min(db, D[i]);
      });
      return db < 0.001 && lz > 0.07 ? Z.CAP_BRIM : Z.CAP;
    };
    add('cap', union(0.003, [crown, brim, button]), zoneOf, [800, 240, 70], { cull });
  }
  return A;
}
