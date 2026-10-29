// Camion STRIDES « STX Scania V2 » (modèle glTF fourni, src/assets/truck_stx.glb) : porteur 26 t à cabine Scania,
// caisse aluminium avec espace de vie, box chevaux et pont arrière. Le modèle est converti au repère du jeu (x à
// gauche, y en haut, z vers l'avant ; il est livré l'avant vers -z) et regroupé par famille de matériaux pour le
// mobile (une quinzaine d'appels de dessin au lieu de ~250). Il expose la même interface que buildTruckModel
// (truckModel.js) : pièces animées (pont, porte du groom, bat-flanc, roues), feux par groupe, matériaux.
// Les cotes de jeu (box, pont, stalles, porte) sont dans STX_DIM et remplacent TRUCK_DIM au chargement.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addCloudShadows } from '../world/sky.js';
import { LIGHT } from './truckModel.js';
import stxUrl from '../assets/truck_stx.glb?url';

// Cotes du STX dans le repère du jeu (m). Box chevaux : du pont (z = -6,23) à la cloison de l'espace de vie
// (z = 1,15) ; deux stalles face à l'avant contre le couloir de service ; porte du groom dessinée sur le flanc droit
// de l'espace de vie.
export const STX_DIM = {
  L: 13.0,
  W: 2.66,
  H: 4.05,
  floor: 0.92,
  wheelR: 0.47,
  zFront: 5.02, // essieu avant directeur
  zRear: -3.77, // essieu moteur (le dernier essieu, suiveur, ne compte pas pour le braquage)
  zTag: -5.03,
  trackF: 2.33,
  rampLen: 2.76,
  rampW: 2.2,
  hingeY: 0.845,
  hingeZ: -6.23,
  bulkZ: 1.15,
  doorZ: [2.42, 3.38],
  stalls: [
    { x: -0.6, z: -0.93 },
    { x: 0.6, z: -0.93 },
  ],
  corridor: 0.52,
  passDoor: [-0.92, -0.32],
  partitionHinge: { x: 0, z: 0.52 },
  partitionOpen: -0.45,
  seat: { x: 0.62, y: 1.62, z: 5.05 },
  camRear: { x: -3.8, y: 3.0, z: -13.0 },
  // Feux (avant : phares ; arrière : feux bas) pour les faisceaux et halos de nuit.
  headX: 0.95, headY: 1.45, headZ: 6.45,
  tailX: 1.1, tailY: 0.8, tailZ: -6.32,
  cabDoorZ: 5.0,
};

// Familles de matériaux du modèle → matériau du jeu.
const FAMILY = {
  body: 'paint', cab: 'paint', body_light: 'paint', body_dark: 'trim', panel_dark: 'trim', trim: 'trim', partition: 'trim',
  metal: 'bright', chrome: 'bright', polished: 'bright', mirror: 'bright',
  rubber: 'matte', tread: 'matte', black: 'matte', floor: 'interior', interior_wall: 'interior',
  glass: 'glass', glass_light: 'glass',
  white_light: 'light', red: 'light', orange: 'light', reflective_red: 'light', reflective_yellow: 'light',
};
const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

let gltfP = null;
// Chargement unique (pendant l'écran de chargement du jeu) ; rejeté si le fichier ou le décodeur manque.
export function loadStx() {
  if (!gltfP) {
    gltfP = Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]).then(([g, m]) => {
      const l = new g.GLTFLoader();
      l.setMeshoptDecoder(m.MeshoptDecoder);
      return l.loadAsync(stxUrl);
    });
  }
  return gltfP;
}

// Géométrie d'un maillage du modèle, dans le repère du jeu (relatif à `origin`, repère du modèle), avec la couleur
// du matériau par sommet. keep(tri centroïde) filtre des triangles.
function bake(mesh, origin, keep) {
  mesh.updateWorldMatrix(true, false);
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const m = new THREE.Matrix4().copy(mesh.matrixWorld);
  if (origin) m.premultiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
  g.applyMatrix4(m.premultiply(FLIP));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (keep) {
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const P = [], N = [];
    for (let i = 0; i < p.length; i += 9) {
      if (!keep((p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3)) continue;
      for (let k = 0; k < 9; k++) {
        P.push(p[i + k]);
        N.push(n[i + k]);
      }
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  }
  const c = mesh.material.color;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Groupe de feu d'un triangle (repère du jeu) selon le matériau d'origine et sa place sur le camion.
function lightGroup(mat, x, y, z) {
  if (mat === 'reflective_red' || mat === 'reflective_yellow') return 15; // catadioptres : jamais allumés
  if (mat === 'white_light') {
    if (z > 6) return y > 1.15 ? LIGHT.head : LIGHT.drl;
    if (y > 3) return LIGHT.clearF;
    return LIGHT.plate;
  }
  if (mat === 'red') return y > 3 ? LIGHT.clearR : LIGHT.brake;
  // Orange : répétiteurs aux extrémités du flanc (clignotants), gabarits latéraux ailleurs.
  if (z > 3.2 || z < -5.4) return x > 0 ? LIGHT.indL : LIGHT.indR;
  return LIGHT.side;
}

function material(kind) {
  // Faces du modèle orientées au plus simple (il est livré en double face) : rendu des deux côtés.
  const base = { vertexColors: true, envMapIntensity: 0.9, side: THREE.DoubleSide };
  const m = {
    paint: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.42, metalness: 0.62 }),
    trim: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.55, metalness: 0.42 }),
    bright: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.2, metalness: 0.88 }),
    matte: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.86, metalness: 0.05 }),
    // Parois et plancher du box : s'éclairent avec le plafonnier (émission pilotée par Truck._updateLights).
    interior: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.8, metalness: 0.1, emissive: new THREE.Color(1, 0.93, 0.82), emissiveIntensity: 0 }),
    glass: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.5 }),
    wheel: () => new THREE.MeshStandardMaterial({ ...base, roughness: 0.6, metalness: 0.35 }),
  }[kind]();
  m.name = `stx-${kind}`;
  m.onBeforeCompile = (sh) => addCloudShadows(sh);
  m.customProgramCacheKey = () => `stx-${kind}`;
  return m;
}

