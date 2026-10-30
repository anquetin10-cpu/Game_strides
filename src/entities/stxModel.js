// Camion STRIDES : modèle détaillé « STX Scania » fourni (src/assets/vehicles/STX_Scania_DETAILLE.glb, 4 350 624 octets,
// SHA-256 5556…a5e5), chargé tel quel par le GLTFLoader de three.js : géométrie, UV, normales, matériaux et textures
// intégrées du fichier sont conservés ; seules ses pièces mobiles sont pilotées (roues, rampe, porte d'habitation).
// Le modèle est livré +Y en haut, avant vers -Z ; le jeu a l'avant vers +Z : il est accroché au camion avec une demi-
// rotation autour de Y, sans changement d'échelle ni recentrage (son origine est déjà au centre, au sol).
// Les cotes de jeu (plancher, rampe, couloir, stalles en épi, porte) sont relevées sur ce fichier : STX_DIM.
import * as THREE from 'three';
import { addCloudShadows } from '../world/sky.js';
import stxUrl from '../assets/vehicles/STX_Scania_DETAILLE.glb?url';

export const STX_FILE = 'src/assets/vehicles/STX_Scania_DETAILLE.glb';

// Cotes dans le repère du jeu (x à gauche, y en haut, z vers l'avant ; x_jeu = -x_glb, z_jeu = -z_glb), en mètres.
// Box chevaux : du pont (z = -6,03) à la cloison de l'habitation (z = 0,91), cinq stalles en épi d'environ 1 m entre
// cloisons presque transversales, têtes vers le couloir du groom qui longe le flanc droit (x ≈ -0,63 à -1,20) et
// débouche sur la porte d'habitation (z = -0,22 à 0,51). Le jeu en utilise les deux stalles avant.
// Cap des chevaux en stalle : tête vers le couloir (droite), en biais vers l'arrière : nez-queue 2,7 m pour 2,34 m de
// largeur intérieure, le cheval se place à ~30° de la perpendiculaire (comme dans un vrai camion en épi).
const HB = -2.1;
export const STX_DIM = {
  layout: 'herringbone',
  L: 12.33,
  W: 2.68,
  H: 4.1,
  floor: 1.105,
  wheelR: 0.535,
  zFront: 4.88, // essieu avant directeur
  zRear: -1.995, // milieu du tandem arrière (essieux à -1,28 et -2,71)
  trackF: 2.27,
  rampLen: 2.6,
  rampW: 2.18,
  hingeY: 1.105,
  hingeZ: -6.03,
  bulkZ: 0.91,
  doorZ: [-0.22, 0.51],
  corridorX: -0.92,
  stalls: [
    { x: 0.18, z: -0.63, h: HB, ring: { x: -0.7, z: -1.2 } },
    { x: 0.18, z: -1.63, h: HB, ring: { x: -0.7, z: -2.2 } },
  ],
  // Anciennes cotes du porteur à stalles face à la route (couloir transversal) : non utilisées en épi, gardées pour
  // les fonctions communes qui les lisent.
  corridor: 0.35,
  passDoor: [-0.92, -0.32],
  partitionHinge: { x: 0, z: 0.35 },
  partitionOpen: 0,
  seat: { x: 0.55, y: 1.45, z: 4.7 },
  camRear: { x: -3.8, y: 3.0, z: -12.8 },
  headX: 0.98, headY: 0.85, headZ: 6.18,
  tailX: 1.1, tailY: 0.84, tailZ: -6.14,
  cabDoorZ: 4.6,
};

// Pivots et amplitudes fournis (manifest_pivots.json) : rampe en X (+1,98 rad ouverte, réglée au sol par le jeu),
// porte d'habitation en Y (+1,35 rad).
const DOOR_OPEN = 1.35;
const NODES = ['wheel_1_L', 'wheel_1_R', 'wheel_2_L', 'wheel_2_R', 'wheel_3_L', 'wheel_3_R', 'rear_ramp', 'living_door', 'roof_shell'];

let gltfP = null;
// Chargement unique pendant l'écran de chargement ; rejeté (erreur explicite) si le fichier manque ou n'est pas le
// modèle détaillé attendu.
export function loadStx() {
  if (!gltfP) {
    gltfP = import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(stxUrl))
      .then((gltf) => {
        const missing = NODES.filter((n) => !gltf.scene.getObjectByName(n));
        if (!gltf.scene.getObjectByName('interior_living__Oak') || missing.length) throw new Error(`Modèle STX inattendu (${STX_FILE}) : nœuds absents ${missing.join(', ') || 'interior_living__Oak'}`);
        return gltf;
      });
  }
  return gltfP;
}

