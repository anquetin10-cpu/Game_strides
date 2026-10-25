// Vie ambiante : chevaux au paddock, cavaliers à l'entraînement, passants, spectateurs, circulation.
import * as THREE from 'three';
import { GrazeAI, PathAI } from '../entities/horse.js';
import { randomOutfit } from '../entities/humanModel.js';
import { HOME, HARAS, DUNES, POLE, TOWN_BLOCKS } from '../world/sites.js';
import { ROADS, HIPPO } from '../world/layout.js';
import { CHATTER } from './data.js';
import { mulberry32, pick, polylineLength, pointAlong, dampAngle, clamp } from '../core/math.js';
import { carGeo, carMaterial, unitWheelGeo, CARS } from '../world/props.js';
import { ovalPoint } from './courses.js';

const COATS = ['bay', 'chestnut', 'grey', 'black', 'palomino', 'darkbay', 'white'];

class WalkAI {
  constructor(points, speed = 1.3, game) {
    this.points = points;
    this.i = 0;
    this.speed = speed;
    this.game = game;
    this.wait = 0;
  }
  update(h, dt) {
    const g = this.game;
    const p = g.player.focus.pos;
    const dp = Math.hypot(p.x - h.pos.x, p.z - h.pos.z);
    if (h.talking > 0 || dp < 2.2) {
      h.talking = Math.max(0, (h.talking || 0) - dt);
      h.speed = 0;
      h.heading = dampAngle(h.heading, Math.atan2(p.x - h.pos.x, p.z - h.pos.z), 6, dt);
      return;
    }
    if (this.wait > 0) {
      this.wait -= dt;
      h.speed = 0;
      return;
    }
    const t = this.points[this.i];
    const dx = t[0] - h.pos.x, dz = t[1] - h.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) {
      this.i = (this.i + 1) % this.points.length;
      if (Math.random() < 0.15) this.wait = 2 + Math.random() * 4;
      return;
    }
    h.heading = dampAngle(h.heading, Math.atan2(dx, dz), 5, dt);
    h.speed = this.speed;
    h.pos.x += Math.sin(h.heading) * h.speed * dt;
    h.pos.z += Math.cos(h.heading) * h.speed * dt;
  }
}

// Agglomération de Deauvelle (limitation à 50 km/h), d'après l'emprise des îlots.
const TOWN_BOX = (() => {
  const b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
  for (const [x0, x1, z0, z1] of TOWN_BLOCKS) {
    b.x0 = Math.min(b.x0, x0 - 30);
    b.x1 = Math.max(b.x1, x1 + 30);
    b.z0 = Math.min(b.z0, z0 - 30);
    b.z1 = Math.max(b.z1, z1 + 30);
  }
  return b;
})();