export function buildStxModel(gltf) {
  const D = STX_DIM;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const lists = { paint: [], trim: [], bright: [], matte: [], interior: [], glass: [] };
  const lights = [];
  const LIGHT_N = 16;
  const col = new THREE.Color();
  const addLights = (mesh, origin) => {
    const name = mesh.material.name;
    const g = bake(mesh, origin);
    const p = g.attributes.position.array;
    const uv = new Float32Array((p.length / 3) * 2);
    for (let i = 0; i < p.length; i += 9) {
      const grp = lightGroup(name, (p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3);
      for (let k = 0; k < 3; k++) {
        uv[(i / 3 + k) * 2] = (grp + 0.5) / LIGHT_N;
        uv[(i / 3 + k) * 2 + 1] = 0.5;
      }
    }
    // Couleur « éteinte » un peu plus sombre : l'émission la remplace quand le feu s'allume.
    const c = g.attributes.color.array;
    for (let i = 0; i < c.length; i++) c[i] *= 0.7;
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    lights.push(g);
  };
  const rampParts = [];
  const wheelParts = {};
  let rampNode = null;
  const wheelNodes = {};
  scene.traverse((o) => {
    if (/^rear_ramp$/.test(o.name)) rampNode = o;
    if (/wheel(_\d)?$/.test(o.name) && !o.isMesh) wheelNodes[o.name] = o;
  });
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material.name;
    const fam = FAMILY[mat] || 'trim';
    let p = o.parent;
    while (p && p !== scene && !wheelNodes[p.name] && p !== rampNode) p = p.parent;
    if (p && wheelNodes[p.name]) return (wheelParts[p.name] ||= []).push(o);
    if (p === rampNode) return rampParts.push(o);
    // Intérieur du box : les bat-flancs transversaux et leurs barres (chevaux en épi) laissent place aux deux stalles
    // face à l'avant du jeu ; seul le plancher est gardé.
    if (mat === 'partition') return;
    if (mat === 'floor') return lists.interior.push(bake(o, null, (x, y) => y < 0.95));
    if (fam === 'light') return addLights(o, null);
    lists[fam].push(bake(o));
  });

  const mats = { paint: material('paint'), trim: material('trim'), bright: material('bright'), matte: material('matte'), interior: material('interior'), glass: material('glass'), wheel: material('wheel') };
  const lightData = new Uint8Array(LIGHT_N * 4);
  const lightTex = new THREE.DataTexture(lightData, LIGHT_N, 1, THREE.RGBAFormat);
  lightTex.colorSpace = THREE.SRGBColorSpace;
  lightTex.magFilter = lightTex.minFilter = THREE.NearestFilter;
  lightTex.needsUpdate = true;
  const lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, emissive: new THREE.Color(1, 1, 1), emissiveMap: lightTex, emissiveIntensity: 7, side: THREE.DoubleSide });
  lightMat.onBeforeCompile = (sh) => addCloudShadows(sh);
  lightMat.customProgramCacheKey = () => 'stx-light';

  const mesh = (geo, mat, cast = true, recv = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    return m;
  };
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  let bodyMesh = null;
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const m = mesh(mergeGeometries(list, false), mats[k], k !== 'glass', true);
    body.add(m);
    if (k === 'paint') bodyMesh = m;
  }
  const glassMesh = body.children.find((m) => m.material === mats.glass);
  const lightMesh = mesh(mergeGeometries(lights, false), lightMat, false, false);
  body.add(lightMesh);

  // Pont : pivot à la charnière, géométrie dans son repère (debout fermé, épaisseur vers l'arrière).
  const ramp = new THREE.Group();
  ramp.position.set(0, D.hingeY, D.hingeZ);
  if (rampNode) {
    rampNode.updateWorldMatrix(true, false);
    const o = new THREE.Vector3().setFromMatrixPosition(rampNode.matrixWorld);
    const geos = rampParts.map((m) => bake(m, o));
    ramp.add(mesh(mergeGeometries(geos, false), mats.trim));
  }
  body.add(ramp);

  // Bat-flanc entre les deux stalles (pivot au couloir de service ; fermé : dans l'axe, vers l'arrière) : panneau
  // matelassé gris anthracite et tube aluminium.
  const partition = new THREE.Group();
  partition.position.set(D.partitionHinge.x, 0, D.partitionHinge.z);
  {
    const PL = 2.5, y0 = D.floor + 0.42, y1 = D.floor + 1.82;
    const parts = [];
    const add = (geo, color, x, y, z) => {
      const g = geo.toNonIndexed();
      g.deleteAttribute('uv');
      g.translate(x, y, z);
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      col.set(color).convertSRGBToLinear();
      for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      parts.push(g);
    };
    add(new THREE.BoxGeometry(0.06, y1 - y0, PL), '#3b4046', 0, (y0 + y1) / 2, -PL / 2 - 0.03);
    add(new THREE.CylinderGeometry(0.028, 0.028, PL, 8).rotateX(Math.PI / 2), '#c9ced3', 0, y1 + 0.03, -PL / 2 - 0.02);
    add(new THREE.CylinderGeometry(0.035, 0.035, y1 - y0 + 0.3, 8), '#9aa0a6', 0, (y0 + y1) / 2, 0);
    // Barres de poitrail des deux stalles (au couloir), de part et d'autre du bat-flanc.
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.026, 0.026, 1.0, 8).rotateZ(Math.PI / 2), '#c9ced3', s * 0.62, D.floor + 1.15, 0.02);
    partition.add(mesh(mergeGeometries(parts, false), mats.trim));
  }
  body.add(partition);

  // Porte du groom (flanc droit, à l'espace de vie) : panneau aluminium qui s'ouvre vers l'avant, et l'embrasure
  // sombre derrière lui (le modèle n'a qu'un flanc plein, la porte y est seulement dessinée).
  const XO = 1.335;
  const [z0, z1] = D.doorZ;
  const door = new THREE.Group();
  door.position.set(-XO - 0.035, 0, z1);
  {
    const panel = new THREE.BoxGeometry(0.04, 2.0, z1 - z0 - 0.02).translate(0, 0.98 + 1.0, -(z1 - z0) / 2);
    const g = panel.toNonIndexed();
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    col.set('#9ea4ab').convertSRGBToLinear();
    for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    door.add(mesh(g, mats.paint));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 - 0.3, 0.42).rotateY(-Math.PI / 2).translate(-0.022, 2.45, -(z1 - z0) / 2), new THREE.MeshStandardMaterial({ color: '#1c2a33', roughness: 0.1, metalness: 0.3 }));
    door.add(win);
  }
  body.add(door);
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 2.0).rotateY(-Math.PI / 2).translate(-XO - 0.008, 1.98, (z0 + z1) / 2), new THREE.MeshBasicMaterial({ color: '#0b0d0f', side: THREE.DoubleSide }));
  opening.visible = false; // seulement porte ouverte (voir Truck._applyParts)
  body.add(opening);

  // Roues (non suspendues : enfants de root) : avant directrices, quatre roues arrière qui tournent.
  const wheels = { front: [], rear: null, rears: [] };
  const wheelMesh = (name) => {
    const node = wheelNodes[name];
    if (!node) return null;
    node.updateWorldMatrix(true, false);
    const o = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    const m = mesh(mergeGeometries(wheelParts[name].map((p) => bake(p, o)), false), mats.wheel, true, false);
    return { m, pos: o.applyMatrix4(FLIP) };
  };
  for (const [name, side] of [['front_left_wheel', 1], ['front_right_wheel', -1]]) {
    const w = wheelMesh(name);
    if (!w) continue;
    const steer = new THREE.Group();
    steer.position.copy(w.pos);
    steer.add(w.m);
    root.add(steer);
    wheels.front.push({ steer, spin: w.m, side });
  }
  for (const name of ['rear_left_wheel_1', 'rear_right_wheel_1', 'rear_left_wheel_2', 'rear_right_wheel_2']) {
    const w = wheelMesh(name);
    if (!w) continue;
    w.m.position.copy(w.pos);
    root.add(w.m);
    wheels.rears.push(w.m);
  }
  wheels.rear = wheels.rears[0];

  return { root, body, bodyMesh, glassMesh, lightMesh, ramp, gates: [], partition, door, wheels, materials: { body: mats.interior, glass: mats.glass, light: lightMat }, lightTex, lightData, doorOpening: opening, stx: true };
}
