// Prototype « rendu réaliste » du cheval (réglage « Modèles 3D : Réalistes ») : le cheval est affiché avec un modèle
// réaliste (« Horse » de Henry S, CC BY 4.0 : poil photographique, crins en mèches, sabots ferrés, selle et filet),
// préparé par scripts/real/build-horse.mjs. Le cheval procédural reste dans la scène et continue d'être animé (pas,
// trot, galop, saut, refus, broute, cabrer) : il est seulement masqué, et chaque image ses os sont recopiés sur le
// squelette du modèle réaliste. La robe de chaque cheval (bai, alezan, gris, noir, balzanes, liste) est appliquée sur
// le détail neutre du poil.
import * as THREE from 'three';
import { resolveCoat } from './horse/coat.js';

// Os du cheval procédural → os du modèle réaliste.
const MAP = [
  ['pelvis', 'BN_Spine_00_02'], ['loin', 'BN_Spine_01_03'], ['body', 'BN_Spine_02_04'], ['body', 'BN_Spine_03_05'],
  ['neck', 'BN_Neck_00_06'], ['neck2', 'BN_Neck_01_07'], ['neck3', 'BN_Neck_02_011'], ['neck3', 'BN_Neck_03_012'],
  ['head', 'BN_Head_00_016'], ['jaw', 'BN_Jaw_027'], ['earL', 'BN_L_Ear_00_023'], ['earR', 'BN_R_Ear_00_025'],
  ['tail', 'BN_Tail_00_061'], ['tail2', 'BN_Tail_01_062'], ['tail3', 'BN_Tail_02_063'], ['tail4', 'BN_Tail_03_064'],
  ['tail5', 'BN_Tail_04_065'],
];
// Antérieurs : le modèle réaliste a un segment de moins (omoplate et bras confondus).
for (const [o, t, T] of [['l', 'L', 'l'], ['r', 'R', 'R']]) {
  const n = t === 'L' ? [38, 39, 40, 41, 42] : [43, 44, 45, 46, 47];
  MAP.push([`f${o}Sc`, `BN_${t}_Clavicle_0${n[0]}`], [`f${o}U`, `BN_${t}_UpperArm_0${n[1]}`], [`f${o}L`, `BN_${T}_Forearm_0${n[2]}`]);
  MAP.push([`f${o}P`, `BN_${t}_Hand_0${n[3]}`], [`f${o}H`, `BN_${t}_Toe_0${n[4]}`]);
  const h = t === 'L' ? ['BN_L_Thing_051', 'BN_L_Calf_052', 'BN_L_HorseLink_053', 'BN_L_Foot_054', 'BN_L_Toe_2_055'] : ['BN_R_Thing_056', 'BN_R_Calf_057', 'BN_R_HorseLink_058', 'BN_R_Foot_00', 'BN_R_Toe_2_059'];
  ['U', 'L', 'C', 'P', 'H'].forEach((s, k) => MAP.push([`h${o}${s}`, h[k]]));
}
// Calage sur la pose de repos du cheval procédural (aplombs, encolure droite) : [os réaliste, enfant réaliste,
// os procédural, enfant procédural], des parents vers les enfants.
// Colonne : « null » = garder la pente du modèle réaliste (sa colonne court à l'horizontale dans le dos, celle du
// cheval procédural descend de la croupe au garrot), seulement redressée dans l'axe (pose d'origine incurvée).
const ALIGN = [
  ['BN_Spine_00_02', 'BN_Spine_01_03', null], ['BN_Spine_01_03', 'BN_Spine_02_04', null],
  ['BN_Spine_02_04', 'BN_Spine_03_05', null], ['BN_Neck_00_06', 'BN_Neck_01_07', 'neck', 'neck2'],
  ['BN_Neck_01_07', 'BN_Neck_02_011', 'neck2', 'neck3'], ['BN_Neck_02_011', 'BN_Neck_03_012', 'neck3', 'head'],
  ['BN_Neck_03_012', 'BN_Head_00_016', 'neck3', 'head'], ['BN_Head_00_016', 'BN_Head_01_029', 'head', 'leadAnchor'],
];
for (const [o, t, T] of [['l', 'L', 'l'], ['r', 'R', 'R']]) {
  const n = t === 'L' ? [38, 39, 40, 41, 42] : [43, 44, 45, 46, 47];
  const b = [`BN_${t}_Clavicle_0${n[0]}`, `BN_${t}_UpperArm_0${n[1]}`, `BN_${T}_Forearm_0${n[2]}`, `BN_${t}_Hand_0${n[3]}`, `BN_${t}_Toe_0${n[4]}`];
  const f = [`f${o}Sc`, `f${o}U`, `f${o}L`, `f${o}P`, `f${o}H`];
  // Omoplate : inclinaison naturelle du modèle réaliste (le segment procédural omoplate + humérus est presque vertical).
  ALIGN.push([b[0], b[1], null]);
  for (let k = 1; k < 4; k++) ALIGN.push([b[k], b[k + 1], f[k], f[k + 1]]);
  const h = t === 'L' ? ['BN_L_Thing_051', 'BN_L_Calf_052', 'BN_L_HorseLink_053', 'BN_L_Foot_054', 'BN_L_Toe_2_055'] : ['BN_R_Thing_056', 'BN_R_Calf_057', 'BN_R_HorseLink_058', 'BN_R_Foot_00', 'BN_R_Toe_2_059'];
  const g = [`h${o}U`, `h${o}L`, `h${o}C`, `h${o}P`, `h${o}H`];
  for (let k = 0; k < 4; k++) ALIGN.push([h[k], h[k + 1], g[k], g[k + 1]]);
}
for (let k = 0; k < 4; k++) ALIGN.push([`BN_Tail_0${k}_06${1 + k}`, `BN_Tail_0${k + 1}_06${2 + k}`, k ? `tail${k + 1}` : 'tail', `tail${k + 2}`]);

