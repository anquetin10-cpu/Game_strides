// Prototype « rendu réaliste » des personnages (réglage « Personnages : Classique / Réaliste ») : le personnage du
// joueur est remplacé à l'écran par un modèle réaliste (corps MakeHuman CC0, peau photographique, yeux, cils,
// cheveux, vêtements texturés, squelette de 53 os avec doigts), chargé à part (public/real/, voir
// scripts/real/build-humans.mjs). Le personnage classique reste dans la scène et continue d'être animé (marche,
// course, monte à cheval, conduite, port d'objets, rênes) : il est seulement masqué, et chaque image son
// squelette est recopié sur celui du modèle réaliste (reciblage des rotations). Revenir à « Classique » rétablit
// l'affichage d'origine sans rien recharger.
import * as THREE from 'three';
import { addCloudShadows } from '../world/sky.js';
import { RealHorse } from './realHorse.js';
import { RealCar, CAR_MODELS } from './realCar.js';
import { t } from '../core/i18n.js';
import { inlineData } from '../core/gltfInline.js';

// Os du personnage classique → os du modèle réaliste (squelette « game_engine »).
const SIDES = [['l', '_l'], ['r', '_r']];
const MAP = [['hips', 'pelvis'], ['spine', 'spine_01'], ['chest', 'spine_03'], ['neck', 'neck_01'], ['head', 'head']];
for (const [o, t] of SIDES) {
  MAP.push([`${o}Clav`, `clavicle${t}`], [`${o}Arm`, `upperarm${t}`], [`${o}Fore`, `lowerarm${t}`], [`${o}Hand`, `hand${t}`]);
  MAP.push([`${o}Thigh`, `thigh${t}`], [`${o}Shin`, `calf${t}`], [`${o}Foot`, `foot${t}`], [`${o}Toe`, `ball${t}`]);
}
// Chaînes alignées sur la pose de repos du personnage classique (bras le long du corps, jambes droites) :
// [os réaliste, os réaliste enfant (direction), os classique, os classique enfant].
const ALIGN = [];
for (const [o, t] of SIDES) {
  ALIGN.push([`clavicle${t}`, `upperarm${t}`, `${o}Clav`, `${o}Arm`], [`upperarm${t}`, `lowerarm${t}`, `${o}Arm`, `${o}Fore`]);
  ALIGN.push([`lowerarm${t}`, `hand${t}`, `${o}Fore`, `${o}Hand`], [`hand${t}`, `middle_01${t}`, `${o}Hand`, `${o}Fing`]);
  ALIGN.push([`thigh${t}`, `calf${t}`, `${o}Thigh`, `${o}Shin`], [`calf${t}`, `foot${t}`, `${o}Shin`, `${o}Foot`], [`foot${t}`, `ball${t}`, `${o}Foot`, `${o}Toe`]);
}

