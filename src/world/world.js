// Construction du monde : terrain, mer, routes, sites, bocage, forêts, signalétique Strides.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { mulberry32, polyDist, clamp } from '../core/math.js';
import { WORLD, ROADS, ZONES, HIPPO, XC_PATH, POND, SIGN, LIGHTHOUSE, ARCH, shoreZ, forestDensity, isReserved, nearestRoad } from './layout.js';
import { HOME, HARAS, POLE, HIPPO_SITE, DUNES, GATIEN, TOWN, TOWN_BLOCKS, homeBoxes } from './sites.js';
import { Terrain } from './terrain.js';
import { makeTerrainTexture, makeGroundDetail } from './terrainTexture.js';
import { applySurfaces, applyRoadShader, applyInteriors, INTERIOR_UNIFORMS } from './surfaces.js';
import { CAR_COLORS, CAR_MODELS, troughGeo, mountingBlockGeo, wheelbarrowGeo, muckHeapGeo, wrappedBaleGeo } from './props.js';
import { Water } from './water.js';
import { Sky, CLOUD_UNIFORMS } from './sky.js';
import { TIDE_EXTREMES } from './weather.js';
import { StaticBatch, paint, prep, gableRoof } from './shapes.js';
import {
  PALETTE, buildingGeo, stableGeo, shedGeo, fenceGeo, lampGeo, benchGeo, parasolGeo,
  roundBaleGeo, flagGeo, partsToGeo, box, cyl, cone, ico, awningGeo, planterGeo, winBox, ensureWin,
} from './builders.js';
import { buildGrassMask, clearGrassUnder } from './grass.js';
import { Vegetation } from './vegetation.js';
import { createHorseMesh } from '../entities/horseModel.js';
import { adTexture, signTexture, bannerTexture, roadTexture, screenTexture, logoTexture, roadSignTexture } from './textures.js';
import { getFields, hedgeRuns, nearPath } from './fields.js';

const font = new FontLoader().parse(fontJson);

