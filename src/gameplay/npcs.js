// Vie ambiante : chevaux au paddock, cavaliers à l'entraînement, passants, spectateurs, circulation.
import * as THREE from 'three';
import { GrazeAI, PathAI } from '../entities/horse.js';
import { randomOutfit } from '../entities/humanModel.js';
import { HOME, HARAS, DUNES, POLE, TOWN_BLOCKS } from '../world/sites.js';
import { ROADS, HIPPO } from '../world/layout.js';
import { CHATTER } from './data.js';
import { mulberry32, pick, polylineLength, pointAlong, dampAngle } from '../core/math.js';
import { carGeo } from '../world/builders.js';
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

class Car {
  constructor(game, road, color, offset) {
    this.game = game;
    this.road = road;
    this.len = polylineLength(road.pts);
    this.s = offset * this.len;
    this.dir = offset > 0.5 ? -1 : 1;
    this.speed = 0;
    this.maxSpeed = 10 + Math.random() * 3;
    this.wait = 0;
    const g = new THREE.Group();
    const geo = carGeo(color);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
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
    // Voie de droite.
    const rx = Math.cos(dir), rz = -Math.sin(dir);
    this.pos.set(p.x - rx * 2.2, 0, p.z - rz * 2.2);
    this.pos.y = this.game.terrain.getHeight(this.pos.x, this.pos.z);
    this.heading = dir;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = dir;
  }
  update(dt, camPos) {
    const g = this.game;
    // Obstacle devant ? (joueur, cheval, piéton, autre véhicule)
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let blocked = false;
    const check = (p) => {
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 11 && side < 2.6) blocked = true;
    };
    check(g.player.focus.pos);
    if (g.player.horse) check(g.player.horse.pos);
    for (const v of g.vehicles) if (v !== this) check(v.pos);
    const target = blocked ? 0 : this.maxSpeed;
    this.speed += Math.max(-12 * dt, Math.min(4 * dt, target - this.speed));
    if (blocked && this.speed < 0.5) {
      this.wait += dt;
      if (this.wait > 3 && Math.hypot(g.player.focus.pos.x - this.pos.x, g.player.focus.pos.z - this.pos.z) < 14) {
        this.wait = -4;
        g.audio.horn();
      }
    } else if (this.wait > 0) this.wait = 0;
    else this.wait = Math.min(0, this.wait + dt);
    this.s += this.speed * dt * this.dir;
    if (this.s > this.len - 4 || this.s < 4) {
      this.dir *= -1;
      this.s = Math.max(4, Math.min(this.len - 4, this.s));
    }
    this._place();
    const far = Math.hypot(camPos.x - this.pos.x, camPos.z - this.pos.z);
    this.mesh.visible = far < 300;
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
      const c = new Car(g, road, colors[i % colors.length], (i * 0.37) % 1);
      this.cars.push(c);
      g.vehicles.push(c);
    });
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
