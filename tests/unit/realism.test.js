import { describe, it, expect } from 'vitest';
import { HORSE } from '../../src/config.js';
import { COURSE_LENGTH, COURSE_SPEED, timeAllowedFor } from '../../src/gameplay/courses.js';
import { DEFI_POLE_V1, DEFI_POLE_V2, CURRENT_CHALLENGE, CHALLENGES } from '../../src/gameplay/challenge.js';
import { STORY } from '../../src/gameplay/story.js';
import { CHAPTER1 } from '../../src/gameplay/story2.js';
import { TRUCK_SPEC } from '../../src/entities/truckPhysics.js';
import { BEACH, beachHeight } from '../../src/world/layout.js';
import { gaitIndex } from '../../src/entities/horse/anim.js';
import { sunPosition, sunTimes, sunDirection } from '../../src/world/sun.js';

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
  it('galop classique au joystick : jusqu’à 35 km/h (galop allongé), sous le grand galop', () => {
    const g = HORSE.gaits.find((x) => x.name === 'GALOP');
    expect(kmh(g.max)).toBeCloseTo(35, 0);
    expect(g.max).toBeLessThan(10.5);
  });
  it('chaque vitesse d’allure est affichée et animée comme cette allure (joystick à fond = galop)', () => {
    HORSE.gaits.forEach((g, i) => expect(gaitIndex(g.speed)).toBe(i));
  });
});

