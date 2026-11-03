// Cheval Tripo (ESSAI, mode développement seulement : `?tripohorse`) : modèle Tripo optimisé et animable
// (trial/horse_tripo.glb, construit par scripts/real/build-tripo-horse.mjs), piloté par le cheval procédural.
//
// Le modèle porte le squelette du jeu (mêmes 50 os, mêmes noms, rotations de repos nulles) placé dans sa propre
// anatomie : à chaque image, après l'animation du cheval procédural (masqué mais toujours animé), on recopie les
// rotations locales os par os, la translation du thorax, puis une IK à deux segments par membre pose le boulet du
// modèle sur celui du cheval procédural (écart de repos conservé : aplombs propres au modèle) et une seconde passe
// recale la semelle en hauteur et en avant/arrière. Paturon et sabot reprennent l'orientation du cheval procédural.
// Robe : celle du modèle (texture d'origine nettoyée), pas la recoloration par cheval du modèle réaliste.
// Sellerie : tapis, selle, sangle et étriers du cheval procédural (calés sur le dos, à 1 cm près) ; filet, rênes,
// licol, guêtres et bonnet masqués (faits pour la tête et les membres du cheval procédural).
import * as THREE from 'three';
import { MODEL_SCALE } from './horse/skeleton.js';
import { horseAssets } from './horse/assets.js';
import { hoofWorldPosition } from './horse/anim.js';

