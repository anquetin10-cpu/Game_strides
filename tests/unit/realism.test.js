import { describe, it, expect } from 'vitest';
import { HORSE } from '../../src/config.js';
import { COURSE_LENGTH, COURSE_SPEED, timeAllowedFor } from '../../src/gameplay/courses.js';
import { DEFI_POLE_V1, DEFI_POLE_V2, CURRENT_CHALLENGE } from '../../src/gameplay/challenge.js';
import { STORY } from '../../src/gameplay/story.js';
import { CHAPTER1 } from '../../src/gameplay/story2.js';
import { TRUCK_SPEC } from '../../src/entities/truckPhysics.js';

// Audit de réalisme (docs/realisme.md) : grandeurs du jeu confrontées aux valeurs réelles de référence.
const kmh = (ms) => ms * 3.6;
const gait = (name) => HORSE.gaits.find((g) => g.name === name).speed;

describe('réalisme : allures du cheval', () => {
  it('pas 5,5 – 7 km/h, trot 12 – 18 km/h', () => {
    expect(kmh(gait('PAS'))).toBeGreaterThanOrEqual(5.5);
    expect(kmh(gait('PAS'))).toBeLessThanOrEqual(7);
    expect(kmh(gait('TROT'))).toBeGreaterThanOrEqual(12);
    expect(kmh(gait('TROT'))).toBeLessThanOrEqual(18);
  });
  it('galop de travail d’un parcours de CSO : 350 – 400 m/min', () => {
    const mpm = gait('GALOP') * 60;
    expect(mpm).toBeGreaterThanOrEqual(350);
    expect(mpm).toBeLessThanOrEqual(400);
  });
  it('galop allongé d’un cheval de sport : 45 – 55 km/h', () => {
    expect(kmh(gait('GRAND GALOP'))).toBeGreaterThanOrEqual(45);
    expect(kmh(gait('GRAND GALOP'))).toBeLessThanOrEqual(55);
  });
});

describe('réalisme : épreuves', () => {
  it('temps accordé = longueur / vitesse imposée (350 m/min national, 375 CSI, 400 Grand Prix)', () => {
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national)).toBe(42);
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.csi)).toBe(40);
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.gp)).toBe(37);
    // Parcours faisable au galop de travail réel sur le tracé mesuré.
    expect(COURSE_LENGTH.cso / gait('GALOP')).toBeLessThan(42);
  });
  it('Grand Prix CSI 5★ entre 1,50 et 1,60 m ; qualificative jusqu’à 1,45 m', () => {
    const gp = STORY.find((s) => s.id === 'gp');
    const csi3 = STORY.find((s) => s.id === 'csi3');
    expect(gp.desc).toMatch(/1,50 m à 1,60 m/);
    expect(csi3.desc).toMatch(/1,45 m/);
  });
  it('premier concours (M3) au temps réglementaire national', () => {
    expect(CHAPTER1.m3.ta).toBe(42);
    expect(CHAPTER1.m3.ta - CHAPTER1.m3.ambitiousCut).toBe(40);
  });
  it('défi du Pôle v3 au temps réglementaire du nouveau tracé, v1 et v2 conservées à part', () => {
    expect(CURRENT_CHALLENGE.id).toBe('defi-pole-v3');
    expect(CURRENT_CHALLENGE.timeAllowed).toBe(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national));
    expect(DEFI_POLE_V2.timeAllowed).toBe(47);
    expect(DEFI_POLE_V1.timeAllowed).toBe(75);
    expect(Object.isFrozen(DEFI_POLE_V2)).toBe(true);
  });
});

describe('réalisme : camion Strides', () => {
  it('porteur 7,5 t, limiteur 90 km/h, freinage d’urgence 6 – 8 m/s²', () => {
    expect(TRUCK_SPEC.massEmpty + 2 * TRUCK_SPEC.massHorse).toBeLessThanOrEqual(7500);
    expect(kmh(TRUCK_SPEC.limiter)).toBe(90);
    expect(TRUCK_SPEC.brakeDecel).toBeGreaterThanOrEqual(6);
    expect(TRUCK_SPEC.brakeDecel).toBeLessThanOrEqual(8);
  });
});