const cache = {};
const ready = {}; // modèles déjà chargés : clonage immédiat (changement de tenue sans image de transition)
let cloneFn = null;
let loaderP = null;
async function loader() {
  if (!loaderP) {
    loaderP = Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js'), import('three/addons/utils/SkeletonUtils.js')]).then(([g, m, s]) => {
      const l = new g.GLTFLoader();
      l.setMeshoptDecoder(m.MeshoptDecoder);
      inlineData(l); // fichier unique : tampons et images base64 décodés sans requête (refusée sur iPhone)
      cloneFn = s.clone;
      return { l, clone: s.clone };
    });
  }
  return loaderP;
}
// Fichier unique (page claude.ai, qui ne sert pas les .glb) : copie glTF JSON (scripts/real/to-json.mjs).
const EXT = import.meta.env?.MODE === 'single' ? 'gltf.json' : 'glb';
// État du chargement de chaque modèle (affiché dans les réglages du téléphone : chargé, en cours, indisponible et pourquoi).
export const realStatus = {};
// Téléphones et tablettes (mémoire limitée : sur iPhone, Safari arrête la page qui la dépasse) : textures de certains
// modèles réduites au chargement, avant leur envoi à la carte graphique (côté en pixels : couleur, autres cartes).
// Cheval Tripo : 2048 → 1024 (couleur), 1024 → 512 (normales, rugosité) ; environ 24 Mo de moins sur la carte
// graphique et autant d'images décodées libérées.
const TOUCH = typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in globalThis);
const SHRINK = { horse_tripo: { map: 1024, other: 512 } };
function shrinkTextures(gltf, { map, other }) {
  const done = new Set();
  gltf.scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const [k, tex] of Object.entries(m)) {
        if (!tex?.isTexture || done.has(tex.source)) continue;
        done.add(tex.source);
        const img = tex.image, max = k === 'map' ? map : other;
        if (!img?.width || Math.max(img.width, img.height) <= max) continue;
        const s = max / Math.max(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        const cx = c.getContext('2d');
        if (!cx) continue;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, 0, 0, c.width, c.height);
        img.close?.(); // image décodée d'origine libérée (ImageBitmap)
        tex.image = c;
        tex.needsUpdate = true;
      }
    }
  });
}
// Modèle réaliste (chargé une fois, cloné pour chaque personnage ou cheval).
export async function loadReal(id) {
  if (!cache[id]) {
    const t0 = performance.now();
    realStatus[id] = { state: 'loading', t0 };
    cache[id] = loader()
      .then(({ l }) => l.loadAsync(new URL(`real/${id}.${EXT}`, document.baseURI).href))
      .then(
        (gltf) => {
          if (TOUCH && SHRINK[id]) shrinkTextures(gltf, SHRINK[id]);
          realStatus[id] = { state: 'ok', ms: performance.now() - t0 };
          return gltf;
        },
        (e) => {
          realStatus[id] = { state: 'failed', ms: performance.now() - t0, error: String(e?.message || e?.type || e).slice(0, 160) };
          throw e;
        },
      );
  }
  const gltf = await cache[id];
  if (gltf.userData.released) return loadReal(id); // libéré entre-temps (voir releaseReal) : rechargé
  ready[id] = gltf;
  const { clone } = await loader();
  return clone(gltf.scene);
}
// Clone immédiat d'un modèle déjà chargé (sinon null).
export function realNow(id) {
  const g = ready[id];
  return g && cloneFn ? cloneFn(g.scene) : null;
}
// Modèle qui n'est plus affiché nulle part (cheval Tripo quand Comète est resellée) : géométries, matériaux et
// textures rendus (carte graphique et images décodées) ; rechargé s'il revient.
export function releaseReal(id) {
  const gltf = ready[id];
  if (!gltf) return;
  gltf.userData.released = true;
  delete ready[id];
  delete cache[id];
  delete realStatus[id];
  const seen = new Set();
  gltf.scene.traverse((o) => {
    o.geometry?.dispose();
    o.skeleton?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const tex of Object.values(m)) {
        if (!tex?.isTexture || seen.has(tex)) continue;
        seen.add(tex);
        tex.dispose();
        tex.image?.close?.();
      }
      m.dispose();
    }
  });
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Couleur d'un matériau teinté (texture normalisée en gris × teinte × gain, comme à l'export).
function tint(mat, hex) {
  const t = mat.userData?.tint;
  if (!t) return;
  mat.color.set(hex || t.default).multiplyScalar(Number(t.gain) || 1);
}

