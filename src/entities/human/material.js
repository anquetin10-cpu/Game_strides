// Matière PBR des personnages : un seul matériau (un appel de dessin) par personne. Chaque sommet porte une zone ;
// la tenue associe zone → emplacement (couleur linéaire, rugosité, sheen tissu, vernis cuir/yeux). Occlusion par sommet.
import * as THREE from 'three';
import { ZONE_COUNT, SLOT_COUNT } from './zones.js';
import { addCloudShadows } from '../../world/sky.js';

const ZV = Math.ceil(ZONE_COUNT / 4);

const VERT_PARS = /* glsl */ `
attribute float zone;
attribute float ao;
uniform vec4 uZoneSlot[${ZV}];
uniform vec3 uAlbedo[${SLOT_COUNT}];
uniform vec4 uPbr[${SLOT_COUNT}];
varying vec3 vAlbedo;
varying vec4 vPbr;
varying float vAo;
varying vec3 vObj;
varying vec3 vObjN;
varying float vSlot;
`;
const VERT_MAIN = /* glsl */ `
{
  int zi = int(zone + 0.5);
  vec4 zs = uZoneSlot[zi / 4];
  int si = int(zs[zi - (zi / 4) * 4] + 0.5);
  vAlbedo = uAlbedo[si];
  vPbr = uPbr[si];
  vAo = ao;
  // Position et normale de liaison (repère du personnage, mètres) : les motifs restent collés au corps qui bouge.
  vObj = position;
  vObjN = normal;
  vSlot = float(si);
}
`;
// Détail de surface procédural (sans texture), d'après les méthodes des skills tiers blender-texturing et
// blender-pbr-materials (EL4CTEO/blender-skills) et materials / realistic-style (arjun988/blender-skills), transposées
// dans le shader : rugosité jamais uniforme (variation ±15 %), micro-relief et plis légers des tissus, poussière qui se
// dépose sur le haut des bottes, saleté discrète dans les creux (occlusion), peau plus chaude dans les creux et légèrement
// marbrée (approximation de la diffusion sous la surface : couleur de diffusion plus chaude que la couleur de base).
// Bruit en coordonnées objet ; motifs fins atténués quand ils deviennent plus petits qu'un pixel (pas de scintillement).
const FRAG_PARS = /* glsl */ `
varying vec3 vAlbedo;
varying vec4 vPbr;
varying float vAo;
varying vec3 vObj;
varying vec3 vObjN;
varying float vSlot;
float hHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hHash(i), hHash(i + vec3(1, 0, 0)), f.x), mix(hHash(i + vec3(0, 1, 0)), hHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hHash(i + vec3(0, 0, 1)), hHash(i + vec3(1, 0, 1)), f.x), mix(hHash(i + vec3(0, 1, 1)), hHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Relief par dérivées écran (bosselage sans tangentes ni UV).
vec3 hBump(vec3 pos, vec3 n, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}
`;