// Os recopiés (rotations locales).
const COPY = ['body', 'loin', 'pelvis', 'tail', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6', 'neck', 'neck2', 'neck3', 'head', 'earL', 'earR', 'jaw'];
for (const s of ['l', 'r']) COPY.push(`f${s}Sc`, `f${s}Hu`, `f${s}U`, `f${s}L`, `f${s}P`, `f${s}H`, `h${s}U`, `h${s}L`, `h${s}C`, `h${s}P`, `h${s}H`);
// Membres : [A, B, E (boulet), indice du sabot procédural, signe de flexion, distaux].
const LEGS = [
  ['flU', 'flL', 'flP', 0, -1, ['flP', 'flH']],
  ['frU', 'frL', 'frP', 1, -1, ['frP', 'frH']],
  ['hlL', 'hlC', 'hlP', 2, 1, ['hlP', 'hlH']],
  ['hrL', 'hrC', 'hrP', 3, 1, ['hrP', 'hrH']],
];
// Queue : la queue du modèle est longue (crins jusqu'à 15 cm du sol) ; les rotations de la queue courte du cheval
// procédural sont modérées, de la base au bout, pour qu'elle reste pendante au lieu de se déployer d'un bloc.
const TAIL_DAMP = { tail: 0.75, tail2: 0.7, tail3: 0.62, tail4: 0.55, tail5: 0.5, tail6: 0.45 };
const _id = new THREE.Quaternion();
// Semelle sous l'articulation du sabot du modèle (repère de l'os, mètres du modèle).
const SOLE = new THREE.Vector3(0, -0.075, 0.02);
// Au-delà : niveau de détail réduit.
const LOD_DIST = 25;
// Sellerie conservée (le reste est fait pour la tête et les membres du cheval procédural).
const KEEP = { near: ['pad', 'saddle', 'girth', 'stirrups'], far: ['pad', 'saddle', 'girth'] };

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _x = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const tackCache = new Map();

function tackIndexKept(cfg) {
  const key = `${cfg.saddle ? 1 : 0}${cfg.lod ? 1 : 0}`;
  let a = tackCache.get(key);
  if (a) return a;
  const T = horseAssets().tack;
  const names = cfg.saddle ? (cfg.lod ? KEEP.far : KEEP.near) : [];
  let n = 0;
  for (const k of names) n += T.ranges[k][1];
  const out = new Uint16Array(n);
  let o = 0;
  for (const k of names) {
    const [s, c] = T.ranges[k];
    out.set(T.indices.subarray(s, s + c), o);
    o += c;
  }
  a = new THREE.BufferAttribute(out, 1);
  tackCache.set(key, a);
  return a;
}

export class TripoHorse {
  constructor(horse, root) {
    this.horse = horse;
    this.root = root;
    this.bones = {};
    this.lods = [];
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        this.lods[/LOD1/.test(o.name) ? 1 : 0] = o;
      }
    });
    // Le modèle est en mètres ; le cheval procédural en unités du modèle (× MODEL_SCALE) sous une échelle de 0,94.
    root.scale.setScalar(MODEL_SCALE);
    horse.mesh.add(root);
    this.rest = Object.fromEntries(Object.entries(this.bones).map(([n, b]) => [n, b.position.clone()]));
    this._calibrate();
    this.setActive(true);
  }

  // Écarts de repos (repère du cheval) entre les boulets du modèle et ceux du cheval procédural.
  _calibrate() {
    const H = this.horse, ours = H.bones;
    const saved = {};
    for (const [n, b] of Object.entries(ours)) {
      saved[n] = [b.quaternion.clone(), b.position.clone()];
      b.quaternion.identity();
      if (b.userData.rest) b.position.copy(b.userData.rest);
    }
    H.mesh.updateMatrixWorld(true);
    const meshPos = (o) => H.mesh.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    this.legs = LEGS.map(([a, b, e, i, sign, distal]) => ({
      A: this.bones[a],
      Bb: this.bones[b],
      E: this.bones[e],
      op: ours[e],
      i,
      sign,
      delta: meshPos(this.bones[e]).sub(meshPos(ours[e])),
      distal: distal.map((n) => [ours[n], this.bones[n]]),
    }));
    for (const [n, b] of Object.entries(ours)) {
      b.quaternion.copy(saved[n][0]);
      b.position.copy(saved[n][1]);
    }
    H.mesh.updateMatrixWorld(true);
  }

  setActive(on) {
    this.active = on;
    this.root.visible = on;
    const H = this.horse, ud = H.mesh.userData;
    // Corps, crins et bonnet du cheval procédural retirés de l'affichage (toujours animés) ; sellerie conservée.
    const layer = on ? 31 : 0;
    H.mesh.layers.set(layer);
    for (const p of ud.parts || []) if (p !== ud.tack) p.layers.set(layer);
    if (!on && ud.tack && this._tackSrc) ud.tack.geometry.setIndex(this._tackSrc);
  }

  update() {
    const H = this.horse;
    if (!this.active || !H.mesh.visible) return;
    const ours = H.bones, B = this.bones;
    // Sellerie filtrée (la source change avec l'équipement et le niveau de détail).
    const tack = H.mesh.userData.tack;
    if (tack) {
      const cur = tack.geometry.index;
      if (cur !== this._tackKept) {
        this._tackSrc = cur;
        this._tackKept = tackIndexKept(tack.userData.cfg);
        tack.geometry.setIndex(this._tackKept);
        tack.visible = this._tackKept.count > 0;
      }
    }
    // Niveau de détail selon la distance à la caméra (même règle que la position du cheval).
    const cam = H.game?.camera?.position;
    const far = cam ? Math.hypot(H.mesh.position.x - cam.x, H.mesh.position.z - cam.z) > LOD_DIST : false;
    if (this.lods[1]) {
      this.lods[0].visible = !far;
      this.lods[1].visible = far;
    }
    // Rotations locales et translation du thorax (unités du modèle → mètres du modèle Tripo).
    for (const n of COPY) {
      if (!B[n] || !ours[n]) continue;
      const k = TAIL_DAMP[n];
      if (k) B[n].quaternion.copy(_id).slerp(ours[n].quaternion, k);
      else B[n].quaternion.copy(ours[n].quaternion);
    }
    const body = ours.body;
    B.body.position.copy(this.rest.body).addScaledVector(_v.copy(body.position).sub(body.userData.rest), 1 / MODEL_SCALE);
    H.mesh.updateMatrixWorld(true);
    for (const L of this.legs) this._ik(L);
  }

  // IK à deux segments (plan de flexion du membre), deux passes : boulet sur la cible, puis semelle recalée.
  _ik(L) {
    const mesh = this.horse.mesh;
    _m.copy(mesh.matrixWorld).invert();
    // Cible : boulet procédural + écart de repos (repère du cheval).
    _t.copy(L.op.getWorldPosition(_v)).applyMatrix4(_m).add(L.delta);
    for (let pass = 0; pass < 2; pass++) {
      _x.copy(_t).applyMatrix4(mesh.matrixWorld);
      this._solve(L, _x);
      // Distaux : orientation du cheval procédural.
      for (const [ob, tb] of L.distal) this._copyWorld(ob, tb);
      if (pass) break;
      // Semelle du modèle vs semelle procédurale (hauteur et avant/arrière seulement : aplombs latéraux du modèle).
      hoofWorldPosition(this.horse.bones, L.i, _s).applyMatrix4(_m);
      const hb = L.distal[1][1];
      _c.copy(SOLE).applyMatrix4(hb.matrixWorld).applyMatrix4(_m);
      _t.y += _s.y - _c.y;
      _t.z += _s.z - _c.z;
    }
  }

  _solve(L, target) {
    const mesh = this.horse.mesh;
    L.A.getWorldPosition(_a);
    L.Bb.getWorldPosition(_b);
    L.E.getWorldPosition(_c);
    const lab = _a.distanceTo(_b), lbc = _b.distanceTo(_c);
    const lat = THREE.MathUtils.clamp(_a.distanceTo(target), Math.abs(lab - lbc) + 1e-4, lab + lbc - 1e-4);
    const u = _v.subVectors(_a, _b), w = _v2.subVectors(_c, _b);
    _n.set(L.sign, 0, 0).transformDirection(mesh.matrixWorld);
    const cr = new THREE.Vector3().crossVectors(u, w);
    const phi = Math.atan2(_n.dot(cr), u.dot(w));
    const th1 = Math.acos(THREE.MathUtils.clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
    this._rotateWorld(L.Bb, _q.setFromAxisAngle(_n, th1 - phi));
    L.E.getWorldPosition(_c);
    this._rotateWorld(L.A, _q.setFromUnitVectors(_v.subVectors(_c, _a).normalize(), _v2.subVectors(target, _a).normalize()));
  }

  // Orientation monde d'un os procédural recopiée sur l'os du modèle (même repère de repos).
  _copyWorld(ob, tb) {
    ob.getWorldQuaternion(_q);
    tb.parent.getWorldQuaternion(_q2).invert();
    tb.quaternion.copy(_q2.multiply(_q));
    tb.updateMatrixWorld(true);
  }

  _rotateWorld(bone, q) {
    bone.getWorldQuaternion(_q2).premultiply(q);
    bone.parent.getWorldQuaternion(_q).invert();
    bone.quaternion.copy(_q.multiply(_q2));
    bone.updateMatrixWorld(true);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.setActive(false);
    this.root.visible = false;
  }
}