// Gants : part des mains de chaque sommet de la peau (somme des poids sur les os des mains et des doigts), calculée
// une fois par géométrie (partagée par les clones). Faux si la peau n'est pas skinnée.
const GLOVE_BONE = /^(hand|thumb|index|middle|ring|pinky)_/;
function gloveAttr(mesh) {
  const g = mesh.geometry;
  if (g.attributes.aGlove) return true;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton?.bones;
  if (!si || !sw || !bones) return false;
  const hand = bones.map((b) => GLOVE_BONE.test(b.name));
  const a = new Float32Array(si.count);
  for (let i = 0; i < si.count; i++) {
    a[i] = (hand[si.getX(i)] ? sw.getX(i) : 0) + (hand[si.getY(i)] ? sw.getY(i) : 0) + (hand[si.getZ(i)] ? sw.getZ(i) : 0) + (hand[si.getW(i)] ? sw.getW(i) : 0);
  }
  g.setAttribute('aGlove', new THREE.BufferAttribute(a, 1));
  return true;
}
function gloveShader(sh, U) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aGlove;\nvarying float vGlove;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlove = aGlove;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uGlove;\nuniform float uGloveOn;\nvarying float vGlove;')
    .replace('#include <color_fragment>', '#include <color_fragment>\nfloat gloveK = uGloveOn * smoothstep( 0.4, 0.62, vGlove );\ndiffuseColor.rgb = mix( diffuseColor.rgb, uGlove, gloveK );')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.62, gloveK );');
}
// Casquette : calotte (demi-sphère) et visière (demi-disque vers l'avant), partagées.
const CAP_GEO = {
  crown: new THREE.SphereGeometry(0.112, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
  brim: new THREE.CylinderGeometry(0.1, 0.1, 0.008, 20, 1, false, -Math.PI / 2, Math.PI),
};

// Modèle réaliste attaché à un personnage classique.
export class RealBody {
  constructor(human, root) {
    this.human = human;
    this.root = root;
    this.bones = {};
    this.mats = [];
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        // Matériaux propres à ce personnage (teintes de sa tenue), textures partagées.
        const m = (o.material = o.material.clone());
        // Comme les personnages classiques : lanterne / plafonnier proche et ombre des nuages (sinon noirs la nuit).
        m.onBeforeCompile = (sh) => addCloudShadows(sh, null, true);
        m.customProgramCacheKey = () => 'strides-real-body-lamp';
        // Peau : gants (o.gloves) teints sur les mains (sommets pondérés sur les os des mains et des doigts).
        if (m.name === 'Skin' && o.isSkinnedMesh && gloveAttr(o)) {
          const U = (this.gloveU ||= { uGlove: { value: new THREE.Color('#18181a') }, uGloveOn: { value: 0 } });
          m.onBeforeCompile = (sh) => {
            addCloudShadows(sh, null, true);
            gloveShader(sh, U);
          };
          m.customProgramCacheKey = () => 'strides-real-body-lamp-glove';
        }
        this.mats.push(m);
        if (/^Hair/.test(m.name) || /Eyelash|Eyebrow/.test(m.name)) {
          m.alphaTest = 0.45;
          m.alphaToCoverage = true;
          m.transparent = false;
          m.side = THREE.DoubleSide;
        }
        if (/^Cloth/.test(m.name)) m.side = THREE.DoubleSide;
        if (m.name === 'Skin') m.roughness = 0.58;
      }
    });
    this.outfit = human.outfit;
    this.applyOutfit(human.outfit);
    // Le modèle réaliste suit le personnage classique (position, cap, montée à cheval) à sa taille naturelle.
    human.mesh.add(root);
    root.scale.setScalar(1 / human.mesh.scale.x);
    root.updateMatrixWorld(true);
    this._calibrate();
    this.setActive(true);
  }

  // Couleurs de la tenue du jeu (peau, cheveux, haut, culotte, bottes) et casque.
  applyOutfit(o = {}) {
    this.root.traverse((m) => {
      if (!m.isMesh) return;
      const mat = m.material;
      if (mat.name === 'Skin') tint(mat, o.skin);
      else if (/^Hair/.test(mat.name)) tint(mat, o.hair);
      else if (mat.name === 'Eyebrow' && o.hair) tint(mat, `#${new THREE.Color(o.hair).multiplyScalar(0.7).getHexString()}`);
      else if (mat.name === 'Cloth_jacket') {
        // Veste de concours (tenue de concours seulement), chemise blanche dessous.
        m.visible = !!o.jacket;
        tint(mat, o.top);
      } else if (mat.name === 'Cloth_shirt') tint(mat, o.jacket ? '#f2f1ec' : o.top);
      else if (mat.name === 'Cloth_jeans') tint(mat, o.pants);
      else if (mat.name === 'Cloth_boots' || mat.name === 'Cloth_tallboots') tint(mat, o.boots);
    });
    if (this.gloveU) {
      this.gloveU.uGloveOn.value = o.gloves ? 1 : 0;
      if (o.gloves) this.gloveU.uGlove.value.set(o.gloves);
    }
    this._helmet(o.helmet);
    this._cap(o.helmet ? null : o.cap);
  }

  // Casquette (couvre-chef porté à pied) : calotte et visière, fixées à l'os de la tête comme le casque.
  _cap(color) {
    if (this.cap) {
      this.cap.parent?.remove(this.cap);
      this.cap.traverse((m) => m.isMesh && m.material.dispose());
      this.cap = null;
    }
    if (!color || !this.bones.head) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0 });
    mat.onBeforeCompile = (sh) => addCloudShadows(sh, null, true);
    mat.customProgramCacheKey = () => 'strides-real-cap';
    const crown = new THREE.Mesh(CAP_GEO.crown, mat);
    crown.scale.set(1, 0.84, 1.1);
    const brim = new THREE.Mesh(CAP_GEO.brim, mat);
    brim.position.set(0, 0.004, 0.07);
    brim.rotation.x = 0.16;
    brim.scale.set(1, 1, 0.95);
    for (const m of [crown, brim]) {
      m.castShadow = true;
      g.add(m);
    }
    const head = this.bones.head;
    head.getWorldPosition(_v);
    this.root.worldToLocal(_v);
    g.position.set(0, _v.y + 0.08, _v.z - 0.004);
    this.root.add(g);
    g.updateMatrixWorld(true);
    head.attach(g);
    this.cap = g;
  }

  // Casque d'équitation (coque, visière, harnais) fixé à l'os de la tête.
  _helmet(color) {
    if (this.helmet) {
      this.helmet.parent?.remove(this.helmet);
      this.helmet = null;
    }
    if (!color || !this.bones.head) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.118, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), mat);
    shell.scale.set(1, 0.92, 1.16);
    const peak = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 6, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.53, Math.PI * 0.06), mat);
    peak.scale.set(1, 0.6, 1.5);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.006, 6, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.8 }));
    strap.rotation.set(0, Math.PI / 2, Math.PI);
    strap.position.set(0, -0.005, 0.015);
    for (const m of [shell, peak, strap]) {
      m.castShadow = true;
      g.add(m);
    }
    // Placé en pose de référence au sommet du crâne, puis rattaché à l'os de la tête (transformation conservée).
    const head = this.bones.head;
    head.getWorldPosition(_v);
    this.root.worldToLocal(_v);
    g.position.set(0, _v.y + 0.085, _v.z - 0.005);
    this.root.add(g);
    g.updateMatrixWorld(true);
    head.attach(g);
    this.helmet = g;
  }

  // Calage : le modèle réaliste est mis dans la pose de repos du personnage classique, puis on mémorise pour
  // chaque os le décalage de rotation entre les deux squelettes.
  _calibrate() {
    const H = this.human, ours = H.bones;
    const saved = {};
    for (const [n, b] of Object.entries(ours)) {
      saved[n] = [b.quaternion.clone(), b.position.clone()];
      b.quaternion.identity();
      if (b.userData.rest) b.position.copy(b.userData.rest);
    }
    H.mesh.updateMatrixWorld(true);
    this.root.getWorldQuaternion(_rootQ).invert();
    const rel = (o, out) => o.getWorldQuaternion(out).premultiply(_rootQ);
    const pos = (o, out) => this.root.worldToLocal(o.getWorldPosition(out));
    // Alignement des membres sur les directions de repos du personnage classique.
    for (const [t, tc, o, oc] of ALIGN) {
      const tb = this.bones[t], tcb = this.bones[tc];
      if (!tb || !tcb || !ours[o] || !ours[oc]) continue;
      const dT = pos(tcb, new THREE.Vector3()).sub(pos(tb, _v2.clone()));
      const dO = pos(ours[oc], new THREE.Vector3()).sub(pos(ours[o], _v2.clone()));
      const swing = _q.setFromUnitVectors(dT.normalize(), dO.normalize());
      const world = rel(tb, _q2).premultiply(swing);
      const parentRel = rel(tb.parent, new THREE.Quaternion());
      tb.quaternion.copy(parentRel.invert().multiply(world));
      tb.updateMatrixWorld(true);
    }
    // Doigts légèrement fléchis (main au repos, prise des rênes) : flexion vers la paume, autour de l'axe avant.
    for (const [side, sign] of [['_l', -1], ['_r', 1]]) {
      for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
        const curl = f === 'thumb' ? [0.15, 0.2, 0.2] : f === 'index' ? [0.45, 0.55, 0.4] : [0.55, 0.65, 0.45];
        for (let k = 1; k <= 3; k++) {
          const b = this.bones[`${f}_0${k}${side}`];
          if (!b) continue;
          const world = rel(b, _q2).premultiply(_q.setFromAxisAngle(_v.set(0, 0, 1), sign * curl[k - 1]));
          b.quaternion.copy(rel(b.parent, new THREE.Quaternion()).invert().multiply(world));
          b.updateMatrixWorld(true);
        }
      }
    }
    this.map = [];
    for (const [o, t] of MAP) {
      const ob = ours[o], tb = this.bones[t];
      if (!ob || !tb) continue;
      const offset = rel(ob, new THREE.Quaternion()).invert().multiply(rel(tb, new THREE.Quaternion()));
      this.map.push({ ob, tb, offset });
    }
    // Bassin : déplacement du bassin classique (repos → courant) reporté à l'échelle du modèle réaliste.
    this.hipsRest = pos(ours.hips, new THREE.Vector3());
    this.pelvisRef = pos(this.bones.pelvis, new THREE.Vector3());
    this.hipScale = this.pelvisRef.y / Math.max(0.5, this.hipsRest.y);
    for (const [n, b] of Object.entries(ours)) {
      b.quaternion.copy(saved[n][0]);
      b.position.copy(saved[n][1]);
    }
    H.mesh.updateMatrixWorld(true);
  }

  setActive(on) {
    this.active = on;
    this.root.visible = on;
    // Le personnage classique est retiré de l'affichage (calque 31) mais reste animé : ses os portent le modèle
    // réaliste, les objets tenus et les points des rênes.
    this.human.mesh.layers.set(on ? 31 : 0);
  }

  // Recopie de la pose courante (après l'animation du personnage classique, avant le rendu).
  update() {
    if (!this.active) return;
    // Personnage masqué (caméra contre sa tête, séquence où il est caché) : le modèle réaliste l'est aussi.
    const vis = this.human.mesh.visible;
    if (this.root.visible !== vis) this.root.visible = vis;
    if (!vis) return;
    const H = this.human;
    H.mesh.updateMatrixWorld(true);
    this.root.getWorldQuaternion(_rootQ).invert();
    // Bassin.
    const pel = this.bones.pelvis;
    this.root.worldToLocal(H.bones.hips.getWorldPosition(_v)).sub(this.hipsRest).multiplyScalar(this.hipScale).add(this.pelvisRef);
    pel.parent.worldToLocal(this.root.localToWorld(_v));
    pel.position.copy(_v);
    // Rotations, des parents vers les enfants.
    for (const { ob, tb, offset } of this.map) {
      ob.getWorldQuaternion(_q).premultiply(_rootQ).multiply(offset);
      tb.parent.getWorldQuaternion(_q2).premultiply(_rootQ).invert();
      tb.quaternion.copy(_q2.multiply(_q));
      tb.updateMatrixWorld(true);
    }
  }

  dispose() {
    this._cap(null);
    this.root.parent?.remove(this.root);
    this.human.mesh.layers.set(0);
    for (const m of this.mats) m.dispose();
  }
}

