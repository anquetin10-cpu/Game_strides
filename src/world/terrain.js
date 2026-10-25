import * as THREE from 'three';
import { addCloudShadows } from './sky.js';
import { TIDE_UNIFORMS } from './weather.js';
import { createNoise2D, fbm } from '../core/noise.js';
import { clamp, lerp, polyDist, smoothstep, pointAlong } from '../core/math.js';
import { WORLD, ZONES, ROADS, POND, SIGN, shoreZ, isCliffRegion, zoneDist } from './layout.js';

const n1 = createNoise2D(11);
const n2 = createNoise2D(23);

function hills(x, z) {
  let h = fbm(n1, x * 0.0035, z * 0.0035, 4) * 9;
  h += Math.max(0, fbm(n2, x * 0.008 + 40, z * 0.008, 3)) * 4;
  h += smoothstep(120, 560, z) * 24 * (0.65 + 0.35 * n2(x * 0.004 + 10, z * 0.004));
  const ds = Math.hypot(x - SIGN.x, z - SIGN.z);
  h += SIGN.h * Math.exp(-(ds * ds) / (2 * (SIGN.r * 0.45) ** 2));
  const edge = Math.max(smoothstep(500, 600, Math.abs(x)), smoothstep(530, 600, z));
  h += edge * 22;
  return h;
}

// Raw height before zone/road shaping.
export function baseHeight(x, z) {
  const d = z - shoreZ(x);
  const land = Math.max(5 + hills(x, z), 2.8);
  const coast = d < 0 ? Math.max(-14, d * 0.07) : Math.min(d * 0.045, 3.2);
  let h = lerp(coast, land, smoothstep(55, 150, d));
  const c = isCliffRegion(x);
  if (c > 0) {
    const plateau = lerp(land, 24 + 4 * n1(x * 0.01, z * 0.01), smoothstep(-200, -330, z));
    const ch = d < 0 ? Math.max(-14, d * 0.09) : d < 10 ? d * 0.05 : lerp(0.5, plateau, smoothstep(10, 22, d));
    h = lerp(h, ch, c);
  }
  return h;
}

for (const z of ZONES) if (z.y === undefined) z.y = Math.max(3, baseHeight(z.x, z.z));

function zonedHeight(x, z) {
  let h = baseHeight(x, z);
  for (const zone of ZONES) {
    const d = zoneDist(x, z, zone);
    if (d < zone.fall) h = lerp(h, zone.y, 1 - smoothstep(0, zone.fall, d));
  }
  return h;
}

// Profil en long lissé de chaque route (évite les rampes trop raides).
const PROFILES = new Map();
function roadProfile(r) {
  if (PROFILES.has(r)) return PROFILES.get(r);
  const cum = [0];
  for (let i = 0; i < r.pts.length - 1; i++) cum.push(cum[i] + Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]));
  const L = cum[cum.length - 1];
  const step = 4;
  const n = Math.ceil(L / step) + 1;
  let hs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = pointAlong(r.pts, Math.min(L, i * step));
    hs[i] = zonedHeight(p.x, p.z);
  }
  // Raccords : une route secondaire épouse le profil de la route sur laquelle elle débouche.
  const pins = [];
  const idx = ROADS.indexOf(r);
  for (const [k, pt] of [[0, r.pts[0]], [n - 1, r.pts[r.pts.length - 1]]]) {
    for (let j = 0; j < idx; j++) {
      const q = polyDist(pt[0], pt[1], ROADS[j].pts);
      if (q.d < 3) {
        pins.push([k, profileAt(ROADS[j], q)]);
        break;
      }
    }
  }
  for (const [k, v] of pins) hs[k] = v;
  for (let pass = 0; pass < 6; pass++) {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, w = 0;
      for (let k = -3; k <= 3; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        sum += hs[j];
        w++;
      }
      o[i] = sum / w;
    }
    hs = o;
    for (const [k, v] of pins) hs[k] = v;
  }
  const prof = { cum, hs, step, n };
  PROFILES.set(r, prof);
  return prof;
}
function profileAt(r, p) {
  const prof = roadProfile(r);
  const segLen = prof.cum[p.seg + 1] - prof.cum[p.seg];
  const s = prof.cum[p.seg] + p.t * segLen;
  const f = Math.min(prof.n - 1.001, s / prof.step);
  const i = Math.floor(f);
  return prof.hs[i] + (prof.hs[i + 1] - prof.hs[i]) * (f - i);
}

