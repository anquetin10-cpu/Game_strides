// Végétation réaliste : arbres procéduraux instanciés par variante avec niveaux de détail
// (maillage complet de près, imposteurs éclairés au loin, fondu tramé entre les deux), vent dans le vertex shader,
// haies du bocage normand (talus + volume feuillu + cartes de rameaux de près).
import * as THREE from 'three';
import { mulberry32, clamp } from '../core/math.js';
import { SPECIES, treeVariant } from './treeGen.js';
import { LEAF, leafCell, leafAtlas, barkTextures, hedgeTextures } from './vegTextures.js';
import { addCloudShadows } from './sky.js';

const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
// Atlas des imposteurs : 8 × 4 cellules (192 px sur mobile, 256 px sinon).
const CELL = COARSE ? 192 : 256;
const ATLAS_W = CELL * 8, ATLAS_H = CELL * 4;

// Vent partagé par tous les matériaux végétaux (direction : vents d'ouest venus de la mer).
export const WIND = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector4(0.86, -0.5, 1, 0) },
  uTrans: { value: 0.55 },
};

// ---------- Morceaux de shaders ----------
const VERT_COMMON = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
#ifdef VEG_WIND
attribute vec4 aWind;
#endif
#ifdef VEG_FADE
attribute float aFade;
varying float vFade;
#endif
#ifdef VEG_WIND
vec3 vegWind( vec3 pos, vec3 nrm ) {
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
    vec3 wd = normalize( transpose( mat3( instanceMatrix ) ) * vec3( uWind.x, 0.0, uWind.y ) );
  #else
    vec3 ip = vec3( 0.0 );
    vec3 wd = vec3( uWind.x, 0.0, uWind.y );
  #endif
  float ph = dot( ip.xz, vec2( 0.071, 0.053 ) );
  float t = uTime;
  float gust = 0.62 + 0.38 * sin( t * 0.37 + dot( ip.xz, uWind.xy ) * 0.021 ) * sin( t * 0.23 + ph * 0.7 );
  float s = uWind.z * gust;
  // Flexion lente du tronc dans le sens du vent.
  float bend = aWind.x * s * ( 0.16 + 0.07 * sin( t * 0.9 + ph ) + 0.04 * sin( t * 1.93 + ph * 1.3 ) );
  vec3 off = wd * bend;
  // Charpentières et rameaux : balancement propre à chaque branche.
  float bp = aWind.z * 6.2831 + ph;
  off += vec3( sin( t * 1.7 + bp ), 0.35 * sin( t * 2.3 + bp * 1.7 ), cos( t * 1.45 + bp * 1.3 ) ) * aWind.y * s * 0.085;
  // Feuilles : frémissement rapide.
  off += nrm * sin( t * 6.3 + bp * 3.0 + pos.x * 1.7 + pos.z * 1.3 + pos.y ) * aWind.w * s * 0.045;
  return off;
}
#endif
`;

const VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
#ifdef VEG_WIND
transformed += vegWind( transformed, normal );
#endif
#ifdef VEG_FADE
vFade = aFade;
#endif
`;

const FRAG_COMMON = /* glsl */ `
uniform float uTrans;
uniform float vegMapSize;
#ifdef VEG_FADE
varying float vFade;
#endif
float vegDither() { return fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ); }
`;

// Compense l'amincissement des cartes alpha dans les mipmaps lointaines.
const ALPHA_BOOST = /* glsl */ `
#include <map_fragment>
#ifdef USE_MAP
{
  vec2 ts = vMapUv * vegMapSize;
  vec2 ddx = dFdx( ts ), ddy = dFdy( ts );
  float lod = 0.5 * log2( max( max( dot( ddx, ddx ), dot( ddy, ddy ) ), 1e-6 ) );
  diffuseColor.a *= 1.0 + max( lod, 0.0 ) * 0.32;
}
#endif
`;