// Gestion du réglage « Modèles 3D » (Auto, Classiques, Réalistes) : rendu réaliste du joueur, de son cheval, et des personnes et chevaux proches
// de la caméra (nombre limité, avec hystérésis pour ne pas recharger en bordure ; au-delà, modèles classiques).
const NEAR = { humans: 8, horses: 5, cars: 6, humanDist: 30, horseDist: 45, carDist: 60, margin: 10 };
// Modèles propres de chevaux (def.model d'un cheval de data.js, ou essai de développement) : fichier public/real/<id> et
// classe qui le pilote, chargée à la demande (module à part, seulement quand un tel cheval est dans le jeu).
const HORSE_MODELS = { horse_tripo: () => import('./tripoHorse.js').then((m) => m.TripoHorse) };

export class Realism {
  constructor(game) {
    this.game = game;
    this.bodies = new Map(); // personnage → RealBody
    this.horses = new Map(); // cheval → RealHorse
    this.cars = new Map(); // véhicule → RealCar
    this.carFailed = new Set();
    this.failed = false;
    this.horseFailed = false;
    this.loading = new Set();
    // Modèles propres de chevaux : id → { id, cls, loading, failed } (classe chargée une fois, échec retenu).
    this.models = {};
  }

  // Essai d'un modèle de cheval (développement seulement : game.js, `?tripohorse` → 'horse_tripo', piloté par
  // TripoHorse chargé à la demande). Pour la session, sans rien écrire dans la sauvegarde : le cheval principal et
  // celui du joueur prennent le modèle d'essai, les autres chevaux gardent leur affichage habituel ; ni le réglage des
  // personnages, ni la qualité, ni la baisse de cadence (Auto) ne le retirent. Même chargement et même règle
  // d'affichage qu'un cheval qui a son propre modèle (def.model, voir _syncHorses) : l'essai porte son état.
  startTrial(id) {
    if (!import.meta.env.DEV) return;
    this.stopTrial();
    this.trial = this._model(id);
  }

