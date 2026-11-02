// Bonnet anti-mouches du cheval et tête de cheval de présentation (boutique d'équitation).
// - Bonnet : coque ajustée sur la tête, tirée du maillage du cheval (oreilles, nuque et front jusqu'au-dessus des
//   yeux) : mêmes sommets décalés le long des normales, mêmes poids de peau — il suit les oreilles et la tête sans
//   rien recalculer. Couleur principale et cordon de finition (bords) ; porté quand le cheval est sellé.
// - Tête de présentation : la tête et le haut de l'encolure du même maillage, coupés selon un plan perpendiculaire à
//   l'encolure (posée sur un socle), en géométrie statique, avec son bonnet (même sélection).
import * as THREE from 'three';
import { horseAssets } from './assets.js';
import { BONE_INDEX } from './skeleton.js';
import { addCloudShadows } from '../../world/sky.js';

const EARS = [BONE_INDEX.earL, BONE_INDEX.earR];
const HEADISH = new Set(['head', 'earL', 'earR', 'jaw', 'lidL', 'lidR', 'neck3', 'neck2'].map((n) => BONE_INDEX[n]));
// Décalage le long des normales (m, unités du modèle) : sur les oreilles (cônes tricotés), sur le crâne.
const OFF_EAR = 0.011, OFF_CROWN = 0.006;

function dominant(B, i) {
  let best = -1, bw = 0;
  for (let k = 0; k < 4; k++) {
    const w = B.skinW[i * 4 + k];
    if (w > bw) {
      bw = w;
      best = B.skinI[i * 4 + k];
    }
  }
  return best;
}

// Sélection du bonnet (unités du modèle) : 2 = oreille, 1 = crâne (nuque et front au-dessus des yeux), 0 = hors bonnet ;
// cordon : bords du bonnet (bas du front, nuque, base des côtés).
let SEL = null;
function selection() {
  if (SEL) return SEL;
  const A = horseAssets(), B = A.body;
  const nv = B.rest.length / 3;
  const kind = new Uint8Array(nv);
  const trim = new Uint8Array(nv);
  const head = BONE_INDEX.head;
  for (let i = 0; i < nv; i++) {
    const d = dominant(B, i);
    const y = B.rest[i * 3 + 1], z = B.rest[i * 3 + 2];
    if (EARS.includes(d)) kind[i] = 2;
    else if (d === head && y > 2.0 && z > 1.15 && z < 1.47) {
      kind[i] = 1;
      trim[i] = y < 2.03 || z > 1.44 || z < 1.18 ? 1 : 0;
    }
  }
  // Triangles du niveau de détail proche dont les trois sommets sont dans le bonnet.
  const idx = B.index.array, [s0, n0] = B.lod[0];
  const tris = [];
  for (let t = s0; t < s0 + n0; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (kind[a] && kind[b] && kind[c]) tris.push(a, b, c);
  }
  // Renumérotation des sommets utilisés.
  const map = new Int32Array(nv).fill(-1);
  const verts = [];
  for (const v of tris) if (map[v] < 0) map[v] = verts.push(v) - 1;
  SEL = { verts, index: tris.map((v) => map[v]), kind, trim };
  return SEL;
}

// Positions décalées (unités du modèle) des sommets du bonnet.
function shellPositions() {
  const B = horseAssets().body;
  const { verts, kind } = selection();
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, j) => {
    const off = kind[v] === 2 ? OFF_EAR : OFF_CROWN;
    for (let k = 0; k < 3; k++) pos[j * 3 + k] = B.rest[v * 3 + k] + B.restNormal[v * 3 + k] * off;
  });
  return pos;
}

function shellColors(color, trimColor) {
  const { verts, trim } = selection();
  const c1 = new THREE.Color(color), c2 = new THREE.Color(trimColor || color);
  const col = new Float32Array(verts.length * 3);
  verts.forEach((v, j) => (trim[v] ? c2 : c1).toArray(col, j * 3));
  return col;
}

// Attributs partagés du bonnet porté (position, normale, poids de peau, indices).
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const B = horseAssets().body;
  const { verts, index } = selection();
  const n = verts.length;
  const nor = new Float32Array(n * 3), si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
  verts.forEach((v, j) => {
    for (let k = 0; k < 3; k++) nor[j * 3 + k] = B.restNormal[v * 3 + k];
    for (let k = 0; k < 4; k++) {
      si[j * 4 + k] = B.skinI[v * 4 + k];
      sw[j * 4 + k] = B.skinW[v * 4 + k];
    }
  });
  SHARED = {
    position: new THREE.BufferAttribute(shellPositions(), 3),
    normal: new THREE.BufferAttribute(nor, 3),
    skinIndex: new THREE.BufferAttribute(si, 4),
    skinWeight: new THREE.BufferAttribute(sw, 4, true),
    index: new THREE.BufferAttribute(new Uint16Array(index), 1),
  };
  return SHARED;
}