import { tideEvents, tideLevel, realTideHeight, tideCoef, TIDE_EXTREMES } from '../../src/world/weather.js';
import { Terrain } from '../../src/world/terrain.js';
import { TOWN } from '../../src/world/sites.js';
import { WORLD } from '../../src/world/layout.js';
describe('réalisme : marées de Trouville-Deauville (hauteurs affichées)', () => {
  it('marnage ~7 m en vives-eaux, ~3 – 4 m en mortes-eaux, hauteurs au-dessus du zéro des cartes', () => {
    let springs = 0, neaps = 99;
    for (let day = 0; day < 15; day++) {
      const ev = tideEvents(day * 24, 24);
      for (let i = 1; i < ev.length; i++) {
        const range = Math.abs(realTideHeight(ev[i].level) - realTideHeight(ev[i - 1].level));
        springs = Math.max(springs, range);
        neaps = Math.min(neaps, range);
      }
      for (const e of ev) expect(realTideHeight(e.level)).toBeGreaterThan(0);
    }
    expect(springs).toBeGreaterThan(6.3);
    expect(springs).toBeLessThan(8.5);
    expect(neaps).toBeGreaterThan(2.5);
    expect(neaps).toBeLessThan(4.5);
    expect(tideCoef(0)).toBeGreaterThanOrEqual(20);
  });
});

// Marée de vives-eaux (la plus forte de la lunaison) et de mortes-eaux (la plus faible) : pleine et basse mer.
function extremeTides() {
  let ve = null, me = null;
  for (let day = 0; day < 15; day++) {
    const ev = tideEvents(day * 24, 24);
    for (let i = 1; i < ev.length; i++) {
      const pair = { pm: Math.max(ev[i].level, ev[i - 1].level), bm: Math.min(ev[i].level, ev[i - 1].level) };
      pair.range = pair.pm - pair.bm;
      if (!ve || pair.range > ve.range) ve = pair;
      if (!me || pair.range < me.range) me = pair;
    }
  }
  return { ve, me };
}

describe('réalisme : la mer du jeu est la marée réelle (plage de Deauvelle)', () => {
  const terrain = new Terrain(200);
  const { ve, me } = extremeTides();
  const xs = [];
  for (let x = -400; x <= WORLD.half - 6; x += 5) xs.push(x);
  it('le niveau d’eau du jeu est la hauteur affichée par l’app Météo (une seule source)', () => {
    for (let t = 0; t < 48; t += 1.7) expect(realTideHeight(tideLevel(t)) - tideLevel(t)).toBeCloseTo(4.6, 6);
    expect(ve.range).toBeGreaterThan(6.3);
    expect(ve.range).toBeLessThan(8.5);
    expect(me.range).toBeGreaterThan(2.5);
    expect(me.range).toBeLessThan(4.5);
    expect(TIDE_EXTREMES.high).toBeGreaterThanOrEqual(ve.pm - 1e-6);
    expect(TIDE_EXTREMES.low).toBeLessThanOrEqual(ve.bm + 1e-6);
  });
  it('estran large : la mer avance et recule d’au moins 150 m en vives-eaux, d’environ moitié en mortes-eaux', () => {
    for (const x of xs) {
      const ex = terrain.waterlineZ(x, ve.pm) - terrain.waterlineZ(x, ve.bm);
      const exMe = terrain.waterlineZ(x, me.pm) - terrain.waterlineZ(x, me.bm);
      expect(ex).toBeGreaterThanOrEqual(150);
      expect(exMe / ex).toBeGreaterThan(0.35);
      expect(exMe / ex).toBeLessThan(0.65);
    }
  });
  it('pente de l’estran douce (moins de 7 %) et haut de plage sec en pente faible', () => {
    for (const x of [-300, -100, 40, 200, 450]) {
      for (let z = -412; z > -566; z -= 6) expect(terrain.getHeight(x, z) - terrain.getHeight(x, z - 6)).toBeLessThan(0.07 * 6);
      for (let z = -386; z > -404; z -= 6) expect(terrain.getHeight(x, z) - terrain.getHeight(x, z - 6)).toBeLessThan(0.03 * 6);
    }
  });
  it('l’eau n’atteint jamais les Planches et la basse mer reste dans le monde', () => {
    const P = TOWN.planches;
    for (let x = P.x0; x <= P.x1; x += 5) {
      expect(terrain.getHeight(x, P.z - 2)).toBeGreaterThan(TIDE_EXTREMES.high + 0.5);
      // Plusieurs dizaines de mètres de sable sec entre les Planches et la plus haute mer.
      expect(P.z - 2 - terrain.waterlineZ(x, TIDE_EXTREMES.high)).toBeGreaterThan(30);
    }
    for (const x of xs) expect(terrain.waterlineZ(x, TIDE_EXTREMES.low)).toBeGreaterThan(-585);
  });
});