  stopTrial() {
    if (!import.meta.env.DEV || !this.trial) return;
    const cls = this.trial.cls;
    // Les chevaux qui ont eux-mêmes ce modèle (def.model) le gardent.
    for (const [h, r] of this.horses) {
      if (!cls || r.constructor !== cls || h.def?.model) continue;
      r.dispose();
      this.horses.delete(h);
    }
    this.trial = null;
  }

  // État d'un modèle propre de cheval ; la classe qui le pilote est chargée au premier appel.
  _model(id) {
    let m = this.models[id];
    if (m) return m;
    m = this.models[id] = { id, cls: null, loading: null, failed: false };
    const load = HORSE_MODELS[id];
    if (!load) this._modelFailed(m, new Error('aucune classe pour ce modèle'));
    else m.loading = load().then((cls) => (m.cls = cls), (e) => this._modelFailed(m, e));
    return m;
  }

  // Modèle propre impossible à charger (classe ou fichier) : le cheval du jeu reste affiché, avec un message (une fois).
  _modelFailed(m, e) {
    if (m.failed) return;
    console.warn('Modèle de cheval indisponible', m.id, e);
    m.failed = true;
    m.loading = null;
    this.game.hud?.toast(t('Modèle 3D du cheval indisponible : affichage classique.'));
  }

