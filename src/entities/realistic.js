// Prototype « rendu réaliste » des personnages (réglage « Personnages : Classique / Réaliste ») : le personnage du
// joueur est remplacé à l'écran par un modèle réaliste (corps MakeHuman CC0, peau photographique, yeux, cils,
// cheveux, vêtements texturés, squelette de 53 os avec doigts), chargé à part (public/real/, voir
// scripts/real/build-humans.mjs). Le personnage classique reste dans la scène et continue d'être animé (marche,
// course, monte à cheval, conduite, port d'objets, rênes) : il est seulement masqué, et chaque image son
// squelette est recopié sur celui du modèle réaliste (reciblage des rotations). Revenir à « Classique » rétablit
// l'affichage d'origine sans rien recharger.
import * as THREE from 'three';

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
// Modèle d'un sexe (chargé une fois, cloné pour chaque personnage).
export async function loadRealHuman(sex) {
  const id = sex === 'm' ? 'rider_m' : 'rider_f';
  if (!cache[id]) {
    cache[id] = loader().then(({ l }) => l.loadAsync(new URL(`real/${id}.glb`, document.baseURI).href));
  }
  const gltf = await cache[id];
  ready[id] = gltf;
  const { clone } = await loader();
  return clone(gltf.scene);
}
export function realHumanNow(sex) {
  const g = ready[sex === 'm' ? 'rider_m' : 'rider_f'];
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
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const m = o.material;
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
      else if (mat.name === 'Cloth_shirt') tint(mat, o.top);
      else if (mat.name === 'Cloth_jeans') tint(mat, o.pants);
      else if (mat.name === 'Cloth_boots') tint(mat, o.boots);
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
  }
}

// Gestion du réglage : rendu réaliste du personnage du joueur (prototype comparatif).
export class Realism {
  constructor(game) {
    this.game = game;
    this.body = null;
    this.loading = null;
    this.failed = false;
  }

  get enabled() {
    return this.game.save.data.settings.characters === 'real';
  }

  set(mode) {
    this.game.save.data.settings.characters = mode;
    if (mode !== 'real' && this.body) {
      this.body.dispose();
      this.body = null;
    }
  }

  // Appelé à chaque image avant le rendu.
  update() {
    if (!this.enabled || this.failed) return;
    const human = this.game.player?.human;
    if (!human) return;
    // Nouveau personnage (changement de tenue, cavalière/cavalier) : nouveau modèle.
    if (this.body && this.body.human !== human) {
      this.body.dispose();
      this.body = null;
    }
    if (!this.body) {
      const now = realHumanNow(human.sex);
      if (now) {
        this.loading = null;
        this.body = new RealBody(human, now);
        this.body.update();
        return;
      }
      if (this.loading?.human === human) return;
      const job = { human };
      this.loading = job;
      loadRealHuman(human.sex).then(
        (root) => {
          if (this.loading !== job || this.game.player?.human !== human || !this.enabled) return;
          this.loading = null;
          this.body = new RealBody(human, root);
        },
        (e) => {
          console.warn('Personnage réaliste indisponible', e);
          this.failed = true;
          this.loading = null;
          this.game.hud?.toast('Personnage réaliste indisponible : affichage classique.');
        },
      );
      return;
    }
    if (this.body.outfit !== human.outfit) {
      this.body.outfit = human.outfit;
      this.body.applyOutfit(human.outfit);
    }
    this.body.update();
  }
}
