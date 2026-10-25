// Obstacles de saut (CSO, cross, entraînement) : détection du franchissement, barres tombées, refus, aide à l'appel.
import * as THREE from 'three';
import { showJumpGeo, railGeo, logJumpGeo, brushJumpGeo, partsToGeo, box } from '../world/builders.js';
import { POLE, HOME } from '../world/sites.js';
import { XC_PATH, POND } from '../world/layout.js';
import { pointAlong, polylineLength, clamp } from '../core/math.js';
import { HORSE } from '../config.js';
import { signTexture } from '../world/textures.js';
import { applySurfaces } from '../world/surfaces.js';
import { addCloudShadows } from '../world/sky.js';

// Bois peint satiné (barres, chandeliers), métal des taquets.
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
MAT.onBeforeCompile = (sh) => addCloudShadows(sh);
MAT.customProgramCacheKey = () => 'obstacles';
let wallMat = null;
const COLORS = [
  ['#f2f1ec', '#17181b'],
  ['#f2f1ec', '#b8322a'],
  ['#f2f1ec', '#2f5f8a'],
  ['#f2f1ec', '#2f6e4a'],
  ['#17181b', '#f2f1ec'],
];

// Parcours de CSO du Pôle International (positions relatives au centre de la carrière).
const CSO_LAYOUT = [
  [-30, 10, Math.PI, 'v'],
  [-30, -12, Math.PI, 'o'],
  [-8, -19, Math.PI / 2, 'v'],
  [14, -19, Math.PI / 2, 'o'],
  [32, -6, 0, 'v'],
  [32, 14, 0, 'w'],
  [8, 19, -Math.PI / 2, 'v'],
  [-12, 4, (3 * Math.PI) / 4, 'o'],
  [6, -6, (3 * Math.PI) / 4, 'v'],
];
export const CSO_FINISH = { x: POLE.arena.x + 17, z: POLE.arena.z - 15, rot: (3 * Math.PI) / 4, w: 7 };
export const CSO_START = { x: POLE.arena.x - 34, z: POLE.arena.z + 21, rot: Math.PI };

function xcLayout() {
  const L = polylineLength(XC_PATH);
  // Saut d'entrée dans la mare : juste avant l'eau.
  let waterS = L * 0.42;
  for (let s = 0; s < L; s += 1) {
    const p = pointAlong(XC_PATH, s);
    if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 4) {
      waterS = s - 3;
      break;
    }
  }
  const fr = [0.07, 0.15, 0.24, 0.32, -1, 0.55, 0.64, 0.73, 0.82, 0.91];
  const kinds = ['log', 'brush', 'log', 'brush', 'water', 'log', 'brush', 'log', 'brush', 'log'];
  return fr.map((f, i) => {
    const p = pointAlong(XC_PATH, f < 0 ? waterS : L * f);
    return { x: p.x, z: p.z, rot: p.dir, kind: kinds[i] };
  });
}

