// Cheval Tripo (ESSAI, mode développement seulement : `?tripohorse`) : modèle Tripo optimisé et animable
// (trial/horse_tripo.glb, construit par scripts/real/build-tripo-horse.mjs), piloté par le cheval procédural.
//
// Le modèle porte le squelette du jeu (mêmes 50 os, mêmes noms, rotations de repos nulles) placé dans sa propre
// anatomie : à chaque image, après l'animation du cheval procédural (masqué mais toujours animé), on recopie les
// rotations locales os par os, la translation du thorax, puis une IK à deux segments par membre pose le boulet du
// modèle sur celui du cheval procédural (écart de repos conservé : aplombs propres au modèle) et une seconde passe
// recale la semelle en hauteur et en avant/arrière. Paturon et sabot reprennent l'orientation du cheval procédural.
// Portée : le membre du modèle, presque tendu au repos, est un peu plus court que celui du cheval procédural ; quand la
// cible est hors d'atteinte (appui, membre tendu, réception), l'épaule (omoplate) ou la hanche (fémur) se rapproche
// d'elle de ce qui manque (5 et 4 cm au plus), comme le thorax qui s'abaisse entre les antérieurs à l'appui.
// Contact : près du sol, la seconde passe ne cale pas le centre de la sole mais le point le plus bas du sabot du modèle
// (contour mesuré sur son maillage : pince, talons, quartiers), rapporté au sol sous ce point, à la hauteur du point le
// plus bas du sabot procédural (contour mesuré de même), rapporté au sol sous lui : le sabot du modèle, plus long et plus
// écarté, ne s'enfonce pas au basculement sur la pince ni en dévers. En l'air, centre de la sole ; fondu entre 3 et 10 cm.
// Ancrages de jeu : la longe s'attache au point du licol du modèle, les empreintes et éclaboussures suivent ses sabots.
// Robe : celle du modèle (texture d'origine nettoyée), pas la recoloration par cheval du modèle réaliste.
// Sellerie : tapis, selle, sangle et étriers du cheval procédural (calés sur le dos, à 1 cm près) ; filet, rênes,
// licol, guêtres et bonnet masqués (faits pour la tête et les membres du cheval procédural).
import * as THREE from 'three';
import { MODEL_SCALE } from './horse/skeleton.js';
import { horseAssets } from './horse/assets.js';
import { refreshHorseTack } from './horse/mesh.js';
import { hoofWorldPosition } from './horse/anim.js';