let pondBase = null;
export function analyticHeight(x, z) {
  let h = zonedHeight(x, z);
  for (const r of ROADS) {
    const p = polyDist(x, z, r.pts);
    const inner = r.w / 2 + 1;
    const outer = r.w / 2 + 8;
    if (p.d < outer) h = lerp(h, profileAt(r, p), 1 - smoothstep(inner, outer, p.d));
  }
  const dp = Math.hypot(x - POND.x, z - POND.z);
  if (dp < POND.r + 12) {
    if (pondBase === null) pondBase = zonedHeight(POND.x, POND.z);
    h = lerp(h, pondBase, 1 - smoothstep(POND.r + 3, POND.r + 12, dp));
    h -= 1.15 * (1 - smoothstep(POND.r - 5, POND.r + 2, dp));
  }
  return h;
}

export class Terrain {
  constructor(seg = 200) {
    this.size = WORLD.size;
    this.half = WORLD.half;
    this.seg = seg;
    this.cell = this.size / seg;
    this.n = seg + 1;
    this.heights = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = -this.half + i * this.cell;
        const z = -this.half + j * this.cell;
        this.heights[j * this.n + i] = analyticHeight(x, z);
      }
    }
    const rim = analyticHeight(POND.x + POND.r + 6, POND.z);
    POND.level = Math.min(rim, analyticHeight(POND.x - POND.r - 6, POND.z), analyticHeight(POND.x, POND.z + POND.r + 6)) - 0.45;
  }

  // Exact height of the rendered triangle mesh at (x, z).
  getHeight(x, z) {
    const fx = clamp((x + this.half) / this.cell, 0, this.seg - 1e-4);
    const fz = clamp((z + this.half) / this.cell, 0, this.seg - 1e-4);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const n = this.n;
    const ha = this.heights[j * n + i];
    const hb = this.heights[j * n + i + 1];
    const hc = this.heights[(j + 1) * n + i];
    const hd = this.heights[(j + 1) * n + i + 1];
    if (u + v <= 1) return ha + (hb - ha) * u + (hc - ha) * v;
    return hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
  }

  getSlope(x, z) {
    const e = 1.5;
    const dx = this.getHeight(x + e, z) - this.getHeight(x - e, z);
    const dz = this.getHeight(x, z + e) - this.getHeight(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // Water depth at (x,z): sea or pond. Positive when under water.
  waterDepth(x, z) {
    const h = this.getHeight(x, z);
    let depth = TIDE_UNIFORMS.tdLevel.value - h;
    const dp = Math.hypot(x - POND.x, z - POND.z);
    if (dp < POND.r + 2) depth = Math.max(depth, POND.level - h);
    return depth;
  }

  // Hauteurs du terrain en texture (demi-flottants) : profondeur de l'eau, contact au sol des façades.
  heightTexture() {
    if (this._hTex) return this._hTex;
    const n = this.n;
    const data = new Uint16Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) data[(n - 1 - j) * n + i] = THREE.DataUtils.toHalfFloat(this.heights[j * n + i]);
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this._hTex = tex;
    this.hmParams = new THREE.Vector4(-this.half, -this.half, this.size, this.seg);
    return tex;
  }

  buildMesh(texture, detailTexture, splat) {
    const n = this.n;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        pos[k * 3] = -this.half + i * this.cell;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = -this.half + j * this.cell;
        uv[k * 2] = i / this.seg;
        uv[k * 2 + 1] = 1 - j / this.seg;
      }
    }
    const idx = new Uint32Array(this.seg * this.seg * 6);
    let p = 0;
    for (let j = 0; j < this.seg; j++) {
      for (let i = 0; i < this.seg; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 });
    if (detailTexture && splat) {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.detailMap = { value: detailTexture };
        shader.uniforms.splatMap = { value: splat };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNrm;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWorldNrm = normalize(mat3(modelMatrix) * objectNormal);');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
uniform sampler2D detailMap;
uniform sampler2D splatMap;
varying vec3 vWorldPos;
varying vec3 vWorldNrm;
float stH = 0.0;
float stRough = 0.95;
float stFade = 1.0;
float stPud = 0.0;
// Relief au pixel (bump) à partir des dérivées écran d'une hauteur procédurale.
vec3 stBump( vec3 surfPos, vec3 surfNorm, float h ) {
  vec3 sx = dFdx( surfPos ), sy = dFdy( surfPos );
  vec3 r1 = cross( sy, surfNorm ), r2 = cross( surfNorm, sx );
  float det = dot( sx, r1 );
  vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
  return normalize( abs( det ) * surfNorm - grad );
}`)
          .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec4 sp = texture2D( splatMap, vMapUv );
  float wG = sp.r, wS = sp.g, wA = sp.b, wH = sp.a;
  float ws = wG + wS + wA + wH + 1e-3;
  wG /= ws; wS /= ws; wA /= ws; wH /= ws;
  vec2 p = vWorldPos.xz;
  float dist = length( vViewPosition );
  stFade = 1.0 - smoothstep( 18.0, 140.0, dist );
  // Taille d'un pixel au sol : on retire les détails plus fins que le pixel (pas de scintillement).
  float pxw = length( fwidth( p ) );
  // Dérivées calculées hors des branches : les lectures conditionnelles passent par textureGrad (niveau de mip défini).
  vec2 pdx = dFdx( p ), pdy = dFdy( p );
  float fineW = 1.0 - smoothstep( 0.006, 0.03, pxw );
  float midW = 1.0 - smoothstep( 0.05, 0.3, pxw );
  vec4 dF = texture2D( detailMap, p * 1.31 + 0.17 );
  vec4 dM = texture2D( detailMap, p * 0.29 );
  vec4 dL = texture2D( detailMap, p * 0.047 + 0.31 );
  float macro = texture2D( detailMap, p * 0.0063 + 0.5 ).g;
  // Herbe : touffes, brins, tons jaunes/verts.
  float gH = ( dF.a * 0.18 + dF.r * 0.08 ) * fineW + ( dM.a * 0.45 + dM.r * 0.15 ) * midW;
  vec3 gTint = mix( vec3( 0.82, 0.9, 0.74 ), vec3( 1.12, 1.06, 0.84 ), dL.g ) * mix( 0.84, 1.1, dM.r ) * mix( 0.93, 1.05, dM.a ) * mix( 1.0, mix( 0.96, 1.03, dF.a ), fineW );
  // Terre : mottes et cailloux.
  float sH = ( 1.0 - dF.b ) * 0.5 * fineW + ( ( 1.0 - dM.b ) * 0.5 + dM.r * 0.3 ) * midW;
  vec3 sTint = vec3( mix( 0.76, 1.1, dM.g ) * mix( 1.0, mix( 0.88, 1.06, 1.0 - dM.b ), midW ) );
  // Sable : grain fin, ondulations douces.
  float aH = dF.r * 0.35 * fineW + ( dM.g * 0.4 + dM.r * 0.2 ) * midW;
  vec3 aTint = vec3( mix( 0.93, 1.05, dM.r ) * mix( 0.95, 1.04, dL.r ) * mix( 1.0, mix( 0.95, 1.04, dF.r ), fineW ) );
  // Gravier / pavés : gravillons de près, marbrure de loin (texture lue seulement sur les sols durs).
  vec4 dG = vec4( 0.5 );
  if ( wH > 0.01 ) dG = textureGrad( detailMap, p * 0.62 + 0.41, pdx * 0.62, pdy * 0.62 );
  float stones = smoothstep( 0.42, 0.12, dG.b );
  float hH = ( stones * 0.35 + dF.r * 0.1 ) * fineW + dM.r * 0.25 * midW;
  vec3 hTint = vec3( mix( 0.9, 1.07, dM.g ) * mix( 0.95, 1.04, dL.r ) * mix( 1.0, mix( 0.94, 1.06, stones ) * mix( 0.97, 1.03, dF.r ), fineW ) );
  vec3 tint = wG * gTint + wS * sTint + wA * aTint + wH * hTint;
  stH = ( wG * gH * 0.7 + wS * sH * 1.3 + wA * aH * 0.45 + wH * hH * 0.8 ) * stFade;
  stRough = wG * 0.97 + wS * 1.0 + wA * 0.9 + wH * 0.82;
  // Cultures (blé, colza) : traces du pulvérisateur tous les 24 m, rangs de semis, et vagues du vent
  // qui courent sur les épis ; labours : sillons parallèles.
  float crop = smoothstep( 0.3, 0.45, wS ) * smoothstep( 0.3, 0.42, wG ) * ( 1.0 - smoothstep( 0.03, 0.08, wA + wH ) );
  if ( crop > 0.01 ) {
    float tl = abs( fract( p.y / 24.0 ) - 0.5 ) * 24.0;
    float track = ( 1.0 - smoothstep( 0.16, 0.3, abs( tl - 0.9 ) ) ) * midW;
    float rows = ( 0.5 + 0.5 * sin( p.y * 34.9 ) ) * fineW;
    float wave = textureGrad( detailMap, p * 0.021 + csWind * 50.0, pdx * 0.021, pdy * 0.021 ).g;
    tint *= mix( 1.0, mix( 0.8, 1.14, wave ), crop );
    tint = mix( tint, tint * vec3( 0.6, 0.53, 0.47 ), track * crop );
    stH = mix( stH, ( rows * 0.35 + ( 1.0 - track ) * 0.6 + dF.r * 0.2 * fineW ) * stFade, crop );
  }
  float plow = smoothstep( 0.9, 0.98, wS );
  if ( plow > 0.01 ) {
    // Sillons de 0,42 m : ramenés à leur moyenne dès que la période ne couvre plus assez de pixels (pas de moiré).
    float furW = 1.0 - smoothstep( 0.8, 2.0, fwidth( p.y ) * 14.96 );
    float fur = mix( 0.5, 0.5 + 0.5 * sin( p.y * 14.96 + dM.r * 2.5 ), furW );
    stH = mix( stH, ( fur * 1.1 + sH * 0.35 ) * stFade, plow * midW );
    tint *= mix( 1.0, mix( 0.84, 1.08, fur ), plow * midW );
  }
  // Falaises et talus raides : roche stratifiée (projections latérales selon x et z, fondues l'une dans
  // l'autre vers 45° : pas de couture où le motif, le mip et le relief sauteraient).
  float rock = smoothstep( 0.8, 0.55, vWorldNrm.y );
  if ( rock > 0.0 ) {
    vec2 rw = vWorldNrm.xz * vWorldNrm.xz;
    rw *= rw;
    rw /= rw.x + rw.y + 1e-5;
    vec4 r1 = texture2D( detailMap, vWorldPos.zy * vec2( 0.11, 0.45 ) ) * rw.x + texture2D( detailMap, vWorldPos.xy * vec2( 0.11, 0.45 ) ) * rw.y;
    vec4 r2 = texture2D( detailMap, vWorldPos.zy * 0.6 + 0.2 ) * rw.x + texture2D( detailMap, vWorldPos.xy * 0.6 + 0.2 ) * rw.y;
    float rH = r1.r * 0.6 + r2.b * 0.4;
    tint = mix( tint, vec3( mix( 0.75, 1.15, r1.g ) * mix( 0.85, 1.05, r2.r ) ), rock );
    stH = mix( stH, rH * 1.6, rock );
    stRough = mix( stRough, 0.9, rock );
  }
  // Sable mouillé près de l'eau : plus sombre et plus brillant.
  // Estran : sable mouillé du bord de l'eau jusqu'au niveau atteint par la dernière pleine mer (il sèche en
  // remontant), laisse de mer (algues, débris) à la plus haute mer du jour.
  float above = vWorldPos.y - tdLevel;
  float band = max( tdWet - tdLevel, 0.05 );
  float wet = wA * max( 1.0 - smoothstep( 0.03, 0.3, above ), ( 1.0 - smoothstep( band - 0.05, band + 0.04, above ) ) * mix( 0.8, 0.35, clamp( above / band, 0.0, 1.0 ) ) );
  float wrack = wA * ( 1.0 - smoothstep( 0.0, 0.06, abs( vWorldPos.y - tdMark - 0.03 ) ) ) * smoothstep( 0.42, 0.7, dM.g * 0.7 + dF.r * 0.3 + dL.r * 0.2 ) * stFade;
  tint = mix( tint, vec3( 0.36, 0.31, 0.2 ), wrack * 0.9 );
  stH += wrack * 0.9;
  tint *= 1.0 - wet * 0.25;
  stRough = mix( stRough, 0.35, wet );
  diffuseColor.rgb *= mix( vec3( 1.0 ), tint, 0.35 + 0.65 * stFade ) * ( 0.92 + 0.16 * macro );
  // Pluie : sols assombris et plus brillants, flaques dans la terre et les cours.
  // (les flaques aplanissent la normale plutôt que la hauteur : pas de liseré sombre au bord).
  float wetK = csWet * ( 1.0 - rock * 0.3 );
  stPud = smoothstep( 0.76, 0.81, dL.b + dM.r * 0.12 ) * ( wS + wH ) * ( 1.0 - rock ) * smoothstep( 0.3, 0.9, csWet ) * stFade;
  diffuseColor.rgb *= ( 1.0 - wetK * 0.35 ) * ( 1.0 - stPud * 0.4 );
  stRough = mix( stRough, 0.5, wetK * ( 0.3 + 0.5 * ( 1.0 - wG ) ) );
  stRough = mix( stRough, 0.05, stPud );
}`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = stRough;')
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( mix( stBump( -vViewPosition, normal, stH * 0.09 ), normal, stPud ) );');
        addCloudShadows(shader, 'vWorldPos');
        Object.assign(shader.uniforms, TIDE_UNIFORMS);
        shader.fragmentShader = shader.fragmentShader.replace('uniform sampler2D splatMap;', 'uniform sampler2D splatMap;\nuniform float tdLevel;\nuniform float tdWet;\nuniform float tdMark;');
      };
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = -2;
    mesh.name = 'terrain';
    return mesh;
  }
}
