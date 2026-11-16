import { makeRidingHelmet } from './ridingHelmet.js';
// Prototype « rendu réaliste » des personnages (réglage « Personnages : Classique / Réaliste ») : le personnage du
// joueur est remplacé à l'écran par un modèle réaliste (corps MakeHuman CC0, peau photographique, yeux, cils,
// cheveux, vêtements texturés, squelette de 53 os avec doigts), chargé à part (public/real/, voir
// scripts/real/build-humans.mjs). Le personnage classique reste dans la scène et continue d'être animé (marche,
// course, monte à cheval, conduite, port d'objets, rênes) : il est seulement masqué, et chaque image son
// squelette est recopié sur celui du modèle réaliste (reciblage des rotations). Revenir à « Classique » rétablit
// l'affichage d'origine sans rien recharger.
import * as THREE from 'three';
import { addCloudShadows } from '../world/sky.js';
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
// Téléphones et tablettes (mémoire limitée : sur iPhone, Safari arrête la page qui la dépasse) : textures des modèles
// réalistes (cavaliers, chevaux, voitures, Tripo) réduites au chargement, avant leur envoi à la carte graphique : couleur
// 1024 px au plus, autres cartes (normales, rugosité…) 512. Cavalière : environ 61 → 40 Mo.
// Le résultat redevient une image (ImageBitmap) et le canevas de travail est vidé aussitôt : Safari limite aussi la
// mémoire totale des canevas. Couleurs avec transparence (cheveux, cils) gardées telles quelles : le canevas, qui
// prémultiplie l'alpha, assombrirait leurs bords.
const TOUCH = typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in globalThis);
const SHRINK = { map: 1024, other: 512 };
async function shrinkTextures(gltf, { map, other }) {
  const done = new Set(), jobs = [];
  gltf.scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      const alpha = m.transparent || m.alphaTest > 0;
      for (const [k, tex] of Object.entries(m)) {
        if (!tex?.isTexture || done.has(tex.source)) continue;
        done.add(tex.source);
        if (alpha && (k === 'map' || k === 'alphaMap')) continue;
        const img = tex.image, max = k === 'map' || k === 'emissiveMap' ? map : other;
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
        if (typeof createImageBitmap === 'function') {
          jobs.push(
            createImageBitmap(c).then(
              (bm) => {
                tex.image = bm;
                tex.needsUpdate = true;
                c.width = c.height = 0;
              },
              () => {},
            ),
          );
        }
      }
    }
  });
  await Promise.all(jobs);
}
// glTF chargé d'un modèle réaliste (scène et animations, sans clonage) : cheval WildMesh, préparé par pjl/asset.js.
export async function loadRealGltf(id) {
  await loadReal(id, false);
  return ready[id];
}
// Modèle réaliste (chargé une fois, cloné pour chaque personnage ou cheval).
export async function loadReal(id, cloneIt = true) {
  if (!cache[id]) {
    const t0 = performance.now();
    realStatus[id] = { state: 'loading', t0 };
    cache[id] = loader()
      .then(({ l }) => l.loadAsync(new URL(`real/${id}.${EXT}`, document.baseURI).href))
      .then(
        async (gltf) => {
          if (TOUCH) await shrinkTextures(gltf, SHRINK).catch((e) => console.warn('Textures non réduites', id, e));
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
  if (!cloneIt) return null;
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

// Variations de visage (formes signées gardées dans les modèles), amplitude du tirage par personnage ; corps des PNJ ;
// gain du regard (1 = forme MakeHuman entière).
// Doigts (_grip) : fermeture de la main du personnage classique pour un poing (rad), doigts, angles des trois phalanges
// à poing fermé (doigts autour des rênes, pouce posé dessus), légère flexion d'une main détendue.
const GRIP_FULL = 1.25;
const GRIP_FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'];
const GRIP_ANGLES = [[1.25, 1.3, 0.75], [0, 0.25, 0.2]];
// Pouce : part du chemin entre sa direction de repos et celle de l'index (1 = le long de l'index).
const THUMB_ALONG = 0.75;
const GRIP_RELAXED = [0.15, 0.25, 0.15];
const _gQ = new THREE.Quaternion(), _gP = new THREE.Vector3();
const FACE_KEYS = ['nose_width', 'nose_length', 'nose_height', 'jaw_width', 'chin', 'cheekbones', 'eye_spacing', 'lips', 'mouth_width'];
const FACE_RANGE = 0.8;
const BODY_RANGE = { weight: 0.45, muscle: 0.4 };
const LOOK_GAIN = 0.45;
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
// Surfaces des vêtements du modèle réaliste (méthodes des skills tiers blender-texturing / blender-clothing,
// EL4CTEO/blender-skills, et materials, arjun988/blender-skills, transposées dans le shader, sans modifier le fichier) :
//  - culotte : la texture d'origine est un jean (poches, coutures, délavage) seulement teinté ; son motif est atténué
//    (REAL_LOOK.breechesDetail) et sa rugosité baissée, pour une culotte d'équitation extensible ;
//  - bottes hautes (sans texture, rugosité uniforme) : cuir ciré à rugosité variable, plis souples au cou-de-pied,
//    poussière déposée sur le dessus du pied ;
//  - tous les tissus : rugosité jamais uniforme (bruit en coordonnées du modèle, collé au corps qui bouge).
export const REAL_LOOK = { breechesDetail: 0.35, breechesRough: 0.7, bootRough: 0.3 };
const REAL_NOISE = `
varying vec3 vRl;
float rlHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rlNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rlHash(i), rlHash(i + vec3(1, 0, 0)), f.x), mix(rlHash(i + vec3(0, 1, 0)), rlHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rlHash(i + vec3(0, 0, 1)), rlHash(i + vec3(1, 0, 1)), f.x), mix(rlHash(i + vec3(0, 1, 1)), rlHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 rlBump(vec3 pos, vec3 n, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}`;
// unit : mètres par unité de position du modèle (positions quantifiées en [-1, 1], pieds à -1).
function realClothShader(sh, kind, unit) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRl;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRl = (position + vec3(0.0, 1.0, 0.0)) * ${unit.toFixed(4)};`);
  let color = '', rough = '', nrm = '';
  if (kind === 'breeches') {
    // motif du jean ramené vers sa teinte moyenne (texture normalisée en gris moyen 0,5 × gain, voir tint())
    color = `diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * 0.5, ${(1 - REAL_LOOK.breechesDetail).toFixed(2)});`;
    rough = `roughnessFactor = ${REAL_LOOK.breechesRough.toFixed(2)} * (0.9 + 0.2 * rlNoise(vRl * 30.0));`;
  } else if (kind === 'boots') {
    const dust = `smoothstep(0.16, 0.0, vRl.y) * smoothstep(0.35, 0.8, rlNoise(vRl * 26.0 + 5.0))`;
    color = `float rlDust = ${dust}; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.4, 0.34, 0.26), rlDust * 0.35);`;
    rough = `roughnessFactor = ${REAL_LOOK.bootRough.toFixed(2)} * (0.75 + 0.5 * rlNoise(vRl * 18.0)) + rlDust * 0.4;`;
    nrm = `{ float k = smoothstep(0.28, 0.16, vRl.y) * smoothstep(0.05, 0.12, vRl.y); normal = rlBump(-vViewPosition, normal, k * (sin(vRl.y * 260.0 + rlNoise(vRl * 40.0) * 3.0) * 0.0006)); }`;
  } else {
    rough = 'roughnessFactor *= 0.88 + 0.24 * rlNoise(vRl * 30.0);';
  }
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + REAL_NOISE)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + color)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + rough)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + nrm);
}

// Peau du modèle réaliste : la texture d'origine est normalisée en gris (teintée par le jeu), donc sans rougeurs ni cernes.
// Couches discrètes, repérées autour des yeux (mètres) : rougeurs des joues, du nez, des oreilles et des lèvres, ombre
// sous les yeux, marbrure fine, lumière directe un peu réchauffée (diffusion sous la peau). Méthode des skills tiers
// blender-texturing (couches de surface) et realistic-style (diffusion plus chaude que la couleur de base).
function realSkinShader(sh, unit, eyeC) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFace;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nvFace = (position - vec3(${eyeC.x.toFixed(5)}, ${eyeC.y.toFixed(5)}, ${eyeC.z.toFixed(5)})) * ${unit.toFixed(4)};`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFace;\nfloat skBlob(vec3 p, vec3 c, vec3 r) { vec3 d = (p - c) / r; return exp(-dot(d, d)); }')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  {
    vec3 q = vec3(abs(vFace.x), vFace.y, vFace.z);
    float red = 0.55 * skBlob(q, vec3(0.038, -0.03, 0.025), vec3(0.022, 0.018, 0.02))   // pommettes
              + 0.45 * skBlob(q, vec3(0.0, -0.028, 0.06), vec3(0.012, 0.014, 0.02))      // bout du nez
              + 0.5 * skBlob(q, vec3(0.072, -0.01, -0.035), vec3(0.012, 0.03, 0.03))    // oreilles
              + 0.35 * skBlob(q, vec3(0.0, -0.06, 0.045), vec3(0.02, 0.008, 0.02));      // lèvres
    float under = skBlob(q, vec3(0.032, -0.012, 0.03), vec3(0.015, 0.006, 0.015));       // sous les yeux
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.8, 0.78), clamp(red, 0.0, 1.0) * 0.85);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.9, 0.86, 0.9), under * 0.6);
    diffuseColor.rgb *= 1.0 + (rlNoise(vFace * 260.0) - 0.5) * 0.05;
  }`,
    )
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= vec3(1.04, 0.97, 0.94);');
  if (!sh.fragmentShader.includes('float rlNoise')) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + REAL_NOISE.replace('varying vec3 vRl;', ''));
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
    // Mètres par unité de position (positions quantifiées) : hauteur réelle du personnage / hauteur du maillage du corps.
    let unit = 0.85;
    root.traverse((o) => {
      if (o.isMesh && o.material?.name === 'Skin') {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        unit = 1.7 / Math.max(0.5, bb.max.y + 1); // (environ 1,7 m du dessous des bottes au sommet du crâne)
      }
    });
    // Centre des yeux (repère du modèle) : repère des zones du visage pour la peau (realSkinShader).
    const eyeC = new THREE.Vector3(0, 0.9, 0.07);
    root.traverse((o) => {
      if (o.isMesh && o.material?.name === 'Eye') {
        o.geometry.computeBoundingBox();
        o.geometry.boundingBox.getCenter(eyeC);
      }
    });
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
            realSkinShader(sh, unit, eyeC);
          };
          m.customProgramCacheKey = () => 'strides-real-body-lamp-glove-skin';
        }
        this.mats.push(m);
        if (/^Hair/.test(m.name) || /Eyelash|Eyebrow/.test(m.name)) {
          m.alphaTest = 0.45;
          m.alphaToCoverage = true;
          m.transparent = false;
          m.side = THREE.DoubleSide;
        }
        if (/^Cloth/.test(m.name)) {
          m.side = THREE.DoubleSide;
          const kind = m.name === 'Cloth_jeans' ? 'breeches' : /boots/.test(m.name) ? 'boots' : 'cloth';
          m.onBeforeCompile = (sh) => {
            addCloudShadows(sh, null, true);
            realClothShader(sh, kind, unit);
          };
          m.customProgramCacheKey = () => 'strides-real-cloth-' + kind;
          if (kind === 'breeches' && m.normalScale) m.normalScale.multiplyScalar(0.5);
        }
        if (m.name === 'Skin') m.roughness = 0.58;
      }
    });
    this._initFace(root);
    this.outfit = human.outfit;
    this.applyOutfit(human.outfit);
    // Le modèle réaliste suit le personnage classique (position, cap, montée à cheval) à sa taille naturelle.
    human.mesh.add(root);
    root.scale.setScalar(1 / human.mesh.scale.x);
    root.updateMatrixWorld(true);
    this._fingerAxes();
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

  // Axes de flexion des doigts, relevés en pose de repos (bras en A, paumes tournées vers le corps : analyse du squelette
  // par scripts/humans/bpy/hand_axes.py) : pour chaque phalange, axe perpendiculaire à sa direction et à la normale de
  // la paume, exprimé dans le repère local de l'os. Une rotation positive autour de cet axe referme le doigt vers la paume.
  _fingerAxes() {
    this.fingers = [];
    for (const [o, t] of SIDES) {
      const hand = this.bones['hand' + t];
      if (!hand) continue;
      hand.getWorldPosition(_v);
      this.root.worldToLocal(_v);
      const palm = new THREE.Vector3(-Math.sign(_v.x || (o === 'l' ? 1 : -1)), -0.6, 0).normalize(); // vers le corps, un peu vers le bas
      for (const f of GRIP_FINGERS) {
        for (let j = 1; j <= 3; j++) {
          const b = this.bones[`${f}_0${j}${t}`];
          const c = b?.children.find((x) => x.isBone);
          if (!b || !c) break;
          const p0 = this.root.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
          const p1 = this.root.worldToLocal(c.getWorldPosition(new THREE.Vector3()));
          const d = p1.sub(p0).normalize();
          const axisRoot = new THREE.Vector3().crossVectors(d, palm).normalize();
          // repère local de l'os : rotation monde de l'os ramenée au repère du modèle
          const rq = this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
          const axis = axisRoot.applyQuaternion(rq.invert());
          this.fingers.push({ b, side: o, f, j, rest: b.quaternion.clone(), axis, d: d.clone(), rq: rq.clone().invert() });
        }
      }
      // Pouce posé sur le dessus du poing, le long de l'index (tenue des rênes) : rotation de la première phalange qui
      // amène sa direction de repos vers celle de l'index, exprimée dans le repère local de l'os.
      const th = this.fingers.find((F) => F.side === o && F.f === 'thumb' && F.j === 1);
      const ix = this.fingers.find((F) => F.side === o && F.f === 'index' && F.j === 1);
      if (th && ix) {
        const target = th.d.clone().lerp(ix.d, THUMB_ALONG).normalize();
        const qRoot = new THREE.Quaternion().setFromUnitVectors(th.d, target);
        th.thumbQ = th.rq.clone().invert().multiply(qRoot).multiply(th.rq); // repère local de l’os : R⁻¹ · q · R
      }
    }
  }

  // Creux du poing (monde) : milieu des deuxièmes phalanges de l'index, du majeur et de l'auriculaire, et de la base du
  // majeur ; null si le modèle n'a pas ces os.
  gripPoint(side, out) {
    const t = side === 'l' ? '_l' : '_r';
    const ns = [`index_02${t}`, `middle_02${t}`, `pinky_02${t}`, `middle_01${t}`];
    out.set(0, 0, 0);
    for (const n of ns) {
      const b = this.bones[n];
      if (!b) return null;
      out.add(b.getWorldPosition(_gP));
    }
    return out.multiplyScalar(1 / ns.length);
  }

  // Doigts autour des rênes (poing fermé du personnage classique), mains détendues à pied : angle par phalange × fermeture
  // de la main du personnage classique (os « Fing »).
  _grip() {
    if (!this.fingers?.length) return;
    const kOf = {};
    for (const [o] of SIDES) {
      const fing = this.human.bones[o + 'Fing'];
      const a = fing ? 2 * Math.acos(Math.min(1, Math.abs(fing.quaternion.w))) : 0;
      kOf[o] = Math.min(1, a / GRIP_FULL);
    }
    for (const F of this.fingers) {
      const k = kOf[F.side];
      const ang = GRIP_ANGLES[F.f === 'thumb' ? 1 : 0][F.j - 1] * k + (F.f === 'thumb' ? 0 : GRIP_RELAXED[F.j - 1] * (1 - k));
      F.b.quaternion.copy(F.rest);
      if (F.thumbQ) F.b.quaternion.multiply(_gQ.identity().slerp(F.thumbQ, k));
      F.b.quaternion.multiply(_gQ.setFromAxisAngle(F.axis, ang));
    }
  }

  // Visage et corps propres à chaque personnage (formes MakeHuman gardées par scripts/real/build-humans.mjs), paupières et
  // regard vivants (skills tiers blender-facial-shapekeys, animation : clignements sobres et non synchronisés, regard qui
  // précède la tête). Tirage déterministe d'après l'identité du personnage (le joueur garde toujours le même visage).
  _initFace(root) {
    this.morphMeshes = [];
    root.traverse((o) => o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences && this.morphMeshes.push(o));
    const H = this.human;
    const key = H.outfit?.identity || H._name || JSON.stringify(H.outfit || {});
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
    const F = (this.faceW = {});
    for (const n of FACE_KEYS) F['face_' + n] = (rnd() * 2 - 1) * FACE_RANGE;
    const npc = !H.isPlayer;
    F.body_weight = npc ? (rnd() * 2 - 1) * BODY_RANGE.weight : 0;
    F.body_muscle = npc ? (rnd() * 2 - 1) * BODY_RANGE.muscle : 0;
    this.eye = { blink: 0, next: 1 + rnd() * 4, t: 0, phase: 0, lx: 0, ly: 0, tx: 0, ty: 0, sacc: rnd() * 2, rnd };
    this._setMorphs(F);
  }

  _setMorphs(W) {
    for (const m of this.morphMeshes) {
      const D = m.morphTargetDictionary, I = m.morphTargetInfluences;
      for (const k in W) if (D[k] !== undefined) I[D[k]] = W[k];
    }
  }

  // Clignements (fermeture 70 ms, ouverture 110 ms, toutes les 2 à 6 s, parfois double) et regard : vers la caméra quand
  // elle est proche et devant le visage, sinon petites saccades autour de la direction de la tête.
  _eyes(dt) {
    const E = this.eye;
    if (!E || !this.morphMeshes.length) return;
    E.t += dt;
    if (E.phase === 0 && E.t >= E.next) (E.phase = 1), (E.t = 0);
    if (E.phase === 1) {
      E.blink = Math.min(1, E.t / 0.07);
      if (E.t >= 0.07) (E.phase = 2), (E.t = 0);
    } else if (E.phase === 2) {
      E.blink = Math.max(0, 1 - E.t / 0.11);
      if (E.t >= 0.11) (E.phase = 0), (E.t = 0), (E.next = E.rnd() < 0.15 ? 0.25 : 2 + E.rnd() * 4);
    }
    E.sacc -= dt;
    const head = this.bones.head, cam = this.human.game.camera;
    let tx = E.tx, ty = E.ty;
    if (head && cam) {
      head.getWorldPosition(_v);
      _v2.copy(cam.position).sub(_v);
      const d = _v2.length();
      head.getWorldQuaternion(_q).invert();
      _v2.applyQuaternion(_q).normalize();
      // repère de la tête : +z devant, +x à gauche du personnage, +y en haut
      if (d < 7 && _v2.z > 0.35) (tx = Math.max(-1, Math.min(1, _v2.x * 1.6))), (ty = Math.max(-0.6, Math.min(0.6, _v2.y * 1.6)));
      else if (E.sacc <= 0) (E.sacc = 0.6 + E.rnd() * 2.2), (E.tx = (E.rnd() - 0.5) * 0.7), (E.ty = (E.rnd() - 0.5) * 0.35), (tx = E.tx), (ty = E.ty);
    }
    // saccade : rattrapage rapide (≈ 50 ms)
    const k = 1 - Math.exp(-dt * 20);
    E.lx += (tx - E.lx) * k;
    E.ly += (ty - E.ly) * k;
    const W = this._eyeW || (this._eyeW = {});
    W.blink_left = W.blink_right = E.blink;
    W.look_left = Math.max(0, E.lx) * LOOK_GAIN;
    W.look_right = Math.max(0, -E.lx) * LOOK_GAIN;
    W.look_up = Math.max(0, E.ly) * LOOK_GAIN;
    W.look_down = Math.max(0, -E.ly) * LOOK_GAIN;
    this._setMorphs(W);
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
    const g = makeRidingHelmet(color, 0.118, 0.10856, 0.13688);
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
    // Points des rênes : creux des poings de ce modèle quand il est affiché (Human.getHandWorldPositions).
    if (on) this.human._realBody = this;
    else if (this.human._realBody === this) this.human._realBody = null;
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
    this._grip();
    const now = this.human.anim?.t ?? 0;
    this._eyes(Math.min(0.1, Math.max(0, now - (this._tPrev ?? now))));
    this._tPrev = now;
  }

  dispose() {
    this._cap(null);
    this.root.parent?.remove(this.root);
    this.human.mesh.layers.set(0);
    for (const m of this.mats) m.dispose();
  }
}

// Gestion du réglage « Modèles 3D » (Auto, Classiques, Réalistes) : rendu réaliste du joueur, des personnes et des voitures
// proches de la caméra (nombre limité, avec hystérésis pour ne pas recharger en bordure ; au-delà, modèles classiques).
// Chevaux : toujours le cheval du jeu (le cheval réaliste a été retiré), sauf ceux qui ont leur propre modèle (Tripo).
const NEAR = { humans: 8, cars: 6, humanDist: 30, carDist: 60, margin: 10, pjl: 3, pjlTouch: 2, pjlDist: 32 };
// Modèles propres de chevaux (def.model d'un cheval de data.js, ou essai de développement) : fichier public/real/<id> et
// classe qui le pilote, chargée à la demande (module à part, seulement quand un tel cheval est dans le jeu).
const HORSE_MODELS = { horse_tripo: () => import('./tripoHorse.js').then((m) => m.TripoHorse) };

export class Realism {
  constructor(game) {
    this.game = game;
    this.bodies = new Map(); // personnage → RealBody
    this.horses = new Map(); // cheval → modèle propre (TripoHorse)
    this.cars = new Map(); // véhicule → RealCar
    // Voitures réalistes : seulement après la prise en main et le chargement du van et du Defender (voir
    // Game._loadVehiclesLater) ; jusque-là, les voitures du jeu sont affichées.
    this.carsReady = false;
    // Chevaux WildMesh (Jumping League Sim) : cheval → PjlHorse ; état du chargement de l'asset partagé.
    this.pjl = new Map();
    this.pjlState = { asset: null, loading: null, failed: false, cls: null };
    this.carFailed = new Set();
    this.failed = false;
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
    // Cheval WildMesh : chargé et préparé pendant l'écran de chargement (sinon : cheval du jeu, puis remplacement).
    if (this.pjlAllowed) await Promise.race([this._pjlLoad(), new Promise((r) => setTimeout(r, timeoutMs + 6000))]);
    const ids = this.ownAllowed ? [...new Set(this.game.horses.map((h) => h.def?.model).filter(Boolean))] : [];
    if (!ids.length) return;
    const all = ids.map((id) => Promise.all([this._model(id).loading, loadReal(id)]));
    await Promise.race([Promise.all(all).catch(() => null), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  // Chevaux WildMesh : sauf qualité « Économie », réglage « Classiques » et mode sûr (repli : cheval du jeu).
  get pjlAllowed() {
    const st = this.game.save.data.settings;
    return !this.game.safeMode && st.quality !== 'low' && st.characters !== 'classic' && !this.pjlState.failed;
  }

  // Chargement (une fois) du fichier et de la classe, préparation de l'asset (miroirs, sellerie…). Échec : cheval du jeu
  // affiché, message une fois ; rien n'est retenté pendant la partie.
  _pjlLoad() {
    const P = this.pjlState;
    if (P.asset || P.failed) return Promise.resolve(P.asset);
    if (!P.loading) {
      P.loading = Promise.all([import('./pjl/asset.js'), import('./pjlHorse.js')])
        .then(([a, c]) => {
          P.cls = c.PjlHorse;
          return a.loadHorseAsset(() => loadRealGltf('horse_pjl'));
        })
        .then(
          (asset) => {
            P.asset = asset;
            P.loading = null;
            return asset;
          },
          (e) => {
            console.warn('Cheval WildMesh indisponible', e);
            P.failed = true;
            P.loading = null;
            realStatus.horse_pjl = { ...(realStatus.horse_pjl || {}), state: 'failed', error: String(e?.message || e).slice(0, 160) };
            this._dropPjl();
            this.game.hud?.toast(t('Modèle 3D du cheval indisponible : affichage classique.'));
            return null;
          },
        );
    }
    return P.loading;
  }

  // Retire les chevaux WildMesh (tous, ou un seul : nouvelle sellerie, cheval retiré du jeu).
  _dropPjl(only = null) {
    for (const [h, r] of this.pjl) {
      if (only && h !== only) continue;
      r.dispose();
      this.pjl.delete(h);
    }
  }
  dropPjl(h) {
    this._dropPjl(h);
  }

  // Chevaux WildMesh voulus : cheval du joueur et cheval principal, puis les plus proches de la caméra (nombre limité) ;
  // pas ceux qui ont leur propre modèle (Tripo). Une création par image au plus.
  _syncPjl(lowFps) {
    const g = this.game, P = this.pjlState;
    const ok = this.pjlAllowed && (g.state === 'play' || g.state === 'photo');
    if (!ok) {
      if (this.pjl.size) this._dropPjl();
      return;
    }
    if (!P.asset) {
      this._pjlLoad();
      return;
    }
    // Chevaux qui ont (ou attendent) leur propre modèle — Tripo, essai de développement compris — : jamais en WildMesh.
    const own = (h) => !!h.def?.model || (this.ownAllowed && !!this._modelOf(h)) || this.horses.has(h);
    const pool = g.horses.filter((h) => !own(h) && h.mesh && h.game);
    const always = [g.player?.horse, g.mainHorse].filter((h) => h && pool.includes(h));
    const max = lowFps ? 0 : TOUCH ? NEAR.pjlTouch : NEAR.pjl;
    const want = this._wanted(pool, always, this.pjl, max, NEAR.pjlDist);
    for (const h of [...want]) if (own(h) || !g.horses.includes(h)) want.delete(h);
    for (const [h, r] of this.pjl) {
      if (want.has(h)) continue;
      r.dispose();
      this.pjl.delete(h);
    }
    for (const h of want) {
      if (this.pjl.has(h)) continue;
      const tack = h === g.mainHorse ? g.commerce?.horseTack?.() || {} : {};
      this.pjl.set(h, new P.cls(h, P.asset, tack));
      break;
    }
  }

  // « Réalistes » : toujours ; « Auto » : sauf qualité « Économie » ou cadence trop basse (voir autoFallback).
  get enabled() {
    if (this.game.safeMode >= 2) return false; // mode sûr après un arrêt brutal (voir Game._safeStart)
    const st = this.game.save.data.settings;
    if (st.characters === 'real') return true;
    return st.characters === 'auto' && !this.autoOff && st.quality !== 'low';
  }
  // Personnage du joueur : il garde le même modèle pendant toute la partie. La baisse de cadence (autoFallback) ne
  // le change pas — seul un réglage choisi par le joueur (« Modèles 3D », qualité « Économie ») le fait.
  get playerEnabled() {
    if (this.game.safeMode >= 2) return false;
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
  // apparence, les réglages des modèles ne le retirent pas (pas d'image intermédiaire avec le cheval du jeu) ; seuls la
  // qualité « Économie » et le mode sûr le font (voir ownAllowed).
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
        if (kind === 'car') this.carFailed.add(id);
        else this.failed = true;
        if (kind !== 'car') this.game.hud?.toast(t('Personnage réaliste indisponible : affichage classique.'));
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
    // Chevaux WildMesh (indépendants des modèles réalistes des personnages) ; cadence trop basse (Auto) : seuls le
    // cheval du joueur et le cheval principal le gardent.
    this._syncPjl(this.autoOff);
    // Chevaux qui ont leur propre modèle (def.model, cheval à l'essai) : affichés avec lui quels que soient les réglages
    // « Modèles 3D » ou la baisse de cadence (Auto), sauf en qualité « Économie » et en mode sûr
    // (voir ownAllowed) ; essai : chevaux du joueur.
    const own = this.ownAllowed ? g.horses.filter((h) => h.def?.model) : [];
    if (!this.playerEnabled && !trial && !own.length && !this.horses.size) {
      this._releaseOwn(); // modèle propre arrivé après le départ de son dernier cheval
      return;
    }
    const lead = [g.mainHorse, P?.horse].filter((h) => h && g.horses.includes(h));
    if (import.meta.env.DEV && trial) for (const h of lead) if (!own.includes(h)) own.push(h);
    if (!this.enabled || !this.playerEnabled) {
      // Cadence trop basse (Auto) : seul le joueur reste réaliste (et les chevaux qui ont leur propre modèle).
      if (this.playerEnabled && !this.failed) this._syncBodies(new Set([P?.human].filter(Boolean)));
      this._syncHorses(new Set(own));
      return;
    }
    // Mode sûr, niveau 1 (voir Game._safeStart) : seul le personnage du joueur reste réaliste.
    const leadOnly = g.safeMode === 1;
    // Chevaux : cheval du jeu, sauf ceux qui ont leur propre modèle (Tripo).
    this._syncHorses(new Set(own));
    if (leadOnly) {
      this._sync(this.cars, new Set(), () => null);
      if (!this.failed) this._syncBodies(new Set([P?.human].filter(Boolean)));
      return;
    }
    // Voitures (garées, conduisibles et de la circulation) des types qui ont un modèle réaliste.
    const cars = this.carsReady ? g.vehicles.filter((v) => v.mesh && v.spec && CAR_MODELS[v.kind] && !this.carFailed.has(CAR_MODELS[v.kind])) : [];
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

  // Chevaux voulus : modèle propre du cheval (def.model, essai) piloté par sa classe.
  _syncHorses(want) {
    const g = this.game;
    // Classe attendue pour un cheval : celle de son modèle propre (null sans modèle propre, tant qu'elle n'est pas
    // chargée, ou en cas d'échec : cheval du jeu affiché).
    const clsOf = (h) => {
      const m = this._modelOf(h);
      return m && !m.failed ? m.cls : null;
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
      const root = !busy || h === g.mainHorse ? realNow(m.id) : null;
      if (!root) {
        this._load(m.id, 'model');
        return null;
      }
      return new m.cls(h, root);
    });
    this._releaseOwn();
  }

  // Modèle propre qu'aucun cheval n'affiche ni n'attend plus : rendu à la mémoire (voir releaseReal). Appareils
  // tactiles seulement (mémoire limitée) ; ailleurs il reste chargé et revient sans image intermédiaire.
  _releaseOwn() {
    if (!TOUCH) return;
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