export class World {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.group = new THREE.Group();
    this.group.name = 'world';
    scene.add(this.group);
    this.features = { buildings: [], fences: [], trees: 0 };
    // Trottoirs : rectangles [x0, x1, z0, z1, dessus] et leur emprise, pour la hauteur de marche (walkHeight).
    this.walkways = [];
    this.walkBox = null;
    // Texture de détail partagée (sol, façades) et matériaux physiques des décors.
    this.detailTex = makeGroundDetail(256);
    this.mat = applySurfaces(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), this.detailTex, () => this.terrain);
    this.glassMat = applyInteriors(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.1 }));
    this.lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#ffe2a8', emissiveIntensity: 0.2 });
    this.batch = new StaticBatch(150);
    // Petits détails (sièges, public…) : lot séparé, masqué au-delà de quelques centaines de mètres.
    this.detailBatch = new StaticBatch(90);
    // Véhicules garés : peinture vernie.
    this.parkedVehicles = [];
    this.glass = new StaticBatch(150);
    this.lights = new StaticBatch(150);
    this.chunks = [];
    // Petits objets isolés masqués au-delà d'une distance propre (panneaux, fontaine, obstacles, poteaux de chrono) :
    // [objet, x, z, distance].
    this.culled = [];
    this.animated = [];
    this.rnd = mulberry32(2026);
    // Arbres et haies : instanciés par variante, niveaux de détail gérés par Vegetation.
    this.veg = new Vegetation(this.group, scene);
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
    const { texture, canvas, splat, splatData, splatSize } = makeTerrainTexture(this.terrain, this.textureSize || 2048);
    this.groundSplat = { data: splatData, size: splatSize };
    this.terrainCanvas = canvas;
    this.grassMask = buildGrassMask(canvas);
    this.terrainMesh = this.terrain.buildMesh(texture, this.detailTex, splat);
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
    this.buildRoadSigns();
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
    this.detailChunks = this.detailBatch.build(this.mat, this.group, { name: 'detail', castShadow: false });
    this._buildLampPools();
    for (const m of this.detailChunks) m.userData.center = m.geometry.boundingSphere.center.clone();
    this.chunks.push(...this.glass.build(this.glassMat, this.group, { castShadow: false, name: 'glass' }));
    this.chunks.push(...this.lights.build(this.lightMat, this.group, { castShadow: false, receiveShadow: false, name: 'lights' }));
    this.veg.build((x, z) => this.h(x, z));
    clearGrassUnder(this.grassMask, this.features.buildings);
    progress(0.9, 'Prêt');
  }

  // ---------- Utilitaires de placement ----------
  // Hauteur de marche en (x, z) : le terrain, ou le dessus d'une surface praticable surélevée (platelage des Planches,
  // trottoirs de Deauvelle) — personnages et chevaux posent les pieds dessus, pas dedans.
  walkHeight(x, z) {
    const P = TOWN.planches;
    if (z > P.z - 2 && z < P.z + 2 && x >= P.x0 && x <= P.x1) {
      // Platelage : lames interpolées entre deux appuis (tous les 2 m, terrain sur l'axe + 0,3 m, voir buildBeach).
      const xa = P.x0 + Math.floor((x - P.x0) / 2) * 2;
      const t = (x - xa) / 2;
      return this.h(xa, P.z) * (1 - t) + this.h(xa + 2, P.z) * t + 0.3;
    }
    const B = this.walkBox;
    if (B && x > B[0] && x < B[1] && z > B[2] && z < B[3]) {
      for (const s of this.walkways) if (x > s[0] && x < s[1] && z > s[2] && z < s[3]) return s[4];
    }
    return this.h(x, z);
  }

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
    if (geoPair.shutters) this.batch.addDetail(geoPair.shutters, null, x, y, z, rot, 1);
    if (geoPair.detail) this.batch.addDetail(geoPair.detail, null, x, y, z, rot);
    if (geoPair.glass) this.glass.add(ensureWin(geoPair.glass), null, x, y, z, rot);
    if (collide) {
      const col = this.colliders.addBox(x, z, w / 2, d / 2, rot, Infinity, kind);
      // Débord de toit (écuries) : la caméra l'évite quand elle arrive à sa hauteur (voir Colliders.cameraBlocked).
      if (geoPair.eave) {
        col.eave = geoPair.eave;
        col.eaveY = y + geoPair.eaveY;
      }
    }
    // Avant-corps en saillie sur les façades : une boîte de collision chacun.
    if (collide && geoPair.bays) {
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const [bx, bz, bhw, bhd] of geoPair.bays) this.colliders.addBox(x + bx * c + bz * s, z - bx * s + bz * c, bhw, bhd, rot, Infinity, kind);
    }
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

  // Arbre procédural (chêne, hêtre, frêne, peuplier, bouleau, pin, pommier, têtard, buisson).
  // Trois tirages aléatoires comme avant : la suite du monde (positions, collisions) reste identique.
  tree(kind, x, z, scale = 1, collide = true) {
    const y = this.h(x, z) - 0.15;
    const rot = this.rnd() * Math.PI * 2;
    const sy = 0.9 + this.rnd() * 0.25;
    this.veg.addTree(kind, x, y, z, rot, scale, sy, this.rnd());
    if (collide && kind !== 'bush') this.colliders.addCircle(x, z, 0.45 * scale, Infinity, 'tree');
    this.features.trees++;
  }

  texturedPanel(tex, w, h, x, y, z, rot, { back = '#1b1c1f', depth = 0.25, doubleSided = false } = {}) {
    const mat = new THREE.MeshStandardMaterial({ map: tex });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(x + Math.sin(rot) * (depth / 2 + 0.01), y, z + Math.cos(rot) * (depth / 2 + 0.01));
    plane.rotation.y = rot;
    plane.receiveShadow = true;
    this.group.add(plane);
    // Au loin, la face imprimée ne fait plus qu'un ou deux pixels : seul le caisson (lot statique) reste.
    const far = clamp(Math.max(w, h) * 70, 250, 620);
    this.culled.push([plane, x, z, far]);
    if (doubleSided) {
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      p2.position.set(x - Math.sin(rot) * (depth / 2 + 0.01), y, z - Math.cos(rot) * (depth / 2 + 0.01));
      p2.rotation.y = rot + Math.PI;
      this.group.add(p2);
      this.culled.push([p2, x, z, far]);
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
    this.batch.addDetail(L.detail, null, x, y, z, rot);
    this.lights.add(L.light, null, x, y, z, rot);
    this.colliders.addCircle(x, z, 0.2, Infinity, 'lamp');
    // Flaque de lumière au sol (la nuit), sous la lanterne décalée de 0,75 m. Posée au-dessus du trottoir (dessus à
    // +0,14 m) : à hauteur de chaussée, le trottoir la coupait net au bord et restait dans le noir.
    (this._lampPools ||= []).push([x + Math.cos(rot) * 0.75, y + 0.16, z - Math.sin(rot) * 0.75]);
  }

  // Halos des lampadaires : disques additifs au dégradé radial, un seul appel de dessin.
  _buildLampPools() {
    const pools = this._lampPools || [];
    if (!pools.length) return;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,222,170,1)');
    gr.addColorStop(0.3, 'rgba(255,205,140,0.6)');
    gr.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(11, 11);
    geo.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, toneMapped: true });
    const mesh = new THREE.InstancedMesh(geo, this.poolMat, pools.length);
    const m = new THREE.Matrix4();
    pools.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.lampPools = mesh;
    this.group.add(mesh);
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
          uvs.push(u * road.w, dist, road.w);
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
    geo.setAttribute('roadUV', new THREE.Float32BufferAttribute(uvs, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, depthWrite: false });
    applyRoadShader(mat, this.detailTex);
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
    this.arenaLetters(HOME.arena);
    this.rectFence(HOME.paddock, { height: 1.15, rails: 3 }, 'e', 4, 0.3);
    // Abreuvoirs, montoir, brouette, fumière, tracteur, voiture, balles enrubannées.
    this.batch.add(troughGeo(), null, -150, this.h(-150, 205), 205, 0);
    this.batch.add(troughGeo(), null, -141, this.h(-141, 161.5), 161.5, 0);
    this.colliders.addBox(-141, 161.5, 1.3, 0.65, 0, Infinity, 'trough');
    this.batch.add(mountingBlockGeo(), null, -97, this.h(-97, 162.2), 162.2, Math.PI / 2);
    this.batch.add(wheelbarrowGeo(), null, -129, this.h(-129, 161), 161, 2.2);
    this.batch.add(muckHeapGeo(), null, -178, this.h(-178, 152), 152, Math.PI / 2);
    this.colliders.addBox(-178, 152, 3.2, 3.6, Math.PI / 2, Infinity, 'muck');
    // Tracteur et voiture de l'écurie : véhicules conduisibles (créés par le jeu, voir vehicle.js).
    this.parkedVehicles.push(
      { kind: 'tractor', color: '#a3271f', x: -158, z: 166, heading: -Math.PI / 2 - 0.25 },
      { kind: 'duster', color: '#59603f', x: -84, z: 146, heading: Math.PI / 2 },
    );
    for (let i = 0; i < 6; i++) {
      const bx = -172 + (i % 3) * 1.5, bz = 192 + Math.floor(i / 3) * 1.6;
      this.batch.add(wrappedBaleGeo(i % 4 === 3 ? '#e9e8e2' : '#2e3a2f'), null, bx, this.h(bx, bz), bz, 0);
    }
    this.colliders.addBox(-170.5, 192.8, 2.4, 1.6, 0, Infinity, 'bales');
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
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.55), new THREE.MeshStandardMaterial({ map: tex }));
      m.position.set(x, ay + 0.55, z);
      m.rotation.y = rot;
      this.group.add(m);
      this.culled.push([m, x, z, 450]);
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

  // Tribune en gradins face à +Z (local) : marches béton, sièges baquets, escaliers, garde-corps vitré,
  // toiture en porte-à-faux sur fermes métalliques, public assis (silhouettes variées).
  buildStands(r, rot, roof = true, title = '') {
    const parts = [];
    const det = [];
    const rows = Math.max(4, Math.floor((r.d - 1.2) / 0.85));
    const rise = 0.42;
    const seatW = 0.5;
    const nSeats = Math.floor((r.w - 1) / seatW);
    for (let i = 0; i < rows; i++) {
      const z = r.d / 2 - 0.6 - i * 0.85;
      parts.push([box(r.w, rise * (i + 1), 0.85), i % 2 ? '#bdb9b0' : '#c4c0b7', { z }]);
      for (let k = 0; k < nSeats; k++) {
        if (k % 20 === 9 || k % 20 === 10) continue; // allée et escalier
        const x = -r.w / 2 + 0.5 + (k + 0.5) * seatW;
        const sy = rise * (i + 1);
        if (this.rnd() < 0.55) det.push(...seatedPerson(this.rnd, x, sy + 0.44, z + 0.02));
        else det.push([seatGeo(), '#1d1e22', { x, y: sy + 0.38, z: z - 0.05 }]);
      }
      // Marches d'escalier dans les allées.
      for (let k = 9; k < nSeats; k += 20) {
        const x = -r.w / 2 + 0.5 + (k + 1) * seatW;
        parts.push([box(0.95, rise * (i + 1) - rise / 2, 0.42), '#d2cec5', { x, z: z + 0.21 }]);
      }
    }
    // Garde-corps avant (verre feuilleté sur montants inox).
    parts.push([box(r.w, 1.0, 0.04), '#9fb2bb', { y: rise, z: r.d / 2 - 0.15 }]);
    for (let x = -r.w / 2; x <= r.w / 2 + 0.01; x += 2) det.push([box(0.05, 1.05, 0.05), '#b9bdc1', { x, y: rise, z: r.d / 2 - 0.12 }]);
    // Mur arrière.
    const backH = rise * rows + 1.2;
    parts.push([box(r.w, backH, 0.3), '#2a2b2f', { z: -r.d / 2 + 0.15 }]);
    if (roof) {
      // Poteaux arrière, fermes en porte-à-faux, couverture.
      const nb = Math.max(3, Math.round(r.w / 8));
      for (let k = 0; k <= nb; k++) {
        const x = -r.w / 2 + (r.w / nb) * k;
        parts.push([box(0.35, backH + 3.6, 0.35), '#1b1c1f', { x, z: -r.d / 2 + 0.3 }]);
        parts.push([box(0.18, 0.5, r.d + 2.4, false), '#1b1c1f', { x, y: backH + 3.3, z: 1.1, rx: 0.06 }]);
        parts.push([box(0.12, 0.12, Math.hypot(r.d * 0.6, 2.6), false), '#1b1c1f', { x, y: backH + 2.0, z: -r.d / 2 + r.d * 0.3, rx: -Math.atan2(2.6, r.d * 0.6) }]);
      }
      parts.push([box(r.w + 2, 0.18, r.d + 3), '#2b2c30', { y: backH + 3.6, z: 0.9, rx: 0.06 }]);
    }
    const geo = partsToGeo(parts);
    const y = this.groundAt(r.x, r.z, r.w / 2, r.d / 2, rot);
    this.batch.add(geo, null, r.x, y, r.z, rot);
    this.detailBatch.add(partsToGeo(det), null, r.x, y, r.z, rot);
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
    // Stalles de départ : HIPPO.bays couloirs de 2 m depuis la corde extérieure ; le couloir intérieur reste libre pour
    // le cavalier à l'entraînement (npcs.js), et chaque partant prend le milieu d'une stalle (courses.js).
    const sx = HIPPO.x - 40;
    const sz = HIPPO.z - HIPPO.radius;
    const gy = this.h(sx, sz);
    const bw = HIPPO.width / 8;
    const parts = [];
    for (let k = 0; k <= HIPPO.bays; k++) parts.push([box(3.2, 2.6, 0.2), '#2f6e4a', { z: -HIPPO.width / 2 + bw * k }]);
    parts.push([box(0.4, 0.4, HIPPO.bays * bw + 0.6), '#f2f1ec', { y: 2.6, z: -HIPPO.width / 2 + (HIPPO.bays * bw) / 2 }]);
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
    // Lucarnes et avant-corps générés par buildingGeo (pas de lucarnes rapportées en plus).
    this.place(buildingGeo({ w: ht.w, d: ht.d, h: 14, wall: '#f1ebdf', roof: '#3f444b', roofType: 'hip', roofH: 7, timber: true, fill: 4, wood: 1, floors: 4, trim: '#f6f3ec' }), ht.x, ht.z, Math.PI, ht.w, ht.d, 'hotel');
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
    // Fontaine en pierre calcaire patinée (texture dédiée : marbrures, piqûres, coulures, lichen, joints des blocs de
    // la margelle) : margelle moulurée, vasques superposées (la vasque médiane est creuse et retient l'eau), eau sombre
    // et reflétante ; dépôt verdâtre sous le niveau de l'eau, pied salis par les éclaboussures.
    const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const stoneGeo = mergeGeometries([lathe([[4.3, 0], [5.35, 0], [5.45, 0.08], [5.45, 0.55], [5.25, 0.62], [5.25, 0.74], [4.95, 0.78], [4.85, 0.7], [4.4, 0.66], [4.3, 0.2]]), lathe([[0, 0.3], [1.05, 0.3], [0.9, 0.55], [0.55, 0.75], [0.5, 1.9], [0.62, 2.0], [0.62, 2.1], [0.3, 2.16], [1.9, 2.3], [2.05, 2.45], [2.0, 2.55], [1.89, 2.5], [1.8, 2.42], [0.4, 2.42], [0.32, 2.5], [0.32, 3.5], [0.45, 3.6], [1.05, 3.68], [1.1, 3.8], [0.9, 3.84], [0.25, 3.86], [0.16, 4.2], [0.22, 4.35], [0.08, 4.6], [0, 4.62]])], false);
    {
      const pos = stoneGeo.attributes.position;
      const colr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        let k = [1, 1, 1];
        if (r > 4.2 && r < 4.9 && y < 0.62) k = [0.6, 0.62, 0.5]; // intérieur du bassin, sous l'eau
        else if (r < 2.1 && y > 2.2 && y < 2.48) k = [0.7, 0.72, 0.62]; // vasque médiane, sous l'eau
        else if (y < 0.12) k = [0.82, 0.8, 0.76]; // pied, éclaboussures et poussière
        colr.set(k, i * 3);
      }
      stoneGeo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    }
    const stoneTex = limestoneTexture();
    const stone = new THREE.Mesh(stoneGeo, new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 2.2, vertexColors: true, roughness: 0.9 }));
    stone.position.set(P.x, py, P.z);
    stone.castShadow = stone.receiveShadow = true;
    this.group.add(stone);
    this.culled.push([stone, P.x, P.z, 620]);
    // Plans d'eau du bassin et de la vasque : un seul maillage (même matériau).
    const fw = new THREE.Mesh(mergeGeometries([
      new THREE.CircleGeometry(4.45, 48).rotateX(-Math.PI / 2).translate(0, 0.6, 0),
      new THREE.CircleGeometry(1.88, 32).rotateX(-Math.PI / 2).translate(0, 2.5, 0),
    ], false), new THREE.MeshStandardMaterial({ color: '#1e2c30', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.92 }));
    fw.position.set(P.x, py, P.z);
    this.group.add(fw);
    this.culled.push([fw, P.x, P.z, 620]);
    // Filets d'eau qui retombent de la vasque haute (fusionnés : un seul appel de dessin).
    const jets = new THREE.MeshStandardMaterial({ color: '#dfeef2', roughness: 0.1, transparent: true, opacity: 0.38, depthWrite: false });
    const jg = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      jg.push(new THREE.CylinderGeometry(0.035, 0.075, 1.25, 8, 1, true).translate(Math.cos(a) * 1.0, 3.05, Math.sin(a) * 1.0));
    }
    const jm = new THREE.Mesh(mergeGeometries(jg, false), jets);
    jm.position.set(P.x, py, P.z);
    this.group.add(jm);
    this.culled.push([jm, P.x, P.z, 150]);
    this.colliders.addCircle(P.x, P.z, 5.4, py + 0.7, 'fountain');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      // Place de la ville : alignement d'arbres d'ombrage au houppier dense (les bouleaux, clairsemés, restent en lisière).
      this.tree('beech', P.x + Math.cos(a) * 18, P.z + Math.sin(a) * 18, 0.75);
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
  // Signalisation : entrées/sorties de Deauvelle (agglomération) et limitations à 80 km/h hors agglomération.
  buildRoadSigns() {
    const signs = [
      // [x, z, orientation de la face, type, texte]
      // À droite de la chaussée dans le sens de circulation (on roule à droite).
      [-216, -346.2, -Math.PI / 2, 'entry', 'DEAUVELLE'], [-216, -357.8, Math.PI / 2, 'exit', 'DEAUVELLE'],
      [156, -357.8, Math.PI / 2, 'entry', 'DEAUVELLE'], [156, -346.2, -Math.PI / 2, 'exit', 'DEAUVELLE'],
      [-24.2, -154, 0, 'entry', 'DEAUVELLE'], [-35.8, -154, Math.PI, 'exit', 'DEAUVELLE'],
      [-260, -357.8, Math.PI / 2, 'speed', '80'], [200, -346.2, -Math.PI / 2, 'speed', '80'], [-35.8, -110, Math.PI, 'speed', '80'],
    ];
    // Faces regroupées dans un seul maillage (atlas : entrée | sortie | 80).
    const atlas = document.createElement('canvas');
    atlas.width = 1280;
    atlas.height = 256;
    const actx = atlas.getContext('2d');
    actx.drawImage(roadSignTexture('entry', 'DEAUVELLE').image, 0, 0);
    actx.drawImage(roadSignTexture('exit', 'DEAUVELLE').image, 512, 0);
    actx.drawImage(roadSignTexture('speed', '80').image, 1024, 0);
    const region = { entry: [0, 0.4], exit: [0.4, 0.8], speed: [0.8, 1] };
    const faces = [];
    for (const [x, z, rot, kind] of signs) {
      const y = this.h(x, z);
      const round = kind === 'speed';
      const w = round ? 0.8 : 1.3, hgt = round ? 0.8 : 0.65;
      const top = round ? 2.4 : 2.3;
      // Mât derrière la tôle (il ne traverse pas la face imprimée).
      this.batch.add(cyl(0.035, 0.035, top + hgt / 2, 8), '#8d9196', x - Math.sin(rot) * 0.05, y, z - Math.cos(rot) * 0.05, rot);
      this.batch.add(box(w + 0.04, hgt + 0.04, 0.03, false), '#8d9196', x, y + top, z, rot);
      const g = round ? new THREE.CircleGeometry(0.4, 32) : new THREE.PlaneGeometry(w, hgt);
      const [u0, u1] = region[kind];
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
      g.rotateY(rot);
      g.translate(x + Math.sin(rot) * 0.02, y + top, z + Math.cos(rot) * 0.02);
      faces.push(g);
      this.colliders.addCircle(x, z, 0.15, Infinity, 'sign');
    }
    const tex = new THREE.CanvasTexture(atlas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.group.add(new THREE.Mesh(mergeGeometries(faces, false), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })));
  }

  // Lettres de dressage autour d'une carrière (A et C aux petits côtés, K E H / F B M aux grands côtés).
  arenaLetters(r) {
    const L = ['A', 'K', 'E', 'H', 'C', 'M', 'B', 'F'];
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 128;
    const ctx = cv.getContext('2d');
    L.forEach((ch, i) => {
      ctx.fillStyle = '#f4f3ee';
      ctx.fillRect(i * 128, 0, 128, 128);
      ctx.fillStyle = '#16171a';
      ctx.font = 'bold 96px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, i * 128 + 64, 70);
    });
    const hx = r.w / 2 + 0.9, hz = r.d / 2 + 0.9, k = r.w / 2 - 6;
    // Position et orientation (face vers le centre de la carrière).
    const spots = [[-hx, 0, Math.PI / 2], [-k, hz, Math.PI], [0, hz, Math.PI], [k, hz, Math.PI], [hx, 0, -Math.PI / 2], [k, -hz, 0], [0, -hz, 0], [-k, -hz, 0]];
    const faces = [];
    spots.forEach(([dx, dz, rot], i) => {
      const x = r.x + dx, z = r.z + dz, y = this.h(x, z);
      // Piquet derrière le panneau (il ne masque pas la lettre).
      this.batch.add(box(0.08, 0.95, 0.08), '#f2f1ec', x - Math.sin(rot) * 0.06, y, z - Math.cos(rot) * 0.06, rot);
      this.batch.add(box(0.62, 0.62, 0.04, false), '#f2f1ec', x, y + 0.75, z, rot);
      const g = new THREE.PlaneGeometry(0.56, 0.56);
      const uv = g.attributes.uv;
      for (let k2 = 0; k2 < uv.count; k2++) uv.setX(k2, (i + uv.getX(k2)) / 8);
      g.rotateY(rot);
      g.translate(x + Math.sin(rot) * 0.025, y + 0.75, z + Math.cos(rot) * 0.025);
      faces.push(g);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.group.add(new THREE.Mesh(mergeGeometries(faces, false), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })));
  }

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
        this.walkways.push([cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y + 0.14]);
      }
      // Jardinières aux angles.
      const flowers = ['#d8443a', '#e9c94a', '#f2f1ec', '#b55aa0'];
      for (const [px, pz] of [[ax + 3.5, az + 1.3], [bx - 3.5, bz - 1.3]]) {
        if (this.rnd() < 0.7) {
          const pl = planterGeo(flowers[Math.floor(this.rnd() * 4)]);
          this.batch.add(pl.body, null, px, this.h(px, pz) + 0.14, pz, 0);
          this.batch.addDetail(pl.detail, null, px, this.h(px, pz) + 0.14, pz, 0, 1);
        }
      }
    }
    const W = this.walkways;
    this.walkBox = [Math.min(...W.map((s) => s[0])), Math.max(...W.map((s) => s[1])), Math.min(...W.map((s) => s[2])), Math.max(...W.map((s) => s[3]))];
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
            this.batch.addDetail(box(along ? 2.4 : 0.55, 0.03, along ? 0.55 : 2.4, false), '#f2f1ec', bx2, y + 0.095, bz2, 0, 1);
          }
        }
      }
    }
    // Voitures garées.
    const spots = [
      [-80, -296.2, Math.PI / 2], [-64, -296.2, Math.PI / 2], [20, -235.8, -Math.PI / 2], [36, -235.8, -Math.PI / 2],
      [-126.2, -210, 0], [-126.2, -190, 0], [66.2, -260, Math.PI], [66.2, -276, Math.PI], [100, -169.8, Math.PI / 2],
      [-170, -228.2, -Math.PI / 2], [-100, -169.8, Math.PI / 2], [120, -296.2, -Math.PI / 2],
    ];
    // Voitures conduisibles, créées par le jeu (vehicle.js) avec leur collision.
    spots.forEach(([x, z, r], i) => {
      const kind = CAR_MODELS[i % CAR_MODELS.length];
      this.parkedVehicles.push({ kind, color: CAR_COLORS[kind][(i * 3 + 1) % CAR_COLORS[kind].length], x, z, heading: r });
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
    statue.mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: '#2a1d0c', emissiveIntensity: 0.3 });
    this.group.add(statue.mesh);
  }

  buildBeach() {
    const P = TOWN.planches;
    // Promenade des Planches : platelage continu qui épouse le terrain (lames posées en travers dans le shader).
    {
      const pos = [], idx = [];
      const hw = 2, top = 0.3;
      // Dessus et chants ont chacun leurs sommets : normales nettes (dessus lissé le long du terrain, chants verticaux).
      let xe = P.x0;
      for (let x = P.x0, k = 0; x <= P.x1 + 0.01; x += 2, k++) {
        const y = this.h(x, P.z) + top;
        pos.push(x, y, P.z - hw, x, y, P.z + hw, x, y, P.z - hw, x, y - 0.4, P.z - hw, x, y, P.z + hw, x, y - 0.4, P.z + hw);
        if (k) {
          const a = (k - 1) * 6, b = k * 6;
          idx.push(a, a + 1, b + 1, a, b + 1, b);
          idx.push(a + 3, a + 2, b + 2, a + 3, b + 2, b + 3);
          idx.push(a + 4, a + 5, b + 5, a + 4, b + 5, b + 4);
        }
        xe = x;
      }
      // Abouts fermés aux deux extrémités.
      for (const [x, s] of [[P.x0, -1], [xe, 1]]) {
        const y = this.h(x, P.z) + top, n = pos.length / 3;
        pos.push(x, y, P.z - hw, x, y - 0.4, P.z - hw, x, y - 0.4, P.z + hw, x, y, P.z + hw);
        idx.push(...(s < 0 ? [n, n + 1, n + 2, n, n + 2, n + 3] : [n, n + 2, n + 1, n, n + 3, n + 2]));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      this.batch.addMatrix(g, '#a58d6f', new THREE.Matrix4(), 0, null, (P.x0 + P.x1) / 2, P.z);
    }
    // Cabines de bain des Planches : rangées continues de six cabines blanches sous un portique à colonnettes,
    // portes peintes surmontées d'une plaque nominative, corniche et frise.
    const doors = ['#2f5f8a', '#f2f1ec', '#5d7480', '#2f6e4a', '#2f5f8a', '#c8a96e'];
    const W = 2.5, N = 6;
    for (let blk = 0; blk < 12; blk++) {
      const x0 = -168 + blk * (N * W + 11);
      const xc = x0 + (N * W) / 2;
      if (xc > 140) break;
      const z = -366;
      const y = Math.min(this.h(x0, z), this.h(x0 + N * W, z));
      const parts = [
        [box(N * W, 2.7, 2.4), '#f4f3ef'],
        [box(N * W + 0.3, 0.22, 2.7), '#e9e6de', { y: 2.7 }],
        [box(N * W + 0.1, 0.12, 1.7), '#f4f3ef', { y: 2.52, z: -2.0 }],
        [box(N * W + 0.12, 0.16, 0.12), '#2f5f8a', { y: 2.4, z: -2.82 }],
        [box(N * W + 0.4, 0.12, 4.3), '#d9d4c9', { y: -0.1, z: -0.85 }],
      ];
      for (let k = 0; k <= N; k++) parts.push([cyl(0.06, 0.07, 2.42, 8), '#f4f3ef', { x: -N * W / 2 + k * W, z: -2.78 }]);
      for (let k = 0; k < N; k++) {
        const cx = -N * W / 2 + (k + 0.5) * W;
        parts.push([box(1.05, 1.95, 0.08), doors[(blk * N + k) % doors.length], { x: cx, z: -1.22 }]);
        parts.push([box(0.62, 0.16, 0.04), '#1d1e21', { x: cx, y: 2.1, z: -1.24 }]);
        parts.push([box(1.25, 0.08, 0.12), '#e9e6de', { x: cx, y: 1.95, z: -1.24 }]);
        if (k) parts.push([box(0.08, 2.7, 0.1), '#e9e6de', { x: -N * W / 2 + k * W, z: -1.22 }]);
        // Arrière (côté route) : grille d'aération haute de chaque cabine.
        parts.push([box(0.6, 0.28, 0.05), '#5d7480', { x: cx, y: 2.08, z: 1.23 }]);
        for (let l = 0; l < 4; l++) parts.push([box(0.6, 0.025, 0.04), '#f4f3ef', { x: cx, y: 2.1 + l * 0.065, z: 1.26 }]);
      }
      // Bardage planches et couvre-joints peint en blanc à l'arrière et sur les pignons, poteaux d'angle entre
      // cabines, soubassement peint (éclaboussures, sable).
      for (let x = -N * W / 2 + 0.25; x < N * W / 2; x += 0.5) parts.push([box(0.05, 2.42, 0.03), '#ecebe6', { x, y: 0.28, z: 1.215 }]);
      for (let k = 0; k <= N; k++) parts.push([box(0.14, 2.7, 0.06), '#e9e6de', { x: -N * W / 2 + k * W, z: 1.23 }]);
      parts.push([box(N * W + 0.06, 0.28, 0.05), '#8f9a9e', { z: 1.225 }]);
      for (const sx of [-1, 1]) {
        for (let zz = -0.95; zz < 1.2; zz += 0.5) parts.push([box(0.03, 2.42, 0.05), '#ecebe6', { x: sx * (N * W / 2 + 0.015), y: 0.28, z: zz }]);
        parts.push([box(0.05, 0.28, 2.42), '#8f9a9e', { x: sx * (N * W / 2 + 0.02) }]);
      }
      this.batch.add(partsToGeo(parts), null, xc, y, z, 0);
      // Collision : cabines et portique à colonnettes (z local -2,86 à +1,2).
      this.colliders.addBox(xc, z - 0.83, (N * W) / 2 + 0.15, 2.03, 0, Infinity, 'cabin');
    }
    // Parasols de Deauvelle.
    const cols = [['#b8322a', '#f2f1ec'], ['#2f5f8a', '#f2f1ec'], ['#e3b23c', '#f2f1ec'], ['#2f6e4a', '#f2f1ec'], ['#d46a2e', '#f2f1ec']];
    // Haut de plage, au pied des Planches : sable sec même aux plus hautes mers (au moins 0,3 m au-dessus).
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 18; i++) {
        const x = -150 + i * 15 + row * 5;
        const z = -378.5 - row * 2.6; // entre les Planches (z ≈ -376) et la berme (z ≈ -388)
        if (this.h(x, z) < TIDE_EXTREMES.high + 0.3) continue;
        const c = cols[(i + row) % cols.length];
        this.batch.add(parasolGeo(c[0], c[1]), null, x, this.h(x, z), z, 0);
        this.colliders.addCircle(x, z, 0.2, Infinity, 'parasol');
      }
    }
    // Poste de secours.
    const lx = 200, lz = -381;
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
    // Bocage : talus plantés (aubépine, noisetier, ronces) ponctués de chênes, de frênes et d'arbres têtards.
    const hrnd = mulberry32(808);
    for (const hd of hedges) {
      const [ax, az] = hd.a;
      const [bx, bz] = hd.b;
      // Trouée là où un chemin de terre traverse la haie : haie et obstacles s'arrêtent de part et d'autre du chemin.
      for (const [x0, z0, x1, z1] of hedgeRuns(hd.a, hd.b)) {
        this.veg.addHedge(x0, z0, x1, z1);
        const m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 12));
        for (let i = 0; i < m; i++) {
          const sx0 = x0 + ((x1 - x0) * i) / m, sz0 = z0 + ((z1 - z0) * i) / m;
          const sx1 = x0 + ((x1 - x0) * (i + 1)) / m, sz1 = z0 + ((z1 - z0) * (i + 1)) / m;
          const y = Math.min(this.h(sx0, sz0), this.h(sx1, sz1), this.h((sx0 + sx1) / 2, (sz0 + sz1) / 2)) - 0.1;
          this.colliders.addSegment(sx0, sz0, sx1, sz1, 1.5, y + 1.25, 'hedge');
        }
      }
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 12));
      const ang = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < n; i++) {
        const x0 = ax + ((bx - ax) * i) / n, z0 = az + ((bz - az) * i) / n;
        const x1 = ax + ((bx - ax) * (i + 1)) / n, z1 = az + ((bz - az) * (i + 1)) / n;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const seg = Math.hypot(x1 - x0, z1 - z0);
        // Tirages de l'ancien modèle de haie conservés : la suite aléatoire du monde ne change pas.
        for (let k = Math.max(1, Math.floor((seg + 0.3) / 3)) * 3; k > 0; k--) this.rnd();
        if (this.rnd() < 0.2) {
          const r = hrnd();
          const kind = this.rnd() < 0.7 ? (r < 0.4 ? 'pollard' : 'oak') : r < 0.6 ? 'ash' : 'pollard';
          const tx = mx + Math.cos(ang) * 0.4, tz = mz - Math.sin(ang) * 0.4, ts = 0.9 + this.rnd() * 0.5;
          // Pas d'arbre sur un chemin (ses trois tirages sont consommés : la suite aléatoire ne change pas).
          if (nearPath(tx, tz, 3)) for (let k = 0; k < 3; k++) this.rnd();
          else this.tree(kind, tx, tz, ts);
        }
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
        // Champ moissonné : chaume et balles rondes (les autres restent sur pied).
        f.harvested = true;
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
    const urnd = mulberry32(4711);
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
        // Forêts normandes : hêtraie-chênaie avec frênes et bouleaux ; pins maritimes près de la côte.
        const r = this.rnd();
        const coast = px < -200 && pz < -150;
        const kind = coast ? (r < 0.55 ? 'pine' : r < 0.8 ? 'oak' : 'birch') : r < 0.06 ? 'pine' : r < 0.42 ? 'beech' : r < 0.72 ? 'oak' : r < 0.84 ? 'ash' : 'birch';
        this.tree(kind, px, pz, 0.85 + this.rnd() * 0.5);
        // Sous-bois (noisetiers, aubépines) et jeunes arbres, sans collision, tirés à part.
        for (let k = 0; k < 2; k++) {
          const r2 = urnd();
          if (r2 > 0.55) continue;
          const a = urnd() * Math.PI * 2, rr = 3 + urnd() * 2.5;
          const ux = px + Math.cos(a) * rr, uz = pz + Math.sin(a) * rr;
          if (polyDist(ux, uz, XC_PATH).d < 6 || nearestRoad(ux, uz).d < 4) continue;
          const young = r2 < 0.16;
          const kind2 = young ? (kind === 'pine' ? 'pine' : r2 < 0.08 ? 'beech' : 'birch') : 'bush';
          this.veg.addTree(kind2, ux, this.h(ux, uz) - 0.1, uz, urnd() * 6.3, young ? 0.28 + urnd() * 0.2 : 0.6 + urnd() * 0.6, 0.8 + urnd() * 0.4, urnd());
        }
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

  // Nature du sol (pour les sons de sabots) : 'grass' | 'soil' | 'sand' | 'gravel'.
  groundClass(x, z) {
    const S = this.groundSplat;
    if (!S) return 'grass';
    const n = S.size;
    const i = Math.min(n - 1, Math.max(0, Math.floor(((x + 600) / 1200) * n)));
    const j = Math.min(n - 1, Math.max(0, Math.floor(((z + 600) / 1200) * n)));
    const o = ((n - 1 - j) * n + i) * 4;
    const d = S.data;
    let best = 0;
    for (let k = 1; k < 4; k++) if (d[o + k] > d[o + best]) best = k;
    return ['grass', 'soil', 'sand', 'gravel'][best];
  }

  // focus : position du joueur (lampadaire le plus proche) ; la caméra à défaut (écran titre).
  update(dt, camera, sky, focus = camera.position) {
    this.veg.update(dt);
    const night = sky.nightFactor;
    if (this.detailChunks) {
      const cx = camera.position.x, cz = camera.position.z;
      for (const m of this.detailChunks) {
        const c = m.userData.center;
        m.visible = (c.x - cx) * (c.x - cx) + (c.z - cz) * (c.z - cz) < 240 * 240;
      }
    }
    // Pièces derrière les vitres : pénombre le jour, éclairage intérieur la nuit.
    INTERIOR_UNIFORMS.inDay.value = (1 - night) * Math.min(1, 0.3 + sky.sun.intensity / 6);
    INTERIOR_UNIFORMS.inNight.value = night;
    this.lightMat.emissiveIntensity = 0.2 + night * 1.6;
    if (this.lampPools) {
      this.lampPools.visible = night > 0.05;
      this.poolMat.opacity = night;
      // Lanterne la plus proche du joueur : éclaire chevaux et cavaliers la nuit (voir addCloudShadows).
      const lp = CLOUD_UNIFORMS.lpPos.value;
      lp.w = 0;
      if (night > 0.05) {
        let best = 400, bi = -1;
        for (let i = 0; i < this._lampPools.length; i++) {
          const p = this._lampPools[i];
          const d = (p[0] - focus.x) * (p[0] - focus.x) + (p[2] - focus.z) * (p[2] - focus.z);
          if (d < best) { best = d; bi = i; }
        }
        if (bi >= 0) {
          const p = this._lampPools[bi];
          lp.set(p[0], p[1] + 3.6, p[2], night * 6);
        }
      }
    }
    if (this.beam) {
      this.beam.rotation.y += dt * 0.8;
      this.beam.material.opacity = night * 0.18;
      this.beam.visible = night > 0.05;
    }
    // Masquer les tuiles lointaines.
    const cx = camera.position.x, cz = camera.position.z;
    for (const [o, x, z, d] of this.culled) o.visible = (x - cx) * (x - cx) + (z - cz) * (z - cz) < d * d;
    for (const m of this.chunks) {
      const s = m.geometry.boundingSphere;
      const d = Math.hypot(s.center.x - cx, s.center.z - cz) - s.radius;
      m.visible = d < 620;
      // Petits détails de façade et de mobilier (fin de l'intervalle d'indices) : seulement pour les tuiles proches.
      if (m.userData.far !== undefined) m.geometry.drawRange.count = d < 250 ? Infinity : m.userData.far;
    }
  }
}

