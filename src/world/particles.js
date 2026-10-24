// Particules légères (poussière sous les sabots, éclaboussures, herbe soulevée).
import * as THREE from 'three';

const vert = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying float vAlpha;
varying vec3 vColor;
uniform float scale;
void main() {
  vAlpha = alpha;
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float light;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  // Bord irrégulier (nuage de poussière plutôt que disque net).
  float n = fract(sin(dot(floor(gl_PointCoord * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
  float a = vAlpha * smoothstep(0.5, 0.1, d + (n - 0.5) * 0.12);
  // Éclairée par la scène (le jour, au crépuscule, la nuit).
  gl_FragColor = vec4(vColor * light, a);
  #include <colorspace_fragment>
}`;

const TYPES = {
  dust: { color: new THREE.Color('#e3d6b8'), size: [1.0, 1.8], life: [0.7, 1.2], up: [0.6, 1.6], spread: 1.1, grow: 2.0, alpha: 0.5, grav: -0.3 },
  sand: { color: new THREE.Color('#f6eedb'), size: [0.9, 1.6], life: [0.5, 0.9], up: [1.0, 2.4], spread: 1.5, grow: 1.6, alpha: 0.62, grav: 3 },
  grass: { color: new THREE.Color('#8db063'), size: [0.25, 0.45], life: [0.4, 0.7], up: [1.5, 3], spread: 1.6, grow: 0.2, alpha: 0.9, grav: 7 },
  splash: { color: new THREE.Color('#f3f7f6'), size: [0.5, 1.0], life: [0.4, 0.8], up: [2.5, 4.5], spread: 1.8, grow: 0.8, alpha: 0.85, grav: 9.8 },
};

export class Particles {
  constructor(scene, max = 420) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.type = new Array(max).fill(null);
    this.base = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { scale: { value: 400 }, light: { value: 1 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    this.active = 0;
  }

  setViewport(height) {
    this.uniforms.scale.value = height * 0.9;
  }

  emit(kind, x, y, z, n = 4, vx = 0, vz = 0) {
    const T = TYPES[kind];
    if (!T) return;
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const r = Math.random;
      this.pos[i * 3] = x + (r() - 0.5) * 0.6;
      this.pos[i * 3 + 1] = y + 0.1;
      this.pos[i * 3 + 2] = z + (r() - 0.5) * 0.6;
      this.vel[i * 3] = vx * 0.25 + (r() - 0.5) * T.spread;
      this.vel[i * 3 + 1] = T.up[0] + r() * (T.up[1] - T.up[0]);
      this.vel[i * 3 + 2] = vz * 0.25 + (r() - 0.5) * T.spread;
      this.base[i] = T.size[0] + r() * (T.size[1] - T.size[0]);
      this.life[i] = T.life[0] + r() * (T.life[1] - T.life[0]);
      this.age[i] = 0;
      this.type[i] = T;
      const shade = 0.9 + r() * 0.2;
      this.color[i * 3] = T.color.r * shade;
      this.color[i * 3 + 1] = T.color.g * shade;
      this.color[i * 3 + 2] = T.color.b * shade;
    }
  }

  update(dt, light = 1) {
    this.uniforms.light.value = light;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const T = this.type[i];
      if (!T) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.type[i] = null;
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      any = true;
      this.vel[i * 3 + 1] -= T.grav * dt;
      this.vel[i * 3] *= 1 - 1.5 * dt;
      this.vel[i * 3 + 2] *= 1 - 1.5 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.base[i] * (1 + T.grow * t);
      this.alpha[i] = T.alpha * (1 - t) * Math.min(1, t * 8);
    }
    if (any || this.wasActive) {
      const a = this.points.geometry.attributes;
      a.position.needsUpdate = true;
      a.size.needsUpdate = true;
      a.alpha.needsUpdate = true;
      a.color.needsUpdate = true;
    }
    this.wasActive = any;
  }
}