// Lumière transmise à travers les feuilles (contre-jour) et un peu par la face arrière.
const TRANSLUCENCY = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  float fw = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 4.0 );
  float bk = saturate( dot( - geometryNormal, directLight.direction ) );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uTrans * ( fw * 0.9 + bk * 0.3 );
}
#endif
#include <lights_fragment_end>
`;

// Lumière du ciel diffusée à travers le houppier : les feuilles tournées vers le bas reçoivent aussi le ciel.
const CANOPY_SKY = /* glsl */ `
#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
{
  vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float down = 0.5 - 0.5 * dot( geometryNormal, upV );
  iblIrradiance += getIBLIrradiance( upV ) * down * 0.45;
}
#endif
`;

const NORMAL_NOFLIP = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');

// Applique les modifications de shader : vent, fondu tramé, feuillage (alpha, normales, transmission).
function patchMaterial(mat, { wind = true, fade = 0, leaf = false, mapSize = 1024, depth = false, key = '' } = {}) {
  mat.defines = mat.defines || {};
  if (wind) mat.defines.VEG_WIND = '';
  if (fade) mat.defines.VEG_FADE = '';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.uniforms.uWind = WIND.uWind;
    sh.uniforms.uTrans = WIND.uTrans;
    sh.uniforms.vegMapSize = { value: mapSize };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${VERT_COMMON}`).replace('#include <begin_vertex>', VERT_BEGIN);
    let f = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_COMMON}`);
    if (fade) f = f.replace('void main() {', 'void main() {\n  if ( vegDither() > vFade ) discard;');
    if (leaf) {
      f = f.replace('#include <map_fragment>', ALPHA_BOOST);
      if (!depth) f = f.replace('#include <normal_fragment_begin>', NORMAL_NOFLIP).replace('#include <lights_fragment_maps>', CANOPY_SKY).replace('#include <lights_fragment_end>', TRANSLUCENCY);
    }
    sh.fragmentShader = f;
    if (!depth) addCloudShadows(sh);
  };
  mat.customProgramCacheKey = () => `veg-${wind}-${fade}-${leaf}-${depth}-${key}`;
  return mat;
}

// Le fondu tramé s'applique aussi à la passe d'ombre : l'ombre portée apparaît progressivement avec le maillage
// au lieu de surgir d'un coup à la distance de bascule vers l'imposteur (qui n'en porte pas).
function depthMaterial(opts) {
  return patchMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { ...opts, fade: 1, depth: true });
}

// ---------- Imposteurs : panneau face caméra, albédo + normales précalculés ----------
const IMP_VERT = /* glsl */ `
#include <common>
attribute vec4 aImpPos;
attribute vec4 aImpSize;
attribute vec3 aImpTint;
uniform vec4 uCellRect[32];
varying float vFade;
varying vec3 vImpTint;
varying vec3 vBR;
varying vec3 vBU;
varying vec3 vBF;
`;
const IMP_NORMAL = /* glsl */ `
vec3 impC = aImpPos.xyz;
vec3 impTo = cameraPosition - impC;
vec2 impH = normalize( impTo.xz + vec2( 1e-4, 0.0 ) );
vec3 impF = vec3( impH.x, 0.0, impH.y );
vec3 impR = vec3( impF.z, 0.0, - impF.x );
// Inclinaison partielle vers la caméra quand on regarde d'en haut.
float impEl = clamp( impTo.y / max( length( impTo ), 1.0 ), -0.3, 0.9 ) * 0.55;
vec3 impU = normalize( vec3( 0.0, 1.0, 0.0 ) * cos( impEl ) - impF * sin( impEl ) );
impF = normalize( cross( impR, impU ) );
vec3 objectNormal = impF;
vBR = normalize( ( viewMatrix * vec4( impR, 0.0 ) ).xyz );
vBU = normalize( ( viewMatrix * vec4( impU, 0.0 ) ).xyz );
vBF = normalize( ( viewMatrix * vec4( impF, 0.0 ) ).xyz );
vFade = aImpSize.z;
vImpTint = aImpTint;
`;
const IMP_BEGIN = /* glsl */ `
vec3 transformed = impC + impR * position.x * aImpSize.x + impU * position.y * aImpSize.y;
#ifdef USE_MAP
  vec4 impRect = uCellRect[ int( aImpPos.w + 0.5 ) ];
  vMapUv = mix( impRect.xy, impRect.zw, uv );
#endif
`;

function impostorMaterial(albedo, normal) {
  const mat = new THREE.MeshStandardMaterial({ map: albedo, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.86, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTrans = WIND.uTrans;
    sh.uniforms.vegMapSize = { value: ATLAS_W };
    sh.uniforms.uCellRect = { value: mat.userData.rects };
    sh.uniforms.uImpNormal = { value: normal };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', IMP_VERT)
      .replace('#include <beginnormal_vertex>', IMP_NORMAL)
      .replace('#include <begin_vertex>', IMP_BEGIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_COMMON.replace('#ifdef VEG_FADE\nvarying float vFade;\n#endif', 'varying float vFade;')}\nuniform sampler2D uImpNormal;\nvarying vec3 vImpTint;\nvarying vec3 vBR;\nvarying vec3 vBU;\nvarying vec3 vBF;`)
      .replace('void main() {', 'void main() {\n  if ( vegDither() <= vFade ) discard;')
      .replace('#include <map_fragment>', `${ALPHA_BOOST}\ndiffuseColor.rgb *= vImpTint * 0.88;`)
      .replace('#include <normal_fragment_maps>', `{
  vec3 nt = texture2D( uImpNormal, vMapUv ).xyz * 2.0 - 1.0;
  normal = normalize( vBR * nt.x + vBU * nt.y + vBF * max( nt.z, 0.05 ) );
}`)
      .replace('#include <lights_fragment_maps>', CANOPY_SKY)
      .replace('#include <lights_fragment_end>', TRANSLUCENCY);
    addCloudShadows(sh);
  };
  mat.customProgramCacheKey = () => 'veg-impostor';
  return mat;
}