import { hippoLapPoints, HIPPO_LAP, ovalPoint } from '../../src/gameplay/courses.js';
import { HIPPO } from '../../src/world/layout.js';
describe('hippodrome : anneaux du tour de piste sur la piste', () => {
  const radial = ([x, z]) => {
    const lx = x - HIPPO.x, lz = z - HIPPO.z;
    const cx = Math.max(-HIPPO.half, Math.min(HIPPO.half, lx));
    return Math.hypot(lx - cx, lz);
  };
  it('chaque anneau (rayon 3,2 m) et sa zone de passage restent entre la lice intérieure et la lice extérieure', () => {
    const inner = HIPPO.radius - HIPPO.width / 2, outer = HIPPO.radius + HIPPO.width / 2;
    for (const p of hippoLapPoints()) {
      const r = radial(p);
      expect(r - 3.2).toBeGreaterThan(inner);
      expect(r + 3.2).toBeLessThan(outer);
      expect(r - HIPPO_LAP.pass).toBeGreaterThanOrEqual(inner - 1e-9);
      expect(r + HIPPO_LAP.pass).toBeLessThanOrEqual(outer + 1e-9);
    }
  });
  it('aucun anneau dans les stalles de départ ; dernier anneau au poteau d’arrivée', () => {
    const stalls = { x: HIPPO.x - 40, z: HIPPO.z - HIPPO.radius };
    for (const [x, z] of hippoLapPoints()) expect(Math.hypot(x - stalls.x, z - stalls.z)).toBeGreaterThan(12);
    const last = hippoLapPoints().at(-1);
    expect(Math.abs(last[0] - HIPPO.x)).toBeLessThan(1);
    expect(ovalPoint(0, HIPPO_LAP.r)[0]).toBeLessThan(HIPPO.x);
  });
});

// Tracé du parcours du Pôle : enchaînement logique (tournants larges, aucun obstacle sur la trajectoire, lice à distance).
import { CSO_START, CSO_FINISH, CSO_LAYOUT } from '../../src/gameplay/obstacles.js';
import { POLE } from '../../src/world/sites.js';
describe('parcours du Pôle : tracé cohérent', () => {
  // Positions relatives au centre de la carrière, cap de saut = (sin rot, cos rot).
  const layout = CSO_LAYOUT;
  const n = (r) => [Math.sin(r), Math.cos(r)];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  it('départ dans l’axe du 1, arrivée dans l’axe du double 8–9', () => {
    const s = [CSO_START.x - POLE.arena.x, CSO_START.z - POLE.arena.z];
    expect(s[0]).toBe(layout[0][0]);
    expect(Math.abs(cross(n(CSO_START.rot), [layout[0][0] - s[0], layout[0][1] - s[1]]))).toBeLessThan(1e-9);
    const f = [CSO_FINISH.x - POLE.arena.x, CSO_FINISH.z - POLE.arena.z];
    expect(f[1]).toBe(layout[8][1]);
    expect(f[0]).toBeGreaterThan(layout[8][0]);
  });
  it('tournants d’au moins 8 m de rayon entre deux obstacles (arc tangent aux lignes d’abord et de réception)', () => {
    for (let i = 0; i < layout.length - 1; i++) {
      const [ax, az, ar] = layout[i], [bx, bz, br] = layout[i + 1];
      const na = n(ar), nb = n(br);
      const L = [ax + na[0] * 3, az + na[1] * 3], A = [bx - nb[0] * 4, bz - nb[1] * 4];
      const v = [A[0] - L[0], A[1] - L[1]];
      const dot = na[0] * nb[0] + na[1] * nb[1];
      if (dot > 0.999) { expect(Math.abs(cross(na, v))).toBeLessThan(0.3); continue; }
      if (dot < -0.999) { expect(Math.abs(cross(na, v)) / 2).toBeGreaterThanOrEqual(8); continue; }
      const den = cross(na, nb), t = cross(v, nb) / den, u = -cross(v, na) / den;
      expect(t).toBeGreaterThan(0);
      expect(u).toBeGreaterThan(0);
      expect(Math.min(t, u) / Math.tan(Math.acos(dot) / 2)).toBeGreaterThanOrEqual(8);
    }
  });
  it('obstacles dans la carrière, à 8 m au moins de la lice', () => {
    for (const [x, z] of layout) {
      expect(42 - Math.abs(x)).toBeGreaterThanOrEqual(8);
      expect(26 - Math.abs(z)).toBeGreaterThanOrEqual(8);
    }
  });
});