// Voiture de la circulation : 50 km/h en ville, 70 km/h sur les routes de campagne, 20 km/h en croisant des chevaux,
// arrêt progressif devant un obstacle (distance de freinage selon la vitesse), roues qui tournent, caisse qui suit
// la pente et plonge au freinage ; en bout de route, arrêt puis demi-tour lent d'une voie à l'autre (immédiat hors de vue).
const LANE = 2.2;
class Car {
  constructor(game, road, color, offset, kind = 'sedan') {
    this.game = game;
    this.road = road;
    this.len = polylineLength(road.pts);
    this.s = offset * this.len;
    this.dir = offset > 0.5 ? -1 : 1;
    this.speed = 0;
    this.accel = 0;
    this.cruise = 0.88 + Math.random() * 0.2;
    this.wait = 0;
    this.kind = kind;
    this.spec = CARS[kind] || CARS.sedan;
    this.spin = 0;
    this.pitch = 0;
    this.slope = 0;
    this.braking = false;
    this.uturn = null;
    this.endWait = 0;
    const g = new THREE.Group();
    const m = new THREE.Mesh(carGeo(color, kind, { wheels: false }), carMaterial());
    m.castShadow = true;
    g.add(m);
    g.rotation.order = 'YXZ';
    game.scene.add(g);
    this.mesh = g;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this._place();
  }
  _place() {
    const p = pointAlong(this.road.pts, this.s);
    const dir = this.dir > 0 ? p.dir : p.dir + Math.PI;
    const u = this.uturn;
    if (u) {
      // Demi-tour : demi-cercle vers la gauche, de la voie de droite à la voie opposée.
      const fx = Math.sin(dir), fz = Math.cos(dir), rx = Math.cos(dir), rz = -Math.sin(dir);
      const c = Math.cos(u.th), sn = Math.sin(u.th);
      this._pose(p.x - (rx * c - fx * sn) * LANE, p.z - (rz * c - fz * sn) * LANE, dir + u.th);
      return;
    }
    // Voie de droite.
    const rx = Math.cos(dir), rz = -Math.sin(dir);
    this._pose(p.x - rx * LANE, p.z - rz * LANE, dir);
  }
  // Pose de la caisse : hauteur prise aux deux essieux.
  _pose(x, z, heading) {
    const fx = Math.sin(heading), fz = Math.cos(heading), hb = this.spec.wb / 2;
    const T = this.game.terrain;
    this.pos.set(x, 0, z);
    const hf = T.getHeight(this.pos.x + fx * hb, this.pos.z + fz * hb);
    const hr = T.getHeight(this.pos.x - fx * hb, this.pos.z - fz * hb);
    this.pos.y = (hf + hr) / 2;
    this.slope = Math.atan2(hr - hf, this.spec.wb);
    this.heading = heading;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
    this.mesh.rotation.x = this.slope + this.pitch;
  }
  update(dt, camPos) {
    const g = this.game;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const inTown = this.pos.x > TOWN_BOX.x0 && this.pos.x < TOWN_BOX.x1 && this.pos.z > TOWN_BOX.z0 && this.pos.z < TOWN_BOX.z1;
    let limit = (inTown ? 13.9 : 19.4) * this.cruise;
    // Obstacles devant : distance d'observation croissante avec la vitesse.
    const look = 8 + this.speed * 1.5;
    let gap = Infinity, byPlayer = false;
    const rel = (p) => {
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
      return { ahead: dx * fx + dz * fz, side: Math.abs(dx * fz - dz * fx) };
    };
    const block = (p) => {
      const { ahead, side } = rel(p);
      if (ahead > 0 && ahead < look && side < 2.6) {
        gap = Math.min(gap, ahead);
        return true;
      }
      return false;
    };
    // Cavalier : la voiture attend derrière le cheval sans klaxonner.
    if (block(g.player.focus.pos) && g.player.mode !== 'ride') byPlayer = true;
    for (const v of g.vehicles) if (v !== this && v.pos) block(v.pos);
    // Code de la route : on croise et on dépasse les chevaux au pas (20 km/h), sans klaxonner.
    for (const h of g.horses) {
      if (h.hiddenInTruck || !h.pos) continue;
      block(h.pos);
      const { ahead, side } = rel(h.pos);
      if (ahead > -8 && ahead < 45 && side < 8) limit = Math.min(limit, 5.5);
    }
    // Bout de route : demi-tour immédiat hors de vue ; sinon freinage à la distance d'arrêt (≈ 5 m/s²),
    // court arrêt puis demi-tour au pas une fois la place libre.
    const far = Math.hypot(camPos.x - this.pos.x, camPos.z - this.pos.z);
    const toEnd = this.dir > 0 ? this.len - this.s : this.s;
    if (this.uturn) limit = 2.2;
    else if (toEnd < 14 && far > 160) {
      this.dir *= -1;
      this.speed *= 0.3;
    } else if (toEnd < (this.speed * this.speed) / 10 + 12) {
      gap = Math.min(gap, Math.max(0, toEnd - 5));
      if (toEnd < 14 && this.speed < 0.3) {
        this.endWait += dt;
        if (this.endWait > 1.5 && this._turnClear()) this.uturn = { th: 0 };
      }
    }
    if (!this.uturn && this.speed >= 0.3) this.endWait = 0;
    // Vitesse visée : limitation, puis freinage doux (≈ 5 m/s²) pour s'arrêter 5 m avant l'obstacle.
    let target = limit;
    if (gap < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, 10 * (gap - 5))));
    const prev = this.speed;
    this.speed += clamp(target - this.speed, -9 * dt, 2.6 * dt);
    this.accel = (this.speed - prev) / Math.max(dt, 1e-3);
    if (byPlayer && this.speed < 0.5) {
      this.wait += dt;
      if (this.wait > 4 && Math.hypot(g.player.focus.pos.x - this.pos.x, g.player.focus.pos.z - this.pos.z) < 14) {
        this.wait = -5;
        g.audio.horn();
      }
    } else if (this.wait > 0) this.wait = 0;
    else this.wait = Math.min(0, this.wait + dt);
    if (this.uturn) {
      this.uturn.th += (this.speed * dt) / LANE;
      if (this.uturn.th >= Math.PI) {
        this.uturn = null;
        this.endWait = 0;
        this.dir *= -1;
      }
    } else this.s = clamp(this.s + this.speed * dt * this.dir, 4, this.len - 4);
    this.spin += (this.speed * dt) / this.spec.r;
    // Suspension : la caisse plonge au freinage et se cabre à l'accélération.
    const pt = clamp(-this.accel * 0.005, -0.02, 0.035);
    this.pitch += (pt - this.pitch) * Math.min(1, dt * 5);
    this._place();
    this.mesh.visible = far < 300;
    this.braking = this.accel < -0.8 || this.speed < 0.3;
  }
  // Pas de demi-tour tant que le joueur ou un cheval se trouve sur sa trajectoire.
  _turnClear() {
    const g = this.game;
    const cx = this.pos.x + Math.sin(this.heading) * LANE, cz = this.pos.z + Math.cos(this.heading) * LANE;
    const near = (p) => Math.hypot(p.x - cx, p.z - cz) < LANE + 4.5;
    if (near(g.player.focus.pos)) return false;
    return !g.horses.some((h) => !h.hiddenInTruck && h.pos && near(h.pos));
  }
}

