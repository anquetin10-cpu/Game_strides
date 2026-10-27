// Vie ambiante : chevaux au paddock, cavaliers à l'entraînement, passants, spectateurs, circulation.
import * as THREE from 'three';
import { GrazeAI, PathAI } from '../entities/horse.js';
import { randomOutfit } from '../entities/humanModel.js';
import { HOME, HARAS, DUNES, POLE, TOWN_BLOCKS } from '../world/sites.js';
import { ROADS, HIPPO } from '../world/layout.js';
import { CHATTER } from './data.js';
import { mulberry32, pick, polylineLength, pointAlong, dampAngle, clamp } from '../core/math.js';
import { carGeo, carMaterial, unitWheelGeo, CARS, CAR_COLORS, CAR_MODELS } from '../world/props.js';
import { ovalPoint } from './courses.js';
import { Vehicle } from '../entities/vehicle.js';
import { addCloudShadows } from '../world/sky.js';

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
    // Lampadaires, voitures garées, camion… : on contourne en glissant le long de l'obstacle (passants visibles).
    if (h.mesh.visible) g.colliders.resolve(h.pos, 0.3, h.pos.y);
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
const _pt = { x: 0, z: 0 };
class Car {
  constructor(game, road, color, offset, kind = 'clio') {
    this.game = game;
    this.color = color;
    this.road = road;
    this.len = polylineLength(road.pts);
    this.s = offset * this.len;
    this.dir = offset > 0.5 ? -1 : 1;
    this.speed = 0;
    this.accel = 0;
    this.cruise = 0.88 + Math.random() * 0.2;
    this.wait = 0;
    this.kind = kind;
    this.spec = CARS[kind] || CARS.clio;
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
    let gap = this._ahead(g.player.focus.pos, fx, fz, look);
    // Cavalier : la voiture attend derrière le cheval sans klaxonner.
    const byPlayer = gap < Infinity && g.player.mode !== 'ride';
    // Véhicules garés à leur place (hors voie) ignorés ; une voiture laissée sur la chaussée par le joueur arrête la circulation.
    // Toute la longueur des autres véhicules est surveillée (avant, centre, arrière) : un camion qui coupe la route
    // n'est pas qu'un point.
    for (const v of g.vehicles) {
      if (v === this || !v.pos || v.parked) continue;
      gap = Math.min(gap, this._ahead(v.pos, fx, fz, look));
      const half = (v.L || v.spec?.L || 4) / 2 - 0.9;
      if (half > 0.6 && v.heading !== undefined) {
        const hx = Math.sin(v.heading) * half, hz = Math.cos(v.heading) * half;
        _pt.x = v.pos.x + hx;
        _pt.z = v.pos.z + hz;
        gap = Math.min(gap, this._ahead(_pt, fx, fz, look));
        _pt.x = v.pos.x - hx;
        _pt.z = v.pos.z - hz;
        gap = Math.min(gap, this._ahead(_pt, fx, fz, look));
      }
    }
    // Carrefours : trajectoires qui se croisent dans les 3 prochaines secondes → la voiture cède le passage au véhicule
    // du joueur (il ne suit pas le code de la route d'un automate) et, entre voitures, laisse la priorité à droite.
    const pv = g.player?.mode === 'drive' ? g.player.vehicle : null;
    // Prudence près du véhicule du joueur qui manœuvre (tourne, entre sur un parking) : sa trajectoire ne se prédit
    // pas en ligne droite ; on ralentit d'autant plus qu'on s'en approche (≈ 25 km/h à 15 m).
    if (pv && Math.abs(pv.speed) < (pv === g.truck ? 9 : 4)) {
      for (const p of [pv.pos, pv.nose?.pos]) {
        if (!p || p.x === 1e6) continue;
        const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
        const ahead = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (ahead > -2 && ahead < 30 && lat < 8) limit = Math.min(limit, 2.5 + Math.max(0, ahead) * 0.3);
      }
    }
    if (!this.uturn && this.speed > 0.5) {
      for (const v of g.vehicles) {
        // L'avant du camion (repère « nose ») compte aussi : le camion est long.
        if (v === this || v.parked || !v.pos || v.heading === undefined || v.pos.x === 1e6) continue;
        const vs = v.speed || 0;
        if (Math.abs(vs) < 0.5) continue;
        const vfx = Math.sin(v.heading), vfz = Math.cos(v.heading);
        if (Math.abs(fx * vfz - fz * vfx) < 0.3) continue; // même axe : géré par le couloir ci-dessus
        const rx = v.pos.x - this.pos.x, rz = v.pos.z - this.pos.z;
        if (rx * rx + rz * rz > 70 * 70) continue;
        const fromRight = rx * -fz + rz * fx > 0;
        if (v !== pv && !v.driver && !v.proxy && !fromRight) continue;
        // Toute la longueur de l'autre véhicule (avant, centre, arrière) le long de sa trajectoire prévue.
        const half = Math.max(0, (v.L || v.spec?.L || 4) / 2 - 1);
        let hit = false;
        for (let t = 0.5; t <= 3 && !hit; t += 0.5) {
          for (let o = -half; o <= half + 1e-6 && !hit; o += Math.max(half, 1)) {
            const dx = rx + vfx * (vs * t + o) - fx * this.speed * t, dz = rz + vfz * (vs * t + o) - fz * this.speed * t;
            if (dx * dx + dz * dz < 3.6 * 3.6) {
              gap = Math.min(gap, Math.max(0, this.speed * t - 1.5));
              hit = true;
            }
          }
        }
      }
    }
    // Code de la route : on croise et on dépasse les chevaux au pas (20 km/h), sans klaxonner.
    for (const h of g.horses) {
      if (h.hiddenInTruck || !h.pos) continue;
      gap = Math.min(gap, this._ahead(h.pos, fx, fz, look));
      const dx = h.pos.x - this.pos.x, dz = h.pos.z - this.pos.z;
      const ahead = dx * fx + dz * fz;
      if (ahead > -8 && ahead < 45 && Math.abs(dx * fz - dz * fx) < 8) limit = Math.min(limit, 5.5);
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
    // Nez à nez avec le véhicule du joueur (camion qui tourne, voiture mal placée) depuis 4 s : on recule de quelques
    // mètres pour lui laisser la place, comme un automobiliste.
    if (pv && !this.uturn && this.speed < 0.3 && !this.backT) {
      const pp = pv.nose && pv.nose.pos.x !== 1e6 ? pv.nose.pos : pv.pos;
      const dx = pp.x - this.pos.x, dz = pp.z - this.pos.z;
      const ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < 9 && Math.abs(dx * fz - dz * fx) < 4) this.blockT = (this.blockT || 0) + dt;
      else this.blockT = 0;
      if (this.blockT > 4) {
        this.backT = 2.6;
        this.blockT = 0;
      }
    }
    if (this.backT > 0) {
      this.backT = Math.max(0, this.backT - dt);
      target = this.backT > 0.4 ? -1.6 : 0;
    }
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
    this.braking = this.accel < -0.8 || (this.speed < 0.3 && this.speed > -0.2);
    this.reversing = this.speed < -0.2;
  }
  // Pas de demi-tour tant que le joueur ou un cheval se trouve sur sa trajectoire.
  _turnClear() {
    const g = this.game;
    const cx = this.pos.x + Math.sin(this.heading) * LANE, cz = this.pos.z + Math.cos(this.heading) * LANE;
    const near = (p) => Math.hypot(p.x - cx, p.z - cz) < LANE + 4.5;
    if (near(g.player.focus.pos)) return false;
    return !g.horses.some((h) => !h.hiddenInTruck && h.pos && near(h.pos));
  }
  // Distance d'un point dans le couloir devant la voiture (2,6 m de part et d'autre), sinon Infinity (sans allocation).
  _ahead(p, fx, fz, look) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const ahead = dx * fx + dz * fz;
    return ahead > 0 && ahead < look && Math.abs(dx * fz - dz * fx) < 2.6 ? ahead : Infinity;
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
    this.wheels.material.onBeforeCompile = (sh) => addCloudShadows(sh);
    this.wheels.material.customProgramCacheKey = () => 'car-wheels';
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
  }

  update(cars, on) {
    const { _car: car, _loc: loc, _m: m, _q: q, _e: e, _v: v, _s: sc } = this;
    const lc = this.lights.instanceColor.array, bc = this.beams.instanceColor.array;
    // Seules les voitures visibles occupent des instances : les autres ne sont dessinées ni à l'écran ni dans l'ombre.
    let i = 0, maxLk = 0;
    for (let ci = 0; ci < cars.length; ci++) {
      const c = cars[ci];
      if (!c.mesh.visible) continue;
      const C = c.spec, hw = C.W / 2;
      // Roues : sur la route (pas de tangage de caisse), en rotation autour de l'essieu.
      e.set(c.slope, c.heading, c.groundRoll || 0);
      car.compose(c.pos, q.setFromEuler(e), sc.set(1, 1, 1));
      let k = 0;
      for (let sx = -1; sx <= 1; sx += 2) {
        for (let zw = C.wb / 2, n = 0; n < 2; n++, zw = -zw) {
          // Roues avant braquées (épure d'Ackermann des voitures conduisibles), x > 0 à gauche.
          const st = n === 0 ? (sx > 0 ? c.steerL : c.steerR) || 0 : 0;
          loc.compose(v.set(sx * (hw - 0.14), C.r, zw), q.setFromEuler(e.set(c.spin, st, 0)), sc.set(C.r, C.r, C.r));
          this.wheels.setMatrixAt(i * 4 + k++, m.multiplyMatrices(car, loc));
        }
      }
      // Optiques : sur la caisse (avec son tangage).
      e.set(c.slope + c.pitch, c.heading, 0);
      car.compose(c.pos, q.setFromEuler(e), sc.set(1, 1, 1));
      const yH = C.head.y + C.head.h / 2, yT = C.tail.y + C.tail.h / 2, xH = (C.head.x0 + C.head.x1) / 2, xT = (Math.max(C.tail.x0, 0.2) + C.tail.x1) / 2;
      // Feux de la voiture : globaux pour la circulation, propres à chaque voiture conduisible (moteur, nuit).
      const lk = c.lightK ?? on;
      if (lk > maxLk) maxLk = lk;
      const tail = lk * 0.55 + (c.braking ? 0.9 : 0);
      k = 0;
      for (let sx = -1; sx <= 1; sx += 2) {
        loc.compose(v.set(sx * xH, yH, C.tipF + 0.11), q.identity(), sc.set(1, 1, 1));
        this.lights.setMatrixAt(i * 4 + k, m.multiplyMatrices(car, loc));
        let o = (i * 4 + k++) * 3;
        lc[o] = 1.6 * lk;
        lc[o + 1] = 1.45 * lk;
        lc[o + 2] = 1.15 * lk;
        loc.makeRotationY(Math.PI).scale(sc.set(0.8, 0.8, 0.8)).setPosition(sx * xT, yT, C.tipR - 0.11);
        this.lights.setMatrixAt(i * 4 + k, m.multiplyMatrices(car, loc));
        o = (i * 4 + k++) * 3;
        // Feux de recul : blancs en marche arrière.
        lc[o] = c.reversing ? 1.2 : 1.3 * tail;
        lc[o + 1] = c.reversing ? 1.15 : 0.06 * tail;
        lc[o + 2] = c.reversing ? 1.05 : 0.04 * tail;
      }
      // Faisceau des phares sur la chaussée.
      e.set(c.slope, c.heading, 0);
      car.compose(c.pos, q.setFromEuler(e), sc.set(1, 1, 1));
      loc.makeTranslation(0, 0.07, C.tipF - 0.3);
      this.beams.setMatrixAt(i, m.multiplyMatrices(car, loc));
      bc[i * 3] = 0.2 * lk;
      bc[i * 3 + 1] = 0.185 * lk;
      bc[i * 3 + 2] = 0.15 * lk;
      i++;
    }
    this.wheels.count = this.lights.count = i * 4;
    this.beams.count = i;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    this.lights.instanceColor.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    this.beams.instanceColor.needsUpdate = true;
    this.wheels.visible = this.lights.visible = i > 0;
    this.beams.visible = i > 0 && maxLk > 0.02;
  }
}

