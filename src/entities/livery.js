// Habillage STX des carrosseries (camion Scania, van Master) : décor projeté sur la carrosserie réelle aux
// emplacements de src/partners/liveries.js — logo officiel STX s'il est autorisé et fourni, habillage neutre sinon.
//
// Rendu : pour chaque emplacement, un projecteur DecalGeometry (three.js) découpe les triangles extérieurs du maillage
// de carrosserie visé (face tournée vers l'extérieur, au droit du panneau) : le décor reprend exactement la surface du
// modèle (et ses normales, donc son éclairage), décollé de 1,5 mm le long de la normale, avec un décalage de
// profondeur (polygonOffset) contre le scintillement. Matériau PBR du jeu (soleil, ombres reçues, nuages, ciel),
// découpe alpha (alphaTest + alphaToCoverage avec l'antialiasing) : dessiné avec les objets opaques, sans tri de
// transparence. Les deux flancs d'un véhicule forment un seul maillage (un appel de dessin), accroché à la caisse
// suspendue (repère du modèle) : il suit le véhicule, son roulis et son tangage, et disparaît avec lui (élimination
// hors champ sur sa propre sphère englobante, véhicule masqué au loin). Aucune pièce mobile (pont, portes, volets)
// n'est visée. Matériau et textures partagés par tous les véhicules ; rien n'est recalculé image par image : la
// géométrie n'est refaite qu'au changement de contenu (chargement, activation du logo officiel).
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { addCloudShadows } from '../world/sky.js';
import { STX_LIVERY, fitContent, neutralRect, stxSideContent } from '../partners/liveries.js';

// Décollement le long de la normale (m) et profondeur du projecteur (m, de part et d'autre de la face).
const EPS = 0.0015;
const DEPTH = 0.08;
// Matières : filet neutre métallisé comme la peinture ; vinyle imprimé (logo, mire de test) satiné non métallique.
const FINISH = { neutral: { metalness: 0.6, roughness: 0.3 }, vinyl: { metalness: 0, roughness: 0.45 } };

const liveries = new Set();
let material = null;
let content = null;
let neutral = null;
let official = null; // { src, promise } : contenu officiel, chargé une fois par fichier

function sharedMaterial() {
  if (material) return material;
  material = new THREE.MeshStandardMaterial({
    name: 'STX_livery',
    alphaTest: 0.5,
    alphaToCoverage: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  material.onBeforeCompile = (sh) => addCloudShadows(sh);
  material.customProgramCacheKey = () => 'stx-livery';
  return material;
}

// Habillage neutre : double filet graphite (bande, jour, filet), invariant en largeur (étiré sans déformation).
function neutralContent() {
  if (neutral) return neutral;
  const n = STX_LIVERY.neutral;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = H;
  if (n?.kind === 'band') {
    const x = cv.getContext('2d');
    const tot = n.stripe + n.gap + n.line;
    x.fillStyle = n.color;
    x.fillRect(0, 0, 4, Math.round((n.line / tot) * H));
    x.fillRect(0, Math.round(((n.line + n.gap) / tot) * H), 4, H);
  }
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  neutral = { kind: 'neutral', texture, aspect: null, finish: FINISH.neutral, rect: (s) => neutralRect(s, n), keep: true };
  return neutral;
}

// Image (logo officiel, mire de test) : copiée sur une toile de 2 048 px au plus, posée à ses proportions.
function imageContent(img, kind) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  if (!(w0 > 0 && h0 > 0)) throw new Error('image sans dimensions (un SVG doit porter width et height)');
  const k = Math.min(1, 2048 / Math.max(w0, h0));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w0 * k));
  cv.height = Math.max(1, Math.round(h0 * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  const aspect = w0 / h0;
  return { kind, texture, aspect, finish: FINISH.vinyl, rect: (s) => fitContent(s, aspect), keep: kind === 'official' };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`logo STX introuvable : ${src}`));
    img.src = src;
  });
}

