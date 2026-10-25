// Mer de la Manche (vagues, écume sur le rivage, reflets) et mare de la forêt.
import * as THREE from 'three';
import { POND } from './layout.js';
import { TIDE_UNIFORMS } from './weather.js';
import { CLOUD_UNIFORMS, CLOUD_SHADOW_GLSL } from './sky.js';

const vert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${CLOUD_SHADOW_GLSL}
uniform float time;
varying vec3 vWorld;
varying float vCs;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  // Houle de la Manche : quelques trains d'ondes longues, amplitude modérée.
  float d = distance(w.xz, cameraPosition.xz);
  float k = 1.0 - smoothstep(120.0, 600.0, d);
  w.y += (sin(dot(w.xz, vec2(0.011, 0.046)) + time * 0.9) * 0.16 + sin(dot(w.xz, vec2(-0.037, 0.021)) + time * 1.27) * 0.09 + sin(dot(w.xz, vec2(0.09, 0.07)) + time * 1.9) * 0.04) * k;
  vWorld = w.xyz;
  // Ombre des nuages (par sommet : les nuages sont bien plus grands que les mailles de la mer).
  vCs = csCloudShadow(w.xyz);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D heightMap;
uniform sampler2D waveNormals;
uniform vec4 hm; // origin.x, origin.z, size, segments
uniform float time;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 horizonColor;
uniform vec3 zenithColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunIntensity;
uniform float night;
varying vec3 vWorld;
varying float vCs;
vec3 waveN(vec2 uv) { return texture2D(waveNormals, uv).xyz * 2.0 - 1.0; }
void main() {
  // Soleil direct (reflets, éclairage du corps de l'eau et de l'écume) atténué sous les nuages.
  float sunI = sunIntensity * vCs;
  vec2 g = (vWorld.xz - hm.xy) / hm.z;
  vec2 uv = (g * hm.w + 0.5) / (hm.w + 1.0);
  float ground = texture2D(heightMap, vec2(uv.x, 1.0 - uv.y)).r;
  if (g.x < 0.0 || g.x > 1.0 || g.y < 0.0 || g.y > 1.0) ground = -16.0;
  float depth = max(vWorld.y - ground, 0.0);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  // Normales : trois couches de vaguelettes qui défilent, atténuées au loin (pas de scintillement).
  vec2 q = vWorld.xz;
  vec3 n1 = waveN(q * 0.031 + vec2(time * 0.011, time * 0.017));
  vec3 n2 = waveN(q * 0.083 + vec2(-time * 0.023, time * 0.013));
  vec3 n3 = waveN(q * 0.21 + vec2(time * 0.031, -time * 0.027));
  float near = 1.0 - smoothstep(30.0, 260.0, dist);
  vec2 slope = n1.xy * 0.55 + n2.xy * 0.35 * (0.4 + 0.6 * near) + n3.xy * 0.25 * near;
  vec3 N = normalize(vec3(slope.x * 0.35, 1.0, slope.y * 0.35));
  float NdV = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  // Reflet du ciel (horizon → zénith) et du soleil.
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(horizonColor, zenithColor, pow(clamp(R.y, 0.0, 1.0), 0.45));
  vec3 H = normalize(V + sunDir);
  float spec = pow(max(dot(N, H), 0.0), 700.0) * 60.0 + pow(max(dot(N, H), 0.0), 90.0) * 1.6;
  // Corps de l'eau : diffusion (vert-bleu en profondeur, sable visible au bord).
  vec3 body = mix(shallowColor, deepColor, smoothstep(0.3, 9.0, depth));
  vec3 lit = body * (sunI * max(sunDir.y, 0.0) + zenithColor * 2.2) * 0.3;
  vec3 col = mix(lit, sky, fres) + sunColor * sunI * spec * (1.0 - night) * 0.05;
  // Rouleaux et écume : lignes qui avancent vers la plage, déchirées par le bruit.
  vec3 fn = waveN(q * 0.12 + vec2(time * 0.02, 0.0));
  float band = 1.0 - smoothstep(0.0, 1.4, depth);
  float lines = smoothstep(0.55, 0.95, sin(depth * 6.5 - time * 1.6 + fn.x * 2.5) * 0.5 + 0.5);
  float edge = 1.0 - smoothstep(0.0, 0.18, depth);
  float foam = clamp((lines * band * 0.8 + edge) * (0.55 + 0.45 * fn.y), 0.0, 1.0);
  vec3 foamCol = vec3(0.8) * (sunI * max(sunDir.y, 0.05) * 0.35 + zenithColor * 1.5);
  col = mix(col, foamCol, foam * 0.85);
  float alpha = mix(0.35, 0.97, smoothstep(0.0, 2.5, depth));
  alpha = max(alpha, max(foam * 0.9, fres));
  alpha *= smoothstep(0.0, 0.05, depth);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Normales de vaguelettes (répétables) calculées à partir d'un champ de hauteur fractal.
function waveNormalMap(size = 256) {
  const h = new Float32Array(size * size);
  let s = 77;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const [cells, amp] of [[4, 1], [8, 0.55], [16, 0.3], [32, 0.16]]) {
    const gr = new Float32Array(cells * cells).map(() => rnd());
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const fx = (i / size) * cells, fy = (j / size) * cells;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const at = (x, y) => gr[(y % cells) * cells + (x % cells)];
        const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        h[j * size + i] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
      }
    }
  }
  const data = new Uint8Array(size * size * 4);
  const k = 6;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = h[j * size + ((i + 1) % size)] - h[j * size + ((i - 1 + size) % size)];
      const dz = h[((j + 1) % size) * size + i] - h[((j - 1 + size) % size) * size + i];
      const nx = -dx * k, nz = -dz * k, ny = 1;
      const l = Math.hypot(nx, ny, nz);
      const o = (j * size + i) * 4;
      data[o] = ((nx / l) * 0.5 + 0.5) * 255;
      data[o + 1] = ((nz / l) * 0.5 + 0.5) * 255;
      data[o + 2] = ((ny / l) * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Water {
  constructor(scene, terrain) {
    // Carte des hauteurs (demi-flottants, filtrage linéaire) pour la profondeur.
    const tex = terrain.heightTexture();
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        heightMap: { value: null },
        hm: { value: new THREE.Vector4(-terrain.half, -terrain.half, terrain.size, terrain.seg) },
        time: { value: 0 },
        waveNormals: { value: null },
        deepColor: { value: new THREE.Color('#0d2a2e') },
        shallowColor: { value: new THREE.Color('#3f6a5c') },
        horizonColor: { value: new THREE.Color() },
        zenithColor: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color('#ffffff') },
        sunIntensity: { value: 1 },
        night: { value: 0 },
      },
    ]);
    this.uniforms.heightMap.value = tex;
    Object.assign(this.uniforms, CLOUD_UNIFORMS);
    this.uniforms.waveNormals.value = waveNormalMap(256);
    const geo = new THREE.PlaneGeometry(4200, 2400, 120, 60);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -1520);
    this.sea = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, transparent: true, fog: true, depthWrite: false })
    );
    this.sea.renderOrder = 1;
    scene.add(this.sea);

    const pg = new THREE.CircleGeometry(POND.r + 1.5, 28);
    pg.rotateX(-Math.PI / 2);
    this.pond = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: '#1d2a22', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.9 }));
    this.pond.position.set(POND.x, POND.level, POND.z);
    this.pond.renderOrder = 1;
    scene.add(this.pond);
  }

  update(t, sky) {
    const U = this.uniforms;
    U.time.value = t;
    // La mer monte et descend avec la marée.
    this.sea.position.y = TIDE_UNIFORMS.tdLevel.value;
    U.horizonColor.value.copy(sky.uniforms.horizonColor.value);
    U.zenithColor.value.copy(sky.uniforms.ambientSky.value);
    U.sunDir.value.copy(sky.sunDir);
    U.sunColor.value.copy(sky.sun.color);
    U.sunIntensity.value = sky.elevation > 0 ? sky.sun.intensity : 0;
    U.night.value = sky.nightFactor;
  }
}