describe('réalisme : épreuves', () => {
  it('temps accordé = longueur / vitesse imposée (350 m/min national, 375 CSI, 400 Grand Prix)', () => {
    expect(COURSE_LENGTH.cso).toBe(375);
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national)).toBe(65);
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.csi)).toBe(60);
    expect(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.gp)).toBe(57);
    // Parcours faisable au galop de concours réglé par défaut (6,2 m/s) sur le tracé mesuré.
    expect(COURSE_LENGTH.cso / 6.2).toBeLessThan(65);
  });
  it('Grand Prix CSI 5★ entre 1,50 et 1,60 m ; qualificative jusqu’à 1,45 m', () => {
    const gp = STORY.find((s) => s.id === 'gp');
    const csi3 = STORY.find((s) => s.id === 'csi3');
    expect(gp.desc).toMatch(/1,50 m à 1,60 m/);
    expect(csi3.desc).toMatch(/1,45 m/);
  });
  it('premier concours (M3) au temps réglementaire national', () => {
    expect(CHAPTER1.m3.ta).toBe(65);
    expect(CHAPTER1.m3.ta - CHAPTER1.m3.ambitiousCut).toBe(60);
  });
  it('défi du Pôle v5 au temps réglementaire du nouveau tracé, v1 à v4 conservées à part', () => {
    expect(CURRENT_CHALLENGE.id).toBe('defi-pole-v5');
    expect(CURRENT_CHALLENGE.timeAllowed).toBe(timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national));
    expect(CURRENT_CHALLENGE.obstacles).toHaveLength(9);
    expect(CHALLENGES['defi-pole-v4'].timeAllowed).toBe(43);
    expect(CHALLENGES['defi-pole-v3'].timeAllowed).toBe(42);
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
  it('estran (plage raccourcie de moitié) : la mer avance et recule d’au moins 75 m en vives-eaux, d’environ moitié en mortes-eaux', () => {
    for (const x of xs) {
      const ex = terrain.waterlineZ(x, ve.pm) - terrain.waterlineZ(x, ve.bm);
      const exMe = terrain.waterlineZ(x, me.pm) - terrain.waterlineZ(x, me.bm);
      expect(ex).toBeGreaterThanOrEqual(75);
      expect(exMe / ex).toBeGreaterThan(0.35);
      expect(exMe / ex).toBeLessThan(0.65);
    }
  });
  it('pente de l’estran (raccourci de moitié) sous 14 % et haut de plage sec en pente faible', () => {
    // Haut de plage sec (profil) : 4 %, du pied des Planches à la berme.
    for (let z = BEACH.wall; z > BEACH.berm; z -= 2) expect(beachHeight(z) - beachHeight(z - 2)).toBeLessThan(0.041 * 2);
    for (const x of [-300, -100, 40, 200, 450]) {
      for (let z = -389; z > -466; z -= 3) expect(terrain.getHeight(x, z) - terrain.getHeight(x, z - 3)).toBeLessThan(0.14 * 3);

    }
  });
  it('l’eau n’atteint jamais les Planches et la basse mer reste dans le monde', () => {
    const P = TOWN.planches;
    for (let x = P.x0; x <= P.x1; x += 5) {
      expect(terrain.getHeight(x, P.z - 2)).toBeGreaterThan(TIDE_EXTREMES.high + 0.5);
      // Une bande de sable sec entre les Planches et la plus haute mer.
      expect(P.z - 2 - terrain.waterlineZ(x, TIDE_EXTREMES.high)).toBeGreaterThan(12);
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
import { CSO_START } from '../../src/gameplay/obstacles.js';
import { CSO_TRACE, CSO_DESIGN } from '../../src/gameplay/csoCourse.js';
import { POLE } from '../../src/world/sites.js';
describe('parcours du Pôle : tracé cohérent', () => {
  // Positions relatives au centre de la carrière (120 × 76 m), cap de saut = (sin rot, cos rot).
  const { pts, fences, marks } = CSO_TRACE;
  const STRIDE = 3.5; // foulée de galop de concours (m)
  const HW = POLE.arena.w / 2, HD = POLE.arena.d / 2;
  it('carrière aux dimensions d’un terrain international', () => {
    expect(POLE.arena.w).toBeGreaterThanOrEqual(120);
    expect(POLE.arena.d).toBeGreaterThanOrEqual(76);
  });
  it('8 obstacles numérotés et un double 5A – 5B à deux foulées, éléments alignés', () => {
    expect(fences.map((f) => f.label)).toEqual(['1', '2', '3', '4', '5A', '5B', '6', '7', '8']);
    const a = fences[4], b = fences[5];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    expect(Math.abs(a.rot - b.rot)).toBeLessThan(1e-9);
    // Réception (~2,4 m), deux foulées, nouvel appel (~2,4 m).
    expect(d).toBeGreaterThanOrEqual(2.4 * 2 + 2 * STRIDE - 0.5);
    expect(d).toBeLessThanOrEqual(2.4 * 2 + 2 * STRIDE + 1);
    expect(fences.filter((f) => f.kind === 'o').length).toBeGreaterThanOrEqual(4);
    expect(fences.filter((f) => f.kind === 'v').length).toBeGreaterThanOrEqual(3);
  });
  it('obstacle isolé : 5 foulées au moins d’approche en ligne droite, 8 m de réception dégagée', () => {
    const cmds = CSO_DESIGN.cmds;
    cmds.forEach((c, i) => {
      if (c[0] !== 'J' || /B$/.test(c[1])) return;
      let before = 0, after = 0;
      for (let j = i - 1; j >= 0 && cmds[j][0] !== 'L' && cmds[j][0] !== 'R'; j--) if (cmds[j][0] === 'F') before += cmds[j][1];
      for (let j = i + 1; j < cmds.length && cmds[j][0] !== 'L' && cmds[j][0] !== 'R'; j++) if (cmds[j][0] === 'F') after += cmds[j][1];
      expect(before).toBeGreaterThanOrEqual(5 * STRIDE - 0.5);
      if (!/A$/.test(c[1])) expect(after).toBeGreaterThanOrEqual(8);
    });
  });
  it('départ dans l’axe du 1, arrivée dans l’axe du 8, lignes placées dans la carrière', () => {
    expect(CSO_START.x - POLE.arena.x).toBeCloseTo(marks.start.x, 6);
    const f1 = fences[0];
    expect(Math.abs(Math.sin(marks.start.rot) * (f1.z - marks.start.z) - Math.cos(marks.start.rot) * (f1.x - marks.start.x))).toBeLessThan(1e-6);
    const last = fences[fences.length - 1];
    expect(Math.abs(Math.sin(last.rot) * (marks.finish.z - last.z) - Math.cos(last.rot) * (marks.finish.x - last.x))).toBeLessThan(1e-6);
    expect(marks.finish.s).toBeGreaterThan(last.s + 6);
  });
  it('grandes courbes (10 m de rayon au moins), changement de main', () => {
    const turns = CSO_DESIGN.cmds.filter((c) => c[0] === 'L' || c[0] === 'R');
    for (const t of turns) expect(t[1]).toBeGreaterThanOrEqual(10);
    expect(turns.some((t) => t[0] === 'L')).toBe(true);
    expect(turns.some((t) => t[0] === 'R')).toBe(true);
  });
  it('ligne du cavalier dans la carrière, obstacles à 8 m au moins de la lice', () => {
    for (const p of pts) {
      expect(HW - Math.abs(p.x)).toBeGreaterThanOrEqual(6);
      expect(HD - Math.abs(p.z)).toBeGreaterThanOrEqual(6);
    }
    for (const f of fences) {
      expect(HW - Math.abs(f.x)).toBeGreaterThanOrEqual(8);
      expect(HD - Math.abs(f.z)).toBeGreaterThanOrEqual(8);
    }
  });
  it('la ligne ne frôle aucun autre obstacle (4,5 m au moins des barres et des ailes)', () => {
    for (const f of fences) {
      const n = [Math.sin(f.rot), Math.cos(f.rot)], t = [Math.cos(f.rot), -Math.sin(f.rot)];
      for (const p of pts) {
        if (Math.abs(p.s - f.s) < 8) continue;
        const dx = p.x - f.x, dz = p.z - f.z;
        const ds = Math.max(0, Math.abs(dx * n[0] + dz * n[1]) - 0.8), du = Math.max(0, Math.abs(dx * t[0] + dz * t[1]) - 3.0);
        expect(Math.hypot(ds, du)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('réalisme : course du soleil à Deauville (23 août)', () => {
  it('lever ~7 h, midi solaire ~14 h (heure d’été), coucher ~21 h, ~14 h de jour', () => {
    const t = sunTimes();
    expect(t.sunrise).toBeGreaterThan(6.8);
    expect(t.sunrise).toBeLessThan(7.2);
    expect(t.noon).toBeGreaterThan(13.8);
    expect(t.noon).toBeLessThan(14.2);
    expect(t.sunset - t.sunrise).toBeGreaterThan(13.7);
    expect(t.sunset - t.sunrise).toBeLessThan(14.3);
  });
  it('culmine plein sud à 90° − latitude + déclinaison (~52°)', () => {
    const p = sunPosition(sunTimes().noon);
    expect(p.alt).toBeCloseTo(90 - 49.36 + p.decl, 0);
    expect(p.alt).toBeGreaterThan(50);
    expect(p.alt).toBeLessThan(54);
    expect(Math.abs(p.az - 180)).toBeLessThan(1);
  });
  it('se lève à l’est-nord-est, se couche à l’ouest-nord-ouest ; dans le monde : est = +x, nord (la mer) = -z', () => {
    const t = sunTimes();
    expect(sunPosition(t.sunrise).az).toBeGreaterThan(60);
    expect(sunPosition(t.sunrise).az).toBeLessThan(80);
    expect(sunPosition(t.sunset).az).toBeGreaterThan(280);
    expect(sunPosition(t.sunset).az).toBeLessThan(300);
    const v = sunDirection(t.noon, {});
    expect(v.z).toBeGreaterThan(0.5); // plein sud : vers +z, dos à la mer
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 6);
    expect(sunDirection(10, {}).x).toBeGreaterThan(0);
    expect(sunDirection(0, {}).y).toBeLessThan(-0.3); // nuit noire à minuit (minuit solaire vers 2 h)
  });
});