// Contenu commun à tous les véhicules (une seule texture, un seul matériau).
function setContent(c) {
  const prev = content;
  content = c;
  const m = sharedMaterial();
  m.map = c.texture;
  m.metalness = c.finish.metalness;
  m.roughness = c.finish.roughness;
  for (const l of liveries) l._build(c);
  if (prev && prev !== c && !prev.keep) prev.texture.dispose();
}

// Contenu prévu par la configuration des marques : neutre, ou logo officiel (neutre le temps du chargement).
function applyBrand() {
  const want = stxSideContent();
  if (want.kind !== 'official') return setContent(neutralContent());
  if (content?.kind !== 'official') setContent(neutralContent());
  if (official?.src !== want.src) {
    // Fichier officiel remplacé : l'ancienne texture est libérée.
    official?.promise.then((c) => content !== c && c.texture.dispose(), () => {});
    official = { src: want.src, promise: loadImage(want.src).then((img) => imageContent(img, 'official')) };
  }
  const { src, promise } = official;
  promise.then(
    (c) => stxSideContent().src === src && content?.kind !== 'test' && content !== c && setContent(c),
    (e) => console.error('Logo officiel STX non chargé : habillage neutre conservé.', e),
  );
}

// Chemin d'un objet jusqu'à un ancêtre : matrice locale cumulée (objet → ancêtre).
function relMatrix(obj, root) {
  const chain = [];
  for (let o = obj; o && o !== root; o = o.parent) chain.push(o);
  const m = new THREE.Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    chain[i].updateMatrix();
    m.multiply(chain[i].matrix);
  }
  return m;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

