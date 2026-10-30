// Portière cabine articulée, préparée au chargement à partir d'un modèle fourni où elle fait corps avec la carrosserie
// (van Master, camion Scania) : les triangles de la peau extérieure situés dans le contour réel de la portière (relevé
// sur le fichier, plan du flanc) en sont détachés par découpage exact — les triangles à cheval sur le contour sont
// coupés, sommets, normales, UV et couleurs interpolés — puis accrochés à un pivot posé sur l'axe des charnières.
// Matériaux, vitres et détails du fichier sont conservés ; le fichier lui-même n'est pas modifié (empreinte inchangée).
// L'ouverture laissée dans la caisse donne sur l'habitacle du fichier ; une doublure (faces retournées, matière
// d'habillage) habille l'intérieur de la portière et, au besoin, les parois de la cabine vues de l'intérieur.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

// Polygone convexe (u = z, v = y du repère de la caisse) mis dans le sens trigonométrique.
function ccw(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [u0, v0] = poly[i], [u1, v1] = poly[(i + 1) % poly.length];
    a += u0 * v1 - u1 * v0;
  }
  return a < 0 ? poly.slice().reverse() : poly;
}

// Découpe d'un polygone (sommets : poids barycentriques [w0, w1, w2] du triangle d'origine) par le demi-plan
// « à gauche de l'arête (a → b) » (garde) ou son complémentaire.
function clipHalf(poly, P, a, b, keepInside) {
  const out = [];
  const side = (w) => {
    const u = w[0] * P[0].z + w[1] * P[1].z + w[2] * P[2].z;
    const v = w[0] * P[0].y + w[1] * P[1].y + w[2] * P[2].y;
    const s = (b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0]);
    return keepInside ? s : -s;
  };
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const sa = side(A), sb = side(B);
    if (sa >= 0) out.push(A);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
    }
  }
  return out.length >= 3 ? out : null;
}

// Triangle (P en repère de la caisse) → morceaux dans les polygones (portière) et hors des polygones (caisse).
function splitTriangle(P, polys) {
  let outside = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]];
  const inside = [];
  for (const C of polys) {
    const next = [];
    for (const piece of outside) {
      let cur = piece;
      for (let j = 0; j < C.length && cur; j++) {
        const a = C[j], b = C[(j + 1) % C.length];
        const o = clipHalf(cur, P, a, b, false);
        if (o) next.push(o);
        cur = clipHalf(cur, P, a, b, true);
      }
      if (cur) inside.push(cur);
    }
    outside = next;
  }
  return { inside, outside };
}

// Géométrie : sommets repris (poids barycentriques) des triangles listés.
class GeoBuilder {
  constructor(geo) {
    this.src = geo;
    this.names = Object.keys(geo.attributes);
    this.data = {};
    for (const n of this.names) this.data[n] = [];
  }
  addPoly(tri, poly, flip = false) {
    // éventail : (0, i, i + 1)
    for (let i = 1; i + 1 < poly.length; i++) {
      const order = flip ? [poly[0], poly[i + 1], poly[i]] : [poly[0], poly[i], poly[i + 1]];
      for (const w of order) this._vertex(tri, w, flip);
    }
  }
  _vertex(tri, w, flip) {
    for (const n of this.names) {
      const a = this.src.attributes[n], d = this.data[n], s = a.itemSize;
      for (let c = 0; c < s; c++) {
        let v = 0;
        for (let k = 0; k < 3; k++) v += w[k] * a.getComponent(tri[k], c);
        d.push(n === 'normal' && flip ? -v : v);
      }
      if (n === 'normal') {
        const L = d.length;
        const l = Math.hypot(d[L - 3], d[L - 2], d[L - 1]) || 1;
        d[L - 3] /= l;
        d[L - 2] /= l;
        d[L - 1] /= l;
      }
    }
  }
  get count() {
    return this.data.position.length / 3;
  }
  build() {
    const g = new THREE.BufferGeometry();
    for (const n of this.names) {
      const a = this.src.attributes[n];
      g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(this.data[n]), a.itemSize, a.normalized));
    }
    return g;
  }
}

/**
 * frame : repère de référence (caisse du véhicule, x à gauche, y en haut, z vers l'avant) ; meshes : maillages de la
 * peau extérieure à découper. opts : polys (polygones convexes [z, y] du contour, réunis), xMin / xMax (épaisseur de
 * la peau concernée, repère frame), hinge { x, z } (axe vertical des charnières), lining (matière de la doublure),
 * linePolys (zones de cabine à doubler, mêmes conventions, sans limite en x), name.
 * Renvoie { pivot, meshes, tris } : le pivot (enfant de frame) tourne autour de Y.
 */