// Effets de toute la circulation en trois appels de dessin : roues animées, optiques (phares, feux arrière et
// feux stop, allumés la nuit et sous la pluie) et faisceaux des phares sur la chaussée.
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(64, 128);
  for (let j = 0; j < 128; j++) {
    for (let i = 0; i < 64; i++) {
      // v : 0 au pare-chocs, 1 au bout du faisceau ; code européen plus long côté droit (accotement).
      const v = 1 - j / 127, u = (i / 63) * 2 - 1;
      const w = 0.42 + 0.58 * v;
      const a = Math.max(0, 1 - (u / w) ** 2) * Math.pow(1 - v, 1.25) * Math.min(1, v * 7) * (u < 0 ? 0.8 + 0.2 * (1 - v) : 1);
      const o = (j * 64 + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = a * 255;
    }
  }
  x.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

class TrafficFx {
  constructor(scene, n) {
    this.wheels = new THREE.InstancedMesh(unitWheelGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 }), n * 4);
    this.wheels.castShadow = true;
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false };
    this.lights = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.4), new THREE.MeshBasicMaterial({ map: glowTexture(), ...add }), n * 4);
    this.lights.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 12), 3);
    const bg = new THREE.PlaneGeometry(6.5, 26);
    bg.rotateX(-Math.PI / 2);
    bg.rotateY(Math.PI);
    bg.translate(0, 0, 13);
    this.beams = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ map: beamTexture(), ...add }), n);
    this.beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    for (const m of [this.wheels, this.lights, this.beams]) {
      m.frustumCulled = false;
      m.renderOrder = m === this.wheels ? 0 : 4;
      scene.add(m);
    }
    this._car = new THREE.Matrix4();
    this._loc = new THREE.Matrix4();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  update(cars, on) {
    const { _car: car, _loc: loc, _m: m, _q: q, _e: e, _v: v, _s: sc } = this;
    const lc = this.lights.instanceColor.array, bc = this.beams.instanceColor.array;
    cars.forEach((c, i) => {
      const C = c.spec, hw = C.W / 2;
      if (!c.mesh.visible) {
        for (let k = 0; k < 4; k++) {
          this.wheels.setMatrixAt(i * 4 + k, this._zero);
          this.lights.setMatrixAt(i * 4 + k, this._zero);
        }
        this.beams.setMatrixAt(i, this._zero);
        return;
      }
      // Roues : sur la route (pas de tangage de caisse), en rotation autour de l'essieu.
      e.set(c.slope, c.heading, 0);
      car.compose(c.pos, q.setFromEuler(e), sc.set(1, 1, 1));
      let k = 0;
      for (const sx of [-1, 1]) {
        for (const zw of [C.wb / 2, -C.wb / 2]) {
          loc.compose(v.set(sx * (hw - 0.14), C.r, zw), q.setFromEuler(e.set(c.spin, 0, 0)), sc.set(C.r, C.r, C.r));
          this.wheels.setMatrixAt(i * 4 + k++, m.multiplyMatrices(car, loc));
        }
      }
      // Optiques : sur la caisse (avec son tangage).
      e.set(c.slope + c.pitch, c.heading, 0);
      car.compose(c.pos, q.setFromEuler(e), sc.set(1, 1, 1));
      const yH = C.body[C.body.length - 2][1] - 0.06, yT = C.body[2][1] - 0.06;
      const tail = on * 0.55 + (c.braking ? 0.9 : 0);
      k = 0;
      for (const sx of [-1, 1]) {
        loc.compose(v.set(sx * (hw - 0.32), yH, C.L / 2 + 0.11), q.identity(), sc.set(1, 1, 1));
        this.lights.setMatrixAt(i * 4 + k, m.multiplyMatrices(car, loc));
        lc.set([1.6 * on, 1.45 * on, 1.15 * on], (i * 4 + k++) * 3);
        loc.makeRotationY(Math.PI).scale(sc.set(0.8, 0.8, 0.8)).setPosition(sx * (hw - 0.3), yT, -C.L / 2 - 0.11);
        this.lights.setMatrixAt(i * 4 + k, m.multiplyMatrices(car, loc));
        lc.set([1.3 * tail, 0.06 * tail, 0.04 * tail], (i * 4 + k++) * 3);
      }
      // Faisceau des phares sur la chaussée.
      e.set(c.slope, c.heading, 0);
      car.compose(c.pos, q.setFromEuler(e), sc.set(1, 1, 1));
      loc.makeTranslation(0, 0.07, C.L / 2 - 0.3);
      this.beams.setMatrixAt(i, m.multiplyMatrices(car, loc));
      bc.set([0.2 * on, 0.185 * on, 0.15 * on], i * 3);
    });
    this.wheels.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    this.lights.instanceColor.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    this.beams.instanceColor.needsUpdate = true;
    this.lights.visible = true;
    this.beams.visible = on > 0.02;
  }
}