// Spectateur assis (≈ 50 triangles) : peau, cheveux, haut et pantalon variés, posture légèrement variable.
const SKIN = ['#e6c2a2', '#d9a982', '#c18e68', '#8d5a3b', '#f0d1b8', '#a8724f'];
const HAIR = ['#2b1d14', '#4a3222', '#8a6a46', '#c9a46a', '#1b1b1b', '#9a9a96'];
const TOPS = ['#1f2b45', '#f2f1ec', '#3a5a8c', '#a33b32', '#2e2f33', '#d9c9a6', '#5d7a4a', '#7b2b3a', '#e3d36a', '#4b6f73'];
const PANTS = ['#2a3446', '#3a3b3f', '#c9c0ad', '#1f2023', '#46536b'];
let _seat = null;
// Siège baquet vide (assise + dossier d'un seul tenant, 8 triangles) : recto et verso ont chacun leurs sommets,
// sinon leurs normales opposées s'annulent.
// Calcaire de la fontaine : marbrures, piqûres, coulures sombres, taches de lichen, joint vertical en bord de motif
// (8 blocs sur le tour de la margelle).
function limestoneTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(911);
  ctx.fillStyle = '#c3bba7';
  ctx.fillRect(0, 0, S, S);
  const blob = (x, y, r, c) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (const dx of [-S, 0, S]) ctx.fillRect(x - r + dx, y - r, r * 2, r * 2);
  };
  for (let i = 0; i < 700; i++) blob(rnd() * S, rnd() * S, 8 + rnd() * 60, rnd() < 0.55 ? 'rgba(92,84,66,0.05)' : 'rgba(250,245,228,0.07)');
  // Coulures : traînées verticales sombres qui pâlissent vers le bas.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S * 0.6, h = 40 + rnd() * 220, w = 2 + rnd() * 9;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(70,66,56,${0.08 + rnd() * 0.14})`);
    g.addColorStop(1, 'rgba(70,66,56,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  // Piqûres et grains du calcaire.
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rnd() < 0.7 ? `rgba(70,62,50,${0.15 + rnd() * 0.3})` : 'rgba(255,252,240,0.35)';
    const r = rnd() < 0.9 ? 1 : 2;
    ctx.fillRect(rnd() * S, rnd() * S, r, r);
  }
  // Lichen : petites colonies gris-vert et jaunâtres.
  for (let i = 0; i < 45; i++) {
    const cx = rnd() * S, cy = rnd() * S;
    const c = rnd() < 0.6 ? 'rgba(140,146,112,0.32)' : 'rgba(180,172,120,0.28)';
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx + (rnd() - 0.5) * 14, cy + (rnd() - 0.5) * 14, 1.5 + rnd() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Joint entre deux blocs (au bord du motif, répété 8 fois sur le tour).
  ctx.fillStyle = 'rgba(78,72,60,0.75)';
  ctx.fillRect(0, 0, 2, S);
  ctx.fillRect(S - 2, 0, 2, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  tex.anisotropy = 8;
  return tex;
}

function seatGeo() {
  if (_seat) return _seat;
  const v = [-0.21, 0, 0.2, 0.21, 0, 0.2, 0.21, 0, -0.14, -0.21, 0, -0.14, -0.21, 0.42, -0.2, 0.21, 0.42, -0.2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...v, ...v], 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 6, 8, 7, 6, 9, 8, 9, 11, 8, 9, 10, 11]);
  g.computeVertexNormals();
  _seat = g;
  return g;
}