class VehicleLivery {
  constructor(model, key) {
    this.key = key;
    this.model = model;
    // Repère du modèle, porté par la caisse suspendue (même transformation que le modèle) : hors de l'arbre du
    // fichier (ses matériaux et nœuds restent ceux du modèle fourni).
    this.frame = new THREE.Group();
    this.frame.name = 'stx_livery_frame';
    this.frame.position.copy(model.position);
    this.frame.quaternion.copy(model.quaternion);
    this.frame.scale.copy(model.scale);
    model.parent.add(this.frame);
    this.slots = (STX_LIVERY.vehicles[key] || []).map((cfg) => this._prepare(cfg)).filter(Boolean);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), sharedMaterial());
    this.mesh.name = 'stx_livery';
    this.mesh.castShadow = false; // la caisse porte déjà la même ombre
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.frame.add(this.mesh);
    this.placed = [];
    liveries.add(this);
    if (content) this._build(content);
    else applyBrand();
  }

  // Triangles extérieurs des maillages visés au droit du panneau (repère du modèle), pour le projecteur.
  _prepare(cfg) {
    const sx = cfg.side === 'left' ? -1 : 1; // x_glb = -x
    const n = new THREE.Vector3(sx, 0, 0);
    const z0 = -cfg.panel.z[1] - 0.05, z1 = -cfg.panel.z[0] + 0.05;
    const y0 = cfg.panel.y[0] - 0.05, y1 = cfg.panel.y[1] + 0.05;
    const pos = [], nor = [];
    for (const name of cfg.mesh) {
      const mesh = this.model.getObjectByName(name);
      if (!mesh?.isMesh) continue;
      const m = relMatrix(mesh, this.model);
      const nm = new THREE.Matrix3().getNormalMatrix(m);
      const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, I = g.index;
      const count = I ? I.count : P.count;
      const at = (i) => (I ? I.getX(i) : i);
      for (let t = 0; t < count; t += 3) {
        _a.fromBufferAttribute(P, at(t)).applyMatrix4(m);
        _b.fromBufferAttribute(P, at(t + 1)).applyMatrix4(m);
        _c.fromBufferAttribute(P, at(t + 2)).applyMatrix4(m);
        if (Math.max(_a.z, _b.z, _c.z) < z0 || Math.min(_a.z, _b.z, _c.z) > z1) continue;
        if (Math.max(_a.y, _b.y, _c.y) < y0 || Math.min(_a.y, _b.y, _c.y) > y1) continue;
        const xs = [_a.x * sx, _b.x * sx, _c.x * sx];
        if (Math.max(...xs) < cfg.plane - DEPTH / 2 || Math.min(...xs) > cfg.plane + DEPTH / 2) continue;
        _n.subVectors(_c, _b).cross(_d.subVectors(_a, _b));
        if (_n.lengthSq() < 1e-14 || _n.normalize().dot(n) < 0.7) continue;
        for (const [v, k] of [[_a, t], [_b, t + 1], [_c, t + 2]]) {
          pos.push(v.x, v.y, v.z);
          const q = N ? new THREE.Vector3().fromBufferAttribute(N, at(k)).applyMatrix3(nm).normalize() : _n;
          nor.push(q.x, q.y, q.z);
        }
      }
    }
    if (!pos.length) {
      console.warn(`Habillage STX : emplacement ${cfg.id} sans surface (${cfg.mesh.join(', ')})`);
      return null;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    // Repère du projecteur : X vers la droite du spectateur placé dehors, Y vers le haut, Z vers lui (normale).
    const right = new THREE.Vector3().crossVectors(n.clone().negate(), UP);
    const rot = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, UP, n));
    return { cfg, sx, n, rot, proxy: new THREE.Mesh(geo) };
  }

  // Décor d'un emplacement pour un rectangle { zc, yc, w, h } (repère du jeu) ; écart à la face plane (m).
  _decal(s, r) {
    const p = new THREE.Vector3(s.sx * s.cfg.plane, r.yc, -r.zc);
    const geo = new DecalGeometry(s.proxy, p, s.rot, new THREE.Vector3(r.w, r.h, DEPTH));
    const P = geo.attributes.position.array, N = geo.attributes.normal.array;
    let dev = 0;
    for (let i = 0; i < P.length; i += 3) {
      dev = Math.max(dev, Math.abs(P[i] * s.sx - s.cfg.plane));
      P[i] += N[i] * EPS;
      P[i + 1] += N[i + 1] * EPS;
      P[i + 2] += N[i + 2] * EPS;
    }
    return { geo, dev };
  }

  _build(c) {
    const parts = [];
    this.placed = [];
    for (const s of this.slots) {
      const r = c.rect(s.cfg);
      if (!r) continue;
      const { geo, dev } = this._decal(s, r);
      const tris = geo.attributes.position.count / 3;
      if (tris) parts.push(geo);
      this.placed.push({ id: s.cfg.id, side: s.cfg.side, rect: r, triangles: tris, deviation: dev });
    }
    const out = new THREE.BufferGeometry();
    for (const [k, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[k].array.length, 0));
      let o = 0;
      for (const g of parts) {
        arr.set(g.attributes[k].array, o);
        o += g.attributes[k].array.length;
      }
      out.setAttribute(k, new THREE.BufferAttribute(arr, size));
    }
    for (const g of parts) g.dispose();
    out.computeBoundingBox();
    out.computeBoundingSphere();
    this.mesh.geometry.dispose();
    this.mesh.geometry = out;
    this.mesh.visible = parts.length > 0;
  }

  // État (contrôles et tests) : contenu affiché et emplacements posés.
  get content() {
    return content?.kind ?? null;
  }
  state() {
    return { content: this.content, aspect: content?.aspect ?? null, slots: this.placed.map((p) => ({ ...p, rect: { ...p.rect } })) };
  }
  // Validation du placement par les tests de bout en bout (mire fournie par le test, jamais livrée dans le jeu) :
  // l'image passe par le même chemin que le logo officiel (inscrite à ses proportions) sur tous les véhicules.
  showTestImage(img) {
    setContent(imageContent(img, 'test'));
  }
  // Retour au contenu prévu par la configuration des marques.
  resetContent() {
    applyBrand();
  }
  dispose() {
    liveries.delete(this);
    this.mesh.geometry.dispose();
    for (const s of this.slots) s.proxy.geometry.dispose();
    this.frame.removeFromParent();
  }
}

// Habillage d'un modèle STX chargé (clé : nom du modèle dans STX_LIVERY.vehicles), à appeler une fois le modèle
// accroché à sa caisse. Renvoie null pour un modèle sans emplacement.
export function buildStxLivery(model, key = model.name) {
  if (!STX_LIVERY.vehicles[key] || !model.parent) return null;
  return new VehicleLivery(model, key);
}
