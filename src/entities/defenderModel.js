// Defender 110 STRIDES : véhicule personnel du personnage, modèle fourni (src/assets/vehicles/), chargé tel quel par le
// GLTFLoader de three.js : géométrie, UV, normales, matériaux PBR (vernis), vitres transparentes et textures intégrées
// conservés ; seules les pièces mobiles sont pilotées (roues et pivots de braquage, volant, quatre portes, coffre).
// Deux variantes du même modèle, mêmes pivots et repères ; une seule est chargée et affichée :
//   - Defender110_STRIDES.glb (123 498 triangles, 3,78 Mo) : version détaillée ;
//   - Defender110_STRIDES_MOBILE.glb (67 926 triangles, 2,28 Mo) : géométrie réduite.
// La version jouable en un seul fichier (artefact, iPhone) n'embarque que la variante mobile (limite de taille) ; en
// développement, ?defender=full | mobile force le choix (par défaut : mobile sur écran tactile, détaillée sinon).
// Le modèle est livré +Y en haut, avant vers -Z, droite vers +X ; le jeu a l'avant vers +Z : demi-rotation autour de Y.
import * as THREE from 'three';
import { addCloudShadows } from '../world/sky.js';
import { gradientTexture } from './truck.js';
import mobileUrl from '../assets/vehicles/Defender110_STRIDES_MOBILE.glb?url';

export const DEFENDER_FILES = {
  full: 'src/assets/vehicles/Defender110_STRIDES.glb',
  mobile: 'src/assets/vehicles/Defender110_STRIDES_MOBILE.glb',
};
// Type stable du véhicule (sauvegarde, missions).
export const DEFENDER_ID = 'defender110_hero';

// Cotes dans le repère du jeu (x à gauche, y en haut, z vers l'avant ; x_jeu = -x_glb, z_jeu = -z_glb), relevées sur
// le fichier (manifest.json) : 5,02 m roue de secours comprise, 2,0 m de caisse (2,105 m rétroviseurs), 1,97 m.
export const DEFENDER_DIM = {
  L: 5.02,
  W: 2.0, // enveloppe de collision : caisse (les rétroviseurs dépassent)
  H: 1.97,
  zc: -0.12, // centre de l'encombrement (avant à +2,40, arrière à -2,63)
  zFront: 1.534,
  zRear: -1.488,
  track: 1.706,
  wheelR: 0.407,
  // Repères du fichier (anchor_*) ; assise du personnage : repère conducteur moins la hauteur du bassin assis.
  seat: { x: 0.465, y: 0.81 - 0.42, z: 0.23 }, // yeux vers anchor_cockpit (1,48 m)
  passenger: { x: -0.465, z: 0.23 },
  exitDriver: { x: 1.35, z: 0.42 },
  exitPassenger: { x: -1.35, z: 0.42 },
  boot: { x: 0, z: -1.83 },
  // Accès : charnières et côté (gauche x > 0) des portes, coffre (charnière à droite, ouverture latérale).
  doors: { FL: { x: 0.946, z: 1.105 }, RL: { x: 0.946, z: -0.068 }, FR: { x: -0.946, z: 1.105 }, RR: { x: -0.946, z: -0.068 } },
};