export class Obstacles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.fallen = [];
    this._build();
  }

  add(o) {
    const ob = {
      w: 3.6, h: 1.1, depth: 0.3, kind: 'v', solid: false, colors: COLORS[0], course: null, num: 0, knocked: false,
      prevS: null, ...o,
    };
    ob.ground = this.game.terrain.getHeight(ob.x, ob.z);
    ob.n = { x: Math.sin(ob.rot), z: Math.cos(ob.rot) };
    ob.t = { x: Math.cos(ob.rot), z: -Math.sin(ob.rot) };
    this._mesh(ob);
    this.list.push(ob);
    return ob;
  }

  _mesh(ob) {
    const g = new THREE.Group();
    g.position.set(ob.x, ob.ground, ob.z);
    g.rotation.y = ob.rot;
    // L'obstacle s'étend le long de l'axe local X (perpendiculaire au sens de saut).
    ob.rails = [];
    if (ob.kind === 'log') {
      g.add(new THREE.Mesh(logJumpGeo(ob.w, ob.h), MAT));
    } else if (ob.kind === 'brush' || ob.kind === 'water') {
      g.add(new THREE.Mesh(brushJumpGeo(ob.w, ob.h), MAT));
    } else if (ob.kind === 'w') {
      // Mur de CSO : blocs peints façon briques (joints blancs), couvertine, piliers.
      wallMat ||= applySurfaces(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), this.game.world.detailTex, () => this.game.terrain);
      const wall = partsToGeo([
        [box(ob.w, ob.h - 0.15, 0.5), '#a4553f'],
        [box(ob.w + 0.04, 0.1, 0.56), '#e9e6de', { y: ob.h - 0.25 }],
      ]);
      g.add(new THREE.Mesh(wall, wallMat));
      g.add(new THREE.Mesh(partsToGeo([
        [box(0.5, ob.h + 0.35, 0.6), '#a4553f', { x: -ob.w / 2 - 0.3 }],
        [box(0.5, ob.h + 0.35, 0.6), '#a4553f', { x: ob.w / 2 + 0.3 }],
        [box(0.6, 0.1, 0.7), '#e9e6de', { x: -ob.w / 2 - 0.3, y: ob.h + 0.35 }],
        [box(0.6, 0.1, 0.7), '#e9e6de', { x: ob.w / 2 + 0.3, y: ob.h + 0.35 }],
      ]), wallMat));
      const top = new THREE.Mesh(railGeo(ob.w, ob.colors), MAT);
      top.position.y = ob.h - 0.05;
      g.add(top);
      ob.rails.push(top);
    } else {
      const oxer = ob.kind === 'o';
      g.add(new THREE.Mesh(showJumpGeo(ob.w, ob.h, ob.colors, oxer), MAT));
      const heights = [ob.h, ob.h * 0.62, ob.h * 0.3];
      for (const hh of heights) {
        const r = new THREE.Mesh(railGeo(ob.w, ob.colors), MAT);
        r.position.y = hh;
        g.add(r);
        ob.rails.push(r);
      }
      if (oxer) {
        const r = new THREE.Mesh(railGeo(ob.w, ob.colors), MAT);
        r.position.set(0, ob.h + 0.05, 1.2);
        g.add(r);
        ob.rails.push(r);
        ob.depth = 1.4;
      }
    }
    if (ob.num) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: signTexture(String(ob.num), '', { dark: true, w: 128, h: 128 }), side: THREE.DoubleSide }));
      sign.position.set(-ob.w / 2 - 0.65, ob.h + 0.75, 0);
      g.add(sign);
      ob.sign = sign;
    }
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    ob.rails.forEach((r) => (r.userData.rest = { y: r.position.y, z: r.position.z, rx: r.rotation.x }));
    ob.group = g;
    this.group.add(g);
  }

  _build() {
    const A = POLE.arena;
    CSO_LAYOUT.forEach(([dx, dz, rot, kind], i) => {
      this.add({ x: A.x + dx, z: A.z + dz, rot, kind, h: 1.15, w: 3.8, num: i + 1, course: 'cso', colors: COLORS[i % COLORS.length] });
    });
    xcLayout().forEach((p, i) => {
      this.add({ x: p.x, z: p.z, rot: p.rot, kind: p.kind, h: p.kind === 'log' ? 0.95 : 1.05, w: 4.2, num: i + 1, course: 'xc', solid: true });
    });
    // Lignes de départ et d'arrivée : fanions (rouge à droite, blanc à gauche) et cellules de chronométrage.
    for (const L of [{ ...CSO_START, w: 7 }, CSO_FINISH]) this._timingLine(L);
    const H = HOME.arena;
    this.add({ x: H.x - 9, z: H.z, rot: Math.PI / 2, kind: 'v', h: 0.75, w: 3.2, course: 'home', id: 'home1' });
    this.add({ x: H.x + 10, z: H.z, rot: -Math.PI / 2, kind: 'o', h: 1.0, w: 3.2, course: 'home', id: 'home2', colors: COLORS[1] });
    const W = POLE.warmup;
    this.add({ x: W.x, z: W.z - 9, rot: Math.PI / 2, kind: 'v', h: 1.1, w: 3.4, course: 'warmup' });
    this.add({ x: W.x, z: W.z + 10, rot: -Math.PI / 2, kind: 'o', h: 1.0, w: 3.4, course: 'warmup', colors: COLORS[1] });
  }

  _timingLine(L) {
    const parts = [];
    for (const side of [-1, 1]) {
      const x = side * L.w / 2;
      parts.push([box(0.06, 1.6, 0.06), '#f2f1ec', { x }]);
      parts.push([box(0.012, 0.36, 0.5, false), side < 0 ? '#c62b2b' : '#f4f3ee', { x: x + 0.03 * side, y: 1.38, z: 0.25 }]);
      // Cellule photoélectrique sur trépied.
      const cx = x + side * 0.6;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        parts.push([box(0.025, 0.95, 0.025, false), '#2b2c30', { x: cx + Math.cos(a) * 0.16, y: 0.45, z: Math.sin(a) * 0.16, rx: Math.sin(a) * 0.17, rz: -Math.cos(a) * 0.17 }]);
      }
      parts.push([box(0.12, 0.1, 0.16), '#f0c419', { x: cx, y: 0.9 }]);
      parts.push([box(0.05, 0.05, 0.02), '#c62b2b', { x: cx - side * 0.06, y: 0.93, z: 0.0 }]);
    }
    const m = new THREE.Mesh(partsToGeo(parts), MAT);
    m.position.set(L.x, this.game.terrain.getHeight(L.x, L.z), L.z);
    m.rotation.y = L.rot;
    m.castShadow = true;
    this.group.add(m);
  }

  ofCourse(id) {
    return this.list.filter((o) => o.course === id).sort((a, b) => a.num - b.num);
  }

  setHeights(courseId, heights) {
    for (const o of this.ofCourse(courseId)) {
      const nh = heights[o.num - 1] ?? o.h;
      if (Math.abs(nh - o.h) < 1e-3) continue;
      o.h = nh;
      this.group.remove(o.group);
      this._mesh(o);
    }
  }

  resetRails(courseId) {
    for (const o of this.list) {
      if (courseId && o.course !== courseId) continue;
      o.knocked = false;
      for (const r of o.rails) {
        r.position.y = r.userData.rest.y;
        r.position.z = r.userData.rest.z;
        r.rotation.x = r.userData.rest.rx;
        r.rotation.z = 0;
        r.userData.fall = null;
      }
    }
  }

  knock(o) {
    o.knocked = true;
    const r = o.rails[0];
    if (r) r.userData.fall = { t: 0, dir: Math.random() < 0.5 ? 1 : -1 };
  }

  _localS(o, x, z) {
    return { s: (x - o.x) * o.n.x + (z - o.z) * o.n.z, u: (x - o.x) * o.t.x + (z - o.z) * o.t.z };
  }

  // Aide à l'appel : renvoie 'good' | 'near' | 'none' pour l'obstacle devant.
  timing(horse) {
    if (!horse || horse.jumpT >= 0 || horse.speed < HORSE.minJumpSpeed) return this._nearAhead(horse) ? 'near' : 'none';
    const o = this._nearAhead(horse);
    if (!o) return 'none';
    const f = horse.forward;
    const p = { x: horse.pos.x + f.x * 0.4, z: horse.pos.z + f.z * 0.4 };
    const { s } = this._localS(o, p.x, p.z);
    const dir = f.x * o.n.x + f.z * o.n.z;
    const dist = Math.abs(s) / Math.max(0.3, Math.abs(dir));
    const tau = dist / horse.speed / HORSE.jumpDuration;
    if (tau <= 0 || tau >= 1) return 'near';
    const k = 0.72 + 0.28 * Math.min(1, Math.max(0, (horse.speed - 4) / 4.5));
    const peak = horse.jumpPower * k;
    const clear = 4 * peak * tau * (1 - tau) + 0.2 + horse.mods.clearance;
    return clear >= o.h + 0.04 ? 'good' : 'near';
  }

  _nearAhead(horse) {
    if (!horse) return null;
    const f = horse.forward;
    let best = null;
    let bestD = 18;
    for (const o of this.list) {
      const dx = o.x - horse.pos.x, dz = o.z - horse.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const dir = f.x * o.n.x + f.z * o.n.z;
      if (Math.abs(dir) < 0.6) continue;
      const { s, u } = this._localS(o, horse.pos.x, horse.pos.z);
      if (Math.abs(u) > o.w / 2 + 0.8) continue;
      // Devant le cheval, dans le sens de sa marche.
      if (s * Math.sign(dir) > -0.3) continue;
      best = o;
      bestD = d;
    }
    return best;
  }

  // Appelé après le déplacement du cheval du joueur.
  updateHorse(horse, prevX, prevZ) {
    const g = this.game;
    const f = horse.forward;
    const px = horse.pos.x + f.x * 0.4, pz = horse.pos.z + f.z * 0.4;
    const ppx = prevX + f.x * 0.4, ppz = prevZ + f.z * 0.4;
    // Après un refus, le cheval doit se détourner ou reprendre du champ avant qu'un nouveau refus compte.
    const ref = horse._refusal;
    if (ref && !ref.away) {
      const { s } = this._localS(ref.o, horse.pos.x, horse.pos.z);
      if ((f.x * ref.o.n.x + f.z * ref.o.n.z) * Math.sign(s) > 0 || Math.abs(s) > ref.o.depth / 2 + 6) ref.away = true;
    }
    for (const o of this.list) {
      if (Math.abs(o.x - px) > 12 || Math.abs(o.z - pz) > 12) continue;
      const a = this._localS(o, ppx, ppz);
      const b = this._localS(o, px, pz);
      const half = o.w / 2 + 0.35;
      const depth = o.depth / 2 + 0.1;
      const crossing = (a.s < -depth && b.s >= -depth) || (a.s > depth && b.s <= depth);
      const inWidth = Math.abs(b.u) < half;
      if (!inWidth) continue;
      const airborne = horse.jumpT >= 0;
      if (crossing && !airborne) {
        // Refus : repousser le cheval avant l'obstacle.
        const side = a.s < 0 ? -1 : 1;
        const back = side * (depth + 1.7);
        horse.pos.x = o.x + o.n.x * back + o.t.x * b.u - f.x * 0.4;
        horse.pos.z = o.z + o.n.z * back + o.t.z * b.u - f.z * 0.4;
        horse.refuse();
        // Cheval resté face à l'obstacle (joystick toujours poussé) : même refus, compté une seule fois
        // tant qu'il ne s'est pas détourné ou n'est pas resté plusieurs secondes sans le représenter.
        const again = ref && ref.o === o && !ref.away && g.time - ref.t < 5;
        horse._refusal = { o, t: g.time, away: false };
        if (!again) g.bus.emit('obstacle:refusal', { obstacle: o, dir: side < 0 ? 1 : -1 });
        continue;
      }
      if (crossing && airborne) {
        // Mesure de la hauteur au centre de l'obstacle.
        const clear = horse.jumpY + 0.2 + horse.mods.clearance;
        const dir = a.s < 0 ? 1 : -1;
        if (clear >= o.h) {
          g.bus.emit('obstacle:clear', { obstacle: o, dir, margin: clear - o.h });
        } else {
          if (!o.solid) this.knock(o);
          g.bus.emit('obstacle:fault', { obstacle: o, dir, margin: clear - o.h });
          if (o.solid) horse.speed *= 0.55;
        }
      }
    }
  }

  // Piéton : les obstacles sont des murets.
  blockHuman(human) {
    for (const o of this.list) {
      if (Math.abs(o.x - human.pos.x) > 6 || Math.abs(o.z - human.pos.z) > 6) continue;
      const { s, u } = this._localS(o, human.pos.x, human.pos.z);
      const hd = o.depth / 2 + 0.35;
      if (Math.abs(u) < o.w / 2 + 0.2 && Math.abs(s) < hd) {
        const push = (Math.sign(s) || 1) * hd - s;
        human.pos.x += o.n.x * push;
        human.pos.z += o.n.z * push;
      }
    }
  }

  // Chute d'une barre : un bout quitte son taquet, l'autre suit ; rebonds amortis puis roulement sur le sol.
  update(dt) {
    const G = 9.81, R = 0.05;
    for (const o of this.list) {
      for (const r of o.rails) {
        const f = r.userData.fall;
        if (!f || f.done) continue;
        if (!f.ends) {
          const y0 = r.userData.rest.y;
          f.ends = [{ y: y0, vy: 0, t0: 0 }, { y: y0, vy: 0, t0: 0.08 + Math.random() * 0.14 }];
          if (Math.random() < 0.5) f.ends.reverse();
          f.z = r.userData.rest.z;
          f.vz = f.dir * (0.7 + Math.random() * 0.9);
          f.roll = 0;
        }
        f.t += dt;
        let resting = true;
        for (const e of f.ends) {
          if (f.t < e.t0) { resting = false; continue; }
          e.vy -= G * dt;
          e.y += e.vy * dt;
          if (e.y <= R) {
            e.y = R;
            if (Math.abs(e.vy) > 0.6) {
              e.vy = -e.vy * 0.28;
              if (!f.clonk) { f.clonk = true; this.game.audio?.thud?.(); }
            } else e.vy = 0;
          }
          if (e.y > R + 1e-3 || e.vy !== 0) resting = false;
        }
        // Glisse/roule vers l'avant, freinée par le sable.
        if (f.ends[0].y <= R + 0.02 && f.ends[1].y <= R + 0.02) {
          f.vz *= Math.exp(-2.6 * dt);
          if (Math.abs(f.vz) > 0.02) resting = false;
        }
        f.z += f.vz * dt;
        f.roll += (f.vz * dt) / R;
        const w = o.w;
        r.position.y = (f.ends[0].y + f.ends[1].y) / 2;
        r.position.z = f.z;
        r.rotation.z = Math.atan2(f.ends[1].y - f.ends[0].y, w);
        r.rotation.x = f.roll;
        if (resting && f.t > 0.5) f.done = true;
      }
    }
  }

  // Marqueurs numérotés visibles seulement pendant un parcours.
  highlight(courseId, num) {
    for (const o of this.list) {
      if (!o.sign) continue;
      o.sign.material.color.set(o.course === courseId && o.num === num ? '#7dffc4' : '#ffffff');
    }
  }
}

export { clamp };