export class Ambient {
  constructor(game) {
    this.game = game;
    this.rnd = mulberry32(99);
    this.people = [];
    this.cars = [];
    this.spawn();
  }

  spawn() {
    const g = this.game;
    const rnd = this.rnd;
    // Chevaux au paddock.
    const paddocks = [
      [HOME.paddock, 1],
      [HARAS.paddocks[0], 1],
      [HARAS.paddocks[1], 2],
      [HARAS.paddocks[2], 2],
      [HARAS.paddocks[3], 1],
      [DUNES.paddock, 2],
    ];
    let k = 0;
    for (const [p, n] of paddocks) {
      for (let i = 0; i < n; i++) {
        const h = g.spawnHorse({ id: `pad${k}`, coat: COATS[k % COATS.length], blaze: rnd() < 0.5, socks: [rnd() < 0.3, rnd() < 0.3, rnd() < 0.4, rnd() < 0.4] }, p.x + (rnd() - 0.5) * (p.w - 8), p.z + (rnd() - 0.5) * (p.d - 8), rnd() * 6, { saddle: false });
        h.ai = new GrazeAI(p);
        h.ambient = true;
        k++;
      }
    }
    // Cavaliers à l'entraînement.
    const W = POLE.warmup;
    const warm = [[W.x - 14, W.z - 16], [W.x + 14, W.z - 16], [W.x + 14, W.z + 16], [W.x - 14, W.z + 16]];
    this.rider(warm, 'grey', 5, '#2f5f8a');
    const hippoPts = [];
    for (let i = 0; i < 40; i++) hippoPts.push(ovalPoint((i / 40) * (4 * HIPPO.half + 2 * Math.PI * (HIPPO.radius + 4)), HIPPO.radius + 4));
    this.rider(hippoPts, 'black', 11, '#b8322a');
    this.rider([[380, -416], [120, -414], [-60, -415], [120, -416]], 'palomino', 3.5, '#f2f1ec');
    const H = HOME.arena;
    this.rider([[H.x - 18, H.z - 8], [H.x + 18, H.z - 8], [H.x + 18, H.z + 8], [H.x - 18, H.z + 8]], 'chestnut', 4.2, '#1b1c1f');

    // Passants en ville.
    for (let i = 0; i < 16; i++) {
      const [x0, x1, z0, z1] = TOWN_BLOCKS[i % TOWN_BLOCKS.length];
      const o = 4.4;
      let loop = [[x0 + o, z0 + o], [x1 - o, z0 + o], [x1 - o, z1 - o], [x0 + o, z1 - o]];
      if (i % 2) loop = loop.reverse();
      const start = Math.floor(rnd() * 4);
      loop = loop.slice(start).concat(loop.slice(0, start));
      this.walker(loop, rnd() < 0.2 ? 1.6 : 1.2);
    }
    // Promeneurs sur les Planches.
    for (let i = 0; i < 5; i++) {
      const x0 = -180 + rnd() * 100;
      const x1 = x0 + 120 + rnd() * 100;
      this.walker(i % 2 ? [[x0, -373.5], [x1, -374.5]] : [[x1, -374.5], [x0, -373.5]], 1.1);
    }
    // Spectateurs au bord de la carrière du Pôle.
    const A = POLE.arena;
    for (let i = 0; i < 8; i++) {
      const x = A.x - 30 + i * 8.5;
      const z = A.z + A.d / 2 + 2.6;
      const p = g.spawnHuman(randomOutfit(rnd), x, z, Math.PI, {});
      p.spectator = true;
      this.people.push(p);
    }
    // Circulation.
    const colors = ['#f2f1ec', '#1b1c1f', '#7a7d84', '#2f5f8a', '#b8322a', '#c8c3b5', '#1d3a2c'];
    const roads = ['coast', 'main', 'ew', 'ew', 'main', 'hippo', 'coast'];
    roads.forEach((id, i) => {
      const road = ROADS.find((r) => r.id === id);
      const c = new Car(g, road, colors[i % colors.length], (i * 0.37) % 1, ['sedan', 'hatch', 'suv'][i % 3]);
      this.cars.push(c);
      g.vehicles.push(c);
    });
    this.fx = new TrafficFx(g.scene, this.cars.length);
  }

