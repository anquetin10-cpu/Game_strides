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
    gates: [], partition: new THREE.Object3D(), wheels,
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