export class Ambient {
  constructor(game) {
    this.game = game;
    this.rnd = mulberry32(99);
    this.people = [];
    this.walkers = [];
    this.cars = [];
    this.trainer = null;
    this._sepTick = 0;
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
    // Hippodrome : couloir intérieur (à la corde), libre des stalles de départ (world.js) ; points serrés pour suivre
    // les virages sans couper vers le rail. Pendant le Derby, ce cavalier libère la piste (courses.js).
    const hippoPts = [];
    for (let i = 0; i < 60; i++) hippoPts.push(ovalPoint((i / 60) * (4 * HIPPO.half + 2 * Math.PI * (HIPPO.radius - 5)), HIPPO.radius - 5));
    this.trainer = this.rider(hippoPts, 'black', 11, '#b8322a');
    this.rider([[380, -388], [120, -387], [-60, -388], [120, -389]], 'palomino', 3.5, '#f2f1ec');
    const H = HOME.arena;
    this.rider([[H.x - 18, H.z - 8], [H.x + 18, H.z - 8], [H.x + 18, H.z + 8], [H.x - 18, H.z + 8]], 'chestnut', 4.2, '#1b1c1f');

    // Passants en ville : sur le trottoir (de 3,5 à 6,1 m de l'axe des rues), à l'écart des voitures garées
    // (carrosserie jusqu'à 4,9 m de l'axe) et des façades (6,2 m).
    for (let i = 0; i < 16; i++) {
      const [x0, x1, z0, z1] = TOWN_BLOCKS[i % TOWN_BLOCKS.length];
      const o = 5.4;
      let loop = [[x0 + o, z0 + o], [x1 - o, z0 + o], [x1 - o, z1 - o], [x0 + o, z1 - o]];
      if (i % 2) loop = loop.reverse();
      const start = Math.floor(rnd() * 4);
      loop = loop.slice(start).concat(loop.slice(0, start));
      this.walker(loop, rnd() < 0.2 ? 1.6 : 1.2);
    }
    // Promeneurs sur les Planches : chacun tient sa droite (file sud vers l'est, file nord vers l'ouest), les
    // promeneurs qui se croisent ne se traversent plus.
    for (let i = 0; i < 5; i++) {
      const x0 = -180 + rnd() * 100;
      const x1 = x0 + 120 + rnd() * 100;
      const loop = [[x0, -373], [x1, -373], [x1, -375], [x0, -375]];
      this.walker(i % 2 ? loop.slice(2).concat(loop.slice(0, 2)) : loop, 1.1);
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
    // Modèles de série courants en Normandie, dans leurs teintes d'origine.
    const roads = ['coast', 'main', 'ew', 'ew', 'main', 'hippo', 'coast'];
    roads.forEach((id, i) => {
      const road = ROADS.find((r) => r.id === id);
      const kind = CAR_MODELS[(i * 2 + 1) % CAR_MODELS.length];
      const cols = CAR_COLORS[kind];
      const c = new Car(g, road, cols[i % cols.length], (i * 0.37) % 1, kind);
      this.cars.push(c);
      g.vehicles.push(c);
    });
    // Effets partagés avec les voitures conduisibles (roues, optiques).
    this.fx = new TrafficFx(g.scene, this.cars.length + (g.drivables || []).filter((v) => !v.isTractor).length);
    this._fxList = [];
  }

  // Le joueur prend le volant d'une voiture de la circulation arrêtée : elle quitte le trafic et devient un véhicule
  // conduisible (même modèle, même couleur, à la même place).
  takeOver(car) {
    const g = this.game;
    const i = this.cars.indexOf(car);
    if (i < 0) return null;
    this.cars.splice(i, 1);
    const k = g.vehicles.indexOf(car);
    if (k >= 0) g.vehicles.splice(k, 1);
    g.scene.remove(car.mesh);
    const v = new Vehicle(g, { kind: car.kind, color: car.color, x: car.pos.x, z: car.pos.z, heading: car.heading });
    v.atSpot = false;
    g.drivables.push(v);
    g.vehicles.push(v);
    return v;
  }

  rider(points, coat, speed, pad) {
    const g = this.game;
    const h = g.spawnHorse({ id: `rider${points[0][0]}`, coat, speed: 1 }, points[0][0], points[0][1], 0, { pad, padTrim: '#f2f1ec' });
    const r = g.spawnHuman({ top: pad === '#f2f1ec' ? '#1b1c1f' : pad, sleeve: '#1b1c1f', pants: '#f2f1ec', boots: '#121214', skin: pick(['#e2b894', '#c99a74', '#f0cfb0', '#8d5e3c']), hair: '#2a1d14', helmet: '#16171a' }, points[0][0], points[0][1], 0);
    r.mount(h);
    h.ai = new PathAI(points, { loop: true, speed, lookahead: 4, yield: true });
    h.ambient = true;
    return h;
  }

  walker(points, speed) {
    const g = this.game;
    const p = g.spawnHuman(randomOutfit(this.rnd), points[0][0], points[0][1], 0, {});
    p.ai = new WalkAI(points, speed, g);
    p.chatter = pick(CHATTER, this.rnd);
    this.people.push(p);
    this.walkers.push(p);
  }

  update(dt, camPos) {
    for (const c of this.cars) c.update(dt, camPos);
    const g = this.game;
    // Feux allumés de nuit, à l'aube et au crépuscule, et sous la pluie.
    const list = this._fxList;
    list.length = 0;
    for (const c of this.cars) list.push(c);
    for (const v of g.drivables || []) if (!v.isTractor) list.push(v);
    this.fx.update(list, clamp(g.sky.nightFactor * 1.6 + g.sky.rain * 0.8, 0, 1));
    for (const p of this.people) {
      if (p.spectator) {
        const cheering = g.cheerT > 0;
        p.pose = cheering ? 'cheer' : 'stand';
      }
    }
    if ((this._sepTick = (this._sepTick + 1) & 1) === 0) this._separateWalkers();
  }

  // Passants : on ne se traverse pas (une image sur deux suffit, ils marchent au pas). Deux personnes trop proches
  // sont écartées l'une de l'autre avec un pas de côté, pour se croiser ou se dépasser au lieu de se bloquer face à face.
  _separateWalkers() {
    const w = this.walkers;
    for (let i = 0; i < w.length; i++) {
      const a = w[i];
      if (!a.mesh.visible) continue;
      for (let j = i + 1; j < w.length; j++) {
        const b = w[j];
        if (!b.mesh.visible) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        if (dx > 0.9 || dx < -0.9 || dz > 0.9 || dz < -0.9) continue;
        const d = Math.hypot(dx, dz);
        if (d >= 0.9 || d < 1e-4) continue;
        const push = (0.9 - d) / 2;
        const nx = dx / d, nz = dz / d;
        const mx = (nx + nz * 0.6) * push, mz = (nz - nx * 0.6) * push;
        a.pos.x -= mx;
        a.pos.z -= mz;
        b.pos.x += mx;
        b.pos.z += mz;
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
