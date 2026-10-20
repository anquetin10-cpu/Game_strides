// Ciel en dégradé, soleil/lune, nuages et cycle jour/nuit.
import * as THREE from 'three';
import { clamp, lerp, mulberry32, smoothstep } from '../core/math.js';
import { prep, ico, paint } from './shapes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float night;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizonColor, topColor, pow(smoothstep(-0.02, 0.55, h), 0.65));
  col = mix(col, groundColor, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(sd, 900.0) * 4.0 + pow(sd, 18.0) * 0.22 + pow(sd, 4.0) * 0.08);
  if (night > 0.0 && h > 0.0) {
    vec3 sp = floor(d * 260.0);
    float s = hash(sp);
    col += vec3(step(0.9965, s) * night * (0.6 + 0.4 * hash(sp + 3.0)));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// Images clés selon la hauteur du soleil (sin de l'élévation).
const KEYS = [
  { e: -0.35, top: '#08122a', hor: '#1c2b4d', sun: '#9fb4ff', sunI: 0.42, hemiSky: '#5a6f9e', hemiGround: '#1f2a24', hemiI: 0.62, fog: '#1c2b4d' },
  { e: -0.06, top: '#1d2f5c', hor: '#5b5f86', sun: '#a9b8ff', sunI: 0.35, hemiSky: '#7a86b0', hemiGround: '#2c3326', hemiI: 0.75, fog: '#4d557a' },
  { e: 0.06, top: '#5a7fc0', hor: '#f2b27c', sun: '#ffb26a', sunI: 1.6, hemiSky: '#f0c9a6', hemiGround: '#4f5a35', hemiI: 0.95, fog: '#e7b48c' },
  { e: 0.25, top: '#4f8ed8', hor: '#cfe2ee', sun: '#fff1d8', sunI: 2.5, hemiSky: '#d6e8ff', hemiGround: '#5f6e41', hemiI: 1.15, fog: '#c8dceb' },
  { e: 0.8, top: '#3f84d6', hor: '#c6def0', sun: '#ffffff', sunI: 2.8, hemiSky: '#dcecff', hemiGround: '#677646', hemiI: 1.25, fog: '#c3d9ea' },
];
const _ca = new THREE.Color();
const _cb = new THREE.Color();

function sample(e) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (e >= KEYS[i].e && e <= KEYS[i + 1].e) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  if (e < KEYS[0].e) b = a;
  if (e > KEYS[KEYS.length - 1].e) a = b;
  const t = a === b ? 0 : smoothstep(a.e, b.e, e);
  const col = (k) => _ca.set(a[k]).lerp(_cb.set(b[k]), t).clone();
  return {
    top: col('top'), hor: col('hor'), sun: col('sun'), hemiSky: col('hemiSky'), hemiGround: col('hemiGround'), fog: col('fog'),
    sunI: lerp(a.sunI, b.sunI, t), hemiI: lerp(a.hemiI, b.hemiI, t),
  };
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      groundColor: { value: new THREE.Color('#9fb7c4') },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      night: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(1000, 32, 16);
    this.dome = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false })
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight('#dcecff', '#677646', 1.2);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -60; s.right = 60; s.top = 60; s.bottom = -60; s.near = 1; s.far = 400;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog('#c3d9ea', 220, 900);

    this.clouds = this._makeClouds();
    scene.add(this.clouds);
    this.sunDir = new THREE.Vector3();
    this.elevation = 1;
    this.nightFactor = 0;
  }

  setShadowSize(size, extent = 60) {
    this.sun.shadow.mapSize.set(size, size);
    const s = this.sun.shadow.camera;
    s.left = -extent; s.right = extent; s.top = extent; s.bottom = -extent;
    s.updateProjectionMatrix();
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  _makeClouds() {
    const rnd = mulberry32(31);
    const geos = [];
    for (let i = 0; i < 26; i++) {
      const cx = (rnd() - 0.5) * 2200;
      const cz = (rnd() - 0.5) * 2200;
      const cy = 170 + rnd() * 90;
      const n = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const r = 14 + rnd() * 18;
        const g = ico(r, 1);
        g.scale(1.4, 0.55, 1);
        g.translate(cx + (k - n / 2) * r * 1.1 + rnd() * 8, cy + rnd() * 6, cz + (rnd() - 0.5) * 22);
        paint(g, '#ffffff');
        geos.push(g);
      }
    }
    const merged = mergeGeometries(geos.map(prep), false);
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#9aa7b8', emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }));
    mesh.frustumCulled = false;
    return mesh;
  }

  // hour : 0..24 ; focus : position suivie par l'ombre portée.
  update(hour, focus, dt) {
    const dayFrac = (hour - 6.5) / 14;
    let dir;
    if (dayFrac >= 0 && dayFrac <= 1) {
      const th = dayFrac * Math.PI;
      dir = this.sunDir.set(Math.cos(th), Math.sin(th) * 0.95, 0.42).normalize();
    } else {
      // Lune : arc opposé, plus bas.
      let nf = dayFrac > 1 ? (hour - 20.5) / 10 : (hour + 3.5) / 10;
      nf = clamp(nf, 0, 1);
      const th = nf * Math.PI;
      dir = this.sunDir.set(Math.cos(th), Math.sin(th) * 0.7 + 0.05, -0.3).normalize();
    }
    const sunAlt = dayFrac >= 0 && dayFrac <= 1 ? Math.sin(dayFrac * Math.PI) : -Math.min(Math.abs(dayFrac < 0 ? dayFrac : dayFrac - 1) * 3, 0.35);
    this.elevation = sunAlt;
    const k = sample(sunAlt);
    this.nightFactor = smoothstep(0.02, -0.25, sunAlt);
    this.uniforms.topColor.value.copy(k.top);
    this.uniforms.horizonColor.value.copy(k.hor);
    this.uniforms.groundColor.value.copy(k.hor).multiplyScalar(0.85);
    this.uniforms.sunColor.value.copy(k.sun).multiplyScalar(sunAlt > 0 ? 1 : 0.25);
    this.uniforms.sunDir.value.copy(dir);
    this.uniforms.night.value = this.nightFactor;
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemiI;
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    this.scene.fog.color.copy(k.fog);
    this.clouds.material.emissive.copy(k.hor).multiplyScalar(0.5);
    this.clouds.material.color.set(sunAlt > 0 ? '#ffffff' : '#8a93ad');
    // Ombres centrées sur le joueur, alignées sur les texels pour éviter le scintillement.
    const snap = 0.5;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx + dir.x * 150, focus.y + dir.y * 150, fz + dir.z * 150);
    this.sun.target.position.set(fx, focus.y, fz);
    this.clouds.position.x = (this.clouds.position.x + dt * 2.2) % 400;
  }

  follow(camera) {
    this.dome.position.copy(camera.position);
  }
}
