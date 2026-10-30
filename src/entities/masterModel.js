// Van porte-chevaux « STX Renault Master » (deux stalles, pont latéral droit) : modèle fourni
// (src/assets/vehicles/STX_Renault_Master_STALLE5.glb, 2 664 228 octets, SHA-256 ea74…47fc), chargé tel quel par le
// GLTFLoader de three.js : géométrie, UV, normales, matériaux et textures du fichier sont conservés ; seules ses pièces
// mobiles sont pilotées (roues et pivots de braquage, pont latéral, volets hauts, porte arrière).
// Le modèle est livré +Y en haut, avant vers -Z ; le jeu a l'avant vers +Z : il est accroché avec une demi-rotation
// autour de Y, sans changement d'échelle ni recentrage (origine au sol, au milieu de l'empattement).
// Amplitudes d'ouverture : celles des animations du fichier (OpenSideLoading, OpenRearDoor), lues au chargement.
import * as THREE from 'three';
import { addCloudShadows } from '../world/sky.js';
import masterUrl from '../assets/vehicles/STX_Renault_Master_STALLE5.glb?url';

export const MASTER_FILE = 'src/assets/vehicles/STX_Renault_Master_STALLE5.glb';

// Cotes dans le repère du jeu (x à gauche, y en haut, z vers l'avant ; x_jeu = -x_glb, z_jeu = -z_glb), en mètres,
// relevées sur le fichier (boîtes englobantes et ancres anchor_*).
export const MASTER_DIM = {
  L: 7.14,
  W: 2.77,
  H: 3.06,
  zc: 0.03, // centre de l'encombrement (avant à +3,60, arrière à -3,54)
  zFront: 2.4,
  zRear: -1.92,
  wheelR: 0.365,
  floor: 0.63, // plancher du box (ancres des stalles)
  // Pont latéral droit (x < 0 dans le jeu) : charnière basse, 1,38 m de long, 1,68 m de large ; ouvert, son bout
  // touche le sol à 1,25 m du flanc.
  side: { hingeX: -1.177, hingeY: 0.58, z: -0.54, len: 1.38, w: 1.68 },
  // Ancres du fichier.
  sideLoad: { x: -1.287, z: -0.54 },
  // Stalles : chevaux tête vers l'arrière (vers les portillons et la sellerie), comme dans un vrai van à pont latéral.
  stalls: [
    { x: 0.55, z: -1.1, h: Math.PI }, // stalle gauche, au fond (anchor_horse_L)
    { x: -0.55, z: -1.1, h: Math.PI }, // stalle droite, côté pont (anchor_horse_R)
  ],
  // Bas-flanc central : charnière arrière ; ouvert, son bout avant touche le flanc droit vers z = 0.
  partition: { hingeZ: -2.455, openFrontZ: -0.02 },
  rearEntry: { x: 0, z: -3.25 },
  seat: { x: 0.54, y: 0.47, z: 1.8 }, // anchor_driver (assise à 0,95 m)
  exitDriver: { x: 1.65, z: 1.75 },
};

// Charnière du bas-flanc central (bout arrière, z_glb) et ouverture (bout avant contre le flanc droit : 25°).
const PARTITION_HINGE_Z = 2.455;
const PARTITION_OPEN = -25 * (Math.PI / 180);
const NODES = ['stall_partition', 'steer_L', 'steer_R', 'wheel_front_L', 'wheel_front_R', 'wheel_rear_L', 'wheel_rear_R', 'side_ramp', 'upper_flap_front', 'upper_flap_rear', 'rear_door', 'anchor_horse_L', 'anchor_horse_R', 'anchor_side_load', 'anchor_driver'];
const CLIPS = ['OpenSideLoading', 'OpenRearDoor'];

let gltfP = null;
// Chargement unique pendant l'écran de chargement ; rejeté (erreur explicite) si le fichier manque ou n'est pas le
// modèle attendu (nœuds et animations d'ouverture).
export function loadMaster() {
  if (!gltfP) {
    gltfP = import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(masterUrl))
      .then((gltf) => {
        const missing = NODES.filter((n) => !gltf.scene.getObjectByName(n)).concat(CLIPS.filter((c) => !gltf.animations.some((a) => a.name === c)));
        if (missing.length) throw new Error(`Modèle Master inattendu (${MASTER_FILE}) : absents ${missing.join(', ')}`);
        return gltf;
      });
  }
  return gltfP;
}

// Orientation finale d'un nœud dans une animation du fichier (dernière clé de sa piste de rotation).
function finalQuat(gltf, clip, node) {
  const c = gltf.animations.find((a) => a.name === clip);
  const tr = c?.tracks.find((k) => k.name === `${node}.quaternion`);
  if (!tr) return new THREE.Quaternion();
  const v = tr.values, n = v.length;
  return new THREE.Quaternion(v[n - 4], v[n - 3], v[n - 2], v[n - 1]);
}