function patch(shader, mat) {
  const u = mat.userData.uniforms;
  shader.uniforms.uZoneSlot = u.uZoneSlot;
  shader.uniforms.uAlbedo = u.uAlbedo;
  shader.uniforms.uPbr = u.uPbr;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = vAlbedo;
  float hSkin = step(vSlot, 1.5);                       // peau, lèvres
  float hCloth = step(0.05, vPbr.y) * (1.0 - hSkin);    // tissus (sheen)
  float hGloss = step(0.05, vPbr.z) * (1.0 - hSkin);    // cuir ciré, vernis
  float hN1 = hNoise(vObj * 38.0), hN2 = hNoise(vObj * 9.0 + 3.1);
  // Peau : légère marbrure (rougeurs, irrégularités) ; tissus : teinte non uniforme (usure, plis).
  diffuseColor.rgb *= 1.0 + hSkin * ((hN1 - 0.5) * 0.06 + (hN2 - 0.5) * vec3(0.05, -0.01, -0.03)) + hCloth * (hN2 - 0.5) * 0.08;
  // Saleté dans les creux (occlusion faible × bruit), vêtements et cuir seulement.
  diffuseColor.rgb *= 1.0 - (1.0 - hSkin) * (1.0 - vAo) * smoothstep(0.35, 0.75, hN2) * 0.12;
  // Poussière (sable) déposée sur le dessus du bas des jambes et des pieds.
  float hDust = (1.0 - hSkin) * smoothstep(0.32, 0.0, vObj.y) * smoothstep(0.1, 0.8, vObjN.y + 0.3) * smoothstep(0.3, 0.8, hNoise(vObj * 24.0 + 7.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.36, 0.27), hDust * 0.45);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  // Rugosité jamais uniforme (±15 %), plus mate là où la poussière s'est déposée.
  roughnessFactor = clamp(vPbr.x * (1.0 + (hN1 - 0.5) * 0.18 + (hN2 - 0.5) * 0.14) + hDust * 0.3, 0.04, 1.0);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // Micro-relief : trame du tissu (2,5 mm), pores de la peau (très faibles), plis doux des vêtements (4 cm) ; motifs fins
    // atténués quand ils deviennent plus petits qu'un pixel.
    float px = length(fwidth(vObj));
    float weave = (sin(vObj.x * 2500.0 + vObj.y * 900.0) * sin(vObj.y * 2500.0 - vObj.z * 900.0)) * 0.00012 * (1.0 - smoothstep(0.0008, 0.0025, px));
    float folds = (hNoise(vObj * vec3(14.0, 6.0, 14.0)) - 0.5) * 0.004;
    float pores = (hNoise(vObj * 900.0) - 0.5) * 0.00006 * (1.0 - smoothstep(0.0003, 0.0012, px));
    float h = hCloth * (weave + folds) + hSkin * pores + hGloss * folds * 0.35;
    normal = hBump(-vViewPosition, normal, h);
  }`)
    .replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
#ifdef USE_SHEEN
  material.sheenColor = vPbr.y * mix(vec3(1.0), vAlbedo / max(max(vAlbedo.r, max(vAlbedo.g, vAlbedo.b)), 0.04), 0.65);
  material.sheenRoughness = 0.55;
#endif
#ifdef USE_CLEARCOAT
  material.clearcoat = vPbr.z;
  material.clearcoatRoughness = max(vPbr.w, 0.04) + geometryRoughness;
#endif`,
    )
    .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
  {
    // Vêtements : occlusion bakée adoucie (elle salissait la culotte claire à l'entrejambe et derrière les genoux).
    float occ = mix(vAo, mix(1.0, vAo, 0.6), step(1.5, vSlot));
    // Peau : l'ombre des creux reste chaude (la lumière diffuse sous la peau ressort rougie), au lieu d'un gris neutre.
    vec3 occC = mix(vec3(occ), pow(vec3(occ), vec3(0.55, 1.0, 1.25)), step(vSlot, 1.5));
    reflectedLight.indirectDiffuse *= occC;
    reflectedLight.indirectSpecular *= occ * occ;
    reflectedLight.directDiffuse *= mix(vec3(1.0), occC, 0.3);
    // Peau : lumière directe très légèrement réchauffée (diffusion sous la surface).
    reflectedLight.directDiffuse *= mix(vec3(1.0), vec3(1.04, 0.97, 0.93), step(vSlot, 1.5));
    reflectedLight.directSpecular *= mix(1.0, occ, 0.5);
#ifdef USE_SHEEN
    sheenSpecularIndirect *= occ;
#endif
#ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= occ * occ;
#endif
  }`,
    );
  addCloudShadows(shader, null, true);
}

const PROGRAM_KEY = 'strides-human-v2';

// physical : sheen + vernis (proche) ; sinon matériau standard moins coûteux (lointain).
export function createHumanMaterial(physical = true, uniforms = null) {
  const opts = { roughness: 0.6, metalness: 0 };
  const mat = physical ? new THREE.MeshPhysicalMaterial({ ...opts, sheen: 1, sheenRoughness: 0.55, sheenColor: 0xffffff, clearcoat: 1, clearcoatRoughness: 0.2 }) : new THREE.MeshStandardMaterial(opts);
  mat.userData.uniforms = uniforms || {
    uZoneSlot: { value: Array.from({ length: ZV }, () => new THREE.Vector4()) },
    uAlbedo: { value: Array.from({ length: SLOT_COUNT }, () => new THREE.Color(0.5, 0.5, 0.5)) },
    uPbr: { value: Array.from({ length: SLOT_COUNT }, () => new THREE.Vector4(0.6, 0, 0, 0.2)) },
  };
  mat.onBeforeCompile = (shader) => patch(shader, mat);
  mat.customProgramCacheKey = () => PROGRAM_KEY + (physical ? 'p' : 's');
  return mat;
}

// Applique une palette résolue : zoneSlot (tableau zone → emplacement), slots [{ color: Color linéaire, pbr: [r, sheen, coat, coatR] }].
export function applyPalette(mat, zoneSlot, slots) {
  const u = mat.userData.uniforms;
  for (let i = 0; i < ZV; i++) {
    const v = u.uZoneSlot.value[i];
    v.set(zoneSlot[i * 4] || 0, zoneSlot[i * 4 + 1] || 0, zoneSlot[i * 4 + 2] || 0, zoneSlot[i * 4 + 3] || 0);
  }
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = slots[i];
    if (!s) continue;
    u.uAlbedo.value[i].copy(s.color);
    u.uPbr.value[i].set(s.pbr[0], s.pbr[1], s.pbr[2], s.pbr[3]);
  }
}