// Os recopiés (rotations locales).
const COPY = ['body', 'loin', 'pelvis', 'tail', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6', 'neck', 'neck2', 'neck3', 'head', 'earL', 'earR', 'jaw'];
for (const s of ['l', 'r']) COPY.push(`f${s}Sc`, `f${s}Hu`, `f${s}U`, `f${s}L`, `f${s}P`, `f${s}H`, `h${s}U`, `h${s}L`, `h${s}C`, `h${s}P`, `h${s}H`);
// Membres : [A, B, E (boulet), indice du sabot procédural, signe de flexion, distaux, os d'épaule (portée)].
const LEGS = [
  ['flU', 'flL', 'flP', 0, -1, ['flP', 'flH'], 'flSc', 0.05],
  ['frU', 'frL', 'frP', 1, -1, ['frP', 'frH'], 'frSc', 0.05],
  ['hlL', 'hlC', 'hlP', 2, 1, ['hlP', 'hlH'], 'hlU', 0.04],
  ['hrL', 'hrC', 'hrP', 3, 1, ['hrP', 'hrH'], 'hrU', 0.04],
];
// Centre de la sole du sabot procédural (anim.js, repère de l'os du sabot, unités du modèle).
const PROC_SOLE = new THREE.Vector3(0, -0.06 * MODEL_SCALE, 0.01 * MODEL_SCALE);
// Recalage sur le point le plus bas des sabots près du sol (sabot procédural à moins de 3 cm, fondu jusqu'à 10 cm) ;
// plus haut (soutien du membre), sur le centre de la sole.
export const NEAR_GROUND = [0.03, 0.1];
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
const _dz = new THREE.Vector3();
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
    // Sol de marche du cheval (sols d'arène, rampe du camion compris).
    this._ground = horse.groundAt ? (x, z) => horse.groundAt(x, z) : () => 0;
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
    const bodyLod0 = horseAssets().body?.lod?.[0] || null;
    this.legs = LEGS.map(([a, b, e, i, sign, distal, sc, scMax]) => {
      const A = meshPos(this.bones[a]), Bm = meshPos(this.bones[b]), E = meshPos(this.bones[e]);
      return {
        A: this.bones[a],
        Bb: this.bones[b],
        E: this.bones[e],
        op: ours[e],
        i,
        sign,
        delta: E.clone().sub(meshPos(ours[e])),
        distal: distal.map((n) => [ours[n], this.bones[n]]),
        sc: sc ? this.bones[sc] : null,
        scMax,
        // Dessous des deux sabots (modèle : niveau de détail proche ; cheval procédural : son maillage proche).
        contour: TripoHorse.contour(this.lods[0], this.bones[distal[1]], 0.015, SOLE),
        procContour: TripoHorse.contour(H.mesh, ours[distal[1]], 0.015 * MODEL_SCALE, PROC_SOLE, bodyLod0),
        // Portée utile : distance épaule → boulet au repos (membre jamais tendu au-delà de sa pose d'origine), en
        // fraction de la somme des deux segments.
        reach: A.distanceTo(E) / (A.distanceTo(Bm) + Bm.distanceTo(E)),
      };
    });
    this.hooves = [];
    for (const L of this.legs) this.hooves[L.i] = L.distal[1][1];
    for (const [n, b] of Object.entries(ours)) {
      b.quaternion.copy(saved[n][0]);
      b.position.copy(saved[n][1]);
    }
    H.mesh.updateMatrixWorld(true);
  }

  // Contour du dessous de chaque sabot (repère de l'os du sabot), mesuré sur le maillage : sommets liés surtout à l'os
  // du sabot (index limité au niveau de détail proche si `range`), dans la bande `band` du bas (le bord de la sole, pas
  // les glomes des talons) ; le plus bas et seize points extrêmes autour (pince, talons, quartiers). Maillage sans
  // sommets skinnés (outils de mesure) : `fallback`.
  static contour(mesh, bone, band, fallback, range = null) {
    const g = mesh?.geometry, P = g?.attributes.position, J = g?.attributes.skinIndex, W = g?.attributes.skinWeight;
    const sk = mesh?.skeleton, j = sk ? sk.bones.indexOf(bone) : -1;
    if (!P || !J || !W || j < 0) return [fallback.clone()];
    const m = new THREE.Matrix4().multiplyMatrices(sk.boneInverses[j], mesh.bindMatrix);
    const seen = new Uint8Array(P.count), pts = [];
    const take = (k) => {
      if (seen[k]) return;
      seen[k] = 1;
      let w = 0;
      for (let c = 0; c < 4; c++) if (J.getComponent(k, c) === j) w += W.getComponent(k, c);
      if (w >= 0.5) pts.push(new THREE.Vector3().fromBufferAttribute(P, k).applyMatrix4(m));
    };
    if (range && g.index) for (let n = range[0]; n < range[0] + range[1]; n++) take(g.index.getX(n));
    else for (let k = 0; k < P.count; k++) take(k);
    if (!pts.length) return [fallback.clone()];
    let minY = Infinity;
    for (const p of pts) minY = Math.min(minY, p.y);
    const low = pts.filter((p) => p.y < minY + band);
    const sel = [low.reduce((a, b) => (b.y < a.y ? b : a))];
    for (let q = 0; q < 16; q++) {
      const cx = Math.cos((q * Math.PI) / 8), cz = Math.sin((q * Math.PI) / 8);
      sel.push(low.reduce((a, b) => (b.x * cx + b.z * cz > a.x * cx + a.z * cz ? b : a)));
    }
    return sel;
  }

  setActive(on) {
    this.active = on;
    this.root.visible = on;
    const H = this.horse, ud = H.mesh.userData;
    // Corps, crins et bonnet du cheval procédural retirés de l'affichage (toujours animés) ; sellerie conservée.
    const layer = on ? 31 : 0;
    H.mesh.layers.set(layer);
    for (const p of ud.parts || []) if (p !== ud.tack) p.layers.set(layer);
    // Points de jeu : sabots du modèle pour les empreintes et éclaboussures.
    if (on) H.hoofAt = (i, out) => this.soleWorld(i, out);
    else {
      if (H.hoofAt) delete H.hoofAt;
      // Sellerie du cheval procédural recalculée pour son équipement et son niveau de détail actuels (index et
      // visibilité, bonnet compris) ; licol à sa place d'origine.
      this._tackKept = null;
      refreshHorseTack(H.mesh);
      const la = H.bones.leadAnchor;
      if (la?.userData.rest) la.position.copy(la.userData.rest);
    }
  }

  // Semelle d'un sabot du modèle (indice du cheval procédural : 0 AG, 1 AD, 2 PG, 3 PD), repère monde.
  soleWorld(i, out = new THREE.Vector3()) {
    const hb = this.hooves[i];
    hb.updateWorldMatrix(true, false);
    return out.copy(SOLE).applyMatrix4(hb.matrixWorld);
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
    for (const L of this.legs) if (L.sc) L.sc.position.copy(this.rest[L.sc.name]);
    H.mesh.updateMatrixWorld(true);
    for (const L of this.legs) this._ik(L);
    // Longe : anneau du licol du modèle (sous la ganache) reporté sur l'ancrage du cheval procédural.
    const la = ours.leadAnchor, tla = B.leadAnchor;
    if (la && tla) {
      tla.getWorldPosition(_v);
      la.position.copy(la.parent.worldToLocal(_v));
      la.updateMatrixWorld(true);
    }
  }

  // IK à deux segments (plan de flexion du membre), deux passes : boulet sur la cible, puis semelle recalée.
  _ik(L) {
    const mesh = this.horse.mesh;
    _m.copy(mesh.matrixWorld).invert();
    // Cible : boulet procédural + écart de repos (repère du cheval).
    _t.copy(L.op.getWorldPosition(_v)).applyMatrix4(_m).add(L.delta);
    for (let pass = 0; pass < 2; pass++) {
      _x.copy(_t).applyMatrix4(mesh.matrixWorld);
      if (L.sc) this._reach(L, _x);
      this._solve(L, _x);
      // Distaux : orientation du cheval procédural.
      for (const [ob, tb] of L.distal) this._copyWorld(ob, tb);
      if (pass) break;
      // Avant/arrière : centre de la sole du modèle sur celui du cheval procédural (repère du cheval ; aplombs latéraux
      // du modèle conservés). Déplacement correspondant (monde), appliqué d'avance aux mesures de hauteur ci-dessous :
      // le sabot du modèle sera là à la seconde passe.
      hoofWorldPosition(this.horse.bones, L.i, _s).applyMatrix4(_m);
      const [ob, hb] = L.distal[1];
      _c.copy(SOLE).applyMatrix4(hb.matrixWorld).applyMatrix4(_m);
      const dz = _s.z - _c.z;
      _t.z += dz;
      _dz.copy(_c).applyMatrix4(mesh.matrixWorld);
      _c.z += dz;
      _dz.subVectors(_c.applyMatrix4(mesh.matrixWorld), _dz);
      // Hauteur : près du sol, point le plus bas du sabot du modèle égal à celui du sabot procédural, chacun mesuré
      // au-dessus du sol sous le centre de sa propre sole (aplombs et dévers propres à chaque sabot ; une marche sous
      // le bord d'un sabot ne se reporte pas sur l'autre) ; en l'air, centre de la sole sur celui du cheval procédural ;
      // fondu entre les deux.
      const gr = this._ground;
      ob.updateWorldMatrix(true, false);
      hoofWorldPosition(this.horse.bones, L.i, _a);
      _b.copy(SOLE).applyMatrix4(hb.matrixWorld).add(_dz);
      const gP = gr(_a.x, _a.z), gT = gr(_b.x, _b.z);
      let pLow = Infinity, tLow = Infinity;
      for (const q of L.procContour) pLow = Math.min(pLow, _v.copy(q).applyMatrix4(ob.matrixWorld).y - gP);
      for (const q of L.contour) tLow = Math.min(tLow, _v.copy(q).applyMatrix4(hb.matrixWorld).y + _dz.y - gT);
      const w = 1 - THREE.MathUtils.smoothstep(pLow, NEAR_GROUND[0], NEAR_GROUND[1]);
      // Correction verticale (monde) reportée dans le repère du cheval.
      _x.copy(_t).applyMatrix4(mesh.matrixWorld);
      _x.y += w * (pLow - tLow) + (1 - w) * (_a.y - _b.y);
      _t.copy(_x).applyMatrix4(_m);
    }
  }

  // Cible au-delà de la portée utile → l'épaule (ou la hanche) se rapproche d'elle de ce qui manque (scMax au plus).
  _reach(L, target) {
    // Décalage recalculé depuis le repos à chaque passe (le plafond porte sur le total).
    const sc = L.sc;
    sc.position.copy(this.rest[sc.name]);
    sc.updateMatrixWorld(true);
    L.A.getWorldPosition(_a);
    L.Bb.getWorldPosition(_b);
    L.E.getWorldPosition(_c);
    const reach = (_a.distanceTo(_b) + _b.distanceTo(_c)) * L.reach;
    const miss = _a.distanceTo(target) - reach;
    if (miss <= 0) return;
    // Monde en mètres (le cheval procédural est déjà à l'échelle réelle).
    const d = Math.min(miss, L.scMax);
    sc.getWorldPosition(_v).addScaledVector(_v2.subVectors(target, _a).normalize(), d);
    sc.position.copy(sc.parent.worldToLocal(_v));
    sc.updateMatrixWorld(true);
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