// Retire des faces toujours cachées (groupes de la géométrie d'origine : faces d'une boîte, fonds d'un cylindre).
function dropGroups(g, drop) {
  const idx = g.index.array, keep = [];
  g.groups.forEach((gr, i) => {
    if (!drop.includes(i)) for (let k = gr.start; k < gr.start + gr.count; k++) keep.push(idx[k]);
  });
  g.setIndex(keep);
  g.clearGroups();
  return prep(g);
}
// Formes du public, partagées : buste sans fond (posé sur les cuisses), cuisses sans dessous ni arrière,
// tibias sans arrière, tête dont les faces du haut et de l'arrière portent les cheveux.
let _crowd = null;
function crowdShapes() {
  if (_crowd) return _crowd;
  const head = prep(new THREE.IcosahedronGeometry(0.1, 0));
  const p = head.attributes.position.array;
  const hair = [];
  for (let f = 0; f < p.length; f += 9) {
    const cy = (p[f + 1] + p[f + 4] + p[f + 7]) / 3, cz = (p[f + 2] + p[f + 5] + p[f + 8]) / 3;
    hair.push(cy > 0.03 || (cz < -0.04 && cy > -0.03));
  }
  _crowd = {
    torso: dropGroups(new THREE.CylinderGeometry(0.16, 0.13, 0.52, 5, 1), [2]),
    thigh: dropGroups(new THREE.BoxGeometry(0.32, 0.13, 0.42), [3, 5]),
    shin: dropGroups(new THREE.BoxGeometry(0.3, 0.42, 0.12), [5]),
    head,
    hair,
  };
  return _crowd;
}