export function buildMasterModel(gltf) {
  const model = gltf.scene;
  model.name = 'STX_Renault_Master_STALLE5';
  model.rotation.y = Math.PI;
  const mats = new Map();
  const interiors = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const interior = o.name.startsWith('interior_');
    if (interior) interiors.push(o);
    // Ombres portées : carrosserie, pièces mobiles peintes et pneus.
    o.castShadow = /^(exterior__(Body_Paint|Black_plastic)|side_ramp__Body_Paint|rear_door__Body_Paint|upper_flap_(front|rear)__Body_Paint)$|__Tyre$/.test(o.name);
    o.receiveShadow = !interior || /Rubber_floor|White/.test(o.name);
    mats.set(o.material.name, o.material);
  });
  // Ombres des nuages du jeu, comme sur le décor (le shader PBR du matériau est conservé).
  for (const m of mats.values()) {
    m.onBeforeCompile = (sh) => addCloudShadows(sh);
    m.customProgramCacheKey = () => `master-${m.transparent ? 'b' : m.alphaTest > 0 ? 'm' : 'o'}${m.map ? 't' : ''}`;
  }

  const root = new THREE.Group(); // suit le sol (tangage/roulis du terrain)
  root.rotation.order = 'YXZ';
  const body = new THREE.Group(); // masse suspendue : caisse, pont, volets, porte
  root.add(body);
  body.add(model);
  // Roues non suspendues : sorties vers un repère identique sous root (même demi-tour). Les roues avant gardent leurs
  // pivots de braquage du fichier (steer_L / steer_R, au centre des roues).
  const wheelFrame = new THREE.Group();
  wheelFrame.rotation.y = Math.PI;
  root.add(wheelFrame);
  const node = (n) => model.getObjectByName(n);
  const wheels = { front: [], rears: [] };
  // steer_L : x_glb < 0, soit le côté gauche du jeu.
  for (const [name, side] of [['L', 1], ['R', -1]]) {
    const steer = node(`steer_${name}`);
    const spin = steer.getObjectByName(`wheel_front_${name}`);
    wheelFrame.add(steer);
    wheels.front.push({ steer, spin, side });
  }
  for (const name of ['wheel_rear_L', 'wheel_rear_R']) {
    const w = node(name);
    wheelFrame.add(w);
    wheels.rears.push(w);
  }

  // Pièces mobiles et amplitudes des animations du fichier.
  const part = (name, clip) => ({ node: node(name), open: finalQuat(gltf, clip, name), closed: node(name).quaternion.clone() });
  const parts = {
    ramp: part('side_ramp', 'OpenSideLoading'),
    flapF: part('upper_flap_front', 'OpenSideLoading'),
    flapR: part('upper_flap_rear', 'OpenSideLoading'),
    door: part('rear_door', 'OpenRearDoor'),
  };
  const set = (p, k) => p.node.quaternion.slerpQuaternions(p.closed, p.open, k);
  // Bas-flanc central (stall_partition) : pivote sur sa charnière arrière (côté têtes, z_glb = 2,455), son bout avant
  // venant contre le flanc droit (côté pont, x_glb > 0) pour dégager l'accès à la stalle du fond. Le fichier n'a pas
  // d'animation pour lui : le pivot est posé à la charnière, sans toucher à sa géométrie.
  const partition = node('stall_partition');
  const pHinge = new THREE.Group();
  pHinge.name = 'stall_partition_hinge';
  pHinge.position.set(partition.position.x, partition.position.y, PARTITION_HINGE_Z);
  partition.parent.add(pHinge);
  pHinge.add(partition);
  partition.position.set(0, 0, -PARTITION_HINGE_Z);

  // Feux : matériaux du modèle, émission pilotée par le jeu (phares, feux arrière/stop, clignotants).
  const lens = mats.get('Light_lens'), red = mats.get('Red_lens'), amber = mats.get('Amber'), led = mats.get('LED');
  const amberBase = amber ? amber.emissive.clone() : null;
  const lights = {
    set(head, tail, brake, blink) {
      if (lens) {
        lens.emissive.setRGB(1, 0.96, 0.88);
        lens.emissiveIntensity = head ? 2.2 : 0;
      }
      if (led) {
        led.emissive.setRGB(0.9, 0.95, 1);
        led.emissiveIntensity = head ? 1.6 : 0.6;
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
  // Plafonnier du box : émission des parois blanches (allumé pendant le chargement).
  const interiorMat = mats.get('White') || new THREE.MeshStandardMaterial();
  interiorMat.emissive = new THREE.Color(1, 0.93, 0.82);
  interiorMat.emissiveIntensity = 0;

  return {
    root, body, model, wheels, parts, lights, interiorMat,
    // Ouverture (0 fermé … 1 ouvert) : pont latéral et volets ensemble, porte arrière seule.
    setSide(k) {
      set(parts.ramp, k);
      set(parts.flapF, Math.min(1, k * 1.4));
      set(parts.flapR, Math.min(1, k * 1.4));
    },
    setRear(k) {
      set(parts.door, k);
    },
    setPartition(k) {
      pHinge.rotation.y = PARTITION_OPEN * k;
    },
    // Intérieurs (cabine, box, sellerie) : affichés seulement près de la caméra.
    interiors,
    showInteriors(on) {
      if (on === this._int) return;
      this._int = on;
      for (const o of interiors) o.visible = on;
    },
    // Triangles du modèle (bilan de performance).
    triangles() {
      let n = 0;
      model.traverse((o) => {
        if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      });
      for (const w of [...wheels.front.map((f) => f.steer), ...wheels.rears]) {
        w.traverse((o) => {
          if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        });
      }
      return n;
    },
  };
}
