// Prototype « rendu réaliste » des personnages (réglage « Personnages : Classique / Réaliste ») : le personnage du
// joueur est remplacé à l'écran par un modèle réaliste (corps MakeHuman CC0, peau photographique, yeux, cils,
// cheveux, vêtements texturés, squelette de 53 os avec doigts), chargé à part (public/real/, voir
// scripts/real/build-humans.mjs). Le personnage classique reste dans la scène et continue d'être animé (marche,
// course, monte à cheval, conduite, port d'objets, rênes) : il est seulement masqué, et chaque image son
// squelette est recopié sur celui du modèle réaliste (reciblage des rotations). Revenir à « Classique » rétablit
// l'affichage d'origine sans rien recharger.
import * as THREE from 'three';
import { RealHorse } from './realHorse.js';

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
      cloneFn = s.clone;
      return { l, clone: s.clone };
    });
  }
  return loaderP;
}
// Fichier unique (page claude.ai, qui ne sert pas les .glb) : copie glTF JSON (scripts/real/to-json.mjs).
const EXT = import.meta.env?.MODE === 'single' ? 'gltf.json' : 'glb';
// Modèle réaliste (chargé une fois, cloné pour chaque personnage ou cheval).
export async function loadReal(id) {
  if (!cache[id]) {
    cache[id] = loader().then(({ l }) => l.loadAsync(new URL(`real/${id}.${EXT}`, document.baseURI).href));
  }
  const gltf = await cache[id];
  ready[id] = gltf;
  const { clone } = await loader();
  return clone(gltf.scene);
}
// Clone immédiat d'un modèle déjà chargé (sinon null).
export function realNow(id) {
  const g = ready[id];
  return g && cloneFn ? cloneFn(g.scene) : null;
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
    this._helmet(o.helmet);
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
    if (!this.active || !this.human.mesh.visible) return;
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
    this.root.parent?.remove(this.root);
    this.human.mesh.layers.set(0);
    for (const m of this.mats) m.dispose();
  }
}

// Gestion du réglage « Modèles 3D » (Auto, Classiques, Réalistes) : rendu réaliste du joueur, de son cheval, et des personnes et chevaux proches
// de la caméra (nombre limité, avec hystérésis pour ne pas recharger en bordure ; au-delà, modèles classiques).
const NEAR = { humans: 8, horses: 5, humanDist: 30, horseDist: 45, margin: 10 };

export class Realism {
  constructor(game) {
    this.game = game;
    this.bodies = new Map(); // personnage → RealBody
    this.horses = new Map(); // cheval → RealHorse
    this.failed = false;
    this.horseFailed = false;
    this.loading = new Set();
  }

  // « Réalistes » : toujours ; « Auto » : sauf qualité « Économie » ou cadence trop basse (voir autoFallback).
  get enabled() {
    const st = this.game.save.data.settings;
    if (st.characters === 'real') return true;
    return st.characters === 'auto' && !this.autoOff && st.quality !== 'low';
  }

  // Mode « Auto » : l'appareil ne suit pas, modèles classiques pour le reste de la partie.
  autoFallback() {
    if (this.game.save.data.settings.characters !== 'auto' || this.autoOff) return;
    this.autoOff = true;
    if (!this.bodies.size && !this.horses.size) return;
    this._clear();
    this.game.hud?.toast('Modèles classiques pour garder la fluidité (réglage « Modèles 3D »).');
  }

  _clear() {
    for (const r of this.bodies.values()) r.dispose();
    for (const r of this.horses.values()) r.dispose();
    this.bodies.clear();
    this.horses.clear();
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
    if (!this.enabled) this._clear();
  }

  // Qualité changée (« Économie » coupe les modèles réalistes en mode « Auto »).
  refresh() {
    if (!this.enabled) this._clear();
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
        if (kind === 'horse') this.horseFailed = true;
        else this.failed = true;
        this.game.hud?.toast(kind === 'horse' ? 'Cheval réaliste indisponible : affichage classique.' : 'Personnage réaliste indisponible : affichage classique.');
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
    if (!this.enabled) return;
    const g = this.game, P = g.player;
    if (!this.horseFailed) {
      const want = this._wanted(g.horses, [g.mainHorse, P?.horse].filter((h) => h && g.horses.includes(h)), this.horses, NEAR.horses, NEAR.horseDist);
      this._sync(this.horses, want, (h, busy) => {
        const root = !busy || h === g.mainHorse ? realNow('horse') : null;
        if (!root) {
          this._load('horse', 'horse');
          return null;
        }
        return new RealHorse(h, root);
      });
    }
    if (!this.failed) {
      const want = this._wanted(g.humans, [P?.human], this.bodies, NEAR.humans, NEAR.humanDist);
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