const colorCache = new Map();
// Géométrie du bonnet porté : { color, trim } (couleurs sRGB). Attributs partagés, couleurs par article.
export function bonnetGeometry({ color = '#1f2b45', trim = '#f2f1ec' } = {}) {
  const S = shared();
  const key = color + trim;
  if (!colorCache.has(key)) colorCache.set(key, new THREE.BufferAttribute(shellColors(color, trim), 3));
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(k, S[k]);
  g.setAttribute('color', colorCache.get(key));
  g.setIndex(S.index);
  // Libération : attributs partagés préservés (voir safeDispose dans mesh.js).
  g.dispose = function () {
    for (const k of Object.keys(this.attributes)) this.deleteAttribute(k);
    this.setIndex(null);
    THREE.BufferGeometry.prototype.dispose.call(this);
  };
  return g;
}

let MAT = null;
// Matériau du bonnet (coton tricoté) : éclairé par le lampadaire ou le plafonnier proche, comme le cheval.
export function bonnetMaterial() {
  if (MAT) return MAT;
  MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  MAT.onBeforeCompile = (sh) => addCloudShadows(sh, null, true);
  MAT.customProgramCacheKey = () => 'horse-bonnet-1';
  return MAT;
}

// ---------- Tête de cheval de présentation ----------
// Repère de la tête : section de l'encolure à y = 0 (posée sur un socle), chanfrein vers +z, taille réelle.
let BUST = null;
function bustFrame() {
  const A = horseAssets();
  const bone = (n) => new THREE.Vector3(...A.bones.find((b) => b.name === n).pos);
  // Plan de coupe : au milieu de l'encolure haute (neck2 → neck3), perpendiculaire à son axe.
  const n2 = bone('neck2'), n3 = bone('neck3');
  const c = n2.clone().lerp(n3, 0.55);
  const axis = n3.clone().sub(n2).normalize();
  const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0)));
  m.multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  m.premultiply(new THREE.Matrix4().makeScale(0.94, 0.94, 0.94));
  return { c, axis, m };
}

// { body, eyes, bonnet(colors) } : géométries statiques (position, normale, indices) dans le repère de la tête.
export function horseBust() {
  if (BUST) return BUST;
  const A = horseAssets(), B = A.body;
  const { c, axis, m } = bustFrame();
  const nv = B.rest.length / 3;
  const keep = new Uint8Array(nv);
  const p = new THREE.Vector3();
  for (let i = 0; i < nv; i++) {
    p.fromArray(B.rest, i * 3);
    if (HEADISH.has(dominant(B, i)) && p.sub(c).dot(axis) > -0.01) keep[i] = 1;
  }
  const idx = B.index.array, [s0, n0] = B.lod[0];
  const body = [], eyes = [];
  for (let t = s0; t < s0 + n0; t += 3) {
    const a = idx[t], b = idx[t + 1], cc = idx[t + 2];
    if (!(keep[a] && keep[b] && keep[cc])) continue;
    (B.eye[a] > 100 || B.eye[b] > 100 || B.eye[cc] > 100 ? eyes : body).push(a, b, cc);
  }
  const make = (tris, posArr = B.rest, norArr = B.restNormal, vertsOf = null) => {
    const map = new Map();
    const verts = [];
    for (const v of tris) if (!map.has(v)) map.set(v, verts.push(v) - 1);
    const pos = new Float32Array(verts.length * 3), nor = new Float32Array(verts.length * 3);
    verts.forEach((v, j) => {
      const src = vertsOf ? vertsOf(v) : v;
      for (let k = 0; k < 3; k++) {
        pos[j * 3 + k] = posArr[src * 3 + k];
        nor[j * 3 + k] = norArr[src * 3 + k];
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(tris.map((v) => map.get(v)));
    g.applyMatrix4(m);
    return g;
  };
  // Bonnet de la tête : la même coque (positions décalées), dans le repère de la tête.
  const sel = selection();
  const shell = shellPositions();
  const bonnetBase = new THREE.BufferGeometry();
  const nor = new Float32Array(sel.verts.length * 3);
  sel.verts.forEach((v, j) => {
    for (let k = 0; k < 3; k++) nor[j * 3 + k] = B.restNormal[v * 3 + k];
  });
  bonnetBase.setAttribute('position', new THREE.BufferAttribute(shell.slice(), 3));
  bonnetBase.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  bonnetBase.setIndex(sel.index.slice());
  bonnetBase.applyMatrix4(m);
  BUST = {
    body: make(body),
    eyes: make(eyes),
    bonnet: bonnetBase,
    // Sommets du cordon du bonnet (1) : peinture en deux couleurs.
    trimMask: Float32Array.from(sel.verts, (v) => sel.trim[v]),
  };
  return BUST;
}