// Membres : pose recopiée, puis IK à deux articulations (os A, os B, os du boulet) pour poser le boulet réaliste à
// l'endroit du boulet procédural (sabots au même endroit sur le sol, quelle que soit la longueur des segments).
const LEGS = [
  ['BN_L_UpperArm_039', 'BN_l_Forearm_040', 'BN_L_Hand_041', 'flP', ['BN_L_Hand_041', 'BN_L_Toe_042']],
  ['BN_R_UpperArm_044', 'BN_R_Forearm_045', 'BN_R_Hand_046', 'frP', ['BN_R_Hand_046', 'BN_R_Toe_047']],
  ['BN_L_Calf_052', 'BN_L_HorseLink_053', 'BN_L_Foot_054', 'hlP', ['BN_L_Foot_054', 'BN_L_Toe_2_055']],
  ['BN_R_Calf_057', 'BN_R_HorseLink_058', 'BN_R_Foot_00', 'hrP', ['BN_R_Foot_00', 'BN_R_Toe_2_059']],
];
// Articulation du sabot réaliste au-dessus de la semelle (mètres du modèle).
const HOOF_H = 0.094;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const WHITE = new THREE.Color('#e9e6df');

// Robe : détail neutre du poil × couleur du cheval, extrémités, bout du nez, balzanes, liste, sabots.
function coatMaterial(mat, coat, mk) {
  const c = resolveCoat(coat);
  const sock = (mk?.sockH || [0, 0, 0, 0]).map((h) => (h ? Math.min(0.42, 0.06 + h * 0.85) : 0));
  const U = {
    uBody: { value: c.body.clone() },
    uLegs: { value: c.legs.clone() },
    uMuzzle: { value: c.muzzle.clone() },
    uHoof: { value: c.hoof.clone() },
    uWhite: { value: WHITE.clone() },
    uSocks: { value: new THREE.Vector4(...sock) },
    uPoints: { value: Math.max(c.points, 0.35) },
    uBlaze: { value: mk?.blaze?.[0] > 0 ? 1 : 0 },
  };
  mat.roughness = 0.62;
  mat.metalness = 0;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 _coat;\nvarying vec4 vCoat;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCoat = _coat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBody, uLegs, uMuzzle, uHoof, uWhite;\nuniform vec4 uSocks;\nuniform float uPoints, uBlaze;\nvarying vec4 vCoat;')
      .replace(
        '#include <map_fragment>',
        `vec4 sd = texture2D( map, vMapUv );
        float h = vCoat.x;
        float leg = floor( vCoat.w * 4.0 + 0.5 );
        vec3 cc = mix( uBody, uLegs, uPoints * smoothstep( 0.62, 0.40, h ) );
        cc = mix( cc, uMuzzle, vCoat.y );
        float sock = leg < 0.5 ? 0.0 : leg < 1.5 ? uSocks.x : leg < 2.5 ? uSocks.y : leg < 3.5 ? uSocks.z : uSocks.w;
        cc = mix( cc, uWhite, step( 0.01, sock ) * smoothstep( sock + 0.025, sock - 0.025, h ) );
        cc = mix( cc, uWhite, vCoat.z * uBlaze );
        cc = mix( cc, uHoof, smoothstep( 0.1, 0.075, h ) );
        diffuseColor.rgb *= mix( sd.rgb, cc * sd.rgb * 2.0, sd.a );`,
      );
  };
  mat.customProgramCacheKey = () => 'realHorseCoat';
  mat.needsUpdate = true;
  return { U, mane: c.mane };
}

