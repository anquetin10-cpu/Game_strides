// Construction du monde : terrain, mer, routes, sites, bocage, forêts, signalétique Strides.
import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { mulberry32, polyDist, clamp } from '../core/math.js';
import { WORLD, ROADS, ZONES, HIPPO, XC_PATH, POND, SIGN, LIGHTHOUSE, ARCH, shoreZ, forestDensity, isReserved, nearestRoad } from './layout.js';
import { HOME, HARAS, POLE, HIPPO_SITE, DUNES, GATIEN, TOWN, TOWN_BLOCKS, homeBoxes } from './sites.js';
import { Terrain } from './terrain.js';
import { makeTerrainTexture, makeDetailTexture } from './terrainTexture.js';
import { Water } from './water.js';
import { Sky } from './sky.js';
import { StaticBatch, paint, prep, gableRoof } from './shapes.js';
import {
  PALETTE, buildingGeo, stableGeo, shedGeo, fenceGeo, treeTemplate, hedgeGeo, lampGeo, benchGeo, parasolGeo,
  roundBaleGeo, flagGeo, partsToGeo, box, cyl, cone, ico, carGeo, awningGeo, planterGeo,
} from './builders.js';
import { buildGrassMask } from './grass.js';
import { createHorseMesh } from '../entities/horseModel.js';
import { adTexture, signTexture, bannerTexture, roadTexture, screenTexture, logoTexture } from './textures.js';
import { getFields } from './fields.js';

const font = new FontLoader().parse(fontJson);