// Bas-flancs (cloisons en épi entre les stalles) : dans le fichier, ils sont fondus dans les maillages du box
// (interior_horses__Black_padding, __Brushed_steel, __Chrome). On les retrouve par composantes connexes (panneau,
// rembourrage, main courante : de la paroi gauche, x_glb ≈ -1,08, au couloir, x_glb ≈ 0,63, sur moins de 0,5 m de
// profondeur), regroupés par cloison ; leurs triangles passent dans des maillages propres (mêmes attributs, mêmes
// matériaux), accrochés à une charnière côté paroi. La géométrie du fichier n'est ni modifiée ni redessinée.
const PARTITION_MESHES = ['interior_horses__Black_padding', 'interior_horses__Brushed_steel', 'interior_horses__Chrome'];
function extractPartitions(model) {
  const clusters = [];
  for (const name of PARTITION_MESHES) {
    const mesh = model.getObjectByName(name);
    if (!mesh?.geometry?.index) continue;
    const geo = mesh.geometry;
    const pos = geo.attributes.position.array;
    const idx = geo.index.array;
    const n = pos.length / 3;
    // Composantes connexes (sommets soudés au millimètre).
    const key = new Map(), id = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(pos[i * 3] * 1000)},${Math.round(pos[i * 3 + 1] * 1000)},${Math.round(pos[i * 3 + 2] * 1000)}`;
      if (!key.has(k)) key.set(k, key.size);
      id[i] = key.get(k);
    }
    const par = new Int32Array(key.size).map((_, i) => i);
    const find = (x) => {
      while (par[x] !== x) x = par[x] = par[par[x]];
      return x;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const a = find(id[idx[t]]);
      par[find(id[idx[t + 1]])] = a;
      par[find(id[idx[t + 2]])] = a;
    }
    const box = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(id[i]);
      let b = box.get(r);
      if (!b) box.set(r, (b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, hz: 0, hn: 0 }));
      const x = pos[i * 3], z = pos[i * 3 + 2];
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.z0 = Math.min(b.z0, z);
      b.z1 = Math.max(b.z1, z);
    }
    for (const b of box.values()) b.part = b.x1 - b.x0 > 0.9 && b.x0 > -1.2 && b.x1 < 0.75 && b.z1 - b.z0 < 0.5;
    // Charnière : profondeur moyenne des sommets côté paroi.
    for (let i = 0; i < n; i++) {
      const b = box.get(find(id[i]));
      if (b.part && pos[i * 3] < b.x0 + 0.05) {
        b.hz += pos[i * 3 + 2];
        b.hn++;
      }
    }
    const keep = [];
    const moved = new Map(); // cluster → indices
    for (let t = 0; t < idx.length; t += 3) {
      const b = box.get(find(id[idx[t]]));
      if (!b.part) {
        keep.push(idx[t], idx[t + 1], idx[t + 2]);
        continue;
      }
      const zc = (b.z0 + b.z1) / 2;
      let c = clusters.find((q) => Math.abs(q.zc - zc) < 0.4);
      if (!c) clusters.push((c = { zc, x0: b.x0, hz: b.hz / Math.max(1, b.hn), parts: [] }));
      let list = moved.get(c);
      if (!list) moved.set(c, (list = []));
      list.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (!moved.size) continue;
    geo.setIndex(keep);
    for (const [c, list] of moved) {
      const g = new THREE.BufferGeometry();
      for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
      g.setIndex(list);
      const m = new THREE.Mesh(g, mesh.material);
      m.name = `${mesh.name}__partition`;
      m.castShadow = false;
      m.receiveShadow = mesh.receiveShadow;
      c.parts.push({ mesh: m, parent: mesh.parent });
    }
  }
  // Charnières et pivots (repère du modèle) ; de l'avant (z_glb petit) vers l'arrière.
  clusters.sort((a, b) => a.zc - b.zc);
  return clusters.map((c) => {
    const pivot = new THREE.Group();
    pivot.name = 'stall_partition_hinge';
    pivot.position.set(c.x0, 0, c.hz);
    c.parts[0].parent.add(pivot);
    for (const { mesh } of c.parts) {
      mesh.position.set(-c.x0, 0, -c.hz);
      pivot.add(mesh);
    }
    return { pivot, meshes: c.parts.map((p) => p.mesh), z: -c.zc };
  });
}

export function buildStxModel(gltf) {
  const model = gltf.scene;
  model.name = 'STX_Scania_DETAILLE';
  // Un seul exemplaire dans le jeu : le modèle lui appartient (aucune ressource partagée avec d'autres objets).
  model.rotation.y = Math.PI;
  const mats = new Map();
  const interiors = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const interior = o.name.startsWith('interior_');
    if (interior) interiors.push(o);
    // Ombres portées (mobile) : grandes pièces de carrosserie et pneus seulement ; les petits détails, vitres, feux
    // et intérieurs n'en portent pas (leur ombre se confond avec celle de la caisse).
    o.castShadow = /^(exterior__(Silver_paint|Silver_edge|Dark_metal|Silver_panels)|roof_shell__Silver_paint|rear_ramp__Dark_metal|living_door__Silver_panels)$|__Tyre$/.test(o.name);
    o.receiveShadow = !interior || /Rubber_floor|White_gloss/.test(o.name);
    mats.set(o.material.name, o.material);
  });
  // Bas-flancs mobiles (voir extractPartitions) : intérieurs comme le reste du box.
  const stallPartitions = extractPartitions(model);
  for (const p of stallPartitions) interiors.push(...p.meshes);
  // Ombres des nuages du jeu sur le camion, comme sur le décor (le shader PBR du matériau est conservé).
  for (const m of mats.values()) {
    m.onBeforeCompile = (sh) => addCloudShadows(sh);
    m.customProgramCacheKey = () => `stx-${m.transparent ? 'b' : m.alphaTest > 0 ? 'm' : 'o'}${m.map ? 't' : ''}`;
  }

  const root = new THREE.Group(); // suit le sol (tangage/roulis du terrain)
  root.rotation.order = 'YXZ';
  const body = new THREE.Group(); // masse suspendue : caisse, cabine, rampe, porte
  root.add(body);
  body.add(model);
  // Roues : non suspendues, sorties du modèle vers un repère identique sous root (même demi-tour) ; les roues avant
  // reçoivent un parent de braquage à leur centre (leur rotation de roulement reste sur leur X local).
  const wheelFrame = new THREE.Group();
  wheelFrame.rotation.y = Math.PI;
  root.add(wheelFrame);
  const wheels = { front: [], rear: null, rears: [], glbSpin: true };
  const node = (n) => model.getObjectByName(n);
  for (const [name, side] of [['wheel_1_L', 1], ['wheel_1_R', -1]]) {
    // wheel_1_L : x_glb < 0, soit le côté gauche du jeu (x > 0).
    const w = node(name);
    const steer = new THREE.Group();
    steer.name = `${name}_steer`;
    steer.position.copy(w.position);
    wheelFrame.add(steer);
    steer.add(w);
    w.position.set(0, 0, 0);
    wheels.front.push({ steer, spin: w, side });
  }
  for (const name of ['wheel_2_L', 'wheel_2_R', 'wheel_3_L', 'wheel_3_R']) {
    const w = node(name);
    wheelFrame.add(w);
    wheels.rears.push(w);
  }
  wheels.rear = wheels.rears[0];

  // Feux : matériaux du modèle, émission pilotée par le jeu (phares et feux de gabarit, feux arrière/stop, orange).
  const lens = mats.get('Light_lens'), red = mats.get('Red_lens'), amber = mats.get('Amber');
  const amberBase = amber ? amber.emissive.clone() : null;
  const lights = {
    set(head, tail, brake, blink) {
      if (lens) {
        lens.emissive.setRGB(1, 0.96, 0.88);
        lens.emissiveIntensity = head ? 2.2 : 0;
      }
      if (red) {
        red.emissive.setRGB(1, 0.05, 0.03);
        red.emissiveIntensity = brake ? 3 : tail ? 1.1 : 0;
      }
      if (amber) {
        if (blink) amber.emissive.setRGB(1, 0.45, 0.05);
        else amber.emissive.copy(amberBase);
        amber.emissiveIntensity = blink ? 3 : 1;
      }
    },
  };
  // Plafonnier du box et de l'habitation : émission des parois blanches brillantes (intérieurs).
  const interiorMat = mats.get('White_gloss') || new THREE.MeshStandardMaterial();
  interiorMat.emissive = new THREE.Color(1, 0.93, 0.82);
  interiorMat.emissiveIntensity = 0;

  return {
    root, body, model,
    ramp: node('rear_ramp'), door: node('living_door'), roof: node('roof_shell'),
    gates: [], partition: new THREE.Object3D(), wheels, stallPartitions,
    materials: { body: interiorMat },
    lights, stx: true, detailed: true, doorOpen: DOOR_OPEN,
    // Intérieurs (cabine, habitation, box) : affichés seulement à moins de `near` mètres de la caméra (visibles par
    // les vitres, la porte et la rampe), masqués au-delà (~25 000 triangles, ~25 appels de dessin).
    interiors,
    showInteriors(on) {
      if (on === this._int) return;
      this._int = on;
      for (const o of interiors) o.visible = on;
    },
  };
}