  // Modèle propre attendu pour un cheval (null : affichage habituel) : le sien (def.model), sinon, en développement,
  // celui de l'essai pour le cheval principal et celui du joueur.
  _modelOf(h) {
    const g = this.game;
    const trial = import.meta.env.DEV ? this.trial : null;
    const id = (this.ownAllowed && h.def?.model) || (trial && (h === g.mainHorse || h === g.player?.horse) ? trial.id : null);
    return id ? this._model(id) : null;
  }
  // Modèles propres des chevaux : retirés (cheval du jeu affiché) en qualité « Économie » et en mode sûr après un
  // arrêt brutal (voir Game._safeStart) ; les autres réglages ne les retirent pas.
  get ownAllowed() {
    return !this.game.safeMode && this.game.save.data.settings.quality !== 'low';
  }

  // Préchargement (écran de chargement) des modèles propres des chevaux présents : la première image les montre déjà.
  async preloadHorses(timeoutMs = 12000) {
    const ids = this.ownAllowed ? [...new Set(this.game.horses.map((h) => h.def?.model).filter(Boolean))] : [];
    if (!ids.length) return;
    const all = ids.map((id) => Promise.all([this._model(id).loading, loadReal(id)]));
    await Promise.race([Promise.all(all).catch(() => null), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  // « Réalistes » : toujours ; « Auto » : sauf qualité « Économie » ou cadence trop basse (voir autoFallback).
  get enabled() {
    if (this.game.safeMode) return false; // mode sûr après un arrêt brutal (voir Game._safeStart)
    const st = this.game.save.data.settings;
    if (st.characters === 'real') return true;
    return st.characters === 'auto' && !this.autoOff && st.quality !== 'low';
  }
  // Personnage du joueur : il garde le même modèle pendant toute la partie. La baisse de cadence (autoFallback) ne
  // le change pas — seul un réglage choisi par le joueur (« Modèles 3D », qualité « Économie ») le fait.
  get playerEnabled() {
    if (this.game.safeMode) return false;
    const st = this.game.save.data.settings;
    if (st.characters === 'real') return true;
    return st.characters === 'auto' && st.quality !== 'low';
  }

  // Mode « Auto » : l'appareil ne suit pas, modèles classiques pour le reste de la partie — pour les passants, chevaux et
  // voitures. Le joueur garde son modèle (avant : il passait d'un coup au personnage classique, autre visage, autres
  // proportions, en pleine partie).
  autoFallback() {
    if (this.game.save.data.settings.characters !== 'auto' || this.autoOff) return;
    this.autoOff = true;
    const me = this.game.player?.human;
    for (const [hu, r] of this.bodies) {
      if (hu === me) continue;
      r.dispose();
      this.bodies.delete(hu);
    }
    this._dropHorses();
    for (const r of this.cars.values()) r.dispose();
    this.cars.clear();
  }

  // Retire les modèles des chevaux, sauf ceux des chevaux qui ont leur propre modèle (def.model) : il est leur
  // apparence, aucun réglage ne le retire (pas d'image intermédiaire avec le cheval du jeu).
  _dropHorses() {
    for (const [h, r] of this.horses) {
      if (this.ownAllowed && h.def?.model && r.constructor === this.models[h.def.model]?.cls) continue;
      r.dispose();
      this.horses.delete(h);
    }
    this._releaseOwn();
  }

  // Préchargement du modèle du joueur (écran de chargement) : la première image montre déjà le bon personnage.
  async preloadPlayer(timeoutMs = 12000) {
    if (!this.playerEnabled || this.failed) return;
    const hu = this.game.player?.human;
    const id = hu?.sex === 'm' ? 'rider_m' : 'rider_f';
    await Promise.race([loadReal(id).catch(() => null), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  _clear() {
    for (const r of this.bodies.values()) r.dispose();
    this._dropHorses();
    for (const r of this.cars.values()) r.dispose();
    this.bodies.clear();
    this.cars.clear();
  }

  // Modèle réaliste du personnage du joueur (s'il est chargé).
  get body() {
    return this.bodies.get(this.game.player?.human) || null;
  }

  set(mode) {
    const st = this.game.save.data.settings;
    st.characters = mode;
    st.charactersSet = true;
    this.autoOff = false;
    if (!this.playerEnabled) this._clear();
  }

  // Qualité changée (« Économie » coupe les modèles réalistes en mode « Auto »).
  refresh() {
    if (!this.playerEnabled) this._clear();
  }

  // Chargement en tâche de fond (une fois par fichier) ; échec : modèles classiques et message.
  _load(id, kind) {
    if (this.loading.has(id)) return;
    this.loading.add(id);
    loadReal(id).then(
      () => this.loading.delete(id),
      (e) => {
        console.warn('Modèle réaliste indisponible', id, e);
        this.loading.delete(id);
        if (kind === 'model') {
          this._modelFailed(this._model(id), e);
          return;
        }
        if (kind === 'horse') this.horseFailed = true;
        else if (kind === 'car') this.carFailed.add(id);
        else this.failed = true;
        if (kind !== 'car') this.game.hud?.toast(kind === 'horse' ? t('Cheval réaliste indisponible : affichage classique.') : t('Personnage réaliste indisponible : affichage classique.'));
      },
    );
  }

  // Entités voulues : toujours `always`, puis les plus proches de la caméra (déjà réalistes : marge en plus).
  _wanted(list, always, current, max, dist) {
    const cam = this.game.camera.position;
    const out = new Set(always.filter(Boolean));
    const near = [];
    for (const e of list) {
      if (out.has(e) || !e.mesh?.parent) continue;
      const d = Math.hypot(e.mesh.position.x - cam.x, e.mesh.position.z - cam.z);
      const lim = dist + (current.has(e) ? NEAR.margin : 0);
      if (d < lim) near.push([d, e]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, e] of near.slice(0, max)) out.add(e);
    return out;
  }

  // Synchronise une famille (personnages ou chevaux) : retire, crée (une création par image au plus), met à jour.
  _sync(map, want, make) {
    for (const [e, r] of map) {
      if (want.has(e)) continue;
      r.dispose();
      map.delete(e);
    }
    let created = false;
    for (const e of want) {
      if (map.has(e)) continue;
      const r = make(e, created);
      if (r) {
        map.set(e, r);
        created = true;
      }
    }
    for (const r of map.values()) r.update();
  }

  // Appelé à chaque image avant le rendu.
  update() {
    const trial = import.meta.env.DEV ? this.trial : null;
    const g = this.game, P = g.player;
    // Chevaux qui ont leur propre modèle (def.model, cheval à l'essai) : toujours affichés avec lui, quels que soient les
    // réglages « Modèles 3D » et « Chevaux 3D », la qualité ou la baisse de cadence (Auto) ; essai : chevaux du joueur.
    const own = this.ownAllowed ? g.horses.filter((h) => h.def?.model) : [];
    if (!this.playerEnabled && !trial && !own.length && !this.horses.size) return;
    const lead = [g.mainHorse, P?.horse].filter((h) => h && g.horses.includes(h));
    if (import.meta.env.DEV && trial) for (const h of lead) if (!own.includes(h)) own.push(h);
    if (!this.enabled || !this.playerEnabled) {
      // Cadence trop basse (Auto) : seul le joueur reste réaliste (et les chevaux qui ont leur propre modèle).
      if (this.playerEnabled && !this.failed) this._syncBodies(new Set([P?.human].filter(Boolean)));
      this._syncHorses(new Set(own));
      return;
    }
    // Chevaux : modèle procédural par défaut, modèle réaliste sur demande (« Chevaux 3D »).
    const want = g.save.data.settings.horses === 'real' && !this.horseFailed ? this._wanted(g.horses, lead, this.horses, NEAR.horses, NEAR.horseDist) : new Set();
    for (const h of own) want.add(h);
    this._syncHorses(want);
    // Voitures (garées, conduisibles et de la circulation) des types qui ont un modèle réaliste.
    const cars = g.vehicles.filter((v) => v.mesh && v.spec && CAR_MODELS[v.kind] && !this.carFailed.has(CAR_MODELS[v.kind]));
    this._sync(this.cars, this._wanted(cars, [P?.vehicle].filter((v) => v && cars.includes(v)), this.cars, NEAR.cars, NEAR.carDist), (v, busy) => {
      const id = CAR_MODELS[v.kind];
      const root = !busy ? realNow(id) : null;
      if (!root) {
        if (!busy) this._load(id, 'car');
        return null;
      }
      return new RealCar(v, root);
    });
    if (!this.failed) this._syncBodies(this._wanted(g.humans, [P?.human], this.bodies, NEAR.humans, NEAR.humanDist));
  }

  // Chevaux voulus : modèle réaliste (RealHorse), ou modèle propre du cheval (def.model, essai) piloté par sa classe.
  _syncHorses(want) {
    const g = this.game;
    // Classe attendue pour un cheval : celle de son modèle propre (null tant qu'elle n'est pas chargée, ou en cas
    // d'échec : cheval du jeu affiché), sinon RealHorse.
    const clsOf = (h) => {
      const m = this._modelOf(h);
      return m ? (m.failed ? null : m.cls) : RealHorse;
    };
    // Modèle à changer quand un cheval prend (ou perd) un modèle propre.
    for (const [h, r] of this.horses) {
      if (r.constructor === clsOf(h)) continue;
      r.dispose();
      this.horses.delete(h);
    }
    for (const h of [...want]) if (!clsOf(h)) want.delete(h);
    this._sync(this.horses, want, (h, busy) => {
      const m = this._modelOf(h);
      const id = m ? m.id : 'horse';
      const root = !busy || h === g.mainHorse ? realNow(id) : null;
      if (!root) {
        this._load(id, m ? 'model' : 'horse');
        return null;
      }
      return m ? new m.cls(h, root) : new RealHorse(h, root);
    });
    this._releaseOwn();
  }

  // Modèle propre qu'aucun cheval n'affiche ni n'attend plus : rendu à la mémoire (voir releaseReal).
  _releaseOwn() {
    for (const m of Object.values(this.models)) {
      if (!m.cls) continue;
      const used = [...this.horses.values()].some((r) => r.constructor === m.cls) || this.game.horses.some((h) => this._modelOf(h) === m);
      if (!used) releaseReal(m.id);
    }
  }

  _syncBodies(want) {
    const P = this.game.player;
    {
      this._sync(this.bodies, want, (hu, busy) => {
        const id = hu.sex === 'm' ? 'rider_m' : 'rider_f';
        // Le joueur change de personnage à chaque tenue : modèle reconstruit sans attendre.
        const root = !busy || hu === P?.human ? realNow(id) : null;
        if (!root) {
          this._load(id, 'human');
          return null;
        }
        return new RealBody(hu, root);
      });
      for (const [hu, r] of this.bodies) {
        if (r.outfit === hu.outfit) continue;
        r.outfit = hu.outfit;
        r.applyOutfit(hu.outfit);
      }
    }
  }
}