export class RealHorse {
  constructor(horse, root) {
    this.horse = horse;
    this.root = root;
    this.bones = {};
    this.parts = {};
    this.mats = [];
    const mk = horse.mesh.userData.markings;
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      this.parts[o.name] = o;
      // Robe et crins propres à ce cheval (textures partagées).
      if (o.material.name === 'Horse' || o.material.name === 'Hair') this.mats.push((o.material = o.material.clone()));
      const m = o.material;
      if (m.name === 'Horse') this.coat = coatMaterial(m, horse.def.coat, mk);
      else if (m.name === 'Hair') {
        m.alphaTest = 0.5;
        m.alphaToCoverage = true;
        m.transparent = false;
        m.side = THREE.DoubleSide;
        m.roughness = 0.55;
        this.hair = m;
      } else if (m.name === 'Cornea') {
        m.color.set('#1b130d');
        m.roughness = 0.06;
        m.metalness = 0;
      }
    });
    if (this.hair && this.coat) this.hair.color.copy(this.coat.mane).multiplyScalar(1.5);
    this.skinned = Object.values(this.parts).find((o) => o.isSkinnedMesh);
    horse.mesh.add(root);
    this._calibrate();
    this.setActive(true);
  }

  // Calage : modèle réaliste à la taille du cheval procédural (hanche → sabot), aplombs du
  // cheval procédural, puis décalage de rotation mémorisé pour chaque paire d'os.
  _calibrate() {
    const H = this.horse, ours = H.bones;
    const saved = {};
    for (const [n, b] of Object.entries(ours)) {
      saved[n] = [b.quaternion.clone(), b.position.clone(), b.scale.clone()];
      b.quaternion.identity();
      b.scale.set(1, 1, 1);
      if (b.userData.rest) b.position.copy(b.userData.rest);
    }
    // Pose des nœuds du fichier (en mètres, debout ; la pose de liaison du fichier est dans un autre repère).
    this.root.position.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    H.mesh.updateMatrixWorld(true);
    const pos = (o, out = new THREE.Vector3()) => this.root.worldToLocal(o.getWorldPosition(out));
    // Taille : hauteur de la hanche au-dessus du sabot postérieur.
    const B = this.bones;
    const theirH = pos(B.BN_L_Thing_051).y - pos(B.BN_L_Toe_2_055).y;
    const ourH = pos(ours.hlU).y - pos(ours.hlH).y;
    this.root.scale.setScalar(ourH / theirH);
    H.mesh.updateMatrixWorld(true);
    this.root.getWorldQuaternion(_rootQ).invert();
    const rel = (o, out) => o.getWorldQuaternion(out).premultiply(_rootQ);
    for (const [t, tc, o, oc] of ALIGN) {
      const tb = B[t], tcb = B[tc];
      if (!tb || !tcb || (o && (!ours[o] || !ours[oc]))) continue;
      const dT = pos(tcb).sub(pos(tb));
      const dO = o ? pos(ours[oc]).sub(pos(ours[o])) : dT.clone().setX(0);
      const world = rel(tb, _q2).premultiply(_q.setFromUnitVectors(dT.normalize(), dO.normalize()));
      tb.quaternion.copy(rel(tb.parent, new THREE.Quaternion()).invert().multiply(world));
      tb.updateMatrixWorld(true);
    }
    // Position : semelles au sol du cheval procédural (articulation du sabot réaliste à 9,4 cm de la semelle),
    // hanches et coudes à l'aplomb des siens.
    const meshPos = (o) => H.mesh.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const k = this.root.scale.x;
    const tMid = meshPos(B.BN_L_Thing_051).add(meshPos(B.BN_L_UpperArm_039)).multiplyScalar(0.5);
    const oMid = meshPos(ours.hlU).add(meshPos(ours.flU)).multiplyScalar(0.5);
    this.root.position.z = oMid.z - tMid.z;
    // Membres antérieurs du modèle réaliste un peu plus longs : avant-main relevée de ce qu'il faut pour que les
    // quatre sabots touchent le sol, membres tendus (cheval légèrement « montant »).
    const hoofY = (a, b) => (meshPos(B[a]).y + meshPos(B[b]).y) / 2;
    for (let i = 0; i < 3; i++) {
      this.root.position.y += HOOF_H * k - hoofY('BN_L_Toe_2_055', 'BN_R_Toe_2_059');
      H.mesh.updateMatrixWorld(true);
      const lift = HOOF_H * k - hoofY('BN_L_Toe_042', 'BN_R_Toe_047');
      if (Math.abs(lift) < 0.002) break;
      const sp = B.BN_Spine_00_02;
      const dz = meshPos(B.BN_L_UpperArm_039).z - meshPos(sp).z;
      this._rotateWorld(sp, _q.setFromAxisAngle(_n.set(1, 0, 0).transformDirection(H.mesh.matrixWorld), -Math.atan2(lift, dz)));
      H.mesh.updateMatrixWorld(true);
    }
    // IK : décalage (repère du cheval) entre le boulet procédural et le boulet réaliste, sabot relevé ou abaissé
    // pour que la semelle touche le sol.
    this.legs = [];
    for (const [a, b, e, op, distal] of LEGS) {
      const hoof = B[distal[1]];
      const lift = HOOF_H * k - meshPos(hoof).y;
      const delta = meshPos(B[e]).sub(meshPos(ours[op])).add(_v.set(0, lift, 0));
      this.legs.push({ A: B[a], Bb: B[b], E: B[e], op: ours[op], delta, distal: null, sign: /^f/.test(op) ? -1 : 1 });
    }
    this.map = [];
    for (const [o, t] of MAP) {
      const ob = ours[o], tb = B[t];
      if (!ob || !tb) continue;
      const offset = rel(ob, new THREE.Quaternion()).invert().multiply(rel(tb, new THREE.Quaternion()));
      this.map.push({ ob, tb, offset });
    }
    for (const L of this.legs) L.distal = LEGS.find((d) => d[2] === L.E.name)[4].map((n) => this.map.find((m) => m.tb.name === n)).filter(Boolean);
    // Hanches : déplacement du bassin procédural (repos → courant) reporté sur la racine du squelette réaliste.
    this.pelvisRest = pos(ours.pelvis);
    this.spineRef = pos(B.BN_Spine_00_02);
    for (const [n, b] of Object.entries(ours)) {
      b.quaternion.copy(saved[n][0]);
      b.position.copy(saved[n][1]);
      b.scale.copy(saved[n][2]);
    }
    H.mesh.updateMatrixWorld(true);
  }

  setActive(on) {
    this.active = on;
    this.root.visible = on;
    // Cheval procédural (corps, crins, sellerie) retiré de l'affichage mais toujours animé.
    const layer = on ? 31 : 0;
    this.horse.mesh.layers.set(layer);
    for (const p of this.horse.mesh.userData.parts || []) p.layers.set(layer);
  }

  // Recopie de la pose courante (après l'animation du cheval procédural, avant le rendu).
  update() {
    const H = this.horse;
    if (!this.active || !H.mesh.visible) return;
    // Sellerie : selle et filet si le cheval est sellé.
    const saddled = H.mesh.userData.tack?.userData.cfg?.saddle !== false;
    for (const [name, p] of Object.entries(this.parts)) if (/Saddle1|Bridle/.test(name)) p.visible = saddled;
    H.mesh.updateMatrixWorld(true);
    this.root.getWorldQuaternion(_rootQ).invert();
    const sp = this.bones.BN_Spine_00_02;
    this.root.worldToLocal(H.bones.pelvis.getWorldPosition(_v)).sub(this.pelvisRest).add(this.spineRef);
    sp.parent.worldToLocal(this.root.localToWorld(_v));
    sp.position.copy(_v);
    for (const m of this.map) this._copy(m);
    for (const L of this.legs) this._ik(L);
  }

  _copy({ ob, tb, offset }) {
    ob.getWorldQuaternion(_q).premultiply(_rootQ).multiply(offset);
    tb.parent.getWorldQuaternion(_q2).premultiply(_rootQ).invert();
    tb.quaternion.copy(_q2.multiply(_q));
    tb.updateMatrixWorld(true);
  }

  // Rotation monde appliquée à un os (convertie dans le repère de son parent).
  _rotateWorld(bone, q) {
    bone.getWorldQuaternion(_q2).premultiply(q);
    bone.parent.getWorldQuaternion(_q).invert();
    bone.quaternion.copy(_q.multiply(_q2));
    bone.updateMatrixWorld(true);
  }

  // IK analytique à deux segments dans le plan de flexion courant, puis canon/paturon/sabot réorientés comme ceux du
  // cheval procédural.
  _ik(L) {
    const mesh = this.horse.mesh;
    _t.copy(L.op.getWorldPosition(_v)).applyMatrix4(_m.copy(mesh.matrixWorld).invert()).add(L.delta).applyMatrix4(mesh.matrixWorld);
    L.A.getWorldPosition(_a);
    L.Bb.getWorldPosition(_b);
    L.E.getWorldPosition(_c);
    const lab = _a.distanceTo(_b), lbc = _b.distanceTo(_c);
    const lat = THREE.MathUtils.clamp(_a.distanceTo(_t), Math.abs(lab - lbc) + 1e-4, lab + lbc - 1e-4);
    // Flexion dans le plan sagittal : axe transversal du cheval, sens anatomique (genou : canon vers l'arrière ;
    // jarret : canon vers l'avant), angle signé autour de cet axe.
    const u = _v.subVectors(_a, _b), w = _v2.subVectors(_c, _b);
    _n.set(L.sign, 0, 0).transformDirection(mesh.matrixWorld);
    const phi = Math.atan2(_n.dot(_c.clone().crossVectors(u, w)), u.dot(w));
    const th1 = Math.acos(THREE.MathUtils.clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
    this._rotateWorld(L.Bb, _q.setFromAxisAngle(_n, th1 - phi));
    L.E.getWorldPosition(_c);
    this._rotateWorld(L.A, _q.setFromUnitVectors(_v.subVectors(_c, _a).normalize(), _v2.subVectors(_t, _a).normalize()));
    for (const m of L.distal) this._copy(m);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.setActive(false);
    this.root.visible = false;
    for (const m of this.mats) m.dispose();
  }
}
