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
`;
const VERT_MAIN = /* glsl */ `
{
  int zi = int(zone + 0.5);
  vec4 zs = uZoneSlot[zi / 4];
  int si = int(zs[zi - (zi / 4) * 4] + 0.5);
  vAlbedo = uAlbedo[si];
  vPbr = uPbr[si];
  vAo = ao;
}
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vAlbedo;
varying vec4 vPbr;
varying float vAo;
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
    .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = vAlbedo;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = vPbr.x;')
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
    float occ = vAo;
    reflectedLight.indirectDiffuse *= occ;
    reflectedLight.indirectSpecular *= occ * occ;
    reflectedLight.directDiffuse *= mix(1.0, occ, 0.3);
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

const PROGRAM_KEY = 'strides-human-v1';

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