const NODES = ['steer_FL', 'steer_FR', 'steer_RL', 'steer_RR', 'wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'steering_wheel', 'door_FL', 'door_FR', 'door_RL', 'door_RR', 'tailgate', 'spare_wheel', 'interior', 'anchor_driver', 'anchor_exit_driver', 'anchor_passenger', 'anchor_exit_passenger', 'anchor_cockpit', 'anchor_boot'];
export const ACCESSES = ['door_FL', 'door_FR', 'door_RL', 'door_RR', 'tailgate'];

// Variante demandée (développement) ou par défaut.
export function defenderVariant() {
  let v = null;
  try {
    v = new URLSearchParams(location.search).get('defender');
  } catch {
    /* pas d'adresse */
  }
  if (import.meta.env.MODE === 'single') return 'mobile'; // version en un seul fichier : seule la variante mobile est embarquée
  if (v === 'full' || v === 'mobile') return v;
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return touch ? 'mobile' : 'full';
}

let gltfP = null;
// Chargement unique pendant l'écran de chargement ; rejeté (erreur explicite) si le fichier manque ou est incomplet.
export function loadDefender(variant = defenderVariant()) {
  if (!gltfP) {
    const t0 = performance.now();
    const urlP = variant === 'full' && import.meta.env.MODE !== 'single'
      ? import('../assets/vehicles/Defender110_STRIDES.glb?url').then((m) => m.default)
      : Promise.resolve(mobileUrl);
    gltfP = Promise.all([import('three/addons/loaders/GLTFLoader.js'), urlP])
      .then(([{ GLTFLoader }, url]) => new GLTFLoader().loadAsync(url))
      .then((gltf) => {
        const missing = NODES.filter((n) => !gltf.scene.getObjectByName(n)).concat(ACCESSES.flatMap((a) => [`Open_${a}`, `Close_${a}`]).filter((c) => !gltf.animations.some((x) => x.name === c)));
        if (missing.length) throw new Error(`Modèle Defender 110 inattendu (${DEFENDER_FILES[variant]}) : absents ${missing.join(', ')}`);
        gltf.userData.variant = variant;
        gltf.userData.loadMs = Math.round(performance.now() - t0);
        return gltf;
      });
  }
  return gltfP;
}

// Orientation finale d'un accès dans son clip d'ouverture (dernière clé de la piste de rotation).
function finalQuat(gltf, node) {
  const c = gltf.animations.find((a) => a.name === `Open_${node}`);
  const tr = c?.tracks.find((k) => k.name === `${node}.quaternion`);
  if (!tr) return null;
  const v = tr.values, n = v.length;
  return new THREE.Quaternion(v[n - 4], v[n - 3], v[n - 2], v[n - 1]);
}

export function buildDefenderModel(gltf) {
  const model = gltf.scene;
  model.name = 'STRIDES_Defender110';
  // Optiques (repère du fichier) : centres des feux de jour avant et des feux arrière à LED, de chaque côté.
  model.updateMatrixWorld(true);
  const optics = { DRL: [], Rear_LED: [] };
  const _b = new THREE.Box3(), _c = new THREE.Vector3();
  model.traverse((o) => {
    const l = o.isMesh && optics[o.material.name];
    if (!l) return;
    _b.setFromObject(o).getCenter(_c);
    for (const s of [-1, 1]) {
      if (Math.sign(_c.x) !== s) continue;
      const e = l.find((k) => k.s === s) || (l.push({ s, sum: new THREE.Vector3(), n: 0 }), l[l.length - 1]);
      e.sum.add(_c);
      e.n++;
    }
  });
  const spots = (k) => optics[k].map((e) => e.sum.divideScalar(e.n));
  const mats = new Map();
  const interiors = [];
  let tris = 0, meshes = 0;
  model.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    mats.set(o.material.name, o.material);
  });
  model.rotation.y = Math.PI;
  const interiorNode = model.getObjectByName('interior');
  const details = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    let inside = false;
    for (let p = o.parent; p; p = p.parent) if (p === interiorNode) inside = true;
    if (inside) interiors.push(o);
    // Petits éléments (badges, poignées, feux, visserie…) : masqués de loin (voir setDetail).
    else {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (o.geometry.boundingSphere.radius < 0.2) details.push(o);
    }
    // Ombres portées : carrosserie et pneus seulement (petits détails et intérieur : non).
    o.castShadow = !inside && /^(Body_Paint|Roof_Black|Black_plastic|Tyre)$/.test(o.material.name);
    o.receiveShadow = !/Glass/i.test(o.material.name);
  });
  // Ombres des nuages du jeu, comme sur le décor (shader PBR du matériau conservé).
  for (const m of mats.values()) {
    m.onBeforeCompile = (sh) => addCloudShadows(sh);
    m.customProgramCacheKey = () => `def-${m.transparent ? 'b' : m.alphaTest > 0 ? 'm' : 'o'}${m.map ? 't' : ''}`;
  }

  const root = new THREE.Group(); // suit le sol
  root.rotation.order = 'YXZ';
  const body = new THREE.Group(); // masse suspendue
  root.add(body);
  body.add(model);
  // Roues non suspendues : leurs pivots (steer_*) sortent du modèle vers un repère identique sous root.
  const wheelFrame = new THREE.Group();
  wheelFrame.rotation.y = Math.PI;
  root.add(wheelFrame);
  const node = (n) => model.getObjectByName(n);
  const wheels = { front: [], rears: [] };
  // steer_FL : x_glb < 0, soit le côté gauche du jeu (side > 0).
  for (const [k, side, front] of [['FL', 1, true], ['FR', -1, true], ['RL', 1, false], ['RR', -1, false]]) {
    const steer = node(`steer_${k}`);
    const spin = steer.getObjectByName(`wheel_${k}`);
    wheelFrame.add(steer);
    (front ? wheels.front : wheels.rears).push({ steer, spin, side });
  }
  const steeringWheel = node('steering_wheel');
  const wheelQ0 = steeringWheel.quaternion.clone();
  steeringWheel.userData.q0 = wheelQ0;
  const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

  // Accès (portes, coffre) : rotations du clip d'ouverture, interpolées par le jeu (pas d'AnimationMixer).
  const access = {};
  for (const a of ACCESSES) {
    const n = node(a);
    const clip = gltf.animations.find((c) => c.name === `Open_${a}`);
    access[a] = { node: n, closed: n.quaternion.clone(), open: finalQuat(gltf, a) || n.quaternion.clone(), dur: clip?.duration || 1 };
  }
  const setAccess = (a, k) => access[a].node.quaternion.slerpQuaternions(access[a].closed, access[a].open, k);

  // Peinture : seul Body_Paint (toit noir, caoutchouc, vitres, habitacle inchangés).
  const paint = [mats.get('Body_Paint')].filter(Boolean);
  const paintBase = paint[0]?.color.clone();
  // Feux : DRL (avant) et Rear_LED (arrière) sont des matériaux lumineux ; le jeu pilote leur émission.
  // De nuit : halos des phares et des feux arrière (stop, recul) et flaque de lumière des phares sur la chaussée,
  // comme le camion (pas de vraies sources de lumière : budget mobile).
  const drl = mats.get('DRL'), rear = mats.get('Rear_LED');
  const radial = gradientTexture(true);
  const add = { map: radial, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };
  const haloMat = new THREE.SpriteMaterial({ ...add, color: '#fff3dc', opacity: 0 });
  const tailMat = new THREE.SpriteMaterial({ ...add, color: '#ff2a12', opacity: 0 });
  const revMat = new THREE.SpriteMaterial({ ...add, color: '#ffffff', opacity: 0 });
  const poolMat = new THREE.MeshBasicMaterial({ ...add, color: '#ffe9c4', opacity: 0 });
  const glow = new THREE.Group();
  glow.name = 'defender_light_glow';
  for (const p of spots('DRL')) {
    const h = new THREE.Sprite(haloMat);
    h.position.copy(p).add(new THREE.Vector3(0, 0, -0.06));
    h.scale.setScalar(0.8);
    glow.add(h);
  }
  for (const p of spots('Rear_LED')) {
    const h = new THREE.Sprite(tailMat);
    h.position.copy(p).add(new THREE.Vector3(0, 0, 0.05));
    h.scale.setScalar(0.5);
    const r = new THREE.Sprite(revMat);
    r.position.copy(h.position).add(new THREE.Vector3(0, -0.12, 0));
    r.scale.setScalar(0.35);
    glow.add(h, r);
  }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 24), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.06, -2.4 - 11);
  glow.add(pool);
  glow.visible = false;
  model.add(glow);
  const lights = {
    // head : phares (nuit) ; brake : freinage ; reverse : marche arrière ; night : 0 jour … 1 nuit.
    set(head, brake, reverse, night = 0) {
      if (drl) drl.emissiveIntensity = head ? 2.4 : 1.0;
      if (rear) rear.emissiveIntensity = brake ? 3.2 : head ? 1.0 : 0.35;
      const k = head ? Math.min(1, Math.max(0, (night - 0.25) / 0.35)) : 0;
      haloMat.opacity = 0.9 * k;
      poolMat.opacity = 0.8 * k;
      tailMat.opacity = brake ? 0.85 * Math.max(k, 0.35) : 0.4 * k;
      revMat.opacity = reverse ? 0.75 * Math.max(k, 0.3) : 0;
      glow.visible = k > 0.01 || brake || reverse;
    },
  };

  return {
    root, body, model, wheels, steeringWheel, access, lights, interiors,
    variant: gltf.userData.variant, loadMs: gltf.userData.loadMs, triangles: Math.round(tris), meshes, details: details.length, materials: mats.size,
    setAccess,
    // Volant : rotation autour de son axe (Z du fichier) ; positif = vers la gauche, vu du conducteur.
    setSteeringWheel(a) {
      steeringWheel.quaternion.copy(wheelQ0).multiply(_q.setFromAxisAngle(_z, a));
    },
    setPaint(css) {
      const c = css ? new THREE.Color(css) : paintBase;
      for (const m of paint) m.color.copy(c);
    },
    // Niveau de détail : petits éléments affichés seulement à distance moyenne (appels de dessin).
    setDetail(on) {
      if (on === this._det) return;
      this._det = on;
      for (const o of details) o.visible = on;
    },
    // Intérieur (sièges, tableau de bord) : affiché seulement près de la caméra.
    showInteriors(on) {
      if (on === this._int) return;
      this._int = on;
      for (const o of interiors) o.visible = on;
    },
  };
}
