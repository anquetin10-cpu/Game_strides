// Mer de la Manche (vagues, écume sur le rivage, reflets) et mare de la forêt.
import * as THREE from 'three';
import { DataUtils } from 'three';
import { POND } from './layout.js';

const vert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float time;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float wave = sin(w.x * 0.045 + time * 0.8) * 0.14 + sin(w.z * 0.07 + time * 1.15) * 0.11 + sin((w.x + w.z) * 0.12 + time * 1.6) * 0.05;
  w.y += wave;
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D heightMap;
uniform vec4 hm; // origin.x, origin.z, size, segments
uniform float time;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 skyColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float light;
varying vec3 vWorld;
void main() {
  vec2 g = (vWorld.xz - hm.xy) / hm.z;
  vec2 uv = (g * hm.w + 0.5) / (hm.w + 1.0);
  float ground = texture2D(heightMap, vec2(uv.x, 1.0 - uv.y)).r;
  if (g.x < 0.0 || g.x > 1.0 || g.y < 0.0 || g.y > 1.0) ground = -16.0;
  float depth = max(vWorld.y - ground, 0.0);
  vec3 col = mix(shallowColor, deepColor, smoothstep(0.2, 7.0, depth));
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float detail = 1.0 - smoothstep(40.0, 220.0, dist);
  vec2 q = vWorld.xz;
  vec3 N = normalize(vec3(
    (sin(q.x * 0.21 + q.y * 0.07 + time * 1.3) * 0.05 + sin(q.y * 0.53 - q.x * 0.19 + time * 2.1) * 0.03) * detail,
    1.0,
    (cos(q.y * 0.27 - q.x * 0.11 + time * 1.1) * 0.05 + cos(q.x * 0.61 + q.y * 0.23 - time * 1.7) * 0.03) * detail));
  float fres = pow(1.0 - max(dot(V, N), 0.0), 4.0);
  col = mix(col * light, skyColor, clamp(fres * 0.8 + 0.08, 0.0, 0.85));
  vec3 H = normalize(V + sunDir);
  float spec = pow(max(dot(N, H), 0.0), 220.0) * 2.2;
  col += sunColor * spec;
  float band = 1.0 - smoothstep(0.0, 0.55, depth);
  float ripple = 0.5 + 0.5 * sin(time * 1.8 - depth * 9.0 + sin(vWorld.x * 0.15) * 2.0);
  float foam = band * (0.55 + 0.45 * ripple);
  col = mix(col, vec3(0.97, 0.98, 0.96) * max(light, 0.35), clamp(foam, 0.0, 1.0) * 0.85);
  float alpha = mix(0.45, 0.94, smoothstep(0.0, 3.5, depth));
  alpha = max(alpha, foam * 0.92);
  alpha *= smoothstep(0.0, 0.04, depth);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  constructor(scene, terrain) {
    // Carte des hauteurs (demi-flottants, filtrage linéaire) pour la profondeur.
    const n = terrain.n;
    const data = new Uint16Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        // Ligne 0 de la texture = z max (on retourne l'axe dans le shader).
        data[(n - 1 - j) * n + i] = DataUtils.toHalfFloat(terrain.heights[j * n + i]);
      }
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        heightMap: { value: null },
        hm: { value: new THREE.Vector4(-terrain.half, -terrain.half, terrain.size, terrain.seg) },
        time: { value: 0 },
        deepColor: { value: new THREE.Color('#1f5f72') },
        shallowColor: { value: new THREE.Color('#5fb1ad') },
        skyColor: { value: new THREE.Color('#c6def0') },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color('#ffffff') },
        light: { value: 1 },
      },
    ]);
    this.uniforms.heightMap.value = tex;
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
    this.pond = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: '#3f7d78', transparent: true, opacity: 0.82 }));
    this.pond.position.set(POND.x, POND.level, POND.z);
    this.pond.renderOrder = 1;
    scene.add(this.pond);
  }

  update(t, sky) {
    this.uniforms.time.value = t;
    this.uniforms.skyColor.value.copy(sky.uniforms.horizonColor.value);
    this.uniforms.sunDir.value.copy(sky.sunDir);
    this.uniforms.sunColor.value.copy(sky.sun.color).multiplyScalar(sky.elevation > 0 ? 1 : 0.3);
    this.uniforms.light.value = 0.35 + 0.65 * (1 - sky.nightFactor);
  }
}