export function cutDoor(frame, meshes, { polys, xMin, xMax = Infinity, hinge, lining = null, name = 'cab_door', parent = frame }) {
  const C = polys.map(ccw);
  frame.updateMatrixWorld(true);
  _inv.copy(frame.matrixWorld).invert();
  // Pivot sur l'axe des charnières (repère frame), accroché à `parent` (frame, ou un modèle retirable).
  const pivot = new THREE.Group();
  pivot.name = `${name}_pivot`;
  parent.updateMatrixWorld(true);
  new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(frame.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(hinge.x, 0, hinge.z)).decompose(pivot.position, pivot.quaternion, pivot.scale);
  parent.add(pivot);
  pivot.updateMatrixWorld(true);
  const toPivot = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const out = [];
  let moved = 0;
  // Boîte englobante des contours (rejet rapide).
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const poly of C) for (const [u, v] of poly) (u0 = Math.min(u0, u)), (u1 = Math.max(u1, u)), (v0 = Math.min(v0, v)), (v1 = Math.max(v1, v));
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    mesh.updateMatrixWorld(true);
    _m.multiplyMatrices(_inv, mesh.matrixWorld); // maillage → caisse
    const pos = geo.attributes.position;
    const idx = geo.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    const keep = [];
    const door = new GeoBuilder(geo), body = new GeoBuilder(geo);
    const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let t = 0; t < triCount; t++) {
      const tri = [0, 1, 2].map((k) => (idx ? idx.getX(3 * t + k) : 3 * t + k));
      let skip = false;
      for (let k = 0; k < 3; k++) {
        P[k].fromBufferAttribute(pos, tri[k]).applyMatrix4(_m);
        if (P[k].x < xMin || P[k].x > xMax) skip = true;
      }
      const tu0 = Math.min(P[0].z, P[1].z, P[2].z), tu1 = Math.max(P[0].z, P[1].z, P[2].z);
      const tv0 = Math.min(P[0].y, P[1].y, P[2].y), tv1 = Math.max(P[0].y, P[1].y, P[2].y);
      if (skip || tu1 < u0 || tu0 > u1 || tv1 < v0 || tv0 > v1) {
        keep.push(tri);
        continue;
      }
      const { inside, outside } = splitTriangle(P, C);
      if (!inside.length) {
        keep.push(tri);
        continue;
      }
      for (const poly of inside) door.addPoly(tri, poly);
      for (const poly of outside) body.addPoly(tri, poly);
    }
    if (!door.count) continue;
    moved += door.count / 3;
    // Caisse : triangles intacts (indices d'origine) + morceaux restants (sommets ajoutés).
    const rest = body.build();
    const base = pos.count;
    const g2 = new THREE.BufferGeometry();
    for (const n of Object.keys(geo.attributes)) {
      const a = geo.attributes[n];
      const add = rest.attributes[n];
      const arr = new Float32Array((base + (add ? add.count : 0)) * a.itemSize);
      for (let i = 0; i < base; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
      if (add) arr.set(add.array, base * a.itemSize);
      g2.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    }
    const index = [];
    for (const tri of keep) index.push(tri[0], tri[1], tri[2]);
    for (let i = 0; i < (rest.attributes.position?.count || 0); i++) index.push(base + i);
    g2.setIndex(index);
    g2.computeBoundingSphere();
    mesh.geometry = g2;
    // Portière : géométrie dans le repère du pivot.
    const dg = door.build();
    dg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toPivot, mesh.matrixWorld));
    dg.computeBoundingSphere();
    const dm = new THREE.Mesh(dg, mesh.material);
    dm.name = `${name}__${mesh.material.name || mesh.name}`;
    dm.castShadow = mesh.castShadow;
    dm.receiveShadow = mesh.receiveShadow;
    dm.renderOrder = mesh.renderOrder;
    pivot.add(dm);
    out.push(dm);
    // Doublure : face intérieure de la portière (les maillages du fichier n'ont qu'une face).
    if (lining && !mesh.material.transparent) {
      const lb = new GeoBuilder(dg);
      for (let t = 0; t < dg.attributes.position.count / 3; t++) lb.addPoly([3 * t, 3 * t + 1, 3 * t + 2], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], true);
      const lm = new THREE.Mesh(lb.build(), lining);
      lm.name = `${name}__lining`;
      lm.receiveShadow = true;
      pivot.add(lm);
      out.push(lm);
    } else if (mesh.material.transparent && mesh.material.side !== THREE.DoubleSide) {
      const m2 = mesh.material.clone();
      m2.side = THREE.DoubleSide;
      dm.material = m2;
    }
  }
  // Angle d'ouverture (rad, autour de l'axe vertical des charnières), composé avec l'orientation de base du pivot.
  const q0 = pivot.quaternion.clone(), qa = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const set = (a) => pivot.quaternion.copy(q0).multiply(qa.setFromAxisAngle(Y, a));
  return { pivot, meshes: out, tris: moved, set };
}

// Doublure d'une cabine : faces retournées des triangles de la peau extérieure situés dans la boîte (repère frame),
// pour que l'habitacle vu par la portière ouverte ait des parois (et non une vue au travers de la caisse).
export function lineCab(frame, meshes, box, material, name = 'cab_lining') {
  frame.updateMatrixWorld(true);
  _inv.copy(frame.matrixWorld).invert();
  const group = new THREE.Group();
  group.name = name;
  frame.add(group);
  const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let n = 0;
  for (const mesh of meshes) {
    if (mesh.material.transparent) continue;
    const geo = mesh.geometry;
    mesh.updateMatrixWorld(true);
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    const pos = geo.attributes.position, idx = geo.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    const b = new GeoBuilder(geo);
    for (let t = 0; t < triCount; t++) {
      const tri = [0, 1, 2].map((k) => (idx ? idx.getX(3 * t + k) : 3 * t + k));
      let inBox = true;
      for (let k = 0; k < 3 && inBox; k++) {
        P[k].fromBufferAttribute(pos, tri[k]).applyMatrix4(_m);
        inBox = P[k].x >= box.x0 && P[k].x <= box.x1 && P[k].y >= box.y0 && P[k].y <= box.y1 && P[k].z >= box.z0 && P[k].z <= box.z1;
      }
      if (inBox) b.addPoly(tri, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], true);
    }
    if (!b.count) continue;
    const g = b.build();
    g.applyMatrix4(_m);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    group.add(m);
    n += b.count / 3;
  }
  return { group, tris: n };
}