export class World {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.group = new THREE.Group();
    this.group.name = 'world';
    scene.add(this.group);
    this.features = { buildings: [], fences: [], trees: 0 };
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffcf8a', emissiveIntensity: 0 });
    this.lightMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffe2a8', emissiveIntensity: 0.2 });
    this.batch = new StaticBatch(150);
    this.glass = new StaticBatch(150);
    this.lights = new StaticBatch(150);
    this.chunks = [];
    this.animated = [];
    this.rnd = mulberry32(2026);
  }

  h(x, z) {
    return this.terrain.getHeight(x, z);
  }

  async build(progress = () => {}) {
    let last = performance.now();
    const tick = (label) => {
      const now = performance.now();
      if (label && typeof window !== 'undefined' && window.__debugTimings) console.log('[build]', label, Math.round(now - last), 'ms');
      last = now;
      return new Promise((r) => setTimeout(r, 0));
    };
    progress(0.05, 'Relief de la Côte Fleurie');
    await tick('terrain');
    this.terrain = new Terrain(200);
    progress(0.15, 'Champs et plages');
    await tick('texture');
    const { texture, canvas } = makeTerrainTexture(this.terrain, this.textureSize || 2048);
    this.terrainCanvas = canvas;
    this.grassMask = buildGrassMask(canvas);
    this.terrainMesh = this.terrain.buildMesh(texture, makeDetailTexture(128));
    this.group.add(this.terrainMesh);
    this.sky = new Sky(this.scene);
    this.water = new Water(this.scene, this.terrain);
    progress(0.3, 'Routes de Deauvelle');
    await tick('roads');
    this.buildRoads();
    progress(0.38, 'Écuries et haras');
    await tick('stables');
    this.buildHome();
    this.buildHaras();
    this.buildDunes();
    this.buildGatien();
    progress(0.48, 'Pôle International');
    await tick('pole');
    this.buildPole();
    this.buildHippodrome();
    progress(0.56, 'Deauvelle');
    await tick('town');
    this.buildTown();
    this.buildStreetscape();
    this.buildBeach();
    this.buildCliffs();
    this.buildSignHill();
    progress(0.66, 'Bocage normand');
    await tick('country');
    this.buildCountryside();
    progress(0.76, 'Forêts');
    await tick('forests');
    this.buildForests();
    this.buildRoadTrees();
    this.buildBillboards();
    progress(0.86, 'Assemblage');
    await tick('assemble');
    this.chunks.push(...this.batch.build(this.mat, this.group, { name: 'static' }));
    this.chunks.push(...this.glass.build(this.glassMat, this.group, { castShadow: false, name: 'glass' }));
    this.chunks.push(...this.lights.build(this.lightMat, this.group, { castShadow: false, receiveShadow: false, name: 'lights' }));
    progress(0.9, 'Prêt');
  }

  // ---------- Utilitaires de placement ----------
  groundAt(x, z, hw = 0, hd = 0, rot = 0) {
    if (!hw) return this.h(x, z);
    const c = Math.cos(rot), s = Math.sin(rot);
    let m = Infinity;
    for (const [a, b] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]]) {
      m = Math.min(m, this.h(x + a * c + b * s, z - a * s + b * c));
    }
    return m;
  }

  place(geoPair, x, z, rot, w, d, kind = 'building', collide = true) {
    const y = this.groundAt(x, z, w / 2, d / 2, rot);
    const body = geoPair.body || geoPair;
    this.batch.add(body, null, x, y, z, rot);
    if (geoPair.glass) this.glass.add(geoPair.glass, null, x, y, z, rot);
    if (collide) this.colliders.addBox(x, z, w / 2, d / 2, rot, Infinity, kind);
    this.features.buildings.push({ x, z, w, d, rot, kind });
    return y;
  }

  fence(points, opts = {}) {
    const geo = fenceGeo(points, (x, z) => this.h(x, z), opts);
    this.batch.addMatrix(geo, null, new THREE.Matrix4(), 0, null, points[0][0], points[0][1]);
    const pts = opts.closed ? [...points, points[0]] : points;
    const height = opts.height ?? 1.15;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const top = Math.max(this.h(ax, az), this.h(bx, bz), this.h((ax + bx) / 2, (az + bz) / 2)) + height;
      this.colliders.addSegment(ax, az, bx, bz, 0.35, opts.solid ? Infinity : top, opts.tag || 'fence');
    }
    this.features.fences.push(pts);
  }

  // Rectangle de clôture avec une ouverture (side: 'n'|'s'|'e'|'w', gap en mètres).
  rectFence(r, opts = {}, gapSide = 'n', gap = 5, gapPos = 0.5) {
    const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2;
    const gx = x0 + r.w * gapPos;
    const gz = z0 + r.d * gapPos;
    const runs = [];
    if (gapSide === 'n') runs.push([[gx - gap / 2, z0], [x0, z0], [x0, z1], [x1, z1], [x1, z0], [gx + gap / 2, z0]]);
    else if (gapSide === 's') runs.push([[gx + gap / 2, z1], [x1, z1], [x1, z0], [x0, z0], [x0, z1], [gx - gap / 2, z1]]);
    else if (gapSide === 'e') runs.push([[x1, gz - gap / 2], [x1, z0], [x0, z0], [x0, z1], [x1, z1], [x1, gz + gap / 2]]);
    else if (gapSide === 'w') runs.push([[x0, gz + gap / 2], [x0, z1], [x1, z1], [x1, z0], [x0, z0], [x0, gz - gap / 2]]);
    else runs.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]);
    for (const run of runs) this.fence(run, opts);
  }

  tree(kind, x, z, scale = 1, collide = true) {
    const y = this.h(x, z) - 0.15;
    this.batch.add(treeTemplate(kind), null, x, y, z, this.rnd() * Math.PI * 2, scale, scale * (0.9 + this.rnd() * 0.25), scale, { jitter: 0.18, rnd: this.rnd });
    if (collide && kind !== 'bush') this.colliders.addCircle(x, z, 0.45 * scale, Infinity, 'tree');
    this.features.trees++;
  }

  texturedPanel(tex, w, h, x, y, z, rot, { back = '#1b1c1f', depth = 0.25, doubleSided = false } = {}) {
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(x + Math.sin(rot) * (depth / 2 + 0.01), y, z + Math.cos(rot) * (depth / 2 + 0.01));
    plane.rotation.y = rot;
    plane.receiveShadow = true;
    this.group.add(plane);
    if (doubleSided) {
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      p2.position.set(x - Math.sin(rot) * (depth / 2 + 0.01), y, z - Math.cos(rot) * (depth / 2 + 0.01));
      p2.rotation.y = rot + Math.PI;
      this.group.add(p2);
    }
    this.batch.add(box(w + 0.2, h + 0.2, depth, false), back, x, y, z, rot);
    return plane;
  }

  signboard(title, sub, x, z, rot, { dark = true, w = 5, h = 1.25, postH = 2.2 } = {}) {
    const g = this.h(x, z);
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const k of [-1, 1]) {
      this.batch.add(box(0.14, postH + h, 0.14), '#26272b', x + c * k * (w / 2 - 0.3), g, z - s * k * (w / 2 - 0.3), rot);
    }
    this.texturedPanel(signTexture(title, sub, { dark }), w, h, x, g + postH + h / 2, z, rot, { doubleSided: true });
    this.colliders.addCircle(x, z, 0.4, Infinity, 'sign');
  }

  lamp(x, z, rot = 0) {
    const L = (this._lamp ||= lampGeo());
    const y = this.h(x, z);
    this.batch.add(L.body, null, x, y, z, rot);
    this.lights.add(L.light, null, x, y, z, rot);
    this.colliders.addCircle(x, z, 0.2, Infinity, 'lamp');
  }

  text3D(str, size, depth, color) {
    const g = new TextGeometry(str, { font, size, depth, curveSegments: 2, bevelEnabled: false });
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(bb.max.x + bb.min.x) / 2, 0, -depth / 2);
    prep(g);
    paint(g, color);
    return { geo: g, width: bb.max.x - bb.min.x };
  }

  // ---------- Routes ----------
  buildRoads() {
    const positions = [];
    const uvs = [];
    const indices = [];
    let base = 0;
    for (const road of ROADS) {
      const pts = road.pts;
      const samples = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(len / 3));
        for (let k = 0; k < n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      samples.push(pts[pts.length - 1]);
      let dist = 0;
      const half = road.w / 2;
      for (let i = 0; i < samples.length; i++) {
        const [x, z] = samples[i];
        const p = samples[Math.max(0, i - 1)];
        const q = samples[Math.min(samples.length - 1, i + 1)];
        let tx = q[0] - p[0], tz = q[1] - p[1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const nx = -tz, nz = tx;
        if (i > 0) dist += Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1]);
        for (const [k, u] of [[-1, 0], [0, 0.5], [1, 1]]) {
          const vx = x + nx * half * k;
          const vz = z + nz * half * k;
          positions.push(vx, this.h(vx, vz) + 0.07, vz);
          uvs.push(u, dist / 12);
        }
        if (i > 0) {
          const a = base + (i - 1) * 3;
          const b = base + i * 3;
          indices.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
        }
      }
      base += samples.length * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: roadTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1;
    mesh.name = 'roads';
    this.group.add(mesh);
  }

  // ---------- Sites ----------
  buildHome() {
    const B = HOME.barn;
    this.place(stableGeo({ w: B.w, d: B.d, boxes: HOME.boxCount, wall: '#202125' }), B.x, B.z, 0, B.w, B.d, 'stable');
    this.place(buildingGeo({ w: HOME.house.w, d: HOME.house.d, h: 5.6, wall: '#f3efe7', roof: '#33363c', trim: '#202125', roofType: 'gable', doorColor: '#202125' }), HOME.house.x, HOME.house.z, 0, HOME.house.w, HOME.house.d, 'house');
    // Grange à foin ouverte vers l'est.
    const H = HOME.hay;
    const hy = this.groundAt(H.x, H.z, H.w / 2, H.d / 2);
    this.batch.add(shedGeo({ w: H.d, d: H.w }), null, H.x, hy, H.z, Math.PI / 2);
    this.colliders.addSegment(H.x - H.w / 2, H.z - H.d / 2, H.x - H.w / 2, H.z + H.d / 2, 0.4, Infinity, 'wall');
    this.colliders.addBox(H.x - H.w / 2 + 2.6, H.z, 2.2, H.d / 2 - 0.5, 0, Infinity, 'hay');
    this.features.buildings.push({ x: H.x, z: H.z, w: H.w, d: H.d, rot: 0, kind: 'shed' });
    // Carrière et paddock.
    this.rectFence(HOME.arena, { height: 1.1, board: true, color: '#f2f1ec' }, 'n', 5, 0.5);
    this.rectFence(HOME.paddock, { height: 1.15, rails: 3 }, 'e', 4, 0.3);
    // Abreuvoir, mobilier, panneau.
    this.batch.add(box(2.4, 0.7, 0.9), '#9aa0a6', -150, this.h(-150, 205), 205, 0);
    this.signboard('ÉCURIE DU VAL', 'Pension · Travail · Commerce', -40, 162, Math.PI / 2, { w: 5.2 });
    for (const b of homeBoxes()) this.batch.add(box(0.5, 0.4, 0.3), '#3c3f45', b.x + 1.2, this.h(b.x, b.z) + 1.0, b.z + 0.2, 0);
    for (let i = 0; i < 6; i++) this.tree(i % 2 ? 'oak' : 'birch', -186 + this.rnd() * 6, 135 + i * 18, 1 + this.rnd() * 0.3);
    for (let i = 0; i < 5; i++) this.tree('poplar', -48 + i * 0.5, 192 + i * 10, 1.1);
  }

  buildHaras() {
    const stone = '#e8dfcc';
    for (const k of ['mainW', 'mainE']) {
      const r = HARAS[k];
      this.place(buildingGeo({ w: r.w, d: r.d, h: 7.5, wall: stone, roof: '#454a52', roofType: 'hip', timber: false, floors: 2, trim: '#f6f3ec', chimney: true }), r.x, r.z, Math.PI, r.w, r.d);
    }
    const g = HARAS.gate;
    for (const dx of [-5.2, 5.2]) {
      this.batch.add(box(1.3, 4.6, 1.3), stone, g.x + dx, this.h(g.x + dx, g.z), g.z, 0);
      this.batch.add(box(1.6, 0.4, 1.6), '#f6f3ec', g.x + dx, this.h(g.x + dx, g.z) + 4.6, g.z, 0);
      this.colliders.addCircle(g.x + dx, g.z, 0.8, Infinity, 'gate');
    }
    this.texturedPanel(signTexture('HARAS DE LA POMMERAIE', 'Élevage · Pension · Étalons', { dark: true }), 9.4, 1.6, g.x, this.h(g.x, g.z) + 5.4, g.z - 0.1, Math.PI, { doubleSided: true });
    this.place(stableGeo({ w: HARAS.wingW.d, d: HARAS.wingW.w, boxes: 8, wall: '#2a2b2f' }), HARAS.wingW.x, HARAS.wingW.z, Math.PI / 2, HARAS.wingW.d, HARAS.wingW.w, 'stable');
    this.place(stableGeo({ w: HARAS.wingE.d, d: HARAS.wingE.w, boxes: 8, wall: '#2a2b2f' }), HARAS.wingE.x, HARAS.wingE.z, -Math.PI / 2, HARAS.wingE.d, HARAS.wingE.w, 'stable');
    const c = HARAS.court;
    this.batch.add(cyl(6, 6, 0.35, 16), '#78a957', c.x, this.h(c.x, c.z), c.z, 0);
    this.tree('oak', c.x, c.z, 1.4);
    for (const p of HARAS.paddocks) this.rectFence(p, { height: 1.15, rails: 3 }, 'n', 4.5, 0.5);
    this.signboard('HARAS DE LA POMMERAIE', '', -362, -110, Math.PI, { w: 6 });
    for (let i = 0; i < 9; i++) this.tree('apple', -470 + i * 12, -100 + (i % 2) * 4, 1);
  }

  buildDunes() {
    const b = DUNES.barn;
    this.place(stableGeo({ w: b.w, d: b.d, boxes: 6, wall: '#f2f1ec', trim: '#1b1c1f', door: '#1b1c1f', roof: '#2d3035' }), b.x, b.z, 0, b.w, b.d, 'stable');
    this.rectFence(DUNES.paddock, { height: 1.15, rails: 3 }, 'n', 4, 0.2);
    this.signboard('ÉCURIE DES DUNES', 'Pension en bord de mer', 512, -330, 0, { w: 5 });
  }

  buildGatien() {
    const b = GATIEN.barn;
    this.place(stableGeo({ w: b.w, d: b.d, boxes: 6, wall: '#5c4632', trim: '#efe6d2', roof: '#3c3f45', door: '#3c2c20' }), b.x, b.z, Math.PI, b.w, b.d, 'stable');
    this.place(buildingGeo({ w: GATIEN.club.w, d: GATIEN.club.d, h: 4.5, wall: '#efe6d2', roof: '#4a4f57', timber: true }), GATIEN.club.x, GATIEN.club.z, Math.PI, GATIEN.club.w, GATIEN.club.d);
    // Arche de départ du cross.
    const s = GATIEN.start;
    const y = this.h(s.x, s.z);
    for (const dz of [-4.5, 4.5]) {
      this.batch.add(box(0.4, 4.2, 0.4), '#1b1c1f', s.x, y, s.z + dz, 0);
      this.colliders.addCircle(s.x, s.z + dz, 0.4, Infinity, 'post');
    }
    this.texturedPanel(signTexture('CROSS DE SAINT-GATIEN', 'Départ · Arrivée', { dark: true }), 9.4, 1.3, s.x, y + 4.6, s.z, Math.PI / 2, { doubleSided: true });
    this.signboard('DOMAINE DE SAINT-GATIEN', 'Cross · Pension · Balades', -182, 292, Math.PI / 2, { w: 5.6 });
  }

  buildPole() {
    const A = POLE.arena;
    // Lisse basse avec bandeaux Strides.
    const ay = this.h(A.x, A.z);
    this.rectFence(A, { height: 1.0, board: true, color: '#f2f1ec', post: '#1b1c1f', tag: 'arena' }, 's', 7, 0.5);
    const banner = bannerTexture();
    for (const [x, z, rot, len] of [[A.x, A.z - A.d / 2 + 0.12, 0, A.w], [A.x - A.w / 2 + 0.12, A.z, Math.PI / 2, A.d], [A.x + A.w / 2 - 0.12, A.z, -Math.PI / 2, A.d]]) {
      const tex = banner.clone();
      tex.repeat.set(Math.round(len / 12), 1);
      tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.55), new THREE.MeshLambertMaterial({ map: tex }));
      m.position.set(x, ay + 0.55, z);
      m.rotation.y = rot;
      this.group.add(m);
    }
    this.rectFence(POLE.warmup, { height: 1.0, board: true, color: '#f2f1ec' }, 'e', 6, 0.5);
    this.buildStands(POLE.stands, 0, true, 'PÔLE INTERNATIONAL');
    const S = POLE.stables;
    this.place(stableGeo({ w: S.d, d: S.w, boxes: 12, wall: '#f2f1ec', trim: '#1b1c1f', door: '#1b1c1f', roof: '#e2e2de' }), S.x, S.z, -Math.PI / 2, S.d, S.w, 'stable');
    const C = POLE.club;
    this.place(buildingGeo({ w: C.w, d: C.d, h: 7, wall: '#1b1c1f', roof: '#2a2b2f', roofType: 'flat', trim: '#f2f1ec', floors: 2 }), C.x, C.z, 0, C.w, C.d, 'club');
    // Écran géant.
    const sy = this.h(A.x + 36, A.z - 34);
    this.batch.add(box(0.5, 6, 0.5), '#1b1c1f', A.x + 33, sy, A.z - 33, 0);
    this.batch.add(box(0.5, 6, 0.5), '#1b1c1f', A.x + 39, sy, A.z - 35, 0);
    this.texturedPanel(screenTexture(), 10, 5, A.x + 36, sy + 8.5, A.z - 34, -0.5, { back: '#111214', depth: 0.5 });
    // Drapeaux.
    for (let i = 0; i < 10; i++) {
      const x = A.x - 45 + i * 10;
      const z = A.z + A.d / 2 + 16;
      this.batch.add(flagGeo(i % 2 ? '#f2f1ec' : '#1b1c1f'), null, x, this.h(x, z), z, Math.PI / 2);
      this.colliders.addCircle(x, z, 0.15, Infinity, 'flag');
    }
    // Arche d'entrée.
    const E = POLE.entrance;
    const ey = this.h(E.x, E.z);
    for (const dx of [-6, 6]) {
      this.batch.add(box(0.6, 6, 0.6), '#1b1c1f', E.x + dx, ey, E.z, 0);
      this.colliders.addCircle(E.x + dx, E.z, 0.5, Infinity, 'post');
    }
    this.texturedPanel(logoTexture(true), 12.6, 3.1, E.x, ey + 6.5, E.z, 0, { doubleSided: true, back: '#1b1c1f' });
    this.signboard('PÔLE INTERNATIONAL', 'CSO · CSI 3★ · CSI 5★', 344, -150, 0, { w: 6 });
  }

  // Tribune en gradins face à +Z (local).
  buildStands(r, rot, roof = true, title = '') {
    const parts = [];
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      parts.push([box(r.w, 0.7 + i * 0.7, 2.4), i % 2 ? '#d7d5cf' : '#cbc9c2', { z: r.d / 2 - 1.2 - i * 2.4 }]);
    }
    parts.push([box(r.w, 4.8, 0.4), '#2a2b2f', { z: -r.d / 2 }]);
    if (roof) {
      for (let k = 0; k <= 6; k++) parts.push([box(0.3, 8.5, 0.3), '#1b1c1f', { x: -r.w / 2 + (r.w / 6) * k, z: -r.d / 2 + 0.3 }]);
      parts.push([box(r.w + 2, 0.4, r.d + 3), '#1b1c1f', { y: 8.5, z: 0.6, rx: -0.08 }]);
    }
    // Spectateurs.
    const crowd = ['#1b1c1f', '#f2f1ec', '#3a5a8c', '#a33b32', '#d9c9a6', '#5d7a4a', '#2e2f33'];
    for (let i = 0; i < steps; i++) {
      for (let k = 0; k < Math.floor(r.w / 1.1); k++) {
        if (this.rnd() < 0.35) continue;
        const x = -r.w / 2 + 0.6 + k * 1.1 + (this.rnd() - 0.5) * 0.3;
        const z = r.d / 2 - 1.6 - i * 2.4;
        const y = 0.7 + i * 0.7;
        parts.push([box(0.5, 0.7, 0.36), crowd[Math.floor(this.rnd() * crowd.length)], { x, y, z }]);
        parts.push([box(0.24, 0.26, 0.24), '#e2b894', { x, y: y + 0.72, z }]);
      }
    }
    const geo = partsToGeo(parts);
    const y = this.groundAt(r.x, r.z, r.w / 2, r.d / 2, rot);
    this.batch.add(geo, null, r.x, y, r.z, rot);
    this.colliders.addBox(r.x, r.z, r.w / 2, r.d / 2, rot, Infinity, 'stands');
    this.features.buildings.push({ x: r.x, z: r.z, w: r.w, d: r.d, rot, kind: 'stands' });
    if (title) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const px = r.x + s * (r.d / 2 + 2.2);
      const pz = r.z + c * (r.d / 2 + 2.2);
      this.texturedPanel(signTexture(title, 'STRIDES', { dark: true, w: 1024, h: 160 }), r.w * 0.6, r.w * 0.6 * (160 / 1024), px, y + 9.6, pz - c * 2.2, rot, { depth: 0.2 });
    }
  }

  ovalPoint(s, r) {
    // s ∈ [0,1) le long de l'ovale ; départ en haut à gauche, sens horaire vu du dessus (vers +x en haut).
    const L = HIPPO.half * 2;
    const arc = Math.PI * r;
    const total = 2 * L + 2 * arc;
    let d = (((s % 1) + 1) % 1) * total;
    if (d < L) return [HIPPO.x - HIPPO.half + d, HIPPO.z - r, 0];
    d -= L;
    if (d < arc) {
      const a = -Math.PI / 2 + d / r;
      return [HIPPO.x + HIPPO.half + Math.cos(a) * r, HIPPO.z + Math.sin(a) * r, 1];
    }
    d -= arc;
    if (d < L) return [HIPPO.x + HIPPO.half - d, HIPPO.z + r, 2];
    d -= L;
    const a = Math.PI / 2 + d / r;
    return [HIPPO.x - HIPPO.half + Math.cos(a) * r, HIPPO.z + Math.sin(a) * r, 3];
  }

  buildHippodrome() {
    const rin = HIPPO.radius - HIPPO.width / 2 - 0.6;
    const rout = HIPPO.radius + HIPPO.width / 2 + 0.6;
    const N = 160;
    const inner = [];
    for (let i = 0; i < N; i++) {
      const p = this.ovalPoint(i / N, rin);
      inner.push([p[0], p[1]]);
    }
    this.fence(inner, { height: 1.05, rails: 1, closed: true, spacing: 4, tag: 'rail' });
    // Rail extérieur avec deux ouvertures (accès depuis le parking et depuis les champs).
    const outer = [];
    const gaps = [[0.035, 0.07], [0.52, 0.55]];
    let run = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const inGap = gaps.some(([a, b]) => s > a && s < b);
      if (inGap) {
        if (run.length > 1) outer.push(run);
        run = [];
        continue;
      }
      const p = this.ovalPoint(s, rout);
      run.push([p[0], p[1]]);
    }
    if (run.length > 1) outer.push(run);
    for (const r of outer) this.fence(r, { height: 1.05, rails: 1, spacing: 4, tag: 'rail' });
    this.buildStands(HIPPO_SITE.stand, 0, true, 'HIPPODROME DE LA TOUQUES');
    // Poteau d'arrivée.
    const fx = HIPPO.x, fz = HIPPO.z - HIPPO.radius + HIPPO.width / 2 + 1.2;
    const fy = this.h(fx, fz);
    this.batch.add(cyl(0.12, 0.12, 3.6, 6), '#f2f1ec', fx, fy, fz, 0);
    this.batch.add(cyl(0.6, 0.6, 0.08, 14), '#c8302a', fx, fy + 3.6, fz, 0, 1, 1, 1, { rx: Math.PI / 2 });
    this.colliders.addCircle(fx, fz, 0.3, Infinity, 'post');
    // Stalles de départ.
    const sx = HIPPO.x - 40;
    const sz = HIPPO.z - HIPPO.radius;
    const gy = this.h(sx, sz);
    const parts = [];
    for (let k = 0; k <= 8; k++) parts.push([box(3.2, 2.6, 0.2), '#2f6e4a', { z: -HIPPO.width / 2 + (HIPPO.width / 8) * k }]);
    parts.push([box(0.4, 0.4, HIPPO.width + 0.6), '#f2f1ec', { y: 2.6 }]);
    this.batch.add(partsToGeo(parts), null, sx, gy, sz, 0);
    this.signboard('HIPPODROME DE LA TOUQUES', 'Courses de galop', 344, 118, 0, { w: 6 });
  }

  buildTown() {
    const specials = [
      { ...TOWN.hotel, rot: Math.PI },
      { ...TOWN.hq, rot: 0 },
      { ...TOWN.sellerie, rot: Math.PI / 2 },
      { ...TOWN.forge, rot: Math.PI / 2 },
      { ...TOWN.vet, rot: -Math.PI / 2 },
      { ...TOWN.plaza, rot: 0 },
    ];
    const overlapsSpecial = (x, z, r) => specials.some((s) => Math.abs(x - s.x) < s.w / 2 + r && Math.abs(z - s.z) < s.d / 2 + r);
    // Grand Hôtel (façade vers la mer).
    const ht = TOWN.hotel;
    this.place(buildingGeo({ w: ht.w, d: ht.d, h: 14, wall: '#f1ebdf', roof: '#3f444b', roofType: 'hip', roofH: 7, timber: true, floors: 4, trim: '#f6f3ec' }), ht.x, ht.z, Math.PI, ht.w, ht.d, 'hotel');
    for (let i = 0; i < 4; i++) {
      const x = ht.x - 30 + i * 20;
      this.batch.add(gableDormer(), null, x, this.h(ht.x, ht.z) + 14, ht.z - ht.d / 2 + 1, Math.PI);
    }
    this.signboard('GRAND HÔTEL', 'Deauvelle · 1912', -80, -300 - 9, 0, { w: 5, dark: false });
    // Strides HQ : verre noir, logotype 3D sur le toit.
    const hq = TOWN.hq;
    const hy = this.place(hqGeo(hq.w, hq.d, 15), hq.x, hq.z, 0, hq.w, hq.d, 'hq');
    const t = this.text3D('STRIDES', 4.6, 0.8, '#f4f3ef');
    this.batch.add(t.geo, null, hq.x, hy + 15.4, hq.z + hq.d / 2 - 2, 0);
    this.texturedPanel(logoTexture(true), 16, 4, hq.x, hy + 9, hq.z - hq.d / 2 - 0.3, Math.PI, { back: '#111214', depth: 0.2 });
    this.texturedPanel(logoTexture(true), 14, 3.5, hq.x, hy + 4.6, hq.z + hq.d / 2 + 0.3, 0, { back: '#111214', depth: 0.2 });
    // Sellerie.
    const se = TOWN.sellerie;
    const sy = this.place(buildingGeo({ w: se.d, d: se.w, h: 7, wall: '#1d1e21', roof: '#2a2c30', roofType: 'flat', trim: '#c8a96e', floors: 2, doorColor: '#c8a96e' }), se.x, se.z, Math.PI / 2, se.d, se.w, 'shop');
    this.texturedPanel(signTexture('SELLERIE DU PORT', 'Équipement · Sellerie sur-mesure', { dark: true }), 10, 2.2, se.x + se.w / 2 + 0.3, sy + 4.9, se.z, Math.PI / 2, { depth: 0.2 });
    // Forge du maréchal-ferrant.
    const fo = TOWN.forge;
    const fy = this.place(buildingGeo({ w: fo.d, d: fo.w, h: 5.5, wall: PALETTE.brick[0], roof: '#4a4f57', timber: false, floors: 1, chimney: true }), fo.x, fo.z, Math.PI / 2, fo.d, fo.w, 'forge');
    this.texturedPanel(signTexture('FORGE LEMAIRE', 'Maréchal-ferrant', { dark: false }), 8, 1.8, fo.x + fo.w / 2 + 0.3, fy + 4.2, fo.z, Math.PI / 2, { depth: 0.2 });
    this.batch.add(box(0.8, 0.8, 0.5), '#2a2b2f', fo.x + fo.w / 2 + 3, this.h(fo.x + fo.w / 2 + 3, fo.z + 4), fo.z + 4, 0);
    // Clinique vétérinaire.
    const ve = TOWN.vet;
    const vy = this.place(buildingGeo({ w: ve.d, d: ve.w, h: 8, wall: '#f4f3ef', roof: '#2a2c30', roofType: 'flat', trim: '#1b1c1f', floors: 2 }), ve.x, ve.z, -Math.PI / 2, ve.d, ve.w, 'vet');
    this.texturedPanel(signTexture('CLINIQUE VÉTÉRINAIRE', 'Équine · Urgences 24/7', { dark: true }), 11, 2.2, ve.x - ve.w / 2 - 0.3, vy + 5.6, ve.z, -Math.PI / 2, { depth: 0.2 });

    // Îlots génériques.
    const inset = 6.2;
    for (const [x0, x1, z0, z1] of TOWN_BLOCKS) {
      const edges = [
        { ax: x0, az: z0, bx: x1, bz: z0, rot: Math.PI },
        { ax: x1, az: z1, bx: x0, bz: z1, rot: 0 },
        { ax: x0, az: z1, bx: x0, bz: z0, rot: -Math.PI / 2 },
        { ax: x1, az: z0, bx: x1, bz: z1, rot: Math.PI / 2 },
      ];
      for (const e of edges) {
        const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
        const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len;
        // Normale vers l'intérieur de l'îlot.
        const nx = -Math.sin(e.rot), nz = -Math.cos(e.rot);
        let s = inset + 10;
        while (s < len - inset - 10) {
          const w = 9 + Math.floor(this.rnd() * 6);
          const d = 9 + Math.floor(this.rnd() * 3);
          if (s + w > len - inset - 10) break;
          const cx = e.ax + dx * (s + w / 2) + nx * (inset + d / 2);
          const cz = e.az + dz * (s + w / 2) + nz * (inset + d / 2);
          if (!overlapsSpecial(cx, cz, 6)) {
            const floors = 2 + (this.rnd() < 0.4 ? 1 : 0);
            const brick = this.rnd() < 0.22;
            const wall = brick ? PALETTE.brick[Math.floor(this.rnd() * 3)] : PALETTE.walls[Math.floor(this.rnd() * PALETTE.walls.length)];
            const geo = buildingGeo({ w, d, h: floors * 3.3, wall, roof: PALETTE.roofs[Math.floor(this.rnd() * PALETTE.roofs.length)], timber: !brick && this.rnd() < 0.6, floors, roofType: this.rnd() < 0.7 ? 'gable' : 'hip', chimney: this.rnd() < 0.5 });
            const by = this.place(geo, cx, cz, e.rot, w, d);
            if (this.rnd() < 0.45) {
              const AW = [['#1b1c1f', '#f2f1ec'], ['#2f5f8a', '#f2f1ec'], ['#7a2a2a', '#efe6d2'], ['#2f5a3c', '#efe6d2'], ['#1b1c1f', '#c8a96e']];
              const [c1, c2] = AW[Math.floor(this.rnd() * AW.length)];
              const fx = Math.sin(e.rot) * (d / 2), fz = Math.cos(e.rot) * (d / 2);
              this.batch.add(awningGeo(Math.min(w - 2, 7), c1, c2), null, cx + fx, by, cz + fz, e.rot);
            }
          }
          s += w + 0.4 + (this.rnd() < 0.2 ? 6 : 0);
        }
      }
      // Jardin intérieur.
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (!overlapsSpecial(mx, mz, 4)) {
        for (let k = 0; k < 3; k++) this.tree(this.rnd() < 0.5 ? 'oak' : 'birch', mx + (this.rnd() - 0.5) * 16, mz + (this.rnd() - 0.5) * 12, 0.9);
      }
    }
    // Place : fontaine, arbres, terrasse.
    const P = TOWN.plaza;
    const py = this.h(P.x, P.z);
    this.batch.add(cyl(5, 5.4, 0.7, 20), '#d8d2c4', P.x, py, P.z, 0);
    this.batch.add(cyl(4.4, 4.4, 0.72, 20), '#5aa3b0', P.x, py + 0.02, P.z, 0);
    this.batch.add(cyl(0.7, 1, 2.6, 10), '#d8d2c4', P.x, py, P.z, 0);
    this.batch.add(cyl(1.6, 1.2, 0.4, 12), '#d8d2c4', P.x, py + 2.6, P.z, 0);
    this.lights.add(cyl(0.3, 0.5, 1.2, 8), '#cfe9f0', P.x, py + 2.9, P.z, 0);
    this.colliders.addCircle(P.x, P.z, 5.4, py + 0.7, 'fountain');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.tree('birch', P.x + Math.cos(a) * 18, P.z + Math.sin(a) * 18, 0.9);
    }
    const bench = benchGeo();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const bx = P.x + Math.cos(a) * 10;
      const bz = P.z + Math.sin(a) * 10;
      this.batch.add(bench, null, bx, this.h(bx, bz), bz, -a - Math.PI / 2);
    }
    // Café « Le Galop » : kiosque et terrasse.
    this.place(buildingGeo({ w: 10, d: 7, h: 3.6, wall: '#1d1e21', roof: '#f2f1ec', roofType: 'flat', trim: '#f2f1ec', floors: 1, doorColor: '#c8a96e' }), P.x + 32, P.z - 18, Math.PI, 10, 7, 'cafe');
    for (let i = 0; i < 6; i++) {
      const x = P.x + 26 + (i % 3) * 4;
      const z = P.z - 10 + Math.floor(i / 3) * 4;
      this.batch.add(parasolGeo('#f2f1ec', '#1d1e21'), null, x, this.h(x, z), z, 0);
      this.batch.add(cyl(0.45, 0.45, 0.75, 8), '#f2f1ec', x, this.h(x, z), z, 0);
    }
    this.signboard('LE GALOP', 'Café · Brasserie', P.x + 32, P.z - 13.5, 0, { w: 3.6, h: 0.9, postH: 1.6 });
    // Lampadaires.
    for (const road of ROADS.filter((r) => r.id.startsWith('t_') || r.id === 'coast' || r.id === 'main')) {
      const pts = road.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.floor(len / 26);
        for (let k = 1; k < n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const z = az + ((bz - az) * k) / n;
          if (x < -210 || x > 150 || z < -360 || z > -160) continue;
          const nx = -(bz - az) / len, nz = (bx - ax) / len;
          const side = k % 2 ? 1 : -1;
          const lx = x + nx * (road.w / 2 + 1.6) * side;
          const lz = z + nz * (road.w / 2 + 1.6) * side;
          if (overlapsSpecial(lx, lz, 1) && !(Math.abs(lx - P.x) < P.w / 2 && Math.abs(lz - P.z) < P.d / 2)) continue;
          this.lamp(lx, lz, Math.atan2(nz * side, -nx * side));
        }
      }
    }
  }

  // Trottoirs, passages piétons, jardinières, voitures garées, statue.
  buildStreetscape() {
    const roadW = (x0, x1, z0, z1, edge) => {
      if (edge === 'n' && z0 === -352) return 9;
      if ((edge === 'w' && x0 === -30) || (edge === 'e' && x1 === -30)) return 9;
      return 7;
    };
    const SW = 2.6;
    const curb = '#cbc5b8';
    for (const [x0, x1, z0, z1] of TOWN_BLOCKS) {
      const iw = roadW(x0, x1, z0, z1, 'w') / 2, ie = roadW(x0, x1, z0, z1, 'e') / 2;
      const inn = roadW(x0, x1, z0, z1, 'n') / 2, is = roadW(x0, x1, z0, z1, 's') / 2;
      const ax = x0 + iw, bx = x1 - ie, az = z0 + inn, bz = z1 - is;
      const strips = [
        [(ax + bx) / 2, az + SW / 2, bx - ax, SW],
        [(ax + bx) / 2, bz - SW / 2, bx - ax, SW],
        [ax + SW / 2, (az + bz) / 2, SW, bz - az - SW * 2],
        [bx - SW / 2, (az + bz) / 2, SW, bz - az - SW * 2],
      ];
      for (const [cx, cz, w, d] of strips) {
        const y = this.h(cx, cz);
        this.batch.add(box(w, 0.16, d), curb, cx, y - 0.02, cz, 0);
      }
      // Jardinières aux angles.
      const flowers = ['#d8443a', '#e9c94a', '#f2f1ec', '#b55aa0'];
      for (const [px, pz] of [[ax + 3.5, az + 1.3], [bx - 3.5, bz - 1.3]]) {
        if (this.rnd() < 0.7) this.batch.add(planterGeo(flowers[Math.floor(this.rnd() * 4)]), null, px, this.h(px, pz) + 0.14, pz, 0);
      }
    }
    // Passages piétons à chaque intersection du quadrillage.
    const xs = [-130, -30, 70];
    const zs = [-300, -232, -166];
    for (const x of xs) {
      for (const z of zs) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const off = 7.5;
          const cx = x + dx * off, cz = z + dz * off;
          const y = this.h(cx, cz);
          const along = dx !== 0; // bandes parallèles à la route traversée
          for (let k = -2; k <= 2; k++) {
            const bx2 = cx + (along ? 0 : k * 1.2), bz2 = cz + (along ? k * 1.2 : 0);
            this.batch.add(box(along ? 2.4 : 0.55, 0.03, along ? 0.55 : 2.4, false), '#f2f1ec', bx2, y + 0.095, bz2, 0);
          }
        }
      }
    }
    // Voitures garées.
    const colors = ['#f2f1ec', '#1b1c1f', '#7a7d84', '#2f5f8a', '#7a2a2a', '#c8c3b5', '#2f5a3c'];
    const spots = [
      [-80, -296.2, Math.PI / 2], [-64, -296.2, Math.PI / 2], [20, -235.8, -Math.PI / 2], [36, -235.8, -Math.PI / 2],
      [-126.2, -210, 0], [-126.2, -190, 0], [66.2, -260, Math.PI], [66.2, -276, Math.PI], [100, -169.8, Math.PI / 2],
      [-170, -228.2, -Math.PI / 2], [-100, -169.8, Math.PI / 2], [120, -296.2, -Math.PI / 2],
    ];
    spots.forEach(([x, z, r], i) => {
      this.batch.add(carGeo(colors[i % colors.length]), null, x, this.h(x, z), z, r);
      this.colliders.addBox(x, z, 0.95, 2.15, r, Infinity, 'car');
    });
    // Statue équestre en bronze (« Le Galop »), devant Strides HQ.
    const sx = TOWN.hq.x - 30, sz = TOWN.hq.z + TOWN.hq.d / 2 + 6;
    const sy = this.h(sx, sz);
    this.batch.add(partsToGeo([[box(3.4, 1.6, 2.2), '#d8d2c4'], [box(3.6, 0.2, 2.4), '#bfb8aa', { y: 1.6 }]]), null, sx, sy, sz, 0);
    this.colliders.addBox(sx, sz, 1.8, 1.2, 0, Infinity, 'statue');
    const statue = createHorseMesh({ coat: { body: '#6e5434', mane: '#4a3822', legs: '#5e472c', muzzle: '#4a3822', hoof: '#3a2c1c' }, saddle: false });
    const B = statue.bones;
    B.body.rotation.x = -0.55;
    B.body.position.y = 1.55;
    B.flU.rotation.x = -1.1;
    B.flL.rotation.x = 1.6;
    B.frU.rotation.x = -0.6;
    B.frL.rotation.x = 1.2;
    B.hlU.rotation.x = 0.1;
    B.hrU.rotation.x = 0.35;
    B.neck.rotation.x = -0.35;
    B.tail.rotation.x = 0.5;
    statue.mesh.position.set(sx, sy + 1.8, sz);
    statue.mesh.rotation.y = Math.PI / 2;
    statue.mesh.scale.setScalar(1.1);
    statue.mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#2a1d0c', emissiveIntensity: 0.3 });
    this.group.add(statue.mesh);
  }

  buildBeach() {
    const P = TOWN.planches;
    // Promenade des Planches.
    for (let x = P.x0; x < P.x1; x += 6) {
      const y = this.h(x + 3, P.z);
      this.batch.add(box(6.05, 0.25, 4), '#a58d6f', x + 3, y + 0.05, P.z, 0);
      this.batch.add(box(0.08, 0.02, 4), '#8c765c', x + 0.1, y + 0.3, P.z, 0);
    }
    // Cabines de plage.
    const doors = ['#1d1e21', '#2f5f8a', '#b8322a', '#2f6e4a', '#c8a96e'];
    for (let i = 0; i < 34; i++) {
      const x = -170 + i * 8.5;
      if (x > 140) break;
      const z = -366;
      const y = this.h(x, z);
      const g = partsToGeo([
        [box(2.6, 2.6, 2.4), '#f4f3ef'],
        [gableRoofGeo(2.6, 0.9, 2.4), '#f4f3ef', { y: 2.6 }],
        [box(1.0, 1.9, 0.08), doors[i % doors.length], { z: -1.22 }],
      ]);
      this.batch.add(g, null, x, y, z, 0);
      this.colliders.addBox(x, z, 1.3, 1.2, 0, Infinity, 'cabin');
    }
    // Parasols de Deauvelle.
    const cols = [['#b8322a', '#f2f1ec'], ['#2f5f8a', '#f2f1ec'], ['#e3b23c', '#f2f1ec'], ['#2f6e4a', '#f2f1ec'], ['#d46a2e', '#f2f1ec']];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 18; i++) {
        const x = -150 + i * 15 + row * 5;
        const z = -392 - row * 8;
        if (z - shoreZ(x) < 14) continue;
        const c = cols[(i + row) % cols.length];
        this.batch.add(parasolGeo(c[0], c[1]), null, x, this.h(x, z), z, 0);
        this.colliders.addCircle(x, z, 0.2, Infinity, 'parasol');
      }
    }
    // Poste de secours.
    const lx = 200, lz = -395;
    this.batch.add(partsToGeo([
      [box(0.2, 3, 0.2), '#f2f1ec', { x: -1, z: -1 }], [box(0.2, 3, 0.2), '#f2f1ec', { x: 1, z: -1 }],
      [box(0.2, 3, 0.2), '#f2f1ec', { x: -1, z: 1 }], [box(0.2, 3, 0.2), '#f2f1ec', { x: 1, z: 1 }],
      [box(2.6, 1.8, 2.6), '#b8322a', { y: 3 }], [gableRoofGeo(2.6, 0.8, 2.6), '#f2f1ec', { y: 4.8 }],
    ]), null, lx, this.h(lx, lz), lz, 0);
    this.colliders.addBox(lx, lz, 1.2, 1.2, 0, Infinity, 'tower');
    // Rochers au pied des falaises.
    for (let i = 0; i < 26; i++) {
      const x = -470 - this.rnd() * 110;
      const z = shoreZ(x) + 2 + this.rnd() * 8;
      this.batch.add(ico(0.6 + this.rnd() * 1.2), '#b4b0a5', x, this.h(x, z), z, this.rnd() * 6, 1, 0.7, 1.2);
    }
  }

  buildCliffs() {
    const L = LIGHTHOUSE;
    const y = this.h(L.x, L.z);
    const parts = [
      [cyl(2.2, 2.8, 4, 12), '#f4f3ef'],
      [cyl(1.7, 2.2, 6, 12), '#b8322a', { y: 4 }],
      [cyl(1.4, 1.7, 6, 12), '#f4f3ef', { y: 10 }],
      [cyl(2.2, 2.2, 0.4, 12), '#1b1c1f', { y: 16 }],
      [cyl(1.5, 1.5, 0.3, 12), '#1b1c1f', { y: 19 }],
      [cone(1.6, 1.6, 12), '#b8322a', { y: 19.3 }],
    ];
    this.batch.add(partsToGeo(parts), null, L.x, y, L.z, 0);
    this.lights.add(cyl(1.2, 1.2, 2.6, 10), '#fff3c4', L.x, y + 16.4, L.z, 0);
    this.colliders.addCircle(L.x, L.z, 2.9, Infinity, 'lighthouse');
    this.place(buildingGeo({ w: 8, d: 6, h: 3.6, wall: '#f4f3ef', roof: '#454a52', floors: 1 }), L.x + 9, L.z + 6, 0, 8, 6);
    // Faisceau tournant (visible de nuit).
    const beamGeo = new THREE.ConeGeometry(6, 70, 16, 1, true);
    beamGeo.rotateZ(Math.PI / 2);
    beamGeo.translate(35, 0, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(L.x, y + 17.6, L.z);
    this.group.add(beam);
    this.beam = beam;
    // Arche et aiguille dans la mer.
    const A = ARCH;
    const ay = -4;
    const arch = partsToGeo([
      [box(9, 30, 10), '#e7e3d8', { x: -10, rz: 0.05 }],
      [box(8, 30, 9), '#e2ddd0', { x: 10, rz: -0.12 }],
      [box(30, 9, 10), '#e7e3d8', { y: 24 }],
      [box(30, 1.2, 10.4), '#7ea35a', { y: 33 }],
      [box(14, 8, 9), '#ddd8ca', { x: 4, y: 17, rz: -0.4 }],
    ]);
    this.batch.add(arch, null, A.x, ay, A.z, 0.5);
    this.batch.add(partsToGeo([[cone(5, 46, 6), '#e4e0d4'], [cone(1.4, 4, 6), '#7ea35a', { y: 44 }]]), null, A.x - 40, -6, A.z - 26, 0);
  }

  buildSignHill() {
    const letters = 'STRIDES';
    const size = 8.5;
    const parts = letters.split('').map((ch) => this.text3D(ch, size, 1.2, '#f4f3ef'));
    const gap = 2.2;
    const total = parts.reduce((s, p) => s + p.width, 0) + gap * (letters.length - 1);
    // Lettres face au nord : on les place d'est en ouest pour qu'elles se lisent depuis la ville.
    let x = SIGN.x + total / 2;
    const z = SIGN.z - 40;
    for (const p of parts) {
      const cx = x - p.width / 2;
      const y = this.h(cx, z) - 0.6;
      // Lettres face au nord (vers la ville), lisibles depuis Deauvelle.
      this.batch.add(p.geo, null, cx, y, z, Math.PI, 1, 1, 1);
      this.batch.add(box(0.3, 2, 0.3), '#6d6f73', cx - p.width * 0.3, y - 1, z + 1.2, 0);
      this.batch.add(box(0.3, 2, 0.3), '#6d6f73', cx + p.width * 0.3, y - 1, z + 1.2, 0);
      this.colliders.addBox(cx, z, p.width / 2, 0.8, 0, Infinity, 'letter');
      x -= p.width + gap;
    }
  }

  buildCountryside() {
    const { fields, hedges } = getFields();
    for (const hd of hedges) {
      const [ax, az] = hd.a;
      const [bx, bz] = hd.b;
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 12));
      const ang = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < n; i++) {
        const x0 = ax + ((bx - ax) * i) / n, z0 = az + ((bz - az) * i) / n;
        const x1 = ax + ((bx - ax) * (i + 1)) / n, z1 = az + ((bz - az) * (i + 1)) / n;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const seg = Math.hypot(x1 - x0, z1 - z0);
        const y = Math.min(this.h(x0, z0), this.h(x1, z1), this.h(mx, mz)) - 0.1;
        this.batch.add(hedgeGeo(seg + 0.3, this.rnd), null, mx, y, mz, ang);
        this.colliders.addSegment(x0, z0, x1, z1, 1.5, y + 1.25, 'hedge');
        if (this.rnd() < 0.2) this.tree(this.rnd() < 0.7 ? 'oak' : 'poplar', mx + Math.cos(ang) * 0.4, mz - Math.sin(ang) * 0.4, 0.9 + this.rnd() * 0.5);
      }
    }
    const bale = roundBaleGeo();
    let orchards = 0;
    for (const f of fields) {
      if (f.reserved) continue;
      if (f.type === 'orchard' && orchards < 7) {
        orchards++;
        for (let gx = -30; gx <= 30; gx += 10) {
          for (let gz = -30; gz <= 30; gz += 10) {
            const x = f.cx + gx + (this.rnd() - 0.5) * 2;
            const z = f.cz + gz + (this.rnd() - 0.5) * 2;
            if (!pointInPoly(x, z, f.poly) || isReserved(x, z, 4)) continue;
            this.tree('apple', x, z, 0.9 + this.rnd() * 0.25);
          }
        }
      } else if (f.type === 'wheat' && this.rnd() < 0.6) {
        for (let k = 0; k < 4; k++) {
          const x = f.cx + (this.rnd() - 0.5) * 40;
          const z = f.cz + (this.rnd() - 0.5) * 40;
          if (!pointInPoly(x, z, f.poly) || isReserved(x, z, 4)) continue;
          this.batch.add(bale, null, x, this.h(x, z) - 0.05, z, this.rnd() * 3);
          this.colliders.addCircle(x, z, 0.9, this.h(x, z) + 1.5, 'bale');
        }
      } else if ((f.type === 'grass' || f.type === 'lightgrass') && this.rnd() < 0.35) {
        const x = f.cx + (this.rnd() - 0.5) * 30;
        const z = f.cz + (this.rnd() - 0.5) * 30;
        if (pointInPoly(x, z, f.poly) && !isReserved(x, z, 6)) this.tree('oak', x, z, 1.2 + this.rnd() * 0.4);
      }
    }
  }

  buildForests() {
    const step = 10;
    for (let x = -WORLD.half + 5; x < WORLD.half; x += step) {
      for (let z = -WORLD.half + 5; z < WORLD.half; z += step) {
        const px = x + (this.rnd() - 0.5) * step * 0.9;
        const pz = z + (this.rnd() - 0.5) * step * 0.9;
        const d = forestDensity(px, pz);
        if (d < 0.08 || this.rnd() > d * 0.92) continue;
        if (z - shoreZ(x) < 70) continue;
        if (polyDist(px, pz, XC_PATH).d < 7) continue;
        if (Math.hypot(px - POND.x, pz - POND.z) < POND.r + 5) continue;
        if (nearestRoad(px, pz).d < 4) continue;
        if (ZONES.some((zn) => Math.abs(px - zn.x) < zn.hw + 3 && Math.abs(pz - zn.z) < zn.hd + 3)) continue;
        const r = this.rnd();
        const kind = r < 0.45 ? 'pine' : r < 0.85 ? 'oak' : 'birch';
        this.tree(kind, px, pz, 0.85 + this.rnd() * 0.5);
      }
    }
    // Arbustes et arbres isolés sur le plateau des falaises.
    for (let i = 0; i < 40; i++) {
      const x = -590 + this.rnd() * 150;
      const z = -390 + this.rnd() * 150;
      if (z - shoreZ(x) < 30 || Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 14) continue;
      this.tree(this.rnd() < 0.7 ? 'bush' : 'oak', x, z, 0.8 + this.rnd() * 0.6);
    }
  }

  buildRoadTrees() {
    for (const road of ROADS.filter((r) => ['main', 'ew', 'hippo', 'gatien'].includes(r.id))) {
      const pts = road.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.floor(len / 18);
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / Math.max(n, 1);
          const z = az + ((bz - az) * k) / Math.max(n, 1);
          for (const side of [-1, 1]) {
            const tx = x + nx * (road.w / 2 + 5) * side;
            const tz = z + nz * (road.w / 2 + 5) * side;
            if (ZONES.some((zn) => Math.abs(tx - zn.x) < zn.hw + 4 && Math.abs(tz - zn.z) < zn.hd + 4)) continue;
            if (nearestRoad(tx, tz).d < 2.4 || z - shoreZ(x) < 90) continue;
            this.tree(road.id === 'ew' ? 'poplar' : 'oak', tx, tz, 0.95);
          }
        }
      }
    }
  }

  buildBillboards() {
    const spots = [
      [-12, -92, -30, -40, 3], [182, -106, 100, -120, 0], [-252, -106, -150, -120, 1], [300, 50, 200, 66, 2],
      [-46, 336, -30, 250, 4], [205, -362, 150, -352, 3], [362, -168, 330, -130, 2], [-60, 60, -30, 20, 0],
    ];
    for (const [x, z, fx, fz, ad] of spots) {
      const rot = Math.atan2(fx - x, fz - z);
      const y = this.h(x, z);
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const k of [-1, 1]) {
        this.batch.add(box(0.35, 4.2, 0.35), '#2a2b2f', x + c * k * 3.8, y, z - s * k * 3.8, rot);
        this.colliders.addCircle(x + c * k * 3.8, z - s * k * 3.8, 0.35, Infinity, 'billboard');
      }
      this.texturedPanel(adTexture(ad), 11, 5.5, x, y + 6.6, z, rot, { back: '#1b1c1f', depth: 0.35 });
    }
  }

  update(dt, camera, sky) {
    const night = sky.nightFactor;
    this.glassMat.emissiveIntensity = night * 0.9;
    this.lightMat.emissiveIntensity = 0.2 + night * 1.6;
    if (this.beam) {
      this.beam.rotation.y += dt * 0.8;
      this.beam.material.opacity = night * 0.18;
      this.beam.visible = night > 0.05;
    }
    // Masquer les tuiles lointaines.
    const cx = camera.position.x, cz = camera.position.z;
    for (const m of this.chunks) {
      const s = m.geometry.boundingSphere;
      const d = Math.hypot(s.center.x - cx, s.center.z - cz) - s.radius;
      m.visible = d < 620;
    }
  }
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function gableRoofGeo(w, h, d) {
  return gableRoof(w, h, d);
}

function gableDormer() {
  return partsToGeo([
    [box(3.2, 3, 2.4), '#f1ebdf', { y: -0.5 }],
    [gableRoofGeo(2.4, 1.6, 3.2), '#3f444b', { y: 2.5, ry: Math.PI / 2 }],
    [box(1.2, 1.4, 0.15), PALETTE.glass, { y: 0.5, z: -1.25 }],
  ]);
}

function hqGeo(w, d, h) {
  const parts = [[box(w, h + 2, d), '#15161a', { y: -2 }]];
  const floors = 4;
  for (let f = 1; f <= floors; f++) {
    parts.push([box(w + 0.3, 0.35, d + 0.3), '#f4f3ef', { y: (h / floors) * f - 0.35 }]);
  }
  parts.push([box(w * 0.3, h * 0.55, 0.3), '#f4f3ef', { x: -w * 0.33, y: 0, z: d / 2 + 0.1 }]);
  parts.push([box(4, 3, 0.4), '#2a3a4a', { y: 0, z: d / 2 + 0.05 }]);
  return { body: partsToGeo(parts), glass: partsToGeo([[box(w - 1, h - 1.5, d + 0.12), '#24313d', { y: 0.6 }]]) };
}