  rider(points, coat, speed, pad) {
    const g = this.game;
    const h = g.spawnHorse({ id: `rider${points[0][0]}`, coat, speed: 1 }, points[0][0], points[0][1], 0, { pad, padTrim: '#f2f1ec' });
    const r = g.spawnHuman({ top: pad === '#f2f1ec' ? '#1b1c1f' : pad, sleeve: '#1b1c1f', pants: '#f2f1ec', boots: '#121214', skin: pick(['#e2b894', '#c99a74', '#f0cfb0', '#8d5e3c']), hair: '#2a1d14', helmet: '#16171a' }, points[0][0], points[0][1], 0);
    r.mount(h);
    h.ai = new PathAI(points, { loop: true, speed, lookahead: 4 });
    h.ambient = true;
  }

  walker(points, speed) {
    const g = this.game;
    const p = g.spawnHuman(randomOutfit(this.rnd), points[0][0], points[0][1], 0, {});
    p.ai = new WalkAI(points, speed, g);
    p.chatter = pick(CHATTER, this.rnd);
    this.people.push(p);
  }

  update(dt, camPos) {
    for (const c of this.cars) c.update(dt, camPos);
    const g = this.game;
    // Feux allumés de nuit, à l'aube et au crépuscule, et sous la pluie.
    this.fx.update(this.cars, clamp(g.sky.nightFactor * 1.6 + g.sky.rain * 0.8, 0, 1));
    for (const p of this.people) {
      if (p.spectator) {
        const cheering = g.cheerT > 0;
        p.pose = cheering ? 'cheer' : 'stand';
      }
    }
  }

  // Passant le plus proche avec qui parler.
  nearestTalker(pos) {
    let best = null, bd = 3.2;
    for (const p of this.people) {
      if (!p.chatter) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
}