// Matériaux de cuisson des imposteurs (rendu sans éclairage : albédo ou normale).
function bakeMaterial(map, normals, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, mapSize: { value: alpha ? 1024 : 128 } },
    vertexColors: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vCol;
      varying vec3 vN;
      varying float vY;
      void main() {
        vUv = uv;
        vCol = color;
        vY = position.y;
        vN = normalize( normalMatrix * normal );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float mapSize;
      varying vec2 vUv;
      varying vec3 vCol;
      varying vec3 vN;
      varying float vY;
      void main() {
        if ( vY < 0.0 ) discard;
        vec4 t = texture2D( map, vUv );
        ${alpha ? `vec2 ts = vUv * mapSize; vec2 a = dFdx( ts ), b = dFdy( ts );
        float lod = 0.5 * log2( max( max( dot( a, a ), dot( b, b ) ), 1e-6 ) );
        if ( t.a * ( 1.0 + max( lod, 0.0 ) * 0.32 ) < 0.5 ) discard;` : ''}
        ${normals ? 'gl_FragColor = vec4( normalize( vN ) * 0.5 + 0.5, 1.0 );' : 'gl_FragColor = vec4( t.rgb * vCol, 1.0 );'}
      }`,
  });
}

// ---------- Haies ----------
// Profil en travers (x, y) : talus herbeux puis masse feuillue ; v = coordonnée de texture.
const HEDGE_PROFILE = [
  [-1.7, -0.35, 0.0], [-1.25, 0.24, 0.12], [-0.86, 0.5, 0.26],
  [-0.84, 0.62, 0.32], [-0.9, 1.05, 0.55], [-0.55, 1.5, 0.8], [0, 1.68, 1.0], [0.55, 1.5, 0.8], [0.9, 1.05, 0.55], [0.84, 0.62, 0.32],
  [0.86, 0.5, 0.26], [1.25, 0.24, 0.12], [1.7, -0.35, 0.0],
];
const HEDGE_CHUNK = 4;

// Gabarit d'un tronçon de haie de 4 m : cartes de rameaux (aubépine, noisetier, ronces, lierre, herbes du talus).
function hedgeChunk(seed) {
  const rnd = mulberry32(seed);
  const p = [], n = [], uv = [], c = [], w = [], idx = [];
  const add = (cx, cy, cz, ux, uy, uz, size, cell, nx, ny, nz, ao) => {
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul; uy /= ul; uz /= ul;
    // Droite = up × normale.
    let rx = uy * nz - uz * ny, ry = uz * nx - ux * nz, rz = ux * ny - uy * nx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    const [u0, v0, u1, v1] = leafCell(cell);
    const base = p.length / 3;
    for (const [sx, sy, u, v] of [[-0.5, 0, u0, v0], [0.5, 0, u1, v0], [0.5, 1, u1, v1], [-0.5, 1, u0, v1]]) {
      const x = cx + rx * sx * size + ux * sy * size, y = cy + ry * sx * size + uy * sy * size, z = cz + rz * sx * size + uz * sy * size;
      p.push(x, y, z);
      // Normale cylindrique (depuis l'axe de la haie), un peu vers le haut.
      let gx = x, gy = (y - 0.9) * 0.6 + 0.35, gz = 0;
      const gl = Math.hypot(gx, gy, gz) || 1;
      n.push(gx / gl, gy / gl, gz / gl);
      uv.push(u, v);
      const k = ao * (0.85 + 0.15 * sy);
      c.push(k, k, k);
      w.push(0, 0.22, rnd(), sy * 0.8);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const cells = [LEAF.hawthorn, LEAF.hawthorn, LEAF.hazel, LEAF.hazel, LEAF.oak2, LEAF.ivy];
  for (let i = 0; i < 46; i++) {
    const z = (rnd() - 0.5) * HEDGE_CHUNK * 1.05;
    const side = rnd() < 0.5 ? -1 : 1;
    const top = rnd() < 0.35;
    const y = top ? 1.25 + rnd() * 0.3 : 0.6 + rnd() * 0.75;
    const x = top ? (rnd() - 0.5) * 1.2 : side * (0.62 + rnd() * 0.3);
    const ux = top ? (rnd() - 0.5) * 0.6 : side * (0.5 + rnd() * 0.6), uy = top ? 1 : 0.5 + rnd() * 0.8, uz = (rnd() - 0.5) * 0.9;
    const size = 0.75 + rnd() * 0.5;
    const a = rnd() * Math.PI * 2;
    add(x, y - size * 0.1, z, ux, uy, uz, size, cells[Math.floor(rnd() * cells.length)], Math.cos(a), (rnd() - 0.5) * 0.5, Math.sin(a), 0.75 + rnd() * 0.3);
  }
  // Pied de haie : ronces, herbes hautes, fougères.
  for (let i = 0; i < 16; i++) {
    const z = (rnd() - 0.5) * HEDGE_CHUNK;
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (0.95 + rnd() * 0.5);
    const cell = rnd() < 0.45 ? LEAF.grass : rnd() < 0.6 ? LEAF.bramble : LEAF.fern;
    const size = cell === LEAF.grass ? 0.55 + rnd() * 0.3 : 0.7 + rnd() * 0.4;
    const a = rnd() * Math.PI * 2;
    add(x, 0.18 + (1.4 - Math.abs(x)) * 0.3, z, side * 0.35, 1, (rnd() - 0.5) * 0.4, size, cell, Math.cos(a), 0, Math.sin(a), 0.85 + rnd() * 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(w, 4));
  g.setIndex(idx);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _sph = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();

const hash2 = (x, z) => {
  let h = Math.imul(Math.floor(x * 7.31) | 0, 73856093) ^ Math.imul(Math.floor(z * 5.17) | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Groupe d'instances d'une variante (ou d'un tronçon de haie) : maillages qui partagent leurs attributs d'instance.
class InstanceSet {
  // shadowOnly : maillages dessinés uniquement dans la carte d'ombre (feuillage simplifié).
  constructor(meshes, cap, shadowOnly = []) {
    this.meshes = meshes;
    this.shadowOnly = shadowOnly;
    this.cap = cap;
    this.matrix = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.nVis = 0;
    this.nAll = 0;
    this.attrs = [this.matrix, this.color, this.fade];
    for (const m of [...meshes, ...shadowOnly]) {
      const shadow = shadowOnly.includes(m);
      m.instanceMatrix = this.matrix;
      m.instanceColor = this.color;
      m.geometry.setAttribute('aFade', this.fade);
      m.frustumCulled = false;
      m.count = 0;
      // Les ombres utilisent aussi les instances hors champ (arbres derrière la caméra).
      m.onBeforeShadow = () => { m.count = this.nAll; };
      m.onAfterShadow = () => { m.count = shadow ? 0 : this.nVis; };
    }
  }
  begin() {
    this.n = 0;
  }
  push(src, i, tint, fade) {
    const o = this.n++;
    const m = this.matrix.array;
    for (let k = 0; k < 16; k++) m[o * 16 + k] = src[i * 16 + k];
    this.color.array[o * 3] = tint[i * 3];
    this.color.array[o * 3 + 1] = tint[i * 3 + 1];
    this.color.array[o * 3 + 2] = tint[i * 3 + 2];
    this.fade.array[o] = fade;
  }
  end(nVis) {
    this.nVis = nVis;
    this.nAll = this.n;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
    for (const m of this.meshes) {
      m.count = nVis;
      m.visible = this.n > 0;
    }
    for (const m of this.shadowOnly) {
      m.count = 0;
      m.visible = this.n > 0;
    }
  }
}

export class Vegetation {
  constructor(parent, scene) {
    this.parent = parent;
    this.scene = scene;
    this.list = [];
    this.hedgeLines = [];
    this.near = COARSE ? 50 : 64;
    this.fadeBand = 8;
    this.hedgeNear = COARSE ? 95 : 125;
    this.built = false;
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.dirty = true;
  }

  // Enregistre un arbre (la géométrie est construite à la fin, par variante).
  addTree(kind, x, y, z, rot, scale, sy, tint) {
    if (!SPECIES[kind]) kind = 'oak';
    this.list.push({ kind, x, y, z, rot, s: scale, sy, tint });
  }

  addHedge(ax, az, bx, bz) {
    this.hedgeLines.push([ax, az, bx, bz]);
  }

  build(getH) {
    const atlas = leafAtlas();
    this.leafMat = patchMaterial(new THREE.MeshStandardMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 }), { fade: 1, leaf: true, key: 'leaf' });
    this.leafDepth = depthMaterial({ leaf: true, key: 'leafd' });
    this.woodDepth = depthMaterial({ key: 'woodd' });
    this.barkMats = {};
    for (const t of ['fissured', 'smooth', 'birch', 'pine']) {
      const b = barkTextures(t);
      this.barkMats[t] = patchMaterial(new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), vertexColors: true, roughness: 0.93, metalness: 0 }), { fade: 1, key: 'bark' });
    }
    this.buildTrees();
    this.buildHedges(getH);
    this.built = true;
    // Mise à jour des niveaux de détail juste avant chaque rendu, avec la caméra réellement utilisée.
    const prev = this.scene.onBeforeRender;
    this.scene.onBeforeRender = (renderer, scene, camera, target) => {
      prev.call(scene, renderer, scene, camera, target);
      if (target === null || target === undefined) this.beforeRender(renderer, camera);
    };
  }

  buildTrees() {
    const L = this.list;
    const n = L.length;
    this.count = n;
    this.pos = new Float32Array(n * 4); // x, y, z, rayon de la sphère englobante
    this.mats = new Float32Array(n * 16);
    this.tints = new Float32Array(n * 3);
    this.vidx = new Uint16Array(n);
    this.dist = new Float32Array(n);
    this.variants = [];
    const vmap = new Map();
    for (let i = 0; i < n; i++) {
      const t = L[i];
      const sp = SPECIES[t.kind];
      const v = Math.floor(hash2(t.x, t.z) * sp.variants) % sp.variants;
      const key = `${t.kind}:${v}`;
      if (!vmap.has(key)) {
        vmap.set(key, this.variants.length);
        this.variants.push({ data: treeVariant(t.kind, v), n: 0 });
      }
      const vi = vmap.get(key);
      this.vidx[i] = vi;
      const V = this.variants[vi];
      V.n++;
      const d = V.data;
      _m.compose(_p.set(t.x, t.y, t.z), _q.setFromAxisAngle(_s.set(0, 1, 0), t.rot), _s.set(t.s, t.s * t.sy, t.s));
      _m.toArray(this.mats, i * 16);
      this.pos[i * 4] = t.x;
      this.pos[i * 4 + 1] = t.y + d.H * t.s * t.sy * 0.5;
      this.pos[i * 4 + 2] = t.z;
      this.pos[i * 4 + 3] = Math.max(d.R, d.H * 0.5) * t.s * t.sy;
      // Teinte par arbre : luminosité et nuance (plus jaune / plus bleutée).
      const k = 0.86 + t.tint * 0.26;
      const y = (hash2(t.z, t.x) - 0.5) * 0.14;
      this.tints[i * 3] = k * (1 + y);
      this.tints[i * 3 + 1] = k;
      this.tints[i * 3 + 2] = k * (1 - y * 1.6);
    }
    // Instances proches : écorce + feuillage, une paire de maillages par variante.
    for (const V of this.variants) {
      const d = V.data;
      const wood = new THREE.InstancedMesh(d.wood, this.barkMats[d.bark], V.n);
      const leaves = new THREE.InstancedMesh(d.leaves, this.leafMat, V.n);
      const proxy = new THREE.InstancedMesh(d.shadow, this.leafMat, V.n);
      wood.customDepthMaterial = this.woodDepth;
      proxy.customDepthMaterial = this.leafDepth;
      for (const m of [wood, leaves, proxy]) {
        m.castShadow = m !== leaves;
        m.receiveShadow = m !== proxy;
        m.name = `tree:${d.kind}:${d.variant}`;
        this.parent.add(m);
      }
      V.set = new InstanceSet([wood, leaves], V.n, [proxy]);
    }
    this.buildImpostors();
  }

  buildImpostors() {
    const n = this.count;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    q.translate(0, 0.5, 0);
    g.index = q.index;
    g.setAttribute('position', q.attributes.position);
    g.setAttribute('normal', q.attributes.normal);
    g.setAttribute('uv', q.attributes.uv);
    this.impPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.impSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.impTint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aImpPos', this.impPos);
    g.setAttribute('aImpSize', this.impSize);
    g.setAttribute('aImpTint', this.impTint);
    g.instanceCount = 0;
    this.impAttrs = [this.impPos, this.impSize, this.impTint];
    // Atlas rempli à la première image (il faut le renderer).
    const opts = { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    this.rtAlbedo = new THREE.WebGLRenderTarget(ATLAS_W, ATLAS_H, { ...opts, colorSpace: THREE.SRGBColorSpace });
    this.rtNormal = new THREE.WebGLRenderTarget(ATLAS_W, ATLAS_H, opts);
    const mat = impostorMaterial(this.rtAlbedo.texture, this.rtNormal.texture);
    mat.userData.rects = Array.from({ length: 32 }, () => new THREE.Vector4());
    this.impMat = mat;
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'trees:impostors';
    this.parent.add(mesh);
    this.impostors = mesh;
    this.impGeo = g;
    // Taille du panneau par variante (le rectangle UV est calculé à la cuisson).
    this.variants.forEach((V, i) => {
      const d = V.data;
      V.cell = i;
      V.w = d.R * 2 + 0.4;
      V.h = d.H + 0.2;
    });
  }

  // Cuisson des imposteurs : chaque variante rendue de profil (orthographique) dans sa cellule.
  bakeImpostors(renderer) {
    this.baked = true;
    const cell = CELL, cols = 8, pad = Math.round(cell * 0.04);
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(0, ATLAS_W, ATLAS_H, 0, -2000, 2000);
    cam.position.set(0, 0, 1000);
    cam.updateMatrixWorld();
    const atlas = leafAtlas().texture;
    const leafA = bakeMaterial(atlas, false, true), leafN = bakeMaterial(atlas, true, true);
    const barkA = {}, barkN = {};
    for (const t of Object.keys(this.barkMats)) {
      barkA[t] = bakeMaterial(this.barkMats[t].map, false, false);
      barkN[t] = bakeMaterial(this.barkMats[t].map, true, false);
    }
    const meshes = [];
    this.variants.forEach((V, i) => {
      const d = V.data;
      const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
      const s = (cell - pad * 2) / Math.max(V.w, V.h);
      const wood = new THREE.Mesh(d.wood, barkA[d.bark]);
      const leaves = new THREE.Mesh(d.leaves, leafA);
      for (const m of [wood, leaves]) {
        m.position.set(cx + cell / 2, cy + pad, 0);
        m.scale.setScalar(s);
        m.frustumCulled = false;
        scene.add(m);
      }
      meshes.push([wood, leaves, d.bark]);
      const rect = this.impMat.userData.rects[i];
      rect.set((cx + cell / 2 - (V.w / 2) * s) / ATLAS_W, (cy + pad) / ATLAS_H, (cx + cell / 2 + (V.w / 2) * s) / ATLAS_W, (cy + pad + V.h * s) / ATLAS_H);
    });
    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = true;
    renderer.setClearColor(new THREE.Color(0.035, 0.05, 0.022), 0);
    renderer.setRenderTarget(this.rtAlbedo);
    renderer.render(scene, cam);
    for (const [wood, leaves, bark] of meshes) {
      wood.material = barkN[bark];
      leaves.material = leafN;
    }
    renderer.setClearColor(new THREE.Color(0.5, 0.5, 1), 0);
    renderer.setRenderTarget(this.rtNormal);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.autoClear = prevAuto;
    renderer.shadowMap.autoUpdate = prevShadow;
    for (const m of [leafA, leafN, ...Object.values(barkA), ...Object.values(barkN)]) m.dispose();
  }

  // ---------- Haies ----------
  buildHedges(getH) {
    if (!this.hedgeLines.length) return;
    const tex = hedgeTextures();
    this.hullMat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(1.3, 1.3), vertexColors: true, roughness: 0.9, metalness: 0 });
    this.hullMat.onBeforeCompile = (sh) => addCloudShadows(sh);
    this.hullMat.customProgramCacheKey = () => 'veg-hull';
    const TILE = 300;
    const tiles = new Map();
    const chunks = [];
    const rnd = mulberry32(5150);
    for (const [ax, az, bx, bz] of this.hedgeLines) {
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const nx = dz, nz = -dx; // à droite du sens de parcours
      const n = Math.max(2, Math.ceil(len / 3));
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const key = `${Math.floor(mx / TILE)},${Math.floor(mz / TILE)}`;
      if (!tiles.has(key)) tiles.set(key, { p: [], n: [], uv: [], c: [], i: [] });
      const T = tiles.get(key);
      const base = T.p.length / 3;
      const P = HEDGE_PROFILE.length;
      const seed = rnd() * 100;
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = getH(x, z);
        // Hauteur et épaisseur irrégulières le long de la haie ; extrémités arrondies.
        const end = Math.min(1, Math.min(t, 1 - t) * len / 2.5);
        const hk = (0.86 + 0.14 * Math.sin(seed + t * len * 0.37) + 0.08 * Math.sin(seed * 1.7 + t * len * 1.13)) * (0.45 + 0.55 * Math.sqrt(end));
        const wk = (0.9 + 0.1 * Math.sin(seed * 0.3 + t * len * 0.71)) * (0.6 + 0.4 * Math.sqrt(end));
        for (let k = 0; k < P; k++) {
          const [px, py, v] = HEDGE_PROFILE[k];
          const body = k >= 3 && k <= P - 4;
          const sx = px * (body ? wk : 1), sy = body ? 0.5 + (py - 0.5) * hk : py;
          // Normale du profil (différences finies dans le plan de coupe).
          const [ax2, ay2] = HEDGE_PROFILE[Math.max(0, k - 1)];
          const [bx2, by2] = HEDGE_PROFILE[Math.min(P - 1, k + 1)];
          let tx = bx2 - ax2, ty = by2 - ay2;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl; ty /= tl;
          const lx = -ty, ly = tx; // normale vers l'extérieur
          T.p.push(x + nx * sx, y + sy, z + nz * sx);
          T.n.push(nx * lx, ly, nz * lx);
          T.uv.push((t * len) / 4, v * 0.995 + 0.002);
          const ao = body ? 0.55 + 0.45 * clamp((sy - 0.5) / 1.1, 0, 1) : 0.92;
          T.c.push(ao, ao, ao);
        }
        if (s > 0) {
          const r0 = base + (s - 1) * P, r1 = base + s * P;
          for (let k = 0; k < P - 1; k++) T.i.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
        }
      }
      // Tronçons de rameaux le long de la haie (niveau de détail proche).
      const nc = Math.max(1, Math.round(len / (HEDGE_CHUNK * 0.9)));
      const ang = Math.atan2(dx, dz);
      for (let k = 0; k < nc; k++) {
        const t = (k + 0.5) / nc;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y0 = getH(x - dx * 2, z - dz * 2), y1 = getH(x + dx * 2, z + dz * 2);
        const end = Math.min(1, Math.min(t, 1 - t) * len / 3);
        chunks.push({ x, y: (y0 + y1) / 2, z, ang, pitch: -Math.atan2(y1 - y0, 4), v: Math.floor(rnd() * 3), sx: 0.85 + 0.25 * Math.sqrt(end), tint: rnd() });
      }
    }
    this.hulls = [];
    for (const T of tiles.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(T.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(T.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(T.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(T.c, 3));
      g.setIndex(T.i);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.hullMat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'hedges';
      m.matrixAutoUpdate = false;
      this.parent.add(m);
      this.hulls.push(m);
    }
    // Tronçons instanciés (3 gabarits).
    const nC = chunks.length;
    this.hedgeChunks = chunks;
    this.hcPos = new Float32Array(nC * 3);
    this.hcMats = new Float32Array(nC * 16);
    this.hcTints = new Float32Array(nC * 3);
    const counts = [0, 0, 0];
    chunks.forEach((c, i) => {
      _e.set(c.pitch, c.ang, 0, 'YXZ');
      _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e), _s.set(c.sx, 0.92 + c.tint * 0.16, 1));
      _m.toArray(this.hcMats, i * 16);
      this.hcPos[i * 3] = c.x;
      this.hcPos[i * 3 + 1] = c.y;
      this.hcPos[i * 3 + 2] = c.z;
      const k = 0.88 + c.tint * 0.22;
      this.hcTints[i * 3] = k;
      this.hcTints[i * 3 + 1] = k;
      this.hcTints[i * 3 + 2] = k * 0.96;
      counts[c.v]++;
    });
    this.hedgeSets = [0, 1, 2].map((v) => {
      const m = new THREE.InstancedMesh(hedgeChunk(31 + v * 7), this.leafMat, Math.max(1, counts[v]));
      m.customDepthMaterial = this.leafDepth;
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'hedges:near';
      this.parent.add(m);
      return new InstanceSet([m], Math.max(1, counts[v]));
    });
  }

  // ---------- Mise à jour ----------
  update(dt) {
    WIND.uTime.value += dt;
  }

  beforeRender(renderer, camera) {
    if (!this.built) return;
    if (!this.baked && this.count) this.bakeImpostors(renderer);
    camera.updateMatrixWorld();
    const cp = camera.position;
    const dir = camera.getWorldDirection(_p);
    // Recalcul seulement si la caméra a bougé ou tourné.
    if (!this.dirty && cp.distanceToSquared(this.lastCam) < 0.04 && dir.dot(this.lastDir) > 0.99995) return;
    this.dirty = false;
    this.lastCam.copy(cp);
    this.lastDir.copy(dir);
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    this.updateTrees(cp);
    if (this.hedgeSets) this.updateHedges(cp);
  }

  updateTrees(cp) {
    const n = this.count;
    if (!n) return;
    const near = this.near, band = this.fadeBand;
    const P = this.pos;
    const V = this.variants;
    for (const v of V) {
      v.set.begin();
      v.vis = 0;
    }
    // Deux passes : instances visibles d'abord (comptées pour le rendu), puis ombres hors champ.
    const shadowOnly = this._shadowOnly || (this._shadowOnly = new Int32Array(n));
    let ns = 0;
    let ni = 0;
    const ip = this.impPos.array, is = this.impSize.array, it = this.impTint.array;
    for (let i = 0; i < n; i++) {
      const dx = P[i * 4] - cp.x, dz = P[i * 4 + 2] - cp.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      _sph.center.set(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]);
      _sph.radius = P[i * 4 + 3] * 1.1;
      const inView = _frustum.intersectsSphere(_sph);
      const vi = this.vidx[i];
      // f : part du maillage complet (1 = complet, 0 = imposteur). Tout près de la caméra (perche orbitée dans un
      // houppier ou contre un tronc), l'arbre s'efface par tramage sur 1,5-4 m, sans imposteur de relais.
      const f = d < near - band ? 1 : d > near ? 0 : (near - d) / band;
      const fn = d < 4 ? f * clamp((d - 1.5) / 2.5, 0, 1) : f;
      if (fn > 0) {
        if (inView) {
          V[vi].set.push(this.mats, i, this.tints, fn);
          V[vi].vis++;
        } else if (d < 42) shadowOnly[ns++] = i; // ombres portées depuis le hors-champ proche
      }
      if (f < 1 && inView && d < 1400) {
        const Vv = V[vi];
        const t = this.list[i];
        const o = ni++;
        ip[o * 4] = t.x;
        ip[o * 4 + 1] = t.y;
        ip[o * 4 + 2] = t.z;
        ip[o * 4 + 3] = Vv.cell;
        is[o * 4] = Vv.w * t.s;
        is[o * 4 + 1] = Vv.h * t.s * t.sy;
        is[o * 4 + 2] = f;
        it[o * 3] = this.tints[i * 3];
        it[o * 3 + 1] = this.tints[i * 3 + 1];
        it[o * 3 + 2] = this.tints[i * 3 + 2];
      }
    }
    for (const v of V) v.nv = v.set.n;
    for (let k = 0; k < ns; k++) {
      const i = shadowOnly[k];
      V[this.vidx[i]].set.push(this.mats, i, this.tints, 1);
    }
    for (const v of V) v.set.end(v.nv);
    for (const a of this.impAttrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, ni * a.itemSize);
      a.needsUpdate = true;
    }
    this.impGeo.instanceCount = ni;
    this.impostors.visible = ni > 0;
    let nn = 0;
    for (const v of V) nn += v.nv;
    const st = this.stats || (this.stats = {});
    st.near = nn;
    st.shadow = ns;
    st.impostors = ni;
  }

  updateHedges(cp) {
    const C = this.hedgeChunks;
    const near = this.hedgeNear, band = 15;
    for (const s of this.hedgeSets) {
      s.begin();
      s.vis = 0;
    }
    const pending = this._hcShadow || (this._hcShadow = new Int32Array(C.length));
    let np = 0;
    for (let i = 0; i < C.length; i++) {
      const dx = this.hcPos[i * 3] - cp.x, dz = this.hcPos[i * 3 + 2] - cp.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > near) continue;
      _sph.center.set(this.hcPos[i * 3], this.hcPos[i * 3 + 1] + 1, this.hcPos[i * 3 + 2]);
      _sph.radius = 3;
      const f = d < near - band ? 1 : (near - d) / band;
      if (_frustum.intersectsSphere(_sph)) this.hedgeSets[C[i].v].push(this.hcMats, i, this.hcTints, f);
      else if (d < 60) pending[np++] = i;
    }
    for (const s of this.hedgeSets) s.nv = s.n;
    for (let k = 0; k < np; k++) {
      const i = pending[k];
      this.hedgeSets[C[i].v].push(this.hcMats, i, this.hcTints, 1);
    }
    for (const s of this.hedgeSets) s.end(s.nv);
  }
}