function seatedPerson(rnd, x, y, z) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const skin = pick(SKIN), top = pick(TOPS), pants = pick(PANTS), hair = pick(HAIR);
  const lean = (rnd() - 0.5) * 0.12;
  const sh = 0.92 + rnd() * 0.16;
  // Silhouette vue de loin (~50 triangles) : buste, tête et cheveux, jambes.
  const S = crowdShapes();
  const head = S.head.clone();
  paint(head, skin);
  const c = head.attributes.color.array;
  const hc = new THREE.Color(hair);
  S.hair.forEach((h, f) => {
    if (h) for (let k = f * 9; k < f * 9 + 9; k += 3) hc.toArray(c, k);
  });
  return [
    [S.torso, top, { x, y: y + 0.3 * sh, z: z - 0.04, rx: -0.06 + lean, sx: sh, sy: sh, sz: 0.72 * sh }],
    [head, null, { x, y: y + 0.68 * sh, z: z - 0.03, sx: sh, sy: 1.15 * sh, sz: sh }],
    [S.thigh, pants, { x, y: y + 0.05, z: z + 0.18 }],
    [S.shin, pants, { x, y: y - 0.17, z: z + 0.36 }],
  ];
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

function hqGeo(w, d, h) {
  const parts = [[box(w, h + 2, d), '#15161a', { y: -2 }]];
  const floors = 4;
  for (let f = 1; f <= floors; f++) {
    parts.push([box(w + 0.3, 0.35, d + 0.3), '#f4f3ef', { y: (h / floors) * f - 0.35 }]);
  }
  parts.push([box(w * 0.3, h * 0.55, 0.3), '#f4f3ef', { x: -w * 0.33, y: 0, z: d / 2 + 0.1 }]);
  parts.push([box(4, 3, 0.4), '#2a3a4a', { y: 0, z: d / 2 + 0.05 }]);
  return { body: partsToGeo(parts), glass: partsToGeo([[winBox(w - 1, h - 1.5, d + 0.12), '#24313d', { y: 0.6 }]]) };
}
